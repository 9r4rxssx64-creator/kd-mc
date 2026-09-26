/**
 * Tests services/slash-commands — Apex v13.3.48 Chat Max
 * Demande Kevin "chat niveau Claude.ai/ChatGPT"
 */
import { describe, it, expect } from 'vitest';

import {
  parseSlashCommand,
  filterCommands,
  helpText,
  SLASH_COMMANDS,
} from '../../services/admin/slash-commands.js';

describe('services/slash-commands', () => {
  describe('SLASH_COMMANDS catalogue', () => {
    it('contient au moins 10 commandes', () => {
      expect(SLASH_COMMANDS.length).toBeGreaterThanOrEqual(10);
    });

    it('chaque commande a name + emoji + description', () => {
      for (const cmd of SLASH_COMMANDS) {
        expect(cmd.name).toMatch(/^[a-z][a-z-]*$/); /* kebab-case autorisé (ex: team-onboarding) */
        expect(cmd.emoji.length).toBeGreaterThan(0);
        expect(cmd.description.length).toBeGreaterThan(5);
      }
    });

    it('contient les commandes essentielles', () => {
      const names = SLASH_COMMANDS.map((c) => c.name);
      expect(names).toContain('help');
      expect(names).toContain('clear');
      expect(names).toContain('export');
      expect(names).toContain('regen');
      expect(names).toContain('search');
    });
  });

  describe('parseSlashCommand', () => {
    it('retourne isSlash:false pour texte normal', () => {
      expect(parseSlashCommand('hello world').isSlash).toBe(false);
      expect(parseSlashCommand('').isSlash).toBe(false);
    });

    it('détecte slash seul comme unknown', () => {
      const r = parseSlashCommand('/');
      expect(r.isSlash).toBe(true);
      expect(r.unknown).toBe(true);
    });

    it('parse /help correctement', () => {
      const r = parseSlashCommand('/help');
      expect(r.isSlash).toBe(true);
      expect(r.command?.name).toBe('help');
      expect(r.args).toBe('');
    });

    it('parse /search avec args', () => {
      const r = parseSlashCommand('/search mon mot-clé');
      expect(r.command?.name).toBe('search');
      expect(r.args).toBe('mon mot-clé');
    });

    it('marque commande inconnue comme unknown', () => {
      const r = parseSlashCommand('/inexistante');
      expect(r.isSlash).toBe(true);
      expect(r.unknown).toBe(true);
      expect(r.rawCommand).toBe('inexistante');
    });

    it('case-insensitive', () => {
      const r = parseSlashCommand('/HELP');
      expect(r.command?.name).toBe('help');
    });

    it('trim espaces', () => {
      const r = parseSlashCommand('  /clear  ');
      expect(r.command?.name).toBe('clear');
    });

    it('gère args avec espaces multiples', () => {
      const r = parseSlashCommand('/search  hello   world');
      expect(r.args).toBe('hello   world');
    });
  });

  describe('filterCommands', () => {
    it('retourne max 6 sans prefix', () => {
      const results = filterCommands('');
      expect(results.length).toBeLessThanOrEqual(6);
    });

    it('priorise startsWith sur includes', () => {
      const results = filterCommands('h');
      expect(results[0]?.name).toBe('help');
    });

    it('match dans description aussi', () => {
      const results = filterCommands('vocale');
      expect(results.some((c) => c.name === 'voice')).toBe(true);
    });

    it('case-insensitive', () => {
      const r1 = filterCommands('HELP');
      const r2 = filterCommands('help');
      expect(r1.length).toBe(r2.length);
    });

    it('retourne vide si aucun match', () => {
      const results = filterCommands('zzzzzzzzz');
      expect(results.length).toBe(0);
    });
  });

  describe('helpText', () => {
    it('retourne markdown contenant toutes les commandes', () => {
      const text = helpText();
      expect(text).toContain('Commandes disponibles');
      for (const cmd of SLASH_COMMANDS) {
        expect(text).toContain(`/${cmd.name}`);
      }
    });
  });
});
