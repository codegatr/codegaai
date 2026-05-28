# Codega AI Frontier Capability Plan

This document records the product direction implemented in code by
`codegaai.core.frontier_capabilities`.

## Goal

Codega AI should behave like a modern multimodal AI system: it should infer the
user's task, choose the right local or connected model family, reason before it
acts, use tools when needed, and learn only through privacy-preserving opt-in
signals.

## Implemented Runtime Contract

- Coding requests route toward coder-specialized models first, then strong
  general reasoning models.
- Research and current-fact requests use a ReAct-style tool loop contract.
- Complex reasoning gets deliberate multi-step or Tree-of-Thoughts style
  planning guidance without exposing private hidden reasoning to the user.
- Video requests get a production pipeline plan: storyboard, keyframes,
  text-to-video/image-to-video generation, consistency pass, and
  provenance/safety metadata.
- Federated learning remains opt-in and privacy-first. Raw chats, files, local
  paths, API keys, and personally identifying content must never be uploaded.

## Research Basis

- ReAct: interleaves reasoning and acting so the model can plan, call tools,
  observe results, and recover from errors.
- Tree of Thoughts: explores multiple candidate reasoning paths and
  self-evaluates before choosing a final answer.
- Federated foundation models: combine foundation models and federated learning
  for privacy-preserving collaborative improvement.
- Sora/Veo-style video systems: current frontier systems emphasize diffusion
  transformer scaling, temporal coherence, scene consistency, and synchronized
  audio/provenance safeguards.

## Practical Boundary

The repository can implement orchestration, safety, routing, local inference,
download management, and federated signal exchange. Training a brand-new model
that beats frontier systems requires large licensed datasets, GPU/TPU clusters,
evaluation infrastructure, and a safety/red-team program. Codega AI should
therefore expose a local-first architecture that can plug into stronger models
as they become available while preserving user control and privacy.
