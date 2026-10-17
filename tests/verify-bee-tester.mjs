/* Le robot « tester Bee à la place de Kevin » est-il sûr et complet ? (17.10.2026)
 * Sans secret → sort 1 sans toucher au domaine ; il fait les DEUX appels du widget (diag puis question) ; il ne journalise jamais le jeton ;
 * le workflow reste au coffre, lecture seule, sans cron. Sabotage : retirer l'appel diag → rouge. npm run test:bee-tester */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const r = spawnSync(process.execPath, ['tools/smoke/bee-tester.mjs'], { env: { ...process.env, KDMC_ADMIN_PIN_SHA256: '' }, encoding: 'utf8', timeout: 60000 });
dis(r.status === 1 && /pas de session Kevin/.test(r.stdout + r.stderr), 'sans secret : s\'arrête avant tout appel à Bee (code 1)');
const src = readFileSync('tools/smoke/bee-tester.mjs', 'utf8');
dis(/diag: true/.test(src), 'appel 1 = le bouton 🩺 Tester Bee ({diag:true})');
dis(/messages: \[\{ role: 'user'/.test(src), 'appel 2 = une vraie question à Bee');
dis(/x-kdmc-sonde/.test(src), 'les appels sont marqués « sonde » (jamais comptés comme Kevin)');
dis(!/console\.log\([^)]*session\.jeton/.test(src) && /session\.masque/.test(src), 'le jeton n\'est jamais affiché (seulement sa présence)');
dis(!/__javis\/agir|method: 'PUT'|method: 'DELETE'/.test(src), 'lecture seule : jamais /__javis/agir, jamais d\'écriture');
const wf = readFileSync('.github/workflows/coffre-bee-tester.yml', 'utf8');
dis(/workflow_dispatch/.test(wf) && !/schedule:/.test(wf), 'robot à la main, jamais de cron');
dis(/secrets\.APEX_ADMIN_PIN_SHA256/.test(wf) && /permissions:\n  contents: read/.test(wf), 'secret admin du coffre, droits en lecture seule');
console.log(`\n${ok} ✅ / ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
