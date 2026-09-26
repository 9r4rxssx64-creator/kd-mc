/**
 * SIMULATION MULTI-CLIENTS — moteur de messagerie réel (ConversationDO)
 * ════════════════════════════════════════════════════════════════════════
 * Kevin (2026-06-09) : « la fonction principale ne fonctionne pas… teste tout,
 * simule des clients, leurs connexions, l'échange de messages, photos, dossiers,
 * Visio… avec d'autres comptes que nous (les Tardieu et autres). »
 *
 * Ce banc instancie le VRAI moteur (`ConversationDO`) — celui qui route les
 * messages en prod — avec un D1 en mémoire et plusieurs clients WebSocket
 * simulés, puis vérifie pour CHAQUE paire/groupe que :
 *   • un message TEXTE part de A et ARRIVE chez B (et inversement),
 *   • il est PERSISTÉ en D1 (récupérable à la reconnexion / nouvel appareil),
 *   • l'expéditeur reçoit son ACK,
 *   • une PHOTO et un FICHIER (tous formats) arrivent comme un message,
 *   • un membre DÉCONNECTÉ reçoit une notif push (et le message reste en D1),
 *   • la VISIO (signaling WebRTC offer/answer/ICE) est relayée au correspondant,
 *   • un GROUPE (3 membres) : tous les autres reçoivent.
 *
 * Couples testés : Kevin↔Laurence (cercle privé), Sandrine↔Christophe TARDIEU,
 * et un couple NEUF quelconque (Alice↔Bob) → preuve « marche pour tout le monde ».
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';

// ── D1 en mémoire (sous-ensemble SQL utilisé par le moteur) ────────────────
function makeDB() {
  const state = { messages: [], members: [], users: [], conversations: [], subscriptions: [] };
  function exec(sql, args) {
    if (sql.includes('INSERT INTO messages')) {
      const [id, conv_id, sender_id, ciphertext, mime, ts, reply_to, thread_root, view_once, expires_at] = args;
      state.messages.push({ id, conv_id, sender_id, ciphertext, mime, ts, reply_to, thread_root, view_once, expires_at });
      return { success: true };
    }
    if (sql.includes('UPDATE conversations SET last_msg_id')) return { success: true };
    return { success: true };
  }
  const db = {
    _state: state,
    prepare(sql) {
      const stmt = {
        _sql: sql, _args: [],
        bind(...a) { return { ...stmt, _args: a }; },
        async run() { return exec(this._sql, this._args); },
        async all() {
          if (this._sql.includes('FROM system_config')) return { results: [] };
          if (this._sql.includes('SELECT user_id FROM conversation_members')) {
            const conv = this._args[0];
            return { results: state.members.filter(m => m.conv_id === conv).map(m => ({ user_id: m.user_id })) };
          }
          if (this._sql.includes('FROM push_subscriptions')) {
            const uid = this._args[0];
            return { results: state.subscriptions.filter(s => s.user_id === uid) };
          }
          if (this._sql.includes('FROM messages WHERE conv_id=?')) {
            const conv = this._args[0];
            return { results: state.messages.filter(m => m.conv_id === conv).slice().sort((a, b) => b.ts - a.ts).slice(0, 50) };
          }
          return { results: [] };
        },
        async first() {
          if (this._sql.includes('FROM users WHERE id=?')) {
            return state.users.find(u => u.id === this._args[0]) || null;
          }
          return null;
        },
      };
      return stmt;
    },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  };
  return db;
}

// ── État DO mock (storage + blockConcurrencyWhile) ─────────────────────────
function makeState() {
  const store = new Map();
  return {
    storage: { async get(k) { return store.get(k); }, async put(k, v) { store.set(k, v); } },
    async blockConcurrencyWhile(fn) { return fn(); },
  };
}

// ── Client WebSocket simulé : capture les frames reçues ────────────────────
function fakeWs() {
  return {
    received: [],
    send(data) { try { this.received.push(JSON.parse(data)); } catch { this.received.push(data); } },
    addEventListener() {},
    last(type) { return [...this.received].reverse().find(m => m.type === type); },
    all(type) { return this.received.filter(m => m.type === type); },
  };
}

// ── Banc : une conversation, N membres, sessions connectées au choix ───────
async function makeConv(convId, members) {
  const db = makeDB();
  // enregistre les comptes + appartenances en D1
  for (const m of members) {
    db._state.users.push({ id: m.id, pseudo: m.pseudo, real_name: m.real_name });
    db._state.members.push({ conv_id: convId, user_id: m.id });
    // chaque membre a 1 abonnement push actif (device) → notif hors-ligne livrable
    db._state.subscriptions.push({
      user_id: m.id, endpoint: 'https://push.test/' + m.id,
      vapid_p256dh: 'p_' + m.id, vapid_auth: 'a_' + m.id, last_seen: Date.now(),
    });
  }
  db._state.conversations.push({ id: convId, type: members.length > 2 ? 'group' : 'dm' });
  const env = {
    APEX_CHAT_DB: db,
    JWT_SIGN_KEY: 'test-key',
    APEX_CHAT_ADMIN_TOKEN: 'tok',
    APEX_PUSH_WORKER_URL: 'https://push.test',
  };
  const DO = new ConversationDO(makeState(), env);
  await new Promise(r => setTimeout(r, 0)); // laisse le constructeur (seq/config) se régler
  const ws = {};
  function connect(userId) {
    const w = fakeWs();
    DO.sessions.set(w, { userId, deviceId: userId + '-dev', convId, messageCount: 0, lastReset: Date.now() });
    ws[userId] = w;
    return w;
  }
  async function send(fromId, payload) {
    await DO.handleMessage(ws[fromId], { type: 'message', ...payload });
    await DO.flushToD1(); // force la persistance pour vérifier la durabilité
  }
  return { DO, db, env, connect, send, ws };
}

const PAIRS = [
  { label: 'Kevin ↔ Laurence (cercle privé)', a: { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS' }, b: { id: 'lolo', pseudo: 'lolo', real_name: 'Laurence SAINT-POLIT' } },
  { label: 'Sandrine ↔ Christophe TARDIEU', a: { id: 'user_tardieu_sandrine', pseudo: 'sandrine', real_name: 'Sandrine TARDIEU' }, b: { id: 'user_tardieu_christophe', pseudo: 'christophe', real_name: 'Christophe TARDIEU' } },
  { label: 'compte NEUF quelconque (Alice ↔ Bob)', a: { id: 'u_alice_' + Date.now().toString(36), pseudo: 'alice', real_name: 'Alice MARTIN' }, b: { id: 'u_bob_' + Date.now().toString(36), pseudo: 'bob', real_name: 'Bob DURAND' } },
];

describe('Moteur messagerie — simulation 2 clients (marche pour TOUT LE MONDE)', () => {
  beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{"ok":true}')); });

  for (const P of PAIRS) {
    describe(P.label, () => {
      it('TEXTE : A→B et B→A livrés (broadcast), ACK à l\'expéditeur, persistés en D1', async () => {
        const conv = 'conv_' + P.a.id + '_' + P.b.id;
        const sim = await makeConv(conv, [P.a, P.b]);
        sim.connect(P.a.id); sim.connect(P.b.id);

        await sim.send(P.a.id, { ciphertext: 'Salut de ' + P.a.pseudo, mime: 'text/plain' });
        // B reçoit le message ; A reçoit son ack (pas le broadcast = pas de doublon)
        const recvB = sim.ws[P.b.id].last('message');
        expect(recvB).toBeTruthy();
        expect(recvB.sender_id).toBe(P.a.id);
        expect(recvB.ciphertext).toBe('Salut de ' + P.a.pseudo);
        expect(sim.ws[P.a.id].last('ack')).toBeTruthy();
        expect(sim.ws[P.a.id].all('message').length).toBe(0); // l'expéditeur ne se reçoit pas

        await sim.send(P.b.id, { ciphertext: 'Reçu, ' + P.b.pseudo + ' répond', mime: 'text/plain' });
        const recvA = sim.ws[P.a.id].last('message');
        expect(recvA.sender_id).toBe(P.b.id);
        expect(recvA.ciphertext).toBe('Reçu, ' + P.b.pseudo + ' répond');

        // Durabilité : les 2 messages sont en D1 (récupérables à la reconnexion)
        const hist = sim.db._state.messages.filter(m => m.conv_id === conv);
        expect(hist.length).toBe(2);
        expect(hist.map(m => m.sender_id).sort()).toEqual([P.a.id, P.b.id].sort());
      });

      it('PHOTO : une image part de A et arrive chez B comme message (mime image)', async () => {
        const conv = 'cphoto_' + P.a.id;
        const sim = await makeConv(conv, [P.a, P.b]);
        sim.connect(P.a.id); sim.connect(P.b.id);
        // côté app la photo = un marqueur média dans le corps + mime image
        await sim.send(P.a.id, { ciphertext: 'APXMEDIA1:{"url":"/api/media/x","mime":"image/jpeg","name":"photo.jpg"}', mime: 'image/jpeg' });
        const r = sim.ws[P.b.id].last('message');
        expect(r).toBeTruthy();
        expect(r.mime).toBe('image/jpeg');
        expect(r.ciphertext).toContain('APXMEDIA1:');
        expect(sim.db._state.messages.find(m => m.conv_id === conv && m.mime === 'image/jpeg')).toBeTruthy();
      });

      it('FICHIER : un PDF (dossier/fichier) arrive identiquement chez B', async () => {
        const conv = 'cfile_' + P.a.id;
        const sim = await makeConv(conv, [P.a, P.b]);
        sim.connect(P.a.id); sim.connect(P.b.id);
        await sim.send(P.a.id, { ciphertext: 'APXMEDIA1:{"url":"/api/media/d","mime":"application/pdf","name":"dossier.pdf"}', mime: 'application/pdf' });
        const r = sim.ws[P.b.id].last('message');
        expect(r.mime).toBe('application/pdf');
        expect(r.ciphertext).toContain('dossier.pdf');
      });

      it('HORS-LIGNE : B déconnecté → notif push envoyée + message gardé en D1 pour sa reconnexion', async () => {
        const conv = 'coff_' + P.a.id;
        const sim = await makeConv(conv, [P.a, P.b]);
        sim.connect(P.a.id); // B PAS connecté
        await sim.send(P.a.id, { ciphertext: 'Message pendant que B est absent', mime: 'text/plain' });
        // v1.1.206 : push réel vers la subscription de B via /web-push (plus le
        // stub /broadcast qui ne livrait rien).
        const pushCalls = globalThis.fetch.mock.calls.filter(c => String(c[0]).includes('/web-push'));
        expect(pushCalls.length).toBeGreaterThanOrEqual(1);
        const body = JSON.parse(pushCalls[0][1].body);
        expect(body.subscription.endpoint).toBe('https://push.test/' + P.b.id);
        expect(body.payload.payload.convId).toBe(conv);
        expect(body.payload.payload.senderId).toBe(P.a.id);
        // message bien en D1 → B le verra à la reconnexion (replay history)
        expect(sim.db._state.messages.some(m => m.conv_id === conv && m.sender_id === P.a.id)).toBe(true);
      });

      it('VISIO : signaling WebRTC (offer) de A relayé à B', async () => {
        const conv = 'cvis_' + P.a.id;
        const sim = await makeConv(conv, [P.a, P.b]);
        sim.connect(P.a.id); sim.connect(P.b.id);
        await sim.DO.handleMessage(sim.ws[P.a.id], { type: 'webrtc-offer', callType: 'video', offer: { sdp: 'v=0...' }, to: P.b.id });
        const off = sim.ws[P.b.id].last('webrtc-offer');
        expect(off).toBeTruthy();
        expect(off.from).toBe(P.a.id);
        expect(off.callType).toBe('video');
        expect(off.offer.sdp).toContain('v=0');
        // A ne reçoit pas son propre offer
        expect(sim.ws[P.a.id].all('webrtc-offer').length).toBe(0);
      });
    });
  }

  it('VISIO CONFÉRENCE (3+ : Kevin lance, Laurence + Sandrine reçoivent, répondent, Kevin reçoit les 2 réponses)', async () => {
    const conv = 'cconf_demo';
    const trio = [
      { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS' },
      { id: 'lolo', pseudo: 'lolo', real_name: 'Laurence SAINT-POLIT' },
      { id: 'user_tardieu_sandrine', pseudo: 'sandrine', real_name: 'Sandrine TARDIEU' },
    ];
    const sim = await makeConv(conv, trio);
    trio.forEach(u => sim.connect(u.id));

    // 1) Kevin lance la conf vidéo → l'offer est relayé à TOUS les autres participants
    await sim.DO.handleMessage(sim.ws['kdmc_admin'], { type: 'webrtc-offer', callType: 'video', offer: { sdp: 'v=0 conf' } });
    expect(sim.ws['lolo'].last('webrtc-offer')?.from).toBe('kdmc_admin');
    expect(sim.ws['user_tardieu_sandrine'].last('webrtc-offer')?.from).toBe('kdmc_admin');
    expect(sim.ws['kdmc_admin'].all('webrtc-offer').length).toBe(0); // pas à soi-même

    // 2) Laurence et Sandrine répondent → Kevin reçoit les 2 answers (mesh conf)
    await sim.DO.handleMessage(sim.ws['lolo'], { type: 'webrtc-answer', answer: { sdp: 'a=lolo' }, to: 'kdmc_admin' });
    await sim.DO.handleMessage(sim.ws['user_tardieu_sandrine'], { type: 'webrtc-answer', answer: { sdp: 'a=sandrine' }, to: 'kdmc_admin' });
    const answers = sim.ws['kdmc_admin'].all('webrtc-answer');
    expect(answers.length).toBe(2);
    expect(answers.map(a => a.from).sort()).toEqual(['lolo', 'user_tardieu_sandrine']);

    // 3) Échange de candidats ICE relayé entre participants
    await sim.DO.handleMessage(sim.ws['lolo'], { type: 'webrtc-candidate', candidate: { cand: 'ice-lolo' }, to: 'user_tardieu_sandrine' });
    expect(sim.ws['user_tardieu_sandrine'].last('webrtc-candidate')?.candidate.cand).toBe('ice-lolo');

    // 4) Fin d'appel diffusée
    await sim.DO.handleMessage(sim.ws['kdmc_admin'], { type: 'call-end' });
    expect(sim.ws['lolo'].last('call-end')).toBeTruthy();
    expect(sim.ws['user_tardieu_sandrine'].last('call-end')).toBeTruthy();
  });

  it('GROUPE (3 membres : Kevin, Laurence, Sandrine) — tous les autres reçoivent', async () => {
    const conv = 'cgroup_demo';
    const trio = [
      { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS' },
      { id: 'lolo', pseudo: 'lolo', real_name: 'Laurence SAINT-POLIT' },
      { id: 'user_tardieu_sandrine', pseudo: 'sandrine', real_name: 'Sandrine TARDIEU' },
    ];
    const sim = await makeConv(conv, trio);
    trio.forEach(u => sim.connect(u.id));
    await sim.send('kdmc_admin', { ciphertext: 'Bonjour le groupe', mime: 'text/plain' });
    // Laurence ET Sandrine reçoivent ; Kevin (expéditeur) non
    expect(sim.ws['lolo'].last('message')?.ciphertext).toBe('Bonjour le groupe');
    expect(sim.ws['user_tardieu_sandrine'].last('message')?.ciphertext).toBe('Bonjour le groupe');
    expect(sim.ws['kdmc_admin'].all('message').length).toBe(0);
    expect(sim.db._state.messages.filter(m => m.conv_id === conv).length).toBe(1);
  });
});
