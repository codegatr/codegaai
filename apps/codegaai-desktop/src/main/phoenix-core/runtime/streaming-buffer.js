"use strict";

class StreamingBuffer {
  constructor({ eventBus = null, maxChars = 200000 } = {}) {
    this.eventBus = eventBus;
    this.maxChars = maxChars;
    this.buffers = new Map();
  }

  ensure(taskId) {
    const id = String(taskId || "").trim();
    if (!id) throw new Error("StreamingBuffer requires a taskId");
    if (!this.buffers.has(id)) {
      this.buffers.set(id, {
        taskId: id,
        text: "",
        chunks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        closed: false,
      });
    }
    return this.buffers.get(id);
  }

  append(taskId, chunk) {
    const buffer = this.ensure(taskId);
    if (buffer.closed) return buffer;
    const text = String(chunk || "");
    if (!text) return buffer;
    buffer.chunks.push({ text, at: Date.now() });
    buffer.text += text;
    if (buffer.text.length > this.maxChars) {
      buffer.text = buffer.text.slice(buffer.text.length - this.maxChars);
      buffer.chunks = buffer.chunks.slice(-1000);
    }
    buffer.updatedAt = Date.now();
    this.eventBus?.emit("stream.chunk", { taskId: buffer.taskId, chunk: text, size: buffer.text.length });
    return buffer;
  }

  snapshot(taskId) {
    const buffer = this.ensure(taskId);
    return {
      taskId: buffer.taskId,
      text: buffer.text,
      chunks: buffer.chunks.slice(),
      createdAt: buffer.createdAt,
      updatedAt: buffer.updatedAt,
      closed: buffer.closed,
    };
  }

  close(taskId) {
    const buffer = this.ensure(taskId);
    buffer.closed = true;
    buffer.updatedAt = Date.now();
    this.eventBus?.emit("stream.closed", { taskId: buffer.taskId, size: buffer.text.length });
    return this.snapshot(taskId);
  }

  clear(taskId) {
    this.buffers.delete(String(taskId || ""));
  }

  list() {
    return [...this.buffers.values()].map((buffer) => ({
      taskId: buffer.taskId,
      size: buffer.text.length,
      chunks: buffer.chunks.length,
      createdAt: buffer.createdAt,
      updatedAt: buffer.updatedAt,
      closed: buffer.closed,
    }));
  }
}

function createStreamingBuffer(options) {
  return new StreamingBuffer(options);
}

module.exports = {
  StreamingBuffer,
  createStreamingBuffer,
};
