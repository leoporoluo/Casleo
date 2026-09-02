import type { PermissionMode } from "./config.js";
import type { ManagedProcessResult } from "./managed-process.js";
import type { SandboxMode } from "./runtime-options.js";
export type AccessBoundary = "network" | "host";
export interface EffectiveAccess {
    sandbox: SandboxMode;
    network: boolean;
}
/** Session-scoped grants layered over safe startup defaults. */
export declare class SessionAccessController {
    private readonly baseSandbox;
    private readonly baseNetwork;
    private sessionNetwork;
    private sessionHost;
    constructor(baseSandbox: SandboxMode, baseNetwork: boolean);
    effective(permission: PermissionMode): EffectiveAccess;
    forCommand(permission: PermissionMode, _command: string): EffectiveAccess;
    grantForSession(boundary: AccessBoundary, _command?: string): void;
    grantOnce(permission: PermissionMode, boundary: AccessBoundary): EffectiveAccess;
    describeGrants(): string[];
}
export declare function commandNeedsNetwork(command: string): boolean;
export declare function detectSandboxBoundary(command: string, result: ManagedProcessResult, access: EffectiveAccess): AccessBoundary | undefined;
