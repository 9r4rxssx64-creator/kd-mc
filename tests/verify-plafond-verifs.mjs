/* GARDE — 2 vérifications réelles par jour, pas une de plus (Kevin 27.09.2026 : « Plafonne »).
 *
 * Le 27.09, les robots de vérification ont mis le domaine à terre : 1 000 écritures KV atteintes
 * à 20h50, puis le plafond de requêtes Workers gratuit vers 22h00 (48 surfaces sur 48 en HTTP 429
 * pour TOUT LE MONDE jusqu'à minuit UTC). Ce test prouve :
 *   1. la décision (`verdict`) est juste : jour UTC, exclusion de soi-même, exécutions plafonnées
 *      (courtes) non comptées, en cours comptées, annulées ignorées, plafond = 2 ;
 *   2. CHAQUE workflow qui frappe le domaine porte l'étape « plafond » AVANT de frapper, avec
 *      `actions: read`, et ses étapes qui frappent sont conditionnées sur `steps.plafond.outputs.ok` ;
 *   3. la liste VERIFS et les fichiers se répondent (un nom manquant ne serait pas compté) ;
 *   4. l'entrée `forcer` existe (Kevin peut passer outre, personne d'autre).
 *
 * node tests/verify-plafond-verifs.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verdict, VERIFS, PLAFOND, DUREE_REELLE_S } from '../tools/ci/plafond-verifs.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const dit = (c, t) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t); } };

/* ---------- 1. la décision ---------- */
const NOW = Date.parse('2026-09-27T21:00:00Z');
const run = (id, name, minutesAgo, dureeS, status = 'completed', conclusion = 'success') => {
  const debut = new Date(NOW - minutesAgo * 60e3).toISOString();
  return { id, name, created_at: debut, run_started_at: debut, updated_at: new Date(NOW - minutesAgo * 60e3 + dureeS * 1e3).toISOString(), status, conclusion };
};
const V = VERIFS[0], L = VERIFS[1], D = VERIFS[5];

dit(PLAFOND === 2, `le plafond est de 2 (lu : ${PLAFOND})`);
dit(verdict([], { now: NOW }).ok, 'aucune exécution aujourd\'hui → on peut vérifier');
dit(verdict([run(1, V, 120, 600)], { now: NOW }).ok, '1 vérification faite → la 2e passe');
dit(!verdict([run(1, V, 120, 600), run(2, L, 60, 300)], { now: NOW }).ok, '2 vérifications faites → la 3e est PLAFONNÉE');
dit(!verdict([run(1, V, 120, 600), run(2, D, 60, 200)], { now: NOW }).ok, 'toutes familles confondues (Vérif RÉELLE + Audit domaine = 2) → plafonné');
dit(verdict([run(1, V, 120, 600), run(2, L, 60, 300)], { now: NOW, selfId: 2 }).ok, 'l\'exécution courante ne se compte pas elle-même');
dit(verdict([run(1, V, 120, 600), run(2, L, 60, 10)], { now: NOW }).ok, `une exécution courte (< ${DUREE_REELLE_S} s = plafonnée) ne mange pas le budget`);
dit(!verdict([run(1, V, 120, 600), run(2, L, 5, 0, 'in_progress', null)], { now: NOW }).ok, 'une exécution EN COURS compte');
dit(verdict([run(1, V, 120, 600), run(2, L, 60, 300, 'completed', 'cancelled')], { now: NOW }).ok, 'une exécution annulée ne compte pas');
dit(verdict([run(1, V, 120, 600), run(2, 'CMCteams Runtime Audit', 60, 300)], { now: NOW }).ok, 'un robot qui ne frappe pas le domaine ne compte pas');
dit(verdict([run(1, V, 60 * 26, 600), run(2, L, 60 * 25, 600)], { now: NOW }).ok, 'les exécutions d\'HIER (jour UTC) ne comptent plus');

/* ---------- 2 + 3 + 4. les fichiers ---------- */
const FICHIERS = ['verif-reelle', 'audit-lingua', 'verif-live-rapport', 'audit-live', 'voir-comme-kevin', 'audit-domaine', 'mesure-worker'];
const noms = [];
for (const f of FICHIERS) {
  const p = `.github/workflows/${f}.yml`;
  let s = ''; try { s = readFileSync(join(RACINE, p), 'utf8'); } catch { /* absent = échecs ci-dessous */ }
  const nom = (s.match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  noms.push(nom);
  dit(/id:\s*plafond\b/.test(s) && /tools\/ci\/plafond-verifs\.mjs/.test(s), `${f}.yml porte l'étape « plafond » (tools/ci/plafond-verifs.mjs)`);
  const iPlafond = s.indexOf('id: plafond'), iChromium = s.search(/playwright install|npx playwright|Installer Chromium|Install Playwright|Installer un vrai navigateur|Sonde du vrai domaine/);
  dit(iPlafond > 0 && iChromium > iPlafond, `${f}.yml : le plafond est décidé AVANT d'installer un navigateur ou de frapper`);
  dit(/steps\.plafond\.outputs\.ok\s*==\s*'true'/.test(s), `${f}.yml : les étapes qui frappent le domaine sont conditionnées sur le plafond`);
  dit(/actions:\s*read/.test(s), `${f}.yml : \`actions: read\` (sans lui, l'API ne répond pas et le plafond ne sait pas compter)`);
  dit(/forcer:/.test(s) && /FORCER:/.test(s), `${f}.yml : entrée « forcer » (Kevin seul peut passer outre) transmise au script`);
  /* Un run PLAFONNÉ doit rester VERT : aucune étape d'après-coup (« if: always() » nu) ne doit
     chercher un rapport qui n'existe pas — sauf celles qui savent dire « pas de journal ». */
  const TOLERANTES = ['Rapport lisible depuis l\'agent (annotations)', 'Journal complet en artefact (si on peut le télécharger un jour)', 'Combien GitHub nous facture ce mois-ci (mesure réelle)'];
  const apres = s.slice(s.indexOf('id: plafond'));
  const nus = [...apres.matchAll(/- name: ([^\n]+)\n\s+if: always\(\)\s*(#[^\n]*)?\n/g)].map((m) => m[1].trim()).filter((n) => !TOLERANTES.includes(n));
  dit(nus.length === 0, `${f}.yml : aucune étape d'après-coup ne présume d'un rapport quand le run est plafonné${nus.length ? ' — ' + nus.join(' · ') : ''}`);
}
for (const n of noms) dit(VERIFS.includes(n), `« ${n} » est dans la liste VERIFS du script (sinon non compté)`);
dit(VERIFS.length === FICHIERS.length, `la liste VERIFS compte exactement les ${FICHIERS.length} familles`);

console.log(`\n${ok} OK · ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
