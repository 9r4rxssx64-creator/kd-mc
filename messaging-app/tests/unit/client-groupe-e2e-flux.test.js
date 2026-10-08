// @vitest-environment node
// Garde E2E de GROUPE (v1.1.296) — le VRAI code client (index.html, extrait par
// client-extract.js) tourne pour PLUSIEURS membres simulés, chacun avec sa clé
// d'identité, son localStorage, son IndexedDB (cale en mémoire qui CLONE comme un
// navigateur), reliés par un faux serveur qui se comporte comme le ConversationDO
// (diffusion aux AUTRES membres, historique, liste des membres, bundles de clés).
// Crypto RÉELLE (lib/crypto-core.js, WebCrypto de Node).
//
// Prouve : 3 membres échangent et se lisent ; un membre retiré ne lit plus rien après
// la rotation ; IV jamais réutilisé ; clé manquante → « clé de groupe pas encore reçue »
// + demande, puis lecture ; membre sans clé → chemin honnête « en transit », jamais de
// clair silencieux quand l'E2E est revendiqué ; membre à clé changée non acceptée exclu ;
// trames de contrôle jamais affichées ; clés stockées NON extractibles ; DM inchangé.
//
// Discriminant (sabotage d'une copie d'index.html via CLIENT_INDEX_PATH, et de
// lib/crypto-core.js via CLIENT_CRYPTO_PATH) : chaque comportement retiré fait échouer son test.
import { describe, it, expect, beforeEach } from 'vitest';
import { pathToFileURL } from 'node:url';
import { readIndex, extractDef, realEsc } from './client-extract.js';

const CC = await import(process.env.CLIENT_CRYPTO_PATH
  ? pathToFileURL(process.env.CLIENT_CRYPTO_PATH).href
  : '../../lib/crypto-core.js');

const CONV = 'g1';
const MISSING = '🔒 clé de groupe pas encore reçue';

const DEFS = [
  { m: 'async function idbOpen(){', end: '\n}' },
  'K._e2eOn = function(){',
  'K._E2E_TAG = ',
  'K._RATCHET_TAG = ',
  'K._ratchetOn = function(){',
  'K._convIsDm = function(conv){',
  'K._e2eAppliesTo = function(conv){',
  'K._GROUP_E2E_NOTICE = ',
  'K._e2eActive = function(conv){',
  'K._notifyKeyChange = function(conv){',
  'K._pinnedPeerKey = function(convId){',
  'K._pendingPeerKey = function(convId){',
  'K._keyChangePending = function(conv){',
  'K._tofuPeerKey = function(conv, freshPub){',
  'K._renderKeyChangeBanner = function(conv){',
  'K._ensureSession = async function(conv, force){',
  'K._healFetchAt = ',
  'K._decryptE2EHeal = async function(convId, ct){',
  'K._sendRefreshAt = ',
  'K._ensureFreshSession = async function(conv){',
  'K._encryptOutgoing = async function(conv, plaintext){',
  'K._dispatchWire = function(convId, wire){',
  'K._sendSecure = async function(conv, plaintext, opts){',
  'K._pendingToastText = function(conv){',
  'K._sendMsg = async function(){',
  'K._queuePendingEncrypt = function(item){',
  'K._flushPendingEncrypt = async function(convId){',
  'K._outboxAdd = function(item){',
  'K._locationUpdateAllowed = function(conv){',
  'K._parseLocationMarker = function(txt){',
  'K._parseContactMarker = function(txt){',
  'K._parsePollMarker = function(txt){',
  'K._parseMediaMarker = function(txt){',
  'K._decodeIncoming = async function(convId, raw){',
  'K._markerFields = function(txt){',
  'K._chatHeaderSubtitle = function(conv){',
  'K._CRYPTO_CAPS = ',
  { m: 'async function _handleWsMessage(data, convId){', end: '\n}\n' },
];

// Le bloc « E2E de groupe » entier (de sa 1ʳᵉ définition à la suivante hors bloc).
function groupBlock(html) {
  const a = html.indexOf('K._GRP_TAG = ');
  const b = html.indexOf('// Étape A E2E : migre une clé privée stockée EN CLAIR');
  if (a < 0 || b < 0 || b < a) throw new Error('bloc E2E de groupe introuvable');
  return html.slice(a, b);
}

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}

function makeIDB() {
  const dbs = new Map();
  const later = (fn) => setTimeout(fn, 0);
  return {
    open(name) {
      const req = {};
      later(() => {
        const isNew = !dbs.has(name);
        if (isNew) dbs.set(name, new Map());
        const stores = dbs.get(name);
        const db = {
          objectStoreNames: { contains: (s) => stores.has(s) },
          createObjectStore: (s) => { stores.set(s, new Map()); },
          close() {},
          transaction() {
            const tx = {};
            later(() => tx.oncomplete && tx.oncomplete());
            tx.objectStore = (s) => {
              const st = stores.get(s);
              return {
                put(v, k) { st.set(k, structuredClone(v)); return {}; },
                get(k) { const rq = {}; later(() => { rq.result = st.has(k) ? structuredClone(st.get(k)) : undefined; rq.onsuccess && rq.onsuccess(); }); return rq; },
                delete(k) { st.delete(k); return {}; },
              };
            };
            return tx;
          },
        };
        req.result = db;
        if (isNew) req.onupgradeneeded && req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      });
      return req;
    },
    kv(key) { const d = dbs.get('apex_chat_idb'); return d && d.get('kv') ? d.get('kv').get(key) : undefined; },
    keys() { const d = dbs.get('apex_chat_idb'); return d && d.get('kv') ? [...d.get('kv').keys()] : []; },
  };
}

// ---------------------------------------------------------------------------
//  Faux serveur (comportement du ConversationDO + routes /members et /bundle)
// ---------------------------------------------------------------------------
function makeServer() {
  const srv = {
    members: [], keys: {}, caps: {}, history: [], queue: [], clients: {}, seq: 0,
    drop: () => false,          // (frame, to) → true = trame non livrée à `to`
    leakTo: new Set(),          // membres RETIRÉS à qui un serveur malveillant relaie quand même
    membersDown: false,
    frames: [],                 // tout ce qui a été envoyé par un client (journal)
    api(uid, method, path) {
      if (method === 'GET' && path === '/api/conversations/' + CONV + '/members') {
        if (srv.membersDown) throw new Error('réseau');
        if (!srv.members.includes(uid)) return { ok: false, error: 'Pas membre' };
        return { ok: true, members: srv.members.map((u) => ({ user_id: u, role: 'member' })) };
      }
      const m = path.match(/^\/api\/keys\/([^/]+)\/bundle$/);
      if (method === 'GET' && m) {
        const who = decodeURIComponent(m[1]);
        if (!srv.keys[who]) throw new Error('409 key_pending');
        return { ok: true, bundle: { user_id: who, identity_key_pub: srv.keys[who], crypto_caps: srv.caps[who] ?? 'media,grp1' } };
      }
      return { ok: false };
    },
    receive(uid, frame) {
      srv.frames.push({ from: uid, ...frame });
      if (frame.type === 'message') {
        const rec = { type: 'message', id: 'srv_' + (++srv.seq), conv_id: CONV, sender_id: uid, ciphertext: frame.ciphertext, mime: frame.mime, ts: frame.ts || Date.now() };
        srv.history.push(rec);
        for (const to of Object.keys(srv.clients)) {
          if (to === uid) continue;                        // le DO ne renvoie pas à l'expéditeur
          if (!srv.members.includes(to) && !srv.leakTo.has(to)) continue;
          if (srv.drop(rec, to)) continue;
          srv.queue.push({ to, data: rec });
        }
      } else if (frame.type === 'edit_message') {
        for (const to of Object.keys(srv.clients)) {
          if (!srv.members.includes(to) && !srv.leakTo.has(to)) continue;
          srv.queue.push({ to, data: { type: 'edit_message', message_id: frame.message_id, ciphertext: frame.ciphertext ?? null, new_text: frame.new_text ?? null, edited_at: frame.edited_at, userId: uid, ts: Date.now() } });
        }
      }
    },
    async drain() {
      let guard = 0;
      while (srv.queue.length) {
        if (++guard > 500) throw new Error('boucle de messages');
        const { to, data } = srv.queue.shift();
        await srv.clients[to].handle(data, CONV);
      }
    },
  };
  return srv;
}

// ---------------------------------------------------------------------------
//  Un membre = un vrai client (code extrait d'index.html) avec ses propres stockages
// ---------------------------------------------------------------------------
async function makeMember(srv, uid, { identity, idb, localStorage, publish = true } = {}) {
  const keys = identity || await CC.generateIdentityKeys();
  const pub = await CC.exportPublicKey(keys.publicKey);
  if (publish) srv.keys[uid] = pub;
  const store = {};
  const ls = (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); };
  const lg = (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d);
  const toasts = [];
  const errors = [];
  const input = { value: '' };
  const conv = { id: CONV, type: 'group', name: 'Équipe', member_count: 3 };
  const K = {
    user: { id: uid }, messages: {}, conversations: [conv], viewData: conv, view: 'chats',
    _E2E_ENABLED: true, token: 'tok', _cryptoKeys: keys,
    _wsConvId: CONV,
    render() {}, _closeModal() {}, _clearDraft() {}, _renderReplyBanner() {},
    _presenceLabel: () => 'LIBELLE-DM', _isDeletedLocal: () => false, _notifyIncoming() {},
    _appendBubble: () => true, _applyWsAck() {},
  };
  K.ws = { readyState: 1, send: (s) => srv.receive(uid, JSON.parse(s)) };
  K._api = async (method, path) => srv.api(uid, method, path);
  const ApexCrypto = { ...CC };
  const ls2 = localStorage || memStorage();
  const db = idb || makeIDB();
  const g = {
    K, window: { ApexCrypto }, ApexCrypto, localStorage: ls2, indexedDB: db, _idb: null, _idbWiping: false,
    WebSocket: { OPEN: 1 }, toast: (m) => toasts.push(String(m)), ls, lg,
    _safeCatch: (tag, e) => errors.push(tag + ': ' + (e && e.message)), esc: realEsc(),
    console: { log() {}, warn() {}, error() {} }, _ensureCryptoKeys: async () => {}, _logTelemetry() {},
    $: () => input, document: { getElementById: () => null, querySelectorAll: () => [] },
    kcall: (name, args) => `data-kcall="${name}:${JSON.stringify(args).replace(/"/g, '&quot;')}"`,
  };
  const html = readIndex();
  const src = DEFS.map((d) => extractDef(html, d)).join('\n') + '\n' + groupBlock(html);
  const names = Object.keys(g);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, `${src}\n;return { handle: _handleWsMessage };`);
  const { handle } = fn(...names.map((n) => g[n]));
  const m = {
    uid, K, conv, pub, keys, store, toasts, errors, input, idb: db, localStorage: ls2, ApexCrypto, handle,
    async send(text) { input.value = text; await K._sendMsg(); },
    shown() { return (K.messages[CONV] || []).map((x) => x.text); },
    header() { return K._chatHeaderSubtitle(conv); },
  };
  srv.clients[uid] = m;
  return m;
}

const lastFrames = (srv, from) => srv.frames.filter((f) => f.from === from && f.type === 'message');
const parse = (w) => CC.parseGroupWire(w);

async function trio() {
  const srv = makeServer();
  srv.members = ['alice', 'bob', 'carol'];
  const A = await makeMember(srv, 'alice');
  const B = await makeMember(srv, 'bob');
  const C = await makeMember(srv, 'carol');
  return { srv, A, B, C };
}

// ---------------------------------------------------------------------------
describe('1. trois membres échangent et se lisent (E2E de groupe réel)', () => {
  it('1a. A envoie : distribution emballée puis E2EG1 ; B et C lisent ; rien en clair sur le serveur', async () => {
    const { srv, A, B, C } = await trio();
    await A.send('bonjour le groupe');
    const fa = lastFrames(srv, 'alice');
    expect(fa).toHaveLength(2);
    expect(fa[0].ciphertext.startsWith('E2EGK1:')).toBe(true);
    expect(fa[0].mime).toBe('application/x-apex-grpkey');
    expect(parse(fa[0].ciphertext).body.keys.map((e) => e.to).sort()).toEqual(['bob', 'carol']);
    expect(fa[1].ciphertext.startsWith('E2EG1:')).toBe(true);
    expect(JSON.stringify(srv.frames)).not.toContain('bonjour le groupe');
    expect(A.K.messages[CONV][0]).toMatchObject({ text: 'bonjour le groupe', encrypted: true });
    await srv.drain();
    expect(B.shown()).toEqual(['bonjour le groupe']);      // la distribution n'est JAMAIS affichée
    expect(C.shown()).toEqual(['bonjour le groupe']);
    expect(B.K.messages[CONV][0]).toMatchObject({ from: 'alice', encrypted: true });
    expect(B.K.messages[CONV][0].unencrypted).toBeUndefined();

    await B.send('salut Alice');
    await srv.drain();
    await C.send('coucou tous les deux');
    await srv.drain();
    expect(A.shown()).toEqual(['bonjour le groupe', 'salut Alice', 'coucou tous les deux']);
    expect(B.shown()).toEqual(['bonjour le groupe', 'salut Alice', 'coucou tous les deux']);
    expect(C.shown()).toEqual(['bonjour le groupe', 'salut Alice', 'coucou tous les deux']);
    for (const msg of [...A.K.messages[CONV], ...B.K.messages[CONV], ...C.K.messages[CONV]]) expect(msg.encrypted).toBe(true);
    expect(JSON.stringify(srv.frames)).not.toMatch(/salut Alice|coucou tous/);
    expect([...A.errors, ...B.errors, ...C.errors]).toEqual([]);
  });

  it('1b. en-tête : « 🔒 Groupe chiffré de bout en bout » dès que tous les membres ont une clé', async () => {
    const { srv, A } = await trio();
    expect(A.header()).toContain('pas de bout en bout');           // rien de vérifié encore → honnête
    await A.K._grpPrepare(A.conv, { check: true });
    expect(A.header()).toContain('🔒 Groupe chiffré de bout en bout');
    expect(A.header()).not.toContain('pas de bout en bout');
    expect(lastFrames(srv, 'alice')).toHaveLength(0);               // la vérification seule n'envoie rien
  });

  it('1c. clés reçues rangées en IndexedDB comme CryptoKey NON extractibles ; ma clé scellée', async () => {
    const { srv, A, B } = await trio();
    await A.send('x');
    await srv.drain();
    const own = A.idb.kv('gown|' + CONV);
    expect(own.key.extractable).toBe(false);
    expect(own.sealed.ct).toBeInstanceOf(Uint8Array);
    expect(A.idb.kv('grp_kek').kek.extractable).toBe(false);
    const k = B.idb.keys().find((x) => x.startsWith('gsk|' + CONV + '|alice|'));
    expect(k).toBeTruthy();
    const rec = B.idb.kv(k);
    expect(rec.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', rec.key)).rejects.toThrow();
    // aucune clé de groupe dans localStorage
    expect([...B.localStorage._m.keys()].some((x) => /gsk|gown|kek/.test(x))).toBe(false);
  });

  it('1d. rechargement : un nouvel onglet (même IndexedDB) relit l\'historique chiffré', async () => {
    const { srv, A, B } = await trio();
    await A.send('avant rechargement');
    await srv.drain();
    const B2 = await makeMember(srv, 'bob', { identity: B.keys, idb: B.idb, localStorage: B.localStorage });
    await B2.handle({ type: 'history', messages: srv.history.map((r) => ({ ...r })) }, CONV);
    expect(B2.shown()).toEqual(['avant rechargement']);
    expect(B2.K.messages[CONV][0].encrypted).toBe(true);
  });

  it('1e. historique : les trames de contrôle n\'apparaissent jamais ; mes propres messages se relisent', async () => {
    const { srv, A, B } = await trio();
    await A.send('un');
    await srv.drain();
    await B.send('deux');
    await srv.drain();
    const A2 = await makeMember(srv, 'alice', { identity: A.keys, idb: A.idb, localStorage: A.localStorage });
    await A2.handle({ type: 'history', messages: srv.history.map((r) => ({ ...r })) }, CONV);
    expect(A2.shown()).toEqual(['un', 'deux']);
    expect(A2.shown().join(' ')).not.toMatch(/E2EG/);
  });
});

// ---------------------------------------------------------------------------
describe('2. rotation : un membre retiré ne lit plus rien', () => {
  it('2a. C retiré → nouvelle époque distribuée à B seul ; C (même relayé) ne lit pas, sa demande est ignorée', async () => {
    const { srv, A, B, C } = await trio();
    await A.send('avant retrait');
    await srv.drain();
    expect(C.shown()).toEqual(['avant retrait']);
    const ep1 = parse(lastFrames(srv, 'alice')[1].ciphertext).body.epoch;

    srv.members = ['alice', 'bob'];          // C retiré
    srv.leakTo.add('carol');                 // …mais un serveur malveillant lui relaie encore tout
    A.K._grpMembersCache = {};               // liste des membres rafraîchie (au plus 20 s)
    const before = srv.frames.length;
    await A.send('après retrait');
    const fresh = srv.frames.slice(before);
    const dist = fresh.filter((f) => f.ciphertext.startsWith('E2EGK1:'));
    expect(dist).toHaveLength(1);
    const body = parse(dist[0].ciphertext).body;
    expect(body.epoch).toBe(ep1 + 1);
    expect(body.keys.map((e) => e.to)).toEqual(['bob']);
    await srv.drain();
    expect(B.shown()).toEqual(['avant retrait', 'après retrait']);
    expect(C.shown()).toEqual(['avant retrait', MISSING]);
    expect(C.shown().join(' ')).not.toContain('après retrait');
    // C a demandé la clé ; A ne la lui a PAS envoyée
    expect(srv.frames.some((f) => f.from === 'carol' && f.ciphertext.startsWith('E2EGR1:'))).toBe(true);
    const later = srv.frames.slice(before).filter((f) => f.from === 'alice' && f.ciphertext.startsWith('E2EGK1:'));
    expect(later.flatMap((f) => parse(f.ciphertext).body.keys.map((e) => e.to))).not.toContain('carol');
    // aucune clé d'époque 2 chez C
    expect(C.idb.keys().filter((k) => k.startsWith('gsk|' + CONV + '|alice|' + (ep1 + 1) + '|'))).toEqual([]);
  });

  it('2b. membre ajouté → nouvelle époque aussi (il ne reçoit pas l\'ancienne clé)', async () => {
    const { srv, A } = await trio();
    await A.send('m1');
    await srv.drain();
    srv.members = ['alice', 'bob', 'carol', 'dave'];
    const D = await makeMember(srv, 'dave');
    A.K._grpMembersCache = {};
    const before = srv.frames.length;
    await A.send('m2');
    const dist = srv.frames.slice(before).filter((f) => f.ciphertext.startsWith('E2EGK1:'));
    expect(dist).toHaveLength(1);
    expect(parse(dist[0].ciphertext).body.epoch).toBe(2);
    expect(parse(dist[0].ciphertext).body.keys.map((e) => e.to).sort()).toEqual(['bob', 'carol', 'dave']);
    await srv.drain();
    expect(D.shown()).toEqual(['m2']);
  });
});

// ---------------------------------------------------------------------------
describe('3. IV jamais réutilisé', () => {
  it('3a. 200 messages d\'un même membre : 200 IV distincts', async () => {
    const { srv, A } = await trio();
    const ivs = new Set();
    for (let i = 0; i < 200; i++) {
      const d = await A.K._encryptOutgoing(A.conv, 'même texte');
      expect(d.mode).toBe('cipher');
      ivs.add(parse(d.wire).body.iv);
    }
    expect(ivs.size).toBe(200);
    expect(lastFrames(srv, 'alice').filter((f) => f.ciphertext.startsWith('E2EGK1:'))).toHaveLength(1); // une seule distribution
  });
});

// ---------------------------------------------------------------------------
describe('4. clé manquante → mention propre + demande, puis lecture', () => {
  it('4a. distribution perdue : « clé de groupe pas encore reçue », demande E2EGR1, A redistribue, B lit', async () => {
    const { srv, A, B } = await trio();
    srv.drop = (rec, to) => to === 'bob' && rec.ciphertext.startsWith('E2EGK1:') && rec.sender_id === 'alice' && !srv.__redistributed;
    await A.send('message important');
    srv.__redistributed = true;
    // première livraison seulement (pas encore de réponse)
    const first = srv.queue.filter((q) => q.to === 'bob');
    srv.queue = srv.queue.filter((q) => q.to !== 'bob');
    for (const q of first) await B.handle(q.data, CONV);
    expect(B.shown()).toEqual([MISSING]);
    expect(B.shown().join('')).not.toMatch(/E2EG|message important/);
    const req = srv.frames.filter((f) => f.from === 'bob' && f.ciphertext.startsWith('E2EGR1:'));
    expect(req).toHaveLength(1);
    expect(req[0].mime).toBe('application/x-apex-grpkey');
    expect(parse(req[0].ciphertext).body).toMatchObject({ from: 'bob', sender: 'alice', epoch: 1 });
    await srv.drain();                       // A reçoit la demande → redistribue à B seul → B relit
    const re = srv.frames.filter((f) => f.from === 'alice' && f.ciphertext.startsWith('E2EGK1:'));
    expect(re).toHaveLength(2);
    expect(parse(re[1].ciphertext).body.keys.map((e) => e.to)).toEqual(['bob']);
    expect(B.shown()).toEqual(['message important']);
    expect(B.K.messages[CONV][0].encrypted).toBe(true);
    expect(B.K.messages[CONV][0].grp_pending).toBeUndefined();
  });

  it('4b. demandes bornées : la même clé manquante n\'est redemandée qu\'une fois par minute', async () => {
    const { srv, A, B } = await trio();
    srv.drop = (rec, to) => to === 'bob' && rec.ciphertext.startsWith('E2EGK1:');
    await A.send('a'); await A.send('b'); await A.send('c');
    const mine = srv.queue.filter((q) => q.to === 'bob');
    srv.queue = [];
    for (const q of mine) await B.handle(q.data, CONV);
    expect(B.shown()).toEqual([MISSING, MISSING, MISSING]);
    expect(srv.frames.filter((f) => f.from === 'bob' && f.ciphertext.startsWith('E2EGR1:'))).toHaveLength(1);
  });

  it('4c. une demande rejouée par l\'historique n\'est traitée qu\'une fois', async () => {
    const { srv, A, B } = await trio();
    srv.drop = (rec, to) => to === 'bob' && rec.ciphertext.startsWith('E2EGK1:');
    await A.send('a');
    const mine = srv.queue.filter((q) => q.to === 'bob');
    srv.queue = [];
    for (const q of mine) await B.handle(q.data, CONV);
    srv.queue = [];
    const hist = srv.history.map((r) => ({ ...r }));
    A.K._grpAnsAt = {};                       // même hors fenêtre anti-rafale
    await A.handle({ type: 'history', messages: hist }, CONV);
    A.K._grpAnsAt = {};
    await A.handle({ type: 'history', messages: hist }, CONV);
    const redist = srv.frames.filter((f) => f.from === 'alice' && f.ciphertext.startsWith('E2EGK1:'));
    expect(redist).toHaveLength(2);           // la distribution d'origine + UNE seule réponse
  });

  it('4d. message réattribué par le serveur à un autre membre → jamais lu comme venant de lui', async () => {
    const { srv, A, B, C } = await trio();
    await A.send('de la part d\'Alice');
    await srv.drain();
    await B.send('init bob');                 // C a la clé de Bob
    await srv.drain();
    const forged = { ...srv.history.find((r) => r.sender_id === 'alice' && r.ciphertext.startsWith('E2EG1:')), id: 'forge', sender_id: 'bob' };
    await C.handle(forged, CONV);
    const last = C.K.messages[CONV].find((x) => x.id === 'forge');
    expect(last.text).not.toBe('de la part d\'Alice');
    expect(last.encrypted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('5. membre sans clé : chemin honnête, jamais de clair silencieux quand l\'E2E est revendiqué', () => {
  it('5a. un membre n\'a pas publié de clé → « en transit » assumé, en-tête honnête, aucune distribution', async () => {
    const srv = makeServer();
    srv.members = ['alice', 'bob', 'carol'];
    const A = await makeMember(srv, 'alice');
    await makeMember(srv, 'bob');
    await makeMember(srv, 'carol', { publish: false });
    await A.send('bonjour');
    const fa = lastFrames(srv, 'alice');
    expect(fa).toHaveLength(1);
    expect(fa[0].ciphertext).toBe('bonjour');
    expect(A.K.messages[CONV][0].encrypted).toBe(false);
    expect(A.header()).toContain('pas de bout en bout');
    expect(A.header()).not.toContain('Groupe chiffré de bout en bout');
    expect(A.toasts.join(' ')).toMatch(/en transit seulement/);
    expect(A.K._grpState[CONV].missing).toEqual(['carol']);
    // Carol publie sa clé → le message suivant part chiffré et l'en-tête le dit
    srv.keys.carol = srv.clients.carol.pub;
    A.K._grpBundleCache = {};
    await A.send('maintenant chiffré');
    const f2 = lastFrames(srv, 'alice').slice(1);
    expect(f2.map((f) => f.ciphertext.slice(0, 7))).toEqual(['E2EGK1:', 'E2EG1:e']);
    expect(A.header()).toContain('🔒 Groupe chiffré de bout en bout');
    await srv.drain();
    expect(srv.clients.carol.shown()).toEqual(['bonjour', 'maintenant chiffré']);
  });

  it('5b. appli trop ancienne (pas de capacité « grp1 ») → chemin honnête (elle verrait du charabia sinon)', async () => {
    const srv = makeServer();
    srv.members = ['alice', 'bob'];
    const A = await makeMember(srv, 'alice');
    await makeMember(srv, 'bob');
    srv.caps.bob = 'media';
    await A.send('hello');
    expect(lastFrames(srv, 'alice').map((f) => f.ciphertext)).toEqual(['hello']);
    expect(A.K._grpState[CONV]).toMatchObject({ ready: false, reason: 'member_without_key', missing: ['bob'] });
  });

  it('5c. groupe déjà chiffré, chiffrement en échec → EN ATTENTE, rien en clair', async () => {
    const { srv, A } = await trio();
    await A.send('premier');
    A.ApexCrypto.groupEncrypt = async () => { throw new Error('panne'); };
    const before = srv.frames.length;
    await A.send('ne doit jamais partir en clair');
    expect(srv.frames.slice(before)).toEqual([]);
    const m = A.K.messages[CONV].at(-1);
    expect(m.pending_encrypt).toBe(true);
    expect(A.store.pending_encrypt).toEqual([expect.objectContaining({ text: 'ne doit jamais partir en clair', grp_e2e: true })]);
    expect(A.toasts.at(-1)).toMatch(/rien n'est envoyé en clair/);
  });

  it('5d. groupe déjà chiffré, liste des membres injoignable → EN ATTENTE (pas de repli clair)', async () => {
    const { srv, A } = await trio();
    await A.send('premier');
    A.K._grpMembersCache = {};
    srv.membersDown = true;
    const before = srv.frames.length;
    const d = await A.K._encryptOutgoing(A.conv, 'secret');
    expect(d.mode).toBe('pending');
    expect(srv.frames.length).toBe(before);
    // la file ne le relâche PAS en clair si, entre-temps, un membre sans clé arrive
    await A.K._sendSecure(A.conv, 'secret 2', { id: 'p1', ts: 1 });
    srv.membersDown = false;
    srv.members = ['alice', 'bob', 'carol', 'eve'];  // eve : aucune clé publiée
    A.K._grpMembersCache = {};
    await A.K._flushPendingEncrypt(CONV);
    expect(srv.frames.slice(before).some((f) => /secret/.test(f.ciphertext))).toBe(false);
    expect(A.store.pending_encrypt.map((x) => x.id)).toEqual(['p1']);
  });

  it('5e. la file envoie chiffré dès que le groupe redevient prêt', async () => {
    const { srv, A, B } = await trio();
    await A.send('premier');
    await srv.drain();
    A.K._grpMembersCache = {};
    srv.membersDown = true;
    await A.K._sendSecure(A.conv, 'en attente', { id: 'p2', ts: 2 });
    srv.membersDown = false;
    await A.K._flushPendingEncrypt(CONV);
    expect(A.store.pending_encrypt).toEqual([]);
    await srv.drain();
    expect(B.shown()).toEqual(['premier', 'en attente']);
  });

  it('5f. un clair reçu dans un groupe chiffré de bout en bout est marqué « non chiffré »', async () => {
    const { srv, B } = await trio();
    await B.K._grpPrepare(B.conv, { check: true });
    await B.handle({ type: 'message', id: 'x1', sender_id: 'alice', ciphertext: 'texte injecté', ts: 1 }, CONV);
    expect(B.K.messages[CONV][0]).toMatchObject({ text: 'texte injecté', unencrypted: true, encrypted: false });
  });
});

// ---------------------------------------------------------------------------
describe('6. TOFU par membre : une clé changée non acceptée ne reçoit pas la clé du groupe', () => {
  it('6a. clé de B substituée → distribution sans B, bandeau, l\'imposteur ne déballe rien ; accepter → B la reçoit', async () => {
    const { srv, A, B, C } = await trio();
    await A.K._grpPrepare(A.conv, { check: true });            // 1ʳᵉ vue : clés épinglées
    expect(A.localStorage.getItem('gpeerkey_bob')).toBe(B.pub);
    const mallory = await CC.generateIdentityKeys();
    srv.keys.bob = await CC.exportPublicKey(mallory.publicKey); // le serveur substitue la clé de Bob
    A.K._grpBundleCache = {};
    await A.send('confidentiel');
    const dist = lastFrames(srv, 'alice').filter((f) => f.ciphertext.startsWith('E2EGK1:'));
    expect(dist).toHaveLength(1);
    expect(parse(dist[0].ciphertext).body.keys.map((e) => e.to)).toEqual(['carol']);
    expect(A.header()).toMatch(/1 clé à vérifier/);
    const banner = A.K._grpRenderKeyBanner(A.conv);
    expect(banner).toContain('a changé');
    expect(banner).toContain('_grpAcceptMemberKey');
    // le bouton passe par la délégation data-kcall : la fonction doit y être autorisée
    expect(extractDef(readIndex(), { m: 'K._KCALL_ALLOWED = new Set([', end: '\n]);' })).toContain("'_grpAcceptMemberKey'");
    expect(lastFrames(srv, 'alice').some((f) => f.ciphertext === 'confidentiel')).toBe(false); // jamais de repli clair
    await srv.drain();
    expect(C.shown()).toEqual(['confidentiel']);
    expect(B.shown()).toEqual([MISSING]);
    // Bob (vrai) redemande : A refuse tant que la nouvelle clé n'est pas acceptée
    expect(lastFrames(srv, 'alice').filter((f) => f.ciphertext.startsWith('E2EGK1:'))).toHaveLength(1);
    // A vérifie et accepte la NOUVELLE clé → au prochain message, distribution vers elle
    srv.keys.bob = B.pub;                    // (ici la « nouvelle » clé légitime est la vraie de Bob)
    A.localStorage.setItem('gpeerkey_pending_bob', B.pub);
    expect(await A.K._grpAcceptMemberKey('bob')).toBe(true);
    A.K._grpBundleCache = {};
    await A.send('bienvenue Bob');
    const d2 = lastFrames(srv, 'alice').filter((f) => f.ciphertext.startsWith('E2EGK1:'));
    expect(parse(d2.at(-1).ciphertext).body.keys.map((e) => e.to)).toEqual(['bob']);
    await srv.drain();
    expect(B.shown().at(-1)).toBe('bienvenue Bob');
  });
});

// ---------------------------------------------------------------------------
describe('7. le reste ne régresse pas', () => {
  it('7a. DM : toujours E2E1 1:1, lisible par le pair (aucun chemin de groupe)', async () => {
    const srv = makeServer();
    srv.members = ['alice', 'bob'];
    const A = await makeMember(srv, 'alice');
    const peer = await CC.generateIdentityKeys();
    const peerPub = await CC.exportPublicKey(peer.publicKey);
    const dm = { id: 'dm1', type: 'dm', peer_id: 'bob', peer_pubkey: peerPub };
    A.K.conversations.push(dm);
    const d = await A.K._encryptOutgoing(dm, 'secret DM');
    expect(d.mode).toBe('cipher');
    expect(d.wire.startsWith('E2E1:')).toBe(true);
    await CC.establishSession('peer-dm1', peer.privateKey, await CC.importPublicKey(A.pub));
    expect(await CC.decryptForConv('peer-dm1', d.wire.slice(5))).toBe('secret DM');
    expect(A.K._chatHeaderSubtitle(dm)).toBe('LIBELLE-DM');
    expect(A.idb.keys().filter((k) => k.startsWith('gsk|') || k.startsWith('gown|'))).toEqual([]);
  });

  it('7b. E2E coupé sur l\'appareil (opt-out) : groupe en transit comme avant, aucune trame de groupe', async () => {
    const { srv, A } = await trio();
    A.localStorage.setItem('apex_chat_e2e', '0');
    await A.send('clair assumé');
    expect(lastFrames(srv, 'alice').map((f) => f.ciphertext)).toEqual(['clair assumé']);
  });

  it('7c. position live : refusée en clair dans un groupe chiffré de bout en bout', async () => {
    const { A } = await trio();
    expect(A.K._locationUpdateAllowed(A.conv)).toBe(true);    // pas encore vérifié
    await A.K._grpPrepare(A.conv, { check: true });
    expect(A.K._locationUpdateAllowed(A.conv)).toBe(false);
  });

  it('7d. édition d\'un message de groupe : chiffrée, relue par les autres', async () => {
    const { srv, A, B } = await trio();
    await A.send('version 1');
    await srv.drain();
    const id = B.K.messages[CONV][0].id;
    await A.K._sendSecure(A.conv, 'version 2', { edit: { message_id: id, edited_at: 5 } });
    const ed = srv.frames.at(-1);
    expect(ed.type).toBe('edit_message');
    expect(ed.ciphertext.startsWith('E2EG1:')).toBe(true);
    expect(ed.new_text).toBeUndefined();
    await srv.drain();
    expect(B.shown()).toEqual(['version 2']);
  });

  it('7e. la capacité « grp1 » est publiée (et republiée si la clé l\'avait été sans elle)', async () => {
    const html = readIndex();
    const src = [extractDef(html, 'K._CRYPTO_CAPS = '), extractDef(html, 'K._publishPubkey = async function(){')].join('\n');
    const store = { crypto_pub: 'PUB', crypto_pub_published: 'PUB' };   // publiée par v1.1.295 (caps 'media')
    const calls = [];
    const K = { token: 't', _api: async (m, p, body) => { calls.push(body); return { ok: true }; } };
    // eslint-disable-next-line no-new-func
    new Function('K', 'lg', 'ls', '_logTelemetry', '_safeCatch', src)(
      K, (k, d) => (k in store ? store[k] : d), (k, v) => { store[k] = v; }, () => {}, () => {});
    expect(K._CRYPTO_CAPS.split(',')).toContain('grp1');
    await K._publishPubkey();
    expect(calls).toHaveLength(1);
    expect(calls[0].crypto_caps.split(',')).toContain('grp1');
    await K._publishPubkey();                                              // idempotent ensuite
    expect(calls).toHaveLength(1);
  });
});
