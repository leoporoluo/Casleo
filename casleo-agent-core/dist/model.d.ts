import { type Model } from "@earendil-works/pi-ai";
import type { AppConfig } from "./config.js";
export declare function createDeepSeekModels(config: AppConfig): {
    models: import("@earendil-works/pi-ai").MutableModels;
    model: Model<"openai-responses">;
} | {
    models: import("@earendil-works/pi-ai").MutableModels;
    model: Model<"openai-completions">;
};
