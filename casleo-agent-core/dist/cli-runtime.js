import process from "node:process";
import pc from "picocolors";
import { ensureFirstRunAuth, runAuthCommand } from "./auth.js";
import { installCasleoCredentialStore } from "./credential-store.js";
import { createCasleoExtension } from "./casleo-extension.js";
import { initializeCasleoHome } from "./home.js";
import { installPiLoginSecretMask } from "./pi-login-mask.js";
import { installPiMarkdownCodeBlocks } from "./pi-markdown.js";
import { parseSupportedProviderId } from "./providers.js";
import { parseRuntimeArgs, printCasleoHelp } from "./runtime-options.js";
import { installCasleoRuntimeBranding } from "./runtime-branding.js";
import { ensureCasleoUiDefaults } from "./ui-defaults.js";
import { CASLEO_VERSION } from "./version.js";
import { parseWindowsSandboxLifecycleCommand, runWindowsSandboxLifecycle, } from "./windows-sandbox.js";
/** Run one Casleo Runtime CLI, JSON, or RPC process using the shared runtime. */
export async function runCasleo(argv) {
    const windowsSandboxCommand = parseWindowsSandboxLifecycleCommand(argv);
    if (windowsSandboxCommand) {
        runWindowsSandboxLifecycle(windowsSandboxCommand);
        return;
    }
    const parsed = parseRuntimeArgs(argv);
    if (parsed.help) {
        printCasleoHelp();
        return;
    }
    if (parsed.version) {
        process.stdout.write(`${CASLEO_VERSION}\n`);
        return;
    }
    process.chdir(parsed.options.cwd);
    const agentDirectory = await initializeCasleoHome();
    process.env.PI_TELEMETRY ??= "0";
    process.env.PI_SKIP_VERSION_CHECK ??= "1";
    await ensureCasleoUiDefaults(agentDirectory);
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
    installCasleoRuntimeBranding();
    await installCasleoCredentialStore();
    const { main } = await import("@earendil-works/pi-coding-agent");
    await main(parsed.piArgs, {
        extensionFactories: [createCasleoExtension(parsed.options)],
    });
}
/** Process-oriented wrapper used by the terminal and bundled RPC entry points. */
export async function runCasleoProcess(argv) {
    try {
        await runCasleo(argv);
    }
    catch (error) {
        process.stderr.write(`${pc.red("error:")} ${formatCasleoError(error)}\n`);
        process.exitCode = 1;
    }
}
export function formatCasleoError(error) {
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