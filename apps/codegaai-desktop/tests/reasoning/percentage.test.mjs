import { assert, require } from "./_setup.mjs";

const mlvc = require("../../src/main/agent/mlvc");
const hril = require("../../src/main/agent/hril");

const answer = mlvc.solveDeterministic("Ürün 500 TL. Önce %30 zam, sonra %20 indirim. Son fiyat kaç TL?");
assert.match(answer, /Final Answer:\s*520 TL/);

const turkishScale = mlvc.solveDeterministic("1.000 TL product first increases by %20, then decreases by %20. Final price?");
assert.match(turkishScale, /Final Answer:\s*960 TL/);

const scaleQuestion = "1.000 TL +20% -20%. Final price?";
const scaleAnswer = mlvc.solveDeterministic(scaleQuestion);
const scaleMetadata = { deterministic: mlvc.deterministicCheck(scaleQuestion, scaleAnswer) };
const commentary = hril.interpret(scaleQuestion, scaleAnswer, { mlvc: scaleMetadata }).answer;
assert.match(commentary, /Final Answer:\s*960 TL/);
assert.match(commentary, /1000/);
assert.match(commentary, /1200/);
assert.match(commentary, /960/);
assert.doesNotMatch(commentary, /Başlangıç\s+1\s+TL/i);
assert.doesNotMatch(commentary, /Baslangic\s+1\s+TL/i);
