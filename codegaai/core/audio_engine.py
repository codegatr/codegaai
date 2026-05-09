"""
codegaai.core.audio_engine
============================

Ses motoru — iki alt motor:

1. **TTSEngine**: metin → ses
   - XTTS v2 (Coqui, çok dilli, ses kopyalama)
   - Piper (hafif Türkçe-only)

2. **ASREngine**: ses → metin
   - faster-whisper (CTranslate2 ile hızlandırılmış Whisper)

Tüm import'lar lazy. Çıktılar `data/outputs/audio/` altına yazılır.

Kullanım:

    tts = TTSEngine.get()
    tts.load("xtts-v2")
    out = tts.synthesize("Merhaba dünya", language="tr")
    # out["path"] -> .wav dosyası

    asr = ASREngine.get()
    asr.load("faster-whisper-large-v3")
    text = asr.transcribe("/path/to/audio.wav", language="tr")
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from codegaai.config import OUTPUTS_DIR
from codegaai.core.models_registry import ModelRegistry
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

AUDIO_OUTPUT_DIR = OUTPUTS_DIR / "audio"


@dataclass
class TTSStatus:
    state: str = "unloaded"
    model_id: Optional[str] = None
    backend: Optional[str] = None
    languages: list[str] = None  # type: ignore
    loaded_at: Optional[float] = None
    error: Optional[str] = None


@dataclass
class ASRStatus:
    state: str = "unloaded"
    model_id: Optional[str] = None
    backend: Optional[str] = None
    loaded_at: Optional[float] = None
    error: Optional[str] = None


# ============================================================
# TTS Engine
# ============================================================

class TTSEngine:
    """Tek instance'lı TTS motoru. Singleton."""

    _instance: Optional["TTSEngine"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        self._tts: Any = None
        self._kind: Optional[str] = None       # "xtts" | "piper"
        self._status = TTSStatus()
        self._gen_lock = threading.Lock()
        AUDIO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def get(cls) -> "TTSEngine":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def is_ready(self) -> bool:
        return self._status.state == "ready"

    @property
    def status(self) -> dict[str, Any]:
        s = self._status
        return {
            "state": s.state,
            "model_id": s.model_id,
            "backend": s.backend,
            "languages": s.languages or [],
            "loaded_at": s.loaded_at,
            "error": s.error,
            "ready": self.is_ready,
        }

    def load(self, model_id: str) -> None:
        registry = ModelRegistry.get()
        spec = registry.get_audio_spec(model_id)
        if not spec or spec.kind != "tts":
            raise ValueError(f"Bilinmeyen TTS modeli: {model_id}")

        if not registry.is_audio_downloaded(model_id):
            raise RuntimeError(
                f"TTS modeli henüz indirilmedi: {model_id}. "
                f"/api/models/{model_id}/download çağrısı yapın."
            )

        path = registry.audio_dir_path(model_id)
        log.info("TTS yükleniyor: %s", model_id)

        self._unload_internal()
        self._status = TTSStatus(state="loading", model_id=model_id)

        try:
            if model_id == "xtts-v2":
                self._load_xtts(path)
                self._kind = "xtts"
                backend = "cuda" if self._has_cuda() else "cpu"
                languages = list(spec.languages)
            elif model_id.startswith("piper-"):
                self._load_piper(path)
                self._kind = "piper"
                backend = "cpu"
                languages = list(spec.languages)
            else:
                raise ValueError(f"Desteklenmeyen TTS: {model_id}")

            self._status = TTSStatus(
                state="ready", model_id=model_id, backend=backend,
                languages=languages, loaded_at=time.time(),
            )
            log.info("TTS hazır: %s [%s]", model_id, backend)

        except Exception as exc:
            log.exception("TTS yüklemesi başarısız: %s", exc)
            self._status = TTSStatus(
                state="error", model_id=model_id, error=str(exc),
            )
            raise

    @staticmethod
    def _has_cuda() -> bool:
        try:
            import torch  # type: ignore[import-not-found]
            return torch.cuda.is_available()
        except Exception:
            return False

    def _load_xtts(self, path: Path) -> None:
        from TTS.api import TTS  # type: ignore[import-not-found]
        device = "cuda" if self._has_cuda() else "cpu"
        # XTTS yerel yoldan yüklenir
        self._tts = TTS(
            model_path=str(path),
            config_path=str(path / "config.json"),
        ).to(device)

    def _load_piper(self, path: Path) -> None:
        from piper import PiperVoice  # type: ignore[import-not-found]
        # Piper .onnx model dosyası bekler
        onnx_files = list(path.glob("*.onnx"))
        if not onnx_files:
            raise RuntimeError(f"Piper .onnx modeli bulunamadı: {path}")
        self._tts = PiperVoice.load(str(onnx_files[0]))

    def unload(self) -> None:
        with self._gen_lock:
            self._unload_internal()

    def _unload_internal(self) -> None:
        if self._tts is not None:
            try:
                del self._tts
            except Exception:
                pass
            self._tts = None
        self._kind = None
        self._status = TTSStatus()
        try:
            import gc
            gc.collect()
            try:
                import torch  # type: ignore[import-not-found]
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
        except Exception:
            pass

    # ---- üretim ----

    def synthesize(self, text: str,
                   language: str = "tr",
                   speaker_wav: Optional[str] = None,
                   speaker: Optional[str] = None) -> dict[str, Any]:
        """
        Metni sese çevir.

        Args:
            text: Sentezlenecek metin
            language: Dil kodu (XTTS için)
            speaker_wav: Ses kopyalama için referans dosya yolu (XTTS)
            speaker: Önceden tanımlı konuşmacı id'si
        """
        if not self.is_ready:
            raise RuntimeError("TTS motoru yüklü değil.")
        if not text.strip():
            raise ValueError("Metin boş olamaz.")

        with self._gen_lock:
            t0 = time.time()
            file_id = f"{int(time.time())}-{uuid.uuid4().hex[:8]}"
            out_path = AUDIO_OUTPUT_DIR / f"tts-{file_id}.wav"

            try:
                if self._kind == "xtts":
                    self._tts.tts_to_file(
                        text=text,
                        file_path=str(out_path),
                        language=language,
                        speaker_wav=speaker_wav,
                        speaker=speaker,
                    )
                elif self._kind == "piper":
                    import wave
                    with wave.open(str(out_path), "wb") as wf:
                        self._tts.synthesize(text, wf)
                else:
                    raise RuntimeError(f"Bilinmeyen TTS türü: {self._kind}")

                elapsed_ms = int((time.time() - t0) * 1000)
                size_bytes = out_path.stat().st_size

                return {
                    "id": file_id,
                    "path": str(out_path),
                    "filename": out_path.name,
                    "url": f"/outputs/audio/{out_path.name}",
                    "duration_estimate_sec": len(text.split()) / 2.5,
                    "size_bytes": size_bytes,
                    "model": self._status.model_id,
                    "language": language,
                    "timing_ms": elapsed_ms,
                }
            except Exception:
                # Yarım dosyayı temizle
                if out_path.exists():
                    out_path.unlink()
                raise


# ============================================================
# ASR Engine
# ============================================================

class ASREngine:
    """Tek instance'lı ASR (konuşma → metin) motoru. Singleton."""

    _instance: Optional["ASREngine"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        self._whisper: Any = None
        self._status = ASRStatus()
        self._lock = threading.Lock()

    @classmethod
    def get(cls) -> "ASREngine":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def is_ready(self) -> bool:
        return self._status.state == "ready"

    @property
    def status(self) -> dict[str, Any]:
        s = self._status
        return {
            "state": s.state,
            "model_id": s.model_id,
            "backend": s.backend,
            "loaded_at": s.loaded_at,
            "error": s.error,
            "ready": self.is_ready,
        }

    def load(self, model_id: str) -> None:
        registry = ModelRegistry.get()
        spec = registry.get_audio_spec(model_id)
        if not spec or spec.kind != "asr":
            raise ValueError(f"Bilinmeyen ASR modeli: {model_id}")

        if not registry.is_audio_downloaded(model_id):
            raise RuntimeError(
                f"ASR modeli henüz indirilmedi: {model_id}. "
                f"/api/models/{model_id}/download çağrısı yapın."
            )

        path = registry.audio_dir_path(model_id)
        log.info("ASR yükleniyor: %s", model_id)

        self._unload_internal()
        self._status = ASRStatus(state="loading", model_id=model_id)

        try:
            from faster_whisper import WhisperModel  # type: ignore[import-not-found]

            try:
                import torch  # type: ignore[import-not-found]
                cuda = torch.cuda.is_available()
            except Exception:
                cuda = False

            device = "cuda" if cuda else "cpu"
            compute_type = "float16" if cuda else "int8"

            self._whisper = WhisperModel(
                str(path),
                device=device,
                compute_type=compute_type,
            )

            self._status = ASRStatus(
                state="ready", model_id=model_id, backend=device,
                loaded_at=time.time(),
            )
            log.info("ASR hazır: %s [%s, %s]", model_id, device, compute_type)

        except Exception as exc:
            log.exception("ASR yüklemesi başarısız: %s", exc)
            self._status = ASRStatus(
                state="error", model_id=model_id, error=str(exc),
            )
            raise

    def unload(self) -> None:
        with self._lock:
            self._unload_internal()

    def _unload_internal(self) -> None:
        if self._whisper is not None:
            try:
                del self._whisper
            except Exception:
                pass
            self._whisper = None
        self._status = ASRStatus()
        try:
            import gc
            gc.collect()
            try:
                import torch  # type: ignore[import-not-found]
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
        except Exception:
            pass

    def transcribe(self, audio_path: str,
                   language: Optional[str] = None,
                   task: str = "transcribe") -> dict[str, Any]:
        """
        Sesi metne çevir.

        Args:
            audio_path: ses dosyası yolu (.wav, .mp3, .m4a vs)
            language: dil kodu (None = otomatik tespit)
            task: "transcribe" veya "translate" (İngilizceye çevir)
        """
        if not self.is_ready:
            raise RuntimeError("ASR motoru yüklü değil.")

        with self._lock:
            t0 = time.time()
            segments_iter, info = self._whisper.transcribe(
                audio_path,
                language=language,
                task=task,
                beam_size=5,
                vad_filter=True,
            )

            segments = []
            full_text_parts = []
            for seg in segments_iter:
                segments.append({
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "text": seg.text.strip(),
                })
                full_text_parts.append(seg.text)

            elapsed_ms = int((time.time() - t0) * 1000)

            return {
                "text": "".join(full_text_parts).strip(),
                "language": info.language,
                "language_probability": round(info.language_probability, 3),
                "duration_sec": round(info.duration, 2),
                "segments": segments,
                "model": self._status.model_id,
                "timing_ms": elapsed_ms,
            }
