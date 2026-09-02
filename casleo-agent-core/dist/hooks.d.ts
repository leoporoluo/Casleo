import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EffectiveAccess } from "./access.js";
export declare function registerHooks(pi: ExtensionAPI, getAccess: () => EffectiveAccess): void;
