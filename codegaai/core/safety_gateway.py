"""
codegaai.core.safety_gateway
============================

Central action risk classification for agent tools.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any


SAFE_ACTIONS = {"read_file", "code_search", "memory_recall", "current_time", "calculate"}
APPROVAL_REQUIRED_ACTIONS = {
    "terminal",
    "file_write",
    "file_delete",
    "package_install",
    "github_push",
    "github_release",
    "database_write",
    "server_restart",
}
BLOCKED_COMMAND_PATTERNS = [
    "cat .env | curl",
    "curl ",
    "rm -rf /",
    "sudo rm",
    "chmod -r 777 /",
    "chmod -R 777 /".lower(),
    "mkfs",
    "dd if=",
]


@dataclass(frozen=True)
class SafetyDecision:
    action: str
    level: str
    reason: str
    requires_human: bool
    action_hash: str
    notes: list[str] = field(default_factory=list)


def _hash_action(action: str, payload: dict[str, Any]) -> str:
    raw = json.dumps({"action": action, "payload": payload}, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def classify_action(action: str, payload: dict[str, Any] | None = None) -> SafetyDecision:
    payload = payload or {}
    action_hash = _hash_action(action, payload)

    command = str(payload.get("command", "")).lower()
    if action == "terminal" and any(pattern in command for pattern in BLOCKED_COMMAND_PATTERNS):
        return SafetyDecision(
            action=action,
            level="blocked",
            reason="terminal command matches blocked exfiltration/destructive pattern",
            requires_human=True,
            action_hash=action_hash,
        )

    if action in SAFE_ACTIONS:
        return SafetyDecision(action, "safe", f"{action} is read-only or deterministic", False, action_hash)

    if action in APPROVAL_REQUIRED_ACTIONS:
        return SafetyDecision(action, "approval_required", f"{action} requires human approval", True, action_hash)

    return SafetyDecision(action, "approval_required", f"{action} is unknown and requires review", True, action_hash)
