import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { patchPath } from './patch-path'

const projectRoot = path.resolve(import.meta.dirname, '..')

describe('Casleo sidebar branding', () => {
  it('matches the native window surface to the initial Harness theme', async () => {
    const main = await readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8')

    expect(main).toContain("frame: process.platform !== 'darwin'")
    expect(main).toContain("document.body.hasAttribute('data-ds-dark-theme')")
    // The reveal background matches the window creation background so a page
    // transition cannot paint a mismatched frame.
    expect(main).toContain("window.setBackgroundColor(isDark ? '#141416' : '#f8f8f6')")
    expect(main).toContain('window.setWindowButtonVisibility(true)')
    expect(main).toContain('x: Math.round(16 * window.webContents.getZoomFactor()) - 2')
    expect(main).toContain("titleBarStyle: 'hidden' as const")
    expect(main).not.toContain('dsh-desktop-titlebar-style')
    expect(main).not.toContain('--dsh-desktop-titlebar-height')
    expect(main).not.toContain('body { box-sizing: border-box; padding-top:')
    expect(main).toContain("dragRegion.id = 'dsh-desktop-drag-region'")
    expect(main).toContain("dragRegion.style.setProperty('-webkit-app-region', 'drag')")
    expect(main).toContain("left: '80px'")
    expect(main).toContain("right: '220px'")
    expect(main).toContain("height: '24px'")
  })

  it('shows the wordmark in the wide sidebar, keeps the rail mark, and draws the compose glyph', async () => {
    const [patch, client, composition, installedSidebar] = await Promise.all([
      readFile(patchPath('@deepseek-ai/dsh-client-ui-sidebar'), 'utf8'),
      readFile(path.join(projectRoot, 'packages', 'dsh-desktop-client-ui', 'client.js'), 'utf8'),
      readFile(path.join(projectRoot, 'build', 'dsh-desktop.patch.yml'), 'utf8'),
      readFile(
        path.join(
          projectRoot,
          'node_modules',
          '@deepseek-ai',
          'dsh-client-ui-sidebar',
          'lib',
          'client.js'
        ),
        'utf8'
      )
    ])

    expect(client).toContain("ctx.slots.inject('sidebar.brand.mark'")
    expect(client).toContain("ctx.slots.inject('sidebar.brand.name'")
    expect(client).not.toContain("ctx.slots.inject('conversation.hero.brand.mark'")
    expect(client).toContain("'Casleo'")
    expect(client).toContain('const BRAND_MARK_PATH = "M500 219L750 625L500 797L250 625Z')
    expect(client).toContain("React.createElement('path', { d: BRAND_MARK_PATH, fill: 'currentColor' })")
    expect(client).not.toContain('BrandWordmark')
    expect(client).not.toContain('FishLogo')
    const normalizedComposition = composition.replaceAll('\r\n', '\n')
    expect(normalizedComposition).toMatch(/- id: ui-brand-official\n  disabled: true/u)
    expect(normalizedComposition).toMatch(
      /- id: dsh-desktop-client-ui\n      name: dsh-desktop-client-ui/u
    )

    expect(patch).not.toContain('DshDesktopLogo')
    expect(patch).not.toContain('DshDesktopBrand')
    expect(patch).not.toContain('brandWordmark')
    expect(patch).toContain('[data-dsh-sidebar-root]')
    expect(patch).toContain('padding-top:32px')
    expect(patch).toContain('navigator.userAgent.includes("Macintosh")')
    expect(patch).toContain('padding-top:28px')
    expect(patch).toContain('padding:32px 22px 6px')
    // The wide row shows the wordmark only; the mark remains the collapsed
    // rail's toggle glyph.
    expect(patch).toContain('[data-dsh-sidebar-brand-identity]{flex:1;min-width:0}')
    expect(installedSidebar).toContain('data-dsh-sidebar-brand-identity')
    expect(installedSidebar).toContain('renderSlot("sidebar.brand.mark"')
    expect(installedSidebar).toContain('renderSlot("sidebar.brand.name"')
    expect(installedSidebar).not.toContain('DshDesktopBrand')
    expect(installedSidebar).not.toContain('brandWordmark')
    // The new-session glyph is the local compose mark, not the stock chat icon.
    expect(patch).toContain('function ComposeIcon')
    expect(installedSidebar).toContain('(0, react_jsx_runtime.jsx)(ComposeIcon, { size: wide ? 14 : 18 })')
    expect(installedSidebar).not.toContain('IconNewChatOutline16, { size: wide ? 14 : 18 }')
  })

  it('leaves no hero headline block in the conversation shell', async () => {
    const [patch, installed] = await Promise.all([
      readFile(patchPath('@deepseek-ai/dsh-client-ui-conversation'), 'utf8'),
      readFile(
        path.join(
          projectRoot,
          'node_modules',
          '@deepseek-ai',
          'dsh-client-ui-conversation',
          'lib',
          'client.js'
        ),
        'utf8'
      )
    ])

    expect(patch).toContain('HeroShell_module_css_default.headline')
    const heroShell = installed.slice(
      installed.indexOf('function HeroShell'),
      installed.indexOf('function HeroShell') + 600
    )
    expect(heroShell).toContain('className: HeroShell_module_css_default.body')
    expect(heroShell).not.toContain('HeroShell_module_css_default.headline')
    expect(heroShell).not.toContain('hero.headline')
    expect(heroShell).not.toContain('conversation.hero.brand.mark')
  })

  it('uses an 80px macOS rail that clears the traffic lights', async () => {
    const patch = await readFile(
      patchPath('@deepseek-ai/dsh-client-ui-layout'),
      'utf8'
    )

    expect(patch).toContain('navigator.userAgent.includes("Macintosh") ? 80 : 56')
    expect(patch).toContain('sidebar === 0 ? COLLAPSED_SIDEBAR_WIDTH')
  })

  it('left no phone pairing entry anywhere in the shell', async () => {
    const [patch, preload, main, menu, commands, client] = await Promise.all([
      readFile(patchPath('@deepseek-ai/dsh-client-ui-sidebar'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'preload', 'index.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'preload', 'windows-menu.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'shared', 'desktop-menu.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'packages', 'dsh-desktop-client-ui', 'client.js'), 'utf8')
    ])

    expect(patch).toContain('data-dsh-sidebar-root')
    expect(patch).toContain('data-dsh-sidebar-wide')
    expect(patch).not.toContain('data-dsh-sidebar-footer')
    expect(patch).toContain('data-dsh-sidebar-settings')
    expect(client).not.toContain("ctx.slots.inject('sidebar.footer.action'")
    expect(preload).not.toContain('mobileButton')
    expect(preload).not.toContain('mobile:open-pairing')
    expect(preload).not.toContain('mobile:status-changed')
    expect(main).not.toContain('mobileBridge')
    expect(main).not.toContain('mobileWindow')
    expect(menu).not.toContain('connect-phone')
    expect(commands).not.toContain('connect-phone')
  })

  it('installs the source logo into the Harness static frontend', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, 'package.json'), 'utf8')
    ) as { scripts: { postinstall: string } }
    const installer = await readFile(
      path.join(projectRoot, 'scripts', 'install-brand-assets.mjs'),
      'utf8'
    )

    expect(packageJson.scripts.postinstall).toContain('node scripts/install-brand-assets.mjs')
    expect(installer).toContain("'build', 'icon.png'")
    expect(installer).toContain("'casleo-logo.png'")
    expect(installer).toContain('<link rel="icon" type="image/png" href="/casleo-logo.png" />')
    // The manifest is edited as JSON now rather than as a pinned multi-line
    // string: 0.1.2-alpha.1 added "purpose": "any" to the icon entry, which no
    // fixed text could survive, and key order is not a contract.
    expect(installer).toContain("target.src = '/casleo-logo.png'")
    expect(installer).toContain("target.sizes = '256x256'")
  })
})
