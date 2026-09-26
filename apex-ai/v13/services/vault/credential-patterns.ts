/**
 * APEX v13 — Patterns auto-detect 130+ credentials (règle CLAUDE.md absolue Kevin 2026-05-01)
 *
 * Quand Kevin colle quelque chose dans Apex, ces patterns identifient :
 * 1. Type de credential (Anthropic, OpenAI, Stripe, etc.)
 * 2. Service exact + clé de stockage scopée
 * 3. Lien dashboard / billing / docs / support pour auto-link
 *
 * INTERDICTION ABSOLUE de stocker :
 * - Seed phrases crypto (12/24 mots BIP39)
 * - Cartes bancaires complètes (PAN + CVV)
 * - Mots de passe bancaires plain
 */

export interface CredentialPattern {
  name: string;
  regex: RegExp;
  storageKey: string;
  category: 'ai' | 'saas' | 'devops' | 'finance' | 'comms' | 'storage' | 'identity' | 'forbidden';
  dashboard?: string;
  billing?: string;
  docs?: string;
  support?: string;
  testEndpoint?: string; /* URL pour ping/test validité */
  testMethod?: 'GET' | 'POST' | 'HEAD';
}

export const CREDENTIAL_PATTERNS: ReadonlyArray<CredentialPattern> = [
  /* === Téléphone Kevin WhatsApp (v13.0.81 fix Kevin "Apex refuse mon numéro") ===
   * PRIORITÉ #1 : Apex IA refusait de stocker le numéro WhatsApp Kevin (admin)
   * Maintenant: pattern détecté + auto-store ax_kevin_whatsapp_phone */
  {
    name: 'Téléphone Kevin WhatsApp',
    /* Formats : +33XXXXXXXXX, 0033XXXXXXXXX, 06XXXXXXXX, 07XXXXXXXX, +33 6 XX XX XX XX, etc. */
    regex: /^(?:\+|00)?(?:33\s?[67]|0[67])(?:[\s.-]?\d{2}){4}$/,
    storageKey: 'ax_kevin_whatsapp_phone',
    category: 'identity', /* identity = Kevin admin OK store, autres users non */
    dashboard: 'https://web.whatsapp.com',
    docs: 'https://developers.facebook.com/docs/whatsapp',
  },
  /* === Banking / Fintech (Kevin règle 2026-05-04 — banques courantes auto-detect) ===
     Placés en TÊTE car patterns spécifiques avec prefix nettement reconnaissable.
     Si placés en queue, les regex génériques (Cohere, Apex Push, Mistral) les capturent. */
  {
    name: 'Société Générale Client ID',
    regex: /^SG\d{12}$/,
    storageKey: 'ax_socgen_client_id',
    category: 'finance',
    dashboard: 'https://particuliers.sg.fr/icd-web/syd-front/index-page-connexion.html',
    docs: 'https://developer.societegenerale.com/',
  },
  {
    name: 'BNP Paribas ID',
    regex: /^bnp_\d{8,12}$/i,
    storageKey: 'ax_bnp_id',
    category: 'finance',
    dashboard: 'https://mabanque.bnpparibas/',
  },
  {
    name: 'Crédit Agricole ID',
    regex: /^ca_[a-z0-9]{8,16}$/i,
    storageKey: 'ax_credit_agricole_id',
    category: 'finance',
    dashboard: 'https://www.credit-agricole.fr/',
  },
  {
    name: 'Crédit Mutuel ID',
    regex: /^cm_[a-z0-9]{8,16}$/i,
    storageKey: 'ax_credit_mutuel_id',
    category: 'finance',
    dashboard: 'https://www.creditmutuel.fr/',
  },
  {
    name: 'BPCE/Caisse Épargne ID',
    regex: /^bpce_[a-z0-9]{8,16}$/i,
    storageKey: 'ax_bpce_id',
    category: 'finance',
    dashboard: 'https://www.caisse-epargne.fr/',
  },
  {
    name: 'La Banque Postale ID',
    regex: /^lbp_\d{8,12}$/i,
    storageKey: 'ax_lbp_id',
    category: 'finance',
    dashboard: 'https://www.labanquepostale.fr/particulier.html',
  },
  {
    name: 'ING France ID',
    regex: /^ing_[a-z0-9]{8,16}$/i,
    storageKey: 'ax_ing_id',
    category: 'finance',
    dashboard: 'https://www.ing.fr/',
  },
  {
    name: 'Boursorama Client',
    regex: /^bourso_[a-z0-9]{8,16}$/i,
    storageKey: 'ax_boursorama_id',
    category: 'finance',
    dashboard: 'https://clients.boursorama.com/connexion',
  },
  {
    name: 'Fortuneo Client',
    regex: /^fortuneo_[a-z0-9]{8,16}$/i,
    storageKey: 'ax_fortuneo_id',
    category: 'finance',
    dashboard: 'https://mabanque.fortuneo.fr/',
  },
  {
    name: 'N26 User ID',
    regex: /^n26_[a-z0-9-]{16,}$/i,
    storageKey: 'ax_n26_id',
    category: 'finance',
    dashboard: 'https://app.n26.com/',
  },
  {
    name: 'Revolut Tag',
    regex: /^@?revolut_[a-z0-9]{4,32}$/i,
    storageKey: 'ax_revolut_tag',
    category: 'finance',
    dashboard: 'https://app.revolut.com/',
  },
  {
    name: 'Wise (TransferWise) Profile',
    regex: /^wise_\d{6,12}$/i,
    storageKey: 'ax_wise_profile_id',
    category: 'finance',
    dashboard: 'https://wise.com/user/account',
    docs: 'https://api-docs.wise.com/',
  },
  {
    name: 'Lydia Tag',
    regex: /^@?lydia_[a-z0-9._-]{2,32}$/i,
    storageKey: 'ax_lydia_tag',
    category: 'finance',
    dashboard: 'https://lydia-app.com/',
  },
  {
    name: 'PayPal Email Tag',
    regex: /^paypal:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i,
    storageKey: 'ax_paypal_email',
    category: 'finance',
    dashboard: 'https://www.paypal.com/',
  },

  /* === Crypto exchanges === */
  {
    name: 'Coinbase API Key',
    regex: /^coinbase_[A-Za-z0-9]{20,}$/,
    storageKey: 'ax_coinbase_key',
    category: 'finance',
    dashboard: 'https://www.coinbase.com/settings/api',
    docs: 'https://docs.cloud.coinbase.com/',
  },
  {
    name: 'Binance API Key',
    regex: /^binance_[A-Za-z0-9]{40,}$/,
    storageKey: 'ax_binance_key',
    category: 'finance',
    dashboard: 'https://www.binance.com/en/my/settings/api-management',
    docs: 'https://binance-docs.github.io/apidocs/',
  },
  {
    name: 'Crypto.com API Key',
    regex: /^crypto_[A-Za-z0-9]{20,}$/,
    storageKey: 'ax_crypto_com_key',
    category: 'finance',
    dashboard: 'https://crypto.com/exchange/user/profile/api',
  },
  {
    name: 'Kraken API Key',
    regex: /^kraken_[A-Za-z0-9/+=]{40,}$/,
    storageKey: 'ax_kraken_key',
    category: 'finance',
    dashboard: 'https://www.kraken.com/u/security/api',
    docs: 'https://docs.kraken.com/rest/',
  },

  /* === Réseaux sociaux / Marketing === */
  {
    name: 'Facebook OAuth Token',
    regex: /^EAA[A-Za-z0-9]{50,}$/,
    storageKey: 'ax_facebook_oauth',
    category: 'comms',
    dashboard: 'https://developers.facebook.com/apps/',
    docs: 'https://developers.facebook.com/docs/graph-api/',
  },
  {
    name: 'Instagram Access Token',
    regex: /^IGQVJ[A-Za-z0-9_-]{50,}$/,
    storageKey: 'ax_instagram_token',
    category: 'comms',
    dashboard: 'https://developers.facebook.com/apps/',
    docs: 'https://developers.facebook.com/docs/instagram-api/',
  },
  {
    name: 'TikTok Creator Token',
    regex: /^tiktok_[A-Za-z0-9._-]{20,}$/i,
    storageKey: 'ax_tiktok_token',
    category: 'comms',
    dashboard: 'https://developers.tiktok.com/',
    docs: 'https://developers.tiktok.com/doc/',
  },
  {
    /* v13.3.98 FIX FAUX POSITIF Kevin "il a reconnu YouTube alors que c'est Google AI Gemini" :
     * Avant : /^AIzaSy[A-Za-z0-9_-]{33}$/ matchait TOUTE clé Google API standard
     * (Gemini AI, YouTube, Maps, Cloud Vision, etc.) car toutes commencent par AIzaSy.
     * Le faux positif YouTube prenait précédence sur Google AI dans l'ordre.
     * Après : pattern STRICT préfixe explicite `youtube:` (Kevin doit taper
     * `youtube:AIzaSy...` pour le classifier YouTube). Sinon par défaut → Google AI.
     * Règle Kevin : un AIza{33} = Google AI (Gemini) par défaut. */
    name: 'YouTube API Key (préfixe explicite)',
    regex: /^youtube:AIza[A-Za-z0-9_-]{33}$/i,
    storageKey: 'ax_youtube_key',
    category: 'comms',
    dashboard: 'https://console.cloud.google.com/apis/credentials',
    docs: 'https://developers.google.com/youtube/v3',
  },
  {
    name: 'Twitter/X Bearer Token',
    regex: /^AAAAAAAAAAAAAAAAAA[A-Za-z0-9%]{50,}$/,
    storageKey: 'ax_twitter_bearer',
    category: 'comms',
    dashboard: 'https://developer.twitter.com/en/portal/dashboard',
    docs: 'https://developer.twitter.com/en/docs/twitter-api',
  },
  {
    name: 'LinkedIn Access Token',
    regex: /^AQ[A-Za-z0-9_-]{100,}$/,
    storageKey: 'ax_linkedin_token',
    category: 'comms',
    dashboard: 'https://www.linkedin.com/developers/apps',
    docs: 'https://learn.microsoft.com/en-us/linkedin/',
  },

  /* === Productivité / Identité (NON stocké, juste détecté pour reconnaissance) === */
  {
    name: 'Google Account Email',
    regex: /^[a-z0-9._%+-]+@gmail\.com$/i,
    storageKey: 'ax_google_email',
    category: 'identity',
    dashboard: 'https://myaccount.google.com/',
  },
  {
    name: 'Microsoft 365 Email',
    regex: /^[a-z0-9._%+-]+@(?:outlook|hotmail|live|microsoft|office365)\.[a-z.]{2,}$/i,
    storageKey: 'ax_microsoft_email',
    category: 'identity',
    dashboard: 'https://account.microsoft.com/',
  },
  {
    name: 'Apple ID Email',
    regex: /^[a-z0-9._%+-]+@(?:icloud|me|mac)\.com$/i,
    storageKey: 'ax_apple_email',
    category: 'identity',
    dashboard: 'https://appleid.apple.com/',
  },

  /* === E-commerce / Délivrables === */
  {
    name: 'Stripe Connect Account',
    regex: /^acct_[A-Za-z0-9]{16,}$/,
    storageKey: 'ax_stripe_connect_acct',
    category: 'finance',
    dashboard: 'https://dashboard.stripe.com/connect/accounts',
    docs: 'https://stripe.com/docs/connect',
  },
  {
    name: 'PayPal Business Email',
    regex: /^paypal_biz:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i,
    storageKey: 'ax_paypal_business_email',
    category: 'finance',
    dashboard: 'https://www.paypal.com/businessmanage/',
  },
  {
    name: 'Shopify Admin Token',
    regex: /^shpat_[a-f0-9]{32}$/,
    storageKey: 'ax_shopify_token',
    category: 'finance',
    dashboard: 'https://admin.shopify.com/',
    docs: 'https://shopify.dev/docs/api/admin-rest',
  },
  {
    name: 'Shopify Storefront Token',
    regex: /^shpss_[a-f0-9]{32}$/,
    storageKey: 'ax_shopify_storefront',
    category: 'finance',
    dashboard: 'https://admin.shopify.com/',
  },

  /* === AI providers === */
  {
    name: 'Anthropic',
    regex: /^sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}$/,
    storageKey: 'ax_anthropic_key',
    category: 'ai',
    dashboard: 'https://console.anthropic.com/',
    billing: 'https://console.anthropic.com/settings/billing',
    docs: 'https://docs.anthropic.com/',
    support: 'https://support.anthropic.com/',
    testEndpoint: 'https://api.anthropic.com/v1/messages',
    testMethod: 'POST',
  },
  {
    name: 'OpenAI Project',
    regex: /^sk-proj-[A-Za-z0-9_-]{40,}$/,
    storageKey: 'ax_openai_key_proj',
    category: 'ai',
    dashboard: 'https://platform.openai.com/',
    docs: 'https://platform.openai.com/docs',
    testEndpoint: 'https://api.openai.com/v1/models',
    testMethod: 'GET',
  },
  {
    name: 'OpenAI',
    regex: /^sk-(?!ant-)(?!proj-)[A-Za-z0-9_-]{40,}$/,
    storageKey: 'ax_openai_key',
    category: 'ai',
    dashboard: 'https://platform.openai.com/',
    billing: 'https://platform.openai.com/account/billing',
    docs: 'https://platform.openai.com/docs',
    support: 'https://help.openai.com/',
    testEndpoint: 'https://api.openai.com/v1/models',
    testMethod: 'GET',
  },
  {
    /* v13.4.49 re-apply v13.4.42 rename (écrasé par autre agent v13.4.43) */
    name: 'Google AI Gemini',
    regex: /^AIza[A-Za-z0-9_-]{33}$/,
    storageKey: 'ax_gemini_key',
    category: 'ai',
    dashboard: 'https://aistudio.google.com/',
    billing: 'https://console.cloud.google.com/billing',
    docs: 'https://ai.google.dev/docs',
    testEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    testMethod: 'GET',
  },
  {
    name: 'Groq',
    regex: /^gsk_[A-Za-z0-9]{40,}$/,
    storageKey: 'ax_groq_key',
    category: 'ai',
    dashboard: 'https://console.groq.com/',
    billing: 'https://console.groq.com/settings/billing',
    docs: 'https://console.groq.com/docs',
    testEndpoint: 'https://api.groq.com/openai/v1/models',
    testMethod: 'GET',
  },
  {
    name: 'Perplexity',
    regex: /^pplx-[A-Za-z0-9]{40,}$/,
    storageKey: 'ax_perplexity_key',
    category: 'ai',
    dashboard: 'https://perplexity.ai/settings/api',
    docs: 'https://docs.perplexity.ai/',
  },
  {
    name: 'OpenRouter',
    regex: /^sk-or-(?:v1-)?[A-Za-z0-9]{40,}$/,
    storageKey: 'ax_openrouter_key',
    category: 'ai',
    dashboard: 'https://openrouter.ai/keys',
    billing: 'https://openrouter.ai/credits',
    docs: 'https://openrouter.ai/docs',
  },
  {
    name: 'Cohere',
    /* v13.3.95 P0 FIX Kevin "il a reconnu une API en Cohere alors que c'est pas Cohere" :
     * Avant : /^(?:co_|[A-Za-z0-9]{40})[A-Za-z0-9]{0,40}$/ matchait TOUTE string 40-80 chars
     * → XAI/Anthropic/OpenAI/GitHub étaient capturés comme Cohere si leur pattern spécifique
     * échouait avant. C'est ce qui causait les "10 illisibles" mal classées.
     * Après : pattern STRICT préfixe co_ uniquement (le format légitime Cohere).
     * Trial keys Cohere historiques (40 chars sans préfixe) → laisser détection manuelle
     * via le bouton "+ Ajouter" du Coffre. */
    regex: /^co_[A-Za-z0-9]{40,}$/,
    storageKey: 'ax_cohere_key',
    category: 'ai',
    dashboard: 'https://dashboard.cohere.com/',
    docs: 'https://docs.cohere.com/',
  },
  {
    name: 'DeepSeek',
    regex: /^sk-[a-f0-9]{32,}$/,
    storageKey: 'ax_deepseek_key',
    category: 'ai',
    dashboard: 'https://platform.deepseek.com/api_keys',
    docs: 'https://platform.deepseek.com/api-docs',
  },
  {
    /* Pinecone vector DB — RAG mémoire sémantique Apex (mcp-memory-stub.ts).
     * v13.3.59 (Kevin 2026-05-08 00:44) : pattern manquant — ajout pour autoStore. */
    name: 'Pinecone',
    regex: /^pcsk_[A-Za-z0-9_]{40,}$/,
    storageKey: 'ax_pinecone_key',
    category: 'ai',
    dashboard: 'https://app.pinecone.io/',
    docs: 'https://docs.pinecone.io/',
  },
  {
    name: 'Mistral',
    regex: /^[A-Za-z0-9]{32}$/,
    storageKey: 'ax_mistral_key',
    category: 'ai',
    dashboard: 'https://console.mistral.ai/',
    docs: 'https://docs.mistral.ai/',
  },
  {
    name: 'xAI Grok',
    regex: /^xai-[A-Za-z0-9]{40,}$/,
    storageKey: 'ax_xai_key',
    category: 'ai',
    dashboard: 'https://console.x.ai/',
    docs: 'https://docs.x.ai/',
  },
  {
    name: 'ElevenLabs',
    regex: /^[a-f0-9]{32}$/,
    storageKey: 'ax_elevenlabs_key',
    category: 'ai',
    dashboard: 'https://elevenlabs.io/app/settings/api-keys',
    billing: 'https://elevenlabs.io/app/subscription',
    docs: 'https://elevenlabs.io/docs',
  },
  {
    name: 'Replicate',
    /* v13.4.278 (Kevin "collé une API Replicate, il comprend Cloudflare") :
     * avant /^r8_[A-Za-z0-9]{40,}$/ exigeait 40 chars APRÈS r8_ (total ≥43).
     * Or les vrais tokens Replicate font ~40 chars au total (r8_ + ~37) → ratés,
     * puis capturés par le filtre Cloudflare 40-chars. Assoupli à {20,} : le
     * préfixe r8_ est distinctif, et Replicate est testé AVANT Cloudflare. */
    regex: /^r8_[A-Za-z0-9]{20,}$/,
    storageKey: 'ax_replicate_key',
    category: 'ai',
    dashboard: 'https://replicate.com/account/api-tokens',
    billing: 'https://replicate.com/account/billing',
    docs: 'https://replicate.com/docs',
  },

  /* === Devops / Code === */
  /* v13.4.6 Kevin "GitHub fine confondu" — storageKey distincts pour ne pas écraser
   * v13.4.49 re-apply v13.4.42 rename : ax_github_token_* → ax_github_pat_* */
  {
    name: 'GitHub Fine-grained',
    regex: /^github_pat_[A-Za-z0-9_]{82,}$/,
    storageKey: 'ax_github_pat_finegrained',
    category: 'devops',
    dashboard: 'https://github.com/settings/personal-access-tokens',
    docs: 'https://docs.github.com/en/rest/overview/authenticating-to-the-rest-api',
    testEndpoint: 'https://api.github.com/user',
    testMethod: 'GET',
  },
  {
    name: 'GitHub PAT classic',
    regex: /^ghp_[A-Za-z0-9]{36}$/,
    storageKey: 'ax_github_pat_classic',
    category: 'devops',
    dashboard: 'https://github.com/settings/tokens',
    docs: 'https://docs.github.com/en/rest',
    testEndpoint: 'https://api.github.com/user',
    testMethod: 'GET',
  },
  {
    name: 'GitHub OAuth',
    regex: /^gho_[A-Za-z0-9]{36}$/,
    storageKey: 'ax_github_oauth',
    category: 'devops',
  },
  {
    name: 'GitLab PAT',
    regex: /^glpat-[A-Za-z0-9_-]{20,}$/,
    storageKey: 'ax_gitlab_token',
    category: 'devops',
    dashboard: 'https://gitlab.com/-/user_settings/personal_access_tokens',
  },
  {
    name: 'Cloudflare API Token',
    /* v13.4.276 (Kevin "Quand je colle finnhub il la confond avec Cloudfare") :
     * lookahead exige ≥1 majuscule OU underscore/dash → discrimine vs clés
     * Finnhub (lowercase+digits seuls, format `cv0xxx...`). Les vrais tokens
     * Cloudflare contiennent toujours mixed case + `_-` (ex `iVz_KEvjsj-V8...`). */
    regex: /^(?=.*[A-Z_-])[A-Za-z0-9_-]{40}$/,
    storageKey: 'ax_cloudflare_token',
    category: 'devops',
    dashboard: 'https://dash.cloudflare.com/profile/api-tokens',
    docs: 'https://developers.cloudflare.com/api/',
    testEndpoint: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
    testMethod: 'GET',
  },
  {
    name: 'Vercel Token',
    regex: /^[A-Za-z0-9]{24}$/,
    storageKey: 'ax_vercel_token',
    category: 'devops',
    dashboard: 'https://vercel.com/account/tokens',
  },
  {
    name: 'Netlify Token',
    regex: /^nf[a-z]_[A-Za-z0-9]{40,}$/,
    storageKey: 'ax_netlify_token',
    category: 'devops',
    dashboard: 'https://app.netlify.com/user/applications',
  },
  {
    name: 'Railway Token',
    regex: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    storageKey: 'ax_railway_token',
    category: 'devops',
    dashboard: 'https://railway.app/account/tokens',
  },
  /* v13.4.108 (Kevin context drop 2026-05-15) — patterns Kevin stack manquants */
  {
    name: 'Tavily',
    /* Format : tvly-<key> ou tvly-dev-<key> (MCP + standalone) */
    regex: /^tvly-(?:dev-)?[A-Za-z0-9_-]{20,}$/,
    storageKey: 'ax_tavily_key',
    category: 'ai',
    dashboard: 'https://app.tavily.com/home',
    docs: 'https://docs.tavily.com/',
    testEndpoint: 'https://api.tavily.com/search',
    testMethod: 'POST',
  },
  {
    name: 'Together AI',
    /* Format : key_<long-hex-or-alphanum> */
    regex: /^key_[A-Za-z0-9]{40,}$/,
    storageKey: 'ax_together_key',
    category: 'ai',
    dashboard: 'https://api.together.xyz/settings/api-keys',
    docs: 'https://docs.together.ai/',
    testEndpoint: 'https://api.together.xyz/v1/models',
    testMethod: 'GET',
  },
  {
    name: 'Finnhub',
    /* Format : 20+ chars lowercase alphanumerique */
    regex: /^[a-z0-9]{20,}$/,
    storageKey: 'ax_finnhub_key',
    category: 'finance',
    dashboard: 'https://finnhub.io/dashboard',
    docs: 'https://finnhub.io/docs/api',
    testEndpoint: 'https://finnhub.io/api/v1/quote?symbol=AAPL',
    testMethod: 'GET',
  },
  {
    name: 'Légifrance / Openlegi.fr Token',
    /* Format : 40+ chars hex */
    regex: /^[a-f0-9]{40,}$/,
    storageKey: 'ax_legifrance_token',
    category: 'saas',
    dashboard: 'https://mcp.openlegi.fr/',
    docs: 'https://mcp.openlegi.fr/legifrance/mcp',
  },
  {
    name: 'Cloudflare Global Key',
    regex: /^cfk_[A-Za-z0-9]{20,}$/,
    storageKey: 'ax_cloudflare_global_key',
    category: 'devops',
    dashboard: 'https://dash.cloudflare.com/profile/api-tokens',
  },
  {
    name: 'Cloudflare Auth Token',
    regex: /^cfaut_[A-Za-z0-9]{15,}$/,
    storageKey: 'ax_cloudflare_auth_token',
    category: 'devops',
    dashboard: 'https://dash.cloudflare.com/profile/api-tokens',
  },
  {
    name: 'Cloudflare Origin CA',
    regex: /^v1\.0-[A-Za-z0-9]{40,}$/,
    storageKey: 'ax_cloudflare_origin_ca',
    category: 'devops',
    dashboard: 'https://dash.cloudflare.com/profile/api-tokens',
  },
  /* v13.4.110 REVERT — pattern EmailJS Private Key retire :
   * Format trop generique [A-Za-z0-9_-]{15,30} matchait AWS (AKIA+16=20 chars)
   * et autres tokens. EmailJS private key sera detectee par pattern learner
   * v13.4.109 si Kevin la colle (apprentissage automatique). */
  {
    name: 'AWS Access Key',
    regex: /^AKIA[0-9A-Z]{16}$/,
    storageKey: 'ax_aws_access_key',
    category: 'devops',
    dashboard: 'https://console.aws.amazon.com/iam/home',
  },
  {
    name: 'Heroku API Key',
    regex: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    storageKey: 'ax_heroku_key',
    category: 'devops',
    dashboard: 'https://dashboard.heroku.com/account',
  },
  {
    name: 'Sentry DSN',
    regex: /^https:\/\/[a-f0-9]+@[a-z0-9.-]+\.ingest\.sentry\.io\/\d+$/,
    storageKey: 'ax_sentry_dsn',
    category: 'devops',
    dashboard: 'https://sentry.io/settings/account/api/auth-tokens/',
    docs: 'https://docs.sentry.io/',
  },

  /* === Finance / Paiement === */
  {
    name: 'Stripe Secret Key',
    regex: /^sk_(live|test)_[A-Za-z0-9]{24,}$/,
    storageKey: 'ax_stripe_sk',
    category: 'finance',
    dashboard: 'https://dashboard.stripe.com/apikeys',
    billing: 'https://dashboard.stripe.com/billing',
    docs: 'https://stripe.com/docs/api',
    support: 'https://support.stripe.com/',
  },
  {
    name: 'Stripe Publishable',
    regex: /^pk_(live|test)_[A-Za-z0-9]{24,}$/,
    storageKey: 'ax_stripe_pk',
    category: 'finance',
    dashboard: 'https://dashboard.stripe.com/apikeys',
  },
  {
    name: 'Stripe Webhook',
    regex: /^whsec_[A-Za-z0-9]{32,}$/,
    storageKey: 'ax_stripe_whsec',
    category: 'finance',
  },
  {
    name: 'PayPal Client ID',
    regex: /^A[A-Za-z0-9_-]{79}$/,
    storageKey: 'ax_paypal_client',
    category: 'finance',
    dashboard: 'https://developer.paypal.com/dashboard/',
  },

  /* === Communications === */
  {
    name: 'Brevo (Sendinblue)',
    regex: /^xkeysib-[a-f0-9]+-[A-Za-z0-9]+$/,
    storageKey: 'ax_brevo_key',
    category: 'comms',
    dashboard: 'https://app.brevo.com/settings/keys/api',
    billing: 'https://app.brevo.com/billing/',
    docs: 'https://developers.brevo.com/',
  },
  {
    name: 'Resend',
    regex: /^re_[A-Za-z0-9_]+$/,
    storageKey: 'ax_resend_key',
    category: 'comms',
    dashboard: 'https://resend.com/api-keys',
    billing: 'https://resend.com/settings/billing',
    docs: 'https://resend.com/docs',
  },
  {
    name: 'SendGrid',
    regex: /^SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/,
    storageKey: 'ax_sendgrid_key',
    category: 'comms',
    dashboard: 'https://app.sendgrid.com/settings/api_keys',
  },
  {
    name: 'Mailchimp',
    regex: /^[a-f0-9]{32}-us\d{1,2}$/,
    storageKey: 'ax_mailchimp_key',
    category: 'comms',
    dashboard: 'https://us1.admin.mailchimp.com/account/api/',
  },
  {
    name: 'Twilio Auth Token',
    regex: /^[a-f0-9]{32}$/,
    storageKey: 'ax_twilio_token',
    category: 'comms',
    dashboard: 'https://console.twilio.com/',
  },
  {
    name: 'Twilio Account SID',
    regex: /^AC[a-f0-9]{32}$/,
    storageKey: 'ax_twilio_sid',
    category: 'comms',
  },
  {
    name: 'Telegram Bot Token',
    regex: /^\d{8,}:[A-Za-z0-9_-]{35}$/,
    storageKey: 'ax_telegram_token',
    category: 'comms',
    dashboard: 'https://t.me/BotFather',
    docs: 'https://core.telegram.org/bots/api',
    testEndpoint: 'https://api.telegram.org/botPLACEHOLDER/getMe',
    testMethod: 'GET',
  },
  {
    name: 'Slack Bot Token',
    regex: /^xoxb-[A-Za-z0-9-]+$/,
    storageKey: 'ax_slack_bot',
    category: 'comms',
    dashboard: 'https://api.slack.com/apps',
  },
  {
    name: 'Slack User Token',
    regex: /^xoxp-[A-Za-z0-9-]+$/,
    storageKey: 'ax_slack_user',
    category: 'comms',
  },
  {
    name: 'Discord Bot Token',
    regex: /^[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}$/,
    storageKey: 'ax_discord_bot',
    category: 'comms',
    dashboard: 'https://discord.com/developers/applications',
  },
  {
    /* P1 audit fix v13.3.10 (Kevin "alerts Discord muettes") :
     * pattern auto-detect webhook Discord URL pour qu'il soit stocké dans
     * ax_discord_webhook_url (lu par services/kevin-alerts.ts:130).
     * Format officiel : https://discord.com/api/webhooks/{id}/{token} */
    name: 'Discord Webhook URL',
    regex: /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/,
    storageKey: 'ax_discord_webhook_url',
    category: 'comms',
    dashboard: 'https://discord.com/developers/docs/resources/webhook',
    docs: 'https://discord.com/developers/docs/resources/webhook#execute-webhook',
  },

  /* === Storage / Productivity === */
  {
    name: 'Notion Internal',
    regex: /^secret_[A-Za-z0-9]+$/,
    storageKey: 'ax_notion_key',
    category: 'storage',
    dashboard: 'https://www.notion.so/my-integrations',
    docs: 'https://developers.notion.com/',
  },
  {
    name: 'Airtable PAT',
    regex: /^pat[A-Za-z0-9.]+$/,
    storageKey: 'ax_airtable_pat',
    category: 'storage',
    dashboard: 'https://airtable.com/create/tokens',
    docs: 'https://airtable.com/developers/web/api/',
  },
  {
    name: 'Dropbox Token',
    regex: /^sl\.[A-Za-z0-9_-]+$/,
    storageKey: 'ax_dropbox_token',
    category: 'storage',
    dashboard: 'https://www.dropbox.com/developers/apps',
  },
  {
    name: 'DeepL',
    regex: /^[a-f0-9-]+:fx$/,
    storageKey: 'ax_deepl_key',
    category: 'ai',
    dashboard: 'https://www.deepl.com/account/usage',
    billing: 'https://www.deepl.com/pro',
  },

  /* === Push Notifications (VAPID + Apex Cloudflare Worker) === */
  {
    name: 'VAPID Public Key',
    regex: /^B[A-Za-z0-9_-]{86}$/,
    storageKey: 'ax_vapid_public',
    category: 'saas',
    dashboard: 'https://dash.cloudflare.com/?to=/:account/workers',
  },
  {
    name: 'VAPID Private Key',
    regex: /^[A-Za-z0-9_-]{43}$/,
    storageKey: 'ax_vapid_private',
    category: 'saas',
    dashboard: 'https://dash.cloudflare.com/?to=/:account/workers',
  },
  {
    name: 'Apex Push Admin Token',
    regex: /^[A-Za-z0-9_-]{40,128}$/,
    storageKey: 'apex_v13_push_admin_token',
    category: 'saas',
    dashboard: 'https://dash.cloudflare.com/?to=/:account/workers',
  },
  {
    name: 'Apex Push Worker URL',
    regex: /^https:\/\/[a-z0-9-]+\.workers\.dev\/?$/,
    storageKey: 'apex_v13_push_worker_url',
    category: 'saas',
    dashboard: 'https://dash.cloudflare.com/?to=/:account/workers',
  },

  /* === Stripe restricted keys (rk_live_*, rk_test_*) === */
  {
    name: 'Stripe Restricted Key',
    regex: /^rk_(live|test)_[A-Za-z0-9]{24,}$/,
    storageKey: 'ax_stripe_rk',
    category: 'finance',
    dashboard: 'https://dashboard.stripe.com/apikeys',
    billing: 'https://dashboard.stripe.com/billing',
  },

  /* === Identité (PAS de stockage !) === */
  {
    name: 'IBAN',
    regex: /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/,
    storageKey: 'ax_iban',
    category: 'identity',
    dashboard: '',
  },
  {
    name: 'BIC/SWIFT',
    regex: /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/,
    storageKey: 'ax_bic',
    category: 'identity',
  },
  {
    name: 'SIRET',
    regex: /^\d{14}$/,
    storageKey: 'ax_siret',
    category: 'identity',
  },
  {
    name: 'TVA EU',
    regex: /^[A-Z]{2}\d{8,12}$/,
    storageKey: 'ax_vat_eu',
    category: 'identity',
  },

  /* === Connection strings DB / Cache (Kevin v13.3.98 — Railway/Postgres/Redis collés ~20 fois sans détection) ===
     * Ces patterns capturent les URLs complètes user:pass@host/db.
     * Stockage dédié par moteur pour permettre routing automatique. */
  {
    name: 'PostgreSQL Connection',
    regex: /^postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[a-zA-Z0-9.-]+(?::\d+)?\/[A-Za-z0-9_-]+(?:\?[^\s]*)?$/,
    storageKey: 'ax_postgres_url',
    category: 'devops',
    dashboard: 'https://www.postgresql.org/',
    docs: 'https://www.postgresql.org/docs/',
  },
  {
    name: 'MySQL Connection',
    regex: /^mysql:\/\/[^:\s]+:[^@\s]+@[a-zA-Z0-9.-]+(?::\d+)?\/[A-Za-z0-9_-]+(?:\?[^\s]*)?$/,
    storageKey: 'ax_mysql_url',
    category: 'devops',
    dashboard: 'https://www.mysql.com/',
    docs: 'https://dev.mysql.com/doc/',
  },
  {
    name: 'MongoDB Connection',
    regex: /^mongodb(?:\+srv)?:\/\/(?:[^:\s]+:[^@\s]+@)?[a-zA-Z0-9.,_-]+(?::\d+)?(?:\/[A-Za-z0-9_-]+)?(?:\?[^\s]*)?$/,
    storageKey: 'ax_mongodb_url',
    category: 'devops',
    dashboard: 'https://cloud.mongodb.com/',
    docs: 'https://www.mongodb.com/docs/',
  },
  {
    name: 'Redis Connection',
    regex: /^rediss?:\/\/(?:[^:\s]*:[^@\s]+@)?[a-zA-Z0-9.-]+(?::\d+)?(?:\/\d+)?(?:\?[^\s]*)?$/,
    storageKey: 'ax_redis_url',
    category: 'devops',
    dashboard: 'https://redis.io/',
    docs: 'https://redis.io/docs/',
  },
  {
    name: 'WebSocket URL (avec token)',
    regex: /^wss?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[^\s?]*)?(?:\?[^\s]*token[^\s]*)?$/,
    storageKey: 'ax_websocket_url',
    category: 'devops',
  },

  /* === Webhooks tiers (alerts, ops) === */
  {
    /* Slack incoming webhook : https://hooks.slack.com/services/T(team)/B(bot)/(token) */
    name: 'Slack Webhook URL',
    regex: /^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}$/,
    storageKey: 'ax_slack_webhook_url',
    category: 'comms',
    dashboard: 'https://api.slack.com/messaging/webhooks',
    docs: 'https://api.slack.com/messaging/webhooks',
  },
  {
    /* GitHub webhook URL générique (incoming events Apex) */
    name: 'GitHub Webhook URL',
    regex: /^https:\/\/api\.github\.com\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/hooks(?:\/\d+)?$/,
    storageKey: 'ax_github_webhook_url',
    category: 'devops',
    dashboard: 'https://github.com/settings/hooks',
    docs: 'https://docs.github.com/en/webhooks',
  },

  /* === Plateformes hébergement / Workers === */
  {
    /* Railway service URL (forme : https://*.railway.app ou https://*.up.railway.app)
     * Kevin a Railway hosting → Postgres + Redis + Apps. Détection URL pour routing. */
    name: 'Railway Service URL',
    regex: /^https:\/\/[a-z0-9-]+(?:\.up)?\.railway\.app(?:\/[^\s]*)?$/i,
    storageKey: 'ax_railway_url',
    category: 'devops',
    dashboard: 'https://railway.app/dashboard',
    docs: 'https://docs.railway.app/',
  },
  {
    /* Cloudflare Worker URL générique (autre que apex_v13_push_worker_url qui est typed strict) */
    name: 'Cloudflare Worker URL',
    regex: /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev(?:\/[^\s]*)?$/i,
    storageKey: 'ax_cloudflare_worker_url',
    category: 'devops',
    dashboard: 'https://dash.cloudflare.com/?to=/:account/workers',
    docs: 'https://developers.cloudflare.com/workers/',
  },

  /* === Tokens auth génériques (OAuth refresh / JWT) ===
     * Placés ici APRÈS les patterns spécifiques pour ne pas écraser GitHub/Google etc. */
  {
    /* Google OAuth refresh token — format `1//xxx{50+}` */
    name: 'Google OAuth Refresh Token',
    regex: /^1\/\/[A-Za-z0-9_-]{50,}$/,
    storageKey: 'ax_google_oauth_refresh',
    category: 'identity',
    dashboard: 'https://console.cloud.google.com/apis/credentials',
    docs: 'https://developers.google.com/identity/protocols/oauth2',
  },
  {
    /* JWT générique (header.payload.signature en base64url) — détection minimale.
     * On ne stocke pas par défaut un JWT inconnu (faux positifs possibles), mais on
     * propose à Kevin de classifier. */
    name: 'JWT Token (générique)',
    regex: /^eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/,
    storageKey: 'ax_jwt_token',
    category: 'identity',
  },

  /* === FORBIDDEN — détection pour avertir Kevin, JAMAIS stocker === */
  {
    name: '⚠️ Carte bancaire',
    regex: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/,
    storageKey: '__FORBIDDEN_CB__',
    category: 'forbidden',
  },
  {
    name: '⚠️ Seed phrase BIP39 (12 mots)',
    regex: /^(\w+\s+){11}\w+$/,
    storageKey: '__FORBIDDEN_SEED__',
    category: 'forbidden',
  },
  {
    name: '⚠️ Seed phrase BIP39 (24 mots)',
    regex: /^(\w+\s+){23}\w+$/,
    storageKey: '__FORBIDDEN_SEED__',
    category: 'forbidden',
  },
  {
    name: '⚠️ Mot de passe bancaire (refusé)',
    regex: /^(?:bank_password|bank_pass|mdp_banque):/i,
    storageKey: '__FORBIDDEN_BANK_PASS__',
    category: 'forbidden',
  },
  {
    /* SSH private key — refus stockage (doit rester sur device hardware/keychain) */
    name: '⚠️ SSH Private Key (refusée)',
    regex: /^-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/m,
    storageKey: '__FORBIDDEN_SSH_KEY__',
    category: 'forbidden',
  },
];

/* v13.4.278 (Kevin "auto détection jusqu'à trouver le bon") — anti-faux-positif
 * systémique. Spécificité d'un pattern = longueur du préfixe LITTÉRAL après `^`
 * (avant toute classe / quantificateur / lookahead).
 *   /^r8_[A-Za-z0-9]{20,}$/                       → 3   (préfixe "r8_")
 *   /^sk-ant-api\d{2}-.../                          → 10  (préfixe "sk-ant-api")
 *   /^(?=.*[A-Z_-])[A-Za-z0-9_-]{40}$/ (Cloudflare) → 0   (lookahead = générique)
 *   /^[A-Za-z0-9]{32}$/ (Mistral)                   → 0   (longueur seule)
 * → on préfère TOUJOURS le service à préfixe distinctif vs une heuristique de
 *   longueur. Corrige toute la classe "r8_ pris pour Cloudflare 40-chars". */
function patternSpecificity(re: RegExp): number {
  const src = re.source.replace(/^\^/, '');
  const m = src.match(/^([A-Za-z0-9_:@./-]+)/);
  return m?.[1]?.length ?? 0;
}

/* Parmi tous les patterns non-forbidden qui matchent `v`, retourne le PLUS
 * spécifique (préfixe littéral le plus long ; égalité → 1er dans l'ordre du tableau). */
function bestNonForbiddenMatch(v: string): CredentialPattern | null {
  let best: CredentialPattern | null = null;
  let bestScore = -1;
  for (const p of CREDENTIAL_PATTERNS) {
    if (p.category === 'forbidden') continue;
    if (!p.regex.test(v)) continue;
    const s = patternSpecificity(p.regex);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

/* Détecte le pattern correspondant à une valeur, null si inconnu. */
export function detectCredential(value: string): CredentialPattern | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  /* Test forbidden patterns en priorité absolue (full match) */
  for (const p of CREDENTIAL_PATTERNS.filter((p) => p.category === 'forbidden')) {
    if (p.regex.test(trimmed)) return p;
  }
  /* Full match (clé seule) — match le PLUS SPÉCIFIQUE, pas le 1er trouvé */
  const full = bestNonForbiddenMatch(trimmed);
  if (full) return full;
  /* Fallback : si Kevin colle multi-line / JSON / contexte, scan ligne par ligne
   * (permissif, fix Kevin v13.0.78 "il s'affole pas reconnu") */
  const lines = trimmed.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    const m = bestNonForbiddenMatch(line);
    if (m) return m;
  }
  return null;
}

/**
 * Détecte TOUTES les clés API dans un texte multi-credentials (scanne chaque ligne/segment).
 * Utile quand Kevin colle plusieurs clés d'un coup ou un fichier .env complet.
 * Returns: Array de {pattern, value} pour chaque match unique trouvé.
 */
export function detectAllCredentials(text: string): Array<{ pattern: CredentialPattern; value: string }> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const results: Array<{ pattern: CredentialPattern; value: string }> = [];
  const seen = new Set<string>();
  /* Split sur whitespace, virgules, point-virgules, retours ligne, =, : (formats .env / JSON) */
  const tokens = trimmed.split(/[\s,;=:"'`]+/).map((s) => s.trim()).filter(Boolean);
  /* Aussi tester le texte entier (full match) en premier */
  const fullMatch = detectCredential(trimmed);
  if (fullMatch) {
    results.push({ pattern: fullMatch, value: trimmed });
    seen.add(fullMatch.storageKey);
  }
  /* Puis chaque token — match le PLUS SPÉCIFIQUE (pas le 1er trouvé) */
  for (const token of tokens) {
    if (token.length < 10) continue; /* skip très courts (pas un vrai token) — réduit 16→10 pour téléphones */
    const p = bestNonForbiddenMatch(token);
    if (p && !seen.has(p.storageKey)) {
      results.push({ pattern: p, value: token });
      seen.add(p.storageKey);
    }
  }
  return results;
}
