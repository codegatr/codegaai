<p align="center">
  <img src="https://raw.githubusercontent.com/codegatr/codegaai/main/codegaai/ui/web/assets/codega_logo.png" width="480" alt="CODEGA AI" />
</p>

<h1 align="center">CODEGA AI</h1>

<p align="center">
  <strong>Yerel çalışan, hafızalı, ajan tabanlı otonom yazılım mühendisliği platformu.</strong><br>
  <em>Local-first · Fully Offline · Phoenix Core v2 · v6.0.0-alpha.11</em>
</p>

<p align="center">
  <a href="https://github.com/codegatr/codegaai/releases"><img alt="Release" src="https://img.shields.io/github/v/release/codegatr/codegaai?style=for-the-badge&color=f59e0b&label=release"></a>
  <a href="https://github.com/codegatr/codegaai/actions/workflows/build-windows.yml"><img alt="Windows Build" src="https://img.shields.io/github/actions/workflow/status/codegatr/codegaai/build-windows.yml?branch=main&style=for-the-badge&label=Windows"></a>
  <a href="https://github.com/codegatr/codegaai/actions/workflows/build-macos.yml"><img alt="macOS Build" src="https://img.shields.io/github/actions/workflow/status/codegatr/codegaai/build-macos.yml?branch=main&style=for-the-badge&label=macOS%20ARM64"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge"></a>
</p>

<p align="center">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-Desktop-47848f?style=flat-square&logo=electron&logoColor=white">
  <img alt="Ollama" src="https://img.shields.io/badge/Ollama-Local%20LLM-000000?style=flat-square">
  <img alt="Qwen3.5" src="https://img.shields.io/badge/Default%20Model-Qwen3.5%204B-f59e0b?style=flat-square">
  <img alt="Phoenix Core" src="https://img.shields.io/badge/Phoenix%20Core-v2-e11d48?style=flat-square">
  <img alt="Federation" src="https://img.shields.io/badge/Federation-ai.codega.com.tr-06b6d4?style=flat-square">
</p>

<p align="center">
  <a href="https://codega.com.tr">Website</a> ·
  <a href="https://github.com/codegatr/codegaai/releases/latest">İndir / Download</a> ·
  <a href="NIRVANA.md">Nirvana Manifesto</a>
</p>

---

## CODEGA AI Nedir?

CODEGA AI, **tamamen yerel çalışan**, internet bağlantısı gerektirmeyen bir **AI mühendislik platformudur.** Verileriniz bilgisayarınızdan çıkmaz. Model bilgisayarınızda çalışır.

Hedef: Bir gün kullanıcının yalnızca şunu yazması yeterli olacak:

> **"CODEGA, projemin yeni sürümünü inşa et."**

Ve platform bunu baştan sona yapacak. Bkz. [NIRVANA.md](NIRVANA.md)

---

## Gerçek Özellikler (v6.0.0-alpha.10)

### 🧠 Phoenix Core v2 — Ajan Altyapısı

Tüm sohbet, görev ve akış yönetimi **Phoenix Core v2** üzerinden koordine edilir. Hiçbir bileşen diğerini doğrudan çağırmaz; her şey merkezi EventBus üzerinden iletişim kurar.

| Bileşen | Görev |
|---|---|
| **EventBus** | Tüm olaylar için merkezi mesaj veri yolu |
| **PhoenixWatchdog** | Takılan görevleri tespit eder, zaman aşımında iptal eder |
| **ConversationIsolationStore** | Sohbetleri izole tutar; hafıza karışması olmaz |
| **StreamingBuffer** | Gerçek zamanlı token akışını yönetir |
| **IntentEngine + FastPath** | LLM'e gitmeden önce isteği sınıflandırır; basit sorular anında yanıtlanır |
| **PhoenixRuntime** | Tüm bileşenleri tek yaşam döngüsünde birleştirir |

### ⚡ IntentEngine — FastPath

Her istek LLM'e gitmeden önce sınıflandırılır. Basit sorgular (`"saat kaç?"`, `"kaç derece Ankara?"`, `"256 / 8 = ?"`) Ollama'ya hiç dokunmadan milisaniyeler içinde yanıtlanır.

```
İstek gelir → IntentEngine sınıflandırır
     ├── needsModel: false → FastPath → Anında yanıt (0ms LLM)
     └── needsModel: true  → Ollama → Streaming yanıt
```

### 🤖 Yerel Model Desteği

Ollama üzerinden tamamen offline çalışır. İnternet yok, bulut yok, API ücreti yok.

| Model | Parametre | Görev | Min. VRAM |
|---|---|---|---|
| Qwen3.5 0.8B | 0.8B | Sohbet (çok hafif) | 1 GB |
| Qwen3.5 2B | 2B | Sohbet | 2 GB |
| **Qwen3.5 4B** *(varsayılan)* | 4B | Sohbet · Yazı · Araç | 3 GB |
| Qwen3.5 9B | 9B | Güçlü muhakeme + kod | 6 GB |
| Qwen3.6 27B | 27B | En güçlü yerel seçenek | 16 GB |
| Qwen3 1.7B | 1.7B | Yeni nesil hafif | 1.5 GB |
| Qwen3 14B | 14B | Güçlü Qwen3 serisi | 10 GB |
| Qwen2.5 Coder 3B | 3B | Kod odaklı | 2 GB |
| Qwen2.5 Coder 7B | 7B | Kod odaklı güçlü | 5 GB |

**Donanım bazlı otomatik öneri:** Uygulama `nvidia-smi` ile VRAM'i okur, sisteminize en uygun modeli önerir (VRAM öncelikli; GPU yoksa RAM bazlı fallback).

### 🗜️ ZIP Engine (Sprint 2)

Saf JavaScript, native bağımlılık yok, asar paketi içinde çalışır.

**Desteklenen işlemler:**

| IPC Kanalı | Açıklama |
|---|---|
| `zip:list` | Arşiv içeriğini listele |
| `zip:analyze` | Stack tespit et + AI özeti üret |
| `zip:read` | Arşiv içindeki text dosyasını oku |
| `zip:extract` | Tüm arşivi klasöre çıkar |
| `zip:patch` | Mevcut ZIP'e yamalar uygula |
| `zip:create` | Klasörden ZIP oluştur |

**Otomatik stack tespiti — 16 imza:**

`Laravel` · `PHP` · `Next.js` · `NestJS` · `Express` · `Node.js` · `React` · `Vue` · `Svelte` · `Electron` · `Flutter` · `React Native` · `.NET` · `FastAPI` · `Django` · `Python`

### 🌿 Git Agent (Sprint 3)

`execFile` ile güvenli git işlemleri. Her handler, path'i `findRepoRoot()` ile doğrular — path traversal yok.

| IPC Kanalı | Açıklama |
|---|---|
| `git:find-root` | Dizinden depo kökünü bulur |
| `git:status` | Staged / unstaged / untracked dosyalar |
| `git:diff` | Diff çıktısı (staged veya unstaged) |
| `git:log` | Commit geçmişi |
| `git:branches` | Branch listesi + aktif branch |
| `git:tags` | Tag listesi |
| `git:suggest-commit` | Conventional Commits formatında commit mesajı önerisi |
| `git:suggest-branch` | `feat/` · `fix/` · `chore/` prefix'li branch adı |
| `git:release-notes` | İki tag arası markdown release notes |
| `git:changelog` | Keep a Changelog formatında CHANGELOG.md |
| `git:explain-conflict` | Merge conflict açıklaması + çözüm seçenekleri |

### 🧠 Project Memory — Proje Hafızası (Sprint 4)

Her proje için izole, kalıcı ve aranabilir beyin hafızası. Projeler **asla** birbirine karışmaz.

**11 Kategori (NIRVANA Manifesto):**

| Kategori | İçerik |
|---|---|
| `architecture` | Sistem tasarımı, katmanlar, bileşenler |
| `tech_stack` | Kullanılan teknolojiler, kütüphaneler, sürümler |
| `business_rules` | Alan mantığı, iş kuralları |
| `naming` | İsimlendirme kuralları, kod stili |
| `schema` | Veritabanı şeması, tablolar, ilişkiler |
| `decisions` | Mimari kararlar (ADR) |
| `tech_debt` | Bilinen teknik borçlar |
| `pending_work` | Yapılacaklar, özellik talepleri |
| `release_history` | Sürüm geçmişi |
| `known_bugs` | Bilinen hatalar |
| `standards` | Kodlama standartları |

**13 IPC Kanalı:**
`project-memory:list` · `create` · `get` · `update-meta` · `delete` · `append` · `remove-entry` · `replace-cat` · `search` · `search-all` · `detect` · `context` · `categories`

**Auto-detect:** Git repo URL'si veya ZIP analiz sonucundan projeyi otomatik tanır ya da yeni oluşturur.

**AI Bağlam Özeti:** `buildContext()` — proje brain'ini LLM'e göndermek için token-verimli düz metin üretir.

### 🧩 Model Router

Görev tipine göre doğru modeli otomatik seçer:

- **Kod görevleri** → Qwen2.5 Coder serisi
- **Yazı / Sohbet** → Qwen3.5 4B (varsayılan)
- **Güçlü muhakeme** → Qwen3.5 9B (yeterli VRAM varsa)

### 📚 RAG — Retrieval Augmented Generation

Yerel embedding tabanlı bilgi tabanı.

- Belge/kod ingest (yerel vektör indeksi)
- Bağlamsal arama
- Liste ve silme yönetimi

### 🧠 Hafıza Sistemi

- **Konuşma hafızası** — sohbet bağlamını korur
- **Gerçek hafızası** — kullanıcı tercihleri ve öğrenilen bilgiler
- **Öğrenme motoru** — dış kaynaklardan konu araştırır, notları biriktirir, isteğe bağlı LLM damıtması

### 🤝 Federe Öğrenme Ağı

`https://ai.codega.com.tr/api/federation` üzerinden diğer CODEGA AI kurulumlarıyla anonim bilgi paylaşımı (opt-in).

### 🛠️ MCP Desteği

Model Context Protocol (MCP) client. Harici araç ve servisleri AI'ya bağlar.

### 📊 Metrikler & Log Merkezi

- Gerçek zamanlı GPU/CPU kullanımı (`nvidia-smi` entegrasyonu)
- Token/gün, ortalama yanıt süresi, toplam görev sayısı
- Yapılandırılmış log viewer

### 🛡️ Güvenlik Mimarisi

- `contextIsolation: true` · `nodeIntegration: false` — Electron sandbox
- ZIP/Git IPC handler'larında path traversal koruması
- `execFile` — shell injection yok
- Windows installer: `asInvoker` (yükseltilmiş yetki talep etmez)
- `archiver` ve `extract-zip` production bağımlılığı olarak dahil

### 🔄 Otomatik Güncelleme

`electron-updater` + GitHub Releases. Her sprint GitHub Actions workflow'u ile otomatik paketlenir ve release olarak yayınlanır. Uygulama içinden güncelleme kontrolü ve kurulumu.

### 🤖 Otonom Geliştirme (Deneysel, Opt-in)

- **Self-improve drafts** — kendi gözlemlerinden iyileştirme önerileri üretir
- **Autonomous dev loop** — kendi PR'larını açar (yalnızca ayrı dalda; asla `main`'e yazmaz, asla merge etmez)
- **Self-maintenance** — Ollama sağlığı + JSON store bütünlüğü periyodik kontrolü

---

## Mimari

```
codegaai/
├── apps/
│   └── codegaai-desktop/              ← Electron masaüstü uygulaması
│       └── src/
│           ├── main/
│           │   ├── main.js                ← Electron main process
│           │   ├── preload.js             ← contextBridge (IPC köprüsü)
│           │   ├── model-manager.js       ← Ollama yönetimi
│           │   ├── phoenix-core/          ← Phoenix Core v2
│           │   │   ├── kernel/            ← EventBus, TaskRegistry
│           │   │   ├── intent/            ← IntentEngine, FastPath
│           │   │   ├── runtime/           ← PhoenixRuntime, StreamingBuffer, ConversationIsolation
│           │   │   └── watchdog/          ← Heartbeat, PhoenixWatchdog
│           │   └── agent/
│           │       ├── zip/               ← ZIP Engine (Sprint 2)
│           │       ├── git/               ← Git Agent (Sprint 3)
│           │       ├── rag.js             ← RAG
│           │       ├── memory.js          ← Hafıza
│           │       └── system-info.js     ← VRAM-aware donanım analizi
│           └── renderer/                  ← UI (vanilla JS, no framework)
├── packages/
│   ├── phoenix-core/                  ← Phoenix Core npm paketi
│   └── phoenix-agents/                ← Agent şablonları
└── NIRVANA.md                         ← Platform vizyonu
```

---

## Kurulum

### Gereksinimler

- Windows 10/11 x64 veya macOS 12+ (Apple Silicon / Intel)
- [Ollama](https://ollama.ai) (uygulama yoksa otomatik kurulum başlatır)
- En az 4 GB RAM (8 GB+ önerilir)
- NVIDIA GPU 4 GB+ VRAM *(opsiyonel; CPU'da da çalışır)*

### İndir & Çalıştır

```
1. Releases sayfasından son sürümü indir
2. Kurulumu çalıştır (yükseltilmiş yetki talep etmez)
3. CODEGA AI açılır
4. Ollama yoksa otomatik kurulum + model indirme başlar
5. Çalışmaya hazır
```

👉 [Son sürümü indir](https://github.com/codegatr/codegaai/releases/latest)

### Geliştirici Kurulumu

```bash
git clone https://github.com/codegatr/codegaai.git
cd codegaai/apps/codegaai-desktop
npm install
npm run dev
```

---

## Sürüm Geçmişi

| Sürüm | Tarih | Öne Çıkan |
|---|---|---|
| **v6.0.0-alpha.11** | 2026-06-27 | Sprint 4: Proje Hafızası — 11 kategori, 13 IPC kanalı, AI bağlam özeti, auto-detect |
| **v6.0.0-alpha.10** | 2026-06-27 | VRAM-aware öneri motoru; Cookbook ↔ "Önerilen Modeli Kur" tutarsızlığı giderildi |
| **v6.0.0-alpha.9** | 2026-06-27 | 7 kritik bug düzeltmesi · preload.js zip/git kanalları · NIRVANA.md |
| **v6.0.0-alpha.8** | 2026-06-27 | Phoenix Core v2 tam entegrasyon (EventBus · Watchdog · ConversationIsolation · Stream · Intent) |
| **v6.0.0-alpha.7** | 2026-06-27 | Sprint 3: Git Agent — 11 IPC kanalı, Conventional Commits, release notes üretimi |
| **v6.0.0-alpha.6** | 2026-06-27 | Sprint 2: ZIP Engine — 16 stack imzası, 6 IPC kanalı, pure JS parser |

---

## Nirvana Vizyon

Tam yol haritası için → **[NIRVANA.md](NIRVANA.md)**

```
Bugün:   Kullanıcı ne yapılacağını söyler, AI yapar.
Yarın:   AI ne yapılması gerektiğini söyler, kullanıcı onaylar.
Nirvana: Kullanıcı misyon verir, AI her şeyi yapar.
```

Ajan ekibi (inşa edilecek): CEO · CTO · Mimar · Planlayıcı · Backend · Frontend · DB · DevOps · Security · QA · Performans · Dokümantasyon · Release Manager · Builder · Git Agent · ZIP Agent · Memory Manager · Research Agent

---

> *"Build toward Nirvana. Every sprint. Every commit. Every release."*

<p align="center">
  <strong>CODEGA AI</strong> — MIT Lisansı ·
  <a href="https://codega.com.tr">codega.com.tr</a>
</p>
