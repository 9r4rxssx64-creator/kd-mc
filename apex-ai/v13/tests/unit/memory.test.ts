import { describe, it, expect, beforeEach } from 'vitest';
import { memory } from '../../core/memory.js';

describe('memory service (Jet 7.2 fix audit 0% coverage)', () => {
  beforeEach(async () => {
    localStorage.clear();
    memory.reload();
    memory.reload();
  });

  describe('init + persistence', () => {
    it('init charge depuis localStorage', async () => {
      localStorage.setItem('apex_v13_facts', JSON.stringify([{ id: 'f1', category: 'test', text: 'fact', ts: 100 }]));
      memory.reload();
      const facts = memory.getFacts();
      expect(facts.length).toBeGreaterThanOrEqual(1);
    });

    it('init handles corrupted JSON gracefully', async () => {
      localStorage.setItem('apex_v13_facts', 'INVALID JSON {{{');
      memory.reload();
      /* Pas de throw */
      expect(memory.getFacts()).toBeDefined();
    });

    it('init lessons charge', async () => {
      localStorage.setItem('apex_v13_lessons', JSON.stringify([
        { id: 'l1', category: 'test', title: 'T', text: 'T', severity: 'warn', resolved: false, ts: 100 },
      ]));
      memory.reload();
      expect(memory.getLessons().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('addFact', () => {
    it('ajoute fact avec id généré', async () => {
      memory.reload();
      const before = memory.getFacts().length;
      memory.addFact('test', 'fait test');
      expect(memory.getFacts().length).toBe(before + 1);
    });

    it('truncate text > 500 chars', async () => {
      memory.reload();
      const longText = 'x'.repeat(1000);
      memory.addFact('test', longText);
      const last = memory.getFacts().slice(-1)[0];
      expect(last?.text.length).toBeLessThanOrEqual(500);
    });

    it('persiste dans localStorage', async () => {
      memory.reload();
      memory.addFact('test', 'fact persisted');
      const raw = localStorage.getItem('apex_v13_facts');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.some((f: { text: string }) => f.text === 'fact persisted')).toBe(true);
    });

    it('rotation 1000 facts max', async () => {
      memory.reload();
      for (let i = 0; i < 1010; i++) memory.addFact('test', `fact ${i}`);
      expect(memory.getFacts().length).toBeLessThanOrEqual(1000);
    });
  });

  describe('recordLesson', () => {
    it('ajoute lesson avec defaults', async () => {
      memory.reload();
      memory.recordLesson('test', 'Title', 'Description');
      const lessons = memory.getLessons();
      const last = lessons.slice(-1)[0];
      expect(last?.severity).toBe('warn');
      expect(last?.resolved).toBe(false);
    });

    it('severity critical respectée', async () => {
      memory.reload();
      memory.recordLesson('test', 'Crit', 'Critical bug', 'critical');
      const last = memory.getLessons().slice(-1)[0];
      expect(last?.severity).toBe('critical');
    });

    it('rotation 200 lessons max', async () => {
      memory.reload();
      for (let i = 0; i < 250; i++) memory.recordLesson('test', `L${i}`, `txt`);
      expect(memory.getLessons().length).toBeLessThanOrEqual(200);
    });
  });

  describe('getProjects', () => {
    it('retourne 6 projets Kevin (préservés)', () => {
      const projects = memory.getProjects();
      expect(projects.length).toBeGreaterThanOrEqual(6);
      const ids = projects.map((p) => p.id);
      expect(ids).toContain('cmcteams');
      expect(ids).toContain('telecommande');
    });

    it('chaque projet a preserved=true', () => {
      const projects = memory.getProjects();
      for (const p of projects) {
        expect(p.preserved).toBe(true);
      }
    });
  });

  describe('buildSystemPromptContext', () => {
    it('retourne context string sans user', async () => {
      memory.reload();
      const ctx = memory.buildSystemPromptContext(null);
      expect(typeof ctx).toBe('string');
      expect(ctx).toContain('APEX');
    });

    it('inclut user identity si fourni', async () => {
      memory.reload();
      const ctx = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin' });
      expect(ctx).toContain('Kevin');
      expect(ctx).toContain('kdmc_admin');
    });

    it('inclut projets Kevin', async () => {
      memory.reload();
      const ctx = memory.buildSystemPromptContext(null);
      expect(ctx).toContain('CMCteams');
    });

    it('inclut top facts si présents', async () => {
      memory.reload();
      memory.addFact('user_pref', 'aime le café');
      const ctx = memory.buildSystemPromptContext(null);
      expect(ctx).toContain('café');
    });

    it('inclut critical lessons learned', async () => {
      memory.reload();
      memory.recordLesson('error', 'Bug critique', 'description', 'critical');
      const ctx = memory.buildSystemPromptContext(null);
      expect(ctx).toContain('Bug critique');
    });
  });
});
