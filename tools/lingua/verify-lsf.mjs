#!/usr/bin/env node
/* 🤟 GARDE — le cours de langue des signes ne peut pas se mettre à mentir.

   Ce qu'on protège, dans l'ordre d'importance :

   1. AUCUN SIGNE INVENTÉ. Chaque mot du cours doit porter l'adresse d'une vraie vidéo, sa
      page d'origine et une licence LIBRE. Un signe faux est pire que pas de signe : une
      personne sourde le verrait immédiatement, et l'élève apprendrait un geste qui ne veut
      rien dire.
   2. LA QUESTION NE DONNE JAMAIS LA RÉPONSE. Pour ce cours la « traduction » d'un mot est
      le mot lui-même : sans garde, l'app afficherait « banane » et demanderait « banane ».
   3. RIEN NE SE PRONONCE. C'est écrit à l'élève, donc ça doit être vrai — y compris pour
      la mascotte.
   4. C'EST BRANCHÉ. Un cours déclaré mais jamais atteignable ne sert à personne
      (Déclaration ≠ Déploiement).

   node tools/lingua/verify-lsf.mjs [lingua]
*/
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'lingua');
const lire = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const errs = []; const ko = (m) => errs.push(m);

const dataLsf = lire('data-lsf.js');
const app = lire('app.js');
const html = lire('index.html');
const sw = lire('sw.js');

/* --- 1. Les signes eux-mêmes --- */
const LIBRES = /^(cc0|cc[- ]by([- ]sa)?([- ]\d(\.\d)?)?|public domain|pd-|gfdl)/i;
function extrait(nom) {
  const m = dataLsf.match(new RegExp('var ' + nom + ' = (\\{.*?\\});\\n', 's'));
  if (!m) { ko('impossible de lire ' + nom + ' dans data-lsf.js'); return {}; }
  try { return JSON.parse(m[1]); } catch (e) { ko(nom + ' illisible : ' + e.message); return {}; }
}
const SIGNES = extrait('LSF_SIGNES');
const ALPHA = extrait('LSF_ALPHABET');

const nb = Object.keys(SIGNES).length;
if (nb < 100) ko('seulement ' + nb + ' signes — la récolte a dû échouer');
let sansUrl = 0, sansPage = 0, licenceKo = [], sansAuteur = 0, nbVariantes = 0;
/* On contrôle AUSSI les variantes (le même mot signé par une autre personne). Elles sont
   affichées dans le dictionnaire : une variante mal licenciée serait donc bien publiée.
   C'est exactement le trou qu'un sabotage a révélé — la garde ne regardait que le signe
   principal et laissait passer une licence « tous droits réservés » glissée dans une variante. */
function controle(mot, s, quoi) {
  if (!s.u || !/^https:\/\/upload\.wikimedia\.org\//.test(s.u)) sansUrl++;
  if (!s.p || !/^https:\/\/commons\.wikimedia\.org\//.test(s.p)) sansPage++;
  if (!s.l || !LIBRES.test(String(s.l).trim())) licenceKo.push(mot + quoi + ' (' + (s.l || 'sans licence') + ')');
  if (!s.a) sansAuteur++;
}
Object.entries(SIGNES).forEach(([mot, s]) => {
  controle(mot, s, '');
  (s.autres || []).forEach((v, i) => { nbVariantes++; controle(mot, v, ' [variante ' + (i + 1) + ']'); });
});
if (sansUrl) ko(sansUrl + ' signe(s) sans vidéo d\'origine — un signe sans source est un signe inventé');
if (sansPage) ko(sansPage + ' signe(s) sans page d\'origine — impossible de vérifier ni de créditer');
if (licenceKo.length) ko(licenceKo.length + ' signe(s) sous licence NON libre : ' + licenceKo.slice(0, 3).join(', '));
if (sansAuteur > nb * 0.1) ko(sansAuteur + ' signe(s) sans auteur — les licences CC BY exigent de citer');

const nl = Object.keys(ALPHA).length;
if (nl !== 26) ko('l\'alphabet dactylologique a ' + nl + ' lettres au lieu de 26');
Object.entries(ALPHA).forEach(([k, a]) => { if (!a.u || !a.p) ko('lettre ' + k + ' sans source'); });

/* Les mots du cours doivent TOUS avoir leur signe : un mot sans vidéo n'a rien à faire
   dans une leçon (l'élève verrait un écran vide et ne saurait pas quoi apprendre). */
const mCur = dataLsf.match(/var CURRICULUM_LSF = (\[.*?\]);\n/s);
let motsLecon = 0, orphelins = [];
if (!mCur) ko('CURRICULUM_LSF introuvable');
else { try {
  JSON.parse(mCur[1]).forEach((u) => (u.L || []).forEach((le) => (le.w || []).forEach((fr) => {
    motsLecon++; if (!SIGNES[fr]) orphelins.push(fr);
  })));
} catch (e) { ko('CURRICULUM_LSF illisible : ' + e.message); } }
if (orphelins.length) ko(orphelins.length + ' mot(s) en leçon SANS vidéo de signe : ' + orphelins.slice(0, 5).join(', '));

/* --- 2. La question ne donne pas la réponse --- */
const gardes = [
  ['la reconnaissance d\'un signe existe', /function estSigne\(/],
  ['on sait reconnaître un cours en signes', /function coursSignes\(/],
  ['le choix multiple force « quel est ce signe ? »', /function makeMC\([^)]*\)\{\s*if\(estSigne\(w\)\) mode="mc_fr";/],
  ['la saisie force « écris le mot français »', /function makeType\([^)]*\)\{[^}]*if\(estSigne\(w\)\) dir="toFr";/],
  ['on ne fait pas recopier une étiquette ponctuée (« donner, rendre »)', /function signeAEcrire\(w\)\{/],
  ['et cette règle est appliquée', /if\(estSigne\(w\)&&!signeAEcrire\(w\)\) return makeMC\(/],
  ['le jeu de paires est remplacé (il montrerait deux fois le même mot)', /if\(ws\.some\(estSigne\)\) return makeMC\(/],
  ['on ne demande pas de PRONONCER un signe', /function makeSpeak\(w\)\{[^}]*if\(estSigne\(w\)\) return makeType\(w,"toFr"\)/s],
  ['la question affiche une vidéo', /function signeHTML\(w\)\{/],
  ['la vidéo est jouée et surveillée', /function brancheSigne\(/],
  ['le crédit du signe est affiché', /function signeCreditHTML\(/],
];
gardes.forEach(([quoi, re]) => { if (!re.test(app)) ko('PAS EN PLACE : ' + quoi); });

/* La vidéo doit être branchée dans les DEUX types d'exercices, pas seulement déclarée. */
if ((app.match(/signeHTML\(ex\.w\)/g) || []).length < 2) ko('la vidéo n\'est branchée que dans un seul type d\'exercice');
if ((app.match(/brancheSigne\(w\)/g) || []).length < 2) ko('la lecture de la vidéo n\'est branchée que dans un seul type d\'exercice');

/* --- 3. Rien ne se prononce --- */
if (!/function _lsSpeak\([^)]*\)\{[^}]*if\(coursSignes\(\)\) return;/s.test(app))
  ko('la voix des leçons n\'est pas coupée pour les signes — elle donnerait la réponse');
if (!/function beeSay\([^)]*\)\{[^}]*if\(coursSignes\(\)\) return;/.test(app))
  ko('la mascotte parle encore dans un cours en signes');
if (!/if\(!coursSignes\(\)\) speakLang\(String\(text\)/.test(app))
  ko('la mascotte parle encore quand elle pose une question');
if (!/if\(!coursSignes\(\) && !\(first&&first\.audio\)\)/.test(app))
  ko('la leçon est encore annoncée à voix haute (« Écoute bien » n\'a aucun sens ici)');
/* Ce qui est promis à l'élève doit être tenu. */
if (!/Rien ne se prononce ici/.test(app)) ko('la note d\'honnêteté ne dit plus que rien ne se prononce');
if (!/langue à part entière/.test(app)) ko('la note ne dit plus que la LSF est une langue à part entière');
if (!/rien n\\'est inventé/.test(app)) ko('la note ne dit plus que rien n\'est inventé');

/* --- 4. C'est branché de bout en bout --- */
if (!/<script src="data-lsf\.js"><\/script>/.test(html)) ko('data-lsf.js n\'est pas chargé par la page');
if (!/COURSES\.lsf = \{/.test(dataLsf)) ko('le cours n\'est pas ajouté à la liste des cours');
if (!/\.\/data-lsf\.js/.test(sw)) ko('data-lsf.js n\'est pas dans le cache hors-ligne');
[['lsfabc', 'vLsfAbc'], ['lsfdico', 'vLsfDico']].forEach(([vue, fn]) => {
  if (!new RegExp('VIEW==="' + vue + '"').test(app)) ko('la vue ' + vue + ' n\'est pas routée');
  if (!new RegExp('function ' + fn + '\\(').test(app)) ko(fn + ' n\'existe pas');
  if (!new RegExp('go\\("' + vue + '"\\)').test(app)) ko('rien ne mène à la vue ' + vue + ' (elle serait inatteignable)');
});
/* Le service worker ne doit pas s'interposer sur les vidéos : Safari refuserait de les lire. */
if (!/req\.headers\.get\("range"\)/.test(sw)) ko('le service worker intercepte les vidéos (Safari refuserait de les lire)');
if (!/origin!==self\.location\.origin/.test(sw)) ko('le service worker intercepte les fichiers d\'autres sites');
/* Le CSS de la vidéo doit exister, sinon elle s'affiche à la mauvaise taille. */
['.q-signe', '.signe-v', '.abc-grid', '.lsf-carte'].forEach((c) => {
  if (!html.includes(c + '{')) ko('style manquant : ' + c);
});

/* L'alphabet : ce qu'on promet doit être tenu, et ce qu'on récolte doit être montré. */
if (/var LSF_EXOS = \[\{/.test(dataLsf) && !/LSF_EXOS/.test(app))
  ko('les vidéos d\'entraînement à l\'alphabet sont récoltées mais jamais affichées');
if (!/aucune image libre ne les montre/.test(app))
  ko('la page de l\'alphabet ne dit plus que les accents et les chiffres manquent — l\'élève croirait que 26 lettres, c\'est tout');

/* Les variantes ne servent à rien si elles ne sont pas montrées (Déclaration ≠ Déploiement). */
if (nbVariantes && !/signeVariantesHTML\(/.test(app))
  ko(nbVariantes + ' variante(s) de signe stockées mais jamais affichées — données mortes');

console.log('🤟 LSF — ' + nb + ' signes attestés (0 inventé), ' + nl + ' lettres d\'alphabet, '
  + motsLecon + ' mots en leçon, ' + nbVariantes + ' seconds signeurs, tous avec leur vidéo, leur licence et leur source.');
if (errs.length) { console.log('\n❌ ' + errs.length + ' problème(s) :'); errs.forEach((e) => console.log('   · ' + e)); }
else console.log('✅ Rien à signaler : aucun signe inventé, aucune question qui donne sa réponse, aucun son.');
process.exit(errs.length ? 1 : 0);
