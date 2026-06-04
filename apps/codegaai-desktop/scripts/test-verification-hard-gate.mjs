import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const mainDir = path.join(root, "src", "main");

const cognitiveKernelMod = await import(pathToFileURL(path.join(mainDir, "cognitive", "kernel", "cognitive-kernel.js")).href);
const cognitiveKernel = cognitiveKernelMod.default || cognitiveKernelMod;
const mlvcMod = await import(pathToFileURL(path.join(mainDir, "agent", "mlvc.js")).href);
const mlvc = mlvcMod.default || mlvcMod;
const tcnisMod = await import(pathToFileURL(path.join(mainDir, "agent", "tcnis.js")).href);
const tcnis = tcnisMod.default || tcnisMod;
const ssvMod = await import(pathToFileURL(path.join(mainDir, "agent", "ssv.js")).href);
const ssv = ssvMod.default || ssvMod;
const rpreMod = await import(pathToFileURL(path.join(mainDir, "agent", "rpre.js")).href);
const rpre = rpreMod.default || rpreMod;
const ebseMod = await import(pathToFileURL(path.join(mainDir, "agent", "ebse.js")).href);
const ebse = ebseMod.default || ebseMod;
const factLockMod = await import(pathToFileURL(path.join(mainDir, "agent", "fact-lock.js")).href);
const factLock = factLockMod.default || factLockMod;
const modelManagerMod = await import(pathToFileURL(path.join(mainDir, "model-manager.js")).href);
const modelManager = modelManagerMod.default || modelManagerMod;

const suites = [];

function suite(name, fn) {
  suites.push({ name, fn });
}

async function hardGate(question, draft) {
  const ctx = cognitiveKernel.createContext(question);
  cognitiveKernel.runIntake(ctx);
  return cognitiveKernel.runPostValidation(ctx, draft, {
    stoppedReason: "final_answer",
    needsVerification: true,
    needsMLVC: true,
    deepReasoning: false,
  });
}

suite("semantic_integrity", async () => {
  const report = factLock.extractFacts("27 survived.");
  const bad = factLock.validateFactPreservation("Final Answer: 63 survived.", report);
  assert.equal(bad.ok, true, "semantic-only fact lock should not overclaim when no structural constraint exists");
  const blocked = await hardGate("Bir çiftçinin 30 koyunu vardı. 12'si hariç hepsi öldü. Kaç koyunu kaldı?", "Final Answer: 18");
  assert.equal(blocked.ok, true, "deterministic trap can be corrected before release");
  assert.match(blocked.answer, /12/, "exception wording is restored to survivor count");
});

suite("ratio_reasoning", async () => {
  const bad = rpre.verify("Baba + Oğul = 84. Baba = 6 x Oğul.", "Final Answer: 14");
  assert.equal(bad.status, "REJECTED");
  assert.match(bad.correctedAnswer, /72.*12|12.*72/s);
});

suite("equation_solver", async () => {
  const blocked = await hardGate("7x + 13 = 90 ise x kaçtır?", "Final Answer: x = 5");
  assert.equal(blocked.ok, true, "equation failure should be corrected deterministically");
  assert.match(blocked.answer, /11/, "7x + 13 = 90 gives x = 11");
  assert.equal(ebse.verify("7x + 13 = 90 ise x kaçtır?", "Final Answer: x = 5").status, "REJECTED");
});

suite("probability", async () => {
  const check = mlvc.deterministicCheck(
    "5 red, 3 blue. Draw 2 balls without replacement. Probability both are red?",
    "Final Answer: 1/2"
  );
  assert.equal(check.ok, false);
  assert.match(check.correctedAnswer, /5\/14/);
});

suite("percentage", async () => {
  const check = mlvc.deterministicCheck(
    "Bir ürün 100 TL. Önce %40 zamlanıyor, sonra zamlı fiyat üzerinden %40 indiriliyor. Son fiyat kaç TL?",
    "Final Answer: 100 TL"
  );
  assert.equal(check.ok, false);
  assert.match(check.correctedAnswer, /84/);
});

suite("time_calculation", async () => {
  const answer = mlvc.solveDeterministic("Bir iş 7 Mayıs 09:20'de başladı. 9 Mayıs 14:55'te bitti. Toplam kaç saat kaç dakika sürdü?");
  assert.match(answer, /53 saat 35 dakika/);
});

suite("attention_traps", async () => {
  const check = mlvc.deterministicCheck(
    "Bir yarışta üçüncü sıradaki kişiyi geçiyorsun. Kaçıncı sıraya yükselirsin?",
    "Final Answer: ikinci"
  );
  assert.equal(check.ok, false);
  assert.match(check.correctedAnswer, /3/);
});

suite("task_completion", async () => {
  const result = tcnis.validateTCNIS(
    "Baba 98, oğul 14 yaşında. Kaç yıl sonra baba oğlunun 4 katı olur?",
    "Baba = 98, Oğul = 14.\n\nFinal Answer: Baba 98, oğul 14 yaşındadır."
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /years-later/);
  const sanity = ssv.validateSupremeSanity(
    "Baba 98, oğul 14 yaşında. Kaç yıl sonra baba oğlunun 4 katı olur?",
    "Baba = 98, Oğul = 14.\n\nFinal Answer: Baba 98, oğul 14 yaşındadır."
  );
  assert.equal(sanity.ok, false);
});

suite("number_integrity", async () => {
  const result = tcnis.validateTCNIS(
    "Başlangıç bütçesi 90,000 TL. %10 indirim sonrası kaç TL olur?",
    "İşlem: 000 x 0.90 = 0 TL\n\nFinal Answer: 0 TL"
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /numeric integrity/);
});

suite("multi_task_task_local_verification", async () => {
  const fakeApprove = async (_msgs) => JSON.stringify({
    ok: true,
    reasoningScore: 99,
    mathScore: 99,
    logicScore: 99,
    consistencyScore: 99,
    completenessScore: 99,
    errors: [],
    answer: "",
  });
  const probabilityTask = {
    id: "3",
    label: "Soru 3",
    body: "5 red, 3 blue. Draw 2 balls without replacement. Probability both are red?",
  };
  const verified = await modelManager._verifyTaskLocalAnswer(probabilityTask, "Final Answer: 1/2", fakeApprove);
  assert.equal(verified.ok, true);
  assert.match(verified.answer, /5\/14/, "multi-task local verification applies MLVC per task");

  const incompleteTask = {
    id: "4",
    label: "Soru 4",
    body: "Baba 98, oğul 14 yaşında. Kaç yıl sonra baba oğlunun 4 katı olur?",
  };
  const blocked = await modelManager._verifyTaskLocalAnswer(
    incompleteTask,
    "Baba = 98, Oğul = 14.\n\nFinal Answer: Baba 98, oğul 14 yaşındadır.",
    fakeApprove
  );
  assert.equal(blocked.ok, false, "multi-task local verification applies TCNIS hard gate per task");
  const fakeRegenerate = async (msgs) => {
    const content = msgs.map((m) => String(m.content || "")).join("\n");
    if (content.includes("task-local regeneration worker")) {
      return "Final Answer: 4";
    }
    return JSON.stringify({
      ok: false,
      reasoningScore: 20,
      mathScore: 20,
      logicScore: 20,
      consistencyScore: 20,
      completenessScore: 20,
      errors: ["forced task-local AVE failure"],
      answer: "",
    });
  };
  const regenerated = await modelManager._verifyTaskLocalAnswer(
    { id: "5", label: "Soru 5", body: "2 + 2 kactir?" },
    "Final Answer: 5",
    fakeRegenerate
  );
  assert.equal(regenerated.ok, true, "failed task is regenerated locally instead of dropping the batch");
  assert.equal(regenerated.regenerated, true);
  assert.match(regenerated.answer, /Final Answer:\s*4/);
  assert.match(blocked.answer, /Yanıt güvenli şekilde doğrulanamadı/);

  const exceptAnswer = modelManager._deterministicTaskAnswer("80 koyunlardan 20'si dışında hepsi öldükten sonra 60 koyunu kaldı. Cevap: 60.");
  assert.match(exceptAnswer, /Final Answer:\s*20/, "task-local deterministic path corrects except/died traps before model generation");

  const ageFutureAnswer = modelManager._deterministicTaskAnswer("Baba ile oğlunun toplam yaşları 98'dir. Baba oğlunun yaşının 6 katıdır. Kaç yıl sonra baba oğlunun yaşının 4 katı olur?");
  assert.match(ageFutureAnswer, /Final Answer:\s*9\.3333333333 yil/, "task-local deterministic path answers the requested years-later value");

  const runaway = modelManager._collapseRunawayTaskAnswer(Array(20).fill("Şimdi, zamanın ne kadar olduğunu hesaplayalım:").join("\n"));
  assert.match(runaway, /Task-local guard/, "runaway repeated task drafts are collapsed before verification");
});

suite("trusted_deterministic_multitask_no_model_stall", async () => {
  const tasks = [
    {
      id: "1",
      label: "Test 1",
      body: "Bir yar\u0131\u015fta birinci s\u0131radaki ki\u015fiyi ge\u00e7iyorsun.\nNormal yar\u0131\u015f ko\u015fullar\u0131nda ka\u00e7\u0131nc\u0131 s\u0131raya y\u00fckselirsin?\nA\u00e7\u0131klayarak cevap ver.",
      pattern: /ge\u00e7emezsin|ge\u00e7ersiz|m\u00fcmk\u00fcn de\u011fil|imkans/i,
    },
    {
      id: "2",
      label: "Test 2",
      body: "Bir odada 3 kedi vard\u0131r.\nHer kedinin \u00f6n\u00fcnde 2 kedi vard\u0131r.\nHer kedinin arkas\u0131nda 2 kedi vard\u0131r.\nBu nas\u0131l m\u00fcmk\u00fcnd\u00fcr?",
      pattern: /\u00e7ember|dairesel|3 kedi/i,
    },
    {
      id: "3",
      label: "Test 3",
      body: "Bir \u00e7ift\u00e7inin 120 koyunu vard\u0131.\n35'i hari\u00e7 hepsi \u00f6ld\u00fc.\nKa\u00e7 koyunu kald\u0131?",
      pattern: /35/,
    },
    {
      id: "4",
      label: "Test 4",
      body: "Bir doktorun 4 k\u0131z karde\u015fi vard\u0131r.\nBu k\u0131z karde\u015flerin her birinin 1 erkek karde\u015fi vard\u0131r.\nToplam ka\u00e7 erkek karde\u015f vard\u0131r?",
      pattern: /1 erkek karde/i,
    },
  ];

  let modelCalls = 0;
  const failIfCalled = async () => {
    modelCalls += 1;
    throw new Error("trusted deterministic task should not call model verification");
  };

  for (const task of tasks) {
    const draft = modelManager._deterministicTaskAnswer(task.body);
    assert.ok(draft, `${task.label} has a deterministic answer`);
    const result = await modelManager._finalizeTaskLocalAnswer(task, draft, failIfCalled, { trustedDeterministic: true });
    assert.equal(result.ok, true);
    assert.equal(result.trustedDeterministic, true);
    assert.match(result.answer, task.pattern, `${task.label} preserves the deterministic answer`);
  }
  assert.equal(modelCalls, 0, "trusted deterministic multi-task suite does not enter model verification");
});

suite("trusted_deterministic_multitask_ask_fast_path", async () => {
  const prompt = [
    "Test 1",
    "Bir yar\u0131\u015fta birinci s\u0131radaki ki\u015fiyi ge\u00e7iyorsun.",
    "Normal yar\u0131\u015f ko\u015fullar\u0131nda ka\u00e7\u0131nc\u0131 s\u0131raya y\u00fckselirsin?",
    "A\u00e7\u0131klayarak cevap ver.",
    "",
    "Test 2",
    "Bir odada 3 kedi vard\u0131r.",
    "Her kedinin \u00f6n\u00fcnde 2 kedi vard\u0131r.",
    "Her kedinin arkas\u0131nda 2 kedi vard\u0131r.",
    "Bu nas\u0131l m\u00fcmk\u00fcnd\u00fcr?",
    "",
    "Test 3",
    "Bir \u00e7ift\u00e7inin 120 koyunu vard\u0131.",
    "35'i hari\u00e7 hepsi \u00f6ld\u00fc.",
    "Ka\u00e7 koyunu kald\u0131?",
    "",
    "Test 4",
    "Bir doktorun 4 k\u0131z karde\u015fi vard\u0131r.",
    "Bu k\u0131z karde\u015flerin her birinin 1 erkek karde\u015fi vard\u0131r.",
    "Toplam ka\u00e7 erkek karde\u015f vard\u0131r?",
    "",
    "Zorunlu \u00e7\u0131kt\u0131:",
    "Test 1:",
    "Test 2:",
    "Test 3:",
    "Test 4:",
    "Final Answer:",
  ].join("\n");
  const manager = new modelManager.ModelManager();
  manager.generate = async () => {
    throw new Error("trusted deterministic ask fast path should not call the model");
  };

  const started = Date.now();
  const result = await manager.ask(prompt, { onToken: () => {} });
  assert.equal(result.provider, "instant");
  assert.equal(result.model, "codega-deterministic-multitask");
  assert.ok(Date.now() - started < 1000, "trusted deterministic multi-task prompt returns without model readiness checks");
  assert.match(result.text, /Test 1[\s\S]*ge\u00e7emezsin|ge\u00e7ersiz|m\u00fcmk\u00fcn de\u011fil|imkans/i);
  assert.match(result.text, /Test 2[\s\S]*(\u00e7ember|dairesel|3 kedi)/i);
  assert.match(result.text, /Test 3[\s\S]*35/);
  assert.match(result.text, /Test 4[\s\S]*1 erkek karde/i);
});

suite("watchdog_regeneration_loop_guard", async () => {
  assert.equal(modelManager._MAX_REGENERATION_ATTEMPTS, 3);
  const tokens = [];
  const progress = modelManager._makeVerificationProgress((token) => tokens.push(token), "test");
  progress.emit("verifying", { attempt: 1, reason: "unit-test" });
  progress.stop();
  assert.ok(tokens.length >= 2, "progress heartbeat emits activity tokens");
  assert.ok(tokens.includes(modelManager._HEARTBEAT_TOKEN), "progress still emits invisible watchdog heartbeat tokens");
  assert.ok(tokens.some((token) => /Çalışma özeti:/.test(token)), "progress also emits visible status text");

  const started = Date.now();
  const simple = [
    modelManager._deterministicTaskAnswer("120 sheep. All except 35 died. How many remain?"),
    modelManager._deterministicTaskAnswer("9x + 18 = 99. x kactir?"),
    modelManager._deterministicTaskAnswer("1000 TL product first increases by %20, then decreases by %20. Final price?"),
  ];
  assert.match(simple[0], /Final Answer:\s*35/);
  assert.match(simple[1], /Final Answer:\s*9\b/);
  assert.match(simple[2], /Final Answer:\s*960 TL/);
  assert.ok(Date.now() - started < 10000, "simple benchmark completes under 10 seconds");
});

let passed = 0;
const failures = [];
for (const item of suites) {
  try {
    await item.fn();
    passed += 1;
    console.log(`✓ ${item.name}`);
  } catch (error) {
    failures.push({ name: item.name, error });
    console.error(`✗ ${item.name}: ${error && error.message ? error.message : error}`);
  }
}

const score = Math.round((passed / suites.length) * 100);
console.log(`Verification hard gate score: ${score}% (${passed}/${suites.length})`);
if (score < 95 || failures.length) {
  throw new Error(`Verification hard gate failed: ${score}%`);
}
