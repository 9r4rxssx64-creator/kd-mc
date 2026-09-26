/* 🇲🇨 Fabrique le COURS de monégasque à partir des sources attestées — Kevin 2026-08-13.

   D'où vient le contenu : lingua/monegasque-sources.json, lui-même produit par les
   collecteurs (Wiktionnaire lij-mc + munegascu.free.fr). AUCUN mot n'est écrit à la main
   ici : ce script ne fait que RANGER ce qui est attesté, en gardant l'adresse de la source
   pour chaque mot.

   Pourquoi un programme À PART (et pas les 189 unités des autres langues) : mesuré le
   2026-08-13, les sources libres couvrent 306 mots du programme commun sur 2127 → ZÉRO
   unité complète, donc un cours VIDE. Or le site source est déjà organisé par thèmes
   (la famille, la maison, les animaux…). On suit donc ces thèmes : le cours existe vraiment,
   et chaque mot reste vérifiable. On n'invente pas les mots manquants pour « faire nombre ».

   Sortie : lingua/data-mc.js (LEX3 + CURRICULUM_MC + MC_SOURCES + COURSES.mc)

   Lance : node tools/lingua/build-monegasque-cours.mjs [--ecrire]
*/
import { readFileSync, writeFileSync } from 'node:fs';

const R = new URL('../../', import.meta.url).pathname;
const ECRIRE = process.argv.includes('--ecrire');
const src = JSON.parse(readFileSync(R + 'lingua/monegasque-sources.json', 'utf8'));

/* Thèmes du site, dans un ordre d'apprentissage (le plus utile d'abord).
   Le libellé est à nous ; les MOTS viennent tous des sources. */
const THEMES = [
  ['bienvenue', 'Se présenter 👋', '#12b981'],
  ['famille', 'La famille 👨‍👩‍👧', '#f6b73c'],
  ['corps', 'Le corps 🧍', '#ef6f6c'],
  ['aliment', 'À table 🍽️', '#f59e0b'],
  ['maison', 'À la maison 🏠', '#8b5cf6'],
  ['habits', 'Les vêtements 👕', '#ec4899'],
  ['ville', 'En ville 🏙️', '#38bdf8'],
  ['transport', 'Se déplacer 🚋', '#0891b2'],
  ['temps', 'Le temps qui passe ⏳', '#a78bfa'],
  ['jours', 'Les jours 📅', '#22c55e'],
  ['climat', 'Le temps qu\'il fait 🌦️', '#60a5fa'],
  ['nature', 'La nature 🌿', '#16a34a'],
  ['animal', 'Les animaux 🐾', '#eab308'],
  ['sport', 'Le sport ⚽', '#f97316'],
  ['geographie', 'Le pays et le monde 🗺️', '#14b8a6'],
  ['poste', 'La poste et l\'école ✉️', '#94a3b8'],
];
const PAR_MOTS = 6;      // 6 mots par leçon : une leçon courte se finit, une longue se déserte

/* --- rangement : chaque mot va dans le thème de la page où il a été trouvé --- */
const parTheme = new Map(THEMES.map(([k]) => [k, []]));
const wiktio = [];
const lex = {}, sources = {};
/* Attesté ≠ enseignable : un préfixe (« pre- »), une lettre seule ou le nom d'un site
   (Wikipédia, Wikimédia) sont de vraies entrées de dictionnaire, mais on n'apprend pas une
   langue avec ça. On les écarte du COURS ; ils restent dans le fichier de sources. */
const enseignable = (fr, mc) => !/[-]$/.test(mc) && !/^pré?-|-$/.test(fr)
  && fr.length > 1 && mc.length > 1 && !/^wiki/i.test(fr);
Object.entries(src.entrees).forEach(([fr, e]) => {
  if (!e.mc || !enseignable(fr, e.mc)) return;
  lex[fr] = e.mc; sources[fr] = e.sources;
  const page = (e.sources[0] || '').split('/').pop().replace(/\.html?$/, '');
  if (parTheme.has(page)) parTheme.get(page).push(fr); else wiktio.push(fr);
});

/* --- construction des unités --- */
const unites = [];
const decoupe = (mots) => { const out = []; for (let i = 0; i < mots.length; i += PAR_MOTS) out.push(mots.slice(i, i + PAR_MOTS)); return out; };
THEMES.forEach(([cle, titre, couleur]) => {
  const mots = parTheme.get(cle).sort((a, b) => a.localeCompare(b, 'fr'));
  if (mots.length < PAR_MOTS) return;                     // moins de 6 mots = pas une unité
  const paquets = decoupe(mots);
  unites.push({ t: titre, c: couleur, L: paquets.map((p, i) => ({ t: titre.replace(/\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u, '').trim() + ' ' + (i + 1), w: p })) });
});
/* les mots du Wiktionnaire (pays, villes, quelques verbes) forment la dernière unité */
if (wiktio.length >= PAR_MOTS) {
  const mots = wiktio.sort((a, b) => a.localeCompare(b, 'fr'));
  unites.push({ t: 'Pays, villes et mots divers 🌍', c: '#c9a7ff', L: decoupe(mots).map((p, i) => ({ t: 'Le monde ' + (i + 1), w: p })) });
}

const nbMots = unites.reduce((s, u) => s + u.L.reduce((t, l) => t + l.w.length, 0), 0);
const nbLecons = unites.reduce((s, u) => s + u.L.length, 0);
console.log('🇲🇨 Cours de monégasque, uniquement à partir de mots ATTESTÉS');
console.log('unités  : ' + unites.length);
console.log('leçons  : ' + nbLecons);
console.log('mots    : ' + nbMots + ' (sur ' + Object.keys(lex).length + ' attestés — les thèmes de moins de 6 mots sont laissés de côté)');
unites.forEach((u) => console.log('   · ' + u.t.padEnd(30) + u.L.length + ' leçon(s), ' + u.L.reduce((t, l) => t + l.w.length, 0) + ' mots'));

if (!ECRIRE) { console.log('\n(essai à blanc — ajoute --ecrire pour produire lingua/data-mc.js)'); process.exit(unites.length ? 0 : 2); }

const entete = `/* 🇲🇨 LE MONÉGASQUE (munegascu) — cours engendré, NE PAS ÉDITER À LA MAIN.
   Produit par tools/lingua/build-monegasque-cours.mjs à partir de lingua/monegasque-sources.json,
   lui-même récolté sur des sources libres :
     · Wiktionnaire francophone / Wikipédia — code de langue « lij-mc » (CC BY-SA)
     · munegascu.free.fr (lexique thématique)
   CHAQUE mot garde l'adresse de sa source dans MC_SOURCES : rien n'est inventé, tout se vérifie.
   Le ligure (« lij ») est une AUTRE langue : il n'est jamais mélangé au monégasque.
   Aucune voix de synthèse ne parle monégasque : l'app le fait lire par une voix française à
   partir d'une transcription (lingua/mc-voix.js), et le dit honnêtement à l'élève.
   Engendré le ${new Date().toISOString().slice(0, 10)} — ${nbMots} mots, ${nbLecons} leçons, ${unites.length} unités. */
`;
const js = entete
  + 'var LEX3 = ' + JSON.stringify(lex, null, 0) + ';\n'
  + 'var MC_SOURCES = ' + JSON.stringify(sources, null, 0) + ';\n'
  + 'var CURRICULUM_MC = ' + JSON.stringify(unites, null, 0) + ';\n'
  + 'var LMETA3 = { mc: { nom:"Monégasque", drapeau:"🇲🇨", tts:"fr-FR", endonyme:"munegascu" } };\n'
  + `/* On branche le cours comme les autres langues (même forme d'objet). */
if (typeof COURSES !== "undefined") {
  COURSES.mc = { id:"mc", nom:LMETA3.mc.nom, drapeau:LMETA3.mc.drapeau, ttsLang:LMETA3.mc.tts, mc:true,
    units: CURRICULUM_MC.map(function(u){ return { titre:u.t, couleur:u.c, lessons:u.L.map(function(le){
      return { titre:le.t, words:(le.w||[]).map(function(fr){ return {fr:fr,t:LEX3[fr]}; }), phrases:[] };
    }) }; }) };
}
`;
writeFileSync(R + 'lingua/data-mc.js', js, 'utf8');
console.log('\n→ écrit : lingua/data-mc.js');
