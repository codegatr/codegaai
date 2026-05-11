"""
codegaai.core.plugin_manager
==============================

Faz 27 — Plugin / Eklenti Sistemi

plugins/ dizinindeki her klasör bir eklentidir:
  plugins/
    weather/
      manifest.json     ← isim, sürüm, komutlar
      handler.py        ← execute(command, params) → str
    calendar/
      manifest.json
      handler.py

manifest.json örneği:
{
  "id": "weather",
  "name": "Hava Durumu",
  "version": "1.0.0",
  "description": "OpenWeatherMap ile hava durumu",
  "commands": ["hava", "sıcaklık", "hava durumu"],
  "author": "CODEGA"
}
"""

from __future__ import annotations

import importlib.util
import json
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

PLUGINS_DIR = Path(__file__).parent.parent.parent / "plugins"


@dataclass
class PluginMeta:
    id: str
    name: str
    version: str = "1.0.0"
    description: str = ""
    commands: list[str] = field(default_factory=list)
    author: str = ""
    enabled: bool = True
    path: Path = field(default_factory=Path)


class PluginManager:
    """Singleton plugin yöneticisi."""

    _instance: Optional["PluginManager"] = None
    _lock = threading.Lock()

    @classmethod
    def get(cls) -> "PluginManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def __init__(self):
        self._plugins: dict[str, PluginMeta] = {}
        self._handlers: dict[str, Any] = {}
        self._load_all()

    # ── Yükleme ──────────────────────────────────────────────────────────

    def _load_all(self) -> None:
        PLUGINS_DIR.mkdir(exist_ok=True)
        # Yerleşik eklentileri de yükle
        builtin = Path(__file__).parent.parent / "plugins"
        for pdir in [PLUGINS_DIR, builtin]:
            if pdir.exists():
                for plugin_dir in pdir.iterdir():
                    if plugin_dir.is_dir() and (plugin_dir / "manifest.json").exists():
                        self._load_plugin(plugin_dir)

    def _load_plugin(self, plugin_dir: Path) -> bool:
        try:
            manifest = json.loads((plugin_dir / "manifest.json").read_text(encoding="utf-8"))
            pid = manifest.get("id", plugin_dir.name)
            meta = PluginMeta(
                id=pid, name=manifest.get("name", pid),
                version=manifest.get("version", "1.0.0"),
                description=manifest.get("description", ""),
                commands=manifest.get("commands", []),
                author=manifest.get("author", ""),
                path=plugin_dir,
            )
            handler_path = plugin_dir / "handler.py"
            if handler_path.exists():
                spec = importlib.util.spec_from_file_location(f"plugin_{pid}", handler_path)
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                self._handlers[pid] = mod
            self._plugins[pid] = meta
            log.info("Plugin yüklendi: %s v%s", meta.name, meta.version)
            return True
        except Exception as e:
            log.warning("Plugin yüklenemedi (%s): %s", plugin_dir.name, e)
            return False

    # ── Kullanım ─────────────────────────────────────────────────────────

    def match_command(self, text: str) -> Optional[tuple[str, PluginMeta]]:
        """Metinde plugin komutu var mı? Varsa (plugin_id, meta) döndür."""
        text_lower = text.lower()
        for pid, meta in self._plugins.items():
            if not meta.enabled:
                continue
            if any(cmd in text_lower for cmd in meta.commands):
                return pid, meta
        return None

    def execute(self, plugin_id: str, command: str, params: dict = None) -> str:
        """Plugin'i çalıştır, sonuç string döndür."""
        handler = self._handlers.get(plugin_id)
        if not handler:
            return f"Plugin '{plugin_id}' handler bulunamadı."
        if not hasattr(handler, "execute"):
            return f"Plugin '{plugin_id}' execute() fonksiyonu yok."
        try:
            result = handler.execute(command=command, params=params or {})
            return str(result)
        except Exception as e:
            return f"Plugin hatası: {e}"

    def list_plugins(self) -> list[dict]:
        return [
            {"id": m.id, "name": m.name, "version": m.version,
             "description": m.description, "commands": m.commands,
             "enabled": m.enabled, "has_handler": m.id in self._handlers}
            for m in self._plugins.values()
        ]

    def install_from_url(self, url: str) -> dict:
        """URL'den plugin ZIP indir ve kur."""
        import httpx, zipfile, io
        try:
            r = httpx.get(url, follow_redirects=True, timeout=30)
            r.raise_for_status()
            with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
                # manifest.json var mı?
                names = zf.namelist()
                manifest_files = [n for n in names if n.endswith("manifest.json")]
                if not manifest_files:
                    return {"error": "Geçersiz plugin: manifest.json yok"}
                manifest = json.loads(zf.read(manifest_files[0]).decode())
                pid = manifest.get("id", "unknown")
                dest = PLUGINS_DIR / pid
                dest.mkdir(parents=True, exist_ok=True)
                prefix = manifest_files[0].replace("manifest.json", "")
                for name in names:
                    if name.startswith(prefix):
                        rel = name[len(prefix):]
                        if rel:
                            (dest / rel).parent.mkdir(parents=True, exist_ok=True)
                            (dest / rel).write_bytes(zf.read(name))
            self._load_plugin(dest)
            return {"ok": True, "plugin_id": pid}
        except Exception as e:
            return {"error": str(e)}
