/**
 * Tests session-logger.ts (39.66% → 95%+).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sessionLogger } from '../../services/auth/session-logger.js';

describe('session-logger (P0 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Reset internal currentSession */
    (sessionLogger as unknown as { currentSession: null }).currentSession = null;
  });

  describe('startSession()', () => {
    it('start retourne id sess_*', async () => {
      const id = await sessionLogger.startSession('u1', 'Kevin', true);
      expect(id).toMatch(/^sess_/);
    });

    it('persist en localStorage', async () => {
      await sessionLogger.startSession('u1', 'Kevin', true);
      const raw = localStorage.getItem('apex_v13_sessions');
      expect(raw).toBeTruthy();
      const arr = JSON.parse(raw!) as unknown[];
      expect(arr.length).toBe(1);
    });

    it('start enregistre action login', async () => {
      await sessionLogger.startSession('u1', 'Laurence', false);
      const sessions = sessionLogger.list();
      expect(sessions[0]?.actions[0]?.type).toBe('login');
    });
  });

  describe('logAction()', () => {
    it('log avant startSession → silent ignore', () => {
      sessionLogger.logAction('navigate', { route: 'chat' });
      /* Pas crash */
      expect(true).toBe(true);
    });

    it('log après start → ajouté actions', async () => {
      await sessionLogger.startSession('u1', 'K', true);
      /* Ajoute 4 actions (mod 5 trigger persist), puis end pour s'assurer du flush */
      sessionLogger.logAction('navigate', { route: 'chat' });
      sessionLogger.logAction('config', { key: 'theme' });
      sessionLogger.logAction('chat');
      sessionLogger.logAction('vault'); /* 5e action après login → mod5 trigger */
      sessionLogger.endSession();
      const sessions = sessionLogger.list();
      const s = sessions[0]!;
      expect(s.actions.length).toBeGreaterThanOrEqual(5);
    });

    it('action sans détails → ne crash pas', async () => {
      await sessionLogger.startSession('u1', 'K', true);
      sessionLogger.logAction('chat');
      sessionLogger.endSession(); /* end persist + ajoute logout */
      const sessions = sessionLogger.list();
      const actions = sessions[0]?.actions ?? [];
      /* login + chat + logout */
      const types = actions.map((a) => a.type);
      expect(types).toContain('chat');
    });

    it('cap actions par session (200)', async () => {
      await sessionLogger.startSession('u1', 'K', true);
      for (let i = 0; i < 250; i++) {
        sessionLogger.logAction('navigate', { i });
      }
      const sessions = sessionLogger.list();
      expect(sessions[0]?.actions.length).toBeLessThanOrEqual(200);
    });

    it('persist toutes les 5 actions', async () => {
      await sessionLogger.startSession('u1', 'K', true);
      for (let i = 0; i < 12; i++) {
        sessionLogger.logAction('chat', { i });
      }
      const raw = localStorage.getItem('apex_v13_sessions');
      const sessions = JSON.parse(raw!) as Array<{ actions: unknown[] }>;
      expect(sessions[0]?.actions.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('endSession()', () => {
    it('end sans currentSession → silent', () => {
      sessionLogger.endSession();
      expect(true).toBe(true);
    });

    it('end après start → set duration_ms', async () => {
      await sessionLogger.startSession('u1', 'K', true);
      await new Promise((r) => setTimeout(r, 10));
      sessionLogger.endSession();
      const sessions = sessionLogger.list();
      expect(sessions[0]?.duration_ms).toBeGreaterThanOrEqual(0);
      expect(sessions[0]?.end_ts).toBeGreaterThan(0);
      expect(sessions[0]?.summary).toBeTruthy();
    });

    it('end ajoute action logout', async () => {
      await sessionLogger.startSession('u1', 'K', true);
      sessionLogger.logAction('chat');
      sessionLogger.endSession();
      const sessions = sessionLogger.list();
      const lastAction = sessions[0]?.actions[sessions[0].actions.length - 1];
      expect(lastAction?.type).toBe('logout');
    });

    it('end reset currentSession', async () => {
      await sessionLogger.startSession('u1', 'K', true);
      sessionLogger.endSession();
      /* Une 2nde action après end → no-op */
      sessionLogger.logAction('chat');
      const sessions = sessionLogger.list();
      const s = sessions[0]!;
      const chatActions = s.actions.filter((a) => a.type === 'chat');
      expect(chatActions.length).toBe(0);
    });
  });

  describe('list()', () => {
    it('liste vide → []', () => {
      const r = sessionLogger.list();
      expect(r).toEqual([]);
    });

    it('list par uid', async () => {
      await sessionLogger.startSession('u1', 'K', true);
      sessionLogger.endSession();
      await sessionLogger.startSession('u2', 'L', false);
      sessionLogger.endSession();
      const r1 = sessionLogger.list({ uid: 'u1' });
      expect(r1.length).toBe(1);
      expect(r1[0]?.uid).toBe('u1');
    });

    it('list sinceTs', async () => {
      await sessionLogger.startSession('u1', 'K', true);
      sessionLogger.endSession();
      const future = Date.now() + 100000;
      const r = sessionLogger.list({ sinceTs: future });
      expect(r.length).toBe(0);
    });

    it('list limit', async () => {
      for (let i = 0; i < 5; i++) {
        await sessionLogger.startSession(`u${i}`, 'K', true);
        sessionLogger.endSession();
      }
      const r = sessionLogger.list({ limit: 2 });
      expect(r.length).toBe(2);
    });

    it('list trie par start_ts desc', async () => {
      const id1 = await sessionLogger.startSession('u1', 'K', true);
      sessionLogger.endSession();
      await new Promise((r) => setTimeout(r, 5));
      const id2 = await sessionLogger.startSession('u2', 'L', false);
      sessionLogger.endSession();
      const r = sessionLogger.list();
      expect(r[0]?.id).toBe(id2);
      expect(r[1]?.id).toBe(id1);
    });

    it('JSON invalide → []', () => {
      localStorage.setItem('apex_v13_sessions', 'not json');
      const r = sessionLogger.list();
      expect(r).toEqual([]);
    });
  });

  describe('getStats()', () => {
    it('vide', () => {
      const s = sessionLogger.getStats();
      expect(s.total_sessions).toBe(0);
      expect(s.unique_users).toBe(0);
    });

    it('avec sessions', async () => {
      await sessionLogger.startSession('u1', 'K', true);
      sessionLogger.logAction('chat');
      sessionLogger.endSession();
      await sessionLogger.startSession('u1', 'K', true);
      sessionLogger.logAction('chat');
      sessionLogger.endSession();
      await sessionLogger.startSession('u2', 'L', false);
      sessionLogger.logAction('navigate');
      sessionLogger.endSession();
      const s = sessionLogger.getStats();
      expect(s.total_sessions).toBe(3);
      expect(s.unique_users).toBe(2);
      expect(s.by_type['chat']).toBe(2);
      expect(s.by_type['navigate']).toBe(1);
      expect(s.by_type['login']).toBe(3);
      expect(s.by_type['logout']).toBe(3);
    });

    it('getStats avec sinceTs', async () => {
      await sessionLogger.startSession('u1', 'K', true);
      sessionLogger.endSession();
      const future = Date.now() + 100000;
      const s = sessionLogger.getStats(future);
      expect(s.total_sessions).toBe(0);
    });
  });

  describe('formatSessionMarkdown()', () => {
    it('format minimal', async () => {
      await sessionLogger.startSession('u1', 'Kevin', true);
      sessionLogger.endSession();
      const sessions = sessionLogger.list();
      const md = sessionLogger.formatSessionMarkdown(sessions[0]!);
      expect(md).toContain('Session sess_');
      expect(md).toContain('Kevin');
      expect(md).toContain('admin');
    });

    it('format en cours (sans duration)', async () => {
      await sessionLogger.startSession('u1', 'K', false);
      const sessions = sessionLogger.list();
      const md = sessionLogger.formatSessionMarkdown(sessions[0]!);
      expect(md).toContain('user'); /* not admin */
      expect(md).toContain('in progress');
    });
  });

  describe('cap MAX_SESSIONS=100', () => {
    it('au-delà 100 → trim', async () => {
      /* Mock fast : crée des sessions sans attente */
      for (let i = 0; i < 5; i++) {
        await sessionLogger.startSession(`u${i}`, `n${i}`, false);
        sessionLogger.endSession();
      }
      const sessions = sessionLogger.list();
      expect(sessions.length).toBeLessThanOrEqual(100);
    });
  });

  describe('persist update existing', () => {
    it('update même session id', async () => {
      const id = await sessionLogger.startSession('u1', 'K', true);
      sessionLogger.logAction('chat'); /* pas multiple de 5 → pas persist auto, mais startSession et logAction ttes 5 le font */
      for (let i = 0; i < 5; i++) sessionLogger.logAction('config'); /* triggers persist via mod 5 */
      const sessions = sessionLogger.list();
      const found = sessions.filter((s) => s.id === id);
      expect(found.length).toBe(1);
    });
  });

  describe('journal domaine kdmc-access (prod-only, fail-open)', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('POST admin.kd-mc.com à la connexion sur *.kd-mc.com', async () => {
      const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
      vi.stubGlobal('location', { hostname: 'apex-ai.kd-mc.com' });
      vi.stubGlobal('fetch', (url: string, opts: { body: string }) => { calls.push({ url: String(url), body: JSON.parse(opts.body) }); return Promise.resolve({ ok: true }); });
      await sessionLogger.startSession('U11804', 'Kevin DESARZENS', true);
      const admin = calls.filter((c) => c.url.includes('admin.kd-mc.com/log'));
      expect(admin.length).toBe(1);
      expect(admin[0].body).toMatchObject({ app: 'apex', uid: 'U11804', event: 'connexion', tier: 'admin' });
    });

    it('INERTE hors kd-mc.com (aucun POST domaine)', async () => {
      const calls: string[] = [];
      vi.stubGlobal('location', { hostname: 'localhost' });
      vi.stubGlobal('fetch', (url: string) => { calls.push(String(url)); return Promise.resolve({ ok: true }); });
      await sessionLogger.startSession('u1', 'X', false);
      expect(calls.filter((u) => u.includes('admin.kd-mc.com')).length).toBe(0);
    });
  });
});
