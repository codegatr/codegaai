"""
codegaai.api.routes.advanced
==============================

Faz 34 — Gerçek Zamanlı İşbirliği   WebSocket tabanlı canlı sohbet paylaşımı
Faz 35 — Akıllı Kod Tamamlama       LSP benzeri, bağlam duyarlı
Faz 36 — Otomatik Docstring Üretici Her fonksiyon/sınıf için otomatik belgeleme
"""
from __future__ import annotations

import re, time, uuid
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


# ══════════════════════════════════════════════════════════
# FAZ 34 — Gerçek Zamanlı İşbirliği
# ══════════════════════════════════════════════════════════

_rooms: dict[str, list[WebSocket]] = defaultdict(list)
_room_history: dict[str, list[dict]] = defaultdict(list)


@router.websocket("/collab/{room_id}")
async def collab_ws(ws: WebSocket, room_id: str):
    """Canlı işbirliği WebSocket — Faz 34."""
    await ws.accept()
    _rooms[room_id].append(ws)
    peer_id = uuid.uuid4().hex[:6]
    log.info("Collab: %s odasına %s katıldı", room_id, peer_id)

    # Geçmişi gönder
    for msg in _room_history[room_id][-20:]:
        await ws.send_json(msg)
    await ws.send_json({"type": "system", "text": f"Odaya katıldınız ({peer_id})",
                        "peer_id": peer_id, "ts": time.strftime("%H:%M:%S")})
    try:
        while True:
            data = await ws.receive_json()
            msg  = {**data, "peer_id": peer_id, "ts": time.strftime("%H:%M:%S")}
            _room_history[room_id].append(msg)
            if len(_room_history[room_id]) > 200:
                _room_history[room_id] = _room_history[room_id][-200:]
            # Tüm odaya yayınla
            dead = []
            for peer in _rooms[room_id]:
                if peer is ws:
                    continue
                try:
                    await peer.send_json(msg)
                except Exception:
                    dead.append(peer)
            for d in dead:
                _rooms[room_id].remove(d)
    except WebSocketDisconnect:
        _rooms[room_id].remove(ws)
        log.info("Collab: %s ayrıldı", peer_id)


@router.get("/collab/rooms")
async def list_rooms() -> dict:
    return {
        "rooms": [
            {"room_id": rid, "peers": len(peers),
             "messages": len(_room_history.get(rid, []))}
            for rid, peers in _rooms.items() if peers
        ],
        "phase": "Faz 34",
    }


@router.post("/collab/create")
async def create_room() -> dict:
    room_id = uuid.uuid4().hex[:8]
    return {"room_id": room_id,
            "ws_url": f"/api/advanced/collab/{room_id}",
            "phase": "Faz 34"}


# ══════════════════════════════════════════════════════════
# FAZ 35 — Akıllı Kod Tamamlama
# ══════════════════════════════════════════════════════════

class CompletionRequest(BaseModel):
    code: str                    # Şimdiye kadar yazılan kod
    cursor_line: int = -1        # İmleç satırı (0-tabanlı)
    language: str = "php"
    max_suggestions: int = 5
    context_files: list[str] = []  # İlgili diğer dosya içerikleri


@router.post("/complete")
async def smart_complete(req: CompletionRequest) -> dict:
    """LSP benzeri akıllı kod tamamlama — Faz 35."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil", "suggestions": []}

    # İmleç konumuna kadar olan kodu al
    lines = req.code.splitlines()
    cursor = req.cursor_line if req.cursor_line >= 0 else len(lines) - 1
    prefix = "\n".join(lines[:cursor + 1])
    suffix = "\n".join(lines[cursor + 1:]) if cursor + 1 < len(lines) else ""

    ctx = ""
    if req.context_files:
        ctx = "\n\n# İlgili dosyalar:\n" + "\n".join(req.context_files[:2])[:1500]

    prompt = (
        f"Kod tamamlama. Dil: {req.language}\n"
        f"```{req.language}\n{prefix}<|CURSOR|>{suffix}\n```{ctx}\n\n"
        f"<|CURSOR|> yerine gelebilecek {req.max_suggestions} farklı tamamlamayı "
        f"JSON listesi olarak ver:\n"
        f'[{{"label": "kısa açıklama", "insert": "eklenecek kod", "detail": "açıklama"}}]'
    )
    msgs = [{"role": "user", "content": prompt}]
    raw = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=400, temperature=0.2)):
        raw += tok

    suggestions = []
    try:
        m = re.search(r'\[.*\]', raw, re.DOTALL)
        if m:
            import json
            suggestions = json.loads(m.group(0))[:req.max_suggestions]
    except Exception:
        # Fallback: satır bazlı parse
        for line in raw.splitlines():
            if '"insert"' in line:
                m2 = re.search(r'"insert":\s*"([^"]+)"', line)
                if m2:
                    suggestions.append({"label": "tamamlama", "insert": m2.group(1)})

    return {
        "suggestions": suggestions,
        "cursor_line": cursor,
        "language": req.language,
        "phase": "Faz 35",
    }


class InlineCompleteRequest(BaseModel):
    prefix: str        # İmlecin solundaki metin
    suffix: str = ""   # İmlecin sağındaki metin (FIM - fill in the middle)
    language: str = "php"


@router.post("/complete/inline")
async def inline_complete(req: InlineCompleteRequest) -> dict:
    """FIM (Fill-In-the-Middle) tamamlama — Faz 35."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil", "completion": ""}

    msgs = [
        {"role": "system", "content":
         f"Sen bir {req.language} kod tamamlayıcısısın. "
         "Sadece eksik kodu yaz, açıklama yapma."},
        {"role": "user", "content":
         f"Bu kodu tamamla:\n```\n{req.prefix[-800:]}"
         f"\n[BURAYA_YAZ]\n{req.suffix[:200]}\n```"},
    ]
    completion = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(
            max_tokens=150, temperature=0.15)):
        completion += tok

    # Kod bloğunu temizle
    completion = re.sub(r"```\w*\n?|```", "", completion).strip()
    # Suffix zaten varsa tekrarı kes
    if req.suffix and completion.endswith(req.suffix[:20]):
        completion = completion[:-len(req.suffix[:20])].rstrip()

    return {"completion": completion, "phase": "Faz 35"}


# ══════════════════════════════════════════════════════════
# FAZ 36 — Otomatik Docstring / Belgeleme Üretici
# ══════════════════════════════════════════════════════════

class DocstringRequest(BaseModel):
    code: str
    language: str = "python"   # python | php | js | typescript
    style: str = "google"       # google | numpy | sphinx | phpdoc | jsdoc


_DOCSTRING_STYLES = {
    "google": "Google Python style docstring (Args:, Returns:, Raises:)",
    "numpy":  "NumPy/SciPy style docstring",
    "sphinx": "Sphinx/reStructuredText format (:param:, :type:, :returns:)",
    "phpdoc": "PHPDoc format (/** @param, @return, @throws */)",
    "jsdoc":  "JSDoc format (/** @param {type} name - desc */)",
}


@router.post("/docstring")
async def generate_docstring(req: DocstringRequest) -> dict:
    """Her fonksiyon/sınıf için otomatik docstring — Faz 36."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil", "documented_code": req.code}

    style_desc = _DOCSTRING_STYLES.get(req.style, _DOCSTRING_STYLES["google"])
    msgs = [
        {"role": "system", "content":
         f"Sen {req.language} belgeleme uzmanısın. "
         f"Koda {style_desc} ekle. Sadece belgelenmiş kodu döndür."},
        {"role": "user", "content":
         f"Bu {req.language} koduna docstring ekle:\n\n"
         f"```{req.language}\n{req.code[:4000]}\n```\n\n"
         f"Her fonksiyon/metod/sınıf için {style_desc} formatında docstring ekle. "
         "Orijinal kodu değiştirme, sadece dokümantasyon ekle."},
    ]
    result = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=2000, temperature=0.2)):
        result += tok

    # Kod bloğunu çıkar
    m = re.search(rf"```{req.language}\n(.*?)```", result, re.DOTALL)
    documented = m.group(1).strip() if m else result.strip()

    # Kaç docstring eklendi say
    if req.language == "python":
        count = len(re.findall(r'"""', documented)) // 2
    elif req.language == "php":
        count = len(re.findall(r'/\*\*', documented))
    else:
        count = len(re.findall(r'/\*\*|"""', documented))

    return {
        "documented_code": documented,
        "docstrings_added": count,
        "style": req.style,
        "language": req.language,
        "phase": "Faz 36",
    }


@router.post("/docstring/batch")
async def batch_docstring(req: BaseModel) -> dict:
    return {"message": "/docstring endpoint'ini kullanın", "phase": "Faz 36"}
