/* Garde « balayage de nuit » : la suppression d'un compte efface TOUTES ses traces (connexions, profils, apps installées, notifications, quêtes),
 * le balayage existe (à chaque déploiement + à la demande, sans cron) et ne vise que la liste fermée de comptes de test (jamais une vraie personne). Rouge sous SABOTAGE=1. */
import fs from 'node:fs';
let ko = 0; const ok = (c, m) => { if (!c) { ko++; console.error('ROUGE : ' + m); } else console.log('ok : ' + m); };
const w = fs.readFileSync(new URL('../services/kdmc-router/worker.js', import.meta.url), 'utf8');
const l = (w.match(/for \(const t of \[('inscription_admin'[^\]]*)\]/) || [])[1] || '';
for (const t of ['connexions', 'profils', 'apps_installees', 'push_domaine', 'quetes', 'activite', 'presence_domaine']) ok(l.includes("'" + t + "'") && process.env.SABOTAGE !== '1', 'compte-supprimer efface aussi la table ' + t);
const sc = fs.readFileSync(new URL('../tools/smoke/supprimer-compte-test.mjs', import.meta.url), 'utf8');
const re = new RegExp((sc.match(/const UID_DE_TEST = \/(.*)\/;/) || [])[1] || '$^');
for (const v of ['testfinal-linguaabc', 'parcours-robotxyz', 'ci_smoke', 'marie-curie']) ok(re.test(v), 'liste de test : ' + v + ' est balayé');
for (const v of ['kevin-desarzens', 'kdmc_admin', 'carla-scarlot', 'mathieu-adelli', 'theo-bruno', 'marie-curie-vraie', 'ci_smoke2']) ok(!re.test(v), 'liste de test : ' + v + ' n\'est JAMAIS balayé');
const wf = fs.readFileSync(new URL('../.github/workflows/comptes-test-balayage.yml', import.meta.url), 'utf8');
ok(!/^\s*-\s*cron\s*:/m.test(wf) && /workflow_dispatch/.test(wf) && /TOUS-LES-TESTS --confirmer=oui/.test(wf), 'balayage à la demande : sans cron (règle), TOUS-LES-TESTS');
const dep = fs.readFileSync(new URL('../.github/workflows/deploy-kdmc-router.yml', import.meta.url), 'utf8');
ok(/TOUS-LES-TESTS --confirmer=oui/.test(dep) && process.env.SABOTAGE !== '1', 'chaque déploiement du routeur balaie les comptes de test (ci_smoke compris)');
ok(!/macos/.test(wf), 'balayage de nuit : jamais macOS');
process.exit(ko ? 1 : 0);
