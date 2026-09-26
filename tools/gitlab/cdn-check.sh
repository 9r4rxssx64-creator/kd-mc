#!/bin/sh
# =============================================================================
# LES BIBLIOTHÈQUES CHARGÉES DEPUIS UN CDN RÉPONDENT-ELLES ENCORE ?
# -----------------------------------------------------------------------------
# Si un de ces liens meurt, une fonction de l'app meurt avec lui, en silence :
# le navigateur n'affiche rien, la page « marche » et le bouton ne fait plus
# rien. C'est le genre de panne qu'on découvre par hasard, des semaines après.
#
# Pourquoi ICI et pas sur GitHub : ce travail consiste à interroger des serveurs
# TIERS — exactement ce que les conditions GitHub Actions excluent (« any other
# activity unrelated to the production, testing, deployment, or publication of
# the software project »). Sa place est GitLab. Il ne part jamais tout seul :
# 0 minute tant qu'on ne le lance pas.
#
# CE QU'IL FAIT DE MIEUX QUE L'ANCIENNE VERSION : l'ancienne portait TROIS
# adresses écrites à la main (lz-string, fuse.js, qrcode). Une bibliothèque
# ajoutée ensuite n'était jamais surveillée, et personne ne s'en apercevait.
# Celle-ci LIT les adresses dans le code — ajouter une bibliothèque demain, c'est
# la surveiller demain, sans penser à rien.
#
# Lecture seule. Ne modifie rien.
# =============================================================================
set -eu
command -v curl > /dev/null 2>&1 || { echo "curl absent"; exit 1; }

echo "=== Adresses CDN trouvées dans le code ==="
# On cherche dans ce que le navigateur charge vraiment (html/js), on ignore
# node_modules et les dossiers de travail.
LISTE=$(grep -rhoE 'https://(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|code\.jquery\.com|esm\.sh)/[A-Za-z0-9@._/+-]+' \
          --include='*.html' --include='*.js' --include='*.mjs' . 2>/dev/null \
        | grep -v node_modules \
        | sed 's/[",);]*$//' \
        | sort -u)

TOTAL=$(printf '%s\n' "$LISTE" | grep -c . || true)
echo "$TOTAL adresse(s) distincte(s)"
echo

VIVANTS=0
PROTEGES=0
MORTS=0
LISTE_MORTS=''

for u in $LISTE; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 "$u" 2>/dev/null || echo 000)
  case "$CODE" in
    2*)      VIVANTS=$((VIVANTS + 1)); printf '  ✅ %s  %s\n' "$CODE" "$u" ;;
    401|403) PROTEGES=$((PROTEGES + 1)); printf '  🔒 %s  %s  (refus anti-robot, PAS un lien mort)\n' "$CODE" "$u" ;;
    *)       MORTS=$((MORTS + 1)); LISTE_MORTS="$LISTE_MORTS
  - $u  (HTTP $CODE)"; printf '  ❌ %s  %s\n' "$CODE" "$u" ;;
  esac
done

echo
echo "vivants : $VIVANTS · protégés : $PROTEGES · MORTS : $MORTS"
if [ "$MORTS" -gt 0 ]; then
  echo
  echo "🚨 $MORTS adresse(s) ne répondent plus — la fonction qui en dépend est cassée :"
  printf '%s\n' "$LISTE_MORTS"
  echo
  echo "Un 401/403 n'est PAS une panne : c'est le CDN qui refuse les robots."
  exit 1
fi
echo "✅ Toutes les bibliothèques externes répondent."
