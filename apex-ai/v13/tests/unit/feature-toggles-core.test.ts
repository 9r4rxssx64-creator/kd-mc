/**
 * APEX v13 — Tests feature-toggles.ts (cœur class FeatureToggles)
 *
 * Couvre :
 *  - REGISTRY readonly (get/list/listCategories/listByCategory)
 *  - global isEnabled / setGlobal / setGlobalBulk
 *  - per-user isEnabledForUser / setForUser / removeUserOverride
 *  - bulk enableAll / disableAll / resetDefaults
 *  - history + exportConfig + importConfig
 *  - stats + isFeatureEnabled helper + renderDisabledNotice
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  featureToggles,
  isFeatureEnabled,
  renderDisabledNotice,
} from '../../services/auth/feature-toggles.js';

const STORAGE_GLOBAL = 'ax_feature_toggles_global';
const STORAGE_USER_PREFIX = 'ax_feature_toggles_user_';
const STORAGE_HISTORY = 'ax_feature_toggles_history';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('feature-toggles — registry', () => {
  it('list() non vide + entries valides', () => {
    const list = featureToggles.list();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('id');
    expect(list[0]).toHaveProperty('category');
    expect(list[0]).toHaveProperty('description');
    expect(list[0]).toHaveProperty('defaultEnabled');
  });

  it('get() retourne la feature par id', () => {
    const f = featureToggles.get('studio.music');
    expect(f).not.toBeNull();
    expect(f?.id).toBe('studio.music');
  });

  it('get() retourne null pour id inconnu', () => {
    expect(featureToggles.get('totally-unknown-feature')).toBeNull();
  });

  it('listCategories() distinctes', () => {
    const cats = featureToggles.listCategories();
    expect(cats.length).toBeGreaterThan(0);
    const set = new Set(cats);
    expect(set.size).toBe(cats.length); /* unique */
  });

  it('listByCategory() filtre cohérent', () => {
    const studios = featureToggles.listByCategory('studio');
    expect(studios.length).toBeGreaterThan(0);
    for (const f of studios) {
      expect(f.category).toBe('studio');
    }
  });
});

describe('feature-toggles — global', () => {
  it('isEnabledGlobal défaut = defaultEnabled', () => {
    const f = featureToggles.get('studio.music')!;
    expect(featureToggles.isEnabledGlobal('studio.music')).toBe(f.defaultEnabled);
  });

  it('feature inconnue → isEnabledGlobal false', () => {
    expect(featureToggles.isEnabledGlobal('non-existent')).toBe(false);
  });

  it('setGlobal valide retourne true + persist', () => {
    const ok = featureToggles.setGlobal('studio.music', false, 'kevin');
    expect(ok).toBe(true);
    expect(featureToggles.isEnabledGlobal('studio.music')).toBe(false);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_GLOBAL) ?? '{}');
    expect(persisted['studio.music']).toBe(false);
  });

  it('setGlobal feature inconnue retourne false', () => {
    expect(featureToggles.setGlobal('non-exist', true)).toBe(false);
  });

  it('setGlobalBulk applique uniquement valides', () => {
    const r = featureToggles.setGlobalBulk({
      'studio.music': false,
      'studio.video': false,
      'never-existed-x': true,
    });
    expect(r.applied).toBe(2);
    expect(r.skipped).toBe(1);
  });
});

describe('feature-toggles — per-user', () => {
  it('isEnabledForUser sans override → tombe sur global', () => {
    featureToggles.setGlobal('studio.music', false);
    expect(featureToggles.isEnabledForUser('studio.music', 'u1')).toBe(false);
  });

  it('setForUser override per-user', () => {
    featureToggles.setGlobal('studio.music', false);
    featureToggles.setForUser('studio.music', 'u1', true);
    expect(featureToggles.isEnabledForUser('studio.music', 'u1')).toBe(true);
    /* Autre user reste sur global */
    expect(featureToggles.isEnabledForUser('studio.music', 'u2')).toBe(false);
  });

  it('setForUser feature inconnue retourne false', () => {
    expect(featureToggles.setForUser('never-exist', 'u1', true)).toBe(false);
  });

  it('setForUser userId vide retourne false', () => {
    expect(featureToggles.setForUser('studio.music', '', true)).toBe(false);
  });

  it('removeUserOverride restaure global', () => {
    featureToggles.setGlobal('studio.music', true);
    featureToggles.setForUser('studio.music', 'u1', false);
    expect(featureToggles.isEnabledForUser('studio.music', 'u1')).toBe(false);
    expect(featureToggles.removeUserOverride('studio.music', 'u1')).toBe(true);
    expect(featureToggles.isEnabledForUser('studio.music', 'u1')).toBe(true);
  });

  it('removeUserOverride sans override → false', () => {
    expect(featureToggles.removeUserOverride('studio.music', 'u-never')).toBe(false);
  });

  it('isEnabled sans userId = global', () => {
    featureToggles.setGlobal('studio.music', false);
    expect(featureToggles.isEnabled('studio.music')).toBe(false);
  });
});

describe('feature-toggles — bulk', () => {
  it('enableAll active toutes les features', () => {
    const n = featureToggles.enableAll();
    expect(n).toBeGreaterThan(0);
    expect(featureToggles.isEnabledGlobal('studio.music')).toBe(true);
  });

  it('disableAll désactive toutes', () => {
    featureToggles.disableAll();
    expect(featureToggles.isEnabledGlobal('studio.music')).toBe(false);
  });

  it('resetDefaults supprime la map global', () => {
    featureToggles.setGlobal('studio.music', false);
    featureToggles.resetDefaults();
    /* Retombe sur defaultEnabled */
    const f = featureToggles.get('studio.music')!;
    expect(featureToggles.isEnabledGlobal('studio.music')).toBe(f.defaultEnabled);
  });
});

describe('feature-toggles — history', () => {
  it('setGlobal pousse une entrée dans history', () => {
    featureToggles.setGlobal('studio.music', false, 'kevin');
    const hist = featureToggles.getHistory();
    expect(hist.length).toBeGreaterThan(0);
    const last = hist[hist.length - 1];
    expect(last?.action).toBe('set_global');
    expect(last?.actor).toBe('kevin');
    expect(last?.featureId).toBe('studio.music');
  });

  it('history cap MAX_HISTORY (~500 → trim oldest)', () => {
    /* Forcer un grand nombre via le storage direct */
    const big: { ts: number; actor: string; action: string; featureId: string; value: boolean }[] = [];
    for (let i = 0; i < 510; i++) {
      big.push({ ts: i, actor: 'a', action: 'set_global', featureId: 'studio.music', value: true });
    }
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(big));
    /* Trigger un appendHistory via setGlobal */
    featureToggles.setGlobal('studio.music', false);
    const hist = featureToggles.getHistory();
    expect(hist.length).toBeLessThanOrEqual(500);
  });
});

describe('feature-toggles — export/import', () => {
  it('exportConfig + importConfig roundtrip', () => {
    featureToggles.setGlobal('studio.music', false);
    featureToggles.setForUser('studio.video', 'u1', false);
    const json = featureToggles.exportConfig();
    expect(json).toContain('studio.music');
    expect(json).toContain('"version"');

    /* Reset + reimport */
    localStorage.clear();
    const r = featureToggles.importConfig(json);
    expect(r.ok).toBe(true);
    expect(r.appliedGlobal).toBeGreaterThan(0);
    expect(featureToggles.isEnabledForUser('studio.video', 'u1')).toBe(false);
  });

  it('importConfig JSON invalide → ok=false', () => {
    const r = featureToggles.importConfig('not json');
    expect(r.ok).toBe(false);
  });

  it('importConfig objet vide → ok=true mais 0 appliqué', () => {
    const r = featureToggles.importConfig('{}');
    expect(r.ok).toBe(true);
    expect(r.appliedGlobal).toBe(0);
  });

  it('importConfig features inconnues → skipped', () => {
    const r = featureToggles.importConfig(JSON.stringify({
      global: { 'unknown-x': true, 'studio.music': false },
    }));
    expect(r.ok).toBe(true);
    expect(r.appliedGlobal).toBe(1);
    expect(r.skipped).toBe(1);
  });
});

describe('feature-toggles — stats', () => {
  it('getStats compte cohérent', () => {
    const s = featureToggles.getStats();
    expect(s.total).toBeGreaterThan(0);
    expect(s.enabledGlobal + s.disabledGlobal).toBe(s.total);
  });

  it('getStats compte users avec override', () => {
    featureToggles.setForUser('studio.music', 'u1', false);
    featureToggles.setForUser('studio.music', 'u2', false);
    const s = featureToggles.getStats();
    expect(s.users).toBe(2);
  });
});

describe('feature-toggles — helpers exportés', () => {
  it('isFeatureEnabled() (helper) délègue à featureToggles.isEnabled', () => {
    featureToggles.setGlobal('studio.music', false);
    expect(isFeatureEnabled('studio.music')).toBe(false);
  });

  it('isFeatureEnabled avec userId propage', () => {
    featureToggles.setGlobal('studio.music', false);
    featureToggles.setForUser('studio.music', 'u1', true);
    expect(isFeatureEnabled('studio.music', 'u1')).toBe(true);
    expect(isFeatureEnabled('studio.music', 'u2')).toBe(false);
  });

  it('renderDisabledNotice contient description feature', () => {
    const html = renderDisabledNotice('studio.music');
    expect(html).toContain('Module désactivé');
    expect(html).toContain('Studio Mix Musique');
  });

  it('renderDisabledNotice feature inconnue → fallback id', () => {
    const html = renderDisabledNotice('really-unknown');
    expect(html).toContain('really-unknown');
  });
});

describe('feature-toggles — readJsonSafe robustesse', () => {
  it('global storage JSON corrompu → tombe sur defaults', () => {
    localStorage.setItem(STORAGE_GLOBAL, 'not json');
    /* isEnabledGlobal doit tomber sur defaultEnabled */
    const f = featureToggles.get('studio.music')!;
    expect(featureToggles.isEnabledGlobal('studio.music')).toBe(f.defaultEnabled);
  });

  it('user storage JSON corrompu → tombe sur global', () => {
    localStorage.setItem(STORAGE_USER_PREFIX + 'u1', 'broken');
    featureToggles.setGlobal('studio.music', false);
    expect(featureToggles.isEnabledForUser('studio.music', 'u1')).toBe(false);
  });
});
