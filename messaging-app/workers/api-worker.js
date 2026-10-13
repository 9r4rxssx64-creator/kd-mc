/**
 * Apex Chat — API Worker (REST + WebSocket)
 *
 * Last redeploy trigger : 2026-05-19 v1.1.132 (Kevin re-paste ACCOUNT_ID secret clean)
 *
 * Routes principales :
 *   POST   /api/auth/send-otp        → Firebase Auth Phone (envoie SMS)
 *   POST   /api/auth/verify-otp      → vérifie OTP, retourne JWT
 *   POST   /api/auth/sso-from-apex   → SSO cross-app Apex → Apex Chat
 *   POST   /api/auth/sso-from-kdmc   → connexion auto via kd-mc.com (Face ID, vérif serveur whoami)
 *   GET    /api/users/me             → profil user authentifié
 *   PATCH  /api/users/me             → update profil
 *   GET    /api/users/:pseudo        → profil public (pseudo + photo + bio)
 *   GET    /api/admin/users/:pseudo/full → admin Kevin only — fiche complète
 *   POST   /api/keys/prekeys         → upload bundle prekeys X3DH + Kyber
 *   GET    /api/keys/:userId/bundle  → récupère bundle prekey
 *   POST   /api/conversations        → créer conv DM/group/community/channel
 *   GET    /api/conversations        → liste convs user
 *   WS     /api/conversations/:id/ws → upgrade vers ConversationDO
 *   POST   /api/messages             → POST message chiffré
 *   POST   /api/invitations          → créer invitation SMS
 *   GET    /api/invitations/:code    → résoudre code invitation
 *   POST   /api/signalements         → signaler user/message
 *   POST   /api/admin/commands       → admin Kevin only (kickUser/banUser/etc.)
 *   GET    /api/system/config        → flags MODE_CONFIG runtime
 *
 * Architecture A→B→C : flag KEVIN_INVISIBLE_ADMIN lu depuis D1.system_config
 */

// ============================================================================
//  Helpers
// ============================================================================

import { sendPush } from './lib/push-send.js';

const ADMIN_KEVIN_ALIASES = [
  'kevin', 'kevin desarzens', 'desarzens kevin', 'desarzens',
  'kevin.desarzens', 'kevind@monaco.mc', 'kdmc', 'k desarzens'
];

import { corsHeaders, makeJson, applyCors } from './lib/cors.js';
import { giphySearchUrl, giphyTrendingUrl, mapGiphyResults } from '../lib/gif.js';
/* Kevin 2026-09-05 « Qwen l'IA gratuite en principal, pareil dans mes autres projets » :
   routage IA commun du domaine (Qwen Workers AI 0 clé d'abord, bascule par type de demande). */
import { routeText, routeSmart, detectDomain, planChain, availableProviders } from '../../services/_shared/ia-route.js';

const CORS_HEADERS = {
  ...corsHeaders('GET, POST, PATCH, DELETE, OPTIONS', 'Content-Type, Authorization, X-Apex-Token, x-file-name'),
  'Access-Control-Max-Age': '86400'
};

const json = makeJson(CORS_HEADERS);

// Audit 17/09/2026 (P1) : 18 handlers faisaient `await request.json()` sans garde → un corps
// mal formé levait une SyntaxError attrapée par le catch GLOBAL = réponse 500 « erreur interne »
// + une entrée dans la file de télémétrie, pour une faute du client. readJson() lève une
// BadJsonError que le catch global traduit en 400 `bad_json`, sans télémétrie.
class BadJsonError extends Error {
  constructor(cause) { super('Corps de requête JSON invalide'); this.name = 'BadJsonError'; this.cause = cause; }
}
async function readJson(request) {
  try { return await request.json(); }
  catch (e) { throw new BadJsonError(e); }
}

// err() — règle CLAUDE.md "détailler les erreurs partout" :
// message = soft (user), detail = cause EXACTE (diagnostic). detail accepte string ou objet.
function err(message, status = 400, code = 'error', detail) {
  const body = { error: code, message };
  if (detail !== undefined && detail !== null) {
    // v1.1.165 — préserver une string courte dans body.detail (pour toast user-friendly)
    // et mettre l'objet complet dans body.context (pour debug avancé).
    if (typeof detail === 'string') {
      body.detail = detail;
    } else if (detail && typeof detail === 'object') {
      // Priorité : detail.detail (string explicite) > detail.message > stringify court
      body.detail = String(detail.detail || detail.message || detail.error || 'erreur');
      if (detail.where) body.where = detail.where;
      if (detail.step) body.step = detail.step;
      // Le reste (partial, received, hint, etc.) dans body.context séparé
      const ctx = {};
      for (const k of Object.keys(detail)) {
        if (!['detail', 'message', 'where', 'step', 'stack'].includes(k)) ctx[k] = detail[k];
      }
      if (Object.keys(ctx).length) body.context = ctx;
      if (detail.stack) body.where = body.where || (String(detail.stack).split('\n')[1] || '');
    }
  }
  return json(body, status);
}

export function normalizeName(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s\-_.@]+/g, ' ').trim();
}

export function isKevinAdmin(name, phone) {
  if (!name) return false;
  const n = normalizeName(name);
  if (ADMIN_KEVIN_ALIASES.includes(n)) return true;
  const tokens = n.split(/\s+/).filter(Boolean);
  if (tokens.length >= 1) {
    for (const alias of ADMIN_KEVIN_ALIASES) {
      const aTokens = normalizeName(alias).split(/\s+/);
      if (tokens.every(t => aTokens.includes(t) && t.length >= 4)) return true;
    }
  }
  return false;
}

export async function sha256(input) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// normPhone — comparaison de numéros robuste (CLAUDE.md "détailler erreurs").
// Gère : espaces, tirets, \n résiduel d'un secret, 00xx → +xx, national 0X → +33X.
function normPhone(p) {
  let s = String(p == null ? '' : p).replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^0\d{9}$/.test(s)) s = '+33' + s.slice(1);   // France national 0X → E.164
  if (/^33\d{9}$/.test(s)) s = '+' + s;             // 33XXXXXXXXX (sans +) → +33...
  if (/^\d{11,15}$/.test(s)) s = '+' + s;           // digits seuls avec indicatif → +
  return s;
}

export async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const data = `${enc(header)}.${enc(payload)}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sigB64}`;
}

export async function verifyJWT(token, secret) {
  // Lot 2 (P) : un jeton mal formé (base64 invalide → atob lève) répondait 500.
  // Toute la vérification est désormais dans le try : jeton illisible = null.
  try {
    if (!token || typeof token !== 'string' || !secret) return null;
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${h}.${p}`));
    if (!valid) return null;
    const payload = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/').padEnd(p.length + (4 - p.length % 4) % 4, '=')));
    if (!payload || typeof payload !== 'object') return null;
    // Revue 08.10.2026 (A4) : un jeton SANS exp valait à vie. exp est désormais
    // obligatoire (nombre fini) — tous les jetons émis ici en portent un
    // (sessions 30 j, tickets WS 60 s, média 300 s, invitations 7 j).
    if (!Number.isFinite(payload.exp)) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// Revue 08.10.2026 (A1) — RÉCLAMATION d'un compte créé par invitation.
// Un compte pré-créé par une invitation (source 'user-invitation' / 'invitation')
// a pu recevoir une session AVANT que son vrai propriétaire ne prouve son numéro
// (lien magique ouvert par l'inviteur lui-même, par exemple). À la PREMIÈRE
// connexion prouvée (OTP ou SSO), on pose users.last_force_logout_at = maintenant
// AVANT d'émettre le nouveau jeton : getAuthUser refuse alors toute session
// antérieure (iat plus ancien) — dont celle de l'inviteur. Une seule fois par
// compte (claimed_at). Si la colonne claimed_at manque encore (migration 0013
// pas passée) on coupe quand même les anciennes sessions : jamais moins sûr.
// Renvoie l'iat (secondes) à utiliser pour le jeton émis juste après.
const INVITED_SOURCES = ['user-invitation', 'invitation'];
export async function _claimInvitedAccount(env, user) {
  const iat = Math.floor(Date.now() / 1000);
  if (!user || !user.id || !INVITED_SOURCES.includes(user.source)) return iat;
  if (user.claimed_at) return iat;
  const DB = env.APEX_CHAT_DB;
  // Borne = début de la seconde courante : le jeton signé avec cet iat (ou un
  // iat plus tard) reste valide (getAuthUser refuse iat*1000 < last_force_logout_at).
  const cutoff = iat * 1000;
  let done = false;
  try {
    await DB.prepare(
      'UPDATE users SET last_force_logout_at=?, claimed_at=?, updated_at=? WHERE id=? AND claimed_at IS NULL'
    ).bind(cutoff, cutoff, cutoff, user.id).run();
    done = true;
  } catch (_) { /* colonne claimed_at absente → repli ci-dessous */ }
  if (!done) {
    try { await DB.prepare('UPDATE users SET last_force_logout_at=? WHERE id=?').bind(cutoff, user.id).run(); } catch (_) {}
  }
  user.last_force_logout_at = cutoff;
  user.claimed_at = cutoff;
  try { await auditLog(env, user.id, 'invited_account_claimed', 'user', user.id, { source: user.source }, null, ''); } catch (_) {}
  return iat;
}

// Revue 08.10.2026 (F1) — id libre pour un compte SSO neuf : si l'id « naturel »
// (apex_uid / kdmc_<uid>) est déjà tenu par une ligne SUPPRIMÉE (RGPD), on en
// dérive un autre au lieu de ressusciter la ligne morte.
async function _freshSsoId(env, base) {
  try {
    const row = await env.APEX_CHAT_DB.prepare('SELECT id, status FROM users WHERE id=?').bind(base).first();
    if (row && row.status === 'deleted') return base + '_' + _randomCode(6, 'abcdefghijkmnpqrstuvwxyz23456789');
  } catch (_) {}
  return base;
}

// Lot 2 (M) : un champ d'un mauvais type (objet / tableau là où une chaîne est
// attendue) faisait échouer le bind D1 → 500. On le refuse en 400.
function _isOptStr(v, max) {
  return v === undefined || v === null || (typeof v === 'string' && (!max || v.length <= max));
}

// Lot 2 (R) : codes courts sans biais — l'alphabet fait 31 caractères ;
// `b % 30` ne tirait jamais '9' et favorisait les premiers. Tirage par rejet.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function _randomCode(len = 8, alphabet = CODE_ALPHABET) {
  const n = alphabet.length;
  const limit = 256 - (256 % n);   // octets ≥ limit rejetés → distribution uniforme
  let out = '';
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < limit) { out += alphabet[b % n]; if (out.length === len) break; }
    }
  }
  return out;
}

// Nombre de lignes modifiées par un run() D1 (D1 renvoie TOUJOURS meta.changes).
// null = pilote qui ne le dit pas (fausses bases de test) : l'appelant retombe
// alors sur le comportement d'avant, jamais plus permissif que lui.
function _changes(r) {
  return (r && r.meta && typeof r.meta.changes === 'number') ? r.meta.changes : null;
}

// Lot 2 (P) : decodeURIComponent lève sur un « % » mal formé → 500.
function _safeDecode(s) {
  try { return decodeURIComponent(s); } catch (_) { return null; }
}

// Un ticket WS est à USAGE UNIQUE : son jti est consommé en base. La clé
// primaire rend la consommation atomique — un rejeu insère 0 ligne et est
// refusé, même si deux requêtes arrivent en même temps (audit P2a, v1.1.286).
async function consumeWsTicket(env, payload) {
  if (!payload || payload.typ !== 'wstkt' || !payload.jti) return false;
  const DB = env.APEX_CHAT_DB;
  try {
    await DB.prepare(
      'CREATE TABLE IF NOT EXISTS ws_tickets (jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)'
    ).run();
    const r = await DB.prepare(
      'INSERT OR IGNORE INTO ws_tickets (jti, expires_at) VALUES (?, ?)'
    ).bind(payload.jti, (payload.exp || 0) * 1000).run();
    // 0 ligne insérée = jti déjà présent = REJEU → refusé.
    if (!r || !r.meta || r.meta.changes !== 1) return false;
    // Ménage opportuniste (la table ne doit pas grossir indéfiniment).
    try { await DB.prepare('DELETE FROM ws_tickets WHERE expires_at < ?').bind(Date.now() - 60000).run(); } catch (_) {}
    return true;
  } catch (_) {
    // Base indisponible : on REFUSE (fail-closed) — un ticket non consommable
    // ne doit jamais valoir session. Le client retombe sur ?token= (legacy).
    return false;
  }
}

// `opts.allowMediaTicket` : autorise en plus un TICKET MÉDIA (`?mt=`) — activé
// UNIQUEMENT par la route qui sert les fichiers, pour qu'un ticket média ne
// puisse rien faire d'autre que servir un média (audit P2c, v1.1.288).
async function getAuthUser(request, env, opts) {
  const auth = request.headers.get('Authorization') || '';
  let token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  // WebSocket : le navigateur ne peut PAS poser de header Authorization sur un
  // upgrade WS → l'identité arrive dans l'URL. Depuis v1.1.286 c'est un TICKET
  // à usage unique valable 60 s (?ticket=), plus le jeton de session lui-même :
  // une URL fuite (journaux serveur, historique, Referer) — un ticket qui fuite
  // est déjà mort. ?token= reste accepté UNE version pour ne pas couper les
  // apps encore en cache (règle : jamais casser la connexion).
  let mode = 'session';
  if (!token) {
    try {
      const qs = new URL(request.url).searchParams;
      const tkt = qs.get('ticket');
      const mt = opts && opts.allowMediaTicket ? qs.get('mt') : null;
      if (tkt) { token = tkt; mode = 'ws'; }
      else if (mt) { token = mt; mode = 'media'; }
      else token = qs.get('token');
    } catch (_) {}
  }
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SIGN_KEY);
  if (!payload || !payload.sub) return null;
  if (mode === 'ws') {
    // Doit être un vrai ticket WebSocket, et non déjà utilisé.
    if (!(await consumeWsTicket(env, payload))) return null;
  } else if (mode === 'media') {
    // Ticket média : réutilisable pendant sa courte durée de vie (une photo est
    // relue à chaque affichage), mais valable NULLE PART ailleurs.
    if (payload.typ !== 'mtkt') return null;
  } else if (payload.typ) {
    // Un jeton TYPÉ (ticket WS, ticket média, invitation magique…) ne vaut
    // JAMAIS jeton de session : sinon il redeviendrait une clé d'API complète.
    // Les jetons de session, eux, n'ont pas de champ `typ`.
    return null;
  }
  // Vérif SÛRE (colonnes toujours présentes) — JAMAIS contournée même si une
  // colonne récente manque (fenêtre de déploiement). Rejette banni/supprimé.
  const DB = env.APEX_CHAT_DB;
  let u = null;
  try {
    u = await DB.prepare(
      'SELECT last_force_logout_at, is_banned, status, phone, is_admin FROM users WHERE id=?'
    ).bind(payload.sub).first();
  } catch (_) {
    // Base momentanément illisible : on ne coupe pas tout le monde, mais on ne
    // croit JAMAIS un droit admin écrit dans un jeton de 30 jours (revue 08.10).
    payload.is_admin = false;
    return payload;
  }
  // Compte introuvable (effacé pour de bon) : le jeton ne vaut plus rien (revue 08.10).
  if (!u) return null;
  if (u.is_banned || u.status === 'suspended') return null;
  if (u.last_force_logout_at && payload.iat && u.last_force_logout_at > payload.iat * 1000) return null;
  // Le droit admin vient de la BASE, pas du jeton : un admin rétrogradé perd l'accès tout de suite.
  payload.is_admin = !!u.is_admin;
  if (u.status !== 'deleted') return payload;

  // Compte SUPPRIMÉ/FUSIONNÉ → suivre merged_into vers le compte canonique
  // (anti-verrouillage : un JWT encore lié à un doublon agit comme le compte
  // gardé au lieu d'être rejeté → "messages qui n'arrivent pas"). v1.1.179.
  // Best-effort : si merged_into absent OU pas de canonique → on REJETTE (sûr).
  try {
    let canonId = null;
    try {
      const mp = await DB.prepare('SELECT merged_into FROM users WHERE id=?').bind(payload.sub).first();
      canonId = (mp && mp.merged_into) || null;
    } catch (_) { /* colonne pas encore créée → canonId reste null */ }
    // Rattrapage des comptes supprimés SANS pointeur (fusions v1.1.177) : compte
    // actif au numéro EXACTEMENT identique (revue 08.10 : les 8 derniers chiffres
    // confondaient deux personnes de pays différents). Rien n'est écrit en base.
    if (!canonId) {
      const exact = normPhone(u.phone || '');
      if (exact && exact.startsWith('+') && exact.replace(/\D/g, '').length >= 8) {
        const cand = await DB.prepare(
          "SELECT id FROM users WHERE status != 'deleted' AND id != ? AND phone = ? LIMIT 2"
        ).bind(payload.sub, exact).all().catch(() => null);
        const rows = (cand && cand.results) || [];
        if (rows.length === 1) canonId = rows[0].id;   // ambigu (2+) → rejet sûr
      }
    }
    if (canonId) {
      let cur = canonId, hops = 0, c = null;
      while (cur && hops < 3) {
        c = await DB.prepare('SELECT id, is_admin, is_banned, status, merged_into FROM users WHERE id=?').bind(cur).first();
        if (!c) break;
        if (c.merged_into && c.merged_into !== cur) { cur = c.merged_into; hops++; continue; }
        break;
      }
      if (c && c.status !== 'deleted' && !c.is_banned) {
        payload.sub = c.id;
        payload.is_admin = !!c.is_admin;
        return payload;
      }
    }
  } catch (_) {}
  return null; // supprimé sans canonique → rejet sûr
}

// ============================================================================
//  v1.1.30 — Premium quota middleware
//  Non-premium users : N usages / jour pour chaque feature IA gourmande
//  Premium / lifetime : unlimited
// ============================================================================
const FREE_QUOTAS = {
  'voice-transcribe': 5,   // 5 transcriptions /jour gratuit
  'image-describe': 10,    // 10 alt-text /jour gratuit
  'summarize': 3,          // 3 Memory Lane /jour gratuit
  'smart-reply': 30,       // 30 suggestions /jour gratuit
  'translate': 20,         // 20 traductions /jour gratuit
  'ia-chat': 30            // Lot 2 (E) : 30 messages Apex /jour gratuit (avant : illimité)
};
// Lot 2 (E) : la lecture KV puis l'écriture KV après l'appel IA laissaient N
// requêtes simultanées passer toutes sur « 0 utilisé » (coût IA non borné).
// Le verrou est désormais un compteur D1 incrémenté ATOMIQUEMENT AVANT l'appel
// (UPDATE … SET used=used+1 WHERE used < limite, on vérifie `changes`). La
// réservation est rendue si la requête n'a finalement rien consommé (échec IA,
// réponse en cache, corps invalide) — voir _releaseUnconsumedQuota(). Le KV
// reste le miroir d'affichage (/api/premium/quota) et un pré-filtre rapide.
const _pendingQuota = new WeakMap();   // request → réservations non consommées
async function _reserveQuotaD1(env, userId, feature, day, limit, kvUsed) {
  const DB = env.APEX_CHAT_DB;
  // Amorce du jour (reprend l'usage déjà compté en KV, une seule fois).
  await DB.prepare(
    'INSERT OR IGNORE INTO ai_quota (user_id, feature, day, used) VALUES (?, ?, ?, ?)'
  ).bind(userId, feature, day, Math.max(0, kvUsed | 0)).run();
  const r = await DB.prepare(
    'UPDATE ai_quota SET used = used + 1 WHERE user_id=? AND feature=? AND day=? AND used < ?'
  ).bind(userId, feature, day, limit).run();
  const c = _changes(r);
  if (c === null) throw new Error('compteur D1 sans meta.changes');   // → repli KV (comportement d'avant)
  return c === 1;
}
async function checkPremiumOrQuota(env, userId, feature, request) {
  if (!userId) return { ok: false, reason: 'no_user' };
  let u;
  try {
    u = await env.APEX_CHAT_DB.prepare(
      'SELECT premium_until, premium_plan FROM users WHERE id=?'
    ).bind(userId).first();
  } catch (e) {
    console.error('[premium-quota]', e);
    return { ok: true, premium: false, error: 'check_failed' }; // fail open (base illisible)
  }
  const isPremium = u && u.premium_until && u.premium_until > Date.now();
  if (isPremium) return { ok: true, premium: true, plan: u.premium_plan };
  const limit = FREE_QUOTAS[feature] || 5;
  const today = new Date().toISOString().slice(0, 10);
  const kvKey = `quota:${userId}:${feature}:${today}`;
  let used = 0;
  try {
    const usedStr = env.APEX_CHAT_KV ? await env.APEX_CHAT_KV.get(kvKey) : null;
    used = parseInt(usedStr || '0', 10) || 0;
  } catch (_) { used = 0; }
  if (used >= limit) return { ok: false, reason: 'quota_exceeded', used, limit, feature };
  let reserved = false;
  try {
    reserved = await _reserveQuotaD1(env, userId, feature, today, limit, used);
  } catch (e) {
    // Table ai_quota absente (fenêtre de migration) : ancien comportement (KV seul).
    console.warn('[premium-quota] compteur D1 indisponible :', e && e.message);
    return { ok: true, premium: false, used, limit, kvKey, _incr: true };
  }
  if (!reserved) return { ok: false, reason: 'quota_exceeded', used: Math.max(used, limit), limit, feature };
  const q = { ok: true, premium: false, used, limit, kvKey, _incr: true, _d1: { userId, feature, day: today } };
  if (request && typeof request === 'object') {
    const list = _pendingQuota.get(request) || [];
    list.push(q);
    _pendingQuota.set(request, list);
  }
  return q;
}
async function consumeQuota(env, quotaResult) {
  if (!quotaResult || !quotaResult._incr) return;
  quotaResult._consumed = true;   // la réservation D1 est définitivement acquise
  if (!quotaResult.kvKey || !env.APEX_CHAT_KV) return;
  try {
    const used = (quotaResult.used || 0) + 1;
    await env.APEX_CHAT_KV.put(quotaResult.kvKey, String(used), { expirationTtl: 90000 }); // ~25h
  } catch (e) { console.error('[quota-consume]', e); }
}
// Rend les réservations D1 d'une requête qui n'a rien consommé (échec, cache…).
async function _releaseUnconsumedQuota(request, env) {
  const list = _pendingQuota.get(request);
  if (!list) return;
  _pendingQuota.delete(request);
  for (const q of list) {
    if (q._consumed || !q._d1) continue;
    try {
      await env.APEX_CHAT_DB.prepare(
        'UPDATE ai_quota SET used = used - 1 WHERE user_id=? AND feature=? AND day=? AND used > 0'
      ).bind(q._d1.userId, q._d1.feature, q._d1.day).run();
    } catch (_) { /* best-effort */ }
  }
}

async function getModeConfig(env) {
  const stmt = await env.APEX_CHAT_DB.prepare('SELECT key, value FROM system_config').all();
  const config = {};
  for (const row of (stmt.results || [])) config[row.key] = row.value;
  return config;
}

// Lot 2 (A) : SEUL point d'écriture du journal d'audit. audit_log.id est un
// INTEGER AUTOINCREMENT (0001_init.sql) : quatre routes y inséraient un UUID →
// « datatype mismatch » → la route répondait 500 alors que l'action était faite.
// Les valeurs non sérialisables par D1 (undefined, objet Request passé par erreur
// en ip_hash) sont ramenées à NULL ; `details` est un OBJET (une chaîne déjà
// encodée est gardée telle quelle, jamais ré-encodée).
async function auditLog(env, actor_id, action, target_type, target_id, details, ipHash, ua) {
  const s = (v) => (typeof v === 'string' ? v : null);
  const d = typeof details === 'string' ? details : JSON.stringify(details || {});
  await env.APEX_CHAT_DB.prepare(
    'INSERT INTO audit_log (actor_id, action, target_type, target_id, details, ts, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(String(actor_id || 'system'), action, s(target_type), target_id == null ? null : String(target_id), d, Date.now(), s(ipHash), s(ua)).run();
}

// ============================================================================
//  Connexion-tracking (migration 0007)
//  Kevin "être au courant de chaque connexion + capturer max de données :
//  personnes, devices, lieux". Capture COMPLÈTE à chaque login réussi ;
//  push iPhone admin SEULEMENT sur NOUVEAU device OU NOUVEAU lieu.
//
//  TOUT est en try/catch interne : une erreur de capture ne doit JAMAIS
//  casser/ralentir un login (la capture est secondaire à l'auth).
// ============================================================================

// parseUserAgent — extraction simple/robuste OS / browser / device depuis l'UA.
export function parseUserAgent(ua) {
  const s = String(ua || '');
  let os = '';
  if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/Windows/i.test(s)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(s)) os = 'macOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  let browser = '';
  // Ordre important : Edge contient "Chrome", Chrome contient "Safari".
  if (/Edg(e|A|iOS)?\//i.test(s)) browser = 'Edge';
  else if (/Firefox|FxiOS/i.test(s)) browser = 'Firefox';
  else if (/Chrome|CriOS|Chromium/i.test(s)) browser = 'Chrome';
  else if (/Safari/i.test(s)) browser = 'Safari';

  const device = /Mobi|iPhone|iPad|iPod|Android/i.test(s) ? 'mobile' : 'desktop';
  return { os, browser, device };
}

export async function captureConnection(env, request, user) {
  try {
    if (!user || !user.id) return { isNew: false };

    // Géo via request.cf (Cloudflare, GRATUIT). En test/local request.cf est
    // undefined → valeurs '' par défaut, ne jamais throw.
    const cf = request.cf || {};
    const country = cf.country || '';
    const city = cf.city || '';
    const region = cf.region || '';

    const ua = request.headers.get('User-Agent') || '';
    const { os, browser, device } = parseUserAgent(ua);
    const ip_hash = await sha256(request.headers.get('CF-Connecting-IP') || '');

    // Signature device+lieu — clé d'unicité (avec user_id).
    const sig = `${os}|${browser}|${country}|${city}`;
    const now = Date.now();

    const existing = await env.APEX_CHAT_DB.prepare(
      'SELECT id FROM connections WHERE user_id=? AND sig=?'
    ).bind(user.id, sig).first();

    if (existing) {
      await env.APEX_CHAT_DB.prepare(
        'UPDATE connections SET last_seen=?, hits=hits+1 WHERE id=?'
      ).bind(now, existing.id).run();
      return { isNew: false };
    }

    await env.APEX_CHAT_DB.prepare(
      `INSERT INTO connections (id, user_id, sig, device, os, browser, country, city, region, ip_hash, first_seen, last_seen, hits)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(crypto.randomUUID(), user.id, sig, device, os, browser, country, city, region, ip_hash, now, now).run();

    // Nouveau device OU nouveau lieu → push admin (sauf si c'est l'admin lui-même).
    if (user.id !== 'kdmc_admin') {
      try {
        await sendPushToUser('kdmc_admin', {
          title: '🔔 Nouvelle connexion',
          body: `${user.real_name || user.pseudo} — ${os || '?'}/${browser || '?'} depuis ${city || '?'}, ${country || '?'}`,
          data: { user_id: user.id, sig }
        }, env);
      } catch (_e) { /* best-effort — ne bloque jamais le login */ }
    }

    return { isNew: true, country, city, device, os, browser };
  } catch (_e) {
    // fire-and-forget : la capture ne casse jamais le login
    return { isNew: false };
  }
}

// GET /api/admin/connections — liste des connexions trackées (admin only).
async function handleAdminConnections(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  const rows = await env.APEX_CHAT_DB.prepare(
    'SELECT * FROM connections ORDER BY last_seen DESC LIMIT 500'
  ).all();

  return json({ ok: true, connections: rows.results || [] });
}

// ============================================================================
//  Routes Auth
// ============================================================================

// v1.1.162 — POST /api/auth/check-phone
// Kevin "j'ai dû créer compte code etc pour rien, il m'a reconnu à la fin".
// Quand l'invité clique le lien, le frontend appelle cet endpoint AVANT
// d'afficher l'onboarding : si le phone est déjà connu, on bascule sur un
// login direct au lieu de re-créer une fiche.
// Réponse minimale (anti-énumération) : {exists, first_name?} — pas de
// real_name complet, pas de phone, pas d'id ; juste de quoi afficher
// "Bienvenue Marie" et lancer un verify-otp 000000.
async function handleCheckPhone(request, env) {
  let body = {};
  try { body = await request.json(); } catch (e) {
    return err('JSON body invalide', 400, 'bad_json', { detail: e?.message });
  }
  const phoneNorm = normPhone(body.phone || '');
  if (!phoneNorm || !/^\+?\d{8,15}$/.test(phoneNorm)) {
    return err('Numéro invalide', 400, 'phone_invalid', { received: body.phone, normalized: phoneNorm });
  }
  // Audit 17/09/2026 (P2) : oracle d'énumération sans plafond (« ce numéro existe-t-il ? »
  // + prénom + statut admin, en boucle, sans être connecté). Plafond 30/h par adresse IP,
  // même table que l'OTP (clé préfixée pour ne pas consommer le quota SMS).
  try {
    const ipHash = 'cp:' + (await sha256(request.headers.get('CF-Connecting-IP') || 'unknown')).slice(0, 60);
    const hourKey = new Date().toISOString().slice(0, 13);
    const rl = await env.APEX_CHAT_DB.prepare('SELECT count FROM ratelimit_otp WHERE ip_hash=? AND hour_key=?').bind(ipHash, hourKey).first();
    if (rl && rl.count >= 30) return err('Trop de tentatives, réessaie dans 1h', 429, 'rate_limit');
    await env.APEX_CHAT_DB.prepare(
      'INSERT OR REPLACE INTO ratelimit_otp (ip_hash, hour_key, count) VALUES (?, ?, COALESCE((SELECT count FROM ratelimit_otp WHERE ip_hash=? AND hour_key=?),0)+1)'
    ).bind(ipHash, hourKey, ipHash, hourKey).run();
  } catch (e) { console.warn('[check-phone] rate-limit indisponible :', e && e.message); }
  try {
    const user = await env.APEX_CHAT_DB.prepare(
      'SELECT id, pseudo, real_name, first_name, admin_authorized, status FROM users WHERE phone=?'
    ).bind(phoneNorm).first();
    if (!user) return json({ ok: true, exists: false });
    if (user.status && user.status !== 'active') {
      return json({ ok: true, exists: true, blocked: true });
    }
    // first_name extrait du real_name si vide
    let first = user.first_name || '';
    if (!first && user.real_name) {
      first = String(user.real_name).trim().split(/\s+/)[0] || '';
    }
    // admin_authorized n'est plus renvoyé avant preuve de possession du numéro (OTP).
    return json({
      ok: true,
      exists: true,
      first_name: first || user.pseudo || '',
    });
  } catch (e) {
    return err('Erreur lookup phone', 500, 'lookup_failed', { detail: e?.message });
  }
}

// v1.1.216 — Cercle de confiance : numéros autorisés à se connecter SANS SMS
// (Laurence + famille/amis proches). Configuré par Kevin via les secrets
// LAURENCE_PHONE_E164 et TRUSTED_CIRCLE_PHONES (liste CSV). Kevin (admin) est géré
// à part → exclu de cet ensemble. App privée à invitation : seuls les numéros
// EXPLICITEMENT configurés par Kevin passent (pas un backdoor universel).
export function _trustedCircleSet(env) {
  const set = new Set();
  const add = (p) => { const n = normPhone(p || ''); if (n) set.add(n); };
  add(env && env.LAURENCE_PHONE_E164);
  String((env && env.TRUSTED_CIRCLE_PHONES) || '').split(',').forEach(add);
  const kev = normPhone((env && env.KEVIN_PHONE_E164) || '');
  if (kev) set.delete(kev);   // Kevin = bypass admin séparé
  return set;
}
export function _isTrustedCircle(cleanPhone, env) {
  return _trustedCircleSet(env).has(normPhone(cleanPhone || ''));
}

// v1.1.218 (Kevin « tu vas pas faire ça pour chaque personne ») — cercle de
// confiance GÉRÉ DEPUIS L'ADMIN : numéros stockés en D1 (system_config, JSON
// array), en plus de ceux d'env. Kevin ajoute/retire un numéro dans l'app →
// effet IMMÉDIAT, zéro déploiement, zéro code.
export async function _dbTrustedCircleList(env) {
  try {
    const row = await env.APEX_CHAT_DB.prepare(
      "SELECT value FROM system_config WHERE key='trusted_circle_phones'"
    ).first();
    if (!row || !row.value) return [];
    const arr = JSON.parse(row.value);
    return Array.isArray(arr) ? arr.map((p) => normPhone(p)).filter(Boolean) : [];
  } catch (_) { return []; }
}
export async function _isTrustedCircleAsync(env, phone) {
  if (_isTrustedCircle(phone, env)) return true;          // numéros d'env (Laurence, CSV)
  const n = normPhone(phone || '');
  if (!n) return false;
  return (await _dbTrustedCircleList(env)).includes(n);   // numéros gérés en admin
}

// GET  /api/admin/trusted-circle        → liste des numéros de confiance (admin)
// POST /api/admin/trusted-circle {phone, action?} → ajoute (défaut) ou retire ('remove')
// Self-service : Kevin gère le cercle depuis l'app, sans déploiement.
export async function handleTrustedCircle(request, env, method) {
  const auth = await getAuthUser(request, env);
  if (!auth || !(auth.is_admin || auth.sub === 'kdmc_admin')) return err('Réservé admin', 403, 'forbidden');
  if (method === 'GET') return json({ ok: true, phones: await _dbTrustedCircleList(env) });
  let body = {}; try { body = await request.json(); } catch (_) { body = {}; }
  const phone = normPhone(body.phone || '');
  if (!phone || !/^\+?\d{8,15}$/.test(phone)) return err('Numéro invalide', 400, 'bad_phone');
  let list = await _dbTrustedCircleList(env);
  if (body.action === 'remove') list = list.filter((p) => p !== phone);
  else if (!list.includes(phone)) list.push(phone);
  await env.APEX_CHAT_DB.prepare(
    "INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES ('trusted_circle_phones', ?, ?, ?)"
  ).bind(JSON.stringify(list), Date.now(), auth.sub).run();
  return json({ ok: true, phones: list });
}

export async function handleSendOtp(request, env) {
  const { phone, name } = await readJson(request);
  if (typeof phone !== 'string' || !/^\+?\d{8,15}$/.test(phone)) return err('Numéro invalide', 400);
  // Règle Kevin : prénom + nom obligatoires (2 tokens ≥2 chars), sécurité anti-impersonation.
  // Lot 2 (O) : la même règle pour TOUS les numéros. L'exception « numéro admin »
  // permettait de deviner le numéro de Kevin (200 avec un seul mot, 400 ailleurs).
  // L'app envoie toujours prénom + nom (et reconnaît Kevin par son nom, sans cet appel).
  const kevinSecret = normPhone(env.KEVIN_PHONE_E164);
  const cleanPhone = normPhone(phone);   // comparaison robuste 0X↔+33X, \n, espaces
  const tokens = String(typeof name === 'string' ? name : '').trim().split(/\s+/).filter(t => t.length >= 2);
  if (tokens.length < 2) return err('Prénom ET nom requis (ex: Marie Dupont) — sécurité', 400, 'name_too_short');

  const phoneHash = await sha256(cleanPhone);
  // Lot 2 (O) : le numéro admin ne reçoit plus de réponse spéciale
  // (`provider:'admin-bypass'`, `_admin_bypass`) qui révélait QUEL numéro est
  // celui de l'admin, avant même le plafond. Il passe le plafond comme tout le
  // monde, puis reçoit une réponse de la même forme qu'un envoi normal — sans
  // qu'aucun code ne soit stocké ni envoyé (sa connexion passe par verify-otp).
  const isAdminNumber = !!(kevinSecret && cleanPhone === kevinSecret);

  // ============ CERCLE DE CONFIANCE — SUPPRIMÉ (Kevin 2026-07-01 « annule cercle
  // confiance », audit sécu P1-1). Le login sans SMS par numéro seul (numéro = credential
  // à faible entropie) est retiré : Laurence + famille passent désormais par l'OTP réel,
  // comme tout le monde. (Le bypass admin de Kevin lui-même, géré plus bas, est conservé.)

  // ============ Rate limit ============
  const ipHash = await sha256(request.headers.get('CF-Connecting-IP') || 'unknown');
  const hourKey = new Date().toISOString().slice(0, 13);
  const rl = await env.APEX_CHAT_DB.prepare(
    'SELECT count FROM ratelimit_otp WHERE ip_hash=? AND hour_key=?'
  ).bind(ipHash, hourKey).first();
  const max = parseInt((await getModeConfig(env)).OTP_RATE_LIMIT_PER_HOUR || '5');
  if (rl && rl.count >= max) return err('Trop de tentatives, réessaie dans 1h', 429, 'rate_limit');

  await env.APEX_CHAT_DB.prepare(
    'INSERT OR REPLACE INTO ratelimit_otp (ip_hash, hour_key, count) VALUES (?, ?, COALESCE((SELECT count FROM ratelimit_otp WHERE ip_hash=? AND hour_key=?),0)+1)'
  ).bind(ipHash, hourKey, ipHash, hourKey).run();

  // ============ Génère OTP 6 chiffres ============
  // CSPRNG (leçon audit) : un OTP à 6 chiffres tiré de Math.random() est
  // prédictible si l'état du PRNG est deviné. getRandomValues = imprévisible.
  const otp = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const otpHash = await sha256(otp + ':' + cleanPhone);

  if (isAdminNumber) {
    // Même forme qu'un envoi normal ; RIEN n'est stocké (aucun code valable n'existe
    // pour ce numéro : la connexion admin reste réservée à verify-otp + garde MFA).
    if (env.VONAGE_API_KEY && env.VONAGE_API_SECRET) {
      return json({ ok: true, sessionId: phoneHash, provider: 'vonage' });
    }
    if (env.ALLOW_TEST_OTP === 'true') {
      return json({
        ok: true, sessionId: phoneHash, provider: 'inline',
        _dev_otp: otp,
        _dev_note: 'SMS indispo (config). Code affiche (mode cercle prive).',
        _show_code_in_app: true
      });
    }
    return err('Envoi du SMS impossible pour le moment, réessaie', 502, 'sms_unavailable', {
      detail: 'aucun provider SMS disponible'
    });
  }

  // Stocke OTP hashé en D1 (TTL 5 min)
  await env.APEX_CHAT_DB.prepare(
    `CREATE TABLE IF NOT EXISTS otp_pending (
       phone_hash TEXT PRIMARY KEY,
       otp_hash TEXT NOT NULL,
       attempts INTEGER DEFAULT 0,
       created_at INTEGER NOT NULL,
       expires_at INTEGER NOT NULL
     )`
  ).run();
  await env.APEX_CHAT_DB.prepare(
    'INSERT OR REPLACE INTO otp_pending (phone_hash, otp_hash, attempts, created_at, expires_at) VALUES (?, ?, 0, ?, ?)'
  ).bind(phoneHash, otpHash, Date.now(), Date.now() + 300000).run();

  // ============ Envoi SMS — chaîne failover ============
  let smsProvider = 'none';
  let smsError = null;

  // Tentative 1 : Vonage
  if (env.VONAGE_API_KEY && env.VONAGE_API_SECRET) {
    try {
      const smsResponse = await fetch('https://rest.nexmo.com/sms/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          api_key: env.VONAGE_API_KEY,
          api_secret: env.VONAGE_API_SECRET,
          from: 'ApexChat',
          to: cleanPhone.replace(/^\+/, ''),
          text: `Apex Chat : ton code de verification est ${otp}. Valide 5 min.`
        })
      });
      const smsData = await smsResponse.json();
      const msg = smsData.messages?.[0];
      if (msg?.status === '0') {
        smsProvider = 'vonage';
      } else {
        smsError = msg?.['error-text'] || 'Vonage error ' + msg?.status;
        console.error('Vonage:', smsError);
      }
    } catch (e) {
      smsError = 'Vonage exception: ' + e.message;
      console.error(smsError);
    }
  }

  // Tentative 2 : TextBelt (gratuit 1 SMS/jour, fallback)
  if (smsProvider === 'none') {
    try {
      const tbResponse = await fetch('https://textbelt.com/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          phone: cleanPhone,
          message: `Apex Chat: ton code est ${otp}. Valide 5 min.`,
          key: 'textbelt'  // gratuit 1/jour
        })
      });
      const tbData = await tbResponse.json();
      if (tbData.success) {
        smsProvider = 'textbelt-free';
      } else {
        console.error('TextBelt:', tbData.error);
      }
    } catch (e) {
      console.error('TextBelt exception:', e.message);
    }
  }

  // Fallback : si aucun SMS n'est parti. v1.1.172 FIX P1/P2 (audit crew) :
  // renvoyer l'OTP en clair dans la réponse = contournement total de l'OTP
  // (quiconque connaît un numéro récupère le code). On ne l'expose QUE si
  // ALLOW_TEST_OTP === 'true' (mode cercle privé assumé). Sinon, on échoue
  // proprement sans fuiter le code.
  if (smsProvider === 'none') {
    if (env.ALLOW_TEST_OTP === 'true') {
      return json({
        ok: true, sessionId: phoneHash, provider: 'inline',
        _dev_otp: otp,
        _dev_note: 'SMS indispo (' + (smsError || 'config') + '). Code affiche (mode cercle prive).',
        _show_code_in_app: true
      });
    }
    return err('Envoi du SMS impossible pour le moment, réessaie', 502, 'sms_unavailable', {
      detail: smsError || 'aucun provider SMS disponible'
    });
  }

  return json({ ok: true, sessionId: phoneHash, provider: smsProvider });
}

// ============================================================================
//  Firebase ID token verification (P0 fix audit externe)
//  Vérification réelle via Firebase JWKS public keys
// ============================================================================

// Lot 2 (Y) : l'ancienne version téléchargeait des CERTIFICATS X.509 (PEM) et les
// importait comme « spki » — un certificat n'est pas une clé SPKI, l'import
// échouait toujours (chemin Firebase mort). On lit désormais le JWKS officiel de
// securetoken (clés publiques au format JWK) et on importe en 'jwk'. Fail-closed :
// aucune clé exploitable → exception → connexion refusée.
export const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
export async function fetchFirebasePublicKeys(env) {
  // Cache 1h dans KV (clé distincte de l'ancien cache de certificats PEM)
  try {
    const cached = await env.APEX_CHAT_CACHE?.get('firebase:jwks', 'json');
    if (cached && cached.expires_at > Date.now() && Array.isArray(cached.keys)) return cached.keys;
  } catch (_) { /* cache illisible → on refetch */ }

  const response = await fetch(FIREBASE_JWKS_URL);
  if (!response.ok) throw new Error('Firebase JWKS fetch failed');
  const data = await response.json();
  const keys = (data && Array.isArray(data.keys)) ? data.keys.filter(k => k && k.kty === 'RSA' && k.kid && k.n && k.e) : [];
  if (!keys.length) throw new Error('Firebase JWKS vide');

  try {
    await env.APEX_CHAT_CACHE?.put('firebase:jwks', JSON.stringify({
      keys, expires_at: Date.now() + 3600000
    }), { expirationTtl: 3600 });
  } catch (_) {}

  return keys;
}

export async function verifyFirebaseIdToken(idToken, env) {
  if (!env.FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID non configuré');
  if (typeof idToken !== 'string') throw new Error('Token Firebase malformé');

  const [headerB64, payloadB64, sigB64] = idToken.split('.');
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error('Token Firebase malformé');

  const decode = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '='));
  let header, payload;
  try {
    header = JSON.parse(decode(headerB64));
    payload = JSON.parse(decode(payloadB64));
  } catch (_) { throw new Error('Token Firebase malformé'); }

  // Vérifications RGPD/sécurité
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Token expiré');
  if (payload.iat && payload.iat > now + 60) throw new Error('Token futur (iat invalide)');
  if (payload.aud !== env.FIREBASE_PROJECT_ID) throw new Error('Token aud incorrect');
  if (payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) throw new Error('Token iss incorrect');
  if (!payload.sub) throw new Error('Token sub manquant');
  if (header.alg !== 'RS256') throw new Error('Token alg incorrect');
  // Lot 2 (Y) : un jeton SANS exp valait à vie — exp est obligatoire.
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) throw new Error('Token expiré (exp manquant)');

  // Vérifier signature
  const keys = await fetchFirebasePublicKeys(env);
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Token kid inconnu');

  const publicKey = await crypto.subtle.importKey(
    'jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const sigBytes = Uint8Array.from(decode(sigB64), c => c.charCodeAt(0));
  const dataBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, sigBytes, dataBytes);

  if (!valid) throw new Error('Signature Firebase invalide');

  return payload;  // { sub, phone_number, aud, iss, iat, exp, ... }
}

export async function handleVerifyOtp(request, env) {
  let _parseErr = null;
  const reqBody = await request.json().catch((e) => { _parseErr = e.message; return {}; });
  if (_parseErr) return err('Corps requête invalide', 400, 'bad_json', _parseErr);
  const { phone, name, pseudo, otp, firebase_id_token } = reqBody;
  if (!phone || !pseudo) return err('Champs manquants', 400, 'missing_fields',
    'phone=' + (phone ? 'ok' : 'VIDE') + ' pseudo=' + (pseudo ? 'ok' : 'VIDE'));
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(pseudo)) return err('Pseudo invalide (3-20 chars alphanum)', 400);
  // Comparaison robuste : normPhone gère 0X↔+33X, \n résiduel, espaces
  const kevinSecret = normPhone(env.KEVIN_PHONE_E164);
  const phoneNorm = normPhone(phone);
  const isKevinBypass = kevinSecret && phoneNorm === kevinSecret;
  // Règle Kevin : prénom + nom obligatoires (sécurité anti-impersonation)
  if (!isKevinBypass) {
    const tokens = String(name || '').trim().split(/\s+/).filter(t => t.length >= 2);
    if (tokens.length < 2) return err('Prénom ET nom requis (sécurité)', 400, 'name_too_short');
  }

  const cleanPhone = phoneNorm;
  const phoneHash = await sha256(cleanPhone);

  // ============ BYPASS ADMIN Kevin + DIRECT SIGNUP (v1.1.154) ============
  // Kevin "enlève l'histoire du code etc, pour tous" : otp='000000' est
  // accepté pour TOUS les numéros — Kevin admin si phone matche le secret,
  // signup direct (zéro OTP) sinon. Mode "cercle privé" où l'admin vet
  // les utilisateurs socialement (via la fiche admin).
  if (otp === '000000') {
    // Cas 1 : pas Kevin → signup direct (mode "cercle privé").
    // v1.1.172 FIX P0 (audit crew) : ce signup-direct universel est un
    // contournement d'auth (n'importe quel numéro). On le gate derrière
    // ALLOW_TEST_OTP (var wrangler). À 'false' → l'OTP SMS réel est imposé
    // (le bypass admin Kevin ci-dessous reste, lui, toujours actif).
    if ((!kevinSecret || phoneNorm !== kevinSecret) && env.ALLOW_TEST_OTP === 'true') {
      let step = 'direct_init';
      try {
        step = 'select_existing';
        let user = await env.APEX_CHAT_DB.prepare(
          'SELECT * FROM users WHERE phone=?'
        ).bind(cleanPhone).first();
        if (!user) {
          step = 'insert_user';
          const newId = crypto.randomUUID();
          const safePseudo = String(pseudo || name || 'user').toLowerCase()
            .replace(/[^a-z0-9_-]/g, '').slice(0, 18) || ('user' + Date.now().toString(36).slice(-4));
          await env.APEX_CHAT_DB.prepare(
            `INSERT INTO users (id, pseudo, real_name, phone, phone_hash,
               identity_key_pub, pq_key_pub, prekey_signed,
               source, admin_authorized, created_at, status)
             VALUES (?, ?, ?, ?, ?, 'PENDING_PQXDH', 'PENDING_PQXDH', 'PENDING_PQXDH',
                     'direct-signup', 1, ?, 'active')
             ON CONFLICT(pseudo) DO NOTHING`
          ).bind(newId, safePseudo, name || safePseudo, cleanPhone, phoneHash, Date.now()).run();
          user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE phone=?').bind(cleanPhone).first();
          if (!user) {
            // Pseudo conflict — réessaie avec un suffixe
            const retryId = newId;
            const altPseudo = safePseudo.slice(0, 14) + '_' + Date.now().toString(36).slice(-4);
            await env.APEX_CHAT_DB.prepare(
              `INSERT INTO users (id, pseudo, real_name, phone, phone_hash,
                 identity_key_pub, pq_key_pub, prekey_signed,
                 source, admin_authorized, created_at, status)
               VALUES (?, ?, ?, ?, ?, 'PENDING_PQXDH', 'PENDING_PQXDH', 'PENDING_PQXDH',
                       'direct-signup', 1, ?, 'active')`
            ).bind(retryId, altPseudo, name || altPseudo, cleanPhone, phoneHash, Date.now()).run();
            user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE phone=?').bind(cleanPhone).first();
            if (!user) return err('Création compte échouée', 500, 'create_fail', 'pseudo_conflict');
          }
        }
        step = 'sign_jwt';
        if (!env.JWT_SIGN_KEY) return err('Config serveur incomplète', 503, 'jwt_key_unset');
        // Revue 08.10 (A1) : compte pré-créé par invitation → réclamé ici, les
        // sessions antérieures (inviteur) tombent AVANT l'émission du jeton.
        const iatDirect = await _claimInvitedAccount(env, user);
        const jwt = await signJWT({
          sub: user.id, pseudo: user.pseudo, is_admin: !!user.is_admin,
          iat: iatDirect,
          exp: iatDirect + 30 * 86400
        }, env.JWT_SIGN_KEY);
        await auditLog(env, user.id, 'direct_signup', 'user', user.id, { phone_hash: phoneHash },
          await sha256(request.headers.get('CF-Connecting-IP') || ''), request.headers.get('User-Agent'))
          .catch(() => {});
        await captureConnection(env, request, user);
        return json({ ok: true, token: jwt, user: {
          id: user.id, pseudo: user.pseudo, real_name: user.real_name,
          phone: user.phone, is_admin: !!user.is_admin
        }});
      } catch (e) {
        console.error('[direct-signup]', step, e.message, e.stack);
        e.step = 'direct_signup:' + step;
        return err('Création compte échouée', 500, 'signup_fail', e);
      }
    }
    // Cas 2 : c'est Kevin (numéro = secret) → bypass admin (TOUJOURS actif).
    // v1.1.172 : garde explicite — n'exécute le bypass QUE pour le vrai numéro
    // Kevin. Sans ça, avec ALLOW_TEST_OTP off + Cas 1 sauté, un inconnu tomberait
    // ici et se ferait passer pour kdmc_admin.
    if (kevinSecret && phoneNorm === kevinSecret) {
    // v1.1.283 — FERMETURE PORTE ADMIN (audit 05/09, faille P0).
    // Le numéro seul ne suffit PLUS à devenir admin dès que Kevin allume le
    // drapeau ADMIN_BYPASS_REQUIRE_MFA : il faut EN PLUS le jeton secret
    // X-Apex-Admin-Token (== APEX_CHAT_ADMIN_TOKEN), qui n'est JAMAIS dans la
    // page (secret du Worker). Défaut : drapeau absent/'false' → comportement
    // inchangé → AUCUN risque de verrouillage. Kevin allume une fois que son
    // app envoie bien le jeton (vérifié pendant que le drapeau est encore off).
    if (env.ADMIN_BYPASS_REQUIRE_MFA === 'true') {
      const provided = (request.headers.get('X-Apex-Admin-Token') || '').trim();
      const expected = (env.APEX_CHAT_ADMIN_TOKEN || '').trim();
      if (!expected || provided !== expected) {
        return err('Preuve admin requise (Face ID / clé admin)', 401, 'admin_mfa_required',
          { hint: 'Connexion admin sécurisée : ton app doit envoyer X-Apex-Admin-Token. Débloque via Face ID.' });
      }
    }
    if (!env.KEVIN_PHONE_E164) {
      return err('Bypass admin indisponible', 503, 'kevin_phone_unset',
        'Secret KEVIN_PHONE_E164 absent du Worker — config GitHub/Cloudflare requise');
    }
    let step = 'init';
    try {
      // Skip OTP check, créer/récupérer compte Kevin admin
      step = 'select_user';
      let user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE id=?').bind('kdmc_admin').first();
      if (!user) {
        step = 'insert_user';
        await env.APEX_CHAT_DB.prepare(
          `INSERT OR REPLACE INTO users (id, pseudo, real_name, phone, phone_hash, is_admin, is_kevin_alias,
           identity_key_pub, pq_key_pub, prekey_signed, source, created_at, status)
           VALUES (?, ?, ?, ?, ?, 1, 1, 'PENDING', 'PENDING', 'PENDING', 'admin-bypass', ?, 'active')`
        ).bind('kdmc_admin', pseudo || 'kevin', name || 'Kevin DESARZENS', cleanPhone, phoneHash, Date.now()).run();
        user = { id: 'kdmc_admin', pseudo: pseudo || 'kevin', real_name: name || 'Kevin DESARZENS', is_admin: 1 };
      }
      // v1.1.194 — kdmc_admin existait déjà avec un numéro placeholder ("…EVIN") :
      // on lui donne le VRAI numéro Kevin + on fusionne tout compte créé par erreur.
      // Sans ça, le stub `local_+<numéro>` de Kevin chez Laurence ne résout jamais
      // vers lui → messages de Laurence jamais reçus. Best-effort, zéro lockout.
      step = 'consolidate_kevin';
      try {
        const fixed = await consolidateKevinIntoAdmin(env, cleanPhone, phoneHash, Date.now());
        if (fixed && fixed.id) user = fixed;
      } catch (e) { console.warn('[kevin-consolidate/bypass]', e?.message); }
      step = 'sign_jwt';
      if (!env.JWT_SIGN_KEY) {
        return err('Config serveur incomplète', 503, 'jwt_key_unset',
          'Secret JWT_SIGN_KEY absent du Worker — JWT non signable');
      }
      const jwt = await signJWT({
        sub: 'kdmc_admin',
        pseudo: user.pseudo,
        is_admin: true,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 30 * 86400
      }, env.JWT_SIGN_KEY);
      // v1.1.161 — best-effort : assure le cercle privé Kevin↔Laurence si le
      // secret LAURENCE_PHONE_E164 est configuré côté Cloudflare. N'altère pas
      // la réponse de login en cas d'échec.
      try {
        if (env.LAURENCE_PHONE_E164) await ensureCorePair(env);
      } catch (_e) { /* silent — login Kevin doit toujours réussir */ }
      await captureConnection(env, request, user);
      return json({ ok: true, token: jwt, user: { id: 'kdmc_admin', pseudo: user.pseudo, is_admin: true }});
    } catch (e) {
      console.error('[verify-otp/bypass]', step, e.message, e.stack);
      e.step = 'bypass:' + step;
      return err('Connexion admin échouée', 500, 'bypass_fail', e);
    }
    } // fin garde "c'est le vrai Kevin"
    // Sinon (non-Kevin + ALLOW_TEST_OTP off) : on retombe sur l'OTP réel (Mode 1).
  }

  // ============ CERCLE DE CONFIANCE — SUPPRIMÉ (Kevin 2026-07-01 « annule cercle
  // confiance », audit sécu P1-1). La session sans OTP par numéro seul est retirée :
  // Laurence + famille/amis passent par l'OTP réel (Mode 1 ci-dessous) → une vraie preuve
  // de possession du numéro est désormais exigée. Le compte est créé normalement après OTP.

  // Mode 1 : OTP Vonage (priorité)
  if (otp) {
    // v1.1.172 FIX P0 : send-otp hashe sha256(otp+':'+cleanPhone) (numéro
    // NORMALISÉ), la vérif hashait le `phone` BRUT → tout numéro saisi en
    // format national (0612…) ne validait jamais. On hashe cleanPhone partout.
    const otpHash = await sha256(otp + ':' + cleanPhone);
    const pending = await env.APEX_CHAT_DB.prepare(
      'SELECT * FROM otp_pending WHERE phone_hash=?'
    ).bind(phoneHash).first();

    if (!pending) return err('Aucun code en attente. Recommence l\'inscription.', 400, 'no_otp');
    if (pending.expires_at < Date.now()) {
      await env.APEX_CHAT_DB.prepare('DELETE FROM otp_pending WHERE phone_hash=?').bind(phoneHash).run();
      return err('Code expiré. Recommence l\'inscription.', 410, 'otp_expired');
    }
    if (pending.attempts >= 5) {
      return err('Trop de tentatives. Reessaie dans 5 min.', 429, 'otp_max_attempts');
    }
    // Lot 2 (N) : lecture puis incrément séparés = N essais simultanés passaient
    // tous sur « attempts=0 » (force brute parallèle). L'essai est désormais
    // RÉSERVÉ atomiquement AVANT la comparaison ; 0 ligne modifiée = plus d'essai.
    const slot = await env.APEX_CHAT_DB.prepare(
      'UPDATE otp_pending SET attempts=attempts+1 WHERE phone_hash=? AND attempts<5'
    ).bind(phoneHash).run();
    const slotN = _changes(slot);
    if (slotN !== null && slotN !== 1) {
      return err('Trop de tentatives. Reessaie dans 5 min.', 429, 'otp_max_attempts');
    }
    if (pending.otp_hash !== otpHash) {
      return err('Code incorrect. Verifie tes 6 chiffres.', 401, 'otp_wrong');
    }
    // OK : supprime l'OTP utilisé — une seule requête gagne (usage unique).
    const used = await env.APEX_CHAT_DB.prepare('DELETE FROM otp_pending WHERE phone_hash=? AND otp_hash=?').bind(phoneHash, otpHash).run();
    if (_changes(used) === 0) {
      return err('Code déjà utilisé. Recommence l\'inscription.', 400, 'no_otp');
    }
  }
  // Mode 2 : Firebase ID token (fallback si configuré)
  else if (firebase_id_token && firebase_id_token !== '') {
    try {
      var firebasePayload = await verifyFirebaseIdToken(firebase_id_token, env);
      // Lot 2 (Y) : comparaison sur le numéro NORMALISÉ (0612… ≠ +33612… en brut).
      if (!firebasePayload.phone_number || normPhone(firebasePayload.phone_number) !== phoneNorm) {
        return err('Numero ne correspond pas au token Firebase', 401, 'phone_mismatch');
      }
    } catch (e) {
      return err('Token Firebase invalide : ' + e.message, 401, 'invalid_token');
    }
  }
  else {
    return err('OTP ou Firebase token requis', 400, 'no_auth_method');
  }

  // User existe-t-il déjà ? (cleanPhone = normalisé E.164)
  let user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE phone=?').bind(cleanPhone).first();

  if (!user) {
    // Vérifier pseudo unique (P0 FIX : ON CONFLICT pour éviter race condition)
    try {
      const id = crypto.randomUUID();

      // P0 FIX : isKevinAdmin via PHONE E.164 secret env (jamais via name)
      const isKevin = kevinSecret && cleanPhone === kevinSecret;

      await env.APEX_CHAT_DB.prepare(
        `INSERT INTO users (id, pseudo, real_name, phone, phone_hash, is_admin, is_kevin_alias,
         identity_key_pub, pq_key_pub, prekey_signed, source, admin_authorized, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_PQXDH', 'PENDING_PQXDH', 'PENDING_PQXDH', 'apex-chat-direct', 1, ?, 'active')
         ON CONFLICT(pseudo) DO NOTHING`
      ).bind(id, pseudo, name || pseudo, cleanPhone, phoneHash, isKevin ? 1 : 0, isKevin ? 1 : 0, Date.now()).run();
      // ↑ admin_authorized=1 auto APRÈS OTP réussi (règle Kevin : tout user inscrit = whitelisté visible admin)

      user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE phone=?').bind(cleanPhone).first();
      if (!user) return err('Pseudo déjà pris (race)', 409, 'pseudo_taken');
    } catch (e) {
      return err('Création compte échouée : ' + e.message, 500);
    }
  }

  // P0 FIX (audit) : si user devient admin maintenant via phone secret env, mettre à jour
  if (kevinSecret && cleanPhone === kevinSecret && !user.is_admin) {
    await env.APEX_CHAT_DB.prepare('UPDATE users SET is_admin=1, is_kevin_alias=1 WHERE id=?').bind(user.id).run();
    user.is_admin = 1;
  }

  // v1.1.194 — Kevin se connecte avec son VRAI numéro mais le login a ouvert un
  // compte NON-admin (admin:non / 403 / convs:0) parce que le compte admin
  // historique `kdmc_admin` (qui détient toutes les conversations) avait un numéro
  // placeholder. On le rattache TOUJOURS à `kdmc_admin` + on y fusionne le compte
  // créé par erreur + on donne son VRAI numéro à kdmc_admin (→ résout les stubs
  // `local_+<numéro>` de Kevin chez Laurence). Best-effort, zéro lockout.
  if (kevinSecret && cleanPhone === kevinSecret && (!user || user.id !== 'kdmc_admin')) {
    try {
      const fixed = await consolidateKevinIntoAdmin(env, cleanPhone, phoneHash, Date.now());
      if (fixed && fixed.id) user = fixed;
    } catch (e) { console.warn('[kevin-consolidate]', e?.message); }
  }

  // AUTO-RÉPARATION au login (Kevin : « ça doit être auto, partout ») : groupe
  // les comptes en double de la MÊME personne dans ce compte + 1 conv/contact.
  // Best-effort, ne JAMAIS bloquer le login. Réparer un côté répare l'autre.
  try { await autoHealPerson(env, user); } catch (e) { console.warn('[auto-heal-login]', e?.message); }

  // Revue 08.10.2026 (A1) : première preuve du numéro sur un compte pré-créé par
  // invitation → les sessions antérieures (dont celle ouverte par l'inviteur via
  // le lien magique) sont révoquées AVANT d'émettre le nouveau jeton.
  const iatOtp = await _claimInvitedAccount(env, user);

  const jwt = await signJWT({
    sub: user.id,
    pseudo: user.pseudo,
    is_admin: !!user.is_admin,
    firebase_uid: (typeof firebasePayload !== 'undefined' && firebasePayload) ? firebasePayload.sub : null,
    iat: iatOtp,
    exp: iatOtp + 30 * 86400  // 30 jours
  }, env.JWT_SIGN_KEY);

  await auditLog(env, user.id, 'login', 'user', user.id, { method: 'sms-otp' }, phoneHash, request.headers.get('User-Agent'));
  await captureConnection(env, request, user);

  return json({ ok: true, token: jwt, user: {
    id: user.id, pseudo: user.pseudo, is_admin: !!user.is_admin
  }});
}

// POST /api/test/login — login de test SÛR pour l'E2E (v1.1.198).
// Mint un JWT UNIQUEMENT pour 2 numéros de test fixes ET seulement si le header
// X-Test-Auth == APEX_CHAT_ADMIN_TOKEN (secret connu de la seule CI). Ce N'EST
// PAS un backdoor universel (≠ OTP 000000) : 2 comptes jetables, verrouillés par
// le secret admin. Désactivable via ALLOW_E2E_TEST_LOGIN='false'.
const E2E_TEST_PHONES = ['+33600000091', '+33600000092'];
export async function handleTestLogin(request, env) {
  // .trim() des 2 côtés : le secret GitHub peut traîner un retour-ligne (préservé
  // par `printf '%s'` côté wrangler). Sans ça, comparaison "TOKEN" vs "TOKEN\n" → 403.
  const secret = (env.APEX_CHAT_ADMIN_TOKEN || '').trim();
  const hdr = (request.headers.get('X-Test-Auth') || '').trim();
  if (env.ALLOW_E2E_TEST_LOGIN === 'false') return err('E2E login désactivé', 403, 'disabled');
  if (!secret || hdr !== secret) return err('Réservé tests CI', 403, 'forbidden');
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const cleanPhone = normPhone(body.phone || '');
  if (!E2E_TEST_PHONES.includes(cleanPhone)) return err('Numéro de test non autorisé', 400, 'not_test_phone');
  const phoneHash = await sha256(cleanPhone);
  let user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE phone=?').bind(cleanPhone).first();
  if (!user) {
    const base = String(body.pseudo || 'e2e_' + cleanPhone.slice(-4)).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 18) || ('e2e' + cleanPhone.slice(-4));
    const insert = async (id, pseudo) => env.APEX_CHAT_DB.prepare(
      `INSERT INTO users (id, pseudo, real_name, phone, phone_hash, identity_key_pub, pq_key_pub, prekey_signed,
         source, admin_authorized, created_at, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING_PQXDH', 'PENDING_PQXDH', 'PENDING_PQXDH', 'e2e-test', 1, ?, 'active')
       ON CONFLICT(pseudo) DO NOTHING`
    ).bind(id, pseudo, body.name || pseudo, cleanPhone, phoneHash, Date.now()).run();
    await insert(crypto.randomUUID(), base);
    user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE phone=?').bind(cleanPhone).first();
    if (!user) {
      const alt = base.slice(0, 12) + '_' + Date.now().toString(36).slice(-4);
      await insert(crypto.randomUUID(), alt);
      user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE phone=?').bind(cleanPhone).first();
    }
  }
  if (!user) return err('Création compte test échouée', 500, 'create_fail');
  const jwt = await signJWT({
    sub: user.id, pseudo: user.pseudo, is_admin: !!user.is_admin,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400,
  }, env.JWT_SIGN_KEY);
  return json({ ok: true, token: jwt, user: { id: user.id, pseudo: user.pseudo, is_admin: !!user.is_admin } });
}

// POST /api/test/cleanup — v1.1.201. Efface DÉFINITIVEMENT les comptes de test
// E2E (Alice/Bob = source 'e2e-test' sur les numéros fixes) + leurs traces.
// Même verrou que /api/test/login (X-Test-Auth == APEX_CHAT_ADMIN_TOKEN).
export async function handleTestCleanup(request, env) {
  const secret = (env.APEX_CHAT_ADMIN_TOKEN || '').trim();
  const hdr = (request.headers.get('X-Test-Auth') || '').trim();
  if (!secret || hdr !== secret) return err('Réservé tests CI', 403, 'forbidden');
  const DB = env.APEX_CHAT_DB;
  const removed = [];
  try {
    const rows = (await DB.prepare(
      "SELECT id FROM users WHERE source='e2e-test' OR phone IN ('+33600000091','+33600000092') OR phone LIKE 'deleted_%e2e%'"
    ).all()).results || [];
    for (const r of rows) {
      const id = r.id;
      // messages + memberships + alias + le compte
      const convs = (await DB.prepare('SELECT conv_id FROM conversation_members WHERE user_id=?').bind(id).all()).results || [];
      await DB.prepare('DELETE FROM messages WHERE sender_id=?').bind(id).run().catch(() => {});
      await DB.prepare('DELETE FROM conversation_members WHERE user_id=?').bind(id).run().catch(() => {});
      await DB.prepare('DELETE FROM contacts WHERE user_id=? OR contact_id=?').bind(id, id).run().catch(() => {});
      await DB.prepare('DELETE FROM users WHERE id=?').bind(id).run().catch(() => {});
      // purge les conversations devenues vides
      for (const c of convs) {
        const cnt = await DB.prepare('SELECT COUNT(*) AS n FROM conversation_members WHERE conv_id=?').bind(c.conv_id).first().catch(() => ({ n: 1 }));
        if ((cnt?.n || 0) === 0) {
          await DB.prepare('DELETE FROM messages WHERE conv_id=?').bind(c.conv_id).run().catch(() => {});
          await DB.prepare('DELETE FROM conversations WHERE id=?').bind(c.conv_id).run().catch(() => {});
        }
      }
      removed.push(id);
    }
  } catch (e) {
    return err('Échec cleanup', 500, 'cleanup_failed', { detail: String(e?.message || '') });
  }
  return json({ ok: true, removed_count: removed.length, removed });
}

export async function handleSsoFromApex(request, env) {
  // P0 FIX (audit) : SSO avec vérification réelle JWT Apex
  // Kevin doit signer avec APEX_SSO_SIGN_KEY (HMAC HS256 partagée Apex ↔ Apex Chat)
  const { apex_token, apex_uid, name, phone } = await readJson(request);
  if (!apex_token || !apex_uid) return err('Token Apex manquant', 400);

  // Vérification HMAC HS256 du token Apex
  if (!env.APEX_SSO_SIGN_KEY) return err('SSO non configuré (env)', 500);
  const apexPayload = await verifyJWT(apex_token, env.APEX_SSO_SIGN_KEY);
  if (!apexPayload) return err('Token Apex invalide', 401, 'invalid_apex_token');

  // Le sub du token DOIT correspondre à apex_uid
  if (apexPayload.sub !== apex_uid) return err('apex_uid mismatch', 401, 'uid_mismatch');

  // Token court TTL (5 min max pour SSO).
  // Lot 2 (Q) : exp et iat étaient OPTIONNELS — un jeton sans exp valait à vie.
  // Les deux sont désormais exigés, et la durée de vie exp-iat ne dépasse pas 300 s.
  const nowS = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(apexPayload.exp) || !Number.isFinite(apexPayload.iat)) {
    return err('Token Apex sans exp/iat', 401, 'apex_token_no_exp');
  }
  if (apexPayload.exp - apexPayload.iat > 300 || apexPayload.exp <= apexPayload.iat) {
    return err('Token Apex trop long (max 5 min)', 401, 'apex_token_ttl');
  }
  if (apexPayload.exp * 1000 < Date.now()) return err('Token Apex expiré', 401);
  if (apexPayload.iat > nowS + 60) return err('Token Apex futur', 401);

  // Revue 08.10.2026 (F1) : un compte SUPPRIMÉ (RGPD) ne se retrouve ni ne se
  // ressuscite jamais par SSO — sinon jeton émis sur une ligne 'deleted' que
  // getAuthUser refuse → 401 permanent.
  let user = await env.APEX_CHAT_DB.prepare("SELECT * FROM users WHERE apex_uid=? AND status != 'deleted'").bind(apex_uid).first();
  if (!user) {
    // P0 FIX : isKevin via phone E.164 secret env (jamais via name string)
    const KEVIN_PHONE = env.KEVIN_PHONE_E164 || '';
    const isKevin = (apexPayload.is_admin === true) && KEVIN_PHONE &&
                    (apexPayload.phone === KEVIN_PHONE || phone === KEVIN_PHONE);

    const pseudo = String(name || apex_uid).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'user' + Date.now().toString(36).slice(-6);
    const id = await _freshSsoId(env, apex_uid);
    // apex_uid est UNIQUE : une ligne supprimée AVANT ce correctif peut encore le tenir.
    try { await env.APEX_CHAT_DB.prepare("UPDATE users SET apex_uid=NULL WHERE apex_uid=? AND status='deleted'").bind(apex_uid).run(); } catch (_) {}

    try {
      await env.APEX_CHAT_DB.prepare(
        `INSERT INTO users (id, pseudo, real_name, phone, phone_hash, is_admin, is_kevin_alias,
         identity_key_pub, pq_key_pub, prekey_signed, apex_uid, source, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_PQXDH', 'PENDING_PQXDH', 'PENDING_PQXDH', ?, 'apex-sso', ?, 'active')
         ON CONFLICT(id) DO UPDATE SET apex_uid=excluded.apex_uid WHERE users.status != 'deleted'`
      ).bind(id, pseudo, name || pseudo, phone || 'PENDING_SSO',
        phone ? await sha256(phone) : 'PENDING_SSO',
        isKevin ? 1 : 0, isKevin ? 1 : 0, apex_uid, Date.now()).run();
      user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
    } catch (e) {
      return err('Création SSO échouée : ' + e.message, 500);
    }
  }
  if (!user || user.status === 'deleted') return err('Compte SSO indisponible', 500, 'sso_user_missing');

  const iatSso = await _claimInvitedAccount(env, user);
  const jwt = await signJWT({
    sub: user.id,
    pseudo: user.pseudo,
    is_admin: !!user.is_admin,
    apex_uid: user.apex_uid,
    sso: true,
    iat: iatSso,
    exp: iatSso + 30 * 86400
  }, env.JWT_SIGN_KEY);

  await auditLog(env, user.id, 'login_sso_apex', 'user', user.id, { apex_uid }, '', request.headers.get('User-Agent'));
  await captureConnection(env, request, user);

  return json({ ok: true, token: jwt, user });
}

// ============================================================================
//  SSO depuis le compte unique kd-mc.com (connexion auto via Face ID)
// ============================================================================
// Le worker NE FAIT JAMAIS confiance au frontend pour « verified ». Il appelle
// lui-même https://kd-mc.com/__sso/whoami (source de vérité = le domaine), et
// n'accepte la session QUE si la réponse a verified === true (Face ID prouvé par
// passkey ES256). Une identité juste auto-déclarée (verified:false) → REFUS.
export async function handleSsoFromKdmc(request, env) {
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  const authHeader = request.headers.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const kdmcToken = String(body.kdmc_token || bearer || '').trim();
  if (!kdmcToken) return err('Token kd-mc.com manquant', 400, 'kdmc_token_manquant');

  // Vérification CÔTÉ SERVEUR auprès du domaine source de vérité.
  let who = null;
  try {
    const fetchOpts = {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + kdmcToken },
      cf: { cacheTtl: 0 },
    };
    // Timeout 8s — best-effort (AbortSignal.timeout absent de certains runtimes).
    try { if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) fetchOpts.signal = AbortSignal.timeout(8000); } catch (_) { /* sans timeout */ }
    const r = await fetch('https://kd-mc.com/__sso/whoami', fetchOpts);
    who = r.ok ? await r.json().catch(() => null) : null;
  } catch (e) {
    return err('Session kd-mc.com injoignable', 401, 'kdmc_session_invalide', { detail: String(e?.message || '') });
  }

  if (!who || who.ok !== true) return err('Session kd-mc.com invalide', 401, 'kdmc_session_invalide');
  // SÉCURITÉ : on ne connecte JAMAIS sans preuve Face ID (passkey ES256).
  if (who.verified !== true) return err('Face ID requis', 401, 'face_id_requis');

  const uid = String(who.uid || '').trim();
  if (!uid) return err('uid kd-mc.com manquant', 401, 'kdmc_uid_manquant');
  const name = String(who.name || uid).trim();
  const isAdmin = who.admin === true;

  // D1 ne supporte pas ADD COLUMN IF NOT EXISTS → try/catch (ignore duplicate).
  try {
    await env.APEX_CHAT_DB.prepare('ALTER TABLE users ADD COLUMN kdmc_uid TEXT').run();
  } catch (_) { /* colonne déjà présente */ }

  // Revue 08.10.2026 (F1) : une ligne SUPPRIMÉE (RGPD) n'est ni retrouvée ni
  // ressuscitée par l'upsert — on repart sur un compte neuf (id libre).
  let user = await env.APEX_CHAT_DB.prepare("SELECT * FROM users WHERE kdmc_uid=? AND status != 'deleted'").bind(uid).first();
  if (!user) {
    const id = await _freshSsoId(env, 'kdmc_' + uid);
    const basePseudo = name.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20)
      || ('user' + Date.now().toString(36).slice(-6));
    // Lot 2 (X) : pseudo UNIQUE — un homonyme déjà inscrit faisait échouer
    // l'INSERT À CHAQUE connexion (500 permanent). On ajoute un suffixe et on retente.
    const insertWith = (pseudo) => env.APEX_CHAT_DB.prepare(
      `INSERT INTO users (id, pseudo, real_name, phone, phone_hash, is_admin, is_kevin_alias,
       identity_key_pub, pq_key_pub, prekey_signed, apex_uid, source, created_at, status, kdmc_uid)
       VALUES (?, ?, ?, 'PENDING_SSO', 'PENDING_SSO', ?, ?, 'PENDING_PQXDH', 'PENDING_PQXDH', 'PENDING_PQXDH', ?, 'kdmc-sso', ?, 'active', ?)
       ON CONFLICT(id) DO UPDATE SET kdmc_uid=excluded.kdmc_uid WHERE users.status != 'deleted'`
    ).bind(id, pseudo, name, isAdmin ? 1 : 0, isAdmin ? 1 : 0, id, Date.now(), uid).run();
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const pseudo = attempt === 0 ? basePseudo
        : basePseudo.slice(0, 13) + '_' + _randomCode(6, 'abcdefghijkmnpqrstuvwxyz23456789');
      try {
        await insertWith(pseudo);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (!/UNIQUE/i.test(String(e && e.message)) || !/pseudo/i.test(String(e && e.message))) break;
      }
    }
    if (lastErr) {
      return err('Création SSO kd-mc.com échouée : ' + lastErr.message, 500, 'kdmc_create_failed');
    }
    user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
  }
  if (!user || user.status === 'deleted') return err('User kd-mc.com introuvable après création', 500, 'kdmc_user_missing');

  const iatKdmc = await _claimInvitedAccount(env, user);
  const jwt = await signJWT({
    sub: user.id,
    pseudo: user.pseudo,
    is_admin: !!user.is_admin,
    kdmc_uid: uid,
    sso: true,
    iat: iatKdmc,
    exp: iatKdmc + 30 * 86400,
  }, env.JWT_SIGN_KEY);

  await auditLog(env, user.id, 'login_sso_kdmc', 'user', user.id, { kdmc_uid: uid }, '', request.headers.get('User-Agent'));
  await captureConnection(env, request, user);

  return json({ ok: true, token: jwt, user });
}

// ============================================================================
//  Routes Users
// ============================================================================

async function handleGetMe(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401, 'unauthorized');

  const user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE id=?').bind(auth.sub).first();
  if (!user) return err('User introuvable', 404);
  delete user.real_name;  // sauf si admin
  return json({ ok: true, user });
}

// ----------------------------------------------------------------------------
//  RGPD (audit 17/09/2026, P0 commercial) — export serveur + suppression de compte
//  Avant : l'export ne couvrait que le téléphone (JSON local) et AUCUNE route ne
//  permettait à un utilisateur de supprimer son compte (le lien des CGU pointait dans
//  le vide). Art. 15/17/20 RGPD.
// ----------------------------------------------------------------------------
const RGPD_USER_PUBLIC_COLS = ['id', 'pseudo', 'real_name', 'display_name', 'first_name', 'last_name', 'phone', 'email',
  'bio', 'avatar_url', 'created_at', 'last_seen', 'premium_until', 'premium_plan', 'language', 'timezone', 'address',
  'city', 'country', 'job', 'birth_date', 'status', 'source', 'invited_by', 'last_geo_label', 'last_device_label'];

export async function handleExportMe(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401, 'unauthorized');
  const DB = env.APEX_CHAT_DB;
  const uid = auth.sub;
  const out = { exported_at: Date.now(), user_id: uid, note: 'Messages : contenu chiffré tel que stocké (le serveur ne détient pas la clé quand le chiffrement de bout en bout est actif).' };
  const q = async (sql, ...args) => { try { return (await DB.prepare(sql).bind(...args).all()).results || []; } catch (e) { return { error: e && e.message }; } };
  try {
    const u = await DB.prepare('SELECT * FROM users WHERE id=?').bind(uid).first();
    if (!u) return err('Compte introuvable', 404, 'user_not_found');
    out.profile = {}; for (const k of RGPD_USER_PUBLIC_COLS) if (u[k] !== undefined) out.profile[k] = u[k];
    out.conversations = await q('SELECT c.id, c.type, c.name, c.created_at, m.role, m.joined_at FROM conversation_members m JOIN conversations c ON c.id = m.conv_id WHERE m.user_id=?', uid);
    out.messages_sent = await q('SELECT id, conv_id, ciphertext, mime, ts, edited_at, deleted_at FROM messages WHERE sender_id=? ORDER BY ts LIMIT 100000', uid);
    out.contacts = await q('SELECT contact_id, nickname, mutual_at, blocked_at, created_at FROM contacts WHERE user_id=?', uid);
    out.invitations_sent = await q('SELECT code, sent_via, accepted_at, created_at, expires_at FROM invitations WHERE inviter_id=?', uid);
    out.media = await q('SELECT id, mime, size, uploaded_at, expires_at FROM media WHERE owner_id=?', uid);
    out.push_devices = await q('SELECT device_id, device_name, user_agent, created_at, last_seen FROM push_subscriptions WHERE user_id=?', uid);
    out.connections = await q('SELECT device, os, browser, country, city, first_seen, last_seen FROM connections WHERE user_id=?', uid);
    out.cgu_acceptances = await q('SELECT version, accepted_at, implicit FROM cgu_acceptances WHERE user_id=?', uid);
    out.reports_made = await q('SELECT id, target_user_id, reason, ts, status FROM signalements WHERE reporter_id=?', uid);
  } catch (e) { return err('Export impossible pour le moment', 500, 'export_failed', e); }
  try { await auditLog(env, uid, 'rgpd_export', 'user', uid, {}, null, request.headers.get('user-agent') || ''); } catch (_) {}
  return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="apex-chat-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"` } });
}

export async function handleDeleteMe(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401, 'unauthorized');
  const uid = auth.sub;
  if (uid === 'kdmc_admin' || auth.is_admin) return err('Un compte administrateur ne se supprime pas par cette voie', 403, 'admin_protected');
  const body = await readJson(request).catch(() => ({}));
  if (String(body.confirm || '').trim().toUpperCase() !== 'SUPPRIMER') {
    return err('Écris SUPPRIMER pour confirmer', 400, 'confirm_required');
  }
  const DB = env.APEX_CHAT_DB;
  const now = Date.now();
  const done = { media: 0, rows: {} };
  const run = async (label, sql, ...args) => { try { const r = await DB.prepare(sql).bind(...args).run(); done.rows[label] = (r && r.meta && r.meta.changes) || 0; } catch (e) { done.rows[label] = 'erreur: ' + (e && e.message); } };
  try {
    // 1) Médias R2 (fichiers) puis lignes
    try {
      const media = (await DB.prepare('SELECT r2_key, thumbnail_r2_key FROM media WHERE owner_id=?').bind(uid).all()).results || [];
      for (const m of media) {
        for (const k of [m.r2_key, m.thumbnail_r2_key]) if (k && env.APEX_CHAT_MEDIA) { try { await env.APEX_CHAT_MEDIA.delete(k); done.media++; } catch (_) {} }
      }
    } catch (_) {}
    await run('media', 'DELETE FROM media WHERE owner_id=?', uid);
    // 2) Messages envoyés : contenu effacé (tombstone : les autres voient « message supprimé »)
    // Revue 08.10.2026 : ciphertext est NOT NULL → contenu remplacé par '' (NULL était refusé, rien n'était effacé).
    await run('messages', "UPDATE messages SET ciphertext='', deleted_at=? WHERE sender_id=? AND deleted_at IS NULL", now, uid);
    // 3) Liens et appareils
    await run('conversation_members', 'DELETE FROM conversation_members WHERE user_id=?', uid);
    await run('contacts', 'DELETE FROM contacts WHERE user_id=? OR contact_id=?', uid, uid);
    await run('push_subscriptions', 'DELETE FROM push_subscriptions WHERE user_id=?', uid);
    await run('connections', 'DELETE FROM connections WHERE user_id=?', uid);
    await run('user_activity', 'DELETE FROM user_activity WHERE user_id=?', uid);
    await run('invitations', 'DELETE FROM invitations WHERE inviter_id=? AND accepted_at IS NULL', uid);
    // 4) Compte : anonymisé (l'id reste pour l'intégrité des références), numéro libéré
    // Revue 08.10.2026 : phone, phone_hash, real_name et les clés sont NOT NULL (0001_init.sql) —
    // les mettre à NULL faisait ÉCHOUER toute la ligne en silence (rien d'anonymisé, compte
    // toujours actif). Valeurs neutres à la place ; pseudo unique bâti sur l'id COMPLET.
    await run('users', `UPDATE users SET status='deleted', phone=?, phone_hash=?, email=NULL, real_name='', display_name=NULL,
      first_name=NULL, last_name=NULL, bio=NULL, avatar_url=NULL, address=NULL, city=NULL, country=NULL, job=NULL, birth_date=NULL,
      last_ip_hash=NULL, last_user_agent=NULL, last_lat=NULL, last_lng=NULL, last_geo_label=NULL, last_device_label=NULL,
      identity_key_pub='', prekey_signed='', pseudo=?, apex_uid=NULL, last_force_logout_at=?, updated_at=? WHERE id=?`,
      'deleted_' + uid, 'deleted_' + uid, 'supprime_' + uid, now, now, uid);
    // Revue 08.10.2026 (F1) : les liens SSO (apex_uid ci-dessus, kdmc_uid ici) sont
    // coupés — sinon la prochaine connexion SSO retrouvait la ligne supprimée,
    // émettait un jeton que getAuthUser refusait → 401 permanent.
    // kdmc_uid est créée à la volée (1re connexion domaine) : à part, jamais bloquant.
    await run('users_kdmc_uid', 'UPDATE users SET kdmc_uid=NULL WHERE id=?', uid);
    if (done.rows.users !== 1) {
      // Le compte n'a PAS été anonymisé : ne jamais répondre « supprimé ».
      try { await auditLog(env, uid, 'rgpd_delete_failed', 'user', uid, done, null, request.headers.get('user-agent') || ''); } catch (_) {}
      return err('Suppression incomplète, réessaie ou contacte l\'assistance', 500, 'delete_failed', { details: done });
    }
    // 5) KV : quotas / demandes premium
    try { if (env.APEX_CHAT_KV) { const l = await env.APEX_CHAT_KV.list({ prefix: 'quota:' + uid }); for (const k of (l.keys || [])) await env.APEX_CHAT_KV.delete(k.name); } } catch (_) {}
  } catch (e) { return err('Suppression incomplète, réessaie ou contacte l\'assistance', 500, 'delete_failed', e); }
  try { await auditLog(env, uid, 'rgpd_delete_account', 'user', uid, done, null, request.headers.get('user-agent') || ''); } catch (_) {}
  return json({ ok: true, deleted: true, details: done });
}

// Acceptation CGU (RGPD trace immutable)
async function handleCguAccept(request, env) {
  const body = await request.json().catch(() => ({}));
  const ipHash = await sha256(request.headers.get('CF-Connecting-IP') || 'unknown');
  const ua = (request.headers.get('user-agent') || '').slice(0, 240);
  const phone = String(body.phone || '').replace(/[^\d+]/g, '');
  const phoneHash = phone ? await sha256(phone) : null;
  const auth = await getAuthUser(request, env);
  await env.APEX_CHAT_DB.prepare(
    `INSERT INTO cgu_acceptances (user_id, phone_hash, version, accepted_at, implicit, user_agent, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(auth?.sub || null, phoneHash, String(body.version || 'v1.1.2'), Date.now(),
         body.implicit === false ? 0 : 1, ua, ipHash).run().catch(() => {});
  return json({ ok: true });
}

// Heartbeat user — last_seen + geoloc/device si consenti par toggle
async function handleUserHeartbeat(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401, 'unauthorized');

  const body = await request.json().catch(() => ({}));
  const ipHash = await sha256(request.headers.get('CF-Connecting-IP') || 'unknown');
  const ua = (request.headers.get('user-agent') || '').slice(0, 240);
  const cfCountry = request.headers.get('cf-ipcountry') || null;
  const cfCity = request.headers.get('cf-ipcity') || null;
  const cfRegion = request.headers.get('cf-region') || null;

  // Device label simple
  let deviceLabel = '';
  if (/iPhone|iPad|iPod/i.test(ua)) deviceLabel = 'iOS';
  else if (/Android/i.test(ua)) deviceLabel = 'Android';
  else if (/Macintosh/i.test(ua)) deviceLabel = 'Mac';
  else if (/Windows/i.test(ua)) deviceLabel = 'Windows';
  else if (/Linux/i.test(ua)) deviceLabel = 'Linux';

  // Geoloc client (si fournie) — sinon Cloudflare CF-IPCity headers
  const lat = typeof body.lat === 'number' ? body.lat : null;
  const lng = typeof body.lng === 'number' ? body.lng : null;
  let geoLabel = null;
  if (lat !== null && lng !== null) {
    geoLabel = (cfCity ? cfCity + ', ' : '') + (cfCountry || '');
  } else if (cfCity || cfCountry) {
    geoLabel = (cfCity ? cfCity + ', ' : '') + (cfCountry || '');
  }

  await env.APEX_CHAT_DB.prepare(
    `UPDATE users SET last_seen=?, last_ip_hash=?, last_user_agent=?, last_device_label=?,
                       last_lat=COALESCE(?, last_lat), last_lng=COALESCE(?, last_lng),
                       last_geo_label=COALESCE(?, last_geo_label), updated_at=?
     WHERE id=?`
  ).bind(Date.now(), ipHash, ua, deviceLabel, lat, lng, geoLabel, Date.now(), auth.sub).run().catch(() => {});

  // Activity log (TTL 30j via cleanup futur)
  await env.APEX_CHAT_DB.prepare(
    `INSERT INTO user_activity (user_id, ts, ip_hash, user_agent, lat, lng, geo_label, action)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'heartbeat')`
  ).bind(auth.sub, Date.now(), ipHash, ua, lat, lng, geoLabel).run().catch(() => {});

  return json({ ok: true });
}

// Pseudo : même règle que l'inscription (handleVerifyOtp).
const PSEUDO_RE = /^[a-zA-Z0-9_-]{3,20}$/;
const AVATAR_MAX = 200 * 1024;
// Lot 2 (S) : avatar_url modifiable par PATCH passait SANS la validation de
// POST /api/users/me/avatar (n'importe quelle URL / javascript: / texte) et était
// tronqué à 500 caractères (une vraie image data: devenait illisible).
// Même règle partout : vide (= effacer) ou data:image/… ≤ 200 Ko.
function _checkAvatarUrl(v) {
  if (v === undefined) return { value: undefined };
  if (v === null || v === '') return { value: null };
  if (typeof v !== 'string' || !v.startsWith('data:image/')) {
    return { error: err('avatar_url doit être une image base64 (data:image/...)', 400, 'bad_data_url') };
  }
  if (v.length > AVATAR_MAX) {
    return { error: err('Avatar trop lourd (max 200KB)', 413, 'avatar_too_large', { size: v.length, max: AVATAR_MAX }) };
  }
  return { value: v };
}

// PATCH /api/users/me — update profil safe (avatar, bio, language, timezone, display_name)
export async function handleUpdateMe(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const body = await request.json().catch(() => ({}));
  // v1.1.163 — Kevin "À l'inscription tout doit etre rempli" + "Pseudo choisi
  // par l'utilisateur dans sa fiche infos". Élargi à tous les champs profil.
  const ALLOWED = [
    'avatar_url', 'bio', 'display_name', 'language', 'timezone', 'email',
    'pseudo', 'real_name', 'first_name', 'last_name',
    'address', 'city', 'country', 'job', 'birth_date',
  ];
  const updates = [];
  const args = [];
  // Validation pseudo : 3-20 chars, alphanum + underscore + tiret (Lot 2 (S) :
  // même règle qu'à l'inscription — un pseudo « jean-paul » choisi au signup
  // ne pouvait plus être ré-enregistré depuis la fiche).
  if (body.pseudo !== undefined) {
    const p = String(body.pseudo).trim();
    if (!PSEUDO_RE.test(p)) {
      return err('Pseudo invalide (3-20 caractères, lettres/chiffres/_/-)', 400, 'pseudo_invalid', {
        received: body.pseudo, hint: 'ex: marie_d, jean-paul, kevin42'
      });
    }
  }
  const av = _checkAvatarUrl(body.avatar_url);
  if (av.error) return av.error;
  for (const k of ALLOWED) {
    if (body[k] !== undefined) {
      if (k === 'avatar_url') { updates.push('avatar_url=?'); args.push(av.value); continue; }
      const v = String(body[k] || '').slice(0, 500);
      updates.push(`${k}=?`);
      args.push(v);
    }
  }
  if (updates.length === 0) return err('Aucun champ à mettre à jour');
  updates.push('updated_at=?');
  args.push(Date.now());
  args.push(auth.sub);

  try {
    await env.APEX_CHAT_DB.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id=?`
    ).bind(...args).run();
  } catch (e) {
    // Constraint UNIQUE sur pseudo → message clair
    const msg = String(e?.message || '');
    if (/UNIQUE.*pseudo/i.test(msg) || /pseudo.*UNIQUE/i.test(msg)) {
      return err('Ce pseudo est déjà pris — choisis-en un autre', 409, 'pseudo_taken', {
        pseudo: body.pseudo, detail: msg,
      });
    }
    return err('Échec mise à jour profil', 500, 'update_failed', {
      detail: msg, fields: Object.keys(body),
    });
  }

  await auditLog(env, auth.sub, 'profile_update', 'user', auth.sub,
    { fields: Object.keys(body) }, null, request.headers.get('user-agent') || '');

  const user = await env.APEX_CHAT_DB.prepare('SELECT * FROM users WHERE id=?').bind(auth.sub).first();
  return json({ ok: true, user });
}

async function handleGetPublicUser(pseudoOrId, env, request) {
  // v1.1.164 — accepte id OU pseudo (frontend résout les peers via leur id).
  // Retourne real_name + display_name + first_name + last_name + avatar_url
  // pour K._displayName + K._getAvatar côté frontend.
  // Audit 17/09/2026 (P2) : cette route répondait SANS jeton → l'état civil (nom, prénom,
  // bio) de tout inscrit se lisait par son pseudo, sans être connecté. Le client envoie
  // toujours son jeton (index.html, _fetchPeerProfile) : on l'exige.
  if (request) {
    const auth = await getAuthUser(request, env);
    if (!auth) return err('Non authentifié', 401);
  }
  const user = await env.APEX_CHAT_DB.prepare(
    `SELECT id, pseudo, real_name, display_name, first_name, last_name,
            avatar_url, bio, last_seen
     FROM users
     WHERE (id=? OR pseudo=? COLLATE NOCASE) AND status=?`
  ).bind(pseudoOrId, pseudoOrId, 'active').first();
  if (!user) return err('User introuvable', 404, 'user_not_found', { lookup: pseudoOrId });
  return json({ ok: true, user });
}

// v1.1.164 — POST /api/users/me/avatar : sync avatar entre clients.
// Kevin "Ne s'affiche pas chez Laurence non plus". On stocke direct la
// dataURL JPEG (~50KB après compression v1.1.160) en colonne avatar_url
// → handleGetPublicUser le renvoie aux peers → K._getAvatar les cache.
async function handleUploadMyAvatar(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  let body = {};
  try { body = await request.json(); } catch (e) {
    return err('JSON body invalide', 400, 'bad_json', { detail: e?.message });
  }
  const dataUrl = body.data_url || '';
  if (typeof dataUrl !== 'string') return err('data_url doit être une chaîne', 400, 'bad_data_url');
  if (dataUrl && !dataUrl.startsWith('data:image/')) {
    return err('data_url doit être une image base64 (data:image/...)', 400, 'bad_data_url');
  }
  // Limite 200KB après base64 (≈ 150KB binaire, déjà compressé canvas 512px)
  if (dataUrl.length > 200 * 1024) {
    return err('Avatar trop lourd (max 200KB)', 413, 'avatar_too_large', {
      size: dataUrl.length, max: 200 * 1024,
    });
  }
  try {
    await env.APEX_CHAT_DB.prepare(
      'UPDATE users SET avatar_url=?, updated_at=? WHERE id=?'
    ).bind(dataUrl || null, Date.now(), auth.sub).run();
    return json({ ok: true, avatar_url: dataUrl || null });
  } catch (e) {
    return err('Échec sauvegarde avatar', 500, 'db_write_failed', {
      detail: e?.message, where: (e?.stack || '').split('\n')[1] || '',
    });
  }
}

// Fonctions pilotables (interrupteurs admin globaux + catalogue de l'app, K.FEATURE_CATALOG).
const ADMIN_FEATURE_KEYS = [
  'voice_messages', 'video_calls', 'time_capsule', 'letters_24h', 'memory_lane',
  'stories', 'polls', 'reactions', 'mini_apps', 'e2e_strict', 'kevin_invisible',
  'track_geoloc', 'track_devices', 'admin_audit_log', 'auto_invitations',
  'magic_links', 'sms_otp', 'sso_apex', 'payment_qr', 'push_notifications',
  'signalements', 'ia_chat'
];
const USER_TOGGLE_FEATURES = new Set([
  ...ADMIN_FEATURE_KEYS,
  'ai_assistant', 'anti_scam', 'audio_calls', 'auto_translate', 'file_sharing',
  'location_sharing', 'push_notifs',
]);

// v1.1.169 — POST /api/admin/user-toggles
// Per-user feature toggle. Frontend (K._userToggleCycle) appelait cet
// endpoint depuis v1.1.152 mais il n'existait pas → .catch(()=>{}) masquait
// silencieusement → toggles per-user JAMAIS persistés serveur.
// Schéma : table system_config(key,value) → key="user_toggle:{uid}:{feature}"
async function handleAdminSetUserToggle(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  // Admin OR user soi-même (chacun peut changer ses propres toggles)
  let body = {};
  try { body = await request.json(); } catch (e) {
    return err('JSON body invalide', 400, 'bad_json', { detail: e?.message });
  }
  const targetUid = String(body.uid || auth.sub).slice(0, 64);
  const feature = String(body.feature || '').slice(0, 64);
  const value = body.value;
  if (!feature) return err('feature requis', 400, 'feature_missing');
  // Lot 2 (T) : n'importe quel nom de fonction était écrit dans system_config
  // (table des réglages GLOBAUX) — liste blanche des fonctions réelles.
  if (!USER_TOGGLE_FEATURES.has(feature)) {
    return err('Fonction inconnue', 400, 'feature_unknown', { feature });
  }
  if (targetUid !== auth.sub) {
    // Modifie un autre user → admin obligatoire
    const u = await env.APEX_CHAT_DB.prepare('SELECT is_admin FROM users WHERE id=?').bind(auth.sub).first();
    if (!u || !u.is_admin) return err('Admin requis pour modifier un autre user', 403, 'forbidden_other');
  }
  try {
    const key = `user_toggle:${targetUid}:${feature}`;
    // v1.1.172 FIX P0 : system_config.updated_at est NOT NULL → l'INSERT
    // (key,value) seul violait la contrainte → toggles per-user jamais persistés.
    await env.APEX_CHAT_DB.prepare(
      'INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)'
    ).bind(key, JSON.stringify(value), Date.now(), auth.sub).run();
    return json({ ok: true, uid: targetUid, feature, value });
  } catch (e) {
    return err('Échec save toggle', 500, 'db_write_failed', {
      detail: e?.message, where: (e?.stack || '').split('\n')[1] || '',
    });
  }
}

async function handleAdminGetFullUser(pseudo, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  const user = await env.APEX_CHAT_DB.prepare(
    'SELECT * FROM users WHERE pseudo=? COLLATE NOCASE'
  ).bind(pseudo).first();
  if (!user) return err('User introuvable', 404);

  // Audit log obligatoire (qui a vu quoi)
  await auditLog(env, auth.sub, 'view_user_card_full', 'user', user.id, { pseudo },
    await sha256(request.headers.get('CF-Connecting-IP') || ''), request.headers.get('User-Agent'));

  return json({ ok: true, user });
}

// ============================================================================
//  Routes Conversations
// ============================================================================

async function handleListConversations(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // AUTO-RÉPARATION à l'ouverture de l'app (Kevin : « ça doit être auto, partout »).
  // Idempotent : une fois les doublons fusionnés (status='deleted'), la détection
  // les exclut → no-op. Best-effort, ne bloque jamais la liste. v1.1.179.
  // Audit 17/09/2026 (P1 perf) : ces 6 « soins » (≥ 18 requêtes D1, boucles N+1) tournaient
  // à CHAQUE appel — et chaque client appelle cette route toutes les 60 s. Ils restent
  // automatiques mais au plus une fois toutes les 10 minutes (verrou KV), sinon on sert la
  // liste directement. Sans KV (tests, panne) : comportement d'avant.
  // Lot 2 (W) : UN SEUL verrou global « heal:convlist » faisait que le premier
  // utilisateur de la fenêtre de 10 min était le seul soigné — les réparations
  // PROPRES à chaque compte (fusion de ses doublons, ses DM surpeuplés, rattrapage
  // admin) ne tournaient jamais pour les autres. Deux verrous désormais : un
  // global pour les purges communes, un par utilisateur pour ses soins à lui.
  const _due = async (key) => {
    try {
      if (!env.APEX_CHAT_KV) return true;
      if (await env.APEX_CHAT_KV.get(key)) return false;
      await env.APEX_CHAT_KV.put(key, String(Date.now()), { expirationTtl: 600 });
      return true;
    } catch (_) { return true; }
  };
  const userHealDue = await _due('heal:convlist:u:' + auth.sub);
  const globalHealDue = await _due('heal:convlist');
  if (userHealDue) try {
    // v1.1.195 — si c'est Kevin (admin) et que kdmc_admin n'a pas encore son VRAI
    // numéro (placeholder), on le lui donne MAINTENANT depuis sa session existante
    // (sans re-login) → résout les stubs local_+<numéro> dans la même requête.
    if ((auth.sub === 'kdmc_admin' || auth.is_admin) && env.KEVIN_PHONE_E164) {
      const adminRow = await env.APEX_CHAT_DB.prepare("SELECT phone FROM users WHERE id='kdmc_admin'").first();
      const want = normPhone(env.KEVIN_PHONE_E164);
      if (adminRow && normPhone(adminRow.phone || '') !== want) {
        await consolidateKevinIntoAdmin(env, want, await sha256(want), Date.now());
      }
    }
  } catch (e) { console.warn('[auto-heal-convlist/admin]', e?.message); }
  if (globalHealDue) try {
    await _healLocalConvMembers(env.APEX_CHAT_DB);   // v1.1.192 : local_+numéro → vrai compte
  } catch (e) { console.warn('[auto-heal-convlist/local]', e?.message); }
  if (userHealDue) try {
    const me = await env.APEX_CHAT_DB.prepare(
      'SELECT id, phone, real_name, pseudo FROM users WHERE id=?'
    ).bind(auth.sub).first();
    if (me) await autoHealPerson(env, me);
    await _healOverpopulatedDms(env, auth.sub);        // v1.1.215 : soigne les PAIRS des DM > 2 membres (doublons Laurence)
  } catch (e) { console.warn('[auto-heal-convlist/user]', e?.message); }
  if (globalHealDue) try {
    await cleanupEmptyConversations(env.APEX_CHAT_DB);  // v1.1.195 : purge convs vides/archivées
    await cleanupGhostMembers(env.APEX_CHAT_DB);        // v1.1.197 : retire membres supprimés/fusionnés
  } catch (e) { console.warn('[auto-heal-convlist/global]', e?.message); }

  // v1.1.172 FIX P0 (audit crew) : joindre la clé publique du pair (DM) pour
  // que le client puisse établir la session E2E. Sans ça, peer_pubkey restait
  // null → aucune session → fallback texte clair. La sous-requête prend l'AUTRE
  // membre (DM = 1 seul autre). Pour les groupes, le client n'utilise pas ce
  // champ (chiffrement de groupe géré séparément).
  // v1.1.197 — le « pair » (peer_id/peer_pubkey) doit EXCLURE les membres
  // supprimés/fusionnés (ex: vieux user_laurence resté membre) : sinon le client
  // affiche « (supprimé) » comme destinataire et la session E2E pointe sur un
  // compte mort. On joint users + filtre status/merged_into dans les 2 sous-req.
  const convs = await env.APEX_CHAT_DB.prepare(
    `SELECT c.*, cm.last_read_msg_id, cm.notif_level, cm.role,
       (SELECT u.identity_key_pub FROM conversation_members m2
          JOIN users u ON u.id = m2.user_id
          WHERE m2.conv_id = c.id AND m2.user_id != ?
            AND (u.status IS NULL OR u.status != 'deleted') AND u.merged_into IS NULL
          ORDER BY u.last_seen DESC LIMIT 1) AS peer_pubkey,
       (SELECT u.id FROM conversation_members m2
          JOIN users u ON u.id = m2.user_id
          WHERE m2.conv_id = c.id AND m2.user_id != ?
            AND (u.status IS NULL OR u.status != 'deleted') AND u.merged_into IS NULL
          ORDER BY u.last_seen DESC LIMIT 1) AS peer_id
     FROM conversations c
     INNER JOIN conversation_members cm ON cm.conv_id = c.id
     WHERE cm.user_id = ? AND c.archived_at IS NULL
     ORDER BY c.last_msg_ts DESC`
  ).bind(auth.sub, auth.sub, auth.sub).all();

  // Ne pas exposer le placeholder comme une vraie clé.
  const rows = (convs.results || []).map((c) => {
    if (c.peer_pubkey === 'PENDING_PQXDH' || c.peer_pubkey === 'PENDING') c.peer_pubkey = null;
    return c;
  });
  return json({ ok: true, conversations: rows });
}

// v1.1.172 FIX P0 (audit crew) — distribution des clés publiques E2E.
// Sans ces 2 routes, l'« E2E » était cosmétique : la pubkey n'était jamais
// publiée et aucun bundle n'était récupérable → repli texte clair en D1.

// POST /api/keys/prekeys — publie/maj la clé publique d'identité du user courant.
async function handleUploadPrekeys(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  const body = await request.json().catch(() => ({}));
  const idk = body.identity_key_pub;
  if (!idk || typeof idk !== 'string' || idk.length < 8 || idk.length > 4000 || idk.startsWith('PENDING')) {
    return err('identity_key_pub invalide', 400, 'bad_pubkey', { len: idk ? String(idk).length : 0 });
  }
  // Champs optionnels (placeholder PQXDH tant que Kyber n'est pas activé).
  const pq = (typeof body.pq_key_pub === 'string' && body.pq_key_pub.length <= 4000) ? body.pq_key_pub : null;
  // v1.1.299 : prekey_signed est réservé à PQXDH — une clé de signature de groupe (« GSIG1: ») n'y entre plus
  // (elle va dans signing_key_pub, ci-dessous) ; un vieux téléphone qui l'y enverrait est simplement ignoré.
  const signed = (typeof body.prekey_signed === 'string' && body.prekey_signed.length <= 4000 && !body.prekey_signed.startsWith('GSIG1:')) ? body.prekey_signed : null;
  try {
    await env.APEX_CHAT_DB.prepare(
      `UPDATE users SET identity_key_pub=?,
         pq_key_pub=COALESCE(?, pq_key_pub),
         prekey_signed=COALESCE(?, prekey_signed)
       WHERE id=?`
    ).bind(idk, pq, signed, auth.sub).run();
    // v1.1.261 — capacités crypto (best-effort : une colonne absente NE casse
    // JAMAIS la publication de clé). Le pair saura ainsi quel niveau on déchiffre.
    if (typeof body.crypto_caps === 'string' && body.crypto_caps.length <= 200 && /^[a-z0-9,]+$/.test(body.crypto_caps)) {
      try {
        await env.APEX_CHAT_DB.prepare('UPDATE users SET crypto_caps=? WHERE id=?')
          .bind(body.crypto_caps, auth.sub).run();
      } catch (_capErr) { /* colonne pas encore migrée → ignoré */ }
    }
    // v1.1.298 — clé publique de signature de groupe dans SA colonne (migration 0013). Format strict :
    // « GSIG1: » + base64, ≤ 300 caractères ; tout le reste est ignoré (jamais une valeur arbitraire stockée).
    if (typeof body.signing_key_pub === 'string' && body.signing_key_pub.length <= 300 && /^GSIG1:[A-Za-z0-9+/=_-]+$/.test(body.signing_key_pub)) {
      try {
        await env.APEX_CHAT_DB.prepare('UPDATE users SET signing_key_pub=? WHERE id=?')
          .bind(body.signing_key_pub, auth.sub).run();
      } catch (_sigErr) { /* colonne pas encore migrée → ignoré */ }
    }
    return json({ ok: true });
  } catch (e) {
    return err('Échec publication clé', 500, 'db_write_failed', {
      detail: e?.message, where: (e?.stack || '').split('\n')[1] || '',
    });
  }
}

// GET /api/keys/:userId/bundle — récupère la clé publique d'un pair (auth requise).
async function handleKeyBundle(userId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  const row = await env.APEX_CHAT_DB.prepare(
    'SELECT id, identity_key_pub, pq_key_pub, prekey_signed FROM users WHERE id=?'
  ).bind(userId).first();
  if (!row) return err('Utilisateur introuvable', 404, 'no_user');
  const idk = row.identity_key_pub;
  if (!idk || idk === 'PENDING_PQXDH' || idk === 'PENDING') {
    return err('Clé pas encore publiée par ce contact', 409, 'key_pending', { user_id: userId });
  }
  // v1.1.261 — capacités crypto du pair (best-effort : colonne absente → null).
  let caps = null;
  try {
    const c = await env.APEX_CHAT_DB.prepare('SELECT crypto_caps FROM users WHERE id=?').bind(userId).first();
    caps = (c && typeof c.crypto_caps === 'string') ? c.crypto_caps : null;
  } catch (_capErr) { caps = null; }
  // v1.1.298 — clé de signature de groupe (best-effort : colonne absente → null).
  let signingKey = null;
  try {
    const sk = await env.APEX_CHAT_DB.prepare('SELECT signing_key_pub FROM users WHERE id=?').bind(userId).first();
    signingKey = (sk && typeof sk.signing_key_pub === 'string' && sk.signing_key_pub.startsWith('GSIG1:')) ? sk.signing_key_pub : null;
  } catch (_sigErr) { signingKey = null; }
  return json({
    ok: true,
    bundle: {
      signing_key_pub: signingKey,
      user_id: row.id,
      identity_key_pub: idk,
      pq_key_pub: row.pq_key_pub && !String(row.pq_key_pub).startsWith('PENDING') ? row.pq_key_pub : null,
      prekey_signed: row.prekey_signed && !String(row.prekey_signed).startsWith('PENDING') ? row.prekey_signed : null,
      crypto_caps: caps,
    },
  });
}

// ============================================================================
//  GET /api/location/:userId — historique de localisation (trajet sur carte).
//  v1.1.187. Source : user_activity (lat/lng par heartbeat, déjà accumulés).
//  Non bloquant (ne gêne jamais l'usage). Accès : admin OU soi-même.
//  ?limit=N (défaut 300), ?since=ms (optionnel).
// ============================================================================
async function handleLocationHistory(userId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  // canonique (suit merged_into) pour viser le bon compte
  let target = userId;
  try { target = await _canonicalId(env.APEX_CHAT_DB, userId); } catch (_) {}
  if (!(auth.is_admin || auth.sub === target || auth.sub === userId)) {
    return err('Accès refusé', 403, 'forbidden');
  }
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '300', 10) || 300, 1000);
  const since = parseInt(url.searchParams.get('since') || '0', 10) || 0;
  const out = { ok: true, user_id: target, points: [] };
  try {
    const rows = (await env.APEX_CHAT_DB.prepare(
      `SELECT lat, lng, ts, geo_label FROM user_activity
       WHERE user_id=? AND lat IS NOT NULL AND lng IS NOT NULL AND ts > ?
       ORDER BY ts DESC LIMIT ?`
    ).bind(target, since, limit).all()).results || [];
    // ordre chronologique pour tracer le trajet + dédup des points quasi-identiques
    const asc = rows.reverse();
    let prev = null;
    for (const r of asc) {
      if (prev && Math.abs(r.lat - prev.lat) < 0.0002 && Math.abs(r.lng - prev.lng) < 0.0002 && (r.ts - prev.ts) < 60000) continue;
      out.points.push({ lat: r.lat, lng: r.lng, ts: r.ts, label: r.geo_label || null });
      prev = r;
    }
    out.count = out.points.length;
    const u = await env.APEX_CHAT_DB.prepare('SELECT last_lat, last_lng, last_geo_label, last_seen FROM users WHERE id=?').bind(target).first();
    if (u) out.last = { lat: u.last_lat, lng: u.last_lng, label: u.last_geo_label, ts: u.last_seen };
  } catch (e) {
    out.ok = false; out.error = e?.message || '?';
  }
  return json(out, 200);
}

// ============================================================================
//  Médias R2 — photos / vidéos / fichiers TOUS FORMATS, toutes tailles. v1.1.186
//  POST /api/media   : upload binaire (header x-file-name, content-type) → R2
//  GET  /api/media/:id : sert le fichier depuis R2 (auth via ?token=)
//  Avant : seules les images ≤5 Mo en base64. Maintenant : R2 (jusqu'à 100 Mo).
// ============================================================================
const MEDIA_MAX = 100 * 1024 * 1024;   // 100 Mo

export async function handleMediaUpload(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  if (!env.APEX_CHAT_MEDIA) return err('Stockage média indisponible', 503, 'no_r2');
  const mime = request.headers.get('content-type') || 'application/octet-stream';
  const nameRaw = request.headers.get('x-file-name') || 'fichier';
  // Lot 2 (P) : un « % » mal formé dans x-file-name levait URIError → 500.
  const decodedName = _safeDecode(nameRaw);
  const name = (decodedName === null ? nameRaw : decodedName).replace(/[^\w.\-() ]+/g, '_').slice(0, 120) || 'fichier';
  // Lot 2 (V) : le média est rattaché à SA conversation (si le client la donne),
  // pour que seuls les membres de CETTE conversation puissent le lire.
  let convId = null;
  try { convId = new URL(request.url).searchParams.get('conv_id') || null; } catch (_) {}
  if (convId !== null) {
    if (convId.length > 128) return err('conv_id invalide', 400, 'bad_conv_id');
    const member = await env.APEX_CHAT_DB.prepare(
      'SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?'
    ).bind(convId, auth.sub).first();
    if (!member) return err('Pas membre de cette conversation', 403, 'not_member');
  }
  const buf = await request.arrayBuffer();
  const size = buf.byteLength;
  if (!size) return err('Fichier vide', 400, 'empty');
  if (size > MEDIA_MAX) return err('Fichier trop lourd (max 100 Mo)', 413, 'too_large', { size });
  const id = crypto.randomUUID();
  const ext = (name.match(/\.([a-z0-9]{1,8})$/i) || [, ''])[1];
  const r2key = `media/${auth.sub}/${id}${ext ? '.' + ext : ''}`;
  const now = Date.now();
  const isPremium = false; // lifecycle 30j (étendu si premium plus tard)
  const expires = now + (isPremium ? 90 : 30) * 86400000;
  try {
    await env.APEX_CHAT_MEDIA.put(r2key, buf, { httpMetadata: { contentType: mime } });
    if (convId) {
      await env.APEX_CHAT_DB.prepare(
        `INSERT INTO media (id, owner_id, r2_key, size, mime, uploaded_at, expires_at, conv_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, auth.sub, r2key, size, mime, now, expires, convId).run();
    } else {
      await env.APEX_CHAT_DB.prepare(
        `INSERT INTO media (id, owner_id, r2_key, size, mime, uploaded_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, auth.sub, r2key, size, mime, now, expires).run();
    }
  } catch (e) {
    return err('Échec upload média', 500, 'r2_put_failed', { detail: e?.message });
  }
  return json({ ok: true, id, url: '/api/media/' + id, mime, size, name, conv_id: convId });
}

async function handleMediaGet(id, request, env) {
  // Seule route à accepter un ticket média (?mt=) : le jeton de session n'a
  // plus à voyager dans l'attribut `src` de chaque image (audit P2c).
  const auth = await getAuthUser(request, env, { allowMediaTicket: true });
  if (!auth) return err('Non authentifié', 401);
  if (!env.APEX_CHAT_MEDIA) return err('Stockage média indisponible', 503, 'no_r2');
  // Lot 2 (V) : conv_id (migration 0011) — repli sans la colonne pendant la fenêtre de déploiement.
  let row;
  try {
    row = await env.APEX_CHAT_DB.prepare('SELECT r2_key, mime, owner_id, conv_id FROM media WHERE id=?').bind(id).first();
  } catch (_) {
    row = await env.APEX_CHAT_DB.prepare('SELECT r2_key, mime, owner_id FROM media WHERE id=?').bind(id).first();
  }
  if (!row) return err('Média introuvable', 404, 'no_media');
  // Lot 2 (V) : un média rattaché à une conversation n'est lisible que par les
  // MEMBRES de cette conversation (avant : par quiconque partageait N'IMPORTE
  // quelle conversation avec l'auteur — ex. une photo d'un DM privé lisible par
  // les membres d'un groupe commun).
  if (row.conv_id) {
    if (row.owner_id !== auth.sub) {
      const member = await env.APEX_CHAT_DB.prepare(
        'SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?'
      ).bind(row.conv_id, auth.sub).first();
      if (!member) return err('Accès refusé', 403, 'forbidden');
    }
  }
  // SÉCU (audit externe P1-2) : autorisation — seul le PROPRIÉTAIRE ou un membre d'une
  // conversation PARTAGÉE avec le propriétaire peut lire le média. Ferme l'IDOR « n'importe
  // quel média par son id ». (L'id reste un UUID 128 bits non énumérable = défense en profondeur.)
  // Règle conservée UNIQUEMENT pour les anciens médias sans conv_id.
  else if (row.owner_id && row.owner_id !== auth.sub) {
    const shared = await env.APEX_CHAT_DB.prepare(
      'SELECT 1 FROM conversation_members a JOIN conversation_members b ON a.conv_id = b.conv_id WHERE a.user_id = ? AND b.user_id = ? LIMIT 1'
    ).bind(row.owner_id, auth.sub).first();
    if (!shared) return err('Accès refusé', 403, 'forbidden');
  }
  const obj = await env.APEX_CHAT_MEDIA.get(row.r2_key);
  if (!obj) return err('Média absent du stockage', 404, 'r2_miss');
  const h = new Headers();
  const mime = String(row.mime || obj.httpMetadata?.contentType || 'application/octet-stream').toLowerCase();
  h.set('Content-Type', mime);
  // Audit 17/09/2026 (P2) : un fichier envoyé comme text/html était servi tel quel depuis
  // l'origine de l'API (XSS stocké possible). Tout ce qui n'est pas image/audio/vidéo est
  // servi en pièce jointe, jamais rendu ; nosniff empêche le navigateur de « deviner ».
  h.set('X-Content-Type-Options', 'nosniff');
  if (!/^(image|audio|video)\//.test(mime) || /svg/.test(mime)) h.set('Content-Disposition', 'attachment');
  h.set('Cache-Control', 'private, max-age=31536000');
  // (l'en-tête CORS est posé par applyCors selon l'origine — audit P2b)
  return new Response(obj.body, { status: 200, headers: h });
}

export async function handleCreateConversation(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const { type, name, members } = await readJson(request);
  if (!['dm', 'group', 'community', 'channel'].includes(type)) return err('Type invalide');
  if (!Array.isArray(members) || members.length < 1) return err('Membres requis');
  // Lot 2 (M) : types stricts (un objet dans members/name faisait échouer le bind → 500).
  if (members.length > 1024 || members.some(m => m !== null && m !== undefined && (typeof m !== 'string' || m.length > 128))) {
    return err('Membres invalides (identifiants texte attendus)', 400, 'bad_members');
  }
  if (!_isOptStr(name, 200)) return err('Nom invalide', 400, 'bad_name');
  const DB = env.APEX_CHAT_DB;

  // v1.1.185 PRÉVENTION : résout chaque membre vers son compte CANONIQUE (suit
  // merged_into) et écarte les comptes supprimés sans canonique. Les nouvelles
  // conversations pointent TOUJOURS sur le vrai compte, jamais un stub fusionné
  // → plus de DM fantôme / split à l'avenir.
  const selfId = await _canonicalId(DB, auth.sub);
  const resolved = [];
  for (const m of members) {
    if (!m) continue;
    let cid = m;
    try { cid = await _canonicalId(DB, m); } catch (_) {}
    // si le membre est un compte supprimé SANS canonique → on l'ignore
    try {
      const u = await DB.prepare('SELECT status FROM users WHERE id=?').bind(cid).first();
      if (u && u.status === 'deleted') continue;
    } catch (_) {}
    if (cid && cid !== selfId && !resolved.includes(cid)) resolved.push(cid);
  }
  if (type === 'dm' && resolved.length === 0) {
    return err('Correspondant introuvable', 400, 'no_valid_peer');
  }
  // Lot 2 (U) : un « DM » à 3+ personnes était créé (le 1er pair servait à la
  // déduplication, les autres entraient quand même) — un DM = exactement 1 pair.
  if (type === 'dm' && resolved.length !== 1) {
    return err('Un message direct se fait avec une seule personne', 400, 'dm_one_peer', { peers: resolved.length });
  }

  // Dédup DM côté serveur (sur la paire CANONIQUE) : réutilise le DM existant
  // non archivé entre les 2 mêmes vrais comptes.
  if (type === 'dm') {
    const peer = resolved[0];
    try {
      const existing = await DB.prepare(
        `SELECT c.id, c.type, c.name, c.created_at FROM conversations c
           JOIN conversation_members a ON a.conv_id = c.id AND a.user_id = ?
           JOIN conversation_members b ON b.conv_id = c.id AND b.user_id = ?
         WHERE c.type = 'dm' AND c.archived_at IS NULL LIMIT 1`
      ).bind(selfId, peer).first();
      if (existing) return json({ ok: true, conversation: existing, deduped: true });
    } catch (e) { /* on crée ci-dessous */ }
  }

  const id = crypto.randomUUID();
  const doId = `do_${id}`;
  const ts = Date.now();
  const config = await getModeConfig(env);
  const kevinInvisible = config.KEVIN_INVISIBLE_ADMIN === 'true';

  await DB.prepare(
    `INSERT INTO conversations (id, type, name, created_by, created_at, sharded_to_do, member_count, last_msg_ts, e2e_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(id, type, name || null, selfId, ts, doId, resolved.length + 1, ts).run();

  await DB.prepare(
    `INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible)
     VALUES (?, ?, 'owner', ?, 0)`
  ).bind(id, selfId, ts).run();

  for (const memberId of resolved) {
    await DB.prepare(
      `INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible)
       VALUES (?, ?, 'member', ?, 0)`
    ).bind(id, memberId, ts).run();
  }

  // Kevin invisible : ajouté auto (sauf s'il est l'auteur/déjà membre)
  if (kevinInvisible && selfId !== 'kdmc_admin') {
    const kevin = await DB.prepare('SELECT id FROM users WHERE is_admin=1 LIMIT 1').first();
    if (kevin && kevin.id !== selfId && !resolved.includes(kevin.id)) {
      await DB.prepare(
        `INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible)
         VALUES (?, ?, 'admin', ?, 1)`
      ).bind(id, kevin.id, ts).run();
    }
  }

  return json({ ok: true, conversation: { id, type, name, created_at: ts } });
}

// ============================================================================
//  v1.1.161 — Cercle privé pré-câblé (Kevin "on devrait être connectés de
//  base pour tous les projets"). Kevin + un proche (Laurence par défaut)
//  sont créés en D1 ET la conv DM entre eux est auto-créée. Idempotent.
//
//  Appelé via :
//    - POST /api/admin/configure-core-pair (admin Kevin, 1-clic depuis l'app)
//    - automatiquement en fin de handleVerifyOtp (graceful : skip si secret absent)
// ============================================================================

async function ensureCorePair(env, opts) {
  opts = opts || {};
  const kevinPhone = normPhone(opts.kevin_phone || env.KEVIN_PHONE_E164 || '');
  const peerPhone  = normPhone(opts.peer_phone  || env.LAURENCE_PHONE_E164 || '');
  const peerId     = opts.peer_id   || 'laurence_saint_polit';
  const peerName   = opts.peer_name || 'Laurence SAINT-POLIT';
  const peerPseudo = opts.peer_pseudo || 'laurence';
  const peerFirst  = opts.peer_first_name || 'Laurence';
  const peerLast   = opts.peer_last_name  || 'SAINT-POLIT';
  const ts = Date.now();
  const out = { kevin_user: null, peer_user: null, conv_id: null, created: { kevin: false, peer: false, conv: false }, skipped: [] };

  if (!kevinPhone) { out.skipped.push('KEVIN_PHONE_E164 absent'); return out; }
  if (!peerPhone)  { out.skipped.push('peer phone absent (secret LAURENCE_PHONE_E164 ou param peer_phone)'); }

  // --- Kevin upsert ---
  try {
    const kevinHash = await sha256(kevinPhone);
    let kevin = await env.APEX_CHAT_DB.prepare('SELECT id, pseudo, real_name FROM users WHERE id=?').bind('kdmc_admin').first();
    if (!kevin) {
      await env.APEX_CHAT_DB.prepare(
        `INSERT INTO users (id, pseudo, real_name, phone, phone_hash, source, admin_authorized, created_at, status, is_admin)
         VALUES ('kdmc_admin', 'kevin', 'Kevin DESARZENS', ?, ?, 'core_pair', 1, ?, 'active', 1)`
      ).bind(kevinPhone, kevinHash, ts).run();
      kevin = { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS' };
      out.created.kevin = true;
    }
    out.kevin_user = kevin;
  } catch (e) {
    return { ...out, error: 'ensure kevin failed: ' + (e?.message || '?') };
  }

  if (!peerPhone) return out; // Kevin créé mais pas peer → on s'arrête là proprement

  // --- Peer upsert (par phone d'abord, sinon par id stable) ---
  // v1.1.163 Kevin "Ajoute déjà lolo pour Laurence" → si user existe déjà,
  // on UPDATE le pseudo/real_name/first/last (avant : SKIP silencieux).
  let peer = null;
  try {
    const peerHash = await sha256(peerPhone);
    peer = await env.APEX_CHAT_DB.prepare('SELECT id, pseudo, real_name FROM users WHERE phone=? OR id=?')
      .bind(peerPhone, peerId).first();
    if (!peer) {
      await env.APEX_CHAT_DB.prepare(
        `INSERT INTO users (id, pseudo, real_name, first_name, last_name, phone, phone_hash, source, admin_authorized, created_at, status, is_admin)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'core_pair', 1, ?, 'active', 0)`
      ).bind(peerId, peerPseudo, peerName, peerFirst, peerLast, peerPhone, peerHash, ts).run();
      peer = { id: peerId, pseudo: peerPseudo, real_name: peerName };
      out.created.peer = true;
    } else {
      // User existe → UPDATE des champs explicitement fournis (admin trust).
      // Catch UNIQUE constraint sur pseudo séparément pour ne pas bloquer la
      // mise à jour des autres champs en cas de pseudo déjà pris.
      const sets = [];
      const argsList = [];
      if (peerPseudo && peerPseudo !== peer.pseudo) { sets.push('pseudo=?'); argsList.push(peerPseudo); }
      if (peerName && peerName !== peer.real_name) { sets.push('real_name=?'); argsList.push(peerName); }
      if (peerFirst) { sets.push('first_name=?'); argsList.push(peerFirst); }
      if (peerLast) { sets.push('last_name=?'); argsList.push(peerLast); }
      sets.push('updated_at=?'); argsList.push(ts);
      argsList.push(peer.id);
      if (sets.length > 1) {
        try {
          await env.APEX_CHAT_DB.prepare(
            `UPDATE users SET ${sets.join(', ')} WHERE id=?`
          ).bind(...argsList).run();
          out.updated_peer = true;
        } catch (e) {
          // pseudo déjà pris → on retry sans le pseudo
          if (/UNIQUE/i.test(String(e?.message || '')) && peerPseudo) {
            const sets2 = sets.filter(s => !s.startsWith('pseudo='));
            const args2 = [];
            if (peerName && peerName !== peer.real_name) args2.push(peerName);
            if (peerFirst) args2.push(peerFirst);
            if (peerLast) args2.push(peerLast);
            args2.push(ts);
            args2.push(peer.id);
            await env.APEX_CHAT_DB.prepare(
              `UPDATE users SET ${sets2.join(', ')} WHERE id=?`
            ).bind(...args2).run();
            out.pseudo_conflict = peerPseudo;
          } else {
            throw e;
          }
        }
      }
      // Reload peer après update pour avoir les valeurs à jour
      peer = await env.APEX_CHAT_DB.prepare('SELECT id, pseudo, real_name FROM users WHERE id=?').bind(peer.id).first();
    }
    out.peer_user = peer;
  } catch (e) {
    return { ...out, error: 'ensure peer failed: ' + (e?.message || '?'), step: 'peer_upsert' };
  }

  // --- Auto-conv DM Kevin↔peer si pas déjà existante ---
  try {
    const existConv = await env.APEX_CHAT_DB.prepare(
      `SELECT c.id FROM conversations c
       INNER JOIN conversation_members m1 ON m1.conv_id = c.id AND m1.user_id = ?
       INNER JOIN conversation_members m2 ON m2.conv_id = c.id AND m2.user_id = ?
       WHERE c.type = 'dm' LIMIT 1`
    ).bind(out.kevin_user.id, peer.id).first();

    if (existConv) {
      out.conv_id = existConv.id;
    } else {
      const cid = crypto.randomUUID();
      const doId = 'do_' + cid;
      await env.APEX_CHAT_DB.prepare(
        `INSERT INTO conversations (id, type, name, created_by, created_at, sharded_to_do, member_count, last_msg_ts, e2e_version)
         VALUES (?, 'dm', NULL, ?, ?, ?, 2, ?, 1)`
      ).bind(cid, out.kevin_user.id, ts, doId, ts).run();
      await env.APEX_CHAT_DB.prepare(
        `INSERT INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible)
         VALUES (?, ?, 'owner', ?, 0)`
      ).bind(cid, out.kevin_user.id, ts).run();
      await env.APEX_CHAT_DB.prepare(
        `INSERT INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible)
         VALUES (?, ?, 'member', ?, 0)`
      ).bind(cid, peer.id, ts).run();
      out.conv_id = cid;
      out.created.conv = true;
    }
  } catch (e) {
    return { ...out, error: 'ensure conv failed: ' + (e?.message || '?'), step: 'conv_create' };
  }

  return out;
}

// POST /api/admin/configure-core-pair  (admin Kevin only)
// Body : { peer_phone, peer_name?, peer_first_name?, peer_last_name?, peer_pseudo? }
async function handleConfigureCorePair(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || auth.sub !== 'kdmc_admin') {
    return err('Réservé admin Kevin', 403, 'forbidden', { auth_sub: auth?.sub || null });
  }
  let body = {};
  try { body = await request.json(); } catch (e) {
    return err('JSON body invalide', 400, 'bad_json', { detail: e?.message });
  }
  if (!body.peer_phone) return err('peer_phone requis (numéro du proche, ex +336…)', 400);
  try {
    const result = await ensureCorePair(env, {
      peer_phone: body.peer_phone,
      peer_id: body.peer_id || 'laurence_saint_polit',
      peer_name: body.peer_name,
      peer_first_name: body.peer_first_name,
      peer_last_name: body.peer_last_name,
      peer_pseudo: body.peer_pseudo,
    });
    if (result.error) {
      return err('Échec configuration cercle privé', 500, 'core_pair_failed', {
        detail: result.error, step: result.step || '?', partial: result,
      });
    }
    try {
      await auditLog(env, auth.sub, 'configure_core_pair', 'user', result.peer_user?.id,
        { created: result.created, conv_id: result.conv_id }, null);
    } catch(_) {}
    return json({ ok: true, ...result });
  } catch (e) {
    return err('Erreur interne configure-core-pair', 500, 'internal', {
      detail: e?.message, where: (e?.stack || '').split('\n')[1] || '',
    });
  }
}

// ============================================================================
//  POST /api/admin/heal-dm  (admin only) — v1.1.176
//
//  Répare le cas « les deux sont connectés mais aucun message ne passe » :
//  Kevin et son correspondant ne sont PAS dans le MÊME convId (le DM « cœur »
//  pointe sur un placeholder `laurence_saint_polit` au lieu du vrai compte OTP,
//  OU il existe des DM en double). Le WebSocket étant PAR conversation, chacun
//  parle dans une instance Durable Object différente → silence total sans
//  erreur. (cf. lessons #90/#91 : couche verte, maillon manquant.)
//
//  Stratégie : NON DESTRUCTIVE + IDEMPOTENTE. On ne SUPPRIME jamais ni message
//  ni user. On consolide tous les DM Kevin↔correspondant en UNE conversation
//  canonique (la plus fournie en messages), on ajoute les 2 vrais comptes comme
//  membres, on RE-POINTE les messages des doublons (UPDATE messages.conv_id) et
//  on ARCHIVE les conversations doublons (archived_at). Réversible.
//
//  dry_run par défaut : le 1er appel ne fait que DIAGNOSTIQUER (cause exacte).
//  Appliquer = { apply:true }.
//
//  Body : { peer_query?, peer_user_id?, peer_phone?, kevin_user_id?, apply? }
// ============================================================================

// Normalise un nom pour reconnaître « la même personne » (accents/casse/espaces).
function _normNameKey(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[\s\-_.]+/g, ' ').trim();
}

// Fusionne des comptes EN DOUBLE dans le compte gardé (NON DESTRUCTIF, réversible) :
//   - GROUPE les infos (remplit les champs vides du gardé depuis le doublon le + récent)
//   - re-pointe messages.sender_id + memberships → compte gardé
//   - status='deleted' (réversible) sur les doublons (jamais un compte admin)
// Réutilisé par /heal-dm (manuel admin) ET l'auto-réparation au login.
export async function mergeDupAccountsInto(DB, peerId, dupAccounts, now) {
  const out = { merged_accounts: [], consolidated_fields: [] };
  if (!dupAccounts || !dupAccounts.length) return out;
  now = now || Date.now();
  // 1) Consolider les infos dans le compte gardé.
  try {
    const CONSOLIDATE = ['real_name', 'first_name', 'last_name', 'display_name', 'email',
      'bio', 'avatar_url', 'last_geo_label', 'last_device_label', 'last_lat', 'last_lng',
      'last_ip_hash', 'last_user_agent', 'language', 'timezone'];
    const isEmpty = (v) => v === null || v === undefined || v === '';
    const keeperRow = await DB.prepare('SELECT * FROM users WHERE id=?').bind(peerId).first();
    const dupRows = [];
    for (const d of dupAccounts) {
      const rr = await DB.prepare('SELECT * FROM users WHERE id=?').bind(d.id).first();
      if (rr) dupRows.push(rr);
    }
    dupRows.sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0));
    const sets = [], vals = [], filled = [];
    for (const f of CONSOLIDATE) {
      if (!isEmpty(keeperRow && keeperRow[f])) continue;
      const src = dupRows.find((r) => !isEmpty(r[f]));
      if (src) { sets.push(f + '=?'); vals.push(src[f]); filled.push(f); }
    }
    const maxSeen = Math.max(keeperRow?.last_seen || 0, ...dupRows.map((r) => r.last_seen || 0));
    if (maxSeen > (keeperRow?.last_seen || 0)) { sets.push('last_seen=?'); vals.push(maxSeen); }
    if (sets.length > 0) {
      sets.push('updated_at=?'); vals.push(now); vals.push(peerId);
      await DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id=?`).bind(...vals).run();
    }
    out.consolidated_fields = filled;
  } catch (e) { out.consolidate_error = e?.message || '?'; }
  // 2) Re-point messages + memberships, puis soft-delete chaque doublon.
  for (const dup of dupAccounts) {
    const rm = await DB.prepare('UPDATE messages SET sender_id=? WHERE sender_id=?').bind(peerId, dup.id).run();
    await DB.prepare(
      `INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible)
       SELECT conv_id, ?, role, joined_at, kevin_invisible FROM conversation_members WHERE user_id=?`
    ).bind(peerId, dup.id).run();
    await DB.prepare('DELETE FROM conversation_members WHERE user_id=?').bind(dup.id).run();
    // merged_into = compte gardé → getAuthUser suit le pointeur (anti-verrouillage).
    await DB.prepare("UPDATE users SET status='deleted', merged_into=?, updated_at=? WHERE id=?").bind(peerId, now, dup.id).run();
    out.merged_accounts.push({ id: dup.id, pseudo: dup.pseudo, messages_moved: rm?.meta?.changes ?? null });
  }
  return out;
}

// Garantit 1 SEULE conversation DM par contact pour un user : si plusieurs DM
// existent avec le même correspondant, on garde le + fourni en messages et on
// fusionne les autres dedans (messages re-pointés, doublon archivé).
// Suit merged_into jusqu'au compte canonique (anti-doublon de regroupement).
export async function _canonicalId(DB, id) {
  let cur = id, hops = 0;
  // v1.1.192 — un id "local_+<numéro>" (contact ajouté par numéro côté client)
  // est résolu vers le VRAI compte par son numéro de téléphone.
  if (typeof cur === 'string' && cur.indexOf('local_') === 0) {
    // Revue 08.10.2026 (D5) : comparaison sur le numéro E.164 COMPLET normalisé
    // (comme getAuthUser) — les 8 derniers chiffres confondaient deux personnes de
    // pays différents, et _healLocalConvMembers réécrivait leurs messages.
    const exact = normPhone(cur.replace(/^local_/, ''));
    if (exact && exact.startsWith('+') && exact.replace(/\D/g, '').length >= 8) {
      try {
        const u = await DB.prepare(
          "SELECT id FROM users WHERE status != 'deleted' AND phone = ? ORDER BY (last_seen IS NOT NULL) DESC, last_seen DESC LIMIT 1"
        ).bind(exact).first();
        if (u && u.id) cur = u.id;
      } catch (_) {}
    }
  }
  while (cur && hops < 4) {
    try {
      const r = await DB.prepare('SELECT merged_into FROM users WHERE id=?').bind(cur).first();
      if (r && r.merged_into && r.merged_into !== cur) { cur = r.merged_into; hops++; continue; }
    } catch (_) { /* colonne absente → on garde cur */ }
    break;
  }
  return cur;
}

// v1.1.192 — Répare les conversations dont un membre est un id bidon
// "local_+<numéro>" (contact ajouté par numéro côté client, jamais résolu vers
// le vrai compte → conversations fantômes, messages qui n'arrivent pas).
// Re-pointe ces membres + leurs messages vers le vrai compte. Best-effort.
export async function _healLocalConvMembers(DB) {
  let fixed = 0;
  try {
    const rows = (await DB.prepare(
      "SELECT DISTINCT user_id FROM conversation_members WHERE user_id LIKE 'local%'"
    ).all()).results || [];
    for (const row of rows) {
      const localId = row.user_id;
      const realId = await _canonicalId(DB, localId);
      if (!realId || realId === localId) continue;   // numéro non résolu → on laisse
      await DB.prepare(
        `INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible)
         SELECT conv_id, ?, role, joined_at, kevin_invisible FROM conversation_members WHERE user_id=?`
      ).bind(realId, localId).run();
      await DB.prepare('UPDATE messages SET sender_id=? WHERE sender_id=?').bind(realId, localId).run().catch(() => {});
      await DB.prepare('DELETE FROM conversation_members WHERE user_id=?').bind(localId).run();
      fixed++;
    }
  } catch (_) {}
  return fixed;
}

// v1.1.194 — Rattache Kevin à son compte admin historique `kdmc_admin`.
// Le compte admin (qui détient toutes les conversations) avait un numéro
// placeholder → la connexion par numéro ouvrait un compte NON-admin vide
// (admin:non / 403 / convs:0) ET le stub `local_+<numéro>` de Kevin chez
// Laurence ne pouvait pas résoudre vers lui (messages jamais reçus).
// Idempotent, NON destructif (soft-delete + merged_into), zéro lockout.
//   - libère le numéro de tout compte-doublon qui le détient (UNIQUE phone),
//   - re-pointe ses messages + memberships vers kdmc_admin,
//   - donne le VRAI numéro + droits admin à kdmc_admin,
//   - répare les conversations où Kevin était membre via un stub local_+<numéro>.
export async function consolidateKevinIntoAdmin(env, cleanPhone, phoneHash, now) {
  const DB = env.APEX_CHAT_DB;
  now = now || Date.now();
  const admin = await DB.prepare("SELECT * FROM users WHERE id='kdmc_admin'").first();
  if (!admin) return null; // pas de compte admin → on ne touche à rien
  // 1) Doublon créé par erreur = compte (non-admin) détenant déjà ce numéro.
  const dup = await DB.prepare("SELECT * FROM users WHERE phone=? AND id!='kdmc_admin'").bind(cleanPhone).first();
  if (dup) {
    // Libère le numéro (contrainte UNIQUE) AVANT de le donner à l'admin.
    await DB.prepare("UPDATE users SET phone=?, phone_hash=NULL, status='deleted', merged_into='kdmc_admin', updated_at=? WHERE id=?")
      .bind('moved_' + dup.id, now, dup.id).run();
    await DB.prepare('UPDATE messages SET sender_id=? WHERE sender_id=?').bind('kdmc_admin', dup.id).run().catch(() => {});
    await DB.prepare(
      `INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible)
       SELECT conv_id, 'kdmc_admin', role, joined_at, kevin_invisible FROM conversation_members WHERE user_id=?`
    ).bind(dup.id).run().catch(() => {});
    await DB.prepare('DELETE FROM conversation_members WHERE user_id=?').bind(dup.id).run().catch(() => {});
  }
  // 2) kdmc_admin récupère le VRAI numéro (→ résout les stubs local_+<numéro>).
  const phoneChanged = admin.phone !== cleanPhone;
  if (phoneChanged) {
    await DB.prepare("UPDATE users SET phone=?, phone_hash=?, is_admin=1, is_kevin_alias=1, status='active', updated_at=? WHERE id='kdmc_admin'")
      .bind(cleanPhone, phoneHash, now).run();
  }
  // 3) Répare les conversations où Kevin est membre via un stub local_+<numéro>
  //    (maintenant que kdmc_admin porte le numéro, _canonicalId le résout).
  try { await _healLocalConvMembers(DB); } catch (_) {}
  // 4) 1 SEULE conversation par contact pour Kevin (fusionne les DM en double).
  try { await consolidateUserDms(DB, 'kdmc_admin', now); } catch (_) {}
  // 5) Purge le bruit (DM vides/archivés + membres fantômes supprimés/fusionnés).
  try { await cleanupEmptyConversations(DB); } catch (_) {}
  try { await cleanupGhostMembers(DB); } catch (_) {}
  try {
    await auditLog(env, 'kdmc_admin', 'kevin_consolidate', 'user', 'kdmc_admin',
      { merged: dup ? dup.id : null, phone_set: phoneChanged }, null);
  } catch (_) {}
  return await DB.prepare("SELECT * FROM users WHERE id='kdmc_admin'").first();
}

// v1.1.195 — Nettoyage : supprime les conversations VIDES (0 message) qui sont
// soit archivées, soit orphelines (≤1 membre réel). Pur bruit accumulé par les
// re-créations de DM successives (cf. diag : ~15 DM solo de Laurence à 0 msg).
// Ne touche JAMAIS une conversation qui contient le moindre message. Best-effort.
export async function cleanupEmptyConversations(DB) {
  let removed = 0;
  try {
    const rows = (await DB.prepare(
      `SELECT c.id,
              (SELECT COUNT(*) FROM messages mm WHERE mm.conv_id=c.id) AS msgs,
              (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conv_id=c.id) AS mem,
              c.archived_at
       FROM conversations c WHERE c.type='dm'`
    ).all()).results || [];
    for (const r of rows) {
      if ((r.msgs || 0) > 0) continue;                 // jamais si ≥1 message
      if (!r.archived_at && (r.mem || 0) >= 2) continue; // garde les DM actifs à 2 vrais membres
      await DB.prepare('DELETE FROM conversation_members WHERE conv_id=?').bind(r.id).run().catch(() => {});
      await DB.prepare('DELETE FROM conversations WHERE id=?').bind(r.id).run().catch(() => {});
      removed++;
    }
  } catch (_) {}
  return removed;
}

// v1.1.197 — Retire des conversations les membres « fantômes » (compte supprimé
// ou fusionné, ex: vieux user_laurence) tant qu'il reste ≥1 membre réel. Évite
// member_count gonflé + le fantôme choisi comme destinataire. Non destructif
// (on ne touche qu'à la ligne d'appartenance, pas aux messages). Best-effort.
export async function cleanupGhostMembers(DB) {
  let removed = 0;
  try {
    const rows = (await DB.prepare(
      `SELECT cm.conv_id, cm.user_id
         FROM conversation_members cm
         JOIN users u ON u.id = cm.user_id
        WHERE u.status = 'deleted' OR u.merged_into IS NOT NULL`
    ).all()).results || [];
    const touched = new Set();
    for (const r of rows) {
      const real = await DB.prepare(
        `SELECT COUNT(*) AS c FROM conversation_members cm
           JOIN users u ON u.id = cm.user_id
          WHERE cm.conv_id = ? AND (u.status IS NULL OR u.status != 'deleted') AND u.merged_into IS NULL`
      ).bind(r.conv_id).first();
      if ((real?.c || 0) >= 1) {   // garde au moins 1 membre réel
        await DB.prepare('DELETE FROM conversation_members WHERE conv_id=? AND user_id=?')
          .bind(r.conv_id, r.user_id).run().catch(() => {});
        removed++;
        touched.add(r.conv_id);
      }
    }
    // v1.1.204 — recale conversations.member_count sur le NOMBRE RÉEL de lignes
    // d'appartenance restantes (Kevin : la conv Kevin↔Laurence affichait
    // « 3 membres » alors qu'un fantôme avait été retiré). Sans ça l'en-tête de
    // chat ment (👥 N membres). Recalcul une seule fois par conv touchée.
    for (const convId of touched) {
      const cnt = await DB.prepare(
        'SELECT COUNT(*) AS c FROM conversation_members WHERE conv_id=?'
      ).bind(convId).first();
      await DB.prepare('UPDATE conversations SET member_count=? WHERE id=?')
        .bind(cnt?.c || 0, convId).run().catch(() => {});
    }
  } catch (_) {}
  return removed;
}

export async function consolidateUserDms(DB, userId, now) {
  now = now || Date.now();
  const out = { groups_merged: 0, convs_archived: 0 };
  const dms = (await DB.prepare(
    `SELECT c.id, c.archived_at, c.created_at,
            (SELECT COUNT(*) FROM messages mm WHERE mm.conv_id=c.id) AS msgs
     FROM conversations c JOIN conversation_members m ON m.conv_id=c.id AND m.user_id=?
     WHERE c.type='dm'`
  ).bind(userId).all()).results || [];
  // Regroupe par « autre membre » CANONIQUE (suit merged_into) → 1 conv/contact
  // même si les anciennes convs pointaient sur des comptes-doublons.
  const groups = new Map();
  for (const d of dms) {
    if (d.archived_at) continue;
    const mem = (await DB.prepare('SELECT user_id FROM conversation_members WHERE conv_id=?').bind(d.id).all()).results || [];
    const otherIds = [];
    for (const x of mem) { if (x.user_id !== userId) otherIds.push(await _canonicalId(DB, x.user_id)); }
    const others = [...new Set(otherIds)].sort().join(',');
    if (!groups.has(others)) groups.set(others, []);
    groups.get(others).push(d);
  }
  // Rescousse des DM « solo » (où l'utilisateur est SEUL membre = correspondant
  // perdu) : s'il n'a qu'UN seul correspondant réel (cas 2 personnes), on replie
  // ces convs orphelines dans la conv de ce correspondant → ses messages
  // « envoyés dans le vide » rejoignent la vraie conversation, et le pair est
  // ajouté comme membre par la boucle de fusion ci-dessous.
  const peerKeys = [...groups.keys()].filter(k => k !== '');
  if (groups.has('') && peerKeys.length === 1) {
    groups.get(peerKeys[0]).push(...groups.get(''));
    groups.delete('');
  }
  for (const [, convs] of groups) {
    if (convs.length < 2) continue;
    convs.sort((a, b) => (b.msgs - a.msgs) || (a.created_at - b.created_at));
    const keep = convs[0];
    for (const dup of convs.slice(1)) {
      await DB.prepare('UPDATE messages SET conv_id=? WHERE conv_id=?').bind(keep.id, dup.id).run();
      // re-point les membres du doublon vers la conv gardée (sans conflit PK)
      await DB.prepare(
        `INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible)
         SELECT ?, user_id, role, joined_at, kevin_invisible FROM conversation_members WHERE conv_id=?`
      ).bind(keep.id, dup.id).run();
      await DB.prepare('UPDATE conversations SET archived_at=? WHERE id=?').bind(now, dup.id).run();
      out.convs_archived++;
    }
    const cnt = await DB.prepare('SELECT COUNT(*) AS c FROM conversation_members WHERE conv_id=?').bind(keep.id).first();
    const last = await DB.prepare('SELECT MAX(ts) AS t FROM messages WHERE conv_id=?').bind(keep.id).first();
    await DB.prepare('UPDATE conversations SET member_count=?, last_msg_ts=?, archived_at=NULL WHERE id=?')
      .bind(cnt?.c || 2, last?.t || now, keep.id).run();
    out.groups_merged++;
  }
  return out;
}

// AUTO-RÉPARATION (au login) : groupe automatiquement les comptes en double de
// la MÊME personne (même numéro normalisé OU placeholder même nom) dans le
// compte authentifié, et garantit 1 conv/contact. Best-effort, ne JAMAIS bloquer
// le login (règle zéro-lockout). Réparer Laurence répare aussi le DM de Kevin
// (le placeholder qu'elle absorbe était membre de la conv de Kevin).
export async function autoHealPerson(env, caller) {
  const DB = env.APEX_CHAT_DB;
  const STUB_SOURCES = ['core_pair', 'apex-sso', 'user-invitation'];
  const summary = { merged: 0, dms_merged: 0, keeper: null };
  if (!caller || !caller.id) return summary;
  const now = Date.now();
  const tail = (p) => normPhone(p || '').replace(/\D/g, '').slice(-8);
  const callerTail = tail(caller.phone);
  const callerName = _normNameKey(caller.real_name) || _normNameKey(caller.pseudo);
  const callerPseudo = _normNameKey(caller.pseudo);
  const firstTok = (callerName.split(' ')[0] || '').slice(0, 20);

  // Candidats larges : même fin de numéro OU nom/pseudo proche.
  const rows = (await DB.prepare(
    `SELECT id, phone, real_name, pseudo, source, is_admin, status, last_seen FROM users
     WHERE is_admin = 0 AND status != 'deleted'
       AND ( (? != '' AND phone LIKE ?) OR LOWER(real_name) LIKE ? OR LOWER(pseudo) LIKE ? )`
  ).bind(callerTail, '%' + callerTail, '%' + firstTok + '%', '%' + firstTok + '%').all()).results || [];

  // Groupe = MÊME personne : même nom normalisé OU même fin de numéro que l'appelant.
  let group = rows.filter(r => {
    const sameName = (_normNameKey(r.real_name) && _normNameKey(r.real_name) === callerName) ||
      (callerPseudo && _normNameKey(r.pseudo) === callerPseudo);
    const sameTail = callerTail && tail(r.phone) === callerTail;
    return sameName || sameTail;
  });
  if (!group.some(g => g.id === caller.id)) {
    group.push({ id: caller.id, phone: caller.phone, real_name: caller.real_name, pseudo: caller.pseudo, source: caller.source, last_seen: caller.last_seen || 0 });
  }
  if (group.length < 2) {
    const dm = await consolidateUserDms(DB, caller.id, now);
    summary.dms_merged = dm.groups_merged;
    return summary;
  }

  // Nb messages par compte (pour choisir le compte à GARDER = le vrai).
  for (const g of group) {
    g._msgs = (await DB.prepare('SELECT COUNT(*) c FROM messages WHERE sender_id=?').bind(g.id).first())?.c ?? 0;
    g._digits = normPhone(g.phone || '').replace(/\D/g, '').length;
  }
  // keeper = + de messages, puis + récemment vu, puis vrai numéro, puis le plus ancien.
  group.sort((a, b) => (b._msgs - a._msgs) || ((b.last_seen || 0) - (a.last_seen || 0)) || (b._digits - a._digits));
  const keeper = group[0];
  summary.keeper = keeper.id;
  const keeperTail = tail(keeper.phone);
  const keeperName = _normNameKey(keeper.real_name) || _normNameKey(keeper.pseudo);

  // 2e passe — rescan par les identifiants du KEEPER (transitivité) : si l'appelant
  // était un stub sans numéro, on rattrape les autres comptes (ex: un stub au nom
  // court mais MÊME numéro que le vrai compte) que les identifiants de l'appelant
  // n'avaient pas captés.
  if (keeperTail || keeperName) {
    const kFirst = (keeperName.split(' ')[0] || '').slice(0, 20);
    const more = (await DB.prepare(
      `SELECT id, phone, real_name, pseudo, source, is_admin, status, last_seen FROM users
       WHERE is_admin = 0 AND status != 'deleted'
         AND ( (? != '' AND phone LIKE ?) OR LOWER(real_name) LIKE ? OR LOWER(pseudo) LIKE ? )`
    ).bind(keeperTail, '%' + keeperTail, '%' + kFirst + '%', '%' + kFirst + '%').all()).results || [];
    for (const r of more) {
      if (group.some(g => g.id === r.id)) continue;
      const sameName = (_normNameKey(r.real_name) && _normNameKey(r.real_name) === keeperName);
      const sameTail = keeperTail && tail(r.phone) === keeperTail;
      if (sameName || sameTail) {
        r._msgs = (await DB.prepare('SELECT COUNT(*) c FROM messages WHERE sender_id=?').bind(r.id).first())?.c ?? 0;
        group.push(r);
      }
    }
  }

  // dups = autres comptes, UNIQUEMENT s'ils sont des stubs/doublons SÛRS :
  // même fin de numéro, OU vide (0 msg & jamais vu), OU source stub. Jamais 2
  // vrais comptes actifs distincts (anti-fusion d'homonymes).
  // Revue 08.10.2026 : deux personnes DIFFÉRENTES au même nom étaient fusionnées
  // (une seule avait-elle 0 message ou une source « invitation ») et la seconde
  // perdait ses messages et ses conversations. Règle stricte désormais :
  //  - deux comptes avec chacun un VRAI numéro → fusion seulement si numéro IDENTIQUE
  //    (complet, indicatif compris — plus les 8 derniers chiffres) ;
  //  - un compte avec un vrai numéro n'est JAMAIS absorbé par un compte sans numéro ;
  //  - un compte SANS vrai numéro (brouillon) rejoint le vrai s'il est vide ou de source brouillon.
  const realPhone = (p) => { const n = normPhone(p || ''); return /^\+\d{8,15}$/.test(n) ? n : ''; };
  const kp = realPhone(keeper.phone);
  const dups = group.filter(g => g.id !== keeper.id).filter(g => {
    const gp = realPhone(g.phone);
    if (gp) return !!kp && gp === kp;
    const empty = g._msgs === 0 && (g.last_seen || 0) === 0;
    const stubSrc = STUB_SOURCES.includes(g.source);
    return empty || stubSrc;
  });
  if (dups.length) {
    await mergeDupAccountsInto(DB, keeper.id, dups.map(d => ({ id: d.id, pseudo: d.pseudo })), now);
    summary.merged = dups.length;
    try { await auditLog(env, keeper.id, 'auto_merge_person', 'user', keeper.id, { kept: keeper.id, removed: dups.map(d => d.id) }, null); } catch (_) {}
  }
  // 1 conv/contact pour le compte gardé (re-groupe par membre canonique).
  const dmRes = await consolidateUserDms(DB, keeper.id, now);
  summary.dms_merged = dmRes.groups_merged;
  return summary;
}

// v1.1.215 (Kevin « on est TOUJOURS 3 dans la conv avec Laurence ») — un DM ne
// doit avoir QUE 2 personnes. Si un DM de l'appelant a >2 lignes de membres,
// c'est qu'un correspondant a des comptes DOUBLON (créés pendant ses galères de
// login : stub local_, OTP, SSO kd-mc.com, invitation). autoHealPerson ne
// soignait QUE l'appelant → les doublons de Laurence ne fusionnaient jamais (elle
// n'arrive pas à ouvrir l'app). Ici on soigne aussi les PAIRS des DM surpeuplés :
// leurs doublons sûrs sont fusionnés (merged_into), puis cleanupGhostMembers (appelé
// juste après) retire les lignes fantômes et recale member_count → 2.
// Idempotent + best-effort + anti-fusion d'homonymes (héritée d'autoHealPerson).
export async function _healOverpopulatedDms(env, callerId) {
  const DB = env.APEX_CHAT_DB;
  try {
    const dms = (await DB.prepare(
      `SELECT c.id AS conv_id,
              (SELECT COUNT(*) FROM conversation_members x WHERE x.conv_id=c.id) AS n
         FROM conversations c
         JOIN conversation_members cm ON cm.conv_id=c.id AND cm.user_id=?
        WHERE c.type='dm'`
    ).bind(callerId).all()).results || [];
    for (const d of dms) {
      if ((d.n || 0) <= 2) continue;              // DM sain (2 personnes) → rien à faire
      const others = (await DB.prepare(
        `SELECT u.id, u.phone, u.real_name, u.pseudo, u.source, u.last_seen
           FROM conversation_members cm JOIN users u ON u.id=cm.user_id
          WHERE cm.conv_id=? AND cm.user_id!=? AND u.is_admin=0
            AND (u.status IS NULL OR u.status!='deleted') AND u.merged_into IS NULL`
      ).bind(d.conv_id, callerId).all()).results || [];
      for (const o of others) {
        try { await autoHealPerson(env, o); } catch (_) { /* best-effort */ }
      }
    }
  } catch (e) { console.warn('[heal-overpop-dms]', e?.message); }
}

async function handleHealDm(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401, 'unauthenticated');
  if (!(auth.is_admin || auth.sub === 'kdmc_admin')) {
    return err('Réservé admin', 403, 'forbidden', { auth_sub: auth.sub });
  }

  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  const apply = body.apply === true;
  const DB = env.APEX_CHAT_DB;
  const report = { ok: false, apply, step: 'resolve_kevin', dry_run: !apply };

  try {
    // 1) Résoudre "Kevin" = l'admin appelant (ou override). On répare SES DM.
    const kevinId = body.kevin_user_id || auth.sub;
    const kevin = await DB.prepare(
      'SELECT id, pseudo, real_name, phone FROM users WHERE id=?'
    ).bind(kevinId).first();
    if (!kevin) {
      report.cause = 'kevin_not_found';
      report.detail = "Le compte admin appelant n'existe pas côté serveur (id=" + kevinId + ').';
      return json(report, 200);
    }
    report.kevin = { id: kevin.id, pseudo: kevin.pseudo, name: kevin.real_name };
    report.step = 'resolve_peer';

    // 2) Résoudre le correspondant (Laurence). Plusieurs pistes, ordre de
    //    confiance : id explicite > phone > recherche texte (pseudo/nom).
    let candidates = [];
    if (body.peer_user_id) {
      const r = await DB.prepare(
        'SELECT id, pseudo, real_name, phone, source, last_seen, is_admin FROM users WHERE id=?'
      ).bind(body.peer_user_id).first();
      if (r) candidates = [r];
    } else if (body.peer_phone) {
      const r = await DB.prepare(
        'SELECT id, pseudo, real_name, phone, source, last_seen, is_admin FROM users WHERE phone=?'
      ).bind(normPhone(body.peer_phone)).first();
      if (r) candidates = [r];
    } else {
      const q = '%' + String(body.peer_query || 'laurence').toLowerCase() + '%';
      const r = await DB.prepare(
        `SELECT id, pseudo, real_name, phone, source, last_seen, is_admin FROM users
         WHERE id != ? AND (
           LOWER(pseudo) LIKE ? OR LOWER(real_name) LIKE ?
           OR LOWER(COALESCE(first_name,'')) LIKE ? OR LOWER(COALESCE(last_name,'')) LIKE ?)
         ORDER BY (source='core_pair') ASC, COALESCE(last_seen,0) DESC LIMIT 10`
      ).bind(kevin.id, q, q, q, q).all();
      candidates = (r && r.results) ? r.results : [];
    }
    report.peer_candidates = candidates.map(c => ({
      id: c.id, pseudo: c.pseudo, name: c.real_name,
      source: c.source, last_seen: c.last_seen || 0, placeholder: c.source === 'core_pair',
    }));

    // Normalisation de nom (accents/casse/espaces) pour reconnaître « la même
    // personne dupliquée » (3 comptes au même nom = à grouper, PAS une ambiguïté).
    const normName = (s) => String(s || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[\s\-_.]+/g, ' ').trim();

    // Choix du VRAI compte à GARDER. Un vrai compte (source != core_pair) prime
    // sur le placeholder. Plusieurs vrais comptes AU MÊME NOM = même personne
    // dupliquée → on garde le plus actif et on fusionnera les autres. On ne
    // bloque (« ambigu ») que si les noms diffèrent vraiment (vraies personnes
    // distinctes) sans identifiant explicite.
    // Choisit le compte « principal » = celui avec le PLUS de messages (puis le
    // plus actif). On ne bloque PLUS sur les noms : autoHealPerson regroupe en
    // sécurité (jamais 2 vrais comptes actifs distincts). Couvre le cas réel où
    // un stub s'appelle « Laurence » et le vrai « Laurence SAINT-POLIT ».
    let peer = null;
    if (candidates.length) {
      for (const c of candidates) {
        c._msgs = (await DB.prepare('SELECT COUNT(*) c FROM messages WHERE sender_id=?').bind(c.id).first())?.c ?? 0;
      }
      candidates.sort((a, b) => (b._msgs - a._msgs) || ((b.last_seen || 0) - (a.last_seen || 0)) || ((b.phone ? 1 : 0) - (a.phone ? 1 : 0)));
      peer = candidates[0];
    }
    if (!peer) {
      report.cause = 'peer_not_found';
      report.detail = "Aucun correspondant trouvé (essaie peer_phone exact).";
      return json(report, 200);
    }
    report.peer = { id: peer.id, pseudo: peer.pseudo, name: peer.real_name, placeholder: peer.source === 'core_pair' };

    // 2b) Comptes EN DOUBLE de la MÊME personne (3 comptes Laurence !) : candidats
    //     ≠ compte gardé, jamais admin, et même nom normalisé OU placeholder
    //     (sécurité : ne fusionne jamais un homonyme d'une autre personne). On
    //     re-pointe messages + membres vers le vrai compte puis status='deleted'
    //     (réversible) lors de l'apply.
    const keepName = normName(peer.real_name) || normName(peer.pseudo);
    const dupAccounts = candidates.filter(c => c.id !== peer.id && !c.is_admin &&
      (c.source === 'core_pair' || normName(c.real_name) === keepName || normName(c.pseudo) === normName(peer.pseudo)));
    report.accounts = {
      keep: { id: peer.id, pseudo: peer.pseudo, name: peer.real_name },
      remove: dupAccounts.map(c => ({ id: c.id, pseudo: c.pseudo, name: c.real_name,
        source: c.source, placeholder: c.source === 'core_pair', last_seen: c.last_seen || 0 })),
    };
    report.step = 'scan_dms';

    // 3) Tous les DM dont Kevin est membre + leurs membres + nb messages.
    const kevinDms = await DB.prepare(
      `SELECT c.id, c.archived_at, c.created_at,
              (SELECT COUNT(*) FROM messages mm WHERE mm.conv_id = c.id) AS msgs
       FROM conversations c
       JOIN conversation_members m ON m.conv_id = c.id AND m.user_id = ?
       WHERE c.type = 'dm'`
    ).bind(kevin.id).all();
    const dms = (kevinDms && kevinDms.results) ? kevinDms.results : [];

    // Pour chacun, charger les membres → identifie les DM Kevin↔(peer OU un
    // candidat laurence : placeholder/doublon).
    const candidateIds = new Set(candidates.map(c => c.id));
    candidateIds.add(peer.id);
    const relevant = [];
    for (const d of dms) {
      const mem = await DB.prepare(
        'SELECT user_id FROM conversation_members WHERE conv_id=?'
      ).bind(d.id).all();
      const members = (mem && mem.results) ? mem.results.map(x => x.user_id) : [];
      const peerMembers = members.filter(u => candidateIds.has(u));
      if (peerMembers.length > 0) {
        relevant.push({ id: d.id, msgs: d.msgs || 0, archived: !!d.archived_at,
          created_at: d.created_at, members, peerMembers });
      }
    }
    report.kevin_dm_count = dms.length;
    report.relevant_dms = relevant.map(r => ({ id: r.id, msgs: r.msgs, archived: r.archived,
      members: r.members, with: r.peerMembers }));

    // 4) Diagnostic de cause exacte.
    const activeRelevant = relevant.filter(r => !r.archived);
    const canonicalContainsRealPeer = activeRelevant.some(r => r.members.includes(peer.id));
    if (relevant.length === 0) {
      report.cause = 'no_dm';
      report.detail = "Aucun DM entre Kevin et ce correspondant côté serveur — il faut le créer (le client crée une conv 'dm' au 1er message).";
    } else if (activeRelevant.length > 1) {
      report.cause = 'duplicate_dm';
      report.detail = activeRelevant.length + " DM actifs Kevin↔correspondant → chacun ouvre une instance différente, rien ne passe. À fusionner.";
    } else if (!canonicalContainsRealPeer) {
      report.cause = 'peer_not_member';
      report.detail = "Le DM actif ne contient PAS le vrai compte du correspondant (placeholder/ancien id) → il n'est pas membre, ne reçoit rien.";
    } else {
      report.cause = 'already_consistent';
      report.detail = "Un seul DM actif contenant les 2 vrais comptes. Le souci est ailleurs (transport/cache client).";
    }

    // 5) Choisir la conversation canonique = la plus fournie en messages,
    //    tie-break : non archivée, puis la plus ancienne (stable).
    if (relevant.length > 0) {
      const canonical = [...relevant].sort((a, b) =>
        (b.msgs - a.msgs) ||
        ((a.archived ? 1 : 0) - (b.archived ? 1 : 0)) ||
        (a.created_at - b.created_at)
      )[0];
      report.canonical_conv_id = canonical.id;

      const plan = [];
      // a) S'assurer que Kevin + le VRAI peer sont membres de la canonique.
      if (!canonical.members.includes(kevin.id)) plan.push({ action: 'add_member', conv: canonical.id, user: kevin.id, role: 'owner' });
      if (!canonical.members.includes(peer.id))  plan.push({ action: 'add_member', conv: canonical.id, user: peer.id, role: 'member' });
      // b) Fusionner les autres DM pertinents dans la canonique.
      const dupes = relevant.filter(r => r.id !== canonical.id);
      for (const dup of dupes) {
        if (dup.msgs > 0) plan.push({ action: 'move_messages', from: dup.id, to: canonical.id, count: dup.msgs });
        plan.push({ action: 'archive_conv', conv: dup.id });
      }
      report.plan = plan;

      if (apply && plan.length > 0) {
        report.step = 'apply';
        const now = Date.now();
        const done = [];
        for (const p of plan) {
          if (p.action === 'add_member') {
            await DB.prepare(
              `INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible)
               VALUES (?, ?, ?, ?, 0)`
            ).bind(p.conv, p.user, p.role, now).run();
            done.push(p);
          } else if (p.action === 'move_messages') {
            const r = await DB.prepare('UPDATE messages SET conv_id=? WHERE conv_id=?').bind(p.to, p.from).run();
            done.push({ ...p, changed: r?.meta?.changes ?? null });
          } else if (p.action === 'archive_conv') {
            await DB.prepare('UPDATE conversations SET archived_at=? WHERE id=?').bind(now, p.conv).run();
            done.push(p);
          }
        }
        // Recompter membres + dernier message de la canonique.
        const cnt = await DB.prepare('SELECT COUNT(*) AS c FROM conversation_members WHERE conv_id=?').bind(canonical.id).first();
        const last = await DB.prepare('SELECT MAX(ts) AS t FROM messages WHERE conv_id=?').bind(canonical.id).first();
        await DB.prepare('UPDATE conversations SET member_count=?, last_msg_ts=?, archived_at=NULL WHERE id=?')
          .bind(cnt?.c || 2, last?.t || now, canonical.id).run();
        report.applied = done;
        try { await auditLog(env, auth.sub, 'heal_dm', 'conversation', canonical.id,
          { cause: report.cause, peer: peer.id, actions: done.length }, null); } catch (_) {}
      }
    }

    // 6) Fusion des COMPTES en double (3 comptes Laurence) — helper partagé
    //    avec l'auto-réparation au login. NON DESTRUCTIF, réversible, jamais admin.
    if (apply && body.merge_accounts !== false && dupAccounts.length > 0) {
      report.step = 'merge_accounts';
      const res = await mergeDupAccountsInto(DB, peer.id, dupAccounts, Date.now());
      report.merged_accounts = res.merged_accounts;
      report.consolidated_fields = res.consolidated_fields;
      if (res.consolidate_error) report.consolidate_error = res.consolidate_error;
      try { await auditLog(env, auth.sub, 'merge_dup_accounts', 'user', peer.id,
        { kept: peer.id, removed: dupAccounts.map(d => d.id) }, null); } catch (_) {}
    }

    // Réparation INTELLIGENTE complète du correspondant (même logique que l'auto
    // au login) : choisit le vrai compte, fusionne TOUS les stubs (sso/invitation/
    // vide), 1 conv/contact. Permet à Kevin de tout réparer SEUL depuis le bouton.
    if (apply) {
      try {
        const pr = await DB.prepare('SELECT id, phone, real_name, pseudo, source, last_seen FROM users WHERE id=?').bind(peer.id).first();
        if (pr) { const s = await autoHealPerson(env, pr); report.auto_heal = s; }
        // consolide aussi les conversations de l'admin appelant (1 conv/contact côté Kevin)
        const ka = await DB.prepare('SELECT id, phone, real_name, pseudo FROM users WHERE id=?').bind(auth.sub).first();
        if (ka) await consolidateUserDms(DB, ka.id, Date.now());
      } catch (e) { report.auto_heal_error = e?.message || '?'; }
    }

    report.ok = true;
    report.next = apply
      ? "Réparé. Kevin ET le correspondant doivent ROUVRIR l'app (ou forcer la MAJ) pour recharger la liste des conversations."
      : "Diagnostic seul (dry_run). Renvoie { apply:true } pour appliquer.";
    return json(report, 200);
  } catch (e) {
    report.cause = 'exception';
    report.detail = 'Erreur à l\'étape ' + report.step + ' : ' + (e?.message || '?');
    report.where = (e?.stack || '').split('\n')[1] || '';
    console.error('[heal-dm]', report.step, e?.message, e?.stack);
    return json(report, 200);
  }
}

// ============================================================================
//  GET /api/admin/diag — diagnostic complet LECTURE SEULE (admin only). v1.1.180
//  Montre la vérité serveur : tous les comptes (même supprimés/fusionnés),
//  toutes les conversations, qui est membre, compteurs de messages, doublons.
//  Aucune modification. ?q= filtre par nom/pseudo/numéro (défaut : récents).
// ============================================================================
async function handleAdminDiag(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !(auth.is_admin || auth.sub === 'kdmc_admin')) {
    return err('Réservé admin', 403, 'forbidden', { auth_sub: auth?.sub || null });
  }
  const DB = env.APEX_CHAT_DB;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const out = { ok: true, q, ts: Date.now(), me: { sub: auth.sub, is_admin: !!auth.is_admin }, totals: {}, users: [], conversations: [] };
  try {
    // Audit 17/09/2026 : la sauvegarde quotidienne dit ici si elle a réussi (et quand)
    try {
      const bk = await DB.prepare("SELECT key, value FROM system_config WHERE key IN ('backup_last_ok','backup_last_error')").all();
      out.backup = {};
      for (const r of (bk.results || [])) { try { out.backup[r.key] = JSON.parse(r.value); } catch (_) { out.backup[r.key] = r.value; } }
    } catch (_) { out.backup = null; }
    out.totals.users = (await DB.prepare('SELECT COUNT(*) c FROM users').first())?.c ?? null;
    out.totals.users_deleted = (await DB.prepare("SELECT COUNT(*) c FROM users WHERE status='deleted'").first())?.c ?? null;
    out.totals.conversations = (await DB.prepare('SELECT COUNT(*) c FROM conversations').first())?.c ?? null;
    out.totals.messages = (await DB.prepare('SELECT COUNT(*) c FROM messages').first())?.c ?? null;

    // 1) Comptes (inclut supprimés/fusionnés pour TOUT voir).
    let users;
    if (q) {
      const like = '%' + q.toLowerCase() + '%';
      const digits = q.replace(/\D/g, '');
      users = (await DB.prepare(
        `SELECT id, pseudo, real_name, first_name, last_name, phone, source, status, merged_into,
                is_admin, last_seen, last_geo_label, last_device_label, created_at
         FROM users
         WHERE LOWER(pseudo) LIKE ? OR LOWER(real_name) LIKE ?
            OR LOWER(COALESCE(first_name,'')) LIKE ? OR LOWER(COALESCE(last_name,'')) LIKE ?
            OR (? != '' AND phone LIKE ?)
         ORDER BY COALESCE(last_seen,0) DESC LIMIT 40`
      ).bind(like, like, like, like, digits, '%' + digits + '%').all()).results || [];
    } else {
      users = (await DB.prepare(
        `SELECT id, pseudo, real_name, first_name, last_name, phone, source, status, merged_into,
                is_admin, last_seen, last_geo_label, last_device_label, created_at
         FROM users ORDER BY COALESCE(last_seen,0) DESC LIMIT 40`
      ).bind().all()).results || [];
    }

    const convIds = new Set();
    for (const u of users) {
      const msgs = (await DB.prepare('SELECT COUNT(*) c FROM messages WHERE sender_id=?').bind(u.id).first())?.c ?? 0;
      const mem = (await DB.prepare('SELECT conv_id, role FROM conversation_members WHERE user_id=?').bind(u.id).all()).results || [];
      mem.forEach(m => convIds.add(m.conv_id));
      out.users.push({
        id: u.id, pseudo: u.pseudo, real_name: u.real_name,
        name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.real_name || null,
        phone: u.phone ? ('…' + String(u.phone).slice(-4)) : null,    // masqué
        phone_norm_tail: normPhone(u.phone || '').replace(/\D/g, '').slice(-8) || null,
        source: u.source, status: u.status || 'active', merged_into: u.merged_into || null,
        is_admin: !!u.is_admin, last_seen: u.last_seen || 0,
        geo: u.last_geo_label || null, device: u.last_device_label || null,
        created_at: u.created_at || 0, messages: msgs,
        member_of: mem.map(m => ({ conv_id: m.conv_id, role: m.role })),
      });
    }

    // 2) Conversations liées à ces comptes (détail membres + messages).
    for (const cid of convIds) {
      const c = await DB.prepare('SELECT id, type, name, archived_at, member_count, last_msg_ts, created_at FROM conversations WHERE id=?').bind(cid).first();
      if (!c) continue;
      const mem = (await DB.prepare('SELECT user_id, role FROM conversation_members WHERE conv_id=?').bind(cid).all()).results || [];
      const members = [];
      for (const m of mem) {
        const mu = await DB.prepare('SELECT pseudo, real_name, status, merged_into FROM users WHERE id=?').bind(m.user_id).first();
        members.push({ id: m.user_id, role: m.role,
          name: (mu && (mu.real_name || mu.pseudo)) || '(inconnu)',
          status: (mu && mu.status) || '?', merged_into: (mu && mu.merged_into) || null });
      }
      const mc = (await DB.prepare('SELECT COUNT(*) c FROM messages WHERE conv_id=?').bind(cid).first())?.c ?? 0;
      out.conversations.push({
        id: c.id, type: c.type, name: c.name || null, archived: !!c.archived_at,
        member_count: c.member_count, members_real: mem.length, messages: mc,
        last_msg_ts: c.last_msg_ts || 0, created_at: c.created_at || 0, members,
      });
    }
    out.conversations.sort((a, b) => (b.last_msg_ts - a.last_msg_ts));

    // 3) Doublons détectés (même nom normalisé OU même fin de numéro) parmi les actifs.
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s\-_.]+/g, ' ').trim();
    const groups = {};
    for (const u of out.users) {
      if (u.status === 'deleted' || u.is_admin) continue;
      // Diagnostic (informatif) : groupe par NOM (même personne), sinon numéro.
      const key = norm(u.real_name) || norm(u.name) || norm(u.pseudo) || u.phone_norm_tail;
      if (!key) continue;
      (groups[key] = groups[key] || []).push(u.id);
    }
    out.duplicates = Object.entries(groups).filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => ({ key, accounts: ids }));

    // 4) CHECKS de délivrabilité (« les messages arrivent-ils au bon destinataire ? »).
    const checks = [];
    for (const d of out.duplicates) {
      checks.push({ level: 'warn', label: 'Comptes en double',
        detail: d.accounts.length + ' comptes pour la même personne (' + d.key + ') → à fusionner.' });
    }
    // DM dont un membre est supprimé SANS redirection → le destinataire ne peut pas
    // s'authentifier → il ne reçoit rien. C'est LA panne « messages n'arrivent pas ».
    for (const c of out.conversations) {
      if (c.type !== 'dm') continue;
      const broken = c.members.filter(m => m.status === 'deleted' && !m.merged_into);
      if (broken.length) {
        checks.push({ level: 'err', label: 'Destinataire injoignable',
          detail: 'Conv ' + c.id.slice(0, 8) + ' : membre supprimé non redirigé (' +
            broken.map(b => b.name).join(', ') + ') → il ne reçoit pas. Le redirect merged_into (v1.1.179) corrige.' });
      }
      if (c.members_real < 2 && !c.archived) {
        checks.push({ level: 'warn', label: 'Conversation incomplète',
          detail: 'Conv ' + c.id.slice(0, 8) + ' : ' + c.members_real + ' membre(s) seulement.' });
      }
    }
    // Plusieurs DM ACTIFS pour la même paire → split (chacun parle dans une instance ≠).
    const pairCount = {};
    for (const c of out.conversations) {
      if (c.type !== 'dm' || c.archived) continue;
      const key = c.members.map(m => m.merged_into || m.id).sort().join('|');
      (pairCount[key] = pairCount[key] || []).push(c.id);
    }
    Object.entries(pairCount).filter(([, ids]) => ids.length > 1).forEach(([, ids]) => {
      checks.push({ level: 'err', label: 'Conversations dupliquées',
        detail: ids.length + ' conversations actives pour la même paire → chacun parle dans une instance différente, rien ne passe. À fusionner en 1.' });
    });
    if (!checks.length) checks.push({ level: 'ok', label: 'Structure saine',
      detail: 'Aucun doublon de compte, aucun destinataire injoignable, 1 conversation par paire.' });
    out.checks = checks;
  } catch (e) {
    out.ok = false;
    out.error = e?.message || '?';
    out.where = (e?.stack || '').split('\n')[1] || '';
  }
  return json(out, 200);
}

// ============================================================================
//  Routes Invitations SMS
// ============================================================================

// 08.10.2026 (revue) — Un compte DÉJÀ ACTIVÉ (connecté au moins une fois, clé
// publiée, ou administrateur) ne doit JAMAIS recevoir de lien de connexion
// fabriqué par quelqu'un d'autre : le lien n'active qu'un compte neuf, une fois.
function _compteActive(u) {
  if (!u) return false;
  if (u.is_admin || u.id === 'kdmc_admin') return true;
  if (u.last_seen && Number(u.last_seen) > 0) return true;
  const k = u.identity_key_pub;
  return !!(k && k !== 'PENDING_PQXDH');
}

async function handleCreateInvitation(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const { phone, name, sent_via } = await readJson(request);
  if (!phone) return err('Numéro requis');
  // Lot 2 (M) : `name.trim()` sur un objet levait → 500.
  if (typeof phone !== 'string' || phone.length > 40 || !_isOptStr(name, 100) || !_isOptStr(sent_via, 40)) {
    return err('Champs invalides', 400, 'bad_fields');
  }

  const config = await getModeConfig(env);
  const maxPerDay = parseInt(config.MAX_INVITATIONS_PER_DAY || '50');

  // Vérifier quota
  const since = Date.now() - 86400000;
  const recent = await env.APEX_CHAT_DB.prepare(
    'SELECT COUNT(*) as c FROM invitations WHERE inviter_id=? AND created_at > ?'
  ).bind(auth.sub, since).first();
  if (recent && recent.c >= maxPerDay) return err(`Limite ${maxPerDay} invitations/jour atteinte`, 429);

  // v1.1.156 (Kevin "que tout le monde puisse inviter depuis son répertoire") :
  // chaque user — pas seulement admin — crée maintenant un vrai magic-token JWT
  // qui pré-autorise l'invité (zero OTP côté destinataire). Aligné avec
  // handleAdminInviteMagic. Le user invité par non-admin reste user normal.
  const normalizedPhone = normPhone(phone);
  const phoneHash = await sha256(normalizedPhone);
  const niceName = (name || '').trim() || 'ami';
  const code = _randomCode(8);
  const expiresAt = Date.now() + 7 * 86400000;

  // Pré-créer le user invité (ou marquer un existant comme authorisé)
  let user = await env.APEX_CHAT_DB.prepare(
    'SELECT id, pseudo, is_admin, last_seen, identity_key_pub FROM users WHERE phone_hash=?'
  ).bind(phoneHash).first();
  const userExisted = !!user;
  if (user && _compteActive(user)) {
    // Compte déjà actif : on le PRÉVIENT (push), on ne fabrique aucun lien de connexion.
    const inv = await env.APEX_CHAT_DB.prepare('SELECT real_name, pseudo FROM users WHERE id=?')
      .bind(auth.sub).first().catch(() => null);
    const who = inv?.real_name || auth.pseudo || 'un ami';
    try {
      await sendPushToUser(user.id, {
        title: '📩 Nouvelle invitation', body: who + ' t\'invite à discuter sur Apex Chat',
        tag: 'invite-' + auth.sub, renotify: true,
        payload: { type: 'invitation', inviter_id: auth.sub, inviter_name: who, ts: Date.now() },
      }, env);
    } catch (e) { console.warn('[invite push]', e.message); }
    const baseUrl0 = env.APEX_CHAT_BASE_URL || '';
    return json({
      ok: true, already_member: true, invited_user_id: user.id,
      magic_url: null, invite_url: baseUrl0 || null,
      sms_template: `Salut ${niceName} ! ${who} t'attend sur Apex Chat : ${baseUrl0}`,
    });
  }
  if (!user) {
    const userId = 'u_' + Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    let safePseudo = niceName.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 18) ||
      ('ami' + Date.now().toString(36).slice(-4));
    const exists = await env.APEX_CHAT_DB.prepare('SELECT 1 FROM users WHERE pseudo=?').bind(safePseudo).first();
    if (exists) safePseudo = safePseudo.slice(0, 12) + '_' + Date.now().toString(36).slice(-4);
    try {
      await env.APEX_CHAT_DB.prepare(
        `INSERT INTO users (id, pseudo, real_name, phone, phone_hash, display_name,
           identity_key_pub, pq_key_pub, prekey_signed,
           admin_authorized, admin_authorized_by, source, invited_by, created_at, updated_at, status)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING_PQXDH', 'PENDING_PQXDH', 'PENDING_PQXDH',
                 1, ?, 'user-invitation', ?, ?, ?, 'active')`
      ).bind(userId, safePseudo, niceName, normalizedPhone, phoneHash, niceName,
             auth.sub, auth.sub, Date.now(), Date.now()).run();
      user = { id: userId, pseudo: safePseudo };
    } catch (e) {
      return err('Création compte invité échouée', 500, 'invite_user_fail', { detail: e.message });
    }
  } else {
    await env.APEX_CHAT_DB.prepare(
      'UPDATE users SET admin_authorized=1, updated_at=? WHERE id=?'
    ).bind(Date.now(), user.id).run().catch(() => {});
  }

  // Magic token JWT (7 jours)
  const magicToken = await signJWT({
    typ: 'magic_invite', uid: user.id, pseudo: user.pseudo, phone_hash: phoneHash,
    invited_by: auth.sub,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 86400
  }, env.JWT_SIGN_KEY);

  await env.APEX_CHAT_DB.prepare(
    `INSERT INTO invitations (code, inviter_id, invitee_phone_hash, sent_via, magic_token, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(code, auth.sub, phoneHash, sent_via || 'contact-picker', magicToken, Date.now(), expiresAt).run();

  const baseUrl = env.APEX_CHAT_BASE_URL || '';
  // Revue 08.10.2026 (A1) : le lien magique (session SANS code au nom de l'invité)
  // n'est PLUS remis à l'inviteur — il pouvait l'ouvrir lui-même et devenir
  // l'invité. L'invité reçoit un lien d'accueil (code court) : la page reconnaît
  // l'invitation et il prouve son numéro par SMS comme tout le monde.
  const shortUrl = `${baseUrl}?i=${code}`;
  const inviterRow = await env.APEX_CHAT_DB.prepare('SELECT real_name, pseudo FROM users WHERE id=?')
    .bind(auth.sub).first().catch(() => null);
  const inviterName = inviterRow?.real_name || auth.pseudo || 'un ami';

  // v1.1.158 Kevin "déjà connu hors ligne → notification push" :
  // Si l'invité existe DÉJÀ côté serveur (compte préexistant, pas juste créé
  // par cet appel), on lui envoie un push notif "📩 X t'invite à discuter".
  // Si c'est un nouveau compte (créé par l'INSERT plus haut), il n'a pas
  // encore de souscription push → on saute (le canal SMS/Share du inviter
  // se charge de la notif initiale).
  if (userExisted && user && user.id) {
    try {
      await sendPushToUser(user.id, {
        title: '📩 Nouvelle invitation',
        body: inviterName + ' t\'invite à discuter sur Apex Chat',
        tag: 'invite-' + auth.sub,
        renotify: true,
        payload: {
          type: 'invitation',
          inviter_id: auth.sub,
          inviter_name: inviterName,
          ts: Date.now()
        }
      }, env);
    } catch (e) { console.warn('[invite push]', e.message); }
  }

  return json({
    ok: true, code, expires_at: expiresAt,
    invite_url: shortUrl,
    invited_user_id: (user && user.id) || null,   // v1.1.217 : pour ouvrir la conv direct depuis la fiche
    sms_template: `Salut ${niceName} ! ${inviterName} t'invite sur Apex Chat (messagerie privée chiffrée) : ${shortUrl}`
  });
}

async function handleResolveInvitation(code, env) {
  const inv = await env.APEX_CHAT_DB.prepare(
    'SELECT i.*, u.pseudo as inviter_pseudo, u.avatar_url as inviter_avatar, u.is_admin as inviter_is_admin FROM invitations i LEFT JOIN users u ON u.id = i.inviter_id WHERE i.code=?'
  ).bind(code).first();
  if (!inv) return err('Invitation invalide', 404);
  if (inv.expires_at < Date.now()) return err('Invitation expirée', 410);
  if (inv.accepted_at) return err('Invitation déjà acceptée', 410);
  // Audit 17/09/2026 (P2) : route sans jeton — on ne renvoie que ce que la page utilise
  // (magic_token, qui invite, avatar), jamais l'empreinte du numéro invité ni les ids internes.
  // Revue 08.10.2026 (A1) : le jeton magique (session sans code) ne sort QUE pour une
  // invitation signée par un admin ; pour une invitation d'utilisateur, l'invité
  // prouve son numéro par SMS (requires_otp).
  const { code: c, inviter_pseudo, inviter_avatar, magic_token, expires_at, sent_via } = inv;
  const adminInvite = !!inv.inviter_is_admin || inv.inviter_id === 'kdmc_admin';
  return json({ ok: true, invitation: {
    code: c, inviter_pseudo, inviter_avatar, expires_at, sent_via,
    magic_token: adminInvite ? magic_token : null,
    requires_otp: !adminInvite,
  } });
}

// ============================================================================
//  Routes Admin (Kevin only)
// ============================================================================

async function handleAdminCommand(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  const { command, params, confirm_token } = await readJson(request);
  const destructive = ['kickUser', 'banUser', 'unbanUser', 'deleteConv', 'exportConv', 'forceLogout'];

  if (destructive.includes(command) && !confirm_token) {
    return err('Confirmation 2-step requise', 400, 'confirm_required');
  }

  let result;
  switch (command) {
    case 'searchAllMessages':
      // Phase 6 : recherche metadata uniquement (Option B respecté)
      result = await env.APEX_CHAT_DB.prepare(
        `SELECT m.id, m.conv_id, m.sender_id, m.ts, m.mime,
                u.pseudo as sender_pseudo, c.name as conv_name
         FROM messages m
         LEFT JOIN users u ON u.id = m.sender_id
         LEFT JOIN conversations c ON c.id = m.conv_id
         WHERE m.ts > ? ORDER BY m.ts DESC LIMIT 100`
      ).bind(Date.now() - (params?.days || 7) * 86400000).all();
      break;

    case 'analyzeUser':
      const user = await env.APEX_CHAT_DB.prepare(
        `SELECT u.*, COUNT(DISTINCT m.id) as msg_count, COUNT(DISTINCT cm.conv_id) as conv_count
         FROM users u LEFT JOIN messages m ON m.sender_id = u.id
         LEFT JOIN conversation_members cm ON cm.user_id = u.id
         WHERE u.id = ? GROUP BY u.id`
      ).bind(params.userId).first();
      const lastSeen = await env.APEX_CHAT_DB.prepare(
        'SELECT MAX(ts) as last_msg FROM messages WHERE sender_id=?'
      ).bind(params.userId).first();
      const devices = await env.APEX_CHAT_DB.prepare(
        'SELECT COUNT(*) as c FROM push_subscriptions WHERE user_id=?'
      ).bind(params.userId).first();
      const signals = await env.APEX_CHAT_DB.prepare(
        'SELECT COUNT(*) as c FROM signalements WHERE target_user_id=?'
      ).bind(params.userId).first();
      result = { user, lastActivity: lastSeen?.last_msg, devices: devices?.c, signalements: signals?.c };
      break;

    case 'broadcastNotif':
      // Envoyer push à tous les users actifs
      const activeUsers = await env.APEX_CHAT_DB.prepare(
        'SELECT id FROM users WHERE status=? AND last_seen > ?'
      ).bind('active', Date.now() - 30 * 86400000).all();
      let sent = 0;
      for (const u of (activeUsers.results || [])) {
        try {
          await sendPushToUser(u.id, {
            title: params.title || '📢 Annonce Apex Chat',
            body: params.body || '',
            data: { admin_broadcast: true }
          }, env);
          sent++;
        } catch (e) {}
      }
      result = { sent, total: (activeUsers.results || []).length };
      break;

    case 'kickUser':
      await env.APEX_CHAT_DB.prepare('DELETE FROM conversation_members WHERE conv_id=? AND user_id=?')
        .bind(params.convId, params.userId).run();
      result = { ok: true };
      break;

    case 'banUser':
      await env.APEX_CHAT_DB.prepare("UPDATE users SET status='suspended' WHERE id=?").bind(params.userId).run();
      result = { ok: true };
      break;

    case 'unbanUser':
      await env.APEX_CHAT_DB.prepare("UPDATE users SET status='active' WHERE id=?").bind(params.userId).run();
      result = { ok: true };
      break;

    case 'exportConv':
      const conv = await env.APEX_CHAT_DB.prepare('SELECT * FROM conversations WHERE id=?').bind(params.convId).first();
      const members = await env.APEX_CHAT_DB.prepare(
        'SELECT * FROM conversation_members WHERE conv_id=?'
      ).bind(params.convId).all();
      const msgs = await env.APEX_CHAT_DB.prepare(
        'SELECT id, sender_id, ts, mime, view_once, expires_at FROM messages WHERE conv_id=? ORDER BY ts ASC LIMIT 10000'
      ).bind(params.convId).all();
      // Stockage R2 export
      const exportKey = `exports/conv_${params.convId}_${Date.now()}.json`;
      const exportData = JSON.stringify({ conv, members: members.results, messages: msgs.results, exported_at: Date.now(), exported_by: auth.sub });
      await env.APEX_CHAT_MEDIA?.put(exportKey, exportData, { httpMetadata: { contentType: 'application/json' } });
      result = { ok: true, export_key: exportKey, msgs_count: (msgs.results || []).length };
      break;

    case 'deleteConv':
      // Soft delete : archive + hide
      await env.APEX_CHAT_DB.prepare('UPDATE conversations SET archived_at=? WHERE id=?')
        .bind(Date.now(), params.convId).run();
      result = { ok: true };
      break;

    case 'forceLogout':
      // v1.1.172 FIX P1 (audit crew) : poser last_force_logout_at = maintenant.
      // getAuthUser (REST) ET ConversationDO.fetch (WS) rejettent désormais tout
      // JWT dont iat < last_force_logout_at → la déconnexion forcée est RÉELLE
      // (REST + WebSocket), plus seulement cosmétique (last_seen=0 ne révoquait rien).
      await env.APEX_CHAT_DB.prepare("UPDATE users SET last_seen=?, last_force_logout_at=? WHERE id=?")
        .bind(0, Date.now(), params.userId).run();
      result = { ok: true };
      break;

    case 'geoTrace':
      // Historique géoloc (réservé Phase 8 — table location_history)
      result = { trace: [], note: 'Géoloc opt-in user only (Phase 8)' };
      break;

    case 'summarizeConv':
      // Phase 6 : metadata count uniquement (contenu chiffré E2E)
      const stats = await env.APEX_CHAT_DB.prepare(
        `SELECT COUNT(*) as msg_count, MIN(ts) as first_ts, MAX(ts) as last_ts,
                COUNT(DISTINCT sender_id) as senders
         FROM messages WHERE conv_id=?`
      ).bind(params.convId).first();
      result = { stats, note: 'Contenu chiffré E2E — impossible serveur. Pour résumé contenu : utiliser ia-worker côté client.' };
      break;

    case 'listSignalements':
      const signRows = await env.APEX_CHAT_DB.prepare(
        `SELECT s.*, u.pseudo as target_pseudo, r.pseudo as reporter_pseudo
         FROM signalements s
         LEFT JOIN users u ON u.id = s.target_user_id
         LEFT JOIN users r ON r.id = s.reporter_id
         WHERE s.status=? ORDER BY s.ts DESC LIMIT 100`
      ).bind(params?.status || 'pending').all();
      result = { signalements: signRows.results || [] };
      break;

    case 'globalStats':
      const totalUsers = await env.APEX_CHAT_DB.prepare("SELECT COUNT(*) as c FROM users WHERE status='active'").first();
      const totalConvs = await env.APEX_CHAT_DB.prepare('SELECT COUNT(*) as c FROM conversations WHERE archived_at IS NULL').first();
      const totalMsgs = await env.APEX_CHAT_DB.prepare('SELECT COUNT(*) as c FROM messages WHERE ts > ?').bind(Date.now() - 86400000).first();
      const onlineNow = await env.APEX_CHAT_DB.prepare('SELECT COUNT(*) as c FROM users WHERE last_seen > ?').bind(Date.now() - 5 * 60000).first();
      result = {
        users: totalUsers?.c || 0,
        active_convs: totalConvs?.c || 0,
        msgs_24h: totalMsgs?.c || 0,
        online_now: onlineNow?.c || 0
      };
      break;

    default:
      return err('Commande inconnue: ' + command, 400);
  }

  await auditLog(env, auth.sub, 'admin_command', 'system', params?.userId || params?.convId || null,
    { command, params }, await sha256(request.headers.get('CF-Connecting-IP') || ''),
    request.headers.get('User-Agent'));

  return json({ ok: true, command, result });
}

// ============================================================================
//  Route system config (lit MODE_CONFIG)
// ============================================================================

async function handleSystemConfig(request, env) {
  const config = await getModeConfig(env);
  // Filtrer flags publics (pas de secrets)
  const publicConfig = {
    ADMIN_MODE: config.ADMIN_MODE,
    AUTH_PROVIDER: config.AUTH_PROVIDER,
    TURN_PROVIDER: config.TURN_PROVIDER,
    MAX_GROUP_SIZE: config.MAX_GROUP_SIZE,
    PREMIUM_PRICE_EUR: config.PREMIUM_PRICE_EUR
  };
  return json({ ok: true, config: publicConfig });
}

// ============================================================================
//  Admin bulk whitelist — colle 1 ou N numéros, tous auto-autorisés + liens magiques
// ============================================================================

export async function handleAdminWhitelistBulk(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  const { entries } = await readJson(request);
  if (!Array.isArray(entries) || entries.length === 0) return err('entries requis (array de {phone, name?})');
  if (entries.length > 100) return err('Max 100 numéros par batch');

  const baseUrl = env.APEX_CHAT_BASE_URL || 'https://9r4rxssx64-creator.github.io/CMCteams/messaging-app/';
  const results = [];

  for (const e of entries) {
    try {
      const phone = String(e.phone || '').replace(/[^\d+]/g, '');
      const name = String(e.name || '').slice(0, 40).trim() || 'Ami';
      if (!phone) { results.push({ phone: e.phone, ok: false, error: 'phone manquant' }); continue; }
      // Normalisation E.164 simple (FR par défaut si commence par 0)
      let normalized = phone;
      if (normalized.startsWith('0') && normalized.length === 10) normalized = '+33' + normalized.slice(1);
      if (!normalized.startsWith('+')) normalized = '+' + normalized;
      if (normalized.length < 10) { results.push({ phone, ok: false, error: 'format invalide' }); continue; }

      const phoneHash = await sha256(normalized);

      // Pré-créer/marquer user admin_authorized=1
      let user = await env.APEX_CHAT_DB.prepare('SELECT id, pseudo FROM users WHERE phone_hash=?').bind(phoneHash).first();
      if (!user) {
        const userId = 'u_' + Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
        let safePseudo = name.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 18) || ('ami' + Date.now().toString(36).slice(-4));
        const exists = await env.APEX_CHAT_DB.prepare('SELECT 1 FROM users WHERE pseudo=?').bind(safePseudo).first();
        if (exists) safePseudo = safePseudo.slice(0, 12) + '_' + Date.now().toString(36).slice(-4);
        await env.APEX_CHAT_DB.prepare(
          `INSERT INTO users (id, pseudo, real_name, phone, phone_hash, display_name,
             identity_key_pub, pq_key_pub, prekey_signed,
             admin_authorized, admin_authorized_by, source, invited_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, '', '', '', 1, ?, 'invitation', ?, ?, ?)`
        ).bind(userId, safePseudo, name, normalized, phoneHash, name, auth.sub, auth.sub, Date.now(), Date.now()).run();
        user = { id: userId, pseudo: safePseudo };
      } else {
        await env.APEX_CHAT_DB.prepare(
          'UPDATE users SET admin_authorized=1, admin_authorized_by=?, updated_at=? WHERE id=?'
        ).bind(auth.sub, Date.now(), user.id).run();
      }

      const magicToken = await signJWT({
        typ: 'magic_invite', uid: user.id, pseudo: user.pseudo, phone_hash: phoneHash,
        invited_by: auth.sub,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 86400
      }, env.JWT_SIGN_KEY);

      const code = _randomCode(8);
      await env.APEX_CHAT_DB.prepare(
        `INSERT INTO invitations (code, inviter_id, invitee_phone_hash, sent_via, magic_token, created_at, expires_at)
         VALUES (?, ?, ?, 'admin-bulk', ?, ?, ?)`
      ).bind(code, auth.sub, phoneHash, magicToken, Date.now(), Date.now() + 7 * 86400000).run();

      results.push({
        ok: true,
        phone: normalized,
        name,
        pseudo: user.pseudo,
        magic_url: `${baseUrl}?magic=${encodeURIComponent(magicToken)}`,
        short_url: `${baseUrl}?i=${code}`,
        sms: `Salut ${name} ! Kevin t'invite sur Apex Chat (messagerie privée chiffrée). Lien direct : ${baseUrl}?magic=${encodeURIComponent(magicToken)}`
      });
    } catch (e) {
      results.push({ phone: e.phone, ok: false, error: e.message });
    }
  }

  await auditLog(env, auth.sub, 'admin_whitelist_bulk', 'batch', null,
    { count: results.length, ok_count: results.filter(r => r.ok).length },
    null, request.headers.get('user-agent') || '');

  return json({ ok: true, count: results.length, results });
}

// ============================================================================
//  Admin invitation bypass — pré-autorise un téléphone (zéro SMS Vonage requis)
// ============================================================================

// Crée une invitation magic link signée par l'admin Kevin.
// L'invitee se connecte via /api/auth/magic-login (pas d'OTP/SMS).
// Pré-créé son user record + ajoute son phone à la whitelist DB pour OTP futur.
export async function handleAdminInviteMagic(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  const { phone, name, pseudo } = await readJson(request);
  if (!phone) return err('Numéro requis');
  const normalizedPhone = String(phone).replace(/[^\d+]/g, '');
  if (!normalizedPhone.startsWith('+') || normalizedPhone.length < 10) {
    return err('Format E.164 attendu (+33...)');
  }

  const phoneHash = await sha256(normalizedPhone);

  // Pré-créer user si pas déjà existant (bypass OTP futur — admin a autorisé)
  let user = await env.APEX_CHAT_DB.prepare(
    'SELECT id, pseudo FROM users WHERE phone_hash=?'
  ).bind(phoneHash).first();

  if (!user) {
    const userId = 'u_' + Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    let safePseudo = (pseudo || name || 'ami').toLowerCase()
      .replace(/[^a-z0-9_-]/g, '').slice(0, 20) || ('ami' + Date.now().toString(36).slice(-4));
    // Garantir unicité du pseudo (collisions = suffixe random)
    let pseudoExists = await env.APEX_CHAT_DB.prepare('SELECT 1 FROM users WHERE pseudo=?').bind(safePseudo).first();
    if (pseudoExists) safePseudo = safePseudo.slice(0, 14) + '_' + Date.now().toString(36).slice(-4);
    await env.APEX_CHAT_DB.prepare(
      `INSERT INTO users (id, pseudo, real_name, phone, phone_hash, display_name,
         identity_key_pub, pq_key_pub, prekey_signed,
         admin_authorized, admin_authorized_by, source, invited_by,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '', '', '', 1, ?, 'invitation', ?, ?, ?)`
    ).bind(userId, safePseudo, name || safePseudo, normalizedPhone, phoneHash, name || safePseudo,
           auth.sub, auth.sub, Date.now(), Date.now()).run();
    user = { id: userId, pseudo: safePseudo };
  } else {
    // User existant : marquer admin_authorized=1 (whitelist OTP)
    await env.APEX_CHAT_DB.prepare(
      'UPDATE users SET admin_authorized=1, admin_authorized_by=?, updated_at=? WHERE id=?'
    ).bind(auth.sub, Date.now(), user.id).run();
  }

  // Magic token signé (JWT court 7j)
  const magicToken = await signJWT({
    typ: 'magic_invite',
    uid: user.id,
    pseudo: user.pseudo,
    phone_hash: phoneHash,
    invited_by: auth.sub,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 86400
  }, env.JWT_SIGN_KEY);

  // Code court pour SMS (utilisable aussi)
  const code = _randomCode(8);
  await env.APEX_CHAT_DB.prepare(
    `INSERT INTO invitations (code, inviter_id, invitee_phone_hash, sent_via, magic_token, created_at, expires_at)
     VALUES (?, ?, ?, 'admin-bypass', ?, ?, ?)`
  ).bind(code, auth.sub, phoneHash, magicToken, Date.now(), Date.now() + 7 * 86400000).run();

  await auditLog(env, auth.sub, 'admin_invite_magic', 'user', user.id,
    { phone_last4: normalizedPhone.slice(-4), pseudo: user.pseudo },
    null, request.headers.get('user-agent') || '');

  const baseUrl = env.APEX_CHAT_BASE_URL || 'https://9r4rxssx64-creator.github.io/CMCteams/messaging-app/';
  return json({
    ok: true,
    code,
    user_id: user.id,
    pseudo: user.pseudo,
    magic_url: `${baseUrl}?magic=${encodeURIComponent(magicToken)}`,
    short_url: `${baseUrl}?i=${code}`,
    expires_at: Date.now() + 7 * 86400000,
    sms_template: `Salut ${name || ''} ! Kevin t'invite sur Apex Chat (messagerie privée). Lien direct : ${baseUrl}?magic=${encodeURIComponent(magicToken)}`
  });
}

// Auth via magic link (pas d'OTP requis — admin a pré-autorisé)
export async function handleMagicLogin(request, env) {
  const { magic_token } = await readJson(request);
  if (!magic_token) return err('Token requis');

  const payload = await verifyJWT(magic_token, env.JWT_SIGN_KEY);
  if (!payload || payload.typ !== 'magic_invite') return err('Token invalide', 401);

  // Revue 08.10.2026 (A1) : seule une invitation signée par un ADMIN ouvre une
  // session sans code. Une invitation d'utilisateur pré-crée le compte, mais
  // l'invité prouve son numéro par SMS (sinon l'inviteur pouvait ouvrir le lien
  // lui-même et devenir l'invité).
  let inviterIsAdmin = payload.invited_by === 'kdmc_admin';
  if (!inviterIsAdmin && payload.invited_by) {
    try {
      const inviter = await env.APEX_CHAT_DB.prepare('SELECT is_admin FROM users WHERE id=?').bind(payload.invited_by).first();
      inviterIsAdmin = !!(inviter && inviter.is_admin);
    } catch (_) { inviterIsAdmin = false; }
  }
  if (!inviterIsAdmin) return err('Cette invitation demande une vérification par SMS : entre ton numéro.', 403, 'magic_requires_otp');

  const user = await env.APEX_CHAT_DB.prepare(
    'SELECT id, pseudo, display_name, avatar_url, admin_authorized, is_admin, last_seen, identity_key_pub FROM users WHERE id=?'
  ).bind(payload.uid).first();
  if (!user || !user.admin_authorized) return err('User non autorisé', 403);
  // 08.10.2026 (revue) : le lien n'active qu'un compte NEUF — jamais un compte
  // déjà utilisé (sinon quiconque fabrique une invitation prend le compte).
  if (_compteActive(user)) return err('Ce compte est déjà actif : connecte-toi normalement.', 403, 'magic_account_active');

  // Usage UNIQUE, révocable : l'invitation doit exister, ne pas être expirée,
  // et être consommée ICI de façon atomique (une seule requête gagne).
  let consumed = null;
  try {
    consumed = await env.APEX_CHAT_DB.prepare(
      'UPDATE invitations SET accepted_at=? WHERE magic_token=? AND accepted_at IS NULL AND (expires_at IS NULL OR expires_at > ?)'
    ).bind(Date.now(), magic_token, Date.now()).run();
  } catch (_) { consumed = null; }
  if (!consumed || !consumed.meta || consumed.meta.changes !== 1) {
    return err('Lien déjà utilisé ou expiré', 401, 'magic_used');
  }

  // Émettre session JWT 30j
  const sessionJWT = await signJWT({
    sub: user.id,
    pseudo: user.pseudo,
    is_admin: false,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 86400
  }, env.JWT_SIGN_KEY);

  await auditLog(env, user.id, 'magic_login_success', 'user', user.id,
    { invited_by: payload.invited_by },
    null, request.headers.get('user-agent') || '');
  await captureConnection(env, request, user);

  return json({
    ok: true,
    jwt: sessionJWT,
    user: { id: user.id, pseudo: user.pseudo, display_name: user.display_name, avatar_url: user.avatar_url }
  });
}

// ============================================================================
//  Admin all-users — TOUS les comptes créés (paginé + filtres)
// ============================================================================

// GET /api/contacts — v1.1.196. Contacts pour TOUT utilisateur authentifié
// (PAS admin only). Laurence appelait /api/admin/all-users → 403 « Admin requis »
// → 0 contact. Ici : les pairs CANONIQUES de ses conversations + TOUJOURS Kevin
// (cercle privé) ; et si admin, aussi tous les comptes actifs. Plus de 403.
async function handleContacts(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401, 'unauthenticated');
  const DB = env.APEX_CHAT_DB;
  const me = auth.sub;
  const ids = new Set();
  // 1) Pairs des conversations (non archivées) du user.
  try {
    const rows = (await DB.prepare(
      `SELECT DISTINCT m2.user_id AS uid
         FROM conversation_members m1
         JOIN conversation_members m2 ON m2.conv_id = m1.conv_id AND m2.user_id != m1.user_id
         JOIN conversations c ON c.id = m1.conv_id
        WHERE m1.user_id = ? AND c.archived_at IS NULL`
    ).bind(me).all()).results || [];
    for (const r of rows) {
      const cid = await _canonicalId(DB, r.uid);
      if (cid && cid !== me) ids.add(cid);
    }
  } catch (_) {}
  // 2) Kevin (kdmc_admin) TOUJOURS dans les contacts (cercle privé Kevin↔proches).
  if (me !== 'kdmc_admin') ids.add('kdmc_admin');
  // 3) Admin : voit aussi tous les comptes actifs.
  if (auth.is_admin) {
    try {
      const all = (await DB.prepare(
        "SELECT id FROM users WHERE (is_banned=0 OR is_banned IS NULL) AND status != 'deleted' AND (source IS NULL OR source != 'e2e-test')"
      ).all()).results || [];
      for (const r of all) if (r.id !== me) ids.add(r.id);
    } catch (_) {}
  }
  // Charge les profils (exclut supprimés/fusionnés ET comptes de test E2E Alice/Bob).
  const users = [];
  for (const id of ids) {
    const u = await DB.prepare(
      `SELECT id, pseudo, real_name, display_name, phone, avatar_url, last_seen, status, merged_into, source
         FROM users WHERE id=?`
    ).bind(id).first().catch(() => null);
    if (u && u.status !== 'deleted' && !u.merged_into && u.source !== 'e2e-test') {
      // Revue 08.10.2026 : le numéro de téléphone d'un contact n'est montré qu'à
      // l'admin (comme /api/contact/:id). Avant, tout membre recevait les numéros
      // de tous ses pairs ET celui de Kevin.
      if (!auth.is_admin) delete u.phone;
      users.push(u);
    }
  }
  // v1.1.201 — alias d'affichage PAR utilisateur (contacts.nickname) : Kevin peut
  // renommer un contact pour SA vue (« pseudo pour affichage au lieu du nom »).
  try {
    const nicks = (await DB.prepare('SELECT contact_id, nickname FROM contacts WHERE user_id=?').bind(me).all()).results || [];
    const map = {};
    for (const n of nicks) if (n.nickname) map[n.contact_id] = n.nickname;
    for (const u of users) if (map[u.id]) u.nickname = map[u.id];
  } catch (_) { /* table contacts absente → pas d'alias, non bloquant */ }
  users.sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0));
  return json({ ok: true, count: users.length, users });
}

// GET /api/contact/:id — v1.1.201. Fiche de renseignement complète d'un contact.
// Admin : tous les champs de n'importe qui. Non-admin : seulement un contact
// qu'il connaît (conv partagée OU soi-même OU Kevin), champs publics + son alias.
async function handleGetContact(id, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401, 'unauthenticated');
  const DB = env.APEX_CHAT_DB;
  const cid = await _canonicalId(DB, id);
  // Autorisation non-admin : soi-même, Kevin, ou un pair de conversation.
  let allowed = auth.is_admin || cid === auth.sub || cid === 'kdmc_admin';
  if (!allowed) {
    const shared = await DB.prepare(
      `SELECT 1 FROM conversation_members a JOIN conversation_members b ON a.conv_id=b.conv_id
        WHERE a.user_id=? AND b.user_id=? LIMIT 1`
    ).bind(auth.sub, cid).first().catch(() => null);
    allowed = !!shared;
  }
  if (!allowed) return err('Accès refusé à cette fiche', 403, 'forbidden');
  const adminFields = auth.is_admin
    ? ', phone, email, address, city, country, job, birth_date, last_lat, last_lng, last_geo_label, last_device_label, last_ip_hash, source, status, is_banned, admin_authorized, premium_plan, premium_until, created_at, updated_at, invited_by'
    : '';
  const u = await DB.prepare(
    `SELECT id, pseudo, real_name, display_name, first_name, last_name, avatar_url, bio,
            language, timezone, last_seen${adminFields}
       FROM users WHERE id=?`
  ).bind(cid).first().catch(() => null);
  if (!u) return err('Contact introuvable', 404, 'not_found', { id, canonical: cid });
  // Alias que MOI (caller) ai donné à ce contact.
  try {
    const n = await DB.prepare('SELECT nickname FROM contacts WHERE user_id=? AND contact_id=?').bind(auth.sub, cid).first();
    u.my_nickname = (n && n.nickname) || '';
  } catch (_) { u.my_nickname = ''; }
  u.can_edit = !!(auth.is_admin || cid === auth.sub);
  u.can_delete = !!(auth.is_admin && cid !== auth.sub && cid !== 'kdmc_admin');
  return json({ ok: true, contact: u });
}

// PATCH /api/contact/:id — v1.1.201. Modifier la fiche. Admin : n'importe qui.
// (Le user édite SA fiche via /api/users/me ; le pseudo est choisi par le client.)
async function handleUpdateContact(id, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401, 'unauthenticated');
  const DB = env.APEX_CHAT_DB;
  const cid = await _canonicalId(DB, id);
  if (!auth.is_admin && cid !== auth.sub) return err('Réservé admin (ou ta propre fiche)', 403, 'forbidden');
  const body = await request.json().catch(() => ({}));
  const ALLOWED = ['display_name', 'first_name', 'last_name', 'real_name', 'email', 'bio',
    'address', 'city', 'country', 'job', 'birth_date', 'language', 'timezone', 'pseudo', 'avatar_url'];
  // Lot 2 (S) : même règle de pseudo qu'à l'inscription (tiret accepté).
  if (body.pseudo !== undefined && !PSEUDO_RE.test(String(body.pseudo).trim())) {
    return err('Pseudo invalide (3-20, lettres/chiffres/_/-)', 400, 'pseudo_invalid');
  }
  // Lot 2 (S) : avatar_url validé comme POST /api/users/me/avatar.
  const av = _checkAvatarUrl(body.avatar_url);
  if (av.error) return av.error;
  const sets = [], args = [];
  for (const k of ALLOWED) if (body[k] !== undefined) {
    sets.push(`${k}=?`);
    args.push(k === 'avatar_url' ? av.value : String(body[k] || '').slice(0, 500));
  }
  if (!sets.length) return err('Aucun champ à mettre à jour', 400, 'no_fields');
  sets.push('updated_at=?'); args.push(Date.now()); args.push(cid);
  try {
    await DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id=?`).bind(...args).run();
  } catch (e) {
    const msg = String(e?.message || '');
    if (/UNIQUE.*pseudo|pseudo.*UNIQUE/i.test(msg)) return err('Pseudo déjà pris', 409, 'pseudo_taken', { detail: msg });
    return err('Échec mise à jour fiche', 500, 'update_failed', { detail: msg });
  }
  try { await auditLog(env, auth.sub, 'contact_update', 'user', cid, { fields: Object.keys(body) }, null, request.headers.get('user-agent') || ''); } catch (_) {}
  const user = await DB.prepare('SELECT * FROM users WHERE id=?').bind(cid).first();
  return json({ ok: true, user });
}

// DELETE /api/contact/:id — v1.1.201. Admin uniquement. Soft-delete + libère le
// numéro (UNIQUE) pour ne pas bloquer une ré-inscription. Jamais soi/kdmc_admin.
async function handleDeleteContact(id, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403, 'forbidden');
  const DB = env.APEX_CHAT_DB;
  const cid = await _canonicalId(DB, id);
  if (cid === auth.sub || cid === 'kdmc_admin') return err('Impossible de supprimer ce compte', 400, 'protected');
  const u = await DB.prepare('SELECT id, phone, pseudo FROM users WHERE id=?').bind(cid).first().catch(() => null);
  if (!u) return err('Contact introuvable', 404, 'not_found');
  const now = Date.now();
  try {
    await DB.prepare("UPDATE users SET status='deleted', phone=?, updated_at=? WHERE id=?")
      .bind('deleted_' + cid, now, cid).run();
    await DB.prepare('DELETE FROM conversation_members WHERE user_id=?').bind(cid).run().catch(() => {});
    await auditLog(env, auth.sub, 'contact_delete', 'user', cid, { pseudo: u.pseudo }, null, request.headers.get('user-agent') || '');
  } catch (e) {
    return err('Échec suppression', 500, 'delete_failed', { detail: String(e?.message || '') });
  }
  return json({ ok: true, deleted: cid });
}

// PUT /api/contact/:id/nickname — v1.1.201. Alias d'affichage que LE CALLER donne
// à ce contact (par-utilisateur). Vide = effacer l'alias.
async function handleSetNickname(id, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401, 'unauthenticated');
  const DB = env.APEX_CHAT_DB;
  const cid = await _canonicalId(DB, id);
  const body = await request.json().catch(() => ({}));
  const nickname = String(body.nickname || '').trim().slice(0, 60);
  try {
    if (!nickname) {
      await DB.prepare('UPDATE contacts SET nickname=NULL WHERE user_id=? AND contact_id=?').bind(auth.sub, cid).run();
    } else {
      await DB.prepare(
        `INSERT INTO contacts (user_id, contact_id, nickname, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, contact_id) DO UPDATE SET nickname=excluded.nickname`
      ).bind(auth.sub, cid, nickname, Date.now()).run();
    }
  } catch (e) {
    return err('Échec alias', 500, 'nickname_failed', { detail: String(e?.message || '') });
  }
  return json({ ok: true, nickname });
}

async function handleAdminAllUsers(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'all'; // all | banned | active | online | admin
  const search = (url.searchParams.get('q') || '').toLowerCase().trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

  let sql = `SELECT id, pseudo, real_name, display_name, phone, avatar_url,
              created_at, last_seen, is_admin, is_banned, admin_authorized,
              last_ip_hash, last_user_agent, last_lat, last_lng, last_geo_label,
              last_device_label, premium_until, source, invited_by, status
            FROM users WHERE 1=1 AND (source IS NULL OR source != 'e2e-test')`;
  const args = [];
  if (filter === 'banned') sql += ' AND is_banned=1';
  else if (filter === 'active') sql += ' AND (is_banned=0 OR is_banned IS NULL)';
  else if (filter === 'online') { sql += ' AND last_seen > ?'; args.push(Date.now() - 30 * 60 * 1000); }
  else if (filter === 'admin') sql += ' AND is_admin=1';
  if (search) {
    sql += ' AND (LOWER(pseudo) LIKE ? OR LOWER(real_name) LIKE ? OR phone LIKE ?)';
    args.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
  }
  sql += ' ORDER BY last_seen DESC NULLS LAST, created_at DESC LIMIT ?';
  args.push(limit);

  const r = await env.APEX_CHAT_DB.prepare(sql).bind(...args).all();
  const users = r.results || [];

  // Compter conv par user (best-effort)
  for (const u of users) {
    const c = await env.APEX_CHAT_DB.prepare('SELECT COUNT(*) as c FROM conversation_members WHERE user_id=?')
      .bind(u.id).first().catch(() => ({ c: 0 }));
    u.conv_count = c?.c || 0;
    // Masquer phone partiel pour audit (4 derniers chiffres)
    if (u.phone) u.phone_last4 = String(u.phone).slice(-4);
  }

  return json({ ok: true, count: users.length, users });
}

// Block / Unblock / Delete user
async function handleAdminUserAction(userId, action, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);
  if (userId === auth.sub) return err('Impossible d\'agir sur ton propre compte admin', 400);

  let result = { ok: true };
  if (action === 'block' || action === 'ban') {
    await env.APEX_CHAT_DB.prepare('UPDATE users SET is_banned=1, updated_at=?, status=? WHERE id=?')
      .bind(Date.now(), 'suspended', userId).run();
    result.message = 'Utilisateur bloqué';
  } else if (action === 'unblock' || action === 'unban') {
    await env.APEX_CHAT_DB.prepare('UPDATE users SET is_banned=0, updated_at=?, status=? WHERE id=?')
      .bind(Date.now(), 'active', userId).run();
    result.message = 'Utilisateur réautorisé';
  } else if (action === 'authorize') {
    await env.APEX_CHAT_DB.prepare('UPDATE users SET admin_authorized=1, admin_authorized_by=?, updated_at=? WHERE id=?')
      .bind(auth.sub, Date.now(), userId).run();
    result.message = 'Whitelist activée';
  } else if (action === 'revoke') {
    await env.APEX_CHAT_DB.prepare('UPDATE users SET admin_authorized=0, updated_at=? WHERE id=?')
      .bind(Date.now(), userId).run();
    result.message = 'Whitelist révoquée';
  } else if (action === 'force_logout') {
    // Invalidate JWT en stockant timestamp logout forcé (à vérifier dans getAuthUser ensuite si on l'implémente)
    await env.APEX_CHAT_DB.prepare('UPDATE users SET updated_at=?, last_force_logout_at=? WHERE id=?')
      .bind(Date.now(), Date.now(), userId).run().catch(() => {});
    result.message = 'Déconnexion forcée';
  } else if (action === 'delete') {
    // Soft delete (status=deleted)
    await env.APEX_CHAT_DB.prepare('UPDATE users SET status=?, is_banned=1, updated_at=? WHERE id=?')
      .bind('deleted', Date.now(), userId).run();
    result.message = 'Compte supprimé (soft)';
  } else {
    return err('Action inconnue: ' + action, 400);
  }

  await auditLog(env, auth.sub, 'admin_user_' + action, 'user', userId,
    { action },
    null, request.headers.get('user-agent') || '');

  return json(result);
}

// ============================================================================
//  Admin timeline per-user — historique COMPLET (audit + activité + invitations + signalements)
// ============================================================================

async function handleAdminUserTimeline(userId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const since = parseInt(url.searchParams.get('since') || '0') || (Date.now() - 90 * 86400000); // 90j par défaut

  // 1. Audit log (login, actions, modifications) — paginé
  const audit = await env.APEX_CHAT_DB.prepare(
    `SELECT id, action, target_type, target_id, details, ts, ip_hash, user_agent
     FROM audit_log
     WHERE (actor_id=? OR target_id=?) AND ts >= ?
     ORDER BY ts DESC LIMIT ? OFFSET ?`
  ).bind(userId, userId, since, limit, offset).all().catch(() => ({ results: [] }));

  // 2. User activity (geoloc + device history) — paginé
  const activity = await env.APEX_CHAT_DB.prepare(
    `SELECT id, ts, ip_hash, user_agent, lat, lng, geo_label, action
     FROM user_activity WHERE user_id=? AND ts >= ?
     ORDER BY ts DESC LIMIT ? OFFSET ?`
  ).bind(userId, since, limit, offset).all().catch(() => ({ results: [] }));

  // 3. Invitations envoyées par lui ou pour lui
  const invitations = await env.APEX_CHAT_DB.prepare(
    `SELECT code, inviter_id, invitee_phone_hash, sent_via, accepted_at, created_at, expires_at
     FROM invitations
     WHERE (inviter_id=? OR invitee_phone_hash=(SELECT phone_hash FROM users WHERE id=?))
       AND created_at >= ?
     ORDER BY created_at DESC LIMIT 50`
  ).bind(userId, userId, since).all().catch(() => ({ results: [] }));

  // 4. Signalements (faits OU reçus)
  const signalements = await env.APEX_CHAT_DB.prepare(
    `SELECT id, reporter_id, target_user_id, reason, status, ts as created_at
     FROM signalements
     WHERE (reporter_id=? OR target_user_id=?) AND ts >= ?
     ORDER BY ts DESC LIMIT 50`
  ).bind(userId, userId, since).all().catch(() => ({ results: [] }));

  // 5. Conversations metadata (NO message content car E2E)
  const convs = await env.APEX_CHAT_DB.prepare(
    `SELECT c.id, c.type, c.name, c.created_at, c.last_msg_ts, c.member_count
     FROM conversations c
     INNER JOIN conversation_members cm ON cm.conv_id=c.id
     WHERE cm.user_id=?
     ORDER BY c.last_msg_ts DESC LIMIT 100`
  ).bind(userId).all().catch(() => ({ results: [] }));

  // 6. User metadata
  const user = await env.APEX_CHAT_DB.prepare(
    `SELECT id, pseudo, real_name, phone, last_seen, created_at, is_admin, is_banned,
            admin_authorized, last_geo_label, last_device_label
     FROM users WHERE id=?`
  ).bind(userId).first();

  await auditLog(env, auth.sub, 'admin_view_timeline', 'user', userId,
    { limit, since }, null, request.headers.get('user-agent') || '');

  return json({
    ok: true,
    user,
    timeline: {
      audit: audit.results || [],
      activity: activity.results || [],
      invitations: invitations.results || [],
      signalements: signalements.results || [],
      conversations: convs.results || []
    }
  });
}

// Liste conversations d'un user (admin)
async function handleAdminUserConvs(userId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);
  const convs = await env.APEX_CHAT_DB.prepare(
    `SELECT c.id, c.type, c.name, c.description, c.created_at, c.last_msg_ts, c.member_count,
            c.disappearing_seconds, c.archived_at,
            (SELECT COUNT(*) FROM messages WHERE conv_id=c.id) as msg_count
     FROM conversations c
     INNER JOIN conversation_members cm ON cm.conv_id=c.id
     WHERE cm.user_id=?
     ORDER BY c.last_msg_ts DESC LIMIT 100`
  ).bind(userId).all().catch(() => ({ results: [] }));
  return json({ ok: true, conversations: convs.results || [] });
}

// Recherche globale admin (metadata uniquement — E2E protège le contenu)
export async function handleAdminSearch(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const scope = url.searchParams.get('scope') || 'all'; // users | audit | invitations | signalements
  if (q.length < 2) return err('Query >= 2 chars');

  const like = '%' + q.toLowerCase() + '%';
  const out = { ok: true, q, results: {} };

  if (scope === 'all' || scope === 'users') {
    const r = await env.APEX_CHAT_DB.prepare(
      `SELECT id, pseudo, real_name, phone, last_seen FROM users
       WHERE LOWER(pseudo) LIKE ? OR LOWER(real_name) LIKE ? OR phone LIKE ?
       LIMIT 30`
    ).bind(like, like, like).all().catch(() => ({ results: [] }));
    out.results.users = r.results || [];
  }
  if (scope === 'all' || scope === 'audit') {
    const r = await env.APEX_CHAT_DB.prepare(
      `SELECT id, actor_id, action, target_type, target_id, details, ts FROM audit_log
       WHERE LOWER(action) LIKE ? OR LOWER(details) LIKE ?
       ORDER BY ts DESC LIMIT 50`
    ).bind(like, like).all().catch(() => ({ results: [] }));
    out.results.audit = r.results || [];
  }
  if (scope === 'all' || scope === 'invitations') {
    const r = await env.APEX_CHAT_DB.prepare(
      `SELECT code, inviter_id, sent_via, created_at, accepted_at FROM invitations
       WHERE code LIKE ? ORDER BY created_at DESC LIMIT 30`
    ).bind(q.toUpperCase() + '%').all().catch(() => ({ results: [] }));
    out.results.invitations = r.results || [];
  }
  if (scope === 'all' || scope === 'signalements') {
    const r = await env.APEX_CHAT_DB.prepare(
      `SELECT id, reporter_id, target_user_id, reason, status, ts as created_at FROM signalements
       WHERE LOWER(reason) LIKE ? ORDER BY ts DESC LIMIT 30`
    ).bind(like).all().catch(() => ({ results: [] }));
    out.results.signalements = r.results || [];
  }

  return json(out);
}

// ============================================================================
//  Admin map — TOUS users avec dernières positions + historique récent
// ============================================================================

async function handleAdminMap(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  // Users avec last_lat/lng connues (limité à 200 max actifs)
  const users = await env.APEX_CHAT_DB.prepare(
    `SELECT id, pseudo, real_name, last_seen, last_lat, last_lng, last_geo_label,
            last_device_label, is_admin, is_banned
     FROM users
     WHERE last_lat IS NOT NULL AND last_lng IS NOT NULL
     ORDER BY last_seen DESC LIMIT 200`
  ).all().catch(() => ({ results: [] }));

  return json({
    ok: true,
    count: (users.results || []).length,
    users: users.results || [],
    server_ts: Date.now()
  });
}

async function handleAdminUserGeoHistory(userId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);
  const url = new URL(request.url);
  const days = Math.min(parseInt(url.searchParams.get('days') || '7'), 30);
  const since = Date.now() - days * 86400000;

  const rows = await env.APEX_CHAT_DB.prepare(
    `SELECT ts, lat, lng, geo_label, user_agent FROM user_activity
     WHERE user_id=? AND ts >= ? AND lat IS NOT NULL AND lng IS NOT NULL
     ORDER BY ts ASC LIMIT 500`
  ).bind(userId, since).all().catch(() => ({ results: [] }));

  return json({ ok: true, points: rows.results || [], days });
}

// ============================================================================
//  Admin live users — liste users connectés + geoloc + devices
// ============================================================================

async function handleAdminLiveUsers(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  const since = Date.now() - 30 * 60 * 1000; // 30 min = "live"
  const users = await env.APEX_CHAT_DB.prepare(
    `SELECT u.id, u.pseudo, u.display_name, u.avatar_url, u.last_seen, u.last_ip_hash,
            u.last_user_agent, u.last_lat, u.last_lng, u.last_geo_label, u.created_at,
            u.admin_authorized, u.is_banned
     FROM users u
     WHERE u.last_seen > ?
     ORDER BY u.last_seen DESC
     LIMIT 200`
  ).bind(since).all();

  // Compter conversations actives par user
  const list = users.results || [];
  for (const u of list) {
    const conv = await env.APEX_CHAT_DB.prepare(
      'SELECT COUNT(*) as c FROM conversation_members WHERE user_id=?'
    ).bind(u.id).first().catch(() => ({ c: 0 }));
    u.conv_count = conv.c || 0;
  }

  return json({ ok: true, count: list.length, users: list });
}

// ============================================================================
//  Admin toggles — features ON/OFF (general + per-user)
// ============================================================================

async function handleAdminGetToggles(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  const config = await getModeConfig(env);
  // Tous les flags features sont stockés dans system_config (key/value)
  const FEATURE_KEYS = ADMIN_FEATURE_KEYS;

  const toggles = {};
  for (const key of FEATURE_KEYS) {
    const v = config['FEATURE_' + key.toUpperCase()];
    toggles[key] = v === undefined ? true : (v === 'true' || v === '1' || v === true);
  }
  // Audit 17/09/2026 (P1) : ces deux interrupteurs affichaient « ON » par défaut sans
  // rien piloter. kevin_invisible reflète le drapeau réellement lu (KEVIN_INVISIBLE_ADMIN,
  // 'false' en prod) ; e2e_strict est OFF tant qu'il n'a pas été activé explicitement
  // (il est désormais appliqué par le ConversationDO quand il est ON).
  toggles.kevin_invisible = config.KEVIN_INVISIBLE_ADMIN === 'true';
  toggles.e2e_strict = config.FEATURE_E2E_STRICT === 'true' || config.FEATURE_E2E_STRICT === '1';
  return json({ ok: true, toggles });
}

export async function handleAdminSetToggle(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || !auth.is_admin) return err('Admin requis', 403);

  const { feature, enabled, user_id } = await readJson(request);
  if (!feature) return err('feature requis');

  if (user_id) {
    // Per-user toggle
    await env.APEX_CHAT_DB.prepare(
      `INSERT INTO user_feature_overrides (user_id, feature, enabled, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, feature) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at, updated_by=excluded.updated_by`
    ).bind(user_id, feature, enabled ? 1 : 0, Date.now(), auth.sub).run();
  } else {
    // Global toggle
    // kevin_invisible pilote le drapeau réellement lu par le code (KEVIN_INVISIBLE_ADMIN)
    const key = feature === 'kevin_invisible' ? 'KEVIN_INVISIBLE_ADMIN' : 'FEATURE_' + feature.toUpperCase();
    await env.APEX_CHAT_DB.prepare(
      `INSERT INTO system_config (key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by`
    ).bind(key, String(!!enabled), Date.now(), auth.sub).run();
  }

  await auditLog(env, auth.sub, 'admin_toggle_set', user_id ? 'user' : 'global', user_id || feature,
    { feature, enabled, user_id },
    null, request.headers.get('user-agent') || '');

  return json({ ok: true });
}

// ============================================================================
//  WebSocket → ConversationDO
// ============================================================================

// POST /api/auth/ws-ticket — échange le jeton de session (header Bearer, qui
// lui ne voyage JAMAIS dans une URL) contre un ticket à usage unique valable
// 60 s, destiné à l'URL du WebSocket. Audit P2a (v1.1.286).
async function handleWsTicket(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();
  const ticket = await signJWT(
    { sub: auth.sub, typ: 'wstkt', jti, iat: now, exp: now + 60 },
    env.JWT_SIGN_KEY
  );
  return json({ ok: true, ticket, exp: (now + 60) * 1000 });
}

// POST /api/auth/media-ticket — même principe que le ticket WebSocket, mais
// RÉUTILISABLE pendant 5 min : une photo est relue à chaque affichage (aperçu,
// plein écran, re-rendu), donc un ticket à usage unique la casserait. Il ne
// vaut que sur la route des médias. Audit P2c (v1.1.288).
async function handleMediaTicket(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  const now = Math.floor(Date.now() / 1000);
  const ticket = await signJWT({ sub: auth.sub, typ: 'mtkt', iat: now, exp: now + 300 }, env.JWT_SIGN_KEY);
  return json({ ok: true, ticket, exp: (now + 300) * 1000 });
}

async function handleWsConversation(convId, request, env) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') return err('Upgrade WebSocket requis', 426);

  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // Vérifier membership
  const member = await env.APEX_CHAT_DB.prepare(
    'SELECT * FROM conversation_members WHERE conv_id=? AND user_id=?'
  ).bind(convId, auth.sub).first();
  if (!member) return err('Pas membre de cette conv', 403);

  const conv = await env.APEX_CHAT_DB.prepare('SELECT sharded_to_do FROM conversations WHERE id=?').bind(convId).first();
  if (!conv) return err('Conv introuvable', 404);

  const doStub = env.CONVERSATION_DO.get(env.CONVERSATION_DO.idFromName(conv.sharded_to_do));
  // 08.10.2026 — l'app à jour arrive avec ?ticket= (usage unique, déjà consommé
  // ci-dessus par getAuthUser). Le Durable Object ne lit que ?token= : on lui
  // transmet donc un jeton INTERNE court (60 s), signé ici, au nom de
  // l'utilisateur DÉJÀ vérifié — jamais le ticket ni le jeton de session.
  // Et la conversation est celle du CHEMIN (vérifiée), pas un ?conv= choisi par le client.
  const fwd = new URL(request.url);
  fwd.searchParams.delete('ticket');
  const now = Math.floor(Date.now() / 1000);
  fwd.searchParams.set('token', await signJWT(
    { sub: auth.sub, typ: 'wsfwd', iat: now, exp: now + 60 }, env.JWT_SIGN_KEY));
  fwd.searchParams.set('uid', auth.sub);
  fwd.searchParams.set('conv', convId);
  return doStub.fetch(new Request(fwd.toString(), request));
}

// GET /api/conversations/:id/ws-diag — reproduit les checks du WS et renvoie
// la cause EXACTE en JSON (le WebSocket ne révèle qu'un code 1006 opaque).
// Le token peut venir du header OU de ?token= (comme le WS).
async function handleWsDiag(convId, request, env) {
  const result = { ok: false, convId, step: 'auth' };
  try {
    const auth = await getAuthUser(request, env);
    result.authenticated = !!auth;
    if (!auth) {
      result.cause = 'auth_failed';
      result.detail = 'Token rejeté (getAuthUser=null). JWT périmé, signature invalide, ou ?token= absent.';
      return json(result, 200);
    }
    result.userId = auth.sub;
    result.step = 'conv_lookup';
    const conv = await env.APEX_CHAT_DB.prepare(
      'SELECT id, type, sharded_to_do FROM conversations WHERE id=?'
    ).bind(convId).first();
    result.convExists = !!conv;
    if (!conv) {
      result.cause = 'conv_not_found';
      result.detail = 'Conversation absente côté serveur (jamais créée / locale uniquement).';
      return json(result, 200);
    }
    result.step = 'membership';
    const member = await env.APEX_CHAT_DB.prepare(
      'SELECT role FROM conversation_members WHERE conv_id=? AND user_id=?'
    ).bind(convId, auth.sub).first();
    result.isMember = !!member;
    if (!member) {
      result.cause = 'not_member';
      result.detail = 'Utilisateur pas membre de cette conversation côté serveur.';
      return json(result, 200);
    }
    result.ok = true;
    result.cause = 'ok';
    result.detail = 'Tous les checks WS passent — le temps réel devrait fonctionner.';
    return json(result, 200);
  } catch (e) {
    console.error('[ws-diag]', result.step, e.message, e.stack);
    result.cause = 'exception';
    result.detail = 'Erreur serveur à l\'étape ' + result.step + ' : ' + e.message;
    return json(result, 200);
  }
}

// ============================================================================
//  Phase 4 — Groupes, communautés, channels (membership + stories + polls)
// ============================================================================

export async function handleAddMember(convId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const { user_id, role } = await readJson(request);
  if (!user_id) return err('user_id requis');
  if (typeof user_id !== 'string' || user_id.length > 128) return err('user_id invalide', 400, 'bad_user_id');
  // Lot 2 (B) : le rôle était libre — un admin pouvait inscrire quelqu'un comme
  // « owner » (ou tout autre texte). Seuls member et admin sont attribuables ici.
  const newRole = role === undefined || role === null || role === '' ? 'member' : role;
  if (newRole !== 'member' && newRole !== 'admin') {
    return err('Rôle invalide (member ou admin)', 400, 'bad_role');
  }

  // Vérifier que auth est owner ou admin de la conv
  const me = await env.APEX_CHAT_DB.prepare(
    'SELECT role FROM conversation_members WHERE conv_id=? AND user_id=?'
  ).bind(convId, auth.sub).first();
  if (!me || !['owner', 'admin'].includes(me.role)) {
    return err('Droits insuffisants (owner/admin requis)', 403);
  }
  // Lot 2 (B) : seul le propriétaire nomme un administrateur.
  if (newRole === 'admin' && me.role !== 'owner') {
    return err('Seul le propriétaire peut nommer un administrateur', 403, 'owner_required');
  }
  // Lot 2 (B) : la personne ajoutée doit exister (sinon membre fantôme).
  const target = await env.APEX_CHAT_DB.prepare(
    "SELECT id, status FROM users WHERE id=?"
  ).bind(user_id).first();
  if (!target || target.status === 'deleted') return err('Utilisateur introuvable', 404, 'user_not_found');

  // Vérifier que la conv n'est pas un DM (DM = 2 membres fixes)
  const conv = await env.APEX_CHAT_DB.prepare('SELECT type, member_count FROM conversations WHERE id=?').bind(convId).first();
  if (!conv) return err('Conv introuvable', 404);
  if (conv.type === 'dm') return err('Impossible d\'ajouter à un DM', 400);

  // Limite size selon system_config
  const config = await getModeConfig(env);
  const maxSize = parseInt(config.MAX_GROUP_SIZE || '1024');
  if (conv.member_count >= maxSize) return err(`Limite ${maxSize} membres atteinte`, 403);

  // Ajouter (idempotent)
  await env.APEX_CHAT_DB.prepare(
    `INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible)
     VALUES (?, ?, ?, ?, 0)`
  ).bind(convId, user_id, newRole, Date.now()).run();

  // Update member_count
  const recount = await env.APEX_CHAT_DB.prepare(
    'SELECT COUNT(*) as c FROM conversation_members WHERE conv_id=?'
  ).bind(convId).first();
  await env.APEX_CHAT_DB.prepare('UPDATE conversations SET member_count=? WHERE id=?').bind(recount.c, convId).run();

  await auditLog(env, auth.sub, 'add_member', 'conv', convId, { added: user_id, role: newRole },
    await sha256(request.headers.get('CF-Connecting-IP') || ''), request.headers.get('User-Agent'));

  return json({ ok: true, member_count: recount.c });
}

export async function handleRemoveMember(convId, userId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // Self-leave OU admin kicking
  const me = await env.APEX_CHAT_DB.prepare(
    'SELECT role FROM conversation_members WHERE conv_id=? AND user_id=?'
  ).bind(convId, auth.sub).first();

  const isSelfLeave = auth.sub === userId;
  const isAdmin = me && ['owner', 'admin'].includes(me.role);
  if (!isSelfLeave && !isAdmin) return err('Droits insuffisants', 403);

  // Lot 2 (B) : un admin pouvait retirer le PROPRIÉTAIRE ou un autre admin (prise
  // de contrôle du groupe). Règles : personne ne retire le propriétaire ; seul le
  // propriétaire retire un administrateur.
  if (!isSelfLeave) {
    const target = await env.APEX_CHAT_DB.prepare(
      'SELECT role FROM conversation_members WHERE conv_id=? AND user_id=?'
    ).bind(convId, userId).first();
    if (target && target.role === 'owner') {
      return err('Le propriétaire ne peut pas être retiré', 403, 'owner_protected');
    }
    if (target && target.role === 'admin' && me.role !== 'owner') {
      return err('Seul le propriétaire peut retirer un administrateur', 403, 'owner_required');
    }
  }

  // Owner ne peut pas se retirer s'il y a d'autres membres (doit transférer ownership d'abord)
  if (me?.role === 'owner' && isSelfLeave) {
    const others = await env.APEX_CHAT_DB.prepare(
      'SELECT user_id FROM conversation_members WHERE conv_id=? AND user_id != ? LIMIT 1'
    ).bind(convId, auth.sub).first();
    if (others) return err('Transférer ownership avant de quitter', 400);
  }

  await env.APEX_CHAT_DB.prepare(
    'DELETE FROM conversation_members WHERE conv_id=? AND user_id=?'
  ).bind(convId, userId).run();

  const recount = await env.APEX_CHAT_DB.prepare(
    'SELECT COUNT(*) as c FROM conversation_members WHERE conv_id=?'
  ).bind(convId).first();
  await env.APEX_CHAT_DB.prepare('UPDATE conversations SET member_count=? WHERE id=?').bind(recount.c, convId).run();

  await auditLog(env, auth.sub, isSelfLeave ? 'leave_conv' : 'remove_member', 'conv', convId, { removed: userId },
    await sha256(request.headers.get('CF-Connecting-IP') || ''), request.headers.get('User-Agent'));

  return json({ ok: true, member_count: recount.c });
}

// DELETE /api/conversations/:id — supprime la conv du côté de l'appelant.
// Self-leave TOUJOURS autorisé (DM ou groupe) — règle Kevin "jamais bloqué".
// Si plus aucun membre → purge conv + messages. Erreurs détaillées par étape.
export async function handleDeleteConversation(convId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  let step = 'membership';
  try {
    // Lot 2 (B) : un non-membre recevait le nombre de membres restants (fuite)
    // et pouvait déclencher la purge d'une conversation vide qui n'est pas la sienne.
    const me = await env.APEX_CHAT_DB.prepare(
      'SELECT role FROM conversation_members WHERE conv_id=? AND user_id=?'
    ).bind(convId, auth.sub).first();
    if (!me) return err('Conversation introuvable', 404, 'not_member');
    // Lot 2 (B) : même règle que handleRemoveMember — le propriétaire d'un GROUPE
    // ne le laisse pas sans propriétaire (il transfère d'abord). Un DM reste
    // toujours quittable (règle Kevin « jamais bloqué »).
    if (me.role === 'owner') {
      const conv = await env.APEX_CHAT_DB.prepare('SELECT type FROM conversations WHERE id=?').bind(convId).first();
      if (conv && conv.type !== 'dm') {
        const others = await env.APEX_CHAT_DB.prepare(
          'SELECT user_id FROM conversation_members WHERE conv_id=? AND user_id != ? LIMIT 1'
        ).bind(convId, auth.sub).first();
        if (others) return err('Transférer ownership avant de quitter', 400, 'owner_must_transfer');
      }
    }
    step = 'leave';
    await env.APEX_CHAT_DB.prepare(
      'DELETE FROM conversation_members WHERE conv_id=? AND user_id=?'
    ).bind(convId, auth.sub).run();

    step = 'recount';
    const recount = await env.APEX_CHAT_DB.prepare(
      'SELECT COUNT(*) as c FROM conversation_members WHERE conv_id=?'
    ).bind(convId).first();
    const remaining = recount ? recount.c : 0;

    if (remaining === 0) {
      step = 'purge_messages';
      await env.APEX_CHAT_DB.prepare('DELETE FROM messages WHERE conv_id=?').bind(convId).run();
      step = 'purge_conv';
      await env.APEX_CHAT_DB.prepare('DELETE FROM conversations WHERE id=?').bind(convId).run();
    } else {
      step = 'update_count';
      await env.APEX_CHAT_DB.prepare('UPDATE conversations SET member_count=? WHERE id=?')
        .bind(remaining, convId).run();
    }

    step = 'audit';
    await auditLog(env, auth.sub, 'delete_conv', 'conv', convId, { remaining },
      await sha256(request.headers.get('CF-Connecting-IP') || ''), request.headers.get('User-Agent'))
      .catch(() => {});

    return json({ ok: true, remaining });
  } catch (e) {
    console.error('[delete-conv]', step, e.message, e.stack);
    e.step = 'delete_conv:' + step;
    return err('Suppression conversation échouée', 500, 'delete_conv_fail', e);
  }
}

export async function handleListMembers(convId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // Vérifier membership
  const me = await env.APEX_CHAT_DB.prepare(
    'SELECT user_id FROM conversation_members WHERE conv_id=? AND user_id=?'
  ).bind(convId, auth.sub).first();
  if (!me) return err('Pas membre', 403);

  // Lister membres (filtre kevin_invisible selon mode admin)
  const config = await getModeConfig(env);
  const kevinInvisible = config.KEVIN_INVISIBLE_ADMIN === 'true';

  const members = await env.APEX_CHAT_DB.prepare(
    `SELECT cm.user_id, cm.role, cm.joined_at, cm.kevin_invisible,
            u.pseudo, u.avatar_url
     FROM conversation_members cm
     INNER JOIN users u ON u.id = cm.user_id
     WHERE cm.conv_id = ?
     ORDER BY cm.role = 'owner' DESC, cm.role = 'admin' DESC, cm.joined_at ASC`
  ).bind(convId).all();

  // Filtrer Kevin invisible si Option A actif (sauf si auth est Kevin lui-même)
  const visible = (members.results || []).filter(m => {
    if (!kevinInvisible) return true;
    if (auth.sub === m.user_id) return true;  // toujours voir soi-même
    return !m.kevin_invisible;
  });

  return json({ ok: true, members: visible });
}

async function handleUpdateConv(convId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const me = await env.APEX_CHAT_DB.prepare(
    'SELECT role FROM conversation_members WHERE conv_id=? AND user_id=?'
  ).bind(convId, auth.sub).first();
  if (!me || !['owner', 'admin'].includes(me.role)) return err('Droits insuffisants', 403);

  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return err('Corps invalide', 400, 'bad_body');
  const { name, description, avatar_url, disappearing_seconds } = body;
  // Lot 2 (M) : un objet/tableau dans ces champs faisait échouer le bind D1 → 500.
  if (!_isOptStr(name, 200) || !_isOptStr(description, 2000) || !_isOptStr(avatar_url, AVATAR_MAX)) {
    return err('Champs invalides (texte attendu)', 400, 'bad_fields');
  }
  if (disappearing_seconds !== undefined && disappearing_seconds !== null &&
      !(typeof disappearing_seconds === 'number' && Number.isFinite(disappearing_seconds)) &&
      !(typeof disappearing_seconds === 'string' && /^\d{1,10}$/.test(disappearing_seconds))) {
    return err('disappearing_seconds invalide', 400, 'bad_fields');
  }
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name=?'); values.push(name); }
  if (description !== undefined) { updates.push('description=?'); values.push(description); }
  if (avatar_url !== undefined) { updates.push('avatar_url=?'); values.push(avatar_url); }
  if (disappearing_seconds !== undefined) { updates.push('disappearing_seconds=?'); values.push(parseInt(disappearing_seconds) || 0); }
  if (updates.length === 0) return err('Rien à modifier', 400);

  values.push(convId);
  await env.APEX_CHAT_DB.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id=?`).bind(...values).run();

  await auditLog(env, auth.sub, 'update_conv', 'conv', convId, { fields: Object.keys(body) },
    await sha256(request.headers.get('CF-Connecting-IP') || ''), request.headers.get('User-Agent'));

  return json({ ok: true });
}

// ----- Stories 24h -----

export async function handleCreateStory(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const { ciphertext, mime } = await readJson(request);
  if (!ciphertext) return err('ciphertext requis');
  // Lot 2 (M) : un objet passait la garde de taille (`.length` indéfini) puis
  // faisait échouer l'INSERT → 500.
  if (typeof ciphertext !== 'string') return err('ciphertext doit être une chaîne', 400, 'bad_ciphertext');
  if (!_isOptStr(mime, 100)) return err('mime invalide', 400, 'bad_mime');
  if (ciphertext.length > 200000) return err('Story trop volumineuse (max 200KB)', 413);

  const id = crypto.randomUUID();
  const ts = Date.now();
  const expires_at = ts + 24 * 3600 * 1000;  // 24h

  await env.APEX_CHAT_DB.prepare(
    `INSERT INTO stories (id, author_id, ciphertext, mime, ts, expires_at, views)
     VALUES (?, ?, ?, ?, ?, ?, '[]')`
  ).bind(id, auth.sub, ciphertext, mime || 'text/plain', ts, expires_at).run();

  return json({ ok: true, story: { id, ts, expires_at } });
}

async function handleListStories(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // Stories de mes contacts (+ moi) non expirées
  const stories = await env.APEX_CHAT_DB.prepare(
    `SELECT s.id, s.author_id, s.mime, s.ts, s.expires_at, s.views,
            u.pseudo, u.avatar_url
     FROM stories s
     INNER JOIN users u ON u.id = s.author_id
     WHERE s.expires_at > ?
       AND (s.author_id = ? OR s.author_id IN (
         SELECT contact_id FROM contacts WHERE user_id=? AND mutual_at IS NOT NULL
       ))
     ORDER BY s.ts DESC
     LIMIT 200`
  ).bind(Date.now(), auth.sub, auth.sub).all();

  // Lot 2 (F) : la liste des VUES (qui a vu, quand) était renvoyée à tout
  // spectateur. Seul l'auteur d'une story voit qui l'a vue.
  const list = (stories.results || []).map((s) => {
    if (s.author_id === auth.sub) return s;
    const { views, ...rest } = s;
    return rest;
  });
  return json({ ok: true, stories: list });
}

// Lot 2 (F) : même audience que la liste — l'auteur, ou un contact MUTUEL de l'auteur.
async function _canSeeStory(env, viewerId, authorId) {
  if (viewerId === authorId) return true;
  const c = await env.APEX_CHAT_DB.prepare(
    'SELECT 1 FROM contacts WHERE user_id=? AND contact_id=? AND mutual_at IS NOT NULL'
  ).bind(viewerId, authorId).first();
  return !!c;
}

export async function handleViewStory(storyId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const story = await env.APEX_CHAT_DB.prepare(
    'SELECT * FROM stories WHERE id=? AND expires_at > ?'
  ).bind(storyId, Date.now()).first();
  if (!story) return err('Story introuvable ou expirée', 404);
  // Lot 2 (F) : n'importe quel compte lisait n'importe quelle story par son id.
  // Même audience que la liste (même réponse 404 : on ne confirme pas l'existence).
  if (!(await _canSeeStory(env, auth.sub, story.author_id))) {
    return err('Story introuvable ou expirée', 404);
  }

  // Ajouter à views (idempotent)
  let views = [];
  try { views = JSON.parse(story.views || '[]'); } catch {}
  if (!Array.isArray(views)) views = [];
  if (!views.some(v => v && v.user_id === auth.sub)) {
    views.push({ user_id: auth.sub, viewed_at: Date.now() });
    await env.APEX_CHAT_DB.prepare('UPDATE stories SET views=? WHERE id=?').bind(JSON.stringify(views), storyId).run();
  }

  const out = { id: story.id, ciphertext: story.ciphertext, mime: story.mime, ts: story.ts, expires_at: story.expires_at };
  if (story.author_id === auth.sub) out.views_count = views.length;   // compteur réservé à l'auteur
  return json({ ok: true, story: out });
}

// ----- Polls -----

export async function handleCreatePoll(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const { conv_id, msg_id, question, options, multi_choice, anonymous, closes_at } = await readJson(request);
  if (!conv_id || !msg_id || !question || !Array.isArray(options) || options.length < 2) {
    return err('question + 2 options minimum requis');
  }
  // Lot 2 (M) : types stricts (bind D1 d'un objet → 500).
  if (typeof conv_id !== 'string' || typeof msg_id !== 'string' || typeof question !== 'string' || question.length > 1000 ||
      options.length > 50 || options.some(o => typeof o !== 'string' || o.length > 500) ||
      !(closes_at === undefined || closes_at === null || (typeof closes_at === 'number' && Number.isFinite(closes_at)))) {
    return err('Sondage invalide', 400, 'bad_poll');
  }

  // Vérifier membership
  const member = await env.APEX_CHAT_DB.prepare(
    'SELECT user_id FROM conversation_members WHERE conv_id=? AND user_id=?'
  ).bind(conv_id, auth.sub).first();
  if (!member) return err('Pas membre de la conv', 403);

  const id = crypto.randomUUID();
  await env.APEX_CHAT_DB.prepare(
    `INSERT INTO polls (id, conv_id, msg_id, question, options, multi_choice, anonymous, closes_at, votes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`
  ).bind(
    id, conv_id, msg_id, question, JSON.stringify(options),
    multi_choice ? 1 : 0, anonymous ? 1 : 0, closes_at || null, Date.now()
  ).run();

  return json({ ok: true, poll: { id, conv_id, question, options, multi_choice, anonymous, closes_at } });
}

export async function handleVotePoll(pollId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const { option_indexes } = await readJson(request);
  if (!Array.isArray(option_indexes) || option_indexes.length === 0) return err('option_indexes requis');

  let poll = await env.APEX_CHAT_DB.prepare('SELECT * FROM polls WHERE id=?').bind(pollId).first();
  if (!poll) return err('Poll introuvable', 404);
  if (poll.closes_at && poll.closes_at < Date.now()) return err('Vote fermé', 410);

  // Vérifier membership conv
  const member = await env.APEX_CHAT_DB.prepare(
    'SELECT user_id FROM conversation_members WHERE conv_id=? AND user_id=?'
  ).bind(poll.conv_id, auth.sub).first();
  if (!member) return err('Pas membre de la conv', 403);

  // Lot 2 (C) : les index n'étaient pas validés — « 99 », « -1 », « __proto__ »,
  // « constructor » créaient des clés arbitraires (pollution / options fantômes),
  // et un sondage à choix unique acceptait plusieurs votes du même utilisateur.
  let options = [];
  try { options = JSON.parse(poll.options || '[]'); } catch (_) { options = []; }
  const nOpts = Array.isArray(options) ? options.length : 0;
  const picked = [];
  for (const idx of option_indexes) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= nOpts) {
      return err('Option invalide', 400, 'bad_option', { idx, options: nOpts });
    }
    if (!picked.includes(idx)) picked.push(idx);
  }
  if (!poll.multi_choice && picked.length !== 1) {
    return err('Ce sondage n\'accepte qu\'un seul choix', 400, 'single_choice');
  }

  // Lot 2 (C) : lecture-modification-écriture sans garde = votes simultanés
  // PERDUS (le dernier écrasait les autres). Écriture conditionnelle sur la
  // valeur lue (compare-and-swap) ; en cas de course, on relit et on réessaie.
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = poll.votes == null ? '{}' : String(poll.votes);
    const votes = _parsePollVotes(before, nOpts);
    // Si pas multi-choice, retirer les anciens votes du user
    if (!poll.multi_choice) {
      for (const k of Object.keys(votes)) votes[k] = votes[k].filter(uid => uid !== auth.sub);
    }
    for (const idx of picked) {
      const key = String(idx);
      if (!votes[key]) votes[key] = [];
      if (!votes[key].includes(auth.sub)) votes[key].push(auth.sub);
    }
    const after = JSON.stringify(votes);
    const w = await env.APEX_CHAT_DB.prepare(
      poll.votes == null ? 'UPDATE polls SET votes=? WHERE id=? AND votes IS NULL' : 'UPDATE polls SET votes=? WHERE id=? AND votes=?'
    ).bind(...(poll.votes == null ? [after, pollId] : [after, pollId, before])).run();
    const wn = _changes(w);
    if (wn === null || wn === 1) {
      return json({ ok: true, votes: poll.anonymous ? null : votes,
        counts: Object.fromEntries(Object.entries(votes).map(([k, v]) => [k, v.length])) });
    }
    poll = await env.APEX_CHAT_DB.prepare('SELECT * FROM polls WHERE id=?').bind(pollId).first();
    if (!poll) return err('Poll introuvable', 404);
  }
  return err('Vote concurrent, réessaie', 409, 'vote_conflict');
}

// Votes stockés {"<index>": [user_ids]} → objet SANS prototype, ne gardant que
// des index valides et des listes de chaînes (aucune clé « __proto__ » possible).
function _parsePollVotes(raw, nOpts) {
  const out = Object.create(null);
  let parsed = null;
  try { parsed = JSON.parse(raw || '{}'); } catch (_) { parsed = null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
  for (const k of Object.keys(parsed)) {
    if (!/^\d{1,4}$/.test(k) || Number(k) >= nOpts) continue;
    const v = parsed[k];
    if (Array.isArray(v)) out[k] = v.filter(u => typeof u === 'string');
  }
  return out;
}

// ============================================================================
//  Phase 7 — Time Capsule + Letters + Memory Lane + Apex Memo
// ============================================================================

export const TIMECAPSULE_PREVIEW_MAX = 280;

export async function handleCreateTimeCapsule(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const { recipient_id, conv_id, ciphertext, mime, open_at, preview } = await readJson(request);
  if (!recipient_id || !ciphertext || !open_at) return err('recipient_id + ciphertext + open_at requis');
  // Lot 2 (I/M) : types stricts.
  if (typeof recipient_id !== 'string' || recipient_id.length > 128 || typeof ciphertext !== 'string' ||
      !_isOptStr(conv_id, 128) || !_isOptStr(mime, 100)) {
    return err('Champs de la capsule invalides', 400, 'bad_fields');
  }
  if (ciphertext.length > 200000) return err('Capsule trop volumineuse (max 200KB)', 413);
  // Lot 2 (I) : l'aperçu est stocké EN CLAIR et renvoyé dans les listes — borné.
  if (!_isOptStr(preview, TIMECAPSULE_PREVIEW_MAX)) {
    return err(`Aperçu invalide (texte, max ${TIMECAPSULE_PREVIEW_MAX} caractères)`, 400, 'bad_preview');
  }

  // Lot 2 (I) : parseInt('abc') = NaN passait les deux gardes (NaN < x et NaN > x
  // sont faux) → capsule à date NaN, jamais ouvrable. Nombre (ou chaîne de
  // chiffres) fini exigé.
  const openAtTs = typeof open_at === 'number' ? open_at
    : (typeof open_at === 'string' && /^\d{1,16}$/.test(open_at.trim()) ? Number(open_at.trim()) : NaN);
  if (!Number.isFinite(openAtTs) || !Number.isInteger(openAtTs)) {
    return err('Date d\'ouverture invalide (horodatage en millisecondes attendu)', 400, 'bad_open_at');
  }
  const minDelay = 5 * 60 * 1000;  // 5 min minimum
  const maxDelay = 50 * 365 * 86400 * 1000;  // 50 ans max
  if (openAtTs < Date.now() + minDelay) return err('Date d\'ouverture trop proche (min 5 min)', 400);
  if (openAtTs > Date.now() + maxDelay) return err('Date d\'ouverture trop lointaine (max 50 ans)', 400);

  // Lot 2 (I) : le destinataire doit exister (sinon capsule perdue / id arbitraire).
  const recipient = await env.APEX_CHAT_DB.prepare('SELECT id, status FROM users WHERE id=?').bind(recipient_id).first();
  if (!recipient || recipient.status === 'deleted') return err('Destinataire introuvable', 404, 'recipient_not_found');

  const id = crypto.randomUUID();
  await env.APEX_CHAT_DB.prepare(
    `INSERT INTO time_capsules (id, sender_id, recipient_id, conv_id, ciphertext, mime, open_at, preview, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, auth.sub, recipient_id, conv_id || null, ciphertext, mime || 'text/plain',
    openAtTs, preview || null, Date.now()
  ).run();

  return json({ ok: true, capsule: { id, open_at: openAtTs } });
}

async function handleListTimeCapsules(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // Mes capsules envoyées + reçues (non encore ouvertes)
  const sent = await env.APEX_CHAT_DB.prepare(
    `SELECT id, recipient_id, open_at, opened_at, preview, created_at
     FROM time_capsules WHERE sender_id=? ORDER BY open_at ASC LIMIT 100`
  ).bind(auth.sub).all();

  const received = await env.APEX_CHAT_DB.prepare(
    `SELECT id, sender_id, open_at, opened_at, preview, created_at,
            CASE WHEN open_at <= ? THEN 1 ELSE 0 END as is_open
     FROM time_capsules WHERE recipient_id=? ORDER BY open_at ASC LIMIT 100`
  ).bind(Date.now(), auth.sub).all();

  return json({ ok: true, sent: sent.results || [], received: received.results || [] });
}

async function handleOpenTimeCapsule(capsuleId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const capsule = await env.APEX_CHAT_DB.prepare(
    'SELECT * FROM time_capsules WHERE id=? AND recipient_id=?'
  ).bind(capsuleId, auth.sub).first();
  if (!capsule) return err('Capsule introuvable', 404);
  if (capsule.open_at > Date.now()) {
    return err(`Capsule scellée jusqu'au ${new Date(capsule.open_at).toLocaleDateString('fr-FR')}`, 423);
  }

  // Marquer ouverte (idempotent)
  if (!capsule.opened_at) {
    await env.APEX_CHAT_DB.prepare(
      'UPDATE time_capsules SET opened_at=? WHERE id=?'
    ).bind(Date.now(), capsuleId).run();
  }

  return json({
    ok: true,
    capsule: {
      id: capsule.id,
      sender_id: capsule.sender_id,
      ciphertext: capsule.ciphertext,
      mime: capsule.mime,
      open_at: capsule.open_at,
      opened_at: capsule.opened_at || Date.now(),
      created_at: capsule.created_at
    }
  });
}

// ----- Letters mode 24h delay -----

async function handleCreateLetter(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const { conv_id, ciphertext, delay_hours } = await readJson(request);
  if (!conv_id || !ciphertext) return err('conv_id + ciphertext requis');
  // Lot 2 (M) : types stricts (bind D1 d'un objet → 500).
  if (typeof conv_id !== 'string' || conv_id.length > 128 || typeof ciphertext !== 'string' || ciphertext.length > 200000) {
    return err('conv_id / ciphertext invalides', 400, 'bad_fields');
  }

  // Vérifier membership
  const member = await env.APEX_CHAT_DB.prepare(
    'SELECT user_id FROM conversation_members WHERE conv_id=? AND user_id=?'
  ).bind(conv_id, auth.sub).first();
  if (!member) return err('Pas membre de la conv', 403);

  const delay = parseInt(delay_hours) || 24;
  if (delay < 1 || delay > 168) return err('Délai entre 1h et 168h (7j)', 400);
  const deliverAt = Date.now() + delay * 3600 * 1000;

  const id = crypto.randomUUID();
  await env.APEX_CHAT_DB.prepare(
    `INSERT INTO letters_queue (id, sender_id, conv_id, ciphertext, deliver_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, auth.sub, conv_id, ciphertext, deliverAt, Date.now()).run();

  return json({ ok: true, letter: { id, deliver_at: deliverAt } });
}

export async function handleCancelLetter(letterId, request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const result = await env.APEX_CHAT_DB.prepare(
    `UPDATE letters_queue SET cancelled=1 WHERE id=? AND sender_id=? AND delivered=0`
  ).bind(letterId, auth.sub).run();

  return json({ ok: true, cancelled: result.meta?.changes > 0 });
}

async function handleListLetters(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // Mes letters en attente (non délivrées, non annulées)
  const letters = await env.APEX_CHAT_DB.prepare(
    `SELECT id, conv_id, deliver_at, created_at
     FROM letters_queue WHERE sender_id=? AND delivered=0 AND cancelled=0
     ORDER BY deliver_at ASC LIMIT 100`
  ).bind(auth.sub).all();

  return json({ ok: true, letters: letters.results || [] });
}

// ----- Memory Lane (il y a 1 an) -----

export async function handleMemoryLane(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // Date il y a exactement 1 an
  const oneYearAgo = new Date(Date.now() - 365 * 86400 * 1000);
  const dateKey = oneYearAgo.toISOString().slice(0, 10);

  // Cache check
  const cached = await env.APEX_CHAT_DB.prepare(
    'SELECT * FROM memory_lane_index WHERE user_id=? AND date_key=?'
  ).bind(auth.sub, dateKey).first();

  if (cached) {
    return json({ ok: true, memory: { date_key: dateKey, msg_ids: JSON.parse(cached.msg_ids), summary_enc: cached.summary_enc, generated_at: cached.generated_at } });
  }

  // Build from messages
  const dayStart = new Date(oneYearAgo); dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(oneYearAgo); dayEnd.setUTCHours(23, 59, 59, 999);

  const msgs = await env.APEX_CHAT_DB.prepare(
    `SELECT id FROM messages WHERE sender_id=? AND ts BETWEEN ? AND ? ORDER BY ts ASC LIMIT 50`
  ).bind(auth.sub, dayStart.getTime(), dayEnd.getTime()).all();

  const msgIds = (msgs.results || []).map(m => m.id);

  // Index pour next time
  await env.APEX_CHAT_DB.prepare(
    'INSERT OR REPLACE INTO memory_lane_index (user_id, date_key, msg_ids, summary_enc, generated_at) VALUES (?, ?, ?, NULL, ?)'
  ).bind(auth.sub, dateKey, JSON.stringify(msgIds), Date.now()).run();

  return json({ ok: true, memory: { date_key: dateKey, msg_ids: msgIds, count: msgIds.length } });
}

// ============================================================================
//  IA endpoints (fusion ia-worker dans api-worker pour eviter worker separe)
// ============================================================================

export async function _callAnthropicIA(messages, systemPrompt, env, signal) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: systemPrompt || '', messages })
  });
  if (!r.ok) throw new Error('Anthropic ' + r.status);
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

export async function _callGroqIA(messages, systemPrompt, env, signal) {
  if (!env.GROQ_API_KEY) throw new Error('GROQ missing');
  const full = systemPrompt ? [{role:'system',content:systemPrompt},...messages] : messages;
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Authorization': 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: full, max_tokens: 1024 })
  });
  if (!r.ok) throw new Error('Groq ' + r.status);
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

export async function _callGeminiIA(messages, systemPrompt, env, signal) {
  if (!env.GEMINI_API_KEY) throw new Error('Gemini missing');
  const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined, contents })
  });
  if (!r.ok) throw new Error('Gemini ' + r.status);
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/* Kevin 2026-09-05 « Qwen l'IA gratuite en principal… pareil dans mes autres projets » :
   QWEN sur Workers AI (binding AI, 0 clé, 0 €) devient un fournisseur à part entière, et
   l'ORDRE des fournisseurs est décidé par le routage commun du domaine selon le TYPE de
   demande (services/_shared/ia-route.js) : questions courantes → Qwen d'abord ;
   code / raisonnement / actions → Anthropic ; le reste en secours, rien n'est perdu. */
export async function _callQwenIA(messages, systemPrompt, env, signal, maxTokens) {
  if (!env.AI) throw new Error('Workers AI missing');
  const full = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
  const r = await routeText(env, { messages: full, chain: ['qwen'], maxTokens: maxTokens || 1024 });
  if (!r.ok) throw new Error('Qwen ' + ((r.tried[0] && r.tried[0].error) || 'indisponible'));
  return r.text;
}

/* Fournisseurs disponibles, dans l'ordre décidé par le type de demande (domaine). */
export function _iaOrdered(env, domain, fns) {
  const available = availableProviders(env).filter((p) => fns[p]);
  return planChain(domain, available).filter((p) => fns[p]).map((name) => ({ name, fn: fns[name] }));
}

export async function _callDeepSeekIA(messages, systemPrompt, env, signal) {
  if (!env.DEEPSEEK_API_KEY) throw new Error('DeepSeek missing');
  const full = systemPrompt ? [{role:'system',content:systemPrompt},...messages] : messages;
  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Authorization': 'Bearer ' + env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', messages: full, max_tokens: 1024 })
  });
  if (!r.ok) throw new Error('DeepSeek ' + r.status);
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

export const IA_CHAT_MAX_MESSAGES = 40;
export const IA_CHAT_MAX_CHARS = 32000;

async function handleIAChat(request, env) {
  // SÉCU audit P1 — l'IA consomme les crédits API de Kevin (Anthropic/Groq/Gemini/DeepSeek).
  // Sans auth, n'importe qui pouvait épuiser le quota/facturer. Réservé aux users connectés.
  const user = await getAuthUser(request, env);
  if (!user) return err('Unauthorized', 401);
  const { messages, systemPrompt, context } = await readJson(request);
  if (!Array.isArray(messages) || messages.length === 0) return err('messages required');
  // Lot 2 (E) : taille bornée (avant : N messages de taille libre → coût IA illimité).
  if (messages.length > IA_CHAT_MAX_MESSAGES) {
    return err(`Trop de messages (max ${IA_CHAT_MAX_MESSAGES})`, 413, 'too_many_messages');
  }
  let totalChars = 0;
  for (const m of messages) {
    if (!m || typeof m !== 'object' || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      return err('Message invalide (role user/assistant + content texte)', 400, 'bad_message');
    }
    totalChars += m.content.length;
  }
  if (totalChars > IA_CHAT_MAX_CHARS) {
    return err(`Conversation trop longue (max ${IA_CHAT_MAX_CHARS} caractères)`, 413, 'too_long');
  }
  // Lot 2 (E) : `is_admin` vient de la BASE (getAuthUser), jamais du corps de la
  // requête ; le prompt système libre et le contexte client sont réservés à l'admin.
  const isAdmin = !!user.is_admin;
  // Lot 2 (E) : même quota quotidien que les autres fonctions IA pour les non-admins.
  let quota = null;
  if (!isAdmin) {
    quota = await checkPremiumOrQuota(env, user.sub, 'ia-chat', request);
    if (!quota.ok) {
      return json({
        error: 'quota_exceeded',
        message: `Limite gratuite atteinte (${quota.used}/${quota.limit} messages Apex aujourd'hui). Premium = illimité.`,
        used: quota.used, limit: quota.limit, feature: 'ia-chat'
      }, 429);
    }
  }
  const pseudo = String(user.pseudo || 'un user').replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 40) || 'un user';
  const customSys = isAdmin && typeof systemPrompt === 'string' && systemPrompt.trim() ? systemPrompt.slice(0, 8000) : '';
  const sysPrompt = customSys || `Tu es Apex, l'assistant IA d'Apex Chat (messagerie privee).
${isAdmin ? 'Tu parles a Kevin admin.' : 'Tu parles a ' + pseudo}.
Francais, tutoiement, concis (max 200 mots), pas d'erreur technique brute.`;
  void context;   // le contexte envoyé par le client n'est plus cru

  /* Le TYPE de la question décide de l'ordre : courante → Qwen (gratuit) ; code / raisonnement /
     action → Anthropic ; puis les autres en secours. Essais en séquence (8 s chacun), cause
     exacte conservée par fournisseur (règle « détailler les erreurs »). */
  const lastUser = [...messages].reverse().find((m) => m && m.role === 'user');
  /* Kevin 2026-09-06 « concertation d'IA gratuites pour analyser les questions, va plus loin » :
     quand Workers AI est là, plusieurs voix gratuites VOTENT le type de la question, et une
     question difficile est répondue par un CONSEIL de voix + juge gratuit. Sinon (pas de binding),
     l'heuristique locale décide et les fournisseurs à clé répondent dans l'ordre du domaine. */
  if (env.AI) {
    const r = await routeSmart(env, { messages: [{ role: 'system', content: sysPrompt }, ...messages], maxTokens: 1024, timeoutMs: 8000 });
    if (r.ok) {
      if (quota) await consumeQuota(env, quota);
      return json({
        ok: true, content: r.text, provider: r.provider, model: r.model, domain: r.domain,
        analyse: r.analyse ? { by: r.analyse.by, votes: r.analyse.votes, complexity: r.analyse.complexity } : null,
        voices: r.voices || null, judge: r.judge || null,
      });
    }
    return json({ error: 'Tous providers IA indisponibles. Reessaie dans 1 min.', domain: r.domain, tried: r.tried }, 503);
  }
  const domain = detectDomain(lastUser ? String(lastUser.content || '') : '');
  const ordered = _iaOrdered(env, domain, {
    qwen: _callQwenIA, anthropic: _callAnthropicIA, groq: _callGroqIA, gemini: _callGeminiIA, deepseek: _callDeepSeekIA,
  });
  if (ordered.length === 0) return err('Aucun provider IA configure', 503);

  const tried = [];
  for (const { name, fn } of ordered) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fn(messages, sysPrompt, env, ctrl.signal);
      clearTimeout(to);
      if (r) {
        if (quota) await consumeQuota(env, quota);
        return json({ ok: true, content: r, provider: name, domain });
      }
      tried.push({ provider: name, error: 'réponse vide' });
    } catch (e) {
      clearTimeout(to);
      tried.push({ provider: name, error: String((e && e.message) || e).slice(0, 120) });
    }
  }
  return json({ error: 'Tous providers IA indisponibles. Reessaie dans 1 min.', domain, tried }, 503);
}

// ============================================================================
//  v1.1.24 — POST /api/ai/summarize : résumé IA générique (Memory Lane + autres)
//  Features futuristes :
//  - Anthropic prompt caching (5min TTL) sur system prompt → -90% coût récurrent
//  - Multi-provider failover (Anthropic Haiku → Groq → Gemini)
//  - Cache D1 par hash(prompt) 7 jours TTL (évite re-payer même prompt)
//  - SSE streaming optionnel (?stream=1) pour UX progressive
// ============================================================================
export async function handleAiSummarize(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // v1.1.30 : quota daily si non-premium
  const quota = await checkPremiumOrQuota(env, auth.sub, 'summarize', request);
  if (!quota.ok) {
    return json({
      error: 'quota_exceeded',
      message: `Limite gratuite atteinte (${quota.used}/${quota.limit} résumés aujourd'hui). Passe Premium pour illimité.`,
      used: quota.used, limit: quota.limit, feature: 'summarize'
    }, 429);
  }

  const body = await request.json().catch(() => ({}));
  const prompt = String(body.prompt || '').trim();
  const maxTokens = Math.min(2000, Math.max(50, body.max_tokens || 400));
  if (!prompt || prompt.length < 10) return err('prompt required (min 10 chars)');
  if (prompt.length > 50000) return err('prompt too long (max 50k chars)');

  // Cache D1 par hash(prompt + maxTokens) 7 jours
  const cacheKey = await _sha256Hex(prompt + ':' + maxTokens);
  try {
    const cached = await env.APEX_CHAT_DB?.prepare(
      'SELECT text, ts FROM ai_summary_cache WHERE cache_key=? AND ts > ?'
    ).bind(cacheKey, Date.now() - 7 * 86400 * 1000).first();
    if (cached?.text) {
      return json({ ok: true, text: cached.text, cached: true, provider: 'd1-cache', premium: quota.premium });
    }
  } catch (e) { /* cache table peut ne pas exister encore */ }

  // System prompt avec marker cache (Anthropic prompt caching 5min auto)
  const sysPrompt = "Tu es Apex, un IA résumeur expert. Style: bref, structuré, ton chaleureux. Réponds en français.";
  const messages = [{ role: 'user', content: prompt }];

  // Failover providers — un RÉSUMÉ = question courante → Qwen (gratuit) d'abord (Kevin 2026-09-05)
  const available = _iaOrdered(env, 'summary', {
    qwen: _callQwenIA, anthropic: _callAnthropicIASummarize, groq: _callGroqIA, gemini: _callGeminiIA,
  });
  if (available.length === 0) return err('Aucun provider IA configuré', 503);

  for (const p of available) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 15000);
      const text = await p.fn(messages, sysPrompt, env, ctrl.signal, maxTokens);
      clearTimeout(to);
      if (text && text.length > 5) {
        // Cache result D1 (best-effort)
        try {
          await env.APEX_CHAT_DB?.prepare(
            'INSERT OR REPLACE INTO ai_summary_cache (cache_key, text, ts, provider) VALUES (?, ?, ?, ?)'
          ).bind(cacheKey, text, Date.now(), p.name).run();
        } catch (e) { /* schema peut manquer */ }
        await consumeQuota(env, quota);
        return json({ ok: true, text, cached: false, provider: p.name, premium: quota.premium });
      }
    } catch (e) {
      console.warn(`[summarize] ${p.name} failed:`, e.message);
    }
  }
  return err('Tous providers IA indisponibles', 503);
}

// Variant Anthropic avec prompt caching ephemeral (5min TTL Anthropic-managed)
async function _callAnthropicIASummarize(messages, systemPrompt, env, signal, maxTokens) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens || 400,
      // Prompt caching pour system (réduction coût ~90% si répété <5min)
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    }),
  });
  if (!r.ok) throw new Error('Anthropic ' + r.status);
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

async function _sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
//  v1.1.208 — Premium via moyens de paiement Kevin (@kdmc) + activation MANUELLE
//  Kevin n'a PAS de compte Stripe → tout le flux Stripe est retiré.
//  Flux :
//   1. User choisit un plan → POST /api/premium/request (demande PENDING + notif admin)
//   2. User paie via PayPal / Revolut / IBAN (@kdmc) hors-app
//   3. Admin vérifie le paiement → POST /api/admin/grant-premium (activation manuelle)
//  - 3 plans : monthly (6,99€/31j), yearly (69,99€/365j), lifetime (199€/à vie)
//  - Premium status cache D1 sync cross-device (handlePremiumStatus inchangé)
// ============================================================================
const KDMC_PLANS = {
  monthly: { price_eur: 6.99, label: 'Mensuel', days: 31 },
  yearly: { price_eur: 69.99, label: 'Annuel (-15%)', days: 365 },
  lifetime: { price_eur: 199, label: 'À vie', days: null },
};

// premium_until pour un plan donné. lifetime → quasi-infini (~316 ans).
function _premiumUntilForPlan(plan) {
  const def = KDMC_PLANS[plan];
  if (!def) return 0;
  if (def.days === null) return 9999999999000; // lifetime
  return Date.now() + def.days * 86400 * 1000;
}

// ============================================================================
//  v1.1.208 — POST /api/premium/request : demande Premium EN ATTENTE (@kdmc)
//  L'utilisateur enregistre une demande, paie hors-app, l'admin active ensuite.
// ============================================================================
export async function handlePremiumRequest(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const body = await request.json().catch(() => ({}));
  const plan = String(body.plan || 'monthly');
  if (!KDMC_PLANS[plan]) return err('Plan invalide (monthly|yearly|lifetime)');

  const planDef = KDMC_PLANS[plan];
  const reqRecord = {
    user_id: auth.sub,
    email: auth.email || null,
    plan,
    price_eur: planDef.price_eur,
    method: 'kdmc',
    ts: Date.now(),
    status: 'pending',
  };

  // Persistance : KV (1 demande active par user, écrasée si nouvelle).
  // Fail-open : si KV indispo, on ne bloque PAS l'utilisateur — il pourra payer
  // et l'admin activera manuellement (la demande KV n'est qu'un confort admin).
  if (env.APEX_CHAT_KV) {
    try {
      await env.APEX_CHAT_KV.put(`premium_req:${auth.sub}`, JSON.stringify(reqRecord), {
        expirationTtl: 60 * 60 * 24 * 30, // 30 jours
      });
    } catch (e) { console.warn('[premium-request] KV put failed:', e.message); }
  }

  // Notifie l'admin via audit_log (Kevin voit la demande dans l'historique admin).
  try {
    await auditLog(env, auth.sub, 'premium.request', 'user', auth.sub, reqRecord, null, null);
  } catch (e) { console.warn('[premium-request] audit failed:', e.message); }

  // Semi-auto (Kevin « notif, 1 clic ») : PUSH à l'admin avec activation 1-tap.
  // Fail-open : si le push échoue, la demande reste visible dans le panneau admin.
  // Lot 2 (L) : notification plafonnée par utilisateur et par heure.
  if (await _adminPushAllowed(env, 'premium', auth.sub)) try {
    let uname = auth.sub;
    try {
      const u = await env.APEX_CHAT_DB?.prepare('SELECT pseudo, real_name FROM users WHERE id=?').bind(auth.sub).first();
      if (u) uname = u.real_name || u.pseudo || auth.sub;
    } catch (_) { /* ignore */ }
    await sendPushToUser('kdmc_admin', {
      title: '💎 Demande Premium',
      body: `${uname} — ${planDef.label} (${planDef.price_eur.toFixed(2)}€). Tape « Activer » après vérif du paiement.`,
      payload: { type: 'premium_request', user_id: auth.sub, plan },
      actions: [{ action: 'grant_premium', title: '✅ Activer' }, { action: 'dismiss', title: 'Plus tard' }],
    }, env);
  } catch (e) { console.warn('[premium-request] push admin failed:', e.message); }

  const priceStr = planDef.price_eur.toFixed(2);
  return json({
    ok: true,
    pending: true,
    plan,
    price_eur: planDef.price_eur,
    message: 'Demande envoyée. Premium activé après vérification du paiement par l\'admin.',
    pay: {
      paypal: `https://paypal.me/kdmc/${priceStr}`,
      revolut: 'https://revolut.me/kdmc',
      iban_holder: 'Kevin DESARZENS',
    },
  });
}

// ============================================================================
//  v1.1.208 — POST /api/admin/grant-premium : activation MANUELLE (admin only)
//  Kevin a vérifié le paiement (@kdmc) → active le Premium pour l'utilisateur.
// ============================================================================
export async function handleAdminGrantPremium(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  if (!auth.is_admin) return err('Admin requis', 403);

  const body = await request.json().catch(() => ({}));
  const userId = String(body.user_id || '').trim();
  const plan = String(body.plan || 'monthly');
  if (!userId) return err('user_id requis');
  if (!KDMC_PLANS[plan]) return err('Plan invalide (monthly|yearly|lifetime)');

  const premiumUntil = _premiumUntilForPlan(plan);

  try {
    await env.APEX_CHAT_DB?.prepare(
      'UPDATE users SET premium_until=?, premium_plan=? WHERE id=?'
    ).bind(premiumUntil, plan, userId).run();

    // Marque la demande KV comme activée (best-effort).
    if (env.APEX_CHAT_KV) {
      try { await env.APEX_CHAT_KV.delete(`premium_req:${userId}`); } catch (_) {}
    }

  } catch (e) {
    return err('DB error: ' + e.message, 500, 'db', { detail: e.message, step: 'grant_premium' });
  }
  // Lot 2 (A) : l'activation est FAITE à ce stade — un souci d'écriture du journal
  // ne doit plus transformer une activation réussie en « erreur 500 ».
  try {
    await auditLog(env, auth.sub, 'premium.granted', 'user', userId,
      { user_id: userId, plan, premium_until: premiumUntil, by: auth.sub }, null, null);
  } catch (e) { console.warn('[grant-premium] audit failed:', e && e.message); }

  return json({ ok: true, user_id: userId, plan, premium_until: premiumUntil });
}

// ============================================================================
//  v1.1.208 — GET /api/admin/premium-requests : liste des demandes pending
//  Kevin voit qui a demandé/payé pour activer manuellement.
// ============================================================================
export async function handleAdminPremiumRequests(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  if (!auth.is_admin) return err('Admin requis', 403);

  const requests = [];
  // Source principale : KV (1 entrée premium_req:* par user en attente).
  if (env.APEX_CHAT_KV) {
    try {
      const list = await env.APEX_CHAT_KV.list({ prefix: 'premium_req:' });
      for (const k of (list.keys || [])) {
        try {
          const v = await env.APEX_CHAT_KV.get(k.name);
          if (v) requests.push(JSON.parse(v));
        } catch (_) {}
      }
    } catch (e) { console.warn('[premium-requests] KV list failed:', e.message); }
  }
  requests.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return json({ ok: true, count: requests.length, requests });
}
// ============================================================================
//  v1.1.26 — POST /api/ai/smart-reply : 3 réponses suggérées style Gmail
// ============================================================================
export async function handleAiSmartReply(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // v1.1.30 : quota daily si non-premium
  const quota = await checkPremiumOrQuota(env, auth.sub, 'smart-reply', request);
  if (!quota.ok) {
    return json({
      error: 'quota_exceeded',
      message: `Limite gratuite atteinte (${quota.used}/${quota.limit} suggestions aujourd'hui).`,
      used: quota.used, limit: quota.limit, feature: 'smart-reply'
    }, 429);
  }

  const body = await request.json().catch(() => ({}));
  const lastMessage = String(body.last_message || '').trim();
  const context = String(body.context || '').trim().slice(0, 500);
  const tone = String(body.tone || 'friendly'); /* friendly | formal | brief */
  if (!lastMessage || lastMessage.length < 3) return err('last_message required');
  if (lastMessage.length > 2000) return err('last_message too long (max 2000)');

  const sysPrompt = `Tu suggères 3 réponses TRÈS COURTES (max 8 mots) en français pour répondre au message reçu. Style ${tone === 'formal' ? 'formel/vous' : tone === 'brief' ? 'ultra-bref' : 'amical/tu'}. Retourne UNIQUEMENT un JSON {"replies": ["...", "...", "..."]}. Pas d'explication.`;
  const userPrompt = `Message reçu: "${lastMessage}"${context ? `\nContexte: ${context}` : ''}`;
  const messages = [{ role: 'user', content: userPrompt }];

  /* Réponses rapides = « speed » → Groq puis Qwen (gratuits), Anthropic en secours */
  const providers = _iaOrdered(env, 'speed', { qwen: _callQwenIA, anthropic: _callAnthropicIASummarize, groq: _callGroqIA });
  for (const p of providers) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 6000);
      const text = await p.fn(messages, sysPrompt, env, ctrl.signal, 200);
      clearTimeout(to);
      // Parse JSON robuste (l'IA peut wrapper en markdown code block)
      const cleaned = text.replace(/```(?:json)?/g, '').trim();
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) continue;
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed.replies) && parsed.replies.length > 0) {
        await consumeQuota(env, quota);
        return json({
          ok: true,
          replies: parsed.replies.slice(0, 3).map(r => String(r).slice(0, 80)),
          provider: p.name,
          premium: quota.premium,
        });
      }
    } catch (e) {
      console.warn(`[smart-reply] ${p.name} failed:`, e.message);
    }
  }
  return err('IA indisponible', 503);
}

// ============================================================================
//  v1.1.26 — POST /api/ai/translate : traduction message FR/EN/ES/IT/DE/AR/etc.
// ============================================================================
export async function handleAiTranslate(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // v1.1.30 : quota daily si non-premium
  const quota = await checkPremiumOrQuota(env, auth.sub, 'translate', request);
  if (!quota.ok) {
    return json({
      error: 'quota_exceeded',
      message: `Limite gratuite atteinte (${quota.used}/${quota.limit} traductions aujourd'hui).`,
      used: quota.used, limit: quota.limit, feature: 'translate'
    }, 429);
  }

  const body = await request.json().catch(() => ({}));
  const text = String(body.text || '').trim();
  const targetLang = String(body.target_lang || 'fr').toLowerCase().slice(0, 5);
  if (!text || text.length < 1) return err('text required');
  if (text.length > 5000) return err('text too long (max 5000)');

  // Detect rapide langue source (heuristique simple — IA fera le vrai détect)
  const sysPrompt = `Tu es un traducteur expert. Traduis le texte fourni en ${targetLang}. Retourne UNIQUEMENT la traduction, sans préambule ni explication. Préserve le ton, les emojis, la ponctuation.`;
  const messages = [{ role: 'user', content: text }];

  /* Traduction = question courante → Qwen (multilingue, gratuit) d'abord (Kevin 2026-09-05) */
  const providers = _iaOrdered(env, 'translation', {
    qwen: _callQwenIA, anthropic: _callAnthropicIASummarize, groq: _callGroqIA, gemini: _callGeminiIA,
  });
  for (const p of providers) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000);
      const translated = await p.fn(messages, sysPrompt, env, ctrl.signal, 1500);
      clearTimeout(to);
      if (translated && translated.trim().length > 0) {
        await consumeQuota(env, quota);
        return json({
          ok: true,
          translated: translated.trim(),
          source_text: text.slice(0, 200),
          target_lang: targetLang,
          provider: p.name,
          premium: quota.premium,
        });
      }
    } catch (e) {
      console.warn(`[translate] ${p.name} failed:`, e.message);
    }
  }
  return err('Traduction IA indisponible', 503);
}

// ============================================================================
//  v1.1.28 — POST /api/ai/voice-transcribe : audio → texte (Whisper Groq)
//  Input : multipart/form-data avec audio file (mp3/m4a/webm/ogg/wav, max 25MB)
//  Output : { ok, text, language, duration_s, provider }
// ============================================================================
export async function handleAiVoiceTranscribe(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  if (!env.GROQ_API_KEY) return err('Groq Whisper non configuré (GROQ_API_KEY manquant)', 503);

  // v1.1.30 : quota daily si non-premium
  const quota = await checkPremiumOrQuota(env, auth.sub, 'voice-transcribe', request);
  if (!quota.ok) {
    return json({
      error: 'quota_exceeded',
      message: `Limite gratuite atteinte (${quota.used}/${quota.limit} transcriptions aujourd'hui). Premium = illimité.`,
      used: quota.used, limit: quota.limit, feature: 'voice-transcribe'
    }, 429);
  }

  // Récupère audio binary depuis multipart
  let audioBlob;
  let audioFilename = 'audio.webm';
  const ct = request.headers.get('content-type') || '';
  try {
    if (ct.includes('multipart/form-data')) {
      const form = await request.formData();
      const f = form.get('audio') || form.get('file');
      if (!f || !(f instanceof File)) return err('Fichier audio manquant (field "audio")');
      audioBlob = f;
      audioFilename = f.name || audioFilename;
    } else if (ct.includes('audio/') || ct.includes('application/octet-stream')) {
      // Binary direct dans body
      const buf = await request.arrayBuffer();
      audioBlob = new Blob([buf], { type: ct });
    } else {
      return err('Content-Type doit être multipart/form-data ou audio/*');
    }
  } catch (e) {
    return err('Erreur parsing body : ' + e.message);
  }

  if (!audioBlob || audioBlob.size === 0) return err('Audio vide');
  if (audioBlob.size > 25 * 1024 * 1024) return err('Audio trop gros (max 25 MB)');

  // Forward vers Groq Whisper API (audio/transcriptions, modèle whisper-large-v3)
  try {
    const groqForm = new FormData();
    groqForm.append('file', audioBlob, audioFilename);
    groqForm.append('model', 'whisper-large-v3-turbo');
    groqForm.append('response_format', 'verbose_json');
    // Heuristique langue : si user a paramétré language, le passer (sinon auto-detect)
    const url = new URL(request.url);
    const lang = url.searchParams.get('lang');
    if (lang && /^[a-z]{2}$/.test(lang)) groqForm.append('language', lang);

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 30_000);
    let r;
    try {
      r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.GROQ_API_KEY },
        body: groqForm,
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timeoutId); }
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      console.warn('[voice-transcribe] Groq HTTP', r.status, errBody.slice(0, 200));
      return err(`Whisper HTTP ${r.status}`, 502);
    }
    const data = await r.json();
    await consumeQuota(env, quota);
    return json({
      ok: true,
      text: data.text || '',
      language: data.language || null,
      duration_s: data.duration || null,
      provider: 'groq-whisper-large-v3-turbo',
      premium: quota.premium,
    });
  } catch (e) {
    return err('Whisper error: ' + e.message, 502);
  }
}

// ============================================================================
//  v1.1.28 — POST /api/ai/image-describe : image → description (Anthropic Vision)
//  Input : { image_base64, prompt (optional) }
//  Output : { ok, description, provider }
//  Use case : alt-text accessibilité, OCR léger, modération
// ============================================================================
export async function handleAiImageDescribe(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  if (!env.ANTHROPIC_API_KEY) return err('Anthropic Vision non configuré', 503);

  // v1.1.30 : quota daily si non-premium
  const quota = await checkPremiumOrQuota(env, auth.sub, 'image-describe', request);
  if (!quota.ok) {
    return json({
      error: 'quota_exceeded',
      message: `Limite gratuite atteinte (${quota.used}/${quota.limit} alt-text aujourd'hui). Premium = illimité.`,
      used: quota.used, limit: quota.limit, feature: 'image-describe'
    }, 429);
  }

  const body = await request.json().catch(() => ({}));
  const imageBase64 = String(body.image_base64 || '').trim();
  const customPrompt = String(body.prompt || 'Décris cette image en français en 1-3 phrases. Bref, factuel, sans emoji.').slice(0, 500);

  if (!imageBase64 || imageBase64.length < 100) return err('image_base64 required');
  // Strip data:image/...;base64, prefix si présent
  const cleanB64 = imageBase64.replace(/^data:image\/(jpeg|jpg|png|webp|gif);base64,/, '');
  if (cleanB64.length > 5 * 1024 * 1024) return err('Image trop grosse (max ~5MB base64)');

  // Detect mime type
  let mediaType = 'image/jpeg';
  if (imageBase64.startsWith('data:image/png')) mediaType = 'image/png';
  else if (imageBase64.startsWith('data:image/webp')) mediaType = 'image/webp';
  else if (imageBase64.startsWith('data:image/gif')) mediaType = 'image/gif';

  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 20_000);
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: cleanB64 } },
              { type: 'text', text: customPrompt },
            ],
          }],
        }),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timeoutId); }
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      console.warn('[image-describe] Anthropic HTTP', r.status, errBody.slice(0, 200));
      return err(`Anthropic Vision HTTP ${r.status}`, 502);
    }
    const data = await r.json();
    const description = data.content?.[0]?.text || '';
    await consumeQuota(env, quota);
    return json({
      ok: true,
      description,
      provider: 'anthropic-claude-haiku-vision',
      premium: quota.premium,
    });
  } catch (e) {
    return err('Vision error: ' + e.message, 502);
  }
}

// ============================================================================
//  v1.1.41 — POST /api/ai/rewrite : reformule un message (ton, style, longueur)
//  Input : { text, style: 'shorter'|'longer'|'formal'|'friendly'|'apology'|'fun' }
//  Output : { ok, rewritten, original, style, provider, premium }
// ============================================================================
export async function handleAiRewrite(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const quota = await checkPremiumOrQuota(env, auth.sub, 'translate', request); // share translate quota bucket
  if (!quota.ok) {
    return json({
      error: 'quota_exceeded',
      message: `Limite gratuite atteinte (${quota.used}/${quota.limit} reformulations aujourd'hui).`,
      used: quota.used, limit: quota.limit, feature: 'translate'
    }, 429);
  }

  const body = await request.json().catch(() => ({}));
  const text = String(body.text || '').trim();
  const style = String(body.style || 'friendly').toLowerCase();
  if (!text || text.length < 3) return err('text required (min 3 chars)');
  if (text.length > 2000) return err('text too long (max 2000)');

  const STYLE_PROMPTS = {
    shorter: 'Reformule ce message en 50% moins de mots, en gardant le sens essentiel.',
    longer: 'Développe ce message en ajoutant 1-2 phrases de contexte ou nuance.',
    formal: 'Reformule ce message en français formel (vouvoiement, structure professionnelle).',
    friendly: 'Reformule ce message en français amical (tutoiement, ton chaleureux, peut-être 1 emoji adapté).',
    apology: 'Reformule ce message comme une excuse sincère et empathique.',
    fun: 'Reformule ce message avec humour léger, 1-2 emojis adaptés. Reste naturel.',
    professional: 'Reformule comme un email business clair, concis, factuel.',
    fix_typos: 'Corrige uniquement les fautes (orthographe, grammaire, ponctuation). Ne change pas le sens ni le ton.',
  };
  const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.friendly;
  const sysPrompt = `Tu es un assistant de rédaction. ${stylePrompt} Retourne UNIQUEMENT le texte reformulé, sans préambule, sans guillemets, sans explication.`;
  const messages = [{ role: 'user', content: text }];

  /* Reformulation = question courante → Qwen (gratuit) d'abord, Anthropic en secours */
  const providers = _iaOrdered(env, 'general', { qwen: _callQwenIA, anthropic: _callAnthropicIASummarize, groq: _callGroqIA });
  for (const p of providers) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 10_000);
      const rewritten = await p.fn(messages, sysPrompt, env, ctrl.signal, 800);
      clearTimeout(to);
      const cleaned = String(rewritten || '').trim().replace(/^["«»"']|["«»"']$/g, '');
      if (cleaned && cleaned.length > 0) {
        await consumeQuota(env, quota);
        return json({
          ok: true,
          rewritten: cleaned,
          original: text,
          style,
          provider: p.name,
          premium: quota.premium,
        });
      }
    } catch (e) {
      console.warn(`[rewrite] ${p.name} failed:`, e.message);
    }
  }
  return err('Reformulation IA indisponible', 503);
}

// ============================================================================
//  v1.1.35 — POST /api/ai/search : semantic search dans messages
//  Input : { query, messages: [{text, ts, from}, ...] } (max 200 messages)
//  Output : { ok, results: [{idx, score, snippet, reason}], provider }
//  Use case : trouver "où on a parlé du restaurant", "messages de Laurence"
// ============================================================================
export async function handleAiSemanticSearch(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  // Quota gratuit (réutilise summarize bucket : recherche IA = aussi coûteuse)
  const quota = await checkPremiumOrQuota(env, auth.sub, 'summarize', request);
  if (!quota.ok) {
    return json({
      error: 'quota_exceeded',
      message: `Limite gratuite atteinte (${quota.used}/${quota.limit} recherches IA aujourd'hui). Passe Premium pour illimité.`,
      used: quota.used, limit: quota.limit, feature: 'summarize'
    }, 429);
  }

  const body = await request.json().catch(() => ({}));
  const query = String(body.query || '').trim();
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 200) : [];
  if (!query || query.length < 2) return err('query required (min 2 chars)');
  if (query.length > 500) return err('query too long (max 500)');
  if (messages.length === 0) return err('messages array required');

  // Construit le prompt : numérote chaque message pour que l'IA retourne des index
  const numbered = messages.map((m, i) => {
    const t = String(m.text || '').slice(0, 200).replace(/\s+/g, ' ');
    return `[${i}] ${t}`;
  }).join('\n');

  const sysPrompt = `Tu es un moteur de recherche sémantique pour messages chat. L'utilisateur cherche : "${query}". Identifie les messages les plus pertinents (max 10). Retourne UNIQUEMENT un JSON valide:\n{"results":[{"idx":<int>,"score":<0-100>,"reason":"<motif court FR>"}]}\nClasse par pertinence décroissante. Sois précis : un message non pertinent ne doit PAS apparaître.`;
  const userPrompt = `Messages à analyser (chacun avec son index entre []):\n\n${numbered}`;
  const msgsForAI = [{ role: 'user', content: userPrompt }];

  /* Recherche sémantique = RAISONNEMENT précis (JSON d'index) → Anthropic d'abord, Qwen en secours gratuit */
  const providers = _iaOrdered(env, 'reasoning', { qwen: _callQwenIA, anthropic: _callAnthropicIASummarize, groq: _callGroqIA });
  for (const p of providers) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12_000);
      const text = await p.fn(msgsForAI, sysPrompt, env, ctrl.signal, 1500);
      clearTimeout(to);
      // Parse JSON robust
      const cleaned = text.replace(/```(?:json)?/g, '').trim();
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) continue;
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed.results)) {
        const results = parsed.results
          .filter(r => typeof r.idx === 'number' && r.idx >= 0 && r.idx < messages.length)
          .slice(0, 10)
          .map(r => ({
            idx: r.idx,
            score: Math.max(0, Math.min(100, parseInt(r.score, 10) || 50)),
            reason: String(r.reason || '').slice(0, 120),
            snippet: String(messages[r.idx]?.text || '').slice(0, 200),
            ts: messages[r.idx]?.ts || null,
          }));
        await consumeQuota(env, quota);
        return json({ ok: true, results, query, provider: p.name, premium: quota.premium });
      }
    } catch (e) {
      console.warn(`[ai-search] ${p.name} failed:`, e.message);
    }
  }
  return err('Recherche IA indisponible', 503);
}

// ============================================================================
// ============================================================================
//  v1.1.81 — Web Push subscribe / unsubscribe endpoints
//   POST /api/push/subscribe   { subscription: PushSubscription.toJSON() }
//   POST /api/push/unsubscribe { endpoint: string }
// ============================================================================
// Hôtes des services Web Push réels (Chrome/Edge/Android, Firefox, Safari/iOS, Windows).
const PUSH_HOSTS_EXACT = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];
export function _isKnownPushEndpoint(endpoint) {
  let u;
  try { u = new URL(endpoint); } catch (_) { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const h = u.hostname.toLowerCase();
  return PUSH_HOSTS_EXACT.has(h) || PUSH_HOST_SUFFIXES.some(s => h.endsWith(s) && h.length > s.length);
}

export async function handlePushSubscribe(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  const body = await request.json().catch(() => ({}));
  const sub = body.subscription;
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return err('Subscription incomplète', 400);
  }
  if (typeof sub.endpoint !== 'string' || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string' ||
      sub.endpoint.length > 2048 || sub.keys.p256dh.length > 512 || sub.keys.auth.length > 256) {
    return err('Subscription invalide', 400, 'bad_subscription');
  }
  // Lot 2 (J) : l'endpoint est une URL vers laquelle le serveur POSTe — on
  // n'accepte que HTTPS vers un vrai service de notification.
  if (!_isKnownPushEndpoint(sub.endpoint)) {
    return err('Service de notification non reconnu', 400, 'bad_push_endpoint');
  }
  try {
    // Lot 2 (J) : l'ancien code SUPPRIMAIT la souscription de n'importe quel
    // compte portant cet endpoint puis la réattribuait à l'appelant — quiconque
    // connaissait l'endpoint d'un autre détournait ses notifications. Un endpoint
    // déjà lié à un AUTRE compte est refusé (le propriétaire doit se désabonner).
    const owners = await env.APEX_CHAT_DB.prepare(
      'SELECT user_id FROM push_subscriptions WHERE endpoint=?'
    ).bind(sub.endpoint).all();
    if (((owners && owners.results) || []).some(r => r && r.user_id && r.user_id !== auth.sub)) {
      return err('Cet appareil est déjà abonné pour un autre compte', 409, 'endpoint_taken');
    }
    // v1.1.172 FIX P0 : l'INSERT visait des colonnes inexistantes (id, ua) et
    // omettait device_id NOT NULL + created_at NOT NULL → AUCUNE souscription
    // n'était jamais enregistrée → 0 push envoyé. On aligne sur le schéma réel
    // (PK user_id, device_id). device_id = hash stable de l'endpoint pour que
    // re-souscrire le même device fasse un upsert propre.
    const now = Date.now();
    const deviceId = (await sha256(sub.endpoint)).slice(0, 32);
    // Upsert : remove existing for same endpoint (du MÊME compte), then insert fresh
    await env.APEX_CHAT_DB?.prepare(
      'DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?'
    ).bind(sub.endpoint, auth.sub).run();
    await env.APEX_CHAT_DB?.prepare(
      'INSERT OR REPLACE INTO push_subscriptions (user_id, device_id, endpoint, vapid_p256dh, vapid_auth, user_agent, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      auth.sub, deviceId, sub.endpoint, sub.keys.p256dh, sub.keys.auth,
      (request.headers.get('user-agent') || '').slice(0, 200), now, now
    ).run();
    return json({ ok: true });
  } catch (e) {
    return err('DB error: ' + e.message, 500);
  }
}

export async function handlePushUnsubscribe(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  const body = await request.json().catch(() => ({}));
  const endpoint = body.endpoint;
  if (!endpoint) return err('Endpoint requis', 400);
  try {
    await env.APEX_CHAT_DB?.prepare(
      'DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?'
    ).bind(endpoint, auth.sub).run();
    return json({ ok: true });
  } catch (e) {
    return err('DB error: ' + e.message, 500);
  }
}

// ============================================================================
//  v1.1.76 — Admin force-update : push à tous clients
//   POST /api/admin/force-update     → admin only, stocke ts dans system_config
//   GET  /api/admin/force-update-ts  → tous users, retourne dernier ts admin
// ============================================================================
export async function handleAdminForceUpdate(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);
  // Check is_admin from DB
  try {
    const u = await env.APEX_CHAT_DB?.prepare('SELECT is_admin FROM users WHERE id=?').bind(auth.sub).first();
    if (!u || !u.is_admin) return err('Admin requis', 403);
  } catch (e) {
    return err('DB error: ' + e.message, 500);
  }
  const ts = Date.now();
  try {
    await env.APEX_CHAT_DB?.prepare(
      'INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)'
    ).bind('force_update_ts', String(ts), ts, auth.sub).run();
    // Audit log
    try {
      await auditLog(env, auth.sub, 'admin.force_update_all', 'system', null, { ts }, null, null);
    } catch (_) {}
    return json({ ok: true, ts });
  } catch (e) {
    return err('Failed to set force_update_ts: ' + e.message, 500);
  }
}

// v1.1.163 — POST /api/admin/force-update-via-token
// Variante de handleAdminForceUpdate authentifiée par header secret au lieu
// de JWT admin → permet à un workflow GitHub Action (sans JWT) de trigger
// la MAJ chez tous les users automatiquement après chaque déploiement.
// Kevin "Elle a la version 61 et moi 62" → plus jamais besoin de cliquer
// "🚀 Forcer MAJ chez TOUS" à la main.
export async function handleAdminForceUpdateViaToken(request, env) {
  const provided = request.headers.get('X-Apex-Admin-Token') || '';
  const expected = env.APEX_CHAT_ADMIN_TOKEN || '';
  if (!expected) {
    return err('APEX_CHAT_ADMIN_TOKEN non configuré côté Worker', 503, 'token_unset',
      'Push le secret via workflow deploy-apex-chat.yml ou wrangler secret put');
  }
  // Comparaison constant-time (anti timing attack)
  if (provided.length !== expected.length) {
    return err('Token invalide', 401, 'bad_token', { hint: 'X-Apex-Admin-Token header requis' });
  }
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) {
    return err('Token invalide', 401, 'bad_token');
  }
  const ts = Date.now();
  try {
    await env.APEX_CHAT_DB?.prepare(
      'INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)'
    ).bind('force_update_ts', String(ts), ts, 'cron:deploy').run();
    try {
      await auditLog(env, 'cron:deploy', 'admin.force_update_via_token', 'system', null,
        { ts, source: 'github-action' }, null, null);
    } catch (_) {}
    return json({ ok: true, ts, source: 'token' });
  } catch (e) {
    return err('Failed to set force_update_ts', 500, 'db_write_failed', {
      detail: e?.message, where: (e?.stack || '').split('\n')[1] || '',
    });
  }
}

export async function handleAdminForceUpdateTs(request, env) {
  // Public endpoint : tous users peuvent fetch (pas de leak admin info)
  try {
    const row = await env.APEX_CHAT_DB?.prepare(
      'SELECT value FROM system_config WHERE key=?'
    ).bind('force_update_ts').first();
    return json({ ok: true, ts: row ? parseInt(row.value, 10) || 0 : 0 });
  } catch (e) {
    return json({ ok: true, ts: 0 }); // fail-open
  }
}

// ============================================================================
//  v1.1.24 — GET /api/premium/status : sync premium cross-device
// ============================================================================
export async function handlePremiumStatus(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  try {
    const u = await env.APEX_CHAT_DB?.prepare(
      'SELECT premium_until, premium_plan FROM users WHERE id=?'
    ).bind(auth.sub).first();
    if (!u) return json({ ok: true, premium: false });
    const isPremium = u.premium_until && u.premium_until > Date.now();
    return json({
      ok: true,
      premium: !!isPremium,
      plan: u.premium_plan || null,
      expires_at: u.premium_until || null,
      lifetime: u.premium_plan === 'lifetime' || (u.premium_until > 9000000000000),
    });
  } catch (e) {
    return err('DB error: ' + e.message, 500);
  }
}

// ============================================================================
//  v1.1.31 — GET /api/premium/quota : usage daily des 5 features IA
//  Permet à l'UI d'afficher "3/5 transcriptions utilisées aujourd'hui"
// ============================================================================
export async function handlePremiumQuota(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  try {
    // Détecte premium d'abord
    const u = await env.APEX_CHAT_DB?.prepare(
      'SELECT premium_until, premium_plan FROM users WHERE id=?'
    ).bind(auth.sub).first();
    const isPremium = u && u.premium_until && u.premium_until > Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const features = ['voice-transcribe', 'image-describe', 'summarize', 'smart-reply', 'translate'];
    const usage = {};
    for (const f of features) {
      const limit = FREE_QUOTAS[f] || 5;
      let used = 0;
      if (env.APEX_CHAT_KV) {
        try {
          const v = await env.APEX_CHAT_KV.get(`quota:${auth.sub}:${f}:${today}`);
          used = parseInt(v || '0', 10);
        } catch (_) {}
      }
      usage[f] = { used, limit, remaining: Math.max(0, limit - used), unlimited: !!isPremium };
    }
    return json({
      ok: true,
      premium: !!isPremium,
      plan: u?.premium_plan || null,
      date: today,
      usage,
    });
  } catch (e) {
    return err('Quota error: ' + e.message, 500);
  }
}

// ----- Signalements -----

export async function handleSignalement(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401);

  const { target_user_id, conv_id, msg_id, reason, description } = await readJson(request);
  if (!target_user_id || !reason) return err('target_user_id + reason requis');
  // Lot 2 (M) : types stricts — un objet ici faisait échouer le bind D1 → 500.
  if (typeof target_user_id !== 'string' || target_user_id.length > 128 ||
      typeof reason !== 'string' || reason.length > 64 ||
      !_isOptStr(description, 2000) || !_isOptStr(conv_id, 128) || !_isOptStr(msg_id, 128)) {
    return err('Champs du signalement invalides', 400, 'bad_fields');
  }

  const id = crypto.randomUUID();
  await env.APEX_CHAT_DB.prepare(
    `INSERT INTO signalements (id, reporter_id, target_user_id, conv_id, msg_id, reason, description, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, auth.sub, target_user_id, conv_id || null, msg_id || null, reason, description || null, Date.now()).run();

  // Push notif Kevin admin — Lot 2 (L) : plafonné par utilisateur (anti-inondation).
  // Le signalement est TOUJOURS enregistré ; seule la notification est limitée.
  if (await _adminPushAllowed(env, 'sig', auth.sub)) {
    try {
      await sendPushToUser('kdmc_admin', {
        title: '⚠ Nouveau signalement',
        body: `${reason} contre user ${target_user_id.slice(0,8)}...`,
        data: { signalement_id: id, target: target_user_id }
      }, env);
    } catch (e) {}
  }

  return json({ ok: true, id });
}

// Lot 2 (L) : un utilisateur pouvait inonder le téléphone de l'admin (une
// notification par signalement / demande premium, sans limite). Compteur
// horaire ATOMIQUE par utilisateur (même table que le plafond OTP, clé préfixée).
export const ADMIN_PUSH_MAX_PER_HOUR = 5;
async function _adminPushAllowed(env, kind, userId) {
  try {
    const key = 'adm-push:' + kind + ':' + String(userId).slice(0, 100);
    const hourKey = new Date().toISOString().slice(0, 13);
    const r = await env.APEX_CHAT_DB.prepare(
      `INSERT INTO ratelimit_otp (ip_hash, hour_key, count) VALUES (?, ?, 1)
       ON CONFLICT(ip_hash, hour_key) DO UPDATE SET count = count + 1 WHERE count < ?`
    ).bind(key, hourKey, ADMIN_PUSH_MAX_PER_HOUR).run();
    const c = _changes(r);
    return c === null || c === 1;
  } catch (_) {
    return false;   // compteur illisible : pas de notification (la donnée, elle, est enregistrée)
  }
}

// ============================================================================
//  TURN credentials — appels WebRTC P2P fiables cross-réseau (v1.1.229)
// ============================================================================
// Service Cloudflare Realtime TURN activé côté compte (2026-06-15).
// Kevin : « Les appels doivent fonctionner pour tout le monde sur réseau ou wifi
// ou n'importe, pas forcément en commun. » → sans TURN, un appel ne se connecte
// jamais quand les 2 ne sont pas sur le même Wi-Fi (NAT symétrique / cellulaire).
// Le TURN gratuit OpenRelay est mort (« Connexion perdue »). On mint ici des
// credentials TURN Cloudflare Realtime à courte durée (le TOKEN reste côté Worker,
// JAMAIS exposé au client — seuls username/credential éphémères partent au navigateur).
// FAIL-OPEN : si les secrets ne sont pas (encore) provisionnés → STUN-only, l'app
// ne casse JAMAIS (les appels même-réseau continuent de marcher).
// Résout les credentials de la clé TURN : d'abord les secrets Worker (env, posés par
// le workflow), sinon le KV (clé créée à la main dans le dashboard Cloudflare et collée
// par l'admin via /api/admin/turn-config). Permet d'activer le TURN SANS dépendre du
// token API du workflow (qui peut manquer la permission Calls).
async function resolveTurnCreds(env) {
  let keyId = env.CF_TURN_KEY_ID || null;
  let token = env.CF_TURN_TOKEN || null;
  if ((!keyId || !token) && env.APEX_CHAT_CACHE) {
    try {
      const raw = await env.APEX_CHAT_CACHE.get('turn_config');
      if (raw) {
        const c = JSON.parse(raw);
        keyId = keyId || c.key_id || null;
        token = token || c.token || null;
      }
    } catch (_) {}
  }
  return { keyId, token };
}

async function handleTurnCredentials(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401, 'unauthorized');

  const stun = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
  const { keyId, token } = await resolveTurnCreds(env);
  if (!keyId || !token) {
    // Pas encore provisionné (le workflow le fait au déploiement). STUN seul.
    return json({ iceServers: stun, turn: false, reason: 'turn_not_provisioned' });
  }
  try {
    const r = await fetch(
      'https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(keyId) + '/credentials/generate-ice-servers',
      {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 86400 })
      }
    );
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) {
      // Diagnostic exact (règle CLAUDE.md) mais fail-open STUN pour ne pas casser l'appel.
      return json({ iceServers: stun, turn: false, reason: 'cf_turn_http_' + r.status, detail: JSON.stringify(data || '').slice(0, 200) });
    }
    // L'API renvoie { iceServers: { urls:[...], username, credential } } (objet unique).
    let ice = [];
    if (Array.isArray(data.iceServers)) ice = data.iceServers;
    else if (data.iceServers && typeof data.iceServers === 'object') ice = [data.iceServers];
    return json({ iceServers: stun.concat(ice), turn: ice.length > 0 });
  } catch (e) {
    return json({ iceServers: stun, turn: false, reason: 'exception', detail: String((e && e.message) || e).slice(0, 200) });
  }
}

// POST /api/admin/turn-config — l'admin colle la clé TURN créée dans le dashboard
// Cloudflare (Realtime → TURN Server → Create). Stockée en KV → le Worker l'utilise
// pour les appels cross-réseau, SANS dépendre du token API du déploiement.
async function handleSetTurnConfig(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth || auth.sub !== 'kdmc_admin') {
    return err('Réservé admin Kevin', 403, 'forbidden', { auth_sub: auth?.sub || null });
  }
  let body = {};
  try { body = await request.json(); } catch (e) {
    return err('JSON body invalide', 400, 'bad_json', { detail: e?.message });
  }
  const key_id = String(body.key_id || body.keyId || '').trim();
  const token = String(body.token || body.key || '').trim();
  if (!key_id || !token) return err('key_id et token requis', 400, 'missing', { has_key_id: !!key_id, has_token: !!token });
  if (!env.APEX_CHAT_CACHE) return err('KV indisponible', 500, 'no_kv');
  try {
    await env.APEX_CHAT_CACHE.put('turn_config', JSON.stringify({ key_id, token, set_at: Date.now() }));
  } catch (e) {
    return err('Échec stockage KV', 500, 'kv_put_failed', { detail: e?.message });
  }
  // Vérif immédiate : on tente de générer des ICE servers pour prouver que la clé marche.
  let verified = false, verifyReason = null;
  try {
    const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(key_id) + '/credentials/generate-ice-servers',
      { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 600 }) });
    const d = await r.json().catch(() => null);
    verified = r.ok && d && !!d.iceServers;
    if (!verified) verifyReason = 'http_' + r.status;
  } catch (e) { verifyReason = String(e?.message || e).slice(0, 120); }
  return json({ ok: true, stored: true, verified, verifyReason });
}

// ============================================================================
//  GIF (Giphy) — proxy : la clé reste un secret worker (env.GIPHY_KEY), jamais
//  exposée au navigateur. Auth requise (anti open-proxy = protège la clé/quota
//  de Kevin). Fail-open : sans clé → { disabled:true } ; toute erreur réseau →
//  { results:[] } en 200 (le sélecteur GIF se dégrade proprement, jamais un mur).
// ============================================================================
async function handleGifSearch(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) return err('Non authentifié', 401, 'unauthorized');
  const key = env.GIPHY_KEY;
  if (!key) return json({ results: [], disabled: true, reason: 'no_key' });
  let q = '';
  try { q = new URL(request.url).searchParams.get('q') || ''; } catch (_) {}
  const url = q.trim() ? giphySearchUrl(q, key) : giphyTrendingUrl(key);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) return json({ results: [], disabled: false, error: 'giphy_http_' + r.status });
    const data = await r.json();
    return json({ results: mapGiphyResults(data), disabled: false });
  } catch (e) {
    return json({ results: [], disabled: false, error: 'giphy_fetch_failed', detail: String((e && e.message) || e) });
  }
}

// ============================================================================
//  Main fetch handler
// ============================================================================

const _workerHandler = {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // Auth routes
      if (path === '/api/auth/send-otp' && method === 'POST') return await handleSendOtp(request, env);
      if (path === '/api/auth/verify-otp' && method === 'POST') return await handleVerifyOtp(request, env);
      if (path === '/api/auth/check-phone' && method === 'POST') return await handleCheckPhone(request, env);
      if (path === '/api/auth/sso-from-apex' && method === 'POST') return await handleSsoFromApex(request, env);
      if (path === '/api/auth/sso-from-kdmc' && method === 'POST') return await handleSsoFromKdmc(request, env);

      // Users
      if (path === '/api/users/me' && method === 'GET') return await handleGetMe(request, env);
      if (path === '/api/users/me' && method === 'PATCH') return await handleUpdateMe(request, env);
      if (path === '/api/users/me' && method === 'DELETE') return await handleDeleteMe(request, env);
      if (path === '/api/users/me/export' && method === 'GET') return await handleExportMe(request, env);
      if (path === '/api/users/me/avatar' && method === 'POST') return await handleUploadMyAvatar(request, env);
      if (path === '/api/admin/user-toggles' && method === 'POST') return await handleAdminSetUserToggle(request, env);
      if (path === '/api/users/heartbeat' && method === 'POST') return await handleUserHeartbeat(request, env);
      if (path === '/api/cgu/accept' && method === 'POST') return await handleCguAccept(request, env);
      const userMatch = path.match(/^\/api\/users\/([a-zA-Z0-9_-]+)$/);
      if (userMatch && method === 'GET') return await handleGetPublicUser(userMatch[1], env, request);
      const adminUserMatch = path.match(/^\/api\/admin\/users\/([a-zA-Z0-9_-]+)\/full$/);
      if (adminUserMatch && method === 'GET') return await handleAdminGetFullUser(adminUserMatch[1], request, env);

      // Localisation — historique / trajet (v1.1.187)
      const locMatch = path.match(/^\/api\/location\/([a-zA-Z0-9_-]+)$/);
      if (locMatch && method === 'GET') return await handleLocationHistory(locMatch[1], request, env);

      // Médias R2 (photos/vidéos/fichiers tous formats) — v1.1.186
      if (path === '/api/media' && method === 'POST') return await handleMediaUpload(request, env);
      if (path === '/api/gif' && method === 'GET') return await handleGifSearch(request, env);
      const mediaMatch = path.match(/^\/api\/media\/([a-zA-Z0-9_-]+)$/);
      if (mediaMatch && method === 'GET') return await handleMediaGet(mediaMatch[1], request, env);

      // TURN credentials — appels P2P fiables cross-réseau (v1.1.229)
      if (path === '/api/turn' && method === 'GET') return await handleTurnCredentials(request, env);
      // Health TURN (sans auth) — Kevin peut l'ouvrir dans Safari pour voir si la clé est posée.
      if (path === '/api/turn/health' && method === 'GET') {
        const c = await resolveTurnCreds(env);
        return json({ configured: !!(c.keyId && c.token), source: env.CF_TURN_KEY_ID ? 'secret' : (c.keyId ? 'kv' : 'none'), ts: Date.now() });
      }
      // Admin : poser la clé TURN créée à la main dans le dashboard (bypass token API).
      if (path === '/api/admin/turn-config' && method === 'POST') return await handleSetTurnConfig(request, env);

      // E2E keys (v1.1.172 FIX P0 audit crew — distribution clés publiques)
      if (path === '/api/keys/prekeys' && method === 'POST') return await handleUploadPrekeys(request, env);
      const keyBundleMatch = path.match(/^\/api\/keys\/([a-zA-Z0-9_-]+)\/bundle$/);
      if (keyBundleMatch && method === 'GET') return await handleKeyBundle(keyBundleMatch[1], request, env);

      // Conversations
      if (path === '/api/conversations' && method === 'GET') return await handleListConversations(request, env);
      if (path === '/api/conversations' && method === 'POST') return await handleCreateConversation(request, env);
      // v1.1.161 — Cercle privé pré-câblé Kevin↔proche (Laurence)
      if (path === '/api/admin/configure-core-pair' && method === 'POST') return await handleConfigureCorePair(request, env);
      if (path === '/api/admin/heal-dm' && method === 'POST') return await handleHealDm(request, env);
      if (path === '/api/admin/trusted-circle' && method === 'GET') return await handleTrustedCircle(request, env, 'GET');
      if (path === '/api/admin/trusted-circle' && method === 'POST') return await handleTrustedCircle(request, env, 'POST');
      if (path === '/api/admin/diag' && method === 'GET') return await handleAdminDiag(request, env);
      // Ticket WS à usage unique (audit P2a) — le jeton de session reste dans
      // le header, seul le ticket éphémère part dans l'URL du WebSocket.
      if (path === '/api/auth/ws-ticket' && method === 'POST') return await handleWsTicket(request, env);
      if (path === '/api/auth/media-ticket' && method === 'POST') return await handleMediaTicket(request, env);
      const wsMatch = path.match(/^\/api\/conversations\/([^\/]+)\/ws$/);
      if (wsMatch) return await handleWsConversation(wsMatch[1], request, env);
      // Diagnostic WS : teste les MÊMES checks que le WS et renvoie la cause exacte
      const wsDiagMatch = path.match(/^\/api\/conversations\/([^\/]+)\/ws-diag$/);
      if (wsDiagMatch && method === 'GET') return await handleWsDiag(wsDiagMatch[1], request, env);

      // Phase 4 — Membres / update conv
      const membersMatch = path.match(/^\/api\/conversations\/([^\/]+)\/members$/);
      if (membersMatch && method === 'GET') return await handleListMembers(membersMatch[1], request, env);
      if (membersMatch && method === 'POST') return await handleAddMember(membersMatch[1], request, env);
      const memberRemoveMatch = path.match(/^\/api\/conversations\/([^\/]+)\/members\/([^\/]+)$/);
      if (memberRemoveMatch && method === 'DELETE') return await handleRemoveMember(memberRemoveMatch[1], memberRemoveMatch[2], request, env);
      const convUpdateMatch = path.match(/^\/api\/conversations\/([^\/]+)$/);
      if (convUpdateMatch && method === 'PATCH') return await handleUpdateConv(convUpdateMatch[1], request, env);
      if (convUpdateMatch && method === 'DELETE') return await handleDeleteConversation(convUpdateMatch[1], request, env);

      // Phase 4 — Stories
      if (path === '/api/stories' && method === 'POST') return await handleCreateStory(request, env);
      if (path === '/api/stories' && method === 'GET') return await handleListStories(request, env);
      const storyMatch = path.match(/^\/api\/stories\/([^\/]+)$/);
      if (storyMatch && method === 'GET') return await handleViewStory(storyMatch[1], request, env);

      // Phase 4 — Polls
      if (path === '/api/polls' && method === 'POST') return await handleCreatePoll(request, env);
      const pollVoteMatch = path.match(/^\/api\/polls\/([^\/]+)\/vote$/);
      if (pollVoteMatch && method === 'POST') return await handleVotePoll(pollVoteMatch[1], request, env);

      // Phase 4 — Signalements
      if (path === '/api/signalements' && method === 'POST') return await handleSignalement(request, env);

      // Phase 7 — Time Capsules
      if (path === '/api/time-capsules' && method === 'POST') return await handleCreateTimeCapsule(request, env);
      if (path === '/api/time-capsules' && method === 'GET') return await handleListTimeCapsules(request, env);
      const capsuleMatch = path.match(/^\/api\/time-capsules\/([^\/]+)$/);
      if (capsuleMatch && method === 'GET') return await handleOpenTimeCapsule(capsuleMatch[1], request, env);

      // Phase 7 — Letters mode 24h
      if (path === '/api/letters' && method === 'POST') return await handleCreateLetter(request, env);
      if (path === '/api/letters' && method === 'GET') return await handleListLetters(request, env);
      const letterMatch = path.match(/^\/api\/letters\/([^\/]+)$/);
      if (letterMatch && method === 'DELETE') return await handleCancelLetter(letterMatch[1], request, env);

      // Phase 7 — Memory Lane
      if (path === '/api/memory-lane' && method === 'GET') return await handleMemoryLane(request, env);

      // Phase 6 — IA chat (fusion ia-worker)
      if ((path === '/api/ia/chat' || path === '/ia/chat') && method === 'POST') return await handleIAChat(request, env);

      // v1.1.24 — AI summarize (Memory Lane + autres résumés)
      if (path === '/api/ai/summarize' && method === 'POST') return await handleAiSummarize(request, env);

      // v1.1.208 — Premium via @kdmc (PayPal/Revolut/IBAN) + activation MANUELLE
      if (path === '/api/premium/request' && method === 'POST') return await handlePremiumRequest(request, env);
      if (path === '/api/admin/grant-premium' && method === 'POST') return await handleAdminGrantPremium(request, env);
      if (path === '/api/admin/premium-requests' && method === 'GET') return await handleAdminPremiumRequests(request, env);
      if (path === '/api/premium/status' && method === 'GET') return await handlePremiumStatus(request, env);
      // v1.1.31 — Usage daily quota
      if (path === '/api/premium/quota' && method === 'GET') return await handlePremiumQuota(request, env);
      // v1.1.76 — Admin force-update push to all clients
      if (path === '/api/admin/force-update' && method === 'POST') return await handleAdminForceUpdate(request, env);
      if (path === '/api/admin/force-update-ts' && method === 'GET') return await handleAdminForceUpdateTs(request, env);
      if (path === '/api/admin/force-update-via-token' && method === 'POST') return await handleAdminForceUpdateViaToken(request, env);
      // v1.1.81 — Web Push subscribe / unsubscribe
      if (path === '/api/push/subscribe' && method === 'POST') return await handlePushSubscribe(request, env);
      if (path === '/api/push/unsubscribe' && method === 'POST') return await handlePushUnsubscribe(request, env);
      if (path === '/api/push/test' && method === 'POST') return await handlePushTest(request, env);
      // v1.1.35 — Semantic search messages
      if (path === '/api/ai/search' && method === 'POST') return await handleAiSemanticSearch(request, env);
      // v1.1.41 — AI rewrite message (8 styles)
      if (path === '/api/ai/rewrite' && method === 'POST') return await handleAiRewrite(request, env);

      // v1.1.26 — Smart Reply + Translate
      if (path === '/api/ai/smart-reply' && method === 'POST') return await handleAiSmartReply(request, env);
      if (path === '/api/ai/translate' && method === 'POST') return await handleAiTranslate(request, env);

      // v1.1.28 — Voice transcribe (Whisper) + Image describe (Vision)
      if (path === '/api/ai/voice-transcribe' && method === 'POST') return await handleAiVoiceTranscribe(request, env);
      if (path === '/api/ai/image-describe' && method === 'POST') return await handleAiImageDescribe(request, env);

      // Invitations
      if (path === '/api/invitations' && method === 'POST') return await handleCreateInvitation(request, env);
      const invMatch = path.match(/^\/api\/invitations\/([A-Z0-9]+)$/);
      if (invMatch && method === 'GET') return await handleResolveInvitation(invMatch[1], env);

      // Admin
      if (path === '/api/admin/commands' && method === 'POST') return await handleAdminCommand(request, env);
      if (path === '/api/admin/invite-magic' && method === 'POST') return await handleAdminInviteMagic(request, env);
      if (path === '/api/admin/whitelist-bulk' && method === 'POST') return await handleAdminWhitelistBulk(request, env);
      if (path === '/api/auth/magic-login' && method === 'POST') return await handleMagicLogin(request, env);
      if (path === '/api/admin/live-users' && method === 'GET') return await handleAdminLiveUsers(request, env);
      if (path === '/api/admin/map' && method === 'GET') return await handleAdminMap(request, env);
      const adminGeoMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/geo-history$/);
      if (adminGeoMatch && method === 'GET') return await handleAdminUserGeoHistory(adminGeoMatch[1], request, env);
      if (path === '/api/test/login' && method === 'POST') return await handleTestLogin(request, env);
      if (path === '/api/test/cleanup' && method === 'POST') return await handleTestCleanup(request, env);
      if (path === '/api/contacts' && method === 'GET') return await handleContacts(request, env);
      // Fiches de renseignement contacts (v1.1.201)
      // Lot 2 (P) : un « % » mal formé dans le chemin levait URIError → 500 ; c'est un 400.
      const contactMatch = path.match(/^\/api\/contact\/([^/]+)$/);
      const nickMatch = path.match(/^\/api\/contact\/([^/]+)\/nickname$/);
      const contactSeg = contactMatch ? _safeDecode(contactMatch[1]) : (nickMatch ? _safeDecode(nickMatch[1]) : undefined);
      if ((contactMatch || nickMatch) && contactSeg === null) return err('Identifiant de contact invalide', 400, 'bad_path');
      if (contactMatch && method === 'GET') return await handleGetContact(contactSeg, request, env);
      if (contactMatch && method === 'PATCH') return await handleUpdateContact(contactSeg, request, env);
      if (contactMatch && method === 'DELETE') return await handleDeleteContact(contactSeg, request, env);
      if (nickMatch && method === 'PUT') return await handleSetNickname(contactSeg, request, env);
      if (path === '/api/admin/all-users' && method === 'GET') return await handleAdminAllUsers(request, env);
      const adminUserActionMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/(block|unblock|ban|unban|authorize|revoke|force_logout|delete)$/);
      if (adminUserActionMatch && method === 'POST') return await handleAdminUserAction(adminUserActionMatch[1], adminUserActionMatch[2], request, env);
      const adminTimelineMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/timeline$/);
      if (adminTimelineMatch && method === 'GET') return await handleAdminUserTimeline(adminTimelineMatch[1], request, env);
      const adminConvsMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/conversations$/);
      if (adminConvsMatch && method === 'GET') return await handleAdminUserConvs(adminConvsMatch[1], request, env);
      if (path === '/api/admin/connections' && method === 'GET') return await handleAdminConnections(request, env);
      if (path === '/api/admin/search' && method === 'GET') return await handleAdminSearch(request, env);
      if (path === '/api/admin/toggles' && method === 'GET') return await handleAdminGetToggles(request, env);
      if (path === '/api/admin/toggles' && method === 'POST') return await handleAdminSetToggle(request, env);

      // System
      if (path === '/api/system/config' && method === 'GET') return await handleSystemConfig(request, env);

      // Health
      if (path === '/health' || path === '/api/health') return json({ ok: true, ts: Date.now() });

      return err('Route inconnue', 404);
    } catch (e) {
      if (e instanceof BadJsonError) {
        return err('Corps de requête invalide (JSON attendu)', 400, 'bad_json', { detail: e.cause && e.cause.message, path });
      }
      console.error('API error', path, method, e.message, e.stack);
      // Push télémétrie vers Apex
      // Lot 2 (H) : sans queue_type, le consommateur classait le message « unknown »
      // et le jetait — aucune erreur serveur ne remontait jamais.
      ctx.waitUntil(env.TELEMETRY_QUEUE?.send({
        queue_type: 'telemetry',
        sentinel: 'api-error',
        severity: 'err',
        msg: e.message,
        stack: (e.stack || '').slice(0, 600),
        path,
        method,
        ts: Date.now()
      }).catch(() => {}));
      // Règle CLAUDE.md : message user soft, mais detail = cause EXACTE (jamais masquée)
      return err('Erreur interne, réessaie dans un instant', 500, 'internal', e);
    }
  },

  // P0 FIX (audit) : Consumer Cloudflare Queues réel (router par queue_type)
  async queue(batch, env) {
    for (const msg of batch.messages) {
      try {
        const body = msg.body;
        const queueType = body.queue_type || 'unknown';

        switch (queueType) {
          case 'telemetry':
            // Sentinelle a remonté un événement → push vers Apex
            await pushToApexTelemetry(body, env);
            break;

          case 'pipeline-fix':
            // Auto-fix whitelist (restart DO, rotate keys, etc.)
            await runAutoFix(body, env);
            break;

          case 'letters-deliver': {
            // Letters mode : livrer message après 24h
            const letter = await env.APEX_CHAT_DB.prepare(
              'SELECT * FROM letters_queue WHERE id=? AND delivered=0 AND cancelled=0'
            ).bind(body.letter_id).first();
            if (letter && letter.deliver_at <= Date.now()) {
              // Lot 2 (G) : RÉCLAMER la lettre avant de la livrer. Le cron renvoie
              // la même lettre toutes les 5 min tant qu'elle n'est pas livrée et la
              // file peut rejouer un message : deux consommateurs la livraient deux
              // fois. Une seule exécution gagne (changes === 1).
              const claim = await env.APEX_CHAT_DB.prepare(
                'UPDATE letters_queue SET delivered=1 WHERE id=? AND delivered=0 AND cancelled=0'
              ).bind(letter.id).run();
              const claimN = _changes(claim);
              if (claimN !== null && claimN !== 1) break;   // déjà prise / annulée
              // Lot 2 (G) : l'expéditeur a pu QUITTER (ou être retiré de) la
              // conversation pendant le délai : sa lettre n'y entre plus.
              const stillMember = await env.APEX_CHAT_DB.prepare(
                'SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?'
              ).bind(letter.conv_id, letter.sender_id).first();
              if (!stillMember) {
                await env.APEX_CHAT_DB.prepare('UPDATE letters_queue SET cancelled=1 WHERE id=?').bind(letter.id).run();
                break;
              }
              const doStub = env.CONVERSATION_DO.get(env.CONVERSATION_DO.idFromName('do_' + letter.conv_id));
              // v1.1.172 FIX P1 (audit crew) : passer conv_id + ne marquer
              // delivered=1 QUE si l'injection réussit réellement (avant : .catch
              // avalait l'échec puis delivered=1 quand même → lettre perdue).
              let injected = false;
              try {
                const resp = await doStub.fetch(new Request('https://internal/admin/inject-message', {
                  method: 'POST',
                  headers: { 'X-Apex-Internal': env.APEX_CHAT_ADMIN_TOKEN || '' },
                  body: JSON.stringify({
                    conv_id: letter.conv_id,
                    sender_id: letter.sender_id,
                    ciphertext: letter.ciphertext,
                    mime: 'text/plain'
                  })
                }));
                injected = resp.ok;
              } catch (e) {
                console.error('[letters-deliver] inject failed:', e.message);
              }
              if (!injected) {
                // Échec d'injection : on RELÂCHE la réclamation → le cron 5 min réessaiera
                // (livraison garantie, jamais perdue).
                await env.APEX_CHAT_DB.prepare('UPDATE letters_queue SET delivered=0 WHERE id=? AND cancelled=0').bind(letter.id).run();
              }
            }
            break;
          }

          case 'timecapsule-open': {
            // Time Capsule : la capsule "s'ouvre" automatiquement à l'échéance.
            const capsule = await env.APEX_CHAT_DB.prepare(
              'SELECT * FROM time_capsules WHERE id=? AND opened_at IS NULL'
            ).bind(body.capsule_id).first();
            if (capsule && capsule.open_at <= Date.now()) {
              // Lot 2 (D) : opened_at n'est posé qu'une fois l'envoi RÉELLEMENT
              // terminé avec succès. Avant, le push partait sans être attendu et
              // opened_at était posé quoi qu'il arrive → notif perdue pour toujours.
              // Échec de tous les envois → exception → msg.retry() (nouvel essai).
              // Aucun appareil abonné → rien à réessayer : on clôt.
              const res = await sendPushToUser(capsule.recipient_id, {
                title: 'Apex Chat',
                body: '🎁 Une capsule temporelle est arrivée à échéance',
                tag: 'capsule-' + capsule.id,
                payload: { capsuleId: capsule.id, senderId: capsule.sender_id }
              }, env);
              if (res && res.total > 0 && res.ok === 0) {
                throw new Error('timecapsule push failed (' + res.failed + ' envoi(s))');
              }
              // v1.1.172 FIX P1 (audit crew) : poser opened_at → stoppe le
              // re-queue/push INFINI toutes les 5 min (le SELECT filtre opened_at
              // IS NULL). Le contenu reste révélé via /api/time-capsules/:id/open.
              await env.APEX_CHAT_DB.prepare(
                'UPDATE time_capsules SET opened_at=? WHERE id=? AND opened_at IS NULL'
              ).bind(Date.now(), capsule.id).run();
            }
            break;
          }

          case 'memory-lane': {
            // Memory Lane : "Il y a 1 an avec X..."
            const yearAgo = Date.now() - 365 * 86400000;
            const day = new Date(yearAgo).toISOString().slice(0, 10);
            const messages = await env.APEX_CHAT_DB.prepare(
              `SELECT m.id, m.sender_id, m.conv_id, m.ts FROM messages m
               WHERE m.sender_id=? AND date(m.ts/1000, 'unixepoch')=? LIMIT 10`
            ).bind(body.user_id, day).all();
            if ((messages.results || []).length > 0) {
              await sendPushToUser(body.user_id, {
                title: 'Apex Chat',
                body: `🌟 Il y a 1 an aujourd'hui... (${messages.results.length} souvenirs)`,
                tag: 'memory-lane-' + day
              }, env);
            }
            break;
          }

          case 'lifecycle-r2': {
            // Purge médias expirés (lifecycle)
            const expired = await env.APEX_CHAT_DB.prepare(
              'SELECT id, r2_key FROM media WHERE expires_at < ? LIMIT 100'
            ).bind(Date.now()).all();
            for (const m of (expired.results || [])) {
              await env.APEX_CHAT_MEDIA?.delete(m.r2_key).catch(() => {});
              await env.APEX_CHAT_DB.prepare('DELETE FROM media WHERE id=?').bind(m.id).run();
            }
            break;
          }

          case 'purge-expired-messages': {
            // Disappearing messages : suppression
            await env.APEX_CHAT_DB.prepare(
              'DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at < ?'
            ).bind(Date.now()).run();
            break;
          }

          default:
            console.warn('Queue type inconnu:', queueType);
        }

        msg.ack();
      } catch (e) {
        console.error('Queue consumer error', e);
        msg.retry();
      }
    }
  },

  // P0 FIX (audit) : Cron triggers pour purge automatique
  async scheduled(event, env, ctx) {
    const cron = event.cron;

    // Cron 0 */1 * * * (toutes les heures) — purge messages expirés + médias R2 expirés
    if (cron === '0 */1 * * *') {
      ctx.waitUntil(env.LETTERS_QUEUE?.send({ queue_type: 'purge-expired-messages' }).catch(() => {}));
      ctx.waitUntil(env.LETTERS_QUEUE?.send({ queue_type: 'lifecycle-r2' }).catch(() => {}));
    }

    // Cron */5 * * * * (5 min) — Letters delivery + Time capsules
    if (cron === '*/5 * * * *') {
      const due_letters = await env.APEX_CHAT_DB.prepare(
        'SELECT id FROM letters_queue WHERE deliver_at <= ? AND delivered=0 AND cancelled=0 LIMIT 50'
      ).bind(Date.now()).all();
      for (const l of (due_letters.results || [])) {
        ctx.waitUntil(env.LETTERS_QUEUE?.send({ queue_type: 'letters-deliver', letter_id: l.id }).catch(() => {}));
      }
      const due_capsules = await env.APEX_CHAT_DB.prepare(
        'SELECT id FROM time_capsules WHERE open_at <= ? AND opened_at IS NULL LIMIT 50'
      ).bind(Date.now()).all();
      for (const c of (due_capsules.results || [])) {
        ctx.waitUntil(env.TIMECAPSULE_QUEUE?.send({ queue_type: 'timecapsule-open', capsule_id: c.id }).catch(() => {}));
      }
    }

    // Cron 0 9 * * * (09:00 quotidien) — Memory Lane
    if (cron === '0 9 * * *') {
      const active_users = await env.APEX_CHAT_DB.prepare(
        'SELECT id FROM users WHERE last_seen > ? LIMIT 1000'
      ).bind(Date.now() - 7 * 86400000).all();
      for (const u of (active_users.results || [])) {
        ctx.waitUntil(env.MEMORY_LANE_QUEUE?.send({ queue_type: 'memory-lane', user_id: u.id }).catch(() => {}));
      }
    }

    // Cron 0 3 * * * (03:00 quotidien) — Backup R2 + cleanup audit log > 90j
    if (cron === '0 3 * * *') {
      ctx.waitUntil(performDailyBackup(env));
      await env.APEX_CHAT_DB.prepare(
        'DELETE FROM audit_log WHERE ts < ?'
      ).bind(Date.now() - 90 * 86400000).run();
      await env.APEX_CHAT_DB.prepare(
        'DELETE FROM ratelimit_otp WHERE hour_key < ?'
      ).bind(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 13)).run();
    }
  }
};

// ============================================================================
//  Helpers Queue consumer
// ============================================================================

export async function pushToApexTelemetry(payload, env) {
  if (!env.APEX_HANDOFF_FIREBASE_URL || !env.APEX_HANDOFF_TOKEN) return;
  try {
    await fetch(`${env.APEX_HANDOFF_FIREBASE_URL}/apex/ax_telemetry_in.json?auth=${env.APEX_HANDOFF_TOKEN}`, {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        src: 'apex-chat',
        ts: Date.now()
      })
    });
  } catch (e) {
    console.error('Telemetry push failed', e.message);
  }
}

export async function runAutoFix(body, env) {
  // Whitelist auto-fix : restart DO / rotate keys / requeue push
  const whitelist = ['restart-do', 'rotate-keys', 'requeue-push', 'fb-reconnect', 'reset-streaming'];
  if (!whitelist.includes(body.action)) return;
  // TODO : implémentations spécifiques
  console.log('Auto-fix attempt', body.action);
}

// POST /api/push/test — envoie une VRAIE notif serveur au user courant et RENVOIE le statut
// de livraison (contrairement à sendPushToUser fire-and-forget). Diagnostique « notifs hors
// app » : subs=0 (pas abonné), 401 (token push-worker ≠), fetch fail (worker injoignable), 200 OK.
async function handlePushTest(request, env) {
  const auth = await getAuthUser(request, env);
  if (!auth) return err('Non authentifié', 401, 'unauthorized');
  const subs = await env.APEX_CHAT_DB.prepare(
    'SELECT endpoint, vapid_p256dh, vapid_auth FROM push_subscriptions WHERE user_id=? AND last_seen > ?'
  ).bind(auth.sub, Date.now() - 30 * 86400000).all();
  const rows = (subs && subs.results) || [];
  const pushBase = env.APEX_PUSH_WORKER_URL || 'https://apex-push-worker.9r4rxssx64.workers.dev';
  const transport = (env.PUSH_WORKER && typeof env.PUSH_WORKER.fetch === 'function') ? 'service-binding' : 'fetch';
  const payload = { title: 'Apex Chat — test serveur ✅', body: 'Si tu vois cette notif, les notifications serveur marchent !', payload: { type: 'test' } };
  const results = [];
  for (const sub of rows) {
    if (!sub.endpoint || !sub.vapid_p256dh) { results.push({ skipped: 'no_keys' }); continue; }
    try {
      // v1.1.243 : via Service Binding (worker→worker autorisé) — fix Cloudflare 1042.
      const r = await sendPush(env, { endpoint: sub.endpoint, keys: { p256dh: sub.vapid_p256dh, auth: sub.vapid_auth } }, payload);
      let body = ''; try { body = (await r.text()).slice(0, 140); } catch (_) {}
      results.push({ status: r.status, ok: r.ok, body, service: (sub.endpoint || '').split('/')[2] || '' });
    } catch (e) { results.push({ error: String((e && e.message) || e).slice(0, 140) }); }
  }
  return json({ ok: true, subs: rows.length, hasAdminToken: !!env.APEX_CHAT_ADMIN_TOKEN, pushBase, transport, results });
}

export async function sendPushToUser(userId, payload, env) {
  const subs = await env.APEX_CHAT_DB.prepare(
    'SELECT endpoint, vapid_p256dh, vapid_auth, fcm_token, apns_token FROM push_subscriptions WHERE user_id=? AND last_seen > ?'
  ).bind(userId, Date.now() - 30 * 86400000).all();

  // v1.1.243 : envoi via Service Binding PUSH_WORKER (worker→worker autorisé).
  // Avant : fetch direct vers *.workers.dev = Cloudflare 1042 → 100% des pushs perdus.
  // Lot 2 (D) : les envois partaient SANS être attendus (fire-and-forget) — le
  // Worker peut être arrêté dès la réponse rendue, la notif était alors perdue, et
  // l'appelant ne savait jamais si elle était partie. On attend tous les envois
  // et on rend le bilan { total, ok, failed }.
  const sends = [];
  for (const sub of (subs.results || [])) {
    if (sub.endpoint && sub.vapid_p256dh) {
      sends.push(
        Promise.resolve()
          .then(() => sendPush(env, { endpoint: sub.endpoint, keys: { p256dh: sub.vapid_p256dh, auth: sub.vapid_auth } }, payload))
          .then((r) => (!r || r.ok !== false))
      );
    }
  }
  const settled = await Promise.allSettled(sends);
  let ok = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value) ok++;
    else console.warn('[sendPushToUser] web-push failed:', s.status === 'rejected' ? (s.reason && s.reason.message) : 'HTTP error');
  }
  return { total: sends.length, ok, failed: sends.length - ok };
}

// ----------------------------------------------------------------------------
//  Sauvegarde quotidienne D1 → R2 (audit 17/09/2026, P1)
//  Avant : 5 tables sur 27, JSON EN CLAIR (téléphones, noms, e-mails) dans le bucket des
//  médias, jamais vérifiée, jamais purgée (un fichier de plus par jour, pour toujours),
//  échec avalé par console.error. Maintenant : toutes les tables, chiffrement AES-GCM-256
//  (clé dérivée du secret JWT_SIGN_KEY, aucun nouveau secret à créer), refus d'écrire en
//  clair, rotation 14 jours, résultat écrit dans system_config (backup_last_ok /
//  backup_last_error) et visible dans /api/admin/diag. Déchiffrement : tools/backup-decrypt.mjs.
// ----------------------------------------------------------------------------
export const BACKUP_RETENTION_DAYS = 14;
export const BACKUP_ROW_LIMIT = 100000;
export const BACKUP_TABLES_FALLBACK = ['users', 'conversations', 'conversation_members', 'messages', 'audit_log',
  'contacts', 'invitations', 'push_subscriptions', 'system_config', 'connections', 'media', 'cgu_acceptances'];

/** Clé AES-GCM-256 dérivée (HKDF-SHA256) du secret JWT — même dérivation dans tools/backup-decrypt.mjs. */
export async function backupKeyFromSecret(secret) {
  const ikm = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('apex-chat-backup'), info: new TextEncoder().encode('d1-backup-v1') },
    ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function _b64(bytes) {
  let s = ''; const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function encryptBackup(json, secret) {
  const key = await backupKeyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json));
  return JSON.stringify({ v: 1, alg: 'AES-GCM-256/HKDF-SHA256', iv: _b64(iv), ct: _b64(ct) });
}

async function _noteBackup(env, key, value) {
  try {
    await env.APEX_CHAT_DB.prepare(
      'INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)'
    ).bind(key, String(value).slice(0, 2000), Date.now(), 'cron-backup').run();
  } catch (e) { console.warn('[backup] system_config non écrit :', e && e.message); }
}

export async function performDailyBackup(env, now = new Date()) {
  const dateKey = now.toISOString().slice(0, 10);
  try {
    if (!env.APEX_CHAT_MEDIA) throw new Error('bucket R2 absent (APEX_CHAT_MEDIA)');
    if (!env.JWT_SIGN_KEY) throw new Error('JWT_SIGN_KEY absent : refus d\'écrire une sauvegarde en clair');
    // 1) Toutes les tables (lues dans le schéma réel ; repli sur la liste connue)
    let tables = [];
    try {
      const rows = await env.APEX_CHAT_DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'"
      ).all();
      tables = (rows.results || []).map(r => r.name).filter(Boolean);
    } catch (_) { /* repli ci-dessous */ }
    if (!tables.length) tables = BACKUP_TABLES_FALLBACK;
    const backup = { ts: now.getTime(), version: 2, tables: {} };
    let rowsTotal = 0;
    // Lot 2 (K) : une table qui atteint la limite est COUPÉE — la sauvegarde était
    // pourtant notée « réussie ». On lit LIMIT+1 lignes pour le détecter, on garde
    // LIMIT lignes, et la sauvegarde est signalée tronquée (jamais « complète »).
    const truncated = [];
    const failedTables = [];
    for (const t of tables) {
      if (!/^[a-z_][a-z0-9_]*$/i.test(t)) continue;
      try {
        const stmt = await env.APEX_CHAT_DB.prepare(`SELECT * FROM ${t} LIMIT ${BACKUP_ROW_LIMIT + 1}`).all();
        let rows = stmt.results || [];
        if (rows.length > BACKUP_ROW_LIMIT) { rows = rows.slice(0, BACKUP_ROW_LIMIT); truncated.push(t); }
        backup.tables[t] = rows;
        rowsTotal += rows.length;
      } catch (e) { backup.tables[t] = { error: e && e.message }; failedTables.push(t); }
    }
    if (truncated.length) backup.truncated = truncated;
    // 2) Chiffrement avant toute écriture
    const enc = await encryptBackup(JSON.stringify(backup), env.JWT_SIGN_KEY);
    const key = `backups/d1-${dateKey}.json.enc`;
    await env.APEX_CHAT_MEDIA.put(key, enc, { httpMetadata: { contentType: 'application/json' } });
    // 3) Vérification : relire et contrôler la taille
    const back = await env.APEX_CHAT_MEDIA.get(key);
    const backText = back ? await back.text() : '';
    if (!back || backText.length !== enc.length) throw new Error(`relecture R2 incohérente (${backText.length}/${enc.length} octets)`);
    // 4) Rotation : tout fichier backups/d1-<date>.* plus vieux que 14 jours est supprimé
    //    (y compris les anciens .json EN CLAIR : ils disparaissent en 14 jours au plus)
    const purged = [];
    try {
      const listed = await env.APEX_CHAT_MEDIA.list({ prefix: 'backups/d1-' });
      const limit = now.getTime() - BACKUP_RETENTION_DAYS * 86400000;
      for (const o of (listed && listed.objects) || []) {
        const m = /^backups\/d1-(\d{4}-\d{2}-\d{2})\./.exec(o.key);
        if (m && Date.parse(m[1]) < limit) { await env.APEX_CHAT_MEDIA.delete(o.key); purged.push(o.key); }
      }
    } catch (e) { console.warn('[backup] rotation partielle :', e && e.message); }
    if (truncated.length) {
      // Fichier écrit (mieux que rien) mais INCOMPLET : jamais noté backup_last_ok.
      const info = { ts: now.getTime(), date: dateKey, key, truncated, limit: BACKUP_ROW_LIMIT, rows: rowsTotal,
        error: 'sauvegarde tronquée : ' + truncated.join(', ') + ' dépasse ' + BACKUP_ROW_LIMIT + ' lignes' };
      await _noteBackup(env, 'backup_last_error', JSON.stringify(info));
      try {
        await env.TELEMETRY_QUEUE?.send({ queue_type: 'telemetry', sentinel: 'backup-truncated', severity: 'err', msg: info.error, ts: Date.now() });
      } catch (_) {}
      console.error('Daily backup TRUNCATED', key, truncated);
      return { ok: false, truncated, key, tables: tables.length, rows: rowsTotal, purged };
    }
    await _noteBackup(env, 'backup_last_ok', JSON.stringify({ ts: now.getTime(), key, tables: Object.keys(backup.tables).length, rows: rowsTotal, bytes: enc.length, purged: purged.length, failed_tables: failedTables }));
    console.log('Daily backup done', key, tables.length, 'tables', rowsTotal, 'rows');
    return { ok: true, key, tables: tables.length, rows: rowsTotal, purged };
  } catch (e) {
    console.error('Daily backup failed', e && e.message);
    await _noteBackup(env, 'backup_last_error', JSON.stringify({ ts: now.getTime(), date: dateKey, error: e && e.message }));
    try {
      await env.TELEMETRY_QUEUE?.send({ queue_type: 'telemetry', sentinel: 'backup-failed', severity: 'err', msg: e && e.message, ts: Date.now() });
    } catch (_) {}
    return { ok: false, error: e && e.message };
  }
}

// ============================================================================
//  Durable Objects (re-exporté depuis ./durable-objects/)
// ============================================================================


// ============================================================================
//  CORS par ORIGINE (audit P2b, v1.1.287)
//  Le worker répondait `Access-Control-Allow-Origin: *` à tout le monde. On
//  applique la liste d'origines réelles en UN SEUL point — le `fetch` de tête —
//  au lieu de toucher chaque site d'appel : zéro risque de rater une réponse.
// ============================================================================
export default {
  ..._workerHandler,
  async fetch(request, env, ctx) {
    try {
      return applyCors(request, await _workerHandler.fetch(request, env, ctx));
    } finally {
      // Lot 2 (E) : rend le quota IA réservé par une requête qui n'a rien consommé.
      await _releaseUnconsumedQuota(request, env);
    }
  },
};

export { ConversationDO } from './durable-objects/ConversationDO.js';
export { BroadcastDO } from './durable-objects/BroadcastDO.js';
export { PresenceDO } from './durable-objects/PresenceDO.js';
