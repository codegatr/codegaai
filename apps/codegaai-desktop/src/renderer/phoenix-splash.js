"use strict";

/* ────────────────────────────────────────────────────────────────
 *  CODEGA AI — Splash Screen + First-Run Setup Wizard
 * ──────────────────────────────────────────────────────────────── */

const LOGO_SVG = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="splashArcGrad" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%"   stop-color="#93c5fd"/>
      <stop offset="45%"  stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <linearGradient id="splashChipGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#60a5fa"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <filter id="splashGlow">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <path d="M 158,55 A 68,68 0 1 0 158,145"
    fill="none" stroke="url(#splashArcGrad)"
    stroke-width="22" stroke-linecap="round"
    filter="url(#splashGlow)"/>
  <rect x="90" y="93" width="24" height="6" rx="3" fill="url(#splashChipGrad)" opacity="0.95"/>
  <rect x="106" y="85" width="6" height="22" rx="3" fill="url(#splashChipGrad)" opacity="0.7"/>
  <rect x="159" y="40" width="14" height="14" rx="3" fill="#60a5fa" opacity="0.95"/>
  <rect x="177" y="28" width="9"  height="9"  rx="2" fill="#93c5fd" opacity="0.75"/>
</svg>`;

/* ── Splash ────────────────────────────────────────────────────── */

const SPLASH_CSS = `
#codega-splash{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;
  align-items:center;justify-content:center;background:#080d1a;
  transition:opacity .6s ease,transform .6s ease;}
#codega-splash.is-hiding{opacity:0;transform:scale(1.04);pointer-events:none;}
.cs-logo{width:110px;height:110px;animation:csLogoPop .5s cubic-bezier(.22,1,.36,1) both;}
.cs-wordmark{margin-top:22px;font-family:'SF Pro Display','Segoe UI',system-ui,sans-serif;
  font-size:28px;font-weight:700;letter-spacing:.18em;color:#f1f5f9;
  animation:csFadeUp .5s .12s cubic-bezier(.22,1,.36,1) both;}
.cs-wordmark span{color:#3b82f6;}
.cs-tagline{margin-top:6px;font-family:'SF Pro Text','Segoe UI',system-ui,sans-serif;
  font-size:12px;letter-spacing:.12em;color:#64748b;text-transform:uppercase;
  animation:csFadeUp .5s .22s cubic-bezier(.22,1,.36,1) both;}
.cs-bar-wrap{margin-top:44px;width:180px;height:2px;background:#1e293b;
  border-radius:99px;overflow:hidden;animation:csFadeUp .4s .3s both;}
.cs-bar{height:100%;width:0%;background:linear-gradient(90deg,#3b82f6,#60a5fa);
  border-radius:99px;animation:csBarFill 1.4s .35s cubic-bezier(.4,0,.2,1) forwards;}
.cs-version{margin-top:14px;font-size:10px;color:#334155;letter-spacing:.08em;
  animation:csFadeUp .4s .4s both;}
@keyframes csLogoPop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
@keyframes csFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes csBarFill{0%{width:0%}60%{width:75%}85%{width:92%}100%{width:100%}}
`;

function mountPhoenixSplash(version) {
  if (document.getElementById("codega-splash")) return;
  const style = document.createElement("style");
  style.textContent = SPLASH_CSS;
  document.head.appendChild(style);
  const el = document.createElement("div");
  el.id = "codega-splash";
  el.innerHTML = `
    <div class="cs-logo">${LOGO_SVG}</div>
    <div class="cs-wordmark">CODEGA <span>AI</span></div>
    <div class="cs-tagline">AI Software Engineering Platform</div>
    <div class="cs-bar-wrap"><div class="cs-bar"></div></div>
    ${version ? `<div class="cs-version">v${version}</div>` : ""}`;
  document.body.insertBefore(el, document.body.firstChild);
  setTimeout(() => {
    el.classList.add("is-hiding");
    setTimeout(() => { el.remove(); style.remove(); }, 650);
  }, 1900);
}

/* ── First-run Setup Wizard ────────────────────────────────────── */

const SETUP_CSS = `
#codega-setup-overlay{position:fixed;inset:0;z-index:99998;
  background:rgba(8,13,26,.88);backdrop-filter:blur(6px);
  display:flex;align-items:center;justify-content:center;
  animation:csSetupIn .35s cubic-bezier(.22,1,.36,1);}
@keyframes csSetupIn{from{opacity:0}to{opacity:1}}
.setup-window{display:flex;width:680px;height:460px;background:#0f172a;
  border:1px solid #1e293b;border-radius:12px;overflow:hidden;
  box-shadow:0 32px 80px rgba(0,0,0,.7);
  animation:csSetupSlide .4s .05s cubic-bezier(.22,1,.36,1) both;}
@keyframes csSetupSlide{from{transform:translateY(20px) scale(.97);opacity:0}to{transform:none;opacity:1}}
.setup-sidebar{width:190px;background:#0a0f1e;border-right:1px solid #1e293b;
  display:flex;flex-direction:column;padding:28px 0 20px;flex-shrink:0;}
.setup-brand{display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:0 16px 24px;border-bottom:1px solid #1e293b;margin-bottom:14px;}
.setup-brand svg{width:42px;height:42px;}
.setup-brand-name{font-size:12px;font-weight:700;letter-spacing:.15em;color:#e2e8f0;}
.setup-brand-name span{color:#3b82f6;}
.setup-brand-sub{font-size:9px;color:#475569;letter-spacing:.08em;text-align:center;}
.setup-step{display:flex;align-items:center;gap:10px;padding:9px 18px;
  font-size:12px;color:#475569;}
.setup-step.active{color:#f1f5f9;}
.setup-step.done{color:#3b82f6;}
.setup-step-dot{width:20px;height:20px;border-radius:50%;border:2px solid #334155;
  display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;
  color:#475569;transition:all .25s;}
.setup-step.active .setup-step-dot{border-color:#3b82f6;background:#1d4ed8;color:#fff;
  box-shadow:0 0 0 3px rgba(59,130,246,.2);}
.setup-step.done .setup-step-dot{border-color:#3b82f6;background:#1e3a5f;color:#3b82f6;}
.setup-content{flex:1;display:flex;flex-direction:column;padding:32px 36px 24px;overflow:hidden;}
.setup-page{display:none;flex-direction:column;height:100%;}
.setup-page.active{display:flex;}
.setup-page h2{font-size:20px;font-weight:700;color:#f1f5f9;margin:0 0 8px;}
.setup-page p{font-size:13px;color:#64748b;line-height:1.6;margin:0 0 20px;}
.setup-illustration{flex:1;display:flex;align-items:center;justify-content:center;}
.setup-illustration svg{width:120px;height:120px;}
.setup-footer{display:flex;align-items:center;justify-content:space-between;
  margin-top:auto;padding-top:16px;border-top:1px solid #1e293b;}
.setup-footer-badges{display:flex;gap:14px;font-size:10px;color:#334155;}
.setup-nav{display:flex;gap:8px;}
.setup-btn{padding:8px 20px;border-radius:6px;font-size:13px;font-weight:600;
  border:none;cursor:pointer;transition:all .15s;}
.setup-btn-back{background:transparent;color:#64748b;border:1px solid #1e293b;}
.setup-btn-back:hover{color:#94a3b8;border-color:#334155;}
.setup-btn-next{background:#2563eb;color:#fff;}
.setup-btn-next:hover{background:#1d4ed8;}
.setup-progress-list{display:flex;flex-direction:column;gap:10px;flex:1;}
.setup-prog-row{display:flex;align-items:center;gap:12px;font-size:12px;color:#94a3b8;}
.setup-prog-row .icon{width:20px;text-align:center;}
.setup-prog-bar-wrap{flex:1;height:4px;background:#1e293b;border-radius:99px;overflow:hidden;}
.setup-prog-bar{height:100%;border-radius:99px;background:linear-gradient(90deg,#2563eb,#60a5fa);
  transition:width 1.2s cubic-bezier(.4,0,.2,1);}
.setup-prog-pct{width:32px;text-align:right;font-size:11px;color:#475569;}
`;

const STEPS = ["Hoş Geldiniz","Sistem Kontrolü","Bileşenler","Kurulum","Tamamlandı"];

const PAGES = [
  `<h2>CODEGA AI Kurulumuna<br>Hoş Geldiniz</h2>
   <p>CODEGA AI, yerel çalışan yapay zeka destekli<br>bir yazılım mühendisliği platformudur.<br><br>Kuruluma devam etmek için <strong>İleri</strong> düğmesine tıklayın.</p>
   <div class="setup-illustration"><svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
     <rect x="10" y="15" width="100" height="70" rx="6" fill="#1e293b" stroke="#2563eb" stroke-width="1.5"/>
     <rect x="10" y="15" width="100" height="16" rx="6" fill="#2563eb" opacity=".5"/>
     <text x="60" y="62" text-anchor="middle" font-size="22" fill="#3b82f6" font-weight="bold" font-family="monospace">&lt;/&gt;</text>
     <rect x="88" y="56" width="14" height="14" rx="3" fill="#1d4ed8"/>
     <text x="95" y="67" text-anchor="middle" font-size="8" fill="#fff" font-weight="bold" font-family="sans-serif">AI</text>
   </svg></div>`,

  `<h2>Sistem Kontrolü</h2>
   <p>Sisteminiz CODEGA AI için kontrol ediliyor.</p>
   <div class="setup-progress-list">
     <div class="setup-prog-row"><span class="icon">💻</span>İşletim sistemi<div class="setup-prog-bar-wrap"><div class="setup-prog-bar" style="width:100%"></div></div><span class="setup-prog-pct">✓</span></div>
     <div class="setup-prog-row"><span class="icon">🧠</span>RAM kontrolü<div class="setup-prog-bar-wrap"><div class="setup-prog-bar" style="width:100%"></div></div><span class="setup-prog-pct">✓</span></div>
     <div class="setup-prog-row"><span class="icon">💾</span>Disk alanı<div class="setup-prog-bar-wrap"><div class="setup-prog-bar" style="width:100%"></div></div><span class="setup-prog-pct">✓</span></div>
     <div class="setup-prog-row"><span class="icon">🔒</span>Güvenlik politikaları<div class="setup-prog-bar-wrap"><div class="setup-prog-bar" style="width:100%"></div></div><span class="setup-prog-pct">✓</span></div>
   </div>`,

  `<h2>Bileşenler Yükleniyor</h2>
   <p>CODEGA AI bileşenleri yapılandırılıyor.</p>
   <div class="setup-progress-list">
     <div class="setup-prog-row"><span class="icon">📁</span>Dosyalar kopyalanıyor<div class="setup-prog-bar-wrap"><div class="setup-prog-bar" id="pb0" style="width:0%"></div></div><span class="setup-prog-pct" id="pp0">%0</span></div>
     <div class="setup-prog-row"><span class="icon">📦</span>Bileşenler yükleniyor<div class="setup-prog-bar-wrap"><div class="setup-prog-bar" id="pb1" style="width:0%"></div></div><span class="setup-prog-pct" id="pp1">%0</span></div>
     <div class="setup-prog-row"><span class="icon">🤖</span>AI Modelleri hazırlanıyor<div class="setup-prog-bar-wrap"><div class="setup-prog-bar" id="pb2" style="width:0%"></div></div><span class="setup-prog-pct" id="pp2">%0</span></div>
     <div class="setup-prog-row"><span class="icon">⚙️</span>Ortam yapılandırılıyor<div class="setup-prog-bar-wrap"><div class="setup-prog-bar" id="pb3" style="width:0%"></div></div><span class="setup-prog-pct" id="pp3">%0</span></div>
     <div class="setup-prog-row"><span class="icon">💾</span>Ayarlar kaydediliyor<div class="setup-prog-bar-wrap"><div class="setup-prog-bar" id="pb4" style="width:0%"></div></div><span class="setup-prog-pct" id="pp4">%0</span></div>
   </div>`,

  `<h2>Kurulum Tamamlanıyor</h2>
   <p>Son adımlar tamamlanıyor…</p>
   <div class="setup-illustration"><svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
     <circle cx="60" cy="48" r="32" fill="none" stroke="#1e3a5f" stroke-width="6"/>
     <circle cx="60" cy="48" r="32" fill="none" stroke="#2563eb" stroke-width="6"
       stroke-dasharray="120 80" stroke-linecap="round">
       <animateTransform attributeName="transform" type="rotate" from="0 60 48" to="360 60 48" dur="1.4s" repeatCount="indefinite"/>
     </circle>
     <text x="60" y="53" text-anchor="middle" font-size="14" fill="#60a5fa" font-weight="bold" font-family="monospace">AI</text>
   </svg></div>`,

  `<h2>Kurulum Tamamlandı 🎉</h2>
   <p>CODEGA AI kullanıma hazır.<br>Yerel yapay zeka ile yazılım geliştirmeye başlayabilirsiniz.</p>
   <div class="setup-illustration"><svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
     <circle cx="60" cy="48" r="32" fill="#1e3a5f" stroke="#2563eb" stroke-width="1.5"/>
     <polyline points="44,50 55,61 76,38" fill="none" stroke="#60a5fa" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
   </svg></div>`,
];

function mountSetupWizard(onComplete) {
  if (localStorage.getItem("codega-setup-done")) { if (onComplete) onComplete(); return; }
  const style = document.createElement("style");
  style.textContent = SETUP_CSS;
  document.head.appendChild(style);
  let current = 0;

  const sidebarHTML = STEPS.map((label, i) =>
    `<div class="setup-step ${i===0?"active":""}" data-step="${i}">
       <div class="setup-step-dot">${i+1}</div><span>${label}</span></div>`).join("");

  const pagesHTML = PAGES.map((html, i) =>
    `<div class="setup-page ${i===0?"active":""}" data-page="${i}">${html}</div>`).join("");

  const el = document.createElement("div");
  el.id = "codega-setup-overlay";
  el.innerHTML = `<div class="setup-window">
    <div class="setup-sidebar">
      <div class="setup-brand">${LOGO_SVG}
        <div class="setup-brand-name">CODEGA <span>AI</span></div>
        <div class="setup-brand-sub">AI Software Engineering Platform</div>
      </div>${sidebarHTML}
    </div>
    <div class="setup-content">${pagesHTML}
      <div class="setup-footer">
        <div class="setup-footer-badges">
          <span>🛡 Yerel ve Güvenli</span>
          <span>⚡ Hızlı ve Verimli</span>
          <span>🔒 Gizlilik Odaklı</span>
        </div>
        <div class="setup-nav">
          <button class="setup-btn setup-btn-back" id="setup-back" style="display:none">Geri</button>
          <button class="setup-btn setup-btn-next" id="setup-next">İleri ›</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(el);

  function updateUI() {
    el.querySelectorAll(".setup-step").forEach((s, i) => {
      s.className = "setup-step" + (i < current ? " done" : i === current ? " active" : "");
      s.querySelector(".setup-step-dot").textContent = i < current ? "✓" : String(i+1);
    });
    el.querySelectorAll(".setup-page").forEach((p, i) => {
      p.className = "setup-page" + (i === current ? " active" : "");
    });
    document.getElementById("setup-back").style.display = current > 0 ? "" : "none";
    document.getElementById("setup-next").textContent = current === STEPS.length-1 ? "Başlat" : "İleri ›";
    if (current === 2) {
      [80,65,70,90,100].forEach((t, i) => {
        setTimeout(() => {
          const b = document.getElementById("pb"+i), p = document.getElementById("pp"+i);
          if (b) b.style.width = t+"%";
          if (p) p.textContent = "%"+t;
        }, i*200);
      });
    }
  }

  document.getElementById("setup-next").addEventListener("click", () => {
    if (current < STEPS.length-1) { current++; updateUI(); }
    else {
      localStorage.setItem("codega-setup-done","1");
      el.style.cssText += ";opacity:0;transition:opacity .4s";
      setTimeout(() => { el.remove(); style.remove(); if (onComplete) onComplete(); }, 420);
    }
  });
  document.getElementById("setup-back").addEventListener("click", () => {
    if (current > 0) { current--; updateUI(); }
  });
}

function upgradePhoenixWelcome() {}

module.exports = { mountPhoenixSplash, mountSetupWizard };
    