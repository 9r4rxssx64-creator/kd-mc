#!/usr/bin/env bash
# Installe les navigateurs de Playwright SANS jamais pendre sur un miroir apt muet (leçon 918, 12.11.2026).
# Mesuré (run public 43056126562) : `playwright install --with-deps` est resté 20 min sur azure.archive.ubuntu.com
# (un paquet ignoré toutes les 20 s), jusqu'au délai du job : aucun résultat, aucune cause dite.
# Ici : 1) les navigateurs viennent du CDN de Playwright (pas d'apt), borné ; 2) les bibliothèques système (apt)
# sont tentées avec des délais COURTS et un plafond ; si apt ne répond pas on CONTINUE (les machines GitHub ont
# déjà les bibliothèques de Chromium) et on le DIT en annotation. Le robot sait tourner sans WebKit (il le dit).
# Usage : bash tools/ci/installer-navigateurs.sh "<commande playwright>" chromium [webkit] [firefox]
set -uo pipefail
PW="${1:?commande playwright}"; shift
[ "$#" -ge 1 ] || { echo "navigateur manquant"; exit 2; }
DELAI_NAV="${KDMC_DELAI_NAVIGATEURS:-300}"   # secondes, téléchargement des navigateurs
DELAI_APT="${KDMC_DELAI_APT:-240}"           # secondes, bibliothèques système

echo "→ navigateurs ($*) depuis le CDN, plafond ${DELAI_NAV}s"
# shellcheck disable=SC2086
if ! timeout "$DELAI_NAV" $PW install "$@"; then
  echo "::error title=Navigateurs::téléchargement de $* échoué ou plus long que ${DELAI_NAV}s"
  exit 1
fi

if command -v apt-get >/dev/null 2>&1 && [ "${KDMC_SANS_APT:-0}" != "1" ]; then
  SUDO=""; [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"
  printf 'Acquire::http::Timeout "10";\nAcquire::https::Timeout "10";\nAcquire::Retries "1";\nAPT::Get::Assume-Yes "true";\n' \
    | $SUDO tee /etc/apt/apt.conf.d/99kdmc-delais >/dev/null 2>&1 || true
  echo "→ bibliothèques système, plafond ${DELAI_APT}s (délai apt 10 s, 1 reprise)"
  # shellcheck disable=SC2086
  if ! timeout "$DELAI_APT" $PW install-deps "$@"; then
    echo "::warning title=Navigateurs::bibliothèques système non installées (miroir apt muet ou > ${DELAI_APT}s) : on continue, un moteur peut manquer et le robot le dira"
  fi
fi
exit 0
