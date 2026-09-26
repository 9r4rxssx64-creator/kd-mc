# Skill: llm-failover-smart-router
> Gestion failover multi-provider LLM — zéro downtime, routing optimal

## Déclencheur
- Provider LLM retourne erreur 429/500/503
- Latence > 8s sur provider principal
- Kevin dit : "le modèle IA répond mal", "change de provider"

## Chaîne failover Apex (ordre priorité)
```
anthropic → openrouter → groq → gemini → cohere → mistral → deepseek → xai
```

## Scoring provider (4 critères pondérés)
```typescript
// latency 35% | reliability 30% | quality 25% | cost 10%
function selectBestProvider(available: Provider[]): Provider {
  return available
    .filter(p => p.status === 'healthy')
    .sort((a, b) => scoreProvider(b) - scoreProvider(a))[0];
}
```

## Circuit breaker
```typescript
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  readonly threshold = 3;    // échecs avant ouverture
  readonly timeout = 60_000; // 60s avant retry
  // CLOSED → 3 failures → OPEN → 60s → HALF_OPEN → 1 success → CLOSED
}
```

## Routing spécial
| Cas | Provider forcé |
|-----|---------------|
| Code generation | anthropic / deepseek |
| Tâche rapide < 100 tokens | groq (800ms) |
| Longue conv > 50 turns | anthropic |
| Image vision | anthropic / openai |
| Maths/logique | deepseek-r1 |
| Tâche gratuite | gemini-flash |

## Auto-masquage KO + Notif Telegram
```typescript
// Si KO > 24h → retire de rotation
// Notif Kevin via Telegram si principal KO > 1h
await send_telegram({
  chat_id: KEVIN_CHAT_ID,
  text: `⚠️ Provider ${name} KO — failover vers ${next}`
});
```
