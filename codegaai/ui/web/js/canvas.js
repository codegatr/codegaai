/**
 * CODEGA AI — Canvas / Artifact
 * Claude Artifacts + ChatGPT Canvas karşılığı.
 * HTML/CSS/JS canlı önizleme + Python sandbox çalıştırma.
 */

let _canvasTimer = null;

function canvasRun() {
  const editor = document.getElementById("canvas-preview") || {};
  const lang = document.getElementById("canvas-lang")?.value || "html";
  const code = document.getElementById("canvas-editor")?.value || "";
  const preview = document.getElementById("canvas-preview");
  const sandboxOut = document.getElementById("canvas-sandbox-output");
  const status = document.getElementById("canvas-status");

  if (lang === "html") {
    if (preview) preview.srcdoc = code;
    if (preview) preview.style.display = "";
    if (sandboxOut) sandboxOut.style.display = "none";
    if (status) status.textContent = "✓ Önizleme güncellendi";
    setTimeout(() => { if (status) status.textContent = ""; }, 2000);
  } else if (lang === "python") {
    if (status) status.textContent = "⏳ Çalışıyor...";
    if (preview) preview.style.display = "none";
    if (sandboxOut) { sandboxOut.style.display = "block"; sandboxOut.textContent = "Çalıştırılıyor..."; }
    fetch("/api/sandbox/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, timeout: 15 }),
    })
    .then(r => r.json())
    .then(d => {
      if (status) status.textContent = `✓ ${d.elapsed_ms}ms`;
      let out = d.output || "";
      if (d.error) out += "\n\n❌ HATA:\n" + d.error;
      if (sandboxOut) sandboxOut.textContent = out || "(çıktı yok)";
      // Grafikler
      if (d.plots && d.plots.length > 0) {
        sandboxOut.style.display = "none";
        preview.style.display = "";
        const imgs = d.plots.map(p =>
          `<img src="data:image/png;base64,${p}" style="max-width:100%;margin:8px">`
        ).join("");
        preview.srcdoc = `<body style="background:#0a0b0d;text-align:center">${imgs}<pre style="color:#ccc;padding:16px;text-align:left">${out}</pre></body>`;
      }
    })
    .catch(e => {
      if (sandboxOut) sandboxOut.textContent = "❌ " + e.message;
      if (status) status.textContent = "Hata";
    });
  }
}

function canvasAutoRun() {
  const lang = document.getElementById("canvas-lang")?.value;
  if (lang !== "html") return; // Python'da auto-run yok
  clearTimeout(_canvasTimer);
  _canvasTimer = setTimeout(canvasRun, 800);
}

function canvasLangChange() {
  const lang = document.getElementById("canvas-lang")?.value;
  const editor = document.getElementById("canvas-editor");
  const preview = document.getElementById("canvas-preview");
  const sandboxOut = document.getElementById("canvas-sandbox-output");
  if (!editor) return;
  if (lang === "python") {
    editor.placeholder = "# Python kodu yaz\nimport math\nprint(math.pi)\n\n# Grafik:\nimport matplotlib.pyplot as plt\nplt.plot([1,2,3,4],[1,4,9,16])\nplt.title('Kare Sayılar')\nplt.show()";
    if (preview) preview.style.display = "none";
    if (sandboxOut) { sandboxOut.style.display = "block"; sandboxOut.textContent = "▶ Çalıştır'a bas"; }
  } else {
    editor.placeholder = "<!-- HTML/CSS/JS yaz -->";
    if (sandboxOut) sandboxOut.style.display = "none";
    if (preview) preview.style.display = "";
  }
}

function canvasCopy() {
  const code = document.getElementById("canvas-editor")?.value || "";
  navigator.clipboard.writeText(code).then(() => {
    const s = document.getElementById("canvas-status");
    if (s) { s.textContent = "✓ Kopyalandı"; setTimeout(() => s.textContent = "", 2000); }
  });
}

function canvasClear() {
  const editor = document.getElementById("canvas-editor");
  const preview = document.getElementById("canvas-preview");
  if (editor) editor.value = "";
  if (preview) preview.srcdoc = "<body style='background:#0a0b0d'></body>";
}

// Sohbetten canvas'a gönder
window.sendToCanvas = function(code, lang = "html") {
  const editor = document.getElementById("canvas-editor");
  const langSel = document.getElementById("canvas-lang");
  if (editor) editor.value = code;
  if (langSel) langSel.value = lang;
  // Canvas görünümüne geç
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  const cv = document.querySelector('[data-view="canvas"]');
  const nb = document.querySelector('[data-view="canvas"]');
  if (cv) cv.classList.add("active");
  document.querySelector('button[data-view="canvas"]')?.classList.add("active");
  canvasRun();
};
