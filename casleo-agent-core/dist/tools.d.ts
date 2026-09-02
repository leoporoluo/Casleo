import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { HarnessMode } from "./config.js";
import { Workspace } from "./workspace.js";
export declare function createCodingTools(workspace: Workspace, harness?: HarnessMode): AgentTool[];
