import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { PermissionMode } from "./config.js";
export interface SessionUsageSummary {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    latestCacheHitRate?: number;
}
export interface StatusReportDetails {
    provider: string;
    model: string;
    transport: string;
    effort: string;
    permission: PermissionMode;
    sandbox: string;
    network: boolean;
    cwd: string;
    branch?: string | undefined;
    sessionName?: string | undefined;
    sessionFile?: string | undefined;
    context?: {
        tokens?: number | undefined;
        contextWindow: number;
        percent: number | null;
    } | undefined;
    entries: SessionEntry[];
}
export declare function summarizeSessionUsage(entries: SessionEntry[]): SessionUsageSummary;
export declare function formatStatusReport(details: StatusReportDetails): string;
export declare function formatTokenCount(value: number): string;
