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
// Lot A (audit A2, 15.10.2026) — durabilité AVANT l'accusé, rattrapage, révocation.
// A2-01/A2-01c : chaque message accepté est écrit dans le stockage du DO (clé `pend:`) AVANT
// l'accusé, rechargé à la construction, et effacé seulement une fois en D1. Plus d'abandon
// après N essais : une panne D1 transitoire espace les essais (recul exponentiel borné) ;
// seule une erreur SQLite PERMANENTE met la ligne en quarantaine (`quar:`, journalisée).
const FLUSH_DELAY_MS = 5000;            // flush au plus 5 s après un message
const FLUSH_BACKOFF_MAX_MS = 5 * 60000; // recul maximal entre deux essais pendant une panne D1
const PEND_PREFIX = 'pend:';            // messages acquittés, pas encore en D1
const QUAR_PREFIX = 'quar:';            // lignes refusées définitivement par SQLite (jamais effacées en silence)
const MAX_PENDING = 5000;               // contre-pression : au-delà, refus SANS accusé (le client garde son envoi)
const MAX_PENDING_BYTES = 16 * 1024 * 1024;
const RECENT_IDS_MAX = 2000;            // A2-08 : accusés récents gardés pour dédupliquer un renvoi
// A2-03 : rattrapage paginé (trame `history_since`).
const CATCHUP_PAGE_DEFAULT = 100;
const CATCHUP_PAGE_MAX = 200;
const CATCHUP_CHANGES_MAX = 500;        // A2-16 : éditions/suppressions d'anciens messages renvoyées au rattrapage
// A2-02 : filet périodique (alarme) tant que des sockets restent ouvertes — lent, pour rester gratuit :
// la vraie garantie est la re-vérification des sessions périmées AVANT chaque diffusion + la révocation interne.
const RECHECK_TIMER_MS = 5 * 60000;
const REVOKE_TYP = 'dorevoke';          // jeton interne signé par l'api-worker (même clé que `wsfwd`)
// Débits par socket et par minute (généreux : un humain n'atteint jamais ça).
const RATE_LIMITS = {
  message: 100, reaction: 120, edit_message: 30, delete_message: 30,
  read: 300, typing: 120, signaling: 600, poll_vote: 60, history_since: 60, other: 120,
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

/** Clé de stockage d'un message en attente : ordonnée par seq (rechargement dans l'ordre). */
function pendKey(m) {
  return PEND_PREFIX + String(Number(m.seq) || 0).padStart(12, '0') + ':' + m.id;
}

/** Ordre total du rattrapage : (ts, id). */
function afterCursor(r, ts, id) {
  return r.ts > ts || (r.ts === ts && String(r.id) > id);
}
function byTsId(a, b) {
  return (a.ts - b.ts) || (String(a.id) < String(b.id) ? -1 : 1);
}

/** Ligne renvoyée au client (historique, rattrapage) : champs publics, tombstone sans contenu. */
function publicRow(r) {
  return {
    id: r.id, sender_id: r.sender_id, ciphertext: r.deleted_at ? '' : r.ciphertext,
    mime: r.mime, ts: r.ts, reply_to: r.reply_to || null,
    view_once: r.view_once || 0, expires_at: r.expires_at || null,
    edited_at: r.edited_at || null, deleted_at: r.deleted_at || null,
  };
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
    this._inflight = [];          // lot en cours d'écriture D1 (visible par l'historique et l'édition)
    this._flushing = null;        // promesse du flush en cours (un seul à la fois)
    this._flushFailStreak = 0;    // échecs transitoires consécutifs (recul exponentiel)
    this._flushRetryAt = 0;       // pas de nouvel essai avant cet instant
    this._recent = new Map();     // id → { seq, ts } : accusés récents (A2-08, renvoi idempotent)
    this._recheckTimer = false;   // A2-02 : filet périodique démarré par une connexion WebSocket

    // Hibernation / redémarrage : restore seq + messages acquittés pas encore en D1 (A2-01).
    state.blockConcurrencyWhile(async () => {
      this.seq = (await state.storage.get('seq')) || 0;
      this.config = await this.loadConfig();
      await this._restorePending();
    });
  }

  /** A2-01 : recharge les messages acquittés (clé `pend:`) qu'une instance précédente n'a pas écrits en D1. */
  async _restorePending() {
    const st = this.state.storage;
    if (typeof st.list !== 'function') return;
    try {
      const saved = await st.list({ prefix: PEND_PREFIX });
      const known = new Set([...this.pendingMessages, ...this._inflight].map((m) => m.id));
      const restored = [];
      for (const [, rec] of saved) {
        if (rec && rec.id && !known.has(rec.id)) { known.add(rec.id); restored.push(rec); }
      }
      if (restored.length) {
        this.pendingMessages = [...restored, ...this.pendingMessages].sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
        console.warn('[ConversationDO] reprise de', restored.length, 'message(s) acquitté(s) non écrits en D1');
        this._armFlushAlarm();
      }
    } catch (e) {
      console.error('[ConversationDO] reprise du stockage impossible:', String(e));
    }
  }

  /** Écrit (durable) un message en attente de D1. Lève en cas d'échec : l'appelant ne doit PAS acquitter. */
  async _persistPending(rec) {
    await this.state.storage.put(pendKey(rec), rec);
  }

  /** Efface les clés `pend:` des messages désormais en D1 (best-effort : une clé restante est rejouée sans doublon). */
  async _forgetPending(recs) {
    const st = this.state.storage;
    if (!recs.length || typeof st.delete !== 'function') return;
    await Promise.all(recs.map(async (m) => {
      try { await st.delete(pendKey(m)); } catch (e) { console.warn('[ConversationDO] effacement pend:', String(e)); }
    }));
  }

  /** A2-01c : une ligne refusée DÉFINITIVEMENT par SQLite n'est jamais jetée en silence : quarantaine journalisée. */
  async _quarantine(m, err, report) {
    const why = String(err.message || err);
    console.error('[ConversationDO] quarantaine', m.id, why);
    report('quarantine ' + m.id + ': ' + why);
    const st = this.state.storage;
    try {
      await st.put(QUAR_PREFIX + pendKey(m).slice(PEND_PREFIX.length), { rec: m, error: why, at: Date.now() });
      if (typeof st.delete === 'function') await st.delete(pendKey(m));
    } catch (e) {
      // La clé `pend:` reste : la ligne sera rechargée au prochain démarrage (jamais perdue).
      console.error('[ConversationDO] quarantaine non écrite', m.id, String(e));
    }
  }

  /** Contre-pression : le buffer en RAM est borné (une panne D1 longue ne fait pas exploser la mémoire). */
  _pendingFull() {
    if (this.pendingMessages.length + this._inflight.length >= MAX_PENDING) return true;
    let bytes = 0;
    for (const m of this.pendingMessages) bytes += String(m.ciphertext).length;
    return bytes >= MAX_PENDING_BYTES;
  }

  /** A2-08 : identifiant serveur STABLE pour un identifiant client donné (même auteur, même conversation). */
  async _stableId(session, clientId) {
    const data = new TextEncoder().encode(session.convId + '\u0000' + session.userId + '\u0000' + clientId);
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
      .slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  }

  _remember(rec) {
    this._recent.set(rec.id, { seq: rec.seq, ts: rec.ts });
    if (this._recent.size > RECENT_IDS_MAX) this._recent.delete(this._recent.keys().next().value);
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
      // Revue 08.10.2026 (A4) : exp obligatoire — un jeton sans exp valait à vie.
      // Le jeton relais du worker (typ 'wsfwd') porte exp = 60 s.
      if (!Number.isFinite(payload.exp)) return null;
      if (payload.exp * 1000 < Date.now()) return null;
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
        if (this._pendingFull()) {
          return new Response(JSON.stringify({ ok: false, error: 'busy' }), {
            status: 503, headers: { 'Content-Type': 'application/json' }
          });
        }
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
        // A2-07 : « ok » seulement une fois DURABLE (stockage du DO). Avant, flushToD1 avalait
        // la panne D1 et l'on répondait 200 avec la lettre en RAM seulement. Un échec du stockage
        // lève → 500 → le cron relâche la réclamation et réessaie.
        await this._persistPending(rec);
        this.pendingMessages.push(rec);
        this._armFlushAlarm();
        await this._recheckStale(null);
        this.broadcast({ type: 'message', ...rec });
        await this.notifyOfflineMembers(rec);
        await this.flushToD1();   // au mieux tout de suite en D1 ; sinon l'alarme réessaie (rien n'est perdu)
        return new Response(JSON.stringify({ ok: true, id: rec.id }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // A2-02 : révocation IMMÉDIATE des sockets d'un utilisateur (retrait du groupe, exclusion,
    // suspension, déconnexion forcée, suppression de compte / de conversation). Appel interne de
    // l'api-worker, authentifié par un jeton court signé (typ 'dorevoke', même clé que 'wsfwd') ;
    // le routeur public n'atteint le DO que par `/api/conversations/:id/ws` (chemin en /ws).
    if (url.pathname.endsWith('/internal/revoke')) {
      const auth = request.headers.get('Authorization') || '';
      const claims = request.method === 'POST' ? await this.verifyJWT(auth.replace(/^Bearer\s+/i, '')) : null;
      if (!claims || claims.typ !== REVOKE_TYP || !claims.sub || !claims.conv) {
        return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
          status: 403, headers: { 'Content-Type': 'application/json' }
        });
      }
      const closed = this._closeUserSessions(claims.sub, claims.conv);
      return new Response(JSON.stringify({ ok: true, closed }), { headers: { 'Content-Type': 'application/json' } });
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
      if (acct && (acct.is_banned || acct.status === 'deleted' || acct.status === 'suspended' ||
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
    // A2-02 : filet périodique (une socket muette — ni trame ni ping — est quand même re-vérifiée).
    // Pas d'alarme de re-vérification si un flush est en attente : son alarme passe en premier et
    // réarme ce filet ensuite (sinon on retarderait l'écriture D1).
    this._recheckTimer = true;
    if (!this.pendingMessages.length && !this._inflight.length) this._armAlarmAt(connectedAt + RECHECK_TIMER_MS);

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
      // Ajouter les messages encore en buffer (pas encore flushés en D1) — y compris le lot en cours
      // d'écriture (A2-05 : une connexion pendant le flush ne voyait ni D1 ni buffer).
      for (const pm of [...this._inflight, ...this.pendingMessages]) {
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
          const mine = await this._pollPseudonym(pollId, userId);   // Lot B : son propre vote anonyme lui revient sous son id
          for (const [voter, votes] of Object.entries(all || {})) {
            if (Array.isArray(votes)) server.send(JSON.stringify({ type: 'poll_vote', poll_id: pollId, voter: voter === mine ? userId : voter, votes, convId, replayed: true }));
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
        // A2-02 : 'suspended' (banUser admin) est refusé comme côté REST (getAuthUser).
        if (acct && (acct.is_banned || acct.status === 'deleted' || acct.status === 'suspended' ||
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
    this._dropSession(ws, session, reason);
    return false;
  }

  _dropSession(ws, session, reason) {
    const now = Date.now();
    this.sessions.delete(ws);
    this.broadcast({ type: 'presence', userId: session.userId, action: 'leave', status: 'offline', last_seen: now, ts: now });
    try { ws.close(1008, reason); } catch (_) {}
  }

  /**
   * A2-02 : avant toute diffusion, les AUTRES sockets dont la dernière vérification date de plus de
   * MEMBER_RECHECK_MS sont re-vérifiées. Un membre retiré qui se contente d'écouter (ou n'envoie rien)
   * ne reçoit donc plus rien au-delà de cette fenêtre. Requêtes D1 seulement pour les sessions périmées.
   */
  async _recheckStale(exclude) {
    // _recheckMembership ne touche D1 que pour une session dont la dernière vérification est périmée.
    await Promise.all([...this.sessions].filter(([w]) => w !== exclude).map(([w, s]) => this._recheckMembership(w, s)));
  }

  /** Révocation interne : ferme en 1008 toutes les sockets de `userId` sur cette conversation. */
  _closeUserSessions(userId, convId) {
    let n = 0;
    for (const [w, s] of [...this.sessions]) {
      if (s.userId !== userId || s.convId !== convId) continue;
      this._dropSession(w, s, 'Accès retiré');
      n++;
    }
    return n;
  }

  /** Message encore en mémoire (buffer ou flush en cours) — pour l'autorisation edit/delete. */
  _findBuffered(id) {
    return this.pendingMessages.find(m => m.id === id) ||
      this._inflight.find(m => m.id === id) || null;
  }

  /** Ré-enregistre une copie en attente modifiée (édition/suppression). false = erreur envoyée, pas d'accusé. */
  async _persistEdit(ws, pend, clientId) {
    try {
      await this._persistPending(pend);
      return true;
    } catch (e) {
      console.error('[ConversationDO] stockage de la modification impossible:', String(e));
      ws.send(JSON.stringify({ type: 'error', code: 'not_durable', client_id: clientId, id: pend.id, message: 'Modification non enregistrée, réessaie' }));
      return false;
    }
  }

  /**
   * A2-03 / A2-16 : une page de rattrapage. Curseur (after_ts, after_id) exclusif, ordre (ts, id).
   * Fusionne D1 et les messages pas encore écrits (buffer + lot en cours) ; page bornée.
   * `changed_since` (1re page) : renvoie aussi les messages PLUS ANCIENS que le curseur édités ou
   * supprimés depuis — sinon un appareil absent gardait l'ancien texte d'un message « supprimé pour tous ».
   */
  async _historySince(ws, session, msg) {
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    const afterTs = num(msg.after_ts);
    const afterId = (typeof msg.after_id === 'string' && msg.after_id.length <= MAX_REF_ID) ? msg.after_id : '';
    const limit = Math.min(CATCHUP_PAGE_MAX, num(msg.limit) || CATCHUP_PAGE_DEFAULT);
    const joinedAt = Number(session.joinedAt) || 0;
    const cols = 'SELECT id, sender_id, ciphertext, mime, ts, reply_to, view_once, expires_at, edited_at, deleted_at FROM messages';
    const db = this.env.APEX_CHAT_DB;
    let page;
    let changes = null;
    try {
      const res = await db.prepare(
        cols + ' WHERE conv_id=? AND ts >= ? AND (ts > ? OR (ts = ? AND id > ?)) ORDER BY ts ASC, id ASC LIMIT ?'
      ).bind(session.convId, joinedAt, afterTs, afterTs, afterId, limit + 1).all();
      const merged = new Map();
      for (const r of res.results) merged.set(r.id, r);
      const buffered = [...this._inflight, ...this.pendingMessages].filter((m) => m.conv_id === session.convId);
      for (const m of buffered) {
        if (m.ts >= joinedAt && afterCursor(m, afterTs, afterId)) merged.set(m.id, m);   // la copie en RAM est la plus récente
      }
      page = [...merged.values()].sort(byTsId);
      if (msg.changed_since != null) {
        const since = num(msg.changed_since);
        const ch = await db.prepare(
          cols + ' WHERE conv_id=? AND ts >= ? AND (edited_at > ? OR deleted_at > ?) ORDER BY ts ASC LIMIT ?'
        ).bind(session.convId, joinedAt, since, since, CATCHUP_CHANGES_MAX).all();
        const cm = new Map();
        for (const r of ch.results) cm.set(r.id, r);
        for (const m of buffered) {
          if (m.ts >= joinedAt && (m.edited_at > since || m.deleted_at > since)) cm.set(m.id, m);
        }
        changes = [...cm.values()].sort(byTsId);
      }
    } catch (e) {
      console.error('[ConversationDO] rattrapage impossible:', String(e));
      return ws.send(JSON.stringify({ type: 'error', code: 'history_failed', message: 'Rattrapage indisponible, nouvel essai à la reconnexion' }));
    }
    const more = page.length > limit;
    if (more) page = page.slice(0, limit);
    const last = page[page.length - 1];
    const now = Date.now();
    const visible = (r) => !r.expires_at || r.expires_at > now;
    ws.send(JSON.stringify({
      type: 'history_page', conv_id: session.convId,
      messages: page.filter(visible).map(publicRow),
      ...(changes ? { changes: changes.filter(visible).map(publicRow) } : {}),
      more,
      // Le curseur avance aussi sur les messages expirés (filtrés) : la pagination progresse toujours.
      cursor: last ? { ts: last.ts, id: String(last.id) } : { ts: afterTs, id: afterId },
      server_ts: now,
    }));
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
    // A2-08 : l'identifiant client (message ou édition) est renvoyé dans l'accusé ET dans les erreurs,
    // pour que l'app retire de sa boîte d'envoi exactement ce qui a été traité (ou refusé pour de bon).
    const clientId = (typeof msg.id === 'string' && msg.id && msg.id.length <= MAX_REF_ID) ? msg.id : undefined;

    if (this._rateLimited(session, msg)) {
      return ws.send(JSON.stringify({ type: 'error', code: 'rate_limit', client_id: clientId,
        message: msg.type === 'message' ? 'Trop de messages, attends 1 minute' : 'Trop de requêtes, attends 1 minute' }));
    }

    // Re-vérification périodique membership / ban / suspension / force_logout — y compris sur un
    // simple ping (A2-02 : un membre retiré qui ne fait qu'écouter restait connecté indéfiniment).
    if (!(await this._recheckMembership(ws, session))) return;
    // A2-02 : et les AUTRES sockets périmées sont re-vérifiées avant qu'une trame ne leur soit diffusée.
    if (msg.type !== 'ping') await this._recheckStale(ws);

    switch (msg.type) {
      case 'message': {
        // Nouveau message chiffré (ciphertext). Revue 08.10.2026 : TOUS les champs sont
        // validés à la réception — une ligne invalide bloquait flushToD1 pour toujours.
        const v = validateMessageFields(msg);
        if (!v.ok) return ws.send(JSON.stringify({ type: 'error', code: 'invalid_message', client_id: clientId, message: v.error }));
        // Audit 17/09/2026 (P1) : l'interrupteur admin « e2e_strict » n'était lu nulle part.
        // Quand il est ON, un message non chiffré de bout en bout (préfixe E2E1:/E2E2:) est refusé.
        if (!E2E_TAG_RE.test(v.fields.ciphertext) && await this.e2eStrictFor(session.convId)) {
          return ws.send(JSON.stringify({ type: 'error', code: 'e2e_required', client_id: clientId, message: 'Chiffrement de bout en bout obligatoire : la clé de ton contact doit être établie avant d\'envoyer' }));
        }

        // A2-08 : un renvoi (même identifiant client) reçoit le MÊME identifiant serveur → ni
        // deuxième diffusion, ni deuxième ligne (ON CONFLICT(id) en D1 si l'instance a redémarré).
        const messageId = clientId ? await this._stableId(session, clientId) : crypto.randomUUID();
        const already = this._findBuffered(messageId) || this._recent.get(messageId);
        if (already) {
          ws.send(JSON.stringify({ type: 'ack', id: messageId, seq: already.seq, ts: already.ts, client_id: clientId, dup: true }));
          break;
        }
        if (this._pendingFull()) {
          // Contre-pression : refus SANS accusé — l'app garde le message dans sa boîte d'envoi.
          return ws.send(JSON.stringify({ type: 'error', code: 'busy', client_id: clientId, message: 'Serveur occupé, nouvel essai automatique' }));
        }

        // P0 FIX (audit) : utiliser blockConcurrencyWhile pour seq atomic
        await this.state.blockConcurrencyWhile(async () => {
          this.seq++;
          await this.state.storage.put('seq', this.seq);
        });

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

        // A2-01 : DURABLE AVANT l'accusé et avant la diffusion (stockage du DO, rechargé au
        // redémarrage). Échec du stockage → ni accusé ni diffusion : l'app renverra.
        try {
          await this._persistPending(messageRecord);
        } catch (e) {
          console.error('[ConversationDO] stockage du message impossible:', String(e));
          return ws.send(JSON.stringify({ type: 'error', code: 'not_durable', client_id: clientId, message: 'Message non enregistré, nouvel essai automatique' }));
        }
        this.pendingMessages.push(messageRecord);
        this._remember(messageRecord);
        // Audit 17/09/2026 (P1) : le buffer n'était vidé qu'au 10e message ou au message
        // SUIVANT après 5 s — jamais par une alarme (alarm() existait, setAlarm n'était
        // appelé nulle part) ni à la fermeture. L'alarme garantit un flush ≤ 5 s après le dernier message.
        this._armFlushAlarm();

        // Fan-out aux AUTRES clients (pas au sender — il reçoit déjà son ack
        // et a déjà affiché le message localement → évite le doublon).
        this.broadcast({
          type: 'message',
          ...messageRecord
        }, ws);

        // Push notif aux déconnectés (best-effort)
        await this.notifyOfflineMembers(messageRecord);

        // Flush D1 si > 10 messages OU > 5s — mais pas pendant le recul d'une panne D1 (A2-01c :
        // chaque message relançait un flush voué à l'échec ; les messages sont déjà durables).
        if ((this.pendingMessages.length >= 10 || Date.now() - this.lastFlush > FLUSH_DELAY_MS) &&
            Date.now() >= this._flushRetryAt) {
          await this.flushToD1();
        }

        // client_id : l'id local du message envoyé — l'app associe l'accusé au BON message (revue 08.10).
        ws.send(JSON.stringify({ type: 'ack', id: messageId, seq: messageRecord.seq, ts, client_id: clientId }));
        break;
      }

      // A2-03 : rattrapage paginé — tout ce qui a été écrit APRÈS un curseur (ts, id), dans la
      // limite de joined_at, sans contenu supprimé, sans message expiré. Le client pagine
      // (`more`) jusqu'à être à jour : plus aucun message n'est perdu au-delà des 50 de l'historique.
      case 'history_since':
        await this._historySince(ws, session, msg);
        break;

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
        // A2-05 : la copie en attente (buffer OU lot en cours d'écriture) est modifiée AVANT tout
        // appel D1, versionnée (le flush rejoue une ligne modifiée pendant son écriture) et
        // ré-enregistrée dans le stockage du DO avant l'accusé (survit à un redémarrage).
        const buf = this._findBuffered(msg.message_id);
        const pend = (buf && buf.sender_id === session.userId && !buf.deleted_at &&
          (buf.conv_id == null || buf.conv_id === session.convId)) ? buf : null;
        if (pend) {
          pend.ciphertext = editContent; pend.edited_at = editedAt; pend._v = (pend._v || 0) + 1;
          if (!(await this._persistEdit(ws, pend, clientId))) return;
        }
        const res = await this.env.APEX_CHAT_DB.prepare(
          'UPDATE messages SET ciphertext=?, edited_at=? WHERE id=? AND conv_id=? AND sender_id=? AND deleted_at IS NULL'
        ).bind(editContent, editedAt, msg.message_id, session.convId, session.userId).run();
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
        ws.send(JSON.stringify({ type: 'ack', id: msg.message_id, edited_at: editedAt, client_id: clientId }));
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
        // A2-05 : même règle que l'édition — copie en attente modifiée d'abord, versionnée, durable.
        const buf = this._findBuffered(msg.message_id);
        const pend = (buf && buf.sender_id === session.userId &&
          (buf.conv_id == null || buf.conv_id === session.convId)) ? buf : null;
        if (pend) {
          pend.deleted_at = deletedAt; pend.ciphertext = ''; pend._v = (pend._v || 0) + 1;
          if (!(await this._persistEdit(ws, pend, clientId))) return;
        }
        const res = await this.env.APEX_CHAT_DB.prepare(
          "UPDATE messages SET deleted_at=?, ciphertext='' WHERE id=? AND conv_id=? AND sender_id=?"
        ).bind(deletedAt, msg.message_id, session.convId, session.userId).run();
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
        ws.send(JSON.stringify({ type: 'ack', id: msg.message_id, deleted_at: deletedAt, client_id: clientId }));
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
        // Lot B (A6-13) : sondage ANONYME → le vote est gardé et relayé sous un pseudonyme stable (même votant, même
        // sondage = même pseudonyme, non devinable sans la clé du serveur). Les autres membres ne voient que des comptes ;
        // seuls les appareils du votant lui-même reçoivent son identifiant (pour cocher « mon vote »).
        const anon = msg.anon === true;
        const voterKey = anon ? await this._pollPseudonym(pollId, session.userId) : session.userId;
        if (votes.length) all[voterKey] = votes; else delete all[voterKey];
        try { await this.state.storage.put(key, all); } catch (e) { console.warn('[poll_vote] stockage:', e && e.message); }
        if (!anon) {
          this.broadcast({ type: 'poll_vote', poll_id: pollId, voter: session.userId, votes, convId: session.convId, ts: Date.now() }, ws);
          break;
        }
        const frame = { type: 'poll_vote', poll_id: pollId, votes, convId: session.convId, ts: Date.now(), anon: true };
        for (const [sock, s] of this.sessions) {
          if (sock === ws) continue;
          try { sock.send(JSON.stringify({ ...frame, voter: s.userId === session.userId ? session.userId : voterKey })); } catch (_) { /* client mort */ }
        }
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

  // Lot B (A6-13) : pseudonyme d'un votant pour UN sondage anonyme (HMAC-SHA-256, clé dérivée du secret serveur).
  async _pollPseudonym(pollId, userId) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode('apex-poll-anon-v1|' + String(this.env.JWT_SIGN_KEY)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(pollId + '|' + userId)));
    return 'anon_' + Array.from(sig.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
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

  /** Programme l'alarme du DO à `at` (best-effort : un mock sans setAlarm ne casse rien). */
  _armAlarmAt(at) {
    try {
      const st = this.state && this.state.storage;
      if (st && typeof st.setAlarm === 'function') {
        const p = st.setAlarm(at);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (_) { /* best-effort */ }
  }

  /** Alarme de flush à +5 s — ou à la fin du recul en cours si D1 est en panne (A2-01c). */
  _armFlushAlarm() {
    this._armAlarmAt(Math.max(Date.now() + FLUSH_DELAY_MS, this._flushRetryAt));
  }

  /**
   * Un seul flush à la fois : un appel concurrent attend celui en cours. Avant, un second flush
   * écrasait puis vidait `_inflight` (A2-05) : les éditions sur le premier lot étaient perdues.
   */
  async flushToD1() {
    if (this._flushing) return this._flushing;
    if (this.pendingMessages.length === 0) return;
    this._flushing = this._flushOnce();
    try { await this._flushing; } finally { this._flushing = null; }
  }

  async _flushOnce() {
    const toFlush = this.pendingMessages;
    this.pendingMessages = [];
    this._inflight = toFlush;
    this.lastFlush = Date.now();
    const db = this.env.APEX_CHAT_DB;

    // Revue 08.10.2026 : insertion IDEMPOTENTE. Lot A (A2-05) : une ligne déjà présente n'est mise
    // à jour QUE pour rejouer une édition/suppression (jamais pour ressusciter une ligne supprimée
    // entre-temps — compte supprimé —, ni pour réécrire une ligne inchangée).
    const stmt = db.prepare(
      `INSERT INTO messages (id, conv_id, sender_id, ciphertext, mime, ts, reply_to, thread_root, view_once, expires_at, edited_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET ciphertext=excluded.ciphertext, edited_at=excluded.edited_at, deleted_at=excluded.deleted_at
       WHERE messages.deleted_at IS NULL AND (excluded.edited_at IS NOT NULL OR excluded.deleted_at IS NOT NULL)`
    );
    const bindRow = (m) => stmt.bind(m.id, m.conv_id, m.sender_id,
      (m.ciphertext == null ? '' : m.ciphertext), m.mime == null ? null : m.mime, m.ts,
      m.reply_to == null ? null : m.reply_to, m.thread_root == null ? null : m.thread_root,
      m.view_once ? 1 : 0, m.expires_at == null ? null : m.expires_at,
      m.edited_at == null ? null : m.edited_at, m.deleted_at == null ? null : m.deleted_at);
    // Version de chaque ligne au moment où ses valeurs sont liées (A2-05).
    const written = new Map(toFlush.map((m) => [m, m._v || 0]));

    const persisted = [];
    const requeue = [];
    const poisoned = [];
    let transient = false;
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
          await db.batch(toFlush.map(bindRow));
          persisted.push(...toFlush);
        } catch (e) {
          console.error('flushToD1 error', e.message);
          // Re-queue : le prochain flush passera en mode ligne par ligne.
          for (const m of toFlush) { fails.set(m.id, (fails.get(m.id) || 0) + 1); requeue.push(m); }
          transient = true;
          report(e.message);
        }
      } else {
        for (const m of toFlush) {
          try {
            await bindRow(m).run();
            persisted.push(m);
          } catch (e) {
            if (isPermanentDbError(e)) {
              // A2-01c : ligne refusée pour de bon → quarantaine (stockage + journal), jamais effacée en silence.
              fails.delete(m.id);
              poisoned.push([m, e]);
            } else {
              // A2-01c : une erreur TRANSITOIRE n'abandonne plus jamais un message acquitté.
              fails.set(m.id, (fails.get(m.id) || 0) + 1);
              requeue.push(m);
              transient = true;
            }
          }
        }
        if (requeue.length) report('row retry pending: ' + requeue.length);
      }

      for (const m of persisted) fails.delete(m.id);

      // A2-05 : une ligne éditée/supprimée PENDANT son écriture a été écrite avec ses anciennes
      // valeurs : on la réécrit aussitôt (upsert). Si ça échoue, elle reste en file (et en stockage).
      const stale = persisted.filter((m) => (m._v || 0) !== written.get(m));
      if (stale.length) {
        const snap = stale.map((m) => m._v);
        try {
          await db.batch(stale.map(bindRow));
          stale.forEach((m, i) => written.set(m, snap[i]));
        } catch (e) {
          console.error('flushToD1 replay error', e.message);
          report('replay: ' + e.message);
        }
      }
      const done = [];
      for (const m of persisted) ((m._v || 0) === written.get(m) ? done : requeue).push(m);
      await this._forgetPending(done);
      for (const [m, e] of poisoned) await this._quarantine(m, e, report);

      // Update conv last_msg_ts (un échec ici ne remet PAS les messages en file).
      // Une distribution de clés ne fait pas remonter la conversation : dernier message VISIBLE seulement.
      // A2-13 : jamais en arrière (un message rejoué après un plus récent ne redescend pas la conversation).
      const visibles = done.filter((m) => !MIMES_SILENCIEUX.has(m.mime));
      if (visibles.length) {
        const lastMsg = visibles.reduce((a, b) => (b.ts >= a.ts ? b : a));
        try {
          await db.prepare(
            'UPDATE conversations SET last_msg_id=?1, last_msg_ts=?2 WHERE id=?3 AND (last_msg_ts IS NULL OR last_msg_ts <= ?2)'
          ).bind(lastMsg.id, lastMsg.ts, lastMsg.conv_id).run();
        } catch (e) {
          console.error('flushToD1 last_msg update error', e.message);
        }
      }
    } finally {
      // Re-queue les messages non persistés (en tête, ordre de seq conservé).
      if (requeue.length) {
        requeue.sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
        this.pendingMessages.unshift(...requeue);
      }
      this._inflight = [];
      // A2-01c : recul exponentiel borné pendant une panne D1 (5 s, 10 s, 20 s… ≤ 5 min).
      if (transient) {
        this._flushFailStreak++;
        this._flushRetryAt = Date.now() + Math.min(FLUSH_BACKOFF_MAX_MS, FLUSH_DELAY_MS * 2 ** (this._flushFailStreak - 1));
      } else {
        this._flushFailStreak = 0;
        this._flushRetryAt = 0;
      }
    }
  }

  async alarm() {
    // Alarme armée par _armFlushAlarm() à chaque message : flush ≤ 5 s après le dernier.
    await this.flushToD1();
    // A2-02 : filet périodique — les sockets sont re-vérifiées même si personne n'envoie rien.
    if (this._recheckTimer) await this._recheckStale(null);
    // Si le flush a échoué (re-queue), on réessaie plus tard (recul) plutôt que d'attendre le message suivant.
    if (this.pendingMessages.length > 0) this._armFlushAlarm();
    else if (this._recheckTimer && this.sessions.size > 0) this._armAlarmAt(Date.now() + RECHECK_TIMER_MS);
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
