/* GARDE (Kevin 6.11.2026) : « Creuse toujours pour savoir et corriger si nécessaire. Note le. Va tjs au bout ».
 * La règle vit dans le fichier chargé par toute session, dans l'histoire et dans l'index ; et le robot Servi, qui comptait un défaut
 * sans le nommer, nomme maintenant les boutons recouverts et les compte « à corriger ». */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const lire = (f) => fs.readFileSync(path.join(R, f), 'utf8');
let ko = 0; const t = (c, m) => { if (!c) ko++; console.log((c ? 'OK ' : 'FAIL ') + m); };
const regle = lire('.claude/rules/au-bout.md');
t(/Creuser toujours/.test(regle) && /non creusé/.test(regle) && /qui constate corrige/.test(regle), 'la règle « creuser toujours » est dans au-bout.md');
t(/rouge avant, vert après/.test(regle) && /QUI et QUOI/.test(regle), 'elle exige la preuve et un robot qui nomme ce qu\'il compte');
t(/CREUSER TOUJOURS JUSQU'À LA CAUSE/.test(lire('CLAUDE-HISTOIRE.md')), 'la règle est dans CLAUDE-HISTOIRE.md');
t(/CREUSER TOUJOURS JUSQU'À LA CAUSE/.test(lire('CLAUDE.md')), 'la règle est dans l\'index CLAUDE.md');
const servi = lire('tools/plateformes/verifier-servi.mjs');
t(/r\.cache > 0/.test(servi) && /cacheEx/.test(servi) && /sansTexte/.test(servi), 'Servi nomme les boutons recouverts et les compte « à corriger »');
console.log(`\n${ko ? '❌' : '✅'} ${ko ? ko + ' échec(s)' : 'règle « creuser toujours » présente partout'}`); process.exit(ko ? 1 : 0);
