import { assert, require } from "./_setup.mjs";

const sacv = require("../../src/main/agent/sacv");

const tasks = [
  {
    id: "1",
    label: "Task 1",
    body: "Fatura tarihi 01.01.2026. Vade 30 gun. Odeme 15.03.2026. Kac gun gecikmistir?",
  },
  {
    id: "2",
    label: "Task 2",
    body: "Cari Borc: 250.000 TL. Odemeler: 50.000 TL, 75.000 TL, 25.000 TL. Kalan borc nedir?",
  },
  {
    id: "3",
    label: "Task 3",
    body: "Urun: 120.000 TL. KDV: %20. Toplam fatura tutari kac TL olur?",
  },
  {
    id: "4",
    label: "Task 4",
    body: "Toplam kar: 900.000 TL. A = %50, B = %30, C = %20. Her ortak kac TL alir?",
  },
  {
    id: "5",
    label: "Task 5",
    body: "Bir musterinin borcu: 180.000 TL. Odemeler: 50.000 TL, 25.000 TL, 40.000 TL. Kalan borc nedir?",
  },
];

const taskReport = { applicable: true, count: tasks.length, tasks };

const finalAnswer = [
  "Test 1: 43 gun",
  "Test 2: 100.000 TL",
  "Test 3: 144.000 TL",
  "Test 4: A: 450.000 TL, B: 270.000 TL, C: 180.000 TL",
  "Test 5: 65.000 TL",
].join(" | ");

const report = sacv.debugReport(`Final Answer: ${finalAnswer}`, taskReport);

assert.equal(report.sharedStateLeak, false);
assert.deepEqual(report.errors, []);
assert.equal(report.tasks[0].detectedAnswer, "43 gun");
assert.deepEqual(report.tasks[0].detectedUnits, ["gün"]);
assert.equal(report.tasks[1].detectedAnswer, "100.000 TL");
assert.deepEqual(report.tasks[1].detectedUnits, ["TL"]);
assert.equal(report.tasks[2].detectedAnswer, "144.000 TL");
assert.deepEqual(report.tasks[2].detectedUnits, ["TL"]);
assert.match(report.tasks[3].detectedAnswer, /450\.000 TL/);
assert.match(report.tasks[3].detectedAnswer, /270\.000 TL/);
assert.match(report.tasks[3].detectedAnswer, /180\.000 TL/);
assert.deepEqual(report.tasks[3].detectedUnits, ["TL"]);
assert.equal(report.tasks[4].detectedAnswer, "65.000 TL");
assert.deepEqual(report.tasks[4].detectedUnits, ["TL"]);

const detected = report.tasks.map((task) => task.detectedAnswer);
assert.equal(new Set(detected).size, detected.length, "each task keeps its own detected answer");
for (const task of report.tasks) {
  assert.equal(typeof task.expectedAnswer, "string");
  assert.equal(typeof task.score, "number");
  assert.ok("question" in task);
}

const leaked = sacv.debugReport(
  `Final Answer: ${["58885.93 TL", "58885.93 TL", "58885.93 TL", "58885.93 TL", "58885.93 TL"].join(" | ")}`,
  taskReport
);
assert.equal(leaked.sharedStateLeak, true);
assert.deepEqual(leaked.errors, ["SACV_SHARED_STATE_LEAK"]);
