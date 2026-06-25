# Phoenix Sprint 4

Phoenix Sprint 4 introduces the Model Router AI policy.

## Goal

CODEGA AI should classify a prompt before model selection and prefer the fastest useful local model.

## Routing buckets

- `chat`: very short conversation and acknowledgement prompts.
- `short_fact`: short explanation prompts such as `PHP nedir? Tek cumle.`.
- `code`: code, API, SQL, PHP, Laravel, debugging, GitHub, release and deployment requests.
- `analysis`: long planning, architecture, comparison, strategy and deep analysis prompts.
- `balanced`: default daily requests.

## Acceptance checklist

- [ ] Short factual prompts prefer `qwen3.5:0.8b`, `qwen2.5:1.5b`, then `qwen3.5:2b`.
- [ ] Code prompts prefer coder models before general chat models.
- [ ] Long analysis prompts prefer balanced/strong models.
- [ ] Router policy is covered by `npm run check`.
- [ ] Release notes are prepared for `v4.5.30`.

## Notes

This sprint adds the policy and release gate foundation. Full runtime integration can be deepened in the next sprint if live testing shows model selection still needs stronger enforcement inside `model-manager`.
