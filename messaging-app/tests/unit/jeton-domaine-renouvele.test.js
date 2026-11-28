/**
 * 28.11.2026 (pc-config 3430, mesuré dans le Chrome de Kevin) : le jeton de la session « domaine » était périmé depuis le 21.11 (exp = iat + 30 jours) ;
 * rien ne le renouvelait (K._reauthAny ne refait que la connexion par numéro, et échoue pour un compte du domaine) → « Non authentifié » à chaque chargement
 * (publication de l'appareil), l'écran restant connecté en local. Sur un 401, un compte lié au domaine redemande UN jeton frais au domaine et rejoue la requête UNE fois.
 * Le test charge le VRAI code de index.html (K._reauthKdmcSso et K._api) avec un faux réseau.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(process.env.INDEX_HTML || join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');
const a = src.indexOf('K._reauthKdmcSso = async function');
const b = src.indexOf('K._reauthAny = async function');
const c = src.indexOf('K._api = async function');
const d = src.indexOf('\n};', c) + 3;
const blocReauth = a >= 0 && b > a ? src.slice(a, b) : '';
const blocApi = c >= 0 ? src.slice(c, d) : '';

function banc({ user, token, reponses, ssoRend }) {
  const K = { user, token, _wsRetry: 5 };
  const memo = {}; const appels = []; let sso = 0;
  const fetchFn = async (url, init) => {
    const jeton = String((init.headers || {}).Authorization || '').replace('Bearer ', '');
    appels.push({ url, jeton });
    const r = reponses(jeton);
    return { ok: r.status < 400, status: r.status, json: async () => r.corps };
  };
  const code = (blocReauth || '') + '\n' + blocApi + '\n return K;';
  const fn = new Function('K', 'fetch', 'API_BASE', 'ls', '_safeCatch', '_logTelemetry', '_authSsoFromKdmc', 'AbortController', 'setTimeout', 'clearTimeout', code);
  const K2 = fn(K, fetchFn, 'https://api.example', (k, v) => { memo[k] = v; }, () => {}, () => {}, async () => { sso++; return ssoRend; }, AbortController, setTimeout, clearTimeout);
  return { K: K2, appels, memo, sso: () => sso };
}
const KEVIN = { id: 'kdmc_admin', kdmc_uid: 'kdmc_admin', phone: 'numero-de-test', source: 'apex-sso' };

describe('jeton du domaine périmé : renouvelé tout seul', () => {
  it('401 avec le vieux jeton → un jeton frais du domaine → la requête est rejouée UNE fois et réussit', async () => {
    const b = banc({ user: KEVIN, token: 'vieux', ssoRend: { token: 'frais', user: { id: 'kdmc_admin' } },
      reponses: (j) => (j === 'frais' ? { status: 200, corps: { ok: true } } : { status: 401, corps: { error: 'Non authentifié' } }) });
    const r = await b.K._api('POST', '/api/keys/device', { x: 1 });
    expect(r).toEqual({ ok: true });
    expect(b.appels.map((x) => x.jeton)).toEqual(['vieux', 'frais']);
    expect(b.K.token).toBe('frais');
    expect(b.memo.token).toBe('frais');
    expect(b.sso()).toBe(1);
  });
  it('un jeton frais d\'un AUTRE compte n\'est jamais adopté', async () => {
    const b = banc({ user: KEVIN, token: 'vieux', ssoRend: { token: 'autre', user: { id: 'quelquun_dautre' } },
      reponses: () => ({ status: 401, corps: { error: 'Non authentifié' } }) });
    await expect(b.K._api('GET', '/api/x')).rejects.toThrow();
    expect(b.K.token).toBe('vieux');
    expect(b.appels.length).toBe(1);
  });
  it('pas de boucle : si le jeton frais est refusé aussi, on s\'arrête après UN rejeu', async () => {
    const b = banc({ user: KEVIN, token: 'vieux', ssoRend: { token: 'frais', user: { id: 'kdmc_admin' } },
      reponses: () => ({ status: 401, corps: { error: 'Non authentifié' } }) });
    await expect(b.K._api('GET', '/api/x')).rejects.toThrow();
    expect(b.appels.length).toBe(2);
  });
  it('un compte SANS lien avec le domaine n\'appelle pas le domaine', async () => {
    const b = banc({ user: { id: 'u9', phone: 'autre-numero-de-test', source: 'otp' }, token: 'vieux', ssoRend: { token: 'frais', user: { id: 'u9' } },
      reponses: () => ({ status: 401, corps: { error: 'Non authentifié' } }) });
    await expect(b.K._api('GET', '/api/x')).rejects.toThrow();
    expect(b.sso()).toBe(0);
  });
  it('le CSS de la Carte : zoom et lien Leaflet à 44 px', () => {
    expect(src).toMatch(/\.leaflet-bar a[^{]*\{[^}]*width:44px !important;[^}]*height:44px !important/);
    expect(src).toMatch(/\.leaflet-control-attribution a\s*\{[^}]*padding:16px 6px/);
  });
});
