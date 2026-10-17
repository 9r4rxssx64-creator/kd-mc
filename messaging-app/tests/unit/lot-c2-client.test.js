// Lot C2 (audits A4 et A6, 15.10.2026) — côté app : la VRAIE page (index.html), définitions extraites,
// jamais recopiées. Chaque bloc échoue si le correctif est retiré (sabotage via CLIENT_INDEX_PATH).
//  A4 P1-2  muet envoyé au serveur (et renvoyé s'il n'a pas pu partir)
//  A4 P1-3  un seul chemin de rechargement, qui attend la fin de la frappe, d'un appel, d'un envoi
//  A4 P2-1  connexion : le bouton dit ce qui manque ; « Envoi en cours… » ne reste jamais après un échec
//  A4 P2-6  mémoire pleine : la boîte d'envoi n'est jamais tronquée ni vidée en silence
//  A6-09    l'envoi d'un fichier donne sa conversation (le refus du clair sous E2E vient du lot C1, v1.1.304 : vérifié ici aussi)
//  A6-10    métadonnées (GPS…) retirées des photos JPEG/PNG, des GIF et des vidéos MP4/MOV
//  A6-15    position live : seul l'auteur du partage peut déplacer sa position
//  A6-16    statuts 24 h envoyés au serveur, supprimés sur le serveur, ceux des contacts lisibles
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readIndex, extractDef, loadDefs } from './client-extract.js';

const HTML = readIndex();
const def = (m, end) => extractDef(HTML, end ? { m, end } : m);
const FN_END = '\n}\n';
const humanDefs = ['K._HTTP_ERRORS = ', 'K._httpError = function(status){', 'K._humanError = function(e, fallback){'];

// ───────────────────────────────────────────────────────────────────────────── A4 P1-2
describe('A4 P1-2 — le muet part au serveur', () => {
  function sb(apiImpl) {
    const store = {};
    const toasts = [];
    const K = {
      token: 'jwt', conversations: [{ id: 'c 1', name: 'Famille' }], render() {}, _closeModal() {},
      _api: vi.fn(apiImpl),
    };
    const ls = (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); return true; };
    loadDefs(['K._toggleConvMuted = function(convId){', 'K._muteServerState = function(conv){' /* v1.1.306 */, 'K._syncConvMute = async function(conv, silent){', 'K._mergeMuted = function(serverConv, localConv){'],
      { K, ls, toast: (m) => toasts.push(m), _safeCatch() {} });
    return { K, store, toasts };
  }
  it('toucher « muet » envoie PUT /api/conversations/:id/mute {muted:true}, puis {muted:false}', async () => {
    const { K } = sb(async () => ({ ok: true }));
    expect(await K._toggleConvMuted('c 1')).toBe(true);
    expect(K._api).toHaveBeenCalledWith('PUT', '/api/conversations/c%201/mute', { muted: true });
    await K._toggleConvMuted('c 1');
    expect(K._api).toHaveBeenLastCalledWith('PUT', '/api/conversations/c%201/mute', { muted: false });
    expect(K.conversations[0].mute_pending).toBeUndefined();
  });
  it('hors ligne : muet gardé sur le téléphone, marqué « à renvoyer », la personne est prévenue', async () => {
    const { K, toasts, store } = sb(async () => { throw new TypeError('Load failed'); });
    expect(await K._toggleConvMuted('c 1')).toBe(false);
    expect(K.conversations[0]).toMatchObject({ muted: true, mute_pending: true });
    expect(store.conversations[0].mute_pending).toBe(true);
    expect(toasts.join(' ')).toMatch(/gardé sur ce téléphone/);
  });
  it('synchro de la liste : l\'état du serveur l\'emporte, sauf un changement local pas encore envoyé', () => {
    const { K } = sb(async () => ({ ok: true }));
    expect(K._mergeMuted({ muted: true, muted_until: null }, { muted: false })).toEqual({ muted: true, muted_until: null });
    expect(K._mergeMuted({ muted: false }, { muted: true, mute_pending: true })).toEqual({ muted: true, mute_pending: true });
    expect(K._mergeMuted({}, { muted: true })).toEqual({ muted: true });   // ancien serveur : rien perdu
    expect(HTML).toMatch(/\.\.\.K\._mergeMuted\(c, localById\[c\.id\]\)/);
    expect(HTML).toMatch(/for\(const pc of K\.conversations\)\{ if\(pc\.mute_pending\) K\._syncConvMute\(pc, true\); \}/);
  });
});

// ───────────────────────────────────────────────────────────────────────────── A4 P1-3
describe('A4 P1-3 — un seul rechargement, jamais pendant la frappe, un appel ou un envoi', () => {
  let reload;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="update-banner" class="update-banner h"></div><textarea id="msg-input"></textarea>';
    window._apexReloadPending = null; window._apexLastKeyTs = 0; window.K = {};
    // eslint-disable-next-line no-new-func
    new Function(def('window._apexReloadBlocker = function(){') + '\n' + def('window._apexSafeReload = function(doReload, reason){'))();
    reload = vi.fn();
  });
  afterEach(() => { vi.useRealTimers(); clearTimeout(window._apexReloadTimer); window._apexReloadPending = null; delete window.K; });

  it('champ vide, rien en cours → appliqué tout de suite', () => {
    expect(window._apexSafeReload(reload, 't')).toBe('appliquee');
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('en train d\'écrire → reporté (bandeau affiché), appliqué 20 s après la dernière frappe', () => {
    document.getElementById('msg-input').value = 'Je t\'écris un long mess';
    window._apexLastKeyTs = Date.now();
    expect(window._apexSafeReload(reload, 'sw-updated')).toBe('reportee');
    expect(document.getElementById('update-banner').classList.contains('h')).toBe(false);
    vi.advanceTimersByTime(15000);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['appel 1:1', (K) => { K._activeCall = { type: 'audio' }; }, (K) => { K._activeCall = null; }],
    ['appel de groupe', (K) => { K._meshSession = {}; }, (K) => { K._meshSession = null; }],
    ['vocal en enregistrement', (K) => { K._voiceRecorder = { state: 'recording' }; }, (K) => { K._voiceRecorder.state = 'inactive'; }],
    ['envoi de fichier', (K) => { K._uploadsInFlight = 1; }, (K) => { K._uploadsInFlight = 0; }],
  ])('%s → attend la fin', (_n, on, off) => {
    on(window.K);
    window._apexSafeReload(reload, 'x');
    vi.advanceTimersByTime(60000);
    expect(reload).not.toHaveBeenCalled();
    off(window.K);
    vi.advanceTimersByTime(5000);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('plusieurs déclencheurs à la fois → un seul rechargement', () => {
    window.K._activeCall = {};
    window._apexSafeReload(reload, 'a');
    expect(window._apexSafeReload(reload, 'b')).toBe('deja');
    window.K._activeCall = null;
    vi.advanceTimersByTime(5000);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('la page n\'a plus AUCUN rechargement automatique hors du chemin unique', () => {
    const debut = HTML.indexOf("const __APEX_CHAT_VERSION__");
    let bloc = HTML.slice(debut, HTML.indexOf('</script>', debut));
    // retire la définition du chemin unique et le contenu des appels window._apexSafeReload(…)
    bloc = bloc.replace(def('window._apexSafeReload = function(doReload, reason){'), '');
    let i;
    while ((i = bloc.indexOf('window._apexSafeReload(')) >= 0) {
      let d = 0, j = i + 'window._apexSafeReload'.length;
      for (; j < bloc.length; j++) { if (bloc[j] === '(') d++; else if (bloc[j] === ')') { d--; if (!d) break; } }
      bloc = bloc.slice(0, i) + 'SAFE' + bloc.slice(j + 1);
    }
    expect(bloc.match(/location\.(reload|replace)\(/g) || []).toEqual([]);
    expect((bloc.match(/SAFE/g) || []).length).toBeGreaterThanOrEqual(4);   // updatefound, SW_UPDATED, version, admin
  });
});

// ───────────────────────────────────────────────────────────────────────────── A4 P2-1
describe('A4 P2-1 — connexion : le bouton explique, et l\'état se remet après une erreur', () => {
  async function ecran({ cguDeja = false, fetchImpl } = {}) {
    document.body.innerHTML = '<div id="auth-step"></div><div id="toasts"></div>';
    localStorage.clear();
    const toasts = [];
    const $ = (s) => document.querySelector(s);
    const K = { authStep: 'phone', authData: {}, CGU_VERSION: 'x', _cguAccepted: () => cguDeja };
    const g = { K, $, toast: (m) => toasts.push(m), _safeCatch() {}, _kdmcPrefillName() {}, isKevinAdmin: () => false, API_BASE: 'https://api',
      __APEX_CHAT_VERSION__: 'v-test', fetch: vi.fn(fetchImpl || (async () => { throw new TypeError('Load failed'); })) };
    const src = [...humanDefs.map((m) => def(m)), def('K._authPhoneMissing = function(){'), def('K._authFail = function(msg, type, dur){'),
      def('K._handleAuthPhone = async function(){'), def('function renderAuthStep(){', FN_END)].join('\n');
    // eslint-disable-next-line no-new-func
    const run = new Function(...Object.keys(g), src + '\nreturn renderAuthStep;')(...Object.values(g));
    g.renderAuthStep = run;
    run();
    await new Promise((r) => setTimeout(r, 150));
    return { K, toasts, g, btn: $('#btn-auth-phone'), dbg: $('#auth-debug') };
  }
  const clic = async (b) => { b.click(); await new Promise((r) => setTimeout(r, 30)); };

  it('le bouton n\'est jamais grisé en silence : touchable, et la raison est écrite', async () => {
    const { btn, dbg } = await ecran();
    expect(btn.disabled).toBe(false);
    expect(btn.style.pointerEvents).not.toBe('none');
    expect(dbg.textContent).not.toMatch(/Coche|accepte/);   // 17.10 : plus aucune case de conditions dans Apex Chat
    expect(document.getElementById('auth-cgu')).toBeNull();
    expect(dbg.getAttribute('aria-live')).toBe('polite');
    expect(parseFloat(dbg.style.fontSize)).toBeGreaterThanOrEqual(14);
  });
  it('ce qui manque est dit précisément : numéro, nom (plus de case de conditions)', async () => {
    const { btn, dbg, g } = await ecran();
    await clic(btn);
    expect(dbg.textContent).toMatch(/Écris ton numéro/);
    document.getElementById('auth-phone').value = '06 12';
    await clic(btn);
    expect(dbg.textContent).toMatch(/Numéro incomplet/);
    document.getElementById('auth-phone').value = '+33 6 12 34 56 78';
    await clic(btn);
    expect(dbg.textContent).toMatch(/prénom et ton nom/);
    document.getElementById('auth-name').value = 'Marie Dupont';
    await clic(btn);
    expect(dbg.textContent).not.toMatch(/Coche|conditions/);   // plus de case : numéro + nom suffisent, le code part
    expect(g.fetch).toHaveBeenCalled();
  });
  it('réseau coupé : « Envoi en cours… » disparaît, l\'erreur est dite en français simple, on peut réessayer', async () => {
    const { btn, dbg, g } = await ecran({ cguDeja: true });
    document.getElementById('auth-phone').value = '+33 6 12 34 56 78';
    document.getElementById('auth-name').value = 'Marie Dupont';
    await clic(btn);
    expect(g.fetch).toHaveBeenCalledTimes(1);
    expect(dbg.textContent).not.toMatch(/Envoi en cours/);
    expect(dbg.textContent).toMatch(/Réseau indisponible.*tu peux réessayer/);
    expect(btn.dataset.busy).toBe('');
    await clic(btn);
    expect(g.fetch).toHaveBeenCalledTimes(2);   // second essai possible
  });
  it('réponse d\'erreur du serveur : message gardé, statut remis', async () => {
    const { btn, dbg } = await ecran({ cguDeja: true, fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ message: 'Trop de codes demandés, attends 10 minutes' }) }) });
    document.getElementById('auth-phone').value = '+33 6 12 34 56 78';
    document.getElementById('auth-name').value = 'Marie Dupont';
    await clic(btn);
    expect(dbg.textContent).toBe('❌ Trop de codes demandés, attends 10 minutes — tu peux réessayer');
  });
  it('succès : passe à l\'étape du code, sans message d\'erreur', async () => {
    const { btn, K } = await ecran({ cguDeja: true, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }) });
    document.getElementById('auth-phone').value = '+33 6 12 34 56 78';
    document.getElementById('auth-name').value = 'Marie Dupont';
    await clic(btn);
    expect(K.authStep).toBe('otp');
  });
});

// ───────────────────────────────────────────────────────────────────────────── A4 P2-6
describe('A4 P2-6 — mémoire pleine : jamais de message en attente perdu en silence', () => {
  function sb(limit) {
    const data = new Map();
    const size = () => [...data].reduce((a, [k, v]) => a + k.length + v.length, 0);
    const localStorage = {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => { const old = data.get(k); data.set(k, String(v)); if (size() > limit) { if (old === undefined) data.delete(k); else data.set(k, old); const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; } },
      removeItem: (k) => data.delete(k),
      key: (i) => [...data.keys()][i],
      get length() { return data.size; },
    };
    const idb = new Map();
    const toasts = [];
    const g = { localStorage, PERSIST_PREFIX: 'apex_chat_', idbSet: async (k, v) => { idb.set(k, JSON.parse(JSON.stringify(v))); }, idbGet: async (k) => idb.get(k),
      toast: (m) => toasts.push(m), _safeCatch() {}, K: {}, Object };
    // Object.keys(localStorage) dans _cleanupStorage : on expose les clés comme propriétés énumérables.
    const proxy = new Proxy(localStorage, { ownKeys: () => [...data.keys()], getOwnPropertyDescriptor: (t, k) => (data.has(k) ? { enumerable: true, configurable: true, value: data.get(k) } : Reflect.getOwnPropertyDescriptor(t, k)) });
    g.localStorage = proxy;
    const src = [def('var _lsMem = {};'), def('var _lsFullWarnTs = 0;'), def('function lg(key, fallback){', FN_END), def('function ls(key, value){', FN_END),
      def('function _lsStorageFull(key){', FN_END), def('async function _outboxRestoreFromIdb(){', FN_END), def('function _cleanupStorage(writing){', FN_END),
      def('K._outboxAdd = function(item){')].join('\n');
    // eslint-disable-next-line no-new-func
    const api = new Function(...Object.keys(g), src + '\nreturn { lg, ls, _outboxRestoreFromIdb, K };')(...Object.values(g));
    return { ...api, data, idb, toasts };
  }
  const items = (n, p = 'o') => Array.from({ length: n }, (_, i) => ({ id: p + i, conv_id: 'c1', ciphertext: 'x'.repeat(40), ts: i }));

  it('stockage plein : on fait de la place dans l\'historique, JAMAIS dans la boîte d\'envoi', () => {
    const t = sb(40000);
    t.ls('messages_c1', items(400, 'm'));   // ~ 30 Ko d'historique
    t.ls('outbox', items(60));
    expect(t.ls('outbox', items(200))).toBe(true);           // ne tient qu'en faisant de la place
    expect(t.lg('outbox', []).length).toBe(200);             // rien de tronqué
    expect(t.lg('outbox', [])[0].id).toBe('o0');
    expect(t.lg('messages_c1', []).length).toBe(150);        // l'historique (aussi sur le serveur) cède la place
  });
  it('vraiment plein : la valeur reste lisible, copiée dans IndexedDB, et la personne est prévenue (une fois)', async () => {
    const t = sb(3000);
    expect(t.ls('outbox', items(200))).toBe(false);
    expect(t.lg('outbox', []).length).toBe(200);             // gardée en mémoire pour la session
    await Promise.resolve();
    expect(t.idb.get('outbox').length).toBe(200);
    expect(t.idb.get('lsfull:outbox')).toBeGreaterThan(0);
    expect(t.toasts.join(' ')).toMatch(/Mémoire du téléphone pleine : tes messages en attente sont gardés/);
    t.ls('outbox', items(201));
    expect(t.toasts.length).toBe(1);                         // pas de tempête de toasts
  });
  it('au démarrage suivant, les messages restés dans IndexedDB reviennent dans la boîte d\'envoi', async () => {
    const t = sb(100000);
    t.ls('outbox', items(2));
    t.idb.set('outbox', items(5)); t.idb.set('lsfull:outbox', 123);
    expect(await t._outboxRestoreFromIdb()).toBe(3);
    expect(t.lg('outbox', []).map((x) => x.id)).toEqual(['o0', 'o1', 'o2', 'o3', 'o4']);
    expect(t.idb.get('lsfull:outbox')).toBe(0);
    expect(await t._outboxRestoreFromIdb()).toBe(0);          // drapeau baissé : plus rien à faire
  });
  it('boîte d\'envoi : plus de suppression silencieuse du plus ancien ; au-delà de 1000, le nouveau est refusé AVEC message', () => {
    const t = sb(10_000_000);
    t.ls('outbox', items(1000));
    expect(t.K._outboxAdd({ id: 'nouveau', conv_id: 'c1' })).toBe(false);
    expect(t.lg('outbox', []).length).toBe(1000);
    expect(t.lg('outbox', [])[0].id).toBe('o0');
    expect(t.toasts.join(' ')).toMatch(/n'est PAS gardé/);
    t.ls('outbox', items(300));
    expect(t.K._outboxAdd({ id: 'x301', conv_id: 'c1' })).toBe(true);
    expect(t.lg('outbox', []).length).toBe(301);              // avant : plafonné à 300 en jetant o0
    expect(t.lg('outbox', [])[0].id).toBe('o0');
  });
});

// ───────────────────────────────────────────────────────────────────────────── A6-10 (octets)
const STRIP = ['K._stripJpegMeta = function(u8){', 'K._stripPngMeta = function(u8){', 'K._stripGifMeta = function(u8){', 'K._stripMp4Meta = function(u8){'];
const bytes = (...parts) => { const a = []; for (const p of parts) { if (typeof p === 'string') for (const c of p) a.push(c.charCodeAt(0) & 255); else a.push(...p); } return new Uint8Array(a); };
const has = (u8, s) => Buffer.from(u8).toString('latin1').includes(s);
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function jpegAvecExif() {
  const exif = bytes('Exif\0\0MM\0*GPSLatitude=48.8584;GPSLongitude=2.2945;Model=iPhone 15');
  const app1 = bytes([0xFF, 0xE1, (exif.length + 2) >> 8, (exif.length + 2) & 255], exif);
  const jfif = bytes([0xFF, 0xE0, 0, 16], 'JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const com = bytes([0xFF, 0xFE, 0, 9], 'Paris!!');
  const dqt = bytes([0xFF, 0xDB, 0, 4, 0, 1]);
  const sos = bytes([0xFF, 0xDA, 0, 8, 1, 1, 0, 0, 63, 0], [0x12, 0x34, 0x56, 0xFF, 0xD9]);
  return bytes([0xFF, 0xD8], jfif, app1, com, dqt, sos);
}
function pngChunk(type, data) { const d = typeof data === 'string' ? bytes(data) : data; return bytes(be32(d.length), type, d, [0, 0, 0, 0]); }
function pngAvecMeta() {
  return bytes([137, 80, 78, 71, 13, 10, 26, 10], pngChunk('IHDR', bytes(be32(1), be32(1), [8, 2, 0, 0, 0])), pngChunk('eXIf', 'MM\0*GPS48.85'),
    pngChunk('tEXt', 'Location\0Paris'), pngChunk('IDAT', bytes([1, 2, 3])), pngChunk('IEND', bytes([])));
}
function gifAvecMeta() {
  const head = bytes('GIF89a', [1, 0, 1, 0, 0x80, 0, 0], [0, 0, 0, 255, 255, 255]);
  const loop = bytes([0x21, 0xFF, 11], 'NETSCAPE2.0', [3, 1, 0, 0, 0]);
  const xmp = bytes([0x21, 0xFF, 11], 'XMP DataXMP', [12], 'GPS=48.8584', [0], [0]);
  const com = bytes([0x21, 0xFE, 6], 'Paris!', [0]);
  const gce = bytes([0x21, 0xF9, 4, 0, 0, 0, 0, 0]);
  const img = bytes([0x2C, 0, 0, 0, 0, 1, 0, 1, 0, 0], [2, 2, 0x44, 0x01, 0]);
  return bytes(head, loop, xmp, com, gce, img, [0x3B]);
}
const box = (type, ...kids) => { const body = bytes(...kids); return bytes(be32(body.length + 8), type, body); };
function mp4AvecGps() {
  return bytes(box('ftyp', 'qt  ', [0, 0, 0, 0]),
    box('moov', box('mvhd', [0, 0, 0, 0, 1, 2, 3]), box('udta', box('\xA9xyz', [0, 12, 0, 0], '+48.8584+002.2945/')),
      box('trak', box('tkhd', [0, 0, 0, 1]), box('meta', [0, 0, 0, 0], box('keys', 'com.apple.quicktime.location.ISO6709')))),
    box('mdat', [9, 9, 9, 9]));
}

describe('A6-10 — métadonnées retirées octet par octet', () => {
  const K = loadDefs(STRIP, { K: {} }).K;
  it('JPEG : APP1 (Exif/GPS) et commentaire retirés ; JFIF, tables et image intactes', () => {
    const src = jpegAvecExif();
    const out = K._stripJpegMeta(src);
    expect(has(src, 'GPSLatitude')).toBe(true);
    expect(has(out, 'Exif')).toBe(false);
    expect(has(out, 'GPSLatitude')).toBe(false);
    expect(has(out, 'Paris')).toBe(false);
    expect(has(out, 'JFIF')).toBe(true);
    expect(Buffer.from(out.subarray(-15)).equals(Buffer.from(src.subarray(-15)))).toBe(true);
    expect(K._stripJpegMeta(bytes('pas une image'))).toBe(null);
  });
  it('PNG : eXIf / tEXt retirés, IHDR/IDAT/IEND gardés', () => {
    const out = K._stripPngMeta(pngAvecMeta());
    expect(has(out, 'GPS')).toBe(false);
    expect(has(out, 'Location')).toBe(false);
    for (const t of ['IHDR', 'IDAT', 'IEND']) expect(has(out, t)).toBe(true);
    expect(K._stripPngMeta(bytes('nope'))).toBe(null);
  });
  it('GIF : commentaire et XMP retirés, boucle d\'animation et image gardées', () => {
    const src = gifAvecMeta();
    const out = K._stripGifMeta(src);
    expect(has(out, 'GPS')).toBe(false);
    expect(has(out, 'Paris')).toBe(false);
    expect(has(out, 'NETSCAPE2.0')).toBe(true);
    expect(out[out.length - 1]).toBe(0x3B);
    // exactement l'en-tête, la boucle, le contrôle graphique, l'image et la fin : rien d'autre retiré
    const head = bytes('GIF89a', [1, 0, 1, 0, 0x80, 0, 0], [0, 0, 0, 255, 255, 255]);
    const attendu = bytes(head, [0x21, 0xFF, 11], 'NETSCAPE2.0', [3, 1, 0, 0, 0], [0x21, 0xF9, 4, 0, 0, 0, 0, 0], [0x2C, 0, 0, 0, 0, 1, 0, 1, 0, 0], [2, 2, 0x44, 0x01, 0], [0x3B]);
    expect(Array.from(out)).toEqual(Array.from(attendu));
  });
  it('MP4/MOV : position ©xyz et « meta » vidées (boîtes neutralisées), même taille, mdat intact', () => {
    const src = mp4AvecGps();
    const n = src.length;
    expect(has(src, '+48.8584')).toBe(true);
    const r = K._stripMp4Meta(new Uint8Array(src));
    expect(r.changed).toBe(2);
    expect(r.bytes.length).toBe(n);
    expect(has(r.bytes, '+48.8584')).toBe(false);
    expect(has(r.bytes, 'location')).toBe(false);
    expect(has(r.bytes, 'mvhd')).toBe(true);
    expect(Array.from(r.bytes.subarray(-4))).toEqual([9, 9, 9, 9]);
    expect(K._stripMp4Meta(bytes('xxxxnope'))).toBe(null);
  });
});

// ───────────────────────────────────────────────────────────────────────────── A6-09 / A6-10 (envoi)
describe('A6-09 / A6-10 — envoi d\'un fichier', () => {
  function sb({ e2e = false, sessionKey = true, encrypt = async (id, b) => new Uint8Array([7, 7, ...new Uint8Array(b)]).buffer, canvas = 'jpeg' } = {}) {
    const toasts = [];
    const sent = [];
    const fetch = vi.fn(async (url, opts) => { sent.push({ url, opts, inFlight: K._uploadsInFlight }); return { ok: true, status: 200, json: async () => ({ ok: true, url: '/api/media/abc', mime: opts.headers['Content-Type'], size: 3 }) }; });
    const K = {
      viewData: { id: 'dm 1', type: 'dm' }, token: 'jwt', _uploadsInFlight: 0,
      _keyChangePending: () => false, _fmtSize: (n) => n + ' o', _convIsDm: () => true, _mediaE2eOn: () => e2e,
      _ensureSession: async () => {}, _sendMediaMessage: vi.fn(async () => 'sent'),
      _compressMessageImage: vi.fn(async (raw) => (canvas === 'jpeg' ? 'data:image/jpeg;base64,' + Buffer.from('JPEGPROPRE').toString('base64') : raw)),
    };
    const win = { ApexCrypto: { getSessionKey: () => (sessionKey ? 'k' : null), encryptBytes: vi.fn(encrypt) } };
    const g = { K, fetch, toast: (m) => toasts.push(m), _safeCatch() {}, API_BASE: 'https://api', window: win, ApexCrypto: win.ApexCrypto, FileReader, Blob, atob };
    // v1.1.304 (lot C1) : le chiffrement des octets d'un DM passe par K._dmMediaEncrypt (refus au lieu du clair).
    const src = [...humanDefs, ...STRIP, 'K._DM_MEDIA_BLOCKED = ', 'K._dmMediaEncrypt = async function(conv, blob){', 'K._stripMediaMeta = async function(file){', 'K._uploadMedia = async function(file){'].map((m) => def(m)).join('\n');
    // eslint-disable-next-line no-new-func
    new Function(...Object.keys(g), src)(...Object.values(g));
    return { K, fetch, sent, toasts, win };
  }
  const file = (u8, type, name) => new File([u8], name, { type });

  it('le fichier est rattaché à SA conversation (?conv_id=…) et le compteur d\'envois revient à 0', async () => {
    const t = sb();
    await t.K._uploadMedia(file(bytes('%PDF-1.4'), 'application/pdf', 'devis.pdf'));
    expect(t.sent[0].url).toBe('https://api/api/media?conv_id=dm%201');
    expect(t.sent[0].inFlight).toBe(1);
    expect(t.K._uploadsInFlight).toBe(0);
    expect(t.K._sendMediaMessage).toHaveBeenCalled();
  });
  it('conversation chiffrée de bout en bout, pas de clé : RIEN n\'est envoyé (avant : envoyé en clair)', async () => {
    const t = sb({ e2e: true, sessionKey: false });
    await t.K._uploadMedia(file(bytes('%PDF-1.4'), 'application/pdf', 'devis.pdf'));
    expect(t.fetch).not.toHaveBeenCalled();
    expect(t.toasts.join(' ')).toMatch(/NON envoyée.*Rien n'est envoyé en clair/);
    expect(t.K._uploadsInFlight).toBe(0);
  });
  it('conversation chiffrée, le chiffrement échoue : RIEN n\'est envoyé', async () => {
    const t = sb({ e2e: true, encrypt: async () => { throw new Error('OperationError'); } });
    await t.K._uploadMedia(file(bytes('%PDF-1.4'), 'application/pdf', 'devis.pdf'));
    expect(t.fetch).not.toHaveBeenCalled();
  });
  it('conversation chiffrée qui marche : octets chiffrés envoyés (octet-stream)', async () => {
    const t = sb({ e2e: true });
    await t.K._uploadMedia(file(bytes('%PDF-1.4'), 'application/pdf', 'devis.pdf'));
    expect(t.sent[0].opts.headers['Content-Type']).toBe('application/octet-stream');
    expect(t.K._sendMediaMessage.mock.calls[0][0]).toMatchObject({ enc: true, mime: 'application/pdf' });
  });
  it('petite photo : TOUJOURS ré-encodée (canvas), même sous 300 Ko', async () => {
    const t = sb();
    await t.K._uploadMedia(file(jpegAvecExif(), 'image/jpeg', 'IMG_0001.jpg'));
    expect(t.K._compressMessageImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/jpeg/), true);
    const body = new Uint8Array(await t.sent[0].opts.body.arrayBuffer());
    expect(Buffer.from(body).toString()).toBe('JPEGPROPRE');
  });
  it('photo que le canvas ne sait pas lire : retrait octet par octet (plus aucun Exif/GPS)', async () => {
    const t = sb({ canvas: 'echec' });
    await t.K._uploadMedia(file(jpegAvecExif(), 'image/jpeg', 'IMG_0002.jpg'));
    const body = new Uint8Array(await t.sent[0].opts.body.arrayBuffer());
    expect(has(body, 'GPSLatitude')).toBe(false);
    expect(has(body, 'JFIF')).toBe(true);
  });
  it('GIF et vidéo : métadonnées retirées avant l\'envoi', async () => {
    const t = sb();
    await t.K._uploadMedia(file(gifAvecMeta(), 'image/gif', 'drole.gif'));
    await t.K._uploadMedia(file(mp4AvecGps(), 'video/quicktime', 'IMG_0003.MOV'));
    const gif = new Uint8Array(await t.sent[0].opts.body.arrayBuffer());
    const mov = new Uint8Array(await t.sent[1].opts.body.arrayBuffer());
    expect(has(gif, 'GPS')).toBe(false);
    expect(has(mov, '+48.8584')).toBe(false);
    expect(t.toasts.join(' ')).not.toMatch(/n'ont pas pu être retirées/);
  });
  it('format inconnu (image illisible) : envoyé, mais la personne est prévenue', async () => {
    const t = sb({ canvas: 'echec' });
    await t.K._uploadMedia(file(bytes('ftypheic....'), 'image/heic', 'IMG.HEIC'));
    expect(t.toasts.join(' ')).toMatch(/n'ont pas pu être retirées/);
  });
});

// ───────────────────────────────────────────────────────────────────────────── A6-15
describe('A6-15 — position live : seul l\'auteur déplace sa position', () => {
  const charger = () => loadDefs(['K._applyLocationUpdate = function(convId, data){'], {
    K: { messages: { c1: [{ id: 'loc1', from: 'alice', location: { lat: 1, lng: 1 } }] } }, ls() {},
  }).K;
  it('trame relayée par le serveur au nom de l\'auteur → appliquée ; au nom d\'un autre → refusée', () => {
    const K = charger();
    expect(K._applyLocationUpdate('c1', { msg_id: 'loc1', from: 'bob', lat: 45, lng: 5 })).toBe(false);
    expect(K.messages.c1[0].location.lat).toBe(1);
    expect(K._applyLocationUpdate('c1', { msg_id: 'loc1', from: 'alice', lat: 45, lng: 5 })).toBe(true);
    expect(K.messages.c1[0].location.lat).toBe(45);
  });
});

// ───────────────────────────────────────────────────────────────────────────── A6-16
describe('A6-16 — statuts 24 h réellement publiés', () => {
  function sb(api) {
    document.body.innerHTML = '<textarea id="story-text"></textarea>';
    const store = {};
    const toasts = []; const modals = [];
    const K = { user: { id: 'me' }, _STORY_TTL_MS: 86400000, _storyPendingImg: null, _api: vi.fn(api), _closeModal() {}, _showModal: (t, h) => modals.push([t, h]), _renderMarkdown: (x) => x };
    const g = { K, ls: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); return true; }, lg: (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d),
      toast: (m) => toasts.push(m), esc: (x) => String(x), kcall: () => '', _safeCatch() {} };
    const src = [...humanDefs, 'K._STORY_MIME = ', 'K._STORY_MAX = ', 'K._saveStory = async function(){', 'K._viewMyStories = function(){',
      'K._deleteStory = async function(id){', 'K._viewContactStories = async function(){', 'K._openContactStory = async function(id){'].map((m) => def(m)).join('\n');
    // eslint-disable-next-line no-new-func
    new Function(...Object.keys(g), src)(...Object.values(g));
    return { K, store, toasts, modals };
  }
  it('« Publier » envoie le statut au serveur ; « publié » n\'est annoncé qu\'après son accord', async () => {
    const t = sb(async () => ({ ok: true, story: { id: 'srv1', ts: 5, expires_at: 99 } }));
    document.getElementById('story-text').value = 'Bonne journée';
    expect(await t.K._saveStory()).toBe(true);
    const [method, path, body] = t.K._api.mock.calls[0];
    expect([method, path, body.mime]).toEqual(['POST', '/api/stories', 'application/x-apex-story']);
    expect(JSON.parse(body.ciphertext)).toEqual({ t: 'Bonne journée' });
    expect(t.store.my_stories[0]).toMatchObject({ id: 'srv1', server_id: 'srv1' });
    expect(t.toasts.join(' ')).toMatch(/publié pour 24 h/);
  });
  it('échec réseau : rien n\'est annoncé comme publié, rien n\'est gardé comme tel', async () => {
    const t = sb(async () => { throw new TypeError('Load failed'); });
    document.getElementById('story-text').value = 'Coucou';
    expect(await t.K._saveStory()).toBe(false);
    expect(t.store.my_stories).toBeUndefined();
    expect(t.toasts.join(' ')).toMatch(/Statut non publié : Réseau indisponible/);
  });
  it('supprimer efface aussi sur le serveur ; les statuts des contacts sont listés (pas les miens)', async () => {
    const t = sb(async (m, p) => (m === 'GET' && p === '/api/stories' ? { ok: true, stories: [{ id: 'a', author_id: 'me', ts: 1 }, { id: 'b', author_id: 'bob', pseudo: 'Bob', ts: 2 }] }
      : m === 'GET' ? { ok: true, story: { ciphertext: JSON.stringify({ t: 'Salut de Bob' }) } } : { ok: true }));
    t.store.my_stories = [{ id: 'srv1', server_id: 'srv1', ts: 1, expires_at: Date.now() + 1000 }];
    expect(await t.K._deleteStory('srv1')).toBe(true);
    expect(t.K._api).toHaveBeenCalledWith('DELETE', '/api/stories/srv1');
    expect(t.store.my_stories).toEqual([]);
    const list = await t.K._viewContactStories();
    expect(list.map((s) => s.id)).toEqual(['b']);
    expect((await t.K._openContactStory('b')).t).toBe('Salut de Bob');
    expect(t.modals.at(-1)[1]).toContain('Salut de Bob');
  });
});
