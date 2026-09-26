/* GARDE — un worker qui déclare `[assets] directory = "…"` dans son wrangler.toml doit pouvoir
 * être DÉPLOYÉ par son workflow : si ce dossier n'est pas versionné (gitignoré / absent du
 * dépôt), le workflow de déploiement DOIT contenir une étape qui le fabrique AVANT
 * `wrangler deploy`.
 *
 * TROUVÉ LE 2026-09-05 : services/kdmc-router/wrangler.toml exigeait ./public (bouée de secours
 * ajoutée le 14/08, dossier gitignoré, fabriqué par prepare-secours.mjs) — mais
 * deploy-kdmc-router.yml ne lançait jamais ce script. Résultat : `wrangler deploy` s'arrêtait net
 * (« assets.directory does not exist »), 4 déploiements rouges d'affilée du 13/08 au 05/09, donc
 * AUCUN secret poussé au routeur pendant 3 semaines — dont le hash du code admin changé ce jour.
 * Un déploiement manuel qui échoue est invisible tant que personne ne relit ses journaux : ce
 * garde attrape la cause AVANT le push.
 *
 * node tests/wrangler-assets-buildable.test.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF_DIR = join(ROOT, '.github', 'workflows');

function gitTracked(relPath) {
  try { return execSync(`git ls-files --error-unmatch -- "${relPath}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().length > 0; }
  catch { return false; }
}
function trackedInside(relDir) {
  try { return execSync(`git ls-files -- "${relDir}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().length > 0; }
  catch { return false; }
}

const services = readdirSync(join(ROOT, 'services')).filter(d => {
  try { return statSync(join(ROOT, 'services', d)).isDirectory(); } catch { return false; }
});
const workflows = readdirSync(WF_DIR).filter(f => /\.ya?ml$/.test(f)).map(f => ({ name: f, txt: readFileSync(join(WF_DIR, f), 'utf8') }));

let checked = 0, fails = [];
for (const svc of services) {
  const tomlPath = join(ROOT, 'services', svc, 'wrangler.toml');
  if (!existsSync(tomlPath)) continue;
  const toml = readFileSync(tomlPath, 'utf8');
  const m = /^\[assets\][\s\S]*?^\s*directory\s*=\s*"([^"]+)"/m.exec(toml);
  if (!m) continue;
  checked++;
  const dirRel = relative(ROOT, resolve(join(ROOT, 'services', svc), m[1]));
  if (trackedInside(dirRel)) { console.log(`  · ${svc}: [assets] ${m[1]} est versionné → rien à fabriquer`); continue; }
  /* Dossier non versionné → un workflow qui déploie ce service doit le fabriquer d'abord. */
  const deployers = workflows.filter(w => new RegExp(`working-directory:\\s*services/${svc}\\b`).test(w.txt) && /wrangler\s+deploy/.test(w.txt));
  if (!deployers.length) { console.log(`  · ${svc}: aucun workflow ne le déploie (ok)`); continue; }
  const dirName = m[1].replace(/^\.\//, '').replace(/\/$/, '');
  for (const w of deployers) {
    /* On juge les COMMANDES, pas les commentaires : un `# fabriqué par prepare-secours.mjs` en
       tête de fichier ne fabrique rien (1er jet de ce garde : il passait au vert sur ce seul
       commentaire — prouvé par sabotage, corrigé). */
    const commandes = w.txt.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
    const before = commandes.split(/wrangler\s+deploy/)[0];
    const builds = /\bnode\s+(\S*\/)?prepare-secours\.mjs/.test(before)
      || new RegExp(`\\b(mkdir|cp|rsync)\\b[^\\n]*\\b${dirName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(before);
    if (builds) console.log(`  ✅ ${svc}: ${w.name} fabrique ${m[1]} avant wrangler deploy`);
    else fails.push(`${w.name} déploie services/${svc} mais ne fabrique jamais ${m[1]} (gitignoré) avant \`wrangler deploy\` → le déploiement échouera (« assets.directory does not exist »)`);
  }
}

console.log(`\n${fails.length ? '❌' : '✅'} garde « assets wrangler fabriqués avant deploy » : ${checked} worker(s) avec [assets], ${fails.length} échec(s)`);
for (const f of fails) console.log('   ❌ ' + f);
process.exit(fails.length ? 1 : 0);
