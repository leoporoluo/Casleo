export declare const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export declare const DEEPSEEK_MAX_TOKENS = 384000;
export declare function parseMaxTokens(value: unknown): number | undefined;
export declare function isOfficialDeepSeekBaseUrl(baseUrl: string): boolean;
export declare function resolveMaxTokens(baseUrl: string, configured?: number): number | undefined;
export type CredentialStoreMode = "file" | "keyring" | "auto";
export type HistoryPersistence = "save-all" | "none";
export interface CasleoStorageSettings {
    credentialStore: CredentialStoreMode;
    historyPersistence: HistoryPersistence;
    sqliteHome?: string;
}
export declare function getCasleoSettingsPath(): string;
export declare function getStoredDeepSeekBaseUrl(settingsPath?: string): string | undefined;
export declare function getStoredDeepSeekMaxTokens(settingsPath?: string): number | undefined;
export declare function getCasleoStorageSettings(settingsPath?: string): CasleoStorageSettings;
export declare function parseCredentialStoreMode(value: unknown): CredentialStoreMode;
export declare function parseHistoryPersistence(value: unknown): HistoryPersistence;
export declare function saveDeepSeekBaseUrl(baseUrl: string, settingsPath?: string): Promise<string>;
export declare function saveDeepSeekMaxTokens(maxTokens: number | undefined, settingsPath?: string): Promise<void>;
export declare function normalizeDeepSeekBaseUrl(value: string): string;
