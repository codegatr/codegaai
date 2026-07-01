"use strict";

/**
 * dependency-graph.js — Bağımlılık grafiği (adjacency-list).
 *
 * - DFS/BFS gezintilerinde visited/visiting set ZORUNLU (sonsuz döngü yok).
 * - Circular dependency raporu üretir.
 * - Indexer için ignore kuralları (node_modules/.git/dist/build/vendor/release).
 * - Symlink traversal default DENY (walker'da kullanılır).
 *
 * Saf veri yapısı + algoritma; fs yok. Test edilebilir.
 */

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "vendor", "release",
  ".cache", "coverage", "out", ".next", ".turbo",
]);

function isIgnoredSegment(segment) {
  return IGNORE_DIRS.has(String(segment || ""));
}

// Yol parçalarından herhangi biri ignore dizini mi?
function pathIsIgnored(relPath) {
  return String(relPath || "")
    .split(/[\\/]+/)
    .some((seg) => isIgnoredSegment(seg));
}

class DependencyGraph {
  constructor() {
    this._adj = new Map(); // node → Set<node>
  }

  addNode(node) {
    if (node == null) return;
    if (!this._adj.has(node)) this._adj.set(node, new Set());
  }

  addEdge(from, to) {
    this.addNode(from);
    this.addNode(to);
    this._adj.get(from).add(to);
  }

  hasNode(node) { return this._adj.has(node); }
  nodes() { return [...this._adj.keys()]; }
  neighbors(node) { return this._adj.has(node) ? [...this._adj.get(node)] : []; }
  get size() { return this._adj.size; }

  /** BFS — visited set zorunlu. */
  bfs(start) {
    if (!this._adj.has(start)) return [];
    const visited = new Set([start]);
    const order = [];
    const queue = [start];
    while (queue.length) {
      const node = queue.shift();
      order.push(node);
      for (const n of this._adj.get(node) || []) {
        if (!visited.has(n)) { visited.add(n); queue.push(n); }
      }
    }
    return order;
  }

  /** DFS — visited set zorunlu. */
  dfs(start) {
    if (!this._adj.has(start)) return [];
    const visited = new Set();
    const order = [];
    const stack = [start];
    while (stack.length) {
      const node = stack.pop();
      if (visited.has(node)) continue;
      visited.add(node);
      order.push(node);
      const ns = [...(this._adj.get(node) || [])];
      // ters sırada push ki çıkışta doğal sıra korunsun
      for (let i = ns.length - 1; i >= 0; i--) if (!visited.has(ns[i])) stack.push(ns[i]);
    }
    return order;
  }

  /**
   * Tüm circular bağımlılıkları bul. DFS + visiting(gri)/visited(siyah) set.
   * Geri-kenar bulununca rekürsiyon yığınından döngüyü yeniden kur.
   * @returns {Array<string[]>} döngüler (her biri düğüm listesi)
   */
  detectCycles() {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    for (const n of this._adj.keys()) color.set(n, WHITE);
    const stack = [];
    const onStack = new Set();
    const cycles = [];
    const seen = new Set(); // tekrarlı döngüleri ele

    const visit = (node) => {
      color.set(node, GRAY);
      stack.push(node);
      onStack.add(node);
      for (const next of this._adj.get(node) || []) {
        if (!this._adj.has(next)) continue;
        const c = color.get(next);
        if (c === GRAY && onStack.has(next)) {
          // geri-kenar → döngü
          const idx = stack.lastIndexOf(next);
          const cycle = stack.slice(idx);
          const key = [...cycle].sort().join("→") + `|len${cycle.length}`;
          if (!seen.has(key)) { seen.add(key); cycles.push(cycle.slice()); }
        } else if (c === WHITE) {
          visit(next);
        }
      }
      stack.pop();
      onStack.delete(node);
      color.set(node, BLACK);
    };

    for (const n of this._adj.keys()) {
      if (color.get(n) === WHITE) visit(n);
    }
    return cycles;
  }

  hasCycle() { return this.detectCycles().length > 0; }

  /**
   * Topolojik sıralama (Kahn). Döngü varsa hasCycle:true ve kısmi sıra döner.
   * @returns {{order:string[], hasCycle:boolean}}
   */
  topoSort() {
    const indeg = new Map();
    for (const n of this._adj.keys()) indeg.set(n, 0);
    for (const [, outs] of this._adj) for (const m of outs) if (indeg.has(m)) indeg.set(m, indeg.get(m) + 1);
    const queue = [];
    for (const [n, d] of indeg) if (d === 0) queue.push(n);
    const order = [];
    while (queue.length) {
      const n = queue.shift();
      order.push(n);
      for (const m of this._adj.get(n) || []) {
        if (!indeg.has(m)) continue;
        indeg.set(m, indeg.get(m) - 1);
        if (indeg.get(m) === 0) queue.push(m);
      }
    }
    return { order, hasCycle: order.length !== this._adj.size };
  }
}

module.exports = { DependencyGraph, IGNORE_DIRS, isIgnoredSegment, pathIsIgnored };
