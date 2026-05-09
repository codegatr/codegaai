/* ============================================================
   CODEGA AI - Video Üretim (Faz 6)
   ============================================================ */

const VideoView = (() => {
  let elPrompt, elNegative, elFrames, elFramesVal, elFps, elFpsVal;
  let elSteps, elStepsVal, elGuidance, elGuidanceVal;
  let elWidth, elHeight, elSeed, elBtn, elStatus, elGallery;
  let elPill, elPillText;

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtMs(ms) {
    if (ms < 1000) return ms + " ms";
    if (ms < 60000) return (ms / 1000).toFixed(1) + " sn";
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')} dk`;
  }

  async function refreshEngine() {
    try {
      const data = await API.engines();
      const v = data.video || {state:"unloaded", active:false};

      elPill.classList.remove("status-pill--pending", "status-pill--ok",
                              "status-pill--scheduled", "status-pill--err");

      if (v.active) {
        elPill.classList.add("status-pill--ok");
        const backend = (v.backend || "?").toUpperCase();
        elPillText.textContent = `${v.model_id} · ${backend}`;
        elBtn.disabled = false;
      } else if (v.state === "loading" || v.state === "generating") {
        elPill.classList.add("status-pill--pending");
        elPillText.textContent = v.state === "loading" ? "Yükleniyor..." : "Üretiliyor...";
        elBtn.disabled = true;
      } else if (v.state === "error") {
        elPill.classList.add("status-pill--err");
        elPillText.textContent = "Yükleme hatası";
        elBtn.disabled = true;
      } else {
        elPill.classList.add("status-pill--scheduled");
        elPillText.textContent = "model yüklü değil — Sistem'den indir";
        elBtn.disabled = true;
      }
    } catch (err) {
      console.error("video engine refresh:", err);
    }
  }

  async function generate() {
    const prompt = elPrompt.value.trim();
    if (!prompt) {
      elStatus.textContent = "Önce bir prompt yaz.";
      elStatus.className = "image-status image-status--err";
      return;
    }

    elBtn.disabled = true;
    elStatus.textContent = "Video üretiliyor... bu uzun sürer (3060'ta 1-3 dakika).";
    elStatus.className = "image-status image-status--working";

    const seed = elSeed.value ? parseInt(elSeed.value, 10) : null;
    const t0 = Date.now();

    try {
      const data = await fetch("/api/video/generate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          prompt: prompt,
          negative_prompt: elNegative.value,
          steps: parseInt(elSteps.value, 10),
          guidance: parseFloat(elGuidance.value),
          frames: parseInt(elFrames.value, 10),
          fps: parseInt(elFps.value, 10),
          width: parseInt(elWidth.value, 10),
          height: parseInt(elHeight.value, 10),
          seed: seed,
        }),
      }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));

      const elapsed = Date.now() - t0;
      elStatus.textContent = `${data.frames} kare üretildi @ ${data.fps} fps ` +
        `(${data.duration_sec}sn video, ${fmtMs(data.timing_ms || elapsed)})`;
      elStatus.className = "image-status image-status--ok";
      reload();
    } catch (err) {
      const msg = err.detail || err.message || JSON.stringify(err);
      elStatus.textContent = "Hata: " + msg;
      elStatus.className = "image-status image-status--err";
    } finally {
      elBtn.disabled = false;
    }
  }

  async function reload() {
    try {
      const data = await fetch("/api/video/list?limit=20").then(r => r.json());

      if (!data.videos || data.videos.length === 0) {
        elGallery.innerHTML = '<div class="image-gallery__empty">Henüz video yok</div>';
        return;
      }

      elGallery.innerHTML = data.videos.map(v => `
        <div class="video-card" data-id="${escapeHTML(v.id)}">
          <video controls preload="metadata" src="${v.url}"></video>
          <div class="video-card__meta">
            <span class="form-hint">${(v.size_bytes/1024/1024).toFixed(1)} MB</span>
            <div class="video-card__actions">
              <a class="btn btn--ghost btn--small" href="${v.url}" download>İndir</a>
              <button class="btn btn--ghost btn--small btn--danger"
                onclick="VideoView.del('${escapeHTML(v.id)}')">Sil</button>
            </div>
          </div>
        </div>
      `).join("");
    } catch (err) {
      console.error("Video gallery load:", err);
    }
  }

  async function del(id) {
    if (!confirm("Video sil?")) return;
    try {
      await fetch(`/api/video/${id}`, {method: "DELETE"});
      reload();
    } catch (err) {
      alert("Silme başarısız: " + err.message);
    }
  }

  function init() {
    elPrompt = document.getElementById("video-prompt");
    elNegative = document.getElementById("video-negative");
    elFrames = document.getElementById("video-frames");
    elFramesVal = document.getElementById("video-frames-val");
    elFps = document.getElementById("video-fps");
    elFpsVal = document.getElementById("video-fps-val");
    elSteps = document.getElementById("video-steps");
    elStepsVal = document.getElementById("video-steps-val");
    elGuidance = document.getElementById("video-guidance");
    elGuidanceVal = document.getElementById("video-guidance-val");
    elWidth = document.getElementById("video-width");
    elHeight = document.getElementById("video-height");
    elSeed = document.getElementById("video-seed");
    elBtn = document.getElementById("video-generate-btn");
    elStatus = document.getElementById("video-status");
    elGallery = document.getElementById("video-gallery");
    elPill = document.getElementById("video-engine-pill");
    elPillText = document.getElementById("video-engine-status");

    if (!elPrompt) return;

    elFrames.addEventListener("input", () => elFramesVal.textContent = elFrames.value);
    elFps.addEventListener("input", () => elFpsVal.textContent = elFps.value);
    elSteps.addEventListener("input", () => elStepsVal.textContent = elSteps.value);
    elGuidance.addEventListener("input", () => elGuidanceVal.textContent = elGuidance.value);
    elBtn.addEventListener("click", generate);

    Views.on((name) => {
      if (name === "video") {
        refreshEngine();
        reload();
      }
    });
  }

  return { init, reload, del };
})();

window.VideoView = VideoView;
