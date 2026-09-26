#!/usr/bin/env bash
# Serveur statique HTTPS pour les tests E2E Playwright.
#
# POURQUOI HTTPS EN TEST (leçon #… WebKit) : la CSP de l'app contient
# `upgrade-insecure-requests`. En prod (apex-chat.kd-mc.com = HTTPS) c'est un
# no-op. Mais servi en HTTP sur localhost, WebKit — contrairement à Chromium —
# n'exempte PAS localhost de l'upgrade → il tente https://localhost:4173/lib/*.js
# sur un serveur HTTP → « TLS handshake: unexpected TLS packet » → TOUS les
# <script type="module"> échouent (ApexCrypto/Search/Gallery/Privacy/Gif =
# undefined), seul le <script> inline (window.K) survit. En servant le test en
# HTTPS, il n'y a plus rien à upgrader → parité WebKit/Chromium, et on teste le
# fichier index.html EXPÉDIÉ tel quel (aucune divergence de CSP).
#
# Le certificat auto-signé localhost est GÉNÉRÉ ici (gitignoré) → jamais de clé
# privée committée (pas de faux positif secret-scanner).
set -euo pipefail
cd "$(dirname "$0")/.."

CERT="tests/.localhost-cert.pem"
KEY="tests/.localhost-key.pem"

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$KEY" -out "$CERT" -days 3650 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
fi

exec npx http-server -p 4173 -s -c-1 -S -C "$CERT" -K "$KEY"
