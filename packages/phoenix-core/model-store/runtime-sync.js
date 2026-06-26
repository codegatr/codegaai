"use strict";

async function syncRoleToRuntime({ store, role = "chat", adapters = {} } = {}) {
  if (!store || typeof store.getState !== "function") throw new Error("ModelStore is required");
  const state = store.getState();
  const model = store.getModelForTask(role);

  if (typeof adapters.persistSettings === "function") {
    await adapters.persistSettings({
      defaultModel: state.chatModel,
      defaultChatModel: state.chatModel,
      defaultShortFactModel: state.shortFactModel,
      defaultCodeModel: state.codeModel,
      defaultPlanningModel: state.planningModel,
      defaultVisionModel: state.visionModel,
    });
  }

  if (typeof adapters.setRuntimeModel === "function") {
    await adapters.setRuntimeModel(model, { role });
  }

  store.setActiveRuntimeModel(model);

  if (typeof adapters.broadcast === "function") {
    adapters.broadcast("model-store:updated", store.getState());
  }

  return store.getState();
}

module.exports = {
  syncRoleToRuntime,
};
