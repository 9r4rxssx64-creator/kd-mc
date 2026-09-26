/* 🇲🇨 Collecteur de sources MONÉGASQUES (munegascu) — Kevin 2026-08-11 « intègre le monégasque,
   tout ce que tu as et trouve sur le monégasque ».

   POURQUOI CE SCRIPT EXISTE
   Le monégasque est une petite langue (quelques milliers de locuteurs). Écrire un cours « de
   mémoire » reviendrait à INVENTER du vocabulaire — exactement ce que la règle « vérité, rien de
   faux, partout toujours » interdit. Et depuis l'agent, le web est fermé (403). Ce script tourne
   donc en CI (réseau ouvert) : il va chercher les sources LIBRES et ATTESTÉES, les enregistre
   telles quelles, et n'invente RIEN. C'est ensuite sur ce texte réel qu'on bâtit le cours.

   SOURCES (libres, CC BY-SA — attribution obligatoire dans l'app) :
   - fr.wikipedia.org : article « Monégasque », listes Swadesh, articles liés ;
   - fr.wiktionary.org : catégories de mots monégasques + pages de mots (définitions françaises).
   Rien d'autre n'est aspiré : un lexique édité (Comité National des Traditions Monégasques…)
   est sous droit d'auteur — on ne le copie pas.

   Lance : node tools/lingua/collect-monegasque.mjs [--out audit/monegasque]
   Sortie : un fichier par page trouvée + un rapport JSON de ce qui existe vraiment.
*/
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : 'audit/monegasque'; })();
const UA = 'KDMC-Lingua/1.0 (https://lingua.kd-mc.com ; collecte de sources monegasques libres)';

const dodo = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, essais = 3) {
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, 'accept': 'application/json,text/plain,*/*' } });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;                 // la page n'existe pas : information utile, pas une erreur
      if (r.status === 429 || r.status >= 500) { await dodo(1500 * (i + 1)); continue; }
      return null;
    } catch (_) { await dodo(1500 * (i + 1)); }
  }
  return null;
}
const api = (hote, params) => `https://${hote}/w/api.php?` + new URLSearchParams(Object.assign({ format: 'json', formatversion: '2' }, params));

async function wikitexte(hote, titre) {
  const t = await get(api(hote, { action: 'parse', page: titre, prop: 'wikitext', redirects: '1' }));
  if (!t) return null;
  try { const j = JSON.parse(t); return (j && j.parse && j.parse.wikitext) || null; } catch (_) { return null; }
}
async function membresCategorie(hote, categorie, max = 1000) {
  const noms = []; let suite = null;
  do {
    const p = { action: 'query', list: 'categorymembers', cmtitle: categorie, cmlimit: '500', cmnamespace: '0' };
    if (suite) p.cmcontinue = suite;
    const t = await get(api(hote, p)); if (!t) break;
    let j; try { j = JSON.parse(t); } catch (_) { break; }
    const m = (j && j.query && j.query.categorymembers) || [];
    m.forEach((x) => noms.push(x.title));
    suite = j && j.continue && j.continue.cmcontinue;
    await dodo(200);
  } while (suite && noms.length < max);
  return noms;
}

/* Pages candidates : on ESSAIE, et on note honnêtement lesquelles existent. */
const PAGES_WP = ['Monégasque', 'Liste Swadesh du monégasque', 'Ligure (langue)', 'Liste Swadesh du ligure',
  'Culture monégasque', 'Comité national des traditions monégasques', 'Louis Notari'];
const PAGES_WK = ['Annexe:Liste Swadesh en monégasque', 'Annexe:Liste Swadesh du monégasque',
  'Wiktionnaire:Liste Swadesh/monégasque', 'Annexe:Liste Swadesh en ligure'];
/* Le monégasque EN PREMIER (c'est lui qu'on enseigne). Le ligure est collecté à part, à titre
   de comparaison : il ne rentrera JAMAIS dans le cours de monégasque. */
const CATS_WK = ['Catégorie:monégasque', 'Catégorie:noms communs en monégasque',
  'Catégorie:verbes en monégasque', 'Catégorie:adjectifs en monégasque',
  'Catégorie:lexique en monégasque', 'Catégorie:ligure'];

const rapport = { genere_le: null, sources: [], pages_trouvees: [], pages_absentes: [], mots_wiktionnaire: [], note_licence:
  'Wikipédia et le Wiktionnaire sont sous licence CC BY-SA : toute reprise doit citer la source. Aucun lexique édité sous droit d\'auteur n\'est collecté.' };

function ecrire(chemin, contenu) { mkdirSync(dirname(chemin), { recursive: true }); writeFileSync(chemin, contenu, 'utf8'); }
const fichier = (t) => t.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60);

console.log('🇲🇨 Collecte des sources monégasques LIBRES (rien n\'est inventé)\n');

for (const [hote, pages] of [['fr.wikipedia.org', PAGES_WP], ['fr.wiktionary.org', PAGES_WK]]) {
  for (const titre of pages) {
    const wt = await wikitexte(hote, titre);
    if (wt && wt.length > 200) {
      const f = `${OUT}/${hote.split('.')[1]}-${fichier(titre)}.wiki`;
      ecrire(f, `<!-- Source : https://${hote}/wiki/${encodeURIComponent(titre)} — CC BY-SA -->\n` + wt);
      rapport.pages_trouvees.push({ hote, titre, octets: wt.length, fichier: f });
      console.log(`✅ ${hote} · « ${titre} » — ${wt.length} octets → ${f}`);
    } else {
      rapport.pages_absentes.push({ hote, titre });
      console.log(`—  ${hote} · « ${titre} » : absente`);
    }
    await dodo(300);
  }
}

/* Mots du Wiktionnaire : on récupère la LISTE, puis la définition française de chaque mot. */
let motsVus = new Set();
for (const cat of CATS_WK) {
  const noms = await membresCategorie('fr.wiktionary.org', cat);
  if (!noms.length) { console.log(`—  Wiktionnaire · ${cat} : vide ou absente`); continue; }
  console.log(`✅ Wiktionnaire · ${cat} — ${noms.length} entrée(s)`);
  rapport.sources.push({ categorie: cat, entrees: noms.length });
  for (const nom of noms) {
    if (motsVus.has(nom) || motsVus.size >= 2000) continue;
    motsVus.add(nom);
    const wt = await wikitexte('fr.wiktionary.org', nom);
    if (!wt) continue;
    /* On ne garde QUE la section de la langue voulue (== {{langue|xxx}} ==).
       ⚠️ VÉRITÉ : « lij-mc » = MONÉGASQUE, « lij » = LIGURE (génois). Ce sont deux langues
       voisines mais DIFFÉRENTES (Fransa en ligure ≠ França en monégasque). On note le code
       exact de chacun et on ne les mélangera JAMAIS dans le cours. */
    const secs = wt.split(/\n=+\s*\{\{langue\s*\|/).slice(1);
    for (const s of secs) {
      const code = (s.match(/^\s*([a-z-]+)\s*\}\}/) || [])[1] || '';
      if (!/^(lij|mwx)/.test(code)) continue;
      const defs = (s.match(/^#\s*[^#*:\n].*$/gm) || []).slice(0, 3)
        .map((d) => d.replace(/^#\s*/, '')
          /* Les modèles CONTIENNENT souvent le mot français ({{lien|Adèle|fr}}) : les effacer
             en bloc donnait « Prénom féminin correspondant à . » — une définition vide, donc
             inutilisable. On garde le contenu utile avant de nettoyer le reste. */
          .replace(/\{\{(?:lien|l|w|lang|polytonique|zh-lien)\s*\|\s*([^|}]+)[^}]*\}\}/gi, '$1')
          .replace(/\{\{[^}]*\}\}/g, '')
          .replace(/<ref[\s\S]*?(?:<\/ref>|\/>)/gi, '').replace(/<[^>]+>/g, '')
          .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/'{2,}/g, '')
          .replace(/\s{2,}/g, ' ').trim())
        .filter((d) => d && d !== '.' && /[\p{L}]/u.test(d));
      if (defs.length) { rapport.mots_wiktionnaire.push({ mot: nom, code_langue: code, definitions: defs }); }
    }
    await dodo(150);
  }
}

rapport.genere_le = new Date().toISOString();
ecrire(`${OUT}/RAPPORT.json`, JSON.stringify(rapport, null, 2));

console.log('\n===== CE QUI EXISTE VRAIMENT =====');
console.log('pages récupérées      : ' + rapport.pages_trouvees.length);
console.log('pages inexistantes    : ' + rapport.pages_absentes.length);
const parLangue = {};
rapport.mots_wiktionnaire.forEach((m) => { parLangue[m.code_langue] = (parLangue[m.code_langue] || 0) + 1; });
rapport.par_langue = parLangue;
console.log('mots du Wiktionnaire  : ' + rapport.mots_wiktionnaire.length);
console.log('   dont MONÉGASQUE (lij-mc) : ' + (parLangue['lij-mc'] || 0));
console.log('   dont ligure (lij, à part): ' + (parLangue['lij'] || 0));
rapport.mots_wiktionnaire.slice(0, 25).forEach((m) => console.log('   ' + m.mot + ' — ' + m.definitions[0]));
if (!rapport.pages_trouvees.length && !rapport.mots_wiktionnaire.length) {
  console.log('\n⚠️ AUCUNE source libre trouvée. On ne publiera RIEN plutôt que d\'inventer du monégasque.');
  process.exit(2);
}
console.log('\nRapport : ' + OUT + '/RAPPORT.json');
