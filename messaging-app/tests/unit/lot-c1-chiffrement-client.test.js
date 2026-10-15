// @vitest-environment node
// Lot C1 (audit A3 « chiffrement », A4 P3-9, A1 P3 — v1.1.304) — non-régression CLIENT sur le VRAI
// code (index.html extrait par client-extract.js) et la VRAIE crypto (lib/crypto-core.js, key-vault.js).
//  1. A3 P2 — média de DM : les octets sont TOUJOURS chiffrés dans un DM chiffré de bout en bout,
//     quoi que le serveur annonce comme capacités ; chiffrement impossible → RIEN n'est envoyé.
//  2. A3 P2 — groupe : un membre sans clé ne fait plus redescendre en clair un groupe déjà chiffré
//     (il est exclu de la distribution, l'expéditeur est prévenu).
//  3. A3 P2 — signature de groupe : la clé publiée suffit, le drapeau « gsig1 » retiré par le serveur
//     n'éteint plus la vérification (1ʳᵉ vue) ; une fois épinglée, toujours exigée.
//  4. A3 P3 — PIN : PBKDF2 600 000 itérations, anciens hash / wraps (100 000) relus puis refaits.
//  5. A4 P3-9 — WebSocket : ticket uniquement, jamais le jeton de session dans l'URL.
//  6. A1 P3 — /api/system/config appelée avec le jeton, jamais sans compte.
// Discriminant : CLIENT_INDEX_PATH / CLIENT_CRYPTO_PATH = copie sabotée → le test concerné échoue.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { pathToFileURL } from 'node:url';
import { CC, CONV, trio, trioSigned, lastFrames, parse, makeServer, makeMember } from './_support/groupe-e2e-harness.js';
import { loadDefs, readIndex, extractDef } from './client-extract.js';

const KV = await import(process.env.CLIENT_VAULT_PATH ? pathToFileURL(process.env.CLIENT_VAULT_PATH).href : '../../lib/key-vault.js');
const PLAIN = new TextEncoder().encode('%PDF-1.7 contrat confidentiel — IBAN FR76 0000');
const UNAUTH = '⚠️ message non authentifié';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------
//  1. Média de DM
// ---------------------------------------------------------------------------
/** Alice (vrai client) dans un DM avec Bob ; `caps` = ce que le SERVEUR annonce pour Bob.
 *  Identifiant de DM unique par essai : le cache de sessions de crypto-core est global au module. */
let dmSeq = 0;
async function dmSetup({ caps = 'media,grp1', peerKnown = true } = {}) {
  const srv = makeServer();
  srv.members = ['alice', 'bob'];
  const A = await makeMember(srv, 'alice');
  const peer = await CC.generateIdentityKeys();
  const peerPub = await CC.exportPublicKey(peer.publicKey);
  if (peerKnown) srv.keys.bob = peerPub; else delete srv.keys.bob;
  srv.caps.bob = caps;
  const id = 'dmc1_' + (++dmSeq);
  const dm = { id, type: 'dm', peer_id: 'bob', _peer_caps: caps };
  A.K.conversations.push(dm);
  A.K.viewData = dm;
  A.K._wsConvId = id;
  const peerSession = async () => { await CC.establishSession('peer-' + id, peer.privateKey, await CC.importPublicKey(A.pub)); return 'peer-' + id; };
  const peerOpen = async (bytes) => new Uint8Array(await CC.decryptBytes(await peerSession(), bytes.slice().buffer));
  const marker = async () => {
    const w = srv.frames.at(-1).ciphertext;
    expect(w.startsWith('E2E1:')).toBe(true);
    return JSON.parse((await CC.decryptForConv(await peerSession(), w.slice(5))).slice('APXMEDIA1:'.length));
  };
  return { srv, A, dm, peerOpen, marker };
}

describe('1. A3 P2 — les octets d\'un média de DM ne partent JAMAIS en clair', () => {
  it('1a. le serveur retire « media » des capacités du contact → octets QUAND MÊME chiffrés (avant : envoyés en clair)', async () => {
    for (const caps of ['grp1', '']) {
      const { srv, A, peerOpen, marker } = await dmSetup({ caps });
      expect(A.K._mediaE2eOn(A.K.viewData)).toBe(true);
      await A.K._uploadMedia(new File([PLAIN], 'contrat.pdf', { type: 'application/pdf' }));
      expect(srv.uploads).toHaveLength(1);
      expect(srv.uploads[0].ctype).toBe('application/octet-stream');
      expect(Buffer.from(srv.uploads[0].bytes).includes(Buffer.from('IBAN'))).toBe(false);
      expect(Buffer.from(await peerOpen(srv.uploads[0].bytes)).equals(Buffer.from(PLAIN))).toBe(true);
      expect((await marker()).e).toBe(1);
    }
  });

  it('1b. un ancien réglage local « 0 » n\'éteint plus le chiffrement des octets ; groupe / E2E coupé : non concerné', async () => {
    const { A, dm } = await dmSetup({ caps: 'grp1' });
    A.localStorage.setItem('apex_chat_media_e2e', '0');
    expect(A.K._mediaE2eOn(dm)).toBe(true);
    expect(A.K._mediaE2eOn(A.conv)).toBe(false);                   // groupe : clé propre au fichier (_grpFileForUpload)
    A.localStorage.setItem('apex_chat_e2e', '0');
    expect(A.K._mediaE2eOn(dm)).toBe(false);                       // E2E coupé sur l'appareil : en-tête « transit »
  });

  it('1c. clé du contact introuvable (bundle 409) → RIEN n\'est uploadé, message clair à l\'utilisateur', async () => {
    const { srv, A } = await dmSetup({ peerKnown: false });
    await A.K._uploadMedia(new File([PLAIN], 'contrat.pdf', { type: 'application/pdf' }));
    expect(srv.uploads).toEqual([]);
    expect(srv.frames).toEqual([]);
    expect(A.toasts.at(-1)).toMatch(/NON envoyée.*Rien n'est envoyé en clair/);
  });

  it('1d. chiffrement en panne → RIEN n\'est uploadé (avant : « fail-open → clair »)', async () => {
    const { srv, A } = await dmSetup();
    A.ApexCrypto.encryptBytes = async () => { throw new Error('panne'); };
    await A.K._uploadMedia(new File([PLAIN], 'contrat.pdf', { type: 'application/pdf' }));
    expect(srv.uploads).toEqual([]);
    expect(A.errors.join(' ')).toMatch(/media-bytes-encrypt/);
  });

  it('1e. message VOCAL de DM : l\'audio est chiffré avant l\'upload (avant : toujours en clair)', async () => {
    const { srv, A, peerOpen, marker } = await dmSetup({ caps: '' });
    const audio = new TextEncoder().encode('OggS voix de Bob : le code est 4521');
    A.K._voicePending = { blob: new Blob([audio], { type: 'audio/webm' }), text: '' };
    await A.K._sendVoiceMessage();
    expect(srv.uploads).toHaveLength(1);
    expect(srv.uploads[0].ctype).toBe('application/octet-stream');
    expect(Buffer.from(await peerOpen(srv.uploads[0].bytes)).equals(Buffer.from(audio))).toBe(true);
    const m = await marker();
    expect(m).toMatchObject({ e: 1, m: 'audio/webm', c: '🎙️ Message vocal' });
    expect(A.toasts.at(-1)).toMatch(/vocal envoyé/);
  });

  it('1f. vocal de DM impossible à chiffrer → RIEN n\'est uploadé, gardé sur l\'appareil, message explicite', async () => {
    const { srv, A } = await dmSetup({ peerKnown: false });
    A.K._voicePending = { blob: new Blob([new Uint8Array(1100 * 1024)], { type: 'audio/webm' }), text: 'coucou' };   // > 1 Mo : pas de copie locale
    await A.K._sendVoiceMessage();
    expect(srv.uploads).toEqual([]);
    expect(srv.frames).toEqual([]);
    expect(A.toasts.join(' ')).toMatch(/Vocal NON envoyé.*rien n'est envoyé en clair/);
    expect(A.K.messages[A.K.viewData.id].at(-1)).toMatchObject({ voice_too_large: true, encrypted: false });
  });
});

// ---------------------------------------------------------------------------
//  2. Groupe : plus de rétrogradation de tout le groupe par un seul membre
// ---------------------------------------------------------------------------
describe('2. A3 P2 — un membre sans clé ne fait plus repasser en clair un groupe déjà chiffré', () => {
  for (const [nom, casser] of [
    ['le serveur cesse de servir la clé de Carol (409)', (srv) => { delete srv.keys.carol; }],
    ['le serveur retire la capacité « grp1 » de Carol', (srv) => { srv.caps.carol = 'media'; }],
  ]) {
    it('2a. ' + nom + ' → message CHIFFRÉ pour les autres, Carol exclue, l\'expéditeur est prévenu', async () => {
      const { srv, A, B } = await trio();
      await A.send('premier');
      await srv.drain();
      casser(srv);
      A.K._grpBundleCache = {};
      const before = srv.frames.length;
      await A.send('deuxième, confidentiel');
      const sent = srv.frames.slice(before);
      expect(sent.some((f) => /confidentiel/.test(f.ciphertext))).toBe(false);   // avant : texte EN CLAIR
      expect(sent.at(-1).ciphertext.startsWith('E2EG1:')).toBe(true);
      expect(A.K.messages[CONV].at(-1).encrypted).toBe(true);
      expect(A.toasts.at(-1)).toMatch(/Envoyé chiffré E2E · ⚠️ 1 membre ne peut pas lire les messages chiffrés/);
      expect(A.header()).toContain('1 membre ne peut pas lire les messages chiffrés');
      expect(A.header()).toContain('Groupe chiffré de bout en bout');
      await srv.drain();
      expect(B.shown()).toEqual(['premier', 'deuxième, confidentiel']);
    });
  }

  it('2b. nouvelle époque (membre ajouté sans clé) : la clé n\'est distribuée qu\'aux membres prêts', async () => {
    const { srv, A, B } = await trio();
    await A.send('premier');
    await srv.drain();
    await makeMember(srv, 'dave', { publish: false });
    srv.members = ['alice', 'bob', 'carol', 'dave'];
    A.K._grpMembersCache = {};
    const before = srv.frames.length;
    await A.send('après l\'arrivée de Dave');
    const dist = srv.frames.slice(before).filter((f) => f.ciphertext.startsWith('E2EGK1:'));
    expect(dist.flatMap((f) => parse(f.ciphertext).body.keys.map((e) => e.to)).sort()).toEqual(['bob', 'carol']);
    expect(A.K._grpState[CONV]).toMatchObject({ ready: true, excluded: ['dave'] });
    await srv.drain();
    expect(B.shown().at(-1)).toBe('après l\'arrivée de Dave');
    expect(srv.clients.dave.shown().join(' ')).not.toMatch(/arrivée/);
  });

  it('2c. un membre qui n\'a fait que LIRE du chiffré (jamais envoyé) ne repasse pas non plus en clair', async () => {
    const { srv, A, B } = await trio();
    await A.send('premier');
    await srv.drain();
    expect(B.shown()).toEqual(['premier']);
    srv.caps.carol = 'media';
    B.K._grpBundleCache = {};
    const before = srv.frames.length;
    await B.send('réponse de Bob, confidentielle');
    const sent = srv.frames.slice(before);
    expect(sent.some((f) => /confidentielle/.test(f.ciphertext))).toBe(false);
    expect(sent.at(-1).ciphertext.startsWith('E2EG1:')).toBe(true);
    await srv.drain();
    expect(A.shown().at(-1)).toBe('réponse de Bob, confidentielle');
  });

  it('2d. groupe JAMAIS chiffré : règle d\'avant conservée (en transit, honnête) — et pièce jointe d\'un groupe déjà chiffré : chiffrée', async () => {
    const srv = makeServer();
    srv.members = ['alice', 'bob'];
    const A = await makeMember(srv, 'alice');
    await makeMember(srv, 'bob', { publish: false });
    await A.send('bonjour');
    expect(lastFrames(srv, 'alice').map((f) => f.ciphertext)).toEqual(['bonjour']);
    expect(A.header()).toContain('pas de bout en bout');
    const t = await trio();
    await t.A.send('premier');
    delete t.srv.keys.carol;
    t.A.K._grpBundleCache = {};
    await t.A.K._uploadMedia(new File([PLAIN], 'contrat.pdf', { type: 'application/pdf' }));
    expect(t.srv.uploads[0].ctype).toBe('application/octet-stream');
  });

  it('2e. primitive groupReadiness : wasE2e → prêt, membres exclus listés ; sans preuve → pas prêt', () => {
    const st = [{ uid: 'b', status: 'ok' }, { uid: 'c', status: 'nokey' }, { uid: 'd', status: 'pending' }];
    expect(CC.groupReadiness(st, { wasE2e: true })).toEqual({ ready: true, recipients: ['b'], pending: ['d'], missing: ['c'], excluded: ['c'] });
    expect(CC.groupReadiness(st, { wasE2e: false }).ready).toBe(false);
    expect(CC.groupReadiness(st, { wasE2e: 'true' }).ready).toBe(false);      // jamais une valeur « vraisemblable »
    expect(CC.groupReadiness(st).ready).toBe(false);
    expect(CC.groupReadiness([{ uid: 'b', status: 'ok' }], { wasE2e: true })).toEqual({ ready: true, recipients: ['b'], pending: [], missing: [] });
  });
});

// ---------------------------------------------------------------------------
//  3. Signature de groupe : le drapeau de capacité ne l'éteint plus
// ---------------------------------------------------------------------------
async function carolForges(C, text, { mid = 'forge_1', legacy = false } = {}) {
  const k = C.idb.keys().filter((x) => x.startsWith('gsk|' + CONV + '|alice|')).sort().at(-1);
  const [, , , epoch, kid] = k.split('|');
  const rec = C.idb.kv(k);
  const ctx = { conv: CONV, from: 'alice', epoch: Number(epoch), kid };
  return legacy ? CC.groupEncrypt(rec.key, text, ctx) : CC.groupEncrypt(rec.key, text, { ...ctx, kind: 'm', mid });
}

describe('3. A3 P2 — vérification de signature non désactivable par le drapeau « gsig1 »', () => {
  it('3a. 1ʳᵉ vue : clé de signature publiée mais drapeau retiré par le serveur → épinglée et exigée (forge refusée)', async () => {
    const { srv, A, B, C } = await trioSigned();
    srv.caps.alice = 'media,grp1';                     // le serveur sert la clé mais retire « gsig1 »
    await A.send('bonjour signé');
    await srv.drain();
    expect(B.shown()).toEqual(['bonjour signé']);
    expect(B.localStorage.getItem('gsigkey_alice')).toBe(srv.sig.alice);
    let i = 0;
    for (const w of [await carolForges(C, 'FAUX non signé', { mid: 'f1' }), await carolForges(C, 'FAUX ancien format', { legacy: true })]) {
      await B.handle({ type: 'message', id: 'srv_f' + (++i), sender_id: 'alice', ciphertext: w, ts: 100 + i }, CONV);
    }
    expect(B.shown()).toEqual(['bonjour signé', UNAUTH, UNAUTH]);
  });

  it('3b. épinglée : drapeau PUIS clé retirés du bundle → toujours exigée', async () => {
    const { srv, A, B, C } = await trioSigned();
    await A.send('bonjour signé');
    await srv.drain();
    srv.caps.alice = 'media,grp1';
    B.K._grpBundleCache = {};
    await B.handle({ type: 'message', id: 'srv_x1', sender_id: 'alice', ciphertext: await carolForges(C, 'FAUX 1', { mid: 'x1' }), ts: 200 }, CONV);
    srv.sig.alice = null;
    B.K._grpBundleCache = {};
    await B.handle({ type: 'message', id: 'srv_x2', sender_id: 'alice', ciphertext: await carolForges(C, 'FAUX 2', { mid: 'x2' }), ts: 201 }, CONV);
    expect(B.shown()).toEqual(['bonjour signé', UNAUTH, UNAUTH]);
  });
});

// ---------------------------------------------------------------------------
//  4. PIN : PBKDF2 600 000 itérations + migration
// ---------------------------------------------------------------------------
function pinSandbox(stored) {
  const store = { ...(stored ? { user_pin_u1: stored } : {}) };
  const errors = [];
  const { K } = loadDefs(['K._PIN_HASH_ITER = ', 'K._hashPin = async function(pin, iterations){', 'K._userPinVerify = async function(uid, pin){'], {
    K: {}, lg: (k, d) => (k in store ? store[k] : d), ls: (k, v) => { store[k] = v; }, _safeCatch: (t) => errors.push(t),
  });
  return { K, store, errors };
}
async function legacyWrap(priv, pin) {
  // Wrap tel qu'écrit avant v1.1.304 : PBKDF2-SHA256 100 000, format { ct, salt, v:1 }.
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  const aes = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { ct: await CC.encryptMessage(JSON.stringify({ priv }), aes), salt: CC.bufToB64(salt), v: 1 };
}

describe('4. A3 P3 — PIN : PBKDF2-SHA256 à 600 000 itérations, anciens réglages migrés au déverrouillage', () => {
  it('4a. hash du PIN : format p2$600000$…, vérifié ; mesure du temps de déverrouillage', async () => {
    const { K, store } = pinSandbox(null);
    store.user_pin_u1 = await K._hashPin('482915');
    expect(store.user_pin_u1).toMatch(/^p2\$600000\$[0-9a-f]{64}$/);
    const t0 = performance.now();
    expect(await K._userPinVerify('u1', '482915')).toBe(true);
    const ms = performance.now() - t0;
    console.info('[lot C1] déverrouillage PIN (PBKDF2 600k, Node) :', ms.toFixed(0), 'ms');
    expect(ms).toBeLessThan(5000);
    expect(await K._userPinVerify('u1', '000000')).toBe(false);
  });

  it('4b. ancien hash (100 000) : accepté une fois, puis RECALCULÉ à 600 000 ; PIN faux → rien ne change', async () => {
    const { K, store } = pinSandbox(null);
    const legacy = await K._hashPin('482915', 100000);
    expect(legacy).toMatch(/^[0-9a-f]{64}$/);
    store.user_pin_u1 = legacy;
    expect(await K._userPinVerify('u1', '111111')).toBe(false);
    expect(store.user_pin_u1).toBe(legacy);
    expect(await K._userPinVerify('u1', '482915')).toBe(true);
    expect(store.user_pin_u1).toMatch(/^p2\$600000\$/);
    expect(await K._userPinVerify('u1', '482915')).toBe(true);
    // un hash altéré qui prétend « 1 itération » ne fait pas baisser le coût (plancher 100 000) → refusé
    store.user_pin_u1 = 'p2$1$' + legacy;
    expect(await K._userPinVerify('u1', '482915')).toBe(false);
  });

  it('4c. clé privée « wrappée » à 100 000 (appareil sans IndexedDB) : relue, puis ré-emballée à 600 000', async () => {
    const DEFS = [
      'const PERSIST_PREFIX = ', { m: 'function lg(key, fallback){', end: '\n}' }, { m: 'function ls(key, value){', end: '\n}' },
      { m: 'async function idbOpen(){', end: '\n}' }, { m: 'async function idbSet(key, value){', end: '\n}' },
      'K._PRIV_IDB_KEY = ', 'K._keyStoreWarned = ', 'K._keyStoreWarnOnce = function(e){', 'K._keyStorePut = async function(rec){',
      'K._keyStoreGet = async function(){', 'K._keyStoreDrop = async function(keys){', 'K._importPrivNonExtractable = function(privB64){',
      'K._privMatchesPub = async function(priv, pub){', 'K._migratePrivToIdb = async function(privB64, pubB64){',
      { m: 'async function _ensureCryptoKeys(){', end: '\n}' }, 'K._loadCryptoKeys = async function(){',
    ];
    const mem = {};
    const localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    const kp = await CC.generateIdentityKeys();
    const pub = await CC.exportPublicKey(kp.publicKey);
    const priv = await CC.exportPrivateKey(kp.privateKey);
    mem.apex_chat_crypto_pub = JSON.stringify(pub);
    mem.apex_chat_crypto_priv_wrapped = JSON.stringify(await legacyWrap(priv, '482915'));
    expect(KV.vaultNeedsRewrap(JSON.parse(mem.apex_chat_crypto_priv_wrapped))).toBe(true);
    const ApexVault = { wrapPrivKey: KV.wrapPrivKey, unwrapPrivKey: KV.unwrapPrivKey, planKeyMigration: KV.planKeyMigration, vaultNeedsRewrap: KV.vaultNeedsRewrap };
    const K = { _sessionPin: '482915', _publishPubkey() {} };
    const g = { K, window: { ApexCrypto: CC, ApexVault }, ApexCrypto: CC, ApexVault, localStorage, indexedDB: undefined, _idb: null, _idbWiping: false,
      _idbNoteError() {}, _logTelemetry() {}, _safeCatch() {}, console: { log() {}, warn() {}, error() {} } };
    const html = readIndex();
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(g), DEFS.map((d) => extractDef(html, d)).join('\n') + '\n;return _ensureCryptoKeys;');
    await fn(...Object.values(g))();
    expect(K._cryptoKeys && K._cryptoKeys.privateKey).toBeTruthy();
    const w = JSON.parse(mem.apex_chat_crypto_priv_wrapped);
    expect(w).toMatchObject({ v: 2, it: 600000 });
    expect(KV.vaultNeedsRewrap(w)).toBe(false);
    expect(await KV.unwrapPrivKey(w, '482915')).toBe(priv);           // même identité, rien de perdu
  });

  it('4d. primitives : wrap 600 000 (iterations voyage avec le wrap), ancien wrap relu, itérations altérées refusées', async () => {
    expect(CC.PIN_KDF_ITERATIONS).toBe(600000);
    const w = await CC.wrapWithPin({ a: 1 }, '1234');
    expect(w.iterations).toBe(600000);
    expect(await CC.unwrapWithPin(w.ciphertext, w.salt, '1234', w.iterations)).toEqual({ a: 1 });
    await expect(CC.unwrapWithPin(w.ciphertext, w.salt, '1234', 99999)).rejects.toThrow('pin-kdf-iterations');
    await expect(CC.unwrapWithPin(w.ciphertext, w.salt, '1234', 1.5)).rejects.toThrow('pin-kdf-iterations');
    const old = await legacyWrap('PRIVB64', '1234');
    expect(KV.vaultIterations(old)).toBe(100000);
    expect(await KV.unwrapPrivKey(old, '1234')).toBe('PRIVB64');
    expect(KV.vaultIterations(null)).toBe(100000);
    expect(KV.vaultNeedsRewrap(null)).toBe(false);
    expect(KV.vaultNeedsRewrap({ it: 600000 })).toBe(false);
    expect((await CC.selfTest()).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
//  5. WebSocket : ticket uniquement
// ---------------------------------------------------------------------------
class FakeWS {
  static all = [];
  static OPEN = 1;
  constructor(url) { this.url = url; this.l = {}; FakeWS.all.push(this); }
  addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); }
  close() {}
  send() {}
}
describe('5. A4 P3-9 — WebSocket : jamais le jeton de session dans l\'URL', () => {
  it('5a. ticket indisponible → AUCUNE socket ouverte avec le jeton ; nouvel essai à délai croissant, puis ticket', async () => {
    vi.useFakeTimers();
    FakeWS.all = [];
    let ticket = null;
    const toast = vi.fn();
    const K = { user: { id: 'u1' }, token: 'SESSION-SECRETE', view: 'chat', viewData: { id: 'c1' },
      _wsTicket: async () => ticket, _flushOutboxFor() {}, _flushPendingEncrypt() {} };
    loadDefs(['K._openWs = async function(convId){'], { K, API_BASE: 'https://api.example', WebSocket: FakeWS,
      _logTelemetry() {}, _safeCatch() {}, toast, _handleWsMessage: async () => {} });
    await K._openWs('c1');
    expect(FakeWS.all).toEqual([]);                                   // avant : wss://…/ws?token=SESSION-SECRETE
    expect(K._wsRetry).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);                          // 2ᵉ essai après 1 s
    expect(K._wsRetry).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);                          // 3ᵉ après 2 s
    await vi.advanceTimersByTimeAsync(4000);                          // 4ᵉ après 4 s → l'utilisateur est prévenu
    expect(K._wsRetry).toBe(4);
    expect(toast).toHaveBeenCalledTimes(1);
    ticket = 'T1';
    await vi.advanceTimersByTimeAsync(8000);
    expect(FakeWS.all).toHaveLength(1);
    expect(FakeWS.all[0].url).toContain('ticket=T1');
    expect(FakeWS.all.map((w) => w.url).join(' ')).not.toContain('SESSION-SECRETE');
    clearInterval(K.wsPing);
  });

  it('5b. le délai plafonne à 30 s, et rien ne repart si la conversation a été quittée', async () => {
    vi.useFakeTimers();
    FakeWS.all = [];
    const K = { user: { id: 'u1' }, token: 'S', view: 'chat', viewData: { id: 'c1' }, _wsRetry: 9, _wsTicket: async () => null };
    loadDefs(['K._openWs = async function(convId){'], { K, API_BASE: 'https://a', WebSocket: FakeWS, _logTelemetry() {}, _safeCatch() {}, toast() {}, _handleWsMessage: async () => {} });
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await K._openWs('c1');
    expect(spy.mock.calls.at(-1)[1]).toBe(30000);
    K.view = 'chats';
    K._wsTicket = async () => 'T';
    await vi.advanceTimersByTimeAsync(30000);
    expect(FakeWS.all).toEqual([]);
  });

  it('5c. diagnostic sans ticket : jeton en EN-TÊTE, jamais dans l\'URL ; aucune URL de WS bâtie avec le jeton dans la page', async () => {
    const calls = [];
    const K = { token: 'SESSION-SECRETE', _wsTicket: async () => null, user: {} };
    loadDefs(['K._wsDiagnose = async function(convId){'], { K, API_BASE: 'https://api', toast() {}, console: { log() {}, warn() {} },
      fetch: async (url, init) => { calls.push({ url, init }); return { json: async () => ({ ok: true }) }; } });
    await K._wsDiagnose('c1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api/api/conversations/c1/ws-diag');
    expect(calls[0].init.headers.Authorization).toBe('Bearer SESSION-SECRETE');
    const html = readIndex();
    expect(html).not.toMatch(/token='\s*\+\s*encodeURIComponent\(K\.token\)/);
    expect(html).not.toMatch(/\/ws\?[^\n]*token=/);
  });
});

// ---------------------------------------------------------------------------
//  6. /api/system/config : avec le jeton, jamais sans compte
// ---------------------------------------------------------------------------
describe('6. A1 P3 — la configuration n\'est demandée qu\'avec un compte connecté', () => {
  it('pas de jeton (ou jeton local) → aucun appel ; jeton → en-tête Authorization ; panne → valeurs par défaut', async () => {
    const fetch = vi.fn(async () => ({ json: async () => ({ ok: true, config: { MAX_GROUP_SIZE: 50 } }) }));
    const K = { token: null, config: {} };
    loadDefs(['K._loadSystemConfig = function(){'], { K, API_BASE: 'https://api', fetch });
    expect(await K._loadSystemConfig()).toBe(false);
    K.token = 'local-123';
    expect(await K._loadSystemConfig()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    K.token = 'tok';
    expect(await K._loadSystemConfig()).toBe(true);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(K.config).toEqual({ MAX_GROUP_SIZE: 50 });
    fetch.mockImplementationOnce(async () => ({ json: async () => ({ ok: false }) }));
    expect(await K._loadSystemConfig()).toBe(false);
    fetch.mockImplementationOnce(async () => { throw new Error('réseau'); });
    expect(await K._loadSystemConfig()).toBe(false);
    expect(K.config.ADMIN_MODE).toBe('A');
    expect(readIndex()).not.toMatch(/fetch\(API_BASE \+ '\/api\/system\/config'\)\./);   // plus d'appel anonyme au démarrage
  });
});
