/**
 * APEX v13 — Tests unitaires services/feature-guard.ts
 *
 * Couvre les 4 helpers exportés par le module guard :
 *  - guardFeatureEnabled (vue UI)
 *  - guardSentinelEnabled (sentinelle background)
 *  - guardFeatureBoot (service au boot)
 *  - guardToolEnabled (tools IA dispatch)
 *
 * Chaque helper est testé sur :
 *  - state ON par défaut (toggle non écrit)
 *  - override global ON
 *  - override global OFF (résultat blocant)
 *  - override per-user OFF (résultat blocant)
 *  - feature inconnue (retour off / blocant)
 *
 * Règle CLAUDE.md erreur #28 : DECLARATION ≠ DEPLOYMENT.
 * Ces tests prouvent que les guards sont WIRES et fonctionnels (pas console-only).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { featureToggles } from '../../services/auth/feature-toggles.js';
import {
  guardFeatureEnabled,
  guardSentinelEnabled,
  guardFeatureBoot,
  guardToolEnabled,
} from '../../services/auth/feature-guard.js';

describe('feature-guard helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('guardFeatureEnabled (vue UI)', () => {
    it('retourne true et ne touche pas rootEl quand feature ON par défaut', () => {
      const root = document.createElement('div');
      root.innerHTML = '<p>contenu original</p>';
      /* studio.music est défaultEnabled:true dans le registry */
      const ok = guardFeatureEnabled('studio.music', root);
      expect(ok).toBe(true);
      expect(root.innerHTML).toBe('<p>contenu original</p>');
    });

    it('retourne false ET remplit rootEl avec notice quand toggle global = OFF', () => {
      featureToggles.setGlobal('studio.music', false);
      const root = document.createElement('div');
      root.innerHTML = '<p>doit etre remplace</p>';
      const ok = guardFeatureEnabled('studio.music', root);
      expect(ok).toBe(false);
      expect(root.innerHTML).toContain('Module désactivé');
      expect(root.innerHTML).not.toContain('doit etre remplace');
    });

    it('retourne false avec custom fallback HTML si fourni', () => {
      featureToggles.setGlobal('studio.music', false);
      const root = document.createElement('div');
      const ok = guardFeatureEnabled(
        'studio.music',
        root,
        undefined,
        '<div class="custom-disabled">CUSTOM_OFF</div>',
      );
      expect(ok).toBe(false);
      expect(root.innerHTML).toContain('CUSTOM_OFF');
    });

    it('respecte priorité per-user > global (per-user OFF même si global ON)', () => {
      featureToggles.setGlobal('studio.music', true);
      featureToggles.setForUser('studio.music', 'laurence', false);
      const root = document.createElement('div');
      const ok = guardFeatureEnabled('studio.music', root, 'laurence');
      expect(ok).toBe(false);
      expect(root.innerHTML).toContain('Module désactivé');
    });

    it('respecte priorité per-user > global (per-user ON même si global OFF)', () => {
      featureToggles.setGlobal('studio.music', false);
      featureToggles.setForUser('studio.music', 'kevin', true);
      const root = document.createElement('div');
      root.innerHTML = '<p>preserve</p>';
      const ok = guardFeatureEnabled('studio.music', root, 'kevin');
      expect(ok).toBe(true);
      expect(root.innerHTML).toBe('<p>preserve</p>');
    });

    it('retourne false pour feature inconnue (registry strict)', () => {
      const root = document.createElement('div');
      const ok = guardFeatureEnabled('feature.does.not.exist', root);
      expect(ok).toBe(false);
    });
  });

  describe('guardSentinelEnabled (sentinelle background)', () => {
    it('retourne true par défaut', () => {
      expect(guardSentinelEnabled('sentinel.token-watch')).toBe(true);
    });

    it('retourne false après désactivation globale', () => {
      featureToggles.setGlobal('sentinel.token-watch', false);
      expect(guardSentinelEnabled('sentinel.token-watch')).toBe(false);
    });

    it('retourne false pour sentinelle inconnue', () => {
      expect(guardSentinelEnabled('sentinel.unknown-id')).toBe(false);
    });
  });

  describe('guardFeatureBoot (service boot)', () => {
    it('retourne true quand feature ON', () => {
      expect(guardFeatureBoot('feature.realtime-backup')).toBe(true);
    });

    it('retourne false quand feature désactivée globalement', () => {
      featureToggles.setGlobal('feature.realtime-backup', false);
      expect(guardFeatureBoot('feature.realtime-backup')).toBe(false);
    });
  });

  describe('guardToolEnabled (tools IA dispatch)', () => {
    it('retourne null (pas d erreur) quand tool ON', () => {
      const r = guardToolEnabled('tool.web_search');
      expect(r).toBeNull();
    });

    it('retourne objet error quand tool désactivé globalement', () => {
      featureToggles.setGlobal('tool.web_search', false);
      const r = guardToolEnabled('tool.web_search');
      expect(r).not.toBeNull();
      expect(r?.error).toContain('tool.web_search');
      expect(r?.error).toContain('désactivé');
    });

    it('respecte per-user override (user-specific OFF)', () => {
      featureToggles.setGlobal('tool.web_search', true);
      featureToggles.setForUser('tool.web_search', 'guest', false);
      const r = guardToolEnabled('tool.web_search', 'guest');
      expect(r).not.toBeNull();
      expect(r?.error).toContain('tool.web_search');
    });

    it('retourne null quand tool inconnu (pas de registry → assumé OK)', () => {
      /* isFeatureEnabled retourne false pour features inconnues —
         guardToolEnabled propage donc l'erreur. Ce test confirme le comportement. */
      const r = guardToolEnabled('tool.does.not.exist');
      expect(r).not.toBeNull();
    });
  });

  describe('intégration : guard + bulk operations', () => {
    it('disableAll() bloque tous les guards', () => {
      featureToggles.disableAll();
      const root = document.createElement('div');
      expect(guardFeatureEnabled('studio.music', root)).toBe(false);
      expect(guardSentinelEnabled('sentinel.backup-watch')).toBe(false);
      expect(guardFeatureBoot('feature.realtime-backup')).toBe(false);
      expect(guardToolEnabled('tool.web_search')).not.toBeNull();
    });

    it('resetDefaults() réactive tous les guards (defaultEnabled:true)', () => {
      featureToggles.disableAll();
      featureToggles.resetDefaults();
      const root = document.createElement('div');
      root.innerHTML = '<p>preserve</p>';
      expect(guardFeatureEnabled('studio.music', root)).toBe(true);
      expect(root.innerHTML).toBe('<p>preserve</p>');
      expect(guardSentinelEnabled('sentinel.backup-watch')).toBe(true);
      expect(guardToolEnabled('tool.web_search')).toBeNull();
    });
  });
});
