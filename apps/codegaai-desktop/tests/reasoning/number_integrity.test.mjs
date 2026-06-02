import { assert, require } from "./_setup.mjs";

const tcnis = require("../../src/main/agent/tcnis");
const mlvc = require("../../src/main/agent/mlvc");

assert.equal(
  tcnis.validateTCNIS("Başlangıç değeri 90,000 TL.", "İşlem: 000 x 0.9 = 0\nFinal Answer: 0 TL").ok,
  false
);

const subtraction = mlvc.solveDeterministic("500.000 TL budget. Subtract 125.000, 87.500 and 62.500. How much remains?");
assert.match(subtraction, /Final Answer:\s*225\.000 TL/);
assert.equal(
  tcnis.validateTCNIS("Başlangıç değeri 125,000 TL.", "İşlem: 500 x 0.9 = 450\nFinal Answer: 450 TL").ok,
  false
);
assert.equal(
  tcnis.validateTCNIS("Başlangıç değeri 90.000 TL.", "İşlem: 90 x 0.9 = 81\nFinal Answer: 81 TL").ok,
  false
);
