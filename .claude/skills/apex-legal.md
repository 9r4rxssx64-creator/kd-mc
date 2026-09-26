---
name: apex-legal
description: Section Avocat / Droit pour Apex — suite juridique officielle Anthropic (claude-for-legal) + Legal Data Hunter. Contrats/NDA, M&A, droit du travail, RGPD, contentieux, réglementaire, PI, gouvernance IA.
when_to_use: User dit "contrat", "NDA", "clause", "avocat", "droit", "juridique", "litige", "contentieux", "RGPD/GDPR", "DPA", "conformité", "M&A", "due diligence", "marque", "brevet", "licenciement", "mise en demeure", "CGU/CGV", "légal".
model: sonnet
allowed_tools: [mcp_legal_search]
---

# Skill : apex-legal (Section Avocat / Droit)

## Mission

Donner à Apex IA une compétence juridique de niveau cabinet : la suite **officielle
Anthropic** `claude-for-legal` (12 modules, 151 skills, Apache-2.0) vendorée dans
`.claude/legal/claude-for-legal/`, combinée à la recherche jurisprudentielle déjà
intégrée (Legal Data Hunter `mcp_legal_search`, 18M docs, 110 pays) et au module
Apex Légal Pro existant (18+ codes FR + Cass/CE/CJUE/CEDH + Monaco).

> Assistance aux workflows juridiques, **pas un avis juridique**. Toujours conclure par
> une mention de prudence (validation par un avocat qualifié).

## Domaines couverts

⚖️ Commercial (contrats/NDA/SaaS/CGV) · 🏢 Corporate & M&A (due diligence, board) ·
👥 Droit du travail (contrat, licenciement, RH) · 🔐 Privacy/RGPD (DPA, PIA, DSAR) ·
🥊 Contentieux (mise en demeure, subpoena, legal hold) · 📋 Réglementaire (veille, gaps) ·
💡 Propriété intellectuelle (marque, brevet, licence) · 🤖 Gouvernance IA (AI Act, inventaire) ·
🚀 Droit produit (revue lancement, claims marketing).

## Auto-utilisation

Quand l'utilisateur mentionne un sujet juridique :
1. **Recherche de droit/jurisprudence** (article, ECLI, CELEX, multi-pays) → `mcp_legal_search` D'ABORD.
2. **Workflow structuré** (revue de contrat, DPA, due diligence, mise en demeure…) → appliquer la
   méthodologie du module `claude-for-legal` correspondant (cf. `.claude/skills/legal/SKILL.md`).
3. **Citer les sources** + mention de prudence systématique.
4. Pour générer un livrable (.docx/.pdf) → `generate_docx` / `generate_pdf` (jamais markdown brut).

## Anti-patterns interdits

1. **Donner un avis juridique ferme** sans mention de prudence → toujours « à faire valider par un avocat ».
2. **Inventer une jurisprudence / un article** → vérifier via `mcp_legal_search`, sinon dire « non vérifié ».
3. **Confondre juridictions** (FR vs Monaco vs EU vs US) → préciser le droit applicable.
4. **Stocker des données sensibles** d'un dossier client sans le tier-isolation Apex.

## Références
- Suite vendorée : `.claude/legal/claude-for-legal/` (anthropics, Apache-2.0)
- Orchestrateur Claude Code : `.claude/skills/legal/SKILL.md` (`/legal`)
- MCP : `mcp_legal_search` (Legal Data Hunter), `lawvable_search_skills` (catalogue tiers)
- Module Apex existant : Légal Pro (codes FR + jurisprudence + Monaco)
