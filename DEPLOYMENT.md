# CODEGA AI — Ubuntu Sunucu Kurulum Rehberi

`ai.codega.com.tr` gibi bir alt alan adından 7/24 erişilebilen, tek
kullanıcı (token ile korunan) bir CODEGA AI sunucusu için tam rehber.

## Mimari

```
[Tarayıcı]
    ↓ HTTPS
[Nginx :443] → SSL termination + reverse proxy
    ↓ HTTP
[FastAPI :8765] → CODEGA AI sunucusu (systemd service)
    ↓
[/var/lib/codegaai] → Modeller, sohbetler, çıktılar
```

## Önkoşullar

- **Ubuntu 22.04+** (root erişim)
- **Domain**: DNS A kaydı → sunucu IP'si (örn `ai.codega.com.tr`)
- **Donanım**:
  - Minimum: 4 vCPU, 16 GB RAM, 100 GB disk (CPU mode, yavaş)
  - Önerilen: 8 vCPU, 32 GB RAM, 200 GB disk + NVIDIA GPU 12+ GB VRAM
- **Açık portlar**: 80 (Let's Encrypt challenge), 443 (HTTPS), 22 (SSH)

## Tek Komutla Kurulum

```bash
curl -fsSL https://raw.githubusercontent.com/codegatr/codegaai/main/deploy/install.sh \
  | sudo bash -s -- --domain ai.codega.com.tr --email yunus@codega.com.tr
```

Bu komut:
1. Sistem paketlerini kurar (Python 3.12, nginx, certbot, build tools)
2. NVIDIA GPU varsa CUDA destekli `llama-cpp-python` derler
3. `codegaai` adında sistem kullanıcısı oluşturur
4. `/opt/codegaai`'a klone eder, venv kurar, bağımlılıkları yükler
5. `/etc/codegaai/auth.env`'de güvenli rastgele token üretir
6. `systemd` service'i kayıt eder ve başlatır
7. Nginx reverse proxy'yi yapılandırır
8. Let's Encrypt SSL sertifikası alır

5-10 dakika sürer. Bitiminde token konsolda gösterilir — **kaydet**.

## Manuel Kurulum

Daha fazla kontrol için:

```bash
# 1. Sistem
sudo apt update && sudo apt install -y python3.12 python3.12-venv git nginx certbot python3-certbot-nginx build-essential cmake

# 2. Kullanıcı + dizinler
sudo useradd --system --create-home --shell /bin/bash codegaai
sudo mkdir -p /opt/codegaai /var/lib/codegaai /etc/codegaai
sudo chown codegaai:codegaai /opt/codegaai /var/lib/codegaai

# 3. Klone + venv
sudo -u codegaai git clone https://github.com/codegatr/codegaai.git /opt/codegaai
sudo -u codegaai python3.12 -m venv /opt/codegaai/venv
sudo -u codegaai /opt/codegaai/venv/bin/pip install --upgrade pip wheel
sudo -u codegaai /opt/codegaai/venv/bin/pip install -r /opt/codegaai/requirements.txt

# 4. Token + env
sudo bash -c 'cat > /etc/codegaai/auth.env <<EOF
CODEGAAI_AUTH__TOKEN=$(openssl rand -hex 32)
CODEGAAI_SERVER__MODE=server
CODEGAAI_SERVER__HOST=127.0.0.1
CODEGAAI_SERVER__PORT=8765
CODEGAAI_AUTH__COOKIE_SECURE=true
CODEGAAI_DATA_DIR=/var/lib/codegaai
HF_HOME=/var/lib/codegaai/cache/huggingface
EOF'
sudo chmod 600 /etc/codegaai/auth.env
sudo chown root:codegaai /etc/codegaai/auth.env

# 5. systemd
sudo cp /opt/codegaai/deploy/codegaai.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now codegaai

# 6. Nginx
sudo sed 's/__DOMAIN__/ai.codega.com.tr/g' \
  /opt/codegaai/deploy/nginx-codegaai.conf > /etc/nginx/sites-available/codegaai
sudo ln -sf /etc/nginx/sites-available/codegaai /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 7. SSL
sudo certbot --nginx -d ai.codega.com.tr --non-interactive --agree-tos \
  --email yunus@codega.com.tr --redirect

# 8. Token'ı al
sudo grep CODEGAAI_AUTH__TOKEN /etc/codegaai/auth.env
```

## CUDA (NVIDIA GPU) Kurulumu

GPU yoksa atla — CPU modu çalışır ama yavaş.

```bash
# CUDA Toolkit (Ubuntu 22.04 için)
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update && sudo apt install -y cuda-toolkit-12-4

# llama-cpp-python'u CUDA ile yeniden derle
sudo -u codegaai bash -c '
    cd /opt/codegaai
    CMAKE_ARGS="-DLLAMA_CUDA=on" FORCE_CMAKE=1 \
    venv/bin/pip install llama-cpp-python --no-cache-dir --force-reinstall'

sudo systemctl restart codegaai
```

## Kullanım

1. Tarayıcıda `https://ai.codega.com.tr/` aç
2. Login sayfası → token'ı yapıştır → Giriş Yap
3. Sistem → Modeller → Qwen 2.5 7B + BGE-M3 → İndir → Yükle
4. Sohbet → mesaj gönder → 👍/👎 ver

## Yönetim Komutları

```bash
# Servis durumu
sudo systemctl status codegaai

# Loglar (canlı)
sudo journalctl -u codegaai -f

# Yeniden başlat
sudo systemctl restart codegaai

# Güncelle (git pull + restart)
sudo /opt/codegaai/deploy/update.sh

# Auth token'ı görüntüle
sudo grep TOKEN /etc/codegaai/auth.env

# Yeni token üret
sudo sed -i "s/CODEGAAI_AUTH__TOKEN=.*/CODEGAAI_AUTH__TOKEN=$(openssl rand -hex 32)/" \
    /etc/codegaai/auth.env
sudo systemctl restart codegaai

# Disk kullanımı (modeller burada)
du -sh /var/lib/codegaai/

# Veriyi yedekle (sohbet + ayarlar — modeller HARİÇ)
sudo tar czf codegaai-backup-$(date +%Y%m%d).tar.gz \
    /var/lib/codegaai/chats.db \
    /var/lib/codegaai/learning/ \
    /var/lib/codegaai/memory/ \
    /etc/codegaai/auth.env
```

## Sorun Giderme

### Servis başlamıyor

```bash
sudo journalctl -u codegaai -n 100 --no-pager
```

Yaygın sebepler:
- `CODEGAAI_AUTH__TOKEN` boş → `auth.env` doğru mu kontrol et
- Port 8765 başka bir uygulama tarafından meşgul → `sudo ss -tlnp | grep 8765`
- Bağımlılık eksik → `sudo -u codegaai /opt/codegaai/venv/bin/pip install -r /opt/codegaai/requirements.txt`

### Nginx 502 Bad Gateway

Backend ayakta mı? `curl http://127.0.0.1:8765/api`. Değilse yukarıdaki adıma bak.

### SSL sertifikası yenilenmiyor

```bash
sudo certbot renew --dry-run
sudo systemctl status certbot.timer
```

### Modeller indirilmiyor / yüklenmiyor

Yeterli disk/RAM var mı? `df -h /var/lib/codegaai && free -h`. HuggingFace 
cache `/var/lib/codegaai/cache/huggingface/` altında olmalı.

### LLM çok yavaş

CPU modunda 7B model token başına saniyeler sürer. CUDA destekli kurulum
yap (yukarı bak) ya da daha küçük model dene (gelecek sürümlerde Qwen 3B 
eklenecek).

## Güvenlik

- `auth.env` dosyası **600 izinli** ve **root:codegaai** sahipli olmalı
- Public deploy'da **MUTLAKA HTTPS** kullan (Let's Encrypt ücretsiz)
- Token'ı şifre yöneticisinde tut, kimseyle paylaşma
- Firewall: `sudo ufw enable && sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH`
- SSH key-only login öner: `sudo passwd -l root`, `PasswordAuthentication no`
- Düzenli güncelle: `sudo /opt/codegaai/deploy/update.sh`

## Yedekleme & Felaket Kurtarma

Kritik veriler:

| Dosya/Dizin | İçerik | Yedeklenmeli mi? |
|---|---|---|
| `/var/lib/codegaai/chats.db` | Sohbetler | ✅ Evet |
| `/var/lib/codegaai/learning/` | Feedback + DPO çiftleri + LoRA | ✅ Evet |
| `/var/lib/codegaai/memory/` | RAG bellek (ChromaDB) | ✅ Evet |
| `/var/lib/codegaai/models/` | İndirilmiş GGUF + BGE | ❌ Hayır (10+ GB, yeniden indirilebilir) |
| `/var/lib/codegaai/cache/` | HuggingFace cache | ❌ Hayır |
| `/etc/codegaai/auth.env` | Token | ✅ Evet |

Otomatik günlük yedek (örnek cron):

```bash
sudo crontab -e
# Her gece 03:00:
0 3 * * * tar czf /backup/codegaai-$(date +\%Y\%m\%d).tar.gz \
    /var/lib/codegaai/chats.db \
    /var/lib/codegaai/learning \
    /var/lib/codegaai/memory \
    /etc/codegaai/auth.env 2>/dev/null
```

## Çoklu Kullanıcı Desteği (Gelecek)

Şu an tek-token tek-kullanıcı modu. Çoklu kullanıcı için Faz 9 federasyon
modülü planlanmaktadır — `ai.codega.com.tr` koordinatör olur, kullanıcılar
kendi node'larını çalıştırır.

## Lisans

MIT — `LICENSE` dosyasına bakın.

## Destek

GitHub Issues: https://github.com/codegatr/codegaai/issues
