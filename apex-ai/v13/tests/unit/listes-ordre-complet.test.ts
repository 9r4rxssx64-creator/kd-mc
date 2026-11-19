/**
 * v13.4.400 (apex-cloud, Kevin 17.11 « rien ne manque · le plus récent en premier » : audit des listes d'Apex AI).
 * Mesuré : (1) un projet modifié restait à sa place (seule la création remontait) ; (2) l'archive coupait à 100 éléments SANS le dire.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { plusRecentsDabord } from '../../services/ai/projects.js';

const lire = (f: string): string => readFileSync(`${process.cwd()}/${f}`, 'utf8');

describe('projets : le plus récent en premier', () => {
  it('un projet modifié remonte en tête, sans muter la liste d\'origine', () => {
    const base = [{ id: 'a', updatedAt: 10 }, { id: 'b', updatedAt: 30 }, { id: 'c', updatedAt: 20 }];
    expect(plusRecentsDabord(base).map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(base.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
  it('l\'écran des projets passe par ce tri', () => {
    expect(lire('features/projects/index.ts')).toMatch(/plusRecentsDabord\(projects\.list\(uid\)\)/);
  });
});

describe('archive : rien ne manque sans qu\'on le dise', () => {
  const src = lire('features/archive/index.ts');
  it('la coupure à 100 est annoncée (nombre montré sur nombre total)', () => {
    expect(src).toMatch(/const ARCHIVE_MAX = 100/);
    expect(src).toMatch(/ax-archive-reste/);
    expect(src).toMatch(/plus récents sur \$\{items\.length\}/);
    expect(src).not.toMatch(/items\.slice\(0, 100\)/);
  });
});
