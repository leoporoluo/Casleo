/**
 * Casleo — manage custom OpenAI-compatible providers for OpenCode.
 *
 * It writes the `providers` block of ~/.config/opencode/opencode.json (or
 * opencode.jsonc) directly. OpenCode watches that file and rebuilds its
 * catalog on its own, so the provider shows up in OpenChamber's
 * Settings → Providers without going through the integration credential API.
 *
 * Everything the user fills in — provider name, base URL, API key, models,
 * context length and reasoning levels — is written as plain provider config.
 */
import { connectHost, HostRequestError } from '@openchamber/sdk';
import {
  applyHostReady,
  mountBanner,
  mountButton,
  mountEmpty,
  mountList,
  mountSelect,
  mountSeparator,
  mountSpinner,
  mountTextField,
} from '@openchamber/sdk/ui';

/* ----------------------------------------------------------------- config */

const CONFIG_PATHS = [
  '~/.config/opencode/opencode.json',
  '~/.config/opencode/opencode.jsonc',
] as const;

const DEFAULT_CONFIG: JsonObject = { $schema: 'https://opencode.ai/config.json' };

/* ------------------------------------------------------------------ types */

type JsonObject = { [key: string]: Json };
type Json = string | number | boolean | null | Json[] | JsonObject;

const isObject = (value: unknown): value is JsonObject => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const PROTOCOLS = [
  { id: 'openai-chat', label: 'OpenAI Chat Completions', package: 'aisdk:@ai-sdk/openai-compatible' },
  { id: 'openai-responses', label: 'OpenAI Responses', package: 'aisdk:@ai-sdk/openai' },
  { id: 'anthropic-messages', label: 'Anthropic Messages', package: 'aisdk:@ai-sdk/anthropic' },
] as const;

type ProtocolId = (typeof PROTOCOLS)[number]['id'];

type ModelDraft = {
  key: string;
  id: string;
  name: string;
  context: string;
  output: string;
  reasoning: string;
};

type ProviderDraft = {
  providerID: string;
  name: string;
  protocol: ProtocolId;
  baseURL: string;
  apiKey: string;
  models: ModelDraft[];
};

type Disposable = { dispose: () => void };

/* ------------------------------------------------------------------- i18n */

const STRINGS = {
  en: {
    title: 'Casleo',
    tagline: 'Custom providers for OpenCode',
    add: 'Add provider',
    loading: 'Reading opencode.json…',
    readFailed: 'Could not read opencode.json',
    retry: 'Try again',
    emptyTitle: 'No custom providers yet',
    emptyBody: 'Add an OpenAI-compatible endpoint. Casleo writes it into ~/.config/opencode/opencode.json, so it appears under Settings → Providers.',
    newTitle: 'New provider',
    editTitle: 'Edit provider',
    back: 'Back',
    fieldID: 'Provider ID',
    fieldIDHelp: 'Lowercase letters, numbers, hyphens, and underscores. Used as the OpenCode provider id.',
    placeholderID: 'my-provider',
    fieldName: 'Display name',
    fieldNameHelp: 'Shown in the provider and model pickers.',
    placeholderName: 'My Provider',
    fieldProtocol: 'API protocol',
    fieldBaseURL: 'Base URL',
    fieldBaseURLHelp: 'OpenAI-compatible API base URL. Must start with http:// or https://.',
    placeholderBaseURL: 'https://api.example.com/v1',
    fieldAPIKey: 'API key',
    fieldAPIKeyHelp: 'Written to opencode.json as settings.apiKey. Use {env:VAR_NAME} to read a key from the environment instead.',
    placeholderAPIKey: 'sk-... or {env:VAR_NAME}',
    modelsTitle: 'Models',
    modelID: 'Model ID',
    placeholderModelID: 'gpt-4o',
    modelName: 'Model name',
    placeholderModelName: 'GPT-4o',
    modelContext: 'Context length',
    placeholderContext: '128000',
    modelOutput: 'Max output',
    placeholderOutput: '32000',
    modelReasoning: 'Reasoning levels',
    modelReasoningHelp: 'Optional. Comma-separated effort levels the endpoint accepts, e.g. low, medium, high. Each one becomes a variant you can pick in the model selector.',
    placeholderReasoning: 'low, medium, high',
    addModel: 'Add model',
    removeModel: 'Remove model',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    delete: 'Delete provider',
    confirmDelete: 'Delete this provider?',
    confirmDeleteBody: '{name} will be removed from opencode.json.',
    deleteConfirm: 'Delete',
    deleteCancel: 'Keep',
    saved: 'Saved {name}',
    deleted: 'Deleted {name}',
    errID: 'Use lowercase letters, digits, - and _ only.',
    errIDExists: 'A provider with this ID already exists.',
    errName: 'Enter a display name.',
    errURL: 'Base URL must start with http:// or https://',
    errModel: 'Add at least one model with an ID.',
    modelCount: '{count} models',
  },
  zh: {
    title: 'Casleo',
    tagline: 'OpenCode 自定义供应商',
    add: '新增供应商',
    loading: '正在读取 opencode.json…',
    readFailed: '无法读取 opencode.json',
    retry: '重试',
    emptyTitle: '还没有自定义供应商',
    emptyBody: '添加一个 OpenAI 兼容的中转站。Casleo 会把它写进 ~/.config/opencode/opencode.json，保存后就会出现在「设置 → 提供商」里。',
    newTitle: '新增供应商',
    editTitle: '编辑供应商',
    back: '返回',
    fieldID: '提供商 ID',
    fieldIDHelp: '小写字母、数字、连字符和下划线。用作 OpenCode 提供商 ID。',
    placeholderID: 'my-provider',
    fieldName: '显示名称',
    fieldNameHelp: '显示在提供商和模型选择器中。',
    placeholderName: '我的提供商',
    fieldProtocol: 'API 协议',
    fieldBaseURL: '基础 URL',
    fieldBaseURLHelp: '兼容 OpenAI 的 API 基础 URL。必须以 http:// 或 https:// 开头。',
    placeholderBaseURL: 'https://api.example.com/v1',
    fieldAPIKey: 'API 密钥',
    fieldAPIKeyHelp: '会写进 opencode.json 的 settings.apiKey；填 {env:VAR_NAME} 则从环境变量读取。',
    placeholderAPIKey: 'sk-... 或 {env:VAR_NAME}',
    modelsTitle: '模型',
    modelID: '模型 ID',
    placeholderModelID: 'gpt-4o',
    modelName: '模型名称',
    placeholderModelName: 'GPT-4o',
    modelContext: '上下文长度',
    placeholderContext: '128000',
    modelOutput: '最大输出',
    placeholderOutput: '32000',
    modelReasoning: '推理等级',
    modelReasoningHelp: '可选。以逗号分隔填写端点支持的推理强度，例如 low, medium, high。每个等级都会成为模型选择器里可选的变体。',
    placeholderReasoning: 'low, medium, high',
    addModel: '添加模型',
    removeModel: '移除模型',
    save: '保存',
    saving: '保存中…',
    cancel: '取消',
    delete: '删除供应商',
    confirmDelete: '确认删除？',
    confirmDeleteBody: '{name} 将从 opencode.json 中移除。',
    deleteConfirm: '删除',
    deleteCancel: '保留',
    saved: '已保存 {name}',
    deleted: '已删除 {name}',
    errID: '只能使用小写字母、数字、- 和 _。',
    errIDExists: '该 ID 已存在。',
    errName: '请填写供应商名称。',
    errURL: 'Base URL 需要以 http:// 或 https:// 开头。',
    errModel: '至少填写一个模型 ID。',
    modelCount: '{count} 个模型',
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

/* ------------------------------------------------------------- json + jsonc */

/** Drop line and block comments that sit outside strings. */
const stripComments = (text: string): string => {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const next = text[index + 1];
    if (inLine) {
      if (char === '\n') {
        inLine = false;
        out += char;
      }
      continue;
    }
    if (inBlock) {
      if (char === '*' && next === '/') {
        inBlock = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        index += 1;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      inLine = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlock = true;
      index += 1;
      continue;
    }
    out += char;
  }
  return out;
};

/** Drop trailing commas that sit outside strings. */
const stripTrailingCommas = (text: string): string => {
  let out = '';
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inString) {
      out += char;
      if (char === '\\') {
        out += text[index + 1] ?? '';
        index += 1;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === ',') {
      let look = index + 1;
      while (look < text.length && /\s/.test(text[look]!)) look += 1;
      if (text[look] === '}' || text[look] === ']') continue;
    }
    out += char;
  }
  return out;
};

const parseConfig = (text: string): JsonObject => {
  try {
    const value: unknown = JSON.parse(text);
    if (!isObject(value)) throw new Error('The config root must be a JSON object.');
    return value;
  } catch (error) {
    const relaxed = stripTrailingCommas(stripComments(text));
    const value: unknown = JSON.parse(relaxed);
    if (!isObject(value)) throw new Error('The config root must be a JSON object.');
    void error;
    return value;
  }
};

const errorText = (error: unknown): string => (
  error instanceof HostRequestError
    ? `${error.code}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error)
);

/* --------------------------------------------------------------- providers */

const protocolFromPackage = (pkg: string): ProtocolId => {
  if (pkg.includes('anthropic')) return 'anthropic-messages';
  if (pkg.includes('openai-compatible') || pkg.includes('/chat')) return 'openai-chat';
  if (pkg.includes('openai')) return 'openai-responses';
  return 'openai-chat';
};

let modelKeySeq = 0;
const emptyModel = (): ModelDraft => ({
  key: `m${modelKeySeq += 1}`,
  id: '',
  name: '',
  context: '',
  output: '',
  reasoning: '',
});

const emptyDraft = (): ProviderDraft => ({
  providerID: '',
  name: '',
  protocol: 'openai-chat',
  baseURL: '',
  apiKey: '',
  models: [emptyModel()],
});

const settingsOf = (provider: JsonObject): JsonObject => (
  isObject(provider.settings) ? provider.settings : isObject(provider.options) ? provider.options : {}
);

const packageOf = (provider: JsonObject): string => {
  if (typeof provider.package === 'string') return provider.package;
  if (isObject(provider.api) && typeof provider.api.npm === 'string') return `aisdk:${provider.api.npm}`;
  return '';
};

const readModels = (provider: JsonObject): ModelDraft[] => {
  const models = provider.models;
  const pairs: Array<[string, Json]> = Array.isArray(models)
    ? models.map((item, index) => {
        const entry = isObject(item) ? item : {};
        const id = typeof entry.modelID === 'string' ? entry.modelID : typeof entry.id === 'string' ? entry.id : String(index);
        return [id, item] as [string, Json];
      })
    : isObject(models)
      ? Object.entries(models)
      : [];

  const drafts = pairs.map(([key, value]) => {
    const entry = isObject(value) ? value : {};
    const id = typeof entry.modelID === 'string' && entry.modelID ? entry.modelID : key;
    const limit = isObject(entry.limit) ? entry.limit : {};
    const variants = Array.isArray(entry.variants)
      ? entry.variants
          .map((variant) => (isObject(variant) && typeof variant.id === 'string' ? variant.id : ''))
          .filter((id) => id.length > 0)
      : [];
    return {
      key: `m${modelKeySeq += 1}`,
      id,
      name: typeof entry.name === 'string' && entry.name ? entry.name : id,
      context: typeof limit.context === 'number' ? String(limit.context) : '',
      output: typeof limit.output === 'number' ? String(limit.output) : '',
      reasoning: variants.join(', '),
    };
  });

  return drafts.length > 0 ? drafts : [emptyModel()];
};

const draftFrom = (id: string, provider: JsonObject): ProviderDraft => {
  const settings = settingsOf(provider);
  return {
    providerID: id,
    name: typeof provider.name === 'string' && provider.name ? provider.name : id,
    protocol: protocolFromPackage(packageOf(provider)),
    baseURL: typeof settings.baseURL === 'string' ? settings.baseURL : '',
    apiKey: typeof settings.apiKey === 'string' ? settings.apiKey : '',
    models: readModels(provider),
  };
};

const variantOverlay = (protocol: ProtocolId, effort: string): JsonObject => {
  if (protocol === 'anthropic-messages') {
    return { thinking: { type: 'adaptive', display: 'summarized' }, effort };
  }
  if (protocol === 'openai-responses') {
    return { reasoningEffort: effort, reasoningSummary: 'auto', include: ['reasoning.encrypted_content'] };
  }
  return { reasoningEffort: effort };
};

const buildProvider = (draft: ProviderDraft): JsonObject => {
  const models: JsonObject = {};
  for (const model of draft.models) {
    const id = model.id.trim();
    if (!id) continue;
    const entry: JsonObject = { modelID: id, name: model.name.trim() || id };
    const context = Number.parseInt(model.context, 10);
    const output = Number.parseInt(model.output, 10);
    const limit: JsonObject = {};
    if (Number.isFinite(context) && context > 0) limit.context = context;
    if (Number.isFinite(output) && output > 0) limit.output = output;
    if (Object.keys(limit).length > 0) entry.limit = limit;
    const levels = model.reasoning.split(/[,\s]+/).map((level) => level.trim()).filter(Boolean);
    if (levels.length > 0) {
      entry.variants = levels.map((level) => ({ id: level, settings: variantOverlay(draft.protocol, level) }));
    }
    models[id] = entry;
  }

  const settings: JsonObject = { baseURL: draft.baseURL.trim() };
  const apiKey = draft.apiKey.trim();
  if (apiKey) settings.apiKey = apiKey;

  return {
    name: draft.name.trim() || draft.providerID.trim(),
    package: PROTOCOLS.find((protocol) => protocol.id === draft.protocol)!.package,
    settings,
    models,
  };
};

const collectProviders = (config: JsonObject): Array<{ id: string; config: JsonObject }> => {
  const found = new Map<string, JsonObject>();
  for (const key of ['provider', 'providers'] as const) {
    const block = config[key];
    if (!isObject(block)) continue;
    for (const [id, value] of Object.entries(block)) {
      if (isObject(value)) found.set(id, value);
    }
  }
  return [...found.entries()]
    .map(([id, value]) => ({ id, config: value }))
    .sort((left, right) => left.id.localeCompare(right.id));
};

/* ------------------------------------------------------------------- state */

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('#root is missing');

let t: Strings = STRINGS.en;
let view: 'list' | 'form' = 'list';
let editingId: string | null = null;
let entries: Array<{ id: string; config: JsonObject }> = [];
let loading = true;
let fatal: string | null = null;
let draft: ProviderDraft | null = null;
let fieldErrors: Record<string, string | undefined> = {};
let confirmingDelete = false;
let busy = false;
let mounted: Disposable[] = [];

/* ------------------------------------------------------------------ layout */

const clearMounted = (): void => {
  for (const item of mounted.splice(0)) item.dispose();
  while (root.firstChild) root.removeChild(root.firstChild);
};

const column = (parent: Element, gap = '10px'): HTMLElement => {
  const box = document.createElement('div');
  box.style.display = 'flex';
  box.style.flexDirection = 'column';
  box.style.gap = gap;
  box.style.minWidth = '0';
  parent.append(box);
  return box;
};

const row = (parent: Element, gap = '8px'): HTMLElement => {
  const box = document.createElement('div');
  box.style.display = 'flex';
  box.style.alignItems = 'center';
  box.style.gap = gap;
  box.style.flexWrap = 'wrap';
  box.style.minWidth = '0';
  parent.append(box);
  return box;
};

const muted = (parent: Element, text: string, size = '11px'): HTMLElement => {
  const node = document.createElement('div');
  node.textContent = text;
  node.style.fontSize = size;
  node.style.lineHeight = '1.5';
  node.style.opacity = '0.65';
  parent.append(node);
  return node;
};

const heading = (parent: Element, text: string, size = '14px'): HTMLElement => {
  const node = document.createElement('div');
  node.textContent = text;
  node.style.fontSize = size;
  node.style.fontWeight = '600';
  node.style.lineHeight = '1.3';
  parent.append(node);
  return node;
};

const flexColumn = (parent: Element, basis = '120px'): HTMLElement => {
  const box = column(parent, '0');
  box.style.flex = `1 1 ${basis}`;
  return box;
};

/* --------------------------------------------------------------- file i/o */

const readConfig = async (): Promise<{ config: JsonObject; path: string }> => {
  for (const path of CONFIG_PATHS) {
    const stat = await host.stat(path);
    if (stat.kind === 'file') {
      const { content } = await host.readFile(path);
      return { config: parseConfig(content), path };
    }
    if (stat.kind !== 'missing') {
      throw new Error(`${path} is a ${stat.kind}, not a file.`);
    }
  }
  return { config: { ...DEFAULT_CONFIG }, path: CONFIG_PATHS[0] };
};

const writeConfig = async (path: string, config: JsonObject): Promise<void> => {
  await host.writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
};

const load = async (): Promise<void> => {
  loading = true;
  fatal = null;
  render();
  try {
    const { config } = await readConfig();
    entries = collectProviders(config);
  } catch (error) {
    fatal = errorText(error);
    entries = [];
  } finally {
    loading = false;
    render();
  }
};

/* ----------------------------------------------------------------- actions */

const validate = (current: ProviderDraft): Record<string, string | undefined> => {
  const errors: Record<string, string | undefined> = {};
  const id = current.providerID.trim();
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(id)) {
    errors.providerID = t.errID;
  } else if (editingId === null && entries.some((entry) => entry.id === id)) {
    errors.providerID = t.errIDExists;
  }
  if (!current.name.trim()) errors.name = t.errName;
  if (!/^https?:\/\//.test(current.baseURL.trim())) errors.baseURL = t.errURL;
  if (!current.models.some((model) => model.id.trim().length > 0)) errors.models = t.errModel;
  return errors;
};

const saveDraft = async (): Promise<void> => {
  if (!draft) return;
  fieldErrors = validate(draft);
  if (Object.keys(fieldErrors).length > 0) {
    render();
    return;
  }
  const current = draft;
  busy = true;
  render();
  try {
    const { config, path } = await readConfig();
    const id = current.providerID.trim();
    const providers = isObject(config.providers) ? { ...config.providers } : {};
    providers[id] = buildProvider(current);
    config.providers = providers;
    if (isObject(config.provider)) {
      const legacy = { ...config.provider };
      delete legacy[id];
      config.provider = legacy;
    }
    await writeConfig(path, config);
    await host.toast({ kind: 'success', message: t.saved.replace('{name}', current.name.trim() || id) });
    busy = false;
    view = 'list';
    editingId = null;
    draft = null;
    fieldErrors = {};
    confirmingDelete = false;
    await load();
  } catch (error) {
    fatal = errorText(error);
    busy = false;
    render();
  }
};

const deleteProvider = async (): Promise<void> => {
  const id = editingId;
  if (!id) return;
  busy = true;
  render();
  try {
    const { config, path } = await readConfig();
    let removed = false;
    for (const key of ['provider', 'providers'] as const) {
      const block = config[key];
      if (!isObject(block) || !(id in block)) continue;
      const next = { ...block };
      delete next[id];
      config[key] = next;
      removed = true;
    }
    if (removed) await writeConfig(path, config);
    await host.toast({ kind: 'success', message: t.deleted.replace('{name}', id) });
    busy = false;
    view = 'list';
    editingId = null;
    draft = null;
    fieldErrors = {};
    confirmingDelete = false;
    await load();
  } catch (error) {
    fatal = errorText(error);
    busy = false;
    render();
  }
};

/* ------------------------------------------------------------------ render */

const openCreate = (): void => {
  view = 'form';
  editingId = null;
  draft = emptyDraft();
  fieldErrors = {};
  confirmingDelete = false;
  fatal = null;
  render();
};

const renderList = (body: HTMLElement): void => {
  const header = row(body);
  header.style.justifyContent = 'space-between';
  const titles = column(header, '2px');
  heading(titles, t.title, '15px');
  muted(titles, t.tagline);

  mounted.push(mountButton(header, { label: t.add, size: 'sm', onClick: openCreate }));

  if (loading) {
    mounted.push(mountSpinner(body, { label: t.loading }));
    return;
  }

  if (fatal) {
    mounted.push(mountBanner(body, {
      tone: 'error',
      title: t.readFailed,
      body: fatal,
      action: { label: t.retry, onClick: () => void load() },
    }));
    return;
  }

  if (entries.length === 0) {
    mounted.push(mountEmpty(body, { title: t.emptyTitle, body: t.emptyBody, action: { label: t.add, onClick: openCreate } }));
    return;
  }

  mounted.push(mountList(body, {
    ariaLabel: t.title,
    items: entries.map((entry) => {
      const name = typeof entry.config.name === 'string' && entry.config.name ? entry.config.name : entry.id;
      const settings = settingsOf(entry.config);
      const baseURL = typeof settings.baseURL === 'string' ? settings.baseURL : '';
      const models = entry.config.models;
      const count = isObject(models) ? Object.keys(models).length : Array.isArray(models) ? models.length : 0;
      return {
        id: entry.id,
        leading: entry.id,
        title: name,
        subtitle: baseURL || undefined,
        badge: { label: t.modelCount.replace('{count}', String(count)), tone: count > 0 ? 'info' : 'warning' },
      };
    }),
    onSelect: (id) => {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry) return;
      view = 'form';
      editingId = id;
      draft = draftFrom(id, entry.config);
      fieldErrors = {};
      confirmingDelete = false;
      fatal = null;
      render();
    },
  }));
};

const renderForm = (body: HTMLElement): void => {
  const current = draft;
  if (!current) return;
  const isNew = editingId === null;

  const header = row(body);
  header.style.justifyContent = 'space-between';
  mounted.push(mountButton(header, {
    label: `← ${t.back}`,
    variant: 'ghost',
    size: 'sm',
    onClick: () => {
      view = 'list';
      draft = null;
      fieldErrors = {};
      confirmingDelete = false;
      fatal = null;
      render();
    },
  }));
  heading(header, isNew ? t.newTitle : t.editTitle, '13px');

  if (fieldErrors.models) {
    mounted.push(mountBanner(body, { tone: 'warning', title: t.modelsTitle, body: fieldErrors.models }));
  }
  if (fatal) {
    mounted.push(mountBanner(body, { tone: 'error', title: t.readFailed, body: fatal }));
  }

  mounted.push(mountTextField(body, {
    label: t.fieldID,
    value: current.providerID,
    mono: true,
    disabled: !isNew,
    error: fieldErrors.providerID,
    helper: t.fieldIDHelp,
    placeholder: t.placeholderID,
    onChange: (value) => { current.providerID = value; },
  }));
  mounted.push(mountTextField(body, {
    label: t.fieldName,
    value: current.name,
    error: fieldErrors.name,
    helper: t.fieldNameHelp,
    placeholder: t.placeholderName,
    onChange: (value) => { current.name = value; },
  }));
  mounted.push(mountSelect(body, {
    label: t.fieldProtocol,
    value: current.protocol,
    options: PROTOCOLS.map((protocol) => ({ id: protocol.id, label: protocol.label })),
    onChange: (id) => { current.protocol = id as ProtocolId; },
  }));
  mounted.push(mountTextField(body, {
    label: t.fieldBaseURL,
    value: current.baseURL,
    mono: true,
    error: fieldErrors.baseURL,
    helper: t.fieldBaseURLHelp,
    placeholder: t.placeholderBaseURL,
    onChange: (value) => { current.baseURL = value; },
  }));
  mounted.push(mountTextField(body, {
    label: t.fieldAPIKey,
    value: current.apiKey,
    password: true,
    mono: true,
    helper: t.fieldAPIKeyHelp,
    placeholder: t.placeholderAPIKey,
    onChange: (value) => { current.apiKey = value; },
  }));

  mounted.push(mountSeparator(body, { label: t.modelsTitle }));

  current.models.forEach((model, index) => {
    const block = column(body, '8px');
    block.style.border = '1px solid var(--oc-border, rgba(127, 127, 127, 0.25))';
    block.style.borderRadius = 'var(--oc-radius, 8px)';
    block.style.padding = '10px';

    const head = row(block);
    head.style.justifyContent = 'space-between';
    muted(head, `#${index + 1}`);
    mounted.push(mountButton(head, {
      label: t.removeModel,
      variant: 'ghost',
      size: 'xs',
      disabled: current.models.length <= 1,
      onClick: () => {
        current.models.splice(index, 1);
        render();
      },
    }));

    mounted.push(mountTextField(block, {
      label: t.modelID,
      value: model.id,
      mono: true,
      placeholder: t.placeholderModelID,
      onChange: (value) => { model.id = value; },
    }));
    mounted.push(mountTextField(block, {
      label: t.modelName,
      value: model.name,
      placeholder: t.placeholderModelName,
      onChange: (value) => { model.name = value; },
    }));

    const sizes = row(block);
    mounted.push(mountTextField(flexColumn(sizes), {
      label: t.modelContext,
      value: model.context,
      placeholder: t.placeholderContext,
      onChange: (value) => { model.context = value; },
    }));
    mounted.push(mountTextField(flexColumn(sizes), {
      label: t.modelOutput,
      value: model.output,
      placeholder: t.placeholderOutput,
      onChange: (value) => { model.output = value; },
    }));

    mounted.push(mountTextField(block, {
      label: t.modelReasoning,
      value: model.reasoning,
      helper: t.modelReasoningHelp,
      placeholder: t.placeholderReasoning,
      onChange: (value) => { model.reasoning = value; },
    }));
  });

  mounted.push(mountButton(body, {
    label: t.addModel,
    variant: 'outline',
    size: 'sm',
    onClick: () => {
      current.models.push(emptyModel());
      render();
    },
  }));

  mounted.push(mountSeparator(body));

  const actions = row(body);
  mounted.push(mountButton(actions, {
    label: busy ? t.saving : t.save,
    loading: busy,
    onClick: () => void saveDraft(),
  }));
  mounted.push(mountButton(actions, {
    label: t.cancel,
    variant: 'ghost',
    disabled: busy,
    onClick: () => {
      view = 'list';
      draft = null;
      fieldErrors = {};
      confirmingDelete = false;
      fatal = null;
      render();
    },
  }));

  if (!isNew) {
    mounted.push(mountSeparator(body));
    if (confirmingDelete) {
      mounted.push(mountBanner(body, {
        tone: 'warning',
        title: t.confirmDelete,
        body: t.confirmDeleteBody.replace('{name}', current.name.trim() || current.providerID.trim()),
        action: { label: t.deleteConfirm, onClick: () => void deleteProvider() },
      }));
      mounted.push(mountButton(body, {
        label: t.deleteCancel,
        variant: 'ghost',
        size: 'sm',
        disabled: busy,
        onClick: () => { confirmingDelete = false; render(); },
      }));
    } else {
      mounted.push(mountButton(body, {
        label: t.delete,
        variant: 'destructive',
        size: 'sm',
        disabled: busy,
        onClick: () => { confirmingDelete = true; render(); },
      }));
    }
  }
};

const render = (): void => {
  clearMounted();
  const shell = document.createElement('div');
  shell.className = 'casleo-shell';
  root.append(shell);
  const body = column(shell, '12px');
  if (view === 'form') renderForm(body);
  else renderList(body);
};

/* ------------------------------------------------------------------- start */

let didMount = false;
let lastLocale = '';
host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement);
  document.documentElement.dataset.surface = ctx.surface;
  const locale = ctx.locale ?? '';
  const localeChanged = locale !== lastLocale;
  lastLocale = locale;
  t = locale.toLowerCase().startsWith('zh') ? STRINGS.zh : STRINGS.en;
  if (didMount) {
    if (localeChanged) render();
    return;
  }
  didMount = true;
  void load();
});
