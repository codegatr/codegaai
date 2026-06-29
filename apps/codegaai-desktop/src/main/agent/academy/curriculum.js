"use strict";

/**
 * curriculum.js — CODEGA AI Academy mufredati
 *
 * 8 seviye, her seviye dersler iceriyor. Her ders su formatta:
 *   { id, level, title, goal, theory, examples[], rules{do[],dont[],why},
 *     commonMistakes[], architectureNotes, exercise, exam{passScore,questions[]},
 *     brainRules[] }  // brainRules: derste kazanilan kalici EngineeringBrain kurallari
 *
 * KURAL: Dersler gercek CODEGA muhendislik olaylarina dayanir (teori degil,
 * kurumsal hafiza). Her brainRule bir gercek olaydan tureyebilir (provenance).
 */

const LEVEL = Object.freeze({
  JUNIOR        : 1,
  SENIOR        : 2,
  ARCHITECT     : 3,
  PRINCIPAL     : 4,
  CTO           : 5,
  ARTIFICIAL_ENG: 6,
  COGNITION     : 7,
  EVOLUTION     : 8,
});

const LEVEL_TITLES = Object.freeze({
  1: "Junior Developer",
  2: "Senior Developer",
  3: "Software Architect",
  4: "Principal Engineer",
  5: "CTO",
  6: "Artificial Engineer",
  7: "Artificial Cognition",
  8: "Artificial Evolution",
});

/**
 * Bir cok-secmeli sinav sorusu kisayolu.
 */
function q(prompt, options, correctIndex, rationale = "") {
  return { prompt, options, correctIndex, rationale };
}

// ── Level 1 — Junior Developer (tam islenmis, gercek olaylara dayali) ──────────

const LESSON_VERSION_NOT_STRING = {
  id: "L1-semver-not-string",
  level: 1,
  title: "Semantic version'lari asla string olarak karsilastirma",
  goal: "Surum karsilastirmasinin neden string degil, parcalanmis sayisal kiyas gerektirdigini ogrenmek.",
  theory:
    "Surumler '6.0.0-alpha.9' ve '6.0.0-alpha.10' gibi. String karsilastirmasinda " +
    "'alpha.9' > 'alpha.10' cikar (cunku '9' > '1'). Bu, updater'in yeni surumu " +
    "eski sanmasina yol acar. Dogru yol: major.minor.patch ve prerelease parcalarini " +
    "ayri ayri sayisal/lexik kurallarla kiyaslamaktir (semver).",
  examples: [
    "YANLIS: if (a > b) // '6.0.0-alpha.9' > '6.0.0-alpha.10' === true (HATALI)",
    "DOGRU: semverGt(parse(a), parse(b)) // prerelease sayisini Number ile kiyasla",
  ],
  rules: {
    do: ["Surumu major/minor/patch/prerelease parcalarina ayir", "Prerelease numarasini Number() ile kiyasla"],
    dont: ["Surumleri ham string '>' / '<' ile kiyaslama", "localeCompare'a semver gibi guvenme"],
    why: "String kiyas alpha.10'u alpha.9'dan kucuk gosterir; updater regresyonu olusur.",
  },
  commonMistakes: ["`tag_name`'leri dogrudan sort etmek", "prerelease etiketini gormezden gelmek"],
  architectureNotes: "update-service.js surum kiyasini parcalanmis yapmali; tek noktadan (helper) gecmeli.",
  exercise: "parse() + semverGt() yazip 6.0.0-alpha.9 < 6.0.0-alpha.10 oldugunu dogrula.",
  exam: {
    passScore: 70,
    questions: [
      q("'6.0.0-alpha.9' ve '6.0.0-alpha.10' string olarak karsilastirilirsa sonuc ne olur?",
        ["alpha.10 buyuk cikar", "alpha.9 buyuk cikar (HATALI ama string boyle der)", "esit", "hata firlatir"],
        1, "String kiyas '9' > '1' oldugu icin alpha.9'u buyuk sanir."),
      q("Surum kiyasinin dogru yolu nedir?",
        ["localeCompare", "JSON.stringify kiyasi", "Parcalara ayirip sayisal/semver kiyas", "uzunluk kiyasi"],
        2),
    ],
  },
  brainRules: [
    { type: "antipattern", title: "Never compare semantic versions as strings",
      description: "Surumleri parcalanmis semver olarak kiyasla; ham string '>' updater regresyonuna yol acar.",
      tags: ["semver", "updater", "release"], confidence: 0.95, source: "codega-incident" },
  ],
};

const LESSON_UTF8_INTEGRITY = {
  id: "L1-utf8-integrity",
  level: 1,
  title: "Her zaman UTF-8 butunlugunu dogrula",
  goal: "Mojibake, null byte ve truncation'in neden release'i bozdugunu ve nasil yakalanacagini ogrenmek.",
  theory:
    "CODEGA'da gercek olay: installer.js dosyasinin sonu kesildi (module.exports yarida " +
    "kaldi) ve uygulama acilista 'Unexpected end of input' ile cokup kullaniciya ulasti. " +
    "Latin-1 olarak yeniden kodlanan UTF-8 'mojibake' (Ã§, Ã¼) uretir; null byte ve U+FFFD " +
    "replacement char bozulma isaretidir. Cozum: release oncesi TUM kaynak dosyalarini " +
    "syntax-check etmek ve bu desenleri taramak.",
  examples: [
    "YANLIS: sadece el-secimi 14 dosyayi node --check etmek -> installer.js gozden kacar",
    "DOGRU: src/ altindaki tum .js dosyalarini recursive node --check + 0-byte/mojibake taramasi",
  ],
  rules: {
    do: ["Release oncesi tum dosyalari syntax-check et", "Null byte / U+FFFD / mojibake desenlerini tara"],
    dont: ["El-secimi bir 'kritik dosyalar' listesine guvenme", "Bozuk dosyayi sessizce gecirme"],
    why: "Tek bir truncated dosya tum uygulamayi acilista cokertir; el-secimi liste bunu kacirir.",
  },
  commonMistakes: ["check'i sadece bilinen dosyalarla sinirlamak", "BOM/encoding'i gormezden gelmek"],
  architectureNotes: "check.mjs recursive olmali; self-qa-agent UTF-8 gate'i patch'leri bloklamali.",
  exercise: "Bilerek truncated bir dosya olustur, check'in onu yakaladigini dogrula.",
  exam: {
    passScore: 70,
    questions: [
      q("installer.js cokmesinin kok nedeni neydi?",
        ["yanlis bagimlilik", "truncated dosya + el-secimi syntax listesi onu kacirdi", "ag hatasi", "yetki sorunu"],
        1),
      q("Mojibake neyin isaretidir?",
        ["dogru UTF-8", "Latin-1 olarak yeniden kodlanmis UTF-8 bozulmasi", "gecerli JSON", "minified kod"],
        1),
    ],
  },
  brainRules: [
    { type: "test_strategy", title: "Always validate UTF-8 and full-file syntax before release",
      description: "Release oncesi src/ altindaki TUM dosyalari recursive syntax-check et + mojibake/null-byte tara. El-secimi liste yetersiz.",
      tags: ["utf8", "release", "check", "truncation"], confidence: 0.97, source: "codega-incident" },
  ],
};

const LESSON_RENDERER_NONBLOCK = {
  id: "L1-electron-renderer-nonblock",
  level: 1,
  title: "Electron renderer'i asla bloklama",
  goal: "Agir islerin main process veya worker'a tasinmasi gerektigini ogrenmek.",
  theory:
    "Renderer tek thread'dir ve UI'yi yonetir. Senkron agir is (buyuk JSON.parse, senkron " +
    "fs, uzun donguler) UI'yi dondurur. Agir is main process'e (IPC ile) veya worker'a " +
    "tasinmali; renderer responsive kalmali.",
  examples: ["YANLIS: renderer'da senkron fs.readFileSync(buyukDosya)", "DOGRU: ipcRenderer.invoke ile main'e devret"],
  rules: {
    do: ["Agir/IO islerini main process'e devret", "Stream/async kullan"],
    dont: ["Renderer'da senkron bloklayici cagri yapma", "UI thread'inde buyuk dongu calistirma"],
    why: "Bloklanan renderer = donmus UI = kullanici uygulamayi cokmus sanar.",
  },
  commonMistakes: ["renderer'da senkron fs", "main'e devretmeden agir hesap"],
  architectureNotes: "Tum agir is IPC handler'larinda; renderer sadece mesaj gonderir/sonuc gosterir.",
  exercise: "Agir bir islemi setTimeout/worker yerine IPC ile main'e tasi.",
  exam: {
    passScore: 70,
    questions: [
      q("Renderer thread'inde agir senkron is yapmak ne yapar?",
        ["performansi artirir", "UI'yi dondurur", "bellegi temizler", "etkisizdir"], 1),
    ],
  },
  brainRules: [
    { type: "perf_insight", title: "Never block the Electron renderer",
      description: "Agir/IO isleri main process veya worker'a tasi; renderer responsive kalmali.",
      tags: ["electron", "performance", "renderer"], confidence: 0.9, source: "principle" },
  ],
};

const LESSON_VERIFY_EXIT_AND_TESTS = {
  id: "L1-verify-exit-and-tests",
  level: 1,
  title: "Exit code'lari dogrula, test'siz merge etme",
  goal: "Komut basarisini exit code ile dogrulamak ve test gate'i olmadan birlestirmemek.",
  theory:
    "Bir komutun ciktisi 'basarili gorunmesi' yeterli degil; exit code 0 mi kontrol et. " +
    "Ayrica degisiklik test'le kanitlanmadan main'e girmemeli. CODEGA'da Self QA Agent " +
    "tam da bunu zorunlu kilar: test yoksa / UTF-8 bozuksa / test basarisizsa release bloklanir.",
  examples: ["YANLIS: ciktiya bakip 'tamam' demek", "DOGRU: if (exitCode !== 0) throw"],
  rules: {
    do: ["Exit code'u kontrol et", "Merge oncesi testleri calistir ve yesil oldugunu dogrula"],
    dont: ["Exit code'u gormezden gelme", "Test'siz/yesil-olmayan agacta release etme"],
    why: "Sessiz basarisizlik en pahali hatadir; test gate'i regresyonu erken yakalar.",
  },
  commonMistakes: ["`|| true` ile hatayi yutmak", "testleri 'sonra eklerim' deyip atlamak"],
  architectureNotes: "self-qa-agent release-gate; CI'da npm run test:ci her build oncesi.",
  exercise: "Bir komutu exit code kontrolu ile sarmala; basarisizsa hata firlat.",
  exam: {
    passScore: 70,
    questions: [
      q("Self QA Agent ne zaman release'i bloklar?",
        ["her zaman", "test yok / UTF-8 bozuk / test basarisiz oldugunda", "asla", "sadece pazartesi"], 1),
    ],
  },
  brainRules: [
    { type: "test_strategy", title: "Never merge without tests; always verify exit codes",
      description: "Degisiklik test'le kanitlanmadan main'e girmez; komut basarisi exit code ile dogrulanir.",
      tags: ["testing", "ci", "qa"], confidence: 0.95, source: "codega-incident" },
  ],
};

// ── Ust seviyeler — yapilandirilmis ders basliklari (Phase I iskelet) ──────────
// Her seviye icin ders basliklari + hedefleri tanimli. Tam icerik sonraki
// Academy turlarinda islenir; iskelet, transcript/sertifika sisteminin tum
// seviyeleri tanimasini saglar.

function lessonStub(level, idx, title, goal, brainRule) {
  return {
    id: `L${level}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36)}`,
    level,
    title,
    goal,
    theory: "",
    examples: [],
    rules: { do: [], dont: [], why: "" },
    commonMistakes: [],
    architectureNotes: "",
    exercise: "",
    exam: { passScore: 70, questions: [] },
    brainRules: brainRule ? [brainRule] : [],
    _stub: true,
  };
}

const STUB_TOPICS = {
  1: [], // Level 1 tam islenmis derslerle dolduruluyor (asagida)
  2: ["Architecture", "Performance", "Async", "Memory", "Builder", "ZIP", "Git Agent", "QA", "Release"],
  3: ["SOLID", "DDD", "Clean Architecture", "Event Driven", "Layered Design", "Dependency Graph", "Scalability", "Plugin Architecture"],
  4: ["Technical Debt", "Benchmark", "Refactoring", "Migration", "Compatibility", "Performance Budget", "Engineering Metrics"],
  5: ["Roadmaps", "Risk Analysis", "Release Planning", "Engineering Budget", "Cost Analysis", "Architecture Decisions", "Rollback Strategies", "Competitive Analysis"],
  6: ["Self Review", "Self Criticism", "Self Testing", "Self Benchmark", "Self Optimization", "Patch Generation", "PR Generation"],
  7: ["Project Brain", "User Brain", "Life Graph", "Mission Graph", "Knowledge Graph", "Reference Resolution", "Context Reconstruction", "Goal Memory"],
  8: ["Engineering Backlog", "Improvement Planner", "Evolution Engine", "Competitive Intelligence", "Learning Database", "Engineering Genome"],
};

// Birkac ust-seviye dersi gercek bir brainRule ile zenginlestir (cekirdek bilgi):
const ENRICHED_STUB_RULES = {
  "Context Reconstruction": { type: "arch_decision", title: "Always reconstruct context before reasoning",
    description: "LLM'e gitmeden once ACE buildContext ile kullanici+proje+hedef bağlamini insa et; bos baglamla cagirma.",
    tags: ["ace", "context", "cognition"], confidence: 0.92, source: "codega-incident" },
  "Rollback Strategies": { type: "arch_decision", title: "Always have a rollback path before shipping",
    description: "Her release oncesi backup branch + revert plani; geri donulemez islem oncesi onay.",
    tags: ["release", "rollback", "devops"], confidence: 0.9, source: "principle" },
  "Release Planning": { type: "test_strategy", title: "Release tags must be desktop-v* to trigger real builds",
    description: "Sadece desktop-v* tag'i gercek Windows/macOS installer pipeline'ini tetikler; v* sadece Linux tarball uretir.",
    tags: ["release", "ci", "tags"], confidence: 0.93, source: "codega-incident" },
};

// ── Mufredati derle ────────────────────────────────────────────────────────────

function buildCurriculum() {
  const lessons = [
    LESSON_VERSION_NOT_STRING,
    LESSON_UTF8_INTEGRITY,
    LESSON_RENDERER_NONBLOCK,
    LESSON_VERIFY_EXIT_AND_TESTS,
  ];

  for (let level = 2; level <= 8; level++) {
    const topics = STUB_TOPICS[level] || [];
    topics.forEach((title, idx) => {
      const goal = `${LEVEL_TITLES[level]} seviyesinde "${title}" yetkinligini kazanmak.`;
      lessons.push(lessonStub(level, idx, title, goal, ENRICHED_STUB_RULES[title] || null));
    });
  }

  return lessons;
}

const CURRICULUM = buildCurriculum();

function lessonsForLevel(level) {
  return CURRICULUM.filter((l) => l.level === Number(level));
}

function getLesson(id) {
  return CURRICULUM.find((l) => l.id === id) || null;
}

module.exports = {
  LEVEL,
  LEVEL_TITLES,
  CURRICULUM,
  buildCurriculum,
  lessonsForLevel,
  getLesson,
};
