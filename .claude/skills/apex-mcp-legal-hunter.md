---
name: apex-mcp-legal-hunter
description: Connecte Apex au MCP Legal Data Hunter — 18M+ documents juridiques 110+ pays (case law, legislation, doctrine). Recherche juridique multi-juridiction.
when_to_use: User pose question juridique multi-pays, recherche jurisprudence, droit compare, citation legale.
model: sonnet
allowed_tools: [mcp_legal_search, mcp_legal_get_document, mcp_legal_resolve_reference]
---

# Skill : apex-mcp-legal-hunter

## Mission

Apex utilise le MCP Legal Data Hunter pour recherche juridique professionnelle : 18M+ documents (jurisprudence, lois, doctrine) couvrant 110+ pays. Aligne avec methodologie : discovery hierarchy → search → citation.

## Activation

Deja connecte cote Claude Code session via MCP server `09c5c6ea-6b1f-408d-b42a-832fea8495f5`. A propager cote Apex en passant via le meme provider OAuth.

## Quand l'invoquer (auto)

- Question droit du travail FR + comparaisons UE
- Jurisprudence Cassation, Conseil d'Etat, CJUE, CEDH
- Codes etrangers (US, UK, Suisse, Allemagne, Italie)
- Conflits de lois internationaux
- Articles legaux precis avec numero
- ECLI, CELEX references

## Workflow methodologique (du serveur MCP)

### 3-level discovery hierarchy

1. **`discover_countries`** : liste pays disponibles + counts (utilise si pas sur que pays soit couvert)
2. **`discover_sources(country_code)`** : liste sources (cours, codes) + tiers + dates + langues
3. **`get_filters(source)`** : valeurs distinctes pour jurisdiction, subdivision, chambres, types decisions

JAMAIS guess values → confirmer via discovery.

### Puis search

4. **`mcp_legal_search(country, namespace, query)`** : hybrid semantic + keyword
5. **`mcp_legal_get_document(source, source_id)`** : texte complet
6. **`mcp_legal_resolve_reference(reference)`** : ECLI, CELEX, numero affaire → record exact

## Citations OBLIGATOIRES

Toute reponse juridique Apex DOIT inclure citations inline :

> Selon Cass. soc. 12 mai 2026, n°23-12.345 [ECLI:FR:CCAS:2026:SO.12345], publie au Bulletin, la rupture conventionnelle exige... 
> 
> Voir aussi CJUE C-456/22 (15 fev 2024) sur l'interpretation de la directive 2019/1158.

Format : `<Cour> <date>, <numero>, [ECLI/CELEX]`.

## Output template

```json
{
  "query": "rupture conventionnelle indemnite",
  "results": [
    {
      "source": "cass.soc",
      "source_id": "23-12345",
      "ecli": "ECLI:FR:CCAS:2026:SO.12345",
      "date": "2026-05-12",
      "court": "Cour de cassation, chambre sociale",
      "summary": "Indemnite legale minimale non derogeable...",
      "excerpt": "L'art. L1237-13 du Code du travail...",
      "relevance_score": 0.92
    }
  ],
  "total_count": 47,
  "disclaimer": "Indicatif, consultation avocat recommandee."
}
```

## Anti-patterns (du serveur MCP)

1. **Guess values** au lieu de `get_filters` → INTERDIT (3-level hierarchy)
2. **Pas de citations inline** dans reponse → INTERDIT
3. **Sources non aggressivement reportees** via `report_source_issue` si data quality issue
4. **Donnee privacy** sensible (PII) → masquer avant affichage

## Securite

- OAuth flow MCP standard (modelcontextprotocol.io upstream auth)
- Refresh token rotation
- Pas de stockage donnees client MCP au-dela session

## References

- Legal Data Hunter MCP : provider `mcp.openlegi.fr/legal` (probablement)
- Methodology : Free-form output, inline citations obligatoires
- Pattern Apex : `apex-ai/v13/services/ai/mcp-client.ts`
- Skill complementaire : `apex-mcp-bofip.md` (fiscal FR specialise)
