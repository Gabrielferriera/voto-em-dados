#!/usr/bin/env python3
"""Read-only reconciliation of the committed national/UF totals with live TSE EA20.

This check never rewrites the published snapshot. A changed official total makes
the workflow fail so the data can be reviewed before a new version is published.
"""
import hashlib
import json
import time
import urllib.request
from pathlib import Path

from fetch_tse import normalize

ROOT = Path(__file__).resolve().parents[1]
overview = json.loads((ROOT / 'dist/data/overview.json').read_text())
records = [overview['national'], *overview['states']]
checked = 0
for row in records:
    for turn in ('1', '2'):
        expected = row['turns'][turn]
        url = expected['source']
        request = urllib.request.Request(url, headers={'User-Agent': 'VotoEmDados/1.0 (public-data-verification)'})
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
        actual, _ = normalize(json.loads(raw), hashlib.sha256(raw).hexdigest(), url)
        for field in ('valid', 'blank', 'null', 'turnout', 'abstention', 'countedSections'):
            if actual[field] != expected[field]:
                raise AssertionError(f'{row["uf"]} {turn}º turno {field}: publicado {expected[field]}, TSE {actual[field]}')
        if actual['votes'] != expected['votes']:
            raise AssertionError(f'{row["uf"]} {turn}º turno: votos por candidato divergentes')
        checked += 1
        time.sleep(0.25)
print(f'TSE ao vivo: {checked} arquivos nacionais/UF × turno conferem com a base publicada. '
      'Municípios são conferidos internamente contra UFs por check_data.py.')
