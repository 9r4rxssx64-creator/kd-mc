#!/bin/bash
# POUSSER SUR GITLAB — sans jamais écrire le jeton sur le disque.
# ---------------------------------------------------------------------------
# Pourquoi ce script existe (vécu le 2-3.09.2026) :
#
#  1. (2-3.09) GitHub était suspendu : toutes les sessions poussaient sur GitLab.
#     DEPUIS LE 4.09 GitHub est rouvert et redevenu la voie normale (git push origin +
#     PR) ; ce script ne sert plus qu'à la remise à niveau OCCASIONNELLE de GitLab
#     (miroir kdmc-site.pages.dev + jobs de veille), cf. ETAT-INFRA fait n°13.
#  2. Le jeton NE DOIT JAMAIS être enregistré (pas de `git remote add` avec le
#     jeton dedans, pas de credential helper) — règle de sécurité de Kevin,
#     ETAT-INFRA.md fait n°7. On l'écrit donc dans l'URL, au moment du push.
#  3. Mais un push par URL en clair NE MET PAS À JOUR le repère local
#     `refs/remotes/origin/<branche>` — le contrôle de fin de tour croit alors
#     qu'il reste des commits à pousser, et réclame un push déjà fait, en
#     boucle. Ce script remet le repère à jour APRÈS un push réussi : c'est
#     vrai, GitLab a bien le commit, on vient de l'y mettre.
#
# Usage :
#   GITLAB_TOKEN=glpat-xxx ./tools/pipeline/pousser.sh              # sa branche
#   GITLAB_TOKEN=glpat-xxx ./tools/pipeline/pousser.sh main         # vers main
#
# Le jeton n'est lu que dans l'environnement, jamais stocké, jamais affiché
# (toute sortie est filtrée avant d'être montrée).
set -uo pipefail

DEPOT="gitlab.com/kdmc-group/Kdmc-project.git"
BRANCHE_LOCALE="$(git branch --show-current)"
CIBLE="${1:-$BRANCHE_LOCALE}"

if [[ -z "${GITLAB_TOKEN:-}" ]]; then
  echo "✗ GITLAB_TOKEN manquant." >&2
  echo "  Relance :  GITLAB_TOKEN=glpat-… $0 ${1:-}" >&2
  exit 1
fi
if [[ -z "$BRANCHE_LOCALE" ]]; then
  echo "✗ Tête détachée : pas de branche courante." >&2
  exit 1
fi

# Le filtre masque le jeton dans TOUTE sortie, y compris les messages d'erreur
# de git qui réaffichent l'URL complète.
masquer() { sed -E 's#//[^@/]*@#//***@#g'; }

echo "→ push  ${BRANCHE_LOCALE}  →  GitLab ${CIBLE}"
if ! git push "https://oauth2:${GITLAB_TOKEN}@${DEPOT}" \
       "HEAD:refs/heads/${CIBLE}" 2>&1 | masquer; then
  echo "✗ push refusé — le repère local n'est PAS touché (il reste honnête)." >&2
  exit 1
fi

# Push accepté : GitLab a bien ce commit. Le repère local `origin/<cible>` ne se touche
# QUE si `origin` EST GitLab — depuis le 4.09 (GitHub rouvert), `origin` est GitHub :
# y écrire un commit que GitHub n'a pas rendrait le dépôt MENTEUR (« tout est publié »
# alors que rien n'est parti sur GitHub). Vécu le 5.09 : c'est pour ça que la remise à
# niveau de GitLab s'est faite à la main, sans ce script.
ORIGINE="$(git remote get-url origin 2>/dev/null || true)"
if [[ "$ORIGINE" == *gitlab.com* ]]; then
  git update-ref "refs/remotes/origin/${CIBLE}" HEAD
  echo "✓ poussé sur GitLab ${CIBLE} · repère origin/${CIBLE} remis à $(git rev-parse --short HEAD)"
else
  echo "✓ poussé sur GitLab ${CIBLE} · repère origin/* NON touché (origin = GitHub : GitLab n'est qu'une remise à niveau occasionnelle, cf. ETAT-INFRA fait n°13)"
fi
