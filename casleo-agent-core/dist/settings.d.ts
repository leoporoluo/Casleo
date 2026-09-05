export declare const DEFAULT_API_BASE_URL = "https://api.openai.com/v1";
export declare function parseMaxTokens(value: unknown): number | undefined;
export declare function resolveMaxTokens(baseUrl: string, configured?: number): number | undefined;
export type CredentialStoreMode = "file" | "keyring" | "auto";
export type HistoryPersistence = "save-all" | "none";
export interface CasleoStorageSettings {
    credentialStore: CredentialStoreMode;
    historyPersistence: HistoryPersistence;
    sqliteHome?: string;
}
export declare function getCasleoSettingsPath(): string;
export declare function getStoredApiBaseUrl(settingsPath?: string): string | undefined;
export declare function getStoredMaxTokens(settingsPath?: string): number | undefined;
export declare function getCasleoStorageSettings(settingsPath?: string): CasleoStorageSettings;
export declare function parseCredentialStoreMode(value: unknown): CredentialStoreMode;
export declare function parseHistoryPersistence(value: unknown): HistoryPersistence;
export declare function saveApiBaseUrl(baseUrl: string, settingsPath?: string): Promise<string>;
export declare function saveMaxTokens(maxTokens: number | undefined, settingsPath?: string): Promise<void>;
export declare function normalizeApiBaseUrl(value: string): string;
