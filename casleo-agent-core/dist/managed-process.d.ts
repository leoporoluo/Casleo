import { type SandboxOptions } from "./sandbox.js";
export interface ManagedProcessResult {
    processId: string;
    running: boolean;
    output: string;
    exitCode?: number | null;
    timedOut?: boolean;
    sandbox: string;
}
export declare class ManagedProcessRegistry {
    private readonly records;
    start(command: string, options: {
        cwd: string;
        sandbox: SandboxOptions;
        yieldTimeMs: number;
        timeoutMs: number;
        signal?: AbortSignal;
        onOutput?: (result: ManagedProcessResult) => void;
    }): Promise<ManagedProcessResult>;
    interact(processId: string, options: {
        chars?: string;
        yieldTimeMs: number;
        terminate?: boolean;
    }): Promise<ManagedProcessResult>;
    list(): Array<{
        processId: string;
        command: string;
        running: boolean;
        sandbox: string;
    }>;
    dispose(): void;
    private result;
    /** Live snapshot of cumulative output (does not clear the pending delta). */
    private snapshot;
}
