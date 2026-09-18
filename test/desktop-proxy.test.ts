import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseSystemProxy,
  proxyConfigPath,
  readProxyConfig,
  validateProxyUrl,
  writeProxyConfig
} from '../src/main/state/desktop-proxy'
import { buildHarnessSpawnOptions } from '../src/main/runtime/harness-runtime'

const projectRoot = path.resolve(import.meta.dirname, '..')

describe('desktop proxy preference', () => {
  it('accepts only http(s) proxy URLs, and empty means direct', () => {
    expect(validateProxyUrl('')).toBeNull()
    expect(validateProxyUrl('   ')).toBeNull()
    expect(validateProxyUrl('http://192.168.0.105:7890')).toBeNull()
    expect(validateProxyUrl('https://proxy.example.com:8443')).toBeNull()
    expect(validateProxyUrl('  http://127.0.0.1:7890  ')).toBeNull()

    expect(validateProxyUrl('socks5://127.0.0.1:7890')).toMatch(/http/)
    expect(validateProxyUrl('192.168.0.105:7890')).toMatch(/http/)
    expect(validateProxyUrl('http://a b')).toMatch(/空白|whitespace|http/u)
    expect(validateProxyUrl('http://' + 'a'.repeat(2100))).toMatch(/过长|http/u)
    expect(validateProxyUrl(42)).not.toBeNull()
  })

  it('persists the value atomically and survives a corrupt file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'casleo-proxy-'))
    try {
      const file = proxyConfigPath(dir)
      expect(readProxyConfig(file)).toEqual({ httpProxy: '' })

      writeProxyConfig(file, { httpProxy: 'http://192.168.0.105:7890' })
      expect(await readFile(file, 'utf8')).toContain('192.168.0.105:7890')
      expect(readProxyConfig(file)).toEqual({ httpProxy: 'http://192.168.0.105:7890' })

      writeProxyConfig(file, { httpProxy: '' })
      expect(readProxyConfig(file)).toEqual({ httpProxy: '' })

      await writeFile(file, 'not json', 'utf8')
      expect(readProxyConfig(file)).toEqual({ httpProxy: '' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('injects the proxy into the harness spawn environment in both casings', () => {
    const options = buildHarnessSpawnOptions(
      '/launch-root',
      '/harness',
      'win32',
      { Path: 'C:\\bin', NO_PROXY: 'internal.corp' },
      ' http://192.168.0.105:7890 '
    )
    const env = options.env ?? {}
    expect(env.HTTP_PROXY).toBe('http://192.168.0.105:7890')
    expect(env.HTTPS_PROXY).toBe('http://192.168.0.105:7890')
    expect(env.http_proxy).toBe('http://192.168.0.105:7890')
    expect(env.https_proxy).toBe('http://192.168.0.105:7890')
    // The user's own bypass entries survive; the loopback is always appended
    // so the desktop's internal endpoint can never be proxied.
    expect(env.NO_PROXY).toContain('internal.corp')
    expect(env.NO_PROXY).toContain('127.0.0.1')
    expect(env.NO_PROXY).toContain('localhost')
    expect(env.no_proxy).toBe(env.NO_PROXY)
    expect(env.DSH_HOME).toBe('/harness')
  })

  it('adds no proxy variables and keeps user environment untouched when unset', () => {
    const ownProxy = 'http://user-own:7890'
    const options = buildHarnessSpawnOptions(
      '/launch-root',
      '/harness',
      'win32',
      { Path: 'C:\\bin', HTTP_PROXY: ownProxy, NO_PROXY: 'corp.local' },
      undefined
    )
    const env = options.env ?? {}
    expect(env.HTTP_PROXY).toBe(ownProxy)
    expect(env.NO_PROXY).toBe('corp.local')
    expect(env.https_proxy).toBeUndefined()
  })

  it('prefills the field from the Windows system proxy', () => {
    expect(parseSystemProxy('PROXY 192.168.0.105:7890')).toBe('http://192.168.0.105:7890')
    expect(parseSystemProxy('proxy 127.0.0.1:7890; DIRECT')).toBe('http://127.0.0.1:7890')
    expect(parseSystemProxy('HTTPS secure.example.com:8443')).toBe('https://secure.example.com:8443')
    // SOCKS cannot serve the Harness fetch path; DIRECT has nothing to prefill.
    expect(parseSystemProxy('SOCKS5 127.0.0.1:7890')).toBe('')
    expect(parseSystemProxy('DIRECT')).toBe('')
    expect(parseSystemProxy('')).toBe('')
  })

  it('wires the preference through the desktop surface', async () => {
    const [main, preload, runtime] = await Promise.all([
      readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'preload', 'index.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'main', 'runtime', 'harness-runtime.ts'), 'utf8')
    ])

    // The General settings row reaches the value over trusted IPC only.
    expect(main).toContain("ipcMain.handle('desktop-proxy:get'")
    expect(main).toContain("ipcMain.handle('desktop-proxy:set'")
    expect(main).toContain('assertTrustedMainWindowEvent(event)')
    expect(main).toContain('validateProxyUrl(value)')
    expect(main).toContain('parseSystemProxy')
    expect(main).toContain("session.defaultSession.resolveProxy('https://deepseek.ai/')")
    // The value is applied at the next harness launch.
    expect(runtime).toContain('proxyUrl?: () => string | undefined')
    expect(runtime).toContain('this.options.proxyUrl?.()')
    expect(preload).toContain('getProxyConfig:')
    expect(preload).toContain("ipcRenderer.invoke('desktop-proxy:set', value)")
  })
})
