"use strict";

const { DependencyGraph, IGNORE_DIRS, isIgnoredSegment, pathIsIgnored } = require("../indexer/dependency-graph");

describe("dependency-graph: temel + traversal", () => {
  test("BFS/DFS visited ile sonsuz döngüye girmez", () => {
    const g = new DependencyGraph();
    g.addEdge("a", "b"); g.addEdge("b", "c"); g.addEdge("c", "a"); // döngü
    expect(g.bfs("a").sort()).toEqual(["a", "b", "c"]);
    expect(g.dfs("a").sort()).toEqual(["a", "b", "c"]);
  });

  test("neighbors / nodes / size", () => {
    const g = new DependencyGraph();
    g.addEdge("x", "y");
    expect(g.neighbors("x")).toEqual(["y"]);
    expect(g.nodes().sort()).toEqual(["x", "y"]);
    expect(g.size).toBe(2);
  });
});

describe("dependency-graph: circular dependency", () => {
  test("basit döngü tespit edilir", () => {
    const g = new DependencyGraph();
    g.addEdge("a", "b"); g.addEdge("b", "a");
    const cycles = g.detectCycles();
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    expect(g.hasCycle()).toBe(true);
  });

  test("döngüsüz graf: topoSort tam sıra döner", () => {
    const g = new DependencyGraph();
    g.addEdge("a", "b"); g.addEdge("b", "c"); g.addEdge("a", "c");
    expect(g.hasCycle()).toBe(false);
    const { order, hasCycle } = g.topoSort();
    expect(hasCycle).toBe(false);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  });

  test("çoklu düğüm döngüsü + kendi kendine referans", () => {
    const g = new DependencyGraph();
    g.addEdge("a", "b"); g.addEdge("b", "c"); g.addEdge("c", "a");
    g.addEdge("self", "self");
    const cycles = g.detectCycles();
    expect(cycles.some((c) => c.length >= 3)).toBe(true);
    expect(cycles.some((c) => c.length === 1 && c[0] === "self")).toBe(true);
  });
});

describe("dependency-graph: ignore kuralları", () => {
  test("standart dizinler ignore", () => {
    for (const d of ["node_modules", ".git", "dist", "build", "vendor", "release"]) {
      expect(isIgnoredSegment(d)).toBe(true);
      expect(IGNORE_DIRS.has(d)).toBe(true);
    }
    expect(isIgnoredSegment("src")).toBe(false);
  });

  test("pathIsIgnored yol içindeki herhangi segmenti yakalar", () => {
    expect(pathIsIgnored("src/node_modules/x/index.js")).toBe(true);
    expect(pathIsIgnored("packages\\vendor\\lib.js")).toBe(true);
    expect(pathIsIgnored("src/main/agent/indexer/file.js")).toBe(false);
  });
});
