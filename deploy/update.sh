#!/bin/bash
# ============================================================
# CODEGA AI - Tek Komutla Güncelleme
# ============================================================
# Kullanım:
#   sudo /opt/codegaai/deploy/update.sh
#
# Yapar:
#   1. git pull
#   2. pip install -r requirements.txt --upgrade (varsa yeni paketler)
#   3. systemctl restart codegaai
#   4. Sağlık kontrolü
# ============================================================

set -euo pipefail

INSTALL_DIR="/opt/codegaai"
SERVICE_USER="codegaai"

log()  { echo -e "\033[1;36m[CODEGA-AI]\033[0m $*"; }
err()  { echo -e "\033[1;31m[HATA]\033[0m $*" >&2; }
die()  { err "$*"; exit 1; }

[[ $EUID -eq 0 ]] || die "sudo ile çalıştırın: sudo $0"

log "Güncelleme başlıyor..."

# Mevcut sürüm
OLD_VERSION=$(grep -oP '__version__ = "\K[^"]+' \
    "$INSTALL_DIR/codegaai/__init__.py" || echo "?")
log "  Mevcut sürüm: v$OLD_VERSION"

# Git pull
log "  Git pull..."
sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" fetch --tags origin
sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" pull --rebase origin main

NEW_VERSION=$(grep -oP '__version__ = "\K[^"]+' \
    "$INSTALL_DIR/codegaai/__init__.py" || echo "?")

if [[ "$OLD_VERSION" == "$NEW_VERSION" ]]; then
    log "  Zaten en güncel: v$NEW_VERSION"
    exit 0
fi

# Bağımlılıklar
log "  Bağımlılıklar (yeni paketler varsa)..."
sudo -u "$SERVICE_USER" "$INSTALL_DIR/venv/bin/pip" install \
    -r "$INSTALL_DIR/requirements.txt" --upgrade --quiet

# Servisi yeniden başlat
log "  Servis yeniden başlatılıyor..."
systemctl restart codegaai

# Sağlık kontrolü (10 sn içinde başlamalı)
sleep 5
if systemctl is-active --quiet codegaai; then
    log "  ✓ Servis aktif"
else
    err "Servis başlatılamadı:"
    journalctl -u codegaai --no-pager -n 30
    die "Geri alma için: cd $INSTALL_DIR && sudo -u $SERVICE_USER git reset --hard HEAD~1 && systemctl restart codegaai"
fi

# HTTP sağlık check
PORT=$(grep -oP 'CODEGAAI_SERVER__PORT=\K\d+' /etc/codegaai/auth.env || echo "8765")
sleep 2
if curl -sf "http://127.0.0.1:$PORT/api" | grep -q "$NEW_VERSION"; then
    log "  ✓ HTTP cevap veriyor"
else
    err "HTTP cevap vermiyor — service start tamamlanmamış olabilir."
fi

echo
echo "============================================================"
echo "  GÜNCELLEME TAMAMLANDI"
echo "  v$OLD_VERSION → v$NEW_VERSION"
echo "  Loglar: journalctl -u codegaai -f"
echo "============================================================"
