import type { SandboxMode } from "./runtime-options.js";
export interface CasleoPromptOptions {
    sandbox?: SandboxMode | string;
    sandboxLabel?: string;
    network?: boolean;
    projectCommands?: string[];
}
/** Stable Casleo rules plus dynamic sandbox/network/project-command lines. */
export declare function casleoPromptSuffix(options: CasleoPromptOptions): string;
/** Keep Pi's official prompt as the prefix. Casleo only appends a short contract. */
export declare function applyCasleoSystemPrompt(piPrompt: string, options?: CasleoPromptOptions): string;
