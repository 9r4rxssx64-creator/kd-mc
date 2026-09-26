/**
 * APEX v13 — Permissions tiered (5 niveaux)
 *
 * Préservé de v12.785 (règle CLAUDE.md "compte admin unique Kevin + permissions tiered Laurence") :
 * - admin       : Kevin (DK) — tout autorisé (bypass commerce + permissions)
 * - laurence    : Laurence — vue isolée + permissions tiered (auto/notify/validate)
 * - family      : Famille Kevin — accès étendu sans admin
 * - client_pro  : Clients payants pro — features pro + studios premium
 * - client_free : Clients gratuits — features de base
 */

import { store } from '../../core/store.js';

export type Tier = 'admin' | 'laurence' | 'family' | 'client_pro' | 'client_free';

export type PermissionLevel = 'auto' | 'notify' | 'validate' | 'denied';

interface ActionPermissions {
  admin: PermissionLevel;
  laurence: PermissionLevel;
  family: PermissionLevel;
  client_pro: PermissionLevel;
  client_free: PermissionLevel;
}

/* Whitelist actions (auto = fait sans demander, notify = fait + push admin, validate = bloqué tant que admin pas validé)
 * Règle CLAUDE.md ABSOLUE 2026-05-03 : Kevin + Laurence + famille = AUCUNE règle externe.
 * → laurence/family : auto sur la quasi-totalité des actions. notify/validate UNIQUEMENT
 *   pour actions hautement destructives (erase_account, purchase_above_50). */
const ACTIONS: Record<string, ActionPermissions> = {
  /* Niveau A — auto pour TOUS sauf si features admin */
  read_self: { admin: 'auto', laurence: 'auto', family: 'auto', client_pro: 'auto', client_free: 'auto' },
  edit_profile: { admin: 'auto', laurence: 'auto', family: 'auto', client_pro: 'auto', client_free: 'auto' },
  chat: { admin: 'auto', laurence: 'auto', family: 'auto', client_pro: 'auto', client_free: 'auto' },
  use_studios: { admin: 'auto', laurence: 'auto', family: 'auto', client_pro: 'auto', client_free: 'denied' },
  ai_query: { admin: 'auto', laurence: 'auto', family: 'auto', client_pro: 'auto', client_free: 'auto' },
  voice: { admin: 'auto', laurence: 'auto', family: 'auto', client_pro: 'auto', client_free: 'denied' },
  beta_features: { admin: 'auto', laurence: 'auto', family: 'auto', client_pro: 'auto', client_free: 'denied' },
  upload_large: { admin: 'auto', laurence: 'auto', family: 'auto', client_pro: 'auto', client_free: 'denied' },
  export_data: { admin: 'auto', laurence: 'auto', family: 'auto', client_pro: 'auto', client_free: 'validate' },
  change_email: { admin: 'auto', laurence: 'auto', family: 'auto', client_pro: 'auto', client_free: 'validate' },

  /* Niveau B — notify Kevin (info, pas blocage) */
  login: { admin: 'auto', laurence: 'notify', family: 'notify', client_pro: 'notify', client_free: 'notify' },

  /* Niveau C — validate Kevin (BLOQUE seulement pour clients externes) */
  erase_account: { admin: 'auto', laurence: 'validate', family: 'validate', client_pro: 'validate', client_free: 'validate' },
  purchase_above_50: { admin: 'auto', laurence: 'auto', family: 'auto', client_pro: 'auto', client_free: 'validate' },

  /* Admin only — toi seul (sécurité Kevin) */
  admin_view: { admin: 'auto', laurence: 'denied', family: 'denied', client_pro: 'denied', client_free: 'denied' },
  toggle_commerce: { admin: 'auto', laurence: 'denied', family: 'denied', client_pro: 'denied', client_free: 'denied' },
  edit_other_users: { admin: 'auto', laurence: 'denied', family: 'denied', client_pro: 'denied', client_free: 'denied' },
};

class Permissions {
  getTier(): Tier {
    const user = store.get('user');
    if (!user) return 'client_free';
    if (user.id === 'kdmc_admin') return 'admin';
    if (user.id === 'laurence_sp') return 'laurence';
    /* Détection family/pro/free via plan stocké */
    try {
      const tier = localStorage.getItem(`apex_v13_tier_${user.id}`) as Tier | null;
      if (tier) return tier;
    } catch {
      /* ignore */
    }
    return 'client_free';
  }

  check(action: string): PermissionLevel {
    const tier = this.getTier();
    const def = ACTIONS[action];
    if (!def) return 'auto'; /* action inconnue = auto par défaut, à durcir Jet 3 */
    return def[tier];
  }

  isAllowed(action: string): boolean {
    return this.check(action) !== 'denied';
  }

  setTier(uid: string, tier: Tier): void {
    try {
      localStorage.setItem(`apex_v13_tier_${uid}`, tier);
    } catch {
      /* ignore */
    }
  }
}

export const permissions = new Permissions();
