<div align="center">
  <img src="https://raw.githubusercontent.com/codegatr/codegaai/main/codegaai/ui/web/assets/codega_logo.png" 
       width="480" alt="CODEGA AI — Powering Innovation" style="border-radius:12px">

  <h1>CODEGA AI</h1>
  <p><strong>Türkiye'nin Yerel, Otonom & Ücretsiz Yapay Zeka Asistanı</strong></p>

  <p>
    <img src="https://img.shields.io/badge/versiyon-v3.3.0-orange" alt="v3.3.0">
    <img src="https://img.shields.io/badge/python-3.12-blue" alt="Python 3.12">
    <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Windows">
    <img src="https://img.shields.io/badge/lisans-MIT-green" alt="MIT">
    <img src="https://img.shields.io/badge/endpoints-30%2B-purple" alt="30+ API">
    <img src="https://img.shields.io/badge/rakip-ChatGPT%20%7C%20Gemini%20%7C%20Claude%20%7C%20CODEX-red" alt="Rakipler">
  </p>

  <p>
    <a href="https://codega.com.tr">🌐 codega.com.tr</a> ·
    <a href="https://github.com/codegatr/codegaai/releases">⬇️ İndir</a> ·
    <a href="#api">📡 API</a> ·
    <a href="#harita">🗺️ Yol Haritası</a>
  </p>
</div>

---

## 🧠 Nedir?

**CODEGA AI**; tamamen **yerel** çalışan, **internet bağlantısı gerektirmeyen**, kendi kendine öğrenen masaüstü yapay zeka platformudur. ChatGPT, Gemini, Claude ve CODEX'in sahip olduğu özelliklerin büyük çoğunluğunu **ücretsiz ve gizlilik odaklı** sunar.

| | ChatGPT | Gemini | CODEX | Claude | **CODEGA** |
|--|:--:|:--:|:--:|:--:|:--:|
| Yerel / Offline | ❌ | ❌ | ❌ | ❌ | ✅ |
| Gizlilik | ❌ Bulut | ❌ Bulut | ❌ Bulut | ❌ Bulut | ✅ Tam Yerel |
| Otonom Öğrenme | ❌ | ❌ | ❌ | ❌ | ✅ Benzersiz |
| Self-Learning/DPO | ❌ | ❌ | ❌ | ❌ | ✅ Benzersiz |
| Diffusion Fine-Tune | ❌ | ❌ | ❌ | ❌ | ✅ Benzersiz |
| Çoklu Model Orkestrasyon | ❌ | ❌ | ❌ | ❌ | ✅ Benzersiz |
| **Ücret** | $20/ay | $20/ay | Kurumsal | $20/ay | ✅ **Ücretsiz** |

### Cursor IDE ile farklar

CODEGA bir **masaüstü yapay zekâ platformu**dur; [Cursor](https://cursor.com) ise **kod editörü içinde** çalışan ajan ve MCP ekosistemine sahip bir IDE’dir. İkisi aynı puan tablosunda değerlendirilmez. Özellik örtüşmesi, eksikler ve önerilen yol haritası için bkz. **[COMPARISON.md — Cursor IDE ile karşılaştırma](COMPARISON.md#cursor-ide)**.

---

## ✅ Tamamlanan Fazlar

### Faz 1–8: Temel Altyapı
- [x] **Faz 1** — Python/FastAPI/PyWebView masaüstü iskelet
- [x] **Faz 2** — Dark theme UI, sohbet geçmişi, SQLite
- [x] **Faz 3** — llama.cpp LLM motoru, Qwen 3B/7B, RAG (ChromaDB)
- [x] **Faz 4** — SDXL/FLUX görsel üretimi
- [x] **Faz 5** — Faster-Whisper ASR + Piper TTS ses motoru
- [x] **Faz 6** — CogVideoX video üretimi ve analizi
- [x] **Faz 7** — Self-Learning: 👍/👎 feedback → DPO/LoRA eğitimi
- [x] **Faz 8** — PyInstaller `.exe`, GitHub Smart Update, kurulum sihirbazı

### Faz 9–16: Zeka & Entegrasyon
- [x] **Faz 9** — Constitutional AI, Chain of Thought (CoT) reasoning
- [x] **Faz 10** — İnternet öğrenmesi: Wikipedia/ArXiv/HackerNews/StackOverflow/GitHub
- [x] **Faz 11** — Vision + OCR: moondream2, LLaVA, EasyOCR
- [x] **Faz 12** — Federe ağ: ai.codega.com.tr koordinatörü
- [x] **Faz 13** — Otonom öğrenme: idle'da ChromaDB'ye yazar, RAG bağlamı
- [x] **Faz 14** — ZIP upload/download, PHP proje üretici (config+SQL+htaccess)
- [x] **Faz 15** — GitHub push + PR oluşturma
- [x] **Faz 16** — AgentBrain: intent tespiti, araç yönlendirme

### Faz 17–25: Rakip Özellikleri
- [x] **Faz 17** — Canvas/Artifact: HTML/JS canlı önizleme + Python sandbox
- [x] **Faz 18** — PDF okuma (PyMuPDF/pdfplumber), CSV/Excel analizi (pandas)
- [x] **Faz 19** — Derin düşünme modu (o1/o3 karşılığı, CoT görünür)
- [x] **Faz 20** — Çok adımlı ajan: planla → web arama → kod çalıştır → dosya yaz → push
- [x] **Faz 21** — Bağımlılık analizi: requirements.txt/package.json güvenlik taraması
- [x] **Faz 22** — Gerçek zamanlı ses sohbeti: Mikrofon→ASR→LLM→TTS→ses döngüsü
- [x] **Faz 23** — Ekran görüntüsü anlama: UI/belge/kod analizi, OCR kod çıkarma
- [x] **Faz 24** — Diffusion fine-tuning: DreamBooth + Textual Inversion (LoRA)
- [x] **Faz 25** — Çoklu model orkestrasyon: auto/vote/chain modları

---

## ⏳ Bekleyen Fazlar

### Faz 26: Wake Word ✅
- OpenWakeWord / Porcupine / Whisper keyword fallback
- GET/POST /api/wakeword/start|stop|status|deps

### Faz 27: Plugin Sistemi ✅
- plugins/ dizini: manifest.json + handler.py
- Yerleşik: Hava durumu (wttr.in) + Hesap makinesi
- POST /api/plugins/install — URL'den kur

### Faz 28: Çeviri Sistemi ✅
- Helsinki-NLP → LLM fallback
- TR↔EN↔DE↔FR↔AR gerçek zamanlı
- POST /api/translate/text|document

### Faz 29: Takvim & Görevler ✅
- Lokal SQLite, etkinlik+görev yönetimi
- AI ile metinden çıkarma
- POST /api/calendar/events|tasks|extract

### Faz 30: Mobil API & QR ✅
- GET /api/mobile/status — yerel IP
- GET /api/mobile/qr — QR kod PNG

### Faz 31: Canlı Ekran Paylaşımı ✅
- mss + PIL ile ekran yakalama
- Vision motoru ile analiz
- POST /api/screen/capture|watch|stop

### Faz 32: GPU Hızlandırma ✅
- CUDA tespit, VRAM bilgisi, hız testi
- GPU katman sayısı ayarı
- GET /api/gpu/status|benchmark|vram

---

## 🚀 Kurulum

```bash
# 1. Releases'tan indir
# https://github.com/codegatr/codegaai/releases/latest

# 2. D:\2-CODEGAAI\ klasörüne çıkart

# 3. codegaai.exe çalıştır
#    → Kurulum sihirbazı: disk seç → Qwen 3B indir → başla
```

### Manuel (Geliştirici)
```bash
git clone https://github.com/codegatr/codegaai.git
cd codegaai
pip install -r requirements.txt
python launcher.py
```

---

## 🗺️ Dizin Yapısı {#harita}

```
D:\2-CODEGAAI\
├── codegaai.exe
├── CODEGA_Models\llm\          ← GGUF model dosyaları
└── CODEGA_Data\
    └── memory\
        ├── chats.db            ← Sohbet geçmişi
        ├── user_profile.json   ← Uzun dönem bellek
        └── chroma\             ← RAG vektör veritabanı
```

---

## 📡 API Endpoint'leri {#api}

<details>
<summary><strong>30+ endpoint — genişlet</strong></summary>

| Grup | Method | Endpoint | Açıklama |
|------|--------|----------|----------|
| **Sohbet** | POST | /api/jobs/chat | LLM sohbet (job polling) |
| | GET | /api/jobs/{id} | Yanıt durumu + içerik |
| **Dosya** | POST | /api/files/upload | ZIP/dosya yükle → AI bağlamı |
| | POST | /api/files/project | PHP projesi üret + ZIP |
| | POST | /api/files/pack | Cevaptaki kodları ZIP yap |
| | GET | /api/files/download/{id} | ZIP indir |
| | POST | /api/files/read-pdf | PDF → metin |
| | POST | /api/files/github/push | GitHub'a dosya push |
| | POST | /api/files/github/pr | PR oluştur |
| | POST | /api/files/generate/tests | PHPUnit/pytest/Jest test yaz |
| **Sandbox** | POST | /api/sandbox/run | Python güvenli çalıştır |
| | POST | /api/sandbox/chart | matplotlib grafik üret |
| | POST | /api/sandbox/analyze | CSV/Excel pandas analizi |
| | POST | /api/sandbox/deps | Bağımlılık güvenlik taraması |
| **Ajan** | POST | /api/agent/start | Çok adımlı ajan başlat |
| | GET | /api/agent/{id} | Ajan adım durumu |
| **Vision** | POST | /api/vision/screenshot | Ekran/görsel analizi |
| | POST | /api/vision/screenshot/code | Görselden kod çıkar |
| **Ses** | POST | /api/audio/voice-chat | Tam ses sohbet döngüsü |
| | POST | /api/audio/tts | Metin → ses |
| | POST | /api/audio/asr | Ses → metin |
| | GET | /api/audio/stream-tts | Streaming WAV |
| **Fine-tune** | POST | /api/finetune/upload | Görsel yükle |
| | POST | /api/finetune/dreambooth | DreamBooth eğitimi |
| | POST | /api/finetune/textual | Textual Inversion |
| | GET | /api/finetune/status | Eğitim ilerlemesi |
| **Orkestrasyon** | POST | /api/orchestrate/auto | En iyi modeli seç |
| | POST | /api/orchestrate/vote | 3 yanıt → en iyi |
| | POST | /api/orchestrate/chain | Model zinciri |
| | GET | /api/orchestrate/models | Aktif modeller |
| **Sistem** | GET | /api/system/health | Sistem durumu |
| | GET | /api/models/llm | Model listesi |
| **Bellek** | GET | /api/memory/search | RAG arama |
| | POST | /api/memory/learn | Bilgi ekle |
| **Öğrenme** | GET | /api/autolearn/status | Otonom öğrenme durumu |
| | POST | /api/autolearn/trigger | Hemen öğren |
| **Profil** | GET | /api/profile | Kullanıcı profili |
| | PATCH | /api/profile | Profil güncelle |

</details>

---

## 🔧 Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| `llama.dll yüklenemedi` | `fix_llama.bat` çalıştır |
| Model çok yavaş | Qwen 3B kullan (CPU için) |
| Embedding yüklenmiyor | Ayarlar → HF Token gir |
| Vision çalışmıyor | `pip install einops torchvision` |
| DPO butonu gri | `pip install peft trl datasets` |

---

## 📜 Lisans

MIT License — © 2026 CODEGA Yazılım Ajansı, Yunus Aksoy — Konya, Türkiye

---

<div align="center">
  <p>🇹🇷 <strong>Türkiye'nin Yerel Yapay Zekası — Buluta Sızdırmaz, Bedava Çalışır</strong> 🇹🇷</p>
</div>
