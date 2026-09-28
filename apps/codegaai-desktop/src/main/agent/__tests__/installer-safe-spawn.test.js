"use strict";

// Ollama serve ENOENT çökme koruması: `spawn(...).unref()` doğrudan çağrıldığında, Ollama
// kurulu değilse 'error' (ENOENT) olayı gelir ve dinleyici yoksa Electron ANA SÜRECİ çöker
// ("A JavaScript error occurred in the main process — spawn ollama.exe ENOENT"). safeDetachedSpawn
// bu olayı yutar; app çökmez.

const { EventEmitter } = require("node:events");

jest.mock("child_process", () => ({ spawn: jest.fn() }));
const { spawn } = require("child_process");
const installer = require("../installer");

function fakeChild() {
  const c = new EventEmitter();
  c.unref = jest.fn();
  c.stdout = null;
  c.stderr = null;
  return c;
}

describe("safeDetachedSpawn: ollama serve ENOENT ana süreci çökertmez", () => {
  afterEach(() => jest.clearAllMocks());

  test("spawn başarılı → child döner, 'error' dinleyicisi bağlanır, unref çağrılır", () => {
    const child = fakeChild();
    spawn.mockReturnValue(child);
    const res = installer.safeDetachedSpawn("ollama.exe", ["serve"], { detached: true });
    expect(res).toBe(child);
    expect(child.listenerCount("error")).toBeGreaterThanOrEqual(1);
    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  test("ENOENT 'error' olayı FIRLATMADAN yutulur (dinleyici olmasa süreç çökerdi)", () => {
    const child = fakeChild();
    spawn.mockReturnValue(child);
    installer.safeDetachedSpawn("ollama.exe", ["serve"], {});
    const enoent = Object.assign(new Error("spawn ollama.exe ENOENT"), { code: "ENOENT" });
    // Dinleyici bağlı olmasaydı EventEmitter bu satırda "Unhandled 'error' event" fırlatırdı.
    expect(() => child.emit("error", enoent)).not.toThrow();
  });

  test("spawn senkron fırlatırsa null döner (yine çökme yok)", () => {
    spawn.mockImplementation(() => { throw new Error("boom"); });
    let res;
    expect(() => { res = installer.safeDetachedSpawn("x", []); }).not.toThrow();
    expect(res).toBeNull();
  });
});
