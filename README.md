# Casleo

Casleo is a local-first desktop app for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It starts the Harness runtime on loopback, keeps profiles, plugins, workspaces, model settings, and sessions outside the application directory, and opens the full Harness interface as soon as the local runtime is ready.

## Features

- Starts and stops Harness without a separate CLI or browser tab
- Uses the native system directory picker to add and manage project workspaces
- Supports official DeepSeek models and mainstream third-party model providers
- Imports and exports complete custom Agent presets as portable `.dshpreset` packages
- Preserves profiles, plugins, workspaces, sessions, and model settings across app upgrades
- Detects startup and frontend plugin failures, keeps diagnostics in `harness.log`, and offers guided recovery actions
- Provides a non-destructive Safe Mode that temporarily blocks third-party plugins
- Adapts native menus, titlebar behavior, window focus, theme, and application branding for macOS and Windows
- Ships a Casleo-branded app icon, collapsed-rail mark, and plugin-market glyph

## Download

Windows x64 installers are built by the [installer workflow](.github/workflows/desktop-installer.yml) and attached to tagged [releases](https://github.com/leoporoluo/Casleo/releases). The installer is unsigned, so Windows SmartScreen may warn on first run.

You can also build the installer locally:

```bash
npm ci
npm run package:win
```

## Requirements

- Windows x64 (packaged installers) or macOS (development)
- Node.js 24+ for development
- A DeepSeek API key, or credentials for a third-party provider you configure in Settings

## Development

```bash
git clone https://github.com/leoporoluo/Casleo.git
cd Casleo
npm ci
npm run dev
```

Run the core checks before submitting a change:

```bash
npm test
npm run typecheck
npm run build
```

See the [development guide](docs/development.md) for patch maintenance and packaging, and the [architecture](docs/architecture.md) for the runtime design. The preset package format is documented in [preset-packages.md](docs/preset-packages.md).

## Project layout

```text
src/main/       Electron main process and application orchestration
src/preload/    Sandboxed renderer seams and desktop UI additions
src/shared/     Shared contracts and desktop menu definitions
packages/       Bundled desktop support packages (client UI, market installer, presets)
patches/        Reproducible patch-package patches for the pinned Harness packages
build/          Packaged HTML surfaces, icons, and Harness entry files
test/           Unit and source-contract regression coverage
```

## License

Casleo is MIT licensed. It is derived from [DSH Desktop](https://github.com/dataelement/dsh-desktop) and packages DeepSeek Harness and its dependencies, which remain subject to their respective upstream licenses and trademark policies.
