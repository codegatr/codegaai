"""
codegaai.core.startup
=====================

StartupDoctor is the boot-time caretaker for CODEGA AI.

Its job is deliberately practical: when the app opens, make the local
assistant usable without asking the user to babysit every subsystem.
It prepares storage, loads downloaded models, starts background learning, and
records repair attempts for the UI/logs.
"""

from __future__ import annotations

import subprocess
import sys
import threading
import time
import os
from dataclasses import dataclass, field
from typing import Any, Optional

from codegaai.config import ensure_directories, get_config
from codegaai.utils.logger import get_logger

log = get_logger(__name__)


@dataclass
class StartupTask:
    name: str
    state: str = "pending"  # pending | running | ok | warning | error
    message: str = ""
    started_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "state": self.state,
            "message": self.message,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }


class StartupDoctor:
    """Boot-time health checks and automatic preparation."""

    _instance: Optional["StartupDoctor"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._tasks: list[StartupTask] = []
        self._tasks_lock = threading.Lock()
        self._started = False
        self._finished = False
        self._thread: Optional[threading.Thread] = None

    @classmethod
    def get(cls) -> "StartupDoctor":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def start(self) -> None:
        if self._started:
            return
        self._started = True
        self._thread = threading.Thread(
            target=self._run,
            daemon=True,
            name="startup-doctor",
        )
        self._thread.start()

    @property
    def status(self) -> dict[str, Any]:
        with self._tasks_lock:
            tasks = [t.to_dict() for t in self._tasks[-30:]]
        return {
            "started": self._started,
            "finished": self._finished,
            "tasks": tasks,
        }

    def _task(self, name: str) -> StartupTask:
        task = StartupTask(name=name, state="running")
        with self._tasks_lock:
            self._tasks.append(task)
        log.info("[StartupDoctor] %s...", name)
        return task

    def _finish(self, task: StartupTask, state: str, message: str = "") -> None:
        task.state = state
        task.message = message
        task.finished_at = time.time()
        if state == "ok":
            log.info("[StartupDoctor] OK %s %s", task.name, message)
        elif state == "warning":
            log.warning("[StartupDoctor] WARN %s %s", task.name, message)
        else:
            log.error("[StartupDoctor] ERROR %s %s", task.name, message)

    def _run(self) -> None:
        cfg = get_config()
        server_cfg = cfg.get("server", {})

        self._prepare_storage()
        self._prepare_learning_memory()
        self._prepare_embedding(server_cfg)
        self._prepare_llm(server_cfg)
        self._start_autonomous_learning()
        self._start_startup_web_learning(cfg.get("learning", {}))

        self._finished = True

    def _prepare_storage(self) -> None:
        task = self._task("runtime-directories")
        try:
            ensure_directories()
            from codegaai.core.chat_store import ChatStore
            ChatStore.open()
            self._finish(task, "ok", "data/chat dizinleri hazır")
        except Exception as exc:
            self._finish(task, "error", str(exc))

    def _prepare_learning_memory(self) -> None:
        task = self._task("learning-memory")
        try:
            from codegaai.core.learning import FeedbackStore, TrainingEngine
            FeedbackStore.open()
            deps = TrainingEngine.check_dependencies()
            missing = [k for k, v in deps.items() if not v and k != "bitsandbytes"]
            if missing:
                self._finish(task, "warning", f"training deps eksik: {', '.join(missing)}")
            else:
                self._finish(task, "ok", "feedback DB ve eğitim bağımlılıkları hazır")
        except Exception as exc:
            self._finish(task, "warning", str(exc))

    def _prepare_embedding(self, server_cfg: dict[str, Any]) -> None:
        if not server_cfg.get("auto_load_embedding", True):
            return

        task = self._task("embedding-bge-m3")
        try:
            from codegaai.core.embeddings import EmbeddingService
            from codegaai.core.models_registry import ModelRegistry

            reg = ModelRegistry.get()
            emb = EmbeddingService.get()
            if emb.is_ready:
                self._finish(task, "ok", f"zaten yüklü: {emb.status.get('model_id')}")
                return

            if reg.is_embedding_downloaded("bge-m3"):
                emb.load("bge-m3")
                self._finish(task, "ok", "bge-m3 yüklendi")
                return

            if server_cfg.get("auto_download_embedding", True):
                self._finish(task, "warning", "bge-m3 yok, arka planda indiriliyor")
                threading.Thread(
                    target=self._download_and_load_embedding,
                    daemon=True,
                    name="startup-bge-m3-download",
                ).start()
            else:
                self._finish(task, "warning", "bge-m3 indirilmemiş")
        except Exception as exc:
            self._finish(task, "warning", str(exc))

    def _download_and_load_embedding(self) -> None:
        task = self._task("embedding-bge-m3-download")
        try:
            from codegaai.core.embeddings import EmbeddingService
            from codegaai.core.models_registry import ModelRegistry

            reg = ModelRegistry.get()
            thread = reg.download_snapshot_async("bge-m3", spec_kind="embedding")
            thread.join()
            progress = reg.get_progress("bge-m3")
            if progress.status == "completed":
                EmbeddingService.get().load("bge-m3")
                self._finish(task, "ok", "bge-m3 indirildi ve yüklendi")
            else:
                self._finish(task, "warning", progress.error or progress.status)
        except Exception as exc:
            self._finish(task, "warning", str(exc))

    def _prepare_llm(self, server_cfg: dict[str, Any]) -> None:
        if not server_cfg.get("auto_load_model", True):
            return

        task = self._task("llm-auto-load")
        try:
            from codegaai.core.engine import LLMEngine
            from codegaai.core.models_registry import ModelRegistry

            reg = ModelRegistry.get()
            engine = LLMEngine.get()
            if engine.is_ready:
                self._finish(task, "ok", f"zaten yüklü: {engine.status.get('model_id')}")
                return

            downloaded = [m for m in reg.list_llm_models() if reg.is_llm_downloaded(m["id"])]
            if not downloaded:
                self._finish(task, "warning", "indirilmiş LLM yok")
                return

            preferred = str(get_config().get("models", {}).get("llm") or "")
            model = next((m for m in downloaded if m["id"] == preferred), None)
            model = model or next((m for m in downloaded if m.get("default")), downloaded[0])

            try:
                engine.load(model["id"])
                self._finish(task, "ok", f"{model['id']} yüklendi")
            except OSError as exc:
                if self._is_avx_error(exc):
                    self._finish(task, "warning", "AVX2 uyumsuzluğu algılandı, llama onarımı deneniyor")
                    self._repair_llama_and_retry(model["id"])
                else:
                    raise
            except Exception as exc:
                if self._is_avx_error(exc) or self._is_avx_error(engine.status.get("error", "")):
                    self._finish(task, "warning", "AVX2 uyumsuzluğu algılandı, llama onarımı deneniyor")
                    self._repair_llama_and_retry(model["id"])
                else:
                    raise
        except Exception as exc:
            self._finish(task, "warning", str(exc))

    @staticmethod
    def _is_avx_error(exc: object) -> bool:
        text = str(exc).lower()
        return "0xc000001d" in text or "-1073741795" in text or "avx2" in text

    def _repair_llama_and_retry(self, model_id: str) -> None:
        task = self._task("llama-cpp-no-avx-repair")
        try:
            from codegaai.core.engine import LLMEngine

            engine = LLMEngine.get()
            try:
                engine._write_fix_script()
            except Exception:
                pass

            if not get_config().get("server", {}).get("auto_repair_llama", True):
                self._finish(task, "warning", "auto_repair_llama=false; fix_llama.bat hazırlandı")
                return

            if getattr(sys, "frozen", False):
                self._finish(
                    task,
                    "warning",
                    "kurulu portable uygulama pip ile yerinde onarilamaz; no-AVX Windows paketi gerekir",
                )
                return

            cmd = [
                sys.executable, "-m", "pip", "install",
                "llama-cpp-python",
                "--force-reinstall",
                "--no-binary",
                "llama-cpp-python",
                "--no-cache-dir",
            ]
            env = {
                **os.environ,
                "CMAKE_ARGS": (
                    "-DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_F16C=OFF -DGGML_FMA=OFF "
                    "-DLLAMA_AVX=OFF -DLLAMA_AVX2=OFF -DLLAMA_F16C=OFF -DLLAMA_FMA=OFF"
                ),
                "FORCE_CMAKE": "1",
            }
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=900,
                env=env,
            )
            if result.returncode != 0:
                msg = (result.stderr or result.stdout or "pip repair failed")[-800:]
                self._finish(task, "warning", f"otomatik pip onarımı başarısız: {msg}")
                return

            engine.unload()
            engine.load(model_id, n_gpu_layers=0)
            self._finish(task, "ok", f"llama no-AVX onarıldı ve {model_id} yüklendi")
        except Exception as exc:
            self._finish(task, "warning", str(exc))

    def _start_autonomous_learning(self) -> None:
        task = self._task("autonomous-learner")
        try:
            from codegaai.core.autonomous_learner import AutonomousLearner
            AutonomousLearner.get().start()
            self._finish(task, "ok", "idle öğrenici çalışıyor")
        except Exception as exc:
            self._finish(task, "warning", str(exc))

    def _start_startup_web_learning(self, learning_cfg: dict[str, Any]) -> None:
        if not learning_cfg.get("enabled", True):
            return
        if not learning_cfg.get("auto_web_learn_on_startup", True):
            return

        def _worker() -> None:
            delay = int(learning_cfg.get("startup_web_learn_delay_seconds", 20) or 20)
            time.sleep(max(0, delay))
            task = self._task("startup-web-learning")
            try:
                from codegaai.core.web_learner import WebLearner
                learner = WebLearner.get()
                if learner.status.get("state") != "idle":
                    self._finish(task, "warning", "başka öğrenme aktif")
                    return
                learner.learn_async(feeds=True)
                self._finish(task, "ok", "RSS/feed öğrenmesi başlatıldı")
            except Exception as exc:
                self._finish(task, "warning", str(exc))

        threading.Thread(target=_worker, daemon=True, name="startup-web-learner").start()
