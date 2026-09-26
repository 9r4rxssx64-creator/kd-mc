# Skill : Auto-Heal (Auto-guérison Apex)

## Objectif
Apex se répare automatiquement quand une sentinelle détecte une anomalie.

## Stratégies par type de panne

### Provider IA KO
```ts
import { smartRouter } from '../services/smart-router.js';
smartRouter.maskProvider(failedProvider, 24 * 3600_000);
// Failover : anthropic → openrouter → groq → gemini
```

### Firebase KO
```ts
import { firebaseQueue } from '../services/firebase-queue.js';
firebaseQueue.enableOfflineMode(); // queue + retry exponentiel 1s→60s
```

### Vault Error
```ts
import { vaultDeepRecovery } from '../services/vault-deep-recovery.js';
await vaultDeepRecovery.attemptRecovery(); // IDB shadow → Firebase backup
```

### Sentinelle fail
```ts
import { sentinelsRegistry } from '../services/sentinels-registry.js';
const failing = sentinelsRegistry.getAll().filter(s => s.lastStatus === 'fail');
// restart sentinelle + log + notif Kevin si 3 fails consécutifs
```

## Notification Kevin
```ts
import { kevinAlerts } from '../services/kevin-alerts.js';
// Toast vert si réparé < 30s, Telegram si MTTR > 30s
await kevinAlerts.notify({ level: 'critical', message: `Auto-heal failed: ${service}` });
```

## Métriques
- MTTR < 60s ✅ | 0 interruption > 2min ✅ | 100% incidents loggés ✅
