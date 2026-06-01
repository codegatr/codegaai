import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const mainDir = path.join(root, "src", "main");
process.env.CODEGA_ERROR_MEMORY_PATH = path.join(root, ".tmp-cognitive-error-memory.json");
const mod = await import(pathToFileURL(path.join(mainDir, "agent", "reasoning-guard.js")).href);
const guard = mod.default || mod;
const cognitiveMod = await import(pathToFileURL(path.join(mainDir, "agent", "cognitive-pipeline.js")).href);
const cognitive = cognitiveMod.default || cognitiveMod;
const mlvcMod = await import(pathToFileURL(path.join(mainDir, "agent", "mlvc.js")).href);
const mlvc = mlvcMod.default || mlvcMod;
const hrilMod = await import(pathToFileURL(path.join(mainDir, "agent", "hril.js")).href);
const hril = hrilMod.default || hrilMod;
const reeMod = await import(pathToFileURL(path.join(mainDir, "agent", "ree.js")).href);
const ree = reeMod.default || reeMod;
const raeMod = await import(pathToFileURL(path.join(mainDir, "agent", "rae.js")).href);
const rae = raeMod.default || raeMod;
const tdeMod = await import(pathToFileURL(path.join(mainDir, "agent", "tde.js")).href);
const tde = tdeMod.default || tdeMod;
const finalMod = await import(pathToFileURL(path.join(mainDir, "agent", "final-answer-sanitizer.js")).href);
const finalSanitizer = finalMod.default || finalMod;
const sacvMod = await import(pathToFileURL(path.join(mainDir, "agent", "sacv.js")).href);
const sacv = sacvMod.default || sacvMod;
const cognitiveKernelMod = await import(pathToFileURL(path.join(mainDir, "cognitive", "kernel", "cognitive-kernel.js")).href);
const cognitiveKernel = cognitiveKernelMod.default || cognitiveKernelMod;

assert.ok(
  guard.classifyReasoningProblem("2x + 4 = 52 ise x kac?").includes("math"),
  "equations are classified as math"
);
assert.ok(
  guard.classifyReasoningProblem("100 doors problem every nth door").includes("logic"),
  "100 doors is classified as logic"
);
assert.ok(guard.shouldVerifyAnswer("Bu hata neden oluyor, analiz et"), "analysis/debug answers are verified by AVE");
assert.equal(guard.APPROVAL_THRESHOLD, 95, "AVE approval threshold is 95");
assert.equal(mlvc.MLVC_THRESHOLD, 98, "MLVC approval threshold is 98");
assert.ok(guard.shouldEnforceConclusion("Hangisini seçmeliyim?"), "substantive answers require MCE");
assert.ok(guard.shouldUnderstandQuestion("3 hapı 30 dakika arayla içeceğim, ne kadar sürer?"), "substantive answers pass through QUE first");
assert.equal(guard.shouldEnforceConclusion("merhaba"), false, "smalltalk does not require MCE");
assert.equal(guard.shouldUnderstandQuestion("merhaba"), false, "smalltalk skips QUE");
assert.equal(guard.hasVisibleConclusion("Açıklama...\n\nFinal Answer: 42"), true, "visible final answer is detected");
assert.equal(guard.hasVisibleConclusion("Bu birkaç yolla ele alınabilir."), false, "non-conclusive answer is rejected by MCE detector");

const understandingMessages = guard.buildUnderstandingMessages("17 koyundan 9'u hariç hepsi öldü. Kaç koyun kaldı?", ["logic"]);
assert.match(understandingMessages[0].content, /Question Understanding Engine/, "QUE prompt is available");
const understanding = await guard.understandQuestion(
  "17 koyundan 9'u hariç hepsi öldü. Kaç koyun kaldı?",
  async () => JSON.stringify({
    ok: true,
    userWants: "Kalan koyun sayısı",
    givenData: ["17 koyun var", "9'u hariç hepsi öldü"],
    notAsked: ["Ölen koyun sayısı"],
    constraints: ["'hariç 9' ifadesi 9 koyunun hayatta kaldığı anlamına gelir"],
    expectedOutput: "number",
    potentialTraps: ["17 - 9 hesaplamak"],
    summary: "Kullanıcı hayatta kalan koyun sayısını istiyor.",
  })
);
assert.equal(understanding.expectedOutput, "number", "QUE extracts output type");
assert.match(
  guard.formatUnderstandingForPrompt(understanding),
  /USER WANTS: Kalan koyun sayısı/,
  "QUE summary is formatted for the answer prompt"
);

const semantic = cognitive.validateSemanticIntegrity(
  "17 koyundan 9'u hariç hepsi öldü. Kaç koyun kaldı?",
  { parsedQuestion: "17 koyundan 9 koyun öldü, kaç kaldı?", summary: "", errors: [] }
);
assert.equal(semantic.ok, false, "SIL rejects dropped exception wording");

const preflight = await cognitive.runCognitivePreflight(
  "3 hapı 30 dakika arayla içeceğim, ne kadar sürer?",
  async () => JSON.stringify({
    ok: true,
    intent: "logic",
    parsedQuestion: "3 hap var; ilk hap hemen alınır, kalan iki aralık 30'ar dakikadır.",
    userGoal: "Toplam süreyi bulmak",
    facts: ["3 hap", "30 dakika aralık"],
    constraints: ["İlk hap hemen alınabilir"],
    unknowns: [],
    expectedOutput: "number",
    ambiguities: [],
    potentialTraps: ["3 x 30 yapmak"],
    forbiddenAssumptions: [],
    semanticIntegrityScore: 98,
    constraintPreservationScore: 98,
    understandingConfidence: 98,
    summary: "Cevap 2 aralık üzerinden süre olmalı.",
    errors: [],
  })
);
assert.equal(preflight.ok, true, "cognitive preflight approves preserved understanding");
assert.match(preflight.context, /Cognitive Preflight Report/, "preflight formats middleware context");

const adversarial = await cognitive.runAdversarialReview(
  "All except 9 died. How many survived?",
  "8 survived.",
  preflight.report,
  async () => JSON.stringify({
    ok: false,
    reasoningConfidence: 99,
    verificationConfidence: 99,
    criticReport: ["The draft subtracts instead of preserving exception wording."],
    errors: ["Wrong final answer"],
    answer: "Final Answer: 9 survived.",
  })
);
assert.match(adversarial.answer, /9 survived/, "ARL/self-critic can replace vulnerable answers");

const percentageCheck = mlvc.deterministicCheck(
  "Başlangıç fiyatı 100 TL. Önce %40 zamlanıyor, sonra zamlı fiyat üzerinden %40 indiriliyor. Son fiyat kaç TL?",
  "Final Answer: 100 TL"
);
assert.equal(percentageCheck.ok, false, "MLVC rejects wrong percentage conclusion");
assert.match(percentageCheck.correctedAnswer, /84/, "MLVC independently recalculates percentage chains");
assert.match(
  mlvc.solveDeterministic("Başlangıç fiyatı 100 TL. Önce %40 zamlanıyor, sonra zamlı fiyat üzerinden %40 indiriliyor. Son fiyat kaç TL?"),
  /84/,
  "MLVC can answer deterministic percentage checks without model calls"
);

const mlvcSuite = mlvc.solveDeterministic(`## Test 1 - Denklem

Bir say\u0131n\u0131n 4 kat\u0131n\u0131n 18 fazlas\u0131 74't\u00fcr.
Bu say\u0131 ka\u00e7t\u0131r?

## Test 2 - Kesir Sadele\u015ftirme

45/135 sadele\u015ftirilmi\u015f hali nedir?

## Test 3 - Y\u00fczde

Bir \u00fcr\u00fcn 500 TL.
\u00d6nce %30 zamlan\u0131yor, sonra zaml\u0131 fiyat \u00fczerinden %20 indirim yap\u0131l\u0131yor.
Son fiyat ka\u00e7 TL olur?

## Test 4 - S\u00fcre

Bir i\u015f 7 May\u0131s 09:20'de ba\u015flad\u0131.
9 May\u0131s 14:55'te bitti.
Toplam ka\u00e7 saat ka\u00e7 dakika s\u00fcrd\u00fc?

## Test 5 - Olas\u0131l\u0131k

Bir torbada 3 k\u0131rm\u0131z\u0131, 7 mavi top var.
Geri koymadan 2 top \u00e7ekiliyor.
\u0130kisinin de mavi olma olas\u0131l\u0131\u011f\u0131 nedir?

## Test 6 - Mant\u0131k

Bir yar\u0131\u015fta d\u00f6rd\u00fcnc\u00fc s\u0131radaki ki\u015fiyi ge\u00e7iyorsun.
Ka\u00e7\u0131nc\u0131 s\u0131raya y\u00fckselirsin?

## Test 7 - Dikkat

Bir \u00e7ift\u00e7inin 50 tavu\u011fu vard\u0131.
17'si hari\u00e7 hepsi \u00f6ld\u00fc.
Ka\u00e7 tavu\u011fu kald\u0131?

## Test 8 - Final Kontrol

Bir say\u0131 d\u00fc\u015f\u00fcn.
9 ile \u00e7arp.
36 ekle.
9'a b\u00f6l.
Ba\u015flang\u0131\u00e7 say\u0131s\u0131n\u0131 \u00e7\u0131kar.
Sonu\u00e7 ka\u00e7t\u0131r?`);
assert.match(mlvcSuite, /Test 1: 14/, "MLVC answers equation test in a suite");
assert.match(mlvcSuite, /Test 2: 1\/3/, "MLVC answers fraction test in a suite");
assert.match(mlvcSuite, /Test 3: 520 TL/, "MLVC answers percentage test in a suite");
assert.match(mlvcSuite, /Test 4: 53 saat 35 dakika/, "MLVC answers duration test in a suite");
assert.match(mlvcSuite, /Test 5: 7\/15/, "MLVC answers probability test in a suite");
assert.match(mlvcSuite, /Test 6: 4/, "MLVC answers passing-place test in a suite");
assert.match(mlvcSuite, /Test 7: 17/, "MLVC answers exception wording test in a suite");
assert.match(mlvcSuite, /Test 8: 4/, "MLVC answers symbolic cancellation test in a suite");

const handshakeCheck = mlvc.deterministicCheck(
  "Bir odada 4 kişi var. Her kişi diğer herkesle tam bir kez tokalaşıyor. Toplam kaç tokalaşma olur?",
  "Final Answer: 12"
);
assert.equal(handshakeCheck.ok, false, "MLVC rejects double-counted handshakes");
assert.match(handshakeCheck.correctedAnswer, /6/, "MLVC uses C(n,2) for handshake problems");

const mlvcLowConfidence = mlvc.parseMLVCResult(
  JSON.stringify({
    ok: true,
    mathConfidence: 98,
    logicConfidence: 97,
    verificationConfidence: 99,
    answer: "x = 15",
  }),
  "x = 13"
);
assert.equal(mlvcLowConfidence.ok, false, "MLVC rejects any confidence under 98");

const mlvcFixed = await mlvc.verifyMathLogic(
  "3x + 12 = 57 ise x kaçtır?",
  "x = 13",
  async () => JSON.stringify({
    ok: true,
    mathConfidence: 99,
    logicConfidence: 99,
    verificationConfidence: 99,
    errors: [],
    correctedReasoning: "3x = 45, x = 15.",
    answer: "Final Answer: x = 15.",
  }),
  { passes: 1 }
);
assert.match(mlvcFixed.answer, /15/, "MLVC can correct algebra before AVE");

const lowConfidence = guard.parseVerificationResult(
  JSON.stringify({
    ok: true,
    reasoningScore: 95,
    mathScore: 94,
    logicScore: 96,
    consistencyScore: 96,
    completenessScore: 97,
    answer: "x = 24",
  }),
  "draft"
);
assert.equal(lowConfidence.ok, false, "any confidence under 95 fails verification");

let calls = 0;
const fixedEquation = await guard.verifyReasoningAnswer(
  "2x + 4 = 52 ise x kac?",
  "2x = 48, x = 24. Final: 1 yil sonra.",
  async () => {
    calls += 1;
    return JSON.stringify({
      ok: calls > 1,
      reasoningScore: calls > 1 ? 98 : 92,
      mathScore: calls > 1 ? 99 : 89,
      logicScore: calls > 1 ? 98 : 90,
      consistencyScore: calls > 1 ? 97 : 80,
      completenessScore: calls > 1 ? 96 : 90,
      errors: calls > 1 ? [] : ["final answer contradicts derived value"],
      correctedReasoning: "2x + 4 = 52, so x = 24.",
      answer: "x = 24.",
    });
  },
  { passes: 2 }
);
assert.equal(fixedEquation.answer, "x = 24.", "contradictory final answer is corrected");
assert.equal(calls, 2, "low confidence triggers another verification pass");

const doors = await guard.verifyReasoningAnswer(
  "100 doors problem: every nth pass toggles every nth door. Which remain open?",
  "First 50 doors remain open.",
  async () => JSON.stringify({
    ok: false,
    reasoningScore: 99,
    mathScore: 99,
    logicScore: 99,
    consistencyScore: 99,
    completenessScore: 99,
    errors: ["draft confuses every nth door with first n doors"],
    correctedReasoning: "A door is toggled once per divisor; only squares have odd divisor counts.",
    answer: "Open doors are the perfect squares: 1, 4, 9, 16, 25, 36, 49, 64, 81, 100.",
  }),
  { passes: 1 }
);
assert.match(
  doors.answer,
  /1, 4, 9, 16, 25, 36, 49, 64, 81, 100/,
  "100 doors answer is corrected to perfect squares"
);

const concluded = await guard.enforceConclusion(
  "Hangisini seçmeliyim?",
  "A seçeneği daha düşük riskli çünkü kurulumu daha basit.",
  async () => JSON.stringify({
    ok: true,
    answer: "A seçeneği daha düşük riskli çünkü kurulumu daha basit.\n\nFinal Answer: A seçeneğini seç.",
    errors: [],
  })
);
assert.equal(concluded.enforced, true, "MCE rewrites answers without a final conclusion");
assert.match(concluded.answer, /Final Answer:/, "MCE output includes final answer section");

const hrilProbability = hril.interpret(
  "Bir torbada 3 kirmizi, 7 mavi top var. Geri koymadan 2 top cekiliyor. Ikisinin de mavi olma olasiligi nedir?",
  "Final Answer: 7/15"
);
assert.equal(hrilProbability.changed, true, "HRIL adds probability interpretation");
assert.match(hrilProbability.answer, /%46,67/, "HRIL converts fractions to percentages");
assert.match(hrilProbability.answer, /7\/15/, "HRIL preserves the original fraction");

const hrilFinance = hril.interpret(
  "Bir urun 100 TL. Once %40 zamlaniyor, sonra %40 indirim yapiliyor. Son fiyat?",
  "Final Answer: 84 TL"
);
assert.match(hrilFinance.answer, /16/, "HRIL explains money difference");
assert.match(hrilFinance.answer, /%16/, "HRIL explains percentage change");

assert.match(
  hril.interpret("Kac yil sonra?", "Final Answer: 9.333333 yıl").answer,
  /9 yıl 4 ay/,
  "HRIL converts decimal years to years and months"
);
assert.match(
  hril.interpret("Toplam kac saat surdu?", "Final Answer: 0.5 saat").answer,
  /30 dakika/,
  "HRIL converts decimal hours to minutes"
);

const reeTrap = ree.explain(
  "Bir ciftcinin 50 tavugu vardi. 17'si haric hepsi oldu. Kac tavugu kaldi?",
  "Final Answer: 17"
);
assert.equal(reeTrap.changed, true, "REE explains logic traps");
assert.match(reeTrap.answer, /Anlama:/, "REE includes understanding section");
assert.match(reeTrap.answer, /Tuzak:/, "REE explains the trap");
assert.match(reeTrap.answer, /Doğrulama:/, "REE includes verification section");
assert.match(reeTrap.answer, /Final Answer: 17/, "REE preserves final answer");

const reeProbability = ree.explain(
  "Bir torbada 3 kirmizi, 7 mavi top var. Geri koymadan 2 top cekiliyor. Ikisinin de mavi olma olasiligi nedir?",
  hrilProbability.answer
);
assert.match(reeProbability.answer, /İşlem:/, "REE includes process section");
assert.match(reeProbability.answer, /%46,67/, "REE keeps HRIL interpretation");

assert.equal(
  ree.explain("merhaba", "Merhaba. Nasil yardimci olayim?").changed,
  false,
  "REE skips non-reasoning smalltalk"
);
assert.doesNotMatch(
  ree.explain(
    "Bir urun 3000 TL. Once %10 indirim, sonra %20 zam, sonra %25 indirim oluyor. Final fiyat nedir? Ayrica 2 kisi kaldi ifadesi de var.",
    "Final Answer: 2430 TL | 2"
  ).answer,
  /hariç kalanlar|haric kalanlar/i,
  "REE does not inject exception-trap explanations into finance answers"
);

const assembled = rae.assembleResponse(
  "Bir urun 3000 TL. Once %10 indirim, sonra %20 zam, sonra %25 indirim oluyor.",
  [
    "Anlama:",
    "Soru fiyatın ardışık değişimlerden sonra ne olduğunu soruyor.",
    "",
    "İşlem:",
    "MLVC percentage: 2430 TL. 3000 x 0.90 x 1.20 x 0.75 = 2430",
    "",
    "Doğrulama:",
    "Kontrol: çarpanlar sırayla kullanıldı.",
    "",
    "Yorum:",
    "Başlangıç 3000 TL, son fiyat 2430 TL. Fark 570 TL daha düşük; toplam değişim %19.",
    "",
    "Final Answer: 2430 TL",
    "",
    "İnsan Yorumu:",
    "- Başlangıç 3000 TL, son fiyat 2430 TL. Fark 570 TL daha düşük; toplam değişim %19.",
    "",
    "Final Answer: 2430 TL",
  ].join("\n")
);
assert.equal((assembled.answer.match(/Final Answer:/g) || []).length, 1, "RAE keeps exactly one Final Answer section");
assert.doesNotMatch(assembled.answer, /İnsan Yorumu:/, "RAE folds duplicate human interpretation into Yorum");
assert.doesNotMatch(assembled.answer, /MLVC percentage:/, "RAE removes raw engine labels");

const taskReport = tde.decomposeTasks(`## Test 1 - Denklem
3x + 12 = 57 ise x kactir?

## Test 2 - Olasilik
Bir torbada 3 kirmizi, 7 mavi top var. Geri koymadan 2 top cekiliyor. Ikisi mavi olma olasiligi?`);
assert.equal(taskReport.applicable, true, "TDE detects numbered multi-task prompts");
assert.equal(taskReport.count, 2, "TDE counts detected tasks");
assert.match(tde.formatTaskContext(taskReport), /Detected Tasks: 2/, "TDE formats middleware context");
const partialCoverage = tde.validateTaskCoverage("Test 1: x = 15", taskReport);
assert.equal(partialCoverage.ok, false, "TDE rejects incomplete task coverage");
assert.equal(partialCoverage.missing[0].label, "Test 2", "TDE reports the missing task");
assert.equal(tde.validateTaskCoverage("Test 1: x = 15\nTest 2: 7/15", taskReport).ok, true, "TDE approves completed tasks");

const leakedFinal = finalSanitizer.validateFinalAnswer(
  "Final Answer: Bir ciftcinin 50 tavugu vardi. 17'si haric hepsi oldu. Kac tavugu kaldi?",
  "Bir ciftcinin 50 tavugu vardi. 17'si haric hepsi oldu. Kac tavugu kaldi?",
  null
);
assert.equal(leakedFinal.ok, false, "Final Answer rejects leaked question text");
assert.match(leakedFinal.errors.join(" "), /Question text leaked/, "Final Answer leak is explained");

const exactFinal = finalSanitizer.validateFinalAnswer(
  "Test 1: islem...\nTest 2: islem...\n\nFinal Answer: Test 1: x = 15 | Test 2: 7/15",
  "same question",
  taskReport
);
assert.equal(exactFinal.ok, true, "Final Answer accepts answer results without semantic task counting");

const duplicateFinal = finalSanitizer.validateFinalAnswer(
  "Final Answer: Test 1: x = 15 | Test 1: 15 | Test 2: 7/15",
  "same question",
  taskReport
);
assert.equal(duplicateFinal.ok, true, "Final Answer sanitizer does not enforce exact task labels");

const semanticNoLabels = sacv.validateSemanticCompleteness(
  [
    "Anlama: iki ayrı hesap var.",
    "İşlem: 3x + 12 = 57; x = 15. İkinci hesapta 7/15 bulunur.",
    "Doğrulama: 3*15 + 12 = 57 ve olasılık bağımsız yeniden kontrol edildi.",
    "Final Answer: x = 15 | 7/15",
  ].join("\n"),
  taskReport
);
assert.equal(semanticNoLabels.ok, true, "SACV accepts semantically complete answers without task labels");

const semanticMissingVerification = sacv.validateSemanticCompleteness(
  "Final Answer: x = 15 | 7/15",
  taskReport
);
assert.equal(semanticMissingVerification.ok, false, "SACV rejects answers without reasoning/verification traces");

const kernelContext = cognitiveKernel.createContext(`## Test 1
3x + 12 = 57 ise x kactir?

## Test 2
45/135 sadelestirilmis hali nedir?`);
const kernelIntake = cognitiveKernel.runIntake(kernelContext);
assert.equal(kernelIntake.taskReport.count, 2, "Cognitive Kernel stores detected tasks in task state");
assert.equal(kernelIntake.messages.length, 1, "Cognitive Kernel emits task middleware context");
assert.equal(kernelContext.stages[0].name, "tde:intake", "Cognitive Kernel records intake stage");

const leakedKernelContext = cognitiveKernel.createContext(
  "Bir ciftcinin 50 tavugu vardi. 17'si haric hepsi oldu. Kac tavugu kaldi?"
);
cognitiveKernel.runIntake(leakedKernelContext);
const blockedKernel = await cognitiveKernel.runPostValidation(
  leakedKernelContext,
  "Final Answer: Bir ciftcinin 50 tavugu vardi. 17'si haric hepsi oldu. Kac tavugu kaldi?",
  { stoppedReason: "final_answer", needsVerification: false, deepReasoning: false }
);
assert.equal(blockedKernel.ok, false, "Cognitive Kernel blocks answers that fail final validation");
assert.match(blockedKernel.answer, /Final Answer: Yanıt güvenli şekilde doğrulanamadı/, "blocked answers do not leak unsafe drafts");
assert.equal(leakedKernelContext.blockReason, "final-answer-sanitizer", "Cognitive Kernel records blocking gate");

fs.rmSync(process.env.CODEGA_ERROR_MEMORY_PATH, { force: true });
console.log("Reasoning guard tests passed");
