import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { casleoEnv } from "./env.js";
export function getCasleoHome() {
    return resolveHomePath(casleoEnv("HOME") ?? path.join(os.homedir(), ".pi", "agent"));
}
export function getCasleoSessionsDir() {
    return resolveHomePath(casleoEnv("SESSIONS_DIR") ?? path.join(getCasleoHome(), "sessions"));
}
/** Configure the underlying runtime to use Casleo Runtime-owned paths only. */
export async function initializeCasleoHome() {
    const home = getCasleoHome();
    const sessions = getCasleoSessionsDir();
    // Use Pi's official agent directory and let Pi derive its per-project
    // session directory. Casleo does not replace Pi's session layout.
    process.env.PI_CODING_AGENT_DIR = home;
    delete process.env.PI_CODING_AGENT_SESSION_DIR;
    const piAgent = process.env.PI_CODING_AGENT_DIR;
    // Keep Pi's standard global resource roots ready for first launch. Pi owns
    // discovery and settings; Casleo only ensures the documented roots exist.
    await fs.mkdir(path.join(piAgent, "extensions"), { recursive: true });
    await fs.mkdir(path.join(piAgent, "npm"), { recursive: true });
    await fs.mkdir(path.join(piAgent, "skills"), { recursive: true });
    await fs.writeFile(path.join(piAgent, "AGENTS.md"), "", { flag: "a", mode: 0o600 });
    await fs.mkdir(home, { recursive: true, mode: 0o700 });
    await fs.chmod(home, 0o700).catch(() => undefined);
    await fs.mkdir(sessions, { recursive: true, mode: 0o700 });
    await fs.chmod(sessions, 0o700).catch(() => undefined);
    await ensureWebSearchDefaults(home);
    return home;
}
/** Skip the TUI curator in desktop/RPC; do not overwrite an existing config. */
async function ensureWebSearchDefaults(home) {
    const file = path.join(home, "web-search.json");
    try {
        await fs.access(file);
    }
    catch {
        await fs.writeFile(file, `${JSON.stringify({ workflow: "auto-summary" }, null, 2)}\n`, { mode: 0o600 });
    }
}
export async function partitionSessionFile(file) {
    const runtimePath = path.resolve(file);
    return { runtimePath, storagePath: runtimePath };
}
export async function partitionExistingSessions(sessions = getCasleoSessionsDir()) {
    return [];
}
/**
 * Pi resumes via the flat runtime path. If that hard-link was lost, recreate it
 * from the partitioned storage file so open-session does not start an empty transcript.
 */
export async function ensureSessionRuntimeLink(sessionPath, storagePath = sessionPath) {
    const runtime = path.resolve(sessionPath);
    const storage = path.resolve(storagePath);
    const storageStat = await statOrUndefined(storage);
    if (!storageStat)
        return runtime;
    const runtimeStat = await statOrUndefined(runtime);
    if (runtimeStat && sameFile(runtimeStat, storageStat))
        return runtime;
    if (runtimeStat) {
        await fs.unlink(runtime).catch(() => undefined);
    }
    else {
        await fs.mkdir(path.dirname(runtime), { recursive: true, mode: 0o700 }).catch(() => undefined);
    }
    try {
        await fs.link(storage, runtime);
    }
    catch {
        // Fall back to storage path when hard-links are unavailable.
        return storage;
    }
    await fs.chmod(runtime, 0o600).catch(() => undefined);
    return runtime;
}
function resolveHomePath(value) {
    if (value === "~")
        return os.homedir();
    if (value.startsWith(`~${path.sep}`))
        return path.join(os.homedir(), value.slice(2));
    return path.resolve(value);
}
async function sessionTimestamp(file, fallback) {
    let handle;
    try {
        handle = await fs.open(file, "r");
        const buffer = Buffer.alloc(16 * 1024);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        const firstLine = buffer.subarray(0, bytesRead).toString("utf8").split("\n", 1)[0];
        if (!firstLine)
            return fallback;
        const header = JSON.parse(firstLine);
        if (isRecord(header) && typeof header.timestamp === "string") {
            const timestamp = new Date(header.timestamp);
            if (!Number.isNaN(timestamp.getTime()))
                return timestamp;
        }
        return fallback;
    }
    catch {
        return fallback;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
async function statOrUndefined(file) {
    try {
        return await fs.stat(file);
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT")
            return undefined;
        throw error;
    }
}
function sameFile(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(error) {
    return error instanceof Error && "code" in error;
}
//# sourceMappingURL=home.js.map
