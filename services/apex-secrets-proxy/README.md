# apex-secrets-proxy — Cloudflare Worker

Le code source de ce worker est **généré in-line** par le workflow
[`.github/workflows/sync-apex-secrets-to-cf-worker.yml`](../../.github/workflows/sync-apex-secrets-to-cf-worker.yml).

## Pourquoi pas de source dans le repo ?

Le worker n'a pas de logique métier propre — il agit comme proxy sécurisé
entre Apex et 20+ APIs externes (Anthropic, OpenAI, Groq, Gemini, etc.).
Le YAML du workflow définit la totalité du proxy : map des providers, auth
PIN, build URL, headers, etc. Tout est dans un seul fichier auditable.

Avantages :
- Source unique de vérité (`PROXY_MAP` + auth + dispatch dans le YAML)
- Pas de drift code repo / code Cloudflare
- Re-déploiement = re-run du workflow (push to main + paths trigger)

## Re-déploiement

Le workflow se déclenche automatiquement sur `push to main` si l'un de
ces paths change :
- `.github/workflows/sync-apex-secrets-to-cf-worker.yml`
- `services/apex-secrets-proxy/**` (ce dossier)

Ou manuellement via `workflow_dispatch` depuis l'onglet Actions GitHub.

## Authentification

Chaque requête vers `/<provider>/...` (sauf `/health`) doit fournir le header
`x-apex-pin` contenant le SHA-256 du PIN admin Kevin. Cf. variable d'env
worker `APEX_ADMIN_PIN_SHA256` (settable via Cloudflare dashboard ou
`wrangler secret put`).

## Health check

`GET https://apex-secrets-proxy.desarzens-kevin.workers.dev/health`

Retourne `{ ok, proxy, available_providers, total }`. Aucune auth requise.
Utilisé par Apex `services/admin/vault-diagnostic.ts` (v13.4.261+) pour
afficher l'état du proxy à Kevin dans la vue Coffre.

## Règle sécu Kevin 2026-05-23

> « Le niveau secu doit être poussé sur tous les projet pareil. Maximal.
> Personne ne doit pouvoir se connecter ou modifier etc mes app, code etc »

Ce worker fait partie du périmètre sécu MAX. Cf. règle ABSOLUE CLAUDE.md
« SÉCURITÉ MAXIMALE PARTOUT, TOUS PROJETS ».
