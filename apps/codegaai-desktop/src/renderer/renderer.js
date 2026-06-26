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
  scrollBottomBtn: document.getElementById("scroll-bottom-btn"),
  welcome: document.getElementById("welcome"),
  form: document.getElementById("chat-form"),
  input: document.getElementById("prompt-input"),
  sendBtn: document.getElementById("send-btn"),
  stopBtn: document.getElementById("stop-btn"),
  brainBtn: document.getElementById("brain-btn"),
  brainPanel: document.getElementById("brain-panel"),
  brainInput: document.getElementById("brain-input"),
  historySearch: document.getElementById("history-search"),
  modelPill: document.getElementById("model-pill"),
  setupDialog: document.getElementById("setup-dialog"),
  setupTitle: document.getElementById("setup-title"),
  setupClose: document.getElementById("setup-close"),
  setupBar: document.getElementById("setup-bar"),
  setupStatus: document.getElementById("setup-status"),
  settings: document.getElementById("settings-dialog"),
  settingsButton: document.getElementById("settings-button"),
  prepareModel: document.getElementById("prepare-model"),
  modelDetail: document.getElementById("model-detail"),
  modelStoragePath: document.getElementById("model-storage-path"),
  modelStorageStatus: document.getElementById("model-storage-status"),
  moveModelStorage: document.getElementById("move-model-storage"),
  modelList: document.getElementById("model-list"),
  modelDownload: document.getElementById("model-download"),
  modelDownloadTitle: document.getElementById("model-download-title"),
  modelDownloadPercent: document.getElementById("model-download-percent"),
  modelDownloadBar: document.getElementById("model-download-bar"),
  modelDownloadSize: document.getElementById("model-download-size"),
  modelDownloadSpeed: document.getElementById("model-download-speed"),
  checkUpdate: document.getElementById("check-update"),
  updateDetail: document.getElementById("update-detail"),
  updateActions: document.getElementById("update-actions"),
  downloadUpdate: document.getElementById("download-update"),
  installUpdate: document.getElementById("install-update"),
  updatePrompt: document.getElementById("update-prompt"),
  updatePromptTitle: document.getElementById("update-prompt-title"),
  updatePromptDetail: document.getElementById("update-prompt-detail"),
  updateProgress: document.getElementById("update-progress"),
  updateProgressPercent: document.getElementById("update-progress-percent"),
  updateProgressSpeed: document.getElementById("update-progress-speed"),
  updateProgressBar: document.getElementById("update-progress-bar"),
  updateProgressSize: document.getElementById("update-progress-size"),
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
  toggleAutonomousDevelopment: document.getElementById("toggle-autonomous-development"),
  toggleAutonomousSchedule: document.getElementById("toggle-autonomous-schedule"),
  developmentRepo: document.getElementById("development-repo"),
  developmentPaths: document.getElementById("development-paths"),
  developmentInterval: document.getElementById("development-interval"),
  developmentTask: document.getElementById("development-task"),
  developmentRun: document.getElementById("development-run"),
  developmentStatus: document.getElementById("development-status"),
  expertSelect: document.getElementById("expert-select"),
  toggleStreaming: document.getElementById("toggle-streaming"),
  toggleModelFallback: document.getElementById("toggle-model-fallback"),
  modelFallbackOrder: document.getElementById("model-fallback-order"),
  saveModelFallback: document.getElementById("save-model-fallback"),
  toggleContinuous: document.getElementById("toggle-continuous"),
  toggleSemantic: document.getElementById("toggle-semantic"),
  toggleMcpAuto: document.getElementById("toggle-mcp-auto"),
  toggleDistill: document.getElementById("toggle-distill"),
  learnTopics: document.getElementById("learn-topics"),
  learnRepo: document.getElementById("learn-repo"),
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
  toggleModelUpdates: document.getElementById("toggle-model-updates"),
  modelUpdatesCheck: document.getElementById("model-updates-check"),
  modelUpdatesSummary: document.getElementById("model-updates-summary"),
  modelUpdatesList: document.getElementById("model-updates-list"),
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
    els.modelPill.textContent = previous || "HazÃ„Â±r";
  }, 2400);
}

function focusComposer() {
  if (!els.input) return;
  els.input.disabled = false;
  els.input.readOnly = false;
  const apply = () => {
    try {
      els.input.focus({ preventScroll: true });
      const end = els.input.value.length;
      els.input.setSelectionRange(end, end);
    } catch (_e) {
      els.input.focus();
    }
  };
  apply();
  requestAnimationFrame(apply);
  window.setTimeout(apply, 0);
  window.setTimeout(apply, 80);
}

function resetComposer() {
  if (!els.input) return;
  els.input.value = "";
  els.input.style.height = "auto";
  focusComposer();
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
            text: message.role === "assistant"
              ? cleanStoredAssistantOutput(message.text)
              : String(message.text || ""),
            createdAt: Number(message.createdAt) || Date.now(),
          }))
      : [],
    context: String(chat.context || ""),
    updatedAt: Number(chat.updatedAt) || Date.now(),
  };
}

function foldAssistantOutput(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .replace(/\u0131/g, "i")
    .replace(/\u011f/g, "g")
    .replace(/\u00fc/g, "u")
    .replace(/\u015f/g, "s")
    .replace(/\u00f6/g, "o")
    .replace(/\u00e7/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanStoredAssistantOutput(value) {
  const original = String(value || "").trim();
  const internalLabel = "(?:TEST(?:\\s+[A-Z])?|MLVC|ARL|SSV|SACV|\\u0130nsan Yorumu|Human Comment)";
  const hasInternalDump = new RegExp(`(?:^|[\\n|])\\s*${internalLabel}\\s*:`, "im").test(original);
  if (!hasInternalDump) return original;
  const finalMatch = original.match(/Final Answer\s*:\s*([\s\S]*)$/i);
  const source = finalMatch ? finalMatch[1] : original;
  const stripLabel = new RegExp(`^\\s*${internalLabel}\\s*:\\s*`, "i");
  const candidates = source.split(/\s*\|\s*|\r?\n+/)
    .map((part) => part.replace(stripLabel, "").trim())
    .filter(Boolean);
  const keyFor = (text) => {
    const folded = foldAssistantOutput(text);
    if (/\b(?:kedi|cat)\b/.test(folded) && /\b(?:cember|dairesel|circle)\b/.test(folded)) return "cats-circle";
    if (/\b100\b/.test(folded) && /\b(?:kapi|door)\b/.test(folded) && /\b10\b/.test(folded)) return "doors-10";
    if (/\b(?:ikinci|second)\b/.test(folded) && /\b(?:gec|pass|overtake)\w*/.test(folded)) return "pass-second";
    if (/\b(?:birinci|first)\b/.test(folded) && /\b(?:gec|pass|overtake)\w*/.test(folded)) return "pass-first";
    return folded.replace(/[^a-z0-9]+/g, " ").trim();
  };
  const groups = [];
  for (const candidate of candidates) {
    const key = keyFor(candidate);
    const existing = groups.find((entry) => entry.key === key);
    if (!existing) groups.push({ key, answer: candidate });
    else if (candidate.length < existing.answer.length) existing.answer = candidate;
  }
  if (!groups.length) return original;
  if (groups.length === 1) return groups[0].answer;
  return groups.map((entry, index) => `Test ${index + 1}: ${entry.answer}`).join("\n");
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeChat: state.activeChat,
      chats: state.chats,
    }));
  } catch (error) {
    console.warn("Sohbet geÃƒÂ§miÃ…Å¸i kaydedilemedi", error);
  }
}

function cleanupStuckPlaceholders(chats) {
  // Ãƒâ€“nceki oturumda cevap gelmeden kapatÃ„Â±lmÃ„Â±Ã…Å¸ mesajlar "DÃƒÂ¼Ã…Å¸ÃƒÂ¼nÃƒÂ¼yorum..." olarak
  // kalmÃ„Â±Ã…Å¸ olabilir. BunlarÃ„Â± anlaÃ…Å¸Ã„Â±lÃ„Â±r bir nota ÃƒÂ§evir (yanÃ„Â±ltÃ„Â±cÃ„Â± durmasÃ„Â±n).
  const dead = [
    "DÃƒÂ¼Ã…Å¸ÃƒÂ¼nÃƒÂ¼yorum...",
    "Biraz uzun dÃƒÂ¼Ã…Å¸ÃƒÂ¼nÃƒÂ¼yorum. Cevap gelmezse kÃ„Â±sa sÃƒÂ¼re iÃƒÂ§inde gÃƒÂ¼venli Ã…Å¸ekilde durduracaÃ„Å¸Ã„Â±m.",
    "Ãƒâ€¡alÃ„Â±Ã…Å¸ma ÃƒÂ¶zeti: cevap beklenenden uzun sÃƒÂ¼rÃƒÂ¼yor; modeli ve doÃ„Å¸rulama adÃ„Â±mlarÃ„Â±nÃ„Â± izliyorum.",
  ];
  for (const chat of chats) {
    for (const m of chat.messages || []) {
      if (m.role === "assistant" && dead.includes(String(m.text || "").trim())) {
        m.text = "(yanÃ„Â±t tamamlanmadÃ„Â± Ã¢â‚¬â€ uygulama kapanmÃ„Â±Ã…Å¸ olabilir)";
      }
    }
  }
  return chats;
}

function isInvisibleProgressToken(token) {
  return String(token || "").replace(/\u200b/g, "").trim() === "";
}

function longThinkingNotice() {
  return "YanÃ„Â±t beklenenden uzun sÃƒÂ¼rÃƒÂ¼yor; model ÃƒÂ§alÃ„Â±Ã…Å¸maya devam ediyor.";
}

function oneMinuteStatusNotice(lastStatus) {
  return `${String(lastStatus || longThinkingNotice()).trim()} Bir dakikayÃ„Â± geÃƒÂ§ti; istersen Durdur dÃƒÂ¼Ã„Å¸mesiyle kesebilirsin.`;
}

function repairRendererMojibake(value) {
  return String(value || "")
    .replace(/ÃƒÆ’Ã¢â‚¬Â¡/g, "Ãƒâ€¡")
    .replace(/ÃƒÆ’Ã‚Â§/g, "ÃƒÂ§")
    .replace(/ÃƒÆ’Ã¢â‚¬â€œ/g, "Ãƒâ€“")
    .replace(/ÃƒÆ’Ã‚Â¶/g, "ÃƒÂ¶")
    .replace(/ÃƒÆ’Ã…â€œ/g, "ÃƒÅ“")
    .replace(/ÃƒÆ’Ã‚Â¼/g, "ÃƒÂ¼")
    .replace(/Ãƒâ€Ã‚Â°/g, "Ã„Â°")
    .replace(/Ãƒâ€Ã‚Â±/g, "Ã„Â±")
    .replace(/Ãƒâ€Ã…Â¾/g, "Ã„Â")
    .replace(/Ãƒâ€Ã…Â¸/g, "Ã„Å¸")
    .replace(/Ãƒâ€¦Ã…Â¾/g, "Ã…Â")
    .replace(/Ãƒâ€¦Ã…Â¸/g, "Ã…Å¸");
}
function setChatWorkingStatus(value) {
  const text = typeof value === "string" ? value : value?.text;
  if (!text || !els.modelPill) return;
  els.modelPill.textContent = String(text).replace(/^Ãƒâ€¡alÃ„Â±Ã…Å¸ma ÃƒÂ¶zeti:\s*/i, "").trim();
}

function createStreamView(placeholder) {
  return {
    answer: "",
    firstContent: true,
    apply(token) {
      if (isInvisibleProgressToken(token)) return "ignored";
      const text = String(token || "");
      if (this.firstContent) {
        this.answer = "";
        this.firstContent = false;
      }
      this.answer += text;
      placeholder.text = this.answer;
      return "answer";
    },
    showSlowNotice() {
      if (!this.answer.trim()) setChatWorkingStatus(longThinkingNotice());
    },
    showOneMinuteNotice() {
      if (!this.answer.trim()) setChatWorkingStatus(oneMinuteStatusNotice());
    },
  };
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
    saveChats();
  } catch (error) {
    console.warn("Sohbet geÃƒÂ§miÃ…Å¸i okunamadÃ„Â±", error);
    state.chats = [];
    state.activeChat = null;
  }
}

function createChat(title = "Yeni sohbet") {
  const chat = {
    id: crypto.randomUUID(),
    title,
    messages: [],
    context: "",
    updatedAt: Date.now(),
  };
  state.chats.unshift(chat);
  state.activeChat = chat.id;
  saveChats();
  renderHistory();
  renderConversation();
  resetComposer();
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

function formatChatAge(ts) {
  const diff = Math.max(0, Date.now() - (Number(ts) || Date.now()));
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  if (diff < minute) return "Ã…Å¸imdi";
  if (diff < hour) return `${Math.floor(diff / minute)} dk.`;
  if (diff < day) return `${Math.floor(diff / hour)} sa.`;
  if (diff < week) return `${Math.floor(diff / day)} gÃƒÂ¼n`;
  return `${Math.floor(diff / week)} hafta`;
}

function renderHistory() {
  const q = (historyQuery || "").trim();
  const visible = state.chats.filter((chat) => chatMatchesQuery(chat, q));
  if (q && !visible.length) {
    els.history.innerHTML = `<p class="history-empty">"${escapeHtml(q)}" iÃƒÂ§in sohbet bulunamadÃ„Â±.</p>`;
    return;
  }
  els.history.innerHTML = visible.map((chat) => `
    <div class="history-entry ${chat.id === state.activeChat ? "active" : ""}">
      <button class="history-item" data-chat="${chat.id}">
        <span class="history-title">${escapeHtml(chat.title)}</span>
        <span class="history-time">${escapeHtml(formatChatAge(chat.updatedAt))}</span>
      </button>
      <div class="history-actions" aria-label="Sohbet iÃ…Å¸lemleri">
        <button type="button" data-share-chat="${chat.id}" title="Link olarak paylaÃ…Å¸" aria-label="Link olarak paylaÃ…Å¸">Ã¢â€ â€”</button>
        <button type="button" data-zip-chat="${chat.id}" title="ZIP olarak indir" aria-label="ZIP olarak indir">Ã¢â€ â€œ</button>
        <button type="button" data-delete-chat="${chat.id}" title="Sohbeti sil" aria-label="Sohbeti sil">Ãƒâ€”</button>
      </div>
    </div>
  `).join("");

  els.history.querySelectorAll("[data-chat]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeChat = button.dataset.chat;
      saveChats();
      renderHistory();
      renderConversation();
      focusComposer();
      if (typeof syncBrainField === "function") {
        syncBrainField();
        if (els.brainBtn) els.brainBtn.classList.toggle("on", !!(currentChat().context || "").trim());
      }
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
  document.body.classList.toggle("empty-chat", !chat.messages.length);
  if (!chat.messages.length) {
    els.conversation.appendChild(els.welcome);
    return;
  }

  for (let idx = 0; idx < chat.messages.length; idx++) {
    const message = chat.messages[idx];
    const node = document.createElement("article");
    node.className = `message ${message.role}`;
    const ts = message.createdAt ? new Date(message.createdAt) : null;
    const tsText = ts ? ts.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";
    node.innerHTML = `
      <div class="role">${message.role === "user" ? "SEN" : "CODEGA AI"}</div>
      <div>${escapeHtml(message.text).replace(/\n/g, "<br>")}</div>
      ${tsText ? `<div class="msg-time">${tsText}</div>` : ""}
    `;
    // Asistan cevaplarÃ„Â±na geri bildirim (ÄŸÅ¸â€˜Â/ÄŸÅ¸â€˜Â) Ã¢â‚¬â€ son cevap hÃƒÂ¢lÃƒÂ¢ yazÃ„Â±lÃ„Â±yorsa ekleme
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
        b.title = rating === "up" ? "Ã„Â°yi cevap" : "KÃƒÂ¶tÃƒÂ¼ cevap (iyileÃ…Å¸tirme iÃƒÂ§in iÃ…Å¸aretle)";
        b.addEventListener("click", async () => {
          bar.querySelectorAll(".fb-btn").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
          try { await window.codega.recordFeedback({ rating, text: message.text, prompt }); } catch (_e) {}
          setTransientStatus(rating === "up" ? "TeÃ…Å¸ekkÃƒÂ¼rler Ã¢â‚¬â€ olumlu geri bildirim kaydedildi." : "Not aldÃ„Â±m Ã¢â‚¬â€ bunu iyileÃ…Å¸tirme iÃƒÂ§in iÃ…Å¸aretledim.");
        });
        return b;
      };
      bar.appendChild(mkBtn("up", "ÄŸÅ¸â€˜Â"));
      bar.appendChild(mkBtn("down", "ÄŸÅ¸â€˜Â"));
      // Kopyala Ã¢â‚¬â€ tÃƒÂ¼m bÃƒÂ¼yÃƒÂ¼k sohbet arayÃƒÂ¼zlerinde olan evrensel eylem
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "fb-btn";
      copyBtn.textContent = "ÄŸÅ¸â€œâ€¹";
      copyBtn.title = "CevabÃ„Â± kopyala";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(message.text);
          setTransientStatus("Cevap kopyalandÃ„Â±.");
        } catch (_e) {
          setTransientStatus("KopyalanamadÃ„Â±.");
        }
      });
      bar.appendChild(copyBtn);
      // Yeniden ÃƒÂ¼ret Ã¢â‚¬â€ yalnÃ„Â±zca son cevapta ve gÃƒÂ¶nderim yokken
      if (idx === chat.messages.length - 1 && !isSending) {
        const regen = document.createElement("button");
        regen.type = "button";
        regen.className = "fb-btn";
        regen.textContent = "ÄŸÅ¸â€â€";
        regen.title = "Yeniden ÃƒÂ¼ret";
        regen.addEventListener("click", () => regenerateLast());
        bar.appendChild(regen);
      }
      node.appendChild(bar);
    }
    els.conversation.appendChild(node);
  }
  scrollConversationToBottom();
}

document.querySelectorAll("[data-starter-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    els.input.value = button.dataset.starterPrompt || "";
    els.input.dispatchEvent(new Event("input", { bubbles: true }));
    focusComposer();
  });
});

document.querySelectorAll("[data-starter-action='attach']").forEach((button) => {
  button.addEventListener("click", () => document.getElementById("file-input")?.click());
});

// Hangi elemanÃ„Â±n gerÃƒÂ§ekten kaydÃ„Â±Ã„Å¸Ã„Â±nÃ„Â± bul (conversation iÃƒÂ§ kaydÃ„Â±rÃ„Â±cÃ„Â±ysa o, deÃ„Å¸ilse pencere).
function _getScroller() {
  const c = els.conversation;
  if (c && c.scrollHeight > c.clientHeight + 8) return c;
  return null; // null => pencere kayÃ„Â±yor
}
function _isNearBottom(threshold = 140) {
  const c = _getScroller();
  if (c) return c.scrollHeight - c.scrollTop - c.clientHeight < threshold;
  const doc = document.documentElement;
  return doc.scrollHeight - window.scrollY - window.innerHeight < threshold;
}
function _scrollToBottomNow() {
  const c = _getScroller();
  if (c) c.scrollTop = c.scrollHeight;
  else window.scrollTo(0, document.documentElement.scrollHeight);
}

let stickToBottom = true; // kullanÃ„Â±cÃ„Â± yukarÃ„Â± kaymadÃ„Â±ysa dibe yapÃ„Â±Ã…Å¸Ã„Â±k kal
function updateScrollButton() {
  const btn = els.scrollBottomBtn;
  if (!btn) return;
  btn.hidden = _isNearBottom();
}

// AkÃ„Â±Ã…Å¸ sÃ„Â±rasÃ„Â±nda ÃƒÂ§aÃ„Å¸rÃ„Â±lÃ„Â±r: yalnÃ„Â±zca kullanÃ„Â±cÃ„Â± dibe yapÃ„Â±Ã…Å¸Ã„Â±ksa otomatik kaydÃ„Â±r.
// YÃƒÂ¼kseklik oturduktan sonra kaymak iÃƒÂ§in ÃƒÂ§ift rAF kullanÃ„Â±lÃ„Â±r (yeni satÃ„Â±r altta kalmasÃ„Â±n).
function scrollConversationToBottom(force = false) {
  if (!force && !stickToBottom) { updateScrollButton(); return; }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try { _scrollToBottomNow(); } catch (_e) { /* yoksay */ }
      updateScrollButton();
    });
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
  setTransientStatus("PaylaÃ…Å¸Ã„Â±m linki oluÃ…Å¸turuluyor...");
  try {
    const remote = await window.codega.shareChat({
      title: chat.title,
      messages: chat.messages,
    });
    // url varsa kullan; yoksa slug'dan kur (sunucu her ikisini de dÃƒÂ¶ndÃƒÂ¼rÃƒÂ¼r)
    const link =
      remote && (remote.url || (remote.slug ? `${FEDERATION_SHARE_BASE}/${remote.slug}` : ""));
    if (link) {
      try {
        await navigator.clipboard.writeText(link);
        setTransientStatus(`PaylaÃ…Å¸Ã„Â±m linki kopyalandÃ„Â±: ${link}`);
      } catch {
        setTransientStatus(`PaylaÃ…Å¸Ã„Â±m linki: ${link}`);
      }
      return;
    }
    // Sunucu bir hata dÃƒÂ¶ndÃƒÂ¼rdÃƒÂ¼yse gerÃƒÂ§ek nedeni gÃƒÂ¶ster (tahmin etme)
    if (remote && remote.error) {
      setTransientStatus(`PaylaÃ…Å¸Ã„Â±m reddedildi: ${remote.error}`);
    } else if (remote && remote.service) {
      // GET saÃ„Å¸lÃ„Â±k yanÃ„Â±tÃ„Â± geldiyse istek POST olarak ulaÃ…Å¸mamÃ„Â±Ã…Å¸ demektir
      setTransientStatus("PaylaÃ…Å¸Ã„Â±m isteÃ„Å¸i sunucuya POST olarak ulaÃ…Å¸madÃ„Â± (yÃƒÂ¶nlendirme?).");
    } else {
      setTransientStatus("PaylaÃ…Å¸Ã„Â±m sunucusu beklenmedik bir yanÃ„Â±t verdi.");
    }
  } catch (error) {
    console.warn("Uzak paylaÃ…Å¸Ã„Â±m servisi kullanÃ„Â±lamadÃ„Â±", error);
    setTransientStatus(
      "PaylaÃ…Å¸Ã„Â±m sunucusu (ai.codega.com.tr) yayÃ„Â±nda deÃ„Å¸il. Link paylaÃ…Å¸Ã„Â±mÃ„Â± iÃƒÂ§in sunucu kurulmalÃ„Â±."
    );
  } finally {
    // Ã¢â€ â€” butonuna tÃ„Â±klayÃ„Â±nca odak orada kalÃ„Â±yordu; giriÃ…Å¸ alanÃ„Â±na geri ver ki
    // kullanÃ„Â±cÃ„Â± hemen yazÃ„Â±p Enter ile gÃƒÂ¶nderebilsin.
    focusComposer();
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
  } else {
    renderHistory();
    renderConversation();
  }
  resetComposer();
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
    .replace(/[^a-z0-9Ã„Å¸ÃƒÂ¼Ã…Å¸ÃƒÂ¶ÃƒÂ§Ã„Â±Ã„Â°Ã„ÂÃƒÅ“Ã…ÂÃƒâ€“Ãƒâ€¡_-]+/gi, "-")
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
      title: `${payload.title || "PaylaÃ…Å¸Ã„Â±lan sohbet"}`,
      messages: payload.messages,
      updatedAt: payload.updatedAt || Date.now(),
    });
    state.chats.unshift(chat);
    state.activeChat = chat.id;
    saveChats();
    history.replaceState(null, "", window.location.pathname);
  } catch (error) {
    console.warn("PaylaÃ…Å¸Ã„Â±lan sohbet aÃƒÂ§Ã„Â±lamadÃ„Â±", error);
  }
}

function setModelStatus(status) {
  const ready = status?.status === "ready";
  const missing = status?.status === "missing";
  const progress = status?.progress || null;
  const isDownloading = status?.status === "checking" && progress;
  els.modelPill.textContent = ready
    ? "HazÃ„Â±r"
    : missing
      ? "Temel mod hazÃ„Â±r"
      : "DÃƒÂ¼Ã…Å¸ÃƒÂ¼nÃƒÂ¼yor";
  els.modelDetail.textContent = progress && status?.status === "checking"
    ? status.message || "Model indiriliyor..."
    : status?.action === "install_ollama"
    ? "Yerel zeka motoru kurulu deÃ„Å¸il. Model paketleri iÃƒÂ§in Ollama kurulumu gerekli."
    : ready
      ? "Codega AI talimata gÃƒÂ¶re gerekli zeka paketini arka planda kullanÃ„Â±r."
      : "Codega AI ÃƒÂ§alÃ„Â±Ã…Å¸ma ortamÃ„Â±nÃ„Â± kontrol ediyor.";
  updateModelDownload(status);

  // Ollama satÃ„Â±rÃ„Â±: ÃƒÂ§alÃ„Â±Ã…Å¸Ã„Â±yorsa "Kur" butonunu gizle, durumu gÃƒÂ¶ster
  const ollamaMissing = status?.action === "install_ollama" || status?.provider === "instant";
  if (els.ollamaRowStatus) {
    els.ollamaRowStatus.textContent = ollamaMissing
      ? "Kurulu deÃ„Å¸il. Yerel modeller iÃƒÂ§in Ollama gerekli Ã¢â‚¬â€ kurmak iÃƒÂ§in tÃ„Â±kla."
      : "Ollama ÃƒÂ§alÃ„Â±Ã…Å¸Ã„Â±yor Ã¢Å“â€œ (yerel motor hazÃ„Â±r).";
  }
  if (els.installOllama) {
    els.installOllama.hidden = !ollamaMissing;
  }
  const ovModel = document.getElementById("ov-model");
  if (ovModel && status && status.model) ovModel.textContent = status.model;
  if (!isDownloading && typeof updateOverview === "function") updateOverview();
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round(n)} B`;
}

function updateModelDownload(status) {
  if (!els.modelDownload) return;
  const progress = status?.progress || null;
  const isActive = status?.status === "checking" && progress;
  const isDone = status?.status === "ready" && progress?.percent === 100;
  if (!isActive && !isDone) {
    els.modelDownload.hidden = true;
    return;
  }
  const percent = progress.percent == null ? 0 : Math.max(0, Math.min(100, Number(progress.percent)));
  els.modelDownload.hidden = false;
  if (els.modelDownloadTitle) els.modelDownloadTitle.textContent = status?.model ? `${status.model} indiriliyor` : "Model indiriliyor";
  if (els.modelDownloadPercent) els.modelDownloadPercent.textContent = `%${Math.round(percent)}`;
  if (els.modelDownloadBar) els.modelDownloadBar.style.width = `${percent}%`;
  const downloaded = formatBytes(progress.downloadedBytes);
  const total = formatBytes(progress.totalBytes);
  if (els.modelDownloadSize) {
    els.modelDownloadSize.textContent = downloaded && total
      ? `${downloaded} / ${total}`
      : progress.raw && progress.raw !== "completed"
        ? progress.raw.slice(0, 90)
        : "Ã„Â°ndirme tamamlandÃ„Â±";
  }
  if (els.modelDownloadSpeed) {
    const speed = formatBytes(progress.speedBytesPerSec);
    els.modelDownloadSpeed.textContent = speed ? `${speed}/sn` : "";
  }
}

let modelStatusRaf = 0;
let pendingModelStatus = null;
function scheduleModelStatus(status) {
  pendingModelStatus = status;
  if (modelStatusRaf) return;
  modelStatusRaf = requestAnimationFrame(() => {
    modelStatusRaf = 0;
    const next = pendingModelStatus;
    pendingModelStatus = null;
    setModelStatus(next);
    if (next?.status !== "checking") refreshModels();
  });
}

function renderModelList(payload) {
  const options = payload?.options || [];
  els.modelList.innerHTML = options.map((model) => `
    <div class="model-row">
      <div>
        <strong>${escapeHtml(model.label)}</strong>
        <p>${escapeHtml(model.description)} Ã‚Â· ${escapeHtml(model.task || "genel")}</p>
      </div>
      <button type="button" data-model="${escapeHtml(model.id)}" ${model.installed ? "disabled" : ""}>
        ${model.installed ? "HazÃ„Â±r" : "Ã„Â°ndir"}
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
    els.modelDetail.textContent = `Model listesi alÃ„Â±namadÃ„Â±: ${error.message || error}`;
  }
}

async function refreshStatus() {
  const status = await window.codega.getStatus();
  els.version.textContent = `v${status.version}`;
  if (els.modelStoragePath) {
    els.modelStoragePath.textContent = status.paths?.models || "Ollama varsayÃ„Â±lan model dizini";
    els.modelStoragePath.title = els.modelStoragePath.textContent;
  }
  if (els.modelStorageStatus && status.paths?.modelStorage) {
    const storage = status.paths.modelStorage;
    const size = formatBytes(storage.bytes);
    els.modelStorageStatus.textContent = storage.files > 0
      ? `${storage.files} model dosyasÃ„Â±${size ? ` Ã‚Â· ${size}` : ""} bulundu. BaÃ…Å¸ka bir diske gÃƒÂ¼venli Ã…Å¸ekilde taÃ…Å¸Ã„Â±yabilirsin.`
      : "Bu dizinde model dosyasÃ„Â± bulunamadÃ„Â±. CODEGA AI diÃ„Å¸er Ollama konumlarÃ„Â±nÃ„Â± da denetleyecek.";
  }
  setModelStatus(status.model);
  await refreshModels();
}

function checkUpdatesAfterFirstQuery() {
  if (state.firstQueryUpdateChecked) return;
  state.firstQueryUpdateChecked = true;
  window.codega.checkForUpdates().catch(() => {});
}

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = n;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function updatePromptProgress(detail = {}) {
  if (!els.updateProgress) return;
  const percent = Math.max(0, Math.min(100, Number(detail.percent) || 0));
  const transferred = formatBytes(detail.transferred);
  const total = formatBytes(detail.total);
  const speed = formatBytes(detail.bytesPerSecond);
  els.updateProgress.hidden = false;
  if (els.updateProgressPercent) els.updateProgressPercent.textContent = `%${Math.round(percent)}`;
  if (els.updateProgressBar) els.updateProgressBar.style.width = `${percent}%`;
  if (els.updateProgressSize) {
    els.updateProgressSize.textContent = transferred && total
      ? `${transferred} / ${total} indirildi`
      : "Ã„Â°ndirme hazÃ„Â±rlanÃ„Â±yor...";
  }
  if (els.updateProgressSpeed) els.updateProgressSpeed.textContent = speed ? `${speed}/sn` : "";
}

function hideUpdatePromptProgress() {
  if (els.updateProgress) els.updateProgress.hidden = true;
  if (els.updateProgressBar) els.updateProgressBar.style.width = "0%";
  if (els.updateProgressPercent) els.updateProgressPercent.textContent = "%0";
  if (els.updateProgressSize) els.updateProgressSize.textContent = "HazÃ„Â±rlanÃ„Â±yor...";
  if (els.updateProgressSpeed) els.updateProgressSpeed.textContent = "";
}

function showUpdatePrompt(mode, detail = {}) {
  state.updatePromptState = mode;
  if (mode === "available") {
    els.updatePromptTitle.textContent = "Yeni gÃƒÂ¼ncelleme var";
    els.updatePromptDetail.textContent = "Daha iyi ve kararlÃ„Â± bir sÃƒÂ¼rÃƒÂ¼m bulundu. Ã„Â°stersen Ã…Å¸imdi indirebilirim.";
    els.updateNow.textContent = "Ã…Âimdi GÃƒÂ¼ncelle";
    els.updateNow.disabled = false;
    hideUpdatePromptProgress();
  } else if (mode === "downloading") {
    els.updatePromptTitle.textContent = "GÃƒÂ¼ncelleme indiriliyor";
    els.updatePromptDetail.textContent = "Ã„Â°ndirme sÃƒÂ¼rÃƒÂ¼yor. TamamlandÃ„Â±Ã„Å¸Ã„Â±nda kurulum iÃƒÂ§in onay isteyeceÃ„Å¸im.";
    els.updateNow.textContent = "Ã„Â°ndiriliyor";
    els.updateNow.disabled = true;
    updatePromptProgress(detail);
  } else {
    els.updatePromptTitle.textContent = "GÃƒÂ¼ncelleme hazÃ„Â±r";
    els.updatePromptDetail.textContent = "Yeni sÃƒÂ¼rÃƒÂ¼m indirildi. Kurulum iÃƒÂ§in CODEGA AI yeniden baÃ…Å¸latÃ„Â±lacak.";
    els.updateNow.textContent = "Uygula ve Yeniden BaÃ…Å¸lat";
    els.updateNow.disabled = false;
    if (detail && (detail.percent || detail.total || detail.transferred)) {
      updatePromptProgress({ ...detail, percent: 100, transferred: detail.total || detail.transferred });
    } else {
      hideUpdatePromptProgress();
    }
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
const ATTACH_MAX_CHARS = 16000; // modele giden baÃ„Å¸lam tavanÃ„Â± (yerel modeller iÃƒÂ§in makul)
const ATTACH_MAX_BYTES = 500 * 1024 * 1024; // yerelde ÃƒÂ§alÃ„Â±Ã…Å¸Ã„Â±yoruz: 500 MB'a kadar kabul
const ATTACH_READ_BYTES = 800 * 1024; // metin dosyalarÃ„Â±ndan yalnÃ„Â±zca baÃ…Å¸tan bu kadar oku (bellek dostu)

// UzantÃ„Â±ya gÃƒÂ¶re dosya tÃƒÂ¼rÃƒÂ¼ + araÃƒÂ§/uzman ÃƒÂ¶nerisi (rakiplerdeki gibi iÃƒÂ§eriÃ„Å¸e uyum)
function detectFileKind(name) {
  const ext = String(name).split(".").pop().toLowerCase();
  const T = (label, expert, action) => ({ label, expert, action, readable: true });
  const code = {
    php: T("PHP", "php", "kod inceleme/geliÃ…Å¸tirme"),
    js: T("JavaScript", "javascript", "kod inceleme"),
    ts: T("TypeScript", "javascript", "kod inceleme"),
    jsx: T("React", "javascript", "bileÃ…Å¸en inceleme"),
    tsx: T("React/TS", "javascript", "bileÃ…Å¸en inceleme"),
    vue: T("Vue", "javascript", "bileÃ…Å¸en inceleme"),
    py: T("Python", "python", "kod inceleme"),
    rb: T("Ruby", "genel", "kod inceleme"),
    go: T("Go", "genel", "kod inceleme"),
    rs: T("Rust", "genel", "kod inceleme"),
    java: T("Java", "genel", "kod inceleme"),
    c: T("C", "genel", "kod inceleme"),
    cpp: T("C++", "genel", "kod inceleme"),
    h: T("C baÃ…Å¸lÃ„Â±k", "genel", "kod inceleme"),
    html: T("HTML", "javascript", "iÃ…Å¸aretleme inceleme"),
    htm: T("HTML", "javascript", "iÃ…Å¸aretleme inceleme"),
    css: T("CSS", "javascript", "stil inceleme"),
    scss: T("SCSS", "javascript", "stil inceleme"),
    sql: T("SQL", "genel", "Ã…Å¸ema/sorgu inceleme"),
    sh: T("Shell", "devops", "betik inceleme"),
    yml: T("YAML", "devops", "yapÃ„Â±landÃ„Â±rma inceleme"),
    yaml: T("YAML", "devops", "yapÃ„Â±landÃ„Â±rma inceleme"),
    ini: T("INI", "devops", "yapÃ„Â±landÃ„Â±rma inceleme"),
    env: T("ENV", "devops", "yapÃ„Â±landÃ„Â±rma inceleme (gizli anahtarlara dikkat)"),
    csv: T("CSV veri", "genel", "veri analizi/ÃƒÂ¶zet"),
    tsv: T("TSV veri", "genel", "veri analizi/ÃƒÂ¶zet"),
    json: T("JSON", "genel", "yapÃ„Â±/veri inceleme"),
    xml: T("XML", "genel", "yapÃ„Â± inceleme"),
    md: T("Markdown", "genel", "dokÃƒÂ¼man inceleme"),
    txt: T("Metin", "genel", "dokÃƒÂ¼man inceleme"),
    log: T("Log", "devops", "hata/iz analizi"),
  };
  if (code[ext]) return code[ext];
  const archive = ["zip", "rar", "7z", "tar", "gz", "tgz"];
  const image = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
  if (archive.includes(ext)) return { label: "ArÃ…Å¸iv", action: "iÃƒÂ§eriÃ„Å¸i ÃƒÂ§Ã„Â±karÃ„Â±p ÃƒÂ¶nemli dosyalarÃ„Â± ekle", readable: false, hint: "archive" };
  if (image.includes(ext)) return { label: "GÃƒÂ¶rsel", action: "gÃƒÂ¶rsel anlama (vision) modeli gerekir", readable: false, hint: "image" };
  if (ext === "pdf") return { label: "PDF", action: "metnini .txt olarak ekleyebilir veya yapÃ„Â±Ã…Å¸tÃ„Â±rabilirsin", readable: false, hint: "pdf" };
  return { label: ext ? ext.toUpperCase() : "Dosya", expert: "genel", action: "metin olarak inceleme", readable: true };
}

function renderAttachChip() {
  const chip = document.getElementById("attach-chip");
  if (!chip) return;
  if (!attachedFile) { chip.hidden = true; chip.innerHTML = ""; return; }
  chip.hidden = false;
  const tag = attachedFile.kind ? ` Ã‚Â· ${escapeHtml(attachedFile.kind.label)}` : "";
  chip.innerHTML = `<span>ÄŸÅ¸â€œÂ ${escapeHtml(attachedFile.name)}${tag}</span>`;
  const x = document.createElement("button");
  x.type = "button";
  x.textContent = "Ãƒâ€”";
  x.title = "Eki kaldÃ„Â±r";
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
    input.value = ""; // aynÃ„Â± dosya tekrar seÃƒÂ§ilebilsin
    if (!file) return;
    const kind = detectFileKind(file.name);

    // Metin olmayan tÃƒÂ¼rler: okuma yerine doÃ„Å¸ru aracÃ„Â± ÃƒÂ¶ner
    if (!kind.readable) {
      attachedFile = null;
      renderAttachChip();
      const msg = {
        archive: `${file.name}: arÃ…Å¸iv dosyasÃ„Â±. Ã„Â°ÃƒÂ§eriÃ„Å¸i ÃƒÂ§Ã„Â±karÃ„Â±p ÃƒÂ¶nemli dosyalarÃ„Â± tek tek ekleyebilirsin (tam proje/arÃ…Å¸iv okuma yakÃ„Â±nda).`,
        image: `${file.name}: gÃƒÂ¶rsel. GÃƒÂ¶rsel anlama iÃƒÂ§in bir vision modeli gerekiyor (ÃƒÂ¶rn. llava) Ã¢â‚¬â€ yakÃ„Â±nda.`,
        pdf: `${file.name}: PDF. Metnini .txt olarak kaydedip ekleyebilir ya da yapÃ„Â±Ã…Å¸tÃ„Â±rabilirsin.`,
      }[kind.hint] || `${file.name}: bu tÃƒÂ¼r metin olarak okunamÃ„Â±yor.`;
      setTransientStatus(msg);
      return;
    }

    if (file.size > ATTACH_MAX_BYTES) {
      setTransientStatus("Dosya 500 MB sÃ„Â±nÃ„Â±rÃ„Â±nÃ„Â± aÃ…Å¸Ã„Â±yor.");
      return;
    }

    // BÃƒÂ¼yÃƒÂ¼k dosyalarda belleÃ„Å¸i Ã…Å¸iÃ…Å¸irmeden yalnÃ„Â±zca baÃ…Å¸tan bir dilim oku
    const slice = file.size > ATTACH_READ_BYTES ? file.slice(0, ATTACH_READ_BYTES) : file;
    const reader = new FileReader();
    reader.onload = () => {
      let text = String(reader.result || "");
      let note = "";
      if (file.size > ATTACH_READ_BYTES || text.length > ATTACH_MAX_CHARS) {
        text = text.slice(0, ATTACH_MAX_CHARS);
        note = " (baÃ…Å¸ kÃ„Â±smÃ„Â±)";
      }
      attachedFile = { name: file.name + note, text, kind };
      renderAttachChip();
      const sug = kind.expert && kind.expert !== "genel" ? ` Ãƒâ€“neri: Uzman Modu'nu "${kind.expert}" yapabilirsin.` : "";
      setTransientStatus(`Ek hazÃ„Â±r: ${kind.label}${note} Ã¢â‚¬â€ ${kind.action}.${sug}`);
    };
    reader.onerror = () => setTransientStatus("Dosya okunamadÃ„Â± (metin tabanlÃ„Â± bir dosya seÃƒÂ§).");
    reader.readAsText(slice);
  });
})();

async function regenerateLast() {
  if (isSending) return;
  const chat = currentChat();
  const msgs = chat.messages;
  if (!msgs.length || msgs[msgs.length - 1].role !== "assistant") return;
  // Son kullanÃ„Â±cÃ„Â± mesajÃ„Â±nÃ„Â± bul
  let userText = "";
  for (let i = msgs.length - 2; i >= 0; i--) {
    if (msgs[i].role === "user") { userText = msgs[i].text; break; }
  }
  if (!userText) return;
  // "ÄŸÅ¸â€œÂ dosya" notunu temizle (yeniden ÃƒÂ¼retimde dosya baÃ„Å¸lamÃ„Â± yeniden eklenmez)
  userText = userText.replace(/\n+ÄŸÅ¸â€œÂ .*$/s, "").trim();
  if (!userText) return;

  isSending = true;
  setSendingUi(true);
  stickToBottom = true; // yeniden ÃƒÂ¼retim: en alta in
  msgs.pop(); // eski asistan cevabÃ„Â±nÃ„Â± kaldÃ„Â±r
  appendMessage("assistant", "DÃƒÂ¼Ã…Å¸ÃƒÂ¼nÃƒÂ¼yorum...");
  const placeholder = msgs[msgs.length - 1];

  const streamView = createStreamView(placeholder);
  const offStatus = window.codega.onChatStatus((status) => {
    setChatWorkingStatus(status);
    if (_kickWatchdog) _kickWatchdog();
  });
  let rafPending = false;
  const offStream = window.codega.onChatStream((token) => {
    const kind = streamView.apply(token);
    if (kind === "ignored") {
      if (_kickWatchdog) _kickWatchdog();
      return;
    }
    if (kind === "answer") {
      if (_kickWatchdog) _kickWatchdog();
      clearTimeout(slowNotice);
    }
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; renderConversation(); scrollConversationToBottom(); });
    }
  });
  const slowNotice = setTimeout(() => {
    streamView.showSlowNotice();
    renderConversation();
  }, 8000);
  const statusNotice = setTimeout(() => {
    streamView.showOneMinuteNotice();
    renderConversation();
    scrollConversationToBottom();
  }, 60000);
  try {
    const answer = await sendMessageWithWatchdog(userText, {
      regenerate: true,
      context: (currentChat().context || ""),
      chatId: currentChat().id,
    });
    placeholder.text = cleanStoredAssistantOutput(answer.text);
  } catch (error) {
    placeholder.text = `Bir aksama oldu: ${error.message || error}`;
  } finally {
    clearTimeout(slowNotice);
    clearTimeout(statusNotice);
    offStream();
    offStatus();
    isSending = false;
    setSendingUi(false);
  }
  saveChats();
  renderConversation();
  scrollConversationToBottom();
}

async function handleSubmit() {
  if (isSending) return; // ÃƒÂ¶nceki cevap dÃƒÂ¶nmeden yeni istek gÃƒÂ¶nderme
  const text = els.input.value.trim();
  if (!text) return;
  isSending = true;

  // Ek dosya varsa: ekranda kullanÃ„Â±cÃ„Â± metni + ek rozeti; modele dosya baÃ„Å¸lamÃ„Â± eklenmiÃ…Å¸ metin
  const att = attachedFile;
  const displayText = att ? `${text}\n\nÄŸÅ¸â€œÂ ${att.name}` : text;
  const sendText = att
    ? `KullanÃ„Â±cÃ„Â± bir dosya ekledi: "${att.name}"\n\n--- DOSYA Ã„Â°Ãƒâ€¡ERÃ„Â°Ã„ÂÃ„Â° ---\n${att.text}\n--- DOSYA SONU ---\n\nKullanÃ„Â±cÃ„Â±nÃ„Â±n isteÃ„Å¸i: ${text}`
    : text;
  attachedFile = null;
  renderAttachChip();

  setSendingUi(true);
  stickToBottom = true; // yeni soru: en alta in
  appendMessage("user", displayText);
  checkUpdatesAfterFirstQuery();
  els.input.value = "";
  els.input.style.height = "auto";
  appendMessage("assistant", "DÃƒÂ¼Ã…Å¸ÃƒÂ¼nÃƒÂ¼yorum...");

  const chat = currentChat();
  const placeholder = chat.messages[chat.messages.length - 1];
  // Streaming: token geldikÃƒÂ§e placeholder'Ã„Â± canlÃ„Â± gÃƒÂ¼ncelle (akÃ„Â±Ã…Å¸ kapalÃ„Â±ysa hiÃƒÂ§ gelmez)
  const streamView = createStreamView(placeholder);
  const offStatus = window.codega.onChatStatus((status) => {
    setChatWorkingStatus(status);
    if (_kickWatchdog) _kickWatchdog();
  });
  let rafPending = false;
  const offStream = window.codega.onChatStream((token) => {
    const kind = streamView.apply(token);
    if (kind === "ignored") {
      if (_kickWatchdog) _kickWatchdog();
      return;
    }
    if (kind === "answer") {
      if (_kickWatchdog) _kickWatchdog();
      clearTimeout(slowNotice);
    }
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
    streamView.showSlowNotice();
    renderConversation();
    scrollConversationToBottom();
  }, 8000);
  const statusNotice = setTimeout(() => {
    streamView.showOneMinuteNotice();
    renderConversation();
    scrollConversationToBottom();
  }, 60000);
  try {
    const answer = await sendMessageWithWatchdog(sendText, {
      context: (currentChat().context || ""),
      chatId: currentChat().id,
    });
    placeholder.text = cleanStoredAssistantOutput(answer.text); // final cevap otorite
    await refreshModels();
  } catch (error) {
    placeholder.text = `Bir aksama oldu: ${error.message || error}`;
  } finally {
    clearTimeout(slowNotice);
    clearTimeout(statusNotice);
    offStream();
    offStatus();
    isSending = false;
    setSendingUi(false);
  }
  saveChats(); // final cevabÃ„Â± diske yaz; yoksa kapatÃ„Â±p aÃƒÂ§Ã„Â±nca "DÃƒÂ¼Ã…Å¸ÃƒÂ¼nÃƒÂ¼yorum..." kalÃ„Â±yordu
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
  // Enter = gÃƒÂ¶nder (Shift+Enter = yeni satÃ„Â±r). Mac dahil tÃƒÂ¼m platformlarda
  // ÃƒÂ§alÃ„Â±Ã…Å¸sÃ„Â±n diye requestSubmit yerine doÃ„Å¸rudan handleSubmit ÃƒÂ§aÃ„Å¸rÃ„Â±lÃ„Â±r.
  const isEnter = event.key === "Enter" || event.keyCode === 13;
  if (isEnter && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    els.form.requestSubmit();
  }
});

document.getElementById("new-chat").addEventListener("click", () => createChat());

// KaydÃ„Â±rma: kullanÃ„Â±cÃ„Â± yukarÃ„Â± kayarsa "dibe yapÃ„Â±Ã…Å¸" kapanÃ„Â±r ve buton gÃƒÂ¶rÃƒÂ¼nÃƒÂ¼r; dibe inince geri aÃƒÂ§Ã„Â±lÃ„Â±r.
function _onScrollActivity() {
  stickToBottom = _isNearBottom();
  updateScrollButton();
}
if (els.conversation) els.conversation.addEventListener("scroll", _onScrollActivity, { passive: true });
window.addEventListener("scroll", _onScrollActivity, { passive: true });
window.addEventListener("resize", updateScrollButton);
if (els.scrollBottomBtn) els.scrollBottomBtn.addEventListener("click", () => {
  stickToBottom = true;
  scrollConversationToBottom(true);
});
if (els.historySearch) els.historySearch.addEventListener("input", () => { historyQuery = els.historySearch.value; renderHistory(); });
let _metricsTimer = null;
let _kickWatchdog = null; // akÃ„Â±Ã…Å¸ta her gerÃƒÂ§ek token geldiÃ„Å¸inde idle watchdog'u sÃ„Â±fÃ„Â±rlar

// Ã„Â°ki katmanlÃ„Â± koruma: cevap tokenlarÃ„Â± ile motorun ilerleme/heartbeat sinyalleri idle
// sayacÃ„Â±nÃ„Â± sÃ„Â±fÃ„Â±rlar. hardMs ise takÃ„Â±lan bir iÃ…Å¸i her durumda sonlandÃ„Â±ran kesin ÃƒÂ¼st sÃ„Â±nÃ„Â±rdÃ„Â±r.
function sendMessageWithWatchdog(text, options = {}, idleMs = 90000, hardMs = 180000) {
  let timer = null;
  let hardTimer = null;
  let rejectFn = null;
  let settled = false;
  const stopAndReject = async (message) => {
    if (settled) return;
    settled = true;
    try { await window.codega.abortChat(); } catch (_e) {}
    if (rejectFn) rejectFn(new Error(message));
  };
  const arm = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => stopAndReject(
      "Model uzun sÃƒÂ¼re yanÃ„Â±t ÃƒÂ¼retmedi; iÃ…Å¸lem gÃƒÂ¼venli Ã…Å¸ekilde durduruldu. Daha hafif bir model seÃƒÂ§ip tekrar deneyebilirsin."
    ), idleMs);
  };
  const timeout = new Promise((_, reject) => { rejectFn = reject; });
  arm();
  hardTimer = window.setTimeout(() => stopAndReject(
    `YanÃ„Â±t ${Math.round(hardMs / 1000)} saniyelik ÃƒÂ¼st sÃƒÂ¼reyi aÃ…Å¸tÃ„Â± ve durduruldu. Modeli veya aÃ„Å¸Ã„Â± kontrol edip tekrar deneyebilirsin.`
  ), hardMs);
  _kickWatchdog = arm;
  return Promise.race([
    window.codega.sendMessage(text, options),
    timeout,
  ]).finally(() => {
    settled = true;
    if (timer) window.clearTimeout(timer);
    if (hardTimer) window.clearTimeout(hardTimer);
    if (_kickWatchdog === arm) _kickWatchdog = null;
  });
}

function _fillUsage(prefix, m) {
  const setV = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  const setB = (id, p) => { const e = document.getElementById(id); if (e) e.style.width = (p == null ? 0 : p) + "%"; };
  setV(`${prefix}-cpu-v`, m.cpu == null ? "Ã¢â‚¬â€" : "%" + m.cpu); setB(`${prefix}-cpu-b`, m.cpu);
  setV(`${prefix}-ram-v`, m.ram == null ? "Ã¢â‚¬â€" : "%" + m.ram); setB(`${prefix}-ram-b`, m.ram);
  setV(`${prefix}-gpu-v`, m.gpu == null ? "GPU yok" : "%" + m.gpu); setB(`${prefix}-gpu-b`, m.gpu || 0);
}
async function refreshLiveMetrics() {
  try {
    const m = await window.codega.getMetrics();
    if (!m) return;
    _fillUsage("ov", m);
    _fillUsage("sys", m);
    const badge = document.getElementById("ov-usage-badge");
    if (badge) badge.hidden = true; // gerÃƒÂ§ek ÃƒÂ¶lÃƒÂ§ÃƒÂ¼m; "Demo" rozeti gizlenir
  } catch (_e) { /* metrik hatasÃ„Â± paneli bozmasÃ„Â±n */ }
}
function startLiveMetrics() {
  refreshLiveMetrics();
  if (_metricsTimer) clearInterval(_metricsTimer);
  _metricsTimer = setInterval(refreshLiveMetrics, 4000);
}
function stopLiveMetrics() {
  if (_metricsTimer) { clearInterval(_metricsTimer); _metricsTimer = null; }
}
async function refreshLiveStats() {
  try {
    const s = await window.codega.getStats();
    if (!s) return;
    const setV = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
    const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n));
    setV("ov-total", (s.total || 0).toLocaleString("tr-TR"));
    setV("ov-today", String(s.today || 0));
    setV("ov-tokens", fmt(s.tokensToday || 0));
    setV("ov-avg", (s.avgSeconds || 0) + " sn");
    setV("ov-model", s.topModel || "Ã¢â‚¬â€");
    setV("ov-agent", s.topAgent || "Ã¢â‚¬â€");
  } catch (_e) { /* istatistik hatasÃ„Â± paneli bozmasÃ„Â±n */ }
}
if (els.settings) els.settings.addEventListener("close", stopLiveMetrics);

async function refreshLogs() {
  const box = document.getElementById("log-list");
  if (!box) return;
  try {
    const items = await window.codega.getLogs();
    box.innerHTML = "";
    if (!items || !items.length) { box.innerHTML = '<p class="log-empty">HenÃƒÂ¼z kayÃ„Â±t yok.</p>'; return; }
    for (const it of items) {
      const row = document.createElement("div");
      row.className = "log-item log-" + (it.level || "info");
      const t = new Date(it.ts || Date.now());
      const hh = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      const esc = (x) => String(x || "").replace(/</g, "&lt;");
      row.innerHTML = `<span class="log-time">${hh}</span><span class="log-src">${esc(it.source)}</span><span class="log-msg">${esc(it.message)}</span>`;
      box.appendChild(row);
    }
  } catch (_e) {}
}
const logsRefreshBtn = document.getElementById("logs-refresh");
if (logsRefreshBtn) logsRefreshBtn.addEventListener("click", () => refreshLogs());
const logsClearBtn = document.getElementById("logs-clear");
if (logsClearBtn) logsClearBtn.addEventListener("click", async () => { try { await window.codega.clearLogs(); refreshLogs(); } catch (_e) {} });

async function refreshRouter() {
  const box = document.getElementById("router-rows");
  if (!box) return;
  try {
    const r = await window.codega.routerInfo();
    box.innerHTML = "";
    for (const row of (r && r.rows) || []) {
      const div = document.createElement("div");
      div.className = "settings-row";
      const pref = (row.preferred || []).join(" Ã¢â€ â€™ ");
      div.innerHTML = `<div><strong>${row.label}</strong><p>Tercih: ${pref.replace(/</g,"&lt;")}</p></div><span class="badge-active">${(row.chosen||"Ã¢â‚¬â€").replace(/</g,"&lt;")}</span>`;
      box.appendChild(div);
    }
    const inst = document.getElementById("router-installed");
    if (inst) {
      const list = (r && r.installed) || [];
      inst.textContent = list.length ? `Kurulu modeller: ${list.join(", ")}` : "Kurulu model yok (Ollama kapalÃ„Â± veya model indirilmemiÃ…Å¸). SeÃƒÂ§ilenler tercih listesinin ilk sÃ„Â±rasÃ„Â±dÃ„Â±r.";
    }
  } catch (_e) {}
}
const routerTestBtn = document.getElementById("router-test-btn");
if (routerTestBtn) routerTestBtn.addEventListener("click", async () => {
  const input = (document.getElementById("router-test-input") || {}).value || "";
  const out = document.getElementById("router-test-out");
  if (!input.trim()) { setTransientStatus("Ãƒâ€“nce bir ÃƒÂ¶rnek yaz."); return; }
  if (out) { out.hidden = false; out.textContent = "HesaplanÃ„Â±yorÃ¢â‚¬Â¦"; }
  try {
    const r = await window.codega.routerTest({ input });
    const taskTr = { code: "Kod/YazÃ„Â±lÃ„Â±m", image: "GÃƒÂ¶rsel", writing: "YazÃ„Â±/Ã„Â°ÃƒÂ§erik", chat: "Sohbet" }[r.task] || r.task;
    if (out) out.textContent = `GÃƒÂ¶rev: ${taskTr}\nSeÃƒÂ§ilen model: ${r.chosen}\nAdaylar: ${(r.candidates||[]).join(", ")}`;
  } catch (e) { if (out) out.textContent = "Hata: " + (e.message || e); }
});

async function refreshModelsPage() {
  const inst = document.getElementById("models-installed");
  const avail = document.getElementById("models-available");
  if (!inst && !avail) return;
  try {
    const data = await window.codega.listModels();
    const options = (data && data.options) || [];
    const ready = (data && data.status && (data.status.provider === "ollama")) || (data && (data.installed || []).length > 0);
    if (inst) {
      inst.innerHTML = "";
      const installedOpts = options.filter((o) => o.installed);
      if (!installedOpts.length) { inst.innerHTML = '<p class="log-empty">Kurulu yerel model yok (Ollama kapalÃ„Â± veya henÃƒÂ¼z indirilmedi).</p>'; }
      for (const o of installedOpts) {
        const row = document.createElement("div");
        row.className = "settings-row";
        const sz = o.sizeGb ? ` Ã‚Â· ~${o.sizeGb} GB` : "";
        row.innerHTML = `<div><strong>${(o.label||o.id).replace(/</g,"&lt;")}</strong><p>${o.id}${sz}</p></div>`;
        const del = document.createElement("button");
        del.type = "button"; del.textContent = "Sil";
        del.addEventListener("click", async () => {
          if (!window.confirm(`${o.id} silinsin mi?`)) return;
          del.disabled = true; setTransientStatus(`${o.id} siliniyorÃ¢â‚¬Â¦`);
          try { const r = await window.codega.deleteModel({ id: o.id }); setTransientStatus(r && r.ok ? `${o.id} silindi.` : "Silinemedi."); refreshModelsPage(); }
          catch (e) { setTransientStatus("Hata: " + (e.message||e)); del.disabled = false; }
        });
        row.appendChild(del);
        inst.appendChild(row);
      }
    }
    if (avail) {
      avail.innerHTML = "";
      const notInstalled = options.filter((o) => !o.installed);
      for (const o of notInstalled) {
        const row = document.createElement("div");
        row.className = "settings-row";
        const sz = o.sizeGb ? ` Ã‚Â· ~${o.sizeGb} GB` : "";
        row.innerHTML = `<div><strong>${(o.label||o.id).replace(/</g,"&lt;")}</strong><p>${(o.description||"").replace(/</g,"&lt;")} Ã‚Â· ${o.id}${sz}</p></div>`;
        const dl = document.createElement("button");
        dl.type = "button"; dl.textContent = "Ã„Â°ndir";
        dl.addEventListener("click", async () => {
          dl.disabled = true;
          try { await runModelSetup(o.id, o.label || o.id); }
          finally { dl.disabled = false; }
        });
        row.appendChild(dl);
        avail.appendChild(row);
      }
    }
  } catch (_e) {}
}
async function refreshModelsPageCompact() {
  const installedBox = document.getElementById("models-installed");
  const availableBox = document.getElementById("models-available");
  if (!installedBox && !availableBox) return;

  const [data, settings] = await Promise.all([
    window.codega.listModels(),
    window.codega.getSettings(),
  ]);
  const options = (data && data.options) || [];
  const configuredDefault = settings.defaultModel || settings.model || "";
  const defaultModel = options.some((model) => model.installed && model.id === configuredDefault)
    ? configuredDefault
    : (data && data.status && data.status.model) || "";
  const taskLabels = { chat: "Sohbet", code: "Kod", writing: "YazÃ„Â±", image: "GÃƒÂ¶rsel" };

  const createCard = (model, installed) => {
    const active = installed && model.id === defaultModel;
    const card = document.createElement("article");
    card.className = `model-manager-card${active ? " is-active" : ""}`;

    const header = document.createElement("div");
    header.className = "model-manager-card__header";

    const identity = document.createElement("div");
    identity.className = "model-manager-card__identity";
    const title = document.createElement("strong");
    title.textContent = model.label || model.id;
    const modelId = document.createElement("code");
    modelId.textContent = model.id;
    identity.append(title, modelId);

    const controls = document.createElement("div");
    controls.className = "model-manager-card__controls";
    const status = document.createElement("span");
    status.className = `model-state ${active ? "active" : installed ? "passive" : "missing"}`;
    status.textContent = active ? "Aktif" : installed ? "Pasif" : "YÃƒÂ¼klÃƒÂ¼ deÃ„Å¸il";
    controls.appendChild(status);

    if (installed && !active) {
      const activate = document.createElement("button");
      activate.type = "button";
      activate.className = "model-action primary";
      activate.textContent = "VarsayÃ„Â±lan Yap";
      activate.addEventListener("click", async () => {
        activate.disabled = true;
        await setDefaultModel(model.id, model.label || model.id);
        await refreshModelsPageCompact();
      });
      controls.appendChild(activate);
    }

    if (installed) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "model-action danger";
      remove.textContent = "Sil";
      remove.disabled = active;
      remove.title = active
        ? "Aktif modeli silmeden ÃƒÂ¶nce baÃ…Å¸ka bir modeli varsayÃ„Â±lan yap."
        : "Modeli cihazdan sil";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`${model.id} silinsin mi?`)) return;
        remove.disabled = true;
        setTransientStatus(`${model.id} siliniyorÃ¢â‚¬Â¦`);
        try {
          const result = await window.codega.deleteModel({ id: model.id });
          setTransientStatus(result && result.ok ? `${model.id} silindi.` : "Model silinemedi.");
          await refreshModelsPageCompact();
          await refreshCookbook();
        } catch (error) {
          setTransientStatus("Hata: " + (error.message || error));
          remove.disabled = false;
        }
      });
      controls.appendChild(remove);
    } else {
      const download = document.createElement("button");
      download.type = "button";
      download.className = "model-action primary";
      download.textContent = "Ã„Â°ndir";
      download.addEventListener("click", async () => {
        download.disabled = true;
        try {
          await runModelSetup(model.id, model.label || model.id);
          await refreshModelsPageCompact();
          await refreshCookbook();
        } finally {
          download.disabled = false;
        }
      });
      controls.appendChild(download);
    }

    header.append(identity, controls);

    const description = document.createElement("p");
    description.textContent = model.description || "Yerel Ollama modeli";

    const meta = document.createElement("div");
    meta.className = "model-manager-card__meta";
    const task = document.createElement("span");
    task.textContent = taskLabels[model.task] || "Genel";
    const size = document.createElement("span");
    size.textContent = model.sizeGb ? `~${model.sizeGb} GB` : "Boyut bilinmiyor";
    meta.append(task, size);

    card.append(header, description, meta);
    return card;
  };

  if (installedBox) {
    installedBox.innerHTML = "";
    const installed = options
      .filter((model) => model.installed)
      .sort((a, b) =>
        Number(b.id === defaultModel) - Number(a.id === defaultModel) ||
        String(a.label || a.id).localeCompare(String(b.label || b.id), "tr")
      );
    if (!installed.length) {
      installedBox.innerHTML = '<p class="log-empty">Kurulu yerel model yok. Ã„Â°ndirilebilir modellerden birini seÃƒÂ§ebilirsin.</p>';
    } else {
      installed.forEach((model) => installedBox.appendChild(createCard(model, true)));
    }
  }

  if (availableBox) {
    availableBox.innerHTML = "";
    options
      .filter((model) => !model.installed)
      .forEach((model) => availableBox.appendChild(createCard(model, false)));
  }
}

refreshModelsPage = refreshModelsPageCompact;

function simplifyModelsLayout() {
  const group = document.querySelector('[data-cat="models"]');
  if (!group || group.dataset.compactReady === "true") return;
  group.dataset.compactReady = "true";

  const addCollapseButton = (section, label) => {
    if (!section || section.querySelector(".section-collapse-btn")) return;
    const heading = section.querySelector("h2");
    if (!heading) return;
    const content = Array.from(section.children).filter((child) => child !== heading);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mini-btn section-collapse-btn";
    button.textContent = label;
    button.setAttribute("aria-expanded", "false");
    content.forEach((child) => { child.hidden = true; });
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.textContent = open ? "Gizle" : label;
      content.forEach((child) => { child.hidden = !open; });
    });
    heading.appendChild(button);
  };

  addCollapseButton(document.getElementById("models-available")?.closest(".settings-section"), "Modelleri GÃƒÂ¶ster");
  addCollapseButton(document.querySelector(".model-update-center"), "GÃƒÂ¼ncellemeleri GÃƒÂ¶ster");

  for (const section of group.querySelectorAll(".settings-section")) {
    const heading = section.querySelector("h2");
    if (heading && heading.textContent.toLocaleLowerCase("tr").includes("saÃ„Å¸layÃ„Â±cÃ„Â±")) {
      section.hidden = true;
    }
  }
}

simplifyModelsLayout();

const modelsRefreshBtn = document.getElementById("models-refresh");
if (modelsRefreshBtn) modelsRefreshBtn.addEventListener("click", () => refreshModelsPage());

function formatModelUpdateTime(value) {
  if (!value) return "HenÃƒÂ¼z kontrol edilmedi";
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (_e) {
    return "Kontrol edildi";
  }
}

function renderModelUpdates(data) {
  if (!els.modelUpdatesSummary || !els.modelUpdatesList) return;
  const status = data || {};
  const models = Array.isArray(status.models) ? status.models : [];
  const updates = models.filter((model) => model.updateAvailable);
  const catalog = status.catalog || {};
  const discoveries = Array.isArray(catalog.discoveries) ? catalog.discoveries : [];
  if (status.checking) {
    els.modelUpdatesSummary.textContent = "Resmi Ollama manifestleri kontrol ediliyorÃ¢â‚¬Â¦";
  } else if (status.error) {
    els.modelUpdatesSummary.textContent = catalog.sources?.length
      ? `Ollama kontrolÃƒÂ¼ tamamlanamadÃ„Â±; resmi model radarÃ„Â± ÃƒÂ§alÃ„Â±Ã…Å¸Ã„Â±yor Ã‚Â· ${status.error}`
      : `Kontrol tamamlanamadÃ„Â±: ${status.error}`;
  } else if (!status.lastCheck) {
    els.modelUpdatesSummary.textContent = "HenÃƒÂ¼z kontrol edilmedi.";
  } else if (updates.length) {
    els.modelUpdatesSummary.textContent = `${updates.length} model gÃƒÂ¼ncellemesi hazÃ„Â±r Ã‚Â· Son kontrol: ${formatModelUpdateTime(status.lastCheck)}`;
  } else if (discoveries.length) {
    els.modelUpdatesSummary.textContent = `${discoveries.length} yeni model ailesi bulundu Ã‚Â· Son kontrol: ${formatModelUpdateTime(status.lastCheck)}`;
  } else {
    els.modelUpdatesSummary.textContent = `Kurulu modeller gÃƒÂ¼ncel Ã‚Â· Resmi model radarÃ„Â± aktif Ã‚Â· Son kontrol: ${formatModelUpdateTime(status.lastCheck)}`;
  }

  els.modelUpdatesList.innerHTML = "";
  if (!models.length && status.lastCheck) {
    els.modelUpdatesList.innerHTML = '<p class="log-empty">Kurulu Ollama modeli bulunamadÃ„Â±.</p>';
    return;
  }
  for (const model of models) {
    const row = document.createElement("div");
    row.className = `settings-row model-update-row${model.updateAvailable ? " update-ready" : ""}`;
    const detail = model.checked
      ? model.updateAvailable ? "Yeni resmi manifest bulundu" : "GÃƒÂ¼ncel"
      : "Resmi manifest doÃ„Å¸rulanamadÃ„Â±";
    row.innerHTML = `<div><strong>${escapeHtml(model.name)}</strong><p class="update-state">${detail}</p></div>`;
    if (model.updateAvailable) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "GÃƒÂ¼ncelle";
      button.addEventListener("click", async () => {
        button.disabled = true;
        if (els.setupTitle) els.setupTitle.textContent = `${model.name} gÃƒÂ¼ncelleniyor`;
        if (els.setupStatus) els.setupStatus.textContent = "Resmi model paketi indiriliyorÃ¢â‚¬Â¦";
        if (els.setupBar) {
          els.setupBar.style.width = "0%";
          els.setupBar.classList.add("indeterminate");
        }
        if (els.setupDialog && !els.setupDialog.open) els.setupDialog.showModal();
        try {
          const result = await window.codega.applyModelUpdate(model.name);
          renderModelUpdates(result && result.updates);
          setTransientStatus(`${model.name} gÃƒÂ¼ncellendi.`);
          if (els.setupStatus) els.setupStatus.textContent = "Model gÃƒÂ¼ncellendi.";
          if (els.setupBar) {
            els.setupBar.classList.remove("indeterminate");
            els.setupBar.style.width = "100%";
          }
        } catch (error) {
          setTransientStatus(`GÃƒÂ¼ncelleme baÃ…Å¸arÃ„Â±sÃ„Â±z: ${error.message || error}`);
          if (els.setupStatus) els.setupStatus.textContent = `Hata: ${error.message || error}`;
        } finally {
          button.disabled = false;
        }
      });
      row.appendChild(button);
    }
    els.modelUpdatesList.appendChild(row);
  }
  for (const source of discoveries) {
    const row = document.createElement("div");
    row.className = "settings-row model-update-row update-ready";
    row.innerHTML = `<div><strong>${escapeHtml(source.label)}: ${escapeHtml(source.latestGeneration)}</strong><p class="update-state">Yeni resmi model ailesi bulundu; donanÃ„Â±m ve Ollama paketi doÃ„Å¸rulanmadan otomatik kurulmaz.</p></div>`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Resmi Kaynak";
    button.addEventListener("click", () => window.codega.openExternal(source.url));
    row.appendChild(button);
    els.modelUpdatesList.appendChild(row);
  }
}

async function refreshModelUpdates(force = false) {
  if (!els.modelUpdatesSummary) return;
  try {
    if (force) {
      if (els.modelUpdatesCheck) els.modelUpdatesCheck.disabled = true;
      renderModelUpdates({ checking: true, models: [] });
    }
    const status = force
      ? await window.codega.checkModelUpdates()
      : await window.codega.modelUpdatesStatus();
    renderModelUpdates(status);
  } catch (error) {
    renderModelUpdates({ error: error.message || String(error), models: [] });
  } finally {
    if (els.modelUpdatesCheck) els.modelUpdatesCheck.disabled = false;
  }
}

if (els.modelUpdatesCheck) {
  els.modelUpdatesCheck.addEventListener("click", () => refreshModelUpdates(true));
}

const FIT_BADGE = {
  gpu: { txt: "Ã¢Å“â€¦ GPU Ã¢â‚¬â€ hÃ„Â±zlÃ„Â±", cls: "fit-gpu" },
  "gpu-tight": { txt: "Ã¢Å¡Â Ã¯Â¸Â GPU Ã¢â‚¬â€ sÃ„Â±kÃ„Â±Ã…Å¸Ã„Â±k", cls: "fit-tight" },
  cpu: { txt: "ÄŸÅ¸ÂÂ¢ CPU Ã¢â‚¬â€ yavaÃ…Å¸", cls: "fit-cpu" },
  no: { txt: "Ã¢ÂÅ’ Yetersiz", cls: "fit-no" },
};
const stars = (q) => "Ã¢Ëœâ€¦".repeat(Math.max(0, Math.min(5, Number(q) || 0))) + "Ã¢Ëœâ€ ".repeat(5 - Math.max(0, Math.min(5, Number(q) || 0)));

async function setDefaultModel(id, label) {
  try {
    await window.codega.setSettings({ defaultModel: id });
    setTransientStatus(`VarsayÃ„Â±lan model: ${label || id}`);
    refreshCookbook();
  } catch (e) { setTransientStatus("Ayar kaydedilemedi: " + (e.message || e)); }
}

let cookbookScanRunning = false;
async function refreshCookbook(manual = false) {
  const hwEl = document.getElementById("cookbook-hw");
  const recoEl = document.getElementById("cookbook-reco");
  const listEl = document.getElementById("cookbook-models");
  if (!hwEl && !listEl) return;
  if (cookbookScanRunning) return;
  cookbookScanRunning = true;
  if (cookbookScanBtn) {
    cookbookScanBtn.disabled = true;
    cookbookScanBtn.textContent = "TaranÃ„Â±yorÃ¢â‚¬Â¦";
  }
  if (manual && hwEl) hwEl.textContent = "CPU, RAM ve NVIDIA VRAM yeniden taranÃ„Â±yorÃ¢â‚¬Â¦";
  try {
    const data = await window.codega.cookbookScan();
    const hw = (data && data.hardware) || {};
    if (hwEl) {
      const vram = hw.vramGb != null ? `${hw.vramGb} GB VRAM` : "GPU yok (CPU)";
      const gpu = hw.gpuName ? ` Ã‚Â· ${hw.gpuName}` : "";
      const time = hw.scannedAt ? new Date(hw.scannedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
      hwEl.textContent = `DonanÃ„Â±m: ${vram}${gpu} Ã‚Â· ${hw.ramGb} GB RAM Ã‚Â· ${hw.cores} ÃƒÂ§ekirdek${time ? ` Ã‚Â· ${time}` : ""}`;
    }
    if (manual) setTransientStatus("DonanÃ„Â±m taramasÃ„Â± tamamlandÃ„Â±.");
    if (recoEl) {
      if (data && data.recommended) {
        const r = data.recommended;
        recoEl.hidden = false;
        recoEl.innerHTML = `<strong>Ãƒâ€“nerilen: ${(r.label || r.id).replace(/</g, "&lt;")}</strong><p>${(r.reason || "").replace(/</g, "&lt;")}</p>`;
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "primary-btn";
        const recModel = (data.models || []).find((m) => m.id === r.id) || {};
        btn.textContent = recModel.installed ? "VarsayÃ„Â±lan Yap" : "Kur ve VarsayÃ„Â±lan Yap";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            if (!recModel.installed) await runModelSetup(r.id, r.label || r.id);
            await setDefaultModel(r.id, r.label || r.id);
          } finally { btn.disabled = false; }
        });
        recoEl.appendChild(btn);
      } else { recoEl.hidden = true; }
    }
    if (listEl && !listEl.hidden) {
      listEl.innerHTML = "";
      for (const m of (data && data.models) || []) {
        const badge = FIT_BADGE[m.fit] || FIT_BADGE.no;
        const row = document.createElement("div");
        row.className = "settings-row cookbook-row";
        const sz = m.sizeGb ? `~${m.sizeGb} GB` : "";
        const flags = [m.isDefault ? "Ã¢â€”Â VarsayÃ„Â±lan" : "", m.installed ? "Kurulu" : ""].filter(Boolean).join(" Ã‚Â· ");
        row.innerHTML = `<div><strong>${(m.label || m.id).replace(/</g, "&lt;")}</strong> <span class="fit-badge ${badge.cls}">${badge.txt}</span>`
          + `<p>${(m.note || m.description || "").replace(/</g, "&lt;")} Ã‚Â· ${m.params || ""} Ã‚Â· ${sz} Ã‚Â· <span title="kalite">${stars(m.quality)}</span>${flags ? " Ã‚Â· " + flags : ""}</p></div>`;
        const actions = document.createElement("div");
        actions.className = "cookbook-actions";
        if (!m.installed && m.fit !== "no") {
          const dl = document.createElement("button");
          dl.type = "button"; dl.textContent = "Kur";
          dl.addEventListener("click", async () => { dl.disabled = true; try { await runModelSetup(m.id, m.label || m.id); refreshCookbook(); } finally { dl.disabled = false; } });
          actions.appendChild(dl);
        }
        if (m.installed && !m.isDefault) {
          const def = document.createElement("button");
          def.type = "button"; def.textContent = "VarsayÃ„Â±lan Yap";
          def.addEventListener("click", () => setDefaultModel(m.id, m.label || m.id));
          actions.appendChild(def);
        }
        row.appendChild(actions);
        listEl.appendChild(row);
      }
    }
  } catch (e) {
    if (hwEl) hwEl.textContent = "DonanÃ„Â±m taranamadÃ„Â±: " + (e.message || e);
    if (manual) setTransientStatus("DonanÃ„Â±m taramasÃ„Â± baÃ…Å¸arÃ„Â±sÃ„Â±z: " + (e.message || e));
  } finally {
    cookbookScanRunning = false;
    if (cookbookScanBtn) {
      cookbookScanBtn.disabled = false;
      cookbookScanBtn.textContent = "DonanÃ„Â±mÃ„Â± Tara";
    }
  }
}
const cookbookScanBtn = document.getElementById("cookbook-scan");
if (cookbookScanBtn) cookbookScanBtn.addEventListener("click", () => refreshCookbook(true));

async function refreshAutomations() {
  const box = document.getElementById("auto-list");
  if (!box) return;
  try {
    const data = await window.codega.automationsStatus();
    box.innerHTML = "";
    for (const it of (data && data.items) || []) {
      const row = document.createElement("div");
      row.className = "settings-row";
      let lastTxt = "HenÃƒÂ¼z ÃƒÂ§alÃ„Â±Ã…Å¸madÃ„Â±";
      if (it.last && it.last.at) {
        const t = new Date(it.last.at);
        const hh = String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0");
        lastTxt = `Son: ${hh}${it.last.info ? " Ã‚Â· " + it.last.info : ""}`;
      }
      row.innerHTML = `<div><strong>${it.label}</strong><p>${(it.desc||"").replace(/</g,"&lt;")}<br><span class="log-time">${lastTxt.replace(/</g,"&lt;")}</span></p></div>`;
      const btn = document.createElement("button");
      btn.type = "button";
      applyToggleLabel(btn, it.enabled);
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try { agentSettings = await window.codega.setSettings({ [it.key]: !it.enabled }); applyToggleLabel(btn, !it.enabled); refreshAutomations(); }
        catch (e) { setTransientStatus("Hata: " + (e.message||e)); }
        finally { btn.disabled = false; }
      });
      row.appendChild(btn);
      box.appendChild(row);
    }
  } catch (_e) {}
}
const autoRefreshBtn = document.getElementById("auto-refresh");
if (autoRefreshBtn) autoRefreshBtn.addEventListener("click", () => { refreshAutomations(); refreshAgentWatch(); });

function safeText(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

async function refreshAgentWatch() {
  const summary = document.getElementById("agent-watch-summary");
  const findings = document.getElementById("agent-watch-findings");
  if (!summary || !findings) return;
  if (!window.codega || !window.codega.agentWatchStatus) {
    summary.textContent = "GitHub Agent Watch uygulama baÃ„Å¸lantÃ„Â±sÃ„Â± bekleniyor.";
    return;
  }
  try {
    const data = await window.codega.agentWatchStatus();
    const last = data.lastScanAt ? new Date(data.lastScanAt).toLocaleString("tr-TR") : "henÃƒÂ¼z taranmadÃ„Â±";
    summary.textContent = `${data.healthySources || 0}/${data.sourceCount || 0} kaynak eriÃ…Å¸ilebilir Ã‚Â· Son tarama: ${last}`
      + ` Ã‚Â· ResmÃƒÂ® ${data.officialSources || 0} Ã‚Â· AraÃ…Å¸tÃ„Â±rma ${data.researchSources || 0} Ã‚Â· Engelli ${data.blockedSources || 0}`
      + ((data.errors || []).length ? ` Ã‚Â· ${(data.errors || []).length} hata` : "");
    findings.innerHTML = "";
    const rows = (data.findings || []).slice(0, 8);
    if (!rows.length) {
      findings.innerHTML = '<div class="agent-watch-empty">HenÃƒÂ¼z bulgu yok. Ã„Â°lk tarama kaynaklarÃ„Â±n baÃ…Å¸langÃ„Â±ÃƒÂ§ gÃƒÂ¶rÃƒÂ¼ntÃƒÂ¼sÃƒÂ¼nÃƒÂ¼ oluÃ…Å¸turur.</div>';
      return;
    }
    for (const item of rows) {
      const row = document.createElement("div");
      row.className = "settings-row agent-watch-row";
      const policy = item.policy || {};
      const policyLabel = policy.label || (policy.mode === "reviewable-reuse" ? "Lisans incelemesiyle kullanÃ„Â±labilir" : "YalnÃ„Â±z araÃ…Å¸tÃ„Â±rma");
      const capabilityText = Array.isArray(item.capabilities) && item.capabilities.length
        ? `<br><span class="log-time">Yetenek alanlarÃ„Â±: ${safeText(item.capabilities.join(", "))}</span>`
        : "";
      row.innerHTML = `<div><strong>${safeText(item.title)}</strong><p>${safeText(item.detail)}<br><span class="log-time">${safeText(item.repo)} Ã‚Â· ${safeText(policyLabel)}</span>${capabilityText}${policy.reason ? `<br><span class="log-time">${safeText(policy.reason)}</span>` : ""}</p></div>`;
      if (item.url) {
        const open = document.createElement("button");
        open.type = "button";
        open.textContent = "GitHub";
        open.addEventListener("click", () => window.codega.openExternal(item.url));
        row.appendChild(open);
      }
      findings.appendChild(row);
    }
  } catch (e) {
    summary.textContent = "GitHub Agent Watch okunamadÃ„Â±: " + (e.message || e);
  }
}

const agentWatchRunBtn = document.getElementById("agent-watch-run");
if (agentWatchRunBtn) agentWatchRunBtn.addEventListener("click", async () => {
  agentWatchRunBtn.disabled = true;
  agentWatchRunBtn.textContent = "TaranÃ„Â±yorÃ¢â‚¬Â¦";
  setTransientStatus("GitHub ajan depolarÃ„Â± taranÃ„Â±yorÃ¢â‚¬Â¦");
  try {
    const result = await window.codega.runAgentWatch();
    setTransientStatus(`Agent Watch tamamlandÃ„Â±: ${result.healthySources}/${result.sourceCount} kaynak, ${result.newCount} yeni bulgu.`);
    await refreshAgentWatch();
    await refreshAutomations();
  } catch (e) {
    setTransientStatus("Agent Watch hatasÃ„Â±: " + (e.message || e));
  } finally {
    agentWatchRunBtn.disabled = false;
    agentWatchRunBtn.textContent = "Ã…Âimdi Tara";
  }
});

async function refreshSecurity() {
  const creds = document.getElementById("security-creds");
  const perms = document.getElementById("security-perms");
  if (!creds && !perms) return;
  try {
    const data = await window.codega.securityStatus();
    if (creds) {
      creds.innerHTML = "";
      for (const c of (data && data.credentials) || []) {
        const row = document.createElement("div");
        row.className = "settings-row";
        const badge = c.present ? `<span class="badge-active">Var ${c.hint ? "Ã‚Â· " + c.hint : ""}</span>` : `<span class="badge-plan">Yok</span>`;
        row.innerHTML = `<div><strong>${c.key.replace(/</g,"&lt;")}</strong><p>${(c.note||"").replace(/</g,"&lt;")}</p></div>${badge}`;
        creds.appendChild(row);
      }
    }
    if (perms) {
      perms.innerHTML = "";
      for (const pm of (data && data.permissions) || []) {
        const row = document.createElement("div");
        row.className = "settings-row";
        const badge = pm.enabled ? `<span class="badge-active">AÃƒÂ§Ã„Â±k</span>` : `<span class="badge-plan">KapalÃ„Â±</span>`;
        row.innerHTML = `<div><strong>${pm.key.replace(/</g,"&lt;")}</strong><p>${(pm.note||"").replace(/</g,"&lt;")}</p></div>${badge}`;
        perms.appendChild(row);
      }
    }
    renderRuntimePolicy(data && data.runtime);
  } catch (_e) {}
}

function renderRuntimePolicy(runtime) {
  const data = runtime || {};
  const device = document.getElementById("runtime-device-name");
  if (device) device.value = data.deviceName || "";
  const permissions = data.toolPermissions || {};
  const permissionFields = {
    "permission-network": permissions.network,
    "permission-mcp": permissions.mcp,
    "permission-code": permissions.codeExecution,
    "permission-development": permissions.autonomousDevelopment,
  };
  for (const [id, value] of Object.entries(permissionFields)) {
    const field = document.getElementById(id);
    if (field) field.value = value || "ask";
  }
  const list = document.getElementById("trusted-workspaces");
  if (list) {
    list.innerHTML = "";
    const folders = Array.isArray(data.trustedFolders) ? data.trustedFolders : [];
    if (!folders.length) list.innerHTML = '<p class="log-empty">HenÃƒÂ¼z gÃƒÂ¼venilen ÃƒÂ§alÃ„Â±Ã…Å¸ma alanÃ„Â± yok.</p>';
    for (const folder of folders) {
      const row = document.createElement("div");
      row.className = "settings-row";
      const text = document.createElement("div");
      text.innerHTML = `<strong>Ãƒâ€¡alÃ„Â±Ã…Å¸ma alanÃ„Â±</strong><p>${safeText(folder)}</p>`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "KaldÃ„Â±r";
      remove.addEventListener("click", async () => {
        agentSettings = await window.codega.removeTrustedWorkspace(folder);
        await refreshSecurity();
      });
      row.append(text, remove);
      list.appendChild(row);
    }
  }
}
const securityRefreshBtn = document.getElementById("security-refresh");
if (securityRefreshBtn) securityRefreshBtn.addEventListener("click", () => refreshSecurity());

const addTrustedWorkspaceBtn = document.getElementById("add-trusted-workspace");
if (addTrustedWorkspaceBtn) addTrustedWorkspaceBtn.addEventListener("click", async () => {
  agentSettings = await window.codega.addTrustedWorkspace();
  await refreshSecurity();
});

const saveRuntimePolicyBtn = document.getElementById("save-runtime-policy");
if (saveRuntimePolicyBtn) saveRuntimePolicyBtn.addEventListener("click", async () => {
  const value = (id, fallback = "ask") => (document.getElementById(id) || {}).value || fallback;
  agentSettings = await window.codega.setSettings({
    remoteToolsDeviceName: value("runtime-device-name", "CODEGA-Cihaz").trim(),
    toolPermissions: {
      network: value("permission-network"),
      mcp: value("permission-mcp"),
      codeExecution: value("permission-code"),
      autonomousDevelopment: value("permission-development"),
    },
  });
  setTransientStatus("Ajan ÃƒÂ§alÃ„Â±Ã…Å¸ma zamanÃ„Â± politikasÃ„Â± kaydedildi.");
  await refreshSecurity();
});

const devPromptBtn = document.getElementById("dev-prompt-btn");
if (devPromptBtn) devPromptBtn.addEventListener("click", async () => {
  const input = (document.getElementById("dev-prompt-input") || {}).value || "";
  const out = document.getElementById("dev-prompt-out");
  if (!input.trim()) { setTransientStatus("Ãƒâ€“nce bir prompt yaz."); return; }
  devPromptBtn.disabled = true;
  if (out) { out.hidden = false; out.textContent = "Ãƒâ€¡alÃ„Â±Ã…Å¸Ã„Â±yorÃ¢â‚¬Â¦"; }
  try {
    const r = await window.codega.devPrompt({ input });
    if (out) out.textContent = r && r.ok ? `[model: ${r.model}]\n${r.text}` : ("Hata: " + ((r && r.message) || "bilinmiyor"));
  } catch (e) { if (out) out.textContent = "Hata: " + (e.message || e); }
  finally { devPromptBtn.disabled = false; }
});
const toggleDebugBtn = document.getElementById("toggle-debug");
if (toggleDebugBtn) toggleDebugBtn.addEventListener("click", () => toggleSetting("debugLogging", toggleDebugBtn));
const toggleDeepBtn = document.getElementById("toggle-deep");
if (toggleDeepBtn) toggleDeepBtn.addEventListener("click", () => toggleSetting("deepReasoning", toggleDeepBtn));
const toggleSacvDebugBtn = document.getElementById("toggle-sacv-debug");
if (toggleSacvDebugBtn) toggleSacvDebugBtn.addEventListener("click", () => toggleSetting("sacvDebug", toggleSacvDebugBtn));

async function refreshMcpStatus() {
  const box = document.getElementById("mcp-status");
  if (!box) return;
  try {
    const sset = await window.codega.getSettings();
    box.innerHTML = "";
    const url = (sset && sset.mcpServerUrl) || "";
    const on = !!(sset && sset.mcpAutoTools);
    const r1 = document.createElement("div");
    r1.className = "settings-row";
    r1.innerHTML = `<div><strong>Sunucu</strong><p>${url ? url.replace(/</g,"&lt;") : "TanÃ„Â±mlÃ„Â± deÃ„Å¸il"}</p></div><span class="${url?'badge-active':'badge-plan'}">${url?'TanÃ„Â±mlÃ„Â±':'Yok'}</span>`;
    box.appendChild(r1);
    const r2 = document.createElement("div");
    r2.className = "settings-row";
    r2.innerHTML = `<div><strong>Ajana baÃ„Å¸lÃ„Â± (otonom kullanÃ„Â±m)</strong><p>AÃƒÂ§Ã„Â±kken ajan sunucunun araÃƒÂ§larÃ„Â±nÃ„Â± kendi ÃƒÂ§aÃ„Å¸Ã„Â±rÃ„Â±r.</p></div><span class="${on?'badge-active':'badge-plan'}">${on?'AÃƒÂ§Ã„Â±k':'KapalÃ„Â±'}</span>`;
    box.appendChild(r2);
    const r3 = document.createElement("div");
    r3.className = "settings-row";
    let health = null;
    try { health = await window.codega.mcpHealth(); } catch (_e) {}
    const healthText = !url
      ? "Sunucu tanÃ„Â±mlÃ„Â± deÃ„Å¸il"
      : health && health.ok
        ? `${health.latencyMs || 0} ms Ã‚Â· ${health.toolCount || 0} araÃƒÂ§`
        : (health && health.message) || "BaÃ„Å¸lantÃ„Â± kurulamadÃ„Â±";
    r3.innerHTML = `<div><strong>BaÃ„Å¸lantÃ„Â± SaÃ„Å¸lÃ„Â±Ã„Å¸Ã„Â±</strong><p>${safeText(healthText)}</p></div><span class="${health && health.ok ? 'badge-active' : 'badge-plan'}">${health && health.ok ? 'HazÃ„Â±r' : 'Kontrol Gerekli'}</span>`;
    box.appendChild(r3);
    const r4 = document.createElement("div");
    r4.className = "settings-row";
    r4.innerHTML = `<div><strong>YapÃ„Â±landÃ„Â±rma</strong><p>Sunucu URL, araÃƒÂ§ listeleme ve manuel ÃƒÂ§aÃ„Å¸rÃ„Â± "HafÃ„Â±za & Bilgi" sekmesindedir.</p></div>`;
    box.appendChild(r4);
  } catch (_e) {}
}
const mcpStatusRefreshBtn = document.getElementById("mcp-status-refresh");
if (mcpStatusRefreshBtn) mcpStatusRefreshBtn.addEventListener("click", () => refreshMcpStatus());

async function refreshRag() {
  const docs = document.getElementById("rag-docs");
  const statsEl = document.getElementById("rag-stats");
  if (!docs && !statsEl) return;
  try {
    if (statsEl) {
      const st = await window.codega.ragStats();
      statsEl.textContent = st ? `${st.documents} belge Ã‚Â· ${st.chunks} parÃƒÂ§a Ã‚Â· ${st.embedded} embedding'li` : "Ã„Â°statistik yok.";
    }
    if (docs) {
      const list = await window.codega.ragList();
      docs.innerHTML = "";
      if (!list || !list.length) { docs.innerHTML = '<p class="log-empty">HenÃƒÂ¼z belge eklenmedi.</p>'; }
      for (const d of (list || [])) {
        const row = document.createElement("div");
        row.className = "settings-row";
        const emb = d.embedded ? `${d.embedded}/${d.chunks} embedding` : `${d.chunks} parÃƒÂ§a (keyword)`;
        row.innerHTML = `<div><strong>${(d.title||"DokÃƒÂ¼man").replace(/</g,"&lt;")}</strong><p>${emb}</p></div>`;
        const del = document.createElement("button");
        del.type = "button"; del.textContent = "Sil";
        del.addEventListener("click", async () => {
          if (!window.confirm(`"${d.title}" silinsin mi?`)) return;
          del.disabled = true;
          try { await window.codega.ragDelete({ docId: d.docId }); refreshRag(); }
          catch (e) { setTransientStatus("Hata: " + (e.message||e)); del.disabled = false; }
        });
        row.appendChild(del);
        docs.appendChild(row);
      }
    }
  } catch (_e) {}
}
const ragAddBtn = document.getElementById("rag-add");
if (ragAddBtn) ragAddBtn.addEventListener("click", async () => {
  const title = (document.getElementById("rag-title")||{}).value || "";
  const text = (document.getElementById("rag-text")||{}).value || "";
  if (!text.trim()) { setTransientStatus("Metin boÃ…Å¸ olamaz."); return; }
  ragAddBtn.disabled = true; setTransientStatus("Ã„Â°ndeksleniyorÃ¢â‚¬Â¦");
  try {
    const r = await window.codega.ragIngest({ title: title.trim() || "DokÃƒÂ¼man", text });
    setTransientStatus(r && r.ok ? `Eklendi (+${r.added} parÃƒÂ§a${r.embedded?", embedding'li":""}).` : "Eklenemedi.");
    const ti=document.getElementById("rag-title"), tx=document.getElementById("rag-text");
    if (ti) ti.value=""; if (tx) tx.value="";
    refreshRag();
  } catch (e) { setTransientStatus("Hata: " + (e.message||e)); }
  finally { ragAddBtn.disabled = false; }
});
const ragRefreshBtn = document.getElementById("rag-refresh");
if (ragRefreshBtn) ragRefreshBtn.addEventListener("click", () => refreshRag());
const ragClearBtn = document.getElementById("rag-clear");
if (ragClearBtn) ragClearBtn.addEventListener("click", async () => {
  if (!window.confirm("TÃƒÂ¼m RAG belgeleri silinsin mi?")) return;
  try { await window.codega.ragClear(); refreshRag(); } catch (_e) {}
});
const ragSearchBtn = document.getElementById("rag-search-btn");
if (ragSearchBtn) ragSearchBtn.addEventListener("click", async () => {
  const q = (document.getElementById("rag-query")||{}).value || "";
  const out = document.getElementById("rag-search-out");
  if (!q.trim()) { setTransientStatus("Ãƒâ€“nce bir sorgu yaz."); return; }
  if (out) { out.hidden = false; out.textContent = "AranÃ„Â±yorÃ¢â‚¬Â¦"; }
  try {
    const hits = await window.codega.ragSearch({ query: q });
    if (out) out.textContent = (hits && hits.length)
      ? hits.map((h,i) => `#${i+1} [${h.title}] (skor ${h.score.toFixed(3)})\n${h.text.slice(0,300)}`).join("\n\n")
      : "EÃ…Å¸leÃ…Å¸me bulunamadÃ„Â±.";
  } catch (e) { if (out) out.textContent = "Hata: " + (e.message||e); }
});
const toggleRagBtn = document.getElementById("toggle-rag");
if (toggleRagBtn) toggleRagBtn.addEventListener("click", () => toggleSetting("ragEnabled", toggleRagBtn));

els.settingsButton.addEventListener("click", async () => {
  els.settings.showModal();
  setActiveCat("overview");
  await refreshModels();
  await refreshModelUpdates();
  await refreshAgentSettings();
  updateOverview();
  refreshImproveDrafts();
  refreshLiveStats();
  startLiveMetrics();
  refreshLogs();
  refreshRouter();
  refreshModelsPage();
  refreshCookbook();
  refreshAutomations();
  refreshAgentWatch();
  refreshSecurity();
  refreshMcpStatus();
  refreshRag();
  if (toggleRagBtn && agentSettings) applyToggleLabel(toggleRagBtn, agentSettings.ragEnabled !== false);
  if (toggleDebugBtn && agentSettings) applyToggleLabel(toggleDebugBtn, !!agentSettings.debugLogging);
  if (toggleDeepBtn && agentSettings) applyToggleLabel(toggleDeepBtn, !!agentSettings.deepReasoning);
  if (toggleSacvDebugBtn && agentSettings) applyToggleLabel(toggleSacvDebugBtn, !!agentSettings.sacvDebug);
  // Aktif Model: kullanÃ„Â±cÃ„Â±nÃ„Â±n seÃƒÂ§tiÃ„Å¸i varsayÃ„Â±lan (yoksa canlÃ„Â± durum)
  window.codega.getStatus().then((st) => {
    const raw = st && st.model;
    const live = raw && (raw.model || (typeof raw === "string" ? raw : null));
    const configured = agentSettings && (agentSettings.defaultModel || agentSettings.model);
    const el = document.getElementById("ov-health-model");
    if (el) el.textContent = String(configured || live || "Ã¢â‚¬â€");
  }).catch(() => {});
  if (typeof refreshLearnList === "function") refreshLearnList();
  window.codega.feedbackStats().then((f) => {
    const el = document.getElementById("ov-feedback");
    if (el && f) el.textContent = `ÄŸÅ¸â€˜Â ${f.up || 0} Ã‚Â· ÄŸÅ¸â€˜Â ${f.down || 0}`;
  }).catch(() => {});
  window.codega.analyzeSystem().then((sys) => {
    const el = document.getElementById("ov-system");
    const btn = document.getElementById("ov-use-recommended");
    if (!sys) return;
    if (el) el.textContent = `${sys.ramGB} GB RAM Ã‚Â· ${sys.cores} ÃƒÂ§ekirdek Ã‚Â· ${sys.platform}/${sys.arch} Ã¢â€ â€™ ÃƒÂ¶nerilen: ${sys.recommended.label}`;
    if (btn && sys.recommended) {
      btn.hidden = false;
      btn.onclick = async () => {
        btn.disabled = true;
        try { await runModelSetup(sys.recommended.id, sys.recommended.label); }
        finally { btn.disabled = false; }
      };
    }
  }).catch(() => {});
});

// ===== Ayarlar Kontrol Merkezi: gezinme / arama / iÃƒÂ§e-dÃ„Â±Ã…Å¸a aktarma =====
const settingsCats = document.getElementById("settings-cats");
const settingsNav = document.getElementById("settings-nav");

function buildSettingsNav() {
  if (!settingsNav || !settingsCats) return;
  const groups = settingsCats.querySelectorAll(".settings-group[data-cat]");
  const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const meta = {
    overview: { icon: svg('<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>'), group: "Merkez" },
    ai: { icon: svg('<path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V5a3 3 0 0 0-3-3Z"/><path d="M9 12h6"/>'), group: "Zeka" },
    models: { icon: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'), group: "Zeka" },
    router: { icon: svg('<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 6h6a2 2 0 0 1 2 2v2M8 18h6a2 2 0 0 0 2-2v-2"/>'), group: "Zeka" },
    agents: { icon: svg('<circle cx="12" cy="7" r="3"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/>'), group: "Zeka" },
    memory: { icon: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9zM2 10h2M2 14h2M20 10h2M20 14h2M10 2v2M14 2v2M10 20v2M14 20v2"/>'), group: "Bilgi" },
    rag: { icon: svg('<path d="M4 4h10l6 6v10H4z"/><path d="M14 4v6h6M8 14h8M8 18h5"/>'), group: "Bilgi" },
    mcp: { icon: svg('<path d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"/>'), group: "Baglanti & Araclar" },
    tools: { icon: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.7 2.7-2-2 2.7-2.7Z"/>'), group: "Baglanti & Araclar" },
    auto: { icon: svg('<path d="M12 2v4M12 18v4M6 12H2M22 12h-4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"/><circle cx="12" cy="12" r="3"/>'), group: "Baglanti & Araclar" },
    general: { icon: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 9.4l-.4-.4a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 11 5.4V5a2 2 0 0 1 4 0v.09"/>'), group: "Sistem" },
    security: { icon: svg('<path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/>'), group: "Sistem" },
    system: { icon: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'), group: "Sistem" },
    logs: { icon: svg('<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>'), group: "Sistem" },
    dev: { icon: svg('<path d="m8 6-6 6 6 6M16 6l6 6-6 6M14 4l-4 16"/>'), group: "Sistem" },
  };
  const order = ["Merkez", "Zeka", "Bilgi", "Baglanti & Araclar", "Sistem"];
  settingsNav.innerHTML = "";
  order.forEach((label) => {
    const matching = Array.from(groups).filter((g) => (meta[g.dataset.cat]?.group || "Sistem") === label);
    if (!matching.length) return;
    const groupLabel = document.createElement("div");
    groupLabel.className = "nav-group-label";
    groupLabel.textContent = label;
    settingsNav.appendChild(groupLabel);
    matching.forEach((g) => {
      g.open = true;
      const item = meta[g.dataset.cat] || { icon: "&#8226;" };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-btn" + (g.classList.contains("active") ? " active" : "");
      btn.dataset.target = g.dataset.cat;
      const pill = item.pill ? `<span class="nav-pill">${item.pill}</span>` : "";
      btn.innerHTML = `<span class="nav-icon">${item.icon}</span><span>${g.dataset.label || g.dataset.cat}</span>${pill}`;
      btn.addEventListener("click", () => setActiveCat(g.dataset.cat));
      settingsNav.appendChild(btn);
    });
  });
}

function setActiveCat(cat) {
  if (!settingsCats) return;
  const search = document.getElementById("settings-search");
  if (search) search.value = "";
  settingsCats.classList.remove("searching");
  settingsCats.querySelectorAll(".hidden-row").forEach((r) => r.classList.remove("hidden-row"));
  settingsCats.querySelectorAll(".settings-group[data-cat]").forEach((g) => {
    const active = g.dataset.cat === cat;
    g.style.display = "";
    g.classList.toggle("active", active);
    g.open = active;
  });
  if (settingsNav) {
    settingsNav.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.target === cat);
    });
  }
}

document.querySelectorAll("[data-settings-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const cat = button.dataset.settingsTarget;
    if (!cat) return;
    setActiveCat(cat);
    const provider = button.dataset.providerTarget;
    if (provider && els.providerSelect) {
      els.providerSelect.value = provider;
      updateProviderVisibility();
    }
    const targetId = button.dataset.focusTarget;
    window.requestAnimationFrame(() => {
      const target = targetId
        ? document.getElementById(targetId)
        : provider ? els.providerSelect : settingsCats.querySelector(`.settings-group[data-cat="${cat}"]`);
      target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      target?.focus?.({ preventScroll: true });
    });
  });
});

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
  const health = (name, ready, active, configuredText = "hazÃ„Â±r") => {
    set(`ov-health-${name}`, active ? "aktif" : ready ? configuredText : "yapÃ„Â±landÃ„Â±rÃ„Â±lmadÃ„Â±");
    const dot = document.getElementById(`ov-health-${name}-dot`);
    if (dot) dot.className = `dot ${active || ready ? "ok" : "plan"}`;
  };
  const ollama = document.getElementById("ollama-row-status");
  const ollamaText = ollama ? ollama.textContent || "" : "";
  const ollamaReady = /ÃƒÂ§alÃ„Â±Ã…Å¸Ã„Â±yor/i.test(ollamaText);
  if (ollama) set("ov-health-ollama", ollamaReady ? "\u00e7al\u0131\u015f\u0131yor" : "kurulu de\u011fil");
  if (ollama) set("ov-ollama", /ÃƒÂ§alÃ„Â±Ã…Å¸Ã„Â±yor/i.test(ollama.textContent) ? "Ãƒâ€¡alÃ„Â±Ã…Å¸Ã„Â±yor Ã¢Å“â€œ" : "Kurulu deÃ„Å¸il");
  const ver = document.getElementById("version-label");
  if (ver) set("ov-version", ver.textContent || "Ã¢â‚¬â€");
  const mem = document.getElementById("memory-summary");
  if (mem) set("ov-memory", (mem.textContent || "").slice(0, 40));
  if (agentSettings && (agentSettings.model || agentSettings.defaultModel)) {
    const model = agentSettings.model || agentSettings.defaultModel;
    set("ov-model", model);
    set("ov-health-model", model);
  }
  if (agentSettings) {
    const providerHealth = (name, apiKey) => {
      const configured = !!String(apiKey || "").trim();
      const selected = agentSettings.provider === name;
      set(`ov-health-${name}`, selected ? (configured ? "aktif" : "API anahtarÃ„Â± gerekli") : (configured ? "hazÃ„Â±r" : "yapÃ„Â±landÃ„Â±rÃ„Â±lmadÃ„Â±"));
      const dot = document.getElementById(`ov-health-${name}-dot`);
      if (dot) dot.className = `dot ${selected && !configured ? "warn" : configured ? "ok" : "plan"}`;
    };
    providerHealth("openai", agentSettings.openaiApiKey);
    providerHealth("claude", agentSettings.claudeApiKey);
    providerHealth("gemini", agentSettings.geminiApiKey);
    health("mcp", !!String(agentSettings.mcpServerUrl || "").trim(), !!agentSettings.mcpAutoTools, agentSettings.mcpAutoTools ? "ajana baÃ„Å¸lÃ„Â±" : "sunucu kayÃ„Â±tlÃ„Â±");
    health("federation", !!agentSettings.federation, !!agentSettings.federation, "aÃƒÂ§Ã„Â±k");
    if (!agentSettings.federation) set("ov-health-federation", "kapalÃ„Â±");
  }
}

// Arama kutusu (Enter dialog'u kapatmasÃ„Â±n)
const settingsSearchInput = document.getElementById("settings-search");
if (settingsSearchInput) {
  settingsSearchInput.addEventListener("input", (e) => runSettingsSearch(e.target.value));
  settingsSearchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
}

const settingsThemeToggle = document.getElementById("settings-theme-toggle");
function updateSettingsThemeToggle() {
  if (!settingsThemeToggle) return;
  const theme = (agentSettings && agentSettings.theme) || document.body.dataset.theme || "oled";
  settingsThemeToggle.textContent = theme === "oled" ? "\u2600 Light" : "\u263e Dark";
}
if (settingsThemeToggle) {
  settingsThemeToggle.addEventListener("click", async () => {
    const current = (agentSettings && agentSettings.theme) || document.body.dataset.theme || "oled";
    await setAppearance({ theme: current === "oled" ? "slate" : "oled" });
    updateSettingsThemeToggle();
  });
}

// JSON dÃ„Â±Ã…Å¸a aktarma
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
      setTransientStatus("Ayarlar dÃ„Â±Ã…Å¸a aktarÃ„Â±ldÃ„Â±.");
    } catch (e) {
      setTransientStatus("DÃ„Â±Ã…Å¸a aktarma baÃ…Å¸arÃ„Â±sÃ„Â±z: " + (e.message || e));
    }
  });
}

// JSON iÃƒÂ§e aktarma
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
        if (!data || typeof data !== "object") throw new Error("geÃƒÂ§ersiz format");
        agentSettings = await window.codega.setSettings(data);
        applyAppearance(agentSettings);
        await refreshAgentSettings();
        updateOverview();
        setTransientStatus("Ayarlar iÃƒÂ§e aktarÃ„Â±ldÃ„Â± Ã¢Å“â€œ");
      } catch (err) {
        setTransientStatus("Ã„Â°ÃƒÂ§e aktarma baÃ…Å¸arÃ„Â±sÃ„Â±z: " + (err.message || err));
      }
      settingsImportFile.value = "";
    };
    fr.readAsText(file);
  });
}

// AjanÃ„Â±n topladÃ„Â±Ã„Å¸Ã„Â± ÃƒÂ¶neri taslaklarÃ„Â±: listele + tek tÃ„Â±kla PR
async function refreshImproveDrafts() {
  const list = document.getElementById("improve-drafts-list");
  const status = document.getElementById("improve-drafts-status");
  if (!list) return;
  let drafts = [];
  try { drafts = (await window.codega.improveDrafts()) || []; } catch (_e) { drafts = []; }
  list.innerHTML = "";
  if (!drafts.length) {
    if (status) status.textContent = "Ã…Âu an taslak yok Ã¢â‚¬â€ ajan henÃƒÂ¼z dikkate deÃ„Å¸er tekrar eden bir sorun gÃƒÂ¶zlemlemedi.";
    return;
  }
  if (status) status.textContent = `${drafts.length} taslak ÃƒÂ¶neri (yerel). Birini PR olarak aÃƒÂ§abilirsin.`;
  drafts.forEach((d) => {
    const row = document.createElement("div");
    row.className = "settings-row";
    const info = document.createElement("div");
    info.innerHTML = `<strong>${d.idea}</strong><p>${d.rationale}</p>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "PR AÃƒÂ§";
    btn.addEventListener("click", async () => {
      const repo = (document.getElementById("improve-repo")?.value || "").trim();
      btn.disabled = true;
      setTransientStatus("Ãƒâ€“neri PR'Ã„Â± hazÃ„Â±rlanÃ„Â±yorÃ¢â‚¬Â¦");
      try {
        const res = await window.codega.proposeImprovement({ repo, idea: d.idea, rationale: d.rationale });
        if (res && res.url) {
          try { await navigator.clipboard.writeText(res.url); } catch {}
          setTransientStatus(`Ãƒâ€“neri PR aÃƒÂ§Ã„Â±ldÃ„Â± (#${res.number}) Ã¢â‚¬â€ link kopyalandÃ„Â±.`);
        } else setTransientStatus("PR aÃƒÂ§Ã„Â±ldÃ„Â± ama link alÃ„Â±namadÃ„Â±.");
      } catch (e) {
        setTransientStatus("PR aÃƒÂ§Ã„Â±lamadÃ„Â±: " + (e.message || e));
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

const PROVIDER_FIELDS = {
  openai: { base: "openaiBaseUrl", key: "openaiApiKey", model: "openaiModel", baseUrl: "https://api.openai.com/v1", modelName: "gpt-4o-mini" },
  claude: { base: "claudeBaseUrl", key: "claudeApiKey", model: "claudeModel", baseUrl: "https://api.anthropic.com/v1", modelName: "claude-sonnet-4-20250514" },
  gemini: { base: "geminiBaseUrl", key: "geminiApiKey", model: "geminiModel", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", modelName: "gemini-2.5-flash" },
};

function selectedProviderFields() {
  return PROVIDER_FIELDS[(els.providerSelect && els.providerSelect.value) || ""] || null;
}

function fillProviderFields() {
  const fields = selectedProviderFields();
  if (!fields || !agentSettings) return;
  if (els.openaiBase) els.openaiBase.value = agentSettings[fields.base] || fields.baseUrl;
  if (els.openaiKey) els.openaiKey.value = agentSettings[fields.key] || "";
  if (els.openaiModel) els.openaiModel.value = agentSettings[fields.model] || fields.modelName;
}

function updateProviderVisibility() {
  if (!els.providerCloudFields || !els.providerSelect) return;
  els.providerCloudFields.style.display = selectedProviderFields() ? "" : "none";
  fillProviderFields();
}
if (els.providerSelect) els.providerSelect.addEventListener("change", async () => {
  agentSettings = await window.codega.setSettings({ provider: els.providerSelect.value });
  updateProviderVisibility();
  updateOverview();
  setTransientStatus(selectedProviderFields() ? "Bulut saÃ„Å¸layÃ„Â±cÃ„Â± seÃƒÂ§ildi." : "Yerel saÃ„Å¸layÃ„Â±cÃ„Â± seÃƒÂ§ildi.");
});
function bindProviderField(el, fieldName) {
  if (!el) return;
  el.addEventListener("change", async () => {
    const fields = selectedProviderFields();
    if (!fields) return;
    agentSettings = await window.codega.setSettings({ [fields[fieldName]]: el.value.trim() });
    updateOverview();
  });
}
bindProviderField(els.openaiBase, "base");
bindProviderField(els.openaiKey, "key");
bindProviderField(els.openaiModel, "model");
if (els.providerTest) els.providerTest.addEventListener("click", async () => {
  els.providerTest.disabled = true;
  setTransientStatus("BaÃ„Å¸lantÃ„Â± test ediliyorÃ¢â‚¬Â¦");
  try {
    const r = await window.codega.testProvider({
      provider: els.providerSelect ? els.providerSelect.value : "openai",
      baseUrl: els.openaiBase ? els.openaiBase.value.trim() : "",
      apiKey: els.openaiKey ? els.openaiKey.value.trim() : "",
      model: els.openaiModel ? els.openaiModel.value.trim() : "",
    });
    setTransientStatus((r && r.message) || (r && r.ok ? "BaÃ„Å¸lantÃ„Â± baÃ…Å¸arÃ„Â±lÃ„Â±." : "BaÃ„Å¸lantÃ„Â± baÃ…Å¸arÃ„Â±sÃ„Â±z."));
  } catch (e) {
    setTransientStatus("Test hatasÃ„Â±: " + (e.message || e));
  } finally {
    els.providerTest.disabled = false;
  }
});

// Ã„Â°nsan onaylÃ„Â± kod ÃƒÂ§alÃ„Â±Ã…Å¸tÃ„Â±rÃ„Â±cÃ„Â± (ajan kendiliÃ„Å¸inden ÃƒÂ§alÃ„Â±Ã…Å¸tÃ„Â±rmaz)
const codeRunBtn = document.getElementById("code-run");
if (codeRunBtn) {
  codeRunBtn.addEventListener("click", async () => {
    const lang = (document.getElementById("code-lang") || {}).value || "python";
    const code = (document.getElementById("code-input") || {}).value || "";
    const out = document.getElementById("code-output");
    if (!code.trim()) { setTransientStatus("Ãƒâ€“nce kod yaz."); return; }
    codeRunBtn.disabled = true;
    if (out) { out.hidden = false; out.textContent = "Ãƒâ€¡alÃ„Â±Ã…Å¸Ã„Â±yorÃ¢â‚¬Â¦"; }
    try {
      const r = await window.codega.runCode({ language: lang, code });
      const parts = [];
      if (r.stdout) parts.push(r.stdout);
      if (r.stderr) parts.push((r.stdout ? "\nÃ¢â‚¬â€ stderr Ã¢â‚¬â€\n" : "") + r.stderr);
      const body = parts.join("") || "(ÃƒÂ§Ã„Â±ktÃ„Â± yok)";
      if (out) out.textContent = `[ÃƒÂ§Ã„Â±kÃ„Â±Ã…Å¸ kodu: ${r.exitCode}]\n${body}`;
    } catch (e) {
      if (out) out.textContent = "Hata: " + (e.message || e);
    } finally {
      codeRunBtn.disabled = false;
    }
  });
}

function setSendingUi(on) {
  if (els.sendBtn) els.sendBtn.hidden = !!on;
  if (els.stopBtn) els.stopBtn.hidden = !on;
}
if (els.stopBtn) els.stopBtn.addEventListener("click", async () => {
  els.stopBtn.disabled = true;
  setTransientStatus("DurduruluyorÃ¢â‚¬Â¦");
  try { await window.codega.abortChat(); } catch (_e) {}
  els.stopBtn.disabled = false;
});

function syncBrainField() {
  if (els.brainInput) els.brainInput.value = (currentChat().context || "");
}
if (els.brainBtn) els.brainBtn.addEventListener("click", () => {
  if (!els.brainPanel) return;
  els.brainPanel.hidden = !els.brainPanel.hidden;
  if (!els.brainPanel.hidden) { syncBrainField(); els.brainInput && els.brainInput.focus(); }
});
if (els.brainInput) els.brainInput.addEventListener("input", () => {
  const c = currentChat();
  c.context = els.brainInput.value;
  saveChats();
  if (els.brainBtn) els.brainBtn.classList.toggle("on", !!c.context.trim());
});

// MCP araÃƒÂ§ sunucusu (manuel; ajan dÃƒÂ¶ngÃƒÂ¼sÃƒÂ¼ne baÃ„Å¸lÃ„Â± deÃ„Å¸il)
const mcpListBtn = document.getElementById("mcp-list");
if (mcpListBtn) {
  mcpListBtn.addEventListener("click", async () => {
    const url = (document.getElementById("mcp-url") || {}).value || "";
    const box = document.getElementById("mcp-tools");
    mcpListBtn.disabled = true;
    if (box) box.textContent = "BaÃ„Å¸lanÃ„Â±lÃ„Â±yorÃ¢â‚¬Â¦";
    try {
      const r = await window.codega.mcpListTools({ url: url.trim() });
      const tools = (r && r.tools) || [];
      if (box) {
        box.innerHTML = "";
        if (!tools.length) { box.textContent = "AraÃƒÂ§ bulunamadÃ„Â±."; }
        tools.forEach((t) => {
          const row = document.createElement("div");
          row.className = "settings-row";
          row.innerHTML = `<div><strong>${t.name}</strong><p>${(t.description||"").slice(0,140)}</p></div>`;
          const use = document.createElement("button");
          use.type = "button"; use.textContent = "SeÃƒÂ§";
          use.addEventListener("click", () => { const n = document.getElementById("mcp-tool-name"); if (n) n.value = t.name; });
          row.appendChild(use);
          box.appendChild(row);
        });
      }
      setTransientStatus(`${tools.length} araÃƒÂ§ bulundu${r && r.serverInfo ? " Ã‚Â· " + r.serverInfo.name : ""}.`);
    } catch (e) {
      if (box) box.textContent = "Hata: " + (e.message || e);
      setTransientStatus("MCP baÃ„Å¸lanÃ„Â±lamadÃ„Â±.");
    } finally {
      mcpListBtn.disabled = false;
    }
  });
}
const mcpCallBtn = document.getElementById("mcp-call");
if (mcpCallBtn) {
  mcpCallBtn.addEventListener("click", async () => {
    const url = (document.getElementById("mcp-url") || {}).value || "";
    const name = (document.getElementById("mcp-tool-name") || {}).value || "";
    const args = (document.getElementById("mcp-tool-args") || {}).value || "";
    const out = document.getElementById("mcp-output");
    if (!name.trim()) { setTransientStatus("AraÃƒÂ§ adÃ„Â± gir."); return; }
    mcpCallBtn.disabled = true;
    if (out) { out.hidden = false; out.textContent = "Ãƒâ€¡aÃ„Å¸rÃ„Â±lÃ„Â±yorÃ¢â‚¬Â¦"; }
    try {
      const r = await window.codega.mcpCallTool({ url: url.trim(), name: name.trim(), args });
      if (out) out.textContent = (r.isError ? "[hata] " : "") + (r.text || "(boÃ…Å¸)");
    } catch (e) {
      if (out) out.textContent = "Hata: " + (e.message || e);
    } finally {
      mcpCallBtn.disabled = false;
    }
  });
}

if (els.toggleContinuous) els.toggleContinuous.addEventListener("click", () => toggleSetting("continuousLearning", els.toggleContinuous));
if (els.toggleSemantic) els.toggleSemantic.addEventListener("click", () => toggleSetting("semanticSearch", els.toggleSemantic));
if (els.toggleDistill) els.toggleDistill.addEventListener("click", () => toggleSetting("distillLearning", els.toggleDistill));
function bindLearnField(el, key) {
  if (!el) return;
  el.addEventListener("change", async () => { agentSettings = await window.codega.setSettings({ [key]: el.value.trim() }); });
}
bindLearnField(els.learnTopics, "learningTopics");
bindLearnField(document.getElementById("learn-sources"), "learningSources");
bindLearnField(els.learnRepo, "learningSyncRepo");

async function refreshLearnList() {
  const box = document.getElementById("learn-list");
  if (!box) return;
  try {
    const r = await window.codega.learningList();
    const notes = (r && r.notes) || [];
    box.innerHTML = "";
    const head = document.createElement("p");
    head.className = "section-label";
    head.textContent = `Ãƒâ€“Ã„Å¸renilen bilgi: ${(r && r.total) || 0}` + (r && r.last ? ` Ã‚Â· son konu: ${r.last.topic}` : "");
    box.appendChild(head);
    notes.slice(0, 15).forEach((n) => {
      const row = document.createElement("div");
      row.className = "settings-row";
      row.innerHTML = `<div><strong>[${n.source}] ${n.topic}</strong><p>${(n.text||"").replace(/</g,"&lt;").slice(0,160)}</p></div>`;
      box.appendChild(row);
    });
  } catch (_e) {}
}
const learnNowBtn = document.getElementById("learn-now");
if (learnNowBtn) learnNowBtn.addEventListener("click", async () => {
  learnNowBtn.disabled = true;
  setTransientStatus("Ãƒâ€“Ã„Å¸reniliyorÃ¢â‚¬Â¦ (seÃƒÂ§ili kaynaklar)");
  try {
    const r = await window.codega.learnNow({});
    setTransientStatus(r && r.ok ? `Ãƒâ€“Ã„Å¸renildi: ${r.topic} (+${r.added}, toplam ${r.total})` : (r && r.message) || "Ãƒâ€“Ã„Å¸renilemedi.");
    refreshLearnList();
  } catch (e) { setTransientStatus("Ãƒâ€“Ã„Å¸renme hatasÃ„Â±: " + (e.message || e)); }
  finally { learnNowBtn.disabled = false; }
});
const learnClearBtn = document.getElementById("learn-clear");
if (learnClearBtn) learnClearBtn.addEventListener("click", async () => {
  try { await window.codega.clearLearning(); refreshLearnList(); setTransientStatus("Ãƒâ€“Ã„Å¸renilenler temizlendi."); } catch (_e) {}
});

if (els.toggleMcpAuto) els.toggleMcpAuto.addEventListener("click", async () => {
  const next = !agentSettings.mcpAutoTools;
  const url = ((document.getElementById("mcp-url") || {}).value || "").trim();
  if (next && !/^https?:\/\//i.test(url)) { setTransientStatus("Ãƒâ€“nce geÃƒÂ§erli bir MCP sunucu URL gir."); return; }
  els.toggleMcpAuto.disabled = true;
  try {
    agentSettings = await window.codega.setSettings({ mcpAutoTools: next, mcpServerUrl: url });
    applyToggleLabel(els.toggleMcpAuto, !!agentSettings.mcpAutoTools);
    const r = await window.codega.mcpRefreshTools();
    setTransientStatus(next ? (r && r.ok ? `Ajana ${r.count} MCP aracÃ„Â± baÃ„Å¸landÃ„Â±.` : "BaÃ„Å¸lanamadÃ„Â±: " + ((r && r.message) || "")) : "MCP araÃƒÂ§larÃ„Â± ajandan ÃƒÂ§Ã„Â±karÃ„Â±ldÃ„Â±.");
  } catch (e) { setTransientStatus("Hata: " + (e.message || e)); }
  finally { els.toggleMcpAuto.disabled = false; }
});

buildSettingsNav();

// Denetimli kendini geliÃ…Å¸tirme: ÃƒÂ¶neriyi PR olarak aÃƒÂ§
const improveSubmit = document.getElementById("improve-submit");
if (improveSubmit) {
  improveSubmit.addEventListener("click", async () => {
    const repo = (document.getElementById("improve-repo")?.value || "").trim();
    const idea = (document.getElementById("improve-idea")?.value || "").trim();
    if (!idea) { setTransientStatus("Ãƒâ€“nce bir ÃƒÂ¶neri metni yaz."); return; }
    improveSubmit.disabled = true;
    setTransientStatus("Ãƒâ€“neri PR'Ã„Â± hazÃ„Â±rlanÃ„Â±yorÃ¢â‚¬Â¦");
    try {
      const res = await window.codega.proposeImprovement({ repo, idea });
      if (res && res.url) {
        try { await navigator.clipboard.writeText(res.url); } catch {}
        setTransientStatus(`Ãƒâ€“neri PR aÃƒÂ§Ã„Â±ldÃ„Â± (#${res.number}) Ã¢â‚¬â€ link kopyalandÃ„Â±.`);
        const ideaEl = document.getElementById("improve-idea");
        if (ideaEl) ideaEl.value = "";
      } else {
        setTransientStatus("PR aÃƒÂ§Ã„Â±ldÃ„Â± ama link alÃ„Â±namadÃ„Â±.");
      }
    } catch (e) {
      setTransientStatus("Ãƒâ€“neri PR'Ã„Â± aÃƒÂ§Ã„Â±lamadÃ„Â±: " + (e.message || e));
    } finally {
      improveSubmit.disabled = false;
    }
  });
}

if (els.developmentRun) {
  els.developmentRun.addEventListener("click", async () => {
    const repo = (els.developmentRepo.value || "").trim();
    const paths = (els.developmentPaths.value || "").trim();
    const task = (els.developmentTask.value || "").trim();
    if (!repo || !paths || !task) {
      setTransientStatus("Repo, hedef dosyalar ve geliÃ…Å¸tirme gÃƒÂ¶revi gerekli.");
      return;
    }
    els.developmentRun.disabled = true;
    els.developmentStatus.textContent = "Dosyalar okunuyor, kod deÃ„Å¸iÃ…Å¸ikliÃ„Å¸i hazÃ„Â±rlanÃ„Â±yorÃ¢â‚¬Â¦";
    try {
      agentSettings = await window.codega.setSettings({
        autonomousDevelopmentRepo: repo,
        autonomousDevelopmentPaths: paths,
        autonomousDevelopmentIntervalHours: Math.max(1, Math.min(168, Number(els.developmentInterval?.value) || 24)),
      });
      const result = await window.codega.runAutonomousDevelopment({ repo, paths, task });
      els.developmentStatus.textContent =
        `Taslak PR #${result.number} aÃƒÂ§Ã„Â±ldÃ„Â± Ã‚Â· ${result.changedFiles.length} dosya Ã‚Â· ${result.branch}`;
      try { await navigator.clipboard.writeText(result.url); } catch (_e) {}
      setTransientStatus(`Taslak PR #${result.number} aÃƒÂ§Ã„Â±ldÃ„Â±; baÃ„Å¸lantÃ„Â± kopyalandÃ„Â±.`);
      els.developmentTask.value = "";
    } catch (error) {
      els.developmentStatus.textContent = `GeliÃ…Å¸tirme durdu: ${error.message || error}`;
      setTransientStatus("Kod geliÃ…Å¸tirme gÃƒÂ¶revi tamamlanamadÃ„Â±.");
    } finally {
      els.developmentRun.disabled = false;
    }
  });
}

// Kendi kendine bakÃ„Â±m: elle ÃƒÂ§alÃ„Â±Ã…Å¸tÃ„Â±r + sonucu gÃƒÂ¶ster
function summarizeMaintenance(rep) {
  if (!rep || !rep.items) return "BakÃ„Â±m bilgisi yok.";
  const oll = rep.items.find((i) => i.name === "ollama");
  const parts = [`Ollama: ${oll && oll.status === "ok" ? "ÃƒÂ§alÃ„Â±Ã…Å¸Ã„Â±yor Ã¢Å“â€œ" : "kapalÃ„Â±"}`];
  if (rep.repairs && rep.repairs.length) parts.push(`onarÃ„Â±ldÃ„Â±: ${rep.repairs.join(", ")}`);
  else parts.push("onarÃ„Â±m gerekmedi");
  return parts.join(" Ã‚Â· ");
}
if (els.runMaintenance) {
  els.runMaintenance.addEventListener("click", async () => {
    els.runMaintenance.disabled = true;
    try {
      const rep = await window.codega.runMaintenance();
      const txt = summarizeMaintenance(rep);
      const ov = document.getElementById("ov-maintenance");
      if (ov) ov.textContent = txt;
      setTransientStatus("BakÃ„Â±m tamam Ã¢â‚¬â€ " + txt);
    } catch (e) {
      setTransientStatus("BakÃ„Â±m baÃ…Å¸arÃ„Â±sÃ„Â±z: " + (e.message || e));
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
  updateSettingsThemeToggle();
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
  const what = patch.theme ? "Tema" : patch.accent ? "Vurgu rengi" : patch.fontScale ? "YazÃ„Â± boyutu" : "GÃƒÂ¶rÃƒÂ¼nÃƒÂ¼m";
  setTransientStatus(`${what} uygulandÃ„Â±.`);
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

// AÃƒÂ§Ã„Â±lÃ„Â±Ã…Å¸ta kayÃ„Â±tlÃ„Â± gÃƒÂ¶rÃƒÂ¼nÃƒÂ¼mÃƒÂ¼ uygula
window.codega
  .getSettings()
  .then((s) => {
    agentSettings = s;
    applyAppearance(s);
  })
  .catch(() => {});

function applyToggleLabel(button, on) {
  if (!button) return;
  // Prototipteki kaydÃ„Â±rmalÃ„Â± "pill" anahtar gÃƒÂ¶rÃƒÂ¼nÃƒÂ¼mÃƒÂ¼ (metin yerine gÃƒÂ¶rsel switch)
  button.classList.add("switch");
  button.classList.toggle("on", !!on);
  button.setAttribute("aria-pressed", on ? "true" : "false");
  button.setAttribute("aria-label", on ? "AÃƒÂ§Ã„Â±k" : "KapalÃ„Â±");
  button.title = on ? "AÃƒÂ§Ã„Â±k" : "KapalÃ„Â±";
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
    if (els.toggleAutonomousDevelopment) {
      applyToggleLabel(els.toggleAutonomousDevelopment, !!agentSettings.autonomousDevelopment);
    }
    if (els.toggleAutonomousSchedule) {
      applyToggleLabel(els.toggleAutonomousSchedule, !!agentSettings.autonomousDevelopmentSchedule);
    }
    if (els.expertSelect) els.expertSelect.value = agentSettings.expertMode || "genel";
    if (els.toggleStreaming) applyToggleLabel(els.toggleStreaming, agentSettings.streaming !== false);
    if (els.toggleModelFallback) applyToggleLabel(els.toggleModelFallback, agentSettings.modelAutoFallback !== false);
    if (els.modelFallbackOrder) {
      els.modelFallbackOrder.value = Array.isArray(agentSettings.modelFallbackOrder)
        ? agentSettings.modelFallbackOrder.join(", ")
        : String(agentSettings.modelFallbackOrder || "");
    }
    if (els.toggleContinuous) applyToggleLabel(els.toggleContinuous, !!agentSettings.continuousLearning);
    if (els.toggleSemantic) applyToggleLabel(els.toggleSemantic, !!agentSettings.semanticSearch);
    if (els.toggleDistill) applyToggleLabel(els.toggleDistill, !!agentSettings.distillLearning);
    if (els.toggleMcpAuto) applyToggleLabel(els.toggleMcpAuto, !!agentSettings.mcpAutoTools);
    if (els.toggleModelUpdates) applyToggleLabel(els.toggleModelUpdates, agentSettings.autoModelUpdates !== false);
    const scheduledTasks = document.getElementById("toggle-scheduled-tasks");
    if (scheduledTasks) applyToggleLabel(scheduledTasks, agentSettings.scheduledTasksEnabled !== false);
    if (els.learnTopics) els.learnTopics.value = agentSettings.learningTopics || "";
    const learnSources = document.getElementById("learn-sources");
    if (learnSources) learnSources.value = agentSettings.learningSources || "";
    if (els.learnRepo) els.learnRepo.value = agentSettings.learningSyncRepo || "";
    if (els.providerSelect) els.providerSelect.value = agentSettings.provider || "ollama";
    updateProviderVisibility();
    updateOverview();
    applyAppearance(agentSettings);
    applyToggleLabel(els.toggleFederation, !!agentSettings.federation);
    applyToggleLabel(els.toggleIdle, !!agentSettings.idleLearning);
    els.knowledgeRepo.value = agentSettings.knowledgeRepo || "";
    if (els.developmentRepo) els.developmentRepo.value = agentSettings.autonomousDevelopmentRepo || agentSettings.knowledgeRepo || "";
    if (els.developmentPaths) els.developmentPaths.value = agentSettings.autonomousDevelopmentPaths || "";
    if (els.developmentInterval) els.developmentInterval.value = String(agentSettings.autonomousDevelopmentIntervalHours || 24);
    if (els.developmentStatus) {
      const lastResult = String(agentSettings.autonomousDevelopmentLastResult || "").trim();
      els.developmentStatus.textContent = agentSettings.autonomousDevelopment
        ? `${agentSettings.autonomousDevelopmentSchedule ? "GÃƒÂ¶zlem dÃƒÂ¶ngÃƒÂ¼sÃƒÂ¼ aÃƒÂ§Ã„Â±k." : "Elle ÃƒÂ§alÃ„Â±Ã…Å¸ma hazÃ„Â±r."} En fazla 4 hedef dosya, ayrÃ„Â± dal ve taslak PR sÃ„Â±nÃ„Â±rÃ„Â± etkin.${lastResult ? ` SonuÃƒÂ§: ${lastResult}` : ""}`
        : "KapalÃ„Â±. EtkinleÃ…Å¸tirdiÃ„Å¸inde yalnÃ„Â±z belirttiÃ„Å¸in dosyalar deÃ„Å¸iÃ…Å¸tirilebilir.";
    }
    els.githubToken.value = "";
    els.githubToken.placeholder = agentSettings.githubToken
      ? "Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ (kayÃ„Â±tlÃ„Â± Ã¢â‚¬â€ deÃ„Å¸iÃ…Å¸tirmek iÃƒÂ§in yaz)"
      : "GitHub token (ghp_...)";
  } catch (_e) {
    /* ayar okunamadÃ„Â± */
  }
  try {
    const facts = await window.codega.listMemory();
    els.memorySummary.textContent = facts.length
      ? `${facts.length} Ã…Å¸ey ÃƒÂ¶Ã„Å¸renildi.`
      : "HenÃƒÂ¼z bir Ã…Å¸ey ÃƒÂ¶Ã„Å¸renmedim.";
    els.memoryList.innerHTML = facts
      .map((f) => `<div class="model-row"><div><p>${escapeHtml(f)}</p></div></div>`)
      .join("");
  } catch (_e) {
    /* hafÃ„Â±za okunamadÃ„Â± */
  }
  try {
    const rs = await window.codega.ragStats();
    els.ragStats.textContent = rs.chunks
      ? `${rs.documents} dokÃƒÂ¼man / ${rs.chunks} parÃƒÂ§a (${rs.embedded} gÃƒÂ¶mÃƒÂ¼lÃƒÂ¼).`
      : "DokÃƒÂ¼man/not ekle; sorularÃ„Â±nda bunlardan yararlanÃ„Â±r.";
  } catch (_e) {
    /* rag okunamadÃ„Â± */
  }
}

els.ragAdd.addEventListener("click", async () => {
  const text = els.ragText.value.trim();
  if (!text) {
    setTransientStatus("Eklenecek metin boÃ…Å¸.");
    return;
  }
  els.ragAdd.disabled = true;
  els.ragStats.textContent = "Bilgi tabanÃ„Â±na ekleniyor...";
  try {
    const res = await window.codega.ragIngest({
      title: els.ragTitle.value.trim() || "DokÃƒÂ¼man",
      text,
    });
    els.ragText.value = "";
    els.ragTitle.value = "";
    setTransientStatus(
      res.embedded
        ? `Eklendi: ${res.added} parÃƒÂ§a (semantik gÃƒÂ¶mme ile).`
        : `Eklendi: ${res.added} parÃƒÂ§a (Ollama kapalÃ„Â± Ã¢â€ â€™ anahtar kelime modu).`
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
    setTransientStatus("Bilgi tabanÃ„Â± temizlendi.");
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
    els.knowledgeStatus.textContent = `BaÃ„Å¸landÃ„Â±: ${me.login}`;
  } catch (error) {
    els.knowledgeStatus.textContent = `BaÃ„Å¸lanamadÃ„Â±: ${error.message || error}`;
  } finally {
    els.githubTest.disabled = false;
  }
});

els.toggleIdle.addEventListener("click", () => toggleSetting("idleLearning", els.toggleIdle));

els.installOllama.addEventListener("click", async () => {
  els.installOllama.disabled = true;
  try {
    await window.codega.installOllama();
    setTransientStatus("Ollama indirme sayfasÃ„Â± aÃƒÂ§Ã„Â±ldÃ„Â±. Kurduktan sonra uygulamayÃ„Â± yeniden baÃ…Å¸lat.");
  } catch (error) {
    setTransientStatus(`AÃƒÂ§Ã„Â±lamadÃ„Â±: ${error.message || error}`);
  } finally {
    els.installOllama.disabled = false;
  }
});

if (els.moveModelStorage) {
  els.moveModelStorage.addEventListener("click", async () => {
    els.moveModelStorage.disabled = true;
    if (els.modelStorageStatus) els.modelStorageStatus.textContent = "Hedef klasÃƒÂ¶r seÃƒÂ§imi bekleniyorÃ¢â‚¬Â¦";
    try {
      const result = await window.codega.moveModelStorage();
      if (result?.canceled) {
        if (els.modelStorageStatus) els.modelStorageStatus.textContent = "TaÃ…Å¸Ã„Â±ma iptal edildi.";
        return;
      }
      if (result?.ok) {
        if (els.modelStorageStatus) els.modelStorageStatus.textContent = "Modeller yeni dizinde hazÃ„Â±r.";
        await refreshStatus();
      }
    } catch (error) {
      if (els.modelStorageStatus) {
        els.modelStorageStatus.textContent = `TaÃ…Å¸Ã„Â±ma baÃ…Å¸arÃ„Â±sÃ„Â±z: ${error.message || error}`;
      }
    } finally {
      els.moveModelStorage.disabled = false;
    }
  });
}

window.codega.onModelStorageStatus?.((status) => {
  if (els.modelStorageStatus && status?.message) els.modelStorageStatus.textContent = status.message;
  if (els.moveModelStorage) {
    els.moveModelStorage.disabled = !["complete", "error"].includes(status?.phase);
  }
  if (status?.phase === "complete") refreshStatus().catch(() => {});
});

els.knowledgeUp.addEventListener("click", async () => {
  els.knowledgeUp.disabled = true;
  els.knowledgeStatus.textContent = "GitHub'a kaydediliyor...";
  try {
    await saveGithubFields();
    const res = await window.codega.syncKnowledgeUp();
    els.knowledgeStatus.textContent = res.ok
      ? `Kaydedildi: ${res.added} yeni bilgi.`
      : `OlmadÃ„Â±: ${res.reason}`;
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
      ? `Okundu: ${res.loaded} bilgi yÃƒÂ¼klendi.`
      : `OlmadÃ„Â±: ${res.reason}`;
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
if (els.toggleAutonomousDevelopment) {
  els.toggleAutonomousDevelopment.addEventListener("click", () =>
    toggleSetting("autonomousDevelopment", els.toggleAutonomousDevelopment).then(() => refreshAgentSettings())
  );
}
if (els.toggleAutonomousSchedule) {
  els.toggleAutonomousSchedule.addEventListener("click", async () => {
    const repo = (els.developmentRepo?.value || "").trim();
    const paths = (els.developmentPaths?.value || "").trim();
    const enabling = !agentSettings?.autonomousDevelopmentSchedule;
    if (enabling && (!repo || !paths)) {
      setTransientStatus("Ãƒâ€“nce hedef repo ve en fazla 4 dosya yolu belirle.");
      return;
    }
    agentSettings = await window.codega.setSettings({
      autonomousDevelopment: enabling ? true : !!agentSettings.autonomousDevelopment,
      autonomousDevelopmentRepo: repo,
      autonomousDevelopmentPaths: paths,
      autonomousDevelopmentIntervalHours: Math.max(1, Math.min(168, Number(els.developmentInterval?.value) || 24)),
    });
    await toggleSetting("autonomousDevelopmentSchedule", els.toggleAutonomousSchedule);
    await refreshAgentSettings();
  });
}
if (els.toggleStreaming) els.toggleStreaming.addEventListener("click", () => toggleSetting("streaming", els.toggleStreaming));
if (els.toggleModelFallback) {
  els.toggleModelFallback.addEventListener("click", () => toggleSetting("modelAutoFallback", els.toggleModelFallback));
}
if (els.saveModelFallback) {
  els.saveModelFallback.addEventListener("click", async () => {
    const order = String(els.modelFallbackOrder?.value || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    agentSettings = await window.codega.setSettings({ modelFallbackOrder: order });
    setTransientStatus(`Model yedekleme sÃ„Â±rasÃ„Â±: ${agentSettings.modelFallbackOrder.join(" Ã¢â€ â€™ ")}`);
    await refreshAgentSettings();
  });
}
const scheduledTasksToggle = document.getElementById("toggle-scheduled-tasks");
if (scheduledTasksToggle) {
  scheduledTasksToggle.addEventListener("click", () =>
    toggleSetting("scheduledTasksEnabled", scheduledTasksToggle).then(() => refreshSecurity())
  );
}
if (els.toggleModelUpdates) els.toggleModelUpdates.addEventListener("click", () => toggleSetting("autoModelUpdates", els.toggleModelUpdates));
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
  els.modelDetail.textContent = "Zeka paketi hazÃ„Â±rlanÃ„Â±yor...";
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
  els.updateDetail.textContent = "GÃƒÂ¼ncelleme kontrol ediliyor...";
  setTransientStatus("GÃƒÂ¼ncelleme kontrol ediliyorÃ¢â‚¬Â¦");
  try {
    await window.codega.checkForUpdates();
  } catch (error) {
    els.updateDetail.textContent = `GÃƒÂ¼ncelleme kontrol edilemedi: ${error.message || error}`;
    setTransientStatus(`GÃƒÂ¼ncelleme kontrol edilemedi: ${error.message || error}`);
  } finally {
    els.checkUpdate.disabled = false;
  }
});
els.downloadUpdate.addEventListener("click", async () => {
  els.downloadUpdate.disabled = true;
  showUpdatePrompt("downloading", { percent: 0 });
  els.updateDetail.textContent = "GÃƒÂ¼ncelleme indiriliyor...";
  try {
    await window.codega.downloadUpdate();
  } catch (error) {
    els.updateDetail.textContent = `GÃƒÂ¼ncelleme indirilemedi: ${error.message || error}`;
    els.downloadUpdate.disabled = false;
  }
});
els.installUpdate.addEventListener("click", () => window.codega.installUpdate());
els.updateLater.addEventListener("click", closeUpdatePrompt);
els.updateLaterX.addEventListener("click", closeUpdatePrompt);
els.updateNow.addEventListener("click", async () => {
  els.updateNow.disabled = true;
  if (state.updatePromptState !== "ready") showUpdatePrompt("downloading", { percent: 0 });
  try {
    if (state.updatePromptState === "ready") {
      await window.codega.installUpdate();
    } else {
      els.updatePromptDetail.textContent = "GÃƒÂ¼ncelleme indiriliyor. HazÃ„Â±r olunca tekrar soracaÃ„Å¸Ã„Â±m.";
      showUpdatePrompt("downloading", { percent: 0 });
      await window.codega.downloadUpdate();
    }
  } catch (error) {
    els.updatePromptDetail.textContent = `GÃƒÂ¼ncelleme baÃ…Å¸latÃ„Â±lamadÃ„Â±: ${error.message || error}`;
  } finally {
    els.updateNow.disabled = false;
  }
});

let setupActive = false;
function _setStep(name, state) {
  const el = document.querySelector(`#setup-steps .setup-step[data-step="${name}"]`);
  if (el) el.className = "setup-step" + (state ? " " + state : "");
}
function openSetupProgress(title) {
  if (!els.setupDialog) return;
  setupActive = true;
  if (els.setupTitle) els.setupTitle.textContent = title || "Kurulum";
  if (els.setupStatus) els.setupStatus.textContent = "BaÃ…Å¸latÃ„Â±lÃ„Â±yorÃ¢â‚¬Â¦";
  if (els.setupBar) { els.setupBar.style.width = "0%"; els.setupBar.classList.add("indeterminate"); }
  _setStep("ollama", "active"); _setStep("model", ""); _setStep("ready", "");
  if (els.setupClose) els.setupClose.disabled = true;
  if (!els.setupDialog.open) els.setupDialog.showModal();
}
function updateSetupFromStatus(status) {
  if (!setupActive || !status) return;
  const msg = String(status.message || status.raw || "").trim();
  if (els.setupStatus && msg) els.setupStatus.textContent = msg;
  const pct = (typeof status.percent === "number") ? status.percent : null;
  const isModelPhase = pct != null || status.downloadedBytes != null || /model|indir/i.test(msg);
  const ollamaDone = /kuruldu|hazÃ„Â±r|Ã¢Å“â€œ/i.test(msg) || isModelPhase;
  if (ollamaDone) _setStep("ollama", "done");
  if (isModelPhase) {
    _setStep("model", "active");
    if (els.setupBar) {
      if (pct != null) { els.setupBar.classList.remove("indeterminate"); els.setupBar.style.width = Math.round(pct) + "%"; }
      else els.setupBar.classList.add("indeterminate");
    }
  }
}
function finishSetup(ok, message) {
  if (!els.setupDialog) return;
  if (els.setupStatus && message) els.setupStatus.textContent = message;
  if (ok) {
    _setStep("ollama", "done"); _setStep("model", "done"); _setStep("ready", "done");
    if (els.setupBar) { els.setupBar.classList.remove("indeterminate"); els.setupBar.style.width = "100%"; }
  } else {
    const active = document.querySelector("#setup-steps .setup-step.active");
    if (active) active.classList.add("failed");
  }
  if (els.setupClose) els.setupClose.disabled = false;
  setupActive = false;
}
async function runModelSetup(modelId, label) {
  openSetupProgress(label ? `Kurulum: ${label}` : "Ãƒâ€“nerilen Modeli Kur");
  try {
    const status = await window.codega.setupModel({ modelId });
    if (status && status.ok === false) {
      finishSetup(false, status.message || "Kurulum tamamlanmadÃ„Â±.");
    } else {
      finishSetup(true, `${label || "Model"} hazÃ„Â±r Ã¢Å“â€œ`);
      if (typeof refreshModels === "function") refreshModels();
      if (typeof refreshModelsPage === "function") refreshModelsPage();
      if (typeof refreshCookbook === "function") refreshCookbook();
    }
  } catch (e) {
    finishSetup(false, "Kurulum hatasÃ„Â±: " + (e.message || e));
  }
}
if (els.setupClose) els.setupClose.addEventListener("click", () => { if (els.setupDialog && els.setupDialog.open) els.setupDialog.close(); });

window.codega.onModelStatus((status) => {
  scheduleModelStatus(status);
  updateSetupFromStatus(status);
});
if (window.codega.onModelUpdateStatus) {
  window.codega.onModelUpdateStatus((status) => renderModelUpdates(status));
}
window.codega.onUpdateStatus((payload) => {
  const state = payload?.state || "unknown";
  const detail = payload?.detail || {};
  const messages = {
    checking: "GÃƒÂ¼ncelleme kontrol ediliyor...",
    available: "Yeni sÃƒÂ¼rÃƒÂ¼m bulundu. Ã„Â°ndirmeye hazÃ„Â±r.",
    "not-available": detail.reason === "development"
      ? "GÃƒÂ¼ncelleme kontrolÃƒÂ¼ paketlenmiÃ…Å¸ uygulamada ÃƒÂ§alÃ„Â±Ã…Å¸Ã„Â±r."
      : "GÃƒÂ¼ncel sÃƒÂ¼rÃƒÂ¼mÃƒÂ¼ kullanÃ„Â±yorsun.",
    downloading: `GÃƒÂ¼ncelleme indiriliyor${detail.percent ? `: %${Math.round(detail.percent)}` : "..."}`,
    ready: "GÃƒÂ¼ncelleme indirildi. Kurulum iÃƒÂ§in yeniden baÃ…Å¸latabilirsin.",
    error: detail.message ? `GÃƒÂ¼ncelleme hatasÃ„Â±: ${detail.message}` : "GÃƒÂ¼ncelleme kontrolÃƒÂ¼ tamamlanamadÃ„Â±.",
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
  if (state === "downloading") {
    showUpdatePrompt("downloading", detail);
  }
  if (state === "ready") {
    els.updateActions.hidden = false;
    els.downloadUpdate.disabled = true;
    els.installUpdate.hidden = false;
    showUpdatePrompt("ready", detail);
  }
  // Elle kontrolde gÃƒÂ¶rÃƒÂ¼nÃƒÂ¼r geri bildirim (sonuÃƒÂ§ gizli sekmede kalmasÃ„Â±n)
  if (manualUpdateCheck && (state === "not-available" || state === "error")) {
    setTransientStatus(messages[state] || "GÃƒÂ¼ncelleme kontrolÃƒÂ¼ tamamlandÃ„Â±.");
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
  focusComposer();
}
refreshStatus();
