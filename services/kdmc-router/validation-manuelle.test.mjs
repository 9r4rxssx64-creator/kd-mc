/* GARDE — « En attendant WhatsApp je valide manuellement » (Kevin 15.10.2026)
   node services/kdmc-router/validation-manuelle.test.mjs  
   Avec le VRAI routeur, KDMC_VALIDATION_MANUELLE=1 (WhatsApp NON branché) :
     1. une NOUVELLE inscription (sans aucun champ « validation », comme le portail actuel) est créée mais fermée : les apps la refusent
        (attente_admin), le portail la reçoit, la boîte de Kevin la liste, Kevin accepte → ouverte ;
     2. un compte DÉJÀ inscrit n'est jamais refermé ; l'interrupteur coupé = inscription libre comme avant ;
     3. WhatsApp branché + interrupteur : plus de refus « tel_requis », la demande attend Kevin ;
     4. le réglage de production est posé dans wrangler.toml. */
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
  KDMC_VALIDATION_MANUELLE: '1' };
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


console.log('\n== 1. Nouvelle inscription = en attente de Kevin ==');
let r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'bob-neuf', name: 'Bob Neuf', cgu: true, code: '246810', telephone: '+377 06 12 34 56' } });
const T = r.j.token;
ok(r.j.ok === true && r.j.attente_admin === true && T, '1. compte créé, la réponse dit « en attente de l\'administrateur »', r);
ok(fiche('bob-neuf') && fiche('bob-neuf').attente_admin === true, '1b. la fiche porte attente_admin', fiche('bob-neuf'));
let w = await who(T, 'cmcteams.kd-mc.com');
ok(w.j.ok === false && w.j.reason === 'attente_admin', '1c. une app le refuse (attente_admin)', w.j);
w = await who(T, 'kd-mc.com');
ok(w.j.ok === true && w.j.attente_admin === 'attente', '1d. le portail le reçoit avec attente_admin', w.j);
let b = await boite('/admin');
ok((b.inscriptionsAdmin || []).some((x) => x.uid === 'bob-neuf'), '1e. la boîte de Kevin liste la demande', b.inscriptionsAdmin);
let d = await boite('/admin/inscription-admin', { uid: 'bob-neuf', accepter: true });
ok(d.ok === true && d.accepte === true && fiche('bob-neuf').attente_admin === undefined, '1f. Kevin accepte → la fiche s\'ouvre', d);
w = await who(T, 'kd-mc.com');
ok(w.j.ok === true && !w.j.attente_admin, '1g. le portail l\'ouvre normalement', w.j);

console.log('\n== 2. Jamais un compte déjà inscrit ; interrupteur coupé = comme avant ==');
env.KDMC_VALIDATION_MANUELLE = '0';
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'ana-ancienne', name: 'Ana Ancienne', cgu: true, code: '135790', telephone: '+377 06 12 34 56' } });
ok(r.j.ok === true && !r.j.attente_admin && fiche('ana-ancienne').attente_admin === undefined, '2. interrupteur coupé : inscription libre, aucun blocage', r.j);
env.KDMC_VALIDATION_MANUELLE = '1';
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'ana-ancienne', name: 'Ana Ancienne', cgu: true, code: '135790', telephone: '+377 06 12 34 56' } });
ok(r.j.ok === true && !r.j.attente_admin && fiche('ana-ancienne').attente_admin === undefined, '2b. interrupteur remis : le compte déjà inscrit ne se referme pas', r.j);

console.log('\n== 3. Avec WhatsApp branché ==');
Object.assign(env, { WA_ACCESS_TOKEN: 'jeton', WA_PHONE_NUMBER_ID: '123', WA_APP_SECRET: 'secret-app', WA_VERIFY_TOKEN: 'mot', WA_NUMERO_PUBLIC: '377 99 00 00 00' });
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'dan-wa', name: 'Dan Wa', cgu: true, code: '246810', telephone: '+377 06 12 34 56' } });
ok(r.st !== 400 && r.j.ok === true && r.j.attente_admin === true, '3. pas de refus « tel_requis » : la demande attend Kevin', r);

console.log('\n== 4. Réglage de production ==');
const wr = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
ok(/^KDMC_VALIDATION_MANUELLE = "1"/m.test(wr), '4. wrangler.toml pose KDMC_VALIDATION_MANUELLE = "1"');

console.log(`\n${fail ? '❌' : '✅'} validation-manuelle : ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
