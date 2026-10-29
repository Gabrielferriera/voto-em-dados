#!/usr/bin/env python3
"""Fetch official 2026 presidential results; no invented or interpolated values.

Python standard library only. Resume from .cache/tse unless --refresh is passed.
Official layout: TSE EA12 + EA20. Default request rate is 20/s (TSE max: 100/s).
"""
import argparse
import concurrent.futures as futures
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache' / 'tse'
OUT = ROOT / 'dist' / 'data'
BASE = 'https://resultados.tse.jus.br/oficial/ele2026'
ELECTIONS = {1: 6257, 2: 6258}
LOCK = threading.Lock()
NEXT_REQUEST = 0.0
RATE = 20
REFRESH = False
FAILURES = []


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(path)


def fetch(url, filename):
    global NEXT_REQUEST
    path = CACHE / filename
    if path.exists() and not REFRESH:
        raw = path.read_bytes()
    else:
        for attempt in range(3):
            with LOCK:
                now = time.monotonic()
                wait = max(0, NEXT_REQUEST - now)
                NEXT_REQUEST = max(now, NEXT_REQUEST) + 1 / RATE
            if wait:
                time.sleep(wait)
            try:
                request = urllib.request.Request(url, headers={'User-Agent': 'VotoEmDados/1.0 (public election research)'})
                with urllib.request.urlopen(request, timeout=25) as response:
                    raw = response.read()
                json.loads(raw)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(raw)
                break
            except urllib.error.HTTPError as exc:
                if exc.code in (400, 401, 403, 404, 429):
                    raise
                if attempt == 2:
                    raise
                time.sleep(1 + attempt)
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(1 + attempt)
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def source_url(uf, turn, code=None):
    ele = ELECTIONS[turn]
    prefix = uf + (str(code).zfill(5) if code else '')
    return f'{BASE}/{ele}/dados/{uf}/{prefix}-c0001-e{ele:06d}-u.json'


def number(value):
    if value is None or value == '':
        return None
    return int(value)


def normalize(payload, checksum, url):
    if payload.get('f') != 'o' or int(payload.get('ele', 0)) not in ELECTIONS.values():
        raise ValueError('Nonofficial or unexpected election')
    votes = {}
    candidates = {}
    for office in payload.get('carg', []):
        if office['cd'] != '1':
            continue
        for alliance in office.get('agr', []):
            for party in alliance.get('par', []):
                for candidate in party.get('cand', []):
                    votes[candidate['n']] = int(candidate['vap'])
                    candidates[candidate['n']] = {
                        'number': candidate['n'], 'name': candidate['nmu'],
                        'party': party['sg'], 'status': candidate.get('st'),
                    }
    e, v, s = payload['e'], payload['v'], payload['s']
    result = {
        'votes': votes, 'valid': int(v['vvc']), 'cast': int(v['tv']),
        'blank': int(v['vb']), 'null': int(v['tvn']),
        'turnout': int(e['c']), 'abstention': int(e['a']),
        'eligibleIncluded': int(e['c']) + int(e['a']),
        'registered': int(e['te']),
        'sections': int(s['ts']), 'countedSections': int(s['st']),
        'includedSections': int(s['si']), 'status': payload['and'],
        'generatedAt': payload['dg'] + ' ' + payload['hg'],
        'generationId': payload.get('idg'), 'source': url, 'sha256': checksum,
    }
    if sum(votes.values()) != result['valid']:
        raise ValueError('Candidate votes do not match valid votes')
    if result['valid'] + result['blank'] + result['null'] != result['cast']:
        raise ValueError('Valid + blank + null do not match total votes')
    return result, candidates


def get_result(task):
    uf, code, turn = task
    url = source_url(uf, turn, code)
    filename = f'{turn}/{uf}/{uf}{code or ""}.json'
    try:
        payload, sha = fetch(url, filename)
        result, candidates = normalize(payload, sha, url)
        return task, result, candidates, None
    except Exception as exc:
        return task, None, {}, {'url': url, 'error': str(exc)}


def percentages(turn, candidate):
    votes = turn['votes'].get(candidate)
    return votes / turn['valid'] * 100 if votes is not None and turn['valid'] else None


def record_csv(rows):
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(['uf', 'codigo_tse', 'municipio', 'candidato', 'votos_1_turno', 'votos_2_turno', 'variacao_votos', 'percentual_1_turno', 'percentual_2_turno', 'variacao_pontos_percentuais'])
    for row in rows:
        first, second = row['turns'].get('1'), row['turns'].get('2')
        for candidate in ['13', '22']:
            a = first['votes'].get(candidate) if first else None
            b = second['votes'].get(candidate) if second else None
            p = percentages(first, candidate) if first else None
            q = percentages(second, candidate) if second else None
            writer.writerow([row['uf'].upper(), row.get('code', ''), row['name'], candidate, a, b,
                             b-a if a is not None and b is not None else '', p, q,
                             q-p if p is not None and q is not None else ''])
    return '\ufeff' + output.getvalue()


def archive_raw(uf, config=False):
    target = OUT / 'raw' / f'{uf}.jsonl.gz'
    target.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(target, 'wt', encoding='utf-8') as stream:
        for turn in (1, 2):
            folder = CACHE / str(turn) / uf
            if folder.exists():
                for p in sorted(folder.glob('*.json')):
                    raw = p.read_bytes()
                    prefix = p.stem
                    code = prefix[len(uf):] or None
                    stream.write(json.dumps({'source': source_url(uf, turn, code),
                        'sha256': hashlib.sha256(raw).hexdigest(), 'data': json.loads(raw)},
                        ensure_ascii=False, separators=(',', ':')) + '\n')


def run():
    global RATE, REFRESH
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, default=28)
    parser.add_argument('--rps', type=float, default=20)
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--only-states', action='store_true')
    args = parser.parse_args()
    RATE, REFRESH = min(args.rps, 40), args.refresh
    CACHE.mkdir(parents=True, exist_ok=True)
    config_url = f'{BASE}/6258/config/mun-e006258-cm.json'
    config, config_sha = fetch(config_url, 'municipalities-config.json')
    state_meta = {a['cd']: a for a in config['abr'] if a['cd'] != 'br'}
    states = [{'uf': uf, 'name': a['ds'], 'level': 'uf', 'turns': {}, 'municipalityCount': len(a.get('mu', []))}
              for uf, a in state_meta.items()]
    state_lookup = {r['uf']: r for r in states}
    national = {'uf': 'br', 'name': 'Brasil', 'level': 'br', 'turns': {}}
    tasks = [(uf, None, turn) for uf in ['br'] + list(state_meta) for turn in (1, 2)]
    candidates = {}
    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for task, result, names, error in pool.map(get_result, tasks):
            uf, _, turn = task
            if error:
                FAILURES.append(error)
                continue
            row = national if uf == 'br' else state_lookup[uf]
            row['turns'][str(turn)] = result
            if uf == 'br':
                for key, val in names.items():
                    if key not in candidates or turn == 2:
                        candidates[key] = val
    if len(national['turns']) != 2 or any(len(r['turns']) != 2 for r in states):
        write_json(OUT / 'fetch-errors.json', FAILURES)
        raise RuntimeError('Missing state or national results; see fetch-errors.json')
    overview = {'schemaVersion': 1, 'year': 2026, 'office': 'Presidente',
        'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'national': national, 'states': states, 'candidates': candidates,
        'configSource': config_url, 'configSha256': config_sha,
        'municipalityCoverage': {'expected': sum(len(a.get('mu', [])) for a in state_meta.values() if a['cd'] != 'zz'), 'complete': 0},
        'hourly': {'status': 'not_computed', 'window': '17:00–19:00 America/Sao_Paulo',
                   'candidateAttribution': False, 'causalAttribution': False}}
    write_json(OUT / 'overview.json', overview)
    print(json.dumps({'phase': 'states_ready', 'states': len(states), 'municipalities_expected': overview['municipalityCoverage']['expected']}), flush=True)
    for uf in ['br'] + list(state_meta):
        archive_raw(uf)
    if args.only_states:
        return
    municipality_rows = {}
    pending = {}
    for uf, meta in state_meta.items():
        municipality_rows[uf] = {m['cd']: {'uf': uf, 'code': m['cd'], 'ibge': m.get('cdi'),
            'name': m['nm'], 'level': 'mu', 'turns': {}} for m in meta.get('mu', [])}
        pending[uf] = len(municipality_rows[uf]) * 2
    tasks = [(uf, code, turn) for uf, rows in municipality_rows.items() for code in rows for turn in (1, 2)]
    finished = 0
    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        submitted = [pool.submit(get_result, task) for task in tasks]
        for future in futures.as_completed(submitted):
            task, result, _, error = future.result()
            uf, code, turn = task
            finished += 1
            if error:
                FAILURES.append(error)
                if len(FAILURES) >= 10:
                    for f in submitted:
                        f.cancel()
                    write_json(OUT / 'fetch-errors.json', FAILURES)
                    raise RuntimeError('10 source errors; aborting to protect upstream')
            else:
                municipality_rows[uf][code]['turns'][str(turn)] = result
            pending[uf] -= 1
            if pending[uf] == 0:
                rows = sorted(municipality_rows[uf].values(), key=lambda r: r['name'])
                write_json(OUT / 'municipalities' / f'{uf}.json', rows)
                archive_raw(uf)
                complete = sum(len(row['turns']) == 2 for row in rows)
                if uf != 'zz':
                    overview['municipalityCoverage']['complete'] += complete
                write_json(OUT / 'overview.json', overview)
                print(json.dumps({'phase': 'uf_complete', 'uf': uf, 'complete': complete, 'expected': len(rows)}), flush=True)
            if finished % 500 == 0:
                print(json.dumps({'phase': 'municipalities', 'files': finished, 'total': len(tasks), 'errors': len(FAILURES)}), flush=True)
    all_rows = [row for rows in municipality_rows.values() for row in rows.values()]
    (OUT / 'comparacao-municipios.csv').write_text(record_csv(all_rows), encoding='utf-8')
    (OUT / 'comparacao-estados.csv').write_text(record_csv(states), encoding='utf-8')
    overview['fetchedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    overview['municipalityCoverage']['errors'] = len(FAILURES)
    write_json(OUT / 'overview.json', overview)
    write_json(OUT / 'fetch-errors.json', FAILURES)
    print(json.dumps({'phase': 'complete', 'coverage': overview['municipalityCoverage']}), flush=True)


if __name__ == '__main__':
    run()
