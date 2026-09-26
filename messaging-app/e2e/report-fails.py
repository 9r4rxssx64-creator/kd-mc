#!/usr/bin/env python3
"""Upsert UNE issue GitHub 'e2e-fails' avec la liste des specs E2E échouées.
Lisible par-delà la troncature des logs. Env: GH_TOKEN, REPO, RUN_URL. v1.1.199."""
import json
import os
import subprocess
import sys
import urllib.request

tok = os.environ.get('GH_TOKEN', '')
repo = os.environ.get('REPO', '')
run_url = os.environ.get('RUN_URL', '')
if not tok or not repo:
    print('GH_TOKEN/REPO manquants — skip report')
    sys.exit(0)

here = os.path.dirname(os.path.abspath(__file__))
try:
    fails = subprocess.run([sys.executable, os.path.join(here, 'print-fails.py'), 'results.json'],
                           capture_output=True, text=True, cwd=here).stdout.strip()
except Exception as e:  # noqa
    fails = f'(print-fails KO: {e})'
if not fails:
    fails = '(aucune sortie — results.json absent ?)'

body = f"## 🎭 E2E Apex Chat — échecs détectés\n\n{fails}\n\n[Voir le run]({run_url})\n\n*Auto-généré par apex-chat-e2e.yml. Se referme quand l'E2E repasse au vert.*"


def api(method, url, data=None):
    req = urllib.request.Request(
        url, data=json.dumps(data).encode() if data is not None else None, method=method,
        headers={'Authorization': 'Bearer ' + tok, 'Accept': 'application/vnd.github+json',
                 'User-Agent': 'apex-chat-e2e'})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


try:
    issues = api('GET', f'https://api.github.com/repos/{repo}/issues?state=open&labels=e2e-fails&per_page=1')
    if issues:
        n = issues[0]['number']
        api('PATCH', f'https://api.github.com/repos/{repo}/issues/{n}', {'body': body})
        print(f'Issue #{n} mise à jour')
    else:
        out = api('POST', f'https://api.github.com/repos/{repo}/issues',
                  {'title': '🎭 E2E Apex Chat — échecs', 'body': body, 'labels': ['e2e-fails']})
        print(f"Issue #{out.get('number')} créée")
except Exception as e:  # noqa
    print(f'report-fails KO (non bloquant): {e}')
