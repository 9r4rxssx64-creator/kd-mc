#!/usr/bin/env node
/* 🖼️ GARDE — ne jamais demander une image qui n'existe pas (Kevin 2026-08-13, « vérifie tout auto réel »).

   POURQUOI : l'audit sur le VRAI domaine a trouvé 3 requêtes `404 /bee/v2/rig/arm.webp` à chaque
   affichage de la mascotte. Rien ne se voyait (un `onerror` retirait l'image en silence), mais
   le téléphone téléchargeait dans le vide — et surtout l'audit live passait au ROUGE, ce qui
   masque les vrais problèmes. Une erreur qu'on rattrape en silence reste une erreur.

   CE QUE ÇA VÉRIFIE : chaque image demandée par l'app existe bien sur le disque, y compris
   celles construites dynamiquement (`MASC() + '/rig/xxx.webp'`) : on essaie alors TOUS les
   dossiers de mascotte réellement possibles.

   Lance : node tools/lingua/verify-assets.mjs
*/
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'lingua');
const app = readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* Les dossiers de mascotte réellement livrés (bee, bee/v2, donkey…) : tout chemin construit
   avec MASC() doit exister dans CHACUN d'eux, sinon un utilisateur tombera sur le trou. */
const dossiersMascotte = [];
['bee', 'donkey'].forEach((m) => {
  const base = path.join(ROOT, m);
  if (!existsSync(base)) return;
  dossiersMascotte.push(m);
  readdirSync(base, { withFileTypes: true }).forEach((e) => {
    if (e.isDirectory() && /^v\d+$/.test(e.name)) dossiersMascotte.push(m + '/' + e.name);
  });
});

const manquants = [];
const vus = new Set();
const verifie = (rel, ou) => {
  const cle = rel + '|' + ou;
  if (vus.has(cle)) return; vus.add(cle);
  if (!existsSync(path.join(ROOT, rel))) manquants.push({ rel, ou });
};

/* 1. chemins construits sur le dossier de la mascotte : '"+M+"/rig/base.webp" */
[...app.matchAll(/\+\s*M\s*\+\s*["']\/([\w./-]+\.(?:webp|png|svg|jpg|mp4))["']/g)].forEach((m) => {
  dossiersMascotte.forEach((d) => verifie(d + '/' + m[1], 'mascotte ' + d));
});
/* 1 bis. couches animées déclarées par mascotte (RIG_PIECES) : chaque morceau annoncé doit
   exister — c'est la liste qui pilote ce que l'app demande vraiment. */
const blocPieces = (app.match(/var RIG_PIECES\s*=\s*\{([\s\S]*?)\};/) || [])[1] || '';
[...blocPieces.matchAll(/"([\w/]+)"\s*:\s*\[([^\]]*)\]/g)].forEach((m) => {
  [...m[2].matchAll(/"([\w-]+)"/g)].forEach((p) => verifie(m[1] + '/rig/' + p[1] + '.webp', 'RIG_PIECES ' + m[1]));
});
/* 2. chemins écrits en clair dans le JS et le HTML (src="…", url(…)) */
const enClair = (txt, ou) => {
  [...txt.matchAll(/(?:src|href)\s*=\s*["'](?!https?:|data:|#|\/\/)([\w./-]+\.(?:webp|png|svg|jpg|mp4|js|css|webmanifest))["']/g)]
    .forEach((m) => verifie(m[1].replace(/^\.\//, ''), ou));
  [...txt.matchAll(/url\(\s*["']?(?!https?:|data:)([\w./-]+\.(?:webp|png|svg|jpg))["']?\s*\)/g)]
    .forEach((m) => verifie(m[1].replace(/^\.\//, ''), ou));
};
enClair(html, 'index.html');
enClair(app, 'app.js');
/* 3. la liste de mise en cache hors-ligne du service worker : un fichier absent la fait
      échouer en entier (addAll est tout-ou-rien) → l'app ne marche plus hors connexion */
const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const listeSW = (sw.match(/var ASSETS\s*=\s*\[([\s\S]*?)\];/) || [])[1] || '';
[...listeSW.matchAll(/["']\.\/([^"']+)["']/g)].forEach((m) => { if (m[1]) verifie(m[1], 'sw.js (cache hors-ligne)'); });

console.log('🖼️  Images et fichiers demandés par l\'app — ' + vus.size + ' chemin(s) contrôlé(s)'
  + ' · mascottes : ' + dossiersMascotte.join(', '));
if (manquants.length) {
  console.log('\n❌ ' + manquants.length + ' fichier(s) demandé(s) mais ABSENT(s) — chaque affichage déclenche un 404 :');
  manquants.forEach((m) => console.log('   · ' + m.rel + '   (demandé par ' + m.ou + ')'));
  console.log('\nSoit on ajoute le fichier, soit on retire la demande. Un `onerror` qui masque le trou ne suffit pas.');
} else console.log('✅ Aucun fichier demandé dans le vide.');
process.exit(manquants.length ? 1 : 0);
