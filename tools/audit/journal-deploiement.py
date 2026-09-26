#!/usr/bin/env python3
"""Écrit UNE entrée lisible dans audit/deploiements-rates.md quand une mise en ligne rate.

POURQUOI : depuis l'agent, je ne peux pas lire les journaux de la CI (le connecteur
GitHub Actions a été refusé par GitHub le 2026-09-06, deux fois). Ce script tourne
DANS la CI, où le journal est lisible, et en dépose l'essentiel dans le dépôt.
Un « git pull » me rend alors la cause exacte — et Kevin la voit dans le fichier.

Règle « toujours détailler les erreurs, cause exacte » : on garde les lignes qui
DISENT quelque chose (::error::, Error:, ✘…), pas les 3000 lignes de bruit.

Testable hors CI : toutes les entrées passent par des variables d'environnement.
    NOM BRANCHE SHA URL RUN  ·  J_DIR (défaut /tmp/j)  ·  J_OUT (défaut audit/…)
"""
import os
import re
import datetime
import pathlib

DOSSIER = pathlib.Path(os.environ.get('J_DIR', '/tmp/j'))
SORTIE = pathlib.Path(os.environ.get('J_OUT', 'audit/deploiements-rates.md'))
GARDE = 25          # on garde les 25 dernières pannes, pas l'historique complet
LIGNES_MAX = 30     # extrait du journal : assez pour comprendre, pas un roman

EN_TETE = """# 🧾 Déploiements ratés — la cause exacte, écrite ici

> Ce fichier est rempli **automatiquement** par `.github/workflows/journal-deploiements.yml`
> **uniquement quand une mise en ligne échoue**. Il existe parce que l'assistant ne peut pas
> lire les journaux de la CI : le connecteur GitHub Actions a été refusé par GitHub
> (2026-09-06). Le workflow lit le journal à sa place et dépose l'essentiel ici.
>
> Rien ici quand tout va bien — c'est normal, et c'est bon signe.
"""


def lire(nom, defaut=''):
    f = DOSSIER / nom
    try:
        return f.read_text(encoding='utf8', errors='replace').strip()
    except OSError:
        return defaut


def lignes_utiles(brut):
    """Garde ce qui explique. À défaut, la fin du journal (là où ça casse)."""
    lignes = []
    for l in brut.splitlines():
        # `gh run view --log-failed` préfixe « job<TAB>étape<TAB>2026-…Z message »
        l = re.sub(r'^.*?\t.*?\t\d{4}-\d\d-\d\dT[\d:.]+Z\s?', '', l)
        l = re.sub(r'^\d{4}-\d\d-\d\dT[\d:.]+Z\s?', '', l).rstrip()
        if l:
            lignes.append(l)
    # `error:` seul ne suffit PAS : essayé le 2026-09-06 sur un vrai journal
    # wrangler, ça jetait « Authentication error [code: 10000] » — c'est-à-dire
    # LA ligne qui disait pourquoi. On prend le mot entier, et les codes d'erreur
    # des API (Cloudflare 10000/9109/100328…) qui nomment la cause à eux seuls.
    parlantes = [l for l in lignes
                 if re.search(r'\berrors?\b|✘|✖|\bFAIL|Échec|echec|refus|denied|'
                              r'not found|introuvable|unauthoriz|forbidden|timeout|'
                              r'\bcode:\s*\d+|exit code',
                              l, re.I)]
    choisies = parlantes[-LIGNES_MAX:] if parlantes else lignes[-LIGNES_MAX:]
    return choisies or ['(journal vide)']


def entree():
    maintenant = datetime.datetime.now(datetime.timezone.utc).strftime('%d/%m/%Y %H:%M')
    nom = os.environ.get('NOM') or '(déploiement sans nom)'
    branche = os.environ.get('BRANCHE') or '—'
    sha = (os.environ.get('SHA') or '')[:8] or '—'
    url = os.environ.get('URL') or ''
    run = os.environ.get('RUN') or '—'
    etape = lire('etape.txt') or '(étape non identifiée)'
    extrait = '\n'.join(lignes_utiles(lire('log.txt')))

    bloc = [
        '## ❌ %s — %s UTC' % (nom, maintenant),
        '',
        '- **Branche** : `%s` · **Commit** : `%s` · **Run** : `%s`' % (branche, sha, run),
        '- **Ce qui a lâché** : %s' % etape,
        '- **Ce que la machine a dit** :',
        '',
        '```',
        extrait[:6000],
        '```',
        '',
    ]
    if url:
        bloc.insert(4, '- **Journal complet** : %s' % url)
    return '\n'.join(bloc)


def main():
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    ancien = SORTIE.read_text(encoding='utf8') if SORTIE.exists() else ''
    # On repart de l'en-tête + les anciennes entrées, la plus récente d'abord.
    anciennes = ancien.split('\n## ')
    anciennes = ['## ' + a for a in anciennes[1:]] if len(anciennes) > 1 else []
    gardees = [entree()] + anciennes[:GARDE - 1]
    SORTIE.write_text(EN_TETE + '\n' + '\n'.join(gardees), encoding='utf8')
    print('Consigné : %s (%d entrée(s) gardée(s))'
          % (os.environ.get('NOM', '?'), len(gardees)))


if __name__ == '__main__':
    main()
