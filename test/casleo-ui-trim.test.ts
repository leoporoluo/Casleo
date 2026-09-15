import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { patchPath } from './patch-path'

const projectRoot = path.resolve(import.meta.dirname, '..')

const chatClient = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat', 'lib', 'client.js')
const feedbackClient = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-message-feedback', 'lib', 'client.js')
const layoutClient = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-layout', 'lib', 'client.js')
const conversationClient = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-conversation', 'lib', 'client.js')

describe('Casleo interface trims', () => {
  it('shows the neutral thinking copy as plain gray instead of a brand shimmer', async () => {
    const [client, patch] = await Promise.all([
      readFile(chatClient, 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-chat'), 'utf8')
    ])

    expect(client).toContain('"chat.deepDiving": "正在思考…"')
    expect(client).toContain('"chat.deepDiving": "Thinking…"')
    expect(client).not.toContain('深度求索中')
    expect(client).not.toContain('Deep diving')
    expect(client).not.toContain('--dsw-static-deepseek-500) 0%')
    expect(client).not.toContain('dsh-turn-status-shimmer;display:inline-flex')
    const statusRule = client.slice(client.indexOf('.EvIC1a_turnStatus{'), client.indexOf('}', client.indexOf('.EvIC1a_turnStatus{')))
    expect(statusRule).toContain('color:var(--dsw-alias-label-secondary)')
    expect(patch).toContain('"chat.deepDiving": "正在思考…"')
    expect(patch).toContain('color:var(--dsw-alias-label-secondary)')
  })

  it('renders no like/dislike entry and no feedback dialog', async () => {
    const [client, patch] = await Promise.all([
      readFile(feedbackClient, 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-message-feedback'), 'utf8')
    ])

    expect(client).not.toContain('slots.inject')
    expect(client).not.toContain('commandUi')
    expect(patch).toMatch(/-\s*ctx\.slots\.inject\("conversation\.chat\.assistant-actions"/u)
    expect(patch).toMatch(/-\s*ctx\.slots\.inject\("conversation\.input\.overlay"/u)
  })

  it('keeps the workspace composer ring invisible until hover', async () => {
    const [client, patch] = await Promise.all([
      readFile(conversationClient, 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-conversation'), 'utf8')
    ])

    expect(client).toMatch(
      /\.uV2eYG_cardWorkspaceTrigger:after\{content:\\"\\";background:transparent;/u
    )
    expect(client).toContain(
      '.uV2eYG_cardWorkspaceTrigger:hover:after{background:var(--dsw-alias-border-l3)}'
    )
    // The ring is one continuous stroke: the dashed mask is gone.
    expect(client).not.toContain("stroke-dasharray='4 4'")
    expect(client).toContain("stroke-width='1.5'")
    expect(client).not.toMatch(
      /\.uV2eYG_cardWorkspaceTrigger:hover:after\{background:var\(--dsw-alias-state-business-primary\)/u
    )
    expect(patch).toContain('background:transparent;pointer-events:none;border-radius:22px')
    expect(patch).toContain(
      '.uV2eYG_cardWorkspaceTrigger:hover:after{background:var(--dsw-alias-border-l3)}'
    )
  })

  it('renders no column drag handles around the sidebar or right panel', async () => {
    const [client, patch] = await Promise.all([
      readFile(layoutClient, 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-layout'), 'utf8')
    ])

    expect(client).not.toContain('(0, react_jsx_runtime.jsx)(DragHandle, {')
    expect(patch).toMatch(/-\s*!sidebarCollapsed && \(0, react_jsx_runtime\.jsx\)\(DragHandle, \{/u)
    expect(patch).toMatch(/-\s*layoutInfo\.rightbarShown && !layoutInfo\.rightbarFullscreen/u)
  })
})
