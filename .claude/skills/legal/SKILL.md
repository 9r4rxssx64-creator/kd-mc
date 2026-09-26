---
name: legal
description: "Section Avocat / Droit — suite juridique officielle Anthropic (claude-for-legal). Revue de contrats/NDA, M&A & diligence, droit du travail, RGPD/privacy, contentieux, réglementaire, propriété intellectuelle, gouvernance IA, droit produit. Déclencheurs : contrat, NDA, clause, avocat, droit, juridique, litige, contentieux, RGPD/GDPR, DPA, conformité, M&A, due diligence, marque, brevet, licenciement, mise en demeure, CGU/CGV, légal."
user-invokable: true
argument-hint: "[domaine] [document/question]"
license: Apache-2.0
metadata:
  source: anthropics/claude-for-legal
  category: legal
---

# Section Avocat / Droit — claude-for-legal (officiel Anthropic)

Suite juridique **officielle Anthropic** vendorée dans ce repo :
`.claude/legal/claude-for-legal/` — 12 modules, 151 skills, 10 agents (Apache-2.0).

> Note pro : assistance aux workflows juridiques, **pas un avis juridique**. Pour toute
> décision importante, faire valider par un avocat qualifié (cf. règle Kevin « mention prudence »).

## Domaines (modules) et quand les utiliser

| Domaine | Module vendoré | Utiliser quand l'utilisateur parle de… |
|---|---|---|
| ⚖️ **Commercial** | `commercial-legal/` (12) | contrat fournisseur, NDA, SaaS, CGV/CGU, renouvellement, playbook achat/vente |
| 🏢 **Corporate / M&A** | `corporate-legal/` (13) | due diligence, M&A, tableau de revue, board minutes, conformité entité |
| 👥 **Droit du travail** | `employment-legal/` (20) | contrat de travail, licenciement, embauche, harcèlement, politique RH |
| 🔐 **Privacy / RGPD** | `privacy-legal/` (9) | RGPD/GDPR, DPA, PIA/AIPD, DSAR, transfert de données, registre traitements |
| 🥊 **Contentieux** | `litigation-legal/` (19) | litige, mise en demeure, subpoena, chronologie, dépôt, legal hold, privilège |
| 📋 **Réglementaire** | `regulatory-legal/` (9) | veille réglementaire, gap analysis, refonte de politique, commentaires |
| 💡 **Propriété intellectuelle** | `ip-legal/` (12) | marque, brevet, copyright, licence, claim chart, FTO |
| 🤖 **Gouvernance IA** | `ai-governance-legal/` (10) | gouvernance IA, inventaire IA, risque modèle, AI Act |
| 🚀 **Droit produit** | `product-legal/` (7) | revue de lancement, claims marketing, « est-ce un problème ? » |
| 🎓 Apprentissage | `law-student/` (13), `legal-clinic/` (16) | étudiant en droit, clinique juridique |
| 🛠 Méta | `legal-builder-hub/` (10) | créer/personnaliser un skill juridique |

## Comment répondre à une demande `/legal`

1. **Identifier le domaine** (table ci-dessus) d'après la demande.
2. **Lire le skill pertinent** du module vendoré, p.ex. :
   `.claude/legal/claude-for-legal/commercial-legal/skills/<skill>/SKILL.md`
   (lister `ls .claude/legal/claude-for-legal/<module>/skills/` pour voir les skills dispo).
3. **Appliquer la méthodologie** du skill (intake → analyse → livrable). Respecter
   `user-invocable` : certains sous-skills sont orchestrés par l'entrée du module.
4. **Citer les sources** quand le droit est cité (article, règlement, jurisprudence) et
   **toujours** rappeler la mention de prudence (validation avocat).

## Installation complète en plugins (optionnel, mécanisme officiel)

Pour activer les modules comme **plugins Claude Code** (commandes `/<module>:...`) :
```
/plugin marketplace add .claude/legal/claude-for-legal
/plugin install commercial-legal@claude-for-legal
/plugin install employment-legal@claude-for-legal   # etc.
```

## Cross-références

- Recherche jurisprudence multi-pays (18M docs, 110 pays) : MCP **Legal Data Hunter**
  (`mcp_legal_search` / skill `apex-mcp-legal-hunter`).
- Apex IA : skill `apex-legal` (parité — Apex connaît cette section et l'utilise).
- Catalogue de skills juridiques tiers : MCP **Lawvable** (`lawvable_search_skills`).

## Références
- Source : `anthropics/claude-for-legal` (Apache-2.0) — `.claude/legal/claude-for-legal/`
- `QUICKSTART.md`, `README.md`, `CLAUDE.md` du dépôt vendoré pour le détail par module.
