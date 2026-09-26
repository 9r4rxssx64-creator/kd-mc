import { describe, it, expect } from 'vitest';
import { searchIn, compactMemory, type MemItem } from '../../services/ai/compact-memory';

const DATA: MemItem[] = [
  { t: 'Kevin DESARZENS admin kd-mc.com Monaco travaille sur iPhone PAS codeur', g: ['kevin', 'profil'], i: 100 },
  { t: 'vitest tourne depuis apex-ai/v13 sinon faux echecs', g: ['test', 'vitest'], i: 85 },
  { t: 'World Monitor feux NASA FIRMS via worker kdmc-live cle serveur', g: ['worldmonitor', 'firms'], i: 80 },
  { t: 'Anthropic reste IA principale, secours Cerebras et Mistral', g: ['apex', 'ia'], i: 90 },
];

describe('compact-memory searchIn', () => {
  it('trouve le souvenir pertinent en tête', () => {
    const r = searchIn(DATA, 'où lancer les tests vitest', 2);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].t).toContain('vitest');
  });

  it('classe FIRMS pour une requête feux carte', () => {
    const r = searchIn(DATA, 'feux nasa firms carte', 1);
    expect(r[0].g).toContain('firms');
  });

  it('renvoie [] si aucun terme ne matche', () => {
    expect(searchIn(DATA, 'zzzzzz qqqqqq', 3)).toEqual([]);
  });

  it('renvoie [] sur corpus vide ou requête vide', () => {
    expect(searchIn([], 'kevin', 3)).toEqual([]);
    expect(searchIn(DATA, '', 3)).toEqual([]);
  });

  it('respecte le paramètre k', () => {
    expect(searchIn(DATA, 'kevin apex firms vitest', 2).length).toBeLessThanOrEqual(2);
  });

  it('accents/casse indifférents (à = a)', () => {
    const r = searchIn([{ t: 'sécurité maximale des clés API', g: [], i: 50 }], 'securite cle', 1);
    expect(r.length).toBe(1);
  });
});

describe('compact-memory recallBlock (ON par défaut, fail-open)', () => {
  it('activée par défaut (gratuit → tout auto)', () => {
    expect(compactMemory.isEnabled()).toBe(true);
  });

  it('requête trop courte → chaîne vide sans réseau', async () => {
    const block = await compactMemory.recallBlock('ab');
    expect(block).toBe('');
  });

  it('désactivable explicitement', async () => {
    compactMemory.enable(false);
    expect(compactMemory.isEnabled()).toBe(false);
    expect(await compactMemory.recallBlock('vitest apex')).toBe('');
    compactMemory.enable(true);
    expect(compactMemory.isEnabled()).toBe(true);
  });
});
