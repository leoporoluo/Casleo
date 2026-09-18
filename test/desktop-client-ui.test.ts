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
  const jsx = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) =>
    ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } })
  return definition.factory((id) => {
    if (id === 'react') {
      return {
        createElement,
        useEffect: (effect: () => void | (() => void)) => effect(),
        useState: (initial: unknown) => [initial, vi.fn()]
      }
    }
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') {
      return { Button: ({ children }: { children?: unknown }) => children }
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
  it('registers the rail mark and the wordmark', async () => {
    const plugin = await loadClientPlugin({})
    const { slots, registrations } = makeSlots()

    plugin.apply({ slots })

    expect(plugin.inject).toEqual(['slots', 'locale'])
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

  it('offers the proxy row only where the desktop bridge exists', async () => {
    const bridgeless = await loadClientPlugin({})
    const { slots: bridgelessSlots, registrations: bridgelessRows } = makeSlots()
    bridgeless.apply({ slots: bridgelessSlots })
    expect(bridgelessRows.map(({ config }) => config.name)).not.toContain('settings.general.item')

    const plugin = await loadClientPlugin({
      dshDesktop: {
        getProxyConfig: vi.fn(async () => ({ httpProxy: 'http://192.168.0.105:7890' })),
        setProxyConfig: vi.fn(async () => ({ ok: true }))
      }
    })
    const { slots, registrations } = makeSlots()
    plugin.apply({
      slots,
      locale: { register: vi.fn() },
      effect: (_fn: () => void, _label: string) => undefined
    })

    const proxy = registrations.find(({ config }) => config.id === 'casleo-proxy')
    expect(proxy).toBeDefined()
    expect(proxy!.config.name).toBe('settings.general.item')
    expect(proxy!.config.order).toBe(90)
  })
})
