"use strict";

const { createInitialModelState, normalizeModelList, patchModelState } = require("./state");
const { recommendForHardware, compareRecommendation } = require("./recommendations");

function createDesktopModelStore(initial = {}) {
  let state = createInitialModelState(initial);
  const listeners = new Set();

  function snapshot() {
    return JSON.parse(JSON.stringify(state));
  }

  function emit() {
    const next = snapshot();
    for (const listener of listeners) {
      try { listener(next); } catch (_error) {}
    }
  }

  function setState(patch = {}) {
    state = patchModelState(state, patch);
    emit();
    return snapshot();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function hydrateFromSettings(settings = {}, installedModels = []) {
    const installed = normalizeModelList(installedModels);
    const hardware = settings.hardwareProfile || settings.hardware || state.hardware || {};
    const recommended = recommendForHardware(hardware, installed);
    return setState({
      installedModels: installed,
      hardware,
      recommended,
      chatModel: settings.defaultChatModel || settings.chatModel || settings.defaultModel || settings.model || recommended.chat,
      shortFactModel: settings.defaultShortFactModel || settings.shortFactModel || recommended.shortFact,
      codeModel: settings.defaultCodeModel || settings.codeModel || recommended.code,
      planningModel: settings.defaultPlanningModel || settings.planningModel || recommended.planning,
      visionModel: settings.defaultVisionModel || settings.visionModel || recommended.vision,
    });
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

  function setInstalledModels(models = []) {
    const installed = normalizeModelList(models);
    return setState({ installedModels: installed, recommended: recommendForHardware(state.hardware, installed) });
  }

  function setHardwareProfile(hardware = {}) {
    return setState({ hardware, recommended: recommendForHardware(hardware, state.installedModels) });
  }

  function setActiveRuntimeModel(model) {
    return setState({ activeRuntimeModel: model });
  }

  function getModelForTask(task = {}) {
    const type = typeof task === "string" ? task : task.intent || task.type || "chat";
    if (type === "short_fact" || type === "shortFact") return state.shortFactModel;
    if (type === "code") return state.codeModel;
    if (type === "planning" || type === "analysis" || type === "project") return state.planningModel;
    if (type === "vision" || type === "image") return state.visionModel;
    return state.chatModel;
  }

  function toSettingsPatch() {
    return {
      defaultModel: state.chatModel,
      defaultChatModel: state.chatModel,
      defaultShortFactModel: state.shortFactModel,
      defaultCodeModel: state.codeModel,
      defaultPlanningModel: state.planningModel,
      defaultVisionModel: state.visionModel,
      hardwareProfile: state.hardware,
    };
  }

  function getHealth() {
    return {
      ...compareRecommendation(state),
      activeRuntimeModel: state.activeRuntimeModel,
      installedCount: state.installedModels.length,
    };
  }

  return {
    getState: snapshot,
    setState,
    subscribe,
    hydrateFromSettings,
    setRoleModel,
    setInstalledModels,
    setHardwareProfile,
    setActiveRuntimeModel,
    getModelForTask,
    toSettingsPatch,
    getHealth,
  };
}

module.exports = {
  createDesktopModelStore,
};
