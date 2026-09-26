# Apex AI / CMCteams — Backend Pro (FastAPI)

Passage de l'architecture **PWA single-file** à une architecture **pro multi-tier** :

```
┌───────────────────┐      ┌────────────────────┐      ┌───────────────┐
│  PWA (existant)   │─────▶│  FastAPI Backend   │─────▶│  Anthropic    │
│  Apex + CMCteams  │      │  (Python)          │      │  OpenAI fallb │
│  (React-like JS)  │◀─────│                    │      │  GitHub API   │
└───────────────────┘      │  + Auth JWT        │      │  EmailJS/Send │
                           │  + Rate limit      │      └───────────────┘
                           │  + Multi-provider  │      ┌───────────────┐
                           │  + PDF parsing     │─────▶│  Supabase PG  │
                           │  + Pinecone vector │      │  (users, msg) │
                           │  + Job queue       │      └───────────────┘
                           └────────────────────┘      ┌───────────────┐
                                   │                    │  Pinecone     │
                                   └───────────────────▶│  (KB vectors) │
                                                        └───────────────┘
```

## Pourquoi ?

Les problèmes actuels qui disparaissent avec cette archi :

| Problème | Cause actuelle | Solution backend |
|----------|----------------|------------------|
| Safari PWA CORS GitHub | Navigateur bloque cross-origin | Backend fait les appels côté serveur |
| Stockage plein (5 MB localStorage) | Tout en local | Postgres côté serveur |
| PAT exposé côté client | PAT dans Vault JS | Secret côté serveur uniquement |
| Parser cadres PDF fragile (5/6 échec) | Regex JS + PDF.js | PyPDF2 + Claude Vision |
| IA single-provider | Direct Anthropic | Fallback OpenAI/Gemini/Mistral |
| Scalabilité (100 users max) | 1 MB cumulé/user | Serveur sans limite |

## Stack

- **Python 3.11** + **FastAPI** (async, rapide, docs auto)
- **Supabase** (Postgres managed + auth JWT)
- **Pinecone** (vector DB pour KB sémantique)
- **Anthropic SDK** + **OpenAI SDK** (multi-provider)
- **PyPDF2** + **pandas** (parsing PDF robuste)
- **Redis** (optionnel : rate limit + job queue)

## Hébergement recommandé

- **Railway.app** ($5/mois starter) — deploy en 1 clic depuis GitHub
- **Fly.io** (free tier 3 VMs) — idéal pour MVP
- **Render.com** (free tier) — backup

## Phases de migration (non-destructif)

1. **Phase 1 — Deploy backend + endpoint `/github-proxy`** (1 j) — résout CORS iOS PWA immédiatement
2. **Phase 2 — Endpoint `/chat`** (2 j) — PAT Anthropic côté serveur, fallback OpenAI
3. **Phase 3 — Endpoint `/pdf-parse`** (3 j) — parser cadres robuste via PyPDF2 + Claude Vision
4. **Phase 4 — Supabase migration** (1 sem) — data user/messages vers Postgres
5. **Phase 5 — Pinecone KB** (1 sem) — mémoire sémantique vectorielle
6. **Phase 6 — Auth JWT + multi-tenant** (1 sem) — architecture B2B SaaS

## Coûts cibles

- Railway : $5-20/mois
- Supabase Pro : $25/mois (500 MB storage + 2 GB bandwidth)
- Pinecone : gratuit (1 index, 100k vectors)
- Anthropic API : variable selon usage (~200-500 €/mois à 500 users)
- **Total** : ~250-550 €/mois à 500 users (vs ~0-50 actuellement à 50 users max)

## Structure des fichiers

```
tools/backend/
├── README.md                 # Ce fichier
├── requirements.txt          # Dépendances Python
├── main.py                   # Entry point FastAPI
├── routes/
│   ├── github.py             # Proxy GitHub API
│   ├── chat.py               # Multi-provider AI chat
│   ├── pdf.py                # Parser PDF cadres
│   ├── auth.py               # JWT auth
│   └── subscription.py       # Gestion abonnements
├── services/
│   ├── anthropic_client.py   # Wrapper Anthropic
│   ├── openai_client.py      # Fallback OpenAI
│   ├── pinecone_client.py    # Vector KB
│   └── supabase_client.py    # Postgres ORM
├── models/
│   └── schemas.py            # Pydantic models
└── tests/
    └── test_routes.py        # Tests pytest
```

Voir chaque fichier pour le code.
