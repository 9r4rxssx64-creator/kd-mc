/**
 * APEX v13 — Predictive Engine (innovation futuriste).
 *
 * Surprise Kevin : Apex ANTICIPE les besoins user via ML simple côté client.
 *
 * Pipeline :
 * 1. Track user actions (intent, tools used, time of day, day of week)
 * 2. Pattern detection : sequences fréquentes ("matin → mail+planning", "soir → musique")
 * 3. Prédictions next action probability
 * 4. Auto-suggestions PROACTIVES (sans demande user)
 * 5. Apprentissage continu (feedback loop : user accepte/refuse → ajuste poids)
 *
 * Anti-pattern Kevin :
 * - Privacy-first : modèle local-only, pas de cloud
 * - Pas de spam : seuil confidence 0.65+ avant suggestion
 * - User peut désactiver (consent)
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

export interface UserAction {
  id: string;
  uid: string;
  action_type: string; /* tool_used, intent_detected, navigation, message_sent */
  context: {
    hour: number; /* 0-23 */
    day_of_week: number; /* 0=Sun, 6=Sat */
    previous_action?: string;
    tier?: string;
  };
  details: Record<string, unknown>;
  ts: number;
}

export interface Prediction {
  action_type: string;
  confidence: number;
  reason: string;
  suggested_at: number;
}

export interface PatternStats {
  pattern: string; /* "morning_mail_planning" */
  occurrences: number;
  last_seen: number;
  confidence: number;
}

const MIN_CONFIDENCE = 0.65;
const MAX_HISTORY = 500;
const MIN_OCCURRENCES_FOR_PATTERN = 3;

class PredictiveEngine {
  private acceptances = new Map<string, { accepted: number; rejected: number }>();

  /**
   * Track user action (alimente le moteur prédictif).
   */
  track(action: Omit<UserAction, 'id' | 'ts'>): void {
    const full: UserAction = {
      ...action,
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
    };
    try {
      const all = this.loadHistory();
      all.push(full);
      const trimmed = all.length > MAX_HISTORY ? all.slice(-MAX_HISTORY) : all;
      localStorage.setItem('apex_v13_predictive_history', JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('predictive-engine', 'track persist failed', { err });
    }
  }

  /**
   * Predit prochaines actions probables pour user à un moment donné.
   */
  predict(uid: string, currentHour?: number, currentDay?: number): Prediction[] {
    const history = this.loadHistory().filter((a) => a.uid === uid);
    if (history.length < MIN_OCCURRENCES_FOR_PATTERN) return [];

    const hour = currentHour ?? new Date().getHours();
    const day = currentDay ?? new Date().getDay();

    /* Trouve actions historiques même hour ± 1 + même day */
    const similar = history.filter((a) => {
      const hourDiff = Math.abs(a.context.hour - hour);
      return (hourDiff <= 1 || hourDiff >= 23) && a.context.day_of_week === day;
    });

    if (similar.length === 0) return [];

    /* Compte fréquence par action_type */
    const counts: Record<string, number> = {};
    for (const a of similar) {
      counts[a.action_type] = (counts[a.action_type] ?? 0) + 1;
    }

    /* Convert en predictions avec confidence */
    const total = similar.length;
    const predictions: Prediction[] = Object.entries(counts)
      .map(([action_type, count]) => {
        let confidence = count / total;
        /* Adjust avec acceptances feedback (apprentissage continu) */
        const stats = this.acceptances.get(action_type);
        if (stats) {
          const totalFeedback = stats.accepted + stats.rejected;
          if (totalFeedback >= 3) {
            const accRate = stats.accepted / totalFeedback;
            confidence = confidence * 0.7 + accRate * 0.3;
          }
        }
        return {
          action_type,
          confidence,
          reason: `${count}/${total} fois à cette heure (${day}j)`,
          suggested_at: Date.now(),
        };
      })
      .filter((p) => p.confidence >= MIN_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    if (predictions.length > 0) {
      void auditLog.record('predictive.suggestion', {
        details: { uid, count: predictions.length, top: predictions[0]?.action_type },
      });
    }

    return predictions;
  }

  /**
   * Feedback : user a accepté (clicked) ou refusé (dismissed) suggestion.
   */
  feedback(actionType: string, accepted: boolean): void {
    const stats = this.acceptances.get(actionType) ?? { accepted: 0, rejected: 0 };
    if (accepted) stats.accepted++;
    else stats.rejected++;
    this.acceptances.set(actionType, stats);
    /* Persist */
    try {
      const obj: Record<string, { accepted: number; rejected: number }> = {};
      for (const [k, v] of this.acceptances) obj[k] = v;
      localStorage.setItem('apex_v13_predictive_feedback', JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  }

  /**
   * Détecte patterns récurrents (séquences action_a → action_b dans temps).
   */
  detectPatterns(uid: string): PatternStats[] {
    const history = this.loadHistory().filter((a) => a.uid === uid);
    if (history.length < MIN_OCCURRENCES_FOR_PATTERN * 2) return [];

    /* Transitions A → B (B exécuté < 5 min après A) */
    const transitions: Record<string, number> = {};
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      if (!prev || !curr) continue;
      if (curr.ts - prev.ts > 5 * 60 * 1000) continue;
      const key = `${prev.action_type}→${curr.action_type}`;
      transitions[key] = (transitions[key] ?? 0) + 1;
    }

    /* Patterns avec >= MIN_OCCURRENCES */
    return Object.entries(transitions)
      .filter(([, count]) => count >= MIN_OCCURRENCES_FOR_PATTERN)
      .map(([pattern, occurrences]) => ({
        pattern,
        occurrences,
        last_seen: Date.now(),
        confidence: Math.min(1, occurrences / 10),
      }))
      .sort((a, b) => b.occurrences - a.occurrences);
  }

  /**
   * Time of day classifier (matin/midi/soir/nuit).
   */
  classifyTime(hour: number = new Date().getHours()): 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'noon';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 23) return 'evening';
    return 'night';
  }

  /**
   * Stats admin dashboard.
   */
  getStats(uid?: string): {
    total_actions: number;
    unique_action_types: number;
    patterns_detected: number;
    feedback_total: { accepted: number; rejected: number };
  } {
    const history = uid ? this.loadHistory().filter((a) => a.uid === uid) : this.loadHistory();
    const types = new Set(history.map((a) => a.action_type));
    const patterns = uid ? this.detectPatterns(uid) : [];
    let acc = 0;
    let rej = 0;
    for (const stats of this.acceptances.values()) {
      acc += stats.accepted;
      rej += stats.rejected;
    }
    return {
      total_actions: history.length,
      unique_action_types: types.size,
      patterns_detected: patterns.length,
      feedback_total: { accepted: acc, rejected: rej },
    };
  }

  /**
   * Reset history (RGPD ou debug).
   */
  reset(uid?: string): void {
    try {
      if (uid) {
        const all = this.loadHistory().filter((a) => a.uid !== uid);
        localStorage.setItem('apex_v13_predictive_history', JSON.stringify(all));
      } else {
        localStorage.removeItem('apex_v13_predictive_history');
        localStorage.removeItem('apex_v13_predictive_feedback');
        this.acceptances.clear();
      }
      void auditLog.record('predictive.reset', { details: { uid: uid ?? 'all' } });
    } catch (err: unknown) {
      logger.warn('predictive-engine', 'reset failed', { err });
    }
  }

  private loadHistory(): UserAction[] {
    try {
      return JSON.parse(localStorage.getItem('apex_v13_predictive_history') ?? '[]') as UserAction[];
    } catch {
      return [];
    }
  }
}

export const predictiveEngine = new PredictiveEngine();
