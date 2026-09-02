import path from "node:path";
import { hasTrustRequiringProjectResources, InteractiveMode, } from "@earendil-works/pi-coding-agent";
import { Spacer, Text } from "@earendil-works/pi-tui";
const PATCH_MARKER = Symbol.for("tether.runtime-branding");
/** Keep implementation-library names out of the end-user Tether Runtime interface. */
export function sanitizeTetherRuntimeText(text) {
    return text
        .replace(/Claude Code[-\s]?style\b/giu, "Tether-style")
        .replace(/\bClaude Code\b/giu, "Tether")
        .replace(/\.pi\b/giu, ".tether")
        .replace(/\bpi\b/giu, "Tether Runtime")
        .replace(/π/gu, "Tether Runtime");
}
export function installTetherRuntimeBranding() {
    const prototype = InteractiveMode.prototype;
    if (prototype[PATCH_MARKER])
        return;
    prototype[PATCH_MARKER] = true;
    prototype.updateTerminalTitle = function () {
        const cwd = path.basename(this.sessionManager.getCwd());
        const session = this.sessionManager.getSessionName();
        this.ui.terminal.setTitle(session ? `Tether Runtime — ${session} — ${cwd}` : `Tether Runtime — ${cwd}`);
    };
    prototype.renderProjectTrustWarningIfNeeded = function () {
        const cwd = this.sessionManager.getCwd();
        if (this.settingsManager.isProjectTrusted() || !hasTrustRequiringProjectResources(cwd)) {
            return;
        }
        if (this.chatContainer.children.length > 0) {
            this.chatContainer.addChild(new Spacer(1));
        }
        this.chatContainer.addChild(new Text("This project is not trusted. Project-local Tether Runtime settings, packages, and extensions are disabled. Use /trust to save a decision, then restart Tether Runtime.", 1, 0));
    };
    for (const method of ["showStatus", "showWarning", "showError"]) {
        const original = prototype[method];
        prototype[method] = function (message) {
            original.call(this, sanitizeTetherRuntimeText(message));
        };
    }
}
//# sourceMappingURL=runtime-branding.js.map