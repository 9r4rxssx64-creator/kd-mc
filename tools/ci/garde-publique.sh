#!/usr/bin/env bash
# Lance un garde npm DANS LE DÉPÔT PUBLIC sans planter quand ce garde est resté au coffre.
#
# Pourquoi (mesuré le 8.10.2026) : l'export retire de package.json tout script qui lit un fichier
# privé ou cite un vrai nom (test:laissez-passer lit index.html ; test:javis-bee citait un collègue
# en commentaire). Un robot public qui écrit « npm run -s test:javis-bee » en dur plante alors sur
# « missing script » — bee-gardes.yml était rouge à CHAQUE push du 2.10 au 8.10 pour ça, et les
# gardes suivantes ne tournaient même plus. Une garde rangée au coffre n'est pas une garde cassée :
# on le DIT (annotation), elle tourne dans coffre-chaine-privee. Même règle que tests.yml.
#
#   bash tools/ci/garde-publique.sh test:javis-bee
set -euo pipefail
g="${1:?nom du script npm}"
if ! node -e "process.exit(require('./package.json').scripts[process.argv[1]] ? 0 : 1)" "$g"; then
  echo "::notice title=$g::script au coffre (retiré de la copie publique) — tourne dans coffre-chaine-privee"
  exit 0
fi
npm run -s "$g"
