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

// 8) parseSearchResults: statik HTML üzerinde (internetsiz)
{
  const sampleHtml = `
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fornek.com%2Fsayfa">Örnek Başlık</a>
    <a class="result__snippet">Bu bir örnek özet metnidir.</a>
    <a class="result__a" href="https://ikinci.com">İkinci Sonuç</a>
    <a class="result__snippet">İkinci özet.</a>`;
  const parsed = tools.parseSearchResults(sampleHtml, 5);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].title, "Örnek Başlık");
  assert.strictEqual(parsed[0].href, "https://ornek.com/sayfa", "uddg çözülmeli");
  assert.ok(parsed[0].snippet.includes("örnek özet"));
  ok("Araştırma: arama sonucu parser (offline)");
}

// 9) research aracı kayıtlı ve loop'tan çağrılabilir
{
  assert.ok(tools.TOOLS.research, "research aracı kayıtlı olmalı");
  assert.ok(tools.TOOLS.web_search && tools.TOOLS.read_url, "web araçları kayıtlı");
  ok("Araştırma: research/web_search/read_url kayıtlı");
}

// 10) Toleranslı format: (tool), [tool], çıplak, iç içe parantez
{
  assert.strictEqual(tools.extractToolCalls("Bak (tool)current_time()").length, 1);
  assert.strictEqual(tools.extractToolCalls("Bak (tool)current_time()")[0].name, "current_time");
  assert.strictEqual(tools.extractToolCalls('[tool]calculate("12+3")').length, 1);
  assert.strictEqual(tools.extractToolCalls('sonuç: web_search("x")')[0].name, "web_search");
  // iç içe parantezli argüman bozulmamalı
  const nested = tools.extractToolCalls('<tool>calculate("(1+2)*3")</tool>');
  assert.strictEqual(nested[0].argsStr, '"(1+2)*3"');
  assert.ok(tools.toolCalculate("(1+2)*3").includes("9"));
  ok("Toleranslı format: (tool)/[tool]/çıplak/iç içe parantez");
}

// 11) Ekrandaki tam hata senaryosu: model "(tool)current_time()" yazıyor
{
  let n = 0;
  const fake = async (messages) => {
    n += 1;
    if (n === 1) return "Son durumu kontrol edelim. (tool)current_time()";
    return "Bugünkü tarih ve saat yukarıda.";
  };
  const res = await runReact([{ role: "user", content: "son durum?" }], fake, { maxIters: 3 });
  assert.strictEqual(res.iterations, 2, "(tool) formatı yakalanıp döngü dönmeli");
  assert.strictEqual(res.stoppedReason, "final_answer");
  assert.strictEqual(res.toolCalls.length, 1);
  assert.strictEqual(res.toolCalls[0].name, "current_time");
  assert.ok(!res.content.includes("(tool)"), "final cevapta (tool) kalıntısı olmamalı");
  ok("Loop: (tool)current_time() artık çalışıyor (ekran hatası çözüldü)");
}

// 12) stripToolCalls final cevabı temizliyor
{
  assert.strictEqual(tools.stripToolCalls("Cevap. (tool)current_time()"), "Cevap.");
  assert.strictEqual(tools.stripToolCalls('<tool>weather("Konya")</tool>'), "");
  ok("stripToolCalls: kalıntı temizleme");
}

// 13) Ayar deposu (geçici dosyada)
{
  const tmpSettings = path.join(os.tmpdir(), `codega-set-${Date.now()}.json`);
  process.env.CODEGA_SETTINGS_PATH = tmpSettings;
  const settingsMod = await import(path.join(mainDir, "agent", "settings-store.js"));
  const settings = settingsMod.default || settingsMod;
  const def = settings.getSettings();
  assert.strictEqual(def.autonomousLearning, true, "varsayılan açık");
  const next = settings.setSettings({ autonomousLearning: false });
  assert.strictEqual(next.autonomousLearning, false);
  assert.strictEqual(settings.getSettings().autonomousLearning, false, "kalıcı");
  fs.rmSync(tmpSettings, { force: true });
  ok("Ayar deposu: get/set/kalıcılık");
}

// 14) Otonom öğrenme: çıkarım + recall + temizleme
{
  const tmpMem2 = path.join(os.tmpdir(), `codega-mem2-${Date.now()}.json`);
  process.env.CODEGA_MEMORY_PATH = tmpMem2;
  const facts = memory.extractDurableFacts("Merhaba, benim adım Yunus ve Konya'da yaşıyorum.");
  assert.ok(facts.some((f) => f.includes("Yunus")), "ad çıkarılmalı");
  assert.ok(facts.some((f) => f.includes("Konya")), "şehir çıkarılmalı");
  for (const f of facts) memory.remember(f);
  assert.ok(memory.listFacts().length >= 2, "öğrenilenler listelenmeli");
  assert.ok(memory.recall("nerede yaşıyor").some((h) => h.includes("Konya")));
  memory.clearAll();
  assert.strictEqual(memory.listFacts().length, 0, "temizlenmeli");
  fs.rmSync(tmpMem2, { force: true });
  ok("Otonom öğrenme: çıkarım + recall + temizleme");
}

// 15) System prompt hafızayı enjekte ediyor + insansı üslup
{
  const spMod = await import(path.join(mainDir, "agent", "system-prompt.js"));
  const sp = spMod.default || spMod;
  const withMem = sp.buildSystemPrompt("chat", {
    memory: ["Kullanıcının adı Yunus", "Kullanıcı Konya şehrinde yaşıyor"],
    humanTone: true,
  });
  assert.ok(withMem.includes("hatırladıkların"), "hafıza başlığı olmalı");
  assert.ok(withMem.includes("Yunus"), "hafıza içeriği enjekte edilmeli");
  assert.ok(withMem.includes("İnsansı ol"), "insansı üslup talimatı olmalı");
  const noMem = sp.buildSystemPrompt("chat", { memory: [], humanTone: false });
  assert.ok(!noMem.includes("hatırladıkların"), "hafıza yoksa başlık olmamalı");
  ok("System prompt: hafıza enjeksiyonu + insansı üslup");
}

console.log(`\n${passed} test geçti ✅`);
