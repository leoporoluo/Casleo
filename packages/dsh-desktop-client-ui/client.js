window.__ModuleLoader__.load({
  id: 'dsh-desktop-client-ui',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const ReactJSXRuntime = require('react/jsx-runtime')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')

    // Tight bounds of the mark inside its 1000x1000 source artwork.
    const BRAND_MARK_VIEWBOX = { x: 250, y: 219, width: 500, height: 578 }
    // Casleo mark: a notched delta ring, drawn in currentColor so it follows
    // the sidebar text color in both themes. The wide sidebar shows only the
    // wordmark; this mark renders in the collapsed rail's toggle button.
    const BRAND_MARK_PATH = "M500 219L750 625L500 797L250 625ZM500 330L365 609L500 690L635 609Z"

    function CasleoMark(props) {
      const size = props && typeof props.size === 'number' ? props.size : 17
      const height = size
      return React.createElement(
        'svg',
        {
          width: Math.round((height * BRAND_MARK_VIEWBOX.width) / BRAND_MARK_VIEWBOX.height),
          height,
          viewBox: `${BRAND_MARK_VIEWBOX.x} ${BRAND_MARK_VIEWBOX.y} ${BRAND_MARK_VIEWBOX.width} ${BRAND_MARK_VIEWBOX.height}`,
          fill: 'none',
          'aria-hidden': 'true'
        },
        React.createElement('path', { d: BRAND_MARK_PATH, fill: 'currentColor' })
      )
    }

    function DesktopBrandName() {
      return React.createElement(
        'span',
        {
          style: {
            fontSize: '17px',
            fontWeight: 650,
            letterSpacing: '-0.02em',
            lineHeight: 1
          }
        },
        'Casleo'
      )
    }

    //#region General Settings: desktop-only rows
    /** Locale namespace owned by the desktop-only settings rows. */
    const ROW_LOCALE_NS = 'dsh-desktop-settings-rows'

    const ROW_CSS =
      '.casleoSettingRow_row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}' +
      '.casleoSettingRow_rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}' +
      '.casleoSettingRow_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}' +
      '.casleoSettingRow_desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}' +
      '.casleoSettingRow_statusRow{align-items:center;gap:10px;min-height:24px;display:flex}'

    const ROW_CSS_TAG_ID = 'dsh-desktop-client-ui/SettingsRow.module.css'

    function installRowStyle() {
      if (typeof document === 'undefined') return
      if (document.querySelector(`style[data-plugin-css="${ROW_CSS_TAG_ID}"]`) !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-desktop-client-ui'
      tag.dataset.pluginCss = ROW_CSS_TAG_ID
      tag.textContent = ROW_CSS
      document.head.appendChild(tag)
    }

    const ROW_LOCALE = {
      zh: {
        'notify.title': '桌面通知',
        'notify.description': '任务结束（完成或失败）且窗口不在前台时，弹系统通知；点击通知回到窗口。'
      },
      en: {
        'notify.title': 'Desktop notifications',
        'notify.description': 'When a run ends (done or failed) while the window is not focused, show a system notification; clicking it returns to the window.'
      }
    }

    //#endregion

    /** Desktop-notification row: one switch; the desktop owns the focus check. */
    function NotificationsRow({ t }) {
      const bridge = typeof window !== 'undefined' ? window.dshDesktop : undefined
      const [enabled, setEnabled] = React.useState(false)
      const [loaded, setLoaded] = React.useState(false)
      React.useEffect(() => {
        let cancelled = false
        bridge.getNotificationsEnabled?.().then((config) => {
          if (cancelled) return
          setEnabled(config?.enabled !== false)
          setLoaded(true)
        }).catch(() => {
          if (!cancelled) setLoaded(true)
        })
        return () => {
          cancelled = true
        }
      }, [])
      const toggle = (next) => {
        setEnabled(next)
        bridge.setNotificationsEnabled?.(next)
      }
      return ReactJSXRuntime.jsx('div', {
        className: 'casleoSettingRow_row',
        children: [
          ReactJSXRuntime.jsxs('div', {
            className: 'casleoSettingRow_rowText',
            children: [
              ReactJSXRuntime.jsx('div', { className: 'casleoSettingRow_title', children: t('notify.title') }),
              ReactJSXRuntime.jsx('div', { className: 'casleoSettingRow_desc', children: t('notify.description') })
            ]
          }),
          ReactJSXRuntime.jsx('div', {
            className: 'casleoSettingRow_statusRow',
            children: ReactJSXRuntime.jsx(primitives.Switch, {
              checked: enabled,
              disabled: !loaded,
              label: t('notify.title'),
              onChange: toggle
            })
          })
        ]
      })
    }

    /**
     * Report one session-run edge to the desktop. The list store's running bit
     * is the same edge the sidebar's green reminder uses; outcome is not
     * carried by the summary, so the toast says "run ended" for both results.
     * The desktop still owns the toggle and the focus check, so this stays a
     * cheap no-op for anyone who turned notifications off.
     */
    function installRunEndedNotifications(ctx, bridge) {
      if (typeof ctx.get !== 'function') return
      const sessions = ctx.get('sessions')
      if (typeof sessions?.list?.subscribe !== 'function') return
      const prevRunning = new Map()
      ctx.effect(
        () => sessions.list.subscribe(() => {
          const snapshot = sessions.list.getSnapshot()
          for (const item of snapshot.items ?? []) {
            const id = item.sessionId
            const prev = prevRunning.get(id)
            if (prev === undefined) {
              prevRunning.set(id, item.running === true)
              continue
            }
            if (prev === true && item.running !== true) {
              bridge.notifyRunEnded({ sessionId: String(id), title: item.title })
            }
            prevRunning.set(id, item.running === true)
          }
        }),
        'dsh-desktop-notifications: run edges'
      )
    }

    const inject = ['slots', 'locale', 'sessions']
    function apply(ctx) {
      // The brand seats keep their own injection; the settings rows are separate
      // so the two features never share a disposer chain.
      ctx.slots.inject('sidebar.brand.mark', () =>
        ctx.slots.inject('sidebar.brand.name', function* () {
          yield ctx.slots.register({ name: 'sidebar.brand.mark' }, CasleoMark)
          yield ctx.slots.register({ name: 'sidebar.brand.name' }, DesktopBrandName)
        })
      )
      // The desktop rows only render inside the desktop shell, where the preload
      // bridge exists; a plain web harness gets no row and no CSS.
      if (typeof window === 'undefined' || typeof window.dshDesktop?.getNotificationsEnabled !== 'function') return
      const bridge = window.dshDesktop
      ctx.effect(
        () => ctx.locale.register(ROW_LOCALE_NS, ROW_LOCALE),
        'dsh-desktop-settings-rows: dictionaries'
      )
      installRowStyle()
      ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item',
        id: 'casleo-notifications',
        order: 92,
        locale: ROW_LOCALE_NS,
        inject: () => ({})
      }, NotificationsRow))
      installRunEndedNotifications(ctx, bridge)
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
