const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { summarize, rate } = require('../dist/report-model.js');

const municipalities = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/data/municipalities/rj.json')));
const japeri = municipalities.find((m) => m.ibge === '3302270');
assert.ok(japeri, 'Município de Japeri presente na base');
const report = summarize(japeri);
assert.equal(report.candidates['13'].x, 22217);
assert.equal(report.candidates['13'].y, 26529);
assert.equal(report.candidates['13'].delta, 4312);
assert.equal(report.candidates['22'].delta, 55);
assert.equal(report.margin, 4257);
assert.equal(report.turnout.delta, -468);
assert.equal(report.rows.find((r) => r.key === 'abstention').delta, 471);
assert.ok(Math.abs(report.candidates['13'].p2 - 100 * 26529 / 57424) < 1e-9);
assert.ok(Math.abs(report.turnout.p2 - 100 * 59465 / (59465 + 17190)) < 1e-9);
assert.equal(rate(10, 0), null, 'Sem denominador, não apresentar taxa artificial');

for (const municipality of municipalities) {
  const s = summarize(municipality);
  const [first, second] = [municipality.turns['1'], municipality.turns['2']];
  assert.equal(s.margin, s.candidates['13'].delta - s.candidates['22'].delta,
    `Saldo consistente: ${municipality.name}`);
  assert.equal(s.turnout.delta, second.turnout - first.turnout);
  for (const turn of [first, second]) {
    assert.equal(turn.turnout, turn.valid + turn.blank + turn.null,
      `Composição do comparecimento: ${municipality.name}`);
  }
}
console.log(`Ficha territorial: Japeri e ${municipalities.length} municípios do RJ verificados.`);
