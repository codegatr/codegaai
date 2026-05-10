"""
codegaai.utils.logger
======================

Renkli terminal + döner dosya log'u tek bir logger sağlar.

Kullanım:

    from codegaai.utils.logger import get_logger
    log = get_logger(__name__)
    log.info("Sistem başladı")
    log.error("Bir şeyler ters gitti")
"""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional

try:
    from rich.logging import RichHandler
    _HAS_RICH = True
except ImportError:  # pragma: no cover
    _HAS_RICH = False

from codegaai.config import get_config, LOGS_DIR


# Tek seferlik kurulum bayrağı
_CONFIGURED: bool = False


def _setup_root_logger() -> None:
    """Kök logger'ı yapılandır (sadece bir kez)."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    cfg = get_config()
    log_cfg = cfg.get("logging", {})

    level_name = str(log_cfg.get("level", "INFO")).upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger("codegaai")
    root.setLevel(level)
    root.propagate = False

    # Mevcut handler'ları temizle (yeniden yükleme durumunda)
    for h in list(root.handlers):
        root.removeHandler(h)

    # ---- Konsol ----
    import sys
    frozen = getattr(sys, "frozen", False)

    if frozen:
        # PyInstaller frozen modda Rich konsolunu KULLANMA
        # [WinError 6] İşleyici geçersiz hatasını önler
        import os
        os.environ.setdefault("TQDM_DISABLE", "1")
        os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
        # transformers tqdm progress bar kapat
        try:
            import transformers.utils.logging as _tf_log
            _tf_log.disable_progress_bar()
        except Exception:
            pass

        console_handler: logging.Handler = logging.StreamHandler(sys.stderr)
        console_handler.setLevel(level)
        console_handler.setFormatter(
            logging.Formatter(
                "[%(asctime)s] %(levelname)-8s %(message)s",
                datefmt="%H:%M:%S",
            )
        )
    elif _HAS_RICH:
        console_handler = RichHandler(
            level=level,
            show_time=True,
            show_path=False,
            rich_tracebacks=True,
            markup=True,
        )
        console_handler.setFormatter(
            logging.Formatter("%(message)s", datefmt="[%X]")
        )
    else:
        console_handler = logging.StreamHandler()
        console_handler.setLevel(level)
        console_handler.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                datefmt="%H:%M:%S",
            )
        )
    root.addHandler(console_handler)

    # ---- Dosya (döner) ----
    log_file_str = log_cfg.get("file", "data/logs/codegaai.log")
    log_path = Path(log_file_str)
    if not log_path.is_absolute():
        # Varsayılan konum
        log_path = LOGS_DIR / Path(log_file_str).name

    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_path,
            maxBytes=int(log_cfg.get("max_bytes", 10_485_760)),
            backupCount=int(log_cfg.get("backup_count", 5)),
            encoding="utf-8",
        )
        file_handler.setLevel(level)
        file_handler.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(levelname)s] %(name)s [%(filename)s:%(lineno)d] %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        root.addHandler(file_handler)
    except OSError as exc:
        # Dosya yazılamıyorsa konsola devam et, uyarı bas
        root.warning("Log dosyası açılamadı (%s): %s", log_path, exc)

    _CONFIGURED = True


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    İsimlendirilmiş bir logger döndür.

    Args:
        name: Modül adı (genellikle __name__). None ise kök logger.

    Returns:
        Yapılandırılmış logging.Logger örneği.
    """
    _setup_root_logger()

    if name is None:
        return logging.getLogger("codegaai")

    if not name.startswith("codegaai"):
        name = f"codegaai.{name}"

    return logging.getLogger(name)


def set_level(level: str | int) -> None:
    """
    Çalışma zamanında log seviyesini değiştir.

    Args:
        level: "DEBUG", "INFO", "WARNING", "ERROR" veya int sabiti.
    """
    _setup_root_logger()
    if isinstance(level, str):
        level_int = getattr(logging, level.upper(), logging.INFO)
    else:
        level_int = level

    root = logging.getLogger("codegaai")
    root.setLevel(level_int)
    for h in root.handlers:
        h.setLevel(level_int)
