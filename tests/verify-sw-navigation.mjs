#!/usr/bin/env node
/* verify-sw-navigation — le service worker laisse le NAVIGATEUR envoyer la requête de la page (pré-chargement de navigation).
 *
 * Pont D1, 22.10.2026 (apex-cloud, mesuré au robot) : refaire `fetch(req)` dans le handler de navigation d'un service worker
 * renvoyait la page SANS le cookie du domaine → « Connexion au domaine requise » à chaque réouverture d'une app installée.
 * Le correctif d'Apex Chat et de l'arbre : activation = navigationPreload.enable() ; navigation = preloadResponse, sinon fetch(req).
 * Ce test EXÉCUTE le vrai sw.js de CMCteams (racine) et du portail (kdmc-home) : (1) l'activation active le pré-chargement ;
 * (2) une navigation sert la réponse pré-chargée SANS rappeler fetch ; (3) sans pré-chargement (ou s'il échoue) elle retombe sur fetch.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const RACINE = new URL('..', import.meta.url).pathname;
let ok = 0, ko = 0;
const vrai = (c, m) => { if (c) ok++; else { ko++; console.log('  ❌ ' + m); } };

async function charge(fichier) {
  const src = fs.readFileSync(RACINE + fichier, 'utf8');
  const ecoute = {}; const appels = []; let preloadActive = false;
  const cache = { addAll: () => Promise.resolve(), add: () => Promise.resolve(), put: () => Promise.resolve(), match: () => Promise.resolve(undefined), keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) };
  const self = {
    location: new URL('https://x.kd-mc.com/sw.js'),
    addEventListener: (t, f) => { ecoute[t] = f; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]) },
    registration: { scope: 'https://x.kd-mc.com/', navigationPreload: { enable: () => { preloadActive = true; return Promise.resolve(); } } },
  };
  const ctx = {
    self, URL, Response, Request, Headers, Promise, setTimeout, clearTimeout,
    caches: { open: () => Promise.resolve(cache), match: () => Promise.resolve(undefined), keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) },
    fetch: (r) => { appels.push(r && r.url); return Promise.resolve(new Response('RESEAU')); },
    console: { log() {}, warn() {}, error() {}, info() {} },
    importScripts() {}, location: self.location, navigator: { onLine: true },
  };
  ctx.globalThis = ctx; ctx.addEventListener = self.addEventListener;
  vm.runInNewContext(src, ctx, { timeout: 2000 });
  return { ecoute, appels, preloadActive: () => preloadActive };
}

async function navigue(sw, preload) {
  let rep = null;
  sw.appels.length = 0;
  sw.ecoute.fetch({ request: { method: 'GET', url: 'https://x.kd-mc.com/', mode: 'navigate', headers: new Headers() }, clientId: '', respondWith(x) { rep = Promise.resolve(x); }, waitUntil() {}, preloadResponse: preload });
  if (!rep) return { texte: 'reseau-direct', appels: sw.appels.slice() };
  const r = await rep; return { texte: r ? await r.text() : 'rien', appels: sw.appels.slice() };
}

for (const f of ['sw.js', 'kdmc-home/sw.js']) {
  const sw = await charge(f);
  let fini; sw.ecoute.activate({ waitUntil(p) { fini = p; } }); await fini;
  vrai(sw.preloadActive(), `${f} : l'activation active le pré-chargement de navigation`);
  const a = await navigue(sw, Promise.resolve(new Response('PRECHARGEE')));
  vrai(a.texte === 'PRECHARGEE' && a.appels.length === 0, `${f} : la page pré-chargée par le navigateur est servie, sans refaire fetch (${a.texte}, ${a.appels.length} appel)`);
  const b = await navigue(sw, Promise.resolve(undefined));
  vrai(b.texte === 'RESEAU', `${f} : sans pré-chargement, repli sur fetch (${b.texte})`);
  const c = await navigue(sw, Promise.reject(new Error('refus')));
  vrai(c.texte === 'RESEAU', `${f} : pré-chargement en échec, repli sur fetch (${c.texte})`);
  const d = await navigue(sw, undefined);
  vrai(d.texte === 'RESEAU', `${f} : navigateur sans pré-chargement, repli sur fetch (${d.texte})`);
}
console.log(`\n${ok} ✅ / ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
