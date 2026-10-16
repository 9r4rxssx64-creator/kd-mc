/*
 * depot-github.test.ts — La porte unique de lecture du dépôt.
 *
 * Ce que ces tests protègent : le jour où CMCteams passera en privé, les
 * lectures sans jeton renverront 404. Comme le code ignore un document
 * manquant, Apex arrêterait de relire ses documents SANS RIEN DIRE. Ces
 * tests garantissent qu'il n'y a qu'UN endroit à basculer, et que personne
 * n'en rouvre un deuxième ailleurs.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  adresseRelais,
  urlLecture,
  urlListe,
  lireFichier,
  listerDossier,
  diagnostiquerAcces,
  CLE_RELAIS,
  DEPOT,
} from '../../services/integrations/depot-github.js';

describe('depot-github — choix de l’adresse', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sans relais configuré, lit en public — donc rien ne change aujourd’hui', () => {
    expect(urlLecture('CLAUDE.md')).toBe(
      `https://raw.githubusercontent.com/${DEPOT}/main/CLAUDE.md`,
    );
    expect(urlListe('.claude/skills')).toBe(
      `https://api.github.com/repos/${DEPOT}/contents/.claude/skills?ref=main`,
    );
  });

  it('avec un relais configuré, TOUT passe par le relais (jeton côté serveur)', () => {
    localStorage.setItem(CLE_RELAIS, 'https://relais.exemple.workers.dev');
    const u = urlLecture('NOTES_USER.md');
    expect(u.startsWith('https://relais.exemple.workers.dev?action=read')).toBe(true);
    expect(u).toContain('path=NOTES_USER.md');
    /* Le point qui compte : plus aucune lecture directe, sinon le passage
       en privé casserait en silence. */
    expect(u).not.toContain('raw.githubusercontent.com');
    expect(urlListe('.claude/hooks')).not.toContain('api.github.com');
  });

  it('une adresse de relais bancale est ignorée plutôt que suivie', () => {
    /* Envoyer les lectures vers une adresse douteuse serait pire que de ne
       pas avoir de relais du tout. */
    for (const mauvaise of ['http://pas-https.example', 'nimporte quoi', ' ', 'javascript:alert(1)']) {
      localStorage.setItem(CLE_RELAIS, mauvaise);
      expect(adresseRelais()).toBe('');
      expect(urlLecture('CLAUDE.md')).toContain('raw.githubusercontent.com');
    }
  });

  it('la barre oblique finale du relais ne crée pas une adresse à double barre', () => {
    localStorage.setItem(CLE_RELAIS, 'https://relais.exemple.workers.dev/');
    expect(urlLecture('CLAUDE.md')).not.toContain('dev/?');
  });

  it('un chemin commençant par une barre ne casse pas l’adresse', () => {
    expect(urlLecture('/CLAUDE.md')).toBe(
      `https://raw.githubusercontent.com/${DEPOT}/main/CLAUDE.md`,
    );
  });
});

describe('depot-github — la lecture ne fait jamais planter Apex', () => {
  const vraiFetch = globalThis.fetch;
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    globalThis.fetch = vraiFetch;
    vi.restoreAllMocks();
  });

  it('un 404 rend null au lieu de lever une erreur', async () => {
    globalThis.fetch = vi.fn(async () => new Response('Not Found', { status: 404 })) as never;
    await expect(lireFichier('CLAUDE.md')).resolves.toBeNull();
  });

  it('une coupure réseau rend null au lieu de lever une erreur', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('réseau coupé');
    }) as never;
    await expect(lireFichier('CLAUDE.md')).resolves.toBeNull();
    await expect(listerDossier('.claude/skills')).resolves.toEqual([]);
  });

  it('une réponse qui n’est pas une liste rend un tableau vide', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"message":"Not Found"}', { status: 200 })) as never;
    await expect(listerDossier('.claude/skills')).resolves.toEqual([]);
  });

  it('le diagnostic dit POURQUOI la lecture échoue au lieu de rester muet', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 404 })) as never;
    const d = await diagnostiquerAcces();
    expect(d.ok).toBe(false);
    expect(d.via).toBe('public');
    /* Message en français, sans jargon : Kevin doit comprendre. */
    expect(d.detail).toContain('privé');
  });
});

/*
 * LE GARDE : personne ne rouvre une lecture directe ailleurs.
 *
 * Sans lui, un futur ajout referait une lecture publique dans son coin, et
 * le passage en privé recasserait quelque chose en silence — exactement le
 * problème qu'on vient de fermer.
 */
describe('depot-github — aucune lecture directe ailleurs', () => {
  const RACINE = join(__dirname, '..', '..');

  /* Les seules exceptions tolérées, chacune avec sa raison. Elles envoient
     DÉJÀ un jeton GitHub : les faire passer par la porte publique les
     affaiblirait au lieu de les renforcer. */
  const EXCEPTIONS = new Map<string, string>([
    [
      'services/admin/apex-claude-code-parity.ts',
      'envoie déjà un jeton (getGitHubToken) : fonctionnera encore en privé',
    ],
    [
      'services/core-svc/apex-orchestration-skills.ts',
      "simple liste de domaines autorisés, aucune lecture n'est faite ici",
    ],
    [
      'services/integrations/depot-github.ts',
      'la porte elle-même',
    ],
  ]);

  function fichiersTs(dossier: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dossier)) {
      if (e === 'node_modules' || e === 'tests' || e === 'dist') continue;
      const p = join(dossier, e);
      if (statSync(p).isDirectory()) fichiersTs(p, acc);
      else if (e.endsWith('.ts')) acc.push(p);
    }
    return acc;
  }

  it('aucun NOUVEAU fichier ne lit raw.githubusercontent en direct', () => {
    const coupables: string[] = [];
    for (const p of fichiersTs(RACINE)) {
      const rel = p.slice(RACINE.length + 1).replace(/\\/g, '/');
      if (EXCEPTIONS.has(rel)) continue;
      if (readFileSync(p, 'utf8').includes('raw.githubusercontent.com')) coupables.push(rel);
    }
    expect(
      coupables,
      'Ces fichiers lisent le dépôt en direct. Ils casseront EN SILENCE quand ' +
        'CMCteams passera en privé. Utiliser lireFichier() de ' +
        'services/integrations/depot-github à la place.',
    ).toEqual([]);
  });
});
