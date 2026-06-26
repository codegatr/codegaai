"use strict";

const { DEFAULT_WAKE_WORDS, normalizeVoiceText, detectWakeWord } = require("./wake-word");
const { classifyVoiceCommand, routeVoiceInput, renderVoiceRoute } = require("./voice-router");

module.exports = {
  DEFAULT_WAKE_WORDS,
  normalizeVoiceText,
  detectWakeWord,
  classifyVoiceCommand,
  routeVoiceInput,
  renderVoiceRoute,
};
