/**
 * Inviter dans un groupe par lien (21.10.2026) : le robot « toutes les fonctions » a mesuré que le lien ?join=<id> n'était traité par rien
 * (« à wirer ») et qu'aucun écran n'ajoutait un membre. Le test exécute le VRAI code de la page.
 */
import { describe, it, expect, vi } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

const html = readIndex();
function monter({ api, token = 'jeton', convs = [], storage = {} } = {}) {
  const toasts = []; const refresh = vi.fn(async () => {});
  const sess = { getItem: (k) => storage[k] ?? null, setItem: (k, v) => { storage[k] = v; }, removeItem: (k) => { delete storage[k]; } };
  const K = { token, conversations: convs, openConv: vi.fn(), _refreshConvs: refresh, _api: api || (async () => null) };
  // eslint-disable-next-line no-new-func
  new Function('K', 'toast', 'ls', '_safeCatch', 'sessionStorage', 'location', extractDef(html, 'K._groupInviteLink = async function(conv){') + '\n' + extractDef(html, 'K._joinGroupByLink = async function(convId, token){') + '\n' + extractDef(html, 'K._joinPendingGroup = function(){'))(
    K, (m) => toasts.push(m), () => {}, () => {}, sess, { origin: 'https://apex-chat.kd-mc.com', pathname: '/' });
  return { K, toasts, refresh, storage };
}

describe('lien d\'invitation de groupe', () => {
  it('le lien porte l\'invitation signée du serveur', async () => {
    const { K } = monter({ api: async (m, p) => (p === '/api/conversations/g1/invite' && m === 'POST' ? { ok: true, token: 'abc.def.ghi' } : null) });
    expect((await K._groupInviteLink({ id: 'g1' })).link).toBe('https://apex-chat.kd-mc.com/?join=g1&gi=abc.def.ghi');
  });
  it('groupe resté local : message clair, pas de lien inutilisable', async () => {
    const { K } = monter();
    expect((await K._groupInviteLink({ id: 'group_local_123_x' })).err).toMatch(/pas encore enregistré/);
  });
  it('pas le droit d\'inviter : dit pourquoi, simplement', async () => {
    const { K } = monter({ api: async () => ({ ok: false, code: 'owner_required' }) });
    expect((await K._groupInviteLink({ id: 'g1' })).err).toMatch(/propriétaire ou un administrateur/);
  });
  it('rejoindre : appelle le serveur avec l\'invitation, recharge la liste, ouvre le groupe', async () => {
    const api = vi.fn(async () => ({ ok: true, conversation: { id: 'g1', type: 'group', name: 'Amis', member_count: 2 } }));
    const { K, refresh } = monter({ api });
    expect(await K._joinGroupByLink('g1', 'tok')).toBe(true);
    expect(api).toHaveBeenCalledWith('POST', '/api/conversations/g1/join', { token: 'tok' });
    expect(refresh).toHaveBeenCalled(); expect(K.openConv).toHaveBeenCalledWith('g1');
    expect(K.conversations.map((c) => c.id)).toEqual(['g1']);   // même si la liste du serveur tarde
  });
  it('déjà membre : on l\'ouvre sans rien demander au serveur', async () => {
    const api = vi.fn();
    const { K } = monter({ api, convs: [{ id: 'g1' }] });
    expect(await K._joinGroupByLink('g1', 'tok')).toBe(true); expect(api).not.toHaveBeenCalled(); expect(K.openConv).toHaveBeenCalledWith('g1');
  });
  it('invitation refusée / expirée : message simple, rien n\'est ajouté', async () => {
    const { K, toasts } = monter({ api: async () => ({ ok: false, code: 'bad_invite' }) });
    expect(await K._joinGroupByLink('g1', 'tok')).toBe(false); expect(toasts.join()).toMatch(/plus valable/); expect(K.conversations).toEqual([]);
  });
  it('lien sans invitation : refusé avec un message, sans appeler le serveur', async () => {
    const api = vi.fn(); const { K, toasts } = monter({ api });
    expect(await K._joinGroupByLink('g1', null)).toBe(false); expect(api).not.toHaveBeenCalled(); expect(toasts.join()).toMatch(/incomplet/);
  });
  it('pas encore connecté : l\'invitation est gardée puis traitée à l\'entrée (une seule fois, pas plus d\'une heure)', async () => {
    const storage = {};
    const hors = monter({ token: null, storage });
    expect(await hors.K._joinGroupByLink('g1', 'tok')).toBe(false);
    expect(JSON.parse(storage.apex_join_pending)).toMatchObject({ c: 'g1', t: 'tok' });
    const api = vi.fn(async () => ({ ok: true, conversation: { id: 'g1', type: 'group', name: 'Amis', member_count: 2 } }));
    const dedans = monter({ api, storage });
    await dedans.K._joinPendingGroup();
    expect(api).toHaveBeenCalledTimes(1); expect(storage.apex_join_pending).toBeUndefined();
    storage.apex_join_pending = JSON.stringify({ c: 'g1', t: 'tok', at: Date.now() - 2 * 3600000 });
    expect(await dedans.K._joinPendingGroup()).toBe(false); expect(api).toHaveBeenCalledTimes(1);
  });
});

describe('lien d\'invitation reçu avant la connexion', () => {
  const m = html.match(/\/\/ Lien d'invitation de groupe \(\?join=<id>&gi=<invitation>\)[\s\S]*?\n\}\)\(\);/);
  const lancer = (search, hash = '') => {
    const storage = {}; const remplace = vi.fn();
    // eslint-disable-next-line no-new-func
    new Function('location', 'sessionStorage', 'history', 'URLSearchParams', m[0])({ search, pathname: '/', hash },
      { setItem: (k, v) => { storage[k] = v; } }, { replaceState: remplace }, URLSearchParams);
    return { storage, remplace };
  };
  it('trouvé dans la page', () => { expect(m).toBeTruthy(); });
  it('?join + t : gardés AU CHARGEMENT puis retirés de l\'adresse (les autres paramètres restent)', () => {
    const { storage, remplace } = lancer('?join=g1&gi=tok&inviter=u9');
    expect(JSON.parse(storage.apex_join_pending)).toMatchObject({ c: 'g1', t: 'tok' });
    expect(remplace).toHaveBeenCalledWith(null, '', '/?inviter=u9');
  });
  it('sans invitation (t absent) ou sans ?join : rien n\'est gardé, l\'adresse n\'est pas touchée', () => {
    for (const q of ['?join=g1', '?gi=tok', '?join=g1&t=tok', '']) { const { storage, remplace } = lancer(q); expect(storage.apex_join_pending).toBeUndefined(); expect(remplace).not.toHaveBeenCalled(); }
  });
});

describe('entrée par le domaine : un pass tout juste émis n\'est pas encore visible du serveur', () => {
  function monterSso(reponses) {
    const appels = []; const attentes = [];
    const fetch = vi.fn(async () => { appels.push(1); return reponses[Math.min(appels.length - 1, reponses.length - 1)](); });
    const store = { kdmc_sso_token: 'pass' };
    // eslint-disable-next-line no-new-func
    const f = new Function('K', 'fetch', 'API_BASE', 'localStorage', '_kdmcConsumeHashPass', '_safeCatch', 'setTimeout', extractDef(html, 'async function _authSsoFromKdmc(){') + '\nreturn _authSsoFromKdmc;')(
      { _domainePass: null }, fetch, 'https://api', { getItem: (k) => store[k] ?? null }, () => {}, () => {}, (fn, ms) => { attentes.push(ms); fn(); });
    return { f, appels, attentes };
  }
  const refus = (code) => () => new Response(JSON.stringify({ error: code }), { status: 401 });
  const bon = () => new Response(JSON.stringify({ ok: true, token: 't', user: { id: 'u' } }), { status: 200 });
  it('« session invalide » puis OK : la personne entre (2 appels, attente 1,5 s)', async () => {
    const { f, appels, attentes } = monterSso([refus('kdmc_session_invalide'), bon]);
    expect((await f()).token).toBe('t'); expect(appels.length).toBe(2); expect(attentes).toEqual([1500]);
  });
  it('toujours refusé : 3 essais au plus, puis on retombe sur la connexion normale', async () => {
    const { f, appels } = monterSso([refus('kdmc_session_invalide')]);
    expect(await f()).toBeNull(); expect(appels.length).toBe(3);
  });
  it('autre refus (Face ID requis) : aucun nouvel essai', async () => {
    const { f, appels } = monterSso([refus('face_id_requis'), bon]);
    expect(await f()).toBeNull(); expect(appels.length).toBe(1);
  });
});
