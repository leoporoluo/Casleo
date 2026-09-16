import { pathToFileURL } from 'node:url'
import { it, expect } from 'vitest'
import { attachHiddenConsole } from '../src/main/runtime/hidden-console'

const RESOURCE = 'C:\\Program Files\\Casleo\\resources\\windows-hidden-console.mjs'

it('does nothing outside Windows', async () => {
  let imported = false
  const outcome = await attachHiddenConsole({
    resourcePath: RESOURCE,
    platform: 'darwin',
    importModule: async () => {
      imported = true
      return { createHiddenConsole: () => true }
    }
  })

  expect(outcome).toEqual({ attached: false })
  expect(imported).toBe(false)
})

it('attaches the hidden console exported by the shipped helper', async () => {
  const seen: string[] = []
  const outcome = await attachHiddenConsole({
    resourcePath: RESOURCE,
    platform: 'win32',
    importModule: async (url) => {
      seen.push(url)
      return { createHiddenConsole: () => true }
    }
  })

  expect(outcome).toEqual({ attached: true })
  expect(seen).toEqual([pathToFileURL(RESOURCE).href])
})

it('reports a helper that could not attach a console', async () => {
  const outcome = await attachHiddenConsole({
    resourcePath: RESOURCE,
    platform: 'win32',
    importModule: async () => ({ createHiddenConsole: () => false })
  })

  expect(outcome.attached).toBe(false)
  expect(outcome.detail).toContain('AllocConsole')
})

it('stays best-effort when the helper is missing or cannot load its binding', async () => {
  const missing = await attachHiddenConsole({
    resourcePath: RESOURCE,
    platform: 'win32',
    importModule: async () => ({})
  })
  expect(missing.attached).toBe(false)
  expect(missing.detail).toContain('createHiddenConsole')

  const failed = await attachHiddenConsole({
    resourcePath: RESOURCE,
    platform: 'win32',
    importModule: async () => {
      throw new Error('Cannot find module koffi')
    }
  })
  expect(failed.attached).toBe(false)
  expect(failed.detail).toContain('koffi')
})
