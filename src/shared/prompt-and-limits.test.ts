import { describe, expect, it } from "vitest";
import { applyCasleoSystemPrompt, casleoPromptSuffix } from "casleo-agent-core";
import { FALLBACK_CONTEXT_WINDOW, FALLBACK_MAX_TOKENS, resolveRegisteredLimits } from "casleo-agent-core";
import { clampMaxTokens, defaultCustomProfile, parseChatProfiles } from "../shared/chat-profiles";

describe("casleo system prompt suffix", () => {
  it("keeps the Pi official prompt as a prefix", () => {
    const pi = "You are an expert coding assistant operating inside pi, a coding agent harness.";
    const next = applyCasleoSystemPrompt(pi, { sandbox: "workspace-write", sandboxLabel: "workspace-write", network: false });
    expect(next.startsWith(pi)).toBe(true);
    expect(next).toContain("Casleo rules:");
    expect(next).not.toMatch(/DeepSeek/i);
    expect(next.indexOf("Casleo rules:")).toBeGreaterThan(pi.length);
  });

  it("puts dynamic sandbox lines after the stable Casleo block", () => {
    const suffix = casleoPromptSuffix({ sandbox: "read-only", sandboxLabel: "Seatbelt read-only", network: true });
    expect(suffix.indexOf("You are Casleo")).toBeLessThan(suffix.indexOf("Seatbelt read-only"));
  });

  it("preserves the official prompt bytes before the Casleo suffix", () => {
    const pi = "official prompt\n";
    const next = applyCasleoSystemPrompt(pi, { sandbox: "workspace-write", network: true });
    expect(next.startsWith(pi)).toBe(true);
  });
});

describe("resolveRegisteredLimits", () => {
  it("uses Pi catalog values for gpt-5.6-luna", () => {
    const limits = resolveRegisteredLimits("gpt-5.6-luna");
    expect(limits.contextWindow).toBe(272000);
    expect(limits.maxTokens).toBe(128000);
  });

  it("clamps user maxTokens to the model window", () => {
    const limits = resolveRegisteredLimits("gpt-5.6-luna", { maxTokens: 999999 });
    expect(limits.maxTokens).toBe(272000);
  });

  it("honors a user contextWindow override", () => {
    const limits = resolveRegisteredLimits("gpt-5.6-luna", { contextWindow: 64000, maxTokens: 80000 });
    expect(limits.contextWindow).toBe(64000);
    expect(limits.maxTokens).toBe(64000);
  });

  it("falls back for unknown models", () => {
    const limits = resolveRegisteredLimits("my-local-llm");
    expect(limits.contextWindow).toBe(FALLBACK_CONTEXT_WINDOW);
    expect(limits.maxTokens).toBe(FALLBACK_MAX_TOKENS);
  });
});

describe("chat profile token overrides", () => {
  it("does not force a default context window on new profiles", () => {
    const profile = defaultCustomProfile({ name: "默认" });
    expect(profile.contextWindow).toBeUndefined();
    expect(profile.maxTokens).toBeUndefined();
  });

  it("drops the old baked-in 272k/32k defaults", () => {
    const parsed = parseChatProfiles({
      kind: "custom",
      customProfiles: [{
        id: "custom_1",
        name: "默认",
        url: "https://api.openai.com/v1",
        model: "gpt-5.6-luna",
        apiKey: "sk",
        contextWindow: 272000,
        maxTokens: 32768,
        effort: "medium",
        transport: "openai-responses",
      }],
      activeCustomId: "custom_1",
    });
    expect(parsed?.customProfiles[0]?.contextWindow).toBeUndefined();
    expect(parsed?.customProfiles[0]?.maxTokens).toBeUndefined();
  });

  it("clamps maxTokens to the configured window", () => {
    expect(clampMaxTokens(80000, 64000)).toBe(64000);
    expect(clampMaxTokens(1000, undefined)).toBe(1000);
    expect(clampMaxTokens(undefined, 128000)).toBeUndefined();
  });
});
