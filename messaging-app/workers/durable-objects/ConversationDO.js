/**
 * ConversationDO — 1 Durable Object par conversation
 *
 * Responsabilités :
 *   - WebSocket multi-clients par conv (un client = un device user)
 *   - Séquencement messages (incrément local, garantit ordre strict)
 *   - Fan-out aux membres connectés (broadcast WS)
 *   - Persistence D1 toutes les 5s (audit + recovery)
 *   - Push notifications aux membres déconnectés (via push-worker)
 *   - Lecture flag KEVIN_INVISIBLE_ADMIN (architecture A→B→C)
 *   - État ratchet PQXDH persisté dans `storage` (clé "ratchet_state")
 *   - Stats live : member_count, messages_today, connected_now
 *
 * Le serveur ne déchiffre RIEN — il route uniquement des ciphertexts.
 */

import { sendPush } from '../lib/push-send.js';

// ── Garde-fous du moteur temps réel (revue 08.10.2026) ──────────────────────
const MAX_CIPHERTEXT = 100000;          // limite historique (100 KB)
const MAX_MIME = 128;
const MAX_REF_ID = 128;                 // reply_to.id / thread_root
const MAX_EMOJI = 16;                   // une réaction = un emoji (ZWJ inclus)
const MAX_REACTIONS_PER_MSG = 20;       // emojis DISTINCTS par message
const MEMBER_RECHECK_MS = 45000;        // re-vérif membership/ban/force-logout par socket
const FLUSH_MAX_ATTEMPTS = 100;         // au-delà, une ligne qui échoue encore est abandonnée (journalisée)
// Débits par socket et par minute (généreux : un humain n'atteint jamais ça).
const RATE_LIMITS = {
  message: 100, reaction: 120, edit_message: 30, delete_message: 30,
  read: 300, typing: 120, signaling: 600, poll_vote: 60, other: 120,
};
const SIGNALING_TYPES = new Set(['webrtc-offer', 'webrtc-answer', 'webrtc-candidate', 'call-end', 'call-busy']);
const E2E_TAG_RE = /^E2E\d+:/;
// Messages techniques du chiffrement de groupe (clés E2EGK1 / demandes E2EGR1) : relayés et gardés, mais
// ni notification push ni remontée de la conversation (last_msg_ts) — ce ne sont pas des messages lus par un humain.
const MIMES_SILENCIEUX = new Set(['application/x-apex-grpkey']);

/** Erreur SQLite qui ne se résoudra jamais en réessayant (ligne invalide). */
function isPermanentDbError(e) {
  return /constraint|NOT NULL|datatype mismatch|SQLITE_MISMATCH|SQLITE_TOOBIG|too big|no such column/i
    .test(String((e && e.message) || e));
}

/**
 * Valide/normalise les champs d'une trame `message` AVANT de l'accepter, pour
 * qu'aucune ligne empoisonnée n'atteigne le buffer (et donc flushToD1).
 * Retourne { ok:true, fields } ou { ok:false, error }.
 */
export function validateMessageFields(msg) {
  const ct = msg.ciphertext;
  if (ct == null || ct === '') return { ok: false, error: 'ciphertext required' };
  if (typeof ct !== 'string') return { ok: false, error: 'ciphertext must be a string' };
  if (ct.length > MAX_CIPHERTEXT) return { ok: false, error: 'ciphertext too large (max 100KB)' };

  let mime = 'text/plain';
  if (msg.mime != null) {
    if (typeof msg.mime !== 'string' || !msg.mime || msg.mime.length > MAX_MIME) return { ok: false, error: 'mime invalide' };
    mime = msg.mime;
  }

  // reply_to : la colonne D1 est l'ID du message parent (TEXT). Le client peut envoyer
  // un objet {id,text,from_name} : on n'en garde QUE l'id (string bornée). Le texte cité
  // (en clair) n'est volontairement PAS stocké : le serveur reste aveugle (E2E).
  let reply_to = null;
  if (msg.reply_to != null) {
    let rid = null;
    if (typeof msg.reply_to === 'string') rid = msg.reply_to;
    else if (typeof msg.reply_to === 'object' && !Array.isArray(msg.reply_to) && typeof msg.reply_to.id === 'string') rid = msg.reply_to.id;
    if (!rid || rid.length > MAX_REF_ID) return { ok: false, error: 'reply_to invalide' };
    reply_to = rid;
  }

  let thread_root = null;
  if (msg.thread_root != null) {
    if (typeof msg.thread_root !== 'string' || !msg.thread_root || msg.thread_root.length > MAX_REF_ID) {
      return { ok: false, error: 'thread_root invalide' };
    }
    thread_root = msg.thread_root;
  }

  let expires_at = null;
  if (msg.expires_at != null) {
    if (typeof msg.expires_at !== 'number' || !Number.isFinite(msg.expires_at) || msg.expires_at <= 0) {
      return { ok: false, error: 'expires_at invalide' };
    }
    expires_at = Math.floor(msg.expires_at);
  }

  return { ok: true, fields: { ciphertext: ct, mime, reply_to, thread_root, view_once: msg.view_once ? 1 : 0, expires_at } };
}

export class ConversationDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();   // ws → {userId, deviceId, lastSeq, connectedAt}
    this.seq = 0;                 // séquence locale messages
    this.lastFlush = Date.now();
    this.pendingMessages = [];    // buffer avant flush D1
    this._flushFails = new Map(); // id → nb d'échecs de flush (sans muter les enregistrements)
    // v1.1.242 : appel entrant mis en attente quand le destinataire n'est PAS
    // encore connecté à ce DO (il est sur une autre vue / app fermée). On garde
    // l'offer + les premiers ICE candidates ~45s et on les REJOUE quand il rejoint
    // la conv (via la notif). Sinon l'offer envoyé une seule fois était perdu →
    // "rien n'apparaît hors conversation". Le serveur ne voit aucun média (SDP only).
    this.pendingCall = null;      // { fromUserId, callType, offer, candidates:[], ts }
    this.config = null;

    // Hibernation : restore seq depuis storage
    state.blockConcurrencyWhile(async () => {
      this.seq = (await state.storage.get('seq')) || 0;
      this.config = await this.loadConfig();
    });
  }

  /** Politique e2e_strict (system_config.FEATURE_E2E_STRICT), rechargée au plus toutes les 60 s. */
  async e2eStrict() {
    try {
      if (!this._configTs || Date.now() - this._configTs > 60000) { this.config = await this.loadConfig(); this._configTs = Date.now(); }
      const v = this.config && this.config.FEATURE_E2E_STRICT;
      return v === 'true' || v === '1';
    } catch (_) { return false; }
  }

  /** e2e_strict ne vaut que pour les conversations à DEUX (dm) : un groupe n'a pas de
   *  chiffrement de bout en bout (l'app l'affiche honnêtement depuis v1.1.294) — sans cette
   *  exception, activer l'interrupteur coupait TOUS les messages de groupe (08.10.2026).
   *  Type mis en cache ; base illisible → on applique la règle (sûr). */
  async e2eStrictFor(convId) {
    if (!(await this.e2eStrict())) return false;
    try {
      if (!this._convTypes) this._convTypes = new Map();
      if (!this._convTypes.has(convId)) {
        const row = await this.env.APEX_CHAT_DB.prepare('SELECT type FROM conversations WHERE id=?').bind(convId).first();
        this._convTypes.set(convId, (row && row.type) || 'dm');
      }
      return this._convTypes.get(convId) === 'dm';
    } catch (_) { return true; }
  }

  async loadConfig() {
    try {
      const stmt = await this.env.APEX_CHAT_DB.prepare('SELECT key, value FROM system_config').all();
      const config = {};
      for (const row of (stmt.results || [])) config[row.key] = row.value;
      return config;
    } catch (e) {
      return { KEVIN_INVISIBLE_ADMIN: 'false', ADMIN_MODE: 'B' };  // P0 FIX : default B
    }
  }

  // P0 FIX (audit) : vérification JWT HMAC-SHA256
  async verifyJWT(token) {
    if (!token || !this.env.JWT_SIGN_KEY) return null;
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    try {
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(this.env.JWT_SIGN_KEY),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
      );
      const sigBytes = Uint8Array.from(
        atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=')),
        c => c.charCodeAt(0)
      );
      const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${h}.${p}`));
      if (!valid) return null;
      const payload = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/').padEnd(p.length + (4 - p.length % 4) % 4, '=')));
      if (payload.exp && payload.exp * 1000 < Date.now()) return null;
      return payload;
    } catch (e) {
      return null;
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Health endpoint
    if (url.pathname.endsWith('/health')) {
      return new Response(JSON.stringify({
        ok: true,
        connected: this.sessions.size,
        seq: this.seq,
        pending: this.pendingMessages.length
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // v1.1.172 FIX P1 (audit crew) : injection serveur→conv (Letters 24h /
    // delayed delivery). Avant, le cron letters-deliver POSTait ici une route
    // INEXISTANTE → 426, échec avalé, letters_queue marqué delivered=1 quand même
    // → message perdu silencieusement. On implémente la route + on persiste en D1
    // AVANT de répondre (livraison durable, broadcastée aux connectés).
    if (url.pathname.endsWith('/admin/inject-message')) {
      const internal = request.headers.get('X-Apex-Internal') || '';
      const expected = this.env.APEX_CHAT_ADMIN_TOKEN || '';
      if (!expected || internal !== expected) {
        return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
          status: 403, headers: { 'Content-Type': 'application/json' }
        });
      }
      let body = {};
      try { body = await request.json(); } catch (_) {}
      if (!body.conv_id || !body.sender_id || !body.ciphertext) {
        return new Response(JSON.stringify({ ok: false, error: 'conv_id, sender_id, ciphertext requis' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }
      // Même validation que la trame WS : une ligne invalide ne doit jamais entrer dans le buffer.
      const v = validateMessageFields({ ciphertext: body.ciphertext, mime: body.mime, expires_at: body.expires_at });
      if (!v.ok || typeof body.conv_id !== 'string' || typeof body.sender_id !== 'string') {
        return new Response(JSON.stringify({ ok: false, error: v.ok ? 'conv_id/sender_id invalides' : v.error }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }
      try {
        await this.state.blockConcurrencyWhile(async () => {
          this.seq++;
          await this.state.storage.put('seq', this.seq);
        });
        const rec = {
          id: crypto.randomUUID(),
          conv_id: body.conv_id,
          sender_id: body.sender_id,
          ciphertext: v.fields.ciphertext,
          mime: v.fields.mime,
          ts: Date.now(),
          reply_to: null, thread_root: null, view_once: 0,
          expires_at: v.fields.expires_at,
          seq: this.seq
        };
        this.pendingMessages.push(rec);
        this.broadcast({ type: 'message', ...rec });
        await this.notifyOfflineMembers(rec);
        await this.flushToD1();   // durable AVANT d'acquitter
        return new Response(JSON.stringify({ ok: true, id: rec.id }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // WebSocket upgrade
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // P0 FIX (audit) : vérification JWT obligatoire + check membership
    const token = url.searchParams.get('token');
    const claimedUserId = url.searchParams.get('uid');
    const deviceId = url.searchParams.get('did') || crypto.randomUUID();

    if (!token || !claimedUserId) {
      server.accept();
      server.close(1008, 'Auth required');
      return new Response(null, { status: 101, webSocket: client });
    }

    // Vérifier JWT signature (HS256)
    const jwtPayload = await this.verifyJWT(token);
    if (!jwtPayload) {
      server.accept();
      server.close(1008, 'Invalid token');
      return new Response(null, { status: 101, webSocket: client });
    }

    // Le claimed userId DOIT correspondre au sub du JWT
    const userId = jwtPayload.sub;
    if (claimedUserId !== userId) {
      server.accept();
      server.close(1008, 'UID mismatch');
      return new Response(null, { status: 101, webSocket: client });
    }

    // Vérifier que le user est bien membre de cette conv (D1 query)
    const convId = url.searchParams.get('conv') || this.state.id.toString();
    let joinedAt = 0;
    try {
      const member = await this.env.APEX_CHAT_DB.prepare(
        'SELECT user_id, role, joined_at FROM conversation_members WHERE conv_id=? AND user_id=?'
      ).bind(convId, userId).first();
      if (!member) {
        server.accept();
        server.close(1008, 'Not a member');
        return new Response(null, { status: 101, webSocket: client });
      }
      // v1.1.172 FIX P1 (audit crew) : honorer la révocation côté WebSocket.
      // Avant, force_logout/ban n'avait AUCUN effet sur une session WS active
      // (elle survivait jusqu'à expiration du JWT = 30j). On rejoue le même
      // contrôle que getAuthUser (REST) : banni / supprimé / JWT antérieur au
      // dernier force_logout → on coupe.
      const acct = await this.env.APEX_CHAT_DB.prepare(
        'SELECT is_banned, status, last_force_logout_at FROM users WHERE id=?'
      ).bind(userId).first();
      if (acct && (acct.is_banned || acct.status === 'deleted' ||
          (acct.last_force_logout_at && jwtPayload.iat &&
           acct.last_force_logout_at > jwtPayload.iat * 1000))) {
        server.accept();
        server.close(1008, 'Session révoquée');
        return new Response(null, { status: 101, webSocket: client });
      }
      joinedAt = Number(member.joined_at) || 0;   // ms (api-worker écrit Date.now())
    } catch (e) {
      server.accept();
      server.close(1011, 'DB error');
      return new Response(null, { status: 101, webSocket: client });
    }

    server.accept();
    const connectedAt = Date.now();
    this.sessions.set(server, {
      userId,
      deviceId,
      convId,                    // P0 FIX : convId D1 réel (pas DO id)
      lastSeq: 0,
      connectedAt,
      // Instant d'authentification : un force_logout POSTÉRIEUR coupe la socket (re-vérif périodique).
      authAt: (jwtPayload.iat ? jwtPayload.iat * 1000 : connectedAt),
      lastMemberCheck: connectedAt,
      joinedAt,
      messageCount: 0,           // pour rate limit
      lastReset: Date.now()
    });

    // Send hello
    server.send(JSON.stringify({
      type: 'hello',
      seq: this.seq,
      connected: this.sessions.size,
      ts: Date.now()
    }));

    // Historique : envoyer les 50 derniers messages (D1 + buffer non flushé)
    // → permet de retrouver ses conversations sur un nouvel appareil / après reset.
    try {
      // Revue 08.10.2026 : un membre ajouté APRÈS coup ne reçoit pas les messages antérieurs
      // à son arrivée (joined_at), et un message supprimé n'expose jamais son contenu.
      // 09.10.2026 : les messages de clés de groupe (MIMES_SILENCIEUX) ne prennent plus les 50 places des messages
      // lisibles — sinon un groupe actif montrait moins de 50 vrais messages. Ils arrivent à part (50 derniers),
      // car le téléphone en a besoin pour déchiffrer ce qu'il affiche.
      const cols = 'SELECT id, sender_id, ciphertext, mime, ts, reply_to, view_once, expires_at, edited_at, deleted_at FROM messages';
      const silencieux = [...MIMES_SILENCIEUX];
      const marques = silencieux.map(() => '?').join(',');
      const [hist, cles] = await Promise.all([
        this.env.APEX_CHAT_DB.prepare(
          cols + ' WHERE conv_id=? AND ts >= ? AND (mime IS NULL OR mime NOT IN (' + marques + ')) ORDER BY ts DESC LIMIT 50'
        ).bind(convId, joinedAt, ...silencieux).all(),
        this.env.APEX_CHAT_DB.prepare(
          cols + ' WHERE conv_id=? AND ts >= ? AND mime IN (' + marques + ') ORDER BY ts DESC LIMIT 50'
        ).bind(convId, joinedAt, ...silencieux).all(),
      ]);
      const seen = new Set();
      const rows = [...(hist.results || []), ...(cles.results || [])]
        .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
        .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
      // Ajouter les messages encore en buffer (pas encore flushés en D1)
      for (const pm of this.pendingMessages) {
        if (pm.conv_id === convId && !seen.has(pm.id)) {
          rows.push({ id: pm.id, sender_id: pm.sender_id, ciphertext: pm.ciphertext,
            mime: pm.mime, ts: pm.ts, reply_to: pm.reply_to || null,
            view_once: pm.view_once || 0, expires_at: pm.expires_at || null,
            edited_at: pm.edited_at || null, deleted_at: pm.deleted_at || null });
        }
      }
      const now = Date.now();
      const fresh = rows
        .filter(r => !r.expires_at || r.expires_at > now)
        .filter(r => !joinedAt || (Number(r.ts) || 0) >= joinedAt)
        // Tombstone : contenu vidé ('' = « message supprimé » côté client), jamais l'ancien texte.
        .map(r => (r.deleted_at ? { ...r, ciphertext: '' } : r));
      if (fresh.length) {
        server.send(JSON.stringify({ type: 'history', conv_id: convId, messages: fresh }));
      }
    } catch (e) {
      console.error('[ConversationDO] history send failed:', e.message);
    }

    // Notifier membres présents.
    // v1.1.254 FIX présence live : le client lit `data.status` ('online'/'offline'),
    // jamais `action`. Sans ce champ la garde client `if(pFrom && pStatus)` était
    // toujours fausse → présence WS morte (le 🟢 « en ligne » ne dépendait que du
    // heartbeat 3 min). On émet `status` EN PLUS de `action` (rétrocompat) → temps réel.
    this.broadcast({
      type: 'presence',
      userId,
      action: 'join',
      status: 'online',
      ts: Date.now()
    }, server);

    // v1.1.242 : REJOUER un appel entrant en attente. Si quelqu'un appelle
    // pendant que ce destinataire était sur une autre vue / app fermée, l'offer
    // a été mémorisé. Dès qu'il rejoint la conv (en touchant la notif), on lui
    // renvoie l'offer + les premiers ICE → l'app sonne et l'appel peut aboutir.
    try {
      const pc = this.pendingCall;
      if (pc && pc.fromUserId !== userId && (!pc.to || pc.to === userId) && (Date.now() - pc.ts) < 45000) {
        server.send(JSON.stringify({
          type: 'webrtc-offer', from: pc.fromUserId, fromDevice: pc.fromDevice,
          callType: pc.callType, offer: pc.offer, convId, ts: Date.now(), replayed: true,
        }));
        for (const cand of pc.candidates) {
          server.send(JSON.stringify({
            type: 'webrtc-candidate', from: pc.fromUserId, candidate: cand, convId, ts: Date.now(), replayed: true,
          }));
        }
      }
    } catch (e) {
      console.warn('[call replay] failed:', e && e.message);
    }

    // 08.10.2026 : rejouer les votes de sondage gardés (sinon un membre hors ligne ne les voit jamais).
    try {
      if (this.state.storage && typeof this.state.storage.list === 'function') {
        const polls = await this.state.storage.list({ prefix: 'pollvotes:', limit: 200 });
        for (const [k, all] of polls) {
          const pollId = k.slice('pollvotes:'.length);
          for (const [voter, votes] of Object.entries(all || {})) {
            if (Array.isArray(votes)) server.send(JSON.stringify({ type: 'poll_vote', poll_id: pollId, voter, votes, convId, replayed: true }));
          }
        }
      }
    } catch (e) {
      console.warn('[poll replay] failed:', e && e.message);
    }

    server.addEventListener('message', async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await this.handleMessage(server, msg);
      } catch (e) {
        server.send(JSON.stringify({ type: 'error', message: e.message }));
      }
    });

    server.addEventListener('close', async () => {
      const session = this.sessions.get(server);
      this.sessions.delete(server);
      if (session) {
        this.broadcast({
          type: 'presence',
          userId: session.userId,
          action: 'leave',
          status: 'offline',
          last_seen: Date.now(),
          ts: Date.now()
        });
      }
      // Audit 17/09/2026 (P1) : une fermeture (app tuée, réseau coupé) rend durable ce qui a
      // été acquitté — sinon l'éviction du DO peut suivre et emporter le buffer.
      try { await this.flushToD1(); } catch (_) { /* journalisé + re-queue dans flushToD1 */ }
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Débit par socket et par type de trame (fenêtre glissante d'1 minute). true = refusé. */
  _rateLimited(session, msg) {
    const now = Date.now();
    if (now - session.lastReset > 60000) {
      session.messageCount = 0;
      session.rl = {};
      session.lastReset = now;
    }
    if (msg.type === 'ping') return false;
    if (msg.type === 'message') {
      session.messageCount++;
      return session.messageCount > RATE_LIMITS.message;
    }
    const bucket = SIGNALING_TYPES.has(msg.type) ? 'signaling'
      : (RATE_LIMITS[msg.type] != null ? msg.type : 'other');
    if (!session.rl) session.rl = {};
    session.rl[bucket] = (session.rl[bucket] || 0) + 1;
    return session.rl[bucket] > RATE_LIMITS[bucket];
  }

  /**
   * Revue 08.10.2026 : la membership n'était vérifiée qu'à la connexion. Une socket
   * restait donc vivante après retrait de la conv / ban / force_logout. On re-vérifie
   * (au plus toutes les MEMBER_RECHECK_MS par socket) et on coupe en 1008.
   * Retourne false si la session a été révoquée (la trame ne doit pas être traitée).
   * Erreur D1 transitoire → on laisse passer (fail-open) et on réessaie à la trame suivante.
   */
  async _recheckMembership(ws, session) {
    const now = Date.now();
    if (session.lastMemberCheck == null) session.lastMemberCheck = session.connectedAt || now;
    if (now - session.lastMemberCheck < MEMBER_RECHECK_MS) return true;
    let reason = null;
    try {
      const member = await this.env.APEX_CHAT_DB.prepare(
        'SELECT user_id, role, joined_at FROM conversation_members WHERE conv_id=? AND user_id=?'
      ).bind(session.convId, session.userId).first();
      if (!member) {
        reason = 'Not a member';
      } else {
        const acct = await this.env.APEX_CHAT_DB.prepare(
          'SELECT is_banned, status, last_force_logout_at FROM users WHERE id=?'
        ).bind(session.userId).first();
        const authAt = session.authAt || session.connectedAt || 0;
        if (acct && (acct.is_banned || acct.status === 'deleted' ||
            (acct.last_force_logout_at && acct.last_force_logout_at > authAt))) {
          reason = 'Session révoquée';
        }
      }
    } catch (e) {
      console.warn('[ConversationDO] membership recheck failed:', e && e.message);
      return true;
    }
    session.lastMemberCheck = now;
    if (!reason) return true;
    this.sessions.delete(ws);
    this.broadcast({ type: 'presence', userId: session.userId, action: 'leave', status: 'offline', last_seen: now, ts: now });
    try { ws.close(1008, reason); } catch (_) {}
    return false;
  }

  /** Message encore en mémoire (buffer ou flush en cours) — pour l'autorisation edit/delete. */
  _findBuffered(id) {
    return this.pendingMessages.find(m => m.id === id) ||
      (this._inflight || []).find(m => m.id === id) || null;
  }

  /** Nombre de lignes modifiées par un UPDATE D1 (null si le driver ne le dit pas). */
  static _changes(res) {
    const c = res && res.meta && res.meta.changes;
    return (typeof c === 'number') ? c : null;
  }

  /**
   * L'appelant est-il l'auteur d'un message existant (non supprimé) de CETTE conv ?
   * Utilisé quand D1 ne renvoie pas meta.changes (repli défensif).
   */
  async _isAuthorInDb(session, messageId, allowDeleted = false) {
    try {
      const row = await this.env.APEX_CHAT_DB.prepare(
        'SELECT sender_id, deleted_at FROM messages WHERE id=? AND conv_id=?'
      ).bind(messageId, session.convId).first();
      return !!(row && row.sender_id === session.userId && (allowDeleted || !row.deleted_at));
    } catch (_) { return false; }
  }

  async handleMessage(ws, msg) {
    const session = this.sessions.get(ws);
    if (!session) return;
    if (!msg || typeof msg !== 'object') {
      return ws.send(JSON.stringify({ type: 'error', message: 'trame invalide' }));
    }

    // P0 FIX (audit) : rate limit 100 messages/min/session — étendu (revue 08.10.2026)
    // à reaction/edit/delete/read/typing/signaling (seuils généreux, cf. RATE_LIMITS).
    if (this._rateLimited(session, msg)) {
      return ws.send(JSON.stringify({ type: 'error', code: 'rate_limit',
        message: msg.type === 'message' ? 'Trop de messages, attends 1 minute' : 'Trop de requêtes, attends 1 minute' }));
    }

    // Re-vérification périodique membership / ban / force_logout (sauf ping).
    if (msg.type !== 'ping' && !(await this._recheckMembership(ws, session))) return;

    switch (msg.type) {
      case 'message': {
        // Nouveau message chiffré (ciphertext). Revue 08.10.2026 : TOUS les champs sont
        // validés à la réception — une ligne invalide bloquait flushToD1 pour toujours.
        const v = validateMessageFields(msg);
        if (!v.ok) return ws.send(JSON.stringify({ type: 'error', code: 'invalid_message', message: v.error }));
        // Audit 17/09/2026 (P1) : l'interrupteur admin « e2e_strict » n'était lu nulle part.
        // Quand il est ON, un message non chiffré de bout en bout (préfixe E2E1:/E2E2:) est refusé.
        if (!E2E_TAG_RE.test(v.fields.ciphertext) && await this.e2eStrictFor(session.convId)) {
          return ws.send(JSON.stringify({ type: 'error', code: 'e2e_required', message: 'Chiffrement de bout en bout obligatoire : la clé de ton contact doit être établie avant d\'envoyer' }));
        }

        // P0 FIX (audit) : utiliser blockConcurrencyWhile pour seq atomic
        await this.state.blockConcurrencyWhile(async () => {
          this.seq++;
          await this.state.storage.put('seq', this.seq);
        });

        const messageId = crypto.randomUUID();
        const ts = Date.now();

        const messageRecord = {
          id: messageId,
          conv_id: session.convId,        // P0 FIX (audit) : convId D1 réel (pas DO id)
          sender_id: session.userId,
          ciphertext: v.fields.ciphertext,
          mime: v.fields.mime,
          ts,
          reply_to: v.fields.reply_to,
          thread_root: v.fields.thread_root,
          view_once: v.fields.view_once,
          expires_at: v.fields.expires_at,
          seq: this.seq
        };

        this.pendingMessages.push(messageRecord);
        // Audit 17/09/2026 (P1) : le buffer n'était vidé qu'au 10e message ou au message
        // SUIVANT après 5 s — jamais par une alarme (alarm() existait, setAlarm n'était
        // appelé nulle part) ni à la fermeture. Un DO évincé emportait jusqu'à 9 messages
        // déjà ACQUITTÉS au client. L'alarme garantit un flush ≤ 5 s après le dernier message.
        this._armFlushAlarm();

        // Fan-out aux AUTRES clients (pas au sender — il reçoit déjà son ack
        // et a déjà affiché le message localement → évite le doublon).
        this.broadcast({
          type: 'message',
          ...messageRecord
        }, ws);

        // Push notif aux déconnectés (best-effort)
        await this.notifyOfflineMembers(messageRecord);

        // Flush D1 si > 10 messages OU > 5s
        if (this.pendingMessages.length >= 10 || Date.now() - this.lastFlush > 5000) {
          await this.flushToD1();
        }

        // client_id : l'id local du message envoyé — l'app associe l'accusé au BON message (revue 08.10).
        ws.send(JSON.stringify({ type: 'ack', id: messageId, seq: this.seq, ts, client_id: (typeof msg.id === 'string' && msg.id.length <= 128) ? msg.id : undefined }));
        break;
      }

      case 'typing':
        this.broadcast({
          type: 'typing',
          userId: session.userId,
          ts: Date.now()
        }, ws);
        break;

      case 'read': {
        if (typeof msg.message_id !== 'string' || !msg.message_id || msg.message_id.length > MAX_REF_ID) {
          return ws.send(JSON.stringify({ type: 'error', message: 'read: message_id invalide' }));
        }
        // Marquer last_read_msg_id
        await this.env.APEX_CHAT_DB.prepare(
          'UPDATE conversation_members SET last_read_msg_id=? WHERE conv_id=? AND user_id=?'
        ).bind(msg.message_id, session.convId, session.userId).run().catch(() => {});

        this.broadcast({
          type: 'read',
          userId: session.userId,
          message_id: msg.message_id,
          ts: Date.now()
        }, ws);
        break;
      }

      case 'reaction': {
        // Revue 08.10.2026 : emoji borné (string courte) + nombre d'emojis distincts plafonné.
        if (typeof msg.message_id !== 'string' || !msg.message_id || msg.message_id.length > MAX_REF_ID) {
          return ws.send(JSON.stringify({ type: 'error', message: 'reaction: message_id invalide' }));
        }
        if (typeof msg.emoji !== 'string' || !msg.emoji || msg.emoji.length > MAX_EMOJI) {
          return ws.send(JSON.stringify({ type: 'error', code: 'invalid_reaction', message: 'reaction: emoji invalide' }));
        }
        const action = (msg.action === 'add' || msg.action === 'remove') ? msg.action : undefined;
        // Update reactions JSON — SÉCU (audit P2) : scoper à la conversation courante
        // (conv_id=session.convId) pour empêcher un membre d'écrire une réaction sur un
        // message d'une AUTRE conversation via un message_id forgé.
        const existing = await this.env.APEX_CHAT_DB.prepare(
          'SELECT reactions FROM messages WHERE id=? AND conv_id=?'
        ).bind(msg.message_id, session.convId).first();
        if (existing) {
          let reactions = {};
          try { reactions = JSON.parse(existing.reactions || '{}'); } catch {}
          if (!reactions || typeof reactions !== 'object' || Array.isArray(reactions)) reactions = {};
          const list = Array.isArray(reactions[msg.emoji]) ? reactions[msg.emoji] : [];
          const has = list.includes(session.userId);
          const remove = action === 'remove' || (action !== 'add' && has);
          if (!remove && !has && !Object.prototype.hasOwnProperty.call(reactions, msg.emoji) &&
              Object.keys(reactions).length >= MAX_REACTIONS_PER_MSG) {
            return ws.send(JSON.stringify({ type: 'error', code: 'too_many_reactions', message: 'Trop de réactions différentes sur ce message' }));
          }
          reactions[msg.emoji] = list;
          if (remove) {
            reactions[msg.emoji] = list.filter(u => u !== session.userId);
            if (reactions[msg.emoji].length === 0) delete reactions[msg.emoji];
          } else if (!has) {
            reactions[msg.emoji].push(session.userId);
          }
          await this.env.APEX_CHAT_DB.prepare(
            'UPDATE messages SET reactions=? WHERE id=? AND conv_id=?'
          ).bind(JSON.stringify(reactions), msg.message_id, session.convId).run();

          this.broadcast({
            type: 'reaction',
            message_id: msg.message_id,
            reactions,
            userId: session.userId,
            ts: Date.now()
          });
        } else {
          // v1.1.226 (Kevin « Laurence ne voit pas le cœur ») : message pas en D1
          // (ex. média non persisté côté serveur) → on relaie quand même le delta
          // EN LIVE pour que le correspondant voie la réaction.
          this.broadcast({
            type: 'reaction',
            message_id: msg.message_id,
            emoji: msg.emoji,
            action: action || 'add',
            userId: session.userId,
            ts: Date.now()
          });
        }
        break;
      }

      // v1.1.255 — Édition propagée serveur (parité WhatsApp « modifié »).
      // Avant : le client envoyait `edit_message` mais le DO tombait dans
      // `default` (« Type inconnu ») → l'édition ne se persistait NI ne se
      // propageait aux autres appareils. SÉCU : seul l'AUTEUR édite (garde
      // sender_id), scope conv_id (pas de message forgé d'une autre conv).
      case 'edit_message': {
        // Contenu = ciphertext (E2E ON, taggé E2E1:) OU new_text (E2E OFF, legacy).
        // Le même champ `ciphertext` de la table stocke l'un ou l'autre selon le
        // mode de la conversation (cohérent avec le case 'message').
        const editContent = (msg.ciphertext != null) ? msg.ciphertext : msg.new_text;
        if (typeof msg.message_id !== 'string' || !msg.message_id || editContent == null || editContent === '') {
          return ws.send(JSON.stringify({ type: 'error', message: 'edit: message_id + contenu requis' }));
        }
        if (typeof editContent !== 'string') {
          return ws.send(JSON.stringify({ type: 'error', message: 'edit: contenu invalide' }));
        }
        if (editContent.length > MAX_CIPHERTEXT) {
          return ws.send(JSON.stringify({ type: 'error', message: 'contenu trop grand (max 100KB)' }));
        }
        // Revue 08.10.2026 : e2e_strict s'applique AUSSI à l'édition (sinon on contournait
        // l'interrupteur en envoyant un message chiffré puis en l'éditant en clair).
        if (!E2E_TAG_RE.test(editContent) && await this.e2eStrictFor(session.convId)) {
          return ws.send(JSON.stringify({ type: 'error', code: 'e2e_required', message: 'Chiffrement de bout en bout obligatoire : modification en clair refusée' }));
        }
        const editedAt = Date.now();
        const res = await this.env.APEX_CHAT_DB.prepare(
          'UPDATE messages SET ciphertext=?, edited_at=? WHERE id=? AND conv_id=? AND sender_id=? AND deleted_at IS NULL'
        ).bind(editContent, editedAt, msg.message_id, session.convId, session.userId).run();
        // Met aussi à jour un éventuel message encore en attente de flush.
        const buf = this._findBuffered(msg.message_id);
        const pend = (buf && buf.sender_id === session.userId && !buf.deleted_at &&
          (buf.conv_id == null || buf.conv_id === session.convId)) ? buf : null;
        if (pend) { pend.ciphertext = editContent; pend.edited_at = editedAt; }
        // Revue 08.10.2026 : on ne diffuse QUE si l'appelant est bien l'auteur
        // (une ligne D1 modifiée, ou son message encore en buffer). Avant, un UPDATE
        // qui ne matchait rien (pas l'auteur) était quand même diffusé à tous.
        const ch = ConversationDO._changes(res);
        const authorized = !!pend || (ch != null ? ch > 0 : await this._isAuthorInDb(session, msg.message_id));
        if (!authorized) {
          return ws.send(JSON.stringify({ type: 'error', code: 'forbidden', message: 'edit: message introuvable ou tu n\'en es pas l\'auteur', id: msg.message_id }));
        }
        // Broadcast le delta à TOUS (dont l'expéditeur → sync multi-appareils).
        // On rediffuse les DEUX champs pour que tout client (E2E on/off) applique.
        this.broadcast({
          type: 'edit_message',
          message_id: msg.message_id,
          ciphertext: (msg.ciphertext != null) ? msg.ciphertext : null,
          new_text: (msg.ciphertext == null) ? msg.new_text : null,
          edited_at: editedAt,
          userId: session.userId,
          ts: editedAt,
        });
        ws.send(JSON.stringify({ type: 'ack', id: msg.message_id, edited_at: editedAt }));
        break;
      }

      // v1.1.255 — Suppression pour tous propagée serveur (parité WhatsApp).
      // SÉCU : seul l'AUTEUR supprime (sender_id), scope conv_id. On efface le
      // contenu en base et on marque deleted_at → tombstone. Revue 08.10.2026 :
      // ciphertext est NOT NULL (0001_init.sql) → on écrit '' (et non NULL, refusé par D1).
      case 'delete_message': {
        if (typeof msg.message_id !== 'string' || !msg.message_id) {
          return ws.send(JSON.stringify({ type: 'error', message: 'delete: message_id requis' }));
        }
        const deletedAt = Date.now();
        const res = await this.env.APEX_CHAT_DB.prepare(
          "UPDATE messages SET deleted_at=?, ciphertext='' WHERE id=? AND conv_id=? AND sender_id=?"
        ).bind(deletedAt, msg.message_id, session.convId, session.userId).run();
        const buf = this._findBuffered(msg.message_id);
        const pend = (buf && buf.sender_id === session.userId &&
          (buf.conv_id == null || buf.conv_id === session.convId)) ? buf : null;
        if (pend) { pend.deleted_at = deletedAt; pend.ciphertext = ''; }
        const ch = ConversationDO._changes(res);
        const authorized = !!pend || (ch != null ? ch > 0 : await this._isAuthorInDb(session, msg.message_id, true));
        if (!authorized) {
          return ws.send(JSON.stringify({ type: 'error', code: 'forbidden', message: 'delete: message introuvable ou tu n\'en es pas l\'auteur', id: msg.message_id }));
        }
        this.broadcast({
          type: 'delete_message',
          message_id: msg.message_id,
          deleted_at: deletedAt,
          userId: session.userId,
          ts: deletedAt,
        });
        ws.send(JSON.stringify({ type: 'ack', id: msg.message_id, deleted_at: deletedAt }));
        break;
      }

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        break;

      // Visio / appels WebRTC — relay signaling SDP + ICE candidates entre peers
      // Pas de stockage : le serveur ne voit jamais les médias (E2E P2P).
      case 'webrtc-offer':
      case 'webrtc-answer':
      case 'webrtc-candidate':
      case 'call-end':
      case 'call-busy':
      {
        // Revue 08.10.2026 : si la trame vise un destinataire (`to`), on ne l'envoie
        // QU'À ses sockets (en groupe, les autres membres ne reçoivent plus le SDP/ICE
        // d'un appel qui ne les concerne pas). Sans `to` (1:1 legacy) → broadcast.
        if (msg.to != null && (typeof msg.to !== 'string' || !msg.to || msg.to.length > MAX_REF_ID)) {
          return ws.send(JSON.stringify({ type: 'error', message: 'signaling: destinataire invalide' }));
        }
        const target = msg.to || null;
        const frame = {
          type: msg.type,
          from: session.userId,
          fromDevice: session.deviceId,
          to: target,
          callType: msg.callType || null,
          offer: msg.offer,
          answer: msg.answer,
          candidate: msg.candidate,
          convId: session.convId,
          ts: Date.now(),
        };
        if (target) this.sendToUser(target, frame, ws);
        else this.broadcast(frame, ws);
      }
        // v1.1.150 : push d'appel — sur un OFFER, si le destinataire n'est pas
        // connecté en WS, on lui envoie une notification "📞 Appel entrant".
        // Toucher la notif ouvre l'app sur la conv (le caller doit attendre
        // la connexion WS pour que le SDP/ICE soient relayés).
        if (msg.type === 'webrtc-offer') {
          // v1.1.242 : mémorise l'appel en cours pour le REJOUER au destinataire
          // quand il rejoindra la conv (cf. join handler). Sans ça l'offer envoyé
          // une seule fois est perdu si le destinataire n'était pas connecté.
          this.pendingCall = {
            fromUserId: session.userId,
            fromDevice: session.deviceId,
            to: msg.to || null,
            callType: msg.callType || 'audio',
            offer: msg.offer,
            candidates: [],
            ts: Date.now(),
          };
          this.notifyOfflineCall(session.userId, session.convId, msg.callType || 'audio')
            .catch((e) => console.warn('[call push] failed:', e && e.message));
        } else if (msg.type === 'webrtc-candidate') {
          // bufferise les premiers ICE du caller (≤30) pour les rejouer au join
          if (this.pendingCall && this.pendingCall.fromUserId === session.userId
              && this.pendingCall.candidates.length < 30 && msg.candidate) {
            this.pendingCall.candidates.push(msg.candidate);
          }
        } else if (msg.type === 'webrtc-answer' || msg.type === 'call-end' || msg.type === 'call-busy') {
          // appel décroché ou terminé → plus rien à rejouer
          this.pendingCall = null;
        }
        break;

      case 'poll_vote': {
        // 08.10.2026 : les votes de sondage étaient JETÉS (« Type inconnu ») → personne ne
        // voyait les votes des autres. Le votant est imposé (session), jamais celui du client ;
        // les votes sont gardés (stockage du DO) pour être rejoués à la reconnexion.
        const pollId = msg.poll_id;
        if (typeof pollId !== 'string' || !pollId || pollId.length > 128) {
          return ws.send(JSON.stringify({ type: 'error', message: 'poll_vote: poll_id invalide' }));
        }
        const raw = Array.isArray(msg.votes) ? msg.votes : null;
        if (!raw || raw.length > 50 || !raw.every((x) => Number.isInteger(x) && x >= 0 && x < 50)) {
          return ws.send(JSON.stringify({ type: 'error', message: 'poll_vote: votes invalides' }));
        }
        const votes = [...new Set(raw)];
        const key = 'pollvotes:' + pollId;
        let all = {};
        try { all = (await this.state.storage.get(key)) || {}; } catch (_) { all = {}; }
        if (typeof all !== 'object' || Array.isArray(all)) all = {};
        if (votes.length) all[session.userId] = votes; else delete all[session.userId];
        try { await this.state.storage.put(key, all); } catch (e) { console.warn('[poll_vote] stockage:', e && e.message); }
        this.broadcast({ type: 'poll_vote', poll_id: pollId, voter: session.userId, votes, convId: session.convId, ts: Date.now() }, ws);
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Type inconnu: ' + msg.type }));
    }
  }

  /** Envoie uniquement aux sockets d'un utilisateur donné (sauf `exclude`). */
  sendToUser(userId, payload, exclude = null) {
    const data = JSON.stringify(payload);
    for (const [ws, session] of this.sessions) {
      if (ws === exclude || !session || session.userId !== userId) continue;
      try { ws.send(data); } catch (e) { /* client mort */ }
    }
  }

  broadcast(payload, exclude = null) {
    const data = JSON.stringify(payload);
    for (const [ws, _session] of this.sessions) {
      if (ws === exclude) continue;
      try {
        ws.send(data);
      } catch (e) {
        // Client mort, on cleanup au prochain close
      }
    }
  }

  async notifyOfflineMembers(messageRecord) {
    // Distribution de clés de groupe (E2EGK1/E2EGR1) : technique, jamais affichée → pas de « 💬 Nouveau message ».
    if (MIMES_SILENCIEUX.has(messageRecord.mime)) return;
    try {
      // Récupérer tous les members de la conv
      const members = await this.env.APEX_CHAT_DB.prepare(
        'SELECT user_id FROM conversation_members WHERE conv_id=?'
      ).bind(messageRecord.conv_id).all();

      // Identifier ceux qui ne sont PAS connectés ici
      const connectedUsers = new Set([...this.sessions.values()].map(s => s.userId));
      const offline = (members.results || []).filter(m =>
        m.user_id !== messageRecord.sender_id && !connectedUsers.has(m.user_id)
      );

      if (offline.length === 0) return;

      // v1.1.150 : nom de l'expéditeur dans la notif (titre plus parlant que "Apex Chat")
      let senderName = 'Quelqu\'un';
      try {
        const u = await this.env.APEX_CHAT_DB.prepare(
          'SELECT pseudo, real_name FROM users WHERE id=?'
        ).bind(messageRecord.sender_id).first();
        if (u) senderName = u.real_name || u.pseudo || senderName;
      } catch (_) {}

      const pushPayload = {
        title: senderName,
        body: '💬 Nouveau message',
        tag: `conv-${messageRecord.conv_id}`,
        renotify: true,
        payload: {
          type: 'message',
          convId: messageRecord.conv_id,
          messageId: messageRecord.id,
          senderId: messageRecord.sender_id,
          senderName,
          ts: messageRecord.ts
        }
      };

      await this._pushToUsers(offline.map(m => m.user_id), pushPayload);
    } catch (e) {
      console.error('notifyOfflineMembers error', e.message);
    }
  }

  // v1.1.150 : push d'appel entrant. Quand un offer WebRTC arrive et que
  // le destinataire n'est PAS connecté en WS, on lui envoie un push "📞 Appel
  // entrant de X" avec actions Répondre/Refuser → l'app ouverte via la notif
  // peut décrocher (recipient must be online at that point for WebRTC).
  async notifyOfflineCall(callerUserId, convId, callType) {
    try {
      const members = await this.env.APEX_CHAT_DB.prepare(
        'SELECT user_id FROM conversation_members WHERE conv_id=?'
      ).bind(convId).all();
      const connectedUsers = new Set([...this.sessions.values()].map(s => s.userId));
      const offline = (members.results || []).filter(m =>
        m.user_id !== callerUserId && !connectedUsers.has(m.user_id)
      );
      if (offline.length === 0) return;

      let callerName = 'Quelqu\'un';
      try {
        const u = await this.env.APEX_CHAT_DB.prepare(
          'SELECT pseudo, real_name FROM users WHERE id=?'
        ).bind(callerUserId).first();
        if (u) callerName = u.real_name || u.pseudo || callerName;
      } catch (_) {}

      const isVideo = callType === 'video';
      const pushPayload = {
        title: '📞 Appel ' + (isVideo ? 'vidéo' : 'audio') + ' entrant',
        body: callerName + ' t\'appelle',
        tag: `call-${convId}`,
        renotify: true,
        urgent: true,
        payload: {
          type: 'call',
          convId,
          callerId: callerUserId,
          callerName,
          callType: callType || 'audio',
          ts: Date.now()
        }
      };
      await this._pushToUsers(offline.map(m => m.user_id), pushPayload);
    } catch (e) {
      console.error('notifyOfflineCall error', e.message);
    }
  }

  // Helper : push fire-and-forget vers une liste d'user_ids.
  // v1.1.206 (Kevin "je ne reçois pas les notifs hors app, Laurence pareil") —
  // BUG racine : on postait sur push-worker /broadcast avec topic:user:<uid>,
  // mais /broadcast est un STUB qui ne lit AUCUNE subscription et renvoie ok:true
  // → 100% des pushs de message/appel perdus en silence. Le DO tourne DANS
  // l'api-worker → il a APEX_CHAT_DB. On résout donc les subscriptions ici et on
  // appelle l'endpoint /web-push qui FONCTIONNE (VAPID + chiffrement), 1 par
  // device, comme sendPushToUser côté api-worker.
  async _pushToUsers(userIds, pushPayload) {
    const cutoff = Date.now() - 30 * 86400000; // ignore les subs mortes > 30 j
    for (const uid of userIds) {
      let subs;
      try {
        subs = await this.env.APEX_CHAT_DB.prepare(
          'SELECT endpoint, vapid_p256dh, vapid_auth FROM push_subscriptions WHERE user_id=? AND last_seen > ?'
        ).bind(uid, cutoff).all();
      } catch (e) {
        console.warn('[push] lookup subscriptions failed for', uid, e && e.message);
        continue;
      }
      const rows = (subs && subs.results) || [];
      if (rows.length === 0) {
        console.warn('[push] aucune subscription active pour', uid);
        continue;
      }
      for (const sub of rows) {
        if (!sub.endpoint || !sub.vapid_p256dh) continue;
        // v1.1.243 : Service Binding (worker→worker autorisé) — fix Cloudflare 1042.
        sendPush(this.env, { endpoint: sub.endpoint, keys: { p256dh: sub.vapid_p256dh, auth: sub.vapid_auth } }, pushPayload)
          .then((r) => { if (!r.ok) console.warn('[push] web-push', uid, 'HTTP', r.status); })
          .catch((e) => console.warn('[push]', uid, 'web-push failed:', e && e.message));
      }
    }
  }

  /** Programme une alarme 5 s (idempotent, best-effort : un mock sans setAlarm ne casse rien). */
  _armFlushAlarm() {
    try {
      const st = this.state && this.state.storage;
      if (st && typeof st.setAlarm === 'function') {
        const p = st.setAlarm(Date.now() + 5000);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (_) { /* best-effort */ }
  }

  async flushToD1() {
    if (this.pendingMessages.length === 0) return;

    const toFlush = [...this.pendingMessages];
    this.pendingMessages = [];
    this._inflight = toFlush;
    this.lastFlush = Date.now();

    // Revue 08.10.2026 : insertion IDEMPOTENTE (ON CONFLICT(id) DO NOTHING) — un flush
    // partiellement réussi ne peut plus boucler sur une clé dupliquée. edited_at/deleted_at
    // sont persistés (un message édité/supprimé avant le flush reste édité/supprimé).
    const stmt = this.env.APEX_CHAT_DB.prepare(
      `INSERT INTO messages (id, conv_id, sender_id, ciphertext, mime, ts, reply_to, thread_root, view_once, expires_at, edited_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`
    );
    const bindRow = (m) => stmt.bind(m.id, m.conv_id, m.sender_id,
      (m.ciphertext == null ? '' : m.ciphertext), m.mime == null ? null : m.mime, m.ts,
      m.reply_to == null ? null : m.reply_to, m.thread_root == null ? null : m.thread_root,
      m.view_once ? 1 : 0, m.expires_at == null ? null : m.expires_at,
      m.edited_at == null ? null : m.edited_at, m.deleted_at == null ? null : m.deleted_at);

    const persisted = [];
    const requeue = [];
    const fails = this._flushFails || (this._flushFails = new Map());
    // Un lot qui a déjà échoué une fois est rejoué LIGNE PAR LIGNE : une ligne
    // empoisonnée ne peut plus bloquer toute la conversation.
    const rowMode = toFlush.some(m => fails.has(m.id));

    const report = (msgText) => {
      try {
        const p = this.env.TELEMETRY_QUEUE?.send({ sentinel: 'do-flush-error', severity: 'err', msg: msgText, ts: Date.now() });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
    };

    try {
      if (!rowMode) {
        try {
          await this.env.APEX_CHAT_DB.batch(toFlush.map(bindRow));
          persisted.push(...toFlush);
        } catch (e) {
          console.error('flushToD1 error', e.message);
          // Re-queue : le prochain flush passera en mode ligne par ligne.
          for (const m of toFlush) { fails.set(m.id, (fails.get(m.id) || 0) + 1); requeue.push(m); }
          report(e.message);
        }
      } else {
        for (const m of toFlush) {
          try {
            await bindRow(m).run();
            persisted.push(m);
          } catch (e) {
            const n = (fails.get(m.id) || 0) + 1;
            if (isPermanentDbError(e) || n >= FLUSH_MAX_ATTEMPTS) {
              // Ligne définitivement invalide : on l'abandonne (journalisée) au lieu de bloquer.
              console.error('flushToD1 drop row', m.id, e.message);
              fails.delete(m.id);
              report('drop ' + m.id + ': ' + e.message);
            } else {
              fails.set(m.id, n);
              requeue.push(m);
            }
          }
        }
        if (requeue.length) report('row retry pending: ' + requeue.length);
      }

      for (const m of persisted) fails.delete(m.id);

      // Update conv last_msg_ts (un échec ici ne remet PAS les messages en file).
      // Une distribution de clés ne fait pas remonter la conversation : dernier message VISIBLE seulement.
      const visibles = persisted.filter((m) => !MIMES_SILENCIEUX.has(m.mime));
      if (visibles.length) {
        const lastMsg = visibles[visibles.length - 1];
        try {
          await this.env.APEX_CHAT_DB.prepare(
            'UPDATE conversations SET last_msg_id=?, last_msg_ts=? WHERE id=?'
          ).bind(lastMsg.id, lastMsg.ts, lastMsg.conv_id).run();
        } catch (e) {
          console.error('flushToD1 last_msg update error', e.message);
        }
      }
    } finally {
      // Re-queue les messages non persistés (en tête, ordre conservé).
      if (requeue.length) this.pendingMessages.unshift(...requeue);
      this._inflight = [];
    }
  }

  async alarm() {
    // Alarme armée par _armFlushAlarm() à chaque message : flush ≤ 5 s après le dernier.
    await this.flushToD1();
    // Si le flush a échoué (re-queue), on réessaie plus tard plutôt que d'attendre le message suivant.
    if (this.pendingMessages.length > 0) this._armFlushAlarm();
  }
}

/**
 * BroadcastDO — DO root pour channels broadcast > 5K membres
 * Sharding hiérarchique : root → N worker DOs (chaque shard ~5K subs max)
 */
export class BroadcastDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.shards = [];

    state.blockConcurrencyWhile(async () => {
      this.shards = (await state.storage.get('shards')) || [];
    });
  }

  async fetch(request) {
    // Stub pour Phase 4 — implémentation détaillée avec sharding hiérarchique
    return new Response(JSON.stringify({ ok: true, type: 'BroadcastDO', shards: this.shards.length }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * PresenceDO — 1 par tenant région (FR/EU/US)
 * Heartbeat 30s, source de vérité online/last_seen
 */
export class PresenceDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.online = new Map();  // userId → { lastHeartbeat, devices: [...] }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/heartbeat')) {
      const { userId, deviceId } = await request.json();
      this.online.set(userId, {
        lastHeartbeat: Date.now(),
        deviceId
      });
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname.endsWith('/list')) {
      // Cleanup users inactifs > 90s
      const cutoff = Date.now() - 90000;
      for (const [uid, p] of this.online) {
        if (p.lastHeartbeat < cutoff) this.online.delete(uid);
      }
      return new Response(JSON.stringify({
        ok: true,
        online_count: this.online.size,
        users: [...this.online.keys()]
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname.endsWith('/check')) {
      const { userId } = await request.json();
      const p = this.online.get(userId);
      const isOnline = p && (Date.now() - p.lastHeartbeat < 90000);
      return new Response(JSON.stringify({ ok: true, online: !!isOnline, lastSeen: p?.lastHeartbeat }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
}
