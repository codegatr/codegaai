"""
codegaai.utils.system_check
============================

Sistem gereksinim kontrolü.

`launcher.py --check` ile çağrılır. Şunları tespit eder:

- Python sürümü
- İşletim sistemi
- CPU çekirdek sayısı
- RAM (toplam, kullanılabilir)
- GPU (NVIDIA için CUDA, Apple Silicon için MPS)
- Disk (boş alan)

Her madde için ✓ / ⚠ / ✗ durumunu raporlar.
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Optional


# ============================================================
# Veri yapıları
# ============================================================

@dataclass
class CheckResult:
    """Tek bir kontrolün sonucu."""
    name: str
    status: str          # "ok", "warn", "fail", "info"
    message: str
    detail: Optional[str] = None


@dataclass
class SystemReport:
    """Tüm kontrollerin birleşik raporu."""
    results: list[CheckResult] = field(default_factory=list)

    @property
    def has_failures(self) -> bool:
        return any(r.status == "fail" for r in self.results)

    @property
    def has_warnings(self) -> bool:
        return any(r.status == "warn" for r in self.results)

    @property
    def overall_status(self) -> str:
        if self.has_failures:
            return "fail"
        if self.has_warnings:
            return "warn"
        return "ok"


# ============================================================
# Bireysel kontroller
# ============================================================

def check_python() -> CheckResult:
    """Python sürümü kontrolü (3.10–3.12 destekleniyor)."""
    v = sys.version_info
    version_str = f"{v.major}.{v.minor}.{v.micro}"

    if v.major != 3:
        return CheckResult("Python", "fail",
                           f"Python {version_str} desteklenmiyor (3.10–3.12 gerekli)")

    if v.minor < 10:
        return CheckResult("Python", "fail",
                           f"Python {version_str} çok eski (3.10+ gerekli)")

    if v.minor > 12:
        return CheckResult("Python", "warn",
                           f"Python {version_str} test edilmedi (3.10–3.12 önerilir)")

    return CheckResult("Python", "ok", f"Python {version_str}")


def check_os() -> CheckResult:
    """İşletim sistemi tespiti."""
    system = platform.system()
    release = platform.release()
    machine = platform.machine()

    label = f"{system} {release} ({machine})"

    if system in ("Windows", "Linux", "Darwin"):
        return CheckResult("İşletim Sistemi", "ok", label)

    return CheckResult("İşletim Sistemi", "warn",
                       f"{label} - test edilmedi")


def check_cpu() -> CheckResult:
    """CPU çekirdek kontrolü."""
    try:
        import psutil  # type: ignore[import-not-found]
        physical = psutil.cpu_count(logical=False) or 0
        logical = psutil.cpu_count(logical=True) or 0
        cpu_name = platform.processor() or "bilinmiyor"

        msg = f"{physical} fiziksel / {logical} mantıksal çekirdek"
        detail = cpu_name if cpu_name != "bilinmiyor" else None

        if physical < 4:
            return CheckResult("CPU", "warn",
                               f"{msg} - 4+ çekirdek önerilir", detail)
        return CheckResult("CPU", "ok", msg, detail)
    except ImportError:
        cpu_count = (
            __import__("os").cpu_count() or 0
        )
        return CheckResult("CPU", "info",
                           f"~{cpu_count} çekirdek (psutil yok, tahmini)")


def check_ram() -> CheckResult:
    """RAM kontrolü."""
    try:
        import psutil  # type: ignore[import-not-found]
        mem = psutil.virtual_memory()
        total_gb = mem.total / (1024 ** 3)
        avail_gb = mem.available / (1024 ** 3)

        msg = f"{total_gb:.1f} GB toplam, {avail_gb:.1f} GB kullanılabilir"

        if total_gb < 8:
            return CheckResult("RAM", "fail",
                               f"{msg} - 16+ GB gerekli")
        if total_gb < 16:
            return CheckResult("RAM", "warn",
                               f"{msg} - 16+ GB önerilir")
        if total_gb < 24:
            return CheckResult("RAM", "ok",
                               f"{msg} (24+ GB ideal)")
        return CheckResult("RAM", "ok", msg)
    except ImportError:
        return CheckResult("RAM", "info",
                           "psutil yok, RAM tespit edilemiyor")


def check_disk() -> CheckResult:
    """Disk boş alan kontrolü (kurulum dizini)."""
    try:
        from codegaai.config import PROJECT_ROOT
        usage = shutil.disk_usage(PROJECT_ROOT)
        free_gb = usage.free / (1024 ** 3)

        msg = f"{free_gb:.1f} GB boş"

        if free_gb < 30:
            return CheckResult("Disk", "fail",
                               f"{msg} - en az 60 GB önerilir (modeller için)")
        if free_gb < 60:
            return CheckResult("Disk", "warn",
                               f"{msg} - 60+ GB önerilir")
        return CheckResult("Disk", "ok", msg)
    except Exception as exc:
        return CheckResult("Disk", "warn",
                           f"Tespit edilemedi: {exc}")


def check_gpu() -> CheckResult:
    """
    GPU tespiti. Sırayla dener:

    1. NVIDIA: nvidia-smi komutu
    2. Apple Silicon: platform.machine() == "arm64" + Darwin
    3. CPU fallback
    """
    system = platform.system()

    # ---- 1) NVIDIA ----
    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            output = subprocess.check_output(
                [nvidia_smi,
                 "--query-gpu=name,memory.total,driver_version",
                 "--format=csv,noheader,nounits"],
                stderr=subprocess.STDOUT,
                timeout=10,
            ).decode("utf-8", errors="replace").strip()

            if output:
                lines = [ln.strip() for ln in output.splitlines() if ln.strip()]
                first = lines[0]
                parts = [p.strip() for p in first.split(",")]
                if len(parts) >= 2:
                    name = parts[0]
                    vram_mb = float(parts[1])
                    vram_gb = vram_mb / 1024
                    driver = parts[2] if len(parts) >= 3 else "?"

                    detail = f"Sürücü: {driver}"
                    msg = f"{name} ({vram_gb:.1f} GB VRAM)"

                    if vram_gb < 6:
                        return CheckResult("GPU", "warn",
                                           f"{msg} - 6+ GB VRAM önerilir",
                                           detail)
                    if vram_gb < 12:
                        return CheckResult("GPU", "ok",
                                           f"{msg} (12+ GB ideal)",
                                           detail)
                    return CheckResult("GPU", "ok", msg, detail)
        except (subprocess.SubprocessError, ValueError, IndexError) as exc:
            return CheckResult("GPU", "warn",
                               f"NVIDIA tespit edildi ama detay alınamadı: {exc}")

    # ---- 2) Apple Silicon ----
    if system == "Darwin" and platform.machine() == "arm64":
        return CheckResult("GPU", "ok",
                           "Apple Silicon (Metal/MPS desteklenir)",
                           "Faz 5 video üretimi sınırlı olabilir")

    # ---- 3) CPU fallback ----
    return CheckResult("GPU", "fail",
                       "NVIDIA GPU bulunamadı",
                       "CPU-only modunda LLM çok yavaş, görsel/video imkânsız")


def check_cuda() -> CheckResult:
    """CUDA Toolkit sürüm kontrolü (NVIDIA için)."""
    nvcc = shutil.which("nvcc")
    if nvcc:
        try:
            output = subprocess.check_output(
                [nvcc, "--version"],
                stderr=subprocess.STDOUT,
                timeout=5,
            ).decode("utf-8", errors="replace")
            # "release 12.1, V12.1.105" benzeri satırı yakala
            for ln in output.splitlines():
                if "release" in ln.lower():
                    return CheckResult("CUDA", "ok", ln.strip())
            return CheckResult("CUDA", "ok", "CUDA Toolkit kuruludur")
        except subprocess.SubprocessError:
            pass

    # nvcc yoksa nvidia-smi'den runtime sürümünü dene
    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            output = subprocess.check_output(
                [nvidia_smi], stderr=subprocess.STDOUT, timeout=5,
            ).decode("utf-8", errors="replace")
            for ln in output.splitlines():
                if "CUDA Version" in ln:
                    return CheckResult("CUDA", "ok", ln.strip(),
                                       "(sürücü tarafından raporlanan)")
        except subprocess.SubprocessError:
            pass

    return CheckResult("CUDA", "info",
                       "CUDA Toolkit bulunamadı (Faz 2'de PyTorch ile birlikte gelir)")


# ============================================================
# Tüm kontrolleri çalıştır
# ============================================================

def run_all_checks() -> SystemReport:
    """Tüm sistem kontrollerini çalıştırır ve birleşik rapor döndürür."""
    report = SystemReport()
    report.results.extend([
        check_python(),
        check_os(),
        check_cpu(),
        check_ram(),
        check_disk(),
        check_gpu(),
        check_cuda(),
    ])
    return report


# ============================================================
# Yazdırma
# ============================================================

_STATUS_SYMBOLS = {
    "ok":   "✓",
    "warn": "⚠",
    "fail": "✗",
    "info": "ℹ",
}

_STATUS_COLORS = {
    "ok":   "green",
    "warn": "yellow",
    "fail": "red",
    "info": "cyan",
}


def print_report(report: SystemReport, use_rich: bool = True) -> None:
    """Raporu güzelce yazdır."""
    try:
        if use_rich:
            from rich.console import Console
            from rich.table import Table

            console = Console()
            console.print()
            console.print(
                "[bold cyan]CODEGA AI - Sistem Kontrolü[/bold cyan]"
            )
            console.print("─" * 60)

            table = Table(show_header=True, header_style="bold")
            table.add_column("", width=3)
            table.add_column("Bileşen", style="bold", width=18)
            table.add_column("Durum", width=40)
            table.add_column("Detay", style="dim")

            for r in report.results:
                color = _STATUS_COLORS[r.status]
                symbol = f"[{color}]{_STATUS_SYMBOLS[r.status]}[/{color}]"
                table.add_row(
                    symbol,
                    r.name,
                    r.message,
                    r.detail or "",
                )

            console.print(table)
            console.print("─" * 60)

            overall = report.overall_status
            color = _STATUS_COLORS[overall]
            label = {
                "ok":   "Sistem hazır.",
                "warn": "Sistem çalışır ama uyarılar var.",
                "fail": "Sistem hazır değil. Yukarıdaki ✗ sorunlarını çözün.",
            }[overall]
            console.print(f"[bold {color}]→ {label}[/bold {color}]")
            console.print()
            return
    except ImportError:
        pass

    # Düz metin fallback
    print()
    print("CODEGA AI - Sistem Kontrolü")
    print("-" * 60)
    for r in report.results:
        sym = _STATUS_SYMBOLS[r.status]
        line = f"  {sym} {r.name:<18} {r.message}"
        print(line)
        if r.detail:
            print(f"      {r.detail}")
    print("-" * 60)
    overall = report.overall_status
    label = {
        "ok":   "→ Sistem hazır.",
        "warn": "→ Sistem çalışır ama uyarılar var.",
        "fail": "→ Sistem hazır değil. Yukarıdaki sorunları çözün.",
    }[overall]
    print(label)
    print()
