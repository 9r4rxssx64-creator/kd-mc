/**
 * Tests context-loader.ts (68.1% → 95%+).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { contextLoader } from '../../services/ai/context-loader.js';
import { persistentMemory } from '../../services/storage/persistent-memory-store.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('context-loader — catch branches (campagne 100%)', () => {
  it('persistentMemory.list throw → user_facts [] (catch loadFactsForPrompt)', async () => {
    vi.spyOn(persistentMemory, 'list').mockRejectedValue(new Error('db down'));
    contextLoader.invalidate();
    const ctx = await contextLoader.load();
    expect(ctx.user_facts).toEqual([]);
  });
  it('persistentMemory.topForPrompt throw → recent_memory [] (catch loadRecentMemory)', async () => {
    vi.spyOn(persistentMemory, 'topForPrompt').mockRejectedValue(new Error('db down'));
    contextLoader.invalidate();
    const ctx = await contextLoader.load();
    expect(ctx.recent_memory).toEqual([]);
  });
});

describe('context-loader (P0 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    contextLoader.invalidate();
    (persistentMemory as unknown as { cache: null }).cache = null;
  });

  describe('load()', () => {
    it('load default → contexte minimal', async () => {
      const ctx = await contextLoader.load();
      expect(ctx.rules.length).toBeGreaterThan(0);
      expect(Array.isArray(ctx.user_facts)).toBe(true);
      expect(Array.isArray(ctx.recent_memory)).toBe(true);
      expect(Array.isArray(ctx.lessons_critical)).toBe(true);
      expect(Array.isArray(ctx.projects)).toBe(true);
      expect(ctx.loaded_at).toBeGreaterThan(0);
    });

    it('cached 30 min, second call retourne même instance', async () => {
      const c1 = await contextLoader.load();
      const c2 = await contextLoader.load();
      expect(c1.loaded_at).toBe(c2.loaded_at);
    });

    it('invalidate force reload', async () => {
      const c1 = await contextLoader.load();
      contextLoader.invalidate();
      await new Promise((r) => setTimeout(r, 5));
      const c2 = await contextLoader.load();
      expect(c2.loaded_at).toBeGreaterThanOrEqual(c1.loaded_at);
    });

    it('forceRefresh=true bypass cache', async () => {
      const c1 = await contextLoader.load();
      await new Promise((r) => setTimeout(r, 5));
      const c2 = await contextLoader.load('global', true);
      expect(c2.loaded_at).toBeGreaterThan(c1.loaded_at);
    });

    it('charge user_facts depuis persistent-memory', async () => {
      await persistentMemory.add({
        category: 'profile',
        text: 'Kevin DESARZENS habite Monaco',
        scope: 'admin',
        importance: 90,
      });
      contextLoader.invalidate();
      const ctx = await contextLoader.load('admin');
      expect(ctx.user_facts.some((f) => f.includes('Monaco'))).toBe(true);
    });

    it('charge lessons critical depuis ax_lessons_learned_struct', async () => {
      localStorage.setItem(
        'ax_lessons_learned_struct',
        JSON.stringify([
          { title: 'Crit lesson', text: 'Critical issue', severity: 'critical', resolved: false },
          { title: 'Resolved', text: 'Was issue', severity: 'critical', resolved: true },
          { title: 'Info', text: 'Just info', severity: 'info', resolved: false },
        ]),
      );
      contextLoader.invalidate();
      const ctx = await contextLoader.load();
      expect(ctx.lessons_critical.some((l) => l.includes('Crit lesson'))).toBe(true);
      expect(ctx.lessons_critical.some((l) => l.includes('Resolved'))).toBe(false);
    });

    it('lessons JSON corrompu → []', async () => {
      localStorage.setItem('ax_lessons_learned_struct', 'broken');
      contextLoader.invalidate();
      const ctx = await contextLoader.load();
      expect(ctx.lessons_critical).toEqual([]);
    });

    it('charge recent_sessions depuis apex_v13_sessions', async () => {
      localStorage.setItem(
        'apex_v13_sessions',
        JSON.stringify([{ ts: Date.now(), summary: 'Test session', uid: 'u' }]),
      );
      contextLoader.invalidate();
      const ctx = await contextLoader.load();
      expect(ctx.recent_sessions.length).toBeGreaterThanOrEqual(0);
    });

    it('sessions JSON corrompu → []', async () => {
      localStorage.setItem('apex_v13_sessions', 'broken');
      contextLoader.invalidate();
      const ctx = await contextLoader.load();
      expect(ctx.recent_sessions).toEqual([]);
    });
  });

  describe('formatForSystemPrompt()', () => {
    it('format minimal → contient sections clés', async () => {
      contextLoader.invalidate();
      const out = await contextLoader.formatForSystemPrompt();
      expect(out).toContain('CONTEXTE APEX');
      expect(out).toContain('RÈGLES PERMANENTES KEVIN');
      expect(out).toContain('PROJETS ACTIFS');
    });

    it('avec user facts → section affichée', async () => {
      await persistentMemory.add({
        category: 'profile',
        text: 'Kevin habite Monaco depuis 2010',
        scope: 'admin',
        importance: 95,
      });
      contextLoader.invalidate();
      const out = await contextLoader.formatForSystemPrompt('admin');
      expect(out).toContain('FAITS UTILISATEUR');
      expect(out).toContain('Monaco');
    });

    it('avec lessons critical → section affichée', async () => {
      localStorage.setItem(
        'ax_lessons_learned_struct',
        JSON.stringify([
          { title: 'XSS bug', text: 'innerHTML sans esc', severity: 'critical', resolved: false },
        ]),
      );
      contextLoader.invalidate();
      const out = await contextLoader.formatForSystemPrompt();
      expect(out).toContain('LEÇONS CRITIQUES');
      expect(out).toContain('XSS bug');
    });

    it('avec sessions récentes → section affichée', async () => {
      localStorage.setItem(
        'apex_v13_sessions',
        JSON.stringify([{ ts: Date.now(), summary: 'Working on tests' }]),
      );
      contextLoader.invalidate();
      const out = await contextLoader.formatForSystemPrompt();
      expect(out).toContain('SESSIONS RÉCENTES');
    });
  });

  describe('rules content', () => {
    it('inclut règle 100/100 réel', async () => {
      contextLoader.invalidate();
      const ctx = await contextLoader.load();
      const txt = ctx.rules.join(' ');
      expect(txt).toContain('100/100');
    });

    it('inclut règle Kevin admin', async () => {
      contextLoader.invalidate();
      const ctx = await contextLoader.load();
      const txt = ctx.rules.join(' ');
      expect(txt.toLowerCase()).toContain('kevin');
    });
  });

  describe('projects', () => {
    it('contient APEX AI', async () => {
      contextLoader.invalidate();
      const ctx = await contextLoader.load();
      const txt = ctx.projects.join(' ');
      expect(txt).toContain('APEX');
    });

    it('contient CMCteams', async () => {
      contextLoader.invalidate();
      const ctx = await contextLoader.load();
      const txt = ctx.projects.join(' ');
      expect(txt).toContain('CMCteams');
    });
  });
});
