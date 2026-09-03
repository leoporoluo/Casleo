import type { Model } from "@earendil-works/pi-ai";
export declare const FALLBACK_CONTEXT_WINDOW = 128000;
export declare const FALLBACK_MAX_TOKENS = 32768;
export declare function findPiModel(modelId: string | undefined): Model | undefined;
export declare function resolveRegisteredLimits(modelId: string | undefined, overrides?: {
    contextWindow?: number;
    maxTokens?: number;
}): {
    contextWindow: number;
    maxTokens: number;
};
