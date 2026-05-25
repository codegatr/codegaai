"""
codegaai.core.engine
=====================

LLM motoru — llama-cpp-python sarmalayıcısı.

**Önemli**: llama_cpp ve diğer ağır kütüphaneler **lazy** import edilir
(sadece `load()` çağrılınca). Bu sayede:

- Sunucu modeller olmadan anında başlar
- Test ortamlarında torch/llama-cpp gerekmez
- "Model yüklenmedi" zarif bir durum, çökme değil

Kullanım:

    engine = LLMEngine.get()
    engine.load("qwen2.5-7b-instruct-q4_k_m")
    response = engine.generate([
        {"role": "system", "content": "Sen yardımsever bir asistansın."},
        {"role": "user", "content": "Merhaba"},
    ])
    # Stream:
    for chunk in engine.stream([...]):
        print(chunk, end="")
"""

from __future__ import annotations

import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator, Optional

from codegaai.core.models_registry import ModelRegistry
from codegaai.utils.logger import get_logger

log = get_logger(__name__)


# ============================================================
# Sistem mesajı (Türkçe varsayılan)
# ============================================================

def _get_system_prompt() -> str:
    """Dinamik sistem promptu — profil + araçlarla birleşir."""
    try:
        from codegaai.core.system_prompt import build_system_prompt
        return build_system_prompt(include_tools=True, include_profile=True)
    except Exception:
        return (
            "Sen CODEGA AI'sın — yerel yapay zeka asistanı. "
            "Türkçe iletişim kur. Dürüst, yardımsever ve doğrudan ol."
        )


DEFAULT_SYSTEM_PROMPT = (
    "Sen CODEGA AI'sın — yerel yapay zeka asistanı. "
    "Türkçe iletişim kur. Dürüst, yardımsever ve doğrudan ol."
)


@dataclass
class GenerationConfig:
    temperature: float = 0.35
    top_p: float = 0.85
    top_k: int = 40
    max_tokens: int = 2048
    repeat_penalty: float = 1.12
    stop: list[str] = field(default_factory=list)


# ============================================================
# Engine durumu
# ============================================================

@dataclass
class EngineStatus:
    state: str = "unloaded"          # unloaded | loading | ready | error
    model_id: Optional[str] = None
    model_path: Optional[str] = None
    loaded_at: Optional[float] = None
    error: Optional[str] = None
    backend: Optional[str] = None    # cuda | metal | cpu
    context_length: int = 0


# ============================================================
# Engine
# ============================================================

class LLMEngine:
    """
    Tek instance'lı LLM motoru. Singleton.

    Thread-safe: tek seferde bir generate/stream koşar (lock).
    """

    _instance: Optional["LLMEngine"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        self._llm = None  # type: Any  # llama_cpp.Llama instance
        self._status = EngineStatus()
        self._gen_lock = threading.Lock()  # tek seferde bir üretim

    @classmethod
    def get(cls) -> "LLMEngine":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ---- durum ----

    @property
    def is_ready(self) -> bool:
        return self._status.state == "ready"

    @property
    def status(self) -> dict[str, Any]:
        s = self._status
        return {
            "state": s.state,
            "model_id": s.model_id,
            "model_path": s.model_path,
            "loaded_at": s.loaded_at,
            "error": s.error,
            "backend": s.backend,
            "context_length": s.context_length,
            "ready": s.state == "ready",
        }

    # ---- yükleme ----

    def load(self, model_id: str,
             n_ctx: int = 0,
             n_gpu_layers: int = -1) -> None:
        """
        Modeli belleğe yükle.

        Args:
            model_id: Registry'deki model id'si.
            n_ctx: 0 = modelin maksimum context_length'ini kullan.
            n_gpu_layers: -1 = tüm katmanları GPU'ya at.
                          0 = saf CPU. RTX 3060 6GB → otomatik tespit.
        """
        registry = ModelRegistry.get()
        spec = registry.get_llm_spec(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen model: {model_id}")

        if not registry.is_llm_downloaded(model_id):
            raise RuntimeError(
                f"Model henüz indirilmedi: {model_id}. "
                f"Önce /api/models/{model_id}/download çağrısı yapın."
            )

        path = registry.llm_path(model_id)
        log.info("LLM yükleniyor: %s (%s)", model_id, path)

        # Önceki yükleme varsa boşalt
        self._unload_internal()

        self._status = EngineStatus(
            state="loading", model_id=model_id, model_path=str(path),
        )

        try:
            from llama_cpp import Llama  # type: ignore[import-not-found]

            # Sistem kaynakları tespit et — düşük sistem modu
            import psutil
            ram_gb = psutil.virtual_memory().available / 1e9
            low_end = ram_gb < 4.0   # 4 GB altı = düşük sistem

            # n_ctx: düşük sistemde küçük tut, çökmeyi önle
            if n_ctx:
                effective_ctx = n_ctx
            elif low_end:
                effective_ctx = 512    # Düşük sistem: 512 token
                log.warning("Düşük RAM (%.1f GB) — context 512'ye düşürüldü", ram_gb)
            else:
                max_ctx = spec.context_length
                # RAM'e göre kısıtla (her 1K token ~2MB RAM)
                ram_limit = int(ram_gb * 500)   # 8GB→4000, 4GB→2000
                effective_ctx = min(max_ctx, max(512, ram_limit))
                log.info("Context: %d (RAM: %.1f GB)", effective_ctx, ram_gb)

            # VRAM otomatik tespiti
            effective_gpu_layers = n_gpu_layers
            if effective_gpu_layers == -1:
                try:
                    import torch
                    if torch.cuda.is_available():
                        props = torch.cuda.get_device_properties(0)
                        vram_gb = props.total_memory / 1e9
                        free_vram = (props.total_memory - torch.cuda.memory_allocated(0)) / 1e9
                        log.info("GPU: %s, Toplam VRAM: %.1f GB, Boş: %.1f GB",
                                 props.name, vram_gb, free_vram)
                        if spec.vram_gb <= free_vram * 0.9:
                            effective_gpu_layers = -1
                            log.info("GPU mod: tüm katmanlar GPU'da")
                        else:
                            ratio = (free_vram * 0.85) / spec.vram_gb
                            effective_gpu_layers = max(1, int(32 * ratio))
                            log.info("Kısmi GPU: %d katman", effective_gpu_layers)
                    else:
                        effective_gpu_layers = 0
                        log.info("CUDA yok, CPU mod kullanılıyor")
                except Exception as e:
                    effective_gpu_layers = 0
                    log.warning("GPU tespiti başarısız: %s → CPU mod", e)

            # AVX2 uyumluluğunu önceden kontrol et (crash önle)
            if not self._check_avx2_compat():
                err = (
                    "CPU uyumsuzluğu: llama-cpp-python AVX2 gerektiriyor ama CPU'nuz desteklemiyor.\n"
                    "AVX'siz Windows paketini kullanın veya Sistem > Otomatik Onarım ile "
                    "llama-cpp-python'u kaynak koddan AVX kapalı derleyin."
                )
                log.error("AVX2 uyumsuzluğu tespit edildi — yükleme iptal edildi")
                self._write_fix_script()
                self._status = EngineStatus(
                    state="error", model_id=model_id,
                    model_path=str(path), error=err,
                )
                return   # crash olmadan çık

            # Düşük sistem parametreleri
            import os
            cpu_count = os.cpu_count() or 4
            n_batch = 128 if low_end else 512
            n_threads = 2 if low_end else max(2, min(cpu_count - 1, 8))

            self._llm = Llama(
                model_path=str(path),
                n_ctx=effective_ctx,
                n_gpu_layers=effective_gpu_layers,
                n_threads=n_threads,
                n_batch=n_batch,
                verbose=False,
                seed=-1,
                use_mlock=False,

                use_mmap=True,     # mmap açık — RAM tasarrufu
            )

            backend = self._detect_backend()
            self._status = EngineStatus(
                state="ready",
                model_id=model_id,
                model_path=str(path),
                loaded_at=time.time(),
                backend=backend,
                context_length=effective_ctx,
            )
            log.info("LLM hazır: %s [%s, %d ctx, %d GPU katman]",
                     model_id, backend, effective_ctx, effective_gpu_layers)

        except OSError as exc:
            err_str = str(exc)
            if "0xc000001d" in err_str.lower() or "-1073741795" in err_str:
                fix_msg = (
                    "CPU'nuz AVX2 desteği içermeyen llama-cpp-python build'i gerektiriyor.\n"
                    "Yeni AVX'siz Windows paketini kullanın veya Sistem > Otomatik Onarım ile "
                    "kaynak derleme başlatın."
                )
                log.error("CPU UYUMSUZLUĞU (0xC000001D): %s", fix_msg)
                self._write_fix_script()
                self._status = EngineStatus(
                    state="error", model_id=model_id,
                    model_path=str(path),
                    error=f"CPU uyumsuzluğu (AVX2). Sistem > Otomatik Onar çalıştırın.\n{fix_msg}",
                )
            else:
                log.exception("LLM yüklemesi başarısız: %s", exc)
                self._status = EngineStatus(
                    state="error", model_id=model_id,
                    model_path=str(path), error=str(exc),
                )
            raise

        except Exception as exc:
            err_str = str(exc)
            if "llama.dll" in err_str or "dynlib" in err_str or "shared library" in err_str:
                dll_msg = (
                    "llama.dll yüklenemedi.\n"
                    "Çözüm: Sistem > Otomatik Onar çalıştırın veya Visual C++ Redistributable kurun:\n"
                    "https://aka.ms/vs/17/release/vc_redist.x64.exe"
                )
                log.error("LLM DLL hatası: %s", dll_msg)
                self._status = EngineStatus(
                    state="error", model_id=model_id,
                    model_path=str(path), error=dll_msg,
                )
            else:
                log.exception("LLM yüklemesi başarısız: %s", exc)
                self._status = EngineStatus(
                    state="error", model_id=model_id,
                    model_path=str(path), error=err_str,
                )
            raise

    def _detect_backend(self) -> str:
        """llama-cpp-python hangi backend'le derlendi tespit et."""
        try:
            import llama_cpp  # type: ignore[import-not-found]
            # Heuristik: cuda fonksiyonları varsa CUDA build
            if hasattr(llama_cpp, "llama_supports_gpu_offload"):
                if llama_cpp.llama_supports_gpu_offload():
                    return "cuda"
            return "cpu"
        except Exception:
            return "unknown"

    def _check_avx2_compat(self) -> bool:
        """
        llama-cpp-python'un bu CPU'da çalışıp çalışmayacağını test et.

        FROZEN BUILD'DE subprocess KULLANILMAZ — sys.executable codegaai.exe
        olduğundan '-c' argümanı tanınmaz ve test hep başarısız döner.
        Bunun yerine doğrudan import denenip hata yakalanır.
        """
        if hasattr(self, "_avx2_ok"):
            return self._avx2_ok

        try:
            # Doğrudan import et — crash olursa OSError/ImportError yakalar
            from llama_cpp import Llama as _LlamaTest  # noqa: F401
            self._avx2_ok = True
            return True
        except OSError as e:
            err = str(e).lower()
            if "0xc000001d" in err or "-1073741795" in err or "illegal instruction" in err:
                log.warning("AVX2 uyumsuzluğu tespit edildi (import testi)")
                self._avx2_ok = False
                return False
            # Başka OSError → llama kurulmamış olabilir, yüklemeyi dene
            self._avx2_ok = True
            return True
        except ImportError:
            # llama_cpp hiç kurulmamış — zaten yüklenemez ama crash olmaz
            self._avx2_ok = True
            return True
        except Exception:
            # Beklenmedik hata → dene, en kötü ihtimalle OSError yakalarız
            self._avx2_ok = True
            return True

    def _write_fix_script(self) -> None:
        """
        AVX2 uyumsuzluğu durumunda kullanıcıya net yönlendirme veren bat.
        Pip ile onarım denemiyor (Python yoksa zaten çalışmaz).
        Bunun yerine: yeni sürümü indirmesi için tarayıcı açar.
        """
        try:
            if getattr(sys, "frozen", False):
                bat_dir = Path(sys.executable).parent
            else:
                from codegaai.config import DATA_DIR
                bat_dir = DATA_DIR

            bat = bat_dir / "fix_llama.bat"
            bat.write_text(
                '@echo off\r\n'
                'chcp 65001 > nul\r\n'
                'title CODEGA AI - AVX2 Onarimi\r\n'
                'cls\r\n'
                'echo ================================================\r\n'
                'echo  CODEGA AI - CPU AVX2 UYUMSUZLUGU\r\n'
                'echo ================================================\r\n'
                'echo.\r\n'
                'echo Isleminizin AVX2 destegi olmadigi tespit edildi.\r\n'
                'echo.\r\n'
                'echo COZUM:\r\n'
                'echo Yeni surum (v4.1.1+) AVX2 gerektirmiyor.\r\n'
                'echo Asagidaki adimlari izleyin:\r\n'
                'echo.\r\n'
                'echo  1. Tarayicida acilan sayfadan en son ZIP dosyasini indirin\r\n'
                'echo  2. Mevcut CODEGA AI klasorunu yedekleyin/silin\r\n'
                'echo  3. Yeni ZIPi acin, codegaai.exe ile baslatin\r\n'
                'echo  4. Model otomatik yuklenecek\r\n'
                'echo.\r\n'
                'echo Iste indirme sayfasi aciliyor...\r\n'
                'timeout /t 3 > nul\r\n'
                'start https://github.com/codegatr/codegaai/releases/latest\r\n'
                'echo.\r\n'
                'echo ================================================\r\n'
                'echo  Eger v4.1.1 veya daha yenisi henuz hazir degilse,\r\n'
                'echo  birkac dakika sonra tekrar deneyin.\r\n'
                'echo  Build: https://github.com/codegatr/codegaai/actions\r\n'
                'echo ================================================\r\n'
                'pause\r\n',
                encoding="utf-8",
            )
            log.info("fix_llama.bat (yönlendirici) oluşturuldu: %s", bat)
        except Exception as e:
            log.warning("fix_llama.bat yazılamadı: %s", e)

    def unload(self) -> None:
        """Modeli bellekten çıkar."""
        with self._gen_lock:
            self._unload_internal()

    def _unload_internal(self) -> None:
        if self._llm is not None:
            try:
                del self._llm
            except Exception:
                pass
            self._llm = None
        self._status = EngineStatus()
        # CUDA bellek tahsisini geri ver
        try:
            import gc
            gc.collect()
        except Exception:
            pass

    # ---- üretim ----

    def generate(self, messages: list[dict[str, str]],
                 cfg: Optional[GenerationConfig] = None,
                 use_tools: bool = True) -> dict[str, Any]:
        """Tam yanıt üret (bloklayıcı). messages: [{role, content}, ...]"""
        if not self.is_ready or self._llm is None:
            raise RuntimeError("LLM yüklü değil.")

        cfg = cfg or GenerationConfig()

        with self._gen_lock:
            t0 = time.time()
            result = self._llm.create_chat_completion(
                messages=messages,
                temperature=cfg.temperature,
                top_p=cfg.top_p,
                top_k=cfg.top_k,
                max_tokens=cfg.max_tokens,
                repeat_penalty=cfg.repeat_penalty,
                stop=cfg.stop or None,
                stream=False,
            )
            elapsed_ms = int((time.time() - t0) * 1000)

        choice = result["choices"][0]
        msg = choice["message"]
        content = msg.get("content", "")

        # Tool use — <tool>...</tool> bloklarını işle
        tool_calls = []
        if use_tools:
            try:
                from codegaai.core.tools import parse_and_run_tools
                content, tool_calls = parse_and_run_tools(content)
            except Exception as exc:
                log.warning("Tool işleme hatası: %s", exc)

        usage = result.get("usage", {})

        return {
            "content": content,
            "role": msg.get("role", "assistant"),
            "finish_reason": choice.get("finish_reason", "stop"),
            "model": self._status.model_id,
            "timing_ms": elapsed_ms,
            "tokens_in": usage.get("prompt_tokens", 0),
            "tokens_out": usage.get("completion_tokens", 0),
            "tool_calls": [
                {"name": tc.name, "result": tc.result, "elapsed_ms": tc.elapsed_ms}
                for tc in tool_calls
            ],
        }

    def stream(self, messages: list[dict[str, str]],
               cfg: Optional[GenerationConfig] = None) -> Iterator[str]:
        """
        Token-token üret. Generator yields delta string'ler.

        Çağrıyı bitirmek zorundasın (iterator'ı tüket) yoksa lock kalır.
        """
        if not self.is_ready or self._llm is None:
            raise RuntimeError("LLM yüklü değil.")

        cfg = cfg or GenerationConfig()

        # Manuel lock — finally'de bırak
        self._gen_lock.acquire()
        try:
            iterator = self._llm.create_chat_completion(
                messages=messages,
                temperature=cfg.temperature,
                top_p=cfg.top_p,
                top_k=cfg.top_k,
                max_tokens=cfg.max_tokens,
                repeat_penalty=cfg.repeat_penalty,
                stop=cfg.stop or None,
                stream=True,
            )
            for chunk in iterator:
                delta = chunk["choices"][0].get("delta", {})
                content = delta.get("content")
                if content:
                    yield content
        finally:
            self._gen_lock.release()
