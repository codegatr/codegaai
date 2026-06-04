# CODEGA AI Kapsamli Saglik Kontrolu

Tarih: 4 Haziran 2026  
Depo: https://github.com/codegatr/codegaai  
Incelenen dal: `main` (`b1b1beb67a94f28ebce0d2b470333d8b56e3b806`)

## Yonetici Ozeti

CODEGA AI aktif gelistirilen, genis yetenekli ve ciddi miktarda test kodu bulunan bir proje. Ancak mevcut haliyle guvenlik sinirlari, CI zorunlulugu ve release disiplini urun iddialarinin gerisinde. Ozellikle "sandbox" ve terminal API'leri gercek izolasyon saglamiyor; URL'den plugin kurulumu dosya sistemi disina yazabiliyor; Electron renderer'da harici MCP verisi HTML'e kacissiz basildigi icin yerel kod calistirmaya uzanan bir XSS zinciri bulunuyor.

**Genel saglik notu: 4.5 / 10 - Kritik iyilestirme gerekli**

| Alan | Not | Durum |
| --- | ---: | --- |
| Guvenlik | 3/10 | Kritik aciklar var |
| Test kalitesi | 6/10 | Genis test tabani var, ancak 5 test kirik ve Python testleri CI kapisi degil |
| CI / Release | 4/10 | Windows basarili; son macOS build basarisiz; eksik release yayimlanmis |
| Bakim / Topluluk | 5/10 | Cok aktif, fakat asiri release hizi ve temel repo politikasi eksikleri var |
| Dokumantasyon | 6/10 | README genis; bazi iddialar uygulamayla uyusmuyor |

## Kritik Bulgular

### K1 - Terminal endpoint'i keyfi kabuk komutu calistiriyor

- Dosya: `codegaai/api/routes/codex_plus.py:37-48`
- `/api/codex_plus/terminal/run`, yalnizca bes metin parcacigini engelledikten sonra kullanici girdisini `shell=True` ile calistiriyor.
- `rm -rf /` engellense bile PowerShell, Python, curl, alternatif silme komutlari ve zincirlenmis komutlar serbest.
- Masaustu varsayilaninda auth token bos ve auth devre disi. Endpoint'in "guvenli sandbox" olarak tanimlanmasi yaniltici.

**Duzeltme:** Endpoint'i varsayilan kapali yap; acik kullanici onayi, arguman dizisi, komut allowlist'i ve ayri dusuk yetkili container/VM zorunlu olsun. `shell=True` kaldirilsin.

### K2 - Python sandbox filtresi kolayca asiliyor

- Dosya: `codegaai/api/routes/sandbox.py:44-46, 90-117`
- Kod metin filtresiyle kontrol ediliyor, fakat calisma ortaminda gercek `__import__` bulunuyor ve kod ayni surec icinde `exec` ediliyor.
- Canli dogrulama: `from os import getcwd` filtreden gecti ve calisti.
- `from os import system`, dinamik attribute erisimi ve benzeri varyasyonlar engel listesini asabilir.
- Thread timeout sonrasi calisan kod gercekte durdurulmuyor; thread arka planda devam edebilir.

**Duzeltme:** Bu mekanizmayi sandbox olarak sunma. Kodu ayri process/container'da; dosya sistemi, ag, CPU, bellek ve sure limitleriyle calistir. Denylist yerine izolasyon kullan.

### K3 - URL'den plugin kurulumunda ZIP path traversal ve otomatik kod yukleme

- Dosya: `codegaai/core/plugin_manager.py:146-168`
- Plugin `id` ve ZIP icindeki `rel` yolu normalize edilmeden `PLUGINS_DIR / pid / rel` altina yaziliyor.
- `../` iceren yollar plugin dizini disina dosya yazabilir.
- Kurulumdan hemen sonra `handler.py` dinamik olarak yuklenip calistiriliyor.

**Duzeltme:** Cozulmus her hedef yolun kesinlikle plugin kokunun altinda kaldigini dogrula; symlink ve mutlak yolları reddet; imza/hash ve acik kullanici onayi ekle; indirme boyutu siniri koy.

### K4 - Harici MCP verisi Electron XSS uzerinden yerel kod calistirmaya donusebilir

- Dosyalar:
  - `apps/codegaai-desktop/src/renderer/renderer.js:1953`
  - `apps/codegaai-desktop/src/main/preload.js:47`
  - `apps/codegaai-desktop/src/main/main.js:578`
- MCP sunucusundan gelen `t.name` ve `t.description`, `innerHTML` ile kacissiz basiliyor.
- Renderer'a `window.codega.runCode()` yetkisi acik. Kotucul HTML/event handler, preload API araciligiyla kullanici yetkileriyle kod calistirabilir.
- Renderer'da CSP bulunmuyor ve BrowserWindow `sandbox: false`.

**Duzeltme:** Harici tum verileri `textContent` ile render et; katı CSP ekle; `sandbox: true` kullan; `runCode` gibi yuksek riskli IPC'leri ayri, her cagri icin ana surecte kullanici onayli capability modeline tasi.

## Yuksek Oncelikli Bulgular

### Y1 - `main` dali korumasiz ve zorunlu kontrol yok

GitHub API'ye gore `main` dahil 31 dalin tamami `protected: false`. Dogrudan push, testsiz veya reviewsuz kodun release'e gitmesine izin veriyor.

**Duzeltme:** Branch protection/ruleset; PR zorunlulugu; en az bir review; required checks; force-push ve delete engeli; signed commit veya vigilant mode.

### Y2 - Python test paketi kirik ve `main` icin CI kapisi degil

- Minimal gerekli bagimliliklarla `293` Python testi calistirildi: **288 basarili, 5 basarisiz**.
- Basarisiz testler masaustu uygulamasinin eski kontratlarini bekliyor: eski surum `0.1.9`, eski UI/provider metinleri ve eksik `app-path`.
- Windows/macOS Python workflow'larinda unit test adimlari `continue-on-error: true`.
- Python build workflow'lari yalnizca `build/**` ve tag'lerde calisiyor; `main` push'larinda Python test/lint guvencesi yok.

**Duzeltme:** Tek bir zorunlu `ci.yml` ekle: Python 3.10-3.12 matrisi, tum unittest/pytest, Ruff, Bandit, dependency audit. Kirik kontrat testlerini guncel davranisa gore duzelt veya ozelligi geri getir.

### Y3 - Release islemi parcali ve son stabil release eksik

- Son release: `desktop-v2.3.2`, 4 Haziran 2026 11:01 UTC.
- Windows build basarili; ayni commit'in macOS build'i `Build macOS app (dmg + zip, unsigned)` adiminda basarisiz.
- Buna ragmen `desktop-v2.3.2` stabil release olarak yayimlandi ve yalnizca Windows installer/updater varliklarini iceriyor.
- Desktop Windows ve macOS workflow'lari birbirinden bagimsiz olarak her `main` push'unda ayni release tag'ine yaziyor.
- Bugun 7 stabil desktop release yayimlanmis; son 100 commit yalnizca 3.58 gune sigiyor.

**Duzeltme:** Buildleri once artifact olarak uret; tum platformlar ve testler basarili olduktan sonra tek release job'i yayinlasin. `main` push'ta release yerine tag/manual release kullan. Concurrency ve prerelease kanali ekle.

### Y4 - Bilinen aciklara sahip Electron ve `tar` surumleri kilitli

NPM advisory bulk taramasinda:

- `electron@33.4.11`: cok sayida moderate/high advisory; mevcut advisory'ler arasinda use-after-free ve renderer/IPC sorunlari var.
- `tar@6.2.1`: path traversal ve keyfi dosya overwrite sinifinda birden fazla high advisory.

**Duzeltme:** Desteklenen guncel Electron surumune gec; `electron-builder` zincirini guncelle; lockfile'i yeniden uret; `npm audit --production` ve tam audit'i CI'a ekle.

### Y5 - Tedarik zinciri sertlestirmesi yetersiz

- GitHub Actions `actions/checkout@v4`, `softprops/action-gh-release@v2` gibi degisebilir tag'lere bagli; commit SHA pin yok.
- Bes workflow'un tamami `contents: write` yetkisi istiyor.
- Bandit, Hugging Face `from_pretrained` / `snapshot_download` kullanimlarinda 17 adet revision pinlenmemis model indirme noktasi buldu.
- Python bagimliliklari araliklarla tanimli; lock/hash dosyasi yok. Tam `pip-audit` Windows uzun-path hatasi nedeniyle tamamlanamadi.

**Duzeltme:** Action'lari SHA'ya pinle; job bazinda minimum izin ver; model revision ve beklenen hash pinle; platform lockfile ve hash'li requirements uret.

### Y6 - macOS masaustu paketi imzasiz

`apps/codegaai-desktop/package.json` icinde macOS `identity: null`; workflow da acikca unsigned build uretiyor. Bu, dagitim guveni ve Gatekeeper deneyimini zayiflatiyor.

## Orta Oncelikli Bulgular

1. `githubToken` ve `openaiApiKey`, `agent-settings.json` icine duz metin yaziliyor (`settings-store.js:17,39,70`). OS keychain/Credential Manager kullanilmali.
2. API upload/ZIP islemlerinde istek ve acilmis icerik boyutu siniri yok; bellek tuketimi ve ZIP bomb riski var.
3. Varsayilan ayarda baslangicta web ogrenmesi ve model indirme acik. Kullaniciya acik opt-in, kaynak/telemetri aciklamasi ve ag butcesi gerekli.
4. Electron'da `sandbox: false`; yuksek yetkili preload API yuzeyi genis.
5. Bandit sonucu: 3 high, 19 medium, 155 low. `shell=True` gercek risk; iki MD5 bulgusu guvenlik amacli gorunmedigi icin dusuk pratik risk; SQL bulgusu sabit secenekten geldigi icin false-positive.
6. `requirements.txt` icinde 41 dogrudan gereksinim ve cok genis ML zinciri var; kurulum tekrarlanabilirligi dusuk.
7. README'de guvenli sandbox ve internet iceriginin komut olarak calistirilmadigi iddialari, mevcut terminal/sandbox/plugin davranisiyla uyusmuyor.

## Repo ve Bakim Sagligi

- Depo 8 Mayis 2026'da olusturulmus; 4 Haziran 2026'da aktif.
- Yaklasik 56,418 kaynak satiri, 255 kaynak dosyasi, 43 Python test dosyasi, 8 desktop reasoning test dosyasi ve 5 workflow var.
- Desktop JS testleri: check, reasoning guard, verification hard gate ve reasoning regression paketlerinin tamami basarili.
- `compileall` basarili; uc adet gecersiz escape sequence uyarisi var.
- Acik issue yok; acik iki PR otomatik uretilmis 10 satirlik oneriler. Bunlar kod duzeltmesi degil.
- Community health: **%28**. CONTRIBUTING, Code of Conduct, issue template ve PR template yok.
- En az 100 release ve 100 tag var; surum/release gürültüsü kullanici guvenini ve geri alma takibini zorlastiriyor.

## Guclu Taraflar

1. Kod tabani test yazmaya onem veriyor; Python ve Electron reasoning tarafinda genis kontrat kapsami var.
2. Electron'da `contextIsolation: true` ve `nodeIntegration: false`.
3. Windows desktop workflow'u son calismalarda istikrarli bicimde basarili.
4. Auth icin sabit zamanli karsilastirma ve server modunda bos token'i reddetme mevcut.
5. Federe veri icin secret redaction ve ham sohbeti disarida tutma niyeti kod ve testlerde goruluyor.
6. MIT lisansi, genis README ve coklu platform hedefleri mevcut.

## Onerilen 30 Gunluk Plan

### Ilk 48 saat

1. `/api/codex_plus/terminal/run`, `/api/sandbox/run` ve URL plugin kurulumunu varsayilan kapat.
2. MCP renderer XSS'ini `textContent` ile duzelt; Electron CSP ve sandbox ekle.
3. `main` branch protection ve required checks ac.
4. `desktop-v2.3.2` release'ini eksik platform konusunda isaretle; macOS duzelmeden tam stabil olarak tanitma.

### Ilk hafta

1. Tek zorunlu CI pipeline'i kur; 5 kirik testi duzelt.
2. Electron ve `tar` bagimliliklarini guncelle; npm audit'i zorunlu yap.
3. Release'i tek orkestre job'a tasi; platformlar tamamlanmadan yayinlama.
4. Plugin ve kod calistirma ozelliklerini gercek process/container izolasyonuna tasi.
5. Tokenlari OS secret store'a tasi.

### Ilk ay

1. Threat model, SECURITY.md, sorumlu acik bildirim sureci ve release checklist ekle.
2. Python lock/hash, SBOM, artifact signing ve provenance ekle.
3. Hugging Face model revision/hash pinleme yap.
4. CONTRIBUTING, issue/PR template, changelog ve semantik release politikasini olustur.
5. Guvenlik regresyon testleri ekle: sandbox bypass, ZIP traversal, MCP XSS/IPC ve auth-disabled local API saldiri yuzeyi.

## Calistirilan Kontroller

- GitHub repo, dal, workflow, action run, release, PR, issue, commit, tag ve community profile API incelemesi
- Kaynak agaci ve kritik guvenlik yuzeylerinin manuel incelemesi
- Python `unittest discover`: 293 test, 5 failure
- Desktop Node test paketleri: tumu basarili
- Python `compileall`: basarili, 3 uyari
- Bandit: 3 high, 19 medium, 155 low
- NPM advisory bulk audit: `electron` ve `tar` riskli
- Python tam dependency audit denemesi: Windows long-path nedeniyle tamamlanamadi
- GitHub code/dependabot/secret scanning alert listeleri: kimlik dogrulama olmadigi icin API'den goruntulenemedi
- Son macOS Actions log arsivi: GitHub API 403 verdigi icin indirilemedi; basarisiz adim metadata ile dogrulandi

## Kaynak Baglantilari

- Repo: https://github.com/codegatr/codegaai
- Actions: https://github.com/codegatr/codegaai/actions
- Son basarisiz macOS run: https://github.com/codegatr/codegaai/actions/runs/26947492163
- Son Windows run: https://github.com/codegatr/codegaai/actions/runs/26947492115
- Son release: https://github.com/codegatr/codegaai/releases/tag/desktop-v2.3.2
- Acik PR #26: https://github.com/codegatr/codegaai/pull/26
- Acik PR #27: https://github.com/codegatr/codegaai/pull/27
- Electron advisory ornegi: https://github.com/advisories/GHSA-9wfr-w7mm-pc7f
- node-tar advisory ornegi: https://github.com/advisories/GHSA-83g3-92jg-28cx
