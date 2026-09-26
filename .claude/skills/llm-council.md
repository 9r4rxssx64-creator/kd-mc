---
name: llm-council
description: Délibération multi-LLM en 3 rounds (brainstorm + critique + synthèse) pour décisions critiques niveau expert mondial.
tools: [Read, Edit, Write, Bash, Grep]
model: claude-sonnet-4
---

# `/llm-council` — Conseil multi-LLM décisionnel

Utiliser pour **décisions critiques** où une seule perspective IA ne suffit pas :
audit production, choix d'architecture, validation refactor majeur, comparaison techno, code review approfondi.

## Quand l'utiliser

- ✅ Décision avec impact > 10K lignes de code ou production
- ✅ Choix stratégique entre 3+ alternatives techniques
- ✅ Validation finale avant push commercial
- ✅ Audit cross-axes (sécurité + perf + UX + conformité simultanés)
- ✅ Détection de biais cognitif individuel (single-IA)

## Quand NE PAS l'utiliser

- ❌ Tâche < 30 min (overhead trop élevé)
- ❌ Réponse factuelle simple (1 IA suffit)
- ❌ Budget tokens limité (5 IA × 3 rounds = ~5K-15K tokens/IA)
- ❌ Décision réversible facilement (itère plutôt)

## Pattern 3 rounds

```
ROUND 1 — Brainstorm parallèle (Promise.all sur 5 LLMs)
    ↓
ROUND 2 — Critique croisée (chaque expert critique son voisin)
    ↓
ROUND 3 — Synthèse finale (1 LLM "juge" agrège + décide)
    ↓
Décision { synthesis, recommendation, confidence, dissent[] }
```

## Council par défaut (5 experts)

| Provider | Expertise | Modèle | Poids |
|---|---|---|---|
| Anthropic | Reasoning | Claude Opus | 1.5 |
| OpenAI | Code quality | GPT-4o | 1.3 |
| Gemini | Architecture | Gemini Pro | 1.2 |
| Groq | Innovation | Llama 70B | 1.0 |
| Mistral | Devil's advocate | Mistral Large | 1.0 |

## Usage Apex

### Via tool IA depuis le chat
```ts
const result = await apexTools.dispatch({
  name: 'llm_council',
  input: {
    task: 'Faut-il migrer de Firebase Realtime DB vers Cloudflare D1 pour Apex v14 ?',
    maxRounds: 3,
  },
});
```

### Direct depuis service
```ts
import { llmCouncil } from '@services/llm-council.js';

const decision = await llmCouncil.deliberate({
  task: 'Audit P0 sécurité Apex v13.4.7',
  members: DEFAULT_COUNCIL,
  maxRounds: 3,
});

console.log(decision.recommendation);
console.log(`Confiance: ${decision.confidence}% — Consensus: ${decision.consensus}`);
```

### Council customisé
```ts
const securityCouncil = [
  { provider: 'anthropic', expertise: 'security', label: 'CISO', weight: 2.0 },
  { provider: 'openai', expertise: 'security', label: 'Pentest Lead', weight: 1.5 },
  { provider: 'gemini', expertise: 'compliance', label: 'GDPR Auditor', weight: 1.2 },
];

await llmCouncil.deliberate({
  task: 'Le coffre Apex respecte-t-il OWASP ASVS L2 ?',
  members: securityCouncil,
  maxRounds: 3,
});
```

## Sortie type

```jsonc
{
  "task": "Migration Firebase → D1 ?",
  "round1": [ /* 5 réponses indépendantes */ ],
  "round2": [ /* 5 critiques croisées */ ],
  "finalSynthesis": "...",
  "recommendation": "Migrer progressivement avec dual-write 6 mois...",
  "confidence": 78,
  "consensus": true,
  "dissent": [
    "Gemini recommande de garder Firebase pour la simplicité du tier gratuit",
    "Mistral alerte sur les coûts cachés D1 worker invocations"
  ],
  "totalLatencyMs": 47230,
  "cost_estimate_usd": 0.075
}
```

## Anti-patterns à éviter

- ❌ **Provider stripped** : envoyer le prompt sans contexte/règles Kevin → viole `CLAUDE.md never-forget-watch`
- ❌ **Round 3 sans Round 2** : pas de critique = pas de débat = consensus mou
- ❌ **>5 membres** : diminishing returns + coût exponentiel
- ❌ **Council fixe pour tout** : adapter expertise au sujet (sécu vs UX vs business)
- ❌ **Pas de timeout** : si 1 provider hang → bloque tout (timeout 30s/provider)

## Vue admin `vCouncilHistory`

Affiche les 20 dernières délibérations Council :
- Date, task, members, confiance, consensus
- Coût estimé total
- Replay button (re-run avec council différent)
- Export Markdown rapport

## Test mental avant utilisation

> *"Cette décision peut-elle être prise par 1 IA seule en < 5 min, OU est-ce qu'elle nécessite vraiment 5 perspectives expertes débattantes ? Si oui Council, sinon single-IA."*

## Cost guard

Council 5 × 3 rounds ≈ 0.05-0.10$ par run. Budget recommandé : max 10 runs/jour côté admin Kevin (0.50-1$/jour). Sentinelle `council-budget-watch` alerte si > 20 runs/jour.

## Référence

- Service Apex : `apex-ai/v13/services/llm-council.ts`
- Tool registry : `apex-ai/v13/services/apex-tools-registry/admin-tools.ts` (id: `llm_council`)
- Tests : `apex-ai/v13/tests/unit/llm-council.test.ts`
- Vue admin : `apex-ai/v13/features/admin/council-history/index.ts` (TODO v13.5)
