---
name: apex-mcp-bofip
description: Connecte Apex au MCP BOFiP (Bulletin Officiel Finances Publiques) — doctrine fiscale francaise officielle. Apex consulte AVANT de repondre sur fiscalite FR.
when_to_use: User pose question fiscale/TVA/IR/impot/abattement/plus-value/cotisation/declaration FR.
model: sonnet
allowed_tools: [mcp_bofip_search, mcp_bofip_get_document]
---

# Skill : apex-mcp-bofip

## Mission

Apex consulte le serveur MCP officiel `mcp.openlegi.fr/bofip/mcp` AVANT de repondre a une question fiscale francaise. La doctrine fiscale officielle (BOFiP) prime sur les connaissances pre-entrainement.

## Activation

URL MCP : `https://mcp.openlegi.fr/bofip/mcp?token=<KEVIN_TOKEN>`

Kevin colle l'URL complete (avec token) une seule fois dans Coffre Apex → Apex enregistre auto dans `ax_mcp_servers` registry + active client MCP.

## Quand l'invoquer (auto)

Apex IA appelle `mcp_bofip_search` AUTOMATIQUEMENT si user mentionne :

- TVA, IR, IS, CFE, CVAE
- Impot revenu, impot sur les societes
- Plus-value (mobiliere, immobiliere)
- Abattement, exoneration, deduction
- Credit d'impot, reduction d'impot
- Pinel, Denormandie, Censi-Bouvard
- Quotient familial, parts fiscales
- LMNP, LMP, BIC, BNC, BA
- Declaration 2042, 2044, 2031, 2035
- Cotisations sociales, URSSAF
- TVA jeux de casino (specifique Kevin SBM)

## Workflow

1. **Detection intent fiscale** dans message user
2. **Query MCP BOFiP** : `mcp_bofip_search({query: "TVA jeux casino", filters: {...}})`
3. **Recuperation document** : si reference precise → `mcp_bofip_get_document({ref: "BOI-TVA-LIQ-30-..."})`
4. **Citation obligatoire** : reference BOI-* + date + numero paragraphe
5. **Disclaimer** : "Indicatif, consulter expert-comptable pour decision"

## Format reponse Apex attendue

> Selon BOFiP **BOI-TVA-CHAMP-20-50-30-10** §150 (publie 2024-03-15), la TVA sur les recettes brutes de jeux de casino agree est de **0%** (exoneration art. 261 E CGI).
> 
> **Source officielle** : https://bofip.impots.gouv.fr/bofip/...
> 
> *Indicatif - confirmer avec votre expert-comptable pour decision finale.*

## Cache + perf

- LRU cache 50 entries, TTL 24h (BOFiP change rarement)
- Si MCP server KO → fallback recherche Google "site:bofip.impots.gouv.fr"
- Sentinelle `mcp-health-watch` ping toutes 30min

## Anti-patterns

1. **Repondre fiscal sans consulter BOFiP** → INTERDIT pour FR
2. **Citer ancien BOFiP** sans verifier date publication → toujours date courante
3. **Token MCP en clair** dans code → chiffrer Vault Apex
4. **Disclaimer absent** → toujours rappeler "indicatif"

## Securite

- Token stocke chiffre AES-GCM-256 dans Vault Apex
- `axRedactOutbound` masque token dans logs
- Sentinelle `mcp-health-watch` detecte 401 → notif Kevin renew

## References

- BOFiP : Bulletin Officiel des Finances Publiques (impots.gouv.fr/bofip)
- MCP server : OpenLegi (https://mcp.openlegi.fr)
- Pattern Apex : `apex-ai/v13/services/ai/mcp-client.ts` + `mcp-registry.ts`
- Vue admin : `?view=mcp-servers`
