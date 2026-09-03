import { createRequire } from "node:module";
import path from "node:path";
import { z } from "zod";
import { harnessSchema, permissionSchema, transportSchema, } from "./config.js";
import { tetherEnv } from "./env.js";
import { TETHER_VERSION } from "./version.js";
import { DEFAULT_DEEPSEEK_BASE_URL, getTetherStorageSettings, getStoredDeepSeekBaseUrl, getStoredDeepSeekMaxTokens, normalizeDeepSeekBaseUrl, parseMaxTokens, resolveMaxTokens, } from "./settings.js";
import { ASK_USER_TOOL } from "./ask-user.js";
import { defaultEffortForProvider, defaultModelForProvider, getStoredModelSelection, parseSupportedProviderId, SUPPORTED_PROVIDER_IDS, } from "./providers.js";
const require = createRequire(import.meta.url);
export const WEB_ACCESS_TOOLS = ["web_search", "fetch_content", "get_search_content"];
export function getPiWebAccessExtensionPath() {
    try {
        return path.dirname(require.resolve("pi-web-access/package.json"));
    }
    catch {
        return undefined;
    }
}
export const sandboxModeSchema = z.enum(["read-only", "workspace-write", "danger-full-access"]);
function parseWritableRoots(cwd, raw) {
    if (!raw?.trim())
        return [];
    return [...new Set(raw.split(path.delimiter)
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => path.resolve(cwd, item)))];
}
export function parseRuntimeArgs(argv) {
    const forwarded = [];
    const storedSelection = getStoredModelSelection();
    let cwd = process.cwd();
    let baseUrl = process.env.DEEPSEEK_BASE_URL ??
        getStoredDeepSeekBaseUrl() ??
        DEFAULT_DEEPSEEK_BASE_URL;
    let maxTokens = getStoredDeepSeekMaxTokens();
    let providerId = parseSupportedProviderId(tetherEnv("PROVIDER") ?? storedSelection?.providerId ?? "deepseek");
    let modelExplicit = tetherEnv("MODEL") !== undefined;
    let modelId = tetherEnv("MODEL") ??
        (storedSelection?.providerId === providerId ? storedSelection.modelId : undefined);
    let effortExplicit = tetherEnv("EFFORT") !== undefined;
    let effort = tetherEnv("EFFORT");
    let transport = transportSchema.parse(tetherEnv("TRANSPORT") ?? "openai-responses");
    let harness = harnessSchema.parse(tetherEnv("HARNESS") ?? "minimal");
    let permission = permissionSchema.parse(tetherEnv("PERMISSION") ?? "auto");
    let sandbox = sandboxModeSchema.parse(tetherEnv("SANDBOX") ?? "workspace-write");
    let network = false;
    let webSearch = false;
    let activeTools;
    let toolsExplicit = false;
    let writableRoots = parseWritableRoots(cwd, tetherEnv("WRITABLE_ROOTS"));
    const personalizationFile = tetherEnv("PERSONALIZATION_FILE")?.trim();
    let help = false;
    let version = false;
    let yolo = false;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        const [flag, inlineValue] = splitFlag(argument);
        const takeValue = () => {
            if (inlineValue !== undefined)
                return inlineValue;
            const value = argv[index + 1];
            if (!value)
                throw new Error(`${flag} requires a value`);
            index += 1;
            return value;
        };
        if (flag === "-C" || flag === "--cwd") {
            cwd = path.resolve(takeValue());
        }
        else if (flag === "--provider") {
            providerId = parseSupportedProviderId(takeValue());
            if (!modelExplicit)
                modelId = undefined;
            if (!effortExplicit)
                effort = undefined;
        }
        else if (flag === "--base-url") {
            baseUrl = takeValue();
        }
        else if (flag === "--max-tokens") {
            maxTokens = parseMaxTokens(takeValue());
        }
        else if (flag === "--transport") {
            transport = transportSchema.parse(takeValue());
        }
        else if (flag === "--harness") {
            harness = harnessSchema.parse(takeValue());
        }
        else if (flag === "--permission") {
            permission = permissionSchema.parse(takeValue());
        }
        else if (flag === "--sandbox") {
            sandbox = sandboxModeSchema.parse(takeValue());
        }
        else if (flag === "--network") {
            network = true;
        }
        else if (flag === "--writable-root") {
            writableRoots.push(path.resolve(cwd, takeValue()));
            writableRoots = [...new Set(writableRoots)];
        }
        else if (flag === "--web") {
            webSearch = true;
        }
        else if (flag === "--yes" || flag === "-y") {
            permission = "full";
            yolo = true;
        }
        else if (flag === "--effort") {
            effort = takeValue();
            effortExplicit = true;
        }
        else if (flag === "--model") {
            modelId = takeValue();
            modelExplicit = true;
        }
        else if (flag === "--tools") {
            activeTools = takeValue()
                .split(",")
                .map((tool) => tool.trim())
                .filter(Boolean);
            toolsExplicit = true;
        }
        else if (flag === "--no-tools") {
            activeTools = [];
            toolsExplicit = true;
        }
        else if (flag === "--no-resume") {
            // Pi starts a new persisted session unless --continue/--resume is passed.
        }
        else if (flag === "--help" || flag === "-h") {
            help = true;
        }
        else if (flag === "--version" ||
            flag === "-V" ||
            (flag === "version" && argv.length === 1)) {
            version = true;
        }
        else {
            forwarded.push(argument);
        }
    }
    if (yolo &&
        !["--approve", "-a", "--no-approve", "-na"].some((flag) => hasFlag(forwarded, flag))) {
        forwarded.unshift("--approve");
    }
    if (getTetherStorageSettings().historyPersistence === "none" &&
        !["--no-session", "--session", "--resume", "--continue", "--fork"].some((flag) => hasFlag(forwarded, flag))) {
        forwarded.unshift("--no-session");
    }
    modelId ??= defaultModelForProvider(providerId);
    effort ??= defaultEffortForProvider(providerId);
    const extraModelIds = (tetherEnv("EXTRA_MODELS") ?? tetherEnv("HARNESS_EXTRA_MODELS") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    forwarded.unshift("--provider", providerId);
    if (!hasFlag(forwarded, "--model"))
        forwarded.unshift("--model", modelId);
    if (!hasFlag(forwarded, "--thinking"))
        forwarded.unshift("--thinking", effort);
    const webAccess = getPiWebAccessExtensionPath();
    if (webAccess && !forwarded.includes(webAccess))
        forwarded.push("--extension", webAccess);
    activeTools ??= defaultActiveTools(harness);
    return {
        options: {
            cwd,
            providerId,
            baseUrl: normalizeDeepSeekBaseUrl(baseUrl),
            maxTokens: resolveMaxTokens(baseUrl, maxTokens),
            modelId,
            transport,
            harness,
            permission,
            sandbox,
            network,
            webSearch,
            activeTools,
            toolsExplicit,
            extraModelIds,
            writableRoots,
            ...(personalizationFile ? { personalizationFile: path.resolve(personalizationFile) } : {}),
        },
        piArgs: forwarded,
        help,
        version,
    };
}
function defaultActiveTools(harness) {
    const delegation = Number(tetherEnv("SUBAGENT_DEPTH") ?? "0") < 1 ? ["delegate"] : [];
    return harness === "minimal"
        ? ["update_plan", "exec_command", "write_stdin", "apply_patch", ...WEB_ACCESS_TOOLS, ASK_USER_TOOL, ...delegation]
        : [
            "update_plan",
            "read_file",
            "list_files",
            "search_files",
            "language_diagnostics",
            "exec_command",
            "write_stdin",
            "apply_patch",
            ...WEB_ACCESS_TOOLS,
            ASK_USER_TOOL,
            ...delegation,
        ];
}
export function printTetherHelp() {
    process.stdout.write(`Tether Runtime ${TETHER_VERSION} — local-first coding agent

Usage:
  tether [options] [prompt]
  tether -p "task"                 Non-interactive text mode
  tether --mode json -p "task"     JSONL/CI mode
  tether --mode rpc                IDE/RPC server
  tether --resume                  Pick a saved session
  tether --continue                Continue the latest workspace session

Tether Runtime options:
  -C, --cwd <dir>                  Workspace directory
  --provider <id>                 ${SUPPORTED_PROVIDER_IDS.join("|")}
  --base-url <url>                 DeepSeek API base URL
  --model <id>                     Model ID (provider default when omitted)
  --effort <level>                 Alias for --thinking; defaults by provider
  --transport <api>                openai-responses|openai-completions|anthropic-messages
  --harness <minimal|safe>         Tool harness (default: minimal)
  --permission <mode>              plan|ask|auto|full (full grants host + network)
  --sandbox <mode>                 read-only|workspace-write|danger-full-access
  --network                        Pre-authorize command network access for this run
  --web                            Enable DeepSeek server-side web search
  -y, --yes                        YOLO: trust project, skip approvals, allow host + network

Session and editor features:
  /help /settings /new /clear /name /resume /tree /compact /reload /export
  Ctrl+O tool folding, Ctrl+G external editor, Ctrl+P model cycle
  --name, --fork, --session, --session-dir, --skill, --extension
  --mode text|json|rpc, --print, --no-session, --continue, --resume

Tether Runtime commands:
  /plan /permissions /effort /base-url /status /undo /checkpoints /diff /jobs /mcp /agents /doctor

Authentication:
  tether login [provider]           Sign in to a supported model provider
  tether logout [provider]          Remove the selected provider credential
  tether auth status                Show credential sources without revealing secrets
  /login                            Choose a provider interactively
  /login <provider>                 Authenticate a specific provider

Experimental Windows sandbox:
  tether sandbox setup              Install identities and WFP filters (elevated terminal)
  tether sandbox status             Inspect native sandbox readiness
  tether sandbox uninstall          Remove native sandbox state (elevated terminal)
  TETHER_WINDOWS_SANDBOX=1          Explicitly opt in after setup succeeds
`);
}
function splitFlag(argument) {
    if (!argument.startsWith("--") || !argument.includes("="))
        return [argument, undefined];
    const index = argument.indexOf("=");
    return [argument.slice(0, index), argument.slice(index + 1)];
}
function hasFlag(args, flag) {
    return args.some((argument) => argument === flag || argument.startsWith(`${flag}=`));
}
//# sourceMappingURL=runtime-options.js.map
