/**
 * Tests audit-honesty-watch v13.4.134 (Kevin "Apex retient leçons mieux que moi").
 *
 * Vérifie détection patterns "score estimé/projeté" qui sont des mensonges
 * de Claude Code et que Kevin veut éliminer pour toujours.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditHonestyWatch } from '../../services/sentinels/audit-honesty-watch.js';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('audit-honesty-watch (Kevin v13.4.134 anti-mensonge)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('detectEstimations — patterns interdits', () => {
    it('détecte "score estimé X/20"', () => {
      const r = auditHonestyWatch.detectEstimations('Le score estimé 18/20 après fix');
      expect(r.count).toBeGreaterThanOrEqual(1);
    });

    it('détecte "score projeté X/100"', () => {
      const r = auditHonestyWatch.detectEstimations('Score projeté ~85/100 maintenant');
      expect(r.count).toBeGreaterThanOrEqual(1);
    });

    it('détecte "devrait être à X/20"', () => {
      const r = auditHonestyWatch.detectEstimations('Sécurité devrait être à 20/20');
      expect(r.count).toBeGreaterThanOrEqual(1);
    });

    it('détecte "~X/100"', () => {
      const r = auditHonestyWatch.detectEstimations('Le score est environ ~92/100');
      expect(r.count).toBeGreaterThanOrEqual(1);
    });

    it('détecte "post-fix X/20 (estim"', () => {
      const r = auditHonestyWatch.detectEstimations('Sécurité post-fix 20/20 (estimé)');
      expect(r.count).toBeGreaterThanOrEqual(1);
    });

    it('NE détecte PAS "audit subagent dit X/20" (mesure légitime)', () => {
      const r = auditHonestyWatch.detectEstimations('Audit subagent dit 17/20');
      expect(r.count).toBe(0);
    });

    it('NE détecte PAS "Lighthouse mesure 87" (mesure légitime)', () => {
      const r = auditHonestyWatch.detectEstimations('Lighthouse mesure 87, coverage v8 76.75%');
      expect(r.count).toBe(0);
    });
  });

  describe('scanRecentMessages', () => {
    it('retourne ok=true si conversation vide', async () => {
      const r = await auditHonestyWatch.scanRecentMessages();
      expect(r.ok).toBe(true);
      expect(r.estimations_found).toBe(0);
    });

    it('retourne ok=true si messages sans pattern estimation', async () => {
      localStorage.setItem(
        'apex_v13_conversation_active',
        JSON.stringify([
          { role: 'assistant', text: 'Voici le résultat de l\'audit subagent : 16/20 mesuré.' },
          { role: 'user', text: 'OK merci' },
        ]),
      );
      const r = await auditHonestyWatch.scanRecentMessages();
      expect(r.ok).toBe(true);
    });

    it('détecte estimation dans message assistant', async () => {
      localStorage.setItem(
        'apex_v13_conversation_active',
        JSON.stringify([
          { role: 'assistant', text: 'Le score projeté 18/20 après fix devrait passer à 20/20' },
        ]),
      );
      const r = await auditHonestyWatch.scanRecentMessages();
      expect(r.ok).toBe(false);
      expect(r.estimations_found).toBeGreaterThanOrEqual(1);
    });

    it('ignore messages role=user (juste détecte Apex IA mensonges)', async () => {
      localStorage.setItem(
        'apex_v13_conversation_active',
        JSON.stringify([
          { role: 'user', text: 'Score estimé 18/20 c\'est OK ?' },
        ]),
      );
      const r = await auditHonestyWatch.scanRecentMessages();
      expect(r.ok).toBe(true);
    });

    it('gère localStorage corrompu sans crash', async () => {
      localStorage.setItem('apex_v13_conversation_active', '{not valid json');
      const r = await auditHonestyWatch.scanRecentMessages();
      expect(r.ok).toBe(true);
    });
  });

  describe('check() — wrapper sentinelle', () => {
    it('retourne ok=true si pas d\'estimation', async () => {
      const r = await auditHonestyWatch.check();
      expect(r.ok).toBe(true);
      expect(r.details.estimations_found).toBe(0);
    });

    it('escalade lesson si estimation détectée', async () => {
      localStorage.setItem(
        'apex_v13_conversation_active',
        JSON.stringify([
          { role: 'assistant', text: 'Score projeté 19/20 pour la sécurité' },
        ]),
      );
      const r = await auditHonestyWatch.check();
      expect(r.ok).toBe(false);
      expect(r.details.samples.length).toBeGreaterThan(0);
    });
  });
});
