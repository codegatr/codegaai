/* ============================================================
   CODEGA AI - Ana giriş
   ============================================================ */

(function bootstrap() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  async function start() {
    console.log("%c CODEGA AI ", "background:#f59e0b;color:#0a0b0d;font-weight:700;padding:2px 6px;border-radius:3px;",
                "Faz 2 - Masaüstü UI");

    // Sunucu erişilebilir mi?
    try {
      await API.health();
      setStatus("server", "ok", "Sunucu hazır");
    } catch (err) {
      setStatus("server", "err", "Sunucu erişilemiyor");
      console.error("Backend bağlantı hatası:", err);
    }

    // Modüller
    Views.init();
    Chat.init();
    System.init();
  }

  function setStatus(key, type, text) {
    const node = document.getElementById(`status-${key}`);
    if (!node) return;
    node.textContent = text;

    const dot = node.previousElementSibling;
    if (dot && dot.classList.contains("dot")) {
      dot.className = `dot dot--${type}`;
    }
  }
})();
