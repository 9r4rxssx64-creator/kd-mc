# PLAN_AUDIT_EXTERNE_v13.3.94 — Cascade corrections P0/P1

**Date** : 2026-05-09 03:30
**Audit externe** : 58/100 brutal cabinet indépendant
**Cible** : v13.3.94 score remonté à ~75-80/100 réel (à mesurer par audit re-run, pas inventer)

---

## RAPPEL ERREURS DOCUMENTÉES (CLAUDE.md)

**À NE PAS REPRODUIRE** :
- **#28** Declaration ≠ Deployment (Security Theater)
- **#54** GAP source vs build non-déployé
- **#55** XOR-obfuscation device-bound casse vault au force-update

Vérification COHÉRENCE OBLIGATOIRE avant push :
- `apex-ai/v13/index.html` data-app-ver = `apex-ai-v13/index.html` data-app-ver
- `apex-ai/v13/sw.js` CACHE_VERSION = `apex-ai-v13/sw.js` CACHE_VERSION
- `apex-ai/v13/package.json` version = APP_VER bootstrap.ts

---

## P0 CRITIQUES (immédiat)

### P0.1 — Audit log corrompu (security-watch FAILED)
**Symptôme** : `Hash audit log invalide à entry #1 (1001 entries) — possible corruption`
**Action** : `auditLog.autoRepair()` existe déjà (services/audit-log.ts) → vérifier wire au boot, sinon force-call
**Risque régression** : faible (autoRepair garde les entries valides post-#1)

### P0.2 — Vault drift 13 clés sans backup Firebase
**Symptôme** : `vault-resilience-watch → 13 local sans backup, 0 Firebase sans local`
**Action** : sentinel autoFix devrait push to Firebase (déjà wiré v13.3.89). Forcer un run manuel + audit pour confirmer pushed.
**Risque régression** : faible

### P0.3 — CSP monitoring JSON Parse error
**Symptôme** : `csp-violation-watch → JSON Parse error: Unexpected identifier '__LZ__'`
**Action** : `__LZ__` est le préfixe lz-string compression. Le parser ne décompresse pas avant JSON.parse.
**Fix** : services/csp-monitor.ts → check si raw startswith `__LZ__` → décompresser via lz-string AVANT parse, ou skip avec fallback `[]`
**Risque régression** : très faible

### P0.4 — Memory cross-session vide (lessons learned)
**Symptôme** : `memory-augmented-watch → Déficit mémoire : lessons cross-session vides`
**Action** : v13.3.89 avait ajouté `syncLessonsAtBoot()` mais ne s'exécute pas correctement. Vérifier wire bootstrap.ts + force-run au boot.
**Risque régression** : faible (lecture seule depuis CLAUDE.md GitHub)

### P0.5 — global-health-watch ment encore
**Symptôme** : `global-health-watch → 44/44 green` alors que 6 sentinelles FAILED
**Note** : v13.3.86 P0.3 ajoutait WARN_PATTERNS regex. Vérifier que le check tient compte aussi du `lastResult.ok === false` (pas seulement les warnings).
**Action** : audit sentinels.ts ligne ~2304 et corriger logique compteur.

---

## P1 IMPORTANTS (< 48h)

### P1.1 — Link validation registry parse failed
**Action** : services/sentinels.ts link-validation-watch → wrap JSON.parse avec try/catch + fallback `[]`. Probable corruption similaire à __LZ__.

### P1.2 — agent-watches-runner 1 agent en erreur
**Action** : grep le sentinel + identifier l'agent qui fail + autoFix whitelist (déjà infra v13.3.89, vérifier wire).

### P1.3 — sentinelles dormantes (last_run: 0)
**Symptôme** : 45 sentinelles enabled mais last_run: 0 sur certaines sessions
**Note** : c'est normal au boot avant le premier tick. Le tick scheduler tourne via setInterval. Vérifier que `sentinels.start()` est appelé après boot.

### P1.4 — Pattern régression cascade
**Action** : ajouter test unitaire `passphrase-history-survives-force-update.test.ts` qui teste le scénario clear localStorage + reload + decrypt OK. Évite ça en CI futur.

---

## P2 AMÉLIORATIONS (sans urgence)

### P2.1 — Monolithes (sentinels.ts 112KB)
**Note** : refactor lourd, reporté (risque régression > bénéfice immédiat).

### P2.2 — Fallback no-JS gracieux index.html
**Note** : peu prioritaire pour PWA admin perso.

### P2.3 — Backup last 15h → forcer cron horaire
**Action** : services/auto-backup.ts → vérifier interval 24h actuel, baisser à 6h.

---

## CONSIGNES STRICTES

1. **Tester chaque fix individuellement** avant push collectif
2. `npx tsc --noEmit` doit passer 0 erreur
3. `npx vitest run` échantillon (sentinels, vault, memory) doit rester vert
4. Bump v13.3.93 → v13.3.94 dans 4 fichiers cohérents
5. Build + sync apex-ai-v13/ + push origin claude/test-699LQ
6. Vérifier `data-app-ver` source = build (CLAUDE.md erreur #54)

## ITEMS HORS SCOPE (Kevin doit faire)

- Coller `ax_github_token` (PAT GitHub)
- Coller `ax_telegram_key` (bot token)
- Coller `ax_railway_key`
- Configurer `ax_kevin_whatsapp_phone`

Ces 4 items débloquent ~30% des fonctionnalités mais nécessitent action humaine de Kevin.
