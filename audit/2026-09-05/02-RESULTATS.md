# 02 — RÉSULTATS (attendu / obtenu / statut, sorties réelles)

| Contrôle | Attendu | Obtenu | Statut |
|---|---|---|---|
| Couverture routeur ⇄ sonde | 26/26 | `tests/uptime-couverture.test.mjs` : 6 OK / 0 FAIL ; sabotages : route commentée → vert, `Object.assign(ROUTES…)` → rouge | ✅ |
| Déploiement kdmc-uptime | vert + worker modifié | run 33979141313 **success 42 s** ; Cloudflare `modified_on` 16:51:43 ; annotations `Uploaded`, `Deployed`, `Current Version ID: 01950403…` | ✅ |
| Premier relevé réel (32 cibles annoncées → **31 réelles** après retrait d'`apex-v13-backend`) | tout vert | **26/32 OK — faux rouge, voir la note en bas** — 6 en panne : apex-secrets-proxy, kdmc-ais, kdmc-live, kdmc-rag, apex-v13-backend, apex-auth-worker (tous des workers) | 🟡 cause par cible lue au prochain smoke (annotations ajoutées) |
| Cron de la sonde | posé | `Workers Free limit of 5 cron triggers per account` (run 33978540250) → `crons = []`, réveil par kdmc-outlook (Service Binding) | ✅ contourné |
| Déploiement kdmc-rag | vert | run 33979141283 : `Authentication error [code: 10000]` sur `/vectorize/v2/indexes` → **droit Vectorize absent du jeton** | 🔴 action Kevin (1 clic) |
| PR #3652 | fusionnée | `main` 5c8a300 ; bloquée avant par `main` lui-même (7 × TS1117 dans `apex-plugins-catalog.ts`, réparé dans la PR) | ✅ |
| tsc `apex-ai/v13` | 0 erreur | `npx tsc --noEmit` → exit 0 | ✅ |
| `audit:improvements` (ratchet) | 0 hausse | 0 hausse ; `views_untested` 41 → 40 | ✅ |
| `audit:stability` | 0 FAIL | 0 FAIL 0 WARN (render 0, mutations topbar 24/12/0 sur 6 s) | ✅ |
| Gardes CI sur la branche | verts | pipefail, actions-conformes, destinations, no-pin-leak, depot-public-sain, secret-jamais-persiste, pipeline-sessions, docs-frais, no-conflicts | ✅ |
| Outlook `worker.test.mjs` | 6/6 | 6 pass / 0 fail | ✅ |
| SonarCloud PR #3652 | A | **C** : wrangler non épinglé + scripts d'installation → `wrangler@4 --ignore-scripts` | ✅ corrigé (à re-mesurer par Sonar) |
| Semgrep PR #3652 | 0 | « vulnerable patterns found » — détail illisible depuis la session | 🔴 non trié |
| `audit:clicks` (CMCteams, DOM réel hors-ligne) | 0 erreur JS | **79 vues, 1109 boutons exécutés, 0 erreur JS, 0 vue vidée** | ✅ |
| `test:a11y` (axe-core WCAG 2 AA : accueil, monplanning, rgpd, departs) | 0 critique | **0 critical / 0 serious / 0 moderate / 0 minor** | ✅ |
| `npm install` à la racine | passe | `Cannot read properties of null (reading 'edgesOut')` → passe avec `--legacy-peer-deps` (256 paquets, dry-run) — corrigé dans `audit-live.yml`, signalé à la session Départs (m032) | ✅ contourné |
| audit-live (vrai navigateur) | 0 bloquant sur 28 surfaces | déclenché par le push 4c4a469 — résultat dans `05-JOURNAL.md` | ⏳ |


> 📌 **RÉSOLU LE 6.09.2026** — les « 6 workers en panne » du premier relevé n'étaient PAS une panne :
> un Cloudflare Worker **ne peut pas joindre une URL `*.workers.dev` du MÊME compte** (la requête ne
> sort jamais du réseau Cloudflare → 404 en 10-21 ms). C'était l'observateur, pas les cibles.
> Correctifs appliqués : `apex-v13-backend` **retiré** de `WORKERS` (il n'existe pas sur le compte) →
> la sonde couvre **31 cibles** (26 adresses du domaine + 5 workers), pas 32 ; et la santé des workers
> est désormais mesurée **depuis le runner CI** (`deploy-kdmc-uptime.yml`), qui lui a le réseau ouvert.
