import { execFile } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'

export const HARNESS_PID_FILENAME = 'harness.pid'

export interface HarnessProcessRecord {
  pid: number
  port: number
}

export interface HarnessProcessIdentity {
  executablePath?: string
  commandLine?: string
}

export interface HarnessProcessExpectation {
  nodeExecutablePath: string
  nodeEntryPath: string
}

export interface StaleHarnessReaperDeps {
  platform: NodeJS.Platform
  isAlive(pid: number): boolean
  queryIdentity(pid: number): Promise<HarnessProcessIdentity | undefined>
  terminate(pid: number): Promise<boolean>
}

export function formatHarnessProcessRecord(record: HarnessProcessRecord): string {
  return `${JSON.stringify({ pid: record.pid, port: record.port })}\n`
}

export function parseHarnessProcessRecord(text: string): HarnessProcessRecord | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const { pid, port } = parsed as { pid?: unknown; port?: unknown }
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return undefined
  return { pid, port: typeof port === 'number' && Number.isInteger(port) ? port : 0 }
}

/**
 * Decide whether a live process is the Harness this app launched previously.
 *
 * A PID recorded before a crash can be recycled by an unrelated program by the
 * time the next launch reads it, so kill-by-PID alone would be unsafe. The
 * bundled Node.js executable and the Harness entry path together identify our
 * child; anything less certain is left alone.
 */
export function isOwnHarnessProcess(
  identity: HarnessProcessIdentity,
  expected: HarnessProcessExpectation
): boolean {
  const normalise = (value: string): string => value.replace(/\\/gu, '/').toLowerCase()
  const executable = normalise(expected.nodeExecutablePath)
  const entry = normalise(expected.nodeEntryPath)
  const commandLine = identity.commandLine === undefined ? undefined : normalise(identity.commandLine)

  if (identity.executablePath !== undefined) {
    return (
      normalise(identity.executablePath) === executable &&
      (commandLine === undefined || commandLine.includes(entry))
    )
  }
  return (
    commandLine !== undefined && commandLine.includes(executable) && commandLine.includes(entry)
  )
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Terminate a process that is no longer our child, waiting out both the
 * graceful and the forced attempt so a subsequent port reservation sees the
 * real state rather than a process that is still winding down.
 */
export async function terminateProcess(pid: number, graceMs = 4_000, forceMs = 1_000): Promise<boolean> {
  if (await signalAndWait(pid, 'SIGTERM', graceMs)) return true
  return signalAndWait(pid, 'SIGKILL', forceMs)
}

async function signalAndWait(pid: number, signal: NodeJS.Signals, timeoutMs: number): Promise<boolean> {
  try {
    process.kill(pid, signal)
  } catch {
    return !isProcessAlive(pid)
  }
  const deadline = Date.now() + timeoutMs
  while (isProcessAlive(pid)) {
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return true
}

export async function queryWindowsProcessIdentity(
  pid: number
): Promise<HarnessProcessIdentity | undefined> {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      [
        '-NoLogo',
        '-NonInteractive',
        '-OutputFormat', 'Text',
        '-Command',
        `$process = Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; ` +
        'if ($null -ne $process) { ' +
        'ConvertTo-Json -Compress -InputObject @{ Path = $process.ExecutablePath; CommandLine = $process.CommandLine } ' +
        '}'
      ],
      { encoding: 'utf8', timeout: 15_000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(undefined)
          return
        }
        const line = stdout.trim()
        if (line === '') {
          resolve({})
          return
        }
        try {
          const parsed = JSON.parse(line) as { Path?: unknown; CommandLine?: unknown }
          resolve({
            ...(typeof parsed.Path === 'string' && parsed.Path !== ''
              ? { executablePath: parsed.Path }
              : {}),
            ...(typeof parsed.CommandLine === 'string' && parsed.CommandLine !== ''
              ? { commandLine: parsed.CommandLine }
              : {})
          })
        } catch {
          resolve(undefined)
        }
      }
    )
  })
}

export class StaleHarnessReaper {
  constructor(
    private readonly deps: StaleHarnessReaperDeps,
    private readonly note: (line: string) => void
  ) {}

  /**
   * Stop the Harness process a previous app run left behind.
   *
   * The desktop spawns the Harness detached on Windows (issue #208), so a
   * force-killed or crashed desktop leaves a live Harness that keeps its
   * loopback port and every session write lease it holds. A later delete of
   * such a session fails at the kernel lease with `SessionAlreadyOwnedError`,
   * which reads to the user as an undeletable session.
   *
   * @param recordPath - the pid record written at spawn time.
   * @param expected - identity of the Harness this app launches.
   * @returns true when a stale Harness was terminated.
   */
  async reap(recordPath: string, expected: HarnessProcessExpectation): Promise<boolean> {
    if (this.deps.platform !== 'win32') return false

    let text: string
    try {
      text = await readFile(recordPath, 'utf8')
    } catch {
      return false
    }
    const record = parseHarnessProcessRecord(text)
    if (record === undefined) {
      await this.forget(recordPath)
      return false
    }
    if (!this.deps.isAlive(record.pid)) {
      await this.forget(recordPath)
      return false
    }
    const identity = await this.deps.queryIdentity(record.pid)
    if (identity === undefined) {
      this.note(`[desktop] could not inspect stale Harness process ${record.pid}; leaving it running`)
      return false
    }
    if (!isOwnHarnessProcess(identity, expected)) {
      this.note(`[desktop] recorded Harness process ${record.pid} is not ours any more; leaving it running`)
      await this.forget(recordPath)
      return false
    }

    this.note(`[desktop] stopping Harness process ${record.pid} left behind by a previous run`)
    const stopped = await this.deps.terminate(record.pid)
    this.note(
      stopped
        ? `[desktop] stale Harness process ${record.pid} stopped`
        : `[desktop] stale Harness process ${record.pid} did not exit`
    )
    if (stopped) await this.forget(recordPath)
    return stopped
  }

  private async forget(recordPath: string): Promise<void> {
    try {
      await rm(recordPath, { force: true })
    } catch {
      // The record is advisory; a file that cannot be removed is retried next launch.
    }
  }
}
