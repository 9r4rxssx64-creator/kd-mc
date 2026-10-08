/* PORTES PAR DOSSIER — « le domaine comme chaque app doit être bien sécurisé. Personne ne peut
   entrer ou modifier. Renseignements obligatoires partout pour les nouveaux » (Kevin 27.09.2026).
   Mesuré avant ce correctif : kd-mc.com/CMCteams/tools/poolrobot/ servait PoolPilot SANS code (le
   verrou ne regardait que l'ADRESSE beatbot.kd-mc.com ; toute adresse du domaine peut demander un
   dossier par /CMCteams/…). Idem pour le coffre d'autorisations.
   Ce test passe par le VRAI routeur (worker.js), hébergeur simulé, et prouve :
     · admin : aucun chemin (adresse, /CMCteams, casse, %-encodage, barres doublées) n'ouvre PoolPilot
       ni Autorisations sans le code ; avec le code, ça s'ouvre ;
     · fiche : un inconnu est envoyé au portail (fiche ou Face ID) puis revient ; une personne connue
       entre ; une session révoquée non ; une personne connue mais pas ouverte ICI voit une page
       claire (pas une boucle) ; l'installation (manifest, icône, sw.js) reste possible ;
     · boutiques et pages de vente restent visibles (Kevin : la fiche se remplit à la commande).
   node portes.test.mjs */
import mod from './worker.js';
import { createHash, createHmac } from 'crypto';

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v, iat) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: iat || Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-compte.test.mjs */, KDMC_ADMIN_PIN_SHA256: sha('424242'), ACCOUNTS };

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => { const u = typeof input === 'string' ? input : input.url;
  if (!/(^|\.)kd-mc\.com$/i.test(new URL(u).hostname)) return new Response('CONTENU ' + new URL(u).pathname, { status: 200, headers: { 'content-type': 'text/html' } });
  return realFetch(input); };
const NAV = { 'sec-fetch-dest': 'document', accept: 'text/html' };
const va = async (url, extra) => { const r = await mod.fetch(new Request(url, { headers: Object.assign({}, NAV, extra || {}) }), env, { waitUntil() {} });
  const t = r.status === 302 ? '' : await r.text(); return { st: r.status, loc: r.headers.get('location') || '', servi: /^CONTENU /.test(t), t, porte: r.headers.get('x-kdmc-porte') || '',
    csp: r.headers.get('content-security-policy') || '' }; };

/* ---- 1. ADMIN : PoolPilot et Autorisations, par TOUS les chemins ---- */
const CHEMINS_ADMIN = [
  'https://beatbot.kd-mc.com/', 'https://kd-mc.com/CMCteams/tools/poolrobot/', 'https://cmcteams.kd-mc.com/tools/poolrobot/',
  'https://shops.kd-mc.com/CMCteams/tools/poolrobot/index.html', 'https://kd-mc.com/CMCteams/tools/pool%72obot/',
  'https://kd-mc.com/CMCteams/tools/POOLROBOT/', 'https://kd-mc.com/CMCteams//tools/poolrobot/', 'https://kd-mc.com/CMCteams/tools/cuisine/%2e%2e/poolrobot/',
  'https://autorisations.kd-mc.com/', 'https://kd-mc.com/CMCteams/tools/approvals/', 'https://cmcteams.kd-mc.com/tools/approvals/app.js',
];
for (const u of CHEMINS_ADMIN) { const r = await va(u); ok(!r.servi, 'SANS code admin, ' + u + ' ne sert PAS l\'app privée  [' + r.st + ']'); }
const grant = signe('__kdmc_admin__', 1);
for (const u of ['https://beatbot.kd-mc.com/', 'https://autorisations.kd-mc.com/']) {
  const r = await va(u, { 'x-kdmc-admin': grant }); ok(r.servi, 'AVEC le code admin, ' + u + ' s\'ouvre');
}
/* Depuis le 27.09 nuit (jamais-cmcteams.test.mjs) : une PAGE d'app ouverte sous kd-mc.com part vers
   sa belle adresse — où la même porte s'applique. Même avec le code admin, rien n'est servi ICI. */
{ const r = await va('https://kd-mc.com/CMCteams/tools/approvals/', { 'x-kdmc-admin': grant });
  ok(r.st === 301 && r.loc === 'https://autorisations.kd-mc.com/' && !r.servi, 'kd-mc.com/CMCteams/tools/approvals/ → autorisations.kd-mc.com (sa porte admin y est)  [' + r.st + ' ' + r.loc + ']'); }

/* ---- 2. FICHE : les 7 sites d'information ---- */
const INFOS = ['https://cuisine.kd-mc.com/', 'https://cujina.kd-mc.com/', 'https://kd-mc.com/cujina/', 'https://worldmonitor.kd-mc.com/',
  'https://osint.kd-mc.com/', 'https://kd-mc.com/osint/', 'https://kd-mc.com/CMCteams/kdmc-home/osint/', 'https://ia.kd-mc.com/',
  'https://outils.kd-mc.com/', 'https://tor.kd-mc.com/', 'https://dossiers.kd-mc.com/'];
{ const r = await va('https://kd-mc.com/CMCteams/tools/tor/');
  ok(r.st === 301 && r.loc === 'https://tor.kd-mc.com/' && !r.servi, 'kd-mc.com/CMCteams/tools/tor/ → tor.kd-mc.com (la porte « fiche » s\'y montre, contrôle ci-dessous)  [' + r.st + ' ' + r.loc + ']'); }
/* Depuis le 27.09 (soir) : la porte se montre SUR PLACE — plus de 302 vers le portail. Une app de
   l'écran d'accueil (cookies à part) restait sinon bloquée sur le portail KDMC (Kevin : « j'atterris
   sur CMCteams »). La page de porte porte le lien « remplir ma fiche » (retour ici), le bouton Face
   ID, le script /__sso/porte.js, une CSP stricte — et JAMAIS le contenu. */
for (const u of INFOS) {
  const r = await va(u);
  const lien = 'https://kd-mc.com/?return=' + encodeURIComponent(u);
  ok(r.st === 200 && r.porte === 'fiche' && !r.servi && r.t.includes(lien) && r.t.includes('/__sso/porte.js') && r.t.includes('id="pk"') && /script-src 'self'/.test(r.csp),
    'inconnu sur ' + u + ' → porte SUR PLACE (fiche ou Face ID, retour ici), contenu non servi  [' + r.st + ' ' + r.porte + ']');
}
{ const r = await va('https://cuisine.kd-mc.com/'); ok(/A Cüjina de Mùnegu/.test(r.t) && !/<script>/.test(r.t), 'la porte nomme l\'app et ne contient aucun script en ligne (CSP)'); }
{ const r = await mod.fetch(new Request('https://osint.kd-mc.com/index.html', { headers: { accept: '*/*' } }), env, { waitUntil() {} });
  ok(r.status === 401 && !/^CONTENU/.test(await r.text()), 'inconnu qui lit la page SANS navigateur (script, robot) → 401, rien servi'); }
{ const r = await mod.fetch(new Request('https://cuisine.kd-mc.com/livre.pdf', { headers: { accept: '*/*' } }), env, { waitUntil() {} });
  ok(r.status === 401, 'le livre PDF de la cuisine n\'est pas téléchargeable sans fiche'); }
for (const u of ['https://osint.kd-mc.com/manifest.json', 'https://tor.kd-mc.com/sw.js', 'https://cuisine.kd-mc.com/icon-192.png']) {
  const r = await mod.fetch(new Request(u), env, { waitUntil() {} }); ok(/^CONTENU/.test(await r.text()), 'installation sur l\'écran d\'accueil possible (' + u.split('/').pop() + ' libre, sans contenu)');
}
/* connu du domaine (ancienne fiche sans périmètre = tout le domaine) → entre */
kv.set('acc:anne-martin', JSON.stringify({ uid: 'anne-martin', name: 'Anne Martin' }));
const anne = signe('anne-martin', 0);
for (const u of ['https://osint.kd-mc.com/', 'https://kd-mc.com/cujina/', 'https://tor.kd-mc.com/']) {
  const r = await va(u, { cookie: 'kdmc_sso=' + anne }); ok(r.servi, 'personne CONNUE (fiche remplie) → ' + u + ' s\'ouvre');
}
{ const r = await va('https://osint.kd-mc.com/', { authorization: 'Bearer ' + anne }); ok(r.servi, 'reconnue aussi par laissez-passer (app iPhone installée)'); }
/* session révoquée (« déconnecter mes autres appareils ») → retour à la fiche */
kv.set('acc:paul-roche', JSON.stringify({ uid: 'paul-roche', name: 'Paul Roche', revoked_at: Date.now() }));
{ const r = await va('https://osint.kd-mc.com/', { cookie: 'kdmc_sso=' + signe('paul-roche', 0, Date.now() - 60000) });
  ok(r.porte === 'fiche' && !r.servi, 'session RÉVOQUÉE → n\'entre pas (porte)'); }
/* connue, mais ouverte seulement sur une AUTRE app → page claire, pas de boucle vers le portail */
kv.set('acc:lea-noir', JSON.stringify({ uid: 'lea-noir', name: 'Léa Noir', portee: 'app', acces: ['tor'], acces_at: 1 }));
{ const r = await va('https://osint.kd-mc.com/', { cookie: 'kdmc_sso=' + signe('lea-noir', 0) });
  ok(r.st === 403 && !r.servi && /pas encore ouvert/.test(r.t), 'connue mais PAS ouverte sur cette app → page « pas encore ouvert », sans boucle  [' + r.st + ']'); }
{ const r = await va('https://tor.kd-mc.com/', { cookie: 'kdmc_sso=' + signe('lea-noir', 0) }); ok(r.servi, '… et sur l\'app qui lui est ouverte, elle entre'); }
/* Kevin (admin prouvé Face ID) n'est jamais enfermé dehors */
kv.set('acc:kevin-desarzens', JSON.stringify({ uid: 'kevin-desarzens', name: 'Kevin Desarzens', portee: 'app', acces: [] }));
{ const r = await va('https://dossiers.kd-mc.com/', { cookie: 'kdmc_sso=' + signe('kevin-desarzens', 1) }); ok(r.servi, 'Kevin (admin + Face ID) entre partout'); }
{ const r = await va('https://osint.kd-mc.com/', { cookie: 'kdmc_sso=' + 'faux.' + anne.split('.')[1] }); ok(!r.servi, 'jeton FALSIFIÉ → n\'entre pas'); }

/* ---- 3. Boutiques et pages de vente : depuis le 3.10 (Kevin : « Aucune consultation sans compte nulle part ») elles montrent
   la porte à un inconnu, comme les autres. Seul le portail (la porte elle-même) reste ouvert. Preuve complète : compte-obligatoire.test.mjs ---- */
for (const u of ['https://shops.kd-mc.com/', 'https://la-detente.kd-mc.com/', 'https://chez-lolo.kd-mc.com/', 'https://rotaplan.kd-mc.com/',
  'https://kit.kd-mc.com/', 'https://croupier.kd-mc.com/']) {
  const r = await va(u); ok(!r.servi && r.porte === 'fiche', 'page de vente : un inconnu voit la porte, pas la page : ' + u);
}
{ const r = await va('https://kd-mc.com/'); ok(r.servi, 'le portail reste ouvert (c\'est LA porte : inscription et connexion)'); }

/* ---- 4. Renseignements obligatoires pour un NOUVEAU compte (vérifiés par le DOMAINE) ---- */
const inscrit = async (corps) => { const r = await mod.fetch(new Request('https://kd-mc.com/__sso/issue', { method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify(corps) }), env, { waitUntil() {} });
  return { st: r.status, j: await r.json().catch(() => ({})) }; };
{ const r = await inscrit({ uid: 'x1', name: 'Zorro', cgu: true }); ok(r.st === 400 && r.j.reason === 'renseignements_requis', 'nouveau avec UN seul mot (sans nom de famille) → refusé'); }
{ const r = await inscrit({ uid: 'x2', name: 'Marc Dupont' }); ok(r.st === 400 && r.j.reason === 'renseignements_requis', 'nouveau SANS accepter les conditions → refusé'); }
{ const r = await inscrit({ uid: 'x3', name: 'Marc D', cgu: true }); ok(r.st === 400, 'nouveau avec un « nom » d\'une seule lettre → refusé'); }
{ const r = await inscrit({ uid: 'x4', name: '12 34', cgu: true }); ok(r.st === 400, 'nouveau avec des chiffres au lieu d\'un nom → refusé'); }
{ const r = await inscrit({ uid: 'marc-dupont', name: 'Marc Dupont', cgu: true }); ok(r.st === 200 && r.j.ok === true, 'nouveau COMPLET (prénom + nom + conditions) → compte créé'); }
{ const r = await inscrit({ uid: 'anne-sophie-saint-polit', name: 'Anne-Sophie SAINT-POLIT', cgu: true }); ok(r.j.ok === true, 'noms composés et accents acceptés'); }
{ const r = await inscrit({ uid: 'anne-martin', name: 'Anne', cgu: false }); ok(r.j.ok === true, 'quelqu\'un de DÉJÀ inscrit n\'est jamais bloqué par ce contrôle'); }

/* ---- 5. L'APP DE L'ÉCRAN D'ACCUEIL : la porte reste DANS l'app (Kevin 27.09 « j'atterris sur CMCteams ») ---- */
const ctx = { waitUntil() {} };
const post = async (host, headers, body) => mod.fetch(new Request('https://' + host + '/__sso/cookie', { method: 'POST',
  headers: Object.assign({ 'content-type': 'application/json' }, headers || {}), body: body || '{}' }), env, ctx);
let porteJs = '';
{ const r = await mod.fetch(new Request('https://cuisine.kd-mc.com/__sso/porte.js'), env, ctx); porteJs = await r.text();
  ok(r.status === 200 && /javascript/.test(r.headers.get('content-type') || '') && porteJs.includes('/__sso/cookie') && porteJs.includes('webauthn/auth/options') && porteJs.includes('display-mode: standalone'),
    'le script de la porte est servi par le routeur (cookie depuis le pass, Face ID, détection écran d\'accueil)'); }
/* /__sso/cookie : le laissez-passer redevient un cookie — mêmes contrôles que le reste */
{ const r = await post('cuisine.kd-mc.com', { origin: 'https://cuisine.kd-mc.com', authorization: 'Bearer ' + anne });
  const j = await r.json(); const sc = r.headers.get('set-cookie') || '';
  ok(r.status === 200 && j.ok === true && j.uid === 'anne-martin' && sc.startsWith('kdmc_sso=' + anne + ';') && /Domain=\.kd-mc\.com/.test(sc) && /HttpOnly/.test(sc) && /Max-Age=\d+/.test(sc),
    'laissez-passer gardé par l\'app → le domaine repose le MÊME cookie (pas une session neuve)  [' + r.status + ']');
  const r2 = await va('https://cuisine.kd-mc.com/', { cookie: 'kdmc_sso=' + anne }); ok(r2.servi, '… et au rechargement, le livre s\'ouvre'); }
{ const r = await post('cuisine.kd-mc.com', { origin: 'https://cuisine.kd-mc.com', authorization: 'Bearer ' + signe('paul-roche', 0, Date.now() - 60000) });
  ok(r.status === 401 && !r.headers.get('set-cookie'), 'pass d\'une session RÉVOQUÉE → refusé, aucun cookie'); }
{ const r = await post('cuisine.kd-mc.com', { origin: 'https://evil.example', authorization: 'Bearer ' + anne });
  ok(r.status === 403 && !r.headers.get('set-cookie'), 'un site TIERS ne peut pas poser un cookie avec un pass volé (origine refusée)'); }
{ const r = await post('cuisine.kd-mc.com', { origin: 'https://cuisine.kd-mc.com' }); ok(r.status === 401 && !r.headers.get('set-cookie'), 'sans pass → 401, aucun cookie'); }
{ const r = await post('cuisine.kd-mc.com', { origin: 'https://cuisine.kd-mc.com', authorization: 'Bearer faux.' + anne.split('.')[1] }); ok(r.status === 401 && !r.headers.get('set-cookie'), 'pass FALSIFIÉ → 401, aucun cookie'); }
{ const r = await post('osint.kd-mc.com', { origin: 'https://osint.kd-mc.com', authorization: 'Bearer ' + signe('lea-noir', 0) }); const j = await r.json();
  ok(j.ok === false && j.hors_perimetre === true && !r.headers.get('set-cookie'), 'connue mais pas ouverte ICI → pas de cookie, message clair'); }
{ const r = await post('dossiers.kd-mc.com', { origin: 'https://dossiers.kd-mc.com', authorization: 'Bearer ' + signe('kevin-desarzens', 1) }); const j = await r.json();
  ok(j.ok === true && j.admin === true && /^kdmc_sso=/.test(r.headers.get('set-cookie') || ''), 'Kevin (admin + Face ID) : cookie reposé partout'); }

/* Le VRAI script de la porte tourne ici avec un faux iPhone (leçon #343 : un test « iPhone » qui
   n'efface que les cookies n'est pas un iPhone — ici : stockage VIDE, cookies vides, écran d'accueil). */
async function porte(sc) {
  const store = new Map(Object.entries(sc.storage || {}));
  const els = { msg: { textContent: '' }, acts: { hidden: true }, pk: { hidden: false, disabled: false, _click: null, addEventListener(t, f) { if (t === 'click') this._click = f; } } };
  const document = { body: { getAttribute: (a) => ({ 'data-return': sc.url, 'data-portail': 'https://kd-mc.com/?return=' + encodeURIComponent(sc.url) })[a] || null }, getElementById: (id) => els[id] || null };
  const location = { href: sc.url, hash: sc.hash || '', pathname: new URL(sc.url).pathname, search: '', replaced: '', replace(u) { this.replaced = u; } };
  const history = { replaceState() { location.hash = ''; } };
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const navigator = { standalone: !!sc.standalone, credentials: sc.faceId ? { get: async () => sc.faceId } : undefined };
  const window = { matchMedia: () => ({ matches: !!sc.standalone }), PublicKeyCredential: sc.faceId ? function () {} : undefined };
  const calls = [];
  const fetch = async (u, init) => {
    calls.push(u);
    if (sc.fake && sc.fake[u]) return { json: async () => sc.fake[u] };
    const h = Object.assign({ origin: 'https://cuisine.kd-mc.com' }, (init && init.headers) || {});
    const r = await mod.fetch(new Request('https://cuisine.kd-mc.com' + u, { method: init.method || 'GET', headers: h, body: init.body }), env, ctx);
    return { json: async () => r.json() };
  };
  new Function('window', 'document', 'location', 'history', 'localStorage', 'navigator', 'fetch', 'TextDecoder', 'atob', 'btoa', porteJs)(window, document, location, history, localStorage, navigator, fetch, TextDecoder, atob, btoa);
  await new Promise((r) => setTimeout(r, 30));
  if (sc.clickFaceId && els.pk._click) { els.pk._click(); await new Promise((r) => setTimeout(r, 30)); }
  return { replaced: location.replaced, msg: els.msg.textContent, acts: !els.acts.hidden, pk: !els.pk.hidden, calls, tok: store.get('kdmc_sso_token') || '', hash: location.hash };
}
const LIVRE = 'https://cuisine.kd-mc.com/index.html';
{ const r = await porte({ url: LIVRE, standalone: true, storage: {}, faceId: false });
  ok(r.replaced === '' && r.acts && !r.calls.length, 'iPhone, app de l\'écran d\'accueil, stockage VIDE → la porte RESTE dans l\'app (aucun renvoi au portail), fiche proposée  [' + r.msg + ']'); }
{ const r = await porte({ url: LIVRE, standalone: true, storage: {}, faceId: { id: 'c1', response: { userHandle: new TextEncoder().encode('anne-martin'), clientDataJSON: new Uint8Array(3), authenticatorData: new Uint8Array(3), signature: new Uint8Array(3) } },
    fake: { '/__sso/webauthn/auth/options': { ok: true, challenge: 'AAAA', rpId: 'kd-mc.com' }, '/__sso/webauthn/auth/verify': { ok: true, uid: 'anne-martin', name: 'Anne Martin', token: anne } }, clickFaceId: true });
  ok(r.pk && r.replaced === LIVRE && r.tok === anne && r.calls.includes('/__sso/webauthn/auth/verify'), 'écran d\'accueil : Face ID SUR PLACE → pass gardé, l\'app se recharge sur le livre  [' + r.msg + ']'); }
{ const r = await porte({ url: LIVRE, standalone: true, storage: { kdmc_sso_token: anne } });
  ok(r.replaced === LIVRE && r.calls[0] === '/__sso/cookie' && r.tok === anne, 'écran d\'accueil avec un pass gardé → cookie reposé par le VRAI routeur, retour direct sur le livre (0 appui)'); }
{ const r = await porte({ url: LIVRE, standalone: true, hash: '#kdmc_sso=' + encodeURIComponent(anne), storage: {} });
  ok(r.replaced === LIVRE && r.tok === anne && r.hash === '', 'pass reçu du portail dans l\'adresse (#kdmc_sso=) → gardé, adresse nettoyée, on entre'); }
{ const r = await porte({ url: LIVRE, standalone: true, storage: { kdmc_sso_token: 'faux.' + anne.split('.')[1] } });
  ok(r.replaced === '' && r.tok === '' && r.acts, 'pass FALSIFIÉ dans l\'app → jeté, la porte reste avec fiche/Face ID (pas de boucle)'); }
/* Kevin 27.09 soir : « L'icône emmène encore sur CMCteams ». L'icône s'ouvrait comme une page
   Safari (détection « écran d'accueil » fausse) → le script partait TOUT SEUL au portail, qui
   affiche CMCteams. Désormais personne n'est emmené ailleurs sans l'avoir touché. */
{ const r = await porte({ url: LIVRE, standalone: false, storage: {} });
  ok(r.replaced === '' && r.acts, "icône ouverte comme une page Safari (pas « app plein écran »), sans pass → la porte RESTE, Face ID proposé, AUCUN départ vers CMCteams  [" + r.msg + ']'); }
{ const r = await porte({ url: LIVRE, standalone: false, storage: {}, faceId: { id: 'c1', response: { userHandle: new TextEncoder().encode('anne-martin'), clientDataJSON: new Uint8Array(3), authenticatorData: new Uint8Array(3), signature: new Uint8Array(3) } } });
  ok(r.replaced === '' && r.acts && r.pk, 'même cas avec Face ID disponible → le bouton Face ID est là, rien ne part tout seul'); }
ok(!/location\.replace\(portail\)/.test(porteJs), "le script de la porte ne contient plus AUCUN départ automatique vers le portail");
{ const r = await mod.fetch(new Request('https://cuisine.kd-mc.com/index.html', { headers: { 'sec-fetch-dest': 'document' } }), env, ctx);
  const h = await r.text();
  ok(h.includes('/__sso/porte.js?v=2'), "la porte charge porte.js?v=2 (l'ancien script, gardé 1 h par l'iPhone, n'est plus utilisé)"); }
{ const r = await mod.fetch(new Request('https://cuisine.kd-mc.com/__sso/porte.js?v=2'), env, ctx);
  ok(!/max-age=3600/.test(r.headers.get('cache-control') || ''), "porte.js n'est plus gardé 1 h en cache (un correctif doit arriver tout de suite)"); }
{ const r = await porte({ url: 'https://osint.kd-mc.com/', standalone: true, storage: { kdmc_sso_token: signe('lea-noir', 0) }, fake: { '/__sso/cookie': { ok: false, hors_perimetre: true, message: 'Ton compte n\'est pas ouvert sur cette application.' } } });
  ok(r.replaced === '' && /pas ouvert/.test(r.msg) && !r.pk, 'connue mais pas ouverte ici → message clair dans l\'app, sans Face ID inutile'); }

console.log(`Portes par dossier : ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
