/**
 * APEX v13 — Tests Projects / Workspaces (CRUD, notes, active, injection).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { projects } from '../../services/ai/projects.js';

const U = 'user_proj';

describe('projects — CRUD + notes + injection', () => {
  beforeEach(() => localStorage.clear());

  it('save crée un projet', () => {
    const p = projects.save({ name: 'App mobile', emoji: '📱', instructions: 'Ton pro.' }, U);
    expect(p).not.toBeNull();
    expect(p!.name).toBe('App mobile');
    expect(p!.knowledge).toEqual([]);
    expect(projects.list(U)).toHaveLength(1);
  });
  it('refuse nom vide', () => {
    expect(projects.save({ name: '  ' }, U)).toBeNull();
  });
  it('emoji défaut 📁', () => {
    expect(projects.save({ name: 'X' }, U)!.emoji).toBe('📁');
  });
  it('save avec id = update', () => {
    const p = projects.save({ name: 'A', instructions: 'v1' }, U)!;
    const u = projects.save({ id: p.id, name: 'A2', instructions: 'v2' }, U)!;
    expect(u.id).toBe(p.id);
    expect(projects.list(U)).toHaveLength(1);
    expect(projects.get(p.id, U)!.name).toBe('A2');
  });
  it('addNote / removeNote', () => {
    const p = projects.save({ name: 'A' }, U)!;
    expect(projects.addNote(p.id, { title: 'Specs', content: 'Doit être rapide.' }, U)).toBe(true);
    expect(projects.get(p.id, U)!.knowledge).toHaveLength(1);
    expect(projects.addNote(p.id, { title: 'Vide', content: '  ' }, U)).toBe(false);
    expect(projects.removeNote(p.id, 0, U)).toBe(true);
    expect(projects.get(p.id, U)!.knowledge).toHaveLength(0);
  });
  it('active + injection contient instructions + connaissances', () => {
    const p = projects.save({ name: 'RGPD', emoji: '⚖️', instructions: 'Cite les articles.' }, U)!;
    projects.addNote(p.id, { title: 'Art. 17', content: 'Droit à l\'effacement.' }, U);
    projects.setActive(p.id, U);
    const inj = projects.buildInjection(U);
    expect(inj).toContain('RGPD');
    expect(inj).toContain('Cite les articles.');
    expect(inj).toContain('Art. 17');
    expect(inj).toContain('Droit à l\'effacement.');
    expect(inj).toContain('PROJET ACTIF');
  });
  it('injection vide si aucun projet actif', () => {
    projects.save({ name: 'A', instructions: 'i' }, U);
    expect(projects.buildInjection(U)).toBe('');
  });
  it('remove désactive si actif', () => {
    const p = projects.save({ name: 'A' }, U)!;
    projects.setActive(p.id, U);
    expect(projects.remove(p.id, U)).toBe(true);
    expect(projects.getActiveId(U)).toBeNull();
  });
  it('isolation per-user', () => {
    projects.save({ name: 'A' }, 'uA');
    expect(projects.list('uA')).toHaveLength(1);
    expect(projects.list('uB')).toHaveLength(0);
  });
  it('injection bornée (budget contexte)', () => {
    const p = projects.save({ name: 'Big' }, U)!;
    for (let i = 0; i < 5; i++) projects.addNote(p.id, { title: 'N' + i, content: 'x'.repeat(8000) }, U);
    projects.setActive(p.id, U);
    const inj = projects.buildInjection(U);
    expect(inj.length).toBeLessThanOrEqual(24000);
  });
  it('tolère localStorage corrompu', () => {
    localStorage.setItem('apex_v13_projects_' + U, 'not json');
    expect(projects.list(U)).toEqual([]);
  });
});
