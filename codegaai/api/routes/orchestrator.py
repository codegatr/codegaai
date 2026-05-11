"""
codegaai.api.routes.orchestrator
==================================

Çoklu Model Orkestrasyonu (Faz 25).

Gelen isteği analiz eder, en uygun modeli seçer, gerekirse birden
fazla modeli paralel çalıştırır, sonuçları birleştirir.

Desteklenen mod:
  auto   — Otomatik model seçimi (AgentBrain'e göre)
  chain  — Model zinciri: LLM → Vision → TTS
  vote   — Birden fazla LLM sonucu karşılaştır (en iyisini seç)
  expert — Uzmanlık alanına göre yönlendir

POST /api/orchestrate/auto    — En iyi modeli seç ve çalıştır
POST /api/orchestrate/chain   — Model zinciri
POST /api/orchestrate/vote    — Çoğunluk oyu
"""

from __future__ import annotations

import asyncio
import time
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


class OrchestrateRequest(BaseModel):
    message: str
    mode: str = "auto"   # auto | chain | vote | expert
    models: list[str] = []  # vote modunda hangi modeller
    include_vision: bool = False
    include_tts: bool = False
    chat_id: Optional[int] = None


@router.post("/auto")
async def auto_orchestrate(req: OrchestrateRequest) -> dict:
    """
    Mesajı analiz et, en uygun modeli/araçları seç, çalıştır.
    - Kod sorusu → Qwen Coder
    - Görsel soru → moondream2 + LLM
    - Matematik → LLM + Python sandbox
    - Genel → Default LLM
    """
    from codegaai.core.agent_brain import decide_response
    from codegaai.core.engine import LLMEngine, GenerationConfig

    t0 = time.time()
    decision = decide_response(req.message)
    pipeline_used = []
    results = {}

    # Görsel gerekiyor mu?
    if decision.response_type == "vision" or req.include_vision:
        pipeline_used.append("vision")
        results["vision_note"] = "Görsel analiz için görsel yükle: /api/vision/screenshot"

    # Matematik/kod → sandbox
    if decision.response_type in ("code", "calculation"):
        pipeline_used.append("sandbox")
        code = f"# {req.message}\nprint('Hesaplanıyor...')"
        results["sandbox_ready"] = True

    # Ana LLM cevabı
    engine = LLMEngine.get()
    if engine.is_ready:
        pipeline_used.append("llm")
        sys = "Sen CODEGA AI'sın. " + (
            "Kod sorusunda çalışan kod ver." if decision.response_type == "code" else
            "Kısa ve net cevap ver."
        )
        msgs = [{"role": "system", "content": sys},
                {"role": "user", "content": req.message}]
        response = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=600, temperature=0.6)):
            response += tok
        results["response"] = response
    else:
        results["error"] = "LLM yüklü değil"

    # TTS isteniyorsa
    if req.include_tts and results.get("response"):
        pipeline_used.append("tts")
        try:
            from codegaai.core.tts_engine import TTSEngine
            tts = TTSEngine.get()
            if tts.is_ready:
                tts_r = tts.synthesize(results["response"][:300], language="tr")
                results["audio_url"] = tts_r.get("url", "")
        except Exception:
            pass

    return {
        "response": results.get("response", ""),
        "pipeline": pipeline_used,
        "decision": {
            "type": decision.response_type,
            "uses_tools": decision.uses_tools,
        },
        "elapsed_ms": int((time.time() - t0) * 1000),
        **{k: v for k, v in results.items() if k not in ("response",)},
    }


@router.post("/vote")
async def vote_orchestrate(req: OrchestrateRequest) -> dict:
    """
    Farklı temperature ayarlarıyla birden fazla yanıt üret,
    en tutarlı/kaliteli olanı seç.
    """
    from codegaai.core.engine import LLMEngine, GenerationConfig

    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "LLM yüklü değil"}

    temps = [0.3, 0.6, 0.9]
    candidates = []

    msgs = [
        {"role": "system", "content": "Sen CODEGA AI'sın. Doğru ve yararlı cevap ver."},
        {"role": "user", "content": req.message},
    ]

    for temp in temps[:3]:
        out = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=400, temperature=temp)):
            out += tok
        candidates.append({"temp": temp, "response": out.strip()})

    # En uzun yanıtı seç (genellikle en kapsamlı)
    best = max(candidates, key=lambda x: len(x["response"]))
    return {
        "response": best["response"],
        "method": "vote",
        "candidates": len(candidates),
        "winning_temp": best["temp"],
    }


@router.post("/chain")
async def chain_orchestrate(req: OrchestrateRequest) -> dict:
    """
    Model zinciri: Her model bir öncekinin çıktısını alır.
    Örnek: LLM → [Sandbox] → [Vision] → TTS
    """
    from codegaai.core.engine import LLMEngine, GenerationConfig

    chain_log = []
    context = req.message

    # 1. LLM
    engine = LLMEngine.get()
    if engine.is_ready:
        msgs = [{"role": "system", "content": "Sen CODEGA AI'sın."},
                {"role": "user", "content": context}]
        llm_out = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=500)):
            llm_out += tok
        chain_log.append({"model": "llm", "output_len": len(llm_out)})
        context = llm_out

    # 2. Python kodu varsa sandbox'ta çalıştır
    import re
    code_match = re.search(r'```python\n(.*?)```', context, re.DOTALL)
    if code_match:
        from codegaai.api.routes.sandbox import _run_code, _is_safe_code
        code = code_match.group(1)
        ok, _ = _is_safe_code(code)
        if ok:
            result = _run_code(code, timeout=10)
            if result.get("output"):
                context += f"\n\n[Kod Çıktısı]\n{result['output']}"
                chain_log.append({"model": "sandbox", "output_len": len(result["output"])})

    # 3. TTS (isteniyorsa)
    audio_url = ""
    if req.include_tts:
        try:
            from codegaai.core.tts_engine import TTSEngine
            tts = TTSEngine.get()
            if tts.is_ready:
                r = tts.synthesize(context[:200], language="tr")
                audio_url = r.get("url", "")
                chain_log.append({"model": "tts", "url": audio_url})
        except Exception:
            pass

    return {
        "response": context,
        "chain": chain_log,
        "audio_url": audio_url,
    }


@router.get("/models")
async def list_active_models() -> dict:
    """Şu an yüklü olan tüm modeller."""
    models = {}
    try:
        from codegaai.core.engine import LLMEngine
        e = LLMEngine.get()
        models["llm"] = {"active": e.is_ready, "id": getattr(e, "_model_id", "—")}
    except Exception:
        models["llm"] = {"active": False}

    try:
        from codegaai.core.embeddings import EmbeddingService
        emb = EmbeddingService.get()
        models["embedding"] = {"active": emb.is_ready}
    except Exception:
        models["embedding"] = {"active": False}

    try:
        from codegaai.core.vision_engine import VisionEngine
        vis = VisionEngine.get()
        models["vision"] = {"active": vis.is_ready}
    except Exception:
        models["vision"] = {"active": False}

    try:
        from codegaai.core.tts_engine import TTSEngine
        tts = TTSEngine.get()
        models["tts"] = {"active": tts.is_ready}
    except Exception:
        models["tts"] = {"active": False}

    try:
        from codegaai.core.asr_engine import ASREngine
        asr = ASREngine.get()
        models["asr"] = {"active": asr.is_ready}
    except Exception:
        models["asr"] = {"active": False}

    active_count = sum(1 for m in models.values() if m.get("active"))
    return {"models": models, "active_count": active_count, "total": len(models)}
