import { describe, expect, it } from "vitest";
import {
  activeChat,
  activeCustomProfile,
  buildCustomProfilesPayload,
  defaultCustomProfile,
  emptyChatProfiles,
  mergeChatProfiles,
  migrateChatProfiles,
  parseChatProfiles,
} from "./chat-profiles";

describe("generic chat profiles", () => {
  it("creates an empty profile without a provider default", () => {
    const profiles = emptyChatProfiles();
    expect(profiles.kind).toBe("custom");
    expect(profiles.customProfiles[0]).toMatchObject({ name: "默认", url: "", model: "", apiKey: "" });
    expect(JSON.stringify(profiles)).not.toMatch(/deepseek/i);
  });

  it("migrates a stored gateway into the generic profile list", () => {
    const migrated = migrateChatProfiles({
      url: "https://www.codex5.net/v1",
      model: "gpt-5.5",
      apiKey: "sk-custom",
    });
    expect(activeCustomProfile(migrated)).toMatchObject({
      url: "https://www.codex5.net/v1",
      model: "gpt-5.5",
      apiKey: "sk-custom",
    });
  });

  it("keeps explicit provider data as ordinary profile data", () => {
    const migrated = migrateChatProfiles({
      url: "https://api.example.test/v1",
      model: "provider-model",
      apiKey: "sk-provider",
    });
    expect(activeChat(migrated)).toEqual({
      url: "https://api.example.test/v1",
      model: "provider-model",
      apiKey: "sk-provider",
    });
  });
});

describe("mergeChatProfiles", () => {
  it("preserves existing values when a UI draft leaves them blank", () => {
    const gateway = defaultCustomProfile({
      name: "中转 A",
      url: "https://www.codex5.net/v1",
      model: "gpt-5.5",
      apiKey: "sk-custom",
    });
    const merged = mergeChatProfiles(
      { kind: "custom", customProfiles: [gateway], activeCustomId: gateway.id },
      {
        kind: "custom",
        customProfiles: [defaultCustomProfile({ id: gateway.id, name: "", url: "", model: "", apiKey: "" })],
        activeCustomId: gateway.id,
      },
    );
    expect(activeCustomProfile(merged)).toMatchObject({
      url: "https://www.codex5.net/v1",
      model: "gpt-5.5",
      apiKey: "sk-custom",
    });
  });

  it("keeps an explicitly empty profile list", () => {
    const gateway = defaultCustomProfile({ url: "https://a.example/v1", model: "gpt", apiKey: "sk" });
    const merged = mergeChatProfiles(
      { kind: "custom", customProfiles: [gateway], activeCustomId: gateway.id },
      { kind: "custom", customProfiles: [], activeCustomId: "" },
    );
    expect(merged.customProfiles).toEqual([]);
  });
});

describe("parseChatProfiles", () => {
  it("migrates the legacy single custom object", () => {
    const parsed = parseChatProfiles({
      kind: "custom",
      custom: { url: "https://agnes.example.com/v1", model: "gpt", apiKey: "sk", maxTokens: 65536 },
    });
    expect(activeCustomProfile(parsed!)?.maxTokens).toBe(65536);
    expect(parsed?.customProfiles).toHaveLength(1);
  });

  it("keeps multiple custom profiles and selection", () => {
    const first = defaultCustomProfile({ name: "A", url: "https://a.example/v1", model: "gpt-4o", apiKey: "a" });
    const second = defaultCustomProfile({ name: "B", url: "https://b.example/v1", model: "gpt-5", apiKey: "b" });
    const parsed = parseChatProfiles({
      kind: "custom",
      customProfiles: [first, second],
      activeCustomId: second.id,
    });
    expect(parsed?.customProfiles).toHaveLength(2);
    expect(parsed?.activeCustomId).toBe(second.id);
    expect(activeChat(parsed!)).toEqual({ url: "https://b.example/v1", model: "gpt-5", apiKey: "b" });
  });

  it("rejects junk", () => {
    expect(parseChatProfiles(null)).toBeUndefined();
    expect(parseChatProfiles({ kind: "other" })).toBeUndefined();
  });
});

describe("buildCustomProfilesPayload", () => {
  it("updates only the active profile draft", () => {
    const first = defaultCustomProfile({ name: "A", url: "https://a/v1", model: "a", apiKey: "a" });
    const second = defaultCustomProfile({ name: "B", url: "https://b/v1", model: "b", apiKey: "b" });
    const built = buildCustomProfilesPayload([first, second], second.id, {
      name: "B2",
      url: "https://b/v1",
      model: "gpt-5",
      apiKey: "b2",
    });
    expect(built.customProfiles.find((item) => item.id === first.id)).toMatchObject({ model: "a" });
    expect(built.customProfiles.find((item) => item.id === second.id)).toMatchObject({
      name: "B2",
      model: "gpt-5",
      apiKey: "b2",
    });
  });
});
