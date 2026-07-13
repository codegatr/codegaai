<p align="center">
  <img src="https://raw.githubusercontent.com/codegatr/codegaai/main/codegaai/ui/web/assets/codega_logo.png" width="520" alt="CODEGA AI - Otonom Yapay Zeka Muhendislik Platformu" />
</p>

<h1 align="center">CODEGA AI</h1>

<blockquote align="center">
  <strong>CODEGA AI is not a chatbot.<br/>
  It is an evolving software engineering platform.<br/>
  It remembers projects, not messages.<br/>
  It learns engineering, not answers.<br/>
  It improves through evidence, not assumptions.<br/>
  It never stops becoming a better engineer.</strong>
</blockquote>

<p align="center">
  <em>"Her yeni sürüm, CODEGA AI'yi daha iyi bir yazılım mühendisi yapmalıdır."</em><br/>
  — <a href="NIRVANA.md">Nirvana Manifestosu</a> · <a href="MANIFESTO.md">Mühendislik Manifestosu</a> · 2030 hedefi: bir CODEGA PR'ı kıdemli bir mimar tarafından minimum düzeltmeyle onaylanabilmeli.
</p>

<p align="center">
  <a href="https://github.com/codegatr/codegaai/releases"><img alt="Release" src="https://img.shields.io/github/v/release/codegatr/codegaai?style=for-the-badge&color=f59e0b&label=release"></a>
  <a href="https://github.com/codegatr/codegaai/actions/workflows/build-windows.yml"><img alt="Windows Build" src="https://img.shields.io/github/actions/workflow/status/codegatr/codegaai/build-windows.yml?branch=main&style=for-the-badge&label=Windows"></a>
  <a href="https://github.com/codegatr/codegaai/actions/workflows/build-macos.yml"><img alt="macOS Build" src="https://img.shields.io/github/actions/workflow/status/codegatr/codegaai/build-macos.yml?branch=main&style=for-the-badge&label=macOS%20ARM64"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://codega.com.tr">Website</a>
  ·
  <a href="https://github.com/codegatr/codegaai/releases/latest">İndir</a>
  ·
  <a href="#çekirdek-motorlar">Çekirdek Motorlar</a>
  ·
  <a href="#test-ve-sürüm-disiplini">Sürüm Disiplini</a>
  ·
  <a href="#api">API</a>
</p>

---

## Güncel Sürüm — 6.0.0-alpha.126

**Yayın tarihi:** 13 Temmuz 2026

**İndir:** [CODEGA AI Desktop 6.0.0-alpha.126](https://github.com/codegatr/codegaai/releases/tag/desktop-v6.0.0-alpha.126)

Bu sürümde:

- OpenRouter `openrouter/free` gerçek sohbet sağlayıcı zincirinde çalışır; Ollama yalnız fallback olur.
- Güncel hava ve zamana bağlı bilgiler model tahminine bırakılmadan ağ araçlarıyla alınır.
- Hava konuşmasından sonraki bağımsız araştırmalar eski şehir bağlamına yanlış bağlanmaz.
- Uzun kod bloklarındaki meşru tekrarlar dejenerasyon sayılmaz; gerçek runaway döngü koruması devam eder.
- Üretilen dosyalar doğrulandıktan sonra ZIP paketleme aşaması görünür ve gerçek arşiv teslim edilir.
- Windows ve macOS updater metadata dosyaları release varlıklarıyla birlikte doğrulanır.

Önceki sürümler ve ayrıntılı varlıklar için [GitHub Releases](https://github.com/codegatr/codegaai/releases) sayfasına bakın.

---

## CODEGA AI Nedir?

CODEGA AI, **offline-first çalışan, kendi mühendislik aklına sahip, güvenli şekilde evrimleşen bir Yapay Zeka Yazılım Mühendisliği Platformudur.** Yerel modeller (Ollama/Qwen), güçlü bulut sağlayıcıları (Claude Opus 4.8, GPT, Gemini), proje hafızası, araç kullanımı, yazılım fabrikası ve insan onaylı öz-evrim döngüsünü tek bir ajan omurgasında birleştirir.

Amacı soruları yanıtlamak değil; **anlamak, akıl yürütmek, hatırlamak, mühendislik yapmak, doğrulamak, öğrenmek ve güvenle evrimleşmektir.** Beş kurucu ilke [NIRVANA.md](NIRVANA.md)'de anayasa olarak tanımlıdır: Yapay Biliş, Mühendislik Zekası, Yazılım Fabrikası, Otonom Evrim, Mühendislik Güveni.

## Mimari

```
┌───────────────────────────  Electron Renderer  ────────────────────────────┐
│  Chat / Cowork / Code modları · Kontrol Merkezi · Model Yöneticisi          │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ IPC (preload köprüsü)
┌──────────────────────────────────▼──────────────────────────────────────────┐
│                            Main Process (Agent OS)                           │
│                                                                              │
│  ACE (Bilişsel Bağlam)      MissionOS (Görev Motoru)    Evolution Engine     │
│  ├ Conversation Memory      ├ mission-planner           ├ zayıflık analizi   │
│  ├ Project Brain            ├ mission-scheduler         ├ patch önerisi      │
│  ├ Engineering Brain        └ mission-executor          └ insan onaylı PR    │
│  ├ Goal / Life Graph                                                         │
│  └ Context Reconstructor    Software Factory (Builder)  Git Agent · ZIP Eng. │
│                             ├ builder-spec → executor   ├ SHA-tabanlı diff   │
│  Cognitive Kernel           ├ entity/proje üretimi      └ güvenli arşiv I/O  │
│  (fact-lock · SACV · SSV)   └ üretim ZIP teslimi                             │
│                                                                              │
│  Model Router → Ollama (yerel) → Claude Opus 4.8 / GPT / Gemini (fallback)   │
│  Araştırma: kaynak kalite skoru · tazelik etiketi · resmi kaynak önceliği    │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                  Federe Ağ (anonim sinyal) · GitHub · Web · Dosya Sistemi
```

## Çekirdek Motorlar

| Motor | Görev | Durum |
| --- | --- | --- |
| **ACE — Artificial Cognitive Engine** | Sohbet değil bilgi ile düşünme: proje beyni, mühendislik beyni, hedef hafızası, yaşam grafiği, bağlam yeniden inşası | Aktif |
| **MissionOS** | Prompt değil görev: planla → zamanla → yürüt → raporla döngüsü | Aktif |
| **Evolution Engine** | Öz-analiz → zayıflık → yama önerisi → test → QA → **insan onaylı** PR; otomatik merge asla | Aktif |
| **Software Factory (Builder)** | Tek prompt'tan mimari + kod + test + üretim ZIP'i; builder-spec sözleşmeleri | Aktif (kapsam büyüyor) |
| **Git Agent** | Depo zekası: seçili dosya okuma, SHA-tabanlı değişiklik, dal/PR açma | Aktif |
| **ZIP Engine** | Sıfır-bağımlılık arşiv okuma/yazma/yamalama; path-traversal korumalı | Aktif |
| **Cognitive Kernel** | fact-lock, SACV/SSV doğrulama kapıları, anti-loop, cevap yeterlilik denetimi | Aktif |
| **Context Engine** | Her cevaptan önce bağlam yeniden inşası; bağlam güveni düşükse uydurmak yerine sorar | Aktif |
| **Model Router** | Görev tipine göre yerel/bulut model seçimi; `modelFallbackOrder` zinciri | Aktif |
| **Academy** | Müfredat tabanlı öz-eğitim ve öğrenilen bilgi kalıcılığı (`ogrenilenler.md`) | Kademeli |

## Agent OS ve Agentic Core

Agent OS her görev için niyet → uzman profili → model zinciri → proje beyni → araç seti → güvenlik politikası → doğrulama planı üretir. Yönetişim dört belgede tanımlıdır: [`AGENTS.md`](AGENTS.md) (roller ve teslim sözleşmesi), [`CODEGA_CORE.md`](CODEGA_CORE.md) (misyon ve mimari), [`CODEGA_RULES.md`](CODEGA_RULES.md) (güvenlik/kalite kuralları), [`CODEGA_SKILLS/`](CODEGA_SKILLS) (görev prosedürleri).

**Agentic Core** kod tabanı zekasını sağlar: `CodeIndexer` ile depo indeksleme, `context-pack` üretimi, `.codegaaiignore` ile kapsam kontrolü, güvenlik sınıflandırması ve prompt-injection filtresi. Otonom geliştirme korumalı kapsamda, ayrı dalda, taslak PR ve CI ile çalışır — üretime insan onayı olmadan hiçbir şey girmez.

```text
GET  /api/orchestrate/agent-os
POST /api/orchestrate/plan
POST /api/codebase/index-local · /api/codebase/context-pack
```

## Federe Öğrenme Ağı

Ham sohbet, dosya, API anahtarı veya yerel yol asla gönderilmez. Yalnızca anonim konu sinyali, kalite puanı ve güven skoru paylaşılır (`ai.codega.com.tr`). Durum `/api/federation/status`, metrikler `/api/federation/metrics` üzerinden izlenir; federe bilgi yerelde doğrulanana kadar "ipucu" muamelesi görür. DirectAdmin dağıtımı için `deploy/federation-php/` hazırdır.

## Platform ve Kurulum

| Platform | Artifact | Hedef |
| --- | --- | --- |
| Windows | `CODEGA-AI-Setup-*.exe` (NSIS, otomatik güncelleme) | x64 |
| macOS Apple Silicon | `macos-arm64.dmg` / universal DMG | M1–M4 (`macos-15`, `arm64` doğrulamalı) |

**Windows:** [Releases](https://github.com/codegatr/codegaai/releases/latest) → Setup `.exe` indir ve çalıştır.

**macOS Apple Silicon:** Releases → DMG'yi aç, uygulamayı Applications'a sürükle.

**Geliştirici (Python backend):**

```bash
git clone https://github.com/codegatr/codegaai.git
cd codegaai
python -m pip install -r requirements.txt
python launcher.py
```

**Geliştirici (Masaüstü / Electron):**

```bash
cd apps/codegaai-desktop
npm install
npm run dev        # uygulamayı başlat
npm run test:ci    # check + 58 suite / 654 test
```

macOS geliştirici kurulumu: `bash installer/macos/install.sh` (Python 3.12'de Coqui TTS atlanır; XTTS gerekiyorsa Python 3.11 kullanın).

## API

| Grup | Endpoint |
| --- | --- |
| Sohbet | `/api/jobs/chat`, `/api/stream/chat` |
| Hafıza | `/api/memory/search`, `/api/memory/learn`, `/api/memory/ensure-embedding` |
| Orkestrasyon | `/api/orchestrate/platform`, `/api/orchestrate/agent-os`, `/api/orchestrate/plan` |
| Federe Ağ | `/api/federation/status`, `/api/federation/metrics`, `/api/federation/sync`, `/api/federation/capabilities` |
| Görsel | `/api/vision/analyze`, `/api/vision/ocr` |
| Dosya | `/api/files/upload`, `/api/files/pack`, `/api/files/project` |
| Sandbox | `/api/sandbox/run`, `/api/sandbox/analyze` |
| Kod | `/api/codebase/*`, `/api/devtools/*`, `/api/powertools/*` |
| Sistem | `/api/system/info`, `/api/system/health`, `/api/models/*` |

## Test ve Sürüm Disiplini

Hiçbir sürüm şu kapılardan geçmeden yayınlanmaz:

1. **`npm run check`** — 240+ dosyalık yapısal sözleşme: zorunlu modüller, sürüm çift-pin (package.json ↔ check.mjs), güvenlik kuralları (asar, asInvoker, emekli model referansı yasağı)
2. **`npm run test:ci`** — 58 suite / 654 Jest testi: regresyon, UTF-8/mojibake, builder, ZIP bütünlüğü, görev sürekliliği, bağlam sürekliliği, hafıza bütünlüğü, Kontrol Merkezi sözleşmesi
3. **Python sözleşme testleri** — README, federasyon PHP, kurulum ve platform iş akışı denetimleri
4. **Tag-tetiklemeli release** — `desktop-v*` tag'i Windows + macOS build'lerini üretir; updater metadata (`latest.yml`) otomatik yayınlanır

Her önemli karar izlenebilirdir: model kararları, doğrulama kapıları ve araç çağrıları loglanır; kara kutu yoktur.

## Güvenlik

- Token ve API anahtarları maskelenir; `.env`/gizli config modele ham verilmez.
- API anahtarları yalnızca cihazda saklanır; ayar dışa aktarımı anahtar içerdiğini kullanıcıya onaylatır.
- Riskli araçlar (kod çalıştırma, MCP, otonom geliştirme) onay politikasıyla ayrılır.
- İnternet/RAG/yükleme içeriği güvensiz kabul edilir; içerikteki talimatlar komut olarak çalıştırılmaz.
- ZIP işlemleri path-traversal'a karşı korunur; federe ağ yalnızca anonim sinyal taşır.

## Mühendislik Felsefesi

Anayasa iki belgede yaşar: [NIRVANA.md](NIRVANA.md) (Beş Kurucu İlke, gözlemlenebilirlik, öğrenme ve sürüm disiplini) ve [MANIFESTO.md](MANIFESTO.md) (günlük mühendislik ilkeleri). Özü:

- Hack yerine mimari; kısayol yerine sürdürülebilirlik; varsayım yerine gözlemlenebilirlik.
- Asla tahmin etme, asla bağlam uydurma, asla başarısız testi görmezden gelme.
- Çözülen her bug kalıcı bilgi; reddedilen her PR mühendislik rehberi. **Aynı hata iki kez yapılmaz.**
- Otonomi insan onayıyla sınırlıdır. Güven, hızdan önemlidir.

## Bilinen Sınırlar ve Olgunluk

Dürüstlük ilkesi gereği ([docs/NIRVANA_AUDIT_2026-07.md](docs/NIRVANA_AUDIT_2026-07.md) tam rapor):

- **Yerel model tavanı:** 3–8B yerel modeller mühendislik derinliğinde bulut modellerinin gerisindedir; zor işler için Claude Opus 4.8 fallback zinciri önerilir.
- **Builder kapsamı:** Tek prompt'tan tam üretim sistemi (auth + admin panel + CI + Docker dahil) hedefi kısmen karşılanıyor; Software Factory sözleşmesi büyümeye devam ediyor.
- **Prompt mühendisliği motoru ve auto-deployment** henüz tasarım aşamasında.
- **Kod imzalama yok:** Build'ler imzasızdır (`UNSIGNED-BUILD-NOTICE.txt`); SmartScreen/Gatekeeper uyarısı normaldir.

## Yol Haritası

- [ ] **Eko mod** — Claude/bulut isteklerinde `effort` parametresiyle maliyet kontrolü (rutin işlerde medium/low)
- [ ] **Akıllı yönlendirme** — zor görevlerin kullanıcı seçimi olmadan en güçlü modele otomatik yönlendirilmesi
- [ ] **Kaynak çapraz doğrulama** — birden fazla bağımsız kaynağın aynı bilgiyi teyidi
- [ ] **Mod-bazlı derin davranış** — Cowork/Code modlarına özel araç seti ve sistem davranışı
- [ ] **Reader gizlilik ayarı** — kademeli web çekmede public-reader fazını opsiyonel yapma
- [ ] **Görsel ek desteği** — vision modeliyle (örn. llava) sohbete görsel ekleme
- [ ] **Monorepo workspaces** — Electron build kırma riski nedeniyle dikkatli, ayrı bir PR olarak

## Geliştirme Akışı ve Katkı

1. [`AGENTS.md`](AGENTS.md) + [`CODEGA_RULES.md`](CODEGA_RULES.md) okunur (ajan sözleşmesi ve güvenlik kuralları).
2. Değişiklik ayrı dalda yapılır; `npm run test:ci` yeşil olmadan main'e girmez.
3. Sürüm çift-pinlidir: `package.json` ve `scripts/check.mjs` birlikte güncellenir.
4. Her anlamlı iş şu raporla biter: özet, değişen dosyalar, koşan testler, riskler, sürüm/PR durumu.
5. Devir notları `AGENT_HANDOFF.md` sonuna eklenir — sonraki ajan (insan ya da AI) kaldığı yerden devam eder.

## Gelecek Vizyonu

CODEGA AI bir "AI şirketi"ne evrilmektedir: planlayan, kodlayan, test eden, birbirini denetleyen uzman ajanlar ([NIRVANA.md](NIRVANA.md) ajan kadrosu). Kullanıcının rolü "AI'ye ne yapacağını söyleyen"den "AI'nin ne yapılması gerektiğini söylediği" ortağa dönüşür. Başarının tek ölçüsü değişmez:

> **"CODEGA AI bugün, dünden daha iyi bir yazılım mühendisi mi?"**

## Lisans

Bu proje MIT lisansı ile yayınlanır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

---

<p align="center">
  <strong>CODEGA AI — projeleri hatırlayan, kanıtla gelişen, güvenle evrimleşen yerel AI yazılım mühendisliği platformu.</strong>
</p>
