# 04 — DESIGN / UX (mesures)

Non mesuré dans cette passe (l'audit du domaine a porté sur l'infra, la surveillance et la sécurité). Ce qui existe et a tourné (CMCteams, mesuré 17h30) : `audit:stability` 0 FAIL 0 WARN (render 0 au repos, mutations DOM topbar 24/12/0 sur 6 s) · `audit:clicks` 79 vues / 1109 boutons / 0 erreur JS · `test:a11y` axe-core 0 violation (accueil, monplanning, rgpd, departs).

À faire (CI, réseau ouvert) : `audit-live.yml` (captures d'écran par surface, artifact 30 j), `seo-audit.yml` (PageSpeed, input `https://kd-mc.com`), `test:a11y` (axe-core, dans `test:ci`). Aucun score n'est estimé ici.
