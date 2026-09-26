/**
 * APEX v13 — Tests unitaires services/feature-toggles.ts
 *
 * Couvre 100% de la logique :
 *  - Registry (list, get, listByCategory, listCategories)
 *  - Global toggles (set/get/bulk)
 *  - Per-user toggles (set/get/remove)
 *  - Resolution priority (per-user > global > default)
 *  - Bulk operations (enableAll, disableAll, resetDefaults)
 *  - Audit history (append + max 500)
 *  - Export/Import config (JSON roundtrip + invalid JSON)
 *  - Stats agrégées
 *  - Helper isFeatureEnabled + renderDisabledNotice
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  featureToggles,
  isFeatureEnabled,
  renderDisabledNotice,
} from '../../services/auth/feature-toggles.js';

describe('feature-toggles service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Registry', () => {
    it('list() retourne au moins 100 features', () => {
      const all = featureToggles.list();
      expect(all.length).toBeGreaterThanOrEqual(100);
    });

    it('list() inclut studios, pro, voice, browser, sentinel, tool, auth, admin, module', () => {
      const cats = new Set(featureToggles.list().map((f) => f.category));
      expect(cats.has('studio')).toBe(true);
      expect(cats.has('pro')).toBe(true);
      expect(cats.has('voice')).toBe(true);
      expect(cats.has('browser')).toBe(true);
      expect(cats.has('sentinel')).toBe(true);
      expect(cats.has('tool')).toBe(true);
      expect(cats.has('auth')).toBe(true);
      expect(cats.has('admin')).toBe(true);
      expect(cats.has('module')).toBe(true);
    });

    it('get() retourne la feature par id', () => {
      const f = featureToggles.get('studio.music');
      expect(f).not.toBeNull();
      expect(f?.id).toBe('studio.music');
      expect(f?.category).toBe('studio');
    });

    it('get() retourne null si feature inconnue', () => {
      expect(featureToggles.get('not.exists')).toBeNull();
    });

    it('listByCategory() filtre correctement', () => {
      const studios = featureToggles.listByCategory('studio');
      expect(studios.length).toBeGreaterThanOrEqual(15);
      expect(studios.every((f) => f.category === 'studio')).toBe(true);
    });

    it('listCategories() retourne unique categories', () => {
      const cats = featureToggles.listCategories();
      const set = new Set(cats);
      expect(set.size).toBe(cats.length);
    });

    it('chaque feature a un description non vide', () => {
      for (const f of featureToggles.list()) {
        expect(f.description.length).toBeGreaterThan(0);
      }
    });

    it('ids sont uniques', () => {
      const ids = featureToggles.list().map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('isEnabledGlobal + setGlobal', () => {
    it('feature inconnue → false', () => {
      expect(featureToggles.isEnabledGlobal('not.exists')).toBe(false);
    });

    it('feature avec defaultEnabled true → true sans override', () => {
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(true);
    });

    it('feature avec defaultEnabled false → false sans override', () => {
      expect(featureToggles.isEnabledGlobal('voice.elevenlabs')).toBe(false);
    });

    it('setGlobal(false) → isEnabledGlobal renvoie false', () => {
      featureToggles.setGlobal('studio.music', false);
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(false);
    });

    it('setGlobal(true) après false → renvoie true', () => {
      featureToggles.setGlobal('studio.music', false);
      featureToggles.setGlobal('studio.music', true);
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(true);
    });

    it('setGlobal sur id inconnu → false', () => {
      const ok = featureToggles.setGlobal('not.exists', true);
      expect(ok).toBe(false);
    });

    it('setGlobal écrit audit history', () => {
      featureToggles.setGlobal('studio.music', false, 'kevin');
      const hist = featureToggles.getHistory();
      expect(hist.length).toBeGreaterThan(0);
      const last = hist[hist.length - 1];
      expect(last?.action).toBe('set_global');
      expect(last?.featureId).toBe('studio.music');
      expect(last?.value).toBe(false);
      expect(last?.actor).toBe('kevin');
    });

    it('setGlobal persist localStorage', () => {
      featureToggles.setGlobal('studio.music', false);
      const raw = localStorage.getItem('ax_feature_toggles_global');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!)['studio.music']).toBe(false);
    });
  });

  describe('setGlobalBulk', () => {
    it('applique multiple features valides', () => {
      const r = featureToggles.setGlobalBulk({
        'studio.music': false,
        'studio.video': false,
      });
      expect(r.applied).toBe(2);
      expect(r.skipped).toBe(0);
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(false);
      expect(featureToggles.isEnabledGlobal('studio.video')).toBe(false);
    });

    it('skip features inconnues', () => {
      const r = featureToggles.setGlobalBulk({
        'studio.music': false,
        'not.exists': true,
      });
      expect(r.applied).toBe(1);
      expect(r.skipped).toBe(1);
    });

    it('bulk vide → 0 applied', () => {
      const r = featureToggles.setGlobalBulk({});
      expect(r.applied).toBe(0);
      expect(r.skipped).toBe(0);
    });
  });

  describe('isEnabledForUser + setForUser', () => {
    it('sans override per-user → fallback global', () => {
      featureToggles.setGlobal('studio.music', false);
      expect(featureToggles.isEnabledForUser('studio.music', 'laurence')).toBe(false);
    });

    it('override per-user true tape sur global false', () => {
      featureToggles.setGlobal('studio.music', false);
      featureToggles.setForUser('studio.music', 'laurence', true);
      expect(featureToggles.isEnabledForUser('studio.music', 'laurence')).toBe(true);
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(false);
    });

    it('override per-user false tape sur global true', () => {
      featureToggles.setForUser('studio.music', 'laurence', false);
      expect(featureToggles.isEnabledForUser('studio.music', 'laurence')).toBe(false);
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(true);
    });

    it('setForUser sur feature inconnue → false', () => {
      const ok = featureToggles.setForUser('not.exists', 'laurence', true);
      expect(ok).toBe(false);
    });

    it('setForUser sans userId → false', () => {
      const ok = featureToggles.setForUser('studio.music', '', true);
      expect(ok).toBe(false);
    });

    it('setForUser écrit audit history', () => {
      featureToggles.setForUser('studio.music', 'laurence', false, 'kevin');
      const hist = featureToggles.getHistory();
      const last = hist[hist.length - 1];
      expect(last?.action).toBe('set_user');
      expect(last?.userId).toBe('laurence');
    });

    it('setForUser persist localStorage scoped per-user', () => {
      featureToggles.setForUser('studio.music', 'laurence', false);
      const raw = localStorage.getItem('ax_feature_toggles_user_laurence');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!)['studio.music']).toBe(false);
    });
  });

  describe('removeUserOverride', () => {
    it('remove existing override', () => {
      featureToggles.setForUser('studio.music', 'laurence', false);
      const ok = featureToggles.removeUserOverride('studio.music', 'laurence');
      expect(ok).toBe(true);
      /* doit retomber sur global true (default) */
      expect(featureToggles.isEnabledForUser('studio.music', 'laurence')).toBe(true);
    });

    it('remove override inexistant → false', () => {
      const ok = featureToggles.removeUserOverride('studio.music', 'laurence');
      expect(ok).toBe(false);
    });

    it('remove sans userId → false', () => {
      const ok = featureToggles.removeUserOverride('studio.music', '');
      expect(ok).toBe(false);
    });

    it('remove écrit audit history', () => {
      featureToggles.setForUser('studio.music', 'laurence', false);
      featureToggles.removeUserOverride('studio.music', 'laurence');
      const hist = featureToggles.getHistory();
      const last = hist[hist.length - 1];
      expect(last?.action).toBe('remove_user');
    });
  });

  describe('isEnabled (resolution priority)', () => {
    it('sans userId → utilise global', () => {
      featureToggles.setGlobal('studio.music', false);
      expect(featureToggles.isEnabled('studio.music')).toBe(false);
    });

    it('avec userId → cherche per-user d\'abord', () => {
      featureToggles.setGlobal('studio.music', true);
      featureToggles.setForUser('studio.music', 'u1', false);
      expect(featureToggles.isEnabled('studio.music', 'u1')).toBe(false);
    });

    it('avec userId mais sans override → fallback global', () => {
      featureToggles.setGlobal('studio.music', false);
      expect(featureToggles.isEnabled('studio.music', 'u1')).toBe(false);
    });

    it('priorité per-user > global > default complète', () => {
      /* default true */
      expect(featureToggles.isEnabled('studio.music', 'u1')).toBe(true);
      /* global false */
      featureToggles.setGlobal('studio.music', false);
      expect(featureToggles.isEnabled('studio.music', 'u1')).toBe(false);
      /* per-user true */
      featureToggles.setForUser('studio.music', 'u1', true);
      expect(featureToggles.isEnabled('studio.music', 'u1')).toBe(true);
    });
  });

  describe('Bulk operations', () => {
    it('enableAll active toutes les features', () => {
      featureToggles.disableAll();
      featureToggles.enableAll();
      const all = featureToggles.list();
      for (const f of all) {
        expect(featureToggles.isEnabledGlobal(f.id)).toBe(true);
      }
    });

    it('disableAll désactive toutes les features', () => {
      featureToggles.disableAll();
      const all = featureToggles.list();
      for (const f of all) {
        expect(featureToggles.isEnabledGlobal(f.id)).toBe(false);
      }
    });

    it('resetDefaults supprime overrides → retour aux defaults', () => {
      featureToggles.setGlobal('studio.music', false);
      featureToggles.setGlobal('voice.elevenlabs', true);
      featureToggles.resetDefaults();
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(true); /* default true */
      expect(featureToggles.isEnabledGlobal('voice.elevenlabs')).toBe(false); /* default false */
    });

    it('enableAll écrit audit', () => {
      featureToggles.enableAll('kevin');
      const hist = featureToggles.getHistory();
      const last = hist[hist.length - 1];
      expect(last?.action).toBe('enable_all');
      expect(last?.actor).toBe('kevin');
    });

    it('disableAll écrit audit', () => {
      featureToggles.disableAll();
      const hist = featureToggles.getHistory();
      const last = hist[hist.length - 1];
      expect(last?.action).toBe('disable_all');
    });

    it('resetDefaults écrit audit', () => {
      featureToggles.resetDefaults();
      const hist = featureToggles.getHistory();
      const last = hist[hist.length - 1];
      expect(last?.action).toBe('reset_defaults');
    });
  });

  describe('Audit history', () => {
    it('history capped at MAX_HISTORY (500)', () => {
      for (let i = 0; i < 510; i++) {
        featureToggles.setGlobal('studio.music', i % 2 === 0);
      }
      const hist = featureToggles.getHistory();
      expect(hist.length).toBeLessThanOrEqual(500);
    });

    it('history contient ts pour chaque entrée', () => {
      featureToggles.setGlobal('studio.music', false);
      const hist = featureToggles.getHistory();
      const last = hist[hist.length - 1];
      expect(last?.ts).toBeGreaterThan(0);
    });
  });

  describe('exportConfig / importConfig', () => {
    it('exportConfig produit JSON valide', () => {
      featureToggles.setGlobal('studio.music', false);
      featureToggles.setForUser('studio.video', 'laurence', false);
      const json = featureToggles.exportConfig();
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed['version']).toBe(1);
      expect(parsed['global']).toBeTruthy();
      expect(parsed['users']).toBeTruthy();
    });

    it('importConfig roundtrip', () => {
      featureToggles.setGlobal('studio.music', false);
      featureToggles.setForUser('studio.video', 'laurence', false);
      const json = featureToggles.exportConfig();
      featureToggles.resetDefaults();
      /* clear users aussi */
      localStorage.removeItem('ax_feature_toggles_user_laurence');
      const r = featureToggles.importConfig(json);
      expect(r.ok).toBe(true);
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(false);
      expect(featureToggles.isEnabledForUser('studio.video', 'laurence')).toBe(false);
    });

    it('importConfig invalide JSON → ok false', () => {
      const r = featureToggles.importConfig('not valid json');
      expect(r.ok).toBe(false);
    });

    it('importConfig avec ids inconnus → skipped', () => {
      const r = featureToggles.importConfig(
        JSON.stringify({ global: { 'studio.music': false, 'not.exists': true } }),
      );
      expect(r.ok).toBe(true);
      expect(r.appliedGlobal).toBe(1);
      expect(r.skipped).toBe(1);
    });

    it('importConfig nul → ok false', () => {
      const r = featureToggles.importConfig('null');
      expect(r.ok).toBe(false);
    });

    it('importConfig users invalides → skip', () => {
      const r = featureToggles.importConfig(
        JSON.stringify({ users: { laurence: { 'not.exists': true } } }),
      );
      expect(r.ok).toBe(true);
      expect(r.skipped).toBe(1);
      expect(r.appliedUsers).toBe(0);
    });
  });

  describe('getStats', () => {
    it('total = registry length', () => {
      const stats = featureToggles.getStats();
      expect(stats.total).toBe(featureToggles.list().length);
    });

    it('enabledGlobal + disabledGlobal = total', () => {
      const stats = featureToggles.getStats();
      expect(stats.enabledGlobal + stats.disabledGlobal).toBe(stats.total);
    });

    it('users count après setForUser', () => {
      featureToggles.setForUser('studio.music', 'u1', false);
      featureToggles.setForUser('studio.music', 'u2', false);
      const stats = featureToggles.getStats();
      expect(stats.users).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Helper isFeatureEnabled', () => {
    it('exporté et fonctionne', () => {
      expect(isFeatureEnabled('studio.music')).toBe(true);
      featureToggles.setGlobal('studio.music', false);
      expect(isFeatureEnabled('studio.music')).toBe(false);
    });

    it('per-user via helper', () => {
      featureToggles.setForUser('studio.music', 'laurence', false);
      expect(isFeatureEnabled('studio.music', 'laurence')).toBe(false);
    });
  });

  describe('renderDisabledNotice', () => {
    it('produit un HTML avec description', () => {
      const html = renderDisabledNotice('studio.music');
      expect(html).toContain('Module désactivé');
      expect(html).toContain('Studio Mix Musique');
    });

    it('produit fallback si feature inconnue', () => {
      const html = renderDisabledNotice('not.exists');
      expect(html).toContain('not.exists');
    });
  });

  describe('Edge cases & robustness', () => {
    it('localStorage corrompu → readJsonSafe fallback {}', () => {
      localStorage.setItem('ax_feature_toggles_global', 'corrupted{');
      /* Pas de throw, on doit tomber sur defaults */
      expect(featureToggles.isEnabledGlobal('studio.music')).toBe(true);
    });

    it('multiple overrides per-user indépendants', () => {
      featureToggles.setForUser('studio.music', 'u1', false);
      featureToggles.setForUser('studio.music', 'u2', true);
      expect(featureToggles.isEnabledForUser('studio.music', 'u1')).toBe(false);
      expect(featureToggles.isEnabledForUser('studio.music', 'u2')).toBe(true);
    });

    it('isEnabledForUser sans userId → fallback global', () => {
      featureToggles.setGlobal('studio.music', false);
      expect(featureToggles.isEnabledForUser('studio.music', '')).toBe(false);
    });
  });
});
