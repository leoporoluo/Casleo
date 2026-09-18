import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { hasPatch, patchPath } from './patch-path'

/**
 * The quota/forbidden copy went back to the official surface: raw provider
 * errors render verbatim, and classification is upstream's (401/403 → AUTH).
 * What stays is the one real defect fix in this area — pi-ai dropping the
 * terminal content array on some providers — which is restored from the
 * completed stream blocks.
 */
describe('provider error handling', () => {
  it('classifies provider errors the official way', async () => {
    const piAiPatch = await readFile(patchPath('@deepseek-ai/dsh-llm-pi-ai'), 'utf8')

    // Classification is upstream again: the patch carries no status changes.
    expect(piAiPatch).not.toContain('401')
    expect(piAiPatch).not.toContain('FORBIDDEN')
  })

  it('left the chat and trajectory failure copy untouched', async () => {
    // The chat patch keeps its (title-free) thinking-copy hunks; the quota and
    // forbidden rows are gone from both dictionaries.
    const chat = await readFile(patchPath('@deepseek-ai/dsh-client-ui-chat'), 'utf8')
    expect(chat).not.toContain('failure.quota')
    expect(chat).not.toContain('failure.forbidden')
    // The trajectory patch is gone entirely — its only hunks were the copy rows.
    expect(hasPatch('@deepseek-ai/dsh-client-ui-trajectory')).toBe(false)
  })

  it('recovers a provider terminal message that omits its content array', async () => {
    const patch = await readFile(patchPath('@deepseek-ai/dsh-llm-pi-ai'), 'utf8')
    const additions = patch
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1))
      .join('\n')
    const helper = additions.match(
      /function completeTerminalMessage\(message, completed\) \{[\s\S]*?^\}/m
    )?.[0]

    expect(helper).toBeDefined()
    const completeTerminalMessage = new Function(
      `${helper}; return completeTerminalMessage`
    )() as (
      message: Record<string, unknown>,
      completed: Map<number, Record<string, unknown>>
    ) => Record<string, unknown>
    const completed = new Map([
      [1, { type: 'text', text: 'second' }],
      [0, { type: 'reasoning', text: 'first' }]
    ])
    const malformed = { model: 'custom-model', stopReason: 'stop' }

    expect(completeTerminalMessage(malformed, completed)).toEqual({
      ...malformed,
      content: [
        { type: 'reasoning', text: 'first' },
        { type: 'text', text: 'second' }
      ]
    })
    const valid = { ...malformed, content: [] }
    expect(completeTerminalMessage(valid, completed)).toBe(valid)
    expect(patch).toContain(
      '+\t\t\tconst message = completeTerminalMessage(event.message, completed);'
    )
    expect(patch).toContain(
      '+\t\t\t\treplayState: toPiReplayState(message, requestedModel)'
    )
  })
})
