import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TetherRuntimeOptions } from "./runtime-options.js";
type AgentRole = "explorer" | "implementer" | "reviewer" | "tester";
interface SubagentResult {
    role: AgentRole;
    task: string;
    success: boolean;
    output: string;
    diff?: string;
}
export declare function registerSubagentTools(pi: ExtensionAPI, runtime: TetherRuntimeOptions): void;
/** Compact one-line status from a child agent JSONL event. */
export declare function liveFromJsonlLine(line: string): string | undefined;
/** Compact text for the parent model; full reports stay in details.results for UI. */
export declare function resultsForModel(results: SubagentResult[]): string;
export declare function clipForModel(text: string, limit: number): string;
export {};
