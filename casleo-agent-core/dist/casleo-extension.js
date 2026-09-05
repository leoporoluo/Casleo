import { Text } from "@earendil-works/pi-tui";
import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "typebox";
import { commandNeedsNetwork, detectSandboxBoundary, SessionAccessController, } from "./access.js";
import { classifyCommand } from "./approval.js";
import { brandBlue } from "./brand.js";
import { capturePatchCheckpoint, captureWorkspaceCheckpoint, restoreCheckpoint, } from "./checkpoint.js";
import { permissionSchema } from "./config.js";
import { registerDiagnosticsTool } from "./diagnostics.js";
import { registerNaturalExit } from "./exit.js";
import { registerHooks } from "./hooks.js";
import { registerLocalImageInput } from "./image-input.js";
import { partitionSessionFile } from "./home.js";
import { ManagedProcessRegistry, } from "./managed-process.js";
import { MCPManager } from "./mcp.js";
import { applyWorkspacePatch } from "./patch.js";
import { formatPlanForExecution, PLAN_STATE_ENTRY, planWidgetLines, registerPlanTool, restorePlanState, } from "./plan.js";
import { registerCasleoProjectTrust } from "./project-trust.js";
import { executeSandboxedCommand, sandboxDescription } from "./sandbox.js";
import { applyCasleoSystemPrompt } from "./prompt.js";
import { findPiModel, resolveRegisteredLimits } from "./pi-model-limits.js";
import { execCommandParameterDescription, shellPromptRules, } from "./shell.js";
import { registerSessionCommands } from "./session-commands.js";
import { formatStatusReport } from "./status.js";
import { normalizeApiBaseUrl, saveApiBaseUrl } from "./settings.js";
import { ASK_USER_TOOL, registerAskUserTool } from "./ask-user.js";
import { clipForModel, registerSubagentTools } from "./subagents.js";
import { oneLine, renderCollapsibleToolResult, renderToolCall, } from "./tool-ui.js";
import { createCodingTools } from "./tools.js";
import { formatThinkingLabel, registerCodingTui } from "./tui-experience.js";
import { Workspace } from "./workspace.js";
const CHECKPOINT_ENTRY = "casleo-checkpoint";
const CHECKPOINT_UNDO_ENTRY = "casleo-checkpoint-undone";
const DIFF_ENTRY = "casleo-diff";
const planAllowedTools = new Set([
    "search_tools",
    "read_file",
    "list_files",
    "search_files",
    "language_diagnostics",
    "exec_command",
    "write_stdin",
    "update_plan",
    ASK_USER_TOOL,
]);
const askWithoutPromptTools = new Set([
    "read_file",
    "list_files",
    "search_files",
    "language_diagnostics",
    ASK_USER_TOOL,
]);
const TOOL_ACTIVATION_NAME = "search_tools";
const INLINE_SOURCE_NAMES = new Set(["builtin", "sdk", "inline", "temporary", "casleo"]);
const execCommandParameters = Type.Object({
    cmd: Type.String({
        minLength: 1,
        description: execCommandParameterDescription(),
    }),
    yield_time_ms: Type.Optional(Type.Integer({
        minimum: 0,
        maximum: 30_000,
        description: "Return after this many milliseconds if the process is still running",
    })),
    timeout_ms: Type.Optional(Type.Integer({
        minimum: 1_000,
        maximum: 600_000,
        description: "Terminate the process after this many milliseconds",
    })),
});
const writeStdinParameters = Type.Object({
    process_id: Type.String({ minLength: 1 }),
    chars: Type.Optional(Type.String({ description: "Characters to write to stdin" })),
    yield_time_ms: Type.Optional(Type.Integer({ minimum: 0, maximum: 30_000 })),
    terminate: Type.Optional(Type.Boolean({ description: "Terminate this process" })),
});
const applyPatchParameters = Type.Object({
    input: Type.String({
        minLength: 1,
        description: "A complete *** Begin Patch / *** End Patch patch",
    }),
});
export function createCasleoExtension(options) {
    return {
        name: "casleo",
        factory(pi) {
            registerCasleoProjectTrust(pi);
            const processes = new ManagedProcessRegistry();
            const mcp = new MCPManager();
            let permission = options.permission;
            let permissionBeforePlan = options.permission === "plan" ? "auto" : options.permission;
            const activation = createToolActivationRouter(pi, options);
            const checkpoints = [];
            const undone = new Set();
            let toolsBeforePlan;
            let lastAgentFailed = false;
            let sessionPartition = Promise.resolve();
            let planState;
            let lastOfferedPlanRevision = 0;
            let contextWarningLevel = "none";
            const access = new SessionAccessController(options.sandbox, options.network);
            const effectiveAccess = () => access.effective(permission);
            const sandboxFor = (mode, network) => ({
                mode,
                network,
                ...(options.writableRoots?.length
                    ? { writableRoots: options.writableRoots }
                    : {}),
            });
            const queueSessionPartition = (ctx) => {
                const sessionFile = ctx.sessionManager.getSessionFile();
                if (!sessionFile)
                    return sessionPartition;
                sessionPartition = sessionPartition
                    .catch(() => undefined)
                    .then(async () => {
                    await partitionSessionFile(sessionFile);
                })
                    .catch(() => undefined);
                return sessionPartition;
            };
            const updateStatus = (ctx) => {
                const currentAccess = effectiveAccess();
                const status = `Casleo · ${permission} · ${sandboxDescription({
                    mode: currentAccess.sandbox,
                    network: currentAccess.network,
                })}`;
                ctx.ui.setStatus("casleo", permission === "plan"
                    ? ctx.ui.theme.fg("warning", status)
                    : brandBlue(status, ctx.ui.theme));
                ctx.ui.setTitle(`Casleo — ${ctx.cwd}`);
                ctx.ui.setWidget("casleo-plan", planWidgetLines(planState, ctx));
            };
            registerCasleoProvider(pi, options);
            registerLocalImageInput(pi);
            registerNaturalExit(pi);
            registerSessionCommands(pi);
            registerCommandTools(pi, processes, checkpoints, () => permission, access, updateStatus, sandboxFor);
            registerPatchTool(pi, checkpoints);
            if (options.harness === "safe") {
                registerSafeHarness(pi, options.cwd);
                registerDiagnosticsTool(pi, options, () => effectiveAccess().sandbox);
            }
            registerSubagentTools(pi, options);
            registerEntryRenderers(pi);
            registerPlanTool(pi, () => planState, (nextPlan, ctx) => {
                planState = nextPlan;
                ctx.ui.setWidget("casleo-plan", planWidgetLines(planState, ctx));
            });
            registerAskUserTool(pi);
            registerCodingTui(pi, options, () => ({
                permission,
                ...effectiveAccess(),
            }));
            const applyPermissionTools = () => {
                if (permission === "plan") {
                    if (toolsBeforePlan === undefined) {
                        toolsBeforePlan = [...pi.getActiveTools()];
                    }
                    else {
                        const active = pi
                            .getActiveTools()
                            .filter((tool) => options.activeTools.includes(tool) ||
                            tool.startsWith("mcp__") ||
                            tool === "update_plan");
                        toolsBeforePlan = [...new Set([...toolsBeforePlan, ...active])];
                    }
                    pi.setActiveTools([
                        ...new Set([
                            ...toolsBeforePlan.filter((tool) => planAllowedTools.has(tool)),
                            "update_plan",
                        ]),
                    ]);
                    return;
                }
                if (toolsBeforePlan !== undefined) {
                    pi.setActiveTools(toolsBeforePlan);
                    toolsBeforePlan = undefined;
                }
            };
            pi.on("before_provider_request", (event, ctx) => {
                activation.sync();
                const usage = ctx.getContextUsage();
                if (usage?.percent !== null && usage?.percent !== undefined) {
                    if (usage.percent >= 90 && contextWarningLevel !== "critical") {
                        contextWarningLevel = "critical";
                        ctx.ui.notify(`上下文已使用 ${usage.percent.toFixed(1)}%，建议先运行 /compact 压缩历史再继续长任务。`, "warning");
                    }
                    else if (usage.percent >= 80 && contextWarningLevel === "none") {
                        contextWarningLevel = "warning";
                        ctx.ui.notify(`上下文已使用 ${usage.percent.toFixed(1)}%，继续长对话前可运行 /compact 保留近期工作并压缩旧历史。`, "warning");
                    }
                    else if (usage.percent < 70) {
                        contextWarningLevel = "none";
                    }
                }
            });
            pi.on("session_start", async (_event, ctx) => {
                checkpoints.length = 0;
                undone.clear();
                contextWarningLevel = "none";
                restoreCheckpointState(ctx.sessionManager.getBranch(), checkpoints, undone);
                planState = restorePlanState(ctx.sessionManager.getBranch());
                lastOfferedPlanRevision = planState?.revision ?? 0;
                updateStatus(ctx);
                ctx.ui.setHiddenThinkingLabel(formatThinkingLabel(ctx.model?.name ?? ctx.model?.id ?? options.modelId));
                const staleMcpTools = new Set(mcp.toolNames());
                if (staleMcpTools.size > 0) {
                    pi.setActiveTools(pi.getActiveTools().filter((tool) => !staleMcpTools.has(tool)));
                    toolsBeforePlan = toolsBeforePlan?.filter((tool) => !staleMcpTools.has(tool));
                }
                activation.reset();
                activation.sync();
                toolsBeforePlan = undefined;
                applyPermissionTools();
                await mcp.close();
                void mcp
                    .connectConfigured(pi, ctx)
                    .then(() => {
                    if (options.toolsExplicit)
                        return;
                    activation.refresh();
                    const intended = activation.activeTools();
                    if (permission === "plan") {
                        toolsBeforePlan = intended;
                        applyPermissionTools();
                        return;
                    }
                    activation.sync();
                })
                    .catch((error) => {
                    ctx.ui.notify(`MCP initialization failed: ${error.message}`, "warning");
                });
                await queueSessionPartition(ctx);
            });
            pi.on("session_info_changed", async (_event, ctx) => {
                await queueSessionPartition(ctx);
            });
            pi.on("agent_settled", async (_event, ctx) => {
                await queueSessionPartition(ctx);
            });
            pi.on("session_shutdown", async (_event, ctx) => {
                await queueSessionPartition(ctx);
                processes.dispose();
                await mcp.close();
            });
            pi.on("before_agent_start", async (event, ctx) => {
                lastAgentFailed = false;
                activation.refresh();
                const currentAccess = effectiveAccess();
                const systemPrompt = applyCasleoSystemPrompt(event.systemPrompt, {
                    sandbox: currentAccess.sandbox,
                    sandboxLabel: sandboxDescription({
                        mode: currentAccess.sandbox,
                        network: currentAccess.network,
                    }),
                    network: currentAccess.network,
                });
                if (permission !== "plan")
                    return { systemPrompt };
                return {
                    systemPrompt,
                    message: {
                        customType: "casleo-plan-context",
                        display: false,
                        content: [
                            "[PLAN MODE ACTIVE]",
                            "Explore and reason only. File mutation tools are unavailable.",
                            `Commands run in a read-only OS sandbox with network ${currentAccess.network ? "enabled" : "subject to scoped approval"}.`,
                            "Use update_plan to publish a concrete implementation plan after exploration.",
                            "Include validation and important risks in the plan steps or explanation.",
                            "Do not claim to have changed or tested anything you could not actually run.",
                        ].join("\n"),
                    },
                };
            });
            pi.on("tool_call", async (event, ctx) => {
                if (event.toolName === "bash" ||
                    event.toolName === "run_command" ||
                    event.toolName === "edit" ||
                    event.toolName === "write") {
                    return {
                        block: true,
                        reason: event.toolName === "bash" || event.toolName === "run_command"
                            ? "This shell tool bypasses Casleo's managed OS sandbox. Use exec_command instead."
                            : "This write tool bypasses Casleo checkpoints. Use apply_patch instead.",
                    };
                }
                if (permission === "plan" && !planAllowedTools.has(event.toolName)) {
                    return {
                        block: true,
                        reason: `Plan mode does not allow ${event.toolName}. Run /plan to leave plan mode.`,
                    };
                }
                const externalMcp = event.toolName.startsWith("mcp__");
                const command = event.toolName === "exec_command" &&
                    isRecord(event.input) &&
                    typeof event.input.cmd === "string"
                    ? event.input.cmd
                    : undefined;
                const dangerousCommand = command !== undefined && classifyCommand(command) === "dangerous";
                if (permission === "plan" && dangerousCommand) {
                    return {
                        block: true,
                        reason: "Plan mode blocks destructive commands. Leave plan mode before running this command.",
                    };
                }
                const needsApproval = permission === "ask" ||
                    (permission === "auto" && (externalMcp || dangerousCommand));
                if (!needsApproval)
                    return;
                if (!externalMcp && askWithoutPromptTools.has(event.toolName))
                    return;
                if (event.toolName === "write_stdin" &&
                    isRecord(event.input) &&
                    typeof event.input.chars !== "string" &&
                    event.input.terminate !== true) {
                    return;
                }
                if (command !== undefined &&
                    !dangerousCommand &&
                    !effectiveAccess().network &&
                    commandNeedsNetwork(command)) {
                    // The scoped network selector in exec_command is the approval UI for this action.
                    return;
                }
                if (!ctx.hasUI && typeof ctx.ui?.confirm !== "function") {
                    return {
                        block: true,
                        reason: "This action requires an interactive approval UI. Use --permission full for an explicitly trusted non-interactive run.",
                    };
                }
                if (dangerousCommand) {
                    const approved = await ctx.ui.confirm("Run destructive command?", `${command}\n\nThis may delete data or alter system/process state.`);
                    if (!approved)
                        return {
                            block: true,
                            reason: "Destructive command denied by user",
                        };
                }
                else if (event.toolName === "apply_patch" &&
                    isRecord(event.input) &&
                    typeof event.input.input === "string") {
                    for (const section of patchApprovalSections(event.input.input)) {
                        const approved = await ctx.ui.confirm(`Apply ${section.file}?`, section.patch);
                        if (!approved)
                            return { block: true, reason: `Denied ${section.file} by user` };
                    }
                }
                else {
                    const approved = await ctx.ui.confirm(`Allow ${event.toolName}?`, approvalSummary(event.toolName, event.input));
                    if (!approved)
                        return { block: true, reason: "Denied by user" };
                }
            });
            pi.on("user_bash", (_event, ctx) => {
                const operations = {
                    exec: async (command, cwd, execution) => {
                        let commandAccess = access.forCommand(permission, command);
                        if (!commandAccess.network && commandNeedsNetwork(command)) {
                            commandAccess = await requestCommandAccess("network", command, ctx, permission, commandAccess, access, updateStatus);
                        }
                        return executeSandboxedCommand(command, cwd, sandboxFor(commandAccess.sandbox, commandAccess.network), execution);
                    },
                };
                return { operations };
            });
            pi.on("message_end", (event) => {
                if (event.message.role !== "assistant")
                    return;
                lastAgentFailed =
                    "stopReason" in event.message &&
                        (event.message.stopReason === "error" ||
                            event.message.stopReason === "aborted");
            });
            const executeApprovedPlan = (ctx) => {
                if (!planState)
                    return false;
                permission = permissionBeforePlan;
                applyPermissionTools();
                updateStatus(ctx);
                pi.appendEntry("casleo-permission", { permission });
                pi.sendUserMessage([
                    "Execute the approved plan below. Keep update_plan statuses current as you work.",
                    "Maintain at most one in_progress step and only mark completed after verification.",
                    "",
                    formatPlanForExecution(planState),
                ].join("\n"), { deliverAs: "followUp" });
                return true;
            };
            const refinePlan = (refinement) => {
                const text = refinement.trim();
                if (!text)
                    return false;
                pi.sendUserMessage(`Refine the current plan using update_plan. Requested changes:\n${text}`, { deliverAs: "followUp" });
                return true;
            };
            pi.on("agent_end", async (_event, ctx) => {
                // json/print are headless one-shots; desktop RPC and TUI both offer plan→execute.
                if (permission !== "plan" ||
                    ctx.mode === "json" ||
                    ctx.mode === "print" ||
                    ctx.mode === "rpc" ||
                    !planState ||
                    planState.revision <= lastOfferedPlanRevision) {
                    return;
                }
                lastOfferedPlanRevision = planState.revision;
                ctx.ui.setWorkingVisible(false);
                let choice;
                try {
                    choice = await ctx.ui.select("Plan ready — what next?", [
                        "Execute the plan",
                        "Stay in plan mode",
                        "Refine the plan",
                    ]);
                }
                finally {
                    ctx.ui.setWorkingVisible(true);
                }
                if (choice === "Execute the plan") {
                    executeApprovedPlan(ctx);
                }
                else if (choice === "Refine the plan") {
                    const refinement = await ctx.ui.editor("How should the plan change?", "");
                    if (refinement?.trim())
                        refinePlan(refinement);
                }
            });
            pi.on("agent_settled", (_event, ctx) => {
                if (ctx.mode === "json" || ctx.mode === "print") {
                    process.exitCode = lastAgentFailed ? 1 : 0;
                }
            });
            pi.registerCommand("plan", {
                description: "Toggle plan mode; /plan show|clear|execute|refine",
                handler: async (args, ctx) => {
                    const action = args.trim();
                    if (action === "execute" || action === "approve") {
                        if (!planState) {
                            ctx.ui.notify("No structured plan is available.", "warning");
                            return;
                        }
                        if (permission !== "plan") {
                            ctx.ui.notify("Switch to plan mode before approving a plan.", "warning");
                            return;
                        }
                        lastOfferedPlanRevision = planState.revision;
                        if (executeApprovedPlan(ctx)) {
                            ctx.ui.notify(`Permission mode: ${permission}`, "info");
                        }
                        return;
                    }
                    const refineMatch = /^refine(?:\s+([\s\S]*))?$/i.exec(action);
                    if (refineMatch) {
                        const refinement = refineMatch[1]?.trim() ?? "";
                        if (!refinement) {
                            ctx.ui.notify("Expected /plan refine <changes>", "warning");
                            return;
                        }
                        refinePlan(refinement);
                        return;
                    }
                    if (action === "show") {
                        ctx.ui.notify(planState
                            ? formatPlanForExecution(planState)
                            : "No structured plan is available.", "info");
                        return;
                    }
                    if (action === "clear") {
                        planState = undefined;
                        pi.appendEntry(PLAN_STATE_ENTRY, {
                            cleared: true,
                            updatedAt: new Date().toISOString(),
                        });
                        ctx.ui.setWidget("casleo-plan", undefined);
                        ctx.ui.notify("Structured plan cleared.", "info");
                        return;
                    }
                    if (action) {
                        ctx.ui.notify("Expected /plan, /plan show, /plan clear, /plan execute, or /plan refine", "warning");
                        return;
                    }
                    if (permission === "plan") {
                        permission = permissionBeforePlan;
                    }
                    else {
                        permissionBeforePlan = permission;
                        permission = "plan";
                    }
                    applyPermissionTools();
                    updateStatus(ctx);
                    pi.appendEntry("casleo-permission", { permission });
                    ctx.ui.notify(`Permission mode: ${permission}`, "info");
                },
            });
            pi.registerCommand("permissions", {
                description: "Show or set plan|ask|auto|full",
                handler: async (args, ctx) => {
                    if (!args.trim()) {
                        const currentAccess = effectiveAccess();
                        ctx.ui.notify([
                            `permission: ${permission}`,
                            `sandbox: ${currentAccess.sandbox}`,
                            `network: ${currentAccess.network ? "enabled" : "blocked"}`,
                            `session grants: ${access.describeGrants().join(", ") || "none"}`,
                            "Escalation: allow once / allow for session / deny",
                        ].join("\n"), "info");
                        return;
                    }
                    const parsed = permissionSchema.safeParse(args.trim());
                    if (!parsed.success) {
                        ctx.ui.notify("Expected /permissions plan|ask|auto|full", "warning");
                        return;
                    }
                    if (parsed.data === "full" && permission !== "full" && ctx.hasUI) {
                        const approved = await ctx.ui.confirm("Enable full access?", "Commands will run on the host with unrestricted filesystem and network access. Use only in a trusted workspace.");
                        if (!approved)
                            return;
                    }
                    if (parsed.data === "plan" && permission !== "plan") {
                        permissionBeforePlan = permission;
                    }
                    permission = parsed.data;
                    applyPermissionTools();
                    updateStatus(ctx);
                    pi.appendEntry("casleo-permission", { permission });
                    ctx.ui.notify(`Permission mode: ${permission}`, "info");
                },
            });
            pi.registerCommand("effort", {
                description: "Show or set model thinking effort",
                handler: async (args, ctx) => {
                    const value = args.trim();
                    if (!value) {
                        ctx.ui.notify(`Thinking effort: ${pi.getThinkingLevel()}`, "info");
                        return;
                    }
                    if (![
                        "off",
                        "minimal",
                        "low",
                        "medium",
                        "high",
                        "xhigh",
                        "max",
                    ].includes(value)) {
                        ctx.ui.notify("Expected /effort off|minimal|low|medium|high|xhigh|max", "warning");
                        return;
                    }
                    pi.setThinkingLevel(value);
                    ctx.ui.notify(`Thinking effort: ${pi.getThinkingLevel()}`, "info");
                },
            });
            pi.registerCommand("base-url", {
                description: "Show or save the DeepSeek-compatible API base URL",
                handler: async (args, ctx) => {
                    const requested = args.trim() ||
                        (ctx.hasUI
                            ? await ctx.ui.input("DeepSeek API base URL", options.baseUrl)
                            : undefined);
                    if (requested === undefined)
                        return;
                    try {
                        const baseUrl = normalizeApiBaseUrl(requested || options.baseUrl);
                        await saveApiBaseUrl(baseUrl);
                        ctx.ui.notify(`${baseUrl}\nSaved. Restart Casleo to use this API endpoint.`, "info");
                    }
                    catch (error) {
                        ctx.ui.notify(error.message, "error");
                    }
                },
            });
            pi.registerCommand("undo", {
                description: "Restore the last patch checkpoint; add --force to override conflicts",
                handler: async (args, ctx) => {
                    const checkpoint = [...checkpoints]
                        .reverse()
                        .find((candidate) => !undone.has(candidate.id));
                    if (!checkpoint) {
                        ctx.ui.notify("No patch checkpoint is available to undo.", "info");
                        return;
                    }
                    const force = args.trim() === "--force";
                    if (ctx.hasUI) {
                        const confirmed = await ctx.ui.confirm(`Undo ${checkpoint.id}?`, `${checkpoint.before.map((file) => file.path).join("\n")}\n\nChanges made after this checkpoint are protected unless --force is used.`);
                        if (!confirmed)
                            return;
                    }
                    const workspace = new Workspace(ctx.cwd);
                    await workspace.initialize();
                    try {
                        const restored = await restoreCheckpoint(workspace, checkpoint, force);
                        undone.add(checkpoint.id);
                        pi.appendEntry(CHECKPOINT_UNDO_ENTRY, {
                            checkpointId: checkpoint.id,
                            restoredAt: new Date().toISOString(),
                        });
                        ctx.ui.notify(`Restored ${restored.join(", ")}`, "info");
                    }
                    catch (error) {
                        ctx.ui.notify(error.message, "error");
                    }
                },
            });
            pi.registerCommand("checkpoints", {
                description: "List durable patch checkpoints in the current branch",
                handler: async (_args, ctx) => {
                    if (checkpoints.length === 0) {
                        ctx.ui.notify("No patch checkpoints in this branch.", "info");
                        return;
                    }
                    ctx.ui.notify(checkpoints
                        .map((checkpoint) => `${undone.has(checkpoint.id) ? "↶" : "●"} ${checkpoint.id}  ${checkpoint.before
                        .map((file) => file.path)
                        .join(", ")}`)
                        .join("\n"), "info");
                },
            });
            pi.registerCommand("diff", {
                description: "Show the latest patch diff in the transcript",
                handler: async (_args, ctx) => {
                    const checkpoint = [...checkpoints]
                        .reverse()
                        .find((candidate) => !undone.has(candidate.id));
                    if (!checkpoint) {
                        ctx.ui.notify("No active patch diff is available.", "info");
                        return;
                    }
                    pi.appendEntry(DIFF_ENTRY, {
                        checkpointId: checkpoint.id,
                        patch: checkpoint.patch,
                    });
                },
            });
            pi.registerCommand("jobs", {
                description: "List managed background command processes",
                handler: async (_args, ctx) => {
                    const jobs = processes.list();
                    ctx.ui.notify(jobs.length
                        ? jobs
                            .map((job) => `${job.running ? "●" : "○"} ${job.processId} — ${oneLine(job.command, 80)}`)
                            .join("\n")
                        : "No managed background processes.", "info");
                },
            });
            pi.registerCommand("stop-job", {
                description: "Stop a managed background process by id",
                handler: async (args, ctx) => {
                    const id = args.trim();
                    if (!id) {
                        ctx.ui.notify("Usage: /stop-job <process_id>", "warning");
                        return;
                    }
                    try {
                        await processes.interact(id, { terminate: true, yieldTimeMs: 200 });
                        ctx.ui.notify(`Stopped ${id}`, "info");
                    }
                    catch (error) {
                        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
                    }
                },
            });
            pi.registerCommand("stop-jobs", {
                description: "Stop all managed background processes",
                handler: async (_args, ctx) => {
                    const jobs = processes.list().filter((job) => job.running);
                    if (jobs.length === 0) {
                        ctx.ui.notify("No managed background processes.", "info");
                        return;
                    }
                    for (const job of jobs) {
                        await processes
                            .interact(job.processId, { terminate: true, yieldTimeMs: 200 })
                            .catch(() => undefined);
                    }
                    ctx.ui.notify(`Stopped ${jobs.length} process${jobs.length === 1 ? "" : "es"}.`, "info");
                },
            });
            pi.registerCommand("mcp", {
                description: "Show MCP server and tool status",
                handler: async (_args, ctx) => ctx.ui.notify(mcp.status(), "info"),
            });
            pi.registerCommand("status", {
                description: "Show model, access, context, cache, token, and cost details",
                handler: async (_args, ctx) => {
                    const usage = ctx.getContextUsage();
                    const currentAccess = effectiveAccess();
                    const git = await pi
                        .exec("git", ["branch", "--show-current"], { cwd: ctx.cwd })
                        .catch(() => undefined);
                    ctx.ui.notify(formatStatusReport({
                        provider: ctx.model?.provider ?? options.providerId,
                        model: ctx.model?.id ?? options.modelId,
                        transport: ctx.model?.api ?? options.transport,
                        effort: ctx.thinkingLevel ?? pi.getThinkingLevel(),
                        permission,
                        sandbox: sandboxDescription({
                            mode: currentAccess.sandbox,
                            network: currentAccess.network,
                        }),
                        network: currentAccess.network,
                        cwd: ctx.cwd,
                        branch: git?.stdout.trim() || undefined,
                        sessionName: ctx.sessionManager.getSessionName(),
                        sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
                        context: usage
                            ? {
                                tokens: usage.tokens ?? 0,
                                contextWindow: usage.contextWindow,
                                percent: usage.percent,
                            }
                            : undefined,
                        entries: ctx.sessionManager.getEntries(),
                    }), "info");
                },
            });
            pi.registerCommand("doctor", {
                description: "Show Casleo runtime diagnostics",
                handler: async (_args, ctx) => {
                    const usage = ctx.getContextUsage();
                    const currentAccess = effectiveAccess();
                    ctx.ui.notify([
                        `model: ${ctx.model?.provider ?? "?"}/${ctx.model?.id ?? "?"}`,
                        `transport: ${ctx.model?.api ?? options.transport}`,
                        `image input: ${ctx.model?.input.includes("image") ? "supported" : "not supported"}`,
                        `thinking: ${ctx.thinkingLevel ?? pi.getThinkingLevel()}`,
                        `permission: ${permission}`,
                        `sandbox: ${sandboxDescription({
                            mode: currentAccess.sandbox,
                            network: currentAccess.network,
                        })}`,
                        `session grants: ${access.describeGrants().join(", ") || "none"}`,
                        `workspace trusted: ${ctx.isProjectTrusted() ? "yes" : "no"}`,
                        `session: ${ctx.sessionManager.getSessionFile() ?? "memory only"}`,
                        `tools: ${pi.getActiveTools().join(", ")}`,
                        usage
                            ? `context: ${usage.tokens?.toLocaleString() ?? "?"}/${usage.contextWindow.toLocaleString()}`
                            : "context: unavailable",
                        `checkpoints: ${checkpoints.length - undone.size} active`,
                        `mcp:\n${mcp.status()}`,
                    ].join("\n"), "info");
                },
            });
            registerHooks(pi, effectiveAccess);
        },
    };
}
function registerCasleoProvider(pi, options) {
    const api = options.transport === "responses" || options.transport === "openai-responses"
        ? "openai-responses"
        : options.transport === "chat" || options.transport === "openai-completions"
            ? "openai-completions"
            : options.transport;
    const models = [{
            id: options.modelId,
            name: options.modelId,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }];
    for (const id of options.extraModelIds ?? []) {
        if (models.some((model) => model.id === id))
            continue;
        models.push({
            id,
            name: id,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        });
    }
    pi.registerProvider("openai", {
        name: "Casleo API",
        baseUrl: options.baseUrl,
        apiKey: "$OPENAI_API_KEY",
        api,
        authHeader: api === "openai-responses" || api === "openai-completions",
        models: models.map((model) => {
            const piModel = findPiModel(model.id);
            const isSelectedModel = model.id === options.modelId;
            return {
                id: model.id,
                name: piModel?.name ?? model.name,
                api,
                reasoning: piModel?.reasoning ?? false,
                input: piModel?.input ?? ["text"],
                cost: piModel?.cost ?? model.cost,
                ...resolveRegisteredLimits(model.id, isSelectedModel
                    ? {
                        contextWindow: options.contextWindow,
                        maxTokens: options.maxTokens,
                    }
                    : {}),
                ...(piModel?.thinkingLevelMap ? { thinkingLevelMap: piModel.thinkingLevelMap } : {}),
                ...(piModel?.compat ? { compat: piModel.compat } : {}),
            };
        }),
    });
}
function registerCommandTools(pi, registry, checkpoints, getPermission, accessController, onAccessChanged, sandboxFor) {
    pi.registerTool({
        name: "exec_command",
        label: "Execute command",
        description: "Run a shell command in a managed OS sandbox. Long-running commands yield a process_id for write_stdin.",
        promptSnippet: process.platform === "win32"
            ? "exec_command: run tests, builds, git, and other PowerShell commands in an OS sandbox"
            : "exec_command: run tests, builds, git, and other shell commands in an OS sandbox",
        promptGuidelines: [
            ...shellPromptRules(),
            "Use focused checks first, then broader validation.",
            "When a process is still running, use write_stdin with its process_id.",
        ],
        parameters: execCommandParameters,
        renderShell: "self",
        executionMode: "sequential",
        async execute(_id, params, signal, onUpdate, ctx) {
            let commandAccess = accessController.forCommand(getPermission(), params.cmd);
            if (!commandAccess.network && commandNeedsNetwork(params.cmd)) {
                commandAccess = await requestCommandAccess("network", params.cmd, ctx, getPermission(), commandAccess, accessController, onAccessChanged);
            }
            let liveTimer;
            const publishLive = (result) => {
                if (!onUpdate)
                    return;
                if (liveTimer)
                    return;
                liveTimer = setTimeout(() => {
                    liveTimer = undefined;
                    onUpdate({
                        content: [
                            { type: "text", text: formatManagedResult(result, true) },
                        ],
                        details: result,
                    });
                }, 250);
                liveTimer.unref?.();
            };
            const run = (current) => registry.start(params.cmd, {
                cwd: ctx.cwd,
                sandbox: sandboxFor(current.sandbox, current.network),
                yieldTimeMs: params.yield_time_ms ?? 10_000,
                timeoutMs: params.timeout_ms ?? 120_000,
                ...(signal ? { signal } : {}),
                onOutput: (partial) => publishLive(partial),
            });
            try {
                const workspace = new Workspace(ctx.cwd);
                const { checkpoint, result } = await captureWorkspaceCheckpoint(workspace, params.cmd, async () => {
                    let currentResult;
                    try {
                        currentResult = await run(commandAccess);
                    }
                    catch (error) {
                        // Windows installations without the native sandbox must
                        // ask before falling back to host execution. Previously
                        // this surfaced as an immediate "cwd/backend" failure.
                        const message = error instanceof Error ? error.message : String(error);
                        if (!/No OS sandbox backend is available|Windows sandbox helper|native sandbox|working directory|current directory|cwd|ENOENT/i.test(message))
                            throw error;
                        commandAccess = await requestCommandAccess("host", params.cmd, ctx, getPermission(), commandAccess, accessController, onAccessChanged);
                        currentResult = await run(commandAccess);
                    }
                    const boundary = detectSandboxBoundary(params.cmd, currentResult, commandAccess);
                    if (boundary &&
                        !(getPermission() === "plan" && boundary === "host")) {
                        commandAccess = await requestCommandAccess(boundary, params.cmd, ctx, getPermission(), commandAccess, accessController, onAccessChanged);
                        currentResult = await run(commandAccess);
                    }
                    return currentResult;
                });
                if (checkpoint && !result.running) {
                    checkpoints.push(checkpoint);
                    pi.appendEntry(CHECKPOINT_ENTRY, checkpoint);
                }
                return {
                    content: [{ type: "text", text: formatManagedResult(result) }],
                    details: result,
                };
            }
            finally {
                if (liveTimer)
                    clearTimeout(liveTimer);
            }
        },
        renderCall(args, theme, context) {
            return renderToolCall(context.isPartial ? "Run" : "Ran", args.cmd, theme, context);
        },
        renderResult(result, renderOptions, theme, context) {
            const details = result.details;
            return renderCollapsibleToolResult(result, renderOptions, theme, context, {
                collapsedSummary: managedProcessSummary(details),
                forceError: managedProcessFailed(details),
            });
        },
    });
    pi.registerTool({
        name: "write_stdin",
        label: "Write to process",
        description: "Write characters to, poll, or terminate a managed process returned by exec_command.",
        promptSnippet: "write_stdin: interact with or poll a managed background process",
        parameters: writeStdinParameters,
        renderShell: "self",
        executionMode: "sequential",
        async execute(_id, params) {
            const result = await registry.interact(params.process_id, {
                ...(params.chars === undefined ? {} : { chars: params.chars }),
                yieldTimeMs: params.yield_time_ms ?? 5_000,
                terminate: params.terminate ?? false,
            });
            return {
                content: [{ type: "text", text: formatManagedResult(result) }],
                details: result,
            };
        },
        renderCall(args, theme, context) {
            const action = args.terminate
                ? "Stop"
                : args.chars === undefined
                    ? "Poll"
                    : "Write to";
            return renderToolCall(action, `process ${args.process_id}`, theme, context);
        },
        renderResult(result, renderOptions, theme, context) {
            const details = result.details;
            return renderCollapsibleToolResult(result, renderOptions, theme, context, {
                collapsedSummary: managedProcessSummary(details),
                forceError: managedProcessFailed(details),
            });
        },
    });
}
function managedProcessSummary(result) {
    if (result.running)
        return `running · process ${result.processId} · ${result.sandbox}`;
    const lines = result.output.trimEnd()
        ? result.output.trimEnd().split("\n").length
        : 0;
    return [
        result.exitCode === 0 ? "exit 0" : `exit ${result.exitCode ?? "?"}`,
        lines > 0
            ? `${lines} output ${lines === 1 ? "line" : "lines"}`
            : "no output",
        result.sandbox,
    ].join(" · ");
}
function managedProcessFailed(result) {
    return (result.timedOut === true ||
        (!result.running && result.exitCode !== undefined && result.exitCode !== 0));
}
async function requestCommandAccess(boundary, command, ctx, permission, current, controller, onAccessChanged) {
    if (permission === "full")
        return controller.effective(permission);
    if (permission === "plan" && boundary === "host") {
        throw new Error("Plan mode cannot grant write access outside the read-only sandbox.");
    }
    const boundaryLabel = boundary === "network"
        ? "network access"
        : "unrestricted host filesystem and network access";
    if (!ctx.hasUI && typeof ctx.ui?.select !== "function") {
        throw new Error(`Command requires ${boundaryLabel}. Re-run with ${boundary === "network" ? "--network" : "--permission full"} for an explicitly trusted non-interactive task.`);
    }
    const sandbox = sandboxDescription({
        mode: current.sandbox,
        network: current.network,
    });
    ctx.ui.setWorkingVisible(false);
    let choice;
    try {
        choice = await ctx.ui.select(`${boundary === "network" ? "Allow network access?" : "Allow unrestricted host access?"}\n${oneLine(command, 100)}\nCurrent: ${sandbox}`, ["Allow once", "Allow for this conversation", "Deny"]);
    }
    finally {
        ctx.ui.setWorkingVisible(true);
    }
    if (choice === "Allow once")
        return controller.grantOnce(permission, boundary);
    if (choice === "Allow for this conversation" ||
        choice === "Allow this command for this session") {
        controller.grantForSession(boundary, command);
        onAccessChanged(ctx);
        ctx.ui.notify(`${boundaryLabel} allowed for this conversation.`, "warning");
        return controller.forCommand(permission, command);
    }
    throw new Error(`User denied ${boundaryLabel} for: ${oneLine(command, 120)}`);
}
function registerPatchTool(pi, checkpoints) {
    pi.registerTool({
        name: "apply_patch",
        label: "Apply patch",
        description: "Apply an atomic, workspace-confined patch. Every successful patch creates a durable checkpoint that /undo can restore.",
        promptSnippet: "apply_patch: atomically add, update, move, or delete workspace files",
        promptGuidelines: [
            "Use apply_patch for file changes; keep each patch focused and reviewable.",
            "Never report a change as complete before running relevant validation.",
        ],
        parameters: applyPatchParameters,
        renderShell: "self",
        executionMode: "sequential",
        async execute(_id, params, _signal, _onUpdate, ctx) {
            const workspace = new Workspace(ctx.cwd);
            await workspace.initialize();
            let applied;
            const checkpoint = await capturePatchCheckpoint(workspace, params.input, async () => {
                applied = await applyWorkspacePatch(workspace, params.input);
            });
            checkpoints.push(checkpoint);
            pi.appendEntry(CHECKPOINT_ENTRY, checkpoint);
            const result = applied;
            return {
                content: [
                    {
                        type: "text",
                        text: [
                            `Applied checkpoint ${checkpoint.id}.`,
                            `files: ${result.files.join(", ")}`,
                            `diff: +${result.additions} -${result.deletions}`,
                            "Use /diff to inspect or /undo to restore this checkpoint.",
                        ].join("\n"),
                    },
                ],
                details: {
                    ...result,
                    checkpointId: checkpoint.id,
                    patch: params.input,
                },
            };
        },
        renderCall(args, theme, context) {
            const summary = summarizePatch(args.input);
            const header = renderToolCall("Updated", summary, theme, context);
            if (!context.expanded)
                return header;
            return new Text(`${header.render(10_000)[0]?.trimEnd() ?? ""}\n${colorPatch(args.input, theme)}`, 0, 0);
        },
        renderResult(result, renderOptions, theme, context) {
            const details = result.details;
            return renderCollapsibleToolResult(result, renderOptions, theme, context, {
                collapsedSummary: `checkpoint ${details.checkpointId} · +${details.additions} -${details.deletions}`,
            });
        },
    });
}
function createToolActivationRouter(pi, options) {
    const activated = new Set();
    const searchableTools = () => pi.getAllTools().filter((tool) => {
        const source = tool.sourceInfo?.source;
        return tool.name !== TOOL_ACTIVATION_NAME &&
            (tool.name.startsWith("mcp__") || !INLINE_SOURCE_NAMES.has(source ?? ""));
    });
    const searchableToolNames = () => new Set(searchableTools()
        .filter((tool) => !options.activeTools.includes(tool.name))
        .map((tool) => tool.name));
    const activeTools = () => {
        const names = new Set([
            ...options.activeTools,
            TOOL_ACTIVATION_NAME,
            ...activated,
        ]);
        return [...names];
    };
    const sync = () => {
        if (options.toolsExplicit)
            return;
        const deferred = searchableToolNames();
        const names = new Set(pi.getActiveTools().filter((name) => !deferred.has(name)));
        for (const name of options.activeTools)
            names.add(name);
        for (const name of activated)
            names.add(name);
        names.add(TOOL_ACTIVATION_NAME);
        pi.setActiveTools([...names]);
    };
    const refresh = () => {
        if (!pi.getAllTools().some((tool) => tool.name === TOOL_ACTIVATION_NAME))
            pi.registerTool({
                name: TOOL_ACTIVATION_NAME,
                label: "Search tools",
                description: "Search for and enable tools relevant to a task.",
                promptSnippet: "Search for additional tools when the active tools cannot perform the task.",
                promptGuidelines: [
                    "Use search_tools when a task requires a capability that is not currently available.",
                ],
                parameters: Type.Object({
                    query: Type.String({ minLength: 1, description: "Capability or task to search for" }),
                    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
                }),
                executionMode: "sequential",
                async execute(_id, params) {
                    const terms = params.query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
                    const matches = searchableTools()
                        .map((tool) => ({
                        tool,
                        score: terms.reduce((score, term) => score +
                            (`${tool.name} ${tool.description ?? ""}`.toLowerCase().includes(term) ? 1 : 0), 0),
                    }))
                        .filter((match) => match.score > 0)
                        .sort((left, right) => right.score - left.score)
                        .slice(0, params.limit ?? 3)
                        .map((match) => match.tool.name);
                    if (matches.length === 0) {
                        return {
                            content: [{ type: "text", text: `No tools found for: ${params.query}` }],
                            details: { matches: [], added: [] },
                        };
                    }
                    const active = pi.getActiveTools();
                    const added = matches.filter((name) => !active.includes(name));
                    if (added.length > 0)
                        pi.setActiveTools([...new Set([...active, ...added])]);
                    for (const name of added)
                        activated.add(name);
                    return {
                        content: [{
                                type: "text",
                                text: added.length > 0
                                    ? `Loaded tools: ${added.join(", ")}`
                                    : `Matching tools already active: ${matches.join(", ")}`,
                            }],
                        details: { matches, added },
                    };
                },
            });
        sync();
    };
    return {
        reset() {
            activated.clear();
        },
        sync,
        refresh,
        activeTools,
    };
}
function registerSafeHarness(pi, initialCwd) {
    const initialWorkspace = new Workspace(initialCwd);
    const safeTools = createCodingTools(initialWorkspace, "safe").filter((tool) => ["read_file", "list_files", "search_files"].includes(tool.name));
    for (const template of safeTools) {
        const definition = {
            ...template,
            renderShell: "self",
            async execute(id, params, signal, onUpdate, ctx) {
                const workspace = new Workspace(ctx.cwd);
                await workspace.initialize();
                const live = createCodingTools(workspace, "safe").find((tool) => tool.name === template.name);
                if (!live)
                    throw new Error(`Tool disappeared: ${template.name}`);
                return live.execute(id, params, signal, onUpdate);
            },
            renderCall(args, theme, context) {
                const { label, detail } = safeToolSummary(template.name, args);
                return renderToolCall(label, detail, theme, context);
            },
            renderResult(result, renderOptions, theme, context) {
                return renderCollapsibleToolResult(result, renderOptions, theme, context, {
                    collapsedSummary: false,
                });
            },
        };
        pi.registerTool(definition);
    }
}
function safeToolSummary(name, args) {
    if (name === "read_file") {
        const range = args.line_start || args.line_end
            ? `:${String(args.line_start ?? 1)}-${String(args.line_end ?? "")}`
            : "";
        return { label: "Read", detail: `${String(args.path ?? "file")}${range}` };
    }
    if (name === "list_files") {
        return {
            label: "Listed",
            detail: String(args.pattern ?? "workspace files"),
        };
    }
    if (name === "search_files") {
        return {
            label: "Searched",
            detail: `${oneLine(String(args.query ?? ""), 80)} in ${String(args.path ?? ".")}`,
        };
    }
    return { label: name, detail: "" };
}
function registerEntryRenderers(pi) {
    pi.registerEntryRenderer(CHECKPOINT_ENTRY, (entry, { expanded }, theme) => {
        if (!entry.data)
            return undefined;
        const files = entry.data.before.map((file) => file.path).join(", ");
        return new Text([
            `${theme.fg("success", "✓ checkpoint")} ${entry.data.id} ${theme.fg("muted", files)}`,
            ...(expanded ? [colorPatch(entry.data.patch, theme)] : []),
        ].join("\n"), 0, 0);
    });
    pi.registerEntryRenderer(CHECKPOINT_UNDO_ENTRY, (entry, _options, theme) => entry.data
        ? new Text(`${theme.fg("warning", "↶ undo")} ${entry.data.checkpointId}`, 0, 0)
        : undefined);
    pi.registerEntryRenderer(DIFF_ENTRY, (entry, _options, theme) => entry.data
        ? new Text(`${brandBlue(`diff ${entry.data.checkpointId}`, theme)}\n${colorPatch(entry.data.patch, theme)}`, 0, 0)
        : undefined);
}
function restoreCheckpointState(entries, checkpoints, undone) {
    for (const entry of entries) {
        if (entry.type !== "custom")
            continue;
        if (entry.customType === CHECKPOINT_ENTRY && isCheckpoint(entry.data)) {
            checkpoints.push(entry.data);
        }
        else if (entry.customType === CHECKPOINT_UNDO_ENTRY &&
            isRecord(entry.data) &&
            typeof entry.data.checkpointId === "string") {
            undone.add(entry.data.checkpointId);
        }
    }
}
function isCheckpoint(value) {
    return (isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.patch === "string" &&
        Array.isArray(value.before) &&
        Array.isArray(value.after));
}
function approvalSummary(tool, input) {
    if (!isRecord(input))
        return `Tool: ${tool}`;
    if (tool === "apply_patch" && typeof input.input === "string") {
        return `${summarizePatch(input.input)}\n\n${input.input.slice(0, 8_000)}`;
    }
    if (tool === "exec_command" && typeof input.cmd === "string")
        return input.cmd;
    return JSON.stringify(input, null, 2).slice(0, 8_000);
}
function summarizePatch(input) {
    const files = input.split("\n").flatMap((line) => {
        const match = /^\*\*\* (?:Add File|Delete File|Update File|Move to): (.+)$/.exec(line);
        return match?.[1] ? [match[1]] : [];
    });
    const additions = input
        .split("\n")
        .filter((line) => line.startsWith("+")).length;
    const deletions = input
        .split("\n")
        .filter((line) => line.startsWith("-")).length;
    return `${[...new Set(files)].join(", ") || "patch"} (+${additions} -${deletions})`;
}
function patchApprovalSections(input) {
    const lines = input.replaceAll("\r\n", "\n").split("\n");
    const sections = [];
    let current;
    for (const line of lines) {
        const match = /^\*\*\* (?:Add File|Delete File|Update File): (.+)$/.exec(line);
        if (match?.[1]) {
            if (current)
                sections.push(current);
            current = { file: match[1], lines: [line] };
            continue;
        }
        if (!current || line === "*** Begin Patch" || line === "*** End Patch")
            continue;
        current.lines.push(line);
    }
    if (current)
        sections.push(current);
    if (sections.length === 0) {
        return [{ file: "patch", patch: input.slice(0, 8_000) }];
    }
    return sections.map((section) => ({
        file: section.file,
        patch: section.lines.join("\n").slice(0, 8_000),
    }));
}
function colorPatch(patch, theme) {
    return patch
        .split("\n")
        .map((line) => {
        if (line.startsWith("+"))
            return theme.fg("toolDiffAdded", line);
        if (line.startsWith("-"))
            return theme.fg("toolDiffRemoved", line);
        return theme.fg("toolDiffContext", line);
    })
        .join("\n");
}
function formatManagedResult(result, live = false) {
    const output = clipForModel(result.output.trimEnd() || (live ? "…" : "(no output)"), live ? 4_000 : 6_000);
    return [
        output,
        `process_id: ${result.processId}`,
        `status: ${result.running ? "running" : "completed"}`,
        ...(result.running ? ["Use write_stdin to poll or interact."] : []),
        ...(result.exitCode === undefined ? [] : [`exit_code: ${result.exitCode}`]),
        ...(result.timedOut ? ["timed_out: true"] : []),
        `sandbox: ${result.sandbox}`,
    ].join("\n");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=casleo-extension.js.map
