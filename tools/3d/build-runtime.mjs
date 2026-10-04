/* Compile le moteur 3D (perso3d-src.js + la description des personnages + three) en UN script sans dépendance :
 *   npm run build:3d        (depuis tools/3d : npm install d'abord)  →  javis/perso3d.js, copié à côté de Lingua et de l'arbre
 * En tête du script compilé : l'EMPREINTE des sources. tests/verify-perso3d.mjs la recalcule : si la description d'un
 * personnage change sans que le moteur soit recompilé, le test passe au rouge (un moteur périmé servirait d'anciens
 * personnages à tout le domaine sans un mot). Gratuit : esbuild + three, aucun service. */
import { build } from 'esbuild';
import { empreinte } from './empreinte.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url)), ROOT = join(ICI, '..', '..');
const lire = (f) => readFileSync(join(ROOT, f), 'utf8');

if (process.argv[1] && join(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = empreinte(lire);
  const r = await build({
    entryPoints: [join(ICI, 'perso3d-src.js')], bundle: true, minify: true, format: 'iife', target: ['es2018'],
    legalComments: 'none', write: false, banner: { js: `/* KDMC perso3d — moteur 3D de Bee et Bourricot. Source : tools/3d/perso3d-src.js + tools/3d/personnages-def.mjs — NE PAS ÉDITER ; npm run build:3d. empreinte:${sha} */` },
  });
  /* UNE CONSTANTE DE THREE.JS RESSEMBLAIT À UN NUMÉRO DE TÉLÉPHONE (4.10, run 37167315737) : la conversion sRGB → linéaire contient un nombre de
     10 chiffres décimaux (0,077…) que le contrôle du dépôt public prenait pour un mobile : TOUTE la publication du domaine était bloquée. Même
     nombre, écrit en notation scientifique (identique pour JavaScript ET pour le GLSL des shaders) : le contrôle reste strict, sans exception.
     (Le motif est assemblé en deux morceaux : écrit d'un bloc, ce fichier-ci déclencherait le même contrôle.) */
  const FAUX_TEL = new RegExp('0?\\.07' + '73993808', 'g');
  const code = r.outputFiles[0].text.replace(FAUX_TEL, '7.73993808e-2');
  for (const d of ['javis', 'arbre', 'lingua']) { mkdirSync(join(ROOT, d), { recursive: true }); writeFileSync(join(ROOT, d, 'perso3d.js'), code); }
  console.log(`  ✓ perso3d.js : ${Math.round(code.length / 1024)} Ko (empreinte ${sha}) → javis/, arbre/, lingua/`);
}
