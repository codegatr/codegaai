"use strict";

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function parseJsonOrText(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
}

async function postShare({ baseUrl, chat, appVersion, fetchImpl = fetch, timeoutMs = 12000 }) {
  const endpoint = `${trimSlash(baseUrl)}/share/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
        "X-Codega-Client": "codega-desktop",
      },
      body: JSON.stringify({
        title: chat?.title || "CODEGA AI Sohbeti",
        messages: Array.isArray(chat?.messages) ? chat.messages : [],
        app_version: appVersion || "",
      }),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") || "";
      throw new Error(`Paylaşım POST isteği yönlendirmeye takıldı (${response.status}). Sunucuda ${endpoint} adresi POST kabul etmeli. Location: ${location}`);
    }

    const data = await parseJsonOrText(response);
    if (!response.ok) {
      throw new Error(data?.error || data?.message || `Paylaşım servisi cevap vermedi: ${response.status}`);
    }

    if (!data || (!data.url && !data.slug)) {
      if (data && data.service) {
        throw new Error("Paylaşım servisi sağlık yanıtı döndürdü; POST route yerine ana endpoint çalışmış olabilir.");
      }
      throw new Error("Paylaşım servisi URL veya slug döndürmedi.");
    }

    return data;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("Paylaşım isteği zaman aşımına uğradı (sunucu/Cloudflare yanıt vermedi). ");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  postShare,
};
