/* GARDE (Kevin 20.10.2026) : « les manipulations vont au PONT, le Lenovo les fait ». Une règle qui ne vit que dans un message finit sautée :
 * elle doit exister dans le fichier chargé par toute session, dans l'histoire des règles, dans l'index, et dire ce que Kevin garde seul. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const lire = (f) => fs.readFileSync(path.join(R, f), 'utf8');
let ko = 0; const t = (c, m) => { if (!c) ko++; console.log((c ? 'OK ' : 'FAIL ') + m); };
const regle = lire('.claude/rules/pont-lenovo-manipulations.md');
t(/pont/i.test(regle) && /Lenovo/.test(regle) && /pc-config/.test(regle) && /arbre-pc/.test(regle), 'la règle nomme le pont, le Lenovo et les deux sessions PC');
t(/mot de passe/i.test(regle) && /paiement/i.test(regle) && /Jamais de cl/i.test(regle), 'la règle dit ce que Kevin garde seul et interdit les clés dans le pont');
t(/pas toujours allumé/i.test(regle) && /KEVIN_ACTIONS_TODO/.test(regle), 'la règle prévoit le Lenovo éteint (reste au pont + une ligne chez Kevin)');
t(/LES MANIPULATIONS VONT AU PONT/.test(lire('CLAUDE-HISTOIRE.md')), 'la règle est dans CLAUDE-HISTOIRE.md');
t(/LES MANIPULATIONS VONT AU PONT/.test(lire('CLAUDE.md')), 'la règle est dans l\'index CLAUDE.md (claude-md:index relancé)');
t(/pont-lenovo-manipulations/.test(lire('tools/pont/README.md')), 'tools/pont/README.md renvoie à la règle');
console.log(`\n${ko ? '❌' : '✅'} ${ko ? ko + ' échec(s)' : 'règle pont/Lenovo présente partout'}`); process.exit(ko ? 1 : 0);
