import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
export declare class MCPManager {
    private readonly servers;
    private errors;
    connectConfigured(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void>;
    status(): string;
    toolNames(): string[];
    close(): Promise<void>;
    private connectServer;
}
