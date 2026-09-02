import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { tetherEnv } from "./env.js";
import { trackDetachedChild, killProcessTree } from "./process-tree.js";
import { stripModelCredentialEnvironment } from "./providers.js";
import { hostShellCommand } from "./shell.js";
import { windowsNativeSandboxCommand, windowsNativeSandboxDescription, windowsNativeSandboxEnabled, } from "./windows-sandbox.js";
export function sandboxCommand(shellCommand, cwd, options) {
    if (options.mode === "danger-full-access") {
        return hostShellCommand(shellCommand);
    }
    if (windowsNativeSandboxEnabled()) {
        return windowsNativeSandboxCommand(shellCommand, cwd, options);
    }
    if (process.platform === "darwin" && fs.existsSync("/usr/bin/sandbox-exec")) {
        const shell = process.env.SHELL ?? "/bin/sh";
        const workspace = fs.realpathSync(cwd);
        const temporary = fs.realpathSync(os.tmpdir());
        const extra = (options.writableRoots ?? [])
            .map((root) => {
            try {
                return fs.realpathSync(root);
            }
            catch {
                return undefined;
            }
        })
            .filter((root) => Boolean(root));
        const writable = options.mode === "workspace-write"
            ? [...new Set([workspace, temporary, "/dev/null", "/dev/tty", ...extra])]
            : ["/dev/null", "/dev/tty"];
        const rules = [
            "(version 1)",
            "(allow default)",
            writable.length === 0
                ? "(deny file-write*)"
                : `(deny file-write* (require-not (require-any ${writable
                    .map((directory) => `(subpath "${escapeSeatbelt(directory)}")`)
                    .join(" ")})))`,
            options.network ? "" : '(deny network*) (allow network* (local ip "localhost:*"))',
            // Keep kill/pkill from reaching Electron / the Tether Vite server.
            "(deny signal)",
            "(allow signal (target self))",
        ]
            .filter(Boolean)
            .join(" ");
        return {
            command: "/usr/bin/sandbox-exec",
            args: ["-p", rules, shell, "-lc", shellCommand],
            description: `macOS Seatbelt (${options.mode}${options.network ? ", network" : ", no network"})`,
        };
    }
    const image = tetherEnv("SANDBOX_IMAGE");
    if (image && commandExists("docker")) {
        const networkArgs = options.network ? [] : ["--network", "none"];
        const userArgs = typeof process.getuid === "function" && typeof process.getgid === "function"
            ? ["--user", `${process.getuid()}:${process.getgid()}`]
            : [];
        const mount = options.mode === "read-only" ? `${cwd}:/workspace:ro` : `${cwd}:/workspace`;
        const readOnlyArgs = options.mode === "read-only"
            ? ["--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m"]
            : [];
        return {
            command: "docker",
            args: [
                "run",
                "--rm",
                "-i",
                ...userArgs,
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges",
                "--pids-limit",
                "512",
                ...networkArgs,
                ...readOnlyArgs,
                "-v",
                mount,
                "-w",
                "/workspace",
                image,
                "/bin/sh",
                "-lc",
                shellCommand,
            ],
            description: `Docker ${image} (${options.mode}${options.network ? ", network" : ", no network"})`,
        };
    }
    throw new Error(`No OS sandbox backend is available for ${options.mode}. ` +
        "Install macOS sandbox-exec, or set TETHER_SANDBOX_IMAGE to a trusted Docker image. " +
        "Use --sandbox danger-full-access only for a trusted workspace.");
}
export function sandboxDescription(options) {
    if (options.mode === "danger-full-access")
        return "host access";
    if (windowsNativeSandboxEnabled())
        return windowsNativeSandboxDescription(options);
    if (process.platform === "darwin" && fs.existsSync("/usr/bin/sandbox-exec")) {
        return `Seatbelt ${options.mode}${options.network ? " + network" : ""}`;
    }
    if (tetherEnv("SANDBOX_IMAGE") && commandExists("docker")) {
        return `Docker ${options.mode}${options.network ? " + network" : ""}`;
    }
    return `unavailable (${options.mode})`;
}
export function executeSandboxedCommand(shellCommand, cwd, sandbox, options) {
    const invocation = sandboxCommand(shellCommand, cwd, sandbox);
    return new Promise((resolve, reject) => {
        const environment = stripModelCredentialEnvironment({ ...(options.env ?? process.env) });
        const child = spawn(invocation.command, invocation.args, {
            cwd,
            env: environment,
            shell: false,
            detached: process.platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"],
        });
        trackDetachedChild(child);
        let settled = false;
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
        const timer = options.timeout === undefined
            ? undefined
            : setTimeout(stop, Math.max(1, options.timeout));
        timer?.unref();
        const abort = () => stop();
        options.signal?.addEventListener("abort", abort, { once: true });
        if (options.signal?.aborted)
            abort();
        child.stdout.on("data", options.onData);
        child.stderr.on("data", options.onData);
        child.once("error", (error) => {
            if (settled)
                return;
            settled = true;
            if (timer)
                clearTimeout(timer);
            options.signal?.removeEventListener("abort", abort);
            reject(error);
        });
        child.once("close", (exitCode) => {
            if (settled)
                return;
            settled = true;
            if (timer)
                clearTimeout(timer);
            options.signal?.removeEventListener("abort", abort);
            resolve({ exitCode });
        });
    });
}
function escapeSeatbelt(value) {
    return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
function commandExists(command) {
    const pathValue = process.env.PATH ?? "";
    return pathValue
        .split(path.delimiter)
        .some((directory) => fs.existsSync(path.join(directory, command)));
}
//# sourceMappingURL=sandbox.js.map