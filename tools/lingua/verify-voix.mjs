#!/usr/bin/env node
/* 🔊 GARDE — la voix ne doit plus « baisser toute seule » (Kevin 2026-08-13).

   CE QUI S'ÉTAIT PASSÉ : chaque phrase créait une NOUVELLE balise <audio>, jamais libérée.
   Mesuré au navigateur : 7 balises en 6 questions, 0 libérée. Sur iPhone, deux conséquences —
   Safari plafonne le nombre de sons chargés en même temps, et surtout il refuse de jouer une
   balise toute neuve créée hors d'un appui du doigt. L'app basculait alors sur la voix du
   téléphone, plus sourde : la voix « baissait » après quelques questions.

   Cette garde empêche le retour du même schéma. Elle ne remplace pas la mesure au navigateur :
   elle verrouille ce que la mesure a prouvé.

   Lance : node tools/lingua/verify-voix.mjs [lingua]
*/
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'lingua');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const errs = [];
const ko = (m) => errs.push(m);

/* 1. Combien de balises <audio> le code peut-il fabriquer ?
   Deux, pas plus : celle de toute l'app, et celle de l'atelier prononciation (qui doit
   analyser le son pour animer la bouche, donc ne peut pas partager la première). */
const creations = (app.match(/new Audio\(/g) || []).length;
if (creations > 2) ko('le code fabrique ' + creations + ' balises <audio> — il n\'en faut que 2 (l\'app + l\'atelier prononciation), sinon elles s\'accumulent et iPhone refuse de jouer les nouvelles');

/* 2. Les fabriques réutilisables existent et sont VRAIMENT utilisées (Déclaration ≠ Déploiement) */
const attendus = [
  ['la balise partagée existe', /function _ttsJoue\(/],
  ['la balise de l\'atelier prononciation existe', /function _pronJoue\(/],
  ['le mot de la question passe par la balise partagée', /var a=_ttsJoue\(SYNC_BASE\+"\/tts\?v="\+encodeURIComponent\(vr\.tts\|\|vid\)/],
  ['les phrases lues passent par la balise partagée', /var a=_ttsJoue\(SYNC_BASE\+"\/tts\?v="\+encodeURIComponent\(vid\)\+\(cfg/],
  ['la voix de Bee en gros plan passe par la balise partagée', /var a=_ttsJoue\(SYNC_BASE\+"\/tts\?v="\+encodeURIComponent\(vid\)\+\(vcfg/],
  ['l\'atelier prononciation réutilise la sienne', /var a=_pronJoue\(/],
];
attendus.forEach(([quoi, re]) => { if (!re.test(app)) ko('PAS BRANCHÉ : ' + quoi); });

/* 3. Rendre la ressource au téléphone : mettre en pause NE SUFFIT PAS, il faut vider l'adresse.
      Et la fonction qui le fait doit être APPELÉE, pas seulement écrite. */
if (!/function _ttsLibere\(/.test(app)) ko('aucune fonction ne libère la balise (pause seule ne rend pas la ressource)');
const appels = (app.match(/_ttsLibere\(\)/g) || []).length;
if (appels < 2) ko('_ttsLibere n\'est appelée que ' + (appels - 1) + ' fois hors de sa définition — du code mort ne libère rien');
if (!/removeAttribute\("src"\)/.test(app)) ko('la libération ne vide pas l\'adresse du son');

/* 4. Le garde-fou de la voix du téléphone doit avoir une FIN CERTAINE.
      Sur iPhone le signal de fin n'arrive pas toujours : sans butée, il réveillait la synthèse
      toutes les 9 s indéfiniment — et une synthèse restée active fait baisser tout le reste. */
if (!/_wsKAFin\s*=\s*setTimeout\(/.test(app)) ko('le garde-fou de la voix du téléphone n\'a pas de fin certaine (il peut tourner sans fin sur iPhone)');
if (!/clearTimeout\(_wsKAFin\)/.test(app)) ko('la butée du garde-fou n\'est jamais annulée (elle couperait une lecture suivante)');

/* 5. Quand ça bascule, on dit POURQUOI (règle « toujours détailler les erreurs ») */
const sansRaison = (app.match(/_voixCloudKO\(\)/g) || []).length;
if (sansRaison) ko(sansRaison + ' bascule(s) sur la voix du téléphone sans dire pourquoi');
['refus', 'lent', 'media'].forEach((r) => {
  if (!new RegExp('_voixCloudKO\\("' + r + '"\\)').test(app)) ko('raison « ' + r +' » jamais renseignée — on ne saura pas quoi corriger');
});

/* 6. La balise partagée ne doit JAMAIS être branchée au moteur audio : y brancher une balise
      détourne le son, et si le moteur s'endort sur iPhone, le son tombe (leçon déjà vécue). */
const lipsync = app.match(/createMediaElementSource\(([^)]*)\)/g) || [];
lipsync.forEach((m) => { if (/_ttsEl/.test(m)) ko('la balise partagée est branchée au moteur audio (' + m + ') — interdit : le son peut tomber'); });

console.log('🔊 Voix — ' + creations + ' balise(s) <audio> fabriquée(s) au maximum, '
  + (appels - 1) + ' libération(s) câblée(s), garde-fou borné, raisons de bascule renseignées.');
if (errs.length) { console.log('\n❌ ' + errs.length + ' problème(s) :'); errs.forEach((e) => console.log('   · ' + e)); }
else console.log('✅ Rien à signaler : la voix ne peut plus se dégrader question après question.');
process.exit(errs.length ? 1 : 0);
