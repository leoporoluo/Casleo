import { z } from "zod";
export declare const effortSchema: z.ZodEnum<{
    low: "low";
    high: "high";
    max: "max";
}>;
export type Effort = z.infer<typeof effortSchema>;
export declare const transportSchema: z.ZodEnum<{
    "openai-responses": "openai-responses";
    "openai-completions": "openai-completions";
    "anthropic-messages": "anthropic-messages";
    responses: "responses";
    chat: "chat";
}>;
export type ModelTransport = z.infer<typeof transportSchema>;
export declare const harnessSchema: z.ZodEnum<{
    minimal: "minimal";
    safe: "safe";
}>;
export type HarnessMode = z.infer<typeof harnessSchema>;
export declare const permissionSchema: z.ZodEnum<{
    auto: "auto";
    plan: "plan";
    ask: "ask";
    full: "full";
}>;
export type PermissionMode = z.infer<typeof permissionSchema>;
export interface AppConfig {
    workspace: string;
    apiKey: string;
    baseUrl: string;
    maxTokens: number;
    modelId: string;
    effort: Effort;
    transport: ModelTransport;
    harness: HarnessMode;
    permission: PermissionMode;
    webSearch: boolean;
    resume: boolean;
    verbose: boolean;
}
export interface CliOptions {
    cwd?: string;
    baseUrl?: string;
    model?: string;
    effort?: string;
    transport?: string;
    harness?: string;
    permission?: string;
    web?: boolean;
    yes?: boolean;
    resume?: boolean;
    verbose?: boolean;
}
export declare function loadConfig(options: CliOptions): AppConfig;
