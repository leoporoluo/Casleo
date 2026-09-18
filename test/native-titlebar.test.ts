import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..')

/**
 * The Windows titlebar went back to the OS: a standard native caption band
 * above the page, with Harness's own session header rendering below it, the
 * way upstream expects. Every self-drawn chrome mechanism (WCO overlay,
 * drag-region strips, whole-tree MutationObservers, the custom menu view and
 * its CSS repositioning) is retired, because dragging Harness clusters into
 * the caption area was the recurring source of interaction bugs.
 */
describe('native Windows titlebar', () => {
  it('draws a standard native titlebar and keeps the menu behind Alt', async () => {
    const main = await readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8')
    const viteConfig = await readFile(path.join(projectRoot, 'electron.vite.config.ts'), 'utf8')

    expect(main).toContain("frame: process.platform !== 'darwin'")
    expect(main).toContain('...(isWindows ? { autoHideMenuBar: true } : {})')
    expect(main).not.toContain('titleBarOverlay')
    expect(main).not.toContain("title: ''")
    expect(main).toContain("title: 'Casleo'")
    // document.title flows into the native caption band.
    expect(main).not.toContain("window.setTitle('')")
    expect(main).not.toContain('setMenuBarVisibility(false)')
    expect(main).toContain('Menu.setApplicationMenu(Menu.buildFromTemplate(template))')
    expect(viteConfig).not.toContain('windows-menu')
  })

  it('removed the self-drawn menu view and its preload', async () => {
    for (const retired of [
      path.join(projectRoot, 'src', 'main', 'windows-menu-view.ts'),
      path.join(projectRoot, 'src', 'preload', 'windows-menu.ts'),
      path.join(projectRoot, 'src', 'preload', 'windows-titlebar.ts'),
      path.join(projectRoot, 'src', 'shared', 'desktop-menu.ts')
    ]) {
      expect(existsSync(retired), retired).toBe(false)
    }
  })

  it('retires the titlebar CSS from the vendor patches', async () => {
    const [sidebar, sidebarRight, conversation] = await Promise.all([
      readFile(
        path.join(projectRoot, 'patches', '@deepseek-ai+dsh-client-ui-sidebar+0.1.5-rc.2.patch'),
        'utf8'
      ),
      readFile(
        path.join(projectRoot, 'patches', '@deepseek-ai+dsh-client-ui-sidebar-right+0.1.5-rc.2.patch'),
        'utf8'
      ),
      readFile(
        path.join(projectRoot, 'patches', '@deepseek-ai+dsh-client-ui-conversation+0.1.5-rc.2.patch'),
        'utf8'
      )
    ])

    expect(sidebar).not.toContain('padding-top:32px')
    expect(sidebar).toContain('[data-dsh-sidebar-brand-identity]{flex:1;min-width:0}')
    expect(conversation).not.toContain('--dsh-titlebar-safe-inset-top')
    expect(sidebarRight).not.toContain('--dsh-titlebar-safe-inset-top')
    expect(sidebarRight).toContain('canSplit: false,')
  })

  it('keeps the session export on the official more-actions button', async () => {
    const [main, patch] = await Promise.all([
      readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8'),
      readFile(
        path.join(projectRoot, 'patches', '@deepseek-ai+dsh-client-ui-conversation+0.1.5-rc.2.patch'),
        'utf8'
      )
    ])

    // No DOM-clicking export relay: the official button is visible again.
    expect(main).not.toContain('export-session')
    expect(main).not.toContain('moreButton')
    expect(main).toContain("ipcMain.handle('safe-mode:show'")
    // Official header utilities keep their upstream position.
    expect(patch).not.toContain('[class*="headerUtilities"]')
  })
})
