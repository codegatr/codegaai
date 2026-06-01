import { assert, require } from "./_setup.mjs";

const mlvc = require("../../src/main/agent/mlvc");

const answer = mlvc.solveDeterministic("Ürün 500 TL. Önce %30 zam, sonra %20 indirim. Son fiyat kaç TL?");
assert.match(answer, /Final Answer:\s*520 TL/);
