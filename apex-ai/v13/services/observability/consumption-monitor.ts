/**
 * APEX v13 — Consumption Monitor (live + alertes 1 clic recharge).
 *
 * Demande Kevin 2026-05-04 :
 * "Info pour chaque IA conso token live compteur. Notif admin quand bientôt terminé
 *  pour chaque avec lien 1 clic pour chaque pour recharge. Pareil pour tous les abos."
 *
 * Architecture :
 * - Budgets/quotas configurables par service (localStorage `apex_v13_budgets`)
 * - Monitor consumption pct = (used / budget) × 100
 * - Seuils : ok (<70%) / warn (70-90%) / critical (>=90%)
 * - Push notif admin via push-notifications avec cta_url = billing direct
 * - Live counter pour vue UI dashboard
 * - Couvre IA + abonnements SaaS (Stripe, Brevo, Resend, GitHub, Cloudflare, etc.)
 *
 * Anti-pattern :
 * - Pas re-notifier toutes les 5 min (dedup 6h par seuil)
 * - Toujours fournir lien 1 clic recharge (règle Kevin RECONNAISSANCE LIENS AUTO)
 * - Permet override budget user (pas hardcodé)
 */

import { logger } from '../../core/logger.js';
import { linksRegistry } from '../integrations/links-registry.js';
import { pushNotifications } from '../integrations/push-notifications.js';

import { auditLog } from './audit-log.js';
import { tokensDashboard } from './tokens-dashboard.js';

export type ConsumptionSeverity = 'ok' | 'warn' | 'critical';

export interface ServiceBudget {
  service: string;
  budget_eur_month: number;
  used_eur_current_period: number;
  pct_used: number;
  severity: ConsumptionSeverity;
  reset_day: number; /* 1-28, jour du mois où compteur reset */
  last_alert_ts: number;
  billing_url: string;
}

/* Budgets par défaut (Kevin peut override via UI) */
const DEFAULT_BUDGETS_EUR: Record<string, number> = {
  anthropic: 50,
  openai: 30,
  groq: 10,
  gemini: 0, /* free tier */
  openrouter: 20,
  cohere: 10,
  mistral: 10,
  deepseek: 5,
  perplexity: 10,
  elevenlabs: 22,
  replicate: 10,
  stripe: 0, /* facturé sur usage, pas budget */
  brevo: 0, /* free tier */
  resend: 0, /* free tier 100/jour */
  github: 0, /* free tier */
  cloudflare: 0, /* free tier */
  twilio: 20,
  deepl: 20,
};

const DEDUP_ALERT_MS = 6 * 60 * 60 * 1000; /* 6h entre alertes même service */
const WARN_THRESHOLD = 70;
const CRITICAL_THRESHOLD = 90;

class ConsumptionMonitor {
  /**
   * Récupère/initialise budgets stockés.
   */
  getBudgets(): Record<string, number> {
    try {
      const stored = JSON.parse(localStorage.getItem('apex_v13_budgets') ?? '{}') as Record<string, number>;
      return { ...DEFAULT_BUDGETS_EUR, ...stored };
    } catch {
      return DEFAULT_BUDGETS_EUR;
    }
  }

  /**
   * Override budget user (UI dashboard).
   */
  setBudget(service: string, budgetEur: number): void {
    try {
      const stored = JSON.parse(localStorage.getItem('apex_v13_budgets') ?? '{}') as Record<string, number>;
      stored[service] = Math.max(0, budgetEur);
      localStorage.setItem('apex_v13_budgets', JSON.stringify(stored));
      void auditLog.record('consumption.budget_set', { details: { service, budget: budgetEur } });
    } catch (err: unknown) {
      logger.warn('consumption-monitor', 'setBudget failed', { err });
    }
  }

  /**
   * Calcule consumption actuelle pour un service.
   * Tokens IA : depuis tokens-dashboard. Autres SaaS : à enrichir si API expose.
   */
  getServiceUsage(service: string): { used_eur: number; details: Record<string, unknown> } {
    const lc = service.toLowerCase();
    /* Providers IA = depuis tokens-dashboard */
    const aiProviders = ['anthropic', 'openai', 'groq', 'gemini', 'openrouter', 'cohere', 'mistral', 'deepseek', 'perplexity'];
    if (aiProviders.includes(lc)) {
      const stats = tokensDashboard.getStats(lc);
      const total = stats.reduce((s, e) => s + e.cost_usd, 0);
      return {
        used_eur: total * 0.92, /* USD → EUR approx */
        details: { provider: lc, requests: stats.length, total_usd: total },
      };
    }
    /* Autres : lecture localStorage `ax_<service>_billing_used_eur` (peut être enrichi par future API) */
    try {
      const raw = localStorage.getItem(`ax_${lc}_billing_used_eur`);
      const used = raw ? Number(raw) : 0;
      return { used_eur: used, details: {} };
    } catch {
      return { used_eur: 0, details: {} };
    }
  }

  /**
   * Status complet pour 1 service (live counter UI).
   */
  getServiceStatus(service: string): ServiceBudget {
    const budgets = this.getBudgets();
    const lc = service.toLowerCase();
    const budget = budgets[lc] ?? 0;
    const usage = this.getServiceUsage(lc);
    const pct = budget > 0 ? Math.round((usage.used_eur / budget) * 100) : 0;
    let severity: ConsumptionSeverity = 'ok';
    if (pct >= CRITICAL_THRESHOLD) severity = 'critical';
    else if (pct >= WARN_THRESHOLD) severity = 'warn';
    const lastAlertRaw = localStorage.getItem(`apex_v13_consumption_alert_${lc}`);
    const lastAlert = lastAlertRaw ? Number(lastAlertRaw) : 0;
    const link = linksRegistry.get(lc);
    const billingUrl = link?.billing ?? this.fallbackBillingUrl(lc);
    return {
      service: lc,
      budget_eur_month: budget,
      used_eur_current_period: usage.used_eur,
      pct_used: pct,
      severity,
      reset_day: 1,
      last_alert_ts: lastAlert,
      billing_url: billingUrl,
    };
  }

  /**
   * Live counter tous services (vue UI dashboard).
   */
  getAllStatuses(): readonly ServiceBudget[] {
    const services = Object.keys(this.getBudgets());
    return services.map((s) => this.getServiceStatus(s));
  }

  /**
   * Check + notif admin si seuil franchi (avec dedup 6h).
   * Appelé par sentinelle balance-watch toutes les heures.
   */
  async checkAndNotify(adminUid: string): Promise<readonly ServiceBudget[]> {
    const all = this.getAllStatuses();
    const now = Date.now();
    const toAlert = all.filter((s) => {
      if (s.severity === 'ok') return false;
      if (s.budget_eur_month === 0) return false; /* Pas de budget configuré */
      if (now - s.last_alert_ts < DEDUP_ALERT_MS) return false; /* Dedup */
      return true;
    });
    for (const s of toAlert) {
      await this.notifyAdmin(adminUid, s);
      try {
        localStorage.setItem(`apex_v13_consumption_alert_${s.service}`, String(now));
      } catch {
        /* ignore */
      }
    }
    return all;
  }

  /**
   * Push notif admin avec deep link 1 clic billing.
   */
  private async notifyAdmin(adminUid: string, status: ServiceBudget): Promise<void> {
    const emoji = status.severity === 'critical' ? '🚨' : '⚠️';
    const title = `${emoji} ${status.service.toUpperCase()} ${status.pct_used}% utilisé`;
    const body = status.severity === 'critical'
      ? `Critique ! ${status.used_eur_current_period.toFixed(2)}€ / ${status.budget_eur_month}€. Recharge maintenant.`
      : `Alerte : ${status.used_eur_current_period.toFixed(2)}€ / ${status.budget_eur_month}€ utilisés. Recharge bientôt.`;
    void auditLog.record('consumption.alert_sent', {
      details: { service: status.service, pct: status.pct_used, severity: status.severity },
    });
    /* Notification locale (toast immédiat) + push si configurée */
    void pushNotifications.send(adminUid, {
      title,
      body,
      cta_url: status.billing_url,
      tag: `consumption-${status.service}`,
      urgent: status.severity === 'critical',
    });
    /* Si push worker configuré → server push (réveille app fermée) */
    const workerUrl = localStorage.getItem('apex_v13_push_worker_url');
    if (workerUrl) {
      void pushNotifications.sendServerPush([adminUid], {
        title,
        body,
        url: status.billing_url,
        tag: `consumption-${status.service}`,
        urgent: status.severity === 'critical',
      });
    }
    logger.info('consumption-monitor', `Alert ${status.service} ${status.pct_used}% → ${adminUid}`);
  }

  /**
   * Fallback billing URL si pas dans links-registry.
   */
  private fallbackBillingUrl(service: string): string {
    const fallbacks: Record<string, string> = {
      groq: 'https://console.groq.com/settings/billing',
      gemini: 'https://aistudio.google.com/app/apikey',
      openrouter: 'https://openrouter.ai/credits',
      cohere: 'https://dashboard.cohere.com/billing',
      mistral: 'https://console.mistral.ai/billing',
      deepseek: 'https://platform.deepseek.com/usage',
      perplexity: 'https://www.perplexity.ai/settings/api',
      replicate: 'https://replicate.com/account/billing',
      twilio: 'https://console.twilio.com/billing',
      resend: 'https://resend.com/settings/billing',
    };
    return fallbacks[service] ?? `https://${service}.com`;
  }

  /**
   * Plans upgrade suggérés par service (auto-recharge si dépassement).
   * Kevin demande 2026-05-04 : "Comme Cloudflare si besoin, si dépassement..."
   */
  getUpgradePlans(service: string): readonly { name: string; price_eur_month: number; description: string; upgrade_url: string }[] {
    const lc = service.toLowerCase();
    const plans: Record<string, readonly { name: string; price_eur_month: number; description: string; upgrade_url: string }[]> = {
      anthropic: [
        { name: 'Build', price_eur_month: 0, description: 'Pay-as-you-go (recharger crédit)', upgrade_url: 'https://console.anthropic.com/settings/billing' },
        { name: 'Scale', price_eur_month: 92, description: 'Tier 1 +rate limits', upgrade_url: 'https://console.anthropic.com/settings/limits' },
      ],
      openai: [
        { name: 'Pay-as-you-go', price_eur_month: 0, description: 'Recharger crédit', upgrade_url: 'https://platform.openai.com/account/billing' },
        { name: 'Tier 1', price_eur_month: 5, description: '5$/mois min usage', upgrade_url: 'https://platform.openai.com/account/limits' },
      ],
      cloudflare: [
        { name: 'Free', price_eur_month: 0, description: '100K req/jour', upgrade_url: 'https://dash.cloudflare.com/' },
        { name: 'Workers Paid', price_eur_month: 5, description: '10M req/mois', upgrade_url: 'https://dash.cloudflare.com/billing' },
        { name: 'Pro', price_eur_month: 23, description: 'Pages + Workers + WAF', upgrade_url: 'https://dash.cloudflare.com/upgrade' },
      ],
      stripe: [
        { name: 'Pay-as-you-go', price_eur_month: 0, description: '1.4% + 0.25€/transaction EU', upgrade_url: 'https://dashboard.stripe.com/billing' },
      ],
      brevo: [
        { name: 'Free', price_eur_month: 0, description: '300 emails/jour', upgrade_url: 'https://app.brevo.com/billing/plan' },
        { name: 'Starter', price_eur_month: 21, description: '20K emails/mois', upgrade_url: 'https://app.brevo.com/billing/plan' },
        { name: 'Business', price_eur_month: 59, description: '100K emails + automation', upgrade_url: 'https://app.brevo.com/billing/plan' },
      ],
      resend: [
        { name: 'Free', price_eur_month: 0, description: '100 emails/jour', upgrade_url: 'https://resend.com/settings/billing' },
        { name: 'Pro', price_eur_month: 19, description: '50K emails/mois', upgrade_url: 'https://resend.com/settings/billing' },
      ],
      groq: [
        { name: 'Free', price_eur_month: 0, description: 'Free tier limits', upgrade_url: 'https://console.groq.com/settings/billing' },
        { name: 'Dev', price_eur_month: 0, description: 'Pay-as-you-go', upgrade_url: 'https://console.groq.com/settings/billing' },
      ],
      gemini: [
        { name: 'Free', price_eur_month: 0, description: '15 req/min, 1M tokens/jour', upgrade_url: 'https://aistudio.google.com/app/apikey' },
        { name: 'Paid', price_eur_month: 0, description: 'Pay-as-you-go via Google Cloud', upgrade_url: 'https://console.cloud.google.com/billing' },
      ],
      elevenlabs: [
        { name: 'Free', price_eur_month: 0, description: '10 min/mois', upgrade_url: 'https://elevenlabs.io/subscription' },
        { name: 'Starter', price_eur_month: 5, description: '30K chars/mois', upgrade_url: 'https://elevenlabs.io/subscription' },
        { name: 'Creator', price_eur_month: 22, description: '100K chars + voice cloning', upgrade_url: 'https://elevenlabs.io/subscription' },
      ],
      deepl: [
        { name: 'Free API', price_eur_month: 0, description: '500K chars/mois', upgrade_url: 'https://www.deepl.com/pro' },
        { name: 'Pro API', price_eur_month: 5, description: '1M chars/mois', upgrade_url: 'https://www.deepl.com/pro' },
      ],
      twilio: [
        { name: 'Pay-as-you-go', price_eur_month: 0, description: 'SMS/Voice à l\'usage', upgrade_url: 'https://console.twilio.com/billing' },
      ],
    };
    return plans[lc] ?? [{
      name: 'Recharger',
      price_eur_month: 0,
      description: 'Recharger crédit ou upgrade plan',
      upgrade_url: this.fallbackBillingUrl(lc),
    }];
  }

  /**
   * Persist snapshot pour historique 30j (graph dashboard).
   */
  recordSnapshot(): void {
    try {
      const all = this.getAllStatuses();
      const snap = {
        ts: Date.now(),
        services: all.map((s) => ({
          service: s.service,
          used_eur: s.used_eur_current_period,
          pct: s.pct_used,
        })),
      };
      const history = JSON.parse(localStorage.getItem('apex_v13_consumption_history') ?? '[]') as Array<{ ts: number }>;
      history.push(snap);
      const trimmed = history.length > 90 ? history.slice(-90) : history;
      localStorage.setItem('apex_v13_consumption_history', JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('consumption-monitor', 'recordSnapshot failed', { err });
    }
  }

  /**
   * Historique 30 derniers snapshots pour graph UI.
   */
  getHistory(service?: string, limit = 30): Array<{ ts: number; used_eur: number; pct: number }> {
    try {
      const history = JSON.parse(localStorage.getItem('apex_v13_consumption_history') ?? '[]') as Array<{
        ts: number;
        services: Array<{ service: string; used_eur: number; pct: number }>;
      }>;
      const last = history.slice(-limit);
      if (!service) {
        return last.map((h) => {
          const total = h.services.reduce((s, e) => s + e.used_eur, 0);
          const avgPct = h.services.length > 0
            ? Math.round(h.services.reduce((s, e) => s + e.pct, 0) / h.services.length)
            : 0;
          return { ts: h.ts, used_eur: total, pct: avgPct };
        });
      }
      const lc = service.toLowerCase();
      return last.map((h) => {
        const found = h.services.find((s) => s.service === lc);
        return { ts: h.ts, used_eur: found?.used_eur ?? 0, pct: found?.pct ?? 0 };
      });
    } catch {
      return [];
    }
  }

  /**
   * Recommendation upgrade auto basée sur usage historique.
   * Si user dépasse régulièrement budget → suggère plan supérieur.
   */
  recommendUpgrade(service: string): { needed: boolean; current_plan?: string; suggested?: string; reason: string; upgrade_url?: string } {
    const status = this.getServiceStatus(service);
    const history = this.getHistory(service, 7);
    if (history.length < 3) {
      return { needed: false, reason: 'Pas assez d\'historique (besoin 3+ jours)' };
    }
    const avgPct = history.reduce((s, h) => s + h.pct, 0) / history.length;
    if (avgPct < 80) {
      return { needed: false, reason: `Usage moyen ${avgPct.toFixed(0)}% < 80% — plan actuel OK` };
    }
    const plans = this.getUpgradePlans(service);
    const currentBudget = status.budget_eur_month;
    const nextPlan = plans.find((p) => p.price_eur_month > currentBudget) ?? plans[plans.length - 1];
    if (!nextPlan) {
      return { needed: true, reason: 'Dépassement régulier mais pas de plan supérieur trouvé', upgrade_url: status.billing_url };
    }
    return {
      needed: true,
      current_plan: `${currentBudget}€/mois`,
      suggested: `${nextPlan.name} ${nextPlan.price_eur_month}€/mois`,
      reason: `Usage moyen ${avgPct.toFixed(0)}% × 7 jours — upgrade recommandé`,
      upgrade_url: nextPlan.upgrade_url,
    };
  }

  /**
   * Format dashboard UI (sortie human-friendly).
   */
  formatForUI(): {
    services: Array<{
      service: string;
      pct_used: number;
      used: string;
      budget: string;
      severity: ConsumptionSeverity;
      emoji: string;
      billing_url: string;
    }>;
    total_alerts: number;
  } {
    const all = this.getAllStatuses();
    /* v13.3.97 P0 fix Kevin "il met toutes les bulles vertes alors qu'elles ne
     * sont pas opérationnelles". Avant : 🟢 si pct_used < 70% MÊME si jamais testé.
     * Après : check vault config + last test status pour honnêteté.
     *   - Pas de clé en vault → ⚪ "Non configuré"
     *   - Clé jamais testée → 🟡 "À tester"
     *   - Clé testée KO → 🔴 "Échec"
     *   - Clé OK + budget OK → 🟢, warn 70-90% → 🟡, critical >=90% → 🔴 */
    const honestEmoji = (service: string, severity: ConsumptionSeverity): string => {
      try {
        const raw = localStorage.getItem('apex_v13_multikey_vault');
        if (raw) {
          const list = JSON.parse(raw) as Array<{ service: string; status?: string }>;
          const matching = list.filter((k) => k.service === service);
          if (matching.length === 0) return '⚪'; /* Non configuré */
          const anyActive = matching.some((k) => k.status === 'active');
          const anyInvalid = matching.some((k) => k.status === 'invalid');
          if (anyInvalid && !anyActive) return '🔴';
          if (!anyActive) return '🟡'; /* unknown / pending test */
        } else {
          /* fallback legacy ax_<service>_key */
          const legacyKey = localStorage.getItem(`ax_${service}_key`);
          if (!legacyKey) return '⚪';
        }
      } catch { /* defensive — fallback severity-based */ }
      /* Configuré + actif → emoji basé sur consommation */
      return severity === 'critical' ? '🔴' : severity === 'warn' ? '🟡' : '🟢';
    };
    return {
      services: all.map((s) => ({
        service: s.service,
        pct_used: s.pct_used,
        used: s.used_eur_current_period.toFixed(2) + '€',
        budget: s.budget_eur_month.toFixed(0) + '€',
        severity: s.severity,
        emoji: honestEmoji(s.service, s.severity),
        billing_url: s.billing_url,
      })),
      total_alerts: all.filter((s) => s.severity !== 'ok').length,
    };
  }
}

export const consumptionMonitor = new ConsumptionMonitor();
