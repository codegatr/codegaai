"use strict";

/**
 * life-graph.js — CODEGA AI Life Graph (Bilgi Grafiği)
 *
 * Sprint ACE: Artificial Cognition Engine
 *
 * Konuşma ID'si yok. Life Graph var.
 * "Yunus → CODEGA → Ateş Fiat → PHP → MariaDB → Builder → Sprint 14 → Bugün"
 *
 * Linear mesaj listesi değil — bağlantılı anlam ağı.
 * Her yeni konuşma grafiği günceller, mesaj eklemez.
 */

const fs   = require("node:fs");
const path = require("node:path");
const { NODE_TYPE, EDGE_TYPE, createNode, createEdge } = require("./cognitive-types");

class LifeGraph {
  constructor(dataDir) {
    this._dataDir   = dataDir;
    this._graphPath = path.join(dataDir, "life-graph.json");
    this._nodes     = new Map();  // id → node
    this._edges     = new Map();  // id → edge
    this._adjOut    = new Map();  // nodeId → Set<edgeId> (giden kenarlar)
    this._adjIn     = new Map();  // nodeId → Set<edgeId> (gelen kenarlar)
  }

  init() {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      if (fs.existsSync(this._graphPath)) {
        const raw = JSON.parse(fs.readFileSync(this._graphPath, "utf8"));
        for (const n of (raw.nodes || [])) this._addNodeInternal(n);
        for (const e of (raw.edges || [])) this._addEdgeInternal(e);
      }
    } catch (e) {
      console.warn("[LifeGraph] init:", e.message);
    }
    return this;
  }

  _save() {
    try {
      fs.writeFileSync(this._graphPath, JSON.stringify({
        version  : 2,
        savedAt  : Date.now(),
        nodeCount: this._nodes.size,
        edgeCount: this._edges.size,
        nodes    : [...this._nodes.values()],
        edges    : [...this._edges.values()],
      }, null, 2), "utf8");
    } catch (e) {
      console.warn("[LifeGraph] save:", e.message);
    }
  }

  // ── Düğüm İşlemleri ─────────────────────────────────────────────────────────

  _addNodeInternal(node) {
    this._nodes.set(node.id, node);
    if (!this._adjOut.has(node.id)) this._adjOut.set(node.id, new Set());
    if (!this._adjIn.has(node.id))  this._adjIn.set(node.id,  new Set());
  }

  /**
   * Düğüm ekle veya güncelle (upsert).
   * Aynı type+label varsa mevcut düğümü günceller.
   */
  upsertNode(opts) {
    const existing = this._findByTypeLabel(opts.type, opts.label);
    if (existing) {
      Object.assign(existing.data, opts.data || {});
      existing.updatedAt = Date.now();
      if (opts.confidence !== undefined) existing.confidence = opts.confidence;
      this._save();
      return existing;
    }
    const node = createNode(opts);
    this._addNodeInternal(node);
    this._save();
    return node;
  }

  getNode(id) {
    const n = this._nodes.get(id);
    if (n) { n.accessCount = (n.accessCount || 0) + 1; }
    return n || null;
  }

  findByType(type) {
    return [...this._nodes.values()].filter(n => n.type === type);
  }

  _findByTypeLabel(type, label) {
    const l = String(label || "").trim().toLowerCase();
    return [...this._nodes.values()].find(
      n => n.type === type && n.label.toLowerCase() === l
    ) || null;
  }

  updateNode(id, patch = {}) {
    const n = this._nodes.get(id);
    if (!n) return null;
    Object.assign(n.data, patch.data || {});
    if (patch.label) n.label = patch.label;
    if (patch.confidence !== undefined) n.confidence = patch.confidence;
    n.updatedAt = Date.now();
    this._save();
    return n;
  }

  // ── Kenar İşlemleri ──────────────────────────────────────────────────────────

  _addEdgeInternal(edge) {
    this._edges.set(edge.id, edge);
    if (!this._adjOut.has(edge.from)) this._adjOut.set(edge.from, new Set());
    if (!this._adjIn.has(edge.to))    this._adjIn.set(edge.to,    new Set());
    this._adjOut.get(edge.from).add(edge.id);
    this._adjIn.get(edge.to).add(edge.id);
  }

  /**
   * Kenar ekle (idempotent — aynı from+type+to tekrar eklemez, weight günceller).
   */
  upsertEdge(opts) {
    const id = `${opts.from}->${opts.type}->${opts.to}`;
    const existing = this._edges.get(id);
    if (existing) {
      existing.weight = Math.min(10, (existing.weight || 1) + 0.1);
      existing.updatedAt = Date.now();
      this._save();
      return existing;
    }
    // Düğümler yoksa oluşturma — sadece var olan düğümler arası kenar
    if (!this._nodes.has(opts.from) || !this._nodes.has(opts.to)) {
      return null;
    }
    const edge = createEdge(opts);
    this._addEdgeInternal(edge);
    this._save();
    return edge;
  }

  // ── Gezinme ──────────────────────────────────────────────────────────────────

  /** Bir düğümden giden tüm kenarları getir */
  outEdges(nodeId) {
    const ids = this._adjOut.get(nodeId) || new Set();
    return [...ids].map(id => this._edges.get(id)).filter(Boolean);
  }

  /** Bir düğüme gelen tüm kenarları getir */
  inEdges(nodeId) {
    const ids = this._adjIn.get(nodeId) || new Set();
    return [...ids].map(id => this._edges.get(id)).filter(Boolean);
  }

  /** Bir düğümün komşularını getir (BFS, maxDepth derinliğe kadar) */
  neighbors(nodeId, maxDepth = 2) {
    const visited = new Set([nodeId]);
    const result  = [];
    const queue   = [{ id: nodeId, depth: 0 }];

    while (queue.length) {
      const { id, depth } = queue.shift();
      if (depth >= maxDepth) continue;
      for (const edge of this.outEdges(id)) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          const node = this._nodes.get(edge.to);
          if (node) {
            result.push({ node, edge, depth: depth + 1 });
            queue.push({ id: edge.to, depth: depth + 1 });
          }
        }
      }
    }
    return result;
  }

  /**
   * Life Graph traversal: bir düğümden başlayarak tüm bağlamı yeniden inşa et.
   * @param {string} startNodeId
   * @returns {LifeContext}
   */
  traverse(startNodeId) {
    const startNode = this._nodes.get(startNodeId);
    if (!startNode) return { found: false };

    const neighbors = this.neighbors(startNodeId, 3);
    const context = {
      found    : true,
      root     : startNode,
      projects : [],
      missions : [],
      goals    : [],
      decisions: [],
      technologies: [],
      bugs     : [],
      solutions: [],
      people   : [],
      path     : [],
    };

    for (const { node, edge, depth } of neighbors) {
      context.path.push(`${startNode.label} →[${edge.type}]→ ${node.label}`);
      switch (node.type) {
        case NODE_TYPE.PROJECT:     context.projects.push(node);     break;
        case NODE_TYPE.MISSION:     context.missions.push(node);     break;
        case NODE_TYPE.GOAL:        context.goals.push(node);        break;
        case NODE_TYPE.DECISION:    context.decisions.push(node);    break;
        case NODE_TYPE.TECHNOLOGY:  context.technologies.push(node); break;
        case NODE_TYPE.BUG:         context.bugs.push(node);         break;
        case NODE_TYPE.SOLUTION:    context.solutions.push(node);    break;
        case NODE_TYPE.PERSON:      context.people.push(node);       break;
      }
    }

    return context;
  }

  // ── Arama ────────────────────────────────────────────────────────────────────

  /**
   * Label veya data içinde arama.
   */
  search(query, { type = null, limit = 10 } = {}) {
    const q = String(query || "").toLowerCase();
    let nodes = [...this._nodes.values()];
    if (type) nodes = nodes.filter(n => n.type === type);
    return nodes
      .filter(n =>
        n.label.toLowerCase().includes(q) ||
        JSON.stringify(n.data).toLowerCase().includes(q)
      )
      .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0))
      .slice(0, limit);
  }

  /**
   * En son erişilen / güncellenen düğümleri getir (aktif bağlam için).
   */
  recentNodes(type = null, limit = 5) {
    let nodes = [...this._nodes.values()];
    if (type) nodes = nodes.filter(n => n.type === type);
    return nodes.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }

  // ── Özet ─────────────────────────────────────────────────────────────────────

  summary() {
    const byType = {};
    for (const n of this._nodes.values()) {
      byType[n.type] = (byType[n.type] || 0) + 1;
    }
    return {
      nodeCount : this._nodes.size,
      edgeCount : this._edges.size,
      byType,
      recentProjects: this.recentNodes(NODE_TYPE.PROJECT, 3).map(n => n.label),
      recentGoals   : this.recentNodes(NODE_TYPE.GOAL, 3).map(n => n.label),
    };
  }

  stats() { return this.summary(); }
}

module.exports = { LifeGraph };
