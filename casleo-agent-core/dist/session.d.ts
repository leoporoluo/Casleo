import type { AgentMessage } from "@earendil-works/pi-agent-core";
export declare class SessionStore {
    private readonly workspace;
    private readonly model;
    readonly file: string;
    constructor(workspace: string, model: string);
    load(): Promise<AgentMessage[]>;
    save(messages: AgentMessage[]): Promise<void>;
    clear(): Promise<void>;
}
