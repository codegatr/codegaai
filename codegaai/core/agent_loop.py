"""
codegaai.core.agent_loop
========================

Gerçek ReAct (Reason + Act) ajan döngüsü.

Bir yerel modeli "Claude gibi" davranan bir ajana çeviren asıl katman budur.
Modelin ham boyutu değil, AŞAĞIDAKİ DÖNGÜ yetenek yaratır:

    üret  ->  araç çağrılarını çalıştır  ->  gözlemi modele GERİ BESLE
          ->  model gözlem üzerine yeniden düşünür  ->  ya yeni araç ya FINAL cevap

Önceki mimaride `parse_and_run_tools` yalnızca BİR KEZ çağrılıyor ve araç
sonucu metnin içine gömülüyordu; model o sonucu asla okumuyordu. Bu modül o
açığı kapatır: araç sonucunu (gözlem) konuşmaya yeni bir tur olarak ekler ve
modeli tekrar çalıştırır. Bu sayede tek bir 7B model bile çok adımlı araştırma,
hesaplama ve düzeltme yapabilir.

Tasarım ilkeleri
----------------
* Saf Python, ağır bağımlılık YOK. Bu yüzden modelsiz/GPU'suz test edilebilir.
* `generate_fn(messages) -> str` enjekte edilir; gerçek motora da, sahte bir
  test motoruna da bağlanabilir. (Bkz. engine.LLMEngine.generate_agentic)
* Araçlar `codegaai.core.tools` registry'sinden çalışır (tek kaynak).
* `max_iters` ile sonsuz döngü engellenir; limit dolarsa son bir "sentez" turu
  istenir (artık araç yok, topladığın bilgiyle net cevap ver).

Sonraki faz bağımlılıkları (yorum):
    # Faz 49 hedefi: araç onayı (safe=False araçlar için kullanıcı onayı),
    #               adım adım UI trace yayını (SSE) ve paralel araç çağrısı.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from codegaai.core.tools import TOOL_PATTERN, parse_and_run_tools
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

# messages listesi alıp ham asistan metni (araç tag'leri dahil) döndüren fonksiyon
GenerateFn = Callable[[list[dict]], str]


@dataclass
class AgentStep:
    """Döngüdeki tek bir tur."""
    iteration: int
    assistant_raw: str
    tool_calls: list[dict] = field(default_factory=list)
    observation: str = ""


@dataclass
class AgentResult:
    """Döngünün nihai çıktısı + tam iz (trace)."""
    content: str = ""
    steps: list[AgentStep] = field(default_factory=list)
    iterations: int = 0
    stopped_reason: str = "final_answer"   # final_answer | max_iters | error
    tool_calls: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "content": self.content,
            "iterations": self.iterations,
            "stopped_reason": self.stopped_reason,
            "tool_calls": self.tool_calls,
            "steps": [
                {
                    "iteration": s.iteration,
                    "tool_calls": s.tool_calls,
                    "observation": s.observation,
                }
                for s in self.steps
            ],
        }


def has_tool_call(text: str) -> bool:
    """Metinde çalıştırılacak bir <tool>...</tool> çağrısı var mı?"""
    return bool(TOOL_PATTERN.search(text or ""))


def _format_observation(calls: list) -> str:
    """Araç sonuçlarını modele geri beslenecek 'gözlem' turuna çevir."""
    if not calls:
        return (
            "## Araç Sonuçları (Gözlem)\n[araç sonucu yok]\n\n"
            "Bu bilgiyle final cevabını ver, tekrar aynı aracı çağırma."
        )
    lines = ["## Araç Sonuçları (Gözlem)"]
    for c in calls:
        body = c.result if getattr(c, "result", None) is not None else (getattr(c, "error", "") or "")
        lines.append(f"### {c.name}\n{body}")
    lines.append(
        "\nBu sonuçlara dayanarak: yeterliyse FINAL cevabını yaz, "
        "eksikse YENİ bir araç çağır. Aynı çağrıyı tekrarlama."
    )
    return "\n".join(lines)


def run_react(
    messages: list[dict],
    generate_fn: GenerateFn,
    *,
    max_iters: int = 4,
    observation_role: str = "user",
) -> AgentResult:
    """
    Gerçek ReAct döngüsünü çalıştır.

    Parametreler
    ------------
    messages : [{role, content}, ...]  başlangıç konuşması (system + history + user)
    generate_fn : messages -> ham asistan metni (araçlar BURADA çalıştırılmamalı,
                  döngü çalıştırır; bu yüzden motorun tek-atış tool'unu KAPAT)
    max_iters : en fazla düşün-araç turu (sonsuz döngü koruması)
    observation_role : gözlem turunun rolü ("user" çoğu yerel chat template'iyle uyumlu)

    Dönüş : AgentResult (final içerik + tam iz)
    """
    convo: list[dict] = list(messages)
    result = AgentResult()

    for i in range(1, max_iters + 1):
        try:
            raw = generate_fn(convo) or ""
        except Exception as exc:  # üretim hatası — döngüyü güvenle bitir
            log.warning("Ajan döngüsü üretim hatası (tur %d): %s", i, exc)
            result.stopped_reason = "error"
            result.content = f"⚠️ Üretim hatası: {exc}"
            result.iterations = i - 1
            return result

        step = AgentStep(iteration=i, assistant_raw=raw)

        # Araç çağrısı yoksa: bu FINAL cevaptır.
        if not has_tool_call(raw):
            result.content = raw.strip()
            result.steps.append(step)
            result.iterations = i
            result.stopped_reason = "final_answer"
            return result

        # Araçları çalıştır ve gözlemi hazırla.
        _, calls = parse_and_run_tools(raw)
        step.tool_calls = [
            {
                "name": c.name,
                "args": c.args,
                "result": c.result,
                "error": c.error,
                "elapsed_ms": c.elapsed_ms,
            }
            for c in calls
        ]
        for c in calls:
            result.tool_calls.append(
                {"name": c.name, "result": c.result, "elapsed_ms": c.elapsed_ms}
            )

        observation = _format_observation(calls)
        step.observation = observation
        result.steps.append(step)

        # Modelin kendi araç çağrısı + gözlem turunu konuşmaya ekle (ReAct izi).
        convo.append({"role": "assistant", "content": raw})
        convo.append({"role": observation_role, "content": observation})
        result.iterations = i

    # max_iters doldu: son bir kez, araçsız sentez iste.
    convo.append({
        "role": observation_role,
        "content": (
            "Yeterli bilgi toplandı. Artık ARAÇ KULLANMA. "
            "Topladığın araç sonuçlarına dayanarak kısa, net ve doğrudan "
            "final cevabını ver."
        ),
    })
    try:
        final_raw = generate_fn(convo) or ""
        if has_tool_call(final_raw):
            final_clean, _ = parse_and_run_tools(final_raw)
        else:
            final_clean = final_raw
        result.content = final_clean.strip()
    except Exception as exc:
        log.warning("Ajan döngüsü final sentez hatası: %s", exc)
        result.content = f"⚠️ Final üretim hatası: {exc}"
    result.stopped_reason = "max_iters"
    return result
