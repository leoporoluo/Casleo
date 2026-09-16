import { ipcRenderer } from 'electron'
import { formatZoomPercentage, type DesktopMenuCommand } from '../shared/desktop-menu'

type MenuEntry =
  | { kind: 'command'; command: DesktopMenuCommand; label: string; shortcut?: string }
  | { kind: 'separator' }
  | { kind: 'label'; label: string }
  | { kind: 'zoom'; label: string }

type Surface = 'button' | 'panel'

const CHEVRON_ICON = `<svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`

/**
 * The application menu is two views: a button strip that never changes size and
 * a panel that is shown and hidden. Resizing a view over the caption strip
 * repaints it, so the button owns a fixed rectangle and the panel never overlaps
 * it.
 */
const THEME_STYLES = `
  :root {
    color-scheme: light;
    --label-primary: #202124; --label-secondary: #61666b; --label-tertiary: #81858c;
    --hover: rgba(32,33,36,.08); --surface: #fff; --border: rgba(32,33,36,.13);
    --separator: rgba(32,33,36,.09); --layer: rgba(32,33,36,.06); --danger: #d93025;
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --label-primary: #f3f4f6; --label-secondary: #b5b7bd; --label-tertiary: #92959b;
    --hover: rgba(255,255,255,.09); --surface: #28282b; --border: rgba(255,255,255,.12);
    --separator: rgba(255,255,255,.09); --layer: rgba(255,255,255,.07); --danger: #ee7772;
  }
  * { box-sizing: border-box; }
  html, body { width:100%; height:100%; margin:0; overflow:hidden; background:transparent; }
  body { color:var(--label-primary); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; user-select:none; }
`

const BUTTON_STYLES = `
  .menuButton {
    appearance:none; width:100%; height:100%; display:grid; place-items:center; padding:0;
    color:var(--label-secondary); background:transparent; border:0; cursor:pointer;
  }
  .menuButton:hover, .menuButton.isOpen { color:var(--label-primary); background:var(--hover); }
  .menuButton:focus-visible { outline:none; background:var(--hover); }
`

const PANEL_STYLES = `
  .menu {
    width:100%; height:auto; max-height:100%; overflow:auto; padding:7px;
    color:var(--label-primary); background:var(--surface);
    border:1px solid var(--border); border-radius:12px;
    scrollbar-width:thin;
  }
  .sectionLabel { padding:7px 10px 4px; color:var(--label-tertiary); font-size:10px; font-weight:600; line-height:14px; letter-spacing:.08em; text-transform:uppercase; }
  .item { appearance:none; width:100%; min-height:33px; display:flex; align-items:center; justify-content:space-between; gap:20px; padding:6px 10px; color:inherit; background:transparent; border:0; border-radius:7px; font:inherit; font-size:13px; line-height:20px; text-align:left; cursor:pointer; }
  .item:hover, .item:focus-visible, .zoomButton:hover, .zoomButton:focus-visible, .zoomReset:hover, .zoomReset:focus-visible { outline:none; background:var(--hover); }
  .item.danger { color:var(--danger); }
  kbd { flex:none; color:var(--label-tertiary); font:11px/16px ui-monospace,"SFMono-Regular",Consolas,monospace; }
  .separator { height:1px; margin:6px 3px; background:var(--separator); }
  .zoomRow { min-height:37px; display:grid; grid-template-columns:1fr 30px 54px 30px; align-items:center; gap:3px; padding:3px 7px 3px 10px; font-size:13px; }
  .zoomButton, .zoomReset { appearance:none; height:27px; padding:0; color:inherit; background:var(--layer); border:0; border-radius:6px; font:inherit; cursor:pointer; }
  .zoomReset { font-size:11px; }
  @media (prefers-reduced-motion:reduce) { * { scroll-behavior:auto !important; } }
`

function surfaceStyles(surface: Surface): string {
  return THEME_STYLES + (surface === 'panel' ? PANEL_STYLES : BUTTON_STYLES)
}

function mountWindowsMenu(): void {
  if (!document.body || document.getElementById('application-menu-root')) return
  const params = new URLSearchParams(location.search)
  const locale = params.get('locale') === 'zh' ? 'zh' : 'en'
  const surface: Surface = params.get('surface') === 'panel' ? 'panel' : 'button'

  applyTheme(params.get('theme') === 'dark')
  ipcRenderer.on('desktop-titlebar:theme-changed', (_event, isDark: unknown) => {
    if (typeof isDark === 'boolean') applyTheme(isDark)
  })

  const style = document.createElement('style')
  style.textContent = surfaceStyles(surface)
  document.head.appendChild(style)

  if (surface === 'panel') mountPanel(locale)
  else mountButton(locale)
}

/** One button that reports toggles; the main process owns the open state. */
function mountButton(locale: 'en' | 'zh'): void {
  const button = document.createElement('button')
  button.id = 'application-menu-root'
  button.className = 'menuButton'
  button.type = 'button'
  button.setAttribute('aria-haspopup', 'menu')
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-label', locale === 'zh' ? '打开应用菜单' : 'Open application menu')
  button.title = locale === 'zh' ? '应用菜单' : 'Application menu'
  button.innerHTML = CHEVRON_ICON

  const setOpen = (open: boolean): void => {
    button.classList.toggle('isOpen', open)
    button.setAttribute('aria-expanded', open ? 'true' : 'false')
  }

  button.addEventListener('pointerdown', (event) => event.preventDefault())
  button.addEventListener('click', () => {
    void ipcRenderer
      .invoke('desktop-titlebar:toggle-menu')
      .catch((error: unknown) => {
        console.warn('[desktop-menu] unable to toggle the application menu', error)
      })
  })
  ipcRenderer.on('desktop-titlebar:menu-state', (_event, open: unknown) => {
    if (typeof open === 'boolean') setOpen(open)
  })
  ipcRenderer.on('desktop-titlebar:close-menu', () => setOpen(false))

  document.body.appendChild(button)
}

/** The panel itself: it is hidden by the main process when the menu closes. */
function mountPanel(locale: 'en' | 'zh'): void {
  const close = (): void => {
    void ipcRenderer.invoke('desktop-titlebar:set-menu-open', false).catch((error: unknown) => {
      console.warn('[desktop-menu] unable to close the application menu', error)
    })
  }

  const menu = document.createElement('div')
  menu.id = 'application-menu-root'
  menu.className = 'menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', locale === 'zh' ? '应用菜单' : 'Application menu')
  const zoomDisplay = renderMenu(menu, menuEntries(locale), close)
  document.body.appendChild(menu)
  refreshZoomState(zoomDisplay)

  // The view shrinks to the panel so its transparent remainder no longer covers
  // the window: a click just outside the panel then reaches the window and closes
  // the menu, which is what "click outside to close" means here.
  //
  // The reported height is the panel's *border box*. `scrollHeight` stops at the
  // padding, so a report built on it left the view one border short of the panel
  // it hosts, and every open menu painted a scrollbar that had nothing to scroll.
  const reportHeight = (): void => {
    const height = Math.ceil(menu.scrollHeight + panelBorderHeight(menu))
    if (height <= 0) return
    void ipcRenderer
      .invoke('desktop-titlebar:panel-height', height)
      .catch((error: unknown) => {
        console.warn('[desktop-menu] unable to report the panel height', error)
      })
  }
  window.requestAnimationFrame(() => {
    reportHeight()
    new ResizeObserver(reportHeight).observe(menu)
  })

  const closeOnEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }
  menu.addEventListener('keydown', (event) => {
    const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const next = current < 0 ? 0 : (current + direction + buttons.length) % buttons.length
      buttons[next]?.focus()
      return
    }
    closeOnEscape(event)
  })
  document.addEventListener('keydown', closeOnEscape)
  window.requestAnimationFrame(() =>
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  )
}

function renderMenu(
  menu: HTMLElement,
  entries: MenuEntry[],
  close: () => void
): HTMLButtonElement | null {
  let zoomDisplay: HTMLButtonElement | null = null
  for (const entry of entries) {
    if (entry.kind === 'separator') {
      const separator = document.createElement('div')
      separator.className = 'separator'
      separator.setAttribute('role', 'separator')
      menu.appendChild(separator)
      continue
    }
    if (entry.kind === 'label') {
      const label = document.createElement('div')
      label.className = 'sectionLabel'
      label.textContent = entry.label
      menu.appendChild(label)
      continue
    }
    if (entry.kind === 'zoom') {
      const row = document.createElement('div')
      row.className = 'zoomRow'
      const label = document.createElement('span')
      label.textContent = entry.label
      row.append(label)
      for (const [command, text, title] of [
        ['zoom-out', '−', 'Zoom out'],
        ['zoom-reset', '100%', 'Reset zoom'],
        ['zoom-in', '+', 'Zoom in']
      ] as const) {
        const zoom = document.createElement('button')
        zoom.type = 'button'
        zoom.className = command === 'zoom-reset' ? 'zoomReset' : 'zoomButton'
        zoom.textContent = text
        zoom.title = title
        zoom.setAttribute('aria-label', title)
        zoom.addEventListener('pointerdown', (event) => event.preventDefault())
        zoom.addEventListener('click', () => {
          void ipcRenderer.invoke('desktop-menu:execute', command).then(applyZoomState).catch((error: unknown) => {
            console.error(`[desktop-menu] unable to execute ${command}`, error)
          })
        })
        if (command === 'zoom-reset') zoomDisplay = zoom
        row.appendChild(zoom)
      }
      menu.appendChild(row)
      continue
    }

    const item = document.createElement('button')
    item.type = 'button'
    item.className = entry.command === 'quit' ? 'item danger' : 'item'
    item.setAttribute('role', 'menuitem')
    const itemLabel = document.createElement('span')
    itemLabel.textContent = entry.label
    item.appendChild(itemLabel)
    if (entry.shortcut) {
      const shortcut = document.createElement('kbd')
      shortcut.textContent = entry.shortcut
      item.appendChild(shortcut)
    }
    item.addEventListener('pointerdown', (event) => event.preventDefault())
    item.addEventListener('click', () => {
      close()
      void ipcRenderer.invoke('desktop-menu:execute', entry.command).catch((error: unknown) => {
        console.error(`[desktop-menu] unable to execute ${entry.command}`, error)
      })
    })
    menu.appendChild(item)
  }
  return zoomDisplay
}

/**
 * The panel's vertical border, which `scrollHeight` leaves out. A content-sized
 * view has to add it back: without it the panel is taller than the view holding
 * it, and its `overflow:auto` paints a scrollbar with nothing to scroll.
 */
function panelBorderHeight(element: HTMLElement): number {
  const styles = window.getComputedStyle(element)
  const top = Number.parseFloat(styles.borderTopWidth)
  const bottom = Number.parseFloat(styles.borderBottomWidth)
  return (Number.isFinite(top) ? top : 0) + (Number.isFinite(bottom) ? bottom : 0)
}

function readZoomFactor(result: unknown): number | undefined {
  if (typeof result !== 'object' || result === null || !('zoomFactor' in result)) return undefined
  const zoomFactor = (result as { zoomFactor?: unknown }).zoomFactor
  return typeof zoomFactor === 'number' && Number.isFinite(zoomFactor) && zoomFactor > 0
    ? zoomFactor
    : undefined
}

function applyZoomState(result: unknown): void {
  const zoomFactor = readZoomFactor(result)
  const display = document.getElementById('application-menu-zoom')
  if (zoomFactor !== undefined && display !== null) {
    display.textContent = formatZoomPercentage(zoomFactor)
  }
}

function refreshZoomState(zoomDisplay: HTMLButtonElement | null): void {
  if (zoomDisplay !== null) zoomDisplay.id = 'application-menu-zoom'
  void ipcRenderer.invoke('desktop-menu:get-zoom-factor').then(applyZoomState).catch((error: unknown) => {
    console.warn('[desktop-menu] unable to read zoom factor', error)
  })
}

function applyTheme(isDark: boolean): void {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
}

function menuEntries(locale: 'en' | 'zh'): MenuEntry[] {
  const zh = locale === 'zh'
  return [
    { kind: 'label', label: 'HARNESS' },
    { kind: 'command', command: 'restart-harness', label: zh ? '重启 Harness' : 'Restart Harness', shortcut: 'Ctrl+Shift+R' },
    { kind: 'command', command: 'safe-mode', label: zh ? '以安全模式重启…' : 'Restart as Safe Mode…' },
    { kind: 'command', command: 'show-harness-log', label: zh ? '显示 Harness 日志' : 'Show Harness Log' },
    { kind: 'command', command: 'export-session', label: zh ? '导出 Session 日志…' : 'Export Session Log…' },
    { kind: 'separator' },
    { kind: 'label', label: zh ? '编辑' : 'EDIT' },
    { kind: 'command', command: 'undo', label: zh ? '撤销' : 'Undo', shortcut: 'Ctrl+Z' },
    { kind: 'command', command: 'redo', label: zh ? '重做' : 'Redo', shortcut: 'Ctrl+Y' },
    { kind: 'command', command: 'cut', label: zh ? '剪切' : 'Cut', shortcut: 'Ctrl+X' },
    { kind: 'command', command: 'copy', label: zh ? '复制' : 'Copy', shortcut: 'Ctrl+C' },
    { kind: 'command', command: 'paste', label: zh ? '粘贴' : 'Paste', shortcut: 'Ctrl+V' },
    { kind: 'command', command: 'select-all', label: zh ? '全选' : 'Select All', shortcut: 'Ctrl+A' },
    { kind: 'separator' },
    { kind: 'label', label: zh ? '视图' : 'VIEW' },
    { kind: 'command', command: 'reload', label: zh ? '重新加载' : 'Reload', shortcut: 'Ctrl+R' },
    { kind: 'command', command: 'toggle-devtools', label: zh ? '开发者工具' : 'Developer Tools', shortcut: 'Ctrl+Shift+I' },
    { kind: 'zoom', label: zh ? '界面缩放' : 'Interface scale' },
    { kind: 'command', command: 'toggle-fullscreen', label: zh ? '切换全屏' : 'Toggle Full Screen', shortcut: 'F11' },
    { kind: 'separator' },
    { kind: 'command', command: 'about', label: zh ? '关于 Casleo' : 'About Casleo' },
    { kind: 'command', command: 'quit', label: zh ? '退出' : 'Exit' }
  ]
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', mountWindowsMenu, { once: true })
} else {
  mountWindowsMenu()
}
