/* GARDE — la mesure « requêtes par le Worker » ne peut pas mentir (30.09.2026)
 *
 * Le chantier « fichiers servis sans Worker » (CLAUDE-HISTOIRE, gratuit § 7) se juge sur cette
 * mesure, avant et après. Une mesure qui compterait mal ferait passer un chantier raté pour réussi.
 * Ici : la classification (pure, sans réseau) sur des cas fabriqués, dont les deux extrêmes —
 * « tout par le Worker » (aujourd'hui) et « seul /__ par le Worker » (l'objectif) — plus le robot
 * lui-même (plafond avant Chromium, en-tête sonde sur les seules navigations, destination écrite).
 * node tests/verify-mesure-worker.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classer, ligne, HOTES_DEFAUT } from '../tools/audit/mesure-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0; const t = (c, m) => { c ? ok++ : ko++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const R = (p, hsts, status = 200) => ({ url: 'https://a.kd-mc.com' + p, status, hsts });

/* 1. les deux extrêmes */
const avant = classer('a.kd-mc.com', [R('/', true), R('/x.js', true), R('/i.png', true), R('/__sso/whoami', true)]);
t(avant.total === 4 && avant.worker === 4 && avant.statique === 0 && avant.fichiersParLeWorker === 3, 'AVANT : tout par le Worker → 4/4, 3 fichiers par le Worker');
const apres = classer('a.kd-mc.com', [R('/', false), R('/x.js', false), R('/i.png', false), R('/__sso/whoami', true)]);
t(apres.worker === 1 && apres.statique === 3 && apres.fichiersParLeWorker === 0 && apres.sso === 1, 'APRÈS (objectif) : seul /__ par le Worker → 1/4, 0 fichier par le Worker');
t(/4 requêtes/.test(ligne(avant)) && /100 %/.test(ligne(avant)) && /25 %/.test(ligne(apres)), 'la ligne lisible porte le total et la part Worker (100 % avant, 25 % après)');

/* 2. sabotages */
t(classer('a.kd-mc.com', [R('/', true), { url: 'https://b.kd-mc.com/y.js', status: 200, hsts: true }]).total === 1, 'sabotage : une réponse d\'un AUTRE hôte ne compte pas');
t(classer('a.kd-mc.com', [R('/', true), R('/manque.png', false, 404), R('/casse.js', false, 0)]).erreurs === 2, 'sabotage : 404 et échec réseau comptés en erreur (une page cassée ne passe pas pour « statique »)');
t(/❌/.test(ligne(classer('a.kd-mc.com', []))), 'sabotage : aucune réponse → ligne ❌ (pas un « 0 par le Worker » triomphant)');
t(classer('a.kd-mc.com', [{ url: 'pas une url', status: 200, hsts: true }]).total === 0, 'sabotage : une URL invalide ne fait pas planter la mesure');

/* 3. le script et le robot */
const src = readFileSync(join(ROOT, 'tools/audit/mesure-worker.mjs'), 'utf8');
t(/x-kdmc-sonde/.test(src) && /resourceType\(\) !== 'document'/.test(src) && !/extraHTTPHeaders\s*[:(]/.test(src), 'le script se déclare sonde sur les seules navigations (jamais extraHTTPHeaders)');
t(/strict-transport-security/.test(src), 'le script reconnaît le Worker par HSTS (posé sur TOUTES ses réponses, test:routeur-durci)');
t(HOTES_DEFAUT.includes('javis.kd-mc.com') && HOTES_DEFAUT.includes('cmcteams.kd-mc.com'), 'hôtes par défaut = le pilote (javis) + la plus grosse app (CMCteams)');
const wf = readFileSync(join(ROOT, '.github/workflows/mesure-worker.yml'), 'utf8');
t(/^on:\n  workflow_dispatch:/m.test(wf) && !/schedule:/.test(wf) && !/push:/.test(wf), 'le robot ne part qu\'à la main (jamais programmé, jamais sur push)');
t(wf.indexOf('id: plafond') > 0 && wf.indexOf('id: plafond') < wf.indexOf('playwright install'), 'le plafond est décidé AVANT d\'installer Chromium');
t(/timeout-minutes:\s*10/.test(wf), 'borné à 10 minutes (gratuit par défaut)');
t(/Destination/.test(wf) && /DÉPÔT PUBLIC/.test(wf), 'destination écrite : le dépôt public (minutes illimitées)');

console.log(`\nMesure Worker : ${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
