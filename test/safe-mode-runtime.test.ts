import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it, expect } from 'vitest'
import { HarnessRuntime } from '../src/main/runtime/harness-runtime'
import { ensureSafeModeProfile, SAFE_MODE_PROFILE } from '../src/main/state/safe-mode-profile'

it('boots recovery when an installed plugin is unloadable without loading optional Desktop plugins', async () => {
  const root = resolve(import.meta.dirname, '..')
  const home = await mkdtemp(join(tmpdir(), 'dsh-safe-mode-runtime-'))
  const normalPatch = join(root, 'build/dsh-desktop.patch.yml')
  const safePatch = join(root, 'build/dsh-desktop-safe.patch.yml')
  const hook = join(home, 'missing-plugin.mjs')
  // An optional Desktop plugin that the recovery composition deliberately leaves
  // out acts as the load fault: the normal composition mounts it, the recovery
  // composition does not, so the same hook breaks only the positive control.
  const brokenPlugin = 'dsh-desktop-market-installer'
  const missing = 'BUG008 simulated unloadable Desktop plugin'
  await writeFile(hook, `
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === ${JSON.stringify(brokenPlugin)}) {
    throw new Error(${JSON.stringify(missing)});
  }
  if (specifier === 'dsh-desktop-preset-transfer') {
    throw new Error('Optional Desktop plugin loaded in recovery: ' + specifier);
  }
  return next(specifier, context);
}});
`)
  const makeRuntime = (dshSafePatchPath: string, logName: string) => new HarnessRuntime({
    dshEntryPath: join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
    nodeEntryPath: join(root, 'build/harness-node-entry.mjs'),
    nodeExecutablePath: process.execPath,
    dshPatchPath: normalPatch,
    dshSafePatchPath,
    dshHome: home,
    logPath: join(home, logName),
    startupTimeoutMs: 30_000,
    launchProcess: (executable, args, options) => spawn(executable, ['--import', pathToFileURL(hook).href, ...args], options),
    onChanged() {}
  })
  // Positive control: the same safe Profile with one extra unloadable overlay
  // must fail. This proves the fault injection actually reaches an optional
  // Desktop plugin that normal mode mounts.
  const brokenPatch = join(home, 'broken-plugin.patch.yml')
  await writeFile(brokenPatch, `- insert:\n    - id: ${brokenPlugin}\n      name: ${brokenPlugin}\n`)
  const broken = makeRuntime(brokenPatch, 'broken.log')
  const recovered = makeRuntime(safePatch, 'recovered.log')
  try {
    await ensureSafeModeProfile(home)
    await broken.start(home, SAFE_MODE_PROFILE)
    expect(broken.snapshot().phase).toBe('failed')
    expect(broken.snapshot().message, broken.snapshot().logs.join('\n')).toContain(missing)
    await broken.stop()

    await recovered.start(home, SAFE_MODE_PROFILE)
    expect(recovered.snapshot().phase, recovered.snapshot().logs.join('\n')).toBe('ready')
    expect(recovered.snapshot().authToken).toBeTruthy()
    expect((await fetch(recovered.snapshot().url!)).status).toBe(401)
    // Recovery uses its own overlay and never edits the normal composition.
    expect(await readFile(normalPatch, 'utf8')).toContain(`name: ${brokenPlugin}`)
  } finally {
    await broken.stop()
    await recovered.stop()
    await rm(home, { recursive: true, force: true })
  }
}, 80_000)
