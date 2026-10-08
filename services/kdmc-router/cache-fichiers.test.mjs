/* GARDE — le navigateur garde les fichiers, les pages restent fraîches (Kevin 8.10 : « tout gratuit, mais que tout
   fonctionne comme avant, performance optimale pour tout le monde »).  node cache-fichiers.test.mjs

   Mesuré le 8.10.2026 sur lingua.kd-mc.com/app.js (connecté) : `cache-control: public, max-age=0, must-revalidate`
   → chaque ouverture redemande chaque fichier au Worker (plafond gratuit 100 000 requêtes/jour, la coupure du 27.09).
   Ici on prouve : 1) un script sans version → 5 min, etag gardé ; 2) une image → 1 jour ; 3) un fichier versionné
   → 1 an immuable ; 4) une page HTML garde sa revalidation ; 5) sw.js / manifest jamais gardés ; 6) l'hébergeur
   qui a décidé (no-store, max-age=3600) est respecté ; 7) 404 / POST : rien ; 8) SABOTAGE : `public` à la place de
   `private` laisserait un cache partagé servir un fichier derrière la porte à quelqu'un sans compte. */
import mod, { politiqueCache } from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (d ? '  → ' + d : ''))); };
const PC = (chemin, { m = 'GET', st = 200, s = '', ct = 'application/javascript', amont = 'public, max-age=0, must-revalidate' } = {}) => politiqueCache(m, st, chemin, s, ct, amont);

console.log('\n== politiqueCache (pure) ==');
ok(PC('/app.js') === 'private, max-age=300', '1. script sans version → private, 5 minutes', PC('/app.js'));
ok(PC('/style.css', { ct: 'text/css' }) === 'private, max-age=300' && PC('/data/lecons.json', { ct: 'application/json' }) === 'private, max-age=300', '1b. style et JSON → 5 minutes');
ok(PC('/img/bee.png', { ct: 'image/png' }) === 'private, max-age=86400' && PC('/fonts/a.woff2', { ct: 'font/woff2' }) === 'private, max-age=86400' && PC('/3d/bee.usdz', { ct: 'model/vnd.usdz+zip' }) === 'private, max-age=86400', '2. image / police / 3D → 1 jour');
ok(PC('/app.js', { s: '?v=1.14' }) === 'private, max-age=31536000, immutable' && PC('/assets/index-3f9a2c1d.js') === 'private, max-age=31536000, immutable', '3. versionné (?v= ou nom haché) → 1 an immuable');
ok(PC('/', { ct: 'text/html; charset=utf-8' }) === null && PC('/index.html', { ct: 'text/html' }) === null, '4. page HTML → inchangée (revalidée à chaque fois)');
ok(PC('/sw.js') === null && PC('/javis/service-worker.js') === null && PC('/manifest.json', { ct: 'application/json' }) === null && PC('/app.webmanifest', { ct: 'application/manifest+json' }) === null, '5. service worker / manifest → jamais gardés');
ok(PC('/app.js', { amont: 'no-store' }) === null && PC('/app.js', { amont: 'public, max-age=3600' }) === null && PC('/app.js', { amont: 'private, no-cache' }) === null, '6. l\'hébergeur a décidé (no-store, 1 h, no-cache) → respecté');
ok(PC('/app.js', { amont: '' }) === 'private, max-age=300', '6b. sans en-tête amont → 5 minutes (le navigateur devinait, maintenant on dit)');
ok(PC('/app.js', { st: 404 }) === null && PC('/app.js', { m: 'POST' }) === null && PC('/app.js', { ct: '' }) === null, '7. 404 / POST / sans type → rien');
ok(PC('/app.js', { m: 'HEAD' }) === 'private, max-age=300', '7b. HEAD reçoit la même politique que GET');

console.log('\n== dans le routeur (lingua.kd-mc.com, amont simulé) ==');
const ETAG = '"c142f9905a528f65876bfc699ffeadb4"';
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  if (/\.js$/.test(u.pathname)) return new Response('console.log(1)', { status: 200, headers: { 'content-type': 'application/javascript', 'cache-control': 'public, max-age=0, must-revalidate', etag: ETAG } });
  if (/\.png$/.test(u.pathname)) return new Response('PNG', { status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=0, must-revalidate', etag: ETAG } });
  return new Response('<!doctype html><title>Lingua</title>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' } });
};
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', /* ce test prouve le cache, pas la porte (compte-obligatoire.test.mjs) */ BEE_PARTOUT: '0' };
const get = (u) => mod.fetch(new Request(u, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)', accept: '*/*' } }), env);
const js = await get('https://lingua.kd-mc.com/app.js');
ok(js.status === 200 && js.headers.get('cache-control') === 'private, max-age=300' && js.headers.get('etag') === ETAG, 'R1. app.js → private 5 min, etag de l\'hébergeur gardé (304 possible après)', js.status + ' ' + js.headers.get('cache-control'));
const png = await get('https://lingua.kd-mc.com/img/bee.png');
ok(png.headers.get('cache-control') === 'private, max-age=86400', 'R2. image → 1 jour', png.headers.get('cache-control'));
const v = await get('https://lingua.kd-mc.com/app.js?v=2026-10-08');
ok(v.headers.get('cache-control') === 'private, max-age=31536000, immutable', 'R3. app.js?v=… → 1 an immuable', v.headers.get('cache-control'));
const html = await mod.fetch(new Request('https://lingua.kd-mc.com/', { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)', accept: 'text/html' } }), env);
ok(html.status === 200 && /text\/html/.test(html.headers.get('content-type') || '') && html.headers.get('cache-control') === 'public, max-age=0, must-revalidate', 'R4. la page HTML garde sa revalidation (une page neuve est vue tout de suite)', html.status + ' ' + html.headers.get('cache-control'));
ok(js.headers.get('strict-transport-security') && js.headers.get('x-content-type-options') === 'nosniff', 'R5. le durcissement (HSTS, nosniff) reste posé sur les fichiers gardés');

console.log('\n== sabotage ==');
const tous = [PC('/app.js'), PC('/img/a.png', { ct: 'image/png' }), PC('/app.js', { s: '?v=1' })];
ok(tous.every((x) => /^private,/.test(x)) && !tous.some((x) => /public/.test(x)), 'S1. jamais `public` : un cache partagé ne doit pas servir un fichier derrière la porte à quelqu\'un sans compte', tous.join(' | '));
ok(PC('/index.html', { ct: 'text/html' }) === null, 'S2. une politique qui gardait aussi les pages HTML cacherait une mise à jour pendant 5 min — refusé');

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
