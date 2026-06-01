import { assert, require } from "./_setup.mjs";

const tde = require("../../src/main/agent/tde");
const modelManager = require("../../src/main/model-manager");

const report = tde.decomposeTasks(`
### Note
This is just context.

### Test 1
80 sheep. All except 20 die.

### Example
Ignore this explanatory heading.

### Test 2
7x + 13 = 90

### Test 3
5 red, 5 blue. 2 draws. Both red.

### Test 4
Father + Son = 98. Father = 6×Son. Future ratio = 4. How many years later?

### Test 5
90,000 profit. Ratio 2:3:4.
`);

assert.equal(report.count, 5);
assert.deepEqual(report.tasks.map((task) => task.label), ["Test 1", "Test 2", "Test 3", "Test 4", "Test 5"]);

const fakeApprove = async () => JSON.stringify({
  ok: true,
  reasoningScore: 99,
  mathScore: 99,
  logicScore: 99,
  consistencyScore: 99,
  completenessScore: 99,
  errors: [],
  answer: "",
});

const checks = [
  [/20/, report.tasks[0], "Final Answer: 60"],
  [/11/, report.tasks[1], "Final Answer: 5"],
  [/2\/9/, report.tasks[2], "Final Answer: 1"],
  [/9\.3333333333/, report.tasks[3], "Final Answer: Father 84, son 14"],
  [/20000.*30000.*40000|20,000.*30,000.*40,000/s, report.tasks[4], "Final Answer: 500"],
];

for (const [pattern, task, draft] of checks) {
  const verified = await modelManager._verifyTaskLocalAnswer(task, draft, fakeApprove);
  assert.equal(verified.ok, true, `${task.label} should pass task-local verification`);
  assert.match(verified.answer, pattern);
}
