"""
codegaai.core.code_chunks
=========================

Small code chunking primitives for context packs.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CodeChunk:
    path: str
    language: str
    start_line: int
    end_line: int
    text: str
    symbol: str = ""
    kind: str = "text"


def chunk_code(path: str, content: str, max_lines: int = 80) -> list[CodeChunk]:
    language = _language_for_path(path)
    if language == "python":
        chunks = _chunk_python(path, content)
        if chunks:
            return chunks
    return _chunk_by_window(path, content, language, max_lines=max_lines)


def _language_for_path(path: str) -> str:
    ext = Path(path).suffix.lower()
    return {
        ".py": "python",
        ".js": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".jsx": "javascript",
        ".php": "php",
        ".md": "markdown",
    }.get(ext, ext.lstrip(".") or "text")


def _chunk_python(path: str, content: str) -> list[CodeChunk]:
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return []
    lines = content.splitlines()
    chunks: list[CodeChunk] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            start = getattr(node, "lineno", 1)
            end = getattr(node, "end_lineno", start)
            text = "\n".join(lines[start - 1:end])
            chunks.append(CodeChunk(path, "python", start, end, text, node.name, node.__class__.__name__))
    return chunks


def _chunk_by_window(path: str, content: str, language: str, max_lines: int) -> list[CodeChunk]:
    lines = content.splitlines()
    chunks: list[CodeChunk] = []
    for start_index in range(0, len(lines), max_lines):
        end_index = min(start_index + max_lines, len(lines))
        text = "\n".join(lines[start_index:end_index])
        chunks.append(CodeChunk(path, language, start_index + 1, end_index, text, kind="window"))
    return chunks
