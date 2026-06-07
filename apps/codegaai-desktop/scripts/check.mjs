import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const required = [
  "src/main/main.js",
  "src/main/preload.js",
  "src/main/model-manager.js",
  "src/main/update-service.js",
  "src/main/agent/ollama-client.js",
  "src/main/agent/model-update-service.js",
  "src/main/agent/autonomous-dev.js",
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

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!pkg.build?.nsis || !pkg.dependencies?.["electron-updater"]) {
  throw new Error("Installer/updater configuration is missing");
}

console.log("CODEGA AI desktop scaffold OK");
