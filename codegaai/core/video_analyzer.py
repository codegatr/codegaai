"""
codegaai.core.video_analyzer
==============================

Faz 11 - Video Analiz: Frame çıkarma + Sahne Anlama.

İş akışı:
  1. Videodan N frame al (eşit aralıklı veya sahne değişimi)
  2. Her frame'i VisionEngine ile analiz et
  3. Zaman damgalı transcript oluştur
  4. LLM ile genel özet üret
  5. Kullanıcıya sunar

Kullanım:
    analyzer = VideoAnalyzer.get()
    result = analyzer.analyze(video_path="film.mp4", question="Bu videoda ne oluyor?")
    transcript = analyzer.transcribe(video_path="ders.mp4", interval=30)
"""

from __future__ import annotations

import io
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)


@dataclass
class FrameAnalysis:
    timestamp_s: float
    frame_index: int
    description: str
    thumbnail_b64: str = ""  # küçük önizleme


@dataclass
class VideoAnalysisResult:
    video_path: str
    duration_s: float
    total_frames: int
    analyzed_frames: int
    frame_analyses: list[FrameAnalysis] = field(default_factory=list)
    summary: str = ""
    transcript: str = ""
    error: Optional[str] = None
    elapsed_s: float = 0.0

    def to_dict(self) -> dict:
        return {
            "video_path": self.video_path,
            "duration_s": self.duration_s,
            "total_frames": self.total_frames,
            "analyzed_frames": self.analyzed_frames,
            "frame_analyses": [
                {
                    "timestamp_s": f.timestamp_s,
                    "frame_index": f.frame_index,
                    "description": f.description,
                }
                for f in self.frame_analyses
            ],
            "summary": self.summary,
            "transcript": self.transcript,
            "error": self.error,
            "elapsed_s": self.elapsed_s,
        }


class VideoAnalyzer:
    """Video analiz motoru. Singleton."""

    _instance: Optional["VideoAnalyzer"] = None
    _lock = threading.Lock()

    @classmethod
    def get(cls) -> "VideoAnalyzer":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ============================================================
    # Frame çıkarma
    # ============================================================

    def extract_frames(
        self,
        video_path: str,
        max_frames: int = 10,
        interval_s: Optional[float] = None,
        as_bytes: bool = True,
    ) -> list[tuple[float, bytes]]:
        """
        Videodan frame'ler çıkar.

        Dönüş: [(timestamp_s, jpeg_bytes), ...]
        interval_s=None → eşit aralıklı max_frames adet
        """
        try:
            import cv2  # type: ignore
        except ImportError:
            raise RuntimeError(
                "opencv-python yüklü değil: pip install opencv-python"
            )

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise RuntimeError(f"Video açılamadı: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_s = total / fps

        # Hangi zaman noktalarını al
        if interval_s:
            timestamps = [
                i * interval_s
                for i in range(int(duration_s / interval_s) + 1)
                if i * interval_s <= duration_s
            ][:max_frames]
        else:
            step = duration_s / max(max_frames - 1, 1)
            timestamps = [i * step for i in range(max_frames)]

        frames: list[tuple[float, bytes]] = []

        for ts in timestamps:
            frame_no = min(int(ts * fps), total - 1)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
            ret, frame = cap.read()
            if not ret:
                continue

            # JPEG'e çevir (bellek için)
            ret2, buf = cv2.imencode(
                ".jpg", frame,
                [cv2.IMWRITE_JPEG_QUALITY, 80],
            )
            if ret2:
                frames.append((ts, buf.tobytes()))

        cap.release()
        log.info("Video frame çıkarma: %d/%d frame, %.1fs süre",
                 len(frames), max_frames, duration_s)
        return frames

    def get_video_info(self, video_path: str) -> dict:
        """Video meta bilgileri: süre, FPS, çözünürlük."""
        try:
            import cv2
            cap = cv2.VideoCapture(str(video_path))
            if not cap.isOpened():
                return {"error": "Açılamadı"}
            fps = cap.get(cv2.CAP_PROP_FPS)
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            cap.release()
            return {
                "duration_s": total / fps if fps else 0,
                "fps": fps,
                "total_frames": total,
                "width": w,
                "height": h,
            }
        except Exception as exc:
            return {"error": str(exc)}

    # ============================================================
    # Analiz
    # ============================================================

    def analyze(
        self,
        video_path: str,
        question: str = "Bu videoda ne oluyor? Detaylı anlat.",
        max_frames: int = 8,
        auto_load_vision: bool = True,
    ) -> VideoAnalysisResult:
        """
        Videoyu analiz et, sahne açıklamaları ve özet üret.
        """
        from codegaai.core.vision_engine import VisionEngine

        t0 = time.time()
        info = self.get_video_info(video_path)

        if "error" in info:
            return VideoAnalysisResult(
                video_path=video_path,
                duration_s=0, total_frames=0, analyzed_frames=0,
                error=info["error"],
            )

        vision = VisionEngine.get()
        if not vision.is_ready:
            if auto_load_vision:
                log.info("Vision motoru otomatik yükleniyor (moondream2)...")
                vision.load("moondream2")
            else:
                return VideoAnalysisResult(
                    video_path=video_path,
                    duration_s=info["duration_s"],
                    total_frames=info["total_frames"],
                    analyzed_frames=0,
                    error="Vision modeli yüklü değil. Sistem → Vision → Yükle.",
                )

        # Frame çıkar
        frames = self.extract_frames(video_path, max_frames=max_frames)

        # Her frame'i analiz et
        frame_question = "Bu karede ne görüyorsun? Kısa ve net anlat."
        analyses: list[FrameAnalysis] = []

        for i, (ts, frame_bytes) in enumerate(frames):
            try:
                desc = vision.analyze(
                    question=frame_question,
                    image_bytes=frame_bytes,
                    max_tokens=150,
                )
                analyses.append(FrameAnalysis(
                    timestamp_s=ts,
                    frame_index=i,
                    description=desc,
                ))
                log.debug("Frame %d (%.1fs): %s...", i, ts, desc[:50])
            except Exception as exc:
                log.warning("Frame analiz hatası %d: %s", i, exc)

        # Transcript oluştur
        transcript_lines = [
            f"[{ts:.1f}s] {a.description}"
            for a in analyses
        ]
        transcript = "\n".join(transcript_lines)

        # LLM ile genel özet
        summary = self._generate_summary(
            transcript=transcript,
            question=question,
            duration=info["duration_s"],
        )

        elapsed = time.time() - t0

        return VideoAnalysisResult(
            video_path=video_path,
            duration_s=info["duration_s"],
            total_frames=info["total_frames"],
            analyzed_frames=len(analyses),
            frame_analyses=analyses,
            summary=summary,
            transcript=transcript,
            elapsed_s=elapsed,
        )

    def _generate_summary(self, transcript: str, question: str,
                           duration: float) -> str:
        """LLM ile video özeti üret."""
        try:
            from codegaai.core.engine import LLMEngine
            engine = LLMEngine.get()
            if not engine.is_ready:
                return transcript[:500] + "..."

            prompt = (
                f"Video süresi: {duration:.1f} saniye.\n\n"
                f"Video içeriği (zaman damgalı):\n{transcript}\n\n"
                f"Soru: {question}\n\n"
                "Yukarıdaki çerçeve analizlerine dayanarak soruyu yanıtla. "
                "Varsa olayları kronolojik sıraya koy. "
                "Türkçe, net ve kapsamlı yanıtla."
            )
            messages = [
                {"role": "system", "content": "Görüntü ve video analistsin."},
                {"role": "user", "content": prompt},
            ]
            result = engine.generate(messages, use_tools=False)
            return result["content"]

        except Exception as exc:
            log.warning("Özet üretme hatası: %s", exc)
            return f"Video Özeti:\n{transcript[:800]}"

    # ============================================================
    # Uzun video transkript (interval bazlı)
    # ============================================================

    def transcribe(
        self,
        video_path: str,
        interval_s: float = 30.0,
        question: str = "Bu karede ne oluyor?",
        auto_load_vision: bool = True,
    ) -> str:
        """
        Uzun video için her N saniyede bir frame analizi yap.
        Zaman damgalı transkript döndür.
        """
        from codegaai.core.vision_engine import VisionEngine

        vision = VisionEngine.get()
        if not vision.is_ready and auto_load_vision:
            vision.load("moondream2")

        info = self.get_video_info(video_path)
        if "error" in info:
            return f"Hata: {info['error']}"

        frames = self.extract_frames(
            video_path,
            max_frames=int(info["duration_s"] / interval_s) + 1,
            interval_s=interval_s,
        )

        lines = [f"Video Transkripti: {Path(video_path).name}",
                 f"Süre: {info['duration_s']:.1f}s\n"]

        for ts, frame_bytes in frames:
            try:
                desc = vision.analyze(
                    question=question,
                    image_bytes=frame_bytes,
                    max_tokens=200,
                )
                mins, secs = divmod(int(ts), 60)
                lines.append(f"[{mins:02d}:{secs:02d}] {desc}")
            except Exception as exc:
                lines.append(f"[{ts:.0f}s] Hata: {exc}")

        return "\n".join(lines)
