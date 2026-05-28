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
  modelList: document.getElementById("model-list"),
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
  scrollConversationToBottom();
}

function scrollConversationToBottom() {
  requestAnimationFrame(() => {
    els.conversation.scrollTop = els.conversation.scrollHeight;
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
  renderHistory();
  renderConversation();
  scrollConversationToBottom();
}

function setModelStatus(status) {
  const text = status?.message || "Model durumu bilinmiyor";
  els.modelPill.textContent = text;
  els.modelDetail.textContent = `${status?.provider || "instant"} · ${status?.model || "codega-instant"} · ${status?.status || "unknown"}`;
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

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = els.input.value.trim();
  if (!text) return;

  appendMessage("user", text);
  els.input.value = "";
  els.input.style.height = "auto";
  appendMessage("assistant", "Uygun model seçiliyor...");

  const chat = currentChat();
  const placeholder = chat.messages[chat.messages.length - 1];
  const slowNotice = setTimeout(() => {
    placeholder.text = "Yerel model beklenenden uzun düşünüyor. Cevap gelmezse kısa süre içinde güvenli şekilde durduracağım.";
    renderConversation();
    scrollConversationToBottom();
  }, 8000);
  try {
    const answer = await window.codega.sendMessage(text);
    placeholder.text = answer.text;
    await refreshModels();
  } catch (error) {
    placeholder.text = `Bir aksama oldu: ${error.message || error}`;
  } finally {
    clearTimeout(slowNotice);
  }
  renderConversation();
  scrollConversationToBottom();
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
els.settingsButton.addEventListener("click", async () => {
  els.settings.showModal();
  await refreshModels();
});
els.prepareModel.addEventListener("click", async () => {
  els.prepareModel.disabled = true;
  els.modelDetail.textContent = "Varsayılan model hazırlanıyor...";
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
  els.modelDetail.textContent = `${button.dataset.model} indiriliyor...`;
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
  els.updateDetail.textContent = "Güncelleme kontrol ediliyor...";
  try {
    await window.codega.checkForUpdates();
  } catch (error) {
    els.updateDetail.textContent = `Güncelleme kontrol edilemedi: ${error.message || error}`;
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
  }
  if (state === "ready") {
    els.updateActions.hidden = false;
    els.downloadUpdate.disabled = true;
    els.installUpdate.hidden = false;
  }
});

createChat();
refreshStatus();
