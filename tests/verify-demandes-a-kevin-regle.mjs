/* GARDE (Kevin 24.10.2026) : « quand tu me demandes un geste : vérifie que ce n'est pas déjà fait, et donne-moi le lien cliquable, un clic ». Une règle qui ne vit que dans une réponse finit sautée :
 * elle doit exister dans le fichier chargé par toute session, dans l'histoire des règles et dans l'index. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const lire = (f) => fs.readFileSync(path.join(R, f), 'utf8');
let ko = 0; const t = (c, m) => { if (!c) ko++; console.log((c ? 'OK ' : 'FAIL ') + m); };
const regle = lire('.claude/rules/demandes-a-kevin.md');
t(/d[ée]j[àa] fait/i.test(regle) && /taches/.test(regle) && /pont/i.test(regle), 'la règle dit de vérifier si c\'est déjà fait (taches, pont, documents)');
t(/lien/i.test(regle) && /DIRECTEMENT/.test(regle) && /1 à 3 touches/.test(regle), 'la règle exige un lien direct et 1 à 3 touches');
t(/photographier un acte/i.test(regle) && /pas une tâche/i.test(regle), 'la règle dit que ce que Kevin fait de lui-même n\'est pas une tâche');
t(/Fait \/ Reste/.test(regle), 'la règle demande de finir par « Fait / Reste »');
t(/QUAND JE DEMANDE UN GESTE/.test(lire('CLAUDE-HISTOIRE.md')), 'la règle est dans CLAUDE-HISTOIRE.md');
t(/QUAND JE DEMANDE UN GESTE/.test(lire('CLAUDE.md')), 'la règle est dans l\'index CLAUDE.md (claude-md:index relancé)');
console.log(`\n${ko ? '❌' : '✅'} ${ko ? ko + ' échec(s)' : 'règle « geste demandé à Kevin » présente partout'}`); process.exit(ko ? 1 : 0);
