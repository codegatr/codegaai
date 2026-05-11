"""
codegaai.core.scheduler
========================

Faz 10 - Zamanlanmış Görevler.

CODEGA AI kendi kendine öğrenir:
- Her sohbet sonrası → konudan web araması
- Gece 03:00 → RSS feed beslemesi
- Haftalık → DPO training (feedback biriktiyse)
- Saatlik → model güncellemesi kontrolü

APScheduler kullanır (hafif, gömülü, cron destekli).
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from codegaai.utils.logger import get_logger

log = get_logger(__name__)


@dataclass
class ScheduledJob:
    id: str
    name: str
    enabled: bool = True
    last_run: Optional[float] = None
    next_run: Optional[float] = None
    interval_seconds: int = 0
    cron: Optional[str] = None  # "hour=3" gibi
    run_count: int = 0
    last_error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "enabled": self.enabled,
            "last_run": self.last_run,
            "next_run": self.next_run,
            "interval_seconds": self.interval_seconds,
            "cron": self.cron,
            "run_count": self.run_count,
            "last_error": self.last_error,
        }


class Scheduler:
    """Basit arka plan görev zamanlayıcısı. Singleton."""

    _instance: Optional["Scheduler"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._jobs: dict[str, ScheduledJob] = {}
        self._functions: dict[str, Any] = {}
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._started = False

    @classmethod
    def get(cls) -> "Scheduler":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def register(self, job_id: str, name: str, func,
                 interval_seconds: int = 0,
                 cron_hour: Optional[int] = None,
                 enabled: bool = True) -> None:
        """
        Görev kaydı.
        interval_seconds > 0 → periyodik (saniye bazlı)
        cron_hour → her gün o saatte çalış
        """
        next_run = None
        if interval_seconds > 0:
            next_run = time.time() + interval_seconds
        elif cron_hour is not None:
            next_run = self._next_hour(cron_hour)

        job = ScheduledJob(
            id=job_id, name=name, enabled=enabled,
            interval_seconds=interval_seconds,
            cron=f"hour={cron_hour}" if cron_hour is not None else None,
            next_run=next_run,
        )
        self._jobs[job_id] = job
        self._functions[job_id] = func
        log.info("Görev kaydedildi: %s (next: %s)", name,
                 time.strftime("%H:%M", time.localtime(next_run))
                 if next_run else "devre dışı")

    def start(self) -> None:
        if self._started:
            return
        self._started = True
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._loop, daemon=True, name="scheduler"
        )
        self._thread.start()
        log.info("Zamanlayıcı başlatıldı (%d görev)", len(self._jobs))

    def stop(self) -> None:
        self._stop.set()
        self._started = False

    def run_now(self, job_id: str) -> bool:
        """Bir görevi hemen çalıştır."""
        if job_id not in self._jobs:
            return False
        threading.Thread(
            target=self._run_job,
            args=(job_id,),
            daemon=True,
        ).start()
        return True

    def toggle(self, job_id: str, enabled: bool) -> bool:
        if job_id not in self._jobs:
            return False
        self._jobs[job_id].enabled = enabled
        return True

    @property
    def jobs(self) -> list[dict]:
        return [j.to_dict() for j in self._jobs.values()]

    # ============================================================
    # İç işleyiş
    # ============================================================

    def _loop(self) -> None:
        while not self._stop.is_set():
            now = time.time()
            for job_id, job in self._jobs.items():
                if not job.enabled:
                    continue
                if job.next_run and now >= job.next_run:
                    threading.Thread(
                        target=self._run_job,
                        args=(job_id,),
                        daemon=True,
                    ).start()
                    # next_run güncelle
                    if job.interval_seconds > 0:
                        job.next_run = now + job.interval_seconds
                    elif job.cron:
                        hour = int(job.cron.split("=")[1])
                        job.next_run = self._next_hour(hour)

            self._stop.wait(timeout=60.0)  # 1 dakika kontrol aralığı

    def _run_job(self, job_id: str) -> None:
        job = self._jobs.get(job_id)
        func = self._functions.get(job_id)
        if not job or not func:
            return

        log.info("Görev çalışıyor: %s", job.name)
        job.last_run = time.time()
        job.run_count += 1

        try:
            func()
            job.last_error = None
            log.info("Görev tamamlandı: %s", job.name)
        except Exception as exc:
            job.last_error = str(exc)
            log.exception("Görev hatası (%s): %s", job.name, exc)

    @staticmethod
    def _next_hour(hour: int) -> float:
        import datetime
        now = datetime.datetime.now()
        target = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if target <= now:
            target += datetime.timedelta(days=1)
        return target.timestamp()


# ============================================================
# Varsayılan görevleri kaydet ve başlat
# ============================================================

def setup_scheduler() -> Scheduler:
    """
    Uygulama başlangıcında çağrılır.
    Tüm otomatik görevleri kaydeder.
    """
    sched = Scheduler.get()

    # 1. Gece RSS beslemesi (03:00)
    def _nightly_feed():
        try:
            from codegaai.core.web_learner import WebLearner
            result = WebLearner.get().learn_from_feeds(enabled_only=True)
            log.info("Gece RSS beslemesi: %d kaydedildi",
                     result.get("stored", 0))
        except Exception as exc:
            log.error("Gece RSS beslemesi hatası: %s", exc)

    sched.register(
        "nightly_feed",
        "Gece RSS Beslemesi",
        _nightly_feed,
        cron_hour=3,
        enabled=True,
    )

    # 2. Haftalık DPO training kontrolü (Pazar 02:00 → 6 gün interval)
    def _weekly_training():
        try:
            from codegaai.core.learning import FeedbackStore, TrainingEngine
            store = FeedbackStore.open()
            dataset = store.export_dpo_dataset()
            pairs = dataset.get("pair_count", 0)
            if dataset.get("ready_for_training"):
                log.info("Haftalık training: %d çift var, başlatılıyor", pairs)
                TrainingEngine.get().start_dpo(
                    base_model_id="qwen2.5-7b-instruct-q4_k_m",
                    pairs=dataset.get("pairs", []),
                    adapter_name="Haftalık CODEGA tercihleri",
                    epochs=1,
                )
            else:
                log.info("Haftalık training: %d çift var, eşik altı, atlandı", pairs)
        except Exception as exc:
            log.error("Haftalık training hatası: %s", exc)

    sched.register(
        "weekly_training",
        "Haftalık DPO Eğitimi",
        _weekly_training,
        interval_seconds=7 * 24 * 3600,
        enabled=True,
    )

    # 3. Saatlik güncelleme kontrolü
    def _hourly_update_check():
        try:
            from codegaai.core.updater import Updater
            info = Updater.get().check_for_updates()
            if info.update_available:
                log.info("Yeni sürüm mevcut: %s", info.latest_version)
        except Exception as exc:
            log.debug("Güncelleme kontrolü hatası: %s", exc)

    sched.register(
        "hourly_update",
        "Saatlik Güncelleme Kontrolü",
        _hourly_update_check,
        interval_seconds=3600,
        enabled=True,
    )

    # 4. Federe ağ senkronizasyonu (6 saatte bir)
    def _federation_sync():
        try:
            from codegaai.core.federation import FederationManager
            fm = FederationManager.get()
            if fm.is_enabled:
                result = fm.sync()
                log.info("Federe sync: %s", result)
        except Exception as exc:
            log.debug("Federation sync hatası: %s", exc)

    sched.register(
        "federation_sync",
        "Federe Ağ Senkronizasyonu",
        _federation_sync,
        interval_seconds=6 * 3600,
        enabled=True,
    )

    sched.start()
    return sched
