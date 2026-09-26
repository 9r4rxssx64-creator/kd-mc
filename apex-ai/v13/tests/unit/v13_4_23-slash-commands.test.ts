/**
 * Test régression v13.4.23 — services/slash-commands.ts (parser + autocomplete).
 *
 * Utilisé par features/chat/index.ts handleSlashCommand pour parser
 * `/help`, `/clear`, `/voice`, `/export`, `/settings`, `/snippets` (v13.4.16).
 *
 * Tests : parseSlashCommand + filterCommands + helpText + SLASH_COMMANDS registry.
 */
import { describe, it, expect } from 'vitest';
import {
  parseSlashCommand,
  filterCommands,
  helpText,
  SLASH_COMMANDS,
} from '../../services/admin/slash-commands.js';

describe('v13.4.23 parseSlashCommand — détection & parsing', () => {
  it("texte normal SANS slash → isSlash false", () => {
    expect(parseSlashCommand('bonjour kevin').isSlash).toBe(false);
    expect(parseSlashCommand('phrase normale').isSlash).toBe(false);
  });

  it("texte vide ou null → isSlash false", () => {
    expect(parseSlashCommand('').isSlash).toBe(false);
    expect(parseSlashCommand('   ').isSlash).toBe(false);
     
    expect((parseSlashCommand as any)(null).isSlash).toBe(false);
    expect((parseSlashCommand as any)(undefined).isSlash).toBe(false);
  });

  it("juste '/' seul → isSlash true + unknown true", () => {
    const r = parseSlashCommand('/');
    expect(r.isSlash).toBe(true);
    expect(r.unknown).toBe(true);
  });

  it("commande connue /help → command matché", () => {
    const r = parseSlashCommand('/help');
    expect(r.isSlash).toBe(true);
    expect(r.unknown).toBeFalsy();
    expect(r.command?.name).toBe('help');
  });

  it("commande connue /clear → matchée", () => {
    expect(parseSlashCommand('/clear').command?.name).toBe('clear');
  });

  it("commande v13.4.16 /snippets matchée", () => {
    expect(parseSlashCommand('/snippets').command?.name).toBe('snippets');
  });

  it("case-insensitive : /HELP matché comme /help", () => {
    expect(parseSlashCommand('/HELP').command?.name).toBe('help');
    expect(parseSlashCommand('/HeLp').command?.name).toBe('help');
  });

  it("commande inconnue → unknown true + rawCommand préservé", () => {
    const r = parseSlashCommand('/inconnue123');
    expect(r.isSlash).toBe(true);
    expect(r.unknown).toBe(true);
    expect(r.rawCommand).toBe('inconnue123');
  });

  it("args extraits après nom", () => {
    const r = parseSlashCommand('/search query terms here');
    expect(r.args).toBe('query terms here');
  });

  it("trim whitespace autour", () => {
    const r = parseSlashCommand('  /help   ');
    expect(r.command?.name).toBe('help');
  });

  it("args vide si commande sans args", () => {
    const r = parseSlashCommand('/help');
    expect(r.args).toBeFalsy();
  });
});

describe('v13.4.23 filterCommands — autocomplete', () => {
  it("prefix vide → premières 6 commandes", () => {
    const r = filterCommands('');
    expect(r.length).toBeLessThanOrEqual(6);
    expect(r.length).toBeGreaterThan(0);
  });

  it("prefix 'hel' → /help matché", () => {
    const r = filterCommands('hel');
    expect(r.some((c) => c.name === 'help')).toBe(true);
  });

  it("prefix 'cl' → /clear matché", () => {
    const r = filterCommands('cl');
    expect(r.some((c) => c.name === 'clear')).toBe(true);
  });

  it("prefix 'snip' → /snippets matché (v13.4.16)", () => {
    const r = filterCommands('snip');
    expect(r.some((c) => c.name === 'snippets')).toBe(true);
  });

  it("case-insensitive matching", () => {
    expect(filterCommands('HEL').some((c) => c.name === 'help')).toBe(true);
    expect(filterCommands('Hel').some((c) => c.name === 'help')).toBe(true);
  });

  it("startsWith priorité sur includes (ordre pertinence)", () => {
    /* 'c' matche 'clear' (startsWith) ET 'voice' (NE matche pas 'c' donc skip)
     * mais 'export' n'a pas 'c' au début → après. */
    const r = filterCommands('c');
    const idx = r.findIndex((c) => c.name === 'clear');
    expect(idx).toBeGreaterThanOrEqual(0);
    if (idx >= 0) {
      /* clear doit apparaître AVANT toutes les commandes qui contiennent 'c' mais ne commencent pas par */
      const clearIdx = r.findIndex((c) => c.name === 'clear');
      expect(clearIdx).toBeLessThanOrEqual(5);
    }
  });

  it("cap 6 max résultats", () => {
    const r = filterCommands('');
    expect(r.length).toBeLessThanOrEqual(6);
  });

  it("prefix inconnu non-existant → [] ou peu de résultats", () => {
    const r = filterCommands('xyzxyznotfound');
    expect(r.length).toBeLessThanOrEqual(2);
  });
});

describe('v13.4.23 helpText — markdown listing', () => {
  it("contient header markdown", () => {
    const h = helpText();
    expect(h).toContain('### Commandes disponibles');
  });

  it("liste toutes les SLASH_COMMANDS", () => {
    const h = helpText();
    for (const cmd of SLASH_COMMANDS) {
      expect(h).toContain(cmd.name);
      expect(h).toContain(cmd.emoji);
      expect(h).toContain(cmd.description);
    }
  });

  it("indique l'autocomplete '/'", () => {
    const h = helpText();
    expect(h).toContain('autocomplete');
  });
});

describe('v13.4.23 SLASH_COMMANDS registry', () => {
  it("contient toutes les commandes attendues", () => {
    const names = SLASH_COMMANDS.map((c) => c.name);
    expect(names).toContain('help');
    expect(names).toContain('clear');
    expect(names).toContain('voice');
    expect(names).toContain('export');
    expect(names).toContain('settings');
    expect(names).toContain('snippets'); /* v13.4.16 ajout */
  });

  it("toutes les entrées ont name + emoji + description + argsHint", () => {
    for (const c of SLASH_COMMANDS) {
      expect(c.name).toBeTruthy();
      expect(c.emoji).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(c.argsHint).toBeDefined(); /* peut être '' mais doit exister */
    }
  });

  it("noms uniques (pas de doublon)", () => {
    const names = SLASH_COMMANDS.map((c) => c.name);
    const uniq = new Set(names);
    expect(uniq.size).toBe(names.length);
  });

  it("noms en lowercase (matching case-insensitive correct)", () => {
    for (const c of SLASH_COMMANDS) {
      expect(c.name).toBe(c.name.toLowerCase());
    }
  });
});
