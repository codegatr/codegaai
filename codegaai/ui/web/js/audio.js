/* ============================================================
   CODEGA AI - Ses (TTS + ASR) - Faz 5
   ============================================================ */

const AudioView = (() => {
  let elTtsText, elTtsLang, elTtsBtn, elTtsStatus, elTtsList;
  let elAsrFile, elAsrLang, elAsrTask, elAsrBtn, elAsrStatus, elAsrResult;
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
      const audio = data.audio || {tts:{ready:false}, asr:{ready:false}};
      const tts = audio.tts || {};
      const asr = audio.asr || {};

      elPill.classList.remove("status-pill--pending", "status-pill--ok",
                              "status-pill--scheduled", "status-pill--err");

      const ttsReady = tts.ready;
      const asrReady = asr.ready;

      if (ttsReady && asrReady) {
        elPill.classList.add("status-pill--ok");
        elPillText.textContent = `TTS + ASR yüklü`;
      } else if (ttsReady || asrReady) {
        elPill.classList.add("status-pill--ok");
        const which = ttsReady ? "TTS" : "ASR";
        elPillText.textContent = `${which} yüklü, diğeri Sistem'den yüklenmeli`;
      } else {
        elPill.classList.add("status-pill--scheduled");
        elPillText.textContent = "TTS/ASR yüklü değil — Sistem'den indir";
      }

      elTtsBtn.disabled = !ttsReady;
      elAsrBtn.disabled = !asrReady;
    } catch (err) {
      console.error("audio engine refresh:", err);
    }
  }

  // ---------- TTS ----------

  async function ttsSynthesize() {
    const text = elTtsText.value.trim();
    if (!text) {
      elTtsStatus.textContent = "Önce metin gir.";
      elTtsStatus.className = "image-status image-status--err";
      return;
    }

    elTtsBtn.disabled = true;
    elTtsStatus.textContent = "Sentezleniyor...";
    elTtsStatus.className = "image-status image-status--working";

    try {
      const data = await fetch("/api/audio/tts", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          text: text,
          language: elTtsLang.value,
        }),
      }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));

      elTtsStatus.textContent = `Hazır (${fmtMs(data.timing_ms)})`;
      elTtsStatus.className = "image-status image-status--ok";
      reloadTTSList();
    } catch (err) {
      const msg = err.detail || err.message || JSON.stringify(err);
      elTtsStatus.textContent = "Hata: " + msg;
      elTtsStatus.className = "image-status image-status--err";
    } finally {
      elTtsBtn.disabled = false;
    }
  }

  async function reloadTTSList() {
    try {
      const data = await fetch("/api/audio/list?limit=20").then(r => r.json());
      if (!data.files || data.files.length === 0) {
        elTtsList.innerHTML = '<div class="image-gallery__empty">Henüz ses yok</div>';
        return;
      }

      elTtsList.innerHTML = data.files.map(f => `
        <div class="audio-item" data-id="${escapeHTML(f.id)}">
          <audio controls src="${f.url}" preload="none"></audio>
          <div class="audio-item__meta">
            <span class="form-hint">${escapeHTML(f.filename)}</span>
            <button class="btn btn--ghost btn--small btn--danger"
              onclick="AudioView.delTts('${escapeHTML(f.id)}')">Sil</button>
          </div>
        </div>
      `).join("");
    } catch (err) {
      console.error("TTS list error:", err);
    }
  }

  async function delTts(id) {
    if (!confirm("Ses dosyasını sil?")) return;
    try {
      await fetch(`/api/audio/${id}`, {method: "DELETE"});
      reloadTTSList();
    } catch (err) {
      alert("Silme başarısız: " + err.message);
    }
  }

  // ---------- ASR ----------

  async function asrTranscribe() {
    const file = elAsrFile.files[0];
    if (!file) {
      elAsrStatus.textContent = "Önce bir ses dosyası seç.";
      elAsrStatus.className = "image-status image-status--err";
      return;
    }

    elAsrBtn.disabled = true;
    elAsrStatus.textContent = `${file.name} işleniyor...`;
    elAsrStatus.className = "image-status image-status--working";
    elAsrResult.innerHTML = "";

    const fd = new FormData();
    fd.append("audio", file);
    if (elAsrLang.value) fd.append("language", elAsrLang.value);
    fd.append("task", elAsrTask.value);

    try {
      const data = await fetch("/api/audio/asr", {
        method: "POST",
        body: fd,
      }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));

      elAsrStatus.textContent =
        `Tamamlandı (${data.language}, %${(data.language_probability*100).toFixed(0)}, ` +
        `${data.duration_sec}sn → ${fmtMs(data.timing_ms)})`;
      elAsrStatus.className = "image-status image-status--ok";

      const segHtml = (data.segments || []).map(s => `
        <div class="asr-segment">
          <span class="asr-segment__time">${s.start.toFixed(1)} – ${s.end.toFixed(1)}</span>
          <span class="asr-segment__text">${escapeHTML(s.text)}</span>
        </div>
      `).join("");

      elAsrResult.innerHTML = `
        <div class="asr-text">
          <h4 class="asr-text__title">Tam metin</h4>
          <p>${escapeHTML(data.text)}</p>
          <button class="btn btn--ghost btn--small"
            onclick="AudioView.copyText(${JSON.stringify(data.text).replace(/"/g, '&quot;')})">Kopyala</button>
        </div>
        <div class="asr-segments">
          <h4 class="asr-text__title">Segmentler (${data.segments.length})</h4>
          ${segHtml}
        </div>
      `;
    } catch (err) {
      const msg = err.detail || err.message || JSON.stringify(err);
      elAsrStatus.textContent = "Hata: " + msg;
      elAsrStatus.className = "image-status image-status--err";
    } finally {
      elAsrBtn.disabled = false;
    }
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(
      () => alert("Kopyalandı."),
      () => alert("Kopyalama başarısız")
    );
  }

  // ---------- Init ----------

  function init() {
    elTtsText = document.getElementById("tts-text");
    elTtsLang = document.getElementById("tts-language");
    elTtsBtn = document.getElementById("tts-btn");
    elTtsStatus = document.getElementById("tts-status");
    elTtsList = document.getElementById("tts-list");

    elAsrFile = document.getElementById("asr-file");
    elAsrLang = document.getElementById("asr-language");
    elAsrTask = document.getElementById("asr-task");
    elAsrBtn = document.getElementById("asr-btn");
    elAsrStatus = document.getElementById("asr-status");
    elAsrResult = document.getElementById("asr-result");

    elPill = document.getElementById("audio-engine-pill");
    elPillText = document.getElementById("audio-engine-status");

    if (!elTtsText) return;

    elTtsBtn.addEventListener("click", ttsSynthesize);
    elAsrBtn.addEventListener("click", asrTranscribe);

    Views.on((name) => {
      if (name === "audio") {
        refreshEngine();
        reloadTTSList();
      }
    });
  }

  return { init, delTts, copyText };
})();

window.AudioView = AudioView;
