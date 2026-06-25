"use strict";

function mountPhoenixSplash() {
  if (document.getElementById("phoenix-splash")) return;
  document.body.classList.add("phoenix-mode");

  const splash = document.createElement("div");
  splash.id = "phoenix-splash";
  splash.className = "phoenix-splash";
  splash.innerHTML = `
    <div class="phoenix-splash-card">
      <div class="phoenix-mark">🔥</div>
      <h1 class="phoenix-title">CODEGA <span>AI</span></h1>
      <p class="phoenix-subtitle">PHOENIX başlatılıyor · Sınırsız kod, sınırsız güç.</p>
      <div class="phoenix-loader" aria-hidden="true"><span></span></div>
    </div>
  `;
  document.body.appendChild(splash);

  window.setTimeout(() => {
    splash.classList.add("is-hidden");
    window.setTimeout(() => splash.remove(), 700);
  }, 1600);
}

function upgradePhoenixWelcome() {
  const welcome = document.getElementById("welcome");
  if (!welcome) return;
  welcome.classList.add("phoenix-hero");
  welcome.innerHTML = `
    <div>
      <div class="phoenix-mark">🔥</div>
      <h1 class="phoenix-title">CODEGA <span>AI</span><br>PHOENIX</h1>
      <p class="phoenix-subtitle">Yerel güç. Sınırsız zeka. Kod yazan, analiz eden, planlayan ve kendini geliştiren ajan platformu.</p>
      <div class="phoenix-agent-strip" aria-label="Phoenix ajanları">
        <span class="phoenix-agent-chip">Coder <strong>AKTİF</strong></span>
        <span class="phoenix-agent-chip">Reasoner <strong>AKTİF</strong></span>
        <span class="phoenix-agent-chip">Planner <strong>AKTİF</strong></span>
        <span class="phoenix-agent-chip">Guardian <strong>AKTİF</strong></span>
        <span class="phoenix-agent-chip">Executor <strong>AKTİF</strong></span>
      </div>
    </div>
  `;
}

function bootPhoenixVisuals() {
  try {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./phoenix-theme.css";
    document.head.appendChild(link);
    mountPhoenixSplash();
    window.setTimeout(upgradePhoenixWelcome, 50);
  } catch (_error) {
    // Visual layer must never block the app.
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootPhoenixVisuals, { once: true });
} else {
  bootPhoenixVisuals();
}
