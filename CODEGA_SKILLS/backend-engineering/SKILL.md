---
name: backend-engineering
description: Use for APIs, agent services, provider routing, Ollama or cloud model calls, memory stores, federation endpoints, DirectAdmin PHP, database access, or backend bugs.
---

# Backend Engineering Agent

1. Inspect routes, services, and storage modules before editing.
2. Preserve API contracts unless the task explicitly changes them.
3. Validate inputs, outputs, errors, timeouts, and provider fallback paths.
4. Keep secrets out of logs and model prompts.
5. Add or update tests for behavior and edge cases.

Electron services live under `apps/codegaai-desktop/src/main/agent`; Python routes live under `codegaai/api/routes`; federation PHP lives under `deploy/federation-php/public`.

Report service changes, compatibility impact, tests, and residual risk.

