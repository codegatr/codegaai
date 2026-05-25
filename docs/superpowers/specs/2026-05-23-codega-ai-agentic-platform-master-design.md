# CODEGA AI Agentic Platform Master Design

## Goal

CODEGA AI must evolve from a feature-rich local assistant into a secure, memorable, team-ready agentic software platform: a desktop AI that understands whole codebases, chooses the right model for each job, works in isolated execution environments, and participates in GitHub workflows like a senior engineering teammate.

This design converts `CodegaAI_Yazilim_Ekibi_Talimatlari.pdf` into an implementation roadmap while respecting the current repository shape.

## Current State

Already present:

- Local FastAPI backend and web UI.
- Local model registry, llama.cpp engine, embedding service, RAG memory, and model routing concepts.
- Codebase upload and analysis endpoints.
- Basic Python sandbox endpoint.
- Developer tools for SAST, test generation, profiling, PR description, changelog, and blame analysis.
- Agent platform blueprint with specialists, provider chains, tool policy, and secret redaction.
- Windows and macOS GitHub Actions build workflows.

Gaps:

- Sandbox is Python-thread based, not OS/container isolated.
- Risk approval exists as policy metadata, not a reusable enforcement layer.
- Prompt injection filtering is not centralized.
- Codebase analysis does not support `.codegaaiignore`.
- Project code RAG is not indexed as reusable chunks with semantic search.
- AST dependency mapping is not a first-class module.
- Model routing is local-model focused and not a true provider multiplexer.
- Ollama support is not implemented as a provider.
- GitHub PR review automation is not available as an Action entrypoint.

## Product Principles

1. Safety before autonomy: no destructive or external side-effect action without explicit policy.
2. Local-first by default: private code and secrets stay local unless the selected provider and user policy allow cloud use.
3. Context is earned: send only relevant files, chunks, symbols, and dependency paths to models.
4. Hybrid intelligence: cheap local models handle simple and private work; cloud models handle complex design and deep reasoning when configured.
5. Team-ready output: every agent action should produce inspectable logs, review artifacts, and reproducible commands.

## Architecture

The platform is split into six focused subsystems.

```text
User / GitHub Event
  -> Agent Orchestrator
  -> Safety Gateway
  -> Context Engine
  -> Model Gateway
  -> Tool Runner / Sandbox
  -> Review, Patch, Report, or UI Output
```

### 1. Safety Gateway

Purpose: provide one central decision point for risky commands, writes, deletes, package installs, GitHub operations, and untrusted prompt content.

Modules:

- `codegaai/core/safety_gateway.py`
- `codegaai/core/prompt_guard.py`
- `codegaai/core/tool_policy.py`
- `codegaai/api/routes/safety.py`

Capabilities:

- Classify action risk as `safe`, `approval_required`, or `blocked`.
- Mask secrets before model calls and logs.
- Detect prompt injection instructions in external content.
- Produce human-readable approval requests for CLI/UI/API.
- Store approval decisions with timestamp, actor, action hash, and scope.

Initial enforcement:

- File delete, shell command, package install, GitHub push/release, database write, server restart.
- External content from PR bodies, issues, README files, web pages, uploaded docs, and comments.

### 2. Execution Sandbox

Purpose: run generated code and tests in an isolated environment instead of the host OS.

Modules:

- `codegaai/core/sandbox_runner.py`
- `codegaai/api/routes/sandbox.py` extension
- `installer/*` docs for Docker availability

Modes:

- `python_thread`: current fallback mode for systems without Docker.
- `docker_alpine`: default for shell and Python snippets when Docker is available.
- `docker_python`: Python image with mounted temp workspace for tests.

Rules:

- No host filesystem mount except an explicit temp workspace.
- Network disabled by default.
- CPU, memory, timeout, and output caps.
- Container image allowlist.
- Every run returns command, mode, exit code, duration, stdout, stderr, and security notes.

### 3. Context Engine

Purpose: understand source code at repository scale and feed models the smallest useful context.

Modules:

- `codegaai/core/codebase_ignore.py`
- `codegaai/core/code_indexer.py`
- `codegaai/core/code_chunks.py`
- `codegaai/core/ast_graph.py`
- `codegaai/core/code_search.py`
- `codegaai/api/routes/codebase.py` extension

Capabilities:

- `.codegaaiignore` support with `.gitignore`-style patterns.
- Built-in excludes: `.git`, `node_modules`, `vendor`, `.venv`, `dist`, `build`, binary files, large media.
- Chunk code by symbol when possible, fallback by line windows.
- AST extraction for Python and JavaScript/TypeScript first; PHP later through regex/light parser if no native parser is present.
- Dependency graph for imports, function definitions, class definitions, and call references.
- Semantic search over code chunks using existing `EmbeddingService` where available.
- Keyword fallback search when embedding model is unavailable.

API additions:

- `POST /api/codebase/index-local`
- `POST /api/codebase/search`
- `GET /api/codebase/graph`
- `POST /api/codebase/context-pack`

### 4. Model Gateway

Purpose: turn model routing from a local model selector into a provider multiplexer.

Modules:

- `codegaai/core/providers/base.py`
- `codegaai/core/providers/local_llamacpp.py`
- `codegaai/core/providers/ollama.py`
- `codegaai/core/providers/openai_provider.py`
- `codegaai/core/providers/anthropic_provider.py`
- `codegaai/core/providers/gemini_provider.py`
- `codegaai/core/model_gateway.py`
- `codegaai/core/model_router.py` refactor

Provider interface:

```python
class ModelProvider:
    id: str
    capabilities: set[str]
    privacy_level: str

    def is_configured(self) -> bool: ...
    def estimate_cost(self, request: ModelRequest) -> ModelCost: ...
    def generate(self, request: ModelRequest) -> ModelResponse: ...
    def stream(self, request: ModelRequest) -> Iterator[str]: ...
```

Routing signals:

- Task type: chat, code review, code edit, architecture, summarization, OCR, safety scan.
- Privacy: public, internal, secret-bearing.
- Complexity: simple, medium, deep.
- Context size.
- Latency preference.
- Provider availability.
- User override.

Default routing:

- Secret-bearing code: local llama.cpp or Ollama only unless user explicitly allows cloud.
- Simple code diagnostics: Ollama/local coder.
- Large architecture and PR review: GPT-5, GPT-4.1, Claude, or Gemini if configured.
- Offline mode: local provider chain only.

### 5. GitHub PR Reviewer

Purpose: make CODEGA AI participate in team workflows.

Files:

- `.github/workflows/codegaai-pr-review.yml`
- `codegaai/ci/pr_review.py`
- `codegaai/core/pr_reviewer.py`
- `codegaai/core/review_report.py`

Workflow:

```text
pull_request opened/synchronize/reopened
  -> checkout
  -> collect changed files and diff
  -> run safety scan
  -> build context pack
  -> select provider
  -> generate review findings
  -> post markdown summary comment
```

Review output:

- Risk summary.
- Blocking issues.
- Suggested tests.
- Security findings.
- Performance or maintainability notes.
- Files reviewed and skipped.

First version posts one top-level PR comment. Inline comments can come later after confidence is higher.

### 6. Agent Orchestrator

Purpose: connect safety, context, models, and tools into one inspectable loop.

Modules:

- `codegaai/core/agent_orchestrator.py`
- `codegaai/core/agent_trace.py`
- `codegaai/api/routes/agent.py` extension

Loop:

1. Classify intent and risk.
2. Build context pack.
3. Select provider chain.
4. Produce plan.
5. Ask for approvals when required.
6. Execute tools in sandbox.
7. Verify output.
8. Store trace and learning signal.

Trace fields:

- request id
- selected specialist
- selected provider
- context files/chunks used
- safety decisions
- tool calls
- verification results
- final answer or artifact id

## Phased Roadmap

### Phase 1: Agentic Core v1

Target: make the agent safer and smarter about code context.

Deliverables:

- `.codegaaiignore` parser.
- code chunker and local index metadata.
- Python AST graph.
- context pack API.
- prompt injection guard.
- safety gateway for risk classification.
- tests for ignore, chunking, AST, prompt guard, and safety policy.

Why first: every later feature depends on trusted context and action boundaries.

### Phase 2: Docker Sandbox

Target: run generated code and tests outside the host process.

Deliverables:

- `SandboxRunner` interface.
- Docker availability detection.
- Alpine/Python container runner.
- fallback to current Python-thread sandbox.
- API response compatibility with current `/api/sandbox/run`.
- tests with Docker mocked.

### Phase 3: Model Gateway + Ollama

Target: real hybrid routing.

Deliverables:

- provider interface.
- Ollama provider.
- local llama.cpp provider wrapper.
- cloud provider stubs that are disabled unless env keys exist.
- router decision object with reason, privacy, cost, and fallback.
- UI/API status endpoint for provider availability.

### Phase 4: GitHub PR Reviewer

Target: CODEGA AI comments on PRs.

Deliverables:

- PR review CLI module.
- GitHub Action workflow.
- diff parser.
- changed-file context pack.
- top-level review comment.
- safety and secret masking for PR input.

### Phase 5: Agent Trace and UI Polish

Target: make agent decisions visible and impressive.

Deliverables:

- agent trace store.
- UI panel showing context, provider, safety, tools, and verification.
- downloadable review reports.
- “why this answer” explanation.

## Testing Strategy

Unit tests:

- `.codegaaiignore` matching and default excludes.
- prompt injection pattern detection.
- secret masking.
- safety action classification.
- AST extraction.
- code chunking.
- model router decisions.
- PR diff parsing.

Integration tests:

- index a small sample repo and retrieve relevant chunks.
- build context pack from a question.
- sandbox runner falls back when Docker is unavailable.
- PR reviewer generates a stable markdown report from a fixture diff.

Build checks:

- Existing Windows/macOS build workflows remain valid.
- New PR review workflow uses only lightweight dependencies by default.

## Non-Goals For First Pass

- Fully autonomous code mutation without approval.
- Inline PR comments for every finding.
- Perfect AST for every language.
- Mandatory Docker requirement on user machines.
- Cloud provider calls without configured API keys and explicit privacy policy.

## Success Criteria

The first milestone is successful when CODEGA AI can:

- Scan a repository while respecting `.codegaaiignore`.
- Explain which files and symbols matter for a user question.
- Detect prompt injection in external text before model use.
- Classify risky actions and explain approval requirements.
- Build a compact context pack from semantic/AST signals.
- Run the relevant tests for the new core modules.

The full roadmap is successful when CODEGA AI can:

- Review a GitHub PR automatically.
- Choose local/Ollama/cloud models based on task, privacy, and complexity.
- Execute generated code in a Docker sandbox.
- Show a transparent trace of every important agent decision.

