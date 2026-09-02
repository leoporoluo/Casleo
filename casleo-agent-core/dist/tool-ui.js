import { Text } from "@earendil-works/pi-tui";
const COLLAPSED_ERROR_LINES = 12;
export function renderToolCall(label, detail, theme, context) {
    const bulletColor = context.isError ? "error" : context.isPartial ? "muted" : "success";
    const normalizedDetail = detail ? oneLine(detail) : "";
    return new Text(`${theme.fg(bulletColor, "•")} ${theme.fg("toolTitle", theme.bold(label))}${normalizedDetail ? ` ${theme.fg("muted", normalizedDetail)}` : ""}`, 0, 0);
}
export function renderCollapsibleToolResult(result, options, theme, context, config = {}) {
    const output = toolResultText(result).trimEnd();
    if (!output)
        return new Text("", 0, 0);
    const error = context.isError || config.forceError === true;
    if (options.expanded || error) {
        const lines = output.split("\n");
        const visibleLines = options.expanded ? lines : lines.slice(0, COLLAPSED_ERROR_LINES);
        const hidden = lines.length - visibleLines.length;
        const rendered = visibleLines
            .map((line, index) => theme.fg(error ? "error" : "toolOutput", `${index === 0 ? "  └ " : "    "}${line}`))
            .join("\n");
        return new Text(hidden > 0
            ? `${rendered}\n${theme.fg("muted", `    … ${hidden} more lines · Ctrl+O to expand`)}`
            : rendered, 0, 0);
    }
    if (config.collapsedSummary === false)
        return new Text("", 0, 0);
    const lineCount = output.split("\n").length;
    const summary = config.collapsedSummary ?? `${lineCount} output ${lineCount === 1 ? "line" : "lines"}`;
    return new Text(theme.fg("dim", `  └ ${summary} · Ctrl+O to expand`), 0, 0);
}
export function toolResultText(result) {
    return result.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n");
}
export function oneLine(value, limit = 120) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= limit)
        return normalized;
    return `${normalized.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}
//# sourceMappingURL=tool-ui.js.map