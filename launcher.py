#!/usr/bin/env python3
"""
CODEGA AI - Başlatıcı
======================

Ana giriş noktası. Şu modlarda çalışır:

    python launcher.py              # Masaüstü pencere (PyWebView)
    python launcher.py --browser    # Sistem tarayıcısında aç
    python launcher.py --serve      # Sadece sunucu (UI açma)
    python launcher.py --check      # Sistem kontrolü
    python launcher.py --init       # Veri dizinleri + örnek config
    python launcher.py --version    # Sürüm bilgisi
"""

from __future__ import annotations

import argparse
import faulthandler
import os
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from codegaai import __version__, __phase__, __author__, __license__, __repo__
from codegaai.config import (
    ensure_directories,
    get_config,
    get_paths,
    write_example_config,
    EXAMPLE_CONFIG_FILE,
)
from codegaai.utils.system_check import run_all_checks, print_report
from codegaai.utils.logger import get_logger


_CRASH_DUMP_HANDLE = None


def _enable_crash_dump() -> None:
    global _CRASH_DUMP_HANDLE
    try:
        from codegaai.config import LOGS_DIR
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        crash_log = LOGS_DIR / "crash_dump.log"
        fh = crash_log.open("a", encoding="utf-8")
        _CRASH_DUMP_HANDLE = fh
        faulthandler.enable(file=fh, all_threads=True)

        def _thread_hook(args: threading.ExceptHookArgs) -> None:
            print(
                f"\n[thread-exception] {args.thread.name}: "
                f"{args.exc_type.__name__}: {args.exc_value}",
                file=fh,
                flush=True,
            )

        threading.excepthook = _thread_hook
    except Exception:
        pass


if os.environ.get("CODEGA_DISABLE_CRASH_DUMP", "").strip() != "1":
    _enable_crash_dump()


# ============================================================
# --version
# ============================================================

def cmd_version() -> int:
    try:
        from rich.console import Console
        from rich.panel import Panel
        console = Console()
        body = (
            f"[bold]CODEGA AI[/bold] v{__version__}\n"
            f"[dim]{__phase__}[/dim]\n\n"
            f"Yazar : {__author__}\n"
            f"Lisans: {__license__}\n"
            f"Repo  : https://github.com/{__repo__}\n"
            f"\n[cyan]Yerelde çalışan, kendi kendine öğrenen yapay zeka.[/cyan]"
        )
        console.print(Panel(body, border_style="cyan", padding=(1, 2)))
    except ImportError:
        print(f"CODEGA AI v{__version__}")
        print(f"  {__phase__}")
        print(f"  Yazar : {__author__}")
        print(f"  Lisans: {__license__}")
        print(f"  Repo  : https://github.com/{__repo__}")
    return 0


# ============================================================
# --check
# ============================================================

def cmd_check() -> int:
    report = run_all_checks()
    print_report(report)
    return 1 if report.has_failures else 0


def cmd_native_preflight_llama(model_path: str,
                               n_ctx: int,
                               n_gpu_layers: int) -> int:
    """llama-cpp native yuklemesini cocuk surecte dener."""
    try:
        from codegaai.core.engine import LLMEngine
        LLMEngine._prepare_windows_cuda_dll_paths()
        from llama_cpp import Llama  # type: ignore[import-not-found]

        llm = Llama(
            model_path=model_path,
            n_ctx=max(512, int(n_ctx or 2048)),
            n_gpu_layers=int(n_gpu_layers),
            n_threads=1,
            n_batch=64,
            verbose=False,
            seed=-1,
        )
        del llm
        return 0
    except Exception as exc:
        print(f"native-preflight-error: {exc}", file=sys.stderr)
        return 70


# ============================================================
# --init
# ============================================================

def cmd_init() -> int:
    log = get_logger(__name__)
    log.info("Veri dizinleri oluşturuluyor...")
    ensure_directories()
    for label, p in get_paths().items():
        if isinstance(p, Path) and p.is_dir():
            log.info("  ✓ %s -> %s", label, p)

    log.info("Örnek yapılandırma dosyası yazılıyor...")
    example = write_example_config()
    log.info("  ✓ %s", example)

    log.info("İlk kurulum tamamlandı.")
    log.info("Kullanıcı yapılandırması için: cp %s %s",
             EXAMPLE_CONFIG_FILE.name, "config.toml")
    return 0


# ============================================================
# --serve (sadece sunucu)
# ============================================================

def cmd_serve() -> int:
    log = get_logger(__name__)
    ensure_directories()

    cfg = get_config()
    server_cfg = cfg["server"]
    auth_cfg = cfg.get("auth", {})

    is_server_mode = server_cfg.get("mode") == "server"
    auth_enabled = bool((auth_cfg.get("token") or "").strip())
    host = server_cfg["host"]
    port = server_cfg["port"]

    if is_server_mode:
        log.info("=" * 60)
        log.info("CODEGA AI - SERVER MODU (production)")
        log.info("=" * 60)
        log.info("Bind:  %s:%d", host, port)
        log.info("Auth:  %s", "AKTIF" if auth_enabled else
                 "!!! KAPALI - SERVER MODUNDA TOKEN ZORUNLU !!!")
        log.info("Veri:  %s", get_paths()["data"])

        if not auth_enabled:
            log.error("Server modunda auth.token boş olamaz.")
            log.error("Token oluştur: openssl rand -hex 32")
            log.error("Set: export CODEGAAI_AUTH__TOKEN=<token>")
            log.error("Veya /etc/codegaai/auth.env içine yaz.")
            return 2

        if host == "127.0.0.1":
            log.warning("host=127.0.0.1 — sadece yerel erişim.")
            log.warning("Public deployment için CODEGAAI_SERVER__HOST=0.0.0.0")
    else:
        log.info("CODEGA AI sunucusu başlatılıyor (backend-only).")
        log.info("UI: http://%s:%d/", host, port)

    try:
        from codegaai.api.server import run_server
    except ImportError as exc:
        log.error("FastAPI bağımlılıkları eksik: %s", exc)
        log.error("Yüklemek için: pip install -r requirements.txt")
        return 1

    run_server()
    return 0


# ============================================================
# --browser (sistem tarayıcısında)
# ============================================================

def cmd_browser() -> int:
    log = get_logger(__name__)
    ensure_directories()

    try:
        from codegaai.ui.window import open_in_browser
    except ImportError as exc:
        log.error("UI modülü yüklenemedi: %s", exc)
        return 1

    cfg = get_config()
    return open_in_browser(
        host=cfg["server"]["host"],
        port=int(cfg["server"]["port"]),
    )


# ============================================================
# Varsayılan: masaüstü penceresi
# ============================================================

def cmd_window() -> int:
    log = get_logger(__name__)
    log.info("CODEGA AI v%s başlatılıyor...", __version__)
    log.info("Faz: %s", __phase__)

    report = run_all_checks()
    if report.has_failures:
        log.warning("Sistem kontrolünde sorunlar var:")
        log.warning("Detay için: python launcher.py --check")
        log.warning("Faz 2'de UI yine de açılır; sonraki fazlarda donanım kritik.")

    ensure_directories()

    try:
        from codegaai.ui.window import open_window
    except ImportError as exc:
        log.error("UI modülü yüklenemedi: %s", exc)
        log.error("Bağımlılıkları yükleyin: pip install -r requirements.txt")
        return 1

    cfg = get_config()
    server_cfg = cfg["server"]

    return open_window(
        host=server_cfg["host"],
        port=int(server_cfg["port"]),
    )


# ============================================================
# CLI
# ============================================================

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="codegaai",
        description="CODEGA AI - Yerelde çalışan, kendi kendine öğrenen yapay zeka",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Örnekler:
  python launcher.py             # Masaüstü penceresi (PyWebView)
  python launcher.py --browser   # Sistem tarayıcısında aç
  python launcher.py --serve     # Sadece backend (UI açma)
  python launcher.py --check     # Sistem kontrolü
  python launcher.py --init      # İlk kurulum
  python launcher.py --version   # Sürüm
        """.strip(),
    )

    group = parser.add_mutually_exclusive_group()
    group.add_argument("--version", action="store_true",
                       help="Sürüm bilgisini yazdır")
    group.add_argument("--check", action="store_true",
                       help="Sistem gereksinim kontrolü")
    group.add_argument("--init", action="store_true",
                       help="İlk kurulum: dizinler + örnek config")
    group.add_argument("--serve", action="store_true",
                       help="Sadece backend sunucusunu çalıştır (UI açmadan)")
    group.add_argument("--browser", action="store_true",
                       help="Sunucuyu başlat ve sistem tarayıcısında aç")
    group.add_argument("--native-preflight-llama", nargs=3,
                       metavar=("MODEL_PATH", "N_CTX", "N_GPU_LAYERS"),
                       help=argparse.SUPPRESS)

    args = parser.parse_args(argv)

    try:
        if args.version: return cmd_version()
        if args.check:   return cmd_check()
        if args.init:    return cmd_init()
        if args.serve:   return cmd_serve()
        if args.browser: return cmd_browser()
        if args.native_preflight_llama:
            model_path, n_ctx, n_gpu_layers = args.native_preflight_llama
            return cmd_native_preflight_llama(
                model_path, int(n_ctx), int(n_gpu_layers)
            )
        return cmd_window()
    except KeyboardInterrupt:
        print("\nKullanıcı iptal etti.")
        return 130
    except Exception as exc:
        log = get_logger(__name__)
        log.exception("Beklenmedik hata: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
