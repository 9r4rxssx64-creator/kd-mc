/* Génère des vignettes de packs « premium » (1600×1600) par composition des vraies
   photos produit IA (640×640) sur un fond sombre dégradé + bandeau rouge La Détente.
   Lancer depuis la RACINE du repo : node shops/la-detente/scripts/ld-render-packs.mjs */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROD = path.join(__dirname, '..', 'img', 'products');
const S = 1600, PAD = 70, GAP = 40;

const PACKS = [
  { out: 'ld-pack-coeurs',    name: 'Pack Cœurs',           members: ['ld203', 'ld205', 'ld206'] },
  { out: 'ld-pack-rose',      name: 'Pack Rose & Acier',    members: ['ld200', 'ld202'] },
  { out: 'ld-pack-crest',     name: 'Pack Signature Crest', members: ['ld209', 'ld211'] },
];

function bgSVG() {
  return Buffer.from(
    `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="g" cx="50%" cy="38%" r="78%">
        <stop offset="0%" stop-color="#20242b"/><stop offset="60%" stop-color="#131519"/><stop offset="100%" stop-color="#0a0b0d"/>
      </radialGradient></defs>
      <rect width="${S}" height="${S}" fill="url(#g)"/>
    </svg>`);
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function ribbonSVG(rawName, n) {
  const name = esc(rawName);
  return Buffer.from(
    `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="r" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#dc2626"/><stop offset="100%" stop-color="#7f1010"/>
      </linearGradient></defs>
      <g font-family="Georgia,'Times New Roman',serif">
        <rect x="${PAD}" y="${S-300}" width="${S-PAD*2}" height="190" rx="26" fill="rgba(10,11,13,.72)" stroke="rgba(220,38,38,.55)" stroke-width="2"/>
        <text x="${S/2}" y="${S-205}" fill="#fff" font-size="78" font-weight="700" text-anchor="middle">${name}</text>
        <text x="${S/2}" y="${S-150}" fill="#f3c0c0" font-size="34" letter-spacing="3" text-anchor="middle" font-family="Arial,sans-serif">PACK · ${n} PIÈCES · −15 %</text>
        <text x="${PAD+40}" y="${PAD+86}" fill="#dc2626" font-size="46" font-weight="700" letter-spacing="2" font-family="Arial,sans-serif">LA DÉTENTE</text>
        <text x="${S-PAD-40}" y="${PAD+86}" fill="#fff" font-size="40" text-anchor="end">🎁</text>
      </g>
    </svg>`);
}

async function tile(id, w, h) {
  return sharp(path.join(PROD, id + '.png'))
    .resize(w, h, { fit: 'cover', position: 'centre' })
    .composite([{ input: Buffer.from(
      `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="22" ry="22" fill="none"/></svg>`), blend: 'dest-in' }])
    .png().toBuffer();
}
function roundedMask(w, h) {
  return Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="22" ry="22"/></svg>`);
}
async function tileRounded(id, w, h) {
  const img = await sharp(path.join(PROD, id + '.png')).resize(w, h, { fit: 'cover', position: 'centre' }).png().toBuffer();
  return sharp(img).composite([{ input: roundedMask(w, h), blend: 'dest-in' }]).png().toBuffer();
}

async function render(pack) {
  const top = PAD + 130, bottomReserve = 320;
  const areaW = S - PAD * 2, areaH = S - top - bottomReserve;
  const comps = [];
  if (pack.members.length === 3) {
    const bigW = Math.round(areaW * 0.58), smallW = areaW - bigW - GAP;
    const smallH = Math.round((areaH - GAP) / 2);
    comps.push({ input: await tileRounded(pack.members[0], bigW, areaH), left: PAD, top });
    comps.push({ input: await tileRounded(pack.members[1], smallW, smallH), left: PAD + bigW + GAP, top });
    comps.push({ input: await tileRounded(pack.members[2], smallW, smallH), left: PAD + bigW + GAP, top: top + smallH + GAP });
  } else {
    const w = Math.round((areaW - GAP) / 2);
    comps.push({ input: await tileRounded(pack.members[0], w, areaH), left: PAD, top });
    comps.push({ input: await tileRounded(pack.members[1], w, areaH), left: PAD + w + GAP, top });
  }
  comps.push({ input: ribbonSVG(pack.name, pack.members.length), left: 0, top: 0 });
  const outPath = path.join(PROD, pack.out + '.png');
  await sharp(bgSVG()).composite(comps).png().toFile(outPath);
  console.log('✓', pack.out + '.png');
}

for (const p of PACKS) await render(p);
console.log('Terminé — vignettes packs générées.');
