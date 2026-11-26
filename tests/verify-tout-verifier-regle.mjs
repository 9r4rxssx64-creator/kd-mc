/* GARDE (Kevin 26.11.2026) : « Vérifie toujours tout, ne laisse rien non vérifié, jamais. Aucune branche, personne. Note-le. »
 * La règle vit dans le fichier chargé par toute session (verifier-reel.md) et ne laisse plus « non vérifié » comme point final. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const lire = (f) => fs.readFileSync(path.join(R, f), 'utf8');
let ko = 0; const t = (c, m) => { if (!c) ko++; console.log((c ? 'OK ' : 'FAIL ') + m); };
const regle = lire('.claude/rules/verifier-reel.md');
t(/JAMAIS « non vérifié »/.test(regle) && /toutes les sessions et toutes les branches, sans exception/.test(regle), 'la règle « tout vérifier, jamais non vérifié » est dans verifier-reel.md, pour toutes les branches');
t(/on le \*\*contourne\*\*/.test(regle) && /on mesure/.test(regle), 'elle exige de contourner l\'obstacle et de mesurer');
t(!/écrire « non vérifié en ligne »/.test(regle), 'l\'ancienne permission d\'écrire « non vérifié en ligne » a disparu');
console.log(`\n${ko ? '❌ ' + ko + ' échec(s)' : '✅ règle « tout vérifier » présente'}`); process.exit(ko ? 1 : 0);
