/* GARDE-FOU — « du test qui ne tourne pas ne protège de rien, mais donne l'impression
 * du contraire » (audit Apex Chat, finding P2 du 2026-09-10).
 *
 * Trouvé en vrai : `messaging-app/tests/e2e/` contenait 19 scénarios Playwright
 * (chiffrement bout en bout, Face ID, auto-réparation des notifications, galerie…)
 * et AUCUN workflow ne les lançait. Le seul workflow e2e d'Apex Chat travaillait dans
 * `messaging-app/e2e/` — un autre dossier, 3 fichiers. La CI était verte, mon propre
 * rapport d'audit comptait les 19 comme une couverture acquise. Erreur #28
 * (Déclaration ≠ Déploiement) appliquée aux tests — et sous cette forme elle est
 * plus dangereuse : elle rassure.
 *
 * RÈGLE : tout dossier du dépôt qui contient un `*.spec.js` (Playwright) doit être
 * lancé par au moins un workflow GitHub. « Lancé » = un workflow dont une étape
 * exécute `playwright test` (ou `npm run test:e2e…`) depuis un dossier dont la
 * `playwright.config.js` pointe (`testDir`) sur ce dossier. Une simple mention du
 * chemin dans un filtre `paths:` ne compte PAS : filtrer n'est pas exécuter.
 *
 * node tests/specs-lances.test.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, '.github/workflows');
const IGNORE = /(^|\/)(node_modules|vendor|_archive[^/]*|\.git|dist|build)(\/|$)/;

/* 1. Tous les dossiers qui contiennent des specs Playwright. */
function specDirs(dir, out = new Set()) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (IGNORE.test(relative(ROOT, p) + '/')) continue;
    if (e.isDirectory()) specDirs(p, out);
    else if (/\.spec\.js$/.test(e.name)) out.add(relative(ROOT, dir));
  }
  return out;
}

/* 2. Où chaque `playwright.config.js` envoie ses tests (testDir, défaut = son dossier). */
function testDirOf(cwdRel) {
  const cfg = ['playwright.config.js', 'playwright.config.mjs', 'playwright.config.ts']
    .map((n) => join(ROOT, cwdRel, n)).find(existsSync);
  if (!cfg) return null;
  const m = readFileSync(cfg, 'utf8').match(/testDir\s*:\s*['"`]([^'"`]+)['"`]/);
  return relative(ROOT, resolve(dirname(cfg), m ? m[1] : '.'));
}

/* 3. Dossiers réellement lancés : une étape `playwright test` + son working-directory. */
function launchedDirs() {
  const out = new Map(); // dir → [workflow…]
  for (const f of readdirSync(WF).filter((n) => /\.ya?ml$/.test(n))) {
    const txt = readFileSync(join(WF, f), 'utf8');
    if (!/playwright\s+test|npm\s+run\s+test:e2e/.test(txt)) continue;
    const jobDefault = (txt.match(/defaults:\s*\n\s*run:\s*\n\s*working-directory:\s*([^\s#]+)/) || [])[1] || '.';
    for (const step of txt.split(/(?=\n\s*- name:)/)) {
      if (!/playwright\s+test|npm\s+run\s+test:e2e/.test(step)) continue;
      const wd = (step.match(/working-directory:\s*([^\s#]+)/) || [])[1] || jobDefault;
      const td = testDirOf(wd);
      if (!td) continue;
      if (!out.has(td)) out.set(td, []);
      if (!out.get(td).includes(f)) out.get(td).push(f);
    }
  }
  return out;
}

const dirs = [...specDirs(ROOT)].sort();
const launched = launchedDirs();
const fails = [];
console.log(`${dirs.length} dossier(s) de specs Playwright dans le dépôt :\n`);
for (const d of dirs) {
  const n = readdirSync(join(ROOT, d)).filter((n) => /\.spec\.js$/.test(n)).length;
  const by = launched.get(d);
  if (by) console.log(`  ✅ ${d.padEnd(34)} ${String(n).padStart(2)} spec(s) — lancé par ${by.join(', ')}`);
  else { console.log(`  ❌ ${d.padEnd(34)} ${String(n).padStart(2)} spec(s) — lancé par AUCUN workflow`); fails.push(d); }
}

if (fails.length) {
  console.log(`\n❌ ${fails.length} dossier(s) de tests dorment : ils existent, ils rassurent, ils ne protègent de rien.`);
  console.log('   → ajouter une étape `playwright test` (working-directory = dossier de la playwright.config.js\n     dont le testDir pointe dessus) dans un workflow, ou supprimer les specs si elles sont mortes.');
  process.exit(1);
}
console.log('\n✅ chaque spec Playwright du dépôt appartient à un dossier qu\'un workflow exécute vraiment.');
