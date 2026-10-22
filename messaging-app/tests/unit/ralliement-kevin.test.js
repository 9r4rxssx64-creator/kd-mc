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
  new Function('K', '_authSsoFromKdmc', 'toast', '_safeCatch', extractDef(html, 'K._ralliementKevin = async function(){'))(K, sso, (m) => toasts.push(m), () => {});
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
  it("app installée (cookies isolés, Face ID de Safari invisible) : pass du domaine relu d'abord, puis UN aller-retour Face ID par le portail, une fois par 6 h", async () => {
    vi.useFakeTimers();
    try {
      localStorage.removeItem('kdmc_ralliement_bounce_ts');
      const ordre = [];
      const { K, sso, toasts } = monter(DOUBLON, null);
      K._domainePass = vi.fn(async () => { ordre.push('pass'); return null; });
      K._kdmcBounceToLogin = vi.fn(() => { ordre.push('aller-retour'); return true; });
      sso.mockImplementation(async () => { ordre.push('sso'); return null; });
      expect(await K._ralliementKevin()).toBe(false);
      expect(K._kdmcBounceToLogin).not.toHaveBeenCalled();           // pas avant le petit délai (le message se lit)
      await vi.advanceTimersByTimeAsync(1600);
      expect(ordre).toEqual(['pass', 'sso', 'aller-retour']);       // le pass du domaine est relu AVANT le contrôle
      expect(K._kdmcBounceToLogin).toHaveBeenCalledWith(true);
      expect(toasts.join()).toMatch(/Face ID/);
      // une 2e ouverture dans les 6 h : pas de nouvel aller-retour
      const b = monter(DOUBLON, null); b.K._domainePass = async () => null; b.K._kdmcBounceToLogin = vi.fn(() => true);
      await b.K._ralliementKevin(); await vi.advanceTimersByTimeAsync(1600);
      expect(b.K._kdmcBounceToLogin).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); localStorage.removeItem('kdmc_ralliement_bounce_ts'); }
  });
  it("au retour du portail (?_ssob=1) ou si le rattachement réussit : aucun nouvel aller-retour (jamais de boucle)", async () => {
    vi.useFakeTimers();
    try {
      localStorage.removeItem('kdmc_ralliement_bounce_ts');
      const ancien = location.search;
      history.replaceState(null, '', '/?_ssob=1');
      const a = monter(DOUBLON, null); a.K._domainePass = async () => null; a.K._kdmcBounceToLogin = vi.fn(() => true);
      await a.K._ralliementKevin(); await vi.advanceTimersByTimeAsync(1600);
      expect(a.K._kdmcBounceToLogin).not.toHaveBeenCalled();
      history.replaceState(null, '', '/' + ancien);
      const b = monter(DOUBLON, { token: 'T2', user: { id: 'kdmc_admin' } }); b.K._domainePass = async () => null; b.K._kdmcBounceToLogin = vi.fn(() => true);
      expect(await b.K._ralliementKevin()).toBe(true); await vi.advanceTimersByTimeAsync(1600);
      expect(b.K._kdmcBounceToLogin).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); localStorage.removeItem('kdmc_ralliement_bounce_ts'); history.replaceState(null, '', '/'); }
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
