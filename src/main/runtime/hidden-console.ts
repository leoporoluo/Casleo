import { pathToFileURL } from 'node:url'

export interface HiddenConsoleOutcome {
  attached: boolean
  detail?: string
}

export interface HiddenConsoleOptions {
  resourcePath: string
  platform?: NodeJS.Platform
  importModule?: (url: string) => Promise<unknown>
}

interface HiddenConsoleModule {
  createHiddenConsole?: (options?: { load?: unknown }) => boolean
}

/**
 * Give the Electron main process a hidden console on Windows.
 *
 * The desktop's own process is a GUI-subsystem process with no console, and a
 * console child spawned from such a parent without a hiding flag opens a fresh
 * visible terminal window: on Windows 11 that is a Windows Terminal window,
 * which is what users report as a command-line window flashing by at startup.
 * Attaching an already-hidden console makes every child inherit one, so the
 * same suppression that Harness relies on covers the desktop's own spawns
 * (shell capture, pnpm installs, taskkill, …) even where a call site forgets a
 * hiding flag.
 *
 * Best-effort by design: a missing native binding or helper must never block
 * startup, and on any other platform this is a no-op.
 *
 * @param options - helper location plus injectable platform/loader for tests.
 * @returns whether a hidden console is now attached to this process.
 */
export async function attachHiddenConsole(
  options: HiddenConsoleOptions
): Promise<HiddenConsoleOutcome> {
  if ((options.platform ?? process.platform) !== 'win32') return { attached: false }
  try {
    const loadModule = options.importModule ?? ((url: string) => import(url))
    const module = (await loadModule(pathToFileURL(options.resourcePath).href)) as HiddenConsoleModule
    if (typeof module.createHiddenConsole !== 'function') {
      return { attached: false, detail: 'the console helper exports no createHiddenConsole()' }
    }
    const attached = module.createHiddenConsole() === true
    return attached ? { attached } : { attached, detail: 'AllocConsole() did not attach a console' }
  } catch (error) {
    return { attached: false, detail: error instanceof Error ? error.message : String(error) }
  }
}
