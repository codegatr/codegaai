"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { detectRunawayRepetition } = require("./anti-loop");
const { hasCharSalad, structuralStreamFailure } = require("./answer-quality");
/**
 * agent/ollama-client.js
 * -----------------------
 * Ollama HTTP `/api/chat` istemcisi.
 *
 * Eski mimari `ollama run model "prompt"` (CLI, tek-atış) kullanıyordu: ne
 * konuşma geçmişi, ne system mesajı, ne de araç döngüsü mümkündü. HTTP
 * `/api/chat` ise messages dizisi (system + history + user) alır; bu da ReAct
 * ajan döngüsünün temelidir.
 *
 * Ollama masaüstü kurulumu arka planda 127.0.0.1:11434'te servis verir.
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const DEFAULT_NUM_PREDICT = 4096;
// Strict/kararlı çıktı için düşük varsayılan sıcaklık (uydurma/hallucination azalır).
const DEFAULT_TEMPERATURE = 0.2;
// Çıktı token tavanına (done_reason:"length") çarpıldığında kaç kez otomatik
// "kaldığın yerden devam et" turu atılacağı. Yarıda kesilmeyi yazılımsal engeller.
const DEFAULT_MAX_CONTINUATIONS = 3;
// Modeli RAM'de SICAK tut: keep_alive verilmezse Ollama modeli boşaltıyor ve bir
// sonraki istekte tekrar yüklüyor → 20-30sn TTFT (ilk token gecikmesi). "30m" ile
// model yüklü kalır, ardışık mesajlarda ısınma maliyeti ödenmez.
const DEFAULT_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "30m";

function diagnosticLogPath() {
  return process.env.CODEGA_DIAGNOSTIC_LOG_PATH ||
    path.join(os.tmpdir(), "codegaai-stream-diagnostics.log");
}

function appendStreamDiagnostic(reason, text) {
  const excerpt = String(text || "").slice(-4000);
  const record = {
    at: new Date().toISOString(),
    reason: String(reason || "structural_error"),
    excerpt,
  };
  try {
    fs.mkdirSync(path.dirname(diagnosticLogPath()), { recursive: true });
    fs.appendFileSync(diagnosticLogPath(), JSON.stringify(record) + "\n", "utf8");
  } catch (_e) {
    // Diagnostics must never crash the low-resource local stream path.
  }
}

/**
 * Ollama generation seçeneklerini kur. Önceden yalnız temperature/num_ctx
 * geçiliyordu; küçük yerel modellerde bu, tekrar/döngü ("Bu bu paketi…", "buu…")
 * ve kesik cümlelere yol açıyordu. repeat_penalty + repeat_last_n + top_p/top_k
 * bu kalite sorununu büyük ölçüde giderir. Uzun/toplu görevlerde Ollama'nın erken
 * cevap kesmesini azaltmak için num_predict varsayılanı da yüksek tutulur.
 * Hepsi opts ile geçersiz kılınabilir.
 */
// Mesajların kabaca token sayısını tahmin et (TR ~3.2 karakter/token).
function estimateMessagesTokens(messages) {
  let chars = 0;
  for (const m of messages || []) chars += String((m && m.content) || "").length;
  return Math.ceil(chars / 3.2);
}

// Bağlam penceresini girdi boyutuna göre uyarla. Büyük/çok-soru prompt'larında
// (örn. 12 soruluk test) varsayılan 8192 aşılırsa Ollama promptu BUDAR ve küçük
// model "0.75" gibi dejenere çıktı üretir. numCtx açıkça verilmediyse, girdi +
// çıktı bütçesi 8192'yi zorluyorsa 16384'e çıkar (RAM dostu üst sınır).
const MAX_ADAPTIVE_NUM_CTX = 16384;
function adaptiveNumCtx(messages, requested, numPredict) {
  if (typeof requested === "number" && Number.isFinite(requested) && requested > 0) return requested;
  const needed = estimateMessagesTokens(messages) + (Number(numPredict) || DEFAULT_NUM_PREDICT);
  if (needed > 8192 * 0.85) return Math.min(MAX_ADAPTIVE_NUM_CTX, 16384);
  return 8192;
}

function buildGenOptions(opts = {}) {
  // Yalnız GERÇEK sonlu sayıyı kullan; null/undefined/"" varsayılana düşsün.
  // (Number(null)===0 olduğu için ham Number() guard'ı repeat_penalty'yi yanlışlıkla
  // 0'a düşürüp tekrar cezasını kapatabiliyordu.)
  const num = (v, def) => (typeof v === "number" && Number.isFinite(v) ? v : def);
  const positiveInt = (v, def) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : def);
  const o = {
    temperature: num(opts.temperature, DEFAULT_TEMPERATURE),
    num_ctx: num(opts.numCtx, 8192),
    num_predict: positiveInt(opts.numPredict, DEFAULT_NUM_PREDICT),
    // Tekrar/döngü bastırma: küçük modeller aynı cümleyi defalarca yazabiliyor.
    // 1.3 + geniş pencere (384) token seviyesinde döngüyü azaltır; anti-loop.js
    // son işlemde kalan tekrarı temizler.
    repeat_penalty: num(opts.repeatPenalty, 1.3),
    repeat_last_n: num(opts.repeatLastN, 384),
    top_p: num(opts.topP, 0.9),
    top_k: num(opts.topK, 40),
  };
  return o;
}

/**
 * Tek bir chat tamamlaması (bloklayıcı).
 * @param {string} model
 * @param {Array<{role:string,content:string}>} messages
 * @returns {Promise<string>} asistan metni
 */
async function ollamaChat(model, messages, opts = {}) {
  const {
    temperature = DEFAULT_TEMPERATURE,
    timeoutMs = 90000,
    host = OLLAMA_HOST,
    numCtx = 8192,
    numPredict = null,
    think = false,
  } = opts;

  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", abortFromParent, { once: true });
  }
  try {
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        think,
        keep_alive: opts.keepAlive || DEFAULT_KEEP_ALIVE,
        options: buildGenOptions({ ...opts, numCtx: adaptiveNumCtx(messages, opts.numCtx, opts.numPredict) }),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }
    const data = await res.json();
    return (data && data.message && data.message.content) || "";
  } catch (error) {
    if (error && error.name === "AbortError" && timedOut) {
      const timeout = new Error(`Ollama ${Math.round(timeoutMs / 1000)} saniye içinde yanıt vermedi.`);
      timeout.name = "TimeoutError";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", abortFromParent);
  }
}

/**
 * TEK turluk akışlı istek. Token geldikçe onToken(token) çağrılır; sonunda
 * { text, doneReason } döner. doneReason === "length" → model çıktı token
 * tavanına çarptı (yanıt yarıda kesildi). Akış/timeout/abort hataları fırlatılır.
 */
async function streamChatOnce(model, messages, opts = {}) {
  const {
    timeoutMs = 120000,
    host = OLLAMA_HOST,
    think = false,
    onToken = null,
    genOptions = null,
  } = opts;

  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", abortFromParent, { once: true });
  }
  let text = "";
  let doneReason = null;
  // KAÇAK ÜRETİM CANLI KESİCİ: küçük model tekrar döngüsüne girerse (aynı dev
  // SQL bloğunu defalarca basması gibi) çöpün kullanıcıya dakikalarca akmasını
  // bekleme — birikimde kaçak tekrar görülür görülmez bu turu kes. Üst katman
  // doneReason:"runaway" görür; öz-düzeltme oradan devralır.
  let runaway = false;
  let charSalad = false;
  let structuralError = false;
  let structuralReason = "";
  let lastRunawayCheckLen = 0;
  try {
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        think,
        keep_alive: opts.keepAlive || DEFAULT_KEEP_ALIVE,
        options: genOptions || buildGenOptions(opts),
      }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`Ollama HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      // Ollama NDJSON döndürür: her satır bir JSON parçası
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line);
            const tok = obj && obj.message && obj.message.content;
            if (tok) {
              text += tok;
              if (hasCharSalad(text.slice(-3000))) {
                charSalad = true;
                appendStreamDiagnostic("char_salad", text);
                controller.abort();
                continue;
              }
              const structural = structuralStreamFailure(text.slice(-3000));
              if (structural.bad) {
                structuralError = true;
                structuralReason = structural.reason || "structural_error";
                appendStreamDiagnostic(structuralReason, text);
                controller.abort();
                continue;
              }
              if (onToken) { try { onToken(tok); } catch (_e) { /* yut */ } }
              // Her ~1500 karakterde bir kuyruğu (son 9000) kaçak tekrar için tara.
              if (text.length - lastRunawayCheckLen >= 1500) {
                lastRunawayCheckLen = text.length;
                if (detectRunawayRepetition(text.slice(-9000))) {
                  runaway = true;
                  controller.abort();
                }
              }
            }
            if (obj && obj.done && obj.done_reason) doneReason = obj.done_reason;
          } catch (_e) { /* yarım satır olabilir, yoksay */ }
        }
      }
    } catch (e) {
      if (e && e.name === "AbortError" && timedOut) {
        const timeout = new Error(`Ollama ${Math.round(timeoutMs / 1000)} saniye içinde yanıt vermedi.`);
        timeout.name = "TimeoutError";
        throw timeout;
      }
      throw e;
    }
    return { text, doneReason };
  } catch (error) {
    // Canlı kesici tetiklendiyse bu bir hata değil, kontrollü kesinti:
    // o ana kadarki metinle dön; üst katman "runaway" nedenini görsün.
    if (error && error.name === "AbortError" && runaway) {
      return { text, doneReason: "runaway" };
    }
    if (error && error.name === "AbortError" && charSalad) {
      return { text, doneReason: "char_salad" };
    }
    if (error && error.name === "AbortError" && structuralError) {
      return { text, doneReason: "structural_error", structuralReason };
    }
    if (error && error.name === "AbortError" && timedOut) {
      const timeout = new Error(`Ollama ${Math.round(timeoutMs / 1000)} saniye içinde yanıt vermedi.`);
      timeout.name = "TimeoutError";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", abortFromParent);
  }
}

/**
 * Akışlı (streaming) chat tamamlaması — çıktı token tavanına karşı korumalı.
 *
 * Devasa/çok-bölümlü isteklerde model `done_reason:"length"` ile yarıda kesilirse
 * (örn. 10 soruluk testin 9'unun ortasında), otomatik olarak "kaldığın yerden
 * devam et" turları atılır ve gelen akışlar TEK yanıt gibi birleştirilir
 * (sequential request + stream aggregation). Bu, prompt'u sorulara bölmekten
 * daha güvenlidir: tüm bağlam korunur, sorular arası tutarlılık kaybolmaz.
 *
 * Sonsuz döngü / aşırı maliyet koruması: en fazla `maxContinuations` tur, ve
 * bir tur hiç ilerleme üretmezse (boş/whitespace) döngü kırılır.
 *
 * @returns {Promise<string>} birleştirilmiş tam metin
 */
async function ollamaChatStream(model, messages, opts = {}) {
  const {
    host = OLLAMA_HOST,
    think = false,
    onToken = null,
  } = opts;
  const perRoundTimeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 120000;
  const maxContinuations = (typeof opts.maxContinuations === "number" && opts.maxContinuations >= 0)
    ? Math.floor(opts.maxContinuations)
    : DEFAULT_MAX_CONTINUATIONS;
  // genOptions bir kez kurulur; her tur aynı parametrelerle çalışır.
  // numCtx girdi boyutuna göre uyarlanır (büyük prompt budanmasın → dejenerasyon).
  const genOptions = buildGenOptions({ ...opts, numCtx: adaptiveNumCtx(messages, opts.numCtx, opts.numPredict) });

  let convo = Array.isArray(messages) ? messages.slice() : [];
  let full = "";
  let continuations = 0;

  for (;;) {
    const { text, doneReason } = await streamChatOnce(model, convo, {
      host,
      think,
      onToken,
      signal: opts.signal,
      timeoutMs: perRoundTimeoutMs,
      genOptions,
    });
    full += text;

    // Canlı kesici bu turu kestiyse devam turu ATMA — çöpü uzatma.
    if (doneReason === "runaway" || doneReason === "char_salad" || doneReason === "structural_error") break;
    // Normal bitiş (stop / null) → tamam.
    if (doneReason !== "length") break;
    // Güvenlik tavanı veya ilerleme yok → döngüyü kır (sonsuz devam etmesin).
    if (continuations >= maxContinuations || !text.trim()) break;
    // BİRİKİM kaçak tekrar içeriyorsa (turlar arası aynı blok döngüsü) devam
    // turu, döngüyü token tavanının ötesine taşımaktan başka işe yaramaz — kes.
    if (detectRunawayRepetition(full)) break;
    continuations += 1;

    // Kaldığı yerden devam ettir: şimdiye kadarki yanıtı asistan mesajı olarak
    // bağlama koy, tekrar etmeden sürdürmesini iste.
    convo = convo.concat(
      { role: "assistant", content: full },
      { role: "user", content: "Önceki yanıtın çıktı sınırında kesildi. Kaldığın yerden, hiçbir şeyi tekrar etmeden devam et." }
    );
  }
  return full;
}

/** Ollama HTTP servisi ayakta mı? */
async function ollamaReachable(host = OLLAMA_HOST, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${host}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch (_e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kurulu modelleri HTTP /api/tags ile listele (CLI/PATH'ten bağımsız).
 * @returns {Promise<string[]|null>} model adları, ya da servis yoksa null
 */
async function ollamaListModels(host = OLLAMA_HOST, timeoutMs = 4000) {
  const details = await ollamaListModelDetails(host, timeoutMs);
  return details ? details.map((m) => m.name).filter(Boolean) : null;
}

/**
 * Kurulu model meta verisini döndürür. `digest`, resmi Ollama registry manifesti
 * ile karşılaştırılarak model dosyası indirilmeden güncelleme tespit edilebilir.
 */
async function ollamaListModelDetails(host = OLLAMA_HOST, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${host}/api/tags`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.models || []).filter((m) => m && m.name);
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseOfficialModelRef(name) {
  const value = String(name || "").trim().toLowerCase();
  if (!value || value.includes("@") || value.startsWith("http") || value.startsWith("hf.co/")) return null;
  const colon = value.lastIndexOf(":");
  const modelPath = colon > value.lastIndexOf("/") ? value.slice(0, colon) : value;
  const tag = colon > value.lastIndexOf("/") ? value.slice(colon + 1) : "latest";
  if (!/^[a-z0-9._/-]+$/.test(modelPath) || !/^[a-z0-9._-]+$/.test(tag)) return null;
  const repository = modelPath.includes("/") ? modelPath : `library/${modelPath}`;
  return { repository, tag };
}

/**
 * Resmi Ollama registry manifestinin digest'ini hesaplar.
 * Registry `Docker-Content-Digest` başlığını her zaman göndermediği için,
 * Docker Registry v2 kuralındaki gibi manifestin ham baytlarından sha256 alınır.
 */
async function ollamaRemoteDigest(name, opts = {}) {
  const parsed = parseOfficialModelRef(name);
  if (!parsed) return null;
  const fetchImpl = opts.fetchImpl || fetch;
  const timeoutMs = Number(opts.timeoutMs) || 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://registry.ollama.ai/v2/${parsed.repository}/manifests/${parsed.tag}`;
    const res = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.docker.distribution.manifest.v2+json",
        "User-Agent": "CODEGA-AI",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const headerDigest = res.headers && res.headers.get
      ? res.headers.get("docker-content-digest")
      : null;
    if (headerDigest) return headerDigest;
    const body = Buffer.from(await res.arrayBuffer());
    return `sha256:${crypto.createHash("sha256").update(body).digest("hex")}`;
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function ollamaCheckModelUpdate(model, opts = {}) {
  const name = typeof model === "string" ? model : model && model.name;
  const rawLocalDigest = typeof model === "object" && model ? String(model.digest || "") : "";
  const localDigest = rawLocalDigest && !rawLocalDigest.includes(":")
    ? `sha256:${rawLocalDigest}`
    : rawLocalDigest;
  const remoteDigest = await ollamaRemoteDigest(name, opts);
  return {
    name: String(name || ""),
    localDigest: localDigest || null,
    remoteDigest,
    updateAvailable: !!(localDigest && remoteDigest && localDigest !== remoteDigest),
    checked: !!remoteDigest,
  };
}

async function ollamaDeleteModel(name, host = OLLAMA_HOST, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${host}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  buildGenOptions,
  adaptiveNumCtx,
  estimateMessagesTokens,
  DEFAULT_NUM_PREDICT,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_CONTINUATIONS,
  ollamaChat,
  ollamaChatStream,
  streamChatOnce,
  ollamaReachable,
  ollamaListModels,
  ollamaListModelDetails,
  ollamaRemoteDigest,
  ollamaCheckModelUpdate,
  ollamaDeleteModel,
  OLLAMA_HOST,
};
