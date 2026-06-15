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
    answer: `Yanıt doğrulama kapısından geçmedi.\nBloke eden görev: ${task.label || task.id || "task"}. ${errors.join(" ")}\n\nFinal Answer: Yanıt güvenli şekilde doğrulanamadı.`,
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
  return `${kept.join("\n").trim()}\n\n[Task-local guard: tekrar eden/uzayan taslak kesildi; yanıt yeniden doğrulanacak.]`;
}

function hashTaskBody(body) {
  const s = String(body || "");
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Görev sınır bozulması onarımı: komşu görevin etiket sayısı (örn. "Test 2" -> 2) aktif görevin
 * gövde token'ına yapışıp "9x" yerine "29x" üretebilir. Gövdede OLMAYAN "id+token" birleşmesini
 * yakalayıp düzeltir. Döner: { changed, answer, leaks: [...] }.
 */
function repairTaskBoundaryLeak(task, answer) {
  const id = String(task && task.id != null ? task.id : "").trim();
  let out = String(answer || "");
  const leaks = [];
  if (!/^\d+$/.test(id)) return { changed: false, answer: out, leaks };
  const body = String(task.body || "");
  const tokens = body.match(/\d+(?:[.,]\d+)?x?|\b[a-zçğıöşü]?\d+\b/gi) || [];
  for (const tok of tokens) {
    const merged = id + tok; // "2" + "9x" = "29x"
    if (merged !== tok && !body.includes(merged) && out.includes(merged)) {
      out = out.split(merged).join(tok); // "29x" -> "9x"
      leaks.push(`${merged}→${tok}`);
    }
  }
  return { changed: leaks.length > 0, answer: out, leaks };
}

function deterministicTaskAnswer(taskBody) {
  const body = String(taskBody || "");
  // Önce KNOWN tuzak/canonical (benchmark) — genel matematik çözücü tuzak ifadeleri yanlış
  // yakalamasın (örn. "birinci sıradaki" -> hatalı). Yalnız bilinen tuzaklarda boş-dışı döner.
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
      label: task.label || `Görev ${results.length + 1}`,
      answer: taskLocalFinalAnswer(draft),
    });
  }
  if (results.length !== taskDecomposition.count) return "";
  return results.map((r) => `**${r.label}**\n${r.answer}`).join("\n\n");
}

// Basit sohbet/selamlaşma tespiti — bunlarda araç/ReAct makinesi devreye girmesin
function _normTr(s) {
  return String(s || "").toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
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
    "Sen CODEGA AI'sın, yerel çalışan bir yapay zeka asistanısın. Kullanıcı seninle kısa bir " +
    "selamlaşma/sohbet yapıyor. Kısa, doğal ve net Türkçe cevap ver: 1-2 cümle. Araç KULLANMA, " +
    "liste yapma, kendini uzun uzun tanıtma, rapor/etiket yazma." +
    (humanTone ? " Sıcak ve içten bir ton kullan." : "")
  );
}

const MAX_HISTORY_MESSAGES = 12; // son ~6 turu hatırla

const READY_STATES = {
  CHECKING: "checking",
  READY: "ready",
  MISSING: "missing",
  ERROR: "error",
};

const MAX_REGENERATION_ATTEMPTS = 3;
const PROGRESS_HEARTBEAT_MS = 5000;
const HEARTBEAT_TOKEN = "\u200b";

function progressLabel(stage, scope, meta = {}) {
  const scopeLabel = scope === "multi_task" ? "çoklu görev" : "cevap";
  const reason = meta.reason ? String(meta.reason).replace(/[_-]+/g, " ").slice(0, 80) : "";
  if (/^hala çalışıyor$/i.test(reason)) return `${scopeLabel}: hala çalışıyorum; son aşamayı bekliyorum.`;
  if (stage === "reasoning") return reason ? `${scopeLabel}: ${reason} üzerinde çalışıyorum.` : `${scopeLabel}: problemi parçalara ayırıyorum.`;
  if (stage === "verifying") return reason ? `${scopeLabel}: ${reason} kontrolünü yapıyorum.` : `${scopeLabel}: sonucu doğruluyorum.`;
  if (stage === "finalizing") return reason ? `${scopeLabel}: ${reason} ile son cevabı toparlıyorum.` : `${scopeLabel}: son cevabı toparlıyorum.`;
  return `${scopeLabel}: işlem sürüyor.`;
}

function makeVerificationProgress(onProgress, scope = "answer", onHeartbeat = null) {
  const startedAt = Date.now();
  let stage = "reasoning";
  let attempt = 0;
  let lastVisible = "";
  const sendVisible = (meta = {}) => {
    if (typeof onProgress !== "function") return;
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const line = `Çalışma özeti: ${progressLabel(stage, scope, meta)} (${elapsed} sn)\n`;
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
    ? setInterval(() => emit(stage, { attempt, reason: "hala çalışıyor" }), PROGRESS_HEARTBEAT_MS)
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
  code: ["qwen3.5:9b", "qwen2.5-coder:7b", "qwen2.5-coder:3b", "qwen2.5-coder:7b-instruct", "qwen2.5-coder:3b-instruct", "qwen3.5:4b", "qwen3:8b", DEFAULT_MODEL],
  image: ["qwen3.5:4b", "gemma3:4b", "qwen3.5:9b", "qwen3:4b", DEFAULT_MODEL],
  writing: ["qwen3.5:9b", "qwen3.5:4b", "qwen3.6:27b", "qwen3:8b", "qwen3:14b", "mistral:7b", DEFAULT_MODEL],
  chat: [DEFAULT_MODEL, "qwen3.5:2b", "qwen3.5:0.8b", "qwen3.5:9b", "qwen3:4b", "qwen3:1.7b", "llama3.2:3b"],
};

function instantAnswer(input) {
  const text = String(input || "").trim().toLowerCase();
  if (!text) return "";

  if (/^(merhaba|selam|hi|hello|hey|günaydın|iyi\s+(akşam|akşamlar|gece|geceler)|nasılsın|naber)\b/.test(text)) {
    if (text.includes("günaydın")) return "Günaydın. Buradayım, nasıl yardımcı olayım?";
    if (text.includes("iyi gece")) return "İyi geceler. Buradayım, nasıl yardımcı olayım?";
    if (text.includes("iyi akşam")) return "İyi akşamlar. Buradayım, nasıl yardımcı olayım?";
    if (text.includes("nasılsın") || text.includes("naber")) {
      return "İyiyim, teşekkür ederim. Ne yapmak istiyorsun?";
    }
    return "Merhaba. Buradayım, nasıl yardımcı olayım?";
  }

  if (/(kendin(den|i)|kim(sin)?|neler\s+yapabilirsin|özelliklerin|yeteneklerin|codega\s+ai)\b/.test(text)) {
    return "Ben CODEGA AI. İsteğine göre uygun yerel modeli otomatik seçen, kod, araştırma, proje planlama ve günlük üretim işlerinde yardımcı olan kişisel yapay zeka asistanınım.";
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
        stderr += `\nKomut ${Math.round(timeoutMs / 1000)} saniye içinde yanıt vermedi.`;
        child.kill();
        forceTimer = setTimeout(() => {
          finish({
            ok: false,
            stdout,
            stderr,
            timedOut: true,
            error: "Ollama süreci zaman aşımından sonra kapatılamadı.",
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
          ? "Ollama yanıtı zaman aşımına uğradı."
          : aborted ? "Ollama isteği durduruldu." : undefined,
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

function modelOption(modelId) {
  return MODEL_OPTIONS.find((model) => model.id === modelId) || {
    id: modelId,
    label: modelId,
    description: "Özel model",
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
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
}

/** Açık internet/araştırma niyeti mi? (zayıf yerel model aracı tetikleyemiyor; biz zorlarız) */
function wantsWebResearch(input) {
  const q = _foldTr(input);
  if (/(internet|web|google|cevrimici|online|net)\S*\s*(ten|te|de|da|den|dan)?\s*(arastir|aratip|arat|ara|bak|tara|incele)/.test(q)) return true;
  if (/(guncel|son dakika|haber|piyasa|kur|fiyat|bugun)\S*.*(arastir|ara\b|bul\b|bak\b)/.test(q)) return true;
  // kısa ve emir kipi "araştır/araştırıp özetle"
  if (/\barastir/.test(q) && q.split(/\s+/).length <= 9) return true;
  return false;
}

/** Araştırma sorgusunu çıkar: komut sözcüklerini at; yetersizse geçmişten konuyu ekle. */
function extractResearchQuery(input, history = []) {
  let q = String(input || "")
    .replace(/internetten|internette|internet|web'?[dt]e|web|google'?[dy]?[ae]?|google|cevrimici|online/gi, " ")
    .replace(/arastirip|arastir(ip|in|sana)?|aratip|aratarak|arat|incele(yip)?|tara(yip)?|bak(ip)?\b/gi, " ")
    .replace(/\bara\b|\bbul\b|\bver\b|o zaman|bana|bize|lutfen|ozet(le|ini|le bana)?|sonra/gi, " ")
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ").trim();
  const meaningful = q.split(/\s+/).filter((w) => w.length > 1);
  if (meaningful.length >= 3) return q;
  // yetersiz konu: en son anlamlı kullanıcı mesajını ekle (bağlam)
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] && history[i].role === "user") {
      const h = String(history[i].content || "").replace(/\s+/g, " ").trim();
      if (h && h.length > 4) return (q ? q + " " : "") + h.slice(0, 140);
    }
  }
  return q || String(input || "").slice(0, 140);
}

function detectTask(input) {
  const text = String(input || "").toLowerCase();
  if (/(php|python|javascript|typescript|react|node|api|site|web sitesi|program|uygulama|kod|script|fonksiyon|class|sql|html|css)\b/.test(text)) {
    return "code";
  }
  if (/(resim|görsel|fotoğraf|çiz|çizim|afiş|logo|illustrasyon|illustration|image|prompt)\b/.test(text)) {
    return "image";
  }
  if (/(makale|metin|içerik|mail|e-posta|özet|rapor|senaryo|hikaye|plan)\b/.test(text)) {
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

function buildPrompt(task, input) {
  return [
    "Sen CODEGA AI'sın. Türkçe, net, samimi ve uygulanabilir cevap ver.",
    "ChatGPT ve Claude kalitesinde davran: talebi anla, gerekirse kısa plan yap, sonra doğrudan faydalı cevabı ver.",
    "İç model/paket adlarını kullanıcıya söyleme; sadece doğal şekilde yanıt ver.",
    "Yanıtı gereksiz uzatma. Önce sonucu ver, sonra gerekiyorsa kısa açıklama ekle.",
    `Görev türü: ${task}`,
    `Kullanıcı: ${input}`,
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
  const subject = task === "code" ? "kod/PHP işleri" : "bu iş";
  const action = started ? "arka planda hazırlamaya başladım" : "arka planda hazırlıyorum";
  if (task === "code") {
    return [
      `PHP yazılım için gerekli yerel kod modelini (${modelId}) ${action}.`,
      "İndirme bitince otomatik kullanacağım; ayrıca Ayarlar'a gitmene gerek yok.",
      "",
      "Bu sırada ihtiyacını netleştirebiliriz: web sitesi mi, panel/ERP modülü mü, API mi, yoksa mevcut PHP projesinde hata/ek geliştirme mi istiyorsun?",
    ].join("\n");
  }
  return `${subject} için gerekli yerel modeli (${modelId}) ${action}. Hazır olunca otomatik kullanacağım; ayrıca Ayarlar'a gitmene gerek yok.`;
}

// HTTP /api/chat erişilemezse, CLI `ollama run` için messages dizisini tek
// prompt'a düzleştir (system + geçmiş + kullanıcı korunur).
function flattenMessages(messages) {
  const label = { system: "[SISTEM]", user: "[KULLANICI]", assistant: "[CODEGA]" };
  const lines = messages.map((m) => `${label[m.role] || m.role}: ${m.content}`);
  lines.push("[CODEGA]:");
  return lines.join("\n\n");
}

class ModelManager {
  constructor() {
    this.ollamaCommand = null;
    this.history = []; // sunucu-tarafı çok-turlu hafıza ({role, content})
    this.sessionHistories = new Map(); // renderer sohbetlerini birbirinden kesin olarak ayır
    this._abort = null; // mevcut üretimi durdurmak için
    this._aborted = false;
    this._queue = Promise.resolve(); // ask() serileştirme kuyruğu
    this._preparingModels = new Set(); // arka planda aynı modeli iki kez indirme
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
    return lastResult || { ok: false, error: "Ollama çalıştırılamadı" };
  }

  getStatus() {
    return { ...this.state };
  }

  async installedModels() {
    // HTTP /api/tags — CLI/PATH'ten bağımsız (Electron'da güvenilir)
    const viaHttp = await ollamaListModels();
    if (Array.isArray(viaHttp)) return viaHttp;
    const models = await this.runOllama(["list"]);
    return models.ok ? parseInstalledModels(models.stdout) : [];
  }

  async detect() {
    this.state = {
      ...this.state,
      status: READY_STATES.CHECKING,
      message: "Ollama aranıyor",
    };

    // Önce HTTP servisi (127.0.0.1:11434) — Electron PATH'i CLI'ı görmese bile
    // servis ayaktaysa Ollama KURULU sayılır. CLI sadece yedek kontrol.
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
        message: "Ollama bulunamadı. CODEGA AI temel modda hazır; yerel modeller için Ollama kurulmalı.",
        action: "install_ollama",
        actionUrl: OLLAMA_DOWNLOAD_URL,
      };
      return this.getStatus();
    }

    const installed = await this.installedModels();
    const installedModel = modelCandidates().find((model) => installed.includes(model));
    const option = modelOption(installedModel || DEFAULT_MODEL);
    this.state = {
      provider: "ollama",
      status: installedModel ? READY_STATES.READY : READY_STATES.MISSING,
      model: installedModel || DEFAULT_MODEL,
      task: option.task || "chat",
      message: installedModel
        ? "Codega AI hazır."
        : "Önerilen modeller indirilmeli. Ayarlardan model paketlerini hazırlayabilirsin.",
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
        installed: installed.includes(model.id),
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
        message: "Ollama kurulu değil. Modeli hazırlamak için önce Ollama kurulumu açılıyor.",
        action: "install_ollama",
        actionUrl: OLLAMA_DOWNLOAD_URL,
      };
    }

    const installed = await this.installedModels();
    if (installed.includes(target.id)) {
      this.state = {
        provider: "ollama",
        status: READY_STATES.READY,
        model: target.id,
        task: target.task || "chat",
        message: "Codega AI hazır.",
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
        message: "Ollama çalışmıyor. Model güncellemesi uygulanamadı.",
        action: "install_ollama",
        actionUrl: OLLAMA_DOWNLOAD_URL,
      };
    }
    return this._pullModel(target, onProgress, "güncelleniyor");
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
        message: result.stderr || result.error || `${target.label} işlemi tamamlanamadı`,
      };
      return this.getStatus();
    }

    this.state = {
      provider: "ollama",
      status: READY_STATES.READY,
      model: target.id,
      task: target.task || "chat",
      message: "Codega AI hazır.",
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

  // Aynı anda gelen mesajları SIRAYA al: yerel model tek seferde tek üretim
  // yapsın (eşzamanlı istekler küçük modeli tıkar ve "Düşünüyorum"da bırakır).
  /** Mevcut üretimi durdur (kullanıcı tetikli). */
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
    const run = async () => {
      const result = await this._ask(input, opts);
      if (!result || typeof result.text !== "string") return result;
      const taskReport = tde.decomposeTasks(input);
      const cleaned = finalAnswerSanitizer.cleanUserFacingOutput(result.text, input, taskReport);
      return cleaned.changed ? { ...result, text: cleaned.answer } : result;
    };
    const result = this._queue.then(run, run);
    this._queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
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
    const deepReasoning = getSettings().deepReasoning === true; // ağır çok-turlu LLM doğrulaması (opt-in, varsayılan KAPALI)
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
    // Akış yalnızca (opt-in) bilişsel hat çalışırken kapanır. Aksi halde cevap token token
    // akar — kullanıcı "düşünüyorum"da DONMAZ. Doğrulama/sonuç turları akışı engellemez.
    const onToken = inputNeedsCognitivePipeline ? null : (opts.onToken || null);
    // keepAlive: GÖRÜNMEZ heartbeat HER ZAMAN renderer'a gider (içerik gizliyken bile) ki
    // uzun doğrulama/çok-görev turlarında watchdog (90sn idle) cevabı yarıda KESMESİN.
    const keepAlive = opts.onToken || null;
    const conversationHistory = this.historyFor(opts.chatId);
    // Yeniden üretim: önceki turu (user+assistant) geçmişten çıkar ki bağlam tekrarlanmasın
    if (opts.regenerate) {
      if (conversationHistory.length && conversationHistory[conversationHistory.length - 1].role === "assistant") conversationHistory.pop();
      if (conversationHistory.length && conversationHistory[conversationHistory.length - 1].role === "user") conversationHistory.pop();
    }
    // ÇOK-GÖREV ÖNCELİĞİ: girdi birden çok görev içeriyorsa, anlık tek-cevap kısa-devreleri
    // (instant/benchmark/MLVC) ATLA. Aksi halde MLVC tüm metni tek soru sanıp "1000 | 2" gibi
    // tek/anonim cevapla kısa devre yapıp çok-görev dalını HİÇ çalıştırmıyordu (kök neden).
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
        text: `${cloudConfig.label} seçili ancak API anahtarı yapılandırılmamış. Ayarlar > Yapay Zeka bölümünden API anahtarını girip bağlantıyı test et.`,
      };
    }

    const task = detectTask(input);
    let attemptModels;
    let selectedModel;

    if (cloudMode) {
      // Bulut: Ollama'ya gerek yok; kullanıcının seçtiği modeli kullan.
      selectedModel = cloudConfig.model;
      attemptModels = [selectedModel];
      this.state = {
        provider: activeProvider,
        status: READY_STATES.READY,
        model: selectedModel,
        task,
        message: "Düşünüyorum...",
      };
    } else {
      if (this.state.provider !== "ollama") {
        await this.detect();
      }
      if (this.state.provider !== "ollama") {
        return {
          provider: "instant",
          model: "codega-setup",
          text: "Yerel zeka motoru hazır değil. Ayarlardan kurulumu başlatıp önerilen zeka paketlerini indirebilirsin. (Alternatif: Zekâ & Model'den bulut sağlayıcı tanımlayabilirsin.)",
        };
      }

      const installed = await this.installedModels();
      attemptModels = candidateModelsForTask(task, installed);
      // Kullanıcının seçtiği varsayılan model KURULUYSA en öne al — Cookbook "Varsayılan Yap"
      // seçimi gerçekten etki etsin (aksi halde yalnız göreve göre seçiliyordu).
      const userDefault = settings.defaultModel || settings.model || "";
      if (userDefault) {
        const nrm = (x) => String(x || "").toLowerCase();
        const isInst = installed.some((x) => nrm(x) === nrm(userDefault) || nrm(x) === `${nrm(userDefault)}:latest`);
        if (isInst) attemptModels = [userDefault, ...attemptModels.filter((m) => nrm(m) !== nrm(userDefault))];
      }
      selectedModel = attemptModels[0] || chooseModelForTask(task, installed);
      if (!attemptModels.length) {
        const started = this.prepareModelInBackground(selectedModel);
        this.state = {
          provider: "ollama",
          status: READY_STATES.CHECKING,
          model: selectedModel,
          task,
          message: `${selectedModel} arka planda hazırlanıyor.`,
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
        message: "Düşünüyorum...",
      };
    }

    // Otonom öğrenme: kullanıcı hakkında hatırladıklarını system prompt'a kat
    const memory = settings.autonomousLearning && !fastConversation ? recall(input, 4) : [];

    // RAG: eklenen doküman/bilgi tabanından alakalı parçaları getir
    let ragContext = [];
    if (settings.ragEnabled && !fastConversation) {
      try {
        const hits = await rag.search(input, 4);
        ragContext = hits.map((h) => `[${h.title}] ${h.text}`);
      } catch (_e) {
        ragContext = [];
      }
    }

    // Otonom öğrenmeyle toplanan bilgiyi cevaba kat ("kör olma" / hızlandır)
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

    // Hedef-odaklı planlama (opt-in): karmaşık hedefi alt adımlara böl
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

    // Mesaj dizisi: system (karakter + hafıza + RAG + plan + araç protokolü) + geçmiş + kullanıcı
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

    // Durdurulabilirlik: bu üretim turu için yeni bir abort kontrolcüsü
    this._abort = new AbortController();
    this._aborted = false;

    let agent;
    try {
      if (!cloudMode && wantsWebResearch(input)) {
        // ZORUNLU ARAŞTIRMA: zayıf yerel model aracı tetikleyemiyor → biz çalıştırırız.
        // Kullanıcıya "sen Google'a bak" DEMEK yerine gerçekten arar ve özetleriz.
        const query = extractResearchQuery(input, conversationHistory);
        if (onToken) onToken(`🔎 İnternette araştırıyorum: "${query}"…\n\n`);
        let research = "";
        try {
          research = await AGENT_TOOLS.research.fn(query, 3);
        } catch (e) {
          research = `⚠️ ${e && (e.message || e)}`;
        }
        if (/^⚠️|kaynak bulunamadı/i.test(research)) {
          agent = {
            content:
              `İnternet araması yapamadım ya da kaynak bulunamadı (internet bağlantısı veya erişim engeli olabilir). ` +
              `Aradığım konu: "${query}". Ollama/ağ erişimini kontrol edip tekrar deneyebilirsin.`,
            iterations: 0, stoppedReason: "research_failed", toolCalls: [{ name: "research", result: research }],
          };
        } else {
          const sumMsgs = [
            {
              role: "system",
              content:
                "Aşağıda internetten TOPLADIĞIN web kaynakları var. Bunları KENDİ SÖZCÜKLERİNLE, Türkçe, " +
                "derli toplu özetle. Kullanıcıya 'sen ara/Google'a bak' ASLA deme — araştırmayı SEN yaptın. " +
                "Önemli noktaları maddele, varsa çelişkileri belirt ve sonunda kaynak linklerini listele. " +
                "Kaynaklarda yoksa uydurma; bilmiyorsan söyle.",
            },
            { role: "user", content: research },
          ];
          const summary = await this.generate(selectedModel, sumMsgs, attemptModels, onToken);
          agent = {
            content: String(summary || "").trim() || research,
            iterations: 1, stoppedReason: "final_answer",
            toolCalls: [{ name: "research", result: research }],
          };
        }
      } else if (!cloudMode && taskDecomposition.applicable && taskDecomposition.count >= 2) {
        // ÇOK-GÖREV: zayıf yerel model 5 görevi tek seferde çözemiyordu (1 cevap dönüyordu).
        // Her görevi BAĞIMSIZ çöz, task_results[]'e doldur, finali TÜM diziden kur.
        const detectedTasks = taskDecomposition.tasks;
        const taskResults = [];
        const progress = makeVerificationProgress(opts.onProgress, "multi_task", keepAlive);
        try {
        for (let i = 0; i < detectedTasks.length; i++) {
          const t = detectedTasks[i];
          // Sınır bütünlüğü: gövdeyi hash'le; üretim öncesi/sonrası gövde DEĞİŞMEMELİ.
          const bodyHash = hashTaskBody(t.body);
          progress.emit("reasoning", { attempt: 0, reason: t.label || `task-${i + 1}` });
          // GÖRÜNÜR ilerleme: kullanıcı boş/donmuş ekran görmesin (final cevap bunları değiştirir).
          if (opts.onProgress) {
            try {
              opts.onProgress({
                stage: "reasoning",
                scope: "multi_task",
                text: `${t.label || `Görev ${i + 1}`} çözülüyor (${i + 1}/${detectedTasks.length})`,
              });
            } catch (_e) {}
          }
          const taskFactLock = factLock.extractFacts(t.body);
          const tMsgs = [
            {
              role: "system",
              content:
                "Sana TEK bir görev verilecek. SADECE bu görevi çöz. Adım adım, kısa ve net düşün; " +
                "sonunda mutlaka 'Cevap: …' satırı yaz. Başka görevlere değinme, soruyu tekrar etme.",
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
            // Görev başına ucuz deterministik düzeltme (oran/denklem/matematik)
            try {
              const rp = rpre.verify(t.body, aTxt);
              if (rp.applicable && rp.status === "REJECTED" && rp.correctedAnswer) aTxt = rp.correctedAnswer;
              const eb = ebse.verify(t.body, aTxt);
              if (eb.applicable && eb.status === "REJECTED" && eb.correctedAnswer) aTxt = eb.correctedAnswer;
            } catch (_e) { /* doğrulama görevi düşürmesin */ }
          }
          if (!aTxt) aTxt = "(bu görev için yanıt üretilemedi)";
          // Sonucu diziye PUSH et — önceki sonuçların üzerine YAZMA
          try {
            // Hız: deepReasoning KAPALIYSA model-tabanlı AVE/regen ATLANIR; yalnız deterministik
            // doğrulayıcılar (RPRE/EBSE/MLVC/TCNIS/SACV) çalışır → 4 görev saniyelerde biter.
            // deepReasoning AÇIKSA tam (model destekli) doğrulama + 1 regen.
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
            aTxt = `Yanıt doğrulama kapısından geçmedi.\nBloke eden görev: ${t.label}. ${message}\n\nFinal Answer: Yanıt güvenli şekilde doğrulanamadı.`;
            try { improveDrafts.recordSignal({ kind: "multi_task_local_gate_error", subject: `${t.label}: ${message}` }); } catch (_e) {}
          }
          // SINIR BÜTÜNLÜĞÜ: gövde değişmemeli + cevapta "id+token" birleşmesi (29x) olmamalı.
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
        // Final yanıt TÜM task_results dizisinden kurulur (yalnız son/aktif görev değil)
        } finally {
          progress.stop();
        }
        const assembled = taskResults.map((r) => `**${r.label}**\n${r.answer}`).join("\n\n");
        const complete = taskResults.length === detectedTasks.length;
        agent = {
          content: complete
            ? assembled
            : `${assembled}\n\n⚠️ ${detectedTasks.length} görev algılandı ama ${taskResults.length} tanesi yanıtlandı.`,
          iterations: detectedTasks.length,
          stoppedReason: "multi_task",
          toolCalls: [],
        };
      } else if (fastConversation) {
        // Basit selam/sohbet: araçsız, kısa, doğrudan cevap (ajan saçmalamasın)
        const sttMsgs = [
          { role: "system", content: smallTalkPrompt(settings.humanTone) },
          ...conversationHistory.slice(-4),
          { role: "user", content: input },
        ];
        const direct = await this.generate(selectedModel, sttMsgs, attemptModels, onToken);
        agent = { content: direct, iterations: 0, stoppedReason: "smalltalk", toolCalls: [] };
      } else if (shouldUseMultiAgent(settings, input) && looksLikeGoal(input)) {
        // Multi-agent: orchestrator → uzman ajanlar → denetçi sentezi
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
              .map((r, i) => `Adım ${i + 1} (${r.specialist}): ${r.output}`)
              .join("\n\n");
            const msgs = [
              {
                role: "system",
                content:
                  buildSpecialistPrompt("reviewer", g) +
                  "\nTüm adım çıktılarını birleştirip kullanıcıya tek, net bir final cevap yaz.",
              },
              {
                role: "user",
                content: `Hedef: ${g}\n\nAdım çıktıları:\n${joined}\n\nFinal cevabı yaz.`,
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
        // Varsayılan yol: cevabı akışlı üret (token token). Akış bozulursa generate
        // kendi içinde bloklayıcı moda/CLI'ye düşer; dönüş değeri yine otorite.
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
          text: "⏹️ Üretim durduruldu.",
        };
      }
      this.state = {
        ...this.state,
        status: READY_STATES.ERROR,
        message: (e && e.message) || "Ajan hatası",
      };
      return {
        provider: "instant",
        model: "codega-error",
        text: "Yerel zeka motoru şu an yanıt üretemedi. Ollama açık mı ve model indirildi mi diye kontrol edebilirsin.",
      };
    }

    const text = String(agent.content || "").trim();
    // Kullanıcı durdurduysa: o ana dek üretilen kısmı (varsa) döndür, yoksa not düş
    if (this._aborted) {
      this._abort = null;
      this.state = { ...this.state, status: READY_STATES.READY, message: "Durduruldu" };
      return {
        provider: this.state.provider || "ollama",
        model: selectedModel,
        text: text ? `${text}\n\n⏹️ (durduruldu)` : "⏹️ Üretim durduruldu.",
      };
    }
    // Kendini gözlemleme: araç hatalarını öneri taslağı için say (yerel, gönderilmez)
    try {
      for (const tc of agent.toolCalls || []) {
        if (typeof tc.result === "string" && /⚠️\s*Araç hatası|not_allowed/.test(tc.result)) {
          improveDrafts.recordSignal({ kind: "tool_error", subject: tc.name });
        }
      }
    } catch (_e) { /* gözlem hatası akışı bozmasın */ }
    if (!text || agent.stoppedReason === "error") {
      try { improveDrafts.recordSignal({ kind: "empty_response" }); } catch (_e) {}
      this.state = {
        ...this.state,
        status: READY_STATES.READY,
        message: text ? "Hazır" : "Yanıt boş döndü",
      };
      return {
        provider: "instant",
        model: "codega-empty",
        text:
          text ||
          "Yanıt üretemedim. Ollama servisi açık mı ve ilgili model indirildi mi diye kontrol edebilirsin.",
      };
    }

    // Öz değerlendirme (opt-in): cevabı denetle, gerekiyorsa düzelt
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
    // multi_task: etiketli görev birleştirmesi (Görev N: cevap) korunmalı. Aşağıdaki
    // dönüştürücü motorlar (HRIL/REE/sanitizer/kernel) "Final Answer" çıkarıp etiketleri
    // silebiliyor ("2 | 12" gibi anonim çıktı). Bu modda onları atlar, sonda geri yükleriz.
    const isMultiTask = agent.stoppedReason === "multi_task";
    const multiTaskAssembled = isMultiTask ? agent.content : "";
    if (settings.selfReflection && !interactiveSoftwareRequest && !inputNeedsCognitivePipeline && agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        finalProgress?.emit?.("verifying", { reason: "self-reflection" });
        const r = await reflect(input, text, (msgs) => this.generate(selectedModel, msgs));
        if (r.answer && r.answer.trim()) applyCorrection(r.answer.trim(), "reflect");
      } catch (_e) {
        // denetim hatası cevabı etkilemesin
      }
    }

    // Çok-turlu hafıza: kullanıcı + final cevabı sakla (araç gözlemleri hariç)
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

    // RPRE (Ratio & Proportion Reasoning Engine): DETERMİNİSTİK pay modeli — EBSE'den ÖNCE.
    // Oran/orantı/"katı" sorularında toplamı doğrudan orana bölme hatasını yakalar; yanlışsa
    // pay modeliyle yeniden çözer. Model çağrısı YOK.
    // (multi_task: her görev zaten ayrı doğrulandı; tüm-metne uygulanırsa görevler arası
    //  sayıları karıştırıp cevabı bozabilir → atla.)
    if (agent.stoppedReason !== "smalltalk" && agent.stoppedReason !== "multi_task") {
      try {
        finalProgress?.emit?.("verifying", { reason: "rpre" });
        const rp = rpre.verify(input, finalText);
        if (rp.applicable && rp.status === "REJECTED" && rp.correctedAnswer) {
          if (applyCorrection(rp.correctedAnswer, "rpre")) {
            try { improveDrafts.recordSignal({ kind: "rpre_reject", subject: (rp.checks.find((c) => !c.ok) || {}).name || "ratio_parts" }); } catch (_e) {}
          }
        }
      } catch (_e) { /* RPRE hatası cevabı bozmasın */ }
    }

    // EBSE (Equation Back-Substitution Engine): DETERMİNİSTİK geri-yerine-koyma.
    // Self Critic -> [EBSE] -> MLVC -> AVE -> MCE. Model çağrısı YOK (hızlı, her zaman açık).
    // Türetilen değerleri orijinal denklemlere koyar; geçmezse cevabı reddedip YENİDEN hesaplar.
    if (agent.stoppedReason !== "smalltalk" && agent.stoppedReason !== "multi_task") {
      try {
        finalProgress?.emit?.("verifying", { reason: "ebse" });
        const eb = ebse.verify(input, finalText);
        if (eb.applicable && eb.status === "REJECTED" && eb.correctedAnswer) {
          if (applyCorrection(eb.correctedAnswer, "ebse")) {
            try { improveDrafts.recordSignal({ kind: "ebse_reject", subject: (eb.checks.find((c) => !c.ok) || {}).name || "back_substitution" }); } catch (_e) {}
          }
        }
      } catch (_e) { /* EBSE hatası cevabı bozmasın */ }
    }

    let mlvcApproved = false;
    let mlvcMetadata = null;
    if (inputNeedsVerification && agent.stoppedReason !== "smalltalk" && agent.stoppedReason !== "multi_task") {
      try {
        if (inputNeedsMLVC) {
          finalProgress?.emit?.("verifying", { reason: "mlvc" });
          // deep KAPALI: yalnız deterministik kontrol (model çağrısı yok) → hızlı, donmaz.
          // deep AÇIK: ek olarak LLM doğrulama turu.
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

    // HRIL (Human Reasoning & Interpretation Layer): matematiksel olarak doğru sonucu
    // insanın hemen anlayacağı karşılığa çevirir (örn. 7/15 -> %46,67; 0.5 saat -> 30 dk).
    if (requiresHardValidation && agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        finalProgress?.emit?.("finalizing", { reason: "hril" });
        const interpreted = hril.interpret(input, finalText, { mlvc: mlvcMetadata });
        if (interpreted.answer && interpreted.answer.trim()) applyCorrection(interpreted.answer.trim(), "hril");
      } catch (_e) {
        // yorum katmanı cevabı bozmasın
      }
    }

    // REE (Reasoning -> Explanation Engine): doğrulanmış/yorumlanmış sonucu kısa,
    // anlaşılır açıklama yapısına çevirir; sonucu değiştirmez.
    if (requiresHardValidation && agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        finalProgress?.emit?.("finalizing", { reason: "ree" });
        const explained = ree.explain(input, finalText);
        if (explained.answer && explained.answer.trim()) applyCorrection(explained.answer.trim(), "ree");
      } catch (_e) {
        // açıklama katmanı cevabı bozmasın
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
            finalText = `${finalText}\n\nGörev Tamamlama Uyarısı: ${taskDecomposition.count} görevden ${coverage.completed.length} tanesi görünür biçimde tamamlandı; eksik kalanlar: ${coverage.missing.map((t) => t.label).join(", ")}.`;
          }
        }
      } catch (_e) {
        // TDE must not crash chat.
      }
    }

    // Final Answer hard gate:
    // 1) soru metni Final Answer içine giremez
    // 2) her tespit edilen görev Final Answer içinde tam bir kez cevaplanmalı
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
        finalText = preGateText || "Bu yanıtı güvenilir biçimde tamamlayamadım. Lütfen tekrar dene.";
      }
    }

    // SACV WARNING MODE (debug): sacvDebug açıkken Hard Gate çok-görev/SACV nedeniyle bloklamaz;
    // her görev için tanı (id, başlık, soru, birimler, beklenen, skor, karar, sebep) loglanır.
    if (settings.sacvDebug && taskDecomposition.applicable) {
      try {
        const sample = (isMultiTask && multiTaskAssembled && multiTaskAssembled.trim()) ? multiTaskAssembled : preGateText;
        const report = sacv.debugReport(sample, taskDecomposition);
        logs.warn("SACV", `SACV_WARNING (debug) — ${report.tasks.length} görev | finalTextEmpty=${report.finalTextEmpty} | unitCount=${report.unitCount}`);
        if (report.sharedStateLeak || (report.errors || []).includes("SACV_SHARED_STATE_LEAK")) {
          logs.error("SACV", "SACV_SHARED_STATE_LEAK");
        }
        for (const t of report.tasks) {
          logs.warn("SACV", `Task ${t.taskId} (${t.title}) | question="${t.question}" | detectedAnswer="${t.detectedAnswer || ""}" | detectedUnits=${JSON.stringify(t.detectedUnits || [])} | expectedAnswer="${t.expectedAnswer || ""}" | expected=${JSON.stringify(t.expected)} | score=${t.score} | ${t.decision}${t.decision === "FAIL" ? " | reason=" + t.reason : ""}`);
        }
      } catch (e) {
        try { logs.error("SACV", "debugReport hata: " + (e && e.message)); } catch (_e) {}
      }
      // Warning mode: bloklama — modelin ürettiği cevabı göster, akışı sürdür.
      if (hardGateBlocked || !finalText.trim()) {
        const restore = (isMultiTask && multiTaskAssembled && multiTaskAssembled.trim()) ? multiTaskAssembled.trim() : preGateText;
        if (restore && restore.trim()) finalText = restore.trim();
      }
      hardGateBlocked = false;
    }

    // multi_task güvencesi: herhangi bir geç aşama (Hard Gate dahil) cevabı boşalttıysa,
    // görev→cevap eşlemeli birleştirmeyi geri yükle. ASLA boş bubble döndürme.
    if (isMultiTask && multiTaskAssembled && multiTaskAssembled.trim() && !finalText.trim()) {
      finalText = multiTaskAssembled.trim();
    }

    // Final Answer tutarlılık: muhakeme bir sayı türettiyse final o sayıya eşit olmalı.
    if (agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        const consistent = finalAnswerConsistencyGuard(finalText);
        if (consistent && consistent.changed && String(consistent.answer || "").trim()) finalText = String(consistent.answer).trim();
      } catch (_e) { /* tutarlılık guard cevabı bozmasın */ }
    }

    // Boş/phantom görev placeholder temizliği (tek-problem modu): "Test 2/Görev 3" gibi
    // dayanaksız bölümleri ve boş "Cevap: ..." placeholder'larını final cevaptan çıkar.
    if (agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        const cleaned = finalAnswerSanitizer.cleanPhantomOutput(finalText, input, taskDecomposition);
        if (cleaned && cleaned.changed && String(cleaned.answer || "").trim()) finalText = String(cleaned.answer).trim();
      } catch (_e) { /* temizleme cevabı bozmasın */ }
    }

    finalProgress?.emit?.("finalizing", { reason: "history-and-stats" });
    finalProgress?.stop?.();

    conversationHistory.push({ role: "user", content: input });
    conversationHistory.push({ role: "assistant", content: finalText });
    if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
      conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY_MESSAGES);
    }

    // Gerçek kullanım istatistiği (demo değil): istek/token/süre/model/ajan
    try {
      const stats = require("./agent/stats");
      stats.record({
        model: selectedModel,
        agent: task,
        tokens: Math.round((String(input).length + String(finalText).length) / 4),
        ms: Date.now() - _t0,
      });
    } catch (_e) { /* istatistik hatası akışı bozmasın */ }

    // Otonom öğrenme: kullanıcı mesajından kalıcı kişisel gerçekleri öğren
    if (settings.autonomousLearning) {
      try {
        for (const fact of extractDurableFacts(input)) remember(fact);
      } catch (_e) {
        // öğrenme hatası sohbeti etkilemesin
      }
    }

    // Sürekli öğrenme açıksa: konuşmadan KONU TOHUMU çıkar (ajan kendi konularını bulsun).
    // Çok kısa/komut benzeri girdileri ele; ilk anlamlı ifadeyi konu yap.
    if (settings.continuousLearning) {
      try {
        const seed = String(input || "")
          .replace(/```[\s\S]*?```/g, " ") // kod bloklarını at
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
      message: "Hazır",
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
   * Tek bir üretim: önce Ollama HTTP /api/chat (messages + system + araç döngüsü
   * için gerekli), erişilemezse CLI `run`'a fallback (messages düzleştirilir).
   * runReact bunu generateFn olarak çağırır.
   */
  async generate(model, messages, fallbackModels = [], onToken = null) {
    const sig = this._abort ? this._abort.signal : undefined;
    // Bulut sağlayıcı seçiliyse oraya yönlen — yerel Ollama gerekmez.
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
            try { logs.info("model-router", `${primaryProvider} yerine ${provider} yedek sağlayıcısı kullanıldı.`); } catch (_e) {}
          }
          return content;
        }
      } catch (error) {
        if (sig && sig.aborted) throw error;
        try { logs.warn("model-router", `${provider} başarısız: ${error.message || error}`); } catch (_e) {}
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
    if (providers.includes("ollama") && await ollamaReachable()) {
      try {
        const content = onToken
          ? await ollamaChatStream(model, messages, { timeoutMs: OLLAMA_CHAT_TIMEOUT_MS, onToken, signal: sig })
          : await ollamaChat(model, messages, { timeoutMs: OLLAMA_CHAT_TIMEOUT_MS, signal: sig });
        if (content && content.trim()) return content;
      } catch (_e) {
        if (sig && sig.aborted) {
          const aborted = new Error("Ollama isteği durduruldu.");
          aborted.name = "AbortError";
          throw aborted;
        }
        if (_e && _e.name === "TimeoutError") throw _e;
        // HTTP başarısız -> CLI fallback (akışsız)
      }
    }
    if (sig && sig.aborted) {
      const aborted = new Error("Ollama isteği durduruldu.");
      aborted.name = "AbortError";
      throw aborted;
    }
    const prompt = flattenMessages(messages);
    const models = [model, ...fallbackModels.filter((m) => m !== model)].slice(0, 3);
    for (const m of models) {
      if (sig && sig.aborted) {
        const aborted = new Error("Ollama isteği durduruldu.");
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
  instantAnswer,
  detectTask,
  repairTaskBoundaryLeak,
  hashTaskBody,
  wantsWebResearch,
  extractResearchQuery,
  candidateModelsForTask,
  chooseModelForTask,
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
