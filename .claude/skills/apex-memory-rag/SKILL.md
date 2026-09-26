---
name: apex-memory-rag
description: >
  Mémoire intelligente (RAG) d'Apex — worker Cloudflare kdmc-rag (Workers AI embeddings
  bge-m3 multilingue + Vectorize). Apex mémorise les messages et retrouve les souvenirs
  pertinents pour les injecter dans le prompt. Installé 2026-07-07 (« fais la mémoire Apex »).
---

# Apex Memory RAG — mémoire long terme sémantique

`services/kdmc-rag/` (worker, SANS Durable Object — leçons #132/#133) + client Apex
`services/ai/apex-memory-rag.ts`. Embeddings **dans le worker** (`@cf/baai/bge-m3`,
multilingue → FR, 1024 dims) = **aucune clé externe** ; vecteurs dans **Vectorize**
(index `apex-memory`, compte Cloudflare de Kevin).

## Endpoints worker (auth x-apex-pin = SHA-256 du PIN admin)
- `GET /health` → `{ok, hasVec, hasAI, model, dims}`
- `POST /upsert` `{items:[{id,text,meta?}]}` → embed + stocke
- `POST /query` `{text, topK?}` → embed + recherche → `{matches:[{id,score,text,meta}]}`
- `POST /forget` `{ids}` → supprime

## Côté Apex (client)
- `apexMemoryRag.remember(text, meta?)` — appelé auto à chaque message (autoExtractAndLearn)
- `apexMemoryRag.recall(query)` / `recallBlock(query)` — injecté dans le prompt (chat-engine)
- **FLAG `apex_v13_rag_enabled` (défaut OFF)** : tant qu'il est OFF, tout est no-op → 0
  impact. **FAIL-OPEN total** : worker absent/KO → Apex marche comme avant. Timeout court
  (≤2.5 s) dans le chemin du prompt.

## Déploiement (dispatch)
```
mcp__github__actions_run_trigger  method: run_workflow  workflow_id: deploy-kdmc-rag.yml  ref: main
```
Crée l'index Vectorize (idempotent) + pousse le secret `APEX_ADMIN_PIN_SHA256` + déploie
+ smoke `/health` (prouve hasVec:true). ⚠️ Vectorize doit être dispo sur le compte (comme
les DO ont été refusés, leçon #132) — sinon le smoke le dit, Apex reste fail-open.

## Activation (après déploiement + /health vert)
`localStorage.setItem('apex_v13_rag_enabled','true')` sur l'appareil → Apex commence à
mémoriser + rappeler. Désactiver = `'false'`.

## Sécurité
- Auth PIN obligatoire (mémoire perso), clé jamais exposée, URL = sous-domaine du COMPTE
  (`kdmc-rag.9r4rxssx64.workers.dev`, leçon #85), CORS whitelist kd-mc.com.
