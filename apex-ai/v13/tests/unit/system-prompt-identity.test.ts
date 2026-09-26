/**
 * APEX v13 — Tests intégration identité dans buildSystemPromptDeep() (Kevin 2026-05-08).
 *
 * Vérifie que `buildSystemPromptDeep()` :
 *   1. PREPEND systématiquement `buildIdentitySection()` AVANT toute autre injection.
 *   2. L'identité reste présente même quand des docs/facts/lessons gigantesques
 *      auraient pu pousser le cap 32K chars (priorité absolue, jamais droppée).
 *   3. La section identité reste sous le budget ~600 tokens.
 *
 * Sans ce test, un refactor du build prompt pourrait silencieusement supprimer
 * l'identité → Apex oublierait qui il est, qui Kevin est, qui Laurence est.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { APEX_IDENTITY, buildIdentitySection } from '../../core/apex-identity.js';
import { memory } from '../../core/memory.js';

const KEVIN = { id: 'kdmc_admin', name: 'Kevin DESARZENS' };

describe('buildSystemPromptDeep() — Identité prepend en tête', () => {
  beforeEach(() => {
    localStorage.clear();
    memory.reload();
  });

  it('prompt commence par la section identité (avant baseContext, CLAUDE.md, etc.)', async () => {
    const prompt = await memory.buildSystemPromptDeep(KEVIN);
    const identitySection = buildIdentitySection();

    /* L'identité est en tout début de prompt (offset 0 ou très proche). */
    const idxIdentity = prompt.indexOf(identitySection);
    expect(idxIdentity).toBeGreaterThanOrEqual(0);
    expect(idxIdentity).toBeLessThan(50); /* doit être dans les 50 premiers chars */
  });

  it('contient Kevin DESARZENS, Laurence Saint-Polit, et compagne ❤️', async () => {
    const prompt = await memory.buildSystemPromptDeep(KEVIN);
    expect(prompt).toContain('Kevin DESARZENS');
    expect(prompt).toContain('Laurence Saint-Polit');
    expect(prompt).toContain('compagne ❤️');
  });

  it('contient les 7 projets Kevin', async () => {
    const prompt = await memory.buildSystemPromptDeep(KEVIN);
    for (const p of APEX_IDENTITY.projects) {
      expect(prompt).toContain(p.name);
    }
  });

  it('identité présente même avec docs gigantesques (cap 32K chars)', async () => {
    /* Simule docs racine pleins : 100K chars chacun → forcément tronqués. */
    const huge = 'X'.repeat(100000);
    localStorage.setItem(
      'apex_v13_docs_cache',
      JSON.stringify({
        'CLAUDE.md': { content: huge, ts: Date.now(), size: huge.length },
        'NOTES_USER.md': { content: huge, ts: Date.now(), size: huge.length },
        'MEMORY_PERSISTENT.md': { content: huge, ts: Date.now(), size: huge.length },
        'APEX_HANDOFF.md': { content: huge, ts: Date.now(), size: huge.length },
        'KEVIN_ACTIONS_TODO.md': { content: huge, ts: Date.now(), size: huge.length },
      }),
    );
    memory.reload();

    const prompt = await memory.buildSystemPromptDeep(KEVIN);

    /* Cap 32K chars respecté */
    expect(prompt.length).toBeLessThanOrEqual(32000);
    /* Identité TOUJOURS présente — non droppable même sous cap pression */
    expect(prompt).toContain('Kevin DESARZENS');
    expect(prompt).toContain('Laurence Saint-Polit');
  });

  it('identité présente même quand currentUser est null (boot ou logout)', async () => {
    const prompt = await memory.buildSystemPromptDeep(null);
    expect(prompt).toContain('Kevin DESARZENS');
    expect(prompt).toContain('Laurence Saint-Polit');
    expect(prompt).toContain('Apex AI');
  });

  it('section identité reste sous budget 600 tokens (~2400 chars)', () => {
    const section = buildIdentitySection();
    /* 1 token ≈ 4 chars FR/EN — heuristique standard Anthropic. */
    const estimatedTokens = Math.ceil(section.length / 4);
    expect(estimatedTokens).toBeLessThanOrEqual(600);
  });

  it('section identité contient les sections nominatives KEVIN/LAURENCE/PROJETS/RÈGLES', async () => {
    const prompt = await memory.buildSystemPromptDeep(KEVIN);
    /* Headers de la section identité (cf. buildIdentitySection()) — match permissif. */
    expect(prompt).toMatch(/=== KEVIN.*===/);
    expect(prompt).toMatch(/=== LAURENCE.*===/);
    expect(prompt).toMatch(/=== TES PROJETS.*===/);
    expect(prompt).toMatch(/=== RÈGLES CRITIQUES.*===/);
  });

  it('identité avant la section CLAUDE.md doc cache (priorité absolue)', async () => {
    /* Doc CLAUDE.md petit pour qu'il rentre. Marqueur unique pour distinguer
     * de l'éventuelle mention "CLAUDE.md" dans la section identité elle-même. */
    const claudeDocMarker = 'CLAUDE_DOC_CACHE_MARKER_XYZ';
    localStorage.setItem(
      'apex_v13_docs_cache',
      JSON.stringify({
        'CLAUDE.md': { content: claudeDocMarker, ts: Date.now(), size: 100 },
      }),
    );
    memory.reload();

    const prompt = await memory.buildSystemPromptDeep(KEVIN);

    const idxIdentityHeader = prompt.indexOf('=== KEVIN');
    const idxClaudeMdContent = prompt.indexOf(claudeDocMarker);

    expect(idxIdentityHeader).toBeGreaterThanOrEqual(0);
    expect(idxClaudeMdContent).toBeGreaterThanOrEqual(0);
    /* Identité doit apparaître AVANT le contenu réel de CLAUDE.md */
    expect(idxIdentityHeader).toBeLessThan(idxClaudeMdContent);
  });
});
