import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Type } from "typebox";
import { casleoEnv } from "./env.js";
import { runProcess } from "./process.js";
import { killProcessTree } from "./process-tree.js";
import { oneLine, renderCollapsibleToolResult, renderToolCall } from "./tool-ui.js";
const agentTaskSchema = Type.Object({
    role: Type.Union([
        Type.Literal("explorer"),
        Type.Literal("implementer"),
        Type.Literal("reviewer"),
        Type.Literal("tester"),
    ]),
    task: Type.String({ minLength: 1 }),
});
const delegateSchema = Type.Object({
    tasks: Type.Array(agentTaskSchema, { minItems: 1, maxItems: 8 }),
});
function delegateMaxTasks() {
    const raw = Number(casleoEnv("DELEGATE_MAX_TASKS") ?? "3");
    if (!Number.isFinite(raw))
        return 3;
    return Math.min(8, Math.max(1, Math.floor(raw)));
}
function delegateExplorerModel(runtime) {
    return casleoEnv("DELEGATE_EXPLORER_MODEL")?.trim() || runtime.modelId;
}
export function registerSubagentTools(pi, runtime) {
    if (Number(casleoEnv("SUBAGENT_DEPTH") ?? "0") >= 1)
        return;
    pi.registerTool({
        name: "delegate",
        label: "Delegate",
        description: "Run independent explorer, implementer, reviewer, or tester agents in parallel. Implementers work in isolated Git worktrees.",
        promptSnippet: "delegate: run independent repository tasks in parallel agents",
        promptGuidelines: [
            "Do not delegate single-directory reads, one-file fixes, or sequential work — do those inline.",
            "Delegate only when there are 2+ genuinely independent deliverables that would each take many minutes.",
            "Use explorer/reviewer for read-only evidence and implementer for isolated candidate changes.",
            "The main agent owns final integration and verification.",
        ],
        parameters: delegateSchema,
        renderShell: "self",
        executionMode: "sequential",
        async execute(_id, params, signal, onUpdate, ctx) {
            const tasks = params.tasks.slice(0, delegateMaxTasks());
            const taskStates = tasks.map((task) => ({
                role: task.role,
                task: task.task,
                status: "pending",
            }));
            const completed = [];
            // Live tool ticks are frequent; coalesce them so RPC/UI don't churn.
            const LIVE_MS = 250;
            let liveTimer;
            const flush = (mode) => {
                const includeResults = mode === "status";
                onUpdate?.({
                    content: [
                        {
                            type: "text",
                            text: includeResults && completed.length
                                ? resultsForModel(completed)
                                : `Delegating ${completed.length}/${taskStates.length}…`,
                        },
                    ],
                    details: {
                        total: taskStates.length,
                        done: completed.length,
                        tasks: taskStates.map((item) => ({ ...item })),
                        ...(includeResults ? { results: completed } : {}),
                    },
                });
            };
            const publishLive = () => {
                if (liveTimer)
                    return;
                liveTimer = setTimeout(() => {
                    liveTimer = undefined;
                    flush("live");
                }, LIVE_MS);
                liveTimer.unref?.();
            };
            const publishStatus = () => {
                if (liveTimer) {
                    clearTimeout(liveTimer);
                    liveTimer = undefined;
                }
                flush("status");
            };
            publishStatus();
            try {
                const results = await mapLimited(tasks.map((task, index) => ({ task, index })), 4, async ({ task, index }) => {
                    taskStates[index] = { ...taskStates[index], status: "running", live: "启动中…" };
                    publishStatus();
                    let result;
                    try {
                        result = await runSubagent(ctx.cwd, task.role, task.task, runtime, signal, (live) => {
                            const current = taskStates[index];
                            if (!current || current.status !== "running" || current.live === live)
                                return;
                            taskStates[index] = { ...current, live };
                            publishLive();
                        });
                    }
                    catch (error) {
                        result = {
                            role: task.role,
                            task: task.task,
                            success: false,
                            output: error.message,
                        };
                    }
                    const { live: _live, ...rest } = taskStates[index];
                    taskStates[index] = {
                        ...rest,
                        status: result.success ? "completed" : "failed",
                    };
                    completed.push(result);
                    publishStatus();
                    return result;
                });
                return {
                    content: [{ type: "text", text: resultsForModel(results) }],
                    details: {
                        total: taskStates.length,
                        done: completed.length,
                        tasks: taskStates,
                        results,
                    },
                };
            }
            finally {
                if (liveTimer)
                    clearTimeout(liveTimer);
            }
        },
        renderCall(args, theme, context) {
            const roles = [...new Set(args.tasks.map((task) => task.role))].join(", ");
            return renderToolCall("Delegated", `${args.tasks.length} ${args.tasks.length === 1 ? "task" : "tasks"} · ${roles}`, theme, context);
        },
        renderResult(result, renderOptions, theme, context) {
            const results = result.details?.results ?? [];
            const failures = results.filter((item) => !item.success).length;
            return renderCollapsibleToolResult(result, renderOptions, theme, context, {
                collapsedSummary: `${results.length - failures}/${results.length} agents succeeded`,
                forceError: failures > 0,
            });
        },
    });
    pi.registerCommand("agents", {
        description: "Show subagent roles and worktree behavior",
        handler: async (_args, ctx) => {
            ctx.ui.notify([
                "explorer: read-only repository investigation",
                "reviewer: read-only review",
                "tester: sandboxed test/diagnostic run",
                "implementer: isolated Git worktree (cleaned up after); returns candidate diff",
            ].join("\n"), "info");
        },
    });
}
async function runSubagent(cwd, role, task, runtime, signal, onLive) {
    let agentCwd = cwd;
    let worktree;
    let gitRoot;
    try {
        if (role === "implementer") {
            onLive?.("创建 worktree…");
            const created = await createWorktree(cwd);
            worktree = created.worktree;
            gitRoot = created.gitRoot;
            agentCwd = worktree;
        }
        const readOnly = role === "explorer" || role === "reviewer";
        const rolePrompt = `${roleInstructions(role)}

Task:
${task}

Return concise evidence, exact file paths, commands/checks, and any unresolved risks.`;
        const invocation = childInvocation();
        const args = [
            ...invocation.prefix,
            "-C",
            agentCwd,
            "--provider",
            runtime.providerId,
            "--base-url",
            runtime.baseUrl,
            "--transport",
            runtime.transport,
            "--model",
            role === "explorer" ? delegateExplorerModel(runtime) : runtime.modelId,
            "--harness",
            runtime.harness,
            "--mode",
            "json",
            "--print",
            "--no-session",
            "--permission",
            readOnly ? "plan" : "auto",
            "--sandbox",
            readOnly ? "read-only" : "workspace-write",
            "--thinking",
            role === "explorer" ? "low" : "max",
            ...(runtime.network ? ["--network"] : []),
            ...(runtime.webSearch ? ["--web"] : []),
            rolePrompt,
        ];
        const env = {
            ...process.env,
            CASLEO_SUBAGENT_DEPTH: String(Number(casleoEnv("SUBAGENT_DEPTH") ?? "0") + 1),
        };
        onLive?.("思考中…");
        const execution = await spawnCapture(invocation.command, args, agentCwd, env, signal, onLive);
        let diff;
        if (worktree) {
            await runProcess("git", ["add", "-N", "--", "."], {
                cwd: worktree,
                timeoutMs: 30_000,
                maxOutputBytes: 10_000,
            });
            const diffResult = await runProcess("git", ["diff", "--binary", "--no-ext-diff"], {
                cwd: worktree,
                timeoutMs: 30_000,
                maxOutputBytes: 100_000,
            });
            diff = diffResult.stdout;
        }
        // Keep aborted child output short so a later “continue” turn isn’t poisoned by
        // half-finished JSONL transcripts in the parent model context.
        const rawOutput = extractJsonFinalOutput(execution.stdout) || execution.stderr || "(no output)";
        const aborted = signal?.aborted === true;
        return {
            role,
            task,
            success: !aborted && execution.exitCode === 0,
            output: aborted
                ? clipForModel(`Aborted.\n${rawOutput}`, 1_200)
                : rawOutput,
            ...(diff && !aborted ? { diff } : {}),
        };
    }
    finally {
        if (worktree && gitRoot)
            await removeWorktree(gitRoot, worktree);
    }
}
async function createWorktree(cwd) {
    const rootResult = await runProcess("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        timeoutMs: 10_000,
        maxOutputBytes: 10_000,
    });
    if (rootResult.exitCode !== 0) {
        throw new Error("Implementer agents require a Git repository");
    }
    const gitRoot = rootResult.stdout.trim();
    const parent = await fsPromises.mkdtemp(path.join(os.tmpdir(), "casleo-worktree-"));
    const target = path.join(parent, "workspace");
    const result = await runProcess("git", ["worktree", "add", "--detach", target, "HEAD"], {
        cwd: gitRoot,
        timeoutMs: 60_000,
        maxOutputBytes: 30_000,
    });
    if (result.exitCode !== 0) {
        await fsPromises.rm(parent, { recursive: true, force: true }).catch(() => undefined);
        throw new Error(result.stderr || "Could not create isolated worktree");
    }
    return { worktree: target, gitRoot };
}
async function removeWorktree(gitRoot, worktree) {
    await runProcess("git", ["worktree", "remove", "--force", worktree], {
        cwd: gitRoot,
        timeoutMs: 30_000,
        maxOutputBytes: 10_000,
    }).catch(() => undefined);
    await fsPromises.rm(path.dirname(worktree), { recursive: true, force: true }).catch(() => undefined);
}
function childInvocation() {
    const script = process.argv[1];
    if (!script)
        throw new Error("Cannot locate the Casleo Runtime entrypoint");
    if (script.endsWith(".ts")) {
        const executable = path.resolve(path.dirname(script), "..", "node_modules", ".bin", "tsx");
        if (!fs.existsSync(executable))
            throw new Error("tsx executable is unavailable for subagents");
        return { command: executable, prefix: [script] };
    }
    return { command: process.execPath, prefix: [script] };
}
function spawnCapture(command, args, cwd, env, signal, onLive) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env,
            shell: false,
            // Keep delegate agents inside the RPC worker's process group. The desktop
            // reaps that group on quit; tool shells inside the subagent have their own
            // tracked groups for command-level aborts.
            detached: false,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let lineBuffer = "";
        child.stdout.on("data", (chunk) => {
            const text = chunk.toString("utf8");
            stdout = `${stdout}${text}`.slice(-500_000);
            lineBuffer += text;
            let newline = lineBuffer.indexOf("\n");
            while (newline >= 0) {
                const line = lineBuffer.slice(0, newline);
                lineBuffer = lineBuffer.slice(newline + 1);
                const live = liveFromJsonlLine(line);
                if (live)
                    onLive?.(live);
                newline = lineBuffer.indexOf("\n");
            }
        });
        child.stderr.on("data", (chunk) => {
            stderr = `${stderr}${chunk.toString("utf8")}`.slice(-100_000);
        });
        let killTimer;
        const abort = () => {
            if (child.pid !== undefined)
                killProcessTree(child.pid, "SIGTERM");
            killTimer ??= setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
                    killProcessTree(child.pid, "SIGKILL");
                }
            }, 1_500);
            killTimer.unref?.();
        };
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted)
            abort();
        child.once("error", (error) => {
            if (killTimer)
                clearTimeout(killTimer);
            signal?.removeEventListener("abort", abort);
            reject(error);
        });
        child.once("close", (exitCode) => {
            if (killTimer)
                clearTimeout(killTimer);
            signal?.removeEventListener("abort", abort);
            resolve({ stdout, stderr, exitCode });
        });
    });
}
/** Compact one-line status from a child agent JSONL event. */
export function liveFromJsonlLine(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{"))
        return undefined;
    try {
        const event = JSON.parse(trimmed);
        if (event.type === "tool_execution_start") {
            return summarizeToolLive(String(event.toolName ?? "tool"), event.args);
        }
        if (event.type === "message_start" && isRecord(event.message) && event.message.role === "assistant") {
            return "思考中…";
        }
    }
    catch {
        // Ignore non-JSON noise on stdout.
    }
    return undefined;
}
function summarizeToolLive(toolName, args) {
    const name = toolName.toLowerCase();
    const record = isRecord(args) ? args : {};
    const pathValue = firstString(record, ["path", "file", "file_path", "target"]);
    const command = firstString(record, ["cmd", "command", "script"]);
    const pattern = firstString(record, ["pattern", "query", "glob"]);
    if (/read|cat|read_file|list_files/i.test(name))
        return pathValue ? `正在读取 ${shortPath(pathValue)}` : "正在读取…";
    if (/write|edit|apply_patch|patch/i.test(name)) {
        return pathValue ? `正在写入 ${shortPath(pathValue)}` : "正在写入…";
    }
    if (/exec|bash|shell|command|exec_command|write_stdin/i.test(name)) {
        return command ? `正在执行 ${oneLine(command, 72)}` : "正在执行命令…";
    }
    if (/grep|find|search|glob|ls|search_files|language_diagnostics/i.test(name)) {
        return pattern ? `正在搜索 ${oneLine(pattern, 72)}` : "正在搜索…";
    }
    if (pathValue)
        return `${toolName} ${shortPath(pathValue)}`;
    if (command)
        return `${toolName} ${oneLine(command, 72)}`;
    return `正在调用 ${toolName}`;
}
function firstString(record, keys) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim())
            return value.trim();
    }
    return undefined;
}
function shortPath(value) {
    const normalized = value.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length <= 3)
        return normalized;
    return parts.slice(-3).join("/");
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function extractJsonFinalOutput(jsonl) {
    const assistantTexts = [];
    for (const line of jsonl.split("\n")) {
        if (!line.trim())
            continue;
        try {
            const event = JSON.parse(line);
            if (event.type !== "message_end" || event.message?.role !== "assistant")
                continue;
            const text = event.message.content
                ?.filter((part) => part.type === "text")
                .map((part) => String(part.text ?? ""))
                .join("\n");
            if (text)
                assistantTexts.push(text);
        }
        catch {
            // Ignore non-protocol stderr/noise accidentally written to stdout.
        }
    }
    return assistantTexts.at(-1) ?? "";
}
function roleInstructions(role) {
    switch (role) {
        case "explorer":
            return "You are a read-only repository explorer. Do not modify files.";
        case "reviewer":
            return "You are an independent code reviewer. Do not modify files; prioritize correctness and regressions.";
        case "tester":
            return "You are a test and diagnostics agent. Run focused checks and diagnose failures.";
        case "implementer":
            return "You are an implementation agent in an isolated Git worktree. Make focused changes and run relevant checks.";
    }
}
/** Compact text for the parent model; full reports stay in details.results for UI. */
export function resultsForModel(results) {
    return results
        .map((result, index) => {
        const mark = result.success ? "ok" : "failed";
        const body = clipForModel(result.output, result.success ? 1_200 : 2_500);
        const diff = result.diff?.trim()
            ? `\ncandidate diff:\n${clipForModel(result.diff, 4_000)}`
            : "";
        return `${index + 1}. ${result.role} — ${mark}\nTask: ${oneLine(result.task, 160)}\n${body}${diff}`;
    })
        .join("\n\n");
}
export function clipForModel(text, limit) {
    const normalized = text.replace(/\s+$/g, "").trim();
    if (normalized.length <= limit)
        return normalized;
    return `${normalized.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}
async function mapLimited(items, concurrency, fn) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length)
                return;
            results[index] = await fn(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}
//# sourceMappingURL=subagents.js.map