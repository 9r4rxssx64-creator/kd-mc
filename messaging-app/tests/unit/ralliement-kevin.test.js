/**
 * Kevin avait DEUX comptes Apex Chat (photo du téléphone de Rémy : deux « Kevin » dans sa liste). Le serveur les fond quand le domaine reconnaît l'admin avec Face ID, mais une session ouverte
 * AVANT reste valide 30 jours. Garde : cette session se représente au domaine UNE fois et se reconnecte au vrai compte, sans rien demander ; jamais pour une autre personne, jamais en boucle.
 * Le test exécute le VRAI code de la page (extrait d'index.html).
 */
import { describe, it, expect, vi } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

const html = readIndex();
const DOUBLON = { id: 'kdmc_kdmc_admin', is_admin: 1, is_kevin_alias: 1, source: 'kdmc-sso' };
function monter(user, reponseSso) {
  const K = { user, login: vi.fn(async () => {}), _refreshConvs: vi.fn(async () => {}), _fetchContacts: vi.fn() };
  const sso = vi.fn(async () => reponseSso);
  const toasts = [];
  // eslint-disable-next-line no-new-func
  new Function('K', '_authSsoFromKdmc', 'toast', '_safeCatch', [extractDef(html, 'K._ralliementAppliquer = async function(r, leger){'), extractDef(html, 'K._ralliementAdopterCompte = async function(){'), extractDef(html, 'K._ralliementFaceId = async function(){'), extractDef(html, 'K._ralliementKevin = async function(){')].join('\n'))(K, sso, (m) => toasts.push(m), () => {});
  return { K, sso, toasts };
}

describe('ralliement du compte Kevin en double', () => {
  it('le doublon admin se représente au domaine et se reconnecte au vrai compte', async () => {
    const { K, sso, toasts } = monter(DOUBLON, { token: 'T2', user: { id: 'kdmc_admin' } });
    expect(await K._ralliementKevin()).toBe(true);
    expect(sso).toHaveBeenCalledTimes(1);
    expect(K.login).toHaveBeenCalledWith({ id: 'kdmc_admin' }, 'T2');
    expect(K._refreshConvs).toHaveBeenCalled(); expect(K._fetchContacts).toHaveBeenCalled();
    expect(toasts.join()).toMatch(/réunis/);
  });
  it('une seule tentative par chargement (jamais de boucle)', async () => {
    const { K, sso } = monter(DOUBLON, null);
    await K._ralliementKevin(); await K._ralliementKevin(); await K._ralliementKevin();
    expect(sso).toHaveBeenCalledTimes(1);
  });
  it('rien pour les autres : déjà le vrai compte, personne ordinaire, compte non admin, autre origine', async () => {
    for (const u of [{ ...DOUBLON, id: 'kdmc_admin' }, { ...DOUBLON, is_admin: 0 }, { ...DOUBLON, is_kevin_alias: 0 }, { ...DOUBLON, source: 'apex-sso' }, null, { id: 'kdmc_remy-ledren', is_admin: 0, source: 'kdmc-sso' }]) {
      const { K, sso } = monter(u, { token: 'T', user: { id: 'kdmc_admin' } });
      expect(await K._ralliementKevin()).toBe(false); expect(sso).not.toHaveBeenCalled(); expect(K.login).not.toHaveBeenCalled();
    }
  });
  it('le domaine ne rend pas le vrai compte (ou panne) : on garde la session, sans erreur', async () => {
    for (const rep of [null, { token: 'T', user: { id: 'kdmc_kdmc_admin' } }, { user: { id: 'kdmc_admin' } }]) {
      const { K } = monter(DOUBLON, rep);
      expect(await K._ralliementKevin()).toBe(false); expect(K.login).not.toHaveBeenCalled();
    }
  });
  it("déjà fondu côté serveur : la page adopte l'identifiant du vrai compte (Rémy ne s'affiche plus « Kevin »), sans Face ID ni fenêtre", async () => {
    globalThis.API_BASE = 'https://api.test';
    const vue = [];
    globalThis.fetch = vi.fn(async (url, init) => { vue.push({ url, auth: init && init.headers && init.headers.Authorization }); return { ok: true, json: async () => ({ ok: true, user: { id: 'kdmc_admin', kdmc_uid: 'kdmc_admin' } }) }; });
    const { K, sso } = monter(DOUBLON, null);
    K.token = 'JETON'; K._showModal = vi.fn(); K._closeModal = vi.fn();
    expect(await K._ralliementKevin()).toBe(true);
    expect(vue).toEqual([{ url: 'https://api.test/api/users/me', auth: 'Bearer JETON' }]);
    expect(K.user).toEqual({ id: 'kdmc_admin', kdmc_uid: 'kdmc_admin' });
    expect(K.login).not.toHaveBeenCalled();            // jamais une connexion complète en plein démarrage (v1.1.341 : iPhone bloqué)
    expect(K._refreshConvs).toHaveBeenCalled();
    expect(sso).not.toHaveBeenCalled(); expect(K._showModal).not.toHaveBeenCalled();
  });
  it("le serveur répond encore l'ancien compte (pas fondu) : on ne change rien et on passe au Face ID", async () => {
    globalThis.API_BASE = 'https://api.test';
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, user: { id: 'kdmc_kdmc_admin' } }) }));
    const { K, sso } = monter(DOUBLON, null);
    K.token = 'JETON'; K._showModal = vi.fn();
    expect(await K._ralliementKevin()).toBe(false);
    expect(K.login).not.toHaveBeenCalled(); expect(sso).toHaveBeenCalledTimes(1); expect(K._showModal).toHaveBeenCalledTimes(1);
  });
  it("app installée : le pass du domaine est relu d'abord, puis une fenêtre propose Face ID (jamais d'aller-retour caché)", async () => {
    const ordre = [];
    const { K, sso } = monter(DOUBLON, null);
    K._domainePass = vi.fn(async () => { ordre.push('pass'); return null; });
    K._showModal = vi.fn((titre, corps) => { ordre.push('fenetre'); K._corps = corps; });
    sso.mockImplementation(async () => { ordre.push('sso'); return null; });
    expect(await K._ralliementKevin()).toBe(false);
    expect(ordre).toEqual(['pass', 'sso', 'fenetre']);
    expect(K._corps).toMatch(/K\._ralliementFaceId\(\)/);            // le bouton lance le Face ID (geste de la personne)
    expect(K._corps).toMatch(/Face ID/);
    await K._ralliementKevin();                                       // une seule fois par chargement
    expect(K._showModal).toHaveBeenCalledTimes(1);
  });
  it('rattachement réussi sans Face ID à refaire : aucune fenêtre', async () => {
    const { K } = monter(DOUBLON, { token: 'T2', user: { id: 'kdmc_admin' } });
    K._showModal = vi.fn(); K._closeModal = vi.fn();
    expect(await K._ralliementKevin()).toBe(true);
    expect(K._showModal).not.toHaveBeenCalled();
  });
  describe('Face ID dans l\'app (bouton de la fenêtre)', () => {
    const b64u = (txt) => Buffer.from(txt).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    function lancer({ options = { ok: true, challenge: b64u('defi'), rpId: 'kd-mc.com' }, verify = { ok: true, token: 'PASS-PROUVE' }, sso = { token: 'T2', user: { id: 'kdmc_admin' } }, cred = 'ok' } = {}) {
      const appels = [];
      globalThis.fetch = vi.fn(async (url, init) => { appels.push({ url, init }); return { json: async () => (String(url).endsWith('/options') ? options : verify) }; });
      Object.defineProperty(globalThis.window, 'PublicKeyCredential', { value: function () {}, configurable: true });
      Object.defineProperty(globalThis.navigator, 'credentials', { value: { get: vi.fn(async () => {
        if (cred === 'annule') throw new Error('NotAllowedError');
        return { id: 'CID', response: { userHandle: new TextEncoder().encode('kdmc_admin'), clientDataJSON: new Uint8Array([1]), authenticatorData: new Uint8Array([2]), signature: new Uint8Array([3]) } };
      }) }, configurable: true });
      localStorage.removeItem('kdmc_sso_token');
      const m = monter(DOUBLON, sso); m.K._closeModal = vi.fn();
      return { ...m, appels };
    }
    it('Face ID reconnu → le pass prouvé est gardé, le rattachement se fait, la fenêtre se ferme', async () => {
      const { K, sso, toasts, appels } = lancer();
      expect(await K._ralliementFaceId()).toBe(true);
      expect(appels.map((a) => String(a.url))).toEqual(['/__sso/webauthn/auth/options', '/__sso/webauthn/auth/verify']);
      expect(appels.every((a) => a.init.credentials === 'include')).toBe(true);
      expect(localStorage.getItem('kdmc_sso_token')).toBe('PASS-PROUVE');
      expect(sso).toHaveBeenCalledTimes(1);
      expect(K.login).toHaveBeenCalledWith({ id: 'kdmc_admin' }, 'T2');
      expect(K._closeModal).toHaveBeenCalled(); expect(toasts.join()).toMatch(/réunis/);
    });
    it('Face ID annulé, refusé ou domaine muet → rien ne change, message clair, jamais de connexion', async () => {
      for (const cas of [{ cred: 'annule' }, { verify: { ok: false, reason: 'signature' } }, { options: { ok: false, reason: 'panne' } }]) {
        const { K, toasts } = lancer(cas);
        expect(await K._ralliementFaceId()).toBe(false);
        expect(K.login).not.toHaveBeenCalled(); expect(toasts.length).toBeGreaterThan(0);
      }
    });
    it('Face ID reconnu mais le serveur ne rend pas le vrai compte → on le dit, sans se déconnecter', async () => {
      const { K, toasts } = lancer({ sso: { token: 'T', user: { id: 'kdmc_kdmc_admin' } } });
      expect(await K._ralliementFaceId()).toBe(false);
      expect(K.login).not.toHaveBeenCalled(); expect(toasts.join()).toMatch(/rattachement/);
    });
  });
  it('lancé 3 s après chaque connexion', () => {
    expect(html).toMatch(/K\._postLogin = function\(\)\{\n  if\(!K\.user\) return;\n  setTimeout\(\(\) => \{ try \{ K\._ralliementKevin && K\._ralliementKevin\(\); \} catch\(_\) \{\} \}, 3000\);/);
  });
});

describe('la clé de chiffrement est republiée quand le COMPTE change (après le rattachement)', () => {
  function publieur(user, store) {
    const calls = [];
    const K = { token: 't', user, _api: async (m, p, body) => { calls.push(body); return { ok: true }; } };
    const src = [extractDef(html, 'K._CRYPTO_CAPS = '), extractDef(html, 'K._publishPubkey = async function(){')].join('\n');
    // eslint-disable-next-line no-new-func
    new Function('K', 'lg', 'ls', '_logTelemetry', '_safeCatch', src)(K, (k, d) => (k in store ? store[k] : d), (k, v) => { store[k] = v; }, () => {}, () => {});
    return { K, calls };
  }
  it('même appareil, autre compte → republie ; même compte ensuite → rien', async () => {
    const store = { crypto_pub: 'PUB' };
    const a = publieur({ id: 'kdmc_kdmc_admin' }, store);
    await a.K._publishPubkey(); expect(a.calls).toHaveLength(1);
    await a.K._publishPubkey(); expect(a.calls).toHaveLength(1);          // idempotent
    const b = publieur({ id: 'kdmc_admin' }, store);                       // après le rattachement : même clé d'appareil, autre compte
    await b.K._publishPubkey(); expect(b.calls).toHaveLength(1);
    await b.K._publishPubkey(); expect(b.calls).toHaveLength(1);
  });
});
