#!/usr/bin/env python3
"""Imprime la liste EXACTE des specs Playwright échouées depuis results.json.
Format : [projet] fichier:ligne › titre — 1ère ligne d'erreur. v1.1.198."""
import json
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'results.json'
try:
    d = json.load(open(path))
except Exception as e:  # noqa
    print(f"(results.json illisible : {e})")
    sys.exit(0)

ok = 0
fails = []


def walk(suites, filehint=''):
    global ok
    for s in suites:
        fh = s.get('file', filehint)
        for sp in s.get('specs', []):
            title = sp.get('title', '?')
            for t in sp.get('tests', []):
                proj = t.get('projectName', '?')
                # statut réel : un test SKIPPED n'est PAS un échec (ex : push sur
                # WebKit CI, ou permission notif non accordable en headless).
                statuses = [r.get('status') for r in t.get('results', []) or []]
                real_fail = (not sp.get('ok')) and any(st in ('failed', 'timedOut', 'interrupted') for st in statuses)
                if not real_fail:
                    ok += 1
                    continue
                err = ''
                for r in t.get('results', []):
                    for e in (r.get('errors', []) or []):
                        msg = (e.get('message', '') or '').splitlines()
                        if msg:
                            err = msg[0][:200]
                            break
                    if err:
                        break
                fails.append(f"- [{proj}] {fh}:{sp.get('line', '?')} > {title} -- {err}")
        walk(s.get('suites', []), fh)


walk(d.get('suites', []))
print(f"### {ok} OK / {len(fails)} KO")
for line in fails:
    print(line)
