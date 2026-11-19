/**
 * GARDE DE PARITÉ (Kevin 18.11, pont 2769 : « un garde qui compare la liste d'outils de Bee et celle d'Apex AI, rouge dès qu'une diverge »).
 * Les outils de parité de Bee (services/kdmc-router/bee-parite.js) doivent exister dans Apex AI. Tant qu'un outil n'est pas porté, il est listé
 * ci-dessous AVEC son propriétaire ; la liste ne peut que RÉTRÉCIR : un outil porté mais encore listé fait aussi échouer le garde.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_TOOLS } from '../../services/apex-tools-registry/admin-tools.js';
import { WEB_TOOLS } from '../../services/apex-tools-registry/web-tools.js';
import { COMM_TOOLS } from '../../services/apex-tools-registry/comm-tools.js';

const PAS_ENCORE_PORTES: Record<string, string> = {
  appeler: 'apex-cloud (mission 2769, ligne « appeler » ; porte /__admin/appel déjà en ligne)',
};

const src = readFileSync(`${process.cwd()}/../../services/kdmc-router/bee-parite.js`, 'utf8');
const defs = src.slice(src.indexOf('const defs = ['), src.indexOf('const exe = {'));
const outilsBee = [...defs.matchAll(/name:\s*'([a-z_]+)'/g)].map((m) => m[1] as string);
const outilsApexAi = new Set([...ADMIN_TOOLS, ...WEB_TOOLS, ...COMM_TOOLS].map((t) => t.name));

describe('parité Bee ⇄ Apex AI', () => {
  it('on lit bien les outils de parité de Bee', () => {
    expect(outilsBee).toEqual(expect.arrayContaining(['lien_externe', 'comptes_cmcteams', 'appeler']));
  });
  it('chaque outil de parité de Bee existe dans Apex AI, ou est listé « pas encore porté » avec son propriétaire', () => {
    const manquants = outilsBee.filter((n) => !outilsApexAi.has(n) && !(n in PAS_ENCORE_PORTES));
    expect(manquants).toEqual([]);
  });
  it('un outil déjà porté ne reste pas dans la liste « pas encore porté »', () => {
    const portes = Object.keys(PAS_ENCORE_PORTES).filter((n) => outilsApexAi.has(n));
    expect(portes).toEqual([]);
  });
  it('comptes_cmcteams et lien_externe sont portés', () => {
    expect(outilsApexAi.has('comptes_cmcteams')).toBe(true);
    expect(outilsApexAi.has('lien_externe')).toBe(true);
  });
});
