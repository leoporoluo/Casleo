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

  it('hides the console window of every shell capture', async () => {
    const runtime = await readFile('src/main/runtime/harness-runtime.ts', 'utf8')

    const syncCapture = /execFileSync\(capture\.file, capture\.args, \{[\s\S]*?\}\)/u.exec(runtime)
    const asyncCapture = /execFile\(\s*\n?\s*capture\.file,\s*\n?\s*capture\.args,\s*\n?\s*\{[\s\S]*?\n\s*\},/u.exec(runtime)
    expect(syncCapture?.[0]).toContain('windowsHide: true')
    expect(asyncCapture?.[0]).toContain('windowsHide: true')
  })
})
