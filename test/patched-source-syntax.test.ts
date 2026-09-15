import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..')

/**
 * One malformed statement inside a patched `client.js` aborts the entire
 * client-modules bundle at runtime, and the failure surfaces as an unrelated
 * "loaded without registering" error. Parsing every patched JavaScript file
 * here turns that class of mistake into a local test failure instead.
 */
function patchedJavaScriptTargets(): string[] {
  const targets = new Set<string>()
  for (const patch of readdirSync(path.join(projectRoot, 'patches'))) {
    if (!patch.endsWith('.patch')) continue
    const source = readFileSync(path.join(projectRoot, 'patches', patch), 'utf8')
    for (const match of source.matchAll(/^\+\+\+ b\/(.+)$/gm)) {
      const target = match[1]
      if (target === undefined) continue
      if (!/\.(?:js|mjs|cjs)$/u.test(target)) continue
      targets.add(target)
    }
  }
  for (const pkg of readdirSync(path.join(projectRoot, 'packages'))) {
    const entries = readdirSync(path.join(projectRoot, 'packages', pkg))
    for (const entry of ['client.js', 'index.js']) {
      if (entries.includes(entry)) targets.add(path.join('packages', pkg, entry))
    }
  }
  return [...targets].sort()
}

function syntaxErrors(target: string): string[] {
  const source = readFileSync(path.join(projectRoot, target), 'utf8')
  const file = ts.createSourceFile(target, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  const diagnostics = (file as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []
  return diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
  )
}

describe('patched JavaScript parses', () => {
  const targets = patchedJavaScriptTargets()

  it('finds the patch targets to guard', () => {
    expect(targets.length).toBeGreaterThan(20)
  })

  it.each(targets)('%s has no syntax errors', (target) => {
    expect(syntaxErrors(target)).toEqual([])
  })
})
