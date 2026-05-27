# CODEGA AI Desktop

This is the clean Windows-first CODEGA AI restart.

## Commands

```bash
npm install
npm run dev
npm run check
npm run dist:win
```

## What Works In Milestone 1

- Electron desktop shell
- Minimal CODEGA AI chat UI
- Conversation list and settings dialog
- Instant fallback answers for greetings and identity questions
- Ollama provider detection
- Ollama download handoff when the provider is missing
- Default model preparation through `ollama pull qwen2.5:3b-instruct`
- GitHub release based updater wiring through `electron-updater`
- NSIS Windows installer configuration

## Update Flow

1. App checks for updates silently.
2. Renderer receives update state through `updates:status`.
3. User can download the update.
4. Once downloaded, the app calls `quitAndInstall(false, true)` to close and install.

## AI Runtime

Milestone 1 expects Ollama to be installed for real local generation. If Ollama is missing, CODEGA AI remains usable in instant/setup mode and explains what is needed instead of timing out.
