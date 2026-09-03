import type { AuthInteraction } from "@earendil-works/pi-ai";
import { type SupportedProviderId } from "./providers.js";
export type ApiKeyProviderId = Exclude<SupportedProviderId, "openai-codex">;
export interface ProviderLoginResult {
    providerId: Exclude<SupportedProviderId, "deepseek">;
    modelId: string;
}
export type KeyValidation = {
    status: "valid";
    modelAvailable: boolean;
} | {
    status: "invalid";
    message: string;
} | {
    status: "unverified";
    message: string;
};
export declare function getCasleoAgentDir(): string;
export declare function getCasleoAuthPath(): string;
export declare function hasStoredDeepSeekKey(authPath?: string): Promise<boolean>;
export declare function hasStoredProviderCredential(providerId: SupportedProviderId, authPath?: string): Promise<boolean>;
export declare function hasDeepSeekEnvironmentKey(): boolean;
export declare function saveDeepSeekKey(key: string, authPath?: string): Promise<void>;
export declare function saveProviderApiKey(providerId: ApiKeyProviderId, key: string, authPath?: string): Promise<void>;
export declare function removeStoredDeepSeekKey(authPath?: string): Promise<boolean>;
export declare function removeStoredProviderCredential(providerId: SupportedProviderId, authPath?: string): Promise<boolean>;
export declare function validateDeepSeekKey(key: string, baseUrl: string, modelId: string, fetchImpl?: typeof fetch): Promise<KeyValidation>;
export declare function isInteractiveInvocation(piArgs: string[]): boolean;
export declare function ensureFirstRunAuth(options: {
    providerId: SupportedProviderId;
    piArgs: string[];
}): Promise<void>;
export declare function runAuthCommand(command: "login" | "logout" | "status", options: {
    providerId: SupportedProviderId;
    baseUrl: string;
    modelId: string;
}): Promise<void>;
/** Authenticate a non-DeepSeek provider using callbacks supplied by a terminal or graphical host. */
export declare function authenticateProvider(providerId: Exclude<SupportedProviderId, "deepseek">, interaction: AuthInteraction): Promise<ProviderLoginResult>;
export declare function formatBaseUrlPrompt(defaultBaseUrl: string): string;
