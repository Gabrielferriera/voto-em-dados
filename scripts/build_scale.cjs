const fs = require('node:fs');
const path = require('node:path');
const Scale = require('../dist/scale.js');
const root = path.resolve(__dirname, '../dist/data');
const overview = JSON.parse(fs.readFileSync(path.join(root, 'overview.json')));
const states = overview.states.filter((r) => r.uf !== 'zz');
const municipalities = states.flatMap((state) => JSON.parse(
  fs.readFileSync(path.join(root, 'municipalities', state.uf + '.json'))));
const manifest = {
  schemaVersion: 1,
  sourceSnapshot: overview.fetchedAt,
  method: 'Máximo absoluto por indicador e granularidade; porcentagem dos válidos: 0–100%. Exterior sem geometria.',
  scope: { uf: states.length, mu: municipalities.length },
  levels: { uf: Scale.compute(states), mu: Scale.compute(municipalities) },
};
if (process.argv.includes('--check')) {
  const published = JSON.parse(fs.readFileSync(path.join(root, 'scale-domains.json')));
  if (JSON.stringify(published) !== JSON.stringify(manifest))
    throw Error('Domínios fixos divergentes da base publicada; execute node scripts/build_scale.cjs');
  console.log('Escalas fixas: 27 UFs e 5.571 municípios, dois candidatos, 6 indicadores.');
} else {
  fs.writeFileSync(path.join(root, 'scale-domains.json'),
    JSON.stringify(manifest, null, 2) + '\n');
  console.log('Domínios fixos gerados a partir da base atual.');
}
