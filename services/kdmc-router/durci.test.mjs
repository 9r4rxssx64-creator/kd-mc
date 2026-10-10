/* ROUTEUR DURCI — toute réponse porte les en-têtes de sécurité, http redirige vers https.
   Audit du domaine du 27.09.2026 (sonde tools/audit/sonde-domaine.mjs, run 36336678721) :
   les réponses fabriquées par le routeur lui-même (porte fermée 401, admin, autorisations,
   beatbot, /__sso/*) partaient sans HSTS ni anti-iframe ni nosniff (note 0/100 sur 12 adresses),
   et http://kd-mc.com/ répondait 200 en clair.
   Prouvé discriminant : retirer durcirReponse() de la porte d'entrée → les contrôles 1 à 3 échouent ;
   retirer la redirection http → le contrôle 4 échoue.
   node services/kdmc-router/durci.test.mjs */
import mod, { durcirReponse } from './worker.js';
import acces from '../kdmc-access/worker.js';
import { createHash } from 'crypto';

const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', /* ce test prouve AUTRE chose que la porte totale (voir compte-obligatoire.test.mjs) */ KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
globalThis.fetch = async (input) => new Response('CONTENU', { status: 200, headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY' } });

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const appel = (url, init) => mod.fetch(new Request(url, init || {}), env, { waitUntil() {} });
const durci = (r) => /max-age=31536000/.test(r.headers.get('strict-transport-security') || '') && r.headers.get('x-content-type-options') === 'nosniff'
  && !!r.headers.get('x-frame-options') && !!r.headers.get('referrer-policy');

console.log('\nRouteur durci : en-têtes sur TOUTES les réponses + http → https\n');
{ const r = await appel('https://osint.kd-mc.com/index.html', { headers: { accept: '*/*' } });
  ok(r.status === 401 && durci(r), `1. porte fermée (401) d'osint porte HSTS + nosniff + anti-iframe + referrer  [${r.status}]`); }
{ const r = await appel('https://kd-mc.com/__sso/whoami');
  ok(durci(r), `2. réponse du SSO (/__sso/whoami) durcie  [${r.status}]`); }
{ const r = await appel('https://kd-mc.com/__admin/fbtoken', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  ok(r.status === 403 && durci(r), `3. porte admin refusée (403) durcie  [${r.status}]`); }
{ const r = await appel('http://kd-mc.com/cujina/?a=1');
  ok(r.status === 301 && r.headers.get('location') === 'https://kd-mc.com/cujina/?a=1', `4. http://kd-mc.com/… → 301 vers la même adresse en https  [${r.status} ${r.headers.get('location')}]`); }
{ const r = await appel('http://cmcteams.kd-mc.com/');
  ok(r.status === 301 && r.headers.get('location') === 'https://cmcteams.kd-mc.com/', '5. idem pour un sous-domaine'); }
{ const r = await appel('https://rotaplan.kd-mc.com/');
  ok(r.headers.get('x-frame-options') === 'DENY', `6. un en-tête posé par l'hébergeur n'est PAS écrasé (DENY conservé)  [${r.headers.get('x-frame-options')}]`); }
{ const r = await acces.fetch(new Request('https://admin.kd-mc.com/'), {});
  ok(r.headers.get('x-frame-options') === 'DENY' && /max-age=31536000/.test(r.headers.get('strict-transport-security') || '') && r.headers.get('x-content-type-options') === 'nosniff', `7. page admin.kd-mc.com (worker kdmc-access) : jamais encadrable, HSTS, nosniff  [${r.headers.get('x-frame-options')}]`); }
{ const r = await acces.fetch(new Request('http://admin.kd-mc.com/?x=1'), {});
  ok(r.status === 301 && r.headers.get('location') === 'https://admin.kd-mc.com/?x=1', `8. http://admin.kd-mc.com → 301 https  [${r.status}]`); }

/* 9-11 (10.10, Kevin « Coupe ») : chaque page HTML sort avec Cache-Control no-transform → Cloudflare n'y pose plus son compteur
   de visites (FAQ Web Analytics). Le reste du Cache-Control est gardé ; un script ou une image n'est pas touché. */
{ const r = durcirReponse(new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }));
  ok(r.headers.get('cache-control') === 'no-store, no-transform', `9. page HTML : Cache-Control garde « no-store » et reçoit « no-transform »  [${r.headers.get('cache-control')}]`); }
{ const r = durcirReponse(new Response('<html></html>', { status: 401, headers: { 'content-type': 'text/html' } }));
  ok(r.headers.get('cache-control') === 'no-transform', `10. page HTML sans Cache-Control : « no-transform » posé seul (porte 401 comprise)  [${r.headers.get('cache-control')}]`);
  const d = durcirReponse(r); ok(d.headers.get('cache-control') === 'no-transform', '10b. durcir deux fois ne double pas no-transform'); }
{ const r = durcirReponse(new Response('x=1', { status: 200, headers: { 'content-type': 'application/javascript', 'cache-control': 'public, max-age=60' } }));
  ok(r.headers.get('cache-control') === 'public, max-age=60', `11. un script n'est pas touché  [${r.headers.get('cache-control')}]`); }

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
