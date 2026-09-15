window.__ModuleLoader__.load({
  id: 'dsh-desktop-client-ui',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

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

    const inject = ['slots']
    function apply(ctx) {
      ctx.slots.inject('sidebar.brand.mark', () =>
        ctx.slots.inject('sidebar.brand.name', function* () {
          yield ctx.slots.register({ name: 'sidebar.brand.mark' }, CasleoMark)
          yield ctx.slots.register({ name: 'sidebar.brand.name' }, DesktopBrandName)
        })
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
