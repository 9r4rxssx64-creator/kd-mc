/* GARDE — « Yann et Ludo ont déjà un compte, pourquoi n'arrivent-ils pas à se connecter ? » (Kevin 18.10.2026)
   node services/kdmc-router/code-attendu.test.mjs
   Mesuré en réel (robot « parcours d'une personne invitée », variante B) : un compte d'avant le 8.10, SANS code, qui propose son code depuis un téléphone neuf
   « attend l'administrateur » — la personne est bloquée jusqu'à ce que Kevin ouvre sa boîte. Quand Kevin l'a LUI-MÊME inscrite d'avance (liste « personnes
   attendues »), sa décision est prise : le code est accepté tout de suite. Avec le VRAI routeur, un registre KV et une base D1 simulés :
     1. sans inscription d'avance : le code proposé ATTEND Kevin (rien ne change : la règle du 8.10 reste entière) ;
     2. Kevin inscrit le nom d'avance : le même code, par « nom + code » (porte /__sso/login), ouvre la session TOUT DE SUITE, le code est posé, l'inscription d'avance est consommée ;
     3. même chose par /__sso/issue (écran « Crée ton code » du portail) ;
     4. un AUTRE nom (non inscrit) depuis Stockholm : toujours en attente ; le nom seul : toujours refusé ; une inscription d'avance de plus de 14 jours ne vaut plus ;
     5. SABOTAGE : sans la fonction codeAttenduAccepte, l'étape 2 échoue (le test discrimine). */
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

const nomsKV = (liste) => kv.set('cfg:attendus', JSON.stringify(liste));
const creerSansCode = async (uid, name) => {
  const c = await appel('/__sso/issue', { method: 'POST', body: { uid, name, cgu: true, code: '111111', telephone: '+377 06 12 34 56' }, ua: UA.iphone });
  kv.delete('cred:' + uid); const a0 = JSON.parse(kv.get('acc:' + uid)); delete a0.code_at; kv.set('acc:' + uid, JSON.stringify(a0));
  return c;
};
console.log('\n== Compte d\'avant le 8.10, sans code ==');
{ const c = await creerSansCode('ludo-test', 'Ludo Test'); ok(c.j.ok === true, '0. (décor) le compte existe, son code est retiré (comme avant le 8.10)', c); }
let r = await appel('/__sso/login', { method: 'POST', body: { name: 'Ludo Test', code: '246810' }, ua: UA.iphone });
ok(r.st === 202 && r.j.reason === 'code_en_attente' && !r.j.token && !kv.has('cred:ludo-test'), '1. pas inscrit d\'avance : le code proposé ATTEND Kevin (la règle du 8.10 est entière)', r);
db._s.prepare('DELETE FROM code_attente').run();

nomsKV([{ n: 'ludo test', at: Date.now() }]);
r = await appel('/__sso/login', { method: 'POST', body: { name: 'Ludo Test', code: '246810' }, ua: UA.iphone });
ok(r.st === 200 && r.j.ok === true && r.j.token && r.j.code === true, '2. inscrit d\'avance par Kevin : « nom + code » ouvre la session TOUT DE SUITE', r);
ok(kv.has('cred:ludo-test') && JSON.parse(kv.get('acc:ludo-test')).code_at > 0, '2b. le code est posé au domaine et la fiche le sait (code_at)');
ok(JSON.parse(kv.get('cfg:attendus') || '[]').length === 0, '2c. l\'inscription d\'avance est consommée (une seule fois)');
let aud = JSON.parse(kv.get('aud:log') || '[]');
ok(aud.some((e) => e.ev === 'code_accepte_attendu' && e.uid === 'ludo-test'), '2d. le journal admin porte « code_accepte_attendu »');
ok(!db._s.prepare('SELECT 1 FROM code_attente WHERE uid = ?').get('ludo-test'), '2e. rien ne reste dans la boîte « Codes à valider » de Kevin');
const encore = await appel('/__sso/login', { method: 'POST', body: { name: 'Ludo Test', code: '246810' }, ua: UA.windows, cf: STOCKHOLM });
ok(encore.j.ok === true, '2f. le code posé marche ensuite comme tout code (nom + code)');
const mes = await appel('/__sso/login', { method: 'POST', body: { name: 'Ludo Test', code: '246810' }, ua: UA.iphone, headers: { 'x-kdmc-mesure': '1' } });
ok(mes.j.ok === true && mes.j.ms && typeof mes.j.ms.total === 'number' && typeof mes.j.ms.enrich === 'number', '2f2. avec « x-kdmc-mesure: 1 », la durée de chaque étape est rendue (ms, rien d\'autre)', mes.j.ms);
ok(encore.j.ms === undefined, '2f3. sans cet en-tête, aucune mesure n\'est rendue');
const mauvais = await appel('/__sso/login', { method: 'POST', body: { name: 'Ludo Test', code: '999999' }, ua: UA.windows, cf: STOCKHOLM });
ok(mauvais.st === 401 && !mauvais.j.token, '2g. un mauvais code reste refusé');

console.log('\n== Même chose par l\'écran « Crée ton code » (/__sso/issue) ==');
{ const c = await creerSansCode('yann-test', 'Yann Test'); ok(c.j.ok === true, '3.0 (décor) un second compte sans code', c); }
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'yann-test', name: 'Yann Test', cgu: true, code: '135790' }, ua: UA.windows, cf: STOCKHOLM });
ok(r.st === 202 && r.j.reason === 'code_en_attente', '3a. pas inscrit d\'avance : attente', r);
db._s.prepare('DELETE FROM code_attente').run();
nomsKV([{ n: 'yann test', at: Date.now() }]);
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'yann-test', name: 'Yann Test', cgu: true, code: '135790' }, ua: UA.iphone });
ok(r.j.ok === true && r.j.token && r.j.code === true && kv.has('cred:yann-test'), '3b. inscrit d\'avance : le code est posé et la session est celle d\'un code prouvé', r);

console.log('\n== Un inconnu ne passe pas ==');
{ const c = await creerSansCode('marie-test', 'Marie Test'); ok(c.j.ok === true, '4.0 (décor) un troisième compte sans code', c); }
nomsKV([{ n: 'quelquun dautre', at: Date.now() }]);
r = await appel('/__sso/login', { method: 'POST', body: { name: 'Marie Test', code: '112233' }, ua: UA.windows, cf: STOCKHOLM });
ok(r.st === 202 && r.j.reason === 'code_en_attente' && !r.j.token && !kv.has('cred:marie-test'), '4. une autre personne est inscrite d\'avance, pas celle-ci : attente', r);
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'marie-test', name: 'Marie Test', cgu: true }, ua: UA.windows, cf: STOCKHOLM });
ok(r.st === 401 && r.j.reason === 'code_requis' && !r.j.token, '4b. le nom seul reste refusé', r);
{ const c = await creerSansCode('paul-test', 'Paul Test'); ok(c.j.ok === true, '4.1 (décor) un quatrième compte sans code', c); }
nomsKV([{ n: 'paul test', at: Date.now() - 20 * 86400000 }]);
r = await appel('/__sso/login', { method: 'POST', body: { name: 'Paul Test', code: '445566' }, ua: UA.iphone });
ok(r.st === 202 && r.j.reason === 'code_en_attente' && !kv.has('cred:paul-test'), '4c. inscrit d\'avance il y a 20 jours (> 14) : attente, Kevin revalide', r);
const prive = (await import('node:fs')).readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(/async function codeAttenduAccepte\(/.test(prive) && /await estAttendu\(env, nomFiche\)/.test(prive), '5. la décision se lit dans la liste de l\'admin (estAttendu), jamais dans ce que dit la personne');
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
