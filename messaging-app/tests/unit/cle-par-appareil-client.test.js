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
