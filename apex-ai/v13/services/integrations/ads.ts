/**
 * APEX v13 — Système publicités contextuelles (monétisation tier free).
 *
 * Demande Kevin (2026-05-03) : "Est-ce que tu as prévu les publicités, les choses comme ça"
 *
 * Stratégie publicités RESPONSABLES :
 * - Tier admin (Kevin) : ZÉRO pub jamais
 * - Tier laurence/family : ZÉRO pub jamais
 * - Tier client_pro (29€/mois) : ZÉRO pub
 * - Tier client_basic (9€/mois) : pubs natives discrètes (max 1 par session)
 * - Tier client_free : pubs intégrées contextuelles (max 3 par jour)
 *
 * Anti-pattern :
 * - Pas de pubs intrusives (pop-ups, autoplay vidéo)
 * - Pas de tracking cross-site (GDPR-compliant)
 * - Privacy-first : ad serving via own backend (pas Google AdSense)
 * - Skippable après 5s
 * - User peut désactiver dans Settings (mais perd tier free → upgrade prompt)
 *
 * Format pubs :
 * - Native cards dans flow chat
 * - Contextuelles (relevant à la conversation)
 * - Sponsored content marqué clairement
 */

import { logger } from '../../core/logger.js';

import { commerce } from './commerce.js';

export interface AdSlot {
  id: string;
  position: 'chat_inline' | 'chat_footer' | 'studio_corner' | 'admin_banner';
  content_type: 'sponsored' | 'house' | 'partner';
  title: string;
  description: string;
  cta_label: string;
  cta_url: string;
  image_url?: string;
  shown_count: number;
  click_count: number;
  ts_created: number;
}

export interface AdImpression {
  ad_id: string;
  user_id: string;
  position: AdSlot['position'];
  ts: number;
  clicked?: boolean;
}

const HOUSE_ADS: ReadonlyArray<Omit<AdSlot, 'shown_count' | 'click_count' | 'ts_created'>> = [
  {
    id: 'apex_pro_upgrade',
    position: 'chat_footer',
    content_type: 'house',
    title: 'Passe en Apex Pro',
    description: '500 messages/jour → illimité, 23 studios, voix premium, marketplace',
    cta_label: 'Découvrir',
    cta_url: '#settings/billing',
  },
  {
    id: 'apex_voice_premium',
    position: 'studio_corner',
    content_type: 'house',
    title: '🎙 Voix premium ElevenLabs',
    description: '50+ voix réalistes thématiques (Yoda, Vador, Mickey...)',
    cta_label: 'Activer',
    cta_url: '#settings/voices',
  },
  {
    id: 'apex_studios_pro',
    position: 'chat_inline',
    content_type: 'house',
    title: '🎬 Studios créatifs (15)',
    description: 'Musique, vidéo, CV, archi, médical, juridique...',
    cta_label: 'Explorer',
    cta_url: '#studios',
  },
  /* Cross-promotion Apex Chat standalone → Apex AI complet
   * (Kevin demande : "Dans Apex Chat il y aura une pub pour Apex AI") */
  {
    id: 'apex_ai_full_promo',
    position: 'chat_inline',
    content_type: 'house',
    title: '🚀 Découvre Apex AI complet',
    description: 'Studios créatifs, voix premium, modules pro (médical, juridique, finance), orchestrateur multi-projets',
    cta_label: 'Essayer Apex AI',
    cta_url: 'https://apex-ai.kd-mc.com/',
  },
  {
    id: 'apex_ai_pro_features',
    position: 'chat_footer',
    content_type: 'house',
    title: '✨ Apex AI Pro vs Chat Standalone',
    description: 'Mémoire illimitée, 42 outils IA, 25 capabilities, vision IA, marketplace agents',
    cta_label: 'Voir les plans',
    cta_url: 'https://apex-ai.kd-mc.com/#pricing',
  },
];

class AdsService {
  /**
   * Détermine si l'utilisateur doit voir des pubs (tier-based).
   */
  shouldShowAds(uid: string | null): boolean {
    if (!uid) return false;
    const plan = commerce.getEffectivePlan(uid);
    /* Pubs uniquement free et basic, jamais pro/business/admin */
    return plan === 'free' || plan === 'basic';
  }

  /**
   * Frequency cap par jour selon tier.
   */
  getDailyCap(uid: string | null): number {
    if (!uid) return 0;
    const plan = commerce.getEffectivePlan(uid);
    if (plan === 'free') return 3;
    if (plan === 'basic') return 1; /* max 1 par jour pour basic */
    return 0; /* pro/business/admin : 0 */
  }

  /**
   * Récupère le prochain ad slot disponible pour user (rotation).
   */
  getNextAd(uid: string, position: AdSlot['position']): AdSlot | null {
    if (!this.shouldShowAds(uid)) return null;
    const cap = this.getDailyCap(uid);
    const todayShown = this.countShownToday(uid);
    if (todayShown >= cap) return null;

    /* Rotation : prendre le moins shown récemment */
    const candidates = HOUSE_ADS.filter((a) => a.position === position);
    if (candidates.length === 0) return null;
    const stats = this.getAdStats();
    const ranked = [...candidates].sort((a, b) => {
      const aShown = stats[a.id]?.shown_count ?? 0;
      const bShown = stats[b.id]?.shown_count ?? 0;
      return aShown - bShown;
    });
    const chosen = ranked[0];
    if (!chosen) return null;
    return {
      ...chosen,
      shown_count: stats[chosen.id]?.shown_count ?? 0,
      click_count: stats[chosen.id]?.click_count ?? 0,
      ts_created: Date.now(),
    };
  }

  /**
   * Track impression (ad shown to user).
   */
  recordImpression(adId: string, uid: string, position: AdSlot['position']): void {
    try {
      const impressions = this.loadImpressions();
      impressions.push({ ad_id: adId, user_id: uid, position, ts: Date.now() });
      const trimmed = impressions.length > 1000 ? impressions.slice(-1000) : impressions;
      localStorage.setItem('apex_v13_ad_impressions', JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('ads', 'recordImpression persist failed', { err });
    }
  }

  /**
   * Track click sur pub.
   */
  recordClick(adId: string, uid: string): void {
    try {
      const impressions = this.loadImpressions();
      /* Marque le dernier impression de cet ad pour ce user */
      for (let i = impressions.length - 1; i >= 0; i--) {
        const imp = impressions[i];
        if (imp && imp.ad_id === adId && imp.user_id === uid && !imp.clicked) {
          imp.clicked = true;
          break;
        }
      }
      localStorage.setItem('apex_v13_ad_impressions', JSON.stringify(impressions));
    } catch (err: unknown) {
      logger.warn('ads', 'recordClick persist failed', { err });
    }
  }

  /**
   * Stats ads (admin dashboard).
   */
  getAdStats(): Record<string, { shown_count: number; click_count: number; ctr: number }> {
    const impressions = this.loadImpressions();
    const stats: Record<string, { shown_count: number; click_count: number; ctr: number }> = {};
    for (const imp of impressions) {
      const entry = stats[imp.ad_id] ?? { shown_count: 0, click_count: 0, ctr: 0 };
      entry.shown_count++;
      if (imp.clicked) entry.click_count++;
      stats[imp.ad_id] = entry;
    }
    /* Calcul CTR */
    for (const id in stats) {
      const s = stats[id];
      if (!s) continue;
      s.ctr = s.shown_count > 0 ? Math.round((s.click_count / s.shown_count) * 1000) / 10 : 0;
    }
    return stats;
  }

  /**
   * Compte impressions pour user aujourd'hui (frequency cap check).
   */
  private countShownToday(uid: string): number {
    const impressions = this.loadImpressions();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    return impressions.filter((i) => i.user_id === uid && i.ts >= todayStart).length;
  }

  private loadImpressions(): AdImpression[] {
    try {
      return JSON.parse(localStorage.getItem('apex_v13_ad_impressions') ?? '[]') as AdImpression[];
    } catch {
      return [];
    }
  }

  /**
   * Reset impressions (admin only, debug).
   */
  reset(): void {
    try {
      localStorage.removeItem('apex_v13_ad_impressions');
    } catch {
      /* ignore */
    }
  }
}

export const ads = new AdsService();
