/* DONNÉES RH NOMINATIVES — le routeur ne les sert qu'à une personne reconnue (audit 30.09.2026, P0-3 / R3)
 *
 * Mesuré avant : boards-gen.js (291 noms + plannings), planning-seed.js, seances-seed.js servis à quiconque
 * avait l'adresse. Ici, le VRAI routeur (worker.js), hébergeur et KV simulés, hors ligne :
 *   1. sans session : 401 + x-kdmc-porte: fiche, cache-control no-store, pour les 4 fichiers, par chaque
 *      adresse (cmcteams, departs, kd-mc.com/CMCteams/…), en GET et en HEAD, chemins déguisés compris
 *      (%2e, majuscules, barres doublées) ; l'en-tête de sonde ne donne rien ;
 *   2. avec session (cookie, Bearer, x-kdmc-sso) non révoquée : 200, le fichier déposé dans le KV, en
 *      text/javascript, jamais mis en cache public ; HEAD sans corps ;
 *   3. KV vide : reconnu → l'hébergeur répond (le fichier y reste jusqu'à l'étape B) ; inconnu → toujours 401 ;
 *   4. session révoquée, ou compte bloqué sur CMCteams par l'admin → 401 ; l'admin vérifié → 200 ;
 *   5. les fichiers voisins non nominatifs (planning-seed-emps.js, convention-sbm.js, index.html) restent libres ;
 *   6. sans KDMC_SSO_SECRET (test local) : ouvert, comme les portes « fiche ».
 * SABOTAGE prouvé le 1.10.2026 : l'appel `donneesRhFermees` retiré du flux → les cas 1 et 4 rougissent.
 * node services/kdmc-router/donnees-rh.test.mjs */
import { createHmac } from 'node:crypto';
import mod from './worker.js';
import { DONNEES_RH, cleKV } from './donnees-rh.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', /* ce test prouve AUTRE chose que la porte totale (voir compte-obligatoire.test.mjs) */ KDMC_CODE_OBLIGATOIRE: '0', /* …ni que le code obligatoire (8.10 : porte-enveloppe.test § 5c) */ ACCOUNTS };
const ctx = { waitUntil() {} };
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jeton = (uid, opts = {}) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: opts.verified ? 1 : 0, iat: opts.iat || Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };

/* L'hébergeur simulé : il sert tout (comme Cloudflare Pages aujourd'hui) et on compte ses appels. */
let amont = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  if (/(^|\.)kd-mc\.com$/i.test(u.hostname)) return realFetch(input);
  amont++;
  return new Response('window.DEPARTS_GEN={"amont":true}', { status: 200, headers: { 'content-type': 'text/javascript' } });
};
const demande = async (url, headers = {}, method = 'GET') => { amont = 0; const r = await mod.fetch(new Request(url, { method, headers }), env, ctx); return { r, st: r.status, porte: r.headers.get('x-kdmc-porte') || '', donnees: r.headers.get('x-kdmc-donnees') || '', corps: method === 'HEAD' ? '' : await r.text(), amont }; };

console.log('\nDonnées RH : le routeur ne les sert qu\'à une personne reconnue\n');
const ADRESSES = ['https://cmcteams.kd-mc.com/CMCteams/tools/departs/boards-gen.js', 'https://departs.kd-mc.com/boards-gen.js',
  'https://cmcteams-light.kd-mc.com/seances-gen.js', 'https://kd-mc.com/CMCteams/tools/shared/planning-seed.js',
  'https://cmcteams.kd-mc.com/CMCteams/tools/shared/seances-seed.js'];

/* 1. sans session */
for (const a of ADRESSES) {
  const x = await demande(a);
  ok(x.st === 401 && x.porte === 'fiche' && x.donnees === 'rh' && x.amont === 0 && x.r.headers.get('cache-control') === 'no-store', `1. sans session : ${a.replace('https://', '')} → 401 porte fiche, hébergeur jamais appelé`);
}
for (const d of ['https://cmcteams.kd-mc.com/CMCteams/tools/departs/BOARDS-GEN.js', 'https://cmcteams.kd-mc.com/CMCteams/tools/departs/boards%2Dgen.js', 'https://cmcteams.kd-mc.com/CMCteams//tools/departs/boards-gen.js', 'https://departs.kd-mc.com/%62oards-gen.js']) {
  const x = await demande(d);
  ok(x.st === 401 && x.porte === 'fiche', `1b. chemin déguisé ${new URL(d).pathname} → 401 quand même`);
}
{
  const x = await demande(ADRESSES[0], {}, 'HEAD');
  ok(x.st === 401, '1c. HEAD sans session → 401');
  const y = await demande(ADRESSES[0], { 'x-kdmc-sonde': 'test' });
  ok(y.st === 401, '1d. l\'en-tête de sonde ne donne pas les données');
}

/* 2. avec session, KV rempli */
for (const c of DONNEES_RH) kv.set(cleKV(c.toLowerCase()), 'window.DEPARTS_GEN={"kv":"' + c + '"}');
const t = jeton('u-marie');
for (const [nom, h] of [['cookie', { cookie: 'kdmc_sso=' + t }], ['Bearer', { authorization: 'Bearer ' + t }], ['x-kdmc-sso', { 'x-kdmc-sso': t }]]) {
  const x = await demande(ADRESSES[0], h);
  ok(x.st === 200 && /"kv":"\/CMCteams\/tools\/departs\/boards-gen\.js"/.test(x.corps) && /text\/javascript/.test(x.r.headers.get('content-type')) && x.amont === 0 && x.donnees === 'rh-kv',
    `2. session par ${nom} → 200, le fichier du KV (text/javascript), hébergeur pas appelé`);
}
{
  const x = await demande('https://departs.kd-mc.com/boards-gen.js', { cookie: 'kdmc_sso=' + t });
  ok(x.st === 200 && /boards-gen/.test(x.corps), '2b. la light (departs.kd-mc.com/boards-gen.js) reçoit le même fichier du KV');
  const cc = x.r.headers.get('cache-control') || '';
  ok(/private/.test(cc) && !/public/.test(cc) && x.r.headers.get('x-content-type-options') === 'nosniff', `2c. réponse privée, jamais en cache partagé (${cc}), nosniff`);
  const y = await demande(ADRESSES[0], { cookie: 'kdmc_sso=' + t }, 'HEAD');
  ok(y.st === 200, '2d. HEAD avec session → 200');
}

/* 3. KV vide : reconnu → hébergeur ; inconnu → 401 */
kv.clear();
{
  const x = await demande(ADRESSES[0], { cookie: 'kdmc_sso=' + t });
  ok(x.st === 200 && /"amont":true/.test(x.corps) && x.amont === 1, '3a. KV vide + session → l\'hébergeur répond (étape B pas encore faite)');
  const y = await demande(ADRESSES[0]);
  ok(y.st === 401 && y.amont === 0, '3b. KV vide + sans session → toujours 401');
}

/* 4. révoqué, bloqué, admin */
{
  kv.set('acc:u-rev', JSON.stringify({ uid: 'u-rev', name: 'u-rev', revoked_at: Date.now() + 1000 }));
  const x = await demande(ADRESSES[0], { cookie: 'kdmc_sso=' + jeton('u-rev', { iat: Date.now() - 5000 }) });
  ok(x.st === 401, '4a. session révoquée → 401');
  kv.set('acc:u-bloque', JSON.stringify({ uid: 'u-bloque', name: 'u-bloque', bloque: ['cmcteams'] }));
  const y = await demande(ADRESSES[0], { cookie: 'kdmc_sso=' + jeton('u-bloque') });
  ok(y.st === 401, '4b. compte bloqué sur CMCteams par l\'admin → 401');
  const z = await demande(ADRESSES[0], { cookie: 'kdmc_sso=' + jeton('kdmc_admin', { verified: true }) });
  ok(z.st === 200, '4c. l\'admin vérifié → 200');
}

/* 5. voisins non nominatifs : libres */
for (const v of ['https://cmcteams.kd-mc.com/CMCteams/tools/shared/planning-seed-emps.js', 'https://cmcteams.kd-mc.com/CMCteams/tools/shared/convention-sbm.js', 'https://departs.kd-mc.com/index.html']) {
  const x = await demande(v);
  ok(x.st === 200 && x.amont === 1, `5. ${new URL(v).pathname} reste servi sans session (rien de nominatif)`);
}

/* 6. sans secret : ouvert (comme les portes fiche) */
{
  amont = 0;
  const r = await mod.fetch(new Request(ADRESSES[0]), { ACCOUNTS }, ctx);
  ok(r.status === 200 && amont === 1, '6. domaine sans KDMC_SSO_SECRET (test local) : ouvert');
}

/* la liste elle-même */
ok(DONNEES_RH.length === 4 && DONNEES_RH.every((c) => c.startsWith('/CMCteams/')), 'la liste compte 4 fichiers, préfixés /CMCteams');

console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
