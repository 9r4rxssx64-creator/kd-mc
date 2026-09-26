/**
 * APEX v13 — Self-Correct cascade.
 *
 * Demande Kevin (2026-05-08 18:05) :
 *   "Comment c'est possible encore des clés API qui se sont perdues comment c'est
 *    possible avec toutes les API que j'ai mis, ils devraient enchaîner avec une
 *    autre en automatique et réparer le problème automatiquement"
 *   "Il ne s'auto-corrige pas apparemment, il attend que tu le fasses c'est pas normal"
 *
 * Mission : détecter les pannes RÉCURRENTES d'Apex et déclencher une cascade
 * d'auto-réparation SANS intervention de Kevin.
 *
 * Pannes détectées :
 *   1. 3+ chat-fallback déclenchés en 5 min (signal : `ai.http_error` répétés)
 *   2. Aucune réponse complète depuis 10 min (signal : pas de `ai.routing_policy_decision`
 *      OK depuis 10 min ALORS qu'il y a eu des tentatives)
 *   3. Tous les providers consécutivement DEAD (signal : `ai.all_providers_dead`)
 *
 * Cascade d'auto-correction (dans l'ordre) :
 *   1. Restaure clés perdues depuis Firebase backup / IDB shadow / alias localStorage
 *      (autoRestoreCredentials.restoreAutomatically)
 *   2. Re-test rapide chaque provider (ping minimal via aiKeyRotation.rankProviders)
 *   3. Reset chain failover (mark all DEAD = false via aiKeyRotation.reset par provider)
 *   4. Si rien ne marche → ULTRA-RESET auto (autoUltraReset.triggerAutoReset)
 *   5. Toast user-friendly « 🔧 Apex s'est auto-réparé » + audit log
 *
 * Garde-fous (anti-boucle) :
 *   - Throttle : max 1 auto-correct toutes les 30 min (clé `apex_v13_self_correct_last_ts`)
 *   - ULTRA-RESET niveau 4 hérite de son propre throttle 24h (auto-ultra-reset.ts)
 *   - Si auto-correct lui-même fail (toutes les étapes) → escalade `ax_claude_todo` CRITICAL
 *
 * Wiring :
 *   - services-bootstrap.ts : safeInit('apex-self-correct', ...)
 *   - sentinels.ts : register('apex-self-correct-watch', interval 5min)
 *
 * v13.3.79+ (Kevin règle ABSOLUE 2026-05-08 « Autonomie totale toujours partout »)
 */

import { logger } from '../../core/logger.js';
import { aiKeyRotation, type RotationProvider } from '../ai/ai-key-rotation.js';
import { auditLog } from '../observability/audit-log.js';
import { autoUltraReset } from '../storage/auto-ultra-reset.js';
import { autoRestoreCredentials } from '../vault/auto-restore-credentials.js';

/* ============================================================
   Types publics
   ============================================================ */

/** Fenêtre temporelle utilisée par les heuristiques de détection de panne. */
export interface DetectionWindow {
  /** Durée fenêtre récurrente fallback (ms) — défaut 5 min */
  fallback_window_ms: number;
  /** Seuil chat-fallback consécutifs déclenchant cascade — défaut 3 */
  fallback_threshold: number;
  /** Durée fenêtre absence réponse (ms) — défaut 10 min */
  no_response_window_ms: number;
  /** Cooldown global anti-boucle entre 2 auto-corrects — défaut 30 min */
  throttle_ms: number;
}

export const DEFAULT_DETECTION_WINDOW: DetectionWindow = {
  fallback_window_ms: 5 * 60 * 1000,
  fallback_threshold: 3,
  no_response_window_ms: 10 * 60 * 1000,
  throttle_ms: 30 * 60 * 1000,
};

/** Diagnostic produit par `detectFault()`. */
export interface FaultDetection {
  /** Au moins 1 trigger atteint → cascade auto-correct doit s'enclencher. */
  needs_correction: boolean;
  /** Ratio chat-fallback / total tentatives sur la fenêtre. */
  fallback_ratio: number;
  /** Compte chat-fallback récents. */
  recent_fallbacks: number;
  /** Compte tentatives totales (succès + erreurs). */
  recent_attempts: number;
  /** Aucune réponse complète depuis ce délai (ms). 0 = pas de tentatives, donc N/A. */
  ms_since_last_success: number;
  /** Tous providers DEAD détecté via audit `ai.all_providers_dead` récent. */
  all_providers_dead: boolean;
  /** Ts du diagnostic. */
  ts: number;
  /** Liste lisible des raisons (UI debug + audit). */
  reasons: string[];
}

/** Détail par étape de la cascade d'auto-correction. */
export interface SelfCorrectStep {
  step: 'restore_credentials' | 'reset_dead_providers' | 'rank_providers' | 'ultra_reset' | 'escalate_claude';
  ok: boolean;
  details?: string;
  /** Données numériques utiles (UI / tests). */
  metrics?: Record<string, number>;
}

/** Résultat global d'un cycle d'auto-correction. */
export interface SelfCorrectResult {
  ts: number;
  triggered: boolean;
  /** Si !triggered : raison. Sinon undefined. */
  skipped_reason?: 'throttled' | 'no_fault' | 'disabled';
  /** Diagnostic ayant déclenché la cascade. */
  detection?: FaultDetection;
  /** Liste des étapes exécutées. */
  steps: SelfCorrectStep[];
  /** True si la cascade a complètement réparé Apex. */
  resolved: boolean;
  /** True si on a dû escalader Claude Code (rien marché). */
  escalated: boolean;
}

/* ============================================================
   Internals
   ============================================================ */

const STORAGE_LAST_TS = 'apex_v13_self_correct_last_ts';
const STORAGE_RESULTS = 'apex_v13_self_correct_results'; /* historique 20 derniers */
const RESULTS_MAX = 20;

/** Liste des providers AI à reset si tous DEAD (mêmes que ai-key-rotation). */
const AI_PROVIDERS: ReadonlyArray<RotationProvider> = [
  'anthropic',
  'openai',
  'openrouter',
  'groq',
  'gemini',
  'mistral',
  'cohere',
  'perplexity',
  'deepseek',
];

/* ============================================================
   Service
   ============================================================ */

class ApexSelfCorrect {
  private detectionWindow: DetectionWindow = { ...DEFAULT_DETECTION_WINDOW };
  /** Si true (admin override), on ignore le throttle (debug). */
  private bypassThrottle = false;

  /**
   * Configure les fenêtres de détection (admin / tests).
   */
  configure(opts: Partial<DetectionWindow>): void {
    this.detectionWindow = { ...this.detectionWindow, ...opts };
  }

  /** Active bypass throttle (pour tests / admin debug). */
  setBypassThrottle(bypass: boolean): void {
    this.bypassThrottle = bypass;
  }

  /**
   * Détecte si Apex est en panne récurrente nécessitant cascade auto-correct.
   *
   * Heuristique :
   *   - Compte les `ai.http_error` (proxy chat-fallback) sur la fenêtre fallback.
   *   - Si ≥ threshold ET ratio ≥ 50% → fault.
   *   - Compte les tentatives totales (`ai.http_error` + `ai.routing_policy_decision`).
   *     Pas de `ai.routing_policy_decision` succès depuis no_response_window → fault.
   *   - `ai.all_providers_dead` récent → fault unconditionnel.
   */
  async detectFault(now: number = Date.now()): Promise<FaultDetection> {
    auditLog.init();
    const reasons: string[] = [];
    const fallbackCutoff = now - this.detectionWindow.fallback_window_ms;
    const noRespCutoff = now - this.detectionWindow.no_response_window_ms;

    const httpErrors = auditLog.getEntries({ action: 'ai.http_error' });
    const routingDecisions = auditLog.getEntries({ action: 'ai.routing_policy_decision' });
    const allDead = auditLog.getEntries({ action: 'ai.all_providers_dead' });

    const recentFallbacks = httpErrors.filter((e) => e.ts >= fallbackCutoff).length;
    const recentAttempts = recentFallbacks
      + routingDecisions.filter((e) => e.ts >= fallbackCutoff).length;
    const fallbackRatio = recentAttempts > 0 ? recentFallbacks / recentAttempts : 0;

    /* Critère 1 : chat-fallback récurrents */
    const triggerFallbacks = recentFallbacks >= this.detectionWindow.fallback_threshold
      && fallbackRatio >= 0.5;
    if (triggerFallbacks) {
      reasons.push(`${recentFallbacks} chat-fallback en ${this.detectionWindow.fallback_window_ms / 60000}min (ratio ${(fallbackRatio * 100).toFixed(0)}%)`);
    }

    /* Critère 2 : aucune réponse complète depuis no_response_window
       Skip si zéro tentatives sur la fenêtre (pas de signal du tout). */
    let msSinceLastSuccess = 0;
    let triggerNoResponse = false;
    /* On considère un succès = ai.routing_policy_decision (chaque appel ai-router en logge un)
       car http_error s'écrit toujours en cas de fail provider. La présence de routing_policy
       sans http_error subséquent suggère un succès. */
    const lastDecision = routingDecisions.length > 0
      ? routingDecisions[routingDecisions.length - 1]
      : undefined;
    const lastError = httpErrors.length > 0 ? httpErrors[httpErrors.length - 1] : undefined;
    if (lastDecision && lastError) {
      msSinceLastSuccess = now - lastDecision.ts;
      const onlyErrorsRecently = lastError.ts > lastDecision.ts;
      if (onlyErrorsRecently && lastDecision.ts < noRespCutoff && recentAttempts > 0) {
        triggerNoResponse = true;
        reasons.push(`Aucune réponse OK depuis ${Math.round(msSinceLastSuccess / 60000)}min`);
      }
    } else if (lastDecision) {
      msSinceLastSuccess = now - lastDecision.ts;
      if (lastDecision.ts < noRespCutoff && recentFallbacks > 0) {
        triggerNoResponse = true;
        reasons.push(`Aucune réponse OK depuis ${Math.round(msSinceLastSuccess / 60000)}min`);
      }
    }

    /* Critère 3 : all_providers_dead audit récent (window fallback élargie) */
    const triggerAllDead = allDead.some((e) => e.ts >= fallbackCutoff);
    if (triggerAllDead) {
      reasons.push('Tous providers IA marqués DEAD');
    }

    return {
      needs_correction: triggerFallbacks || triggerNoResponse || triggerAllDead,
      fallback_ratio: fallbackRatio,
      recent_fallbacks: recentFallbacks,
      recent_attempts: recentAttempts,
      ms_since_last_success: msSinceLastSuccess,
      all_providers_dead: triggerAllDead,
      ts: now,
      reasons,
    };
  }

  /**
   * Cycle complet de la sentinelle (5 min) :
   *   1. Détecte si fault
   *   2. Si fault & non throttled → run cascade
   *   3. Persiste le résultat
   *
   * Retourne SelfCorrectResult pour log + tests.
   */
  async runCycle(now: number = Date.now()): Promise<SelfCorrectResult> {
    /* Throttle */
    if (!this.bypassThrottle && this.isThrottled(now)) {
      const r: SelfCorrectResult = {
        ts: now,
        triggered: false,
        skipped_reason: 'throttled',
        steps: [],
        resolved: false,
        escalated: false,
      };
      this.saveResult(r);
      return r;
    }

    const detection = await this.detectFault(now);
    if (!detection.needs_correction) {
      const r: SelfCorrectResult = {
        ts: now,
        triggered: false,
        skipped_reason: 'no_fault',
        detection,
        steps: [],
        resolved: false,
        escalated: false,
      };
      this.saveResult(r);
      return r;
    }

    /* Cascade auto-correct */
    const result = await this.runCascade(detection, now);
    this.markTriggered(now);
    this.saveResult(result);
    return result;
  }

  /**
   * Exécute la cascade auto-correct (5 étapes max).
   * Public pour tests et bouton admin "🔧 Forcer auto-correct maintenant".
   */
  async runCascade(detection: FaultDetection, now: number = Date.now()): Promise<SelfCorrectResult> {
    const steps: SelfCorrectStep[] = [];
    let resolved = false;
    let escalated = false;

    /* === ÉTAPE 1 : restore credentials manquantes === */
    let restoredCount = 0;
    try {
      const report = await autoRestoreCredentials.restoreAutomatically();
      restoredCount = report.restored;
      steps.push({
        step: 'restore_credentials',
        ok: true,
        details: `${report.restored} restored, ${report.failed} failed`,
        metrics: { restored: report.restored, failed: report.failed },
      });
    } catch (err: unknown) {
      steps.push({
        step: 'restore_credentials',
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
    }

    /* === ÉTAPE 2 : reset DEAD timers de tous les providers === */
    let resetCount = 0;
    try {
      for (const p of AI_PROVIDERS) {
        if (aiKeyRotation.isProviderDead(this.providerToService(p))) {
          aiKeyRotation.reset(p);
          resetCount += 1;
        }
      }
      steps.push({
        step: 'reset_dead_providers',
        ok: true,
        details: `${resetCount} providers DEAD timers cleared`,
        metrics: { reset: resetCount },
      });
    } catch (err: unknown) {
      steps.push({
        step: 'reset_dead_providers',
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
    }

    /* === ÉTAPE 3 : rank providers (sanity check qu'au moins 1 alive) === */
    let aliveCount = 0;
    try {
      const ranking = await aiKeyRotation.rankProviders();
      aliveCount = ranking.filter((r) => r.alive).length;
      steps.push({
        step: 'rank_providers',
        ok: aliveCount > 0,
        details: `${aliveCount}/${ranking.length} providers alive`,
        metrics: { alive: aliveCount, total: ranking.length },
      });
      /* Si on a au moins 1 provider alive ET on vient de restore au moins 1 clé ou
         reset au moins 1 DEAD → considéré comme résolu sans ULTRA-RESET. */
      if (aliveCount > 0 && (restoredCount > 0 || resetCount > 0)) {
        resolved = true;
      }
    } catch (err: unknown) {
      steps.push({
        step: 'rank_providers',
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
    }

    /* === ÉTAPE 4 : ULTRA-RESET si rien n'a marché ===
       Note : autoUltraReset.triggerAutoReset hérite d'un throttle 24h propre.
       Si throttled → skipped, on continue vers escalade Claude Code. */
    if (!resolved) {
      try {
        const ultra = await autoUltraReset.triggerAutoReset();
        steps.push({
          step: 'ultra_reset',
          ok: ultra.ok,
          details: ultra.ok
            ? 'ULTRA-RESET déclenché (reload imminent)'
            : `ULTRA-RESET skippé : ${ultra.reason ?? 'unknown'}`,
        });
        if (ultra.ok) {
          resolved = true;
        }
      } catch (err: unknown) {
        steps.push({
          step: 'ultra_reset',
          ok: false,
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    /* === ÉTAPE 5 : escalade Claude Code si tout a échoué === */
    if (!resolved) {
      try {
        await this.escalateToClaudeCode(detection, steps);
        steps.push({
          step: 'escalate_claude',
          ok: true,
          details: 'Escalated to ax_claude_todo CRITICAL',
        });
        escalated = true;
      } catch (err: unknown) {
        steps.push({
          step: 'escalate_claude',
          ok: false,
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    /* Audit log + toast */
    void auditLog.record('apex.self_correct', {
      details: {
        triggered: true,
        resolved,
        escalated,
        reasons: detection.reasons,
        steps_count: steps.length,
        restored: restoredCount,
        reset_dead: resetCount,
        alive_providers: aliveCount,
      },
    });
    if (resolved) {
      this.notifyResolved(restoredCount, resetCount);
    }

    return {
      ts: now,
      triggered: true,
      detection,
      steps,
      resolved,
      escalated,
    };
  }

  /** Lit l'historique des derniers cycles (admin UI). */
  getHistory(): SelfCorrectResult[] {
    try {
      const raw = localStorage.getItem(STORAGE_RESULTS);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as SelfCorrectResult[];
    } catch {
      return [];
    }
  }

  /** Reset (tests). */
  resetAll(): void {
    try {
      localStorage.removeItem(STORAGE_LAST_TS);
      localStorage.removeItem(STORAGE_RESULTS);
    } catch { /* ignore */ }
    this.bypassThrottle = false;
    this.detectionWindow = { ...DEFAULT_DETECTION_WINDOW };
  }

  /* ============================================================
     Helpers privés
     ============================================================ */

  private isThrottled(now: number): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_LAST_TS);
      if (!raw) return false;
      const lastTs = Number.parseInt(raw, 10);
      if (!Number.isFinite(lastTs)) return false;
      return now - lastTs < this.detectionWindow.throttle_ms;
    } catch {
      return false;
    }
  }

  private markTriggered(now: number): void {
    try {
      localStorage.setItem(STORAGE_LAST_TS, String(now));
    } catch { /* quota silent */ }
  }

  private saveResult(result: SelfCorrectResult): void {
    try {
      const history = this.getHistory();
      history.push(result);
      const trimmed = history.length > RESULTS_MAX ? history.slice(-RESULTS_MAX) : history;
      localStorage.setItem(STORAGE_RESULTS, JSON.stringify(trimmed));
    } catch { /* quota silent */ }
  }

  private providerToService(provider: RotationProvider): string {
    return provider === 'gemini' ? 'google' : provider;
  }

  private notifyResolved(restored: number, resetDead: number): void {
    /* Toast best-effort (boot précoce / tests : module absent OK). */
    try {
      void import('../../ui/toast.js').then(({ toast }) => {
        try {
          toast.success(
            `🔧 Apex s'est auto-réparé (${restored} clés restaurées, ${resetDead} providers ré-activés)`,
            { duration: 7000 },
          );
        } catch { /* non bloquant */ }
      }).catch(() => { /* skip */ });
    } catch { /* skip */ }
  }

  /**
   * Escalade Claude Code via Firebase ax_claude_todo CRITICAL si la cascade
   * complète n'a rien réparé. Best-effort (skip si Firebase offline).
   */
  private async escalateToClaudeCode(
    detection: FaultDetection,
    steps: SelfCorrectStep[],
  ): Promise<void> {
    try {
      const { claudeBridge } = await import('../ai/claude-bridge.js');
      await claudeBridge.pushTodo({
        type: 'fix_bug',
        src: 'apex',
        title: 'Apex self-correct cascade failed — IA non auto-réparable',
        description: `Apex a détecté une panne récurrente (${detection.reasons.join('; ')}). La cascade auto-correct (restore credentials → reset DEAD → ULTRA-RESET) a échoué. Investiguer et fixer manuellement.`,
        severity: 'critical',
        context: {
          reasons: detection.reasons,
          recent_fallbacks: detection.recent_fallbacks,
          recent_attempts: detection.recent_attempts,
          fallback_ratio: detection.fallback_ratio,
          ms_since_last_success: detection.ms_since_last_success,
          all_providers_dead: detection.all_providers_dead,
          steps: steps.map((s) => ({ step: s.step, ok: s.ok, details: s.details ?? '' })),
        },
      });
      return;
    } catch (err: unknown) {
      logger.warn('apex-self-correct', 'claude-bridge unavailable', { err });
    }
    /* Fallback : audit log critical (sera lu par sentinelle Claude Code cron 5min) */
    void auditLog.record('apex.self_correct_escalate', {
      details: {
        reasons: detection.reasons,
        steps: steps.map((s) => ({ step: s.step, ok: s.ok })),
        severity: 'critical',
      },
    });
  }
}

export const apexSelfCorrect = new ApexSelfCorrect();
