# -*- mode: python ; coding: utf-8 -*-
"""
CODEGA AI - PyInstaller Spec
=============================

Windows için tek-klasörlü (--onedir) bir dağıtım üretir.
Çalıştırmak için: pyinstaller build/codegaai.spec --noconfirm --clean

Çıktı:
    dist/codegaai/codegaai.exe       <- ana yürütülebilir
    dist/codegaai/_internal/...      <- Python runtime + tüm bağımlılıklar

Stratejı:
- Tek klasör (--onedir) modu, --onefile değil — onefile her açılışta
  Temp'e açıyor, ML kütüphaneleri büyük olduğundan başlatma yavaş kalır.
- Windows'ta konsol gizli; loglar dosyaya yazılır.
- PyWebView platform binary'leri ve llama-cpp DLL'leri elle toplanır.
- Veri dizini frozen modda %LOCALAPPDATA%\\CODEGA AI\\data'ya gider
  (config.py içinde otomatik).
"""

from pathlib import Path
from PyInstaller.utils.hooks import (
    collect_all, collect_submodules, collect_dynamic_libs, copy_metadata,
)

SPEC_DIR = Path(SPECPATH).resolve()
PROJECT_ROOT = SPEC_DIR.parent

datas = []
binaries = []
hiddenimports = []


def _force_bundle_package(pkg_name):
    """
    Bir Python paketinin TÜM dosyalarını (.py, .pyd, .dll, data files,
    alt klasörler dahil) bundle'a manuel koyar. PyInstaller'in
    collect_all + collect_dynamic_libs'i scipy/sklearn gibi karmaşık
    bilimsel paketler için yetmiyor — _ccallback_c.cp312-win_amd64.pyd
    gibi C uzantıları eksik kalıyor. Bu fonksiyon emin olmak için
    paketi olduğu gibi diske kopyalanacak şekilde işaretler.
    """
    import os
    import importlib
    try:
        pkg = importlib.import_module(pkg_name)
    except Exception as exc:
        print(f"[uyari] {pkg_name} import edilemedi: {exc}")
        return [], []

    pkg_dir = os.path.dirname(pkg.__file__)
    pkg_parent = os.path.dirname(pkg_dir)

    extra_datas = []
    extra_binaries = []

    for root, dirs, files in os.walk(pkg_dir):
        # __pycache__ klasorlerini atla
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for fname in files:
            if fname.endswith(".pyc"):
                continue
            src = os.path.join(root, fname)
            # Bundle icindeki goreli yol: pkg_name/alt/dizin/file
            rel_dir = os.path.relpath(root, pkg_parent)

            # .pyd ve .dll dosyalari binaries'e gider
            if fname.endswith((".pyd", ".dll", ".so")):
                extra_binaries.append((src, rel_dir))
            else:
                extra_datas.append((src, rel_dir))

    file_count = len(extra_datas) + len(extra_binaries)
    print(f"[ok] {pkg_name}: {file_count} dosya manuel bundle "
          f"({len(extra_binaries)} binary)")
    return extra_datas, extra_binaries


# scipy + sklearn + numpy: manuel full-directory bundling
# (PyInstaller'in scipy hook'undaki kronik C extension eksikligini
#  kokten cozer)
for pkg in ("scipy", "sklearn", "numpy"):
    _d, _b = _force_bundle_package(pkg)
    datas += _d
    binaries += _b

# ---- uvicorn lazy-loaded modülleri ----
hiddenimports += [
    "uvicorn.logging",
    "uvicorn.loops", "uvicorn.loops.auto", "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http", "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets", "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.lifespan", "uvicorn.lifespan.on", "uvicorn.lifespan.off",
]

# ---- CODEGA AI — TÜM routes ve core modülleri -------------------------
# collect_submodules kullan: yeni dosya eklense bile otomatik bulur
hiddenimports += collect_submodules("codegaai.api.routes")
hiddenimports += collect_submodules("codegaai.core")
hiddenimports += collect_submodules("codegaai.utils")
hiddenimports += collect_submodules("codegaai.plugins")

# ---- Faz 7 — DPO -------------------------------------------------------
for _pkg in ("peft", "trl", "datasets", "accelerate"):
    try:
        hiddenimports += collect_submodules(_pkg)
    except Exception:
        pass

# ---- Faz 11 — Vision ---------------------------------------------------
for _pkg in ("einops", "torchvision"):
    try:
        hiddenimports += collect_submodules(_pkg)
    except Exception:
        pass

# ---- Faz 27 — Plugin dependencies -------------------------------------
for _pkg in ("sounddevice", "openwakeword"):
    try:
        hiddenimports += collect_submodules(_pkg)
    except Exception:
        pass

# ---- PDF / OCR ---------------------------------------------------------
for _pkg in ("fitz", "pdfplumber", "easyocr", "cv2"):
    try:
        hiddenimports += collect_submodules(_pkg)
    except Exception:
        pass


# ---- PyWebView (platform-specific binaries: pythonnet, edgechromium) ----
try:
    pw_d, pw_b, pw_h = collect_all("webview")
    datas += pw_d; binaries += pw_b; hiddenimports += pw_h
except Exception as exc:
    print(f"[uyarı] webview toplama atlandı: {exc}")

# ---- llama-cpp-python (C++ DLL'leri için kritik) ----
try:
    ll_d, ll_b, ll_h = collect_all("llama_cpp")
    datas += ll_d; binaries += ll_b; hiddenimports += ll_h
except Exception as exc:
    print(f"[uyarı] llama_cpp toplama atlandı: {exc}")

# ---- sentence-transformers + torch (embedding) ----
try:
    st_d, st_b, st_h = collect_all("sentence_transformers")
    datas += st_d; binaries += st_b; hiddenimports += st_h
except Exception as exc:
    print(f"[uyarı] sentence_transformers toplama atlandı: {exc}")

# scipy/sklearn/numpy yukarida _force_bundle_package ile manuel
# yapildi. Bu yeterli — collect_all/collect_submodules/collect_dynamic_libs
# scipy hook'unda buggy oldugu icin atlandi.

# ---- chromadb (RAG) ----
try:
    cd_d, cd_b, cd_h = collect_all("chromadb")
    datas += cd_d; binaries += cd_b; hiddenimports += cd_h
except Exception as exc:
    print(f"[uyarı] chromadb toplama atlandı: {exc}")

# ---- huggingface_hub ----
try:
    hf_d, hf_b, hf_h = collect_all("huggingface_hub")
    datas += hf_d; binaries += hf_b; hiddenimports += hf_h
except Exception as exc:
    print(f"[uyarı] huggingface_hub toplama atlandı: {exc}")

# ---- Faz 4: diffusers + accelerate + transformers (görsel üretim) ----
try:
    df_d, df_b, df_h = collect_all("diffusers")
    datas += df_d; binaries += df_b; hiddenimports += df_h
except Exception as exc:
    print(f"[uyarı] diffusers toplama atlandı: {exc}")

try:
    ac_d, ac_b, ac_h = collect_all("accelerate")
    datas += ac_d; binaries += ac_b; hiddenimports += ac_h
except Exception as exc:
    print(f"[uyarı] accelerate toplama atlandı: {exc}")

try:
    tr_d, tr_b, tr_h = collect_all("transformers")
    datas += tr_d; binaries += tr_b; hiddenimports += tr_h
except Exception as exc:
    print(f"[uyarı] transformers toplama atlandı: {exc}")

# ---- Faz 5: faster-whisper (ASR) + TTS (XTTS) ----
try:
    fw_d, fw_b, fw_h = collect_all("faster_whisper")
    datas += fw_d; binaries += fw_b; hiddenimports += fw_h
except Exception as exc:
    print(f"[uyarı] faster_whisper toplama atlandı: {exc}")

try:
    tts_d, tts_b, tts_h = collect_all("TTS")
    datas += tts_d; binaries += tts_b; hiddenimports += tts_h
except Exception as exc:
    print(f"[uyarı] TTS toplama atlandı (devam ediyor): {exc}")

try:
    sf_d, sf_b, sf_h = collect_all("soundfile")
    datas += sf_d; binaries += sf_b; hiddenimports += sf_h
except Exception as exc:
    print(f"[uyarı] soundfile toplama atlandı: {exc}")

# ---- Faz 6: imageio (video export_to_video için) ----
try:
    io_d, io_b, io_h = collect_all("imageio")
    datas += io_d; binaries += io_b; hiddenimports += io_h
except Exception as exc:
    print(f"[uyarı] imageio toplama atlandı: {exc}")

try:
    iff_d, iff_b, iff_h = collect_all("imageio_ffmpeg")
    datas += iff_d; binaries += iff_b; hiddenimports += iff_h
except Exception as exc:
    print(f"[uyarı] imageio_ffmpeg toplama atlandı: {exc}")

# ---- Statik veriler (UI + manifest + plugins) ----
datas += [
    (str(PROJECT_ROOT / "codegaai" / "ui" / "web"), "codegaai/ui/web"),
    (str(PROJECT_ROOT / "manifest.json"),           "."),
    (str(PROJECT_ROOT / "README.md"),               "."),
]

# plugins/ dizini varsa ekle
_plugins_dir = PROJECT_ROOT / "codegaai" / "plugins"
if _plugins_dir.exists():
    datas += [(str(_plugins_dir), "codegaai/plugins")]

# ---- codegaai paketinin tüm alt modüllerini garantiye al ----
hiddenimports += collect_submodules("codegaai")


a = Analysis(
    [str(PROJECT_ROOT / "launcher.py")],
    pathex=[str(PROJECT_ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Boyutu küçültmek için dışlanan paketler
        # NOT: scipy/sklearn/numpy ÇIKARILDI excludes'tan — transformers
        # ve sentence-transformers tarafından zorunlu olarak import
        # ediliyorlar, exclude edilirse runtime'da çöküyor.
        "matplotlib", "pandas", "IPython", "jupyter",
        "notebook", "pytest", "tkinter",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="codegaai",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,        # Kullanıcıda ikinci DOS penceresi açılmasın
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,            # İleride ico ekleriz
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="codegaai",
)
