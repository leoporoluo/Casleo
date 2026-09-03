import fs from "node:fs/promises";
import path from "node:path";
const CURRENT_UI_DEFAULTS_VERSION = 1;
const ADAPTIVE_THEME = "light/dark";
/** Apply Casleo Runtime's startup surface and native blinking-cursor defaults without replacing preferences. */
export async function ensureCasleoUiDefaults(agentDirectory) {
    const settingsPath = path.join(agentDirectory, "settings.json");
    let settings = {};
    try {
        settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    }
    catch (error) {
        if (error.code !== "ENOENT")
            return;
    }
    let changed = false;
    if ((settings.casleoUiDefaultsVersion ?? 0) < CURRENT_UI_DEFAULTS_VERSION) {
        // Older Pi versions persisted the theme detected at first launch. Migrate
        // built-in light/dark choices once so the UI follows the terminal again;
        // custom themes and later explicit choices remain untouched.
        if (settings.theme === undefined || settings.theme === "light" || settings.theme === "dark") {
            settings.theme = ADAPTIVE_THEME;
        }
        settings.casleoUiDefaultsVersion = CURRENT_UI_DEFAULTS_VERSION;
        changed = true;
    }
    if (settings.quietStartup === undefined) {
        settings.quietStartup = true;
        changed = true;
    }
    if (settings.showHardwareCursor === undefined) {
        settings.showHardwareCursor = true;
        changed = true;
    }
    if (!changed)
        return;
    await fs.mkdir(agentDirectory, { recursive: true, mode: 0o700 });
    const temporary = `${settingsPath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, settingsPath);
}
//# sourceMappingURL=ui-defaults.js.map