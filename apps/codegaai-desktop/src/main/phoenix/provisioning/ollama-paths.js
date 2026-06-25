"use strict";

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

function existing(value) {
  try {
    return value && fs.existsSync(value) ? value : null;
  } catch (_error) {
    return null;
  }
}

function ollamaCandidates() {
  const env = process.env;
  const home = os.homedir();
  const executable = process.platform === "win32" ? "ollama.exe" : "ollama";
  const pathEntries = String(env.PATH || "")
    .split(path.delimiter)
    .map((entry) => path.join(entry, executable));

  const candidates = [
    "ollama",
    existing(env.OLLAMA_EXE),
    existing(env.OLLAMA_PATH),
    existing(path.join(env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe")),
    existing(path.join(home || "", "AppData", "Local", "Programs", "Ollama", "ollama.exe")),
    existing(path.join(env.PROGRAMFILES || "", "Ollama", "ollama.exe")),
    existing("/usr/local/bin/ollama"),
    existing("/opt/homebrew/bin/ollama"),
    ...pathEntries.map(existing),
  ].filter(Boolean);

  return [...new Set(candidates)];
}

module.exports = {
  ollamaCandidates,
};
