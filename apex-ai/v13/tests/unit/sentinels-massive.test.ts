/**
 * Tests massifs sentinels.ts (71% → 95%+).
 * Couvre register, runOne, executeSentinel, autoFix path, persist, enable/disable,
 * init load saved, scheduleRun coverage minimal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sentinels, registerCoreSentinels } from '../../services/sentinels/sentinels.js';

describe('sentinels massive coverage Jet 8 final', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('register + list + enable', () => {
    it('register sentinelle custom + list la trouve', () => {
      sentinels.register({
        id: 'test-sentinel-custom',
        name: 'Custom Test',
        desc: 'Test only',
        intervalMs: 60000,
        check: async () => ({ ok: true, msg: 'OK' }),
      });
      const found = sentinels.list().find((s) => s.id === 'test-sentinel-custom');
      expect(found).toBeDefined();
      expect(found?.enabled).toBe(true);
    });

    it('register avec enabled=false → désactivée par défaut', () => {
      sentinels.register({
        id: 'test-disabled',
        name: 'Disabled Test',
        desc: 'Should be off',
        intervalMs: 60000,
        check: async () => ({ ok: true, msg: 'OK' }),
        enabled: false,
      });
      const found = sentinels.list().find((s) => s.id === 'test-disabled');
      expect(found?.enabled).toBe(false);
    });

    it('enable() change le state d\'une sentinelle', () => {
      sentinels.register({
        id: 'test-toggle',
        name: 'Toggle',
        desc: 'x',
        intervalMs: 60000,
        check: async () => ({ ok: true, msg: 'x' }),
        enabled: true,
      });
      sentinels.enable('test-toggle', false);
      const s = sentinels.list().find((x) => x.id === 'test-toggle');
      expect(s?.enabled).toBe(false);
      sentinels.enable('test-toggle', true);
      expect(sentinels.list().find((x) => x.id === 'test-toggle')?.enabled).toBe(true);
    });

    it('enable() sur id inconnu → no-op silencieux (no throw)', () => {
      let threw = false;
      try {
        sentinels.enable('unknown-sentinel-xyz', false);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('runOne (force exec)', () => {
    it('runOne sur id inconnu → ok=false avec msg unknown', async () => {
      const result = await sentinels.runOne('non-existent-' + Date.now());
      expect(result?.ok).toBe(false);
      expect(result?.msg).toContain('unknown');
    });

    it('runOne sentinelle ok=true → result ok + msg + ts', async () => {
      sentinels.register({
        id: 'test-success',
        name: 'Success',
        desc: 'x',
        intervalMs: 60000,
        check: async () => ({ ok: true, msg: 'all good' }),
      });
      const result = await sentinels.runOne('test-success');
      expect(result?.ok).toBe(true);
      expect(result?.msg).toBe('all good');
      expect(result?.ts).toBeGreaterThan(0);
    });

    it('runOne check() throw → capture error + result ok=false', async () => {
      sentinels.register({
        id: 'test-throw',
        name: 'Throw',
        desc: 'x',
        intervalMs: 60000,
        check: async () => {
          throw new Error('check exploded');
        },
      });
      const result = await sentinels.runOne('test-throw');
      expect(result?.ok).toBe(false);
      expect(result?.msg).toContain('check exploded');
    });

    it('runOne ok=false + autoFix réussit → re-check OK final', async () => {
      let fixedFlag = false;
      sentinels.register({
        id: 'test-autofix-success',
        name: 'AutoFix',
        desc: 'x',
        intervalMs: 60000,
        check: async () => ({ ok: fixedFlag, msg: fixedFlag ? 'fixed' : 'broken' }),
        autoFix: async () => {
          fixedFlag = true;
          return { ok: true, msg: 'fixed it' };
        },
      });
      const result = await sentinels.runOne('test-autofix-success');
      /* Après autoFix, recheck OK → lastResult marquée auto-fixed */
      expect(result?.ok).toBe(true);
      expect(result?.msg).toContain('Auto-fixed');
    });

    it('runOne ok=false + autoFix échoue → result reste ok=false', async () => {
      sentinels.register({
        id: 'test-autofix-fail',
        name: 'AutoFix Fail',
        desc: 'x',
        intervalMs: 60000,
        check: async () => ({ ok: false, msg: 'broken' }),
        autoFix: async () => ({ ok: false, msg: 'cant fix' }),
      });
      const result = await sentinels.runOne('test-autofix-fail');
      expect(result?.ok).toBe(false);
    });

    it('runOne autoFix throw → capture error + no crash', async () => {
      sentinels.register({
        id: 'test-autofix-throw',
        name: 'AutoFix Throw',
        desc: 'x',
        intervalMs: 60000,
        check: async () => ({ ok: false, msg: 'broken' }),
        autoFix: async () => {
          throw new Error('fix exploded');
        },
      });
      let threw = false;
      try {
        await sentinels.runOne('test-autofix-throw');
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('persist + init', () => {
    it('persist écrit lastRun + lastResult dans apex_v13_sentinels', async () => {
      sentinels.register({
        id: 'test-persist',
        name: 'Persist',
        desc: 'x',
        intervalMs: 60000,
        check: async () => ({ ok: true, msg: 'persisted' }),
      });
      await sentinels.runOne('test-persist');
      const raw = localStorage.getItem('apex_v13_sentinels');
      expect(raw).toBeTruthy();
      const data = JSON.parse(raw!) as Record<string, { lastRun: number; lastResult?: { ok: boolean } }>;
      expect(data['test-persist']).toBeDefined();
      expect(data['test-persist']?.lastResult?.ok).toBe(true);
    });

    it('init() restore lastRun + lastResult depuis localStorage', () => {
      sentinels.register({
        id: 'test-restore',
        name: 'Restore',
        desc: 'x',
        intervalMs: 60000,
        check: async () => ({ ok: true, msg: 'x' }),
      });
      const fakeData = {
        'test-restore': {
          lastRun: 12345,
          lastResult: { ok: false, msg: 'previous fail', ts: 12345 },
        },
      };
      localStorage.setItem('apex_v13_sentinels', JSON.stringify(fakeData));
      sentinels.init();
      const s = sentinels.list().find((x) => x.id === 'test-restore');
      expect(s?.lastRun).toBe(12345);
      expect(s?.lastResult?.msg).toBe('previous fail');
    });

    it('init() avec localStorage corrompu → gracefull (no throw)', () => {
      localStorage.setItem('apex_v13_sentinels', 'INVALID_JSON{{');
      let threw = false;
      try {
        sentinels.init();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('registerCoreSentinels (13 sentinelles MVP)', () => {
    it('registerCoreSentinels enregistre 13+ sentinelles', () => {
      registerCoreSentinels();
      const all = sentinels.list();
      /* Au moins 13 sentinelles core (12 actives + wake-watch disabled) */
      expect(all.length).toBeGreaterThanOrEqual(13);
    });

    it('registerCoreSentinels — wake-watch est disabled par défaut', () => {
      registerCoreSentinels();
      const wakeWatch = sentinels.list().find((s) => s.id === 'wake-watch');
      expect(wakeWatch).toBeDefined();
      expect(wakeWatch?.enabled).toBe(false);
    });

    it('presence-watch a un autoFix qui refresh lastact', async () => {
      registerCoreSentinels();
      const presence = sentinels.list().find((s) => s.id === 'presence-watch');
      expect(presence?.autoFix).toBeDefined();
      if (presence?.autoFix) {
        const result = await presence.autoFix();
        expect(result.ok).toBe(true);
        expect(result.msg).toContain('refreshed');
      }
    });

    it('compliance-watch sans user → état initial OK (Sprint 13.3.17)', async () => {
      registerCoreSentinels();
      /* Sprint 13.3.17 : pas de user logged → pas de consent à tracer = OK. */
      const result = await sentinels.runOne('compliance-watch');
      expect(result?.ok).toBe(true);
    });

    it('compliance-watch OK si consent enregistré', async () => {
      registerCoreSentinels();
      localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kevin' }));
      localStorage.setItem('apex_v13_rgpd_consent', JSON.stringify({ accepted: true, ts: Date.now() }));
      const result = await sentinels.runOne('compliance-watch');
      expect(result?.ok).toBe(true);
    });

    it('compliance-watch user logged sans consent → autoFix crée consent par défaut (Sprint 13.3.17)', async () => {
      registerCoreSentinels();
      localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kevin' }));
      localStorage.removeItem('apex_v13_rgpd_consent');
      localStorage.removeItem('apex_v13_cookies_accepted');
      const result = await sentinels.runOne('compliance-watch');
      /* AutoFix recovery : consent essential par défaut enregistré */
      expect(result?.ok).toBe(true);
      expect(localStorage.getItem('apex_v13_cookies_accepted')).toBeTruthy();
    });

    it('conflict-watch returns ok=true si pas de queue', async () => {
      registerCoreSentinels();
      localStorage.removeItem('apex_v13_fb_queue');
      const result = await sentinels.runOne('conflict-watch');
      expect(result?.ok).toBe(true);
      expect(result?.msg).toContain('No pending');
    });

    it('conflict-watch detect stale > 5 entries flushing', async () => {
      registerCoreSentinels();
      const stale = Array.from({ length: 7 }, (_, i) => ({
        id: `stale_${i}`,
        status: 'flushing',
        ts: Date.now(),
      }));
      localStorage.setItem('apex_v13_fb_queue', JSON.stringify(stale));
      const result = await sentinels.runOne('conflict-watch');
      expect(result?.ok).toBe(false);
      expect(result?.msg).toContain('stale');
    });

    it('conflict-watch corrupt queue → ok=false + parse failed', async () => {
      registerCoreSentinels();
      localStorage.setItem('apex_v13_fb_queue', 'INVALID');
      const result = await sentinels.runOne('conflict-watch');
      expect(result?.ok).toBe(false);
    });
  });
});
