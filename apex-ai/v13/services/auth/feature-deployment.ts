/**
 * APEX v13 — Feature Deployment (Kevin "boutons admin pour déployer fonctions").
 *
 * Demande Kevin (2026-05-03) :
 * "Boutons admin pour chaque fonction, pour les déployer aux personnes,
 *  outils, indépendamment ou en groupe"
 * "Capacité IA pour clients : mode normal / économique / performance
 *  (admin toujours optimales)"
 *
 * Capabilities :
 * 1. Feature flags par user/groupe (déploiement granulaire)
 * 2. AI Mode : normal/economic/performance/admin_optimal
 * 3. Groups management (family / pro_clients / free_clients)
 * 4. Rollout progressif (10% → 50% → 100%)
 * 5. Kill switch admin (désactiver feature partout instantanément)
 *
 * Anti-pattern Kevin :
 * - Admin Kevin = toujours TOUS features + AI optimal (jamais bloqué)
 * - Audit log obligatoire avant chaque déploiement
 * - Rollback 1-clic en cas de problème
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

export type AiMode = 'admin_optimal' | 'performance' | 'normal' | 'economic';

export type DeploymentScope =
  | { type: 'user'; uid: string }
  | { type: 'group'; group: 'family' | 'pro_clients' | 'free_clients' | 'all' }
  | { type: 'rollout'; pct: number };

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  scope: DeploymentScope;
  created_at: number;
  updated_at: number;
  ai_mode_required?: AiMode; /* Si feature nécessite mode AI minimum */
}

const AI_MODE_CONFIGS: Record<AiMode, { provider: string; model: string; max_tokens: number; temperature: number; description: string }> = {
  admin_optimal: {
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    temperature: 0.7,
    description: 'Kevin admin : Opus 4.8 + max tokens (jamais bloqué)',
  },
  performance: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    temperature: 0.7,
    description: 'Sonnet 4.6 (qualité top)',
  },
  normal: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    temperature: 0.7,
    description: 'Haiku 4.5 (rapide, coût modéré)',
  },
  economic: {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1024,
    temperature: 0.7,
    description: 'Groq Llama 3.3 (très rapide, économique)',
  },
};

class FeatureDeployment {
  /**
   * Enregistre/MAJ un feature flag.
   */
  setFlag(flag: Omit<FeatureFlag, 'created_at' | 'updated_at'>): void {
    try {
      const all = this.listFlags();
      const idx = all.findIndex((f) => f.id === flag.id);
      const now = Date.now();
      const existing = idx >= 0 ? all[idx] : undefined;
      const full: FeatureFlag = {
        ...flag,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
      if (idx >= 0) all[idx] = full;
      else all.push(full);
      localStorage.setItem('apex_v13_feature_flags', JSON.stringify(all));
      void auditLog.record('feature.flag_set', {
        details: { id: flag.id, enabled: flag.enabled, scope: flag.scope },
      });
    } catch (err: unknown) {
      logger.warn('feature-deployment', 'setFlag failed', { err });
    }
  }

  /**
   * Liste tous flags.
   */
  listFlags(): FeatureFlag[] {
    try {
      return JSON.parse(localStorage.getItem('apex_v13_feature_flags') ?? '[]') as FeatureFlag[];
    } catch {
      return [];
    }
  }

  /**
   * Vérifie si feature activée pour user (admin Kevin TOUJOURS true).
   */
  isEnabled(featureId: string, uid: string | null, userTier: string = 'client_free'): boolean {
    /* Admin Kevin : TOUJOURS toutes features (Kevin règle absolue) */
    if (uid === 'kdmc_admin' || userTier === 'admin') return true;

    const all = this.listFlags();
    const flag = all.find((f) => f.id === featureId);
    if (!flag) return false; /* Unknown feature → off */
    if (!flag.enabled) return false;

    /* Scope check */
    return this.checkScope(flag.scope, uid, userTier);
  }

  private checkScope(scope: DeploymentScope, uid: string | null, userTier: string): boolean {
    switch (scope.type) {
      case 'user':
        return uid === scope.uid;
      case 'group': {
        if (scope.group === 'all') return true;
        if (scope.group === 'family') return userTier === 'family';
        if (scope.group === 'pro_clients') return userTier === 'client_pro';
        if (scope.group === 'free_clients') return userTier === 'client_free';
        return false;
      }
      case 'rollout': {
        /* Rollout progressif basé sur hash uid (déterministe pour stickiness) */
        if (!uid) return false;
        const hash = this.hashStringToInt(uid) % 100;
        return hash < scope.pct;
      }
      default:
        return false;
    }
  }

  private hashStringToInt(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  /**
   * Toggle global (enable/disable).
   */
  toggleFlag(featureId: string, enabled: boolean): boolean {
    const all = this.listFlags();
    const idx = all.findIndex((f) => f.id === featureId);
    if (idx < 0) return false;
    const flag = all[idx];
    if (!flag) return false;
    flag.enabled = enabled;
    flag.updated_at = Date.now();
    try {
      localStorage.setItem('apex_v13_feature_flags', JSON.stringify(all));
      void auditLog.record('feature.toggle', { details: { id: featureId, enabled } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * KILL SWITCH : désactive feature pour tous instantanément.
   */
  killSwitch(featureId: string, reason: string): boolean {
    const ok = this.toggleFlag(featureId, false);
    if (ok) {
      void auditLog.record('feature.kill_switch', { details: { id: featureId, reason } });
      logger.warn('feature-deployment', `KILL SWITCH activated: ${featureId} (${reason})`);
    }
    return ok;
  }

  /**
   * Rollout progressif : MAJ pourcentage déploiement.
   */
  setRolloutPct(featureId: string, pct: number): boolean {
    if (pct < 0 || pct > 100) return false;
    const all = this.listFlags();
    const idx = all.findIndex((f) => f.id === featureId);
    if (idx < 0) return false;
    const flag = all[idx];
    if (!flag) return false;
    flag.scope = { type: 'rollout', pct };
    flag.updated_at = Date.now();
    try {
      localStorage.setItem('apex_v13_feature_flags', JSON.stringify(all));
      void auditLog.record('feature.rollout_pct', { details: { id: featureId, pct } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Supprime un feature flag.
   */
  deleteFlag(featureId: string): boolean {
    const all = this.listFlags();
    const filtered = all.filter((f) => f.id !== featureId);
    if (filtered.length === all.length) return false;
    try {
      localStorage.setItem('apex_v13_feature_flags', JSON.stringify(filtered));
      void auditLog.record('feature.flag_deleted', { details: { id: featureId } });
      return true;
    } catch {
      return false;
    }
  }

  /* === AI MODES === */

  /**
   * Mode AI courant pour user.
   * Admin Kevin = TOUJOURS admin_optimal.
   */
  getAiMode(uid: string | null, userTier: string = 'client_free'): AiMode {
    if (uid === 'kdmc_admin' || userTier === 'admin') return 'admin_optimal';

    /* User préférence stockée */
    if (uid) {
      try {
        const pref = localStorage.getItem(`apex_v13_ai_mode_${uid}`) as AiMode | null;
        if (pref && pref in AI_MODE_CONFIGS) return pref;
      } catch {
        /* ignore */
      }
    }

    /* Default par tier */
    if (userTier === 'client_pro' || userTier === 'pro') return 'performance';
    if (userTier === 'family' || userTier === 'laurence') return 'normal';
    return 'economic'; /* free / unknown */
  }

  /**
   * Set AI mode pour user (admin only).
   */
  setAiMode(uid: string, mode: AiMode): boolean {
    if (uid === 'kdmc_admin') {
      logger.warn('feature-deployment', 'Refused setAiMode on admin Kevin (toujours optimal)');
      return false;
    }
    if (!(mode in AI_MODE_CONFIGS)) return false;
    try {
      localStorage.setItem(`apex_v13_ai_mode_${uid}`, mode);
      void auditLog.record('ai_mode.changed', { details: { uid, mode } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Config détaillée d'un mode AI.
   */
  getAiModeConfig(mode: AiMode): typeof AI_MODE_CONFIGS[AiMode] {
    return AI_MODE_CONFIGS[mode];
  }

  /**
   * Liste tous modes (pour UI selector).
   */
  listAiModes(): Array<{ mode: AiMode; config: typeof AI_MODE_CONFIGS[AiMode] }> {
    return (Object.keys(AI_MODE_CONFIGS) as AiMode[]).map((mode) => ({
      mode,
      config: AI_MODE_CONFIGS[mode],
    }));
  }

  /**
   * Stats déploiement (admin dashboard).
   */
  getStats(): {
    total_flags: number;
    enabled_flags: number;
    disabled_flags: number;
    by_scope: Record<string, number>;
  } {
    const all = this.listFlags();
    const enabled = all.filter((f) => f.enabled).length;
    const byScope: Record<string, number> = {};
    for (const f of all) {
      byScope[f.scope.type] = (byScope[f.scope.type] ?? 0) + 1;
    }
    return {
      total_flags: all.length,
      enabled_flags: enabled,
      disabled_flags: all.length - enabled,
      by_scope: byScope,
    };
  }
}

export const featureDeployment = new FeatureDeployment();
