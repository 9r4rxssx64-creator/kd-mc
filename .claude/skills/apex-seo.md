---
name: apex-seo
description: Audit SEO on-page expert (technique, E-E-A-T, Schema.org, GEO/AI Overviews, images, maillage). Score /100 + findings P0/P1/P2 + plan d'action. Parité du skill Claude Code claude-seo (MIT).
when_to_use: User dit "SEO", "audit SEO", "référencement", "Core Web Vitals", "schema", "structured data", "AI Overviews", "SGE", "GEO", "page speed", "analyse cette page", "rich results", "E-E-A-T".
model: sonnet
allowed_tools: [seo_audit]
---

# Skill : apex-seo

## Mission

Donner à Apex IA la même compétence SEO que le skill Claude Code `seo`
(AgriciDaniel/claude-seo v2.0.0, MIT — vendored dans `.claude/skills/seo/` +
24 sous-skills `.claude/skills/seo-*/` + 18 agents `.claude/agents/seo-*.md`).
Niveau expert pro 200 €/h, recommandations falsifiables ancrées sur les
Google Search Essentials + Quality Rater Guidelines (E-E-A-T) + GEO 2026.

## Déclencheur — auto-invocation (PAS en option)

Dès que l'utilisateur mentionne SEO / référencement / audit de page /
Core Web Vitals / schema / AI Overviews / GEO → Apex appelle `seo_audit`
SANS demander confirmation, puis présente :

1. **Score /100 + grade** (A+ → F)
2. **Findings priorisés** P0 (bloquant) → P1 (important) → P2 (amélioration)
3. **Plan d'action** concret (le `fix` de chaque finding)
4. **Synthèse E-E-A-T / GEO** (citabilité AI Overviews/ChatGPT/Perplexity)

## Couverture (8 catégories, parité claude-seo)

| Catégorie | Vérifie |
|---|---|
| Technique | title, meta description, canonical, robots/noindex, viewport, lang, hreflang |
| Contenu / E-E-A-T | H1 unique, hiérarchie Hn, profondeur (mots), thin content |
| Schema.org | JSON-LD détecté + types (Article, Organization, FAQPage, BreadcrumbList...) |
| Social / GEO | Open Graph, Twitter Card, passages auto-suffisants pour citation IA |
| Images | couverture alt, lazy-loading |
| Liens | maillage interne, liens externes |

Pour un audit MULTI-PAGES / crawl complet / backlinks / local / e-commerce /
international : invoquer le skill Claude Code `seo` (`/seo audit <url>`) qui
orchestre les 24 sous-skills + 18 agents et les scripts Python.

## Tool

`seo_audit({ url, mode?, ai_synthesis? })`
- `url` (requis) : page http(s) à auditer
- `mode` : `page` (on-page complet, défaut) | `geo` (focus citabilité IA)
- `ai_synthesis` : true par défaut (synthèse E-E-A-T/GEO via IA)

Service : `apex-ai/v13/services/integrations/seo-audit.ts` (`seoAudit.analyze`).
100% client-side, aucune clé API requise (repli proxy `ax_proxy_url` si CORS).
Historique : `apex_v13_seo_audit_history` (30 derniers).

## Anti-patterns interdits

1. **Demander confirmation** avant d'auditer alors que l'intent SEO est clair → auto-invoquer.
2. **Inventer des métriques** non mesurées (ex : "DA 45") → ne rapporter que les signaux réellement extraits du HTML.
3. **Conseils génériques** ("améliorez votre SEO") → toujours falsifiable + actionnable (le `fix` de chaque finding).
4. **Masquer l'échec fetch** → si la page n'est pas récupérable, dire la cause exacte (CORS / 4xx / timeout) + proposer le proxy.
5. **Sur-promettre le ranking** → SEO = signaux probabilistes, jamais de garantie de position.

## Références

- Skill source : `.claude/skills/seo/SKILL.md` (claude-seo v2.0.0, MIT, AgriciDaniel)
- Service Apex : `apex-ai/v13/services/integrations/seo-audit.ts`
- Tool : `seo_audit` (registry `apex-tools-registry/skills-tools.ts`, dispatch `skills-dispatch.ts`)
- Prompt auto-use : `core/memory.ts` section "Skills 2026 ACTIFS"
