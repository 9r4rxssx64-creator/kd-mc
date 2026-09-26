/**
 * APEX v13 — Tests Assistants personnalisés (Gems / Custom GPTs).
 * Parité flagship 2026. Couvre CRUD, sélection active, injection system prompt,
 * export/import, isolation per-user, validation, presets.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { customAssistants, ASSISTANT_PRESETS } from '../../services/ai/custom-assistants.js';

const U = 'user_test';

describe('custom-assistants — CRUD + active + injection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('save() crée un assistant valide', () => {
    const a = customAssistants.save({ name: 'Coach', emoji: '🎯', instructions: 'Sois concis.' }, U);
    expect(a).not.toBeNull();
    expect(a!.name).toBe('Coach');
    expect(a!.emoji).toBe('🎯');
    expect(a!.id).toMatch(/^asst_/);
    expect(customAssistants.list(U)).toHaveLength(1);
  });

  it('save() refuse nom OU instructions vides', () => {
    expect(customAssistants.save({ name: '', instructions: 'x'.repeat(20) }, U)).toBeNull();
    expect(customAssistants.save({ name: 'X', instructions: '' }, U)).toBeNull();
    expect(customAssistants.list(U)).toHaveLength(0);
  });

  it('emoji par défaut 🤖 si absent', () => {
    const a = customAssistants.save({ name: 'N', instructions: 'i' }, U);
    expect(a!.emoji).toBe('🤖');
  });

  it('save() avec id existant = update (pas de doublon)', () => {
    const a = customAssistants.save({ name: 'A', instructions: 'v1' }, U)!;
    const b = customAssistants.save({ id: a.id, name: 'A2', instructions: 'v2' }, U)!;
    expect(b.id).toBe(a.id);
    expect(customAssistants.list(U)).toHaveLength(1);
    expect(customAssistants.get(a.id, U)!.name).toBe('A2');
    expect(customAssistants.get(a.id, U)!.instructions).toBe('v2');
  });

  it('remove() supprime + désactive si actif', () => {
    const a = customAssistants.save({ name: 'A', instructions: 'i' }, U)!;
    customAssistants.setActive(a.id, U);
    expect(customAssistants.getActiveId(U)).toBe(a.id);
    expect(customAssistants.remove(a.id, U)).toBe(true);
    expect(customAssistants.list(U)).toHaveLength(0);
    expect(customAssistants.getActiveId(U)).toBeNull();
  });

  it('setActive(null) désactive', () => {
    const a = customAssistants.save({ name: 'A', instructions: 'i' }, U)!;
    customAssistants.setActive(a.id, U);
    customAssistants.setActive(null, U);
    expect(customAssistants.getActive(U)).toBeNull();
  });

  it('setActive ignore un id inexistant', () => {
    customAssistants.setActive('nope', U);
    expect(customAssistants.getActiveId(U)).toBeNull();
  });

  it('buildInjection() vide si aucun assistant actif', () => {
    customAssistants.save({ name: 'A', instructions: 'i' }, U);
    expect(customAssistants.buildInjection(U)).toBe('');
  });

  it('buildInjection() contient nom + instructions de l\'assistant actif', () => {
    const a = customAssistants.save({ name: 'Juriste', emoji: '⚖️', instructions: 'Cite les articles.' }, U)!;
    customAssistants.setActive(a.id, U);
    const inj = customAssistants.buildInjection(U);
    expect(inj).toContain('Juriste');
    expect(inj).toContain('⚖️');
    expect(inj).toContain('Cite les articles.');
    expect(inj).toContain('ASSISTANT PERSONNALISÉ');
  });

  it('isolation per-user stricte', () => {
    customAssistants.save({ name: 'A', instructions: 'i' }, 'userA');
    expect(customAssistants.list('userA')).toHaveLength(1);
    expect(customAssistants.list('userB')).toHaveLength(0);
  });

  it('export/import roundtrip', () => {
    customAssistants.save({ name: 'A', instructions: 'ia' }, U);
    customAssistants.save({ name: 'B', instructions: 'ib' }, U);
    const json = customAssistants.exportJson(U);
    const n = customAssistants.importJson(json, 'userC');
    expect(n).toBe(2);
    expect(customAssistants.list('userC')).toHaveLength(2);
  });

  it('importJson garde le plus récent en cas de conflit d\'id', () => {
    const a = customAssistants.save({ name: 'A', instructions: 'old' }, U)!;
    const newer = { ...a, instructions: 'new', updatedAt: a.updatedAt + 1000 };
    const n = customAssistants.importJson(JSON.stringify([newer]), U);
    expect(n).toBe(1);
    expect(customAssistants.get(a.id, U)!.instructions).toBe('new');
  });

  it('importJson rejette JSON invalide / non-tableau', () => {
    expect(customAssistants.importJson('pas du json', U)).toBe(0);
    expect(customAssistants.importJson('{"a":1}', U)).toBe(0);
  });

  it('list() tolère localStorage corrompu', () => {
    localStorage.setItem('apex_v13_assistants_' + U, '{bad json');
    expect(customAssistants.list(U)).toEqual([]);
  });

  it('presets exposés + créables', () => {
    expect(ASSISTANT_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const p of ASSISTANT_PRESETS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.instructions.length).toBeGreaterThan(10);
    }
    const saved = customAssistants.save({ ...ASSISTANT_PRESETS[0]! }, U);
    expect(saved).not.toBeNull();
  });

  it('instructions tronquées à 8000 chars', () => {
    const a = customAssistants.save({ name: 'Long', instructions: 'x'.repeat(9000) }, U)!;
    expect(a.instructions.length).toBe(8000);
  });
});
