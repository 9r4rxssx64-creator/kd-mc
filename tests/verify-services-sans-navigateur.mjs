/* GARDE — « AUCUN TEST DU DOSSIER D'UN SERVEUR NE DEMANDE UN NAVIGATEUR DE TEST » (15.10.2026).
 *
 * MESURÉ le 15.10 à 11h11 UTC : le déploiement de `kdmc-access` (admin.kd-mc.com) a ÉCHOUÉ, journal du dépôt public :
 * « Cannot find package 'playwright' imported from services/kdmc-access/entree-navigateur.test.mjs ». Le robot de déploiement
 * lance `node --test` DANS le dossier du serveur, sur une machine où rien n'est installé ; en local le même test passait parce
 * que Playwright est dans node_modules à la racine. Résultat : la nouvelle version n'est jamais partie (l'ancienne est restée
 * en ligne) et personne ne l'a vu avant le journal d'échecs.
 * Règle : un test qui a besoin d'un vrai navigateur vit dans `tests/` (la chaîne `test:ci` locale), JAMAIS dans `services/**`.
 *   1. aucun fichier de test sous `services/` n'importe playwright / puppeteer ;
 *   2. sabotage : un faux test fautif est vu.
 * node tests/verify-services-sans-navigateur.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const NAV = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"](?:playwright(?:-core)?|@playwright\/test|puppeteer(?:-core)?)['"]/;
const EST_TEST = /\.(test|spec)\.(m?js|ts)$/;
export function fautifs(racine, lire = (f) => readFileSync(f, 'utf8')) {
  const t = [];
  const marche = (d) => {
    for (const e of readdirSync(d)) {
      const f = join(d, e);
      if (e === 'node_modules') continue;
      if (statSync(f).isDirectory()) marche(f);
      else if (EST_TEST.test(e) && NAV.test(lire(f))) t.push(f);
    }
  };
  marche(racine);
  return t;
}
const trouves = fautifs('services');
ok(trouves.length === 0, '1. aucun test de services/** n\'importe un navigateur de test (le déploiement lance `node --test` sans rien installer)', trouves.join(', '));
const faux = fautifs('services', (f) => (f.endsWith('services/kdmc-access/access.test.mjs') ? "import { chromium } from 'playwright';" : readFileSync(f, 'utf8')));
ok(faux.some((f) => f.endsWith('services/kdmc-access/access.test.mjs')), '2. sabotage : un test de serveur qui importe playwright est vu');
ok(NAV.test("const { chromium } = require('playwright')") && NAV.test('await import("puppeteer")') && !NAV.test("import { x } from './playwright-helper.js'"), '3. le motif couvre import, require et import() — et pas un fichier local du même nom');
console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
