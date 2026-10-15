/* kdmc-access — Journal unifié « qui se connecte à mon domaine » (Kevin 2026-07-25).
 *
 * UN worker central + isolé (une panne ici ne casse AUCUNE autre app — règle isolation).
 * Chaque app de kd-mc.com POST ses évènements (connexion + actions) → ce worker écrit
 * dans Firebase RTDB avec sa clé SERVICE-ACCOUNT (côté serveur, jamais exposée).
 * La lecture (historique agrégé par personne) est réservée au PIN admin de Kevin.
 *
 * Endpoints :
 *   GET  /              → sert la page admin À UN COMPTE DU DOMAINE ouvert et non révoqué (cookie ou Authorization) ;
 *                         sinon l'ENTRÉE (401, < 2 Ko, aucun octet de la page) dont le script demande GET /page avec le
 *                         pass rangé (app installée : cookies à part) ; refus → la porte « Cette page est réservée ».
 *                         Interrupteur ACCES_PAGE_COMPTE (wrangler.toml) : "0" = ancien comportement.
 *   GET  /page          → la page (text/html) à un compte du domaine vérifié, sinon 401 JSON ; même origine seulement.
 *   GET  /__sso/entrer  → (tuile du portail) 302 vers ?to= + #kdmc_sso=<pass> ; ne vérifie rien, ne pose aucun cookie.
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
    /* 13.10 : le routeur lie le pass à la FAMILLE D'APPAREIL de la personne (iPhone, PC…) et refuse un pass présenté depuis une autre famille. Cet appel part du
       worker (« autre » famille) : sans le User-Agent de la personne, un pass émis sur son iPhone était refusé. On transmet CE SEUL en-tête, rien d'autre. */
    const entetes = { authorization: 'Bearer ' + token }; const ua = request.headers.get('user-agent'); if (ua) entetes['user-agent'] = ua;
    const r = await fetch(((env && env.KDMC_SSO_URL) || 'https://kd-mc.com') + '/__sso/whoami', { headers: entetes });
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

/* 🔒 AUCUNE CONSULTATION SANS COMPTE, NULLE PART (Kevin 3.10.2026) — appliquée ICI le 15.10.2026.
   Mesuré le 15.10 depuis l'extérieur, sans compte : https://admin.kd-mc.com/ répondait 200 avec la page
   « Qui se connecte » complète (32 Ko : tout son code), alors que les 31 autres adresses du domaine montraient
   la porte du routeur (porteGenerale). admin.kd-mc.com est un worker à part : la porte du routeur ne le couvre pas.
   Désormais une PAGE n'est servie qu'à un compte du domaine ouvert et non révoqué — la vérification passe par le
   MÊME canal que /log et /history (sessionDomaine → kd-mc.com/__sso/whoami, qui seul connaît le secret et la
   révocation). Fail-CLOSED : domaine muet, erreur, pass falsifié ou révoqué → la porte, jamais la page.
   L'écran de code DE la page reste pour qui a déjà un compte (la page entre seule pour Kevin reconnu).
   Retour arrière sans toucher au code : ACCES_PAGE_COMPTE = "0" dans wrangler.toml (vars). */
export function accesPageCompteActif(env) { return !(env && String(env.ACCES_PAGE_COMPTE) === '0'); }
const ENTETES_PAGE = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', 'Content-Security-Policy': "frame-ancestors 'none'" };
/* La porte : aucun code de la page admin, aucune donnée, aucun écran de saisie de code. Un seul geste.
   `script` (optionnel) : le petit script de l'ENTRÉE (voir entreeCompte) — la porte y est alors cachée pendant l'essai. */
function porteHtml(url, script) {
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const portail = 'https://kd-mc.com/?return=' + encodeURIComponent(url.href);
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta name="robots" content="noindex"><title>Page réservée</title>'
    + '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1409;color:#f3f0e6;font:16px/1.5 sans-serif;padding:24px 16px;box-sizing:border-box;text-align:center}'
    + '.c{max-width:340px;width:100%}h1{font-size:20px;color:#f6d97a}[hidden]{display:none}'
    + 'a{display:block;min-height:50px;line-height:50px;border-radius:13px;background:#e8b830;color:#11160c;font-weight:700;text-decoration:none}</style></head>'
    + '<body>' + (script ? '<p id="o">Ouverture…</p>' : '')
    + '<div class="c" id="p"' + (script ? ' hidden' : '') + '><div style="font-size:44px">🔒</div><h1>Cette page est réservée.</h1>'
    + '<p>Ouvre d&#39;abord ton compte sur kd-mc.com. Ensuite, reviens ici : la page s&#39;ouvrira.</p>'
    + '<a href="' + esc(portail) + '">Ouvrir mon compte sur kd-mc.com</a></div>'
    + (script ? '<noscript><style>#o{display:none}#p{display:block!important}</style></noscript><script>' + script + '</script>' : '')
    + '</body></html>';
}
export function porteCompte(url) {
  return new Response(porteHtml(url), { status: 401, headers: { ...ENTETES_PAGE, 'x-kdmc-porte': 'compte',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
}

/* 🚪 L'ENTRÉE (15.10.2026, v2) — Kevin ouvre l'admin « depuis l'écran d'accueil (app installée), le domaine, et des fois Safari ».
   Une app installée sur l'écran d'accueil de l'iPhone a ses cookies À PART de Safari (leçons 98, 343) et une NAVIGATION ne
   pose jamais d'en-tête Authorization : une porte posée côté serveur sur la navigation l'enfermait dehors (1er correctif).
   Donc : une navigation SANS session lisible reçoit seulement cette entrée (≈ 2 Ko, aucun octet de PAGE_HTML, aucun champ de
   code). Son script : (a) range un `#kdmc_sso=<pass>` du lien dans localStorage.kdmc_sso_token SI aucun pass n'y est déjà
   (un lien ne remplace pas un pass rangé — lien piégé), et nettoie l'adresse ; (b) demande GET /page avec le cookie ET
   « Authorization: Bearer <pass rangé> » ; (c) 200 → la page reçue remplace le document ; (d) refus → si le lien portait un
   AUTRE pass, un seul essai avec lui (rangé seulement s'il est accepté : un pass rangé mais mort ne doit pas enfermer) ;
   sinon la porte. Le domaine reste seul juge (/page → sessionDomaine → kd-mc.com/__sso/whoami). La CSP de l'entrée est
   celle de la page (frame-ancestors) : le document garde sa CSP après document.open(), une CSP plus stricte bloquerait
   les scripts de la page écrite. */
const ENTREE_JS = "(function(){var K='kdmc_sso_token',L=null,r='',l='';try{L=window.localStorage}catch(e){}"
  + "try{var h=location.hash||'',m=h.match(/[#&]kdmc_sso=([^&]+)/);if(m){l=decodeURIComponent(m[1]);var c=h.replace(/([#&])kdmc_sso=[^&]*/,'$1').replace(/[#&]+$/,'');history.replaceState(null,'',location.pathname+location.search+(c&&c!=='#'?c:''))}}catch(e){}"
  + "try{r=L&&L.getItem(K)||''}catch(e){}"
  + "if(!r&&l){try{L.setItem(K,l)}catch(e){}r=l;l=''}"
  + "function e(t){var o={credentials:'include',headers:{}};if(t)o.headers.Authorization='Bearer '+t;return fetch('/page',o).then(function(x){return x.ok?x.text():null},function(){return null})}"
  + "var D=document;function v(x){D.open();D.write(x);D.close()}"
  + "function p(){D.getElementById('o').hidden=true;D.getElementById('p').hidden=false}"
  + "e(r).then(function(x){if(x)return v(x);if(l&&l!==r)return e(l).then(function(y){if(!y)return p();try{L.setItem(K,l)}catch(e){}v(y)});p()})})();";
export function entreeCompte(url) {
  return new Response(porteHtml(url, ENTREE_JS), { status: 401, headers: { ...ENTETES_PAGE, 'x-kdmc-porte': 'entree', Vary: 'Cookie, Authorization' } });
}

/* GET /page — la page, et SEULEMENT à un compte du domaine ouvert et non révoqué (cookie kdmc_sso OU Bearer), vérifié
   par le domaine. Sinon 401 JSON, sans le moindre morceau de la page. Même origine seulement : aucun en-tête CORS, et un
   appel venu d'un autre site (Sec-Fetch-Site / Origin) est refusé avant même de demander au domaine. */
async function handlePage(request, env) {
  const refus = (raison) => new Response(JSON.stringify({ ok: false, error: raison }), { status: 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie, Authorization' } });
  const site = request.headers.get('sec-fetch-site');
  const origine = request.headers.get('origin');
  if ((site && site !== 'same-origin' && site !== 'none') || (origine && origine !== new URL(request.url).origin)) return refus('origine');
  if (accesPageCompteActif(env) && !(await sessionDomaine(request, env))) return refus('compte_requis');
  return new Response(PAGE_HTML, { status: 200, headers: { ...ENTETES_PAGE, Vary: 'Cookie, Authorization' } });
}

/* /__sso/entrer — la porte d'entrée du portail (kdmc-sso.js `porte()`), qui part vers `<app>/__sso/entrer?to=…&h=…` pour
   déposer la session dans l'app installée. Sur les 32 adresses du routeur, c'est le routeur qui répond ; admin.kd-mc.com
   est un worker à part : sans cette route, la tuile « Qui se connecte » du portail arrivait ici sans rien déposer. Ce worker
   n'a pas le secret du domaine : il ne VÉRIFIE rien ici et ne pose aucun cookie — il remet le pass à l'entrée par le lien
   (`#kdmc_sso=`, jamais envoyé au serveur) et c'est /page qui le fait vérifier par le domaine. Le grant admin de l'enveloppe
   est ignoré (il ne sert pas ici). `to` = chemin du MÊME hôte. */
function handleEntrer(url) {
  let to = url.searchParams.get('to') || '/';
  if (!/^\/(?!\/)/.test(to) || /[\r\n\\]/.test(to) || /^\/__sso\//.test(to)) to = '/';
  let t = url.searchParams.get('t') || '';
  const h = url.searchParams.get('h') || '';
  if (h && h.indexOf('.') > 0) {
    try { const d = JSON.parse(atob(h.slice(0, h.indexOf('.')).replace(/-/g, '+').replace(/_/g, '/'))); if (d && typeof d.t === 'string' && d.t) t = d.t; } catch (_) { /* enveloppe illisible : rien */ }
  }
  t = String(t).slice(0, 4096);
  const dest = t ? to + (to.indexOf('#') >= 0 ? '&' : '#') + 'kdmc_sso=' + encodeURIComponent(t) : to;
  return new Response(null, { status: 302, headers: { location: dest, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
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
    if (url.pathname === '/page' && request.method === 'GET') return handlePage(request, env);
    if (url.pathname === '/__sso/entrer' && request.method === 'GET') return handleEntrer(url);
    const estApi = /^\/(health|log|history|page|__sso)\b/.test(url.pathname) || /\.(js|json|css|map|png|svg|ico|txt|xml)$/i.test(url.pathname);
    if (url.pathname === '/' || url.pathname === '' || ((request.method === 'GET' || request.method === 'HEAD') && !estApi)) {
      /* 15.10.2026 (v2) : une navigation SANS session lisible (app installée : ni cookie de Safari, ni en-tête) reçoit
         l'ENTRÉE, qui demande la page par /page avec le pass rangé ; une navigation AVEC session valide reçoit la page. */
      if (accesPageCompteActif(env) && !(await sessionDomaine(request, env))) return entreeCompte(url);
      /* Audit du domaine 27.09.2026 : cette page (admin.kd-mc.com) partait sans aucun en-tête de
         sécurité (note 0/100). Page admin → jamais encadrable, jamais de référent, HTTPS forcé. */
      return new Response(PAGE_HTML, { status: 200, headers: ENTETES_PAGE });
    }
    return json({ ok: false, error: 'not_found' }, 404, origin);
  },
};
