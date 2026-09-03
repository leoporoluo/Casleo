<div align="center">

<img src="build/icon.png" width="96" alt="Casleo logo" />

# Casleo

**A local-first AI coding workbench built on the Pi ecosystem**

Let compatible models inspect, edit, and verify your repositories with explicit safety boundaries.

[English](README.md) · [简体中文](README.zh-CN.md) · [Download latest](https://github.com/leoporoluo/Casleo/releases/latest)

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-lightgrey)](https://github.com/leoporoluo/Casleo/releases/latest)

</div>

Casleo is an Electron desktop agent for real codebases. It brings model calls, workspace tools, terminal commands, permission prompts, session history, and diff review into one local workbench. The UI and session data stay on your machine; model requests go directly to the provider or local gateway you configure, without a Casleo relay.

## Why Casleo

- **Provider-neutral** — custom Base URL, model discovery, and reasoning-level controls for OpenAI-compatible gateways and local endpoints.
- **Visible and controllable** — inspect tool calls, command output, file changes, and context usage as work happens.
- **Permission boundaries** — Plan, Ask, Workspace, and Full Access modes.
- **Recoverable edits** — patch checkpoints let `/undo` restore the previous turn's file changes.
- **Local-first state** — settings, credentials, and sessions live under `~/.casleo`; no telemetry or Casleo-hosted model proxy.
- **Desktop workflow** — project threads, `@` file mentions, steer-while-generating, themes (paper / dark), diff previews, and Chinese/English UI.

## What Casleo uses from Pi

Casleo does not reimplement the agent foundations. The bundled `casleo-agent-core` package wraps the [Pi ecosystem](https://github.com/earendil-works/pi) and extends it:

| Pi package | Used by Casleo for |
| --- | --- |
| `@earendil-works/pi-agent-core` | Agent state, message streams, tool calls, and thinking-level types |
| `@earendil-works/pi-ai` | Model/provider contracts, message/image/usage types, and OpenAI API foundations |
| `@earendil-works/pi-coding-agent` | Coding-agent extensions, sessions/settings, project trust, and RPC client/worker |
| `@earendil-works/pi-tui` | Text components, themes, and terminal interaction used by the Runtime CLI |

Casleo adds:

- OpenAI-compatible gateway workflow
- Four permission modes and a Windows sandbox helper (install + enable)
- Workspace-scoped tools, managed commands, file patches, and durable checkpoints
- MCP, Hooks, Skills, planning, and subagent integration
- The `~/.casleo` local data conventions and Electron/React desktop workbench

Pi provides the runtime foundations; Casleo defines the product boundary, safety policy, and desktop experience. We are grateful to the Pi maintainers for the open-source foundation.

## Architecture

```text
React Renderer
  conversation, diff, settings, project and session UI
        │  contextBridge / Electron IPC
        ▼
Electron Main
  windows, workspace, credentials, agent process host
        │  JSON-RPC over stdio
        ▼
casleo-agent-core
  Casleo permissions, sandbox, tools, checkpoints, MCP, sessions
        │
        ▼
Pi ecosystem
  agent loop · model protocol · coding-agent extensions · RPC · TUI
```

The renderer has no direct Node.js access; desktop capabilities cross the typed IPC contract in `src/shared/types.ts`. The agent runs in a separate worker process. After a crash, an on-disk session can continue as a conversation, but Casleo does not silently replay unfinished commands.

## Models

The desktop app supports custom OpenAI-compatible Base URLs and provider-specific model settings.

## Permission modes

| Mode | Behaviour |
| --- | --- |
| `plan` | Read-only analysis and planning; diagnostic commands may run in a read-only sandbox |
| `ask` | Ask before writes, network access, or boundary escalation |
| `auto` | Run ordinary workspace operations automatically; ask on escalation |
| `full` | Disable workspace sandboxing for explicitly trusted projects |

Sandboxing is defense in depth, not a replacement for reviewing commands in an unfamiliar repository.

## Agent Skills

Skills are loaded by the Pi runtime (Casleo does not ship a separate loader). Standard locations:

| Scope | Path |
| --- | --- |
| Project (trusted) | `.agents/skills/<name>/SKILL.md`, `.pi/skills/<name>/SKILL.md` |
| User-global | `~/.casleo/skills/<name>/SKILL.md`, `~/.agents/skills/<name>/SKILL.md` |

Each skill is a directory with a `SKILL.md` file. Frontmatter must include `name` and `description` (Pi validates; invalid skills are skipped).

- Invoke with `/skill:name`; type `/` in the composer to see loaded skills
- List loaded skills under **Settings → Skills**
- Project skills require trusting the workspace; `@` mentions only scan project `.agents/skills` and `.pi/skills`

## Use Casleo

Download the Windows x64 installer from [GitHub Releases](https://github.com/leoporoluo/Casleo/releases/latest).

Then:

1. Open a project folder.
2. Configure an API key and compatible endpoint.
3. Describe a task, review tool activity and diffs, and use `/undo` when needed.

### Steer while generating

While a reply is generating, you can still type and press Enter. That text is steered into the current turn immediately (shown above the composer), not queued for later. Slash commands are not steered. Switching thread, starting a new chat, or changing project clears the on-screen steer list.

## Develop locally

Requires Node.js `>=22.19` and pnpm.

```bash
git clone https://github.com/leoporoluo/Casleo.git
cd Casleo
pnpm install
pnpm dev
```

Checks:

```bash
pnpm typecheck
pnpm test
pnpm build
```

The app uses the bundled `casleo-agent-core` workspace package.

## Acknowledgments

Casleo's agent runtime is built on the open-source [Pi ecosystem](https://github.com/earendil-works/pi) (`@earendil-works/pi-agent-core`, `pi-ai`, `pi-coding-agent`, `pi-tui`) and adds permission modes, sandboxing, checkpoints, MCP, Hooks, Skills, and local data storage. Pi dependencies retain their own licenses and copyright.

## Privacy

Casleo runs no telemetry or model relay service. Sessions, settings, and credentials stay local. To perform a task, prompts and relevant code context are sent to the model or gateway you choose. Review third-party privacy policies; sensitive projects can use a local endpoint.

## License

[MIT](LICENSE). Pi ecosystem dependencies retain their own licenses and copyright notices.

