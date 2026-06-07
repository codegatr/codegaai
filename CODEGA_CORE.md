# CODEGA AI Core

CODEGA AI is a local-first, memory-aware, tool-using AI agent platform for CODEGA's software, hosting, automation, and AI product work.

## Mission

Build an autonomous digital staff system that can:

- answer with context and memory,
- use tools safely,
- inspect and improve code,
- learn from trusted sources,
- coordinate multiple models and specialists,
- package and release desktop software,
- protect user data and secrets,
- grow through a privacy-preserving federation network.

## Product Principles

- Local-first: local Qwen/Ollama and offline workflows remain usable.
- Multi-model: route local and cloud providers by task, latency, cost, and trust.
- Memory-aware: durable facts, project brain, RAG, and error memory improve future answers.
- Tool-capable: web, code, GitHub, files, sandbox, OCR, image, audio, and system tools are first-class.
- Audited autonomy: coding uses scoped files, branch isolation, tests, draft PRs, and human review.
- Privacy-first federation: never share raw chats, files, tokens, local paths, or full node identifiers.

## Active Architecture

- Desktop app: `apps/codegaai-desktop`
- Electron main process: `apps/codegaai-desktop/src/main`
- Renderer UI: `apps/codegaai-desktop/src/renderer`
- Agent modules: `apps/codegaai-desktop/src/main/agent`
- Cognitive kernel: `apps/codegaai-desktop/src/main/cognitive`
- Python/API layer: `codegaai`
- Federation coordinator: `deploy/federation-php`
- Tests: desktop scripts/tests and root `tests`

## Core Capabilities

- Planner, executor, verifier, and specialist routing.
- Local Ollama/Qwen model management and update checks.
- OpenAI, Claude, Gemini, and MCP configuration.
- RAG, memory, learning store, reflection, error memory, and improvement drafts.
- Reasoning guards, deterministic verification, and final-answer sanitation.
- GitHub autonomous development with branch, file scope, draft PR, and CI gates.
- Windows and macOS release workflows.
- Federation/share endpoints and DirectAdmin-compatible PHP coordination.

## Strategic Roadmap

1. Enforce agent governance through repository rules and skills.
2. Make model routing adaptive and specialist-aware.
3. Expand per-project memory, repository facts, fixes, and release history.
4. Improve autonomous coding with indexing, scoped patches, tests, and audit trails.
5. Strengthen federation quality scoring, moderation, and opt-in learning.
6. Add deployment intelligence with backup, rollback, and health checks.

