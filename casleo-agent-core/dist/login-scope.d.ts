import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { type SupportedProviderId } from "./providers.js";
export declare const LOGIN_PROVIDER_CHOICES: ReadonlyArray<{
    providerId: SupportedProviderId;
    label: string;
}>;
export type CasleoLoginRoute = {
    action: "continue";
    text: string;
} | {
    action: "select";
    text: "/login";
} | {
    action: "provider";
    providerId: SupportedProviderId;
    text: string;
} | {
    action: "reject";
};
export declare function routeCasleoLogin(text: string): CasleoLoginRoute;
export declare function scopeLoginSuggestions(text: string, items: AutocompleteItem[]): AutocompleteItem[];
