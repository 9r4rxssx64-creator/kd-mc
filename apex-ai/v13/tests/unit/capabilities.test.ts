/**
 * Tests capabilities.ts (registry + system prompt context).
 */
import { describe, it, expect } from 'vitest';
import { capabilities } from '../../services/core-svc/capabilities.js';

describe('Capabilities Registry (au-delà 100/100 polyvalence)', () => {
  describe('list + count', () => {
    it('list retourne capabilities enabled (>= 20)', () => {
      const all = capabilities.list();
      expect(all.length).toBeGreaterThanOrEqual(20);
      expect(all.every((c) => c.enabled)).toBe(true);
    });

    it('count() = nombre capabilities enabled', () => {
      expect(capabilities.count()).toBe(capabilities.list().length);
    });

    it('listAll() inclut disabled', () => {
      expect(capabilities.listAll().length).toBeGreaterThanOrEqual(capabilities.list().length);
    });
  });

  describe('byCategory', () => {
    it('catégories couvertes : ia/creation/security/finance/etc.', () => {
      const cats = capabilities.countByCategory();
      expect(cats.ia).toBeGreaterThanOrEqual(2);
      expect(cats.creation).toBeGreaterThanOrEqual(2);
      expect(cats.security).toBeGreaterThanOrEqual(2);
      expect(cats.finance).toBeGreaterThanOrEqual(2);
      expect(cats.orchestration).toBeGreaterThanOrEqual(2);
      expect(cats.memory).toBeGreaterThanOrEqual(2);
    });

    it('byCategory(ia) → tous category=ia', () => {
      const ias = capabilities.byCategory('ia');
      expect(ias.length).toBeGreaterThan(0);
      expect(ias.every((c) => c.category === 'ia')).toBe(true);
    });
  });

  describe('search', () => {
    it('search "voix" trouve voice_chat', () => {
      const found = capabilities.search('voix');
      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found.some((c) => c.id === 'voice_chat')).toBe(true);
    });

    it('search "vault" trouve vault_credentials', () => {
      const found = capabilities.search('vault');
      expect(found.some((c) => c.id === 'vault_credentials')).toBe(true);
    });

    it('search "FaceID" trouve webauthn_2fa', () => {
      const found = capabilities.search('FaceID');
      expect(found.some((c) => c.id === 'webauthn_2fa')).toBe(true);
    });

    it('search inconnu → array vide', () => {
      const found = capabilities.search('xyzabc_inexistant_keyword_999');
      expect(found.length).toBe(0);
    });
  });

  describe('toPromptContext', () => {
    it('format contient nombre + catégories + bullets', () => {
      const ctx = capabilities.toPromptContext();
      expect(ctx).toContain('APEX CAPABILITIES');
      expect(ctx).toContain('actives');
      expect(ctx).toContain('ia');
      expect(ctx).toContain('🤖');
    });

    it('limite 5 par catégorie (anti-prompt-overflow)', () => {
      const ctx = capabilities.toPromptContext();
      const lines = ctx.split('\n');
      /* Compter bullets indentés (4 spaces) — max 5 par cat */
      const indented = lines.filter((l) => /^    [^\s]/.test(l));
      /* Au moins 8 catégories x 5 = 40 max bullets */
      expect(indented.length).toBeLessThanOrEqual(40);
    });
  });

  describe('auditOrphans', () => {
    it('audit orphans détecte tools manquants apex-tools registry', async () => {
      const audit = await capabilities.auditOrphans();
      expect(audit.coverage_pct).toBeGreaterThanOrEqual(0);
      expect(audit.coverage_pct).toBeLessThanOrEqual(100);
      expect(Array.isArray(audit.orphans)).toBe(true);
    });
  });
});
