# 00 — INVENTAIRE (audit du domaine kd-mc.com, 5.09.2026)

> Statut de chaque ligne : ✅ VÉRIFIÉ (commande exécutée / API lue) · 🟡 DÉDUIT (lecture) · 🔴 SUPPOSÉ.
> Session « domaine-audit » (branche `claude/surveillance-domaine-26-adresses`).

## Stack réelle (lue, pas supposée)
- ✅ Dépôt **public** `9r4rxssx64-creator/CMCteams`, 367 branches `claude/*`, `main` fusionnée par le robot `auto-merge-claude.yml` dès que « Auto PR Review » (tsc + tests changés) est vert.
- ✅ **Routeur** `services/kdmc-router/worker.js` : table `ROUTES` = **26 sous-domaines** de kd-mc.com (lus par `tests/uptime-couverture.test.mjs`), contenu servi par GitHub Pages derrière le routeur (fait n°11).
- ✅ **25 workers Cloudflare en ligne** (connecteur `workers_list`, 17h) — dont `kdmc-uptime` créé aujourd'hui 13:49, redéployé 16:51 ; `kdmc-rag` figé au **08/07** ; `apex-v13-backend` déclaré dans `services/` mais **absent** du compte.
- ✅ **Plan Cloudflare gratuit** : 5 cron triggers, tous pris (apex-chat-api 4, kdmc-outlook 1) ; 100 000 req/jour pour tout le compte ; 50 sous-requêtes et 6 connexions simultanées par requête.
- ✅ Publication : GitHub Pages (`deploy.yml`) ; miroir `kdmc-site.pages.dev` par GitLab CI à la demande (fait n°11).

## Ce qu'une session atteint (mesuré, fait n°16)
| Canal | État | Usage |
|---|---|---|
| API GitHub `/repos` | ❌ 403 | rien |
| `git push/fetch` | ✅ | pousser, déclencher par `push`, relire un fichier écrit par la CI |
| WebFetch `github.com` | ✅ | PR, runs, **annotations** (pas les logs ni le résumé) |
| Connecteur Cloudflare | ✅ | `modified_on` des workers = preuve de déploiement, code en ligne, doc |
| Connecteurs Railway / Sentry / Supabase / Netlify | ✅ répondent | Railway : 2 projets (`CMCteams`, `zonal-wonder`) · Sentry : org `kdmc` (de.sentry.io) · Supabase : 0 projet · Netlify : 0 site |
| kd-mc.com, workers.dev, sonarcloud.io | ❌ 403 | → CI (réseau ouvert) |

## Secrets (voir `06-SECRETS-CONNECTEURS.md`)
- ✅ **101 noms** de secrets consommés par les 143 workflows actifs ; **47** absents de la liste documentée dans CLAUDE.md (50 secrets vus par Kevin le 3.09). Je ne peux pas lire la page des secrets : chaque nom est marqué « à confirmer », avec le workflow qui l'attend.
- ✅ Scan clair du dépôt : `test:no-pin-leak`, `test:secret-jamais-persiste`, `test:depot-public-sain` verts sur cette branche.

## Outils d'audit disponibles et exécutés
| Outil | Exécuté ? | Résultat |
|---|---|---|
| `npm run audit:improvements` | ✅ 17h05 | 0 compteur en hausse, 6 améliorations chiffrées (`03-FINDINGS.md`) |
| `npm run audit:stability` | ✅ 17h10 | 0 FAIL 0 WARN (accueil/admin/monplanning, CMCteams) |
| `npm run audit:clicks`, `test:a11y` | ✅ 17h30 (playwright + axe-core installés dans un dossier isolé, `npm i` à la racine plante : « edgesOut ») | clics : 79 vues / 1109 boutons / 0 erreur JS · a11y : 0 violation |
| `audit-live.yml` (vrai navigateur sur kd-mc.com) | ✅ déclenché par le push 4c4a469 (rendu push-déclenchable ce jour) | lecture des annotations à la fin du run — `05-JOURNAL.md` |
| `kdmc-uptime` premier relevé réel | ✅ run 33979141313 | 32 cibles annoncées (**31** depuis le retrait d'`apex-v13-backend`), **6 « en panne » = les 6 workers** (cause à lire au prochain smoke, annotations par cible ajoutées) |
| 3 relecteurs indépendants (sécurité, SRE, complétude) | ✅ | 2 P0, 4 P1, 6 P2, 5 P3 → tous les sûrs appliqués (`03-FINDINGS.md`) |
| Second avis non-Claude | 🟡 | SonarCloud : Quality Gate C sur PR #3652 = 2 findings (wrangler non épinglé, `--ignore-scripts`) → **corrigés** ; Qodo/CodeRabbit : aucun commentaire sur la PR ; Semgrep « patterns » : non lisible depuis la session |
