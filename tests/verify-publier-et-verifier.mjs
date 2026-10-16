/* GARDE — « publier puis PROUVER » : un déploiement vert sur le vieux code ne vaut pas « en ligne » (leçon 579).
   node tests/verify-publier-et-verifier.mjs     (SABOTAGE=1 : runDuCommit prend « la dernière » au lieu de celle du commit → la garde doit rougir) */
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
let SCRIPT = 'tools/depot-public/publier-et-verifier.mjs';
if (process.env.SABOTAGE === '1') {
  SCRIPT = 'tools/depot-public/publier-et-verifier.sab.mjs';
  writeFileSync(SCRIPT, readFileSync('tools/depot-public/publier-et-verifier.mjs', 'utf8').replace("return (runs || []).find((r) => String(r.head_sha || '').startsWith(court)) || null;", 'return (runs || [])[0] || null;'));
  process.on('exit', () => rmSync(SCRIPT, { force: true }));
}
const { runDuCommit, verdict, faut_il_lancer } = await import(pathToFileURL(join(process.cwd(), SCRIPT)).href);
const vieux = { head_sha: 'f5f125a2aaaa', status: 'completed', conclusion: 'success' };
const neuf = { head_sha: '40adf1ce9999', status: 'in_progress', conclusion: null };
ok(runDuCommit([vieux], '40adf1ce1234') === null, '1. un déploiement vert sur L\'ANCIEN commit n\'est PAS pris pour celui du nouveau');
ok(runDuCommit([vieux, neuf], '40adf1ce1234') === neuf, '2. trouve l\'exécution qui porte le commit public publié');
ok(runDuCommit([], 'abc') === null && runDuCommit([vieux], '') === null, '3. aucune exécution / aucun commit → rien');
ok(verdict(null) === 'attente' && verdict(neuf) === 'attente', '4. pas d\'exécution ou en cours → on attend');
ok(verdict({ status: 'completed', conclusion: 'success' }) === 'ok' && verdict({ status: 'completed', conclusion: 'failure' }) === 'echec' && verdict({ status: 'completed', conclusion: 'skipped' }) === 'echec', '5. seul « success » vaut « en ligne » (sauté ou raté = échec)');
ok(faut_il_lancer(null, 5) === true && faut_il_lancer(null, 1) === false && faut_il_lancer(neuf, 9) === false, '6. lancement manuel seulement si RIEN n\'existe après le délai de grâce');
console.log(`\n${pass} ok, ${fail} échec`); process.exit(fail ? 1 : 0);
