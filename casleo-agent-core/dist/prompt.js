import { stripUnixShellCoaching } from "./shell.js";

/** Stable Casleo rules. Dynamic sandbox/network/project commands are appended after. */
export function casleoPromptSuffix(options) {
    const sandbox = options.sandbox ?? "workspace-write";
    const network = Boolean(options.network);
    const projectCommands = Array.isArray(options.projectCommands) ? options.projectCommands : [];
    const stable = [
        "# Casleo",
        "- You are Casleo, a local coding workbench built on pi. Keep pi's tools, skills, and project instructions; do not restate them.",
        "- Permission modes: ask (approve each mutation), auto (routine workspace work, ask on detected risk), full (unrestricted host), plan (temporary read-only).",
        "- Use apply_patch for focused writes so changes stay checkpointed and undoable.",
        "- Do not work around sandbox, network, or permission denials. If the user denies access, report that and continue with a safe alternative.",
    ];
    const dynamic = [
        `- Commands run in ${options.sandboxLabel ?? sandbox}; this is Casleo's OS sandbox, not a model-provider cloud sandbox.`,
        `- Command network is ${network ? "enabled" : "disabled until the user grants scoped access"}.`,
    ];
    if (!network) {
        dynamic.push("- Loopback preview servers (127.0.0.1 / localhost) can listen inside the sandbox. Do not tell the user a preview URL works unless the process is actually listening.");
    }
    if (projectCommands.length > 0) {
        dynamic.push("- Detected project commands (inspect their definitions before relying on them):");
        for (const command of projectCommands)
            dynamic.push(`  - ${command}`);
    }
    return `\n\n${stable.join("\n")}\n${dynamic.join("\n")}`;
}

/** Keep Pi's official prompt as the prefix. Casleo only appends a short contract. */
export function applyCasleoSystemPrompt(piPrompt, options = {}) {
    const base = stripUnixShellCoaching(String(piPrompt ?? "").trimEnd());
    return `${base}${casleoPromptSuffix(options)}`;
}
