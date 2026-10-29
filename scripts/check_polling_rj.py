#!/usr/bin/env python3
"""Check per-location coverage and independently reconcile all municipal votes."""
from pathlib import Path
from collections import Counter,defaultdict
import json
ROOT=Path(__file__).resolve().parents[1]
x=json.loads((ROOT/'dist/data/polling-places-rj.json').read_text())
municipal={r['code']:r for r in json.loads((ROOT/'dist/data/municipalities/rj.json').read_text())}
assert x['scope']=='rj' and x['year']==2026 and x['office']=='Presidente'
assert len({r['id'] for r in x['places']})==len(x['places'])
assert {r['municipalityCode'] for r in x['places']}==set(municipal)
sums=defaultdict(lambda:defaultdict(Counter));coverage={t:Counter() for t in ['1','2']}
for place in x['places']:
 r=municipal[place['municipalityCode']]
 assert place['ibge']==r['ibge']
 assert set(place['turns'])<=set(['1','2']) and place['turns']
 assert place['id']==':'.join([place['municipalityCode'],place['zone'],place['localCode']])
 for t,turn in place['turns'].items():
  assert set(turn['votes'])==set(r['turns'][t]['votes'])
  assert all(isinstance(v,int) and v>=0 for v in turn['votes'].values())
  assert sum(turn['votes'].values())==turn['valid']
  assert turn['technicalNull']==sum(turn['excludedNominalVotes'].values())
  assert turn['null']>=turn['technicalNull']
  assert not set(turn['excludedNominalVotes']) & set(turn['votes'])
  assert turn['sections']>0
  if turn['coordinateStatus']=='verified_municipality':
   assert isinstance(turn['lat'],(int,float)) and isinstance(turn['lon'],(int,float))
   assert -24<=turn['lat']<=-20 and -46<=turn['lon']<=-40
  else:assert turn['lat'] is None and turn['lon'] is None
  sums[r['code']][t].update(turn['votes'])
  for k in ['valid','blank','null']:sums[r['code']][t][k]+=turn[k]
  coverage[t]['places']+=1;coverage[t]['sections']+=turn['sections'];coverage[t]['validCoordinates']+=turn['lat'] is not None
for code,r in municipal.items():
 for t in ['1','2']:
  for candidate,value in r['turns'][t]['votes'].items():assert sums[code][t][candidate]==value,(r['name'],t,candidate)
  for key in ['valid','blank','null']:assert sums[code][t][key]==r['turns'][t][key],(r['name'],t,key)
for t in ['1','2']:
 for key,value in coverage[t].items():assert value==x['coverage']['turns'][t][key]
assert x['coverage']['places']==len(x['places'])
assert x['coverage']['bothTurns']==sum(len(p['turns'])==2 for p in x['places'])
assert x['coverage']['onlyTurn1']==sum(set(p['turns'])=={'1'} for p in x['places'])
assert x['coverage']['onlyTurn2']==sum(set(p['turns'])=={'2'} for p in x['places'])
print(f"Locais RJ: {len(x['places'])} registros; todos os candidatos, válidos, brancos e nulos reconciliados em 92 municípios × 2 turnos.")
print(json.dumps(x['coverage']['turns'],ensure_ascii=False))
