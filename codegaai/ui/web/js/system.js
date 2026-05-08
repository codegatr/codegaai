/* ============================================================
   CODEGA AI - Sistem & Ayarlar
   ============================================================ */

const System = (() => {

  const STATUS_LABELS = {
    ok:    { sym: "✓", cls: "ok",   text: "Hazır" },
    warn:  { sym: "!", cls: "warn", text: "Uyarı" },
    fail:  { sym: "✗", cls: "fail", text: "Hata" },
    info:  { sym: "i", cls: "info", text: "Bilgi" },
  };

  const OVERALL_PILL = {
    ok:   { cls: "status-pill--ok",      text: "Sistem hazır" },
    warn: { cls: "status-pill--warn",    text: "Uyarılar var" },
    fail: { cls: "status-pill--err",     text: "Sistem hazır değil" },
  };

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  // ---------- Sistem kontrolü tablosu ----------

  async function loadSystemCheck() {
    const tableEl = document.getElementById("system-table");
    const overallEl = document.getElementById("system-overall");
    if (!tableEl) return;

    tableEl.innerHTML = '<div class="system-row system-row--loading">Yükleniyor...</div>';

    try {
      const data = await API.check();

      // Overall pill
      if (overallEl) {
        const o = OVERALL_PILL[data.overall] || OVERALL_PILL.warn;
        overallEl.className = `status-pill ${o.cls}`;
        overallEl.innerHTML = `
          <span class="status-pill__dot"></span>
          <span>${escapeHTML(o.text)}</span>
        `;
      }

      // Sistem satırları
      tableEl.innerHTML = "";
      for (const r of (data.results || [])) {
        const meta = STATUS_LABELS[r.status] || STATUS_LABELS.info;
        const row = document.createElement("div");
        row.className = `system-row system-row--${meta.cls}`;
        row.innerHTML = `
          <span class="system-row__icon">${meta.sym}</span>
          <span class="system-row__name">${escapeHTML(r.name)}</span>
          <span class="system-row__msg">${escapeHTML(r.message || "")}</span>
        `;
        tableEl.appendChild(row);
      }
    } catch (err) {
      tableEl.innerHTML = `
        <div class="system-row system-row--fail">
          <span class="system-row__icon">✗</span>
          <span class="system-row__name">Hata</span>
          <span class="system-row__msg">${escapeHTML(err.message)}</span>
        </div>
      `;
    }
  }

  // ---------- Motor durumu ----------

  async function loadEngines() {
    const listEl = document.getElementById("engines-list");
    if (!listEl) return;

    listEl.innerHTML = '<div class="engine-row engine-row--loading">Yükleniyor...</div>';

    try {
      const data = await API.engines();

      // Sohbet header'ındaki motor pill'ini güncelle
      updateChatPill(data.llm);

      listEl.innerHTML = "";

      const ENGINE_LABELS = {
        llm:      "LLM (Sohbet + Kod)",
        image:    "Görsel Üretimi",
        audio:    "Ses (TTS + ASR)",
        video:    "Video Üretimi",
        memory:   "RAG Bellek",
        learning: "Self-Learning Loop",
      };

      for (const [key, info] of Object.entries(data)) {
        const row = document.createElement("div");
        row.className = "engine-row";

        const pillClass = info.active ? "status-pill--ok" : "status-pill--scheduled";
        const pillText = info.active ? "Aktif" : "Beklemede";

        row.innerHTML = `
          <div class="engine-row__name">
            <span>${escapeHTML(ENGINE_LABELS[key] || key)}</span>
            <span class="engine-row__reason">${escapeHTML(info.reason || "")}</span>
          </div>
          <span class="status-pill ${pillClass}">
            <span class="status-pill__dot"></span>
            ${escapeHTML(pillText)}
          </span>
        `;
        listEl.appendChild(row);
      }
    } catch (err) {
      listEl.innerHTML = `
        <div class="engine-row">
          <div class="engine-row__name">Hata: ${escapeHTML(err.message)}</div>
        </div>
      `;
    }
  }

  function updateChatPill(llmEngine) {
    const pill = document.getElementById("chat-engine-pill");
    const text = document.getElementById("chat-engine-status");
    const statusText = document.getElementById("status-engine");
    if (!pill || !text) return;

    pill.classList.remove("status-pill--pending", "status-pill--ok",
                          "status-pill--scheduled", "status-pill--err");

    if (llmEngine.active) {
      pill.classList.add("status-pill--ok");
      const backend = llmEngine.backend || "?";
      text.textContent = `${llmEngine.model_id} · ${backend.toUpperCase()}`;
      if (statusText) statusText.textContent = `Motor: ${llmEngine.model_id} (${backend})`;
    } else if (llmEngine.state === "loading") {
      pill.classList.add("status-pill--pending");
      text.textContent = "Model yükleniyor...";
      if (statusText) statusText.textContent = "Motor: yükleniyor";
    } else if (llmEngine.state === "error") {
      pill.classList.add("status-pill--err");
      text.textContent = "Yükleme hatası";
      if (statusText) statusText.textContent = "Motor: hata";
    } else {
      pill.classList.add("status-pill--scheduled");
      text.textContent = "model yüklü değil — Sistem'den indir";
      if (statusText) statusText.textContent = "Motor: bekleniyor";
    }
  }


  async function loadSettings() {
    try {
      const info = await API.info();

      setText("settings-version", `v${info.version}`);
      setText("settings-phase", info.phase);
      setText("brand-version", `v${info.version}`);

      if (info.models) {
        setText("settings-llm",       info.models.llm);
        setText("settings-embedding", info.models.embedding);
        setText("settings-image",     info.models.image);
        setText("settings-video",     info.models.video);
        setText("settings-tts",       info.models.tts);
        setText("settings-asr",       info.models.asr);
      }

      // Status bar
      setText("status-engine", `Motor: stub (Faz 2)`);
    } catch (err) {
      console.error("Ayarlar yüklenemedi:", err);
    }
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node && value !== undefined && value !== null) {
      node.textContent = value;
    }
  }

  // ---------- Saat ----------

  function startClock() {
    const node = document.getElementById("status-time");
    if (!node) return;
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      node.textContent = `${hh}:${mm}:${ss}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---------- Init ----------

  function init() {
    document.getElementById("system-refresh")
      ?.addEventListener("click", () => {
        loadSystemCheck();
        loadEngines();
      });

    Views.on((name) => {
      if (name === "system") {
        loadSystemCheck();
        loadEngines();
      }
    });

    // Başlangıçta arka planda yükle
    loadSettings();
    loadEngines();         // chat header pill için
    startClock();
  }

  return {
    init,
    refresh: () => { loadSystemCheck(); loadEngines(); loadSettings(); },
  };
})();

window.System = System;
