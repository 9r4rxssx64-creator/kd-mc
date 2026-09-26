---
name: apex-mcp-almanac
description: Almanac MCP — Deep Research Agent. Apex devient un agent de recherche approfondie multi-sources web/academique.
when_to_use: User demande "recherche approfondie", "deep research", "analyse complete sujet X", "rapport detaille".
model: sonnet
allowed_tools: [mcp_almanac_research, mcp_almanac_synthesize]
---

# Skill : apex-mcp-almanac

## Mission

Apex utilise Almanac MCP (Show HN 346 pts, github openalmanac) pour transformer Apex en agent de Deep Research : exploration multi-sources, synthese, citations, rapport structure.

## Activation

URL MCP : `https://mcp.openalmanac.dev/` (a confirmer endpoint exact via discovery)

Token Kevin colle 1 fois dans Vault → registry auto.

## Quand l'invoquer (auto)

- "fais-moi une recherche approfondie sur X"
- "analyse complete de Y", "etat de l'art de Z"
- "rapport detaille marche X", "veille technologique Y"
- Requete complexe necessitant > 3 sources
- User mentionne "Deep Research" explicitement

## Workflow Deep Research

### Phase 1 — Planning (Almanac generation)
Almanac decompose le sujet en sous-questions :
- 5-10 sous-questions structurees
- Mapping sources potentielles (Web, academic, news, social)
- Plan de recherche estime (temps + couts)

### Phase 2 — Multi-source crawl
- Web search (Brave, Tavily, Bing)
- Academic (arxiv, Semantic Scholar, Google Scholar)
- News (NewsAPI, RSS)
- Specialized (BOFiP si fiscal, Legal Hunter si juridique)
- Social signals (HackerNews, Reddit) avec ponderation

### Phase 3 — Synthesis
- Cross-reference findings (consensus / conflits)
- Identifie sources les plus citees
- Genere rapport markdown structure (TL;DR + sections + citations + sources)

### Phase 4 — Output
- Markdown report (telechargeable via `apex-generate-pdf` si demande)
- Liste sources verifiees (URLs alive)
- Score confiance par claim (high/med/low)

## Format input

```json
{
  "topic": "Sujet de recherche",
  "depth": "shallow | medium | deep",
  "sources": ["web", "academic", "news", "specialized"],
  "max_duration_min": 5,
  "output_format": "markdown | pdf | docx"
}
```

## Format output

```json
{
  "report": "# TL;DR\n\n...\n\n## Section 1\n...",
  "sources": [
    {"url": "...", "title": "...", "date": "...", "type": "academic", "cited_count": 5}
  ],
  "duration_actual_sec": 287,
  "tokens_used": 45000,
  "cost_eur": 0.34,
  "confidence_overall": 0.87
}
```

## Anti-patterns

1. **Lancer deep research pour question simple** → INTERDIT (cher + lent)
2. **Pas de citations** dans rapport → INTERDIT (hallucinations)
3. **Sources non verifiees alive** → check HEAD 200 OK
4. **Auto-lancer sans confirm Kevin** si depth=deep (cost > 1€)

## References

- Almanac MCP : Show HN 346 pts (github.com/openalmanac)
- Pattern : Deep Research as a Service
- Apex integration : `apex-ai/v13/services/ai/mcp-client.ts`
- Vue : `?view=research`
