---
name: apex-context-mode
description: Toggle compression contexte Apex IA (top 30 msgs vs full 100). Optimise tokens consumption + latence.
when_to_use: Sessions longues > 50 messages, ou Kevin force "compact mode" via toggle Reglages.
model: sonnet
allowed_tools: []
---

# Skill : apex-context-mode

## Mission

Apex peut basculer entre 2 modes de contexte :
- **Full** (defaut) : 100 derniers messages + system prompt complet (~30k tokens)
- **Compact** : top 30 messages les plus pertinents + system prompt allege (~12k tokens)

Permet de prolonger sessions tres longues sans context overflow.

## Selection auto

`compact` recommande si :
- > 50 messages dans la conversation courante
- Tokens estimes > 25k input
- Mobile iPhone Safari (RAM limitee)

`full` reste defaut si :
- Conversation < 30 msgs
- Question complexe necessitant tout le contexte
- Admin Kevin explicitement (verbosite max)

## Selection des messages dans compact mode

Algorithm `pickTopRelevantMessages(messages, currentText, n=30)` :
1. Toujours inclure les 5 derniers messages (continuite)
2. Toujours inclure le 1er message (intent original session)
3. Pour les 24 restants : cosine similarity avec `currentText` (embeddings legers)
4. Tri par recency + similarity (50/50)

## Reduction system prompt

Mode compact retire :
- Top 50 facts → top 20 (importance >= 70)
- Lessons learned → top 5 (severity critical only)
- Sentinelles details → liste compacte
- Tools list → top 15 plus utilises (analytics)

## Anti-patterns

1. **Compact mode si conv courte** → INTERDIT, force full
2. **Drop user messages cruciaux** (allergies, anniv) → toujours preserve importance >= 80
3. **Mode change pendant streaming** → INTERDIT, attendre fin

## References

- Pattern : `apex-ai/v13/core/memory.ts` `buildSystemPromptCompact()` (a creer)
- Toggle UI : Reglages Apex
