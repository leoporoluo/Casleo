export interface ProcessResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
    truncated: boolean;
}
interface RunProcessOptions {
    cwd: string;
    signal?: AbortSignal | undefined;
    timeoutMs?: number;
    maxOutputBytes?: number;
    shell?: boolean | string;
}
export declare function runProcess(command: string, args: string[], options: RunProcessOptions): Promise<ProcessResult>;
export declare class BoundedOutput {
    private readonly limit;
    private readonly headLimit;
    private readonly tailLimit;
    private head;
    private tail;
    private seen;
    constructor(limit: number);
    get truncated(): boolean;
    append(chunk: string): void;
    value(): string;
}
export {};
