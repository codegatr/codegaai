/* ============================================================
   CODEGA AI - Görsel Üretim (Faz 4)
   ============================================================ */

const ImageView = (() => {
  let elPrompt, elNegative, elSteps, elStepsVal, elGuidance, elGuidanceVal;
  let elWidth, elHeight, elCount, elSeed, elBtn, elStatus, elGallery;
  let elPill, elPillText;

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtMs(ms) {
    if (ms < 1000) return ms + " ms";
    return (ms / 1000).toFixed(1) + " sn";
  }

  // ---------- Engine durumu ----------

  async function refreshEngine() {
    try {
      const data = await API.engines();
      const img = data.image || {state:"unloaded", active:false};

      elPill.classList.remove("status-pill--pending", "status-pill--ok",
                              "status-pill--scheduled", "status-pill--err");

      if (img.active) {
        elPill.classList.add("status-pill--ok");
        const backend = (img.backend || "?").toUpperCase();
        elPillText.textContent = `${img.model_id} · ${backend}`;
        elBtn.disabled = false;
      } else if (img.state === "loading") {
        elPill.classList.add("status-pill--pending");
        elPillText.textContent = "Model yükleniyor...";
        elBtn.disabled = true;
      } else if (img.state === "error") {
        elPill.classList.add("status-pill--err");
        elPillText.textContent = "Yükleme hatası";
        elBtn.disabled = true;
      } else {
        elPill.classList.add("status-pill--scheduled");
        elPillText.textContent = "model yüklü değil — Sistem'den indir";
        elBtn.disabled = true;
      }
    } catch (err) {
      console.error("engine refresh error:", err);
    }
  }

  // ---------- Üretim ----------

  async function generate() {
    const prompt = elPrompt.value.trim();
    if (!prompt) {
      elStatus.textContent = "Önce bir prompt yaz.";
      elStatus.className = "image-status image-status--err";
      return;
    }

    elBtn.disabled = true;
    elStatus.textContent = "Üretiliyor... bu biraz sürebilir.";
    elStatus.className = "image-status image-status--working";

    const seed = elSeed.value ? parseInt(elSeed.value, 10) : null;

    const t0 = Date.now();
    try {
      const data = await fetch("/api/image/generate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          prompt: prompt,
          negative_prompt: elNegative.value,
          steps: parseInt(elSteps.value, 10),
          guidance: parseFloat(elGuidance.value),
          width: parseInt(elWidth.value, 10),
          height: parseInt(elHeight.value, 10),
          num_images: parseInt(elCount.value, 10),
          seed: seed,
        }),
      }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));

      const elapsed = Date.now() - t0;
      elStatus.textContent = `${data.images.length} görsel üretildi (${fmtMs(data.timing_ms || elapsed)})`;
      elStatus.className = "image-status image-status--ok";

      // Yeni görselleri galeriye ekle
      reload();
    } catch (err) {
      const msg = err.detail || err.message || JSON.stringify(err);
      elStatus.textContent = "Hata: " + msg;
      elStatus.className = "image-status image-status--err";
      console.error("Generate error:", err);
    } finally {
      elBtn.disabled = false;
    }
  }

  // ---------- Galeri ----------

  async function reload() {
    try {
      const data = await fetch("/api/image/list?limit=24")
        .then(r => r.json());

      if (!data.images || data.images.length === 0) {
        elGallery.innerHTML = '<div class="image-gallery__empty">Henüz görsel yok</div>';
        return;
      }

      elGallery.innerHTML = data.images.map(img => `
        <div class="image-card" data-id="${escapeHTML(img.id)}">
          <a href="${img.url}" target="_blank">
            <img src="${img.url}" alt="${escapeHTML(img.filename)}" loading="lazy">
          </a>
          <div class="image-card__actions">
            <a class="btn btn--ghost btn--small" href="${img.url}" download>İndir</a>
            <button class="btn btn--ghost btn--danger btn--small"
              onclick="ImageView.del('${escapeHTML(img.id)}')">Sil</button>
          </div>
        </div>
      `).join("");
    } catch (err) {
      console.error("Gallery load error:", err);
    }
  }

  async function del(id) {
    if (!confirm("Görseli sil?")) return;
    try {
      await fetch(`/api/image/${id}`, {method: "DELETE"});
      reload();
    } catch (err) {
      alert("Silme başarısız: " + err.message);
    }
  }

  // ---------- Init ----------

  function init() {
    elPrompt = document.getElementById("image-prompt");
    elNegative = document.getElementById("image-negative");
    elSteps = document.getElementById("image-steps");
    elStepsVal = document.getElementById("image-steps-val");
    elGuidance = document.getElementById("image-guidance");
    elGuidanceVal = document.getElementById("image-guidance-val");
    elWidth = document.getElementById("image-width");
    elHeight = document.getElementById("image-height");
    elCount = document.getElementById("image-count");
    elSeed = document.getElementById("image-seed");
    elBtn = document.getElementById("image-generate-btn");
    elStatus = document.getElementById("image-status");
    elGallery = document.getElementById("image-gallery");
    elPill = document.getElementById("image-engine-pill");
    elPillText = document.getElementById("image-engine-status");

    if (!elPrompt) return;  // Bu sayfa yok

    elSteps.addEventListener("input", () => {
      elStepsVal.textContent = elSteps.value;
    });
    elGuidance.addEventListener("input", () => {
      elGuidanceVal.textContent = elGuidance.value;
    });
    elBtn.addEventListener("click", generate);

    Views.on((name) => {
      if (name === "image") {
        refreshEngine();
        reload();
      }
    });
  }

  return { init, reload, del };
})();

window.ImageView = ImageView;
