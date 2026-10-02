/* GARDE — révision espacée FSRS de Lingua (2.10). On extrait les fonctions pures d'app.js et on vérifie :
 *   1. un mot neuf réussi revient dans quelques jours, raté dans 10 minutes ;
 *   2. chaque réussite espace davantage (intervalles croissants) ; un oubli fait chuter la stabilité ;
 *   3. un mot difficile (souvent raté) revient plus vite qu'un mot facile ;
 *   4. une fiche de l'ANCIEN système (SM-2) est convertie sans perte (reps, échéance, intervalle) ;
 *   5. rétention 90 % : l'intervalle vaut la stabilité (propriété de FSRS-4.5).
 * node tests/verify-lingua-fsrs.mjs */
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../lingua/app.js', import.meta.url), 'utf8');
const bloc = app.slice(app.indexOf('var FSRS_W='), app.indexOf('function srsUpdate('));
const F = new Function(bloc + '; return { fsrsRevoir, fsrsDepuisAncien, fsrsIntervalle, fsrsRappel };')();
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const J = 864e5; const t0 = Date.parse('2026-10-01T08:00:00Z');
let a = F.fsrsRevoir(null, 3, t0);
ok(a.int >= 2 && a.int <= 6 && a.reps === 1, `1a. mot neuf réussi → revient dans ${a.int} jours`);
const r = F.fsrsRevoir(null, 1, t0);
ok(r.due - t0 === 10 * 60000 && r.reps === 0 && r.lapses === 1, '1b. mot neuf raté → revient dans 10 minutes');
const ints = [a.int]; let t = t0;
for (let i = 0; i < 4; i++) { t += a.int * J; a = F.fsrsRevoir(a, 3, t); ints.push(a.int); }
ok(ints.every((x, i) => i === 0 || x > ints[i - 1]), `2a. réussites successives → intervalles croissants (${ints.join(' → ')} j)`);
const avant = a.st; t += a.int * J; const oubli = F.fsrsRevoir(a, 1, t);
ok(oubli.st < avant / 3 && oubli.lapses === 1 && oubli.reps === 0, `2b. un oubli fait chuter la stabilité (${avant.toFixed(1)} → ${oubli.st.toFixed(1)} j)`);
let dur = F.fsrsRevoir(null, 1, t0); dur = F.fsrsRevoir(dur, 1, t0 + 600000); dur = F.fsrsRevoir(dur, 3, t0 + J);
let facile = F.fsrsRevoir(null, 3, t0); facile = F.fsrsRevoir(facile, 3, t0 + facile.int * J);
ok(dur.d > facile.d && dur.int < facile.int, `3. le mot difficile (D ${dur.d.toFixed(1)}) revient avant le facile (D ${facile.d.toFixed(1)}) : ${dur.int} j contre ${facile.int} j`);
const ancien = { ease: 2.6, int: 15, reps: 4, due: t0 + 3 * J };
const conv = F.fsrsDepuisAncien(ancien);
ok(conv.st === 15 && conv.reps === 4 && conv.due === ancien.due && conv.last === ancien.due - 15 * J && conv.d < 5, '4a. fiche SM-2 convertie : stabilité = intervalle, reps et échéance gardés, mot plutôt facile');
const apres = F.fsrsRevoir(ancien, 3, ancien.due);
ok(apres.int > 15 && apres.reps === 5, `4b. et sa révision suivante l'espace encore (${apres.int} j)`);
ok(Math.abs(F.fsrsIntervalle(20) - 20) <= 1 && Math.abs(F.fsrsRappel(20, 20) - 0.9) < 1e-9, '5. rétention 90 % : après S jours, rappel = 90 %, intervalle = S');
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
