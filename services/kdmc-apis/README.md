# kdmc-apis — Passerelle "APIs gratuites" du domaine kd-mc.com

**Une passerelle → toutes les apps (présentes + futures) héritent des mêmes capacités
gratuites, sans recâbler chaque app.** Clés côté serveur (jamais dans le navigateur),
origines de confiance uniquement.

- Worker : [`worker.js`](./worker.js) · Config : [`wrangler.toml`](./wrangler.toml) · Tests : [`worker.test.mjs`](./worker.test.mjs)
- URL domaine : `https://apis.kd-mc.com` · Fallback : `https://kdmc-apis.9r4rxssx64.workers.dev`
- Déploiement : [`.github/workflows/deploy-kdmc-apis.yml`](../../.github/workflows/deploy-kdmc-apis.yml)
- Client apps : [`tools/shared/free-apis-client.js`](../../tools/shared/free-apis-client.js)
- Config apps : [`tools/shared/free-apis-config.json`](../../tools/shared/free-apis-config.json)

## Routes

| Route | Auth | Clé requise | Fait |
|---|---|---|---|
| `GET /health` | aucune | — | État + quelles clés sont chargées |
| `GET /weather?lat&lon&days` | publique | — | Météo Open-Meteo (affluence casino) |
| `GET /holidays?year&country` | publique | — | Jours fériés Nager.Date (FL/CFL auto) |
| `GET /fx?from&to&amount` | publique | — | Taux de change BCE Frankfurter |
| `GET /geo?q&limit` | publique | — | Géocodage Nominatim (OSM) |
| `GET /geoip` | publique | — | Géoloc par IP (ipwho.is) |
| `GET /time?tz` | publique | — | Heure/fuseau timeapi.io |
| `GET /translate?q&from&to` | publique | — | Traduction MyMemory (RGPD) |
| `GET /wiki?title&lang` | publique | — | Résumé Wikipedia |
| `GET /pwned?prefix` | publique | — | Pwned Passwords (k-anonymity) |
| `GET /entreprise?q` | publique | — | Recherche entreprise FR (SIREN/SIRET) |
| `GET /adresse?q` | publique | — | Autocomplete adresse FR (BAN) |
| `GET /iban?value` | publique | — | Validation IBAN (openiban) |
| `GET /vat?country&number` | publique | — | Validation TVA UE (VIES) |
| `GET /crypto?ids&vs` | publique | — | Prix crypto CoinGecko (keyless) |
| `POST /ai` | origine | aucune requise* | Chat IA failover + **Workers AI** |
| `GET\|POST /search?q` | origine | TAVILY / BRAVE | Recherche web |
| `GET /finance?symbol` | origine | FINNHUB | Cours bourse |
| `GET /images?q` | origine | PEXELS | Photos |
| `GET /printify/<path>` | origine | PRINTIFY | Catalogue print-on-demand |

**Auth "origine"** = l'en-tête `Origin` doit être `*.kd-mc.com`, `9r4rxssx64.github.io`
ou `localhost` (le navigateur force cet en-tête, non falsifiable en JS front). Les routes
publiques (déjà gratuites/anonymes) tolèrent `*`.

**Fail-open** : une route dont la clé manque renvoie `501` clair — jamais de crash.

*\* `/ai` a un **fallback Cloudflare Workers AI** (binding `env.AI`, `wrangler.toml [ai]`) :
l'IA répond **sans aucun compte provider externe ni KYC** — juste ton compte Cloudflare.
Chaîne complète : GEMINI → GROQ → OPENROUTER → MISTRAL → COHERE → … → **Workers AI**.

## Sécurité (règle SÉCURITÉ MAXIMALE PARTOUT)

- Clés uniquement en secrets Cloudflare (posés par le workflow depuis les secrets GitHub).
- Préflight `OPTIONS` traité avant toute auth (leçon #95) ; CORS avec liste d'en-têtes explicite.
- Erreurs détaillées `{error, detail, status}` (règle "cause exacte partout").
- Keyless = simple relais de l'upstream, aucune donnée inventée (reproduction fidèle).

## Ajouter une nouvelle app

Rien à recâbler côté passerelle : l'app charge `free-apis-client.js` + appelle `KdmcApis.*`.
Son `Origin` `*.kd-mc.com` est déjà de confiance → elle hérite de tout immédiatement.
