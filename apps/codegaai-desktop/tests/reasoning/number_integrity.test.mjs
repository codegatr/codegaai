import { assert, require } from "./_setup.mjs";

const tcnis = require("../../src/main/agent/tcnis");

assert.equal(
  tcnis.validateTCNIS("Başlangıç değeri 90,000 TL.", "İşlem: 000 x 0.9 = 0\nFinal Answer: 0 TL").ok,
  false
);
assert.equal(
  tcnis.validateTCNIS("Başlangıç değeri 125,000 TL.", "İşlem: 500 x 0.9 = 450\nFinal Answer: 450 TL").ok,
  false
);
assert.equal(
  tcnis.validateTCNIS("Başlangıç değeri 90.000 TL.", "İşlem: 90 x 0.9 = 81\nFinal Answer: 81 TL").ok,
  false
);
