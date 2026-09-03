import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CasleoRuntimeOptions, SandboxMode } from "./runtime-options.js";
interface DiagnosticCommand {
    language: string;
    command: string;
}
export declare function registerDiagnosticsTool(pi: ExtensionAPI, options: CasleoRuntimeOptions, getSandboxMode: () => SandboxMode): void;
export declare function detectDiagnosticCommands(cwd: string, selected?: Array<"typescript" | "python" | "rust" | "go" | "swift">, boundary?: string): DiagnosticCommand[];
export {};
