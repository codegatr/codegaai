# Phoenix Sprint 1

Phoenix Sprint 1 is the first recovery-and-release hardening pass for CODEGA AI.

## Scope

- Stabilize the desktop app for users who see long `Dusunuyorum...` states.
- Keep local-first behavior intact while making slow local model calls fail faster and more clearly.
- Prepare a small release candidate that can be validated by GitHub Actions before publishing assets.

## Guardrails

- No secrets, tokens, `.env` values, or local user paths are committed.
- No production deployment is performed from this sprint.
- Release success is not claimed until CI and release assets are verified.
- Changes stay on the `phoenix/sprint-1` branch until review.

## Acceptance checklist

- [ ] Desktop scaffold check passes with `npm run check` from `apps/codegaai-desktop`.
- [ ] A quick prompt such as `2 + 2 kac eder? Sadece sonucu yaz.` returns immediately through the deterministic fast path.
- [ ] A normal chat prompt streams visible progress or a final answer; it must not stay indefinitely on `Dusunuyorum...`.
- [ ] Windows build workflow is triggered and the resulting artifact is reviewed.
- [ ] Release notes are prepared for `v4.5.27`.

## Release candidate notes

Target version: `4.5.27`

Primary focus:

1. Phoenix recovery baseline.
2. Model timeout hardening.
3. Release checklist documentation.
