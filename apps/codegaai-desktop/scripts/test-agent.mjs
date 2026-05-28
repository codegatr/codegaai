import assert from "node:assert";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mainDir = path.join(here, "..", "src", "main");

// Bellek testleri kullanıcı dosyasına dokunmasın: geçici yola yönlendir
const tmpMem = path.join(os.tmpdir(), `codega-mem-${Date.now()}.json`);
process.env.CODEGA_MEMORY_PATH = tmpMem;

const { runReact, cleanFinal } = await import(path.join(mainDir, "agent", "agent-loop.js"));
const toolsMod = await import(path.join(mainDir, "agent", "tools.js"));
const memMod = await import(path.join(mainDir, "agent", "memory.js"));

const tools = toolsMod.default || toolsMod;
const memory = memMod.default || memMod;

let passed = 0;
function ok(name) { console.log(`  ✓ ${name}`); passed += 1; }

// 1) Döngü gözlemi modele GERİ besliyor ve sentezliyor
{
  const seen = [];
  const fakeLLM = async (messages) => {
    seen.push(messages.map((m) => ({ role: m.role, content: m.content })));
    return seen.length === 1
      ? 'Hesaplıyorum. <tool>calculate("21*2")</tool>'
      : "İşlemin sonucu 42.";
  };
  const res = await runReact(
    [{ role: "user", content: "21 çarpı 2?" }],
    fakeLLM,
    { maxIters: 4 }
  );
  assert.strictEqual(res.iterations, 2, "iki tur olmalı");
  assert.strictEqual(res.stoppedReason, "final_answer");
  assert.strictEqual(res.content, "İşlemin sonucu 42.");
  assert.strictEqual(res.toolCalls.length, 1);
  assert.strictEqual(res.toolCalls[0].name, "calculate");
  assert.ok(String(res.toolCalls[0].result).includes("42"), "araç 42 üretmeli");
  // KRİTİK: 2. turda model gözlemi (42) görmüş olmalı
  const turn2 = seen[1].map((m) => m.content).join("\n");
  assert.ok(turn2.includes("Araç Sonuçları (Gözlem)"), "gözlem geri beslenmeli");
  assert.ok(turn2.includes("42"), "gözlemde 42 olmalı");
  ok("ReAct: gözlem geri besleniyor + sentez");
}

// 2) max_iters'e uyuyor
{
  let n = 0;
  const alwaysTool = async (messages) => {
    n += 1;
    const last = messages[messages.length - 1].content;
    if (last.includes("ARAÇ KULLANMA")) return "Toplanan bilgiyle final.";
    return 'Devam. <tool>calculate("1+1")</tool>';
  };
  const res = await runReact([{ role: "user", content: "x" }], alwaysTool, { maxIters: 3 });
  assert.strictEqual(res.stoppedReason, "max_iters");
  assert.strictEqual(res.iterations, 3);
  assert.strictEqual(res.content, "Toplanan bilgiyle final.");
  assert.strictEqual(n, 4, "3 döngü + 1 sentez = 4 üretim");
  ok("ReAct: max_iters koruması + sentez");
}

// 3) Araç gerekmeyen soru tek turda biter, <think> temizlenir
{
  const direct = async () => "<think>basit selam</think>Merhaba Yunus!";
  const res = await runReact([{ role: "user", content: "selam" }], direct, { maxIters: 4 });
  assert.strictEqual(res.iterations, 1);
  assert.strictEqual(res.stoppedReason, "final_answer");
  assert.strictEqual(res.toolCalls.length, 0);
  assert.strictEqual(res.content, "Merhaba Yunus!", "<think> gizlenmeli");
  ok("ReAct: düz cevap + <think> gizleme");
}

// 4) generateFn hatası güvenle yakalanıyor
{
  const boom = async () => { throw new Error("ollama yok"); };
  const res = await runReact([{ role: "user", content: "x" }], boom, { maxIters: 4 });
  assert.strictEqual(res.stoppedReason, "error");
  assert.ok(res.content.includes("ollama yok"));
  ok("ReAct: üretim hatası güvenli");
}

// 5) Araçlar (offline): calculate + current_time
{
  assert.ok(tools.toolCalculate('"21*2"' ? "21*2" : "").includes("42"));
  assert.ok(tools.toolCalculate("sqrt(144) + 5^2").includes("37"));
  assert.ok(/Türkiye/.test(tools.toolCurrentTime()));
  ok("Araçlar: calculate + current_time");
}

// 6) Kalıcı hafıza: remember + recall (geçici dosyada)
{
  memory.remember("Yunus Konya'da yaşıyor, web geliştirici");
  memory.remember("Yunus elektrikli araç aldı");
  const hits = memory.recall("Yunus nerede yaşıyor");
  assert.ok(hits.some((h) => h.includes("Konya")), "Konya hatırlanmalı");
  ok("Hafıza: remember + recall");
  fs.rmSync(tmpMem, { force: true });
}

// 7) parseAndRunTools gerçekten çalıştırıyor (calculate, offline)
{
  const { calls } = await tools.parseAndRunTools(
    'Bak: <tool>calculate("100/4")</tool> tamam.'
  );
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].name, "calculate");
  assert.ok(String(calls[0].result).includes("25"));
  ok("parseAndRunTools: gerçek çalıştırma");
}

console.log(`\n${passed} test geçti ✅`);
