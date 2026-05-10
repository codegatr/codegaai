/* ============================================================
   CODEGA AI — Otonom Öğrenme (Faz 13)
   ============================================================ */

const AutoLearn = (() => {
  let pollTimer = null;

  function fmt(n) { return (n || 0).toLocaleString("tr-TR"); }
  function fmtTime(ts) {
    if (!ts) return "—";
    return new Date(ts * 1000).toLocaleString("tr-TR");
  }

  async function load() {
    try {
      const r = await fetch("/api/autolearn/status");
      const d = await r.json();
      renderStats(d);
      renderPill(d);
    } catch (e) {}
  }

  function renderPill(d) {
    const pill = document.getElementById("autolearn-pill");
    if (!pill) return;
    if (d.state === "learning") {
      pill.className = "status-pill status-pill--ok";
      pill.innerHTML = `<span class="status-pill__dot"></span>Öğreniyor: ${d.current_topic || "—"}`;
    } else if (d.running) {
      pill.className = "status-pill status-pill--pending";
      pill.innerHTML = `<span class="status-pill__dot"></span>Idle — Boşta öğrenmeye hazır`;
    } else {
      pill.className = "status-pill status-pill--off";
      pill.innerHTML = `<span class="status-pill__dot"></span>Durduruldu`;
    }
  }

  function renderStats(d) {
    const el = document.getElementById("autolearn-stats");
    if (!el) return;

    const idleMin = Math.floor((d.idle_seconds || 0) / 60);
    const idleSec = (d.idle_seconds || 0) % 60;

    el.innerHTML = `
      <div class="learn-stat">
        <span class="learn-stat__label">Makale</span>
        <span class="learn-stat__val">${fmt(d.total_articles)}</span>
      </div>
      <div class="learn-stat">
        <span class="learn-stat__label">Bilgi (MB)</span>
        <span class="learn-stat__val">${d.total_chars_mb || 0}</span>
      </div>
      <div class="learn-stat">
        <span class="learn-stat__label">Konu</span>
        <span class="learn-stat__val">${fmt(d.knowledge_map_size)}</span>
      </div>
      <div class="learn-stat">
        <span class="learn-stat__label">Kuyruk</span>
        <span class="learn-stat__val">${fmt(d.queue_size)}</span>
      </div>
      <div class="learn-stat">
        <span class="learn-stat__label">Döngü</span>
        <span class="learn-stat__val">${fmt(d.cycles_completed)}</span>
      </div>
      <div class="learn-stat">
        <span class="learn-stat__label">İdle</span>
        <span class="learn-stat__val">${idleMin}d ${idleSec}s ${d.idle ? "✓" : ""}</span>
      </div>
      <div class="learn-stat">
        <span class="learn-stat__label">Son Öğrenme</span>
        <span class="learn-stat__val" style="font-size:11px">${fmtTime(d.last_learn_time)}</span>
      </div>
      <div class="learn-stat">
        <span class="learn-stat__label">Kaynaklar</span>
        <span class="learn-stat__val" style="font-size:10px">
          ${Object.entries(d.sources || {}).map(([k,v]) => `${k}:${v}`).join(" · ") || "—"}
        </span>
      </div>`;

    // Stop/Start buton durumu
    const stopBtn = document.getElementById("autolearn-stop-btn");
    const startBtn = document.getElementById("autolearn-start-btn");
    if (stopBtn) stopBtn.hidden = !d.running;
    if (startBtn) startBtn.hidden = d.running;
  }

  async function loadTopics() {
    try {
      const r = await fetch("/api/autolearn/topics?limit=50");
      const d = await r.json();

      const countEl = document.getElementById("topic-count");
      if (countEl) countEl.textContent = `(${d.total} konu)`;

      const mapEl = document.getElementById("knowledge-map");
      if (!mapEl) return;

      const entries = Object.entries(d.topics || {});
      if (!entries.length) {
        mapEl.innerHTML = '<p class="form-hint">Henüz konu öğrenilmedi</p>';
        return;
      }

      mapEl.innerHTML = entries.map(([topic, subs]) => `
        <div class="learn-log-entry" style="grid-template-columns:auto 1fr">
          <span class="learn-log-entry__time">${topic}</span>
          <span class="learn-log-entry__topics">${subs.slice(0,4).join(", ")}${subs.length>4?"…":""}</span>
        </div>`).join("");
    } catch (e) {}
  }

  async function trigger() {
    const btn = document.getElementById("autolearn-trigger-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Öğreniyor..."; }
    try {
      await fetch("/api/autolearn/trigger", {method: "POST"});
      setTimeout(load, 2000);
    } finally {
      setTimeout(() => {
        if (btn) { btn.disabled = false; btn.textContent = "Şimdi Öğren"; }
      }, 5000);
    }
  }

  async function stop() {
    await fetch("/api/autolearn/stop", {method: "POST"});
    load();
  }

  async function start() {
    await fetch("/api/autolearn/start", {method: "POST"});
    load();
  }

  async function addTopic() {
    const input = document.getElementById("autolearn-topic-input");
    const result = document.getElementById("autolearn-add-result");
    const topic = input?.value?.trim();
    if (!topic) return;

    try {
      const r = await fetch("/api/autolearn/add-topic", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({topic, priority: true}),
      });
      const d = await r.json();
      if (d.added) {
        if (result) result.textContent = `✅ "${topic}" kuyruğa eklendi — ${d.queue_size} konu sırada`;
        if (input) input.value = "";
        // Hemen öğren
        await fetch("/api/autolearn/trigger", {method: "POST"});
      } else {
        if (result) result.textContent = `❌ ${d.error}`;
      }
    } catch (e) {
      if (result) result.textContent = `❌ ${e.message}`;
    }
  }

  function init() {
    document.getElementById("autolearn-trigger-btn")
      ?.addEventListener("click", trigger);
    document.getElementById("autolearn-stop-btn")
      ?.addEventListener("click", stop);
    document.getElementById("autolearn-start-btn")
      ?.addEventListener("click", start);
    document.getElementById("autolearn-add-topic-btn")
      ?.addEventListener("click", addTopic);
    document.getElementById("autolearn-topic-input")
      ?.addEventListener("keydown", e => { if (e.key==="Enter") addTopic(); });

    // Sekme açılınca yükle
    if (typeof Views !== "undefined") {
      Views.on(name => {
        if (name === "autolearn") {
          load();
          loadTopics();
        }
      });
    }

    // 5 sn'de bir durum güncelle (sekme açık olsa da olmasa da)
    setInterval(load, 5000);
    load();
  }

  return { init, load, loadTopics };
})();

window.AutoLearn = AutoLearn;
