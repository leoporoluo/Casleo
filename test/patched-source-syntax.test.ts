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

/**
 * A stylesheet literal that never closes its last block parses as JavaScript and
 * passes every other check here, yet the browser nests everything the plugin
 * appends after the break inside that open block — which silently turns those
 * rules conditional. One shipped literal did exactly that and painted only when
 * the OS asked for reduced motion, so the shape is guarded rather than trusted.
 */
function unbalancedStylesheets(target: string): string[] {
  const source = readFileSync(path.join(projectRoot, target), 'utf8')
  const broken: string[] = []
  for (const match of source.matchAll(/"((?:[^"\\]|\\.){120,})"/gu)) {
    const value = match[1] ?? ''
    if (!/^\s*(?:@media[^{]*\{|\.[A-Za-z0-9_-]+\s*\{)/u.test(value)) continue
    if ((value.match(/\{/gu)?.length ?? 0) !== (value.match(/\}/gu)?.length ?? 0)) {
      broken.push(value.slice(0, 48))
    }
  }
  return broken
}

describe('patched JavaScript parses', () => {
  const targets = patchedJavaScriptTargets()

  it('finds the patch targets to guard', () => {
    expect(targets.length).toBeGreaterThan(20)
  })

  it.each(targets)('%s has no syntax errors', (target) => {
    expect(syntaxErrors(target)).toEqual([])
  })

  it.each(targets)('%s injects only balanced stylesheet literals', (target) => {
    expect(unbalancedStylesheets(target)).toEqual([])
  })
})
