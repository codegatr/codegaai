import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = join(root, "..", "..");
const required = [
  "src/main/main.js",
  "src/main/preload.js",
  "src/main/model-manager.js",
  "src/main/update-service.js",
  "src/renderer/index.html",
  "src/renderer/renderer.js",
  "src/renderer/styles.css",
  "src/main/agent/model-router-ai.js",
  "src/main/ai/engine.js",
  "src/main/ai/router/prompt-router.js",
  "src/main/ai/router/fallback.js",
  "src/main/ai/runtime/executor.js",
  "src/main/ai/models/provisioning.js",
];

for (const file of required) readFileSync(join(root, file), "utf8");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!pkg.build?.nsis || !pkg.dependencies?.["electron-updater"]) throw new Error("Installer/updater configuration is missing");
if (pkg.build?.win?.requestedExecutionLevel !== "asInvoker") throw new Error("Windows installer must not request elevated privileges by default");
if (pkg.build?.asar !== true) throw new Error("Electron app should be packed with asar");
if (!pkg.build?.files?.some((entry) => String(entry).includes("!**/__pycache__/**"))) throw new Error("Desktop package must exclude Python cache artifacts");
if (!pkg.scripts?.["release:prepare"]) throw new Error("Phoenix release preparation script is missing");

if (pkg.version !== "5.0.0-alpha.1") throw new Error(`Desktop package version must be 5.0.0-alpha.1, got ${pkg.version}`);

const engine = readFileSync(join(root, "src", "main", "ai", "engine.js"), "utf8");
if (!engine.includes("planExecution") || !engine.includes("runPlanned")) throw new Error("v5 AI engine facade is missing");

const promptRouter = readFileSync(join(root, "src", "main", "ai", "router", "prompt-router.js"), "utf8");
if (!promptRouter.includes("analyzePrompt") || !promptRouter.includes("short_fact") || !promptRouter.includes("code")) throw new Error("v5 prompt router is incomplete");

const fallback = readFileSync(join(root, "src", "main", "ai", "router", "fallback.js"), "utf8");
if (!fallback.includes("buildChain") || !fallback.includes("qwen2.5-coder:3b")) throw new Error("v5 fallback chain builder is incomplete");

const provisioning = readFileSync(join(root, "src", "main", "ai", "models", "provisioning.js"), "utf8");
if (!provisioning.includes("CORE_CHAT_MODEL") || !provisioning.includes("shouldAutoPrepare")) throw new Error("v5 auto provisioning policy is missing");

const forbidden = [];
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = full.slice(repoRoot.length + 1).replace(/\\/g, "/");
    if (rel.includes("node_modules/") || rel.includes("release/")) continue;
    if (entry.isDirectory()) {
      if (entry.name === "__pycache__") forbidden.push(rel);
      scan(full);
    } else if (entry.name.endsWith(".pyc") || entry.name.endsWith(".log")) forbidden.push(rel);
  }
}
scan(repoRoot);
if (forbidden.length) throw new Error(`Runtime artifacts must not be shipped in repository: ${forbidden.slice(0, 8).join(", ")}`);

console.log("CODEGA AI desktop scaffold OK");
