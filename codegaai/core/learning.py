"""
codegaai.core.learning
=======================

Self-Learning altyapısı (Faz 7):

1. **FeedbackStore**: kullanıcının mesajlara verdiği 👍/👎 tepkilerini
   SQLite'ta saklar. Eğitim için tercih çiftleri üretmek için tercih
   edilen ve reddedilen yanıt eşleştirmesi yapılır.

2. **AdapterManager**: data/adapters/ altındaki LoRA adapterlerini
   yönetir. Aktif adapter'i LLMEngine'e bağlar (hot-swap).

3. **DPOTrainer wrapper**: peft + trl ile DPO eğitimi başlatır.
   Lazy import — peft/trl/bitsandbytes yüklü değilse zarif uyarı.

Tüm modüller lazy import. Sandbox/CPU'da feedback toplama + adapter
listeleme calisir, gercek training kullanicinin GPU'sunda olur.
"""

from __future__ import annotations

import json
import shutil
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

LEARNING_DIR = DATA_DIR / "learning"
ADAPTERS_DIR = DATA_DIR / "adapters"
FEEDBACK_DB = LEARNING_DIR / "feedback.db"
MIN_DPO_PAIRS = 100


# ============================================================
# FeedbackStore
# ============================================================

@dataclass
class Feedback:
    id: int
    chat_id: int
    message_id: int
    rating: int             # +1 begeni, -1 begenmeme
    note: str
    user_message: str       # baglam icin
    assistant_message: str  # neye reaction verildi
    model_id: Optional[str]
    created_at: float


class FeedbackStore:
    """Kullanıcı feedback'i SQLite'ta saklar."""

    _instance: Optional["FeedbackStore"] = None
    _lock = threading.Lock()

    SCHEMA = """
    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
        note TEXT DEFAULT '',
        user_message TEXT DEFAULT '',
        assistant_message TEXT NOT NULL,
        model_id TEXT,
        created_at REAL NOT NULL,
        UNIQUE(chat_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_rating
        ON feedback(rating);
    CREATE INDEX IF NOT EXISTS idx_feedback_chat
        ON feedback(chat_id);
    """

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = db_path or FEEDBACK_DB
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn_lock = threading.Lock()
        self._init_schema()

    @classmethod
    def open(cls) -> "FeedbackStore":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_schema(self) -> None:
        with self._conn_lock, self._connect() as conn:
            conn.executescript(self.SCHEMA)

    def add(self, chat_id: int, message_id: int, rating: int,
            user_message: str = "", assistant_message: str = "",
            note: str = "", model_id: Optional[str] = None) -> int:
        if rating not in (-1, 1):
            raise ValueError("rating sadece -1 veya +1 olabilir")

        with self._conn_lock, self._connect() as conn:
            # UPSERT: aynı mesaja yeniden feedback verilirse güncelle
            cur = conn.execute("""
                INSERT INTO feedback
                    (chat_id, message_id, rating, note,
                     user_message, assistant_message, model_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(chat_id, message_id) DO UPDATE SET
                    rating = excluded.rating,
                    note = excluded.note,
                    created_at = excluded.created_at
                RETURNING id
            """, (chat_id, message_id, rating, note,
                  user_message, assistant_message, model_id, time.time()))
            row = cur.fetchone()
            return int(row["id"])

    def remove(self, chat_id: int, message_id: int) -> bool:
        with self._conn_lock, self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM feedback WHERE chat_id=? AND message_id=?",
                (chat_id, message_id),
            )
            return cur.rowcount > 0

    def get(self, chat_id: int, message_id: int) -> Optional[Feedback]:
        with self._conn_lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM feedback WHERE chat_id=? AND message_id=?",
                (chat_id, message_id),
            ).fetchone()
            if not row:
                return None
            return Feedback(**dict(row))

    def list_recent(self, limit: int = 50,
                     rating: Optional[int] = None) -> list[Feedback]:
        with self._conn_lock, self._connect() as conn:
            if rating is not None:
                rows = conn.execute(
                    "SELECT * FROM feedback WHERE rating=? "
                    "ORDER BY created_at DESC LIMIT ?",
                    (rating, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM feedback "
                    "ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [Feedback(**dict(r)) for r in rows]

    def stats(self) -> dict[str, int]:
        with self._conn_lock, self._connect() as conn:
            row = conn.execute("""
                SELECT
                    SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) AS likes,
                    SUM(CASE WHEN rating=-1 THEN 1 ELSE 0 END) AS dislikes,
                    COUNT(*) AS total,
                    COUNT(DISTINCT chat_id) AS chats
                FROM feedback
            """).fetchone()
            return {
                "likes": int(row["likes"] or 0),
                "dislikes": int(row["dislikes"] or 0),
                "total": int(row["total"] or 0),
                "chats_with_feedback": int(row["chats"] or 0),
            }

    def export_dpo_dataset(self, min_pairs: int = MIN_DPO_PAIRS) -> dict[str, Any]:
        """
        DPO için tercih çiftleri üret.

        Aynı kullanıcı mesajı için bir 👍 bir 👎 yanıt varsa, bunları
        eşleştir (chosen=👍, rejected=👎). Bu çiftler eğitim verisi.

        Yetersiz veri varsa (min_pairs altında) uyarı döner.
        """
        with self._conn_lock, self._connect() as conn:
            rows = conn.execute("""
                SELECT user_message, assistant_message, rating
                FROM feedback
                WHERE user_message != ''
                ORDER BY created_at ASC
            """).fetchall()

        # Aynı user_message için chosen/rejected eşleşmesi
        by_prompt: dict[str, dict[str, list[str]]] = {}
        for r in rows:
            key = r["user_message"].strip()
            bucket = by_prompt.setdefault(key, {"chosen": [], "rejected": []})
            if r["rating"] > 0:
                bucket["chosen"].append(r["assistant_message"])
            else:
                bucket["rejected"].append(r["assistant_message"])

        pairs: list[dict[str, str]] = []
        for prompt, bucket in by_prompt.items():
            if bucket["chosen"] and bucket["rejected"]:
                # En son chosen/en son rejected
                pairs.append({
                    "prompt": prompt,
                    "chosen": bucket["chosen"][-1],
                    "rejected": bucket["rejected"][-1],
                })

        return {
            "pair_count": len(pairs),
            "min_required": min_pairs,
            "ready_for_training": len(pairs) >= min_pairs,
            "pairs": pairs,
        }


# ============================================================
# AdapterManager (LoRA adapter yönetimi)
# ============================================================

@dataclass
class Adapter:
    id: str
    name: str
    base_model: str
    path: str
    size_mb: float
    created_at: float
    active: bool = False
    description: str = ""


class AdapterManager:
    """Yerel LoRA adapter dizinini yönetir."""

    _instance: Optional["AdapterManager"] = None
    _lock = threading.Lock()

    METADATA_FILE = "adapter_meta.json"
    ACTIVE_FILE = "active.txt"

    def __init__(self) -> None:
        self.adapters_dir = ADAPTERS_DIR
        self.adapters_dir.mkdir(parents=True, exist_ok=True)
        self._active_id: Optional[str] = self._read_active()

    @classmethod
    def get(cls) -> "AdapterManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _adapter_path(self, adapter_id: str) -> Path:
        return self.adapters_dir / adapter_id

    def _meta_path(self, adapter_id: str) -> Path:
        return self._adapter_path(adapter_id) / self.METADATA_FILE

    def _active_path(self) -> Path:
        return self.adapters_dir / self.ACTIVE_FILE

    def _read_active(self) -> Optional[str]:
        p = self._active_path()
        if p.exists():
            return p.read_text(encoding="utf-8").strip() or None
        return None

    def _write_active(self, adapter_id: Optional[str]) -> None:
        p = self._active_path()
        if adapter_id is None:
            if p.exists():
                p.unlink()
        else:
            p.write_text(adapter_id, encoding="utf-8")
        self._active_id = adapter_id

    def list(self) -> list[Adapter]:
        items: list[Adapter] = []
        if not self.adapters_dir.exists():
            return items

        for d in sorted(self.adapters_dir.iterdir()):
            if not d.is_dir():
                continue
            meta_p = self._meta_path(d.name)
            if not meta_p.exists():
                continue
            try:
                meta = json.loads(meta_p.read_text(encoding="utf-8"))
                size_mb = sum(p.stat().st_size for p in d.rglob("*")
                              if p.is_file()) / (1024 ** 2)
                items.append(Adapter(
                    id=d.name,
                    name=meta.get("name", d.name),
                    base_model=meta.get("base_model", "?"),
                    path=str(d),
                    size_mb=round(size_mb, 1),
                    created_at=meta.get("created_at", 0),
                    active=(d.name == self._active_id),
                    description=meta.get("description", ""),
                ))
            except Exception as exc:
                log.warning("Adapter okunamadı %s: %s", d.name, exc)

        return items

    def find(self, adapter_id: str) -> Optional[Adapter]:
        for a in self.list():
            if a.id == adapter_id:
                return a
        return None

    def register(self, adapter_id: str, name: str, base_model: str,
                  description: str = "") -> None:
        """Mevcut bir adapter klasörüne metadata yaz."""
        d = self._adapter_path(adapter_id)
        d.mkdir(parents=True, exist_ok=True)
        meta = {
            "id": adapter_id,
            "name": name,
            "base_model": base_model,
            "description": description,
            "created_at": time.time(),
        }
        self._meta_path(adapter_id).write_text(
            json.dumps(meta, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        log.info("Adapter kaydedildi: %s", adapter_id)

    def delete(self, adapter_id: str) -> bool:
        d = self._adapter_path(adapter_id)
        if not d.exists():
            return False
        if self._active_id == adapter_id:
            self._write_active(None)
        shutil.rmtree(d)
        log.info("Adapter silindi: %s", adapter_id)
        return True

    def activate(self, adapter_id: Optional[str]) -> Optional[str]:
        """Adapter aktif et (hot-swap). None = devre dışı bırak."""
        if adapter_id is not None:
            if not self._adapter_path(adapter_id).exists():
                raise ValueError(f"Adapter bulunamadı: {adapter_id}")
        self._write_active(adapter_id)

        # LLMEngine yüklüyse hot-swap dene
        try:
            from codegaai.core.engine import LLMEngine
            engine = LLMEngine.get()
            if engine.is_ready and adapter_id is not None:
                # llama-cpp-python LoRA hot-swap için API var
                # (load_lora_from_file). Eğer model yüklüyken çağrılırsa
                # güvenli olmaz; en doğru yol modeli yeniden yüklemek.
                log.info(
                    "Adapter aktif edildi: %s. Etkili olması için "
                    "modeli unload/load yapın.", adapter_id
                )
        except Exception:
            pass

        return adapter_id

    @property
    def active_id(self) -> Optional[str]:
        return self._active_id


# ============================================================
# Training (DPO + LoRA) wrapper
# ============================================================

@dataclass
class TrainingStatus:
    state: str = "idle"   # idle | training | completed | error
    job_id: Optional[str] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    progress: float = 0.0
    message: str = ""
    error: Optional[str] = None


class TrainingEngine:
    """DPO + LoRA training wrapper. Lazy import peft + trl + bitsandbytes."""

    _instance: Optional["TrainingEngine"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._status = TrainingStatus()
        self._train_lock = threading.Lock()
        self._cancel = threading.Event()

    @classmethod
    def get(cls) -> "TrainingEngine":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def status(self) -> dict[str, Any]:
        s = self._status
        return {
            "state": s.state,
            "job_id": s.job_id,
            "started_at": s.started_at,
            "completed_at": s.completed_at,
            "progress": s.progress,
            "message": s.message,
            "error": s.error,
        }

    @property
    def is_training(self) -> bool:
        return self._status.state == "training"

    @staticmethod
    def check_dependencies() -> dict[str, bool]:
        """peft + trl + bitsandbytes mevcut mu?"""
        deps = {}
        for mod in ("peft", "trl", "bitsandbytes", "datasets"):
            try:
                __import__(mod)
                deps[mod] = True
            except ImportError:
                deps[mod] = False
        return deps

    def start_dpo(self, base_model_id: str,
                   pairs: list[dict[str, str]],
                   adapter_name: str,
                   epochs: int = 1,
                   learning_rate: float = 5e-5) -> str:
        """
        DPO training'i arka thread'de başlat.

        Args:
            base_model_id: Eğitim taban model id (LLM registry'den)
            pairs: [{prompt, chosen, rejected}, ...] tercih çiftleri
            adapter_name: Üretilecek LoRA adapter'in görünen adı
            epochs: Eğitim epoch sayısı
            learning_rate: Öğrenme oranı

        Returns:
            job_id

        Raises:
            RuntimeError: peft/trl yüklü değilse veya zaten eğitim varsa
        """
        if self.is_training:
            raise RuntimeError("Zaten bir eğitim çalışıyor")

        deps = self.check_dependencies()
        missing = [k for k, v in deps.items() if not v]
        if missing:
            raise RuntimeError(
                f"Eğitim için gerekli kütüphaneler eksik: {missing}. "
                f"pip install peft trl bitsandbytes datasets"
            )

        if len(pairs) < MIN_DPO_PAIRS:
            raise RuntimeError(
                f"Güvenli DPO eğitimi için en az {MIN_DPO_PAIRS} tercih çifti gerekli "
                f"(mevcut: {len(pairs)}). Daha fazla kaliteli 👍/👎 topladıktan sonra deneyin."
            )

        job_id = f"dpo-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        self._cancel.clear()
        self._status = TrainingStatus(
            state="training", job_id=job_id,
            started_at=time.time(), progress=0.0,
            message="Hazırlanıyor...",
        )

        thread = threading.Thread(
            target=self._train_worker,
            args=(base_model_id, pairs, adapter_name, epochs, learning_rate, job_id),
            daemon=True, name=job_id,
        )
        thread.start()
        return job_id

    def cancel(self) -> bool:
        if not self.is_training:
            return False
        self._cancel.set()
        return True

    def _train_worker(self, base_model_id: str,
                       pairs: list[dict[str, str]],
                       adapter_name: str,
                       epochs: int, lr: float,
                       job_id: str) -> None:
        """
        Gerçek DPO eğitimi. Bu kod GPU + 16+ GB VRAM gerektirir.
        Sandbox'ta peft/trl/bnb yoksa zaten check_dependencies'te yakalanır.
        """
        try:
            self._status.message = "Bağımlılıklar yükleniyor..."

            import torch  # type: ignore[import-not-found]
            from datasets import Dataset  # type: ignore[import-not-found]
            from peft import LoraConfig, get_peft_model  # type: ignore[import-not-found]
            from transformers import AutoTokenizer, AutoModelForCausalLM  # type: ignore[import-not-found]
            from trl import DPOTrainer, DPOConfig  # type: ignore[import-not-found]

            self._status.message = "Taban model yükleniyor..."
            self._status.progress = 0.1

            # NOT: GGUF tabanlı modeller doğrudan transformers'la
            # eğitilemez. Eğitim için orijinal HF (safetensors) sürümü
            # gerekir. Kullanıcıya bunu bildiren bir uyarı:
            log.warning(
                "DPO eğitimi safetensors taban modeli gerektirir, "
                "GGUF değil. Bu sürüm prototip."
            )

            # Veriseti
            ds = Dataset.from_list(pairs)
            self._status.progress = 0.2
            self._status.message = f"{len(pairs)} çiftle eğitime başlanıyor..."

            deps = self.check_dependencies()
            all_ok = all(deps.values())

            if all_ok:
                # GERÇEK DPO TRAINING
                log.info("Gerçek DPO training başlıyor: %s pairs, %s epochs",
                         len(pairs), epochs)
                adapter_id = self._run_real_training(
                    pairs, adapter_name, base_model_id, epochs, batch_size=1,
                )
            else:
                # Bağımlılık eksik → feedback'i kaydet, eğitim atla
                missing = [k for k, v in deps.items() if not v]
                log.warning("Training atlandı — eksik bağımlılıklar: %s", missing)
                adapter_id = f"adapter-{int(time.time())}-{uuid.uuid4().hex[:6]}"
                mgr = AdapterManager.get()
                mgr.register(
                    adapter_id=adapter_id,
                    name=adapter_name,
                    base_model=base_model_id,
                    description=(
                        f"{len(pairs)} çift kaydedildi (eğitim atlandı: "
                        f"eksik {missing}). Gerçek eğitim için: "
                        "pip install peft trl bitsandbytes"
                    ),
                )

            self._status = TrainingStatus(
                state="completed", job_id=job_id,
                started_at=self._status.started_at,
                completed_at=time.time(),
                progress=1.0,
                message=(f"Tamamlandı. Adapter: {adapter_id}. "
                         f"{'Gerçek LoRA eğitimi çalıştırıldı.' if all_ok else 'Veri kaydedildi.'}"),
            )

        except Exception as exc:
            log.exception("Training hatası: %s", exc)
            self._status = TrainingStatus(
                state="error", job_id=job_id,
                started_at=self._status.started_at,
                completed_at=time.time(),
                error=str(exc),
            )

    def _run_real_training(
        self,
        pairs: list[dict],
        adapter_name: str,
        base_model_id: str,
        epochs: int,
        batch_size: int,
    ) -> str:
        """
        Gerçek LoRA/DPO eğitimi — peft + trl kullanır.

        Akış:
        1. DPO dataset oluştur (chosen/rejected çiftleri)
        2. Taban modeli 4-bit quantization ile yükle (bitsandbytes)
        3. LoRA config ayarla
        4. DPOTrainer ile eğit
        5. Adapter'ı kaydet
        """
        import uuid

        from peft import LoraConfig, get_peft_model, TaskType  # type: ignore
        from trl import DPOTrainer, DPOConfig  # type: ignore
        from transformers import (  # type: ignore
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
        )
        from datasets import Dataset  # type: ignore
        import torch

        # Model ID → HF repo adı
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        spec = reg.get_llm_spec(base_model_id)
        hf_repo = spec.hf_repo if spec else "Qwen/Qwen2.5-7B-Instruct"

        adapter_id = f"adapter-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        adapter_dir = AdapterManager.get().adapters_dir / adapter_id
        adapter_dir.mkdir(parents=True, exist_ok=True)

        log.info("LoRA eğitimi: model=%s, adapter=%s, pairs=%d",
                 hf_repo, adapter_id, len(pairs))

        # 4-bit quantization config
        bnb_config = None
        if torch.cuda.is_available():
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,
            )

        cache_dir = str(DATA_DIR / "cache" / "huggingface")

        # Taban modeli yükle (sadece adapter eğitimi için safetensors)
        self._status.message = "Taban model yükleniyor (safetensors)..."
        self._status.progress = 0.1
        tokenizer = AutoTokenizer.from_pretrained(hf_repo, cache_dir=cache_dir)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForCausalLM.from_pretrained(
            hf_repo,
            quantization_config=bnb_config,
            device_map="auto" if torch.cuda.is_available() else "cpu",
            cache_dir=cache_dir,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        )

        # LoRA config
        lora_config = LoraConfig(
            task_type=TaskType.CAUSAL_LM,
            r=8,                     # rank (küçük = hızlı, büyük = daha iyi)
            lora_alpha=16,
            target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
            lora_dropout=0.1,
            bias="none",
        )

        # DPO Dataset hazırla
        dataset_dict = {
            "prompt":   [p.get("prompt", "")   for p in pairs],
            "chosen":   [p.get("chosen", "")   for p in pairs],
            "rejected": [p.get("rejected", "") for p in pairs],
        }
        dataset = Dataset.from_dict(dataset_dict)

        self._status.message = f"DPO eğitimi ({len(pairs)} çift, {epochs} epoch)..."
        self._status.progress = 0.3

        # DPO Training argümanları
        training_args = DPOConfig(
            output_dir=str(adapter_dir),
            num_train_epochs=epochs,
            per_device_train_batch_size=max(1, batch_size),
            gradient_accumulation_steps=4,
            learning_rate=5e-5,
            fp16=torch.cuda.is_available(),
            logging_steps=10,
            save_strategy="epoch",
            report_to="none",         # wandb vs. kapatıyoruz
            remove_unused_columns=False,
            beta=0.1,                 # DPO beta (preference strength)
        )

        trainer = DPOTrainer(
            model=model,
            ref_model=None,           # ref_model=None → implicit ref
            args=training_args,
            train_dataset=dataset,
            tokenizer=tokenizer,
            peft_config=lora_config,
        )

        # Eğit
        trainer.train()
        self._status.progress = 0.9

        # Kaydet
        trainer.save_model(str(adapter_dir))
        log.info("LoRA adapter kaydedildi: %s", adapter_dir)

        # Adapter kaydı
        AdapterManager.get().register(
            adapter_id=adapter_id,
            name=adapter_name,
            base_model=base_model_id,
            description=(
                f"DPO ile {len(pairs)} tercih çifti üzerinde eğitildi "
                f"({epochs} epoch). LoRA r=8, bitsandbytes 4-bit."
            ),
        )

        return adapter_id
