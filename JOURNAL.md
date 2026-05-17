# CODEGA AI — Geliştirme Günlüğü

Bu dosya **bir sonraki Claude oturumu** için açık not olarak duruyor. Her büyük değişiklikten sonra buraya ekleme yapılır.

---

## 📍 Şu An (v4.0.3)

**Aktif Sorunlar (kullanıcının bildirdiği):**

1. ✅ AVX2 subprocess hatası → v4.0.2'de çözüldü (engine.py `_check_avx2_compat`)
2. ✅ Güncelleme JSON parse → v4.0.2'de çözüldü
3. ❌ **CPU AVX2 desteklemiyor** → llama-cpp CPU build gerekli (`fix_llama.bat` çalıştırılmalı)
4. 🔄 v4.0.3: Akıllı Model Yönlendirme + CODEX-tarzı UI + Otomatik Model Yükleme

**Kritik Bilgi — Kullanıcının Donanımı:**

- RTX 3060 Laptop **6GB VRAM** (24GB RAM değil, 12GB değil!)
- CPU: **AVX2 YOK** (0xC000001D crash)
- Yol: `D:\2-CODEGAAI\codegaai.exe`, modeller `D:\2-CODEGAAI\CODEGA_Models\llm\`

**Yüklü Modeller (kullanıcıda mevcut):**

```
qwen2.5-3b-instruct-q4_k_m   2 GB  (CPU için ideal)
qwen2.5-7b-instruct-q4_k_m   4.68 GB (Türkçe iyi)
qwen2.5-coder-7b-q4_k_m      4.68 GB (kodlama)
llama-3.1-8b-instruct-q4_k_m 4.92 GB (geniş bağlam)
aya-expanse-8b-q4_k_m        5.1 GB (çok dilli, Türkçe güçlü)
```

---

## 🎯 v4.0.3 Plan (BU OTURUM)

### A. Akıllı Model Yönlendirme (Intent → Model)

`agent_brain.py` zaten intent tespit ediyor. Bunu modelle eşleştir:

```python
INTENT_MODEL_MAP = {
    "coding":   "qwen2.5-coder-7b-instruct-q4_k_m",  # Kod istekleri
    "translate":"aya-expanse-8b-q4_k_m",              # Çeviri istekleri
    "vision":   "moondream2",                          # Vision model (Faz 11)
    "image_gen":"sdxl-turbo",                          # Resim üret
    "general":  "qwen2.5-3b-instruct-q4_k_m",         # Genel sohbet (CPU dostu)
    "long_context": "llama-3.1-8b-instruct-q4_k_m",   # Uzun bağlam
}
```

`/api/jobs/chat` endpoint'inde: ilk mesaj geldiğinde intent çıkar → uygun model yüklü mü kontrol et → değilse switch yap.

### B. CODEX-tarzı Ana Ekran

Kullanıcının paylaştığı screenshot'a göre:

- "Ne üzerinde çalışalım?" başlığı (büyük, ortada)
- Merkezi input alanı (büyük, alttan)
- Altında 4 örnek prompt (tıklanabilir):
  - 🖼 Görsel oluştur: "..."
  - 💻 Kod yaz: "..."
  - 📊 Veri analizi: "..."
  - 🌐 Web araştırması: "..."
- Sidebar sade: Yeni Sohbet, Arama, Proje, Sohbet Geçmişi

### C. Otomatik Model Yükleme

Şu an `self_healing.py` model yüklemeyi deniyor ama AVX2 crash veriyor. Düzeltme:

1. RAM/VRAM'e göre en uygun **yüklü** modeli seç (yoksa indirme önerisi)
2. Otomatik yükleme intent'e göre olsun
3. RTX 3060 6GB için → 3B Q4 model uygun (Q5 yok, 7B GPU'ya sığmaz)

### D. Bu Dosyayı Güncelle

Her push'tan sonra **mutlaka** bu dosyaya not düş. Bir sonraki Claude oturumu **/mnt/transcripts/journal.txt** veya bu dosyayı okumalı.

---

## 📜 Tamamlanan Sürümler

### v4.0.2 — AVX2 + JSON fix
- Subprocess yerine direct import (frozen build'de codegaai.exe -c çalışmıyor)
- /api/updater/check try/except ile JSON garantili
- Frontend text() → JSON.parse() try/catch

### v4.0.1 — 6 crash fix
- engine.py Path import
- _check_avx2_compat eklendi
- ChromaDB embed_query yeni API
- _collect() pyarrow deadlock fix
- nvidia-smi CREATE_NO_WINDOW
- check_dependencies subprocess izolasyon

### v4.0.0 — 50 faz tamamlandı
- Faz 49 (sistem monitör), Faz 50 (proje yöneticisi)

### v3.9.0 - v3.9.5
- Faz 14-21: terminal, paylaşım, diff, PR review, SQL, debug, voice-to-code, templates
- Faz 34-36: collab WS, smart complete, docstring
- Faz 37-39: SAST, testgen, profiler
- Faz 40-42: i18n, mock API, git zekası
- Faz 43-45: depaudit, rename, apidoc
- Faz 46-48: clone detect, multimodel, flashcard
- v3.9.3: düşük sistem modu, navbar→header, session log

---

## 🔧 Bilinen Pattern'ler

**Frozen build subprocess problemi:**
- `sys.executable` = `codegaai.exe` (Python değil)
- `codegaai.exe -c "..."` → "unrecognized arguments"
- Çözüm: subprocess kullanma, direct import veya try/except

**Crash sebepleri (frozen build):**
- `import datasets` → pyarrow access violation
- llama-cpp AVX2 → 0xC000001D
- nvidia-smi → hang ihtimali (CREATE_NO_WINDOW şart)

**GitHub repo:** codegatr/codegaai
**Token (kullanıcı paylaştı):** Önceki konuşmalardan al

---

## ✅ v4.0.3 — TAMAMLANDI (16 May 2026)

### Yapılan Değişiklikler:

**A. CODEX-tarzı Ana Ekran:**
- `welcome` → `welcome--codex` class
- "Ne üzerinde çalışalım?" başlığı (CODEX birebir)
- 4 tıklanabilir kart: Görsel oluştur / Kod yaz / Çeviri / Veri analizi
- Hızlı linkler: Sistem ayarları / Projeler / Çoklu model
- Sade ve odaklı tasarım

**B. AVX2 Uyarı Banner'ı:**
- `#avx2-warning` div eklendi
- Sistem AVX2 hatası tespit ederse otomatik gösterilir
- fix_llama.bat çalıştırma talimatı

**C. Otomatik Model Yükleme:**
- `chat.js` içinde `autoLoadBestModel()` IIFE
- Sayfa açılır açılmaz çalışır
- RAM/VRAM tespit eder, en uygun modeli seçer
- VRAM ≥5GB → 7B-8B model
- VRAM 2-5GB veya RAM ≥8GB → 3B model
- Çok düşük → en küçük model
- AVX2 hatası varsa yüklemeyi denemez (crash önleme)

**D. Banner UI:**
- `#auto-model-banner` model adı + boyut gösterir
- ⏳ → ✅ durum geçişi
- Başarıdan 3sn sonra otomatik gizlenir

**E. Bug Fix — UpdateInfo.asset_size_bytes:**
- Log'da görüldü: `'UpdateInfo' object has no attribute 'asset_size_bytes'`
- Doğru attribute: `asset_size` (asset_size_bytes değil)
- Backward compat: `getattr` ile her ikisi de denenir

**F. fix_llama.bat Güçlendirildi:**
- 3 fallback yöntemi (kaldır → CPU wheel dene → kaynaktan derle)
- UTF-8 destekli, görsel ilerleme
- Otomatik test ve sonuç raporu

**G. ModelRouter Yeni Kural:**
- Llama 3.1 8B kuralı eklendi
- task_types: long_context, reasoning
- keywords: uzun, detaylı, kapsamlı, analiz, rapor

**H. CSS:**
- `.welcome--codex`, `.codex-card`, `.codex-suggestions`
- `.kanban-col`, `.kanban-card` (Faz 50 için)
- `.system-metric-card` (Faz 49 için)

### Kullanıcının Açık Talepleri:

1. ✅ CODEX-tarzı ana ekran → YAPILDI
2. ✅ Akıllı model değiştirme → Zaten vardı + Llama 3.1 eklendi
3. ✅ Resim → image model, Kod → coder model otomatik → ModelRouter zaten yapıyor
4. ✅ Transkripte kaydet → Bu dosya (JOURNAL.md) artık var
5. ⚠️ Model yüklenmiyor → AVX2 sorunu, fix_llama.bat çalıştırılmalı

### Bir Sonraki Oturum İçin Notlar:

**Acil çözülmesi gereken:** Workflow'da AVX2'siz wheel'i daha agresif zorla. Şu an `--prefer-binary` kullanılıyor ama abetlen'in CPU wheel'i kullanıcının makinesinde çalışmıyor olabilir.

**Test edilmesi gerekenler:**
- v4.0.3 release'inde fix_llama.bat içeriği doğru üretiyor mu?
- Otomatik model yükleme banner'ı render oluyor mu?
- AVX2 warning banner kullanıcıya görünüyor mu?

**Sıradaki olası özellikler:**
- Faz 51: Bilgi Tabanı (RAG kaydetme + arama UI'sı)
- Faz 52: Kod→Diyagram (Mermaid üretici)
- Faz 53: Otomatik CHANGELOG.md güncelleme
- Sistem Monitör UI (zaten backend var, CSS kondu)
- Proje Yöneticisi UI (zaten backend + UI var, kanban CSS kondu)

**Bilinmesi gereken:** `JOURNAL.md` her sürümde güncellenecek. `transcripts/` klasöründe değil, repo kökünde.

---

## ✅ v4.1.0 — 3 YENİ FAZ (16 May 2026)

### Tamamlanan Yeni Fazlar:

**Faz 51: Bilgi Tabanı (RAG)**
- Endpoint: `/api/knowledge/*`
- Not/belge ekle, semantic arama, listeleme, silme
- Embedding ile benzerlik araması
- UI: Modal pencere (KnowledgeBase.show())
- Kullanım: Sistem → Bilgi Tabanı

**Faz 52: Kod→Diyagram**
- Endpoint: `/api/diagrams/from_code`
- Kod analiz edip Mermaid diyagram üretir
- Desteklenen: flowchart, sequence, class diagram
- UI: Modal pencere (CodeDiagram.show())
- Kullanım: Sistem → Kod→Diyagram

**Faz 55: Akıllı Arama**
- Endpoint: `/api/search`
- Tüm kaynaklarda birleşik arama (chat, KB, dosya, kod, proje)
- Kaynak bazlı filtreleme (sources=chats,knowledge,...)
- UI: Modal pencere (UnifiedSearch.show())
- Kullanım: Sistem → Akıllı Arama

### UI İyileştirmeleri:

**Gelişmiş Özellikler Kartları:**
- Sistem view'a "🚀 Gelişmiş Özellikler" bölümü eklendi
- 4 tıklanabilir kart: Bilgi Tabanı / Kod→Diyagram / Akıllı Arama / Proje Yöneticisi
- Her kart ilgili modal'ı açıyor

**Modal Sistem:**
- `window.Modals.open(title, content)` global API
- Overlay click ile kapatma
- Tüm yeni özellikler modal'da açılıyor

### Toplam Faz Sayısı:

- **Başlangıç:** 50 faz (v4.0.x)
- **Yeni:** 3 faz (51, 52, 55)
- **Toplam:** 53 faz tamamlandı

### Sıradaki Olası Fazlar:

- Faz 53: Otomatik CHANGELOG.md (git commit'lerden)
- Faz 54: Ses Notu → Özet (audio upload → transcript → summary)
- Faz 56: Toplu Dosya İşleme (batch PDF/image processing)
- Faz 57: API Playground (REST/GraphQL test UI)

### Backend Endpoint Sayısı:

- `/api/knowledge/*` → 4 endpoint
- `/api/diagrams/*` → 2 endpoint
- `/api/search` → 1 endpoint
- **Toplam:** 278 + 7 = **285 endpoint**

### Test Durumu:

- Tüm testler ✅ OK
- v4.1.0 release hazır

---

## ✅ v4.1.0 — AVX2 ÇÖZÜMÜ + 6 YENİ FAZ (17 May 2026)

### Ana Sorun: AVX2 Uyumsuzluğu

Kullanıcının CPU'su AVX2 desteklemiyor → llama-cpp 0xC000001D crash.
fix_llama.bat kullanıcı tarafından çalıştırılmamış → model hala yüklenmiyor.

### 3 Katmanlı Çözüm:

**Katman 1: In-app Otomatik Onarım (Faz 56)**
- `/api/repair/llama` POST — onarımı başlatır
- `/api/repair/status` GET — durum
- `/api/repair/stream` SSE — canlı log
- UI: Modal pencere, progress bar, canlı log akışı
- Frozen build'de sistem Python'unu bulur

**Katman 2: Simülasyon Modu (Faz 57)**
- `codegaai/core/simulation_mode.py`
- LLM yüklü değilse rule-based cevap
- Selamlama, saat, tarih, bilgi tabanı sorguları çalışır
- jobs.py'de fallback olarak entegre
- Uygulama LLM olmadan da kullanılabilir kalır

**Katman 3: Workflow Düzeltmesi**
- CMAKE_ARGS AVX kapalı modu önce dene, yetersizse kaynaktan derle
- Build sürecinde llama-cpp test edilir

### UI Eklemeleri:

**AVX2 Warning Banner Genişletildi:**
- Büyük "🔧 Otomatik Onar" butonu
- Simülasyon modu açıklaması
- Kullanıcı bilgilendirici metin

**AutoRepair Modal:**
- Progress bar
- Canlı log konsolu (SSE)
- 3 aşama göstergesi (kaldır/kur/test)

### Toplam Faz Sayısı: 55 (50 + 5 yeni)

- Faz 51: Bilgi Tabanı ✅
- Faz 52: Kod→Diyagram ✅
- Faz 55: Akıllı Arama ✅
- Faz 56: In-app Onarım ✅ (YENİ)
- Faz 57: Simülasyon Modu ✅ (YENİ)

### Yeni Endpoint'ler:

- `/api/repair/llama` POST
- `/api/repair/status` GET
- `/api/repair/stream` GET (SSE)
- **Toplam:** 288 endpoint

### Test Durumu:

- Simülasyon modu unit test OK
- Tüm mevcut testler ✅

### Kullanıcı İçin Adımlar:

1. v4.1.0 release'i indir + kur
2. Uygulama açılır → AVX2 uyarısı görünür
3. "Otomatik Onar" butonuna tıkla
4. 5-15 dakika bekle (modal'da canlı log)
5. Bitince uygulamayı yeniden başlat
6. Model otomatik yüklenir (autoLoadBestModel)

**Eğer onarım başarısız olursa:** Simülasyon modunda çalışmaya devam eder, en azından selam/saat/bilgi tabanı çalışır.
