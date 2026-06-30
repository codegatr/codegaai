<p align="center">
  <img src="https://raw.githubusercontent.com/codegatr/codegaai/main/codegaai/ui/web/assets/codega_logo.png" width="520" alt="CODEGA AI - Otonom Yapay Zeka Platformu" />
</p>

<h1 align="center">CODEGA AI</h1>

<p align="center">
  <strong>Hafızalı, araç kullanabilen, federe ağa bağlı otonom dijital personel sistemi.</strong>
</p>

<p align="center">
  <em>"CODEGA AI'nin başarısı, kaç özellik eklediğiyle değil; her yeni sürümde ne kadar daha iyi bir yazılım mühendisi haline geldiğiyle ölçülür."</em><br/>
  — <a href="MANIFESTO.md">Mühendislik Manifestosu</a> · 2030 hedefi: bir CODEGA PR'ı kıdemli bir mimar tarafından minimum düzeltmeyle onaylanabilmeli.
</p>

<p align="center">
  <a href="https://github.com/codegatr/codegaai/releases"><img alt="Release" src="https://img.shields.io/github/v/release/codegatr/codegaai?style=for-the-badge&color=f59e0b&label=release"></a>
  <a href="https://github.com/codegatr/codegaai/actions/workflows/build-windows.yml"><img alt="Windows Build" src="https://img.shields.io/github/actions/workflow/status/codegatr/codegaai/build-windows.yml?branch=main&style=for-the-badge&label=Windows"></a>
  <a href="https://github.com/codegatr/codegaai/actions/workflows/build-macos.yml"><img alt="macOS Build" src="https://img.shields.io/github/actions/workflow/status/codegatr/codegaai/build-macos.yml?branch=main&style=for-the-badge&label=macOS%20ARM64"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge"></a>
</p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.10--3.12-3776ab?style=flat-square&logo=python&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-Backend-009688?style=flat-square&logo=fastapi&logoColor=white">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-Portable-0078d4?style=flat-square&logo=windows&logoColor=white">
  <img alt="Apple Silicon" src="https://img.shields.io/badge/macOS-Apple%20Silicon-111827?style=flat-square&logo=apple&logoColor=white">
  <img alt="Local AI" src="https://img.shields.io/badge/Local%20AI-Qwen%20%7C%20llama.cpp-f59e0b?style=flat-square">
  <img alt="Federation" src="https://img.shields.io/badge/Federated-ai.codega.com.tr-06b6d4?style=flat-square">
</p>

<p align="center">
  <a href="https://codega.com.tr">Website</a>
  ·
  <a href="https://github.com/codegatr/codegaai/releases/latest">Download</a>
  ·
  <a href="#-agent-os">Agent OS</a>
  ·
  <a href="#-federe-ogrenme-agi">Federe Ağ</a>
  ·
  <a href="#-api">API</a>
</p>

---

## CODEGA AI Nedir?

CODEGA AI klasik bir chatbot değildir. Yerel modeller, güçlü bulut model sağlayıcıları, proje hafızası, RAG, araç kullanımı, dosya üretimi, kod analizi, görsel/ses/video anlama ve federe öğrenme ağını tek bir ajan omurgasında birleştiren masaüstü AI platformudur.

> Slogan: **AI çalışanı gibi davranan, hafızalı ve araç kullanabilen otonom dijital personel sistemi.**

## Öne Çıkanlar

| Alan | Yetenek |
| --- | --- |
| Multi-Model AI | GPT-5, GPT-4.1, Claude, Gemini, Qwen, Whisper, BGE-M3 ve yerel vision provider manifesti |
| Agent OS | Planner, executor, verifier, uzman profili, model router ve tool policy |
| Project Brain | CODEGA AI, CODEGA ERP, cMiner, Tekcan Metal gibi projeler için ayrılmış hafıza |
| RAG Hafıza | Sohbet, proje, hata, çözüm, web öğrenmesi ve federe sinyaller |
| Araç Kullanımı | Web, GitHub, dosya, ZIP, PDF, Excel, Python sandbox, OCR, görsel analiz |
| Federe Ağ | Ham sohbet göndermeden anonim konu sinyali, kalite puanı, kaynak sayısı ve güven skoru |
| macOS ARM64 | Apple Silicon hedefli `macos-15` build ve `macos-arm64.dmg` artifact |
| Windows Portable | Tek klasör portable Windows build |

## Agent OS

CODEGA AI içindeki ajan çekirdeği her görev için şu blueprint’i üretir:

```text
Kullanıcı mesajı
  -> niyet tespiti
  -> uzman profil seçimi
  -> model zinciri
  -> proje beyni
  -> hafıza kaynakları
  -> araç seti
  -> güvenlik/onay politikası
  -> doğrulama ve öğrenme adımları
```

Agent OS katmanları:

| Katman | Durum |
| --- | --- |
| Çoklu model sistemi | Aktif |
| Gerçek hafıza ve proje beyni | Aktif |
| Kendini geliştirme / feedback hafızası | Kademeli |
| Araç kullanımı | Aktif |
| Planner + Executor | Aktif |
| Uzman AI modları | Aktif |
| Kod tabanı okuma | Aktif - seçili GitHub dosyaları ve SHA tabanlı değişiklik |
| Otonom kod geliştirme | Aktif - korumalı kapsam, ayrı dal, taslak PR ve PR CI |
| Test ve self-repair döngüsü | Aktif - PR doğrulama paketi, insan onayıyla birleştirme |
| Prompt mühendisliği motoru | Tasarımda |
| Sandbox VM | Kademeli |
| Multimodal anlama | Kademeli |
| Auto deployment | Tasarımda |

### Agent Governance

Repository-level agents and CODEGA AI's autonomous development worker share one governed operating system:

- [`AGENTS.md`](AGENTS.md): agent roles, operating loop, and delivery contract.
- [`CODEGA_CORE.md`](CODEGA_CORE.md): mission, active architecture, capabilities, and roadmap.
- [`CODEGA_RULES.md`](CODEGA_RULES.md): mandatory safety, privacy, quality, federation, and release rules.
- [`CODEGA_SKILLS/`](CODEGA_SKILLS): task skills for architecture, backend, desktop UI, Flutter, DevOps, security, QA, memory/RAG, and autonomous development.

The autonomous GitHub development worker loads these files from the target repository before generating a changeset. It selects task-specific skills, keeps a strict context-size limit, and never allows repository instructions to relax its hard safety rules.

Endpoint:

```text
GET  /api/orchestrate/agent-os
POST /api/orchestrate/plan
```

## Agentic Core

CODEGA AI Agentic Core; `.codegaaiignore`, güvenlik sınıflandırması,
prompt injection filtresi, AST tabanlı kod grafiği ve context-pack üretimiyle
ajan kararlarını daha güvenli ve daha isabetli hale getirir.

Endpoint:

```text
POST /api/codebase/index-local
POST /api/codebase/search
POST /api/codebase/context-pack
GET  /api/codebase/graph/{project_id}
```

## Uzman Modları

| Uzman | Odak |
| --- | --- |
| PHP 8.3 / DirectAdmin | Hosting, Laravel, WordPress, MySQL, PHP-FPM |
| Docker / Ubuntu | VPS, Nginx, systemd, deployment |
| Play Console / AAB | Android release, signing, versionCode, keystore |
| ERP / Cari Takip | Fatura, stok, tahsilat, rapor, Excel |
| Kripto Güvenlik | Wallet, API key, hot/cold storage, rate limit |
| SEO / Kurumsal Metin | Marka dili, landing page, blog, dönüşüm |
| 3D Baskı / STL | Ölçü, tolerans, filament, slicer |
| Kod Tabanı Ajanı | Repo tarama, hata bulma, test, rapor |
| AI Sistem Mimarı | Model router, RAG, araç ve güvenlik omurgası |

## Federe Öğrenme Ağı

CODEGA AI kurulu bilgisayarlar isteğe bağlı olarak `ai.codega.com.tr` koordinatörüne bağlanır. Amaç ham veriyi toplamak değil; cihazların öğrendiği konuları anonim ve kalite filtresinden geçmiş sinyaller olarak birleştirmektir.

Gizlilik sözleşmesi:

- Ham sohbet gönderilmez.
- Dosya gönderilmez.
- API key, token, `.env`, local path ve tam node ID gönderilmez.
- Konular kalite filtresinden geçer.
- Aynı konu birden fazla cihazda öğrenilirse güven skoru yükselir.
- Rate limit ve admin prune desteği vardır.

Koordinatör endpoint’leri:

```text
GET  /api/federation/health
GET  /api/federation/capabilities
GET  /api/federation/metrics
POST /api/federation/stats
GET  /api/federation/knowledge
GET  /api/federation/nodes
GET  /api/federation/admin?token=...
GET  /api/federation/admin/prune?token=...
```

DirectAdmin kurulumu:

```text
deploy/federation-php/public/  ->  public_html/api/federation/
config.sample.php              ->  config.php
schema.sql                     ->  manuel tablo kurulumu için
```

## Platform ve Build

| Platform | Artifact | Hedef |
| --- | --- | --- |
| Windows | `codegaai-vX.Y.Z-windows-cpu.zip` | Portable desktop |
| macOS Apple Silicon | `codegaai-vX.Y.Z-macos-arm64.dmg` | M1, M2, M3, M4 |

macOS workflow açıkça Apple Silicon doğrular:

```yaml
runs-on: macos-15
```

```bash
test "$(uname -m)" = "arm64"
```

## Kurulum

Windows:

```text
Releases sayfasından Windows ZIP indir
D:\2-CODEGAAI\ altına çıkar
codegaai.exe çalıştır
```

macOS Apple Silicon:

```text
Releases sayfasından macos-arm64 DMG indir
DMG dosyasını aç
CODEGA AI klasörünü Applications'a sürükle veya içindeki codegaai dosyasını çalıştır
```

Geliştirici:

```bash
git clone https://github.com/codegatr/codegaai.git
cd codegaai
python -m pip install -r requirements.txt
python launcher.py
```

macOS Apple Silicon geliştirici kurulumu (MacBook Pro M1/M2/M3/M4):

```bash
xcode-select --install
brew install python@3.12 cmake
git clone https://github.com/codegatr/codegaai.git
cd codegaai
bash installer/macos/install.sh
source .venv/bin/activate
python launcher.py
```

Not: Python 3.12 kurulumunda Coqui `TTS` paketi atlanır; ana uygulama, sohbet,
görsel, OCR, dosya ve backend özellikleri kurulmaya devam eder. XTTS/Coqui TTS
özelliğine ihtiyacınız varsa `brew install python@3.11` kurup sanal ortamı
Python 3.11 ile oluşturun.

## API

| Grup | Endpoint |
| --- | --- |
| Sohbet | `/api/jobs/chat`, `/api/stream/chat` |
| Hafıza | `/api/memory/search`, `/api/memory/learn`, `/api/memory/ensure-embedding` |
| Orkestrasyon | `/api/orchestrate/platform`, `/api/orchestrate/agent-os`, `/api/orchestrate/plan` |
| Federe Ağ | `/api/federation/status`, `/api/federation/sync`, `/api/federation/capabilities` |
| Görsel | `/api/vision/analyze`, `/api/vision/ocr` |
| Dosya | `/api/files/upload`, `/api/files/pack`, `/api/files/project` |
| Sandbox | `/api/sandbox/run`, `/api/sandbox/analyze` |
| Kod | `/api/codebase/*`, `/api/devtools/*`, `/api/powertools/*` |
| Sistem | `/api/system/info`, `/api/system/health`, `/api/models/*` |

## Güvenlik

- Token ve API key değerleri maskelenir.
- `.env` ve gizli config içerikleri modele ham verilmez.
- Riskli araçlar onay politikasıyla ayrılır.
- İnternetten gelen içerik doğrudan komut olarak çalıştırılmaz.
- Federe ağ yalnızca anonim ve kalite filtresinden geçmiş sinyal taşır.

## Lisans

Bu proje MIT lisansı ile yayınlanır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 🏗️ Sprint 5 — Builder Engine

CODEGA AI, gerçek çalışan proje iskeleti üretir ve ZIP olarak verir.

**Desteklenen Stack'ler:**

| Stack | Teknoloji | Veritabanı |
|-------|-----------|------------|
| Laravel | PHP 8.3 / Laravel 11 | MySQL / PostgreSQL |
| Express | Node.js 20 / Express 4 / Prisma | PostgreSQL / MySQL |
| React + Vite | React 18 / Tailwind / React Router | — |
| Vue 3 + Vite | Vue 3 / Pinia / Vue Router / Tailwind | — |
| Next.js 14 | Next.js 14 App Router / TypeScript / Prisma / NextAuth | PostgreSQL / MySQL |
| Flutter | Flutter 3 / Dart / Riverpod / GoRouter / Dio | — |

**Her üretilen proje içerir:** Auth yapısı · Docker + docker-compose · `.env.example` · Veritabanı şeması / migration · GitHub Actions CI/CD · Test dosyaları · README.md

**IPC Kanalları:** `builder:stacks` · `builder:build` · `builder:preview`

## 🧩 Sprint 6 — Plugin System

CODEGA AI artık harici plugin'leri destekliyor. ZIP dosyasından kur, anında etkinleştir.

**Mimarisi:**

- Her plugin `userData/plugins/<id>/` klasörü içindedir
- `plugin.json` manifest: id, name, version, description, author, entry, permissions
- `index.js` entry point: `onLoad(ctx)`, `onUnload()`, `ipcHandlers`, `intentHandlers`
- Sandbox güvenliği: IPC kanalları mutlaka `<plugin-id>:` ile başlamalı
- Plugin başına kalıcı `key-value store` (`userData/plugins/<id>/data/store.json`)
- IntentEngine entegrasyonu: plugin'ler yeni intent handler'ları kaydedebilir

**8 IPC Kanalı:**

| Kanal | Fonksiyon |
|-------|-----------|
| `plugin:list` | Tüm plugin'leri listele |
| `plugin:info` | Tek plugin detayı |
| `plugin:enable` | Etkinleştir + yükle |
| `plugin:disable` | Devre dışı bırak + kaldır |
| `plugin:install-zip` | ZIP'ten kur |
| `plugin:uninstall` | Kaldır |
| `plugin:reload` | Hot-reload |
| `plugin:intent-handlers` | Kayıtlı intent listesi |

**preload API:** `window.codega.plugins.*`

---

## 🖥️ Masaüstü Ajan — Güncel Yetenekler (v6.0.0-alpha)

Son sürümlerde masaüstü ajanı (Electron + Ollama) kararlılık ve UX açısından üretim seviyesine taşındı:

| Yetenek | Açıklama | Sürüm |
|---------|----------|-------|
| **Chat / Cowork / Code modları** | Üstteki sekmelerle çalışma modu; her mod modele farklı davranış yönergesi verir (sohbet · birlikte proje yürütme · kod-öncelikli). | alpha.56 |
| **Sohbet içi ZIP** | 📎 ile `.zip` yükle → arşiv içeriği (dosya ağacı + metin) güvenli motorla okunup modele verilir; üretilen proje kod blokları tek `.zip` olarak indirilir. | alpha.56 |
| **Mesaj kopyalama** | Hem asistan hem kullanıcı mesajlarında 📋 kopyala. | alpha.56 |
| **Kademeli web çekme** | `read_url`/`research` artık düz fetch → mobil UA → public reader (r.jina.ai) sırasıyla dener. **Yalnız herkese açık içerik**; login/paywall'da durur. | alpha.57 |
| **Akış DOM optimizasyonu** | Streaming her karede tüm konuşmayı değil yalnız ilgili mesaj düğümünü günceller (uzun sohbette jank/bellek baskısı giderildi). | alpha.58 |
| **Transaction'lı release** | `release.ps1`: lockfile + yedek/rollback + `finally` temizliği; PHP-regex & SemVer fail-fast guard. | alpha.58–59 |
| **Çıktı-tavanı koruması** | Model `done_reason:"length"` ile yarıda kesilirse otomatik "kaldığın yerden devam et" turları + stream aggregation; `temperature` strict 0.2, `num_predict` 4096. | alpha.59 |
| **Anti-tekrar + bilişsel doğrulama** | `repeat_penalty`/`repeat_last_n`/`top_p`/`top_k`; fact-lock/SACV/SSV doğrulama kapıları; ACE bağlam motoru ve Academy müfredatı. | alpha.50+ |

### 🎯 Hedefler / Yapılacaklar (Roadmap)

- [ ] **Mod-bazlı derin davranış** — Cowork/Code modlarına moda özel araç seti ve sistem davranışı (şu an prompt yönlendirmesi düzeyinde).
- [ ] **Reader gizlilik ayarı** — kademeli web çekmedeki public-reader fazını opsiyonel/varsayılan-kapalı yapan ayar (URL üçüncü tarafa gittiği için).
- [ ] **Release CI yarışını kapatma** — `action-gh-release` eşzamanlılık yarışını seri (concurrency/needs) hale getirip Windows `latest.yml` kaçaklarını kalıcı önleme.
- [ ] **Monorepo workspaces değerlendirmesi** — root npm workspaces'e geçiş ayrı, dikkatli bir PR olarak (Electron build kırma riski nedeniyle aceleye getirilmeyecek).
- [ ] **Görsel ek desteği** — vision modeli (örn. llava) ile chat'e görsel ekleme.
- [ ] **`inc/version.php` SemVer pipeline** — PHP sürüm dosyası eklendiğinde release.ps1'deki SemVer/regex guard tam devreye girer (altyapı hazır).

---

<p align="center">
  <strong>CODEGA AI - yerel, hafızalı, araç kullanan ve federe ağ ile büyüyen otonom yapay zeka platformu.</strong>
</p>

<p align="center">
  <a href="https://starchart.cc/codegatr/codegaai">
    <img alt="Stargazers over time" src="https://starchart.cc/codegatr/codegaai.svg?variant=adaptive" />
  </a>
</p>
