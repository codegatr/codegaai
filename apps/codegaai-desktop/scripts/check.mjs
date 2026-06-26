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
  "src/main/phoenix/kernel/phoenix-kernel.js",
  "src/main/phoenix/router/intent-router.js",
  "src/main/phoenix/agents/agent-registry.js",
  "src/main/phoenix/runtime/execution-engine.js",
  "src/main/phoenix/provisioning/provisioning-policy.js",
  "src/main/phoenix/provisioning/model-provisioner.js",
  "src/renderer/phoenix-theme.css",
  "src/renderer/phoenix-splash.js"
];

const rootRequired = [
  "packages/phoenix-core/package.json",
  "packages/phoenix-core/index.js",
  "packages/phoenix-core/task-engine/create-task.js",
  "packages/phoenix-core/planner/plan-task.js",
  "packages/phoenix-core/orchestrator/orchestrate-task.js",
  "packages/phoenix-agents/package.json",
  "packages/phoenix-agents/index.js",
  "packages/phoenix-agents/project-builder/build-project-blueprint.js",
  "docs/PHOENIX_AUTO_PROVISIONING.md"
];

for (const file of required) readFileSync(join(root, file), "utf8");
for (const file of rootRequired) readFileSync(join(repoRoot, file), "utf8");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!pkg.build?.nsis || !pkg.dependencies?.["electron-updater"]) throw new Error("Installer/updater configuration is missing");
if (pkg.build?.win?.requestedExecutionLevel !== "asInvoker") throw new Error("Windows installer must not request elevated privileges by default");
if (pkg.build?.asar !== true) throw new Error("Electron app should be packed with asar");
if (!pkg.build?.files?.some((entry) => String(entry).includes("!**/__pycache__/**"))) throw new Error("Desktop package must exclude Python cache artifacts");
if (!pkg.scripts?.["release:prepare"]) throw new Error("Phoenix release preparation script is missing");
if (!pkg.scripts?.["release:win"]) throw new Error("Windows release script is missing");

if (pkg.version !== "5.1.2") throw new Error(`Desktop package version must be 5.1.2, got ${pkg.version}`);

const phoenixCore = readFileSync(join(repoRoot, "packages", "phoenix-core", "index.js"), "utf8");
if (!phoenixCore.includes("runPhoenix") || !phoenixCore.includes("createTask")) throw new Error("Phoenix core entrypoint is incomplete");

const taskEngine = readFileSync(join(repoRoot, "packages", "phoenix-core", "task-engine", "create-task.js"), "utf8");
if (!taskEngine.includes("createTask") || !taskEngine.includes("service_automation")) throw new Error("Phoenix task engine is incomplete");

const planner = readFileSync(join(repoRoot, "packages", "phoenix-core", "planner", "plan-task.js"), "utf8");
if (!planner.includes("planTask") || !planner.includes("work_orders")) throw new Error("Phoenix planner is incomplete");

const builder = readFileSync(join(repoRoot, "packages", "phoenix-agents", "project-builder", "build-project-blueprint.js"), "utf8");
if (!builder.includes("buildProjectBlueprint") || !builder.includes("database/users.sql")) throw new Error("Phoenix project builder is incomplete");

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

console.log("CODEGA AI Phoenix v5.1.2 scaffold OK");


