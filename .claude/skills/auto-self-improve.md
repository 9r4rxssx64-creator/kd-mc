# Skill: auto-self-improve
> Boucle d'auto-amélioration Apex — analyse → fix → test → commit → mémoire

## Déclencheur
- Kevin dit : "améliore-toi", "auto-fix", "optimise ton code", "audit et corrige"
- Sentinelle error-watch détecte erreur récurrente ≥3x
- Score audit < 90/100 sur un axe

## Algorithme (strictement dans cet ordre)

### Phase 1 — Analyse (max 2 min)
```typescript
// 1. Audit complet
const scores = await audit_self({ scope: 'all' });
const failing = Object.entries(scores).filter(([,v]) => v < 90);

// 2. Lecture logs erreurs récentes
const errors = await read_logs({ scope: 'errors', limit: 50 });
const patterns = groupByPattern(errors); // top 3 patterns

// 3. Search code concerné
for (const pattern of patterns) {
  const hits = await search_repo_code({ query: pattern.signature });
}
```

### Phase 2 — Fix autonome (par ordre priorité)
1. **Sécurité < 95** → appelle skill `security-audit-owasp`
2. **Performance < 85** → appelle skill `perf-vitals-optimize`
3. **Erreur JS runtime** → localise via logs + lit fichier + corrige via `create_or_update_file`
4. **Warning ESLint** → appelle skill `commit-quality-gate` (phase lint-fix)
5. **Type error TS** → corrige inference + re-check via `run_typecheck`

### Phase 3 — Validation obligatoire
```bash
# Tests régression OBLIGATOIRES avant push
npm test -- --run
# Si fail → rollback immédiat (git stash ou revert)
```

### Phase 4 — Commit + Mémoire
```typescript
// Commit avec message structuré
await commit_push({ message: `fix(apex-self): ${description}\n\nAudit avant: ${scoresBefore}\nAudit après: ${scoresAfter}` });

// Mémoriser lesson learned
await lesson_record({
  title: `Auto-fix: ${pattern}`,
  text: `Problème: ${problem}\nFix: ${fix}\nConfiance: ${confidence}`,
  severity: 'info',
  category: 'auto-improve'
});
```

## Règles non négociables
- ❌ JAMAIS modifier `core/bootstrap.ts` sans backup snapshot git
- ❌ JAMAIS supprimer fichier (delete_repo_file interdit sauf confirm Kevin)
- ❌ JAMAIS push si tests échouent
- ✅ Toujours créer branche `claude/auto-fix-<ts>` pour changements sensibles
- ✅ Toujours log before/after dans audit log

## Métriques succès
- Score audit avant/après → delta positif ≥5 points
- Zero régression tests existants
- Lesson learned enregistrée

## Exemples concrets
```
Kevin: "améliore-toi"
→ audit_self() → score sécu 87/100
→ search "innerHTML" → trouve 3 occurrences sans escapeHtml
→ lit fichier → ajoute escapeHtml wrapping
→ run_test → OK
→ commit "fix(security): escape innerHTML in 3 views"
→ lesson_record "innerHTML sans escape = XSS risk"
```
