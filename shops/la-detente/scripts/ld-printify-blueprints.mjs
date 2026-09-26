/* La Détente — récupère TOUT le catalogue Printify (tous les produits) groupé par
   catégorie, avec image d'aperçu, pour que l'admin choisisse quoi vendre.
   Écrit shops/la-detente/printify-blueprints.json. CI avec PRINTIFY_API_KEY. */
import fs from 'fs';

const KEY = process.env.PRINTIFY_API_KEY;
if (!KEY) { console.error('❌ PRINTIFY_API_KEY manquante'); process.exit(1); }
const BASE = 'https://api.printify.com/v1';
const H = { 'Authorization': 'Bearer ' + KEY, 'User-Agent': 'LaDetente-KDMC/1.0' };
const OUT = process.cwd() + '/shops/la-detente/printify-blueprints.json';

/* Ordre important : on teste les catégories spécifiques AVANT t-shirt (sinon
   "swea-TSHIRT" est faussement classé t-shirt). t-shirt = catch-all en dernier. */
const CATS = [
  { id: 'hoodie',     label: 'Hoodies',             re: /hoodie|hooded/i },
  { id: 'sweatshirt', label: 'Sweats',              re: /sweatshirt|crewneck|crew neck/i },
  { id: 'longsleeve', label: 'Manches longues',     re: /long ?sleeve/i },
  { id: 'tank',       label: 'Débardeurs',          re: /tank/i },
  { id: 'polo',       label: 'Polos',               re: /polo/i },
  { id: 'jacket',     label: 'Vestes & Zip',        re: /jacket|bomber|windbreaker|\bzip\b/i },
  { id: 'pants',      label: 'Joggings & Bas',      re: /jogger|sweatpant|leggings|shorts|\bpants\b/i },
  { id: 'hat',        label: 'Casquettes & Bonnets',re: /\b(hat|cap|beanie|visor|snapback|trucker|bucket)\b/i },
  { id: 'bag',        label: 'Sacs & Totes',        re: /\b(bag|tote|backpack|pouch|duffle|fanny)\b/i },
  { id: 'mug',        label: 'Mugs & Bouteilles',   re: /\b(mug|tumbler|bottle|can cooler|glass)\b/i },
  { id: 'home',       label: 'Maison & Déco',       re: /poster|canvas|pillow|blanket|flag|towel|\bmat\b|tapestry|ornament|coaster/i },
  { id: 'accessory',  label: 'Accessoires',         re: /sock|phone|case|sticker|\bpin\b|patch|magnet|apron|bandana|keychain|notebook|mousepad/i },
  { id: 'kids',       label: 'Enfants & Bébé',      re: /\b(kids|toddler|baby|youth|infant)\b/i },
  { id: 'tshirt',     label: 'T-shirts',            re: /(t-?shirt|tee|jersey)\b/i }
];
function categorize(title) {
  for (const c of CATS) { if (c.re.test(title) && !(c.not && c.not.test(title))) return c.id; }
  return 'other';
}
/* Vraies meilleures ventes Printify (IDs vérifiés dans le catalogue) */
const TOP_IDS = [6, 1234, 77, 536, 2789, 535, 5383, 1313, 600, 1933, 2799, 1436];

(async () => {
  const r = await fetch(BASE + '/catalog/blueprints.json', { headers: H });
  const txt = await r.text();
  if (!r.ok) { console.error('HTTP ' + r.status + ' : ' + txt.slice(0, 160)); process.exit(2); }
  const bps = JSON.parse(txt);
  console.log('  ', bps.length, 'blueprints Printify');
  const groups = {};
  CATS.concat([{ id: 'other', label: 'Autres' }]).forEach(c => { groups[c.id] = { label: c.label, items: [] }; });
  bps.forEach(b => {
    const cat = categorize(b.title || '');
    groups[cat].items.push({
      id: b.id, title: b.title, brand: b.brand || '', model: b.model || '',
      image: (b.images && b.images[0]) || ''
    });
  });
  Object.keys(groups).forEach(k => { if (!groups[k].items.length) delete groups[k]; else groups[k].items.sort((a, b) => a.title.localeCompare(b.title)); });
  // Catégorie spéciale « ⭐ Top Printify » = vraies meilleures ventes, en tête
  const byId = {}; bps.forEach(b => { byId[b.id] = b; });
  const topItems = TOP_IDS.map(id => byId[id]).filter(Boolean).map(b => ({ id: b.id, title: b.title, brand: b.brand || '', model: b.model || '', image: (b.images && b.images[0]) || '', top: true }));
  // Catégorie dédiée « Stanley/Stella » = tous les blueprints bio S&S, regroupés
  const ssItems = bps.filter(b => /stanley|stella/i.test(b.brand || '')).map(b => ({ id: b.id, title: b.title, brand: b.brand || '', model: b.model || '', image: (b.images && b.images[0]) || '' })).sort((a, b) => a.title.localeCompare(b.title));
  const ordered = { top: { label: '⭐ Top Printify', items: topItems }, stanley: { label: '🌱 Stanley/Stella (bio)', items: ssItems } };
  Object.keys(groups).forEach(k => { ordered[k] = groups[k]; });
  const cfg = {
    generated_at: new Date().toISOString(),
    total: bps.length,
    top_ids: TOP_IDS,
    note: 'Catalogue Printify complet par catégorie — l\'admin choisit, applique un design, publie. « top » = vraies meilleures ventes Printify.',
    categories: ordered
  };
  fs.writeFileSync(OUT, JSON.stringify(cfg, null, 2));
  const summ = Object.keys(groups).map(k => k + ':' + groups[k].items.length).join(' · ');
  console.log('\n🖼️ printify-blueprints.json écrit —', summ);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
