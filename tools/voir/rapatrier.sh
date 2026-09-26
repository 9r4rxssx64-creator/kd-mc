#!/usr/bin/env bash
# Rapatrie ce que le workflow « Voir comme Kevin » a déposé, pour l'OUVRIR depuis l'agent
# (git passe par le proxy, contrairement aux artefacts GitHub qui sont injoignables d'ici).
#   tools/voir/rapatrier.sh <run_id>   → extrait voir/<run_id>/ dans $DEST (défaut : /tmp/voir-<run_id>)
# Ensuite : ouvrir les *.jpg avec l'outil Read (les images s'affichent) et lire RAPPORT.md.
set -euo pipefail
RUN="${1:?run_id du workflow voir-comme-kevin}"
BR="claude/voir-$RUN"
DEST="${DEST:-/tmp/voir-$RUN}"
git fetch -q origin "$BR"
mkdir -p "$DEST"
git archive "origin/$BR" "voir/$RUN" | tar -x -C "$DEST"
echo "→ $DEST/voir/$RUN"
ls -la "$DEST/voir/$RUN" | sed 's/^/   /'
find "$DEST/voir/$RUN" -name '*.jpg' | sed 's/^/   image : /'
