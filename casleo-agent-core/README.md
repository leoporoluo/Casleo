# casleo-agent-core

Agent runtime behind the Casleo desktop workbench.

Use it for model calls, workspace tools, OS sandbox,
permissions, checkpoints, MCP, and session history—without shipping the Electron UI. Typical hosts
are desktop shells, IDE plugins, and automation scripts.

OpenAI-compatible gateways, local endpoints, and other configured providers plug in through the same client.

Requires **Node.js 22.19+**.

## Built on Pi

This package is not a from-scratch agent. It builds on the open-source
[Pi ecosystem](https://github.com/earendil-works/pi):

| Pi package | What it provides here |
| --- | --- |
| `@earendil-works/pi-agent-core` | Agent state, message streams, tool calls, thinking levels |
| `@earendil-works/pi-ai` | Model/provider contracts, message & usage types, OpenAI API foundations |
| `@earendil-works/pi-coding-agent` | Extension system, sessions & settings, project trust, RPC client/worker |
| `@earendil-works/pi-tui` | Text components, themes, and terminal interaction for the CLI surface |

On top of that, `casleo-agent-core` adds permission modes, OS
sandboxing, workspace-scoped tools, durable patch checkpoints, MCP/Hooks/Skills wiring, and the
`~/.casleo` local data layout.

## Install

This runtime is bundled as a workspace package with Casleo.

Auth is one of:

```bash
export OPENAI_API_KEY=...
# optional — OpenAI-compatible gateways and local endpoints
# export OPENAI_BASE_URL=https://your-endpoint.example/v1
```

```ts
import { saveProviderApiKey } from "casleo-agent-core";
await saveProviderApiKey("openai", "...");
```

## Quick start

```ts
import { createTetherRpcClient } from "casleo-agent-core/rpc";

const agent = createTetherRpcClient({ cwd: process.cwd() });

await agent.start();
agent.onEvent((event) => {
  if (event.type === "message_update") process.stdout.write(".");
});

await agent.prompt("Summarize the architecture of this repo in three bullets.");
await agent.stop();
```

By default the worker runs **permission `auto`** and **sandbox `workspace-write`**: it can edit
files in `cwd` without prompting. Sessions and stored keys live under `~/.casleo`.

`casleo-agent-core` exports auth/settings helpers for a GUI login flow;
`casleo-agent-core/rpc` is the bundled worker client.

## What you get

- Bundled RPC worker — no separate CLI install for the host process
- Workspace tools with macOS Seatbelt; Windows sandbox helpers where available and enabled
- Permission modes, patch checkpoints (`/undo`-style restore with conflict checks), Skills, MCP, hooks
- Credential helpers and settings APIs for building a GUI login flow
- Durable sessions under `~/.casleo` by default

## License

MIT. See [LICENSE](LICENSE). Pi ecosystem dependencies keep their own licenses and copyright.
