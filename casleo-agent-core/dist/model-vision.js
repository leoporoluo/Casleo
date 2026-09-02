/** Heuristic + known IDs: whether a chat model can take image parts natively. */
export function modelSupportsVision(modelId) {
    const id = modelId.trim().toLowerCase();
    if (!id)
        return false;
    // DeepSeek: only the explicit vision experimental model.
    if (/deepseek/.test(id))
        return /vision/.test(id);
    if (/(?:^|[-_/.])(vision|vl|4v)(?:$|[-_/.])/.test(id))
        return true;
    if (/gpt-4o|gpt-4\.1|gpt-5|chatgpt-4o|o[1-9].*vision|\bomni\b/.test(id))
        return true;
    if (/claude-3|claude-4|claude-sonnet|claude-opus|claude-haiku/.test(id))
        return true;
    if (/gemini|qwen-vl|qwen2\.5-vl|glm-4v|llava|pixtral|mistral-small.*vision/.test(id))
        return true;
    return false;
}
//# sourceMappingURL=model-vision.js.map