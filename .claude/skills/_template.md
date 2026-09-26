---
name: _template
description: Template pour creer de nouveaux skills experts. Copier ce fichier et remplir chaque section.
when_to_use: Reference uniquement. Ne pas invoquer directement.
model: sonnet
allowed_tools: [Read, Edit, Bash, Grep, Glob]
---

# Skill: <Nom du skill>

## Mission

<1-2 phrases : objectif principal du skill, valeur ajoutee, niveau attendu (expert pro 200 EUR/h).>

Exemple : Auditer la securite OWASP ASVS L2 d'un module sensible (auth, vault, paiement) en 6 phases reproductibles, avec score chiffre /100 et liste P0/P1/P2/P3 des findings.

## Pre-requis

- [ ] Avoir lu CLAUDE.md (regles permanentes Kevin)
- [ ] Connaitre la structure du repo (apex-ai/, index.html racine pour CMCteams)
- [ ] Avoir acces aux outils : <liste outils>
- [ ] Avoir lu les skills relies : <liste cross-references>

## Etapes (workflow detaille)

### Phase 0 - Setup (2 min)
1. Lire le contexte (CLAUDE.md + fichier cible)
2. Identifier la zone d'impact via matrice (CLAUDE.md Phase 0)
3. Sauvegarder l'etat avant modif (`git status`, `git diff`)

### Phase 1 - Analyse (5-10 min)
1. <action concrete>
2. <action concrete>
3. <action concrete>

### Phase 2 - Action (10-30 min)
1. <action concrete avec commande Bash si applicable>
2. <action concrete>

### Phase 3 - Validation (5 min)
1. <commande Bash de validation>
2. <verification visuelle>

### Phase 4 - Documentation
1. Mettre a jour CLAUDE.md "Erreurs connues" si nouveau bug detecte
2. Mettre a jour MEMO_RESUME.md si action significative
3. Mettre a jour KEVIN_INVENTORY.md si nouveau fichier cree

## Anti-patterns interdits

1. **<Anti-pattern 1>** : <pourquoi c'est interdit + reference erreur connue CLAUDE.md si applicable>
2. **<Anti-pattern 2>** : <pourquoi>
3. **<Anti-pattern 3>** : <pourquoi>
4. **<Anti-pattern 4>** : <pourquoi>
5. **<Anti-pattern 5>** : <pourquoi>

## Validation post-action

```bash
# Commande 1 : <description>
<commande exacte>

# Commande 2 : <description>
<commande exacte>

# Commande 3 : <description>
<commande exacte>
```

Resultat attendu : <ce qu'on doit voir pour considerer le skill reussi>.

Si echec : <action corrective + skill alternatif a invoquer>.

## Exemples concrets

### Exemple 1 : <cas d'usage typique>

**Contexte** : <situation>.

**Action** :
```bash
<commande ou code>
```

**Resultat** :
```
<output attendu>
```

### Exemple 2 : <cas plus complexe>

**Contexte** : <situation>.

**Action** :
```javascript
// Code exemple
```

**Resultat** : <ce qu'on obtient>.

## Integration avec autres skills

- **Avant d'invoquer ce skill** : invoquer `<skill-prerequisite>` pour <raison>
- **Apres ce skill** : invoquer `<skill-followup>` pour <raison>
- **En parallele** : peut tourner avec `<skill-parallel>` pour <raison>

## References

- CLAUDE.md section "<section pertinente>"
- Erreur connue #<num> si applicable
- Skill relie `<autre-skill>.md`
