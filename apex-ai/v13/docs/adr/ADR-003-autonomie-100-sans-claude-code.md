# ADR-003 — Autonomie 100% Apex sans Claude Code

**Status** : Accepted (v13.3.80, 2026-05-08)
**Auteurs** : Kevin DESARZENS (admin), Claude Code
**Date** : 2026-05-08

## Contexte

Règle Kevin ABSOLUE 2026-05-08 19:55 :
> *"Je veux que dans l'avenir, si jamais j'ai plus d'abonnement Claude Claude
> ou quoi, il puisse continuer à se servir de tout ce que tu lui as intégré.
> En toute autonomie, qu'il soit vraiment autonome à 100 pour 100, je le
> répète, ne ment pas, travaille réellement, je veux que du réel et de
> l'honnêteté."*

Apex v13 antérieur à v13.3.80 dépendait de Claude Code en escalade pour :
- Exécuter MCP tools (GitHub create issue, Gmail send, Drive ops)
- Refactor lourd code repo
- Audit + corrections cascade

Risque : si Kevin annule abonnement Anthropic Pro (Claude.ai/Claude Code),
Apex perd toutes ces capacités "via_claude_code".

## Décision

**Apex doit être 100% autonome**. Implémentation :

### 1. `services/direct-connectors-registry.ts` — 50+ APIs DIRECTES

17 catégories couvrant tous les besoins client/admin Casino Monaco :

| Catégorie | Connecteurs | Exemple op |
|-----------|-------------|------------|
| ai_provider | 12 (anthropic, openai, openrouter, groq, gemini, mistral, cohere, deepseek, perplexity, huggingface, replicate, openclaw) | `chat.completions` |
| web_search | 6 (brave, tavily, duckduckgo, google_cse, jina_reader) | `web/search` |
| git_repo | 2 (github_api, gitlab_api) | `repos/.../issues` POST |
| communication | 6 (telegram_bot, resend, brevo, emailjs, twilio, discord_webhook) | `emails/send` |
| storage | 4 (firebase_rtdb, cloudflare_kv, jsonbin, pinata_ipfs) | `PUT /:key` |
| finance | 3 (stripe, finnhub, exchangerate) | `paymentIntents` |
| crypto | 3 (coingecko, coinmarketcap, etherscan) | `simple/price` |
| weather_geo | 5 (open_meteo, openweathermap, opencage, nominatim, ipapi) | `forecast` |
| translation | 2 (deepl, libretranslate) | `translate` |
| news_media | 2 (newsapi, rss2json) | `top-headlines` |
| images_video | 4 (unsplash, pixabay, pexels, qrcode_api) | `search/photos` |
| tts_stt | 2 (elevenlabs, web_speech_api) | `text-to-speech` |
| maps | 2 (mapbox, osrm) | `directions` |
| identity | 1 (webauthn) | `credentials.create` |
| analytics | 2 (plausible, sentry) | `event` |
| infrastructure | 3 (cloudflare, vercel, netlify) | `deployments` |
| iot_domotique | 3 (home_assistant, broadlink_local, tuya_smartlife) | `services/:domain` |

### 2. API uniforme `directConnectors.invoke()`

```ts
const result = await directConnectors.invoke({
  id: 'github_api',
  op: 'repos/9r4rxssx64-creator/cmcteams/issues',
  method: 'POST',
  body: { title: '...', body: '...' },
});
// → fetch direct, auth header automatique selon service
// → vault.readKey() pour récupérer la clé chiffrée
// → AbortController timeout 30s
// → retourne { ok, status, data } sécurisé
```

### 3. Détection intent + auto-routing

Apex IA détecte mots-clés FR/EN dans message user via `detectIntent(text)` :
- "météo Monaco" → `open_meteo` + `nominatim` (geocode)
- "envoie email à X" → `resend` ou `brevo`
- "crée issue GitHub" → `github_api`
- "qr code de https://..." → `qrcode_api`
- "traduis en italien" → `deepl`

### 4. Fallback chain auto-failover

Si `anthropic` 429 → `openrouter` → `groq` → `gemini` → `cohere`. Voir ADR-002.

### 5. Claude Code MCP Bridge = OPTIONNEL

`services/claude-code-mcp-bridge.ts` marqué **FALLBACK OPTIONNEL** :
- Lazy-loaded uniquement si Apex IA décide explicitement d'escalader
- Aucun import au boot
- Si Kevin perd abonnement → Apex utilise directConnectors uniquement

### 6. Auto-detect manquants

```ts
const missing = await directConnectors.listMissing();
// → liste des services sans clé vault, avec dashboard URL pour Kevin
```

Sentinelle propose discrètement (sans spam) les services qui apporteraient
de la valeur.

## Conséquences

**Positives** :
- Zéro dépendance Claude Code / abonnement Anthropic
- Apex 100% utilisable même offline (web_speech_api, webauthn, broadlink_local capables)
- Coût marginal optimisé (tier gratuits Groq/Gemini/Brave/Tavily/etc.)
- Conformité règle Kevin "AUTONOMIE TOTALE TOUJOURS PARTOUT"

**Négatives** :
- Maintenance 50+ adapters (auth headers, op patterns)
- Test suite étendue (chaque connecteur testé individuellement)
- Quota tracking par connecteur (sentinelle dédiée)

**Alternatives considérées** :
- Wrapping derrière 1 seul backend Cloudflare Worker : SPOF + latence
- LangChain/LlamaIndex côté client : bundle 500+ KB, coût bundle bloquant mobile
- Continue avec MCP escalade : viole règle Kevin

## Validation

- v13.3.80 commit `70049d2` mergé sur main
- `direct-connectors-registry.ts` 50+ connecteurs testables individuellement
- System prompt enrichi : Apex IA sait elle DOIT utiliser directConnectors
- `claude-code-mcp-bridge.ts` marqué legacy, header explicite

## Références

- services/direct-connectors-registry.ts (50+ APIs)
- services/claude-code-mcp-bridge.ts (FALLBACK marqué)
- core/memory.ts ligne 460+ (system prompt section autonomie)
- ADR-002 (multi-key failover chain IA)
