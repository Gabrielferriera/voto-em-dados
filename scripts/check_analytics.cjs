const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const A = require("../dist/analytics.js");
const record = (v1, v2, l1, l2, f1 = 0, f2 = 0) => ({
  turns: {
    1: { valid: v1, votes: { 13: l1, 22: f1 } },
    2: { valid: v2, votes: { 13: l2, 22: f2 } },
  },
});
// Fixed, independently calculated cases distinguish volume from vote share.
assert.deepEqual(A.decompose(record(100, 200, 50, 100), "13"), {
  volume: 50,
  share: 0,
  total: 50,
});
assert.deepEqual(A.decompose(record(100, 100, 50, 60), "13"), {
  volume: 0,
  share: 9.999999999999998,
  total: 10,
});
assert.equal(
  A.candidate(
    {
      turns: {
        1: { valid: 10, votes: { 30: 4 } },
        2: { valid: 10, votes: {} },
      },
    },
    "30",
  ).d,
  null,
);
assert.equal(A.decompose(record(0, 100, 0, 40), "13"), null);
const cases = [
  record(100, 100, 30, 60, 70, 40),
  record(100, 100, 70, 40, 30, 60),
  record(100, 100, 50, 50, 50, 50),
];
const summary = A.summarize(cases, "13");
assert.equal(summary.gross, 30);
assert.equal(summary.loss, -30);
assert.equal(summary.to13, 1);
assert.equal(summary.to22, 1);
assert.equal(summary.ties, 1);
assert.equal(A.summarize([record(0, 0, 0, 0)], "13").unavailable, 1);
const overview = require("../dist/data/overview.json");
const all = [overview.national, ...overview.states];
for (const file of fs.readdirSync(
  path.join(__dirname, "../dist/data/municipalities"),
))
  all.push(
    ...JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../dist/data/municipalities", file),
      ),
    ),
  );
let checked = 0;
for (const r of all)
  for (const n of ["13", "22"]) {
    if (!r.turns["1"] || !r.turns["2"]) continue;
    const result = A.decompose(r, n);
    if (!r.turns["1"].valid || !r.turns["2"].valid) {
      assert.equal(result, null);
      continue;
    }
    assert.ok(result);
    assert.ok(
      Math.abs(result.volume + result.share - result.total) < 1e-6,
      `${r.name}: decomposition mismatch`,
    );
    checked++;
  }
for (const n of ["13", "22"]) {
  const national = A.candidate(overview.national, n).d;
  assert.equal(
    overview.states.reduce((s, r) => s + A.candidate(r, n).d, 0),
    national,
  );
  const s = A.summarize(overview.states, n);
  assert.equal(s.gross + s.loss, national);
}
console.log(
  `${checked} decomposições conferidas; ganhos, perdas, empates e viradas validados.`,
);
