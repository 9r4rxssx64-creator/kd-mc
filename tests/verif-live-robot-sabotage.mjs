/* LE ROBOT DE VÉRIFICATION RÉELLE EST-IL ENCORE DISCRIMINANT ? — preuve par sabotage (10.10.2026)
 *
 * Trouvé le 10.10 : l'ancre du SABOTAGE=1 (rotation continue au lieu des séries) ne correspondait plus à la light depuis la
 * v1.74 (« +minRang ») → `SABOTAGE=1` ne changeait RIEN et le robot restait vert : la preuve « il rougit quand la règle est
 * fausse » n'existait plus, et personne ne le voyait (leçon #138 : un garde qui ne rougit jamais ne protège rien).
 * Ici, les deux sabotages sont rejoués en local (domaine simulé) et DOIVENT rougir sur les bons contrôles :
 *   SABOTAGE=1        → D (séries) rouge
 *   SABOTAGE=collegue → F1 (le collègue n'est pas admin) rouge
 * Sans sabotage, le robot doit rester vert (c'est test:verif-live-robot, lancé à part).
 *
 * npm run test:verif-live-robot-sabotage
 */
import { spawnSync } from 'node:child_process';

let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const robot = (env) => {
  const r = spawnSync(process.execPath, ['tests/verif-live-equipes.mjs'], { env: { ...process.env, ESSAI_LOCAL: '1', ...env }, encoding: 'utf8', timeout: 600000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

console.log('\nRobot de vérification réelle — chaque sabotage doit rougir sur SON contrôle\n');

const a = robot({ SABOTAGE: '1' });
dis(a.code === 1, `SABOTAGE=1 (rotation continue) → le robot sort en échec (code ${a.code})`);
dis(/❌ D\. /.test(a.out), 'SABOTAGE=1 → le contrôle D (séries 4235-2351-3514) rougit');
dis(!/ancre introuvable/.test(a.out), 'SABOTAGE=1 → l\'ancre existe encore dans la light (sinon le sabotage ne prouverait rien)');

const b = robot({ SABOTAGE: 'collegue' });
dis(b.code === 1, `SABOTAGE=collegue (admin pour tous) → le robot sort en échec (code ${b.code})`);
dis(/❌ F1\. /.test(b.out), 'SABOTAGE=collegue → le contrôle F1 (le collègue n\'est PAS admin) rougit');

console.log(`\n${ok} ✅ / ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
