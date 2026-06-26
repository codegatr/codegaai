"use strict";

const crypto = require("node:crypto");

class ConversationIsolationStore {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.conversations = new Map();
    this.taskToConversation = new Map();
  }

  ensureConversation(conversationId = "") {
    const id = String(conversationId || "").trim() || crypto.randomUUID();
    if (!this.conversations.has(id)) {
      this.conversations.set(id, {
        id,
        messages: [],
        tasks: new Set(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      this.eventBus?.emit("conversation.created", { conversationId: id });
    }
    return this.conversations.get(id);
  }

  attachTask(conversationId, taskId) {
    const conversation = this.ensureConversation(conversationId);
    const id = String(taskId || "").trim();
    if (!id) throw new Error("attachTask requires taskId");
    conversation.tasks.add(id);
    conversation.updatedAt = Date.now();
    this.taskToConversation.set(id, conversation.id);
    this.eventBus?.emit("conversation.task.attached", { conversationId: conversation.id, taskId: id });
    return conversation;
  }

  appendMessage(conversationId, message = {}) {
    const conversation = this.ensureConversation(conversationId);
    const item = {
      id: message.id || crypto.randomUUID(),
      taskId: message.taskId || null,
      role: message.role || "system",
      text: String(message.text || ""),
      createdAt: message.createdAt || Date.now(),
    };
    conversation.messages.push(item);
    conversation.updatedAt = Date.now();
    this.eventBus?.emit("conversation.message.appended", { conversationId: conversation.id, message: item });
    return item;
  }

  conversationForTask(taskId) {
    const conversationId = this.taskToConversation.get(String(taskId || ""));
    return conversationId ? this.conversations.get(conversationId) || null : null;
  }

  snapshot(conversationId) {
    const conversation = this.ensureConversation(conversationId);
    return {
      id: conversation.id,
      messages: conversation.messages.slice(),
      tasks: [...conversation.tasks],
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  list() {
    return [...this.conversations.values()].map((conversation) => this.snapshot(conversation.id));
  }
}

function createConversationIsolationStore(options) {
  return new ConversationIsolationStore(options);
}

module.exports = {
  ConversationIsolationStore,
  createConversationIsolationStore,
};
