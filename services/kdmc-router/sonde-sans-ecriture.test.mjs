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
/* KDMC_PORTE_TOTALE=0 : ce test mesure les ÉCRITURES du compteur anonyme (mode retour arrière) ; la porte totale par défaut est prouvée par compte-obligatoire.test.mjs */
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', ACCOUNTS };
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
/* MESURÉ le 3.10 (mesure-kv 37111933086 + inventaire 37111987256) : les cinq sondes à `fetch` ci-dessous n'étaient PAS dans
   cette liste et n'avaient pas l'en-tête ; « kdmc-sonde/1 » n'est pas un mot de la liste des robots ; chaque publication du site
   (9 dans l'heure après minuit, depuis des adresses IP neuves) comptait ~31 visiteurs → 632 + 570 écritures à 00h-01h UTC,
   plafond gratuit vidé. Une sonde qui ouvre une page du domaine se déclare, SANS exception — c'est cette liste qui le prouve. */
const SCRIPTS = ['tools/smoke/audit-live.mjs', 'tools/smoke/audit-lingua.mjs', 'tests/verif-live-rapport.mjs', 'tools/audit/sonde-domaine.mjs', 'tests/verify-rien-de-public.mjs', 'tools/audit/mesure-worker.mjs',
  'tools/audit/sonde-site-publie.mjs', 'tools/audit/sonde-ce-qui-est-servi.mjs', 'tools/audit/sonde-fuite-hebergeur.mjs', 'tools/audit/sonde-maj-auto.mjs', 'tools/audit/sonde-ressources-app.mjs'];
/* Et le routeur ne compte pas un robot qui arrive d'un centre de données (GitHub Actions = Azure, réseau 8075), même sans
   en-tête et avec l'User-Agent d'un vrai Chrome (robots de régression en navigateur) : c'est ce qui protège des robots FUTURS. */
{
  ecritures = 0; enAttente.length = 0;
  const req = new Request('https://lingua.kd-mc.com/', { headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'cf-connecting-ip': '20.1.2.3', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' } });
  Object.defineProperty(req, 'cf', { value: { asn: 8075 } });
  const r = await mod.fetch(req, env, ctx); await Promise.all(enAttente);
  ok(r.status === 200 && ecritures === 0, `un navigateur lancé depuis Azure (GitHub Actions, réseau 8075) reçoit la page mais n'écrit RIEN (${ecritures})`);
  ecritures = 0; enAttente.length = 0;
  const req2 = new Request('https://lingua.kd-mc.com/', { headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'cf-connecting-ip': '20.1.2.4', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' } });
  Object.defineProperty(req2, 'cf', { value: { asn: 3215 } });   // Orange : un vrai réseau d'accès
  await mod.fetch(req2, env, ctx); await Promise.all(enAttente);
  ok(ecritures >= 1, `un iPhone sur un vrai réseau d'accès (Orange, 3215) est compté (${ecritures} écriture(s)) — le filtre ne vide pas le compteur`);
}
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
    /* Depuis la porte générale (8.10, marquer-sonde.mjs) : la page ET ses fichiers de MÊME origine — jamais les appels croisés. */
    ok(/resourceType\(\) !== 'document'/.test(src) || (/marquerSonde/.test(src) && /aMarquer/.test(readFileSync(join(RACINE, 'tools/smoke/marquer-sonde.mjs'), 'utf8'))), `${f} ne le pose que sur la page et ses fichiers de même origine (pas d'appel croisé)`);
  }
}

console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
