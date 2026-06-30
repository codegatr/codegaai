# PROJECT NIRVANA — Architecture & Cognition Audit (v6.0.0-alpha.70)

> Kural: yeni özellik değil. Mimari tutarlılık, gerçek bağlam, gerçek hafıza. Bu rapor kod okumasıyla doğrulandı; "varmış gibi" duran hiçbir şey "tamam" yazılmadı.

## 1. Architecture Map (alt-sistem × durum)

| Katman | Modüller | Durum |
|--------|----------|-------|
| Renderer/IPC | renderer.js, preload.js | ✅ bağlı |
| Main orchestrator | main.js (chat:send) | ✅ |
| Intent/Router | phoenix-core/intent (fast-path, intent-engine), model-router-ai | ✅ fast-path; ⚠️ model-router-ai yalnız panele bağlı (gerçek seçim model-manager'da) — **bilinen ikilik** |
| ACE | ace/* (12 modül) | ✅ processIncoming/buildContext/recordTurn; ⚠️ self-reflector.reflect() çağrılmıyor |
| MissionOS | mission/* | ✅ reference-resolver "devam et"→activeMission; ⚠️ restart sonrası mission rehydrate — kısmi |
| Memory | working/conversation/project-brain/life-graph | ✅ buildContext'te; **conversationHistory restart'ta kayboluyordu → DÜZELTİLDİ (bkz §3)** |
| Model pipeline | chunking, adaptiveNumCtx, escalation, guards, continuation | ✅ (alpha.59–67) |
| Sanitizer/QA | final-answer-sanitizer, answer-adequacy, cognitive-kernel | ✅ |
| AEP/Evolution | aep/* (score, backlog, intel, genome, planner, patcher, self-qa, timeline) | ✅ + **otonom döngü artık çalışıyor (alpha.69)** |
| Builder | builder-engine (gerçek dosya yazar) | ✅ |
| ZIP/Git | zip-engine, git-engine | ✅ |
| Release | check.mjs, release.ps1, GitHub Actions | ✅ |

**Duplikasyon/ikilik:** `model-router-ai.js` (classifyPrompt) ile model-manager'daki gerçek seçim ayrı — router yalnız bilgi paneline bağlı. Tek karar çekirdeğine indirgenmeli (roadmap).

## 2. Pipeline Trace (istenen sıra × gerçek)

`chat:send` → ACE.processIncoming (ref resolution) → contextEngine.analyze → ACE.buildContext (project/life/eng brain) → phoenixRuntime intent → FastPath → modelManager.ask → sanitizePrompt → chunking(_askBatched) → cognitive intake/taskReport → **conversationHistory (artık restart-dayanıklı)** → model routing+escalation → ollamaChatStream(continuation+adaptiveNumCtx) → verification(SACV/SSV/MLVC/adequacy) → final-sanitizer+short-answer guard → recordTurn.

**Atlanan/eksik aşamalar (dürüst):**
- **Prompt Compression**: ayrı bir sıkıştırma aşaması YOK (chunking + history cap var). — roadmap.
- **Self Review (selfReflector.reflect)**: post-response çağrılmıyor. — roadmap.
- **Per-yanıt Context Confidence**: YOK; answer-adequacy kısmi proxy. — roadmap (en yüksek öncelik).

## 3. Context Intelligence — KÖK NEDEN BULUNDU & DÜZELTİLDİ

**Bulgu (trace, tahmin değil):** `model-manager.historyFor(chatId)` main'in **bellek-içi** `sessionHistories` Map'inden okur. Renderer sohbetleri localStorage'a kalıcı yazar ama main'e her mesajda yalnız `{context, chatId}` gönderiyordu — **geçmiş turları DEĞİL**. App yeniden başlayınca (veya eski sohbet açılınca) Map boş → modele 0 önceki tur gider → **"Konya"/"Ateş Fiat"/"devam et" bağlamı kaybeder.** (STEP 3 + STEP 5 aynı kök.)

**Düzeltme (kök neden, özellik değil):**
- Renderer artık her mesajla son ~10 turu `opts.history` ile gönderir (handleSubmit + regenerate).
- main `chat:send` bunu `ask`'e taşır.
- model-manager `_ask`: geçmiş BOŞSA `seedConversationHistory()` ile tohumlar (oturum-içi tekrarı önlemek için yalnız boşken). Sonra normal akış bu geçmişi modele verir.
- Kanıt: `context-continuity.test.js` (5 test).

**Sonuç:** Eski bir sohbeti açıp "devam et" dediğinde model artık önceki konuşmayı görür. Restart sonrası bağlam korunur.

## 4. Engineering Maturity Levels

| Seviye | Tanım | CODEGA bugün |
|--------|-------|--------------|
| 1 Assistant | soru-cevap | ✅ |
| 2 Developer | kod üretir | ✅ |
| 3 Senior Dev | doğrular, regresyon korur | ✅ (guards + 452 test) |
| 4 Architect | kendi mimarisini denetler | ✅ (bu rapor + DEEP_AUDIT) |
| 5 Principal | kendi geçmişini hatırlar | ✅ (timeline) **+ artık konuşma bağlamı** |
| 6 CTO | backlog/önceliklendirme/competitive intel | ✅ (AEP, otonom döngü) |
| 7 Artificial Engineer | her yanıttan önce "hangi proje/mission/karar?" | ⚠️ kısmi (ACE var, confidence yok) |
| 8 Artificial Cognition | mesaj değil bilgi düşünür | ⚠️ roadmap (semantic reconstruction) |
| 9 Artificial Evolution | güvenli kendini geliştirir | ⚠️ döngü var, insan-onaylı; PR otomasyonu kısmi |
| 10 Autonomous Software Company | — | ✗ vizyon |

**Bugünkü konum: ~Seviye 6, Seviye 7'ye geçiş.** Seviye 7'nin önündeki tek somut engel: **per-yanıt Context Confidence** (§5 roadmap).

## 5. Roadmap (sonraki kararlı sürüm için — sıralı)

1. **Context Confidence Engine** (Seviye 7 anahtarı): ACE sinyallerinden (activeMission? projectBrain eşleşmesi? reference çözüldü mü? history derinliği?) 0–1 skorlar; eşik altında uydurmak yerine netleştirme sorusu. Saf modül + test, additive.
2. **selfReflector.reflect()** wiring (recordTurn yanında fire-and-forget).
3. **model-router-ai birleştirme**: tek karar çekirdeği (router ↔ model-manager ikiliğini kaldır).
4. **Diagnostic Mode** (STEP 7): her istek için iç trace (model/ctx size/confidence/router/gen time/QA) — gözlemlenebilirlik.
5. **Mission rehydrate-on-restart**: aktif mission'ı diskten geri yükle.

## 6. Technical Debt
- model-router-ai ↔ model-manager seçim ikiliği.
- selfReflector öksüz.
- Prompt compression aşaması yok (büyük bağlamda gelecekte gerekebilir).
- Confidence skorları yok (uydurma riski guard'larla sınırlı ama "emin değilim" davranışı yok).

## 7. Regression
check.mjs (UTF-8/guard/sürüm) + jest (452 test, 31 suite) her release'te CI'da koşar; biri kırılırsa release çıkmaz. Bu sürümde +5 context-continuity testi.

---
**Bu sprint'in çıktısı:** mimari haritalandı, pipeline izlendi, **bağlam-kaybı kök nedeni bulunup düzeltildi** (en kritik "stateless gibi davranıyor" şikâyeti), olgunluk seviyeleri tanımlandı ve sıradaki tek-çekirdek yol haritası çıkarıldı. Yeni özellik eklenmedi.
