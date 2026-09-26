/**
 * memory coverage boost — branches manquantes (Sprint 9 Kevin v13.0.78+)
 *
 * Cible : memory.ts L:86.5% S:86.5% F:100% B:76.6% → ≥95% partout
 * Branches manquantes : extractFactsFromMessage forbidden patterns, syncDocsAtBoot,
 * getDocsContext fallback, recordSessionLearning dedup, buildAdminCrossUserKnowledge.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { memory } from '../../core/memory.js';

describe('memory coverage boost', () => {
  beforeEach(() => {
    localStorage.clear();
    memory.reload();
  });

  describe('extractFactsFromMessage edge cases', () => {
    it('text trop court (< 5 chars) → extracted=0', async () => {
      const r = await memory.extractFactsFromMessage('hi', 'kevin');
      expect(r.extracted).toBe(0);
      expect(r.facts).toEqual([]);
    });

    it('text vide → extracted=0', async () => {
      const r = await memory.extractFactsFromMessage('', 'kevin');
      expect(r.extracted).toBe(0);
    });

    it('FORBIDDEN pattern CB détecté → skip extraction', async () => {
      const r = await memory.extractFactsFromMessage(
        'ma carte est 4111 1111 1111 1111 et j\'aime le chocolat',
        'kevin',
      );
      expect(r.extracted).toBe(0);
    });

    it('FORBIDDEN pattern API token → skip extraction', async () => {
      const r = await memory.extractFactsFromMessage(
        'mon token est sk-ant-api03-AbcdefGhijklmnopqrstuv1234567890ABCDEFGHIJKLMN-XX_xx et j\'aime le café',
        'kevin',
      );
      expect(r.extracted).toBe(0);
    });

    it('extract âge', async () => {
      const r = await memory.extractFactsFromMessage('Salut, j\'ai 35 ans en fait', 'kevin');
      expect(r.extracted).toBeGreaterThan(0);
      expect(r.facts.some((f) => f.text.includes('Âge'))).toBe(true);
    });

    it('extract allergie avec importance haute', async () => {
      const r = await memory.extractFactsFromMessage('je suis allergique aux fruits de mer.', 'kevin');
      const allergy = r.facts.find((f) => f.text.includes('Allergie'));
      expect(allergy).toBeDefined();
      expect(allergy?.importance).toBeGreaterThanOrEqual(90);
    });

    it('extract préférences (likes)', async () => {
      const r = await memory.extractFactsFromMessage('j\'aime le café noir.', 'kevin');
      expect(r.facts.some((f) => f.category === 'preferences')).toBe(true);
    });

    it('extract dislikes', async () => {
      const r = await memory.extractFactsFromMessage('je déteste le tabac.', 'kevin');
      expect(r.facts.some((f) => f.text.includes('N\'aime pas') || f.text.includes('aime pas'))).toBe(true);
    });

    it('extract anniversaire', async () => {
      const r = await memory.extractFactsFromMessage('mon anniv le 12 mai super', 'kevin');
      expect(r.facts.some((f) => f.text.includes('Anniversaire'))).toBe(true);
    });

    it('extract projet', async () => {
      const r = await memory.extractFactsFromMessage('je travaille sur le projet kdmc.', 'kevin');
      expect(r.facts.some((f) => f.category === 'projects')).toBe(true);
    });

    it('extract userId vide → utilise scope global', async () => {
      const r = await memory.extractFactsFromMessage('j\'ai 30 ans.', '');
      expect(r.extracted).toBeGreaterThan(0);
    });
  });

  describe('getDocsContext', () => {
    it('cache vide retourne {}', () => {
      const docs = memory.getDocsContext();
      expect(docs).toEqual({});
    });

    it('cache présent retourne docs', () => {
      const cache = {
        'CLAUDE.md': { content: 'rules', ts: Date.now(), size: 5 },
      };
      localStorage.setItem('apex_v13_docs_cache', JSON.stringify(cache));
      const docs = memory.getDocsContext();
      expect(docs['CLAUDE.md']?.content).toBe('rules');
    });

    it('cache JSON corrompu → retourne {}', () => {
      localStorage.setItem('apex_v13_docs_cache', '{not valid json');
      const docs = memory.getDocsContext();
      expect(docs).toEqual({});
    });
  });

  describe('recordSessionLearning + lessons shared store', () => {
    it('record persiste dans ax_lessons_learned_struct', async () => {
      await memory.recordSessionLearning('test-cat', 'Title test', 'Body test', 'warn');
      const raw = localStorage.getItem('ax_lessons_learned_struct');
      expect(raw).toBeTruthy();
      const arr = JSON.parse(raw!);
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeGreaterThan(0);
    });

    it('dedupe par title similaire (50 chars first)', async () => {
      for (let i = 0; i < 5; i++) {
        await memory.recordSessionLearning('c', 'Same Title Repeated', 'body', 'info');
      }
      const arr = JSON.parse(localStorage.getItem('ax_lessons_learned_struct')!);
      /* Au moins le dernier reste, mais dedupe doit éviter 5 copies identiques */
      expect(arr.length).toBeLessThan(5);
    });

    it('cap 200 entries', async () => {
      const big: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 250; i++) {
        big.push({ id: `L_${i}`, category: 'c', title: `t${i}`, text: 'x', severity: 'info', src: 'apex', ts: Date.now() + i, resolved: false });
      }
      localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(big));
      await memory.recordSessionLearning('c', 'new title 251', 'x', 'info');
      const arr = JSON.parse(localStorage.getItem('ax_lessons_learned_struct')!);
      expect(arr.length).toBeLessThanOrEqual(200);
    });

    it('record ajoute aussi à local lessons (memory.recordLesson)', async () => {
      const before = memory.getLessons().length;
      await memory.recordSessionLearning('c', 't', 'x', 'critical');
      expect(memory.getLessons().length).toBe(before + 1);
    });
  });

  describe('addFact + recordLesson rotation', () => {
    it('addFact > 1000 → trim oldest', () => {
      memory.reload();
      for (let i = 0; i < 1100; i++) {
        memory.addFact('c', `fact ${i}`);
      }
      expect(memory.getFacts().length).toBeLessThanOrEqual(1000);
    });

    it('recordLesson > 200 → trim oldest', () => {
      memory.reload();
      for (let i = 0; i < 220; i++) {
        memory.recordLesson('c', `t${i}`, `txt${i}`, 'info');
      }
      expect(memory.getLessons().length).toBeLessThanOrEqual(200);
    });

    it('recordLesson title cap 120 chars', () => {
      memory.reload();
      const longTitle = 'x'.repeat(200);
      memory.recordLesson('c', longTitle, 'body', 'info');
      const last = memory.getLessons().slice(-1)[0];
      expect(last?.title.length).toBeLessThanOrEqual(120);
    });

    it('recordLesson text cap 500 chars', () => {
      memory.reload();
      const longText = 'y'.repeat(800);
      memory.recordLesson('c', 't', longText, 'info');
      const last = memory.getLessons().slice(-1)[0];
      expect(last?.text.length).toBeLessThanOrEqual(500);
    });

    it('addFact text > 500 → tronqué', () => {
      memory.reload();
      memory.addFact('c', 'z'.repeat(800));
      const last = memory.getFacts().slice(-1)[0];
      expect(last?.text.length).toBeLessThanOrEqual(500);
    });
  });

  describe('buildSystemPromptContext', () => {
    it('user null → pas de section utilisateur courant', () => {
      const ctx = memory.buildSystemPromptContext(null);
      expect(ctx).toContain('APEX v13');
      expect(ctx).not.toContain('## Utilisateur courant');
    });

    it('user fourni → injecte nom', () => {
      const ctx = memory.buildSystemPromptContext({ id: 'u1', name: 'Alice' });
      expect(ctx).toContain('Alice');
    });

    it('inclut règles permanentes', () => {
      const ctx = memory.buildSystemPromptContext(null);
      expect(ctx).toContain('Règles permanentes');
    });

    it('top facts injectés si présents', () => {
      memory.reload();
      memory.addFact('test-cat', 'fait important récent');
      const ctx = memory.buildSystemPromptContext(null);
      expect(ctx).toContain('fait important récent');
    });

    it('lessons critiques injectées si présentes', () => {
      memory.reload();
      memory.recordLesson('cat', 'Critical title', 'body', 'critical');
      const ctx = memory.buildSystemPromptContext(null);
      expect(ctx).toContain('Critical title');
    });
  });

  describe('buildAdminCrossUserKnowledge', () => {
    it('store vide → string vide', async () => {
      const r = await memory.buildAdminCrossUserKnowledge();
      expect(typeof r).toBe('string');
    });
  });

  describe('buildSystemPromptDeep cap', () => {
    it('respect 32k chars max', async () => {
      const r = await memory.buildSystemPromptDeep({ id: 'kdmc_admin', name: 'Kevin' });
      expect(r.length).toBeLessThanOrEqual(32100); /* léger marge */
    });

    it('user null → fonctionne sans throw', async () => {
      const r = await memory.buildSystemPromptDeep(null);
      expect(typeof r).toBe('string');
      expect(r.length).toBeGreaterThan(0);
    });
  });

  describe('getProjects', () => {
    it('retourne 6 projets Kevin (immutables)', () => {
      const projects = memory.getProjects();
      expect(projects.length).toBe(6);
      expect(projects.map((p) => p.id)).toContain('cmcteams');
      expect(projects.map((p) => p.id)).toContain('kdmc');
    });
  });

  describe('reload edge cases', () => {
    it('localStorage facts JSON corrompu → reset à []', () => {
      localStorage.setItem('apex_v13_facts', '{not json');
      memory.reload();
      expect(memory.getFacts().length).toBe(0);
    });

    it('localStorage lessons JSON corrompu → reset à []', () => {
      localStorage.setItem('apex_v13_lessons', 'broken');
      memory.reload();
      expect(memory.getLessons().length).toBe(0);
    });
  });
});
