import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TetherRuntimeOptions, SandboxMode } from "./runtime-options.js";
interface DiagnosticCommand {
    language: string;
    command: string;
}
export declare function registerDiagnosticsTool(pi: ExtensionAPI, options: TetherRuntimeOptions, getSandboxMode: () => SandboxMode): void;
export declare function detectDiagnosticCommands(cwd: string, selected?: Array<"typescript" | "python" | "rust" | "go" | "swift">, boundary?: string): DiagnosticCommand[];
export {};
