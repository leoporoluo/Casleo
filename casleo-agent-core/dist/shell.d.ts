export interface ShellInvocation {
    command: string;
    args: string[];
    description: string;
}
/** Host shell dialect for the model. Affirmative only — listing forbidden Unix syntax makes the model recite it. */
export declare function shellPromptRules(platform?: NodeJS.Platform): string[];
export declare function execCommandParameterDescription(platform?: NodeJS.Platform): string;
/** Drop Pi's bash/rg coaching so Windows sessions do not open with a dialect lecture. */
export declare function stripUnixShellCoaching(prompt: string, platform?: NodeJS.Platform): string;
/** Build a host-shell invocation without asking Node to reinterpret the command. */
export declare function hostShellCommand(shellCommand: string): ShellInvocation;
