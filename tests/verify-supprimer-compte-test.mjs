/* GARDE — l'outil qui supprime un compte de test ne peut viser QUE les comptes de nos robots (19.10.2026).
   node tests/verify-supprimer-compte-test.mjs [--sabotage] */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const sab = process.argv.includes('--sabotage');
const script = readFileSync(new URL('../tools/smoke/supprimer-compte-test.mjs', import.meta.url), 'utf8');
const wf = readFileSync(new URL('../.github/workflows/supprimer-compte-test-public.yml', import.meta.url), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const dossier = mkdtempSync(join(tmpdir(), 'sct-'));
const lancer = (src, uid) => { const f = join(dossier, 'outil.mjs'); writeFileSync(f, src); return spawnSync(process.execPath, [f, uid], { encoding: 'utf8', env: { ...process.env, KDMC_ADMIN_PIN_SHA256: '' } }); };
const code = sab ? script.replace(/if \(!UID_DE_TEST\.test\(uid\) \|\| ADMIN_UIDS\.has\(uid\)\)/, 'if (false)') : script;
for (const mauvais of ['laurence_sp', 'kevin-desarzens', 'kdmc_admin', 'ludovic-morter', 'testparcours-x;rm', '', 'Parcours-Robot']) ok(lancer(code, mauvais).status === 2, `refuse « ${mauvais || '(vide)'} » (code 2)`);
for (const bon of ['testparcours-verification', 'parcours-robotabcdef']) ok(lancer(code, bon).status === 1, `accepte « ${bon} » jusqu'au code admin absent (code 1)`);
ok(!/^\s*(schedule:|- cron)/m.test(wf), 'workflow sans cron');
ok(/secrets\.APEX_ADMIN_PIN_SHA256/.test(wf), 'workflow : secret du code admin');
ok(/confirmer:[\s\S]*?default: "non"/.test(wf), 'workflow : essai à blanc par défaut');
console.log(`\n${pass} OK / ${fail} échec(s)`);
if (sab) { console.log(fail ? 'sabotage détecté ✔' : 'SABOTAGE NON DÉTECTÉ'); process.exit(fail ? 0 : 1); }
process.exit(fail ? 1 : 0);
