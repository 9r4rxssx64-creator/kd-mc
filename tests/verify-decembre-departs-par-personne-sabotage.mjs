/* Preuve que le garde « décembre, algorithme et ligne de départ de chaque personne » est discriminant :
 * chacun des quatre sabotages (doublon, élève numéroté avant le 23, congé numéroté, numéros affichés chez les professeurs) DOIT le faire échouer. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const garde = resolve(dirname(fileURLToPath(import.meta.url)), 'verify-decembre-departs-par-personne.mjs');
let mal = 0;
for (const s of ['doublon', 'eleve', 'cp', 'profs']) {
  const r = spawnSync('node', [garde], { env: { ...process.env, SABOTAGE: s }, encoding: 'utf8' });
  const rouge = r.status === 1 && /❌/.test(r.stdout);
  console.log(`  ${rouge ? '✅' : '❌'} SABOTAGE=${s} fait rougir le garde (statut ${r.status})`);
  if (!rouge) mal++;
}
const net = spawnSync('node', [garde], { encoding: 'utf8' });
console.log(`  ${net.status === 0 ? '✅' : '❌'} sans sabotage le garde est vert (statut ${net.status})`);
if (net.status !== 0) mal++;
console.log(`\n${mal === 0 ? '4 OK / 0 échec(s)' : mal + ' échec(s)'}`);
process.exit(mal ? 1 : 0);
