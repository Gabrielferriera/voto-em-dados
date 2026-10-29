#!/usr/bin/env python3
"""Reproduce RJ presidential polling-place data from official TSE ZIPs.

Downloads/caches the presidential BR voting ZIP (about 242MB), streams the CSV without
extracting it, and extracts only the RJ registry member by HTTP Range.
Writes the app artifact only after exact reconciliation against the municipal
snapshot already used by this project. No credential or external dependency.
"""
from __future__ import annotations
import argparse,csv,gzip,hashlib,io,json,time,zipfile
from collections import Counter,defaultdict
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache/polling-rj'
TARGET=ROOT/'dist/data/polling-places-rj.json'
VOTE_URL='https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_2026_BR.zip'
REG_URL='https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip'
VOTE_MEMBER='votacao_secao_2026_BR.csv'
REG_MEMBER='eleitorado_local_votacao_2026_RJ.csv'
REG_SIZE=167493511

def normalized_code(s):return str(int(s))
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def download_votes(refresh=False):
 p=CACHE/VOTE_MEMBER.replace('.csv','.zip')
 if p.exists() and not refresh:return p
 tmp=p.with_suffix('.download')
 start=time.monotonic()
 with urlopen(Request(VOTE_URL,headers={'User-Agent':'Voto-em-Dados/1.0'}),timeout=90) as r,tmp.open('wb') as f:
  size=0
  while True:
   b=r.read(1024*1024)
   if not b:break
   f.write(b);size+=len(b)
   if size>400_000_000:raise ValueError('Unexpected ZIP size; review source')
 if not zipfile.is_zipfile(tmp):raise ValueError('TSE response is not a ZIP')
 tmp.replace(p);print(f'Downloaded voting ZIP in {time.monotonic()-start:.1f}s',flush=True)
 return p
class RemoteZip(io.RawIOBase):
 def __init__(self,url,size):self.url=url;self.size=size;self.pos=0;self.transferred=0
 def seekable(self):return True
 def readable(self):return True
 def tell(self):return self.pos
 def seek(self,offset,whence=0):
  self.pos=offset if whence==0 else self.pos+offset if whence==1 else self.size+offset
  return self.pos
 def read(self,n=-1):
  if n<0:n=self.size-self.pos
  n=min(n,self.size-self.pos)
  if n<=0:return b''
  if n>10_000_000 or self.transferred+n>15_000_000:raise ValueError('Registry range budget exceeded; review source')
  with urlopen(Request(self.url,headers={'Range':f'bytes={self.pos}-{self.pos+n-1}','User-Agent':'Voto-em-Dados/1.0'}),timeout=60) as r:
   if r.status!=206:raise ValueError('TSE did not honor Range; refusing whole national ZIP')
   b=r.read(n+1)
  if len(b)>n:raise ValueError('Unexpected Range size')
  self.pos+=len(b);self.transferred+=len(b);return b

def registry_path(refresh=False):
 p=CACHE/REG_MEMBER
 if p.exists() and not refresh:return p
 with urlopen(Request(REG_URL,method='HEAD'),timeout=30) as response:size=int(response.headers['Content-Length'])
 remote=RemoteZip(REG_URL,size)
 with zipfile.ZipFile(remote) as z:
  info=z.getinfo(REG_MEMBER)
  if info.file_size>60_000_000:raise ValueError('Unexpected registry RJ member size')
  p.write_bytes(z.read(info))
 print(f'Registry RJ extracted with {remote.transferred} bytes transferred',flush=True)
 return p

def in_ring(x,y,ring):
 inside=False
 for i in range(len(ring)):
  x1,y1=ring[i-1][:2];x2,y2=ring[i][:2]
  if (y1>y)!=(y2>y) and x<(x2-x1)*(y-y1)/(y2-y1)+x1:inside=not inside
 return inside

def inside_geometry(lon,lat,geometry):
 polygons=geometry['coordinates'] if geometry['type']=='MultiPolygon' else [geometry['coordinates']]
 return any(in_ring(lon,lat,p[0]) and not any(in_ring(lon,lat,h) for h in p[1:]) for p in polygons)

def read_registry(path,municipal,geometries):
 grouped={};raw_rows=Counter()
 with path.open(encoding='latin1',newline='') as f:
  for row in csv.DictReader(f,delimiter=';'):
   if row['SG_UF']!='RJ' or row['NR_TURNO'] not in ['1','2']:continue
   t=row['NR_TURNO'];code=normalized_code(row['CD_MUNICIPIO']);key=(code,normalized_code(row['NR_ZONA']),normalized_code(row['NR_LOCAL_VOTACAO']),t)
   raw_rows[t]+=1
   item=grouped.setdefault(key,{'name':row['NM_LOCAL_VOTACAO'],'address':row['DS_ENDERECO'],'neighborhood':row['NM_BAIRRO'],'coordinates':set(),'sections':set()})
   item['sections'].add(normalized_code(row['NR_SECAO']))
   try:point=(float(row['NR_LONGITUDE'].replace(',','.')),float(row['NR_LATITUDE'].replace(',','.')))
   except (ValueError,TypeError):point=None
   if point:item['coordinates'].add(point)
 for key,item in grouped.items():
  coords=item.pop('coordinates');item['registrySections']=len(item.pop('sections'));item['lat']=None;item['lon']=None
  if not coords:item['coordinateStatus']='missing'
  elif len(coords)!=1:item['coordinateStatus']='conflicting_coordinates'
  else:
   lon,lat=next(iter(coords))
   if not (-24<=lat<=-20 and -46<=lon<=-40):item['coordinateStatus']='outside_rj_bounds'
   elif key[0] not in municipal:item['coordinateStatus']='unknown_municipality'
   elif not inside_geometry(lon,lat,geometries[municipal[key[0]]['ibge']]):item['coordinateStatus']='outside_municipality_geometry'
   else:item.update(lat=lat,lon=lon,coordinateStatus='verified_municipality')
 return grouped,raw_rows

def process(refresh=False):
 CACHE.mkdir(parents=True,exist_ok=True)
 municipal={r['code']:r for r in json.loads((ROOT/'dist/data/municipalities/rj.json').read_text())}
 overview=json.loads((ROOT/'dist/data/overview.json').read_text())
 allowed={t:set(overview['national']['turns'][t]['votes']) for t in ['1','2']}
 geometries={str(f['properties']['id']):f['geometry'] for f in json.loads((ROOT/'dist/data/geometry/rj.json').read_text())['features']}
 vote_path=download_votes(refresh)
 # Registry extraction can be reused without downloading the full national ZIP.
 reg_path=registry_path(refresh)
 registry,registry_rows=read_registry(reg_path,municipal,geometries)
 places={};source_rows=0;president_rows=0;turn_rows=Counter();unknown=Counter();started=time.monotonic();generated=set()
 with zipfile.ZipFile(vote_path) as z,z.open(VOTE_MEMBER) as stream:
  reader=csv.reader(io.TextIOWrapper(stream,encoding='latin1',newline=''),delimiter=';')
  header=next(reader);idx={name:i for i,name in enumerate(header)}
  need=['ANO_ELEICAO','NR_TURNO','SG_UF','CD_CARGO','CD_MUNICIPIO','NR_ZONA','NR_SECAO','NR_LOCAL_VOTACAO','NR_VOTAVEL','QT_VOTOS','NM_LOCAL_VOTACAO','DS_LOCAL_VOTACAO_ENDERECO']
  assert all(key in idx for key in need),header
  for row in reader:
   source_rows+=1
   if source_rows%1_000_000==0:print(f'Scanned {source_rows:,} rows; president {president_rows:,}; {time.monotonic()-started:.1f}s',flush=True)
   if row[idx['CD_CARGO']]!='1' or row[idx['SG_UF']]!='RJ':continue
   t=row[idx['NR_TURNO']]
   if row[idx['ANO_ELEICAO']]!='2026' or t not in allowed:continue
   president_rows+=1;turn_rows[t]+=1
   code=normalized_code(row[idx['CD_MUNICIPIO']]);zone=normalized_code(row[idx['NR_ZONA']]);local=normalized_code(row[idx['NR_LOCAL_VOTACAO']]);key=(code,zone,local)
   if code not in municipal:raise ValueError(f'Unknown TSE municipality {code}')
   place=places.setdefault(key,{'id':':'.join(key),'municipalityCode':code,'ibge':municipal[code]['ibge'],'municipalityName':municipal[code]['name'],'zone':zone,'localCode':local,'turns':{}})
   turn=place['turns'].setdefault(t,{'votes':{n:0 for n in sorted(allowed[t],key=int)},'valid':0,'blank':0,'null':0,'technicalNull':0,'excludedNominalVotes':{},'_sections':set(),'name':row[idx['NM_LOCAL_VOTACAO']],'address':row[idx['DS_LOCAL_VOTACAO_ENDERECO']]})
   turn['_sections'].add(normalized_code(row[idx['NR_SECAO']]))
   candidate=normalized_code(row[idx['NR_VOTAVEL']]);count=int(row[idx['QT_VOTOS']])
   if count<0:raise ValueError('Negative count')
   if candidate in allowed[t]:turn['votes'][candidate]+=count;turn['valid']+=count
   elif candidate=='95':turn['blank']+=count
   elif candidate=='96':turn['null']+=count
   else:
    unknown[(t,candidate)]+=count
    turn['excludedNominalVotes'][candidate]=turn['excludedNominalVotes'].get(candidate,0)+count
   generated.add((row[idx['DT_GERACAO']],row[idx['HH_GERACAO']]))
 print('Finished CSV scan',source_rows,president_rows,dict(turn_rows),'unknown',dict(unknown),flush=True)
 if set(turn_rows)!={'1','2'}:raise ValueError(f'Both presidential turns not present: {dict(turn_rows)}')
 # The observed nonvalid nominal number 28 must equal the raw official vnt
 # field in EACH municipality, not merely the UF total. Keep it explicitly.
 if set(unknown)-{('1','28')}:raise ValueError(f'Unreviewed presidential candidate codes: {unknown}')
 raw_vnt={}
 with gzip.open(ROOT/'dist/data/raw/rj.jsonl.gz','rt') as raw:
  for line in raw:
   body=json.loads(line)['data']
   if body.get('tpabr')=='mu' and body.get('t') in ['1','2']:
    raw_vnt[(normalized_code(body['cdabr']),body['t'])]=int(body['v'].get('vnt','0'))
 assert len(raw_vnt)==184
 actual_vnt=Counter()
 for place in places.values():
  for t,turn in place['turns'].items():
   excluded=sum(turn['excludedNominalVotes'].values())
   actual_vnt[(place['municipalityCode'],t)]+=excluded
   turn['technicalNull']=excluded
   turn['null']+=excluded
 for key,value in raw_vnt.items():
  if actual_vnt[key]!=value:raise ValueError(f'Official vnt mismatch: {key}: {actual_vnt[key]} vs {value}')
 # Independently reconcile every municipality and every candidate before writing.
 sums=defaultdict(lambda:defaultdict(Counter))
 for place in places.values():
  for t,turn in place['turns'].items():
   sums[place['municipalityCode']][t].update(turn['votes'])
   for k in ['valid','blank','null']:sums[place['municipalityCode']][t][k]+=turn[k]
 mismatches=[]
 for code,r in municipal.items():
  for t in ['1','2']:
   expected=r['turns'][t]
   for key in [*expected['votes'],'valid','blank','null']:
    target=expected['votes'][key] if key in expected['votes'] else expected[key]
    if sums[code][t][key]!=target:mismatches.append({'municipalityCode':code,'turn':t,'key':key,'actual':sums[code][t][key],'expected':target})
 if mismatches:
  (CACHE/'reconciliation-errors.json').write_text(json.dumps(mismatches,ensure_ascii=False,indent=2))
  raise ValueError(f'{len(mismatches)} municipal reconciliation failures. No app artifact written.')
 coverage={'municipalities':92,'places':len(places),'bothTurns':0,'onlyTurn1':0,'onlyTurn2':0,'reconciliation':{'status':'exact','municipalities':92,'turns':2,'candidates':'all','fields':['candidate votes','valid','blank','null']},'turns':{t:{'places':0,'validCoordinates':0,'registryMatches':0,'sections':0,'coordinateStatus':{}} for t in ['1','2']},'registrySectionRows':dict(registry_rows)}
 for (code,zone,local),place in places.items():
  if len(place['turns'])==2:coverage['bothTurns']+=1
  elif '1' in place['turns']:coverage['onlyTurn1']+=1
  else:coverage['onlyTurn2']+=1
  for t,turn in place['turns'].items():
   turn['sections']=len(turn.pop('_sections'))
   match=registry.get((code,zone,local,t))
   if match:turn.update(match)
   else:turn.update(lat=None,lon=None,coordinateStatus='no_registry_match',neighborhood=None)
   cov=coverage['turns'][t];cov['places']+=1;cov['sections']+=turn['sections'];cov['registryMatches']+=bool(match);cov['validCoordinates']+=turn['lat'] is not None;state=turn['coordinateStatus'];cov['coordinateStatus'][state]=cov['coordinateStatus'].get(state,0)+1
  selected=place['turns'].get('2') or place['turns']['1']
  place.update({k:selected[k] for k in ['name','address','lat','lon','coordinateStatus','neighborhood']})
  a=place['turns'].get('1');b=place['turns'].get('2')
  place['locationChanged']=bool(a and b and (a['address']!=b['address'] or (a['lat'],a['lon'])!=(b['lat'],b['lon'])))
 output={'schemaVersion':1,'scope':'rj','year':2026,'office':'Presidente','fetchedAt':datetime.now(timezone.utc).isoformat(),'sources':{'votes':{'url':VOTE_URL,'dataset':'https://dadosabertos.tse.jus.br/dataset/resultados-2026','member':VOTE_MEMBER,'sha256':sha(vote_path),'size':vote_path.stat().st_size,'generated':sorted([list(x) for x in generated]),'sourceRows':source_rows,'presidentialRows':president_rows,'nonvalidNominal':{'28':{'name':'LEONARDO ALVES DE ARAUJO','votes':unknown.get(('1','28'),0),'classification':'Excluded from valid votes; equals raw official vnt in all municipalities, included in tvn/null totals.'}}},'registry':{'url':REG_URL,'dataset':'https://dadosabertos.tse.jus.br/dataset/eleitorado-2026','member':REG_MEMBER,'memberSha256':sha(reg_path),'memberSize':reg_path.stat().st_size,'extraction':'RJ CSV member only, using HTTP Range'}},'coverage':coverage,'places':sorted(places.values(),key=lambda r:(r['municipalityCode'],int(r['zone']),int(r['localCode']))),'notes':['Resultados pelo local de votação, não pelo endereço de residência dos eleitores.','Coordenadas por turno verificadas contra a geometria municipal simplificada usada neste projeto. Ausentes, conflitantes ou fora do município não são plotadas; seus votos continuam nos totais.','Local identificado pela chave município TSE + zona + número do local. Turnos ausentes são omitidos e não representam zero votos.','Quando o mesmo identificador tem alteração de endereço/coordenada, locationChanged=true. Não interpretar automaticamente essa diferença como transferência de eleitores.','Informações por local/seção não revelam escolha individual nem votos por horário.','Os nominais do número 28 no primeiro turno estão fora dos 12 candidatos válidos. Preservados em excludedNominalVotes e technicalNull; sua soma foi conferida com o campo oficial vnt de cada município e incluída no total de nulos tvn.']}
 TARGET.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
 print(json.dumps(coverage,ensure_ascii=False,indent=2),flush=True)
 print(f'App artifact written: {TARGET.stat().st_size} bytes',flush=True)
 return output
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--refresh',action='store_true');args=parser.parse_args();process(args.refresh)
