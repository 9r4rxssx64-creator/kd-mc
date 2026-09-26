/**
 * APEX v13 — Consumption Anomaly Detector (Kevin v13.0.69 demande explicite).
 *
 * "Conso temps réel chaque IA + outil qui vérifie conso normale + détecte
 * problème clé (volée/compromise/anormale)."
 *
 * Algorithme :
 * 1. Lit history 7 derniers jours via consumptionMonitor.getHistory()
 * 2. Calcule baseline moyenne quotidienne par service
 * 3. Compare conso jour courant vs baseline
 * 4. Score anomalie : ratio current/baseline
 * 5. Si > 200% (2× baseline) → severity 'high' (clé potentiellement compromise)
 * 6. Si > 500% (5× baseline) → severity 'critical' (rotation IMMÉDIATE)
 * 7. Push alerte audit + notification Kevin + lien dashboard provider
 *
 * Lien recharge direct par provider (1-clic Kevin règle).
 */

import { logger } from '../../core/logger.js';

import { auditLog } from './audit-log.js';
import { consumptionMonitor } from './consumption-monitor.js';

export type AnomalySeverity = 'normal' | 'low' | 'medium' | 'high' | 'critical';

export interface AnomalyReport {
  service: string;
  severity: AnomalySeverity;
  current_eur_today: number;
  baseline_eur_daily: number;
  ratio: number;
  reason: string;
  recommended_action: string;
  recharge_url: string;
  rotate_url: string;
  ts: number;
}

/* Liens directs recharge + rotation par provider (Kevin règle 1-clic) */
const PROVIDER_LINKS: Record<string, { recharge: string; rotate: string; usage_dashboard: string }> = {
  anthropic: {
    recharge: 'https://console.anthropic.com/settings/billing',
    rotate: 'https://console.anthropic.com/settings/keys',
    usage_dashboard: 'https://console.anthropic.com/settings/usage',
  },
  openai: {
    recharge: 'https://platform.openai.com/account/billing/overview',
    rotate: 'https://platform.openai.com/api-keys',
    usage_dashboard: 'https://platform.openai.com/usage',
  },
  groq: {
    recharge: 'https://console.groq.com/settings/billing',
    rotate: 'https://console.groq.com/keys',
    usage_dashboard: 'https://console.groq.com/usage',
  },
  gemini: {
    recharge: 'https://aistudio.google.com/app/apikey',
    rotate: 'https://aistudio.google.com/app/apikey',
    usage_dashboard: 'https://console.cloud.google.com/apis/dashboard',
  },
  openrouter: {
    recharge: 'https://openrouter.ai/credits',
    rotate: 'https://openrouter.ai/keys',
    usage_dashboard: 'https://openrouter.ai/activity',
  },
  cohere: {
    recharge: 'https://dashboard.cohere.com/billing',
    rotate: 'https://dashboard.cohere.com/api-keys',
    usage_dashboard: 'https://dashboard.cohere.com/billing/usage',
  },
  mistral: {
    recharge: 'https://console.mistral.ai/billing',
    rotate: 'https://console.mistral.ai/api-keys/',
    usage_dashboard: 'https://console.mistral.ai/usage',
  },
  deepseek: {
    recharge: 'https://platform.deepseek.com/usage',
    rotate: 'https://platform.deepseek.com/api_keys',
    usage_dashboard: 'https://platform.deepseek.com/usage',
  },
  perplexity: {
    recharge: 'https://www.perplexity.ai/settings/api',
    rotate: 'https://www.perplexity.ai/settings/api',
    usage_dashboard: 'https://www.perplexity.ai/settings/api',
  },
  elevenlabs: {
    recharge: 'https://elevenlabs.io/subscription',
    rotate: 'https://elevenlabs.io/app/settings/api-keys',
    usage_dashboard: 'https://elevenlabs.io/app/usage',
  },
  replicate: {
    recharge: 'https://replicate.com/account/billing',
    rotate: 'https://replicate.com/account/api-tokens',
    usage_dashboard: 'https://replicate.com/account/billing#usage',
  },
};

class ConsumptionAnomalyDetector {
  /**
   * Analyse une service spécifique : current vs baseline 7j.
   */
  detectAnomaly(service: string): AnomalyReport {
    const lc = service.toLowerCase();
    const history = consumptionMonitor.getHistory(lc, 30);
    /* Baseline = moyenne des 7 derniers snapshots avant aujourd'hui */
    const today = new Date().toISOString().slice(0, 10);
    const past7 = history.filter((h) => {
      const date = new Date(h.ts).toISOString().slice(0, 10);
      return date !== today;
    }).slice(-7);
    const baseline = past7.length > 0
      ? past7.reduce((s, h) => s + h.used_eur, 0) / past7.length
      : 0;
    /* Current = entry du jour (ou dernière) */
    const current = history.find((h) => new Date(h.ts).toISOString().slice(0, 10) === today)?.used_eur
      ?? history[history.length - 1]?.used_eur ?? 0;
    const ratio = baseline > 0 ? current / baseline : (current > 0 ? Infinity : 0);
    let severity: AnomalySeverity = 'normal';
    let reason = 'Conso normale vs baseline 7j';
    let recommended_action = 'Aucune action';
    if (baseline === 0 && current > 5) {
      severity = 'low';
      reason = 'Pas de baseline (premier usage), monitor 7j';
      recommended_action = 'Continuer à utiliser, surveillance auto';
    } else if (ratio >= 5) {
      severity = 'critical';
      reason = `Conso ${current.toFixed(2)}€ aujourd'hui = ${ratio.toFixed(1)}× baseline ${baseline.toFixed(2)}€/jour`;
      recommended_action = '🚨 ROTATION IMMÉDIATE — clé potentiellement compromise (5× anormal)';
    } else if (ratio >= 2) {
      severity = 'high';
      reason = `Conso ${current.toFixed(2)}€ aujourd'hui = ${ratio.toFixed(1)}× baseline ${baseline.toFixed(2)}€/jour`;
      recommended_action = '⚠️ Vérifier usage légitime ou rotation préventive (2× anormal)';
    } else if (ratio >= 1.5) {
      severity = 'medium';
      reason = `Conso ${current.toFixed(2)}€ aujourd'hui = ${ratio.toFixed(1)}× baseline ${baseline.toFixed(2)}€/jour`;
      recommended_action = 'Surveiller — conso 50% au-dessus baseline';
    }
    const links = PROVIDER_LINKS[lc] ?? {
      recharge: '', rotate: '', usage_dashboard: '',
    };
    const report: AnomalyReport = {
      service: lc,
      severity,
      current_eur_today: current,
      baseline_eur_daily: baseline,
      ratio,
      reason,
      recommended_action,
      recharge_url: links.recharge,
      rotate_url: links.rotate,
      ts: Date.now(),
    };
    if (severity !== 'normal') {
      void auditLog.record('anomaly_detected', {
        details: { service: lc, severity, ratio, current, baseline },
      });
      logger.warn('anomaly-detector', `${lc} severity=${severity} ratio=${ratio.toFixed(2)}`);
    }
    return report;
  }

  /**
   * Scan tous services + retourne anomalies > normal.
   */
  scanAll(): readonly AnomalyReport[] {
    const services = Object.keys(PROVIDER_LINKS);
    const reports = services.map((s) => this.detectAnomaly(s));
    return reports.filter((r) => r.severity !== 'normal');
  }

  /**
   * Liste services + status complet (normal inclus).
   *
   * v13.4.102 (Kevin "incoherence Conso 7 ✅ vs Coffre 0 codes") :
   * Filtre uniquement les services pour lesquels une clé EST réellement présente
   * en vault local. Avant : retournait TOUS les services du registry statique,
   * affichant ✅ même si aucune clé n'avait été collée → trompeur.
   * Maintenant : Conso View ne montre QUE ce qui est réellement configuré.
   */
  scanAllVerbose(): readonly AnomalyReport[] {
    const allServices = Object.keys(PROVIDER_LINKS);
    const present = allServices.filter((s) => this.hasKeyInVault(s));
    return present.map((s) => this.detectAnomaly(s));
  }

  /** v13.4.102 — Détecte si une clé pour ce service est présente en vault. */
  private hasKeyInVault(service: string): boolean {
    try {
      /* Convention storage keys : ax_<service>_key OU ax_<service>_token */
      const candidates = [
        `ax_${service}_key`,
        `ax_${service}_token`,
        `ax_${service}_api_key`,
      ];
      for (const k of candidates) {
        const v = localStorage.getItem(k);
        if (v && v.length > 10) return true;
      }
      /* Fallback : check multi_keys store */
      const multi = localStorage.getItem('apex_v13_multi_keys');
      if (multi) {
        const parsed: unknown = JSON.parse(multi);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (typeof entry === 'object' && entry !== null) {
              const e = entry as { service?: string; storageKey?: string };
              if (e.service?.toLowerCase() === service.toLowerCase()) return true;
              if (e.storageKey && new RegExp(`^ax_${service}_`, 'i').test(e.storageKey)) return true;
            }
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Liens directs par provider (Kevin règle 1-clic).
   */
  getLinks(service: string): { recharge: string; rotate: string; usage_dashboard: string } | null {
    return PROVIDER_LINKS[service.toLowerCase()] ?? null;
  }

  listAllProviders(): readonly string[] {
    return Object.keys(PROVIDER_LINKS);
  }
}

export const consumptionAnomalyDetector = new ConsumptionAnomalyDetector();
