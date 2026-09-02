import { type ChildProcess } from "node:child_process";
/**
 * Track a detached child so closing the RPC / desktop app can wipe it.
 * Detached spawns outlive a plain parent.kill() unless we reap them explicitly.
 */
export declare function trackDetachedChild(child: ChildProcess): void;
/** Kill every tracked detached child (and their descendants). */
export declare function wipeTrackedChildren(signal?: NodeJS.Signals): void;
/**
 * Recursively kill pid's descendants, then pid itself.
 * Also tries the process group (-pid) for detached group leaders.
 */
export declare function killProcessTree(pid: number, signal?: NodeJS.Signals): void;
export declare function listChildPids(pid: number): number[];
