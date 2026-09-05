import path from "node:path";
import { z } from "zod";
import { casleoEnv } from "./env.js";
import { DEFAULT_API_BASE_URL, getStoredApiBaseUrl, getStoredMaxTokens, normalizeApiBaseUrl, resolveMaxTokens, } from "./settings.js";
export const effortSchema = z.enum(["low", "high", "max"]);
export const transportSchema = z.enum([
    "openai-responses",
    "openai-completions",
    "anthropic-messages",
    "responses",
    "chat",
]);
export const harnessSchema = z.enum(["minimal", "safe"]);
export const permissionSchema = z.enum(["plan", "ask", "auto", "full"]);
export function loadConfig(options) {
    const workspace = path.resolve(options.cwd ?? process.cwd());
    const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
    const effort = effortSchema.parse(options.effort ?? casleoEnv("EFFORT") ?? "max");
    const transport = transportSchema.parse(options.transport ?? casleoEnv("TRANSPORT") ?? "openai-responses");
    const harness = harnessSchema.parse(options.harness ?? casleoEnv("HARNESS") ?? "minimal");
    const permission = options.yes
        ? "full"
        : permissionSchema.parse(options.permission ?? casleoEnv("PERMISSION") ?? "auto");
    const baseUrl = normalizeApiBaseUrl(options.baseUrl ??
        process.env.OPENAI_BASE_URL ??
        getStoredApiBaseUrl() ??
        DEFAULT_API_BASE_URL);
    return {
        workspace,
        apiKey,
        baseUrl,
        maxTokens: resolveMaxTokens(baseUrl, getStoredMaxTokens()),
        modelId: options.model ?? casleoEnv("MODEL") ?? "gpt-5.6-sol",
        effort,
        transport,
        harness,
        permission,
        webSearch: options.web ?? false,
        resume: options.resume ?? true,
        verbose: options.verbose ?? false,
    };
}
//# sourceMappingURL=config.js.map
