#!/usr/bin/env python3
"""Validate the committed RJ context and its source snapshot hashes."""
from pathlib import Path
import hashlib,json,math
ROOT=Path(__file__).resolve().parents[1]
x=json.loads((ROOT/'dist/data/context-rj.json').read_text())
rj=json.loads((ROOT/'dist/data/municipalities/rj.json').read_text())
expected={str(r['ibge']) for r in rj}
assert len(expected)==92
assert {r['ibge'] for r in x['municipalities']}==expected
assert len(x['municipalities'])==92
assert x['year']==2022
for item in x['sources'].values():
 p=ROOT/'dist'/item['snapshot']
 assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256'],p
for row in x['municipalities']:
 values=row['values']
 assert set(values)==set(x['indicators'])
 for key,value in values.items():
  assert value is None or math.isfinite(value),(row['name'],key)
 assert values['population']>0
 assert values['density']>0 and values['area']>0
 assert 0<=values['literacy']<=100
 assert 0<values['medianAge']<100
 # SIDRA density is published rounded to 2 decimals.
 assert abs(values['population']/values['area']-values['density'])<0.02
by_group={g['id']:set(g['members']) for g in x['groups']}
assert {k:len(v) for k,v in by_group.items()}=={'capital':1,'baixada':13,'metropolitana':22,'interior':70}
assert by_group['capital']<=by_group['metropolitana']
assert by_group['baixada']<=by_group['metropolitana']
assert not by_group['capital']&by_group['baixada']
assert not by_group['metropolitana']&by_group['interior']
assert by_group['metropolitana']|by_group['interior']==expected
assert sum(r['values']['population'] for r in x['municipalities'])==16055174
print('Contexto RJ: 92 municípios × 5 indicadores de 2022; hashes, joins e grupos conferidos.')
