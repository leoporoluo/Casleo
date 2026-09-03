import { getBuiltinModel, getBuiltinModels, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";

/** Used only when Pi has no catalog entry for the model id. */
export const FALLBACK_CONTEXT_WINDOW = 128_000;
export const FALLBACK_MAX_TOKENS = 32_768;

const PREFERRED_PROVIDERS = ["openai", "openai-codex", "azure-openai-responses", "deepseek"];

let catalog;

function addModel(exact, lower, model, preferred) {
    const id = typeof model?.id === "string" ? model.id : "";
    if (!id || !Number.isFinite(model.contextWindow) || model.contextWindow < 1)
        return;
    if (preferred || !exact.has(id))
        exact.set(id, model);
    const key = id.toLowerCase();
    if (preferred || !lower.has(key))
        lower.set(key, model);
    const slash = key.lastIndexOf("/");
    if (slash >= 0) {
        const short = key.slice(slash + 1);
        if (short && (preferred || !lower.has(short)))
            lower.set(short, model);
    }
}

function modelCatalog() {
    if (catalog)
        return catalog;
    const exact = new Map();
    const lower = new Map();
    for (const provider of getBuiltinProviders()) {
        for (const model of getBuiltinModels(provider))
            addModel(exact, lower, model, false);
    }
    for (const provider of PREFERRED_PROVIDERS) {
        for (const model of getBuiltinModels(provider))
            addModel(exact, lower, model, true);
    }
    catalog = { exact, lower };
    return catalog;
}

/** Look up Pi's built-in model catalog without changing Pi itself. */
export function findPiModel(modelId) {
    if (!modelId)
        return undefined;
    const id = String(modelId);
    for (const provider of PREFERRED_PROVIDERS) {
        const model = getBuiltinModel(provider, id);
        if (model && Number.isFinite(model.contextWindow) && model.contextWindow > 0)
            return model;
    }
    const maps = modelCatalog();
    return maps.exact.get(id) ?? maps.lower.get(id.toLowerCase());
}

/**
 * Casleo may override limits; otherwise use Pi's model values.
 * Unknown models fall back to conservative defaults required by registerProvider.
 */
export function resolveRegisteredLimits(modelId, overrides = {}) {
    const fromPi = findPiModel(modelId);
    const contextWindow = overrides.contextWindow ?? fromPi?.contextWindow ?? FALLBACK_CONTEXT_WINDOW;
    const maxTokens = Math.min(overrides.maxTokens ?? fromPi?.maxTokens ?? FALLBACK_MAX_TOKENS, contextWindow);
    return { contextWindow, maxTokens };
}
