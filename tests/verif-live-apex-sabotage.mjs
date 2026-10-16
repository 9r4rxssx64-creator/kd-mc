/* LE ROBOT « APEX COMME KEVIN » EST-IL DISCRIMINANT ? — preuve par sabotage (16.10.2026)
 *
 * Leçon #490 / #138 : un garde qui ne rougit jamais ne protège rien. À l'essai local du 16.10, le premier sabotage
 * « chevauchement » ne saboterait RIEN (style injecté avant que <head> existe, puis `fixed` faussé par un ancêtre transformé)
 * et le robot restait vert. Ici, les trois sabotages sont rejoués en local (copie servie du dépôt, domaine simulé) et DOIVENT
 * rougir sur LEUR contrôle :
 *   SABOTAGE=chevauche → C (l'étiquette de version est posée PAR-DESSUS le menu ☰) rouge
 *   SABOTAGE=cle       → E (« Test » répond une erreur sans IA gratuite) rouge
 *   SABOTAGE=bulle     → D (bulle orange « Cloudflare ralenti ») rouge
 * Sans sabotage, le robot doit rester vert (c'est test:verif-live-apex-robot, lancé à part).
 *
 * npm run test:verif-live-apex-robot-sabotage
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const robot = (env) => {
  const r = spawnSync(process.execPath, ['tests/verif-live-apex.mjs'], { env: { ...process.env, ESSAI_LOCAL: '1', CAPTURES: mkdtempSync(join(tmpdir(), 'apex-sab-')), ...env }, encoding: 'utf8', timeout: 600000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

console.log('\nRobot « Apex comme Kevin » — chaque sabotage doit rougir sur SON contrôle\n');

const a = robot({ SABOTAGE: 'chevauche' });
dis(a.code === 1, `SABOTAGE=chevauche (étiquette sur le menu) → le robot sort en échec (code ${a.code})`);
dis(/❌ rien ne se chevauche[^\n]*menu ☰[^\n]*étiquette de version/.test(a.out), 'SABOTAGE=chevauche → le contrôle C rougit et NOMME la paire (menu ☰ × étiquette de version)');

const b = robot({ SABOTAGE: 'cle' });
dis(b.code === 1, `SABOTAGE=cle (passerelle refusée) → le robot sort en échec (code ${b.code})`);
dis(/❌ « Test »/.test(b.out), 'SABOTAGE=cle → le contrôle E (« Test » → une IA gratuite répond) rougit');

const c = robot({ SABOTAGE: 'bulle' });
dis(c.code === 1, `SABOTAGE=bulle (bulle Cloudflare affichée) → le robot sort en échec (code ${c.code})`);
dis(/❌ aucune bulle orange/.test(c.out), 'SABOTAGE=bulle → le contrôle D (pas de bulle orange) rougit');

console.log(`\n${ok} ✅ / ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
