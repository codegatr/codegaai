const state = {
  messages: [],
  chats: [],
  activeChat: null,
};

const els = {
  version: document.getElementById("version-label"),
  history: document.getElementById("history-list"),
  conversation: document.getElementById("conversation"),
  welcome: document.getElementById("welcome"),
  form: document.getElementById("chat-form"),
  input: document.getElementById("prompt-input"),
  modelPill: document.getElementById("model-pill"),
  settings: document.getElementById("settings-dialog"),
  settingsButton: document.getElementById("settings-button"),
  prepareModel: document.getElementById("prepare-model"),
  modelDetail: document.getElementById("model-detail"),
  checkUpdate: document.getElementById("check-update"),
  updateDetail: document.getElementById("update-detail"),
  updateActions: document.getElementById("update-actions"),
  downloadUpdate: document.getElementById("download-update"),
  installUpdate: document.getElementById("install-update"),
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

function createChat(title = "Yeni sohbet") {
  const chat = {
    id: crypto.randomUUID(),
    title,
    messages: [],
    updatedAt: Date.now(),
  };
  state.chats.unshift(chat);
  state.activeChat = chat.id;
  renderHistory();
  renderConversation();
}

function currentChat() {
  if (!state.activeChat) createChat();
  return state.chats.find((chat) => chat.id === state.activeChat);
}

function renderHistory() {
  els.history.innerHTML = state.chats.map((chat) => `
    <button class="history-item ${chat.id === state.activeChat ? "active" : ""}" data-chat="${chat.id}">
      ${escapeHtml(chat.title)}
    </button>
  `).join("");

  els.history.querySelectorAll("[data-chat]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeChat = button.dataset.chat;
      renderHistory();
      renderConversation();
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

  for (const message of chat.messages) {
    const node = document.createElement("article");
    node.className = `message ${message.role}`;
    node.innerHTML = `
      <div class="role">${message.role === "user" ? "SEN" : "CODEGA AI"}</div>
      <div>${escapeHtml(message.text).replace(/\n/g, "<br>")}</div>
    `;
    els.conversation.appendChild(node);
  }
  els.conversation.scrollTop = els.conversation.scrollHeight;
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
  renderHistory();
  renderConversation();
}

function setModelStatus(status) {
  const text = status?.message || "Model durumu bilinmiyor";
  els.modelPill.textContent = text;
  els.modelDetail.textContent = `${status?.provider || "instant"} Â· ${status?.model || "codega-instant"} Â· ${status?.status || "unknown"}`;
}

async function refreshStatus() {
  const status = await window.codega.getStatus();
  els.version.textContent = `v${status.version}`;
  setModelStatus(status.model);
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = els.input.value.trim();
  if (!text) return;

  appendMessage("user", text);
  els.input.value = "";
  els.input.style.height = "auto";
  appendMessage("assistant", "DÃ¼ÅŸÃ¼nÃ¼yorum...");

  const chat = currentChat();
  const placeholder = chat.messages[chat.messages.length - 1];
  try {
    const answer = await window.codega.sendMessage(text);
    placeholder.text = answer.text;
  } catch (error) {
    placeholder.text = `Bir aksama oldu: ${error.message || error}`;
  }
  renderConversation();
});

els.input.addEventListener("input", () => {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(140, els.input.scrollHeight)}px`;
});

els.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    els.form.requestSubmit();
  }
});

document.getElementById("new-chat").addEventListener("click", () => createChat());
els.settingsButton.addEventListener("click", () => els.settings.showModal());
els.prepareModel.addEventListener("click", async () => {
  els.prepareModel.disabled = true;
  els.modelDetail.textContent = "Model hazÄ±rlanÄ±yor...";
  try {
    const status = await window.codega.prepareModel();
    setModelStatus(status);
  } finally {
    els.prepareModel.disabled = false;
  }
});
els.checkUpdate.addEventListener("click", () => window.codega.checkForUpdates());
els.downloadUpdate.addEventListener("click", () => window.codega.downloadUpdate());
els.installUpdate.addEventListener("click", () => window.codega.installUpdate());

window.codega.onModelStatus(setModelStatus);
window.codega.onUpdateStatus((payload) => {
  const state = payload?.state || "unknown";
  els.updateDetail.textContent = `Durum: ${state}`;
  if (state === "available") {
    els.updateActions.hidden = false;
    els.installUpdate.hidden = true;
  }
  if (state === "ready") {
    els.updateActions.hidden = false;
    els.installUpdate.hidden = false;
  }
});

createChat();
refreshStatus();
