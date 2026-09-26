#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# gen-pdf.sh — Regénère tools/cuisine/livre.pdf à partir de imprimer.html
#
# Le livre « A Cüjina de Mùnegu » était jusqu'ici regénéré à la main, sans
# script : personne ne savait avec quels réglages. Vérifié le 2026-09-05 :
# le PDF livré porte /Producer "Skia/PDF" + /Creator "Chromium" et une
# MediaBox A4 (595 x 842 pt). Ce script rejoue exactement cette chaîne.
#
#   ./gen-pdf.sh              # regénère livre.pdf
#   ./gen-pdf.sh --dry-run    # montre ce qui serait fait, n'écrit rien
#   ./gen-pdf.sh --out X.pdf  # écrit ailleurs (ne touche pas livre.pdf)
#   ./gen-pdf.sh --help
#
# Le format A4 est figé dans imprimer.html (@page{size:A4}). Sans lui,
# Chromium sort du format Lettre US (216 x 279 mm) : le livre entier
# change de pagination.
# ---------------------------------------------------------------------------
set -euo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ICI/imprimer.html"
OUT="$ICI/livre.pdf"
DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --out)     OUT="${2:?--out attend un chemin}"; shift 2 ;;
    --help|-h) sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Option inconnue : $1 (voir --help)" >&2; exit 2 ;;
  esac
done

# --- trouver Chromium ------------------------------------------------------
CHROME=""
for c in \
  "${CHROME_BIN:-}" \
  /opt/pw-browsers/chromium-*/chrome-linux/chrome \
  "$(command -v google-chrome || true)" \
  "$(command -v chromium || true)" \
  "$(command -v chromium-browser || true)"
do
  [ -n "$c" ] && [ -x "$c" ] && CHROME="$c" && break
done
if [ -z "$CHROME" ]; then
  echo "ERREUR : Chromium introuvable." >&2
  echo "  Renseigne CHROME_BIN=/chemin/vers/chrome, ou installe chromium." >&2
  exit 1
fi

[ -f "$SRC" ] || { echo "ERREUR : $SRC introuvable." >&2; exit 1; }

if ! grep -q '@page{size:A4' "$SRC"; then
  echo "ERREUR : imprimer.html ne fige plus le format A4 (@page{size:A4})." >&2
  echo "  Sans ça le PDF sortirait en Lettre US et toute la pagination change." >&2
  exit 1
fi

echo "Chromium : $CHROME"
echo "Source   : $SRC"
echo "Sortie   : $OUT"
if [ "$DRY" = "1" ]; then
  echo "(--dry-run : rien n'a été écrit)"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

"$CHROME" --headless --no-sandbox --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=180000 \
  --print-to-pdf="$TMP/livre.pdf" "file://$SRC" 2>/dev/null

[ -s "$TMP/livre.pdf" ] || { echo "ERREUR : Chromium n'a produit aucun PDF." >&2; exit 1; }

# --- contrôle : format A4 + nombre de pages plausible ----------------------
python3 - "$TMP/livre.pdf" <<'PY'
import re, sys
d = open(sys.argv[1], 'rb').read()
pages = len(re.findall(rb'/Type\s*/Page[^s]', d))
boxes = {b.decode() for b in re.findall(rb'/MediaBox\s*\[([^\]]{0,40})\]', d)}
a4 = any(b.startswith('0 0 59') and ' 84' in b for b in boxes)
print("  pages    : %d" % pages)
print("  MediaBox : %s" % ", ".join(sorted(boxes)))
if not a4:
    sys.exit("ERREUR : le PDF n'est pas en A4 (%s)" % boxes)
if pages < 200:
    sys.exit("ERREUR : seulement %d pages, le livre en fait plus de 200." % pages)
PY

mv "$TMP/livre.pdf" "$OUT"
echo "OK — $OUT ($(du -h "$OUT" | cut -f1))"
