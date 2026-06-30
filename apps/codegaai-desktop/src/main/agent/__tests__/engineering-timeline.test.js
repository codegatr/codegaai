"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { EngineeringTimeline, createEvent, eventKey } = require("../aep/engineering-timeline");
const { SEED_TIMELINE } = require("../aep/timeline-seed");

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "codega-tl-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("createEvent", () => {
  test("geçerli olay kurar", () => {
    const e = createEvent({ type: "release", title: "alpha.65", version: "6.0.0-alpha.65", why: "olgunluk" });
    expect(e.type).toBe("release");
    expect(e.id).toMatch(/^tl_/);
    expect(e.at).toBeGreaterThan(0);
  });
  test("geçersiz tip/başlık reddedilir", () => {
    expect(() => createEvent({ type: "xxx", title: "y" })).toThrow(/geçersiz tip/);
    expect(() => createEvent({ type: "release", title: "" })).toThrow(/title/);
  });
});

describe("EngineeringTimeline", () => {
  test("ekler ve kalıcı yazar; yeniden yüklenince korunur", () => {
    const tl = new EngineeringTimeline(dir).init();
    tl.add({ type: "decision", title: "X kararı", version: "v1", why: "neden" });
    const tl2 = new EngineeringTimeline(dir).init();
    expect(tl2.list().length).toBe(1);
    expect(tl2.list()[0].title).toBe("X kararı");
  });

  test("idempotent: aynı tip+version+başlık iki kez eklenmez", () => {
    const tl = new EngineeringTimeline(dir).init();
    tl.add({ type: "release", title: "alpha.65", version: "6.0.0-alpha.65" });
    tl.add({ type: "release", title: "alpha.65", version: "6.0.0-alpha.65" });
    expect(tl.list().length).toBe(1);
  });

  test("filtre: type / version / tag / limit", () => {
    const tl = new EngineeringTimeline(dir).init();
    tl.add({ type: "release", title: "r1", version: "v1", tags: ["zip"] });
    tl.add({ type: "lesson", title: "l1", version: "v1", tags: ["models"] });
    tl.add({ type: "release", title: "r2", version: "v2", tags: ["zip"] });
    expect(tl.list({ type: "release" }).length).toBe(2);
    expect(tl.list({ version: "v1" }).length).toBe(2);
    expect(tl.list({ tag: "zip" }).length).toBe(2);
    expect(tl.list({ limit: 1 }).length).toBe(1);
  });

  test("seed idempotent ve summary doğru", () => {
    const tl = new EngineeringTimeline(dir).init();
    const added1 = tl.seed(SEED_TIMELINE);
    const added2 = tl.seed(SEED_TIMELINE); // ikinci kez 0 eklemeli
    expect(added1).toBe(SEED_TIMELINE.length);
    expect(added2).toBe(0);
    const s = tl.summary();
    expect(s.total).toBe(SEED_TIMELINE.length);
    expect(s.byType.release).toBeGreaterThan(0);
    expect(s.latest.length).toBeLessThanOrEqual(5);
  });

  test("eventKey tip+version+başlığa duyarlı", () => {
    const a = createEvent({ type: "release", title: "A", version: "v1" });
    const b = createEvent({ type: "release", title: "A", version: "v1" });
    expect(eventKey(a)).toBe(eventKey(b));
  });
});
