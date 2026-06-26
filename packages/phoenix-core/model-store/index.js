"use strict";

const { createInitialState, normalizeModelList, withPatch } = require("./state");
const { recommendForHardware, compareRecommendation } = require("./recommendations");

function createModelStore(initial = {}) {
  let state = createInitialState(initial);
  const listeners = new Set();

  function notify() {
    const snapshot = getState();
    for (const listener of listeners) {
      try { listener(snapshot); } catch (_error) {}
    }
  }

  function setState(patch = {}) {
    state = withPatch(state, patch);
    notify();
    return getState();
  }

  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function setInstalledModels(models = []) {
    return setState({ installedModels: normalizeModelList(models) });
  }

  function setHardwareProfile(hardware = {}) {
    const nextRecommended = recommendForHardware(hardware, state.installedModels);
    return setState({ hardware, recommended: nextRecommended });
  }

  function setRoleModel(role, model) {
    const map = {
      chat: "chatModel",
      shortFact: "shortFactModel",
      code: "codeModel",
      planning: "planningModel",
      vision: "visionModel",
    };
    const key = map[role];
    if (!key) throw new Error(`Unknown model role: ${role}`);
    return setState({ [key]: model });
  }

  function setActiveRuntimeModel(model) {
    return setState({ activeRuntimeModel: model });
  }

  function applyRecommended(role = "chat") {
    const recommended = state.recommended || {};
    const target = recommended[role];
    if (!target) throw new Error(`No recommendation for role: ${role}`);
    return setRoleModel(role, target);
  }

  function getModelForTask(task = {}) {
    const intent = typeof task === "string" ? task : task.intent || task.type || "chat";
    if (intent === "short_fact" || intent === "shortFact") return state.shortFactModel;
    if (intent === "code") return state.codeModel;
    if (intent === "planning" || intent === "analysis" || intent === "project") return state.planningModel;
    if (intent === "vision" || intent === "image") return state.visionModel;
    return state.chatModel;
  }

  function getHealth() {
    return {
      ...compareRecommendation(state),
      activeRuntimeModel: state.activeRuntimeModel,
      installedCount: state.installedModels.length,
    };
  }

  return {
    getState,
    setState,
    subscribe,
    setInstalledModels,
    setHardwareProfile,
    setRoleModel,
    setActiveRuntimeModel,
    applyRecommended,
    getModelForTask,
    getHealth,
  };
}

module.exports = {
  createModelStore,
};
