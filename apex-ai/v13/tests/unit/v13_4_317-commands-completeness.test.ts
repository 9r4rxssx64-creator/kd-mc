/**
 * Audit v13.4.317 — Kevin 2026-06-08 : « la liste de commandes, vérifie qu'elles
 * y soient toutes… va plus loin dans l'audit pour ne rien rater… je clique direct
 * sur une fonction et ça la lance (prefill) ».
 *
 * Test de COMPLÉTUDE + COHÉRENCE de la liste des commandes slash, câblé dans
 * test:ci → garantit qu'aucune commande ne sera oubliée / cassée / non-cliquable :
 *  1. Pas de doublon de nom ; chaque commande a nom + emoji + description.
 *  2. /help (helpText) liste TOUTES les commandes (rien d'oublié).
 *  3. parseSlashCommand('/<name>') reconnaît chaque commande (registre cohérent).
 *  4. Vue /commands : CHAQUE commande est cliquable (route → nav, action → prefill).
 */
import { describe, it, expect } from 'vitest';

import { render as renderCommands } from '../../features/commands/index.js';
import { SLASH_COMMANDS, helpText, parseSlashCommand } from '../../services/admin/slash-commands.js';

describe('v13.4.317 — complétude + cohérence des commandes slash', () => {
  it('aucun doublon de nom + nom/emoji/description non vides', () => {
    const names = SLASH_COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length); /* pas de doublon */
    for (const c of SLASH_COMMANDS) {
      expect(c.name.trim().length).toBeGreaterThan(0);
      expect(c.emoji.trim().length).toBeGreaterThan(0);
      expect(c.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('/help liste TOUTES les commandes (rien oublié)', () => {
    const help = helpText();
    for (const c of SLASH_COMMANDS) {
      expect(help).toContain('/' + c.name);
    }
  });

  it('parseSlashCommand reconnaît chaque commande du registre', () => {
    for (const c of SLASH_COMMANDS) {
      const r = parseSlashCommand('/' + c.name);
      expect(r.isSlash).toBe(true);
      expect(r.command?.name).toBe(c.name);
    }
  });

  it('vue /commands : CHAQUE commande est cliquable (data-cmd-route OU data-cmd-run)', () => {
    const div = document.createElement('div');
    renderCommands(div);
    const html = div.innerHTML;
    const clickable = (html.match(/data-cmd-route=/g)?.length ?? 0) + (html.match(/data-cmd-run=/g)?.length ?? 0);
    expect(clickable).toBe(SLASH_COMMANDS.length); /* toutes cliquables, aucune oubliée */
  });
});
