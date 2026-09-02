import { RpcClient, type RpcClientOptions } from "@earendil-works/pi-coding-agent";
import type { SupportedProviderId } from "./providers.js";
export type TetherRpcClientOptions = Omit<RpcClientOptions, "cliPath" | "provider"> & {
    /** Model provider for this session. Defaults to DeepSeek. */
    provider?: SupportedProviderId;
};
/**
 * Create a typed client backed by the bundled Tether Runtime RPC worker.
 * The caller owns start/stop and can render all events in a graphical interface.
 */
export declare function createTetherRpcClient(options?: TetherRpcClientOptions): RpcClient;
export declare function getTetherRpcEntryPath(): string;
export { RpcClient };
export type { RpcClientOptions };
