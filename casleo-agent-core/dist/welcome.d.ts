import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component } from "@earendil-works/pi-tui";
export interface WelcomeDetails {
    cwd: string;
    modelId: string;
    modelName?: string;
    effort: string;
    version: string;
}
/** Terminal pixel-art rendering of Tether Runtime's block-whale logo. */
export declare const TETHER_LOGO: string[];
export declare class TetherWelcomeHeader implements Component {
    private readonly details;
    private readonly theme;
    constructor(details: WelcomeDetails, theme: Theme);
    render(width: number): string[];
    invalidate(): void;
}
export declare function renderWelcome(width: number, details: WelcomeDetails, theme: Theme): string[];
export declare function formatCwd(cwd: string): string;
