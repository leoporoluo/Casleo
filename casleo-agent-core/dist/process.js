import { spawn } from "node:child_process";
import { killProcessTree, trackDetachedChild } from "./process-tree.js";
import { stripModelCredentialEnvironment } from "./providers.js";
export function runProcess(command, args, options) {
    const maxOutputBytes = options.maxOutputBytes ?? 200_000;
    const timeoutMs = options.timeoutMs ?? 120_000;
    return new Promise((resolve, reject) => {
        const env = stripModelCredentialEnvironment({ ...process.env });
        const child = spawn(command, args, {
            cwd: options.cwd,
            env,
            shell: options.shell ?? false,
            detached: process.platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"],
        });
        trackDetachedChild(child);
        const stdoutBuffer = new BoundedOutput(Math.floor(maxOutputBytes / 2));
        const stderrBuffer = new BoundedOutput(Math.ceil(maxOutputBytes / 2));
        let timedOut = false;
        let settled = false;
        const append = (target, chunk) => {
            if (target === "stdout") {
                stdoutBuffer.append(chunk.toString("utf8"));
            }
            else {
                stderrBuffer.append(chunk.toString("utf8"));
            }
        };
        child.stdout.on("data", (chunk) => append("stdout", chunk));
        child.stderr.on("data", (chunk) => append("stderr", chunk));
        const stop = () => {
            if (child.killed || child.pid === undefined)
                return;
            killProcessTree(child.pid, "SIGTERM");
            setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
                    killProcessTree(child.pid, "SIGKILL");
                }
            }, 1_500).unref();
        };
        const onAbort = () => stop();
        options.signal?.addEventListener("abort", onAbort, { once: true });
        if (options.signal?.aborted)
            stop();
        const timer = setTimeout(() => {
            timedOut = true;
            stop();
        }, timeoutMs);
        timer.unref();
        child.once("error", (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            options.signal?.removeEventListener("abort", onAbort);
            reject(error);
        });
        child.once("close", (exitCode) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            options.signal?.removeEventListener("abort", onAbort);
            resolve({
                stdout: stdoutBuffer.value(),
                stderr: stderrBuffer.value(),
                exitCode,
                timedOut,
                truncated: stdoutBuffer.truncated || stderrBuffer.truncated,
            });
        });
    });
}
export class BoundedOutput {
    limit;
    headLimit;
    tailLimit;
    head = "";
    tail = "";
    seen = 0;
    constructor(limit) {
        this.limit = limit;
        this.headLimit = Math.floor(limit * 0.75);
        this.tailLimit = limit - this.headLimit;
    }
    get truncated() {
        return this.seen > this.limit;
    }
    append(chunk) {
        this.seen += chunk.length;
        let remaining = chunk;
        if (this.head.length < this.headLimit) {
            const take = Math.min(this.headLimit - this.head.length, remaining.length);
            this.head += remaining.slice(0, take);
            remaining = remaining.slice(take);
        }
        if (remaining) {
            this.tail = `${this.tail}${remaining}`.slice(-this.tailLimit);
        }
    }
    value() {
        if (!this.truncated)
            return this.head + this.tail;
        return `${this.head}\n... output truncated; tail follows ...\n${this.tail}`;
    }
}
//# sourceMappingURL=process.js.map