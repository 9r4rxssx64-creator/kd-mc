/* GARDE — « 🗑️ Supprimer ce compte » (Kevin 15.10.2026 : « Comment je supprime un compte ? » → « Ajoute »)
   node services/kdmc-router/compte-supprimer.test.mjs
   Avec le VRAI routeur : sans admin → 403 ; sans confirmation → refusé ; uid inconnu → not_found ; le compte part (fiche, code, compteur, nom réservé,
   index, demandes en attente) mais une copie reste en `del:` ; le nom redevient libre (la personne peut se réinscrire) ; JAMAIS l'admin ;
   l'écran : bouton absent pour l'admin, confirmation en clair. */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update(CODE).digest('hex'), ACCOUNTS, CERCLE_DB: db,
  WA_ACCESS_TOKEN: 'jeton', WA_PHONE_NUMBER_ID: '123', WA_APP_SECRET: 'secret-app', WA_VERIFY_TOKEN: 'mot', WA_NUMERO_PUBLIC: '377 99 00 00 00' };
globalThis.fetch = async () => new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const req = (host, path, { method = 'GET', body, headers = {} } = {}) => {
  const r = new Request('https://' + host + path, { method, headers: Object.assign({ host, 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9' }, headers), body: body === undefined ? undefined : JSON.stringify(body) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } }); return r;
};
const appel = async (path, o = {}, host = 'kd-mc.com') => { const r = await mod.fetch(req(host, path, o), env, { waitUntil() {} }); return { st: r.status, j: await r.json().catch(() => ({})) }; };

console.log('\n== 1. Un compte à supprimer ==');
let r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'yann-test', name: 'Yann Test', cgu: true, code: '246810', telephone: '+377 06 12 34 56', validation: 'admin' } });
ok(r.j.ok === true && kv.has('acc:yann-test') && kv.has('cred:yann-test') && kv.get('nm:yann test') === 'yann-test' && JSON.parse(kv.get('idx:uids')).includes('yann-test'), '1. compte créé (fiche, code, nom réservé, index)', r.j);
ok(await db.prepare('SELECT uid FROM inscription_admin WHERE uid = ?').bind('yann-test').first(), '1b. sa demande est dans la file');

console.log('\n== 2. Les portes ==');
r = await appel('/__admin/compte-supprimer', { method: 'POST', body: { uid: 'yann-test', confirmer: true } });
ok(r.st === 403 && kv.has('acc:yann-test'), '2. sans admin → 403, rien ne part');
const lg = await appel('/__admin/login', { method: 'POST', body: { code: CODE } });
const adm = (body) => appel('/__admin/compte-supprimer', { method: 'POST', body, headers: { 'x-kdmc-admin': lg.j.grant } });
r = await adm({ uid: 'yann-test' });
ok(r.st === 400 && r.j.reason === 'confirmation_requise' && kv.has('acc:yann-test'), '2b. sans confirmation → refusé, rien ne part', r);
r = await adm({ uid: 'inconnu-total', confirmer: true });
ok(r.j.ok === false && r.j.reason === 'not_found', '2c. uid inconnu → not_found', r.j);
r = await adm({ confirmer: true });
ok(r.j.ok === false, '2d. sans uid → refusé', r.j);

console.log('\n== 3. La suppression ==');
r = await adm({ uid: 'yann-test', confirmer: true });
ok(r.j.ok === true && r.j.supprime === true, '3. supprimé', r.j);
ok(!kv.has('acc:yann-test') && !kv.has('cred:yann-test') && !kv.has('rlc:yann-test'), '3b. fiche, code et compteur effacés');
ok(!kv.has('nm:yann test') && !JSON.parse(kv.get('idx:uids')).includes('yann-test'), '3c. le nom redevient libre, la personne sort de l\'index');
ok(!(await db.prepare('SELECT uid FROM inscription_admin WHERE uid = ?').bind('yann-test').first()), '3d. sa demande en attente est vidée');
const copie = JSON.parse(kv.get('del:yann-test') || 'null');
ok(copie && copie.name === 'Yann Test' && !('cred' in copie), '3e. une copie de la fiche (sans code) reste, pour réparer une erreur');
ok(JSON.parse(kv.get('aud:log') || '[]').some((e) => e.ev === 'compte_supprime' && e.uid === 'yann-test'), '3f. journalisé');
r = await adm({ uid: 'yann-test', confirmer: true });
ok(r.j.ok === false && r.j.reason === 'not_found', '3g. deuxième suppression → not_found');
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'yann-test', name: 'Yann Test', cgu: true, code: '135790', telephone: '+377 06 12 34 56', validation: 'admin' } });
ok(r.j.ok === true && kv.has('acc:yann-test'), '3h. la personne peut se réinscrire (nom libre)', r.j);

console.log('\n== 4. Jamais l\'admin ni le compte d\'un autre ==');
kv.set('acc:kdmc_admin', JSON.stringify({ uid: 'kdmc_admin', name: 'Kevin Desarzens' }));
r = await adm({ uid: 'kdmc_admin', confirmer: true });
ok(r.st === 403 && r.j.reason === 'admin_protege' && kv.has('acc:kdmc_admin'), '4. le compte admin ne se supprime pas', r);
kv.set('acc:kevin-d', JSON.stringify({ uid: 'kevin-d', name: 'Kevin Desarzens' }));
r = await adm({ uid: 'kevin-d', confirmer: true });
ok(r.st === 403 && kv.has('acc:kevin-d'), '4b. un compte au nom de Kevin non plus', r);
kv.set('acc:marie-x', JSON.stringify({ uid: 'marie-x', name: 'Marie X' })); kv.set('nm:marie x', 'marie-x'); kv.set('acc:paul-y', JSON.stringify({ uid: 'paul-y', name: 'Paul Y' }));
r = await adm({ uid: 'marie-x', confirmer: true });
ok(r.j.ok === true && kv.has('acc:paul-y') && !kv.has('acc:marie-x'), '4c. on ne touche qu\'au compte demandé', r.j);

console.log('\n== 5. L\'écran admin ==');
const src = readFileSync(new URL('../../kdmc-home/admin/admin.js', import.meta.url), 'utf8');
ok(/supprimer-compte/.test(src) && /Supprimer ce compte/.test(src) && /\/__admin\/compte-supprimer/.test(src) && /confirmer: true/.test(src) && /SUPPRIMER le compte/.test(src), '5. bouton + confirmation en clair + appel avec confirmer:true');
const deb = src.indexOf('function peutSupprimer'), fin = src.indexOf('function wireEtat');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(deb, fin) + ';this.peutSupprimer = peutSupprimer;', ctx);
ok(ctx.peutSupprimer({ uid: 'yann', name: 'Yann Lorenzi' }) === true, '5b. un compte ordinaire : bouton proposé');
ok(ctx.peutSupprimer({ uid: 'kdmc_admin', name: 'x' }) === false && ctx.peutSupprimer({ uid: 'k2', name: 'Kévin DESARZENS' }) === false && ctx.peutSupprimer(null) === false, '5c. admin et nom de Kevin : jamais de bouton');

console.log(`\n${fail ? '❌' : '✅'} compte-supprimer : ${pass} ok, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
