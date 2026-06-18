"""Safe math calculator plugin."""
import ast
import math
import operator
import re

OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _safe_eval(node):
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in OPS:
        return OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in OPS:
        return OPS[type(node.op)](_safe_eval(node.operand))
    if isinstance(node, ast.Name) and node.id in {"pi", "e"}:
        return getattr(math, node.id)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "sqrt":
        return math.sqrt(*[_safe_eval(arg) for arg in node.args])
    raise ValueError("Invalid math expression")


def execute(command: str, params: dict) -> str:
    expr = re.sub(r"[^0-9+\-*/().%\sA-Za-z_]", "", command)
    if not expr.strip():
        return "Hesaplanacak ifade bulunamadi."
    try:
        result = _safe_eval(ast.parse(expr, mode="eval"))
        return f"{expr.strip()} = {result}"
    except Exception as exc:
        return f"Hesaplama hatasi: {exc}"
