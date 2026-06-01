import { assert, require } from "./_setup.mjs";

const rpre = require("../../src/main/agent/rpre");

const result = rpre.verify("90,000 profit is shared at ratio 2:3:4.", "Final Answer: 20,000, 30,000, 40,000");
assert.equal(result.status, "APPROVED");
assert.deepEqual(result.model.values, [20000, 30000, 40000]);
