import { createModels, createProvider, envApiKeyAuth, } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { modelSupportsVision } from "./model-vision.js";
import { resolveMaxTokens, } from "./settings.js";
import { resolveRegisteredLimits } from "./pi-model-limits.js";
export function createDeepSeekModels(config) {
    if (config.transport === "responses") {
        return createResponsesModels(config);
    }
    return createChatModels(config);
}
function createResponsesModels(config) {
    const model = {
        ...baseModel(config),
        api: "openai-responses",
        compat: {
            supportsDeveloperRole: true,
            supportsLongCacheRetention: false,
            supportsStrictMode: false,
            supportsOpenAIGrammarTools: true,
            sessionAffinityFormat: "openai-nosession",
        },
    };
    return registerModel(config, model, openAIResponsesApi());
}
function createChatModels(config) {
    const vision = modelSupportsVision(config.modelId);
    const model = {
        ...baseModel(config),
        id: config.modelId,
        name: vision ? config.modelId : "DeepSeek V4 Flash",
        api: "openai-completions",
        provider: "deepseek",
        baseUrl: config.baseUrl,
        compat: {
            supportsStore: false,
            supportsDeveloperRole: false,
            ...(vision
                ? {}
                : {
                    requiresReasoningContentOnAssistantMessages: true,
                    thinkingFormat: "openai",
                }),
        },
    };
    return registerModel(config, model, openAICompletionsApi());
}
function baseModel(config) {
    const vision = modelSupportsVision(config.modelId);
    return {
        id: config.modelId,
        name: vision ? config.modelId : "DeepSeek V4 Flash",
        provider: "deepseek",
        baseUrl: config.baseUrl,
        reasoning: !vision,
        input: (vision ? ["text", "image"] : ["text"]),
        cost: {
            input: 0.14,
            output: 0.28,
            cacheRead: 0.0028,
            cacheWrite: 0,
        },
        ...resolveRegisteredLimits(config.modelId, {
            contextWindow: config.contextWindow,
            maxTokens: resolveMaxTokens(config.baseUrl, config.maxTokens),
        }),
        thinkingLevelMap: {
            off: null,
            minimal: null,
            low: "low",
            medium: "high",
            high: "high",
            xhigh: "high",
            max: "max",
        },
    };
}
function registerModel(config, model, api) {
    const provider = createProvider({
        id: "deepseek",
        name: "DeepSeek",
        baseUrl: config.baseUrl,
        auth: {
            apiKey: envApiKeyAuth("DeepSeek API key", ["DEEPSEEK_API_KEY"]),
        },
        models: [model],
        api,
    });
    const models = createModels();
    models.setProvider(provider);
    return { models, model };
}
//# sourceMappingURL=model.js.map
