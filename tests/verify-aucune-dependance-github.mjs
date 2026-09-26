#!/usr/bin/env node
/* ============================================================================
 * GARDE — « le site publié ne dépend plus du dépôt GitHub »
 * ----------------------------------------------------------------------------
 * Kevin 2026-09-15 : « passe tout en privé, personne ne doit voir le code ;
 * seuls les sites restent accessibles. »
 *
 * Le jour où le dépôt passe en privé, DEUX adresses meurent d'un coup :
 *   · 9r4rxssx64-creator.github.io/CMCteams/...   (GitHub Pages s'éteint)
 *   · raw.githubusercontent.com/9r4rxssx64/...    (le brut devient 404)
 *
 * Toute page publiée qui cite l'une des deux se met à pointer dans le vide —
 * une image d'aperçu qui ne s'affiche plus (leçon #m095 : sans og:image,
 * Facebook affiche un rectangle gris), un plan de site qui envoie Google sur
 * des 404, ou pire : un appel réseau qui échoue en silence.
 *
 * MESURÉ le 19.09 avant correction : 2 fichiers publiés citaient encore
 * github.io — shops/sitemap.xml (12 adresses) et shops/la-detente/index.html
 * (3 adresses : l'image d'aperçu Twitter, la fiche produit Schema.org et le
 * fil d'Ariane). Corrigés vers le domaine ; cette garde les empêche de revenir.
 *
 * Elle scanne LE PAQUET RÉELLEMENT PUBLIÉ (pas le dépôt) : ce qui n'est pas
 * dans le paquet n'est pas en ligne, donc ne compte pas.
 * ========================================================================== */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const PAQUET = 'services/kdmc-router/pages-upload';
const INTERDIT = /9r4rxssx64-creator\.github\.io|raw\.githubusercontent\.com\/9r4rxssx64/;
const LISIBLES = /\.(html|htm|js|mjs|cjs|json|xml|webmanifest|css|txt|svg)$/i;

if (!existsSync(join(PAQUET, '__paquet.txt'))) {
  console.log('… paquet absent : je le fabrique (une fois)');
  execFileSync('node', ['services/kdmc-router/prepare-secours.mjs', '--pages'], { stdio: 'ignore' });
}

const fautifs = [];
let fichiers = 0;
function parcourir(dir) {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { parcourir(p); continue; }
    if (!LISIBLES.test(nom)) continue;
    fichiers++;
    if (st.size > 8 * 1024 * 1024) continue;   // gros bundles : lus quand même plus bas si < 8 Mo
    let t; try { t = readFileSync(p, 'utf8'); } catch { continue; }
    const n = (t.match(new RegExp(INTERDIT.source, 'g')) || []).length;
    if (n) fautifs.push({ f: p.slice(PAQUET.length + 1), n });
  }
}
parcourir(PAQUET);

/* Refuser de conclure plutôt que rassurer à tort (leçon #103, le faux vert) :
   un paquet vide passerait « au vert » sans avoir rien vérifié. */
if (fichiers < 500) {
  console.error(`❌ MESURE IMPOSSIBLE : seulement ${fichiers} fichiers lisibles dans le paquet.`);
  console.error('   Le paquet est incomplet — je ne conclus rien.');
  process.exit(2);
}

console.log(`Paquet publié : ${fichiers} fichiers lisibles examinés`);
if (fautifs.length) {
  console.error(`\n❌ ${fautifs.length} fichier(s) PUBLIÉ(S) dépendent encore du dépôt GitHub :`);
  for (const { f, n } of fautifs.sort((a, b) => b.n - a.n)) console.error(`   · ${f}  (${n} adresse(s))`);
  console.error('\n   Le jour où le dépôt passe en privé, ces adresses renvoient 404.');
  console.error('   À remplacer par l\'adresse du domaine (ex. https://shops.kd-mc.com/...).');
  process.exit(1);
}
console.log('✅ 0 dépendance à github.io / raw.githubusercontent — le dépôt peut passer en privé.');
