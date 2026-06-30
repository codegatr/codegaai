"use strict";

/**
 * ollama-continuation.test.js
 * ---------------------------
 * Çıktı token tavanı (done_reason:"length") koruması: model yarıda kesilirse
 * ollamaChatStream otomatik "kaldığın yerden devam et" turları atıp akışları
 * tek yanıt gibi birleştirmeli. Ağ yok — global.fetch mock'lanır.
 */

const { ollamaChatStream, DEFAULT_MAX_CONTINUATIONS } = require("../ollama-client");

const enc = new TextEncoder();

// Verilen NDJSON nesnelerinden Ollama benzeri akışlı bir Response üretir.
function streamResponse(lines) {
  const chunks = lines.map((o) => enc.encode(JSON.stringify(o) + "\n"));
  let i = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          read() {
            if (i < chunks.length) return Promise.resolve({ done: false, value: chunks[i++] });
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    },
  };
}

function tokenLine(content) { return { message: { role: "assistant", content } }; }
function finalLine(reason) { return { done: true, done_reason: reason, message: { content: "" } }; }

afterEach(() => { delete global.fetch; jest.clearAllMocks(); });

describe("ollamaChatStream — token tavanı (length) koruması", () => {
  test("tek tur 'stop' ile biterse devam etmez", async () => {
    global.fetch = jest.fn(async () => streamResponse([tokenLine("Tam yanıt."), finalLine("stop")]));
    const tokens = [];
    const full = await ollamaChatStream("m", [{ role: "user", content: "x" }], { onToken: (t) => tokens.push(t) });
    expect(full).toBe("Tam yanıt.");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(tokens.join("")).toBe("Tam yanıt.");
  });

  test("'length' ile kesilirse otomatik devam eder ve birleştirir", async () => {
    const responses = [
      streamResponse([tokenLine("Bölüm1 "), finalLine("length")]),
      streamResponse([tokenLine("Bölüm2."), finalLine("stop")]),
    ];
    let call = 0;
    global.fetch = jest.fn(async () => responses[call++]);
    const tokens = [];
    const full = await ollamaChatStream("m", [{ role: "user", content: "uzun" }], { onToken: (t) => tokens.push(t) });
    expect(full).toBe("Bölüm1 Bölüm2.");
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(tokens.join("")).toBe("Bölüm1 Bölüm2.");
  });

  test("devam isteği gövdesinde önceki yanıt + 'devam et' yönergesi bulunur", async () => {
    const responses = [
      streamResponse([tokenLine("ilk kısım"), finalLine("length")]),
      streamResponse([tokenLine(" son"), finalLine("stop")]),
    ];
    let call = 0;
    const bodies = [];
    global.fetch = jest.fn(async (_url, init) => { bodies.push(JSON.parse(init.body)); return responses[call++]; });
    await ollamaChatStream("m", [{ role: "user", content: "soru" }], {});
    const secondMsgs = bodies[1].messages;
    expect(secondMsgs.some((m) => m.role === "assistant" && m.content.includes("ilk kısım"))).toBe(true);
    expect(secondMsgs[secondMsgs.length - 1].content).toMatch(/devam et/i);
  });

  test("sürekli 'length' dönse bile maxContinuations tavanında durur", async () => {
    global.fetch = jest.fn(async () => streamResponse([tokenLine("x"), finalLine("length")]));
    const full = await ollamaChatStream("m", [{ role: "user", content: "y" }], { maxContinuations: 2 });
    // 1 ilk istek + 2 devam = 3 çağrı
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(full).toBe("xxx");
  });

  test("bir tur hiç ilerleme üretmezse (boş) döngü kırılır", async () => {
    const responses = [
      streamResponse([tokenLine("var"), finalLine("length")]),
      streamResponse([finalLine("length")]), // boş içerik
    ];
    let call = 0;
    global.fetch = jest.fn(async () => responses[call++]);
    const full = await ollamaChatStream("m", [{ role: "user", content: "z" }], {});
    expect(full).toBe("var");
    expect(global.fetch).toHaveBeenCalledTimes(2); // 3. tura geçmez
  });

  test("DEFAULT_MAX_CONTINUATIONS makul bir tavan", () => {
    expect(DEFAULT_MAX_CONTINUATIONS).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_MAX_CONTINUATIONS).toBeLessThanOrEqual(10);
  });
});
