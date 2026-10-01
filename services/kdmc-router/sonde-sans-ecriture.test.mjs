/* GARDE — une SONDE ne fait écrire AUCUNE clé au stockage du domaine (27.09 soir).
 *
 * Mesuré sur le vrai domaine (run 36346907568) : « KV put() limit exceeded for the day » —
 * 1 000 écritures par jour pour tout le compte, atteintes ; plus aucune app ne pouvait
 * écrire jusqu'à minuit UTC. Chaque robot de vérification arrive d'une adresse IP neuve et
 * ouvre ~39 surfaces : 2 écritures par surface (marqueur de visiteur + compteur). Vingt-
 * quatre vérifications dans la soirée suffisaient à vider le quota. Un contrôle qui casse
 * ce qu'il contrôle est pire que pas de contrôle.
 *
 * Ce test passe par le VRAI routeur, KV simulé qui COMPTE les écritures, et prouve :
 *   · une page vue par un visiteur anonyme ordinaire → des écritures (le compteur marche) ;
 *   · la même page vue avec l'en-tête `x-kdmc-sonde` → ZÉRO écriture ;
 *   · l'en-tête ne change rien au CONTENU servi (la sonde voit ce que voit un visiteur) ;
 *   · chaque script de vérification du dépôt pose bien cet en-tête (sinon la protection
 *     n'existe que sur le papier).
 *
 * node services/kdmc-router/sonde-sans-ecriture.test.mjs
 */
import mod from './worker.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scriptAuCoffre } from '../../tools/depot-public/au-coffre.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let ecritures = 0;
const kv = new Map();
const ACCOUNTS = {
  get: async (k) => (kv.has(k) ? kv.get(k) : null),
  put: async (k, v) => { ecritures++; kv.set(k, v); },
  delete: async (k) => { kv.delete(k); },
};
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS };
/* waitUntil : on ATTEND la promesse, sinon l'écriture partirait après la mesure. */
const enAttente = [];
const ctx = { waitUntil(p) { enAttente.push(p); } };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const u = typeof input === 'string' ? input : input.url;
  if (!/(^|\.)kd-mc\.com$/i.test(new URL(u).hostname)) return new Response('CONTENU ' + new URL(u).pathname, { status: 200, headers: { 'content-type': 'text/html' } });
  return realFetch(input);
};
const visite = async (extra) => {
  ecritures = 0; enAttente.length = 0;
  const r = await mod.fetch(new Request('https://lingua.kd-mc.com/', { headers: Object.assign({ 'sec-fetch-dest': 'document', accept: 'text/html', 'cf-connecting-ip': '203.0.113.' + Math.floor(Math.random() * 250) }, extra || {}) }), env, ctx);
  await Promise.all(enAttente);
  return { st: r.status, t: await r.text(), n: ecritures };
};

/* 1. Un visiteur ordinaire est compté (la mesure n'est pas cassée). */
const ordinaire = await visite();
ok(ordinaire.st === 200 && /^CONTENU/.test(ordinaire.t), 'un visiteur ordinaire reçoit la page');
ok(ordinaire.n >= 1, `un visiteur ordinaire fait écrire le compteur de visites (${ordinaire.n} écriture(s))`);

/* 2. Une sonde ne fait rien écrire — et voit la même page. */
const sonde = await visite({ 'x-kdmc-sonde': 'test' });
ok(sonde.st === 200 && /^CONTENU/.test(sonde.t), 'la sonde reçoit la même page (l\'en-tête ne change pas le contenu)');
ok(sonde.n === 0, `la sonde ne fait écrire AUCUNE clé (${sonde.n})`);

/* 3. Une sonde qui se répète ne fait toujours rien écrire (pas d'effet de bord au 2e passage). */
const encore = await visite({ 'x-kdmc-sonde': 'test' });
ok(encore.n === 0, 'toujours 0 écriture au passage suivant');

/* 4. Chaque script de vérification du dépôt pose l'en-tête. */
const SCRIPTS = ['tools/smoke/audit-live.mjs', 'tools/smoke/audit-lingua.mjs', 'tests/verif-live-rapport.mjs', 'tools/audit/sonde-domaine.mjs', 'tests/verify-rien-de-public.mjs', 'tools/audit/mesure-worker.mjs'];
for (const f of SCRIPTS) {
  /* Dépôt coupé en deux (24.09) : trois de ces sondes restent au coffre par règle (regles.json). Dans la
     copie publique, elles sont ABSENTES mais pas supprimées — le coffre les vérifie. Mesuré le 30.09 à
     23h38 UTC : ce test, lancé au public par le déploiement du routeur, les comptait « absentes » → rouge,
     routeur NON déployé (correctifs de l'audit Bee en attente). Au coffre, `scriptAuCoffre` dit toujours
     non : rien n'y est « ailleurs », une sonde manquante y reste un échec. */
  if (!existsSync(join(RACINE, f)) && scriptAuCoffre(f)) { console.log(`  ℹ️ ${f} : au coffre (copie publique) — vérifié là-bas`); continue; }
  let src = ''; try { src = readFileSync(join(RACINE, f), 'utf8'); } catch { /* absent = échec ci-dessous */ }
  ok(/x-kdmc-sonde/.test(src), `${f} se déclare comme sonde`);
  /* Dans un navigateur, l'en-tête ne doit partir QUE sur les navigations : posé sur toutes les
     requêtes (`extraHTTPHeaders`), il casse les appels cross-origin des pages (contrôle CORS) —
     mesuré le 27.09 nuit : 14 surfaces rouges en une heure, rien de changé pour un visiteur. */
  if (/playwright/.test(src)) {
    ok(!/extraHTTPHeaders[^}]*x-kdmc-sonde/.test(src), `${f} ne pose PAS l'en-tête sur toutes les requêtes (extraHTTPHeaders)`);
    ok(/resourceType\(\) !== 'document'/.test(src), `${f} ne le pose que sur les navigations de page`);
  }
}

console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
