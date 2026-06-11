import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = join(root, "..", "..");
const required = [
  "src/main/main.js",
  "src/main/preload.js",
  "src/main/model-manager.js",
  "src/main/update-service.js",
  "src/main/agent/ollama-client.js",
  "src/main/agent/model-update-service.js",
  "src/main/agent/model-storage.js",
  "src/main/agent/autonomous-dev.js",
  "src/main/agent/autonomous-loop.js",
  "src/main/agent/agent-watch.js",
  "src/main/agent/cloud-provider.js",
  "src/main/agent/agent-loop.js",
  "src/main/agent/tools.js",
  "src/main/agent/memory.js",
  "src/main/agent/system-prompt.js",
  "src/renderer/index.html",
  "src/renderer/renderer.js",
  "src/renderer/styles.css",
];

for (const file of required) {
  readFileSync(join(root, file), "utf8");
}

for (const file of ["AGENTS.md", "CODEGA_CORE.md", "CODEGA_RULES.md"]) {
  readFileSync(join(repoRoot, file), "utf8");
}

const skillsRoot = join(repoRoot, "CODEGA_SKILLS");
const skillFolders = readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
if (skillFolders.length < 8) {
  throw new Error("CODEGA agent skill catalog is incomplete");
}
for (const entry of skillFolders) {
  const content = readFileSync(join(skillsRoot, entry.name, "SKILL.md"), "utf8");
  if (!/^---\r?\nname: [a-z0-9-]+\r?\ndescription: .+\r?\n---/m.test(content)) {
    throw new Error(`Invalid CODEGA skill frontmatter: ${entry.name}`);
  }
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!pkg.build?.nsis || !pkg.dependencies?.["electron-updater"]) {
  throw new Error("Installer/updater configuration is missing");
}

const settingsHtml = readFileSync(join(root, "src/renderer/index.html"), "utf8");
const rendererJs = readFileSync(join(root, "src/renderer/renderer.js"), "utf8");
const preloadJs = readFileSync(join(root, "src/main/preload.js"), "utf8");
for (const marker of ["model-storage-path", "model-storage-status", "move-model-storage"]) {
  if (!settingsHtml.includes(marker)) throw new Error(`Model storage UI is missing: ${marker}`);
}
if (!rendererJs.includes("moveModelStorage") || !preloadJs.includes("model-storage:move")) {
  throw new Error("Model storage IPC wiring is incomplete");
}
for (const marker of ["starter-actions", "Sen hazır olduğunda hazırım.", "toggle-autonomous-schedule"]) {
  if (!settingsHtml.includes(marker)) throw new Error(`New home/autonomous loop UI is missing: ${marker}`);
}
if (!rendererJs.includes('classList.toggle("empty-chat"')) {
  throw new Error("Empty-chat layout state is not wired");
}

console.log("CODEGA AI desktop scaffold OK");
