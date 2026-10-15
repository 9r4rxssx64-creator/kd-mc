#!/usr/bin/env node
/**
 * Garde : la sonde ne prend pas la porte « compte obligatoire » du domaine pour une panne.
 *
 * Mesuré le 15.10.2026 (run kd-mc 38749364709) : 9 apps protégées par compte répondaient 401
 * (« Connexion au domaine requise », en-tête `x-kdmc-porte: fiche`) à la sonde, qui les déclarait
 * EN PANNE à chaque passage. Avec le battement externe (healthchecks.io) branché le même jour,
 * Kevin aurait reçu une alerte toutes les 2 h pour rien — et aurait fini par ne plus les lire.
 *
 * Ce test prouve, sur la vraie fonction `probe` :
 *   1. la sonde demande la page comme un navigateur (`accept: text/html`) ;
 *   2. 401/403 AVEC `x-kdmc-porte` = verrou du domaine qui marche → en bonne santé ;
 *   3. 401 SANS la marque, 500, délai dépassé → toujours une panne (on ne masque rien).
 */
import { probe } from '../services/kdmc-uptime/worker.js';

let ok = 0;
let fail = 0;
const check = (cond, m) => { if (cond) { ok++; console.log('  OK   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const cible = { id: 'osint.kd-mc.com', url: 'https://osint.kd-mc.com/', kind: 'site', adminGated: false };
let vu = null;
const repondre = (status, headers = {}) => {
  globalThis.fetch = async (url, init) => { vu = init; return new Response('x', { status, headers }); };
};

repondre(200);
let r = await probe(cible);
check(r.ok === true, '200 → en bonne santé');
check(/text\/html/.test((vu && vu.headers && vu.headers.accept) || ''), 'la sonde demande la page comme un navigateur (accept: text/html)');

repondre(401, { 'x-kdmc-porte': 'fiche' });
r = await probe(cible);
check(r.ok === true, '401 + x-kdmc-porte: fiche → la porte du domaine marche, pas une panne');

repondre(403, { 'x-kdmc-porte': 'code' });
r = await probe(cible);
check(r.ok === true, '403 + x-kdmc-porte: code → la porte du domaine marche, pas une panne');

repondre(401);
r = await probe(cible);
check(r.ok === false, '401 SANS marque de la porte → panne (l\'app elle-même refuse)');

repondre(500, { 'x-kdmc-porte': 'fiche' });
r = await probe(cible);
check(r.ok === false, '500 → panne, même avec la marque');

globalThis.fetch = async () => { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; };
r = await probe(cible);
check(r.ok === false && r.code === 'timeout', 'délai dépassé → panne');

console.log(`\n${ok} ✅ / ${fail} ❌`);
process.exit(fail ? 1 : 0);
