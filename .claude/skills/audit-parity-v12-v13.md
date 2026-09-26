---
name: audit-parity-v12-v13
description: Comparer exhaustivement features Apex v12 (monolithe) vs v13 (modulaire). Matrix de gaps, score parite %, plan de portage prioritaire.
when_to_use: Avant migration v13 (savoir ce qui manque). Apres ajout feature en v12 (verifier doit etre porte). Audit periodique pour eviter divergence v12/v13.
model: opus
allowed_tools: [Read, Grep, Glob, Bash]
---

# Skill: Audit Parity v12/v13

## Mission

Comparer exhaustivement les features de Apex v12 (monolithe ~20K lignes `apex-ai/index.html`) vs v13 (modulaire TS strict `apex-ai/v13/`). Produire matrice complete des gaps avec score parite, prioritisation P0/P1/P2 du portage.

Reference Kevin : v13 doit etre 100% feature parity v12 + qualite niveau Claude.ai. Pas de regression fonctionnelle pendant la transition.

## Pre-requis

- [ ] Avoir lu CLAUDE.md "DECLARATION ≠ DEPLOYMENT"
- [ ] Connaitre les 2 codebases (rapide overview)
- [ ] Acces Bash + outils analyse code (grep, awk)
- [ ] Skill `apex-v13-feature-port` disponible pour les gaps detectes

## Etapes (workflow 6 phases)

### Phase 0 - Inventaire v12 (10 min)

```bash
# 1. Lister toutes les fonctions ax* / cmc* / v* dans v12
grep -oE 'function (ax[A-Z][a-zA-Z]+|v[A-Z][a-zA-Z]+)' apex-ai/index.html | sort -u > /tmp/v12-functions.txt
wc -l /tmp/v12-functions.txt

# 2. Lister toutes les vues (cases dans vMain switch)
grep -oE 'case\s*"[a-z0-9_-]+":\s*return\s*v[A-Z][a-zA-Z]+\(' apex-ai/index.html | sort -u > /tmp/v12-views.txt
wc -l /tmp/v12-views.txt

# 3. Lister tous les tools IA
grep -A2 'name:\s*"' apex-ai/index.html | grep -oE 'name:\s*"[a-z_]+"' | sort -u > /tmp/v12-tools.txt

# 4. Lister sentinelles
grep -oE 'axCreateLocalWorker\("[a-z-]+"' apex-ai/index.html | sort -u > /tmp/v12-sentinels.txt

# 5. Lister cles localStorage
grep -oE '"ax_[a-z_]+"' apex-ai/index.html | sort -u > /tmp/v12-keys.txt
```

### Phase 1 - Inventaire v13 (10 min)

```bash
cd apex-ai/v13

# 1. Functions / classes / hooks exportes
grep -rhE 'export (function|class|const)' . | grep -oE '(function|class|const)\s+[a-zA-Z_]+' | sort -u > /tmp/v13-exports.txt

# 2. Views routes
grep -rhE "'/[a-z0-9_-]+'" router*.ts | sort -u > /tmp/v13-routes.txt

# 3. Tools IA
grep -rhE 'name:\s*[\'"][a-z_]+[\'"]' services/ai/ 2>/dev/null | sort -u > /tmp/v13-tools.txt

# 4. Sentinels
grep -rhE 'createSentinel|registerWatcher' . | sort -u > /tmp/v13-sentinels.txt
```

### Phase 2 - Matrix de comparaison (15 min)

Generer matrix complete :

```bash
# Categorie : Vues
echo "=== VUES ==="
echo "Total v12: $(wc -l < /tmp/v12-views.txt)"
echo "Total v13: $(wc -l < /tmp/v13-routes.txt)"
diff /tmp/v12-views.txt /tmp/v13-routes.txt > /tmp/views-diff.txt
echo "Manquantes en v13:"
comm -23 /tmp/v12-views.txt /tmp/v13-routes.txt
```

Matrix output formate :

```markdown
## Apex v12 → v13 Parity Matrix

### Score global : 65/100 (65% parite, 35% gaps)

### Vues (38 v12, 24 v13)

| Vue | v12 | v13 | Priorite | Effort |
|-----|-----|-----|----------|--------|
| vChat | ✅ | ✅ | - | done |
| vAdmin | ✅ | ⚠️ partiel | P0 | 2j |
| vVault | ✅ | ❌ | P0 | 3j |
| vCoffre | ✅ | ❌ | P0 | 2j |
| vIA | ✅ | ✅ | - | done |
| vStudioMusic | ✅ | ❌ | P2 | 5j |
| ... | | | | |

### Sentinels (16 v12, 8 v13)

| Sentinel | v12 | v13 | Status |
|----------|-----|-----|--------|
| security-watch | ✅ | ❌ | P0 manquant |
| credentials-watch | ✅ | ❌ | P0 |
| ai-health-watch | ✅ | ✅ | done |
| ... | | | |

### Tools IA (32 v12, 18 v13)

| Tool | v12 | v13 | Note |
|------|-----|-----|------|
| open_browser | ✅ | ✅ | |
| web_search | ✅ | ✅ | |
| modify_css | ✅ | ❌ | Admin only, P2 |
| inject_function | ✅ | ❌ | Admin only, P2 |
| ... | | | |

### Cles donnees (87 v12, 42 v13)

| Cle | v12 | v13 | Migration ? |
|-----|-----|-----|-------------|
| ax_user_profile | new | ✅ | done |
| ax_user (legacy) | ✅ | - | dual-read |
| ax_persistent_memory | ✅ | ⚠️ | partial sync |
| ... | | | |
```

### Phase 3 - Tests fonctionnels cross-version (15 min)

Pour chaque feature critique, verifier comportement equivalent :

```typescript
// e2e/parity.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Apex v12/v13 parity tests', () => {
  test('login flow identical', async ({ page }) => {
    // Test sur v12 (legacy URL)
    await page.goto('/v12/');
    await page.fill('input[name=name]', 'Kevin DESARZENS');
    await page.fill('input[name=pin]', '‹code admin›');
    await page.click('button[type=submit]');
    const v12_redirect = page.url();
    
    // Test sur v13
    await page.goto('/v13/');
    await page.fill('input[name=name]', 'Kevin DESARZENS');
    await page.fill('input[name=pin]', '‹code admin›');
    await page.click('button[type=submit]');
    const v13_redirect = page.url();
    
    // Doivent rediriger vers meme vue
    expect(new URL(v12_redirect).pathname).toBe(new URL(v13_redirect).pathname);
  });
  
  // ... pour chaque flow critique
});
```

### Phase 4 - Prioritisation portage (5 min)

Score chaque gap :
- **P0 Critical** : feature utilisee quotidiennement par Kevin (chat, login, vault, settings)
- **P1 High** : feature admin importante (audit, sentinels, gestion users)
- **P2 Medium** : feature avancee non-critique (studios, jeux specialises)
- **P3 Low** : feature experimentale (tools IA exotiques)

Reordonner la liste par priorite + effort estime.

### Phase 5 - Plan de portage (10 min)

```markdown
## Plan portage v12 → v13 (sprint 2 semaines)

### Sprint 1 (P0 - Bloquant)

- [ ] vVault (3j) - via skill `apex-v13-feature-port` + `vault-encryption-rotate`
- [ ] vCoffre (2j)
- [ ] sentinel security-watch (1j)
- [ ] sentinel credentials-watch (1j)
- [ ] vAdmin completion (2j)

### Sprint 2 (P1 - Important)

- [ ] vAuditLog (1j)
- [ ] tool modify_css (admin only, 0.5j)
- [ ] tool inject_function (admin only, 0.5j)
- [ ] migration ax_persistent_memory (1j)
- [ ] vClickFailures (0.5j)

### Backlog (P2)

- [ ] vStudioMusic (5j)
- [ ] vStudioVideo (5j)
- [ ] ... studios

### Note

- Chaque port = TDD (skill `tdd-implement`)
- Chaque fin de port = audit parite (re-run ce skill)
- Si v12 evolue pendant le port → re-audit
```

### Phase 6 - Audit recurrent (bouton, JAMAIS de cron)

> ⛔ **INTERDIT ABSOLU : pas de `schedule:` sur GitHub Actions.** C'est le VOLUME d'exécutions
> programmées (~97/jour) qui a fait **suspendre le compte le 15/08/2026**. Règle « CHAQUE
> AUTOMATISATION A UNE DESTINATION ÉCRITE » : ce qui produit/teste CE dépôt va sur GitHub
> **à la main uniquement** (`workflow_dispatch`), et c'est MOI qui appuie le bouton via l'API
> (`actions_run_trigger`) — zéro clic Kevin. *(Ce bloc proposait un cron hebdomadaire à copier ;
> corrigé le 6.09.2026.)*

```yaml
# .github/workflows/parity-audit.yml
name: Parity Audit v12/v13
on:
  workflow_dispatch:        # bouton seulement — je le déclenche moi-même
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          # Run skill parity audit
          # ⚠️ `./scripts/audit-parity.sh` n'existe PAS (vérifié 6.09.2026 : `scripts/` ne
          # contient que `deploy-check.sh`). À écrire avant d'activer ce workflow.
          ./scripts/audit-parity.sh > parity-report.md
          # Si gaps P0 detectes → ouvrir issue auto
          if grep -q "P0 Critical" parity-report.md; then
            gh issue create --title "P0 parity gap detected" --body "$(cat parity-report.md)"
          fi
```

## Anti-patterns interdits

1. **Audit global sans details** : "v13 fait 70% de v12" sans liste = inutile. Toujours matrice exhaustive.
2. **Pretendre parite sans tests** : compter les fonctions n'est pas tester le comportement. E2E tests obligatoires sur features P0.
3. **Ignorer les sentinels et tools IA** : focus sur vues uniquement = oubli secu critique. Toutes les categories.
4. **Pas de prio par usage Kevin** : porter `vStudioGarden` avant `vVault` = absurde. Priorite = frequence usage Kevin + impact secu.
5. **Audit ponctuel sans suivi** : audit en jan, gap qui reapparaissent en mars. Toujours cron weekly + alerte si regression.
6. **Ne pas mesurer l'effort** : "il manque vVault" sans estimation = planning impossible. Toujours j-effort.
7. **Confondre code present et code wired** : un helper `axRedactSecret` defini en v13 mais non importe = pas porte. Erreur "DECLARATION ≠ DEPLOYMENT".

## Validation post-action

```bash
# 1. Matrix complete (4 categories : vues, sentinels, tools, keys)
test -f /tmp/parity-report.md && grep -c "^### " /tmp/parity-report.md  # >= 4

# 2. Score chiffre present
grep -E "Score global.*[0-9]+/100" /tmp/parity-report.md

# 3. Chaque gap P0 a estimation effort
grep "P0" /tmp/parity-report.md | grep -E "[0-9]+j"

# 4. Plan de portage existe
grep -A20 "Plan portage" /tmp/parity-report.md | wc -l

# 5. Tests E2E parite presents
ls apex-ai/v13/e2e/parity*.spec.ts 2>/dev/null
```

## Exemples concrets

### Exemple 1 : Audit revele 14 vues vStudio* manquantes en v13

**Contexte** : v12 a `vStudioMusic`, `vStudioVideo`, etc. (14 vues). v13 a 0.

**Action** :
1. Run audit → matrix montre 14 P2 (non-critiques pour Kevin admin daily)
2. Mais : si Kevin clique dessus en v13 → ReferenceError → crash app entiere (CLAUDE.md erreur #46)
3. Decision : creer 14 stubs friendly en v13 avec message "Coming soon, use Chat for now"
4. Backlog port progressif via skill `apex-v13-feature-port`

### Exemple 2 : Sentinel security-watch absent en v13

**Contexte** : v12 a sentinel qui surveille les login anomalies. v13 = 0 sentinel security.

**Decision** : P0 immediat. Sans cette sentinel, Apex v13 ne peut pas detecter brute force PIN. Bloquer release v13 prod jusqu'a port.

**Action** : skill `apex-v13-feature-port` sur `security-watch` + tests TDD + integration au boot.

## Integration avec autres skills

- **Prerequis** : aucun (skill d'audit, peut tourner en autonomie)
- **Apres** : `apex-v13-feature-port` pour combler chaque gap
- **Cross** : `subagent-orchestrate` pour lancer 4 audits parallel (vues, sentinels, tools, keys)
- **Suivi** : re-run apres chaque sprint port

## References

- CLAUDE.md "DECLARATION ≠ DEPLOYMENT"
- CLAUDE.md erreur #46 (vues v12 referencees mais non definies)
- Strangler Fig pattern (Martin Fowler) : https://martinfowler.com/bliki/StranglerFigApplication.html
- Feature flags + parallel run : https://martinfowler.com/articles/feature-toggles.html
