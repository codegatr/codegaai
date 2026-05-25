"""
codegaai.api.routes.repair
===========================

Faz 56: In-app Otomatik Onarım — AVX2 sorunu için llama-cpp-python'u
uygulama içinden yeniden kurar (subprocess + progress stream).

Endpoint'ler:
- POST /api/repair/llama   — llama-cpp-python'u yeniden kur
- GET  /api/repair/status  — Onarım durumu
- GET  /api/repair/stream  — SSE ile canlı log
"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import subprocess
import sys
import threading
import time
import queue
from pathlib import Path

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


class RepairState:
    """Onarım durum singleton'ı."""
    _instance = None

    def __init__(self):
        self.is_running = False
        self.status = "idle"   # idle, running, success, failed
        self.progress = 0
        self.log_queue = queue.Queue()
        self.last_log = []
        self.error = ""

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def append_log(self, line: str):
        self.last_log.append(line)
        if len(self.last_log) > 200:
            self.last_log.pop(0)
        self.log_queue.put(line)


@router.post("/llama")
async def repair_llama() -> dict:
    """llama-cpp-python'u CPU-only build ile yeniden kur."""
    state = RepairState.get()

    if state.is_running:
        return {"success": False, "error": "Onarım zaten devam ediyor"}

    state.is_running = True
    state.status = "running"
    state.progress = 0
    state.last_log = []
    state.error = ""

    def _run():
        try:
            python_exe = sys.executable
            is_frozen = getattr(sys, "frozen", False)

            # Frozen build'de pip'i çalıştırmak için Python yolu lazım
            # Sistem Python'unu bul
            if is_frozen:
                # Windows'ta sistem Python'unu ara
                import shutil
                py = shutil.which("python") or shutil.which("python3") or shutil.which("py")
                if py:
                    python_exe = py
                else:
                    state.append_log("[HATA] Sistem Python bulunamadı")
                    state.append_log("Lütfen Python'un yüklü olduğundan ve PATH'te olduğundan emin olun")
                    state.append_log("https://www.python.org/downloads/")
                    state.status = "failed"
                    state.error = "Python bulunamadı"
                    state.is_running = False
                    return

            state.append_log(f"Python: {python_exe}")
            state.append_log("=" * 50)
            state.append_log("Adim 1/3: Eski llama-cpp-python kaldiriliyor...")
            state.progress = 10

            _stream_subprocess(
                [python_exe, "-m", "pip", "uninstall", "llama-cpp-python", "-y"],
                state,
            )

            state.append_log("")
            state.append_log("Adim 2/3: AVX'siz kaynak derleme başlıyor (10-25 dakika)...")
            state.progress = 30

            import os
            env = os.environ.copy()
            env["CMAKE_ARGS"] = (
                "-DGGML_NATIVE=OFF "
                "-DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_AVX512=OFF "
                "-DGGML_F16C=OFF -DGGML_FMA=OFF "
                "-DLLAMA_AVX=OFF -DLLAMA_AVX2=OFF -DLLAMA_AVX512=OFF "
                "-DLLAMA_F16C=OFF -DLLAMA_FMA=OFF -DLLAMA_BLAS=OFF"
            )
            env["FORCE_CMAKE"] = "1"

            ret1 = _stream_subprocess(
                [python_exe, "-m", "pip", "install", "llama-cpp-python",
                 "--no-binary", "llama-cpp-python",
                 "--no-cache-dir", "--force-reinstall", "--verbose"],
                state, env=env,
            )
            if ret1 != 0:
                state.append_log("✗ AVX'siz kaynak derleme başarısız oldu.")
                state.status = "failed"
                state.error = "AVX-free source build failed"
                state.is_running = False
                return

            state.progress = 90
            state.append_log("")
            state.append_log("Adim 3/3: Test ediliyor...")

            test = subprocess.run(
                [python_exe, "-c", "from llama_cpp import Llama; print('OK')"],
                capture_output=True, text=True, timeout=30,
                creationflags=0x08000000 if sys.platform == "win32" else 0,
            )

            if test.returncode == 0:
                state.append_log("✓ llama-cpp-python çalışıyor!")
                state.append_log("Uygulamayı yeniden başlatın, model yüklenecek.")
                state.status = "success"
                state.progress = 100
            else:
                state.append_log(f"✗ Test başarısız: {test.stderr[:200]}")
                state.status = "failed"
                state.error = "Test başarısız"

        except Exception as e:
            state.append_log(f"[HATA] {e}")
            state.status = "failed"
            state.error = str(e)
        finally:
            state.is_running = False

    threading.Thread(target=_run, daemon=True).start()

    return {"success": True, "message": "Onarım başlatıldı"}


def _stream_subprocess(cmd, state, env=None):
    """Subprocess çıktısını state log'a stream et."""
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
            creationflags=0x08000000 if sys.platform == "win32" else 0,
        )

        for line in iter(proc.stdout.readline, ""):
            if line:
                state.append_log(line.rstrip())

        proc.wait()
        return proc.returncode

    except Exception as e:
        state.append_log(f"[HATA] Subprocess: {e}")
        return -1


@router.get("/status")
async def status() -> dict:
    state = RepairState.get()
    return {
        "is_running": state.is_running,
        "status":     state.status,
        "progress":   state.progress,
        "error":      state.error,
        "log_tail":   state.last_log[-20:],
    }


@router.get("/stream")
async def stream_log():
    """SSE ile canlı log akışı."""
    state = RepairState.get()

    def event_stream():
        # Önce mevcut log'u gönder
        for line in state.last_log:
            yield f"data: {line}\n\n"

        # Sonra yeni gelenleri stream et
        timeout_count = 0
        while state.is_running or timeout_count < 3:
            try:
                line = state.log_queue.get(timeout=2)
                yield f"data: {line}\n\n"
                timeout_count = 0
            except queue.Empty:
                timeout_count += 1
                if not state.is_running:
                    break

        # Bitiş işareti
        yield f"data: __END__:{state.status}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
