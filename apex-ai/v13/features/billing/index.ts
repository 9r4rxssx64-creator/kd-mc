/**
 * APEX v13 — Feature Billing (Comptes & Factures)
 *
 * Port v12 vAccountsBilling : centre de gestion abonnements & dashboards billing.
 * - Liste des comptes Kevin connectés (services SaaS)
 * - Liens directs vers dashboard billing (Anthropic, OpenAI, Stripe, Cloudflare, etc.)
 * - Statut crédit/quota live (lecture seule)
 * - Bouton "Recharger" 1-clic
 *
 * Anti-patterns évités :
 * - Pas de stockage de credentials ici (lecture seule depuis vault)
 * - Liens vérifiés (whitelist domaines officiels)
 * - escapeHtml partout
 */

import { escapeHtml } from '../../core/escape-html.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';

/* Re-export escapeHtml for backward compatibility (tests import from this module). */
export { escapeHtml };

export interface BillingService {
  id: string;
  name: string;
  emoji: string;
  category: 'ai' | 'saas' | 'comms' | 'infra' | 'finance' | 'other';
  dashboard_url: string;
  billing_url: string;
  docs_url?: string | undefined;
  status_url?: string | undefined;
  has_credit_api: boolean;
}

/**
 * Liste centrale des services Kevin avec liens directs vérifiés.
 * Source autoritaire — sentinelle link-validation-watch valide quotidiennement.
 */
export const BILLING_SERVICES: readonly BillingService[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    emoji: '🧠',
    category: 'ai',
    dashboard_url: 'https://console.anthropic.com',
    billing_url: 'https://console.anthropic.com/settings/billing',
    docs_url: 'https://docs.anthropic.com',
    status_url: 'https://status.anthropic.com',
    has_credit_api: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    emoji: '🤖',
    category: 'ai',
    dashboard_url: 'https://platform.openai.com',
    billing_url: 'https://platform.openai.com/account/billing',
    docs_url: 'https://platform.openai.com/docs',
    status_url: 'https://status.openai.com',
    has_credit_api: true,
  },
  {
    id: 'google_ai',
    name: 'Google AI Studio',
    emoji: '✨',
    category: 'ai',
    dashboard_url: 'https://aistudio.google.com',
    billing_url: 'https://aistudio.google.com/apikey',
    docs_url: 'https://ai.google.dev/docs',
    has_credit_api: false,
  },
  {
    id: 'groq',
    name: 'Groq',
    emoji: '⚡',
    category: 'ai',
    dashboard_url: 'https://console.groq.com',
    billing_url: 'https://console.groq.com/settings/billing',
    docs_url: 'https://console.groq.com/docs',
    has_credit_api: false,
  },
  {
    id: 'stripe',
    name: 'Stripe',
    emoji: '💳',
    category: 'finance',
    dashboard_url: 'https://dashboard.stripe.com',
    billing_url: 'https://dashboard.stripe.com/billing',
    docs_url: 'https://stripe.com/docs',
    status_url: 'https://status.stripe.com',
    has_credit_api: false,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    emoji: '☁️',
    category: 'infra',
    dashboard_url: 'https://dash.cloudflare.com',
    billing_url: 'https://dash.cloudflare.com/billing',
    docs_url: 'https://developers.cloudflare.com',
    status_url: 'https://www.cloudflarestatus.com',
    has_credit_api: false,
  },
  {
    id: 'github',
    name: 'GitHub',
    emoji: '📦',
    category: 'infra',
    dashboard_url: 'https://github.com',
    billing_url: 'https://github.com/settings/billing',
    docs_url: 'https://docs.github.com',
    status_url: 'https://www.githubstatus.com',
    has_credit_api: false,
  },
  {
    id: 'firebase',
    name: 'Firebase',
    emoji: '🔥',
    category: 'infra',
    dashboard_url: 'https://console.firebase.google.com',
    billing_url: 'https://console.cloud.google.com/billing',
    docs_url: 'https://firebase.google.com/docs',
    status_url: 'https://status.firebase.google.com',
    has_credit_api: false,
  },
  {
    id: 'resend',
    name: 'Resend',
    emoji: '📧',
    category: 'comms',
    dashboard_url: 'https://resend.com',
    billing_url: 'https://resend.com/settings/billing',
    docs_url: 'https://resend.com/docs',
    has_credit_api: false,
  },
  {
    id: 'twilio',
    name: 'Twilio',
    emoji: '📱',
    category: 'comms',
    dashboard_url: 'https://console.twilio.com',
    billing_url: 'https://console.twilio.com/billing',
    docs_url: 'https://www.twilio.com/docs',
    status_url: 'https://status.twilio.com',
    has_credit_api: false,
  },
  {
    id: 'brevo',
    name: 'Brevo (ex Sendinblue)',
    emoji: '📨',
    category: 'comms',
    dashboard_url: 'https://app.brevo.com',
    billing_url: 'https://app.brevo.com/billing',
    docs_url: 'https://developers.brevo.com',
    has_credit_api: false,
  },
  {
    id: 'vercel',
    name: 'Vercel',
    emoji: '▲',
    category: 'infra',
    dashboard_url: 'https://vercel.com/dashboard',
    billing_url: 'https://vercel.com/account/billing',
    docs_url: 'https://vercel.com/docs',
    status_url: 'https://www.vercel-status.com',
    has_credit_api: false,
  },
] as const;

const CATEGORY_LABELS: Record<BillingService['category'], string> = {
  ai: '🧠 Intelligence Artificielle',
  saas: '💼 SaaS',
  comms: '✉️ Communications',
  infra: '☁️ Infrastructure',
  finance: '💳 Finance',
  other: '🔧 Autres',
};

class BillingHub {
  list(): readonly BillingService[] {
    return BILLING_SERVICES;
  }

  byId(id: string): BillingService | undefined {
    return BILLING_SERVICES.find((s) => s.id === id);
  }

  byCategory(cat: BillingService['category']): readonly BillingService[] {
    return BILLING_SERVICES.filter((s) => s.category === cat);
  }

  groupByCategory(): Record<BillingService['category'], readonly BillingService[]> {
    const groups: Record<BillingService['category'], BillingService[]> = {
      ai: [],
      saas: [],
      comms: [],
      infra: [],
      finance: [],
      other: [],
    };
    for (const s of BILLING_SERVICES) {
      groups[s.category].push(s);
    }
    return groups;
  }

  getStats(): { total: number; with_credit_api: number; categories: number } {
    return {
      total: BILLING_SERVICES.length,
      with_credit_api: BILLING_SERVICES.filter((s) => s.has_credit_api).length,
      categories: new Set(BILLING_SERVICES.map((s) => s.category)).size,
    };
  }

  /**
   * Validate URL is HTTPS + matches whitelist of trusted domains.
   * Used by sentinelle link-validation-watch.
   */
  isValidUrl(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return false;
      const trusted = [
        'anthropic.com', 'openai.com', 'google.com', 'groq.com',
        'stripe.com', 'cloudflare.com', 'github.com', 'firebase.google.com',
        'resend.com', 'twilio.com', 'brevo.com', 'vercel.com',
        'aistudio.google.com', 'cloudflarestatus.com', 'githubstatus.com',
        'cloud.google.com', 'sendinblue.com', 'vercel-status.com',
      ];
      return trusted.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
    } catch {
      return false;
    }
  }
}

export const billingHub = new BillingHub();

export function render(rootEl: HTMLElement): void {
  const isAdmin = (store.get('isAdmin') as boolean | undefined) ?? false;
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('module.billing', rootEl, uid)) return;
  const groups = billingHub.groupByCategory();
  const stats = billingHub.getStats();

  const categoriesHtml = (Object.keys(groups) as Array<BillingService['category']>)
    .filter((cat) => groups[cat].length > 0)
    .map((cat) => {
      const cards = groups[cat].map((s) => `
        <article class="ax-billing-card ax-gs-338" data-service-id="${escapeHtml(s.id)}">
          <header class="ax-gs-214">
            <strong class="ax-gs-266">${s.emoji} ${escapeHtml(s.name)}</strong>
            ${s.has_credit_api ? '<span class="ax-badge" style="background:rgba(34,204,119,0.15);color:#22cc77;padding:2px 6px;border-radius:4px;font-size:11px">crédit API</span>' : ''}
          </header>
          <div class="ax-gs-7">
            <a href="${escapeHtml(s.dashboard_url)}" target="_blank" rel="noopener noreferrer" class="ax-btn ax-btn-primary ax-gs-339">Dashboard</a>
            <a href="${escapeHtml(s.billing_url)}" target="_blank" rel="noopener noreferrer" class="ax-btn ax-btn-secondary ax-gs-215">💳 Recharger</a>
            ${s.docs_url ? `<a href="${escapeHtml(s.docs_url)}" target="_blank" rel="noopener noreferrer" class="ax-btn ax-gs-215">📚 Docs</a>` : ''}
            ${s.status_url ? `<a href="${escapeHtml(s.status_url)}" target="_blank" rel="noopener noreferrer" class="ax-btn ax-gs-215">📡 Statut</a>` : ''}
          </div>
        </article>
      `).join('');
      return `
        <section class="ax-gs-181">
          <h2 style="color:#c9a227;font-size:15px;margin:8px 0">${CATEGORY_LABELS[cat]}</h2>
          ${cards}
        </section>
      `;
    }).join('');

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">💳 Comptes & Factures</h1>
        ${isAdmin ? '<span style="color:#c9a227;font-size:11px">👑 admin</span>' : ''}
      </header>
      <p class="ax-gs-334">
        ${stats.total} services · ${stats.categories} catégories · ${stats.with_credit_api} avec crédit API live
      </p>
      ${categoriesHtml}

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;
  logger.info('billing', 'view rendered', { total: stats.total });
}
