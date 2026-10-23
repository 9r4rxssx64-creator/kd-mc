/* LE ROBOT « BEE PARTOUT + TÂCHES » EST-IL DISCRIMINANT ? — preuve par sabotage (17.10.2026)
 *   sans sabotage      → vert ; la page qui se retire exprès est notée ⏭ (jamais ✅, jamais ❌)
 *   SABOTAGE=absent    → une page sans le widget : « le widget de Bee est ABSENT » rougit et NOMME l'adresse
 *   SABOTAGE=refus     → Bee répond « je n'ai pas accès… c'est Apex » : les contrôles de tâches rougissent
 *   SABOTAGE=sansoutil → la bonne valeur mais SANS outil (IA qui invente) : les contrôles de faits rougissent et le disent
 *   SABOTAGE=videdessin / minuscule (23.10) → le rond est là mais le personnage est absent / trop petit pour le doigt : le contrôle VISUEL rougit
 * npm run test:verif-live-bee-partout-robot-sabotage */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const robot = (env) => { const r = spawnSync(process.execPath, ['tests/verif-live-bee-partout.mjs'], { env: { ...process.env, ESSAI_LOCAL: '1', CAPTURES: mkdtempSync(join(tmpdir(), 'bee-p-')), ...env }, encoding: 'utf8', timeout: 180000 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
console.log('\nRobot « Bee partout + tâches » — chaque sabotage doit rougir sur SON contrôle\n');
const v = robot({});
dis(v.code === 0 && /=== VÉRIF BEE PARTOUT : OK/.test(v.out) && /⏭ {2}c\.kd-mc\.com/.test(v.out) && !/✅ c\.kd-mc\.com/.test(v.out), 'sans sabotage : VERT, et la page qui se retire exprès est notée ⏭ (ni ✅ ni ❌)');
const a = robot({ SABOTAGE: 'absent' });
dis(a.code === 1 && /❌ b\.kd-mc\.com : le widget de Bee est ABSENT/.test(a.out), 'SABOTAGE=absent → « b.kd-mc.com : le widget de Bee est ABSENT » rougit et nomme l\'adresse');
const b = robot({ SABOTAGE: 'refus' });
dis(b.code === 1 && (b.out.match(/❌ (?:météo|calcul exact|heure ailleurs|conversion|fait du monde)/g) || []).length >= 4, 'SABOTAGE=refus → les contrôles de tâches objectives rougissent (« je n\'ai pas accès » n\'est jamais une réponse)');
const c = robot({ SABOTAGE: 'sansoutil' });
dis(c.code === 1 && /AUCUN outil utilisé/.test(c.out) && (c.out.match(/❌ (?:météo|calcul exact|heure ailleurs|conversion)/g) || []).length >= 3, 'SABOTAGE=sansoutil → une bonne réponse SANS outil rougit (« la réponse a pu être inventée »)');
const d = robot({ SABOTAGE: 'videdessin' });
dis(d.code === 1 && /❌ a\.kd-mc\.com : Bee est DESSINÉE en entier/.test(d.out), 'SABOTAGE=videdessin → un rond sans personnage dedans rougit « Bee est DESSINÉE en entier »');
const e = robot({ SABOTAGE: 'minuscule' });
dis(e.code === 1 && /❌ a\.kd-mc\.com : le rond de Bee se touche du doigt/.test(e.out), 'SABOTAGE=minuscule → un rond de 20 px rougit « se touche du doigt »');
console.log(`\n${ok} ✅ / ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
