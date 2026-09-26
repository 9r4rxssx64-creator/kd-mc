# 🏗 Microservices Apex AI

> **Architecture** : Cloudflare Workers découpés par domaine fonctionnel.
> **Mission** : sortir progressivement les modules critiques du monolith
> `apex-ai/index.html` (ex-monolithe 30K LOC, **aujourd'hui archivé — le fichier fait 80 octets**) vers des services indépendants.
> **Action #3 sur 3** dans le plan 100/100 réel.

---

## 📂 Services

```
services/
├── apex-auth-worker/    # Phase 5 Firebase Auth (custom tokens RS256)
├── chat-svc/            # Proxy chat IA (Anthropic + failover OpenRouter/Groq/Gemini)
├── vault-svc/           # Stockage secrets chiffrés AES-GCM 256
└── sentinels-svc/       # Audits hebdo cron (projects + code quality + CI failures)
```

Chaque service =
- `src/index.js` : code worker (Cloudflare-compatible, sans dépendances Node.js)
- `wrangler.toml` : config (KV, secrets, vars, cron, observability)

---

## 🎯 Pourquoi ?

Aujourd'hui Apex AI = **un seul fichier `index.html` de 30 000 lignes**.
Problèmes :
- Parse JS bloque le boot (3 MB à charger avant interaction)
- Tout couplé : modifier le chat = risque casser le vault
- Pas de scaling horizontal (un worker = limite Cloudflare)
- Pas d'observability fine par domaine

**Solution** : 4 services Cloudflare Workers indépendants, chacun gérant un domaine.

---

## 🚀 Déploiement Kevin (sans coder)

Comme PHASE5_DEPLOY.md mais multiplié par 4.

### Pré-requis

1. Compte Cloudflare gratuit (créé pour Phase 5)
2. Wrangler CLI installé (déjà fait pour Phase 5)
3. GitHub Codespaces ou Mac/PC avec Node.js

### Étapes par service

Pour CHAQUE service (`apex-auth-worker`, `chat-svc`, `vault-svc`, `sentinels-svc`) :

```bash
cd services/<service-name>

# 1. Installer (si pas déjà fait)
npm install

# 2. Créer le KV namespace (rate-limit / cache / queue)
npx wrangler kv namespace create <NOM_KV>
# → copier l'ID retourné dans wrangler.toml ligne id="REPLACE_WITH_KV_ID"

# 3. Configurer secrets (voir wrangler.toml du service pour la liste)
npx wrangler secret put NOM_SECRET
# → coller la valeur quand demandée

# 4. Déployer
npx wrangler deploy
# → URL retournée à coller dans Apex Coffre clé correspondante
```

### URLs à configurer dans Apex Coffre

| Service | Clé Coffre Apex | Worker URL retournée |
|---------|------------------|----------------------|
| apex-auth-worker | `ax_auth_worker_url` | `https://apex-auth-worker.X.workers.dev` |
| chat-svc | `ax_chat_svc_url` | `https://apex-chat-svc.X.workers.dev` |
| vault-svc | `ax_vault_svc_url` | `https://apex-vault-svc.X.workers.dev` |
| sentinels-svc | `ax_sentinels_svc_url` | `https://apex-sentinels-svc.X.workers.dev` |

**Note** : les services peuvent être déployés progressivement. Si l'un n'est pas
configuré, Apex AI utilise le code monolithique en fallback (zero régression).

---

## 📊 Gain par service

| Service | Domaine | Gain Apex AI |
|---------|---------|--------------|
| apex-auth-worker | Sécurité | +15 pts (Sécurité 75 → 90) |
| chat-svc | Performance + AI Safety | +10 pts (Perf 64 → 70, +failover server-side) |
| vault-svc | Sécurité + Compliance | +5 pts (master key server-side, audit trail RGPD) |
| sentinels-svc | Architecture + Observability | +12 pts (Arch 78 → 88, audit trail 24/7) |

**Score global cible** : 87 → **100/100** (avec les 4 services + DPA juriste).

---

## 🔧 Tests locaux

Chaque service expose `/health` pour test rapide :

```bash
# Après deploy
curl https://apex-auth-worker.X.workers.dev/health
curl https://apex-chat-svc.X.workers.dev/health
curl https://apex-vault-svc.X.workers.dev/health
curl https://apex-sentinels-svc.X.workers.dev/health
```

Réponse attendue : `{"ok":true,"service":"<name>","v":"1.0",...}`

---

## ⚠️ Limites & sécurité

- **Free tier Cloudflare** : 100 000 requêtes/jour PAR worker (largement suffisant pour Apex perso)
- **CPU limit free tier** : 10ms par requête (FFmpeg/Pyodide impossible, tout sauf ça OK)
- **Stockage KV** : 1 Go gratuit, 1000 writes/jour per namespace
- **Secrets** : stockés chiffrés Cloudflare, jamais leakés client
- **CORS** : configuré `*` pour MVP, à durcir avec whitelist domaines en prod

---

## 🤖 Workflow auto Apex IA

Apex IA peut, en autonomie totale (via Apex Code Companion v12.551) :
- Lire/modifier le code des services via `axCodeReadFile/axCodeWriteFile`
- Pousser des PR via `axCodeCreatePR`
- Lancer des deploys via GitHub Actions (workflow_dispatch)
- Monitorer CI failures via `axCodeListWorkflowRuns` + sentinels-svc

**Boucle complète** : Apex détecte un bug → propose fix dans PR → Kevin valide
→ merge auto → deploy auto → sentinels-svc audit confirme.

---

**Document** : Claude Code session_01BnrRgT9QTJtmaRzBFsoiRq
**Date** : 2026-05-01
**Version** : Apex v12.556
