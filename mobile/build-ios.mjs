/**
 * PRÉPARE une app web du domaine pour en faire une VRAIE app iPhone.
 *
 * Kevin 2026-08-13 : « Go tout. Va plus loin. »
 *
 * Ce que fait ce script (et RIEN d'autre — il ne compile pas, il prépare) :
 *   1. lit mobile/apps.json (source unique) ;
 *   2. copie le contenu web de l'app dans mobile/build/<id>/www ;
 *   3. écrit capacitor.config.json + package.json du projet ;
 *   4. fabrique l'icône 1024×1024 exigée par Apple (si `sharp` est dispo).
 *
 * Pourquoi le contenu est EMBARQUÉ et pas chargé depuis kd-mc.com : une app qui ne fait
 * qu'ouvrir un site est refusée par Apple (règle 4.2 « minimum functionality ») et ne
 * marcherait pas dans le métro. Ici l'app fonctionne hors-ligne.
 *
 * Usage :
 *   node mobile/build-ios.mjs                 → prépare TOUTES les apps
 *   node mobile/build-ios.mjs cmcteams        → une seule
 *   node mobile/build-ios.mjs --liste         → liste sans rien écrire
 *
 * La compilation Xcode se fait ensuite sur macOS (workflow ios-testflight.yml) :
 * l'agent n'a pas de Mac, la CI en a un.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, '..');
const CFG = JSON.parse(readFileSync(join(ICI, 'apps.json'), 'utf8'));

/* Motif simple (le même que la boîte à outils) — pas de dépendance pour 30 lignes. */
export function motifVersRegex(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') { re += '(?:[^/]+/)*'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if ('.+^${}()|[]\\?'.indexOf(c) >= 0) { re += '\\' + c; } else re += c;
  }
  return new RegExp('^' + re + '$');
}
export const correspond = (chemin, motifs) => motifs.some((m) => motifVersRegex(m).test(chemin));

/** Liste les fichiers d'un dossier qui correspondent aux motifs `include`. */
export function fichiersRetenus(base, motifs) {
  const out = [];
  const parcourir = (rel) => {
    const abs = join(base, rel);
    let st;
    try { st = statSync(abs); } catch { return; }
    if (st.isDirectory()) {
      /* On ne descend JAMAIS dans ces dossiers : ils feraient exploser le poids de l'app
         (et node_modules n'a rien à faire dans un paquet iOS). */
      if (/(^|\/)(node_modules|\.git|ios|android|build)$/.test(rel)) return;
      for (const e of readdirSync(abs)) parcourir(rel ? rel + '/' + e : e);
      return;
    }
    if (correspond(rel, motifs)) out.push(rel);
  };
  parcourir('');
  return out.sort();
}

/* Forme « paquet Java » exigée par Capacitor ET par Apple : lettres/chiffres/points,
   AUCUN tiret. Vérifié ICI (1 seconde, gratuit) plutôt que 46 s plus tard sur un runner
   macOS facturé 10× — le 1er essai est mort là-dessus (com.kd-mc.* refusé, run 31762220281). */
export function identifiantValide(id) {
  return typeof id === 'string' && /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(id);
}

function preparer(app) {
  if (!identifiantValide(app.bundleId))
    throw new Error(`${app.id} : identifiant Apple « ${app.bundleId} » invalide — forme paquet Java exigée `
      + `(lettres/chiffres/points, AUCUN tiret, chaque partie commence par une lettre). `
      + `Capacitor le refuse : « Must be in Java package form with no dashes ».`);
  const src = resolve(RACINE, app.webDir);
  if (!existsSync(join(src, 'index.html'))) throw new Error(`${app.id} : index.html introuvable dans ${app.webDir}`);

  const dest = join(ICI, 'build', app.id);
  rmSync(dest, { recursive: true, force: true });
  const www = join(dest, 'www');
  mkdirSync(www, { recursive: true });

  const fichiers = fichiersRetenus(src, app.include);
  let octets = 0;
  for (const f of fichiers) {
    const cible = join(www, f);
    mkdirSync(dirname(cible), { recursive: true });
    cpSync(join(src, f), cible);
    octets += statSync(cible).size;
  }

  /* Chemins ABSOLUS : l'app référence /CMCteams/tools/... (chemin du site GitHub Pages).
     Dans l'app native la racine est « / » → ces fichiers tomberaient dans le vide. On les
     duplique sous le préfixe attendu, SANS toucher au code de l'app (jamais régresser). */
  if (app.dupliquerSous) {
    for (const f of fichiers) {
      if (f === 'index.html') continue;
      const cible = join(www, app.dupliquerSous, f);
      mkdirSync(dirname(cible), { recursive: true });
      cpSync(join(src, f), cible);
      octets += statSync(cible).size;
    }
  }

  /* CONTRÔLE — chaque référence absolue de index.html doit exister dans www.
     Sans ça, l'app s'ouvre et un morceau ne charge JAMAIS, en silence. */
  const html = readFileSync(join(www, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|png|jpe?g|svg|webp|woff2?|json))"/g)]
    .map((m) => m[1]).filter((u, i, a) => a.indexOf(u) === i);
  const manquants = refs.filter((u) => !existsSync(join(www, u.replace(/^\//, '').split('?')[0])));
  if (manquants.length) {
    throw new Error(`${app.id} : ${manquants.length} fichier(s) référencé(s) en absolu ABSENT(S) de l'app — `
      + `elle s'ouvrirait avec un morceau mort : ` + manquants.slice(0, 5).join(', '));
  }

  /* Capacitor : contenu local (pas de server.url → pas de coquille vide, marche hors-ligne). */
  writeFileSync(join(dest, 'capacitor.config.json'), JSON.stringify({
    appId: app.bundleId,
    appName: app.name,
    webDir: 'www',
    ios: { contentInset: 'always', limitsNavigationsToAppBoundDomains: false },
    server: { androidScheme: 'https', iosScheme: 'https' },
  }, null, 2) + '\n');

  writeFileSync(join(dest, 'package.json'), JSON.stringify({
    name: 'kdmc-' + app.id,
    private: true,
    version: '1.0.0',
    devDependencies: { '@capacitor/cli': '^6.2.0' },
    dependencies: { '@capacitor/core': '^6.2.0', '@capacitor/ios': '^6.2.0' },
  }, null, 2) + '\n');

  return { id: app.id, fichiers: fichiers.length, ko: Math.round(octets / 1024), refs: refs.length, dest };
}

/* Exécuté en ligne de commande uniquement. Importé (par le garde-fou), ce fichier ne doit
   RIEN faire : sinon lancer un test reconstruirait les 3 apps au passage — effet de bord
   invisible et lent. */
const lanceEnDirect = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (!lanceEnDirect) { /* import : on n'expose que les fonctions */ }
else main();

function main() {
const args = process.argv.slice(2);
if (args.includes('--liste')) {
  for (const a of CFG.apps) console.log(`  ${a.id.padEnd(12)} ${a.bundleId.padEnd(22)} ${a.webDir}`);
  process.exit(0);
}
const cibles = args.length ? CFG.apps.filter((a) => args.includes(a.id)) : CFG.apps;
if (!cibles.length) { console.error('Aucune app connue parmi : ' + args.join(', ')); process.exit(1); }

for (const app of cibles) {
  const r = preparer(app);
  console.log(`✅ ${r.id} — ${r.fichiers} fichiers, ${r.ko} Ko, ${r.refs} référence(s) absolue(s) vérifiée(s) → ${r.dest.replace(RACINE + '/', '')}`);
}
}
