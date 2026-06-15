import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../src/main/agent/runtime-policy");
const settingsStore = require("../src/main/agent/settings-store");
const mcp = require("../src/main/agent/mcp-client");

const trustedRoot = path.join(os.tmpdir(), "codega-runtime-project");
const outsideRoot = path.join(os.tmpdir(), "codega-runtime-outside");
assert.equal(runtime.isPathTrusted(path.join(trustedRoot, "src", "app.js"), [trustedRoot]), true);
assert.equal(runtime.isPathTrusted(outsideRoot, [trustedRoot]), false);

assert.deepEqual(
  runtime.normalizeProviderOrder("claude, ollama, claude, gemini", "openai").slice(0, 4),
  ["openai", "claude", "ollama", "gemini"],
);
assert.deepEqual(
  runtime.configuredProviderChain({
    provider: "claude",
    modelAutoFallback: true,
    modelFallbackOrder: ["claude", "openai", "ollama", "gemini"],
    claudeApiKey: "claude-key",
    openaiApiKey: "",
    geminiApiKey: "gemini-key",
  }),
  ["claude", "ollama", "gemini"],
);

assert.deepEqual(
  runtime.permissionDecision({ toolPermissions: { network: "ask" } }, "network"),
  { allowed: false, requiresApproval: true, mode: "ask", reason: "approval_required" },
);
assert.equal(
  runtime.permissionDecision({
    toolPermissions: { codeExecution: "allow" },
    trustedFolders: [trustedRoot],
  }, "codeExecution", { path: outsideRoot }).reason,
  "untrusted_workspace",
);

const normalized = settingsStore.normalizeSettings({
  provider: "ollama",
  trustedFolders: [trustedRoot, trustedRoot],
  toolPermissions: { network: "invalid", mcp: "allow" },
});
assert.equal(normalized.trustedFolders.length, 1);
assert.equal(normalized.toolPermissions.network, "allow");
assert.equal(normalized.toolPermissions.mcp, "allow");
assert.ok(normalized.remoteToolsDeviceName);

let initializeCalls = 0;
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body || "{}");
  res.setHeader("content-type", "application/json");
  res.setHeader("mcp-session-id", "codega-test-session");
  if (payload.method === "notifications/initialized") {
    res.statusCode = 202;
    res.end();
    return;
  }
  if (payload.method === "initialize") {
    initializeCalls += 1;
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      id: payload.id,
      result: { serverInfo: { name: "CODEGA Test MCP", version: "1.0" } },
    }));
    return;
  }
  res.end(JSON.stringify({
    jsonrpc: "2.0",
    id: payload.id,
    result: {
      tools: [{ name: "status", description: "test", inputSchema: { type: "object" } }],
    },
  }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const address = server.address();
  const health = await mcp.healthCheck(`http://127.0.0.1:${address.port}`);
  assert.equal(health.ok, true);
  assert.equal(health.toolCount, 1);
  assert.equal(health.serverInfo.name, "CODEGA Test MCP");
  assert.equal(initializeCalls, 1);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("Agent runtime policy + MCP health OK");
