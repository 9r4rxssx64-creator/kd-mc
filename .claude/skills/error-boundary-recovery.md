# Skill: error-boundary-recovery
> Détection + récupération automatique erreurs runtime Apex

## Déclencheur
- window.onerror ou unhandledrejection déclenché
- Sentinelle error-watch détecte erreur récurrente
- Kevin dit : "Apex plante", "erreur bizarre", "ça marche plus"

## Error boundary pattern (vanilla TS — PAS React)
```typescript
// ui/error-boundary.ts
export class ApexErrorBoundary {
  private errorCount = new Map<string, number>();
  
  install(): void {
    window.addEventListener('error', (e) => this.handle(e.error, 'uncaught'));
    window.addEventListener('unhandledrejection', (e) => 
      this.handle(e.reason, 'promise'));
  }
  
  private async handle(err: Error, type: string): Promise<void> {
    const sig = `${err.name}:${err.message.slice(0, 50)}`;
    const count = (this.errorCount.get(sig) ?? 0) + 1;
    this.errorCount.set(sig, count);
    
    // Log structuré
    await logger.error('runtime', { type, sig, count, stack: err.stack });
    
    // Récupération selon sévérité
    if (count >= 3) {
      await this.criticalRecovery(err, sig);
    } else {
      this.softRecovery(err);
    }
  }
  
  private softRecovery(err: Error): void {
    // Toast discret non-bloquant
    toast.show({ type: 'warning', text: 'Erreur récupérée automatiquement', duration: 3000 });
  }
  
  private async criticalRecovery(err: Error, sig: string): Promise<void> {
    // 1. Notif Telegram Kevin
    await send_telegram({ text: `🔴 Apex erreur critique (x3): ${sig}` });
    
    // 2. Tentative réinitialisation module fautif
    const module = detectFaultyModule(err.stack);
    if (module) await reloadModule(module);
    
    // 3. Si toujours KO → fallback mode dégradé
    router.navigate('home'); // retour safe state
    toast.show({ type: 'error', text: 'Mode récupération activé', duration: 5000 });
    
    // 4. Lesson learned auto
    await lesson_record({
      title: `Runtime error: ${sig}`,
      text: `Stack: ${err.stack?.slice(0, 500)}`,
      severity: 'critical',
      category: 'runtime'
    });
  }
}
```

## Catégories erreurs + stratégie
| Type | Stratégie | Notification |
|------|-----------|-------------|
| Firebase timeout | Retry x3 + offline mode | Toast jaune |
| Vault decrypt fail | Reset PIN prompt | Modal bloquant |
| Provider LLM 429 | Failover immédiat | Silencieux |
| JS SyntaxError | Reload module | Toast rouge + Telegram si x3 |
| Memory quota exceeded | Clear cache LRU | Auto |
| Service Worker stale | Force update + reload | Toast bleu |

## Mode dégradé (graceful degradation)
```typescript
// Fonctions critiques avec fallback
async function safeFirebaseRead(path: string, fallback: unknown) {
  try {
    return await firebase.read(path);
  } catch {
    logger.warn('firebase-read-fallback', { path });
    return localStorage.getItem(`fb_cache_${path}`) ?? fallback;
  }
}
```
