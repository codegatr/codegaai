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

  // Timeout'lu fetch yardımcısı
  async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(timer);
      return r;
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") throw new Error(`Zaman aşımı (${timeoutMs/1000}s)`);
      throw e;
    }
  }

  async function loadSystemCheck() {
    const tableEl = document.getElementById("system-table");
    const overallEl = document.getElementById("system-overall");
    if (!tableEl) return;

    tableEl.innerHTML = '<div class="system-row system-row--loading">Yükleniyor...</div>';

    try {
      const r = await fetchWithTimeout("/api/system/check", {}, 6000);
      const data = await r.json();

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
      const r = await fetchWithTimeout("/api/system/engines", {}, 6000);
      const data = await r.json();

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
      const isAvx = llmEngine.error && llmEngine.error.toLowerCase().includes("avx2");
      text.textContent = isAvx ? "CPU uyumsuzluğu (AVX2)" : "Yükleme hatası";
      if (statusText) statusText.textContent = isAvx
        ? "Motor: CPU AVX2 desteklemiyor — fix_llama.bat çalıştır"
        : "Motor: hata";
      // Hata kutusunu göster
      const errBox = document.getElementById("llm-error-box");
      if (errBox) {
        errBox.hidden = false;
        errBox.innerHTML = isAvx
          ? `<strong>⚠️ CPU Uyumsuzluğu</strong><br>
             llama-cpp-python AVX2 gerektiriyor, işlemcinizde bu özellik yok.<br>
             <strong>Çözüm:</strong> CODEGA AI kurulum klasöründeki <code>fix_llama.bat</code> dosyasını yönetici olarak çalıştırın.`
          : `<strong>Hata:</strong> ${llmEngine.error || "Bilinmeyen hata"}`;
      }
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

  // ============================================================
  // Disk Yönetimi
  // ============================================================

  async function loadDisks() {
    const diskList = document.getElementById("disk-list");
    const currentEl = document.getElementById("models-dir-current");
    if (!diskList) return;

    diskList.innerHTML = '<p class="form-hint">Diskler taranıyor...</p>';

    try {
      const r = await fetchWithTimeout("/api/system/disks", {}, 8000);
      const d = await r.json();

      if (currentEl) currentEl.textContent = d.current_models_dir || "—";

      if (!d.disks || !d.disks.length) {
        diskList.innerHTML = '<p class="form-hint">Disk listesi alınamadı</p>';
        return;
      }

      diskList.innerHTML = d.disks.map(disk => {
        const isCurrent = d.current_models_dir?.startsWith(disk.path);
        const pct = disk.used_pct;
        const barColor = pct > 85 ? "var(--color-danger)" :
                         pct > 60 ? "var(--color-accent)" : "var(--color-success)";
        return `
          <div class="disk-item ${isCurrent ? "disk-item--active" : ""}">
            <div class="disk-item__info">
              <strong>${disk.label}</strong>
              <span class="form-hint">${disk.free_gb} GB boş / ${disk.total_gb} GB</span>
            </div>
            <div class="disk-bar-wrap">
              <div class="disk-bar" style="width:${pct}%;background:${barColor}"></div>
            </div>
            <button class="btn btn--ghost disk-select-btn"
                    data-path="${disk.path}CODEGA_Models"
                    ${isCurrent ? "disabled" : ""}>
              ${isCurrent ? "✓ Seçili" : "Bu Diski Seç"}
            </button>
          </div>`;
      }).join("");

      // Disk seç butonları
      diskList.querySelectorAll(".disk-select-btn:not([disabled])").forEach(btn => {
        btn.addEventListener("click", () => setModelsDir(btn.dataset.path));
      });

    } catch (e) {
      diskList.innerHTML = `<p class="form-hint">Hata: ${e.message}</p>`;
    }
  }

  async function setModelsDir(path) {
    const resultEl = document.getElementById("models-dir-result");
    if (resultEl) resultEl.textContent = "Değiştiriliyor...";

    try {
      const r = await fetch("/api/system/models-dir", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path}),
      });
      const d = await r.json();

      if (d.ok) {
        if (resultEl) resultEl.innerHTML =
          `✅ Değiştirildi: <code>${d.new_path}</code> — ${d.message}`;
        loadDisks(); // yenile
      } else {
        if (resultEl) resultEl.textContent = `❌ ${d.error}`;
      }
    } catch (e) {
      if (resultEl) resultEl.textContent = `❌ ${e.message}`;
    }
  }

  function init() {
    document.getElementById("system-refresh")
      ?.addEventListener(\"click\", () => {
        loadSystemCheck();
        loadEngines();
        loadDisks();
      });

    // Özel yol butonu
    document.getElementById("set-models-dir-btn")
      ?.addEventListener("click", () => {
        const path = document.getElementById("custom-models-dir")?.value?.trim();
        if (path) setModelsDir(path);
      });

    Views.on((name) => {
      if (name === "system") {
        loadSystemCheck();
        loadEngines();
        loadDisks();
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
