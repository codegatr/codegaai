const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codega", {
  getStatus: () => ipcRenderer.invoke("app:status"),
  getModels: () => ipcRenderer.invoke("models:list"),
  sendMessage: (message) => ipcRenderer.invoke("chat:send", message),
  prepareModel: (modelId) => ipcRenderer.invoke("model:prepare", modelId),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onModelStatus: (callback) => {
    ipcRenderer.on("model:status", (_event, payload) => callback(payload));
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on("updates:status", (_event, payload) => callback(payload));
  },
});
