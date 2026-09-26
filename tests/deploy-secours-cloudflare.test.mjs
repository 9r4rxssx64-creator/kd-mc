/* SECOURS DE DÉPLOIEMENT — Cloudflare Workers Builds (Kevin 2026-08-06 « Fais pour secours »).
 *
 * Contexte : le 2026-08-06 GitHub Actions est tombé 6 h (0 job en cours, 390 en file) et AUCUN
 * déploiement n'est parti. Le secours = laisser Cloudflare construire et déployer lui-même depuis
 * le dépôt (Workers Builds), sans passer par GitHub Actions.
 *
 * Ce secours n'a de valeur que si, à tout moment, un dossier de worker est déployable TEL QUEL par
 * Cloudflare : racine = le dossier, commande = `npx wrangler deploy`, rien d'autre. Ce test le
 * vérifie en continu — sinon on découvrirait la panne du secours le jour où on en a besoin.
 *
 * Ce qu'on exige de chaque worker de secours :
 *  1. `wrangler.toml` présent à la racine du dossier (c'est ce que Cloudflare lit) ;
 *  2. `name` déclaré — il DOIT correspondre au nom du Worker sur le tableau de bord ;
 *  3. `main` déclaré ET le fichier existe (sinon le build Cloudflare échoue) ;
 *  4. aucun chemin qui sorte du dossier (`../`) — Cloudflare ne voit que la racine choisie ;
 *  5. les identifiants de KV/D1 sont FIGÉS dans le fichier (Cloudflare ne peut pas les provisionner
 *     à la volée comme le faisait notre workflow).
 *
 * node tests/deploy-secours-cloudflare.test.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
const fails = [];
const ok = (cond, msg) => (cond ? pass++ : fails.push(msg));

/* Les workers qui portent le domaine : ce sont eux qui doivent avoir un secours. */
const CRITIQUES = ['kdmc-router', 'kdmc-access'];

const dossiers = readdirSync(join(ROOT, 'services'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ROOT, 'services', e.name, 'wrangler.toml')))
  .map((e) => e.name);

ok(dossiers.length >= 10, `au moins 10 workers trouvés (trouvé ${dossiers.length})`);
for (const c of CRITIQUES) {
  ok(dossiers.includes(c), `worker critique « ${c} » présent avec son wrangler.toml`);
}

for (const nom of dossiers) {
  const dir = join(ROOT, 'services', nom);
  const toml = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
  /* on ignore les lignes commentées : un exemple en commentaire n'est pas une déclaration */
  const utile = toml.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

  const name = (utile.match(/^\s*name\s*=\s*"([^"]+)"/m) || [])[1];
  ok(!!name, `${nom} : « name » déclaré (Cloudflare le compare au nom du Worker)`);

  const main = (utile.match(/^\s*main\s*=\s*"([^"]+)"/m) || [])[1];
  ok(!!main, `${nom} : « main » déclaré`);
  if (main) {
    ok(existsSync(join(dir, main)), `${nom} : le fichier « ${main} » existe bien dans le dossier`);
    ok(!main.includes('..'), `${nom} : « main » ne sort pas du dossier (Cloudflare ne verrait pas)`);
  }

  /* Un id de KV/D1 laissé vide = le workflow le provisionnait ; Cloudflare, lui, ne peut pas. */
  /* Array.from : `matchAll` rend un itérateur — `.map` dessus n'existe pas sur Node 20 (CI). */
  for (const m of Array.from(utile.matchAll(/^\s*(id|database_id)\s*=\s*"([^"]*)"/gm))) {
    ok(m[2].trim().length > 0, `${nom} : « ${m[1]} » figé (non vide) — sinon le déploiement Cloudflare échoue`);
  }
}

/* Le secours ne remplace pas le chemin principal : on vérifie qu'il existe toujours. */
ok(existsSync(join(ROOT, '.github/workflows/deploy-kdmc-router.yml')),
  'le déploiement GitHub reste en place (le secours vient EN PLUS, il ne remplace pas)');

console.log(`Secours Cloudflare : ${pass} vérifications OK, ${fails.length} échec(s)`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
