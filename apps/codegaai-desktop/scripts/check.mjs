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
];

for (const file of required) {
  readFileSync(join(root, file), "utf8");
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!pkg.build?.nsis || !pkg.dependencies?.["electron-updater"]) {
  throw new Error("Installer/updater configuration is missing");
}
if (pkg.build?.win?.requestedExecutionLevel !== "asInvoker") {
  throw new Error("Windows installer must not request elevated privileges by default");
}
if (pkg.build?.asar !== true) {
  throw new Error("Electron app should be packed with asar");
}
if (!pkg.build?.files?.some((entry) => String(entry).includes("!**/__pycache__/**"))) {
  throw new Error("Desktop package must exclude Python cache artifacts");
}
if (!pkg.scripts?.["dist:mac"] || !pkg.build?.mac) {
  throw new Error("macOS packaging script/configuration is missing");
}
if (!pkg.scripts?.["dist:win"] || !pkg.build?.win) {
  throw new Error("Windows packaging script/configuration is missing");
}
if (!pkg.scripts?.["release:prepare"]) {
  throw new Error("Phoenix release preparation script is missing");
}

const phoenixPlan = readFileSync(join(repoRoot, "docs", "PHOENIX_SPRINT_3.md"), "utf8");
if (!phoenixPlan.includes("Clean") && !phoenixPlan.includes("clean")) {
  throw new Error("Phoenix Sprint 3 clean output target is not documented");
}
if (pkg.version !== "4.5.29") {
  throw new Error(`Desktop package version must be 4.5.29 for Phoenix Sprint 3, got ${pkg.version}`);
}

const constants = readFileSync(join(root, "src", "shared", "constants.js"), "utf8");
if (!constants.includes("const OLLAMA_CHAT_TIMEOUT_MS = 35 * 1000")) {
  throw new Error("Phoenix model timeout baseline is missing");
}
if (!constants.includes("qwen3.5:0.8b") || constants.indexOf("qwen3.5:0.8b") > constants.indexOf("qwen3.5:9b")) {
  throw new Error("Phoenix lightweight fallback priority is missing");
}

const sanitizer = readFileSync(join(root, "src", "main", "agent", "final-answer-sanitizer.js"), "utf8");
if (!sanitizer.includes("stripInternalSections") || !sanitizer.includes("Final Answer")) {
  throw new Error("Phoenix Sprint 3 output firewall is missing");
}
if (!sanitizer.includes("looksLikePureTestReport")) {
  throw new Error("Phoenix Sprint 3 test-report guard is missing");
}

const forbidden = [];
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = full.slice(repoRoot.length + 1).replace(/\\/g, "/");
    if (rel.includes("node_modules/") || rel.includes("release/")) continue;
    if (entry.isDirectory()) {
      if (entry.name === "__pycache__") forbidden.push(rel);
      scan(full);
    } else if (entry.name.endsWith(".pyc") || entry.name.endsWith(".log")) {
      forbidden.push(rel);
    }
  }
}
scan(repoRoot);
if (forbidden.length) {
  throw new Error(`Runtime artifacts must not be shipped in repository: ${forbidden.slice(0, 8).join(", ")}`);
}

console.log("CODEGA AI desktop scaffold OK");
