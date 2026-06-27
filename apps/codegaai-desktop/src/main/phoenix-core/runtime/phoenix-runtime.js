"use strict";

/**
 * PhoenixRuntime — Phoenix Core v2 merkezi orkestratörü.
 *
 * EventBus, Watchdog, ConversationStore, StreamingBuffer ve IntentEngine'i
 * tek bir yaşam döngüsü altında birleştirir. main.js'deki chat:send handler'ı
 * bu sınıfı kullanarak her isteği izole, izlenebilir ve iptal edilebilir şekilde yönetir.
 *
 * Mimari kural: Hiçbir bileşen başka bir bileşeni doğrudan çağırmaz.
 * Her şey EventBus üzerinden iletişim kurar.
 */

const crypto = require("node:crypto");
const { createEventBus } = require("../kernel/event-bus");
const { createPhoenixWatchdog } = require("../watchdog/watchdog");
const { createConversationIsolationStore } = require("./conversation-isolation");
const { createStreamingBuffer } = require("./streaming-buffer");
const { classifyIntent } = require("../intent/intent-engine");

class PhoenixRuntime {
  /**
   * @param {object} opts
   * @param {number} [opts.staleMs=90000]   - Watchdog: token yoksa stale eşiği
   * @param {number} [opts.expireMs=300000] - Watchdog: hard abort eşiği
   * @param {number} [opts.maxChars=200000] - StreamBuffer: maksimum buffer boyutu
   */
  constructor({ staleMs = 90000, expireMs = 300000, maxChars = 200000 } = {}) {
    // Paylaşılan EventBus — tüm bileşenler buraya bağlanır
    this.eventBus = createEventBus();

    // Her bileşen aynı EventBus referansını alır
    this.watchdog = createPhoenixWatchdog({
      eventBus: this.eventBus,
      staleMs,
      expireMs,
    });
    this.conversationStore = createConversationIsolationStore({
      eventBus: this.eventBus,
    });
    this.streamBuffer = createStreamingBuffer({
      eventBus: this.eventBus,
      maxChars,
    });

    // Aktif görev haritası: taskId → { chatId, startedAt, intent }
    this._activeTasks = new Map();
  }

  /**
   * Yeni bir sohbet isteği başlatır.
   * IntentEngine çalıştırılır; fast-path hit ise LLM'e gitmeden yanıt döner.
   *
   * @param {string} message
   * @param {{ chatId?: string, regenerate?: boolean, context?: string }} opts
   * @returns {{ taskId: string, chatId: string, intent: object, fastAnswer?: string }}
   */
  startChat(message, opts = {}) {
    const chatId = String(opts.chatId || "").trim() || crypto.randomUUID();
    const taskId = crypto.randomUUID();

    // 1. İstek sınıflandırması — LLM'den önce
    let intent;
    try {
      intent = classifyIntent(message);
    } catch (_e) {
      intent = { intent: "chat.general", route: "model", confidence: 0.5, needsModel: true };
    }

    // 2. Olayı yayınla
    this.eventBus.emit("chat.started", {
      taskId,
      chatId,
      intent: intent.intent,
      route: intent.route,
      needsModel: intent.needsModel,
    });

    // 3. Konuşmaya görev bağla
    try { this.conversationStore.attachTask(chatId, taskId); } catch (_e) {}
    try {
      this.conversationStore.appendMessage(chatId, {
        role: "user",
        text: String(message || ""),
        taskId,
      });
    } catch (_e) {}

    // 4. Watchdog başlat
    try { this.watchdog.beat(taskId); } catch (_e) {}

    // 5. Stream buffer hazırla
    try { this.streamBuffer.ensure(taskId); } catch (_e) {}

    // 6. Aktif görevler listesine ekle
    this._activeTasks.set(taskId, { chatId, startedAt: Date.now(), intent: intent.intent });

    return { taskId, chatId, intent };
  }

  /**
   * Bir token geldiğinde çağrılır.
   * StreamBuffer'a yazar, watchdog'u tazeler, EventBus'a bildirir.
   *
   * @param {string} taskId
   * @param {string} chatId
   * @param {string} token
   */
  onToken(taskId, chatId, token) {
    try { this.streamBuffer.append(taskId, token); } catch (_e) {}
    try { this.watchdog.beat(taskId); } catch (_e) {}
    this.eventBus.emit("chat.token", { taskId, chatId, token });
  }

  /**
   * Üretim başarıyla tamamlandığında çağrılır.
   * Buffer kapatılır, assistant mesajı konuşmaya eklenir, watchdog temizlenir.
   *
   * @param {string} taskId
   * @param {string} chatId
   * @param {object|string} result - modelManager.ask() sonucu
   */
  finishChat(taskId, chatId, result) {
    const text = (result && typeof result.text === "string")
      ? result.text
      : String(result || "");

    try { this.streamBuffer.close(taskId); } catch (_e) {}
    try {
      this.conversationStore.appendMessage(chatId, {
        role: "assistant",
        text,
        taskId,
      });
    } catch (_e) {}
    try { this.watchdog.heartbeat.remove(taskId); } catch (_e) {}

    const duration = (() => {
      const task = this._activeTasks.get(taskId);
      return task ? Date.now() - task.startedAt : 0;
    })();
    this._activeTasks.delete(taskId);

    this.eventBus.emit("chat.finished", {
      taskId,
      chatId,
      size: text.length,
      durationMs: duration,
    });

    return text;
  }

  /**
   * İstek iptal edildiğinde veya hata oluştuğunda çağrılır.
   *
   * @param {string} taskId
   * @param {string} chatId
   * @param {string} [reason]
   */
  abortChat(taskId, chatId, reason = "user_cancelled") {
    try { this.streamBuffer.close(taskId); } catch (_e) {}
    try { this.watchdog.heartbeat.remove(taskId); } catch (_e) {}
    this._activeTasks.delete(taskId);
    this.eventBus.emit("chat.aborted", { taskId, chatId, reason });
  }

  /**
   * EventBus'a listener ekler. Cleanup fonksiyonu döner.
   * @param {string} type
   * @param {Function} listener
   * @returns {Function} unsubscribe
   */
  on(type, listener) {
    return this.eventBus.on(type, listener);
  }

  /**
   * Debugger / sağlık ekranı için anlık görüntü.
   */
  snapshot() {
    return {
      activeTasks: [...this._activeTasks.entries()].map(([id, t]) => ({ taskId: id, ...t })),
      conversations: this.conversationStore.list(),
      streams: this.streamBuffer.list(),
      watchdogStatus: this.watchdog.inspectAll(),
      eventHistoryTail: this.eventBus.snapshot().slice(-20),
    };
  }
}

function createPhoenixRuntime(options) {
  return new PhoenixRuntime(options);
}

module.exports = { PhoenixRuntime, createPhoenixRuntime };
