/* GARDE — « la connexion inconnue sur le compte de Laurence ne doit plus jamais arriver » (Kevin 8.10.2026)
   node services/kdmc-router/code-attente.test.mjs

   Mesuré avant (journal brut du 8.10) : le compte de Laurence n'avait pas de code au domaine ; le 7.10 à 04h30 UTC un PC Windows chez un
   hébergeur suédois a obtenu des sessions à son nom, par le seul nom. Ici, avec le VRAI routeur, un registre KV et une base D1 simulés :
     1. compte existant SANS code, appareil inconnu, nom seul → refusé (plus jamais une session sur un nom) ;
     2. … avec un code proposé → NI session NI code posé : la demande ATTEND KEVIN (D1 code_attente : appareil, lieu, réseau) + journal ;
     3. la boîte de Kevin la montre (« Codes à valider ») ; refuser = rien ne change ; accepter = ce code devient celui du compte ;
     4. ensuite nom + code ouvre la session, un mauvais code non ;
     5. SESSION LIÉE À L'APPAREIL : un pass émis sur un iPhone ne vaut rien depuis un PC Windows (le lien volé) ; même famille → ok ;
        un pass d'avant le 8.10 (sans famille) reste accepté ;
     6. SABOTAGE : avec le coupe-circuit KDMC_CODE_OBLIGATOIRE=0, le nom seul ouvre la session comme avant — c'est bien la règle qui protège. */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import mod from './worker.js';
import { handleBoite } from './boite.js';
import { schema as schemaCercle } from './cercle.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 260) : ''}`); };
function d1() {
  const s = new DatabaseSync(':memory:');
  const stmt = (sql, p = []) => ({ bind: (...x) => stmt(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; }, _exec: () => s.prepare(sql).run(...p) });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { for (const x of l) x._exec(); return []; }, _s: s };
}
const db = d1(); await schemaCercle(db);
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CERCLE_DB: db };
globalThis.fetch = async () => new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
const UA = { iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1',
  pwa: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
const req = (path, { method = 'GET', body, ua = UA.iphone, cf = { asn: 6758, city: 'Monaco', country: 'MC' }, headers = {} } = {}) => {
  const r = new Request('https://kd-mc.com' + path, { method, headers: Object.assign({ 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': ua, 'cf-connecting-ip': '203.0.113.5' }, headers), body: body === undefined ? undefined : JSON.stringify(body) });
  Object.defineProperty(r, 'cf', { value: cf }); return r;
};
const appel = async (path, o, e) => { const r = await mod.fetch(req(path, o), e || env, { waitUntil() {} }); return { st: r.status, j: await r.json().catch(() => ({})) }; };
const STOCKHOLM = { asn: 30893, city: 'Stockholm', country: 'SE' };
const journal = [];
const outils = { qui: async () => ({ admin: true, uid: 'kdmc_admin', name: 'Kevin' }), journal: async (e) => { journal.push(e); }, fetch: globalThis.fetch, fbToken: async () => '' };
const boite = async (path, body) => { const r = await handleBoite(req('/__boite' + path, { method: body ? 'POST' : 'GET', body }), new URL('https://kd-mc.com/__boite' + path), env, outils); return r.json(); };

console.log('\n== Un compte sans code ne s\'ouvre plus sur son nom ; le code proposé attend Kevin ==');
/* le compte de Laurence tel qu'il était : créé par le vrai chemin (registre, nom canonique), puis son code retiré = compte d'avant le 27.09 */
{ const c = await appel('/__sso/issue', { method: 'POST', body: { uid: 'laurence-saint-polit', name: 'Laurence Saint-Polit', cgu: true, code: '111111' }, ua: UA.iphone });
  ok(c.j.ok === true && kv.has('cred:laurence-saint-polit'), '0. (décor) le compte existe, créé avec un code', c);
  kv.delete('cred:laurence-saint-polit'); const a0 = JSON.parse(kv.get('acc:laurence-saint-polit')); delete a0.code_at; kv.set('acc:laurence-saint-polit', JSON.stringify(a0)); }
let r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'laurence-saint-polit', name: 'Laurence Saint-Polit', cgu: true }, ua: UA.windows, cf: STOCKHOLM });
ok(r.st === 401 && r.j.reason === 'code_requis' && !r.j.token, '1. PC Windows à Stockholm, nom seul → refusé, aucune session (la faille du 7.10 est fermée)', r);
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'laurence-saint-polit', name: 'Laurence Saint-Polit', cgu: true, code: '555555' }, ua: UA.windows, cf: STOCKHOLM });
ok(r.st === 202 && r.j.reason === 'code_en_attente' && !r.j.token && !kv.has('cred:laurence-saint-polit'), '2. … avec un code proposé → ni session, ni code posé : « transmis à l\'administrateur »', r);
let row = db._s.prepare('SELECT * FROM code_attente WHERE uid = ?').get('laurence-saint-polit');
ok(row && /Windows/.test(row.appareil) && /Stockholm, SE/.test(row.lieu) && /AS30893/.test(row.reseau) && !row.rec.includes('555555') && /"h":"[0-9a-f]{64}"/.test(row.rec), '2b. la demande garde l\'appareil, le lieu, le réseau — et l\'EMPREINTE du code, jamais le code', row);
let aud = JSON.parse(kv.get('aud:log') || '[]');
ok(aud.some((e) => e.ev === 'code_attente' && e.uid === 'laurence-saint-polit' && /Windows/.test(e.device || '')), '2c. le journal admin porte « code_attente » (appareil, lieu, réseau)');
r = await appel('/__sso/login', { method: 'POST', body: { name: 'Laurence Saint-Polit', code: '777777' }, ua: UA.windows, cf: STOCKHOLM });
ok(r.st === 202 && r.j.reason === 'code_en_attente' && !r.j.token, '2d. la porte « nom + code » (appareil neuf) fait pareil : attente, pas de session', r);

const b1 = await boite('/admin');
ok(b1.ok && Array.isArray(b1.codes) && b1.codes.length === 1 && b1.codes[0].uid === 'laurence-saint-polit' && /Windows/.test(b1.codes[0].appareil) && /Stockholm/.test(b1.codes[0].lieu), '3. la boîte de Kevin montre « Codes à valider » : qui, quel appareil, d\'où', b1.codes);
let d = await boite('/admin/code-valider', { uid: 'laurence-saint-polit', accepter: false });
ok(d.ok && d.accepte === false && !db._s.prepare('SELECT 1 FROM code_attente WHERE uid = ?').get('laurence-saint-polit') && !kv.has('cred:laurence-saint-polit') && journal.some((e) => e.ev === 'code_refuse'), '3b. REFUSER : la demande disparaît, rien ne change, journal « code_refuse »', [d, journal]);
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'laurence-saint-polit', name: 'Laurence Saint-Polit', cgu: true, code: '666666' }, ua: UA.iphone });
ok(r.st === 202, '3c. Laurence, sur son iPhone à Monaco, propose SON code → attente (Kevin voit : iPhone · Monaco · Monaco Telecom)');
d = await boite('/admin/code-valider', { uid: 'laurence-saint-polit', accepter: true });
const acc = JSON.parse(kv.get('acc:laurence-saint-polit'));
ok(d.ok && d.accepte === true && kv.has('cred:laurence-saint-polit') && acc.code_at > 0 && journal.some((e) => e.ev === 'code_valide'), '3d. ACCEPTER : ce code devient celui du compte (cred:), la fiche porte code_at, journal « code_valide »', [d, acc]);
r = await appel('/__sso/login', { method: 'POST', body: { name: 'Laurence Saint-Polit', code: '666666' }, ua: UA.iphone });
ok(r.j.ok === true && r.j.token && r.j.code === true, '4. nom + le code accepté → la session', r);
const tokIphone = r.j.token;
const faux = await appel('/__sso/login', { method: 'POST', body: { name: 'Laurence Saint-Polit', code: '555555' }, ua: UA.windows, cf: STOCKHOLM });
ok(faux.st === 401 && !faux.j.token, '4b. le code refusé par Kevin (555555), depuis Stockholm → refusé');
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'laurence-saint-polit', name: 'Laurence Saint-Polit', cgu: true }, ua: UA.windows, cf: STOCKHOLM });
ok(r.st === 401 && r.j.reason === 'code_requis', '4c. et le nom seul reste refusé (compte protégé)');

console.log('\n== Le pass est lié à la famille d\'appareil ==');
const who = (tok, ua) => appel('/__sso/whoami', { ua, headers: { authorization: 'Bearer ' + tok } });
let w = await who(tokIphone, UA.iphone);
ok(w.j.ok === true && w.j.uid === 'laurence-saint-polit', '5. le pass émis sur l\'iPhone marche sur l\'iPhone');
w = await who(tokIphone, UA.pwa);
ok(w.j.ok === true, '5b. … et dans l\'app posée sur l\'écran d\'accueil (même iPhone, User-Agent sans « Safari »)');
w = await who(tokIphone, UA.windows);
ok(w.j.ok !== true, '5c. le MÊME pass présenté depuis un PC Windows (lien volé, pass copié) ne vaut rien', w);
const porte = await mod.fetch(req('/__sso/me', { ua: UA.windows, headers: { cookie: 'kdmc_sso=' + tokIphone } }), env, { waitUntil() {} });
ok(porte.status !== 200 || !((await porte.json().catch(() => ({}))).ok), '5d. idem par cookie sur une autre porte du domaine (/__sso/me)');
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const { createHmac } = await import('node:crypto');
const ancien = (() => { const p = b64u(JSON.stringify({ u: 'laurence-saint-polit', n: 'Laurence Saint-Polit', c: 1, v: 0, k: 1, iat: Date.now(), exp: Date.now() + 1e8 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); })();
w = await who(ancien, UA.windows);
ok(w.j.ok === true, '5e. un pass d\'avant le 8.10 (sans famille) reste accepté — il sera lié à son renouvellement');

console.log('\n== Sabotage ==');
kv.set('acc:marc-ancien', JSON.stringify({ uid: 'marc-ancien', name: 'Marc Ancien' })); kv.set('nm:marc ancien', 'marc-ancien');
const sab = await appel('/__sso/issue', { method: 'POST', body: { uid: 'marc-ancien', name: 'Marc Ancien', cgu: true }, ua: UA.windows, cf: STOCKHOLM }, Object.assign({}, env, { KDMC_CODE_OBLIGATOIRE: '0' }));
const vrai = await appel('/__sso/issue', { method: 'POST', body: { uid: 'marc-ancien', name: 'Marc Ancien', cgu: true }, ua: UA.windows, cf: STOCKHOLM });
ok(sab.j.ok === true && !!sab.j.token && vrai.st === 401, '6. SABOTAGE : coupe-circuit à 0 → le nom seul ouvre la session (l\'ancien monde) ; par défaut → refusé. C\'est la règle qui protège.', [sab.j.ok, vrai.st]);
const neuf = await appel('/__sso/issue', { method: 'POST', body: { uid: 'zoe-neuve', name: 'Zoé Neuve', cgu: true }, ua: UA.iphone });
ok(neuf.st === 400 && neuf.j.reason === 'code_requis_creation' && !kv.has('acc:zoe-neuve'), '6b. créer un compte sans code → refusé, aucune fiche (code obligatoire à l\'inscription)');

{ console.log('\n== 7. ANCIEN COMPTE SANS CODE : à la prochaine connexion, « crée ton code » — sinon pas d\'accès (Kevin 8.10 soir) ==');
/* décor : Marc Ancien a une session de l'ancien monde (émise sur son nom, coupe-circuit à 0 = avant le 8.10), compte SANS code */
const ENV0 = Object.assign({}, env, { KDMC_CODE_OBLIGATOIRE: '0' });
const anc7 = await appel('/__sso/issue', { method: 'POST', body: { uid: 'marc-ancien', name: 'Marc Ancien', cgu: true }, ua: UA.iphone }, ENV0);
const T0 = anc7.j.token;
ok(anc7.j.ok === true && !!T0 && !kv.has('cred:marc-ancien'), '7.0 (décor) session d\'avant le 8.10, compte sans code', anc7);
const page = async (host, tok, extra = {}) => mod.fetch(req('/', Object.assign({ ua: UA.iphone, headers: Object.assign({ 'sec-fetch-dest': 'document', accept: 'text/html', authorization: 'Bearer ' + tok, host }, extra) }, {})).clone(), env, { waitUntil() {} });
const reqHost = (host, path, tok, headers = {}) => { const r = new Request('https://' + host + path, { headers: Object.assign({ 'user-agent': UA.iphone, authorization: 'Bearer ' + tok, 'cf-connecting-ip': '1.2.3.4' }, headers) }); Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } }); return r; };
let pg = await mod.fetch(reqHost('lingua.kd-mc.com', '/', T0, { 'sec-fetch-dest': 'document', accept: 'text/html' }), env, { waitUntil() {} });
let html = await pg.text();
ok(pg.status === 200 && pg.headers.get('x-kdmc-porte') === 'code' && /Crée ton code|crée ton code/i.test(html) && /Marc Ancien/.test(html) && /kd-mc\.com\/\?code=1&amp;return=/.test(html) && !/porte\.js/.test(html),
  '7.1 une page d\'app avec cette session → la porte « crée ton code » (nom de la personne, lien vers kd-mc.com, SANS script qui rebouclerait)', { st: pg.status, porte: pg.headers.get('x-kdmc-porte') });
pg = await mod.fetch(reqHost('lingua.kd-mc.com', '/app.js', T0, { 'sec-fetch-dest': 'script' }), env, { waitUntil() {} });
ok(pg.status === 401 && pg.headers.get('x-kdmc-porte') === 'code', '7.2 … un script de l\'app → 401, rien ne se lit', { st: pg.status });
let w = await mod.fetch(reqHost('lingua.kd-mc.com', '/__sso/whoami', T0), env, { waitUntil() {} }); let wj = await w.json();
ok(w.status === 200 && wj.ok === false && wj.reason === 'code_requis' && wj.code_requis === true && wj.uid === 'marc-ancien' && wj.name === 'Marc Ancien', '7.3 whoami → pas reconnu : code_requis, avec uid + nom pour pré-remplir l\'écran', wj);
let re = await appel('/__sso/issue', { method: 'POST', body: { uid: 'marc-ancien', name: 'Marc Ancien', cgu: true }, ua: UA.iphone, headers: { authorization: 'Bearer ' + T0 } });
ok(re.st === 401 && re.j.reason === 'code_requis' && re.j.code_requis === true && /Choisis ton code/.test(re.j.message || ''), '7.4 se re-déclarer par le nom depuis sa propre session ne redonne plus de session : « choisis ton code »', re);
re = await appel('/__sso/issue', { method: 'POST', body: { uid: 'marc-ancien', name: 'Marc Ancien', cgu: true, code: '987654' }, ua: UA.iphone, headers: { authorization: 'Bearer ' + T0 } });
/* 8.10 (revue extérieure, P0) : une session de l'ancien monde a pu être ouverte sur le seul NOM par un inconnu (Stockholm en avait une au
   nom de Laurence) → elle ne pose PAS le code toute seule : le code attend Kevin (sinon l'inconnu enfermait la vraie personne dehors). */
ok(re.st === 202 && re.j.reason === 'code_en_attente' && !re.j.token && !kv.has('cred:marc-ancien') && db._s.prepare('SELECT 1 FROM code_attente WHERE uid = ?').get('marc-ancien'),
  '7.5 depuis sa session NON prouvée (ouverte sur le nom), le code proposé ATTEND Kevin : ni code posé, ni session', re);
const dv = await boite('/admin/code-valider', { uid: 'marc-ancien', accepter: true });
re = await appel('/__sso/login', { method: 'POST', body: { name: 'Marc Ancien', code: '987654' }, ua: UA.iphone });
const T1 = re.j.token;
ok(dv.ok && dv.accepte === true && re.j.ok === true && re.j.code === true && !!T1 && kv.has('cred:marc-ancien') && JSON.parse(kv.get('acc:marc-ancien')).code_at > 0, '7.5b Kevin accepte (un geste dans sa boîte) → nom + ce code = la session « code prouvé », fiche avec code_at', [dv, re]);
{ /* 7.5c : une session PROUVÉE (Face ID, v=1) pose son code sans attendre — c'est bien la preuve qui décide, pas la session */
  const { createHmac } = await import('node:crypto');
  const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const old = await appel('/__sso/issue', { method: 'POST', body: { uid: 'odile-ancienne', name: 'Odile Ancienne', cgu: true }, ua: UA.iphone }, ENV0);
  const p = b64u(JSON.stringify({ u: 'odile-ancienne', n: 'Odile Ancienne', c: 1, v: 1, k: 0, iat: Date.now(), exp: Date.now() + 1e8 }));
  const faceId = p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest());
  const cr = await appel('/__sso/issue', { method: 'POST', body: { uid: 'odile-ancienne', name: 'Odile Ancienne', cgu: true, code: '246813' }, ua: UA.iphone, headers: { authorization: 'Bearer ' + faceId } });
  ok(old.j.ok === true && cr.j.ok === true && cr.j.code === true && kv.has('cred:odile-ancienne') && !db._s.prepare('SELECT 1 FROM code_attente WHERE uid = ?').get('odile-ancienne'), '7.5c une session PROUVÉE (Face ID) pose son code tout de suite, sans attente', cr); }
pg = await mod.fetch(reqHost('lingua.kd-mc.com', '/', T1, { 'sec-fetch-dest': 'document', accept: 'text/html' }), env, { waitUntil() {} });
ok(pg.headers.get('x-kdmc-porte') !== 'code' && pg.headers.get('x-kdmc-porte') !== 'fiche', '7.6 … et la page de l\'app s\'ouvre', { porte: pg.headers.get('x-kdmc-porte'), st: pg.status });
w = await mod.fetch(reqHost('lingua.kd-mc.com', '/__sso/whoami', T1), env, { waitUntil() {} }); wj = await w.json();
ok(wj.ok === true && wj.uid === 'marc-ancien' && wj.code_pose === true, '7.7 whoami le reconnaît, code posé', wj);
/* un code posé AVANT le 8.10 : cred: présent, fiche sans code_at, session de l'ancien monde → reconnu, et la fiche retient code_at */
{ /* décor : session de l'ancien monde (sur le nom, k=0), puis le code posé depuis cette session, puis la fiche « d'avant » (sans code_at) */
  const old = await appel('/__sso/issue', { method: 'POST', body: { uid: 'nina-avant', name: 'Nina Avant', cgu: true }, ua: UA.iphone }, ENV0);
  /* le code a été posé AVANT le 8.10 (à l'époque, sa session suffisait) : on le pose ici par une session prouvée, puis on efface code_at */
  const { createHmac } = await import('node:crypto'); const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const pv = b64u(JSON.stringify({ u: 'nina-avant', n: 'Nina Avant', c: 1, v: 1, k: 0, iat: Date.now(), exp: Date.now() + 1e8 }));
  const cr = await appel('/__sso/issue', { method: 'POST', body: { uid: 'nina-avant', name: 'Nina Avant', cgu: true, code: '112233' }, ua: UA.iphone, headers: { authorization: 'Bearer ' + pv + '.' + b64u(createHmac('sha256', 'sec').update(pv).digest()) } });
  const a0 = JSON.parse(kv.get('acc:nina-avant')); delete a0.code_at; kv.set('acc:nina-avant', JSON.stringify(a0));
  w = await mod.fetch(reqHost('lingua.kd-mc.com', '/__sso/whoami', old.j.token), env, { waitUntil() {} }); wj = await w.json();
  ok(old.j.ok === true && cr.j.ok === true && kv.has('cred:nina-avant') && wj.ok === true && JSON.parse(kv.get('acc:nina-avant')).code_at > 0, '7.8 un code posé avant le 8.10 (fiche sans code_at) : reconnu, et la fiche retient code_at (une seule lecture KV, une fois)', wj); }
/* exemptions : la sonde sans fiche, le coupe-circuit */
{ const ci = await appel('/__sso/issue', { method: 'POST', body: { uid: 'ci_smoke', name: 'CI Smoke', cgu: true }, ua: UA.iphone });
  w = await mod.fetch(reqHost('lingua.kd-mc.com', '/__sso/whoami', ci.j.token), env, { waitUntil() {} }); wj = await w.json();
  ok(ci.j.ok === true && wj.ok === true, '7.9 la sonde de déploiement (ci_smoke, sans fiche) n\'est pas bloquée'); }
{ const m0 = await appel('/__sso/issue', { method: 'POST', body: { uid: 'paul-sans', name: 'Paul Sans', cgu: true }, ua: UA.iphone }, ENV0);
  const p1 = await mod.fetch(reqHost('lingua.kd-mc.com', '/', m0.j.token, { 'sec-fetch-dest': 'document', accept: 'text/html' }), ENV0, { waitUntil() {} });
  const p2 = await mod.fetch(reqHost('lingua.kd-mc.com', '/', m0.j.token, { 'sec-fetch-dest': 'document', accept: 'text/html' }), env, { waitUntil() {} });
  ok(p1.headers.get('x-kdmc-porte') !== 'code' && p2.headers.get('x-kdmc-porte') === 'code', '7.10 SABOTAGE : coupe-circuit à 0 → la page s\'ouvre sans code ; par défaut → porte « crée ton code »'); }
/* le portail et le client SSO sont câblés : état code_requis gardé (pas de pass jeté), écran bloquant, versions montées */
{ const { readFileSync } = await import('node:fs');
  const sso = readFileSync(new URL('../../kdmc-home/kdmc-sso.js', import.meta.url), 'utf8'), portail = readFileSync(new URL('../../kdmc-home/kdmc-portal.js', import.meta.url), 'utf8');
  ok(/state: 'code_requis'/.test(sso) && /whoamiResult: whoamiResult/.test(sso) && /r\.state === 'code_requis'/.test(sso) && /kd-mc\.com\/\?code=1&return=/.test(sso), '7.11 client SSO : état code_requis (pass gardé), exporté, et les apps renvoient au portail');
  ok(/function renderCodeObligatoire\(s\)/.test(portail) && /r\.state === 'code_requis'\) \{ renderCodeObligatoire\(r\.session\)/.test(portail) && /position:fixed;inset:0;z-index:9999/.test(portail) && /co-code2/.test(portail) && /issueDetail\(s\.uid, s\.name, true, safeReturnUrl\(\), c1\)/.test(portail),
    '7.12 portail : écran « Crée ton code » plein écran (code saisi 2 fois), posé depuis la session de la personne, retour à l\'app');
  /* 8.10 (revue extérieure, P0) : au démarrage ET avant de renvoyer vers l'app, le portail lit l'état détaillé — sinon l'écran n'est jamais atteint */
  const boot = portail.slice(portail.indexOf('function boot()'), portail.indexOf('boot();'));
  const hub = portail.slice(portail.indexOf('function showHub('), portail.indexOf('function cguBlock()'));
  ok(/whoamiResult\(\)/.test(boot) && /r\.state === 'code_requis'\) \{ renderCodeObligatoire\(r\.session\); return; \}/.test(boot), '7.13 portail : boot() lit whoamiResult → code_requis = l\'écran bloquant (plus whoami() qui l\'aplatissait en « aucune session »)');
  ok(/whoamiResult\(\)/.test(hub) && hub.indexOf("r.state === 'code_requis'") < hub.indexOf('gotoReturnIfAny()'), '7.14 portail : showHub vérifie code_requis AVANT de renvoyer vers l\'app (fin du ping-pong app ⇄ portail)'); }

}
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
