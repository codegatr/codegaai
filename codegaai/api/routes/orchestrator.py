"""
codegaai.api.routes.orchestrator
==================================

Ã‡oklu Model Orkestrasyonu (Faz 25).

Gelen isteÄŸi analiz eder, en uygun modeli seÃ§er, gerekirse birden
fazla modeli paralel Ã§alÄ±ÅŸtÄ±rÄ±r, sonuÃ§larÄ± birleÅŸtirir.

Desteklenen mod:
  auto   â€” Otomatik model seÃ§imi (AgentBrain'e gÃ¶re)
  chain  â€” Model zinciri: LLM â†’ Vision â†’ TTS
  vote   â€” Birden fazla LLM sonucu karÅŸÄ±laÅŸtÄ±r (en iyisini seÃ§)
  expert â€” UzmanlÄ±k alanÄ±na gÃ¶re yÃ¶nlendir

POST /api/orchestrate/auto    â€” En iyi modeli seÃ§ ve Ã§alÄ±ÅŸtÄ±r
POST /api/orchestrate/chain   â€” Model zinciri
POST /api/orchestrate/vote    â€” Ã‡oÄŸunluk oyu
"""

from __future__ import annotations

import asyncio
import time
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.core.agent_platform import agent_os_manifest, plan_agent_task, platform_status
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


class PlanRequest(BaseModel):
    message: str
    history: list[dict] = []
    available_models: list[str] = []


@router.get("/platform")
async def get_platform_status() -> dict:
    """Multi-model agent platform capabilities."""
    return platform_status()


@router.get("/agent-os")
async def get_agent_os_manifest() -> dict:
    """CODEGA AI digital employee architecture contract."""
    return agent_os_manifest()


@router.post("/plan")
async def plan_orchestration(req: PlanRequest) -> dict:
    """Plan provider, specialist, memory and tools before answering."""
    blueprint = plan_agent_task(
        req.message,
        history=req.history,
        available_models=req.available_models or None,
    )
    return blueprint.to_dict()


@router.post("/auto")
async def auto_orchestrate(req: OrchestrateRequest) -> dict:
    """
    MesajÄ± analiz et, en uygun modeli/araÃ§larÄ± seÃ§, Ã§alÄ±ÅŸtÄ±r.
    - Kod sorusu â†’ Qwen Coder
    - GÃ¶rsel soru â†’ moondream2 + LLM
    - Matematik â†’ LLM + Python sandbox
    - Genel â†’ Default LLM
    """
    from codegaai.core.agent_brain import decide_response
    from codegaai.core.engine import LLMEngine, GenerationConfig

    t0 = time.time()
    decision = decide_response(req.message)
    blueprint = plan_agent_task(req.message)
    pipeline_used = []
    results = {}

    # GÃ¶rsel gerekiyor mu?
    if decision.intent == "vision" or req.include_vision:
        pipeline_used.append("vision")
        results["vision_note"] = "GÃ¶rsel analiz iÃ§in gÃ¶rsel yÃ¼kle: /api/vision/screenshot"

    # Matematik/kod â†’ sandbox
    if decision.intent in ("coding", "calculation"):
        pipeline_used.append("sandbox")
        code = f"# {req.message}\nprint('HesaplanÄ±yor...')"
        results["sandbox_ready"] = True

    # Ana LLM cevabÄ±
    engine = LLMEngine.get()
    if engine.is_ready:
        pipeline_used.append("llm")
        sys = "Sen CODEGA AI'sÄ±n. " + (
            "Kod sorusunda Ã§alÄ±ÅŸan kod ver." if decision.intent == "coding" else
            "KÄ±sa ve net cevap ver."
        )
        msgs = [{"role": "system", "content": sys},
                {"role": "user", "content": req.message}]
        response = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=600, temperature=0.6)):
            response += tok
        results["response"] = response
    else:
        results["error"] = "LLM yÃ¼klÃ¼ deÄŸil"

    # TTS isteniyorsa
    if req.include_tts and results.get("response"):
        pipeline_used.append("tts")
        try:
            from codegaai.core.audio_engine import TTSEngine
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
            "type": decision.intent,
            "uses_tools": decision.uses_tools,
        },
        "blueprint": blueprint.to_dict(),
        "elapsed_ms": int((time.time() - t0) * 1000),
        **{k: v for k, v in results.items() if k not in ("response",)},
    }


@router.post("/vote")
async def vote_orchestrate(req: OrchestrateRequest) -> dict:
    """
    FarklÄ± temperature ayarlarÄ±yla birden fazla yanÄ±t Ã¼ret,
    en tutarlÄ±/kaliteli olanÄ± seÃ§.
    """
    from codegaai.core.engine import LLMEngine, GenerationConfig

    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "LLM yÃ¼klÃ¼ deÄŸil"}

    temps = [0.3, 0.6, 0.9]
    candidates = []

    msgs = [
        {"role": "system", "content": "Sen CODEGA AI'sÄ±n. DoÄŸru ve yararlÄ± cevap ver."},
        {"role": "user", "content": req.message},
    ]

    for temp in temps[:3]:
        out = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=400, temperature=temp)):
            out += tok
        candidates.append({"temp": temp, "response": out.strip()})

    # En uzun yanÄ±tÄ± seÃ§ (genellikle en kapsamlÄ±)
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
    Model zinciri: Her model bir Ã¶ncekinin Ã§Ä±ktÄ±sÄ±nÄ± alÄ±r.
    Ã–rnek: LLM â†’ [Sandbox] â†’ [Vision] â†’ TTS
    """
    from codegaai.core.engine import LLMEngine, GenerationConfig

    chain_log = []
    context = req.message

    # 1. LLM
    engine = LLMEngine.get()
    if engine.is_ready:
        msgs = [{"role": "system", "content": "Sen CODEGA AI'sÄ±n."},
                {"role": "user", "content": context}]
        llm_out = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=500)):
            llm_out += tok
        chain_log.append({"model": "llm", "output_len": len(llm_out)})
        context = llm_out

    # 2. Python kodu varsa sandbox'ta Ã§alÄ±ÅŸtÄ±r
    import re
    code_match = re.search(r'```python\n(.*?)```', context, re.DOTALL)
    if code_match:
        from codegaai.api.routes.sandbox import _run_code, _is_safe_code
        code = code_match.group(1)
        ok, _ = _is_safe_code(code)
        if ok:
            result = _run_code(code, timeout=10)
            if result.get("output"):
                context += f"\n\n[Kod Ã‡Ä±ktÄ±sÄ±]\n{result['output']}"
                chain_log.append({"model": "sandbox", "output_len": len(result["output"])})

    # 3. TTS (isteniyorsa)
    audio_url = ""
    if req.include_tts:
        try:
            from codegaai.core.audio_engine import TTSEngine
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
    """Åu an yÃ¼klÃ¼ olan tÃ¼m modeller."""
    models = {}
    try:
        from codegaai.core.engine import LLMEngine
        e = LLMEngine.get()
        models["llm"] = {"active": e.is_ready, "id": getattr(e, "_model_id", "â€”")}
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
        from codegaai.core.audio_engine import TTSEngine
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

