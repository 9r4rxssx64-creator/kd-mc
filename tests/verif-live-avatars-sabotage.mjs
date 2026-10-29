/* LE ROBOT « AVATARS COMME KEVIN » EST-IL DISCRIMINANT ? — preuve par sabotage (29.10.2026)
 * Rejoué en local (vraie page du Studio, domaine et service simulés) ; chaque sabotage DOIT rougir sur SON contrôle :
 *   SABOTAGE=ia      → le service ne rend plus d'image : les looks IA (C) rougissent
 *   SABOTAGE=version → sw.js servi d'une autre version : « version SERVIE » rougit
 * npm run test:verif-live-avatars-robot-sabotage */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const exe = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
if (!exe && !process.env.PW_EXE) { console.log('  ⚠️ pas de Chromium installé : garde non jouée'); process.exit(0); }
const robot = (env) => {
  const r = spawnSync(process.execPath, ['tests/verif-live-avatars.mjs'], { env: { ...process.env, ...(exe ? { PW_EXE: process.env.PW_EXE || exe } : {}), ESSAI_LOCAL: '1', CAPTURES: mkdtempSync(join(tmpdir(), 'avatars-sab-')), ...env }, encoding: 'utf8', timeout: 280000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
console.log('\nRobot « Avatars comme Kevin » — chaque sabotage doit rougir sur SON contrôle\n');
const v = robot({});
dis(v.code === 0 && /=== VÉRIF AVATARS : OK/.test(v.out), `sans sabotage : le robot est VERT (code ${v.code})`);
const a = robot({ SABOTAGE: 'ia' });
dis(a.code === 1 && /❌ C\)/.test(a.out), 'SABOTAGE=ia → un look IA rougit (jamais de vert sans image)');
const b = robot({ SABOTAGE: 'version' });
dis(b.code === 1 && /❌ B\) version SERVIE/.test(b.out), 'SABOTAGE=version → « version SERVIE » rougit');
const src = readFileSync(new URL('./verif-live-avatars.mjs', import.meta.url), 'utf8');
dis(!/\.waitForFunction\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'le robot n\'utilise pas waitForFunction (interdit par la CSP du domaine)');
dis(!/KDMC_ADMIN_PIN_SHA256\s*[:=]\s*['"][0-9a-f]{8}/.test(src) && !/console\.log\([^)]*HASH/.test(src), 'le robot n\'écrit jamais l\'empreinte du code admin');
const wf = readFileSync(new URL('../.github/workflows/verif-live-avatars.yml', import.meta.url), 'utf8');
dis(!/^\s*schedule:/m.test(wf) && /workflow_dispatch/.test(wf), 'le workflow est lancé à la main (jamais de cron)');
console.log(`\n${ok} ✅ / ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
