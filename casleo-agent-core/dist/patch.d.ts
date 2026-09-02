import { Workspace } from "./workspace.js";
interface AddAction {
    type: "add";
    path: string;
    lines: string[];
}
interface DeleteAction {
    type: "delete";
    path: string;
}
interface UpdateAction {
    type: "update";
    path: string;
    moveTo?: string;
    hunks: PatchHunk[];
}
interface PatchHunk {
    header: string;
    lines: string[];
    endOfFile: boolean;
}
type PatchAction = AddAction | DeleteAction | UpdateAction;
export interface ApplyPatchResult {
    files: string[];
    additions: number;
    deletions: number;
}
export declare function applyWorkspacePatch(workspace: Workspace, input: string): Promise<ApplyPatchResult>;
export declare function parsePatch(input: string): PatchAction[];
export {};
