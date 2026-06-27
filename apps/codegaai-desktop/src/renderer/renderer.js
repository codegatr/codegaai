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
  return repairRendererMojibake(String(value)).replace(/[&<>"']/g, (char) => ({
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
    els.modelPill.textContent = previous || "HazÃƒâ€Ã‚Â±r";
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
  const original = repairRendererMojibake(value).trim();
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
    console.warn("Sohbet geÃƒÆ’Ã‚Â§miÃƒâ€¦Ã…Â¸i kaydedilemedi", error);
  }
}

function cleanupStuckPlaceholders(chats) {
  // ÃƒÆ’Ã¢â‚¬â€œnceki oturumda cevap gelmeden kapatÃƒâ€Ã‚Â±lmÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ mesajlar "DÃƒÆ’Ã‚Â¼Ãƒâ€¦Ã…Â¸ÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼yorum..." olarak
  // kalmÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ olabilir. BunlarÃƒâ€Ã‚Â± anlaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±lÃƒâ€Ã‚Â±r bir nota ÃƒÆ’Ã‚Â§evir (yanÃƒâ€Ã‚Â±ltÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â± durmasÃƒâ€Ã‚Â±n).
  const dead = [
    "DÃƒÆ’Ã‚Â¼Ãƒâ€¦Ã…Â¸ÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼yorum...",
    "Biraz uzun dÃƒÆ’Ã‚Â¼Ãƒâ€¦Ã…Â¸ÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼yorum. Cevap gelmezse kÃƒâ€Ã‚Â±sa sÃƒÆ’Ã‚Â¼re iÃƒÆ’Ã‚Â§inde gÃƒÆ’Ã‚Â¼venli Ãƒâ€¦Ã…Â¸ekilde durduracaÃƒâ€Ã…Â¸Ãƒâ€Ã‚Â±m.",
    "ÃƒÆ’Ã¢â‚¬Â¡alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ma ÃƒÆ’Ã‚Â¶zeti: cevap beklenenden uzun sÃƒÆ’Ã‚Â¼rÃƒÆ’Ã‚Â¼yor; modeli ve doÃƒâ€Ã…Â¸rulama adÃƒâ€Ã‚Â±mlarÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â± izliyorum.",
  ];
  for (const chat of chats) {
    for (const m of chat.messages || []) {
      if (m.role === "assistant" && dead.includes(String(m.text || "").trim())) {
        m.text = "(yanÃƒâ€Ã‚Â±t tamamlanmadÃƒâ€Ã‚Â± ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â uygulama kapanmÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ olabilir)";
      }
    }
  }
  return chats;
}

function isInvisibleProgressToken(token) {
  return String(token || "").replace(/\u200b/g, "").trim() === "";
}

function longThinkingNotice() {
  return "YanÃƒâ€Ã‚Â±t beklenenden uzun sÃƒÆ’Ã‚Â¼rÃƒÆ’Ã‚Â¼yor; model ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸maya devam ediyor.";
}

function oneMinuteStatusNotice(lastStatus) {
  return `${String(lastStatus || longThinkingNotice()).trim()} Bir dakikayÃƒâ€Ã‚Â± geÃƒÆ’Ã‚Â§ti; istersen Durdur dÃƒÆ’Ã‚Â¼Ãƒâ€Ã…Â¸mesiyle kesebilirsin.`;
}

function repairRendererMojibake(value) {
  return String(value || "")
    .replace(/ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡/g, "ÃƒÆ’Ã¢â‚¬Â¡")
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§/g, "ÃƒÆ’Ã‚Â§")
    .replace(/ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“/g, "ÃƒÆ’Ã¢â‚¬â€œ")
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶/g, "ÃƒÆ’Ã‚Â¶")
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€¦Ã¢â‚¬Å“/g, "ÃƒÆ’Ã…â€œ")
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼/g, "ÃƒÆ’Ã‚Â¼")
    .replace(/ÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â°/g, "Ãƒâ€Ã‚Â°")
    .replace(/ÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±/g, "Ãƒâ€Ã‚Â±")
    .replace(/ÃƒÆ’Ã¢â‚¬ÂÃƒâ€¦Ã‚Â¾/g, "Ãƒâ€Ã‚Â")
    .replace(/ÃƒÆ’Ã¢â‚¬ÂÃƒâ€¦Ã‚Â¸/g, "Ãƒâ€Ã…Â¸")
    .replace(/ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¾/g, "Ãƒâ€¦Ã‚Â")
    .replace(/ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸/g, "Ãƒâ€¦Ã…Â¸");
}
function setChatWorkingStatus(value) {
  const text = typeof value === "string" ? value : value?.text;
  if (!text || !els.modelPill) return;
  els.modelPill.textContent = repairRendererMojibake(text).replace(/^ÃƒÆ’Ã¢â‚¬Â¡alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ma ÃƒÆ’Ã‚Â¶zeti:\s*/i, "").trim();
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
    console.warn("Sohbet geÃƒÆ’Ã‚Â§miÃƒâ€¦Ã…Â¸i okunamadÃƒâ€Ã‚Â±", error);
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
  if (diff < minute) return "Ãƒâ€¦Ã…Â¸imdi";
  if (diff < hour) return `${Math.floor(diff / minute)} dk.`;
  if (diff < day) return `${Math.floor(diff / hour)} sa.`;
  if (diff < week) return `${Math.floor(diff / day)} gÃƒÆ’Ã‚Â¼n`;
  return `${Math.floor(diff / week)} hafta`;
}

function renderHistory() {
  const q = (historyQuery || "").trim();
  const visible = state.chats.filter((chat) => chatMatchesQuery(chat, q));
  if (q && !visible.length) {
    els.history.innerHTML = `<p class="history-empty">"${escapeHtml(q)}" iÃƒÆ’Ã‚Â§in sohbet bulunamadÃƒâ€Ã‚Â±.</p>`;
    return;
  }
  els.history.innerHTML = visible.map((chat) => `
    <div class="history-entry ${chat.id === state.activeChat ? "active" : ""}">
      <button class="history-item" data-chat="${chat.id}">
        <span class="history-title">${escapeHtml(chat.title)}</span>
        <span class="history-time">${escapeHtml(formatChatAge(chat.updatedAt))}</span>
      </button>
      <div class="history-actions" aria-label="Sohbet iÃƒâ€¦Ã…Â¸lemleri">
        <button type="button" data-share-chat="${chat.id}" title="Link olarak paylaÃƒâ€¦Ã…Â¸" aria-label="Link olarak paylaÃƒâ€¦Ã…Â¸">ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â€</button>
        <button type="button" data-zip-chat="${chat.id}" title="ZIP olarak indir" aria-label="ZIP olarak indir">ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬Å“</button>
        <button type="button" data-delete-chat="${chat.id}" title="Sohbeti sil" aria-label="Sohbeti sil">ÃƒÆ’Ã¢â‚¬â€</button>
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
    // Asistan cevaplarÃƒâ€Ã‚Â±na geri bildirim (Ã„Å¸Ã…Â¸Ã¢â‚¬ËœÃ‚Â/Ã„Å¸Ã…Â¸Ã¢â‚¬ËœÃ‚Â) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â son cevap hÃƒÆ’Ã‚Â¢lÃƒÆ’Ã‚Â¢ yazÃƒâ€Ã‚Â±lÃƒâ€Ã‚Â±yorsa ekleme
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
        b.title = rating === "up" ? "Ãƒâ€Ã‚Â°yi cevap" : "KÃƒÆ’Ã‚Â¶tÃƒÆ’Ã‚Â¼ cevap (iyileÃƒâ€¦Ã…Â¸tirme iÃƒÆ’Ã‚Â§in iÃƒâ€¦Ã…Â¸aretle)";
        b.addEventListener("click", async () => {
          bar.querySelectorAll(".fb-btn").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
          try { await window.codega.recordFeedback({ rating, text: message.text, prompt }); } catch (_e) {}
          setTransientStatus(rating === "up" ? "TeÃƒâ€¦Ã…Â¸ekkÃƒÆ’Ã‚Â¼rler ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â olumlu geri bildirim kaydedildi." : "Not aldÃƒâ€Ã‚Â±m ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â bunu iyileÃƒâ€¦Ã…Â¸tirme iÃƒÆ’Ã‚Â§in iÃƒâ€¦Ã…Â¸aretledim.");
        });
        return b;
      };
      bar.appendChild(mkBtn("up", "Ã„Å¸Ã…Â¸Ã¢â‚¬ËœÃ‚Â"));
      bar.appendChild(mkBtn("down", "Ã„Å¸Ã…Â¸Ã¢â‚¬ËœÃ‚Â"));
      // Kopyala ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â tÃƒÆ’Ã‚Â¼m bÃƒÆ’Ã‚Â¼yÃƒÆ’Ã‚Â¼k sohbet arayÃƒÆ’Ã‚Â¼zlerinde olan evrensel eylem
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "fb-btn";
      copyBtn.textContent = "Ã„Å¸Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¹";
      copyBtn.title = "CevabÃƒâ€Ã‚Â± kopyala";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(message.text);
          setTransientStatus("Cevap kopyalandÃƒâ€Ã‚Â±.");
        } catch (_e) {
          setTransientStatus("KopyalanamadÃƒâ€Ã‚Â±.");
        }
      });
      bar.appendChild(copyBtn);
      // Yeniden ÃƒÆ’Ã‚Â¼ret ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â yalnÃƒâ€Ã‚Â±zca son cevapta ve gÃƒÆ’Ã‚Â¶nderim yokken
      if (idx === chat.messages.length - 1 && !isSending) {
        const regen = document.createElement("button");
        regen.type = "button";
        regen.className = "fb-btn";
        regen.textContent = "Ã„Å¸Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Â";
        regen.title = "Yeniden ÃƒÆ’Ã‚Â¼ret";
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

// Hangi elemanÃƒâ€Ã‚Â±n gerÃƒÆ’Ã‚Â§ekten kaydÃƒâ€Ã‚Â±Ãƒâ€Ã…Â¸Ãƒâ€Ã‚Â±nÃƒâ€Ã‚Â± bul (conversation iÃƒÆ’Ã‚Â§ kaydÃƒâ€Ã‚Â±rÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â±ysa o, deÃƒâ€Ã…Â¸ilse pencere).
function _getScroller() {
  const c = els.conversation;
  if (c && c.scrollHeight > c.clientHeight + 8) return c;
  return null; // null => pencere kayÃƒâ€Ã‚Â±yor
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

let stickToBottom = true; // kullanÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â± yukarÃƒâ€Ã‚Â± kaymadÃƒâ€Ã‚Â±ysa dibe yapÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±k kal
function updateScrollButton() {
  const btn = els.scrollBottomBtn;
  if (!btn) return;
  btn.hidden = _isNearBottom();
}

// AkÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ sÃƒâ€Ã‚Â±rasÃƒâ€Ã‚Â±nda ÃƒÆ’Ã‚Â§aÃƒâ€Ã…Â¸rÃƒâ€Ã‚Â±lÃƒâ€Ã‚Â±r: yalnÃƒâ€Ã‚Â±zca kullanÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â± dibe yapÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±ksa otomatik kaydÃƒâ€Ã‚Â±r.
// YÃƒÆ’Ã‚Â¼kseklik oturduktan sonra kaymak iÃƒÆ’Ã‚Â§in ÃƒÆ’Ã‚Â§ift rAF kullanÃƒâ€Ã‚Â±lÃƒâ€Ã‚Â±r (yeni satÃƒâ€Ã‚Â±r altta kalmasÃƒâ€Ã‚Â±n).
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
  setTransientStatus("PaylaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±m linki oluÃƒâ€¦Ã…Â¸turuluyor...");
  try {
    const remote = await window.codega.shareChat({
      title: chat.title,
      messages: chat.messages,
    });
    // url varsa kullan; yoksa slug'dan kur (sunucu her ikisini de dÃƒÆ’Ã‚Â¶ndÃƒÆ’Ã‚Â¼rÃƒÆ’Ã‚Â¼r)
    const link =
      remote && (remote.url || (remote.slug ? `${FEDERATION_SHARE_BASE}/${remote.slug}` : ""));
    if (link) {
      try {
        await navigator.clipboard.writeText(link);
        setTransientStatus(`PaylaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±m linki kopyalandÃƒâ€Ã‚Â±: ${link}`);
      } catch {
        setTransientStatus(`PaylaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±m linki: ${link}`);
      }
      return;
    }
    // Sunucu bir hata dÃƒÆ’Ã‚Â¶ndÃƒÆ’Ã‚Â¼rdÃƒÆ’Ã‚Â¼yse gerÃƒÆ’Ã‚Â§ek nedeni gÃƒÆ’Ã‚Â¶ster (tahmin etme)
    if (remote && remote.error) {
      setTransientStatus(`PaylaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±m reddedildi: ${remote.error}`);
    } else if (remote && remote.service) {
      // GET saÃƒâ€Ã…Â¸lÃƒâ€Ã‚Â±k yanÃƒâ€Ã‚Â±tÃƒâ€Ã‚Â± geldiyse istek POST olarak ulaÃƒâ€¦Ã…Â¸mamÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ demektir
      setTransientStatus("PaylaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±m isteÃƒâ€Ã…Â¸i sunucuya POST olarak ulaÃƒâ€¦Ã…Â¸madÃƒâ€Ã‚Â± (yÃƒÆ’Ã‚Â¶nlendirme?).");
    } else {
      setTransientStatus("PaylaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±m sunucusu beklenmedik bir yanÃƒâ€Ã‚Â±t verdi.");
    }
  } catch (error) {
    console.warn("Uzak paylaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±m servisi kullanÃƒâ€Ã‚Â±lamadÃƒâ€Ã‚Â±", error);
    setTransientStatus(
      "PaylaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±m sunucusu (ai.codega.com.tr) yayÃƒâ€Ã‚Â±nda deÃƒâ€Ã…Â¸il. Link paylaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±mÃƒâ€Ã‚Â± iÃƒÆ’Ã‚Â§in sunucu kurulmalÃƒâ€Ã‚Â±."
    );
  } finally {
    // ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â€ butonuna tÃƒâ€Ã‚Â±klayÃƒâ€Ã‚Â±nca odak orada kalÃƒâ€Ã‚Â±yordu; giriÃƒâ€¦Ã…Â¸ alanÃƒâ€Ã‚Â±na geri ver ki
    // kullanÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â± hemen yazÃƒâ€Ã‚Â±p Enter ile gÃƒÆ’Ã‚Â¶nderebilsin.
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
    .replace(/[^a-z0-9Ãƒâ€Ã…Â¸ÃƒÆ’Ã‚Â¼Ãƒâ€¦Ã…Â¸ÃƒÆ’Ã‚Â¶ÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±Ãƒâ€Ã‚Â°Ãƒâ€Ã‚ÂÃƒÆ’Ã…â€œÃƒâ€¦Ã‚ÂÃƒÆ’Ã¢â‚¬â€œÃƒÆ’Ã¢â‚¬Â¡_-]+/gi, "-")
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
      title: `${payload.title || "PaylaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±lan sohbet"}`,
      messages: payload.messages,
      updatedAt: payload.updatedAt || Date.now(),
    });
    state.chats.unshift(chat);
    state.activeChat = chat.id;
    saveChats();
    history.replaceState(null, "", window.location.pathname);
  } catch (error) {
    console.warn("PaylaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±lan sohbet aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±lamadÃƒâ€Ã‚Â±", error);
  }
}

function setModelStatus(status) {
  const ready = status?.status === "ready";
  const missing = status?.status === "missing";
  const progress = status?.progress || null;
  const isDownloading = status?.status === "checking" && progress;
  els.modelPill.textContent = ready
    ? "HazÃƒâ€Ã‚Â±r"
    : missing
      ? "Temel mod hazÃƒâ€Ã‚Â±r"
      : "DÃƒÆ’Ã‚Â¼Ãƒâ€¦Ã…Â¸ÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼yor";
  els.modelDetail.textContent = progress && status?.status === "checking"
    ? status.message || "Model indiriliyor..."
    : status?.action === "install_ollama"
    ? "Yerel zeka motoru kurulu deÃƒâ€Ã…Â¸il. Model paketleri iÃƒÆ’Ã‚Â§in Ollama kurulumu gerekli."
    : ready
      ? "Codega AI talimata gÃƒÆ’Ã‚Â¶re gerekli zeka paketini arka planda kullanÃƒâ€Ã‚Â±r."
      : "Codega AI ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ma ortamÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â± kontrol ediyor.";
  updateModelDownload(status);

  // Ollama satÃƒâ€Ã‚Â±rÃƒâ€Ã‚Â±: ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yorsa "Kur" butonunu gizle, durumu gÃƒÆ’Ã‚Â¶ster
  const ollamaMissing = status?.action === "install_ollama" || status?.provider === "instant";
  if (els.ollamaRowStatus) {
    els.ollamaRowStatus.textContent = ollamaMissing
      ? "Kurulu deÃƒâ€Ã…Â¸il. Yerel modeller iÃƒÆ’Ã‚Â§in Ollama gerekli ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â kurmak iÃƒÆ’Ã‚Â§in tÃƒâ€Ã‚Â±kla."
      : "Ollama ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yor ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ (yerel motor hazÃƒâ€Ã‚Â±r).";
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
        : "Ãƒâ€Ã‚Â°ndirme tamamlandÃƒâ€Ã‚Â±";
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
        <p>${escapeHtml(model.description)} Ãƒâ€šÃ‚Â· ${escapeHtml(model.task || "genel")}</p>
      </div>
      <button type="button" data-model="${escapeHtml(model.id)}" ${model.installed ? "disabled" : ""}>
        ${model.installed ? "HazÃƒâ€Ã‚Â±r" : "Ãƒâ€Ã‚Â°ndir"}
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
    els.modelDetail.textContent = `Model listesi alÃƒâ€Ã‚Â±namadÃƒâ€Ã‚Â±: ${error.message || error}`;
  }
}

async function refreshStatus() {
  const status = await window.codega.getStatus();
  els.version.textContent = `v${status.version}`;
  if (els.modelStoragePath) {
    els.modelStoragePath.textContent = status.paths?.models || "Ollama varsayÃƒâ€Ã‚Â±lan model dizini";
    els.modelStoragePath.title = els.modelStoragePath.textContent;
  }
  if (els.modelStorageStatus && status.paths?.modelStorage) {
    const storage = status.paths.modelStorage;
    const size = formatBytes(storage.bytes);
    els.modelStorageStatus.textContent = storage.files > 0
      ? `${storage.files} model dosyasÃƒâ€Ã‚Â±${size ? ` Ãƒâ€šÃ‚Â· ${size}` : ""} bulundu. BaÃƒâ€¦Ã…Â¸ka bir diske gÃƒÆ’Ã‚Â¼venli Ãƒâ€¦Ã…Â¸ekilde taÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yabilirsin.`
      : "Bu dizinde model dosyasÃƒâ€Ã‚Â± bulunamadÃƒâ€Ã‚Â±. CODEGA AI diÃƒâ€Ã…Â¸er Ollama konumlarÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â± da denetleyecek.";
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
      : "Ãƒâ€Ã‚Â°ndirme hazÃƒâ€Ã‚Â±rlanÃƒâ€Ã‚Â±yor...";
  }
  if (els.updateProgressSpeed) els.updateProgressSpeed.textContent = speed ? `${speed}/sn` : "";
}

function hideUpdatePromptProgress() {
  if (els.updateProgress) els.updateProgress.hidden = true;
  if (els.updateProgressBar) els.updateProgressBar.style.width = "0%";
  if (els.updateProgressPercent) els.updateProgressPercent.textContent = "%0";
  if (els.updateProgressSize) els.updateProgressSize.textContent = "HazÃƒâ€Ã‚Â±rlanÃƒâ€Ã‚Â±yor...";
  if (els.updateProgressSpeed) els.updateProgressSpeed.textContent = "";
}

function showUpdatePrompt(mode, detail = {}) {
  state.updatePromptState = mode;
  if (mode === "available") {
    els.updatePromptTitle.textContent = "Yeni gÃƒÆ’Ã‚Â¼ncelleme var";
    els.updatePromptDetail.textContent = "Daha iyi ve kararlÃƒâ€Ã‚Â± bir sÃƒÆ’Ã‚Â¼rÃƒÆ’Ã‚Â¼m bulundu. Ãƒâ€Ã‚Â°stersen Ãƒâ€¦Ã…Â¸imdi indirebilirim.";
    els.updateNow.textContent = "Ãƒâ€¦Ã‚Âimdi GÃƒÆ’Ã‚Â¼ncelle";
    els.updateNow.disabled = false;
    hideUpdatePromptProgress();
  } else if (mode === "downloading") {
    els.updatePromptTitle.textContent = "GÃƒÆ’Ã‚Â¼ncelleme indiriliyor";
    els.updatePromptDetail.textContent = "Ãƒâ€Ã‚Â°ndirme sÃƒÆ’Ã‚Â¼rÃƒÆ’Ã‚Â¼yor. TamamlandÃƒâ€Ã‚Â±Ãƒâ€Ã…Â¸Ãƒâ€Ã‚Â±nda kurulum iÃƒÆ’Ã‚Â§in onay isteyeceÃƒâ€Ã…Â¸im.";
    els.updateNow.textContent = "Ãƒâ€Ã‚Â°ndiriliyor";
    els.updateNow.disabled = true;
    updatePromptProgress(detail);
  } else {
    els.updatePromptTitle.textContent = "GÃƒÆ’Ã‚Â¼ncelleme hazÃƒâ€Ã‚Â±r";
    els.updatePromptDetail.textContent = "Yeni sÃƒÆ’Ã‚Â¼rÃƒÆ’Ã‚Â¼m indirildi. Kurulum iÃƒÆ’Ã‚Â§in CODEGA AI yeniden baÃƒâ€¦Ã…Â¸latÃƒâ€Ã‚Â±lacak.";
    els.updateNow.textContent = "Uygula ve Yeniden BaÃƒâ€¦Ã…Â¸lat";
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
const ATTACH_MAX_CHARS = 16000; // modele giden baÃƒâ€Ã…Â¸lam tavanÃƒâ€Ã‚Â± (yerel modeller iÃƒÆ’Ã‚Â§in makul)
const ATTACH_MAX_BYTES = 500 * 1024 * 1024; // yerelde ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yoruz: 500 MB'a kadar kabul
const ATTACH_READ_BYTES = 800 * 1024; // metin dosyalarÃƒâ€Ã‚Â±ndan yalnÃƒâ€Ã‚Â±zca baÃƒâ€¦Ã…Â¸tan bu kadar oku (bellek dostu)

// UzantÃƒâ€Ã‚Â±ya gÃƒÆ’Ã‚Â¶re dosya tÃƒÆ’Ã‚Â¼rÃƒÆ’Ã‚Â¼ + araÃƒÆ’Ã‚Â§/uzman ÃƒÆ’Ã‚Â¶nerisi (rakiplerdeki gibi iÃƒÆ’Ã‚Â§eriÃƒâ€Ã…Â¸e uyum)
function detectFileKind(name) {
  const ext = String(name).split(".").pop().toLowerCase();
  const T = (label, expert, action) => ({ label, expert, action, readable: true });
  const code = {
    php: T("PHP", "php", "kod inceleme/geliÃƒâ€¦Ã…Â¸tirme"),
    js: T("JavaScript", "javascript", "kod inceleme"),
    ts: T("TypeScript", "javascript", "kod inceleme"),
    jsx: T("React", "javascript", "bileÃƒâ€¦Ã…Â¸en inceleme"),
    tsx: T("React/TS", "javascript", "bileÃƒâ€¦Ã…Â¸en inceleme"),
    vue: T("Vue", "javascript", "bileÃƒâ€¦Ã…Â¸en inceleme"),
    py: T("Python", "python", "kod inceleme"),
    rb: T("Ruby", "genel", "kod inceleme"),
    go: T("Go", "genel", "kod inceleme"),
    rs: T("Rust", "genel", "kod inceleme"),
    java: T("Java", "genel", "kod inceleme"),
    c: T("C", "genel", "kod inceleme"),
    cpp: T("C++", "genel", "kod inceleme"),
    h: T("C baÃƒâ€¦Ã…Â¸lÃƒâ€Ã‚Â±k", "genel", "kod inceleme"),
    html: T("HTML", "javascript", "iÃƒâ€¦Ã…Â¸aretleme inceleme"),
    htm: T("HTML", "javascript", "iÃƒâ€¦Ã…Â¸aretleme inceleme"),
    css: T("CSS", "javascript", "stil inceleme"),
    scss: T("SCSS", "javascript", "stil inceleme"),
    sql: T("SQL", "genel", "Ãƒâ€¦Ã…Â¸ema/sorgu inceleme"),
    sh: T("Shell", "devops", "betik inceleme"),
    yml: T("YAML", "devops", "yapÃƒâ€Ã‚Â±landÃƒâ€Ã‚Â±rma inceleme"),
    yaml: T("YAML", "devops", "yapÃƒâ€Ã‚Â±landÃƒâ€Ã‚Â±rma inceleme"),
    ini: T("INI", "devops", "yapÃƒâ€Ã‚Â±landÃƒâ€Ã‚Â±rma inceleme"),
    env: T("ENV", "devops", "yapÃƒâ€Ã‚Â±landÃƒâ€Ã‚Â±rma inceleme (gizli anahtarlara dikkat)"),
    csv: T("CSV veri", "genel", "veri analizi/ÃƒÆ’Ã‚Â¶zet"),
    tsv: T("TSV veri", "genel", "veri analizi/ÃƒÆ’Ã‚Â¶zet"),
    json: T("JSON", "genel", "yapÃƒâ€Ã‚Â±/veri inceleme"),
    xml: T("XML", "genel", "yapÃƒâ€Ã‚Â± inceleme"),
    md: T("Markdown", "genel", "dokÃƒÆ’Ã‚Â¼man inceleme"),
    txt: T("Metin", "genel", "dokÃƒÆ’Ã‚Â¼man inceleme"),
    log: T("Log", "devops", "hata/iz analizi"),
  };
  if (code[ext]) return code[ext];
  const archive = ["zip", "rar", "7z", "tar", "gz", "tgz"];
  const image = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
  if (archive.includes(ext)) return { label: "ArÃƒâ€¦Ã…Â¸iv", action: "iÃƒÆ’Ã‚Â§eriÃƒâ€Ã…Â¸i ÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±karÃƒâ€Ã‚Â±p ÃƒÆ’Ã‚Â¶nemli dosyalarÃƒâ€Ã‚Â± ekle", readable: false, hint: "archive" };
  if (image.includes(ext)) return { label: "GÃƒÆ’Ã‚Â¶rsel", action: "gÃƒÆ’Ã‚Â¶rsel anlama (vision) modeli gerekir", readable: false, hint: "image" };
  if (ext === "pdf") return { label: "PDF", action: "metnini .txt olarak ekleyebilir veya yapÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸tÃƒâ€Ã‚Â±rabilirsin", readable: false, hint: "pdf" };
  return { label: ext ? ext.toUpperCase() : "Dosya", expert: "genel", action: "metin olarak inceleme", readable: true };
}

function renderAttachChip() {
  const chip = document.getElementById("attach-chip");
  if (!chip) return;
  if (!attachedFile) { chip.hidden = true; chip.innerHTML = ""; return; }
  chip.hidden = false;
  const tag = attachedFile.kind ? ` Ãƒâ€šÃ‚Â· ${escapeHtml(attachedFile.kind.label)}` : "";
  chip.innerHTML = `<span>Ã„Å¸Ã…Â¸Ã¢â‚¬Å“Ã‚Â ${escapeHtml(attachedFile.name)}${tag}</span>`;
  const x = document.createElement("button");
  x.type = "button";
  x.textContent = "ÃƒÆ’Ã¢â‚¬â€";
  x.title = "Eki kaldÃƒâ€Ã‚Â±r";
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
    input.value = ""; // aynÃƒâ€Ã‚Â± dosya tekrar seÃƒÆ’Ã‚Â§ilebilsin
    if (!file) return;
    const kind = detectFileKind(file.name);

    // Metin olmayan tÃƒÆ’Ã‚Â¼rler: okuma yerine doÃƒâ€Ã…Â¸ru aracÃƒâ€Ã‚Â± ÃƒÆ’Ã‚Â¶ner
    if (!kind.readable) {
      attachedFile = null;
      renderAttachChip();
      const msg = {
        archive: `${file.name}: arÃƒâ€¦Ã…Â¸iv dosyasÃƒâ€Ã‚Â±. Ãƒâ€Ã‚Â°ÃƒÆ’Ã‚Â§eriÃƒâ€Ã…Â¸i ÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±karÃƒâ€Ã‚Â±p ÃƒÆ’Ã‚Â¶nemli dosyalarÃƒâ€Ã‚Â± tek tek ekleyebilirsin (tam proje/arÃƒâ€¦Ã…Â¸iv okuma yakÃƒâ€Ã‚Â±nda).`,
        image: `${file.name}: gÃƒÆ’Ã‚Â¶rsel. GÃƒÆ’Ã‚Â¶rsel anlama iÃƒÆ’Ã‚Â§in bir vision modeli gerekiyor (ÃƒÆ’Ã‚Â¶rn. llava) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â yakÃƒâ€Ã‚Â±nda.`,
        pdf: `${file.name}: PDF. Metnini .txt olarak kaydedip ekleyebilir ya da yapÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸tÃƒâ€Ã‚Â±rabilirsin.`,
      }[kind.hint] || `${file.name}: bu tÃƒÆ’Ã‚Â¼r metin olarak okunamÃƒâ€Ã‚Â±yor.`;
      setTransientStatus(msg);
      return;
    }

    if (file.size > ATTACH_MAX_BYTES) {
      setTransientStatus("Dosya 500 MB sÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â±rÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â± aÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yor.");
      return;
    }

    // BÃƒÆ’Ã‚Â¼yÃƒÆ’Ã‚Â¼k dosyalarda belleÃƒâ€Ã…Â¸i Ãƒâ€¦Ã…Â¸iÃƒâ€¦Ã…Â¸irmeden yalnÃƒâ€Ã‚Â±zca baÃƒâ€¦Ã…Â¸tan bir dilim oku
    const slice = file.size > ATTACH_READ_BYTES ? file.slice(0, ATTACH_READ_BYTES) : file;
    const reader = new FileReader();
    reader.onload = () => {
      let text = String(reader.result || "");
      let note = "";
      if (file.size > ATTACH_READ_BYTES || text.length > ATTACH_MAX_CHARS) {
        text = text.slice(0, ATTACH_MAX_CHARS);
        note = " (baÃƒâ€¦Ã…Â¸ kÃƒâ€Ã‚Â±smÃƒâ€Ã‚Â±)";
      }
      attachedFile = { name: file.name + note, text, kind };
      renderAttachChip();
      const sug = kind.expert && kind.expert !== "genel" ? ` ÃƒÆ’Ã¢â‚¬â€œneri: Uzman Modu'nu "${kind.expert}" yapabilirsin.` : "";
      setTransientStatus(`Ek hazÃƒâ€Ã‚Â±r: ${kind.label}${note} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${kind.action}.${sug}`);
    };
    reader.onerror = () => setTransientStatus("Dosya okunamadÃƒâ€Ã‚Â± (metin tabanlÃƒâ€Ã‚Â± bir dosya seÃƒÆ’Ã‚Â§).");
    reader.readAsText(slice);
  });
})();

async function regenerateLast() {
  if (isSending) return;
  const chat = currentChat();
  const msgs = chat.messages;
  if (!msgs.length || msgs[msgs.length - 1].role !== "assistant") return;
  // Son kullanÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â± mesajÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â± bul
  let userText = "";
  for (let i = msgs.length - 2; i >= 0; i--) {
    if (msgs[i].role === "user") { userText = msgs[i].text; break; }
  }
  if (!userText) return;
  // "Ã„Å¸Ã…Â¸Ã¢â‚¬Å“Ã‚Â dosya" notunu temizle (yeniden ÃƒÆ’Ã‚Â¼retimde dosya baÃƒâ€Ã…Â¸lamÃƒâ€Ã‚Â± yeniden eklenmez)
  userText = userText.replace(/\n+Ã„Å¸Ã…Â¸Ã¢â‚¬Å“Ã‚Â .*$/s, "").trim();
  if (!userText) return;

  isSending = true;
  setSendingUi(true);
  stickToBottom = true; // yeniden ÃƒÆ’Ã‚Â¼retim: en alta in
  msgs.pop(); // eski asistan cevabÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â± kaldÃƒâ€Ã‚Â±r
  appendMessage("assistant", "DÃƒÆ’Ã‚Â¼Ãƒâ€¦Ã…Â¸ÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼yorum...");
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
  if (isSending) return; // ÃƒÆ’Ã‚Â¶nceki cevap dÃƒÆ’Ã‚Â¶nmeden yeni istek gÃƒÆ’Ã‚Â¶nderme
  const text = els.input.value.trim();
  if (!text) return;
  isSending = true;

  // Ek dosya varsa: ekranda kullanÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â± metni + ek rozeti; modele dosya baÃƒâ€Ã…Â¸lamÃƒâ€Ã‚Â± eklenmiÃƒâ€¦Ã…Â¸ metin
  const att = attachedFile;
  const displayText = att ? `${text}\n\nÃ„Å¸Ã…Â¸Ã¢â‚¬Å“Ã‚Â ${att.name}` : text;
  const sendText = att
    ? `KullanÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â± bir dosya ekledi: "${att.name}"\n\n--- DOSYA Ãƒâ€Ã‚Â°ÃƒÆ’Ã¢â‚¬Â¡ERÃƒâ€Ã‚Â°Ãƒâ€Ã‚ÂÃƒâ€Ã‚Â° ---\n${att.text}\n--- DOSYA SONU ---\n\nKullanÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â±n isteÃƒâ€Ã…Â¸i: ${text}`
    : text;
  attachedFile = null;
  renderAttachChip();

  setSendingUi(true);
  stickToBottom = true; // yeni soru: en alta in
  appendMessage("user", displayText);
  checkUpdatesAfterFirstQuery();
  els.input.value = "";
  els.input.style.height = "auto";
  appendMessage("assistant", "DÃƒÆ’Ã‚Â¼Ãƒâ€¦Ã…Â¸ÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼yorum...");

  const chat = currentChat();
  const placeholder = chat.messages[chat.messages.length - 1];
  // Streaming: token geldikÃƒÆ’Ã‚Â§e placeholder'Ãƒâ€Ã‚Â± canlÃƒâ€Ã‚Â± gÃƒÆ’Ã‚Â¼ncelle (akÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ kapalÃƒâ€Ã‚Â±ysa hiÃƒÆ’Ã‚Â§ gelmez)
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
  saveChats(); // final cevabÃƒâ€Ã‚Â± diske yaz; yoksa kapatÃƒâ€Ã‚Â±p aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±nca "DÃƒÆ’Ã‚Â¼Ãƒâ€¦Ã…Â¸ÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼yorum..." kalÃƒâ€Ã‚Â±yordu
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
  // Enter = gÃƒÆ’Ã‚Â¶nder (Shift+Enter = yeni satÃƒâ€Ã‚Â±r). Mac dahil tÃƒÆ’Ã‚Â¼m platformlarda
  // ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸sÃƒâ€Ã‚Â±n diye requestSubmit yerine doÃƒâ€Ã…Â¸rudan handleSubmit ÃƒÆ’Ã‚Â§aÃƒâ€Ã…Â¸rÃƒâ€Ã‚Â±lÃƒâ€Ã‚Â±r.
  const isEnter = event.key === "Enter" || event.keyCode === 13;
  if (isEnter && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    els.form.requestSubmit();
  }
});

document.getElementById("new-chat").addEventListener("click", () => createChat());

// KaydÃƒâ€Ã‚Â±rma: kullanÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â± yukarÃƒâ€Ã‚Â± kayarsa "dibe yapÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸" kapanÃƒâ€Ã‚Â±r ve buton gÃƒÆ’Ã‚Â¶rÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼r; dibe inince geri aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±lÃƒâ€Ã‚Â±r.
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
let _kickWatchdog = null; // akÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ta her gerÃƒÆ’Ã‚Â§ek token geldiÃƒâ€Ã…Â¸inde idle watchdog'u sÃƒâ€Ã‚Â±fÃƒâ€Ã‚Â±rlar

// Ãƒâ€Ã‚Â°ki katmanlÃƒâ€Ã‚Â± koruma: cevap tokenlarÃƒâ€Ã‚Â± ile motorun ilerleme/heartbeat sinyalleri idle
// sayacÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â± sÃƒâ€Ã‚Â±fÃƒâ€Ã‚Â±rlar. hardMs ise takÃƒâ€Ã‚Â±lan bir iÃƒâ€¦Ã…Â¸i her durumda sonlandÃƒâ€Ã‚Â±ran kesin ÃƒÆ’Ã‚Â¼st sÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â±rdÃƒâ€Ã‚Â±r.
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
      "Model uzun sÃƒÆ’Ã‚Â¼re yanÃƒâ€Ã‚Â±t ÃƒÆ’Ã‚Â¼retmedi; iÃƒâ€¦Ã…Â¸lem gÃƒÆ’Ã‚Â¼venli Ãƒâ€¦Ã…Â¸ekilde durduruldu. Daha hafif bir model seÃƒÆ’Ã‚Â§ip tekrar deneyebilirsin."
    ), idleMs);
  };
  const timeout = new Promise((_, reject) => { rejectFn = reject; });
  arm();
  hardTimer = window.setTimeout(() => stopAndReject(
    `YanÃƒâ€Ã‚Â±t ${Math.round(hardMs / 1000)} saniyelik ÃƒÆ’Ã‚Â¼st sÃƒÆ’Ã‚Â¼reyi aÃƒâ€¦Ã…Â¸tÃƒâ€Ã‚Â± ve durduruldu. Modeli veya aÃƒâ€Ã…Â¸Ãƒâ€Ã‚Â± kontrol edip tekrar deneyebilirsin.`
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
  setV(`${prefix}-cpu-v`, m.cpu == null ? "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â" : "%" + m.cpu); setB(`${prefix}-cpu-b`, m.cpu);
  setV(`${prefix}-ram-v`, m.ram == null ? "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â" : "%" + m.ram); setB(`${prefix}-ram-b`, m.ram);
  setV(`${prefix}-gpu-v`, m.gpu == null ? "GPU yok" : "%" + m.gpu); setB(`${prefix}-gpu-b`, m.gpu || 0);
}
async function refreshLiveMetrics() {
  try {
    const m = await window.codega.getMetrics();
    if (!m) return;
    _fillUsage("ov", m);
    _fillUsage("sys", m);
    const badge = document.getElementById("ov-usage-badge");
    if (badge) badge.hidden = true; // gerÃƒÆ’Ã‚Â§ek ÃƒÆ’Ã‚Â¶lÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â¼m; "Demo" rozeti gizlenir
  } catch (_e) { /* metrik hatasÃƒâ€Ã‚Â± paneli bozmasÃƒâ€Ã‚Â±n */ }
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
    setV("ov-model", s.topModel || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â");
    setV("ov-agent", s.topAgent || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â");
  } catch (_e) { /* istatistik hatasÃƒâ€Ã‚Â± paneli bozmasÃƒâ€Ã‚Â±n */ }
}
if (els.settings) els.settings.addEventListener("close", stopLiveMetrics);

async function refreshLogs() {
  const box = document.getElementById("log-list");
  if (!box) return;
  try {
    const items = await window.codega.getLogs();
    box.innerHTML = "";
    if (!items || !items.length) { box.innerHTML = '<p class="log-empty">HenÃƒÆ’Ã‚Â¼z kayÃƒâ€Ã‚Â±t yok.</p>'; return; }
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
      const pref = (row.preferred || []).join(" ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ");
      div.innerHTML = `<div><strong>${row.label}</strong><p>Tercih: ${pref.replace(/</g,"&lt;")}</p></div><span class="badge-active">${(row.chosen||"ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â").replace(/</g,"&lt;")}</span>`;
      box.appendChild(div);
    }
    const inst = document.getElementById("router-installed");
    if (inst) {
      const list = (r && r.installed) || [];
      inst.textContent = list.length ? `Kurulu modeller: ${list.join(", ")}` : "Kurulu model yok (Ollama kapalÃƒâ€Ã‚Â± veya model indirilmemiÃƒâ€¦Ã…Â¸). SeÃƒÆ’Ã‚Â§ilenler tercih listesinin ilk sÃƒâ€Ã‚Â±rasÃƒâ€Ã‚Â±dÃƒâ€Ã‚Â±r.";
    }
  } catch (_e) {}
}
const routerTestBtn = document.getElementById("router-test-btn");
if (routerTestBtn) routerTestBtn.addEventListener("click", async () => {
  const input = (document.getElementById("router-test-input") || {}).value || "";
  const out = document.getElementById("router-test-out");
  if (!input.trim()) { setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œnce bir ÃƒÆ’Ã‚Â¶rnek yaz."); return; }
  if (out) { out.hidden = false; out.textContent = "HesaplanÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"; }
  try {
    const r = await window.codega.routerTest({ input });
    const taskTr = { code: "Kod/YazÃƒâ€Ã‚Â±lÃƒâ€Ã‚Â±m", image: "GÃƒÆ’Ã‚Â¶rsel", writing: "YazÃƒâ€Ã‚Â±/Ãƒâ€Ã‚Â°ÃƒÆ’Ã‚Â§erik", chat: "Sohbet" }[r.task] || r.task;
    if (out) out.textContent = `GÃƒÆ’Ã‚Â¶rev: ${taskTr}\nSeÃƒÆ’Ã‚Â§ilen model: ${r.chosen}\nAdaylar: ${(r.candidates||[]).join(", ")}`;
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
      if (!installedOpts.length) { inst.innerHTML = '<p class="log-empty">Kurulu yerel model yok (Ollama kapalÃƒâ€Ã‚Â± veya henÃƒÆ’Ã‚Â¼z indirilmedi).</p>'; }
      for (const o of installedOpts) {
        const row = document.createElement("div");
        row.className = "settings-row";
        const sz = o.sizeGb ? ` Ãƒâ€šÃ‚Â· ~${o.sizeGb} GB` : "";
        row.innerHTML = `<div><strong>${(o.label||o.id).replace(/</g,"&lt;")}</strong><p>${o.id}${sz}</p></div>`;
        const del = document.createElement("button");
        del.type = "button"; del.textContent = "Sil";
        del.addEventListener("click", async () => {
          if (!window.confirm(`${o.id} silinsin mi?`)) return;
          del.disabled = true; setTransientStatus(`${o.id} siliniyorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`);
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
        const sz = o.sizeGb ? ` Ãƒâ€šÃ‚Â· ~${o.sizeGb} GB` : "";
        row.innerHTML = `<div><strong>${(o.label||o.id).replace(/</g,"&lt;")}</strong><p>${(o.description||"").replace(/</g,"&lt;")} Ãƒâ€šÃ‚Â· ${o.id}${sz}</p></div>`;
        const dl = document.createElement("button");
        dl.type = "button"; dl.textContent = "Ãƒâ€Ã‚Â°ndir";
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
  const taskLabels = { chat: "Sohbet", code: "Kod", writing: "YazÃƒâ€Ã‚Â±", image: "GÃƒÆ’Ã‚Â¶rsel" };

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
    status.textContent = active ? "Aktif" : installed ? "Pasif" : "YÃƒÆ’Ã‚Â¼klÃƒÆ’Ã‚Â¼ deÃƒâ€Ã…Â¸il";
    controls.appendChild(status);

    if (installed && !active) {
      const activate = document.createElement("button");
      activate.type = "button";
      activate.className = "model-action primary";
      activate.textContent = "VarsayÃƒâ€Ã‚Â±lan Yap";
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
        ? "Aktif modeli silmeden ÃƒÆ’Ã‚Â¶nce baÃƒâ€¦Ã…Â¸ka bir modeli varsayÃƒâ€Ã‚Â±lan yap."
        : "Modeli cihazdan sil";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`${model.id} silinsin mi?`)) return;
        remove.disabled = true;
        setTransientStatus(`${model.id} siliniyorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`);
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
      download.textContent = "Ãƒâ€Ã‚Â°ndir";
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
      installedBox.innerHTML = '<p class="log-empty">Kurulu yerel model yok. Ãƒâ€Ã‚Â°ndirilebilir modellerden birini seÃƒÆ’Ã‚Â§ebilirsin.</p>';
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

  addCollapseButton(document.getElementById("models-available")?.closest(".settings-section"), "Modelleri GÃƒÆ’Ã‚Â¶ster");
  addCollapseButton(document.querySelector(".model-update-center"), "GÃƒÆ’Ã‚Â¼ncellemeleri GÃƒÆ’Ã‚Â¶ster");

  for (const section of group.querySelectorAll(".settings-section")) {
    const heading = section.querySelector("h2");
    if (heading && heading.textContent.toLocaleLowerCase("tr").includes("saÃƒâ€Ã…Â¸layÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â±")) {
      section.hidden = true;
    }
  }
}

simplifyModelsLayout();

const modelsRefreshBtn = document.getElementById("models-refresh");
if (modelsRefreshBtn) modelsRefreshBtn.addEventListener("click", () => refreshModelsPage());

function formatModelUpdateTime(value) {
  if (!value) return "HenÃƒÆ’Ã‚Â¼z kontrol edilmedi";
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
    els.modelUpdatesSummary.textContent = "Resmi Ollama manifestleri kontrol ediliyorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
  } else if (status.error) {
    els.modelUpdatesSummary.textContent = catalog.sources?.length
      ? `Ollama kontrolÃƒÆ’Ã‚Â¼ tamamlanamadÃƒâ€Ã‚Â±; resmi model radarÃƒâ€Ã‚Â± ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yor Ãƒâ€šÃ‚Â· ${status.error}`
      : `Kontrol tamamlanamadÃƒâ€Ã‚Â±: ${status.error}`;
  } else if (!status.lastCheck) {
    els.modelUpdatesSummary.textContent = "HenÃƒÆ’Ã‚Â¼z kontrol edilmedi.";
  } else if (updates.length) {
    els.modelUpdatesSummary.textContent = `${updates.length} model gÃƒÆ’Ã‚Â¼ncellemesi hazÃƒâ€Ã‚Â±r Ãƒâ€šÃ‚Â· Son kontrol: ${formatModelUpdateTime(status.lastCheck)}`;
  } else if (discoveries.length) {
    els.modelUpdatesSummary.textContent = `${discoveries.length} yeni model ailesi bulundu Ãƒâ€šÃ‚Â· Son kontrol: ${formatModelUpdateTime(status.lastCheck)}`;
  } else {
    els.modelUpdatesSummary.textContent = `Kurulu modeller gÃƒÆ’Ã‚Â¼ncel Ãƒâ€šÃ‚Â· Resmi model radarÃƒâ€Ã‚Â± aktif Ãƒâ€šÃ‚Â· Son kontrol: ${formatModelUpdateTime(status.lastCheck)}`;
  }

  els.modelUpdatesList.innerHTML = "";
  if (!models.length && status.lastCheck) {
    els.modelUpdatesList.innerHTML = '<p class="log-empty">Kurulu Ollama modeli bulunamadÃƒâ€Ã‚Â±.</p>';
    return;
  }
  for (const model of models) {
    const row = document.createElement("div");
    row.className = `settings-row model-update-row${model.updateAvailable ? " update-ready" : ""}`;
    const detail = model.checked
      ? model.updateAvailable ? "Yeni resmi manifest bulundu" : "GÃƒÆ’Ã‚Â¼ncel"
      : "Resmi manifest doÃƒâ€Ã…Â¸rulanamadÃƒâ€Ã‚Â±";
    row.innerHTML = `<div><strong>${escapeHtml(model.name)}</strong><p class="update-state">${detail}</p></div>`;
    if (model.updateAvailable) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "GÃƒÆ’Ã‚Â¼ncelle";
      button.addEventListener("click", async () => {
        button.disabled = true;
        if (els.setupTitle) els.setupTitle.textContent = `${model.name} gÃƒÆ’Ã‚Â¼ncelleniyor`;
        if (els.setupStatus) els.setupStatus.textContent = "Resmi model paketi indiriliyorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
        if (els.setupBar) {
          els.setupBar.style.width = "0%";
          els.setupBar.classList.add("indeterminate");
        }
        if (els.setupDialog && !els.setupDialog.open) els.setupDialog.showModal();
        try {
          const result = await window.codega.applyModelUpdate(model.name);
          renderModelUpdates(result && result.updates);
          setTransientStatus(`${model.name} gÃƒÆ’Ã‚Â¼ncellendi.`);
          if (els.setupStatus) els.setupStatus.textContent = "Model gÃƒÆ’Ã‚Â¼ncellendi.";
          if (els.setupBar) {
            els.setupBar.classList.remove("indeterminate");
            els.setupBar.style.width = "100%";
          }
        } catch (error) {
          setTransientStatus(`GÃƒÆ’Ã‚Â¼ncelleme baÃƒâ€¦Ã…Â¸arÃƒâ€Ã‚Â±sÃƒâ€Ã‚Â±z: ${error.message || error}`);
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
    row.innerHTML = `<div><strong>${escapeHtml(source.label)}: ${escapeHtml(source.latestGeneration)}</strong><p class="update-state">Yeni resmi model ailesi bulundu; donanÃƒâ€Ã‚Â±m ve Ollama paketi doÃƒâ€Ã…Â¸rulanmadan otomatik kurulmaz.</p></div>`;
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
  gpu: { txt: "ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ GPU ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â hÃƒâ€Ã‚Â±zlÃƒâ€Ã‚Â±", cls: "fit-gpu" },
  "gpu-tight": { txt: "ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â GPU ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â sÃƒâ€Ã‚Â±kÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±k", cls: "fit-tight" },
  cpu: { txt: "Ã„Å¸Ã…Â¸Ã‚ÂÃ‚Â¢ CPU ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â yavaÃƒâ€¦Ã…Â¸", cls: "fit-cpu" },
  no: { txt: "ÃƒÂ¢Ã‚ÂÃ…â€™ Yetersiz", cls: "fit-no" },
};
const stars = (q) => "ÃƒÂ¢Ã‹Å“Ã¢â‚¬Â¦".repeat(Math.max(0, Math.min(5, Number(q) || 0))) + "ÃƒÂ¢Ã‹Å“Ã¢â‚¬Â ".repeat(5 - Math.max(0, Math.min(5, Number(q) || 0)));

async function setDefaultModel(id, label) {
  try {
    await window.codega.setSettings({ defaultModel: id });
    setTransientStatus(`VarsayÃƒâ€Ã‚Â±lan model: ${label || id}`);
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
    cookbookScanBtn.textContent = "TaranÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
  }
  if (manual && hwEl) hwEl.textContent = "CPU, RAM ve NVIDIA VRAM yeniden taranÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
  try {
    const data = await window.codega.cookbookScan();
    const hw = (data && data.hardware) || {};
    if (hwEl) {
      const vram = hw.vramGb != null ? `${hw.vramGb} GB VRAM` : "GPU yok (CPU)";
      const gpu = hw.gpuName ? ` Ãƒâ€šÃ‚Â· ${hw.gpuName}` : "";
      const time = hw.scannedAt ? new Date(hw.scannedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
      hwEl.textContent = `DonanÃƒâ€Ã‚Â±m: ${vram}${gpu} Ãƒâ€šÃ‚Â· ${hw.ramGb} GB RAM Ãƒâ€šÃ‚Â· ${hw.cores} ÃƒÆ’Ã‚Â§ekirdek${time ? ` Ãƒâ€šÃ‚Â· ${time}` : ""}`;
    }
    if (manual) setTransientStatus("DonanÃƒâ€Ã‚Â±m taramasÃƒâ€Ã‚Â± tamamlandÃƒâ€Ã‚Â±.");
    if (recoEl) {
      if (data && data.recommended) {
        const r = data.recommended;
        recoEl.hidden = false;
        recoEl.innerHTML = `<strong>ÃƒÆ’Ã¢â‚¬â€œnerilen: ${(r.label || r.id).replace(/</g, "&lt;")}</strong><p>${(r.reason || "").replace(/</g, "&lt;")}</p>`;
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "primary-btn";
        const recModel = (data.models || []).find((m) => m.id === r.id) || {};
        btn.textContent = recModel.installed ? "VarsayÃƒâ€Ã‚Â±lan Yap" : "Kur ve VarsayÃƒâ€Ã‚Â±lan Yap";
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
        const flags = [m.isDefault ? "ÃƒÂ¢Ã¢â‚¬â€Ã‚Â VarsayÃƒâ€Ã‚Â±lan" : "", m.installed ? "Kurulu" : ""].filter(Boolean).join(" Ãƒâ€šÃ‚Â· ");
        row.innerHTML = `<div><strong>${(m.label || m.id).replace(/</g, "&lt;")}</strong> <span class="fit-badge ${badge.cls}">${badge.txt}</span>`
          + `<p>${(m.note || m.description || "").replace(/</g, "&lt;")} Ãƒâ€šÃ‚Â· ${m.params || ""} Ãƒâ€šÃ‚Â· ${sz} Ãƒâ€šÃ‚Â· <span title="kalite">${stars(m.quality)}</span>${flags ? " Ãƒâ€šÃ‚Â· " + flags : ""}</p></div>`;
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
          def.type = "button"; def.textContent = "VarsayÃƒâ€Ã‚Â±lan Yap";
          def.addEventListener("click", () => setDefaultModel(m.id, m.label || m.id));
          actions.appendChild(def);
        }
        row.appendChild(actions);
        listEl.appendChild(row);
      }
    }
  } catch (e) {
    if (hwEl) hwEl.textContent = "DonanÃƒâ€Ã‚Â±m taranamadÃƒâ€Ã‚Â±: " + (e.message || e);
    if (manual) setTransientStatus("DonanÃƒâ€Ã‚Â±m taramasÃƒâ€Ã‚Â± baÃƒâ€¦Ã…Â¸arÃƒâ€Ã‚Â±sÃƒâ€Ã‚Â±z: " + (e.message || e));
  } finally {
    cookbookScanRunning = false;
    if (cookbookScanBtn) {
      cookbookScanBtn.disabled = false;
      cookbookScanBtn.textContent = "DonanÃƒâ€Ã‚Â±mÃƒâ€Ã‚Â± Tara";
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
      let lastTxt = "HenÃƒÆ’Ã‚Â¼z ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸madÃƒâ€Ã‚Â±";
      if (it.last && it.last.at) {
        const t = new Date(it.last.at);
        const hh = String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0");
        lastTxt = `Son: ${hh}${it.last.info ? " Ãƒâ€šÃ‚Â· " + it.last.info : ""}`;
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
    summary.textContent = "GitHub Agent Watch uygulama baÃƒâ€Ã…Â¸lantÃƒâ€Ã‚Â±sÃƒâ€Ã‚Â± bekleniyor.";
    return;
  }
  try {
    const data = await window.codega.agentWatchStatus();
    const last = data.lastScanAt ? new Date(data.lastScanAt).toLocaleString("tr-TR") : "henÃƒÆ’Ã‚Â¼z taranmadÃƒâ€Ã‚Â±";
    summary.textContent = `${data.healthySources || 0}/${data.sourceCount || 0} kaynak eriÃƒâ€¦Ã…Â¸ilebilir Ãƒâ€šÃ‚Â· Son tarama: ${last}`
      + ` Ãƒâ€šÃ‚Â· ResmÃƒÆ’Ã‚Â® ${data.officialSources || 0} Ãƒâ€šÃ‚Â· AraÃƒâ€¦Ã…Â¸tÃƒâ€Ã‚Â±rma ${data.researchSources || 0} Ãƒâ€šÃ‚Â· Engelli ${data.blockedSources || 0}`
      + ((data.errors || []).length ? ` Ãƒâ€šÃ‚Â· ${(data.errors || []).length} hata` : "");
    findings.innerHTML = "";
    const rows = (data.findings || []).slice(0, 8);
    if (!rows.length) {
      findings.innerHTML = '<div class="agent-watch-empty">HenÃƒÆ’Ã‚Â¼z bulgu yok. Ãƒâ€Ã‚Â°lk tarama kaynaklarÃƒâ€Ã‚Â±n baÃƒâ€¦Ã…Â¸langÃƒâ€Ã‚Â±ÃƒÆ’Ã‚Â§ gÃƒÆ’Ã‚Â¶rÃƒÆ’Ã‚Â¼ntÃƒÆ’Ã‚Â¼sÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼ oluÃƒâ€¦Ã…Â¸turur.</div>';
      return;
    }
    for (const item of rows) {
      const row = document.createElement("div");
      row.className = "settings-row agent-watch-row";
      const policy = item.policy || {};
      const policyLabel = policy.label || (policy.mode === "reviewable-reuse" ? "Lisans incelemesiyle kullanÃƒâ€Ã‚Â±labilir" : "YalnÃƒâ€Ã‚Â±z araÃƒâ€¦Ã…Â¸tÃƒâ€Ã‚Â±rma");
      const capabilityText = Array.isArray(item.capabilities) && item.capabilities.length
        ? `<br><span class="log-time">Yetenek alanlarÃƒâ€Ã‚Â±: ${safeText(item.capabilities.join(", "))}</span>`
        : "";
      row.innerHTML = `<div><strong>${safeText(item.title)}</strong><p>${safeText(item.detail)}<br><span class="log-time">${safeText(item.repo)} Ãƒâ€šÃ‚Â· ${safeText(policyLabel)}</span>${capabilityText}${policy.reason ? `<br><span class="log-time">${safeText(policy.reason)}</span>` : ""}</p></div>`;
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
    summary.textContent = "GitHub Agent Watch okunamadÃƒâ€Ã‚Â±: " + (e.message || e);
  }
}

const agentWatchRunBtn = document.getElementById("agent-watch-run");
if (agentWatchRunBtn) agentWatchRunBtn.addEventListener("click", async () => {
  agentWatchRunBtn.disabled = true;
  agentWatchRunBtn.textContent = "TaranÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
  setTransientStatus("GitHub ajan depolarÃƒâ€Ã‚Â± taranÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦");
  try {
    const result = await window.codega.runAgentWatch();
    setTransientStatus(`Agent Watch tamamlandÃƒâ€Ã‚Â±: ${result.healthySources}/${result.sourceCount} kaynak, ${result.newCount} yeni bulgu.`);
    await refreshAgentWatch();
    await refreshAutomations();
  } catch (e) {
    setTransientStatus("Agent Watch hatasÃƒâ€Ã‚Â±: " + (e.message || e));
  } finally {
    agentWatchRunBtn.disabled = false;
    agentWatchRunBtn.textContent = "Ãƒâ€¦Ã‚Âimdi Tara";
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
        const badge = c.present ? `<span class="badge-active">Var ${c.hint ? "Ãƒâ€šÃ‚Â· " + c.hint : ""}</span>` : `<span class="badge-plan">Yok</span>`;
        row.innerHTML = `<div><strong>${c.key.replace(/</g,"&lt;")}</strong><p>${(c.note||"").replace(/</g,"&lt;")}</p></div>${badge}`;
        creds.appendChild(row);
      }
    }
    if (perms) {
      perms.innerHTML = "";
      for (const pm of (data && data.permissions) || []) {
        const row = document.createElement("div");
        row.className = "settings-row";
        const badge = pm.enabled ? `<span class="badge-active">AÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±k</span>` : `<span class="badge-plan">KapalÃƒâ€Ã‚Â±</span>`;
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
    if (!folders.length) list.innerHTML = '<p class="log-empty">HenÃƒÆ’Ã‚Â¼z gÃƒÆ’Ã‚Â¼venilen ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ma alanÃƒâ€Ã‚Â± yok.</p>';
    for (const folder of folders) {
      const row = document.createElement("div");
      row.className = "settings-row";
      const text = document.createElement("div");
      text.innerHTML = `<strong>ÃƒÆ’Ã¢â‚¬Â¡alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ma alanÃƒâ€Ã‚Â±</strong><p>${safeText(folder)}</p>`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "KaldÃƒâ€Ã‚Â±r";
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
  setTransientStatus("Ajan ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ma zamanÃƒâ€Ã‚Â± politikasÃƒâ€Ã‚Â± kaydedildi.");
  await refreshSecurity();
});

const devPromptBtn = document.getElementById("dev-prompt-btn");
if (devPromptBtn) devPromptBtn.addEventListener("click", async () => {
  const input = (document.getElementById("dev-prompt-input") || {}).value || "";
  const out = document.getElementById("dev-prompt-out");
  if (!input.trim()) { setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œnce bir prompt yaz."); return; }
  devPromptBtn.disabled = true;
  if (out) { out.hidden = false; out.textContent = "ÃƒÆ’Ã¢â‚¬Â¡alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"; }
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
    r1.innerHTML = `<div><strong>Sunucu</strong><p>${url ? url.replace(/</g,"&lt;") : "TanÃƒâ€Ã‚Â±mlÃƒâ€Ã‚Â± deÃƒâ€Ã…Â¸il"}</p></div><span class="${url?'badge-active':'badge-plan'}">${url?'TanÃƒâ€Ã‚Â±mlÃƒâ€Ã‚Â±':'Yok'}</span>`;
    box.appendChild(r1);
    const r2 = document.createElement("div");
    r2.className = "settings-row";
    r2.innerHTML = `<div><strong>Ajana baÃƒâ€Ã…Â¸lÃƒâ€Ã‚Â± (otonom kullanÃƒâ€Ã‚Â±m)</strong><p>AÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±kken ajan sunucunun araÃƒÆ’Ã‚Â§larÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â± kendi ÃƒÆ’Ã‚Â§aÃƒâ€Ã…Â¸Ãƒâ€Ã‚Â±rÃƒâ€Ã‚Â±r.</p></div><span class="${on?'badge-active':'badge-plan'}">${on?'AÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±k':'KapalÃƒâ€Ã‚Â±'}</span>`;
    box.appendChild(r2);
    const r3 = document.createElement("div");
    r3.className = "settings-row";
    let health = null;
    try { health = await window.codega.mcpHealth(); } catch (_e) {}
    const healthText = !url
      ? "Sunucu tanÃƒâ€Ã‚Â±mlÃƒâ€Ã‚Â± deÃƒâ€Ã…Â¸il"
      : health && health.ok
        ? `${health.latencyMs || 0} ms Ãƒâ€šÃ‚Â· ${health.toolCount || 0} araÃƒÆ’Ã‚Â§`
        : (health && health.message) || "BaÃƒâ€Ã…Â¸lantÃƒâ€Ã‚Â± kurulamadÃƒâ€Ã‚Â±";
    r3.innerHTML = `<div><strong>BaÃƒâ€Ã…Â¸lantÃƒâ€Ã‚Â± SaÃƒâ€Ã…Â¸lÃƒâ€Ã‚Â±Ãƒâ€Ã…Â¸Ãƒâ€Ã‚Â±</strong><p>${safeText(healthText)}</p></div><span class="${health && health.ok ? 'badge-active' : 'badge-plan'}">${health && health.ok ? 'HazÃƒâ€Ã‚Â±r' : 'Kontrol Gerekli'}</span>`;
    box.appendChild(r3);
    const r4 = document.createElement("div");
    r4.className = "settings-row";
    r4.innerHTML = `<div><strong>YapÃƒâ€Ã‚Â±landÃƒâ€Ã‚Â±rma</strong><p>Sunucu URL, araÃƒÆ’Ã‚Â§ listeleme ve manuel ÃƒÆ’Ã‚Â§aÃƒâ€Ã…Â¸rÃƒâ€Ã‚Â± "HafÃƒâ€Ã‚Â±za & Bilgi" sekmesindedir.</p></div>`;
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
      statsEl.textContent = st ? `${st.documents} belge Ãƒâ€šÃ‚Â· ${st.chunks} parÃƒÆ’Ã‚Â§a Ãƒâ€šÃ‚Â· ${st.embedded} embedding'li` : "Ãƒâ€Ã‚Â°statistik yok.";
    }
    if (docs) {
      const list = await window.codega.ragList();
      docs.innerHTML = "";
      if (!list || !list.length) { docs.innerHTML = '<p class="log-empty">HenÃƒÆ’Ã‚Â¼z belge eklenmedi.</p>'; }
      for (const d of (list || [])) {
        const row = document.createElement("div");
        row.className = "settings-row";
        const emb = d.embedded ? `${d.embedded}/${d.chunks} embedding` : `${d.chunks} parÃƒÆ’Ã‚Â§a (keyword)`;
        row.innerHTML = `<div><strong>${(d.title||"DokÃƒÆ’Ã‚Â¼man").replace(/</g,"&lt;")}</strong><p>${emb}</p></div>`;
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
  if (!text.trim()) { setTransientStatus("Metin boÃƒâ€¦Ã…Â¸ olamaz."); return; }
  ragAddBtn.disabled = true; setTransientStatus("Ãƒâ€Ã‚Â°ndeksleniyorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦");
  try {
    const r = await window.codega.ragIngest({ title: title.trim() || "DokÃƒÆ’Ã‚Â¼man", text });
    setTransientStatus(r && r.ok ? `Eklendi (+${r.added} parÃƒÆ’Ã‚Â§a${r.embedded?", embedding'li":""}).` : "Eklenemedi.");
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
  if (!window.confirm("TÃƒÆ’Ã‚Â¼m RAG belgeleri silinsin mi?")) return;
  try { await window.codega.ragClear(); refreshRag(); } catch (_e) {}
});
const ragSearchBtn = document.getElementById("rag-search-btn");
if (ragSearchBtn) ragSearchBtn.addEventListener("click", async () => {
  const q = (document.getElementById("rag-query")||{}).value || "";
  const out = document.getElementById("rag-search-out");
  if (!q.trim()) { setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œnce bir sorgu yaz."); return; }
  if (out) { out.hidden = false; out.textContent = "AranÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"; }
  try {
    const hits = await window.codega.ragSearch({ query: q });
    if (out) out.textContent = (hits && hits.length)
      ? hits.map((h,i) => `#${i+1} [${h.title}] (skor ${h.score.toFixed(3)})\n${h.text.slice(0,300)}`).join("\n\n")
      : "EÃƒâ€¦Ã…Â¸leÃƒâ€¦Ã…Â¸me bulunamadÃƒâ€Ã‚Â±.";
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
  // Aktif Model: kullanÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â±n seÃƒÆ’Ã‚Â§tiÃƒâ€Ã…Â¸i varsayÃƒâ€Ã‚Â±lan (yoksa canlÃƒâ€Ã‚Â± durum)
  window.codega.getStatus().then((st) => {
    const raw = st && st.model;
    const live = raw && (raw.model || (typeof raw === "string" ? raw : null));
    const configured = agentSettings && (agentSettings.defaultModel || agentSettings.model);
    const el = document.getElementById("ov-health-model");
    if (el) el.textContent = String(configured || live || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â");
  }).catch(() => {});
  if (typeof refreshLearnList === "function") refreshLearnList();
  window.codega.feedbackStats().then((f) => {
    const el = document.getElementById("ov-feedback");
    if (el && f) el.textContent = `Ã„Å¸Ã…Â¸Ã¢â‚¬ËœÃ‚Â ${f.up || 0} Ãƒâ€šÃ‚Â· Ã„Å¸Ã…Â¸Ã¢â‚¬ËœÃ‚Â ${f.down || 0}`;
  }).catch(() => {});
  window.codega.analyzeSystem().then((sys) => {
    const el = document.getElementById("ov-system");
    const btn = document.getElementById("ov-use-recommended");
    if (!sys) return;
    if (el) el.textContent = `${sys.ramGB} GB RAM Ãƒâ€šÃ‚Â· ${sys.cores} ÃƒÆ’Ã‚Â§ekirdek Ãƒâ€šÃ‚Â· ${sys.platform}/${sys.arch} ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ÃƒÆ’Ã‚Â¶nerilen: ${sys.recommended.label}`;
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

// ===== Ayarlar Kontrol Merkezi: gezinme / arama / iÃƒÆ’Ã‚Â§e-dÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸a aktarma =====
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
  const health = (name, ready, active, configuredText = "hazÃƒâ€Ã‚Â±r") => {
    set(`ov-health-${name}`, active ? "aktif" : ready ? configuredText : "yapÃƒâ€Ã‚Â±landÃƒâ€Ã‚Â±rÃƒâ€Ã‚Â±lmadÃƒâ€Ã‚Â±");
    const dot = document.getElementById(`ov-health-${name}-dot`);
    if (dot) dot.className = `dot ${active || ready ? "ok" : "plan"}`;
  };
  const ollama = document.getElementById("ollama-row-status");
  const ollamaText = ollama ? ollama.textContent || "" : "";
  const ollamaReady = /ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yor/i.test(ollamaText);
  if (ollama) set("ov-health-ollama", ollamaReady ? "\u00e7al\u0131\u015f\u0131yor" : "kurulu de\u011fil");
  if (ollama) set("ov-ollama", /ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yor/i.test(ollama.textContent) ? "ÃƒÆ’Ã¢â‚¬Â¡alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yor ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“" : "Kurulu deÃƒâ€Ã…Â¸il");
  const ver = document.getElementById("version-label");
  if (ver) set("ov-version", ver.textContent || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â");
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
      set(`ov-health-${name}`, selected ? (configured ? "aktif" : "API anahtarÃƒâ€Ã‚Â± gerekli") : (configured ? "hazÃƒâ€Ã‚Â±r" : "yapÃƒâ€Ã‚Â±landÃƒâ€Ã‚Â±rÃƒâ€Ã‚Â±lmadÃƒâ€Ã‚Â±"));
      const dot = document.getElementById(`ov-health-${name}-dot`);
      if (dot) dot.className = `dot ${selected && !configured ? "warn" : configured ? "ok" : "plan"}`;
    };
    providerHealth("openai", agentSettings.openaiApiKey);
    providerHealth("claude", agentSettings.claudeApiKey);
    providerHealth("gemini", agentSettings.geminiApiKey);
    health("mcp", !!String(agentSettings.mcpServerUrl || "").trim(), !!agentSettings.mcpAutoTools, agentSettings.mcpAutoTools ? "ajana baÃƒâ€Ã…Â¸lÃƒâ€Ã‚Â±" : "sunucu kayÃƒâ€Ã‚Â±tlÃƒâ€Ã‚Â±");
    health("federation", !!agentSettings.federation, !!agentSettings.federation, "aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±k");
    if (!agentSettings.federation) set("ov-health-federation", "kapalÃƒâ€Ã‚Â±");
  }
}

// Arama kutusu (Enter dialog'u kapatmasÃƒâ€Ã‚Â±n)
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

// JSON dÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸a aktarma
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
      setTransientStatus("Ayarlar dÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸a aktarÃƒâ€Ã‚Â±ldÃƒâ€Ã‚Â±.");
    } catch (e) {
      setTransientStatus("DÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸a aktarma baÃƒâ€¦Ã…Â¸arÃƒâ€Ã‚Â±sÃƒâ€Ã‚Â±z: " + (e.message || e));
    }
  });
}

// JSON iÃƒÆ’Ã‚Â§e aktarma
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
        if (!data || typeof data !== "object") throw new Error("geÃƒÆ’Ã‚Â§ersiz format");
        agentSettings = await window.codega.setSettings(data);
        applyAppearance(agentSettings);
        await refreshAgentSettings();
        updateOverview();
        setTransientStatus("Ayarlar iÃƒÆ’Ã‚Â§e aktarÃƒâ€Ã‚Â±ldÃƒâ€Ã‚Â± ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“");
      } catch (err) {
        setTransientStatus("Ãƒâ€Ã‚Â°ÃƒÆ’Ã‚Â§e aktarma baÃƒâ€¦Ã…Â¸arÃƒâ€Ã‚Â±sÃƒâ€Ã‚Â±z: " + (err.message || err));
      }
      settingsImportFile.value = "";
    };
    fr.readAsText(file);
  });
}

// AjanÃƒâ€Ã‚Â±n topladÃƒâ€Ã‚Â±Ãƒâ€Ã…Â¸Ãƒâ€Ã‚Â± ÃƒÆ’Ã‚Â¶neri taslaklarÃƒâ€Ã‚Â±: listele + tek tÃƒâ€Ã‚Â±kla PR
async function refreshImproveDrafts() {
  const list = document.getElementById("improve-drafts-list");
  const status = document.getElementById("improve-drafts-status");
  if (!list) return;
  let drafts = [];
  try { drafts = (await window.codega.improveDrafts()) || []; } catch (_e) { drafts = []; }
  list.innerHTML = "";
  if (!drafts.length) {
    if (status) status.textContent = "Ãƒâ€¦Ã‚Âu an taslak yok ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ajan henÃƒÆ’Ã‚Â¼z dikkate deÃƒâ€Ã…Â¸er tekrar eden bir sorun gÃƒÆ’Ã‚Â¶zlemlemedi.";
    return;
  }
  if (status) status.textContent = `${drafts.length} taslak ÃƒÆ’Ã‚Â¶neri (yerel). Birini PR olarak aÃƒÆ’Ã‚Â§abilirsin.`;
  drafts.forEach((d) => {
    const row = document.createElement("div");
    row.className = "settings-row";
    const info = document.createElement("div");
    info.innerHTML = `<strong>${d.idea}</strong><p>${d.rationale}</p>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "PR AÃƒÆ’Ã‚Â§";
    btn.addEventListener("click", async () => {
      const repo = (document.getElementById("improve-repo")?.value || "").trim();
      btn.disabled = true;
      setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œneri PR'Ãƒâ€Ã‚Â± hazÃƒâ€Ã‚Â±rlanÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦");
      try {
        const res = await window.codega.proposeImprovement({ repo, idea: d.idea, rationale: d.rationale });
        if (res && res.url) {
          try { await navigator.clipboard.writeText(res.url); } catch {}
          setTransientStatus(`ÃƒÆ’Ã¢â‚¬â€œneri PR aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±ldÃƒâ€Ã‚Â± (#${res.number}) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â link kopyalandÃƒâ€Ã‚Â±.`);
        } else setTransientStatus("PR aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±ldÃƒâ€Ã‚Â± ama link alÃƒâ€Ã‚Â±namadÃƒâ€Ã‚Â±.");
      } catch (e) {
        setTransientStatus("PR aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±lamadÃƒâ€Ã‚Â±: " + (e.message || e));
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
  setTransientStatus(selectedProviderFields() ? "Bulut saÃƒâ€Ã…Â¸layÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â± seÃƒÆ’Ã‚Â§ildi." : "Yerel saÃƒâ€Ã…Â¸layÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â± seÃƒÆ’Ã‚Â§ildi.");
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
  setTransientStatus("BaÃƒâ€Ã…Â¸lantÃƒâ€Ã‚Â± test ediliyorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦");
  try {
    const r = await window.codega.testProvider({
      provider: els.providerSelect ? els.providerSelect.value : "openai",
      baseUrl: els.openaiBase ? els.openaiBase.value.trim() : "",
      apiKey: els.openaiKey ? els.openaiKey.value.trim() : "",
      model: els.openaiModel ? els.openaiModel.value.trim() : "",
    });
    setTransientStatus((r && r.message) || (r && r.ok ? "BaÃƒâ€Ã…Â¸lantÃƒâ€Ã‚Â± baÃƒâ€¦Ã…Â¸arÃƒâ€Ã‚Â±lÃƒâ€Ã‚Â±." : "BaÃƒâ€Ã…Â¸lantÃƒâ€Ã‚Â± baÃƒâ€¦Ã…Â¸arÃƒâ€Ã‚Â±sÃƒâ€Ã‚Â±z."));
  } catch (e) {
    setTransientStatus("Test hatasÃƒâ€Ã‚Â±: " + (e.message || e));
  } finally {
    els.providerTest.disabled = false;
  }
});

// Ãƒâ€Ã‚Â°nsan onaylÃƒâ€Ã‚Â± kod ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸tÃƒâ€Ã‚Â±rÃƒâ€Ã‚Â±cÃƒâ€Ã‚Â± (ajan kendiliÃƒâ€Ã…Â¸inden ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸tÃƒâ€Ã‚Â±rmaz)
const codeRunBtn = document.getElementById("code-run");
if (codeRunBtn) {
  codeRunBtn.addEventListener("click", async () => {
    const lang = (document.getElementById("code-lang") || {}).value || "python";
    const code = (document.getElementById("code-input") || {}).value || "";
    const out = document.getElementById("code-output");
    if (!code.trim()) { setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œnce kod yaz."); return; }
    codeRunBtn.disabled = true;
    if (out) { out.hidden = false; out.textContent = "ÃƒÆ’Ã¢â‚¬Â¡alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"; }
    try {
      const r = await window.codega.runCode({ language: lang, code });
      const parts = [];
      if (r.stdout) parts.push(r.stdout);
      if (r.stderr) parts.push((r.stdout ? "\nÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â stderr ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â\n" : "") + r.stderr);
      const body = parts.join("") || "(ÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±ktÃƒâ€Ã‚Â± yok)";
      if (out) out.textContent = `[ÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±kÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ kodu: ${r.exitCode}]\n${body}`;
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
  setTransientStatus("DurduruluyorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦");
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

// MCP araÃƒÆ’Ã‚Â§ sunucusu (manuel; ajan dÃƒÆ’Ã‚Â¶ngÃƒÆ’Ã‚Â¼sÃƒÆ’Ã‚Â¼ne baÃƒâ€Ã…Â¸lÃƒâ€Ã‚Â± deÃƒâ€Ã…Â¸il)
const mcpListBtn = document.getElementById("mcp-list");
if (mcpListBtn) {
  mcpListBtn.addEventListener("click", async () => {
    const url = (document.getElementById("mcp-url") || {}).value || "";
    const box = document.getElementById("mcp-tools");
    mcpListBtn.disabled = true;
    if (box) box.textContent = "BaÃƒâ€Ã…Â¸lanÃƒâ€Ã‚Â±lÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
    try {
      const r = await window.codega.mcpListTools({ url: url.trim() });
      const tools = (r && r.tools) || [];
      if (box) {
        box.innerHTML = "";
        if (!tools.length) { box.textContent = "AraÃƒÆ’Ã‚Â§ bulunamadÃƒâ€Ã‚Â±."; }
        tools.forEach((t) => {
          const row = document.createElement("div");
          row.className = "settings-row";
          row.innerHTML = `<div><strong>${t.name}</strong><p>${(t.description||"").slice(0,140)}</p></div>`;
          const use = document.createElement("button");
          use.type = "button"; use.textContent = "SeÃƒÆ’Ã‚Â§";
          use.addEventListener("click", () => { const n = document.getElementById("mcp-tool-name"); if (n) n.value = t.name; });
          row.appendChild(use);
          box.appendChild(row);
        });
      }
      setTransientStatus(`${tools.length} araÃƒÆ’Ã‚Â§ bulundu${r && r.serverInfo ? " Ãƒâ€šÃ‚Â· " + r.serverInfo.name : ""}.`);
    } catch (e) {
      if (box) box.textContent = "Hata: " + (e.message || e);
      setTransientStatus("MCP baÃƒâ€Ã…Â¸lanÃƒâ€Ã‚Â±lamadÃƒâ€Ã‚Â±.");
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
    if (!name.trim()) { setTransientStatus("AraÃƒÆ’Ã‚Â§ adÃƒâ€Ã‚Â± gir."); return; }
    mcpCallBtn.disabled = true;
    if (out) { out.hidden = false; out.textContent = "ÃƒÆ’Ã¢â‚¬Â¡aÃƒâ€Ã…Â¸rÃƒâ€Ã‚Â±lÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"; }
    try {
      const r = await window.codega.mcpCallTool({ url: url.trim(), name: name.trim(), args });
      if (out) out.textContent = (r.isError ? "[hata] " : "") + (r.text || "(boÃƒâ€¦Ã…Â¸)");
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
    head.textContent = `ÃƒÆ’Ã¢â‚¬â€œÃƒâ€Ã…Â¸renilen bilgi: ${(r && r.total) || 0}` + (r && r.last ? ` Ãƒâ€šÃ‚Â· son konu: ${r.last.topic}` : "");
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
  setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œÃƒâ€Ã…Â¸reniliyorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ (seÃƒÆ’Ã‚Â§ili kaynaklar)");
  try {
    const r = await window.codega.learnNow({});
    setTransientStatus(r && r.ok ? `ÃƒÆ’Ã¢â‚¬â€œÃƒâ€Ã…Â¸renildi: ${r.topic} (+${r.added}, toplam ${r.total})` : (r && r.message) || "ÃƒÆ’Ã¢â‚¬â€œÃƒâ€Ã…Â¸renilemedi.");
    refreshLearnList();
  } catch (e) { setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œÃƒâ€Ã…Â¸renme hatasÃƒâ€Ã‚Â±: " + (e.message || e)); }
  finally { learnNowBtn.disabled = false; }
});
const learnClearBtn = document.getElementById("learn-clear");
if (learnClearBtn) learnClearBtn.addEventListener("click", async () => {
  try { await window.codega.clearLearning(); refreshLearnList(); setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œÃƒâ€Ã…Â¸renilenler temizlendi."); } catch (_e) {}
});

if (els.toggleMcpAuto) els.toggleMcpAuto.addEventListener("click", async () => {
  const next = !agentSettings.mcpAutoTools;
  const url = ((document.getElementById("mcp-url") || {}).value || "").trim();
  if (next && !/^https?:\/\//i.test(url)) { setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œnce geÃƒÆ’Ã‚Â§erli bir MCP sunucu URL gir."); return; }
  els.toggleMcpAuto.disabled = true;
  try {
    agentSettings = await window.codega.setSettings({ mcpAutoTools: next, mcpServerUrl: url });
    applyToggleLabel(els.toggleMcpAuto, !!agentSettings.mcpAutoTools);
    const r = await window.codega.mcpRefreshTools();
    setTransientStatus(next ? (r && r.ok ? `Ajana ${r.count} MCP aracÃƒâ€Ã‚Â± baÃƒâ€Ã…Â¸landÃƒâ€Ã‚Â±.` : "BaÃƒâ€Ã…Â¸lanamadÃƒâ€Ã‚Â±: " + ((r && r.message) || "")) : "MCP araÃƒÆ’Ã‚Â§larÃƒâ€Ã‚Â± ajandan ÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±karÃƒâ€Ã‚Â±ldÃƒâ€Ã‚Â±.");
  } catch (e) { setTransientStatus("Hata: " + (e.message || e)); }
  finally { els.toggleMcpAuto.disabled = false; }
});

buildSettingsNav();

// Denetimli kendini geliÃƒâ€¦Ã…Â¸tirme: ÃƒÆ’Ã‚Â¶neriyi PR olarak aÃƒÆ’Ã‚Â§
const improveSubmit = document.getElementById("improve-submit");
if (improveSubmit) {
  improveSubmit.addEventListener("click", async () => {
    const repo = (document.getElementById("improve-repo")?.value || "").trim();
    const idea = (document.getElementById("improve-idea")?.value || "").trim();
    if (!idea) { setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œnce bir ÃƒÆ’Ã‚Â¶neri metni yaz."); return; }
    improveSubmit.disabled = true;
    setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œneri PR'Ãƒâ€Ã‚Â± hazÃƒâ€Ã‚Â±rlanÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦");
    try {
      const res = await window.codega.proposeImprovement({ repo, idea });
      if (res && res.url) {
        try { await navigator.clipboard.writeText(res.url); } catch {}
        setTransientStatus(`ÃƒÆ’Ã¢â‚¬â€œneri PR aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±ldÃƒâ€Ã‚Â± (#${res.number}) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â link kopyalandÃƒâ€Ã‚Â±.`);
        const ideaEl = document.getElementById("improve-idea");
        if (ideaEl) ideaEl.value = "";
      } else {
        setTransientStatus("PR aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±ldÃƒâ€Ã‚Â± ama link alÃƒâ€Ã‚Â±namadÃƒâ€Ã‚Â±.");
      }
    } catch (e) {
      setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œneri PR'Ãƒâ€Ã‚Â± aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±lamadÃƒâ€Ã‚Â±: " + (e.message || e));
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
      setTransientStatus("Repo, hedef dosyalar ve geliÃƒâ€¦Ã…Â¸tirme gÃƒÆ’Ã‚Â¶revi gerekli.");
      return;
    }
    els.developmentRun.disabled = true;
    els.developmentStatus.textContent = "Dosyalar okunuyor, kod deÃƒâ€Ã…Â¸iÃƒâ€¦Ã…Â¸ikliÃƒâ€Ã…Â¸i hazÃƒâ€Ã‚Â±rlanÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
    try {
      agentSettings = await window.codega.setSettings({
        autonomousDevelopmentRepo: repo,
        autonomousDevelopmentPaths: paths,
        autonomousDevelopmentIntervalHours: Math.max(1, Math.min(168, Number(els.developmentInterval?.value) || 24)),
      });
      const result = await window.codega.runAutonomousDevelopment({ repo, paths, task });
      els.developmentStatus.textContent =
        `Taslak PR #${result.number} aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±ldÃƒâ€Ã‚Â± Ãƒâ€šÃ‚Â· ${result.changedFiles.length} dosya Ãƒâ€šÃ‚Â· ${result.branch}`;
      try { await navigator.clipboard.writeText(result.url); } catch (_e) {}
      setTransientStatus(`Taslak PR #${result.number} aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±ldÃƒâ€Ã‚Â±; baÃƒâ€Ã…Â¸lantÃƒâ€Ã‚Â± kopyalandÃƒâ€Ã‚Â±.`);
      els.developmentTask.value = "";
    } catch (error) {
      els.developmentStatus.textContent = `GeliÃƒâ€¦Ã…Â¸tirme durdu: ${error.message || error}`;
      setTransientStatus("Kod geliÃƒâ€¦Ã…Â¸tirme gÃƒÆ’Ã‚Â¶revi tamamlanamadÃƒâ€Ã‚Â±.");
    } finally {
      els.developmentRun.disabled = false;
    }
  });
}

// Kendi kendine bakÃƒâ€Ã‚Â±m: elle ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸tÃƒâ€Ã‚Â±r + sonucu gÃƒÆ’Ã‚Â¶ster
function summarizeMaintenance(rep) {
  if (!rep || !rep.items) return "BakÃƒâ€Ã‚Â±m bilgisi yok.";
  const oll = rep.items.find((i) => i.name === "ollama");
  const parts = [`Ollama: ${oll && oll.status === "ok" ? "ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±yor ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“" : "kapalÃƒâ€Ã‚Â±"}`];
  if (rep.repairs && rep.repairs.length) parts.push(`onarÃƒâ€Ã‚Â±ldÃƒâ€Ã‚Â±: ${rep.repairs.join(", ")}`);
  else parts.push("onarÃƒâ€Ã‚Â±m gerekmedi");
  return parts.join(" Ãƒâ€šÃ‚Â· ");
}
if (els.runMaintenance) {
  els.runMaintenance.addEventListener("click", async () => {
    els.runMaintenance.disabled = true;
    try {
      const rep = await window.codega.runMaintenance();
      const txt = summarizeMaintenance(rep);
      const ov = document.getElementById("ov-maintenance");
      if (ov) ov.textContent = txt;
      setTransientStatus("BakÃƒâ€Ã‚Â±m tamam ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â " + txt);
    } catch (e) {
      setTransientStatus("BakÃƒâ€Ã‚Â±m baÃƒâ€¦Ã…Â¸arÃƒâ€Ã‚Â±sÃƒâ€Ã‚Â±z: " + (e.message || e));
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
  const what = patch.theme ? "Tema" : patch.accent ? "Vurgu rengi" : patch.fontScale ? "YazÃƒâ€Ã‚Â± boyutu" : "GÃƒÆ’Ã‚Â¶rÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼m";
  setTransientStatus(`${what} uygulandÃƒâ€Ã‚Â±.`);
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

// AÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±lÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ta kayÃƒâ€Ã‚Â±tlÃƒâ€Ã‚Â± gÃƒÆ’Ã‚Â¶rÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼mÃƒÆ’Ã‚Â¼ uygula
window.codega
  .getSettings()
  .then((s) => {
    agentSettings = s;
    applyAppearance(s);
  })
  .catch(() => {});

function applyToggleLabel(button, on) {
  if (!button) return;
  // Prototipteki kaydÃƒâ€Ã‚Â±rmalÃƒâ€Ã‚Â± "pill" anahtar gÃƒÆ’Ã‚Â¶rÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼mÃƒÆ’Ã‚Â¼ (metin yerine gÃƒÆ’Ã‚Â¶rsel switch)
  button.classList.add("switch");
  button.classList.toggle("on", !!on);
  button.setAttribute("aria-pressed", on ? "true" : "false");
  button.setAttribute("aria-label", on ? "AÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±k" : "KapalÃƒâ€Ã‚Â±");
  button.title = on ? "AÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±k" : "KapalÃƒâ€Ã‚Â±";
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
        ? `${agentSettings.autonomousDevelopmentSchedule ? "GÃƒÆ’Ã‚Â¶zlem dÃƒÆ’Ã‚Â¶ngÃƒÆ’Ã‚Â¼sÃƒÆ’Ã‚Â¼ aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±k." : "Elle ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸ma hazÃƒâ€Ã‚Â±r."} En fazla 4 hedef dosya, ayrÃƒâ€Ã‚Â± dal ve taslak PR sÃƒâ€Ã‚Â±nÃƒâ€Ã‚Â±rÃƒâ€Ã‚Â± etkin.${lastResult ? ` SonuÃƒÆ’Ã‚Â§: ${lastResult}` : ""}`
        : "KapalÃƒâ€Ã‚Â±. EtkinleÃƒâ€¦Ã…Â¸tirdiÃƒâ€Ã…Â¸inde yalnÃƒâ€Ã‚Â±z belirttiÃƒâ€Ã…Â¸in dosyalar deÃƒâ€Ã…Â¸iÃƒâ€¦Ã…Â¸tirilebilir.";
    }
    els.githubToken.value = "";
    els.githubToken.placeholder = agentSettings.githubToken
      ? "ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ (kayÃƒâ€Ã‚Â±tlÃƒâ€Ã‚Â± ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â deÃƒâ€Ã…Â¸iÃƒâ€¦Ã…Â¸tirmek iÃƒÆ’Ã‚Â§in yaz)"
      : "GitHub token (ghp_...)";
  } catch (_e) {
    /* ayar okunamadÃƒâ€Ã‚Â± */
  }
  try {
    const facts = await window.codega.listMemory();
    els.memorySummary.textContent = facts.length
      ? `${facts.length} Ãƒâ€¦Ã…Â¸ey ÃƒÆ’Ã‚Â¶Ãƒâ€Ã…Â¸renildi.`
      : "HenÃƒÆ’Ã‚Â¼z bir Ãƒâ€¦Ã…Â¸ey ÃƒÆ’Ã‚Â¶Ãƒâ€Ã…Â¸renmedim.";
    els.memoryList.innerHTML = facts
      .map((f) => `<div class="model-row"><div><p>${escapeHtml(f)}</p></div></div>`)
      .join("");
  } catch (_e) {
    /* hafÃƒâ€Ã‚Â±za okunamadÃƒâ€Ã‚Â± */
  }
  try {
    const rs = await window.codega.ragStats();
    els.ragStats.textContent = rs.chunks
      ? `${rs.documents} dokÃƒÆ’Ã‚Â¼man / ${rs.chunks} parÃƒÆ’Ã‚Â§a (${rs.embedded} gÃƒÆ’Ã‚Â¶mÃƒÆ’Ã‚Â¼lÃƒÆ’Ã‚Â¼).`
      : "DokÃƒÆ’Ã‚Â¼man/not ekle; sorularÃƒâ€Ã‚Â±nda bunlardan yararlanÃƒâ€Ã‚Â±r.";
  } catch (_e) {
    /* rag okunamadÃƒâ€Ã‚Â± */
  }
}

els.ragAdd.addEventListener("click", async () => {
  const text = els.ragText.value.trim();
  if (!text) {
    setTransientStatus("Eklenecek metin boÃƒâ€¦Ã…Â¸.");
    return;
  }
  els.ragAdd.disabled = true;
  els.ragStats.textContent = "Bilgi tabanÃƒâ€Ã‚Â±na ekleniyor...";
  try {
    const res = await window.codega.ragIngest({
      title: els.ragTitle.value.trim() || "DokÃƒÆ’Ã‚Â¼man",
      text,
    });
    els.ragText.value = "";
    els.ragTitle.value = "";
    setTransientStatus(
      res.embedded
        ? `Eklendi: ${res.added} parÃƒÆ’Ã‚Â§a (semantik gÃƒÆ’Ã‚Â¶mme ile).`
        : `Eklendi: ${res.added} parÃƒÆ’Ã‚Â§a (Ollama kapalÃƒâ€Ã‚Â± ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ anahtar kelime modu).`
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
    setTransientStatus("Bilgi tabanÃƒâ€Ã‚Â± temizlendi.");
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
    els.knowledgeStatus.textContent = `BaÃƒâ€Ã…Â¸landÃƒâ€Ã‚Â±: ${me.login}`;
  } catch (error) {
    els.knowledgeStatus.textContent = `BaÃƒâ€Ã…Â¸lanamadÃƒâ€Ã‚Â±: ${error.message || error}`;
  } finally {
    els.githubTest.disabled = false;
  }
});

els.toggleIdle.addEventListener("click", () => toggleSetting("idleLearning", els.toggleIdle));

els.installOllama.addEventListener("click", async () => {
  els.installOllama.disabled = true;
  try {
    await window.codega.installOllama();
    setTransientStatus("Ollama indirme sayfasÃƒâ€Ã‚Â± aÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±ldÃƒâ€Ã‚Â±. Kurduktan sonra uygulamayÃƒâ€Ã‚Â± yeniden baÃƒâ€¦Ã…Â¸lat.");
  } catch (error) {
    setTransientStatus(`AÃƒÆ’Ã‚Â§Ãƒâ€Ã‚Â±lamadÃƒâ€Ã‚Â±: ${error.message || error}`);
  } finally {
    els.installOllama.disabled = false;
  }
});

if (els.moveModelStorage) {
  els.moveModelStorage.addEventListener("click", async () => {
    els.moveModelStorage.disabled = true;
    if (els.modelStorageStatus) els.modelStorageStatus.textContent = "Hedef klasÃƒÆ’Ã‚Â¶r seÃƒÆ’Ã‚Â§imi bekleniyorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
    try {
      const result = await window.codega.moveModelStorage();
      if (result?.canceled) {
        if (els.modelStorageStatus) els.modelStorageStatus.textContent = "TaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±ma iptal edildi.";
        return;
      }
      if (result?.ok) {
        if (els.modelStorageStatus) els.modelStorageStatus.textContent = "Modeller yeni dizinde hazÃƒâ€Ã‚Â±r.";
        await refreshStatus();
      }
    } catch (error) {
      if (els.modelStorageStatus) {
        els.modelStorageStatus.textContent = `TaÃƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±ma baÃƒâ€¦Ã…Â¸arÃƒâ€Ã‚Â±sÃƒâ€Ã‚Â±z: ${error.message || error}`;
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
      : `OlmadÃƒâ€Ã‚Â±: ${res.reason}`;
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
      ? `Okundu: ${res.loaded} bilgi yÃƒÆ’Ã‚Â¼klendi.`
      : `OlmadÃƒâ€Ã‚Â±: ${res.reason}`;
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
      setTransientStatus("ÃƒÆ’Ã¢â‚¬â€œnce hedef repo ve en fazla 4 dosya yolu belirle.");
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
    setTransientStatus(`Model yedekleme sÃƒâ€Ã‚Â±rasÃƒâ€Ã‚Â±: ${agentSettings.modelFallbackOrder.join(" ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ")}`);
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
  els.modelDetail.textContent = "Zeka paketi hazÃƒâ€Ã‚Â±rlanÃƒâ€Ã‚Â±yor...";
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
  els.updateDetail.textContent = "GÃƒÆ’Ã‚Â¼ncelleme kontrol ediliyor...";
  setTransientStatus("GÃƒÆ’Ã‚Â¼ncelleme kontrol ediliyorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦");
  try {
    await window.codega.checkForUpdates();
  } catch (error) {
    els.updateDetail.textContent = `GÃƒÆ’Ã‚Â¼ncelleme kontrol edilemedi: ${error.message || error}`;
    setTransientStatus(`GÃƒÆ’Ã‚Â¼ncelleme kontrol edilemedi: ${error.message || error}`);
  } finally {
    els.checkUpdate.disabled = false;
  }
});
els.downloadUpdate.addEventListener("click", async () => {
  els.downloadUpdate.disabled = true;
  showUpdatePrompt("downloading", { percent: 0 });
  els.updateDetail.textContent = "GÃƒÆ’Ã‚Â¼ncelleme indiriliyor...";
  try {
    await window.codega.downloadUpdate();
  } catch (error) {
    els.updateDetail.textContent = `GÃƒÆ’Ã‚Â¼ncelleme indirilemedi: ${error.message || error}`;
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
      els.updatePromptDetail.textContent = "GÃƒÆ’Ã‚Â¼ncelleme indiriliyor. HazÃƒâ€Ã‚Â±r olunca tekrar soracaÃƒâ€Ã…Â¸Ãƒâ€Ã‚Â±m.";
      showUpdatePrompt("downloading", { percent: 0 });
      await window.codega.downloadUpdate();
    }
  } catch (error) {
    els.updatePromptDetail.textContent = `GÃƒÆ’Ã‚Â¼ncelleme baÃƒâ€¦Ã…Â¸latÃƒâ€Ã‚Â±lamadÃƒâ€Ã‚Â±: ${error.message || error}`;
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
  if (els.setupStatus) els.setupStatus.textContent = "BaÃƒâ€¦Ã…Â¸latÃƒâ€Ã‚Â±lÃƒâ€Ã‚Â±yorÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
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
  const ollamaDone = /kuruldu|hazÃƒâ€Ã‚Â±r|ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“/i.test(msg) || isModelPhase;
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
  openSetupProgress(label ? `Kurulum: ${label}` : "ÃƒÆ’Ã¢â‚¬â€œnerilen Modeli Kur");
  try {
    const status = await window.codega.setupModel({ modelId });
    if (status && status.ok === false) {
      finishSetup(false, status.message || "Kurulum tamamlanmadÃƒâ€Ã‚Â±.");
    } else {
      finishSetup(true, `${label || "Model"} hazÃƒâ€Ã‚Â±r ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“`);
      if (typeof refreshModels === "function") refreshModels();
      if (typeof refreshModelsPage === "function") refreshModelsPage();
      if (typeof refreshCookbook === "function") refreshCookbook();
    }
  } catch (e) {
    finishSetup(false, "Kurulum hatasÃƒâ€Ã‚Â±: " + (e.message || e));
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
    checking: "GÃƒÆ’Ã‚Â¼ncelleme kontrol ediliyor...",
    available: "Yeni sÃƒÆ’Ã‚Â¼rÃƒÆ’Ã‚Â¼m bulundu. Ãƒâ€Ã‚Â°ndirmeye hazÃƒâ€Ã‚Â±r.",
    "not-available": detail.reason === "development"
      ? "GÃƒÆ’Ã‚Â¼ncelleme kontrolÃƒÆ’Ã‚Â¼ paketlenmiÃƒâ€¦Ã…Â¸ uygulamada ÃƒÆ’Ã‚Â§alÃƒâ€Ã‚Â±Ãƒâ€¦Ã…Â¸Ãƒâ€Ã‚Â±r."
      : "GÃƒÆ’Ã‚Â¼ncel sÃƒÆ’Ã‚Â¼rÃƒÆ’Ã‚Â¼mÃƒÆ’Ã‚Â¼ kullanÃƒâ€Ã‚Â±yorsun.",
    downloading: `GÃƒÆ’Ã‚Â¼ncelleme indiriliyor${detail.percent ? `: %${Math.round(detail.percent)}` : "..."}`,
    ready: "GÃƒÆ’Ã‚Â¼ncelleme indirildi. Kurulum iÃƒÆ’Ã‚Â§in yeniden baÃƒâ€¦Ã…Â¸latabilirsin.",
    error: detail.message ? `GÃƒÆ’Ã‚Â¼ncelleme hatasÃƒâ€Ã‚Â±: ${detail.message}` : "GÃƒÆ’Ã‚Â¼ncelleme kontrolÃƒÆ’Ã‚Â¼ tamamlanamadÃƒâ€Ã‚Â±.",
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
  // Elle kontrolde gÃƒÆ’Ã‚Â¶rÃƒÆ’Ã‚Â¼nÃƒÆ’Ã‚Â¼r geri bildirim (sonuÃƒÆ’Ã‚Â§ gizli sekmede kalmasÃƒâ€Ã‚Â±n)
  if (manualUpdateCheck && (state === "not-available" || state === "error")) {
    setTransientStatus(messages[state] || "GÃƒÆ’Ã‚Â¼ncelleme kontrolÃƒÆ’Ã‚Â¼ tamamlandÃƒâ€Ã‚Â±.");
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
