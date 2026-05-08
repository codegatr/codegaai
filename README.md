# CODEGA AI

> **Yerelde çalışan, kendi kendine öğrenen, çok modlu yapay zeka platformu.**
> Hiçbir dış API kullanmaz. Tüm modeller senin makinenizde, senin kontrolünde.

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](manifest.json)
[![Phase](https://img.shields.io/badge/phase-Faz%201%20%2F%208-orange.svg)](#faz-plan%C4%B1)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776ab.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![CUDA](https://img.shields.io/badge/CUDA-11.8%2B-76b900.svg)](https://developer.nvidia.com/cuda-toolkit)

---

## CODEGA AI nedir?

CODEGA AI; sohbet, kod yazma, görsel üretimi, video üretimi, ses sentezi (TTS) ve konuşma tanıma (ASR) yeteneklerini **tek bir masaüstü uygulamasında** birleştiren, **tamamen yerel** çalışan yapay zeka platformudur.

Claude, ChatGPT, Gemini gibi bulut tabanlı yapay zekaların aksine:

- **Hiçbir API çağrısı yapmaz.** Modeller senin makinende çalışır.
- **İnternet sadece model indirme için gerekir.** Modeller indirildikten sonra çevrimdışı çalışır.
- **Veriler senin diskinde kalır.** Sohbetler, dosyalar, üretimler — hepsi yerel.
- **Self-learning gerçektir.** Her etkileşim RAG belleğine işlenir; geri bildirimler haftalık LoRA adapter güncellemesine dönüşür.

> **CODEGA için, CODEGA tarafından.** Tüm hakları saklıdır, hiçbir buluta veri sızmaz.

---

## Neler yapabilir?

| Yetenek | Model | Durum |
|---|---|---|
| 💬 Sohbet (Türkçe + 30 dil) | Qwen 2.5 7B Instruct | Faz 2'de |
| 💻 Kod yazma | Qwen 2.5 Coder 7B | Faz 2'de |
| 🧠 RAG belleği (kalıcı öğrenme) | BGE-M3 + ChromaDB | Faz 2'de |
| 🎨 Görsel üretimi (text-to-image) | SDXL / FLUX.1-schnell | Faz 3'te |
| 🔊 Türkçe ses sentezi | XTTS v2 | Faz 4'te |
| 🎙️ Konuşma → metin | faster-whisper Large v3 | Faz 4'te |
| 🎬 Video üretimi (text-to-video) | CogVideoX-2B | Faz 5'te |
| 🔄 Self-learning loop | DPO + LoRA hot-swap | Faz 6'da |
| 🖥️ Masaüstü uygulaması (Win/Mac/Linux) | PyWebView | Faz 7'de |
| ⚙️ Akıllı Güncelle | manifest.json + GitHub Releases | Faz 8'de |

---

## Sistem gereksinimleri

### Minimum

- **CPU**: 4 çekirdek (Ryzen 5 / Core i5 8. nesil ve üstü)
- **RAM**: 16 GB
- **GPU**: NVIDIA RTX 3060 6GB veya eşdeğeri (CUDA 11.8+)
- **Disk**: 60 GB boş alan (modeller için)
- **OS**: Windows 10/11, Ubuntu 22.04+, macOS 13+ (Apple Silicon)
- **Python**: 3.10, 3.11, 3.12

### Önerilen (referans makine)

- **CPU**: Ryzen 7 / Core i7
- **RAM**: 24 GB+
- **GPU**: NVIDIA RTX 3060 12GB / 4060 Ti / 4070
- **Disk**: 120 GB SSD
- **CUDA**: 12.x

### Apple Silicon

M1/M2/M3 Mac'lerde Metal Performance Shaders (MPS) ile çalışır. Video üretimi M2 Pro 32GB ve üstünde sınırlı seviyede mümkündür.

---

## Mimari

```
┌─────────────────────────────────────────────────────┐
│  CodegaAI.exe (Masaüstü Uygulaması)                 │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  PyWebView (HTML/CSS/JS UI)                 │   │
│  │  • Sohbet ekranı, galeri, ayarlar           │   │
│  └────────────────────┬────────────────────────┘   │
│                       │ http://127.0.0.1:8765      │
│  ┌────────────────────▼────────────────────────┐   │
│  │  FastAPI Backend (yerel mikroservis)        │   │
│  │  • /api/chat   • /api/image   • /api/video  │   │
│  │  • /api/audio  • /api/memory  • /api/system │   │
│  └────────────────────┬────────────────────────┘   │
│                       │                            │
│  ┌────────────────────▼────────────────────────┐   │
│  │  Çekirdek Motorlar                          │   │
│  │  • LLM       (llama-cpp-python / vLLM)      │   │
│  │  • Image     (diffusers + PyTorch)          │   │
│  │  • Video     (CogVideoX)                    │   │
│  │  • TTS/ASR   (XTTS, faster-whisper)         │   │
│  │  • Embedding (BGE-M3)                       │   │
│  │  • Memory    (ChromaDB + SQLite)            │   │
│  │  • Learning  (DPO toplama, LoRA swap)       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Tüm modeller: ./data/models/                      │
│  Tüm bellek:   ./data/memory/                      │
│  Tüm üretim:   ./data/outputs/                     │
└─────────────────────────────────────────────────────┘
```

---

## Faz planı

CODEGA AI **8 faz halinde** geliştirilir. Her faz çalışan, test edilebilir bir sürüm üretir.

| # | Faz | Çıktı | Sürüm |
|---|---|---|---|
| 1 | **Temel İskelet** | Yapılandırma, başlatıcı, sistem kontrol, logger, kurulum betiği | **0.1.0** ✅ |
| 2 | LLM Motoru | Sohbet + kod + RAG bellek | 0.2.0 |
| 3 | Görsel Üretim | Text-to-image (SDXL/FLUX) | 0.3.0 |
| 4 | Ses (TTS + ASR) | Türkçe ses sentezi + konuşma tanıma | 0.4.0 |
| 5 | Video Üretim | Text-to-video (CogVideoX-2B) | 0.5.0 |
| 6 | Self-Learning | Geri bildirim → DPO → LoRA hot-swap | 0.6.0 |
| 7 | Masaüstü UI | PyWebView + tam HTML/CSS/JS arayüz | 0.7.0 |
| 8 | Akıllı Güncelle + .exe | Tek tıkla kurulum, otomatik güncelleme | **1.0.0** |

---

## Kurulum (geliştirici / Faz 1)

> Bu sürüm sadece iskelettir. Tam fonksiyonel sürüm Faz 7'de gelir.

### 1. Python 3.10–3.12 yükleyin

[python.org](https://www.python.org/downloads/) üzerinden indirin. **"Add Python to PATH"** seçeneğini işaretlemeyi unutmayın.

### 2. Repoyu klonlayın

```bash
git clone https://github.com/codegatr/codegaai.git
cd codegaai
```

### 3. Sanal ortam kurun

**Windows:**

```cmd
python -m venv .venv
.venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

**Linux / macOS:**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Sistem kontrolünü çalıştırın

```bash
python launcher.py --check
```

Beklenen çıktı:

```
=== CODEGA AI - Sistem Kontrolü ===
✓ Python 3.11.5
✓ İşletim sistemi: Windows 11
✓ RAM: 24 GB (önerilen: 24 GB)
✓ GPU: NVIDIA GeForce RTX 3060 (12 GB VRAM)
✓ CUDA: 12.1
✓ Disk: 245 GB boş
→ Sistem hazır.
```

### 5. Başlatıcıyı çalıştırın

```bash
python launcher.py
```

---

## Klasör yapısı

```
codegaai/
├── manifest.json              # Sürüm + güncelleme bilgisi
├── launcher.py                # Ana giriş noktası
├── requirements.txt           # Python bağımlılıkları
├── README.md                  # Bu dosya
├── LICENSE                    # MIT
│
├── codegaai/                  # Ana paket
│   ├── __init__.py
│   ├── config.py              # Yapılandırma (TOML tabanlı)
│   ├── core/                  # LLM, bellek, embedding, öğrenme
│   ├── modalities/            # Görsel, video, TTS, ASR
│   ├── api/                   # FastAPI endpoint'leri
│   ├── ui/                    # Masaüstü UI
│   └── utils/                 # Logger, installer, updater
│
├── data/                      # Çalışma anında oluşur
│   ├── models/                # İndirilen ağırlıklar
│   ├── memory/                # ChromaDB + SQLite
│   ├── outputs/               # Üretilen içerik
│   └── logs/
│
├── installer/                 # Platform kurulum betikleri
│   ├── windows/
│   ├── linux/
│   └── macos/
│
└── tests/
```

---

## Self-learning nasıl çalışır?

Geleneksel "yapay zeka" araçları her sohbeti sıfırdan başlatır. CODEGA AI üç katmanlı bellek mimarisi kullanır (Letta/MemGPT paradigması):

1. **Çalışma belleği** — mevcut sohbetin son N mesajı (kontekst penceresi)
2. **Arşiv belleği** — embedding'lenmiş tüm geçmiş, BGE-M3 ile vektörlenir, ChromaDB'de saklanır
3. **Çekirdek bellek** — kullanıcı profili, çelişki çözülmüş kalıcı gerçekler (Mem0 paradigması)

Her sohbet sonunda:

- Mesajlar embedding'lenir → arşive eklenir
- Yeni bilgi varsa → çekirdek belleğe damıtılır
- Çelişki varsa → eski bilgi güncellenir

Kullanıcı **👍/👎** geri bildirimi verdiğinde:

- 👍 cevap "tercih edildi" + alternatif "reddedildi" çifti DPO veri setine eklenir
- 100 çift birikince → haftalık cron LoRA adapter'i eğitir (PEFT + Unsloth)
- Yeni adapter sıcak takas (hot-swap) ile devreye alınır

> **Sonuç**: Modelin ağırlıkları senin geri bildirimlerinle **kendi kendine** evrilir. Hiçbir veri dışarı çıkmaz.

---

## Lisans

[MIT](LICENSE) — özgürce kullan, değiştir, dağıt.

Kullanılan açık kaynak modeller kendi lisanslarına tabidir:

- Qwen 2.5: Apache 2.0
- Llama 3.1: Meta Llama Community License
- SDXL: CreativeML Open RAIL-M
- FLUX.1-schnell: Apache 2.0
- CogVideoX: Apache 2.0
- XTTS v2: Coqui Public License (ticari kullanım için ayrı lisans)
- faster-whisper: MIT (Whisper modeli MIT)
- BGE-M3: MIT

---

## Bağlantılar

- **GitHub**: [codegatr/codegaai](https://github.com/codegatr/codegaai)
- **CODEGA**: [codega.com.tr](https://codega.com.tr)
- **Yayın notları**: [Releases](https://github.com/codegatr/codegaai/releases)

---

## Katkıda bulunma

Şu an tek geliştiricili (Yunus / CODEGA) bir projedir. Issue açabilir, fork'layabilir, PR gönderebilirsiniz.

---

**v0.1.0 — Faz 1 — Temel İskelet**

Bu sürüm sadece çalışma ortamını hazırlar. Yapay zeka motorları Faz 2'de gelir.
