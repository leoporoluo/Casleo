import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { BoundedOutput } from "./process.js";
import { killProcessTree, trackDetachedChild } from "./process-tree.js";
import { stripModelCredentialEnvironment } from "./providers.js";
import { sandboxCommand } from "./sandbox.js";
export class ManagedProcessRegistry {
    records = new Map();
    async start(command, options) {
        const invocation = sandboxCommand(command, options.cwd, options.sandbox);
        const env = stripModelCredentialEnvironment({ ...process.env });
        const child = spawn(invocation.command, invocation.args, {
            cwd: options.cwd,
            env,
            shell: false,
            detached: process.platform !== "win32",
            stdio: ["pipe", "pipe", "pipe"],
        });
        trackDetachedChild(child);
        const id = randomUUID().slice(0, 12);
        let resolveCompletion = () => { };
        const completion = new Promise((resolve) => {
            resolveCompletion = resolve;
        });
        const record = {
            id,
            command,
            child,
            output: new BoundedOutput(80_000),
            pending: "",
            running: true,
            timedOut: false,
            sandbox: invocation.description,
            completion,
            resolveCompletion,
            timeout: setTimeout(() => {
                record.timedOut = true;
                stopChild(record.child);
            }, options.timeoutMs),
        };
        record.timeout.unref();
        this.records.set(id, record);
        const append = (prefix, chunk) => {
            const text = `${prefix}${chunk.toString("utf8")}`;
            record.output.append(text);
            record.pending = `${record.pending}${text}`.slice(-80_000);
            options.onOutput?.(this.snapshot(record));
        };
        child.stdout.on("data", (chunk) => append("", chunk));
        child.stderr.on("data", (chunk) => append("[stderr] ", chunk));
        child.once("error", (error) => {
            append("[error] ", Buffer.from(error.message));
        });
        child.once("close", (exitCode) => {
            record.running = false;
            record.exitCode = exitCode;
            clearTimeout(record.timeout);
            options.signal?.removeEventListener("abort", abort);
            record.resolveCompletion();
        });
        const abort = () => stopChild(child);
        options.signal?.addEventListener("abort", abort, { once: true });
        if (options.signal?.aborted)
            abort();
        await Promise.race([
            completion,
            new Promise((resolve) => {
                const timer = setTimeout(resolve, Math.max(0, Math.min(options.yieldTimeMs, 30_000)));
                timer.unref();
            }),
        ]);
        return this.result(record);
    }
    async interact(processId, options) {
        const record = this.records.get(processId);
        if (!record)
            throw new Error(`Unknown process: ${processId}`);
        if (options.terminate) {
            stopChild(record.child);
        }
        else if (options.chars && record.running) {
            record.child.stdin.write(options.chars);
        }
        if (record.running) {
            await Promise.race([
                record.completion,
                new Promise((resolve) => {
                    const timer = setTimeout(resolve, Math.max(0, Math.min(options.yieldTimeMs, 30_000)));
                    timer.unref();
                }),
            ]);
        }
        const result = this.result(record);
        if (!record.running)
            this.records.delete(processId);
        return result;
    }
    list() {
        return [...this.records.values()].map((record) => ({
            processId: record.id,
            command: record.command,
            running: record.running,
            sandbox: record.sandbox,
        }));
    }
    dispose() {
        for (const record of this.records.values()) {
            clearTimeout(record.timeout);
            stopChild(record.child);
        }
        this.records.clear();
    }
    result(record) {
        const pending = record.pending;
        record.pending = "";
        return {
            processId: record.id,
            running: record.running,
            output: pending || (record.running ? "(no new output)" : "(process completed)"),
            ...(!record.running ? { exitCode: record.exitCode } : {}),
            ...(record.timedOut ? { timedOut: true } : {}),
            sandbox: record.sandbox,
        };
    }
    /** Live snapshot of cumulative output (does not clear the pending delta). */
    snapshot(record) {
        return {
            processId: record.id,
            running: record.running,
            output: record.output.value() || (record.running ? "…" : "(process completed)"),
            ...(!record.running ? { exitCode: record.exitCode } : {}),
            ...(record.timedOut ? { timedOut: true } : {}),
            sandbox: record.sandbox,
        };
    }
}
function stopChild(child) {
    if (child.killed || child.pid === undefined)
        return;
    // macOS Seatbelt denies in-sandbox signaling; kill the tree from outside
    // (descendants first) or `sh -lc` children become launchd orphans.
    killProcessTree(child.pid, "SIGTERM");
    const timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
            killProcessTree(child.pid, "SIGKILL");
        }
    }, 1_500);
    timer.unref();
}
//# sourceMappingURL=managed-process.js.map