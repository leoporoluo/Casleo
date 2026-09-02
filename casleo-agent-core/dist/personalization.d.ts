export declare const PERSONALIZATION_TONE_IDS: readonly ["default", "professional", "friendly", "candid", "quirky", "efficient", "cynical", "inspiring"];
export type PersonalizationTone = (typeof PERSONALIZATION_TONE_IDS)[number];
export interface PersonalizationPreferences {
    tone: PersonalizationTone;
    customInstructions: string;
}
export declare function loadPersonalizationPrompt(file: string | undefined): Promise<string>;
export declare function buildPersonalizationPrompt(preferences: PersonalizationPreferences): string;
export declare function composePersonalizedSystemPrompt(baseSystemPrompt: string, engineeringPrompt: string, personalizationPrompt: string): string;
