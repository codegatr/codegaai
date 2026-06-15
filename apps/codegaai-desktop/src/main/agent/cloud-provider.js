"use strict";

const { openaiChat, openaiChatStream, openaiTest } = require("./openai-client");

const PROVIDERS = {
  openai: {
    label: "OpenAI-uyumlu",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    baseKey: "openaiBaseUrl",
    apiKey: "openaiApiKey",
    modelKey: "openaiModel",
  },
  gemini: {
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    baseKey: "geminiBaseUrl",
    apiKey: "geminiApiKey",
    modelKey: "geminiModel",
  },
  claude: {
    label: "Claude",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
    baseKey: "claudeBaseUrl",
    apiKey: "claudeApiKey",
    modelKey: "claudeModel",
  },
};

function profile(provider) {
  return PROVIDERS[provider] || null;
}

function configFromSettings(settings, overrides = {}) {
  const provider = overrides.provider || settings.provider || "ollama";
  const p = profile(provider);
  if (!p) return { provider };
  return {
    provider,
    label: p.label,
    baseUrl: overrides.baseUrl || settings[p.baseKey] || p.baseUrl,
    apiKey: overrides.apiKey || settings[p.apiKey] || "",
    model: overrides.model || settings[p.modelKey] || p.model,
  };
}

function configsFromSettings(settings) {
  const runtimePolicy = require("./runtime-policy");
  return runtimePolicy.configuredProviderChain(settings)
    .filter((provider) => provider !== "ollama")
    .map((provider) => configFromSettings(settings, { provider }));
}

function anthropicEndpoint(baseUrl) {
  return `${String(baseUrl || PROVIDERS.claude.baseUrl).replace(/\/+$/, "")}/messages`;
}

function anthropicPayload(messages, opts, stream) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const chat = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }));
  return {
    model: opts.model || PROVIDERS.claude.model,
    max_tokens: opts.maxTokens || 4096,
    temperature: opts.temperature == null ? 0.4 : opts.temperature,
    ...(system ? { system } : {}),
    messages: chat,
    stream,
  };
}

function anthropicHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
}

async function anthropicChat(messages, opts = {}) {
  if (!opts.apiKey) throw new Error("API anahtarı yok.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 90000);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(anthropicEndpoint(opts.baseUrl), {
      method: "POST",
      headers: anthropicHeaders(opts.apiKey),
      body: JSON.stringify(anthropicPayload(messages, opts, false)),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Claude HTTP ${res.status}${text ? ` — ${text.slice(0, 120)}` : ""}`);
    }
    const data = await res.json();
    return (data.content || []).filter((x) => x && x.type === "text").map((x) => x.text).join("");
  } finally {
    clearTimeout(timer);
  }
}

async function anthropicChatStream(messages, opts = {}) {
  if (!opts.apiKey) throw new Error("API anahtarı yok.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 120000);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  let full = "";
  try {
    const res = await fetch(anthropicEndpoint(opts.baseUrl), {
      method: "POST",
      headers: anthropicHeaders(opts.apiKey),
      body: JSON.stringify(anthropicPayload(messages, opts, true)),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`Claude HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        try {
          const obj = JSON.parse(line.slice(5).trim());
          const token = obj && obj.type === "content_block_delta" && obj.delta && obj.delta.text;
          if (token) {
            full += token;
            if (opts.onToken) opts.onToken(token);
          }
        } catch (_e) {}
      }
    }
    return full;
  } catch (error) {
    if (error && error.name === "AbortError") return full;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function cloudChat(messages, opts = {}) {
  if (opts.provider === "claude") return anthropicChat(messages, opts);
  return openaiChat(messages, opts);
}

async function cloudChatStream(messages, opts = {}) {
  if (opts.provider === "claude") return anthropicChatStream(messages, opts);
  return openaiChatStream(messages, opts);
}

async function cloudTest(opts = {}) {
  if (opts.provider === "claude") {
    try {
      const text = await anthropicChat([{ role: "user", content: "ping" }], { ...opts, timeoutMs: 15000, maxTokens: 16 });
      return { ok: true, message: text ? "Claude bağlantısı başarılı." : "Claude bağlandı ama boş yanıt geldi." };
    } catch (error) {
      return { ok: false, message: (error && error.message) || "Claude bağlantısı başarısız." };
    }
  }
  return openaiTest(opts);
}

module.exports = {
  PROVIDERS,
  profile,
  configFromSettings,
  configsFromSettings,
  cloudChat,
  cloudChatStream,
  cloudTest,
};
