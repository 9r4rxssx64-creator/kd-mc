---
name: apex-appstore
description: Publier une app de kd-mc.com sur l'App Store / TestFlight via le CLI `asc` (App Store Connect API). À charger dès que Kevin parle d'App Store, TestFlight, soumission Apple, build iOS, « vraie app iPhone », ou « mettre le domaine sur l'App Store ».
when_to_use: Auto, avant toute réponse sur une publication Apple. Toujours annoncer les prérequis manquants AVANT de promettre.
model: sonnet
allowed_tools: [read_repo_file, search_repo_code]
---

# App Store — CLI `asc` (parité Claude Code)

**Outils** (MIT, vérifiés le 2026-08-13) : `rorkai/App-Store-Connect-CLI` (Go, 5 823 ★ —
TestFlight, builds, soumissions, signature, captures, abonnements ; **JSON d'abord, zéro
question interactive** → pilotable par un agent) et `rorkai/app-store-connect-cli-skills`
(963 ★ — les **skills d'agent** qui décrivent les ENCHAÎNEMENTS). Les deux sont vendorisés
dans `vendor/agent-toolkit/`. **Lire les skills avant d'inventer une séquence.**

## Ce qui manque VRAIMENT (à dire avant de promettre)

- **Compte Apple Developer 99 €/an** → Kevin seul (paiement CB).
- **Clé API App Store Connect** (Issuer ID + Key ID + `.p8`) → Kevin seul, une fois.
- **Une PWA ne se soumet pas telle quelle** : il faut un emballage natif (Capacitor/WKWebView)
  compilé sur Mac — le runner `macos-latest` de la CI le fait. Apple **refuse les coquilles
  vides** autour d'un site (règle 4.2). Candidates crédibles : CMCteams, Apex Chat, Lingua.
- On publie des **apps**, pas « un domaine ».

## Sécurité

Clé `.p8` = **secret GitHub** (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY`), jamais dans
le dépôt, jamais journalisée. Le binaire `asc` n'est **pas** vendorisé (texte uniquement).
Toute soumission/publication est **irréversible côté Apple** → accord explicite de Kevin
d'abord, comme un déploiement prod.

## Méthode

Skills vendorisés → prérequis vérifiés → build en CI sur `macos-latest` → **TestFlight
d'abord** → App Store après validation de Kevin → rapport avec l'état RÉEL lu via `asc`.

Version longue : `.claude/skills/appstore/SKILL.md`.

## La chaîne existe déjà (2026-08-13)

`mobile/apps.json` (3 apps figées) · `mobile/build-ios.mjs` (prépare le contenu, **vérifie
les chemins absolus**) · `.github/workflows/ios-testflight.yml` (bouton, `macos-latest`) ·
`tests/mobile-ios-config.test.mjs` (35 vérifs, dans `test:ci`).

**Pièges connus** : (1) une app qui charge `/CMCteams/…` en absolu perd ces fichiers dans
l'app native → `dupliquerSous` + contrôle au build ; (2) un `include` trop large embarquait
**61 Mo** au lieu de 4,3. **Identifiant SANS TIRET** (forme paquet Java) — `com.kd-mc.*` refusé par Capacitor. **L'identifiant Apple est figé** — le changer perd testeurs et avis.
