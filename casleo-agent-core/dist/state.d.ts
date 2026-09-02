export interface TetherThread {
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
export declare function getTetherStatePath(): string;
/** SQLite is an index/runtime-state layer; JSONL remains the transcript source of truth. */
export declare class TetherStateStore {
    readonly statePath: string;
    private readonly database;
    private readonly findByPath;
    constructor(statePath?: string);
    close(): void;
    refresh(): Promise<void>;
    indexSession(file: string): Promise<TetherThread | undefined>;
    list(options?: ListThreadOptions): TetherThread[];
    get(id: string): TetherThread | undefined;
    setPinned(id: string, pinned: boolean): boolean;
    archive(id: string): Promise<TetherThread | undefined>;
    unarchive(id: string): Promise<TetherThread | undefined>;
    private indexFile;
}
export declare function listTetherThreads(options?: ListThreadOptions): Promise<TetherThread[]>;
export declare function indexTetherSession(file: string): Promise<TetherThread | undefined>;
