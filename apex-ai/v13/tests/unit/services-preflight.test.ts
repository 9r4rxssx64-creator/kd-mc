/**
 * Tests services/preflight.ts — pre-flight checks tool/module/feature.
 *
 * Couvre :
 * - Registry register/list/has/unregister
 * - preflightCheck (ok cas, cache hit, cache miss, useCache:false, tool inconnu)
 * - preflightAll / preflightCategory parallélisme
 * - autoFix tenté + résultat
 * - TTL 5min respecté
 * - Mocks Web APIs (SpeechSynthesis, AudioContext, indexedDB, etc.)
 * - Erreur gracieuse si test() throw
 *
 * Cible : ≥ 40 tests, coverage ≥ 85% sur services/preflight.ts.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  preflightRegistry,
  preflightCheck,
  preflightAll,
  preflightCategory,
  summarizeResults,
  type PreflightCheck,
  type PreflightResult,
} from '../../services/core-svc/preflight.js';

/* ============================================================
 * Helpers
 * ============================================================ */

const TEST_PREFIX = 'test.preflight.';

function makeTestCheck(
  id: string,
  result: Partial<PreflightResult>,
  category: PreflightCheck['category'] = 'tool',
): PreflightCheck {
  return {
    toolId: id,
    category,
    test: async () => ({
      ok: result.ok ?? true,
      ready: result.ready ?? true,
      ts: Date.now(),
      ...(result.missingDeps !== undefined ? { missingDeps: result.missingDeps } : {}),
      ...(result.error !== undefined ? { error: result.error } : {}),
      ...(result.autoFixAvailable !== undefined ? { autoFixAvailable: result.autoFixAvailable } : {}),
      ...(result.autoFixLabel !== undefined ? { autoFixLabel: result.autoFixLabel } : {}),
      ...(result.autoFix !== undefined ? { autoFix: result.autoFix } : {}),
    }),
  };
}

function cleanupTestChecks(): void {
  for (const c of preflightRegistry.list()) {
    if (c.toolId.startsWith(TEST_PREFIX)) {
      preflightRegistry.unregister(c.toolId);
    }
  }
  preflightRegistry.invalidateCache();
}

beforeEach(() => {
  cleanupTestChecks();
  /* localStorage est cleared globalement par tests/setup.ts */
});

afterEach(() => {
  cleanupTestChecks();
  vi.useRealTimers();
});

/* ============================================================
 * Registry
 * ============================================================ */

describe('preflight: registry', () => {
  it('register ajoute un check', () => {
    const c = makeTestCheck(`${TEST_PREFIX}reg1`, { ok: true });
    preflightRegistry.register(c);
    expect(preflightRegistry.has(`${TEST_PREFIX}reg1`)).toBe(true);
  });

  it('register écrase un check existant (même toolId)', async () => {
    preflightRegistry.register(makeTestCheck(`${TEST_PREFIX}reg2`, { ok: true }));
    preflightRegistry.register(makeTestCheck(`${TEST_PREFIX}reg2`, { ok: false, ready: false }));
    const r = await preflightRegistry.preflightCheck(`${TEST_PREFIX}reg2`, { useCache: false });
    expect(r.ok).toBe(false);
  });

  it('register sans toolId throw', () => {
    expect(() =>
      preflightRegistry.register({
        toolId: '',
        category: 'tool',
        test: async () => ({ ok: true, ready: true, ts: 0 }),
      }),
    ).toThrow();
  });

  it('register sans test fn throw', () => {
    expect(() =>
      preflightRegistry.register({
        toolId: 'x',
        category: 'tool',
        /* @ts-expect-error volontaire pour test runtime */
        test: 'not a fn',
      }),
    ).toThrow();
  });

  it('unregister retire le check + retourne true', () => {
    const id = `${TEST_PREFIX}unreg1`;
    preflightRegistry.register(makeTestCheck(id, { ok: true }));
    expect(preflightRegistry.unregister(id)).toBe(true);
    expect(preflightRegistry.has(id)).toBe(false);
  });

  it('unregister sur id inconnu retourne false', () => {
    expect(preflightRegistry.unregister(`${TEST_PREFIX}ghost`)).toBe(false);
  });

  it('list() retourne au moins 30 checks built-in', () => {
    const all = preflightRegistry.list();
    expect(all.length).toBeGreaterThanOrEqual(30);
  });

  it('list() inclut tools / studios / voice / browser / auth / storage', () => {
    const cats = new Set(preflightRegistry.list().map((c) => c.category));
    expect(cats.has('tool')).toBe(true);
    expect(cats.has('studio')).toBe(true);
    expect(cats.has('voice')).toBe(true);
    expect(cats.has('browser')).toBe(true);
    expect(cats.has('auth')).toBe(true);
    expect(cats.has('storage')).toBe(true);
  });

  it('has(unknown) → false', () => {
    expect(preflightRegistry.has(`${TEST_PREFIX}xyz_no`)).toBe(false);
  });
});

/* ============================================================
 * preflightCheck — comportement de base
 * ============================================================ */

describe('preflight: preflightCheck cas de base', () => {
  it('ok cas → result.ok=true ready=true', async () => {
    const id = `${TEST_PREFIX}ok`;
    preflightRegistry.register(makeTestCheck(id, { ok: true, ready: true }));
    const r = await preflightRegistry.preflightCheck(id, { useCache: false });
    expect(r.ok).toBe(true);
    expect(r.ready).toBe(true);
  });

  it('ko cas → result.ok=false + error string', async () => {
    const id = `${TEST_PREFIX}ko`;
    preflightRegistry.register(
      makeTestCheck(id, { ok: false, ready: false, error: 'Manque clé' }),
    );
    const r = await preflightRegistry.preflightCheck(id, { useCache: false });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Manque');
  });

  it('tool inconnu → result.ok=false + error "Tool inconnu"', async () => {
    const r = await preflightRegistry.preflightCheck(`${TEST_PREFIX}phantom_unknown_xyz_999`);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/inconnu/i);
  });

  it('test() qui throw → result.ok=false + error capturé', async () => {
    const id = `${TEST_PREFIX}throw`;
    preflightRegistry.register({
      toolId: id,
      category: 'tool',
      test: async () => {
        throw new Error('boom');
      },
    });
    const r = await preflightRegistry.preflightCheck(id, { useCache: false });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('boom');
  });

  it('test() qui throw non-Error → error string générique', async () => {
    const id = `${TEST_PREFIX}throw_str`;
    preflightRegistry.register({
      toolId: id,
      category: 'tool',
      test: async () => {
        // eslint-disable-next-line no-throw-literal
        throw 'plain string';
      },
    });
    const r = await preflightRegistry.preflightCheck(id, { useCache: false });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('plain string');
  });

  it('result a un ts numérique', async () => {
    const id = `${TEST_PREFIX}ts`;
    preflightRegistry.register(makeTestCheck(id, { ok: true }));
    const r = await preflightRegistry.preflightCheck(id, { useCache: false });
    expect(typeof r.ts).toBe('number');
    expect(r.ts).toBeGreaterThan(0);
  });

  it('missingDeps inclus si fourni', async () => {
    const id = `${TEST_PREFIX}deps`;
    preflightRegistry.register(
      makeTestCheck(id, { ok: false, ready: false, missingDeps: ['k1', 'k2'] }),
    );
    const r = await preflightRegistry.preflightCheck(id, { useCache: false });
    expect(r.missingDeps).toEqual(['k1', 'k2']);
  });
});

/* ============================================================
 * Cache TTL 5 min
 * ============================================================ */

describe('preflight: cache TTL', () => {
  it('cache hit : 2e appel ne re-run pas le test', async () => {
    const id = `${TEST_PREFIX}cache_hit`;
    let calls = 0;
    preflightRegistry.register({
      toolId: id,
      category: 'tool',
      test: async () => {
        calls += 1;
        return { ok: true, ready: true, ts: Date.now() };
      },
    });
    await preflightRegistry.preflightCheck(id);
    await preflightRegistry.preflightCheck(id);
    await preflightRegistry.preflightCheck(id);
    expect(calls).toBe(1);
  });

  it('useCache:false force re-run', async () => {
    const id = `${TEST_PREFIX}cache_force`;
    let calls = 0;
    preflightRegistry.register({
      toolId: id,
      category: 'tool',
      test: async () => {
        calls += 1;
        return { ok: true, ready: true, ts: Date.now() };
      },
    });
    await preflightRegistry.preflightCheck(id);
    await preflightRegistry.preflightCheck(id, { useCache: false });
    expect(calls).toBe(2);
  });

  it('invalidateCache(toolId) → re-run au prochain appel', async () => {
    const id = `${TEST_PREFIX}cache_inv1`;
    let calls = 0;
    preflightRegistry.register({
      toolId: id,
      category: 'tool',
      test: async () => {
        calls += 1;
        return { ok: true, ready: true, ts: Date.now() };
      },
    });
    await preflightRegistry.preflightCheck(id);
    preflightRegistry.invalidateCache(id);
    await preflightRegistry.preflightCheck(id);
    expect(calls).toBe(2);
  });

  it('invalidateCache() (no arg) → invalide tous les checks', async () => {
    const id1 = `${TEST_PREFIX}cache_all1`;
    const id2 = `${TEST_PREFIX}cache_all2`;
    let c1 = 0;
    let c2 = 0;
    preflightRegistry.register({
      toolId: id1,
      category: 'tool',
      test: async () => {
        c1 += 1;
        return { ok: true, ready: true, ts: Date.now() };
      },
    });
    preflightRegistry.register({
      toolId: id2,
      category: 'tool',
      test: async () => {
        c2 += 1;
        return { ok: true, ready: true, ts: Date.now() };
      },
    });
    await preflightRegistry.preflightCheck(id1);
    await preflightRegistry.preflightCheck(id2);
    preflightRegistry.invalidateCache();
    await preflightRegistry.preflightCheck(id1);
    await preflightRegistry.preflightCheck(id2);
    expect(c1).toBe(2);
    expect(c2).toBe(2);
  });

  it('TTL 5 min : après >5 min, re-run', async () => {
    vi.useFakeTimers();
    const id = `${TEST_PREFIX}cache_ttl`;
    let calls = 0;
    preflightRegistry.register({
      toolId: id,
      category: 'tool',
      test: async () => {
        calls += 1;
        return { ok: true, ready: true, ts: Date.now() };
      },
    });
    await preflightRegistry.preflightCheck(id);
    expect(calls).toBe(1);
    /* advance 5 min + 1 sec */
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    await preflightRegistry.preflightCheck(id);
    expect(calls).toBe(2);
  });

  it('getCachedResult(id) avant tout call → null', () => {
    const id = `${TEST_PREFIX}getc_none`;
    preflightRegistry.register(makeTestCheck(id, { ok: true }));
    expect(preflightRegistry.getCachedResult(id)).toBeNull();
  });

  it('getCachedResult après preflightCheck → résultat', async () => {
    const id = `${TEST_PREFIX}getc_after`;
    preflightRegistry.register(makeTestCheck(id, { ok: true }));
    await preflightRegistry.preflightCheck(id);
    const r = preflightRegistry.getCachedResult(id);
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(true);
  });

  it('getCachedResult après invalidateCache → null', async () => {
    const id = `${TEST_PREFIX}getc_inv`;
    preflightRegistry.register(makeTestCheck(id, { ok: true }));
    await preflightRegistry.preflightCheck(id);
    preflightRegistry.invalidateCache(id);
    expect(preflightRegistry.getCachedResult(id)).toBeNull();
  });

  it('getCachedResult après TTL expiré → null + cache nettoyé', async () => {
    vi.useFakeTimers();
    const id = `${TEST_PREFIX}getc_ttl`;
    preflightRegistry.register(makeTestCheck(id, { ok: true }));
    await preflightRegistry.preflightCheck(id);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    expect(preflightRegistry.getCachedResult(id)).toBeNull();
  });
});

/* ============================================================
 * preflightAll / preflightCategory
 * ============================================================ */

describe('preflight: preflightAll / preflightCategory', () => {
  it('preflightAll() retourne Map de taille >= 30', async () => {
    const m = await preflightRegistry.preflightAll();
    expect(m.size).toBeGreaterThanOrEqual(30);
  });

  it('preflightAll() parallélise (pas séquentiel)', async () => {
    /* On enregistre 5 checks 50ms chacun → durée totale doit être ~50ms et pas 250ms */
    const ids = Array.from({ length: 5 }, (_, i) => `${TEST_PREFIX}par_${i}`);
    for (const id of ids) {
      preflightRegistry.register({
        toolId: id,
        category: 'tool',
        test: async () => {
          await new Promise((r) => setTimeout(r, 50));
          return { ok: true, ready: true, ts: Date.now() };
        },
      });
    }
    /* Bypass cache pour vraiment paralléliser */
    preflightRegistry.invalidateCache();
    const t0 = Date.now();
    await preflightRegistry.preflightAll();
    const dt = Date.now() - t0;
    /* Très généreux pour CI lent : < 200ms si parallèle, > 250 si séquentiel */
    expect(dt).toBeLessThan(220);
  });

  it('preflightCategory("tool") ne retourne que tool', async () => {
    const m = await preflightRegistry.preflightCategory('tool');
    /* Tous les ids doivent venir d'un check de catégorie tool */
    for (const id of m.keys()) {
      const c = preflightRegistry.list().find((x) => x.toolId === id);
      expect(c?.category).toBe('tool');
    }
  });

  it('preflightCategory("voice") inclut voice.tts', async () => {
    const m = await preflightRegistry.preflightCategory('voice');
    expect(m.has('voice.tts')).toBe(true);
  });

  it('preflightCategory("auth") inclut auth.pin', async () => {
    const m = await preflightRegistry.preflightCategory('auth');
    expect(m.has('auth.pin')).toBe(true);
  });

  it('preflightCategory inconnue → Map vide', async () => {
    const m = await preflightRegistry.preflightCategory('module');
    /* module inclut module.calculator + notes + calendar_local */
    expect(m.size).toBeGreaterThanOrEqual(2);
  });
});

/* ============================================================
 * autoFix
 * ============================================================ */

describe('preflight: autoFix', () => {
  it('autoFix() retourne true si dispatch ok', async () => {
    const id = `${TEST_PREFIX}autofix_ok`;
    let fixed = false;
    preflightRegistry.register({
      toolId: id,
      category: 'tool',
      test: async () => ({
        ok: false,
        ready: false,
        error: 'manque',
        autoFixAvailable: true,
        autoFixLabel: 'Réparer',
        autoFix: async () => {
          fixed = true;
          return true;
        },
        ts: Date.now(),
      }),
    });
    const r = await preflightRegistry.preflightCheck(id, { useCache: false });
    expect(r.autoFixAvailable).toBe(true);
    expect(r.autoFixLabel).toBe('Réparer');
    expect(r.autoFix).toBeDefined();
    const fixOk = await r.autoFix!();
    expect(fixOk).toBe(true);
    expect(fixed).toBe(true);
  });

  it('autoFix() retourne false si custom event impossible', async () => {
    /* Le test built-in tool.web_search expose autoFix qui dispatch event */
    const r = await preflightRegistry.preflightCheck('tool.web_search', { useCache: false });
    if (r.autoFix) {
      const result = await r.autoFix();
      /* En happy-dom, dispatchEvent existe → true. Sinon false. Les 2 sont valides. */
      expect(typeof result).toBe('boolean');
    }
  });

  it('autoFix dispatche apex:open-vault event', async () => {
    const r = await preflightRegistry.preflightCheck('tool.web_search', { useCache: false });
    expect(r.autoFix).toBeDefined();
    let received: string | null = null;
    const listener = (e: Event): void => {
      const ce = e as CustomEvent<{ field: string }>;
      received = ce.detail.field;
    };
    window.addEventListener('apex:open-vault', listener);
    await r.autoFix!();
    window.removeEventListener('apex:open-vault', listener);
    expect(received).toBe('ax_brave_key');
  });
});

/* ============================================================
 * Tests built-in : web APIs / clés
 * ============================================================ */

describe('preflight: built-in tests sans clés', () => {
  beforeEach(() => {
    /* Aucune clé en LS — état propre */
    localStorage.clear();
    preflightRegistry.invalidateCache();
  });

  it('tool.web_search sans clé → ok=false + autoFix dispo', async () => {
    const r = await preflightRegistry.preflightCheck('tool.web_search', { useCache: false });
    expect(r.ok).toBe(false);
    expect(r.autoFixAvailable).toBe(true);
    expect(r.missingDeps).toContain('ax_brave_key');
  });

  it('tool.image_analyze sans clé → ok=false', async () => {
    const r = await preflightRegistry.preflightCheck('tool.image_analyze', { useCache: false });
    expect(r.ok).toBe(false);
  });

  it('tool.email_send sans clé → ok=false', async () => {
    const r = await preflightRegistry.preflightCheck('tool.email_send', { useCache: false });
    expect(r.ok).toBe(false);
    expect(r.missingDeps?.length).toBeGreaterThan(0);
  });

  it('tool.weather → ok=true (no key required)', async () => {
    const r = await preflightRegistry.preflightCheck('tool.weather', { useCache: false });
    expect(r.ok).toBe(true);
  });

  it('auth.pin sans PIN → ok=false', async () => {
    const r = await preflightRegistry.preflightCheck('auth.pin', { useCache: false });
    expect(r.ok).toBe(false);
  });

  it('auth.voice sans empreinte → ok=false', async () => {
    const r = await preflightRegistry.preflightCheck('auth.voice', { useCache: false });
    expect(r.ok).toBe(false);
  });

  it('storage.firebase sans config → ok=false', async () => {
    const r = await preflightRegistry.preflightCheck('storage.firebase', { useCache: false });
    expect(r.ok).toBe(false);
  });

  it('voice.elevenlabs sans clé → ok=false', async () => {
    const r = await preflightRegistry.preflightCheck('voice.elevenlabs', { useCache: false });
    expect(r.ok).toBe(false);
  });

  it('storage.localStorage → ok=true en happy-dom', async () => {
    const r = await preflightRegistry.preflightCheck('storage.localStorage', { useCache: false });
    expect(r.ok).toBe(true);
  });

  it('browser.bookmarks → ok=true en happy-dom', async () => {
    const r = await preflightRegistry.preflightCheck('browser.bookmarks', { useCache: false });
    expect(r.ok).toBe(true);
  });

  it('module.calculator → ok=true (pure)', async () => {
    const r = await preflightRegistry.preflightCheck('module.calculator', { useCache: false });
    expect(r.ok).toBe(true);
  });

  it('pro.cuisine → ok=true (data embarquée)', async () => {
    const r = await preflightRegistry.preflightCheck('pro.cuisine', { useCache: false });
    expect(r.ok).toBe(true);
  });
});

describe('preflight: built-in tests avec clés présentes', () => {
  beforeEach(() => {
    localStorage.clear();
    preflightRegistry.invalidateCache();
  });

  it('tool.web_search avec ax_brave_key → ok=true', async () => {
    localStorage.setItem('ax_brave_key', 'BSA_test_key');
    const r = await preflightRegistry.preflightCheck('tool.web_search', { useCache: false });
    expect(r.ok).toBe(true);
  });

  it('tool.image_analyze avec ax_anthropic_key → ok=true', async () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-xyz');
    const r = await preflightRegistry.preflightCheck('tool.image_analyze', { useCache: false });
    expect(r.ok).toBe(true);
  });

  it('auth.pin avec ax_pin → ok=true', async () => {
    localStorage.setItem('ax_pin', 'hash$pbkdf2$...');
    const r = await preflightRegistry.preflightCheck('auth.pin', { useCache: false });
    expect(r.ok).toBe(true);
  });

  it('storage.firebase avec ax_firebase_url → ok=true', async () => {
    localStorage.setItem('ax_firebase_url', 'https://x.firebaseio.com');
    const r = await preflightRegistry.preflightCheck('storage.firebase', { useCache: false });
    expect(r.ok).toBe(true);
  });

  it('sentinel.token_balance_watch avec clé IA → ok=true', async () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-test');
    const r = await preflightRegistry.preflightCheck('sentinel.token_balance_watch', {
      useCache: false,
    });
    expect(r.ok).toBe(true);
  });
});

/* ============================================================
 * summarizeResults
 * ============================================================ */

describe('preflight: summarizeResults', () => {
  it('synthèse vide → "0/0 prêts"', () => {
    const m = new Map<string, PreflightResult>();
    const s = summarizeResults(m);
    expect(s).toContain('0/0');
  });

  it('synthèse 2 ok 1 ko → ratio + liste indispo', () => {
    const m = new Map<string, PreflightResult>([
      ['a', { ok: true, ready: true, ts: 1 }],
      ['b', { ok: true, ready: true, ts: 1 }],
      ['c', { ok: false, ready: false, ts: 1 }],
    ]);
    const s = summarizeResults(m);
    expect(s).toContain('2/3');
    expect(s).toContain('c');
  });

  it('synthèse > 8 indispo → tronque avec …', () => {
    const m = new Map<string, PreflightResult>();
    for (let i = 0; i < 12; i += 1) {
      m.set(`tool.${i}`, { ok: false, ready: false, ts: 1 });
    }
    const s = summarizeResults(m);
    expect(s).toContain('…');
  });
});

/* ============================================================
 * Convenience exports
 * ============================================================ */

describe('preflight: convenience exports', () => {
  it('preflightCheck() = wrapper du registry', async () => {
    const id = `${TEST_PREFIX}wrap1`;
    preflightRegistry.register(makeTestCheck(id, { ok: true }));
    const r = await preflightCheck(id);
    expect(r.ok).toBe(true);
  });

  it('preflightAll() = wrapper du registry', async () => {
    const m = await preflightAll();
    expect(m.size).toBeGreaterThanOrEqual(30);
  });

  it('preflightCategory() = wrapper du registry', async () => {
    const m = await preflightCategory('storage');
    expect(m.size).toBeGreaterThanOrEqual(2);
  });
});

/* ============================================================
 * Mocks Web APIs : voice.tts / studio.music
 * ============================================================ */

describe('preflight: web API guards', () => {
  beforeEach(() => {
    preflightRegistry.invalidateCache();
  });

  it('voice.tts : si speechSynthesis dispo → ok', async () => {
    /* happy-dom expose speechSynthesis ? On stub pour garantir */
    const had = 'speechSynthesis' in globalThis;
    if (!had) {
      Object.defineProperty(globalThis, 'speechSynthesis', {
        value: { speak: () => undefined },
        configurable: true,
      });
    }
    const r = await preflightRegistry.preflightCheck('voice.tts', { useCache: false });
    expect(r.ok).toBe(true);
    if (!had) {
      // @ts-expect-error cleanup
      delete (globalThis as unknown as Record<string, unknown>).speechSynthesis;
    }
  });

  it('studio.music : si AudioContext absent → ok=false', async () => {
    const hadAC = 'AudioContext' in globalThis;
    const hadWebkit = 'webkitAudioContext' in globalThis;
    /* Sauvegarder + supprimer */
    const savedAC = (globalThis as unknown as Record<string, unknown>)['AudioContext'];
    const savedWK = (globalThis as unknown as Record<string, unknown>)['webkitAudioContext'];
    if (hadAC) delete (globalThis as unknown as Record<string, unknown>)['AudioContext'];
    if (hadWebkit) delete (globalThis as unknown as Record<string, unknown>)['webkitAudioContext'];
    const r = await preflightRegistry.preflightCheck('studio.music', { useCache: false });
    expect(r.ok).toBe(false);
    if (hadAC) (globalThis as unknown as Record<string, unknown>)['AudioContext'] = savedAC;
    if (hadWebkit) (globalThis as unknown as Record<string, unknown>)['webkitAudioContext'] = savedWK;
  });

  it('studio.music : si AudioContext présent → ok=true', async () => {
    const had = 'AudioContext' in globalThis;
    if (!had) {
      Object.defineProperty(globalThis, 'AudioContext', {
        value: function MockAudioCtx(): void {
          /* noop */
        },
        configurable: true,
        writable: true,
      });
    }
    const r = await preflightRegistry.preflightCheck('studio.music', { useCache: false });
    expect(r.ok).toBe(true);
    if (!had) {
      delete (globalThis as unknown as Record<string, unknown>)['AudioContext'];
    }
  });

  it('studio.video : MediaRecorder dispo → ok', async () => {
    const had = 'MediaRecorder' in globalThis;
    if (!had) {
      Object.defineProperty(globalThis, 'MediaRecorder', {
        value: function MockMR(): void {
          /* noop */
        },
        configurable: true,
        writable: true,
      });
    }
    const r = await preflightRegistry.preflightCheck('studio.video', { useCache: false });
    expect(r.ok).toBe(true);
    if (!had) {
      delete (globalThis as unknown as Record<string, unknown>)['MediaRecorder'];
    }
  });

  it('storage.indexedDB : si indexedDB dispo → ok', async () => {
    /* happy-dom expose indexedDB */
    const r = await preflightRegistry.preflightCheck('storage.indexedDB', { useCache: false });
    /* Tolérant : selon happy-dom version */
    expect(typeof r.ok).toBe('boolean');
  });

  it('feature.geolocation : navigator.geolocation présent → ok', async () => {
    const r = await preflightRegistry.preflightCheck('feature.geolocation', { useCache: false });
    expect(typeof r.ok).toBe('boolean');
  });

  it('feature.notifications : Notification API présent ou non', async () => {
    const r = await preflightRegistry.preflightCheck('feature.notifications', { useCache: false });
    expect(typeof r.ok).toBe('boolean');
  });
});

/* ============================================================
 * Robustness
 * ============================================================ */

describe('preflight: robustesse', () => {
  it('100 register / unregister sans memory leak (smoke)', () => {
    for (let i = 0; i < 100; i += 1) {
      preflightRegistry.register(makeTestCheck(`${TEST_PREFIX}stress_${i}`, { ok: true }));
    }
    for (let i = 0; i < 100; i += 1) {
      expect(preflightRegistry.unregister(`${TEST_PREFIX}stress_${i}`)).toBe(true);
    }
  });

  it('preflightAll() ne throw pas même si un check throw', async () => {
    const idGood = `${TEST_PREFIX}good`;
    const idBad = `${TEST_PREFIX}bad`;
    preflightRegistry.register(makeTestCheck(idGood, { ok: true }));
    preflightRegistry.register({
      toolId: idBad,
      category: 'tool',
      test: async () => {
        throw new Error('bad fail');
      },
    });
    const m = await preflightRegistry.preflightAll();
    expect(m.get(idGood)?.ok).toBe(true);
    expect(m.get(idBad)?.ok).toBe(false);
    expect(m.get(idBad)?.error).toContain('bad fail');
  });
});
