/* 🇲🇨 Fabrique le lexique monégasque VÉRIFIABLE à partir des moissons — Kevin 2026-08-13.

   Entrées (produites par les collecteurs, jamais écrites à la main) :
     audit/monegasque/RAPPORT.json            → Wiktionnaire/Wikipédia (CC BY-SA)
     audit/monegasque/munegascu-couples.json  → munegascu.free.fr (couples + page d'origine)

   Sortie : lingua/monegasque-sources.json — pour CHAQUE mot français, sa forme monégasque,
   SES SOURCES (adresses exactes) et son niveau de confiance. C'est ce fichier que la
   vérification quotidienne relit : un mot publié sans source y devient visible immédiatement.

   RÈGLES DURES (« vérité, rien de faux »)
   - le monégasque, c'est « lij-mc ». Le ligure « lij » est une AUTRE langue : jamais mélangé ;
   - aucune traduction inventée : tout vient d'une source citée ;
   - une définition qui n'est pas une traduction (« Troisième personne du singulier de… »)
     est écartée, pas bricolée ;
   - le sens de lecture du site (français→monégasque ou l'inverse) est DÉDUIT PAR MESURE,
     page par page ; si c'est ambigu, la page est ignorée plutôt que devinée.

   Lance : node tools/lingua/build-monegasque.mjs [--in audit/monegasque] [--ecrire]
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const IN = arg('in', 'audit/monegasque');
const ECRIRE = process.argv.includes('--ecrire');
const R = new URL('../../', import.meta.url).pathname;

/* --- vocabulaire français de référence (2100+ mots déjà dans l'app) : sert à reconnaître
       quel côté d'un couple est le français --- */
const data = readFileSync(R + 'lingua/data.js', 'utf8');
const FR = new Set();
(data.match(/"[^"]{2,40}":"/g) || []).forEach((m) => FR.add(m.slice(1, m.indexOf('":"')).toLowerCase()));

const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
/* Le côté français d'un site de lexique s'écrit rarement « nu » : il porte son article
   (« la maison »), une variante entre parenthèses (« bienvenu(e) ») ou plusieurs synonymes
   séparés par une virgule (« madama, scià, signura »).
   MESURÉ le 2026-08-13 : en comparant les mots BRUTS, 18 pages sur 22 tombaient à 0 reconnu
   des DEUX côtés → « ambigu », donc ignorées, donc ~700 couples réels jetés. Ce n'était pas
   le site qui était ambigu : c'était ma comparaison qui était aveugle. On compare donc la
   forme NETTOYÉE (article et parenthèses retirés, 1er synonyme gardé) — c'est une mesure
   plus juste, pas une supposition : la règle « majorité nette, sinon on saute » ne bouge pas. */
function formeNue(s) {
  return String(s).toLowerCase().normalize('NFC')
    .replace(/\([^)]*\)/g, ' ')                       // bienvenu(e) → bienvenu
    .split(/[,;/]/)[0]                                 // madama, scià → madama
    .replace(/^\s*(le|la|les|l'|un|une|des|du|de la|de l')\s+/, '')   // la maison → maison
    .replace(/[.!?…]+$/, '').trim();
}
const estFrancais = (s) => { const b = String(s).toLowerCase().trim(); return FR.has(b) || FR.has(formeNue(s)); };

/* Une définition de Wiktionnaire → un mot français utilisable, ou null. */
function motFrancais(def) {
  let d = String(def || '').trim().replace(/\s+/g, ' ');
  if (/^(Première|Deuxième|Troisième|Pluriel|Singulier|Féminin|Masculin|Variante|Graphie)\b/i.test(d)) return null;
  if (/^(Prénom|Nom de famille|Patronyme)\b/i.test(d)) return null;      // prénoms : hors cours
  d = d.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[.;,]+\s*$/, '').trim(); // « (pays d'Europe) » → dehors
  if (!d || d.length > 40 || /[<>{}|]/.test(d)) return null;
  if (!/^[\p{L}\p{M}' -]+$/u.test(d)) return null;
  return d.charAt(0).toLowerCase() + d.slice(1);
}

const entrees = {};   // fr → { mc, sources:[], via:[] }
function ajoute(fr, mc, source, via) {
  if (!fr || !mc) return;
  fr = fr.trim(); mc = mc.trim();
  if (!fr || !mc || fr.toLowerCase() === mc.toLowerCase()) return;
  if (!entrees[fr]) entrees[fr] = { mc, sources: [], via: [] };
  const e = entrees[fr];
  /* même mot français donné avec DEUX formes différentes : on garde la 1re et on note l'autre
     comme variante — on ne tranche pas à la place des sources */
  if (e.mc !== mc && !(e.variantes || []).includes(mc)) (e.variantes = e.variantes || []).push(mc);
  if (!e.sources.includes(source)) e.sources.push(source);
  if (!e.via.includes(via)) e.via.push(via);
}

/* ---------- 1. Wiktionnaire (lij-mc UNIQUEMENT) ---------- */
let nWik = 0, nLigureEcarte = 0;
if (existsSync(R + IN + '/RAPPORT.json')) {
  const rap = JSON.parse(readFileSync(R + IN + '/RAPPORT.json', 'utf8'));
  (rap.mots_wiktionnaire || []).forEach((m) => {
    if (m.code_langue !== 'lij-mc') { if (String(m.code_langue).startsWith('lij')) nLigureEcarte++; return; }
    for (const def of m.definitions || []) {
      const fr = motFrancais(def);
      if (fr) { ajoute(fr, m.mot, 'https://fr.wiktionary.org/wiki/' + encodeURIComponent(m.mot), 'wiktionnaire'); nWik++; break; }
    }
  });
} else console.log('· pas de RAPPORT.json (' + IN + ')');

/* ---------- 2. munegascu.free.fr (sens de lecture MESURÉ page par page) ---------- */
let nSite = 0, pagesIgnorees = 0;
if (existsSync(R + IN + '/munegascu-couples.json')) {
  const c = JSON.parse(readFileSync(R + IN + '/munegascu-couples.json', 'utf8'));
  const parPage = new Map();
  (c.couples || []).forEach((x) => { const p = (x.sources || ['?'])[0];
    if (!parPage.has(p)) parPage.set(p, []); parPage.get(p).push(x); });
  for (const [page, liste] of parPage) {
    const scoreA = liste.filter((x) => estFrancais(x.a)).length;
    const scoreB = liste.filter((x) => estFrancais(x.b)).length;
    /* il faut une majorité NETTE, sinon on ne devine pas : on saute la page */
    if (Math.max(scoreA, scoreB) < 3 || Math.abs(scoreA - scoreB) < 2) { pagesIgnorees++; continue; }
    const frGauche = scoreA > scoreB;
    liste.forEach((x) => {
      const brutFr = frGauche ? x.a : x.b, brutMc = frGauche ? x.b : x.a;
      /* on garde le mot français NETTOYÉ (sans article ni variante) pour qu'il colle au
         vocabulaire de l'app, et la 1re forme monégasque proposée — les autres formes du
         site restent dans les sources, on n'en invente aucune */
      const fr = formeNue(brutFr), mc = String(brutMc).split(/[,;/]/)[0].replace(/\([^)]*\)/g, ' ').trim();
      if (!/^[\p{L}\p{M}' -]{2,40}$/u.test(fr) || !/^[\p{L}\p{M}'’̍ -]{2,40}$/u.test(mc)) return;
      ajoute(fr, mc, page, 'munegascu.free.fr'); nSite++;
    });
  }
} else console.log('· pas de munegascu-couples.json (' + IN + ')');

/* ---------- 3. Bilan + écriture ---------- */
const tous = Object.entries(entrees).map(([fr, e]) => ({ fr, ...e,
  confiance: e.via.length >= 2 ? 'double' : 'simple' }));
const doubles = tous.filter((e) => e.confiance === 'double');

console.log('\n===== LEXIQUE MONÉGASQUE VÉRIFIABLE =====');
console.log('depuis le Wiktionnaire (lij-mc) : ' + nWik + '   (ligure lij écarté : ' + nLigureEcarte + ')');
console.log('depuis munegascu.free.fr        : ' + nSite + '   (pages au sens ambigu, ignorées : ' + pagesIgnorees + ')');
console.log('mots français couverts          : ' + tous.length);
console.log('   dont confirmés par 2 sources : ' + doubles.length);
console.log('\nExtrait :');
tous.slice(0, 25).forEach((e) => console.log('   ' + e.fr + '  →  ' + e.mc + '   [' + e.via.join('+') + ']'));

if (ECRIRE) {
  const sortie = {
    genere_le: new Date().toISOString(),
    langue: { code: 'mc', code_wiktionnaire: 'lij-mc', nom: 'Monégasque', endonyme: 'munegascu' },
    avertissement: 'Chaque entrée vient d\'une source citée. Le ligure (lij) est une AUTRE langue et n\'est jamais mélangé au monégasque (lij-mc).',
    credits: ['Wiktionnaire francophone et Wikipédia (CC BY-SA)', 'munegascu.free.fr'],
    total: tous.length, double_source: doubles.length,
    entrees: Object.fromEntries(tous.map((e) => [e.fr, { mc: e.mc, variantes: e.variantes, sources: e.sources, via: e.via, confiance: e.confiance }])),
  };
  writeFileSync(R + 'lingua/monegasque-sources.json', JSON.stringify(sortie, null, 1), 'utf8');
  console.log('\n→ écrit : lingua/monegasque-sources.json (' + tous.length + ' entrées)');
}
if (!tous.length) { console.log('\n⚠️ Aucune entrée : on ne publie RIEN plutôt que d\'inventer.'); process.exit(2); }
