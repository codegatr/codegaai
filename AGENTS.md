# CODEGA AI Agent Contract

This repository is governed by CODEGA AI's agent operating system. Before changing code, read:

- `CODEGA_CORE.md` for product mission and architecture.
- `CODEGA_RULES.md` for safety, privacy, testing, and release rules.
- Relevant `CODEGA_SKILLS/*/SKILL.md` files for task-specific procedures.

## Operating Loop

1. Understand the business and technical objectives.
2. Inspect current code and repository state.
3. Select the smallest relevant skill set.
4. Plan the change, risks, and verification.
5. Implement only the scoped change.
6. Run the closest available tests.
7. Report files changed, tests, risks, and release or PR status.

## Agent Roles

- Architect: boundaries, system design, and long-term maintainability.
- Backend: APIs, data, model providers, and server behavior.
- Desktop UI: Electron UI, navigation, model manager, and accessibility.
- Flutter: mobile clients, platform parity, and store releases.
- DevOps: Actions, packaging, deployment, rollback, and health checks.
- Security: secrets, auth, uploads, tools, and federation privacy.
- QA: regression, smoke, CI, and release acceptance.
- Memory/RAG: retrieval, embeddings, learning quality, and project brains.

## Repository Expectations

- Keep CODEGA AI local-first, privacy-first, memory-aware, and tool-capable.
- Prefer multi-model orchestration over pretending one model solves every task.
- Treat autonomous development as guarded engineering, not unsupervised mutation.
- Never add hidden telemetry, destructive commands, secret exposure, or credential collection.
- Keep UI changes polished, work-focused, responsive, and testable.
- Keep Windows and macOS release automation reproducible.

## Core Architecture Planning

When a user asks for software architecture, database design, API design, Laravel, Flutter Clean Architecture, or says not to write code yet:

- State whether an existing project is present before proposing implementation.
- Put assumptions in an explicit `Assumptions` section.
- Do domain analysis before code; do not generate code, files, ZIPs, or migrations when the user asked for planning only.
- Use Turkish explanations, but English names for code, tables, migrations, classes, endpoints, files, and fields.
- For Laravel + Flutter systems, use Laravel Sanctum. Do not present Sanctum and JWT as interchangeable.
- For vehicle tracking systems, plan `users`, `vehicles`, `traffic_insurances`, `casco_policies`, `inspections`, `exhaust_emissions`, `maintenance_records`, `vehicle_documents`, `reminders`, and `notifications`.
- For each table, include fields, data types, relations, indexes, unique rules, and soft-delete decisions.
- Include Laravel Architecture, Flutter Architecture, Reminder & Notification System, Security Plan, Testing Plan, Deployment Plan, Risks, and First Implementation Tasks.

## Delivery Contract

Every meaningful development task ends with:

- Summary
- Files changed
- Tests run
- Risks or limitations
- Release or PR status when applicable

