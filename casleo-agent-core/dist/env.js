import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
/**
 * Environment for user-facing subprocesses (shell, npm, git, MCP).
 * The RPC worker runs as Electron-as-Node; leaking that to children makes
 * `node`/`npm` reopen Casleo.exe and look for default_app.asar.
 */
export function commandEnvironment(base = process.env) {
    const env = { ...base };
    for (const name of ELECTRON_CHILD_ENV_KEYS)
        delete env[name];
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
    if (!pathKey)
        return env;
    const electronDir = path.dirname(process.execPath).replace(/[\\/]+$/, "").toLowerCase();
    env[pathKey] = String(env[pathKey] ?? "")
        .split(path.delimiter)
        .filter((entry) => {
        const directory = entry.trim().replace(/^"|"$/g, "").replace(/[\\/]+$/, "");
        return directory.length > 0 && directory.toLowerCase() !== electronDir;
    })
        .join(path.delimiter);
    return env;
}
