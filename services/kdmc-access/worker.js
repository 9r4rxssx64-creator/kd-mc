/* kdmc-access — Journal unifié « qui se connecte à mon domaine » (Kevin 2026-07-25).
 *
 * UN worker central + isolé (une panne ici ne casse AUCUNE autre app — règle isolation).
 * Chaque app de kd-mc.com POST ses évènements (connexion + actions) → ce worker écrit
 * dans Firebase RTDB avec sa clé SERVICE-ACCOUNT (côté serveur, jamais exposée).
 * La lecture (historique agrégé par personne) est réservée au PIN admin de Kevin.
 *
 * Endpoints :
 *   GET  /              → sert la page admin (entrée par la session du domaine, sinon code → /history)
 *   POST /log           → apps: {app,event,device,meta} + porteur de session du domaine
 *                         (Authorization: Bearer <pass> ou cookie kdmc_sso, vérifié par
 *                         kd-mc.com/__sso/whoami) → append Firebase ; l'uid et le nom sont
 *                         ceux de la session, jamais ceux du corps (audit 2026-10-08 : avant,
 *                         n'importe qui écrivait n'importe quel nom dans le journal). 401 sans session.
 *   GET  /history       → x-apex-pin = SHA-256(PIN admin) OU session admin vérifiée → {people:[…]}
 *   GET  /health        → {ok:true}
 *   OPTIONS             → préflight CORS
 *
 * Sécurité :
 *   - Log stocké à /kdmc_access/events (racine DENY dans firebase-rules-apex.json →
 *     AUCUN client ne peut le lire/écrire ; seul le service-account, qui bypass les
 *     règles, y touche). Pas de changement de règles Firebase nécessaire.
 *   - /history exige le SHA-256 du PIN admin (secret APEX_ADMIN_PIN_SHA256), comparé
 *     en temps constant — dans l'EN-TÊTE seulement, plus jamais dans l'adresse (?pin=,
 *     qui finissait dans les journaux). /log accepte les Origins kd-mc.com (allowlist CORS).
 *   - On journalise des MÉTADONNÉES d'action (nom d'évènement, app, appareil), JAMAIS
 *     le contenu privé (corps de message, texte de planning) — proportionné/RGPD.
 *   - L'adresse IP n'est plus gardée en clair : empreinte SHA-256 salée (secret KDMC_IP_SEL),
 *     tronquée ; sans sel, rien n'est gardé du tout.
 *   - FAIL-OPEN : si les secrets FB manquent, /log renvoie 204 sans rien casser (mais
 *     jamais sans session : la porte, elle, est fail-closed).
 *
 * Secrets (posés par .github/workflows/deploy-kdmc-access.yml depuis les secrets GitHub) :
 *   FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, APEX_ADMIN_PIN_SHA256, KDMC_IP_SEL (optionnel).
 */

import { PAGE_HTML } from './page.js';

const FB_URL = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
const LOG_PATH = 'kdmc_access/events';
const ONLINE_MS = 5 * 60 * 1000;     // « en ligne » = vu il y a < 5 min
const RETENTION_DAYS = 120;          // rétention (RGPD : minimisation) — purge auto des jours plus vieux
// Stockage par JOUR : /kdmc_access/events/<YYYY-MM-DD>/<pushid>. Évite l'index RTDB
// (orderBy REST exige .indexOn, absent sur ce chemin deny) ET permet la purge par
// bucket-jour. Lecture = GET du nœud complet (borné par la rétention), tri en mémoire.
const day = () => new Date().toISOString().slice(0, 10);

// Allowlist CORS pour /log (les apps de Kevin uniquement).
const ORIGIN_OK = [
  /^https:\/\/([a-z0-9-]+\.)?kd-mc\.com$/i,
  /^https:\/\/9r4rxssx64-creator\.github\.io$/i,
  /^https:\/\/[a-z0-9-]+\.workers\.dev$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

function corsHeaders(origin) {
  const ok = origin && ORIGIN_OK.some((re) => re.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://kd-mc.com',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-apex-pin,x-kdmc-app',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}
function b64url(input) {
  let str = typeof input === 'string' ? btoa(input) : btoa(String.fromCharCode.apply(null, input));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// Comparaison en temps constant (anti timing-attack sur le PIN).
function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ── Service-account → access_token OAuth2 (scope firebase.database), caché en mémoire ──
let _tok = { value: null, exp: 0 };
async function importKey(pem) {
  const body = String(pem || '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '').replace(/\s+/g, '');
  const bin = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', bin, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}
async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_tok.value && _tok.exp > now + 60) return _tok.value;
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return null;
  let pk = String(env.FIREBASE_PRIVATE_KEY || '').trim();
  if ((pk.startsWith('"') && pk.endsWith('"'))) pk = pk.slice(1, -1);
  if (pk.startsWith('{')) { try { const j = JSON.parse(pk); if (j.private_key) pk = j.private_key; } catch (_) {} }
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  let key;
  try { key = await importKey(pk); } catch (e) { return null; }
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claim));
  const jwt = header + '.' + claim + '.' + b64url(new Uint8Array(sig));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) return null;
  _tok = { value: j.access_token, exp: now + (parseInt(j.expires_in, 10) || 3600) };
  return _tok.value;
}

function clip(v, n) { return v == null ? '' : String(v).slice(0, n); }
/* Empreinte salée et tronquée de l'adresse IP : permet de voir « même réseau / réseau différent »
   sans garder l'adresse elle-même 120 jours. Sans sel (secret KDMC_IP_SEL) → rien n'est gardé. */
async function ipEmpreinte(env, ip) {
  const sel = env && env.KDMC_IP_SEL;
  if (!sel || !ip) return '';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(sel) + '|' + String(ip)));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// Purge auto (RGPD minimisation) : ~1 log sur 40 supprime les buckets-jour trop vieux.
let _pruneN = 0;
async function maybePrune(env, token) {
  _pruneN++;
  if (_pruneN % 40 !== 1) return;
  try {
    const r = await fetch(`${FB_URL}/${LOG_PATH}.json?shallow=true&access_token=${encodeURIComponent(token)}`);
    const days = await r.json();
    if (!days || typeof days !== 'object') return;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
    const patch = {};
    for (const d of Object.keys(days)) if (d < cutoff) patch[d] = null; // YYYY-MM-DD → comparaison lexicographique = chronologique
    if (Object.keys(patch).length) {
      await fetch(`${FB_URL}/${LOG_PATH}.json?access_token=${encodeURIComponent(token)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
    }
  } catch (_) { /* fail-open */ }
}

// ── POST /log : append d'un évènement — porteur de session du domaine OBLIGATOIRE ──
async function handleLog(request, env, origin) {
  const s = await sessionDomaine(request, env);
  if (!s) return json({ ok: false, error: 'unauthorized', detail: 'session du domaine requise (Authorization: Bearer ou cookie kdmc_sso)' }, 401, origin);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'bad_json' }, 400, origin); }
  const ev = {
    app: clip(body.app, 40) || 'inconnu',
    /* uid et nom = ceux de la SESSION (imposés) : le corps ne peut pas se faire passer pour un autre. */
    uid: clip(s.uid, 80),
    name: clip(s.name, 120) || clip(body.name, 120) || 'Anonyme',
    event: clip(body.event, 60) || 'connexion',
    device: clip(body.device, 40),
    ua: clip(body.ua || request.headers.get('user-agent'), 180),
    tier: clip(s.admin === true ? 'admin' : body.tier, 24),
    meta: body.meta && typeof body.meta === 'object' ? JSON.parse(clip(JSON.stringify(body.meta), 600)) : undefined,
    ip_h: await ipEmpreinte(env, request.headers.get('cf-connecting-ip')),
    country: clip((request.cf && request.cf.country) || request.headers.get('cf-ipcountry'), 4),
    ts: Date.now(),
  };
  if (!ev.ip_h) delete ev.ip_h;
  const token = await getAccessToken(env);
  if (!token) return new Response(null, { status: 204, headers: corsHeaders(origin) }); // fail-open
  try {
    await fetch(`${FB_URL}/${LOG_PATH}/${day()}.json?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev),
    });
    await maybePrune(env, token);
  } catch (_) { /* fail-open : ne jamais bloquer l'app appelante */ }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

/* (27.09.2026, « reconnu par n'importe quel chemin ») : la session VÉRIFIÉE de Kevin (cookie kdmc_sso
   du domaine, envoyé à admin.kd-mc.com aussi, ou Bearer) vaut le code admin. Ce worker n'a pas le
   secret du domaine : il demande au domaine lui-même (/__sso/whoami), qui est la seule vérité. */
/* La session du domaine (Bearer ou cookie kdmc_sso), vérifiée par le domaine : { uid, name, admin, verified } ou null. */
async function sessionDomaine(request, env) {
  try {
    const auth = request.headers.get('authorization') || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    const c = (request.headers.get('cookie') || '').match(/(?:^|;\s*)kdmc_sso=([^;]+)/);
    const token = m ? m[1].trim() : (c ? decodeURIComponent(c[1]) : '');
    if (!token) return null;
    const r = await fetch(((env && env.KDMC_SSO_URL) || 'https://kd-mc.com') + '/__sso/whoami', { headers: { authorization: 'Bearer ' + token } });
    const j = await r.json();
    if (!j || !j.ok || !j.uid) return null;
    return { uid: String(j.uid), name: String(j.name || ''), admin: j.admin === true, verified: j.verified === true };
  } catch (_) { return null; }
}
async function sessionAdmin(request, env) {
  const s = await sessionDomaine(request, env);
  return !!(s && s.admin && s.verified);
}
// ── GET /history : agrégé par personne (PIN admin EN EN-TÊTE, OU session vérifiée de l'admin) ──
async function handleHistory(request, env, origin) {
  const pin = (request.headers.get('x-apex-pin') || '').toLowerCase().trim();
  const expected = String(env.APEX_ADMIN_PIN_SHA256 || '').toLowerCase().trim();
  if (!expected) return json({ ok: false, error: 'pin_not_configured' }, 503, origin);
  if (!safeEqual(pin, expected) && !(await sessionAdmin(request, env))) return json({ ok: false, error: 'unauthorized' }, 401, origin);
  const token = await getAccessToken(env);
  if (!token) return json({ ok: false, error: 'fb_unavailable' }, 503, origin);
  let raw;
  try {
    // Pas d'orderBy (exigerait un index RTDB, absent sur ce chemin) : on lit le nœud
    // complet (borné par la rétention) et on aplatit les buckets-jour.
    const r = await fetch(`${FB_URL}/${LOG_PATH}.json?access_token=${encodeURIComponent(token)}`);
    raw = await r.json();
  } catch (e) { return json({ ok: false, error: 'fb_read_failed', detail: String(e && e.message || e) }, 502, origin); }
  const events = [];
  if (raw && typeof raw === 'object') {
    for (const dayNode of Object.values(raw)) {
      if (dayNode && typeof dayNode === 'object') for (const ev of Object.values(dayNode)) if (ev && typeof ev === 'object' && ev.ts) events.push(ev);
    }
  }
  const now = Date.now();
  const people = {};
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const key = (e.uid || e.name || 'anon').toString();
    let p = people[key];
    if (!p) p = people[key] = { key, name: e.name || key, uid: e.uid || '', apps: {}, devices: {}, tiers: {}, firstSeen: e.ts, lastSeen: e.ts, count: 0, recent: [] };
    p.count++;
    if (e.name) p.name = e.name;
    if (e.app) p.apps[e.app] = (p.apps[e.app] || 0) + 1;
    if (e.device) p.devices[e.device] = (p.devices[e.device] || 0) + 1;
    if (e.tier) p.tiers[e.tier] = (p.tiers[e.tier] || 0) + 1;
    if (e.ts < p.firstSeen) p.firstSeen = e.ts;
    if (e.ts > p.lastSeen) p.lastSeen = e.ts;
    p.recent.push({ app: e.app, event: e.event, device: e.device, ts: e.ts, country: e.country, meta: e.meta });
  }
  const list = Object.values(people).map((p) => {
    p.recent.sort((a, b) => b.ts - a.ts);
    p.recent = p.recent.slice(0, 60);
    p.online = now - p.lastSeen < ONLINE_MS;
    p.appsList = Object.keys(p.apps);
    p.devicesList = Object.keys(p.devices);
    return p;
  }).sort((a, b) => b.lastSeen - a.lastSeen);
  return json({ ok: true, people: list, totalPeople: list.length, totalEvents: events.length, ts: now }, 200, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    /* Audit du domaine 27.09.2026 (sonde run 36339597151) : http://admin.kd-mc.com/ répondait 200 en clair. */
    if (url.protocol === 'http:') { url.protocol = 'https:'; return new Response(null, { status: 301, headers: { location: url.toString() } }); }
    const origin = request.headers.get('origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (url.pathname === '/health') return json({ ok: true, service: 'kdmc-access' }, 200, origin);
    if (url.pathname === '/log' && request.method === 'POST') return handleLog(request, env, origin);
    if (url.pathname === '/history' && request.method === 'GET') return handleHistory(request, env, origin);
    /* « Qui se connecte ne fonctionne pas » (Kevin 6.10, capture : {"ok":false,"error":"not_found"} sur admin.kd-mc.com) :
       seul « / » servait la page ; tout autre chemin ouvert à la main ou depuis un raccourci (/index.html, /qui, /?x…)
       tombait sur l'erreur brute. Une PAGE demandée (GET/HEAD, hors API) montre donc toujours la page ; seules les
       API inconnues (JSON) gardent le 404. */
    const estApi = /^\/(health|log|history)\b/.test(url.pathname) || /\.(js|json|css|map|png|svg|ico|txt|xml)$/i.test(url.pathname);
    if (url.pathname === '/' || url.pathname === '' || ((request.method === 'GET' || request.method === 'HEAD') && !estApi)) {
      /* Audit du domaine 27.09.2026 : cette page (admin.kd-mc.com) partait sans aucun en-tête de
         sécurité (note 0/100). Page admin → jamais encadrable, jamais de référent, HTTPS forcé. */
      return new Response(PAGE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', 'Content-Security-Policy': "frame-ancestors 'none'" } });
    }
    return json({ ok: false, error: 'not_found' }, 404, origin);
  },
};
