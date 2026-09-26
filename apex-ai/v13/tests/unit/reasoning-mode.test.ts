/**
 * APEX v13 — Tests effort de raisonnement + extraction de la réflexion.
 * Parité flagship (molette d'effort + thinking display), approche provider-agnostique.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  getReasoningEffort,
  setReasoningEffort,
  buildEffortInjection,
  extractThinking,
} from '../../services/ai/reasoning-mode.js';

describe('reasoning-mode — effort setting', () => {
  beforeEach(() => localStorage.clear());

  it('défaut = auto', () => {
    expect(getReasoningEffort()).toBe('auto');
  });
  it('set + get persistant', () => {
    expect(setReasoningEffort('high')).toBe(true);
    expect(getReasoningEffort()).toBe('high');
  });
  it('rejette une valeur invalide', () => {
    // @ts-expect-error test valeur invalide
    expect(setReasoningEffort('turbo')).toBe(false);
    expect(getReasoningEffort()).toBe('auto');
  });
  it('coexiste avec d\'autres réglages ax_settings', () => {
    localStorage.setItem('ax_settings', JSON.stringify({ theme: 'dark' }));
    setReasoningEffort('medium');
    const s = JSON.parse(localStorage.getItem('ax_settings')!) as Record<string, unknown>;
    expect(s['theme']).toBe('dark');
    expect(s['reasoning_effort']).toBe('medium');
  });
  it('tolère ax_settings corrompu', () => {
    localStorage.setItem('ax_settings', '{bad');
    expect(getReasoningEffort()).toBe('auto');
  });
});

describe('reasoning-mode — buildEffortInjection', () => {
  it('auto → vide', () => {
    expect(buildEffortInjection('auto')).toBe('');
  });
  it('high → demande un bloc <thinking>', () => {
    const inj = buildEffortInjection('high');
    expect(inj).toContain('<thinking>');
    expect(inj).toContain('ÉLEVÉ');
  });
  it('low → répondre directement', () => {
    expect(buildEffortInjection('low')).toContain('DIRECT');
  });
  it('medium → conditionnel', () => {
    expect(buildEffortInjection('medium')).toContain('MOYEN');
  });
});

describe('reasoning-mode — extractThinking', () => {
  it('sépare <thinking>…</thinking> de la réponse', () => {
    const { thinking, answer } = extractThinking('<thinking>je réfléchis</thinking>Voici la réponse.');
    expect(thinking).toBe('je réfléchis');
    expect(answer).toBe('Voici la réponse.');
  });
  it('accepte <think> court', () => {
    const { thinking, answer } = extractThinking('<think>ok</think>Rép');
    expect(thinking).toBe('ok');
    expect(answer).toBe('Rép');
  });
  it('accepte une fence ```thinking', () => {
    const { thinking, answer } = extractThinking('```thinking\nétape 1\n```\nRéponse finale');
    expect(thinking).toBe('étape 1');
    expect(answer).toBe('Réponse finale');
  });
  it('bloc ouvert non fermé (streaming) = réflexion en cours', () => {
    const { thinking, answer } = extractThinking('Intro<thinking>je suis en train de');
    expect(thinking).toBe('je suis en train de');
    expect(answer).toBe('Intro');
  });
  it('pas de bloc → tout est réponse', () => {
    const { thinking, answer } = extractThinking('juste une réponse');
    expect(thinking).toBe('');
    expect(answer).toBe('juste une réponse');
  });
  it('texte vide', () => {
    expect(extractThinking('')).toEqual({ thinking: '', answer: '' });
  });
});
