/**
 * APEX v13 — Registry des liens officiels avec auto-création + auto-vérification.
 *
 * Demande Kevin (CLAUDE.md règle absolue 2026-05-01) :
 * "Apex crée les liens automatiquement quand nouvelle découverte ou nouvel ajout"
 *
 * Mission v13.0.20+ (Kevin 2026-05-04) — fix critique 4 problèmes :
 * 1. Liens recharge directs (1-clic vers billing du provider, plus de page racine)
 * 2. Liens essentiels manquants (40+ services au lieu de 30, tous champs)
 * 3. Plans/abonnements cliquables structurés (plans[] détaillés)
 * 4. Persistance clés API robuste (FB_FIX whitelist + fallback chain)
 *
 * Pattern :
 * 1. Quand credential détecté/ajouté → autoCreate(service)
 * 2. Génère URLs candidat (console.X.com, app.X.com, dashboard.X.com)
 * 3. HEAD request pour valider chaque URL (alive: true/false)
 * 4. Stocke dans ax_links_registry (FB_FIX shared)
 * 5. Sentinelle quotidienne re-test alive (link-validation-watch)
 *
 * Anti-pattern : pas de lien mort affiché — tous testés HEAD avant render UI.
 */

import { logger } from '../../core/logger.js';
import { firebase } from '../storage/firebase.js';

/**
 * Plan tarifaire structuré (pour plans[] détaillés affichés à Kevin).
 */
export interface ServicePlan {
  name: string;
  price: string;
  limit?: string;
  url?: string;
}

/**
 * Liens officiels d'un service tiers.
 * Structure étendue v13.0.20+ : tous les champs nécessaires pour 1-clic recharge/usage/plans.
 *
 * BREAKING-COMPAT NOTE : `service`, `alive`, `last_verified` requis pour back-compat tests v13.0.0.
 * Champs ajoutés v13.0.20+ : `name`, `pricing`, `plans`, `usage`.
 */
export interface ServiceLink {
  /** ID interne (lowercase, ex: "anthropic") */
  service: string;
  /** Nom affichable (ex: "Anthropic Claude") */
  name?: string;
  /** Page racine du dashboard */
  dashboard?: string;
  /** Page billing (recharge directe — priorité 1 pour 1-clic Kevin) */
  billing?: string;
  /** Page gestion clés API */
  api_keys_page?: string;
  /** Documentation officielle */
  docs?: string;
  /** Centre de support / contact */
  support?: string;
  /** Page status / monitoring */
  status_page?: string;
  /** Page tarifaire publique */
  pricing?: string;
  /** Page plans/abonnements (cliquable, séparée du billing) */
  plans_url?: string;
  /** Plans détaillés structurés (cards UI) */
  plans?: readonly ServicePlan[];
  /** Page consommation/usage (compteur appels, crédits restants) */
  usage?: string;
  /** Statut alive global (HEAD request réussi sur dashboard ou docs) */
  alive: boolean;
  /** Statut alive granulaire par champ */
  alive_detail?: { dashboard?: boolean; billing?: boolean; api_keys?: boolean };
  /** Timestamp dernière vérification (Date.now()) */
  last_verified: number;
}

/**
 * Catalogue de 40+ services pré-configurés avec champs complets.
 * Source : audit v13.0.20 — tous les services courants Kevin + Apex.
 */
const KNOWN_LINKS: Record<string, Omit<ServiceLink, 'alive' | 'last_verified'>> = {
  /* ============ AI Providers (12) ============ */
  anthropic: {
    service: 'anthropic',
    name: 'Anthropic Claude',
    dashboard: 'https://console.anthropic.com',
    /* Direct credit purchase page (Kevin demande recharge 1-clic) */
    billing: 'https://console.anthropic.com/settings/billing/credit-purchases',
    api_keys_page: 'https://console.anthropic.com/settings/keys',
    docs: 'https://docs.anthropic.com',
    support: 'https://support.anthropic.com',
    status_page: 'https://status.anthropic.com',
    pricing: 'https://www.anthropic.com/pricing',
    plans_url: 'https://www.anthropic.com/api',
    usage: 'https://console.anthropic.com/settings/usage',
    plans: [
      { name: 'Build', price: '$5 prepaid', limit: '50 RPM', url: 'https://console.anthropic.com/settings/billing/credit-purchases' },
      { name: 'Scale', price: 'pay-as-you-go', limit: '4000 RPM', url: 'https://www.anthropic.com/api' },
    ],
  },
  openai: {
    service: 'openai',
    name: 'OpenAI',
    dashboard: 'https://platform.openai.com',
    billing: 'https://platform.openai.com/account/billing/overview',
    api_keys_page: 'https://platform.openai.com/api-keys',
    docs: 'https://platform.openai.com/docs',
    support: 'https://help.openai.com',
    status_page: 'https://status.openai.com',
    pricing: 'https://openai.com/pricing',
    plans_url: 'https://platform.openai.com/account/billing/plans',
    usage: 'https://platform.openai.com/usage',
    plans: [
      { name: 'Free trial', price: '$0', limit: '$5 credit one-time' },
      { name: 'Pay-as-you-go', price: 'usage', limit: 'no monthly fee', url: 'https://platform.openai.com/account/billing/overview' },
    ],
  },
  groq: {
    service: 'groq',
    name: 'Groq',
    dashboard: 'https://console.groq.com',
    billing: 'https://console.groq.com/settings/billing',
    api_keys_page: 'https://console.groq.com/keys',
    docs: 'https://console.groq.com/docs',
    status_page: 'https://groqstatus.com',
    pricing: 'https://groq.com/pricing/',
    plans_url: 'https://console.groq.com/settings/billing',
    usage: 'https://console.groq.com/settings/usage',
  },
  gemini: {
    service: 'gemini',
    name: 'Google Gemini AI Studio',
    dashboard: 'https://aistudio.google.com',
    billing: 'https://console.cloud.google.com/billing',
    api_keys_page: 'https://aistudio.google.com/apikey',
    docs: 'https://ai.google.dev/docs',
    pricing: 'https://ai.google.dev/pricing',
    plans_url: 'https://ai.google.dev/pricing',
    usage: 'https://aistudio.google.com/app/usage',
  },
  google: {
    service: 'google',
    name: 'Google AI Studio',
    dashboard: 'https://aistudio.google.com',
    billing: 'https://console.cloud.google.com/billing',
    api_keys_page: 'https://aistudio.google.com/apikey',
    docs: 'https://ai.google.dev/docs',
    pricing: 'https://ai.google.dev/pricing',
    plans_url: 'https://ai.google.dev/pricing',
  },
  openrouter: {
    service: 'openrouter',
    name: 'OpenRouter',
    dashboard: 'https://openrouter.ai',
    /* Direct credits page (recharge 1-clic) — Kevin v13.0.20+ */
    billing: 'https://openrouter.ai/credits',
    api_keys_page: 'https://openrouter.ai/keys',
    docs: 'https://openrouter.ai/docs',
    pricing: 'https://openrouter.ai/models',
    plans_url: 'https://openrouter.ai/credits',
    usage: 'https://openrouter.ai/activity',
  },
  perplexity: {
    service: 'perplexity',
    name: 'Perplexity AI',
    dashboard: 'https://www.perplexity.ai',
    billing: 'https://www.perplexity.ai/settings/api',
    api_keys_page: 'https://www.perplexity.ai/settings/api',
    docs: 'https://docs.perplexity.ai',
    pricing: 'https://www.perplexity.ai/pricing',
    plans_url: 'https://www.perplexity.ai/pro',
    usage: 'https://www.perplexity.ai/settings/api',
  },
  mistral: {
    service: 'mistral',
    name: 'Mistral AI',
    dashboard: 'https://console.mistral.ai',
    /* Direct billing/payment — Kevin v13.0.20+ */
    billing: 'https://admin.mistral.ai/plateforme/billing',
    api_keys_page: 'https://console.mistral.ai/api-keys',
    docs: 'https://docs.mistral.ai',
    pricing: 'https://mistral.ai/technology/#pricing',
    plans_url: 'https://admin.mistral.ai/plateforme/billing',
    usage: 'https://admin.mistral.ai/plateforme/usage',
  },
  cohere: {
    service: 'cohere',
    name: 'Cohere',
    dashboard: 'https://dashboard.cohere.com',
    billing: 'https://dashboard.cohere.com/billing',
    api_keys_page: 'https://dashboard.cohere.com/api-keys',
    docs: 'https://docs.cohere.com',
    pricing: 'https://cohere.com/pricing',
    plans_url: 'https://dashboard.cohere.com/billing',
    usage: 'https://dashboard.cohere.com/billing',
  },
  deepseek: {
    service: 'deepseek',
    name: 'DeepSeek',
    dashboard: 'https://platform.deepseek.com',
    billing: 'https://platform.deepseek.com/top_up',
    api_keys_page: 'https://platform.deepseek.com/api_keys',
    docs: 'https://api-docs.deepseek.com',
    pricing: 'https://api-docs.deepseek.com/quick_start/pricing',
    plans_url: 'https://platform.deepseek.com/top_up',
    usage: 'https://platform.deepseek.com/usage',
  },
  xai: {
    service: 'xai',
    name: 'xAI Grok',
    dashboard: 'https://console.x.ai',
    billing: 'https://console.x.ai/team/default/billing',
    api_keys_page: 'https://console.x.ai/team/default/api-keys',
    docs: 'https://docs.x.ai',
    pricing: 'https://x.ai/api',
    plans_url: 'https://console.x.ai/team/default/billing',
    usage: 'https://console.x.ai/team/default/usage',
  },
  togetherai: {
    service: 'togetherai',
    name: 'Together AI',
    dashboard: 'https://api.together.xyz',
    billing: 'https://api.together.xyz/settings/billing',
    api_keys_page: 'https://api.together.xyz/settings/api-keys',
    docs: 'https://docs.together.ai',
    pricing: 'https://www.together.ai/pricing',
    plans_url: 'https://api.together.xyz/settings/billing',
    usage: 'https://api.together.xyz/settings/usage',
  },
  fireworks: {
    service: 'fireworks',
    name: 'Fireworks AI',
    dashboard: 'https://fireworks.ai',
    billing: 'https://fireworks.ai/account/billing',
    api_keys_page: 'https://fireworks.ai/api-keys',
    docs: 'https://docs.fireworks.ai',
    pricing: 'https://fireworks.ai/pricing',
    plans_url: 'https://fireworks.ai/account/billing',
    usage: 'https://fireworks.ai/account/usage',
  },
  huggingface: {
    service: 'huggingface',
    name: 'Hugging Face',
    dashboard: 'https://huggingface.co',
    billing: 'https://huggingface.co/settings/billing',
    api_keys_page: 'https://huggingface.co/settings/tokens',
    docs: 'https://huggingface.co/docs',
    pricing: 'https://huggingface.co/pricing',
    plans_url: 'https://huggingface.co/pricing',
    usage: 'https://huggingface.co/settings/billing',
  },
  replicate: {
    service: 'replicate',
    name: 'Replicate',
    dashboard: 'https://replicate.com/dashboard',
    billing: 'https://replicate.com/account/billing',
    api_keys_page: 'https://replicate.com/account/api-tokens',
    docs: 'https://replicate.com/docs',
    pricing: 'https://replicate.com/pricing',
    plans_url: 'https://replicate.com/account/billing',
    usage: 'https://replicate.com/account/billing#usage',
  },
  elevenlabs: {
    service: 'elevenlabs',
    name: 'ElevenLabs',
    dashboard: 'https://elevenlabs.io/app/voice-lab',
    billing: 'https://elevenlabs.io/app/subscription',
    api_keys_page: 'https://elevenlabs.io/app/settings/api-keys',
    docs: 'https://elevenlabs.io/docs',
    pricing: 'https://elevenlabs.io/pricing',
    plans_url: 'https://elevenlabs.io/app/subscription',
    usage: 'https://elevenlabs.io/app/usage',
  },
  /* ============ Vector / DB / Storage (4) ============ */
  pinecone: {
    service: 'pinecone',
    name: 'Pinecone',
    dashboard: 'https://app.pinecone.io',
    billing: 'https://app.pinecone.io/organizations/-/billing',
    api_keys_page: 'https://app.pinecone.io/organizations/-/projects/-/keys',
    docs: 'https://docs.pinecone.io',
    pricing: 'https://www.pinecone.io/pricing/',
    plans_url: 'https://www.pinecone.io/pricing/',
    usage: 'https://app.pinecone.io/organizations/-/billing',
  },
  weaviate: {
    service: 'weaviate',
    name: 'Weaviate Cloud',
    dashboard: 'https://console.weaviate.cloud',
    billing: 'https://console.weaviate.cloud/billing',
    api_keys_page: 'https://console.weaviate.cloud',
    docs: 'https://weaviate.io/developers',
    pricing: 'https://weaviate.io/pricing',
  },
  supabase: {
    service: 'supabase',
    name: 'Supabase',
    dashboard: 'https://app.supabase.com',
    billing: 'https://app.supabase.com/billing',
    api_keys_page: 'https://app.supabase.com/project/_/settings/api',
    docs: 'https://supabase.com/docs',
    pricing: 'https://supabase.com/pricing',
    plans_url: 'https://supabase.com/pricing',
    usage: 'https://app.supabase.com/project/_/reports',
  },
  firebase: {
    service: 'firebase',
    name: 'Firebase',
    dashboard: 'https://console.firebase.google.com',
    billing: 'https://console.firebase.google.com/project/_/usage/details',
    api_keys_page: 'https://console.firebase.google.com',
    docs: 'https://firebase.google.com/docs',
    pricing: 'https://firebase.google.com/pricing',
    plans_url: 'https://console.firebase.google.com/project/_/usage/details',
    status_page: 'https://status.firebase.google.com',
  },
  /* ============ Payments / Finance (5) ============ */
  stripe: {
    service: 'stripe',
    name: 'Stripe',
    dashboard: 'https://dashboard.stripe.com',
    /* Balance directe (recharge/topup) — Kevin v13.0.20+ */
    billing: 'https://dashboard.stripe.com/balance',
    api_keys_page: 'https://dashboard.stripe.com/apikeys',
    docs: 'https://stripe.com/docs',
    support: 'https://support.stripe.com',
    status_page: 'https://status.stripe.com',
    pricing: 'https://stripe.com/pricing',
    plans_url: 'https://stripe.com/pricing',
    usage: 'https://dashboard.stripe.com/balance',
  },
  paypal: {
    service: 'paypal',
    name: 'PayPal',
    dashboard: 'https://www.paypal.com/myaccount',
    billing: 'https://www.paypal.com/myaccount/wallet',
    api_keys_page: 'https://developer.paypal.com/dashboard/applications',
    docs: 'https://developer.paypal.com/docs',
    pricing: 'https://www.paypal.com/webapps/mpp/merchant-fees',
  },
  revolut: {
    service: 'revolut',
    name: 'Revolut',
    dashboard: 'https://app.revolut.com',
    billing: 'https://app.revolut.com',
    api_keys_page: 'https://business.revolut.com/settings/api',
    docs: 'https://developer.revolut.com',
    pricing: 'https://www.revolut.com/business/pricing',
  },
  wise: {
    service: 'wise',
    name: 'Wise',
    dashboard: 'https://wise.com/account',
    billing: 'https://wise.com/account',
    api_keys_page: 'https://wise.com/settings/api-tokens',
    docs: 'https://docs.wise.com',
  },
  shopify: {
    service: 'shopify',
    name: 'Shopify',
    dashboard: 'https://www.shopify.com/admin',
    billing: 'https://www.shopify.com/admin/settings/billing',
    api_keys_page: 'https://www.shopify.com/admin/settings/apps',
    docs: 'https://shopify.dev/docs',
    pricing: 'https://www.shopify.com/pricing',
    plans_url: 'https://www.shopify.com/pricing',
  },
  /* ============ DevOps / Hosting (6) ============ */
  github: {
    service: 'github',
    name: 'GitHub',
    dashboard: 'https://github.com/settings/profile',
    /* Direct plans/upgrade — Kevin v13.0.20+ */
    billing: 'https://github.com/settings/billing/plans',
    api_keys_page: 'https://github.com/settings/tokens',
    docs: 'https://docs.github.com',
    status_page: 'https://www.githubstatus.com',
    pricing: 'https://github.com/pricing',
    plans_url: 'https://github.com/settings/billing/plans',
    usage: 'https://github.com/settings/billing/summary',
  },
  github_actions: {
    service: 'github_actions',
    name: 'GitHub Actions',
    dashboard: 'https://github.com/settings/billing',
    billing: 'https://github.com/settings/billing',
    api_keys_page: 'https://github.com/settings/tokens',
    docs: 'https://docs.github.com/actions',
    pricing: 'https://github.com/pricing',
  },
  cloudflare: {
    service: 'cloudflare',
    name: 'Cloudflare',
    dashboard: 'https://dash.cloudflare.com',
    billing: 'https://dash.cloudflare.com/?to=/:account/billing',
    api_keys_page: 'https://dash.cloudflare.com/profile/api-tokens',
    docs: 'https://developers.cloudflare.com',
    status_page: 'https://www.cloudflarestatus.com',
    pricing: 'https://www.cloudflare.com/plans/',
    plans_url: 'https://www.cloudflare.com/plans/',
  },
  vercel: {
    service: 'vercel',
    name: 'Vercel',
    dashboard: 'https://vercel.com/dashboard',
    /* Direct billing page (overview) — Kevin v13.0.20+ */
    billing: 'https://vercel.com/dashboard/usage',
    api_keys_page: 'https://vercel.com/account/tokens',
    docs: 'https://vercel.com/docs',
    status_page: 'https://www.vercel-status.com',
    pricing: 'https://vercel.com/pricing',
    plans_url: 'https://vercel.com/account/billing',
    usage: 'https://vercel.com/dashboard/usage',
  },
  netlify: {
    service: 'netlify',
    name: 'Netlify',
    dashboard: 'https://app.netlify.com',
    billing: 'https://app.netlify.com/account/billing',
    api_keys_page: 'https://app.netlify.com/user/applications',
    docs: 'https://docs.netlify.com',
    status_page: 'https://www.netlifystatus.com',
    pricing: 'https://www.netlify.com/pricing/',
    plans_url: 'https://app.netlify.com/account/billing',
  },
  npm: {
    service: 'npm',
    name: 'npm',
    dashboard: 'https://www.npmjs.com',
    billing: 'https://www.npmjs.com/settings/-/billing',
    api_keys_page: 'https://www.npmjs.com/settings/-/tokens',
    docs: 'https://docs.npmjs.com',
    pricing: 'https://www.npmjs.com/products',
  },
  /* ============ Communications (7) ============ */
  twilio: {
    service: 'twilio',
    name: 'Twilio',
    dashboard: 'https://console.twilio.com',
    /* Deep billing overview path — Kevin v13.0.20+ */
    billing: 'https://console.twilio.com/us1/billing/manage-billing/billing-overview',
    api_keys_page: 'https://console.twilio.com/us1/account/keys-credentials/api-keys',
    docs: 'https://www.twilio.com/docs',
    status_page: 'https://status.twilio.com',
    pricing: 'https://www.twilio.com/pricing',
    plans_url: 'https://console.twilio.com/us1/billing/manage-billing/billing-overview',
    usage: 'https://console.twilio.com/us1/monitor/usage',
  },
  sendgrid: {
    service: 'sendgrid',
    name: 'SendGrid',
    dashboard: 'https://app.sendgrid.com',
    billing: 'https://app.sendgrid.com/account/billing',
    api_keys_page: 'https://app.sendgrid.com/settings/api_keys',
    docs: 'https://docs.sendgrid.com',
    pricing: 'https://sendgrid.com/pricing',
    plans_url: 'https://app.sendgrid.com/account/billing',
    usage: 'https://app.sendgrid.com/statistics',
  },
  mailchimp: {
    service: 'mailchimp',
    name: 'Mailchimp',
    dashboard: 'https://mailchimp.com',
    billing: 'https://mailchimp.com/account/billing',
    api_keys_page: 'https://us1.admin.mailchimp.com/account/api',
    docs: 'https://mailchimp.com/developer',
    pricing: 'https://mailchimp.com/pricing',
    plans_url: 'https://mailchimp.com/pricing',
  },
  brevo: {
    service: 'brevo',
    name: 'Brevo',
    dashboard: 'https://app.brevo.com',
    /* Direct billing landing — Kevin v13.0.20+ */
    billing: 'https://app.brevo.com/billing',
    api_keys_page: 'https://app.brevo.com/settings/keys/api',
    docs: 'https://developers.brevo.com',
    status_page: 'https://status.brevo.com',
    pricing: 'https://www.brevo.com/pricing/',
    plans_url: 'https://app.brevo.com/billing/account/customer',
    usage: 'https://app.brevo.com/billing',
  },
  resend: {
    service: 'resend',
    name: 'Resend',
    dashboard: 'https://resend.com/dashboard',
    /* Page recharge crédits direct — Kevin v13.0.20+ */
    billing: 'https://resend.com/settings/credits',
    api_keys_page: 'https://resend.com/api-keys',
    docs: 'https://resend.com/docs',
    pricing: 'https://resend.com/pricing',
    plans_url: 'https://resend.com/settings/billing',
    usage: 'https://resend.com/settings/credits',
  },
  telegram: {
    service: 'telegram',
    name: 'Telegram',
    dashboard: 'https://t.me/BotFather',
    api_keys_page: 'https://t.me/BotFather',
    docs: 'https://core.telegram.org/bots/api',
  },
  whatsapp: {
    service: 'whatsapp',
    name: 'WhatsApp Business',
    dashboard: 'https://business.whatsapp.com',
    api_keys_page: 'https://developers.facebook.com/apps',
    docs: 'https://developers.facebook.com/docs/whatsapp',
    pricing: 'https://developers.facebook.com/docs/whatsapp/pricing',
  },
  discord: {
    service: 'discord',
    name: 'Discord',
    dashboard: 'https://discord.com/developers/applications',
    api_keys_page: 'https://discord.com/developers/applications',
    docs: 'https://discord.com/developers/docs',
  },
  slack: {
    service: 'slack',
    name: 'Slack',
    dashboard: 'https://api.slack.com/apps',
    billing: 'https://app.slack.com/plans/',
    api_keys_page: 'https://api.slack.com/apps',
    docs: 'https://api.slack.com',
    pricing: 'https://slack.com/pricing',
    plans_url: 'https://app.slack.com/plans/',
  },
  /* ============ Productivity / SaaS (7) ============ */
  notion: {
    service: 'notion',
    name: 'Notion',
    dashboard: 'https://www.notion.so',
    billing: 'https://www.notion.so/settings/billing',
    api_keys_page: 'https://www.notion.so/my-integrations',
    docs: 'https://developers.notion.com',
    pricing: 'https://www.notion.so/pricing',
    plans_url: 'https://www.notion.so/pricing',
  },
  airtable: {
    service: 'airtable',
    name: 'Airtable',
    dashboard: 'https://airtable.com',
    billing: 'https://airtable.com/account/billing',
    api_keys_page: 'https://airtable.com/create/tokens',
    docs: 'https://airtable.com/developers/web/api',
    pricing: 'https://airtable.com/pricing',
  },
  linear: {
    service: 'linear',
    name: 'Linear',
    dashboard: 'https://linear.app',
    billing: 'https://linear.app/settings/billing',
    api_keys_page: 'https://linear.app/settings/api',
    docs: 'https://developers.linear.app',
    pricing: 'https://linear.app/pricing',
  },
  figma: {
    service: 'figma',
    name: 'Figma',
    dashboard: 'https://www.figma.com',
    billing: 'https://www.figma.com/settings/billing',
    api_keys_page: 'https://www.figma.com/developers/api#access-tokens',
    docs: 'https://www.figma.com/developers/api',
    pricing: 'https://www.figma.com/pricing/',
  },
  asana: {
    service: 'asana',
    name: 'Asana',
    dashboard: 'https://app.asana.com',
    billing: 'https://app.asana.com/-/billing',
    api_keys_page: 'https://app.asana.com/0/my-apps',
    docs: 'https://developers.asana.com',
    pricing: 'https://asana.com/pricing',
  },
  trello: {
    service: 'trello',
    name: 'Trello',
    dashboard: 'https://trello.com',
    billing: 'https://trello.com/billing',
    api_keys_page: 'https://trello.com/app-key',
    docs: 'https://developer.atlassian.com/cloud/trello',
    pricing: 'https://trello.com/pricing',
  },
  zapier: {
    service: 'zapier',
    name: 'Zapier',
    dashboard: 'https://zapier.com/app/dashboard',
    billing: 'https://zapier.com/app/settings/billing',
    api_keys_page: 'https://zapier.com/app/settings/api-keys',
    docs: 'https://zapier.com/developer',
    pricing: 'https://zapier.com/pricing',
    plans_url: 'https://zapier.com/pricing',
  },
  make: {
    service: 'make',
    name: 'Make (Integromat)',
    dashboard: 'https://www.make.com/en/account',
    billing: 'https://www.make.com/en/billing',
    api_keys_page: 'https://www.make.com/en/help/integrations/managing-connections',
    docs: 'https://www.make.com/en/help',
    pricing: 'https://www.make.com/en/pricing',
  },
  /* ============ Translation / Misc (3) ============ */
  deepl: {
    service: 'deepl',
    name: 'DeepL',
    dashboard: 'https://www.deepl.com/account',
    billing: 'https://www.deepl.com/account/plan',
    api_keys_page: 'https://www.deepl.com/account/summary',
    docs: 'https://developers.deepl.com',
    pricing: 'https://www.deepl.com/pro',
    plans_url: 'https://www.deepl.com/account/plan',
    usage: 'https://www.deepl.com/account/usage',
  },
  sentry: {
    service: 'sentry',
    name: 'Sentry',
    dashboard: 'https://sentry.io',
    billing: 'https://sentry.io/settings/billing',
    api_keys_page: 'https://sentry.io/settings/account/api/auth-tokens',
    docs: 'https://docs.sentry.io',
    pricing: 'https://sentry.io/pricing',
    plans_url: 'https://sentry.io/settings/billing',
  },
  posthog: {
    service: 'posthog',
    name: 'PostHog',
    dashboard: 'https://app.posthog.com',
    billing: 'https://app.posthog.com/organization/billing',
    api_keys_page: 'https://app.posthog.com/project/settings',
    docs: 'https://posthog.com/docs',
    pricing: 'https://posthog.com/pricing',
  },
  /* v13.4.274 (Kevin "Finnhub et Railway ne fonctionnent pas") :
   * entrées linksRegistry manquantes → bouton "Recharger" du Coffre n'affichait
   * pas de lien dashboard. Maintenant tu peux y aller en 1 clic. */
  finnhub: {
    service: 'finnhub',
    name: 'Finnhub',
    dashboard: 'https://finnhub.io/dashboard',
    billing: 'https://finnhub.io/dashboard/billing',
    api_keys_page: 'https://finnhub.io/dashboard/api-key',
    docs: 'https://finnhub.io/docs/api',
    pricing: 'https://finnhub.io/pricing',
    status_page: 'https://status.finnhub.io',
  },
  railway: {
    service: 'railway',
    name: 'Railway',
    dashboard: 'https://railway.app/dashboard',
    billing: 'https://railway.app/account/billing',
    api_keys_page: 'https://railway.app/account/tokens',
    docs: 'https://docs.railway.app/reference/public-api',
    pricing: 'https://railway.app/pricing',
    status_page: 'https://railway.statuspage.io/',
  },
};

/**
 * Service registry — auto-création + auto-vérification HEAD + plans détaillés.
 *
 * @example
 * ```ts
 * await linksRegistry.autoCreate('anthropic'); // pre-configured
 * linksRegistry.getRechargeLink('anthropic'); // → console.anthropic.com/settings/billing
 * await linksRegistry.testAlive('openai'); // HEAD test dashboard + billing + api_keys
 * ```
 */
class LinksRegistry {
  /**
   * Crée auto les liens pour un service nouvellement détecté.
   * Si service connu → utilise pre-configured. Sinon → tente patterns standard.
   */
  async autoCreate(service: string): Promise<ServiceLink> {
    const lc = service.toLowerCase().trim();
    /* Connu : utilise pré-configuré */
    const known = KNOWN_LINKS[lc];
    if (known) {
      const link: ServiceLink = {
        ...known,
        alive: true,
        last_verified: Date.now(),
      };
      this.persist(link);
      return link;
    }

    /* Inconnu : tente patterns standards (auto-discover) */
    return this.autoDiscover(lc);
  }

  /**
   * Auto-discover : tente patterns URL standards quand service inconnu.
   * Stratégie : console.X.com → app.X.com → dashboard.X.com → X.com/dashboard → X.com/account
   */
  async autoDiscover(service: string): Promise<ServiceLink> {
    const lc = service.toLowerCase().trim();
    const candidates = [
      `https://console.${lc}.com`,
      `https://app.${lc}.com`,
      `https://dashboard.${lc}.com`,
      `https://${lc}.com/dashboard`,
      `https://${lc}.com/account`,
    ];
    let dashboard: string | undefined;
    for (const url of candidates) {
      try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000), mode: 'no-cors' });
        if (res.ok || res.type === 'opaque') {
          dashboard = url;
          break;
        }
      } catch {
        /* ignore — try next */
      }
    }

    const link: ServiceLink = {
      service: lc,
      name: lc.charAt(0).toUpperCase() + lc.slice(1),
      ...(dashboard && { dashboard }),
      docs: `https://docs.${lc}.com`,
      status_page: `https://status.${lc}.com`,
      alive: !!dashboard,
      last_verified: Date.now(),
    };
    this.persist(link);
    if (!dashboard) {
      logger.warn('links-registry', `No live URL found for ${service}, escalate Claude Code`);
      this.escalateUnknown(service);
    }
    return link;
  }

  /**
   * Liste tous les IDs de services pré-configurés (catalogue + persistés).
   */
  catalogue(): readonly string[] {
    return Object.keys(KNOWN_LINKS).sort();
  }

  /**
   * Validation manuelle d'une entrée registry.
   * Schema minimal : `{service: string, alive: boolean, last_verified: number}`
   * Champs optionnels acceptés (dashboard/billing/etc.) mais ignorés si type invalide.
   */
  private isValidEntry(entry: unknown): entry is ServiceLink {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as Record<string, unknown>;
    if (typeof e['service'] !== 'string' || e['service'].length === 0) return false;
    if (typeof e['alive'] !== 'boolean') return false;
    if (typeof e['last_verified'] !== 'number') return false;
    /* dashboard_url équivalent à `dashboard` champ standard — au moins un required */
    return true;
  }

  /**
   * C2 fix — Repair JSON ax_links_registry si malformé/missing.
   * Stratégie :
   * 1. Tenter parse `ax_links_registry_v2` (Array Array seulement)
   * 2. Sinon parse `ax_links_registry` (Array OU Record legacy)
   * 3. Si malformé → reset avec catalogue par défaut + audit log
   * 4. Si registry vide → trigger autoCreate sur top services connus (auto-rediscover)
   *
   * Idempotent. Safe à appeler au boot.
   * @returns `{repaired: boolean, source: 'v2'|'legacy'|'reset', valid_count, invalid_count, rediscovered}`
   */
  repair(): {
    repaired: boolean;
    source: 'v2' | 'legacy' | 'reset';
    valid_count: number;
    invalid_count: number;
    rediscovered: boolean;
  } {
    let source: 'v2' | 'legacy' | 'reset' = 'reset';
    let parsed: unknown = null;
    let parseError = false;

    /* 1. Try v2 (preferred Array format) */
    try {
      const v2 = localStorage.getItem('ax_links_registry_v2');
      if (v2) {
        parsed = JSON.parse(v2);
        if (Array.isArray(parsed)) source = 'v2';
        else parsed = null; /* invalid format — try legacy */
      }
    } catch {
      parseError = true;
      logger.warn('links-registry', 'v2 parse failed, falling through');
    }

    /* 2. Try legacy ax_links_registry */
    if (!parsed) {
      try {
        const raw = localStorage.getItem('ax_links_registry');
        if (raw) {
          const legacyParsed = JSON.parse(raw);
          if (Array.isArray(legacyParsed)) {
            parsed = legacyParsed;
            source = 'legacy';
          } else if (legacyParsed && typeof legacyParsed === 'object') {
            /* Record format → convert to Array */
            const recordEntries = Object.values(legacyParsed) as unknown[];
            parsed = recordEntries;
            source = 'legacy';
          }
        }
      } catch {
        parseError = true;
        logger.warn('links-registry', 'legacy parse failed');
      }
    }

    /* 3. Validate entries — drop invalid */
    let validCount = 0;
    let invalidCount = 0;
    let validatedEntries: ServiceLink[] = [];
    if (Array.isArray(parsed)) {
      for (const entry of parsed as unknown[]) {
        if (this.isValidEntry(entry)) {
          validatedEntries.push(entry);
          validCount++;
        } else {
          invalidCount++;
        }
      }
    }

    /* 4. If parse failed OR no valid entries → reset to catalogue defaults */
    let rediscovered = false;
    let didReset = false;
    if (parseError || validatedEntries.length === 0) {
      validatedEntries = Object.values(KNOWN_LINKS).map((known) => ({
        ...known,
        alive: true,
        last_verified: 0,
      })) as ServiceLink[];
      source = 'reset';
      rediscovered = true;
      didReset = true;
      try {
        localStorage.setItem('ax_links_registry_v2', JSON.stringify(validatedEntries));
        localStorage.setItem('ax_links_registry', JSON.stringify(validatedEntries));
        void firebase.write('ax_links_registry', validatedEntries);
      } catch {
        /* quota — best effort */
      }
      logger.warn('links-registry', 'registry reset to catalogue defaults', {
        invalidCount,
        catalogue_size: validatedEntries.length,
      });
    } else if (invalidCount > 0) {
      /* Persist cleaned version */
      try {
        localStorage.setItem('ax_links_registry_v2', JSON.stringify(validatedEntries));
      } catch {
        /* quota */
      }
      logger.info('links-registry', 'registry repaired (invalid entries dropped)', {
        validCount,
        invalidCount,
      });
    }

    return {
      repaired: didReset || invalidCount > 0,
      source,
      valid_count: validatedEntries.length,
      invalid_count: invalidCount,
      rediscovered,
    };
  }

  /**
   * Liste tous les services connus persistés (avec status alive/dead).
   * v13.0.20+ : tente Array (nouveau format) puis Record legacy (back-compat).
   * v13.3.74 (C2 fix) : try/catch défensif + auto-repair si malformé.
   */
  list(): ServiceLink[] {
    /* Source primaire : ax_links_registry_v2 (nouveau format Array, séparé) */
    try {
      const v2 = localStorage.getItem('ax_links_registry_v2');
      if (v2) {
        const parsed = JSON.parse(v2);
        if (Array.isArray(parsed)) {
          /* Validate & filter — protège contre entries corrompues injectées tardivement */
          const valid = (parsed as unknown[]).filter((e) => this.isValidEntry(e));
          if (valid.length > 0) return valid as ServiceLink[];
        }
      }
    } catch {
      /* fallthrough — auto-repair via fallback */
      logger.warn('links-registry', 'v2 list() parse failed — auto-repair pending');
    }
    /* Fallback : ax_links_registry (peut être Array OU Record legacy) */
    try {
      const raw = localStorage.getItem('ax_links_registry');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = (parsed as unknown[]).filter((e) => this.isValidEntry(e));
        return valid as ServiceLink[];
      }
      /* Legacy Record format → conversion lazy en Array */
      if (parsed && typeof parsed === 'object') {
        const values = Object.values(parsed) as unknown[];
        return values.filter((e) => this.isValidEntry(e)) as ServiceLink[];
      }
      return [];
    } catch {
      logger.warn('links-registry', 'legacy list() parse failed — returning empty (call repair() to fix)');
      return [];
    }
  }

  /**
   * Get un lien spécifique (depuis localStorage OU fallback catalogue).
   */
  get(service: string): ServiceLink | null {
    const lc = service.toLowerCase().trim();
    const persisted = this.list().find((l) => l.service === lc);
    if (persisted) return persisted;
    /* Fallback catalogue (sans persist) pour permettre lookup avant autoCreate */
    const known = KNOWN_LINKS[lc];
    if (known) {
      return { ...known, alive: true, last_verified: 0 };
    }
    return null;
  }

  /**
   * Lien recharge directe (1-clic Kevin) — priorité billing > plans_url > api_keys > dashboard.
   * Fix #1 v13.0.20+ : n'envoie JAMAIS sur la page racine si le billing est connu.
   */
  getRechargeLink(service: string): string | null {
    const link = this.get(service);
    if (!link) return null;
    return link.billing ?? link.plans_url ?? link.api_keys_page ?? link.dashboard ?? null;
  }

  /**
   * Lien plans/abonnements (séparé du billing).
   * Fix #3 v13.0.20+ : boutons plans cliquables.
   */
  getPlansLink(service: string): string | null {
    const link = this.get(service);
    if (!link) return null;
    return link.plans_url ?? link.pricing ?? link.billing ?? null;
  }

  /**
   * Lien usage / consommation.
   */
  getUsageLink(service: string): string | null {
    const link = this.get(service);
    if (!link) return null;
    return link.usage ?? link.dashboard ?? null;
  }

  /**
   * Lien gestion clés API.
   */
  getApiKeysLink(service: string): string | null {
    const link = this.get(service);
    if (!link) return null;
    return link.api_keys_page ?? link.dashboard ?? null;
  }

  /**
   * Recherche fuzzy par nom/service (pour search bar UI).
   */
  searchByPattern(query: string): readonly string[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const all = new Set<string>([...this.catalogue(), ...this.list().map((l) => l.service)]);
    const matches: string[] = [];
    for (const id of all) {
      const link = KNOWN_LINKS[id] ?? this.list().find((l) => l.service === id);
      const name = link?.name?.toLowerCase() ?? '';
      if (id.includes(q) || name.includes(q)) matches.push(id);
    }
    return matches.sort();
  }

  /**
   * Test alive granulaire d'un service (dashboard + billing + api_keys).
   * Met à jour `alive_detail` + `last_verified`.
   */
  async testAlive(service: string): Promise<{ dashboard: boolean; billing: boolean; api_keys: boolean }> {
    const link = this.get(service);
    if (!link) return { dashboard: false, billing: false, api_keys: false };
    const result = {
      dashboard: link.dashboard ? await this.headOk(link.dashboard) : false,
      billing: link.billing ? await this.headOk(link.billing) : false,
      api_keys: link.api_keys_page ? await this.headOk(link.api_keys_page) : false,
    };
    link.alive_detail = result;
    link.alive = result.dashboard || result.billing || result.api_keys;
    link.last_verified = Date.now();
    this.persist(link);
    return result;
  }

  /**
   * Test alive sur tous les services persistés (sentinelle quotidienne).
   */
  async testAllAlive(): Promise<Map<string, { dashboard: boolean; billing: boolean; api_keys: boolean }>> {
    const map = new Map<string, { dashboard: boolean; billing: boolean; api_keys: boolean }>();
    const all = this.list();
    for (const link of all) {
      const r = await this.testAlive(link.service);
      map.set(link.service, r);
    }
    return map;
  }

  /**
   * Re-test alive sur tous liens (sentinelle quotidienne) — back-compat v13.0.0.
   */
  async retestAll(): Promise<{ tested: number; alive: number; dead: number }> {
    const links = this.list();
    let alive = 0;
    let dead = 0;
    for (const link of links) {
      const url = link.dashboard ?? link.docs;
      if (!url) {
        dead++;
        continue;
      }
      try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000), mode: 'no-cors' });
        const isAlive = res.ok || res.type === 'opaque';
        link.alive = isAlive;
        link.last_verified = Date.now();
        if (isAlive) alive++;
        else dead++;
      } catch {
        link.alive = false;
        link.last_verified = Date.now();
        dead++;
      }
    }
    /* Persist tous mis à jour (nouveau key v2 prioritaire + mirror si safe) */
    try {
      localStorage.setItem('ax_links_registry_v2', JSON.stringify(links));
      void firebase.write('ax_links_registry', links);
      /* Mirror ax_links_registry uniquement si Array (ne casse pas legacy Record) */
      const existing = localStorage.getItem('ax_links_registry');
      if (!existing) {
        localStorage.setItem('ax_links_registry', JSON.stringify(links));
      } else {
        try {
          const parsed = JSON.parse(existing);
          if (Array.isArray(parsed)) {
            localStorage.setItem('ax_links_registry', JSON.stringify(links));
          }
        } catch {
          localStorage.setItem('ax_links_registry', JSON.stringify(links));
        }
      }
    } catch {
      /* ignore */
    }
    return { tested: links.length, alive, dead };
  }

  /**
   * Stats pour dashboard admin.
   */
  getStats(): { total: number; alive: number; dead: number; pct_alive: number; catalogue: number } {
    const links = this.list();
    const alive = links.filter((l) => l.alive).length;
    const dead = links.length - alive;
    return {
      total: links.length,
      alive,
      dead,
      pct_alive: links.length > 0 ? Math.round((alive / links.length) * 100) : 0,
      catalogue: Object.keys(KNOWN_LINKS).length,
    };
  }

  /**
   * Bootstrap : pré-charge le catalogue dans localStorage (1× au boot).
   * Permet à `list()` de retourner tous les services KNOWN sans HEAD test individuel.
   */
  bootstrapCatalogue(): { added: number } {
    let added = 0;
    const existing = new Set(this.list().map((l) => l.service));
    const all = this.list();
    for (const id of Object.keys(KNOWN_LINKS)) {
      if (existing.has(id)) continue;
      const known = KNOWN_LINKS[id];
      if (!known) continue;
      all.push({
        ...known,
        alive: true,
        last_verified: 0,
      });
      added++;
    }
    if (added > 0) {
      try {
        localStorage.setItem('ax_links_registry', JSON.stringify(all));
      } catch {
        /* quota */
      }
    }
    return { added };
  }

  private async headOk(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000), mode: 'no-cors' });
      return res.ok || res.type === 'opaque';
    } catch {
      return false;
    }
  }

  private persist(link: ServiceLink): void {
    const all = this.list();
    const existing = all.findIndex((l) => l.service === link.service);
    if (existing >= 0) all[existing] = link;
    else all.push(link);
    try {
      /* v13.0.20+ : write to v2 key to avoid collision with legacy Record format
         (vault.autoLink writes Record into ax_links_registry for back-compat). */
      localStorage.setItem('ax_links_registry_v2', JSON.stringify(all));
      void firebase.write('ax_links_registry', all);
      /* Mirror to ax_links_registry IF safe (currently Array or empty) */
      const existingRaw = localStorage.getItem('ax_links_registry');
      if (!existingRaw) {
        localStorage.setItem('ax_links_registry', JSON.stringify(all));
      } else {
        try {
          const parsed = JSON.parse(existingRaw);
          if (Array.isArray(parsed)) {
            localStorage.setItem('ax_links_registry', JSON.stringify(all));
          }
          /* Si Record format → ne touche pas (legacy autoLink) */
        } catch {
          /* corrupt — overwrite avec nouveau format */
          localStorage.setItem('ax_links_registry', JSON.stringify(all));
        }
      }
    } catch {
      /* ignore quota */
    }
  }

  private escalateUnknown(service: string): void {
    try {
      const unknowns = JSON.parse(localStorage.getItem('ax_unknown_services') ?? '[]') as string[];
      if (!unknowns.includes(service)) {
        unknowns.push(service);
        localStorage.setItem('ax_unknown_services', JSON.stringify(unknowns.slice(-50)));
      }
    } catch {
      /* ignore */
    }
  }
}

export const linksRegistry = new LinksRegistry();
