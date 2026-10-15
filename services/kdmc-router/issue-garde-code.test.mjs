/* /__sso/issue NE RÉTROGRADE PAS une session au code prouvé — audit Apex Chat du 13.10.2026.
   Avant : une app qui re-déclarait la personne SANS code (cgu, téléphone) recevait un pass k=0 posé en cookie pour tout le domaine :
   la personne, reconnue une seconde plus tôt, était redemandée partout.
   Ce test passe par le VRAI routeur et un registre KV simulé (noms fictifs).
     1. Léa Martin crée son compte avec un code → session au code prouvé ;
     2. une app la re-déclare SANS code avec sa session → le nouveau pass garde code:true ;
     3. la même requête SANS session ne donne rien (code_requis) ;
     4. la session d'une AUTRE personne ne donne pas le code de Léa ;
     5. un compte révoqué ne garde rien ;
     6. aucune élévation : jamais admin ni verified.
   node services/kdmc-router/issue-garde-code.test.mjs   (SABOTAGE=1 : on remet l'ancien comportement → 2 doit rougir) */
import mod from './worker.js';
import { createHash } from 'crypto';
import { ficheOubliee } from './acc-memo.js';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

let M = mod;
if (process.env.SABOTAGE === '1') {
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(dir, 'worker.js'), 'utf8').replace('let codeFinal = codeProuve;\n    if (!codeFinal) {', 'let codeFinal = codeProuve;\n    if (false) {');
  const tmp = join(mkdtempSync(join(tmpdir(), 'igc-')), 'worker.js');
  writeFileSync(tmp, src.replace(/from '(\.\.?\/)/g, (m, r) => "from '" + pathToFileURL(join(dir, r)).href));
  M = (await import(pathToFileURL(tmp).href)).default;
}
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
globalThis.fetch = async () => new Response('CONTENU', { status: 200, headers: { 'content-type': 'text/html' } });
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const post = (path, body, headers) => M.fetch(new Request('https://kd-mc.com' + path, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://kd-mc.com' }, headers || {}), body: JSON.stringify(body) }), env, { waitUntil() {} });
const issue = async (body, headers) => { const r = await post('/__sso/issue', body, headers); return { st: r.status, j: await r.json() }; };
const whoami = async (token) => (await M.fetch(new Request('https://kd-mc.com/__sso/whoami', { headers: { authorization: 'Bearer ' + token } }), env, { waitUntil() {} })).json();

console.log('\n/__sso/issue ne rétrograde pas une session au code prouvé\n');
const a = await issue({ uid: 'lea-martin', name: 'Léa Martin', cgu: true, code: '314159', telephone: '+377 06 12 34 56' });
ok(a.j.ok === true && a.j.code === true, '1. Léa crée son compte avec son code → session au code prouvé', JSON.stringify(a.j));
const tokLea = a.j.token;
const b = await issue({ uid: 'lea-martin', name: 'Léa Martin', cgu: true }, { cookie: 'kdmc_sso=' + tokLea });
const wb = b.j && b.j.token ? await whoami(b.j.token) : {};
ok(b.j.ok === true && b.j.code === true && wb.code === true, '2. une app la re-déclare SANS code avec sa session → le nouveau pass GARDE le code prouvé', JSON.stringify({ code: b.j.code, who: wb.code }));
const c = await issue({ uid: 'lea-martin', name: 'Léa Martin', cgu: true });
ok(c.st === 401 && c.j.reason === 'code_requis', '3. la même requête SANS session ne donne rien (code_requis)', c.st + ' ' + c.j.reason);
const p = await issue({ uid: 'paul-durand', name: 'Paul Durand', cgu: true, code: '271828', telephone: '+377 06 12 34 56' });
const d = await issue({ uid: 'lea-martin', name: 'Léa Martin', cgu: true }, { cookie: 'kdmc_sso=' + p.j.token });
ok(d.st === 401 && d.j.reason === 'code_requis', '4. la session de Paul ne donne PAS le code de Léa', d.st + ' ' + d.j.reason);
const accL = JSON.parse(kv.get('acc:lea-martin')); accL.revoked_at = Date.now() + 5000; kv.set('acc:lea-martin', JSON.stringify(accL)); ficheOubliee(env, 'lea-martin');
const e = await issue({ uid: 'lea-martin', name: 'Léa Martin', cgu: true }, { cookie: 'kdmc_sso=' + tokLea });
ok(!(e.j && e.j.ok === true && e.j.code === true), '5. un compte révoqué ne garde rien', JSON.stringify({ st: e.st, ok: e.j.ok, code: e.j.code }));
ok(b.j.admin === false && wb.verified !== true && wb.admin !== true, '6. aucune élévation : jamais admin ni verified', JSON.stringify({ admin: b.j.admin, v: wb.verified }));
console.log(`\nissue-garde-code : ${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
