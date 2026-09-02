import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Theme, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
export interface ToolPresentationContext {
    isError: boolean;
    isPartial: boolean;
}
export declare function renderToolCall(label: string, detail: string | undefined, theme: Theme, context: ToolPresentationContext): Text;
export declare function renderCollapsibleToolResult(result: AgentToolResult<unknown>, options: ToolRenderResultOptions, theme: Theme, context: ToolPresentationContext, config?: {
    collapsedSummary?: string | false;
    forceError?: boolean;
}): Text;
export declare function toolResultText(result: AgentToolResult<unknown>): string;
export declare function oneLine(value: string, limit?: number): string;
