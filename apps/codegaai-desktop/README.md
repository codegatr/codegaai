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
- Windows Ollama path discovery outside PATH
- Default model preparation through `ollama pull qwen2.5-coder:3b-instruct`
- Existing `qwen2.5:3b` fallback detection
- GitHub release based updater wiring through `electron-updater`
- NSIS Windows installer configuration
- Signed Windows release path through `WINDOWS_CSC_LINK` / `WINDOWS_CSC_KEY_PASSWORD`
- SHA-256 checksum generation for release verification

## Update Flow

1. App checks for updates silently.
2. Renderer receives update state through `updates:status`.
3. User can download the update.
4. Once downloaded, the app calls `quitAndInstall(false, true)` to close and install.

Updater signature verification is enabled by default. Unsigned updates are
blocked unless `CODEGA_ALLOW_UNSIGNED_UPDATES=1` is set for emergency
diagnostics. Public releases should be signed to reduce Malwarebytes and
SmartScreen reputation warnings.

## AI Runtime

Milestone 1 expects Ollama to be installed for real local generation. If Ollama is missing, CODEGA AI remains usable in instant/setup mode and explains what is needed instead of timing out.
