/* GARDE — jeton Firebase du domaine « scope cmc » (16.10, audit extérieur P0-1 : /cmcteams lisible par tout compte anonyme).
   node services/kdmc-router/fbtoken-cmc.test.mjs   ·   sabotage manuel : retirer le contrôle de périmètre → 2b rougit
   Avec le VRAI routeur :
     1. personne reconnue, ouverte sur CMCteams → 200, jeton signé ici avec uid « cmc_<uid> » et claim scope 'cmc', échangé en id_token ;
     2. sans session → 401 ; fermée sur CMCteams par l'admin → 403 hors_perimetre ;
     3. 20 jetons par personne et par heure, le 21e → 429 ; le compteur du jour (adoption) est tenu en D1, sans écriture KV de plus ;
     4. sans « scope » : comportement d'avant (rôle admin ou boutique exigé → 403). */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import mod from './worker.js';
import { handleBoite } from './boite.js';
import { schema as schemaCercle } from './cercle.js';
import { ficheOubliee } from './acc-memo.js';
import { generateKeyPairSync } from 'node:crypto';
const PK = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
function d1() {
  const s = new DatabaseSync(':memory:');
  const stmt = (sql, p = []) => ({ bind: (...x) => stmt(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; }, _exec: () => s.prepare(sql).run(...p) });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { for (const x of l) x._exec(); return []; }, _s: s };
}
const db = d1(); await schemaCercle(db);
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CERCLE_DB: db,
  FIREBASE_CLIENT_EMAIL: 'sa@x.iam', FIREBASE_PRIVATE_KEY: PK, FIREBASE_WEB_API_KEY: 'WEBKEY' };
const envoyes = [];
globalThis.fetch = async (u, o) => { const url = typeof u === 'string' ? u : u.url;
  if (/signInWithCustomToken/.test(url)) { envoyes.push(JSON.parse(o.body).token); return new Response(JSON.stringify({ idToken: 'ID-CMC', refreshToken: 'RT-CMC', expiresIn: '3600' }), { status: 200, headers: { 'content-type': 'application/json' } }); }
  return new Response('null', { status: 200, headers: { 'content-type': 'application/json' } }); };
const claims = (jwt) => { let s = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return JSON.parse(Buffer.from(s, 'base64').toString('utf8')); };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const req = (host, path, { method = 'GET', body, headers = {} } = {}) => {
  const r = new Request('https://' + host + path, { method, headers: Object.assign({ host, 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9' }, headers), body: body === undefined ? undefined : JSON.stringify(body) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } }); return r;
};
const appel = async (path, o = {}, host = 'kd-mc.com') => { const r = await mod.fetch(req(host, path, o), env, { waitUntil() {} }); return { st: r.status, j: await r.json().catch(() => ({})) }; };
const who = (tok, host) => appel('/__sso/whoami', { headers: { authorization: 'Bearer ' + tok } }, host);
const journal = [];
const outils = { qui: async () => ({ admin: true, uid: 'kdmc_admin', name: 'Kevin' }), journal: async (e) => { journal.push(e); }, fetch: globalThis.fetch, fbToken: async () => '' };
const boite = async (path, body) => { const r = await handleBoite(req('kd-mc.com', '/__boite' + path, { method: body ? 'POST' : 'GET', body }), new URL('https://kd-mc.com/__boite' + path), env, outils); return r.json(); };
const fiche = (uid) => JSON.parse(kv.get('acc:' + uid) || 'null');

let r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'lea-cmc', name: 'Lea Cmc', cgu: true, code: '246810', telephone: '+377 06 12 34 56' } }, 'cmcteams.kd-mc.com');
const T = r.j.token;
ok(r.j.ok === true && T, '0. compte créé, session obtenue', r.j);
const fb = (tok, host, corps) => appel('/__sso/fbtoken', { method: 'POST', body: corps === undefined ? { scope: 'cmc' } : corps, headers: tok ? { authorization: 'Bearer ' + tok } : {} }, host || 'cmcteams.kd-mc.com');
const kvAvant = kv.size;
r = await fb(T);
const c = envoyes.length ? claims(envoyes[envoyes.length - 1]) : {};
ok(r.st === 200 && r.j.ok && r.j.id_token === 'ID-CMC' && r.j.refresh_token === 'RT-CMC', '1. personne reconnue → 200 + id_token échangé', r);
ok(c.uid === 'cmc_lea-cmc' && c.claims && c.claims.scope === 'cmc' && !c.claims.role, '1b. jeton signé : uid cmc_<uid>, claim scope cmc, aucun rôle', c);
ok(kv.size === kvAvant, '3b. aucune écriture KV de plus pour un jeton', { avant: kvAvant, apres: kv.size });
r = await fb(null);
ok(r.st === 401, '2. sans session → 401', r);
const a = fiche('lea-cmc'); a.bloque = ['cmcteams']; kv.set('acc:lea-cmc', JSON.stringify(a)); ficheOubliee(env, 'lea-cmc');
r = await fb(T);
ok(r.st === 403 && r.j.reason === 'hors_perimetre', '2b. fermée sur CMCteams par l\'admin → 403 hors_perimetre', r);
delete a.bloque; kv.set('acc:lea-cmc', JSON.stringify(a)); ficheOubliee(env, 'lea-cmc');
let derniers = [];
for (let i = 0; i < 20; i++) derniers.push((await fb(T)).st);
ok(derniers.filter((x) => x === 200).length === 19 && derniers[19] === 429, '3. 20 jetons par personne et par heure, le 21e → 429', derniers.slice(-3));
const jour = db._s.prepare("SELECT n FROM compteurs WHERE cle LIKE 'fbcmc_jour:%'").get();
ok(jour && jour.n === 20, '3c. compteur du jour (adoption) tenu en D1', jour);
r = await fb(T, 'cmcteams.kd-mc.com', {});
ok(r.st === 403 && r.j.reason === 'role_requis', '4. sans « scope » : comportement d\'avant (rôle exigé)', r);

/* 16.10 : la sonde de bout en bout (pour le robot de déploiement seulement) */
const sonde = async (asn, entete) => { const r0 = new Request('https://kd-mc.com/__sso/fbtoken-sonde', { headers: entete ? { 'x-kdmc-sonde': 'deploy' } : {} });
  Object.defineProperty(r0, 'cf', { value: { asn } }); const r1 = await mod.fetch(r0, env, { waitUntil() {} }); const t = await r1.text(); return { st: r1.status, t }; };
let so = await sonde(6758, true);
ok(so.st === 404, '5. sonde : refusée hors du réseau du robot (même avec l\'en-tête)', so);
so = await sonde(8075, false);
ok(so.st === 404, '5b. sonde : refusée sans l\'en-tête du robot', so);
so = await sonde(8075, true);
const sj = JSON.parse(so.t);
ok(sj.ok === true && sj.etape === 'firebase' && sj.http === 200, '5c. sonde du robot : jeton cmc fabriqué et présenté à Firebase → code HTTP rendu', sj);
ok(!/ID-CMC|RT-CMC|eyJ/.test(so.t), '5d. la sonde ne laisse JAMAIS sortir le jeton', so.t);

console.log(`\n${fail ? '❌' : '✅'} fbtoken-cmc : ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
