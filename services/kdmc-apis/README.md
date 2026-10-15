# kdmc-apis — Passerelle "APIs gratuites" du domaine kd-mc.com

**Une passerelle → toutes les apps (présentes + futures) héritent des mêmes capacités
gratuites, sans recâbler chaque app.** Clés côté serveur (jamais dans le navigateur),
**compte du domaine obligatoire sur toute route** (15.10.2026, règle « aucune consultation sans compte »).

- Worker : [`worker.js`](./worker.js) · Config : [`wrangler.toml`](./wrangler.toml) · Tests : [`worker.test.mjs`](./worker.test.mjs), [`compte-obligatoire.test.mjs`](./compte-obligatoire.test.mjs)
- URL domaine : `https://apis.kd-mc.com` · Fallback : `https://kdmc-apis.9r4rxssx64.workers.dev`
- Déploiement : [`.github/workflows/deploy-kdmc-apis.yml`](../../.github/workflows/deploy-kdmc-apis.yml)
- Client apps : [`tools/shared/free-apis-client.js`](../../tools/shared/free-apis-client.js)
- Config apps : [`tools/shared/free-apis-config.json`](../../tools/shared/free-apis-config.json)

## Routes

| Route | Auth | Clé requise | Fait |
|---|---|---|---|
| `OPTIONS *` | aucune | — | Préflight CORS |
| `GET /health` | aucune | — | `{ok:true}` (sonde) ; le détail (clés, routage IA) pour Kevin seul |
| `GET /weather?lat&lon&days` | compte | — | Météo Open-Meteo (affluence casino) |
| `GET /holidays?year&country` | compte | — | Jours fériés Nager.Date (FL/CFL auto) |
| `GET /fx?from&to&amount` | compte | — | Taux de change BCE Frankfurter |
| `GET /geo?q&limit` | compte | — | Géocodage Nominatim (OSM) |
| `GET /geoip` | compte | — | Géoloc par IP (ipwho.is) |
| `GET /time?tz` | compte | — | Heure/fuseau timeapi.io |
| `GET /translate?q&from&to` | compte | — | Traduction MyMemory (RGPD) |
| `GET /wiki?title&lang` | compte | — | Résumé Wikipedia |
| `GET /pwned?prefix` | compte | — | Pwned Passwords (k-anonymity) |
| `GET /entreprise?q` | compte | — | Recherche entreprise FR (SIREN/SIRET) |
| `GET /adresse?q` | compte | — | Autocomplete adresse FR (BAN) |
| `GET /iban?value` | compte | — | Validation IBAN (openiban) |
| `GET /vat?country&number` | compte | — | Validation TVA UE (VIES) |
| `GET /crypto?ids&vs` | compte | — | Prix crypto CoinGecko (keyless) |
| `POST /ai` | compte + origine | aucune requise* | Chat IA failover + **Workers AI** |
| `GET\|POST /search?q` | compte + origine | TAVILY / BRAVE | Recherche web |
| `GET /finance?symbol` | compte + origine | FINNHUB | Cours bourse |
| `GET /images?q` | compte + origine | PEXELS | Photos |
| `GET /printify/<path>` | compte + origine | PRINTIFY | Catalogue print-on-demand |

**Auth "compte"** = le laissez-passer du domaine (le même que le routeur), lu dans
`Authorization: Bearer <jeton>`, `x-kdmc-sso` ou le cookie `kdmc_sso` (envoyer `credentials:'include'`).
Vérifié par `compteVerifie` : signature, expiration, appareil, révocation, Face ID de Kevin, code obligatoire.
Sans compte : `401 {ok:false, error:'compte_requis', detail}`. **"origine"** en plus sur les routes à clé :
`Origin` = `*.kd-mc.com`, Pages ou `localhost` (défense en plus — seul, il se falsifie hors navigateur).
CORS : l'origine exacte + `Access-Control-Allow-Credentials: true`, jamais `*`.

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
Elle envoie le laissez-passer du domaine (cookie + Bearer) : son utilisateur connecté hérite de tout immédiatement.
