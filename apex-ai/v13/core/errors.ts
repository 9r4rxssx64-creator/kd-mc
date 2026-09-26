/**
 * APEX v13 — Error boundary global
 *
 * Capture window.onerror + unhandledrejection.
 * Pas de catch silencieux : toute erreur loggée + affichée si UI cassée.
 *
 * Anti-patterns évités :
 * - Pas de message technique brut à l'utilisateur (cf. règle CLAUDE.md UX erreurs)
 * - Pas de e.message brut HTML (XSS possible)
 */

import { logger } from './logger.js';

interface ErrorContext {
  source: 'window.onerror' | 'unhandledrejection' | 'manual';
  url?: string;
  line?: number;
  col?: number;
  stack?: string;
}

class Errors {
  private installed = false;
  private errorCount = 0;
  private readonly maxErrorsBeforeRescue = 10;

  installGlobalHandlers(): void {
    if (this.installed) return;
    this.installed = true;

    window.addEventListener('error', (event) => {
      this.capture(event.error || new Error(event.message), {
        source: 'window.onerror',
        ...(event.filename && { url: event.filename }),
        ...(typeof event.lineno === 'number' && { line: event.lineno }),
        ...(typeof event.colno === 'number' && { col: event.colno }),
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason: unknown = event.reason;
      const err = reason instanceof Error ? reason : new Error(String(reason));
      this.capture(err, { source: 'unhandledrejection' });
    });
  }

  capture(err: unknown, ctx: Partial<ErrorContext> = {}): void {
    this.errorCount++;
    const error = err instanceof Error ? err : new Error(String(err));

    logger.error('errors', error.message, {
      stack: error.stack,
      ...ctx,
    });

    /* Forward to Sentry runtime monitoring (audit Kevin v13.1.0).
     * Lazy import pour éviter cycle + ne pas bloquer si module pas encore chargé. */
    void import('../services/observability/sentry-bridge.js')
      .then(({ sentryBridge }) => {
        if (sentryBridge.isInitialized()) {
          sentryBridge.captureException(error, ctx as Record<string, unknown>);
        }
      })
      .catch(() => {
        /* Sentry indispo → on a déjà loggé ci-dessus */
      });

    if (this.errorCount >= this.maxErrorsBeforeRescue) {
      this.triggerRescue();
    }
  }

  private triggerRescue(): void {
    const sos = document.getElementById('apex-rescue-btn');
    if (sos) {
      sos.style.display = 'flex';
      sos.style.background = '#ff5858';
      sos.title = 'Trop d\'erreurs détectées — tap SOS pour recharger';
    }
  }

  /* Convertit erreur technique en message user-friendly + ACTIONNABLE (règle CLAUDE.md "ZÉRO blocage user") */
  toUserMessage(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    /* Stockage saturé (QuotaExceededError DOM) — DOIT être testé AVANT /quota/ générique
     * Cause : "QuotaExceededError" matche /quota/i mais c'est un erreur localStorage, pas Anthropic billing. */
    if (/QuotaExceededError|storage.full|exceeded.*quota|quotaexceeded/i.test(msg)) return '💾 Stockage saturé, nettoyage auto lancé.';
    /* Réseau / connexion (inclut "Failed to fetch" — message standard fetch API) */
    if (/network|fetch.failed|failed.to.fetch|net::|ENOTFOUND|ECONNREFUSED/i.test(msg)) return '🌐 Réseau coupé. Vérifie Wi-Fi/4G — je relance dès que c\'est revenu.';
    if (/cors|cross.origin/i.test(msg)) return '🛡 Bloqué par sécurité navigateur (CORS). Je passe par le proxy Cloudflare.';
    /* Timeout / iOS abort / cancel (ORDRE CRITIQUE v13.4.28 fix bugs documentés v13.4.18) :
     * - /^aborted$/i en PREMIER (anchored exact match) → iOS Safari lifecycle silencieux
     * - Puis /abort|cancel/ générique → action user interrompue
     * Avant v13.4.28 : 'aborted' matchait /abort/ → pattern L107 mort code. */
    if (/timeout|timed out/i.test(msg)) return '⏱ Pas de réponse en 30s. Je retente avec un autre modèle IA…';
    if (/^aborted$/i.test(msg.trim())) return '⏸ Lifecycle iOS Safari (normal). Reprise auto.';
    if (/abort|cancel/i.test(msg)) return '⏸ Action interrompue. Tape ta question à nouveau si besoin.';
    /* Quota / billing */
    if (/quota|insufficient.balance|insufficient_quota|payment.required|402/i.test(msg)) return '💳 Quota Anthropic épuisé. Recharge ici : https://console.anthropic.com/settings/billing — ou je bascule sur OpenRouter/Groq.';
    if (/rate.?limit|429/i.test(msg)) return '🚦 Trop de requêtes. J\'attends 30s puis je retente automatiquement.';
    /* Auth */
    if (/unauthorized|invalid.api.key|401/i.test(msg)) return '🔑 Clé API invalide ou expirée. Vérifie le Coffre → bouton 🔓 Récupérer.';
    if (/forbidden|403/i.test(msg)) return '🚫 Action non autorisée pour ce compte.';
    /* Tool errors AVANT 404 (v13.4.28 fix bug documenté v13.4.18) :
     * 'Tool not found' contient 'not.found' qui matchait L101 → 'Ressource introuvable'.
     * Maintenant tool.not.found testé d'abord → 'Outil indisponible' correct. */
    if (/tool.not.found|unknown.tool/i.test(msg)) return '🔧 Outil indisponible. Reformule ou tape la fonction direct.';
    /* Not found 404 — ressource introuvable (après tool.not.found pour priorité) */
    if (/404|not.found/i.test(msg)) return '🔍 Ressource introuvable. Vérifie l\'URL ou réessaie.';
    /* Server errors */
    if (/5\d{2}|internal.server|bad.gateway|service.unavailable/i.test(msg)) return '🛠 Serveur Anthropic en panne, je bascule failover OpenRouter/Groq…';
    if (/parse|json|syntax/i.test(msg)) return '📝 Format réponse cassé. Je réessaie immédiatement…';
    /* Memory / IDB */
    if (/indexeddb|idb|database/i.test(msg)) return '💾 Cache local inaccessible, fallback Firebase.';
    /* v13.3.74 (Kevin screenshot bug): "openai no key" / "groq no key" / "gemini no key"
     * = provider du failover sans clé configurée. Pas une vraie erreur user — failover
     * silencieux. Affiche message neutre sans technical details. */
    if (/^\w+\s+no\s+key$|provider.*not.configured/i.test(msg)) {
      return '🔄 Je bascule sur un autre modèle IA…';
    }
    /* Catch-all : afficher le vrai message technique 1 fois (mode admin debug uniquement) */
    const isAdmin = (() => {
      try {
        const user = JSON.parse(localStorage.getItem('apex_v13_user') ?? 'null') as { role?: string; id?: string } | null;
        return user?.role === 'admin' || user?.id === 'kdmc_admin';
      } catch { return false; }
    })();
    /* v13.3.74 (Kevin "openai no key admin debug" screenshot) :
     * Filtrer les messages "no key" / "not configured" même en mode admin debug —
     * c'est du bruit failover, pas une erreur user à afficher. */
    if (isAdmin && msg && msg.length < 200 && !/no\s+key|not.configured/i.test(msg)) {
      return `⚠ ${msg.slice(0, 180)} (admin debug)`;
    }
    return '🔄 Souci technique, je relance automatiquement dans un instant… Si ça persiste, tape SOS.';
  }
}

export const errors = new Errors();
