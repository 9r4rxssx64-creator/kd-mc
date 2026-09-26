#!/usr/bin/env node
/* Illustrations des recettes du Répertoire de la Riviera.
   SOURCE PRINCIPALE : vraies photos LIBRES DE DROITS via Pexels (PEXELS_API_KEY).
   Repli : IA image si une clé a du crédit (Together/Replicate/OpenAI/Gemini) ; sinon médaillon SVG (dans la page).
   N'invente aucune recette — illustre le plat.

   v2 (2026-08-13) : chaque photo doit CORRESPONDRE au plat ET être UNIQUE.
   - Requête traduite en anglais depuis le NOM du plat (Pexels est anglophone).
   - 30 résultats par requête, on prend le 1er NON ENCORE UTILISÉ (anti-doublon strict).
   - Repli catégorie avec rotation de page pour rester distinct.
   Idempotent par défaut ; le workflow purge d'abord (force) pour tout régénérer proprement. */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DIR = path.resolve('tools/cuisine');
const IMG = path.join(DIR, 'img');
fs.mkdirSync(IMG, { recursive: true });
const recipes = JSON.parse(fs.readFileSync(path.join(DIR, 'recipes.json'), 'utf8'));
const ONLY = process.argv[2] ? new Set(process.argv[2].split(',').map(Number)) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const PEXELS = process.env.PEXELS_API_KEY;
const AI = { together: process.env.TOGETHER_API_KEY, replicate: process.env.AX_REPLICATE_KEY, openai: process.env.OPEN_AI_API_KEY, gemini: process.env.GEMINI_API_KEY };
console.log('Pexels:', PEXELS ? 'oui' : 'NON', '| IA repli:', Object.entries(AI).filter(([, v]) => v).map(([k]) => k).join(',') || 'aucune');

/* Dictionnaire plat/ingrédient FR → requête Pexels EN (ordre = du plus spécifique au plus général).
   On matche sur le NOM (puis la description). La 1re correspondance donne la requête. */
const KW = [
  // Desserts
  [/bavarois/, 'bavarian cream dessert plated'], [/bombe glac/, 'frozen ice cream bombe dessert'],
  [/ananas/, 'pineapple dessert plated'], [/souffl/, 'souffle dessert ramekin'],
  [/crepe|crêpe/, 'crepes dessert plated'], [/biscuit/, 'sponge cake slice'],
  [/parfait glac/, 'frozen parfait dessert'], [/coupe/, 'ice cream sundae glass'],
  [/creme glacee|glace/, 'ice cream scoop dessert'], [/creme renversee/, 'caramel custard flan'],
  [/creme/, 'cream dessert verrine'], [/fraise/, 'strawberry dessert plated'],
  [/mandarine|soufflé glacé aux mandarines/, 'mandarin orange dessert'], [/galapian/, 'apricot almond tart bar'],
  [/fougasse/, 'sweet fougasse bread'], [/panettone|panetun/, 'panettone slice'],
  [/oreillette|ganse/, 'fried dough bugnes powdered sugar'], [/tarte.*pignon/, 'pine nut tart'],
  [/tarte.*cerise/, 'cherry tart'], [/tarte.*fruit/, 'fruit tart'], [/tarte/, 'french tart slice'],
  [/flan/, 'flan custard dessert'], [/gateau de semoule/, 'semolina pudding cake'],
  [/petits fours|macaron/, 'macarons petit fours'], [/frangipane/, 'frangipane almond tart'],
  [/pandolce/, 'genoese fruit cake slice'], [/baci di alassio/, 'chocolate hazelnut cookies'],
  // Soupes
  [/consomme/, 'clear broth consomme bowl'], [/veloute|creme de volaille/, 'creamy soup bowl'],
  [/bouillabaisse/, 'bouillabaisse fish soup'], [/soupe de poisson/, 'fish soup bowl'],
  [/minestrone/, 'minestrone soup'], [/pistou/, 'vegetable soup pistou'],
  [/potage|soupe/, 'vegetable soup bowl'],
  // Poissons / fruits de mer
  [/loup de mer|luvu|bar a la|bar grill/, 'grilled sea bass plated'], [/daurade/, 'sea bream fish plated'],
  [/alose/, 'baked fish fillet'], [/sole/, 'sole fish fillet plated'],
  [/stockfish|stocaf|stoccafisso/, 'cod fish tomato stew'], [/brandade|morue/, 'salt cod brandade'],
  [/seiche|sepia/, 'cuttlefish stew'], [/calamar/, 'fried calamari'], [/poulpe/, 'octopus salad'],
  [/sardine/, 'stuffed sardines'], [/langouste/, 'spiny lobster plated'], [/homard/, 'lobster dish plated'],
  [/ecrevisse/, 'crayfish dish'], [/boulettes de poisson/, 'fish balls tomato'],
  [/buridda/, 'ligurian fish stew'], [/cappon magro/, 'seafood salad platter'],
  // Viandes / volailles / gibier
  [/chateaubriand/, 'chateaubriand beef steak'], [/tournedos|filet de boeuf|filet de bœuf/, 'beef tenderloin steak'],
  [/daube|dauba/, 'beef stew red wine'], [/flanchet|miroton/, 'braised veal beef stew'],
  [/ris de veau/, 'veal sweetbread plated'], [/agneau|cotelette|côtelette/, 'lamb chops plated'],
  [/canard|caneton/, 'roast duck plated'], [/poulet/, 'roast chicken lemon'],
  [/poularde|chapon|supreme|suprême/, 'roast poultry breast plated'], [/caille/, 'roast quail plated'],
  [/chevreuil/, 'venison dish plated'], [/sanglier/, 'wild boar stew'],
  [/escalope|milanaise/, 'veal milanese cutlet'], [/poivrons.*farci/, 'stuffed peppers'],
  // Entrées / œufs
  [/canape/, 'canape appetizer platter'], [/cassolette/, 'seafood cassolette'],
  [/croustade/, 'pastry croustade'], [/feuillete|vol-au-vent/, 'puff pastry vol au vent'],
  [/omelette|truccia/, 'chard omelette'], [/oeuf|œuf/, 'poached eggs dish'],
  // Terroir monégasque / niçard / ligure
  [/barbagiuan/, 'fried chard turnover pastry'], [/pissaladiere|pissaladiera|sardenaira|pissalandrea/, 'caramelized onion tart anchovies'],
  [/tourte.*blette|tourton|tourta|pasqualina|tourte pascale|gattafura/, 'swiss chard pie'], [/raviol/, 'ravioli pasta plated'],
  [/gnocchi|gnochi/, 'gnocchi plated'], [/socca|panisse|panissa|pois chiche/, 'chickpea socca farinata'],
  [/farci/, 'stuffed vegetables baked'],
  [/pesto|trofie/, 'trofie pesto pasta'], [/focaccia|fugassa|fugàssa/, 'focaccia bread'],
  [/farinata|faina|fainâ/, 'chickpea farinata'], [/pansoti|pansòti/, 'pansoti pasta walnut sauce'],
  [/cima|çimma/, 'stuffed veal breast slices'], [/coniglio|lapin/, 'braised rabbit'],
];

function queriesFor(r) {
  const name = strip(r.name), desc = strip(r.desc);
  const hay = name + ' ' + desc;
  const out = [];
  for (const [re, q] of KW) { if (re.test(name)) { out.push(q); break; } }
  if (!out.length) for (const [re, q] of KW) { if (re.test(hay)) { out.push(q); break; } }
  // requête catégorie (repli, mais diversifiée par rotation de page)
  const CAT = {
    'Desserts & Pâtisseries': 'french dessert pastry plated',
    'Potages & Soupes': 'gourmet soup bowl',
    'Poissons & Fruits de mer': 'seafood fish plated',
    'Viandes, Volailles & Gibiers': 'gourmet meat dish plated',
    "Entrées, Œufs & Hors-d'œuvre": 'appetizer starter plated',
    'Spécialités du Terroir': 'mediterranean provencal dish',
  };
  out.push(CAT[r.cat] || 'gourmet plated dish');
  return out;
}

async function pexels(query, page = 1) {
  const url = 'https://api.pexels.com/v1/search?orientation=landscape&size=medium&per_page=30&page=' + page + '&query=' + encodeURIComponent(query);
  const r = await fetch(url, { headers: { Authorization: PEXELS } });
  if (!r.ok) { if (r.status === 429) throw new Error('pexels 429'); return []; }
  const j = await r.json();
  return (j.photos || []).map(p => ({ id: p.id, url: p.src && (p.src.landscape || p.src.large2x || p.src.large || p.src.original) })).filter(x => x.url);
}
async function toBuf(x) { if (x.b64) return Buffer.from(x.b64, 'base64'); const r = await fetch(x.url); if (!r.ok) throw new Error('dl ' + r.status); return Buffer.from(await r.arrayBuffer()); }
async function save(buf, out) { await sharp(buf).resize(1000, 640, { fit: 'cover', position: 'attention' }).jpeg({ quality: 76, mozjpeg: true }).toFile(out); }

// --- IA repli (optionnel) ---
async function aiTogether(p) { const r = await fetch('https://api.together.xyz/v1/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI.together }, body: JSON.stringify({ model: 'black-forest-labs/FLUX.1-schnell-Free', prompt: p, width: 1024, height: 688, n: 1, steps: 4, response_format: 'b64_json' }) }); if (!r.ok) return null; const j = await r.json(); const d = j.data && j.data[0]; return d ? (d.b64_json ? { b64: d.b64_json } : { url: d.url }) : null; }
async function aiOpenAI(p) { const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI.openai }, body: JSON.stringify({ model: 'gpt-image-1', prompt: p, size: '1536x1024', n: 1 }) }); if (!r.ok) return null; const j = await r.json(); const d = j.data && j.data[0]; return d ? (d.b64_json ? { b64: d.b64_json } : { url: d.url }) : null; }
async function aiReplicate(p) { const r = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI.replicate, Prefer: 'wait' }, body: JSON.stringify({ input: { prompt: p, aspect_ratio: '3:2', output_format: 'jpg' } }) }); if (!r.ok) return null; const j = await r.json(); let o = j.output; if (Array.isArray(o)) o = o[0]; return o ? { url: o } : null; }
function aiPrompt(r) { return `Elegant fine-dining food photograph of "${r.name}", classic Monégasque/Riviera dish. Plated on white porcelain, soft natural light, appetizing, luxury cookbook, landscape. No text, no people.`; }
async function aiTry(r) { for (const [k, fn] of [['together', aiTogether], ['replicate', aiReplicate], ['openai', aiOpenAI]]) { if (!AI[k]) continue; try { const img = await fn(aiPrompt(r)); if (img) return img; } catch (_) {} } return null; }

const usedIds = new Set();          // photos Pexels déjà attribuées (anti-doublon global)
const catPage = {};                 // rotation de page par catégorie pour le repli

(async () => {
  if (!PEXELS) console.error('PEXELS_API_KEY manquante — impossible de récupérer des photos libres de droits.');
  let done = 0, skipped = 0; const failed = []; const srcCount = { pexels: 0, ai: 0 };
  for (const r of recipes) {
    if (ONLY && !ONLY.has(r.id)) continue;
    const out = path.join(IMG, `${r.id}.jpg`);
    if (fs.existsSync(out) && fs.statSync(out).size > 3000) { skipped++; continue; }
    process.stdout.write(`[${r.id}] ${r.name.slice(0, 40)} … `);
    let pick = null, via = '', usedQ = '';
    if (PEXELS) {
      const qs = queriesFor(r);
      for (let qi = 0; qi < qs.length && !pick; qi++) {
        const q = qs[qi];
        const isCat = qi === qs.length - 1;
        // repli catégorie : on avance dans les pages pour ne pas retomber sur les mêmes
        const startPage = isCat ? (catPage[q] = (catPage[q] || 0) + 1) : 1;
        for (let page = startPage; page < startPage + 3 && !pick; page++) {
          let res = [];
          for (let a = 0; a < 3; a++) { try { res = await pexels(q, page); break; } catch (e) { if (String(e.message).includes('429')) await sleep(3500); else break; } }
          for (const ph of res) { if (!usedIds.has(ph.id)) { pick = ph; usedQ = q + ' p' + page; break; } }
          if (!res.length) break;
        }
      }
      if (pick) { usedIds.add(pick.id); via = 'pexels'; }
    }
    if (!pick) { const ai = await aiTry(r); if (ai) { pick = ai; via = 'ai'; } }
    if (!pick) { console.log('❌'); failed.push(r.id); await sleep(300); continue; }
    try { await save(await toBuf(pick), out); srcCount[via]++; done++; console.log(`✅ ${via} «${usedQ}» ${(fs.statSync(out).size / 1024 | 0)}Ko`); }
    catch (e) { console.log('save KO ' + e.message.slice(0, 40)); failed.push(r.id); }
    await sleep(400);
  }
  console.log(`\nTerminé : ${done} images (${srcCount.pexels} Pexels, ${srcCount.ai} IA), ${skipped} déjà là, ${failed.length} échecs${failed.length ? (' → ' + failed.join(',')) : ''}`);
  console.log('Photos uniques attribuées :', usedIds.size);
  fs.writeFileSync(path.join(IMG, '_status.json'), JSON.stringify({ done, skipped, failed, src: srcCount, unique: usedIds.size, total: recipes.length, ts: 0 }));
})();
