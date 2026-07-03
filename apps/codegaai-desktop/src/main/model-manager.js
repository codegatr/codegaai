const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_MODEL,
  FALLBACK_MODELS,
  MODEL_OPTIONS,
  OLLAMA_CHAT_TIMEOUT_MS,
  OLLAMA_COMMAND_TIMEOUT_MS,
  OLLAMA_DOWNLOAD_URL,
  OLLAMA_PULL_TIMEOUT_MS,
} = require("../shared/constants");
const { ollamaChat, ollamaChatStream, ollamaReachable, ollamaListModels } = require("./agent/ollama-client");
const { configFromSettings, cloudChat, cloudChatStream, profile: cloudProfile } = require("./agent/cloud-provider");
const { configuredProviderChain } = require("./agent/runtime-policy");
const { runReact } = require("./agent/agent-loop");
const { TOOLS: AGENT_TOOLS } = require("./agent/tools");
const logs = require("./agent/logs");
const { buildSystemPrompt } = require("./agent/system-prompt");
const { REASONING_GUARDRAILS } = require("./agent/reasoning-guardrails");
const { collapseRepetition } = require("./agent/anti-loop");
const { looksDegenerate } = require("./agent/answer-quality");
const { sanitizePrompt } = require("./agent/sanitize-prompt");
const answerAdequacy = require("./agent/answer-adequacy");
const { getSettings } = require("./agent/settings-store");
const { recall, remember, extractDurableFacts } = require("./agent/memory");
const learningStore = require("./agent/learning-store");
const rag = require("./agent/rag");
const { reflect } = require("./agent/reflect");
const {
  runAdversarialReview,
  runCognitivePreflight,
  shouldRunCognitivePipeline,
} = require("./agent/cognitive-pipeline");
const {
  classifyReasoningProblem,
  enforceConclusion,
  shouldEnforceConclusion,
  shouldVerifyAnswer,
  verifyAnswer,
  finalAnswerConsistencyGuard,
} = require("./agent/reasoning-guard");
const { deterministicCheck, shouldRunMLVC, solveDeterministic: solveDeterministicMathLogic, verifyMathLogic } = require("./agent/mlvc");
const ebse = require("./agent/ebse");
const rpre = require("./agent/rpre");
const hril = require("./agent/hril");
const ree = require("./agent/ree");
const tde = require("./agent/tde");
const finalAnswerSanitizer = require("./agent/final-answer-sanitizer");
const { chunkQuestions } = require("./agent/prompt-splitter");
const cognitiveKernel = require("./cognitive/kernel/cognitive-kernel");
const factLock = require("./agent/fact-lock");
const cvl = require("./agent/cvl");
const ssv = require("./agent/ssv");
const sacv = require("./agent/sacv");
const tcnis = require("./agent/tcnis");
const { repairBenchmarkAnswer, solveKnownReasoningBenchmarks } = require("./agent/benchmark-reasoner");
const { makePlan, looksLikeGoal } = require("./agent/planner");
const { runOrchestrated } = require("./agent/orchestrator");
const { SPECIALISTS, routeStep, buildSpecialistPrompt } = require("./agent/agents");
const improveDrafts = require("./agent/improve-drafts");
const experts = require("./agent/experts");

function extractWeatherCity(input) {
  const match = String(input || "").trim().match(
    /(?:bug[uü]n\s+)?([\p{L}.-]+)(?:['’](?:da|de|ta|te))?\s+(?:hava\s+durumu|hava\s+nas[ıi]l|ka[çc]\s+derece)/iu
  );
  return match ? match[1].trim() : "";
}

function taskLocalFinalAnswer(answer) {
  const text = String(answer || "").trim();
  const final = finalAnswerSanitizer.finalAnswerText(text);
  if (final) return text;
  const m = text.match(/(?:^|\n)\s*Cevap\s*:\s*([\s\S]+)$/i);
  if (m && m[1].trim()) return `${text}\n\nFinal Answer: ${m[1].trim()}`;
  const last = text.split(/\r?\n/).filter(Boolean).slice(-1)[0] || text;
  return `${text}\n\nFinal Answer: ${last}`.trim();
}

function extractGeneratedTaskAnswer(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && typeof parsed.answer === "string") {
      return parsed.answer.trim();
    }
  } catch (_e) {
    // Plain-text model answers are accepted below.
  }
  return text;
}

async function regenerateTaskLocalAnswer(task, answer, errors, generateFn) {
  if (typeof generateFn !== "function") return "";
  const raw = await generateFn([
    {
      role: "system",
      content: [
        "You are CODEGA AI's task-local regeneration worker.",
        "Regenerate ONLY the failed task. Do not solve or mention other tasks.",
        "Preserve every original fact, number, constraint, and requested output.",
        "Run RPRE, EBSE, MLVC, AVE, TCNIS, and the hard gate internally before answering.",
        "Return a concise answer for this task only. End with exactly one 'Final Answer:' line.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Task label: ${task.label || task.id || "task"}`,
        `Task body:\n${task.body}`,
        `Rejected draft:\n${answer}`,
        `Verification errors:\n${(errors || []).join("; ") || "unknown"}`,
        "Regenerate the corrected answer for this task only.",
      ].join("\n\n"),
    },
  ]);
  return extractGeneratedTaskAnswer(raw);
}

async function verifyTaskLocalAnswer(task, draft, generateFn = null, opts = {}) {
  const allowRegeneration = opts.allowRegeneration !== false;
  const progress = opts.progress || null;
  const regenState = opts.regenerationState || { attempts: 0, max: MAX_REGENERATION_ATTEMPTS };
  const canRegenerate = () => allowRegeneration && typeof generateFn === "function" && regenState.attempts < (regenState.max || MAX_REGENERATION_ATTEMPTS);
  const runRegeneration = async (errors, reason) => {
    if (!canRegenerate()) return "";
    regenState.attempts += 1;
    const errText = (errors || []).join("; ") || reason || "verification failed";
    progress?.emit?.("regenerating", { attempt: regenState.attempts, reason: errText });
    try { logs.warn("verification", `stage=regenerating attempt=${regenState.attempts}/${regenState.max || MAX_REGENERATION_ATTEMPTS} task=${task.label || task.id || "task"} reason=${errText.slice(0, 160)}`); } catch (_e) {}
    return regenerateTaskLocalAnswer(task, answer, errors, generateFn);
  };
  let answer = taskLocalFinalAnswer(draft);
  const blocked = (errors = []) => ({
    ok: false,
    answer: `YanÄ±t doÄŸrulama kapÄ±sÄ±ndan geÃ§medi.\nBloke eden gÃ¶rev: ${task.label || task.id || "task"}. ${errors.join(" ")}\n\nFinal Answer: YanÄ±t gÃ¼venli ÅŸekilde doÄŸrulanamadÄ±.`,
    errors,
  });
  const apply = (candidate, source) => {
    const checked = cvl.validateCorrection(task.body, answer, candidate, { source });
    if (!checked.accepted) return false;
    answer = taskLocalFinalAnswer(checked.answer);
    return true;
  };

  const rp = rpre.verify(task.body, answer);
  progress?.emit?.("verifying", { attempt: regenState.attempts, reason: "rpre" });
  if (rp.applicable && rp.status === "REJECTED" && rp.correctedAnswer) apply(rp.correctedAnswer, "task-rpre");

  const eb = ebse.verify(task.body, answer);
  progress?.emit?.("verifying", { attempt: regenState.attempts, reason: "ebse" });
  if (eb.applicable && eb.status === "REJECTED" && eb.correctedAnswer) apply(eb.correctedAnswer, "task-ebse");

  progress?.emit?.("verifying", { attempt: regenState.attempts, reason: "mlvc" });
  const ml = await verifyMathLogic(task.body, answer, null, { passes: 1, force: shouldRunMLVC(task.body) });
  if (ml.answer && ml.answer.trim()) apply(ml.answer.trim(), "task-mlvc");

  if (typeof generateFn === "function") {
    progress?.emit?.("verifying", { attempt: regenState.attempts, reason: "ave" });
    const av = await verifyAnswer(task.body, answer, generateFn, {
      categories: classifyReasoningProblem(task.body),
      passes: 1,
    });
    if (av.answer && av.answer.trim()) apply(av.answer.trim(), "task-ave");
    if (av.ok === false || av.approved === false) {
      const errors = av.errors || ["AVE failed"];
      if (canRegenerate()) {
        const regenerated = await runRegeneration(errors, "AVE failed");
        if (regenerated) {
          const retry = await verifyTaskLocalAnswer(task, regenerated, null, { allowRegeneration: false, progress, regenerationState: regenState });
          if (retry.ok) return { ...retry, regenerated: true };
        }
      }
      return blocked(errors);
    }
  }

  progress?.emit?.("verifying", { attempt: regenState.attempts, reason: "tcnis" });
  const numericIntegrity = tcnis.validateTCNIS(task.body, answer);
  if (!numericIntegrity.ok) {
    if (canRegenerate()) {
      const regenerated = await runRegeneration(numericIntegrity.errors, "TCNIS failed");
      if (regenerated) {
        const retry = await verifyTaskLocalAnswer(task, regenerated, null, { allowRegeneration: false, progress, regenerationState: regenState });
        if (retry.ok) return { ...retry, regenerated: true };
      }
    }
    return blocked(numericIntegrity.errors);
  }

  progress?.emit?.("verifying", { attempt: regenState.attempts, reason: "sacv" });
  const semantic = sacv.validateSemanticCompleteness(answer, {
    applicable: true,
    count: 1,
    tasks: [{ ...task, label: task.label || task.id || "Task 1" }],
  });
  if (!semantic.ok) {
    if (canRegenerate()) {
      const regenerated = await runRegeneration(semantic.errors, "SACV failed");
      if (regenerated) {
        const retry = await verifyTaskLocalAnswer(task, regenerated, null, { allowRegeneration: false, progress, regenerationState: regenState });
        if (retry.ok) return { ...retry, regenerated: true };
      }
    }
    return blocked(semantic.errors);
  }

  progress?.emit?.("verifying", { attempt: regenState.attempts, reason: "ssv" });
  let sanity = ssv.validateSupremeSanity(task.body, answer, null, { factLock: factLock.extractFacts(task.body) });
  if (sanity.correctedAnswer) {
    apply(sanity.correctedAnswer, "task-ssv");
    sanity = ssv.validateSupremeSanity(task.body, answer, null, { factLock: factLock.extractFacts(task.body) });
  }
  if (!sanity.ok) {
    if (canRegenerate()) {
      const regenerated = await runRegeneration(sanity.errors, "SSV failed");
      if (regenerated) {
        const retry = await verifyTaskLocalAnswer(task, regenerated, null, { allowRegeneration: false, progress, regenerationState: regenState });
        if (retry.ok) return { ...retry, regenerated: true };
      }
    }
    return blocked(sanity.errors);
  }

  return { ok: true, answer, errors: [] };
}

async function finalizeTaskLocalAnswer(task, draft, generateFn = null, opts = {}) {
  if (opts.trustedDeterministic && String(draft || "").trim()) {
    return {
      ok: true,
      answer: taskLocalFinalAnswer(draft),
      errors: [],
      trustedDeterministic: true,
    };
  }
  return verifyTaskLocalAnswer(task, draft, generateFn, opts);
}

function collapseRunawayTaskAnswer(answer) {
  const text = String(answer || "").trim();
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const seen = new Map();
  const kept = [];
  let repeated = false;
  for (const line of lines) {
    const key = line.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
    if (key && key.length > 12) {
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      if (count > 3) {
        repeated = true;
        continue;
      }
    }
    kept.push(line);
    if (kept.join("\n").length > 4000) {
      repeated = true;
      break;
    }
  }
  if (!repeated) return text;
  return `${kept.join("\n").trim()}\n\n[Task-local guard: tekrar eden/uzayan taslak kesildi; yanÄ±t yeniden doÄŸrulanacak.]`;
}

function hashTaskBody(body) {
  const s = String(body || "");
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * GÃ¶rev sÄ±nÄ±r bozulmasÄ± onarÄ±mÄ±: komÅŸu gÃ¶revin etiket sayÄ±sÄ± (Ã¶rn. "Test 2" -> 2) aktif gÃ¶revin
 * gÃ¶vde token'Ä±na yapÄ±ÅŸÄ±p "9x" yerine "29x" Ã¼retebilir. GÃ¶vdede OLMAYAN "id+token" birleÅŸmesini
 * yakalayÄ±p dÃ¼zeltir. DÃ¶ner: { changed, answer, leaks: [...] }.
 */
function repairTaskBoundaryLeak(task, answer) {
  const id = String(task && task.id != null ? task.id : "").trim();
  let out = String(answer || "");
  const leaks = [];
  if (!/^\d+$/.test(id)) return { changed: false, answer: out, leaks };
  const body = String(task.body || "");
  const tokens = body.match(/\d+(?:[.,]\d+)?x?|\b[a-zÃ§ÄŸÄ±Ã¶ÅŸÃ¼]?\d+\b/gi) || [];
  for (const tok of tokens) {
    const merged = id + tok; // "2" + "9x" = "29x"
    if (merged !== tok && !body.includes(merged) && out.includes(merged)) {
      out = out.split(merged).join(tok); // "29x" -> "9x"
      leaks.push(`${merged}â†’${tok}`);
    }
  }
  return { changed: leaks.length > 0, answer: out, leaks };
}

function deterministicTaskAnswer(taskBody) {
  const body = String(taskBody || "");
  // Ã–nce KNOWN tuzak/canonical (benchmark) â€” genel matematik Ã§Ã¶zÃ¼cÃ¼ tuzak ifadeleri yanlÄ±ÅŸ
  // yakalamasÄ±n (Ã¶rn. "birinci sÄ±radaki" -> hatalÄ±). YalnÄ±z bilinen tuzaklarda boÅŸ-dÄ±ÅŸÄ± dÃ¶ner.
  const benchmark = solveKnownReasoningBenchmarks(body);
  if (benchmark && benchmark.trim()) return benchmark.trim();
  const math = solveDeterministicMathLogic(body);
  if (math && math.trim()) return math.trim();
  const ratio = rpre.solveMainTask(body);
  if (ratio && ratio.trim()) return ratio.trim();
  return "";
}

function trustedDeterministicMultiTaskAnswer(taskDecomposition) {
  if (!taskDecomposition || !taskDecomposition.applicable || taskDecomposition.count < 2) return "";
  const results = [];
  for (const task of taskDecomposition.tasks || []) {
    const draft = deterministicTaskAnswer(task.body);
    if (!String(draft || "").trim()) return "";
    results.push({
      label: task.label || `GÃ¶rev ${results.length + 1}`,
      answer: taskLocalFinalAnswer(draft),
    });
  }
  if (results.length !== taskDecomposition.count) return "";
  return results.map((r) => `**${r.label}**\n${r.answer}`).join("\n\n");
}

// Basit sohbet/selamlaÅŸma tespiti â€” bunlarda araÃ§/ReAct makinesi devreye girmesin
function _normTr(s) {
  return String(s || "").toLocaleLowerCase("tr")
    .replace(/[Ä±Ä°]/g, "i").replace(/ÅŸ/g, "s").replace(/ÄŸ/g, "g")
    .replace(/Ã¼/g, "u").replace(/Ã¶/g, "o").replace(/Ã§/g, "c");
}
const SMALLTALK_RE = /^(selam|merhaba|merhabalar|gunaydin|iyi gunler|iyi geceler|iyi aksamlar|naber|nasilsin|tesekkur|tesekkurler|sagol|sag ol|eyvallah|gorusuruz|hosca kal|hello|hi|hey|thanks|tesekkur ederim)\b/;
const CONVERSATIONAL_RE = /\b(sence|seninle|senin halin|ne olacak|devam edebilir misin|cevabina devam|beni anladin mi|burada misin|iyi misin|hazir misin|nasil gidiyor|neden cevap veremiyorsun|neden takildin|bu halimiz|duzelmissin|gelismissin|daha iyi olmussun|biraz daha iyi|fena degil|guzel olmus|iyi olmus|harika olmus|bu kez olmus|seni ozledim)\b/;
const HEAVY_REQUEST_RE = /\b(arastir|incele|analiz et|kod yaz|duzelt|olustur|planla|karsilastir|hesapla|terminal|github|dosya|veritabani|deploy|test et)\b/;
const TECHNICAL_REQUEST_RE = /\b(php|python|javascript|typescript|sql|api|fonksiyon|uygulama|site|proje)\b.*\b(yaz|yap|duzelt|olustur|incele|kontrol et)\b/;
function isSmallTalk(input) {
  const t = String(input || "").trim();
  if (!t) return false;
  const normalized = _normTr(t).replace(/[?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (t.length > 160 || words.length > 24 || HEAVY_REQUEST_RE.test(normalized) || TECHNICAL_REQUEST_RE.test(normalized)) return false;
  if (t.length <= 40 && words.length <= 6 && SMALLTALK_RE.test(normalized)) return true;
  return CONVERSATIONAL_RE.test(normalized);
}
function isTechnicalDiagnostic(input) {
  const text = _normTr(input);
  if (!text.trim()) return false;
  return Boolean(
    /\b(http|https|php|javascript|typescript|python|sql|api|server|sunucu|nginx|apache|directadmin|docker|github|chrome|browser|veritabani|database|stack trace|exception)\b/.test(text) &&
    /\b(hata|error|failed|failure|exception|timeout|takildi|calismiyor|bozuldu|500|404|403|401|502|503|504|err_[a-z_]+)\b/.test(text)
  );
}
function intentText(input) {
  return _normTr(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function isInteractiveSoftwareRequest(input) {
  const text = intentText(input);
  if (!text) return false;
  const hasSoftwareContext = /\b(php|laravel|flutter|api|veritabani|database|clean architecture|yazilim|uygulama|sistem|backend|frontend|mobil|web|kod)\b/.test(text);
  const hasDeliveryVerb = /\b(gelistir|olustur|tasarla|kur|uygula|yaz|hazirla|planla|analiz et)\b/.test(text);
  return hasSoftwareContext && hasDeliveryVerb;
}
function wantsExplicitMultiAgent(input) {
  const text = intentText(input);
  return /\b(coklu ajan|multi agent|multi-agent|ajan ekibi|uzman ajanlar|ajanlari kullan|architect agent|backend agent|frontend agent|devops agent|security agent)\b/.test(text);
}
function shouldUseMultiAgent(settings, input) {
  return settings?.multiAgent === true && wantsExplicitMultiAgent(input);
}
function softwareDeliveryPlan() {
  return [
    "Gereksinimleri, aktorleri, is akislarini ve kabul kriterlerini analiz et",
    "Domain modelini ve veritabani semasini iliskiler, indeksler ve kisitlarla tasarla",
    "Laravel API katmanini kimlik dogrulama, yetkilendirme, dogrulama ve hata yonetimiyle gelistir",
    "Flutter uygulamasini Clean Architecture katmanlari, durum yonetimi ve API istemcisiyle kurgula",
    "Test, guvenlik, izleme ve dagitim adimlarini tamamla",
  ];
}
function shouldRunHardValidation({
  fastConversation = false,
  technicalDiagnostic = false,
  inputNeedsVerification = false,
  inputNeedsMLVC = false,
  inputNeedsCognitivePipeline = false,
  taskDecomposition = null,
} = {}) {
  return !fastConversation && !technicalDiagnostic && Boolean(
    inputNeedsVerification ||
    inputNeedsMLVC ||
    inputNeedsCognitivePipeline ||
    taskDecomposition?.applicable
  );
}
function smallTalkPrompt(humanTone) {
  return (
    "Sen CODEGA AI'sÄ±n, yerel Ã§alÄ±ÅŸan bir yapay zeka asistanÄ±sÄ±n. KullanÄ±cÄ± seninle kÄ±sa bir " +
    "selamlaÅŸma/sohbet yapÄ±yor. KÄ±sa, doÄŸal ve net TÃ¼rkÃ§e cevap ver: 1-2 cÃ¼mle. AraÃ§ KULLANMA, " +
    "liste yapma, kendini uzun uzun tanÄ±tma, rapor/etiket yazma." +
    (humanTone ? " SÄ±cak ve iÃ§ten bir ton kullan." : "")
  );
}

const MAX_HISTORY_MESSAGES = 12; // son ~6 turu hatÄ±rla

const READY_STATES = {
  CHECKING: "checking",
  READY: "ready",
  MISSING: "missing",
  ERROR: "error",
};

const MAX_REGENERATION_ATTEMPTS = 3;
const PROGRESS_HEARTBEAT_MS = 5000;

const HARD_GATE_CAVEAT = "— Not: Bu yanıtı otomatik olarak tam doğrulayamadım; özellikle sayısal/teknik ayrıntıları kontrol et.";

/**
 * Hard Gate bloke ettiyse: model GERÇEK/doluca bir cevap ürettiyse onu
 * "Yanıt güvenli şekilde doğrulanamadı" duvarıyla GİZLEME — cevabı kısa bir dürüst
 * uyarıyla göster. Boş/çok kısa cevaplarda (veya çok-görevli akışta) null döner ve
 * gate'in davranışı korunur. Saf/test edilebilir karar fonksiyonu.
 * @returns {string|null} gösterilecek metin, ya da null (değişiklik yok)
 */
function restoreBlockedAnswer({ hardGateBlocked, isMultiTask, preGateText } = {}) {
  if (!hardGateBlocked || isMultiTask) return null;
  const text = String(preGateText || "").trim();
  if (text.length <= 40) return null;
  return `${text}\n\n${HARD_GATE_CAVEAT}`;
}
const HEARTBEAT_TOKEN = "\u200b";

function progressLabel(stage, scope, meta = {}) {
  const scopeLabel = scope === "multi_task" ? "Ã§oklu gÃ¶rev" : "cevap";
  const reason = meta.reason ? String(meta.reason).replace(/[_-]+/g, " ").slice(0, 80) : "";
  if (/^hala Ã§alÄ±ÅŸÄ±yor$/i.test(reason)) return `${scopeLabel}: hala Ã§alÄ±ÅŸÄ±yorum; son aÅŸamayÄ± bekliyorum.`;
  if (stage === "reasoning") return reason ? `${scopeLabel}: ${reason} Ã¼zerinde Ã§alÄ±ÅŸÄ±yorum.` : `${scopeLabel}: problemi parÃ§alara ayÄ±rÄ±yorum.`;
  if (stage === "verifying") return reason ? `${scopeLabel}: ${reason} kontrolÃ¼nÃ¼ yapÄ±yorum.` : `${scopeLabel}: sonucu doÄŸruluyorum.`;
  if (stage === "finalizing") return reason ? `${scopeLabel}: ${reason} ile son cevabÄ± toparlÄ±yorum.` : `${scopeLabel}: son cevabÄ± toparlÄ±yorum.`;
  return `${scopeLabel}: iÅŸlem sÃ¼rÃ¼yor.`;
}

function makeVerificationProgress(onProgress, scope = "answer", onHeartbeat = null) {
  const startedAt = Date.now();
  let stage = "reasoning";
  let attempt = 0;
  let lastVisible = "";
  const sendVisible = (meta = {}) => {
    if (typeof onProgress !== "function") return;
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const line = `Ã‡alÄ±ÅŸma Ã¶zeti: ${progressLabel(stage, scope, meta)} (${elapsed} sn)\n`;
    if (line === lastVisible) return;
    lastVisible = line;
    try { onProgress({ stage, scope, attempt, elapsed, text: line.trim() }); } catch (_e) {}
  };
  const emit = (nextStage = stage, meta = {}) => {
    stage = nextStage || stage;
    attempt = meta.attempt == null ? attempt : meta.attempt;
    try { if (typeof onHeartbeat === "function") onHeartbeat(HEARTBEAT_TOKEN); } catch (_e) {}
    sendVisible(meta);
    try {
      const reason = meta.reason ? ` reason=${String(meta.reason).slice(0, 120)}` : "";
      logs.info("verification", `stage=${stage} attempt=${attempt} scope=${scope} elapsed=${Date.now() - startedAt}ms${reason}`);
    } catch (_e) {}
  };
  const timer = typeof onProgress === "function" || typeof onHeartbeat === "function"
    ? setInterval(() => emit(stage, { attempt, reason: "hala Ã§alÄ±ÅŸÄ±yor" }), PROGRESS_HEARTBEAT_MS)
    : null;
  if (timer && timer.unref) timer.unref();
  emit(stage, { attempt });
  return {
    emit,
    stop() {
      if (timer) clearInterval(timer);
      try { logs.info("verification", `stage=done attempt=${attempt} scope=${scope} elapsed=${Date.now() - startedAt}ms`); } catch (_e) {}
    },
  };
}

const TASK_MODELS = {
  code: ["qwen2.5-coder:3b", "qwen2.5-coder:3b-instruct", "qwen2.5-coder:7b", "qwen2.5-coder:7b-instruct", "qwen3.5:4b", "qwen3:8b", "qwen3.5:9b", DEFAULT_MODEL],
  image: ["qwen3.5:4b", "gemma3:4b", "qwen3.5:9b", "qwen3:4b", DEFAULT_MODEL],
  writing: ["qwen3.5:9b", "qwen3.5:4b", "qwen3.6:27b", "qwen3:8b", "qwen3:14b", "mistral:7b", DEFAULT_MODEL],
  chat: ["qwen3.5:0.8b", "qwen3.5:2b", DEFAULT_MODEL, "qwen3:1.7b", "qwen3:4b", "llama3.2:3b", "qwen3.5:9b"],
};

function safeArithmeticAnswer(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const folded = _foldTr(raw);
  const match = raw.match(/-?\d+(?:[.,]\d+)?(?:\s*(?:\+|-|\*|\/|x|X|Ã—|Ã·)\s*-?\d+(?:[.,]\d+)?)+/);
  if (!match) return "";
  if (!/(?:kac|eder|hesap|sonuc|cevap|result|answer|sadece|only|=|\?)/i.test(folded)) return "";
  const expr = match[0]
    .replace(/[xXÃ—]/g, "*")
    .replace(/Ã·/g, "/")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[+\-*/]-?(?:\d+(?:\.\d+)?|\.\d+))+$/.test(expr)) return "";
  if (/\/0(?:\.0+)?(?:$|[+\-*/])/.test(expr)) return "Tanimsiz";
  try {
    const value = Function(`"use strict"; return (${expr});`)();
    if (!Number.isFinite(value)) return "";
    if (Math.abs(value - Math.round(value)) < 1e-10) return String(Math.round(value));
    return String(Number(value.toFixed(10)));
  } catch (_e) {
    return "";
  }
}

function literalOnlyAnswer(input) {
  const original = String(input || "").trim();
  if (!original) return "";
  const normalized = original.replace(/\s+/g, " ").trim();
  const patterns = [
    /^(?:sadece|yaln[\u0131i]zca|yalnizca)\s+["'`â€œâ€â€˜â€™]?(.+?)["'`â€œâ€â€˜â€™]?\s+(?:yaz|de|s[Ã¶o]yle|cevapla)(?:[.!?]|$)/iu,
    /^(?:only|just)\s+(?:write|say|print|reply)\s+["'`â€œâ€â€˜â€™]?(.+?)["'`â€œâ€â€˜â€™]?(?:[.!?]|$)/iu,
    /^(?:tek\s+kelime|single\s+word)\s*[:ï¼š-]\s*["'`â€œâ€â€˜â€™]?(.+?)["'`â€œâ€â€˜â€™]?(?:[.!?]|$)/iu,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    let answer = String(match[1] || "").trim();
    answer = answer
      .replace(/\s*(?:ba[ÅŸs]ka|baska)\s+hi[Ã§c]bir\s+[ÅŸs]ey\s+yazma\.?$/iu, "")
      .replace(/\s*(?:nothing\s+else|do\s+not\s+write\s+anything\s+else|do\s+not\s+add\s+anything\s+else)\.?$/iu, "")
      .trim();
    answer = answer.replace(/^["'`â€œâ€â€˜â€™]+|["'`â€œâ€â€˜â€™]+$/g, "").trim();
    if (!answer) continue;
    const words = answer.split(/\s+/).filter(Boolean);
    if (answer.length <= 120 && words.length <= 12) return answer;
  }
  return "";
}

function instantAnswer(input) {
  const raw = String(input || "").trim();
  const text = raw.toLowerCase();
  if (!text) return "";

  const literal = literalOnlyAnswer(raw);
  if (literal) return literal;

  const math = safeArithmeticAnswer(raw);
  if (math) return math;

  const direct = raw.match(/(?:^|\b)(?:sadece|yaln[Ä±i]zca|yalnizca|only)\s+["'â€œâ€â€˜â€™]?([A-Za-z0-9_.!? -]{1,40}?)["'â€œâ€â€˜â€™]?\s+(?:yaz|soyle|sÃ¶yle|cevapla|write|say|reply)\b/i);
  if (direct) {
    const value = String(direct[1] || "").replace(/\s+/g, " ").replace(/[ .]+$/g, "").trim();
    if (value && !/^(cevap|cevabi|cevabÄ±|sonuc|sonuÃ§|sonucu|yanit|yanÄ±t)$/i.test(value)) return value;
  }

  if (/^(merhaba|selam|hi|hello|hey|gÃ¼naydÄ±n|iyi\s+(akÅŸam|akÅŸamlar|gece|geceler)|nasÄ±lsÄ±n|naber)\b/.test(text)) {
    if (text.includes("gÃ¼naydÄ±n")) return "GÃ¼naydÄ±n. BuradayÄ±m, nasÄ±l yardÄ±mcÄ± olayÄ±m?";
    if (text.includes("iyi gece")) return "Ä°yi geceler. BuradayÄ±m, nasÄ±l yardÄ±mcÄ± olayÄ±m?";
    if (text.includes("iyi akÅŸam")) return "Ä°yi akÅŸamlar. BuradayÄ±m, nasÄ±l yardÄ±mcÄ± olayÄ±m?";
    if (text.includes("nasÄ±lsÄ±n") || text.includes("naber")) {
      return "Ä°yiyim, teÅŸekkÃ¼r ederim. Ne yapmak istiyorsun?";
    }
    return "Merhaba. BuradayÄ±m, nasÄ±l yardÄ±mcÄ± olayÄ±m?";
  }

  // Kimlik tanıtımı kısayolu: YALNIZCA kısa, kimlik-odaklı sorularda ("Sen kimsin?",
  // "CODEGA AI nedir?", "Neler yapabilirsin?") çalışır. Uzun/somut sorular (içinde
  // "codega ai" veya "kimsin" geçse bile) modele gider — aksi halde "Bu projede
  // CODEGA AI'ın rolü nedir ve nasıl ölçeklenir?" gibi gerçek bir soruya papağan
  // gibi tanıtımla cevap verilir (instant fast-path, ANTI-LOOP'u da by-pass eder).
  if (raw.length <= 50 && /(kendin(den|i)|\bkimsin\b|neler\s+yapabilirsin|Ã¶zelliklerin|yeteneklerin|codega\s+ai)\b/.test(text)) {
    return "Ben CODEGA AI. Ä°steÄŸine gÃ¶re uygun yerel modeli otomatik seÃ§en, kod, araÅŸtÄ±rma, proje planlama ve gÃ¼nlÃ¼k Ã¼retim iÅŸlerinde yardÄ±mcÄ± olan kiÅŸisel yapay zeka asistanÄ±nÄ±m.";
  }

  return "";
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const { onData, timeoutMs = OLLAMA_COMMAND_TIMEOUT_MS, signal, ...spawnOptions } = options;
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      ...spawnOptions,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let timeoutTimer = null;
    let forceTimer = null;
    const abortChild = () => {
      aborted = true;
      try { child.kill(); } catch (_e) {}
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceTimer) clearTimeout(forceTimer);
      if (signal) signal.removeEventListener("abort", abortChild);
      resolve(result);
    };

    if (signal) {
      if (signal.aborted) abortChild();
      else signal.addEventListener("abort", abortChild, { once: true });
    }

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        stderr += `\nKomut ${Math.round(timeoutMs / 1000)} saniye iÃ§inde yanÄ±t vermedi.`;
        child.kill();
        forceTimer = setTimeout(() => {
          finish({
            ok: false,
            stdout,
            stderr,
            timedOut: true,
            error: "Ollama sÃ¼reci zaman aÅŸÄ±mÄ±ndan sonra kapatÄ±lamadÄ±.",
          });
        }, 2000);
      }, timeoutMs);
    }

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onData?.(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onData?.(text);
    });
    child.on("error", (error) => {
      finish({ ok: false, stdout, stderr, error: error.message, timedOut });
    });
    child.on("close", (code) => {
      finish({
        ok: code === 0 && !timedOut && !aborted,
        code,
        stdout,
        stderr,
        timedOut,
        aborted,
        error: timedOut
          ? "Ollama yanÄ±tÄ± zaman aÅŸÄ±mÄ±na uÄŸradÄ±."
          : aborted ? "Ollama isteÄŸi durduruldu." : undefined,
      });
    });
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function existingFile(value) {
  try {
    return value && fs.existsSync(value) ? value : null;
  } catch (_error) {
    return null;
  }
}

function ollamaCandidates() {
  const env = process.env;
  const home = os.homedir();
  const executable = process.platform === "win32" ? "ollama.exe" : "ollama";
  const pathEntries = String(env.PATH || "")
    .split(path.delimiter)
    .map((entry) => path.join(entry, executable));

  return unique([
    "ollama",
    existingFile(env.OLLAMA_EXE),
    existingFile(env.OLLAMA_PATH),
    existingFile(path.join(env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe")),
    existingFile(path.join(home || "", "AppData", "Local", "Programs", "Ollama", "ollama.exe")),
    existingFile(path.join(env.PROGRAMFILES || "", "Ollama", "ollama.exe")),
    existingFile(path.join(env["PROGRAMFILES(X86)"] || "", "Ollama", "ollama.exe")),
    existingFile("/usr/local/bin/ollama"),
    existingFile("/opt/homebrew/bin/ollama"),
    ...pathEntries.map(existingFile),
  ]);
}

function modelCandidates() {
  return unique([DEFAULT_MODEL, ...FALLBACK_MODELS]);
}

function normalizeModelName(modelId) {
  return String(modelId || "").trim().toLowerCase();
}

function isInstalledModel(installed, modelId) {
  const wanted = normalizeModelName(modelId);
  if (!wanted) return false;
  return (installed || []).some((item) => {
    const current = normalizeModelName(item);
    return current === wanted || current === `${wanted}:latest`;
  });
}

function modelOption(modelId) {
  return MODEL_OPTIONS.find((model) => model.id === modelId) || {
    id: modelId,
    label: modelId,
    description: "Ã–zel model",
    task: "custom",
  };
}

function parseInstalledModels(listOutput) {
  return String(listOutput || "")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function hasModel(listOutput, model) {
  const wanted = model.toLowerCase();
  return String(listOutput || "")
    .toLowerCase()
    .split(/\r?\n/)
    .some((line) => line.split(/\s+/)[0] === wanted);
}

function _foldTr(text) {
  return String(text || "").toLowerCase()
    .replace(/Ä±/g, "i").replace(/ÅŸ/g, "s").replace(/ÄŸ/g, "g")
    .replace(/Ã¼/g, "u").replace(/Ã¶/g, "o").replace(/Ã§/g, "c");
}

/** AÃ§Ä±k internet/araÅŸtÄ±rma niyeti mi? (zayÄ±f yerel model aracÄ± tetikleyemiyor; biz zorlarÄ±z) */
function wantsWebResearch(input) {
  const q = _foldTr(input);
  if (/(internet|web|google|cevrimici|online|net)\S*\s*(ten|te|de|da|den|dan)?\s*(arastir|aratip|arat|ara|bak|tara|incele)/.test(q)) return true;
  if (/(guncel|son dakika|haber|piyasa|kur|fiyat|bugun)\S*.*(arastir|ara\b|bul\b|bak\b)/.test(q)) return true;
  // kÄ±sa ve emir kipi "araÅŸtÄ±r/araÅŸtÄ±rÄ±p Ã¶zetle"
  if (/\barastir/.test(q) && q.split(/\s+/).length <= 9) return true;
  // Mesajda bir alan adÄ±/URL varsa ve "hakkÄ±nda bilgi/araÅŸtÄ±r/incele/nedir" gibi
  // bir niyet varsa: bu siteyi ARA (model uydurmasÄ±n, gerÃ§ek kaynaÄŸa baksÄ±n).
  if (/\b[a-z0-9-]+\.(net|com|org|io|dev|gov|edu|co|tr|info|biz|com\.tr|net\.tr|org\.tr)\b/.test(q) &&
      /(hakkinda|bilgi|arastir|incele|nedir|ne is|tanit|hakk\b|sitesi|ara\b|bak\b)/.test(q)) return true;
  return false;
}

/** SİTE DENETİMİ niyeti mi? ("şu siteyi analiz et / artı eksi / denetle / değerlendir")
 *  NOT: _foldTr'a güvenme — dosya kodlaması nedeniyle gerçek TR karakterleri
 *  katlayamayabiliyor; regex'ler [ıi] gibi karakter sınıflarıyla TR-güvenli yazılır. */
function wantsSiteAudit(input) {
  const q = String(input || "").toLowerCase();
  const hasDomain = /\b[a-z0-9-]+\.(net|com|org|io|dev|gov|edu|co|tr|info|biz|com\.tr|net\.tr|org\.tr)\b/.test(q)
    || /https?:\/\//.test(q) || /\b(bu |[şs]u )?site(yi|nin|ye)?\b/.test(q);
  const hasAuditIntent = /(analiz|denetle|de[ğg]erlendir|art[ıi]\w*\s*(ve|\/|,)?\s*eksi|eksi\w*\s*(ve|\/|,)?\s*art[ıi]|g[üu][çc]l[üu].*zay[ıi]f|zay[ıi]f.*g[üu][çc]l[üu]|audit)/.test(q);
  return hasDomain && hasAuditIntent;
}

/** AraÅŸtÄ±rma sorgusunu Ã§Ä±kar: komut sÃ¶zcÃ¼klerini at; yetersizse geÃ§miÅŸten konuyu ekle. */
function extractResearchQuery(input, history = []) {
  const raw = String(input || "").trim();
  // 1) Alan adı/URL varsa EN İYİ arama terimi odur → ana sorgu yap.
  //    ("r10.net hakkında araştırma yap" → sorgu: "r10.net")
  const domMatch = raw.match(/\b[a-z0-9-]+\.(?:com|net|org|io|dev|gov|edu|co|info|biz)(?:\.tr)?\b/i)
    || raw.match(/\b[a-z0-9-]+\.tr\b/i);
  // 2) Komut/dolgu sözcüklerini KELİME BÜTÜNÜ olarak temizle (Türkçe-güvenli:
  //    "araştırma" içindeki "ara"yı KIRPMA — tam kelimeleri hedefle).
  const STOP = /\b(internetten|internette|internet|web'?[dt]e|web|google'?[dy]?[ae]?|google|cevrimici|online|bana|bize|benim|icin|için|l[uü]tfen|[oö]zet\w*|ara[sş]t[iı]r\w*|arat\w*|incele\w*|tara\w*|bak[iı]p|yapar|yap|m[iı]s[iı]n|musun\w*|verir|ver|bilgi|hakk[iı]nda|nedir|o zaman|sonra)\b/gi;
  let q = raw.replace(STOP, " ").replace(/[?!]/g, " ").replace(/\s+/g, " ").trim();
  if (domMatch) {
    const dom = domMatch[0];
    const domRe = new RegExp(dom.replace(/[.\-]/g, "\\$&"), "ig");
    q = (dom + " " + q.replace(domRe, " ")).replace(/\s+/g, " ").trim();
    return q;
  }
  const meaningful = q.split(/\s+/).filter((w) => w.length > 1);
  if (meaningful.length >= 2) return q;
  // yetersiz konu: en son anlamlÄ± kullanÄ±cÄ± mesajÄ±nÄ± ekle (baÄŸlam)
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] && history[i].role === "user") {
      const h = String(history[i].content || "").replace(/\s+/g, " ").trim();
      if (h && h.length > 4) return (q ? q + " " : "") + h.slice(0, 140);
    }
  }
  return q || String(input || "").slice(0, 140);
}

function parseResearchSources(research) {
  const text = String(research || "");
  const blocks = text.split(/\n(?=###\s+Kaynak\s+\d+\s*:)/i)
    .map((block) => block.trim())
    .filter(Boolean);
  const sources = [];
  for (const block of blocks) {
    const titleMatch = block.match(/^###\s+Kaynak\s+\d+\s*:\s*(.+)$/im);
    const urlMatch = block.match(/https?:\/\/[^\s)]+/i);
    if (!titleMatch && !urlMatch) continue;
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const title = (titleMatch && titleMatch[1].trim()) || (lines[0] || "Kaynak");
    const url = urlMatch ? urlMatch[0].replace(/[.,;:]+$/, "") : "";
    const snippet = lines
      .filter((line) => !/^###\s+Kaynak\s+\d+\s*:/i.test(line) && line !== url
        // toolResearch'in son satırdaki yönergesi son kaynağın snippet'ine sızmasın.
        && !/^Bu kaynaklar[ıi] kar[şs][ıi]la[şs]t[ıi]r/i.test(line)
        && !/^📚\s*Ara[şs]t[ıi]rma\s*:/i.test(line))
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 260);
    sources.push({ title, url, snippet });
  }
  if (!sources.length) {
    const urlMatches = text.match(/https?:\/\/[^\s)]+/gi) || [];
    for (const rawUrl of urlMatches.slice(0, 5)) {
      sources.push({ title: rawUrl, url: rawUrl.replace(/[.,;:]+$/, ""), snippet: "" });
    }
  }
  return sources.slice(0, 5);
}

function researchHosts(sources) {
  return sources
    .map((source) => {
      try { return source.url ? new URL(source.url).hostname.replace(/^www\./i, "") : ""; }
      catch (_e) { return ""; }
    })
    .filter(Boolean);
}

// --- Kaynak kalitesi: resmi kaynak önceliklendirme + tazelik etiketi ---
// AGENT_HANDOFF notu (alpha.90 grounding guard): "Gelecek iyilestirme: kaynak kalitesi
// skoru, tarih/tazelik etiketi ve resmi kaynak onceliklendirmesi eklenmeli."

const SOURCE_TIER_SCORES = { official: 90, docs: 80, encyclopedia: 70, news: 55, general: 45, forum: 25 };

function classifyResearchSource(url) {
  let host = "";
  try { host = url ? new URL(url).hostname.replace(/^www\./i, "").toLowerCase() : ""; }
  catch (_e) { return { host: "", tier: "general" }; }
  if (!host) return { host: "", tier: "general" };
  if (/(^|\.)((gov|edu|mil)(\.[a-z]{2})?|belediye\.tr|k12\.tr|pol\.tr|tsk\.tr)$/.test(host)
    || /(^|\.)(resmigazete|tuik|mevzuat)\.gov\.tr$/.test(host)) {
    return { host, tier: "official" };
  }
  if (/^(docs?|developer|devdocs|api|learn)\./.test(host) || /readthedocs\.io$/.test(host)
    || /^(developer\.mozilla\.org|learn\.microsoft\.com)$/.test(host)) {
    return { host, tier: "docs" };
  }
  if (/(^|\.)wikipedia\.org$|(^|\.)britannica\.com$/.test(host)) return { host, tier: "encyclopedia" };
  if (/(forum|sozluk|reddit|quora|stackoverflow|stackexchange|facebook|twitter|x\.com|instagram)/.test(host)) {
    return { host, tier: "forum" };
  }
  if (/(haber|gazete|news|hurriyet|milliyet|sabah|ntv|cnn|bbc|reuters|aa\.com\.tr)/.test(host)) {
    return { host, tier: "news" };
  }
  return { host, tier: "general" };
}

// Snippet/başlıktaki en makul yılı yakala (dd.mm.yyyy, yyyy-mm-dd veya yalın yıl).
function extractSourceYear(source) {
  const text = `${source && source.title || ""} ${source && source.snippet || ""}`;
  const years = [];
  const dateRe = /\b(?:\d{1,2}[./]\d{1,2}[./](\d{4})|(\d{4})-\d{2}-\d{2}|(19[9]\d|20[0-4]\d))\b/g;
  let m;
  while ((m = dateRe.exec(text))) {
    const y = parseInt(m[1] || m[2] || m[3], 10);
    if (y >= 1990 && y <= new Date().getFullYear() + 1) years.push(y);
  }
  return years.length ? Math.max(...years) : null;
}

function sourceFreshnessLabel(year, now = new Date()) {
  if (!year) return "";
  const age = now.getFullYear() - year;
  if (age <= 1) return `güncel · ${year}`;
  if (age >= 3) return `eski olabilir · ${year}`;
  return String(year);
}

function scoreResearchSource(source, now = new Date()) {
  const { tier } = classifyResearchSource(source && source.url);
  let score = SOURCE_TIER_SCORES[tier] || SOURCE_TIER_SCORES.general;
  if (source && /^https:/i.test(source.url || "")) score += 3;
  if (source && (source.snippet || "").length >= 80) score += 5;
  const year = extractSourceYear(source);
  if (year) {
    const age = now.getFullYear() - year;
    if (age <= 1) score += 5;
    else if (age >= 3) score -= 5;
  }
  return Math.max(0, Math.min(100, score));
}

// Kaynakları kalite skoruna göre sırala (resmi > docs > ansiklopedi > haber > genel > forum).
// Eşit skorda orijinal sıra korunur (stable) — arama motorunun alaka sırası ikincil sinyaldir.
function rankResearchSources(sources, now = new Date()) {
  return (sources || [])
    .map((source, index) => {
      const { tier } = classifyResearchSource(source.url);
      const year = extractSourceYear(source);
      return {
        ...source,
        tier,
        year,
        score: scoreResearchSource(source, now),
        freshness: sourceFreshnessLabel(year, now),
        _index: index,
      };
    })
    .sort((a, b) => (b.score - a.score) || (a._index - b._index));
}

// Aynı host'tan en fazla `maxPerHost` kaynak tut — tek bir forum/site kaynak
// listesini domine etmesin. Sıralı liste bekler (rankResearchSources çıktısı);
// host'u çözülemeyen kaynaklar sınırlamadan muaftır.
function capResearchSourcesPerHost(sources, maxPerHost = 2) {
  const perHost = Object.create(null);
  return (sources || []).filter((source) => {
    const { host } = classifyResearchSource(source && source.url);
    if (!host) return true;
    perHost[host] = (perHost[host] || 0) + 1;
    return perHost[host] <= maxPerHost;
  });
}

function sourceLabelSuffix(source) {
  const tags = [];
  if (source.tier === "official") tags.push("resmi kaynak");
  else if (source.tier === "docs") tags.push("resmi dokümantasyon");
  else if (source.tier === "forum") tags.push("forum/topluluk");
  if (source.freshness) tags.push(source.freshness);
  return tags.length ? ` (${tags.join(", ")})` : "";
}

function sourceListMarkdown(sources) {
  const usable = (sources || []).filter((source) => source && (source.url || source.title));
  if (!usable.length) return "";
  return usable
    .map((source) => `- ${source.title}${sourceLabelSuffix(source)}${source.url ? `: ${source.url}` : ""}`)
    .join("\n");
}

function buildGroundedResearchFallback(query, research) {
  const sources = capResearchSourcesPerHost(rankResearchSources(parseResearchSources(research)));
  const sourceList = sourceListMarkdown(sources);
  const bullets = sources
    .filter((source) => source.snippet)
    .slice(0, 3)
    .map((source) => `- ${source.title}${sourceLabelSuffix(source)}: ${source.snippet}`)
    .join("\n");
  const body = bullets || String(research || "").replace(/\s+/g, " ").slice(0, 700);
  return [
    `Internet arastirmasini kaynaklara bagli kalarak toparladim: "${query}".`,
    "",
    body,
    sourceList ? "\nKaynaklar:\n" + sourceList : "",
    "",
    "Not: Kaynaklarda acikca yer almayan bilgileri kesin bilgi gibi eklemedim.",
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function groundResearchAnswer(query, research, generated) {
  const summary = String(generated || "").trim();
  if (!summary) return buildGroundedResearchFallback(query, research);
  // ÖZ-DÜZELTME (araştırma yolu): model özeti dejenere ise (emoji/unicode salatası,
  // kendini tekrar, rol karışması) modele güvenme → kaynak-temelli deterministik
  // fallback'e düş. tekcanmetal örneğindeki emoji/unicode çöpünü bu keser.
  if (looksDegenerate(summary).bad) return buildGroundedResearchFallback(query, research);
  const sources = parseResearchSources(research);
  const hosts = researchHosts(sources);
  const hasUrlInSummary = /https?:\/\//i.test(summary);
  const mentionsKnownHost = hosts.some((host) => summary.toLowerCase().includes(host.toLowerCase()));
  const isNumericOnly = /^[\s\d.,%+-]+$/.test(summary);
  const isTooShort = summary.length < 40 && String(research || "").length > 120;
  const looksLikeToolFailure = /^(?:final answer\s*:)?\s*(?:0(?:[.,]\d+)?|\d+(?:[.,]\d+)?|konya|6\s*tl)\s*$/i.test(summary);
  const missingGrounding = sources.length > 0 && !hasUrlInSummary && !mentionsKnownHost;
  if (isNumericOnly || looksLikeToolFailure || (isTooShort && missingGrounding)) {
    return buildGroundedResearchFallback(query, research);
  }
  if (sources.length > 0 && !hasUrlInSummary) {
    const sourceList = sourceListMarkdown(capResearchSourcesPerHost(rankResearchSources(sources)));
    if (sourceList) return `${summary}\n\nKaynaklar:\n${sourceList}`;
  }
  return summary;
}

function detectTask(input) {
  const text = String(input || "").toLowerCase();
  if (/(php|python|javascript|typescript|react|node|api|site|web sitesi|program|uygulama|kod|script|fonksiyon|class|sql|html|css)\b/.test(text)) {
    return "code";
  }
  if (/(resim|gÃ¶rsel|fotoÄŸraf|Ã§iz|Ã§izim|afiÅŸ|logo|illustrasyon|illustration|image|prompt)\b/.test(text)) {
    return "image";
  }
  if (/(makale|metin|iÃ§erik|mail|e-posta|Ã¶zet|rapor|senaryo|hikaye|plan)\b/.test(text)) {
    return "writing";
  }
  return "chat";
}

function chooseModelForTask(task, installed) {
  const installedSet = new Set(installed);
  const preferred = TASK_MODELS[task] || TASK_MODELS.chat;
  return preferred.find((model) => installedSet.has(model))
    || modelCandidates().find((model) => installedSet.has(model))
    || preferred[0]
    || DEFAULT_MODEL;
}

function candidateModelsForTask(task, installed) {
  const installedSet = new Set(installed);
  const preferred = TASK_MODELS[task] || TASK_MODELS.chat;
  return unique([
    ...preferred,
    DEFAULT_MODEL,
    "qwen3:1.7b",
    "qwen2.5:3b",
    "qwen2.5:1.5b",
    "llama3.2:3b",
    ...modelCandidates(),
  ]).filter((model) => installedSet.has(model));
}

// Model adından parametre boyutunu (milyar) çıkar: "qwen3.5:9b"→9, "...:0.8b"→0.8,
// "qwen2.5-coder:3b-instruct"→3. Bulunamazsa 0.
// Bağlam sürekliliği: renderer'dan gelen kalıcı geçmişi ({role,text|content})
// main'in {role,content} biçimine çevirip hedef diziye (yalnız boşken) tohumlar.
// Saf + test edilebilir. Hedefi mutasyonla doldurur, eklenen adet döner.
function seedConversationHistory(target, incoming, max = 12) {
  if (!Array.isArray(target) || target.length > 0) return 0;
  if (!Array.isArray(incoming) || !incoming.length) return 0;
  const seeded = incoming
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && (m.content || m.text))
    .map((m) => ({ role: m.role, content: String(m.content || m.text || "").trim() }))
    .filter((m) => m.content)
    .slice(-max);
  for (const m of seeded) target.push(m);
  return seeded.length;
}

function modelParamSize(name) {
  const m = String(name || "").match(/(\d+(?:\.\d+)?)\s*b\b/i);
  return m ? Number(m[1]) : 0;
}

// Kurulu modeller içinde en büyük (en güçlü) olanı döndür.
function strongestInstalledModel(installed) {
  let best = null;
  let bestSize = -1;
  for (const m of installed || []) {
    const s = modelParamSize(m);
    if (s > bestSize) { bestSize = s; best = m; }
  }
  return { model: best, size: bestSize };
}

// Bilmece / kelime oyunu / günlük-hayat mantık sorusu sezici (alpha.105).
// Konya maden-suyu vakası: bu sorular küçük (3-4B) modelde kelime salatasına
// dönüşüyor — talimat (Soğukkanlılık Çıpası) yetmiyor, model kapasitesi gerekiyor.
// Sezilirse en güçlü kurulu modele yükseltilir (mevcut escalation kancası).
function isRiddleQuestion(input) {
  const q = String(input || "").toLocaleLowerCase("tr");
  if (q.length < 25) return false;
  if (/(bilmece|kelime oyunu|tuzak soru|zek[aâ]\s*(testi|sorusu)|mant[ıi]k\s*(testi|sorusu))/i.test(q)) return true;
  // Senaryo + "önce hangisi/neyi" kalıbı: klasik pratik-zekâ tuzağı imzası.
  return /(önce\s+(neyi|hangisini|ne\s+yapmal[ıi])|ilk\s+olarak\s+neyi|ilk\s+önce\s+hangi)/i.test(q)
    && /(gerekir|yapmal[ıi]|kullanmal[ıi]|açmal[ıi])/i.test(q);
}

function prioritizeStrongModelForHeavyPrompt(input, installed, attemptModels, settings = {}) {
  const current = Array.isArray(attemptModels) ? [...attemptModels] : [];
  const heavyPrompt = answerAdequacy.isLongTechnicalQuestion(input)
    || finalAnswerSanitizer.isMultiQuestionInput(input)
    || isRiddleQuestion(input);
  if (!heavyPrompt || settings.autoModelEscalation === false) {
    return { attemptModels: current, escalated: false, model: null, size: 0, previousSize: modelParamSize(current[0]) };
  }
  const strong = strongestInstalledModel(installed);
  const curSize = modelParamSize(current[0]);
  if (!strong.model || strong.size <= curSize) {
    return { attemptModels: current, escalated: false, model: strong.model, size: strong.size, previousSize: curSize };
  }
  const nrm = (x) => String(x || "").toLowerCase();
  return {
    attemptModels: [strong.model, ...current.filter((m) => nrm(m) !== nrm(strong.model))],
    escalated: true,
    model: strong.model,
    size: strong.size,
    previousSize: curSize,
  };
}

function buildPrompt(task, input) {
  return [
    "Sen CODEGA AI'sÄ±n. TÃ¼rkÃ§e, net, samimi ve uygulanabilir cevap ver.",
    "ChatGPT ve Claude kalitesinde davran: talebi anla, gerekirse kÄ±sa plan yap, sonra doÄŸrudan faydalÄ± cevabÄ± ver.",
    "Ä°Ã§ model/paket adlarÄ±nÄ± kullanÄ±cÄ±ya sÃ¶yleme; sadece doÄŸal ÅŸekilde yanÄ±t ver.",
    "YanÄ±tÄ± gereksiz uzatma. Ã–nce sonucu ver, sonra gerekiyorsa kÄ±sa aÃ§Ä±klama ekle.",
    `GÃ¶rev tÃ¼rÃ¼: ${task}`,
    `KullanÄ±cÄ±: ${input}`,
    "CODEGA AI:",
  ].join("\n");
}

function parseSizeToBytes(value, unit) {
  const n = Number(String(value || "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const u = String(unit || "").toLowerCase();
  if (u.startsWith("kb")) return n * 1024;
  if (u.startsWith("mb")) return n * 1024 * 1024;
  if (u.startsWith("gb")) return n * 1024 * 1024 * 1024;
  if (u.startsWith("tb")) return n * 1024 * 1024 * 1024 * 1024;
  return n;
}

function parsePullProgress(line) {
  const text = String(line || "").replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const percentMatch = text.match(/(\d{1,3})\s*%/);
  const sizeMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(KB|MB|GB|TB)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(KB|MB|GB|TB)/i);
  const speedMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(KB|MB|GB|TB)\/s/i);
  const progress = {
    raw: text,
    percent: percentMatch ? Math.max(0, Math.min(100, Number(percentMatch[1]))) : null,
    downloadedBytes: null,
    totalBytes: null,
    speedBytesPerSec: null,
  };
  if (sizeMatch) {
    progress.downloadedBytes = parseSizeToBytes(sizeMatch[1], sizeMatch[2]);
    progress.totalBytes = parseSizeToBytes(sizeMatch[3], sizeMatch[4]);
    if (progress.percent === null && progress.downloadedBytes !== null && progress.totalBytes) {
      progress.percent = Math.max(0, Math.min(100, (progress.downloadedBytes / progress.totalBytes) * 100));
    }
  }
  if (speedMatch) progress.speedBytesPerSec = parseSizeToBytes(speedMatch[1], speedMatch[2]);
  return progress;
}

function missingModelReply(task, modelId, started) {
  const subject = task === "code" ? "kod/PHP iÅŸleri" : "bu iÅŸ";
  const action = started ? "arka planda hazÄ±rlamaya baÅŸladÄ±m" : "arka planda hazÄ±rlÄ±yorum";
  if (task === "code") {
    return [
      `PHP yazÄ±lÄ±m iÃ§in gerekli yerel kod modelini (${modelId}) ${action}.`,
      "Ä°ndirme bitince otomatik kullanacaÄŸÄ±m; ayrÄ±ca Ayarlar'a gitmene gerek yok.",
      "",
      "Bu sÄ±rada ihtiyacÄ±nÄ± netleÅŸtirebiliriz: web sitesi mi, panel/ERP modÃ¼lÃ¼ mÃ¼, API mi, yoksa mevcut PHP projesinde hata/ek geliÅŸtirme mi istiyorsun?",
    ].join("\n");
  }
  return `${subject} iÃ§in gerekli yerel modeli (${modelId}) ${action}. HazÄ±r olunca otomatik kullanacaÄŸÄ±m; ayrÄ±ca Ayarlar'a gitmene gerek yok.`;
}

// HTTP /api/chat eriÅŸilemezse, CLI `ollama run` iÃ§in messages dizisini tek
// prompt'a dÃ¼zleÅŸtir (system + geÃ§miÅŸ + kullanÄ±cÄ± korunur).
function flattenMessages(messages) {
  const label = { system: "[SISTEM]", user: "[KULLANICI]", assistant: "[CODEGA]" };
  const lines = messages.map((m) => `${label[m.role] || m.role}: ${m.content}`);
  lines.push("[CODEGA]:");
  return lines.join("\n\n");
}

class ModelManager {
  constructor() {
    this.ollamaCommand = null;
    this.history = []; // sunucu-tarafÄ± Ã§ok-turlu hafÄ±za ({role, content})
    this.sessionHistories = new Map(); // renderer sohbetlerini birbirinden kesin olarak ayÄ±r
    this._abort = null; // mevcut Ã¼retimi durdurmak iÃ§in
    this._aborted = false;
    this._queue = Promise.resolve(); // ask() serileÅŸtirme kuyruÄŸu
    this._activeForeground = 0;
    this._preparingModels = new Set(); // arka planda aynÄ± modeli iki kez indirme
    this.state = {
      provider: "instant",
      status: READY_STATES.CHECKING,
      model: DEFAULT_MODEL,
      task: "chat",
      message: "Model durumu kontrol ediliyor",
    };
  }

  async runOllama(args, options = {}) {
    const candidates = this.ollamaCommand ? [this.ollamaCommand] : ollamaCandidates();
    let lastResult = null;
    for (const candidate of candidates) {
      const result = await runCommand(candidate, args, options);
      if (result.ok) {
        this.ollamaCommand = candidate;
        return result;
      }
      lastResult = result;
    }
    return lastResult || { ok: false, error: "Ollama Ã§alÄ±ÅŸtÄ±rÄ±lamadÄ±" };
  }

  getStatus() {
    return { ...this.state };
  }

  isBusy() {
    return this._activeForeground > 0;
  }

  async installedModels() {
    // HTTP /api/tags â€” CLI/PATH'ten baÄŸÄ±msÄ±z (Electron'da gÃ¼venilir)
    const viaHttp = await ollamaListModels();
    if (Array.isArray(viaHttp)) return viaHttp;
    const models = await this.runOllama(["list"]);
    return models.ok ? parseInstalledModels(models.stdout) : [];
  }

  async detect() {
    this.state = {
      ...this.state,
      status: READY_STATES.CHECKING,
      message: "Ollama aranÄ±yor",
    };

    // Ã–nce HTTP servisi (127.0.0.1:11434) â€” Electron PATH'i CLI'Ä± gÃ¶rmese bile
    // servis ayaktaysa Ollama KURULU sayÄ±lÄ±r. CLI sadece yedek kontrol.
    const reachable = await ollamaReachable();
    let cliOk = false;
    if (!reachable) {
      const version = await this.runOllama(["--version"]);
      cliOk = version.ok;
    }
    if (!reachable && !cliOk) {
      this.state = {
        provider: "instant",
        status: READY_STATES.MISSING,
        model: DEFAULT_MODEL,
        task: "chat",
        message: "Ollama bulunamadÄ±. CODEGA AI temel modda hazÄ±r; yerel modeller iÃ§in Ollama kurulmalÄ±.",
        action: "install_ollama",
        actionUrl: OLLAMA_DOWNLOAD_URL,
      };
      return this.getStatus();
    }

    const installed = await this.installedModels();
    const settings = getSettings();
    const configuredModel = settings.defaultModel || settings.model || "";
    const configuredInstalled = isInstalledModel(installed, configuredModel) ? configuredModel : "";
    const installedModel = configuredInstalled || modelCandidates().find((model) => isInstalledModel(installed, model));
    const option = modelOption(installedModel || DEFAULT_MODEL);
    this.state = {
      provider: "ollama",
      status: installedModel ? READY_STATES.READY : READY_STATES.MISSING,
      model: installedModel || DEFAULT_MODEL,
      task: option.task || "chat",
      message: installedModel
        ? "Codega AI hazÄ±r."
        : "Ã–nerilen modeller indirilmeli. Ayarlardan model paketlerini hazÄ±rlayabilirsin.",
    };
    return this.getStatus();
  }

  async getModels() {
    await this.detect();
    const installed = await this.installedModels();
    return {
      installed,
      options: MODEL_OPTIONS.map((model) => ({
        ...model,
        installed: isInstalledModel(installed, model.id),
      })),
      status: this.getStatus(),
    };
  }

  async prepareModel(modelId, onProgress) {
    const target = modelOption(modelId || DEFAULT_MODEL);
    await this.detect();
    if (this.state.provider !== "ollama") {
      return {
        ...this.getStatus(),
        model: target.id,
        message: "Ollama kurulu deÄŸil. Modeli hazÄ±rlamak iÃ§in Ã¶nce Ollama kurulumu aÃ§Ä±lÄ±yor.",
        action: "install_ollama",
        actionUrl: OLLAMA_DOWNLOAD_URL,
      };
    }

    const installed = await this.installedModels();
    if (isInstalledModel(installed, target.id)) {
      this.state = {
        provider: "ollama",
        status: READY_STATES.READY,
        model: target.id,
        task: target.task || "chat",
        message: "Codega AI hazÄ±r.",
      };
      return this.getStatus();
    }

    return this._pullModel(target, onProgress, "indiriliyor");
  }

  async updateModel(modelId, onProgress) {
    const target = modelOption(modelId || DEFAULT_MODEL);
    await this.detect();
    if (this.state.provider !== "ollama") {
      return {
        ...this.getStatus(),
        model: target.id,
        message: "Ollama Ã§alÄ±ÅŸmÄ±yor. Model gÃ¼ncellemesi uygulanamadÄ±.",
        action: "install_ollama",
        actionUrl: OLLAMA_DOWNLOAD_URL,
      };
    }
    return this._pullModel(target, onProgress, "gÃ¼ncelleniyor");
  }

  async _pullModel(target, onProgress, actionLabel) {
    this.state = {
      ...this.state,
      model: target.id,
      task: target.task || "chat",
      status: READY_STATES.CHECKING,
      message: `${target.label} ${actionLabel}`,
      progress: {
        raw: "",
        percent: 0,
        downloadedBytes: null,
        totalBytes: null,
        speedBytesPerSec: null,
      },
    };
    onProgress?.(this.getStatus());

    const result = await this.runOllama(["pull", target.id], {
      timeoutMs: OLLAMA_PULL_TIMEOUT_MS,
      onData: (chunk) => {
        const progress = parsePullProgress(chunk);
        if (!progress) return;
        const percentText = progress.percent !== null ? ` %${Math.round(progress.percent)}` : "";
        this.state = {
          ...this.state,
          message: `${target.label} ${actionLabel}${percentText}`,
          progress,
        };
        onProgress?.(this.getStatus());
      },
    });
    if (!result.ok) {
      this.state = {
        ...this.state,
        status: READY_STATES.ERROR,
        message: result.stderr || result.error || `${target.label} iÅŸlemi tamamlanamadÄ±`,
      };
      return this.getStatus();
    }

    this.state = {
      provider: "ollama",
      status: READY_STATES.READY,
      model: target.id,
      task: target.task || "chat",
      message: "Codega AI hazÄ±r.",
      progress: {
        raw: "completed",
        percent: 100,
        downloadedBytes: null,
        totalBytes: null,
        speedBytesPerSec: null,
      },
    };
    return this.getStatus();
  }

  async prepareDefaultModel(onProgress) {
    return this.prepareModel(DEFAULT_MODEL, onProgress);
  }

  prepareModelInBackground(modelId) {
    const target = modelOption(modelId || DEFAULT_MODEL).id;
    if (this._preparingModels.has(target)) return false;
    this._preparingModels.add(target);
    this.prepareModel(target).catch(() => {}).finally(() => {
      this._preparingModels.delete(target);
    });
    return true;
  }

  // AynÄ± anda gelen mesajlarÄ± SIRAYA al: yerel model tek seferde tek Ã¼retim
  // yapsÄ±n (eÅŸzamanlÄ± istekler kÃ¼Ã§Ã¼k modeli tÄ±kar ve "DÃ¼ÅŸÃ¼nÃ¼yorum"da bÄ±rakÄ±r).
  /** Mevcut Ã¼retimi durdur (kullanÄ±cÄ± tetikli). */
  abortCurrent() {
    if (this._abort) {
      this._aborted = true;
      try { this._abort.abort(); } catch (_e) {}
      return true;
    }
    return false;
  }

  historyFor(chatId) {
    const sessionId = String(chatId || "").trim();
    if (!sessionId) return this.history;
    if (!this.sessionHistories.has(sessionId)) this.sessionHistories.set(sessionId, []);
    return this.sessionHistories.get(sessionId);
  }

  ask(input, opts = {}) {
    // Girdi-katmanı: yerel modelin kendi adını görüp ezberlenmiş "Ben CODEGA AI..."
    // personasına sapmasını önlemek için, modele giden kopyadan asistan adını
    // (hitap konumunda) temizle. Kimlik soruları korunur. Transcript değişmez;
    // yalnızca modele/geçmişe giden metin temizlenir.
    input = sanitizePrompt(input);
    const run = async () => {
      this._activeForeground += 1;
      try {
        // Çok-soruluk (5+) yük testi: küçük modelin devasa tek prompt'ta dejenere
        // olmaması için soruları ardışık paketler halinde gönder (opt-in, varsayılan
        // açık; promptChunking=false ile kapatılır).
        let batch = null;
        try {
          if (getSettings().promptChunking !== false) batch = chunkQuestions(input);
        } catch (_e) {}
        const result = (batch && batch.chunks.length > 1)
          ? await this._askBatched(input, batch, opts)
          : await this._ask(input, opts);
        if (!result || typeof result.text !== "string") return result;
        const taskReport = tde.decomposeTasks(input);
        const cleaned = finalAnswerSanitizer.cleanUserFacingOutput(result.text, input, taskReport);
        // Teşhis: ham model çıktısı ile sanitizer sonrası kıyaslanır. "0.75" gibi
        // çökmelerin kaynağını (model mi, sanitizer mı) kanıtlamak için.
        try {
          if (getSettings().debugLogging) {
            const raw = String(result.text || "");
            const out = cleaned.changed ? String(cleaned.answer || "") : raw;
            const shrunk = raw.length >= 200 && out.length < 40;
            logs[shrunk ? "warn" : "info"]("answer_sanitize",
              `raw_len=${raw.length} clean_len=${out.length} changed=${cleaned.changed} multiQ=${finalAnswerSanitizer.isMultiQuestionInput(input)} rawHead=${raw.slice(0, 80).replace(/\s+/g, " ")}`);
          }
        } catch (_e) {}
        const finalText = cleaned.changed ? String(cleaned.answer || "") : String(result.text || "");
        if (answerAdequacy.isIrrelevantShortAnswer(input, finalText)) {
          try { improveDrafts.recordSignal({ kind: "irrelevant_short_answer", subject: finalText.slice(0, 60) }); } catch (_e) {}
          let msg = answerAdequacy.CONTROLLED_RETRY_MESSAGE;
          // KÖK NEDEN AYRIMI: ağır prompt + kurulu güçlü model yoksa, kullanıcıya
          // "soruyu böl" demek yanıltıcı — asıl sorun model kapasitesi. Gerçek nedeni
          // ve çözümü (daha büyük model indir) söyle. Kurulunca otomatik o modele geçilir.
          try {
            const heavy = answerAdequacy.isLongTechnicalQuestion(input) || finalAnswerSanitizer.isMultiQuestionInput(input);
            if (heavy) {
              const installed = await this.installedModels();
              const strong = strongestInstalledModel(installed);
              if (!strong.model || strong.size < 7) {
                msg = `Bu ağır mühendislik/muhakeme testi, kurulu en güçlü modelin (${strong.model || "yok"}, ~${strong.size || 0}B) kapasitesini aşıyor — ` +
                  `bu yüzden tutarlı bir yanıt üretemiyorum. Model panelinden daha büyük bir model indir ` +
                  `(öneri: qwen2.5:7b-instruct veya llama3.1:8b). Kurulduğunda ağır sorularda otomatik olarak ona geçerim.`;
              }
              try { logs.warn("answer_sanitize", `adequacy blocked; strongest installed=${strong.model || "none"} (${strong.size || 0}B), heavy=${heavy}`); } catch (_e) {}
            }
          } catch (_e) {}
          return { ...result, text: msg };
        }
        return cleaned.changed ? { ...result, text: cleaned.answer } : result;
      } finally {
        this._activeForeground = Math.max(0, this._activeForeground - 1);
      }
    };
    const result = this._queue.then(run, run);
    this._queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  /**
   * BASİT MOD — yalın doğrudan üretim. ACE bağlam şişirme, chunking, model
   * yükseltme, bilişsel doğrulama ve çok-aşamalı pipeline YOK. Yalnızca:
   * system + (son geçmiş) + user → stream. Hızlı ve güvenilir cevap için.
   * Stop butonu için this._abort kurulur. Kuyruğa girmez (renderer zaten seri).
   */
  async askDirect(input, opts = {}) {
    const text0 = sanitizePrompt(String(input || ""));
    const s = getSettings();
    let installed = [];
    try { installed = await this.installedModels(); } catch (_e) { installed = []; }
    const model = s.defaultModel || s.model || chooseModelForTask("chat", installed) || DEFAULT_MODEL;

    const history = this.historyFor(opts.chatId);
    if (history.length === 0) seedConversationHistory(history, opts.history, MAX_HISTORY_MESSAGES);

    // WEB ARAŞTIRMA: "internette ara / şu siteye bak" gibi istekte zayıf yerel model
    // aracı tetikleyemiyor → BİZ araştırırız. Aksi halde "hangi projeyi üretelim?" veya
    // "kod bloğu üretemem" gibi ALAKASIZ cevap dönüyordu.
    const siteAudit = wantsSiteAudit(text0);
    if (wantsWebResearch(text0) || siteAudit) {
      const query = extractResearchQuery(text0, history);
      if (opts.onToken) { try { opts.onToken(siteAudit ? `🔍 Siteyi denetliyorum: "${query}"…\n\n` : `🔎 İnternette araştırıyorum: "${query}"…\n\n`); } catch (_e) {} }
      let research = "";
      try { research = await AGENT_TOOLS.research.fn(query, 3); }
      catch (e) { research = `⚠️ ${e && (e.message || e)}`; }
      if (!/^⚠️|kaynak bulunamad/i.test(research)) {
        // SİTE DENETİMİ: yapılandırılmış artı/eksi çıktısı iste; normal araştırmada özet.
        const summarizePrompt = siteAudit
          ? "Aşağıda incelediğin siteye ait web kaynakları var. YALNIZ bu kaynaklara dayanarak " +
            "yapılandırılmış bir SİTE DENETİMİ yaz — Türkçe, şu başlıklarla:\n" +
            "## Genel Bakış (1-2 cümle: site nedir, kime hitap eder)\n" +
            "## ✅ Artılar (madde madde, kaynağa dayalı güçlü yönler)\n" +
            "## ⚠️ Eksiler (madde madde, kaynağa dayalı zayıf yönler/riskler)\n" +
            "## Öneriler (2-3 somut iyileştirme)\n" +
            "Kaynaklarda olmayan bilgiyi UYDURMA; emin olmadığını belirt. Sonunda kaynak linklerini listele."
          : "Aşağıda internetten TOPLADIĞIN web kaynakları var. Bunları KENDİ SÖZCÜKLERİNLE, Türkçe, " +
            "derli toplu özetle. Kullanıcıya 'sen ara/Google'a bak' ASLA deme — araştırmayı SEN yaptın. " +
            "Önemli noktaları maddele; kaynaklarda yoksa uydurma; sonunda kaynak linklerini listele.";
        const sumMsgs = [
          { role: "system", content: summarizePrompt },
          { role: "user", content: research },
        ];
        let summary = "";
        try { summary = String(await this.generate(model, sumMsgs, [], opts.onToken || null) || "").trim(); } catch (_e) {}
        const out = groundResearchAnswer(query, research, summary || "");
        history.push({ role: "user", content: text0 });
        history.push({ role: "assistant", content: out });
        if (history.length > MAX_HISTORY_MESSAGES) history.splice(0, history.length - MAX_HISTORY_MESSAGES);
        return { text: out, model, source: siteAudit ? "direct_site_audit" : "direct_research" };
      }
      // ARAŞTIRMA İSTENDİ ama BAŞARISIZ: modele düşüp UYDURMASINA izin verme
      // (zayıf model var-olmayan şirket/kaynak icat ediyordu). Dürüst dön.
      const failMsg =
        `"${query}" için internette arama yapamadım veya kaynak bulamadım (ağ bağlantısı ` +
        `ya da erişim engeli olabilir). Bilgiyi UYDURMAM — ağ erişimini kontrol edip tekrar dener misin?`;
      history.push({ role: "user", content: text0 });
      history.push({ role: "assistant", content: failMsg });
      if (history.length > MAX_HISTORY_MESSAGES) history.splice(0, history.length - MAX_HISTORY_MESSAGES);
      return { text: failMsg, model, source: "direct_research_failed" };
    }

    const messages = [
      { role: "system", content:
        "Sen CODEGA AI'sın — otonom bir yazılım mühendisi ajanı. Türkçe, net ve DOĞRUDAN cevap ver. " +
        "Bilgi, araştırma veya genel sorularda (örn. 'X nedir', 'X hakkında bilgi ver', 'şu siteye bak') " +
        "NORMAL, açıklayıcı bir yanıt ver — kod/dosya İSTENMEDİKÇE proje detayı SORMA, 'hangi projeyi " +
        "oluşturalım / hangi dil' gibi geri soru sorma, 'kod bloğu üretemem' deme. " +
        "SADECE kod veya dosya istendiğinde BAHANE ÜRETME: 'sen yapıştır', 'sunucuda şöyle yapılır', " +
        "'npm install …', 'sonraki adımın ne?' gibi savuşturmalar YASAK; istenen ARTEFAKTI doğrudan üret ve " +
        "her dosyayı ```dil yol/dosya.uzanti``` biçiminde, yol/ad belirterek AYRI kod bloklarında ver. " +
        "İNSANİ TON: Robot gibi değil; sıcak, doğal ve samimi bir Türkçe kullan. Kullanıcının niyetini/ruh " +
        "halini kısaca anladığını hissettir, gerektiğinde empati göster ve konuşur gibi yaz — ama yağ çekme, " +
        "gereksiz uzatma, soruyu tekrar etme, konu dışına çıkma." },
      { role: "system", content: REASONING_GUARDRAILS },
    ];
    // BİLİŞSEL HAFIZA: varsa proje/karar/hedef özetini ekle → "falanca sorunu çöz"
    // gibi atıflar bağlamdan çözülür, kullanıcı tekrar anlatmaz.
    const cog = String(opts.cognitiveContext || "").trim();
    if (cog) messages.push({ role: "system", content: cog });
    messages.push(...history.slice(-MAX_HISTORY_MESSAGES));
    messages.push({ role: "user", content: text0 });

    this._abort = new AbortController();
    this._aborted = false;
    let text = "";
    try {
      text = String(await this.generate(model, messages, [], opts.onToken || null) || "").trim();
    } catch (err) {
      if (this._aborted || (err && err.name === "AbortError")) { this._abort = null; throw err; }
      this._abort = null;
      return { text: `Yanıt üretilemedi: ${err && err.message ? err.message : err}. Ollama açık mı, model kurulu mu kontrol et.`, model, source: "direct_error" };
    }
    this._abort = null;

    // ÖZ-DÜZELTME (hatasını anla-düzelt): cevap bozuksa (boş / kendini tekrar /
    // rol karışması) BİR kez düzeltici retry. Ağır pipeline yok — tek ek üretim,
    // yalnız ucuz sezici tetiklerse. Retry akmaz (onToken yok); final metni değişir.
    let source = "direct";
    const q = looksDegenerate(text, text0);
    if (q.bad && !this._aborted) {
      try { logs.info("self_correct", `reason=${q.reason} model=${model}`); } catch (_e) {}
      const retryMsgs = messages.concat([
        { role: "assistant", content: text.slice(0, 300) },
        { role: "user", content:
          "Bu yanıt bozuk (boş, kendini tekrar ediyor ya da konudan koptun). " +
          "Aynı soruyu ŞİMDİ KISA, net, TEK seferde ve TEKRARSIZ yeniden yanıtla. " +
          "Kendinle konuşma; 'benim yanıtım / sizin tarafınız / hangi yolu izliyorsunuz' gibi ifadeler KULLANMA." },
      ]);
      this._abort = new AbortController();
      let retry = "";
      try { retry = String(await this.generate(model, retryMsgs, [], null) || "").trim(); } catch (_e) {}
      this._abort = null;
      if (retry && !looksDegenerate(retry, text0).bad) {
        text = retry; source = "direct_selfcorrected";
      } else if (q.reason !== "empty") {
        // ("empty" hariç: boş üretim aşağıdaki mevcut Ollama mesajıyla yanıtlanır.)
        // Düzeltme de bozuk → ÇÖPÜ AYNEN TESLİM ETME (anayasa: asla kararsız
        // çıktı verme). Dürüst kısa mesaj + somut çıkış yolu öner.
        text = [
          "Ürettiğim yanıt bozuldu (" + (q.reason === "runaway_repetition" ? "kaçak tekrar döngüsü" : q.reason) + ") ve düzeltme denemem de başarısız oldu.",
          "Bozuk çıktıyı olduğu gibi göndermek yerine durdurdum.",
          "",
          "Öneriler:",
          "- Görevi daha küçük parçalara böl (örn. önce yalnızca tablo şeması, sonra sorgular).",
          "- Bu görev yerel modelin sınırlarını aşıyor olabilir: Ayarlar → AI Sağlayıcı'dan daha güçlü bir bulut modeli (örn. Claude) seçip tekrar dene.",
        ].join("\n");
        source = "direct_degenerate_fallback";
      }
    }

    if (!text) text = "Şu an yanıt üretemedim. Ollama'nın açık ve bir modelin kurulu olduğundan emin olup tekrar dener misin?";
    history.push({ role: "user", content: text0 });
    history.push({ role: "assistant", content: text });
    if (history.length > MAX_HISTORY_MESSAGES) history.splice(0, history.length - MAX_HISTORY_MESSAGES);
    return { text, model, source };
  }

  /**
   * Çok-soruluk yük testini ARDIŞIK (sequential) işler: her soru paketini sırayla
   * modele gönderir, akan tokenları aynı onToken üzerinden canlı yayınlar ve tüm
   * metni tek bir tampon (buffer) içinde birleştirir. Paralel YOK (Promise.all
   * yerel donanımı kilitler). Bir paket boş döner veya hata/timeout alırsa, o
   * paketi pas geçip (continue) sıradakine devam eder — tüm akış çökmez.
   *
   * @param {string} input  ham çok-soruluk girdi (log/teşhis için)
   * @param {{chunks:Array,questionCount:number}} batch  chunkQuestions çıktısı
   * @param {object} opts  ask opts (onToken/onProgress/regenerate/...)
   * @returns {Promise<{text:string, source:string, batched:object}>}
   */
  async _askBatched(input, batch, opts = {}) {
    const onToken = typeof opts.onToken === "function" ? opts.onToken : null;
    const emit = (s) => { if (onToken) { try { onToken(s); } catch (_e) {} } };

    try { logs.info("prompt_chunking", `questions=${batch.questionCount} chunks=${batch.chunks.length}`); } catch (_e) {}

    let combined = "";
    let okChunks = 0;
    for (let i = 0; i < batch.chunks.length; i += 1) {
      const chunk = batch.chunks[i];
      const header = `${i > 0 ? "\n\n" : ""}## ${chunk.label}\n\n`;
      emit(header);
      combined += header;
      try {
        // Her paket KENDİ _ask turunu çalıştırır (kendi timeout/abort'u ile). Küçük
        // prompt → model dejenere olmaz. opts.signal varsa iptal yayılır.
        const r = await this._ask(chunk.text, { ...opts, onToken });
        const text = r && typeof r.text === "string" ? r.text.trim() : "";
        if (!text) {
          const note = `_(Bu paket boş döndü, atlandı.)_\n`;
          emit(note);
          combined += note;
          continue;
        }
        if (answerAdequacy.isIrrelevantShortAnswer(chunk.text, text) || answerAdequacy.isIrrelevantShortAnswer(input, text)) {
          const note = `${answerAdequacy.CONTROLLED_RETRY_MESSAGE}\n`;
          emit(note);
          combined += note;
          try { logs.warn("prompt_chunking", `chunk ${i + 1}/${batch.chunks.length} produced irrelevant short answer: ${text.slice(0, 80)}`); } catch (_e) {}
          continue;
        }
        combined += text;
        okChunks += 1;
      } catch (err) {
        // Durdurma (AbortError) üst akışa taşınır; diğer hatalarda fail-safe continue.
        if (err && err.name === "AbortError") throw err;
        const note = `_(Bu paket işlenemedi (${err && err.message ? err.message : err}), sonraki pakete geçiliyor.)_\n`;
        emit(note);
        combined += note;
        try { logs.warn("prompt_chunking", `chunk ${i + 1}/${batch.chunks.length} failed: ${err && err.message ? err.message : err}`); } catch (_e) {}
        continue;
      }
    }

    return { text: combined.trim(), source: "batched", batched: { questionCount: batch.questionCount, chunks: batch.chunks.length, okChunks } };
  }

  async _ask(input, opts = {}) {
    const _t0 = Date.now();
    const fastConversation = isSmallTalk(input);
    const technicalDiagnostic = isTechnicalDiagnostic(input);
    const interactiveSoftwareRequest = isInteractiveSoftwareRequest(input);
    const reasoningCategories = classifyReasoningProblem(input);
    const inputNeedsVerification = shouldVerifyAnswer(input);
    const inputNeedsConclusion = shouldEnforceConclusion(input);
    const inputNeedsMLVC = shouldRunMLVC(input);
    const deepReasoning = getSettings().deepReasoning === true; // aÄŸÄ±r Ã§ok-turlu LLM doÄŸrulamasÄ± (opt-in, varsayÄ±lan KAPALI)
    const cognitiveContextState = cognitiveKernel.createContext(input, {
      flags: {
        deepReasoning,
        inputNeedsConclusion,
        inputNeedsMLVC,
        inputNeedsVerification,
      },
    });
    const cognitiveIntake = cognitiveKernel.runIntake(cognitiveContextState);
    const taskDecomposition = cognitiveIntake.taskReport;
    const inputNeedsCognitivePipeline = !fastConversation && !interactiveSoftwareRequest && deepReasoning && shouldRunCognitivePipeline(input) && !inputNeedsMLVC;
    const requiresHardValidation = shouldRunHardValidation({
      fastConversation: fastConversation || interactiveSoftwareRequest,
      technicalDiagnostic,
      inputNeedsVerification,
      inputNeedsMLVC,
      inputNeedsCognitivePipeline,
      taskDecomposition,
    });
    // AkÄ±ÅŸ yalnÄ±zca (opt-in) biliÅŸsel hat Ã§alÄ±ÅŸÄ±rken kapanÄ±r. Aksi halde cevap token token
    // akar â€” kullanÄ±cÄ± "dÃ¼ÅŸÃ¼nÃ¼yorum"da DONMAZ. DoÄŸrulama/sonuÃ§ turlarÄ± akÄ±ÅŸÄ± engellemez.
    const onToken = inputNeedsCognitivePipeline ? null : (opts.onToken || null);
    // keepAlive: GÃ–RÃœNMEZ heartbeat HER ZAMAN renderer'a gider (iÃ§erik gizliyken bile) ki
    // uzun doÄŸrulama/Ã§ok-gÃ¶rev turlarÄ±nda watchdog (90sn idle) cevabÄ± yarÄ±da KESMESÄ°N.
    const keepAlive = opts.onToken || null;
    const conversationHistory = this.historyFor(opts.chatId);
    // BAĞLAM SÜREKLİLİĞİ (Nirvana kök-neden): sessionHistories bellek-içidir ve
    // yeniden başlatmada boşalır. Renderer kalıcı geçmişi opts.history ile taşır;
    // main'in geçmişi boşsa onunla tohumla → "devam et"/"Konya"/"Ateş Fiat" eski
    // sohbette de bağlamı korur. Yalnız BOŞKEN tohumla (oturum-içi tekrarı önle).
    if (conversationHistory.length === 0) {
      seedConversationHistory(conversationHistory, opts.history, MAX_HISTORY_MESSAGES);
    }
    // Yeniden Ã¼retim: Ã¶nceki turu (user+assistant) geÃ§miÅŸten Ã§Ä±kar ki baÄŸlam tekrarlanmasÄ±n
    if (opts.regenerate) {
      if (conversationHistory.length && conversationHistory[conversationHistory.length - 1].role === "assistant") conversationHistory.pop();
      if (conversationHistory.length && conversationHistory[conversationHistory.length - 1].role === "user") conversationHistory.pop();
    }
    // Ã‡OK-GÃ–REV Ã–NCELÄ°ÄÄ°: girdi birden Ã§ok gÃ¶rev iÃ§eriyorsa, anlÄ±k tek-cevap kÄ±sa-devreleri
    // (instant/benchmark/MLVC) ATLA. Aksi halde MLVC tÃ¼m metni tek soru sanÄ±p "1000 | 2" gibi
    // tek/anonim cevapla kÄ±sa devre yapÄ±p Ã§ok-gÃ¶rev dalÄ±nÄ± HÄ°Ã‡ Ã§alÄ±ÅŸtÄ±rmÄ±yordu (kÃ¶k neden).
    const isMultiTaskInput = taskDecomposition.applicable && taskDecomposition.count >= 2;
    const isInstructionOnlyMainTask = taskDecomposition.instructionOnly && taskDecomposition.mainTask;

    if (isMultiTaskInput) {
      const trustedMultiTask = trustedDeterministicMultiTaskAnswer(taskDecomposition);
      if (trustedMultiTask) {
        return {
          provider: "instant",
          model: "codega-deterministic-multitask",
          text: trustedMultiTask,
        };
      }
    }

    if (!isMultiTaskInput && isInstructionOnlyMainTask) {
      const mainTaskAnswer = rpre.solveMainTask(taskDecomposition.mainTask.problem_text || input);
      if (mainTaskAnswer) {
        return {
          provider: "instant",
          model: "codega-main-task-solver",
          text: mainTaskAnswer,
        };
      }
    }

    const instant = !isMultiTaskInput && instantAnswer(input);
    if (instant) {
      return {
        provider: "instant",
        model: "codega-instant",
        text: instant,
      };
    }
    const benchmarkInstant = !isMultiTaskInput && solveKnownReasoningBenchmarks(input);
    if (benchmarkInstant) {
      return {
        provider: "instant",
        model: "codega-benchmark-reasoner",
        text: benchmarkInstant,
      };
    }
    const mlvcInstant = !isMultiTaskInput && solveDeterministicMathLogic(input);
    if (mlvcInstant) {
      const mlvcMetadata = { deterministic: deterministicCheck(input, mlvcInstant) };
      const interpreted = hril.interpret(input, mlvcInstant, { mlvc: mlvcMetadata });
      const explained = ree.explain(input, interpreted.answer || mlvcInstant);
      return {
        provider: "instant",
        model: "codega-mlvc",
        text: explained.answer || interpreted.answer || mlvcInstant,
      };
    }

    const weatherCity = !isMultiTaskInput && extractWeatherCity(input);
    if (weatherCity) {
      return {
        provider: "tool",
        model: "codega-weather",
        text: await AGENT_TOOLS.weather.fn(weatherCity),
      };
    }

    const settings = getSettings();
    const providerChain = configuredProviderChain(settings);
    const activeProvider = providerChain[0] || settings.provider || "ollama";
    const cloudConfig = configFromSettings(settings, { provider: activeProvider });
    const requestedCloud = cloudProfile(activeProvider);
    const cloudMode = Boolean(requestedCloud && String(cloudConfig.apiKey || "").trim());
    if (requestedCloud && !cloudMode && settings.modelAutoFallback === false) {
      return {
        provider: "instant",
        model: "codega-provider-setup",
        text: `${cloudConfig.label} seÃ§ili ancak API anahtarÄ± yapÄ±landÄ±rÄ±lmamÄ±ÅŸ. Ayarlar > Yapay Zeka bÃ¶lÃ¼mÃ¼nden API anahtarÄ±nÄ± girip baÄŸlantÄ±yÄ± test et.`,
      };
    }

    const task = detectTask(input);
    let attemptModels;
    let selectedModel;

    if (cloudMode) {
      // Bulut: Ollama'ya gerek yok; kullanÄ±cÄ±nÄ±n seÃ§tiÄŸi modeli kullan.
      selectedModel = cloudConfig.model;
      attemptModels = [selectedModel];
      this.state = {
        provider: activeProvider,
        status: READY_STATES.READY,
        model: selectedModel,
        task,
        message: "DÃ¼ÅŸÃ¼nÃ¼yorum...",
      };
    } else {
      if (this.state.provider !== "ollama") {
        await this.detect();
      }
      if (this.state.provider !== "ollama") {
        return {
          provider: "instant",
          model: "codega-setup",
          text: "Yerel zeka motoru hazÄ±r deÄŸil. Ayarlardan kurulumu baÅŸlatÄ±p Ã¶nerilen zeka paketlerini indirebilirsin. (Alternatif: ZekÃ¢ & Model'den bulut saÄŸlayÄ±cÄ± tanÄ±mlayabilirsin.)",
        };
      }

      const installed = await this.installedModels();
      attemptModels = candidateModelsForTask(task, installed);
      // KullanÄ±cÄ±nÄ±n seÃ§tiÄŸi varsayÄ±lan model KURULUYSA en Ã¶ne al â€” Cookbook "VarsayÄ±lan Yap"
      // seÃ§imi gerÃ§ekten etki etsin (aksi halde yalnÄ±z gÃ¶reve gÃ¶re seÃ§iliyordu).
      const nrm = (x) => String(x || "").toLowerCase();
      const userDefault = settings.defaultModel || settings.model || "";
      if (userDefault) {
        const isInst = installed.some((x) => nrm(x) === nrm(userDefault) || nrm(x) === `${nrm(userDefault)}:latest`);
        if (isInst) attemptModels = [userDefault, ...attemptModels.filter((m) => nrm(m) !== nrm(userDefault))];
      }

      // OTOMATİK MODEL YÜKSELTME: ağır/uzun/çok-soru promptlarda küçük varsayılan
      // (örn. 4B) dejenere olabiliyor. Kurulu daha güçlü bir model (örn. 9B) varsa
      // bu tür promptlarda onu öne al — küçük model hızı hafif işler için korunur.
      // settings.autoModelEscalation=false ile kapatılır.
      try {
        const routed = prioritizeStrongModelForHeavyPrompt(input, installed, attemptModels, settings);
        attemptModels = routed.attemptModels;
        if (routed.escalated) {
          try { logs.info("model_route", `heavy prompt → ${routed.model} (${routed.size}B > ${routed.previousSize}B) seçildi`); } catch (_e) {}
        }
      } catch (_e) {}

      attemptModels = attemptModels.slice(0, 4);
      selectedModel = attemptModels[0] || chooseModelForTask(task, installed);
      if (!attemptModels.length) {
        const started = this.prepareModelInBackground(selectedModel);
        this.state = {
          provider: "ollama",
          status: READY_STATES.CHECKING,
          model: selectedModel,
          task,
          message: `${selectedModel} arka planda hazÄ±rlanÄ±yor.`,
        };
        return {
          provider: "instant",
          model: "codega-model-router",
          text: missingModelReply(task, selectedModel, started),
        };
      }

      this.state = {
        provider: "ollama",
        status: READY_STATES.READY,
        model: selectedModel,
        task,
        message: "DÃ¼ÅŸÃ¼nÃ¼yorum...",
      };
    }

    // Otonom Ã¶ÄŸrenme: kullanÄ±cÄ± hakkÄ±nda hatÄ±rladÄ±klarÄ±nÄ± system prompt'a kat
    const memory = settings.autonomousLearning && !fastConversation ? recall(input, 4) : [];

    // RAG: eklenen dokÃ¼man/bilgi tabanÄ±ndan alakalÄ± parÃ§alarÄ± getir
    let ragContext = [];
    if (settings.ragEnabled && !fastConversation) {
      try {
        const hits = await rag.search(input, 4);
        ragContext = hits.map((h) => `[${h.title}] ${h.text}`);
      } catch (_e) {
        ragContext = [];
      }
    }

    // Otonom Ã¶ÄŸrenmeyle toplanan bilgiyi cevaba kat ("kÃ¶r olma" / hÄ±zlandÄ±r)
    let learnedContext = [];
    if (!fastConversation && (settings.continuousLearning || settings.autonomousLearning)) {
      try {
        let hits = [];
        if (settings.semanticSearch) {
          const emb = require("./agent/embeddings");
          const qv = await emb.embed(input, { model: settings.embedModel || emb.DEFAULT_EMBED_MODEL });
          if (qv) hits = learningStore.searchSemantic(qv, 3);
        }
        if (!hits.length) hits = learningStore.searchLearned(input, 3); // anlamsal yoksa anahtar-kelime
        learnedContext = hits.map((n) => `[${n.source}] ${n.topic}: ${n.text}${n.url ? ` (${n.url})` : ""}`);
      } catch (_e) {
        learnedContext = [];
      }
    }

    // Hedef-odaklÄ± planlama (opt-in): karmaÅŸÄ±k hedefi alt adÄ±mlara bÃ¶l
    const cognitivePreflight = inputNeedsCognitivePipeline
      ? await runCognitivePreflight(
        input,
        (msgs) => this.generate(selectedModel, msgs, attemptModels),
        { cycles: 2 }
      )
      : { ok: true, skipped: true, report: null, context: "" };
    const cognitiveContext = cognitivePreflight.context || "";

    let plan = [];
    if (interactiveSoftwareRequest && settings.planner) {
      plan = softwareDeliveryPlan(input);
      try {
        opts.onProgress?.({
          stage: "reasoning",
          scope: "answer",
          text: "Istek analiz edildi; mimari ve uygulama plani hazirlaniyor.",
        });
      } catch (_e) {}
    } else if (!fastConversation && settings.planner && looksLikeGoal(input)) {
      try {
        const plannerInput = cognitiveContext
          ? `${cognitiveContext}\n\nOriginal user request:\n${input}`
          : input;
        plan = await makePlan(plannerInput, (msgs) => this.generate(selectedModel, msgs));
      } catch (_e) {
        plan = [];
      }
    }

    // Mesaj dizisi: system (karakter + hafÄ±za + RAG + plan + araÃ§ protokolÃ¼) + geÃ§miÅŸ + kullanÄ±cÄ±
    const messages = [
      {
        role: "system",
        content: buildSystemPrompt(task, {
          memory,
          humanTone: settings.humanTone,
          ragContext,
          plan,
          expertPersona: experts.personaFor(settings.expertMode),
          projectContext: opts.context || "",
          learnedContext,
        }),
      },
      ...(cognitiveIntake.messages || []),
      ...(cognitiveContext ? [{ role: "system", content: cognitiveContext }] : []),
      ...conversationHistory,
      { role: "user", content: input },
    ];

    const generateFn = (msgs) => this.generate(selectedModel, msgs, attemptModels);

    // Durdurulabilirlik: bu Ã¼retim turu iÃ§in yeni bir abort kontrolcÃ¼sÃ¼
    this._abort = new AbortController();
    this._aborted = false;

    let agent;
    try {
      if (!cloudMode && wantsWebResearch(input)) {
        // ZORUNLU ARAÅTIRMA: zayÄ±f yerel model aracÄ± tetikleyemiyor â†’ biz Ã§alÄ±ÅŸtÄ±rÄ±rÄ±z.
        // KullanÄ±cÄ±ya "sen Google'a bak" DEMEK yerine gerÃ§ekten arar ve Ã¶zetleriz.
        const query = extractResearchQuery(input, conversationHistory);
        if (onToken) onToken(`ğŸ” Ä°nternette araÅŸtÄ±rÄ±yorum: "${query}"â€¦\n\n`);
        let research = "";
        try {
          research = await AGENT_TOOLS.research.fn(query, 3);
        } catch (e) {
          research = `âš ï¸ ${e && (e.message || e)}`;
        }
        if (/^âš ï¸|kaynak bulunamadÄ±/i.test(research)) {
          agent = {
            content:
              `Ä°nternet aramasÄ± yapamadÄ±m ya da kaynak bulunamadÄ± (internet baÄŸlantÄ±sÄ± veya eriÅŸim engeli olabilir). ` +
              `AradÄ±ÄŸÄ±m konu: "${query}". Ollama/aÄŸ eriÅŸimini kontrol edip tekrar deneyebilirsin.`,
            iterations: 0, stoppedReason: "research_failed", toolCalls: [{ name: "research", result: research }],
          };
        } else {
          const sumMsgs = [
            {
              role: "system",
              content:
                "AÅŸaÄŸÄ±da internetten TOPLADIÄIN web kaynaklarÄ± var. BunlarÄ± KENDÄ° SÃ–ZCÃœKLERÄ°NLE, TÃ¼rkÃ§e, " +
                "derli toplu Ã¶zetle. KullanÄ±cÄ±ya 'sen ara/Google'a bak' ASLA deme â€” araÅŸtÄ±rmayÄ± SEN yaptÄ±n. " +
                "Ã–nemli noktalarÄ± maddele, varsa Ã§eliÅŸkileri belirt ve sonunda kaynak linklerini listele. " +
                "Kaynaklarda yoksa uydurma; bilmiyorsan sÃ¶yle.",
            },
            { role: "user", content: research },
          ];
          const summary = await this.generate(selectedModel, sumMsgs, attemptModels, onToken);
          agent = {
            content: groundResearchAnswer(query, research, summary || ""),
            iterations: 1, stoppedReason: "final_answer",
            toolCalls: [{ name: "research", result: research }],
          };
        }
      } else if (!cloudMode && taskDecomposition.applicable && taskDecomposition.count >= 2) {
        // Ã‡OK-GÃ–REV: zayÄ±f yerel model 5 gÃ¶revi tek seferde Ã§Ã¶zemiyordu (1 cevap dÃ¶nÃ¼yordu).
        // Her gÃ¶revi BAÄIMSIZ Ã§Ã¶z, task_results[]'e doldur, finali TÃœM diziden kur.
        const detectedTasks = taskDecomposition.tasks;
        const taskResults = [];
        const progress = makeVerificationProgress(opts.onProgress, "multi_task", keepAlive);
        try {
        for (let i = 0; i < detectedTasks.length; i++) {
          const t = detectedTasks[i];
          // SÄ±nÄ±r bÃ¼tÃ¼nlÃ¼ÄŸÃ¼: gÃ¶vdeyi hash'le; Ã¼retim Ã¶ncesi/sonrasÄ± gÃ¶vde DEÄÄ°ÅMEMELÄ°.
          const bodyHash = hashTaskBody(t.body);
          progress.emit("reasoning", { attempt: 0, reason: t.label || `task-${i + 1}` });
          // GÃ–RÃœNÃœR ilerleme: kullanÄ±cÄ± boÅŸ/donmuÅŸ ekran gÃ¶rmesin (final cevap bunlarÄ± deÄŸiÅŸtirir).
          if (opts.onProgress) {
            try {
              opts.onProgress({
                stage: "reasoning",
                scope: "multi_task",
                text: `${t.label || `GÃ¶rev ${i + 1}`} Ã§Ã¶zÃ¼lÃ¼yor (${i + 1}/${detectedTasks.length})`,
              });
            } catch (_e) {}
          }
          const taskFactLock = factLock.extractFacts(t.body);
          const tMsgs = [
            {
              role: "system",
              content:
                "Sana TEK bir gÃ¶rev verilecek. SADECE bu gÃ¶revi Ã§Ã¶z. AdÄ±m adÄ±m, kÄ±sa ve net dÃ¼ÅŸÃ¼n; " +
                "sonunda mutlaka 'Cevap: â€¦' satÄ±rÄ± yaz. BaÅŸka gÃ¶revlere deÄŸinme, soruyu tekrar etme.",
            },
            ...(taskFactLock.applicable ? [{ role: "system", content: factLock.formatFactLockContext(taskFactLock) }] : []),
            { role: "user", content: t.body },
          ];
          let aTxt = deterministicTaskAnswer(t.body);
          const trustedDeterministic = Boolean(aTxt);
          if (!aTxt) {
            try {
              // Multi-task answers are verified before display; do not stream raw per-task drafts.
              aTxt = String(await this.generate(selectedModel, tMsgs, attemptModels) || "").trim();
            } catch (_e) { aTxt = ""; }
          }
          aTxt = collapseRunawayTaskAnswer(aTxt);
          if (!trustedDeterministic) {
            // GÃ¶rev baÅŸÄ±na ucuz deterministik dÃ¼zeltme (oran/denklem/matematik)
            try {
              const rp = rpre.verify(t.body, aTxt);
              if (rp.applicable && rp.status === "REJECTED" && rp.correctedAnswer) aTxt = rp.correctedAnswer;
              const eb = ebse.verify(t.body, aTxt);
              if (eb.applicable && eb.status === "REJECTED" && eb.correctedAnswer) aTxt = eb.correctedAnswer;
            } catch (_e) { /* doÄŸrulama gÃ¶revi dÃ¼ÅŸÃ¼rmesin */ }
          }
          if (!aTxt) aTxt = "(bu gÃ¶rev iÃ§in yanÄ±t Ã¼retilemedi)";
          // Sonucu diziye PUSH et â€” Ã¶nceki sonuÃ§larÄ±n Ã¼zerine YAZMA
          try {
            // HÄ±z: deepReasoning KAPALIYSA model-tabanlÄ± AVE/regen ATLANIR; yalnÄ±z deterministik
            // doÄŸrulayÄ±cÄ±lar (RPRE/EBSE/MLVC/TCNIS/SACV) Ã§alÄ±ÅŸÄ±r â†’ 4 gÃ¶rev saniyelerde biter.
            // deepReasoning AÃ‡IKSA tam (model destekli) doÄŸrulama + 1 regen.
            const verifyGen = deepReasoning && !trustedDeterministic
              ? ((msgs) => this.generate(selectedModel, msgs, attemptModels))
              : null;
            const verified = await finalizeTaskLocalAnswer(
              t,
              aTxt,
              verifyGen,
              {
                progress,
                trustedDeterministic,
                regenerationState: { attempts: 0, max: deepReasoning && !trustedDeterministic ? 1 : 0 },
              }
            );
            aTxt = verified.answer || aTxt;
            if (!verified.ok) {
              try { improveDrafts.recordSignal({ kind: "multi_task_local_gate", subject: `${t.label}: ${(verified.errors || [])[0] || "failed"}` }); } catch (_e) {}
            }
          } catch (e) {
            const message = e && e.message ? e.message : "task-local verification failed";
            aTxt = `YanÄ±t doÄŸrulama kapÄ±sÄ±ndan geÃ§medi.\nBloke eden gÃ¶rev: ${t.label}. ${message}\n\nFinal Answer: YanÄ±t gÃ¼venli ÅŸekilde doÄŸrulanamadÄ±.`;
            try { improveDrafts.recordSignal({ kind: "multi_task_local_gate_error", subject: `${t.label}: ${message}` }); } catch (_e) {}
          }
          // SINIR BÃœTÃœNLÃœÄÃœ: gÃ¶vde deÄŸiÅŸmemeli + cevapta "id+token" birleÅŸmesi (29x) olmamalÄ±.
          if (hashTaskBody(t.body) !== bodyHash) {
            try { logs.error("TASK_BOUNDARY_CORRUPTION", `${t.label}: task body mutated during reasoning`); } catch (_e) {}
          }
          const leakFix = repairTaskBoundaryLeak(t, aTxt);
          if (leakFix.changed) {
            aTxt = leakFix.answer;
            try { logs.warn("TASK_BOUNDARY_CORRUPTION", `${t.label}: neighbor token leak fixed (${leakFix.leaks.join(", ")})`); } catch (_e) {}
          }
          taskResults.push({ label: t.label, answer: aTxt });
        }
        // Final yanÄ±t TÃœM task_results dizisinden kurulur (yalnÄ±z son/aktif gÃ¶rev deÄŸil)
        } finally {
          progress.stop();
        }
        const assembled = taskResults.map((r) => `**${r.label}**\n${r.answer}`).join("\n\n");
        const complete = taskResults.length === detectedTasks.length;
        agent = {
          content: complete
            ? assembled
            : `${assembled}\n\nâš ï¸ ${detectedTasks.length} gÃ¶rev algÄ±landÄ± ama ${taskResults.length} tanesi yanÄ±tlandÄ±.`,
          iterations: detectedTasks.length,
          stoppedReason: "multi_task",
          toolCalls: [],
        };
      } else if (fastConversation) {
        // Basit selam/sohbet: araÃ§sÄ±z, kÄ±sa, doÄŸrudan cevap (ajan saÃ§malamasÄ±n)
        const sttMsgs = [
          { role: "system", content: smallTalkPrompt(settings.humanTone) },
          ...conversationHistory.slice(-4),
          { role: "user", content: input },
        ];
        const direct = await this.generate(selectedModel, sttMsgs, attemptModels, onToken);
        agent = { content: direct, iterations: 0, stoppedReason: "smalltalk", toolCalls: [] };
      } else if (shouldUseMultiAgent(settings, input) && looksLikeGoal(input)) {
        // Multi-agent: orchestrator â†’ uzman ajanlar â†’ denetÃ§i sentezi
        const gen = (msgs) => this.generate(selectedModel, msgs);
        const orch = await runOrchestrated(input, {
          makePlan: (g) => makePlan(g, gen),
          routeStep,
          runSpecialist: async (key, taskText, g) => {
            const msgs = [
              { role: "system", content: buildSpecialistPrompt(key, g) },
              { role: "user", content: taskText },
            ];
            const r = await runReact(msgs, gen, {
              maxIters: 2,
              allowedTools: (SPECIALISTS[key] || SPECIALISTS.generalist).tools,
            });
            return r.content;
          },
          synthesize: async (g, stepResults) => {
            const joined = stepResults
              .map((r, i) => `AdÄ±m ${i + 1} (${r.specialist}): ${r.output}`)
              .join("\n\n");
            const msgs = [
              {
                role: "system",
                content:
                  buildSpecialistPrompt("reviewer", g) +
                  "\nTÃ¼m adÄ±m Ã§Ä±ktÄ±larÄ±nÄ± birleÅŸtirip kullanÄ±cÄ±ya tek, net bir final cevap yaz.",
              },
              {
                role: "user",
                content: `Hedef: ${g}\n\nAdÄ±m Ã§Ä±ktÄ±larÄ±:\n${joined}\n\nFinal cevabÄ± yaz.`,
              },
            ];
            return await gen(msgs);
          },
        });
        agent = {
          content: orch.content,
          iterations: orch.plan.length,
          stoppedReason: "final_answer",
          toolCalls: [],
        };
      } else {
        // VarsayÄ±lan yol: cevabÄ± akÄ±ÅŸlÄ± Ã¼ret (token token). AkÄ±ÅŸ bozulursa generate
        // kendi iÃ§inde bloklayÄ±cÄ± moda/CLI'ye dÃ¼ÅŸer; dÃ¶nÃ¼ÅŸ deÄŸeri yine otorite.
        const streamFn = (msgs) => this.generate(selectedModel, msgs, attemptModels, onToken);
        agent = await runReact(messages, streamFn, { maxIters: 3 });
      }
    } catch (e) {
      if (this._aborted || (e && e.name === "AbortError")) {
        this._abort = null;
        this.state = { ...this.state, status: READY_STATES.READY, message: "Durduruldu" };
        return {
          provider: this.state.provider || "ollama",
          model: selectedModel,
          text: "â¹ï¸ Ãœretim durduruldu.",
        };
      }
      if (e && e.name === "TimeoutError") {
        this._abort = null;
        this.state = { ...this.state, status: READY_STATES.READY, message: "Zaman asimi" };
        return {
          provider: "instant",
          model: "codega-timeout",
          text: "Yanit 30 saniye icinde gelmedi; istegi guvenli sekilde durdurdum. Daha hafif model secebilir veya tekrar deneyebilirsin.",
        };
      }
      this.state = {
        ...this.state,
        status: READY_STATES.ERROR,
        message: (e && e.message) || "Ajan hatasÄ±",
      };
      return {
        provider: "instant",
        model: "codega-error",
        text: "Yerel zeka motoru ÅŸu an yanÄ±t Ã¼retemedi. Ollama aÃ§Ä±k mÄ± ve model indirildi mi diye kontrol edebilirsin.",
      };
    }

    const text = String(agent.content || "").trim();
    // KullanÄ±cÄ± durdurduysa: o ana dek Ã¼retilen kÄ±smÄ± (varsa) dÃ¶ndÃ¼r, yoksa not dÃ¼ÅŸ
    if (this._aborted) {
      this._abort = null;
      this.state = { ...this.state, status: READY_STATES.READY, message: "Durduruldu" };
      return {
        provider: this.state.provider || "ollama",
        model: selectedModel,
        text: text ? `${text}\n\nâ¹ï¸ (durduruldu)` : "â¹ï¸ Ãœretim durduruldu.",
      };
    }
    // Kendini gÃ¶zlemleme: araÃ§ hatalarÄ±nÄ± Ã¶neri taslaÄŸÄ± iÃ§in say (yerel, gÃ¶nderilmez)
    try {
      for (const tc of agent.toolCalls || []) {
        if (typeof tc.result === "string" && /âš ï¸\s*AraÃ§ hatasÄ±|not_allowed/.test(tc.result)) {
          improveDrafts.recordSignal({ kind: "tool_error", subject: tc.name });
        }
      }
    } catch (_e) { /* gÃ¶zlem hatasÄ± akÄ±ÅŸÄ± bozmasÄ±n */ }
    if (!text || agent.stoppedReason === "error") {
      try { improveDrafts.recordSignal({ kind: "empty_response" }); } catch (_e) {}
      this.state = {
        ...this.state,
        status: READY_STATES.READY,
        message: text ? "HazÄ±r" : "YanÄ±t boÅŸ dÃ¶ndÃ¼",
      };
      return {
        provider: "instant",
        model: "codega-empty",
        text:
          text ||
          "YanÄ±t Ã¼retemedim. Ollama servisi aÃ§Ä±k mÄ± ve ilgili model indirildi mi diye kontrol edebilirsin.",
      };
    }

    // Ã–z deÄŸerlendirme (opt-in): cevabÄ± denetle, gerekiyorsa dÃ¼zelt
    let finalText = text;
    const finalProgress = requiresHardValidation && agent.stoppedReason !== "smalltalk" && agent.stoppedReason !== "multi_task"
      ? makeVerificationProgress(opts.onProgress, "final_answer", keepAlive)
      : null;
    const applyCorrection = (candidate, source) => {
      const check = cvl.validateCorrection(input, finalText, candidate, { source });
      if (!check.accepted) {
        try { improveDrafts.recordSignal({ kind: "cvl_reject", subject: check.errors[0] || source }); } catch (_e) {}
        return false;
      }
      finalText = check.answer;
      return true;
    };
    // multi_task: etiketli gÃ¶rev birleÅŸtirmesi (GÃ¶rev N: cevap) korunmalÄ±. AÅŸaÄŸÄ±daki
    // dÃ¶nÃ¼ÅŸtÃ¼rÃ¼cÃ¼ motorlar (HRIL/REE/sanitizer/kernel) "Final Answer" Ã§Ä±karÄ±p etiketleri
    // silebiliyor ("2 | 12" gibi anonim Ã§Ä±ktÄ±). Bu modda onlarÄ± atlar, sonda geri yÃ¼kleriz.
    const isMultiTask = agent.stoppedReason === "multi_task";
    const multiTaskAssembled = isMultiTask ? agent.content : "";
    if (settings.selfReflection && !interactiveSoftwareRequest && !inputNeedsCognitivePipeline && agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        finalProgress?.emit?.("verifying", { reason: "self-reflection" });
        const r = await reflect(input, text, (msgs) => this.generate(selectedModel, msgs));
        if (r.answer && r.answer.trim()) applyCorrection(r.answer.trim(), "reflect");
      } catch (_e) {
        // denetim hatasÄ± cevabÄ± etkilemesin
      }
    }

    // Ã‡ok-turlu hafÄ±za: kullanÄ±cÄ± + final cevabÄ± sakla (araÃ§ gÃ¶zlemleri hariÃ§)
    if (inputNeedsCognitivePipeline && agent.stoppedReason !== "smalltalk") {
      try {
        finalProgress?.emit?.("verifying", { reason: "adversarial-review" });
        const review = await runAdversarialReview(
          input,
          finalText,
          cognitivePreflight.report,
          (msgs) => this.generate(selectedModel, msgs, attemptModels)
        );
        if (review.answer && review.answer.trim()) applyCorrection(review.answer.trim(), "adversarial-review");
        if (!review.ok && review.errors && review.errors.length) {
          try { improveDrafts.recordSignal({ kind: "cognitive_review", subject: review.errors[0] }); } catch (_e) {}
        }
      } catch (_e) {
        // adversarial/self-critic hatasi cevabi bozmasin
      }
    }

    // RPRE (Ratio & Proportion Reasoning Engine): DETERMÄ°NÄ°STÄ°K pay modeli â€” EBSE'den Ã–NCE.
    // Oran/orantÄ±/"katÄ±" sorularÄ±nda toplamÄ± doÄŸrudan orana bÃ¶lme hatasÄ±nÄ± yakalar; yanlÄ±ÅŸsa
    // pay modeliyle yeniden Ã§Ã¶zer. Model Ã§aÄŸrÄ±sÄ± YOK.
    // (multi_task: her gÃ¶rev zaten ayrÄ± doÄŸrulandÄ±; tÃ¼m-metne uygulanÄ±rsa gÃ¶revler arasÄ±
    //  sayÄ±larÄ± karÄ±ÅŸtÄ±rÄ±p cevabÄ± bozabilir â†’ atla.)
    if (agent.stoppedReason !== "smalltalk" && agent.stoppedReason !== "multi_task") {
      try {
        finalProgress?.emit?.("verifying", { reason: "rpre" });
        const rp = rpre.verify(input, finalText);
        if (rp.applicable && rp.status === "REJECTED" && rp.correctedAnswer) {
          if (applyCorrection(rp.correctedAnswer, "rpre")) {
            try { improveDrafts.recordSignal({ kind: "rpre_reject", subject: (rp.checks.find((c) => !c.ok) || {}).name || "ratio_parts" }); } catch (_e) {}
          }
        }
      } catch (_e) { /* RPRE hatasÄ± cevabÄ± bozmasÄ±n */ }
    }

    // EBSE (Equation Back-Substitution Engine): DETERMÄ°NÄ°STÄ°K geri-yerine-koyma.
    // Self Critic -> [EBSE] -> MLVC -> AVE -> MCE. Model Ã§aÄŸrÄ±sÄ± YOK (hÄ±zlÄ±, her zaman aÃ§Ä±k).
    // TÃ¼retilen deÄŸerleri orijinal denklemlere koyar; geÃ§mezse cevabÄ± reddedip YENÄ°DEN hesaplar.
    if (agent.stoppedReason !== "smalltalk" && agent.stoppedReason !== "multi_task") {
      try {
        finalProgress?.emit?.("verifying", { reason: "ebse" });
        const eb = ebse.verify(input, finalText);
        if (eb.applicable && eb.status === "REJECTED" && eb.correctedAnswer) {
          if (applyCorrection(eb.correctedAnswer, "ebse")) {
            try { improveDrafts.recordSignal({ kind: "ebse_reject", subject: (eb.checks.find((c) => !c.ok) || {}).name || "back_substitution" }); } catch (_e) {}
          }
        }
      } catch (_e) { /* EBSE hatasÄ± cevabÄ± bozmasÄ±n */ }
    }

    let mlvcApproved = false;
    let mlvcMetadata = null;
    if (inputNeedsVerification && agent.stoppedReason !== "smalltalk" && agent.stoppedReason !== "multi_task") {
      try {
        if (inputNeedsMLVC) {
          finalProgress?.emit?.("verifying", { reason: "mlvc" });
          // deep KAPALI: yalnÄ±z deterministik kontrol (model Ã§aÄŸrÄ±sÄ± yok) â†’ hÄ±zlÄ±, donmaz.
          // deep AÃ‡IK: ek olarak LLM doÄŸrulama turu.
          const mlvc = await verifyMathLogic(
            input,
            finalText,
            deepReasoning ? (msgs) => this.generate(selectedModel, msgs, attemptModels) : null,
            { passes: 1 }
          );
          if (mlvc.answer && mlvc.answer.trim()) applyCorrection(mlvc.answer.trim(), "mlvc");
          mlvcMetadata = mlvc;
          mlvcApproved = !!mlvc.approved;
          if (!mlvc.approved && mlvc.errors && mlvc.errors.length) {
            try { improveDrafts.recordSignal({ kind: "mlvc", subject: mlvc.errors[0] }); } catch (_e) {}
          }
        }
        if (deepReasoning && !mlvcApproved) {
          finalProgress?.emit?.("verifying", { reason: "ave" });
          const v = await verifyAnswer(
            input,
            finalText,
            (msgs) => this.generate(selectedModel, msgs, attemptModels),
            { categories: reasoningCategories, passes: 1 }
          );
          if (v.answer && v.answer.trim()) applyCorrection(v.answer.trim(), "ave");
        }
      } catch (_e) {
        // reasoning dogrulama hatasi cevabi bozmasin
      }
    }

    if (requiresHardValidation && agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        finalProgress?.emit?.("verifying", { reason: "benchmark-repair" });
        const repaired = repairBenchmarkAnswer(input, finalText);
        if (repaired.repaired && repaired.answer && repaired.answer.trim()) applyCorrection(repaired.answer.trim(), "benchmark-repair");
      } catch (_e) {
        // deterministic benchmark repair must not break chat
      }
    }

    // HRIL (Human Reasoning & Interpretation Layer): matematiksel olarak doÄŸru sonucu
    // insanÄ±n hemen anlayacaÄŸÄ± karÅŸÄ±lÄ±ÄŸa Ã§evirir (Ã¶rn. 7/15 -> %46,67; 0.5 saat -> 30 dk).
    if (requiresHardValidation && agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        finalProgress?.emit?.("finalizing", { reason: "hril" });
        const interpreted = hril.interpret(input, finalText, { mlvc: mlvcMetadata });
        if (interpreted.answer && interpreted.answer.trim()) applyCorrection(interpreted.answer.trim(), "hril");
      } catch (_e) {
        // yorum katmanÄ± cevabÄ± bozmasÄ±n
      }
    }

    // REE (Reasoning -> Explanation Engine): doÄŸrulanmÄ±ÅŸ/yorumlanmÄ±ÅŸ sonucu kÄ±sa,
    // anlaÅŸÄ±lÄ±r aÃ§Ä±klama yapÄ±sÄ±na Ã§evirir; sonucu deÄŸiÅŸtirmez.
    if (requiresHardValidation && agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        finalProgress?.emit?.("finalizing", { reason: "ree" });
        const explained = ree.explain(input, finalText);
        if (explained.answer && explained.answer.trim()) applyCorrection(explained.answer.trim(), "ree");
      } catch (_e) {
        // aÃ§Ä±klama katmanÄ± cevabÄ± bozmasÄ±n
      }
    }

    // TDE completion gate: multi-part prompts must visibly complete every detected task.
    if (agent.stoppedReason !== "smalltalk" && taskDecomposition.applicable) {
      try {
        finalProgress?.emit?.("verifying", { reason: "tde-coverage" });
        let coverage = tde.validateTaskCoverage(finalText, taskDecomposition);
        if (!coverage.ok) {
          try { improveDrafts.recordSignal({ kind: "tde_missing_tasks", subject: coverage.missing.map((t) => t.label).join(", ") }); } catch (_e) {}
          const repaired = await this.generate(
            selectedModel,
            tde.buildCoverageRepairMessages(input, finalText, taskDecomposition, coverage),
            attemptModels
          );
          if (repaired && String(repaired).trim()) {
            applyCorrection(String(repaired).trim(), "tde-coverage-repair");
            const interpreted = hril.interpret(input, finalText, { mlvc: mlvcMetadata });
            if (interpreted.answer && interpreted.answer.trim()) applyCorrection(interpreted.answer.trim(), "hril-after-tde");
            const explained = ree.explain(input, finalText);
            if (explained.answer && explained.answer.trim()) applyCorrection(explained.answer.trim(), "ree-after-tde");
          }
          coverage = tde.validateTaskCoverage(finalText, taskDecomposition);
          if (!coverage.ok) {
            finalText = `${finalText}\n\nGÃ¶rev Tamamlama UyarÄ±sÄ±: ${taskDecomposition.count} gÃ¶revden ${coverage.completed.length} tanesi gÃ¶rÃ¼nÃ¼r biÃ§imde tamamlandÄ±; eksik kalanlar: ${coverage.missing.map((t) => t.label).join(", ")}.`;
          }
        }
      } catch (_e) {
        // TDE must not crash chat.
      }
    }

    // Final Answer hard gate:
    // 1) soru metni Final Answer iÃ§ine giremez
    // 2) her tespit edilen gÃ¶rev Final Answer iÃ§inde tam bir kez cevaplanmalÄ±
    if (requiresHardValidation && agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        finalProgress?.emit?.("verifying", { reason: "final-answer-sanitizer" });
        let finalCheck = finalAnswerSanitizer.validateFinalAnswer(finalText, input, taskDecomposition);
        if (finalCheck.cleanedAnswer) {
          applyCorrection(finalCheck.cleanedAnswer, "output-cleaner");
          finalCheck = finalAnswerSanitizer.validateFinalAnswer(finalText, input, taskDecomposition);
        }
        if (!finalCheck.ok) {
          try { improveDrafts.recordSignal({ kind: "final_answer_sanitizer", subject: finalCheck.errors[0] }); } catch (_e) {}
          const repaired = await this.generate(
            selectedModel,
            finalAnswerSanitizer.buildFinalAnswerRepairMessages(input, finalText, taskDecomposition, finalCheck),
            attemptModels
          );
          if (repaired && String(repaired).trim()) applyCorrection(String(repaired).trim(), "final-answer-sanitizer");
          finalCheck = finalAnswerSanitizer.validateFinalAnswer(finalText, input, taskDecomposition);
          if (finalCheck.cleanedAnswer) {
            applyCorrection(finalCheck.cleanedAnswer, "output-cleaner-after-repair");
            finalCheck = finalAnswerSanitizer.validateFinalAnswer(finalText, input, taskDecomposition);
          }
          if (!finalCheck.ok) {
            try { logs.warn("verification", `final answer sanitizer warning: ${finalCheck.errors.join(" ")}`); } catch (_e) {}
          }
        }
      } catch (_e) {
        // final sanitizer must not crash chat
      }
    }

    if (deepReasoning && inputNeedsConclusion && agent.stoppedReason !== "smalltalk") {
      try {
        finalProgress?.emit?.("finalizing", { reason: "mce" });
        const c = await enforceConclusion(
          input,
          finalText,
          (msgs) => this.generate(selectedModel, msgs, attemptModels)
        );
        if (c.answer && c.answer.trim()) applyCorrection(c.answer.trim(), "mce");
      } catch (_e) {
        // sonuc kapisi hatasi cevabi bozmasin
      }
    }

    // The hard verification kernel is reserved for tasks that actually need structured
    // verification. Ordinary conversation and low-risk factual replies must not be
    // rejected merely because they do not contain an internal "Final Answer:" section.
    const preGateText = finalText;
    let hardGateBlocked = false;
    if (requiresHardValidation && agent.stoppedReason !== "smalltalk") {
      try {
        finalProgress?.emit?.("verifying", { reason: "hard-gate" });
        const post = await cognitiveKernel.runPostValidation(cognitiveContextState, finalText, {
          stoppedReason: agent.stoppedReason,
          needsVerification: inputNeedsVerification,
          needsMLVC: inputNeedsMLVC,
          mlvc: mlvcMetadata,
          needsConclusion: inputNeedsConclusion,
          deepReasoning,
          reasoningCategories,
          generate: (msgs) => this.generate(selectedModel, msgs, attemptModels),
          onSignal: (signal) => {
            try { improveDrafts.recordSignal(signal); } catch (_e) {}
          },
        });
        if (post.answer && String(post.answer).trim()) finalText = String(post.answer).trim();
        if (!post.ok) {
          hardGateBlocked = true;
          try { improveDrafts.recordSignal({ kind: "cognitive_kernel_block", subject: cognitiveContextState.blockReason }); } catch (_e) {}
        }
      } catch (error) {
        hardGateBlocked = true;
        const message = error && error.message ? error.message : "verification hard gate failed";
        try { improveDrafts.recordSignal({ kind: "cognitive_kernel_error", subject: message }); } catch (_e) {}
        try { logs.error("verification", `hard gate failed: ${message}`); } catch (_e) {}
        finalText = preGateText || "Bu yanÄ±tÄ± gÃ¼venilir biÃ§imde tamamlayamadÄ±m. LÃ¼tfen tekrar dene.";
      }
    }

    // SACV WARNING MODE (debug): sacvDebug aÃ§Ä±kken Hard Gate Ã§ok-gÃ¶rev/SACV nedeniyle bloklamaz;
    // her gÃ¶rev iÃ§in tanÄ± (id, baÅŸlÄ±k, soru, birimler, beklenen, skor, karar, sebep) loglanÄ±r.
    if (settings.sacvDebug && taskDecomposition.applicable) {
      try {
        const sample = (isMultiTask && multiTaskAssembled && multiTaskAssembled.trim()) ? multiTaskAssembled : preGateText;
        const report = sacv.debugReport(sample, taskDecomposition);
        logs.warn("SACV", `SACV_WARNING (debug) â€” ${report.tasks.length} gÃ¶rev | finalTextEmpty=${report.finalTextEmpty} | unitCount=${report.unitCount}`);
        if (report.sharedStateLeak || (report.errors || []).includes("SACV_SHARED_STATE_LEAK")) {
          logs.error("SACV", "SACV_SHARED_STATE_LEAK");
        }
        for (const t of report.tasks) {
          logs.warn("SACV", `Task ${t.taskId} (${t.title}) | question="${t.question}" | detectedAnswer="${t.detectedAnswer || ""}" | detectedUnits=${JSON.stringify(t.detectedUnits || [])} | expectedAnswer="${t.expectedAnswer || ""}" | expected=${JSON.stringify(t.expected)} | score=${t.score} | ${t.decision}${t.decision === "FAIL" ? " | reason=" + t.reason : ""}`);
        }
      } catch (e) {
        try { logs.error("SACV", "debugReport hata: " + (e && e.message)); } catch (_e) {}
      }
      // Warning mode: bloklama â€” modelin Ã¼rettiÄŸi cevabÄ± gÃ¶ster, akÄ±ÅŸÄ± sÃ¼rdÃ¼r.
      if (hardGateBlocked || !finalText.trim()) {
        const restore = (isMultiTask && multiTaskAssembled && multiTaskAssembled.trim()) ? multiTaskAssembled.trim() : preGateText;
        if (restore && restore.trim()) finalText = restore.trim();
      }
      hardGateBlocked = false;
    }

    // multi_task gÃ¼vencesi: herhangi bir geÃ§ aÅŸama (Hard Gate dahil) cevabÄ± boÅŸalttÄ±ysa,
    // gÃ¶revâ†’cevap eÅŸlemeli birleÅŸtirmeyi geri yÃ¼kle. ASLA boÅŸ bubble dÃ¶ndÃ¼rme.
    // CEVABI GİZLEME: Hard Gate, model gerçek/doluca bir cevap ürettiyse onu
    // "Yanıt güvenli şekilde doğrulanamadı" duvarıyla GİZLEMEMELİ. Açık-uçlu
    // danışma soruları ("nasıl/açıkla/analiz") shouldVerifyAnswer'ı tetikleyip
    // gate'e girer ama kesin doğrulanabilir tek bir sonucu yoktur; gate'in
    // sezgileri bunları yanlış-reddeder. Gate'in satır-içi DÜZELTMELERİ zaten
    // çalıştı; burada yalnız son-çare GİZLEME'yi kaldırıyoruz: cevabı kısa, dürüst
    // bir uyarıyla gösteriyoruz (kullanıcı özellikle sayısal/teknik detayı kontrol
    // etsin). Boş/çok kısa cevaplarda gate'in mesajı korunur.
    const restored = restoreBlockedAnswer({ hardGateBlocked, isMultiTask, preGateText });
    if (restored) {
      finalText = restored;
      hardGateBlocked = false;
      try { logs.warn("verification", "hard-gate restore: substantial answer shown with caveat instead of block wall"); } catch (_e) {}
    }

    if (isMultiTask && multiTaskAssembled && multiTaskAssembled.trim() && !finalText.trim()) {
      finalText = multiTaskAssembled.trim();
    }

    // Final Answer tutarlÄ±lÄ±k: muhakeme bir sayÄ± tÃ¼rettiyse final o sayÄ±ya eÅŸit olmalÄ±.
    if (agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        const consistent = finalAnswerConsistencyGuard(finalText);
        if (consistent && consistent.changed && String(consistent.answer || "").trim()) finalText = String(consistent.answer).trim();
      } catch (_e) { /* tutarlÄ±lÄ±k guard cevabÄ± bozmasÄ±n */ }
    }

    // BoÅŸ/phantom gÃ¶rev placeholder temizliÄŸi (tek-problem modu): "Test 2/GÃ¶rev 3" gibi
    // dayanaksÄ±z bÃ¶lÃ¼mleri ve boÅŸ "Cevap: ..." placeholder'larÄ±nÄ± final cevaptan Ã§Ä±kar.
    if (agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        const cleaned = finalAnswerSanitizer.cleanPhantomOutput(finalText, input, taskDecomposition);
        if (cleaned && cleaned.changed && String(cleaned.answer || "").trim()) finalText = String(cleaned.answer).trim();
      } catch (_e) { /* temizleme cevabÄ± bozmasÄ±n */ }
    }

    // YETERLİLİK KAPISI: uzun mimari/operasyonel soruya model alakasız-kısa cevap
    // ürettiyse (örn. "6 TL"), bunu final olarak gösterme. Bir kez ODAKLI yeniden
    // üretim dene; o da yetersizse kontrollü bir mesaj göster. (Codex teşhisi.)
    if (agent.stoppedReason !== "smalltalk" && !isMultiTask &&
        answerAdequacy.isIrrelevantShortAnswer(input, finalText)) {
      try { improveDrafts.recordSignal({ kind: "irrelevant_short_answer", subject: String(finalText).slice(0, 60) }); } catch (_e) {}
      let regen = "";
      try {
        regen = String(await this.generate(selectedModel, answerAdequacy.buildFocusedRegenMessages(input), attemptModels) || "").trim();
      } catch (_e) { regen = ""; }
      if (regen && !answerAdequacy.isIrrelevantShortAnswer(input, regen)) {
        finalText = regen;
      } else {
        finalText = answerAdequacy.CONTROLLED_RETRY_MESSAGE;
      }
    }

    finalProgress?.emit?.("finalizing", { reason: "history-and-stats" });
    finalProgress?.stop?.();

    conversationHistory.push({ role: "user", content: input });
    conversationHistory.push({ role: "assistant", content: finalText });
    if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
      conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY_MESSAGES);
    }

    // GerÃ§ek kullanÄ±m istatistiÄŸi (demo deÄŸil): istek/token/sÃ¼re/model/ajan
    try {
      const stats = require("./agent/stats");
      stats.record({
        model: selectedModel,
        agent: task,
        tokens: Math.round((String(input).length + String(finalText).length) / 4),
        ms: Date.now() - _t0,
      });
    } catch (_e) { /* istatistik hatasÄ± akÄ±ÅŸÄ± bozmasÄ±n */ }

    // Otonom Ã¶ÄŸrenme: kullanÄ±cÄ± mesajÄ±ndan kalÄ±cÄ± kiÅŸisel gerÃ§ekleri Ã¶ÄŸren
    if (settings.autonomousLearning) {
      try {
        for (const fact of extractDurableFacts(input)) remember(fact);
      } catch (_e) {
        // Ã¶ÄŸrenme hatasÄ± sohbeti etkilemesin
      }
    }

    // SÃ¼rekli Ã¶ÄŸrenme aÃ§Ä±ksa: konuÅŸmadan KONU TOHUMU Ã§Ä±kar (ajan kendi konularÄ±nÄ± bulsun).
    // Ã‡ok kÄ±sa/komut benzeri girdileri ele; ilk anlamlÄ± ifadeyi konu yap.
    if (settings.continuousLearning) {
      try {
        const seed = String(input || "")
          .replace(/```[\s\S]*?```/g, " ") // kod bloklarÄ±nÄ± at
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60);
        if (seed.split(" ").length >= 2 && !isSmallTalk(input)) learningStore.addTopic(seed);
      } catch (_e) {}
    }

    this.state = {
      provider: "ollama",
      status: READY_STATES.READY,
      model: selectedModel,
      task,
      message: "HazÄ±r",
    };

    return {
      provider: "ollama",
      model: selectedModel,
      text: finalText,
      iterations: agent.iterations,
      tools: agent.toolCalls.map((t) => t.name),
    };
  }

  /**
   * Tek bir Ã¼retim: Ã¶nce Ollama HTTP /api/chat (messages + system + araÃ§ dÃ¶ngÃ¼sÃ¼
   * iÃ§in gerekli), eriÅŸilemezse CLI `run`'a fallback (messages dÃ¼zleÅŸtirilir).
   * runReact bunu generateFn olarak Ã§aÄŸÄ±rÄ±r.
   */
  async generate(model, messages, fallbackModels = [], onToken = null) {
    const sig = this._abort ? this._abort.signal : undefined;
    // Bulut saÄŸlayÄ±cÄ± seÃ§iliyse oraya yÃ¶nlen â€” yerel Ollama gerekmez.
    const s = getSettings();
    const providers = configuredProviderChain(s);
    const primaryProvider = providers[0] || "ollama";
    const tryCloudProvider = async (provider) => {
      const cloud = configFromSettings(s, { provider });
      try {
        const o = {
          ...cloud,
          signal: sig,
        };
        const content = onToken && provider === primaryProvider
          ? await cloudChatStream(messages, { ...o, onToken })
          : await cloudChat(messages, o);
        if (content && content.trim()) {
          if (provider !== primaryProvider) {
            try { logs.info("model-router", `${primaryProvider} yerine ${provider} yedek saÄŸlayÄ±cÄ±sÄ± kullanÄ±ldÄ±.`); } catch (_e) {}
          }
          return content;
        }
      } catch (error) {
        if (sig && sig.aborted) throw error;
        try { logs.warn("model-router", `${provider} baÅŸarÄ±sÄ±z: ${error.message || error}`); } catch (_e) {}
      }
      return "";
    };
    const cloudProviders = providers.filter((item) => item !== "ollama");
    if (primaryProvider !== "ollama") {
      for (const provider of cloudProviders) {
        const content = await tryCloudProvider(provider);
        if (content) return content;
      }
    }
    const models = [model, ...fallbackModels.filter((m) => m !== model)].slice(0, 4);
    if (providers.includes("ollama") && await ollamaReachable()) {
      for (const m of models) {
      try {
        try {
          const lastUser = [...messages].reverse().find((m) => m && m.role === "user");
          logs.info("model_generate", `provider=ollama model=${m} stream=${Boolean(onToken && m === model)} timeout=${Math.round(OLLAMA_CHAT_TIMEOUT_MS / 1000)}s prompt=${String(lastUser?.content || "").slice(0, 240).replace(/\s+/g, " ")}`);
        } catch (_logError) {}
        const content = onToken && m === model
          ? await ollamaChatStream(m, messages, { timeoutMs: OLLAMA_CHAT_TIMEOUT_MS, onToken, signal: sig })
          : await ollamaChat(m, messages, { timeoutMs: OLLAMA_CHAT_TIMEOUT_MS, signal: sig });
        // ANTI-LOOP: yerel model aynı cümleyi/paragrafı defalarca yazıp bitirmezse
        // son metinden tekrar çöpünü süz (kod blokları korunur). Bulut yanıtı dokunulmaz.
        if (content && content.trim()) return collapseRepetition(content);
        try { logs.warn("model_generate", `empty_response provider=ollama model=${m}`); } catch (_e) {}
      } catch (_e) {
        if (sig && sig.aborted) {
          const aborted = new Error("Ollama isteÄŸi durduruldu.");
          aborted.name = "AbortError";
          throw aborted;
        }
        try { logs.warn("model_generate", `http_failed provider=ollama model=${m} error=${_e && (_e.message || _e)}`); } catch (_logError) {}
      }
      }
    }
    if (sig && sig.aborted) {
      const aborted = new Error("Ollama isteÄŸi durduruldu.");
      aborted.name = "AbortError";
      throw aborted;
    }
    const prompt = flattenMessages(messages);
    for (const m of models) {
      if (sig && sig.aborted) {
        const aborted = new Error("Ollama isteÄŸi durduruldu.");
        aborted.name = "AbortError";
        throw aborted;
      }
      const result = await this.runOllama(["run", m, prompt], {
        timeoutMs: OLLAMA_CHAT_TIMEOUT_MS,
        signal: sig,
      });
      if (result.ok && String(result.stdout || "").trim()) {
        return result.stdout.trim();
      }
    }
    if (primaryProvider === "ollama") {
      for (const provider of cloudProviders) {
        const content = await tryCloudProvider(provider);
        if (content) return content;
      }
    }
    return "";
  }
}

module.exports = {
  ModelManager,
  READY_STATES,
  literalOnlyAnswer,
  instantAnswer,
  restoreBlockedAnswer,
  detectTask,
  repairTaskBoundaryLeak,
  hashTaskBody,
  wantsWebResearch,
  wantsSiteAudit,
  extractResearchQuery,
  classifyResearchSource,
  scoreResearchSource,
  rankResearchSources,
  capResearchSourcesPerHost,
  extractSourceYear,
  sourceFreshnessLabel,
  candidateModelsForTask,
  chooseModelForTask,
  modelParamSize,
  strongestInstalledModel,
  seedConversationHistory,
  isRiddleQuestion,
  prioritizeStrongModelForHeavyPrompt,
  TASK_MODELS,
  missingModelReply,
  parsePullProgress,
  isSmallTalk,
  isTechnicalDiagnostic,
  isInteractiveSoftwareRequest,
  wantsExplicitMultiAgent,
  shouldUseMultiAgent,
  softwareDeliveryPlan,
  shouldRunHardValidation,
  extractWeatherCity,
  _verifyTaskLocalAnswer: verifyTaskLocalAnswer,
  _finalizeTaskLocalAnswer: finalizeTaskLocalAnswer,
  _deterministicTaskAnswer: deterministicTaskAnswer,
  _trustedDeterministicMultiTaskAnswer: trustedDeterministicMultiTaskAnswer,
  _collapseRunawayTaskAnswer: collapseRunawayTaskAnswer,
  _makeVerificationProgress: makeVerificationProgress,
  _MAX_REGENERATION_ATTEMPTS: MAX_REGENERATION_ATTEMPTS,
  _HEARTBEAT_TOKEN: HEARTBEAT_TOKEN,
};

