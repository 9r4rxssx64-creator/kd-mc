#!/usr/bin/env node
/* ============================================================================
 * CHAQUE AUTOMATISATION A UNE DESTINATION ÉCRITE — ET ELLE Y EST VRAIMENT
 * ----------------------------------------------------------------------------
 * Le 15/08/2026, 49 workflows ont été rangés d'un coup pour sauver le compte.
 * Rangés, mais sans dire OÙ ils devaient aller ensuite. Résultat : ils sont
 * restés là six mois, et personne — moi le premier — ne savait plus lesquels
 * étaient légitimes. C'est comme ça qu'on finit par tout remettre au hasard, ou
 * par ne rien remettre du tout.
 *
 * `.github/workflows-desactives/DESTINATIONS.json` répond, pour chacun :
 * il va sur GitHub, sur GitLab, dans un Worker, ou nulle part — et pourquoi.
 * Ce garde vérifie que ce fichier reste VRAI :
 *
 *   1. aucune automatisation rangée sans destination écrite ;
 *   2. aucune entrée qui ne corresponde à aucun fichier ;
 *   3. ce qui est marqué « github » est réellement dans .github/workflows/ ;
 *   4. ce qui n'est PAS marqué « github » n'y est pas ;
 *   5. rien de marqué « github » ne porte d'exécution programmée ;
 *   6. tout ce qui est crypto est marqué « jamais » — c'est nommé mot pour mot
 *      dans les conditions GitHub.
 *
 * Lancer : node tests/verify-destinations-workflows.mjs
 * ========================================================================== */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { workflowAuCoffre } from '../tools/depot-public/au-coffre.mjs';

const ACTIFS = '.github/workflows';
const RANGES = '.github/workflows-desactives';
const REGISTRE = join(RANGES, 'DESTINATIONS.json');

let ko = 0;
const echec = (m) => { console.log(`❌ ${m}`); ko++; };
const ok = (m) => console.log(`✅ ${m}`);

if (!existsSync(REGISTRE)) {
  console.log(`❌ ${REGISTRE} manquant — sans lui, personne ne sait plus où va quoi.`);
  process.exit(1);
}

let reg;
try { reg = JSON.parse(readFileSync(REGISTRE, 'utf8')); }
catch (e) { console.log(`❌ ${REGISTRE} illisible : ${e.message}`); process.exit(1); }

const DESTINATIONS = new Set(['github', 'gitlab', 'worker', 'jamais']);
const yml = (d) => (existsSync(d) ? readdirSync(d).filter((f) => /\.ya?ml$/.test(f)) : []);
const ranges = new Set(yml(RANGES));
const actifs = new Set(yml(ACTIFS));
/* Dépôt coupé en deux (24.09.2026) : au PUBLIC, un workflow resté au coffre n'est ni
   fantôme ni mal placé — il vit dans l'autre moitié (tools/depot-public/au-coffre.json).
   Au coffre, la liste est vide : tout doit être là, rien ne change. */
const entrees = (reg.workflows || []).filter((e) => !workflowAuCoffre(e.f || ''));

/* ── forme du registre ───────────────────────────────────────────────────── */
for (const e of entrees) {
  if (!e.f || !e.vers || !e.raison) echec(`entrée incomplète (il faut f, vers, raison) : ${JSON.stringify(e).slice(0, 90)}`);
  else if (!DESTINATIONS.has(e.vers)) echec(`destination inconnue « ${e.vers} » pour ${e.f} — attendu : ${[...DESTINATIONS].join(' / ')}`);
}
const parNom = new Map(entrees.map((e) => [e.f, e]));
if (parNom.size !== entrees.length) echec('le registre contient deux fois le même fichier');

/* ── 1. rien de rangé sans destination ───────────────────────────────────── */
const sansDestination = [...ranges].filter((f) => !parNom.has(f));
if (sansDestination.length) {
  echec(`${sansDestination.length} automatisation(s) rangée(s) SANS destination écrite : ${sansDestination.join(', ')}`
    + ` — ajoute-les à ${REGISTRE} en disant où elles vont et pourquoi`);
} else ok(`les ${ranges.size} automatisations rangées ont toutes une destination écrite`);

/* ── 2. aucune entrée fantôme ────────────────────────────────────────────── */
const fantomes = entrees.filter((e) => !ranges.has(e.f) && !actifs.has(e.f)).map((e) => e.f);
if (fantomes.length) echec(`${fantomes.length} entrée(s) du registre ne correspondent à aucun fichier : ${fantomes.join(', ')}`);
else ok('aucune entrée du registre ne parle d\'un fichier qui n\'existe pas');

/* ── 3 & 4. la destination correspond à l'endroit réel ───────────────────── */
const malPlaces = [];
for (const e of entrees) {
  const estActif = actifs.has(e.f);
  if (e.vers === 'github' && !estActif) malPlaces.push(`${e.f} est marqué « github » mais n'est pas dans ${ACTIFS}`);
  if (e.vers !== 'github' && estActif) malPlaces.push(`${e.f} est ACTIF sur GitHub alors qu'il est marqué « ${e.vers} » (${e.raison})`);
}
if (malPlaces.length) malPlaces.forEach((m) => echec(m));
else ok('chaque automatisation est là où le registre dit qu\'elle doit être');

/* ── 5. rien de rapatrié ne part tout seul à heure fixe ──────────────────── */
const avecCron = entrees.filter((e) => e.vers === 'github' && actifs.has(e.f)).filter((e) => {
  const s = readFileSync(join(ACTIFS, e.f), 'utf8');
  return s.split('\n').some((l) => /^\s*-\s*cron\s*:/.test(l) && !/^\s*#/.test(l));
}).map((e) => e.f);
if (avecCron.length) {
  echec(`${avecCron.length} automatisation(s) rapatriée(s) portent une exécution programmée : ${avecCron.join(', ')}`
    + ' — c\'est le VOLUME automatique qui a fait suspendre le compte, pas leur contenu');
} else ok('aucune automatisation rapatriée ne part à heure fixe');

/* ── 5-bis. …et chacune peut être lancée à la main ───────────────────────── */
const sansBouton = entrees.filter((e) => e.vers === 'github' && actifs.has(e.f))
  .filter((e) => !/^\s*workflow_dispatch:/m.test(readFileSync(join(ACTIFS, e.f), 'utf8')))
  .map((e) => e.f);
if (sansBouton.length) {
  echec(`${sansBouton.length} automatisation(s) rapatriée(s) sans bouton « Lancer » : ${sansBouton.join(', ')}`
    + ' — sans workflow_dispatch, plus personne ne peut la déclencher (moi compris, via l\'API)');
} else ok('chaque automatisation rapatriée a son bouton « Lancer »');

/* ── 6. le crypto ne revient nulle part ──────────────────────────────────── */
const CRYPTO = /^crypto-bot-|\b(binance|kraken|coinbase|bybit|bitget)\b/i;
const cryptoMalMarque = entrees.filter((e) => CRYPTO.test(e.f) && e.vers !== 'jamais').map((e) => `${e.f} → ${e.vers}`);
if (cryptoMalMarque.length) {
  echec(`crypto avec une destination autre que « jamais » : ${cryptoMalMarque.join(', ')}`
    + ' — « Cryptomining » est nommé mot pour mot dans les conditions GitHub');
} else ok('tout ce qui est crypto est marqué « jamais »');

/* ── Combien sont VRAIMENT portées côté GitLab ? ─────────────────────────
   Décider d'une destination ne suffit pas : tant que le job n'existe pas dans
   .gitlab-ci.yml, l'automatisation ne tourne nulle part. On ne fait PAS échouer
   pour ça (c'est un reste à faire, pas une panne), mais on l'AFFICHE à chaque
   exécution — sinon ce reste à faire disparaît doucement des mémoires. */
const versGitlab = entrees.filter((e) => e.vers === 'gitlab');
const ciGitlab = existsSync('.gitlab-ci.yml') ? readFileSync('.gitlab-ci.yml', 'utf8') : '';
const portees = versGitlab.filter((e) => e.job_gitlab && new RegExp(`^${e.job_gitlab}:`, 'm').test(ciGitlab));
const annoncesAbsents = versGitlab.filter((e) => e.job_gitlab && !new RegExp(`^${e.job_gitlab}:`, 'm').test(ciGitlab));
if (annoncesAbsents.length) {
  echec(`le registre annonce un job GitLab qui n'existe pas dans .gitlab-ci.yml : ${annoncesAbsents.map((e) => `${e.f} → ${e.job_gitlab}`).join(', ')}`
    + ' — se croire couvert sans l\'être est le pire des cas');
} else if (versGitlab.length) {
  ok(`${portees.length}/${versGitlab.length} destination(s) GitLab réellement portées dans .gitlab-ci.yml`
    + (portees.length < versGitlab.length ? ` — reste ${versGitlab.length - portees.length} à porter (la plupart attendent une clé, cf. ETAT-INFRA.md fait n°13)` : ''));
}

/* ── Le tableau, pour qu'on voie d'un coup d'œil ─────────────────────────── */
const par = {};
for (const e of entrees) par[e.vers] = (par[e.vers] || 0) + 1;
console.log('');
console.log(`Répartition : ${Object.entries(par).map(([k, v]) => `${v} ${k}`).join(' · ')}`);

if (ko) {
  console.log(`\n${ko} problème(s). Une automatisation sans destination écrite revient un jour au hasard.`);
  process.exit(1);
}
console.log('Chaque automatisation a sa destination, et elle y est. ✅');
