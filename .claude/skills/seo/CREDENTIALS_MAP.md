# SEO ↔ tes secrets existants (Kevin 2026-05-30)

Mapping intelligent : quelles capacités SEO sont couvertes par les secrets que tu as DÉJÀ
(aucune création de compte). Mis à jour d'après ta liste GitHub Secrets.

| Capacité SEO | Secret réutilisé | État | Note |
|---|---|---|---|
| **PageSpeed + CrUX** (Core Web Vitals terrain) | `GEMINI_API_KEY` → sinon `FIREBASE_WEB_API_KEY` | ✅ auto (fallback codé) | Valide si l'API PageSpeed/CrUX est activée sur le projet Google de la clé. Sinon : 1 toggle dans Google Cloud (pas de nouvelle clé). |
| **Images SEO / OG / hero** | `GEMINI_API_KEY` (nanobanana-mcp) | ✅ connecté | `.mcp.json`. Alternative gratuite : `PEXELS_API_KEY` (banque d'images). |
| **Recherche SERP / web** | `TAVILY_API_KEY` | ✅ dispo | Remplace la recherche payante ; quota free-tier. |
| **Visibilité IA / Share of Voice (GEO)** | `ANTHROPIC_API_KEY`, `OPEN_AI_API_KEY`, `PERPLEXITI_API_KEY`, `GEMINI_API_KEY` | ✅ via Apex `seo_ai_visibility` | Remplace Profound (payant), multi-LLM. |
| **GSC / GA4 / Indexing** (positions, clics, trafic) | `YOUTUBE_CLIENT_ID` + `YOUTUBE_CLIENT_SECRET` (même app OAuth Google) | 🟡 1 consentement | Le client OAuth existe ; il faut ré-autoriser avec les scopes GSC/GA4 (écran Google, ton accord). Cf. GOOGLE_SETUP.md niveau 2. |
| **Crawl JS / sitemap** | `FIRECRAWL_API_KEY` | ⚪ absent de tes secrets | `seo-firecrawl` marche sans (repli `render_page.py`). Ajoute la clé free-tier si tu veux le crawl Firecrawl. |
| **Backlinks** | — (Common Crawl + Moz free + Bing) | ✅ gratuit natif | Aucune clé requise. `OPENPAGERANK_API_KEY` (free) en bonus. |

## Conséquence concrète

- **Core Web Vitals réels** : actifs dès que `GEMINI_API_KEY` (ou `FIREBASE_WEB_API_KEY`) est dans
  l'environnement de ta session — **aucune nouvelle clé**. Si erreur « API not enabled », active
  *PageSpeed Insights API* + *Chrome UX Report API* sur le projet (1 clic, gratuit).
- **GSC/GA4** = la seule capacité nécessitant ton consentement OAuth (irréductible).

## Sécurité
Aucune valeur de secret n'est écrite dans le repo : uniquement des **noms de variables d'env**.
Le fallback de clé est dans `scripts/google_auth.py` (chaîne `GOOGLE_API_KEY` → `PAGESPEED_API_KEY`
→ `GEMINI_API_KEY` → `FIREBASE_WEB_API_KEY`).
