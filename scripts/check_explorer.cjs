const assert = require("node:assert/strict");
const A = require("../dist/analytics.js");
const context = require("../dist/data/context-rj.json");
const rj = require("../dist/data/municipalities/rj.json");
const overview = require("../dist/data/overview.json");
const state = overview.states.find((r) => r.uf === "rj");
const all = A.aggregate(rj, { code: "all", name: "RJ" });
for (const t of ["1", "2"]) {
  for (const k of ["valid", "turnout", "abstention", "blank", "null"])
    assert.equal(all.turns[t][k], state.turns[t][k], `${t}/${k}`);
  assert.deepEqual(all.turns[t].votes, state.turns[t].votes);
}
const groups = new Map(
  context.groups.map((g) => [
    g.id,
    A.aggregate(
      rj.filter((r) => g.members.includes(String(r.ibge))),
      { code: g.id, name: g.name },
    ),
  ]),
);
for (const t of ["1", "2"])
  for (const k of ["valid", "turnout", "abstention", "blank", "null"])
    assert.equal(
      groups.get("metropolitana").turns[t][k] +
        groups.get("interior").turns[t][k],
      state.turns[t][k],
    );
assert.equal(groups.get("baixada").members.length, 13);
assert.equal(
  A.marginChange(state),
  rj.reduce((sum, r) => sum + A.marginChange(r), 0),
);
assert.equal(A.aggregate([], { name: "empty" }), null);
assert.equal(
  A.correlation([
    [1, 2],
    [2, 4],
    [3, 6],
  ]),
  1,
);
assert.equal(
  A.correlation([
    [1, 6],
    [2, 4],
    [3, 2],
  ]),
  -1,
);
assert.equal(
  A.correlation([
    [1, 3],
    [1, 4],
    [1, 5],
  ]),
  null,
);
assert.equal(
  A.correlation([
    [1, 3],
    [2, 4],
  ]),
  null,
);
const discrepancy = rj.filter(
  (r) => A.candidate(r, "22").d > 0 && A.candidate(r, "22").p < 0,
);
assert.ok(discrepancy.length > 0);
assert.ok(discrepancy.some((r) => r.name === "JAPERI"));
console.log(
  "Recortes: soma municipal = RJ; metropolitana + interior = RJ; saldo aditivo, Pearson e histórias validados.",
);
console.log(
  `História de Flávio: ${discrepancy.length} municípios ganharam votos e perderam percentual.`,
);
