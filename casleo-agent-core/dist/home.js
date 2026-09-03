import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { tetherEnv } from "./env.js";
export function getTetherHome() {
    return resolveHomePath(tetherEnv("HOME") ?? path.join(os.homedir(), ".tether"));
}
export function getTetherSessionsDir() {
    return resolveHomePath(tetherEnv("SESSIONS_DIR") ?? path.join(getTetherHome(), "sessions"));
}
export function getTetherArchivedSessionsDir() {
    return resolveHomePath(tetherEnv("ARCHIVED_SESSIONS_DIR") ?? path.join(getTetherHome(), "archived_sessions"));
}
/** Configure the underlying runtime to use Tether Runtime-owned paths only. */
export async function initializeTetherHome() {
    const home = getTetherHome();
    const sessions = getTetherSessionsDir();
    // Pi resources remain in their official global location while Casleo keeps
    // its own sessions and credentials in the application data directory.
    process.env.PI_CODING_AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
    process.env.PI_CODING_AGENT_SESSION_DIR = sessions;
    // Prompt templates are no longer used by Casleo. Remove the legacy
    // directory so installations converge on ~/.pi/agent/*.md.
    await fs.rm(path.join(os.homedir(), ".pi", "agent", "prompts"), { recursive: true, force: true }).catch(() => undefined);
    await fs.mkdir(home, { recursive: true, mode: 0o700 });
    await fs.chmod(home, 0o700).catch(() => undefined);
    await fs.mkdir(sessions, { recursive: true, mode: 0o700 });
    await fs.chmod(sessions, 0o700).catch(() => undefined);
    await fs.mkdir(getTetherArchivedSessionsDir(), { recursive: true, mode: 0o700 });
    await fs.chmod(getTetherArchivedSessionsDir(), 0o700).catch(() => undefined);
    await ensureWebSearchDefaults(home);
    await partitionExistingSessions(sessions);
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
/**
 * Move a flat pi transcript into a date partition, then retain a flat hard-link.
 * Both names address the same inode, so the runtime remains fully compatible and
 * no transcript content is duplicated.
 */
export async function partitionSessionFile(file) {
    const sessions = getTetherSessionsDir();
    const runtimePath = path.resolve(file);
    const relative = path.relative(sessions, runtimePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return { runtimePath, storagePath: runtimePath };
    }
    if (path.dirname(relative) !== ".") {
        return { runtimePath: path.join(sessions, path.basename(file)), storagePath: runtimePath };
    }
    const stat = await fs.stat(runtimePath);
    const timestamp = await sessionTimestamp(runtimePath, stat.mtime);
    const date = timestamp.toISOString().slice(0, 10).split("-");
    const storagePath = path.join(sessions, ...date, path.basename(runtimePath));
    await fs.mkdir(path.dirname(storagePath), { recursive: true, mode: 0o700 });
    await fs.chmod(path.dirname(storagePath), 0o700).catch(() => undefined);
    const existing = await statOrUndefined(storagePath);
    if (existing) {
        if (sameFile(stat, existing)) {
            await fs.chmod(runtimePath, 0o600).catch(() => undefined);
            return { runtimePath, storagePath };
        }
        // Never overwrite a different transcript on a path collision.
        return { runtimePath, storagePath: runtimePath };
    }
    try {
        await fs.rename(runtimePath, storagePath);
        try {
            await fs.link(storagePath, runtimePath);
        }
        catch (error) {
            await fs.rename(storagePath, runtimePath).catch(() => undefined);
            throw error;
        }
        await fs.chmod(storagePath, 0o600).catch(() => undefined);
        return { runtimePath, storagePath };
    }
    catch {
        // Hard links can be unavailable on unusual/network filesystems. Keeping the
        // original flat file is safer than copying or breaking resume semantics.
        return { runtimePath, storagePath: runtimePath };
    }
}
export async function partitionExistingSessions(sessions = getTetherSessionsDir()) {
    let entries;
    try {
        entries = await fs.readdir(sessions, { withFileTypes: true });
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT")
            return [];
        throw error;
    }
    const partitioned = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".jsonl"))
            continue;
        partitioned.push(await partitionSessionFile(path.join(sessions, entry.name)));
    }
    return partitioned;
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
