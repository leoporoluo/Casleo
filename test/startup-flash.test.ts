import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('startup flash guards', () => {
  it('holds the splash back until a launch is actually slow', async () => {
    const main = await readFile('src/main/index.ts', 'utf8')

    expect(main).toContain('const SPLASH_REVEAL_DELAY_MS = 1_200')
    expect(main).toContain('splashRevealTimer = setTimeout(() => {')
    expect(main).toContain('if (window.isDestroyed() || navigationVersion !== mainWindowNavigationVersion) return')
    // A page that replaces the splash raises the window itself.
    expect(main).toContain('clearSplashReveal()')
    expect(main).toContain('// scheduled splash reveal must not fire on top of it.')
  })

  it('keeps the reveal background identical to the window creation background', async () => {
    const main = await readFile('src/main/index.ts', 'utf8')

    expect(main).toContain("window.setBackgroundColor(isDark ? '#141416' : '#f8f8f6')")
    expect(main).toContain(
      "backgroundColor: nativeTheme.shouldUseDarkColors ? '#141416' : '#f8f8f6'"
    )
    expect(main).not.toContain("window.setBackgroundColor(isDark ? '#141416' : '#ffffff')")
  })

  it('hides the console window of every spawn the desktop process makes', async () => {
    const runtime = await readFile('src/main/runtime/harness-runtime.ts', 'utf8')
    const audit = await readFile('src/main/state/launch-agent-audit.ts', 'utf8')
    const cleanup = await readFile('src/main/state/plugin-component-cleanup.ts', 'utf8')

    const syncCapture = /execFileSync\(capture\.file, capture\.args, \{[\s\S]*?\}\)/u.exec(runtime)
    const asyncCapture = /execFile\(\s*\n?\s*capture\.file,\s*\n?\s*capture\.args,\s*\n?\s*\{[\s\S]*?\n\s*\},/u.exec(runtime)
    expect(syncCapture?.[0]).toContain('windowsHide: true')
    expect(asyncCapture?.[0]).toContain('windowsHide: true')

    const auditSpawn = /const child = spawn\(command, \[\.\.\.args\], \{[\s\S]*?\}\)/u.exec(audit)
    const cleanupSpawn = /const child = spawn\(command, \[\.\.\.args\], \{[\s\S]*?\}\)/u.exec(cleanup)
    expect(auditSpawn?.[0]).toContain('windowsHide: true')
    expect(cleanupSpawn?.[0]).toContain('windowsHide: true')
  })

  it('gives the desktop process a hidden console of its own', async () => {
    const main = await readFile('src/main/index.ts', 'utf8')

    expect(main).toContain('attachHiddenConsole({')
    expect(main).toContain("desktopResourcePath('windows-hidden-console.mjs')")
    expect(main).toContain('[desktop] attached a hidden console so spawned command windows stay invisible')
  })

  it('applies the installer privilege pass without spawning a visible console', async () => {
    const installer = await readFile('build/installer.nsh', 'utf8')
    const directives = installer
      .split(/\r?\n/u)
      .filter((line) => !line.trimStart().startsWith(';'))
      .join('\n')

    // `ExecShell "runas" powershell.exe -WindowStyle Hidden` still creates the
    // console window before PowerShell applies the style, which is the flash.
    expect(directives).not.toContain('ExecShell "runas"')
    expect(installer).toContain('Start-Process -FilePath \'$TEMP\\casleo-elevate.ps1\'')
    expect(installer).toContain('-Verb RunAs -WindowStyle Hidden')
    expect(installer).toContain('nsExec::ExecToLog "powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass')
  })
})
