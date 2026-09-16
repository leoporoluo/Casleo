import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasPatch, patchPath, projectRoot } from './patch-path'

const settingsModelsClient = path.join(
  projectRoot,
  'node_modules',
  '@deepseek-ai',
  'dsh-client-ui-settings-models',
  'lib',
  'client.js'
)

/**
 * Harness took the select-all toggle upstream in 0.1.0-rc.8, so the desktop
 * patch no longer carries it. Assert against the composed package instead: the
 * behavior still has to be there, and the patch still has to stay out of it.
 */
describe('Casleo available-model picker', () => {
  it('ships one state-driven select-all toggle', async () => {
    const client = await readFile(settingsModelsClient, 'utf8')

    expect(client).toContain('const allVisibleCandidatesPicked =')
    expect(client).toContain('visibleCandidates.every((candidate) => picked.has(candidate.id))')
    expect(client).toContain(
      'children: t(allVisibleCandidatesPicked ? "fetchDeselectAll" : "fetchSelectAll")'
    )
    expect(client).toContain('const toggleVisibleCandidates =')
  })

  it('includes English and Chinese copy for both toggle states', async () => {
    const client = await readFile(settingsModelsClient, 'utf8')

    expect(client).toContain('fetchSelectAll: "Select all"')
    expect(client).toContain('fetchDeselectAll: "Deselect all"')
    expect(client).toContain('fetchSelectAll: "全选"')
    expect(client).toContain('fetchDeselectAll: "取消全选"')
  })

  it('leaves the toggle to Harness rather than re-patching it', async () => {
    expect(hasPatch('@deepseek-ai/dsh-client-ui-settings-models')).toBe(true)
    const patch = await readFile(
      patchPath('@deepseek-ai/dsh-client-ui-settings-models'),
      'utf8'
    )

    expect(patch).not.toContain('const allCandidatesPicked =')
    expect(patch).not.toContain('fetchSelectAll: "Select all"')
  })
})

describe('Casleo model image-input declarations', () => {
  it('renders one shared tri-state field for both adapter field names', async () => {
    const client = await readFile(settingsModelsClient, 'utf8')

    expect(client).toContain('function ModelImageInputField(props)')
    expect(client).toContain('field: "inputModalities"')
    expect(client).toContain('field: "input"')
    // "auto" leaves the adapter-owned field undeclared, so the installed model
    // catalog or the provider's defaultInput keeps deciding for that model.
    expect(client).toContain('if (state === "auto") return void 0')
    expect(client).toContain('return state === "image" ? ["text", "image"] : ["text"]')
    // The field reuses the shared disclosure classes so it matches the other
    // advanced fields of the row instead of a desktop-only control.
    expect(client).toContain('ModelsSection_module_css_default["selectInput"]')
    expect(client).toContain('ModelsSection_module_css_default["modelFieldLabel"]')
    expect(client).not.toContain('ModelImageInputToggle')
  })

  it('ships localized tri-state copy and an endpoint warning', async () => {
    const client = await readFile(settingsModelsClient, 'utf8')

    expect(client).toContain('modelImageInput: "Image input"')
    expect(client).toContain('modelImageInputAuto: "Auto"')
    expect(client).toContain('modelImageInputImage: "Images"')
    expect(client).toContain('modelImageInputText: "Text only"')
    expect(client).toContain('the endpoint must support them')
    expect(client).toContain('modelImageInput: "支持图片输入"')
    expect(client).toContain('modelImageInputAuto: "自动"')
    expect(client).toContain('modelImageInputImage: "支持图片"')
    expect(client).toContain('modelImageInputText: "仅文本"')
    expect(client).toContain('请确认接口实际支持')
  })

  it('captures the image-input field in the reproducible dependency patch', async () => {
    const patch = await readFile(
      patchPath('@deepseek-ai/dsh-client-ui-settings-models'),
      'utf8'
    )

    expect(patch).toContain('ModelImageInputField')
    expect(patch).toContain('field: "inputModalities"')
    expect(patch).toContain('field: "input"')
    expect(patch).not.toContain('ModelImageInputToggle')
  })
})