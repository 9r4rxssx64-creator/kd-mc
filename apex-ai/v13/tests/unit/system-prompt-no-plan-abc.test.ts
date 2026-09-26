/**
 * APEX v13.3.79 — Tests system prompt + identité ne contiennent PAS template
 * "Plan A/B/C" qui rendait les réponses Apex trop verbeuses (Kevin 2026-05-08
 * 18:00 screenshot "explique-moi plus / choisis dans la liste / je propose
 * solution standard / Laquelle préfères-tu ?").
 *
 * Vérifie :
 * 1. Le system prompt ne demande PAS d'énumérer "Plan A/B/C / Voici 3 façons d'aborder"
 * 2. Le system prompt contient la directive "RÉPONDS DIRECTEMENT" (concise)
 * 3. La règle critique apex-identity ajoute "NE PAS proposer de plans multiples"
 * 4. Multi-angles n'est plus mentionné comme directive comportementale
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { APEX_IDENTITY, buildIdentitySection } from '../../core/apex-identity.js';
import { memory } from '../../core/memory.js';

const KEVIN = { id: 'kdmc_admin', name: 'Kevin DESARZENS' };

describe('System prompt — pas de template Plan A/B/C verbeux (Kevin 2026-05-08)', () => {
  beforeEach(() => {
    localStorage.clear();
    memory.reload();
  });

  it('buildSystemPromptDeep ne contient PAS le TEMPLATE Plan A/B/C en exemple à imiter', async () => {
    const prompt = await memory.buildSystemPromptDeep(KEVIN);
    /* Vérifie qu'il n'y a pas le template "**Plan A** : ... **Plan B** : ...
     * **Plan C** : ..." que l'IA pourrait imiter directement.
     * Le prompt PEUT mentionner "Plan A/B/C" dans une INTERDICTION (c'est normal).
     * Pattern interdit : 3 occurrences de Plan A, B, C en bullet/section. */
    const planACount = (prompt.match(/\*\*Plan A\*\*/g) ?? []).length;
    const planBCount = (prompt.match(/\*\*Plan B\*\*/g) ?? []).length;
    const planCCount = (prompt.match(/\*\*Plan C\*\*/g) ?? []).length;
    expect(planACount).toBe(0);
    expect(planBCount).toBe(0);
    expect(planCCount).toBe(0);
    /* Pas de phrase exemple verbeuse */
    expect(prompt).not.toMatch(/Voici 3 façons d'aborder.*Laquelle préfères-tu/s);
  });

  it('buildSystemPromptDeep contient la directive "RÉPONDS DIRECTEMENT"', async () => {
    const prompt = await memory.buildSystemPromptDeep(KEVIN);
    expect(prompt).toContain('RÉPONDS DIRECTEMENT');
  });

  it('buildSystemPromptDeep contient l\'interdiction explicite des Plan A/B/C', async () => {
    const prompt = await memory.buildSystemPromptDeep(KEVIN);
    /* Doit interdire explicitement le pattern verbeux */
    expect(prompt).toMatch(/N'ÉNUMÈRE JAMAIS|NE PAS proposer de plans multiples/);
  });

  it('buildSystemPromptDeep ne demande PLUS "Multi-angles + alternatives" comme comportement', async () => {
    const prompt = await memory.buildSystemPromptDeep(KEVIN);
    /* "Multi-angles + alternatives" était la cause racine de la verbosité */
    expect(prompt).not.toContain('Multi-angles + alternatives');
  });

  it('APEX_IDENTITY.rules_critical contient la règle anti-Plan-A/B/C', () => {
    const hasRule = APEX_IDENTITY.rules_critical.some((r) =>
      /plans multiples|Plan A.*Plan B|verbeux|RÉPONDS DIRECTEMENT/i.test(r),
    );
    expect(hasRule).toBe(true);
  });

  it('buildIdentitySection injecte la nouvelle règle critique', () => {
    const section = buildIdentitySection();
    /* Match permissif : la règle peut être formulée différentes manières
     * tant que l'intention "réponds directement, pas de plans" est présente. */
    expect(section).toMatch(/RÉPONDS DIRECTEMENT|plans multiples|pas de plans/);
  });

  it('buildSystemPromptDeep ne contient JAMAIS le template "• Plan A: explique-moi" en exemple bullet', async () => {
    const prompt = await memory.buildSystemPromptDeep(KEVIN);
    /* Pattern strict : bullet markdown avec Plan + ":"  + texte (l'exemple
     * verbeux à éviter). La mention dans une INTERDICTION (avec /, sans ":")
     * reste autorisée. */
    expect(prompt).not.toMatch(/[•\-]\s*\*\*Plan A\*\*\s*:/);
    expect(prompt).not.toMatch(/[•\-]\s*\*\*Plan B\*\*\s*:/);
    expect(prompt).not.toMatch(/[•\-]\s*\*\*Plan C\*\*\s*:/);
  });
});
