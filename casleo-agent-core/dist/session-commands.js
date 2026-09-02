export function registerSessionCommands(pi) {
    pi.registerCommand("clear", {
        description: "Clear context and start a new session (alias for /new)",
        handler: async (_args, ctx) => {
            // Replacing a session invalidates this command context immediately. Do not access
            // ctx (including ctx.ui) after the awaited call.
            await ctx.newSession();
        },
    });
}
//# sourceMappingURL=session-commands.js.map