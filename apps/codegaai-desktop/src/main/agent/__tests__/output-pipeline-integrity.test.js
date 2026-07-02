"use strict";

/**
 * output-pipeline-integrity.test.js — ACİL BLOKER regresyonu (alpha.102)
 *
 * Kök neden: collapseRepetition (her yerel yanıta uygulanır) kod korumasını
 * yalnız KAPALI ```fence```lerde uyguluyordu. Fence'siz veya kapanmamış-fence'li
 * SQL/PHP "düz metin" sayılıyor; ≥40 karakterlik özdeş satırlar (iki tabloda
 * aynı created_at kolonu gibi) küresel dedup'la SİLİNİYOR, 12-gram phrase-loop
 * kesici meşru desen tekrarında kuyruğu KESİYORDU → satır kaybı, sıkışan kod.
 *
 * Sözleşme: kod içeriği HİÇBİR aşamada normalize edilmez/silinmez.
 */

const { collapseRepetition } = require("../anti-loop");
const { ollamaChatStream } = require("../ollama-client");

const enc = new TextEncoder();
function streamResponse(lines) {
  const chunks = lines.map((o) => enc.encode(JSON.stringify(o) + "\n"));
  let i = 0;
  return { ok: true, body: { getReader() { return { read() {
    if (i < chunks.length) return Promise.resolve({ done: false, value: chunks[i++] });
    return Promise.resolve({ done: true, value: undefined });
  } }; } } };
}
const tok = (c) => ({ message: { role: "assistant", content: c } });
const fin = (r) => ({ done: true, done_reason: r, message: { content: "" } });
afterEach(() => { delete global.fetch; jest.clearAllMocks(); });

// İki tabloda ÖZDEŞ kolon satırları — meşru tekrar (dedup kurbanıydı).
const SQL = [
  "CREATE TABLE cariler (",
  "  id INT AUTO_INCREMENT PRIMARY KEY,",
  "  unvan VARCHAR(255) NOT NULL COMMENT 'Cari unvanı',",
  "  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Oluşturulma zamanı',",
  "  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Güncellenme zamanı'",
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
  "",
  "CREATE TABLE islemler (",
  "  id INT AUTO_INCREMENT PRIMARY KEY,",
  "  cari_id INT NOT NULL COMMENT 'İşlemi yapılan cari',",
  "  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Oluşturulma zamanı',",
  "  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Güncellenme zamanı',",
  "  FOREIGN KEY (cari_id) REFERENCES cariler(id) ON DELETE CASCADE",
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
].join("\n");

const PHP = [
  "<?php",
  "declare(strict_types=1);",
  "class CariRepository {",
  "  public function __construct(private PDO $db) {}",
  "  public function findById(int $id): ?array {",
  "    $stmt = $this->db->prepare('SELECT * FROM cariler WHERE id = ?');",
  "    $stmt->execute([$id]);",
  "    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;",
  "  }",
  "}",
].join("\n");

describe("1+3) SQL — kapalı fence, fence'siz ve kapanmamış fence", () => {
  test("kapalı ```sql fence``` içeriği bayt-bayt korunur", () => {
    const msg = "Şema aşağıda:\n\n```sql\n" + SQL + "\n```\n\nHazır.";
    expect(collapseRepetition(msg)).toBe(msg.trim());
  });
  test("FENCESİZ çok satırlı SQL korunur (özdeş kolon satırları silinmez)", () => {
    const out = collapseRepetition(SQL);
    expect(out).toBe(SQL);
    expect((out.match(/created_at DATETIME/g) || []).length).toBe(2);
    expect(out).toMatch(/FOREIGN KEY \(cari_id\)/); // kuyruk kesilmedi
  });
  test("KAPANMAMIŞ fence: fence sonrası kod korunur", () => {
    const msg = "Şema:\n\n```sql\n" + SQL + "\n"; // kapanış yok (kesildi)
    const out = collapseRepetition(msg);
    expect((out.match(/created_at DATETIME/g) || []).length).toBe(2);
    expect(out).toMatch(/FOREIGN KEY/);
  });
});

describe("2) PHP class çok satırlı", () => {
  test("fence'siz PHP class satır satır korunur", () => {
    expect(collapseRepetition(PHP)).toBe(PHP);
  });
});

describe("4+5) Türkçe karakter ve satır sonu koruması", () => {
  test("Türkçe karakterler ve \\n'ler değişmeden geçer", () => {
    const msg = "Başlık: İşlem Özeti\n\nÇığır açan güncelleme şöyle:\n- ğüşiöç ĞÜŞİÖÇ\n- İkinci satır.";
    expect(collapseRepetition(msg)).toBe(msg);
  });
  test("gerçek prose tekrarı hâlâ süzülür (koruma anti-loop'u öldürmedi)", () => {
    const s = "Bu uzun cümle model tarafından defalarca aynen tekrarlanan bir çöp örneğidir tamam mı. ";
    const out = collapseRepetition(s + s + s + s);
    expect((out.match(/çöp örneğidir/g) || []).length).toBe(1);
  });
});

describe("6) Stream token sınırı — birleştirme kayıpsız", () => {
  test("kelime/yenisatır ortasından bölünen tokenlar aynen birleşir", async () => {
    const parts = ["CREATE TA", "BLE cariler (\n  id INT,\n", "  unvan VAR", "CHAR(255) NOT NULL\n", ");"];
    global.fetch = jest.fn(async () => streamResponse([...parts.map(tok), fin("stop")]));
    const full = await ollamaChatStream("m", [{ role: "user", content: "x" }], {});
    expect(full).toBe(parts.join(""));
    expect(full).toMatch(/CREATE TABLE cariler \(\n {2}id INT,\n {2}unvan VARCHAR\(255\) NOT NULL\n\);/);
  });
});

describe("7) Duplicate chunk — meşru özdeş satırlar hayatta kalır", () => {
  test("iki kez gelen özdeş kısa kod satırı ('};') kaybolmaz", async () => {
    const parts = ["if (a) {\n  x();\n};\n", "if (b) {\n  y();\n};\n"];
    global.fetch = jest.fn(async () => streamResponse([...parts.map(tok), fin("stop")]));
    const full = await ollamaChatStream("m", [{ role: "user", content: "x" }], {});
    expect((collapseRepetition(full).match(/};/g) || []).length).toBe(2);
  });
});
