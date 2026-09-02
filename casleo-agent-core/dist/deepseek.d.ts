interface PayloadOptions {
    webSearch: boolean;
}
/**
 * Keep Pi's Responses API implementation while shaping the payload to the
 * subset DeepSeek V4 Flash actually supports.
 */
export declare function optimizeDeepSeekResponsesPayload(payload: unknown, options: PayloadOptions): unknown;
export {};
