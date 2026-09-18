import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..')

/**
 * Windows runs with the system's own caption buttons floating over the page
 * (Window Controls Overlay) instead of an OS caption band: the Harness shell
 * itself is the top strip.
 *
 * These tests pin the contract that keeps the two halves in sync — one shared
 * height constant for the main process and the page, a glyph color that follows
 * the resolved page theme, a draggable strip, and a guard over the caption
 * column. The self-drawn application menu stays retired: the menu is the native
 * one behind Alt.
 */
describe('Windows window controls overlay', () => {
  it('drops the OS caption band and keeps the system buttons as an overlay', async () => {
    const main = await readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8')

    expect(main).toContain("frame: process.platform !== 'darwin'")
    expect(main).toContain("titleBarStyle: 'hidden' as const")
    expect(main).toContain('titleBarOverlay: windowsTitleBarOverlay(nativeTheme.shouldUseDarkColors)')
    expect(main).toContain('autoHideMenuBar: true')
    // The surface is the page's; only the glyphs are ours.
    expect(main).toContain("color: '#00000000'")
    expect(main).toContain("symbolColor: isDark ? '#f3f4f6' : '#202124'")
    expect(main).toContain('height: WINDOWS_TITLEBAR_HEIGHT')
    expect(main).toContain('window.setTitleBarOverlay(windowsTitleBarOverlay(isDark))')
    // The taskbar identity stays "Casleo" even without a caption band.
    expect(main).toContain("title: 'Casleo'")
    expect(main).toContain("window.setTitle('Casleo')")
    expect(main).toContain('Menu.setApplicationMenu(Menu.buildFromTemplate(template))')
  })

  it('follows the resolved page theme at runtime, not only at launch', async () => {
    const [main, preload, titlebar, shared] = await Promise.all([
      readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'preload', 'index.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'preload', 'windows-titlebar.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'shared', 'titlebar.ts'), 'utf8')
    ])

    // One constant, two consumers: a mismatch is a dead click column.
    expect(shared).toContain('export const WINDOWS_TITLEBAR_HEIGHT = 36')
    expect(main).toContain("from '../shared/titlebar'")
    expect(titlebar).toContain("from '../shared/titlebar'")
    expect(titlebar).not.toContain('--dsh-titlebar-safe-inset-top: 36px')

    expect(main).toContain("ipcMain.handle('desktop-titlebar:set-theme'")
    expect(main).toContain('assertTrustedMainWindowEvent(event)')
    expect(main).toContain("nativeTheme.themeSource = isDark ? 'dark' : 'light'")
    expect(titlebar).toContain("ipcRenderer.invoke('desktop-titlebar:set-theme', isDark)")
    // The theme is watched, not sampled once: switching appearance in Settings
    // has to repaint the glyphs.
    expect(titlebar).toContain('new MutationObserver(() => syncTheme(document, ipcRenderer))')
    expect(titlebar).toContain("attributeFilter: ['data-ds-dark-theme', 'class', 'style']")
    expect(titlebar).toContain("matchMedia('(prefers-color-scheme: dark)')")

    expect(preload).toContain('mountWindowsTitlebarLayout({ document, ipcRenderer })')
    expect(preload).toContain("if (process.platform === 'win32')")
  })

  it('keeps the page draggable and the caption column clear', async () => {
    const titlebar = await readFile(
      path.join(projectRoot, 'src', 'preload', 'windows-titlebar.ts'),
      'utf8'
    )

    // Two drag surfaces the shell already owns: the sidebar's logo row and the
    // session header, with every control opting back out.
    expect(titlebar).toContain('[class*="logoRow"]')
    expect(titlebar).toContain('-webkit-app-region: drag')
    expect(titlebar).toContain('-webkit-app-region: no-drag')
    expect(titlebar).toContain('[data-dsh-no-drag]')
    // The caption column is measured from the browser's own WCO variables.
    expect(titlebar).toContain('env(titlebar-area-x, 0px)')
    expect(titlebar).toContain('env(titlebar-area-width, calc(100vw - 140px))')
    // The header's right-hand clusters move into the row the tabs use, clear of
    // the buttons; the crumb row stops before the caption column.
    expect(titlebar).toContain('top: ${WINDOWS_TITLEBAR_HEIGHT + 2}px')
    expect(titlebar).toContain('padding-right: calc(var(${CAPTION_WIDTH_PROPERTY}, 140px)')
    // Modals own the pointer while they are open.
    expect(titlebar).toContain('updateDragRegionVisibility')
    // The official more-actions button is the session export entry point now.
    expect(titlebar).not.toContain('更多操作')
    expect(titlebar).not.toContain('moreButton')
  })

  it('removed the self-drawn menu view and its preload', async () => {
    const viteConfig = await readFile(path.join(projectRoot, 'electron.vite.config.ts'), 'utf8')
    const main = await readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8')

    for (const retired of [
      path.join(projectRoot, 'src', 'main', 'windows-menu-view.ts'),
      path.join(projectRoot, 'src', 'preload', 'windows-menu.ts'),
      path.join(projectRoot, 'src', 'shared', 'desktop-menu.ts')
    ]) {
      expect(existsSync(retired), retired).toBe(false)
    }
    expect(viteConfig).not.toContain('windows-menu')
    expect(main).not.toContain('WebContentsView')
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

    // The strip is injected by the preload, so no vendor patch carries it and
    // upstream merges keep their own header CSS.
    for (const patch of [sidebar, sidebarRight, conversation]) {
      expect(patch).not.toContain('--dsh-titlebar-safe-inset-top')
      expect(patch).not.toContain('dsh-desktop-windows')
      expect(patch).not.toContain('[class*="headerUtilities"]')
    }
    expect(sidebar).not.toContain('padding-top:32px')
    expect(sidebar).toContain('[data-dsh-sidebar-brand-identity]{flex:1;min-width:0}')
    expect(sidebarRight).toContain('canSplit: false,')
  })

  it('keeps the session export on the official more-actions button', async () => {
    const main = await readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8')

    // No DOM-clicking export relay: the official button stays visible.
    expect(main).not.toContain('export-session')
    expect(main).not.toContain('moreButton')
    expect(main).toContain("ipcMain.handle('safe-mode:show'")
  })
})
