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

// ── Level 2 — Senior Developer (Phase II, tam islenmis) ────────────────────────

/** Level 2 dersi kisayolu — ortak alanlari doldurur. */
function l2(idSuffix, title, fields) {
  return {
    id: `L2-${idSuffix}`,
    level: 2,
    title,
    goal: fields.goal,
    theory: fields.theory,
    examples: fields.examples || [],
    rules: fields.rules || { do: [], dont: [], why: "" },
    commonMistakes: fields.commonMistakes || [],
    architectureNotes: fields.architectureNotes || "",
    exercise: fields.exercise || "",
    exam: { passScore: 70, questions: fields.questions || [] },
    brainRules: fields.brainRules || [],
  };
}

const LEVEL2_LESSONS = [
  l2("architecture", "Katmanli mimari ve IPC sinirlari", {
    goal: "main/renderer/agent ayrimini ve IPC sinirlarinin neden onemli oldugunu kavramak.",
    theory:
      "CODEGA Electron uygulamasi katmanlidir: renderer (UI) -> preload (kopru) -> main " +
      "(is mantigi, dosya, model). Agir is ve gizli yetenekler main'de; renderer sadece " +
      "mesaj gonderir. Bu sinir guvenligi ve test edilebilirligi saglar.",
    examples: ["renderer asla fs/child_process kullanmaz", "preload sadece beyaz-liste IPC sunar"],
    rules: { do: ["Is mantigini main'e koy", "preload'da yetenekleri beyaz-listele"],
             dont: ["renderer'a node yetkisi acma", "IPC sinirini atlama"],
             why: "Sinir, hem guvenligi hem de moduler test edilebilirligi korur." },
    commonMistakes: ["nodeIntegration acmak", "is mantigini renderer'a sizdirmak"],
    architectureNotes: "main/agent/* moduler; her alt sistem kendi ipc.js'iyle kayit olur.",
    exercise: "Bir yetenegi preload beyaz-listesine ekleyip renderer'dan IPC ile cagir.",
    questions: [
      q("Agir is ve dosya erisimi hangi katmanda olmali?",
        ["renderer", "preload", "main process", "fark etmez"], 2),
      q("preload'un gorevi nedir?",
        ["UI render", "beyaz-listeli IPC kopru", "model calistirma", "dosya yazma"], 1),
    ],
    brainRules: [{ type: "arch_decision", title: "Keep heavy work and capabilities in main, not renderer",
      description: "Is mantigi/dosya/model main'de; renderer sadece IPC mesaji gonderir. preload yetenekleri beyaz-listeler.",
      tags: ["electron", "architecture", "ipc", "security"], confidence: 0.9, source: "principle" }],
  }),
  l2("performance", "Olcmeden optimize etme", {
    goal: "Performans degisikliklerinin once olculmesi gerektigini ogrenmek.",
    theory:
      "Optimizasyon tahminle degil olcumle yapilir. Once benchmark/baseline al, darbogazi " +
      "kanitla, sonra degistir, sonra tekrar olc. Aksi halde okunabilirligi bozup hicbir " +
      "kazanc saglamayabilirsin.",
    examples: ["YANLIS: 'bu yavas olabilir' deyip refactor", "DOGRU: baseline ms -> degisiklik -> yeni ms kiyas"],
    rules: { do: ["Once benchmark al", "Degisiklik sonrasi tekrar olc"],
             dont: ["Tahminle optimize etme", "Olcumsuz 'hizlandirdim' deme"],
             why: "Olcumsuz optimizasyon cogu zaman karmasiklik ekler, kazanc getirmez." },
    commonMistakes: ["mikro-optimizasyon", "yanlis darbogazi hedeflemek"],
    architectureNotes: "self-qa-agent perf regresyonunu baseline'a gore uyari olarak isaretler.",
    exercise: "Bir fonksiyonun baseline suresini olc, degistir, kiyasla.",
    questions: [
      q("Optimizasyona baslarken ilk adim nedir?",
        ["hemen refactor", "baseline/benchmark olcumu", "kutuphane degistir", "cache ekle"], 1),
      q("Olcumsuz optimizasyonun riski nedir?",
        ["yok", "karmasiklik ekler, kazanc belirsiz", "her zaman hizlandirir", "test gerekmez"], 1),
    ],
    brainRules: [{ type: "perf_insight", title: "Always benchmark before optimization",
      description: "Once baseline al, darbogazi kanitla, degistir, tekrar olc. Tahminle optimize etme.",
      tags: ["performance", "benchmark"], confidence: 0.9, source: "principle" }],
  }),
  l2("async", "Async: yarisi onle, hatayi yutma", {
    goal: "Promise/await tuzaklarini ve yaris kosullarini guvenli ele almayi ogrenmek.",
    theory:
      "Fire-and-forget promise'ler (await/.catch olmadan) hatayi sessizce yutar. Async init " +
      "yaris kosulu olusturabilir; bagimliligi hazir olmadan kullanma. CODEGA'da Academy " +
      "EngineeringBrain'i ACE async init bitince setEngineeringBrain ile race-free baglandi.",
    examples: ["YANLIS: doStuff(); // promise yutuldu", "DOGRU: await doStuff().catch(handle)"],
    rules: { do: [".catch veya try/await kullan", "Async bagimliligi hazir olunca bagla"],
             dont: ["Promise'i yutma", "Init bitmeden bagimliligi kullanma"],
             why: "Yutulan hata teshisi imkansiz kilar; yaris kosulu kararsiz davranis uretir." },
    commonMistakes: ["unhandled rejection", "init tamamlanmadan erisim"],
    architectureNotes: "registerAcademyIpc senkron handler kaydeder; brain sonradan baglanir.",
    exercise: "Bir async init'i, bagimliligi .then icinde baglayacak sekilde race-free yaz.",
    questions: [
      q("await/.catch olmadan cagrilan promise ne riski tasir?",
        ["daha hizli", "hatayi sessizce yutar", "bellek temizler", "risksiz"], 1),
      q("Async init yaris kosulu nasil onlenir?",
        ["rastgele bekle", "bagimlilik hazir olunca bagla (then/await)", "senkron yap", "gormezden gel"], 1),
    ],
    brainRules: [{ type: "antipattern", title: "Never swallow async errors; bind async deps race-free",
      description: "Promise'leri await/.catch ile ele al; async bagimliligi init bitince bagla (yaris kosulunu onle).",
      tags: ["async", "promise", "race-condition"], confidence: 0.9, source: "codega-incident" }],
  }),
  l2("memory", "Kalici hafiza: sinirli ve append-only", {
    goal: "Durum kalicilastirmada sinirli diziler ve append-only loglarin onemini ogrenmek.",
    theory:
      "Kalici hafiza buyumeyi kontrol etmeli: diziler sinirlanmali (ornek son N), olay loglari " +
      "append-only JSONL olmali. CODEGA project-brain _append her alanda max sinir uygular; " +
      "Academy learning-history.jsonl append-only'dir.",
    examples: ["sinirli: arr.push(x); if(arr.length>max) arr.shift()", "append-only: fs.appendFileSync(jsonl, line)"],
    rules: { do: ["Buyuyen dizileri sinirla", "Olaylari append-only logla"],
             dont: ["Sinirsiz birikim", "Tum durumu her seferinde rewrite edip sismek"],
             why: "Sinirsiz hafiza disk/bellek sismesine ve yavaslamaya yol acar." },
    commonMistakes: ["sinirsiz array push", "buyuk JSON'u surekli rewrite"],
    architectureNotes: "transcript.json kucuk durum; buyuyen olaylar ayri jsonl dosyalarda.",
    exercise: "Son 50 ile sinirli bir kayit listesi + append-only log yaz.",
    questions: [
      q("Buyuyen olay kayitlari icin uygun bicim nedir?",
        ["tek buyuk JSON rewrite", "append-only JSONL", "bellekte tutup kaybetmek", "her olay icin yeni dosya"], 1),
      q("Sinirsiz buyuyen dizinin riski?",
        ["yok", "bellek/disk sismesi ve yavaslama", "daha hizli", "daha guvenli"], 1),
    ],
    brainRules: [{ type: "arch_decision", title: "Bound growing arrays; persist events append-only",
      description: "Durum dizilerini sinirla (son N), olaylari append-only JSONL ile yaz. Buyuk JSON'u surekli rewrite etme.",
      tags: ["memory", "persistence", "jsonl"], confidence: 0.88, source: "codega-pattern" }],
  }),
  l2("builder", "Builder Engine: stack -> proje -> ZIP", {
    goal: "Builder'in girdi/stack'ten dogrulanmis proje ciktisi uretme akisini kavramak.",
    theory:
      "Builder Engine bir stack secip dosya manifesti uretir ve ciktiyi paketler. Cikti " +
      "dogrulanmali (beklenen dosyalar var mi) ve guvenli paketlenmeli (ZIP). Uretilen kod " +
      "da CODEGA kurallarina uymali (orn. UTF-8, test).",
    examples: ["stack -> file-manifest -> ZIP", "uretilen projede README + calisma talimati"],
    rules: { do: ["Cikti dosyalarini dogrula", "Guvenli paketleme kullan"],
             dont: ["Dogrulamadan teslim etme", "Eksik manifest ile ZIP'leme"],
             why: "Dogrulanmamis cikti kullaniciya bozuk proje teslim eder." },
    commonMistakes: ["manifest dogrulamasi atlamak", "bos/eksik ZIP"],
    architectureNotes: "builder-engine + zip-engine; archiver lazy-require ile yuklenir.",
    exercise: "Bir stack icin minimal manifest + ZIP cikti akisi tasarla.",
    questions: [
      q("Builder ciktisi teslimden once ne yapilmali?",
        ["hemen gonder", "beklenen dosyalari dogrula", "sil", "yeniden adlandir"], 1),
      q("Builder hangi modulle paketler?",
        ["model-manager", "zip-engine", "update-service", "preload"], 1),
    ],
    brainRules: [{ type: "test_strategy", title: "Validate builder output before delivery",
      description: "Builder ciktisini (beklenen dosyalar) dogrula, guvenli paketle; eksik manifestle ZIP'leme.",
      tags: ["builder", "zip", "validation"], confidence: 0.85, source: "codega-pattern" }],
  }),
  l2("zip", "ZIP Engine: agir bagimligi lazy-require et", {
    goal: "Startup cokmesini onlemek icin agir/opsiyonel bagimliliklarin lazy yuklenmesini ogrenmek.",
    theory:
      "Gercek CODEGA olayi: archiver'in tepe-seviye require'i uygulamayi acilista cokertti. " +
      "Cozum: archiver'i sadece kullanildigi anda (fonksiyon icinde) require et + asarUnpack " +
      "ile asar disina cikar. Agir/native bagimliliklar lazy yuklenmeli.",
    examples: ["YANLIS: const archiver = require('archiver') // tepe seviye", "DOGRU: packToZip icinde require('archiver')"],
    rules: { do: ["Agir bagimliligi fonksiyon icinde require et", "Native dep'i asarUnpack'e ekle"],
             dont: ["Agir/native dep'i tepe-seviye require etme", "asar icinde native binary cagirma"],
             why: "Tepe-seviye agir require startup'i cokertir; lazy-require bunu onler." },
    commonMistakes: ["startup'ta tum dep'leri yuklemek", "asarUnpack'i unutmak"],
    architectureNotes: "check.mjs archiver'in asarUnpack'te oldugunu dogrular.",
    exercise: "Bir agir modulu lazy-require eden bir fonksiyon yaz.",
    questions: [
      q("archiver startup cokmesinin cozumu neydi?",
        ["kaldirmak", "lazy-require + asarUnpack", "yeni surum", "renderer'a tasimak"], 1),
      q("Native bagimlilik asar ile nasil calisir?",
        ["calismaz", "asarUnpack ile asar disina cikarilir", "her zaman calisir", "renderer'da"], 1),
    ],
    brainRules: [{ type: "bug_pattern", title: "Lazy-require heavy/native deps; asarUnpack them",
      description: "Agir/native bagimliligi tepe-seviye require etme (startup cokebilir); kullanildigi yerde require et + asarUnpack.",
      tags: ["zip", "archiver", "startup", "asar"], confidence: 0.95, source: "codega-incident" }],
  }),
  l2("git-agent", "Git Agent: branch izolasyonu, main'e otomatik merge yok", {
    goal: "Otonom kod degisikliginin branch izolasyonu ve insan onayi gerektirdigini ogrenmek.",
    theory:
      "Otonom gelistirme non-default branch'te calisir, sadece kapsanan dosyalari degistirir, " +
      "draft PR acar ve CI + insan onayi ister. Sistem main'e ASLA kendi merge etmez.",
    examples: ["aep/<task>-<slug> branch", "draft PR + Self QA Agent gate"],
    rules: { do: ["Non-default branch kullan", "Draft PR ac, insan onayi bekle"],
             dont: ["main'e otomatik merge", "Kapsam disi dosyalara dokunma"],
             why: "Denetimsiz mutasyon production'i bozar; izolasyon + onay guvenligi saglar." },
    commonMistakes: ["main'e dogrudan commit", "kapsam disi degisiklik"],
    architectureNotes: "patch-generator draft PR uretir; self-qa-agent release-gate.",
    exercise: "Bir patch akisini branch + draft PR + onay olarak tasarla.",
    questions: [
      q("Otonom sistem main'e ne yapar?",
        ["otomatik merge", "asla kendi merge etmez, insan onayi ister", "force push", "rebase"], 1),
      q("Otonom degisiklik nerede yapilir?",
        ["main", "non-default branch", "detached HEAD", "tag"], 1),
    ],
    brainRules: [{ type: "arch_decision", title: "Autonomous changes: branch-isolated, never self-merge to main",
      description: "Otonom kod non-default branch'te, kapsanan dosyalarda, draft PR + CI + insan onayi ile. Main'e otomatik merge yok.",
      tags: ["git", "autonomous", "safety", "pr"], confidence: 0.95, source: "codega-rule" }],
  }),
  l2("qa", "QA: Self QA Agent release-gate", {
    goal: "Yazilan kodu bagimsiz ikinci bir ajanin denetlemesi ve release'i bloklayabilmesini ogrenmek.",
    theory:
      "CODEGA Self QA Agent: ilk ajanin urettigi patch'i bagimsiz denetler. Test yoksa / UTF-8 " +
      "bozuksa / test basarisizsa PR acilmaz (qa_blocked). Kod yazan ajan kendi kodunun tek " +
      "yargici olamaz.",
    examples: ["patch -> SelfQAAgent.review() -> ok? PR : qa_blocked", "test yok -> blok"],
    rules: { do: ["Bagimsiz QA gate calistir", "Test/UTF-8/sonuc kontrolu zorunlu kil"],
             dont: ["Kendi kodunu tek yargic yapma", "Gate'i atlayip release etme"],
             why: "Kendi kodunu denetleyen tek ajan kor noktalari kaciri; bagimsiz gate yakalar." },
    commonMistakes: ["QA'yi atlamak", "sadece happy-path test"],
    architectureNotes: "self-qa-agent.js patch-generator'a release-gate olarak bagli.",
    exercise: "Bir patch icin test-var/UTF-8/test-gecti kontrolu yapan bir gate yaz.",
    questions: [
      q("Self QA Agent ne zaman PR'i engeller?",
        ["asla", "test yok / UTF-8 bozuk / test basarisiz", "her zaman", "rastgele"], 1),
      q("Neden ikinci bagimsiz ajan?",
        ["maliyet", "kod yazan ajan kendi kor noktasini goremez", "hiz", "gereksiz"], 1),
    ],
    brainRules: [{ type: "test_strategy", title: "An independent QA agent must gate releases",
      description: "Kodu yazan ajan tek yargic olamaz; bagimsiz QA gate test/UTF-8/sonuc kontrolu yapip release'i bloklayabilmeli.",
      tags: ["qa", "self-review", "release-gate"], confidence: 0.93, source: "codega-incident" }],
  }),
  l2("release", "Release: dogru tag, dogrulanmis asset", {
    goal: "Release'in dogru tag formatini ve asset/updater dogrulamasini gerektirdigini ogrenmek.",
    theory:
      "CODEGA'da sadece desktop-v* tag'i gercek Windows/macOS installer pipeline'ini tetikler " +
      "(.exe/.dmg/latest.yml uretir). Duz v* sadece ilgisiz Linux tarball uretir ve auto-updater " +
      "kullanamaz. Release 'basarili' denmeden once Actions bitmeli + asset'ler dogrulanmali.",
    examples: ["desktop-v6.0.0-alpha.38 -> gercek installer", "v6.0.0-... -> sadece tarball (YANLIS)"],
    rules: { do: ["desktop-v* tag kullan", "Actions bitince asset+latest.yml dogrula"],
             dont: ["Actions bitmeden 'basarili' deme", "Yanlis tag formatiyla release"],
             why: "Yanlis tag updater'in goremedigi bos release uretir; kullanici manuel kalir." },
    commonMistakes: ["v* tag kullanmak", "asset dogrulamadan duyurmak"],
    architectureNotes: "3 workflow desktop-v* push'ta tetiklenir; test:ci gate'i build oncesi.",
    exercise: "Bir release'i tag -> build -> asset dogrulama olarak adimla.",
    questions: [
      q("Hangi tag gercek installer pipeline'ini tetikler?",
        ["v*", "desktop-v*", "release-*", "herhangi"], 1),
      q("Release ne zaman 'basarili' sayilir?",
        ["tag push edilince", "Actions bitince + asset/latest.yml dogrulaninca", "commit'te", "PR acilinca"], 1),
    ],
    brainRules: [{ type: "test_strategy", title: "Release tags must be desktop-v*; verify assets before success",
      description: "Sadece desktop-v* gercek installer pipeline'ini tetikler. Actions bitmeden + asset/latest.yml dogrulanmadan basarili deme.",
      tags: ["release", "ci", "updater", "tags"], confidence: 0.95, source: "codega-incident" }],
  }),
];

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
  2: [], // Level 2 tam islenmis (LEVEL2_LESSONS)
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
    ...LEVEL2_LESSONS,
  ];

  for (let level = 3; level <= 8; level++) {
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
