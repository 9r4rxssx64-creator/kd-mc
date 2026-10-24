/**
 * Tâche 56 (24.10.2026) : en « 👁 Vue membre », Kevin est abonné au maximum et achète en simulation.
 * Les champs `simulation` / `apercu` ne comptent QUE s'ils viennent du domaine (jamais déduits d'un nom ou d'un stockage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lireVueMembre, rafraichirVueMembre, acheterEnSimulation, vueMembreActive, _reinitialiserVueMembre } from '../../services/integrations/vue-membre.js';
import { commerce } from '../../services/integrations/commerce.js';

const rep = (j: unknown, ok = true) => ({ ok, status: ok ? 200 : 403, json: async () => j }) as Response;

describe('vue membre simulée', () => {
  beforeEach(() => { localStorage.clear(); _reinitialiserVueMembre(); });
  afterEach(() => _reinitialiserVueMembre());

  it('lireVueMembre : seulement simulation === true ET apercu === "membre"', () => {
    expect(lireVueMembre({ simulation: true, apercu: 'membre' })).toBe(true);
    for (const j of [{ simulation: true }, { apercu: 'membre' }, { simulation: 'true', apercu: 'membre' }, { simulation: true, apercu: 'admin' }, null, 'x']) expect(lireVueMembre(j)).toBe(false);
  });

  it('le domaine dit « vue membre » → forfait le plus haut + bandeau ; sinon rien', async () => {
    expect(commerce.getEffectivePlan('kdmc_admin')).not.toBe('business');
    await rafraichirVueMembre((async () => rep({ ok: true, simulation: true, apercu: 'membre' })) as unknown as typeof fetch);
    expect(vueMembreActive()).toBe(true);
    expect(commerce.getEffectivePlan('kdmc_admin')).toBe('business');
    expect(document.getElementById('ax-vue-membre-bandeau')?.textContent).toContain('Vue membre simulée');
    await rafraichirVueMembre((async () => rep({ ok: true })) as unknown as typeof fetch);
    expect(vueMembreActive()).toBe(false);
    expect(document.getElementById('ax-vue-membre-bandeau')).toBeNull();
  });

  it('jamais déduit d’un stockage local ni d’une panne : réponse refusée ou réseau KO → inactif', async () => {
    localStorage.setItem('apex_v13_vue_membre', '1'); localStorage.setItem('kdmc_apercu', 'membre');
    await rafraichirVueMembre((async () => rep({ simulation: true, apercu: 'membre' }, false)) as unknown as typeof fetch);
    expect(vueMembreActive()).toBe(false);
    await rafraichirVueMembre((async () => { throw new Error('réseau'); }) as unknown as typeof fetch);
    expect(vueMembreActive()).toBe(false);
  });

  it('achat simulé : refusé hors vue membre ; en vue membre, appelle la caisse avec le laissez-passer, jamais d’argent', async () => {
    expect((await acheterEnSimulation('apex-pro')).ok).toBe(false);
    await rafraichirVueMembre((async () => rep({ simulation: true, apercu: 'membre' })) as unknown as typeof fetch);
    const appels: Array<[string, RequestInit | undefined]> = [];
    const f = (async (u: string, i?: RequestInit) => { appels.push([u, i]); return u.includes('/__sso/pass') ? rep({ token: 'T' }) : rep({ ok: true }); }) as unknown as typeof fetch;
    expect((await acheterEnSimulation('apex-pro', f)).ok).toBe(true);
    const caisse = appels.find(([u]) => u.includes('/caisse/simulation'))!;
    expect(caisse[0]).toBe('https://kdmc-vente.9r4rxssx64.workers.dev/caisse/simulation');
    expect((caisse[1]!.headers as Record<string, string>).authorization).toBe('Bearer T');
    expect((await acheterEnSimulation('../x', f)).ok).toBe(false);
  });
});
