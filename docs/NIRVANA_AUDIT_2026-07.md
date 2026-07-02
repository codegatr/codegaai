# NIRVANA Denetimi — 2026-07 (alpha.100)

Anayasa ([NIRVANA.md](../NIRVANA.md) v2.0) gereği istenen yedi teslimatın konsolide raporu.
Dürüstlük ilkesiyle yazılmıştır: ölçülemeyen ilerleme, ilerleme sayılmaz.

**Anlık durum:** `6.0.0-alpha.100` yayında (Windows NSIS + macOS universal DMG) ·
50 Jest suite / 583 test PASS · ~240 JS modülü · check.mjs yapısal sözleşmesi ~460 satır.

---

## 1. Mimari Denetim (Architecture Audit)

**Güçlü:**
- **Katmanlı ajan omurgası oturmuş:** renderer (UI) → preload köprüsü → main (Agent OS). Motorlar dizin bazında ayrık: `agent/ace/*` (8 bilişsel organ), `agent/mission/*`, `agent/evolution/*`, `agent/builder/*`, `agent/git/*`, `agent/zip/*`, `agent/aep/*` (öz-iyileştirme), `cognitive/kernel`, `phoenix-core` (event-bus, watchdog, conversation-isolation).
- **Sözleşme-öncelikli kalite:** check.mjs zorunlu modül listesi + davranış sözleşmeleri (ör. emekli Claude modeli referansı **yasak**, sampling guard **zorunlu**), Jest regresyon paketi, Python platform sözleşmeleri. Bu üçlü, Foundation 5'in (Engineering Trust) fiilî uygulamasıdır.
- **Güvenlik varsayılanları doğru:** path-traversal korumalı ZIP, onay politikalı riskli araçlar, anahtar maskeleme, asInvoker installer.

**Zayıf / risk:**
- **Monolit renderer:** `renderer.js` ~164 KB tek dosya. UI mantığı motorlardan iyi ayrılmış değil; Kontrol Merkezi denetiminde bulunan "ölü ID" sınıfı hatalar bu monolitin belirtisi. (Sözleşme testi eklendi; kalıcı çözüm modülerleştirme.)
- **Çift ekosistem:** kökteki Python platformu (`codegaai/`, launcher.py, FastAPI) ile Electron masaüstü (`apps/codegaai-desktop`) paralel yaşıyor; ayrıca `packages/phoenix-*` ile `src/main/phoenix*` arasında kavramsal örtüşme var. Hangi yüzeyin "birincil ürün" olduğu README'de netleştirildi (masaüstü), ancak kod tabanında sınır belgelenmeli.
- **Kaynak kodda karışık unicode escape'ler:** bazı dosyalarda Türkçe metinler kısmen `\uXXXX`, kısmen düz karakter (alpha döneminin mojibake onarım izleri). Davranışı bozmuyor ama düzenlemeyi zorlaştırıyor.

## 2. Teknik Borç Raporu (Technical Debt)

| Borç | Boyut | Öneri |
| --- | --- | --- |
| renderer.js monoliti | Yüksek | Kontrol Merkezi, sohbet ve model yöneticisini ayrı modüllere böl (build kırmadan, kademeli) |
| Python ↔ Electron çifti | Orta | Sınır dokümanı + ortak API sözleşmesi; uzun vadede tek omurga kararı |
| Kaynak içi `\uXXXX` kalıntıları | Düşük | Dosya bazında normalize eden tek seferlik script + mojibake testi zaten var |
| console.log borcu | Düşük | Kendi engineering-score motoru zaten işaretliyor; temizlik sprint'i |
| Dev doküman şişmesi (AGENT_HANDOFF 156 KB, JOURNAL 138 KB) | Düşük | Çeyrek bazında arşivleme (docs/archive/ kuruldu) |
| Kod imzalama yok | Orta | Sertifika alınana dek UNSIGNED-BUILD-NOTICE ile şeffaflık (mevcut) |

Bu oturumda kapatılan borçlar: emekli Claude model varsayılanı, package-lock sürüm kayması (alpha.80→100), alpha.23 staging kalıntıları, Kontrol Merkezi ölü ID'leri, tek seferlik denetim raporlarının arşivlenmesi.

## 3. Entegrasyon Raporu (Integration)

- **Model katmanı:** Ollama (yerel, birincil) + Claude Opus 4.8 / GPT / Gemini fallback zinciri; sampling parametreleri model-farkındalıklı (Claude 4.7+ ailesinde 400 önlenir); emekli model kayıtları otomatik göç eder. ✅
- **Araştırma hattı:** kaynak kalite skoru + tazelik etiketi + resmi kaynak önceliği + host-başına sınır, hem fallback hem normal yolda devrede. ✅
- **GitHub:** öğrenilen bilgi `ogrenilenler.md`'ye commit'lenir; otonom geliştirme taslak PR + CI ile. ✅
- **Federe ağ:** PHP koordinatör (DirectAdmin uyumlu) + anonim sinyal sözleşmesi; metrics/prune uçları test altında. ✅
- **Release hattı:** tag → Windows + macOS build → GitHub Release + updater metadata; alpha.100 ile uçtan uca doğrulandı. ✅
- **Eksik entegrasyon:** MCP araçları ajan döngüsüne bağlı ama varsayılan kapalı; vision modeli sohbete bağlı değil.

## 4. README Yeniden Yazımı

Tamamlandı — [README.md](../README.md) artık vizyonu değil **mevcut sistemi** anlatıyor: kimlik manifestosu en üstte, mimari şema, çekirdek motor tablosu, sürüm disiplini kapıları, bilinen sınırlar ve olgunluk bölümü dahil. Python sözleşme testlerinin zorunlu kıldığı tüm içerik korundu.

## 5. Eksik Yetenekler Raporu (Missing Capabilities)

Anayasa hedefine göre henüz olmayan/yarım olanlar (önem sırasıyla):

1. **Güven yüzeyleri (Observability):** Context/Mission/Memory/Reasoning/Builder/QA Confidence değerleri tek tip skor olarak UI'da gösterilmiyor — parçaları var (bağlam güveni, answer-adequacy), birleşik panel yok.
2. **Software Factory tam listesi:** Auth + Authorization + Admin Panel + Install Wizard + CI çıktısı tek prompt'tan henüz uçtan uca üretilmiyor (entity/proje üretimi ve ZIP teslimi çalışıyor).
3. **"Aylar sonra dön" proje hafızası:** Project Brain mekanizması var; uzun-aralıklı geri dönüş senaryosu (ör. "Ateş Fiat'a devam et") için kalıcılık + geri çağırma regresyon testi yok.
4. **Eko/effort kontrolü:** Bulut isteklerinde `effort` parametresi kullanılmıyor (maliyet fırsatı).
5. **Akıllı model yönlendirme:** Zor görevlerin otomatik olarak en güçlü modele yönlendirilmesi kullanıcı seçimine bağlı.
6. **Prompt mühendisliği motoru, auto-deployment, sandbox VM:** tasarım/kademeli aşamada.

## 6. Mühendislik Olgunluk Raporu (Maturity)

| Kurucu İlke | Olgunluk | Gerekçe |
| --- | --- | --- |
| 1 — Artificial Cognition | **Orta-İyi** | 8 bilişsel organ kodda mevcut ve testli; birleşik güven skoru ve uzun-aralık geri çağırma eksik |
| 2 — Engineering Intelligence | **Orta** | Bağlam yeniden inşası ve proje beyni cevap yolunda; "hangi hata tekrarlanmamalı" sorgusu her çağrıda sistematik değil |
| 3 — Software Factory | **Orta** | Spec→executor→ZIP hattı ve builder sözleşme testleri var; tam üretim sistemi listesi karşılanmıyor |
| 4 — Autonomous Evolution | **İyi** | AEP döngüsü (analiz→backlog→patch→self-QA→PR) + insan onayı zorunluluğu kurulu ve kullanılıyor |
| 5 — Engineering Trust | **İyi** | Çift-pin sürüm, 583 regresyon testi, sözleşme guard'ları, dürüst UNSIGNED bildirimi |

Genel değerlendirme: **sağlam alpha** — mimari omurga ve kalite disiplini üretim düzeyinde; bilişsel derinlik ve fabrika kapsamı hedefin gerisinde.

## 7. Sıradaki Kararlı Sürüm Yol Haritası (Next Stable Roadmap)

`alpha.100 → beta.1` için önerilen sıra (her adım = "daha iyi bir mühendis" metriğine bir katkı):

1. **Confidence Panel** — mevcut güven sinyallerini tek skor setinde topla, Kontrol Merkezi'ne kart olarak bağla (Observability anayasa maddesi).
2. **Eko mod** — Claude/bulut isteklerine `effort` desteği (rutin: medium/low, zor: high) + ayar anahtarı.
3. **Akıllı yönlendirme** — görev zorluk sinyaliyle otomatik güçlü-model tercihi (fallback zincirinin proaktif hali).
4. **Project Brain kalıcılık regresyonu** — "aylar sonra dön" senaryosunun testli garantisi.
5. **Software Factory Sprint 1** — Auth + Install Wizard üretimini builder sözleşmesine ekle.
6. **renderer.js modülerleştirme (faz 1)** — Kontrol Merkezi'ni ayrı modüle taşı.
7. **Kaynak çapraz doğrulama** — araştırmada çok-kaynak teyit rozeti.

Beta kriteri: 1–4 tamam + tüm mevcut kapılar yeşil + bilinen P1 hata sıfır.

---

*Bu rapor her büyük sürümde güncellenir. Ölçü değişmez: CODEGA AI bugün, dünden daha iyi bir yazılım mühendisi mi?*
