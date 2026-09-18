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

    //#region General Settings: network-proxy row (desktop only)
    /** Locale namespace owned by the desktop proxy row. */
    const PROXY_LOCALE_NS = 'dsh-desktop-proxy'

    const PROXY_ROW_CSS =
      '.casleoProxyRow_row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}' +
      '.casleoProxyRow_rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}' +
      '.casleoProxyRow_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}' +
      '.casleoProxyRow_desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}' +
      '.casleoProxyRow_control{flex-direction:column;flex:none;gap:8px;width:300px;display:flex}' +
      '.casleoProxyRow_input{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;border:none;border-radius:18px;outline:none;box-sizing:border-box;padding:0 14px;font-size:14px;line-height:22px;width:100%}' +
      '.casleoProxyRow_input::placeholder{color:var(--dsw-alias-label-caption)}' +
      '.casleoProxyRow_input:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}' +
      '.casleoProxyRow_statusRow{align-items:center;gap:10px;min-height:24px;display:flex}' +
      '.casleoProxyRow_status{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.casleoProxyRow_status[data-kind="error"]{color:var(--dsw-alias-state-error-primary)}' +
      '.casleoProxyRow_status[data-kind="saved"]{color:var(--dsw-alias-state-success-primary)}'

    const PROXY_CSS_TAG_ID = 'dsh-desktop-client-ui/ProxyRow.module.css'

    function installProxyRowStyle() {
      if (typeof document === 'undefined') return
      if (document.querySelector(`style[data-plugin-css="${PROXY_CSS_TAG_ID}"]`) !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-desktop-client-ui'
      tag.dataset.pluginCss = PROXY_CSS_TAG_ID
      tag.textContent = PROXY_ROW_CSS
      document.head.appendChild(tag)
    }

    const PROXY_LOCALE = {
      zh: {
        'proxy.title': '网络代理',
        'proxy.description': '模型与联网请求将使用此代理；留空则直连。保存后重启 Casleo 生效。',
        'proxy.placeholder': 'http://192.168.0.105:7890',
        'proxy.save': '保存',
        'proxy.saving': '保存中…',
        'proxy.saved': '已保存，重启 Casleo 后生效',
        'proxy.empty': '当前直连'
      },
      en: {
        'proxy.title': 'Network proxy',
        'proxy.description': 'Model and web requests use this proxy; leave empty for a direct connection. Restart Casleo to apply.',
        'proxy.placeholder': 'http://192.168.0.105:7890',
        'proxy.save': 'Save',
        'proxy.saving': 'Saving…',
        'proxy.saved': 'Saved — restart Casleo to apply',
        'proxy.empty': 'Direct connection'
      }
    }

    function ProxyRow({ t }) {
      const bridge = typeof window !== 'undefined' ? window.dshDesktop : undefined
      const [value, setValue] = React.useState('')
      const [loaded, setLoaded] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [savedAt, setSavedAt] = React.useState(0)
      const [error, setError] = React.useState(null)

      React.useEffect(() => {
        let cancelled = false
        if (typeof bridge?.getProxyConfig !== 'function') return undefined
        bridge.getProxyConfig().then((config) => {
          if (cancelled) return
          setValue(typeof config?.httpProxy === 'string' ? config.httpProxy : '')
          setLoaded(true)
        }).catch(() => {
          if (!cancelled) setLoaded(true)
        })
        return () => {
          cancelled = true
        }
      }, [])

      const save = () => {
        if (saving) return
        setSaving(true)
        setError(null)
        bridge.setProxyConfig(value).then(() => {
          setSaving(false)
          setSavedAt(Date.now())
          window.setTimeout(() => setSavedAt(0), 4000)
        }).catch((reason) => {
          setSaving(false)
          setError(reason instanceof Error ? reason.message : String(reason))
        })
      }

      const statusKind = error !== null ? 'error' : savedAt !== 0 ? 'saved' : 'idle'
      const statusText = error !== null
        ? error
        : savedAt !== 0
          ? t('proxy.saved')
          : value.trim() === '' ? t('proxy.empty') : ''

      return ReactJSXRuntime.jsx('div', {
        className: 'casleoProxyRow_row',
        children: [
          ReactJSXRuntime.jsxs('div', {
            className: 'casleoProxyRow_rowText',
            children: [
              ReactJSXRuntime.jsx('div', { className: 'casleoProxyRow_title', children: t('proxy.title') }),
              ReactJSXRuntime.jsx('div', { className: 'casleoProxyRow_desc', children: t('proxy.description') })
            ]
          }),
          ReactJSXRuntime.jsxs('div', {
            className: 'casleoProxyRow_control',
            children: [
              ReactJSXRuntime.jsx('input', {
                className: 'casleoProxyRow_input',
                type: 'text',
                value,
                spellCheck: false,
                disabled: !loaded,
                placeholder: t('proxy.placeholder'),
                'aria-label': t('proxy.title'),
                onChange: (event) => {
                  setValue(event.target.value)
                  setError(null)
                },
                onKeyDown: (event) => {
                  if (event.key === 'Enter') save()
                }
              }),
              ReactJSXRuntime.jsxs('div', {
                className: 'casleoProxyRow_statusRow',
                children: [
                  ReactJSXRuntime.jsx(primitives.Button, {
                    variant: 'primary',
                    size: 'sm',
                    disabled: !loaded || saving,
                    onClick: save,
                    children: t(saving ? 'proxy.saving' : 'proxy.save')
                  }),
                  statusText === '' ? null : ReactJSXRuntime.jsx('span', {
                    className: 'casleoProxyRow_status',
                    'data-kind': statusKind,
                    role: error !== null ? 'alert' : undefined,
                    children: statusText
                  })
                ]
              })
            ]
          })
        ]
      })
    }
    //#endregion

    const inject = ['slots', 'locale']
    function apply(ctx) {
      // The brand seats keep their own injection; the proxy row is separate so
      // the two features never share a disposer chain.
      ctx.slots.inject('sidebar.brand.mark', () =>
        ctx.slots.inject('sidebar.brand.name', function* () {
          yield ctx.slots.register({ name: 'sidebar.brand.mark' }, CasleoMark)
          yield ctx.slots.register({ name: 'sidebar.brand.name' }, DesktopBrandName)
        })
      )
      // The proxy row only renders inside the desktop shell, where the preload
      // bridge exists; a plain web harness gets no row and no CSS.
      if (typeof window === 'undefined' || typeof window.dshDesktop?.getProxyConfig !== 'function') return
      ctx.effect(
        () => ctx.locale.register(PROXY_LOCALE_NS, PROXY_LOCALE),
        'dsh-desktop-proxy: dictionaries'
      )
      installProxyRowStyle()
      ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item',
        id: 'casleo-proxy',
        order: 90,
        locale: PROXY_LOCALE_NS,
        inject: () => ({})
      }, ProxyRow))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
