# CODEGA AI Clean Start Architecture

## Goal

CODEGA AI is restarted as a Windows-first desktop AI app with a reliable installer, clear model readiness, and a real update flow. The old Python desktop stack remains in the repository for reference, but the new product starts in `apps/codegaai-desktop`.

## Product Contract

The first clean build must do five things well:

1. Open fast.
2. Show a calm chat home with conversation history and settings.
3. Answer basic identity and greeting turns immediately.
4. Detect and use a local AI provider without freezing the UI.
5. Build as a Windows `.exe` installer with an integrated update flow.

## Architecture

The app uses Electron for the first Windows installer milestone because it can produce NSIS installers on Windows runners and supports `electron-updater` for GitHub release based updates. The renderer stays deliberately simple: one chat surface, one model status strip, and one settings drawer.

The main process owns all privileged operations:

- update checks and installation,
- local model/provider detection,
- AI request execution,
- app data paths,
- conversation persistence.

The renderer communicates through a narrow preload API. It never shells out, touches updater internals, or writes arbitrary files directly.

## AI Provider Strategy

Milestone 1 uses a provider boundary instead of hardwiring one runtime:

- `instant`: deterministic local answers for greetings, identity, and setup guidance.
- `ollama`: uses an installed Ollama runtime when available.
- future providers: bundled llama.cpp sidecar, cloud connectors, image generation, voice.

This prevents the app from appearing broken while a heavy model is missing or still downloading.

## Update Strategy

The app checks for updates silently on startup and on an interval. If an update is available, the UI shows a clear prompt. When the user approves, the main process downloads the update and calls `quitAndInstall`, allowing the updater to close the running app and replace it.

## Build Strategy

`apps/codegaai-desktop` builds with `electron-builder`.

Windows output:

- NSIS installer: `CODEGA AI Setup <version>.exe`
- GitHub release metadata for `electron-updater`

The workflow is isolated from the old Python build so the new product can evolve without inheriting the old packaging failures.
