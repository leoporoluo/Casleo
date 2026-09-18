import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { patchPath } from './patch-path'

const projectRoot = path.resolve(import.meta.dirname, '..')

const chatClient = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat', 'lib', 'client.js')
const feedbackClient = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-message-feedback', 'lib', 'client.js')
const layoutClient = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-layout', 'lib', 'client.js')
const conversationClient = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-conversation', 'lib', 'client.js')
const settingsModelsClient = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-models', 'lib', 'client.js')
const modelSelectionClient = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-model-selection', 'lib', 'client.js')
const sidebarRightClient = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-sidebar-right', 'lib', 'client.js')

describe('Casleo interface trims', () => {
  it('shows the neutral thinking copy with a gray shimmer instead of a brand one', async () => {
    const [client, patch] = await Promise.all([
      readFile(chatClient, 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-chat'), 'utf8')
    ])

    expect(client).toContain('"chat.deepDiving": "正在思考…"')
    expect(client).toContain('"chat.deepDiving": "Thinking…"')
    expect(client).not.toContain('深度求索中')
    expect(client).not.toContain('Deep diving')
    expect(client).not.toContain('--dsw-static-deepseek-500) 0%')
    const statusAnchor = client.indexOf('.EvIC1a_turnStatus{height:')
    const statusRule = client.slice(statusAnchor, client.indexOf('}', statusAnchor))
    // The running-turn shimmer survives, painted in neutral grays.
    expect(statusRule).toContain('--dsw-alias-label-secondary) 0%')
    expect(statusRule).toContain('--dsw-alias-label-primary) 50%')
    expect(statusRule).toContain('animation:1.8s linear infinite EvIC1a_dsh-turn-status-shimmer')
    expect(client).toContain('EvIC1a_dsh-turn-status-shimmer{')
    expect(patch).toContain('"chat.deepDiving": "正在思考…"')
    expect(patch).toContain('--dsw-alias-label-primary) 50%')
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

    // A real border on a 1.5px-offset box keeps the ring concentric with the
    // 22px card; the masked SVG ring is gone entirely.
    expect(client).toContain(
      '.uV2eYG_cardWorkspaceTrigger:after{content:\\"\\";pointer-events:none;border:1.5px solid transparent;border-radius:23.5px;box-sizing:border-box;transition:border-color .12s;position:absolute;inset:-1.5px}'
    )
    expect(client).toContain(
      '.uV2eYG_cardWorkspaceTrigger:hover:after{border-color:var(--dsw-alias-border-l3)}'
    )
    expect(client).not.toContain("stroke-dasharray='4 4'")
    expect(client).not.toMatch(
      /\.uV2eYG_cardWorkspaceTrigger:after\{[^}]*mask:/u
    )
    expect(client).not.toMatch(
      /\.uV2eYG_cardWorkspaceTrigger:hover:after\{background:/u
    )
    expect(patch).toContain('border-radius:23.5px')
    expect(patch).toContain(
      '.uV2eYG_cardWorkspaceTrigger:hover:after{border-color:var(--dsw-alias-border-l3)}'
    )
  })

  it('hides the official DeepSeek provider row from the models settings', async () => {
    const [client, patch] = await Promise.all([
      readFile(settingsModelsClient, 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-settings-models'), 'utf8')
    ])

    expect(client).toContain(
      'const configured = state.rows.filter((row) => row.configured && row.entry.provider !== "deepseek-official");'
    )
    expect(patch).toContain('row.entry.provider !== \"deepseek-official\"')
  })

  it('shows the product name on the splash without the loader animation', async () => {
    const splash = await readFile(path.join(projectRoot, 'build', 'splash.html'), 'utf8')

    expect(splash).toContain('<h1 class="title">Casleo</h1>')
    expect(splash).toContain('font-size: 32px')
    expect(splash).not.toContain('<img')
    expect(splash).not.toContain('casleo-loader')
    expect(splash).not.toContain('Starting Casleo')
  })

  it('hides the official DeepSeek group from the model picker', async () => {
    const [client, patch] = await Promise.all([
      readFile(modelSelectionClient, 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-model-selection'), 'utf8')
    ])

    expect(client).toContain(
      'groups: catalog.value.groups.filter((group) => group.id !== "deepseek-official")'
    )
    expect(client).toContain(
      'directory.groups.filter((candidate) => candidate.id !== "deepseek-official")'
    )
    expect(patch).toContain('group.id !== "deepseek-official"')
  })

  it('starts unconfigured: an unroutable default model is no selection at all', async () => {
    const [client, patch, composition] = await Promise.all([
      readFile(modelSelectionClient, 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-model-selection'), 'utf8'),
      readFile(path.join(projectRoot, 'build', 'dsh-desktop.patch.yml'), 'utf8')
    ])

    // The stock default names the official route; without that route it must
    // read as "nothing selected" rather than as a model the deployment cannot
    // run, and the composer must show its unset label instead of the raw id.
    expect(client).toContain(
      'const resolvedFallback = fallbackSelection === null || fallbackSelection === void 0 || !catalog.value.routableProviders.includes(fallbackSelection.provider) ? null : fallbackSelection;'
    )
    expect(client).toContain(
      'routable: current === null ? false : catalog.value.routableProviders.includes(current.provider)'
    )
    expect(client).toContain(
      'const modelLabel = waiting ? t("trigger.loading") : currentChoice?.model.name ?? t("trigger.fallback");'
    )
    expect(client).not.toContain('`${state.current.provider}/${state.current.model}`')
    expect(client).not.toContain('trigger.defaultModel')
    expect(patch).toContain('!catalog.value.routableProviders.includes(fallbackSelection.provider)')

    // Casleo ships no built-in model route, so a fresh install has none.
    expect(composition.replace(/\r\n/gu, '\n')).toContain('- id: llm-deepseek\n  disabled: true')
  })

  it('resizes the right panel from its divider and leaves the sidebar rail fixed', async () => {
    const [client, patch] = await Promise.all([
      readFile(layoutClient, 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-layout'), 'utf8')
    ])

    // The right panel is widened by dragging the 8px divider on its left edge.
    // The sidebar keeps its fixed rail, so its handle is the one the patch drops
    // and the right panel's survives as ordinary context.
    expect(client).toContain('side: "rightbar"')
    expect(client).not.toContain('side: "sidebar"')
    expect(patch).toMatch(/-\s*!sidebarCollapsed && \(0, react_jsx_runtime\.jsx\)\(DragHandle, \{/u)
    expect(patch).toMatch(/^\s+layoutInfo\.rightbarShown && !layoutInfo\.rightbarFullscreen/mu)
  })

  it('offers no split-pane control in the right panel chrome', async () => {
    const [client, patch] = await Promise.all([
      readFile(sidebarRightClient, 'utf8'),
      readFile(patchPath('@deepseek-ai/dsh-client-ui-sidebar-right'), 'utf8')
    ])

    // The docking kit drops its 分栏 button when the surface refuses to split, so
    // declaring the panel single-pane retires the control and drag-to-split along
    // with it while the tab strip keeps reordering and moving tabs between panes.
    expect(client).toContain('canSplit: false,')
    expect(client).toContain('hideSplitWhenBlocked: true,')
    expect(client).not.toContain('_deepseek_ai_dsh_client_ui_dockkit.canSplit)(surface.layout)')
    expect(patch).toMatch(/-\s*canSplit: \(0, _deepseek_ai_dsh_client_ui_dockkit\.canSplit\)/u)
  })

  it('titles the window Casleo and does not pin a leftover transcript width', async () => {
    const [layout, conversation, composition] = await Promise.all([
      readFile(layoutClient, 'utf8'),
      readFile(conversationClient, 'utf8'),
      readFile(path.join(projectRoot, 'build', 'dsh-desktop.patch.yml'), 'utf8')
    ])

    expect(layout).toContain('const productTitle = "Casleo"')
    expect(layout).not.toContain('const productTitle = "DeepSeek Harness"')
    // Width handles are gone; ignore any stored preference so an old drag cannot
    // trap the transcript at a width the user can no longer change.
    expect(conversation).toContain('function readWidthPreference() {\n\t\t\treturn null;\n\t\t}')
    expect(conversation).toContain(
      'variant === "composer" && extensionZone !== void 0 ? renderSlot("conversation.composer.dock", extensionZone) : null'
    )
    expect(conversation).not.toContain('max-width:240px;flex:none')
    expect(composition.replace(/\r\n/gu, '\n')).toContain('- id: ui-message-feedback\n  disabled: true')
  })
})
