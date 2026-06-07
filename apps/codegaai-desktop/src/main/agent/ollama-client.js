"use strict";
const crypto = require("node:crypto");
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

/**
 * Tek bir chat tamamlaması (bloklayıcı).
 * @param {string} model
 * @param {Array<{role:string,content:string}>} messages
 * @returns {Promise<string>} asistan metni
 */
async function ollamaChat(model, messages, opts = {}) {
  const {
    temperature = 0.4,
    timeoutMs = 90000,
    host = OLLAMA_HOST,
    numCtx = 8192,
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
        options: { temperature, num_ctx: numCtx },
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
 * Akışlı (streaming) chat tamamlaması. Token geldikçe onToken(token) çağrılır,
 * sonunda tüm metni döndürür. Akış başarısız olursa hata fırlatır (çağıran
 * taraf bloklayıcı ollamaChat'e/CLI'ye düşebilir).
 */
async function ollamaChatStream(model, messages, opts = {}) {
  const {
    temperature = 0.4,
    timeoutMs = 120000,
    host = OLLAMA_HOST,
    numCtx = 8192,
    onToken = null,
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
  let full = "";
  try {
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: { temperature, num_ctx: numCtx },
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
              full += tok;
              if (onToken) { try { onToken(tok); } catch (_e) { /* yut */ } }
            }
          } catch (_e) { /* yarım satır olabilir, yoksay */ }
        }
      }
    } catch (e) {
      // Durdurma ve zaman aşımı üst katmana taşınır; aksi halde CLI fallback
      // aynı isteği bir 90 saniye daha çalıştırıp arayüzü yeniden kilitliyordu.
      if (e && e.name === "AbortError" && timedOut) {
        const timeout = new Error(`Ollama ${Math.round(timeoutMs / 1000)} saniye içinde yanıt vermedi.`);
        timeout.name = "TimeoutError";
        throw timeout;
      }
      throw e;
    }
    return full;
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
  ollamaChat,
  ollamaChatStream,
  ollamaReachable,
  ollamaListModels,
  ollamaListModelDetails,
  ollamaRemoteDigest,
  ollamaCheckModelUpdate,
  ollamaDeleteModel,
  OLLAMA_HOST,
};
