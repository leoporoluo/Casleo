import fs from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import { runProcess } from "./process.js";
import { sandboxCommand } from "./sandbox.js";
import { renderCollapsibleToolResult, renderToolCall } from "./tool-ui.js";
const diagnosticsParameters = Type.Object({
    path: Type.Optional(Type.String({
        description: "Workspace-relative file or directory used to select the nearest project",
    })),
    languages: Type.Optional(Type.Array(Type.Union([
        Type.Literal("typescript"),
        Type.Literal("python"),
        Type.Literal("rust"),
        Type.Literal("go"),
        Type.Literal("swift"),
    ]), { maxItems: 5 })),
});
export function registerDiagnosticsTool(pi, options, getSandboxMode) {
    pi.registerTool({
        name: "language_diagnostics",
        label: "Language diagnostics",
        description: "Auto-detect installed TypeScript, Python, Rust, Go, and Swift checkers and return compiler/language diagnostics without installing dependencies.",
        promptSnippet: "language_diagnostics: run already-installed compiler and language diagnostics",
        promptGuidelines: [
            "Run language diagnostics after relevant edits when a project checker is available.",
            "Do not install a missing checker unless the user explicitly asks.",
        ],
        parameters: diagnosticsParameters,
        renderShell: "self",
        executionMode: "sequential",
        async execute(_id, params, signal, _update, ctx) {
            const target = resolveTarget(ctx.cwd, params.path);
            const commands = detectDiagnosticCommands(target, params.languages, ctx.cwd);
            if (commands.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No installed language checker was detected. Use exec_command to run the repository's documented check command.",
                        },
                    ],
                    details: { target, commands: [] },
                };
            }
            const reports = [];
            const details = [];
            for (const diagnostic of commands) {
                const invocation = sandboxCommand(diagnostic.command, target, {
                    mode: getSandboxMode(),
                    network: false,
                });
                const result = await runProcess(invocation.command, invocation.args, {
                    cwd: target,
                    signal,
                    timeoutMs: 180_000,
                    maxOutputBytes: 80_000,
                });
                details.push({ ...diagnostic, ...result });
                reports.push([
                    `## ${diagnostic.language}`,
                    `$ ${diagnostic.command}`,
                    result.stdout.trimEnd(),
                    result.stderr.trimEnd(),
                    `exit_code: ${result.exitCode}`,
                    result.timedOut ? "timed_out: true" : "",
                    result.truncated ? "output_truncated: true" : "",
                ]
                    .filter(Boolean)
                    .join("\n"));
            }
            return {
                content: [{ type: "text", text: reports.join("\n\n") }],
                details: { target, commands: details },
            };
        },
        renderCall(args, theme, context) {
            const detail = args.languages?.length
                ? `${args.languages.join(", ")} in ${args.path ?? "."}`
                : args.path ?? "auto-detect workspace";
            return renderToolCall("Checked diagnostics", detail, theme, context);
        },
        renderResult(result, renderOptions, theme, context) {
            const commands = result.details?.commands ?? [];
            const failed = commands.some((command) => command.timedOut || command.exitCode !== 0);
            const summary = commands.length === 0
                ? "no installed checker detected"
                : `${commands.length} ${commands.length === 1 ? "checker" : "checkers"} · ${failed ? "issues found" : "clean"}`;
            return renderCollapsibleToolResult(result, renderOptions, theme, context, {
                collapsedSummary: summary,
                forceError: failed,
            });
        },
    });
}
export function detectDiagnosticCommands(cwd, selected, boundary = cwd) {
    const wanted = new Set(selected ?? ["typescript", "python", "rust", "go", "swift"]);
    const commands = [];
    const tsconfig = wanted.has("typescript") ? findUp(cwd, "tsconfig.json", boundary) : undefined;
    if (tsconfig) {
        const root = path.dirname(tsconfig);
        const tsc = localExecutable(root, "tsc", boundary);
        if (tsc)
            commands.push({ language: "typescript", command: quote(tsc) + " --noEmit --pretty false" });
    }
    if (wanted.has("python")) {
        const pyright = localFile(cwd, ".venv/bin/pyright", boundary) ??
            localFile(cwd, "node_modules/.bin/pyright", boundary) ??
            executableOnPath("pyright");
        if (pyright) {
            commands.push({ language: "python", command: `${quote(pyright)} .` });
        }
    }
    if (wanted.has("rust") && findUp(cwd, "Cargo.toml", boundary) && executableOnPath("cargo")) {
        commands.push({ language: "rust", command: "cargo check --message-format short" });
    }
    if (wanted.has("go") && findUp(cwd, "go.mod", boundary) && executableOnPath("go")) {
        commands.push({ language: "go", command: "go vet ./..." });
    }
    if (wanted.has("swift") && findUp(cwd, "Package.swift", boundary) && executableOnPath("swift")) {
        commands.push({ language: "swift", command: "swift build" });
    }
    return commands;
}
function resolveTarget(workspace, requested) {
    const target = path.resolve(workspace, requested ?? ".");
    const relative = path.relative(workspace, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Diagnostic path escapes workspace: ${requested}`);
    }
    if (!fs.existsSync(target))
        throw new Error(`Diagnostic path does not exist: ${requested}`);
    return fs.statSync(target).isDirectory() ? target : path.dirname(target);
}
function findUp(start, filename, boundary) {
    let current = path.resolve(start);
    const resolvedBoundary = path.resolve(boundary);
    while (true) {
        const candidate = path.join(current, filename);
        if (fs.existsSync(candidate))
            return candidate;
        if (current === resolvedBoundary)
            return undefined;
        const parent = path.dirname(current);
        if (parent === current)
            return undefined;
        const relative = path.relative(resolvedBoundary, parent);
        if (relative.startsWith("..") || path.isAbsolute(relative))
            return undefined;
        current = parent;
    }
}
function localExecutable(start, name, boundary) {
    return localFile(start, `node_modules/.bin/${name}`, boundary);
}
function localFile(start, relative, boundary) {
    let current = path.resolve(start);
    const resolvedBoundary = path.resolve(boundary);
    while (true) {
        const candidate = path.join(current, relative);
        if (fs.existsSync(candidate))
            return candidate;
        if (current === resolvedBoundary)
            return undefined;
        const parent = path.dirname(current);
        if (parent === current)
            return undefined;
        const pathFromBoundary = path.relative(resolvedBoundary, parent);
        if (pathFromBoundary.startsWith("..") || path.isAbsolute(pathFromBoundary))
            return undefined;
        current = parent;
    }
}
function executableOnPath(name) {
    for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
        const candidate = path.join(directory, name);
        if (fs.existsSync(candidate))
            return candidate;
    }
    return undefined;
}
function quote(value) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}
//# sourceMappingURL=diagnostics.js.map