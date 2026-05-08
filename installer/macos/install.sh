#!/usr/bin/env bash
# ============================================================
# CODEGA AI - Linux / macOS Kurulum Betiği
# ============================================================
# Python 3.10-3.12 yüklü olmalıdır.
# ============================================================

set -e

# Repo köküne in
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "${SCRIPT_DIR}/../.."

GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
NC="\033[0m"

echo
echo "============================================================"
echo "  CODEGA AI - Linux / macOS Kurulumu"
echo "============================================================"
echo

# ---- Python kontrolü ----
PYTHON_BIN=""
for cmd in python3.12 python3.11 python3.10 python3 python; do
    if command -v "$cmd" >/dev/null 2>&1; then
        # Sürüm kontrolü (3.10-3.12)
        ver=$("$cmd" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
        major=$(echo "$ver" | cut -d. -f1)
        minor=$(echo "$ver" | cut -d. -f2)
        if [ "$major" = "3" ] && [ "$minor" -ge 10 ] && [ "$minor" -le 12 ]; then
            PYTHON_BIN="$cmd"
            echo -e "${GREEN}[OK]${NC} Python $ver bulundu ($cmd)"
            break
        fi
    fi
done

if [ -z "$PYTHON_BIN" ]; then
    echo -e "${RED}[HATA]${NC} Python 3.10-3.12 bulunamadı."
    echo "  Ubuntu/Debian: sudo apt install python3.11 python3.11-venv"
    echo "  Fedora       : sudo dnf install python3.11"
    echo "  macOS        : brew install python@3.11"
    exit 1
fi

# ---- Sanal ortam ----
if [ -d ".venv" ]; then
    echo -e "${BLUE}[INFO]${NC} .venv zaten mevcut, atlanıyor."
else
    echo -e "${BLUE}[INFO]${NC} Sanal ortam oluşturuluyor..."
    "$PYTHON_BIN" -m venv .venv
    echo -e "${GREEN}[OK]${NC} .venv oluşturuldu."
fi

# ---- Aktive et ----
# shellcheck disable=SC1091
source .venv/bin/activate

# ---- pip yükselt ----
echo -e "${BLUE}[INFO]${NC} pip güncelleniyor..."
python -m pip install --upgrade pip --quiet || \
    echo -e "${YELLOW}[UYARI]${NC} pip güncellenemedi, devam ediliyor."

# ---- Bağımlılıklar ----
echo -e "${BLUE}[INFO]${NC} Bağımlılıklar yükleniyor..."
pip install -r requirements.txt
echo -e "${GREEN}[OK]${NC} Bağımlılıklar yüklendi."

# ---- Init ----
echo -e "${BLUE}[INFO]${NC} Veri dizinleri oluşturuluyor..."
python launcher.py --init

# ---- Sistem kontrolü ----
echo
echo -e "${BLUE}[INFO]${NC} Sistem kontrolü çalıştırılıyor..."
python launcher.py --check || true

echo
echo "============================================================"
echo "  Kurulum tamamlandı."
echo
echo "  Başlatmak için:"
echo "    source .venv/bin/activate"
echo "    python launcher.py"
echo "============================================================"
echo
