import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

function readText(path) {
  return readFileSync(path, "utf8").replace(/^﻿/, "");
}

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
  "src/main/agent/mojibake.js",
  "src/main/ai/engine.js",
  "src/main/ai/router/prompt-router.js",
  "src/main/ai/router/fallback.js",
  "src/main/ai/runtime/executor.js",
  "src/main/ai/models/provisioning.js",
  "src/main/phoenix/kernel/phoenix-kernel.js",
  "src/main/phoenix/kernel/task-engine.js",
  "src/main/phoenix/kernel/progress-bus.js",
  "src/main/phoenix/kernel/scheduler.js",
  "src/main/phoenix/kernel/background-job-manager.js",
  "src/main/phoenix/router/intent-router.js",
  "src/main/phoenix/agents/agent-registry.js",
  "src/main/phoenix/agents/planner/planner-agent.js",
  "src/main/phoenix/runtime/execution-engine.js",
  "src/main/phoenix/provisioning/provisioning-policy.js",
  "src/main/phoenix/provisioning/model-provisioner.js",
  "src/main/phoenix/model-store/state.js",
  "src/main/phoenix/model-store/recommendations.js",
  "src/main/phoenix/model-store/index.js",
  "src/main/phoenix/voice-agent/index.js",
  "src/main/phoenix/voice-agent/voice-router.js",
  "src/main/phoenix/voice-agent/wake-word.js",
  "src/main/phoenix/builder/file-manifest.js",
  "src/main/phoenix/builder/service-automation-project.js",
  "src/main/phoenix/builder/index.js",
  "src/main/phoenix-core/kernel/event-bus.js",
  "src/main/phoenix-core/kernel/task-registry.js",
  "src/main/phoenix-core/kernel/kernel.js",
  "src/main/phoenix-core/intent/fast-path.js",
  "src/main/phoenix-core/intent/intent-engine.js",
  "src/main/phoenix-core/runtime/streaming-buffer.js",
  "src/main/phoenix-core/runtime/conversation-isolation.js",
  "src/main/phoenix-core/watchdog/heartbeat.js",
  "src/main/phoenix-core/watchdog/watchdog.js",
  "src/main/phoenix-core/runtime/phoenix-runtime.js",
  "src/main/agent/zip/zip-engine.js",
  "src/main/agent/zip/zip-analyzer.js",
  "src/main/agent/zip/zip-ipc.js",
  "src/main/agent/git/git-engine.js",
  "src/main/agent/git/git-analyzer.js",
  "src/main/agent/git/git-ipc.js",
  "src/main/agent/memory/project-store.js",
  "src/main/agent/memory/project-engine.js",
  "src/main/agent/memory/project-ipc.js",
  "src/main/agent/builder/builder-engine.js",
  "src/main/agent/builder/builder-ipc.js",
  "src/main/agent/plugins/plugin-store.js",
  "src/main/agent/plugins/plugin-engine.js",
  "src/main/agent/plugins/plugin-ipc.js",
  "src/main/agent/__tests__/builder-engine.test.js",
  "src/main/agent/__tests__/plugin-store.test.js",
  "src/main/agent/__tests__/project-store.test.js",
  "src/main/agent/__tests__/git-engine.test.js",
  "assets/logo.svg",
  "src/renderer/phoenix-splash.js",
  "src/renderer/phoenix-theme.css",
  "src/renderer/phoenix-splash.js"
];

const rootRequired = [
  "packages/phoenix-core/package.json",
  "packages/phoenix-core/index.js",
  "packages/phoenix-core/task-engine/create-task.js",
  "packages/phoenix-core/planner/plan-task.js",
  "packages/phoenix-core/orchestrator/orchestrate-task.js",
  "packages/phoenix-core/model-store/state.js",
  "packages/phoenix-core/model-store/recommendations.js",
  "packages/phoenix-core/model-store/index.js",
  "packages/phoenix-core/model-store/runtime-sync.js",
  "packages/phoenix-agents/package.json",
  "packages/phoenix-agents/index.js",
  "packages/phoenix-agents/project-builder/build-project-blueprint.js",
  "docs/PHOENIX_AUTO_PROVISIONING.md",
  "scripts/release.ps1"
];

for (const file of required) readText(join(root, file));
for (const file of rootRequired) readText(join(repoRoot, file));

const pkg = JSON.parse(readText(join(root, "package.json")));
if (!pkg.build?.nsis || !pkg.dependencies?.["electron-updater"]) throw new Error("Installer/updater configuration is missing");
if (pkg.build?.win?.requestedExecutionLevel !== "asInvoker") throw new Error("Windows installer must not request elevated privileges by default");
if (pkg.build?.asar !== true) throw new Error("Electron app should be packed with asar");
if (!pkg.build?.files?.some((entry) => String(entry).includes("!**/__pycache__/**"))) throw new Error("Desktop package must exclude Python cache artifacts");
if (!pkg.build?.asarUnpack?.some((e) => String(e).includes("archiver"))) throw new Error("archiver must be in asarUnpack to work outside asar");
if (!pkg.scripts?.["release:prepare"]) throw new Error("Phoenix release preparation script is missing");
if (!pkg.scripts?.["release:win"]) throw new Error("Windows release script is missing");

if (pkg.version !== "6.0.0-alpha.18") throw new Error(`Desktop package version must be 6.0.0-alpha.18, got ${pkg.version}`);

const phoenixCore = readText(join(repoRoot, "packages", "phoenix-core", "index.js"));
if (!phoenixCore.includes("runPhoenix") || !phoenixCore.includes("createTask") || !phoenixCore.includes("createModelStore")) throw new Error("Phoenix core entrypoint is incomplete");

const desktopStore = readText(join(root, "src", "main", "phoenix", "model-store", "index.js"));
if (!desktopStore.includes("createDesktopModelStore") || !desktopStore.includes("getModelForTask") || !desktopStore.includes("toSettingsPatch")) throw new Error("Desktop ModelStore is incomplete");

const coreKernel = readText(join(root, "src", "main", "phoenix-core", "kernel", "kernel.js"));
if (!coreKernel.includes("createPhoenixKernel") || !coreKernel.includes("classifyIntent") || !coreKernel.includes("fast_path")) throw new Error("Phoenix Core v2 kernel is incomplete");

const coreEventBus = readText(join(root, "src", "main", "phoenix-core", "kernel", "event-bus.js"));
if (!coreEventBus.includes("createEventBus") || !coreEventBus.includes("snapshot")) throw new Error("Phoenix Core v2 event bus is incomplete");

const coreRegistry = readText(join(root, "src", "main", "phoenix-core", "kernel", "task-registry.js"));
if (!coreRegistry.includes("createTaskRegistry") || !coreRegistry.includes("heartbeat") || !coreRegistry.includes("TASK_STATUS")) throw new Error("Phoenix Core v2 task registry is incomplete");

const coreIntent = readText(join(root, "src", "main", "phoenix-core", "intent", "intent-engine.js"));
if (!coreIntent.includes("classifyIntent") || !coreIntent.includes("project.generate") || !coreIntent.includes("fastPathAnswer")) throw new Error("Phoenix Core v2 intent engine is incomplete");

const coreFastPath = readText(join(root, "src", "main", "phoenix-core", "intent", "fast-path.js"));
if (!coreFastPath.includes("fastPathAnswer") || !coreFastPath.includes("Renault") || !coreFastPath.includes("calculatorAnswer")) throw new Error("Phoenix Core v2 fast path is incomplete");

const streamBuffer = readText(join(root, "src", "main", "phoenix-core", "runtime", "streaming-buffer.js"));
if (!streamBuffer.includes("createStreamingBuffer") || !streamBuffer.includes("taskId") || !streamBuffer.includes("append")) throw new Error("Phoenix Core v2 streaming buffer is incomplete");

const isolation = readText(join(root, "src", "main", "phoenix-core", "runtime", "conversation-isolation.js"));
if (!isolation.includes("createConversationIsolationStore") || !isolation.includes("attachTask") || !isolation.includes("conversationForTask")) throw new Error("Phoenix Core v2 conversation isolation is incomplete");

const heartbeat = readText(join(root, "src", "main", "phoenix-core", "watchdog", "heartbeat.js"));
if (!heartbeat.includes("createHeartbeatMonitor") || !heartbeat.includes("staleTasks") || !heartbeat.includes("isStale")) throw new Error("Phoenix Core v2 heartbeat monitor is incomplete");

const watchdog = readText(join(root, "src", "main", "phoenix-core", "watchdog", "watchdog.js"));
if (!watchdog.includes("createPhoenixWatchdog") || !watchdog.includes("WATCHDOG_STATUS") || !watchdog.includes("shouldAbort")) throw new Error("Phoenix Core v2 watchdog is incomplete");

const desktopTaskEngine = readText(join(root, "src", "main", "phoenix", "kernel", "task-engine.js"));
if (!desktopTaskEngine.includes("createTask") || !desktopTaskEngine.includes("classifyIntent") || !desktopTaskEngine.includes("agentsForIntent")) throw new Error("Desktop Phoenix Task Engine is incomplete");

const plannerAgent = readText(join(root, "src", "main", "phoenix", "agents", "planner", "planner-agent.js"));
if (!plannerAgent.includes("planTask") || !plannerAgent.includes("TASK-001") || !plannerAgent.includes("TASK-010") || !plannerAgent.includes("database")) throw new Error("Desktop Phoenix Planner Agent is incomplete");

const progressBus = readText(join(root, "src", "main", "phoenix", "kernel", "progress-bus.js"));
if (!progressBus.includes("createProgressBus") || !progressBus.includes("completed")) throw new Error("Phoenix Progress Bus is incomplete");

const backgroundJobs = readText(join(root, "src", "main", "phoenix", "kernel", "background-job-manager.js"));
if (!backgroundJobs.includes("createBackgroundJobManager") || !backgroundJobs.includes("startJob")) throw new Error("Phoenix Background Job Manager is incomplete");

const builderManifest = readText(join(root, "src", "main", "phoenix", "builder", "file-manifest.js"));
if (!builderManifest.includes("createManifest") || !builderManifest.includes("renderManifestSummary")) throw new Error("Phoenix Builder manifest is incomplete");

const serviceBuilder = readText(join(root, "src", "main", "phoenix", "builder", "service-automation-project.js"));
if (!serviceBuilder.includes("buildServiceAutomationProject") || !serviceBuilder.includes("database/schema.sql") || !serviceBuilder.includes("WorkOrderController")) throw new Error("Phoenix service automation builder is incomplete");

const taskEngine = readText(join(repoRoot, "packages", "phoenix-core", "task-engine", "create-task.js"));
if (!taskEngine.includes("createTask") || !taskEngine.includes("service_automation")) throw new Error("Phoenix task engine is incomplete");

const planner = readText(join(repoRoot, "packages", "phoenix-core", "planner", "plan-task.js"));
if (!planner.includes("planTask") || !planner.includes("work_orders")) throw new Error("Phoenix planner is incomplete");

const builder = readText(join(repoRoot, "packages", "phoenix-agents", "project-builder", "build-project-blueprint.js"));
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

console.log("CODEGA AI Phoenix Core v2 watchdog + isolation foundation OK");
