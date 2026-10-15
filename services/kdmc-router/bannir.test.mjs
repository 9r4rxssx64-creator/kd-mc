/* GARDE — « l'option bannir pour que la personne ne puisse pas se réinscrire, si besoin » (Kevin 15.10.2026)
   node services/kdmc-router/bannir.test.mjs
   Avec le VRAI routeur : supprimer SANS bannir → la personne peut se réinscrire ; supprimer AVEC bannir → plus d'inscription neuve ni par le même nom
   (même écrit autrement), ni par le même identifiant, ni par le même téléphone confirmé ; un autre nom passe ; la liste des bannis ; « autoriser de
   nouveau » rouvre ; jamais l'admin ; l'écran : case « Bannir aussi », liste, bouton. */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
let ipN = 1;
const req = (host, path, { method = 'GET', body, headers = {} } = {}) => {
  const r = new Request('https://' + host + path, { method, headers: Object.assign({ host, 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.' + (ipN++ % 250 + 1) }, headers), body: body === undefined ? undefined : JSON.stringify(body) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } }); return r;
};
const appel = async (path, o = {}, host = 'kd-mc.com') => { const r = await mod.fetch(req(host, path, o), env, { waitUntil() {} }); return { st: r.status, j: await r.json().catch(() => ({})) }; };
const inscrire = (uid, name, extra = {}) => appel('/__sso/issue', { method: 'POST', body: Object.assign({ uid, name, cgu: true, code: '246810', telephone: '+377 06 12 34 56', validation: 'admin' }, extra) });
const lg = await appel('/__admin/login', { method: 'POST', body: { code: CODE } });
const adm = (path, body, method = 'POST') => appel(path, { method, body: method === 'GET' ? undefined : body, headers: { 'x-kdmc-admin': lg.j.grant } });

console.log('\n== 1. Supprimer SANS bannir : la porte reste ouverte ==');
let r = await inscrire('paul-a', 'Paul Alpha');
ok(r.j.ok === true, '1. inscrit', r.j);
r = await adm('/__admin/compte-supprimer', { uid: 'paul-a', confirmer: true });
ok(r.j.ok === true && r.j.banni === undefined && ![...kv.keys()].some((k) => k.startsWith('ban:')), '1b. supprimé sans bannir : aucune trace de ban', r.j);
r = await inscrire('paul-a', 'Paul Alpha');
ok(r.j.ok === true, '1c. il peut se réinscrire', r.j);

console.log('\n== 2. Supprimer AVEC bannir ==');
// donne une empreinte de téléphone à la fiche pour tester le ban par téléphone
const fa = JSON.parse(kv.get('acc:paul-a')); fa.tel = { empreinte: 'emp-123', masque: '+377 •• •• 56', at: 1 }; kv.set('acc:paul-a', JSON.stringify(fa));
r = await adm('/__admin/compte-supprimer', { uid: 'paul-a', confirmer: true, bannir: true });
ok(r.j.ok === true && r.j.banni === true, '2. supprimé et banni', r.j);
ok(kv.has('ban:nom:paul alpha') && kv.has('ban:uid:paul-a') && kv.has('ban:tel:emp-123'), '2b. nom, identifiant et empreinte du téléphone retenus (jamais le numéro)');
ok(!JSON.stringify([...kv.entries()].filter(([k]) => k.startsWith('ban:'))).includes('06 12 34 56'), '2c. aucun numéro en clair dans les bans');
r = await inscrire('paul-a', 'Paul Alpha');
ok(r.st === 403 && r.j.reason === 'banni' && !kv.has('acc:paul-a') && !/band|ban\b/i.test(r.j.message || ''), '2d. même nom + même identifiant → refusé, aucune fiche, message neutre', r);
r = await inscrire('autre-id', 'PAUL  alpha');
ok(r.st === 403 && r.j.reason === 'banni' && !kv.has('acc:autre-id'), '2e. même nom écrit autrement (majuscules, espaces) + autre identifiant → refusé', r);
r = await inscrire('paul-a', 'Pierre Autre');
ok(r.st === 403 && r.j.reason === 'banni', '2f. même identifiant sous un autre nom → refusé', r);
r = await inscrire('nouveau-x', 'Marie Nouvelle');
ok(r.j.ok === true, '2g. une autre personne s\'inscrit normalement', r.j);

console.log('\n== 3. La liste et « autoriser de nouveau » ==');
r = await adm('/__admin/bannis', undefined, 'GET');
ok(r.j.ok === true && r.j.bannis.length === 1 && r.j.bannis[0].nom === 'Paul Alpha' && !('cles' in r.j.bannis[0]), '3. la liste montre Paul Alpha (sans les clés internes)', r.j);
r = await appel('/__admin/bannis');
ok(r.st === 403, '3b. la liste est fermée sans admin');
r = await appel('/__admin/debannir', { method: 'POST', body: { id: 'x' } });
ok(r.st === 403, '3c. autoriser de nouveau est fermé sans admin');
r = await adm('/__admin/debannir', { id: 'inconnu' });
ok(r.j.ok === false && r.j.reason === 'not_found', '3d. id inconnu → not_found', r.j);
const id = (await adm('/__admin/bannis', undefined, 'GET')).j.bannis[0].id;
r = await adm('/__admin/debannir', { id });
ok(r.j.ok === true && ![...kv.keys()].some((k) => k.startsWith('ban:nom') || k.startsWith('ban:uid') || k.startsWith('ban:tel')), '3e. autorisé de nouveau : les trois clés partent', r.j);
r = await inscrire('paul-a', 'Paul Alpha');
ok(r.j.ok === true, '3f. il peut de nouveau s\'inscrire', r.j);
ok(JSON.parse(kv.get('aud:log') || '[]').some((e) => e.ev === 'debanni'), '3g. journalisé');

console.log('\n== 4. Jamais l\'admin ==');
kv.set('acc:kdmc_admin', JSON.stringify({ uid: 'kdmc_admin', name: 'Kevin Desarzens' }));
r = await adm('/__admin/compte-supprimer', { uid: 'kdmc_admin', confirmer: true, bannir: true });
ok(r.st === 403 && ![...kv.keys()].some((k) => k.startsWith('ban:nom') || k.startsWith('ban:uid')), '4. l\'admin ne se supprime ni ne se bannit', r);

console.log('\n== 5. L\'écran admin ==');
const src = readFileSync(new URL('../../kdmc-home/admin/admin.js', import.meta.url), 'utf8');
ok(/bannir-aussi/.test(src) && /Bannir aussi/.test(src) && /bannir: bannir/.test(src), '5. case « Bannir aussi » envoyée avec la suppression');
ok(/id="bannis"/.test(src) && /\/__admin\/bannis/.test(src) && /\/__admin\/debannir/.test(src) && /Autoriser de nouveau/.test(src), '5b. liste « Personnes bannies » + « Autoriser de nouveau »');
ok(/BANNI : elle ne pourra PAS se réinscrire/.test(src), '5c. la confirmation dit clairement ce que « bannir » change');

console.log(`\n${fail ? '❌' : '✅'} bannir : ${pass} ok, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
