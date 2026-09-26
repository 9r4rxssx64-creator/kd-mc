---
name: subagent-orchestrate
description: Lancer N subagents Explore en parallele sur axes complementaires + synthese cross-findings. Crew d'experts pour audit critique avant push.
when_to_use: Avant chaque release majeure. Apres feature non-triviale (>200 lignes). Quand Kevin demande "audit complet" ou "audit expert". Pour eviter les angles morts solo.
model: opus
allowed_tools: [Task, Read, Bash, Grep]
---

# Skill: Subagent Orchestrate (Crew of Experts)

## Mission

Lancer 5-10 subagents Explore en parallele sur des axes complementaires (perf, secu, archi, UX, AI safety, code qualite) + crew of experts internal qui debat + synthese finale avec contradictions resolues.

Reference Kevin : "Subagents au maximum" + "Concertation IA permanente" + "5+ subagents en parallele pour features non-triviales" (CLAUDE.md regle PERMANENTE).

## Pre-requis

- [ ] Avoir lu CLAUDE.md "SUBAGENTS AU MAXIMUM" + "CONCERTATION + MEMOIRE TOTALE"
- [ ] Connaitre le scope a auditer (file/feature/release)
- [ ] Tool Task disponible
- [ ] Identifier les axes pertinents pour le contexte

## Etapes (workflow 6 phases)

### Phase 0 - Decomposer le scope (5 min)

Ne JAMAIS lancer 1 subagent monolithique "audite tout". Decomposer en axes orthogonaux pour parallelisation max.

Axes typiques :
1. **Performance** : bundle size, FPS, memory, latency, repaints
2. **Securite** : OWASP, secrets leak, XSS, auth flow, CSP
3. **Architecture** : modularity, separation, code mort, declaration ≠ deployment
4. **Code Quality** : DRY, types, naming, complexity, comments
5. **UX/Accessibility** : mobile-first, ARIA, contrast, touch targets
6. **AI Safety** : prompt injection, hallucinations, tool abuse, refusal calibration
7. **Compliance** : RGPD, audit log, retention, consent
8. **Data Integrity** : sync, persistence, atomicity, backup
9. **Tests** : coverage, mutations, edge cases, e2e
10. **Devil's Advocate** : challenge l'approche, propose alternatives

### Phase 1 - Briefing chaque subagent (5 min)

Template :
```
SCOPE : <fichier/feature precis>
ROLE : <expert specialise>
LIVRABLE : Rapport markdown <= 500 mots, avec :
  - Score 0-10 sur l'axe
  - Top 3 findings P0/P1
  - 1 recommandation immediate
INTERDICTIONS :
  - Pas de redite des autres axes
  - Pas de "ca depend"
  - Score chiffre obligatoire
```

### Phase 2 - Lancement parallele (1 message, N tool calls) (3 min)

Tool calls dans le MEME message (parallel execution Claude Code) :

```typescript
// PSEUDO - en realite Task tool calls multiples dans un seul message
Task({
  subagent_type: 'Explore',
  description: 'Performance audit',
  prompt: 'Audite performance de apex-ai/v13/. Mesure bundle gzip, lazy chunks, memory leaks. Score /10 + top 3 P0/P1.'
});

Task({
  subagent_type: 'Explore',
  description: 'Security audit OWASP',
  prompt: 'Audite securite ASVS L2 de apex-ai/v13/services/auth/. Score /10 + top 3 findings + CVSS.'
});

Task({
  subagent_type: 'Explore',
  description: 'Architecture review',
  prompt: 'Audite architecture apex-ai/v13/. Modularity, code mort (ts-prune), DECLARATION ≠ DEPLOYMENT. Score /10 + top 3.'
});

Task({
  subagent_type: 'Explore',
  description: 'UX audit mobile',
  prompt: 'Audite UX apex-ai/v13/. Mobile 375px, touch targets 44px, ARIA, accessibility. Score /10.'
});

Task({
  subagent_type: 'Explore',
  description: 'Devil advocate',
  prompt: 'Challenge l approche v13 modulaire vs v12 monolithe. Argumente CONTRE le portage. 5 contre-arguments + 1 alternative.'
});
```

### Phase 3 - Crew of experts debat (10 min)

Apres reception des 5+ rapports, lancer subagents "expert reviewers" :

```typescript
Task({
  subagent_type: 'Plan',
  description: 'Synthesis expert reviewer',
  prompt: `5 audits paralleles ont produit ces rapports :
  
  --- Performance ---
  ${perfReport}
  
  --- Security ---
  ${secuReport}
  
  --- Architecture ---
  ${archiReport}
  
  --- UX ---
  ${uxReport}
  
  --- Devil Advocate ---
  ${devilReport}
  
  TACHE :
  1. Identifie les contradictions entre rapports
  2. Resous-les ou laisse-les ouvertes pour Kevin
  3. Synthese 1 page : top 5 P0 cross-axes
  4. Score global ponderé /100
  5. Verdict : OK PUSH / FIX FIRST / REFONTE
  `
});
```

### Phase 4 - Resolution contradictions (5 min)

Si 2 experts en desaccord :
- **Performance** dit "lazy load X"
- **Security** dit "ne lazy load PAS X (peut etre injecte)"

Solution : trouver compromis (lazy load avec hash integrity) OU laisser Kevin trancher.

Toujours rapporter les desaccords avec arguments cotes.

### Phase 5 - Plan d'action priorise (5 min)

Sortie finale :

```markdown
## Audit synthese - apex-ai/v13/ - 2026-05-04

### Score global : 78/100 (verdict : FIX FIRST)

### Top 5 P0 cross-axes :
1. [SECU] CSP unsafe-inline detected (CVSS 8.1) - skill `csp-strict-build`
2. [PERF] Bundle 95KB > budget 50KB - skill `refactor-code-dup` + lazy
3. [ARCHI] 8 helpers DECLARATION but not WIRED - skill `apex-v13-feature-port`
4. [UX] Touch targets < 44px on 12 buttons - fix CSS
5. [SECU] ax_user dans FB_FIX (regression #40) - skill `firebase-sync-debug`

### Detail par axe (scores) :
- Performance : 6/10 (bundle trop gros)
- Securite : 7/10 (CSP + #40 regression)
- Architecture : 8/10 (helpers orphelins)
- UX : 7/10 (touch targets)
- Code Quality : 9/10
- AI Safety : 9/10
- Compliance : 8/10

### Contradictions resolues :
- Performance vs Security sur lazy load → consensus : lazy + SubResource Integrity hash

### Recommandation finale :
FIX FIRST sur P0 1-5 (estime 2j) puis re-audit. Pas de push prod tant que score < 90.
```

### Phase 6 - Memoire des audits (3 min)

Stocker rapport pour comparer audits suivants :

```bash
# Sauvegarde
mkdir -p .claude/audits
cp /tmp/synthesis.md .claude/audits/audit-$(date +%Y%m%d).md

# Comparer avec audit precedent
PREV=$(ls -t .claude/audits/*.md | sed -n '2p')
diff <(grep "^Score global" $PREV) <(grep "^Score global" /tmp/synthesis.md)
```

Trend monitoring : score augmente (good), stable (warning), diminue (alert + bisect).

## Anti-patterns interdits

1. **1 subagent monolithique** : trop de scope, contexte sature, qualite degraded. Toujours decomposer en axes.
2. **Subagents sequentiels** : 1 par 1 = 5x plus lent. Toujours parallel (multiple tool calls dans 1 message).
3. **Pas de role specifique** : "audit le code" trop vague. Chaque agent = expert specialise (CISO, perf engineer, etc.).
4. **Skip Devil Advocate** : confirmer ses biais. Toujours 1 agent qui challenge.
5. **Synthese qui moyenne sans resoudre** : "X dit oui, Y dit non, on ne sait pas" = inutile. Toujours trancher avec argument.
6. **Pas de score chiffre** : "ca a l'air bon" non actionnable. Toujours /10 par axe + /100 global.
7. **Audit unique sans suivi** : 1 audit puis silence. Cron weekly + comparaison historique.
8. **Subagents qui se citent entre eux** : risque echo chamber. Chacun audite independamment, synthese fait le merge.
9. **Verdict mou** : "peut etre considerer..." = pas verdict. Toujours OK PUSH / FIX FIRST / REFONTE.

## Validation post-action

```bash
# 1. Au moins 5 rapports recus
# (Manuel : verifier les 5+ Task tool calls ont retourne du contenu)

# 2. Synthese contient les 4 sections
# - Score global
# - Top 5 P0
# - Detail par axe
# - Verdict
grep -cE "^### (Score global|Top 5|Detail|Verdict)" /tmp/synthesis.md  # = 4

# 3. Au moins 1 contradiction resolue (signe que les agents ne se sont pas alignes par echo chamber)
grep -E "Contradiction|Desaccord" /tmp/synthesis.md

# 4. Verdict explicite
grep -E "(OK PUSH|FIX FIRST|REFONTE)" /tmp/synthesis.md

# 5. Audit archive pour comparer trend
ls .claude/audits/*.md | wc -l
```

## Exemples concrets

### Exemple 1 : Audit pre-release Apex v13.0.20

**Contexte** : Kevin va merger PR v13.0.20 demain. Besoin audit complet.

**Action** :
```
Lancer 7 subagents en parallele :
1. Performance Engineer : bundle, perf runtime
2. CISO : OWASP ASVS L2 complete
3. Architect : modularity, code mort
4. UX Designer : mobile iPhone 375px, accessibility
5. AI Safety Researcher : prompt injection, hallucinations
6. Compliance Officer : RGPD, audit log
7. Devil's Advocate : argumente CONTRE le merge
```

**Resultat** : Synthese 1 page, score 82/100, 3 P0 a fix avant merge (estime 4h). Push apres fix → score 94/100.

### Exemple 2 : Decision architecturale (vault chiffrement)

**Contexte** : Faut-il PBKDF2 ou Argon2id pour le vault ?

**Action** :
```
3 subagents experts :
1. Cryptographer : techniquement quel est mieux ?
2. Performance : impact runtime des 2
3. Compatibility : support browser
```

**Synthese** : Argon2id meilleur theoriquement, mais Web Crypto API ne le supporte pas (juin 2026). PBKDF2 200k OK en attendant. Re-audit dans 6 mois quand Argon2id supporte.

## Integration avec autres skills

- **Avant** : tout skill (orchestrate peut auditer le travail de tout autre skill)
- **Pendant** : peut etre invoque a mi-parcours pour validation 2nd avis
- **Apres** : `commit-quality-gate` (verdict avant push)
- **Cross** : tous les skills d'audit (`security-audit-owasp`, `perf-budget-check`, `audit-parity-v12-v13`)

## References

- CLAUDE.md "SUBAGENTS AU MAXIMUM"
- CLAUDE.md "CONCERTATION + MEMOIRE TOTALE"
- CLAUDE.md "AUDIT EXTERIEUR INDEPENDANT EN CONTINU"
- Crew of Experts pattern : https://www.anthropic.com/research
- Multi-agent debate : https://arxiv.org/abs/2305.14325
