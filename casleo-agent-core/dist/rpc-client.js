import { fileURLToPath } from "node:url";
import { RpcClient, } from "@earendil-works/pi-coding-agent";
/**
 * Create a typed client backed by the bundled Tether Runtime RPC worker.
 * The caller owns start/stop and can render all events in a graphical interface.
 */
export function createTetherRpcClient(options = {}) {
    return new RpcClient({
        ...options,
        cliPath: getTetherRpcEntryPath(),
        provider: options.provider ?? "deepseek",
    });
}
export function getTetherRpcEntryPath() {
    return fileURLToPath(new URL("./rpc-entry.js", import.meta.url));
}
export { RpcClient };
//# sourceMappingURL=rpc-client.js.map