/* ============================================================
   CODEGA AI - Vision & Video Anlama (Faz 11)
   ============================================================ */

const Vision = (() => {

  let dropZone, fileInput, previewEl, previewImg, dropHint;
  let questionEl, analyzeBtn, ocrBtn, videoBtn, resultEl;
  let videoInput, intervalEl, transcribeBtn, transcriptEl;
  let statusText, modelGrid;
  let currentFile = null;
  let currentFileType = "image"; // image | video

  // ---------- Durum ----------

  async function loadStatus() {
    try {
      const r = await fetch("/api/vision/status");
      const d = await r.json();
      renderStatus(d);
    } catch (e) {}
  }

  function renderStatus(d) {
    if (!statusText) return;
    const vs = d.vision || {};
    if (vs.ready) {
      statusText.innerHTML = `✅ <strong>${vs.model_id}</strong> yüklü ve hazır (${vs.vram_gb} GB VRAM)`;
    } else if (vs.state === "loading") {
      statusText.textContent = "⏳ Vision modeli yükleniyor...";
    } else if (vs.state === "error") {
      statusText.innerHTML = `❌ Hata: ${vs.error}`;
    } else {
      statusText.textContent = "⚫ Vision modeli yüklü değil — Yükle butonuna bas";
    }

    const ocr = d.ocr || {};
    if (modelGrid) {
      modelGrid.innerHTML = `
        <div class="model-card" style="max-width:400px">
          <div class="model-card__header">
            <div>
              <div class="model-card__name">OCR Motoru</div>
              <div class="model-card__id">Görüntüden metin çıkarma</div>
            </div>
            <span class="status-pill ${ocr.available ? 'status-pill--ok' : 'status-pill--off'}">
              <span class="status-pill__dot"></span>
              ${ocr.available ? ocr.backend : "Kullanılamıyor"}
            </span>
          </div>
        </div>`;
    }
  }

  // Vision modelleri
  async function loadVisionModels() {
    try {
      const r = await fetch("/api/vision/models");
      const d = await r.json();
      if (!modelGrid) return;

      const statR = await fetch("/api/vision/status");
      const stat = await statR.json();
      const visionState = stat.vision?.state || "idle";
      const activeId = stat.vision?.model_id;
      const isAnyLoading = visionState === "loading";

      const cards = (d.models || []).map(m => {
        const isActive = activeId === m.id;
        const isLoaded = isActive && visionState === "ready";
        const isCurrentLoading = isActive && isAnyLoading;
        const statusClass = isLoaded ? "status-pill--ok" : (isCurrentLoading ? "status-pill--warn" : "status-pill--off");
        const label = isLoaded ? "Yüklü" : (isCurrentLoading ? "Yükleniyor" : "İndirilebilir");
        let action = `<button class="btn btn--primary" onclick="Vision.loadModel('${m.id}')" ${isAnyLoading ? "disabled" : ""}>İndir ve Yükle</button>`;
        if (isLoaded) action = '<button class="btn btn--ghost" onclick="Vision.unload()">Bellekten Çıkar</button>';
        if (isCurrentLoading) action = '<button class="btn btn--ghost" disabled>Yükleniyor...</button>';
        return `
          <div class="model-card">
            <div class="model-card__header">
              <div>
                <div class="model-card__name">${escapeHTML(m.name)}</div>
                <div class="model-card__id">${m.size_gb} GB · ${m.vram_gb} GB VRAM</div>
              </div>
              <span class="status-pill ${statusClass}">
                <span class="status-pill__dot"></span>
                ${label}
              </span>
            </div>
            <p class="model-card__desc">${escapeHTML(m.description)}</p>
            <div class="model-card__actions">
              ${action}
            </div>
          </div>`;
      });

      // OCR kartını da ekle
      const ocrCard = `
        <div class="model-card">
          <div class="model-card__header">
            <div>
              <div class="model-card__name">OCR (Metin Çıkarma)</div>
              <div class="model-card__id">EasyOCR veya Tesseract</div>
            </div>
            <span class="status-pill ${stat.ocr?.available ? 'status-pill--ok' : 'status-pill--off'}">
              <span class="status-pill__dot"></span>
              ${stat.ocr?.available ? stat.ocr.backend : "Eksik"}
            </span>
          </div>
          <p class="model-card__desc">Türkçe dahil 80+ dil. pip install easyocr ile kur.</p>
        </div>`;

      modelGrid.innerHTML = cards.join("") + ocrCard;

    } catch (e) {}
  }

  async function loadModel(modelId) {
    statusText.textContent = `⏳ ${modelId} yükleniyor...`;
    const resp = await fetch("/api/vision/load", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({model_id: modelId}),
    });
    const started = await resp.json().catch(() => ({}));
    if (started.error) {
      statusText.textContent = `Hata: ${started.error}`;
      loadVisionModels();
      return;
    }
    loadVisionModels();
    // Poll
    const poll = setInterval(async () => {
      const r = await fetch("/api/vision/status");
      const d = await r.json();
      renderStatus(d);
      loadVisionModels();
      if (d.vision.state === "ready" || d.vision.state === "error") {
        clearInterval(poll);
      }
    }, 1500);
  }

  async function unload() {
    await fetch("/api/vision/unload", {method: "POST"});
    loadStatus();
    loadVisionModels();
  }

  // ---------- Dosya Yükleme ----------

  function setupDrop() {
    if (!dropZone) return;

    dropZone.addEventListener("dragover", e => {
      e.preventDefault();
      dropZone.classList.add("vision-upload-area--drag");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("vision-upload-area--drag");
    });

    dropZone.addEventListener("drop", e => {
      e.preventDefault();
      dropZone.classList.remove("vision-upload-area--drag");
      const file = e.dataTransfer.files[0];
      if (file) setFile(file);
    });

    if (fileInput) {
      fileInput.addEventListener("change", () => {
        if (fileInput.files[0]) setFile(fileInput.files[0]);
      });
    }
  }

  function setFile(file) {
    currentFile = file;
    currentFileType = file.type.startsWith("video/") ? "video" : "image";
    if (videoBtn) videoBtn.hidden = currentFileType !== "video";

    const url = URL.createObjectURL(file);
    if (previewImg) previewImg.src = url;
    if (previewEl) previewEl.style.display = "block";
    if (dropHint) dropHint.style.display = "none";

    if (resultEl) { resultEl.hidden = true; resultEl.textContent = ""; }
  }

  // ---------- Analiz ----------

  async function analyzeImage() {
    if (!currentFile || currentFileType !== "image") {
      alert("Önce bir görüntü yükle"); return;
    }
    const question = questionEl?.value.trim() || "Bu görüntüde ne var? Detaylı anlat.";
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analiz ediliyor...";
    showResult("⏳ Vision modeli çalışıyor...");

    try {
      const form = new FormData();
      form.append("file", currentFile);
      form.append("question", question);
      form.append("max_tokens", "512");

      const r = await fetch("/api/vision/analyze", {method: "POST", body: form});
      const d = await r.json();

      if (d.answer) {
        showResult(`### Soru\n${question}\n\n### Yanıt\n${d.answer}\n\n*Model: ${d.model} · ${d.elapsed_ms}ms*`);
      } else {
        showResult(`**Hata**: ${JSON.stringify(d)}`);
      }
    } catch (e) {
      showResult(`**Hata**: ${e.message}`);
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "Analiz Et";
    }
  }

  async function extractOCR() {
    if (!currentFile || currentFileType !== "image") {
      alert("Önce bir görüntü yükle"); return;
    }
    ocrBtn.disabled = true;
    ocrBtn.textContent = "OCR çalışıyor...";
    showResult("⏳ Metin taranıyor...");

    try {
      const form = new FormData();
      form.append("file", currentFile);
      form.append("languages", "tr,en");

      const r = await fetch("/api/vision/ocr", {method: "POST", body: form});
      const d = await r.json();

      if (d.text) {
        showResult(`### OCR Sonucu (${d.backend})\n\`\`\`\n${d.text}\n\`\`\`\n*${d.elapsed_ms}ms*`);
      } else if (d.detail) {
        showResult(`**Hata**: ${d.detail}`);
      }
    } catch (e) {
      showResult(`**Hata**: ${e.message}`);
    } finally {
      ocrBtn.disabled = false;
      ocrBtn.textContent = "Metin Çıkar (OCR)";
    }
  }

  async function analyzeVideoFile() {
    if (!currentFile || currentFileType !== "video") {
      alert("Video yüklü değil"); return;
    }
    videoBtn.disabled = true;
    videoBtn.textContent = "Video analiz ediliyor...";
    showResult("⏳ Video kareleri analiz ediliyor...");

    try {
      const question = questionEl?.value.trim() || "Bu videoda ne oluyor?";
      const form = new FormData();
      form.append("file", currentFile);
      form.append("question", question);
      form.append("max_frames", "8");

      const r = await fetch("/api/vision/video/analyze", {method: "POST", body: form});
      const d = await r.json();

      if (d.summary) {
        let md = `### Video Analizi\n${d.summary}\n\n`;
        md += `*${d.analyzed_frames} kare analiz edildi, ${d.duration_s?.toFixed(1)}s video, ${d.elapsed_s?.toFixed(1)}s sürdü*`;
        showResult(md);
      } else if (d.error) {
        showResult(`**Hata**: ${d.error}`);
      }
    } catch (e) {
      showResult(`**Hata**: ${e.message}`);
    } finally {
      videoBtn.disabled = false;
      videoBtn.textContent = "Video Analiz";
    }
  }

  async function transcribeVideo() {
    const file = videoInput?.files?.[0];
    if (!file) { alert("Video seç"); return; }
    const interval = parseFloat(intervalEl?.value) || 30;

    transcribeBtn.disabled = true;
    transcribeBtn.textContent = "Transkript hazırlanıyor...";
    if (transcriptEl) { transcriptEl.hidden = false; transcriptEl.textContent = "⏳ Video işleniyor..."; }

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("interval_s", String(interval));

      const r = await fetch("/api/vision/video/transcribe", {method: "POST", body: form});
      const d = await r.json();

      if (transcriptEl) {
        transcriptEl.hidden = false;
        transcriptEl.textContent = d.transcript || "Transkript oluşturulamadı";
      }
    } catch (e) {
      if (transcriptEl) { transcriptEl.hidden = false; transcriptEl.textContent = `Hata: ${e.message}`; }
    } finally {
      transcribeBtn.disabled = false;
      transcribeBtn.textContent = "Transkript Oluştur";
    }
  }

  function showResult(text) {
    if (!resultEl) return;
    resultEl.hidden = false;
    resultEl.textContent = text;
  }

  // ---------- Chat görüntü entegrasyonu ----------

  function setupChatImageUpload() {
    const attachBtn = document.getElementById("chat-attach-btn");
    const imgInput = document.getElementById("chat-image-input");
    const previewDiv = document.getElementById("chat-image-preview");
    const thumb = document.getElementById("chat-image-thumb");
    const removeBtn = document.getElementById("chat-image-remove");

    if (!attachBtn) return;

    attachBtn.addEventListener("click", () => imgInput?.click());

    imgInput?.addEventListener("change", () => {
      const file = imgInput.files?.[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      if (thumb) thumb.src = url;
      if (previewDiv) previewDiv.style.display = "flex";

      // Chat modülüne bildir
      window._chatAttachedImage = file;
    });

    removeBtn?.addEventListener("click", () => {
      if (previewDiv) previewDiv.style.display = "none";
      if (imgInput) imgInput.value = "";
      window._chatAttachedImage = null;
    });
  }

  // ---------- Yardımcılar ----------

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  // ---------- Init ----------

  function init() {
    dropZone = document.getElementById("vision-drop-zone");
    fileInput = document.getElementById("vision-file-input");
    previewEl = document.getElementById("vision-preview");
    previewImg = document.getElementById("vision-preview-img");
    dropHint = document.getElementById("vision-drop-hint");
    questionEl = document.getElementById("vision-question");
    analyzeBtn = document.getElementById("vision-analyze-btn");
    ocrBtn = document.getElementById("vision-ocr-btn");
    videoBtn = document.getElementById("vision-video-btn");
    resultEl = document.getElementById("vision-result");
    videoInput = document.getElementById("vision-video-input");
    intervalEl = document.getElementById("vision-interval");
    transcribeBtn = document.getElementById("vision-transcribe-btn");
    transcriptEl = document.getElementById("vision-transcript");
    statusText = document.getElementById("vision-status-text");
    modelGrid = document.getElementById("vision-model-grid");

    setupDrop();
    setupChatImageUpload();

    if (analyzeBtn) analyzeBtn.addEventListener("click", analyzeImage);
    if (ocrBtn) ocrBtn.addEventListener("click", extractOCR);
    if (videoBtn) videoBtn.addEventListener("click", analyzeVideoFile);
    if (transcribeBtn) transcribeBtn.addEventListener("click", transcribeVideo);

    loadStatus();
    loadVisionModels();
  }

  return { init, loadModel, unload, loadStatus };
})();

window.Vision = Vision;
