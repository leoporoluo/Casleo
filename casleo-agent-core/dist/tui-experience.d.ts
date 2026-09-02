import { type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import type { PermissionMode } from "./config.js";
import { type EditorImageAttachment } from "./image-input.js";
import type { TetherRuntimeOptions } from "./runtime-options.js";
export declare const EDITOR_PLACEHOLDER = "Ask Tether Runtime to change, explain, or test code";
export declare const HIDDEN_THINKING_LABEL = "Tether Runtime is thinking";
export declare function registerCodingTui(pi: ExtensionAPI, options: TetherRuntimeOptions, getAccess: () => {
    permission: PermissionMode;
    sandbox: TetherRuntimeOptions["sandbox"];
    network: boolean;
}): void;
export declare function highlightImageMarkers(line: string, attachments: readonly EditorImageAttachment[], theme: Theme): string;
export declare function formatThinkingLabel(modelName?: string): string;
export declare function renderEditorPlaceholder(theme: Theme, hardwareCursor: boolean): string;
export declare function stripFakeCursorHighlight(line: string): string;
export interface MinimalStatusDetails {
    model: string;
    effort: string;
    permission: PermissionMode;
    sandbox: TetherRuntimeOptions["sandbox"];
    network: boolean;
    cwd: string;
    contextPercent: number | null;
}
export declare function minimalStatusParts(details: MinimalStatusDetails): string[];
export declare function renderMinimalStatus(width: number, details: MinimalStatusDetails, theme: Theme): string;
export declare function formatContext(ctx: ExtensionContext): string;
export declare function panelLine(line: string, width: number, theme: Theme): string;
