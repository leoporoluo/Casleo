import type { SandboxMode } from "./runtime-options.js";
export interface SandboxOptions {
    mode: SandboxMode;
    network: boolean;
    /** Extra host paths allowed for workspace-write (resolved absolute). */
    writableRoots?: string[];
}
export interface SandboxedCommand {
    command: string;
    args: string[];
    description: string;
}
export declare function sandboxCommand(shellCommand: string, cwd: string, options: SandboxOptions): SandboxedCommand;
export declare function sandboxDescription(options: SandboxOptions): string;
export declare function executeSandboxedCommand(shellCommand: string, cwd: string, sandbox: SandboxOptions, options: {
    onData: (data: Buffer) => void;
    signal?: AbortSignal;
    timeout?: number;
    env?: NodeJS.ProcessEnv;
}): Promise<{
    exitCode: number | null;
}>;
