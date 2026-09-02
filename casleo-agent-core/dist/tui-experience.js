import { stat } from "node:fs/promises";
import { CustomEditor, } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, truncateToWidth, visibleWidth, } from "@earendil-works/pi-tui";
import { getTetherAuthPath } from "./auth.js";
import { brandBlue } from "./brand.js";
import { expandEditorImageMarkers, extractLocalImageInput, formatImageMarker, } from "./image-input.js";
import { LOGIN_PROVIDER_CHOICES, routeTetherLogin, scopeLoginSuggestions, } from "./login-scope.js";
import { defaultModelForProvider } from "./providers.js";
import { TETHER_VERSION } from "./version.js";
import { TetherWelcomeHeader, formatCwd } from "./welcome.js";
export const EDITOR_PLACEHOLDER = "Ask Tether Runtime to change, explain, or test code";
export const HIDDEN_THINKING_LABEL = "Tether Runtime is thinking";
const BLINKING_BLOCK_CURSOR = "\x1b[1 q";
const DEFAULT_CURSOR_STYLE = "\x1b[0 q";
export function registerCodingTui(pi, options, getAccess) {
    let activeTui;
    let workingTimer;
    let workingStartedAt = 0;
    let loginAutocompleteInstalled = false;
    let providerLoginWatch;
    const updateModelPresentation = (ctx, model = ctx.model) => {
        if (ctx.mode !== "tui")
            return;
        const modelId = model?.id ?? options.modelId;
        const modelName = model?.name;
        ctx.ui.setHiddenThinkingLabel(formatThinkingLabel(modelName ?? modelId));
        ctx.ui.setHeader((_tui, theme) => new TetherWelcomeHeader({
            cwd: ctx.cwd,
            modelId,
            ...(modelName ? { modelName } : {}),
            effort: pi.getThinkingLevel(),
            version: TETHER_VERSION,
        }, theme));
    };
    const stopWorkingTimer = () => {
        if (workingTimer)
            clearInterval(workingTimer);
        workingTimer = undefined;
    };
    pi.on("agent_start", (_event, ctx) => {
        workingStartedAt = Date.now();
        stopWorkingTimer();
        const refresh = () => {
            const seconds = Math.max(0, Math.floor((Date.now() - workingStartedAt) / 1_000));
            ctx.ui.setWorkingMessage(`Working (${seconds}s · esc to interrupt)`);
            activeTui?.requestRender();
        };
        refresh();
        workingTimer = setInterval(refresh, 1_000);
    });
    pi.on("agent_end", (_event, ctx) => {
        stopWorkingTimer();
        ctx.ui.setWorkingMessage();
    });
    pi.on("model_select", (event, ctx) => updateModelPresentation(ctx, event.model));
    pi.on("thinking_level_select", (_event, ctx) => updateModelPresentation(ctx));
    pi.on("session_shutdown", () => {
        stopWorkingTimer();
        providerLoginWatch?.abort();
        providerLoginWatch = undefined;
        activeTui?.terminal.write(DEFAULT_CURSOR_STYLE);
        activeTui = undefined;
    });
    pi.on("session_start", async (_event, ctx) => {
        if (ctx.mode !== "tui")
            return;
        ctx.ui.setWorkingVisible(true);
        ctx.ui.setWorkingIndicator({
            frames: ["◦", "○", "●", "○"].map((frame) => brandBlue(frame, ctx.ui.theme)),
            intervalMs: 140,
        });
        ctx.ui.setFooter(() => new EmptyFooter());
        updateModelPresentation(ctx);
        if (!ctx.model || !ctx.modelRegistry.hasConfiguredAuth(ctx.model)) {
            ctx.ui.notify("No model provider is configured. Enter /login to choose a provider.", "info");
        }
        if (!loginAutocompleteInstalled) {
            loginAutocompleteInstalled = true;
            ctx.ui.addAutocompleteProvider((current) => providerAutocomplete(current));
        }
        class TetherEditor extends CustomEditor {
            tetherTui;
            imageAttachments = [];
            imagePasteQueue = Promise.resolve();
            nextImageIndex = 1;
            pendingImagePastes = 0;
            constructor(tui, theme, keybindings) {
                super(tui, theme, keybindings, { paddingX: 0 });
                this.tetherTui = tui;
                activeTui = tui;
                tui.terminal.write(BLINKING_BLOCK_CURSOR);
            }
            handleInput(data) {
                const pastedText = unwrapBracketedPaste(data);
                if (pastedText !== undefined) {
                    this.queuePastedText(pastedText, true);
                    return;
                }
                super.handleInput(data);
            }
            insertTextAtCursor(text) {
                this.queuePastedText(text, false);
            }
            expandImageAttachments(text) {
                return expandEditorImageMarkers(text, this.imageAttachments);
            }
            clearImageAttachments() {
                this.imageAttachments = [];
                this.nextImageIndex = 1;
            }
            queuePastedText(text, bracketed) {
                this.pendingImagePastes += 1;
                this.disableSubmit = true;
                this.imagePasteQueue = this.imagePasteQueue
                    .then(() => this.insertPastedText(text, bracketed))
                    .catch((error) => {
                    ctx.ui.notify(`Could not attach pasted image: ${error instanceof Error ? error.message : String(error)}`, "error");
                    this.insertPastedTextWithoutImages(text, bracketed);
                })
                    .finally(() => {
                    this.pendingImagePastes -= 1;
                    this.disableSubmit = this.pendingImagePastes > 0;
                    this.tetherTui.requestRender();
                });
            }
            async insertPastedText(text, bracketed) {
                const result = await extractLocalImageInput(text, ctx.cwd, {
                    imageNumberOffset: this.nextImageIndex - 1,
                    emptyPrompt: "",
                });
                if (result.errors.length > 0) {
                    ctx.ui.notify(result.errors.join("\n"), result.paths.length > 0 ? "warning" : "error");
                }
                if (result.paths.length === 0) {
                    this.insertPastedTextWithoutImages(text, bracketed);
                    return;
                }
                this.imageAttachments.push(...result.paths.map((imagePath, index) => ({
                    index: this.nextImageIndex + index,
                    path: imagePath,
                })));
                this.nextImageIndex += result.paths.length;
                this.insertPastedTextWithoutImages(result.text, bracketed);
            }
            insertPastedTextWithoutImages(text, bracketed) {
                if (bracketed) {
                    super.handleInput(`\x1b[200~${text}\x1b[201~`);
                }
                else {
                    super.insertTextAtCursor(text);
                }
            }
            render(width) {
                if (width <= 0)
                    return [];
                const sourceWidth = Math.max(1, width - 2);
                const lines = super.render(sourceWidth);
                if (lines.length < 3)
                    return lines;
                const theme = ctx.ui.theme;
                const access = getAccess();
                const model = ctx.model?.id ?? options.modelId;
                const effort = pi.getThinkingLevel();
                const autocompleteStart = findAutocompleteStart(lines);
                const bottomIndex = autocompleteStart - 1;
                if (bottomIndex < 2)
                    return lines;
                const hardwareCursor = this.tetherTui.getShowHardwareCursor();
                const content = lines
                    .slice(1, bottomIndex)
                    .map((line) => (hardwareCursor ? stripFakeCursorHighlight(line) : line))
                    .map((line) => highlightImageMarkers(line, this.imageAttachments, theme));
                if (this.getText().length === 0 && content.length > 0) {
                    content[0] = renderEditorPlaceholder(theme, hardwareCursor);
                }
                const panel = [
                    panelLine("", width, theme),
                    ...content.map((line, index) => panelLine(`${index === 0 ? `${brandBlue(">", theme)} ` : "  "}${line.trimEnd()}`, width, theme)),
                    panelLine("", width, theme),
                ];
                const autocomplete = lines
                    .slice(autocompleteStart)
                    .map((line) => padLine(`  ${line.trimEnd()}`, width));
                const status = renderMinimalStatus(width, {
                    model,
                    effort,
                    permission: access.permission,
                    sandbox: access.sandbox,
                    network: access.network,
                    cwd: ctx.cwd,
                    contextPercent: ctx.getContextUsage()?.percent ?? null,
                }, theme);
                return [...panel, ...autocomplete, status];
            }
        }
        let editor;
        ctx.ui.setEditorComponent((tui, theme, keybindings) => {
            editor = new TetherEditor(tui, theme, keybindings);
            return editor;
        });
        if (editor?.onSubmit) {
            const submit = editor.onSubmit;
            const submitProviderLogin = (providerId) => {
                providerLoginWatch?.abort();
                const loginWatch = new AbortController();
                providerLoginWatch = loginWatch;
                void (async () => {
                    try {
                        const previousAuthMtime = await getAuthFileMtime();
                        submit(`/login ${providerId}`);
                        const switched = await switchToProviderAfterLogin(pi, ctx, providerId, previousAuthMtime, loginWatch.signal);
                        if (switched) {
                            ctx.ui.notify(`Now using ${providerId}/${defaultModelForProvider(providerId)}.`, "info");
                        }
                    }
                    catch (error) {
                        if (!loginWatch.signal.aborted) {
                            ctx.ui.notify(`Provider login failed: ${error instanceof Error ? error.message : String(error)}`, "error");
                        }
                    }
                    finally {
                        if (providerLoginWatch === loginWatch)
                            providerLoginWatch = undefined;
                    }
                })();
            };
            editor.onSubmit = (text) => {
                const submittedText = editor?.expandImageAttachments(text) ?? text;
                editor?.clearImageAttachments();
                const route = routeTetherLogin(submittedText);
                if (route.action === "reject") {
                    editor?.setText("");
                    ctx.ui.notify("Unsupported provider. Enter /login to choose a supported provider.", "warning");
                    return;
                }
                if (route.action === "select") {
                    editor?.setText("");
                    void ctx.ui
                        .select("Select a model provider", LOGIN_PROVIDER_CHOICES.map((choice) => choice.label))
                        .then((selected) => {
                        const choice = LOGIN_PROVIDER_CHOICES.find((item) => item.label === selected);
                        if (!choice)
                            return;
                        submitProviderLogin(choice.providerId);
                    })
                        .catch((error) => {
                        ctx.ui.notify(`Provider selection failed: ${error instanceof Error ? error.message : String(error)}`, "error");
                    });
                    return;
                }
                if (route.action === "provider") {
                    submitProviderLogin(route.providerId);
                    return;
                }
                submit(route.text);
            };
        }
    });
}
function unwrapBracketedPaste(data) {
    const start = "\x1b[200~";
    const end = "\x1b[201~";
    if (!data.startsWith(start) || !data.endsWith(end))
        return undefined;
    return data.slice(start.length, -end.length);
}
export function highlightImageMarkers(line, attachments, theme) {
    let highlighted = line;
    for (const attachment of attachments) {
        const marker = formatImageMarker(attachment.index);
        highlighted = highlighted.replaceAll(marker, theme.fg("accent", marker));
    }
    return highlighted;
}
async function switchToProviderAfterLogin(pi, ctx, providerId, previousAuthMtime, signal) {
    const deadline = Date.now() + 10 * 60_000;
    let credentialUpdated = false;
    while (!signal.aborted && Date.now() < deadline) {
        const authMtime = await getAuthFileMtime();
        credentialUpdated =
            authMtime !== undefined &&
                (previousAuthMtime === undefined || authMtime !== previousAuthMtime);
        if (credentialUpdated) {
            const model = ctx.modelRegistry.find(providerId, defaultModelForProvider(providerId));
            if (model && (await pi.setModel(model)))
                return true;
        }
        await waitForLoginPoll(signal);
    }
    return false;
}
async function getAuthFileMtime() {
    try {
        return (await stat(getTetherAuthPath())).mtimeMs;
    }
    catch {
        return undefined;
    }
}
function waitForLoginPoll(signal) {
    return new Promise((resolve) => {
        if (signal.aborted) {
            resolve();
            return;
        }
        const finish = () => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        };
        const onAbort = () => {
            clearTimeout(timer);
            finish();
        };
        const timer = setTimeout(finish, 250);
        timer.unref();
        signal.addEventListener("abort", onAbort, { once: true });
    });
}
export function formatThinkingLabel(modelName) {
    const name = modelName?.trim();
    return name ? `${name} is thinking` : HIDDEN_THINKING_LABEL;
}
export function renderEditorPlaceholder(theme, hardwareCursor) {
    if (hardwareCursor) {
        return `${CURSOR_MARKER}${theme.fg("dim", EDITOR_PLACEHOLDER)}`;
    }
    return `${CURSOR_MARKER}${theme.inverse(EDITOR_PLACEHOLDER[0])}${theme.fg("dim", EDITOR_PLACEHOLDER.slice(1))}`;
}
export function stripFakeCursorHighlight(line) {
    const markerEnd = line.indexOf(CURSOR_MARKER) + CURSOR_MARKER.length;
    if (markerEnd < CURSOR_MARKER.length || !line.startsWith("\x1b[7m", markerEnd))
        return line;
    const characterStart = markerEnd + "\x1b[7m".length;
    const resetStart = line.indexOf("\x1b[0m", characterStart);
    if (resetStart === -1)
        return line;
    return `${line.slice(0, markerEnd)}${line.slice(characterStart, resetStart)}${line.slice(resetStart + "\x1b[0m".length)}`;
}
function providerAutocomplete(current) {
    return {
        ...(current.triggerCharacters ? { triggerCharacters: current.triggerCharacters } : {}),
        async getSuggestions(lines, cursorLine, cursorCol, options) {
            const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
            if (!suggestions)
                return null;
            const text = lines[cursorLine]?.slice(0, cursorCol) ?? "";
            return { ...suggestions, items: scopeLoginSuggestions(text, suggestions.items) };
        },
        applyCompletion: (lines, cursorLine, cursorCol, item, prefix) => current.applyCompletion(lines, cursorLine, cursorCol, item, prefix),
        ...(current.shouldTriggerFileCompletion
            ? {
                shouldTriggerFileCompletion: (lines, cursorLine, cursorCol) => current.shouldTriggerFileCompletion(lines, cursorLine, cursorCol),
            }
            : {}),
    };
}
export function minimalStatusParts(details) {
    const parts = [`${details.model}  ${details.effort}`];
    if (details.permission === "plan")
        parts.push("plan");
    if (details.permission !== "plan" && details.sandbox === "danger-full-access") {
        parts.push("danger full access");
    }
    else if (details.permission === "full") {
        parts.push("full permission");
    }
    if (details.network && details.sandbox !== "danger-full-access")
        parts.push("network");
    if (details.contextPercent !== null && details.contextPercent >= 70) {
        parts.push(`ctx ${details.contextPercent.toFixed(0)}%`);
    }
    parts.push(formatCwd(details.cwd));
    return parts;
}
export function renderMinimalStatus(width, details, theme) {
    if (width <= 0)
        return "";
    const parts = minimalStatusParts(details);
    const painted = parts.map((part, index) => {
        if (index === 0)
            return brandBlue(part, theme);
        if (index === parts.length - 1)
            return theme.fg("text", part);
        if (part === "danger full access" ||
            (part.startsWith("ctx ") && (details.contextPercent ?? 0) >= 90)) {
            return theme.fg("error", part);
        }
        if (part === "plan" || part === "full permission" || part.startsWith("ctx ")) {
            return theme.fg("warning", part);
        }
        return theme.fg("muted", part);
    });
    return truncateToWidth(`  ${painted.join(theme.fg("dim", " · "))}`, width, theme.fg("dim", "…"));
}
export function formatContext(ctx) {
    const usage = ctx.getContextUsage();
    const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
    if (!usage || usage.percent === null || !contextWindow)
        return "ctx ?";
    return `${usage.percent.toFixed(1)}%/${compactNumber(contextWindow)}`;
}
function compactNumber(value) {
    if (value >= 1_000_000)
        return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000)
        return `${Math.round(value / 1_000)}k`;
    return String(value);
}
function findAutocompleteStart(lines) {
    // The editor's final border is the last full-width horizontal line; autocomplete rows follow it.
    for (let index = lines.length - 1; index >= 1; index -= 1) {
        if (lines[index]?.includes("─"))
            return index + 1;
    }
    return lines.length;
}
function padLine(line, width) {
    const clipped = truncateToWidth(line, Math.max(0, width), "");
    return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
}
export function panelLine(line, width, theme) {
    const background = theme.getBgAnsi("userMessageBg");
    const padded = padLine(line, width).replaceAll("\x1b[0m", `\x1b[0m${background}`);
    return `${background}${padded}\x1b[49m`;
}
class EmptyFooter {
    render() {
        return [];
    }
    invalidate() { }
}
//# sourceMappingURL=tui-experience.js.map