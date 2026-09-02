import process from "node:process";
import pc from "picocolors";
import { ensureFirstRunAuth, runAuthCommand } from "./auth.js";
import { installTetherCredentialStore } from "./credential-store.js";
import { createTetherExtension } from "./tether-extension.js";
import { initializeTetherHome } from "./home.js";
import { installPiLoginSecretMask } from "./pi-login-mask.js";
import { installPiMarkdownCodeBlocks } from "./pi-markdown.js";
import { parseSupportedProviderId } from "./providers.js";
import { parseRuntimeArgs, printTetherHelp } from "./runtime-options.js";
import { installTetherRuntimeBranding } from "./runtime-branding.js";
import { ensureTetherUiDefaults } from "./ui-defaults.js";
import { TETHER_VERSION } from "./version.js";
import { parseWindowsSandboxLifecycleCommand, runWindowsSandboxLifecycle, } from "./windows-sandbox.js";
/** Run one Tether Runtime CLI, JSON, or RPC process using the shared runtime. */
export async function runTether(argv) {
    const windowsSandboxCommand = parseWindowsSandboxLifecycleCommand(argv);
    if (windowsSandboxCommand) {
        runWindowsSandboxLifecycle(windowsSandboxCommand);
        return;
    }
    const parsed = parseRuntimeArgs(argv);
    if (parsed.help) {
        printTetherHelp();
        return;
    }
    if (parsed.version) {
        process.stdout.write(`${TETHER_VERSION}\n`);
        return;
    }
    process.chdir(parsed.options.cwd);
    const agentDirectory = await initializeTetherHome();
    process.env.PI_TELEMETRY ??= "0";
    process.env.PI_SKIP_VERSION_CHECK ??= "1";
    await ensureTetherUiDefaults(agentDirectory);
    const authCommand = parseAuthCommand(argv);
    if (authCommand) {
        await runAuthCommand(authCommand.command, {
            ...parsed.options,
            providerId: authCommand.providerId ?? parsed.options.providerId,
        });
        return;
    }
    await ensureFirstRunAuth({
        providerId: parsed.options.providerId,
        piArgs: parsed.piArgs,
    });
    installPiLoginSecretMask();
    installPiMarkdownCodeBlocks();
    installTetherRuntimeBranding();
    await installTetherCredentialStore();
    const { main } = await import("@earendil-works/pi-coding-agent");
    await main(parsed.piArgs, {
        extensionFactories: [createTetherExtension(parsed.options)],
    });
}
/** Process-oriented wrapper used by the terminal and bundled RPC entry points. */
export async function runTetherProcess(argv) {
    try {
        await runTether(argv);
    }
    catch (error) {
        process.stderr.write(`${pc.red("error:")} ${formatTetherError(error)}\n`);
        process.exitCode = 1;
    }
}
export function formatTetherError(error) {
    if (error instanceof Error) {
        if (error.name === "ZodError")
            return error.message;
        return error.message;
    }
    return String(error);
}
function parseAuthCommand(argv) {
    const command = argv[0];
    if (command === "login" || command === "logout") {
        return {
            command,
            ...(argv[1] ? { providerId: parseSupportedProviderId(argv[1]) } : {}),
        };
    }
    if (command === "auth" && argv[1] === "status") {
        return {
            command: "status",
            ...(argv[2] ? { providerId: parseSupportedProviderId(argv[2]) } : {}),
        };
    }
    return undefined;
}
//# sourceMappingURL=cli-runtime.js.map