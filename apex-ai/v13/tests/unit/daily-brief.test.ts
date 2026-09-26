/**
 * APEX v13 — Tests Briefing du jour (Pulse / Daily Brief).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  dayKey,
  shouldShowToday,
  markShownToday,
  buildBriefPrompt,
  generateDailyBrief,
  type DailyBriefDeps,
} from '../../services/ai/daily-brief.js';

const D = new Date('2026-05-15T09:00:00');

describe('daily-brief — porte 1×/jour', () => {
  beforeEach(() => localStorage.clear());
  it('dayKey format AAAA-MM-JJ', () => {
    expect(dayKey(D)).toBe('2026-05-15');
  });
  it('shouldShowToday vrai au départ, faux après markShownToday', () => {
    expect(shouldShowToday(D)).toBe(true);
    markShownToday(D);
    expect(shouldShowToday(D)).toBe(false);
  });
  it('nouveau jour → à nouveau vrai', () => {
    markShownToday(D);
    expect(shouldShowToday(new Date('2026-05-16T09:00:00'))).toBe(true);
  });
});

describe('daily-brief — buildBriefPrompt', () => {
  it('inclut les faits', () => {
    const p = buildBriefPrompt([{ category: 'profile', text: 'aime le tennis' }], D);
    expect(p).toContain('aime le tennis');
    expect(p).toContain('briefing du jour');
  });
  it('gère 0 fait', () => {
    const p = buildBriefPrompt([], D);
    expect(p).toContain('aucun fait mémorisé');
  });
  it('plafonne à 30 faits', () => {
    const facts = Array.from({ length: 50 }, (_, i) => ({ category: 'c', text: `f${i}` }));
    const p = buildBriefPrompt(facts, D);
    expect(p).toContain('f0');
    expect(p).not.toContain('f30');
  });
});

describe('daily-brief — generateDailyBrief', () => {
  it('appelle ask avec le prompt construit et retourne le brief', async () => {
    const deps: DailyBriefDeps = {
      getFacts: () => [{ category: 'p', text: 'Kevin, Monaco' }],
      ask: vi.fn(async () => '☀️ Bonjour Kevin ! Voici ton brief.'),
    };
    const brief = await generateDailyBrief(deps, D);
    expect(brief).toContain('Bonjour Kevin');
    expect(deps.ask).toHaveBeenCalledTimes(1);
    const promptArg = (deps.ask as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0];
    expect(promptArg).toContain('Kevin, Monaco');
  });
  it('résilient si getFacts throw', async () => {
    const deps: DailyBriefDeps = {
      getFacts: () => { throw new Error('mem down'); },
      ask: vi.fn(async () => 'brief sans contexte'),
    };
    const brief = await generateDailyBrief(deps, D);
    expect(brief).toBe('brief sans contexte');
  });
});
