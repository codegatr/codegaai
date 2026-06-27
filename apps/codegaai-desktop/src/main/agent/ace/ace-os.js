"use strict";
/**
 * ACE OS — Artificial Cognition Engine Orchestrator
 * Tüm katmanları başlatır ve koordine eder.
 * Her LLM çağrısından önce bağlam inşa eder.
 * Her konuşma sonunda öz-yansıma tetikler.
 */
const path = require("node:path");
const { app } = require("electron");

const { COGNITIVE_LAYER, REFLECTION_TRIGGER } = require("./cognitive-types");
const { LifeGraph }             = require("./life-graph");
const { SensoryMemory }         = require("./sensory-memory");
const { WorkingMemory }         = require("./working-memory");
const { ConversationMemory }    = require("./conversation-memory");
const { ProjectBrain }          = require("./project-brain");
const { UserBrain }             = require("./user-brain");
const { EngineeringBrain }      = require("./engineering-brain");
const { GoalMemory }            = require("./goal-memory");
const { ContextReconstructor }  = require("./context-reconstructor");
const { SelfReflector }         = require("./self-reflector");
const { resolveReference, isReferenceMessage } = require("./reference-resolver");

let _aceInstance = null;

class ACEOS {
  constructor(dataDir) {
    this._dataDir = dataDir;
    this._ready   = false;

    // ── Katmanlar ─────────────────────────────────────────────────────────────
    this.lifeGraph          = new LifeGraph(dataDir);
    this.sensoryMemory      = new SensoryMemory();
    this.workingMemory      = new WorkingMemory();
    this.conversationMemory = new ConversationMemory(dataDir);
    this.projectBrain       = new ProjectBrain(dataDir);
    this.userBrain          = new UserBrain(dataDir);
    this.engineeringBrain   = new EngineeringBrain(dataDir);
    this.goalMemory         = new GoalMemory(dataDir);

    // ── Üst Servisler ────────────────────────────────────────────────────────
    this.contextReconstructor = new ContextReconstructor({
      userBrain          : this.userBrain,
      projectBrain       : this.projectBrain,
      conversationMemory : this.conversationMemory,
      goalMemory         : this.goalMemory,
      engineeringBrain   : this.engineeringBrain,
      lifeGraph          : this.lifeGraph,
      workingMemory      : this.workingMemory,
    });

    this.selfReflector = new SelfReflector({
      conversationMemory : this.conversationMemory,
      projectBrain       : this.projectBrain,
      userBrain          : this.userBrain,
      engineeringBrain   : this.engineeringBrain,
      workingMemory      : this.workingMemory,
    });
  }

  async init() {
    if (this._ready) return this;
    this.lifeGraph.init();
    this.conversationMemory.init();
    this.projectBrain.init();
    this.userBrain.init();
    this.engineeringBrain.init();
    this.goalMemory.init();
    this._ready = true;
    console.log("[ACE OS] Artificial Cognition Engine hazır.");
    return this;
  }

  /** Her LLM çağrısından önce çalıştır */
  buildContext({ userId="default", topic="", maxTokens=2000 }={}) {
    const project = this.workingMemory.snapshot().activeProject;
    return this.contextReconstructor.reconstruct({ userId, projectLabel: project, topic, maxTokens });
  }

  /**
   * Gelen mesajı işle:
   * 1. Referans çözümle ("devam et" → gerçek görev)
   * 2. Sensory memory'ye yaz
   * 3. Working memory turn sayısını artır
   * @returns {{ message: string, resolved: boolean, context: object }}
   */
  processIncoming(rawMessage, userId="default") {
    // Referans çözümleme
    let message = rawMessage;
    let resolved = false;
    let refCtx   = {};

    if (isReferenceMessage(rawMessage)) {
      const result = resolveReference(rawMessage, this.workingMemory, this.lifeGraph);
      if (result.resolved) {
        message  = result.expandedMessage;
        resolved = true;
        refCtx   = result.context;
      }
    }

    // Sensory memory
    this.sensoryMemory.setMessage({ role: "user", content: message });

    // Working memory turn
    const wm = this.workingMemory;
    wm.incrementTurn();

    return { message, resolved, refCtx };
  }

  /** Her konuşma sonunda çağır */
  async endConversation({ userId="default", generateFn=null }={}) {
    return this.selfReflector.reflect({
      trigger  : REFLECTION_TRIGGER.END_OF_CONVERSATION,
      userId,
      generateFn,
    });
  }

  /** Yeni proje aktive et */
  activateProject(label, userId="default") {
    this.workingMemory.setProject(label);
    this.userBrain.addProject(userId, label);

    // Life graph'e ekle
    this.lifeGraph.upsertNode({ id: label, type: "PROJECT", label, layer: "L4_PROJECT" });
    const userNode = this.lifeGraph.getNode(userId) || null;
    if (!userNode) this.lifeGraph.upsertNode({ id: userId, type: "PERSON", label: userId, layer: "L5_USER" });
    this.lifeGraph.upsertEdge({ from: userId, to: label, type: "BELONGS_TO" });
  }

  /** Dashboard verisi */
  dashboard() {
    return {
      lifeGraph    : this.lifeGraph.summary(),
      workingMemory: this.workingMemory.snapshot(),
      userBrain    : this.userBrain.summary(),
      goals        : this.goalMemory.summary(),
      engineering  : this.engineeringBrain.summary(),
      reflection   : this.selfReflector.summary(),
      ready        : this._ready,
    };
  }
}

async function initACEOS(dataDir) {
  if (!_aceInstance) {
    _aceInstance = new ACEOS(dataDir);
    await _aceInstance.init();
  }
  return _aceInstance;
}

function getACEOS() { return _aceInstance; }

module.exports = { ACEOS, initACEOS, getACEOS };
