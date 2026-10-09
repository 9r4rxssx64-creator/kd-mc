// Banc d'essai partagé — E2E de GROUPE (v1.1.297).
// Même principe que tests/unit/client-groupe-e2e-flux.test.js (dont il reprend le banc) :
// le VRAI code client (index.html, extrait par client-extract.js) tourne pour PLUSIEURS
// membres simulés, chacun avec sa clé d'identité, son localStorage, son IndexedDB (cale en
// mémoire qui CLONE comme un navigateur), reliés par un faux serveur qui se comporte comme
// le ConversationDO (diffusion aux AUTRES membres, historique, édition, bundles de clés).
// Ajouts v1.1.297 : stockage des pièces jointes (/api/media, ce que R2 voit), bundle portant
// la clé publique de SIGNATURE (champ prekey_signed « GSIG1: », capacité « gsig1 »), et un
// serveur capable de FORGER / REJOUER des trames (sender_id, message_id au choix).
//
// CLIENT_INDEX_PATH (copie sabotée d'index.html) et CLIENT_CRYPTO_PATH (copie sabotée de
// lib/crypto-core.js) sont honorés : c'est ainsi qu'on prouve que chaque test est discriminant.
import { pathToFileURL } from 'node:url';
import { readIndex, extractDef, realEsc } from '../client-extract.js';

export const CC = await import(process.env.CLIENT_CRYPTO_PATH
  ? pathToFileURL(process.env.CLIENT_CRYPTO_PATH).href
  : '../../../lib/crypto-core.js');

export const CONV = 'g1';
export const API_BASE = 'https://api.test';

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
  'K._publishPubkey = async function(){',
  'K._peerSupports = function(conv, cap){',
  'K._mediaE2eOn = function(conv){',
  'K._fmtSize = function(b){',
  'K._MEDIA_STYLE = ',
  'K._decryptBytesHeal = async function(convId, encBuf){',
  'K._renderMediaEl = function(m){',
  'K._hydrateEncMedia = async function(){',
  'K._uploadMedia = async function(file){',
  'K._sendMediaMessage = async function(media, captionOverride){',
  'K._sendVoiceMessage = async function(){',
  { m: 'async function _handleWsMessage(data, convId){', end: '\n}\n' },
];

// Le bloc « E2E de groupe » entier (de sa 1ʳᵉ définition à la suivante hors bloc).
function groupBlock(html) {
  const a = html.indexOf('K._GRP_TAG = ');
  const b = html.indexOf('// Étape A E2E : migre une clé privée stockée EN CLAIR');
  if (a < 0 || b < 0 || b < a) throw new Error('bloc E2E de groupe introuvable');
  return html.slice(a, b);
}

export function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}

export function makeIDB() {
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
//  Faux serveur (ConversationDO + routes /members, /bundle, /api/media)
// ---------------------------------------------------------------------------
export function makeServer() {
  const srv = {
    members: [], keys: {}, caps: {}, sig: {}, history: [], queue: [], clients: {}, seq: 0, posts: [],
    // v1.1.298 — où le serveur range/sert la clé de signature : 'les-deux' (transition), 'colonne'
    // (signing_key_pub seul ; prekey_signed rendu à PQXDH), 'ancien' (serveur v1.1.297 : prekey_signed seul).
    sigField: 'les-deux',
    storage: new Map(),          // ce que R2 stocke : url → octets EXACTS reçus à l'upload
    uploads: [],                 // journal des uploads { ctype, bytes }
    drop: () => false,
    leakTo: new Set(),
    membersDown: false,
    frames: [],
    api(uid, method, path, body) {
      if (method === 'POST' && path === '/api/keys/prekeys') {          // comme handleUploadPrekeys
        srv.posts.push({ uid, body });
        srv.keys[uid] = body.identity_key_pub;
        if (typeof body.crypto_caps === 'string') srv.caps[uid] = body.crypto_caps;
        if (srv.sigField !== 'ancien' && typeof body.signing_key_pub === 'string') srv.sig[uid] = body.signing_key_pub;
        else if (typeof body.prekey_signed === 'string') srv.sig[uid] = body.prekey_signed;   // COALESCE(?, prekey_signed)
        return { ok: true };
      }
      if (method === 'GET' && path === '/api/conversations/' + CONV + '/members') {
        if (srv.membersDown) throw new Error('réseau');
        if (!srv.members.includes(uid)) return { ok: false, error: 'Pas membre' };
        return { ok: true, members: srv.members.map((u) => ({ user_id: u, role: 'member' })) };
      }
      const m = path.match(/^\/api\/keys\/([^/]+)\/bundle$/);
      if (method === 'GET' && m) {
        const who = decodeURIComponent(m[1]);
        if (!srv.keys[who]) throw new Error('409 key_pending');
        const sk = srv.sig[who] ?? null;
        const champs = srv.sigField === 'colonne' ? { signing_key_pub: sk, prekey_signed: 'PQXDH:reserve-au-futur' }
          : srv.sigField === 'ancien' ? { prekey_signed: sk }
          : { signing_key_pub: sk, prekey_signed: sk };
        return { ok: true, bundle: { user_id: who, identity_key_pub: srv.keys[who], ...champs, crypto_caps: srv.caps[who] ?? 'media,grp1' } };
      }
      return { ok: false };
    },
    // Ce que fait R2 / GET /api/media/:id : renvoie les octets tels quels.
    async fetch(url, init) {
      init = init || {};
      if (init.method === 'POST' && url === API_BASE + '/api/media') {
        const bytes = new Uint8Array(await init.body.arrayBuffer());
        const id = 'f' + (srv.storage.size + 1);
        srv.storage.set('/api/media/' + id, bytes);
        srv.uploads.push({ ctype: init.headers['Content-Type'], bytes });
        return { ok: true, status: 200, json: async () => ({ ok: true, url: '/api/media/' + id, name: decodeURIComponent(init.headers['x-file-name']), size: bytes.length }) };
      }
      const path = url.startsWith(API_BASE) ? url.slice(API_BASE.length).split('?')[0] : url.split('?')[0];
      if (srv.storage.has(path)) {
        const b = srv.storage.get(path);
        return { ok: true, status: 200, arrayBuffer: async () => b.slice().buffer };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
    receive(uid, frame) {
      srv.frames.push({ from: uid, ...frame });
      if (frame.type === 'message') {
        const rec = { type: 'message', id: 'srv_' + (++srv.seq), conv_id: CONV, sender_id: uid, ciphertext: frame.ciphertext, mime: frame.mime, ts: frame.ts || Date.now() };
        srv.history.push(rec);
        for (const to of Object.keys(srv.clients)) {
          if (to === uid) continue;
          if (!srv.members.includes(to) && !srv.leakTo.has(to)) continue;
          if (srv.drop(rec, to)) continue;
          srv.queue.push({ to, data: rec });
        }
      } else if (frame.type === 'edit_message') {
        const row = srv.history.find((r) => r.id === frame.message_id && r.sender_id === uid);
        if (row) row.ciphertext = frame.ciphertext ?? frame.new_text;   // comme le DO : la ligne est réécrite
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
// signing : publie AUSSI la clé de signature par le VRAI K._publishPubkey (route /api/keys/prekeys).
// oldApp  : appli sans signature (v1.1.296 : pas de generateSigningKeys) → messages non signés.
export async function makeMember(srv, uid, { identity, idb, localStorage, publish = true, signing = false, oldApp = false, noIdb = false } = {}) {
  const keys = identity || await CC.generateIdentityKeys();
  const pub = await CC.exportPublicKey(keys.publicKey);
  if (publish) srv.keys[uid] = pub;
  const store = {};
  const ls = (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); };
  const lg = (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d);
  const toasts = [];
  const errors = [];
  const input = { value: '' };
  const dom = { els: [] };
  const conv = { id: CONV, type: 'group', name: 'Équipe', member_count: 3 };
  const K = {
    user: { id: uid }, messages: {}, conversations: [conv], viewData: conv, view: 'chats',
    _E2E_ENABLED: true, token: 'tok', _cryptoKeys: keys,
    _wsConvId: CONV,
    render() {}, _closeModal() {}, _clearDraft() {}, _renderReplyBanner() {},
    _presenceLabel: () => 'LIBELLE-DM', _isDeletedLocal: () => false, _notifyIncoming() {},
    _appendBubble: () => true, _applyWsAck() {}, _onMediaLoad() {},
    _mediaSrc: (u) => (typeof u === 'string' && u[0] === '/' ? API_BASE + u : ''),
    _compressMessageImage: async (x) => x, _cancelVoicePreview() {},
  };
  K.ws = { readyState: 1, send: (s) => srv.receive(uid, JSON.parse(s)) };
  K._api = async (method, path, body) => srv.api(uid, method, path, body);
  const ApexCrypto = { ...CC };
  if (oldApp) delete ApexCrypto.generateSigningKeys;
  store.crypto_pub = pub;
  const ls2 = localStorage || memStorage();
  const db = idb || makeIDB();
  const g = {
    K, window: { ApexCrypto }, ApexCrypto, localStorage: ls2, indexedDB: noIdb ? undefined : db, _idb: null, _idbWiping: false,
    WebSocket: { OPEN: 1 }, toast: (msg) => toasts.push(String(msg)), ls, lg,
    _safeCatch: (tag, e) => errors.push(tag + ': ' + (e && e.message)), esc: realEsc(),
    console: { log() {}, warn() {}, error() {} }, _ensureCryptoKeys: async () => {}, _logTelemetry() {},
    $: () => input, document: { getElementById: () => null, querySelectorAll: () => dom.els },
    kcall: (name, args) => `data-kcall="${name}:${JSON.stringify(args).replace(/"/g, '&quot;')}"`,
    API_BASE, fetch: (url, init) => srv.fetch(url, init), Blob, URL,
  };
  const html = readIndex();
  const src = DEFS.map((d) => extractDef(html, d)).join('\n') + '\n' + groupBlock(html);
  const names = Object.keys(g);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, `${src}\n;return { handle: _handleWsMessage };`);
  const { handle } = fn(...names.map((n) => g[n]));
  const m = {
    uid, K, conv, pub, keys, store, toasts, errors, input, idb: db, localStorage: ls2, ApexCrypto, handle, dom,
    async send(text) { input.value = text; await K._sendMsg(); },
    shown() { return (K.messages[CONV] || []).map((x) => x.text); },
    msg(id) { return (K.messages[CONV] || []).find((x) => x.id === id); },
    header() { return K._chatHeaderSubtitle(conv); },
  };
  srv.clients[uid] = m;
  if (signing) await K._publishPubkey();
  return m;
}

export const lastFrames = (srv, from) => srv.frames.filter((f) => f.from === from && f.type === 'message');
export const parse = (w) => CC.parseGroupWire(w);

export async function trio() {
  const srv = makeServer();
  srv.members = ['alice', 'bob', 'carol'];
  const A = await makeMember(srv, 'alice');
  const B = await makeMember(srv, 'bob');
  const C = await makeMember(srv, 'carol');
  return { srv, A, B, C };
}

// Trois membres v1.1.297 qui ont PUBLIÉ leur clé de signature (capacité gsig1).
export async function trioSigned(opts = {}) {
  const srv = makeServer();
  if (opts.sigField) srv.sigField = opts.sigField;
  srv.members = ['alice', 'bob', 'carol'];
  const A = await makeMember(srv, 'alice', { signing: true, ...(opts.alice || {}) });
  const B = await makeMember(srv, 'bob', { signing: true, ...(opts.bob || {}) });
  const C = await makeMember(srv, 'carol', { signing: true, ...(opts.carol || {}) });
  return { srv, A, B, C };
}

// Élément DOM minimal pour K._hydrateEncMedia (attributs + innerHTML).
export function fakeEl(attrs) {
  const a = { ...attrs };
  return {
    getAttribute: (k) => (k in a ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    innerHTML: '', style: {},
    _attrs: a,
  };
}

// Attributs data-* d'un rendu HTML (décodés de esc()).
export function dataAttrs(html) {
  const out = {};
  const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  for (const mm of html.matchAll(/(data-[a-z-]+)="([^"]*)"/g)) out[mm[1]] = unesc(mm[2]);
  return out;
}
