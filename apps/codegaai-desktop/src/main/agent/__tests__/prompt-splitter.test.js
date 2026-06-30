"use strict";

const { splitQuestions, chunkQuestions } = require("../prompt-splitter");

const TWELVE = [
  "Sorular:",
  "",
  "[Mantık] 3 kedi dizilimi nasıl mümkündür?",
  "[Dikkat] 6 hariç hepsi öldü, kaç inek kaldı?",
  "[Mühakeme] Nilüfer 40. günde dolar, 3/4 ne zaman?",
  "[Matematik] 03:15'te açı kaç derece?",
  "[Mimarî] hoisting politikası nasıl set edilir?",
  "[Otomasyon] Fail-Fast nasıl kurulur?",
  "[Performans] MessageChannel kuyruğu nasıl olmalı?",
  "[Güvenlik] fs.rename atomik yazma nasıl?",
  "[Veri Bütünlüğü] rollback döngüsü nasıl kurulur?",
  "[Eşzamanlılık] yerel Mutex nasıl çözülür?",
  "[Tedarik Zinciri] overrides politikası nasıl olmalı?",
  "[Sürüm Doğrulama] regex kontrolü nasıl entegre edilir?",
].join("\n");

describe("splitQuestions", () => {
  test("köşeli-etiketli 12 soruyu 12 segmente ayırır (ön-metin hariç)", () => {
    const segs = splitQuestions(TWELVE);
    expect(segs).toHaveLength(12);
    expect(segs[0]).toMatch(/^\[Mantık\]/);
    expect(segs[11]).toMatch(/^\[Sürüm Doğrulama\]/);
  });

  test("numaralı soruları ayırır", () => {
    const t = "1. Birinci soru?\n2) İkinci soru?\n3- Üçüncü soru?";
    expect(splitQuestions(t)).toHaveLength(3);
  });
});

describe("chunkQuestions", () => {
  test("12 soru → 4'erli 3 paket", () => {
    const r = chunkQuestions(TWELVE);
    expect(r).not.toBeNull();
    expect(r.questionCount).toBe(12);
    expect(r.chunks).toHaveLength(3);
    expect(r.chunks[0].label).toBe("Sorular 1–4");
    expect(r.chunks[2].label).toBe("Sorular 9–12");
    expect(r.chunks[0].text).toMatch(/\[Mantık\]/);
    // her paket talimat öneki taşır
    expect(r.chunks[0].text).toMatch(/sırayla/i);
  });

  test("5'ten az soru → null (normal akış)", () => {
    const t = "1. a?\n2. b?\n3. c?";
    expect(chunkQuestions(t)).toBeNull();
  });

  test("soru olmayan numaralı liste (?'siz) → null", () => {
    const t = "1. login.php oluştur\n2. register.php oluştur\n3. db.php\n4. config.php\n5. index.php\n6. style.css";
    expect(chunkQuestions(t)).toBeNull();
  });

  test("chunkSize override edilebilir", () => {
    const r = chunkQuestions(TWELVE, { chunkSize: 3 });
    expect(r.chunks).toHaveLength(4);
    expect(r.chunks[0].count).toBe(3);
  });
});
