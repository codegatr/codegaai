"use strict";
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
  } finally {
    clearTimeout(timer);
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    return full;
  } finally {
    clearTimeout(timer);
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${host}/api/tags`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.models || []).map((m) => m.name).filter(Boolean);
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { ollamaChat, ollamaChatStream, ollamaReachable, ollamaListModels, OLLAMA_HOST };
