const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codega", {
  getStatus: () => ipcRenderer.invoke("app:status"),
  getModels: () => ipcRenderer.invoke("models:list"),
  sendMessage: (message) => ipcRenderer.invoke("chat:send", message),
  shareChat: (chat) => ipcRenderer.invoke("chat:share", chat),
  prepareModel: (modelId) => ipcRenderer.invoke("model:prepare", modelId),
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
  ragClear: () => ipcRenderer.invoke("rag:clear"),
  runMaintenance: () => ipcRenderer.invoke("maintenance:run"),
  maintenanceStatus: () => ipcRenderer.invoke("maintenance:status"),
  onModelStatus: (callback) => {
    ipcRenderer.on("model:status", (_event, payload) => callback(payload));
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on("updates:status", (_event, payload) => callback(payload));
  },
});
