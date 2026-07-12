"use strict";

const os = require("node:os");
const path = require("node:path");

const PERMISSION_VALUES = new Set(["allow", "ask", "deny"]);
const PROVIDER_VALUES = new Set(["ollama", "openai", "claude", "gemini", "openrouter"]);

function normalizeFolder(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return path.resolve(raw).replace(/[\\/]+$/, "");
}

function normalizeTrustedFolders(values) {
  const source = Array.isArray(values) ? values : String(values || "").split(/\r?\n|;/);
  const seen = new Set();
  const out = [];
  for (const value of source) {
    const folder = normalizeFolder(value);
    if (!folder) continue;
    const key = process.platform === "win32" ? folder.toLowerCase() : folder;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(folder);
  }
  return out;
}

function isPathTrusted(candidate, trustedFolders) {
  const target = normalizeFolder(candidate);
  if (!target) return false;
  const compareTarget = process.platform === "win32" ? target.toLowerCase() : target;
  return normalizeTrustedFolders(trustedFolders).some((folder) => {
    const compareFolder = process.platform === "win32" ? folder.toLowerCase() : folder;
    return compareTarget === compareFolder || compareTarget.startsWith(`${compareFolder}${path.sep}`);
  });
}

function normalizePermission(value, fallback = "ask") {
  const normalized = String(value || "").trim().toLowerCase();
  return PERMISSION_VALUES.has(normalized) ? normalized : fallback;
}

function permissionDecision(settings, capability, context = {}) {
  const permissions = settings && typeof settings.toolPermissions === "object"
    ? settings.toolPermissions
    : {};
  const mode = normalizePermission(permissions[capability], "ask");
  if (mode === "deny") return { allowed: false, requiresApproval: false, mode, reason: "policy_denied" };
  if (context.path && !isPathTrusted(context.path, settings.trustedFolders || [])) {
    return { allowed: false, requiresApproval: true, mode: "ask", reason: "untrusted_workspace" };
  }
  return {
    allowed: mode === "allow",
    requiresApproval: mode === "ask",
    mode,
    reason: mode === "allow" ? "policy_allowed" : "approval_required",
  };
}

function normalizeProviderOrder(value, primary = "ollama") {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,\s]+/);
  const out = [];
  const add = (provider) => {
    const p = String(provider || "").trim().toLowerCase();
    if (PROVIDER_VALUES.has(p) && !out.includes(p)) out.push(p);
  };
  add(primary);
  source.forEach(add);
  PROVIDER_VALUES.forEach(add);
  return out;
}

function configuredProviderChain(settings) {
  const s = settings || {};
  const order = normalizeProviderOrder(s.modelFallbackOrder, s.provider || "ollama");
  if (s.modelAutoFallback === false) return order.slice(0, 1);
  return order.filter((provider) => {
    if (provider === "ollama") return true;
    if (provider === "openai") return Boolean(String(s.openaiApiKey || "").trim());
    if (provider === "claude") return Boolean(String(s.claudeApiKey || "").trim());
    if (provider === "gemini") return Boolean(String(s.geminiApiKey || "").trim());
    return false;
  });
}

function defaultDeviceName() {
  return os.hostname() || "CODEGA-Cihaz";
}

module.exports = {
  PERMISSION_VALUES,
  PROVIDER_VALUES,
  normalizeFolder,
  normalizeTrustedFolders,
  isPathTrusted,
  normalizePermission,
  permissionDecision,
  normalizeProviderOrder,
  configuredProviderChain,
  defaultDeviceName,
};
