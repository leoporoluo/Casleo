/** Session-scoped grants layered over safe startup defaults. */
export class SessionAccessController {
    baseSandbox;
    baseNetwork;
    sessionNetwork = false;
    sessionHost = false;
    constructor(baseSandbox, baseNetwork) {
        this.baseSandbox = baseSandbox;
        this.baseNetwork = baseNetwork;
    }
    effective(permission) {
        if (permission === "full")
            return { sandbox: "danger-full-access", network: true };
        return {
            sandbox: permission === "plan" ? "read-only" : this.baseSandbox,
            network: this.baseNetwork || this.baseSandbox === "danger-full-access" || this.sessionNetwork,
        };
    }
    forCommand(permission, _command) {
        const current = this.effective(permission);
        if (permission !== "plan" && this.sessionHost) {
            return { sandbox: "danger-full-access", network: true };
        }
        return current;
    }
    grantForSession(boundary, _command) {
        if (boundary === "network")
            this.sessionNetwork = true;
        else
            this.sessionHost = true;
    }
    grantOnce(permission, boundary) {
        const current = this.effective(permission);
        return boundary === "network"
            ? { ...current, network: true }
            : { sandbox: "danger-full-access", network: true };
    }
    describeGrants() {
        return [
            ...(this.sessionNetwork ? ["network (conversation)"] : []),
            ...(this.sessionHost ? ["host (conversation)"] : []),
        ];
    }
}
export function commandNeedsNetwork(command) {
    const normalized = command.replace(/\\\n/g, " ").trim();
    if (!normalized)
        return false;
    return (/(^|[;&|]\s*)(curl|wget|ssh|scp|sftp|ftp|telnet|nc|ncat|gh)\b/i.test(normalized) ||
        /\bgit\s+(push|pull|fetch|clone|ls-remote|submodule\s+(update|sync))\b/i.test(normalized) ||
        /\b(npm|pnpm|yarn|bun)\s+(install|i|add|update|upgrade|publish|login|logout|whoami|view|info|audit)\b/i.test(normalized) ||
        /\b(pip|pip3)\s+install\b/i.test(normalized) ||
        /\b(cargo\s+(fetch|install|publish)|go\s+(get|install)|go\s+mod\s+download)\b/i.test(normalized) ||
        /\b(docker\s+(pull|push|login)|brew\s+(install|update|upgrade)|terraform\s+init)\b/i.test(normalized));
}
export function detectSandboxBoundary(command, result, access) {
    if (result.running || result.exitCode === 0 || access.sandbox === "danger-full-access") {
        return undefined;
    }
    const output = result.output.toLocaleLowerCase("en-US");
    if (!access.network &&
        (commandNeedsNetwork(command) ||
            /connect to host|could not resolve host|network is unreachable|socket.*operation not permitted|failed to connect|getaddrinfo|enotfound|eai_again/.test(output))) {
        return "network";
    }
    if (/operation not permitted|permission denied|read-only file system|sandbox violation/.test(output)) {
        return "host";
    }
    return undefined;
}
//# sourceMappingURL=access.js.map