/**
 * Tests auth-gate.ts (Kevin "personne ne se connecte à ma place + clients pas accès sans forfait").
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { authGate } from '../../services/auth/auth-gate.js';
import { store } from '../../core/store.js';

describe('Auth Gate (validation accès clients + admin protection + SSO)', () => {
  beforeEach(() => {
    localStorage.clear();
    store.init({ appVer: 'v13.0.0' });
  });

  describe('canAccess sans user', () => {
    it('uid null → refuse + redirect landing', () => {
      const r = authGate.canAccess(null);
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.redirect).toBe('landing');
    });
  });

  describe('Admin Kevin protection (P0 sécurité)', () => {
    it('Kevin admin avec session valide → autorisé', () => {
      store.set('user', { id: 'kdmc_admin', name: 'Kevin DESARZENS', tier: 'admin' });
      const r = authGate.canAccess('kdmc_admin');
      expect(r.allowed).toBe(true);
    });

    it('uid admin Kevin mais session pollution → REFUSÉ + audit', () => {
      store.set('user', { id: 'autre_user_malicious', name: 'Hacker', tier: 'family' });
      const r = authGate.canAccess('kdmc_admin');
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.reason).toContain('non admin');
    });

    it('admin Kevin sans session → refusé', () => {
      store.set('user', null);
      const r = authGate.canAccess('kdmc_admin');
      expect(r.allowed).toBe(false);
    });
  });

  describe('isAdminKevinAlias (reconnaissance Kevin)', () => {
    it('reconnaît "Kevin DESARZENS"', () => {
      expect(authGate.isAdminKevinAlias('Kevin DESARZENS')).toBe(true);
    });

    it('reconnaît "kevin desarzens" (lowercase)', () => {
      expect(authGate.isAdminKevinAlias('kevin desarzens')).toBe(true);
    });

    it('reconnaît "DESARZENS Kevin" (ordre inversé)', () => {
      expect(authGate.isAdminKevinAlias('DESARZENS Kevin')).toBe(true);
    });

    it('reconnaît "kevin.desarzens@gmail.com"', () => {
      expect(authGate.isAdminKevinAlias('kevin.desarzens@gmail.com')).toBe(true);
    });

    /* SÉCU v13.4.290 (erreur #38) : alias mono-token interdits (anti-impersonation). */
    it('REJETTE "KDMC" seul (code court mono-token)', () => {
      expect(authGate.isAdminKevinAlias('KDMC')).toBe(false);
    });

    it('REJETTE "Kevin" seul (prénom seul)', () => {
      expect(authGate.isAdminKevinAlias('Kevin')).toBe(false);
    });

    it('REJETTE "DESARZENS" seul (nom seul)', () => {
      expect(authGate.isAdminKevinAlias('DESARZENS')).toBe(false);
    });

    it('REJETTE "kevin durand" (autre Kevin)', () => {
      expect(authGate.isAdminKevinAlias('kevin durand')).toBe(false);
    });

    it('REJETTE "Laurence DESARZENS" (vrai prénom + faux nom)', () => {
      expect(authGate.isAdminKevinAlias('Laurence DESARZENS')).toBe(false);
    });

    it('REJETTE chaîne vide', () => {
      expect(authGate.isAdminKevinAlias('')).toBe(false);
    });
  });

  describe('Status workflow clients', () => {
    it('user nouveau → pending_validation par défaut', () => {
      expect(authGate.getStatus('u_new')).toBe('pending_validation');
    });

    it('pending_validation → accès refusé + redirect waiting_approval', () => {
      authGate.setStatus('u_pending', 'pending_validation');
      const r = authGate.canAccess('u_pending');
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.redirect).toBe('waiting_approval');
    });

    it('pending_plan sans plan → accès refusé + redirect pricing', () => {
      authGate.setStatus('u_no_plan', 'pending_plan');
      const r = authGate.canAccess('u_no_plan');
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.redirect).toBe('pricing');
    });

    it('pending_plan AVEC plan → accès refusé toujours (status != active)', () => {
      authGate.setStatus('u_has_plan', 'pending_plan');
      localStorage.setItem('apex_v13_tier_u_has_plan', 'pro');
      const r = authGate.canAccess('u_has_plan');
      /* Encore en pending_plan = pas active = refusé */
      expect(r.allowed).toBe(false);
    });

    it('active → accès OK', () => {
      authGate.setStatus('u_active', 'active');
      const r = authGate.canAccess('u_active');
      expect(r.allowed).toBe(true);
    });

    it('family_bypass → accès OK sans forfait (Kevin décide)', () => {
      authGate.setStatus('u_family', 'family_bypass');
      const r = authGate.canAccess('u_family');
      expect(r.allowed).toBe(true);
    });

    it('suspended → accès refusé', () => {
      authGate.setStatus('u_susp', 'suspended');
      const r = authGate.canAccess('u_susp');
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.redirect).toBe('suspended');
    });

    it('setStatus refuse modifier admin Kevin', () => {
      authGate.setStatus('kdmc_admin', 'suspended');
      /* Kevin reste active malgré tentative */
      expect(authGate.getStatus('kdmc_admin')).toBe('active');
    });
  });

  describe('approveUser flow Kevin → status', () => {
    it('approveUser type=family → status family_bypass', () => {
      store.set('user', { id: 'kdmc_admin', name: 'Kevin', tier: 'admin' });
      const r = authGate.approveUser('u_friend', 'family');
      expect(r.ok).toBe(true);
      expect(r.status).toBe('family_bypass');
      expect(authGate.getStatus('u_friend')).toBe('family_bypass');
    });

    it('approveUser type=client → status pending_plan', () => {
      store.set('user', { id: 'kdmc_admin', name: 'Kevin', tier: 'admin' });
      const r = authGate.approveUser('u_client', 'client');
      expect(r.ok).toBe(true);
      expect(r.status).toBe('pending_plan');
    });

    it('approveUser refuse si user pas admin', () => {
      store.set('user', { id: 'random_user', name: 'Random', tier: 'family' });
      const r = authGate.approveUser('u_target', 'client');
      expect(r.ok).toBe(false);
    });
  });

  describe('finalizeWithPlan', () => {
    it('client choisit forfait → status active + commerce.setPlan', () => {
      authGate.setStatus('u_finalize', 'pending_plan');
      const r = authGate.finalizeWithPlan('u_finalize', 'pro');
      expect(r.ok).toBe(true);
      expect(authGate.getStatus('u_finalize')).toBe('active');
    });

    it('refuse si status != pending_plan/active', () => {
      authGate.setStatus('u_blocked', 'suspended');
      const r = authGate.finalizeWithPlan('u_blocked', 'pro');
      expect(r.ok).toBe(false);
    });
  });

  describe('SSO Cross-app (Apex AI ↔ Apex Chat)', () => {
    it('generateSSOToken retourne token + expires_at 8h', () => {
      const t = authGate.generateSSOToken('laurence_sp');
      expect(t.token).toMatch(/^sso_/);
      expect(t.expires_at).toBeGreaterThan(Date.now());
      expect(t.expires_at - Date.now()).toBeGreaterThanOrEqual(7 * 60 * 60 * 1000);
    });

    it('verifySSOToken valide token frais', () => {
      const t = authGate.generateSSOToken('laurence_sp');
      expect(authGate.verifySSOToken(t.token, 'laurence_sp')).toBe(true);
    });

    it('verifySSOToken refuse token wrong uid', () => {
      const t = authGate.generateSSOToken('laurence_sp');
      expect(authGate.verifySSOToken(t.token, 'autre_user')).toBe(false);
    });

    it('verifySSOToken refuse token inexistant', () => {
      expect(authGate.verifySSOToken('sso_fake_token_xyz', 'kevin')).toBe(false);
    });
  });

  describe('shouldUseEmbeddedChat (Apex Chat embedded vs standalone)', () => {
    it('admin Kevin → embedded chat', () => {
      expect(authGate.shouldUseEmbeddedChat('kdmc_admin')).toBe(true);
    });

    it('Laurence → embedded chat', () => {
      expect(authGate.shouldUseEmbeddedChat('laurence_sp')).toBe(true);
    });

    it('family bypass → embedded chat', () => {
      authGate.setStatus('u_friend', 'family_bypass');
      expect(authGate.shouldUseEmbeddedChat('u_friend')).toBe(true);
    });

    it('client pending_plan → standalone chat (pas embedded)', () => {
      authGate.setStatus('u_client', 'pending_plan');
      expect(authGate.shouldUseEmbeddedChat('u_client')).toBe(false);
    });
  });

  describe('Stats admin dashboard', () => {
    it('listByStatus pending_validation', () => {
      authGate.setStatus('u1', 'pending_validation');
      authGate.setStatus('u2', 'pending_validation');
      authGate.setStatus('u3', 'active');
      const list = authGate.listByStatus('pending_validation');
      expect(list.length).toBe(2);
      expect(list).toContain('u1');
      expect(list).toContain('u2');
    });

    it('getStats compte par statut', () => {
      authGate.setStatus('u1', 'pending_validation');
      authGate.setStatus('u2', 'pending_plan');
      authGate.setStatus('u3', 'active');
      authGate.setStatus('u4', 'family_bypass');
      authGate.setStatus('u5', 'suspended');
      const s = authGate.getStats();
      expect(s.total).toBe(5);
      expect(s.pending_validation).toBe(1);
      expect(s.pending_plan).toBe(1);
      expect(s.active).toBe(1);
      expect(s.family).toBe(1);
      expect(s.suspended).toBe(1);
    });
  });
});
