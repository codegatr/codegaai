# Phoenix Auto Provisioning Engine

Phoenix Auto Provisioning Engine makes CODEGA AI usable without terminal work.

## Goal

The user should never need to know these commands:

```bash
ollama serve
ollama pull qwen2.5-coder:3b
ollama list
```

Phoenix must detect, start, prepare, resume and report model readiness automatically.

## User Experience

```text
User asks: PHP ile login sistemi yaz.

Phoenix:
- Detects intent: code
- Required model: qwen2.5-coder:3b
- Checks Ollama service
- Starts Ollama if stopped
- Checks installed models
- Pulls missing model in background
- Shows progress in UI
- Continues the queued request after model is ready
```

## Core Models

| Intent | Required model | Fallback |
|---|---|---|
| short_fact/chat | qwen3.5:0.8b | qwen3.5:2b |
| code | qwen2.5-coder:3b | qwen2.5-coder:7b |
| analysis | qwen3.5:4b | qwen3.5:9b |

## Runtime States

- `ollama_missing`
- `ollama_starting`
- `ollama_ready`
- `model_missing`
- `model_downloading`
- `model_ready`
- `request_queued`
- `request_resumed`
- `failed_recoverable`
- `failed_terminal`

## Safety Rules

1. Do not install heavy models automatically as first option.
2. Code tasks must prefer `qwen2.5-coder:3b`, never `qwen3.5:9b` first.
3. Short fact tasks must not trigger model installation if deterministic answer exists.
4. Pull progress must be visible in UI.
5. If Ollama is not installed, show one-click install guidance.
6. If service cannot be started, explain clearly and keep the app usable.

## Implementation Files

- `src/main/phoenix/provisioning/model-provisioner.js`
- `src/main/phoenix/provisioning/ollama-service.js`
- `src/main/phoenix/provisioning/provisioning-policy.js`

## Next Integration

`model-manager.js` will call Phoenix Provisioning before model generation:

```js
const readiness = await ensureModelReadyForIntent(intent);
if (!readiness.ready) return readiness.userMessage;
```
