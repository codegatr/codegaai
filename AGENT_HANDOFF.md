# Agent Handoff — Claude ↔ Codex Coordination

> Bu dosya iki agent arasındaki canlı koordinasyon kanalıdır. Her agent çalışmaya
> başlamadan ÖNCE en güncel girişi okur, çalışma sonunda kendi girişini ekler.
> Format: en yeni giriş en üstte.

---

## Claude Update - 2026-06-29 00:20

### Current Task
PR #81 (ACE → gerçek chat pipeline) tamamlandı ve release edildi. Artık `chat:send` akışına dokunan açık işim YOK — bu alan Codex için serbest.

### Files Touched (main'e merge edildi — alpha.37)
- `apps/codegaai-desktop/src/main/main.js` — `chat:send` artık ACE'yi kullanıyor (processIncoming → buildContext → mergedContext → modelManager.ask(resolvedMessage) → recordTurn).
- `apps/codegaai-desktop/src/main/agent/ace/ace-os.js` — `_matchKnownEntity()` + `recordTurn()`.
- `apps/codegaai-desktop/src/main/agent/__tests__/ace.test.js` — 7 yeni test.
- `apps/codegaai-desktop/package.json` + `scripts/check.mjs` — alpha.37.

### Decisions Made
- ACE bağlamı `system-prompt.js` `projectContext` alanına enjekte ediliyor; LLM artık boş bağlamla çağrılmıyor.
- Bilinen proje adı (örn. "Ateş Fiat") ≤4 kelime + sonu noktalama yoksa ProjectBrain'den eşleştirilip aktive ediliyor (yanlış-pozitif riski düşük tutuldu).

### Issues / Blockers
- Yok. `chat:send` ve `ace/` alanları artık Codex'e açık (benim açık işim kalmadı).
- Hatırlatma: `package.json` version + `check.mjs` guard hâlâ paylaşılan çakışma noktası — release yapan agent burada belirtsin.

### Tests Run
- `npm run check` → OK (175 dosya, alpha.37).
- jest --ci → 283/283 passed (ACE wiring testleri dahil).
- CI: desktop-v6.0.0-alpha.37 tag'i push edildi, build çalışıyor (sonuç bir sonraki girişte doğrulanacak).

### Suggested Next Step For Codex
- **Engineering Dashboard UI** hâlâ en yararlı bağımsız iş (renderer açılış ekranı, `aep:dashboard` + `ace:dashboard` IPC'lerini tüketir, benim alanımla çakışmaz).
- ACE artık canlı; istersen gerçek bir Electron oturumunda "devam et" / proje-adı senaryolarını smoke-test edip sonucu buraya yazabilirsin.

---

## Claude Update - 2026-06-29 00:05

### Current Task
Codex ile paralel çalışma protokolünü kurmak ve son release durumunu (kullanıcı çökmesine yol açan installer.js truncation hotfix'i) belgelemek. Kod tarafında aktif/devam eden tek işim açık olan **PR #81 (ACE'yi gerçek chat pipeline'ına bağlama)**.

### Files Touched
**Main'e merge edilmiş (alpha.34 → alpha.36):**
- `apps/codegaai-desktop/src/main/agent/installer.js` — truncated `module.exports` bloğu onarıldı (12 export geri eklendi). Açılış çökmesinin kaynağıydı.
- `apps/codegaai-desktop/scripts/check.mjs` — el-seçimi syntax listesi KALDIRILDI; artık `src/` altındaki tüm `.js/.cjs/.mjs` (175 dosya) recursive `node --check`leniyor + 0-byte truncation kontrolü. **Codex: bu recursive taramayı el-seçimi listeye geri DÖNDÜRME.**
- `apps/codegaai-desktop/src/main/update-service.js` — GitHub Releases API çağrısı `GH_API_TOKEN` env varsa kimlikli (rate-limit 60→5000/saat). Token koda gömülmez.
- `.github/workflows/{build-codegaai-desktop-windows,build-codegaai-desktop-macos,desktop-release}.yml` — üçü de build öncesi `npm run test:ci` çalıştırıyor.

**Açık PR #81 (henüz merge değil) — ÇAKIŞMA RİSKİ:**
- `apps/codegaai-desktop/src/main/main.js` — `chat:send` handler'ı ACE'yi entegre ediyor (processIncoming → buildContext → mergedContext → recordTurn).
- `apps/codegaai-desktop/src/main/agent/ace/ace-os.js` — `_matchKnownEntity()` + `recordTurn()` eklendi.
- `apps/codegaai-desktop/src/main/agent/__tests__/ace.test.js` — 7 yeni test.

### Decisions Made
- Release tag formatı ZORUNLU `desktop-v<sürüm>`. Sadece bu format gerçek Windows/macOS electron-builder pipeline'ını tetikler (`.exe/.dmg/latest.yml` üretir). Düz `v<sürüm>` tag'i yalnız ilgisiz bir Linux tarball üretir ve auto-updater onu kullanamaz.
- `check.mjs` artık tek gerçek "truncated dosya release'e çıkamaz" güvencesi. Hand-picked liste bu çökmenin kök nedeniydi.
- Versiyon bump'ı her release'de `package.json` + `check.mjs` guard satırında ELLE yapılıyor — bu iki nokta parallel çalışmada sık çakışır (aşağıya bak).

### Issues / Blockers
- **PR #81 versiyon çakışması:** PR #81 `package.json`'u alpha.36'ya bump ediyor ama main artık alpha.36. PR #81 merge öncesi alpha.37'ye rebase edilmeli. Bunu ben halledeceğim.
- **Codex için çakışma uyarısı:** `main.js` `chat:send` handler'ına ve `ace/` modüllerine şu an PR #81 üzerinden dokunuyorum. Codex bu iki alana dokunacaksa önce buraya not düşsün.
- **Paylaşılan çakışma noktaları:** `apps/codegaai-desktop/package.json` (version) ve `check.mjs` (version guard) her release'de değişir. İkimiz aynı anda release yapmayalım; release yapan agent burada belirtsin.

### Tests Run
- `npm run check` → OK (175 JS dosyası syntax doğrulandı, sürüm 6.0.0-alpha.36).
- `node node_modules/jest/bin/jest.js --ci` → 278/278 passed (10 suite). (Not: bu makinede `.bin/jest` shim yok, jest'i `node node_modules/jest/bin/jest.js` ile çağırıyorum; CI'da `npm run test:ci` sorunsuz.)
- Truncation gate kanıtı: bilerek bozuk dosya eklendiğinde `check.mjs` exit 1 + dosya adı + "Unexpected end of input" raporladı.
- CI: desktop-v6.0.0-alpha.36 için Windows + macOS + Desktop Release workflow'ları **success**. Release assets doğrulandı: `CODEGA-AI-Setup-6.0.0-alpha.36.exe`, `.dmg`, `latest.yml`, `latest-mac.yml`, `SHA256SUMS.txt`. "Latest" işaretli.

### Suggested Next Step For Codex
- Eğer chat pipeline / ACE alanına dokunmak istemiyorsan, en yararlı katkın **Engineering Dashboard UI** (renderer'da `aep-os.dashboard()` + `ace-os.dashboard()` verisini gösteren açılış ekranı) olur — bu alan şu an tamamen backend-only ve benim açık işimle çakışmaz.
- Alternatif: `qa-verification` kapsamında, ACE entegrasyonu için end-to-end smoke testi (gerçek `chat:send` IPC akışında ACE bağlamının prompt'a girdiğini doğrulayan) yazabilirsin — ama önce PR #81 merge olsun, sonra üstüne ekle.
- Lütfen `check.mjs` recursive syntax gate'ini ve 3 workflow'daki `test:ci` adımını koru.
