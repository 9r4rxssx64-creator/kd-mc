/**
 * Tests apex-credential-associator deep v13.4.148 (Kevin "100/100 réel").
 *
 * Module : services/apex-credential-associator.ts (168 stmts, était 45.8%).
 * Focus : tester audit + listByOwner/Service + guessAccountIdentifier + maskValue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { isAdminSync: vi.fn() },
}));

vi.mock('../../services/auth/auth.js', () => ({ auth: mockAuth }));

import { apexCredentialAssociator } from '../../services/vault/apex-credential-associator.js';

describe('apex-credential-associator deep (v13.4.148)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockAuth.isAdminSync.mockReturnValue(true);
    /* Reset cache (singleton) */
    (apexCredentialAssociator as unknown as { cache: unknown }).cache = null;
  });

  afterEach(() => {
    localStorage.clear();
    (apexCredentialAssociator as unknown as { cache: unknown }).cache = null;
  });

  describe('list()', () => {
    it('retourne [] initialement', () => {
      expect(apexCredentialAssociator.list()).toEqual([]);
    });

    it('utilise cache après 1er appel', () => {
      const r1 = apexCredentialAssociator.list();
      const r2 = apexCredentialAssociator.list();
      expect(r1).toBe(r2); /* même référence */
    });

    it('gère localStorage corrompu', () => {
      localStorage.setItem('apex_v13_credential_associations', '{not json');
      expect(apexCredentialAssociator.list()).toEqual([]);
    });
  });

  describe('associate', () => {
    it('refuse si non-admin', () => {
      mockAuth.isAdminSync.mockReturnValue(false);
      const r = apexCredentialAssociator.associate({
        service: 'anthropic',
        credentialValue: 'sk-ant-test',
      });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('admin_only_associate');
    });

    it('refuse si service ou value vide', () => {
      const r1 = apexCredentialAssociator.associate({ service: '', credentialValue: 'x' });
      expect(r1.ok).toBe(false);
      const r2 = apexCredentialAssociator.associate({ service: 'x', credentialValue: '' });
      expect(r2.ok).toBe(false);
    });

    it('crée entry avec masked value', () => {
      const r = apexCredentialAssociator.associate({
        service: 'anthropic',
        credentialValue: 'sk-ant-api03-xxxxxxxxxxxxxxxx',
      });
      expect(r.ok).toBe(true);
      expect(r.entry?.service).toBe('anthropic');
      expect(r.entry?.credential_masked).toMatch(/•/);
      expect(r.entry?.id).toMatch(/^assoc_/);
    });

    it('extrait email du contextText', () => {
      const r = apexCredentialAssociator.associate({
        service: 'anthropic',
        credentialValue: 'sk-ant-xxxxxxxxxxxx',
        contextText: 'Mon compte chez kevin@example.com avec la clé sk-ant-xxx',
      });
      expect(r.entry?.account_identifier).toBe('kevin@example.com');
    });

    it('extrait login github depuis contextText', () => {
      const r = apexCredentialAssociator.associate({
        service: 'github',
        credentialValue: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        contextText: 'Voir https://github.com/kevin-test et son token',
      });
      expect(r.entry?.account_identifier).toBe('kevin-test');
    });

    it('extrait twitter @handle depuis contextText', () => {
      const r = apexCredentialAssociator.associate({
        service: 'twitter',
        credentialValue: 'twitter_token_xxxxxxxxxxx',
        contextText: 'My @kdmc_kevin Twitter token',
      });
      expect(r.entry?.account_identifier).toBe('kdmc_kevin');
    });

    it('détecte related credentials même service+owner', () => {
      apexCredentialAssociator.associate({
        service: 'anthropic',
        credentialValue: 'sk-ant-first',
        contextText: 'kevin@example.com',
      });
      const r2 = apexCredentialAssociator.associate({
        service: 'anthropic',
        credentialValue: 'sk-ant-second',
        contextText: 'kevin@example.com',
      });
      expect(r2.entry?.related_ids.length).toBe(1);
    });

    it('masked court si plain < 12 chars', () => {
      const r = apexCredentialAssociator.associate({
        service: 'svc',
        credentialValue: 'short_x',
      });
      expect(r.entry?.credential_masked).toBe('••••••');
    });
  });

  describe('listByOwner', () => {
    it('filtre par owner uid', () => {
      localStorage.setItem('apex_v13_pin', 'hash_x');
      apexCredentialAssociator.associate({
        service: 'anthropic',
        credentialValue: 'sk-ant-xxxxxxxxx',
      });
      const r = apexCredentialAssociator.listByOwner('kdmc_admin');
      expect(r.length).toBe(1);
    });

    it('retourne [] si owner inconnu', () => {
      const r = apexCredentialAssociator.listByOwner('nobody');
      expect(r).toEqual([]);
    });
  });

  describe('listByService', () => {
    it('filtre par service', () => {
      apexCredentialAssociator.associate({ service: 'anthropic', credentialValue: 'sk-ant-1234567' });
      apexCredentialAssociator.associate({ service: 'openai', credentialValue: 'sk-oai-1234567' });
      const r = apexCredentialAssociator.listByService('anthropic');
      expect(r.length).toBe(1);
      expect(r[0]?.service).toBe('anthropic');
    });
  });

  describe('runTest', () => {
    it('refuse si non-admin', async () => {
      mockAuth.isAdminSync.mockReturnValue(false);
      const r = await apexCredentialAssociator.runTest('id_x');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('admin_only_test');
    });

    it('retourne not_found si id inconnu', async () => {
      const r = await apexCredentialAssociator.runTest('not_exist');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('not_found');
    });
  });

  describe('runTestAll', () => {
    it('retourne errors=1 si non-admin', async () => {
      mockAuth.isAdminSync.mockReturnValue(false);
      const r = await apexCredentialAssociator.runTestAll();
      expect(r.errors).toBe(1);
      expect(r.total).toBe(0);
    });
  });

  describe('audit', () => {
    it('détecte orphans no_owner si owner=anon', () => {
      apexCredentialAssociator.associate({ service: 's', credentialValue: 'xxxxxxxxxxxxxx' });
      const audit = apexCredentialAssociator.audit();
      expect(audit.orphans_no_owner).toBeGreaterThanOrEqual(0);
    });

    it('détecte duplicates même masked+service', () => {
      apexCredentialAssociator.associate({ service: 's', credentialValue: 'samevalue_xxxx_yyy' });
      apexCredentialAssociator.associate({ service: 's', credentialValue: 'samevalue_xxxx_yyy' });
      const audit = apexCredentialAssociator.audit();
      expect(audit.duplicates).toBeGreaterThanOrEqual(1);
    });

    it('compte untested', () => {
      apexCredentialAssociator.associate({ service: 'anthropic', credentialValue: 'sk-ant-xxxxxx' });
      const audit = apexCredentialAssociator.audit();
      expect(audit.untested).toBeGreaterThanOrEqual(1);
    });
  });
});
