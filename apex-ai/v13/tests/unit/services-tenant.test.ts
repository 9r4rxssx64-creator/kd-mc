/**
 * Tests services/tenant.ts — Multi-tenant manager (commercialisation B2B/B2C).
 *
 * Couvre :
 * - create() validation + persistance + audit log
 * - getCurrent() owner / member / null
 * - canAccess() isolation cross-tenant + bypass admin Kevin
 * - update() invariants (id/createdAt/ownerId immutables) + plan→budget
 * - scopeStorageKey() préfixe + admin bypass
 * - addMember/removeMember
 * - trackTokenUsage + isOverBudget
 * - checkTrialExpiry transition trial→past_due
 * - delete() admin only
 * - formatForSystemPrompt
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { auditLog } from '../../services/observability/audit-log.js';
import { tenantManager, type TenantPlan } from '../../services/auth/tenant.js';

const ADMIN = 'kdmc_admin';

describe('tenantManager (multi-tenant SaaS Kevin v13.0.74)', () => {
  beforeEach(() => {
    localStorage.clear();
    auditLog.reload();
    tenantManager.reload();
  });

  describe('create()', () => {
    it('crée un tenant valide avec status trial + trialEndsAt + budget', async () => {
      const t = await tenantManager.create({
        ownerId: 'user_alice',
        brandName: 'Acme Corp',
        plan: 'pro',
      });
      expect(t.id).toMatch(/^tenant_\d+_[a-z0-9]{1,8}$/);
      expect(t.ownerId).toBe('user_alice');
      expect(t.brandName).toBe('Acme Corp');
      expect(t.plan).toBe('pro');
      expect(t.status).toBe('trial');
      expect(t.trialEndsAt).toBeGreaterThan(Date.now());
      expect(t.tokensConsumed).toBe(0);
      expect(t.monthlyTokenBudget).toBeGreaterThan(0);
    });

    it('plan défaut = free si non spécifié', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      expect(t.plan).toBe('free');
    });

    it('throw si ownerId vide', async () => {
      await expect(tenantManager.create({ ownerId: '', brandName: 'X' })).rejects.toThrow(/ownerId/);
    });

    it('throw si brandName vide', async () => {
      await expect(tenantManager.create({ ownerId: 'u', brandName: '' })).rejects.toThrow(/brandName/);
    });

    it('throw si plan invalide', async () => {
      await expect(
        tenantManager.create({ ownerId: 'u', brandName: 'X', plan: 'enterprise' as TenantPlan }),
      ).rejects.toThrow(/invalid plan/);
    });

    it('persiste dans localStorage', async () => {
      await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      const raw = localStorage.getItem('apex_v13_tenants');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!) as unknown[];
      expect(parsed.length).toBe(1);
    });

    it('audit log entry tenant.create', async () => {
      await tenantManager.create({ ownerId: 'u1', brandName: 'BrandX', plan: 'basic' });
      const entries = auditLog.getEntries({ action: 'tenant.create' });
      expect(entries.length).toBe(1);
      expect(entries[0]?.actor).toBe('u1');
      expect(entries[0]?.details).toMatchObject({ brandName: 'BrandX', plan: 'basic' });
    });

    it('memberIds optionnels copiés (pas référence partagée)', async () => {
      const members = ['u2', 'u3'];
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X', memberIds: members });
      members.push('mutant');
      expect(t.memberIds).toEqual(['u2', 'u3']);
    });
  });

  describe('getCurrent()', () => {
    it('retourne tenant si user est owner', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      const current = tenantManager.getCurrent('u1');
      expect(current?.id).toBe(t.id);
    });

    it('retourne tenant si user est membre', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X', memberIds: ['u2'] });
      const current = tenantManager.getCurrent('u2');
      expect(current?.id).toBe(t.id);
    });

    it('retourne null si user étranger', async () => {
      await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      expect(tenantManager.getCurrent('u_ghost')).toBeNull();
    });

    it('retourne null si userId vide', () => {
      expect(tenantManager.getCurrent('')).toBeNull();
    });
  });

  describe('canAccess() — hard isolation', () => {
    it('owner peut accéder à son tenant', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      expect(tenantManager.canAccess('u1', t.id)).toBe(true);
    });

    it('membre peut accéder', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X', memberIds: ['u2'] });
      expect(tenantManager.canAccess('u2', t.id)).toBe(true);
    });

    it('user étranger BLOQUÉ (cross-tenant fuite empêchée)', async () => {
      const t1 = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      await tenantManager.create({ ownerId: 'u2', brandName: 'Y' });
      expect(tenantManager.canAccess('u2', t1.id)).toBe(false);
    });

    it('Kevin admin = bypass total cross-tenant', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      expect(tenantManager.canAccess(ADMIN, t.id)).toBe(true);
    });

    it('tenant inexistant → false', () => {
      expect(tenantManager.canAccess('u1', 'tenant_nope')).toBe(false);
    });

    it('userId vide → false', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      expect(tenantManager.canAccess('', t.id)).toBe(false);
    });
  });

  describe('listAll() — admin only', () => {
    it('retourne tenants si caller = admin', async () => {
      await tenantManager.create({ ownerId: 'u1', brandName: 'A' });
      await tenantManager.create({ ownerId: 'u2', brandName: 'B' });
      const list = tenantManager.listAll(ADMIN);
      expect(list.length).toBe(2);
    });

    it('retourne array vide si caller non-admin', async () => {
      await tenantManager.create({ ownerId: 'u1', brandName: 'A' });
      expect(tenantManager.listAll('u1')).toEqual([]);
    });

    it('retourne tout si callerId omis (compat tests internes)', async () => {
      await tenantManager.create({ ownerId: 'u1', brandName: 'A' });
      expect(tenantManager.listAll().length).toBe(1);
    });
  });

  describe('update()', () => {
    it('update plan + status', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      const ok = tenantManager.update(t.id, { plan: 'pro', status: 'active' });
      expect(ok).toBe(true);
      const after = tenantManager.getById(t.id);
      expect(after?.plan).toBe('pro');
      expect(after?.status).toBe('active');
    });

    it('plan change → budget recalculé', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X', plan: 'free' });
      const oldBudget = t.monthlyTokenBudget;
      tenantManager.update(t.id, { plan: 'pro' });
      const after = tenantManager.getById(t.id);
      expect(after?.monthlyTokenBudget).toBeGreaterThan(oldBudget);
    });

    it('id/createdAt/ownerId immutables même si changes', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      tenantManager.update(t.id, {
        brandName: 'Y',
        /* tentatives de mutation immutables */
        ...({ id: 'tenant_hacked', createdAt: 0, ownerId: 'attacker' } as Record<string, unknown>),
      });
      const after = tenantManager.getById(t.id);
      expect(after?.id).toBe(t.id);
      expect(after?.createdAt).toBe(t.createdAt);
      expect(after?.ownerId).toBe('u1');
      expect(after?.brandName).toBe('Y');
    });

    it('false si tenant introuvable', () => {
      expect(tenantManager.update('tenant_nope', { plan: 'pro' })).toBe(false);
    });
  });

  describe('getQuotas() / getQuotasForUser()', () => {
    it('quotas free strict (50 msg, 1 studio, basic, 1k API)', () => {
      const q = tenantManager.getQuotas('free');
      expect(q.msgPerDay).toBe(50);
      expect(q.studiosCount).toBe(1);
      expect(q.voicesQuality).toBe('basic');
      expect(q.apiCallsPerMonth).toBe(1000);
    });

    it('quotas pro illimité messages', () => {
      const q = tenantManager.getQuotas('pro');
      expect(q.msgPerDay).toBe(-1);
      expect(q.voicesQuality).toBe('premium');
    });

    it('quotas business "all" studios', () => {
      const q = tenantManager.getQuotas('business');
      expect(q.studiosCount).toBe('all');
    });

    it('getQuotasForUser fallback free si pas de tenant', () => {
      expect(tenantManager.getQuotasForUser('u_ghost').msgPerDay).toBe(50);
    });

    it('getQuotasForUser quotas du plan tenant', async () => {
      await tenantManager.create({ ownerId: 'u1', brandName: 'X', plan: 'pro' });
      expect(tenantManager.getQuotasForUser('u1').msgPerDay).toBe(-1);
    });
  });

  describe('scopeStorageKey()', () => {
    it('préfixe key avec tenant_id pour user normal', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X', plan: 'pro' });
      const scoped = tenantManager.scopeStorageKey('settings', t.id);
      expect(scoped).toBe(`tenant_${t.id.replace(/^tenant_/, 'tenant_')}_settings`);
      expect(scoped.startsWith('tenant_')).toBe(true);
    });

    it('admin tenant = pas de préfixe (compat backward)', async () => {
      const t = await tenantManager.create({ ownerId: ADMIN, brandName: 'Kevin', plan: 'admin' });
      expect(tenantManager.scopeStorageKey('apex_v13_facts', t.id)).toBe('apex_v13_facts');
    });

    it('idempotent : ne re-préfixe pas si déjà préfixé', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      const once = tenantManager.scopeStorageKey('foo', t.id);
      const twice = tenantManager.scopeStorageKey(once, t.id);
      expect(twice).toBe(once);
    });

    it('key vide retourne tel quel', () => {
      expect(tenantManager.scopeStorageKey('', 'tenant_xyz')).toBe('');
    });

    it('tenantId vide retourne key brute', () => {
      expect(tenantManager.scopeStorageKey('foo', '')).toBe('foo');
    });
  });

  describe('addMember() / removeMember()', () => {
    it('ajoute membre + persiste', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      expect(tenantManager.addMember(t.id, 'u2')).toBe(true);
      const after = tenantManager.getById(t.id);
      expect(after?.memberIds).toContain('u2');
    });

    it('refuse owner comme membre', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      expect(tenantManager.addMember(t.id, 'u1')).toBe(false);
    });

    it('refuse doublon', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X', memberIds: ['u2'] });
      expect(tenantManager.addMember(t.id, 'u2')).toBe(false);
    });

    it('removeMember retire user', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X', memberIds: ['u2', 'u3'] });
      expect(tenantManager.removeMember(t.id, 'u2')).toBe(true);
      const after = tenantManager.getById(t.id);
      expect(after?.memberIds).toEqual(['u3']);
    });

    it('removeMember false si user absent', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      expect(tenantManager.removeMember(t.id, 'u_ghost')).toBe(false);
    });
  });

  describe('trackTokenUsage() + isOverBudget()', () => {
    it('incrémente tokensConsumed', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      tenantManager.trackTokenUsage(t.id, 5000);
      tenantManager.trackTokenUsage(t.id, 3000);
      const after = tenantManager.getById(t.id);
      expect(after?.tokensConsumed).toBe(8000);
    });

    it('isOverBudget false si dans budget', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X', plan: 'free' });
      tenantManager.trackTokenUsage(t.id, 100);
      expect(tenantManager.isOverBudget(t.id)).toBe(false);
    });

    it('isOverBudget true si dépassé', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X', plan: 'free' });
      tenantManager.trackTokenUsage(t.id, t.monthlyTokenBudget + 1);
      expect(tenantManager.isOverBudget(t.id)).toBe(true);
    });

    it('admin plan jamais over (budget MAX_SAFE_INTEGER)', async () => {
      const t = await tenantManager.create({ ownerId: ADMIN, brandName: 'K', plan: 'admin' });
      tenantManager.trackTokenUsage(t.id, 1_000_000_000);
      expect(tenantManager.isOverBudget(t.id)).toBe(false);
    });

    it('resetMonthlyUsage remet à 0', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      tenantManager.trackTokenUsage(t.id, 5000);
      tenantManager.resetMonthlyUsage(t.id);
      expect(tenantManager.getById(t.id)?.tokensConsumed).toBe(0);
    });

    it('ignore tokens <=0', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      tenantManager.trackTokenUsage(t.id, -100);
      tenantManager.trackTokenUsage(t.id, 0);
      expect(tenantManager.getById(t.id)?.tokensConsumed).toBe(0);
    });
  });

  describe('checkTrialExpiry()', () => {
    it('passe trial → past_due si expiré', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      /* Force trialEndsAt dans le passé */
      tenantManager.update(t.id, { trialEndsAt: Date.now() - 1000 });
      expect(tenantManager.checkTrialExpiry(t.id)).toBe(true);
      expect(tenantManager.getById(t.id)?.status).toBe('past_due');
    });

    it('false si trial encore valide', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      expect(tenantManager.checkTrialExpiry(t.id)).toBe(false);
      expect(tenantManager.getById(t.id)?.status).toBe('trial');
    });

    it('false si status déjà active', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      tenantManager.update(t.id, { status: 'active' });
      expect(tenantManager.checkTrialExpiry(t.id)).toBe(false);
    });
  });

  describe('delete() — admin only', () => {
    it('admin Kevin supprime + audit log', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      const ok = await tenantManager.delete(t.id, ADMIN);
      expect(ok).toBe(true);
      expect(tenantManager.getById(t.id)).toBeNull();
      const audits = auditLog.getEntries({ action: 'tenant.delete' });
      expect(audits.length).toBe(1);
    });

    it('non-admin REFUSÉ', async () => {
      const t = await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      expect(await tenantManager.delete(t.id, 'u1')).toBe(false);
      expect(tenantManager.getById(t.id)).not.toBeNull();
    });
  });

  describe('formatForSystemPrompt()', () => {
    it('contient brandName + plan + quotas', async () => {
      await tenantManager.create({ ownerId: 'u1', brandName: 'AcmeCorp', plan: 'pro' });
      const out = tenantManager.formatForSystemPrompt('u1');
      expect(out).toContain('AcmeCorp');
      expect(out).toContain('pro');
      expect(out).toContain('Quotas');
    });

    it('"Aucun tenant associé" si user sans tenant', () => {
      expect(tenantManager.formatForSystemPrompt('u_ghost')).toContain('Aucun tenant');
    });
  });

  describe('reload() — robustesse persistence', () => {
    it('parse JSON corrompu → array vide (pas crash)', () => {
      localStorage.setItem('apex_v13_tenants', '{not-json}');
      tenantManager.reload();
      expect(tenantManager.listAll()).toEqual([]);
    });

    it('reload depuis localStorage existant', async () => {
      await tenantManager.create({ ownerId: 'u1', brandName: 'X' });
      tenantManager.reload();
      expect(tenantManager.listAll().length).toBe(1);
    });
  });
});
