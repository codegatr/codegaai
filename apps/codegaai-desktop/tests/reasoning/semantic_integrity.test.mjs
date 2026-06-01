import { assert, require } from "./_setup.mjs";

const mlvc = require("../../src/main/agent/mlvc");

const answer = mlvc.solveDeterministic("80 sheep. All except 20 die. Answer = 20");
assert.match(answer, /Final Answer:\s*20/);
