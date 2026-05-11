"""
codegaai.core.wake_word
=========================

Faz 26 — Wake Word Tespiti: "Hey CODEGA"

Arka planda mikrofonu dinler.
"Hey CODEGA" duyunca ses sohbetini başlatır.

Desteklenen backend'ler (öncelik sırasıyla):
  1. openwakeword  — açık kaynak, CPU
  2. pvporcupine   — Picovoice (ücretsiz tier)
  3. keyword_match — Whisper ile basit eşleşme (fallback)
"""

from __future__ import annotations

import threading
import time
from typing import Callable, Optional

from codegaai.utils.logger import get_logger

log = get_logger(__name__)


class WakeWordEngine:
    """Singleton wake word motoru."""

    _instance: Optional["WakeWordEngine"] = None
    _lock = threading.Lock()

    @classmethod
    def get(cls) -> "WakeWordEngine":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def __init__(self):
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._callback: Optional[Callable] = None
        self._backend = "none"
        self._detect_count = 0
        self._last_detect: Optional[float] = None

    # ── Backend Tespiti ───────────────────────────────────────────────────

    def _detect_backend(self) -> str:
        try:
            import openwakeword
            return "openwakeword"
        except ImportError:
            pass
        try:
            import pvporcupine
            return "pvporcupine"
        except ImportError:
            pass
        try:
            import faster_whisper
            return "whisper_keyword"
        except ImportError:
            pass
        return "none"

    # ── Başlat / Durdur ───────────────────────────────────────────────────

    def start(self, callback: Callable) -> dict:
        """
        Wake word dinlemeyi başlat.
        callback(transcript: str) → ses sohbeti başlatır.
        """
        if self._running:
            return {"ok": False, "error": "Zaten çalışıyor"}

        backend = self._detect_backend()
        if backend == "none":
            return {
                "ok": False,
                "error": "Wake word motoru bulunamadı",
                "install": "pip install openwakeword sounddevice numpy",
            }

        self._callback = callback
        self._backend = backend
        self._running = True
        self._thread = threading.Thread(
            target=self._listen_loop, daemon=True, name="wake-word"
        )
        self._thread.start()
        log.info("Wake word başlatıldı (backend: %s)", backend)
        return {"ok": True, "backend": backend}

    def stop(self) -> None:
        self._running = False
        log.info("Wake word durduruldu")

    @property
    def status(self) -> dict:
        return {
            "running": self._running,
            "backend": self._backend,
            "detect_count": self._detect_count,
            "last_detect": self._last_detect,
        }

    # ── Dinleme Döngüsü ───────────────────────────────────────────────────

    def _listen_loop(self) -> None:
        if self._backend == "openwakeword":
            self._listen_openwakeword()
        elif self._backend == "pvporcupine":
            self._listen_porcupine()
        elif self._backend == "whisper_keyword":
            self._listen_whisper_keyword()

    def _listen_openwakeword(self) -> None:
        try:
            import openwakeword
            from openwakeword.model import Model
            import sounddevice as sd
            import numpy as np

            oww = Model(wakeword_models=["hey_jarvis"],  # en yakın mevcut model
                        inference_framework="onnx")

            CHUNK = 1280  # 80ms @ 16kHz
            log.info("OpenWakeWord dinliyor... (hey_jarvis modeli)")

            with sd.InputStream(samplerate=16000, channels=1,
                                dtype="int16", blocksize=CHUNK) as mic:
                while self._running:
                    audio, _ = mic.read(CHUNK)
                    audio_np = np.squeeze(audio).astype(np.float32) / 32768.0
                    pred = oww.predict(audio_np)
                    scores = pred.get("hey_jarvis", {})
                    if isinstance(scores, dict):
                        score = max(scores.values()) if scores else 0
                    else:
                        score = float(scores)

                    if score > 0.5:
                        self._on_detected("hey codega")
                        time.sleep(2)  # Debounce

        except Exception as e:
            log.error("OpenWakeWord hata: %s", e)
            self._running = False

    def _listen_porcupine(self) -> None:
        try:
            import pvporcupine
            import sounddevice as sd
            import numpy as np

            porcupine = pvporcupine.create(keywords=["jarvis"])
            log.info("Porcupine dinliyor...")

            with sd.InputStream(samplerate=porcupine.sample_rate, channels=1,
                                dtype="int16",
                                blocksize=porcupine.frame_length) as mic:
                while self._running:
                    audio, _ = mic.read(porcupine.frame_length)
                    audio_np = np.squeeze(audio)
                    idx = porcupine.process(audio_np)
                    if idx >= 0:
                        self._on_detected("hey codega")
                        time.sleep(2)

            porcupine.delete()
        except Exception as e:
            log.error("Porcupine hata: %s", e)
            self._running = False

    def _listen_whisper_keyword(self) -> None:
        """
        Whisper ile basit keyword matching.
        Her 3 saniyede bir kısa ses parçası alır, transkribe eder.
        "hey codega" veya "hei kodega" benzeri tespit eder.
        """
        try:
            import sounddevice as sd
            import numpy as np
            from faster_whisper import WhisperModel

            model = WhisperModel("tiny", device="cpu", compute_type="int8")
            KEYWORDS = ["hey codega", "hei codega", "hey kodega",
                        "hey kodeğa", "codega başlat", "codega aç"]
            SAMPLE_RATE = 16000
            DURATION = 2  # saniye

            log.info("Whisper keyword dinliyor...")

            while self._running:
                audio = sd.rec(SAMPLE_RATE * DURATION, samplerate=SAMPLE_RATE,
                               channels=1, dtype="float32")
                sd.wait()
                audio_np = np.squeeze(audio)

                segs, _ = model.transcribe(audio_np, language="tr",
                                           beam_size=1, vad_filter=True)
                text = " ".join(s.text.lower() for s in segs).strip()

                if any(kw in text for kw in KEYWORDS):
                    self._on_detected(text)
                    time.sleep(3)

        except Exception as e:
            log.error("Whisper keyword hata: %s", e)
            self._running = False

    def _on_detected(self, transcript: str) -> None:
        self._detect_count += 1
        self._last_detect = time.time()
        log.info("Wake word algılandı! (#%d) '%s'", self._detect_count, transcript)
        if self._callback:
            try:
                self._callback(transcript)
            except Exception as e:
                log.error("Wake word callback hatası: %s", e)
