/* ============================================================
   CODEGA AI - Model Yönetimi (Sistem sayfasında)
   ============================================================
   İndirme, yükleme, silme, ilerleme takibi.
   ============================================================ */

const Models = (() => {
  const state = {
    items: [],
    pollTimers: {},  // model_id -> interval id
  };

  let elGrid;

  // ---------- Yardımcılar ----------

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(v < 10 && i > 0 ? 1 : 0) + " " + units[i];
  }

  function fmtSpeed(bps) {
    if (!bps) return "";
    return fmtBytes(bps) + "/s";
  }

  // ---------- Render ----------

  function render() {
    if (!elGrid) return;

    if (state.items.length === 0) {
      elGrid.innerHTML = '<div class="engine-row engine-row--loading">Model yok</div>';
      return;
    }

    elGrid.innerHTML = "";
    for (const m of state.items) {
      elGrid.appendChild(renderCard(m));
    }
  }

  function renderCard(m) {
    const card = document.createElement("div");
    card.className = "model-card";
    card.dataset.modelId = m.id;

    // Durum etiketi
    let statusLabel = "İndirilmedi";
    let statusClass = "scheduled";
    if (m.loaded) {
      statusLabel = "Yüklü";
      statusClass = "ok";
    } else if (m.downloaded) {
      statusLabel = "Hazır (yüklenmedi)";
      statusClass = "pending";
    } else if (m.download && m.download.status === "downloading") {
      statusLabel = `İndiriliyor ${m.download.percent.toFixed(1)}%`;
      statusClass = "pending";
    } else if (m.download && m.download.status === "error") {
      statusLabel = "Hata";
      statusClass = "err";
    }

    // Aksiyon butonları
    const actions = document.createElement("div");
    actions.className = "model-card__actions";

    if (m.loaded) {
      actions.appendChild(button("Bellekten çıkar", "ghost", () => unload(m.id)));
      actions.appendChild(button("Sil", "ghost danger", () => del(m.id)));
    } else if (m.downloaded) {
      actions.appendChild(button("Yükle", "primary", () => load(m.id)));
      actions.appendChild(button("Sil", "ghost danger", () => del(m.id)));
    } else if (m.download && m.download.status === "downloading") {
      actions.appendChild(button("İptal", "ghost danger", () => cancel(m.id)));
    } else {
      const sizeText = `İndir (${m.size_gb} GB)`;
      actions.appendChild(button(sizeText, "primary", () => download(m.id)));
    }

    // Kart gövdesi
    card.innerHTML = `
      <div class="model-card__header">
        <div>
          <div class="model-card__name">${escapeHTML(m.name)}${m.default ? ' <span class="badge">Varsayılan</span>' : ''}</div>
          <div class="model-card__id">${escapeHTML(m.id)}</div>
        </div>
        <span class="status-pill status-pill--${statusClass}">
          <span class="status-pill__dot"></span>
          ${escapeHTML(statusLabel)}
        </span>
      </div>
      <div class="model-card__meta">
        <span><strong>${m.size_gb} GB</strong> indirme</span>
        <span><strong>${m.vram_gb} GB</strong> VRAM</span>
        ${m.context_length ? `<span><strong>${(m.context_length/1024).toFixed(0)}K</strong> bağlam</span>` : ""}
        ${m.languages ? `<span>${m.languages.length} dil</span>` : ""}
      </div>
      ${m.description ? `<div class="model-card__desc">${escapeHTML(m.description)}</div>` : ""}
    `;

    // İndirme ilerlemesi
    if (m.download && m.download.status === "downloading") {
      const bar = document.createElement("div");
      bar.className = "progress-bar";
      bar.innerHTML = `
        <div class="progress-bar__fill" style="width: ${m.download.percent}%"></div>
        <div class="progress-bar__text">
          ${fmtBytes(m.download.downloaded)} / ${fmtBytes(m.download.total)}
          ${m.download.speed_bps ? "· " + fmtSpeed(m.download.speed_bps) : ""}
        </div>
      `;
      card.appendChild(bar);
    } else if (m.download && m.download.status === "error") {
      const err = document.createElement("div");
      err.className = "model-card__error";
      err.textContent = "Hata: " + (m.download.error || "bilinmiyor");
      card.appendChild(err);
    }

    card.appendChild(actions);
    return card;
  }

  function button(label, variant, onClick) {
    const btn = document.createElement("button");
    btn.className = "btn btn--" + variant.split(" ").join(" btn--");
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  // ---------- Aksiyonlar ----------

  async function reload() {
    try {
      const data = await API.modelsAll();
      const llm = (data.llm || []).map(m => ({...m, kind: "llm"}));
      const emb = (data.embedding || []).map(m => ({...m, kind: "embedding"}));
      state.items = [...llm, ...emb];
      render();
    } catch (err) {
      console.error("Model listesi yüklenemedi:", err);
      if (elGrid) {
        elGrid.innerHTML = `<div class="engine-row">Hata: ${escapeHTML(err.message)}</div>`;
      }
    }
  }

  async function download(id) {
    try {
      await API.modelDownload(id);
      reload();
      startPolling(id);
    } catch (err) {
      alert("İndirme başlatılamadı: " + err.message);
    }
  }

  async function cancel(id) {
    if (!confirm("İndirmeyi iptal et?")) return;
    try {
      await API.modelCancel(id);
      stopPolling(id);
      reload();
    } catch (err) {
      alert("İptal başarısız: " + err.message);
    }
  }

  async function load(id) {
    try {
      // UI'da yükleniyor göstergesi
      const item = state.items.find(m => m.id === id);
      if (item) item._loading = true;
      render();

      await API.modelLoad(id);
      reload();

      // Status bar'ı güncelle
      System?.refresh();
    } catch (err) {
      alert("Yükleme başarısız: " + err.message);
      reload();
    }
  }

  async function unload(id) {
    try {
      await API.modelUnload(id);
      reload();
      System?.refresh();
    } catch (err) {
      alert("Boşaltma başarısız: " + err.message);
    }
  }

  async function del(id) {
    if (!confirm("Modeli diskten sil? Yeniden indirmen gerekecek.")) return;
    try {
      await API.modelDelete(id);
      reload();
    } catch (err) {
      alert("Silme başarısız: " + err.message);
    }
  }

  // ---------- İndirme ilerlemesi polling ----------

  function startPolling(id) {
    if (state.pollTimers[id]) return;
    state.pollTimers[id] = setInterval(async () => {
      try {
        const data = await API.modelStatus(id);
        const item = state.items.find(m => m.id === id);
        if (item) {
          item.download = data.download;
          item.downloaded = data.downloaded;
          item.loaded = data.loaded;
          render();
        }
        if (data.download.status === "completed" ||
            data.download.status === "error" ||
            data.download.status === "cancelled") {
          stopPolling(id);
          reload();
        }
      } catch (err) {
        console.error("Status polling error:", err);
      }
    }, 1000);
  }

  function stopPolling(id) {
    if (state.pollTimers[id]) {
      clearInterval(state.pollTimers[id]);
      delete state.pollTimers[id];
    }
  }

  // ---------- Init ----------

  function init() {
    elGrid = document.getElementById("models-grid");

    Views.on((name) => {
      if (name === "system") {
        reload();
        // Halen indirilenleri polla
        for (const m of state.items) {
          if (m.download && m.download.status === "downloading") {
            startPolling(m.id);
          }
        }
      }
    });
  }

  return { init, reload };
})();

window.Models = Models;
