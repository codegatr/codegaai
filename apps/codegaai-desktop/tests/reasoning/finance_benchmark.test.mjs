import { assert, require } from "./_setup.mjs";

const mlvc = require("../../src/main/agent/mlvc");

const financeBenchmark = `FINANCE BENCHMARK V1

Test 1

Fatura:
100.000 TL

Fatura Tarihi:
01.01.2026

Vade:
30 gun

Odeme:
15.03.2026

Kac gun gecikmistir?

---

Test 2

Cari Borc:
250.000 TL

Odemeler:

50.000 TL
75.000 TL
25.000 TL

Kalan borc nedir?

---

Test 3

Urun:
120.000 TL

KDV:
%20

Toplam fatura tutari kac TL olur?

---

Test 4

Toplam kar:
900.000 TL

Ortaklik orani:

A = %50
B = %30
C = %20

Her ortak kac TL alir?

---

Test 5

Bir musterinin borcu:
180.000 TL

Odemeler:

01.02.2026 -> 50.000 TL
15.02.2026 -> 25.000 TL
20.03.2026 -> 40.000 TL

Kalan borc nedir?`;

const answer = mlvc.solveDeterministic(financeBenchmark);

assert.match(answer, /Test 1: 43 gun|Test 1: 43 gün/);
assert.match(answer, /01\.01\.2026 \+ 30 gun|01\.01\.2026 \+ 30 gün/);
assert.match(answer, /31\.01\.2026/);
assert.match(answer, /15\.03\.2026/);
assert.match(answer, /Test 2: 100\.000 TL/);
assert.match(answer, /250\.000 - \(50\.000 \+ 75\.000 \+ 25\.000\) = 100\.000 TL/);
assert.match(answer, /Test 3: 144\.000 TL/);
assert.match(answer, /120\.000.*144\.000 TL/);
assert.match(answer, /Test 4: A: 450\.000 TL, B: 270\.000 TL, C: 180\.000 TL/);
assert.match(answer, /Oran toplamı %100|Oran toplami %100/);
assert.match(answer, /Test 5: 65\.000 TL/);
assert.match(answer, /180\.000 - \(50\.000 \+ 25\.000 \+ 40\.000\) = 65\.000 TL/);
assert.equal((answer.match(/Final Answer:/g) || []).length, 1);
assert.match(answer, /Final Answer: Test 1: 43 gun|Final Answer: Test 1: 43 gün/);
assert.match(answer, /Test 5: 65\.000 TL/);
