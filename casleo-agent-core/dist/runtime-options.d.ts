import { z } from "zod";
import { type HarnessMode, type ModelTransport, type PermissionMode } from "./config.js";
import { type SupportedProviderId } from "./providers.js";
export declare const WEB_ACCESS_TOOLS: readonly ["web_search", "fetch_content", "get_search_content"];
export declare function getPiWebAccessExtensionPath(): string | undefined;
export declare const sandboxModeSchema: z.ZodEnum<{
    "read-only": "read-only";
    "workspace-write": "workspace-write";
    "danger-full-access": "danger-full-access";
}>;
export type SandboxMode = z.infer<typeof sandboxModeSchema>;
export interface CasleoRuntimeOptions {
    cwd: string;
    providerId: SupportedProviderId;
    baseUrl: string;
    maxTokens?: number;
    contextWindow?: number;
    modelId: string;
    transport: ModelTransport;
    harness: HarnessMode;
    permission: PermissionMode;
    sandbox: SandboxMode;
    network: boolean;
    webSearch: boolean;
    activeTools: string[];
    toolsExplicit: boolean;
    extraModelIds: string[];
    personalizationFile?: string;
    writableRoots: string[];
}
export interface ParsedRuntimeArgs {
    options: CasleoRuntimeOptions;
    piArgs: string[];
    help: boolean;
    version: boolean;
}
export declare function parseRuntimeArgs(argv: string[]): ParsedRuntimeArgs;
export declare function printCasleoHelp(): void;
