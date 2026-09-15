# Casleo development guide

This guide covers local development, validation, patch maintenance, and Windows packaging. For the runtime design, see [Architecture](architecture.md).

## Prerequisites

- Node.js 24 or later
- npm
- Windows x64 for packaged installers; development runs anywhere Electron supports

Casleo currently pins `@deepseek-ai/dsh@0.1.5-rc.2`. Windows packages bundle a target-native Node.js runtime for Harness, which is independent of the Node.js version used to run development commands.

## Local setup

```bash
git clone https://github.com/leoporoluo/Casleo.git
cd Casleo
npm ci
npm run dev
```

`npm ci` runs the repository's `postinstall` hook. It reapplies the tracked `patch-package` patches, installs Casleo brand assets into the pinned Harness frontend, and installs Electron.

Development builds use the separate application name `Casleo Dev` and the separate user-data directory `casleo-dev`, so they do not reuse production Casleo data. Multiple development worktrees still share that development profile by default; avoid running them at the same time when testing profile, plugin, migration, or recovery changes.

## Validation

Run the core checks before submitting a change:

```bash
npm test
npm run typecheck
npm run build
```

Static checks are not a substitute for runtime verification. Changes that affect startup, profiles, plugins, native dialogs, or packaging should also be exercised through the corresponding real application flow.

## Project map

```text
src/main/                 Electron main process and application orchestration
src/main/runtime/         Harness process lifecycle and diagnostics
src/main/state/           Profile consistency, repair, recovery, and Safe Mode
src/preload/              Narrow renderer-to-main IPC and desktop UI seams
src/shared/               Shared contracts and desktop menu definitions
packages/                 Bundled desktop support packages
patches/                  Reproducible patches for the pinned Harness packages
build/                    Packaged HTML, icons, and Harness entry files
scripts/                  Build, icon, and target verification tools
test/                     Unit and source-contract regression coverage
.github/workflows/        Windows installer build workflow
```

## Maintaining upstream patches

The desktop product intentionally reuses the upstream Harness UI. Desktop-specific provider onboarding, preset transfer, model selection, workspace, branding, and layout changes are captured under `patches/` rather than stored as untracked edits in `node_modules`.

When upgrading Harness:

1. Install the intended upstream version.
2. Verify the current Settings, Credentials, Provider Directory, workspace, and preset contracts.
3. Reapply or rewrite each desktop customization.
4. Regenerate the relevant `patch-package` patches.
5. Run the full automated suite.
6. Start the real app and exercise every affected user flow.

## Packaging

```bash
# Windows x64 NSIS installer, on a Windows x64 machine or runner
npm run package:win
```

Do not invoke `electron-builder --win` from macOS or Linux for a distributable Windows package. The target verification scripts intentionally reject host/target mismatches.

Before handing off a Windows installer, verify that `resources/app/node_modules/node/bin/node.exe` exists in `win-unpacked` and require the packaged Windows Harness smoke test to pass.

## Contribution hygiene

- Never include real API keys in issues, logs, screenshots, fixtures, or test data.
- Preserve unrelated worktree changes.
- Keep temporary research, local reports, and internal working documents out of the repository.
- Update both localized README files when changing user-visible facts.
