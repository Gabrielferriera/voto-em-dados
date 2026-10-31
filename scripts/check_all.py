"""Run the independent data checks. Requires Python 3 and Node.js."""
from pathlib import Path
import subprocess
import sys
root = Path(__file__).resolve().parents[1]
checks = [
    [sys.executable, 'scripts/check_data.py'],
    ['node', 'scripts/check_geometry.cjs'],
    ['node', 'scripts/build_scale.cjs', '--check'],
    ['node', 'scripts/check_analytics.cjs'],
    ['node', 'scripts/check_explorer.cjs'],
    ['node', 'scripts/check_story_baixada.cjs'],
    ['node', 'scripts/check_report.cjs'],
    [sys.executable, 'scripts/check_context.py'],
    [sys.executable, 'scripts/check_polling_rj.py'],
]
for command in checks:
    print('Verificando:', command[-1], flush=True)
    subprocess.run(command, cwd=root, check=True)
print('Todas as verificações passaram.')
