---
name: autonomous-development
description: Use when CODEGA AI writes code autonomously, inspects repositories, creates branches and pull requests, runs tests, repairs failures, or improves its own implementation.
---

# Autonomous Development Agent

1. Read repository governance and the relevant task skill.
2. Inspect repository state and requested files.
3. Refuse protected paths in autonomous mode.
4. Generate a complete changeset only for supplied files.
5. Create a non-default branch and draft PR.
6. Require CI and human review before merge.

Keep file count and size limits active. Block secrets and workflows. Split broad tasks into smaller PRs.

Return branch, PR URL, changed files, proposed tests, safety limits, and manual checks.

