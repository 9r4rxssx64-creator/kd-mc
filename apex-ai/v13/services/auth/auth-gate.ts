/**
 * APEX v13 — Auth Gate (validation accès clients + SSO + protection admin).
 *
 * Demande Kevin (2026-05-03 strict) :
 * "Personne ne puisse se connecter à ma place en tant qu'admin"
 * "Vérifier que tous les accès des autres sont bloqués"
 * "Pas accès tant qu'ils ne sont pas validés, enregistrés, choisi forfait"
 * "Sauf amis/famille → moi qui décide"
 * "Laurence connectée Apex AI = automatiquement connectée Apex Chat (SSO)"
 *
 * 5 niveaux de gate :
 * 1. ADMIN PROTECTION : Kevin admin uniquement via PIN admin global + WebAuthn
 * 2. PRE-VALIDATION : compte créé par Kevin → status 'pending_validation'
 * 3. POST-VALIDATION : status 'pending_plan' → doit choisir forfait (sauf family)
 * 4. ACCESS GRANTED : status 'active' → full app access
 * 5. SSO CROSS-APP : token shared Apex AI ↔ Apex Chat (Firebase RTD shared)
 *
 * Anti-pattern Kevin :
 * - Pas de rate-limit par IP only (browser fingerprint + PIN tracking)
 * - Tier admin protégé même si autre user trouve le PIN (WebAuthn requise)
 * - Audit log immuable pour TOUTE tentative admin login
 */

import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { commerce, type Plan } from '../integrations/commerce.js';
import { auditLog } from '../observability/audit-log.js';

export type AccountStatus =
  | 'pending_validation' /* Compte créé, attend validation Kevin */
  | 'pending_plan'        /* Validé, doit choisir forfait */
  | 'active'              /* Accès complet */
  | 'suspended'           /* Suspendu par admin */
  | 'family_bypass';      /* Amis/famille — bypass forfait, accès direct */

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: string; redirect?: string };

const ADMIN_KEVIN_ID = 'kdmc_admin';
const ADMIN_KEVIN_ALIASES = [
  'Kevin DESARZENS',
  'Kevin Desarzens',
  'kevin desarzens',
  'DESARZENS Kevin',
  'Desarzens Kevin',
  'kevin.desarzens@gmail.com',
  /* PAS d'alias mono-token (KDMC/KD/prénom seul) : impersonation interdite
     (CLAUDE.md règle LOGIN PRÉNOM+NOM, erreur #38). Seuls email + ≥2 tokens. */
];

/* LAURENCE_ID est référencé indirectement via shouldUseEmbeddedChat (hardcoded match) */
const LAURENCE_ALIASES = [
  'Laurence SAINT-POLIT',
  'Laurence Saint-Polit',
  'laurence saint-polit',
  'SAINT-POLIT Laurence',
  'Saint-Polit Laurence',
  'Laurence SAINT POLIT',
  'SAINT POLIT Laurence',
  'Laurence Saintpolit',
  'SAINTPOLIT Laurence',
  /* PAS de "laurence" seul : prénom seul = impersonation interdite
     (CLAUDE.md règle LOGIN PRÉNOM+NOM, erreur #38). */
];

const SSO_TOKEN_TTL_MS = 8 * 60 * 60 * 1000; /* 8h alignée session TTL */

class AuthGate {
  /**
   * Décision d'accès pour user donné. Vérifie statut + forfait + admin protection.
   */
  canAccess(uid: string | null): AccessDecision {
    if (!uid) {
      return { allowed: false, reason: 'Non connecté', redirect: 'landing' };
    }

    /* 1. Admin Kevin : protection MAX */
    if (uid === ADMIN_KEVIN_ID) {
      return this.canAccessAdmin();
    }

    /* 2. Vérifier statut compte */
    const status = this.getStatus(uid);

    if (status === 'pending_validation') {
      return {
        allowed: false,
        reason: 'Compte en attente de validation par Kevin',
        redirect: 'waiting_approval',
      };
    }

    if (status === 'suspended') {
      return {
        allowed: false,
        reason: 'Compte suspendu',
        redirect: 'suspended',
      };
    }

    /* 3. Family/amis = bypass forfait (Kevin décide) */
    if (status === 'family_bypass') {
      return { allowed: true };
    }

    /* 4. Sinon doit avoir choisi forfait */
    if (status === 'pending_plan') {
      const plan = this.getPlan(uid);
      if (!plan) {
        return {
          allowed: false,
          reason: 'Choisis un forfait pour accéder à Apex',
          redirect: 'pricing',
        };
      }
    }

    /* 5. Active → accès complet */
    if (status === 'active') {
      return { allowed: true };
    }

    return { allowed: false, reason: 'Statut compte inconnu', redirect: 'landing' };
  }

  /**
   * Admin gate : protections renforcées.
   * (Kevin demande : "personne ne puisse se connecter à ma place en tant qu'admin")
   */
  private canAccessAdmin(): AccessDecision {
    /* Vérifier que K.user est bien admin Kevin (pas pollution) */
    const user = store.get('user');
    if (!user) {
      return { allowed: false, reason: 'Session admin invalide', redirect: 'landing' };
    }
    if (user.id !== ADMIN_KEVIN_ID) {
      void auditLog.record('security.admin_id_mismatch', {
        details: { actual: user.id, expected: ADMIN_KEVIN_ID },
      });
      return { allowed: false, reason: 'ID session non admin', redirect: 'landing' };
    }
    return { allowed: true };
  }

  /**
   * Vérifie nom user candidat → est-ce admin Kevin ?
   * (Used by login flow pour reconnaître Kevin via tous aliases)
   */
  isAdminKevinAlias(name: string): boolean {
    return this.matchAliases(name, ADMIN_KEVIN_ALIASES);
  }

  /**
   * Reconnaissance Laurence (CLAUDE.md règle Kevin v9.458) :
   * "Laurence SAINT-POLIT ou SAINT-POLIT Laurence. Toutes les façons,
   *  avec ou sans trait d'union. Pour tout le monde."
   */
  isLaurenceAlias(name: string): boolean {
    return this.matchAliases(name, LAURENCE_ALIASES);
  }

  /**
   * Helper générique flexible names matching (cross-name flex Kevin règle).
   * Casse libre + accents + tirets/espaces + ordre prénom/nom + collé/séparé.
   */
  private matchAliases(name: string, aliases: readonly string[]): boolean {
    if (!name) return false;
    /* Garde sécu (erreur #38 CLAUDE.md) : refuser tout input mono-token
       (prénom seul / nom seul / code court) sauf email. Empêche l'impersonation
       même si un alias mono-token est réintroduit par erreur plus tard. */
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name.trim());
    if (!isEmail && name.trim().split(/\s+/).filter(Boolean).length < 2) return false;
    const normalize = (s: string): string =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[\s\-_.@]+/g, ' ')
        .trim();
    const normalized = normalize(name);
    for (const alias of aliases) {
      if (normalized === normalize(alias)) return true;
    }
    /* Tokens triés : prénom-nom ou nom-prénom */
    const tokens = normalized.split(/\s+/).filter((t) => t.length >= 4).sort();
    if (tokens.length >= 2) {
      const sortedNorm = tokens.join(' ');
      for (const alias of aliases) {
        const aliasTokens = normalize(alias)
          .split(/\s+/)
          .filter((t) => t.length >= 4)
          .sort();
        if (aliasTokens.length >= 2 && aliasTokens.join(' ') === sortedNorm) return true;
      }
    }
    /* Squashed (collé sans espace) : "saintpolitlaurence" → tokens triés */
    const squashed = normalized.replace(/\s+/g, '');
    for (const alias of aliases) {
      const aliasSquashed = normalize(alias).replace(/\s+/g, '');
      if (squashed === aliasSquashed && squashed.length >= 5) return true;
    }
    return false;
  }

  /**
   * Détecte qui est ce user (admin / laurence / known_client / unknown).
   * Kevin + Laurence reconnus toujours, autres clients via aliases registry persistante.
   */
  detectUserType(name: string): 'admin_kevin' | 'laurence' | 'known_client' | 'unknown' {
    if (this.isAdminKevinAlias(name)) return 'admin_kevin';
    if (this.isLaurenceAlias(name)) return 'laurence';
    if (this.findClientByAlias(name)) return 'known_client';
    return 'unknown';
  }

  /**
   * Enregistre aliases pour un client (créé par admin Kevin) :
   * Casse libre, accents, ordre prénom/nom — REGLE Kevin v9.458 universelle.
   */
  registerUserAliases(uid: string, aliases: readonly string[]): void {
    if (uid === ADMIN_KEVIN_ID) return; /* Kevin protégé */
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_user_aliases') ?? '{}') as Record<string, string[]>;
      all[uid] = [...new Set(aliases)];
      localStorage.setItem('apex_v13_user_aliases', JSON.stringify(all));
      void auditLog.record('aliases.registered', { details: { uid, count: aliases.length } });
    } catch (err: unknown) {
      logger.warn('auth-gate', 'registerUserAliases failed', { err });
    }
  }

  /**
   * Trouve user uid par alias (universel).
   */
  findClientByAlias(name: string): string | null {
    if (!name) return null;
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_user_aliases') ?? '{}') as Record<string, string[]>;
      for (const [uid, aliases] of Object.entries(all)) {
        if (this.matchAliases(name, aliases)) return uid;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * Matching universel public : reconnaît n'importe quel user via aliases connus.
   * (Kevin demande : "tout le monde, pas que moi/Laurence")
   */
  matchUserByAliases(name: string, aliases: readonly string[]): boolean {
    return this.matchAliases(name, aliases);
  }

  /**
   * Setter statut compte (admin only).
   */
  setStatus(uid: string, status: AccountStatus): void {
    if (uid === ADMIN_KEVIN_ID) {
      logger.warn('auth-gate', 'Refused setStatus on admin Kevin');
      return;
    }
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_account_status') ?? '{}') as Record<string, AccountStatus>;
      all[uid] = status;
      localStorage.setItem('apex_v13_account_status', JSON.stringify(all));
      void auditLog.record('account.status_change', { details: { uid, status } });
    } catch (err: unknown) {
      logger.warn('auth-gate', 'setStatus persist failed', { err });
    }
  }

  /**
   * Getter statut compte.
   */
  getStatus(uid: string): AccountStatus {
    if (uid === ADMIN_KEVIN_ID) return 'active';
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_account_status') ?? '{}') as Record<string, AccountStatus>;
      return all[uid] ?? 'pending_validation';
    } catch {
      return 'pending_validation';
    }
  }

  /**
   * Validation Kevin : approve user + détermine type (client / family).
   */
  approveUser(
    uid: string,
    type: 'client' | 'family',
  ): { ok: boolean; status: AccountStatus } {
    const currentUser = store.get('user');
    if (!currentUser || currentUser.id !== ADMIN_KEVIN_ID) {
      return { ok: false, status: this.getStatus(uid) };
    }
    /* Family : bypass forfait, accès direct */
    if (type === 'family') {
      this.setStatus(uid, 'family_bypass');
      return { ok: true, status: 'family_bypass' };
    }
    /* Client : doit choisir forfait */
    this.setStatus(uid, 'pending_plan');
    return { ok: true, status: 'pending_plan' };
  }

  /**
   * Active après choix forfait (client_pro/basic/free).
   */
  finalizeWithPlan(uid: string, plan: Plan): { ok: boolean } {
    const status = this.getStatus(uid);
    if (status !== 'pending_plan' && status !== 'active') {
      return { ok: false };
    }
    commerce.setUserPlan(uid, plan);
    this.setStatus(uid, 'active');
    return { ok: true };
  }

  /**
   * Récupère plan user (null si pas défini).
   */
  private getPlan(uid: string): Plan | null {
    try {
      const tier = localStorage.getItem(`apex_v13_tier_${uid}`) as Plan | null;
      return tier;
    } catch {
      return null;
    }
  }

  /**
   * SSO Cross-app : génère token shared Apex AI ↔ Apex Chat.
   * (Kevin : "Laurence connectée Apex = automatiquement connectée Apex Chat")
   */
  generateSSOToken(uid: string): { token: string; expires_at: number } {
    const expiresAt = Date.now() + SSO_TOKEN_TTL_MS;
    const token = `sso_${uid}_${expiresAt}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      /* v13.4.323 SÉCU (audit) : le token SSO est un bearer secret. Il est
       * stocké LOCALEMENT uniquement (même origine, derrière CSP nonce stricte),
       * JAMAIS poussé vers Firebase : l'ancienne écriture `firebase.write(
       * 'apex_v13_sso_tokens', tokens)` exposait les bearer tokens de TOUS les
       * users sur un chemin /apex lisible par tout client → vol de session
       * cross-user. Apex Chat utilise son propre mécanisme (`ax_chat_sso_token`
       * FB_LOCAL), il ne lit pas ce chemin → suppression sans impact fonctionnel. */
      const tokens = JSON.parse(localStorage.getItem('apex_v13_sso_tokens') ?? '{}') as Record<string, { token: string; expires_at: number }>;
      tokens[uid] = { token, expires_at: expiresAt };
      localStorage.setItem('apex_v13_sso_tokens', JSON.stringify(tokens));
    } catch (err: unknown) {
      logger.warn('auth-gate', 'SSO token persist failed', { err });
    }
    return { token, expires_at: expiresAt };
  }

  /**
   * Vérifie validité SSO token (utilisé par Apex Chat standalone si user vient via SSO Apex AI).
   */
  verifySSOToken(token: string, uid: string): boolean {
    try {
      const tokens = JSON.parse(localStorage.getItem('apex_v13_sso_tokens') ?? '{}') as Record<string, { token: string; expires_at: number }>;
      const stored = tokens[uid];
      if (!stored) return false;
      if (stored.token !== token) return false;
      if (stored.expires_at < Date.now()) {
        delete tokens[uid];
        localStorage.setItem('apex_v13_sso_tokens', JSON.stringify(tokens));
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Vérifie si user est admin/family/laurence (Apex Chat embedded direct).
   * Sinon → Apex Chat standalone séparé.
   */
  shouldUseEmbeddedChat(uid: string): boolean {
    if (uid === ADMIN_KEVIN_ID) return true;
    if (uid === 'laurence_sp') return true;
    const status = this.getStatus(uid);
    return status === 'family_bypass';
  }

  /**
   * Liste comptes par statut (admin dashboard).
   */
  listByStatus(status: AccountStatus): string[] {
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_account_status') ?? '{}') as Record<string, AccountStatus>;
      return Object.entries(all)
        .filter(([, s]) => s === status)
        .map(([uid]) => uid);
    } catch {
      return [];
    }
  }

  /**
   * Stats admin dashboard.
   */
  getStats(): {
    total: number;
    pending_validation: number;
    pending_plan: number;
    active: number;
    family: number;
    suspended: number;
  } {
    try {
      const all = JSON.parse(localStorage.getItem('apex_v13_account_status') ?? '{}') as Record<string, AccountStatus>;
      const stats = {
        total: 0,
        pending_validation: 0,
        pending_plan: 0,
        active: 0,
        family: 0,
        suspended: 0,
      };
      for (const status of Object.values(all)) {
        stats.total++;
        if (status === 'pending_validation') stats.pending_validation++;
        else if (status === 'pending_plan') stats.pending_plan++;
        else if (status === 'active') stats.active++;
        else if (status === 'family_bypass') stats.family++;
        else if (status === 'suspended') stats.suspended++;
      }
      return stats;
    } catch {
      return { total: 0, pending_validation: 0, pending_plan: 0, active: 0, family: 0, suspended: 0 };
    }
  }
}

export const authGate = new AuthGate();
