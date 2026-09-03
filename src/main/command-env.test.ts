import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandEnvironment, resolveCommandCwd } from "casleo-agent-core";
import { hostShellCommand } from "../../casleo-agent-core/dist/shell.js";

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

describe("resolveCommandCwd", () => {
  it("keeps an existing directory", () => {
    const cwd = process.cwd();
    expect(resolveCommandCwd(cwd)).toBe(path.resolve(cwd));
  });

  it("falls back when the requested directory is gone", () => {
    const missing = path.join(os.tmpdir(), `casleo-missing-cwd-${Date.now()}`);
    expect(fs.existsSync(missing)).toBe(false);
    const resolved = resolveCommandCwd(missing);
    expect(fs.statSync(resolved).isDirectory()).toBe(true);
  });
});

describe("hostShellCommand", () => {
  it("resolves a real PowerShell executable on Windows", () => {
    if (process.platform !== "win32") return;
    const invocation = hostShellCommand("Get-Date");
    expect(fs.existsSync(invocation.command)).toBe(true);
    expect(path.basename(invocation.command).toLowerCase()).toMatch(/powershell\.exe|pwsh\.exe/);
  });
});
