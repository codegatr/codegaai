"use strict";
/**
 * agent/self-maintenance.js
 * --------------------------
 * GÜVENLİ kendi-kendine bakım/onarım. Uygulama açık kaldıkça periyodik çalışır.
 *
 * NE YAPAR (güvenli, geri-alınabilir):
 *  - Ollama erişilebilirliğini denetler.
 *  - Kalıcı JSON depolarını (ayarlar/hafıza/RAG) okunur tutar; bozuksa ÖNCE
 *    ".corrupt-<ts>.bak" olarak YEDEKLER, sonra ilgili depo güvenle sıfırlanır.
 *
 * NE YAPMAZ (bilinçli sınır): kendi kaynak kodunu DEĞİŞTİRMEZ, repoya kod İTMEZ,
 * denetimsiz "kendini yeniden yazma" YAPMAZ. Bu, uygulamayı bozmaktan korur.
 *
 * runSelfCheck bağımlılıkları enjekte alır → modelsiz/diske dokunmadan test edilebilir.
 */

const fs = require("fs");

/** JSON dosyasını güvenle oku; bozuksa yedekle ve 'repaired' dön. */
function safeReadJson(file) {
  if (!file || !fs.existsSync(file)) return { state: "missing", value: null };
  try {
    return { state: "ok", value: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (_e) {
    try {
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}.bak`);
    } catch (_err) {
      /* yedekleme başarısızsa bile akışı bozma */
    }
    return { state: "repaired", value: null };
  }
}

/**
 * @param {object} deps
 *  - ollamaReachable: async () => boolean
 *  - jsonFiles: [{ name, path, onRepair? }]
 *  - readJson: (path) => {state,value}  (test için enjekte edilebilir)
 *  - now: number
 * @returns {Promise<{at:number, items:Array, repairs:string[], healthy:boolean}>}
 */
async function runSelfCheck(deps = {}) {
  const { ollamaReachable, jsonFiles = [], readJson = safeReadJson, now = Date.now() } = deps;
  const items = [];
  const repairs = [];

  let oll = false;
  if (typeof ollamaReachable === "function") {
    try { oll = await ollamaReachable(); } catch (_e) { oll = false; }
  }
  items.push({ name: "ollama", status: oll ? "ok" : "down" });

  for (const f of jsonFiles) {
    const r = readJson(f.path);
    items.push({ name: f.name, status: r.state });
    if (r.state === "repaired") {
      repairs.push(f.name);
      if (typeof f.onRepair === "function") {
        try { f.onRepair(); } catch (_e) { /* onarım hatası akışı bozmasın */ }
      }
    }
  }

  const healthy = items.every((i) => i.status === "ok" || i.status === "missing");
  return { at: now, items, repairs, healthy };
}

module.exports = { runSelfCheck, safeReadJson };
