/* GARDE — /__admin/anciennetes : les années d'entrée données à l'inscription remontent à CMCteams (Kevin 17.10.2026 : « On connaîtra les dates
   au fur et à mesure des inscriptions et tu mettras tout à jour toujours »).
   node services/kdmc-router/anciennetes.test.mjs

   Avec le VRAI routeur :
     1. sans admin → 403 (la porte reste fermée, comme toutes les /__admin) ;
     2. l'admin reçoit UNIQUEMENT les fiches qui portent un matricule U… ET une année ; champs : matricule, anneeSbm, anneeJeux, nom, maj —
        jamais téléphone, e-mail, date de naissance ;
     3. la fiche vient bien de /__sso/fiche (le formulaire de première connexion) ; une fiche sans matricule n'y est pas ;
     4. sabotage : si le filtre « matricule U… » disparaît, une fiche sans matricule passe → le test 3 rougit. */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import mod from './worker.js';
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
const CODE = '424242';
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update(CODE).digest('hex'), ACCOUNTS, CERCLE_DB: db };
globalThis.fetch = async () => new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const req = (host, path, { method = 'GET', body, headers = {} } = {}) => {
  const r = new Request('https://' + host + path, { method, headers: Object.assign({ host, 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9' }, headers), body: body === undefined ? undefined : JSON.stringify(body) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } }); return r;
};
const appel = async (path, o = {}, host = 'kd-mc.com') => { const r = await mod.fetch(req(host, path, o), env, { waitUntil() {} }); return { st: r.status, j: await r.json().catch(() => ({})) }; };

console.log('\n== Deux inscriptions, une fiche avec matricule, une sans ==');
let r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'lea-anc', name: 'Lea Anc', cgu: true, code: '246810', telephone: '+377 06 12 34 56' } });
const T1 = r.j.token; ok(r.j.ok === true, 'compte 1 créé', r.j);
r = await appel('/__sso/fiche', { method: 'POST', body: { matricule: 'u00062', anneeSbm: '2015', anneeJeux: '2018', telephone: '+377 06 12 34 56', email: 'lea@example.com' }, headers: { authorization: 'Bearer ' + T1 } });
ok(r.j.ok === true && r.j.champs.includes('matricule') && r.j.champs.includes('anneeSbm'), 'fiche 1 : matricule + années enregistrés par /__sso/fiche', r.j);
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'max-anc', name: 'Max Anc', cgu: true, code: '135790', telephone: '+377 06 00 00 00' } });
const T2 = r.j.token;
r = await appel('/__sso/fiche', { method: 'POST', body: { anneeSbm: '2010', telephone: '+377 06 00 00 00' }, headers: { authorization: 'Bearer ' + T2 } });
ok(r.j.ok === true && !r.j.champs.includes('matricule'), 'fiche 2 : une année mais PAS de matricule', r.j);

console.log('\n== 1. Sans admin : fermé ==');
r = await appel('/__admin/anciennetes');
ok(r.st === 403, 'GET /__admin/anciennetes sans admin → 403', r);
r = await appel('/__admin/anciennetes', { headers: { authorization: 'Bearer ' + T1 } });
ok(r.st === 403, 'avec une session d\'employé → 403 aussi', r);

console.log('\n== 2. L\'admin lit les anciennetés ==');
const lg = await appel('/__admin/login', { method: 'POST', body: { code: CODE } });
const grant = lg.j.grant; ok(typeof grant === 'string' && grant.length > 10, 'admin prouvé', lg);
r = await appel('/__admin/anciennetes', { headers: { 'x-kdmc-admin': grant } });
ok(r.st === 200 && r.j.ok === true && Array.isArray(r.j.anciennetes), 'réponse ok', r.j);
const L = r.j.anciennetes || [];
ok(L.length === 1 && L[0].matricule === 'U00062' && L[0].anneeSbm === 2015 && L[0].anneeJeux === 2018 && L[0].nom === 'Lea Anc', 'une seule ligne : U00062, SBM 2015, jeux 2018, nom', L);
const cles = Object.keys(L[0] || {}).sort().join(',');
ok(!/telephone|email|dateNaissance|tel|code/.test(cles), 'rien d\'autre que matricule, années, nom, maj : ' + cles);
ok(!L.some((x) => x.nom === 'Max Anc'), '3. la fiche SANS matricule n\'y est pas (rien à relier dans CMCteams)');

console.log('\n== 4. Sabotage (le filtre matricule retiré laisserait passer Max) ==');
const idx = JSON.parse(kv.get('idx:uids') || '[]');
const sansFiltre = idx.map((u) => JSON.parse(kv.get('acc:' + u) || 'null')).filter((a) => a && a.fiche && (a.fiche.anneeSbm || a.fiche.anneeJeux));
ok(sansFiltre.length === 2 && L.length === 1, 'sans le filtre « matricule U… » il y aurait 2 lignes au lieu de 1 → le test 3 discrimine');

console.log(`\n${pass} ✅ / ${fail} ❌\n`);
process.exit(fail ? 1 : 0);
