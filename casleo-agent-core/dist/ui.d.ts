import type { Agent } from "@earendil-works/pi-agent-core";
export interface Ui {
    dispose(): void;
}
export declare function attachUi(agent: Agent, verbose: boolean): Ui;
interface BannerDetails {
    transport: string;
    harness: string;
    permission: string;
    effort: string;
}
export declare function printBanner(workspace: string, model: string, resumedMessages: number, details?: BannerDetails): void;
export declare function printHelp(): void;
export {};
