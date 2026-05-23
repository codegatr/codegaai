"""
codegaai.core.ast_graph
=======================

Python AST symbol and dependency extraction.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field


@dataclass
class PythonAstGraph:
    path: str
    imports: list[str] = field(default_factory=list)
    classes: list[str] = field(default_factory=list)
    functions: list[str] = field(default_factory=list)
    calls: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def build_python_graph(path: str, content: str) -> PythonAstGraph:
    graph = PythonAstGraph(path=path)
    try:
        tree = ast.parse(content)
    except SyntaxError as exc:
        graph.errors.append(str(exc))
        return graph

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            graph.imports.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            graph.imports.extend(f"{module}.{alias.name}".strip(".") for alias in node.names)
        elif isinstance(node, ast.ClassDef):
            graph.classes.append(node.name)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            graph.functions.append(node.name)
        elif isinstance(node, ast.Call):
            name = _call_name(node.func)
            if name:
                graph.calls.append(name)

    graph.imports = sorted(set(graph.imports))
    graph.classes = sorted(set(graph.classes))
    graph.functions = sorted(set(graph.functions))
    graph.calls = sorted(set(graph.calls))
    return graph


def _call_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _call_name(node.value)
        return f"{base}.{node.attr}" if base else node.attr
    return ""
