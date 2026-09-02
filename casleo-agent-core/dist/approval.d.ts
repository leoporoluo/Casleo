import type { PermissionMode } from "./config.js";
export type Confirmation = (message: string) => Promise<boolean>;
export interface ApprovalDecision {
    allowed: boolean;
    reason?: string;
}
export declare class ApprovalController {
    private mode;
    private readonly confirm?;
    constructor(mode: PermissionMode, confirm?: Confirmation | undefined);
    get permissionMode(): PermissionMode;
    set permissionMode(mode: PermissionMode);
    approve(toolName: string, args: unknown): Promise<ApprovalDecision>;
    private ask;
}
export type CommandRisk = "read-only" | "needs-approval" | "dangerous";
export declare function classifyCommand(command: string): CommandRisk;
