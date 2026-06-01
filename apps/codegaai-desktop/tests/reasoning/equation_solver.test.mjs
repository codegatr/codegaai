import { assert, require } from "./_setup.mjs";

const mlvc = require("../../src/main/agent/mlvc");

const answer = mlvc.solveDeterministic("7x + 13 = 90. x kaçtır?");
assert.match(answer, /Final Answer:\s*11\b/);
