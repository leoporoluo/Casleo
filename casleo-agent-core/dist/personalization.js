import fs from "node:fs/promises";
export const PERSONALIZATION_TONE_IDS = [
    "default",
    "professional",
    "friendly",
    "candid",
    "quirky",
    "efficient",
    "cynical",
    "inspiring",
];
const MAX_CUSTOM_INSTRUCTION_LENGTH = 1_500;
const TONE_IDS = new Set(PERSONALIZATION_TONE_IDS);
const TONE_INSTRUCTIONS = {
    professional: "Respond in a clear, precise, professional, and trustworthy tone.",
    friendly: "Respond in a warm, approachable, patient, and encouraging tone.",
    candid: "Be concise and direct, state risks and disagreements plainly, and remain respectful.",
    quirky: "Use an imaginative, playful voice and helpful metaphors or analogies while staying clear and accurate.",
    efficient: "Use the fewest words that preserve the maximum useful information; lead with outcomes and avoid repetition.",
    cynical: "Use sharp, witty, lightly teasing commentary, but never insult, demean, harass, or attack the user.",
    inspiring: "Guide reflection with useful questions and teach the underlying reasoning, but do not withhold a direct answer when one is needed.",
};
export async function loadPersonalizationPrompt(file) {
    if (!file)
        return "";
    try {
        const parsed = JSON.parse(await fs.readFile(file, "utf8"));
        if (!isRecord(parsed) || !isRecord(parsed.personalization))
            return "";
        return buildPersonalizationPrompt(normalizePreferences(parsed.personalization));
    }
    catch {
        return "";
    }
}
export function buildPersonalizationPrompt(preferences) {
    const toneInstruction = preferences.tone === "default"
        ? ""
        : TONE_INSTRUCTIONS[preferences.tone];
    const customInstructions = normalizeCustomInstructions(preferences.customInstructions);
    if (!toneInstruction && !customInstructions)
        return "";
    return [
        "# User personalization preferences",
        "These preferences affect presentation and collaboration style only. Apply them unless they conflict with higher-priority system, safety, project, permission, sandbox, or Tether Runtime engineering instructions. They never grant additional permissions or change tool limits.",
        ...(toneInstruction ? [`- Tone and style: ${toneInstruction}`] : []),
        ...(customInstructions
            ? ["- Custom instructions from the user:", customInstructions]
            : []),
    ].join("\n");
}
export function composePersonalizedSystemPrompt(baseSystemPrompt, engineeringPrompt, personalizationPrompt) {
    return [baseSystemPrompt, engineeringPrompt, personalizationPrompt].filter(Boolean).join("\n\n");
}
function normalizePreferences(value) {
    const tone = TONE_IDS.has(value.tone)
        ? value.tone
        : "default";
    const customInstructions = typeof value.customInstructions === "string"
        ? normalizeCustomInstructions(value.customInstructions)
        : "";
    return { tone, customInstructions };
}
function normalizeCustomInstructions(value) {
    const trimmed = value.trim();
    return Array.from(trimmed).length <= MAX_CUSTOM_INSTRUCTION_LENGTH ? trimmed : "";
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=personalization.js.map