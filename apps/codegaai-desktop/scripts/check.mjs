import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
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

const repoRoot = root;
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
