import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'dist/data'
d=json.loads((root/'overview.json').read_text())
count=0
for state in d['states']:
 p=root/'municipalities'/f"{state['uf']}.json"
 assert p.exists(),f'Missing {state["uf"]}'
 rows=json.loads(p.read_text())
 for turn in ['1','2']:
  for candidate in ['13','22']:
   assert sum(r['turns'][turn]['votes'][candidate] for r in rows)==state['turns'][turn]['votes'][candidate],(state['uf'],turn,candidate)
  for field in ['cast','valid','blank','null','turnout','abstention']:
   assert sum(r['turns'][turn][field] for r in rows)==state['turns'][turn][field],(state['uf'],turn,field)
 if state['uf']!='zz':count+=len(rows)
assert count==d['municipalityCoverage']['expected']==d['municipalityCoverage']['complete']
print(f'{count} municípios: somas municipais conferem com os estados nos dois turnos.')
