---
name: compact-memory
description: >
  Mémoire compacte à récupération (Claude Code + Apex) — un magasin illimité de faits durables
  dont on ne charge QUE les 3-5 lignes pertinentes à la demande (recherche par mots-clés BM25-lite,
  0 clé, 0 réseau, 0 token, 0 embedding). Créée 2026-07-10 (Kevin « augmente au max ta mémoire en
  consommant le minimum »). Utiliser en début de tâche pour rappeler le contexte durable au lieu de
  recharger de gros documents.
---

# Compact Memory — mémoire max, conso min

Le problème : recharger un gros CLAUDE.md à chaque message coûte cher. La solution : stocker les
faits durables dans un magasin séparé et n'en injecter que le strict pertinent, à la demande.

## AUTO (Kevin 2026-07-10 « tout auto, que tu t'en serves auto »)

- **Claude Code** : le hook `.claude/hooks/mem-context.sh` (SessionStart) injecte les 12 faits
  les plus importants dans mon contexte à CHAQUE session — je m'en sers sans le chercher.
  Réflexe : `search "<sujet>"` avant une tâche ; `add "<fait>" --imp N` après une décision durable,
  puis `export-apex` + commit pour qu'Apex l'ait aussi.
- **Apex** : flag `apex_v13_compact_mem` **ON par défaut** (gratuit → aucune raison de l'éteindre) ;
  débrayable dans Réglages. `recallBlock` injecte les faits pertinents à chaque message.

## Côté Claude Code (CLI, `tools/memory/mem.cjs`)

Node pur, **aucune dépendance, aucune clé, aucun réseau** → coût nul.

```
node tools/memory/mem.cjs add "fait" --tags a,b --imp 80   # mémoriser (anti-doublon)
node tools/memory/mem.cjs search "requête" --k 5           # rappeler (top-k pertinents)
node tools/memory/mem.cjs recent 10 | stats                # récents / statistiques
node tools/memory/mem.cjs export-apex                       # régénère apex-memory.json pour Apex
```

Store = `tools/memory/store.jsonl` (append-only, versionné git, 1 fait/ligne).
**Réflexe** : au début d'une tâche, `search "<sujet>"` pour récupérer le contexte durable en
quelques lignes au lieu de relire de gros fichiers. Après une décision/leçon importante, `add`.
**Toujours** relancer `export-apex` après des `add` pour qu'Apex voie les nouveaux faits, puis commit.

## Côté Apex (`services/ai/compact-memory.ts`)

Jumeau navigateur : `fetch` le JSON public `tools/memory/apex-memory.json` via GitHub raw (sans
clé), même recherche BM25-lite locale. `compactMemory.recallBlock(text)` injecte les faits
pertinents dans le system prompt (wired dans `chat-engine.ts`, à côté du RAG).

- **FLAG `apex_v13_compact_mem` (défaut OFF)** → tant qu'il est OFF : no-op, 0 impact.
- Toggle 1-tap : Réglages → « Mémoire externe » → **« Mémoire compacte »**.
- **FAIL-OPEN** total (JSON absent/KO → Apex marche comme avant), cache localStorage 6 h.

## Différence avec apex-memory-rag (les deux coexistent)

| | compact-memory | apex-memory-rag |
|---|---|---|
| Recherche | mots-clés (BM25-lite) | sémantique (embeddings bge-m3) |
| Coût | **0** (local, sans clé) | Workers AI + Vectorize |
| Source | faits durables curés (git) | échanges mémorisés auto |

compact-memory = socle gratuit de faits stables ; RAG = mémoire épisodique riche. Complémentaires.
