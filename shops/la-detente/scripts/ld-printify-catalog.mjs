/* La Détente — découvre le catalogue Printify (lecture seule) et construit le mapping
   garment → blueprint_id / print_provider_id / variant_id par couleur+taille.
   Écrit shops/la-detente/printify-catalog.json. Lancer en CI avec PRINTIFY_API_KEY. */
import fs from 'fs';

const KEY = process.env.PRINTIFY_API_KEY;
if (!KEY) { console.error('❌ PRINTIFY_API_KEY manquante'); process.exit(1); }
const BASE = 'https://api.printify.com/v1';
const H = { 'Authorization': 'Bearer ' + KEY, 'User-Agent': 'LaDetente-KDMC/1.0' };
const OUT = process.cwd() + '/shops/la-detente/printify-catalog.json';

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(path) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + path, { headers: H });
    if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path + ' : ' + t.slice(0, 120));
    return JSON.parse(t);
  }
  throw new Error('rate-limit ' + path);
}

const WANT_COLORS = ['Black', 'White', 'Military Green', 'Forest Green', 'Dark Heather', 'Heather Forest', 'Navy', 'Khaki', 'Sand'];
const WANT_SIZES = ['S', 'M', 'L', 'XL', '2XL', 'XXL'];
const SIZE_ALIAS = { '2XL': 'XXL', 'XXL': 'XXL' };

function pickBlueprint(blueprints, res) {
  // res = regex; renvoie le 1er blueprint matching, en préférant marques pas chères
  const cands = blueprints.filter(b => res.test((b.title || '') + ' ' + (b.brand || '') + ' ' + (b.model || '')));
  const cheap = /gildan|5000|18500|hanes|district|18000/i;
  cands.sort((a, b) => (cheap.test(a.brand + a.model) ? 0 : 1) - (cheap.test(b.brand + b.model) ? 0 : 1));
  return cands[0] || null;
}

function variantMap(variants) {
  // construit { color: { size: variant_id } } pour les couleurs/tailles voulues
  const out = {}; const colorsSeen = new Set(); const sizesSeen = new Set();
  variants.forEach(v => {
    const o = v.options || {};
    let color = o.color || o.Color, size = o.size || o.Size;
    if ((!color || !size) && v.title && v.title.indexOf('/') >= 0) {
      const parts = v.title.split('/').map(s => s.trim());
      color = color || parts[0]; size = size || parts[1];
    }
    if (!color) color = 'Default'; if (!size) size = 'Unique';
    const sz = SIZE_ALIAS[size] || size;
    if (!out[color]) out[color] = {};
    out[color][sz] = v.id; colorsSeen.add(color); sizesSeen.add(sz);
  });
  return { map: out, colors: [...colorsSeen], sizes: [...sizesSeen] };
}

function reduceColors(vm) {
  // garde seulement quelques couilleurs utiles si dispo, sinon tout
  const keep = {}; const have = Object.keys(vm.map);
  let chosen = WANT_COLORS.filter(c => have.includes(c));
  if (!chosen.length) chosen = have.slice(0, 4);
  chosen.forEach(c => { keep[c] = vm.map[c]; });
  return keep;
}

async function buildGarment(blueprints, regex, label, sizeFilter) {
  const bp = pickBlueprint(blueprints, regex);
  if (!bp) { console.error('  ⏭', label, 'introuvable'); return null; }
  const providers = await get(`/catalog/blueprints/${bp.id}/print_providers.json`);
  if (!providers.length) { console.error('  ⏭', label, 'aucun provider'); return null; }
  const pp = providers[0];
  const variants = (await get(`/catalog/blueprints/${bp.id}/print_providers/${pp.id}/variants.json`)).variants || [];
  let vm = variantMap(variants);
  const colors = reduceColors(vm);
  // filtre tailles
  Object.keys(colors).forEach(c => {
    const filtered = {};
    Object.keys(colors[c]).forEach(s => { if (!sizeFilter || sizeFilter(s)) filtered[s] = colors[c][s]; });
    colors[c] = filtered;
  });
  console.log('  ✅', label, '→ blueprint', bp.id, '«' + bp.title + '» provider', pp.id, '«' + pp.title + '» couleurs:', Object.keys(colors).join(','));
  return { blueprint_id: bp.id, blueprint_title: bp.title, print_provider_id: pp.id, print_provider_title: pp.title, variants: colors };
}

(async () => {
  console.log('▶ Récupération des blueprints…');
  const blueprints = await get('/catalog/blueprints.json');
  console.log('  ', blueprints.length, 'blueprints');
  const tee = await buildGarment(blueprints, /(unisex|men).*(t-?shirt|tee)|heavy cotton tee/i, 'TEE', s => WANT_SIZES.includes(s) || s === 'XXL');
  const hoodie = await buildGarment(blueprints, /hoodie|hooded sweatshirt/i, 'HOODIE', s => WANT_SIZES.includes(s) || s === 'XXL');
  const cap = await buildGarment(blueprints, /(snapback|trucker|dad hat|baseball cap|\bcap\b)/i, 'CAP', null);
  const cfg = {
    generated_at: new Date().toISOString(),
    shop_note: 'Mapping pour commandes auto Printify (print-on-the-fly via URL design)',
    image_base: 'https://9r4rxssx64-creator.github.io/CMCteams/shops/la-detente/img/designs/',
    garments: {}
  };
  if (tee) cfg.garments.tee = tee;
  if (hoodie) cfg.garments.hoodie = hoodie;
  if (cap) cfg.garments.cap = cap;
  if (!Object.keys(cfg.garments).length) { console.error('❌ aucun garment résolu'); process.exit(2); }
  fs.writeFileSync(OUT, JSON.stringify(cfg, null, 2));
  console.log('\n🖼️ printify-catalog.json écrit (' + Object.keys(cfg.garments).join(', ') + ')');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
