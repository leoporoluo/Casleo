export declare function getCasleoHome(): string;
export declare function getCasleoSessionsDir(): string;
export declare function getCasleoArchivedSessionsDir(): string;
/** Configure the underlying runtime to use Casleo Runtime-owned paths only. */
export declare function initializeCasleoHome(): Promise<string>;
export interface PartitionedSessionPath {
    /** Flat hard-link retained for pi's current --resume/session-dir implementation. */
    runtimePath: string;
    /** Canonical transcript path partitioned as sessions/YYYY/MM/DD/*.jsonl. */
    storagePath: string;
}
/**
 * Move a flat pi transcript into a date partition, then retain a flat hard-link.
 * Both names address the same inode, so the runtime remains fully compatible and
 * no transcript content is duplicated.
 */
export declare function partitionSessionFile(file: string): Promise<PartitionedSessionPath>;
export declare function partitionExistingSessions(sessions?: string): Promise<PartitionedSessionPath[]>;
/**
 * Pi resumes via the flat runtime path. If that hard-link was lost, recreate it
 * from the partitioned storage file so open-session does not start an empty transcript.
 */
export declare function ensureSessionRuntimeLink(sessionPath: string, storagePath?: string): Promise<string>;
