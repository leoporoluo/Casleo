import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  WINDOWS_TITLEBAR_HEIGHT,
  desktopMenuCommands,
  formatZoomPercentage,
  isDesktopMenuCommand
} from '../src/shared/desktop-menu'
import {
  WINDOWS_CAPTION_CONTROLS_WIDTH,
  WINDOWS_MENU_BUTTON_WIDTH,
  WINDOWS_MENU_PANEL_WIDTH,
  windowsMenuButtonBounds,
  windowsMenuPanelBounds
} from '../src/main/windows-menu-view'

describe('Windows titlebar menu', () => {
  it('uses a Windows-only overlay while preserving the macOS frame behavior', async () => {
    const main = await readFile('src/main/index.ts', 'utf8')

    expect(main).toContain("const isWindows = process.platform === 'win32'")
    expect(main).toContain("frame: process.platform !== 'darwin'")
    expect(main).toContain("titleBarStyle: 'hidden' as const")
    expect(main).toContain('titleBarOverlay: windowsTitleBarOverlay')
    expect(main).toContain('autoHideMenuBar: true')
    expect(main).toContain('window.setMenuBarVisibility(false)')
    expect(main).toContain('Menu.setApplicationMenu(Menu.buildFromTemplate(template))')
  })

  it('keeps the entire Windows app full-height without a visible titlebar band', async () => {
    const main = await readFile('src/main/index.ts', 'utf8')
    const preload = await readFile('src/preload/windows-titlebar.ts', 'utf8')

    expect(WINDOWS_TITLEBAR_HEIGHT).toBe(36)
    expect(main).toContain("color: '#00000000'")
    expect(preload).not.toContain(`padding-top: \${WINDOWS_TITLEBAR_HEIGHT}px !important`)
    expect(preload).toContain('padding-top: 0 !important')
    expect(preload).toContain('[data-dsh-sidebar-root][data-dsh-sidebar-wide="true"]')
    expect(preload).toContain('padding-top: 6px !important')
    expect(preload).toContain('trackSidebarLayout(document)')
    expect(preload).toContain("document.documentElement.style.setProperty(SIDEBAR_WIDTH_PROPERTY")
    expect(preload).toContain("dragRegion.id = DRAG_REGION_ID")
    expect(preload).toContain('-webkit-app-region: drag')
    expect(preload).toContain('body.dsh-desktop-windows-titlebar-layout > #root')
    expect(preload).toContain('left: 0')
    // The caption strip sits below the header's own clusters and below modals,
    // so their controls stay clickable while the strip itself still drags.
    expect(preload).toContain('z-index: 10')
    expect(preload).toContain('[class*="headerActions"]')
    expect(preload).toContain('z-index: 20 !important')
    expect(preload).toContain('modalSelector')
    expect(preload).toContain('updateDragRegionVisibility')
    // Leaving the settings panel must not leave the shell's white focus box on
    // a sidebar row, and the header's crumbs must stay clickable inside the
    // caption strip.
    expect(preload).toContain('[class*="panelRow"]:focus-visible')
    expect(preload).toContain('[data-dsh-sidebar-settings] :focus-visible')
    expect(preload).toContain('[class*="crumb"]')
    // Lifting the cluster is not enough: the caption strip's draggable rectangle
    // has to be punched through so the lineage chip receives the click.
    expect(preload).toMatch(/\[class\*="crumb"\]\s*\{[^}]*no-drag/u)
    // The window drags through the header itself, and the fallback band stays a
    // thin strip so it can never cover the header's own controls again.
    expect(preload).toContain('conversation.session.header"] > header,')
    expect(preload).toContain('conversation.session.header"] > header button,')
    expect(preload).toContain('height: 8px;')
    expect(preload).not.toContain('background: none !important')
    expect(preload).toContain('body.dsh-desktop-windows-titlebar-layout button')
    expect(preload).toContain('-webkit-app-region: no-drag !important')
    expect(preload).toContain("document.documentElement.style.setProperty(SIDEBAR_WIDTH_PROPERTY, '0px')")
  })

  it('integrates session export into the application menu and defines titlebar safe-inset variables', async () => {
    const main = await readFile('src/main/index.ts', 'utf8')
    const preload = await readFile('src/preload/windows-titlebar.ts', 'utf8')
    const menuPreload = await readFile('src/preload/windows-menu.ts', 'utf8')
    const sidebarPatch = await readFile(
      'patches/@deepseek-ai+dsh-client-ui-sidebar-right+0.1.5-rc.2.patch',
      'utf8'
    )

    // Standard CSS variable declarations for safe titlebar insets
    expect(preload).toContain('--dsh-titlebar-safe-inset-top: 36px;')
    expect(preload).toContain('--dsh-titlebar-safe-inset-right:')

    // Sidebar right patch adopts the standard variable
    expect(sidebarPatch).toContain('var(--dsh-titlebar-safe-inset-top, 0px)')

    // Header container and row 2 action cluster (utilities & corner) below titlebar strip
    expect(preload).toContain('[data-slot="conversation.session.header"] > header')
    expect(preload).toContain('min-height: 76px !important;')
    expect(preload).toContain('[data-conversation-header-corner]')
    expect(preload).toContain('top: 38px !important;')
    expect(preload).toContain('right: 20px !important;')
    expect(preload).toContain('[class*="headerUtilities"]')
    expect(preload).toContain('right: 56px !important;')
    expect(preload).toContain('[class*="moreButton"]')
    expect(preload).toContain('display: none !important;')
    expect(preload).toContain('div[role="tablist"]')
    expect(preload).toContain('padding-right: 180px !important;')

    // Row 1 breadcrumb/title row reserves space to stay clear of min/max/close and menu button
    expect(preload).toContain('[data-slot="conversation.session.header"] > header > div:first-child')
    expect(preload).toContain('padding-right: calc(var(${CAPTION_WIDTH_PROPERTY}, 140px) + 52px) !important;')

    // Right sidebar offsets below titlebar safe-inset
    expect(preload).toContain('[data-sidebar-right-panel]')
    expect(preload).toContain('var(--dsh-titlebar-safe-inset-top, 36px)')

    // Application menu includes export-session command
    expect(desktopMenuCommands).toContain('export-session')
    expect(menuPreload).toContain("command: 'export-session'")
    expect(menuPreload).toContain("zh ? '导出 Session 日志…' : 'Export Session Log…'")
    expect(main).toContain("case 'export-session':")

    // No broken CSS transform injections on display:contents slot anchors
    expect(main).not.toContain('dsh-desktop-windows-header-shift')
    expect(main).not.toContain('transform:translateY')
  })

  it('accepts only the fixed menu command allowlist', async () => {
    const main = await readFile('src/main/index.ts', 'utf8')

    expect(desktopMenuCommands).not.toContain('connect-phone')
    expect(desktopMenuCommands).toContain('safe-mode')
    expect(await readFile('src/preload/windows-menu.ts', 'utf8')).toContain(
      "label: zh ? '以安全模式重启…' : 'Restart as Safe Mode…'"
    )
    expect(desktopMenuCommands).not.toContain('check-for-updates')
    expect(desktopMenuCommands).toContain('toggle-fullscreen')
    expect(isDesktopMenuCommand('copy')).toBe(true)
    expect(isDesktopMenuCommand('run-shell-command')).toBe(false)
    expect(isDesktopMenuCommand({ command: 'quit' })).toBe(false)
    expect(main).toContain("ipcMain.handle('desktop-menu:execute'")
    expect(main).toContain("ipcMain.handle('desktop-menu:get-zoom-factor'")
    expect(main).toContain('assertTrustedDesktopMenuEvent(event)')
    expect(main).toContain('function assertTrustedWindowsMenuEvent')
    expect(main).toContain('windowsMenuViews().some(')
    expect(main).toContain('if (!isDesktopMenuCommand(command))')
  })

  it('hosts the menu in a fixed-zoom child view instead of counter-scaling Harness content', async () => {
    const main = await readFile('src/main/index.ts', 'utf8')
    const layoutPreload = await readFile('src/preload/windows-titlebar.ts', 'utf8')
    const menuPreload = await readFile('src/preload/windows-menu.ts', 'utf8')
    const viteConfig = await readFile('electron.vite.config.ts', 'utf8')

    expect(formatZoomPercentage(1)).toBe('100%')
    expect(formatZoomPercentage(Math.sqrt(1.2))).toBe('110%')
    expect(formatZoomPercentage(1 / Math.sqrt(1.2))).toBe('91%')
    expect(main).toContain('contents.getZoomFactor()')
    expect(main).toContain('new WebContentsView')
    expect(main).toContain('window.contentView.addChildView(panelView)')
    expect(main).toContain('window.contentView.addChildView(buttonView)')
    expect(main).toContain('view.webContents.setZoomFactor(1)')
    expect(main).toContain("preload: join(import.meta.dirname, '../preload/windows-menu.cjs')")
    expect(main).toContain("surface: 'panel'")
    expect(main).toContain("surface: 'button'")
    expect(menuPreload).toContain("ipcRenderer.invoke('desktop-menu:get-zoom-factor')")
    expect(menuPreload).toContain('formatZoomPercentage(zoomFactor)')
    expect(menuPreload).toContain("params.get('surface') === 'panel'")
    expect(menuPreload).toContain("invoke('desktop-titlebar:panel-height', height)")
    expect(main).toContain("ipcMain.handle('desktop-titlebar:panel-height'")
    expect(layoutPreload).not.toContain('INVERSE_ZOOM_PROPERTY')
    expect(layoutPreload).not.toContain('menuButton')
    expect(viteConfig).toContain("'windows-menu': resolve('src/preload/windows-menu.ts')")
  })

  it('keeps the closed menu button aligned beside native caption controls at every page zoom', () => {
    expect(WINDOWS_CAPTION_CONTROLS_WIDTH).toBe(140)
    expect(WINDOWS_MENU_BUTTON_WIDTH).toBe(44)
    expect(WINDOWS_MENU_PANEL_WIDTH).toBe(304)

    const buttonAt100Percent = windowsMenuButtonBounds({ width: 1380, height: 900 }, false)
    expect(buttonAt100Percent).toEqual({ x: 1196, y: 0, width: 44, height: 36 })
    // The button strip never depends on the menu state, so opening the menu
    // cannot resize — and therefore repaint — the strip over the caption area.
    expect(windowsMenuButtonBounds({ width: 1380, height: 900 }, false)).toEqual(buttonAt100Percent)

    const panel = windowsMenuPanelBounds({ width: 1380, height: 900 }, false)
    expect(panel).toEqual({ x: 936, y: 36, width: 304, height: 760 })
    // The panel starts below the button strip so the button keeps its own clicks.
    expect(panel.y).toBe(buttonAt100Percent.height)

    expect(windowsMenuButtonBounds({ width: 900, height: 640 }, true)).toEqual({
      x: 856,
      y: 0,
      width: 44,
      height: 36
    })
    expect(windowsMenuPanelBounds({ width: 900, height: 640 }, true)).toEqual({
      x: 596,
      y: 36,
      width: 304,
      height: 604
    })
    // The panel shrinks to the content height its page reports, so the
    // transparent remainder cannot swallow clicks meant for the window below.
    expect(windowsMenuPanelBounds({ width: 1380, height: 900 }, false, 240)).toEqual({
      x: 936,
      y: 36,
      width: 304,
      height: 240
    })
    expect(windowsMenuPanelBounds({ width: 1380, height: 900 }, false, 5000).height).toBe(760)
  })

  it('shows the bundled Harness version in About without update controls', async () => {
    const main = await readFile('src/main/index.ts', 'utf8')

    expect(main).toContain('bundledHarnessVersion(app.getAppPath())')
    expect(main).not.toContain('checkForUpdates')
    expect(main).toContain('void showAbout(mainWindow).catch(showUnexpectedError)')
  })

  it('synchronizes the native controls with Harness light and dark themes', async () => {
    const main = await readFile('src/main/index.ts', 'utf8')
    const preload = await readFile('src/preload/windows-titlebar.ts', 'utf8')

    expect(main).toContain('window.setTitleBarOverlay(windowsTitleBarOverlay(isDark))')
    expect(main).toContain("ipcMain.handle('desktop-titlebar:set-theme'")
    expect(main).toContain("view.webContents.send('desktop-titlebar:theme-changed', isDark)")
    expect(main).toContain('for (const view of windowsMenuViews())')
    expect(preload).toContain("attributeFilter: ['data-ds-dark-theme', 'class', 'style']")
    expect(preload).toContain("ipcRenderer.invoke('desktop-titlebar:set-theme', isDark)")
  })
})
