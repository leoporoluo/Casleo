/** Run one Casleo Runtime CLI, JSON, or RPC process using the shared runtime. */
export declare function runCasleo(argv: string[]): Promise<void>;
/** Process-oriented wrapper used by the terminal and bundled RPC entry points. */
export declare function runCasleoProcess(argv: string[]): Promise<void>;
export declare function formatCasleoError(error: unknown): string;
