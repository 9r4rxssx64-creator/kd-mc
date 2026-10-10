/* GARDE — un test qui SIMULE le domaine bloque les service workers (10.10.2026, leçon #490).
 * Vécu : verify-bee-connexion-iphone interceptait kd-mc.com avec ctx.route, mais laissait la page installer son service
 * worker. Les requêtes d'un service worker ne passent PAS par ctx.route : sur la machine GitHub (réseau ouvert) le VRAI
 * sw.js de javis.kd-mc.com s'installait et servait les pages du vrai domaine (« Connexion au domaine requise. ») ; ici le
 * relais bloquait ce téléchargement → vert ici, rouge là-bas, pendant des jours, sans cause visible.
 * Règle : tout fichier de test qui intercepte kd-mc.com ET ouvre un navigateur passe `serviceWorkers: 'block'` à chaque
 * newContext — sauf la liste FIGÉE ci-dessous (au 10.10.2026), qui ne doit que RÉTRÉCIR (certains testent le SW exprès).
 * node tests/verify-tests-isoles-sw.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIGES_10_10 = new Set(['compare-app-vs-light-departs.mjs', 'compare-app-vs-light-teams.mjs', 'verif-live-rapport.mjs', 'verify-3d.mjs',
  'verify-app-as-kevin.mjs', 'verify-boite-personnes.mjs', 'verify-boite-temps-reel.mjs', 'verify-couleurs-parite.mjs', 'verify-departs-groupes.mjs',
  'verify-donnees-rh-app.mjs', 'verify-lingua-appel-push.mjs', 'verify-maj-forcee-reelle.mjs', 'verify-rotaplan-demande.mjs', 'verify-visiteur-ne-vide-pas.mjs']);
let ko = 0; const fautifs = [];
for (const f of readdirSync(path.join(ROOT, 'tests')).filter((x) => /\.(m?js)$/.test(x))) {
  const s = readFileSync(path.join(ROOT, 'tests', f), 'utf8');
  if (!/kd-mc\\\.com/.test(s) || !/\.route\(/.test(s)) continue;
  const n = (s.match(/newContext\(/g) || []).length; if (!n) continue;
  const b = (s.match(/serviceWorkers:\s*['"]block['"]/g) || []).length;
  if (b < n && !FIGES_10_10.has(f)) fautifs.push(`${f} (${b}/${n} contextes isolés)`);
}
if (fautifs.length) { ko++; console.log('❌ tests qui simulent kd-mc.com sans bloquer les service workers :\n   ' + fautifs.join('\n   ') + "\n   → ajouter serviceWorkers: 'block' à chaque newContext"); }
const bee = readFileSync(path.join(ROOT, 'tests/verify-bee-connexion-iphone.mjs'), 'utf8');
if ((bee.match(/serviceWorkers:\s*'block'/g) || []).length < 2) { ko++; console.log('❌ verify-bee-connexion-iphone : ses 2 contextes doivent bloquer les service workers'); }
console.log(ko ? `❌ tests-isoles-sw : ${ko} problème(s)` : `✅ tests-isoles-sw : chaque test qui simule le domaine est isolé du vrai (liste figée : ${FIGES_10_10.size})`);
process.exit(ko ? 1 : 0);
