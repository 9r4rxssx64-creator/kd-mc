#!/bin/sh
# Recherche généalogique via CI (réseau ouvert) : pour chaque NOM, récupère la
# liste des décès (fichier INSEE, 1970+) sur acte-deces.fr et en extrait chaque
# personne (prénoms, NOM, dates+lieux décès/naissance, département, âge, acte).
# Lecture seule. Var NAMES (csv). Var MAX (max entrées/nom, défaut 80).
set -eu
apk add --no-cache curl python3 >/dev/null
NAMES="${NAMES:-maiffret}"
MAX="${MAX:-80}"
echo "===== RECHERCHE GENEALOGIE (INSEE via acte-deces.fr) ====="
echo "$NAMES" | tr ',' '\n' | while read raw; do
  n=$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr -d ' ')
  [ -z "$n" ] && continue
  url="https://www.acte-deces.fr/recherche-deces-famille-$n"
  echo ""
  echo "### $n  ($url)"
  if ! curl -s --max-time 30 -A "Mozilla/5.0 (genealogie)" "$url" -o /tmp/p.html; then
    echo "  (reseau KO)"; continue
  fi
  MAXV="$MAX" python3 - "$n" <<'PY'
import sys,re,html,os
name=sys.argv[1]; MAX=int(os.environ.get("MAXV","80"))
try: t=open('/tmp/p.html',encoding='utf-8',errors='ignore').read()
except: print("  (lecture KO)"); raise SystemExit
m=re.search(r'(\d+)\s+actes? de d', t) or re.search(r'(\d+)\s+décès portant', t)
print("  total INSEE:", m.group(1) if m else "?")
b=re.sub(r'<script.*?</script>','',t,flags=re.S)
b=re.sub(r'<style.*?</style>','',b,flags=re.S)
b=re.sub(r'<[^>]+>',' ',b); b=html.unescape(b); b=re.sub(r'\s+',' ',b)
# Format acte-deces : "<dep> - <Departement> - Prenom NOM (Nom complet) décédé(e) le
#  <j mois aaaa> à <ville> à l'age de <n> ans et né(e) [sur la même commune|à <ville>] le <j mois aaaa>."
pat=re.compile(
 r"([A-Z0-9]{2,3})\s*-\s*[^-]+?\s*-\s*"
 r"([A-ZÀ-Ü][\wÀ-ž\-'’ ]+?)\s*\(([^)]*)\)\s*"
 r"d[ée]c[ée]d[ée]?e?\s+le\s+(\d{1,2}\s+[a-zà-ü]+\s+\d{4})\s+"
 r"[àa]\s+(.+?)\s+[àa]\s+l'?[âa]ge\s+de\s+(\d+)\s+ans\s+"
 r"et\s+n[ée]e?\s+(sur la m[êe]me commune|[àa]\s+.+?)\s+le\s+(\d{1,2}\s+[a-zà-ü]+\s+\d{4})",
 re.I)
c=0
for mm in pat.finditer(b):
    dep,short,full,dd,dv,age,bi,bd=[x.strip() for x in mm.groups()]
    bv = dv if 'commune' in bi.lower() else re.sub(r'^[àa]\s+','',bi,flags=re.I)
    c+=1
    if c>MAX: print("  … (liste tronquée à %d)"%MAX); break
    print(f"   • {full or short}  |  † {dd} à {dv} ({age} ans)  |  né {bd} à {bv}  [dep {dep}]")
if c==0:
    print("  (0 entrée extraite — voir échantillon:)")
    i=b.lower().find('liste des')
    print("   ····", b[i:i+900].replace('\n',' ') if i>0 else b[1500:2400])
PY
done
echo ""
echo "===== FIN GENEALOGIE ====="
