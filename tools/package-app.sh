#!/bin/bash
# package-app.sh — Crée un ZIP distribuable de CMC Teams pour installation entreprise fermée
# Usage : ./tools/package-app.sh

set -e
cd "$(dirname "$0")/.."

VERSION=$(grep -oE 'var APP_VER="v[0-9]+\.[0-9]+"' index.html | head -1 | grep -oE 'v[0-9]+\.[0-9]+')
STAMP=$(date +%Y%m%d_%H%M)
OUT="dist/CMCteams_${VERSION}_${STAMP}"

echo "═══════════════════════════════════════"
echo "  📦 Packaging CMC Teams $VERSION"
echo "═══════════════════════════════════════"

rm -rf "$OUT"
mkdir -p "$OUT"

# Fichiers essentiels
cp index.html "$OUT/"
cp sw.js "$OUT/" 2>/dev/null || echo "⚠ sw.js manquant (optionnel)"
cp manifest.json "$OUT/" 2>/dev/null || echo "⚠ manifest.json manquant (optionnel)"
[ -f robots.txt ] && cp robots.txt "$OUT/"
[ -f favicon.ico ] && cp favicon.ico "$OUT/"

# Docs à inclure
cp README.md "$OUT/"
cp NOTES_USER.md "$OUT/" 2>/dev/null || true

# Guide install spécifique au ZIP
cp tools/INSTALL_ENTREPRISE.md "$OUT/INSTALL.md" 2>/dev/null || true

# Manifest de build
cat > "$OUT/BUILD_INFO.txt" <<EOF
CMC Teams — $VERSION
Build : $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Fichiers inclus :
$(ls -la "$OUT" | awk 'NR>1 {print "  - "$9" ("$5" octets)"}')

Hash index.html : $(sha256sum index.html | awk '{print $1}')

Installation : voir INSTALL.md
EOF

# Création du ZIP
cd dist
ZIPNAME="CMCteams_${VERSION}_${STAMP}.zip"
zip -qr "$ZIPNAME" "CMCteams_${VERSION}_${STAMP}"
echo ""
echo "✅ Package créé : dist/$ZIPNAME"
echo "   Taille : $(du -h "$ZIPNAME" | awk '{print $1}')"
echo "   Contenu : $(unzip -l "$ZIPNAME" | tail -1 | awk '{print $2}') octets · $(unzip -l "$ZIPNAME" | tail -1 | awk '{print $1}') fichiers"
echo ""
echo "📖 Installation : extraire le ZIP + ouvrir INSTALL.md"
