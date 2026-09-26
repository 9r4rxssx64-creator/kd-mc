---
name: apex-code-review
description: 4 agents internes auditent le code Apex (CLAUDE.md compliance + redundant rules + bug detection + git history context). Admin only.
when_to_use: Admin Kevin dit "code review", "audit code", "/review", "verifier la qualite".
model: sonnet
allowed_tools: [code_review, run_typecheck, run_lint, git_history]
---

# Skill : apex-code-review

## Mission

Spawn 4 agents specialistes en parallele qui auditent independamment le code Apex (TS/JS), inspires du `/review` natif Claude Code (Inclus 0€ Natif Claude Code).

## Agents internes spawned

### Agent 1 : CLAUDE.md compliance
Verifie que le code respecte les 50+ regles permanentes Kevin :
- `esc()` partout sur innerHTML
- Guards admin `if(!K.user||K.user.role!=='admin') return`
- FB_LOCAL strict pour `ax_user`, `ax_uid`, tokens
- PRESERVE_PREFIXES intacts (erreur #55)
- Auth nom+prenom+pass obligatoires (erreur #38)

### Agent 2 : Redundant rules check
Detecte regles redondantes ou contradictoires :
- 2 regles disent A, 1 dit non-A → conflit
- Pattern dupplique dans CLAUDE.md (regroupable)
- Anti-patterns reproduits malgre #X documente

### Agent 3 : Bug detection
- Logique flawed (off-by-one, null checks manquants)
- Race conditions (async sans await)
- Memory leaks (intervals non clear, listeners non remove)
- Edge cases (empty array, undefined fields)
- Type errors masques par `as any`

### Agent 4 : Git history context
- Analyse 128 derniers commits → patterns recurrents
- Identifie zones modifiees frequemment (hot spots = fragile)
- Verifie que fix recents n'ont pas casse fix anciens (regression)
- Documente lessons learned dans `ax_lessons_learned_struct`

## Output

```json
{
  "agents_spawned": 4,
  "files_scanned": 14,
  "git_commits_analyzed": 128,
  "findings": {
    "claude_md_violations": [...],
    "redundant_rules": [...],
    "bugs_detected": [...],
    "git_history_insights": [...]
  },
  "summary": "Code globalement clean. 2 P1 a corriger.",
  "score_per_axis": {
    "claude_md_compliance": "19/20",
    "bug_freedom": "18/20",
    "consistency": "20/20",
    "maintainability": "17/20"
  }
}
```

## Anti-patterns

1. **Audit superficiel** (juste linter) → INTERDIT, agents specialistes obligatoires
2. **Auto-fix sans confirm Kevin** → propose, ne fix pas
3. **Ignorer git history** → 4eme agent obligatoire
4. **Faux positifs sans dedup** → cluster findings similaires

## References

- /review natif Claude Code (Yury.ai TikTok)
- Pattern : `apex-ai/v13/services/ai/code-review-multi-agent.ts`
- Voir aussi : `apex-security-review.md`
