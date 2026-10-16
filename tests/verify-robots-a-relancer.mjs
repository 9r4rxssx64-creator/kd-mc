/* Le relanceur de robots refait-il ce que GitHub ferait ? (17.10.2026, publication automatique depuis le coffre)
 * Un push fait avec le jeton du job ne déclenche rien : le robot « publier depuis le coffre » relance lui-même les déploiements.
 * Ici : motifs GitHub (`**`, `*`, négation), branches, paths-ignore, et les VRAIS workflows du dépôt (le routeur part pour index.html,
 * pas pour un fichier de test ; le worker outlook part pour son dossier seulement). Sabotage : un motif « ** » qui ne matche plus → rouge.
 * npm run test:robots-a-relancer */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { motifVersRegex, cheminCorrespond, workflowDeclenche, robotsARelancer } from '../tools/depot-public/robots-a-relancer.mjs';

let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };

dis(motifVersRegex('services/kdmc-router/**').test('services/kdmc-router/worker.js'), '« dossier/** » prend un fichier du dossier');
dis(motifVersRegex('services/kdmc-router/**').test('services/kdmc-router/a/b/c.js'), '« dossier/** » prend les sous-dossiers');
dis(!motifVersRegex('services/kdmc-router/**').test('services/kdmc-outlook/worker.js'), '« dossier/** » ne prend pas un autre dossier');
dis(motifVersRegex('index.html').test('index.html') && !motifVersRegex('index.html').test('tools/index.html'), 'un fichier nu ne prend que la racine');
dis(motifVersRegex('*.js').test('a.js') && !motifVersRegex('*.js').test('d/a.js'), '« *.js » ne traverse pas les dossiers');
dis(motifVersRegex('**/*.js').test('d/e/a.js'), '« **/*.js » traverse');
dis(cheminCorrespond('tools/x.js', ['tools/**', '!tools/x.js']) === false, 'la négation retire (dernier motif qui correspond)');
dis(cheminCorrespond('tools/y.js', ['tools/**', '!tools/x.js']) === true, 'la négation ne retire que ce qu\'elle nomme');

const y1 = 'on:\n  push:\n    branches: [main]\n    paths:\n      - "services/kdmc-outlook/**"\n';
dis(workflowDeclenche(y1, ['services/kdmc-outlook/worker.js']), 'push main + paths : part pour son dossier');
dis(!workflowDeclenche(y1, ['README.md']), 'push main + paths : ne part pas pour un autre fichier');
dis(!workflowDeclenche('on:\n  push:\n    branches: [dev]\n', ['x']), 'branche autre que main : ne part pas');
dis(workflowDeclenche('on:\n  push:\n    paths-ignore: ["docs/**"]\n', ['src/a.js']) && !workflowDeclenche('on:\n  push:\n    paths-ignore: ["docs/**"]\n', ['docs/a.md']), 'paths-ignore respecté');
dis(!workflowDeclenche('on:\n  workflow_dispatch: {}\n', ['x']), 'sans push : jamais');
dis(workflowDeclenche('on: [push, workflow_dispatch]\n', ['x']), 'forme liste « on: [push] » : part');

/* Les vrais workflows du dépôt */
const D = '.github/workflows';
const workflows = readdirSync(D).filter((f) => /\.ya?ml$/.test(f)).map((f) => ({ nom: f, yaml: readFileSync(join(D, f), 'utf8') }));
const r1 = robotsARelancer(['index.html'], workflows);
dis(r1.includes('deploy-kdmc-router.yml'), `index.html → le routeur (les pages) : ${r1.join(', ') || '(rien)'}`);
const r2 = robotsARelancer(['services/kdmc-outlook/worker.js'], workflows);
dis(r2.includes('deploy-kdmc-outlook.yml') && !r2.includes('deploy-kdmc-router.yml'), `worker outlook → son déploiement, pas le routeur : ${r2.join(', ')}`);
const r3 = robotsARelancer(['tests/verify-robots-a-relancer.mjs'], workflows);
dis(!r3.includes('deploy-kdmc-router.yml'), `un test n'appelle pas le routeur : ${r3.join(', ') || '(rien)'}`);
dis(r1.every((n) => /^deploy-/.test(n)) && !r1.includes('deploy.yml'), 'seuls les déploiements sont relancés (jamais deploy.yml, ni lint / tests / gitleaks)');
const r4 = robotsARelancer(['index.html'], workflows, null);
dis(r4.length > r1.length && r4.includes('deploy-kdmc-router.yml'), `sans filtre (--tout) : ${r4.length} robots au lieu de ${r1.length}`);

/* sabotage : un convertisseur qui ignore « ** » doit rougir */
const sab = (m) => new RegExp('^' + m.replace(/\*\*/g, 'XX') + '$');
dis(!sab('services/kdmc-router/**').test('services/kdmc-router/worker.js'), 'sabotage (« ** » cassé) : le motif ne prend plus rien — la preuve discrimine');

console.log(`\n${ok} ✅ / ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
