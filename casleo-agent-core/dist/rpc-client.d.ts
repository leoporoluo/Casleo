import { RpcClient, type RpcClientOptions } from "@earendil-works/pi-coding-agent";
import type { SupportedProviderId } from "./providers.js";
export type CasleoRpcClientOptions = Omit<RpcClientOptions, "cliPath" | "provider"> & {
    /** Model provider for this session. Defaults to DeepSeek. */
    provider?: SupportedProviderId;
};
/**
 * Create a typed client backed by the bundled Casleo Runtime RPC worker.
 * The caller owns start/stop and can render all events in a graphical interface.
 */
export declare function createCasleoRpcClient(options?: CasleoRpcClientOptions): RpcClient;
export declare function getCasleoRpcEntryPath(): string;
export { RpcClient };
export type { RpcClientOptions };
