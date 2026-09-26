/* GARDE — UN PAQUET QUE PERSONNE N'UTILISE PEUT TUER TOUTE LA CHAÎNE (26.09.2026)
 *
 * Mesuré ce jour : `npm install` échouait sur « Cannot read properties of null (reading
 * 'edgesOut') » — sur la machine GitHub comme dans le conteneur de l'agent. Cause racine :
 * le package.json de la RACINE déclarait `@vitest/coverage-v8` en ^4, alors que
 *   · la racine n'a AUCUNE configuration vitest et son `test:coverage` est un script Node ;
 *   · vitest vit dans les SOUS-PROJETS, chacun avec son package.json (apex-ai/v13 en ^3,
 *     messaging-app en ^5) — la racine n'en avait pas besoin une seule seconde.
 * Ce paquet orphelin, dont la plage flottait (^4), a suivi une publication en amont et a
 * cassé l'installation. Conséquence mesurée : 82 workflows font `npm i` → 82 robots morts,
 * dont le SEUL canal qui prouve à Kevin ce que son domaine sert vraiment. Et rien n'était
 * rouge : aucun garde ne regardait les dépendances de la racine.
 *
 * LA RÈGLE : la racine ne déclare que ce qu'elle utilise. Un paquet non utilisé n'apporte
 * rien et peut tout casser. Une exception se justifie PAR ÉCRIT ci-dessous, jamais en silence.
 *
 * node tests/verify-paquets-racine.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/* Paquets gardés à la racine sans y être importés — chacun avec SA raison. */
const EXCEPTIONS = {
  'fluent-ffmpeg': "cité comme pré-requis par tools/video/make-demo.js (ligne 18) sans y être importé : "
    + "l'outil vidéo passe par @ffmpeg-installer/ffmpeg. Gardé parce qu'il n'est PAS la cause de la panne du "
    + "26.09 — mesuré : `npm install` réussit avec lui (150 paquets, sortie 0). À retirer le jour où "
    + "make-demo.js est repris, pas au milieu d'une réparation.",
};

let pass = 0;
const fails = [];
const ok = (c, m) => (c ? pass++ : fails.push(m));

/* Les dossiers qui ont LEUR propre package.json ne comptent pas : ils installent
   leurs paquets eux-mêmes (c'est exactement ce que la racine avait oublié). */
/* Attention : ne PAS sauter « build ». Écrit d'abord avec `build` dans la liste, le garde
   déclarait `terser` inutilisé alors que tools/build/minify-html.cjs le require — un garde
   qui ne regarde pas partout accuse du code sain (leçon #331). */
const SAUTE = /(^|\/)(node_modules|\.git|vendor|_archive[^/]*|coverage|dist|archives)(\/|$)/;
const sousProjets = new Set();
(function reperer(rel) {
  const abs = join(ROOT, rel);
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (!e.isDirectory() || SAUTE.test(r)) continue;
    if (existsSync(join(ROOT, r, 'package.json'))) { sousProjets.add(r + '/'); continue; }
    reperer(r);
  }
})('');

/* Tout le code de la RACINE (hors sous-projets), en un seul texte. */
const morceaux = [JSON.stringify(pkg.scripts || {})];
(function ramasser(rel) {
  const abs = join(ROOT, rel);
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (SAUTE.test(r)) continue;
    if (e.isDirectory()) { if (![...sousProjets].some((s) => (r + '/').startsWith(s))) ramasser(r); continue; }
    if (!/\.(mjs|cjs|js|ts|json|yml|yaml|sh)$/.test(e.name)) continue;
    /* JAMAIS un package.json ni un verrou : ils contiennent la déclaration elle-même, donc
       le motif se satisfait tout seul. Trouvé par sabotage : `left-pad` ajouté au hasard
       passait VERT. Un garde qui se prouve à lui-même ne prouve rien. */
    if (/^package(-lock)?\.json$/.test(e.name) || e.name === 'npm-shrinkwrap.json') continue;
    if ([...sousProjets].some((s) => r.startsWith(s))) continue;
    try { if (statSync(abs + '/' + e.name).size < 3e6) morceaux.push(readFileSync(join(ROOT, r), 'utf8')); } catch {}
  }
})('');
const TOUT = morceaux.join('\n');

const declares = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
ok(Object.keys(declares).length > 0, 'la racine ne déclare plus aucun paquet (suspect)');

for (const nom of Object.keys(declares)) {
  if (EXCEPTIONS[nom]) { pass++; continue; }
  /* « utilisé » = importé/requis par son nom, ou nommé dans une commande npm de la racine. */
  const n = nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const utilise = new RegExp(
    `(from\\s+['"]${n}(/[^'"]*)?['"]` +
    `|require\\(\\s*['"]${n}(/[^'"]*)?['"]` +
    `|import\\(\\s*['"]${n}(/[^'"]*)?['"]` +
    `|node_modules/${n}[/'"\\s]` +
    `|\\bnpx +${n}\\b` +
    `|\\b${n}\\b[^\\n]{0,40}(--|run |install|exec))`,
  ).test(TOUT);
  ok(utilise,
    `${nom} est déclaré à la racine et n'y est utilisé NULLE PART : un paquet orphelin ne sert à rien et peut casser \`npm install\` pour les 82 workflows (c'est ce qui est arrivé le 26.09 avec @vitest/coverage-v8). Le supprimer, ou écrire sa raison dans EXCEPTIONS.`);
}

/* Le piège précis du 26.09 : un paquet de l'écosystème vitest/vite à la RACINE alors
   que vitest n'y est ni déclaré ni configuré. */
const vitestRacine = Object.keys(declares).filter((n) => /^(vitest|@vitest\/|@vitejs\/)/.test(n));
const aUneConfig = ['vitest.config.js', 'vitest.config.mjs', 'vitest.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.ts']
  .some((f) => existsSync(join(ROOT, f)));
ok(vitestRacine.length === 0 || (aUneConfig && !!declares.vitest),
  `la racine déclare ${vitestRacine.join(', ')} sans vitest configuré : vitest vit dans les sous-projets (chacun son package.json) — à la racine, ce paquet a cassé \`npm install\` le 26.09`);

console.log(`Paquets de la racine : ${pass} vérifications OK, ${fails.length} échec(s)`);
console.log(`  (${Object.keys(declares).length} paquet(s) déclaré(s) · ${sousProjets.size} sous-projet(s) avec leur propre package.json)`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
