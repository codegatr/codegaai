"""
codegaai.api.routes.intelligence
==================================

Faz 46 — Kod Çoğaltma Tespiti       Duplicate code finder (clone detection)
Faz 47 — Çoklu Model Karşılaştırma  Aynı soruyu farklı modellere sor, karşılaştır
Faz 48 — Öğrenme Asistanı           Flashcard, quiz, spaced repetition
"""
from __future__ import annotations

import hashlib, json, re, time, uuid
from collections import defaultdict
from fastapi import APIRouter
from pydantic import BaseModel
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


# ══════════════════════════════════════════════════════════
# FAZ 46 — Kod Çoğaltma Tespiti (Clone Detection)
# ══════════════════════════════════════════════════════════

def _normalize_line(line: str, lang: str) -> str:
    """Karşılaştırma için satırı normalize et."""
    line = line.strip()
    # Yorumları kaldır
    if lang == "python":
        line = re.sub(r"#.*", "", line)
    elif lang in ("php", "javascript", "typescript"):
        line = re.sub(r"//.*", "", line)
    # String literal'leri normalize et
    line = re.sub(r'"[^"]*"', '"STR"', line)
    line = re.sub(r"'[^']*'", "'STR'", line)
    # Değişken isimlerini normalize et (PHP)
    if lang == "php":
        line = re.sub(r"\$\w+", "$VAR", line)
    # Sayıları normalize et
    line = re.sub(r"\b\d+\b", "NUM", line)
    return line.strip()


def _extract_blocks(code: str, lang: str, min_lines: int = 4) -> list[dict]:
    """N satırlık blokları çıkar."""
    lines = [l for l in code.splitlines() if l.strip() and not l.strip().startswith(("#", "//", "/*", "*"))]
    blocks = []
    for i in range(len(lines) - min_lines + 1):
        block_lines = lines[i:i + min_lines]
        normalized  = [_normalize_line(l, lang) for l in block_lines]
        block_hash  = hashlib.md5("\n".join(normalized).encode()).hexdigest()
        blocks.append({
            "start_line": i + 1,
            "end_line":   i + min_lines,
            "hash":       block_hash,
            "content":    "\n".join(block_lines),
            "normalized": "\n".join(normalized),
        })
    return blocks


class DuplicateRequest(BaseModel):
    files: dict[str, str]   # {filename: content}
    language: str = "php"
    min_lines: int = 4       # Minimum klon uzunluğu
    threshold: float = 0.8   # Benzerlik eşiği


@router.post("/clones/detect")
async def detect_clones(req: DuplicateRequest) -> dict:
    """Tüm dosyalarda kod klonlarını tespit et — Faz 46."""
    # Tüm blokları çıkar
    all_blocks: list[dict] = []
    for fname, content in req.files.items():
        blocks = _extract_blocks(content, req.language, req.min_lines)
        for b in blocks:
            b["file"] = fname
        all_blocks.extend(blocks)

    # Hash'e göre grupla
    hash_groups: dict[str, list] = defaultdict(list)
    for block in all_blocks:
        hash_groups[block["hash"]].append(block)

    # 2+ dosyada aynı hash = klon
    clones = []
    for hash_val, group in hash_groups.items():
        if len(group) >= 2:
            # Farklı konumlar olduğunu doğrula
            locations = [(b["file"], b["start_line"]) for b in group]
            if len(set(locations)) >= 2:
                clones.append({
                    "type":      "exact",
                    "lines":     req.min_lines,
                    "count":     len(group),
                    "locations": [{"file": b["file"], "line": b["start_line"]} for b in group],
                    "sample":    group[0]["content"][:200],
                })

    # LLM ile önem sıralaması
    ai_summary = ""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if clones and engine.is_ready:
        top_clones = "\n".join(
            f"Klon {i+1}: {c['count']} yerde, {c['lines']} satır\n{c['sample'][:100]}"
            for i, c in enumerate(clones[:5])
        )
        msgs = [{"role": "user", "content":
                 f"Bu kod klonlarını değerlendir ve refactoring önerisi ver:\n{top_clones}\n\n"
                 "Hangi klonlar en kritik, nasıl birleştirilmeli? Kısa tut."}]
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=250, temperature=0.3)):
            ai_summary += tok

    # Kod tekrar oranı
    total_lines  = sum(len(c.splitlines()) for c in req.files.values())
    cloned_lines = sum(c["lines"] * (c["count"] - 1) for c in clones)
    duplication_ratio = round(cloned_lines / max(total_lines, 1) * 100, 1)

    return {
        "clones":             clones,
        "clone_count":        len(clones),
        "total_lines":        total_lines,
        "cloned_lines":       cloned_lines,
        "duplication_ratio":  duplication_ratio,
        "grade":              ("A" if duplication_ratio < 5 else
                               "B" if duplication_ratio < 15 else
                               "C" if duplication_ratio < 30 else "D"),
        "ai_suggestions":     ai_summary.strip(),
        "phase":              "Faz 46",
    }


@router.post("/clones/single-file")
async def detect_clones_single(req: BaseModel) -> dict:
    """Tek dosya içi tekrarlama tespiti — Faz 46."""
    return {"message": "clones/detect endpoint'ini kullanın", "phase": "Faz 46"}


# ══════════════════════════════════════════════════════════
# FAZ 47 — Çoklu Model Karşılaştırma
# ══════════════════════════════════════════════════════════

class MultiModelRequest(BaseModel):
    question: str
    models: list[str] = []      # Boş = mevcut tüm GGUF modeller
    temperature: float = 0.5
    max_tokens: int = 300
    compare_mode: str = "parallel"  # parallel | sequential


@router.post("/multimodel/compare")
async def multimodel_compare(req: MultiModelRequest) -> dict:
    """Aynı soruyu birden fazla modele sor, yanıtları karşılaştır — Faz 47."""
    from codegaai.core.models_registry import ModelRegistry
    from codegaai.core.engine import LLMEngine, GenerationConfig

    registry = ModelRegistry.get()
    engine   = LLMEngine.get()

    # Hangi modeller mevcut?
    available = [m.id for m in registry.llm_models if registry.is_llm_downloaded(m.id)]
    if not available:
        return {"error": "İndirilmiş model yok"}

    models_to_use = req.models if req.models else available[:3]  # Max 3
    models_to_use = [m for m in models_to_use if m in available][:3]

    if not models_to_use:
        models_to_use = available[:1]

    current_model = engine.status.get("model_id")
    cfg           = GenerationConfig(max_tokens=req.max_tokens, temperature=req.temperature)
    msgs          = [{"role": "user", "content": req.question}]
    responses     = {}
    timings       = {}

    for model_id in models_to_use:
        try:
            # Model gerekiyorsa yükle
            if engine.status.get("model_id") != model_id:
                engine.load(model_id)
            t0  = time.time()
            ans = ""
            for tok in engine.stream(msgs, cfg=cfg):
                ans += tok
            timings[model_id]   = round(time.time() - t0, 2)
            responses[model_id] = ans.strip()
        except Exception as e:
            responses[model_id] = f"Hata: {e}"
            timings[model_id]   = 0

    # Orijinal modeli geri yükle
    if current_model and current_model != engine.status.get("model_id"):
        try:
            engine.load(current_model)
        except Exception:
            pass

    # AI ile karşılaştırma özeti
    comparison = ""
    if len(responses) > 1 and engine.is_ready:
        resp_text = "\n\n".join(
            f"**{mid}:**\n{ans[:300]}" for mid, ans in responses.items()
        )
        sum_msgs = [{"role": "user", "content":
                     f"Bu yanıtları karşılaştır ve hangisinin daha iyi olduğunu söyle:\n\n"
                     f"Soru: {req.question}\n\n{resp_text}\n\n"
                     "Hangi model daha doğru, kapsamlı ve yararlı yanıt verdi? Kısa değerlendir."}]
        for tok in engine.stream(sum_msgs, cfg=GenerationConfig(max_tokens=200, temperature=0.3)):
            comparison += tok

    # Hız sıralama
    speed_rank = sorted(timings.keys(), key=lambda m: timings[m])

    return {
        "question":    req.question,
        "responses":   responses,
        "timings_sec": timings,
        "speed_rank":  speed_rank,
        "comparison":  comparison.strip(),
        "models_used": models_to_use,
        "phase":       "Faz 47",
    }


@router.get("/multimodel/available")
async def list_available_models() -> dict:
    """İndirilmiş modelleri listele — Faz 47."""
    from codegaai.core.models_registry import ModelRegistry
    reg = ModelRegistry.get()
    return {
        "models": [
            {"id": m.id, "name": m.name,
             "downloaded": reg.is_llm_downloaded(m.id),
             "size_gb": m.size_gb}
            for m in reg.llm_models
        ],
        "phase": "Faz 47",
    }


# ══════════════════════════════════════════════════════════
# FAZ 48 — Öğrenme Asistanı (Flashcard + Quiz)
# ══════════════════════════════════════════════════════════

from codegaai.config import DATA_DIR

FLASHCARD_FILE = DATA_DIR / "flashcards.json"
QUIZ_FILE      = DATA_DIR / "quiz_results.json"


def _load_cards() -> list:
    try:
        if FLASHCARD_FILE.exists():
            return json.loads(FLASHCARD_FILE.read_text("utf-8"))
    except Exception:
        pass
    return []


def _save_cards(cards: list) -> None:
    FLASHCARD_FILE.parent.mkdir(parents=True, exist_ok=True)
    FLASHCARD_FILE.write_text(json.dumps(cards, ensure_ascii=False, indent=2), "utf-8")


class FlashcardGenRequest(BaseModel):
    text: str             # Öğrenilecek metin
    count: int = 5        # Kaç kart
    language: str = "tr"  # Kart dili
    topic: str = ""


@router.post("/flashcards/generate")
async def generate_flashcards(req: FlashcardGenRequest) -> dict:
    """Metinden flashcard üret — Faz 48."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    msgs = [
        {"role": "system", "content":
         "Flashcard üreticisi. Sadece JSON döndür. Format: "
         '[{"front":"soru/terim","back":"cevap/açıklama","topic":"konu"}]'},
        {"role": "user", "content":
         f"Bu metinden {req.count} adet öğretici flashcard üret ({req.language}):\n\n"
         f"{req.text[:2000]}\n\n"
         f"Konu: {req.topic or 'genel'}"},
    ]
    raw = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=600, temperature=0.4)):
        raw += tok

    cards_new = []
    try:
        m = re.search(r'\[.*\]', raw, re.DOTALL)
        if m:
            cards_new = json.loads(m.group(0))[:req.count]
    except Exception:
        pass

    # Kart ID ekle ve kaydet
    existing = _load_cards()
    for card in cards_new:
        card["id"]         = uuid.uuid4().hex[:8]
        card["created_at"] = time.strftime("%Y-%m-%d")
        card["topic"]      = card.get("topic") or req.topic or "genel"
        card["review_count"]  = 0
        card["last_reviewed"] = ""
        card["difficulty"]    = "medium"   # easy | medium | hard
        existing.append(card)
    _save_cards(existing)

    return {"cards": cards_new, "total_cards": len(existing), "phase": "Faz 48"}


@router.get("/flashcards/list")
async def list_flashcards(topic: str = "", limit: int = 20) -> dict:
    cards = _load_cards()
    if topic:
        cards = [c for c in cards if c.get("topic", "").lower() == topic.lower()]
    # Spaced repetition: en az tekrar edilen önce
    cards.sort(key=lambda c: (c.get("review_count", 0), c.get("last_reviewed", "")))
    return {"cards": cards[:limit], "total": len(cards), "phase": "Faz 48"}


class ReviewRequest(BaseModel):
    card_id: str
    difficulty: str = "medium"   # easy | medium | hard


@router.post("/flashcards/review")
async def review_card(req: ReviewRequest) -> dict:
    """Kart gözden geçirme kaydı (spaced repetition) — Faz 48."""
    cards = _load_cards()
    for card in cards:
        if card.get("id") == req.card_id:
            card["review_count"]  = card.get("review_count", 0) + 1
            card["last_reviewed"] = time.strftime("%Y-%m-%d")
            card["difficulty"]    = req.difficulty
            break
    _save_cards(cards)
    return {"ok": True, "phase": "Faz 48"}


class QuizRequest(BaseModel):
    topic: str = ""
    count: int = 5


@router.post("/quiz/start")
async def start_quiz(req: QuizRequest) -> dict:
    """Flashcard'lardan quiz oluştur — Faz 48."""
    cards = _load_cards()
    if req.topic:
        cards = [c for c in cards if c.get("topic", "").lower() == req.topic.lower()]
    if not cards:
        return {"error": "Bu konuda kart yok. Önce /flashcards/generate ile kart oluşturun."}

    import random
    selected = random.sample(cards, min(req.count, len(cards)))
    quiz_id  = uuid.uuid4().hex[:8]

    # Yanlış cevaplar üret
    questions = []
    for card in selected:
        all_backs = [c["back"] for c in cards if c["id"] != card["id"]]
        wrong = random.sample(all_backs, min(3, len(all_backs))) if len(all_backs) >= 3 else []
        options = wrong + [card["back"]]
        random.shuffle(options)
        questions.append({
            "id":       card["id"],
            "question": card["front"],
            "options":  options,
            "correct":  card["back"],
        })

    return {
        "quiz_id":   quiz_id,
        "questions": questions,
        "count":     len(questions),
        "phase":     "Faz 48",
    }


class QuizAnswerRequest(BaseModel):
    quiz_id: str
    answers: dict[str, str]   # {card_id: seçilen_cevap}
    questions: list[dict]     # quiz sorularını geri gönder


@router.post("/quiz/submit")
async def submit_quiz(req: QuizAnswerRequest) -> dict:
    """Quiz cevaplarını değerlendir — Faz 48."""
    correct = 0
    wrong   = []
    for q in req.questions:
        given   = req.answers.get(q["id"], "")
        is_ok   = given.strip().lower() == q["correct"].strip().lower()
        if is_ok:
            correct += 1
        else:
            wrong.append({
                "question": q["question"],
                "your_answer": given,
                "correct":     q["correct"],
            })
        # Zorluk güncelle
        diff = "easy" if is_ok else "hard"
        await review_card(ReviewRequest(card_id=q["id"], difficulty=diff))

    total = len(req.questions)
    score = round(correct / max(total, 1) * 100)
    return {
        "score":       score,
        "correct":     correct,
        "total":       total,
        "wrong":       wrong,
        "grade":       ("A" if score >= 90 else "B" if score >= 70 else
                        "C" if score >= 50 else "D"),
        "phase":       "Faz 48",
    }
