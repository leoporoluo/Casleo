import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";
import { type CredentialStoreMode } from "./settings.js";
interface KeyringEntry {
    getPassword(): string | null;
    setPassword(password: string): void;
    deletePassword(): boolean;
}
export interface TetherKeyringFactory {
    create(service: string, account: string): KeyringEntry;
}
export interface CreateCredentialStoreOptions {
    mode?: CredentialStoreMode;
    authPath?: string;
    metadataPath?: string;
    keyringFactory?: TetherKeyringFactory;
}
/** Plain JSON fallback compatible with pi's existing auth.json shape. */
export declare class FileCredentialStore implements CredentialStore {
    readonly authPath: string;
    constructor(authPath?: string);
    read(providerId: string): Promise<Credential | undefined>;
    list(): Promise<readonly CredentialInfo[]>;
    modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>): Promise<Credential | undefined>;
    delete(providerId: string): Promise<void>;
}
/** CredentialStore backed by Keychain, Credential Manager, or Secret Service. */
export declare class KeyringCredentialStore implements CredentialStore {
    private readonly factory;
    readonly metadataPath: string;
    constructor(factory: TetherKeyringFactory, metadataPath?: string);
    read(providerId: string): Promise<Credential | undefined>;
    list(): Promise<readonly CredentialInfo[]>;
    modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>): Promise<Credential | undefined>;
    delete(providerId: string): Promise<void>;
    private lockPath;
    private remember;
}
export declare function createTetherCredentialStore(options?: CreateCredentialStoreOptions): Promise<CredentialStore>;
/**
 * pi's CLI creates ModelRuntime internally. Patch its public factory once so every
 * TUI, JSON, and RPC runtime receives the same Tether Runtime-owned credential store.
 */
export declare function installTetherCredentialStore(): Promise<void>;
export {};
