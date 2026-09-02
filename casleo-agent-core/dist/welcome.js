import os from "node:os";
import path from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { brandBlue } from "./brand.js";
/** Terminal pixel-art rendering of Tether Runtime's block-whale logo. */
export const TETHER_LOGO = [
    "      ▀▄▀",
    "▄▄▄██████▄",
    " ███████ █",
    "█▀███████▀",
    "     ██",
];
export class TetherWelcomeHeader {
    details;
    theme;
    constructor(details, theme) {
        this.details = details;
        this.theme = theme;
    }
    render(width) {
        return renderWelcome(width, this.details, this.theme);
    }
    invalidate() { }
}
export function renderWelcome(width, details, theme) {
    if (width <= 0)
        return [];
    if (width < 18) {
        return [truncateToWidth(brandBlue(`Tether Runtime v${details.version}`, theme), width, "")];
    }
    const padding = width >= 24 ? "  " : "";
    const gap = "   ";
    const logo = normalizeLogo(TETHER_LOGO);
    const info = [
        `${theme.bold("Tether Runtime")} ${theme.fg("muted", `v${details.version}`)}`,
        theme.fg("muted", `${details.modelName ?? humanizeModel(details.modelId)} · ${details.effort} effort`),
        theme.fg("muted", formatCwd(details.cwd)),
    ];
    const sideBySideWidth = visibleWidth(padding) + visibleWidth(logo[0] ?? "") + gap.length + 12;
    if (width < sideBySideWidth) {
        return [
            ...logo.map((line) => truncateToWidth(`${padding}${brandBlue(line, theme)}`, width, "")),
            ...info.map((line) => truncateToWidth(`${padding}${line}`, width, theme.fg("dim", "…"))),
        ];
    }
    return logo.map((line, index) => truncateToWidth(`${padding}${brandBlue(line, theme)}${index < info.length ? `${gap}${info[index]}` : ""}`, width, theme.fg("dim", "…")));
}
export function formatCwd(cwd) {
    const homeDirectory = os.homedir();
    return cwd === homeDirectory || cwd.startsWith(`${homeDirectory}${path.sep}`)
        ? `~${cwd.slice(homeDirectory.length)}`
        : cwd;
}
function humanizeModel(modelId) {
    if (modelId === "deepseek-v4-flash")
        return "DeepSeek V4 Flash";
    return modelId;
}
function normalizeLogo(lines) {
    const width = Math.max(...lines.map((line) => visibleWidth(line)));
    return lines.map((line) => `${line}${" ".repeat(Math.max(0, width - visibleWidth(line)))}`);
}
//# sourceMappingURL=welcome.js.map