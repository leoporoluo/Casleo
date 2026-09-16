import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { patchPath } from './patch-path'

const projectRoot = path.resolve(import.meta.dirname, '..')

const settingsGeneralClient = path.join(
  projectRoot,
  'node_modules',
  '@deepseek-ai',
  'dsh-client-ui-settings-general',
  'lib',
  'client.js'
)

const markers = [
  'function MarketGlyph({ className, size })',
  'id === "market"',
  'viewBox: "0 0 16 16"',
  'transform: "rotate(9 12.39 3.74)"'
]

const marketLogoSource = path.join(
  projectRoot,
  'node_modules',
  'dshmarket',
  'src',
  'client',
  'MarketSection.tsx'
)

describe('settings market nav icon patch', () => {
  it('installs the market block-grid glyph and keeps the gear fallback intact', async () => {
    const client = await readFile(settingsGeneralClient, 'utf8')

    for (const marker of markers) expect(client).toContain(marker)
    // The nav item shows the market's own brand mark, not a redrawn stand-in.
    expect(client).not.toContain('M3.6 5.5h8.8')
    const navGlyph = client.slice(
      client.indexOf('function MarketGlyph'),
      client.indexOf('function navIcon')
    )
    const marketSource = await readFile(marketLogoSource, 'utf8')
    const logoBlock = marketSource.slice(
      marketSource.indexOf('function MarketLogo'),
      marketSource.indexOf('function MarketLogo') + 2_000
    )
    const cells = [...logoBlock.matchAll(/x="([\d.]+)" y="([\d.]+)" width="3\.3" height="3\.3" rx="0\.53"/gu)]
    expect(cells.length).toBe(9)
    for (const [, x, y] of cells) {
      expect(navGlyph).toContain(`x: "${x}"`)
      expect(navGlyph).toContain(`y: "${y}"`)
    }
    // The stock fallback stays the last branch for every unregistered section.
    expect(client.indexOf('id === "market"')).toBeLessThan(
      client.indexOf('IconSettingsOutline16', client.indexOf('function navIcon'))
    )
    expect(client).toContain('function navIcon(id)')
  })

  it('captures the market glyph as a reproducible dependency patch', async () => {
    const patch = await readFile(
      patchPath('@deepseek-ai/dsh-client-ui-settings-general'),
      'utf8'
    )

    for (const marker of markers) expect(patch).toContain(marker)
  })
})
