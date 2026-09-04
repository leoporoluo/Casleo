import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { visionAgentPrompt } from "../shared/vision-api";
import visionExtension from "./vision";

function harness() {
  const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>();
  let active: string[] = [];
  visionExtension({
    registerTool() {},
    getActiveTools: () => active,
    setActiveTools: (names: string[]) => { active = names; },
    on: (event: string, handler: (event: never) => unknown) => {
      handlers.set(event, handler as (event: unknown, ctx?: unknown) => unknown);
    },
  } as Parameters<typeof visionExtension>[0]);
  return {
    tools: () => active,
    fire: (event: string, payload: unknown, ctx?: unknown) => handlers.get(event)?.(payload, ctx),
    fireAsync: async (event: string, payload: unknown, ctx?: unknown) => await handlers.get(event)?.(payload, ctx),
  };
}

describe("vision tool availability", () => {
  it("stays available on later turns once the session has an image", () => {
    const pi = harness();
    pi.fire("session_start", {});
    pi.fire("before_agent_start", { prompt: visionAgentPrompt("这是什么", ["/tmp/a.png"]) });
    expect(pi.tools()).toContain("vision");

    pi.fire("before_agent_start", { prompt: "再看看图里第二块写了什么" });
    expect(pi.tools()).toContain("vision");
    expect(pi.fire("tool_call", { toolName: "vision", input: { paths: ["/tmp/a.png"] } })).toBeUndefined();
  });

  it("follows an image path the user typed instead of pasting", () => {
    const pi = harness();
    pi.fire("session_start", {});
    pi.fire("before_agent_start", { prompt: "@/Users/me/shot.PNG 这张图里的报错是什么" });
    expect(pi.tools()).toContain("vision");
  });

  it("stays out of sessions that never had an image", () => {
    const pi = harness();
    pi.fire("session_start", {});
    pi.fire("before_agent_start", { prompt: "把按钮改成蓝色" });
    expect(pi.tools()).not.toContain("vision");
    expect(pi.fire("tool_call", { toolName: "vision", input: {} })).toMatchObject({ block: true });
  });

  it("keeps extension images native when the model advertises image input", async () => {
    const pi = harness();
    const directory = await mkdtemp(path.join(os.tmpdir(), "casleo-vision-"));
    const previous = process.env.HARNESS_VISION_UPLOADS;
    process.env.HARNESS_VISION_UPLOADS = directory;
    try {
      const result = await pi.fireAsync(
        "input",
        {
          text: "请描述这张图片",
          source: "extension",
          images: [{ type: "image", data: "AQID", mimeType: "image/png" }],
        },
        { model: { input: ["text", "image"] } },
      );
      expect(result).toMatchObject({ action: "continue" });
    } finally {
      if (previous === undefined) delete process.env.HARNESS_VISION_UPLOADS;
      else process.env.HARNESS_VISION_UPLOADS = previous;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
