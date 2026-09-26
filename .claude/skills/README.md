# Skills experts CMCteams + Apex

Index **partiel** : ce fichier détaille une quinzaine de skills, mais `.claude/skills/` en contient **97** (fiches plates + dossiers) au 6.09.2026. Le vrai inventaire, c'est le dossier lui-même.

Niveau cible : **expert pro freelance senior 200 EUR/h**. Aucun raccourci. Application stricte des regles permanentes Kevin (CLAUDE.md).

---

## Comment invoquer un skill

Les skills sont des fichiers markdown structures avec frontmatter YAML. Claude Code les lit automatiquement quand le contexte correspond a `when_to_use`.

Pour invoquer manuellement :
```
"Lance le skill <nom-du-skill> sur <cible>"
```

Ou via le tool `Skill` :
```
Skill({ skill: "security-audit-owasp", args: "apex-ai/v13/services/auth/" })
```

---

## Liste des 15 skills

### Audits & Reviews

1. **`security-audit-owasp.md`** - Audit OWASP ASVS L2 + Top 10. Score /100 + findings P0-P3 avec CVSS/CWE.
2. **`perf-budget-check.md`** - Bundle gzip + LCP/INP/CLS + memory leaks + intervals zombies. Verdict vs budget.
3. **`audit-parity-v12-v13.md`** - Matrix complete features v12/v13. Score parite + plan portage prioritise.
4. **`subagent-orchestrate.md`** - Lancer 5-10 subagents Explore en parallele + crew of experts + synthese contradictions.

### Implementation & Refactor

5. **`tdd-implement.md`** - TDD strict (Red-Green-Refactor) avec coverage 100% + mutation testing.
6. **`apex-v13-feature-port.md`** - Porter feature v12 monolithe vers v13 modulaire TS strict + lazy + tests.
7. **`refactor-code-dup.md`** - Detecter duplications (jscpd), extraire helpers DRY, eliminer code mort.

### Securite & Privacy

8. **`csp-fix-inline.md`** - Migrer onclick/style inline vers data-attributes + event delegation.
9. **`csp-strict-build.md`** - CSP nonce dynamique + strict-dynamic + Trusted Types. Score 100 CSP Evaluator.
10. **`vault-encryption-rotate.md`** - Rotation cles AES-GCM 256 + PBKDF2 200k + zero data loss.

### Data & Sync

11. **`firebase-sync-debug.md`** - Debug FB_FIX/FB_LOCAL + queue offline + SSE + null overwrite.
12. **`migration-data.md`** - Migrer schema localStorage/Firebase. Dual-write 30j + rollback safety.

### Deployment & PWA

13. **`pwa-deploy-verify.md`** - Build PWA Vite + manifest + 8 icons + sw.js sync + Lighthouse 90+.
14. **`ios-pwa-fix.md`** - Fix Safari iOS PWA quirks (cache, SW updatefound, addToHomeScreen, audio context).

### Quality Gates

15. **`commit-quality-gate.md`** - Pre-commit checklist : tsc + lint + tests + bundle + secu. Bloque si echec.

---

## Categories cross-references

### Par phase de developpement

| Phase | Skills |
|-------|--------|
| Specification | `tdd-implement` (specs avant code) |
| Implementation | `apex-v13-feature-port`, `tdd-implement` |
| Refactor | `refactor-code-dup`, `migration-data` |
| Securite | `security-audit-owasp`, `csp-fix-inline`, `csp-strict-build`, `vault-encryption-rotate` |
| Performance | `perf-budget-check`, `refactor-code-dup` |
| Deploy | `pwa-deploy-verify`, `ios-pwa-fix`, `commit-quality-gate` |
| Maintenance | `firebase-sync-debug`, `audit-parity-v12-v13`, `subagent-orchestrate` |

### Par niveau de criticite

**P0 (utilisation quotidienne)** :
- `commit-quality-gate` - chaque commit
- `tdd-implement` - chaque feature
- `subagent-orchestrate` - chaque release

**P1 (utilisation hebdomadaire)** :
- `security-audit-owasp` - audit hebdomadaire
- `perf-budget-check` - apres ajout feature
- `firebase-sync-debug` - quand bug sync

**P2 (utilisation occasionnelle)** :
- `vault-encryption-rotate` - annuel ou compromission
- `migration-data` - changement schema
- `audit-parity-v12-v13` - cron weekly

---

## Workflows complets typiques

### Workflow A : Nouvelle feature en v13

1. `tdd-implement` (specs + tests RED)
2. `apex-v13-feature-port` (si feature existe en v12) ou implement direct
3. `csp-fix-inline` si UI ajoutee (pas d'onclick inline)
4. `tdd-implement` (GREEN + REFACTOR)
5. `refactor-code-dup` (si patterns similaires)
6. `commit-quality-gate` (validation pre-commit)
7. `subagent-orchestrate` (audit 2nd avis)
8. `pwa-deploy-verify` (build prod OK)
9. `ios-pwa-fix` (test iPhone reel)

### Workflow B : Audit pre-release

1. `subagent-orchestrate` (5-7 axes paralleles)
2. `security-audit-owasp` (OWASP ASVS L2)
3. `perf-budget-check` (bundle + memory)
4. `audit-parity-v12-v13` (regression check)
5. `commit-quality-gate` (final gate)
6. Push + monitor

### Workflow C : Bug fix critique (Kevin signale)

1. `firebase-sync-debug` ou `ios-pwa-fix` selon symptome
2. `tdd-implement` (test regression d'abord)
3. Fix code
4. `commit-quality-gate`
5. `subagent-orchestrate` (verifier fix sans regression)
6. Push + verifier live

### Workflow D : Migration breaking schema

1. `audit-parity-v12-v13` (ce qui touche)
2. `migration-data` (dual-write 30j)
3. `tdd-implement` (tests migration)
4. `vault-encryption-rotate` si chiffrement implique
5. `commit-quality-gate`
6. Deploy + monitor 30j

---

## Regles permanentes appliquees par tous les skills

Tous les skills respectent les regles CLAUDE.md :

1. **100/100 reel chaque axe** - Pas de score gonfle
2. **DECLARATION ≠ DEPLOYMENT** - Helper defini = helper wired
3. **PROTECTION ≠ STABILITE** - Pas de wraps qui se cassent mutuellement
4. **KEVIN TRAVAILLE SUR iPHONE** - Tout testable iOS Safari PWA
5. **Securite avant autonomie totale** - Audit OWASP avant features
6. **Audit exterieur en continu** - Subagent independant pour valider
7. **Verifier avant d'envoyer** - Validation post-action obligatoire
8. **Test live en permanence** - Pas de "ca devrait marcher"

---

## Stats

- **Total skills** : 15 + 1 template + 1 README = 17 fichiers
- **Lignes total** : ~3500 lignes de doc expert
- **Cross-references** : chaque skill cite 2-4 autres skills
- **Anti-patterns documentes** : 100+ pieges connus a eviter
- **Examples concrets** : 30+ cas reels CMCteams/Apex
- **Validations Bash** : 75+ commandes verifiables

---

## Maintenance

A chaque session importante :
1. Si nouveau pattern bug detecte → ajouter dans `Anti-patterns interdits` du skill concerne
2. Si nouveau workflow trouve → ajouter dans ce README
3. Si nouvelle erreur connue (CLAUDE.md erreur #N) → cross-reference dans skills concernes

Pour ajouter un nouveau skill : copier `_template.md`, remplir, valider YAML, ajouter ici.

---

## References

- `CLAUDE.md` (racine repo) - regles permanentes Kevin
- `AUDIT_TEMPLATE_PRO.md` (racine) - template audit officiel
- OWASP ASVS 4.0.3 - https://owasp.org/asvs/
- Web Vitals - https://web.dev/vitals/
- Anthropic prompt engineering - https://docs.anthropic.com/
