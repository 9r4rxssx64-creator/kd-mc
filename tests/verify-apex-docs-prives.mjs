/* GARDE — Apex AI ne demande pas au relais un document gardé au coffre (22.10.2026, tâche 21).
   Mesuré : le relais lit le dépôt PUBLIC ; les documents de « prive_toujours » (tools/depot-public/regles.json) n'y sont pas
   → 5 × HTTP 404 à chaque ouverture d'Apex AI. Apex les écarte via DOCS_PRIVES (services/integrations/depot-github.ts).
   Cette garde exige : chaque document lu au démarrage par Apex (DOC_FILES de core/memory.ts et de
   services/sentinels/reconsult-kevin-watch.ts, + la mémoire compacte) qui est privé dans regles.json figure dans DOCS_PRIVES.
   node tests/verify-apex-docs-prives.mjs */
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const lire = (f) => readFileSync(f, 'utf8');
const liste = (src, re) => { const m = src.match(re); return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []; };
const regles = JSON.parse(lire('tools/depot-public/regles.json'));
const prives = new Set(regles.prive_toujours.filter((p) => !p.endsWith('/')));
const dossiersPrives = regles.prive_toujours.filter((p) => p.endsWith('/'));
const estPrive = (f) => prives.has(f) || dossiersPrives.some((d) => f.startsWith(d));
const depot = lire('apex-ai/v13/services/integrations/depot-github.ts');
const docsPrives = new Set(liste(depot, /DOCS_PRIVES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/));
const lus = [
  ...liste(lire('apex-ai/v13/core/memory.ts'), /DOC_FILES[^=]*=\s*\[([\s\S]*?)\]/),
  ...liste(lire('apex-ai/v13/services/sentinels/reconsult-kevin-watch.ts'), /DOC_FILES[^=]*=\s*\[([\s\S]*?)\]/),
  ...liste(lire('apex-ai/v13/services/ai/compact-memory.ts'), /CHEMIN_MEMOIRE\s*=\s*(\'[^']+\')/),
];
ok(lus.length >= 10, `les listes de documents d'Apex sont lues (${lus.length})`);
ok(docsPrives.size >= 5, `DOCS_PRIVES est lisible (${docsPrives.size} documents)`);
const oublies = [...new Set(lus.filter((f) => estPrive(f) && !docsPrives.has(f)))];
ok(oublies.length === 0, 'chaque document privé lu par Apex est dans DOCS_PRIVES (sinon 404 au relais à chaque ouverture)' + (oublies.length ? ' — oubliés : ' + oublies.join(', ') : ''));
ok(/if \(adresseRelais\(\) && DOCS_PRIVES\.has\(propre\)\)/.test(depot), 'lireFichierDetaille écarte DOCS_PRIVES avant tout appel réseau');
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
