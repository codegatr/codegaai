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
- Konsol açık (debug için ilk sürümde). Sonra --windowed'a geçeriz.
- PyWebView platform binary'leri ve llama-cpp DLL'leri elle toplanır.
- Veri dizini frozen modda %LOCALAPPDATA%\\CODEGA AI\\data'ya gider
  (config.py içinde otomatik).
"""

from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_submodules

SPEC_DIR = Path(SPECPATH).resolve()
PROJECT_ROOT = SPEC_DIR.parent

datas = []
binaries = []
hiddenimports = []

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

# ---- Statik veriler (UI + manifest) ----
datas += [
    (str(PROJECT_ROOT / "codegaai" / "ui" / "web"), "codegaai/ui/web"),
    (str(PROJECT_ROOT / "manifest.json"),           "."),
    (str(PROJECT_ROOT / "README.md"),               "."),
]

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
        "matplotlib", "scipy", "pandas", "IPython", "jupyter",
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
    console=True,         # İlk sürümde konsol görünür (hata teşhisi için)
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
