/** Run one Tether Runtime CLI, JSON, or RPC process using the shared runtime. */
export declare function runTether(argv: string[]): Promise<void>;
/** Process-oriented wrapper used by the terminal and bundled RPC entry points. */
export declare function runTetherProcess(argv: string[]): Promise<void>;
export declare function formatTetherError(error: unknown): string;
