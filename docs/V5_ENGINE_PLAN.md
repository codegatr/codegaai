# CODEGA AI v5 Engine Migration Plan

This document tracks the migration from the legacy `model-manager.js` core to the modular v5 AI engine.

## Sprint 5A

Status: started.

Added modules:

- `src/main/ai/engine.js`
- `src/main/ai/router/prompt-router.js`
- `src/main/ai/router/fallback.js`
- `src/main/ai/runtime/executor.js`

## Design goals

- Keep the current app stable while introducing the new engine behind a safe facade.
- Classify prompts before model selection.
- Build fallback chains by prompt intent.
- Execute a model chain instead of waiting on one heavy model.
- Preserve Sprint 3 output firewall.

## Next steps

1. Wire `engine.planExecution()` into `model-manager.js` for logging only.
2. Wire `engine.runPlanned()` into local Ollama generation for selected prompt classes.
3. Add model health scoring and temporary blacklist.
4. Move history/context handling into the v5 engine layer.
5. Release stable v5 after live tests pass.
