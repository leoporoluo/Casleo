export declare const SUPPORTED_PROVIDER_IDS: readonly ["deepseek", "openai-codex", "openai", "anthropic", "openrouter", "zai", "kimi-coding", "minimax", "xai", "opencode-go"];
export type SupportedProviderId = (typeof SUPPORTED_PROVIDER_IDS)[number];
export declare const MODEL_CREDENTIAL_ENV_KEYS: readonly ["DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "ZAI_API_KEY", "KIMI_API_KEY", "MINIMAX_API_KEY", "XAI_API_KEY", "OPENCODE_API_KEY"];
export interface StoredModelSelection {
    providerId: SupportedProviderId;
    modelId?: string;
}
export declare function isSupportedProviderId(value: string): value is SupportedProviderId;
export declare function parseSupportedProviderId(value: string): SupportedProviderId;
export declare function defaultModelForProvider(providerId: SupportedProviderId): string;
export declare function defaultEffortForProvider(providerId: SupportedProviderId): string;
export declare function providerDisplayName(providerId: SupportedProviderId): string;
export declare function providerEnvironmentKey(providerId: SupportedProviderId): string | undefined;
export declare function getStoredModelSelection(settingsPath?: string): StoredModelSelection | undefined;
export declare function stripModelCredentialEnvironment<T extends Record<string, string | undefined>>(environment: T): T;
