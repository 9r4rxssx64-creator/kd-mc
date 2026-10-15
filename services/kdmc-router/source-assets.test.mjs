/* GARDE — les pages viennent de la COPIE EMBARQUÉE du routeur (SOURCE_PAGES = "assets"), plus de l'hébergeur public (15.10, audit
   extérieur, P0 : kdmc-site-bj5.pages.dev servait tout le site sans compte, en contournant les portes).
   node services/kdmc-router/source-assets.test.mjs   ·   SABOTAGE=1 : le routeur ignore SOURCE_PAGES → rouge
   Prouve, avec le VRAI routeur et une copie embarquée simulée (rangement /CMCteams/…, html_handling = "none") :
     1. aucune requête réseau vers un hébergeur : tout vient de env.ASSETS ;
     2. « / » et « …/dossier/ » servent l'index.html du dossier ; un fichier exact est servi tel quel ;
     3. « …/dossier » (sans « / ») répond 301 vers la belle adresse avec « / » ; une redirection ne sort jamais du domaine ;
     4. une page absente répond 404 avec la page « introuvable » en français (jamais un écran blanc), un fichier absent 404 ;
     5. un POST vers une page statique n'atteint jamais la copie (405) ;
     6. sans SOURCE_PAGES, le routeur revient à l'hébergeur (retour arrière) ;
     7. wrangler.toml pose SOURCE_PAGES = "assets" et html_handling = "none", et le déploiement fabrique la copie COMPLÈTE. */
import { readFileSync } from 'node:fs';
import mod, { viaAssets } from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 200) : ''}`); };

const FICHIERS = {
  '/CMCteams/shops/kit-ia/index.html': ['<!doctype html><title>Kit IA</title><h1>Kit accueil</h1>', 'text/html; charset=utf-8'],
  '/CMCteams/shops/kit-ia/bureau.html': ['<!doctype html><title>Bureau</title><h1>Bureau 37</h1>', 'text/html; charset=utf-8'],
  '/CMCteams/shops/kit-ia/pour/index.html': ['<!doctype html><title>Pour</title><h1>Métiers</h1>', 'text/html; charset=utf-8'],
  '/CMCteams/shops/kit-ia/logo.svg': ['<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'],
};
const vus = [];
const ASSETS = { fetch: async (req) => {
  const u = new URL(req.url); vus.push(req.method + ' ' + u.pathname);
  const f = FICHIERS[u.pathname];
  if (!f) return new Response(null, { status: 404 });
  return new Response(req.method === 'HEAD' ? null : f[0], { status: 200, headers: { 'content-type': f[1], etag: '"x"' } });
} };
let reseau = [];
globalThis.fetch = async (req) => { reseau.push(typeof req === 'string' ? req : req.url); return new Response('<html>HEBERGEUR</html>', { status: 200, headers: { 'content-type': 'text/html' } }); };

const env = { ASSETS, SOURCE_PAGES: process.env.SABOTAGE ? '' : 'assets', UPSTREAM_BASE: 'https://kdmc-site-bj5.pages.dev', UPSTREAM_PREFIX: '' };
const page = (url, o = {}) => mod.fetch(new Request(url, Object.assign({ headers: { accept: 'text/html', 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' } }, o)), env, { waitUntil() {} });

ok(viaAssets(env), '0. SOURCE_PAGES = "assets" + binding ASSETS → mode copie embarquée');

let r = await page('https://kit.kd-mc.com/');
let t = await r.text();
ok(r.status === 200 && /Kit accueil/.test(t), '2. « / » sert l\'index.html du dossier de l\'app', { st: r.status, t: t.slice(0, 80) });
r = await page('https://kit.kd-mc.com/bureau.html'); t = await r.text();
ok(r.status === 200 && /Bureau 37/.test(t), '2b. un fichier exact est servi tel quel', { st: r.status });
r = await page('https://kit.kd-mc.com/pour/'); t = await r.text();
ok(r.status === 200 && /Métiers/.test(t), '2c. « …/dossier/ » sert son index.html', { st: r.status });
r = await page('https://kit.kd-mc.com/logo.svg', { headers: { accept: 'image/*' } });
ok(r.status === 200 && /svg/.test(r.headers.get('content-type') || ''), '2d. une image est servie avec son type', { st: r.status, ct: r.headers.get('content-type') });

r = await page('https://kit.kd-mc.com/pour');
ok(r.status === 301 && r.headers.get('location') === 'https://kit.kd-mc.com/pour/', '3. « …/dossier » → 301 vers « …/dossier/ » sur le domaine', { st: r.status, loc: r.headers.get('location') });

r = await page('https://kit.kd-mc.com/nexiste-pas.html'); t = await r.text();
ok(r.status === 404 && /n’existe pas/.test(t) && /kd-mc\.com/.test(t), '4. page absente → 404 + page « introuvable » en français avec un lien vers l\'espace', { st: r.status, t: t.slice(0, 60) });
r = await page('https://kit.kd-mc.com/absent.png', { headers: { accept: 'image/*' } });
ok(r.status === 404, '4b. fichier absent → 404', { st: r.status });

r = await page('https://kit.kd-mc.com/bureau.html', { method: 'POST' });
ok(r.status !== 200 && !vus.some((v) => v.startsWith('POST')), '5. un POST vers une page statique n\'atteint jamais la copie', { st: r.status, vus: vus.filter((v) => v.startsWith('POST')) });

ok(reseau.length === 0, '1. aucune requête réseau vers un hébergeur (tout vient de la copie embarquée)', reseau);

{ const env2 = { ASSETS, UPSTREAM_BASE: 'https://kdmc-site-bj5.pages.dev', UPSTREAM_PREFIX: '' }; reseau = [];
  const r6 = await mod.fetch(new Request('https://kit.kd-mc.com/bureau.html', { headers: { accept: 'text/html' } }), env2, { waitUntil() {} });
  ok(!viaAssets(env2) && reseau.some((u) => u.startsWith('https://kdmc-site-bj5.pages.dev/')) && r6.status === 200, '6. sans SOURCE_PAGES : retour à l\'hébergeur (retour arrière possible)', reseau); }

const wr = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
const wf = readFileSync(new URL('../../.github/workflows/deploy-kdmc-router.yml', import.meta.url), 'utf8');
ok(/^SOURCE_PAGES = "assets"/m.test(wr) && /^html_handling = "none"/m.test(wr), '7. wrangler.toml : SOURCE_PAGES = "assets" et html_handling = "none"');
ok(/SOURCE_PAGES \*= \*"assets"' wrangler.toml; then node prepare-secours\.mjs; else/.test(wf), '7b. le déploiement fabrique la copie COMPLÈTE (photos comprises) en mode assets');

console.log(`\n${fail ? '❌' : '✅'} source-assets : ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
