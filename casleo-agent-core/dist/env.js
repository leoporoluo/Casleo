import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
/** Read a Casleo runtime environment variable. */
export function casleoEnv(name) {
    return process.env[`CASLEO_${name}`];
}
function isDirectory(candidate) {
    try {
        return Boolean(candidate) && fs.statSync(candidate).isDirectory();
    }
    catch {
        return false;
    }
}
/**
 * Spawn cwd must exist. Node reports ENOENT when the directory was deleted
 * (temp unpack folders, moved projects), even for absolute commands.
 */
export function resolveCommandCwd(cwd) {
    const candidates = [];
    if (typeof cwd === "string" && cwd.trim())
        candidates.push(path.resolve(cwd));
    try {
        candidates.push(process.cwd());
    }
    catch {
        // process.cwd() itself throws if the worker directory vanished.
    }
    candidates.push(os.homedir(), os.tmpdir());
    for (const candidate of candidates) {
        if (isDirectory(candidate))
            return candidate;
    }
    return os.tmpdir();
}
const ELECTRON_CHILD_ENV_KEYS = [
    "ELECTRON_RUN_AS_NODE",
    "ELECTRON_NO_ASAR",
    "ELECTRON_NO_ATTACH_CONSOLE",
];
const ELECTRON_NODE_ENV_KEYS = [
    "npm_node_execpath",
    "npm_config_node_execpath",
    "NODE",
];
function normalizeDir(value) {
    return value.trim().replace(/^"|"$/g, "").replace(/[\\/]+$/, "").toLowerCase();
}
function isElectronBinary(file) {
    const name = path.basename(file).toLowerCase();
    return name === "electron.exe" || name === "electron" || name === "casleo.exe" || name === "casleo";
}
function isCurrentElectronProcess() {
    return isElectronBinary(process.execPath);
}
function pointsAtElectron(value) {
    if (!value)
        return false;
    const resolved = path.resolve(String(value));
    if (isElectronBinary(resolved))
        return true;
    return isCurrentElectronProcess() && normalizeDir(resolved) === normalizeDir(process.execPath);
}
function resolveSystemNode(pathValue) {
    const skipDir = isCurrentElectronProcess() ? normalizeDir(path.dirname(process.execPath)) : "";
    const names = process.platform === "win32" ? ["node.exe"] : ["node"];
    const directories = String(pathValue ?? "")
        .split(path.delimiter)
        .map((entry) => entry.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    if (process.platform === "win32") {
        directories.push("C:\\Program Files\\nodejs", "C:\\Program Files (x86)\\nodejs");
    }
    for (const directory of directories) {
        if (skipDir && normalizeDir(directory) === skipDir)
            continue;
        for (const name of names) {
            const candidate = path.join(directory, name);
            if (fs.existsSync(candidate) && !isElectronBinary(candidate))
                return candidate;
        }
    }
    if (!isCurrentElectronProcess() && fs.existsSync(process.execPath) && !isElectronBinary(process.execPath))
        return process.execPath;
    return undefined;
}
function resolvePiCli() {
    const candidates = [];
    try {
        candidates.push(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js"));
    }
    catch {}
    try {
        candidates.push(path.join(path.dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "bundle", "cli.js"));
    }
    catch {}
    try {
        candidates.push(path.join(path.dirname(require.resolve("@earendil-works/pi-coding-agent/dist/index.js")), "bundle", "cli.js"));
    }
    catch {}
    for (const cli of candidates) {
        if (cli && fs.existsSync(cli))
            return cli;
    }
    return undefined;
}
function ensureCommandShims(nodePath) {
    const dir = path.join(os.homedir(), ".casleo", "shims");
    try {
    fs.mkdirSync(dir, { recursive: true });
    const piCli = resolvePiCli();
    if (!nodePath || !piCli)
        return dir;
    if (process.platform === "win32") {
        const cmd = `@echo off\r\n"${nodePath}" "${piCli}" %*\r\n`;
        const dest = path.join(dir, "pi.cmd");
        if (!fs.existsSync(dest) || fs.readFileSync(dest, "utf8") !== cmd)
            fs.writeFileSync(dest, cmd);
    }
    else {
        const script = `#!/bin/sh\nexec "${nodePath}" "${piCli}" "$@"\n`;
        const dest = path.join(dir, "pi");
        if (!fs.existsSync(dest) || fs.readFileSync(dest, "utf8") !== script) {
            fs.writeFileSync(dest, script, { mode: 0o755 });
            fs.chmodSync(dest, 0o755);
        }
    }
    } catch {
        // Shim write is best-effort; commands can still use PATH node.
    }
    return dir;
}
/**
 * Environment for user-facing subprocesses (shell, npm, git, MCP, pi).
 * The RPC worker runs as Electron-as-Node; leaking that to children makes
 * `node`/`npm`/`pi` reopen Casleo.exe and look for default_app.asar.
 */
export function commandEnvironment(base = process.env) {
    const env = { ...base };
    for (const name of ELECTRON_CHILD_ENV_KEYS)
        delete env[name];
    for (const name of ELECTRON_NODE_ENV_KEYS) {
        if (pointsAtElectron(env[name]))
            delete env[name];
    }
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
    const stripCurrentDir = isCurrentElectronProcess();
    const currentDir = normalizeDir(path.dirname(process.execPath));
    const filtered = String(env[pathKey] ?? "")
        .split(path.delimiter)
        .filter((entry) => {
        const directory = normalizeDir(entry);
        if (!directory)
            return false;
        if (stripCurrentDir && directory === currentDir)
            return false;
        return true;
    });
    const nodePath = resolveSystemNode(filtered.join(path.delimiter));
    const shimDir = ensureCommandShims(nodePath);
    if (nodePath) {
        env.npm_node_execpath = nodePath;
        env.npm_config_node_execpath = nodePath;
        env.NODE = nodePath;
    }
    const prefix = [];
    if (shimDir)
        prefix.push(shimDir);
    if (nodePath)
        prefix.push(path.dirname(nodePath));
    env[pathKey] = [...prefix, ...filtered.filter((entry) => !prefix.some((item) => normalizeDir(item) === normalizeDir(entry)))].join(path.delimiter);
    return env;
}
