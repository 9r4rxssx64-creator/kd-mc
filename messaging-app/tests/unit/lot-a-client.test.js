// @vitest-environment node
// Lot A (audit A2, 15.10.2026) — côté app (index.html RÉELLE, définitions extraites, jamais recopiées).
//  A2-03 rattrapage paginé jusqu'à être à jour (bout en bout contre le VRAI ConversationDO + SQLite)
//  A2-16 éditions / suppressions faites pendant l'absence appliquées aux messages déjà connus
//  A2-15 expires_at / reply_to / view_once partent avec la trame et l'outbox, et sont relus
//  A2-08 l'outbox ne se vide qu'à l'accusé du serveur (client_id), jamais à l'envoi
// Sabotage : CLIENT_INDEX_PATH=<copie sans le correctif> → ces tests échouent.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';
import { d1Reel } from './_support/d1-sqlite.js';

const MERGE_DEFS = [
  'K._replyRef = function(convId, raw){',
  'K._applyServerUpdate = async function(convId, m, sm){',
  'K._mergeServerHistory = async function(convId, list){',
];
const SYNC_DEFS = [
  'K._SYNC_MARGIN_MS = ',
  'K._syncCursorGet = function(convId){',
  'K._syncAdvance = function(convId, ts, id, chg){',
  'K._noteLive = function(convId, sm){',
  'K._startCatchUp = function(convId){',
  'K._onHistoryFrame = async function(convId, data){',
  'K._onHistoryPage = async function(convId, data){',
];
const OUTBOX_DEFS = [
  'K._wireExtras = function(m){',
  'K._dispatchWire = function(convId, wire){',
  'K._outboxAdd = function(item){',
  'K._outboxRemove = function(id){',
  'K._flushOutboxFor = function(convId){',
  'K._applyWsAck = function(convId, data){',
  'K._syncAdvance = function(convId, ts, id, chg){',
  'K._noteLive = function(convId, sm){',
  'K._onWsAck = function(convId, data){',
  'K._WS_FATAL_CODES = ',
  'K._onWsError = function(convId, data){',
];

/** Bac à sable : K + stockage local en mémoire + socket simulée. Renvoie aussi `handle` (_handleWsMessage). */
function sandbox({ defs, withHandler = false } = {}) {
  const store = {};
  const ls = (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); };
  const lg = (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d);
  const sent = [];
  const toasts = [];
  const K = {
    user: { id: 'me' }, messages: {}, conversations: [{ id: 'c1', name: 'Groupe' }], view: 'chats', viewData: null,
    ws: { readyState: 1, send: (s) => sent.push(JSON.parse(s)) }, _wsConvId: 'c1',
    render() {}, _updateUnreadBadge() {}, _notifyIncoming() {}, _appendBubble: () => true,
    _isBlocked: () => false, _isDeletedLocal: (c, id) => id === 'supprime_pour_moi',
    _markerFields: (t) => ({ text: t }),
    _parseLocationMarker: () => null, _parseMediaMarker: () => null, _parseContactMarker: () => null, _parsePollMarker: () => null,
    // Déchiffrement simulé : « ILLISIBLE » = indéchiffrable ; « CTRL » = trame de contrôle.
    _decodeIncoming: async (convId, raw) => (raw === 'ILLISIBLE' ? { text: '🔒', undecryptable: true }
      : raw === 'CTRL' ? { control: true } : { text: 'déchiffré:' + raw, encrypted: true }),
  };
  const all = (defs || []).map((m) => (typeof m === 'string' ? m : m)).concat(withHandler ? [{ m: 'async function _handleWsMessage(data, convId){', end: '\n}\n' }] : []);
  const html = readIndex();
  const src = all.map((m) => extractDef(html, m)).join('\n');
  const g = { K, ls, lg, toast: (m) => toasts.push(String(m)), _safeCatch: () => {}, _logTelemetry: () => {}, WebSocket: { OPEN: 1 }, window: {}, console: { log() {}, warn() {}, error() {} } };
  // eslint-disable-next-line no-new-func
  const fn = new Function(...Object.keys(g), `${src}\n;return { handle: (typeof _handleWsMessage !== 'undefined' ? _handleWsMessage : null) };`);
  const { handle } = fn(...Object.values(g));
  return { K, store, sent, toasts, handle };
}

afterEach(() => { vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-03 — rattrapage côté app', () => {
  it('BOUT EN BOUT : 120 messages manqués (> 50) → l’app pagine contre le vrai DO et les a TOUS, dans l’ordre', async () => {
    // Serveur réel : SQLite + ConversationDO.
    const DB = d1Reel();
    DB.raw.prepare(`INSERT INTO conversations (id,type,created_by,created_at,sharded_to_do) VALUES ('c1','group','alice',1,'do_c1')`).run();
    for (const u of ['alice', 'me']) {
      DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status) VALUES (?,?,?,?,?,1,'k','k','k','active')`).run(u, u, u, 'tel_' + u, 'h_' + u);
      DB.raw.prepare(`INSERT INTO conversation_members (conv_id,user_id,joined_at) VALUES ('c1',?,1)`).run(u);
    }
    for (let i = 0; i < 130; i++) DB.raw.prepare(`INSERT INTO messages (id,conv_id,sender_id,ciphertext,mime,ts) VALUES (?,?,?,?,?,?)`).run('s' + String(i).padStart(3, '0'), 'c1', 'alice', 'm' + i, 'text/plain', 1000 + i);
    const state = { id: { toString: () => 'do_c1' }, storage: { get: async () => undefined, put: async () => {} }, blockConcurrencyWhile: async (fn) => fn() };
    const d = new ConversationDO(state, { APEX_CHAT_DB: DB, JWT_SIGN_KEY: 'k' });
    const sock = { sent: [], send(x) { this.sent.push(JSON.parse(x)); }, close() {} };
    d.sessions.set(sock, { userId: 'me', convId: 'c1', joinedAt: 1, connectedAt: Date.now(), lastMemberCheck: Date.now(), messageCount: 0, lastReset: Date.now() });

    // App : elle connaissait les 10 premiers (repère au 10e), puis 120 sont arrivés en son absence.
    const app = sandbox({ defs: [...MERGE_DEFS, ...SYNC_DEFS], withHandler: true });
    app.K.messages.c1 = Array.from({ length: 10 }, (_, i) => ({ id: 's' + String(i).padStart(3, '0'), from: 'alice', text: 'déchiffré:m' + i, ts: 1000 + i }));
    app.K.ws.send = async (x) => { pending.push(d.handleMessage(sock, JSON.parse(x))); };
    const pending = [];
    expect(app.K._startCatchUp('c1')).toBe(true);
    let delivered = 0;
    for (let guard = 0; guard < 20; guard++) {
      await Promise.all(pending.splice(0));
      const frames = sock.sent.slice(delivered); delivered = sock.sent.length;
      if (!frames.length) break;
      for (const f of frames) await app.handle(f, 'c1');
    }
    const ids = app.K.messages.c1.map((m) => m.id);
    expect(ids).toEqual(Array.from({ length: 130 }, (_, i) => 's' + String(i).padStart(3, '0')));
    expect(app.K._wsSync.synced).toBe(true);
    expect(app.store.sync_c1).toMatchObject({ ts: 1129, id: 's129' });
    expect(sock.sent.filter((f) => f.type === 'history_page').length).toBe(1);   // 120 + marge < 200 : une page
  });

  it('repère : stocké > dérivé des messages serveur (ni « m_… » ni en attente) > aucun (base = historique récent)', () => {
    const app = sandbox({ defs: SYNC_DEFS });
    app.K.messages.c1 = [{ id: 'srv1', ts: 500 }, { id: 'm_local', ts: 900 }, { id: 'srv2', ts: 800, pending_encrypt: true }, { id: 'srv3', ts: 'x' }];
    expect(app.K._syncCursorGet('c1')).toEqual({ ts: 500, id: '', chg: 500 });
    app.store.sync_c1 = { ts: 700, id: 'z', chg: 650 };
    expect(app.K._syncCursorGet('c1')).toEqual({ ts: 700, id: 'z', chg: 650 });
    expect(app.K._startCatchUp('c1')).toBe(true);
    expect(app.sent[0]).toEqual({ type: 'history_since', after_ts: 0, after_id: '', changed_since: 0, limit: 200 });   // marge 5 s, bornée à 0
    app.store.sync_c1 = { ts: 70000, id: 'z' };
    app.K._startCatchUp('c1');
    expect(app.sent[1]).toMatchObject({ after_ts: 65000, changed_since: 65000 });
    expect(app.K._syncCursorGet('c2')).toBeNull();
    app.K._wsConvId = 'c2';
    expect(app.K._startCatchUp('c2')).toBe(false);                          // base : rien demandé
    expect(app.K._wsSync).toMatchObject({ convId: 'c2', synced: true, baseline: true });
    app.K._wsConvId = 'c1'; app.K.ws.readyState = 3;
    expect(app.K._startCatchUp('c1')).toBe(false);                          // socket fermée
  });

  it('pages : page suivante tant que more ; fin → à jour + repère d’édition = instant serveur ; page étrangère ignorée ; ≤ 100 pages', async () => {
    const app = sandbox({ defs: [...MERGE_DEFS, ...SYNC_DEFS] });
    app.store.sync_c1 = { ts: 100, id: 'a', chg: 50 };
    app.K._startCatchUp('c1');
    expect(await app.K._onHistoryPage('c2', { more: false })).toBe(false);
    await app.K._onHistoryPage('c1', { messages: [{ id: 'p1', sender_id: 'x', ciphertext: 'u', ts: 200 }], more: true, cursor: { ts: 200, id: 'p1' }, server_ts: 9999 });
    expect(app.sent.at(-1)).toEqual({ type: 'history_since', after_ts: 200, after_id: 'p1', limit: 200 });
    expect(app.K._wsSync.synced).toBe(false);
    expect(app.store.sync_c1).toEqual({ ts: 200, id: 'p1', chg: 50 });     // repère d'édition inchangé avant la fin
    await app.K._onHistoryPage('c1', { messages: [], changes: [{ id: 'p1', sender_id: 'x', ciphertext: '', deleted_at: 5, ts: 200 }], more: false, cursor: { ts: 200, id: 'p1' }, server_ts: 1 });
    expect(app.K._wsSync.synced).toBe(true);
    expect(app.store.sync_c1).toEqual({ ts: 200, id: 'p1', chg: 9999 });
    expect(app.K.messages.c1[0]).toMatchObject({ id: 'p1', deleted: true });
    expect(await app.K._onHistoryPage('c1', { more: false })).toBe(false); // déjà à jour
    // Garde-fou : au plus 100 pages par connexion (le reste à la prochaine).
    app.K._startCatchUp('c1');
    const n0 = app.sent.length;
    for (let i = 0; i < 105; i++) await app.K._onHistoryPage('c1', { messages: [], more: true, cursor: { ts: 300 + i, id: 'q' } });
    expect(app.sent.length - n0).toBe(99);                                    // pages 1 à 99 relancées, pas la 100e
    expect(app.K._wsSync.synced).toBe(false);
  });

  it('le repère n’avance en direct qu’une fois la socket à jour (jamais par-dessus un trou) et jamais en arrière', async () => {
    const app = sandbox({ defs: [...MERGE_DEFS, ...SYNC_DEFS] });
    app.store.sync_c1 = { ts: 100, id: 'a', chg: 1 };
    app.K._startCatchUp('c1');
    expect(app.K._noteLive('c1', { id: 'live', ts: 500 })).toBe(false);     // rattrapage pas fini
    expect(app.store.sync_c1.ts).toBe(100);
    await app.K._onHistoryPage('c1', { messages: [], more: false, cursor: { ts: 100, id: 'a' } });
    expect(app.K._noteLive('c1', { id: 'live', ts: 500 })).toBe(true);
    expect(app.K._noteLive('c1', { id: 'vieux', ts: 300 })).toBe(true);
    expect(app.K._noteLive('c2', { id: 'x', ts: 900 })).toBe(false);
    expect(app.K._noteLive('c1', { id: 'x' })).toBe(false);
    expect(app.store.sync_c1).toMatchObject({ ts: 500, id: 'live' });
  });

  it('nouvel appareil (base) : l’historique récent fixe le repère ; sinon il ne le touche pas', async () => {
    const app = sandbox({ defs: [...MERGE_DEFS, ...SYNC_DEFS] });
    app.K._startCatchUp('c1');
    await app.K._onHistoryFrame('c1', { messages: [{ id: 'h1', sender_id: 'x', ciphertext: 'a', ts: 10 }, { id: 'h2', sender_id: 'x', ciphertext: 'b', ts: 20 }] });
    expect(app.store.sync_c1).toMatchObject({ ts: 20, id: 'h2' });
    app.store.sync_c1 = { ts: 5, id: 'z', chg: 5 };
    app.K._startCatchUp('c1');
    await app.K._onHistoryFrame('c1', { messages: [{ id: 'h3', sender_id: 'x', ciphertext: 'c', ts: 999 }] });
    expect(app.store.sync_c1.ts).toBe(5);                                   // l'historique (50 derniers) ne saute pas le trou
    await app.K._onHistoryFrame('c1', {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-16 — un message déjà connu est mis à jour par la version serveur plus récente', () => {
  it('supprimé pour tous pendant l’absence → tombstone ; édité → nouveau texte + historique ; plus ancien / illisible → inchangé', async () => {
    const app = sandbox({ defs: MERGE_DEFS });
    app.K.messages.c1 = [
      { id: 'del', from: 'x', text: 'oups photo', ts: 1, media_url: 'u', reply_to: { id: 'z' } },
      { id: 'ed', from: 'x', text: 'v1', ts: 2 },
      { id: 'old', from: 'x', text: 'v9', ts: 3, edited_at: 900 },
      { id: 'ill', from: 'x', text: 'lisible', ts: 4 },
      { id: 'déjà', from: 'x', text: '🗑 Message supprimé', deleted: true, ts: 5 },
      { id: 'same', from: 'x', text: 's', ts: 6 },
      { id: 'ctl', from: 'x', text: 'k', ts: 7 },
    ];
    const r = await app.K._mergeServerHistory('c1', [
      { id: 'del', sender_id: 'x', ciphertext: '', deleted_at: 50, ts: 1 },
      { id: 'ed', sender_id: 'x', ciphertext: 'v2', edited_at: 60, ts: 2 },
      { id: 'old', sender_id: 'x', ciphertext: 'v3', edited_at: 800, ts: 3 },
      { id: 'ill', sender_id: 'x', ciphertext: 'ILLISIBLE', edited_at: 70, ts: 4 },
      { id: 'déjà', sender_id: 'x', ciphertext: '', deleted_at: 50, ts: 5 },
      { id: 'same', sender_id: 'x', ciphertext: 's', ts: 6 },
      { id: 'ctl', sender_id: 'x', ciphertext: 'CTRL', edited_at: 80, ts: 7 },
    ]);
    expect(r).toEqual({ added: 0, merged: 0, updated: 2 });
    const by = Object.fromEntries(app.K.messages.c1.map((m) => [m.id, m]));
    expect(by.del).toMatchObject({ deleted: true, text: '🗑 Message supprimé' });
    expect(by.del.media_url).toBeUndefined();
    expect(by.del.reply_to).toBeUndefined();
    expect(by.ed).toMatchObject({ text: 'déchiffré:v2', edited_at: 60, edit_history: [{ text: 'v1', ts: 2 }] });
    expect(by.old.text).toBe('v9');
    expect(by.ill.text).toBe('lisible');
    expect(app.store.messages_c1).toBeDefined();
  });

  it('seconde édition : l’historique d’édition garde la version d’origine ; le clair reçu dans une conv E2E est marqué', async () => {
    const app = sandbox({ defs: MERGE_DEFS });
    app.K._decodeIncoming = async (c, raw) => ({ text: raw, unencrypted: true });
    app.K.messages.c1 = [{ id: 'e', from: 'x', text: 'v2', ts: 1, edited_at: 10, edit_history: [{ text: 'v1', ts: 1 }] }];
    await app.K._mergeServerHistory('c1', [{ id: 'e', sender_id: 'x', ciphertext: 'v3', edited_at: 20, ts: 1 }]);
    expect(app.K.messages.c1[0]).toMatchObject({ text: 'v3', unencrypted: true, edit_history: [{ text: 'v1', ts: 1 }] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-15 — éphémère, citation, vue unique : transmis et relus', () => {
  it('_wireExtras : seulement des champs valides, citation réduite à son id', () => {
    const { K } = sandbox({ defs: OUTBOX_DEFS });
    expect(K._wireExtras({ expires_at: 123, reply_to: { id: 'p', text: 'cité en clair' }, view_once: true })).toEqual({ expires_at: 123, reply_to: 'p', view_once: 1 });
    expect(K._wireExtras({ reply_to: 'p2' })).toEqual({ reply_to: 'p2' });
    expect(K._wireExtras({ expires_at: 0, reply_to: { id: '' }, view_once: 0 })).toEqual({});
    expect(K._wireExtras({ expires_at: '5', reply_to: 7 })).toEqual({});
    expect(K._wireExtras(null)).toEqual({});
  });

  it('_sendMsg : la trame (et l’outbox) portent expires_at et reply_to — le serveur peut les appliquer', () => {
    const src = extractDef(readIndex(), 'K._sendMsg = async function(){');
    expect(src).toMatch(/const wire = \{ type: 'message'[^\n]*\.\.\.K\._wireExtras\(msg\) \};/);
    expect(src).toMatch(/K\._queuePendingEncrypt\(\{[^\n]*\.\.\.K\._wireExtras\(msg\)/);
    expect(src).toContain('K._dispatchWire(conv.id, wire)');
    expect(extractDef(readIndex(), 'K._flushPendingEncrypt = async function(convId){')).toContain('...K._wireExtras(item)');
  });

  it('hors ligne → outbox avec les champs → rejouée avec les champs', () => {
    const { K, store, sent } = sandbox({ defs: OUTBOX_DEFS });
    K.ws.readyState = 3;
    expect(K._dispatchWire('c1', { type: 'message', ciphertext: 'boum', mime: 'text/plain', ts: 1, id: 'm_1', expires_at: 999, reply_to: 'p', view_once: 1 })).toBe('queued');
    expect(store.outbox[0]).toMatchObject({ id: 'm_1', expires_at: 999, reply_to: 'p', view_once: 1 });
    K.ws.readyState = 1;
    expect(K._flushOutboxFor('c1')).toBe(1);
    expect(sent[0]).toEqual({ type: 'message', ciphertext: 'boum', mime: 'text/plain', ts: 1, id: 'm_1', expires_at: 999, reply_to: 'p', view_once: 1 });
  });

  it('réception (direct et historique) : expires_at recopié, citation reconstituée depuis le message local', async () => {
    const app = sandbox({ defs: [...MERGE_DEFS, ...SYNC_DEFS], withHandler: true });
    app.K.messages.c1 = [{ id: 'parent', from: 'me', text: 'question ?', ts: 1 }];
    await app.handle({ type: 'message', id: 'live1', sender_id: 'x', ciphertext: 'r', ts: 2, expires_at: 5000, reply_to: 'parent' }, 'c1');
    const live = app.K.messages.c1.find((m) => m.id === 'live1');
    expect(live).toMatchObject({ expires_at: 5000, reply_to: { id: 'parent', text: 'question ?', from_name: 'Toi' } });
    await app.K._mergeServerHistory('c1', [{ id: 'h1', sender_id: 'x', ciphertext: 'q', ts: 3, expires_at: 6000, reply_to: 'live1' },
      { id: 'h2', sender_id: 'x', ciphertext: 'q', ts: 4, reply_to: 'inconnu' },
      { id: 'h3', sender_id: 'x', ciphertext: 'q', ts: 5, reply_to: JSON.stringify({ id: 'parent', text: 'ancien format' }) }]);
    const h = Object.fromEntries(app.K.messages.c1.map((m) => [m.id, m]));
    expect(h.h1).toMatchObject({ expires_at: 6000, reply_to: { id: 'live1', text: 'déchiffré:r', from_name: 'Groupe' } });
    expect(h.h2.reply_to).toEqual({ id: 'inconnu', text: '', from_name: '' });
    expect(h.h3.reply_to).toEqual({ id: 'parent', text: 'ancien format' });
    expect(h.h1.from_history).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A2-08 — l’outbox ne se vide qu’à l’accusé du serveur', () => {
  it('envoi socket ouverte : envoyé ET gardé ; reconnexion : renvoyé ; accusé (client_id) : retiré', () => {
    const { K, store, sent } = sandbox({ defs: OUTBOX_DEFS });
    K.messages.c1 = [{ id: 'm_1', from: 'me', text: 'x', ts: 1 }];
    expect(K._dispatchWire('c1', { type: 'message', ciphertext: 'x', ts: 1, id: 'm_1' })).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(store.outbox.map((i) => i.id)).toEqual(['m_1']);                // socket à moitié morte : rien de perdu
    expect(K._flushOutboxFor('c1')).toBe(1);
    expect(store.outbox).toHaveLength(1);                                   // pas retiré à l'envoi
    K._onWsAck('c1', { type: 'ack', id: 'srv-1', ts: 5, client_id: 'm_1' });
    expect(store.outbox).toEqual([]);
    expect(K.messages.c1[0].id).toBe('srv-1');
    K._onWsAck('c1', null);
  });

  it('édition : la trame porte l’id de l’item d’outbox ; l’accusé d’édition le retire', () => {
    const { K, store, sent } = sandbox({ defs: OUTBOX_DEFS });
    K._dispatchWire('c1', { type: 'edit_message', message_id: 'srv-2', new_text: 'v2', edited_at: 7 });
    expect(sent[0]).toMatchObject({ type: 'edit_message', message_id: 'srv-2', id: 'edit_srv-2_7' });
    K._onWsAck('c1', { type: 'ack', id: 'srv-2', edited_at: 8, client_id: 'edit_srv-2_7' });
    expect(store.outbox).toEqual([]);
  });

  it('refus définitif (invalide, E2E obligatoire, interdit) → retiré + signalé ; refus passager → gardé', () => {
    const { K, store, toasts } = sandbox({ defs: OUTBOX_DEFS });
    K.ws.readyState = 3;
    for (const id of ['a', 'b', 'c', 'd', 'e']) K._dispatchWire('c1', { type: 'message', ciphertext: 'x', ts: 1, id });
    expect(K._onWsError('c1', { code: 'invalid_message', client_id: 'a' })).toBe(true);
    expect(K._onWsError('c1', { code: 'e2e_required', client_id: 'b', message: 'clé' })).toBe(true);
    expect(K._onWsError('c1', { code: 'forbidden', client_id: 'c' })).toBe(true);
    expect(K._onWsError('c1', { code: 'rate_limit', client_id: 'd' })).toBe(false);
    expect(K._onWsError('c1', { code: 'busy', client_id: 'e' })).toBe(false);
    expect(K._onWsError('c1', { code: 'invalid_message' })).toBe(false);
    expect(K._onWsError('c1', null)).toBe(false);
    expect(store.outbox.map((i) => i.id)).toEqual(['d', 'e']);
    expect(toasts.some((t) => /refusé/.test(t))).toBe(true);
  });

  it('garde : K._outboxRemove n’est appelé que par l’accusé ou un refus définitif', () => {
    const html = readIndex();
    const calls = html.match(/K\._outboxRemove\(/g) || [];
    const inAck = extractDef(html, 'K._onWsAck = function(convId, data){').match(/K\._outboxRemove\(/g) || [];
    const inErr = extractDef(html, 'K._onWsError = function(convId, data){').match(/K\._outboxRemove\(/g) || [];
    expect(inAck).toHaveLength(1);
    expect(inErr).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(extractDef(html, { m: 'async function _handleWsMessage(data, convId){', end: '\n}\n' })).toContain('K._onWsAck(convId, data)');
  });
});
