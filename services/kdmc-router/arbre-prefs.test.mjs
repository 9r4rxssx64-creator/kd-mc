/* /__arbre/prefs — les RÉGLAGES de chaque compte (voix, affichage…) suivent la personne d'un appareil à l'autre (Kevin 25.10.2026 :
   « quand un compte fait des réglages, on sauvegarde, et pareil à la prochaine connexion — chaque choix pour chacun »).
     1. sans session → 401 ;  2. Léa enregistre ses réglages, les relit ;  3. Paul ne voit JAMAIS ceux de Léa (chacun les siens) ;
     4. une clé hors liste (le code famille, un secret) est ignorée ;  5. valeur trop longue / pas du texte → ignorée ;  6. compte révoqué → refusé ;  7. origine étrangère → refusée.
   node services/kdmc-router/arbre-prefs.test.mjs   (SABOTAGE=1 : toutes les clés passent → 4 doit rougir) */
import mod from './worker.js';
import { createHmac } from 'crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
let M = mod;
if (process.env.SABOTAGE === '1') {
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(dir, 'worker.js'), 'utf8').replace('if (ARBRE_PREFS_OK.indexOf(k) < 0) continue;', '');
  const tmp = join(mkdtempSync(join(tmpdir(), 'ap-')), 'worker.js');
  writeFileSync(tmp, src.replace(/from '(\.\.?\/)/g, (m, r) => "from '" + pathToFileURL(join(dir, r)).href));
  M = (await import(pathToFileURL(tmp).href)).default;
}
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [] }) };
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS };
globalThis.fetch = async () => new Response('X', { status: 200 });
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 0, k: 1, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const appel = async (token, method, body, headers) => { const r = await M.fetch(new Request('https://arbre.kd-mc.com/__arbre/prefs', { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}, headers || {}), body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} }); let j = null; try { j = await r.json(); } catch { /* */ } return { st: r.status, j }; };
const fiche = (uid, name, plus) => { kv.set('acc:' + uid, JSON.stringify(Object.assign({ uid, name, cgu_at: Date.now(), cgu_v: 99, portee: 'app', acces: ['arbre'], acces_at: Date.now() }, plus || {}))); kv.set('nm:' + name.toLowerCase(), uid); };
fiche('lea-martin', 'Léa Martin'); fiche('paul-durand', 'Paul Durand'); fiche('zoe-lambert', 'Zoé Lambert', { revoked_at: Date.now() + 5000 });
console.log('\n/__arbre/prefs : chaque compte retrouve SES réglages\n');
let r = await appel(null, 'GET');
ok(r.st === 401, '1. sans session : 401', r.st);
r = await appel(signe('lea-martin'), 'PUT', { prefs: { arbre_voix: '{"vit":1.2}', arbre_transp: '0.35', arbre_ctl_pin: '1' } });
ok(r.st === 200 && r.j.ok && r.j.count === 3, '2a. Léa enregistre 3 réglages', JSON.stringify(r.j));
r = await appel(signe('lea-martin'), 'GET');
ok(r.j.ok && r.j.prefs.arbre_voix === '{"vit":1.2}' && r.j.prefs.arbre_transp === '0.35' && r.j.ts > 0, '2b. Léa les retrouve à la connexion suivante (autre appareil)', JSON.stringify(r.j));
r = await appel(signe('paul-durand'), 'GET');
ok(r.j.ok && Object.keys(r.j.prefs).length === 0, '3. Paul ne voit rien de Léa (chacun les siens)', JSON.stringify(r.j));
r = await appel(signe('paul-durand'), 'PUT', { prefs: { arbre_transp: '1', arbre_codehash: 'f'.repeat(64), arbre_v2_text: 'toute la famille', evil: 'x' } });
r = await appel(signe('paul-durand'), 'GET');
ok(r.j.prefs.arbre_transp === '1' && !('arbre_codehash' in r.j.prefs) && !('arbre_v2_text' in r.j.prefs) && !('evil' in r.j.prefs), '4. une clé hors liste (code famille, données, inconnue) est ignorée', JSON.stringify(r.j.prefs));
r = await appel(signe('paul-durand'), 'PUT', { prefs: { arbre_voix: 'x'.repeat(601), arbre_mini: { a: 1 } } });
r = await appel(signe('paul-durand'), 'GET');
ok(!('arbre_voix' in r.j.prefs) || r.j.prefs.arbre_voix.length <= 600, '5. valeur trop longue ou pas du texte : ignorée', JSON.stringify(r.j.prefs).slice(0, 80));
r = await appel(signe('lea-martin'), 'GET');
ok(r.j.prefs.arbre_voix === '{"vit":1.2}', '5b. celles de Léa n\'ont pas bougé', JSON.stringify(r.j.prefs));
r = await appel(signe('zoe-lambert'), 'GET');
ok(r.st === 401 || r.st === 403, '6. compte révoqué : refusé', r.st);
r = await appel(signe('lea-martin'), 'GET', null, { origin: 'https://evil.example' });
ok(r.st === 403, '7. origine étrangère : refusée', r.st);
console.log(`\n${fail ? '❌' : '✅'} ${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
