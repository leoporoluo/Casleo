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
    const runningAsElectron = /^(electron|casleo)(\.exe)?$/i.test(path.basename(process.execPath));
    if (runningAsElectron) {
      expect(parts.some((item) => item.toLowerCase() === electronDir.toLowerCase())).toBe(false);
    }
    expect(parts).toContain("C:\\Program Files\\nodejs");
  });

  it("does not treat the current Node binary as Electron", () => {
    const env = commandEnvironment({
      npm_node_execpath: process.execPath,
      PATH: process.env.PATH ?? "",
    });
    if (path.basename(process.execPath).toLowerCase().includes("electron") || path.basename(process.execPath).toLowerCase().includes("casleo")) {
      expect(env.npm_node_execpath?.toLowerCase()).not.toBe(process.execPath.toLowerCase());
    } else if (env.npm_node_execpath) {
      expect(path.basename(env.npm_node_execpath).toLowerCase()).toMatch(/^node(\.exe)?$/);
    }
  });

  it("falls back when cwd is a file rather than a directory", () => {
    const file = path.join(os.tmpdir(), `casleo-asar-${Date.now()}`);
    fs.writeFileSync(file, "asar");
    try {
      const resolved = resolveCommandCwd(file);
      expect(fs.statSync(resolved).isDirectory()).toBe(true);
      expect(resolved).not.toBe(path.resolve(file));
    } finally {
      fs.unlinkSync(file);
    }
  });

  it("puts a system-node pi shim first on PATH", () => {
    const env = commandEnvironment({ PATH: process.env.PATH ?? "" });
    const parts = String(env.PATH ?? "").split(path.delimiter);
    const shim = path.join(os.homedir(), ".casleo", "shims");
    expect(parts[0].toLowerCase()).toBe(shim.toLowerCase());
    if (process.platform === "win32") {
      expect(fs.existsSync(path.join(shim, "pi.cmd"))).toBe(true);
    }
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
