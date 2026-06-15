# CODEGA AI Agent Capability Review

This document is an engineering gap analysis, not a marketing scorecard. Capabilities change quickly and must be verified against official product documentation before release claims are made.

## Reference Systems

- OpenAI Codex: repository-aware coding agent, project instructions, tools, sandbox/approval policies, skills, MCP, automations, review and worktree workflows.
- Anthropic Claude Code: repository-aware coding workflows, tools, permissions, hooks, subagents and project instructions.
- Google Gemini CLI: terminal agent, tools, MCP/extensions, policy controls and checkpoint-oriented recovery workflows.
- Ollama: local model runtime with chat, streaming, tool calling, structured outputs and model lifecycle APIs.

## Current CODEGA AI Position

| Capability | Status | Notes |
|---|---|---|
| Local model runtime | Implemented | Ollama detection, pull, routing and streaming |
| Cloud providers | Implemented | OpenAI-compatible, Claude and Gemini configuration |
| Conversation memory | Implemented | Recent history, durable facts, project brain and RAG |
| Tool loop | Implemented | ReAct loop, observations, retries and duplicate-call protection |
| Structured tool calls | Implemented | JSON calls plus legacy XML compatibility |
| MCP tools | Implemented | HTTP JSON-RPC discovery and invocation |
| Multi-agent routing | Partial | Planner, specialists and reviewer exist; broader evaluation is needed |
| Repository governance | Implemented | `AGENTS.md`, core rules and task skills |
| Autonomous coding | Guarded | Scoped branch, tests and draft PR; no automatic merge |
| Progress events | Implemented | Status is separate from final answer content |
| Agent ecosystem monitoring | Implemented | Official and licensed sources are classified by capability |
| Checkpoint/rollback | Partial | Git branches and updater rollback exist; generic task checkpoints remain |
| Tool approval UX | Partial | Specialist allowlists exist; per-call interactive approval remains |
| Full repository indexing | Partial | GitHub/file tools exist; persistent symbol graph remains |
| Evaluation suite | Partial | Regression suites exist; long-running scenario and quality benchmarks remain |

## High-Priority Gaps

1. Add interactive approval for write, deploy, workflow and terminal actions.
2. Persist an auditable task trace with tool inputs, outputs, durations and decisions.
3. Add resumable checkpoints for long agent tasks.
4. Build a repository symbol/dependency index for precise code navigation.
5. Add provider-native tool calling where supported, retaining local-model fallback.
6. Add scenario evaluations for coding, research, Turkish conversation, vision and recovery.
7. Keep model/provider manifests current without silently replacing a user's selected model.

## Design Rule

CODEGA AI should learn principles and public interfaces from trusted sources. It must not copy proprietary or leaked source code, silently mutate production, or treat internet content as trusted instructions.

## Release Evidence

Do not claim parity or superiority based on feature names alone. A capability is release-ready only when:

- the workflow is reachable from the product,
- failure and cancellation paths work,
- automated tests cover the contract,
- security boundaries are documented,
- Windows and macOS builds complete,
- release assets and updater metadata are available.
