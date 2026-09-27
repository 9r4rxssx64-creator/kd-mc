/* ADMIN RECONNU PAR N'IMPORTE QUEL CHEMIN (Kevin 27.09.2026 : « domaine, chaque app, internet, bureau »).
   Mesuré avant : sur un appareil sans Face ID (PC, navigateur neuf), Kevin ne pouvait obtenir qu'une
   session « auto-déclarée » (admin:false) ; l'enrôlement d'un passkey lui répondait « compte admin
   protégé » sans lui offrir de chemin ; le nouveau /__sso/login refuse l'identité admin par principe.
   Maintenant : le code admin prouvé (/__admin/login) émet la session VÉRIFIÉE de l'admin (v=1).
   Prouvé discriminant : sans l'émission de session → 1, 2 échouent ; sans le verrou fermé → 4 échoue ;
   sans `admin_requis` → 5 échoue.
   node services/kdmc-router/admin-partout.test.mjs */
import mod from './worker.js';
import { createHash, createHmac } from 'crypto';
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
globalThis.fetch = async () => new Response('CONTENU', { status: 200, headers: { 'content-type': 'text/html' } });
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const post = (host, path, body, headers, e) => mod.fetch(new Request('https://' + host + path, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://' + host }, headers || {}), body: JSON.stringify(body) }), e || env, { waitUntil() {} });
const whoami = async (host, token) => (await mod.fetch(new Request('https://' + host + '/__sso/whoami', { headers: { authorization: 'Bearer ' + token } }), env, { waitUntil() {} })).json();
const cookies = (r) => r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || ''];

console.log('\nAdmin reconnu par n\'importe quel chemin\n');
{ const r = await post('kd-mc.com', '/__admin/login', { code: '424242' }); const j = await r.json(); const c = cookies(r).join('|');
  ok(j.ok === true && j.token && j.uid === 'kdmc_admin' && j.verified === true && /kdmc_admin=/.test(c) && /kdmc_sso=/.test(c),
    '1. code admin prouvé (PC, navigateur neuf) → grant ET session VÉRIFIÉE de l\'admin (2 cookies + pass)', JSON.stringify(j).slice(0, 100) + ' | ' + c.slice(0, 60));
  const w = await whoami('cmcteams.kd-mc.com', j.token);
  ok(w.ok === true && w.admin === true && w.verified === true && w.uid === 'kdmc_admin', '2. avec ce pass, CMCteams (et toute app) voit Kevin ADMIN, identité vérifiée', JSON.stringify(w));
  const w2 = await whoami('arbre.kd-mc.com', j.token);
  ok(w2.ok === true && w2.admin === true, '2 bis. y compris ses apps personnelles (arbre)'); }
{ const r = await post('kd-mc.com', '/__admin/login', { code: '000000' }); const j = await r.json();
  ok(j.ok === false && !j.token && !cookies(r).join('|').includes('kdmc_sso='), '3. mauvais code → rien : ni grant, ni session'); }
{ const casse = { ...env, ACCOUNTS: { ...ACCOUNTS, get: async (k) => { if (String(k).startsWith('al:')) throw new Error('KV'); return ACCOUNTS.get(k); } } };
  const r = await post('kd-mc.com', '/__admin/login', { code: '424242' }, {}, casse);
  ok(r.status === 429 && !(await r.json()).ok, '4. registre des essais illisible → on REFUSE même le bon code (fermé, plus ouvert)', String(r.status)); }
{ const r = await post('kd-mc.com', '/__sso/issue', { uid: 'kevin-desarzens', name: 'Kevin Desarzens', cgu: true, code: '123456' }); const j = await r.json();
  ok(j.ok === true && j.admin === false && j.admin_requis === true && !kv.has('cred:kdmc_admin') && !kv.has('cred:kevin-desarzens'),
    '5. Kevin qui tape son nom + un code de compte : session faible, AUCUN code enregistré, et le portail est prévenu (admin_requis) → il propose le code admin', JSON.stringify(j).slice(0, 120)); }
{ const deja = signe('kdmc_admin', 1);
  const r = await post('kd-mc.com', '/__admin/login', { code: '424242' }, { authorization: 'Bearer ' + deja }); const j = await r.json();
  ok(j.ok === true && j.token === deja && cookies(r).length === 1, '6. une session vérifiée déjà présente est conservée (pas de second cookie de session)', String(cookies(r).length)); }
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
