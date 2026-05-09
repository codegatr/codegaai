#!/bin/bash
# ============================================================
# CODEGA AI - Ubuntu Sunucu Kurulum Betiği
# ============================================================
# Tek komutla sunucuya kurar:
#   curl -fsSL https://raw.githubusercontent.com/codegatr/codegaai/main/deploy/install.sh | sudo bash -s -- --domain ai.codega.com.tr --email yunus@codega.com.tr
#
# Veya manuel:
#   git clone https://github.com/codegatr/codegaai.git /opt/codegaai
#   sudo /opt/codegaai/deploy/install.sh --domain ai.codega.com.tr
#
# Gereksinimler: Ubuntu 22.04+ (root yetki)
# ============================================================

set -euo pipefail

# ------------------------------------------------------------
# Yapılandırma
# ------------------------------------------------------------
INSTALL_DIR="/opt/codegaai"
DATA_DIR="/var/lib/codegaai"
ETC_DIR="/etc/codegaai"
SERVICE_USER="codegaai"
SERVICE_GROUP="codegaai"
PYTHON_VERSION="python3.12"
DOMAIN=""
EMAIL=""
SKIP_SSL=0
GPU=""

# Argümanları parse et
while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain)   DOMAIN="$2"; shift 2 ;;
        --email)    EMAIL="$2"; shift 2 ;;
        --skip-ssl) SKIP_SSL=1; shift ;;
        --gpu)      GPU="$2"; shift 2 ;;  # cuda | cpu
        --help|-h)
            cat <<EOF
CODEGA AI Ubuntu Kurulum

Kullanım:
  $0 --domain <domain> [--email <email>] [--skip-ssl] [--gpu cuda|cpu]

Örnek:
  $0 --domain ai.codega.com.tr --email yunus@codega.com.tr

Adımlar:
  1. Sistem paketleri (python3.12, nginx, certbot, build tools)
  2. CUDA tespiti / kurulum tavsiyesi
  3. Klone + venv + bağımlılıklar
  4. systemd unit: codegaai.service
  5. Nginx reverse proxy
  6. Let's Encrypt SSL (skip-ssl ile atlatılabilir)
  7. Auth token üretimi
EOF
            exit 0
            ;;
        *) echo "Bilinmeyen arg: $1"; exit 1 ;;
    esac
done

# ------------------------------------------------------------
# Yardımcılar
# ------------------------------------------------------------
log()  { echo -e "\033[1;36m[CODEGA-AI]\033[0m $*"; }
warn() { echo -e "\033[1;33m[UYARI]\033[0m $*"; }
err()  { echo -e "\033[1;31m[HATA]\033[0m $*" >&2; }
die()  { err "$*"; exit 1; }

[[ $EUID -eq 0 ]] || die "Bu betik root olarak çalıştırılmalı: sudo bash $0 ..."

# ------------------------------------------------------------
# Adım 1: Sistem paketleri
# ------------------------------------------------------------
log "1/7 Sistem paketleri kuruluyor..."

apt-get update -qq

apt-get install -y \
    software-properties-common \
    curl wget git \
    build-essential cmake pkg-config \
    nginx \
    ufw

# Python 3.12 (Ubuntu 22.04'te PPA gerekli, 24.04'te yerleşik)
if ! command -v $PYTHON_VERSION &>/dev/null; then
    log "Python 3.12 kuruluyor (deadsnakes PPA)..."
    add-apt-repository -y ppa:deadsnakes/ppa
    apt-get update -qq
    apt-get install -y python3.12 python3.12-venv python3.12-dev
fi

# certbot (SSL atlanmadıysa)
if [[ $SKIP_SSL -eq 0 ]]; then
    apt-get install -y certbot python3-certbot-nginx
fi

# ------------------------------------------------------------
# Adım 2: GPU tespiti
# ------------------------------------------------------------
log "2/7 GPU kontrolü..."

if [[ -z "$GPU" ]]; then
    if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
        GPU="cuda"
        log "  NVIDIA GPU tespit edildi:"
        nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | sed 's/^/    /'
    else
        GPU="cpu"
        warn "  GPU bulunamadı. CPU modunda çalışacak (yavaş)."
        warn "  CUDA için: https://developer.nvidia.com/cuda-downloads"
    fi
fi

# ------------------------------------------------------------
# Adım 3: Klone + venv
# ------------------------------------------------------------
log "3/7 Repo + Python ortamı..."

# Servis kullanıcısı
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd --system --create-home --home-dir "/home/$SERVICE_USER" \
            --shell /bin/bash "$SERVICE_USER"
fi

# Dizinler
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$ETC_DIR"
chown "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR" "$DATA_DIR"

# Klone (zaten varsa pull)
if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "  Mevcut kurulum var, güncelleniyor..."
    sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" pull --rebase
else
    sudo -u "$SERVICE_USER" git clone --depth 1 \
        https://github.com/codegatr/codegaai.git "$INSTALL_DIR"
fi

# venv
log "  Sanal ortam oluşturuluyor..."
sudo -u "$SERVICE_USER" $PYTHON_VERSION -m venv "$INSTALL_DIR/venv"

# Bağımlılıklar
log "  Python bağımlılıkları kuruluyor (5-10 dk)..."
sudo -u "$SERVICE_USER" "$INSTALL_DIR/venv/bin/pip" install --upgrade pip wheel setuptools

# llama-cpp-python — CUDA build flag'i (varsa)
if [[ "$GPU" == "cuda" ]]; then
    log "  llama-cpp-python CUDA destekli derleniyor..."
    sudo -u "$SERVICE_USER" \
        CMAKE_ARGS="-DLLAMA_CUDA=on" \
        FORCE_CMAKE=1 \
        "$INSTALL_DIR/venv/bin/pip" install llama-cpp-python --no-cache-dir
fi

sudo -u "$SERVICE_USER" "$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

# ------------------------------------------------------------
# Adım 4: Auth token + env dosyası
# ------------------------------------------------------------
log "4/7 Yapılandırma..."

# Auth token üret (yoksa)
AUTH_FILE="$ETC_DIR/auth.env"
if [[ ! -f "$AUTH_FILE" ]]; then
    AUTH_TOKEN=$(openssl rand -hex 32)
    cat > "$AUTH_FILE" <<EOF
# CODEGA AI auth yapılandırması
# Bu dosya systemd unit'i tarafından okunur (EnvironmentFile)

# Token: bu değeri tarayıcıda /login sayfasında gireceksiniz
CODEGAAI_AUTH__TOKEN=$AUTH_TOKEN

# Server modu: 0.0.0.0'a bağla (Nginx arkasında)
CODEGAAI_SERVER__MODE=server
CODEGAAI_SERVER__HOST=127.0.0.1
CODEGAAI_SERVER__PORT=8765
CODEGAAI_SERVER__AUTO_OPEN_UI=false

# HTTPS arkasında — secure cookie aktif
CODEGAAI_AUTH__COOKIE_SECURE=true

# Veri dizini
CODEGAAI_DATA_DIR=$DATA_DIR

# HuggingFace cache (büyük modeller buraya iner)
HF_HOME=$DATA_DIR/cache/huggingface
EOF
    chmod 600 "$AUTH_FILE"
    chown root:"$SERVICE_GROUP" "$AUTH_FILE"
    log "  Auth token üretildi: $AUTH_FILE"
else
    log "  Mevcut auth.env korunuyor."
    AUTH_TOKEN=$(grep -oP 'CODEGAAI_AUTH__TOKEN=\K.*' "$AUTH_FILE" || echo "")
fi

# ------------------------------------------------------------
# Adım 5: systemd unit
# ------------------------------------------------------------
log "5/7 systemd servisi..."

cp "$INSTALL_DIR/deploy/codegaai.service" /etc/systemd/system/codegaai.service
systemctl daemon-reload
systemctl enable codegaai
systemctl restart codegaai

# Servisin başladığını doğrula
sleep 3
if ! systemctl is-active --quiet codegaai; then
    err "codegaai servisi başlatılamadı. Loglar:"
    journalctl -u codegaai --no-pager -n 50
    die "Kurulum yarıda kaldı."
fi
log "  Servis aktif: systemctl status codegaai"

# ------------------------------------------------------------
# Adım 6: Nginx reverse proxy
# ------------------------------------------------------------
if [[ -n "$DOMAIN" ]]; then
    log "6/7 Nginx ($DOMAIN)..."

    # nginx config'i template'ten üret (domain replace)
    sed "s/__DOMAIN__/$DOMAIN/g" "$INSTALL_DIR/deploy/nginx-codegaai.conf" \
        > /etc/nginx/sites-available/codegaai
    ln -sf /etc/nginx/sites-available/codegaai /etc/nginx/sites-enabled/codegaai
    rm -f /etc/nginx/sites-enabled/default

    nginx -t
    systemctl reload nginx

    # Firewall
    ufw allow 'Nginx Full' &>/dev/null || true
    ufw allow OpenSSH &>/dev/null || true

    log "  Nginx aktif: http://$DOMAIN"
else
    log "6/7 Nginx kurulumu atlandı (--domain verilmedi)"
fi

# ------------------------------------------------------------
# Adım 7: SSL (Let's Encrypt)
# ------------------------------------------------------------
if [[ -n "$DOMAIN" && $SKIP_SSL -eq 0 ]]; then
    log "7/7 SSL sertifikası (Let's Encrypt)..."

    if [[ -z "$EMAIL" ]]; then
        warn "  --email verilmedi, SSL atlanıyor."
        warn "  Manuel: sudo certbot --nginx -d $DOMAIN"
    else
        certbot --nginx -d "$DOMAIN" \
            --non-interactive --agree-tos --email "$EMAIL" \
            --redirect || warn "SSL kurulumu başarısız (DNS ayarlı mı?)"

        # Otomatik yenileme cron
        systemctl enable certbot.timer 2>/dev/null || true
    fi
else
    log "7/7 SSL atlandı"
fi

# ------------------------------------------------------------
# Bitiş
# ------------------------------------------------------------
echo
echo "============================================================"
echo "  KURULUM TAMAMLANDI"
echo "============================================================"
echo
if [[ -n "$DOMAIN" ]]; then
    if [[ $SKIP_SSL -eq 0 && -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
        echo "  URL    : https://$DOMAIN/"
    else
        echo "  URL    : http://$DOMAIN/"
    fi
else
    echo "  URL    : http://<sunucu-ip>:8765/  (sadece localhost)"
fi
echo "  Token  : $AUTH_TOKEN"
echo "  Veri   : $DATA_DIR"
echo "  Loglar : journalctl -u codegaai -f"
echo
echo "  Token'ı güvenli yere kaydedin — /login sayfasında gerekli."
echo
echo "  Modeller'ı aç → indir → yükle → sohbet etmeye başla."
echo "  Güncelleme için: sudo $INSTALL_DIR/deploy/update.sh"
echo "============================================================"
