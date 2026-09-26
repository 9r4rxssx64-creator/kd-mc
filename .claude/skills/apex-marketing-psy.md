---
name: apex-marketing-psy
description: 23 frameworks marketing psychologie (Cialdini, AIDA, FOMO, scarcity, social proof, anchoring). Genere copy persuasif.
when_to_use: User demande "landing page", "headline", "pitch", "copy", "marketing", "annonce", "campagne".
model: sonnet
allowed_tools: [generate_marketing_copy]
---

# Skill : apex-marketing-psy

## Mission

Apex utilise les principes de psychologie marketing pour generer du copywriting persuasif et ethique. Inspire de "Marketing Psy" (Shubham Sharma 5 skills).

## Frameworks integres (23)

### Cialdini 7 principles
1. Reciprocity (donner avant de demander)
2. Commitment & Consistency
3. Social Proof
4. Authority
5. Liking
6. Scarcity
7. Unity

### Sales frameworks
8. AIDA (Attention, Interest, Desire, Action)
9. PAS (Problem, Agitation, Solution)
10. BAB (Before, After, Bridge)
11. 4 P's (Promise, Picture, Proof, Push)
12. ACCA (Awareness, Comprehension, Conviction, Action)

### Behavioral triggers
13. Loss aversion (perdre > gagner)
14. Anchoring (1ere reference)
15. FOMO (Fear Of Missing Out)
16. Goal gradient (proximite recompense)
17. Decoy effect (3eme option pour pousser vers 2eme)
18. Reciprocity (cadeau initial)

### Copy patterns
19. Hook (1ere phrase = 80% engagement)
20. Curiosity gap (titre intrigue, body resout)
21. Specificity (chiffres precis > vagues)
22. Power words (free, you, instant, now)
23. Storytelling arc (problem → struggle → resolution)

## Output

```json
{
  "framework_used": "AIDA + Cialdini Social Proof + Scarcity",
  "copy": {
    "headline": "Le seul outil que 247 designers utilisent quotidiennement",
    "subheadline": "Restez parmi les 12% qui... (avant que ce soit ferme)",
    "body": "...",
    "cta": "Reserver ma place (3 restantes)",
    "psychology_breakdown": "Social proof 247 + Authority designers + Scarcity 12% + FOMO ferme + Scarcity 3 restantes"
  }
}
```

## Ethique

Apex refuse de generer du copy :
- Manipulatoire dangereux (sante, financier sans warning)
- Faux temoignages
- Faux scarcity ("3 restantes" si stock illimite)
- Targeting populations vulnerables (mineurs, deuil, addictions)

## Anti-patterns

1. **Faux scarcity** → INTERDIT (loi consommation FR)
2. **Faux temoignages** → INTERDIT
3. **Targeting mineurs** sans verification age → INTERDIT
4. **Sans disclaimer** sur claims sante/finance → toujours

## References

- Robert Cialdini : "Influence" (1984 + 2021 ed.)
- "Marketing Psy" skill (Shubham Sharma TikTok)
- Pattern Apex : `apex-ai/v13/services/integrations/marketing-psy.ts`
- Vue : `?view=studio-marketing`
