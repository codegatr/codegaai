import { assert, require } from "./_setup.mjs";

const hril = require("../../src/main/agent/hril");

const delayQuestion = [
  "Fatura: 100.000 TL",
  "Fatura Tarihi: 01.01.2026",
  "Vade: 30 gun",
  "Odeme: 15.03.2026",
  "Late by how many days?",
].join("\n");

const delayAnswer = "Fatura tarihi 01.01.2026 + 30 gun = vade tarihi 31.01.2026. Odeme 15.03.2026; gecikme 43 gun.\n\nFinal Answer: 43 gun";
const delayCommentary = hril.interpret(delayQuestion, delayAnswer).answer;

assert.match(hril.detectAnswerUnit(delayAnswer), /days/);
assert.match(delayCommentary, /Final Answer:\s*43 gun/);
assert.doesNotMatch(delayCommentary, /43\s*TL/i);
assert.doesNotMatch(delayCommentary, /Başlangıç|Baslangic/i);
assert.equal(hril.parseMoney(delayQuestion, delayAnswer), null);

const percentQuestion = "Basari orani kac yuzde?";
const percentAnswer = "Final Answer: %43";
const percentCommentary = hril.interpret(percentQuestion, percentAnswer).answer;
assert.match(hril.detectAnswerUnit(percentAnswer), /percent/);
assert.doesNotMatch(percentCommentary, /43\s*TL/i);
assert.equal(hril.parseMoney(percentQuestion, percentAnswer), null);

const moneyQuestion = "Bir urun 100 TL. Once %40 zamlaniyor, sonra %40 indirim yapiliyor. Son fiyat?";
const moneyAnswer = "Final Answer: 84 TL";
const moneyCommentary = hril.interpret(moneyQuestion, moneyAnswer).answer;
assert.match(hril.detectAnswerUnit(moneyAnswer), /money/);
assert.match(moneyCommentary, /84 TL/);
assert.match(moneyCommentary, /16/);
