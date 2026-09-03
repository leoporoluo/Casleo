import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandEnvironment } from "casleo-agent-core";

describe("commandEnvironment", () => {
  it("strips Electron-as-Node so npm/node use the system runtime", () => {
    const electronDir = path.dirname(process.execPath);
    const env = commandEnvironment({
      ELECTRON_RUN_AS_NODE: "1",
      ELECTRON_NO_ASAR: "1",
      PATH: [electronDir, "C:\\Program Files\\nodejs", "C:\\Windows\\System32"].join(path.delimiter),
    });

    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.ELECTRON_NO_ASAR).toBeUndefined();
    const parts = String(env.PATH ?? "").split(path.delimiter);
    expect(parts.some((item) => item.toLowerCase() === electronDir.toLowerCase())).toBe(false);
    expect(parts).toContain("C:\\Program Files\\nodejs");
  });
});
