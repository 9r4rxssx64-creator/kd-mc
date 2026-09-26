/**
 * v13.4.318 — Commandes personnalisées (Kevin 2026-06-08 : « ajouter une commande
 * et je rajoute sur qui/quoi/où l'appliquer »). Câblé dans test:ci.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { render as renderCommands } from '../../features/commands/index.js';
import {
  addCustomCommand,
  customCommandPrompt,
  listCustomCommands,
  removeCustomCommand,
} from '../../services/admin/custom-commands.js';

describe('v13.4.318 — store commandes perso', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('refuse nom ou action vide', () => {
    expect(addCustomCommand({ name: '', action: 'x' }).ok).toBe(false);
    expect(addCustomCommand({ name: 'x', action: '' }).ok).toBe(false);
  });

  it('ajoute + liste + cible (target)', () => {
    const r = addCustomCommand({ name: 'Rapport', action: 'Fais un rapport complet', target: 'Laurence', emoji: '📋' });
    expect(r.ok).toBe(true);
    const list = listCustomCommands();
    expect(list.length).toBe(1);
    expect(list[0]?.name).toBe('Rapport');
    expect(list[0]?.target).toBe('Laurence');
    expect(list[0]?.emoji).toBe('📋');
  });

  it('customCommandPrompt = action + cible (prefill chat)', () => {
    expect(customCommandPrompt({ action: 'Fais un audit', target: 'CMCteams' })).toBe('Fais un audit CMCteams');
    expect(customCommandPrompt({ action: 'Diagnostique', target: '' })).toBe('Diagnostique');
  });

  it('supprime par id', () => {
    const r = addCustomCommand({ name: 'A', action: 'fais A' });
    expect(r.ok).toBe(true);
    if (r.ok) removeCustomCommand(r.command.id);
    expect(listCustomCommands().length).toBe(0);
  });

  it('tolère un localStorage corrompu', () => {
    localStorage.setItem('apex_v13_custom_commands', '{bad json');
    expect(listCustomCommands()).toEqual([]);
  });
});

describe('v13.4.318 — vue /commands : section perso + ajout', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('affiche le formulaire d’ajout + une commande perso cliquable', () => {
    addCustomCommand({ name: 'Audit shop', action: 'Audit SEO', target: 'chez-lolo' });
    const div = document.createElement('div');
    renderCommands(div);
    const html = div.innerHTML;
    expect(html).toContain('⭐ Mes commandes');
    expect(html).toContain('id="cc-save"'); /* formulaire d'ajout présent */
    expect(html).toContain('data-cc-run='); /* la commande perso est cliquable */
    expect(html).toContain('Audit shop');
    expect(html).toContain('chez-lolo');
  });
});
