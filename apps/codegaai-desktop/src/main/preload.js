const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codega", {
  getStatus: () => ipcRenderer.invoke("app:status"),
  getModels: () => ipcRenderer.invoke("models:list"),
  moveModelStorage: () => ipcRenderer.invoke("model-storage:move"),
  sendMessage: (message, opts) => ipcRenderer.invoke("chat:send", message, opts),
  shareChat: (chat) => ipcRenderer.invoke("chat:share", chat),
  prepareModel: (modelId) => ipcRenderer.invoke("model:prepare", modelId),
  listModels: () => ipcRenderer.invoke("models:list"),
  deleteModel: (payload) => ipcRenderer.invoke("model:delete", payload),
  setupModel: (payload) => ipcRenderer.invoke("model:setup", payload),
  modelUpdatesStatus: () => ipcRenderer.invoke("model-updates:status"),
  checkModelUpdates: () => ipcRenderer.invoke("model-updates:check"),
  applyModelUpdate: (name) => ipcRenderer.invoke("model-updates:apply", name),
  getMetrics: () => ipcRenderer.invoke("metrics:get"),
  getStats: () => ipcRenderer.invoke("stats:get"),
  getLogs: () => ipcRenderer.invoke("logs:get"),
  automationsStatus: () => ipcRenderer.invoke("automations:status"),
  agentWatchStatus: () => ipcRenderer.invoke("agent-watch:status"),
  runAgentWatch: () => ipcRenderer.invoke("agent-watch:scan"),
  openExternal: (url) => ipcRenderer.invoke("external:open", url),
  securityStatus: () => ipcRenderer.invoke("security:status"),
  routerInfo: () => ipcRenderer.invoke("router:info"),
  routerTest: (payload) => ipcRenderer.invoke("router:test", payload),
  clearLogs: () => ipcRenderer.invoke("logs:clear"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  listMemory: () => ipcRenderer.invoke("memory:list"),
  clearMemory: () => ipcRenderer.invoke("memory:clear"),
  testGithub: () => ipcRenderer.invoke("github:test"),
  syncKnowledgeUp: () => ipcRenderer.invoke("knowledge:syncUp"),
  syncKnowledgeDown: () => ipcRenderer.invoke("knowledge:syncDown"),
  installOllama: () => ipcRenderer.invoke("ollama:install"),
  ragIngest: (payload) => ipcRenderer.invoke("rag:ingest", payload),
  ragStats: () => ipcRenderer.invoke("rag:stats"),
  ragList: () => ipcRenderer.invoke("rag:list"),
  ragDelete: (payload) => ipcRenderer.invoke("rag:delete", payload),
  ragSearch: (payload) => ipcRenderer.invoke("rag:search", payload),
  ragClear: () => ipcRenderer.invoke("rag:clear"),
  runMaintenance: () => ipcRenderer.invoke("maintenance:run"),
  maintenanceStatus: () => ipcRenderer.invoke("maintenance:status"),
  proposeImprovement: (payload) => ipcRenderer.invoke("improve:propose", payload),
  runAutonomousDevelopment: (payload) => ipcRenderer.invoke("development:run", payload),
  autonomousDevelopmentStatus: () => ipcRenderer.invoke("development:status"),
  improveDrafts: () => ipcRenderer.invoke("improve:drafts"),
  clearImproveDrafts: () => ipcRenderer.invoke("improve:clearDrafts"),
  recordFeedback: (payload) => ipcRenderer.invoke("feedback:record", payload),
  feedbackStats: () => ipcRenderer.invoke("feedback:stats"),
  analyzeSystem: () => ipcRenderer.invoke("system:analyze"),
  cookbookScan: () => ipcRenderer.invoke("cookbook:scan"),
  testProvider: (payload) => ipcRenderer.invoke("provider:test", payload),
  runCode: (payload) => ipcRenderer.invoke("code:run", payload),
  devPrompt: (payload) => ipcRenderer.invoke("dev:prompt", payload),
  abortChat: () => ipcRenderer.invoke("chat:abort"),
  mcpListTools: (payload) => ipcRenderer.invoke("mcp:listTools", payload),
  mcpCallTool: (payload) => ipcRenderer.invoke("mcp:callTool", payload),
  mcpRefreshTools: () => ipcRenderer.invoke("mcp:refreshTools"),
  learnNow: (payload) => ipcRenderer.invoke("learning:now", payload),
  learningList: () => ipcRenderer.invoke("learning:list"),
  clearLearning: () => ipcRenderer.invoke("learning:clear"),
  onChatStream: (cb) => {
    const handler = (_e, token) => cb(token);
    ipcRenderer.on("chat:stream", handler);
    return () => ipcRenderer.removeListener("chat:stream", handler);
  },
  onModelStatus: (callback) => {
    ipcRenderer.on("model:status", (_event, payload) => callback(payload));
  },
  onModelUpdateStatus: (callback) => {
    ipcRenderer.on("model-updates:status", (_event, payload) => callback(payload));
  },
  onModelStorageStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("model-storage:status", handler);
    return () => ipcRenderer.removeListener("model-storage:status", handler);
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on("updates:status", (_event, payload) => callback(payload));
  },
});
