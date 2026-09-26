/**
 * APEX v13 — Tests Mémoire Augmentée Identité (Mission Kevin 2026-05-08 23h30)
 *
 * "Il sait pas qui il est, qui je suis, qui Laurence ❤️ est. Il doit le savoir
 *  par cœur. Augmente énormément sa mémoire."
 *
 * Couvre :
 * - buildIdentitySection — identité hardcoded prepend system prompt
 * - buildSystemPromptDeep — Apex sait Kevin + Laurence + projets
 * - getTop50ForSystemPrompt — tri importance × récence
 * - getTop10LessonsForSystemPrompt — lessons cross-session non résolues
 * - initBootDefaults — bootstrap Laurence + projets pour kdmc_admin
 * - Cap tokens < 12K (mission)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { memory } from '../../core/memory.js';
import { buildIdentitySection, APEX_IDENTITY } from '../../core/apex-identity.js';
import { persistentMemory } from '../../services/storage/persistent-memory-store.js';

describe('Mission Kevin 2026-05-08 — Mémoire augmentée identité', () => {
  beforeEach(() => {
    localStorage.clear();
    (persistentMemory as unknown as { cache: null }).cache = null;
    memory.reload();
  });

  describe('buildIdentitySection — Identité hardcoded irrévocable', () => {
    it('inclut Apex (pas Claude/GPT/Gemini)', () => {
      const section = buildIdentitySection();
      expect(section).toContain('APEX');
      expect(section).toContain("Tu n'es PAS Claude");
    });

    it('Apex sait qui il est', () => {
      const section = buildIdentitySection();
      expect(section).toContain('Apex AI');
      expect(section).toContain('Kevin DESARZENS');
    });

    it('Apex connaît Kevin admin', () => {
      const section = buildIdentitySection();
      expect(section).toContain('Kevin DESARZENS');
      expect(section).toContain('Casino Monaco');
      expect(section).toContain('kdmc_admin');
      /* Aliases */
      expect(section).toMatch(/Kevin|KDMC/);
    });

    it('Apex connaît Laurence (femme ❤️)', () => {
      const section = buildIdentitySection();
      expect(section).toContain('Laurence');
      expect(section).toContain('Saint-Polit');
      expect(section).toMatch(/femme|compagne/i);
      expect(section).toContain('tier');
      expect(section).toMatch(/laurence/i);
    });

    it('Apex connaît ses projets (par cœur)', () => {
      const section = buildIdentitySection();
      expect(section).toContain('CMCteams');
      expect(section).toContain('e-KDMC');
      expect(section).toContain('Apex Chat');
      expect(section).toContain('Télécommande');
      expect(section).toContain('CrackPass');
      expect(section).toContain('Social Video Pipeline');
    });

    it('Apex a un test d\'identité pour répondre aux questions', () => {
      const section = buildIdentitySection();
      expect(section).toMatch(/Qui es-tu|Qui est Kevin|Qui est Laurence/);
    });

    it('section taille raisonnable (~500-600 tokens, ~2000-3500 chars)', () => {
      const section = buildIdentitySection();
      expect(section.length).toBeGreaterThan(500);
      /* Section identité doit rester compacte pour ne pas exploser le budget */
      expect(section.length).toBeLessThan(4000);
    });
  });

  describe('APEX_IDENTITY constants', () => {
    it('a un partner Laurence avec tier privilégié', () => {
      expect(APEX_IDENTITY.partner.name).toContain('Laurence');
      expect(APEX_IDENTITY.partner.tier).toBe('laurence');
    });

    it('a 7 projets minimum', () => {
      expect(APEX_IDENTITY.projects.length).toBeGreaterThanOrEqual(7);
    });

    it('admin Kevin a 4 venues casino', () => {
      expect(APEX_IDENTITY.admin.venues).toContain('CMC');
      expect(APEX_IDENTITY.admin.venues).toContain('CDP');
      expect(APEX_IDENTITY.admin.venues).toContain('Sun');
      expect(APEX_IDENTITY.admin.venues).toContain('MCB');
    });
  });

  describe('buildSystemPromptDeep — Identité injectée en tête', () => {
    it('Apex sait qui est Laurence dans system prompt', async () => {
      const prompt = await memory.buildSystemPromptDeep({ id: 'kdmc_admin', name: 'Kevin' });
      expect(prompt).toContain('Laurence');
      expect(prompt).toMatch(/Saint-Polit/);
      expect(prompt).toMatch(/femme|compagne/i);
      expect(prompt).toMatch(/laurence/i);
    });

    it('Apex connaît ses projets dans system prompt', async () => {
      const prompt = await memory.buildSystemPromptDeep({ id: 'kdmc_admin', name: 'Kevin' });
      expect(prompt).toMatch(/CMCteams|e-KDMC|Apex Chat/);
    });

    it('Apex sait qui est Kevin dans system prompt', async () => {
      const prompt = await memory.buildSystemPromptDeep({ id: 'kdmc_admin', name: 'Kevin' });
      expect(prompt).toContain('Kevin');
      expect(prompt).toContain('Casino Monaco');
      expect(prompt).toMatch(/admin/i);
    });

    it('identité prepend AVANT règles (priorité absolue)', async () => {
      const prompt = await memory.buildSystemPromptDeep({ id: 'kdmc_admin', name: 'Kevin' });
      const idIdx = prompt.indexOf('IDENTITÉ APEX');
      expect(idIdx).toBeGreaterThanOrEqual(0);
      const ctxIdx = prompt.indexOf('Règles permanentes prioritaires');
      if (ctxIdx > 0) {
        expect(idIdx).toBeLessThan(ctxIdx);
      }
    });

    it('respecte cap tokens < 12K (~48K chars)', async () => {
      const prompt = await memory.buildSystemPromptDeep({ id: 'kdmc_admin', name: 'Kevin' });
      /* Cap 8000 tokens = 32K chars officiel ; mission demande < 12K tokens (~48K) */
      const MAX_CHARS_12K_TOKENS = 12_000 * 4;
      expect(prompt.length).toBeLessThan(MAX_CHARS_12K_TOKENS);
    });

    it('inclut user courant', async () => {
      const prompt = await memory.buildSystemPromptDeep({ id: 'kdmc_admin', name: 'Kevin' });
      expect(prompt).toContain('Kevin');
      expect(prompt).toContain('kdmc_admin');
    });

    it('handle null user sans crash', async () => {
      const prompt = await memory.buildSystemPromptDeep(null);
      expect(typeof prompt).toBe('string');
      /* Identité toujours présente même sans user */
      expect(prompt).toContain('APEX');
      expect(prompt).toContain('Kevin DESARZENS');
    });
  });

  describe('persistentMemory.getTop50ForSystemPrompt', () => {
    it('retourne facts ordonnés par importance desc', async () => {
      await persistentMemory.add({ category: 'profile', text: 'Allergie X', scope: 'u1', importance: 95 });
      await persistentMemory.add({ category: 'preferences', text: 'Aime jazz', scope: 'u1', importance: 50 });
      await persistentMemory.add({ category: 'profile', text: 'Métier Z', scope: 'u1', importance: 70 });

      const top = await persistentMemory.getTop50ForSystemPrompt('u1', 50);
      expect(top.count).toBe(3);
      expect(top.entries[0]?.importance).toBe(95);
      expect(top.entries[1]?.importance).toBe(70);
      expect(top.entries[2]?.importance).toBe(50);
    });

    it('inclut scope global en plus du user', async () => {
      await persistentMemory.add({ category: 'facts', text: 'Fact user', scope: 'u1', importance: 60 });
      await persistentMemory.add({ category: 'facts', text: 'Fact global', scope: 'global', importance: 80 });
      const top = await persistentMemory.getTop50ForSystemPrompt('u1', 50);
      expect(top.count).toBe(2);
      expect(top.formatted).toContain('Fact global');
      expect(top.formatted).toContain('Fact user');
    });

    it('exclut autres users', async () => {
      await persistentMemory.add({ category: 'facts', text: 'Mine', scope: 'u1', importance: 50 });
      await persistentMemory.add({ category: 'facts', text: 'Other', scope: 'u2', importance: 50 });
      const top = await persistentMemory.getTop50ForSystemPrompt('u1', 50);
      expect(top.formatted).toContain('Mine');
      expect(top.formatted).not.toContain('Other');
    });

    it('format compact 1 ligne / fait', async () => {
      await persistentMemory.add({ category: 'profile', text: 'Test', scope: 'u1', importance: 80 });
      const top = await persistentMemory.getTop50ForSystemPrompt('u1', 50);
      expect(top.formatted).toContain('[profile/80]');
      expect(top.formatted).toContain('- ');
    });

    it('retourne string vide si aucun fact', async () => {
      const top = await persistentMemory.getTop50ForSystemPrompt('u1', 50);
      expect(top.count).toBe(0);
      expect(top.formatted).toBe('');
    });

    it('limite à n=N', async () => {
      /* Texts très distincts pour éviter dédupe Levenshtein > 85% */
      const subjects = [
        'animal', 'plante', 'sport', 'musique', 'cuisine', 'voyage',
        'cinema', 'livre', 'jeu', 'science',
      ];
      const verbs = [
        'aime', 'collectionne', 'préfère', 'apprend',
        'pratique', 'enseigne', 'partage', 'développe',
      ];
      let added = 0;
      for (let i = 0; i < subjects.length && added < 60; i++) {
        for (let j = 0; j < verbs.length && added < 60; j++) {
          await persistentMemory.add({
            category: 'facts',
            text: `${subjects[i]}-${verbs[j]}-id${added * 7 + 13}-uniq`,
            scope: 'u1',
            importance: 50 + (added % 50),
          });
          added++;
        }
      }
      const top = await persistentMemory.getTop50ForSystemPrompt('u1', 50);
      expect(top.count).toBeGreaterThanOrEqual(40); /* Au moins 40 distinctes après dédupe */
      expect(top.count).toBeLessThanOrEqual(50);
    });
  });

  describe('persistentMemory.getTop10LessonsForSystemPrompt', () => {
    it('retourne top 10 lessons non résolues triées par severity', async () => {
      const lessons = [
        { category: 'sec', title: 'Bug critical', severity: 'critical', resolved: false, ts: 100 },
        { category: 'perf', title: 'Bug warn', severity: 'warn', resolved: false, ts: 200 },
        { category: 'doc', title: 'Bug info', severity: 'info', resolved: false, ts: 300 },
      ];
      localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(lessons));

      const r = await persistentMemory.getTop10LessonsForSystemPrompt(10);
      expect(r.count).toBe(3);
      expect(r.formatted).toContain('Bug critical');
      /* Critical doit apparaître AVANT warn */
      const idxCrit = r.formatted.indexOf('Bug critical');
      const idxWarn = r.formatted.indexOf('Bug warn');
      expect(idxCrit).toBeLessThan(idxWarn);
    });

    it('exclut lessons resolved', async () => {
      const lessons = [
        { category: 'sec', title: 'Already fixed', severity: 'critical', resolved: true, ts: 100 },
        { category: 'sec', title: 'Still broken', severity: 'critical', resolved: false, ts: 200 },
      ];
      localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(lessons));

      const r = await persistentMemory.getTop10LessonsForSystemPrompt(10);
      expect(r.formatted).not.toContain('Already fixed');
      expect(r.formatted).toContain('Still broken');
    });

    it('format ÉVITER pour ne pas reproduire', async () => {
      const lessons = [
        { category: 'sec', title: 'Test pattern', text: 'Fix description', severity: 'critical', resolved: false, ts: 100 },
      ];
      localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(lessons));
      const r = await persistentMemory.getTop10LessonsForSystemPrompt(10);
      expect(r.formatted).toContain('ÉVITER');
    });

    it('retourne vide si aucune lesson', async () => {
      const r = await persistentMemory.getTop10LessonsForSystemPrompt(10);
      expect(r.count).toBe(0);
      expect(r.formatted).toBe('');
    });

    it('handle JSON corrompu sans crash', async () => {
      localStorage.setItem('ax_lessons_learned_struct', 'INVALID JSON {{');
      const r = await persistentMemory.getTop10LessonsForSystemPrompt(10);
      expect(r.count).toBe(0);
    });

    it('limite à n=N', async () => {
      const lessons = Array.from({ length: 30 }, (_, i) => ({
        category: 'sec',
        title: `Lesson #${i}`,
        severity: 'warn',
        resolved: false,
        ts: 100 + i,
      }));
      localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(lessons));
      const r = await persistentMemory.getTop10LessonsForSystemPrompt(10);
      expect(r.count).toBe(10);
    });
  });

  describe('memory.initBootDefaults — Bootstrap Kevin admin', () => {
    it('bootstrap inclut Laurence avec importance 95', async () => {
      localStorage.setItem('ax_user', JSON.stringify({ id: 'kdmc_admin', role: 'admin' }));
      await memory.initBootDefaults();
      const all = await persistentMemory.list({ scope: 'kdmc_admin', category: 'relationships' });
      const laurence = all.find((e) => e.text.includes('Saint-Polit'));
      expect(laurence).toBeDefined();
      expect(laurence!.category).toBe('relationships');
      expect(laurence!.importance).toBeGreaterThanOrEqual(90);
    });

    it('bootstrap inclut tous les projets Kevin', async () => {
      localStorage.setItem('ax_user', JSON.stringify({ id: 'kdmc_admin', role: 'admin' }));
      await memory.initBootDefaults();
      const all = await persistentMemory.list({ scope: 'kdmc_admin', category: 'projects' });
      const projectTexts = all.map((e) => e.text).join(' ');
      expect(projectTexts).toContain('Apex AI');
      expect(projectTexts).toContain('CMCteams');
      expect(projectTexts).toContain('e-KDMC');
      expect(projectTexts).toContain('Apex Chat');
      expect(projectTexts).toContain('Télécommande');
      expect(projectTexts).toContain('CrackPass');
    });

    it('idempotent (marker ax_kevin_init_done)', async () => {
      localStorage.setItem('ax_user', JSON.stringify({ id: 'kdmc_admin', role: 'admin' }));
      await memory.initBootDefaults();
      expect(localStorage.getItem('ax_kevin_init_done')).toBe('1');
      const before = (await persistentMemory.list({ scope: 'kdmc_admin' })).length;
      /* Re-run ne duplique pas */
      await memory.initBootDefaults();
      const after = (await persistentMemory.list({ scope: 'kdmc_admin' })).length;
      expect(after).toBe(before);
    });

    it('skip si pas user admin', async () => {
      localStorage.setItem('ax_user', JSON.stringify({ id: 'random_user' }));
      await memory.initBootDefaults();
      const all = await persistentMemory.list();
      expect(all.length).toBe(0);
    });
  });

  describe('Mission test — Apex se souvient après sync', () => {
    it('après initBootDefaults, system prompt contient identité complète', async () => {
      localStorage.setItem('ax_user', JSON.stringify({ id: 'kdmc_admin', role: 'admin' }));
      await memory.initBootDefaults();
      const prompt = await memory.buildSystemPromptDeep({ id: 'kdmc_admin', name: 'Kevin' });

      /* Apex sait Kevin */
      expect(prompt).toContain('Kevin');
      expect(prompt).toContain('Casino Monaco');
      /* Apex sait Laurence ❤️ */
      expect(prompt).toContain('Laurence');
      expect(prompt).toMatch(/femme|compagne/i);
      /* Apex sait projets */
      expect(prompt).toContain('CMCteams');
      expect(prompt).toContain('Apex AI');
    });
  });
});
