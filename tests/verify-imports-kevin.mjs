/* IMPORTS DE KEVIN (règle 8.10.2026 « à chaque import, fais au mieux et améliore pour mon domaine. Toujours ») :
 * chaque ligne du registre a une date, un import, un verdict connu et une action/raison ; un « 🛠️ en cours » ne traîne pas plus de 7 jours.
 * node tests/verify-imports-kevin.mjs */
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ❌ ' + m); } };
const t = readFileSync(new URL('../IMPORTS-KEVIN.md', import.meta.url), 'utf8');
const lignes = t.split('\n').filter((l) => /^\| \d{4}-\d{2}-\d{2} \|/.test(l));
ok(lignes.length >= 5, 'le registre contient les imports (' + lignes.length + ')');
const VERDICTS = ['✅ appliqué', '🛠️ en cours', '⏭️ écarté', '🏠 personnel'];
for (const l of lignes) {
  const c = l.split('|').map((x) => x.trim());   // ['', date, import, verdict, action, '']
  ok(c.length >= 6 && c[2].length > 3, 'ligne complète : ' + l.slice(0, 60));
  ok(VERDICTS.includes(c[3]), 'verdict connu : ' + c[3] + ' (' + c[2].slice(0, 40) + ')');
  ok(c[3] === '🏠 personnel' || c[4].length > 10, 'action ou raison écrite : ' + c[2].slice(0, 40));
  if (c[3] === '🛠️ en cours') ok(Date.now() - Date.parse(c[1]) < 7 * 864e5, '« en cours » depuis moins de 7 jours : ' + c[2].slice(0, 40) + ' (' + c[1] + ')');
}
console.log(`Imports de Kevin : ${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
