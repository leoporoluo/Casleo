import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it, expect } from 'vitest'
import {
  StaleHarnessReaper,
  formatHarnessProcessRecord,
  isOwnHarnessProcess,
  isProcessAlive,
  parseHarnessProcessRecord,
  terminateProcess,
  type HarnessProcessIdentity,
  type StaleHarnessReaperDeps
} from '../src/main/runtime/stale-harness'

const EXPECTED = {
  nodeExecutablePath: 'C:\\Program Files\\Casleo\\resources\\app\\node_modules\\node\\bin\\node.exe',
  nodeEntryPath: 'C:\\Program Files\\Casleo\\resources\\harness-node-entry.mjs'
}

it('round-trips the pid record and rejects malformed values', () => {
  const text = formatHarnessProcessRecord({ pid: 22208, port: 43129 })
  expect(parseHarnessProcessRecord(text)).toEqual({ pid: 22208, port: 43129 })
  expect(parseHarnessProcessRecord('')).toBeUndefined()
  expect(parseHarnessProcessRecord('not json')).toBeUndefined()
  expect(parseHarnessProcessRecord('{"pid":-1}')).toBeUndefined()
  expect(parseHarnessProcessRecord('{"pid":"3"}')).toBeUndefined()
  expect(parseHarnessProcessRecord('{"pid":9}')).toEqual({ pid: 9, port: 0 })
})

it('recognises this app\'s Harness by executable and entry path', () => {
  const own: HarnessProcessIdentity = {
    executablePath: EXPECTED.nodeExecutablePath.toUpperCase().replace(/\\/g, '\\'),
    commandLine: `"${EXPECTED.nodeExecutablePath}" --expose-internals "${EXPECTED.nodeEntryPath}" "C:\\Program Files\\Casleo\\resources\\app\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js" web --port 43129`
  }
  expect(isOwnHarnessProcess(own, EXPECTED)).toBe(true)

  expect(
    isOwnHarnessProcess(
      { executablePath: EXPECTED.nodeExecutablePath, commandLine: '"C:\\other\\script.mjs"' },
      EXPECTED
    )
  ).toBe(false)
  expect(
    isOwnHarnessProcess({ executablePath: 'C:\\Program Files\\nodejs\\node.exe' }, EXPECTED)
  ).toBe(false)
  expect(isOwnHarnessProcess({}, EXPECTED)).toBe(false)

  // Command line only: both the interpreter and the entry must be ours.
  expect(
    isOwnHarnessProcess(
      { commandLine: `"${EXPECTED.nodeExecutablePath}" "${EXPECTED.nodeEntryPath}"` },
      EXPECTED
    )
  ).toBe(true)
  expect(
    isOwnHarnessProcess({ commandLine: `node.exe "${EXPECTED.nodeEntryPath}"` }, EXPECTED)
  ).toBe(false)
})

interface Harness {
  deps: StaleHarnessReaperDeps
  reaper: StaleHarnessReaper
  notes: string[]
  terminated: number[]
  queried: number[]
}

function makeReaper(options: {
  platform?: NodeJS.Platform
  identity?: HarnessProcessIdentity | undefined
  alive?: (pid: number) => boolean
  stopped?: boolean
} = {}): Harness {
  const notes: string[] = []
  const terminated: number[] = []
  const queried: number[] = []
  const alive = options.alive ?? (() => true)
  const deps: StaleHarnessReaperDeps = {
    platform: options.platform ?? 'win32',
    isAlive: alive,
    queryIdentity: async (pid) => {
      queried.push(pid)
      return 'identity' in options ? options.identity : undefined
    },
    terminate: async (pid) => {
      terminated.push(pid)
      return options.stopped ?? true
    }
  }
  return {
    deps,
    reaper: new StaleHarnessReaper(deps, (line) => notes.push(line)),
    notes,
    terminated,
    queried
  }
}

it('stops a live Harness left behind by a previous run', async () => {
  const home = await mkdtemp(join(tmpdir(), 'casleo-stale-reap-'))
  const recordPath = join(home, 'harness.pid')
  try {
    await writeFile(recordPath, formatHarnessProcessRecord({ pid: 4242, port: 43129 }))
    const { reaper, notes, terminated, queried } = makeReaper({
      identity: {
        executablePath: EXPECTED.nodeExecutablePath,
        commandLine: `"${EXPECTED.nodeExecutablePath}" "${EXPECTED.nodeEntryPath}" web --port 43129`
      }
    })

    expect(await reaper.reap(recordPath, EXPECTED)).toBe(true)
    expect(terminated).toEqual([4242])
    expect(queried).toEqual([4242])
    expect(notes.join('\n')).toContain('stopping Harness process 4242')
    await expect(access(recordPath)).rejects.toThrow()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('leaves a recycled pid alone and drops the stale record', async () => {
  const home = await mkdtemp(join(tmpdir(), 'casleo-stale-reap-'))
  const recordPath = join(home, 'harness.pid')
  try {
    await writeFile(recordPath, formatHarnessProcessRecord({ pid: 4242, port: 43129 }))
    const { reaper, terminated } = makeReaper({
      identity: { executablePath: 'C:\\Program Files\\nodejs\\node.exe' }
    })

    expect(await reaper.reap(recordPath, EXPECTED)).toBe(false)
    expect(terminated).toEqual([])
    await expect(access(recordPath)).rejects.toThrow()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('skips the reaper outside Windows and for dead or unknown records', async () => {
  const home = await mkdtemp(join(tmpdir(), 'casleo-stale-reap-'))
  const recordPath = join(home, 'harness.pid')
  try {
    await writeFile(recordPath, formatHarnessProcessRecord({ pid: 4242, port: 43129 }))

    const posix = makeReaper({ platform: 'darwin' })
    expect(await posix.reaper.reap(recordPath, EXPECTED)).toBe(false)
    expect(posix.queried).toEqual([])
    expect(await readFile(recordPath, 'utf8')).toBeTruthy()

    const dead = makeReaper({ alive: () => false })
    expect(await dead.reaper.reap(recordPath, EXPECTED)).toBe(false)
    expect(dead.queried).toEqual([])
    await expect(access(recordPath)).rejects.toThrow()

    await writeFile(recordPath, 'garbage')
    const corrupt = makeReaper()
    expect(await corrupt.reaper.reap(recordPath, EXPECTED)).toBe(false)
    expect(corrupt.terminated).toEqual([])

    const missing = makeReaper()
    expect(await missing.reaper.reap(join(home, 'absent.pid'), EXPECTED)).toBe(false)
    expect(missing.terminated).toEqual([])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('keeps the record when a stale Harness refuses to exit', async () => {
  const home = await mkdtemp(join(tmpdir(), 'casleo-stale-reap-'))
  const recordPath = join(home, 'harness.pid')
  try {
    await writeFile(recordPath, formatHarnessProcessRecord({ pid: 4242, port: 43129 }))
    const { reaper, notes } = makeReaper({
      identity: {
        executablePath: EXPECTED.nodeExecutablePath,
        commandLine: `"${EXPECTED.nodeExecutablePath}" "${EXPECTED.nodeEntryPath}"`
      },
      stopped: false
    })

    expect(await reaper.reap(recordPath, EXPECTED)).toBe(false)
    expect(notes.join('\n')).toContain('did not exit')
    expect(await readFile(recordPath, 'utf8')).toContain('4242')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

it('terminates a real process that is no longer our child', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true
  })
  try {
    const pid = child.pid
    expect(pid).toBeTruthy()
    expect(isProcessAlive(pid!)).toBe(true)
    expect(await terminateProcess(pid!)).toBe(true)
    expect(isProcessAlive(pid!)).toBe(false)
  } finally {
    child.kill('SIGKILL')
  }
})

it('treats an already dead process as terminated', async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], {
    stdio: 'ignore',
    windowsHide: true
  })
  const pid = child.pid!
  await new Promise((resolve) => child.once('exit', resolve))
  expect(await terminateProcess(pid)).toBe(true)
})
