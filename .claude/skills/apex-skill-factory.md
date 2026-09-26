---
name: apex-skill-factory
description: Meta-skill — permet a Apex de creer ses propres nouvelles competences depuis le chat admin Kevin. Equivalent web-app de skill-creator Anthropic.
when_to_use: Admin Kevin dit "cree un skill X", "ajoute une competence Y", "Apex apprend a faire Z" — meta-action sur l'app Apex elle-meme.
model: sonnet
allowed_tools: [create_skill, validate_skill, list_skills]
---

# Skill : apex-skill-factory

## Mission

Apex peut creer **dynamiquement** de nouveaux skills depuis le chat admin Kevin, sans deploiement. Le nouveau skill est :

1. Genere au format SKILL.md (frontmatter + structure standard)
2. Valide (preflight test)
3. Stocke dans `ax_apex_skills_registry` (FB_FIX shared)
4. Injecte au boot suivant dans le system prompt Apex IA
5. Active immediatement (pas besoin restart)

**Restriction stricte** : admin Kevin uniquement (tier admin). Autres tiers : lecture seule.

## Workflow

### Phase 1 — Brief
Kevin dit : "Apex, cree-moi un skill qui fait X". Apex demande :
- Nom du skill (slug kebab-case)
- Description courte (1-2 phrases)
- When to use (mots-cles trigger)
- Tools requis (parmi tools registry existants)
- Anti-patterns connus

### Phase 2 — Generation
Apex genere un fichier SKILL.md avec :
- Frontmatter conforme (`name`, `description`, `when_to_use`, `model`, `allowed_tools`)
- Sections obligatoires (Mission, Quand l'invoquer, Format input/output, Anti-patterns, References)
- Validation par schema (Zod)

### Phase 3 — Validation
- Linter markdown (frontmatter parsable, sections presentes)
- Test mental : "Si je donne ce skill a Apex IA, peut-elle l'utiliser sans demander info supplementaire ?"
- Si OK → store registry

### Phase 4 — Activation
- Push dans `ax_apex_skills_registry` (FB_FIX synced cross-device)
- Toast Kevin : "✅ Skill X cree et actif"
- Au prochain build de system prompt, Apex IA voit le nouveau skill

## Format skill genere

```yaml
---
name: my-new-skill
description: Description courte
when_to_use: Conditions de trigger
model: sonnet
allowed_tools: [tool1, tool2]
---

# Skill : my-new-skill

## Mission
...

## Quand l'invoquer (auto)
...

## Format input
```json
{ ... }
```

## Anti-patterns
1. ...
```

## Anti-patterns du skill-factory lui-meme

1. **Creer skill non-admin** → INTERDIT (tier admin only)
2. **Override skill existant sans confirm** → toujours confirmer Kevin
3. **Skill sans validation** → preflight obligatoire
4. **Skill qui appelle tools forbidden** → blocklist enforced
5. **Stockage en clair de credentials** dans skill → INTERDIT

## Securite

- Skill cree ne peut PAS appeler `eval`, `new Function`, exec arbitraire
- Tools whitelist enforced par `apex-tools-registry`
- Audit log immutable pour chaque creation
- Rollback possible : `axDeleteSkill(name)` (admin only)

## References

- Inspire de : Anthropic Skill Creator (.claude/skills/skill-creator)
- Pattern Apex : `apex-ai/v13/services/apex-tools-registry/skills-tools.ts`
- Vue admin : `?view=skill-factory`
