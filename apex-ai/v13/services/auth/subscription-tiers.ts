/**
 * APEX v13 — Forfaits clients enrichis (Kevin demande "voir ensemble les différents forfaits").
 *
 * Catalogue complet 5 tiers avec features détaillées + addons + pricing :
 *
 * ┌─────────┬──────┬───────────┬──────────┬──────────┬──────────┐
 * │ Plan    │ Prix │ Messages  │ Studios  │ Voix     │ Pubs     │
 * ├─────────┼──────┼───────────┼──────────┼──────────┼──────────┤
 * │ Free    │ 0€   │ 50/jour   │ 1        │ Basique  │ 3/j      │
 * │ Basic   │ 9€   │ 500/jour  │ 5        │ Basique  │ 1/j      │
 * │ Pro     │ 29€  │ Illimité  │ 23       │ Premium  │ 0        │
 * │ Business│ 99€  │ Illimité  │ Tous     │ Premium+ │ 0        │
 * │ Admin   │ -    │ Illimité  │ Tous     │ Premium+ │ 0        │
 * └─────────┴──────┴───────────┴──────────┴──────────┴──────────┘
 *
 * Addons disponibles :
 * - Voix ElevenLabs Premium : +5€/mois
 * - Marketplace agents (revenue share 70/30) : Pro+
 * - White-label embed : Business
 * - Multi-user (5 seats) : Business
 * - Priority support 24/7 : Business
 */

import { commerce, type Plan } from '../integrations/commerce.js';

export interface TierFeatures {
  plan: Plan;
  display_name: string;
  price_monthly_eur: number;
  price_yearly_eur: number;
  daily_message_limit: number;
  studios_count: number | 'all';
  voices_tier: 'basic' | 'premium' | 'premium_plus';
  ads_per_day: number;
  marketplace: boolean;
  white_label: boolean;
  multi_user_seats: number;
  priority_support: boolean;
  api_access: boolean;
  storage_gb: number;
  features_highlights: readonly string[];
}

export interface Addon {
  id: string;
  name: string;
  price_monthly_eur: number;
  description: string;
  available_for: readonly Plan[];
}

const TIERS: readonly TierFeatures[] = [
  {
    plan: 'free',
    display_name: 'Apex Free',
    price_monthly_eur: 0,
    price_yearly_eur: 0,
    daily_message_limit: 50,
    studios_count: 1,
    voices_tier: 'basic',
    ads_per_day: 3,
    marketplace: false,
    white_label: false,
    multi_user_seats: 1,
    priority_support: false,
    api_access: false,
    storage_gb: 0.1, /* 100 MB */
    features_highlights: [
      '50 messages chat/jour',
      '1 studio créatif',
      'Voix basique Web Speech',
      'Mémoire 7 jours',
      'Web search standard',
    ],
  },
  {
    plan: 'basic',
    display_name: 'Apex Basic',
    price_monthly_eur: 9,
    price_yearly_eur: 89, /* -17% annuel */
    daily_message_limit: 500,
    studios_count: 5,
    voices_tier: 'basic',
    ads_per_day: 1,
    marketplace: false,
    white_label: false,
    multi_user_seats: 1,
    priority_support: false,
    api_access: false,
    storage_gb: 1,
    features_highlights: [
      '500 messages chat/jour',
      '5 studios (musique, vidéo, CV, facture, contrat)',
      'Voix basique enrichie (Yoda, Robot, Echo)',
      'Mémoire 30 jours',
      'OCR + QR codes',
      'Web search + scrape',
    ],
  },
  {
    plan: 'pro',
    display_name: 'Apex Pro',
    price_monthly_eur: 29,
    price_yearly_eur: 290, /* -17% annuel = 24€/mois équiv */
    daily_message_limit: -1, /* illimité */
    studios_count: 'all',
    voices_tier: 'premium',
    ads_per_day: 0,
    marketplace: true,
    white_label: false,
    multi_user_seats: 1,
    priority_support: false,
    api_access: true,
    storage_gb: 50,
    features_highlights: [
      'Messages chat ILLIMITÉS',
      '23 studios créatifs (15 + 8 pro modules)',
      'Voix Premium ElevenLabs (50+)',
      'Mémoire ILLIMITÉE',
      'Vision IA (Claude/GPT-4o)',
      'Tous outils API (130+ patterns)',
      'Marketplace agents (70% revenue share)',
      'Multi-LLM consensus voting',
      'API access (1000 req/jour)',
    ],
  },
  {
    plan: 'business',
    display_name: 'Apex Business',
    price_monthly_eur: 99,
    price_yearly_eur: 990,
    daily_message_limit: -1,
    studios_count: 'all',
    voices_tier: 'premium_plus',
    ads_per_day: 0,
    marketplace: true,
    white_label: true,
    multi_user_seats: 5,
    priority_support: true,
    api_access: true,
    storage_gb: 500,
    features_highlights: [
      'Tout Pro inclus',
      '5 utilisateurs (équipe)',
      'White-label embed (logo + domaine)',
      'Voix Premium+ (clone vocal personnalisé)',
      'API access ILLIMITÉ',
      'Priority support 24/7',
      'Custom AI tools dédiés',
      'Onboarding pro inclus',
      '500 GB stockage',
      'SLA 99.9%',
    ],
  },
  {
    plan: 'admin',
    display_name: 'Apex Admin (Kevin)',
    price_monthly_eur: 0,
    price_yearly_eur: 0,
    daily_message_limit: -1,
    studios_count: 'all',
    voices_tier: 'premium_plus',
    ads_per_day: 0,
    marketplace: true,
    white_label: true,
    multi_user_seats: 999,
    priority_support: true,
    api_access: true,
    storage_gb: 9999,
    features_highlights: [
      'Bypass total règles externes (RGPD strict, audit corp)',
      'Accès admin tous projets Kevin',
      'Subagents internes Apex',
      'Auto-modification code',
      'Tous tools Apex IA',
      'Audit log immutable',
      'Sentinelles 24/7 contrôle',
    ],
  },
];

const ADDONS: readonly Addon[] = [
  {
    id: 'voice_elevenlabs_premium',
    name: 'Voix ElevenLabs Premium',
    price_monthly_eur: 5,
    description: '50+ voix réalistes thématiques (Yoda, Vador, Mickey...)',
    available_for: ['basic', 'pro'],
  },
  {
    id: 'storage_extra_100gb',
    name: 'Stockage +100 GB',
    price_monthly_eur: 3,
    description: 'Espace supplémentaire pour vault + IDB shadow',
    available_for: ['basic', 'pro'],
  },
  {
    id: 'multi_user_extra_seat',
    name: 'Siège utilisateur supplémentaire',
    price_monthly_eur: 15,
    description: 'Ajout 1 user Business plan',
    available_for: ['business'],
  },
  {
    id: 'api_access_unlimited',
    name: 'API access illimité',
    price_monthly_eur: 19,
    description: 'Pas de rate limit sur API access',
    available_for: ['pro'],
  },
  {
    id: 'custom_voice_clone',
    name: 'Clone vocal personnalisé',
    price_monthly_eur: 49,
    description: 'Reproduction voix custom via ElevenLabs (TOS respect)',
    available_for: ['pro', 'business'],
  },
];

class SubscriptionTiers {
  /**
   * Liste tous les forfaits (sauf admin qui est interne).
   */
  listPublic(): readonly TierFeatures[] {
    return TIERS.filter((t) => t.plan !== 'admin');
  }

  listAll(): readonly TierFeatures[] {
    return TIERS;
  }

  getByPlan(plan: Plan): TierFeatures | null {
    return TIERS.find((t) => t.plan === plan) ?? null;
  }

  /**
   * Forfait actuel d'un user.
   */
  getCurrentTier(uid: string | null): TierFeatures {
    const plan = commerce.getEffectivePlan(uid);
    const fallback = TIERS[0];
    if (!fallback) throw new Error('TIERS registry empty');
    return this.getByPlan(plan) ?? fallback;
  }

  /**
   * Tier supérieur recommandé (pour upgrade prompt).
   */
  getNextUpgrade(currentPlan: Plan): TierFeatures | null {
    const order: Plan[] = ['free', 'basic', 'pro', 'business'];
    const currentIdx = order.indexOf(currentPlan);
    if (currentIdx < 0 || currentIdx >= order.length - 1) return null;
    const nextPlan = order[currentIdx + 1];
    if (!nextPlan) return null;
    return this.getByPlan(nextPlan);
  }

  /**
   * Liste addons compatibles avec le forfait actuel.
   */
  listAddonsFor(plan: Plan): readonly Addon[] {
    return ADDONS.filter((a) => a.available_for.includes(plan));
  }

  /**
   * Total mensuel user (forfait + addons sélectionnés).
   */
  calculateMonthlyTotal(plan: Plan, addonIds: readonly string[] = []): number {
    const tier = this.getByPlan(plan);
    const baseCost = tier?.price_monthly_eur ?? 0;
    const addonCost = ADDONS.filter((a) => addonIds.includes(a.id)).reduce(
      (s, a) => s + a.price_monthly_eur,
      0,
    );
    return baseCost + addonCost;
  }

  /**
   * Économie annuelle vs mensuel.
   */
  getYearlySavings(plan: Plan): { monthly_total: number; yearly_total: number; savings: number; pct: number } {
    const tier = this.getByPlan(plan);
    if (!tier || tier.price_monthly_eur === 0) {
      return { monthly_total: 0, yearly_total: 0, savings: 0, pct: 0 };
    }
    const monthlyTotal = tier.price_monthly_eur * 12;
    const savings = monthlyTotal - tier.price_yearly_eur;
    const pct = Math.round((savings / monthlyTotal) * 100);
    return {
      monthly_total: monthlyTotal,
      yearly_total: tier.price_yearly_eur,
      savings,
      pct,
    };
  }

  /**
   * Check si feature accessible pour plan donné.
   */
  hasFeature(plan: Plan, feature: 'voices_premium' | 'marketplace' | 'white_label' | 'priority_support' | 'api_access' | 'unlimited_messages'): boolean {
    const tier = this.getByPlan(plan);
    if (!tier) return false;
    switch (feature) {
      case 'voices_premium':
        return tier.voices_tier !== 'basic';
      case 'marketplace':
        return tier.marketplace;
      case 'white_label':
        return tier.white_label;
      case 'priority_support':
        return tier.priority_support;
      case 'api_access':
        return tier.api_access;
      case 'unlimited_messages':
        return tier.daily_message_limit === -1;
      default:
        return false;
    }
  }

  /**
   * Format pour UI page pricing publique.
   */
  formatForPricingPage(): Array<{
    plan: string;
    name: string;
    price: string;
    yearly_price: string;
    yearly_savings: string;
    features: readonly string[];
    cta_label: string;
    badge?: string;
  }> {
    return this.listPublic().map((t) => {
      const savings = this.getYearlySavings(t.plan);
      const result: {
        plan: string;
        name: string;
        price: string;
        yearly_price: string;
        yearly_savings: string;
        features: readonly string[];
        cta_label: string;
        badge?: string;
      } = {
        plan: t.plan,
        name: t.display_name,
        price: t.price_monthly_eur === 0 ? 'Gratuit' : `${t.price_monthly_eur}€/mois`,
        yearly_price: t.price_yearly_eur === 0 ? '—' : `${t.price_yearly_eur}€/an`,
        yearly_savings: savings.pct > 0 ? `Économie ${savings.pct}%` : '',
        features: t.features_highlights,
        cta_label: t.plan === 'free' ? 'Commencer gratuit' : t.plan === 'business' ? 'Contacter ventes' : 'Choisir ce plan',
      };
      if (t.plan === 'pro') result.badge = 'Plus populaire';
      return result;
    });
  }
}

export const subscriptionTiers = new SubscriptionTiers();
