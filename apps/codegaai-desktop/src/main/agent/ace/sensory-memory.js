"use strict";
/**
 * Layer 1: Sensory Memory — Anlık akış hafızası
 * Lifetime: saniyeler (mevcut istek tamamlanana kadar)
 */
class SensoryMemory {
  constructor() { this.reset(); }
  reset() {
    this._stream    = [];
    this._tools     = [];
    this._files     = [];
    this._startedAt = Date.now();
    this._message   = null;
  }

  setMessage(msg) {
    // { role, content } objesi veya string alır
    this._message = (msg && typeof msg === "object") ? { ...msg } : { role: "user", content: String(msg || "") };
  }
  appendToken(t)  { this._stream.push(t); }
  addTool(tool)   { this._tools.push(typeof tool === "string" ? tool : String(tool?.name || tool)); }
  addFile(file)   { this._files.push({ name: file, at: Date.now() }); }

  getMessage()    { return this._message; }
  getStream()     { return this._stream.join(""); }
  getTools()      { return [...this._tools]; }
  getFiles()      { return [...this._files]; }
  age()           { return Date.now() - this._startedAt; }

  snapshot()      {
    return {
      lastMessage : this._message,
      stream      : this.getStream().slice(-200),
      tools       : [...this._tools],
      files       : this._files.map(f => f.name),
      ageMs       : this.age(),
    };
  }
}
module.exports = { SensoryMemory };
