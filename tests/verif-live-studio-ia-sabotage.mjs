/* LE ROBOT « IA DU STUDIO COMME KEVIN » EST-IL DISCRIMINANT ? — preuve par sabotage (25.10.2026)
 *
 * Un garde qui ne rougit jamais ne protège rien. Les sabotages sont rejoués en local (vraie page du Studio, domaine et service simulés)
 * et DOIVENT rougir sur LEUR contrôle ; sans sabotage le robot reste vert :
 *   SABOTAGE=ia      → le service rend 502 : C, D et E rougissent (jamais de vert sans image)
 *   SABOTAGE=version → sw.js servi d'une autre version : « la version servie … est celle du dépôt » rougit
 *   SABOTAGE=copie   → le service renvoie l'entrée telle quelle : « DIFFÉRENTE de l'entrée » rougit
 * npm run test:verif-live-studio-ia-robot-sabotage */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const exe = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
if (!exe && !process.env.PW_EXE) { console.log('  ⚠️ pas de Chromium installé : garde non jouée'); process.exit(0); }
const robot = (env) => {
  const dossier = mkdtempSync(join(tmpdir(), 'studio-ia-sab-'));
  const r = spawnSync(process.execPath, ['tests/verif-live-studio-ia.mjs'], { env: { ...process.env, ...(exe ? { PW_EXE: process.env.PW_EXE || exe } : {}), ESSAI_LOCAL: '1', CAPTURES: dossier, ...env }, encoding: 'utf8', timeout: 180000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), dossier };
};
console.log('\nRobot « IA du Studio comme Kevin » — chaque sabotage doit rougir sur SON contrôle\n');
const v = robot({});
dis(v.code === 0 && /=== VÉRIF STUDIO IA : OK/.test(v.out), `sans sabotage : le robot est VERT (code ${v.code})`);
dis(readdirSync(v.dossier).some((f) => /^cartoon-toon3d\./.test(f)) && readdirSync(v.dossier).some((f) => /^instant-1\./.test(f)), 'sans sabotage : les rendus (cartoon + instants) sont écrits pour être regardés');
const a = robot({ SABOTAGE: 'ia' });
dis(a.code === 1 && /❌ C\) \/cartoon style=toon3d/.test(a.out) && /❌ D\) \/cartoon style=anime/.test(a.out) && /❌ E\) \/frames/.test(a.out), 'SABOTAGE=ia → C, D et E rougissent (jamais de vert sans image)');
const b = robot({ SABOTAGE: 'version' });
dis(b.code === 1 && /❌ la version servie/.test(b.out), 'SABOTAGE=version → « la version servie … est celle du dépôt » rougit');
const c = robot({ SABOTAGE: 'copie' });
dis(c.code === 1 && /❌ C\) l'image rendue est DIFFÉRENTE/.test(c.out), 'SABOTAGE=copie → « DIFFÉRENTE de l\'entrée » rougit');
const src = readFileSync(new URL('./verif-live-studio-ia.mjs', import.meta.url), 'utf8');
dis(!/\.waitForFunction\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'le robot n\'utilise pas waitForFunction (interdit par la CSP du domaine)');
dis(!/KDMC_ADMIN_PIN_SHA256\s*[:=]\s*['"][0-9a-f]/.test(src) && !/console\.log\([^)]*HASH/.test(src), 'le robot n\'écrit jamais l\'empreinte du code admin');
console.log(`\n${ok} ✅ / ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
