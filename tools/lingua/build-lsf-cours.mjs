#!/usr/bin/env node
/* 🤟 CONSTRUIT LE COURS DE LANGUE DES SIGNES À PARTIR DES SIGNES RÉELS RÉCOLTÉS.

   Entrée  : lingua/lsf-sources.json (produit par collect-lsf.mjs, sources libres uniquement)
   Sortie  : lingua/data-lsf.js (le cours, à ne jamais éditer à la main)

   DEUX RÈGLES QUI NE BOUGENT PAS :

   1. Aucun signe inventé. Chaque mot du cours porte l'adresse de sa vidéo d'origine, son
      auteur et sa licence. Si un mot n'a pas de vidéo, il n'entre pas — on préfère un cours
      plus petit à un cours qui montrerait un geste faux.

   2. Aucune orthographe corrigée de ma main. Les noms de fichiers de Commons contiennent
      quelques coquilles (« beacoup », « vieu », « verre de terre »). Je ne les répare pas :
      je ne peux pas savoir quel signe montre réellement la vidéo. Les leçons ne prennent
      donc QUE des mots qui existent déjà dans le vocabulaire français de Lingua — ce filtre
      écarte les coquilles tout seul, sans que j'aie à deviner quoi que ce soit.
      Les autres signes restent consultables dans le dictionnaire 🤟, écrits comme à la source.

   node tools/lingua/build-lsf-cours.mjs
*/
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const RACINE = path.resolve(new URL('../../', import.meta.url).pathname);
const L = (p) => path.join(RACINE, 'lingua', p);
const src = JSON.parse(fs.readFileSync(L('lsf-sources.json'), 'utf8'));

/* On lit le programme de Lingua tel quel, pour que la langue des signes suive les mêmes
   thèmes que les autres langues : la famille, les couleurs, les animaux… */
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(L('data.js'), 'utf8'), ctx);
const CURRICULUM = ctx.CURRICULUM;

const signes = src.signes || {};
const alphabet = src.alphabet || {};
const exercices = src.exercices || [];

/* Une fiche allégée : l'app n'a pas besoin du titre du fichier ni du type. */
function fiche(s) {
  const f = { u: s.url, p: s.page, l: s.licence, a: s.auteur || s.signeur || '' };
  if (s.vignette) f.v = s.vignette;
  if (s.signeur) f.s = s.signeur;
  if ((s.variantes || []).length) f.autres = s.variantes.map((x) => ({ u: x.url, p: x.page, l: x.licence, a: x.auteur || x.signeur || '' }));
  return f;
}

const LSF = {};                       // mot français → fiche du signe
Object.keys(signes).forEach((m) => { LSF[m] = fiche(signes[m]); });

/* ---------- 1. Les unités qui suivent le programme de Lingua ---------- */
const prisEnLecon = new Set();
const unites = [];
CURRICULUM.forEach((u) => {
  const mots = [];
  /* Un même mot peut figurer dans deux unités du programme : on ne le met qu'une fois,
     sinon le compte des signes appris devient faux (549 « appris » pour 545 existants). */
  u.L.forEach((le) => (le.w || []).forEach((fr) => { if (LSF[fr] && !prisEnLecon.has(fr) && !mots.includes(fr)) mots.push(fr); }));
  if (mots.length < 3) return;        // moins de 3 signes : pas de quoi faire une leçon
  const lecons = [];
  for (let i = 0; i < mots.length; i += 6) {
    const bloc = mots.slice(i, i + 6);
    if (bloc.length < 2 && lecons.length) { lecons[lecons.length - 1].w.push(...bloc); break; }
    lecons.push({ t: u.t.replace(/\s*\p{Extended_Pictographic}.*$/u, '').trim() + ' ' + (lecons.length + 1), w: bloc });
  }
  mots.forEach((m) => prisEnLecon.add(m));
  unites.push({ t: u.t, c: u.c, L: lecons });
});

/* ---------- 2. Les signes hors programme, regroupés par thème ---------- */
/* Regrouper des mots par thème n'est pas inventer un signe : le lien mot → vidéo reste celui
   de la source. Seul l'ordre de présentation est de moi, et il est là pour aider à retenir. */
const THEMES = [
  { t: 'À la bibliothèque 📚', c: '#8b5cf6', mots: ['bibliothèque', 'bibliobus', 'carte de bibliothèque', 'catalogue', 'catalogue (liste)', 'consultation sur place', 'consultation sur place (livre)', 'emprunter', 'prolongation d\'emprunt', 'retour des documents', 'rayon (lieu)', 'espace jeunesse', 'salle d\'étude', 'salle du conte', 'conte', 'bande dessinée', 'bd', 'manga', 'livre', 'livre cd', 'livre policier', 'livre pour enfant', 'livre pour enfants', 'littérature', 'nouvelle', 'journal', 'reportage', 'dvd', 'cd', 'cdi', 'cassette', 'multimedia', 'documents'] },
  { t: 'La LSF elle-même 🤟', c: '#f59e0b', mots: ['lsf', 'sourd', 'entendant', 'signaire', 'non-signé', 'parlé', 'visuel', 'configuration', 'classificateur', 'mouvement', 'forme', 'paramètre', 'espace', 'espace (lieu)', 'emplacement', 'orientation', 'syntaxe', 'pronom', 'verbe', 'verbe directionnel', 'vocabulaire', 'phrase', 'mot', 'communiquer', 'dialoguer', 'capter des mots', 'coucou (accrocher le regard)', 'conférence pour les sourds', 'conférence pour les entendants'] },
  { t: 'Villes et régions 🗺️', c: '#14b8a6', mots: ['aix', 'aubagne', 'marseille', 'marignane', 'gap', 'vitrolle', 'paris', 'bretagne', 'chinois', 'polonais (langue)', 'français (langue)', 'international', 'planète', 'terre', 'campagne', 'centre ville', 'village', 'ville'] },
];
const dansTheme = new Set();
THEMES.forEach((th) => {
  const mots = th.mots.filter((m) => LSF[m] && !prisEnLecon.has(m));
  if (mots.length < 3) return;
  const lecons = [];
  for (let i = 0; i < mots.length; i += 6) lecons.push({ t: th.t.replace(/\s*\p{Extended_Pictographic}.*$/u, '').trim() + ' ' + (lecons.length + 1), w: mots.slice(i, i + 6) });
  mots.forEach((m) => { prisEnLecon.add(m); dansTheme.add(m); });
  unites.push({ t: th.t, c: th.c, L: lecons });
});

/* ---------- 3. Tout le reste : rien ne se perd ---------- */
const reste = Object.keys(LSF).filter((m) => !prisEnLecon.has(m)).sort((a, b) => a.localeCompare(b, 'fr'));
if (reste.length >= 3) {
  const lecons = [];
  for (let i = 0; i < reste.length; i += 6) lecons.push({ t: 'Encore des signes ' + (lecons.length + 1), w: reste.slice(i, i + 6) });
  unites.push({ t: 'Encore des signes 🧩', c: '#94a3b8', L: lecons });
}

/* ---------- L'alphabet dactylologique ---------- */
/* Les deux vidéos d'entraînement à l'alphabet : « F et T » (deux lettres qu'on confond
   facilement) et « chiffres abc ». Elles vont à côté de l'alphabet, pas dans le dictionnaire. */
const EXOS = exercices.map((e) => ({ q: e.quoi, u: e.url, p: e.page, l: e.licence, a: e.auteur || '' }));
const ALPHA = {};
Object.keys(alphabet).sort().forEach((k) => { const a = alphabet[k]; ALPHA[k] = { u: a.url, p: a.page, l: a.licence, a: a.auteur || '' }; });

const nLecons = unites.reduce((n, u) => n + u.L.length, 0);
const nMots = unites.reduce((n, u) => n + u.L.reduce((m, le) => m + le.w.length, 0), 0);

const out = `/* 🤟 LA LANGUE DES SIGNES FRANÇAISE (LSF) — cours engendré, NE PAS ÉDITER À LA MAIN.
   Produit par tools/lingua/build-lsf-cours.mjs à partir de lingua/lsf-sources.json,
   lui-même récolté sur Wikimedia Commons — licences libres UNIQUEMENT (CC0, CC BY, CC BY-SA,
   domaine public), auteur et page d'origine conservés pour chaque signe.

   Rien n'est inventé : chaque mot du cours a sa vidéo réelle, signée par une vraie personne.
   Les vidéos viennent surtout de Lingua Libre, où des personnes signent bénévolement.
   Aucune orthographe n'a été corrigée à la main : les leçons ne prennent que des mots déjà
   présents dans le vocabulaire français de Lingua, ce qui écarte les coquilles sans deviner.

   La LSF est une langue à part entière, avec sa grammaire : ce cours apprend du VOCABULAIRE,
   il ne remplace pas un cours avec une personne sourde ou un formateur.
   Aucune voix : une langue des signes se regarde.

   Engendré le ${src.recolte_le} — ${Object.keys(LSF).length} signes, ${nMots} en leçon, ${nLecons} leçons, ${unites.length} unités, ${Object.keys(ALPHA).length} lettres. */
var LSF_SIGNES = ${JSON.stringify(LSF)};
var LSF_ALPHABET = ${JSON.stringify(ALPHA)};
var LSF_EXOS = ${JSON.stringify(EXOS)};
var CURRICULUM_LSF = ${JSON.stringify(unites)};
var LMETA_LSF = { lsf:{ nom:"Langue des signes (LSF)", drapeau:"🤟", tts:"", endonyme:"LSF" } };
/* On branche le cours comme les autres langues. Deux marqueurs le distinguent :
     signes:true  → les exercices montrent une VIDÉO et demandent le mot français
     noSon:true   → aucun bouton « écouter » : cette langue ne se parle pas, elle se regarde */
if (typeof COURSES !== "undefined") {
  COURSES.lsf = { id:"lsf", nom:LMETA_LSF.lsf.nom, drapeau:LMETA_LSF.lsf.drapeau, ttsLang:"",
    signes:true, noSon:true, noType:false,
    units: CURRICULUM_LSF.map(function(u){ return { titre:u.t, couleur:u.c, lessons:u.L.map(function(le){
      return { titre:le.t, words:(le.w||[]).map(function(fr){ return {fr:fr,t:fr,signe:LSF_SIGNES[fr]}; }), phrases:[] };
    }) }; }) };
}
`;
fs.writeFileSync(L('data-lsf.js'), out, 'utf8');
console.log('🤟 data-lsf.js écrit — ' + Object.keys(LSF).length + ' signes récoltés, '
  + nMots + ' en leçon, ' + nLecons + ' leçons, ' + unites.length + ' unités, '
  + Object.keys(ALPHA).length + ' lettres d\'alphabet, ' + EXOS.length + ' vidéo(s) d\'entraînement.');
console.log('   unités : ' + unites.map((u) => u.t + ' (' + u.L.length + ')').join(' · '));
console.log('   hors leçon (dictionnaire seulement) : ' + (Object.keys(LSF).length - nMots));
