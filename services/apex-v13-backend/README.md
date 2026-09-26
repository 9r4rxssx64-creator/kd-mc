# Apex v13 Backend Worker

Cloudflare Worker pour Apex v13 PWA — endpoints serveur sécurisés.

## Endpoints

| Endpoint | Méthode | Usage |
|---|---|---|
| `/health` | GET | Healthcheck (no auth) |
| `/idempotency/check` | POST | Déduplication atomique writes Firebase (60s TTL serveur) |
| `/webauthn/register` | POST | Stocke credential FaceID/TouchID après enroll client |
| `/webauthn/verify` | POST | Vérifie signature WebAuthn + counter anti-replay |
| `/stripe/webhook` | POST | Webhook Stripe avec signature HMAC SHA-256 |
| `/auth/verify` | GET | Validation token session côté serveur |
| `/escalate` | POST | Capture critical events Apex côté serveur (TTL 7j) |
| `/ai/judge` | POST | LLM judge Claude Haiku pour vraie hallucination detection |

## Setup (1 fois par Kevin)

### 1. Créer compte Cloudflare + installer Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Créer KV namespaces

```bash
cd services/apex-v13-backend
wrangler kv:namespace create "IDEMPOTENCY"
wrangler kv:namespace create "RATE_LIMIT"
wrangler kv:namespace create "WEBAUTHN"
wrangler kv:namespace create "SESSIONS"
wrangler kv:namespace create "STRIPE_EVENTS"
wrangler kv:namespace create "ESCALATIONS"
```

Copier les IDs retournés dans `wrangler.toml` (remplacer `REPLACE_AFTER_CREATE`).

### 3. Push secrets

```bash
wrangler secret put STRIPE_WEBHOOK_SECRET    # ton secret webhook Stripe (whsec_...)
wrangler secret put ANTHROPIC_KEY              # clé Anthropic pour AI judge
```

### 4. Deploy

```bash
wrangler deploy
```

URL générée (par défaut) : `https://apex-v13-backend.<your-account>.workers.dev`

### 5. Configurer Apex client

Dans Apex v13 → Coffre, coller URL Worker dans `ax_apex_v13_backend_url`.

## Sécurité

- CORS strict (origin Apex Pages uniquement)
- Rate-limit 100 req/IP/10min via KV
- Secrets via `wrangler secret put` (jamais dans code)
- Pas de logs sensibles (DSN, tokens redactés)
- Stripe signature HMAC SHA-256 vérifiée
- WebAuthn counter monotone (anti-replay)

## Coût Cloudflare Free Tier

- Workers : 100k req/jour gratuit
- KV : 100k reads/jour, 1k writes/jour
- Pour Apex v13 famille (Kevin + Laurence + 5-10 trust) : largement sous quota.
- Pour commerce public : passer Cloudflare Workers Paid ($5/mois) si > 100k req/jour.

## Sans backend (fallback PWA pure)

Apex v13 fonctionne TOTALEMENT sans backend pour Kevin/Laurence/famille (admin bypass, vault local AES-GCM 256, WebAuthn client-only). Le backend ajoute :
- Vraie atomicité Firebase
- WebAuthn server-side validation (vs client trustable)
- Stripe webhooks réels (commerce ON public)
- LLM judge sémantique

Si commerce OFF + famille uniquement → backend optionnel.
