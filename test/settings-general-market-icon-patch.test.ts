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
  'M3.6 5.5h8.8l-.7 8H4.3l-.7-8Z',
  'M6 5.5V4.2a2 2 0 0 1 4 0v1.3',
  'M8 8L10.2 11.4H5.8L8 8Z'
]

describe('settings market nav icon patch', () => {
  it('installs the Casleo market glyph and keeps the gear fallback intact', async () => {
    const client = await readFile(settingsGeneralClient, 'utf8')

    for (const marker of markers) expect(client).toContain(marker)
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
