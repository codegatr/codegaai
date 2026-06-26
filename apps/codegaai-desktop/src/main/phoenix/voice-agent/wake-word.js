"use strict";

const DEFAULT_WAKE_WORDS = ["phoenix", "hey phoenix", "codega", "codega ai"];

function normalizeVoiceText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i")
    .replace(/[ğ]/g, "g")
    .replace(/[ü]/g, "u")
    .replace(/[ş]/g, "s")
    .replace(/[ö]/g, "o")
    .replace(/[ç]/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectWakeWord(input, wakeWords = DEFAULT_WAKE_WORDS) {
  const text = normalizeVoiceText(input);
  for (const rawWord of wakeWords) {
    const word = normalizeVoiceText(rawWord);
    if (!word) continue;
    if (text === word) return { detected: true, wakeWord: rawWord, command: "" };
    if (text.startsWith(`${word} `)) {
      return {
        detected: true,
        wakeWord: rawWord,
        command: text.slice(word.length).trim(),
      };
    }
  }
  return { detected: false, wakeWord: "", command: text };
}

module.exports = {
  DEFAULT_WAKE_WORDS,
  normalizeVoiceText,
  detectWakeWord,
};
