/* GARDE (Kevin 22.10.2026) : « teste toujours tout, partout, sur toutes les plateformes ; je veux plus voir non testé ».
 * Statique : la règle est chargée par toute session, l'histoire et l'index la portent, l'outil de matrice existe (avec ses appareils et ses 3 vues),
 * le robot gratuit WebKit/Firefox existe au dépôt public, et les scripts sont câblés. Le comportement réel : `npm run verif:arbre-plateformes`. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const lire = (f) => fs.readFileSync(path.join(R, f), 'utf8');
let ko = 0; const t = (c, m) => { if (!c) ko++; console.log((c ? 'OK ' : 'FAIL ') + m); };
const regle = lire('.claude/rules/tout-tester-partout.md');
t(/non testé/.test(regle) && /Lenovo/.test(regle) && /iPhone/.test(regle) && /Android/.test(regle) && /WebKit/.test(regle) && /verif:arbre-plateformes/.test(regle), 'la règle (chargée par toute session) dit : tout tester, partout, le Lenovo pour le reste, jamais « non testé »');
t(/TOUT TESTER, PARTOUT, TOUT LE TEMPS/.test(lire('CLAUDE-HISTOIRE.md')), 'la règle est dans CLAUDE-HISTOIRE.md');
t(/TOUT TESTER, PARTOUT, TOUT LE TEMPS/.test(lire('CLAUDE.md')), 'la règle est dans l\'index CLAUDE.md (claude-md:index relancé)');
const o = lire('tools/plateformes/verif-plateformes.mjs');
t(/iPhone 14 Pro paysage 844x390/.test(o) && /Pixel 7/.test(o) && /iPad/.test(o) && /Lenovo/.test(o) && /1920x1080/.test(o), 'la matrice couvre iPhone (celui de Kevin), Android, tablette, portable bas, grand écran');
t(/'proche', 'lignee', 'tree'/.test(o) && /chev/.test(o) && /sansAlt/.test(o) && /tPret < 6000/.test(o) && /pageerror/.test(o), 'trois vues, chevauchement, alt, fluidité, erreurs JavaScript');
t(/webkit/.test(o) && /firefox/.test(o) && /absent ici/.test(o), 'WebKit et Firefox prévus, un moteur absent est DIT');
const w = lire('.github/workflows/arbre-plateformes.yml');
t(/workflow_dispatch/.test(w) && !/schedule:/.test(w) && /moteur: \[chromium, webkit, firefox\]/.test(w) && /KDMC_RUNNER/.test(w) && /ENGINES: \$\{\{ matrix\.moteur \}\}/.test(w), 'robot gratuit WebKit + Firefox : à la main, jamais de cron, interrupteur Lenovo');
const pk = lire('package.json');
t(/"verif:arbre-plateformes"/.test(pk) && /npm run test:tout-tester-partout/.test(pk), 'les scripts existent et la garde est dans test:ci');
console.log(`\n${ko ? '❌' : '✅'} ${ko ? ko + ' échec(s)' : 'tout tester partout : règle, matrice, robot gratuit câblés'}`); process.exit(ko ? 1 : 0);
