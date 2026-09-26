# Alternatives GRATUITES aux services payants (Kevin 2026-05-30)

Politique du projet : **toujours utiliser les chemins gratuits par défaut.** Les extensions payantes
(DataForSEO, Ahrefs, SE Ranking, Profound) ne sont PAS installées. Voici comment couvrir
les mêmes besoins sans abonnement. Les sources « clé gratuite » utilisent des comptes free-tier
ou des clés que Kevin possède déjà (Anthropic/OpenAI/Perplexity/Gemini/Tavily).

| Besoin (payant) | Service payant | ✅ Alternative GRATUITE | Comment |
|---|---|---|---|
| **Backlinks / referring domains** | Ahrefs, DataForSEO | **Common Crawl** + **OpenPageRank** + **Moz free** + **Bing Webmaster** | `seo-backlinks` skill (déjà free par défaut). OpenPageRank : clé gratuite `domcop.com/openpagerank`. |
| **Visibilité IA / citations LLM** | Profound | **Apex `seo_ai_visibility`** (multi-LLM) | Tool Apex gratuit : interroge les LLM déjà configurés, mesure Share of Voice. Aucun coût supplémentaire. |
| **Idées de mots-clés** | DataForSEO, SE Ranking | **Google Autocomplete** (sans clé) + **Google Trends** | `scripts/free_keyword_ideas.py <seed>` → suggestions réelles, 0 clé. Trends = demande relative. |
| **Volume de recherche exact** | DataForSEO | **Google Keyword Planner** (free, compte Google Ads) + **Trends** (relatif) | Le volume exact gratuit n'existe pas hors Keyword Planner (compte Ads gratuit requis). Sinon estimations Trends. |
| **Analyse SERP** | DataForSEO | **Tavily** (clé free, Kevin l'a) + **DuckDuckGo HTML** + **Common Crawl** | Web search via Tavily (`TAVILY_API_KEY`) ou rendu via `scripts/render_page.py`. |
| **Suivi de positions (rank tracking)** | SE Ranking | **GSC** (Search Console, gratuit) + checks SERP planifiés | `seo-google` skill : positions/impressions/clics réels et gratuits via ton compte Google. |
| **Core Web Vitals terrain** | (payant ailleurs) | **PageSpeed Insights + CrUX** (gratuit Google) + **Unlighthouse** | `seo-google` (clé API gratuite) + `seo-unlighthouse` (multi-pages local, 0 clé). |
| **Images / OG / hero** | (payant ailleurs) | **nanobanana-mcp (Gemini)** | `.mcp.json` → `${GEMINI_API_KEY}` (clé déjà possédée). |
| **Crawl JS / site map** | (payant ailleurs) | **Firecrawl free tier** (500/mois) + `scripts/render_page.py` | `.mcp.json` → `${FIRECRAWL_API_KEY}` ; rendu headless gratuit en repli. |

## Règle d'usage pour le skill `seo`

1. **Par défaut** : n'utiliser QUE les chemins gratuits ci-dessus.
2. Ne proposer une extension payante (DataForSEO/Ahrefs/…) que si l'utilisateur la demande
   explicitement ET fournit ses identifiants — sinon basculer sur l'équivalent gratuit.
3. Pour la visibilité IA / GEO : utiliser **`seo_ai_visibility`** (Apex) — jamais Profound.
4. Pour les backlinks : Common Crawl + OpenPageRank + Moz free — jamais Ahrefs payant par défaut.

## Clés gratuites à activer (optionnel, free-tier)

- **OpenPageRank** : clé gratuite → backlinks/authority. Env `OPENPAGERANK_API_KEY`.
- **Google API** (PageSpeed/GSC/GA4/CrUX) : gratuit, OAuth avec ton compte Google (`scripts/google_auth.py`).
- **Tavily** : `TAVILY_API_KEY` (déjà dans tes secrets) → recherche SERP.
- **Gemini** : `GEMINI_API_KEY` (déjà possédé) → images via nanobanana.
