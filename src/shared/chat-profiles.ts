export const DEFAULT_CONTEXT_WINDOW = 128_000;
export const DEFAULT_MAX_TOKENS = 32_768;
export const DEFAULT_PROFILE_EFFORT = "medium";
export const API_TRANSPORTS = ["openai-responses", "openai-completions", "anthropic-messages"] as const;
export type ApiTransport = (typeof API_TRANSPORTS)[number];

export interface CustomApiProfile {
  id: string;
  name: string;
  url: string;
  model: string;
  apiKey: string;
  contextWindow?: number;
  maxTokens?: number;
  effort: string;
  transport: ApiTransport;
}

export interface ChatProfiles {
  kind: "custom";
  customProfiles: CustomApiProfile[];
  activeCustomId: string;
}

export function newCustomProfileId(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultCustomProfile(partial: Partial<CustomApiProfile> = {}): CustomApiProfile {
  const contextWindow = tokenCount(partial.contextWindow);
  const maxTokens = clampMaxTokens(tokenCount(partial.maxTokens), contextWindow);
  return {
    id: partial.id ?? newCustomProfileId(),
    name: partial.name?.trim() || "未命名",
    url: partial.url?.trim() ?? "",
    model: partial.model?.trim() ?? "",
    apiKey: partial.apiKey?.trim() ?? "",
    ...(contextWindow ? { contextWindow } : {}),
    ...(maxTokens ? { maxTokens } : {}),
    effort: partial.effort?.trim() || DEFAULT_PROFILE_EFFORT,
    transport: API_TRANSPORTS.includes(partial.transport as ApiTransport)
      ? partial.transport as ApiTransport
      : "openai-responses",
  };
}

export function emptyChatProfiles(): ChatProfiles {
  const profile = defaultCustomProfile({ name: "默认" });
  return { kind: "custom", customProfiles: [profile], activeCustomId: profile.id };
}

export function activeCustomProfile(profiles: ChatProfiles): CustomApiProfile | undefined {
  return profiles.customProfiles.find((item) => item.id === profiles.activeCustomId)
    ?? profiles.customProfiles[0];
}

export function activeChat(profiles: ChatProfiles) {
  const profile = activeCustomProfile(profiles);
  if (!profile) return { url: "", model: "", apiKey: "" };
  return {
    url: profile.url.trim(),
    model: profile.model.trim(),
    apiKey: profile.apiKey.trim(),
  };
}

export function clampMaxTokens(maxTokens: number | undefined, contextWindow: number | undefined): number | undefined {
  if (maxTokens === undefined) return undefined;
  if (contextWindow === undefined) return maxTokens;
  return Math.min(maxTokens, contextWindow);
}

export function parseChatProfiles(raw: unknown): ChatProfiles | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  if (value.kind !== "custom" && !Array.isArray(value.customProfiles) && !value.custom) return undefined;

  const listedProfiles = Array.isArray(value.customProfiles) ? value.customProfiles : [];
  let customProfiles = listedProfiles
    .map((item) => parseCustomProfile(item))
    .filter((item): item is CustomApiProfile => Boolean(item));
  let activeCustomId = text(value.activeCustomId);

  if (!Array.isArray(value.customProfiles)) {
    const legacy = value.custom && typeof value.custom === "object" && !Array.isArray(value.custom)
      ? value.custom as Record<string, unknown>
      : {};
    const migrated = profileFromRecord(legacy, activeCustomId);
    customProfiles = migrated ? [migrated] : [];
    activeCustomId = migrated?.id ?? "";
  }

  const active = customProfiles.some((item) => item.id === activeCustomId)
    ? activeCustomId
    : customProfiles[0]?.id ?? "";
  return { kind: "custom", customProfiles, activeCustomId: active };
}

export function migrateChatProfiles(stored: { url?: string; model?: string; apiKey?: string }): ChatProfiles {
  const url = stored.url?.trim() ?? "";
  const model = stored.model?.trim() ?? "";
  const apiKey = stored.apiKey?.trim() ?? "";
  if (!url && !model && !apiKey) return emptyChatProfiles();
  const profile = defaultCustomProfile({ name: "默认", url, model, apiKey });
  return { kind: "custom", customProfiles: [profile], activeCustomId: profile.id };
}

function mergeCustomProfile(previous: CustomApiProfile | undefined, next: CustomApiProfile): CustomApiProfile {
  const contextWindow = next.contextWindow;
  const maxTokens = clampMaxTokens(next.maxTokens, contextWindow);
  return defaultCustomProfile({
    id: next.id,
    name: next.name.trim() || previous?.name || "未命名",
    url: next.url.trim() || previous?.url || "",
    model: next.model.trim() || previous?.model || "",
    apiKey: next.apiKey.trim() || previous?.apiKey || "",
    contextWindow,
    maxTokens,
    effort: next.effort || previous?.effort || DEFAULT_PROFILE_EFFORT,
    transport: next.transport || previous?.transport || "openai-responses",
  });
}

export function mergeChatProfiles(previous: ChatProfiles, next: ChatProfiles): ChatProfiles {
  const previousById = new Map(previous.customProfiles.map((item) => [item.id, item]));
  const customProfiles = next.customProfiles.map((item) => mergeCustomProfile(previousById.get(item.id), item));
  const activeCustomId = customProfiles.some((item) => item.id === next.activeCustomId)
    ? next.activeCustomId
    : customProfiles[0]?.id ?? "";
  return { kind: "custom", customProfiles, activeCustomId };
}

export function buildCustomProfilesPayload(
  profiles: CustomApiProfile[],
  activeCustomId: string,
  draft: Pick<CustomApiProfile, "name" | "url" | "model" | "apiKey">
    & Partial<Pick<CustomApiProfile, "contextWindow" | "maxTokens" | "effort">>,
): { customProfiles: CustomApiProfile[]; activeCustomId: string } {
  const nextProfiles = profiles.map((item) => (
    item.id === activeCustomId
      ? defaultCustomProfile({
        id: item.id,
        name: draft.name,
        url: draft.url,
        model: draft.model,
        apiKey: draft.apiKey,
        contextWindow: draft.contextWindow,
        maxTokens: draft.maxTokens,
        effort: draft.effort,
        transport: item.transport,
      })
      : item
  ));
  return {
    customProfiles: nextProfiles,
    activeCustomId: nextProfiles.some((item) => item.id === activeCustomId)
      ? activeCustomId
      : nextProfiles[0]?.id ?? activeCustomId,
  };
}

function profileFromRecord(value: Record<string, unknown>, id: string): CustomApiProfile | undefined {
  const url = text(value.url);
  const model = text(value.model);
  const apiKey = text(value.apiKey);
  const maxTokens = tokenCount(value.maxTokens);
  if (!url && !model && !apiKey) return undefined;
  return defaultCustomProfile({
    id: id || newCustomProfileId(),
    name: text(value.name) || "默认",
    url,
    model,
    apiKey,
    ...(maxTokens ? { maxTokens } : {}),
  });
}

function parseCustomProfile(raw: unknown): CustomApiProfile | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const id = text(value.id);
  if (!id) return undefined;
  const contextWindow = tokenCount(value.contextWindow);
  const maxTokens = tokenCount(value.maxTokens);
  const legacyForcedDefaults = contextWindow === 272_000 && maxTokens === 32_768;
  return defaultCustomProfile({
    id,
    name: text(value.name) || "未命名",
    url: text(value.url),
    model: text(value.model),
    apiKey: text(value.apiKey),
    ...(!legacyForcedDefaults && contextWindow ? { contextWindow } : {}),
    ...(!legacyForcedDefaults && maxTokens ? { maxTokens } : {}),
    ...(typeof value.effort === "string" ? { effort: value.effort } : {}),
    ...(API_TRANSPORTS.includes(value.transport as ApiTransport)
      ? { transport: value.transport as ApiTransport }
      : {}),
  });
}

function tokenCount(value: unknown): number | undefined {
  const n = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(Math.floor(n), 2_000_000);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
