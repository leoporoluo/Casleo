const LOCAL_EXIT_INPUTS = new Set(["quit", "exit", "退出"]);
export function registerNaturalExit(pi) {
    pi.on("input", async (event, ctx) => {
        if (event.source !== "interactive" ||
            (event.images?.length ?? 0) > 0 ||
            !isNaturalExitInput(event.text)) {
            return { action: "continue" };
        }
        if (!ctx.isIdle())
            ctx.abort();
        ctx.shutdown();
        return { action: "handled" };
    });
}
export function isNaturalExitInput(text) {
    return LOCAL_EXIT_INPUTS.has(text.trim().toLocaleLowerCase("en-US"));
}
//# sourceMappingURL=exit.js.map