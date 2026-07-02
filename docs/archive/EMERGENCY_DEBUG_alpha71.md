# EMERGENCY DEBUG — "model hiç cevap üretmiyor" (v6.0.0-alpha.71)

> Kural: yeni özellik yok. Regresyonu bul. Tahmin etme — trace et + ölçüm aracı koy.

## Statik trace bulguları (kod okuması)

1. **Watchdog erken tetiklemiyor.** `renderer.js:1616` `idleMs = 300000` (5 dk). "Model uzun süre gerçek bir yanıt üretmedi" mesajı = **5 dakika boyunca HİÇ token gelmedi.** Yani gerçek bir takılma, dar timeout değil.
2. **"2+2?" modele GİTMEZ.** `fast-path.js calculatorAnswer` → "4" döner, `main.js:576` FastPath model çağrısından ÖNCE return eder. → Eğer "2+2?" bile takılıyorsa, kilit **fast-path'ten ÖNCEki** orkestrasyondadır (initACEOS/processIncoming/contextEngine/buildContext/intent), modelde/streaming'de DEĞİL.
3. **initACEOS cachelidir** (`_aceInstance` singleton) — per-mesaj maliyeti düşük. **buildContext hafiftir.** Statik olarak bariz bir bloklayıcı yok → runtime ölçümü şart.

## Bu sürümde eklenen ARAÇ: Diagnostic Trace (her istek)

`main.js chat:send` artık her isteğin her aşamasını ölçüp **Log Merkezi**'ne yazar:
- `chat_trace MODEL ... prep=Xms (ace=.. ctx=.. build=.. intent=..) ctxChars=N ttft=Yms model=Zms total=Wms`
- `chat_trace FAST_PATH ...` (modelsiz dönenler)
- 1 saniyeyi aşan HER aşama ayrıca `WARN chat_trace YAVAŞ aşama: <ad>=<ms>`.
- İlk token süresi (**TTFT**) ayrı ölçülür; başarısız isteklerde `FAILED prep=.. ttft=.. reason=..`.

Bu, "LLM'e prompt hiç gitmiyor mu yoksa geç mi gidiyor" sorusunu **kesin** ayırır:
- **prep büyük** → orkestrasyon kilidi (ACE/context/intent). Hangi alt-aşama yavaşsa WARN söyler.
- **prep küçük + ttft yok** → Ollama/model üretmeye başlamıyor (model yükleniyor/kapalı/yanlış model).

## Bulunan & düzeltilen gerçek risk

- **Otonom evrim döngüsü AÇILIŞTA çalışıyordu** (alpha.69'da ben ekledim; `lastEvolutionCycleAt=0` → ilk maintenance tick'inde koşuyordu). Ağır `evolutionEngine.analyze()` + `aepOS.runCycle()` açılışta event-loop ile yarışıp ilk sohbetleri geciktirebilirdi. **Düzeltildi:** `lastEvolutionCycleAt = Date.now()` ile ilk koşu 6 saate ertelendi (açılışta asla çalışmaz).

## Çıktı (istenen format)

1. **Root Cause:** Statik olarak tek bir kesin kök neden doğrulanamadı (runtime gerektirir). En güçlü iki aday: (a) açılıştaki otonom evrim döngüsü kaynak yarışması — **düzeltildi**; (b) model/Ollama'nın ilk token'a geç başlaması (TTFT). Diagnostic trace ikisini kesin ayıracak.
2. **Responsible Module:** trace ile belirlenecek; araç `main.js chat:send` + model TTFT'ye kondu.
3. **Exact Fix:** açılış evrim döngüsü ertelendi; her istek için stage-timer + TTFT logu.
4. **Regression Origin:** olası kaynak alpha.69 (startup evolution cycle) — bu sürümde nötralize edildi.
5. **Files Modified:** `src/main/main.js`.

## Kullanıcı için adımlar
1. **alpha.71'e güncelle.**
2. Soruyu tekrar sor ("requestAnimationFrame nedir?").
3. **Ayarlar → Log Merkezi**'ni aç, `chat_trace` satırının ekran görüntüsünü gönder.
4. O satır kesin söyler: `prep` mi büyük (orkestrasyon) yoksa `ttft` mi yok (model). Ona göre cerrahi düzeltme yapılır.
