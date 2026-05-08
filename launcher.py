#!/usr/bin/env python3
"""
CODEGA AI - Başlatıcı
======================

Ana giriş noktası. Üç modda çalışır:

    python launcher.py            # Uygulamayı başlat (Faz 7'den itibaren UI)
    python launcher.py --check    # Sadece sistem kontrolünü yap
    python launcher.py --version  # Sürüm bilgisini yazdır

Faz 1'de UI henüz yok. Bu sürümde --check ve --version işlevseldir.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Repo kökünü import path'e ekle (in-place çalışma için)
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


# ============================================================
# Komut: --version
# ============================================================

def cmd_version() -> int:
    """Sürüm bilgisini yazdır."""
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
# Komut: --check
# ============================================================

def cmd_check() -> int:
    """Sistem gereksinim kontrolü çalıştır."""
    report = run_all_checks()
    print_report(report)

    if report.has_failures:
        return 1
    return 0


# ============================================================
# Komut: --init
# ============================================================

def cmd_init() -> int:
    """Veri dizinlerini ve örnek config dosyasını oluştur."""
    log = get_logger(__name__)

    log.info("Veri dizinleri oluşturuluyor...")
    ensure_directories()

    paths = get_paths()
    for label, p in paths.items():
        if p.is_dir():
            log.info("  ✓ %s -> %s", label, p)

    log.info("Örnek yapılandırma dosyası yazılıyor...")
    example = write_example_config()
    log.info("  ✓ %s", example)

    log.info("İlk kurulum tamamlandı.")
    log.info("Kullanıcı yapılandırması için: cp %s %s",
             EXAMPLE_CONFIG_FILE.name, "config.toml")
    return 0


# ============================================================
# Komut: varsayılan (server start - Faz 1'de stub)
# ============================================================

def cmd_run() -> int:
    """Uygulamayı başlat. Faz 1'de bu sadece stub."""
    log = get_logger(__name__)

    log.info("CODEGA AI v%s başlatılıyor...", __version__)
    log.info("Faz: %s", __phase__)

    # Sistem kontrol özeti
    report = run_all_checks()
    if report.has_failures:
        log.error("Sistem kontrolü başarısız. Detay için: python launcher.py --check")
        return 1

    if report.has_warnings:
        log.warning("Sistem kontrolünde uyarılar var. Detay için: python launcher.py --check")

    # Dizinleri hazırla
    ensure_directories()

    # Yapılandırmayı yükle
    cfg = get_config()
    log.info("Yapılandırma yüklendi (dil=%s, sunucu=%s:%s)",
             cfg["app"]["language"],
             cfg["server"]["host"],
             cfg["server"]["port"])

    # Faz 1 stub mesajı
    log.info("─" * 60)
    log.info("Faz 1 (Temel İskelet) - bu sürüm sadece altyapı kurar.")
    log.info("Yapay zeka motorları sonraki fazlarda gelir:")
    log.info("  Faz 2: LLM Motoru     (sohbet + kod + RAG bellek)")
    log.info("  Faz 3: Görsel Üretim  (SDXL / FLUX.1)")
    log.info("  Faz 4: Ses           (XTTS + faster-whisper)")
    log.info("  Faz 5: Video Üretim  (CogVideoX-2B)")
    log.info("  Faz 6: Self-Learning (DPO + LoRA hot-swap)")
    log.info("  Faz 7: Masaüstü UI   (PyWebView)")
    log.info("  Faz 8: Akıllı Güncelle + .exe paketi")
    log.info("─" * 60)
    log.info("Sistem hazır. Faz 2 güncellemesini bekliyorsunuz.")
    return 0


# ============================================================
# CLI ana fonksiyonu
# ============================================================

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="codegaai",
        description="CODEGA AI - Yerelde çalışan, kendi kendine öğrenen yapay zeka",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Örnekler:
  python launcher.py             # Uygulamayı başlat
  python launcher.py --check     # Sistem kontrolü
  python launcher.py --init      # Dizinleri ve örnek yapılandırmayı oluştur
  python launcher.py --version   # Sürüm bilgisi
        """.strip(),
    )

    group = parser.add_mutually_exclusive_group()
    group.add_argument("--version", action="store_true",
                       help="Sürüm bilgisini yazdır")
    group.add_argument("--check", action="store_true",
                       help="Sistem gereksinim kontrolü yap")
    group.add_argument("--init", action="store_true",
                       help="İlk kurulum: dizinleri ve örnek config'i oluştur")

    args = parser.parse_args(argv)

    try:
        if args.version:
            return cmd_version()
        if args.check:
            return cmd_check()
        if args.init:
            return cmd_init()
        return cmd_run()
    except KeyboardInterrupt:
        print("\nKullanıcı iptal etti.")
        return 130
    except Exception as exc:
        log = get_logger(__name__)
        log.exception("Beklenmedik hata: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
