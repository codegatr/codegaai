"""
codegaai.core.updater
======================

Akıllı Güncelleme (Faz 8).

GitHub Releases üzerinden uygulamanın yeni sürümünü tespit eder, kullanıcı
onay verirse yeni ZIP'i indirir, ve isteğe bağlı olarak self-replace ile
uygulamayı yeniden başlatır.

Klasör mimarisi:
- INSTALL_DIR: kullanıcının .exe'yi çıkardığı yer (frozen modda
  os.path.dirname(sys.executable))
- DATA_DIR: %LOCALAPPDATA%\\CODEGA AI\\data — kullanıcı verisi (silinmez)
- UPDATE_DIR: %LOCALAPPDATA%\\CODEGA AI\\updates\\<version>\\ — geçici

Self-replace stratejisi (Windows):
1. ZIP'i UPDATE_DIR\\new\\ altına çıkar
2. apply_update.bat betiği yazılır
3. Mevcut process kapanır, batch DETACHED_PROCESS ile başlar
4. Batch: 3 sn bekle → INSTALL_DIR'i tazele → yeni .exe'yi başlat

Güvenlik:
- Sadece codegatr/codegaai resmi GitHub repo'sundan yayımlanmış release'ler
- Asset adı pattern: codegaai-v*-windows-*.zip
- HTTPS only
- Kullanıcı her zaman onaylamak zorunda (otomatik güncelleme yok)
- Frozen modda olmayan (Python source) sürümlerde uygulama disabled

Kullanım:
    upd = Updater.get()
    info = upd.check_for_updates()
    if info["update_available"]:
        upd.download_async(info["latest_version"])
    # ...
    upd.apply()  # uygulamayı yeniden başlatır
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from codegaai import __version__
from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

# GitHub repo bilgisi (sabit, manipülasyona kapalı)
GITHUB_OWNER = "codegatr"
GITHUB_REPO = "codegaai"
GITHUB_API_BASE = "https://api.github.com"

# Asset adı pattern: codegaai-v0.7.0-windows-cpu.zip gibi
ASSET_PATTERN = re.compile(
    r"codegaai-v[\d\.]+-windows-(?:cpu|cuda)\.zip$",
    re.IGNORECASE,
)

UPDATES_DIR = DATA_DIR / "updates"


# ============================================================
# Sürüm karşılaştırma
# ============================================================

def parse_version(s: str) -> tuple[int, ...]:
    """`v0.7.0` veya `0.7.0` → (0, 7, 0). Hatalı format: (0,)."""
    s = s.strip().lstrip("v").strip()
    parts: list[int] = []
    for p in s.split("."):
        # Pre-release etiketlerini kırp (rc1, beta, +build vs.)
        m = re.match(r"\d+", p)
        if not m:
            break
        parts.append(int(m.group(0)))
    return tuple(parts) if parts else (0,)


def is_newer(latest: str, current: str) -> bool:
    """Latest > current ise True."""
    return parse_version(latest) > parse_version(current)


# ============================================================
# Updater
# ============================================================

@dataclass
class UpdateInfo:
    current_version: str
    latest_version: Optional[str] = None
    update_available: bool = False
    asset_name: Optional[str] = None
    asset_url: Optional[str] = None
    asset_size: int = 0
    release_notes: str = ""
    release_url: Optional[str] = None
    published_at: Optional[str] = None
    checked_at: Optional[float] = None
    error: Optional[str] = None


@dataclass
class DownloadStatus:
    state: str = "idle"  # idle | checking | downloading | ready | applying | error
    version: Optional[str] = None
    downloaded: int = 0
    total: int = 0
    percent: float = 0.0
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    zip_path: Optional[str] = None
    extracted_dir: Optional[str] = None
    error: Optional[str] = None
    can_apply: bool = False  # frozen mode + indirme tamam ise True

    def to_dict(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "version": self.version,
            "downloaded": self.downloaded,
            "total": self.total,
            "percent": self.percent,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "zip_path": self.zip_path,
            "extracted_dir": self.extracted_dir,
            "error": self.error,
            "can_apply": self.can_apply,
        }


class Updater:
    """Tek instance'lı güncelleme yöneticisi. Singleton."""

    _instance: Optional["Updater"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._last_check: Optional[UpdateInfo] = None
        self._download = DownloadStatus()
        self._cancel = threading.Event()
        self._dl_lock = threading.Lock()
        UPDATES_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def get(cls) -> "Updater":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @staticmethod
    def is_frozen() -> bool:
        """PyInstaller .exe modunda mı çalışıyoruz?"""
        return getattr(sys, "frozen", False)

    @staticmethod
    def install_dir() -> Optional[Path]:
        """
        Kullanıcının .exe'yi çıkardığı dizin.
        Frozen modda olmayan sürümlerde None döner.
        """
        if not Updater.is_frozen():
            return None

        # PyInstaller --onedir: exe parent
        candidate = Path(sys.executable).parent

        # codegaai.exe burada mı?
        exe_name = "codegaai.exe"
        if (candidate / exe_name).exists():
            return candidate

        # Bir üst dizinde mi?
        parent = candidate.parent
        if (parent / exe_name).exists():
            return parent

        # _internal klasörü varsa PyInstaller --onedir
        if (candidate / "_internal").is_dir():
            return candidate

        return candidate

    @property
    def status(self) -> dict[str, Any]:
        d = self._download.to_dict()
        d["current_version"] = __version__
        d["frozen_mode"] = self.is_frozen()
        d["install_dir"] = str(self.install_dir()) if self.install_dir() else None
        if self._last_check:
            d["last_check"] = {
                "checked_at": self._last_check.checked_at,
                "latest_version": self._last_check.latest_version,
                "update_available": self._last_check.update_available,
            }
        return d

    # ============================================================
    # Check (GitHub API)
    # ============================================================

    def check_for_updates(self, force: bool = False) -> UpdateInfo:
        """En son release'i sorgular, mevcut sürümle karşılaştırır."""
        info = UpdateInfo(current_version=__version__,
                           checked_at=time.time())
        try:
            import httpx  # type: ignore[import-not-found]

            url = (f"{GITHUB_API_BASE}/repos/"
                   f"{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest")
            headers = {
                "Accept": "application/vnd.github+json",
                "User-Agent": f"CODEGA-AI/{__version__}",
            }

            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                r = client.get(url, headers=headers)
                if r.status_code == 404:
                    info.error = "Henüz bir release yayımlanmamış."
                    self._last_check = info
                    return info
                r.raise_for_status()
                data = r.json()

            tag = data.get("tag_name", "")
            info.latest_version = tag
            info.release_url = data.get("html_url")
            info.published_at = data.get("published_at")
            info.release_notes = (data.get("body") or "")[:5000]

            # Windows ZIP asset'ini bul
            for asset in data.get("assets", []):
                name = asset.get("name", "")
                if ASSET_PATTERN.match(name):
                    info.asset_name = name
                    info.asset_url = asset.get("browser_download_url")
                    info.asset_size = asset.get("size", 0)
                    break

            info.update_available = is_newer(tag, __version__)
            log.info("Update check: %s vs %s, available=%s",
                     __version__, tag, info.update_available)

        except Exception as exc:
            log.exception("Update check başarısız: %s", exc)
            info.error = str(exc)

        self._last_check = info
        return info

    # ============================================================
    # Download
    # ============================================================

    def download_async(self, version: str) -> threading.Thread:
        """Belirtilen sürümü arka planda indir. UPDATES_DIR/<version>/ altına."""
        if self._download.state == "downloading":
            raise RuntimeError("Zaten bir indirme aktif")

        if not self._last_check or self._last_check.latest_version != version:
            # Tutarlılık için yeniden kontrol et
            self.check_for_updates(force=True)

        if not self._last_check or not self._last_check.asset_url:
            raise RuntimeError("Asset URL bulunamadı")

        if not self._last_check.update_available and version == __version__:
            raise RuntimeError("Mevcut sürüm zaten en güncel")

        self._cancel.clear()
        self._download = DownloadStatus(
            state="downloading",
            version=version,
            started_at=time.time(),
        )

        thread = threading.Thread(
            target=self._download_worker,
            args=(version, self._last_check.asset_url,
                  self._last_check.asset_name, self._last_check.asset_size),
            daemon=True,
            name=f"updater-download-{version}",
        )
        thread.start()
        return thread

    def cancel_download(self) -> bool:
        if self._download.state != "downloading":
            return False
        self._cancel.set()
        return True

    def _download_worker(self, version: str, url: str,
                          asset_name: str, expected_size: int) -> None:
        target_dir = UPDATES_DIR / version
        target_dir.mkdir(parents=True, exist_ok=True)
        zip_path = target_dir / asset_name
        partial = zip_path.with_suffix(".zip.part")

        try:
            import httpx  # type: ignore[import-not-found]

            log.info("Update indirme başladı: %s -> %s", url, partial)
            self._download.total = expected_size

            with self._dl_lock:
                with open(partial, "wb") as f:
                    headers = {"User-Agent": f"CODEGA-AI/{__version__}"}
                    with httpx.stream("GET", url, headers=headers,
                                       timeout=None,
                                       follow_redirects=True) as r:
                        r.raise_for_status()
                        # Content-length'ten total güncelle
                        total = int(r.headers.get("content-length",
                                                   expected_size or 0))
                        self._download.total = total
                        downloaded = 0
                        for chunk in r.iter_bytes(chunk_size=64 * 1024):
                            if self._cancel.is_set():
                                raise RuntimeError("İndirme iptal edildi")
                            f.write(chunk)
                            downloaded += len(chunk)
                            self._download.downloaded = downloaded
                            self._download.percent = (
                                100.0 * downloaded / total if total else 0
                            )

            # Atomik rename — Windows-safe
            if zip_path.exists():
                zip_path.unlink()
            os.replace(partial, zip_path)

            # Doğrulama: ZIP geçerli mi?
            if not zipfile.is_zipfile(str(zip_path)):
                raise RuntimeError("İndirilen dosya geçerli bir ZIP değil")

            # Aç
            extract_dir = target_dir / "new"
            if extract_dir.exists():
                shutil.rmtree(extract_dir)
            extract_dir.mkdir(parents=True)

            log.info("ZIP açılıyor: %s -> %s", zip_path, extract_dir)
            with zipfile.ZipFile(str(zip_path), "r") as zf:
                zf.extractall(str(extract_dir))

            # PyInstaller --onedir genelde tek alt klasör çıkarır:
            # codegaai-vX.Y.Z-windows-cpu/codegaai/...
            # Eğer öyleyse içeri girip o klasörü kullan
            # codegaai.exe'yi bul, onun klasörünü kullan
            found_exe = list(extract_dir.rglob("codegaai.exe"))
            if found_exe:
                extract_dir = found_exe[0].parent
                log.info("Güncelleme klasörü bulundu: %s", extract_dir)
            else:
                children = [p for p in extract_dir.iterdir() if p.is_dir()]
                if len(children) == 1:
                    extract_dir = children[0]

            self._download.state = "ready"
            self._download.completed_at = time.time()
            self._download.zip_path = str(zip_path)
            self._download.extracted_dir = str(extract_dir)
            self._download.percent = 100.0
            self._download.can_apply = self.is_frozen()

            log.info("Update indirme tamam: %s (apply hazır=%s)",
                     version, self._download.can_apply)

        except Exception as exc:
            log.exception("Update indirme hatası: %s", exc)
            self._download.state = "error"
            self._download.error = str(exc)
            self._download.completed_at = time.time()
            # Yarım dosyaları temizle
            if partial.exists():
                try:
                    partial.unlink()
                except Exception:
                    pass

    # ============================================================
    # Apply (self-replace)
    # ============================================================

    APPLY_BAT_TEMPLATE = r"""@echo off
REM CODEGA AI - Akilli Guncelleme v2
chcp 65001 > nul
setlocal EnableDelayedExpansion

echo.
echo =============================================
echo   CODEGA AI - Guncelleme Uygulanıyor
echo =============================================
echo   Surum  : {version}
echo   Kaynak : {new_dir}
echo   Hedef  : {install_dir}
echo   Log    : {log_file}
echo.

REM Kaynak ve hedefi dogrula
if not exist "{new_dir}" (
    echo HATA: Kaynak klasor bulunamadi: {new_dir}
    echo HATA: Kaynak bulunamadi >> "{log_file}"
    pause
    exit /b 1
)

REM Exe'nin kapanmasini bekle (maks 15 sn)
echo Eski surecin kapanmasi bekleniyor...
set /a WAITED=0
:wait_loop
timeout /t 1 /nobreak > nul
set /a WAITED+=1
tasklist /FI "IMAGENAME eq codegaai.exe" 2>nul | find /I "codegaai.exe" > nul
if not errorlevel 1 (
    if !WAITED! LSS 15 goto wait_loop
    echo Surecin kapanmasi bekleniyor... (zorla devam)
) else (
    echo Surecin kapandigi dogrulandi (%WAITED%s)
)

echo Kaynak dosyalari kopyalanıyor...
echo %date% %time% - Kopyalama basliyor >> "{log_file}"

REM PowerShell ile kopyala (robocopy'den daha guvenilir)
powershell -NoProfile -Command ^
    "Copy-Item -Path '{new_dir}\*' -Destination '{install_dir}' -Recurse -Force -ErrorAction Stop; Write-Host 'OK'"
set PSCOPY_ERR=%ERRORLEVEL%

if %PSCOPY_ERR% NEQ 0 (
    echo PowerShell basarisiz, robocopy deneniyor...
    robocopy "{new_dir}" "{install_dir}" /E /IS /IT /IM /NJH /NJS /NP 2>> "{log_file}"
    set RCOPY_ERR=%ERRORLEVEL%
    if !RCOPY_ERR! GEQ 8 (
        echo HATA: Kopyalama tamamen basarisiz. >> "{log_file}"
        echo HATA: Kopyalama basarisiz (ERRORLEVEL=!RCOPY_ERR!)
        pause
        exit /b 1
    )
)

echo %date% %time% - Kopyalama tamamlandi >> "{log_file}"
echo Kopyalama tamamlandi.

REM Yeni surumu baslat
echo Yeni surum baslatiliyor...
if exist "{install_dir}\codegaai.exe" (
    start "" "{install_dir}\codegaai.exe"
    echo %date% %time% - Yeni surum baslatildi >> "{log_file}"
) else (
    echo HATA: codegaai.exe bulunamadi: {install_dir}
    echo HATA: codegaai.exe bulunamadi >> "{log_file}"
)

REM Temizlik
timeout /t 3 /nobreak > nul
if exist "{new_dir}" rmdir /S /Q "{new_dir}" 2> nul

REM Kendi kendini sil
echo Tamamlandi. Bu pencere kapanıyor...
echo %date% %time% - Guncelleme tamamlandi >> "{log_file}"
(goto) 2>nul & del "%~f0"
"""

    def apply(self) -> dict[str, Any]:
        """
        Mevcut process'i kapat ve self-replace betiğini başlat.
        Bu fonksiyon dönmez (sys.exit edilir).
        """
        if not self.is_frozen():
            raise RuntimeError(
                "Otomatik güncelleme sadece .exe sürümünde çalışır. "
                "Python source kullanıyorsanız `git pull` yapın."
            )

        if self._download.state != "ready":
            raise RuntimeError(
                f"İndirme tamamlanmamış (state={self._download.state})"
            )

        new_dir = self._download.extracted_dir
        if not new_dir or not Path(new_dir).exists():
            raise RuntimeError("Yeni sürüm klasörü bulunamadı")

        install_dir = self.install_dir()
        if not install_dir:
            raise RuntimeError("Kurulum dizini tespit edilemedi")

        # new_dir içinde gerçek kaynak bul — ZIP yapısına göre değişir
        # Örn: new/codegaai-v1.6.0-windows-cpu/ → içine gir
        # İçinde codegaai.exe varsa doğru yer
        effective_new_dir = Path(new_dir)
        if not (effective_new_dir / "codegaai.exe").exists():
            # Bir seviye daha in
            for child in effective_new_dir.iterdir():
                if child.is_dir():
                    if (child / "codegaai.exe").exists():
                        effective_new_dir = child
                        log.info("Kaynak klasör düzeltildi: %s", effective_new_dir)
                        break
                    # İki seviye
                    for grandchild in child.iterdir():
                        if grandchild.is_dir() and (grandchild / "codegaai.exe").exists():
                            effective_new_dir = grandchild
                            log.info("Kaynak klasör (2. seviye) düzeltildi: %s",
                                     effective_new_dir)
                            break

        if not (effective_new_dir / "codegaai.exe").exists():
            log.warning("codegaai.exe bulunamadı: %s — tüm içerik kopyalanacak",
                        effective_new_dir)

        log_file = UPDATES_DIR / f"apply_{self._download.version}.log"

        # Batch script oluştur
        bat_path = UPDATES_DIR / f"apply_{self._download.version}.bat"
        bat_path.write_text(
            self.APPLY_BAT_TEMPLATE.format(
                version=self._download.version,
                install_dir=str(install_dir),
                new_dir=str(effective_new_dir),
                log_file=str(log_file),
            ),
            encoding="utf-8",  # UTF-8 (chcp 65001 aktif)
        )
        log.info("Apply batch script: %s", bat_path)
        log.info("Kaynak: %s → Hedef: %s", effective_new_dir, install_dir)

        self._download.state = "applying"

        # DETACHED_PROCESS ile başlat (Windows-only)
        DETACHED_PROCESS = 0x00000008
        CREATE_NEW_PROCESS_GROUP = 0x00000200

        try:
            subprocess.Popen(
                ["cmd.exe", "/c", str(bat_path)],
                creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
                close_fds=True,
                cwd=str(install_dir),
            )
        except Exception as exc:
            self._download.state = "error"
            self._download.error = f"Batch başlatma hatası: {exc}"
            raise

        result = {
            "applied": True,
            "version": self._download.version,
            "install_dir": str(install_dir),
            "bat_path": str(bat_path),
            "message": ("Güncelleme uygulanıyor. Uygulama 5 saniye içinde "
                        "kapanacak ve yeni sürüm açılacak."),
        }

        log.info("Apply başlatıldı, 2 sn sonra exit edilecek")

        # 2 sn beklet, batch'in başlamasına izin ver, sonra exit
        def delayed_exit():
            time.sleep(2)
            log.info("Apply için exit ediliyor...")
            os._exit(0)

        threading.Thread(target=delayed_exit, daemon=True).start()
        return result

    # ============================================================
    # Cleanup
    # ============================================================

    def cleanup_old_downloads(self, keep_latest: int = 1) -> int:
        """Eski sürümlerin indirme dosyalarını temizle."""
        if not UPDATES_DIR.exists():
            return 0
        dirs = sorted(
            [d for d in UPDATES_DIR.iterdir() if d.is_dir()],
            key=lambda p: parse_version(p.name),
            reverse=True,
        )
        deleted = 0
        for d in dirs[keep_latest:]:
            try:
                shutil.rmtree(d)
                deleted += 1
                log.info("Eski update silindi: %s", d.name)
            except Exception as exc:
                log.warning("Silinemedi %s: %s", d.name, exc)
        return deleted
