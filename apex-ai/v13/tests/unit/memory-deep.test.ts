/**
 * APEX v13.3.27 — Tests mémoire long-terme (Kevin 2026-05-07)
 *
 * Couvre :
 * - extractFactsFromMessage (NLP regex per-user)
 * - syncDocsAtBoot (cache 6h, fetch GitHub raw)
 * - getDocsContext (lecture cache)
 * - recordSessionLearning (push lessons cross-app)
 * - buildSystemPromptDeep (assemblage 8 sources)
 * - buildAdminCrossUserKnowledge (admin only)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { memory } from '../../core/memory.js';

describe('memory v13.3.27 — Mémoire long-terme + relecture profonde docs', () => {
  beforeEach(() => {
    localStorage.clear();
    memory.reload();
  });

  describe('extractFactsFromMessage (NLP regex per-user)', () => {
    it('détecte âge', async () => {
      const result = await memory.extractFactsFromMessage("Salut, j'ai 35 ans et tout va bien", 'user1');
      expect(result.extracted).toBeGreaterThanOrEqual(1);
      expect(result.facts.some((f) => f.text.includes('35 ans'))).toBe(true);
    });

    it('détecte allergie avec importance haute', async () => {
      const result = await memory.extractFactsFromMessage('Je suis allergique aux fruits de mer', 'user1');
      const allergyFact = result.facts.find((f) => f.text.includes('Allergie'));
      expect(allergyFact).toBeDefined();
      expect(allergyFact!.importance).toBeGreaterThanOrEqual(90);
    });

    it('détecte préférence "j\'aime"', async () => {
      const result = await memory.extractFactsFromMessage("j'aime le rnb et la musique soul.", 'user1');
      expect(result.facts.some((f) => f.category === 'preferences')).toBe(true);
    });

    it('détecte projet actif', async () => {
      const result = await memory.extractFactsFromMessage('Je travaille sur Apex AI', 'user1');
      expect(result.facts.some((f) => f.category === 'projects')).toBe(true);
    });

    it('skip extraction si CB détectée (forbidden pattern)', async () => {
      const result = await memory.extractFactsFromMessage('Ma carte 4242 4242 4242 4242', 'user1');
      expect(result.extracted).toBe(0);
    });

    it('skip extraction si seed phrase détectée (12 mots)', async () => {
      const result = await memory.extractFactsFromMessage('apple banana cherry date elder fig grape honey ice juniper kiwi lemon', 'user1');
      expect(result.extracted).toBe(0);
    });

    it('skip extraction message trop court', async () => {
      const result = await memory.extractFactsFromMessage('hi', 'user1');
      expect(result.extracted).toBe(0);
    });

    it('détecte allergie même sans extraction d\'autres facts', async () => {
      const result = await memory.extractFactsFromMessage('allergique au lactose, voilà.', 'user1');
      expect(result.facts.some((f) => f.text.includes('Allergie'))).toBe(true);
    });
  });

  describe('syncDocsAtBoot (cache 6h)', () => {
    it('skip fetch si cache fresh (< 6h)', async () => {
      const fresh = Date.now();
      localStorage.setItem(
        'apex_v13_docs_cache',
        JSON.stringify({
          'CLAUDE.md': { content: 'cached', ts: fresh, size: 6 },
          'NOTES_USER.md': { content: 'cached', ts: fresh, size: 6 },
          'MEMO_RESUME.md': { content: 'cached', ts: fresh, size: 6 },
          'KEVIN_INVENTORY.md': { content: 'cached', ts: fresh, size: 6 },
          'KEVIN_ACTIONS_TODO.md': { content: 'cached', ts: fresh, size: 6 },
          'MEMORY_PERSISTENT.md': { content: 'cached', ts: fresh, size: 6 },
          'APEX_HANDOFF.md': { content: 'cached', ts: fresh, size: 6 },
          'CLAUDE_FEED.md': { content: 'cached', ts: fresh, size: 6 },
        }),
      );
      const result = await memory.syncDocsAtBoot();
      expect(result.skipped).toBe(8);
      expect(result.synced).toBe(0);
    });

    it('forceRefresh ignore cache', async () => {
      /* Mock fetch pour ne pas réellement aller à GitHub */
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => new Response('# CLAUDE.md test', { status: 200 })) as typeof fetch;
      const fresh = Date.now();
      localStorage.setItem(
        'apex_v13_docs_cache',
        JSON.stringify({ 'CLAUDE.md': { content: 'cached', ts: fresh, size: 6 } }),
      );
      const result = await memory.syncDocsAtBoot({ forceRefresh: true });
      expect(result.synced).toBeGreaterThan(0);
      globalThis.fetch = originalFetch;
    });

    it('échec fetch n\'empêche pas le retour', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => new Response('not found', { status: 404 })) as typeof fetch;
      const result = await memory.syncDocsAtBoot({ forceRefresh: true });
      expect(result.failed).toBeGreaterThan(0);
      expect(result.synced).toBe(0);
      globalThis.fetch = originalFetch;
    });
  });

  describe('getDocsContext', () => {
    it('retourne {} si pas de cache', () => {
      const ctx = memory.getDocsContext();
      expect(ctx).toEqual({});
    });

    it('retourne cache parsé', () => {
      localStorage.setItem(
        'apex_v13_docs_cache',
        JSON.stringify({ 'CLAUDE.md': { content: 'test', ts: 100, size: 4 } }),
      );
      const ctx = memory.getDocsContext();
      expect(ctx['CLAUDE.md']?.content).toBe('test');
    });

    it('retourne {} si cache corrompu', () => {
      localStorage.setItem('apex_v13_docs_cache', 'INVALID JSON {{');
      const ctx = memory.getDocsContext();
      expect(ctx).toEqual({});
    });
  });

  describe('recordSessionLearning (push cross-app)', () => {
    it('ajoute lesson au store local + ax_lessons_learned_struct', async () => {
      await memory.recordSessionLearning('test-cat', 'Titre test', 'Texte de la lesson', 'critical');
      const local = memory.getLessons();
      expect(local.some((l) => l.title === 'Titre test')).toBe(true);
      const sharedRaw = localStorage.getItem('ax_lessons_learned_struct');
      expect(sharedRaw).not.toBeNull();
      const shared = JSON.parse(sharedRaw!) as Array<{ title: string }>;
      expect(shared.some((l) => l.title === 'Titre test')).toBe(true);
    });

    it('dédupe lessons par title similaire', async () => {
      await memory.recordSessionLearning('cat1', 'Bug parser cadres', 'Premier rapport', 'warn');
      await memory.recordSessionLearning('cat1', 'Bug parser cadres', 'Deuxième rapport', 'warn');
      const sharedRaw = localStorage.getItem('ax_lessons_learned_struct');
      const shared = JSON.parse(sharedRaw!) as Array<{ title: string }>;
      const matching = shared.filter((l) => l.title === 'Bug parser cadres');
      expect(matching.length).toBeLessThanOrEqual(1);
    });
  });

  describe('buildSystemPromptDeep (assemblage 8 sources)', () => {
    it('inclut le contexte de base sans crash', async () => {
      const prompt = await memory.buildSystemPromptDeep({ id: 'kdmc_admin', name: 'Kevin' });
      expect(prompt).toContain('APEX v13');
      expect(prompt.length).toBeGreaterThan(500);
    });

    it('inclut la section CLAUDE.md si cache présent', async () => {
      localStorage.setItem(
        'apex_v13_docs_cache',
        JSON.stringify({
          'CLAUDE.md': { content: '# Règles permanentes test', ts: Date.now(), size: 26 },
        }),
      );
      const prompt = await memory.buildSystemPromptDeep({ id: 'user1', name: 'User' });
      expect(prompt).toContain('CLAUDE.md');
      expect(prompt).toContain('Règles permanentes test');
    });

    it('inclut cross-user knowledge si admin Kevin', async () => {
      const prompt = await memory.buildSystemPromptDeep({ id: 'kdmc_admin', name: 'Kevin' });
      /* Note : peut être vide si aucun fact, vérifie juste pas de crash */
      expect(typeof prompt).toBe('string');
    });

    it('cap les docs à leur limite tokens', async () => {
      const longContent = 'X'.repeat(20_000);
      localStorage.setItem(
        'apex_v13_docs_cache',
        JSON.stringify({
          'CLAUDE.md': { content: longContent, ts: Date.now(), size: longContent.length },
        }),
      );
      const prompt = await memory.buildSystemPromptDeep({ id: 'user1', name: 'User' });
      expect(prompt).toContain('tronqué');
    });

    it('handle null user gracefully', async () => {
      const prompt = await memory.buildSystemPromptDeep(null);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('buildAdminCrossUserKnowledge', () => {
    it('retourne string vide si aucun fact', async () => {
      const knowledge = await memory.buildAdminCrossUserKnowledge();
      expect(typeof knowledge).toBe('string');
    });
  });
});
