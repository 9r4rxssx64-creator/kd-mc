/* GARDE — la ration des minutes Actions se lit avant de lancer un robot (Kevin 13.10.2026 : « Prévient toutes tes branches de privilégier le gratuit. Même pour les actions »)
   node tests/verify-ration-actions.mjs      (SABOTAGE=1 : un run refusé par le budget est compté comme du vrai temps → la garde doit rougir)
   La fonction est exécutée pour de vrai sur des runs fictifs (jamais l'API) : minutes bord à bord, jour UTC, refusés à 0, verdicts, top des gourmands. */
import { ration, texte, RATION_MIN_PAR_JOUR, MORT_NE_COUTE_RIEN_S } from '../tools/ci/ration-actions.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SAB = process.env.SABOTAGE === '1';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const J = '2026-10-13';
const run = (nom, debut, secondes, o = {}) => ({ name: nom, status: 'completed', conclusion: 'success', run_started_at: `${J}T${debut}Z`, created_at: `${J}T${debut}Z`, updated_at: new Date(Date.parse(`${J}T${debut}Z`) + secondes * 1000).toISOString(), ...o });
const MORT = (debut) => run('Coffre → public', debut, SAB ? 600 : 5);

ok(RATION_MIN_PAR_JOUR === 60 && MORT_NE_COUTE_RIEN_S === 15, '1. ration du jour = 60 min (la règle du 13.10), un refus du budget (< 15 s) ne coûte rien');
let r = ration([run('Chaîne privée', '19:00:00', 17 * 60), run('Audit runtime', '19:20:00', 10 * 60)], J);
ok(r.minutes === 27 && r.reste === 33 && r.verdict === 'vert', '2. 17 + 10 min = 27 min, 33 restantes, vert', JSON.stringify(r));
r = ration([run('Chaîne privée', '19:00:00', 17 * 60), run('Audit runtime', '19:20:00', 10 * 60), run('Autre', '20:00:00', 5 * 60)], J);
ok(r.minutes === 32 && r.verdict === 'orange', '3. plus de la moitié mangée → orange (regroupe)', JSON.stringify(r));
r = ration([run('Chaîne privée', '19:00:00', 50 * 60), run('Audit runtime', '19:55:00', 12 * 60)], J);
ok(r.minutes === 62 && r.reste === 0 && r.verdict === 'rouge', '4. 62 min ≥ 60 → rouge, 0 restante', JSON.stringify(r));
r = ration([MORT('10:00:00'), MORT('10:05:00'), MORT('10:10:00'), run('Chaîne privée', '19:00:00', 600)], J);
ok(r.minutes === 10 && r.ignores === 3 && r.verdict === 'vert', '5. trois runs refusés par le budget (5 s) ne comptent pas : 10 min', JSON.stringify(r));
r = ration([run('Hier', '23:59:00', 3000, { run_started_at: '2026-10-12T23:59:00Z', created_at: '2026-10-12T23:59:00Z' }), run('Aujourd\'hui', '00:30:00', 120)], J);
ok(r.minutes === 2 && r.comptes === 1, '6. seul le jour UTC demandé compte (un run d\'hier est ignoré)', JSON.stringify(r));
r = ration({ workflow_runs: [run('A', '08:00:00', 600), run('B', '09:00:00', 1800), run('A', '10:00:00', 600)] }, J);
ok(r.top[0].nom === 'B' && r.top[0].minutes === 30 && r.top[1].nom === 'A' && r.top[1].minutes === 20, '7. les plus gourmands, du plus coûteux au moins coûteux (le format de l\'API est accepté tel quel)', JSON.stringify(r.top));
ok(/🔴.*MANGÉE.*AUCUN/.test(texte(ration([run('X', '01:00:00', 4000)], J))) && /🟢/.test(texte(ration([], J))), '8. le texte dit clairement quoi faire (rouge : n\'en lance aucun ; vert : il reste de la ration)');
const dossier = mkdtempSync(join(tmpdir(), 'ration-')); const f = join(dossier, 'runs.json');
writeFileSync(f, JSON.stringify({ workflow_runs: [run('Chaîne privée', '19:00:00', 61 * 60)] }));
let code = 0; try { execFileSync(process.execPath, ['tools/ci/ration-actions.mjs', '--runs', f, '--jour', J], { stdio: 'pipe' }); } catch (e) { code = e.status; }
ok(code === 3, '9. en ligne de commande, la ration mangée sort avec le code 3 (une suite de commandes s\'arrête toute seule)', String(code));
console.log(`\n${fail ? '❌' : '✅'} ration-actions : ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
