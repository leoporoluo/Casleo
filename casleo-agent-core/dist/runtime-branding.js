import path from "node:path";
import { hasTrustRequiringProjectResources, InteractiveMode, } from "@earendil-works/pi-coding-agent";
import { Spacer, Text } from "@earendil-works/pi-tui";
const PATCH_MARKER = Symbol.for("casleo.runtime-branding");
/** Keep implementation-library names out of the end-user Casleo Runtime interface. */
export function sanitizeCasleoRuntimeText(text) {
    return text
        .replace(/Claude Code[-\s]?style\b/giu, "Casleo-style")
        .replace(/\bClaude Code\b/giu, "Casleo")
        .replace(/\.pi\b/giu, ".casleo")
        .replace(/\bpi\b/giu, "Casleo Runtime")
        .replace(/π/gu, "Casleo Runtime");
}
export function installCasleoRuntimeBranding() {
    const prototype = InteractiveMode.prototype;
    if (prototype[PATCH_MARKER])
        return;
    prototype[PATCH_MARKER] = true;
    prototype.updateTerminalTitle = function () {
        const cwd = path.basename(this.sessionManager.getCwd());
        const session = this.sessionManager.getSessionName();
        this.ui.terminal.setTitle(session ? `Casleo Runtime — ${session} — ${cwd}` : `Casleo Runtime — ${cwd}`);
    };
    prototype.renderProjectTrustWarningIfNeeded = function () {
        const cwd = this.sessionManager.getCwd();
        if (this.settingsManager.isProjectTrusted() || !hasTrustRequiringProjectResources(cwd)) {
            return;
        }
        if (this.chatContainer.children.length > 0) {
            this.chatContainer.addChild(new Spacer(1));
        }
        this.chatContainer.addChild(new Text("This project is not trusted. Project-local Casleo Runtime settings, packages, and extensions are disabled. Use /trust to save a decision, then restart Casleo Runtime.", 1, 0));
    };
    for (const method of ["showStatus", "showWarning", "showError"]) {
        const original = prototype[method];
        prototype[method] = function (message) {
            original.call(this, sanitizeCasleoRuntimeText(message));
        };
    }
}
//# sourceMappingURL=runtime-branding.js.map