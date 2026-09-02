import type { SandboxOptions, SandboxedCommand } from "./sandbox.js";
import type { ShellInvocation } from "./shell.js";
interface WindowsSandboxRuntime {
    helperPath: string;
    statePath: string;
    shell?: ShellInvocation;
}
export type WindowsSandboxLifecycleCommand = "setup" | "status" | "uninstall";
export declare function windowsNativeSandboxEnabled(): boolean;
export declare function windowsNativeSandboxCommand(shellCommand: string, cwd: string, options: SandboxOptions): SandboxedCommand;
export declare function buildWindowsSandboxCommand(shellCommand: string, cwd: string, options: SandboxOptions, runtime: WindowsSandboxRuntime): SandboxedCommand;
export declare function windowsNativeSandboxDescription(options: SandboxOptions): string;
export declare function parseWindowsSandboxLifecycleCommand(argv: string[]): WindowsSandboxLifecycleCommand | undefined;
export declare function runWindowsSandboxLifecycle(command: WindowsSandboxLifecycleCommand): void;
export {};
