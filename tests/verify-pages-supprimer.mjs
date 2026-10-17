/* L'outil qui supprime un projet Pages fuyard refuse-t-il tout ce qu'il doit refuser ? (17.10.2026)
 * Sans clé → sort 2 sans rien appeler ; compte mal formé → 2 ; projet hors liste blanche → refus écrit dans le code (jamais un projet vivant).
 * Sabotage : si la liste blanche disparaît du script, le test rougit. npm run test:pages-supprimer */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const run = (args, env = {}) => spawnSync(process.execPath, ['tools/cloudflare/pages-supprimer.mjs', ...args], { env: { ...process.env, CLOUDFLARE_API_TOKEN: '', ...env }, encoding: 'utf8' });
const r1 = run(['--compte', 'ffaca6f306a953f82834db0970f300f0', '--projet', 'kdmc-site']);
dis(r1.status === 2 && /clé absente/.test(r1.stderr), 'sans clé : refus immédiat (code 2), aucun appel réseau');
const r2 = run(['--compte', 'pas-un-id', '--projet', 'kdmc-site'], { CLOUDFLARE_API_TOKEN: 'x' });
dis(r2.status === 2 && /usage/.test(r2.stderr), 'compte mal formé : usage (code 2)');
const src = readFileSync('tools/cloudflare/pages-supprimer.mjs', 'utf8');
dis(/LISTE_BLANCHE = new Set\(\['kdmc0', 'kdmc-javis', 'kdmc-site'\]\)/.test(src), 'liste blanche présente : kdmc0, kdmc-javis, kdmc-site seulement');
dis(/if \(!LISTE_BLANCHE\.has\(projet\)\)/.test(src) && src.indexOf('LISTE_BLANCHE.has') < src.indexOf('--confirmer=oui)'), 'le refus hors liste blanche précède toute suppression');
dis(!/console\.log\([^)]*\bT\b/.test(src) && !/CLOUDFLARE_API_TOKEN=/.test(src.replace(/^\s*\*.*$/gm, '')), 'la clé n\'est jamais affichée ni écrite');
dis(/force=true/.test(src) && /method: 'DELETE'/.test(src), 'les déploiements partent avec force=true (production comprise)');
console.log(`\n${ok} ✅ / ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
