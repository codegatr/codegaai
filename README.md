<div align="center">
  <img src="https://raw.githubusercontent.com/codegatr/codegaai/main/codegaai/ui/web/favicon.ico" width="80" alt="CODEGA AI Logo">
  <h1>CODEGA AI</h1>
  <p><strong>Türkiye'nin Yerel & Otonom Yapay Zeka Asistanı</strong></p>
  <p>
    <img src="https://img.shields.io/badge/versiyon-v3.0.0-orange" alt="v3.0.0">
    <img src="https://img.shields.io/badge/python-3.12-blue" alt="Python 3.12">
    <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Windows">
    <img src="https://img.shields.io/badge/lisans-MIT-green" alt="MIT">
  </p>
</div>

---

## 🧠 Nedir?

CODEGA AI; tamamen **yerel** çalışan, **internet bağlantısı gerektirmeyen**, kendi kendine öğrenen ve gelişen bir masaüstü yapay zeka platformudur. CODEGA yazılım ajansı tarafından Türkiye'de geliştirilmiştir.

- **İnternete göndermez** — tüm veriler bilgisayarınızda kalır
- **Otonom öğrenir** — siz kullanmıyorken Wikipedia, ArXiv, HackerNews'ten öğrenir
- **Kendi kendini onarır** — hata tespit edince otomatik düzeltmeye çalışır
- **Proje üretir** — PHP/Python projesi oluşturup ZIP + SQL verir
- **GitHub'a push eder** — ürettiği kodu direkt repo'ya gönderir

---

## 🚀 Kurulum

### Windows (Hızlı Başlangıç)

1. [GitHub Releases](https://github.com/codegatr/codegaai/releases/latest) sayfasından `codegaai-vX.Y.Z-windows-cpu.zip` indir
2. `D:\2-CODEGAAI\` gibi bir klasöre çıkart
3. `codegaai.exe` çalıştır
4. İlk kurulum sihirbazı açılır → model dizini seç → Qwen 3B indirilir

### Manuel Kurulum (Geliştirici)

```bash
git clone https://github.com/codegatr/codegaai.git
cd codegaai
pip install -r requirements.txt
python launcher.py
```

---

## 📊 Mimari & Faz Durumu

| Faz | Başlık | Durum | Notlar |
|-----|--------|-------|--------|
| 1 | Temel İskelet | ✅ Tamamlandı | Python/FastAPI/PyWebView |
| 2 | Masaüstü UI | ✅ Tamamlandı | Dark theme, sohbet geçmişi |
| 3 | LLM Motoru | ✅ Tamamlandı | llama.cpp, Qwen 3B/7B, RAG |
| 4 | Görsel Üretim | ✅ Tamamlandı | SDXL/FLUX (GPU gerekli) |
| 5 | Ses (TTS+ASR) | ✅ Tamamlandı | faster-whisper, Piper TTS |
| 6 | Video Üretim | ✅ Tamamlandı | CogVideoX, frame analizi |
| 7 | Self-Learning | 🟡 Aktif | DPO/LoRA — GPU gerekli, 👍/👎 veri biriktiyor |
| 8 | .exe + Güncelleme | ✅ Tamamlandı | PyInstaller, auto-update |
| 9 | Constitutional AI | ✅ Tamamlandı | Chain of Thought |
| 10 | İnternet Öğrenmesi | ✅ Tamamlandı | Wikipedia/ArXiv/HN/SO/GitHub |
| 11 | Vision+OCR | ✅ Tamamlandı | EasyOCR, moondream2 |
| 12 | Federe Ağ | ✅ Tamamlandı | ai.codega.com.tr |
| 13 | Otonom Öğrenme | ✅ Tamamlandı | ChromaDB RAG, idle öğrenim |
| 14 | ZIP Upload/Download | ✅ **YENİ** | Dosya analizi, proje üretimi |
| 15 | GitHub Push | ✅ **YENİ** | Üretilen kodu repo'ya gönder |
| 16 | AgentBrain | ✅ **YENİ** | Intent tespiti, araç yönlendirme |

---

## 🗺️ Dizin Yapısı

```
D:\2-CODEGAAI\
├── codegaai.exe              ← Uygulama
├── fix_llama.bat             ← llama.dll sorunu için
├── CODEGA_Models\            ← Model dosyaları (GGUF)
│   └── llm\
│       ├── qwen2.5-3b-instruct-q4_k_m.gguf
│       └── qwen2.5-7b-instruct-q4_k_m.gguf
└── CODEGA_Data\              ← Veriler
    └── memory\
        ├── chats.db          ← Sohbet geçmişi
        └── chroma\           ← RAG vektör veritabanı

C:\Users\...\AppData\Local\CODEGA AI\data\
└── codegaai_config.json      ← Yapılandırma
```

---

## 💡 Desteklenen Modeller

| Model | Boyut | VRAM | Hız (CPU) | Önerilen |
|-------|-------|------|-----------|----------|
| Qwen 2.5 3B Q4 | 2.0 GB | 2.5 GB | ~20 sn/yanıt | ✅ CPU için |
| Qwen 2.5 7B Q4 | 4.68 GB | 5.5 GB | ~90 sn/yanıt | GPU için |
| Qwen 2.5 Coder 7B | 4.68 GB | 5.5 GB | ~90 sn/yanıt | Kod üretimi |
| Llama 3.1 8B | 4.92 GB | 6 GB | ~100 sn/yanıt | Geniş bağlam |
| BGE-M3 (Embedding) | 1.1 GB | CPU | — | RAG için şart |

---

## ✨ Özellikler

### Sohbet
- 💬 Türkçe/İngilizce doğal dil anlama
- 📎 **ZIP/dosya yükleme** → AI içeriği analiz eder
- 📦 **ZIP indirme** → AI ürettiği projeyi paketler
- 🌐 Web araması (DuckDuckGo + URL okuma)
- 🧠 RAG belleği — önceki konuşmalar + öğrenilen bilgiler
- 🔁 Job polling sistemi (PyWebView uyumlu, SSE yerine)

### Proje Üretimi
```
"PHP 8.3 kullanıcı kayıt sistemi yap, MySQL"
→ config.php, index.php, schema.sql, .htaccess, README.md
→ Tek ZIP dosyası
→ GitHub'a push et
```

### Otonom Öğrenme
- 5 dakika idle → Wikipedia/ArXiv/HN/SO/GitHub'dan öğrenir
- ChromaDB'ye yazar → sonraki sohbette kullanılır
- Konu ağacı genişler: Python → FastAPI → asyncio → ...
- "Şimdi Öğren" butonu ile anlık tetiklenebilir

### Self-Learning (Faz 7)
- 👍/👎 butonu ile yanıtları değerlendir
- 100+ tercih çifti birikince DPO eğitimi başlatılabilir
- LoRA adapter olarak kaydedilir
- **Şu an:** peft+trl+datasets kurulması gerekiyor (requirements.txt'de aktif)

---

## ⚙️ Yapılandırma

`C:\Users\...\AppData\Local\CODEGA AI\data\codegaai_config.json`:

```json
{
  "models_dir": "D:\\2-CODEGAAI\\CODEGA_Models",
  "data_dir": "D:\\2-CODEGAAI\\CODEGA_Data",
  "hf_token": "hf_xxxx...",
  "auto_load_model": true,
  "auto_load_embedding": true,
  "server": {
    "host": "127.0.0.1",
    "port": 8765
  }
}
```

---

## 🔧 Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| `llama.dll yüklenemedi` | `fix_llama.bat` çalıştır → VC++ Redistributable kur |
| `0xC000001D` AVX2 hatası | CPU build kullan (Windows release'i zaten CPU build) |
| Embedding yüklenmiyor | `TQDM_DISABLE=1` → otomatik set ediliyor |
| Model çok yavaş (~90sn) | Qwen 3B kullan veya GPU'yu etkinleştir |
| ChromaDB D:\ gitmedi | Kurulum sihirbazını sıfırla (Ayarlar) |

---

## 🌐 API

Uygulama çalışırken `http://127.0.0.1:8765` adresinde API sunucusu aktiftir:

```
POST /api/jobs/chat           — Sohbet isteği (polling)
GET  /api/jobs/{id}           — Cevap durumu
POST /api/files/upload        — Dosya yükle
POST /api/files/project       — PHP projesi üret
GET  /api/files/download/{id} — ZIP indir
POST /api/files/github/push   — GitHub push
GET  /api/system/health       — Sistem durumu
GET  /api/models/llm          — Model listesi
```

---

## 📜 Lisans

MIT License — © 2026 CODEGA Yazılım Ajansı, Yunus Aksoy

---

<div align="center">
  <p>🇹🇷 <strong>Türkiye'nin Yerel Yapay Zekası</strong> 🇹🇷</p>
  <p>
    <a href="https://codega.com.tr">codega.com.tr</a> ·
    <a href="https://github.com/codegatr/codegaai">GitHub</a>
  </p>
</div>
