/* GARDE — « Si pas de WhatsApp, validation admin. Au choix » (Kevin 10.10.2026)
   node services/kdmc-router/validation-admin.test.mjs

   Avec le VRAI routeur, WhatsApp branché (confirmation exigée) :
     1. sans preuve ET sans choix → toujours tel_requis (rien n'est créé), avec le signal « validation admin possible » ;
     2. avec le choix validation:'admin' → le compte est créé (nom + code) MAIS fermé : les apps le refusent (attente_admin),
        le portail le reçoit avec attente_admin, la boîte de Kevin liste la demande (appareil, lieu, réseau), journal + alerte ;
     3. Kevin refuse → toujours fermé (refuse_admin) ; Kevin accepte → ouvert partout, la demande quitte la liste ;
     4. le choix ne touche jamais un compte DÉJÀ inscrit, ni l'admin ;
     5. le portail : bouton « Je n'ai pas WhatsApp », envoi de validation:'admin', écran d'attente AVANT tout retour vers l'app. */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import mod from './worker.js';
import { handleBoite } from './boite.js';
import { schema as schemaCercle } from './cercle.js';

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
  WA_ACCESS_TOKEN: 'jeton', WA_PHONE_NUMBER_ID: '123', WA_APP_SECRET: 'secret-app', WA_VERIFY_TOKEN: 'mot', WA_NUMERO_PUBLIC: '377 99 00 00 00' };
globalThis.fetch = async () => new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
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

console.log('\n== 1. Sans preuve ni choix : rien ne change ==');
let r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'paul-sanswa', name: 'Paul Sanswa', cgu: true, code: '246810' } });
ok(r.st === 400 && r.j.reason === 'tel_requis' && r.j.validation_admin === true && !r.j.token && !kv.has('acc:paul-sanswa'), '1. tel_requis, aucune fiche, et le domaine signale l\'autre chemin (validation admin)', r);
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'paul-sanswa', name: 'Paul Sanswa', cgu: true, code: '246810', validation: 'n-importe' } });
ok(r.st === 400 && r.j.reason === 'tel_requis' && !kv.has('acc:paul-sanswa'), '1b. une valeur inventée n\'ouvre rien', r);

console.log('\n== 2. Le choix « validation admin » : compte créé, mais fermé ==');
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'paul-sanswa', name: 'Paul Sanswa', cgu: true, code: '246810', validation: 'admin' } });
const T = r.j.token;
ok(r.j.ok === true && r.j.attente_admin === true && T && /administrateur/.test(r.j.message || ''), '2. compte créé, la réponse dit « en attente de l\'administrateur »', r);
ok(fiche('paul-sanswa') && fiche('paul-sanswa').attente_admin === true && kv.has('cred:paul-sanswa'), '2b. la fiche porte attente_admin, le code est posé (nom + code marcheront après validation)', fiche('paul-sanswa'));
let w = await who(T, 'cmcteams.kd-mc.com');
ok(w.j.ok === false && w.j.reason === 'attente_admin' && w.j.hors_perimetre === true && /validation/.test(w.j.message || ''), '2c. une app le refuse : attente_admin, message clair', w.j);
w = await who(T, 'lingua.kd-mc.com');
ok(w.j.ok === false && w.j.reason === 'attente_admin', '2d. … une autre aussi (fermé PARTOUT sauf le portail)', w.j);
w = await who(T, 'kd-mc.com');
ok(w.j.ok === true && w.j.attente_admin === 'attente', '2e. le portail le reçoit, avec attente_admin (pour montrer l\'écran d\'attente)', w.j);
let b = await boite('/admin');
let ligne = (b.inscriptionsAdmin || []).find((x) => x.uid === 'paul-sanswa');
ok(ligne && ligne.nom === 'Paul Sanswa' && /iPhone/.test(ligne.appareil) && /Monaco, MC/.test(ligne.lieu) && /AS6758/.test(ligne.reseau), '2f. la boîte de Kevin liste la demande (appareil, lieu, réseau)', b.inscriptionsAdmin);
const aud = JSON.parse(kv.get('aud:log') || '[]');
ok(aud.some((e) => e.ev === 'inscription_admin_attente' && e.uid === 'paul-sanswa'), '2g. le journal admin porte « inscription_admin_attente »');
r = await appel('/__sso/login', { method: 'POST', body: { name: 'Paul Sanswa', code: '246810' } }, 'cmcteams.kd-mc.com');
if (r.j.token) { w = await who(r.j.token, 'cmcteams.kd-mc.com'); ok(w.j.ok === false && w.j.reason === 'attente_admin', '2h. nom + code depuis une app : la session ne l\'ouvre pas pour autant', w.j); }
else ok(r.j.ok !== true, '2h. nom + code depuis une app : pas d\'ouverture', r.j);

console.log('\n== 3. Kevin tranche ==');
let d = await boite('/admin/inscription-admin', { uid: 'paul-sanswa', accepter: false });
ok(d.ok === true && d.accepte === false && fiche('paul-sanswa').attente_admin === 'refuse', '3. refuser → la fiche reste fermée (refuse)', d);
w = await who(T, 'cmcteams.kd-mc.com');
ok(w.j.ok === false && w.j.reason === 'refuse_admin', '3b. l\'app le refuse toujours (refuse_admin)', w.j);
w = await who(T, 'kd-mc.com');
ok(w.j.attente_admin === 'refuse', '3c. le portail sait que c\'est refusé', w.j);
b = await boite('/admin');
ok(!(b.inscriptionsAdmin || []).some((x) => x.uid === 'paul-sanswa'), '3d. la demande a quitté la liste');
d = await boite('/admin/inscription-admin', { uid: 'paul-sanswa', accepter: true });
ok(d.ok === false && d.reason === 'demande_introuvable', '3e. pas de 2e décision sur une demande déjà tranchée', d);

r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'rose-sanswa', name: 'Rose Sanswa', cgu: true, code: '135790', validation: 'admin' } });
const T2 = r.j.token;
d = await boite('/admin/inscription-admin', { uid: 'rose-sanswa', accepter: true });
ok(d.ok === true && d.accepte === true && fiche('rose-sanswa').attente_admin === undefined && fiche('rose-sanswa').valide_admin_at, '3f. accepter → la fiche s\'ouvre', d);
w = await who(T2, 'cmcteams.kd-mc.com');
ok(w.j.reason !== 'attente_admin' && w.j.reason !== 'refuse_admin', '3g. l\'app ne parle plus d\'attente (le périmètre normal s\'applique)', w.j);
w = await who(T2, 'kd-mc.com');
ok(w.j.ok === true && !w.j.attente_admin, '3h. le portail l\'ouvre normalement', w.j);
ok(journal.some((e) => e.ev === 'inscription_admin_validee' && e.uid === 'rose-sanswa') && journal.some((e) => e.ev === 'inscription_admin_refusee' && e.uid === 'paul-sanswa'), '3i. chaque décision est journalisée');

console.log('\n== 4. Jamais un compte déjà inscrit ==');
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'rose-sanswa', name: 'Rose Sanswa', cgu: true, code: '135790', validation: 'admin' } });
ok(r.j.ok === true && !r.j.attente_admin && fiche('rose-sanswa').attente_admin === undefined, '4. reconnexion d\'un compte ouvert avec validation:admin → rien ne se referme', r.j);

console.log('\n== 5. Le portail ==');
const portail = readFileSync(new URL('../../kdmc-home/kdmc-portal.js', import.meta.url), 'utf8');
const sso = readFileSync(new URL('../../kdmc-home/kdmc-sso.js', import.meta.url), 'utf8');
ok(/id="t-admin"/.test(portail) && /Je n\\'ai pas WhatsApp/.test(portail), '5. bouton « Je n\'ai pas WhatsApp — demander la validation à l\'administrateur »');
ok(/validation: validation === 'admin' \? 'admin' : undefined/.test(sso) && /attente_admin: j\.attente_admin \|\| ''/.test(sso), '5b. kdmc-sso : envoie validation:\'admin\' et remonte attente_admin du whoami');
const hub = portail.slice(portail.indexOf('function showHub'), portail.indexOf('function showHub') + 1500);
ok(hub.indexOf('renderAttenteAdmin(r.session)') > 0 && hub.indexOf('renderAttenteAdmin(r.session)') < hub.indexOf('gotoReturnIfAny()'), '5c. showHub montre l\'écran d\'attente AVANT tout retour vers l\'app (pas de ping-pong)');
ok(/function renderAttenteAdmin/.test(portail) && /setInterval\(verifier, 30000\)/.test(portail) && /document\.hidden/.test(portail), '5d. l\'écran d\'attente revérifie tout seul (30 s, en pause écran caché)');

console.log(`\n${fail ? '❌' : '✅'} validation-admin : ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
