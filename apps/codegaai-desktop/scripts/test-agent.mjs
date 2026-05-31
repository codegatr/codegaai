import assert from "node:assert";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mainDir = path.join(here, "..", "src", "main");
const joinPath = path.join.bind(path);
path.join = (...parts) => {
  const joined = joinPath(...parts);
  return parts[0] === mainDir && joined.endsWith(".js") ? pathToFileURL(joined).href : joined;
};

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

// 16) GitHub araçları kayıtlı + token yokken zarif davranış (offline)
{
  const tmpSet = path.join(os.tmpdir(), `codega-set-gh-${Date.now()}.json`);
  process.env.CODEGA_SETTINGS_PATH = tmpSet;
  delete process.env.CODEGA_GH_TOKEN;
  assert.ok(tools.TOOLS.github_read && tools.TOOLS.github_list, "github_read/list kayıtlı");
  assert.ok(tools.TOOLS.github_search && tools.TOOLS.github_dispatch, "search/dispatch kayıtlı");
  const { calls } = await tools.parseAndRunTools('<tool>github_read("owner/repo/dosya.txt")</tool>');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].name, "github_read");
  assert.ok(/token/i.test(String(calls[0].result)), "token yokken uyarı dönmeli, patlamamalı");
  fs.rmSync(tmpSet, { force: true });
  ok("GitHub araçları: kayıt + token yokken zarif");
}

// 17) knowledge.parseFactText: JSONL ve düz satır
{
  const kMod = await import(path.join(mainDir, "agent", "knowledge.js"));
  const knowledge = kMod.default || kMod;
  assert.strictEqual(knowledge.parseFactText('{"text":"Konya","at":1}'), "Konya");
  assert.strictEqual(knowledge.parseFactText("düz satır"), "düz satır");
  assert.strictEqual(typeof knowledge.isConfigured(), "boolean");
  ok("Knowledge: JSONL/düz satır ayrıştırma");
}

// 18) RAG: saf fonksiyonlar + keyword fallback (Ollama'sız, offline)
{
  const tmpRag = path.join(os.tmpdir(), `codega-rag-${Date.now()}.json`);
  process.env.CODEGA_RAG_PATH = tmpRag;
  const ragMod = await import(path.join(mainDir, "agent", "rag.js"));
  const rag = ragMod.default || ragMod;

  assert.ok(Math.abs(rag.cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9, "aynı vektör = 1");
  assert.ok(Math.abs(rag.cosineSimilarity([1, 0], [0, 1])) < 1e-9, "dik vektör = 0");
  assert.strictEqual(rag.chunkText("kısa metin").length, 1);
  assert.ok(rag.chunkText("x".repeat(2000)).length >= 2, "uzun metin parçalanmalı");
  assert.ok(rag.keywordScore("konya nüfus", "Konya nüfusu çoktur") > 0);

  // Ollama kapalı -> embedding null -> keyword fallback
  const add = await rag.addDocument("Proje Notu", "CODEGA B2B portalı bayi.lemondedutacos.com adresinde çalışır.");
  assert.ok(add.ok && add.added >= 1, "doküman eklendi");
  const hits = await rag.search("bayi portalı adresi", 4);
  assert.ok(hits.length >= 1 && /lemondedutacos/.test(hits[0].text), "keyword fallback ile bulundu");
  const st = rag.stats();
  assert.ok(st.chunks >= 1 && st.documents >= 1);
  rag.clearAll();
  assert.strictEqual(rag.stats().chunks, 0);
  fs.rmSync(tmpRag, { force: true });
  ok("RAG: cosine/chunk/keyword + ekle/ara/temizle (offline)");
}

// 19) rag_search aracı kayıtlı
{
  assert.ok(tools.TOOLS.rag_search, "rag_search aracı kayıtlı");
  ok("RAG: rag_search aracı kayıtlı");
}

// 20) Öz değerlendirme: OK -> değişmez, düzeltme -> revize
{
  const rfMod = await import(path.join(mainDir, "agent", "reflect.js"));
  const reflect = rfMod.default || rfMod;
  assert.strictEqual(reflect.looksOk("OK"), true);
  assert.strictEqual(reflect.looksOk("Tamam, doğru."), true);
  assert.strictEqual(reflect.looksOk("Hayır, yanlış: ..."), false);

  const okRes = await reflect.reflect("2+2?", "4", async () => "OK");
  assert.strictEqual(okRes.revised, false);
  assert.strictEqual(okRes.answer, "4");

  const fixRes = await reflect.reflect("Konya nüfusu?", "185.000", async () => "Konya nüfusu yaklaşık 2,3 milyondur.");
  assert.strictEqual(fixRes.revised, true);
  assert.ok(/2,3 milyon/.test(fixRes.answer));

  // denetim patlarsa taslak korunur
  const safe = await reflect.reflect("x", "taslak", async () => { throw new Error("yok"); });
  assert.strictEqual(safe.answer, "taslak");

  // SIZINTI: etiketli denetçi raporu cevaba sızmamalı
  const leak = await reflect.reflect(
    "günaydin",
    "İyi günler. Size nasıl yardımcı olabilirim?",
    async () =>
      "İyi günler. Size nasıl yardımcı olabilirim?\n\nDÜZELTİLMİŞ CEVAP:\nGünaydın! Size nasıl yardımcı olabilirim?\n\nUydu: None detected\nEksiklik: None detected\nSorun: yok"
  );
  assert.ok(/Günaydın/.test(leak.answer), "temiz düzeltme çıkarılmalı");
  assert.ok(!/DÜZELTİLMİŞ|Uydu:|None detected|Sorun:/.test(leak.answer), "rapor SIZMAMALI");

  // Sadece rapor (kullanılabilir cevap yok) -> taslağa dön
  const onlyReport = await reflect.reflect(
    "selam",
    "Merhaba!",
    async () => "Uydu: None detected\nEksiklik: yok\nSorun: yok"
  );
  assert.strictEqual(onlyReport.answer, "Merhaba!", "rapor-only -> taslak");
  ok("Öz değerlendirme: OK/düzeltme/hata-güvenli + rapor sızıntısı engellendi");
}

// 21) Görev planlayıcı: parse + looksLikeGoal + makePlan
{
  const plMod = await import(path.join(mainDir, "agent", "planner.js"));
  const planner = plMod.default || plMod;
  const steps = planner.parsePlan("1. Repoyu klonla\n2. Bağımlılıkları kur\n3. Testleri çalıştır");
  assert.strictEqual(steps.length, 3);
  assert.strictEqual(steps[0], "Repoyu klonla");
  assert.strictEqual(planner.parsePlan("- adım bir\n* adım iki").length, 2);
  assert.strictEqual(planner.looksLikeGoal("selam"), false);
  assert.strictEqual(
    planner.looksLikeGoal("php ile bir blog sitesi oluştur ve sonra veritabanına bağla"),
    true
  );
  const plan = await planner.makePlan("X yap", async () => "1. ilk\n2. ikinci");
  assert.ok(plan.length === 2 && plan[0] === "ilk");
  const safe = await planner.makePlan("X", async () => { throw new Error("yok"); });
  assert.deepStrictEqual(safe, []);
  ok("Görev planlayıcı: parse/looksLikeGoal/makePlan");
}

// 22) Çoklu ajan: yönlendirme + tool policy + orchestrate (fake'lerle, offline)
{
  const agMod = await import(path.join(mainDir, "agent", "agents.js"));
  const agents = agMod.default || agMod;
  assert.strictEqual(agents.routeStep("PHP fonksiyonu yaz ve repo'ya bak"), "coder");
  assert.strictEqual(agents.routeStep("güncel fiyatları araştır"), "researcher");
  assert.strictEqual(agents.routeStep("çıktıyı kontrol et ve doğrula"), "reviewer");
  assert.ok(agents.buildSpecialistPrompt("coder").includes("github_read"));

  // tool policy: izinsiz araç çalıştırılmamalı
  const { calls } = await tools.parseAndRunTools(
    '<tool>calculate("2+2")</tool>',
    ["web_search"] // calculate izinli değil
  );
  assert.strictEqual(calls[0].error, "not_allowed");

  // orchestrator: fake ctx ile akış
  const orMod = await import(path.join(mainDir, "agent", "orchestrator.js"));
  const orchestrator = orMod.default || orMod;
  const res = await orchestrator.runOrchestrated("bir blog sitesi yap", {
    makePlan: async () => ["tasarımı araştır", "kodu yaz", "kontrol et"],
    routeStep: agents.routeStep,
    runSpecialist: async (key, step) => `${key}:${step} tamam`,
    synthesize: async (g, steps) => `FINAL(${steps.length} adım)`,
  });
  assert.strictEqual(res.stepResults.length, 3);
  assert.ok(res.content.startsWith("FINAL(3"));
  ok("Çoklu ajan: routing + tool policy + orchestrate");
}

// 23) Basit sohbet tespiti (selam yolu araç/ReAct'a girmesin)
{
  const mm = await import(path.join(mainDir, "model-manager.js"));
  const isST = (mm.default || mm).isSmallTalk;
  for (const g of ["günaydın", "Günaydin", "selam", "merhaba", "teşekkürler", "naber"]) {
    assert.strictEqual(isST(g), true, `smalltalk olmalı: ${g}`);
  }
  for (const q of ["günaydın, bana bir PHP fonksiyonu yaz", "Konya nüfusu nedir?", "şu repodaki hatayı bul"]) {
    assert.strictEqual(isST(q), false, `smalltalk OLMAMALI: ${q}`);
  }
  ok("Basit sohbet tespiti: selam evet, görev/soru hayır");
}

// 23b) Eksik kod modeli: kullanıcıyı ayarlara göndermek yerine otomatik hazırlama mesajı
{
  const mm = await import(path.join(mainDir, "model-manager.js"));
  const M = mm.default || mm;
  const text = M.missingModelReply("code", "qwen2.5-coder:3b-instruct", true);
  assert.ok(/arka planda hazırlamaya başladım/.test(text), "otomatik hazırlama söylenir");
  assert.ok(/Ayarlar'a gitmene gerek yok/.test(text), "kullanıcı ayarlara itilmez");
  assert.ok(/PHP/.test(text), "PHP/kod niyeti korunur");
  ok("Eksik kod modeli: otomatik hazırlama mesajı");
}

// 23c) Model indirme ilerlemesi: yüzde + indirilen/toplam + hız ayrıştırılır
{
  const mm = await import(path.join(mainDir, "model-manager.js"));
  const M = mm.default || mm;
  const p = M.parsePullProgress("pulling manifest 47% ▕████░░░░▏ 2.44 GB/5.20 GB 12 MB/s");
  assert.strictEqual(Math.round(p.percent), 47, "yüzde okunur");
  assert.ok(p.downloadedBytes > 2.4 * 1024 * 1024 * 1024, "indirilen GB okunur");
  assert.ok(p.totalBytes > 5 * 1024 * 1024 * 1024, "toplam GB okunur");
  assert.ok(p.speedBytesPerSec >= 12 * 1024 * 1024, "hız okunur");
  ok("Model indirme ilerlemesi: yüzde/MB/hız ayrıştırma");
}

// 24) Kendi kendine bakım: sağlık + bozuk depo onarımı (fake'lerle, diske dokunmadan)
{
  const smMod = await import(path.join(mainDir, "agent", "self-maintenance.js"));
  const sm = smMod.default || smMod;
  let repaired = false;
  const report = await sm.runSelfCheck({
    ollamaReachable: async () => true,
    readJson: (p) => (p === "/bozuk" ? { state: "repaired", value: null } : { state: "ok", value: {} }),
    jsonFiles: [
      { name: "settings", path: "/iyi" },
      { name: "memory", path: "/bozuk", onRepair: () => { repaired = true; } },
    ],
    now: 123,
  });
  assert.strictEqual(report.items.find((i) => i.name === "ollama").status, "ok");
  assert.ok(report.repairs.includes("memory"), "bozuk depo onarıma alınmalı");
  assert.strictEqual(repaired, true, "onRepair çağrılmalı");
  assert.strictEqual(report.healthy, false, "onarım olduysa healthy=false");

  const clean = await sm.runSelfCheck({ ollamaReachable: async () => true, jsonFiles: [], readJson: () => ({ state: "ok" }) });
  assert.strictEqual(clean.healthy, true);
  ok("Kendi kendine bakım: sağlık denetimi + güvenli onarım");
}

// 25) Denetimli kendini geliştirme: öneri üret + PR aç (fake git, main'e DOKUNMAZ)
{
  const siMod = await import(path.join(mainDir, "agent", "self-improve.js"));
  const si = siMod.default || siMod;
  const p = si.buildProposal({ idea: "Önbellek süresini ayarlanabilir yap", version: "0.12.0" });
  assert.ok(p.slug && !/\s/.test(p.slug), "slug boşluksuz olmalı");
  assert.ok(/öneri/i.test(p.body) && /otomatik birleştirilmez/i.test(p.body), "öneri notu + güvenlik notu");

  const calls = [];
  const fakeGit = {
    splitRepo: (r) => { const [owner, repo] = r.split("/"); return { owner, repo }; },
    getRepoMeta: async () => { calls.push("meta"); return { default_branch: "main" }; },
    getBranchSha: async () => { calls.push("sha"); return "abc123"; },
    createBranch: async (o, r, b, sha) => { calls.push("branch:" + b); assert.notStrictEqual(b, "main"); return {}; },
    createFileOnBranch: async (o, r, fp, b) => { calls.push("file:" + fp); assert.notStrictEqual(b, "main"); return {}; },
    openPullRequest: async (o, r, head, base) => { calls.push("pr:" + head + "->" + base); return { html_url: "https://x/pr/1", number: 1 }; },
  };
  const res = await si.submitProposal(fakeGit, "codegatr/codegaai", p, 99);
  assert.strictEqual(res.number, 1);
  assert.ok(res.branch.startsWith("codega-oneri/"), "ayrı dal");
  assert.ok(calls.some((c) => c.startsWith("pr:") && c.endsWith("->main")), "PR tabanı main");
  assert.ok(!calls.some((c) => c === "file:main" || c === "branch:main"), "main'e yazılmamalı");
  ok("Denetimli geliştirme: öneri + ayrı dal + PR (main'e dokunmaz)");
}

// 26) Kendini gözlemleme: sinyalleri eşik aşınca öneri taslağına çevir (saf)
{
  const idMod = await import(path.join(mainDir, "agent", "improve-drafts.js"));
  const id = idMod.default || idMod;
  const drafts = id.buildDrafts({
    "tool_error:web_search": { kind: "tool_error", subject: "web_search", count: 5 },
    "tool_error:rare": { kind: "tool_error", subject: "rare", count: 1 },
    "store_repair:memory": { kind: "store_repair", subject: "memory", count: 1 },
  });
  assert.ok(drafts.some((d) => d.kind === "tool_error" && /web_search/.test(d.idea)), "sık hata önerisi");
  assert.ok(!drafts.some((d) => d.subject === "rare"), "eşik altı dahil edilmemeli");
  assert.ok(drafts.some((d) => d.kind === "store_repair"), "onarım eşiği 1");
  assert.strictEqual(drafts[0].count, 5, "en sık önce");
  ok("Kendini gözlemleme: sinyal → eşik → öneri taslağı");
}

// 27) Otonom öneri: işaretlenmemiş taslaklar (key + proposedAt mantığı, saf)
{
  const idMod = await import(path.join(mainDir, "agent", "improve-drafts.js"));
  const id = idMod.default || idMod;
  const drafts = id.buildDrafts({
    "tool_error:web_search": { kind: "tool_error", subject: "web_search", count: 5 },
    "ollama_down": { kind: "ollama_down", count: 4, proposedAt: 111 },
  });
  const byKey = Object.fromEntries(drafts.map((d) => [d.key, d]));
  assert.ok(byKey["tool_error:web_search"], "key üretilmeli");
  assert.strictEqual(byKey["tool_error:web_search"].proposedAt, null, "yeni taslak proposedAt=null");
  assert.strictEqual(byKey["ollama_down"].proposedAt, 111, "önerilmiş taslak işaretli kalır");
  ok("Otonom öneri: taslak key + proposedAt ayrımı");
}

// 28) Geri bildirim sinyali öneri taslağına dönüşür
{
  const idMod = await import(path.join(mainDir, "agent", "improve-drafts.js"));
  const id = idMod.default || idMod;
  const d = id.buildDrafts({ "negative_feedback": { kind: "negative_feedback", count: 3 } });
  assert.ok(d.some((x) => x.kind === "negative_feedback" && /olumsuz/i.test(x.idea)), "olumsuz geri bildirim önerisi");
  const fbMod = await import(path.join(mainDir, "agent", "feedback.js"));
  assert.ok((fbMod.default || fbMod).stats, "feedback.stats var");
  ok("Geri bildirim: 👎 eşiği -> öneri taslağı");
}

// 29) Sistem analizi: RAM'e göre güncel model önerisi (saf)
{
  const siMod = await import(path.join(mainDir, "agent", "system-info.js"));
  const si = siMod.default || siMod;
  const opts = [
    { id: "qwen2.5:1.5b", label: "Qwen 2.5 1.5B" },
    { id: "qwen2.5:3b", label: "Qwen 2.5 3B" },
    { id: "qwen3:8b", label: "Qwen3 8B" },
  ];
  assert.strictEqual(si.recommendModel(4, opts).id, "qwen2.5:1.5b", "düşük RAM -> küçük model");
  assert.strictEqual(si.recommendModel(8, opts).id, "qwen2.5:3b", "orta RAM -> 3B");
  assert.strictEqual(si.recommendModel(16, opts).id, "qwen3:8b", "yüksek RAM -> 8B (güncel)");
  ok("Sistem analizi: donanıma göre güncel model önerisi");
}

// 30) Uzman modları: persona çözümleme (saf)
{
  const exMod = await import(path.join(mainDir, "agent", "experts.js"));
  const ex = exMod.default || exMod;
  assert.strictEqual(ex.resolve("PHP"), "php", "büyük/küçük harf normalize");
  assert.strictEqual(ex.resolve("bilinmeyen"), "genel", "tanınmayan -> genel");
  assert.ok(/PHP/.test(ex.personaFor("php")), "php persona metni");
  assert.strictEqual(ex.personaFor("genel"), "", "genel persona boş");
  assert.ok(ex.list().some((e) => e.id === "devops"), "liste devops içerir");
  ok("Uzman modları: persona çözümleme");
}

// 31) Streaming altyapısı: ollamaChatStream dışa aktarılmış olmalı
{
  const ocMod = await import(path.join(mainDir, "agent", "ollama-client.js"));
  const oc = ocMod.default || ocMod;
  assert.strictEqual(typeof oc.ollamaChatStream, "function", "ollamaChatStream var");
  assert.strictEqual(typeof oc.ollamaChat, "function", "ollamaChat hâlâ var (yedek yol)");
  ok("Streaming: ollamaChatStream dışa aktarıldı (yedek olarak ollamaChat duruyor)");
}

// 32) Çoklu sağlayıcı: openai-client dışa aktarımları
{
  const oaMod = await import(path.join(mainDir, "agent", "openai-client.js"));
  const oa = oaMod.default || oaMod;
  assert.strictEqual(typeof oa.openaiChat, "function", "openaiChat var");
  assert.strictEqual(typeof oa.openaiChatStream, "function", "openaiChatStream var");
  assert.strictEqual(typeof oa.openaiTest, "function", "openaiTest var");
  assert.ok(/\/v1$/.test(oa.DEFAULT_BASE_URL), "varsayılan base url /v1");
  ok("Çoklu sağlayıcı: OpenAI-uyumlu istemci dışa aktarıldı");
}

// 33) Kod çalıştırıcı: python ve JS gerçekten çalışır + desteklenmeyen dil
{
  const crMod = await import(path.join(mainDir, "agent", "code-runner.js"));
  const cr = crMod.default || crMod;
  const py = await cr.runCode("python", "print(6*7)");
  assert.ok(py.stdout.includes("42"), "python çıktısı 42");
  const js = await cr.runCode("javascript", "console.log(3+4)");
  assert.ok(js.stdout.includes("7"), "js çıktısı 7");
  const bad = await cr.runCode("ruby", "puts 1");
  assert.strictEqual(bad.ok, false, "desteklenmeyen dil reddedilir");
  ok("Kod çalıştırıcı: python/JS çalışır, desteklenmeyen dil reddedilir");
}

// 34) Proje Beyni: projectContext sistem promptuna girer
{
  const spMod = await import(path.join(mainDir, "agent", "system-prompt.js"));
  const sp = spMod.default || spMod;
  const withCtx = sp.buildSystemPrompt("chat", { projectContext: "Bu sohbet bayi portali icindir" });
  assert.ok(/Proje Beyni/.test(withCtx) && /bayi portali/.test(withCtx), "bağlam prompta girer");
  const without = sp.buildSystemPrompt("chat", {});
  assert.ok(!/Proje Beyni/.test(without), "bağlam yoksa blok eklenmez");
  ok("Proje Beyni: sohbet bağlamı sistem promptuna işlenir");
}

// 35) MCP istemcisi: mock sunucuya bağlan, araç listele + çağır
{
  const http = await import("node:http");
  const mcpMod = await import(path.join(mainDir, "agent", "mcp-client.js"));
  const mcp = mcpMod.default || mcpMod;
  const server = http.createServer((req, res) => {
    let d = ""; req.on("data", (c) => (d += c));
    req.on("end", () => {
      const m = JSON.parse(d || "{}");
      const J = (o) => { res.writeHead(200, { "Content-Type": "application/json", "mcp-session-id": "s1" }); res.end(JSON.stringify(o)); };
      if (m.method === "initialize") return J({ jsonrpc: "2.0", id: m.id, result: { serverInfo: { name: "Mock" } } });
      if (m.method === "notifications/initialized") { res.writeHead(202); return res.end(); }
      if (m.method === "tools/list") return J({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "echo", description: "yankı" }] } });
      if (m.method === "tools/call") return J({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "ok:" + m.params.name }] } });
      J({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "yok" } });
    });
  });
  await new Promise((r) => server.listen(0, r));
  const url = "http://127.0.0.1:" + server.address().port + "/mcp";
  try {
    const { tools } = await mcp.listTools(url);
    assert.ok(tools.some((t) => t.name === "echo"), "araç listelenir");
    const c = await mcp.callTool(url, "echo", { x: 1 });
    assert.ok(c.text.includes("ok:echo"), "araç çağrılır");
    ok("MCP istemcisi: bağlan + listele + çağır (mock)");
  } finally {
    server.close();
  }
}

// 36) Sürekli öğrenme: kaynak çekimi (canlı) + depo tekrar engelleme
{
  const lMod = await import(path.join(mainDir, "agent", "learning.js"));
  const L = lMod.default || lMod;
  const notes = await L.fetchKnowledge("Wikipedia");
  assert.ok(Array.isArray(notes) && notes.length >= 1, "en az bir kaynaktan bilgi");
  const storeMod = await import(path.join(mainDir, "agent", "learning-store.js"));
  const store = storeMod.default || storeMod;
  process.env.CODEGA_LEARNING_PATH = path.join(os.tmpdir(), "codega-learn-test-" + Date.now() + ".json");
  const a1 = store.addNotes(notes);
  const a2 = store.addNotes(notes);
  assert.ok(a1 >= 1, "ilk ekleme");
  assert.strictEqual(a2, 0, "tekrarlar eklenmez");
  store.clearAll();
  ok("Sürekli öğrenme: kaynak çekimi + tekrar engelleme");
}

// 37) Kör olma: öğrenilen bilgi sistem promptuna girer + konu havuzu
{
  const spMod = await import(path.join(mainDir, "agent", "system-prompt.js"));
  const sp = spMod.default || spMod;
  const withLearned = sp.buildSystemPrompt("chat", { learnedContext: ["[wikipedia] PHP: betik dili"] });
  assert.ok(/otonom öğrenme/i.test(withLearned) && /betik dili/.test(withLearned), "öğrenilen bilgi prompta girer");
  const storeMod = await import(path.join(mainDir, "agent", "learning-store.js"));
  const store = storeMod.default || storeMod;
  process.env.CODEGA_LEARNING_PATH = path.join(os.tmpdir(), "codega-topic-" + Date.now() + ".json");
  assert.strictEqual(store.addTopic("yapay zeka ajanlari"), true, "konu eklenir");
  assert.strictEqual(store.addTopic("yapay zeka ajanlari"), false, "tekrar konu eklenmez");
  assert.ok(store.getTopics().includes("yapay zeka ajanlari"), "konu havuzda");
  store.clearAll();
  ok("Kör olma: öğrenilen bilgi prompta girer + ajan kendi konusunu biriktirir");
}

// 38) Anlamsal arama: cosine + embedding geri-doldurma + semantik sıralama
{
  const eMod = await import(path.join(mainDir, "agent", "embeddings.js"));
  const E = eMod.default || eMod;
  assert.ok(Math.abs(E.cosine([1,2,3],[1,2,3]) - 1) < 1e-9, "aynı vektör cosine=1");
  assert.ok(Math.abs(E.cosine([1,0],[0,1])) < 1e-9, "dik vektör cosine=0");
  const storeMod = await import(path.join(mainDir, "agent", "learning-store.js"));
  const store = storeMod.default || storeMod;
  process.env.CODEGA_LEARNING_PATH = path.join(os.tmpdir(), "codega-sem-" + Date.now() + ".json");
  store.addNotes([
    { source: "web", topic: "PHP", text: "PHP web betik dili", url: "", at: 1 },
    { source: "web", topic: "Kedi", text: "Kedi memeli hayvan", url: "", at: 2 },
  ]);
  const fake = async (t) => (/php|betik|web/i.test(t) ? [1, 0] : [0, 1]);
  const n = await store.backfillEmbeddings(fake, 10);
  assert.strictEqual(n, 2, "iki not embedlendi");
  const top = store.searchSemantic([0.95, 0.05], 1, 0.2);
  assert.ok(top.length === 1 && top[0].topic === "PHP", "anlamsal en yakın PHP");
  store.clearAll();
  ok("Anlamsal arama: cosine + geri-doldurma + semantik sıralama");
}

// 39) Kurucu: model boyut tablosu + OS-uygun kurucu URL + algılama
{
  const iMod = await import(path.join(mainDir, "agent", "installer.js"));
  const I = iMod.default || iMod;
  assert.strictEqual(I.modelSizeGb("qwen3:8b"), 5.2, "bilinen model boyutu");
  assert.strictEqual(I.modelSizeGb("bilinmeyen-model"), null, "bilinmeyen -> null");
  assert.ok(/ollama\.com/.test(I.ollamaInstallerUrl()), "kurucu URL ollama.com");
  const det = await I.detectOllama();
  assert.strictEqual(typeof det, "boolean", "detectOllama boolean döner");
  ok("Kurucu: boyut tablosu + URL + algılama");
}

// 40) MCP -> ajan araç döngüsü: kayıt + tanıma + araç-promptunda görünme
{
  const tMod = await import(path.join(mainDir, "agent", "tools.js"));
  const T = tMod.default || tMod;
  const added = T.setMcpTools("http://x/mcp", [{ name: "saat", description: "saat verir" }]);
  assert.ok(added.includes("mcp_saat"), "mcp aracı kaydedilir");
  const prompt = T.toolsSystemPrompt();
  assert.ok(/mcp_saat/.test(prompt), "mcp aracı araç-promptunda görünür");
  T.clearMcpTools();
  const prompt2 = T.toolsSystemPrompt();
  assert.ok(!/mcp_saat/.test(prompt2), "temizlenince prompttan çıkar");
  ok("MCP -> ajan döngüsü: kayıt + tanıma + promptta görünme");
}

// 41) Damıtım promptu (saf): konu + kaynak notları içerir
{
  const lMod = await import(path.join(mainDir, "agent", "learning.js"));
  const L = lMod.default || lMod;
  const msgs = L.buildDistillMessages("PHP 8.3", "[wikipedia] PHP betik dili\n[github] repo");
  assert.ok(Array.isArray(msgs) && msgs.length === 2, "iki mesaj");
  assert.ok(/damıtıcı/i.test(msgs[0].content), "sistem rolü damıtıcı");
  assert.ok(/PHP 8\.3/.test(msgs[1].content) && /betik dili/.test(msgs[1].content), "konu+notlar kullanıcı mesajında");
  ok("Damıtım promptu: konu + kaynak notları doğru kurulur");
}

// 42) Sürekli öğrenme kaynakları: yeni meşru çekiciler + kaynak seçimi
{
  const lMod = await import(path.join(mainDir, "agent", "learning.js"));
  const L = lMod.default || lMod;
  for (const name of ["stackoverflow", "arxiv", "hackernews", "mdn"]) {
    assert.ok(L.DEFAULT_SOURCES.includes(name), `${name} varsayılan kaynaklarda`);
  }
  assert.deepStrictEqual(L.normalizeSources("mdn, stackoverflow, bilinmeyen"), ["mdn", "stackoverflow"]);
  const notes = await L.fetchKnowledge("PHP array", { sources: "mdn,stackoverflow" });
  assert.ok(Array.isArray(notes), "seçili kaynaklar dizi döner");
  assert.ok(notes.every((n) => ["mdn", "stackoverflow"].includes(n.source)), "yalnız seçili kaynaklar döner");
  ok("Sürekli öğrenme kaynakları: seçim + yeni çekiciler");
}

console.log(`\n${passed} test geçti ✅`);
