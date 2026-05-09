"""
codegaai.config
================

CODEGA AI yapılandırma yöneticisi.

Yapılandırma 3 katmandan birleşir:

1. **Yerleşik varsayılanlar** (DEFAULT_CONFIG)
2. **Kullanıcı dosyası** (`config.toml` - opsiyonel, kök dizinde)
3. **Çevre değişkenleri** (CODEGAAI_* önekli)

Sonraki katman önceki katmanın üzerine yazar. Yapılandırma değiştiğinde
program yeniden başlatılmalıdır.

Kullanım:

    from codegaai.config import get_config
    cfg = get_config()
    print(cfg["server"]["port"])
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

# Python 3.11+ tomllib yerleşik; daha eskide tomli paketi gerekir.
if sys.version_info >= (3, 11):
    import tomllib  # type: ignore[import-not-found]
else:
    try:
        import tomli as tomllib  # type: ignore[no-redef]
    except ImportError:  # pragma: no cover
        tomllib = None  # type: ignore[assignment]


# ============================================================
# Sabitler
# ============================================================

# Proje kök dizini.
# - Geliştirme: bu dosyanın iki üst dizini (repo kökü)
# - Frozen (.exe / PyInstaller): geçici extract dizini (sys._MEIPASS)
PROJECT_ROOT: Path = (
    Path(getattr(sys, "_MEIPASS", "")) if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parent.parent
)


def _resolve_data_dir() -> Path:
    """
    Veri dizinini koşullara göre seç.

    - Frozen (.exe): %LOCALAPPDATA%\\CODEGA AI\\data (Windows)
                     ~/.local/share/CODEGA AI/data (Linux/macOS)
                     Kullanıcının yazma izni vardır, install dizini değil.
    - Geliştirme: <repo>/data
    - Override: CODEGAAI_DATA_DIR çevre değişkeni varsa onu kullan.
    """
    # Manuel override
    env_dir = os.environ.get("CODEGAAI_DATA_DIR")
    if env_dir:
        return Path(env_dir).expanduser().resolve()

    # Frozen mod: AppData
    if getattr(sys, "frozen", False):
        if sys.platform == "win32":
            base = Path(os.environ.get("LOCALAPPDATA",
                                       Path.home() / "AppData" / "Local"))
        elif sys.platform == "darwin":
            base = Path.home() / "Library" / "Application Support"
        else:
            base = Path.home() / ".local" / "share"
        return base / "CODEGA AI" / "data"

    # Geliştirme
    return Path(__file__).resolve().parent.parent / "data"


# Veri dizini (tüm runtime verileri buraya yazılır, repoda yok)
DATA_DIR: Path = _resolve_data_dir()

# Alt dizinler
MODELS_DIR: Path = DATA_DIR / "models"
MEMORY_DIR: Path = DATA_DIR / "memory"
OUTPUTS_DIR: Path = DATA_DIR / "outputs"
LOGS_DIR: Path = DATA_DIR / "logs"
CACHE_DIR: Path = DATA_DIR / "cache"
TEMP_DIR: Path = DATA_DIR / "temp"

# Kullanıcı yapılandırma dosyası (opsiyonel)
USER_CONFIG_FILE: Path = PROJECT_ROOT / "config.toml"
EXAMPLE_CONFIG_FILE: Path = PROJECT_ROOT / "config.example.toml"

# Çevre değişkeni öneki
ENV_PREFIX: str = "CODEGAAI_"


# ============================================================
# Varsayılan yapılandırma
# ============================================================

DEFAULT_CONFIG: dict[str, Any] = {
    "app": {
        "name": "CODEGA AI",
        "language": "tr",
        "theme": "dark",
        "first_run": True,
    },
    "server": {
        "host": "127.0.0.1",
        "port": 8765,
        "log_level": "info",
        "auto_open_ui": True,
        # Server modu (Linux sunucu, headless): UI başlatmaz, public bind
        # CODEGAAI_SERVER__MODE=true env veya --server flag ile aktif
        "mode": "desktop",  # desktop | server
        # Public deployment için CORS allowed origins
        "cors_origins": [],  # boş = same-origin only
    },
    "auth": {
        # Token boş ise auth devre dışı (tek-kullanıcı masaüstü modu).
        # Server modu için MUTLAKA ayarlanmalı (env: CODEGAAI_AUTH__TOKEN
        # veya /etc/codegaai/auth.env üzerinden).
        # Üretmek için: openssl rand -hex 32
        "token": "",
        "session_cookie": "codegaai_session",
        "session_max_age": 30 * 24 * 3600,  # 30 gün
        # HTTPS arkasında ise secure=true (cookie sadece HTTPS'te gönderilir)
        "cookie_secure": False,
    },
    "models": {
        # Faz 2+ ile aktive olacak; isimler manifest.json ile senkron
        "llm": "qwen2.5-7b-instruct-q4_k_m",
        "embedding": "bge-m3",
        "image": "stable-diffusion-xl-base-1.0",
        "video": "cogvideox-2b",
        "tts": "xtts-v2",
        "asr": "faster-whisper-large-v3",
    },
    "hardware": {
        # Otomatik tespit override edilebilir
        "device": "auto",  # auto | cuda | mps | cpu
        "cuda_device_index": 0,
        "max_vram_gb": 0,  # 0 = otomatik
        "max_ram_gb": 0,   # 0 = otomatik
    },
    "memory": {
        "max_context_messages": 20,
        "embedding_chunk_size": 512,
        "vector_store": "chromadb",
        "core_memory_max_chars": 4000,
    },
    "learning": {
        "enabled": True,
        "min_dpo_pairs_for_training": 100,
        "lora_rank": 16,
        "lora_alpha": 32,
        "training_schedule": "weekly",  # off | daily | weekly
    },
    "update": {
        "auto_check": True,
        "channel": "stable",  # stable | beta
        "check_url": "https://api.github.com/repos/codegatr/codegaai/releases/latest",
    },
    "logging": {
        "level": "INFO",
        "file": "data/logs/codegaai.log",
        "max_bytes": 10_485_760,  # 10 MB
        "backup_count": 5,
    },
}


# ============================================================
# Yardımcılar
# ============================================================

def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """İki sözlüğü iç içe (recursive) birleştir. `override` öncelikli."""
    result = dict(base)
    for key, value in override.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _load_user_config() -> dict[str, Any]:
    """Kullanıcının config.toml dosyasını yükle. Yoksa boş sözlük döndür."""
    if not USER_CONFIG_FILE.exists():
        return {}

    if tomllib is None:  # pragma: no cover
        raise RuntimeError(
            "TOML okunamıyor. Python 3.11+ veya 'tomli' paketi gerekli."
        )

    try:
        with USER_CONFIG_FILE.open("rb") as fp:
            return tomllib.load(fp)
    except Exception as exc:
        raise ValueError(
            f"config.toml okunamadı: {exc}. Sözdizimini kontrol edin."
        ) from exc


def _apply_env_overrides(cfg: dict[str, Any]) -> dict[str, Any]:
    """
    CODEGAAI_BOLUM__ANAHTAR formatındaki çevre değişkenlerini uygula.

    Örnek: CODEGAAI_SERVER__PORT=9000 -> cfg["server"]["port"] = 9000
    """
    result = dict(cfg)
    for env_key, env_val in os.environ.items():
        if not env_key.startswith(ENV_PREFIX):
            continue
        path = env_key[len(ENV_PREFIX):].lower().split("__")
        if not path:
            continue

        # Değer tipini tahmin et
        value: Any = env_val
        if env_val.lower() in ("true", "false"):
            value = env_val.lower() == "true"
        else:
            try:
                value = int(env_val)
            except ValueError:
                try:
                    value = float(env_val)
                except ValueError:
                    pass

        # İç içe sözlüğe yaz
        node = result
        for part in path[:-1]:
            if part not in node or not isinstance(node[part], dict):
                node[part] = {}
            node = node[part]
        node[path[-1]] = value

    return result


def ensure_directories() -> None:
    """Çalışma zamanı dizinlerini oluştur (yoksa)."""
    for d in (DATA_DIR, MODELS_DIR, MEMORY_DIR, OUTPUTS_DIR,
              LOGS_DIR, CACHE_DIR, TEMP_DIR):
        d.mkdir(parents=True, exist_ok=True)


# ============================================================
# Public API
# ============================================================

_CACHED_CONFIG: dict[str, Any] | None = None


def get_config(reload: bool = False) -> dict[str, Any]:
    """
    Birleştirilmiş yapılandırmayı döndür.

    Args:
        reload: True ise önbelleği yok say, yeniden yükle.

    Returns:
        Tam birleştirilmiş yapılandırma sözlüğü.
    """
    global _CACHED_CONFIG

    if _CACHED_CONFIG is not None and not reload:
        return _CACHED_CONFIG

    cfg = dict(DEFAULT_CONFIG)
    user_cfg = _load_user_config()
    cfg = _deep_merge(cfg, user_cfg)
    cfg = _apply_env_overrides(cfg)

    _CACHED_CONFIG = cfg
    return cfg


def get_paths() -> dict[str, Path]:
    """Tüm önemli dizin yollarını döndür."""
    return {
        "project_root": PROJECT_ROOT,
        "data": DATA_DIR,
        "models": MODELS_DIR,
        "memory": MEMORY_DIR,
        "outputs": OUTPUTS_DIR,
        "logs": LOGS_DIR,
        "cache": CACHE_DIR,
        "temp": TEMP_DIR,
        "user_config": USER_CONFIG_FILE,
    }


def write_example_config() -> Path:
    """
    config.example.toml dosyasını DEFAULT_CONFIG'ten üret.
    Kullanıcı bunu config.toml olarak kopyalayıp düzenleyebilir.
    """
    lines = [
        "# CODEGA AI yapılandırma dosyası",
        "# Bu dosyayı 'config.toml' olarak kopyalayıp özelleştirin.",
        "# Tüm anahtarlar opsiyoneldir; eksik bırakılanlar varsayılanı alır.",
        "",
    ]

    def _serialize(prefix: str, data: dict[str, Any]) -> None:
        # Önce tablo başlığı
        if prefix:
            lines.append(f"[{prefix}]")
        # Skaler değerler
        for key, val in data.items():
            if isinstance(val, dict):
                continue
            if isinstance(val, str):
                lines.append(f'{key} = "{val}"')
            elif isinstance(val, bool):
                lines.append(f"{key} = {'true' if val else 'false'}")
            else:
                lines.append(f"{key} = {val}")
        lines.append("")
        # Alt tablolar
        for key, val in data.items():
            if isinstance(val, dict):
                sub = f"{prefix}.{key}" if prefix else key
                _serialize(sub, val)

    _serialize("", DEFAULT_CONFIG)

    EXAMPLE_CONFIG_FILE.write_text("\n".join(lines), encoding="utf-8")
    return EXAMPLE_CONFIG_FILE
