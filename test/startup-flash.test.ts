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
    // The elevated pass must launch PowerShell explicitly and execute the
    // generated script with -File: handing the .ps1 to Start-Process as the
    // FilePath would open it in Notepad instead of running it.
    expect(installer).toContain('Start-Process -FilePath powershell.exe -Verb RunAs')
    expect(installer).toContain('-WindowStyle Hidden -Wait')
    expect(installer).toContain("'-File',")
    expect(installer).toContain('Delete "$TEMP\\casleo-elevate-$8.ps1"')
    expect(installer).toContain('nsExec::ExecToLog "powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass')
    expect(installer).toContain('!macro customUnInstall')
    expect(installer).toContain('Remove-MpPreference -ExclusionPath')
    expect(installer).toContain('app.asar.unpacked\\node_modules')
  })

  it('packs application code in asar and unpacks node_modules for the Harness child', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      build?: { asar?: boolean; asarUnpack?: string[] }
    }
    const main = await readFile('src/main/index.ts', 'utf8')

    expect(packageJson.build?.asar).toBe(true)
    expect(packageJson.build?.asarUnpack).toEqual(['node_modules/**/*'])
    expect(main).toContain("join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')")
    expect(main).toContain('function nodeModulesRoot()')
  })
})
