"""
Streaming sohbet uç noktası (SSE).

GET /api/chat/stream?message=...&chat_id=...

Server-Sent Events ile token-token yanıt gönderir.
Claude'daki gibi yazı "yazılıyor" efekti verir.

Format:
  data: {"type":"token","content":"Merhaba"}
  data: {"type":"token","content":" Yunus"}
  data: {"type":"done","tool_calls":[],"timing_ms":1200}
  data: {"type":"error","message":"..."}
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

router = APIRouter()


async def _sse_event(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/stream")
async def stream_chat(
    request: Request,
    message: str = Query(..., min_length=1, max_length=8192),
    chat_id: Optional[str] = Query(None),
    model_id: Optional[str] = Query(None),
    temperature: float = Query(0.7, ge=0.0, le=2.0),
    max_tokens: int = Query(2048, ge=1, le=8192),
):
    """Streaming sohbet — SSE ile token token yanıt."""

    async def event_stream() -> AsyncGenerator[str, None]:
        from codegaai.core.engine import LLMEngine, GenerationConfig
        from codegaai.core.chat_store import ChatStore
        from codegaai.core.memory import MemoryStore
        from codegaai.core.system_prompt import build_system_prompt
        from codegaai.core.tools import parse_and_run_tools

        engine = LLMEngine.get()

        # Model router: sadece hiç model yüklü değilse yükle
        # Zaten yüklü modeli asla değiştirme (unload → re-load = sohbet kesilir)
        if not engine.is_ready:
            try:
                from codegaai.core.model_router import ModelRouter
                from codegaai.core.models_registry import ModelRegistry
                reg = ModelRegistry.get()
                # İndirilmiş modelleri bul, ilkini yükle
                for m in reg.list_llm_models():
                    if reg.is_llm_downloaded(m["id"]):
                        engine.load(m["id"])
                        break
            except Exception:
                pass

        if not engine.is_ready:
            # Kendini onarma: model yüklemeyi dene
            from codegaai.core.self_healing import SelfHealing
            SelfHealing.get().report_error("llm", "Model yüklü değil", auto_fix=True)
            yield await _sse_event({"type": "error",
                                    "message": "Model yükleniyor, 5 saniye sonra tekrar dene"})
            return

        # RAG
        rag_text = ""
        try:
            mem = MemoryStore.get()
            hits = mem.search(message, n_results=3)
            rag_text = "\n".join(h["text"][:300] for h in hits)
        except Exception:
            pass

        # Sohbet geçmişi
        history = []
        if chat_id:
            try:
                store = ChatStore.get()
                history = store.get_messages(chat_id)[-10:]
            except Exception:
                pass

        # Sistem promptu
        sys_prompt = build_system_prompt(
            include_tools=True,
            include_profile=True,
            rag_context=rag_text,
        )

        final_messages = [{"role": "system", "content": sys_prompt}]
        for m in history:
            final_messages.append({"role": m.role, "content": m.content})
        final_messages.append({"role": "user", "content": message})

        cfg = GenerationConfig(temperature=temperature, max_tokens=max_tokens)

        # Başlangıç event'i
        yield await _sse_event({"type": "start", "chat_id": chat_id})

        # Streaming token'lar
        full_content = ""
        t0 = time.time()

        try:
            loop = asyncio.get_event_loop()

            def _stream_sync():
                """Senkron stream generator — thread içinde çalışır."""
                return engine.stream(final_messages, cfg=cfg)

            # Thread-safe: sync generator'ı async'e çevir
            queue: asyncio.Queue = asyncio.Queue()

            def _producer():
                try:
                    for delta in engine.stream(final_messages, cfg=cfg):
                        loop.call_soon_threadsafe(queue.put_nowait, delta)
                    loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel
                except Exception as exc:
                    loop.call_soon_threadsafe(queue.put_nowait, exc)

            import threading
            t = threading.Thread(target=_producer, daemon=True)
            t.start()

            while True:
                # Bağlantı kesildi mi kontrol
                if await request.is_disconnected():
                    break

                try:
                    item = await asyncio.wait_for(queue.get(), timeout=120.0)
                except asyncio.TimeoutError:
                    yield await _sse_event({"type": "error", "message": "Zaman aşımı"})
                    break

                if item is None:
                    break  # Tamamlandı
                if isinstance(item, Exception):
                    yield await _sse_event({"type": "error", "message": str(item)})
                    return

                delta = item
                full_content += delta
                yield await _sse_event({"type": "token", "content": delta})

        except Exception as exc:
            yield await _sse_event({"type": "error", "message": str(exc)})
            return

        # Tool use — tüm metin hazır
        tool_calls_info = []
        if full_content:
            try:
                processed, tool_calls = parse_and_run_tools(full_content)
                if tool_calls:
                    full_content = processed
                    tool_calls_info = [
                        {"name": tc.name, "result": tc.result}
                        for tc in tool_calls
                    ]
                    # Tool sonuçlarını gönder
                    for tc in tool_calls:
                        yield await _sse_event({
                            "type": "tool_result",
                            "name": tc.name,
                            "result": tc.result,
                        })
            except Exception:
                pass

        timing_ms = int((time.time() - t0) * 1000)

        # Sohbete kaydet
        if chat_id and full_content:
            try:
                store = ChatStore.get()
                store.add_message(chat_id, "user", message)
                store.add_message(chat_id, "assistant", full_content)
            except Exception:
                pass

        yield await _sse_event({
            "type": "done",
            "tool_calls": tool_calls_info,
            "timing_ms": timing_ms,
            "full_content": full_content,
        })

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
