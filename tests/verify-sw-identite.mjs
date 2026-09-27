#!/usr/bin/env node
/* verify-sw-identite — AUCUN service worker du domaine ne met en cache une réponse « /__… ».
 *
 * Trouvé par l'audit de Bee (27.09.2026), mesuré sur les 25 service workers du dépôt :
 * 22 interceptaient `/__sso/whoami` (« qui es-tu ? ») et rangeaient la réponse dans leur
 * cache. 10 la RESSERVAIENT MÊME EN LIGNE (cache d'abord : boutiques, Créa Studio, Social,
 * ClayScore, iRemote…) : l'app voyait l'identité d'une visite précédente — déconnecté, on
 * restait reconnu ; connecté, on restait inconnu. Les 12 autres la resservaient hors ligne
 * (Bee s'ouvrait « admin » sans preuve fraîche).
 *
 * Ce test EXÉCUTE chaque sw.js suivi par git (liste déduite, jamais recopiée : un nouveau
 * service worker est couvert d'office) avec un cache qui contient déjà une vieille réponse
 * « admin », puis envoie un GET /__sso/whoami en ligne et hors ligne. Vert = la vieille
 * réponse n'est jamais servie ET rien n'est rangé en cache.
 * messaging-app/sw.js est un module (import) : couvert par sa suite vitest (sw-handlers.test.js).
 */
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const RACINE = new URL('..', import.meta.url).pathname;
const MODULES_COUVERTS_AILLEURS = new Set(['messaging-app/sw.js']);
const URLS = ['https://x.kd-mc.com/__sso/whoami', 'https://x.kd-mc.com/__sso/whoami?t=abc', 'https://x.kd-mc.com/__demande'];
const PERIME = '{"ok":true,"admin":true,"verified":true}';

let ok = 0, ko = 0;
const vrai = (c, m) => { if (c) { ok++; } else { ko++; console.log('  ❌ ' + m); } };

async function sert(src, url, enLigne) {
  const store = new Map([[url, PERIME]]);
  const ranges = [];
  const cle = (r) => (typeof r === 'string' ? r : r.url);
  const cache = {
    addAll: () => Promise.resolve(), add: () => Promise.resolve(),
    put: (r) => { ranges.push(cle(r)); return Promise.resolve(); },
    match: (r) => Promise.resolve(store.has(cle(r)) ? new Response(store.get(cle(r))) : undefined),
    keys: () => Promise.resolve([]), delete: () => Promise.resolve(true),
  };
  const ecoute = {};
  const self = {
    location: new URL('https://x.kd-mc.com/sw.js'),
    addEventListener: (t, f) => { ecoute[t] = f; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]) },
    registration: { scope: 'https://x.kd-mc.com/' },
  };
  const ctx = {
    self, URL, Response, Request, Headers, Promise, setTimeout, clearTimeout,
    caches: { open: () => Promise.resolve(cache), match: cache.match, keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) },
    fetch: () => (enLigne ? Promise.resolve(new Response('{"ok":false}')) : Promise.reject(new TypeError('hors ligne'))),
    console: { log() {}, warn() {}, error() {}, info() {} },
    importScripts() {}, location: self.location, navigator: { onLine: enLigne },
  };
  ctx.globalThis = ctx; ctx.addEventListener = self.addEventListener;
  vm.runInNewContext(src, ctx, { timeout: 2000 });
  if (!ecoute.fetch) return { texte: 'pas-de-fetch', ranges };
  let rep = null;
  ecoute.fetch({ request: new Request(url, { credentials: 'include' }), clientId: 'c', respondWith(x) { rep = Promise.resolve(x); }, waitUntil() {}, preloadResponse: Promise.resolve() });
  if (!rep) return { texte: 'reseau-direct', ranges };
  let texte;
  try {
    const r = await Promise.race([rep, new Promise((res) => setTimeout(() => res('delai'), 1500))]);
    texte = r === 'delai' ? 'delai' : r ? await r.text() : 'vide';
  } catch (_) { texte = 'rejet'; }
  await new Promise((r) => setTimeout(r, 20));
  return { texte, ranges };
}

const fichiers = execFileSync('git', ['ls-files', '*sw.js'], { cwd: RACINE, encoding: 'utf8' })
  .split('\n').filter((f) => f && /(^|\/)sw\.js$/.test(f) && !/(^|\/)(node_modules|dist)\//.test(f));

let examines = 0;
for (const f of fichiers) {
  if (MODULES_COUVERTS_AILLEURS.has(f)) continue;
  const src = fs.readFileSync(RACINE + f, 'utf8');
  examines++;
  for (const url of URLS) {
    for (const enLigne of [true, false]) {
      let r;
      try { r = await sert(src, url, enLigne); } catch (e) { vrai(false, `${f} : le service worker plante (${e.message})`); continue; }
      const chemin = new URL(url).pathname + new URL(url).search;
      vrai(!r.texte.includes('"admin":true'), `${f} ${enLigne ? 'en ligne' : 'hors ligne'} ${chemin} : resservit la VIEILLE identité (${r.texte.slice(0, 40)})`);
      vrai(!r.ranges.length, `${f} ${enLigne ? 'en ligne' : 'hors ligne'} ${chemin} : range la réponse du domaine en cache`);
    }
  }
}
const seuil = 20;
vrai(examines >= seuil, `seulement ${examines} service workers examinés (< ${seuil}) : la liste git n'a rien trouvé ?`);
for (const m of MODULES_COUVERTS_AILLEURS) {
  const t = fs.readFileSync(RACINE + 'messaging-app/tests/unit/sw-handlers.test.js', 'utf8');
  vrai(t.includes('/__sso/whoami'), `${m} : son test vitest ne couvre plus /__sso/whoami`);
}
console.log(`\n=== Service workers et identité : ${examines} fichiers, ${ok} contrôles OK, ${ko} échec(s) ===`);
process.exit(ko ? 1 : 0);
