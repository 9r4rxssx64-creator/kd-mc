# Guide déploiement backend Apex (30 min)

## Option A — Railway (recommandé, 5€/mois)

### Étape 1 — Créer compte Railway
1. Va sur https://railway.app
2. Sign up avec GitHub
3. Connecte ton repo `9r4rxssx64-creator/CMCteams`

### Étape 2 — New Project
1. **New Project** → **Deploy from GitHub repo**
2. Sélectionne `CMCteams`
3. **Root Directory** : `tools/backend`
4. **Start Command** : `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Étape 3 — Variables d'environnement
Onglet **Variables** → ajoute chaque ligne du `.env.example` :
- `ANTHROPIC_API_KEY` = ta clé Anthropic
- `OPENAI_API_KEY` = ta clé OpenAI (optionnel fallback)
- `GITHUB_PAT` = ton PAT GitHub
- `JWT_SECRET` = une chaîne random 32+ chars (ex: générée via `openssl rand -hex 32`)
- `ALLOWED_ORIGINS` = `https://9r4rxssx64-creator.github.io`

### Étape 4 — Deploy
- Railway build automatique ~2 min
- Récupère l'URL (ex: `https://apex-backend-production.up.railway.app`)

### Étape 5 — Tester
```
curl https://apex-backend-production.up.railway.app/health
# {"status":"ok"}

curl https://apex-backend-production.up.railway.app/api/github/read?path=README.md
```

### Étape 6 — Connecter Apex
Dans Apex → Coffre → nouvelle clé `ax_backend_url` → colle l'URL Railway → OK.

Apex utilisera le backend pour tous les appels GitHub / Chat au lieu de direct.

---

## Option B — Fly.io (free tier, 3 VMs)

```bash
cd tools/backend
flyctl launch
flyctl secrets set ANTHROPIC_API_KEY=sk-ant-XXX
flyctl secrets set GITHUB_PAT=github_pat_XXX
flyctl deploy
```

---

## Option C — Render.com (free tier)

1. https://render.com → New Web Service
2. Connect GitHub repo `CMCteams`
3. **Root Directory** : `tools/backend`
4. **Build Command** : `pip install -r requirements.txt`
5. **Start Command** : `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Env variables : idem Railway

---

## Setup Supabase (Phase 2, optionnel)

1. https://supabase.com → New project (free tier 500 MB)
2. Crée la table `users` :
   ```sql
   create table users (
     id uuid primary key default gen_random_uuid(),
     email text unique not null,
     pin_hash text,
     plan text default 'trial',
     created_at timestamp default now(),
     approved_at timestamp
   );
   ```
3. Copie l'URL + keys dans Railway env vars.

---

## Setup Pinecone (Phase 5, optionnel)

1. https://pinecone.io → Create index
2. **Name** : `apex-kb`
3. **Dimensions** : 1024 (Voyage AI) ou 1536 (OpenAI)
4. **Metric** : cosine
5. Free tier : 1 index, 100k vectors
6. Copie API key dans env vars.

---

## Post-déploiement

- Voir logs Railway → onglet **Deployments** → Logs
- Docs API auto : `https://your-url/docs` (Swagger UI)
- Santé : `/health`

En cas de souci → logs Railway te disent tout.
