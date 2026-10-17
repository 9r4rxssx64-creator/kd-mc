/* LE ROBOT « MESSAGES COMME KEVIN » EST-IL DISCRIMINANT ? — preuve par sabotage (17.10.2026)
 *
 * Un garde qui ne rougit jamais ne protège rien (leçons #138 / #490). Les sabotages sont rejoués en local (vraies pages kdmc-home/, domaine simulé)
 * et DOIVENT rougir sur LEUR contrôle ; sans sabotage le robot reste vert :
 *   SABOTAGE=alertes      → le code servi mélange les alertes dans « Tous » : « la liste Tous montre … vrais messages » rougit
 *   SABOTAGE=tri          → le classement est neutralisé : « l'ordre affiché suit le classement » rougit
 *   SABOTAGE=atterrissage → l'ouverture ne saute plus sur la conversation : « ATTERRIT sur la conversation » rougit
 * npm run test:verif-live-messages-robot-sabotage */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const exe = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
if (!exe && !process.env.PW_EXE) { console.log('  ⚠️ pas de Chromium installé : garde non jouée'); process.exit(0); }
const robot = (env) => {
  const r = spawnSync(process.execPath, ['tests/verif-live-messages.mjs'], { env: { ...process.env, ...(exe ? { PW_EXE: process.env.PW_EXE || exe } : {}), ESSAI_LOCAL: '1', CAPTURES: mkdtempSync(join(tmpdir(), 'msg-sab-')), ...env }, encoding: 'utf8', timeout: 180000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
console.log('\nRobot « Messages comme Kevin » — chaque sabotage doit rougir sur SON contrôle\n');
const v = robot({});
dis(v.code === 0 && /=== VÉRIF MESSAGES : OK/.test(v.out), `sans sabotage : le robot est VERT (code ${v.code})`);
const a = robot({ SABOTAGE: 'alertes' });
dis(a.code === 1 && /❌ la liste « Tous » montre/.test(a.out), 'SABOTAGE=alertes → « la liste Tous montre … vrais messages » rougit');
const b = robot({ SABOTAGE: 'tri' });
dis(b.code === 1 && /❌ l'ordre affiché suit le classement/.test(b.out), 'SABOTAGE=tri → « l\'ordre affiché suit le classement » rougit');
const c = robot({ SABOTAGE: 'atterrissage' });
dis(c.code === 1 && /❌ un toucher sur le bandeau ATTERRIT/.test(c.out), 'SABOTAGE=atterrissage → « ATTERRIT sur la conversation » rougit');
console.log(`\n${ok} ✅ / ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
