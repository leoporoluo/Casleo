import { normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * What a URL is judged against. The context anchors trust to what this app
 * actually serves instead of to shapes any local page could imitate:
 * the harness endpoint currently running (its port) and the directory the
 * desktop's own packaged file: pages live in.
 */
export interface TrustedAppUrlContext {
  /** The harness endpoint currently serving the UI, e.g. `http://127.0.0.1:43129`. */
  harnessUrl?: string
  /** Directory under which the desktop's own packaged file: pages live. */
  resourceDirectory?: string
}

function isHarnessUrl(rawUrl: string, harnessUrl: string | undefined): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'http:') return false
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return false
    // A missing origin means no Harness is serving yet. Any other loopback
    // listener — a leftover from an earlier run, or a local process pretending
    // to be one — must not inherit that trust.
    if (harnessUrl === undefined) return false
    const allowed = new URL(harnessUrl)
    return url.port === allowed.port
  } catch {
    return false
  }
}

/**
 * Only the desktop's own packaged pages (windows-menu, splash, recovery views,
 * web-import) may load as file: URLs — any other local file is not a page this
 * app ever serves, so navigating the main window to it must not hand the new
 * page a trusted origin.
 */
function isResourceFileUrl(rawUrl: string, resourceDirectory: string | undefined): boolean {
  if (resourceDirectory === undefined) return false
  let filePath: string
  try {
    filePath = fileURLToPath(rawUrl)
  } catch {
    return false
  }
  const root = resolve(normalize(resourceDirectory))
  const candidate = resolve(normalize(filePath))
  // Windows paths are case-insensitive; POSIX paths are not.
  const sameText = (value: string, other: string) =>
    process.platform === 'win32'
      ? value.toLowerCase() === other.toLowerCase()
      : value === other
  const rootWithSep = root.endsWith(sep) ? root : root + sep
  return sameText(candidate, root) || sameText(candidate.slice(0, rootWithSep.length), rootWithSep)
}

export function isTrustedAppUrl(rawUrl: string, context: TrustedAppUrlContext = {}): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol === 'dsh-recovery:') return true
    if (parsed.protocol === 'file:') return isResourceFileUrl(rawUrl, context.resourceDirectory)
  } catch {
    return false
  }
  return isHarnessUrl(rawUrl, context.harnessUrl)
}

export function canGrantWindowPermission(
  permission: string,
  requestingUrl: string | undefined,
  isMainFrame: boolean,
  context: TrustedAppUrlContext = {}
): boolean {
  return (
    permission === 'clipboard-sanitized-write' &&
    isMainFrame &&
    requestingUrl !== undefined &&
    isHarnessUrl(requestingUrl, context.harnessUrl)
  )
}
