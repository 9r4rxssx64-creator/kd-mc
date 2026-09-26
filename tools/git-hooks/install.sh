#!/usr/bin/env bash
# Installe le pre-commit hook dans .git/hooks/
# Usage : bash tools/git-hooks/install.sh

set -e
REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC="$REPO_ROOT/tools/git-hooks/pre-commit"
DST="$REPO_ROOT/.git/hooks/pre-commit"

if [ ! -f "$SRC" ]; then
  echo "FAIL: $SRC introuvable"
  exit 1
fi

cp "$SRC" "$DST"
chmod +x "$DST"
echo "OK: pre-commit hook installe dans $DST"
echo "Test : modifie un fichier et fais 'git commit' (le hook tournera automatiquement)"
echo "Skip : 'git commit --no-verify' (deconseille)"
