import { LoginDialogComponent } from "@earendil-works/pi-coding-agent";
const PATCH_MARKER = Symbol.for("casleo.login-secret-mask");
const MASK = "•";
export function installPiLoginSecretMask() {
    const prototype = LoginDialogComponent.prototype;
    if (prototype[PATCH_MARKER])
        return;
    prototype[PATCH_MARKER] = true;
    const originalShowPrompt = prototype.showPrompt;
    const originalReplace = prototype.replaceInputWithSubmittedText;
    prototype.showPrompt = function (message, placeholder) {
        const dialog = this;
        dialog.casleoSecretPrompt = /api[\s_-]*key|密钥/i.test(message);
        if (dialog.casleoSecretPrompt)
            maskRuntimeInput(dialog.input);
        return originalShowPrompt.call(this, message, placeholder);
    };
    prototype.replaceInputWithSubmittedText = function (value) {
        const dialog = this;
        const displayValue = dialog.casleoSecretPrompt ? MASK.repeat(Math.min(12, Math.max(8, value.length))) : value;
        originalReplace.call(this, displayValue);
        dialog.casleoSecretPrompt = false;
    };
}
function maskRuntimeInput(input) {
    const runtime = input;
    if (runtime.casleoMaskInstalled)
        return;
    runtime.casleoMaskInstalled = true;
    const originalRender = input.render;
    input.render = function (width) {
        const value = input.value;
        const cursor = input.cursor;
        input.value = MASK.repeat(value.length);
        input.cursor = Math.min(cursor, input.value.length);
        try {
            return originalRender.call(input, width);
        }
        finally {
            input.value = value;
            input.cursor = cursor;
        }
    };
}
//# sourceMappingURL=pi-login-mask.js.map