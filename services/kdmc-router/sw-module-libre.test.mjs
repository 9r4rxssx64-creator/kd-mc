/* GARDE — « Apex Chat n'a aucun service worker sur mon iPhone » (Kevin 20.10.2026 : diagnostic « SW actif : Non », caches vides, push en erreur)
   node services/kdmc-router/sw-module-libre.test.mjs
   Cause MESURÉE en réel : le service worker d'Apex Chat est un module qui importe `lib/sw-handlers.js` ; ce fichier répondait 401 « Connexion au domaine requise »
   (le navigateur ne joint pas la session à l'import d'un worker) → le SW ne démarrait jamais. Avec le VRAI routeur, SANS session :
     1. `sw.js` et `lib/sw-handlers.js` sont servis (200) sur Apex Chat ;
     2. les autres scripts de l'app (`crypto.js`, `lib/visio-mesh.js`) restent fermés (401) : on n'ouvre que ce que le worker importe ;
     3. une page de l'app montre toujours la porte (rien d'ouvert par erreur). */
import mod from './worker.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS: { get: async () => null, put: async () => {}, delete: async () => {} } };
globalThis.fetch = async (input) => { const u = typeof input === 'string' ? input : input.url; return new Response('CONTENU ' + new URL(u).pathname, { status: 200, headers: { 'content-type': 'application/javascript' } }); };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.7 Mobile/15E148 Safari/604.1';
const demande = async (chemin, dest) => { const r = await mod.fetch(new Request('https://apex-chat.kd-mc.com' + chemin, { headers: { 'user-agent': UA, ...(dest ? { 'sec-fetch-dest': dest } : {}) } }), env, { waitUntil() {} }); return { st: r.status, t: await r.text() }; };
const sw = await demande('/sw.js', 'serviceworker');
const handlers = await demande('/lib/sw-handlers.js', 'serviceworker');
const crypto = await demande('/crypto.js', 'script');
const visio = await demande('/lib/visio-mesh.js', 'script');
const page = await demande('/', 'document');
ok(sw.st === 200 && /CONTENU/.test(sw.t), '1a. sw.js servi sans session');
ok(handlers.st === 200 && /CONTENU .*\/lib\/sw-handlers\.js/.test(handlers.t), '1b. lib/sw-handlers.js (importé par le worker) servi sans session');
ok(crypto.st === 401 && visio.st === 401, '2. crypto.js et lib/visio-mesh.js restent fermés sans session (401)');
ok(page.st === 200 && !/CONTENU/.test(page.t), '3. la page de l\'app montre la porte, pas le contenu');
console.log('SABOTAGE');
const src = (await import('node:fs')).readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(/lib\\\/sw-handlers\\\.js\|robots/.test(src), 'S1. la règle « lib/sw-handlers.js » est bien dans libreSansFiche');
ok(!/lib\\\/sw-handlers\\\.js\|robots/.test(src.replace('lib\\/sw-handlers\\.js|', '')), 'S2. sans la règle → la garde la détecterait');
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
