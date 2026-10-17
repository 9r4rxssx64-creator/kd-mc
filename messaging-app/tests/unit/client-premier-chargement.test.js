/**
 * Mesuré en vrai navigateur (robot e2e, 17.10.2026, run 39035781683) : « [MAJ] application [admin-force] » 7 s après
 * l'ouverture d'un appareil NEUF — la page se rechargeait, la connexion en direct tombait, la photo de Bob n'arrivait pas.
 * Un premier chargement venu du réseau est déjà la dernière version : on note la date, sans recharger.
 * Le test exécute le VRAI code de la page (extrait d'index.html).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

const html = readIndex();
function charger({ vu = 0, controleur = null, ts = 1792234276081, prendLaMain = false } = {}) {
  if (vu) localStorage.setItem('_admin_force_update_seen_ts', String(vu));
  const src = [extractDef(html, 'let _adminForceUpdateLastTs = '), extractDef(html, 'let _forceCheckTs = 0;'), extractDef(html, 'const _pageDuReseau = '),
    extractDef(html, 'async function _checkAdminForceUpdate(){', '\n  }\n')].join('\n');
  const reloads = [];
  const win = { _apexSafeReload: (f, why) => reloads.push(why) };
  const nav = { serviceWorker: controleur ? { controller: {} } : { controller: null } };
  if (prendLaMain) setTimeout(() => { nav.serviceWorker.controller = {}; }, 0);
  const fetchFn = async () => ({ ok: true, json: async () => ({ ts }) });
  // eslint-disable-next-line no-new-func
  const f = new Function('window', 'navigator', 'fetch', 'localStorage', 'console', '_safeCatch', 'API_BASE', 'location', 'caches',
    src + '\nreturn _checkAdminForceUpdate;')(win, nav, fetchFn, localStorage, { log() {} }, () => {}, '', { pathname: '/', replace() {} }, undefined);
  return { verifier: f, reloads };
}
beforeEach(() => { try { localStorage.clear(); } catch (_) {} });

describe('mise à jour forcée par l\'admin : pas pour un premier chargement', () => {
  it('appareil neuf, page venue du réseau → aucun rechargement, la date est notée', async () => {
    const { verifier, reloads } = charger();
    await verifier();
    expect(reloads).toEqual([]);
    expect(localStorage.getItem('_admin_force_update_seen_ts')).toBe('1792234276081');
  });
  it('appareil neuf : le service worker installé ensuite prend la main (clients.claim) → toujours aucun rechargement', async () => {
    const { verifier, reloads } = charger({ prendLaMain: true });
    await new Promise((r) => setTimeout(r, 5));
    await verifier();
    expect(reloads).toEqual([]);
  });
  it('appareil neuf mais page servie par un ancien service worker → rechargement (elle peut être périmée)', async () => {
    const { verifier, reloads } = charger({ controleur: true });
    await verifier();
    expect(reloads).toEqual(['admin-force']);
  });
  it('appareil qui avait vu une mise à jour plus ancienne → rechargement', async () => {
    const { verifier, reloads } = charger({ vu: 1000 });
    await verifier();
    expect(reloads).toEqual(['admin-force']);
  });
  it('mise à jour déjà vue → rien', async () => {
    const { verifier, reloads } = charger({ vu: 1792234276081, controleur: true });
    await verifier();
    expect(reloads).toEqual([]);
  });
});
