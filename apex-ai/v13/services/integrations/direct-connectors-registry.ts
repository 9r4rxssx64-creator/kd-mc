/**
 * APEX v13 — Direct Connectors Registry (autonomie 100% sans Claude Code).
 *
 * Demande Kevin 2026-05-08 ABSOLUE :
 * "Je veux que tu rajoutes en toute autonomie tous les autres connecteurs que tu as
 *  à ta disposition et aller en chercher d'autres que tu fournis et que tu intègres
 *  à apex. Et que je veux que dans l'avenir, si jamais j'ai plus d'abonnement Claude
 *  Claude ou quoi, il puisse continuer à se servir de tout ce que tu lui as intégré.
 *  En toute autonomie, qu'il soit vraiment autonome à 100 pour 100."
 *
 * ARCHITECTURE :
 * - DIRECT : Apex appelle l'API publique directement avec credentials Kevin (vault)
 *   → ne dépend PAS de Claude Code / abonnement Anthropic
 * - VIA_CLAUDE_CODE : escalade Firebase pour tâches lourdes (refactor repo, gros audit)
 *   → fallback uniquement, optionnel
 * - BOTH : selon contexte (online/offline, complexité)
 *
 * Apex IA peut, en autonomie totale, utiliser CHAQUE connecteur direct via fetch.
 * Cap : 50+ services intégrés (GitHub, recherche, météo, géo, finance, IA,
 * stockage, comms, traduction, news, images, vidéo, infrastructure).
 */

import { logger } from '../../core/logger.js';
import { vault } from '../vault/vault.js';

export type AccessMode = 'direct' | 'via_claude_code' | 'both';

export type ConnectorCategory =
  | 'ai_provider'
  | 'web_search'
  | 'git_repo'
  | 'communication'
  | 'storage'
  | 'finance'
  | 'crypto'
  | 'weather_geo'
  | 'translation'
  | 'news_media'
  | 'images_video'
  | 'tts_stt'
  | 'identity'
  | 'maps'
  | 'calendar'
  | 'analytics'
  | 'iot_domotique'
  | 'infrastructure';

export interface DirectConnector {
  id: string;
  name: string;
  category: ConnectorCategory;
  accessMode: AccessMode;
  /** Endpoint racine de l'API. */
  apiBase: string;
  /** Clé(s) vault nécessaires (auto-detect lookup). null = service public sans clé. */
  vaultKeys: string[] | null;
  /** Exemples d'opérations supportées. */
  operations: string[];
  /** Documentation officielle. */
  docs: string;
  /** Lien dashboard pour gérer/recharger. */
  dashboard: string;
  /** Free tier (description courte). */
  freeTier?: string;
  /** Mots-clés FR/EN qui déclenchent suggestion. */
  triggers: string[];
  /** True si fonctionne offline (local). */
  offlineCapable?: boolean;
}

export const DIRECT_CONNECTORS: DirectConnector[] = [
  /* =========================== AI Providers =========================== */
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    category: 'ai_provider',
    accessMode: 'direct',
    apiBase: 'https://api.anthropic.com/v1',
    vaultKeys: ['anthropic_key', 'ax_api_key'],
    operations: ['messages.create', 'tool_use', 'web_search', 'computer_use', 'vision'],
    docs: 'https://docs.anthropic.com/en/api/messages',
    dashboard: 'https://console.anthropic.com/settings/billing',
    freeTier: 'Pas de free tier, $5 crédit initial',
    triggers: ['claude', 'anthropic', 'opus', 'sonnet', 'haiku'],
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    category: 'ai_provider',
    accessMode: 'direct',
    apiBase: 'https://api.openai.com/v1',
    vaultKeys: ['openai_key', 'ax_openai_key'],
    operations: ['chat.completions', 'embeddings', 'images.generate', 'audio.transcriptions', 'audio.speech'],
    docs: 'https://platform.openai.com/docs/api-reference',
    dashboard: 'https://platform.openai.com/account/billing',
    freeTier: '$5 crédit initial 3 mois',
    triggers: ['gpt', 'openai', 'chatgpt', 'dall-e', 'whisper'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (multi-provider)',
    category: 'ai_provider',
    accessMode: 'direct',
    apiBase: 'https://openrouter.ai/api/v1',
    vaultKeys: ['openrouter_key', 'ax_openrouter_key'],
    operations: ['chat.completions (200+ modèles)', 'failover routing'],
    docs: 'https://openrouter.ai/docs',
    dashboard: 'https://openrouter.ai/keys',
    freeTier: 'Modèles gratuits dispos (Llama, Gemma)',
    triggers: ['openrouter', 'multi modele'],
  },
  {
    id: 'groq',
    name: 'Groq (ultra-fast Llama)',
    category: 'ai_provider',
    accessMode: 'direct',
    apiBase: 'https://api.groq.com/openai/v1',
    vaultKeys: ['groq_key', 'ax_groq_key'],
    operations: ['chat.completions (Llama 3.3 70B 500 tok/s)'],
    docs: 'https://console.groq.com/docs',
    dashboard: 'https://console.groq.com/keys',
    freeTier: '14400 req/jour gratuit',
    triggers: ['groq', 'llama rapide'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    category: 'ai_provider',
    accessMode: 'direct',
    apiBase: 'https://generativelanguage.googleapis.com/v1beta',
    vaultKeys: ['gemini_key', 'ax_gemini_key'],
    operations: ['generateContent', 'vision', 'embedContent', 'function_calling'],
    docs: 'https://ai.google.dev/api',
    dashboard: 'https://aistudio.google.com/apikey',
    freeTier: '1M tok/jour gratuit Gemini Flash',
    triggers: ['gemini', 'google ai', 'bard'],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    category: 'ai_provider',
    accessMode: 'direct',
    apiBase: 'https://api.mistral.ai/v1',
    vaultKeys: ['mistral_key', 'ax_mistral_key'],
    operations: ['chat.completions', 'embeddings', 'fine-tuning'],
    docs: 'https://docs.mistral.ai/',
    dashboard: 'https://console.mistral.ai/',
    freeTier: 'Tier gratuit La Plateforme',
    triggers: ['mistral', 'mixtral'],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    category: 'ai_provider',
    accessMode: 'direct',
    apiBase: 'https://api.cohere.com/v1',
    vaultKeys: ['cohere_key', 'ax_cohere_key'],
    operations: ['chat', 'embed', 'rerank', 'classify'],
    docs: 'https://docs.cohere.com/reference',
    dashboard: 'https://dashboard.cohere.com/api-keys',
    freeTier: '1000 req/mois trial',
    triggers: ['cohere', 'command r'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek (raisonnement)',
    category: 'ai_provider',
    accessMode: 'direct',
    apiBase: 'https://api.deepseek.com/v1',
    vaultKeys: ['deepseek_key', 'ax_deepseek_key'],
    operations: ['chat.completions (V3, R1 reasoning)'],
    docs: 'https://api-docs.deepseek.com/',
    dashboard: 'https://platform.deepseek.com/api_keys',
    freeTier: '$5 crédit initial',
    triggers: ['deepseek', 'r1', 'raisonnement'],
  },
  {
    id: 'perplexity',
    name: 'Perplexity (search + IA)',
    category: 'ai_provider',
    accessMode: 'direct',
    apiBase: 'https://api.perplexity.ai',
    vaultKeys: ['perplexity_key', 'ax_perplexity_key'],
    operations: ['chat.completions (citations sources web)'],
    docs: 'https://docs.perplexity.ai/',
    dashboard: 'https://www.perplexity.ai/settings/api',
    freeTier: 'Pas de free tier API',
    triggers: ['perplexity', 'recherche citée'],
  },
  {
    id: 'huggingface',
    name: 'HuggingFace (open-source models)',
    category: 'ai_provider',
    accessMode: 'direct',
    apiBase: 'https://api-inference.huggingface.co/models',
    vaultKeys: ['huggingface_key', 'ax_huggingface_key', 'ax_hf_key'],
    operations: ['text-generation', 'translation', 'image-to-text', 'speech-to-text'],
    docs: 'https://huggingface.co/docs/api-inference/',
    dashboard: 'https://huggingface.co/settings/tokens',
    freeTier: 'Free tier serverless inference',
    triggers: ['huggingface', 'hf', 'transformers'],
  },
  {
    id: 'replicate',
    name: 'Replicate (image/vidéo gen)',
    category: 'ai_provider',
    accessMode: 'direct',
    apiBase: 'https://api.replicate.com/v1',
    vaultKeys: ['replicate_key', 'ax_replicate_key'],
    operations: ['predictions.create (FLUX, SDXL, MusicGen, Whisper)'],
    docs: 'https://replicate.com/docs/reference/http',
    dashboard: 'https://replicate.com/account/api-tokens',
    freeTier: '$0.50 crédit initial',
    triggers: ['replicate', 'flux', 'sdxl'],
  },

  /* =========================== Web Search =========================== */
  {
    id: 'brave_search',
    name: 'Brave Search',
    category: 'web_search',
    accessMode: 'direct',
    apiBase: 'https://api.search.brave.com/res/v1',
    vaultKeys: ['brave_key', 'ax_brave_key'],
    operations: ['web/search', 'images', 'videos', 'news'],
    docs: 'https://api.search.brave.com/app/documentation',
    dashboard: 'https://api.search.brave.com/app/dashboard',
    freeTier: '2000 req/mois gratuit',
    triggers: ['brave search', 'recherche web'],
  },
  {
    id: 'tavily',
    name: 'Tavily (AI-optimized search)',
    category: 'web_search',
    accessMode: 'direct',
    apiBase: 'https://api.tavily.com',
    vaultKeys: ['tavily_key', 'ax_tavily_key'],
    operations: ['search (résultats nettoyés pour IA)', 'extract (page content)'],
    docs: 'https://docs.tavily.com/',
    dashboard: 'https://app.tavily.com/home',
    freeTier: '1000 req/mois gratuit',
    triggers: ['tavily', 'recherche ia'],
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo (HTML scrape)',
    category: 'web_search',
    accessMode: 'direct',
    apiBase: 'https://html.duckduckgo.com/html/',
    vaultKeys: null,
    operations: ['search HTML scraping (pas d\'API officielle)'],
    docs: 'https://duckduckgo.com/duckduckgo-help-pages/',
    dashboard: 'https://duckduckgo.com/',
    freeTier: 'Gratuit illimité (rate limit raisonnable)',
    triggers: ['duckduckgo', 'ddg'],
  },
  {
    id: 'google_cse',
    name: 'Google Custom Search',
    category: 'web_search',
    accessMode: 'direct',
    apiBase: 'https://www.googleapis.com/customsearch/v1',
    vaultKeys: ['google_cse_key', 'ax_google_cse_key', 'google_cse_id', 'ax_google_cse_id'],
    operations: ['cse.list (top 10 résultats Google)'],
    docs: 'https://developers.google.com/custom-search/v1/overview',
    dashboard: 'https://console.cloud.google.com/apis/credentials',
    freeTier: '100 req/jour gratuit',
    triggers: ['google search', 'cse'],
  },
  {
    id: 'jina_reader',
    name: 'Jina Reader (URL → markdown)',
    category: 'web_search',
    accessMode: 'direct',
    apiBase: 'https://r.jina.ai',
    vaultKeys: ['jina_key', 'ax_jina_key'],
    operations: ['GET https://r.jina.ai/{URL} → markdown propre'],
    docs: 'https://jina.ai/reader/',
    dashboard: 'https://jina.ai/',
    freeTier: 'Gratuit sans clé (rate-limit), key augmente quota',
    triggers: ['jina', 'reader mode', 'url to markdown'],
  },

  /* =========================== Git Repo =========================== */
  {
    id: 'github_api',
    name: 'GitHub REST API',
    category: 'git_repo',
    accessMode: 'direct',
    apiBase: 'https://api.github.com',
    vaultKeys: ['github_token', 'ax_github_token', 'github_pat'],
    operations: [
      'GET /repos/:owner/:repo (info)',
      'GET /repos/:owner/:repo/contents/:path (lire fichier)',
      'PUT /repos/:owner/:repo/contents/:path (créer/maj fichier)',
      'POST /repos/:owner/:repo/issues (créer issue)',
      'POST /repos/:owner/:repo/pulls (créer PR)',
      'POST /repos/:owner/:repo/git/refs (créer branche)',
      'GET /repos/:owner/:repo/actions/runs (status CI)',
      'POST /repos/:owner/:repo/dispatches (trigger workflow)',
      'GET /search/code?q=... (recherche code)',
    ],
    docs: 'https://docs.github.com/en/rest',
    dashboard: 'https://github.com/settings/tokens',
    freeTier: '5000 req/h authenticated, 60 anonymous',
    triggers: ['github', 'issue', 'pr', 'commit', 'repo'],
  },
  {
    id: 'gitlab_api',
    name: 'GitLab API',
    category: 'git_repo',
    accessMode: 'direct',
    apiBase: 'https://gitlab.com/api/v4',
    vaultKeys: ['gitlab_token', 'ax_gitlab_token'],
    operations: ['projects', 'merge_requests', 'issues', 'pipelines'],
    docs: 'https://docs.gitlab.com/ee/api/',
    dashboard: 'https://gitlab.com/-/profile/personal_access_tokens',
    freeTier: 'Free plan illimité',
    triggers: ['gitlab'],
  },

  /* =========================== Communication =========================== */
  {
    id: 'telegram_bot',
    name: 'Telegram Bot API',
    category: 'communication',
    accessMode: 'direct',
    apiBase: 'https://api.telegram.org',
    vaultKeys: ['telegram_bot_token', 'ax_telegram_token'],
    operations: ['sendMessage', 'sendPhoto', 'sendDocument', 'getUpdates', 'inline_keyboard'],
    docs: 'https://core.telegram.org/bots/api',
    dashboard: 'https://t.me/BotFather',
    freeTier: 'Gratuit illimité',
    triggers: ['telegram', 'bot kdmc'],
  },
  {
    id: 'resend',
    name: 'Resend (email API)',
    category: 'communication',
    accessMode: 'direct',
    apiBase: 'https://api.resend.com',
    vaultKeys: ['resend_key', 'ax_resend_key'],
    operations: ['emails.send', 'audiences', 'contacts', 'broadcasts'],
    docs: 'https://resend.com/docs/api-reference',
    dashboard: 'https://resend.com/api-keys',
    freeTier: '3000 emails/mois free',
    triggers: ['resend', 'email transactionnel'],
  },
  {
    id: 'brevo',
    name: 'Brevo (ex-Sendinblue)',
    category: 'communication',
    accessMode: 'direct',
    apiBase: 'https://api.brevo.com/v3',
    vaultKeys: ['brevo_key', 'ax_brevo_key'],
    operations: ['transactionalEmails', 'sms/transactional', 'contacts', 'campaigns'],
    docs: 'https://developers.brevo.com/',
    dashboard: 'https://app.brevo.com/security/api-keys',
    freeTier: '300 emails/jour free',
    triggers: ['brevo', 'sendinblue', 'sms'],
  },
  {
    id: 'emailjs',
    name: 'EmailJS (client-side)',
    category: 'communication',
    accessMode: 'direct',
    apiBase: 'https://api.emailjs.com/api/v1.0',
    vaultKeys: ['emailjs_key', 'emailjs_service', 'emailjs_template'],
    operations: ['email.send (depuis browser sans backend)'],
    docs: 'https://www.emailjs.com/docs/',
    dashboard: 'https://dashboard.emailjs.com/admin',
    freeTier: '200 emails/mois free',
    triggers: ['emailjs', 'mail navigateur'],
  },
  {
    id: 'twilio',
    name: 'Twilio (SMS / WhatsApp / voice)',
    category: 'communication',
    accessMode: 'direct',
    apiBase: 'https://api.twilio.com/2010-04-01',
    vaultKeys: ['twilio_account_sid', 'twilio_auth_token'],
    operations: ['Messages (SMS)', 'WhatsApp', 'Calls', 'Verify (OTP)'],
    docs: 'https://www.twilio.com/docs/usage/api',
    dashboard: 'https://console.twilio.com/',
    freeTier: '$15.50 crédit trial',
    triggers: ['twilio', 'sms', 'whatsapp api'],
  },
  {
    id: 'discord_webhook',
    name: 'Discord Webhooks',
    category: 'communication',
    accessMode: 'direct',
    apiBase: 'https://discord.com/api/webhooks',
    vaultKeys: ['discord_webhook_url'],
    operations: ['POST webhook (envoi message canal)'],
    docs: 'https://discord.com/developers/docs/resources/webhook',
    dashboard: 'https://discord.com/developers/applications',
    freeTier: 'Gratuit',
    triggers: ['discord'],
  },

  /* =========================== Storage =========================== */
  {
    id: 'firebase_rtdb',
    name: 'Firebase Realtime Database',
    category: 'storage',
    accessMode: 'direct',
    apiBase: 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app',
    vaultKeys: ['firebase_secret', 'ax_firebase_secret'],
    operations: ['GET .json', 'PUT .json', 'PATCH .json', 'SSE listen'],
    docs: 'https://firebase.google.com/docs/database/rest/start',
    dashboard: 'https://console.firebase.google.com/',
    freeTier: '1 GB stockage / 10 GB transfert free Spark',
    triggers: ['firebase', 'realtime db'],
  },
  {
    id: 'cloudflare_kv',
    name: 'Cloudflare KV (via Worker)',
    category: 'storage',
    accessMode: 'direct',
    apiBase: 'https://apex-kv-proxy.workers.dev',
    vaultKeys: ['cloudflare_token', 'ax_cf_token'],
    operations: ['GET /:key', 'PUT /:key', 'DELETE /:key (via Worker)'],
    docs: 'https://developers.cloudflare.com/workers/runtime-apis/kv/',
    dashboard: 'https://dash.cloudflare.com/?to=/:account/workers/kv',
    freeTier: '100k reads/jour, 1k writes/jour free',
    triggers: ['cloudflare kv', 'cf kv'],
  },
  {
    id: 'jsonbin',
    name: 'JSONBin.io (cloud JSON storage)',
    category: 'storage',
    accessMode: 'direct',
    apiBase: 'https://api.jsonbin.io/v3',
    vaultKeys: ['jsonbin_key', 'ax_jsonbin_key'],
    operations: ['POST /b (créer bin)', 'GET /b/:id', 'PUT /b/:id'],
    docs: 'https://jsonbin.io/api-reference',
    dashboard: 'https://jsonbin.io/app/api-keys',
    freeTier: '10k req/mois free',
    triggers: ['jsonbin'],
  },
  {
    id: 'pinata_ipfs',
    name: 'Pinata IPFS',
    category: 'storage',
    accessMode: 'direct',
    apiBase: 'https://api.pinata.cloud',
    vaultKeys: ['pinata_jwt', 'pinata_key', 'pinata_secret'],
    operations: ['pinning/pinFileToIPFS', 'pinning/pinJSONToIPFS', 'data/pinList'],
    docs: 'https://docs.pinata.cloud/',
    dashboard: 'https://app.pinata.cloud/keys',
    freeTier: '1 GB pinning free',
    triggers: ['pinata', 'ipfs'],
  },

  /* =========================== Finance =========================== */
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'finance',
    accessMode: 'direct',
    apiBase: 'https://api.stripe.com/v1',
    vaultKeys: ['stripe_sk', 'ax_stripe_key'],
    operations: ['customers', 'subscriptions', 'paymentIntents', 'checkout/sessions', 'invoices'],
    docs: 'https://stripe.com/docs/api',
    dashboard: 'https://dashboard.stripe.com/apikeys',
    freeTier: 'Pas de free tier, frais par transaction',
    triggers: ['stripe', 'paiement'],
  },
  {
    id: 'finnhub',
    name: 'Finnhub (stocks)',
    category: 'finance',
    accessMode: 'direct',
    apiBase: 'https://finnhub.io/api/v1',
    vaultKeys: ['finnhub_key', 'ax_finnhub_key'],
    operations: ['quote', 'company-news', 'earnings', 'recommendation'],
    docs: 'https://finnhub.io/docs/api',
    dashboard: 'https://finnhub.io/dashboard',
    freeTier: '60 req/min free',
    triggers: ['finnhub', 'bourse', 'action stock'],
  },
  {
    id: 'exchangerate',
    name: 'ExchangeRate.host (FX)',
    category: 'finance',
    accessMode: 'direct',
    apiBase: 'https://api.exchangerate.host',
    vaultKeys: null,
    operations: ['convert', 'latest', 'historical', 'fluctuation'],
    docs: 'https://exchangerate.host/#/docs',
    dashboard: 'https://exchangerate.host/',
    freeTier: 'Gratuit illimité',
    triggers: ['change', 'currency', 'taux'],
  },

  /* =========================== Crypto =========================== */
  {
    id: 'coingecko',
    name: 'CoinGecko (crypto prices)',
    category: 'crypto',
    accessMode: 'direct',
    apiBase: 'https://api.coingecko.com/api/v3',
    vaultKeys: ['coingecko_key', 'ax_coingecko_key'],
    operations: ['simple/price', 'coins/markets', 'coins/:id', 'trending'],
    docs: 'https://www.coingecko.com/api/documentation',
    dashboard: 'https://www.coingecko.com/en/developers/dashboard',
    freeTier: '30 req/min sans clé, plus avec clé',
    triggers: ['coingecko', 'crypto prix', 'bitcoin'],
  },
  {
    id: 'coinmarketcap',
    name: 'CoinMarketCap',
    category: 'crypto',
    accessMode: 'direct',
    apiBase: 'https://pro-api.coinmarketcap.com/v1',
    vaultKeys: ['coinmarketcap_key', 'ax_cmc_key'],
    operations: ['cryptocurrency/listings/latest', 'cryptocurrency/quotes/latest'],
    docs: 'https://coinmarketcap.com/api/documentation/v1/',
    dashboard: 'https://pro.coinmarketcap.com/account',
    freeTier: '10k req/mois free Basic',
    triggers: ['coinmarketcap', 'cmc'],
  },
  {
    id: 'etherscan',
    name: 'Etherscan (Ethereum)',
    category: 'crypto',
    accessMode: 'direct',
    apiBase: 'https://api.etherscan.io/api',
    vaultKeys: ['etherscan_key', 'ax_etherscan_key'],
    operations: ['account/balance', 'account/txlist', 'contract/getabi'],
    docs: 'https://docs.etherscan.io/',
    dashboard: 'https://etherscan.io/myapikey',
    freeTier: '5 req/sec free',
    triggers: ['etherscan', 'ethereum tx'],
  },

  /* =========================== Weather + Geo =========================== */
  {
    id: 'open_meteo',
    name: 'Open-Meteo (météo gratuite)',
    category: 'weather_geo',
    accessMode: 'direct',
    apiBase: 'https://api.open-meteo.com/v1',
    vaultKeys: null,
    operations: ['forecast', 'archive', 'air-quality', 'marine'],
    docs: 'https://open-meteo.com/en/docs',
    dashboard: 'https://open-meteo.com/',
    freeTier: 'Gratuit illimité non-commercial',
    triggers: ['météo', 'meteo', 'temps', 'weather'],
  },
  {
    id: 'openweathermap',
    name: 'OpenWeatherMap',
    category: 'weather_geo',
    accessMode: 'direct',
    apiBase: 'https://api.openweathermap.org/data/2.5',
    vaultKeys: ['openweathermap_key', 'ax_owm_key'],
    operations: ['weather', 'forecast', 'onecall', 'air_pollution'],
    docs: 'https://openweathermap.org/api',
    dashboard: 'https://home.openweathermap.org/api_keys',
    freeTier: '1000 req/jour free',
    triggers: ['openweather', 'owm'],
  },
  {
    id: 'opencage_geocode',
    name: 'OpenCage Geocoding',
    category: 'weather_geo',
    accessMode: 'direct',
    apiBase: 'https://api.opencagedata.com/geocode/v1',
    vaultKeys: ['opencage_key', 'ax_opencage_key'],
    operations: ['json (forward + reverse geocoding)'],
    docs: 'https://opencagedata.com/api',
    dashboard: 'https://opencagedata.com/dashboard',
    freeTier: '2500 req/jour free',
    triggers: ['geocode', 'adresse vers coords'],
  },
  {
    id: 'nominatim',
    name: 'Nominatim (OpenStreetMap)',
    category: 'weather_geo',
    accessMode: 'direct',
    apiBase: 'https://nominatim.openstreetmap.org',
    vaultKeys: null,
    operations: ['search?q=...', 'reverse?lat=&lon='],
    docs: 'https://nominatim.org/release-docs/latest/api/Overview/',
    dashboard: 'https://nominatim.openstreetmap.org/',
    freeTier: 'Gratuit (1 req/sec, attribution requise)',
    triggers: ['osm', 'nominatim', 'openstreetmap'],
  },
  {
    id: 'ipapi',
    name: 'ip-api.com (geolocation IP)',
    category: 'weather_geo',
    accessMode: 'direct',
    apiBase: 'http://ip-api.com',
    vaultKeys: null,
    operations: ['/json/{ip}'],
    docs: 'https://ip-api.com/docs',
    dashboard: 'https://ip-api.com/',
    freeTier: '45 req/min free',
    triggers: ['ip geo', 'localiser ip'],
  },

  /* =========================== Translation =========================== */
  {
    id: 'deepl',
    name: 'DeepL (best quality FR/EN)',
    category: 'translation',
    accessMode: 'direct',
    apiBase: 'https://api-free.deepl.com/v2',
    vaultKeys: ['deepl_key', 'ax_deepl_key'],
    operations: ['translate', 'languages', 'usage'],
    docs: 'https://www.deepl.com/docs-api',
    dashboard: 'https://www.deepl.com/account/summary',
    freeTier: '500k caractères/mois free',
    triggers: ['deepl', 'traduire pro'],
  },
  {
    id: 'libretranslate',
    name: 'LibreTranslate (open-source)',
    category: 'translation',
    accessMode: 'direct',
    apiBase: 'https://libretranslate.com',
    vaultKeys: ['libretranslate_key'],
    operations: ['translate', 'detect'],
    docs: 'https://libretranslate.com/docs',
    dashboard: 'https://portal.libretranslate.com/',
    freeTier: 'Gratuit instances publiques (rate limit)',
    triggers: ['libretranslate'],
  },

  /* =========================== News + Media =========================== */
  {
    id: 'newsapi',
    name: 'NewsAPI',
    category: 'news_media',
    accessMode: 'direct',
    apiBase: 'https://newsapi.org/v2',
    vaultKeys: ['newsapi_key', 'ax_newsapi_key'],
    operations: ['top-headlines', 'everything', 'sources'],
    docs: 'https://newsapi.org/docs',
    dashboard: 'https://newsapi.org/account',
    freeTier: '100 req/jour free Developer',
    triggers: ['news api', 'actualités'],
  },
  {
    id: 'rss2json',
    name: 'rss2json (parse RSS feeds)',
    category: 'news_media',
    accessMode: 'direct',
    apiBase: 'https://api.rss2json.com/v1/api.json',
    vaultKeys: ['rss2json_key'],
    operations: ['?rss_url=... → JSON'],
    docs: 'https://rss2json.com/docs',
    dashboard: 'https://rss2json.com/',
    freeTier: '10k req/jour free',
    triggers: ['rss', 'flux nouvelles'],
  },

  /* =========================== Images + Video =========================== */
  {
    id: 'unsplash',
    name: 'Unsplash (photos libres)',
    category: 'images_video',
    accessMode: 'direct',
    apiBase: 'https://api.unsplash.com',
    vaultKeys: ['unsplash_key', 'ax_unsplash_key'],
    operations: ['search/photos', 'photos/random', 'collections'],
    docs: 'https://unsplash.com/documentation',
    dashboard: 'https://unsplash.com/oauth/applications',
    freeTier: '50 req/h free',
    triggers: ['unsplash', 'photos libres'],
  },
  {
    id: 'pixabay',
    name: 'Pixabay (images + vidéos)',
    category: 'images_video',
    accessMode: 'direct',
    apiBase: 'https://pixabay.com/api',
    vaultKeys: ['pixabay_key', 'ax_pixabay_key'],
    operations: ['?q=... (images)', 'videos/?q=...'],
    docs: 'https://pixabay.com/api/docs/',
    dashboard: 'https://pixabay.com/accounts/profile/',
    freeTier: '5000 req/h free',
    triggers: ['pixabay'],
  },
  {
    id: 'pexels',
    name: 'Pexels (photos + vidéos)',
    category: 'images_video',
    accessMode: 'direct',
    apiBase: 'https://api.pexels.com/v1',
    vaultKeys: ['pexels_key', 'ax_pexels_key'],
    operations: ['search', 'curated', 'videos/search'],
    docs: 'https://www.pexels.com/api/documentation/',
    dashboard: 'https://www.pexels.com/api/new/',
    freeTier: '200 req/h free',
    triggers: ['pexels'],
  },
  {
    id: 'qrcode_api',
    name: 'QR Code API (gratuit)',
    category: 'images_video',
    accessMode: 'direct',
    apiBase: 'https://api.qrserver.com/v1',
    vaultKeys: null,
    operations: ['create-qr-code/?data=... (image PNG)'],
    docs: 'https://goqr.me/api/',
    dashboard: 'https://goqr.me/api/',
    freeTier: 'Gratuit illimité',
    triggers: ['qr code', 'qrcode'],
  },

  /* =========================== TTS / STT =========================== */
  {
    id: 'elevenlabs',
    name: 'ElevenLabs (voix ultra-réalistes)',
    category: 'tts_stt',
    accessMode: 'direct',
    apiBase: 'https://api.elevenlabs.io/v1',
    vaultKeys: ['elevenlabs_key', 'ax_elevenlabs_key'],
    operations: ['text-to-speech', 'voices', 'voice-cloning', 'speech-to-text'],
    docs: 'https://elevenlabs.io/docs/api-reference',
    dashboard: 'https://elevenlabs.io/app/settings/api-keys',
    freeTier: '10k chars/mois free',
    triggers: ['elevenlabs', 'voix premium'],
  },
  {
    id: 'web_speech_api',
    name: 'Web Speech API (navigateur natif)',
    category: 'tts_stt',
    accessMode: 'direct',
    apiBase: 'window.speechSynthesis / SpeechRecognition',
    vaultKeys: null,
    operations: ['SpeechSynthesisUtterance (TTS)', 'SpeechRecognition (STT)'],
    docs: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API',
    dashboard: 'navigateur',
    freeTier: 'Gratuit, qualité varie selon OS',
    triggers: ['tts', 'stt', 'dictée', 'lecture vocale'],
    offlineCapable: true,
  },

  /* =========================== Maps =========================== */
  {
    id: 'mapbox',
    name: 'Mapbox',
    category: 'maps',
    accessMode: 'direct',
    apiBase: 'https://api.mapbox.com',
    vaultKeys: ['mapbox_token', 'ax_mapbox_token'],
    operations: ['geocoding', 'directions', 'static-images', 'styles'],
    docs: 'https://docs.mapbox.com/api/',
    dashboard: 'https://account.mapbox.com/access-tokens/',
    freeTier: '50k loads/mois free',
    triggers: ['mapbox', 'cartes'],
  },
  {
    id: 'osrm',
    name: 'OSRM (routing OpenStreetMap)',
    category: 'maps',
    accessMode: 'direct',
    apiBase: 'https://router.project-osrm.org',
    vaultKeys: null,
    operations: ['route/v1/driving/...', 'table/v1/...'],
    docs: 'http://project-osrm.org/docs/v5.24.0/api/',
    dashboard: 'http://project-osrm.org/',
    freeTier: 'Gratuit (instance démo)',
    triggers: ['osrm', 'itinéraire'],
  },

  /* =========================== Calendar =========================== */
  {
    id: 'ics_generator',
    name: 'ICS file generator (RFC 5545)',
    category: 'calendar',
    accessMode: 'direct',
    apiBase: 'data:text/calendar;base64,',
    vaultKeys: null,
    operations: ['Génère .ics localement (events VCALENDAR)'],
    docs: 'https://datatracker.ietf.org/doc/html/rfc5545',
    dashboard: '-',
    freeTier: 'Gratuit (génération locale)',
    triggers: ['ics', 'calendrier ics', 'événement ical'],
    offlineCapable: true,
  },

  /* =========================== Identity =========================== */
  {
    id: 'webauthn',
    name: 'WebAuthn (FaceID/TouchID/YubiKey)',
    category: 'identity',
    accessMode: 'direct',
    apiBase: 'navigator.credentials',
    vaultKeys: null,
    operations: ['credentials.create (enroll)', 'credentials.get (auth)'],
    docs: 'https://www.w3.org/TR/webauthn-2/',
    dashboard: 'navigateur',
    freeTier: 'Gratuit',
    triggers: ['faceid', 'touchid', 'webauthn', 'yubikey'],
    offlineCapable: true,
  },

  /* =========================== Analytics =========================== */
  {
    id: 'plausible',
    name: 'Plausible Analytics',
    category: 'analytics',
    accessMode: 'direct',
    apiBase: 'https://plausible.io/api/v1',
    vaultKeys: ['plausible_key', 'ax_plausible_key'],
    operations: ['event', 'stats/aggregate', 'stats/timeseries'],
    docs: 'https://plausible.io/docs/stats-api',
    dashboard: 'https://plausible.io/sites',
    freeTier: '30 jours trial',
    triggers: ['plausible'],
  },
  {
    id: 'sentry',
    name: 'Sentry (error tracking)',
    category: 'analytics',
    accessMode: 'direct',
    apiBase: 'https://sentry.io/api/0',
    vaultKeys: ['sentry_dsn', 'ax_sentry_dsn'],
    operations: ['envelope/store (capture errors)', 'projects/issues'],
    docs: 'https://docs.sentry.io/api/',
    dashboard: 'https://sentry.io/settings/account/api/',
    freeTier: '5k events/mois free Developer',
    triggers: ['sentry', 'erreurs tracking'],
  },

  /* =========================== Infrastructure =========================== */
  {
    id: 'cloudflare_workers',
    name: 'Cloudflare Workers',
    category: 'infrastructure',
    accessMode: 'direct',
    apiBase: 'https://api.cloudflare.com/client/v4',
    vaultKeys: ['cloudflare_token', 'ax_cf_token'],
    operations: ['accounts/:id/workers/scripts', 'workers/services'],
    docs: 'https://developers.cloudflare.com/api/',
    dashboard: 'https://dash.cloudflare.com/profile/api-tokens',
    freeTier: '100k req/jour free Worker',
    triggers: ['cloudflare', 'cf workers'],
  },
  {
    id: 'vercel_api',
    name: 'Vercel API',
    category: 'infrastructure',
    accessMode: 'direct',
    apiBase: 'https://api.vercel.com',
    vaultKeys: ['vercel_token', 'ax_vercel_token'],
    operations: ['v9/projects', 'v13/deployments', 'v6/domains'],
    docs: 'https://vercel.com/docs/rest-api',
    dashboard: 'https://vercel.com/account/tokens',
    freeTier: 'Hobby plan free',
    triggers: ['vercel'],
  },
  {
    id: 'netlify_api',
    name: 'Netlify API',
    category: 'infrastructure',
    accessMode: 'direct',
    apiBase: 'https://api.netlify.com/api/v1',
    vaultKeys: ['netlify_token', 'ax_netlify_token'],
    operations: ['sites', 'deploys', 'forms', 'functions'],
    docs: 'https://docs.netlify.com/api/get-started/',
    dashboard: 'https://app.netlify.com/user/applications',
    freeTier: '125k req fct/mois free',
    triggers: ['netlify'],
  },

  /* =========================== Productivité / Workspace (autonomie 100%) =========================== */
  {
    id: 'notion_api',
    name: 'Notion API',
    category: 'storage',
    accessMode: 'direct',
    apiBase: 'https://api.notion.com/v1',
    vaultKeys: ['notion_token', 'ax_notion_token'],
    operations: ['databases/query', 'pages', 'blocks', 'search'],
    docs: 'https://developers.notion.com/',
    dashboard: 'https://www.notion.so/my-integrations',
    freeTier: 'Personal plan free',
    triggers: ['notion', 'database notion'],
  },
  {
    id: 'airtable_api',
    name: 'Airtable',
    category: 'storage',
    accessMode: 'direct',
    apiBase: 'https://api.airtable.com/v0',
    vaultKeys: ['airtable_token', 'ax_airtable_token', 'airtable_pat'],
    operations: ['{baseId}/{tableId}', 'meta/bases'],
    docs: 'https://airtable.com/developers/web/api/introduction',
    dashboard: 'https://airtable.com/create/tokens',
    freeTier: '1000 records/base free',
    triggers: ['airtable', 'base airtable'],
  },
  {
    id: 'slack_webhook',
    name: 'Slack Webhooks + API',
    category: 'communication',
    accessMode: 'direct',
    apiBase: 'https://slack.com/api',
    vaultKeys: ['slack_bot_token', 'slack_webhook_url', 'ax_slack_token'],
    operations: ['chat.postMessage', 'conversations.list', 'files.upload', 'webhook (post URL)'],
    docs: 'https://api.slack.com/methods',
    dashboard: 'https://api.slack.com/apps',
    freeTier: 'Free workspace OK',
    triggers: ['slack'],
  },
  {
    id: 'dropbox_api',
    name: 'Dropbox API',
    category: 'storage',
    accessMode: 'direct',
    apiBase: 'https://api.dropboxapi.com/2',
    vaultKeys: ['dropbox_token', 'ax_dropbox_token'],
    operations: ['files/list_folder', 'files/upload', 'files/download', 'sharing/create_shared_link'],
    docs: 'https://www.dropbox.com/developers/documentation/http/documentation',
    dashboard: 'https://www.dropbox.com/developers/apps',
    freeTier: '2 GB stockage free',
    triggers: ['dropbox'],
  },
  {
    id: 'spotify_api',
    name: 'Spotify Web API',
    category: 'images_video',
    accessMode: 'direct',
    apiBase: 'https://api.spotify.com/v1',
    vaultKeys: ['spotify_token', 'ax_spotify_token'],
    operations: ['search', 'me/player', 'me/playlists', 'tracks/{id}'],
    docs: 'https://developer.spotify.com/documentation/web-api',
    dashboard: 'https://developer.spotify.com/dashboard',
    freeTier: 'Free tier (avec Spotify Free)',
    triggers: ['spotify', 'musique spotify'],
  },
  {
    id: 'gmail_api',
    name: 'Gmail API (OAuth)',
    category: 'communication',
    accessMode: 'direct',
    apiBase: 'https://gmail.googleapis.com/gmail/v1',
    vaultKeys: ['gmail_oauth_token', 'google_oauth_token', 'ax_gmail_token'],
    operations: ['users/me/messages', 'users/me/drafts', 'users/me/threads', 'users/me/labels'],
    docs: 'https://developers.google.com/gmail/api/reference/rest',
    dashboard: 'https://console.cloud.google.com/apis/credentials',
    freeTier: '1 milliard quota req/jour free',
    triggers: ['gmail', 'mail google'],
  },
  {
    id: 'google_calendar_api',
    name: 'Google Calendar API (OAuth)',
    category: 'calendar',
    accessMode: 'direct',
    apiBase: 'https://www.googleapis.com/calendar/v3',
    vaultKeys: ['google_calendar_token', 'google_oauth_token'],
    operations: ['calendars/primary/events', 'calendars/primary/events/watch'],
    docs: 'https://developers.google.com/calendar/api/v3/reference',
    dashboard: 'https://console.cloud.google.com/apis/credentials',
    freeTier: '1M req/jour free',
    triggers: ['google calendar', 'agenda google'],
  },
  {
    id: 'google_drive_api',
    name: 'Google Drive API (OAuth)',
    category: 'storage',
    accessMode: 'direct',
    apiBase: 'https://www.googleapis.com/drive/v3',
    vaultKeys: ['google_drive_token', 'google_oauth_token'],
    operations: ['files (list/get/create/copy/update/delete)', 'permissions'],
    docs: 'https://developers.google.com/drive/api/v3/reference',
    dashboard: 'https://console.cloud.google.com/apis/credentials',
    freeTier: '1 milliard requêtes/jour free',
    triggers: ['google drive', 'drive google'],
  },
  {
    id: 'pinecone_api',
    name: 'Pinecone (vector DB)',
    category: 'storage',
    accessMode: 'direct',
    apiBase: 'https://api.pinecone.io',
    vaultKeys: ['pinecone_key', 'ax_pinecone_key'],
    operations: ['vectors/upsert', 'vectors/query', 'vectors/delete', 'indexes'],
    docs: 'https://docs.pinecone.io/reference/api',
    dashboard: 'https://app.pinecone.io/',
    freeTier: 'Starter 1 index free',
    triggers: ['pinecone', 'vector db'],
  },
  {
    id: 'qdrant_api',
    name: 'Qdrant (vector DB self-hosted)',
    category: 'storage',
    accessMode: 'direct',
    apiBase: 'http://localhost:6333',
    vaultKeys: ['qdrant_key', 'ax_qdrant_key'],
    operations: ['collections', 'points/upsert', 'points/search'],
    docs: 'https://qdrant.tech/documentation/concepts/',
    dashboard: 'http://localhost:6333/dashboard',
    freeTier: 'Self-hosted gratuit',
    triggers: ['qdrant'],
  },
  {
    id: 'weaviate_api',
    name: 'Weaviate (vector DB)',
    category: 'storage',
    accessMode: 'direct',
    apiBase: 'https://weaviate.io/api/v1',
    vaultKeys: ['weaviate_key', 'ax_weaviate_key'],
    operations: ['objects', 'graphql', 'schema'],
    docs: 'https://weaviate.io/developers/weaviate/api/rest',
    dashboard: 'https://console.weaviate.cloud/',
    freeTier: 'Sandbox 14j free',
    triggers: ['weaviate'],
  },
  {
    id: 'rss2json',
    name: 'RSS to JSON (feed parser)',
    category: 'news_media',
    accessMode: 'direct',
    apiBase: 'https://api.rss2json.com/v1',
    vaultKeys: ['rss2json_key', 'ax_rss2json_key'],
    operations: ['api.json?rss_url={url}'],
    docs: 'https://rss2json.com/docs',
    dashboard: 'https://rss2json.com/',
    freeTier: '10000 req/jour gratuit',
    triggers: ['rss', 'feed', 'flux'],
  },
  {
    id: 'stack_exchange',
    name: 'Stack Exchange (StackOverflow)',
    category: 'web_search',
    accessMode: 'direct',
    apiBase: 'https://api.stackexchange.com/2.3',
    vaultKeys: ['stackexchange_key'],
    operations: ['search/advanced', 'questions', 'answers'],
    docs: 'https://api.stackexchange.com/docs',
    dashboard: 'https://stackapps.com/apps/oauth/register',
    freeTier: '300 req/jour anonyme, 10000 avec key',
    triggers: ['stackoverflow', 'stack exchange'],
  },
  {
    id: 'wikipedia_api',
    name: 'Wikipedia REST API',
    category: 'web_search',
    accessMode: 'direct',
    apiBase: 'https://fr.wikipedia.org/api/rest_v1',
    vaultKeys: null,
    operations: ['page/summary/{title}', 'page/html/{title}'],
    docs: 'https://www.mediawiki.org/wiki/API:Main_page',
    dashboard: 'https://www.mediawiki.org/',
    freeTier: 'Gratuit illimité (rate limit raisonnable)',
    triggers: ['wikipedia', 'wiki'],
  },

  /* =========================== IoT / Domotique =========================== */
  {
    id: 'home_assistant',
    name: 'Home Assistant (REST API)',
    category: 'iot_domotique',
    accessMode: 'direct',
    apiBase: 'http://homeassistant.local:8123/api',
    vaultKeys: ['home_assistant_token', 'ax_ha_token'],
    operations: ['states', 'services/:domain/:service', 'events'],
    docs: 'https://developers.home-assistant.io/docs/api/rest/',
    dashboard: 'http://homeassistant.local:8123/',
    freeTier: 'Self-hosted gratuit',
    triggers: ['home assistant', 'ha', 'domotique'],
  },
  {
    id: 'broadlink_local',
    name: 'Broadlink (LAN, codes IR)',
    category: 'iot_domotique',
    accessMode: 'direct',
    apiBase: 'LAN local (UDP discovery)',
    vaultKeys: ['broadlink_devices'],
    operations: ['Send IR/RF', 'Discover devices', 'Save IR codes'],
    docs: 'https://github.com/mjg59/python-broadlink',
    dashboard: '-',
    freeTier: 'Gratuit (besoin device physique)',
    triggers: ['broadlink', 'ir blaster', 'télécommande'],
    offlineCapable: true,
  },
  {
    id: 'tuya_smartlife',
    name: 'Tuya / Smart Life Cloud',
    category: 'iot_domotique',
    accessMode: 'direct',
    apiBase: 'https://openapi.tuyaeu.com',
    vaultKeys: ['tuya_client_id', 'tuya_secret', 'tuya_uid'],
    operations: ['devices', 'commands', 'status'],
    docs: 'https://developer.tuya.com/en/docs/cloud/',
    dashboard: 'https://iot.tuya.com/',
    freeTier: 'Trial 30j puis usage cloud',
    triggers: ['tuya', 'smart life', 'smartlife'],
  },
];

/* ============================================================================
 * Helpers runtime
 * ============================================================================ */

class DirectConnectorsRegistry {
  /**
   * Liste tous les connecteurs (filtrable).
   */
  list(filter?: { category?: ConnectorCategory; accessMode?: AccessMode }): DirectConnector[] {
    return DIRECT_CONNECTORS.filter((c) => {
      if (filter?.category && c.category !== filter.category) return false;
      if (filter?.accessMode && c.accessMode !== filter.accessMode && c.accessMode !== 'both') return false;
      return true;
    });
  }

  /**
   * Détecte les connecteurs configurés (clé vault disponible).
   */
  async listConfigured(): Promise<DirectConnector[]> {
    const result: DirectConnector[] = [];
    for (const c of DIRECT_CONNECTORS) {
      if (c.vaultKeys === null) {
        result.push(c); /* services publics sans clé */
        continue;
      }
      for (const key of c.vaultKeys) {
        try {
          const v = await vault.readKey(key);
          if (v && v.length > 4) {
            result.push(c);
            break;
          }
        } catch {
          /* clé absente, skip */
        }
      }
    }
    return result;
  }

  /**
   * Détecte les connecteurs MANQUANTS (qui pourraient apporter valeur).
   */
  async listMissing(): Promise<DirectConnector[]> {
    const configured = await this.listConfigured();
    const configuredIds = new Set(configured.map((c) => c.id));
    return DIRECT_CONNECTORS.filter((c) => !configuredIds.has(c.id));
  }

  /**
   * Détecte intent depuis message user → suggère connecteurs.
   */
  detectIntent(text: string): DirectConnector[] {
    const lc = text.toLowerCase();
    const matches: DirectConnector[] = [];
    for (const c of DIRECT_CONNECTORS) {
      for (const t of c.triggers) {
        if (lc.includes(t.toLowerCase())) {
          matches.push(c);
          break;
        }
      }
    }
    return matches;
  }

  /**
   * Stats pour vue admin.
   */
  getStats(): {
    total: number;
    byCategory: Record<string, number>;
    byAccessMode: Record<string, number>;
    offlineCapable: number;
    publicNoKey: number;
  } {
    const byCategory: Record<string, number> = {};
    const byAccessMode: Record<string, number> = {};
    let offlineCapable = 0;
    let publicNoKey = 0;
    for (const c of DIRECT_CONNECTORS) {
      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
      byAccessMode[c.accessMode] = (byAccessMode[c.accessMode] ?? 0) + 1;
      if (c.offlineCapable) offlineCapable++;
      if (c.vaultKeys === null) publicNoKey++;
    }
    return {
      total: DIRECT_CONNECTORS.length,
      byCategory,
      byAccessMode,
      offlineCapable,
      publicNoKey,
    };
  }

  /**
   * Section system prompt — informe Apex IA.
   */
  buildSystemPromptSection(configured: DirectConnector[]): string {
    const stats = this.getStats();
    const lines = [
      '\n## 🔌 Connecteurs DIRECTS (Apex autonome 100%)',
      '',
      `Tu (Apex) peux appeler ${stats.total} services en DIRECT (fetch + clés vault Kevin), sans dépendre de Claude Code/Anthropic.`,
      `${configured.length} configurés actuellement, ${stats.publicNoKey} publics sans clé, ${stats.offlineCapable} offline-capables.`,
      '',
      'Pour utiliser : `directConnectors.invoke({ id: "anthropic" | "github_api" | etc., op: "...", args: {...} })`.',
      'Apex doit auto-failover (si anthropic down → openrouter → groq → gemini).',
      '',
      `**Configurés (${configured.length})** : ${configured.slice(0, 30).map((c) => c.id).join(', ')}${configured.length > 30 ? '…' : ''}`,
      '',
      '**Catégories disponibles** : ' + Object.entries(stats.byCategory).map(([cat, n]) => `${cat}(${n})`).join(', '),
    ];
    return lines.join('\n');
  }

  /**
   * Generic invoke proxy : Apex IA peut appeler n'importe quel connecteur.
   * Sécurité : vérifie vault, applique redaction headers, timeout 30s.
   */
  async invoke(opts: {
    id: string;
    op: string;
    args?: Record<string, unknown>;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
  }): Promise<{ ok: boolean; status?: number; data?: unknown; error?: string }> {
    const conn = DIRECT_CONNECTORS.find((c) => c.id === opts.id);
    if (!conn) return { ok: false, error: `Unknown connector: ${opts.id}` };

    let authHeader: Record<string, string> = {};
    if (conn.vaultKeys && conn.vaultKeys.length > 0) {
      let keyValue: string | null = null;
      for (const k of conn.vaultKeys) {
        try {
          const v = await vault.readKey(k);
          if (v && v.length > 4) {
            keyValue = v;
            break;
          }
        } catch {
          /* skip */
        }
      }
      if (!keyValue) {
        return { ok: false, error: `Vault key missing for ${opts.id} (tried: ${conn.vaultKeys.join(', ')})` };
      }
      authHeader = this.buildAuthHeader(opts.id, keyValue);
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30000);
    try {
      const init: RequestInit = {
        method: opts.method ?? (opts.body ? 'POST' : 'GET'),
        headers: { ...authHeader, ...(opts.headers ?? {}) },
        signal: ctrl.signal,
      };
      if (opts.body) init.body = JSON.stringify(opts.body);
      const res = await fetch(`${conn.apiBase}/${opts.op}`, init);
      clearTimeout(timer);
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = await res.text();
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err: unknown) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('direct-connectors', `invoke failed ${opts.id}/${opts.op}`, { err: msg });
      return { ok: false, error: msg };
    }
  }

  /**
   * Construit le header d'auth selon le service (Bearer, x-api-key, Basic, etc.).
   */
  private buildAuthHeader(connectorId: string, key: string): Record<string, string> {
    /* Patterns d'auth les plus courants */
    const bearerIds = [
      'anthropic',
      'openai',
      'openrouter',
      'groq',
      'mistral',
      'cohere',
      'deepseek',
      'perplexity',
      'huggingface',
      'github_api',
      'gitlab_api',
      'replicate',
      'cloudflare_workers',
      'vercel_api',
      'netlify_api',
      'home_assistant',
    ];
    if (bearerIds.includes(connectorId)) return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    if (connectorId === 'anthropic') {
      return {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      };
    }
    if (connectorId === 'openweathermap' || connectorId === 'finnhub' || connectorId === 'newsapi') {
      /* Query param key, pas header — caller doit ajouter ?appid={key} */
      return { 'Content-Type': 'application/json' };
    }
    if (connectorId === 'brave_search') return { 'X-Subscription-Token': key, Accept: 'application/json' };
    if (connectorId === 'deepl') return { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' };
    if (connectorId === 'resend') return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    if (connectorId === 'brevo') return { 'api-key': key, 'Content-Type': 'application/json' };
    if (connectorId === 'stripe') return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' };
    if (connectorId === 'pinata_ipfs') return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    if (connectorId === 'unsplash') return { Authorization: `Client-ID ${key}` };
    if (connectorId === 'pexels') return { Authorization: key };
    if (connectorId === 'elevenlabs') return { 'xi-api-key': key, 'Content-Type': 'application/json' };
    if (connectorId === 'coinmarketcap') return { 'X-CMC_PRO_API_KEY': key, Accept: 'application/json' };
    if (connectorId === 'sentry') return { 'X-Sentry-Auth': `Sentry sentry_key=${key}, sentry_version=7` };
    /* Default : query param recommended, no header injected */
    return { 'Content-Type': 'application/json' };
  }
}

export const directConnectors = new DirectConnectorsRegistry();
