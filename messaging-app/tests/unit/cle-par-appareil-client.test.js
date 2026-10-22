/**
 * Une clé par appareil — le VRAI code de la page (extrait d'index.html), trois appareils :
 * l'iPhone et le PC de Kevin, l'iPhone de Rémy. Vraies clés ECDH (WebCrypto de Node), faux serveur
 * qui ne fait que tenir la liste des appareils. Garde : un message de Kevin se lit sur les TROIS,
 * un appareil non déclaré est refusé, un nouvel appareil déclaré ne bloque plus l'envoi.
 */
import { describe, it, expect, vi } from 'vitest';
import * as C from '../../lib/crypto-core.js';
import { readIndex, extractDef } from './client-extract.js';

const html = readIndex();
const DEFS = [
  'K._convIsDm = function(conv){',
  'K._pinnedPeerKey = function(convId){',
  'K._pendingPeerKey = function(convId){',
  'K._keyChangePending = function(conv){',
  'K._deviceId = function(){',
  'K._devicesOf = async function(uid, force){',
  'K._mdevEncrypt = async function(conv, plaintext, kind, id){',
  'K._noteNouveauxAppareils = function(conv, pair){',
  'K._mdevDecode = async function(conv, raw, meta){',
].map((m) => extractDef(html, m)).join('\n');

function memoire() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// Faux serveur : la liste des appareils de chaque compte (comme GET /api/keys/:uid/devices).
function serveur() {
  const parCompte = {};
  return {
    parCompte,
    declarer(uid, d, pub) { (parCompte[uid] = parCompte[uid] || []).push({ device_id: d, identity_key_pub: pub }); },
    async api(meth, chemin) {
      const m = /^\/api\/keys\/([^/]+)\/devices$/.exec(chemin);
      if (meth === 'GET' && m) return { ok: true, devices: (parCompte[decodeURIComponent(m[1])] || []).slice() };
      return { ok: false };
    },
  };
}

async function appareil(srv, uid, deviceId, { declare = true } = {}) {
  const keys = await C.generateIdentityKeys();
  const pub = await C.exportPublicKey(keys.publicKey);
  const store = {}; const ls = (k, v) => { store[k] = v; }; const lg = (k, d) => (k in store ? store[k] : d);
  ls('device_id', deviceId); ls('crypto_pub', pub);
  const toasts = [];
  const K = { user: { id: uid }, token: 'T', _cryptoKeys: keys, _devCache: {}, _api: (m, c) => srv.api(m, c) };
  // eslint-disable-next-line no-new-func
  new Function('K', 'lg', 'ls', 'toast', '_safeCatch', '_ensureCryptoKeys', 'localStorage', 'ApexCrypto', DEFS)(
    K, lg, ls, (t) => toasts.push(t), () => {}, async () => {}, memoire(), C);
  if (declare) srv.declarer(uid, deviceId, pub);
  return { K, pub, toasts, store };
}

const convDe = (peer) => ({ id: 'conv-kr', type: 'dm', peer_id: peer, name: 'Rémy' });

describe('une clé par appareil — code réel de la page', () => {
  it("Kevin écrit depuis l'iPhone : Rémy, le PC de Kevin et l'iPhone lui-même le lisent", async () => {
    globalThis.window = { ApexCrypto: C };
    const srv = serveur();
    const kI = await appareil(srv, 'kdmc_admin', 'dev-kevin-iphone-01');
    const kP = await appareil(srv, 'kdmc_admin', 'dev-kevin-pc-000002');
    const r = await appareil(srv, 'kdmc_remy', 'dev-remy-iphone-003');
    const raw = await kI.K._mdevEncrypt(convDe('kdmc_remy'), 'Salut Rémy', 'm', 'm_1');
    expect(raw.startsWith('E2EM1:')).toBe(true);
    expect(raw).not.toContain('Salut');
    for (const qui of [r, kP, kI]) {
      const res = await qui.K._mdevDecode(convDe('x'), raw, { sender: 'kdmc_admin' });
      expect(res.text).toBe('Salut Rémy');
      expect(res.encrypted).toBe(true);
    }
  });

  it("un appareil que l'auteur n'a PAS déclaré au serveur : message refusé, jamais affiché", async () => {
    globalThis.window = { ApexCrypto: C };
    const srv = serveur();
    const pirate = await appareil(srv, 'kdmc_admin', 'dev-pirate-0000009', { declare: false });
    const r = await appareil(srv, 'kdmc_remy', 'dev-remy-iphone-003');
    const raw = await C.mdevEncrypt('faux', { conv: 'conv-kr', fromDevice: 'dev-pirate-0000009', fromPub: pirate.pub, myPrivateKey: pirate.K._cryptoKeys.privateKey,
      recipients: [{ d: 'dev-remy-iphone-003', pub: r.pub }], kind: 'm', id: 'm_2' });
    const res = await r.K._mdevDecode(convDe('kdmc_admin'), raw, { sender: 'kdmc_admin' });
    expect(res.undecryptable).toBe(true);
    expect(res.text).not.toContain('faux');
  });

  it("un appareil ajouté APRÈS l'envoi : message honnêtement illisible ici (pas d'erreur cachée)", async () => {
    globalThis.window = { ApexCrypto: C };
    const srv = serveur();
    const kI = await appareil(srv, 'kdmc_admin', 'dev-kevin-iphone-01');
    await appareil(srv, 'kdmc_remy', 'dev-remy-iphone-003');
    const raw = await kI.K._mdevEncrypt(convDe('kdmc_remy'), 'avant', 'm', 'm_3');
    const nouveau = await appareil(srv, 'kdmc_remy', 'dev-remy-ipad-00004');
    const res = await nouveau.K._mdevDecode(convDe('kdmc_admin'), raw, { sender: 'kdmc_admin' });
    expect(res.undecryptable).toBe(true);
    expect(res.text).toMatch(/avant que celui-ci soit ajouté/);
  });

  it("correspondant sans appareil déclaré (ancienne version) : repli sur l'ancien format (null)", async () => {
    globalThis.window = { ApexCrypto: C };
    const srv = serveur();
    const kI = await appareil(srv, 'kdmc_admin', 'dev-kevin-iphone-01');
    expect(await kI.K._mdevEncrypt(convDe('kdmc_ancien'), 'x', 'm', 'm_4')).toBe(null);
  });

  it("nouvelle clé = un appareil DÉCLARÉ du contact : plus de blocage « clé changée » ; clé inconnue : toujours bloqué", async () => {
    globalThis.window = { ApexCrypto: C };
    const srv = serveur();
    const kI = await appareil(srv, 'kdmc_admin', 'dev-kevin-iphone-01');
    const r1 = await appareil(srv, 'kdmc_remy', 'dev-remy-iphone-003');
    const r2 = await appareil(srv, 'kdmc_remy', 'dev-remy-pc-0000005');
    const conv = convDe('kdmc_remy');
    // Mémoire de l'iPhone de Kevin : clé de Rémy épinglée = r1, « nouvelle clé » en attente = r2 (le PC de Rémy a republié).
    const st = memoire();
    // eslint-disable-next-line no-new-func
    const K = { _devCache: {}, _api: (m, c) => srv.api(m, c), token: 'T' };
    new Function('K', 'lg', 'ls', 'toast', '_safeCatch', '_ensureCryptoKeys', 'localStorage', 'ApexCrypto', DEFS)(K, () => null, () => {}, () => {}, () => {}, async () => {}, st, C);
    st.setItem('peerkey_conv-kr', r1.pub); st.setItem('peerkey_pending_conv-kr', r2.pub);
    expect(K._keyChangePending(conv)).toBe(true);                       // liste pas encore lue : prudence
    await K._devicesOf('kdmc_remy');
    expect(K._keyChangePending(conv)).toBe(false);                      // appareil déclaré : accepté
    expect(st.getItem('peerkey_conv-kr')).toBe(r2.pub);
    expect(st.getItem('peerkey_pending_conv-kr')).toBe(null);
    // Une clé que AUCUN appareil de Rémy n'a déclarée reste bloquante (substitution par un serveur).
    const intrus = await C.exportPublicKey((await C.generateIdentityKeys()).publicKey);
    st.setItem('peerkey_pending_conv-kr', intrus);
    expect(K._keyChangePending(conv)).toBe(true);
    void kI;
  });

  it('un nouvel appareil du contact est signalé une fois', async () => {
    globalThis.window = { ApexCrypto: C };
    const srv = serveur();
    const kI = await appareil(srv, 'kdmc_admin', 'dev-kevin-iphone-01');
    await appareil(srv, 'kdmc_remy', 'dev-remy-iphone-003');
    await kI.K._mdevEncrypt(convDe('kdmc_remy'), 'a', 'm', 'm_5');
    expect(kI.toasts.length).toBe(0);                                    // premier passage : rien à signaler
    await appareil(srv, 'kdmc_remy', 'dev-remy-pc-0000005');
    kI.K._devCache = {};
    await kI.K._mdevEncrypt(convDe('kdmc_remy'), 'b', 'm', 'm_6');
    await kI.K._mdevEncrypt(convDe('kdmc_remy'), 'c', 'm', 'm_7');
    expect(kI.toasts.filter((t) => /nouvel appareil/.test(t)).length).toBe(1);
  });
  vi.restoreAllMocks();
});

// ---- Phase 2 (v1.1.344) : photos / vocaux, écran « Mes appareils », retrait à la déconnexion
const DEFS2 = [
  'K._mediaE2eOn = function(conv){',
  'K._dmMediaEncrypt = async function(conv, blob){',
  'K._openMyDevices = async function(){',
  'K._revokeDevice = async function(deviceId){',
].map((m) => extractDef(html, m)).join('\n');

function monter2({ devices = {}, session = false } = {}) {
  const store = { device_id: 'dev-kevin-iphone-01' };
  const appels = []; const toasts = []; const modals = [];
  const K = { user: { id: 'kdmc_admin' }, token: 'T', _devCache: {},
    _e2eAppliesTo: () => true, _ensureSession: async () => session,
    _api: async (m, c) => { appels.push(m + ' ' + c); const mm = /^\/api\/keys\/([^/]+)\/devices$/.exec(c); return mm ? { ok: true, devices: devices[decodeURIComponent(mm[1])] || [] } : { ok: true }; },
    _showModal: (t, h) => modals.push({ t, h }) };
  const AC = { ...C, getSessionKey: () => session, encryptBytes: async () => new Uint8Array([1, 2, 3]).buffer };
  // eslint-disable-next-line no-new-func
  new Function('K', 'lg', 'ls', 'toast', '_safeCatch', '_ensureCryptoKeys', 'localStorage', 'ApexCrypto', 'esc', 'kcall', 'confirm', DEFS + '\n' + DEFS2)(
    K, (k, d) => (k in store ? store[k] : d), (k, v) => { store[k] = v; }, (t) => toasts.push(t), () => {}, async () => {}, memoire(), AC,
    (x) => String(x || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    (n, a) => ` data-kcall="${n}" data-kargs='${JSON.stringify(a)}'`, () => true);
  return { K, appels, toasts, modals };
}

describe('phase 2 — photos, Mes appareils, déconnexion', () => {
  it("photo d'un message privé, contact multi-appareils : clé PROPRE au fichier (lisible partout), octets chiffrés", async () => {
    globalThis.window = { ApexCrypto: C };
    const { K } = monter2({ devices: { kdmc_remy: [{ device_id: 'dev-remy-iphone-003', identity_key_pub: 'x' }] } });
    const photo = new Blob([new TextEncoder().encode('PHOTO-SECRETE')]);
    const r = await K._dmMediaEncrypt({ id: 'c', type: 'dm', peer_id: 'kdmc_remy' }, photo);
    expect(r.enc).toBe(true);
    expect(r.file && r.file.k && r.file.i && r.file.h).toBeTruthy();
    const octets = new Uint8Array(await r.body.arrayBuffer());
    expect(new TextDecoder().decode(octets)).not.toContain('PHOTO-SECRETE');
    const clair = await C.decryptGroupFile(octets.buffer, r.file);
    expect(new TextDecoder().decode(clair)).toBe('PHOTO-SECRETE');
  });
  it("contact encore sur l'ancienne version (aucun appareil déclaré) : chemin d'avant (session 1:1), sans clé de fichier", async () => {
    globalThis.window = { ApexCrypto: C };
    const { K } = monter2({ session: true });
    const r = await K._dmMediaEncrypt({ id: 'c', type: 'dm', peer_id: 'kdmc_ancien' }, new Blob(['x']));
    expect(r.enc).toBe(true); expect(r.file).toBeUndefined();
  });
  it("aucune clé disponible : RIEN n'est envoyé (block), jamais en clair", async () => {
    globalThis.window = { ApexCrypto: C };
    const { K } = monter2({ session: false });
    expect(await K._dmMediaEncrypt({ id: 'c', type: 'dm', peer_id: 'kdmc_ancien' }, new Blob(['x']))).toEqual({ block: true });
  });
  it('Mes appareils : liste mes appareils, nom échappé, pas de bouton « Retirer » pour celui-ci', async () => {
    globalThis.window = { ApexCrypto: C };
    const { K, modals } = monter2({ devices: { kdmc_admin: [
      { device_id: 'dev-kevin-iphone-01', identity_key_pub: 'a', label: 'iPhone · Safari', last_seen: Date.now() },
      { device_id: 'dev-kevin-pc-000002', identity_key_pub: 'b', label: '<img src=x onerror=alert(1)>', last_seen: Date.now() },
    ] } });
    await K._openMyDevices();
    const h = modals[0].h;
    expect(h).toContain('cet appareil');
    expect(h).not.toContain('<img src=x');
    expect(h).toContain('&lt;img');
    expect((h.match(/_revokeDevice/g) || []).length).toBe(1);
    expect(h).toContain('dev-kevin-pc-000002');
  });
  it('retirer un appareil : DELETE au serveur ; jamais cet appareil-ci', async () => {
    globalThis.window = { ApexCrypto: C };
    const { K, appels } = monter2({ devices: { kdmc_admin: [] } });
    await K._revokeDevice('dev-kevin-iphone-01');                       // cet appareil : refusé
    expect(appels.filter((a) => a.startsWith('DELETE'))).toEqual([]);
    await K._revokeDevice('dev-kevin-pc-000002');
    expect(appels).toContain('DELETE /api/keys/device/dev-kevin-pc-000002');
  });
  it('déconnexion : retire CET appareil de la liste AVANT de fermer la session serveur', async () => {
    const journal = [];
    const store = { device_id: 'dev-kevin-iphone-01' };
    const K = { user: { id: 'u1' }, token: 'tok', conversations: [], messages: {}, view: 'chats', _keyStoreDelete: async () => {} };
    const fetchF = vi.fn(async (url, init) => { journal.push((init && init.method) + ' ' + url); return { ok: true }; });
    // eslint-disable-next-line no-new-func
    new Function('K', 'lg', 'PERSIST_PREFIX', 'confirm', 'location', 'API_BASE', '_safeCatch', 'fetch', 'idbDel',
      extractDef(html, 'K._retirerCetAppareil = function(jeton){') + '\n' + extractDef(html, 'K.logout = function(){'))(
      K, (k, d) => (k in store ? store[k] : d), 'apex_chat_', () => true, { reload: () => journal.push('reload') }, 'https://api.test', () => {}, fetchF, async () => {});
    K.logout();
    await new Promise((r) => setTimeout(r, 50));
    expect(journal.slice(0, 2)).toEqual(['DELETE https://api.test/api/keys/device/dev-kevin-iphone-01', 'POST https://api.test/api/auth/logout']);
    expect(journal).toContain('reload');
  });
});
