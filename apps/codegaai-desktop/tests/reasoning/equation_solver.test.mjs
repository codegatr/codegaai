import { assert, require } from "./_setup.mjs";

const mlvc = require("../../src/main/agent/mlvc");

const answer = mlvc.solveDeterministic("7x + 13 = 90. x kaçtır?");
assert.match(answer, /Final Answer:\s*11\b/);

const consistency = mlvc.deterministicCheck("9x + 18 = 99. x kactir?", "Final Answer: x = 15");
assert.equal(consistency.ok, false);
assert.match(consistency.correctedAnswer, /Final Answer:\s*9\b/);
