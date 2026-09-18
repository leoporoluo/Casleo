import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..')

interface Registration {
  config: { name: string; id?: string; order?: number }
  component: (props: Record<string, unknown>) => unknown
}

/** Load the client module under a controllable window/document sandbox. */
async function loadClientPlugin(windowOverrides: Record<string, unknown>): Promise<{
  apply: (ctx: unknown) => unknown
  inject: string[]
}> {
  const source = await readFile(
    path.join(projectRoot, 'packages', 'dsh-desktop-client-ui', 'client.js'),
    'utf8'
  )
  let definition: {
    factory: (require: (id: string) => unknown) => {
      apply: (ctx: unknown) => unknown
      inject: string[]
    }
  } | undefined
  const sandbox: Record<string, unknown> = {
    document: {
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => ({ id: '', dataset: {}, textContent: '' })),
      head: { appendChild: () => undefined },
      querySelector: vi.fn(() => null)
    },
    navigator: { language: 'en-US' },
    window: {
      __ModuleLoader__: {
        load: (value: unknown) => {
          definition = value as never
        }
      },
      ...windowOverrides
    }
  }
  vm.runInNewContext(source, sandbox)
  if (!definition) throw new Error('The client module did not register itself')
  const createElement = (
    type: unknown,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): { type: unknown; props: Record<string, unknown> } => ({
    type,
    props: { ...props, children }
  })
  return definition.factory((id) => {
    if (id === 'react') {
      return {
        createElement,
        useEffect: (effect: () => void | (() => void)) => effect(),
        useState: (initial: unknown) => [initial, vi.fn()]
      }
    }
    throw new Error(`Unexpected client dependency: ${id}`)
  }) as never
}

function makeSlots(): { slots: unknown; registrations: Registration[] } {
  const registrations: Registration[] = []
  const slots = {
    inject: (_name: string, callback: () => unknown): unknown => {
      const result = callback()
      if (result && typeof result === 'object' && Symbol.iterator in result) {
        for (const _entry of result as Iterable<unknown>) void _entry
      }
      return result
    },
    register: (
      config: Registration['config'],
      component: Registration['component']
    ): (() => void) => {
      registrations.push({ config, component })
      return () => undefined
    }
  }
  return { slots, registrations }
}

describe('Casleo client slot occupants', () => {
  it('registers the rail mark and the wordmark, and injects nothing else', async () => {
    const plugin = await loadClientPlugin({})
    const { slots, registrations } = makeSlots()

    plugin.apply({ slots })

    expect(plugin.inject).toEqual(['slots'])
    expect(registrations.map(({ config }) => config.name)).toEqual([
      'sidebar.brand.mark',
      'sidebar.brand.name'
    ])

    const sidebarName = registrations.find(
      ({ config }) => config.name === 'sidebar.brand.name'
    )!.component({}) as { type: unknown; props: Record<string, unknown> }
    expect(sidebarName.type).toBe('span')
    expect(sidebarName.props.children).toEqual(['Casleo'])

    const sidebarMark = registrations.find(
      ({ config }) => config.name === 'sidebar.brand.mark'
    )!.component({ size: 24 }) as { type: unknown; props: Record<string, unknown> }
    expect(sidebarMark.type).toBe('svg')
    expect(sidebarMark.props.height).toBe(24)
    expect(sidebarMark.props.width).toBe(21)
    const [markPath] = sidebarMark.props.children as Array<{ type: unknown; props: Record<string, unknown> }>
    if (!markPath) throw new Error('Expected the sidebar brand SVG path')
    expect(markPath.type).toBe('path')
    expect(markPath.props.fill).toBe('currentColor')
    expect(String(markPath.props.d)).toContain('M500 219L750 625L500 797L250 625Z')
  })

  it('stays out of the settings page and the desktop bridge', async () => {
    // The General page, the locale dictionaries and the session store all
    // belong to the shell now: the plugin owns two sidebar seats and nothing
    // else, so a future bridge change cannot leave a stale row behind.
    const source = await readFile(
      path.join(projectRoot, 'packages', 'dsh-desktop-client-ui', 'client.js'),
      'utf8'
    )

    expect(source).not.toContain('settings.general.item')
    expect(source).not.toContain('dshDesktop')
    expect(source).not.toContain('locale.register')
    expect(source).not.toContain('sessions')

    // ...and the plugin applies without any of those services present.
    const plugin = await loadClientPlugin({})
    const { slots, registrations } = makeSlots()
    plugin.apply({ slots })
    expect(registrations.map(({ config }) => config.id).filter(Boolean)).toEqual([])
  })
})
