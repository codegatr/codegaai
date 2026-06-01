import { assert, require } from "./_setup.mjs";

const mlvc = require("../../src/main/agent/mlvc");

const answer = mlvc.solveDeterministic("5 red, 5 blue. 2 draws. Both red.");
assert.match(answer, /Final Answer:\s*2\/9/);
