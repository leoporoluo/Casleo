import { contextBridge, ipcRenderer } from 'electron'
import { setupDesktopStoragePersistence } from './desktop-storage'
import { isPluginLoadError } from './plugin-error-view'
import { findBootFailureText } from './boot-failure'

// Intercept and persist localStorage to disk storage before any page script executes
setupDesktopStoragePersistence()

const SAFE_MODE_BANNER_ID = 'dsh-desktop-safe-mode-banner'
const locale: 'en' | 'zh' = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'

const ABOUT_ROOT_ID = 'dsh-desktop-about-root'
interface AboutInfo {
  desktopVersion: string
  harnessVersion: string
  locale: 'en' | 'zh'
}
let aboutHost: HTMLElement | null = null
let aboutShadow: ShadowRoot | null = null
let aboutOpen = false
let aboutInfo: AboutInfo | null = null
let sidebarRoot: HTMLElement | undefined
let domSyncScheduled = false
let bootScanSettled = false
let bootFailureTriggered = false
let bootFailureTimer: number | undefined
let rendererHealthReportInFlight = false
let rendererHealthHeartbeat: number | undefined
const pendingBootFailureMessages: string[] = []

const BOOT_FAILURE_SETTLE_MS = 400
const RENDERER_HEALTH_HEARTBEAT_MS = 5_000

function reportRendererHealthy(): void {
  if (rendererHealthReportInFlight || !sidebarRoot?.isConnected) return
  rendererHealthReportInFlight = true
  void ipcRenderer.invoke('harness:renderer-healthy').catch(() => undefined).finally(() => {
    rendererHealthReportInFlight = false
  })
}

function startRendererHealthHeartbeat(): void {
  reportRendererHealthy()
  if (rendererHealthHeartbeat !== undefined) return
  rendererHealthHeartbeat = window.setInterval(reportRendererHealthy, RENDERER_HEALTH_HEARTBEAT_MS)
}

function currentBootFailureText(): string | undefined {
  // Harness removes this root once the application starts. Scoping the check
  // to it prevents a quoted error in a conversation from being mistaken for a
  // startup failure by the document-wide mutation observer.
  return findBootFailureText(document)
}

function addBootFailureMessage(message: string | undefined): void {
  const normalized = message?.trim()
  if (!normalized || pendingBootFailureMessages.includes(normalized)) return
  pendingBootFailureMessages.push(normalized)
}

function queueBootFailure(message?: string): void {
  if (bootFailureTriggered) return

  addBootFailureMessage(message)
  addBootFailureMessage(currentBootFailureText())
  if (pendingBootFailureMessages.length === 0) return

  if (bootFailureTimer !== undefined) window.clearTimeout(bootFailureTimer)
  bootFailureTimer = window.setTimeout(() => {
    bootFailureTimer = undefined
    if (bootFailureTriggered) return

    // The web boot page renders the plugin name and detailed loader error after
    // window.error/unhandledrejection fires. Read it one last time before leaving
    // the page so recovery receives the richest available diagnostic evidence.
    addBootFailureMessage(currentBootFailureText())
    const errorText = pendingBootFailureMessages.join('\n')
    if (!errorText) return

    bootFailureTriggered = true
    void ipcRenderer.invoke('harness:open-recovery', errorText)
  }, BOOT_FAILURE_SETTLE_MS)
}

function checkBootFailureInDom(): void {
  const errorText = currentBootFailureText()
  if (!errorText) return
  queueBootFailure(errorText)
}

/**
 * Harness streams assistant output token by token, so the document-wide
 * observer fires tens of times a second on a conversation that can hold tens of
 * thousands of nodes. Coalescing every batch into one animation frame bounds
 * the work at 60Hz instead of per-mutation, and stops it entirely while the
 * window is hidden, since the browser withholds frames from background pages.
 */
const domObserver = new MutationObserver(scheduleDomSync)

function scheduleDomSync(): void {
  if (domSyncScheduled) return
  domSyncScheduled = true
  window.requestAnimationFrame(runDomSync)
}

function runDomSync(): void {
  domSyncScheduled = false
  sidebarRoot = liveElement(sidebarRoot, '[data-dsh-sidebar-root]')
  if (bootScanSettled) return
  // The boot screen only exists until Harness renders its own UI, and the
  // sidebar appearing is that moment. Past it the selector can never match
  // again, so scanning on would walk the conversation tree every frame for a
  // guaranteed miss. The window error handlers stay as the real backstop.
  if (sidebarRoot?.isConnected) {
    bootScanSettled = true
    startRendererHealthHeartbeat()
  } else checkBootFailureInDom()
}

contextBridge.exposeInMainWorld('dshDesktopDirectoryPicker', {
  pick: (): Promise<string | null> => ipcRenderer.invoke('directory-picker:open')
})

/**
 * `[data-dsh-*]` lookups are attribute selectors with no index behind them, so
 * a miss costs a full tree walk. Caching the nodes turns the steady state into
 * an `isConnected` flag read, and a re-render that detaches them re-queries.
 */
function liveElement<T extends Element>(cached: T | undefined, selector: string): T | undefined {
  if (cached?.isConnected) return cached
  return document.querySelector<T>(selector) ?? undefined
}

async function mountSafeModeBanner(): Promise<void> {
  if (location.protocol === 'file:' || document.getElementById(SAFE_MODE_BANNER_ID)) return
  try {
    const status = (await ipcRenderer.invoke('safe-mode:status')) as {
      active?: boolean
      locale?: 'en' | 'zh'
    }
    if (status.active !== true) return
    const safeModeLocale = status.locale === 'zh' ? 'zh' : 'en'

    const host = document.createElement('div')
    host.id = SAFE_MODE_BANNER_ID
    host.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:2147483645',
      'max-width:calc(100vw - 32px)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';')
    const shadow = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = `
      .bar { display:flex; align-items:center; gap:10px; min-height:42px; padding:5px 6px 5px 12px; border:1px solid rgba(120,120,125,.35); border-radius:14px; color:#27272a; background:rgba(255,255,255,.94); box-shadow:0 5px 18px rgba(0,0,0,.12); backdrop-filter:blur(12px); white-space:nowrap; }
      .dot { width:7px; height:7px; border-radius:50%; background:#d97706; }
      .copy { display:grid; gap:1px; min-width:0; }
      .title { font-size:12px; font-weight:700; }
      .description { max-width:390px; overflow:hidden; color:#71717a; font-size:10px; font-weight:500; text-overflow:ellipsis; }
      .actions { display:flex; align-items:center; gap:4px; }
      button { min-height:22px; padding:2px 8px; border:0; border-radius:999px; color:#3f3f46; background:#f1f1f3; cursor:pointer; font:inherit; font-size:11px; }
      button:hover { background:#e4e4e7; }
      button:disabled { opacity:.55; cursor:default; }
      @media (prefers-color-scheme:dark) { .bar { color:#f4f4f5; background:rgba(32,32,35,.94); border-color:rgba(180,180,190,.28); } .description { color:#a5a7ad; } button { color:#e4e4e7; background:#343438; } button:hover { background:#44444a; } }
      @media (max-width:760px) { .description { display:none; } }
    `
    const bar = document.createElement('div')
    bar.className = 'bar'
    const dot = document.createElement('span')
    dot.className = 'dot'
    const copy = document.createElement('span')
    copy.className = 'copy'
    const label = document.createElement('span')
    label.className = 'title'
    label.textContent = safeModeLocale === 'zh' ? '安全模式' : 'Safe Mode'
    const description = document.createElement('span')
    description.className = 'description'
    description.textContent = safeModeLocale === 'zh'
      ? '已暂时停用所有第三方插件，可卸载有问题的插件后重启。'
      : 'All third-party plugins are temporarily disabled. Remove a problematic plugin, then restart.'
    copy.append(label, description)
    const actions = document.createElement('span')
    actions.className = 'actions'
    const manage = document.createElement('button')
    manage.type = 'button'
    manage.textContent = safeModeLocale === 'zh' ? '卸载插件' : 'Remove plugins'
    manage.setAttribute('aria-label', safeModeLocale === 'zh' ? '卸载第三方插件' : 'Remove third-party plugins')
    manage.addEventListener('click', () => {
      void ipcRenderer.invoke('safe-mode:manage')
    })
    const exit = document.createElement('button')
    exit.type = 'button'
    exit.textContent = safeModeLocale === 'zh' ? '退出安全模式' : 'Exit Safe Mode'
    exit.setAttribute('aria-label', safeModeLocale === 'zh' ? '退出安全模式并重启' : 'Exit Safe Mode and restart')
    exit.addEventListener('click', () => {
      manage.disabled = true
      exit.disabled = true
      void ipcRenderer.invoke('safe-mode:exit').then((result) => {
        if (result?.blocked) {
          manage.disabled = false
          exit.disabled = false
        }
      }).catch(() => {
        manage.disabled = false
        exit.disabled = false
      })
    })
    actions.append(manage, exit)
    bar.append(dot, copy, actions)
    shadow.append(style, bar)
    document.documentElement.appendChild(host)
  } catch (error) {
    console.warn('[safe-mode] unable to mount status banner', error)
  }
}

function initializeUi(): void {
  mountAbout()
  checkBootFailureInDom()
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  })
  void mountSafeModeBanner()
}

window.addEventListener('error', (event) => {
  const err = event.error ?? event.message
  if (isPluginLoadError(err)) {
    const errorText = typeof err === 'string' ? err : err instanceof Error ? err.message : String(err)
    queueBootFailure(errorText)
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  if (isPluginLoadError(reason)) {
    const errorText = typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : String(reason)
    queueBootFailure(errorText)
  }
})

window.addEventListener('pagehide', () => {
  if (rendererHealthHeartbeat !== undefined) window.clearInterval(rendererHealthHeartbeat)
  rendererHealthHeartbeat = undefined
})

contextBridge.exposeInMainWorld(
  'dshDesktop',
  Object.freeze({
    restartHarness: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('harness:restart'),
    restartAsSafeMode: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('safe-mode:show'),
    uninstallMarket: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('market:uninstall'),
    openInFinder: (path: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('harness:open-in-finder', path),
    /** General-settings network-proxy preference (empty string = direct). */
    getProxyConfig: (): Promise<{ httpProxy: string }> => ipcRenderer.invoke('desktop-proxy:get'),
    setProxyConfig: (value: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('desktop-proxy:set', value),
    /** Desktop-notification preference and toast bridge (session-run edges). */
    getNotificationsEnabled: (): Promise<{ enabled: boolean }> =>
      ipcRenderer.invoke('desktop-notification:get'),
    setNotificationsEnabled: (enabled: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('desktop-notification:set', enabled),
    notifyRunEnded: (payload: { sessionId: string; title?: string }): Promise<{ shown: boolean }> =>
      ipcRenderer.invoke('desktop-notification:show', payload),
    /** Renderer platform, so shared UI can pick platform-correct wording. */
    platform: process.platform
  })
)

contextBridge.exposeInMainWorld(
  'dshRecovery',
  Object.freeze({
    action: (action: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('recovery:action', action)
  })
)

contextBridge.exposeInMainWorld(
  'dshWebImport',
  Object.freeze({
    action: (action: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('web-import:action', action)
  })
)

contextBridge.exposeInMainWorld(
  'dshSafeMode',
  Object.freeze({
    action: (
      action: string,
      selection: { plugins?: string[]; issues?: string[]; removalId?: string }
    ): Promise<{ ok: boolean }> => ipcRenderer.invoke('safe-mode:action', action, selection)
  })
)

function mountAbout(): void {
  if (document.getElementById(ABOUT_ROOT_ID)) return

  aboutHost = document.createElement('div')
  aboutHost.id = ABOUT_ROOT_ID
  aboutHost.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
  ].join(';')

  aboutShadow = aboutHost.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = aboutStyles
  aboutShadow.appendChild(style)
  document.documentElement.appendChild(aboutHost)
  renderAbout()
}

function renderAbout(): void {
  if (!aboutHost || !aboutShadow) return
  if (!aboutOpen || !aboutInfo) {
    aboutHost.style.display = 'none'
    const existing = aboutShadow.querySelector('.about-overlay')
    if (existing) existing.remove()
    return
  }

  aboutHost.style.display = 'flex'
  const info = aboutInfo
  const zh = info.locale === 'zh'

  let overlay = aboutShadow.querySelector('.about-overlay') as HTMLElement | null
  if (!overlay) {
    overlay = element('div', 'about-overlay')
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        aboutOpen = false
        renderAbout()
      }
    })
    aboutShadow.appendChild(overlay)
  }

  const card = element('div', 'about-card')
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-modal', 'true')
  card.setAttribute('aria-label', zh ? '关于 Casleo' : 'About Casleo')

  const header = element('div', 'about-header')
  const title = element('h2', 'about-title')
  title.textContent = zh ? '关于 Casleo' : 'About Casleo'
  header.appendChild(title)

  const closeBtn = button('×', 'about-close')
  closeBtn.setAttribute('aria-label', zh ? '关闭' : 'Close')
  closeBtn.addEventListener('click', () => {
    aboutOpen = false
    renderAbout()
  })
  header.appendChild(closeBtn)
  card.appendChild(header)

  const body = element('div', 'about-body')
  const line1 = element('p', 'about-line')
  line1.textContent = `${zh ? 'Casleo 版本： ' : 'Casleo version: '}${info.desktopVersion}`
  body.appendChild(line1)

  const line2 = element('p', 'about-line')
  line2.textContent = `${zh ? '内置 Harness 版本： ' : 'Bundled Harness version: '}${info.harnessVersion}`
  body.appendChild(line2)

  const hint = element('p', 'about-hint')
  hint.textContent = zh ? 'Harness 随 Casleo 一起提供。' : 'Harness ships with Casleo.'
  body.appendChild(hint)
  card.appendChild(body)

  overlay.replaceChildren(card)
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  return node
}

function button(label: string, className: string): HTMLButtonElement {
  const node = element('button', className)
  node.type = 'button'
  node.textContent = label
  return node
}

const aboutStyles = `
  :host { color-scheme: light dark; }
  * { box-sizing: border-box; }
  .about-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .about-card {
    position: relative;
    width: min(380px, calc(100vw - 40px));
    max-height: min(560px, calc(100vh - 60px));
    overflow-y: auto;
    color: var(--dsw-alias-label-primary, #202124);
    background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.98));
    border: 1px solid var(--dsw-alias-border-l2, rgba(32, 33, 36, 0.14));
    border-radius: 14px;
    padding: 18px 20px 20px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08);
  }
  .about-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .about-title {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    line-height: 20px;
    letter-spacing: -0.1px;
    color: var(--dsw-alias-label-primary, #202124);
  }
  .about-close {
    width: 26px;
    height: 26px;
    margin: -4px -6px 0 0;
    flex: none;
    color: var(--dsw-alias-label-secondary, #73777f);
    background: transparent;
    border: 0;
    border-radius: 7px;
    font-size: 20px;
    line-height: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .about-close:hover {
    color: var(--dsw-alias-label-primary, #202124);
    background: rgba(127, 127, 127, 0.12);
  }
  .about-body {
    font-size: 13px;
    line-height: 21px;
    color: var(--dsw-alias-label-primary, #202124);
  }
  .about-line {
    margin: 2px 0;
  }
  .about-hint {
    margin: 12px 0 0;
    color: var(--dsw-alias-label-secondary, #666b73);
    font-size: 12.5px;
  }
  @media (prefers-color-scheme: dark) {
    .about-card {
      color: var(--dsw-alias-label-primary, #f3f4f6);
      background: var(--dsw-alias-bg-layer-1, rgba(31, 32, 35, 0.98));
      border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5), 0 2px 10px rgba(0, 0, 0, 0.25);
    }
    .about-title, .about-body { color: var(--dsw-alias-label-primary, #f3f4f6); }
    .about-hint, .about-close { color: var(--dsw-alias-label-secondary, #a9adb5); }
    .about-close:hover { color: var(--dsw-alias-label-primary, #f3f4f6); background: rgba(255, 255, 255, 0.1); }
  }
`

ipcRenderer.on('desktop:show-about', (_event, info: AboutInfo) => {
  aboutInfo = info
  aboutOpen = true
  renderAbout()
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && aboutOpen) {
    aboutOpen = false
    renderAbout()
  }
})

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initializeUi, { once: true })
} else {
  initializeUi()
}
