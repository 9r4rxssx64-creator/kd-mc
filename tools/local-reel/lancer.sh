#!/bin/bash
# VÉRIFIER EN RÉEL, GRATUITEMENT, EN LOCAL (Kevin 17.10 : « trouve des solutions pour tout vérifier réel, passe par le gratuit toujours »).
# Lance le vrai routeur + les vraies pages sur 127.0.0.1:8787 (aucune minute d'Actions, aucun secret du domaine), puis :
#   HASH_LOCAL=$(cat $OUTILS_LOCAL/hash) PW_EXE=<chromium> node tests/verif-local-bee-presence.mjs      (Bee est-elle sur chaque adresse ?)
# Usage : bash tools/local-reel/lancer.sh        (depuis la racine du dépôt ; relancer = reconstruit le paquet)
set -e
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"; export OUTILS_LOCAL="${OUTILS_LOCAL:-/tmp/local-reel}"; R="$RACINE/services/kdmc-router"
mkdir -p "$OUTILS_LOCAL/wr" "$OUTILS_LOCAL/esb"
[ -x "$OUTILS_LOCAL/wr/node_modules/.bin/wrangler" ] || (cd "$OUTILS_LOCAL/wr" && npm init -y >/dev/null && npm i wrangler@3 --no-audit --no-fund >/dev/null 2>&1)
[ -x "$OUTILS_LOCAL/esb/node_modules/.bin/esbuild" ] || (cd "$OUTILS_LOCAL/esb" && npm init -y >/dev/null && npm i esbuild@0.17 --no-audit --no-fund >/dev/null 2>&1)
[ -f "$OUTILS_LOCAL/key.pem" ] || openssl req -x509 -newkey rsa:2048 -nodes -keyout "$OUTILS_LOCAL/key.pem" -out "$OUTILS_LOCAL/cert.pem" -days 30 -subj "/CN=local" >/dev/null 2>&1
HASH="$(printf 'code-jetable-local' | sha256sum | cut -d' ' -f1)"; echo "$HASH" > "$OUTILS_LOCAL/hash"
cd "$R"
node prepare-secours.mjs >/dev/null 2>&1                                  # les vraies pages (public/, gitignoré)
printf "import mod, { AppelReveil } from './worker.js';\nexport default mod;\nexport { AppelReveil };\n" > local-entree.mjs   # workerd refuse les autres exports (constantes)
sed 's|^main = "worker.js"|main = "local-entree.mjs"|' wrangler.toml > wrangler.local.toml
printf 'KDMC_SSO_SECRET=secret-local-jetable\nKDMC_ADMIN_PIN_SHA256=%s\n' "$HASH" > .dev.vars
"$OUTILS_LOCAL/esb/node_modules/.bin/esbuild" local-entree.mjs --bundle --format=esm --keep-names --platform=neutral --conditions=workerd,worker,browser --main-fields=module,main --outfile="$OUTILS_LOCAL/worker.mjs" --log-level=error
(fuser -k 8787/tcp >/dev/null 2>&1 || true); sleep 1
(CONF="$R/wrangler.local.toml" HASH_LOCAL="$HASH" nohup node "$RACINE/tools/local-reel/serveur.mjs" > "$OUTILS_LOCAL/log.txt" 2>&1 &)
for i in $(seq 1 60); do grep -q PRET "$OUTILS_LOCAL/log.txt" 2>/dev/null && break; sleep 1; done
grep -E "PRET|rror" "$OUTILS_LOCAL/log.txt" | head -3
