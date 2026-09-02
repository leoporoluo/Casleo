import { Workspace } from "./workspace.js";
export interface FileSnapshot {
    path: string;
    content: string | null;
    mode?: number;
    hash: string;
}
export interface PatchCheckpoint {
    id: string;
    createdAt: string;
    patch: string;
    before: FileSnapshot[];
    after: FileSnapshot[];
}
export declare function capturePatchCheckpoint(workspace: Workspace, patchInput: string, apply: () => Promise<void>): Promise<PatchCheckpoint>;
export declare function captureWorkspaceCheckpoint<T>(workspace: Workspace, label: string, apply: () => Promise<T>): Promise<{
    checkpoint?: PatchCheckpoint;
    result: T;
}>;
export declare function restoreCheckpoint(workspace: Workspace, checkpoint: PatchCheckpoint, force?: boolean): Promise<string[]>;
export declare function extractTouchedPaths(input: string): string[];
