import type { ImageContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export interface LocalImageInputResult {
    text: string;
    images: ImageContent[];
    paths: string[];
    errors: string[];
}
export interface LocalImageInputOptions {
    maxImageBytes?: number;
    maxImages?: number;
    imageNumberOffset?: number;
    emptyPrompt?: string;
}
export interface EditorImageAttachment {
    index: number;
    path: string;
}
export declare function registerLocalImageInput(pi: ExtensionAPI): void;
export declare function extractLocalImageInput(text: string, cwd: string, options?: LocalImageInputOptions): Promise<LocalImageInputResult>;
export declare function formatImageMarker(index: number): string;
export declare function expandEditorImageMarkers(text: string, attachments: readonly EditorImageAttachment[]): string;
export declare function detectImageMimeType(bytes: Uint8Array): string | undefined;
