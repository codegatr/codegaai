"use strict";

/**
 * hello-plugin — CODEGA AI Örnek Plugin
 *
 * Bu dosya bir plugin'in yapısını gösterir.
 * userData/plugins/hello-plugin/ klasörüne kopyalanarak kurulabilir.
 */

let _ctx = null;

module.exports = {
  // Plugin yüklendiğinde çağrılır
  async onLoad(context) {
    _ctx = context;
    context.log("Merhaba! Hello Plugin yüklendi.");
    await context.store.set("loadCount", (await context.store.get("loadCount") || 0) + 1);
    context.log(`Toplam yüklenme sayısı: ${await context.store.get("loadCount")}`);
  },

  // Plugin devre dışı bırakıldığında çağrılır
  async onUnload() {
    if (_ctx) _ctx.log("Hello Plugin kaldırılıyor...");
    _ctx = null;
  },

  // IPC kanalları — kanal adı mutlaka "<plugin-id>:" ile başlamalı
  ipcHandlers: {
    "hello-plugin:greet": async (_event, name) => {
      return { message: `Merhaba, ${name || "dünya"}! 👋` };
    },
    "hello-plugin:stats": async () => {
      const loadCount = _ctx ? await _ctx.store.get("loadCount") : 0;
      return { loadCount, uptime: process.uptime() };
    },
  },

  // Intent handler'ları — IntentEngine ile entegrasyon
  intentHandlers: {
    "plugin.hello": async (payload) => {
      const name = payload?.name || payload?.text || "dünya";
      return { answer: `Merhaba, ${name}! (Hello Plugin tarafından yanıtlandı)` };
    },
  },
};
