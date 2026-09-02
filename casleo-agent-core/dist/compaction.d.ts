import { type Agent } from "@earendil-works/pi-agent-core";
import type { Model, Models, Usage } from "@earendil-works/pi-ai";
export interface CompactResult {
    compacted: boolean;
    tokensBefore: number;
    messagesBefore: number;
    messagesAfter: number;
    usage?: Usage;
}
export declare function compactAgentContext(agent: Agent, models: Models, model: Model<any>, options: {
    force: boolean;
    signal?: AbortSignal;
}): Promise<CompactResult>;
