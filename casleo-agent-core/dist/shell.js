import fs from "node:fs";
import path from "node:path";
import { tetherEnv } from "./env.js";
/** Host shell dialect for the model. Affirmative only — listing forbidden Unix syntax makes the model recite it. */
export function shellPromptRules(platform = process.platform) {
    if (platform === "win32") {
        return [
            "- exec_command is Windows PowerShell. Write PowerShell (Get-ChildItem, Get-Content, Set-Location, Select-String, `$env:NAME = 'value'`, chain with `;`). Search with search_files.",
        ];
    }
    return [
        "- exec_command is the host POSIX shell. Prefer rg / rg --files for search.",
    ];
}
export function execCommandParameterDescription(platform = process.platform) {
    return platform === "win32"
        ? "PowerShell command from the current workspace."
        : "POSIX shell command from the current workspace.";
}
/** Drop Pi's bash/rg coaching so Windows sessions do not open with a dialect lecture. */
export function stripUnixShellCoaching(prompt, platform = process.platform) {
    if (platform !== "win32")
        return prompt;
    return prompt
        .replace(/^- Use bash for file operations like ls, rg, find\s*$/gimu, "")
        .replace(/^- bash: Execute bash commands \(ls, grep, find, etc\.\)\s*$/gimu, "")
        .replace(/\n{3,}/g, "\n\n");
}
/** Build a host-shell invocation without asking Node to reinterpret the command. */
export function hostShellCommand(shellCommand) {
    if (process.platform === "win32") {
        const shell = resolveWindowsPowerShell();
        return {
            command: shell,
            args: ["-NoProfile", "-NonInteractive", "-Command", shellCommand],
            description: `Windows host (${path.basename(shell)})`,
        };
    }
    const shell = process.env.SHELL ?? "/bin/sh";
    return {
        command: shell,
        args: ["-lc", shellCommand],
        description: "host",
    };
}
function resolveWindowsPowerShell() {
    const configured = tetherEnv("SHELL")?.trim();
    if (configured)
        return configured;
    for (const executable of ["pwsh.exe", "powershell.exe"]) {
        const resolved = findExecutableOnPath(executable);
        if (resolved)
            return resolved;
    }
    return "powershell.exe";
}
function findExecutableOnPath(executable) {
    const pathValue = process.env.PATH ?? "";
    for (const entry of pathValue.split(path.delimiter)) {
        const directory = entry.trim().replace(/^"|"$/g, "");
        if (!directory)
            continue;
        const candidate = path.join(directory, executable);
        if (fs.existsSync(candidate))
            return candidate;
    }
    return undefined;
}
//# sourceMappingURL=shell.js.map