import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
const PATCH_MARKER = Symbol.for("tether.markdown-code-blocks");
const THEME_MARKER = Symbol.for("tether.markdown-theme");
/** Remove Pi's literal fence rows while retaining parsing and syntax highlighting. */
export function codexStyleMarkdownTheme(theme) {
    if (theme[THEME_MARKER])
        return theme;
    return {
        ...theme,
        [THEME_MARKER]: true,
        codeBlockBorder: () => "",
        codeBlockIndent: "  ",
    };
}
export function installPiMarkdownCodeBlocks() {
    const prototype = AssistantMessageComponent.prototype;
    if (prototype[PATCH_MARKER])
        return;
    prototype[PATCH_MARKER] = true;
    const originalUpdateContent = prototype.updateContent;
    prototype.updateContent = function (message) {
        const component = this;
        component.markdownTheme = codexStyleMarkdownTheme(component.markdownTheme);
        originalUpdateContent.call(this, message);
    };
}
//# sourceMappingURL=pi-markdown.js.map