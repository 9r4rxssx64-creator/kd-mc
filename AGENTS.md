# AGENTS.md — règles pour TOUT agent de code indépendant (Codex, Jules, Cursor, Copilot…)

Ce fichier est le standard lu par les agents IA autonomes (OpenAI Codex, Google Jules,
Cursor, GitHub Copilot agent…). Il leur dit comment travailler sur ce dépôt SANS rien
casser. `CLAUDE.md` (racine) est la référence complète ; ici = l'essentiel opérationnel.

Propriétaire : Kevin DESARZENS. Domaine : **kd-mc.com** (routeur Cloudflare → sous-dossiers).
Dépôt = monorepo de plusieurs apps servies par sous-domaine.

## 🔴 Règles d'or (non négociables)

1. **Branche** : ne JAMAIS pousser sur `main`. Travailler sur une branche `claude/*` ou
   `agent/*` et ouvrir une Pull Request. Le merge se fait après revue.
2. **Aucun secret en clair** : jamais de clé API / token / mot de passe dans le code ou
   les logs. Les secrets vivent dans les secrets GitHub / variables d'environnement
   Cloudflare. Ne pas logguer de PII ni de jeton.
3. **Versionner à chaque fix d'app** (sinon la MAJ PWA ne part pas) : bumper la version
   AUX points synchronisés (détails § par app) dans le MÊME commit.
4. **Message clair, pas de jargon** pour l'utilisateur final : toute erreur affichée doit
   être compréhensible + actionnable (ex. « Session expirée — reconnecte-toi »), jamais
   « HTTP 401 » brut. Détail technique = dans les logs, pas à l'écran.
5. **Mobile-first iPhone** : cibles tactiles ≥ 44px, tester à 375px, `safe-area-inset`.
6. **Reproduire, ne pas inventer** (surtout parsing planning CMCteams) : chaque donnée
   affichée doit venir de la source ; jamais de valeur « devinée ».

## ✅ Portes de validation AVANT de proposer une PR (obligatoire par app)

| App / dossier | Commande de validation (doit passer) |
|---|---|
| **Apex v13** (`apex-ai/v13/`) | `npx tsc --noEmit` + `npm run lint` (0 warning) + `npx vitest run` (tout vert) |
| **Apex Chat** (`messaging-app/`) | `npx vitest run --coverage` — libs/ et durable-objects à **100%**, EXIT 0, 0 « Unhandled » |
| **CMCteams** (`index.html`) | `node --check` sur le JS combiné des `<script>` + `npm run test:ci` (EXIT 0) |
| **Workflows** (`.github/workflows/`) | YAML valide + **aucune clé dupliquée** (GitHub Actions rejette) |
| **Front statique** (kdmc-home, shops, tools) | `node --check` sur le JS ; pas de scroll horizontal ; liens en chemin ABSOLU `/CMCteams/...` |

Un « tests verts » ne suffit pas : lancer AUSSI le lint et la suite COMPLÈTE (pas juste les
fichiers touchés) avant de proposer.

## 🗺️ Carte des apps (chaque app = un sous-domaine, via `services/kdmc-router/worker.js`)

- `cmcteams.kd-mc.com` → `index.html` (planning casino — parsing PDF, très sensible).
- `apex-ai.kd-mc.com` → `apex-ai-v13/` (⚠️ **dossier GÉNÉRÉ** par build de `apex-ai/v13/` —
  ne JAMAIS l'éditer à la main, il est écrasé au build).
- `apex-chat.kd-mc.com` → `messaging-app/` (messagerie E2E + workers Cloudflare + Durable Objects).
- `la-detente.kd-mc.com`, `chez-lolo.kd-mc.com`, `dashboard.…`, `sourcing.…` → `shops/` (e-commerce Printify).
- `coffre.kd-mc.com` → `coffre-fort/` ; `departs.kd-mc.com` → `tools/departs/`.
- `kd-mc.com` (accueil) → `kdmc-home/` (contient `/worldmonitor/` et `/osint/`).
- Ressources partagées référencées depuis une page servie par le routeur : chemin ABSOLU
  `/CMCteams/shops/_shared/…` (un chemin relatif `../_shared/` donne un 404 sur le domaine).

## 🔎 Bonnes pratiques spécifiques

- **Cloudflare Worker** (`messaging-app/workers/**`, `shops/**/worker*/`, `services/kdmc-router/`) :
  gérer le préflight CORS `OPTIONS` AVANT l'auth ; `Access-Control-Allow-Headers` en liste
  explicite (pas `*`) pour iOS ; distinguer 401 (auth) de 5xx (upstream) ; ne jamais renvoyer
  un secret au client.
- **Boutiques** : jamais valider un paiement sans preuve ; allowlist CORS du worker de
  commande doit inclure les origins `*.kd-mc.com` ; pas d'avis clients fabriqués sur une vraie boutique.
- **Runtime > lecture** : un bug se prouve en CHARGEANT la vraie page (voir les workflows
  `audit-live.yml`, `pages-smoke.yml`, `*-e2e.yml`), pas en lisant le code.

## 🤝 Revue indépendante

Toute PR est relue automatiquement par des experts indépendants (CodeRabbit, Qodo PR-Agent,
SonarCloud). Tenir compte de leurs commentaires. Commandes utiles en commentaire de PR :
`/review`, `/improve`.

## Contact / doc complète

Règles détaillées + historique des pièges connus : `CLAUDE.md` (racine). En cas de doute
sur une convention, s'y référer AVANT de coder.
