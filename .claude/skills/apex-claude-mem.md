---
name: apex-claude-mem
description: Memoire cross-session augmentee. Apex retient TOUT entre conversations, devices, sessions — Kevin Laurence clients employes.
when_to_use: Auto-active a chaque message user. Apex extrait facts + lecons + preferences automatiquement.
model: sonnet
allowed_tools: [persistent_memory_add, persistent_memory_search, lessons_record]
---

# Skill : apex-claude-mem

## Mission

Apex doit **TOUJOURS** se souvenir de tout (Kevin + Laurence + amis + famille + clients + employes CMCteams). Inspire de `claude-mem` (memoire cross-sessions Anthropic ecosystem).

**Triple persistence** :
- Layer 1 : `localStorage` `apex_v13_persistent_memory_<uid>` (5000 entries cap)
- Layer 2 : IndexedDB shadow copy (survit cache clear)
- Layer 3 : Firebase `/apex/persistent_memory_<uid>/` (cross-device sync)

## Extraction auto a CHAQUE message user

`extractFactsFromMessage(text, userId)` detecte :

- **Anniversaires** : "mon anniv le 12 mai" → `{category:profile, text:'Anniv: 12 mai', importance:80}`
- **Age** : "j'ai 35 ans"
- **Allergies** : "je suis allergique a X" → importance 95 (critique sante)
- **Preferences** : "j'aime/je deteste/je prefere"
- **Relations** : "ma femme/mari/enfant/collegue X"
- **Lieu** : "j'habite a Y"
- **Metier** : "je suis [X]"
- **Projets** : "je travaille sur Y"

## INTERDICTIONS strictes (forbidden patterns)

NE JAMAIS extraire ni stocker :
- Cartes bancaires completes (CB + CVV)
- Tokens API (`sk-ant-`, `ghp_`, etc.)
- Seed phrases (12 mots BIP39)
- Mots de passe en clair

## Apex admin (Kevin) = savoir cross-user

`buildAdminCrossUserKnowledge()` aggrege facts/lessons de TOUS les users → injecte top 30 dans system prompt Kevin admin. Permet "Apex, qu'est-ce que tu sais de Laurence ?" → Apex repond avec contexte complet.

## Lessons learned cross-app

`ax_lessons_learned_struct` (Firebase FB_FIX partage) :
- Apex apprend → push lesson → CMCteams herite
- CMCteams apprend → push lesson → Apex herite
- Cap 200 + dedup similarity 85%

## Importance scoring (0-100)

Apex priorise retention si overflow :
- 95-100 : critique sante (allergies, conditions medicales)
- 80-94 : profil dur (anniv, lieu, metier)
- 60-79 : preferences fortes
- 40-59 : preferences faibles
- 20-39 : facts contextuels
- 0-19 : noise, garbage-collect d'abord

## Output recall

`getRelevantFactsForContext(currentText, userId)` retourne top N facts pertinents au message courant via cosine similarity (embeddings legers).

## Anti-patterns

1. **Demander a Kevin "qui es-tu ?"** apres login → BUG, sentinelle `never-forget-watch` alerte
2. **Stocker secrets en memoire** → INTERDIT, FORBIDDEN patterns gates
3. **Memoire globale sans scope user** → INTERDIT, toujours `<uid>`
4. **Oublier facts > 7 jours** → INTERDIT, cap par importance pas par age
5. **Sync Firebase plaintext sensible** → chiffrer si flag `sensitive=true`

## References

- claude-mem (Anthropic ecosystem)
- mempalace (alternative open-source)
- Pattern Apex : `apex-ai/v13/services/storage/persistent-memory-store.ts`
- Vue admin : `?view=knowledge`
- Sentinelle : `never-forget-watch` (1×/h)
