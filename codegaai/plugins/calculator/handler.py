"""Güvenli matematik hesaplama."""
import re, math

def execute(command: str, params: dict) -> str:
    expr = re.sub(r'[^0-9+\-*/().%\s]', '', command)
    if not expr.strip():
        return "Hesaplanacak ifade bulunamadı."
    try:
        safe_globals = {"__builtins__": {}, "math": math,
                        "sqrt": math.sqrt, "pi": math.pi, "e": math.e}
        result = eval(expr, safe_globals)
        return f"{expr.strip()} = {result}"
    except Exception as e:
        return f"Hesaplama hatası: {e}"
