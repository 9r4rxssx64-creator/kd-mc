# ADR-002 — Multi-key failover chain pour autonomie 100% Apex v13

**Status** : Accepted (v13.3.74, 2026-05-08)
**Auteurs** : Kevin DESARZENS (admin), Claude Code
**Date** : 2026-05-08

## Contexte

Kevin règles ABSOLUES :
- 2026-05-08 : *"Pas de réponse dans le vide ou qu'il dit qu'il n'a pas
  compris ou qu'il n'y a plus d'API. Ça ne doit jamais arriver."*
- 2026-05-08 : *"Je veux qu'il n'ait plus besoin de Claude Code, qu'il soit
  autonome pour toutes ces fonctionnalités."*

Risques opérationnels constatés :
- Anthropic incident 429/502 cohere/groq simultané (2026-05-08)
- Quotas free tier Gemini/Groq atteints en heures de pointe
- Compte Kevin Anthropic épuisé → Apex bloqué si single-provider

## Décision

Architecture **failover chain** avec 12 providers IA configurés dans le vault
(13 clés possibles avec aliases) :

### 1. Chaîne par défaut (DEFAULT_CHAIN)

```ts
['anthropic', 'openai', 'openrouter', 'groq', 'gemini', 'openclaw']
```

### 2. Pool extensif audité (ALL_AI_KEYS)

```ts
[
  { name: 'anthropic', storageKey: 'ax_shared_api_key' },
  { name: 'anthropic_alt', storageKey: 'ax_anthropic_key' },
  { name: 'openai', storageKey: 'ax_openai_key' },
  { name: 'openrouter', storageKey: 'ax_openrouter_key' },
  { name: 'groq', storageKey: 'ax_groq_key' },
  { name: 'gemini', storageKey: 'ax_gemini_key' },
  { name: 'mistral', storageKey: 'ax_mistral_key' },
  { name: 'cohere', storageKey: 'ax_cohere_key' },
  { name: 'deepseek', storageKey: 'ax_deepseek_key' },
  { name: 'perplexity', storageKey: 'ax_perplexity_key' },
  { name: 'xai_grok', storageKey: 'ax_xai_key' },
  { name: 'huggingface', storageKey: 'ax_hf_token' },
  { name: 'openclaw', storageKey: 'ax_openclaw_key' },
]
```

### 3. Sentinelle multi-key-health.ts

- Ping toutes 5 min chaque provider configuré (test request `$0.0001`)
- Mark `dead` si 3 fails consécutifs (status non-2xx ou network)
- Mark `recovered` si 1 succès après dead (re-active immédiat)
- Persiste état dans `apex_v13_provider_health`

### 4. Logique failover (ai-router.ts)

```ts
async stream(messages, system, onChunk, onError) {
  for (const provider of buildPolicyAwareChain()) {
    const key = await vault.readKey(provider.storageKey);
    if (!key) continue;
    if (multiKeyHealth.isDead(provider.name)) continue;
    try {
      return await callProvider(provider, key, messages, ...);
    } catch (err) {
      multiKeyHealth.markFail(provider.name);
      logger.warn('ai-router', `failover ${provider.name} → next`, { err });
      continue;
    }
  }
  /* Tous providers KO → fallback local-only mode (chat-fallback.ts) */
  return localFallback(messages);
}
```

### 5. Mode local-only

Si **tous** les providers fail :
- Banner doré "🔄 Apex en mode dégradé. Causes : pas de clé / quota épuisé"
- Réponse depuis `persistent_memory` + `kb_facts` + actions locales (vault, paste détection, browser embed)
- JAMAIS message vide, JAMAIS "API down" — chat-fallback.ts garantit anti-pattern

### 6. Auto-rotation clés multi-comptes (multi-key-vault.ts)

Pour les providers payants (Anthropic, OpenAI, Stripe), Kevin peut stocker
N clés du même service. Round-robin si rate-limit, mark-dead si 401/403.

## Conséquences

**Positives** :
- Si 5 providers down simultanément → encore 7 actifs
- Coût marginal vers $0 grâce free tiers (Groq 14k req/jour, Gemini 1M tok/jour)
- Continuité service même si Kevin perd abonnement Anthropic
- Conformité règle Kevin "JAMAIS de message vide"

**Négatives** :
- Coût stockage 12 clés vault per device
- Complexité tests (12² combinaisons failover possibles)
- Rate-limit aware logic complexe (provider X vs Y vs combiné)

**Alternatives considérées** :
- Single provider Anthropic + retry exponential : violation règle Kevin
- Backend proxy Cloudflare avec routing : SPOF + latence + coût
- LLM local (WebLLM, Pyodide) : qualité/latence inacceptable mobile

## Validation

- 332 tests Vitest, 0 régression
- Test `ai-router.test.ts` simule chaque provider down individuellement
- Sentinelle `ai-providers-health` 24/7 dashboard admin
- v13.3.75 audit chain : 14/14 clés détectées vs 6/6 ancien (Kevin urgent fix)

## Références

- services/ai-router.ts ligne 485-700
- services/multi-key-vault.ts (rotation comptes)
- services/multi-key-health.ts (ping cycle)
- services/chat-fallback.ts (anti-message-vide)
- services/direct-connectors-registry.ts (50+ services NON-IA)
