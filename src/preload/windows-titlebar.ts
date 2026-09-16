import type { IpcRenderer } from 'electron'

const LAYOUT_STYLE_ID = 'dsh-desktop-windows-titlebar-layout-style'
const DRAG_REGION_ID = 'dsh-desktop-windows-drag-region'
const CAPTION_GUARD_ID = 'dsh-desktop-windows-caption-guard'
const SIDEBAR_WIDTH_PROPERTY = '--dsh-desktop-windows-sidebar-width'
const CAPTION_WIDTH_PROPERTY = '--dsh-desktop-windows-caption-width'

interface TitlebarLayoutMountOptions {
  document: Document
  ipcRenderer: Pick<IpcRenderer, 'invoke'>
}

export function mountWindowsTitlebarLayout(options: TitlebarLayoutMountOptions): void {
  const { document, ipcRenderer } = options
  if (!document.body) return

  installLayout(document)
  installDragRegion(document)
  trackSidebarLayout(document)

  document.addEventListener('pointerdown', () => {
    void ipcRenderer.invoke('desktop-titlebar:close-menu').catch((error: unknown) => {
      console.warn('[desktop-titlebar] unable to close the application menu', error)
    })
  })

  syncTheme(document, ipcRenderer)
  const themeObserver = new MutationObserver(() => syncTheme(document, ipcRenderer))
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-ds-dark-theme', 'class', 'style']
  })
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    syncTheme(document, ipcRenderer)
  })
}

function installLayout(document: Document): void {
  document.body.classList.add('dsh-desktop-windows-titlebar-layout')
  if (document.getElementById(LAYOUT_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = LAYOUT_STYLE_ID
  style.textContent = `
    html, body { height: 100% !important; }
    body.dsh-desktop-windows-titlebar-layout {
      ${CAPTION_WIDTH_PROPERTY}: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, calc(100vw - 140px)));
      box-sizing: border-box !important;
      height: 100% !important;
      padding-top: 0 !important;
    }
    body.dsh-desktop-windows-titlebar-layout > #root {
      height: 100% !important;
      min-height: 0 !important;
    }
    :root {
      --dsh-titlebar-safe-inset-top: 36px;
      --dsh-titlebar-safe-inset-right: calc(var(${CAPTION_WIDTH_PROPERTY}, 140px) + 44px);
    }
    body.dsh-desktop-windows-titlebar-layout [data-dsh-sidebar-root][data-dsh-sidebar-wide="true"] {
      padding-top: 6px !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-sidebar-right-panel],
    body.dsh-desktop-windows-titlebar-layout [data-sidebar-right-panel="fullscreen"],
    body.dsh-desktop-windows-titlebar-layout [data-rightbar-col] > div,
    body.dsh-desktop-windows-titlebar-layout [data-side="rightbar"] {
      top: var(--dsh-titlebar-safe-inset-top, 36px) !important;
      height: calc(100% - var(--dsh-titlebar-safe-inset-top, 36px)) !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header {
      position: relative !important;
      min-height: 76px !important;
      padding-top: 6px !important;
      padding-right: 20px !important;
      box-sizing: border-box !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header > div:first-child {
      padding-right: calc(var(${CAPTION_WIDTH_PROPERTY}, 140px) + 52px) !important;
      box-sizing: border-box !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header div[data-conversation-header-corner],
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerCorner"] {
      position: absolute !important;
      top: 38px !important;
      right: 20px !important;
      margin: 0 !important;
      z-index: 20 !important;
      display: flex !important;
      align-items: center !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerUtilities"] {
      position: absolute !important;
      top: 38px !important;
      right: 56px !important;
      margin: 0 !important;
      z-index: 20 !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }
    /*
     * Leaving Settings with Escape hands focus back to a sidebar row or to the
     * settings trigger, where the shell's 2px label-primary outline reads as a
     * stray white box. Suppress only that outline — the shell's own hover and
     * active backgrounds must keep painting.
     */
    body.dsh-desktop-windows-titlebar-layout [data-dsh-sidebar-root] [class*="panelRow"]:focus-visible,
    body.dsh-desktop-windows-titlebar-layout [data-dsh-sidebar-settings] :focus-visible {
      outline: none !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerUtilities"]:has(+ [data-conversation-header-corner]:empty),
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerUtilities"]:has(+ [class*="headerCorner"]:empty),
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerUtilities"]:has(+ div:empty),
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerUtilities"]:last-child {
      right: 20px !important;
    }
    body.dsh-desktop-windows-titlebar-layout [class*="headerUtilities"] button[aria-label="更多操作"],
    body.dsh-desktop-windows-titlebar-layout [class*="headerUtilities"] button[aria-label="More actions"],
    body.dsh-desktop-windows-titlebar-layout [class*="headerUtilities"] [class*="moreButton"] {
      display: none !important;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header div[role="tablist"] {
      padding-right: 180px !important;
      box-sizing: border-box !important;
    }
    body.dsh-desktop-windows-titlebar-layout button,
    body.dsh-desktop-windows-titlebar-layout a,
    body.dsh-desktop-windows-titlebar-layout input,
    body.dsh-desktop-windows-titlebar-layout select,
    body.dsh-desktop-windows-titlebar-layout textarea,
    body.dsh-desktop-windows-titlebar-layout [role="button"],
    body.dsh-desktop-windows-titlebar-layout [role="tab"],
    body.dsh-desktop-windows-titlebar-layout [role="menuitem"],
    body.dsh-desktop-windows-titlebar-layout [data-dsh-no-drag] {
      -webkit-app-region: no-drag !important;
    }
    /*
     * The drag region sits at z-index 10: below the header's own clickable
     * clusters (z-index 20) and far below modal overlays, which must still cover
     * the header. Lifting a cluster is not enough on its own — the caption strip's
     * draggable rectangle has to be punched through with a no-drag region as
     * well, or the window still claims the click and drags instead.
     *
     * The session crumbs carry the lineage chip (the subagent control) and are
     * matched without an ancestor chain because the slot content lives inside the
     * crumbs container, not beside it.
     */
    body.dsh-desktop-windows-titlebar-layout [class*="headerActions"],
    body.dsh-desktop-windows-titlebar-layout [class*="crumb"] {
      position: relative !important;
      z-index: 20 !important;
      -webkit-app-region: no-drag !important;
    }
    /*
     * A covering overlay can never be punched through from below, so the window
     * is dragged by the session header itself and its controls opt out with a
     * no-drag region. That is the form Chromium resolves reliably.
     */
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header,
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header > div:first-child {
      -webkit-app-region: drag;
    }
    /*
     * The sidebar's logo row is the second place the window is dragged from. Its
     * only control is the collapse button, which the button rule above already
     * excludes, so the rest of the row — the mark and the whole empty width beside
     * it — is free to carry the gesture. Without it the top-left corner offers
     * nothing but the 8px strip, which is easy to miss and, on a restored window,
     * sits under the native sizing border.
     */
    body.dsh-desktop-windows-titlebar-layout [data-dsh-sidebar-root] [class*="logoRow"] {
      -webkit-app-region: drag;
    }
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header button,
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header a,
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header input,
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header select,
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header textarea,
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [role="button"],
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [role="tab"],
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [role="menuitem"],
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="crumb"],
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [class*="headerActions"],
    body.dsh-desktop-windows-titlebar-layout [data-slot="conversation.session.header"] > header [data-dsh-no-drag] {
      -webkit-app-region: no-drag !important;
    }
    #${DRAG_REGION_ID} {
      position: fixed;
      z-index: 10;
      top: 0;
      left: 0;
      right: calc(var(${CAPTION_WIDTH_PROPERTY}, 140px) + 44px);
      /*
       * Only a thin fallback band: it covers the topmost pixels (over the sidebar
       * and any surface without its own drag area) and never the header's own
       * content, which a covering overlay could only ever swallow.
       */
      height: 8px;
      background: transparent;
      user-select: none;
      -webkit-app-region: drag;
    }
    /*
     * The header's own drag area reaches the window's right edge, which would put
     * the caption controls and the application-menu button inside a draggable
     * rectangle and make them unclickable. This guard paints after every drag
     * region and subtracts that column from all of them.
     */
    #${CAPTION_GUARD_ID} {
      position: fixed;
      top: 0;
      right: 0;
      width: calc(var(${CAPTION_WIDTH_PROPERTY}, 140px) + 44px);
      height: 36px;
      background: transparent;
      pointer-events: none;
      user-select: none;
      -webkit-app-region: no-drag;
    }
  `
  document.head.appendChild(style)
}

function installDragRegion(document: Document): void {
  if (document.getElementById(DRAG_REGION_ID)) return
  const dragRegion = document.createElement('div')
  dragRegion.id = DRAG_REGION_ID
  dragRegion.setAttribute('aria-hidden', 'true')
  document.body.appendChild(dragRegion)

  // Painted last on purpose: it subtracts the caption column from every drag
  // region above it, so the caption controls and the menu button keep the click.
  if (!document.getElementById(CAPTION_GUARD_ID)) {
    const captionGuard = document.createElement('div')
    captionGuard.id = CAPTION_GUARD_ID
    captionGuard.setAttribute('aria-hidden', 'true')
    document.body.appendChild(captionGuard)
  }

  // While any modal or dialog is open, hide the drag region completely so every
  // control around the top caption strip stays clickable.
  const modalSelector =
    'dialog[open], [role="dialog"], [aria-modal="true"], [class*="modal" i], [class*="dialog" i]'

  const updateDragRegionVisibility = (): void => {
    const hasModal = Array.from(document.querySelectorAll<HTMLElement>(modalSelector)).some((element) => {
      if (element.id === DRAG_REGION_ID) return false
      const style = window.getComputedStyle(element)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        element.offsetWidth > 0 &&
        element.offsetHeight > 0
      )
    })
    dragRegion.style.display = hasModal ? 'none' : 'block'
  }

  const observer = new MutationObserver(() => updateDragRegionVisibility())
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['open', 'style', 'class', 'hidden', 'aria-hidden']
  })
  updateDragRegionVisibility()
}

function trackSidebarLayout(document: Document): void {
  let observedSidebarColumn: HTMLElement | null = null
  const resizeObserver = new ResizeObserver(() => updateSidebarWidth())

  const updateSidebarWidth = (): void => {
    if (!observedSidebarColumn) {
      document.documentElement.style.setProperty(SIDEBAR_WIDTH_PROPERTY, '0px')
      return
    }
    const width = observedSidebarColumn.getBoundingClientRect().width
    document.documentElement.style.setProperty(SIDEBAR_WIDTH_PROPERTY, `${Math.max(0, width)}px`)
  }

  const sync = (): void => {
    const sidebarRoot = document.querySelector<HTMLElement>('[data-dsh-sidebar-root]')
    const sidebarColumn = sidebarRoot?.parentElement ?? null

    if (sidebarColumn !== observedSidebarColumn) {
      if (observedSidebarColumn) resizeObserver.unobserve(observedSidebarColumn)
      observedSidebarColumn = sidebarColumn
      if (sidebarColumn) resizeObserver.observe(sidebarColumn)
    }
    updateSidebarWidth()
  }

  const observer = new MutationObserver(sync)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  sync()
}

function syncTheme(document: Document, ipcRenderer: Pick<IpcRenderer, 'invoke'>): void {
  const isDark = documentIsDark(document)
  void ipcRenderer.invoke('desktop-titlebar:set-theme', isDark).catch((error: unknown) => {
    console.warn('[desktop-titlebar] unable to synchronize native theme', error)
  })
}

export function documentIsDark(document: Document): boolean {
  if (document.body.hasAttribute('data-ds-dark-theme')) return true
  const color = document.defaultView?.getComputedStyle(document.body).backgroundColor ?? ''
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  if (!channels || channels.length < 3 || channels.some(Number.isNaN)) {
    return document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false
  }
  const [red = 255, green = 255, blue = 255] = channels
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 < 128
}
