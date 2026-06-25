# Phoenix Sprint 3

Phoenix Sprint 3 focuses on clean user-facing output and context safety.

## Goal

CODEGA AI must show only the final user-facing answer. Internal reasoning labels such as `Anlama`, `Islem`, `Dogrulama`, `Yorum`, `Reasoning`, `Thinking`, and `Verification` must never be displayed to the user.

## Scope

- Strip `Final Answer:` labels before display.
- Strip internal reasoning sections before display.
- Detect test-result placeholder messages and answer with a diagnostic acknowledgement instead of treating them as a normal user prompt.
- Improve final-answer repair instructions so the model rewrites only the user-facing answer.
- Keep multi-task output readable while removing internal labels.

## Acceptance checklist

- [ ] `PHP nedir? Tek cumle.` returns one clean sentence without `Final Answer:`.
- [ ] `Yapay zeka nedir? Kisa acikla.` returns clean user-facing text only.
- [ ] `Test 1: geldi / gelmedi - kac saniye` is recognized as a test report template.
- [ ] Internal labels are removed from normal and multi-task responses.
- [ ] No reasoning chain is visible in the chat bubble.
