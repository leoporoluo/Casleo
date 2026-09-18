import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Desktop-owned network-proxy preference for the Harness runtime.
 *
 * Node never reads the Windows system-proxy switch, so the only seam that
 * reaches the Harness's own fetch dispatcher (`dsh-http-proxy`) is the
 * `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` environment it is spawned with. This
 * store holds the value the General settings page edits; `harness-runtime`
 * turns it into spawn environment at the next Harness launch.
 *
 * @module desktop-proxy
 */

export interface DesktopProxyConfig {
  /** The proxy URL, or "" when no proxy is configured. */
  httpProxy: string
}

const DEFAULT_PROXY_CONFIG: DesktopProxyConfig = { httpProxy: '' }

/** The config file lives beside the other desktop-owned state in userData. */
export function proxyConfigPath(userDataDir: string): string {
  return join(userDataDir, 'proxy-config.json')
}

/**
 * Validate one proxy URL as typed on the settings row.
 * @returns an error message, or null when the value is acceptable.
 */
export function validateProxyUrl(value: unknown): string | null {
  if (typeof value !== 'string') return '代理地址必须是一个字符串。'
  const candidate = value.trim()
  if (candidate === '') return null
  if (candidate.length > 2048) return '代理地址过长。'
  if (/\s/.test(candidate)) return '代理地址不能包含空白字符。'
  if (!/^https?:\/\/\S+$/iu.test(candidate)) {
    return '代理地址需要以 http:// 或 https:// 开头，例如 http://192.168.0.105:7890。'
  }
  return null
}

export function readProxyConfig(file: string): DesktopProxyConfig {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DesktopProxyConfig>
    const httpProxy = typeof parsed.httpProxy === 'string' ? parsed.httpProxy : ''
    return { httpProxy }
  } catch {
    return { ...DEFAULT_PROXY_CONFIG }
  }
}

export function writeProxyConfig(file: string, config: DesktopProxyConfig): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}
