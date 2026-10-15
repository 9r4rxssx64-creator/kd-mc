// Preuve worker kdmc-access : CORS, /log (append + fail-open), /history (PIN gate +
// agrégation par personne). fetch OAuth+Firebase mockés, clé RSA générée à la volée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker from './worker.js';
import { PAGE_HTML } from './page.js';
import { readFileSync } from 'node:fs';

const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const PIN = '424242';
const PIN_SHA = crypto.createHash('sha256').update(PIN).digest('hex');
const ENV = { FIREBASE_CLIENT_EMAIL: 'sa@x.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: privateKey, APEX_ADMIN_PIN_SHA256: PIN_SHA };

const NOW = Date.now();
// Stockage par bucket-jour : { '<YYYY-MM-DD>': { id: ev } }
const FB_NESTED = {
  '2026-08-04': {
    a: { app: 'cmcteams', uid: 'U11804', name: 'Kevin DESARZENS', event: 'connexion', device: 'iPhone', tier: 'admin', ts: NOW - 1000 },
    b: { app: 'apex', uid: 'U11804', name: 'Kevin DESARZENS', event: 'ouvre chat', device: 'iPhone', ts: NOW - 60000 },
    c: { app: 'apex-chat', uid: 'laurence', name: 'Laurence', event: 'connexion', device: 'Android', tier: 'laurence', ts: NOW - 9 * 60000 },
  },
  '2020-01-01': { old: { app: 'cmcteams', uid: 'x', name: 'Vieux', event: 'connexion', ts: 1577836800000 } }, // > rétention → à purger
};

/* Sessions du domaine simulées (kd-mc.com/__sso/whoami) : un pass → qui c'est. */
const SESSIONS = {
  'pass-kevin': { ok: true, uid: 'kdmc_admin', name: 'Kevin Desarzens', admin: true, verified: true },
  'pass-marie': { ok: true, uid: 'marie-dupont', name: 'Marie Dupont', admin: false, verified: true },
};
function mockFetch(capture) {
  capture.patched = null; capture.posted = null;
  return async (url, opts) => {
    const u = String(url); const m = (opts && opts.method) || 'GET';
    if (u.includes('/__sso/whoami')) {
      const h = (opts && opts.headers && (opts.headers.authorization || opts.headers.Authorization)) || '';
      const s = SESSIONS[String(h).replace(/^Bearer\s+/i, '')];
      return new Response(JSON.stringify(s || { ok: false }), { status: 200 });
    }
    if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 });
    // écriture = POST dans un bucket-jour /kdmc_access/events/<jour>.json
    if (m === 'POST' && /\/kdmc_access\/events\/\d{4}-\d{2}-\d{2}\.json/.test(u)) { capture.posted = JSON.parse(opts.body); return new Response('{"name":"id"}', { status: 200 }); }
    if (u.includes('/kdmc_access/events.json')) {
      if (u.includes('shallow=true')) return new Response(JSON.stringify(Object.fromEntries(Object.keys(FB_NESTED).map((d) => [d, true]))), { status: 200 });
      if (m === 'PATCH') { capture.patched = JSON.parse(opts.body); return new Response('{}', { status: 200 }); }
      return new Response(JSON.stringify(FB_NESTED), { status: 200 }); // GET history (nœud complet)
    }
    return new Response('{}', { status: 200 });
  };
}
const req = (path, opts) => new Request('https://admin.kd-mc.com' + path, opts);

test('GET /health → ok', async () => {
  const r = await worker.fetch(req('/health'), ENV);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('OPTIONS → 204 + CORS', async () => {
  const r = await worker.fetch(req('/', { method: 'OPTIONS', headers: { origin: 'https://cmcteams.kd-mc.com' } }), ENV);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://cmcteams.kd-mc.com');
});

test('CORS : origine inconnue → pas reflétée (défaut kd-mc.com)', async () => {
  const r = await worker.fetch(req('/', { method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } }), ENV);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://kd-mc.com');
});

/* Audit 2026-10-08 : /log exige un porteur de session du domaine ; l'uid et le nom viennent de la
   session (le corps ne choisit plus qui il est), l'IP n'est plus gardée en clair. */
test('POST /log avec session → 204 + évènement écrit, uid/nom IMPOSÉS par la session', async () => {
  const cap = {};
  const orig = globalThis.fetch; globalThis.fetch = mockFetch(cap);
  try {
    const r = await worker.fetch(req('/log', { method: 'POST', headers: { origin: 'https://apex-ai.kd-mc.com', 'content-type': 'application/json', authorization: 'Bearer pass-kevin', 'cf-connecting-ip': '203.0.113.9' }, body: JSON.stringify({ app: 'apex', uid: 'usurpe', name: 'Quelqu\'un d\'autre', event: 'connexion', device: 'iPhone' }) }), { ...ENV, KDMC_IP_SEL: 'sel-de-test' });
    assert.equal(r.status, 204);
    assert.ok(cap.posted, 'un POST Firebase a eu lieu');
    assert.equal(cap.posted.app, 'apex');
    assert.equal(cap.posted.event, 'connexion');
    assert.equal(cap.posted.uid, 'kdmc_admin', 'uid = celui de la session, pas celui du corps');
    assert.equal(cap.posted.name, 'Kevin Desarzens', 'nom = celui de la session');
    assert.equal(cap.posted.ip, undefined, 'IP en clair : absente');
    assert.match(cap.posted.ip_h || '', /^[0-9a-f]{16}$/, 'IP : empreinte salée tronquée');
    assert.ok(cap.posted.ts > 0, 'horodaté serveur');
    assert.ok(cap.patched && cap.patched['2020-01-01'] === null, 'purge auto : bucket-jour hors rétention supprimé');
    assert.ok(!('2026-08-04' in (cap.patched || {})), 'purge : bucket récent conservé');
  } finally { globalThis.fetch = orig; }
});

test('POST /log SANS session → 401 (le journal ne s\'écrit plus depuis n\'importe où)', async () => {
  const cap = {};
  const orig = globalThis.fetch; globalThis.fetch = mockFetch(cap);
  try {
    const r = await worker.fetch(req('/log', { method: 'POST', headers: { origin: 'https://apex-ai.kd-mc.com', 'content-type': 'application/json' }, body: JSON.stringify({ app: 'apex', uid: 'U11804', name: 'Kevin', event: 'connexion' }) }), ENV);
    assert.equal(r.status, 401);
    assert.equal(cap.posted, null, 'rien n\'est écrit');
    const r2 = await worker.fetch(req('/log', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer pass-inconnu' }, body: '{}' }), ENV);
    assert.equal(r2.status, 401, 'pass inconnu du domaine → refusé');
  } finally { globalThis.fetch = orig; }
});

test('POST /log sans sel IP → aucune trace d\'adresse (ni claire ni hachée)', async () => {
  const cap = {};
  const orig = globalThis.fetch; globalThis.fetch = mockFetch(cap);
  try {
    const r = await worker.fetch(req('/log', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer pass-marie', 'cf-connecting-ip': '203.0.113.9' }, body: JSON.stringify({ app: 'lingua', event: 'progression' }) }), ENV);
    assert.equal(r.status, 204);
    assert.equal(cap.posted.ip, undefined); assert.equal(cap.posted.ip_h, undefined);
    assert.equal(cap.posted.uid, 'marie-dupont');
  } finally { globalThis.fetch = orig; }
});

test('POST /log fail-open si secrets FB absents → 204 (jamais bloquer l\'app), mais seulement avec session', async () => {
  const orig = globalThis.fetch; globalThis.fetch = mockFetch({});
  try {
    const r = await worker.fetch(req('/log', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer pass-marie' }, body: JSON.stringify({ app: 'x', event: 'y' }) }), { APEX_ADMIN_PIN_SHA256: PIN_SHA });
    assert.equal(r.status, 204);
  } finally { globalThis.fetch = orig; }
});

test('GET /history sans PIN → 401', async () => {
  const r = await worker.fetch(req('/history'), ENV);
  assert.equal(r.status, 401);
});

test('GET /history avec le PIN dans l\'ADRESSE (?pin=) → 401 (plus jamais accepté en URL)', async () => {
  const r = await worker.fetch(req('/history?pin=' + PIN_SHA), ENV);
  assert.equal(r.status, 401);
});

test('GET /history avec session admin vérifiée du domaine → 200 (sans code)', async () => {
  const orig = globalThis.fetch; globalThis.fetch = mockFetch({});
  try {
    const r = await worker.fetch(req('/history', { headers: { authorization: 'Bearer pass-kevin' } }), ENV);
    assert.equal(r.status, 200);
    const r2 = await worker.fetch(req('/history', { headers: { authorization: 'Bearer pass-marie' } }), ENV);
    assert.equal(r2.status, 401, 'une session vérifiée NON admin ne lit pas le journal');
  } finally { globalThis.fetch = orig; }
});

test('GET /history mauvais PIN → 401', async () => {
  const r = await worker.fetch(req('/history', { headers: { 'x-apex-pin': 'deadbeef' } }), ENV);
  assert.equal(r.status, 401);
});

test('GET /history bon PIN → 200 + agrégé par personne', async () => {
  const orig = globalThis.fetch; globalThis.fetch = mockFetch({});
  try {
    const r = await worker.fetch(req('/history', { headers: { 'x-apex-pin': PIN_SHA } }), ENV);
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.ok, true);
    assert.equal(d.totalPeople, 3, '3 personnes distinctes (buckets-jour aplatis)');
    assert.equal(d.totalEvents, 4);
    const kevin = d.people.find((p) => p.uid === 'U11804');
    assert.ok(kevin, 'Kevin présent');
    assert.equal(kevin.count, 2, '2 évènements Kevin');
    assert.deepEqual(kevin.appsList.sort(), ['apex', 'cmcteams'], 'apps regroupées');
    assert.equal(kevin.online, true, 'vu il y a <5min → en ligne');
    const laur = d.people.find((p) => p.name === 'Laurence');
    assert.equal(laur.online, false, 'vu il y a 9min → hors ligne');
    assert.ok(kevin.recent.length >= 2 && kevin.recent[0].ts >= kevin.recent[1].ts, 'timeline triée récente→ancienne');
  } finally { globalThis.fetch = orig; }
});

/* 15.10.2026 — « Aucune consultation sans compte, nulle part » : la page n'est servie qu'à un compte du domaine
   ouvert et non révoqué. Avant, ce test servait la page à un ANONYME : il décrivait l'ancien comportement. */
test('GET / avec session du domaine (cookie kdmc_sso) → sert la page admin HTML', async () => {
  const orig = globalThis.fetch; globalThis.fetch = mockFetch({});
  try {
    const r = await worker.fetch(req('/', { headers: { cookie: 'autre=1; kdmc_sso=pass-kevin' } }), ENV);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') || '', /text\/html/);
    const html = await r.text();
    assert.match(html, /Qui se connecte/);
    assert.match(html, /x-apex-pin/);
    /* Audit 2026-10-08 : plus de « se souvenir » ni d'empreinte du code gardée sur l'appareil. */
    assert.ok(!/localStorage\.setItem\(\s*['"]?kdmc_access_pinhash/.test(html) && !/setItem\(KEY/.test(html), 'la page ne mémorise plus l\'empreinte du code');
    assert.ok(!/Se souvenir de cet appareil/.test(html), 'plus de case « se souvenir »');
    /* une session simple (non admin) ouvre la PAGE ; les DONNÉES restent derrière la session admin ou le code */
    const r2 = await worker.fetch(req('/', { headers: { cookie: 'kdmc_sso=pass-marie' } }), ENV);
    assert.equal(r2.status, 200, 'compte du domaine non admin → la page (son écran de code)');
    const r3 = await worker.fetch(req('/', { headers: { authorization: 'Bearer pass-kevin' } }), ENV);
    assert.equal(r3.status, 200, 'pass en Authorization → la page');
  } finally { globalThis.fetch = orig; }
});

const ENTETES_SECU = ['x-frame-options', 'x-content-type-options', 'referrer-policy', 'strict-transport-security', 'content-security-policy', 'cache-control'];
/* Morceaux qui n'existent QUE dans la page admin : aucun ne doit fuiter dans la porte ni dans l'entrée. */
const MORCEAUX_PAGE = ['Qui se connecte', 'x-apex-pin', '/history', 'Déverrouiller', 'type="password"', 'submitPin', '<input', '<form', 'kdmc_access'];
function sansPage(html, quoi) {
  for (const m of MORCEAUX_PAGE) assert.ok(!html.includes(m), quoi + ' : ne contient pas « ' + m + ' »');
  for (let i = 0; i + 120 <= PAGE_HTML.length; i += 400) assert.ok(!html.includes(PAGE_HTML.slice(i, i + 120)), quoi + ' : aucun morceau du code de la page (octet ' + i + ')');
}
function assertPorteTexte(html, quoi) {
  assert.match(html, /Cette page est réservée/, quoi);
  assert.match(html, /Ouvre d&#39;abord ton compte sur kd-mc\.com/, quoi);
}
/* La porte « sèche » (sans script) — gardée pour qui l'appelle directement. */
function assertPorte(r, html, quoi) {
  assert.equal(r.status, 401, quoi + ' : porte 401');
  assert.equal(r.headers.get('x-kdmc-porte'), 'compte', quoi + ' : marquée porte');
  for (const h of ENTETES_SECU) assert.ok(r.headers.get(h), quoi + ' : en-tête de sécurité ' + h);
  assertPorteTexte(html, quoi);
  assert.ok(!html.includes('<script'), quoi + ' : aucune ligne de script');
  sansPage(html, quoi);
}
/* L'ENTRÉE (v2) : ce que reçoit une navigation sans session lisible (app installée, anonyme, session révoquée…). */
function assertEntree(r, html, quoi) {
  assert.equal(r.status, 401, quoi + ' : entrée 401 (jamais 200 sans compte)');
  assert.equal(r.headers.get('x-kdmc-porte'), 'entree', quoi + ' : marquée entrée');
  for (const h of ENTETES_SECU) assert.ok(r.headers.get(h), quoi + ' : en-tête de sécurité ' + h);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('access-control-allow-origin'), null, quoi + ' : aucun CORS');
  assertPorteTexte(html, quoi + ' (porte écrite dans l\'entrée, cachée pendant l\'essai)');
  assert.ok(/fetch\('\/page'/.test(html), quoi + ' : l\'entrée demande /page');
  assert.ok(/Authorization='Bearer '/.test(html) && /credentials:'include'/.test(html), quoi + ' : cookie + Bearer');
  assert.ok(Buffer.byteLength(html) <= 2100, quoi + ' : entrée légère (' + Buffer.byteLength(html) + ' octets)');
  sansPage(html, quoi);
}

test('GET / inconnu (sans compte) → l\'ENTRÉE (≤ 2 Ko), aucun octet de la page, lien de retour vers le portail', async () => {
  const orig = globalThis.fetch; let appels = 0; const m = mockFetch({});
  globalThis.fetch = async (u, o) => { appels++; return m(u, o); };
  try {
    const r = await worker.fetch(req('/'), ENV);
    const html = await r.text();
    assertEntree(r, html, 'anonyme');
    assert.ok(Buffer.byteLength(html) <= 2048, 'entrée de « / » ≤ 2048 octets (' + Buffer.byteLength(html) + ')');
    assert.equal(appels, 0, 'sans cookie ni en-tête : aucune question au domaine (gratuit)');
    assert.ok(html.includes('href="https://kd-mc.com/?return=' + encodeURIComponent('https://admin.kd-mc.com/') + '"'), 'lien kd-mc.com/?return=<cette page encodée>');
    const r2 = await worker.fetch(req('/qui?x=1'), ENV);
    const h2 = await r2.text();
    assertEntree(r2, h2, 'autre chemin');
    assert.ok(h2.includes(encodeURIComponent('https://admin.kd-mc.com/qui?x=1')), 'retour = l\'adresse exacte demandée');
    const r3 = await worker.fetch(req('/', { method: 'HEAD' }), ENV);
    assert.equal(r3.status, 401, 'HEAD anonyme → 401 aussi');
  } finally { globalThis.fetch = orig; }
});

test('session révoquée / pass falsifié / domaine muet ou en panne → l\'entrée, jamais la page (fail-closed)', async () => {
  const orig = globalThis.fetch;
  const { oublierSessions } = await import('./worker.js');
  try {
    globalThis.fetch = async (u) => String(u).includes('/__sso/whoami') ? new Response(JSON.stringify({ ok: false, reason: 'session_revoquee' }), { status: 200 }) : new Response('{}');
    oublierSessions();
    let r = await worker.fetch(req('/', { headers: { cookie: 'kdmc_sso=pass-kevin' } }), ENV);
    assertEntree(r, await r.text(), 'révoquée');
    globalThis.fetch = mockFetch({});
    oublierSessions();
    r = await worker.fetch(req('/', { headers: { cookie: 'kdmc_sso=pass-falsifie', authorization: 'Bearer faux' } }), ENV);
    assertEntree(r, await r.text(), 'falsifié');
    globalThis.fetch = async () => { throw new Error('réseau coupé'); };
    oublierSessions();
    r = await worker.fetch(req('/', { headers: { cookie: 'kdmc_sso=pass-kevin' } }), ENV);
    assertEntree(r, await r.text(), 'domaine muet');
    globalThis.fetch = async () => new Response('Bad gateway', { status: 502 });
    oublierSessions();
    r = await worker.fetch(req('/', { headers: { cookie: 'kdmc_sso=pass-kevin' } }), ENV);
    assertEntree(r, await r.text(), 'domaine en erreur');
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    oublierSessions();
    r = await worker.fetch(req('/', { headers: { cookie: 'kdmc_sso=x' } }), ENV);
    assertEntree(r, await r.text(), 'réponse sans uid');
  } finally { globalThis.fetch = orig; }
});

test('porteCompte (porte sèche) : 401, aucun script, aucun octet de la page', async () => {
  const { porteCompte } = await import('./worker.js');
  const r = porteCompte(new URL('https://admin.kd-mc.com/'));
  assertPorte(r, await r.text(), 'porte sèche');
});

/* ── GET /page : la seule route qui rend la page à l'entrée ── */
test('GET /page : la page à un compte du domaine (cookie OU Bearer), relayée au domaine avec le User-Agent', async () => {
  const orig = globalThis.fetch; const vus = [];
  const m = mockFetch({});
  globalThis.fetch = async (u, o) => { if (String(u).includes('/__sso/whoami')) vus.push(o && o.headers); return m(u, o); };
  try {
    for (const [quoi, headers] of [['Bearer (app installée)', { authorization: 'Bearer pass-kevin', 'user-agent': 'iPhone UA', 'sec-fetch-site': 'same-origin' }],
      ['cookie (Safari)', { cookie: 'kdmc_sso=pass-kevin', 'sec-fetch-site': 'same-origin' }],
      ['compte non admin', { authorization: 'Bearer pass-marie' }],
      ['Origin = même site', { authorization: 'Bearer pass-kevin', origin: 'https://admin.kd-mc.com' }]]) {
      const r = await worker.fetch(req('/page', { headers }), ENV);
      assert.equal(r.status, 200, quoi);
      assert.match(r.headers.get('content-type'), /text\/html/, quoi);
      assert.equal(r.headers.get('cache-control'), 'no-store', quoi);
      assert.equal(r.headers.get('access-control-allow-origin'), null, quoi + ' : aucun CORS');
      for (const h of ENTETES_SECU) assert.ok(r.headers.get(h), quoi + ' : ' + h);
      assert.equal(await r.text(), PAGE_HTML, quoi + ' : exactement la page');
    }
    assert.equal(vus[0]['user-agent'], 'iPhone UA', 'le User-Agent de la personne est relayé (famille d\'appareil)');
  } finally { globalThis.fetch = orig; }
});

test('GET /page SANS compte valide → 401 JSON, aucun morceau de la page (anonyme, révoqué, falsifié, domaine muet)', async () => {
  const orig = globalThis.fetch;
  const { oublierSessions } = await import('./worker.js');
  try {
    const cas = [
      ['anonyme', mockFetch({}), {}],
      ['falsifié', mockFetch({}), { authorization: 'Bearer pass-falsifie' }],
      ['révoqué', async () => new Response(JSON.stringify({ ok: false, reason: 'session_revoquee' })), { cookie: 'kdmc_sso=pass-kevin' }],
      ['domaine muet', async () => { throw new Error('coupé'); }, { authorization: 'Bearer pass-kevin' }],
      ['domaine 502', async () => new Response('x', { status: 502 }), { authorization: 'Bearer pass-kevin' }],
    ];
    for (const [quoi, f, headers] of cas) {
      globalThis.fetch = f; oublierSessions();
      const r = await worker.fetch(req('/page', { headers }), ENV);
      const t = await r.text();
      assert.equal(r.status, 401, quoi);
      assert.match(r.headers.get('content-type'), /application\/json/, quoi);
      assert.equal(JSON.parse(t).error, 'compte_requis', quoi);
      assert.equal(r.headers.get('access-control-allow-origin'), null, quoi + ' : aucun CORS');
      sansPage(t, '/page ' + quoi);
    }
  } finally { globalThis.fetch = orig; }
});

test('GET /page appelé depuis UN AUTRE SITE → 401 même avec un pass valide (même origine seulement)', async () => {
  const orig = globalThis.fetch; let appels = 0; const m = mockFetch({});
  globalThis.fetch = async (u, o) => { appels++; return m(u, o); };
  try {
    for (const headers of [{ cookie: 'kdmc_sso=pass-kevin', 'sec-fetch-site': 'cross-site' }, { cookie: 'kdmc_sso=pass-kevin', 'sec-fetch-site': 'same-site' },
      { authorization: 'Bearer pass-kevin', origin: 'https://evil.example.com' }, { authorization: 'Bearer pass-kevin', origin: 'https://kd-mc.com' }]) {
      const r = await worker.fetch(req('/page', { headers }), ENV);
      const t = await r.text();
      assert.equal(r.status, 401, JSON.stringify(headers));
      assert.equal(JSON.parse(t).error, 'origine');
      assert.equal(r.headers.get('access-control-allow-origin'), null);
      sansPage(t, 'cross-site');
    }
    assert.equal(appels, 0, 'refusé avant même de demander au domaine');
    const p = await worker.fetch(req('/page', { method: 'POST', headers: { authorization: 'Bearer pass-kevin' } }), ENV);
    assert.notEqual(p.status, 200, 'POST /page ne rend pas la page');
  } finally { globalThis.fetch = orig; }
});

/* ── /__sso/entrer : la tuile du portail (kdmc-sso.js porte()) arrive ici ── */
test('/__sso/entrer : remet le pass à l\'entrée par le lien (#kdmc_sso=), ne pose aucun cookie, reste sur ce site', async () => {
  const orig = globalThis.fetch; let appels = 0;
  globalThis.fetch = async () => { appels++; return new Response('{}'); };
  try {
    const env_ = Buffer.from(JSON.stringify({ t: 'pass-kevin', g: 'grant-secret', exp: Date.now() + 90000 })).toString('base64url') + '.signature';
    let r = await worker.fetch(req('/__sso/entrer?to=' + encodeURIComponent('/') + '&h=' + encodeURIComponent(env_)), ENV);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/#kdmc_sso=pass-kevin');
    assert.equal(r.headers.get('set-cookie'), null, 'aucun cookie posé');
    assert.ok(!r.headers.get('location').includes('grant'), 'le grant admin ne voyage pas');
    r = await worker.fetch(req('/__sso/entrer?to=' + encodeURIComponent('/qui?x=1#a') + '&t=pass-marie'), ENV);
    assert.equal(r.headers.get('location'), '/qui?x=1#a&kdmc_sso=pass-marie');
    for (const to of ['//evil.example.com/', 'https://evil.example.com/', '/\\evil', '/__sso/entrer?to=/']) {
      r = await worker.fetch(req('/__sso/entrer?to=' + encodeURIComponent(to) + '&t=p'), ENV);
      assert.equal(r.headers.get('location'), '/#kdmc_sso=p', 'to=' + to + ' → reste sur /');
    }
    r = await worker.fetch(req('/__sso/entrer?to=/'), ENV);
    assert.equal(r.headers.get('location'), '/', 'sans pass : l\'adresse propre');
    r = await worker.fetch(req('/__sso/entrer?h=illisible.x'), ENV);
    assert.equal(r.headers.get('location'), '/', 'enveloppe illisible : rien');
    assert.equal(appels, 0, 'aucune question au domaine ici : c\'est /page qui vérifie');
  } finally { globalThis.fetch = orig; }
});

test('interrupteur ACCES_PAGE_COMPTE="0" → ancien comportement (page servie, sans demander au domaine)', async () => {
  const orig = globalThis.fetch; let appels = 0;
  globalThis.fetch = async () => { appels++; return new Response('{}'); };
  try {
    const r = await worker.fetch(req('/'), { ...ENV, ACCES_PAGE_COMPTE: '0' });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Qui se connecte/);
    const p = await worker.fetch(req('/page'), { ...ENV, ACCES_PAGE_COMPTE: '0' });
    assert.equal(p.status, 200, '/page aussi');
    assert.equal(appels, 0, 'aucune question au domaine quand la porte est coupée');
    for (const v of [undefined, '1', 'oui', '']) {
      const e = { ...ENV }; if (v !== undefined) e.ACCES_PAGE_COMPTE = v;
      const r2 = await worker.fetch(req('/'), e);
      assert.equal(r2.status, 401, 'ACCES_PAGE_COMPTE=' + JSON.stringify(v) + ' → entrée (seul "0" la coupe)');
      assert.equal(r2.headers.get('x-kdmc-porte'), 'entree');
      const p2 = await worker.fetch(req('/page'), e);
      assert.equal(p2.status, 401, '/page sans compte, ACCES_PAGE_COMPTE=' + JSON.stringify(v));
    }
  } finally { globalThis.fetch = orig; }
});

test('wrangler.toml : interrupteur ACCES_PAGE_COMPTE = "1" posé dans [vars]', () => {
  const toml = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
  const vars = toml.split(/^\[vars\]\s*$/m)[1] || '';
  assert.match(vars, /^ACCES_PAGE_COMPTE\s*=\s*"1"\s*$/m);
  assert.ok(toml.indexOf('routes = [') < toml.indexOf('[vars]'), '`routes` reste avant toute [table]');
});

test('/health, /log, /history : comportement inchangé par la porte (aucune page, aucune porte)', async () => {
  const orig = globalThis.fetch; globalThis.fetch = mockFetch({});
  try {
    const h = await worker.fetch(req('/health'), ENV);
    assert.equal(h.status, 200); assert.deepEqual(await h.json(), { ok: true, service: 'kdmc-access' });
    const l = await worker.fetch(req('/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), ENV);
    assert.equal(l.status, 401); assert.equal((await l.json()).error, 'unauthorized');
    assert.equal(l.headers.get('x-kdmc-porte'), null);
    const hi = await worker.fetch(req('/history'), ENV);
    assert.equal(hi.status, 401); assert.equal((await hi.json()).error, 'unauthorized');
    const hk = await worker.fetch(req('/history', { headers: { 'x-apex-pin': PIN_SHA } }), ENV);
    assert.equal(hk.status, 200, 'le code admin ouvre toujours /history');
    const api = await worker.fetch(req('/inconnu.json'), ENV);
    assert.equal(api.status, 404, 'API inconnue → 404 JSON, pas la porte');
  } finally { globalThis.fetch = orig; }
});

/* « Qui se connecte ne fonctionne pas » (6.10) : tout chemin de PAGE montre la page (à un compte du domaine), jamais
   l'erreur brute ; et depuis le 15.10, la porte à un anonyme. */
/* Dans un test() : node:test lance les tests pendant que le module finit de se charger ; un bloc de haut niveau qui
   remplace globalThis.fetch courrait en même temps qu'eux (mesuré : « POST /log » perdait son fetch simulé). */
test('chemins de page : la page à un compte, la porte à un anonyme, 404 aux API inconnues', async () => {
  const mod2 = worker;
  const orig = globalThis.fetch; globalThis.fetch = mockFetch({});
  let pass2 = 0, fail2 = 0;
  for (const chemin of ['/index.html', '/qui', '/admin', '/?x=1', '/personnes/']) {
    const r = await mod2.fetch(new Request('https://admin.kd-mc.com' + chemin, { headers: { cookie: 'kdmc_sso=pass-kevin' } }), {});
    const t = await r.text();
    if (r.status === 200 && /Qui se connecte/.test(t)) pass2++; else { fail2++; console.log('  ❌ ' + chemin + ' → ' + r.status + ' ' + t.slice(0, 40)); }
    const a = await mod2.fetch(new Request('https://admin.kd-mc.com' + chemin), {});
    const ta = await a.text();
    if (a.status === 401 && !/Qui se connecte/.test(ta)) pass2++; else { fail2++; console.log('  ❌ anonyme ' + chemin + ' → ' + a.status); }
  }
  const api = await mod2.fetch(new Request('https://admin.kd-mc.com/inconnu.json'), {});
  if (api.status === 404) pass2++; else { fail2++; console.log('  ❌ API inconnue : ' + api.status); }
  globalThis.fetch = orig;
  console.log(`  chemins de page : ${pass2} OK · ${fail2} échec(s)`);
  assert.equal(fail2, 0, 'chemins de page en échec');
  assert.equal(pass2, 11);
});

/* 15.10 (« l'ouverture est très longue ») : la même vérification n'est plus redemandée 3-4 fois par ouverture. */
test('vérification de session : un oui est gardé 15 s (1 appel au domaine pour 3 requêtes), un refus JAMAIS', async () => {
  const orig = globalThis.fetch; let appels = 0; const m = mockFetch({});
  const { oublierSessions } = await import('./worker.js');
  globalThis.fetch = async (u, o) => { if (String(u).includes('/__sso/whoami')) appels++; return m(u, o); };
  try {
    oublierSessions();
    for (let i = 0; i < 3; i++) assert.equal((await worker.fetch(req('/page', { headers: { authorization: 'Bearer pass-kevin' } }), ENV)).status, 200);
    assert.equal(appels, 1, 'entrée + page + historique = une seule vérification');
    appels = 0; oublierSessions();
    for (let i = 0; i < 3; i++) assert.equal((await worker.fetch(req('/page', { headers: { authorization: 'Bearer pass-faux' } }), ENV)).status, 401);
    assert.equal(appels, 3, 'un refus est redemandé à chaque fois (jamais gardé)');
  } finally { globalThis.fetch = orig; oublierSessions(); }
});
