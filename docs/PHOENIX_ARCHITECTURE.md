# CODEGA AI Phoenix Architecture

CODEGA AI Phoenix is the next-generation AI core for CODEGA AI.

## Vision

CODEGA AI Phoenix is not a simple Ollama chat wrapper. It is a local-first, privacy-first, modular AI platform that can plan, reason, code, research, remember, execute tools, review its own work, and recover from failures.

Motto:

> Sinirsiz kod. Sinirsiz guc.

## What stays from the current app

The following working layers are preserved:

- Desktop UI shell
- Settings system
- Update system
- GitHub release delivery
- Output firewall and answer sanitizer
- Existing local/cloud provider adapters where useful
- Existing tools and RAG pieces where useful

## What changes

The old monolithic AI core is replaced gradually. `model-manager.js` remains as the compatibility shell during migration, but Phoenix becomes the new intelligence layer.

## Phoenix Core Modules

```text
src/main/phoenix/
  kernel/
    phoenix-kernel.js
  router/
    intent-router.js
    model-router.js
    provider-router.js
  runtime/
    execution-engine.js
    timeout-controller.js
    retry-engine.js
    stream-controller.js
  agents/
    code-agent.js
    reasoner-agent.js
    research-agent.js
    analyst-agent.js
    design-agent.js
    executor-agent.js
    critic-agent.js
  memory/
    session-memory.js
    long-term-memory.js
    project-memory.js
  output/
    output-firewall.js
    answer-formatter.js
    confidence-engine.js
  provisioning/
    model-provisioner.js
  diagnostics/
    system-diagnostics.js
    health-monitor.js
```

## Execution Flow

```text
User request
  -> Phoenix Kernel
  -> Intent Router
  -> Context + Memory
  -> Model / Provider Router
  -> Agent selection
  -> Runtime Execution Engine
  -> Critic / Confidence Engine
  -> Output Firewall
  -> Final user-facing answer
```

## Design Rules

1. Never block the user on a single slow model.
2. Never show internal reasoning labels or raw chain-of-thought style sections.
3. Always prefer the fastest suitable model for the task.
4. If a required model is missing, provision it or explain clearly.
5. Code requests should use the code path, not the general chat path.
6. Every agent must return clean, user-facing output.
7. Every model attempt must be logged with model, reason, duration and outcome.
8. Phoenix must degrade gracefully: local -> fallback local -> cloud/federation -> clear recovery message.
9. UI must feel alive with progress, stream and diagnostics.
10. The system should improve through measured signals, not random prompt patches.

## Migration Plan

### Phase 1: Phoenix Foundation

- Add module layout.
- Add kernel facade.
- Add intent/router/runtime skeletons.
- Keep `model-manager.js` as compatibility bridge.

### Phase 2: Runtime Router Integration

- Route code tasks to the code agent.
- Route short factual prompts to fast local models.
- Route planning/analysis to stronger models.
- Add fallback chain execution.

### Phase 3: Provisioning

- Auto-detect missing core models.
- Prepare required lightweight and code models.
- Surface model readiness in diagnostics.

### Phase 4: Agent System

- Introduce specialized agents.
- Add agent coordinator.
- Add critic and confidence engine.

### Phase 5: Stable v5 Release

- Remove or reduce legacy core responsibilities.
- Keep compatibility only where required.
- Release CODEGA AI Phoenix as stable v5.
