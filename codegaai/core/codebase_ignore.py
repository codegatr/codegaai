"""
codegaai.core.codebase_ignore
=============================

`.codegaaiignore` support for local codebase indexing.
"""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass, field
from pathlib import Path


DEFAULT_EXCLUDES = [
    ".git/**",
    "node_modules/**",
    "vendor/**",
    ".venv/**",
    "__pycache__/**",
    "dist/**",
    "build/**",
    "*.pyc",
    "*.pyo",
    "*.exe",
    "*.dll",
    "*.dylib",
    "*.so",
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.gif",
    "*.mp4",
    "*.zip",
    "*.gguf",
]


@dataclass
class CodegaIgnore:
    patterns: list[str] = field(default_factory=list)
    negations: list[str] = field(default_factory=list)

    @classmethod
    def from_text(cls, text: str) -> "CodegaIgnore":
        patterns = list(DEFAULT_EXCLUDES)
        negations: list[str] = []
        for raw in text.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("!"):
                negations.append(line[1:])
            else:
                patterns.append(line)
        return cls(patterns=patterns, negations=negations)

    @classmethod
    def from_root(cls, root: Path) -> "CodegaIgnore":
        path = root / ".codegaaiignore"
        return cls.from_text(path.read_text(encoding="utf-8") if path.exists() else "")

    def is_ignored(self, relative_path: str | Path) -> bool:
        path = str(relative_path).replace("\\", "/").lstrip("./")
        ignored = any(_matches(pattern, path) for pattern in self.patterns)
        if ignored and any(_matches(pattern, path) for pattern in self.negations):
            return False
        return ignored


def _matches(pattern: str, path: str) -> bool:
    pattern = pattern.replace("\\", "/").lstrip("./")
    if pattern.endswith("/**"):
        prefix = pattern[:-3].rstrip("/")
        return path == prefix or path.startswith(prefix + "/")
    if "/" not in pattern:
        return any(fnmatch.fnmatch(part, pattern) for part in path.split("/")) or fnmatch.fnmatch(path, pattern)
    return fnmatch.fnmatch(path, pattern)
