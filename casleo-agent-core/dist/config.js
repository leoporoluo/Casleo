import path from "node:path";
import { z } from "zod";
import { tetherEnv } from "./env.js";
import { DEFAULT_DEEPSEEK_BASE_URL, getStoredDeepSeekBaseUrl, getStoredDeepSeekMaxTokens, normalizeDeepSeekBaseUrl, resolveMaxTokens, } from "./settings.js";
export const effortSchema = z.enum(["low", "high", "max"]);
export const transportSchema = z.enum(["responses", "chat"]);
export const harnessSchema = z.enum(["minimal", "safe"]);
export const permissionSchema = z.enum(["plan", "ask", "auto", "full"]);
export function loadConfig(options) {
    const workspace = path.resolve(options.cwd ?? process.cwd());
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim() ?? "";
    const effort = effortSchema.parse(options.effort ?? tetherEnv("EFFORT") ?? "max");
    const transport = transportSchema.parse(options.transport ?? tetherEnv("TRANSPORT") ?? "responses");
    const harness = harnessSchema.parse(options.harness ?? tetherEnv("HARNESS") ?? "minimal");
    const permission = options.yes
        ? "full"
        : permissionSchema.parse(options.permission ?? tetherEnv("PERMISSION") ?? "auto");
    const baseUrl = normalizeDeepSeekBaseUrl(options.baseUrl ??
        process.env.DEEPSEEK_BASE_URL ??
        getStoredDeepSeekBaseUrl() ??
        DEFAULT_DEEPSEEK_BASE_URL);
    return {
        workspace,
        apiKey,
        baseUrl,
        maxTokens: resolveMaxTokens(baseUrl, getStoredDeepSeekMaxTokens()),
        modelId: options.model ?? tetherEnv("MODEL") ?? "deepseek-v4-flash",
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