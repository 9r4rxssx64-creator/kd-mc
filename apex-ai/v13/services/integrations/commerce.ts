/**
 * APEX v13 — Service Commerce (commercialisation togglable)
 *
 * Demande Kevin 2026-05-03 :
 * - Tout en place pour commercialiser (paywall, abonnements, marketplace, Stripe)
 * - MAIS Kevin admin n'est JAMAIS bloqué (bypass total)
 * - Toggle admin via vAdminCenter pour activer/désactiver pour les autres users
 * - Permet tests réels en activant pour Laurence + famille avant lancement public
 *
 * Plans prévus (Jet 2 enrichira) :
 * - free       : limite 50 messages/jour, 1 studio
 * - basic 9€   : 500 msg/j, 5 studios, voice basique
 * - pro 29€    : illimité, 15 studios + 8 pro, voice premium
 * - business   : multi-user, marketplace 30%, white-label
 *
 * Kevin admin → bypass illimité tous plans.
 */

import { events } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';

export type Plan = 'free' | 'basic' | 'pro' | 'business' | 'admin';

export interface PlanLimits {
  msgPerDay: number; /* -1 = illimité */
  studios: number;
  voicePremium: boolean;
  marketplaceAccess: boolean;
  whiteLabel: boolean;
}

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { msgPerDay: 50, studios: 1, voicePremium: false, marketplaceAccess: false, whiteLabel: false },
  basic: { msgPerDay: 500, studios: 5, voicePremium: false, marketplaceAccess: false, whiteLabel: false },
  pro: { msgPerDay: -1, studios: 23, voicePremium: true, marketplaceAccess: true, whiteLabel: false },
  business: { msgPerDay: -1, studios: 23, voicePremium: true, marketplaceAccess: true, whiteLabel: true },
  admin: { msgPerDay: -1, studios: 23, voicePremium: true, marketplaceAccess: true, whiteLabel: true },
};

class Commerce {
  /**
   * Active ou désactive globalement le système de commercialisation.
   * - true  : paywall + limites de plan appliqués aux non-admin
   * - false : tout le monde a accès illimité (mode test/famille)
   */
  setEnabled(enabled: boolean): void {
    store.set('commerceEnabled', enabled);
    events.emit('commerce:toggle', { enabled });
    logger.info('commerce', `Commercialisation ${enabled ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`);
  }

  isEnabled(): boolean {
    return store.get('commerceEnabled') === true;
  }

  /**
   * Détermine le plan effectif d'un user.
   * Kevin admin → toujours 'admin' (bypass total, jamais bloqué).
   * Si commerce OFF → tout le monde 'admin' (mode test).
   * Sinon → plan stocké user (default 'free').
   */
  getEffectivePlan(uid: string | null): Plan {
    if (!uid) return 'free';
    const isAdmin = store.get('isAdmin');
    if (isAdmin) return 'admin';
    if (!this.isEnabled()) return 'admin';
    try {
      const raw = localStorage.getItem(`apex_v13_plan_${uid}`);
      if (raw) return raw as Plan;
    } catch {
      /* ignore */
    }
    return 'free';
  }

  setUserPlan(uid: string, plan: Plan): void {
    try {
      localStorage.setItem(`apex_v13_plan_${uid}`, plan);
      logger.info('commerce', `Plan ${plan} attribué à ${uid}`);
    } catch (err: unknown) {
      logger.warn('commerce', 'setUserPlan persist failed', { err });
    }
  }

  getLimits(uid: string | null): PlanLimits {
    return PLAN_LIMITS[this.getEffectivePlan(uid)];
  }

  /**
   * Détails publics des plans (pour landing page commerciale).
   * v13.3.41 (mission INNOVATION-COMM) — Préparation e-Apex commercialisable.
   */
  getPlansForLanding(): ReadonlyArray<{
    id: Plan;
    name: string;
    pricePerMonth: number;
    features: readonly string[];
    cta: string;
    featured?: boolean;
  }> {
    return [
      {
        id: 'free',
        name: 'Free',
        pricePerMonth: 0,
        features: [
          '50 messages IA/jour',
          '1 studio au choix',
          'Voix Web Speech système',
          'Coffre chiffré AES-GCM 256',
          'Mémoire long terme',
        ],
        cta: 'Commencer gratuit',
      },
      {
        id: 'basic',
        name: 'Basic',
        pricePerMonth: 9,
        features: [
          '500 messages IA/jour',
          '5 studios premium',
          'Voix premium (ElevenLabs)',
          'Browser intégré',
          '27 sentinelles auto-fix',
          'Multi-provider failover',
        ],
        cta: 'Choisir Basic',
        featured: true,
      },
      {
        id: 'pro',
        name: 'Pro',
        pricePerMonth: 29,
        features: [
          'Messages IA illimités',
          'Tous studios + 8 pro experts',
          '60 voix premium',
          'API publique',
          'Marketplace plugins',
          'Workflows automatiques',
          'Support prioritaire',
        ],
        cta: 'Choisir Pro',
      },
      {
        id: 'business',
        name: 'Business',
        pricePerMonth: -1, /* sur devis */
        features: [
          'Tout Pro inclus',
          'Multi-user (équipes)',
          'White-label',
          'Marketplace commission 30%',
          'SSO + admin org',
          'SLA 99.9%',
        ],
        cta: 'Nous contacter',
      },
    ];
  }

  /**
   * Gate d'accès feature : retourne true si user peut utiliser, false si paywall à montrer.
   * Admin Kevin → toujours true.
   */
  canAccess(uid: string | null, feature: keyof PlanLimits): boolean {
    const limits = this.getLimits(uid);
    const value = limits[feature];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return true;
  }

  /**
   * Quota messages/jour (compteur reset 24h).
   * Admin → toujours OK.
   */
  consumeMessage(uid: string | null): { allowed: boolean; remaining: number } {
    const limits = this.getLimits(uid);
    if (limits.msgPerDay === -1) return { allowed: true, remaining: -1 };
    if (!uid) return { allowed: false, remaining: 0 };
    const today = new Date().toISOString().slice(0, 10);
    const key = `apex_v13_msgcount_${uid}_${today}`;
    let count = 0;
    try {
      const raw = parseInt(localStorage.getItem(key) ?? '0', 10);
      /* P1 fix integer overflow + clamp 0 ≤ count ≤ limit (anti bypass via gros nombres) */
      count = Math.max(0, Math.min(limits.msgPerDay, isNaN(raw) ? 0 : raw));
    } catch {
      /* ignore */
    }
    if (count >= limits.msgPerDay) return { allowed: false, remaining: 0 };
    count++;
    try {
      localStorage.setItem(key, String(count));
    } catch {
      /* ignore quota */
    }
    return { allowed: true, remaining: limits.msgPerDay - count };
  }
}

export const commerce = new Commerce();
