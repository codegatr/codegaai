import { readFileSync, readdirSync, existsSync } from "node:fs";
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
  "src/main/agent/__tests__/mission-os.test.js",
  "src/main/agent/__tests__/evolution-engine.test.js",
  "src/main/agent/mission/mission-types.js",
  "src/main/agent/mission/mission-store.js",
  "src/main/agent/mission/mission-planner.js",
  "src/main/agent/mission/mission-scheduler.js",
  "src/main/agent/mission/mission-executor.js",
  "src/main/agent/mission/mission-os.js",
  "src/main/agent/mission/mission-ipc.js",
  "src/main/agent/evolution/evolution-engine.js",
  "src/main/agent/evolution/codega-dna.js",
  "src/main/agent/context/context-engine.js",
  "src/main/agent/academy/curriculum.js",
  "src/main/agent/academy/academy-os.js",
  "src/main/agent/academy/academy-ipc.js",
  "src/main/agent/__tests__/academy.test.js",
  "src/main/agent/system-prompt.js",
  "src/main/agent/__tests__/system-prompt.test.js",
  "src/main/agent/sanitize-prompt.js",
  "src/main/agent/__tests__/sanitize-prompt.test.js",
  "src/main/agent/answer-adequacy.js",
  "src/main/agent/aep/engineering-timeline.js",
  "src/main/agent/aep/timeline-seed.js",
  "src/main/agent/__tests__/engineering-timeline.test.js",
  "src/main/agent/__tests__/aep-cycle-integration.test.js",
  "src/main/agent/__tests__/context-continuity.test.js",
  "src/main/agent/__tests__/ask-direct-simple-mode.test.js",
  "src/main/agent/__tests__/ace-brief.test.js",
  "src/main/agent/indexer/path-guard.js",
  "src/main/agent/indexer/file-lock.js",
  "src/main/agent/indexer/atomic-json-store.js",
  "src/main/agent/indexer/jsonl-chunk-store.js",
  "src/main/agent/indexer/dependency-graph.js",
  "src/main/agent/__tests__/indexer-file-lock.test.js",
  "src/main/agent/__tests__/indexer-storage.test.js",
  "src/main/agent/__tests__/indexer-path-guard.test.js",
  "src/main/agent/__tests__/indexer-dependency-graph.test.js",
  "src/main/agent/builder/builder-spec.js",
  "src/main/agent/builder/entity-php.js",
  "src/main/agent/builder/project-executor.js",
  "src/main/agent/builder/extract-files.js",
  "src/main/agent/builder/build-intent.js",
  "src/main/services/executor/native-zip.js",
  "src/main/services/executor/validate-files.js",
  "src/main/agent/reasoning-guardrails.js",
  "src/main/agent/anti-loop.js",
  "src/main/agent/answer-quality.js",
  "src/main/agent/__tests__/answer-quality.test.js",
  "src/main/agent/__tests__/native-zip.test.js",
  "src/main/agent/__tests__/validate-files.test.js",
  "src/main/agent/__tests__/reasoning-guardrails.test.js",
  "src/main/agent/__tests__/anti-loop.test.js",
  "src/main/agent/__tests__/builder-spec.test.js",
  "src/main/agent/__tests__/builder-entity-php.test.js",
  "src/main/agent/__tests__/builder-deliver.test.js",
  "src/main/agent/__tests__/answer-adequacy.test.js",
  "src/main/agent/__tests__/model-manager-short-answer-guard.test.js",
  "src/main/agent/__tests__/nirvana-regression.test.js",
  "src/main/cognitive/kernel/cognitive-kernel.js",
  "src/main/agent/__tests__/cognitive-gate.test.js",
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
// ZERO-DEPENDENCY ZIP: archiver tamamen kaldırıldı (OS-native Compress-Archive/zip).
if (pkg.dependencies?.archiver || pkg.devDependencies?.archiver) throw new Error("archiver bağımlılığı kaldırılmalı (OS-native ZIP kullanılıyor)");
if (pkg.build?.asarUnpack?.some((e) => String(e).includes("archiver"))) throw new Error("archiver asarUnpack'ten kaldırılmalı (artık kullanılmıyor)");
if (!pkg.scripts?.["release:prepare"]) throw new Error("Phoenix release preparation script is missing");
if (!pkg.scripts?.["release:win"]) throw new Error("Windows release script is missing");

// replaced below — see alpha.25 check
// if (pkg.version !== "6.0.0-alpha.24")(`Desktop package version must be 6.0.0-alpha.24, got ${pkg.version}`);

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

// MissionOS varlık kontrolleri
const missionOS = readText(join(root, "src/main/agent/mission/mission-os.js"));
if (!missionOS.includes("MissionOS") || !missionOS.includes("initMissionOS")) throw new Error("MissionOS is incomplete");

const missionSched = readText(join(root, "src/main/agent/mission/mission-scheduler.js"));
if (!missionSched.includes("topologicalSort") || !missionSched.includes("buildExecutionQueue")) throw new Error("MissionScheduler is incomplete");

const evolutionEng = readText(join(root, "src/main/agent/evolution/evolution-engine.js"));
if (!evolutionEng.includes("EvolutionEngine") || !evolutionEng.includes("analyze")) throw new Error("EvolutionEngine is incomplete");

const codegaDNAFile = readText(join(root, "src/main/agent/evolution/codega-dna.js"));
if (!codegaDNAFile.includes("CodegaDNA") || !codegaDNAFile.includes("DNA_VERDICT")) throw new Error("CODEGA DNA is incomplete");

const ctxEngine = readText(join(root, "src/main/agent/context/context-engine.js"));
if (!ctxEngine.includes("ContextEngine") || !ctxEngine.includes("CONTEXT_TYPE")) throw new Error("ContextEngine is incomplete");


// AEP dosya varlık + içerik kontrolleri
const aepFiles = [
  "src/main/agent/aep/engineering-backlog.js",
  "src/main/agent/aep/improvement-planner.js",
  "src/main/agent/aep/engineering-score.js",
  "src/main/agent/aep/patch-generator.js",
  "src/main/agent/aep/pr-agent.js",
  "src/main/agent/aep/learning-db.js",
  "src/main/agent/aep/competitive-intel.js",
  "src/main/agent/aep/ceg.js",
  "src/main/agent/aep/aep-os.js",
  "src/main/agent/aep/aep-ipc.js",
  "src/main/agent/__tests__/aep.test.js",
];
for (const file of aepFiles) readText(join(root, file));

const backlogFile = readText(join(root, "src/main/agent/aep/engineering-backlog.js"));
if (!backlogFile.includes("EngineeringBacklog") || !backlogFile.includes("SEVERITY")) throw new Error("EngineeringBacklog is incomplete");

const plannerFile = readText(join(root, "src/main/agent/aep/improvement-planner.js"));
if (!plannerFile.includes("ImprovementPlanner") || !plannerFile.includes("PROPOSAL_TYPE")) throw new Error("ImprovementPlanner is incomplete");

const scoreFile = readText(join(root, "src/main/agent/aep/engineering-score.js"));
if (!scoreFile.includes("EngineeringScorecard") || !scoreFile.includes("calcOverall")) throw new Error("EngineeringScorecard is incomplete");

const patchFile = readText(join(root, "src/main/agent/aep/patch-generator.js"));
if (!patchFile.includes("PatchGenerator") || !patchFile.includes("PATCH_STATUS")) throw new Error("PatchGenerator is incomplete");

const prFile = readText(join(root, "src/main/agent/aep/pr-agent.js"));
if (!prFile.includes("generatePRContent") || !prFile.includes("createGitHubPR")) throw new Error("PRAgent is incomplete");

const learningFile = readText(join(root, "src/main/agent/aep/learning-db.js"));
if (!learningFile.includes("LearningDatabase") || !learningFile.includes("LEARNING_TYPE")) throw new Error("LearningDatabase is incomplete");

const intelFile = readText(join(root, "src/main/agent/aep/competitive-intel.js"));
if (!intelFile.includes("CompetitiveIntel") || !intelFile.includes("COMPETITORS")) throw new Error("CompetitiveIntel is incomplete");

const cegFile = readText(join(root, "src/main/agent/aep/ceg.js"));
if (!cegFile.includes("CODEGAEG") || !cegFile.includes("CEG_QUESTIONS")) throw new Error("CODEGA Engineering Genome is incomplete");

const aepOsFile = readText(join(root, "src/main/agent/aep/aep-os.js"));
if (!aepOsFile.includes("AEPOS") || !aepOsFile.includes("initAEPOS") || !aepOsFile.includes("dashboard")) throw new Error("AEPOS is incomplete");

const preloadFile = readText(join(root, "src/main/preload.js"));
if (!preloadFile.includes("aep:dashboard") || !preloadFile.includes("aep:genome:report")) throw new Error("preload.js AEP API eksik");

// ACE — Artificial Cognition Engine (alpha.26)
const aceFiles = [
  "cognitive-types.js", "life-graph.js", "sensory-memory.js", "working-memory.js",
  "conversation-memory.js", "project-brain.js", "user-brain.js", "engineering-brain.js",
  "goal-memory.js", "reference-resolver.js", "context-reconstructor.js", "self-reflector.js",
  "ace-os.js", "ace-ipc.js",
];
for (const f of aceFiles) {
  const p = join(root, "src/main/agent/ace", f);
  if (!existsSync(p)) throw new Error("ACE dosyasi eksik: " + f);
}
const aceOsFile = readText(join(root, "src/main/agent/ace/ace-os.js"));
if (!aceOsFile.includes("ACEOS") || !aceOsFile.includes("initACEOS")) throw new Error("ace-os.js is incomplete");
const preloadFile2 = readText(join(root, "src/main/preload.js"));
if (!preloadFile2.includes("ace:dashboard") || !preloadFile2.includes("ace:reflect")) throw new Error("preload.js ACE API eksik");
if (!preloadFile2.includes("zip:export-project") || !preloadFile2.includes("zip:import-project")) throw new Error("preload.js güvenli proje ZIP API eksik");
if (!preloadFile2.includes("zip:save-files")) throw new Error("preload.js chat ZIP indirme API eksik");
const indexHtml = readText(join(root, "src/renderer/index.html"));
if (!indexHtml.includes("mode-tabs") || !indexHtml.includes('data-mode="cowork"') || !indexHtml.includes('data-mode="code"')) throw new Error("index.html Chat/Cowork/Code mod sekmeleri eksik");
const rendererFile2 = readText(join(root, "src/renderer/renderer.js"));
if (!rendererFile2.includes("attachZipFromPath") || !rendererFile2.includes("zip.saveFiles")) throw new Error("renderer.js chat içi ZIP oku/indir baglantisi eksik");
if (!rendererFile2.includes("MODE_DIRECTIVES")) throw new Error("renderer.js çalışma modu (MODE_DIRECTIVES) eksik");
const toolsFile = readText(join(root, "src/main/agent/tools.js"));
if (!toolsFile.includes("fetchTextResilient") || !toolsFile.includes("AUTH_WALL_RE")) throw new Error("tools.js kademeli public-içerik çekme (fetchTextResilient/AUTH_WALL_RE) eksik");
if (!rendererFile2.includes("msg-body") || !rendererFile2.includes("streamView.paint")) throw new Error("renderer.js akış DOM mikro-güncelleme (msg-body/streamView.paint) optimizasyonu eksik");
const ollamaClientFile = readText(join(root, "src/main/agent/ollama-client.js"));
if (!ollamaClientFile.includes("streamChatOnce") || !ollamaClientFile.includes("done_reason")) throw new Error("ollama-client.js çıktı-tavanı devam koruması (streamChatOnce/done_reason) eksik");
if (!ollamaClientFile.includes("adaptiveNumCtx")) throw new Error("ollama-client.js uyarlanır bağlam penceresi (adaptiveNumCtx) eksik");
const mmFile = readText(join(root, "src/main/model-manager.js"));
if (!mmFile.includes("_askBatched") || !mmFile.includes("chunkQuestions")) throw new Error("model-manager.js ardışık çok-soru kuyruğu (_askBatched/chunkQuestions) eksik");
if (!mmFile.includes("strongestInstalledModel") || !mmFile.includes("autoModelEscalation")) throw new Error("model-manager.js otomatik model yükseltme (strongestInstalledModel/autoModelEscalation) eksik");
const aepOsTimelineFile = readText(join(root, "src/main/agent/aep/aep-os.js"));
if (!aepOsTimelineFile.includes("EngineeringTimeline") || !aepOsTimelineFile.includes("this.timeline")) throw new Error("aep-os.js Engineering Timeline entegrasyonu eksik");
const mainEvoFile = readText(join(root, "src/main/main.js"));
if (!mainEvoFile.includes("maybeRunEvolutionCycle") || !mainEvoFile.includes("aepOS.runCycle")) throw new Error("main.js otonom evrim döngüsü (maybeRunEvolutionCycle/aepOS.runCycle) bağlanmamış");
if (!mmFile.includes("seedConversationHistory") || !mainEvoFile.includes("history:")) throw new Error("Bağlam sürekliliği (seedConversationHistory / renderer history taşıma) eksik");
if (!mmFile.includes("askDirect") || !mainEvoFile.includes("simpleMode")) throw new Error("Basit Mod (askDirect / simpleMode) eksik");
if (!mainEvoFile.includes("open-file-location") || !mainEvoFile.includes("showItemInFolder")) throw new Error("main.js Klasörde Göster IPC (open-file-location/showItemInFolder) eksik");
if (!rendererFile2.includes("renderMessageBody") || !rendererFile2.includes("action-link")) throw new Error("renderer.js action-link (renderMessageBody) eksik");
const fasFile = readText(join(root, "src/main/agent/final-answer-sanitizer.js"));
if (!fasFile.includes("isMultiQuestionInput")) throw new Error("final-answer-sanitizer.js çok-soru çökme koruması (isMultiQuestionInput) eksik");
const mainFile = readText(join(root, "src/main/main.js"));
if (!mainFile.includes("registerACEIpc")) throw new Error("main.js ACE IPC kaydi eksik");
if (!mainFile.includes("registerAcademyIpc")) throw new Error("main.js Academy IPC kaydi eksik");
if (!mainFile.includes("seedCoreEngineeringRules")) throw new Error("main.js Academy çekirdek kural seed çağrisi eksik");
const modelManagerFile = readText(join(root, "src/main/model-manager.js"));
if (!modelManagerFile.includes("sanitizePrompt")) throw new Error("model-manager.js isim temizleme (sanitizePrompt) baglantisi eksik");

const validateFilesFile = readText(join(root, "src/main/services/executor/validate-files.js"));
if (!validateFilesFile.includes("validateFiles") || !validateFilesFile.includes("isModuleSyntaxError")) throw new Error("validate-files.js Builder self-validation (validateFiles/isModuleSyntaxError) eksik");
if (!mainEvoFile.includes("validate-files") || !mainEvoFile.includes("UYARIYLA ÜRETİLDİ")) throw new Error("main.js deliver akışı ZIP öncesi self-validation (validate-files/uyarıyla üretildi) bağlanmamış");

const extractFilesFile = readText(join(root, "src/main/agent/builder/extract-files.js"));
if (!extractFilesFile.includes("fileNameFromContent") || !extractFilesFile.includes("fileNameFromComment")) throw new Error("extract-files.js akıllı dosya adı (fileNameFromContent/fileNameFromComment) eksik");
if (!/schema\.sql/.test(extractFilesFile) || !/\.htaccess/.test(extractFilesFile) || !/config\.php/.test(extractFilesFile)) throw new Error("extract-files.js içerik-tabanlı isimlendirme sezgileri (schema.sql/.htaccess/config.php) eksik");

if (!mainEvoFile.includes("isSubPath") || !mainEvoFile.includes("resolvedTarget")) throw new Error("main.js Klasörde Göster salt-okunur sağlam containment (isSubPath/resolvedTarget) eksik");

if (!modelManagerFile.includes("direct_research") || !modelManagerFile.includes("wantsWebResearch")) throw new Error("model-manager.js askDirect web araştırma (direct_research/wantsWebResearch) eksik");

const guardrailsFile = readText(join(root, "src/main/agent/reasoning-guardrails.js"));
if (!guardrailsFile.includes("MANTIK VE DİKKAT KATMANI") || !guardrailsFile.includes("REASONING_GUARDRAILS")) throw new Error("reasoning-guardrails.js muhakeme/dikkat katmanı eksik");
if (!modelManagerFile.includes("REASONING_GUARDRAILS")) throw new Error("model-manager.js askDirect muhakeme katmanı (REASONING_GUARDRAILS) enjekte edilmemiş");
const sysPromptFile = readText(join(root, "src/main/agent/system-prompt.js"));
if (!sysPromptFile.includes("REASONING_GUARDRAILS")) throw new Error("system-prompt.js derin yol muhakeme katmanı (REASONING_GUARDRAILS) eksik");
const ollamaClientTempFile = readText(join(root, "src/main/agent/ollama-client.js"));
if (!/DEFAULT_TEMPERATURE\s*=\s*0\.2\b/.test(ollamaClientTempFile)) throw new Error("ollama-client.js kararlı üretim için DEFAULT_TEMPERATURE=0.2 olmalı");

const antiLoopFile = readText(join(root, "src/main/agent/anti-loop.js"));
if (!antiLoopFile.includes("collapseRepetition") || !antiLoopFile.includes("detectRunawayRepetition")) throw new Error("anti-loop.js tekrar/döngü temizliği (collapseRepetition/detectRunawayRepetition) eksik");
if (!modelManagerFile.includes("collapseRepetition")) throw new Error("model-manager.js generate anti-loop (collapseRepetition) enjekte edilmemiş");
if (!modelManagerFile.includes("direct_research_failed")) throw new Error("model-manager.js araştırma başarısızsa uydurma önleme (direct_research_failed) eksik");
if (!antiLoopFile.includes("truncateAtPhraseLoop")) throw new Error("anti-loop.js run-on ifade tekrarı kesici (truncateAtPhraseLoop) eksik");
if (!modelManagerFile.includes("domMatch")) throw new Error("model-manager.js extractResearchQuery domain-öncelikli/Türkçe-güvenli (domMatch) değil");
if (!modelManagerFile.includes("groundResearchAnswer") || !modelManagerFile.includes("parseResearchSources")) throw new Error("model-manager.js web araştırma grounding (groundResearchAnswer/parseResearchSources) eksik");
if (!ollamaClientFile.includes("keep_alive") || !ollamaClientFile.includes("DEFAULT_KEEP_ALIVE")) throw new Error("ollama-client.js modeli sıcak tutma (keep_alive/DEFAULT_KEEP_ALIVE) eksik");
if (!modelManagerFile.includes("İNSANİ TON")) throw new Error("model-manager.js varsayılan yolda insani ton katmanı (İNSANİ TON) eksik");
const answerQualityFile = readText(join(root, "src/main/agent/answer-quality.js"));
if (!answerQualityFile.includes("looksDegenerate")) throw new Error("answer-quality.js bozuk cevap sezici (looksDegenerate) eksik");
if (!answerQualityFile.includes("hasCharSalad")) throw new Error("answer-quality.js karakter salatası sezici (hasCharSalad) eksik");
if (!modelManagerFile.includes("direct_selfcorrected") || !modelManagerFile.includes("looksDegenerate")) throw new Error("model-manager.js askDirect öz-düzeltme (direct_selfcorrected/looksDegenerate) eksik");

if (!rendererFile2.includes("zip.analyze") || !rendererFile2.includes("ANALİZ (otomatik)")) throw new Error("renderer.js ZIP eklentisinde yapılandırılmış analiz (zip.analyze/ANALİZ) sohbete bağlanmamış");
if (!modelManagerFile.includes("wantsSiteAudit") || !modelManagerFile.includes("direct_site_audit")) throw new Error("model-manager.js site denetimi (wantsSiteAudit/direct_site_audit) eksik");

if (!modelManagerFile.includes("rankResearchSources") || !modelManagerFile.includes("sourceFreshnessLabel")) throw new Error("model-manager.js kaynak kalitesi (rankResearchSources/sourceFreshnessLabel) eksik");

if (!ollamaClientFile.includes("detectRunawayRepetition") || !ollamaClientFile.includes('"runaway"')) throw new Error("ollama-client.js kaçak üretim canlı kesici (detectRunawayRepetition/runaway) eksik");

const cloudProviderFile = readText(join(root, "src/main/agent/cloud-provider.js"));
if (!cloudProviderFile.includes("claude-opus-4-8") || !cloudProviderFile.includes("anthropicSamplingRemoved")) throw new Error("cloud-provider.js güncel Claude modeli (claude-opus-4-8/anthropicSamplingRemoved) eksik");
if (cloudProviderFile.includes("claude-sonnet-4-20250514")) throw new Error("cloud-provider.js emekli Claude modeline (claude-sonnet-4-20250514) referans içermemeli");

if (pkg.version !== "6.0.0-alpha.101") throw new Error(`Desktop package version must be 6.0.0-alpha.101, got ${pkg.version}`);

// macOS universal binary kontrolu (ARM64 Gatekeeper fix)
const macTargets = pkg.build?.mac?.target || [];
const hasUniversal = macTargets.some(t => (t.arch || []).includes("universal"));
if (!hasUniversal) throw new Error("macOS build must target universal arch for ARM64 compatibility");


// ── Sözdizimi/Bütünlük Kontrolü ───────────────────────────────────────────────
// HER main-process JS dosyası `node --check` ile doğrulanır. Tek bir el-seçimi
// liste DEĞİL — src/ altındaki tüm .js/.cjs/.mjs dosyaları taranır. Böylece
// kesilmiş/bozuk (truncated, "Unexpected end of input") bir dosya ASLA release'e
// çıkamaz. Bu, geçmişte kullanıcı makinesinde "A JavaScript error occurred in the
// main process" çökmesine yol açan installer.js truncation'ı gibi hataları yakalar.
import { execSync } from "node:child_process";
import { statSync } from "node:fs";

function walkJsFiles(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkJsFiles(full));
    } else if (/\.(c|m)?js$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const srcRoot   = join(root, "src");
const jsFiles   = walkJsFiles(srcRoot);

// Güvenlik ağı: beklenenden çok az dosya bulunduysa tarama yanlış kökten
// çalışıyordur — sessizce geçmek yerine başarısız ol.
if (jsFiles.length < 50) {
  throw new Error(`Syntax tarama şüpheli: src/ altında sadece ${jsFiles.length} JS dosyası bulundu (beklenen >=50). Yol yanlış olabilir.`);
}

const syntaxErrors = [];
for (const f of jsFiles) {
  // Boş dosya da bir truncation işareti olabilir — uyar.
  try {
    if (statSync(f).size === 0) { syntaxErrors.push(`${f}: dosya boş (0 byte) — olası truncation`); continue; }
  } catch { /* statSync hatası önemsiz */ }
  try {
    execSync(`node --check "${f}"`, { stdio: "pipe" });
  } catch (e) {
    syntaxErrors.push(`${f.replace(root, "")}:\n${e.stderr?.toString() || e.message}`);
  }
}

if (syntaxErrors.length) {
  throw new Error(`Sözdizimi/bütünlük hatası (${syntaxErrors.length} dosya):\n\n${syntaxErrors.join("\n\n")}`);
}

console.log(`CODEGA AI check OK — ${jsFiles.length} JS dosyası sözdizimi doğrulandı, sürüm ${pkg.version}`);
