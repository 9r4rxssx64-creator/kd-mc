// @vitest-environment node
// Garde F36 (audit, v1.1.295) — la clé privée E2E n'est plus lisible en octets par un script.
//
// Avant : la clé privée ECDH vivait EN CLAIR (JWK base64) dans localStorage
// (« apex_chat_crypto_priv ») ET dans l'ombre IndexedDB « kv » écrite par ls().
// Après : CryptoKey NON EXTRACTIBLE rangée en IndexedDB (clonage structuré), utilisée par
// WebCrypto sans jamais rendre ses octets ; migration automatique au chargement, vérifiée
// avant d'effacer le clair ; repli localStorage si IndexedDB est indisponible (zéro perte).
//
// Le code testé est EXTRAIT de la vraie page (client-extract.js) et tourne avec la VRAIE
// crypto (lib/crypto-core.js). IndexedDB = petite cale en mémoire (fake-indexeddb n'est
// pas une dépendance) qui CLONE les valeurs (structuredClone), comme un vrai navigateur.
//
// Discriminant (prouvé par sabotage d'une copie d'index.html via CLIENT_INDEX_PATH) :
// chaque correctif retiré fait échouer son test.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';
import * as CC from '../../lib/crypto-core.js';

const DEFS = [
  'const PERSIST_PREFIX = ',
  { m: 'function lg(key, fallback){', end: '\n}' },
  { m: 'function ls(key, value){', end: '\n}' },
  { m: 'async function idbOpen(){', end: '\n}' },
  { m: 'async function idbSet(key, value){', end: '\n}' },
  'K._PRIV_IDB_KEY = ',
  'K._keyStoreWarned = ',
  'K._keyStoreWarnOnce = function(e){',
  'K._keyStorePut = async function(rec){',
  'K._keyStoreGet = async function(){',
  'K._keyStoreDrop = async function(keys){',
  'K._keyStoreDelete = function(){',
  'K._importPrivNonExtractable = function(privB64){',
  'K._privMatchesPub = async function(priv, pub){',
  'K._migratePrivToIdb = async function(privB64, pubB64){',
  { m: 'async function _ensureCryptoKeys(){', end: '\n}' },
  'K._loadCryptoKeys = async function(){',
  'K._migrateKeyToPin = async function(pin){',
  'K.logout = function(){',
  'K._deleteMyAccountGo = async function(){',
];

const LS_PRIV = 'apex_chat_crypto_priv';
const LS_PUB = 'apex_chat_crypto_pub';
const REC = 'crypto_priv_ck';

// ---------------------------------------------------------------------------
//  Cales : localStorage (énumérable comme le vrai) + IndexedDB en mémoire
// ---------------------------------------------------------------------------
function makeLocalStorage() {
  const ls = {};
  Object.defineProperties(ls, {
    getItem: { value: (k) => (Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null) },
    setItem: { value: (k, v) => { ls[k] = String(v); } },
    removeItem: { value: (k) => { delete ls[k]; } },
    key: { value: (i) => Object.keys(ls)[i] ?? null },
    length: { get: () => Object.keys(ls).length },
  });
  return ls;
}

// opts.hooks.get(key, value) → valeur relue (pour simuler une relecture corrompue)
function makeIDB(opts = {}) {
  const dbs = new Map(); // name → Map(store → Map(key → value))
  const later = (fn) => setTimeout(fn, 0);
  const api = {
    dbs,
    open(name) {
      const req = {};
      later(() => {
        if (opts.failOpen) { req.error = new Error('open refusé (navigation privée)'); req.onerror && req.onerror(); return; }
        const isNew = !dbs.has(name);
        if (isNew) dbs.set(name, new Map());
        const stores = dbs.get(name);
        const db = {
          objectStoreNames: { contains: (s) => stores.has(s) },
          createObjectStore: (s) => { stores.set(s, new Map()); },
          close() {},
          transaction(names, mode) {
            const tx = {};
            let failed = false;
            const done = () => later(() => {
              if (failed) { tx.error = new Error('quota'); tx.onerror && tx.onerror(); tx.onabort && tx.onabort(); }
              else tx.oncomplete && tx.oncomplete();
            });
            tx.objectStore = (s) => {
              const st = stores.get(s);
              return {
                put(v, k) {
                  if (opts.failPut) { failed = true; return {}; }
                  st.set(k, structuredClone(v));
                  return {};
                },
                get(k) {
                  const rq = {};
                  later(() => {
                    let v = st.has(k) ? structuredClone(st.get(k)) : undefined;
                    if (opts.hooks && opts.hooks.get) v = opts.hooks.get(k, v);
                    rq.result = v; rq.onsuccess && rq.onsuccess();
                  });
                  return rq;
                },
                delete(k) { st.delete(k); return {}; },
              };
            };
            done();
            return tx;
          },
        };
        req.result = db;
        if (isNew) req.onupgradeneeded && req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      });
      return req;
    },
    kv(key) { const db = dbs.get('apex_chat_idb'); return db && db.get('kv') ? db.get('kv').get(key) : undefined; },
    seed(key, value) {
      if (!dbs.has('apex_chat_idb')) dbs.set('apex_chat_idb', new Map([['kv', new Map()]]));
      dbs.get('apex_chat_idb').get('kv').set(key, value);
    },
  };
  return api;
}

function sandbox({ localStorage, indexedDB, apexCrypto = CC, apexVault, extraK = {}, extra = {} }) {
  const K = { _publishPubkey: vi.fn(), ...extraK };
  const warn = vi.fn();
  const telemetry = vi.fn();
  const location = { reload: vi.fn(), replace: vi.fn(), pathname: '/' };
  const globals = {
    K,
    window: { ApexCrypto: apexCrypto, ApexVault: apexVault },
    ApexCrypto: apexCrypto,
    ApexVault: apexVault,
    localStorage,
    indexedDB,
    _idb: null,
    _idbWiping: false,
    _idbNoteError: () => {},
    _logTelemetry: telemetry,
    _safeCatch: () => {},
    console: { ...console, warn },
    location,
    confirm: () => true,
    ...extra,
  };
  const html = readIndex();
  const src = DEFS.map((m) => extractDef(html, m)).join('\n');
  const names = Object.keys(globals);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, `${src}\n;return { ensure: _ensureCryptoKeys };`);
  const { ensure } = fn(...names.map((n) => globals[n]));
  return { K, ensure, warn, telemetry, location };
}

async function legacyPair() {
  const kp = await CC.generateIdentityKeys();
  return { kp, pub: await CC.exportPublicKey(kp.publicKey), priv: await CC.exportPrivateKey(kp.privateKey) };
}

// Le pair chiffre avec ECDH(sa priv, ma pub) ; je dois déchiffrer avec ECDH(ma priv chargée, sa pub).
async function roundTrip(myPrivateKey, myPubB64) {
  const peer = await CC.generateIdentityKeys();
  const myPub = await CC.importPublicKey(myPubB64);
  const peerSide = await CC.deriveSharedKey(peer.privateKey, myPub);
  const mySide = await CC.deriveSharedKey(myPrivateKey, peer.publicKey);
  const ct = await CC.encryptMessage('F36 bonjour', peerSide);
  return CC.decryptMessage(ct, mySide);
}

const lsJson = (v) => JSON.stringify(v);

describe('F36 — migration de la clé en clair vers IndexedDB non extractible', () => {
  let store; let idb; let pair;
  beforeEach(async () => {
    store = makeLocalStorage(); idb = makeIDB(); pair = await legacyPair();
    store.setItem(LS_PUB, lsJson(pair.pub));
    store.setItem(LS_PRIV, lsJson(pair.priv));
    idb.seed('crypto_priv', pair.priv); // ombre « kv » en clair écrite par ls() des versions d'avant
  });

  it('efface le clair (localStorage + ombre IndexedDB) et range une CryptoKey NON extractible', async () => {
    const { K, ensure } = sandbox({ localStorage: store, indexedDB: idb });
    await ensure();
    expect(store.getItem(LS_PRIV)).toBeNull();
    expect(idb.kv('crypto_priv')).toBeUndefined();
    expect(store.getItem(LS_PUB)).toBe(lsJson(pair.pub)); // la clé publique reste où elle était
    const rec = idb.kv(REC);
    expect(rec && rec.pub).toBe(pair.pub);
    expect(rec.priv.extractable).toBe(false);
    expect(K._cryptoKeys.privateKey.extractable).toBe(false);
    // aucun script ne peut plus lire les octets
    await expect(crypto.subtle.exportKey('jwk', K._cryptoKeys.privateKey)).rejects.toThrow();
    await expect(crypto.subtle.exportKey('pkcs8', rec.priv)).rejects.toThrow();
    // aucune trace du « d » de la JWK nulle part dans localStorage
    const d = JSON.parse(atob(pair.priv)).d;
    expect(Object.keys(store).some((k) => String(store.getItem(k)).includes(d))).toBe(false);
  });

  it('c\'est la MÊME identité : un message chiffré par un pair vers l\'ancienne clé publique se déchiffre', async () => {
    const { K, ensure } = sandbox({ localStorage: store, indexedDB: idb });
    await ensure();
    expect(K._cryptoKeys.privateKey.extractable).toBe(false);
    expect(await roundTrip(K._cryptoKeys.privateKey, pair.pub)).toBe('F36 bonjour');
    // session + ratchet (les deux chemins qui lisent la clé privée) acceptent la CryptoKey
    const peer = await CC.generateIdentityKeys();
    await CC.establishSession('conv-f36', K._cryptoKeys.privateKey, peer.publicKey);
    expect(CC.getSessionKey('conv-f36')).toBeTruthy();
    await CC.ratchetInit('conv-f36-r', K._cryptoKeys.privateKey, peer.publicKey);
    expect(CC.hasRatchet('conv-f36-r')).toBe(true);
  });

  it('au rechargement suivant : clé relue depuis IndexedDB, aucune nouvelle identité générée', async () => {
    const a = sandbox({ localStorage: store, indexedDB: idb });
    await a.ensure();
    const gen = vi.fn(CC.generateIdentityKeys);
    const b = sandbox({ localStorage: store, indexedDB: idb, apexCrypto: { ...CC, generateIdentityKeys: gen } });
    await b.ensure();
    expect(gen).not.toHaveBeenCalled();
    expect(b.K._cryptoKeys.privateKey.extractable).toBe(false);
    expect(store.getItem(LS_PUB)).toBe(lsJson(pair.pub));
    expect(store.getItem(LS_PRIV)).toBeNull();
    expect(await roundTrip(b.K._cryptoKeys.privateKey, pair.pub)).toBe('F36 bonjour');
  });

  it('relecture IndexedDB qui ne correspond pas à la clé publique → le clair est GARDÉ (jamais de perte)', async () => {
    const other = await CC.generateIdentityKeys();
    const otherNe = await crypto.subtle.importKey('jwk', await crypto.subtle.exportKey('jwk', other.privateKey),
      { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
    idb = makeIDB({ hooks: { get: (k, v) => (k === REC && v ? { ...v, priv: otherNe } : v) } });
    const { K, ensure, warn } = sandbox({ localStorage: store, indexedDB: idb });
    await ensure();
    expect(store.getItem(LS_PRIV)).toBe(lsJson(pair.priv)); // clair conservé
    expect(idb.kv(REC)).toBeUndefined();                     // enregistrement douteux retiré
    expect(await roundTrip(K._cryptoKeys.privateKey, pair.pub)).toBe('F36 bonjour');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('F36 — IndexedDB indisponible : comportement d\'avant, une seule ligne de console', () => {
  for (const [nom, mk] of [
    ['open refusé (navigation privée)', () => makeIDB({ failOpen: true })],
    ['écriture refusée (quota)', () => makeIDB({ failPut: true })],
    ['indexedDB absent', () => undefined],
  ]) {
    it(`${nom} → clé gardée dans localStorage, chargée, 1 seul avertissement`, async () => {
      const store = makeLocalStorage(); const pair = await legacyPair();
      store.setItem(LS_PUB, lsJson(pair.pub)); store.setItem(LS_PRIV, lsJson(pair.priv));
      const { K, ensure, warn, telemetry } = sandbox({ localStorage: store, indexedDB: mk() });
      await ensure();
      expect(store.getItem(LS_PRIV)).toBe(lsJson(pair.priv));
      expect(await roundTrip(K._cryptoKeys.privateKey, pair.pub)).toBe('F36 bonjour');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('key-store');
      expect(telemetry.mock.calls.map((c) => c[1])).not.toContain('crypto-key-migrated-idb');
    });
  }

  it('nouvelle identité sans IndexedDB → clé écrite dans localStorage (jamais perdue)', async () => {
    const store = makeLocalStorage();
    const { K, ensure, warn } = sandbox({ localStorage: store, indexedDB: makeIDB({ failOpen: true }) });
    await ensure();
    const pub = JSON.parse(store.getItem(LS_PUB));
    expect(JSON.parse(store.getItem(LS_PRIV))).toBeTruthy();
    expect(await roundTrip(K._cryptoKeys.privateKey, pub)).toBe('F36 bonjour');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('F36 — nouvelle identité et rechargement', () => {
  it('nouvelle identité : jamais écrite en clair, CryptoKey non extractible en IndexedDB, clé publique publiée', async () => {
    const store = makeLocalStorage(); const idb = makeIDB();
    const { K, ensure } = sandbox({ localStorage: store, indexedDB: idb });
    await ensure();
    const pub = JSON.parse(store.getItem(LS_PUB));
    expect(store.getItem(LS_PRIV)).toBeNull();
    expect(idb.kv('crypto_priv')).toBeUndefined();
    expect(idb.kv(REC).pub).toBe(pub);
    expect(K._cryptoKeys.privateKey.extractable).toBe(false);
    expect(K._publishPubkey).toHaveBeenCalled();
    expect(await roundTrip(K._cryptoKeys.privateKey, pub)).toBe('F36 bonjour');
  });

  it('localStorage vidé (éviction iOS) mais IndexedDB intacte → même identité, clé publique restaurée', async () => {
    const store = makeLocalStorage(); const idb = makeIDB();
    const a = sandbox({ localStorage: store, indexedDB: idb });
    await a.ensure();
    const pub = JSON.parse(store.getItem(LS_PUB));
    for (const k of Object.keys(store)) store.removeItem(k);
    const gen = vi.fn(CC.generateIdentityKeys);
    const b = sandbox({ localStorage: store, indexedDB: idb, apexCrypto: { ...CC, generateIdentityKeys: gen } });
    await b.ensure();
    expect(gen).not.toHaveBeenCalled();
    expect(JSON.parse(store.getItem(LS_PUB))).toBe(pub);
    expect(await roundTrip(b.K._cryptoKeys.privateKey, pub)).toBe('F36 bonjour');
  });

  it('appels simultanés (unlock + envoi + réception) → UNE seule identité générée', async () => {
    const store = makeLocalStorage(); const idb = makeIDB();
    const gen = vi.fn(CC.generateIdentityKeys);
    const { K, ensure } = sandbox({ localStorage: store, indexedDB: idb, apexCrypto: { ...CC, generateIdentityKeys: gen } });
    await Promise.all([ensure(), ensure(), ensure()]);
    expect(gen).toHaveBeenCalledTimes(1);
    expect(idb.kv(REC).pub).toBe(JSON.parse(store.getItem(LS_PUB)));
    expect(K._cryptoKeys).toBeTruthy();
  });
});

describe('F36 — la clé quitte l\'appareil avec le compte', () => {
  it('déconnexion → CryptoKey ET ombre en clair effacées d\'IndexedDB avant le rechargement', async () => {
    const store = makeLocalStorage(); const idb = makeIDB(); const pair = await legacyPair();
    store.setItem(LS_PUB, lsJson(pair.pub));
    const ne = await crypto.subtle.importKey('jwk', JSON.parse(atob(pair.priv)), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    idb.seed(REC, { v: 1, priv: ne, pub: pair.pub });
    idb.seed('crypto_priv', pair.priv);
    const { K, location } = sandbox({ localStorage: store, indexedDB: idb });
    K._cryptoKeys = { privateKey: ne };
    K.logout();
    await vi.waitFor(() => expect(location.reload).toHaveBeenCalled());
    expect(idb.kv(REC)).toBeUndefined();
    expect(idb.kv('crypto_priv')).toBeUndefined();
    expect(store.getItem(LS_PUB)).toBeNull();
    expect(K._cryptoKeys).toBeNull();
  });

  it('suppression du compte → CryptoKey effacée même si la base reste « bloquée » par un autre onglet', async () => {
    const store = makeLocalStorage(); const idb = makeIDB(); const pair = await legacyPair();
    const ne = await crypto.subtle.importKey('jwk', JSON.parse(atob(pair.priv)), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    idb.seed(REC, { v: 1, priv: ne, pub: pair.pub });
    const extraK = {
      token: 'jwt-test',
      _closeModal: () => {},
      _humanError: (e) => String(e && e.message),
      _wipeLocalDatabases: vi.fn(async () => ({ deleted: [], blocked: ['apex_chat_idb'] })),
    };
    const toast = vi.fn();
    const { K } = sandbox({
      localStorage: store, indexedDB: idb, extraK,
      extra: {
        $: () => ({ value: 'SUPPRIMER' }), toast, API_BASE: 'https://api.test',
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
        setTimeout: () => 0,
      },
    });
    await K._deleteMyAccountGo();
    expect(extraK._wipeLocalDatabases).toHaveBeenCalled();
    expect(idb.kv(REC)).toBeUndefined();
    expect(K._cryptoKeys).toBeNull();
  });
});

describe('F36 — clé wrappée par PIN (code dormant) : le clair est vraiment effacé', () => {
  it('K._migrateKeyToPin retire « apex_chat_crypto_priv » (avant : removeItem(\'crypto_priv\') sans préfixe = rien)', async () => {
    const store = makeLocalStorage(); const idb = makeIDB(); const pair = await legacyPair();
    store.setItem(LS_PRIV, lsJson(pair.priv));
    idb.seed('crypto_priv', pair.priv);
    const vault = { wrapPrivKey: vi.fn(async () => ({ ct: 'ct', salt: 'salt', v: 1 })) };
    const { K } = sandbox({ localStorage: store, indexedDB: idb, apexVault: vault });
    await K._migrateKeyToPin('1234');
    expect(vault.wrapPrivKey).toHaveBeenCalled();
    expect(store.getItem(LS_PRIV)).toBeNull();
    expect(idb.kv('crypto_priv')).toBeUndefined();
    expect(JSON.parse(store.getItem('apex_chat_crypto_priv_wrapped')).ct).toBe('ct');
  });
});
