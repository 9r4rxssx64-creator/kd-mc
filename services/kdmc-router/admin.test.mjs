/* Test régression admin domaine + registre fiches (KV mock). node admin.test.mjs
   NB: request.cf (géo Cloudflare) n'existe pas sous Node → l'enrichissement géo
   est vérifié en prod, pas ici (on teste le reste : nom/CGU/hits/device/admin-gate).
   GATE FAIL-CLOSED (leçons #98/#99) : sans hash de PIN configuré, /__admin/* est
   FERMÉ (le nom auto-asserté ne donne JAMAIS l'accès). L'accès exige un grant signé
   prouvé via /__admin/login. */
import mod from './worker.js';
import { createHmac as _hmacT } from 'node:crypto';
const _b64uT = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/* Depuis le 8.10, /__sso/issue ne délivre plus de session au nom de Kevin : une session FAIBLE à son nom (comme en ont pu fabriquer
   les anciens appels) se signe ici, pour prouver qu'elle n'ouvre toujours rien. */
const passFaible = (uid, n, secret = 'sec') => { const p = _b64uT(JSON.stringify({ u: uid, n, c: 1, v: 0, k: 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + _b64uT(_hmacT('sha256', secret).update(p).digest()); };
import { createHash } from 'crypto';
const store = new Map();
const ACCOUNTS = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, ACCOUNTS };
const REQ = (o) => new Request('https://kd-mc.com' + o.path, { method: o.method || 'GET', headers: o.headers || {}, body: o.body });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const issue = async (uid, name) => { const r = await mod.fetch(REQ({ path: '/__sso/issue', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid, name, cgu: true }) }), env); return (r.headers.get('set-cookie').match(/kdmc_sso=([^;]+)/) || [])[1]; };

const cKevin = passFaible('kdmc_admin', 'Kevin Desarzens');
await issue('laurence-sp', 'Laurence Saint-Polit');
await issue('marie-dupont', 'Marie Dupont');

const fiche = JSON.parse(store.get('acc:marie-dupont'));
ok(fiche.name === 'Marie Dupont' && fiche.cgu_at > 0 && fiche.hits >= 1 && fiche.last_device, 'fiche client enrichie (nom+CGU+hits+device)');

let r = await mod.fetch(REQ({ path: '/__admin/accounts' }), env);
ok(r.status === 403, 'admin accounts sans session → 403');
r = await mod.fetch(REQ({ path: '/__admin/accounts', headers: { cookie: 'kdmc_sso=' + await issue('laurence-sp', 'Laurence Saint-Polit') } }), env);
ok(r.status === 403, 'admin accounts session NON-admin → 403');
/* FAIL-CLOSED : sans hash PIN, même un token "nom-admin" n'ouvre RIEN. */
r = await mod.fetch(REQ({ path: '/__admin/accounts', headers: { cookie: 'kdmc_sso=' + cKevin } }), env);
ok(r.status === 403, 'FAIL-CLOSED : sans hash PIN, token nom-admin → 403 (plus de fail-open par nom)');

/* whoami : le flag admin EXIGE verified (Face ID). Un uid admin AUTO-DÉCLARÉ
   (cKevin = issue, non vérifié) → admin:false (leçon #99). L'admin réel ne vient
   que d'un passkey vérifié (webauthn.test.mjs). */
r = await mod.fetch(REQ({ path: '/__sso/whoami', headers: { cookie: 'kdmc_sso=' + cKevin } }), env); let j = await r.json();
ok(j.ok && j.verified === false && j.admin === false, 'whoami Kevin auto-déclaré (non vérifié) → admin:false');
r = await mod.fetch(REQ({ path: '/__sso/whoami', headers: { cookie: 'kdmc_sso=' + await issue('marie-dupont', 'Marie Dupont') } }), env); j = await r.json();
ok(j.ok && j.admin === false, 'whoami client → admin:false');

/* ---- Gate admin (hash du PIN présent) : le nom auto-asserté ne suffit pas ---- */
const CODE = '424242';
const HASH = createHash('sha256').update(CODE).digest('hex');
const envH = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, KDMC_ADMIN_PIN_SHA256: HASH, ACCOUNTS };
r = await mod.fetch(REQ({ path: '/__admin/accounts', headers: { cookie: 'kdmc_sso=' + cKevin } }), envH); j = await r.json();
ok(r.status === 403 && j.reason === 'need_admin_code', 'token nom-admin SANS code → 403 need_admin_code (trou fermé)');
r = await mod.fetch(REQ({ path: '/__admin/login', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: '000000' }) }), envH); j = await r.json();
ok(j.ok === false && j.reason === 'code_invalide', 'login admin mauvais code → refusé');
r = await mod.fetch(REQ({ path: '/__admin/login', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: CODE }) }), envH); j = await r.json();
ok(j.ok === true && typeof j.grant === 'string' && j.grant.indexOf('.') > 0, 'login admin bon code → grant signé');
const grant = j.grant;
r = await mod.fetch(REQ({ path: '/__admin/accounts', headers: { 'x-kdmc-admin': grant } }), envH); j = await r.json();
ok(j.ok === true && j.count >= 3 && j.accounts.some((a) => a.uid === 'marie-dupont'), 'grant via header x-kdmc-admin → voit toutes les fiches (≥3)');
r = await mod.fetch(REQ({ path: '/__admin/accounts', headers: { cookie: 'kdmc_admin=' + grant } }), envH); j = await r.json();
ok(j.ok === true, 'grant via cookie kdmc_admin → accès fiches OK');
r = await mod.fetch(REQ({ path: '/__admin/accounts', headers: { 'x-kdmc-admin': grant.slice(0, -2) + 'XY' } }), envH);
ok(r.status === 403, 'grant falsifié → 403');
r = await mod.fetch(REQ({ path: '/__admin/accounts' }), envH);
ok(r.status === 403, 'aucun grant → 403 (même avec hash configuré)');
/* sans KV mais AVEC preuve admin valide → fail-open (0 fiche, pas d'erreur). */
r = await mod.fetch(REQ({ path: '/__admin/accounts', headers: { 'x-kdmc-admin': grant } }), { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, KDMC_ADMIN_PIN_SHA256: HASH }); j = await r.json();
ok(j.ok === true && j.kv === false, 'sans KV → fail-open (0 fiche, pas d\'erreur)');
/* sans secret du tout → fermé. */
r = await mod.fetch(REQ({ path: '/__admin/accounts', headers: { 'x-kdmc-admin': grant } }), { ACCOUNTS });
ok(r.status === 403, 'sans secret → 403 (fermé)');

/* ---- Rate-limit serveur du code admin (anti brute-force) ---- */
const store2 = new Map();
const ACC2 = { get: async (k) => (store2.has(k) ? store2.get(k) : null), put: async (k, v) => { store2.set(k, v); }, delete: async (k) => { store2.delete(k); } };
const envR = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, KDMC_ADMIN_PIN_SHA256: HASH, ACCOUNTS: ACC2 };
const badLogin = () => mod.fetch(REQ({ path: '/__admin/login', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: '999999' }) }), envR);
for (let i = 0; i < 5; i++) { j = await (await badLogin()).json(); }
ok(j.reason === 'code_invalide', '5 codes faux → encore code_invalide (pas encore bloqué)');
j = await (await badLogin()).json();
ok(j.reason === 'rate_limited' && j.wait > 0, '6e tentative → rate_limited (lockout serveur)');
j = await (await mod.fetch(REQ({ path: '/__admin/login', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: CODE }) }), envR)).json();
ok(j.reason === 'rate_limited', 'lockout actif → même le BON code est bloqué');
/* fail-open : sans KV, pas de blocage (jamais de lockout si KV KO) */
const envNoKv = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, KDMC_ADMIN_PIN_SHA256: HASH };
for (let i = 0; i < 8; i++) { await mod.fetch(REQ({ path: '/__admin/login', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: '999999' }) }), envNoKv); }
j = await (await mod.fetch(REQ({ path: '/__admin/login', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: CODE }) }), envNoKv)).json();
ok(j.ok === true && typeof j.grant === 'string', 'sans KV → fail-open : bon code accepté même après 8 échecs (jamais de lockout)');

/* ---- Journal d'audit admin (événements sensibles tracés) ---- */
r = await mod.fetch(REQ({ path: '/__admin/audit', headers: { 'x-kdmc-admin': grant } }), envH); j = await r.json();
ok(j.ok === true && Array.isArray(j.log)
  && j.log.some((e) => e.ev === 'admin_login_ok')
  && j.log.some((e) => e.ev === 'admin_login_fail' && typeof e.device === 'string' && 'asn' in e && 'place' in e), 'journal admin : connexion réussie + code refusé tracés — avec appareil, lieu et réseau (8.10)');
r = await mod.fetch(REQ({ path: '/__admin/audit' }), envH);
ok(r.status === 403, 'journal admin sans preuve → 403');

/* ---- ?limit= sur /__admin/accounts (borne la lecture parallèle) ---- */
r = await mod.fetch(REQ({ path: '/__admin/accounts?limit=1', headers: { 'x-kdmc-admin': grant } }), envH); j = await r.json();
ok(j.ok === true && j.accounts.length === 1, 'accounts?limit=1 → 1 fiche');

/* ---- Révocation à distance (« Déconnecter partout ») ---- */
const tMarie = await issue('marie-dupont', 'Marie Dupont');
r = await mod.fetch(REQ({ path: '/__sso/whoami', headers: { cookie: 'kdmc_sso=' + tMarie } }), env); j = await r.json();
ok(j.ok === true, 'avant révocation : session Marie OK');
r = await mod.fetch(REQ({ path: '/__admin/revoke', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid: 'marie-dupont' }) }), envH);
ok(r.status === 403, 'revoke SANS preuve admin → 403');
await new Promise((res) => setTimeout(res, 5)); /* iat(tMarie) < revoked_at garanti */
r = await mod.fetch(REQ({ path: '/__admin/revoke', method: 'POST', headers: { 'content-type': 'application/json', 'x-kdmc-admin': grant }, body: JSON.stringify({ uid: 'marie-dupont' }) }), envH); j = await r.json();
ok(j.ok === true && j.revoked_at > 0, 'revoke avec grant → ok');
r = await mod.fetch(REQ({ path: '/__sso/whoami', headers: { cookie: 'kdmc_sso=' + tMarie } }), env); j = await r.json();
ok(j.ok === false && j.reason === 'session_revoquee', 'ancien token → session_revoquee (déconnecté partout)');
const tMarie2 = await issue('marie-dupont', 'Marie Dupont');
r = await mod.fetch(REQ({ path: '/__sso/whoami', headers: { cookie: 'kdmc_sso=' + tMarie2 } }), env); j = await r.json();
ok(j.ok === true, 'reconnexion APRÈS révocation → nouveau token OK (compte intact, jamais de lockout)');
r = await mod.fetch(REQ({ path: '/__admin/audit', headers: { 'x-kdmc-admin': grant } }), envH); j = await r.json();
ok(j.log.some((e) => e.ev === 'revoke_sessions' && e.uid === 'marie-dupont'), 'révocation tracée dans le journal admin');

/* ---- Throttle écritures KV : un heartbeat rapproché n'écrit PAS (quota free) ---- */
const store3 = new Map(); let puts3 = 0;
const ACC3 = { get: async (k) => (store3.has(k) ? store3.get(k) : null), put: async (k, v) => { puts3++; store3.set(k, v); }, delete: async (k) => { store3.delete(k); } };
const env3 = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, ACCOUNTS: ACC3 };
const r3 = await mod.fetch(REQ({ path: '/__sso/issue', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid: 'beat-user', name: 'Beat User', cgu: true }) }), env3);
const tok3 = (r3.headers.get('set-cookie').match(/kdmc_sso=([^;]+)/) || [])[1];
const putsAfterIssue = puts3;
ok(putsAfterIssue >= 2 && store3.has('acc:beat-user'), 'création de fiche : écrite + indexée');
let w3 = await (await mod.fetch(REQ({ path: '/__sso/whoami', headers: { cookie: 'kdmc_sso=' + tok3 } }), env3)).json();
await mod.fetch(REQ({ path: '/__sso/whoami', headers: { cookie: 'kdmc_sso=' + tok3 } }), env3);
ok(w3.ok === true && puts3 === putsAfterIssue, 'heartbeats rapprochés (<2 min, rien de nouveau) → 0 écriture KV (throttle)');
ok(JSON.parse(store3.get('acc:beat-user')).hits === 1, 'les heartbeats ne gonflent pas les connexions (hits=1)');

/* ---- Alerte push « nouvel appareil » (opt-in par config, fail-open) ---- */
const realFetch = globalThis.fetch;
let pushCalls = [];
globalThis.fetch = async (u, o) => {
  const url = typeof u === 'string' ? u : (u && u.url) || '';
  if (url.indexOf('/send-all') >= 0) { pushCalls.push({ url, body: o && o.body }); return new Response('{"ok":true}', { status: 200 }); }
  return realFetch(u, o);
};
try {
  const st = new Map();
  const AK = { get: async (k) => (st.has(k) ? st.get(k) : null), put: async (k, v) => { st.set(k, v); }, delete: async (k) => { st.delete(k); } };
  const UA_A = { 'user-agent': 'Mozilla/5.0 (iPhone)' };
  const UA_B = { 'user-agent': 'Mozilla/5.0 (Macintosh)' }; /* device différent (desktop·macOS) */
  const ISS = (env0, ua) => mod.fetch(REQ({ path: '/__sso/issue', method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, ua), body: JSON.stringify({ uid: 'push-user', name: 'Push User', cgu: true }) }), env0);

  /* NON configuré (pas de KDMC_PUSH_URL/TOKEN) : jamais d'appel push, même sur nouvel appareil */
  const envNP = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, ACCOUNTS: AK };
  await ISS(envNP, UA_A);                 /* création (isNew) → pas d'alerte */
  await ISS(envNP, UA_B);                 /* nouvel appareil, mais NON configuré */
  ok(pushCalls.length === 0, 'push NON configuré → aucun appel /send-all (repli = journal admin)');

  /* Configuré : nouvel appareil sur fiche existante → 1 alerte push */
  const st2 = new Map();
  const AK2 = { get: async (k) => (st2.has(k) ? st2.get(k) : null), put: async (k, v) => { st2.set(k, v); }, delete: async (k) => { st2.delete(k); } };
  const envP = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, ACCOUNTS: AK2, KDMC_PUSH_URL: 'https://push.example.dev', KDMC_PUSH_TOKEN: 'tok' };
  pushCalls = [];
  await ISS(envP, UA_A);                   /* création → PAS d'alerte (isNew) */
  ok(pushCalls.length === 0, 'création de fiche → pas d\'alerte push (1er appareil)');
  await ISS(envP, UA_B);                   /* 2e appareil → alerte */
  ok(pushCalls.length === 1 && /\/send-all$/.test(pushCalls[0].url), 'nouvel appareil (configuré) → 1 appel /send-all');
  ok(/kdmc-new-device/.test(pushCalls[0].body || ''), 'payload push = tag kdmc-new-device');
  pushCalls = [];
  await ISS(envP, UA_B);                   /* même appareil → pas de nouvelle alerte */
  ok(pushCalls.length === 0, 'même appareil re-vu → pas de nouvelle alerte push');
} finally { globalThis.fetch = realFetch; }

/* ---- Détection d'anomalie géo (changement de pays < 60 min) — enrich() direct ----
   request.cf (géo Cloudflare) n'existe pas via mod.fetch sous Node → on appelle enrich()
   directement avec une requête mockée porteuse de .cf. FLAG jamais BLOQUE (anti-lockout). */
{
  const { enrich } = await import('./worker.js');
  const mkReq = (country, ip) => ({ cf: { country, city: 'X', region: 'Y' }, headers: new Headers({ 'CF-Connecting-IP': ip || '1.2.3.4', 'user-agent': 'Mozilla/5.0 (iPhone)', host: 'apex-chat.kd-mc.com' }) });
  let anomPush = [];
  const rf = globalThis.fetch;
  globalThis.fetch = async (u, o) => { const url = typeof u === 'string' ? u : (u && u.url) || ''; if (url.indexOf('/send-all') >= 0) { anomPush.push(o && o.body); return new Response('{"ok":true}', { status: 200 }); } return rf(u, o); };
  try {
    /* même pays, reconnexion rapide → PAS d'anomalie */
    const sa = new Map(); const AA = { get: async (k) => (sa.has(k) ? sa.get(k) : null), put: async (k, v) => { sa.set(k, v); }, delete: async (k) => { sa.delete(k); } };
    const envA = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, ACCOUNTS: AA, KDMC_PUSH_URL: 'https://push.example.dev', KDMC_PUSH_TOKEN: 'tok' };
    await enrich(envA, mkReq('FR'), 'geo-a', 'Geo A', true);      /* isNew */
    sa.set('acc:geo-a', JSON.stringify(Object.assign(JSON.parse(sa.get('acc:geo-a')), { last_seen: Date.now() - 5 * 60e3 }))); /* rembobine 5 min */
    anomPush = [];
    await enrich(envA, mkReq('FR'), 'geo-a', 'Geo A', true);      /* même pays */
    ok(!JSON.parse(sa.get('acc:geo-a')).anomaly && anomPush.length === 0, 'même pays reconnexion rapide → aucune anomalie');

    /* changement de pays < 60 min → anomalie flaggée + audit + push (jamais bloqué) */
    const sb = new Map(); const AB = { get: async (k) => (sb.has(k) ? sb.get(k) : null), put: async (k, v) => { sb.set(k, v); }, delete: async (k) => { sb.delete(k); } };
    const envB = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, ACCOUNTS: AB, KDMC_PUSH_URL: 'https://push.example.dev', KDMC_PUSH_TOKEN: 'tok' };
    await enrich(envB, mkReq('FR'), 'geo-b', 'Geo B', true);
    sb.set('acc:geo-b', JSON.stringify(Object.assign(JSON.parse(sb.get('acc:geo-b')), { last_seen: Date.now() - 10 * 60e3 }))); /* 10 min avant */
    anomPush = [];
    await enrich(envB, mkReq('US'), 'geo-b', 'Geo B', true);      /* FR → US en 10 min */
    const accB = JSON.parse(sb.get('acc:geo-b'));
    ok(accB.anomaly && accB.anomaly.from === 'FR' && accB.anomaly.to === 'US', 'FR→US <60min → acc.anomaly {from:FR,to:US}');
    ok(anomPush.length === 1 && /connexion suspecte|déplacement impossible/.test(anomPush[0] || ''), 'anomalie géo → 1 alerte push');
    const logB = JSON.parse(sb.get('aud:log') || '[]');
    ok(logB.some((e) => e.ev === 'geo_anomaly' && e.uid === 'geo-b'), 'anomalie géo tracée dans le journal admin');

    /* changement de pays MAIS > 60 min → déplacement légitime, pas d'anomalie */
    const sc = new Map(); const AC = { get: async (k) => (sc.has(k) ? sc.get(k) : null), put: async (k, v) => { sc.set(k, v); }, delete: async (k) => { sc.delete(k); } };
    const envC = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, ACCOUNTS: AC, KDMC_PUSH_URL: 'https://push.example.dev', KDMC_PUSH_TOKEN: 'tok' };
    await enrich(envC, mkReq('FR'), 'geo-c', 'Geo C', true);
    sc.set('acc:geo-c', JSON.stringify(Object.assign(JSON.parse(sc.get('acc:geo-c')), { last_seen: Date.now() - 3 * 60 * 60e3 }))); /* 3 h avant */
    anomPush = [];
    await enrich(envC, mkReq('IT'), 'geo-c', 'Geo C', true);      /* FR → IT en 3 h = OK */
    ok(!JSON.parse(sc.get('acc:geo-c')).anomaly && anomPush.length === 0, 'changement de pays >60 min (déplacement réel) → aucune anomalie');
  } finally { globalThis.fetch = rf; }
}

console.log(`Admin domaine test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
