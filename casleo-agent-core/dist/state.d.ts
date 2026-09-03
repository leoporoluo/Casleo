export interface CasleoThread {
    id: string;
    sessionPath: string;
    storagePath: string;
    cwd: string;
    title: string;
    preview?: string;
    provider?: string;
    model?: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    pinned: boolean;
    archived: boolean;
}
export interface ListThreadOptions {
    cwd?: string;
    includeArchived?: boolean;
}
export declare function getCasleoStatePath(): string;
/** SQLite is an index/runtime-state layer; JSONL remains the transcript source of truth. */
export declare class CasleoStateStore {
    readonly statePath: string;
    private readonly database;
    private readonly findByPath;
    constructor(statePath?: string);
    close(): void;
    refresh(): Promise<void>;
    indexSession(file: string): Promise<CasleoThread | undefined>;
    list(options?: ListThreadOptions): CasleoThread[];
    get(id: string): CasleoThread | undefined;
    setPinned(id: string, pinned: boolean): boolean;
    archive(id: string): Promise<CasleoThread | undefined>;
    unarchive(id: string): Promise<CasleoThread | undefined>;
    private indexFile;
}
export declare function listCasleoThreads(options?: ListThreadOptions): Promise<CasleoThread[]>;
export declare function indexCasleoSession(file: string): Promise<CasleoThread | undefined>;
