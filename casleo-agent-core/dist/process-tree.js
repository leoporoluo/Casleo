import { execFileSync } from "node:child_process";
const tracked = new Set();
let hooksInstalled = false;
/**
 * Track a detached child so closing the RPC / desktop app can wipe it.
 * Detached spawns outlive a plain parent.kill() unless we reap them explicitly.
 */
export function trackDetachedChild(child) {
    installProcessLifetimeHooks();
    const pgid = child.pid ? processGroupId(child.pid) : undefined;
    const record = { child, ...(pgid !== undefined ? { pgid } : {}) };
    tracked.add(record);
    refreshProcessGroup(record);
    const refreshTimer = setTimeout(() => refreshProcessGroup(record), 25);
    refreshTimer.unref();
    const drop = () => {
        clearTimeout(refreshTimer);
        // A shell/subagent can exit after daemonizing a dev server or tool child.
        // Reap its leftover process group immediately instead of waiting for quit.
        wipeTrackedChild(record, "SIGKILL");
        const timer = setTimeout(() => wipeTrackedChild(record, "SIGKILL"), 50);
        timer.unref();
        tracked.delete(record);
    };
    child.once("exit", drop);
    child.once("error", drop);
}
function refreshProcessGroup(record) {
    if (record.child.pid === undefined)
        return;
    const pgid = processGroupId(record.child.pid);
    if (pgid !== undefined && pgid !== processGroupId(process.pid))
        record.pgid = pgid;
}
/** Kill every tracked detached child (and their descendants). */
export function wipeTrackedChildren(signal = "SIGKILL") {
    for (const record of [...tracked]) {
        wipeTrackedChild(record, signal);
        tracked.delete(record);
    }
}
/**
 * Recursively kill pid's descendants, then pid itself.
 * Also tries the process group (-pid) for detached group leaders.
 */
export function killProcessTree(pid, signal = "SIGKILL") {
    if (!Number.isFinite(pid) || pid <= 0)
        return;
    if (process.platform === "win32") {
        try {
            execFileSync("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
                stdio: "ignore",
                windowsHide: true,
            });
        }
        catch {
            try {
                process.kill(pid, signal);
            }
            catch {
                // already gone
            }
        }
        return;
    }
    for (const child of listChildPids(pid)) {
        killProcessTree(child, signal);
    }
    try {
        process.kill(-pid, signal);
    }
    catch {
        // not a group leader / already gone
    }
    try {
        process.kill(pid, signal);
    }
    catch {
        // already gone
    }
}
export function listChildPids(pid) {
    if (process.platform === "win32" || !Number.isFinite(pid) || pid <= 0)
        return [];
    try {
        const out = execFileSync("pgrep", ["-P", String(pid)], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (!out)
            return [];
        return out
            .split("\n")
            .map((line) => Number(line.trim()))
            .filter((value) => Number.isFinite(value) && value > 0);
    }
    catch {
        return [];
    }
}
function wipeTrackedChild(record, signal) {
    if (record.child.pid !== undefined)
        killProcessTree(record.child.pid, signal);
    if (record.pgid !== undefined)
        killProcessGroup(record.pgid, signal);
}
function killProcessGroup(pgid, signal) {
    if (process.platform === "win32" || !Number.isFinite(pgid) || pgid <= 0)
        return;
    if (pgid === processGroupId(process.pid))
        return;
    try {
        process.kill(-pgid, signal);
    }
    catch {
        // already gone
    }
}
function processGroupId(pid) {
    if (process.platform === "win32" || !Number.isFinite(pid) || pid <= 0)
        return undefined;
    try {
        const out = execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        const pgid = Number(out);
        return Number.isFinite(pgid) && pgid > 0 ? pgid : undefined;
    }
    catch {
        return undefined;
    }
}
function installProcessLifetimeHooks() {
    if (hooksInstalled)
        return;
    hooksInstalled = true;
    const wipe = () => wipeTrackedChildren("SIGKILL");
    process.once("exit", wipe);
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        process.once(signal, () => {
            wipe();
            process.exit(signal === "SIGINT" ? 130 : 143);
        });
    }
}
//# sourceMappingURL=process-tree.js.map