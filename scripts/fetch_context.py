#!/usr/bin/env python3
"""Build the RJ context snapshot from official IBGE SIDRA responses.

No credentials/dependencies. Reuses the committed raw responses by default;
--refresh explicitly downloads current responses (same year and query).
Missing/suppressed values are null; zero is retained as zero.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import unicodedata
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'dist/data/context-source'
TARGET = ROOT / 'dist/data/context-rj.json'
QUERIES = {
    'population': ('ibge-4714-rj-2022.json', 'https://apisidra.ibge.gov.br/values/t/4714/n6/in%20n3%2033/v/93,614,6318/p/2022'),
    'literacy': ('ibge-9543-rj-2022.json', 'https://apisidra.ibge.gov.br/values/t/9543/n6/in%20n3%2033/v/all/p/2022'),
    'age': ('ibge-9515-rj-2022.json', 'https://apisidra.ibge.gov.br/values/t/9515/n6/in%20n3%2033/v/all/p/2022'),
}
VARIABLES = {
    'population': ('population', '93', 'População residente', 'pessoas', 'População residente recenseada, todas as idades.', 'Toda a população residente do município.'),
    'density': ('population', '614', 'Densidade demográfica', 'hab/km²', 'População residente dividida pela área territorial, conforme publicação do IBGE.', 'Área territorial do município em quilômetros quadrados.'),
    'area': ('population', '6318', 'Área da unidade territorial', 'km²', 'Área territorial utilizada na divulgação do Censo 2022.', None),
    'literacy': ('literacy', '2513', 'Alfabetização · 15 anos ou mais', '%', 'Taxa de alfabetização das pessoas de 15 anos ou mais; sexo, cor ou raça e idade na categoria Total.', 'Pessoas residentes de 15 anos ou mais de idade.'),
    'medianAge': ('age', '10613', 'Idade mediana', 'anos', 'Idade que divide a população residente em duas metades, conforme publicação do IBGE.', 'Toda a população residente do município.'),
}
BAIXADA_NAMES = ['Itaguaí', 'Paracambi', 'Seropédica', 'Japeri', 'Queimados', 'Nova Iguaçu', 'Duque de Caxias', 'Belford Roxo', 'Mesquita', 'Nilópolis', 'São João de Meriti', 'Magé', 'Guapimirim']
METRO_NAMES = ['Rio de Janeiro', 'Duque de Caxias', 'São João de Meriti', 'Belford Roxo', 'Nilópolis', 'Mesquita', 'Nova Iguaçu', 'Queimados', 'Japeri', 'Paracambi', 'Seropédica', 'Itaguaí', 'Magé', 'Guapimirim', 'Niterói', 'São Gonçalo', 'Itaboraí', 'Maricá', 'Tanguá', 'Rio Bonito', 'Cachoeiras de Macacu', 'Petrópolis']
GROUP_SOURCES = {
    'metropolitana': 'https://integracaometropolitana.prefeitura.rio/conheca-a-secretaria/',
    'baixada': 'https://www.cmdc.rj.gov.br/?page_id=2520',
}

def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value) if unicodedata.category(c) != 'Mn').casefold()

def number(value):
    if value in ('-', '...', '..', 'X', 'X', None, ''):
        return None
    try:
        n = float(str(value).replace(',', '.'))
        return int(n) if n.is_integer() else n
    except ValueError:
        return None

def load_sources(refresh):
    RAW.mkdir(parents=True, exist_ok=True)
    sources, parsed = {}, {}
    manifest_path = RAW / 'manifest.json'
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for key, (filename, url) in QUERIES.items():
        target = RAW / filename
        old = previous.get(key, {})
        if refresh or not target.exists():
            request = Request(url, headers={'User-Agent': 'Voto-em-Dados/1.0 (public-data-research)'})
            raw = urlopen(request, timeout=60).read()
            response = json.loads(raw)
            if not isinstance(response, list) or len(response) < 2:
                raise ValueError(f'{key}: invalid SIDRA response')
            target.write_bytes(raw)
            fetched = datetime.now(timezone.utc).isoformat()
        else:
            raw = target.read_bytes()
            response = json.loads(raw)
            fetched = old.get('fetchedAt')
        assert all(r.get('D3C') == '2022' and r.get('NC') == '6' for r in response[1:]), f'{key}: wrong period or geography'
        assert len({r['D1C'] for r in response[1:]}) == 92, f'{key}: expected 92 municipalities'
        sources[key] = {'url': url, 'snapshot': f'data/context-source/{filename}', 'sha256': hashlib.sha256(raw).hexdigest(), 'fetchedAt': fetched, 'year': 2022, 'provider': 'IBGE · SIDRA · Censo Demográfico 2022'}
        parsed[key] = response[1:]
    manifest_path.write_text(json.dumps(sources, ensure_ascii=False, indent=2)+'\n')
    return sources, parsed

def build(refresh=False):
    sources, parsed = load_sources(refresh)
    election = json.loads((ROOT/'dist/data/municipalities/rj.json').read_text())
    by_ibge = {str(r['ibge']): r for r in election}
    assert len(by_ibge) == 92
    by_name = {normalize(r['name']): str(r['ibge']) for r in election}
    get_ids = lambda names: sorted(by_name[normalize(n)] for n in names)
    metro = get_ids(METRO_NAMES)
    groups = [
        {'id': 'capital', 'name': 'Capital', 'members': get_ids(['Rio de Janeiro']), 'source': GROUP_SOURCES['metropolitana'], 'definition': 'Município do Rio de Janeiro. Recorte individual da plataforma.'},
        {'id': 'baixada', 'name': 'Baixada Fluminense', 'members': get_ids(BAIXADA_NAMES), 'source': GROUP_SOURCES['baixada'], 'definition': 'Recorte de 13 municípios listado pela Câmara Municipal de Duque de Caxias. Existem outras definições históricas/geográficas de Baixada; esta composição fica explícita.'},
        {'id': 'metropolitana', 'name': 'Região Metropolitana', 'members': metro, 'source': GROUP_SOURCES['metropolitana'], 'definition': '22 municípios listados pela Secretaria Especial de Integração Metropolitana da Prefeitura do Rio. Inclui capital e Baixada; os grupos se sobrepõem.'},
        {'id': 'interior', 'name': 'Interior · fora da RMRJ', 'members': sorted(set(by_ibge)-set(metro)), 'source': GROUP_SOURCES['metropolitana'], 'definition': 'Recorte operacional da plataforma: 70 municípios do estado que não pertencem à composição de 22 municípios da RMRJ. Não é uma região administrativa oficial única.'},
    ]
    indicators = {}
    values = {code: {} for code in by_ibge}
    for key, (dataset, variable, label, unit, definition, denominator) in VARIABLES.items():
        selected = [r for r in parsed[dataset] if r['D2C'] == variable]
        assert len(selected) == 92
        if dataset == 'literacy':
            assert all(r.get('D4N') == r.get('D5N') == r.get('D6N') == 'Total' for r in selected)
        table = '4714' if dataset == 'population' else '9543' if dataset == 'literacy' else '9515'
        indicators[key] = {'label': label, 'year': 2022, 'unit': unit, 'definition': definition, 'denominator': denominator, 'source': f'https://sidra.ibge.gov.br/tabela/{table}', 'apiSource': sources[dataset]['url'], 'variable': variable, 'table': table, 'provider': 'IBGE · Censo 2022'}
        for item in selected:
            code = item['D1C']
            assert code in by_ibge
            values[code][key] = number(item['V'])
    rows = []
    for code, r in by_ibge.items():
        rows.append({'ibge': code, 'name': r['name'], 'values': values[code], 'groups': [g['id'] for g in groups if code in g['members']]})
    output = {'schemaVersion': 1, 'scope': 'rj', 'year': 2022, 'indicators': indicators, 'municipalities': rows, 'groups': groups, 'sources': sources, 'coverage': {'expected': 92, 'joined': len(rows), 'byIndicator': {key: sum(r['values'][key] is not None for r in rows) for key in VARIABLES}}, 'notes': ['Contexto social de 2022 e eleição de 2026: bases de anos diferentes, unidas pelo código IBGE municipal.', 'Indicadores descrevem territórios e populações agregadas. Associações não identificam escolhas individuais nem causas.', 'Taxas e medianas municipais não devem ser somadas nem agregadas por média simples. A plataforma mantém estes indicadores no nível municipal.', 'Capital e Baixada estão incluídas na Região Metropolitana. Não somar grupos sobrepostos.', 'Não contém renda, saneamento ou dados censitários por bairro/seção. Não estimar esses valores a partir dos indicadores presentes.']}
    TARGET.write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(output['coverage'], ensure_ascii=False))
    print(json.dumps({g['id']:len(g['members']) for g in groups}, ensure_ascii=False))
    return output

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Refazer os downloads oficiais para as mesmas consultas de 2022.')
    build(parser.parse_args().refresh)
