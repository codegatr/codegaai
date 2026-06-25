# Phoenix Sprint 2

Phoenix Sprint 2 focuses on local model resilience.

## Goal

When Ollama or the selected local model becomes slow, CODEGA AI must not appear stuck on `Dusunuyorum...`.

## Scope

- Prefer a light fallback order before heavy local models.
- Use a shorter timeout for fallback attempts after the first local model fails.
- Emit clear model-router logs when switching models.
- Return a clear local-engine recovery message when every local fallback fails.
- Prepare release candidate `v4.5.28`.

## Acceptance checklist

- [ ] `npm run check` passes from `apps/codegaai-desktop`.
- [ ] `PHP nedir? Tek cumle.` returns without indefinite waiting.
- [ ] When `qwen3.5:4b` times out, logs show fallback attempts such as `fallback_attempt`.
- [ ] If all local models fail, the user sees a clear recovery message, not an empty answer.
- [ ] Release notes are prepared for `v4.5.28`.
