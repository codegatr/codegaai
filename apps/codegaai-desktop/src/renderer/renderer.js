const STORAGE_KEY = "codega.desktop.chats.v1";
const SHARE_HASH_PREFIX = "#share=";

const state = {
  messages: [],
  chats: [],
  activeChat: null,
  firstQueryUpdateChecked: false,
  updatePromptState: null,
};

const els = {
  version: document.getElementById("version-label"),
  history: document.getElementById("history-list"),
  conversation: document.getElementById("conversation"),
  welcome: document.getElementById("welcome"),
  form: document.getElementById("chat-form"),
  input: document.getElementById("prompt-input"),
  historySearch: document.getElementById("history-search"),
  modelPill: document.getElementById("model-pill"),
  settings: document.getElementById("settings-dialog"),
  settingsButton: document.getElementById("settings-button"),
  prepareModel: document.getElementById("prepare-model"),
  modelDetail: document.getElementById("model-detail"),
  modelList: document.getElementById("model-list"),
  checkUpdate: document.getElementById("check-update"),
  updateDetail: document.getElementById("update-detail"),
  updateActions: document.getElementById("update-actions"),
  downloadUpdate: document.getElementById("download-update"),
  installUpdate: document.getElementById("install-update"),
  updatePrompt: document.getElementById("update-prompt"),
  updatePromptTitle: document.getElementById("update-prompt-title"),
  updatePromptDetail: document.getElementById("update-prompt-detail"),
  updateNow: document.getElementById("update-now"),
  updateLater: document.getElementById("update-later"),
  updateLaterX: document.getElementById("update-later-x"),
  toggleLearning: document.getElementById("toggle-learning"),
  toggleHuman: document.getElementById("toggle-human"),
  toggleReflection: document.getElementById("toggle-reflection"),
  togglePlanner: document.getElementById("toggle-planner"),
  toggleMultiAgent: document.getElementById("toggle-multiagent"),
  toggleMaintenance: document.getElementById("toggle-maintenance"),
  runMaintenance: document.getElementById("run-maintenance"),
  toggleAutoPropose: document.getElementById("toggle-autopropose"),
  expertSelect: document.getElementById("expert-select"),
  toggleStreaming: document.getElementById("toggle-streaming"),
  providerSelect: document.getElementById("provider-select"),
  openaiBase: document.getElementById("openai-base"),
  openaiKey: document.getElementById("openai-key"),
  openaiModel: document.getElementById("openai-model"),
  providerCloudFields: document.getElementById("provider-cloud-fields"),
  providerTest: document.getElementById("provider-test"),
  toggleFederation: document.getElementById("toggle-federation"),
  clearMemory: document.getElementById("clear-memory"),
  memorySummary: document.getElementById("memory-summary"),
  memoryList: document.getElementById("memory-list"),
  githubTest: document.getElementById("github-test"),
  githubToken: document.getElementById("github-token"),
  knowledgeRepo: document.getElementById("knowledge-repo"),
  toggleIdle: document.getElementById("toggle-idle"),
  knowledgeDown: document.getElementById("knowledge-down"),
  knowledgeUp: document.getElementById("knowledge-up"),
  knowledgeStatus: document.getElementById("knowledge-status"),
  installOllama: document.getElementById("install-ollama"),
  ollamaRowStatus: document.getElementById("ollama-row-status"),
  ragStats: document.getElementById("rag-stats"),
  ragClear: document.getElementById("rag-clear"),
  ragTitle: document.getElementById("rag-title"),
  ragText: document.getElementById("rag-text"),
  ragAdd: document.getElementById("rag-add"),
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function setTransientStatus(text) {
  const previous = els.modelPill.textContent;
  els.modelPill.textContent = text;
  window.clearTimeout(setTransientStatus.timer);
  setTransientStatus.timer = window.setTimeout(() => {
    els.modelPill.textContent = previous || "Hazır";
  }, 2400);
}

function normalizeChat(chat) {
  return {
    id: chat.id || crypto.randomUUID(),
    title: String(chat.title || "Yeni sohbet").slice(0, 80),
    messages: Array.isArray(chat.messages)
      ? chat.messages
          .filter((message) => message && (message.role === "user" || message.role === "assistant"))
          .map((message) => ({
            role: message.role,
            text: String(message.text || ""),
            createdAt: Number(message.createdAt) || Date.now(),
          }))
      : [],
    updatedAt: Number(chat.updatedAt) || Date.now(),
  };
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeChat: state.activeChat,
      chats: state.chats,
    }));
  } catch (error) {
    console.warn("Sohbet geçmişi kaydedilemedi", error);
  }
}

function cleanupStuckPlaceholders(chats) {
  // Önceki oturumda cevap gelmeden kapatılmış mesajlar "Düşünüyorum..." olarak
  // kalmış olabilir. Bunları anlaşılır bir nota çevir (yanıltıcı durmasın).
  const dead = [
    "Düşünüyorum...",
    "Biraz uzun düşünüyorum. Cevap gelmezse kısa süre içinde güvenli şekilde durduracağım.",
  ];
  for (const chat of chats) {
    for (const m of chat.messages || []) {
      if (m.role === "assistant" && dead.includes(String(m.text || "").trim())) {
        m.text = "(yanıt tamamlanmadı — uygulama kapanmış olabilir)";
      }
    }
  }
  return chats;
}

function loadChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    state.chats = Array.isArray(payload.chats)
      ? cleanupStuckPlaceholders(payload.chats.map(normalizeChat)).sort((a, b) => b.updatedAt - a.updatedAt)
      : [];
    state.activeChat = state.chats.some((chat) => chat.id === payload.activeChat)
      ? payload.activeChat
      : state.chats[0]?.id || null;
  } catch (error) {
    console.warn("Sohbet geçmişi okunamadı", error);
    state.chats = [];
    state.activeChat = null;
  }
}

function createChat(title = "Yeni sohbet") {
  const chat = {
    id: crypto.randomUUID(),
    title,
    messages: [],
    updatedAt: Date.now(),
  };
  state.chats.unshift(chat);
  state.activeChat = chat.id;
  saveChats();
  renderHistory();
  renderConversation();
}

function currentChat() {
  if (!state.activeChat) createChat();
  return state.chats.find((chat) => chat.id === state.activeChat);
}

function chatMatchesQuery(chat, q) {
  if (!q) return true;
  const needle = q.toLocaleLowerCase("tr");
  if (String(chat.title || "").toLocaleLowerCase("tr").includes(needle)) return true;
  return (chat.messages || []).some((m) =>
    String(m.text || "").toLocaleLowerCase("tr").includes(needle)
  );
}

function renderHistory() {
  const q = (historyQuery || "").trim();
  const visible = state.chats.filter((chat) => chatMatchesQuery(chat, q));
  if (q && !visible.length) {
    els.history.innerHTML = `<p class="history-empty">"${escapeHtml(q)}" için sohbet bulunamadı.</p>`;
    return;
  }
  els.history.innerHTML = visible.map((chat) => `
    <div class="history-entry ${chat.id === state.activeChat ? "active" : ""}">
      <button class="history-item" data-chat="${chat.id}">
        ${escapeHtml(chat.title)}
      </button>
      <div class="history-actions" aria-label="Sohbet işlemleri">
        <button type="button" data-share-chat="${chat.id}" title="Link olarak paylaş" aria-label="Link olarak paylaş">↗</button>
        <button type="button" data-zip-chat="${chat.id}" title="ZIP olarak indir" aria-label="ZIP olarak indir">↓</button>
        <button type="button" data-delete-chat="${chat.id}" title="Sohbeti sil" aria-label="Sohbeti sil">×</button>
      </div>
    </div>
  `).join("");

  els.history.querySelectorAll("[data-chat]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeChat = button.dataset.chat;
      saveChats();
      renderHistory();
      renderConversation();
    });
  });
  els.history.querySelectorAll("[data-share-chat]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      shareChat(button.dataset.shareChat);
    });
  });
  els.history.querySelectorAll("[data-zip-chat]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      downloadChatZip(button.dataset.zipChat);
    });
  });
  els.history.querySelectorAll("[data-delete-chat]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteChat(button.dataset.deleteChat);
    });
  });
}

function renderConversation() {
  const chat = currentChat();
  els.conversation.innerHTML = "";
  if (!chat.messages.length) {
    els.conversation.appendChild(els.welcome);
    return;
  }

  for (let idx = 0; idx < chat.messages.length; idx++) {
    const message = chat.messages[idx];
    const node = document.createElement("article");
    node.className = `message ${message.role}`;
    node.innerHTML = `
      <div class="role">${message.role === "user" ? "SEN" : "CODEGA AI"}</div>
      <div>${escapeHtml(message.text).replace(/\n/g, "<br>")}</div>
    `;
    // Asistan cevaplarına geri bildirim (👍/👎) — son cevap hâlâ yazılıyorsa ekleme
    const isLivePlaceholder = isSending && idx === chat.messages.length - 1;
    if (message.role === "assistant" && message.text && !isLivePlaceholder) {
      const bar = document.createElement("div");
      bar.className = "feedback-bar";
      const prompt = idx > 0 && chat.messages[idx - 1].role === "user" ? chat.messages[idx - 1].text : "";
      const mkBtn = (rating, label) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "fb-btn";
        b.textContent = label;
        b.title = rating === "up" ? "İyi cevap" : "Kötü cevap (iyileştirme için işaretle)";
        b.addEventListener("click", async () => {
          bar.querySelectorAll(".fb-btn").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
          try { await window.codega.recordFeedback({ rating, text: message.text, prompt }); } catch (_e) {}
          setTransientStatus(rating === "up" ? "Teşekkürler — olumlu geri bildirim kaydedildi." : "Not aldım — bunu iyileştirme için işaretledim.");
        });
        return b;
      };
      bar.appendChild(mkBtn("up", "👍"));
      bar.appendChild(mkBtn("down", "👎"));
      // Kopyala — tüm büyük sohbet arayüzlerinde olan evrensel eylem
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "fb-btn";
      copyBtn.textContent = "📋";
      copyBtn.title = "Cevabı kopyala";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(message.text);
          setTransientStatus("Cevap kopyalandı.");
        } catch (_e) {
          setTransientStatus("Kopyalanamadı.");
        }
      });
      bar.appendChild(copyBtn);
      node.appendChild(bar);
    }
    els.conversation.appendChild(node);
  }
  scrollConversationToBottom();
}

function scrollConversationToBottom() {
  requestAnimationFrame(() => {
    try {
      els.conversation.scrollTop = els.conversation.scrollHeight;
    } catch (_e) {
      /* yoksay */
    }
    window.scrollTo({ top: document.documentElement.scrollHeight });
    els.conversation.lastElementChild?.scrollIntoView({ block: "end" });
  });
}

function appendMessage(role, text) {
  const chat = currentChat();
  chat.messages.push({ role, text, createdAt: Date.now() });
  chat.updatedAt = Date.now();
  if (role === "user" && chat.title === "Yeni sohbet") {
    chat.title = text.slice(0, 42) || "Yeni sohbet";
  }
  state.chats = state.chats.filter((item) => item.id !== chat.id);
  state.chats.unshift(chat);
  state.activeChat = chat.id;
  saveChats();
  renderHistory();
  renderConversation();
  scrollConversationToBottom();
}

function chatToMarkdown(chat) {
  const lines = [`# ${chat.title}`, "", `Tarih: ${new Date(chat.updatedAt).toLocaleString()}`, ""];
  for (const message of chat.messages) {
    lines.push(`## ${message.role === "user" ? "Sen" : "CODEGA AI"}`);
    lines.push("");
    lines.push(message.text || "");
    lines.push("");
  }
  return lines.join("\n");
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeSharePayload(chat) {
  return base64UrlEncode(JSON.stringify({
    title: chat.title,
    messages: chat.messages,
    updatedAt: chat.updatedAt,
  }));
}

function buildShareLink(chat) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}${SHARE_HASH_PREFIX}${encodeSharePayload(chat)}`;
}

const FEDERATION_SHARE_BASE = "https://ai.codega.com.tr/api/federation/share";

async function shareChat(chatId) {
  const chat = state.chats.find((item) => item.id === chatId);
  if (!chat) return;
  setTransientStatus("Paylaşım linki oluşturuluyor...");
  try {
    const remote = await window.codega.shareChat({
      title: chat.title,
      messages: chat.messages,
    });
    // url varsa kullan; yoksa slug'dan kur (sunucu her ikisini de döndürür)
    const link =
      remote && (remote.url || (remote.slug ? `${FEDERATION_SHARE_BASE}/${remote.slug}` : ""));
    if (link) {
      try {
        await navigator.clipboard.writeText(link);
        setTransientStatus(`Paylaşım linki kopyalandı: ${link}`);
      } catch {
        setTransientStatus(`Paylaşım linki: ${link}`);
      }
      return;
    }
    // Sunucu bir hata döndürdüyse gerçek nedeni göster (tahmin etme)
    if (remote && remote.error) {
      setTransientStatus(`Paylaşım reddedildi: ${remote.error}`);
    } else if (remote && remote.service) {
      // GET sağlık yanıtı geldiyse istek POST olarak ulaşmamış demektir
      setTransientStatus("Paylaşım isteği sunucuya POST olarak ulaşmadı (yönlendirme?).");
    } else {
      setTransientStatus("Paylaşım sunucusu beklenmedik bir yanıt verdi.");
    }
  } catch (error) {
    console.warn("Uzak paylaşım servisi kullanılamadı", error);
    setTransientStatus(
      "Paylaşım sunucusu (ai.codega.com.tr) yayında değil. Link paylaşımı için sunucu kurulmalı."
    );
  } finally {
    // ↗ butonuna tıklayınca odak orada kalıyordu; giriş alanına geri ver ki
    // kullanıcı hemen yazıp Enter ile gönderebilsin.
    if (els.input) els.input.focus();
  }
}

function deleteChat(chatId) {
  const chat = state.chats.find((item) => item.id === chatId);
  if (!chat) return;
  const ok = window.confirm(`"${chat.title}" sohbeti silinsin mi?`);
  if (!ok) return;
  state.chats = state.chats.filter((item) => item.id !== chatId);
  state.activeChat = state.chats[0]?.id || null;
  saveChats();
  if (!state.activeChat) {
    createChat();
    return;
  }
  renderHistory();
  renderConversation();
}

const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ ZIP_CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(out, value) {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(out, value) {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function buildZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const stamp = dosDateTime(new Date());
    const local = [];
    writeUint32(local, 0x04034b50);
    writeUint16(local, 20);
    writeUint16(local, 0x0800);
    writeUint16(local, 0);
    writeUint16(local, stamp.time);
    writeUint16(local, stamp.date);
    writeUint32(local, crc);
    writeUint32(local, data.length);
    writeUint32(local, data.length);
    writeUint16(local, name.length);
    writeUint16(local, 0);
    chunks.push(new Uint8Array(local), name, data);

    const entry = [];
    writeUint32(entry, 0x02014b50);
    writeUint16(entry, 20);
    writeUint16(entry, 20);
    writeUint16(entry, 0x0800);
    writeUint16(entry, 0);
    writeUint16(entry, stamp.time);
    writeUint16(entry, stamp.date);
    writeUint32(entry, crc);
    writeUint32(entry, data.length);
    writeUint32(entry, data.length);
    writeUint16(entry, name.length);
    writeUint16(entry, 0);
    writeUint16(entry, 0);
    writeUint16(entry, 0);
    writeUint16(entry, 0);
    writeUint32(entry, 0);
    writeUint32(entry, offset);
    central.push(new Uint8Array(entry), name);
    offset += local.length + name.length + data.length;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = [];
  writeUint32(end, 0x06054b50);
  writeUint16(end, 0);
  writeUint16(end, 0);
  writeUint16(end, files.length);
  writeUint16(end, files.length);
  writeUint32(end, centralSize);
  writeUint32(end, offset);
  writeUint16(end, 0);
  return new Blob([...chunks, ...central, new Uint8Array(end)], { type: "application/zip" });
}

function safeFileName(value) {
  return String(value || "codega-sohbet")
    .toLowerCase()
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "codega-sohbet";
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function downloadChatZip(chatId) {
  const chat = state.chats.find((item) => item.id === chatId);
  if (!chat) return;
  const payload = JSON.stringify(chat, null, 2);
  const zip = buildZip([
    { name: "chat.json", content: payload },
    { name: "chat.md", content: chatToMarkdown(chat) },
  ]);
  downloadBlob(zip, `${safeFileName(chat.title)}.zip`);
  setTransientStatus("Sohbet ZIP olarak indirildi");
}

function restoreSharedChatFromHash() {
  if (!window.location.hash.startsWith(SHARE_HASH_PREFIX)) return;
  try {
    const encoded = window.location.hash.slice(SHARE_HASH_PREFIX.length);
    const payload = JSON.parse(base64UrlDecode(encoded));
    const chat = normalizeChat({
      title: `${payload.title || "Paylaşılan sohbet"}`,
      messages: payload.messages,
      updatedAt: payload.updatedAt || Date.now(),
    });
    state.chats.unshift(chat);
    state.activeChat = chat.id;
    saveChats();
    history.replaceState(null, "", window.location.pathname);
  } catch (error) {
    console.warn("Paylaşılan sohbet açılamadı", error);
  }
}

function setModelStatus(status) {
  const ready = status?.status === "ready";
  const missing = status?.status === "missing";
  els.modelPill.textContent = ready
    ? "Hazır"
    : missing
      ? "Temel mod hazır"
      : "Düşünüyor";
  els.modelDetail.textContent = status?.action === "install_ollama"
    ? "Yerel zeka motoru kurulu değil. Model paketleri için Ollama kurulumu gerekli."
    : ready
      ? "Codega AI talimata göre gerekli zeka paketini arka planda kullanır."
      : "Codega AI çalışma ortamını kontrol ediyor.";

  // Ollama satırı: çalışıyorsa "Kur" butonunu gizle, durumu göster
  const ollamaMissing = status?.action === "install_ollama" || status?.provider === "instant";
  if (els.ollamaRowStatus) {
    els.ollamaRowStatus.textContent = ollamaMissing
      ? "Kurulu değil. Yerel modeller için Ollama gerekli — kurmak için tıkla."
      : "Ollama çalışıyor ✓ (yerel motor hazır).";
  }
  if (els.installOllama) {
    els.installOllama.hidden = !ollamaMissing;
  }
  const ovModel = document.getElementById("ov-model");
  if (ovModel && status && status.model) ovModel.textContent = status.model;
  if (typeof updateOverview === "function") updateOverview();
}

function renderModelList(payload) {
  const options = payload?.options || [];
  els.modelList.innerHTML = options.map((model) => `
    <div class="model-row">
      <div>
        <strong>${escapeHtml(model.label)}</strong>
        <p>${escapeHtml(model.description)} · ${escapeHtml(model.task || "genel")}</p>
      </div>
      <button type="button" data-model="${escapeHtml(model.id)}" ${model.installed ? "disabled" : ""}>
        ${model.installed ? "Hazır" : "İndir"}
      </button>
    </div>
  `).join("");
}

async function refreshModels() {
  try {
    const payload = await window.codega.getModels();
    setModelStatus(payload.status);
    renderModelList(payload);
  } catch (error) {
    els.modelDetail.textContent = `Model listesi alınamadı: ${error.message || error}`;
  }
}

async function refreshStatus() {
  const status = await window.codega.getStatus();
  els.version.textContent = `v${status.version}`;
  setModelStatus(status.model);
  await refreshModels();
}

function checkUpdatesAfterFirstQuery() {
  if (state.firstQueryUpdateChecked) return;
  state.firstQueryUpdateChecked = true;
  window.codega.checkForUpdates().catch(() => {});
}

function showUpdatePrompt(mode, detail = {}) {
  state.updatePromptState = mode;
  if (mode === "available") {
    els.updatePromptTitle.textContent = "Yeni güncelleme var";
    els.updatePromptDetail.textContent = "Daha iyi ve kararlı bir sürüm bulundu. İstersen şimdi indirebilirim.";
    els.updateNow.textContent = "Şimdi Güncelle";
  } else {
    els.updatePromptTitle.textContent = "Güncelleme hazır";
    els.updatePromptDetail.textContent = "Yeni sürüm indirildi. Kurulum için CODEGA AI yeniden başlatılacak.";
    els.updateNow.textContent = "Uygula ve Yeniden Başlat";
  }
  if (!els.updatePrompt.open) els.updatePrompt.showModal();
}

function closeUpdatePrompt() {
  if (els.updatePrompt.open) els.updatePrompt.close("later");
}

let historyQuery = "";
let isSending = false;
let manualUpdateCheck = false;
let attachedFile = null; // { name, text, kind }
const ATTACH_MAX_CHARS = 16000; // modele giden bağlam tavanı (yerel modeller için makul)
const ATTACH_MAX_BYTES = 500 * 1024 * 1024; // yerelde çalışıyoruz: 500 MB'a kadar kabul
const ATTACH_READ_BYTES = 800 * 1024; // metin dosyalarından yalnızca baştan bu kadar oku (bellek dostu)

// Uzantıya göre dosya türü + araç/uzman önerisi (rakiplerdeki gibi içeriğe uyum)
function detectFileKind(name) {
  const ext = String(name).split(".").pop().toLowerCase();
  const T = (label, expert, action) => ({ label, expert, action, readable: true });
  const code = {
    php: T("PHP", "php", "kod inceleme/geliştirme"),
    js: T("JavaScript", "javascript", "kod inceleme"),
    ts: T("TypeScript", "javascript", "kod inceleme"),
    jsx: T("React", "javascript", "bileşen inceleme"),
    tsx: T("React/TS", "javascript", "bileşen inceleme"),
    vue: T("Vue", "javascript", "bileşen inceleme"),
    py: T("Python", "python", "kod inceleme"),
    rb: T("Ruby", "genel", "kod inceleme"),
    go: T("Go", "genel", "kod inceleme"),
    rs: T("Rust", "genel", "kod inceleme"),
    java: T("Java", "genel", "kod inceleme"),
    c: T("C", "genel", "kod inceleme"),
    cpp: T("C++", "genel", "kod inceleme"),
    h: T("C başlık", "genel", "kod inceleme"),
    html: T("HTML", "javascript", "işaretleme inceleme"),
    htm: T("HTML", "javascript", "işaretleme inceleme"),
    css: T("CSS", "javascript", "stil inceleme"),
    scss: T("SCSS", "javascript", "stil inceleme"),
    sql: T("SQL", "genel", "şema/sorgu inceleme"),
    sh: T("Shell", "devops", "betik inceleme"),
    yml: T("YAML", "devops", "yapılandırma inceleme"),
    yaml: T("YAML", "devops", "yapılandırma inceleme"),
    ini: T("INI", "devops", "yapılandırma inceleme"),
    env: T("ENV", "devops", "yapılandırma inceleme (gizli anahtarlara dikkat)"),
    csv: T("CSV veri", "genel", "veri analizi/özet"),
    tsv: T("TSV veri", "genel", "veri analizi/özet"),
    json: T("JSON", "genel", "yapı/veri inceleme"),
    xml: T("XML", "genel", "yapı inceleme"),
    md: T("Markdown", "genel", "doküman inceleme"),
    txt: T("Metin", "genel", "doküman inceleme"),
    log: T("Log", "devops", "hata/iz analizi"),
  };
  if (code[ext]) return code[ext];
  const archive = ["zip", "rar", "7z", "tar", "gz", "tgz"];
  const image = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
  if (archive.includes(ext)) return { label: "Arşiv", action: "içeriği çıkarıp önemli dosyaları ekle", readable: false, hint: "archive" };
  if (image.includes(ext)) return { label: "Görsel", action: "görsel anlama (vision) modeli gerekir", readable: false, hint: "image" };
  if (ext === "pdf") return { label: "PDF", action: "metnini .txt olarak ekleyebilir veya yapıştırabilirsin", readable: false, hint: "pdf" };
  return { label: ext ? ext.toUpperCase() : "Dosya", expert: "genel", action: "metin olarak inceleme", readable: true };
}

function renderAttachChip() {
  const chip = document.getElementById("attach-chip");
  if (!chip) return;
  if (!attachedFile) { chip.hidden = true; chip.innerHTML = ""; return; }
  chip.hidden = false;
  const tag = attachedFile.kind ? ` · ${escapeHtml(attachedFile.kind.label)}` : "";
  chip.innerHTML = `<span>📎 ${escapeHtml(attachedFile.name)}${tag}</span>`;
  const x = document.createElement("button");
  x.type = "button";
  x.textContent = "×";
  x.title = "Eki kaldır";
  x.addEventListener("click", () => { attachedFile = null; renderAttachChip(); });
  chip.appendChild(x);
}

(function bindAttach() {
  const btn = document.getElementById("attach-btn");
  const input = document.getElementById("file-input");
  if (!btn || !input) return;
  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    input.value = ""; // aynı dosya tekrar seçilebilsin
    if (!file) return;
    const kind = detectFileKind(file.name);

    // Metin olmayan türler: okuma yerine doğru aracı öner
    if (!kind.readable) {
      attachedFile = null;
      renderAttachChip();
      const msg = {
        archive: `${file.name}: arşiv dosyası. İçeriği çıkarıp önemli dosyaları tek tek ekleyebilirsin (tam proje/arşiv okuma yakında).`,
        image: `${file.name}: görsel. Görsel anlama için bir vision modeli gerekiyor (örn. llava) — yakında.`,
        pdf: `${file.name}: PDF. Metnini .txt olarak kaydedip ekleyebilir ya da yapıştırabilirsin.`,
      }[kind.hint] || `${file.name}: bu tür metin olarak okunamıyor.`;
      setTransientStatus(msg);
      return;
    }

    if (file.size > ATTACH_MAX_BYTES) {
      setTransientStatus("Dosya 500 MB sınırını aşıyor.");
      return;
    }

    // Büyük dosyalarda belleği şişirmeden yalnızca baştan bir dilim oku
    const slice = file.size > ATTACH_READ_BYTES ? file.slice(0, ATTACH_READ_BYTES) : file;
    const reader = new FileReader();
    reader.onload = () => {
      let text = String(reader.result || "");
      let note = "";
      if (file.size > ATTACH_READ_BYTES || text.length > ATTACH_MAX_CHARS) {
        text = text.slice(0, ATTACH_MAX_CHARS);
        note = " (baş kısmı)";
      }
      attachedFile = { name: file.name + note, text, kind };
      renderAttachChip();
      const sug = kind.expert && kind.expert !== "genel" ? ` Öneri: Uzman Modu'nu "${kind.expert}" yapabilirsin.` : "";
      setTransientStatus(`Ek hazır: ${kind.label}${note} — ${kind.action}.${sug}`);
    };
    reader.onerror = () => setTransientStatus("Dosya okunamadı (metin tabanlı bir dosya seç).");
    reader.readAsText(slice);
  });
})();

async function handleSubmit() {
  if (isSending) return; // önceki cevap dönmeden yeni istek gönderme
  const text = els.input.value.trim();
  if (!text) return;
  isSending = true;

  // Ek dosya varsa: ekranda kullanıcı metni + ek rozeti; modele dosya bağlamı eklenmiş metin
  const att = attachedFile;
  const displayText = att ? `${text}\n\n📎 ${att.name}` : text;
  const sendText = att
    ? `Kullanıcı bir dosya ekledi: "${att.name}"\n\n--- DOSYA İÇERİĞİ ---\n${att.text}\n--- DOSYA SONU ---\n\nKullanıcının isteği: ${text}`
    : text;
  attachedFile = null;
  renderAttachChip();

  appendMessage("user", displayText);
  checkUpdatesAfterFirstQuery();
  els.input.value = "";
  els.input.style.height = "auto";
  appendMessage("assistant", "Düşünüyorum...");

  const chat = currentChat();
  const placeholder = chat.messages[chat.messages.length - 1];
  // Streaming: token geldikçe placeholder'ı canlı güncelle (akış kapalıysa hiç gelmez)
  let streamBuf = "";
  let firstToken = true;
  let rafPending = false;
  const offStream = window.codega.onChatStream((token) => {
    if (firstToken) { clearTimeout(slowNotice); streamBuf = ""; firstToken = false; }
    streamBuf += token;
    placeholder.text = streamBuf;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        renderConversation();
        scrollConversationToBottom();
      });
    }
  });
  const slowNotice = setTimeout(() => {
    placeholder.text = "Biraz uzun düşünüyorum. Cevap gelmezse kısa süre içinde güvenli şekilde durduracağım.";
    renderConversation();
    scrollConversationToBottom();
  }, 8000);
  try {
    const answer = await window.codega.sendMessage(sendText);
    placeholder.text = answer.text; // final cevap otorite (akış bozulsa bile tam metin)
    await refreshModels();
  } catch (error) {
    placeholder.text = `Bir aksama oldu: ${error.message || error}`;
  } finally {
    clearTimeout(slowNotice);
    offStream();
    isSending = false;
  }
  saveChats(); // final cevabı diske yaz; yoksa kapatıp açınca "Düşünüyorum..." kalıyordu
  renderConversation();
  scrollConversationToBottom();
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  handleSubmit();
});

els.input.addEventListener("input", () => {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(140, els.input.scrollHeight)}px`;
});

els.input.addEventListener("keydown", (event) => {
  // Enter = gönder (Shift+Enter = yeni satır). Mac dahil tüm platformlarda
  // çalışsın diye requestSubmit yerine doğrudan handleSubmit çağrılır.
  const isEnter = event.key === "Enter" || event.keyCode === 13;
  if (isEnter && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    handleSubmit();
  }
});

document.getElementById("new-chat").addEventListener("click", () => createChat());
if (els.historySearch) els.historySearch.addEventListener("input", () => { historyQuery = els.historySearch.value; renderHistory(); });
els.settingsButton.addEventListener("click", async () => {
  els.settings.showModal();
  setActiveCat("overview");
  await refreshModels();
  await refreshAgentSettings();
  updateOverview();
  refreshImproveDrafts();
  window.codega.feedbackStats().then((f) => {
    const el = document.getElementById("ov-feedback");
    if (el && f) el.textContent = `👍 ${f.up || 0} · 👎 ${f.down || 0}`;
  }).catch(() => {});
  window.codega.analyzeSystem().then((sys) => {
    const el = document.getElementById("ov-system");
    const btn = document.getElementById("ov-use-recommended");
    if (!sys) return;
    if (el) el.textContent = `${sys.ramGB} GB RAM · ${sys.cores} çekirdek · ${sys.platform}/${sys.arch} → önerilen: ${sys.recommended.label}`;
    if (btn && sys.recommended) {
      btn.hidden = false;
      btn.onclick = async () => {
        btn.disabled = true;
        setTransientStatus(`${sys.recommended.label} indiriliyor… (Ollama)`);
        try {
          await window.codega.prepareModel(sys.recommended.id);
          setTransientStatus(`${sys.recommended.label} hazır.`);
        } catch (e) {
          setTransientStatus("Model indirilemedi: " + (e.message || e));
        } finally {
          btn.disabled = false;
        }
      };
    }
  }).catch(() => {});
});

// ===== Ayarlar Kontrol Merkezi: gezinme / arama / içe-dışa aktarma =====
const settingsCats = document.getElementById("settings-cats");
const settingsNav = document.getElementById("settings-nav");

function buildSettingsNav() {
  if (!settingsNav || !settingsCats) return;
  const groups = settingsCats.querySelectorAll(".settings-group[data-cat]");
  settingsNav.innerHTML = "";
  groups.forEach((g) => {
    g.open = true; // <details> içeriği daima render edilsin; görünürlüğü .active sınıfı yönetir
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-btn" + (g.classList.contains("active") ? " active" : "");
    btn.dataset.target = g.dataset.cat;
    btn.innerHTML = g.dataset.label || g.dataset.cat;
    btn.addEventListener("click", () => setActiveCat(g.dataset.cat));
    settingsNav.appendChild(btn);
  });
}

function setActiveCat(cat) {
  if (!settingsCats) return;
  const search = document.getElementById("settings-search");
  if (search) search.value = "";
  settingsCats.classList.remove("searching");
  settingsCats.querySelectorAll(".hidden-row").forEach((r) => r.classList.remove("hidden-row"));
  settingsCats.querySelectorAll(".settings-group[data-cat]").forEach((g) => {
    g.style.display = "";
    g.classList.toggle("active", g.dataset.cat === cat);
  });
  if (settingsNav) {
    settingsNav.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.target === cat);
    });
  }
}

function runSettingsSearch(q) {
  if (!settingsCats) return;
  const query = q.trim().toLocaleLowerCase("tr");
  if (!query) {
    const active = settingsCats.querySelector(".settings-group.active")?.dataset.cat || "overview";
    setActiveCat(active);
    return;
  }
  settingsCats.classList.add("searching");
  settingsCats.querySelectorAll(".settings-group[data-cat]").forEach((g) => {
    g.classList.add("active");
    let anyVisible = false;
    g.querySelectorAll(".settings-row, .settings-field").forEach((row) => {
      const match = row.textContent.toLocaleLowerCase("tr").includes(query);
      row.classList.toggle("hidden-row", !match);
      if (match) anyVisible = true;
    });
    g.style.display = anyVisible ? "block" : "none";
  });
}

function updateOverview() {
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.textContent = val; };
  const ollama = document.getElementById("ollama-row-status");
  if (ollama) set("ov-ollama", /çalışıyor/i.test(ollama.textContent) ? "Çalışıyor ✓" : "Kurulu değil");
  const ver = document.getElementById("version-label");
  if (ver) set("ov-version", ver.textContent || "—");
  const mem = document.getElementById("memory-summary");
  if (mem) set("ov-memory", (mem.textContent || "").slice(0, 40));
  if (agentSettings && (agentSettings.model || agentSettings.defaultModel)) {
    set("ov-model", agentSettings.model || agentSettings.defaultModel);
  }
}

// Arama kutusu (Enter dialog'u kapatmasın)
const settingsSearchInput = document.getElementById("settings-search");
if (settingsSearchInput) {
  settingsSearchInput.addEventListener("input", (e) => runSettingsSearch(e.target.value));
  settingsSearchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
}

// JSON dışa aktarma
const settingsExportBtn = document.getElementById("settings-export");
if (settingsExportBtn) {
  settingsExportBtn.addEventListener("click", async () => {
    try {
      const s = await window.codega.getSettings();
      const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "codega-ayarlar.json";
      a.click();
      setTransientStatus("Ayarlar dışa aktarıldı.");
    } catch (e) {
      setTransientStatus("Dışa aktarma başarısız: " + (e.message || e));
    }
  });
}

// JSON içe aktarma
const settingsImportBtn = document.getElementById("settings-import");
const settingsImportFile = document.getElementById("settings-import-file");
if (settingsImportBtn && settingsImportFile) {
  settingsImportBtn.addEventListener("click", () => settingsImportFile.click());
  settingsImportFile.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const data = JSON.parse(fr.result);
        if (!data || typeof data !== "object") throw new Error("geçersiz format");
        agentSettings = await window.codega.setSettings(data);
        applyAppearance(agentSettings);
        await refreshAgentSettings();
        updateOverview();
        setTransientStatus("Ayarlar içe aktarıldı ✓");
      } catch (err) {
        setTransientStatus("İçe aktarma başarısız: " + (err.message || err));
      }
      settingsImportFile.value = "";
    };
    fr.readAsText(file);
  });
}

// Ajanın topladığı öneri taslakları: listele + tek tıkla PR
async function refreshImproveDrafts() {
  const list = document.getElementById("improve-drafts-list");
  const status = document.getElementById("improve-drafts-status");
  if (!list) return;
  let drafts = [];
  try { drafts = (await window.codega.improveDrafts()) || []; } catch (_e) { drafts = []; }
  list.innerHTML = "";
  if (!drafts.length) {
    if (status) status.textContent = "Şu an taslak yok — ajan henüz dikkate değer tekrar eden bir sorun gözlemlemedi.";
    return;
  }
  if (status) status.textContent = `${drafts.length} taslak öneri (yerel). Birini PR olarak açabilirsin.`;
  drafts.forEach((d) => {
    const row = document.createElement("div");
    row.className = "settings-row";
    const info = document.createElement("div");
    info.innerHTML = `<strong>${d.idea}</strong><p>${d.rationale}</p>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "PR Aç";
    btn.addEventListener("click", async () => {
      const repo = (document.getElementById("improve-repo")?.value || "").trim();
      btn.disabled = true;
      setTransientStatus("Öneri PR'ı hazırlanıyor…");
      try {
        const res = await window.codega.proposeImprovement({ repo, idea: d.idea, rationale: d.rationale });
        if (res && res.url) {
          try { await navigator.clipboard.writeText(res.url); } catch {}
          setTransientStatus(`Öneri PR açıldı (#${res.number}) — link kopyalandı.`);
        } else setTransientStatus("PR açıldı ama link alınamadı.");
      } catch (e) {
        setTransientStatus("PR açılamadı: " + (e.message || e));
        btn.disabled = false;
      }
    });
    row.appendChild(info);
    row.appendChild(btn);
    list.appendChild(row);
  });
}
const improveRefresh = document.getElementById("improve-refresh");
if (improveRefresh) improveRefresh.addEventListener("click", refreshImproveDrafts);

function updateProviderVisibility() {
  if (!els.providerCloudFields || !els.providerSelect) return;
  els.providerCloudFields.style.display = els.providerSelect.value === "openai" ? "" : "none";
}
if (els.providerSelect) els.providerSelect.addEventListener("change", async () => {
  agentSettings = await window.codega.setSettings({ provider: els.providerSelect.value });
  updateProviderVisibility();
  setTransientStatus(els.providerSelect.value === "openai" ? "Bulut sağlayıcı seçildi." : "Yerel sağlayıcı seçildi.");
});
function bindProviderField(el, key) {
  if (!el) return;
  el.addEventListener("change", async () => { agentSettings = await window.codega.setSettings({ [key]: el.value.trim() }); });
}
bindProviderField(els.openaiBase, "openaiBaseUrl");
bindProviderField(els.openaiKey, "openaiApiKey");
bindProviderField(els.openaiModel, "openaiModel");
if (els.providerTest) els.providerTest.addEventListener("click", async () => {
  els.providerTest.disabled = true;
  setTransientStatus("Bağlantı test ediliyor…");
  try {
    const r = await window.codega.testProvider({
      baseUrl: els.openaiBase ? els.openaiBase.value.trim() : "",
      apiKey: els.openaiKey ? els.openaiKey.value.trim() : "",
      model: els.openaiModel ? els.openaiModel.value.trim() : "",
    });
    setTransientStatus((r && r.message) || (r && r.ok ? "Bağlantı başarılı." : "Bağlantı başarısız."));
  } catch (e) {
    setTransientStatus("Test hatası: " + (e.message || e));
  } finally {
    els.providerTest.disabled = false;
  }
});

buildSettingsNav();

// Denetimli kendini geliştirme: öneriyi PR olarak aç
const improveSubmit = document.getElementById("improve-submit");
if (improveSubmit) {
  improveSubmit.addEventListener("click", async () => {
    const repo = (document.getElementById("improve-repo")?.value || "").trim();
    const idea = (document.getElementById("improve-idea")?.value || "").trim();
    if (!idea) { setTransientStatus("Önce bir öneri metni yaz."); return; }
    improveSubmit.disabled = true;
    setTransientStatus("Öneri PR'ı hazırlanıyor…");
    try {
      const res = await window.codega.proposeImprovement({ repo, idea });
      if (res && res.url) {
        try { await navigator.clipboard.writeText(res.url); } catch {}
        setTransientStatus(`Öneri PR açıldı (#${res.number}) — link kopyalandı.`);
        const ideaEl = document.getElementById("improve-idea");
        if (ideaEl) ideaEl.value = "";
      } else {
        setTransientStatus("PR açıldı ama link alınamadı.");
      }
    } catch (e) {
      setTransientStatus("Öneri PR'ı açılamadı: " + (e.message || e));
    } finally {
      improveSubmit.disabled = false;
    }
  });
}

// Kendi kendine bakım: elle çalıştır + sonucu göster
function summarizeMaintenance(rep) {
  if (!rep || !rep.items) return "Bakım bilgisi yok.";
  const oll = rep.items.find((i) => i.name === "ollama");
  const parts = [`Ollama: ${oll && oll.status === "ok" ? "çalışıyor ✓" : "kapalı"}`];
  if (rep.repairs && rep.repairs.length) parts.push(`onarıldı: ${rep.repairs.join(", ")}`);
  else parts.push("onarım gerekmedi");
  return parts.join(" · ");
}
if (els.runMaintenance) {
  els.runMaintenance.addEventListener("click", async () => {
    els.runMaintenance.disabled = true;
    try {
      const rep = await window.codega.runMaintenance();
      const txt = summarizeMaintenance(rep);
      const ov = document.getElementById("ov-maintenance");
      if (ov) ov.textContent = txt;
      setTransientStatus("Bakım tamam — " + txt);
    } catch (e) {
      setTransientStatus("Bakım başarısız: " + (e.message || e));
    } finally {
      els.runMaintenance.disabled = false;
    }
  });
}

let agentSettings = null;

const FONT_SIZES = { kucuk: "14px", orta: "16px", buyuk: "18px" };

function applyAppearance(s) {
  if (!s) return;
  const theme = s.theme || "oled";
  const accent = s.accent || "#f59e0b";
  const fontScale = s.fontScale || "orta";
  document.body.dataset.theme = theme;
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--chat-font", FONT_SIZES[fontScale] || "16px");
  document.querySelectorAll(".theme-btn").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.themeValue === theme))
  );
  document.querySelectorAll(".font-btn").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.font === fontScale))
  );
  document.querySelectorAll("#accent-swatches .swatch").forEach((b) =>
    b.setAttribute(
      "aria-pressed",
      String((b.dataset.accent || "").toLowerCase() === accent.toLowerCase())
    )
  );
}

async function setAppearance(patch) {
  agentSettings = await window.codega.setSettings(patch);
  applyAppearance(agentSettings);
  const what = patch.theme ? "Tema" : patch.accent ? "Vurgu rengi" : patch.fontScale ? "Yazı boyutu" : "Görünüm";
  setTransientStatus(`${what} uygulandı.`);
}

document.querySelectorAll(".theme-btn").forEach((b) =>
  b.addEventListener("click", () => setAppearance({ theme: b.dataset.themeValue }))
);
document.querySelectorAll(".font-btn").forEach((b) =>
  b.addEventListener("click", () => setAppearance({ fontScale: b.dataset.font }))
);
document.querySelectorAll("#accent-swatches .swatch").forEach((b) =>
  b.addEventListener("click", () => setAppearance({ accent: b.dataset.accent }))
);

// Açılışta kayıtlı görünümü uygula
window.codega
  .getSettings()
  .then((s) => {
    agentSettings = s;
    applyAppearance(s);
  })
  .catch(() => {});

function applyToggleLabel(button, on) {
  if (!button) return;
  // Prototipteki kaydırmalı "pill" anahtar görünümü (metin yerine görsel switch)
  button.classList.add("switch");
  button.classList.toggle("on", !!on);
  button.setAttribute("aria-pressed", on ? "true" : "false");
  button.setAttribute("aria-label", on ? "Açık" : "Kapalı");
  button.title = on ? "Açık" : "Kapalı";
  button.textContent = "";
}

async function refreshAgentSettings() {
  try {
    agentSettings = await window.codega.getSettings();
    applyToggleLabel(els.toggleLearning, !!agentSettings.autonomousLearning);
    applyToggleLabel(els.toggleHuman, !!agentSettings.humanTone);
    applyToggleLabel(els.toggleReflection, !!agentSettings.selfReflection);
    applyToggleLabel(els.togglePlanner, !!agentSettings.planner);
    applyToggleLabel(els.toggleMultiAgent, !!agentSettings.multiAgent);
    applyToggleLabel(els.toggleMaintenance, agentSettings.selfMaintenance !== false);
    if (els.toggleAutoPropose) applyToggleLabel(els.toggleAutoPropose, !!agentSettings.autoProposePR);
    if (els.expertSelect) els.expertSelect.value = agentSettings.expertMode || "genel";
    if (els.toggleStreaming) applyToggleLabel(els.toggleStreaming, agentSettings.streaming !== false);
    if (els.providerSelect) els.providerSelect.value = agentSettings.provider || "ollama";
    if (els.openaiBase) els.openaiBase.value = agentSettings.openaiBaseUrl || "";
    if (els.openaiKey) els.openaiKey.value = agentSettings.openaiApiKey || "";
    if (els.openaiModel) els.openaiModel.value = agentSettings.openaiModel || "";
    updateProviderVisibility();
    applyAppearance(agentSettings);
    applyToggleLabel(els.toggleFederation, !!agentSettings.federation);
    applyToggleLabel(els.toggleIdle, !!agentSettings.idleLearning);
    els.knowledgeRepo.value = agentSettings.knowledgeRepo || "";
    els.githubToken.value = "";
    els.githubToken.placeholder = agentSettings.githubToken
      ? "•••• (kayıtlı — değiştirmek için yaz)"
      : "GitHub token (ghp_...)";
  } catch (_e) {
    /* ayar okunamadı */
  }
  try {
    const facts = await window.codega.listMemory();
    els.memorySummary.textContent = facts.length
      ? `${facts.length} şey öğrenildi.`
      : "Henüz bir şey öğrenmedim.";
    els.memoryList.innerHTML = facts
      .map((f) => `<div class="model-row"><div><p>${escapeHtml(f)}</p></div></div>`)
      .join("");
  } catch (_e) {
    /* hafıza okunamadı */
  }
  try {
    const rs = await window.codega.ragStats();
    els.ragStats.textContent = rs.chunks
      ? `${rs.documents} doküman / ${rs.chunks} parça (${rs.embedded} gömülü).`
      : "Doküman/not ekle; sorularında bunlardan yararlanır.";
  } catch (_e) {
    /* rag okunamadı */
  }
}

els.ragAdd.addEventListener("click", async () => {
  const text = els.ragText.value.trim();
  if (!text) {
    setTransientStatus("Eklenecek metin boş.");
    return;
  }
  els.ragAdd.disabled = true;
  els.ragStats.textContent = "Bilgi tabanına ekleniyor...";
  try {
    const res = await window.codega.ragIngest({
      title: els.ragTitle.value.trim() || "Doküman",
      text,
    });
    els.ragText.value = "";
    els.ragTitle.value = "";
    setTransientStatus(
      res.embedded
        ? `Eklendi: ${res.added} parça (semantik gömme ile).`
        : `Eklendi: ${res.added} parça (Ollama kapalı → anahtar kelime modu).`
    );
    await refreshAgentSettings();
  } catch (error) {
    setTransientStatus(`Eklenemedi: ${error.message || error}`);
  } finally {
    els.ragAdd.disabled = false;
  }
});

els.ragClear.addEventListener("click", async () => {
  els.ragClear.disabled = true;
  try {
    await window.codega.ragClear();
    await refreshAgentSettings();
    setTransientStatus("Bilgi tabanı temizlendi.");
  } finally {
    els.ragClear.disabled = false;
  }
});

async function saveGithubFields() {
  const patch = { knowledgeRepo: els.knowledgeRepo.value.trim() };
  const tok = els.githubToken.value.trim();
  if (tok) patch.githubToken = tok;
  agentSettings = await window.codega.setSettings(patch);
}

els.githubTest.addEventListener("click", async () => {
  els.githubTest.disabled = true;
  els.knowledgeStatus.textContent = "GitHub test ediliyor...";
  try {
    await saveGithubFields();
    const me = await window.codega.testGithub();
    els.knowledgeStatus.textContent = `Bağlandı: ${me.login}`;
  } catch (error) {
    els.knowledgeStatus.textContent = `Bağlanamadı: ${error.message || error}`;
  } finally {
    els.githubTest.disabled = false;
  }
});

els.toggleIdle.addEventListener("click", () => toggleSetting("idleLearning", els.toggleIdle));

els.installOllama.addEventListener("click", async () => {
  els.installOllama.disabled = true;
  try {
    await window.codega.installOllama();
    setTransientStatus("Ollama indirme sayfası açıldı. Kurduktan sonra uygulamayı yeniden başlat.");
  } catch (error) {
    setTransientStatus(`Açılamadı: ${error.message || error}`);
  } finally {
    els.installOllama.disabled = false;
  }
});

els.knowledgeUp.addEventListener("click", async () => {
  els.knowledgeUp.disabled = true;
  els.knowledgeStatus.textContent = "GitHub'a kaydediliyor...";
  try {
    await saveGithubFields();
    const res = await window.codega.syncKnowledgeUp();
    els.knowledgeStatus.textContent = res.ok
      ? `Kaydedildi: ${res.added} yeni bilgi.`
      : `Olmadı: ${res.reason}`;
  } catch (error) {
    els.knowledgeStatus.textContent = `Hata: ${error.message || error}`;
  } finally {
    els.knowledgeUp.disabled = false;
  }
});

els.knowledgeDown.addEventListener("click", async () => {
  els.knowledgeDown.disabled = true;
  els.knowledgeStatus.textContent = "GitHub'tan okunuyor...";
  try {
    await saveGithubFields();
    const res = await window.codega.syncKnowledgeDown();
    els.knowledgeStatus.textContent = res.ok
      ? `Okundu: ${res.loaded} bilgi yüklendi.`
      : `Olmadı: ${res.reason}`;
    await refreshAgentSettings();
  } catch (error) {
    els.knowledgeStatus.textContent = `Hata: ${error.message || error}`;
  } finally {
    els.knowledgeDown.disabled = false;
  }
});

async function toggleSetting(key, button) {
  if (!agentSettings) agentSettings = await window.codega.getSettings();
  const next = !agentSettings[key];
  button.disabled = true;
  try {
    agentSettings = await window.codega.setSettings({ [key]: next });
    applyToggleLabel(button, !!agentSettings[key]);
  } finally {
    button.disabled = false;
  }
}

els.toggleLearning.addEventListener("click", () => toggleSetting("autonomousLearning", els.toggleLearning));
els.toggleHuman.addEventListener("click", () => toggleSetting("humanTone", els.toggleHuman));
els.toggleReflection.addEventListener("click", () => toggleSetting("selfReflection", els.toggleReflection));
els.togglePlanner.addEventListener("click", () => toggleSetting("planner", els.togglePlanner));
els.toggleMultiAgent.addEventListener("click", () => toggleSetting("multiAgent", els.toggleMultiAgent));
if (els.toggleMaintenance) els.toggleMaintenance.addEventListener("click", () => toggleSetting("selfMaintenance", els.toggleMaintenance));
if (els.toggleAutoPropose) els.toggleAutoPropose.addEventListener("click", () => toggleSetting("autoProposePR", els.toggleAutoPropose));
if (els.toggleStreaming) els.toggleStreaming.addEventListener("click", () => toggleSetting("streaming", els.toggleStreaming));
if (els.expertSelect) els.expertSelect.addEventListener("change", async () => { agentSettings = await window.codega.setSettings({ expertMode: els.expertSelect.value }); setTransientStatus("Uzman modu: " + els.expertSelect.value); });
els.toggleFederation.addEventListener("click", () => toggleSetting("federation", els.toggleFederation));
els.clearMemory.addEventListener("click", async () => {
  els.clearMemory.disabled = true;
  try {
    await window.codega.clearMemory();
    await refreshAgentSettings();
  } finally {
    els.clearMemory.disabled = false;
  }
});
els.prepareModel.addEventListener("click", async () => {
  els.prepareModel.disabled = true;
  els.modelDetail.textContent = "Zeka paketi hazırlanıyor...";
  try {
    const status = await window.codega.prepareModel();
    setModelStatus(status);
    await refreshModels();
  } finally {
    els.prepareModel.disabled = false;
  }
});
els.modelList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-model]");
  if (!button) return;
  button.disabled = true;
  els.modelDetail.textContent = "Zeka paketi indiriliyor...";
  try {
    const status = await window.codega.prepareModel(button.dataset.model);
    setModelStatus(status);
    await refreshModels();
  } finally {
    button.disabled = false;
  }
});
els.checkUpdate.addEventListener("click", async () => {
  els.checkUpdate.disabled = true;
  manualUpdateCheck = true;
  els.updateDetail.textContent = "Güncelleme kontrol ediliyor...";
  setTransientStatus("Güncelleme kontrol ediliyor…");
  try {
    await window.codega.checkForUpdates();
  } catch (error) {
    els.updateDetail.textContent = `Güncelleme kontrol edilemedi: ${error.message || error}`;
    setTransientStatus(`Güncelleme kontrol edilemedi: ${error.message || error}`);
  } finally {
    els.checkUpdate.disabled = false;
  }
});
els.downloadUpdate.addEventListener("click", async () => {
  els.downloadUpdate.disabled = true;
  els.updateDetail.textContent = "Güncelleme indiriliyor...";
  try {
    await window.codega.downloadUpdate();
  } catch (error) {
    els.updateDetail.textContent = `Güncelleme indirilemedi: ${error.message || error}`;
    els.downloadUpdate.disabled = false;
  }
});
els.installUpdate.addEventListener("click", () => window.codega.installUpdate());
els.updateLater.addEventListener("click", closeUpdatePrompt);
els.updateLaterX.addEventListener("click", closeUpdatePrompt);
els.updateNow.addEventListener("click", async () => {
  els.updateNow.disabled = true;
  try {
    if (state.updatePromptState === "ready") {
      await window.codega.installUpdate();
    } else {
      els.updatePromptDetail.textContent = "Güncelleme indiriliyor. Hazır olunca tekrar soracağım.";
      await window.codega.downloadUpdate();
    }
  } catch (error) {
    els.updatePromptDetail.textContent = `Güncelleme başlatılamadı: ${error.message || error}`;
  } finally {
    els.updateNow.disabled = false;
  }
});

window.codega.onModelStatus((status) => {
  setModelStatus(status);
  refreshModels();
});
window.codega.onUpdateStatus((payload) => {
  const state = payload?.state || "unknown";
  const detail = payload?.detail || {};
  const messages = {
    checking: "Güncelleme kontrol ediliyor...",
    available: "Yeni sürüm bulundu. İndirmeye hazır.",
    "not-available": detail.reason === "development"
      ? "Güncelleme kontrolü paketlenmiş uygulamada çalışır."
      : "Güncel sürümü kullanıyorsun.",
    downloading: `Güncelleme indiriliyor${detail.percent ? `: %${Math.round(detail.percent)}` : "..."}`,
    ready: "Güncelleme indirildi. Kurulum için yeniden başlatabilirsin.",
    error: detail.message ? `Güncelleme hatası: ${detail.message}` : "Güncelleme kontrolü tamamlanamadı.",
  };
  els.updateDetail.textContent = messages[state] || `Durum: ${state}`;
  if (state === "checking" || state === "not-available" || state === "error") {
    els.updateActions.hidden = true;
    els.downloadUpdate.disabled = false;
    els.installUpdate.hidden = true;
  }
  if (state === "available") {
    els.updateActions.hidden = false;
    els.installUpdate.hidden = true;
    els.downloadUpdate.disabled = false;
    showUpdatePrompt("available", detail);
  }
  if (state === "ready") {
    els.updateActions.hidden = false;
    els.downloadUpdate.disabled = true;
    els.installUpdate.hidden = false;
    showUpdatePrompt("ready", detail);
  }
  // Elle kontrolde görünür geri bildirim (sonuç gizli sekmede kalmasın)
  if (manualUpdateCheck && (state === "not-available" || state === "error")) {
    setTransientStatus(messages[state] || "Güncelleme kontrolü tamamlandı.");
  }
  if (state !== "checking" && state !== "downloading") manualUpdateCheck = false;
});

loadChats();
restoreSharedChatFromHash();
if (!state.chats.length) {
  createChat();
} else {
  renderHistory();
  renderConversation();
}
refreshStatus();
