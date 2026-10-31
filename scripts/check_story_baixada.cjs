const assert = require('node:assert/strict');
const context = require('../dist/data/context-rj.json');
const municipalities = require('../dist/data/municipalities/rj.json');
const official = require('../dist/data/overview.json').states.find((s) => s.uf === 'rj');
const { build } = require('../dist/story-baixada-model.js');
const story = build(context, municipalities);
assert.equal(story.rows.length, 13);
assert.equal(story.marginChange, 158022);
assert.equal(story.turnoutChange, 24101);
assert.equal(story.lulaGain, 182761);
assert.equal(story.flavioGain, 24739);
assert.equal(story.marginChange, story.lulaGain - story.flavioGain);
assert.ok(story.balance1 < story.balance2 && story.balance2 < 0,
  'A vantagem de Flávio caiu, mas permaneceu no segundo turno.');
for (const turn of ['1', '2']) {
  assert.ok(story.totals[turn].valid <= official.turns[turn].valid);
  assert.ok(story.totals[turn].turnout <= official.turns[turn].turnout);
}
assert.equal(story.places.find((p) => p.record.ibge === '3302270').turnout, -468);
assert.equal(story.places.reduce((n, p) => n + p.margin, 0), story.marginChange);
assert.equal(story.places.reduce((n, p) => n + p.turnout, 0), story.turnoutChange);
console.log('História da Baixada: 13 municípios, saldo e comparecimento reconciliados.');
