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

export class ConversationDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();   // ws → {userId, deviceId, lastSeq, connectedAt}
    this.seq = 0;                 // séquence locale messages
    this.lastFlush = Date.now();
    this.pendingMessages = [];    // buffer avant flush D1
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
      try {
        await this.state.blockConcurrencyWhile(async () => {
          this.seq++;
          await this.state.storage.put('seq', this.seq);
        });
        const rec = {
          id: crypto.randomUUID(),
          conv_id: body.conv_id,
          sender_id: body.sender_id,
          ciphertext: body.ciphertext,
          mime: body.mime || 'text/plain',
          ts: Date.now(),
          reply_to: null, thread_root: null, view_once: 0,
          expires_at: body.expires_at || null,
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
    try {
      const member = await this.env.APEX_CHAT_DB.prepare(
        'SELECT user_id, role FROM conversation_members WHERE conv_id=? AND user_id=?'
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
    } catch (e) {
      server.accept();
      server.close(1011, 'DB error');
      return new Response(null, { status: 101, webSocket: client });
    }

    server.accept();
    this.sessions.set(server, {
      userId,
      deviceId,
      convId,                    // P0 FIX : convId D1 réel (pas DO id)
      lastSeq: 0,
      connectedAt: Date.now(),
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
      const hist = await this.env.APEX_CHAT_DB.prepare(
        'SELECT id, sender_id, ciphertext, mime, ts, reply_to, view_once, expires_at FROM messages WHERE conv_id=? ORDER BY ts DESC LIMIT 50'
      ).bind(convId).all();
      const rows = (hist.results || []).slice().reverse();
      const seen = new Set(rows.map(r => r.id));
      // Ajouter les messages encore en buffer (pas encore flushés en D1)
      for (const pm of this.pendingMessages) {
        if (pm.conv_id === convId && !seen.has(pm.id)) {
          rows.push({ id: pm.id, sender_id: pm.sender_id, ciphertext: pm.ciphertext,
            mime: pm.mime, ts: pm.ts, reply_to: pm.reply_to || null,
            view_once: pm.view_once || 0, expires_at: pm.expires_at || null });
        }
      }
      const now = Date.now();
      const fresh = rows.filter(r => !r.expires_at || r.expires_at > now);
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
      if (pc && pc.fromUserId !== userId && (Date.now() - pc.ts) < 45000) {
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

  async handleMessage(ws, msg) {
    const session = this.sessions.get(ws);
    if (!session) return;

    // P0 FIX (audit) : rate limit 100 messages/min/session
    const now = Date.now();
    if (now - session.lastReset > 60000) {
      session.messageCount = 0;
      session.lastReset = now;
    }
    if (msg.type === 'message') {
      session.messageCount++;
      if (session.messageCount > 100) {
        return ws.send(JSON.stringify({ type: 'error', code: 'rate_limit',
          message: 'Trop de messages, attends 1 minute' }));
      }
    }

    switch (msg.type) {
      case 'message': {
        // Nouveau message chiffré (ciphertext)
        if (!msg.ciphertext) return ws.send(JSON.stringify({ type: 'error', message: 'ciphertext required' }));
        if (msg.ciphertext.length > 100000) return ws.send(JSON.stringify({ type: 'error', message: 'ciphertext too large (max 100KB)' }));
        // Audit 17/09/2026 (P1) : l'interrupteur admin « e2e_strict » n'était lu nulle part.
        // Quand il est ON, un message non chiffré de bout en bout (préfixe E2E1:/E2E2:) est refusé.
        if (await this.e2eStrict() && !/^E2E\d+:/.test(String(msg.ciphertext))) {
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
          ciphertext: msg.ciphertext,
          mime: msg.mime || 'text/plain',
          ts,
          reply_to: msg.reply_to || null,
          thread_root: msg.thread_root || null,
          view_once: msg.view_once ? 1 : 0,
          expires_at: msg.expires_at || null,
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

        ws.send(JSON.stringify({ type: 'ack', id: messageId, seq: this.seq, ts }));
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
        // Update reactions JSON — SÉCU (audit P2) : scoper à la conversation courante
        // (conv_id=session.convId) pour empêcher un membre d'écrire une réaction sur un
        // message d'une AUTRE conversation via un message_id forgé.
        const existing = await this.env.APEX_CHAT_DB.prepare(
          'SELECT reactions FROM messages WHERE id=? AND conv_id=?'
        ).bind(msg.message_id, session.convId).first();
        if (existing) {
          let reactions = {};
          try { reactions = JSON.parse(existing.reactions || '{}'); } catch {}
          reactions[msg.emoji] = reactions[msg.emoji] || [];
          const has = reactions[msg.emoji].includes(session.userId);
          const remove = msg.action === 'remove' || (msg.action !== 'add' && has);
          if (remove) {
            reactions[msg.emoji] = reactions[msg.emoji].filter(u => u !== session.userId);
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
            action: msg.action || 'add',
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
        if (!msg.message_id || editContent == null || editContent === '') {
          return ws.send(JSON.stringify({ type: 'error', message: 'edit: message_id + contenu requis' }));
        }
        if (String(editContent).length > 100000) {
          return ws.send(JSON.stringify({ type: 'error', message: 'contenu trop grand (max 100KB)' }));
        }
        const editedAt = Date.now();
        await this.env.APEX_CHAT_DB.prepare(
          'UPDATE messages SET ciphertext=?, edited_at=? WHERE id=? AND conv_id=? AND sender_id=? AND deleted_at IS NULL'
        ).bind(editContent, editedAt, msg.message_id, session.convId, session.userId).run();
        // Met aussi à jour un éventuel message encore en attente de flush.
        const pend = this.pendingMessages.find(m => m.id === msg.message_id && m.sender_id === session.userId);
        if (pend) { pend.ciphertext = editContent; pend.edited_at = editedAt; }
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
      // contenu en base (ciphertext=NULL) et on marque deleted_at → tombstone.
      case 'delete_message': {
        if (!msg.message_id) {
          return ws.send(JSON.stringify({ type: 'error', message: 'delete: message_id requis' }));
        }
        const deletedAt = Date.now();
        await this.env.APEX_CHAT_DB.prepare(
          'UPDATE messages SET deleted_at=?, ciphertext=NULL WHERE id=? AND conv_id=? AND sender_id=?'
        ).bind(deletedAt, msg.message_id, session.convId, session.userId).run();
        const pendIdx = this.pendingMessages.findIndex(m => m.id === msg.message_id && m.sender_id === session.userId);
        if (pendIdx >= 0) { this.pendingMessages[pendIdx].deleted_at = deletedAt; this.pendingMessages[pendIdx].ciphertext = null; }
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
        // Forward au(x) destinataire(s) — broadcast aux autres sessions
        this.broadcast({
          type: msg.type,
          from: session.userId,
          fromDevice: session.deviceId,
          to: msg.to || null,
          callType: msg.callType || null,
          offer: msg.offer,
          answer: msg.answer,
          candidate: msg.candidate,
          convId: session.convId,
          ts: Date.now(),
        }, ws);
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

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Type inconnu: ' + msg.type }));
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
    this.lastFlush = Date.now();

    try {
      // Batch insert
      const stmt = this.env.APEX_CHAT_DB.prepare(
        `INSERT INTO messages (id, conv_id, sender_id, ciphertext, mime, ts, reply_to, thread_root, view_once, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      await this.env.APEX_CHAT_DB.batch(toFlush.map(m =>
        stmt.bind(m.id, m.conv_id, m.sender_id, m.ciphertext, m.mime, m.ts,
          m.reply_to, m.thread_root, m.view_once, m.expires_at)
      ));

      // Update conv last_msg_ts
      const lastMsg = toFlush[toFlush.length - 1];
      await this.env.APEX_CHAT_DB.prepare(
        'UPDATE conversations SET last_msg_id=?, last_msg_ts=? WHERE id=?'
      ).bind(lastMsg.id, lastMsg.ts, lastMsg.conv_id).run();
    } catch (e) {
      console.error('flushToD1 error', e.message);
      // Re-queue les messages perdus
      this.pendingMessages.unshift(...toFlush);
      // Push télémétrie
      this.env.TELEMETRY_QUEUE?.send({
        sentinel: 'do-flush-error',
        severity: 'err',
        msg: e.message,
        ts: Date.now()
      }).catch(() => {});
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
