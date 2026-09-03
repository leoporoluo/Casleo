import { fileURLToPath } from "node:url";
import { RpcClient, } from "@earendil-works/pi-coding-agent";
/**
 * Create a typed client backed by the bundled Casleo Runtime RPC worker.
 * The caller owns start/stop and can render all events in a graphical interface.
 */
export function createCasleoRpcClient(options = {}) {
    return new RpcClient({
        ...options,
        cliPath: getCasleoRpcEntryPath(),
        provider: options.provider ?? "deepseek",
    });
}
export function getCasleoRpcEntryPath() {
    return fileURLToPath(new URL("./rpc-entry.js", import.meta.url));
}
export { RpcClient };
//# sourceMappingURL=rpc-client.js.map