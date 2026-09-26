/* ============================================================================
 * LA DÉTENTE — Générateur d'emblèmes / logos vectoriels (SVG → PNG HD)
 * Thème : arme + cœur rouge. Boutique de tir sportif / ball-trap / chasse.
 * 100% local, déterministe, print-ready. Aucune dépendance externe (sauf sharp).
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = __dirname;
const DIR = { emb: path.join(ROOT, 'emblemes'), logo: path.join(ROOT, 'logo'), mock: path.join(ROOT, 'mockups'), print: path.join(ROOT, 'print') };
Object.values(DIR).forEach(d => fs.mkdirSync(d, { recursive: true }));

const FONT = "'Liberation Sans','DejaVu Sans',Arial,sans-serif";

/* ---------------------------------------------------------------- palettes */
const PAL = {
  noirRouge: {
    name: 'Noir & rouge', bg1: '#1a1c22', bg2: '#0a0b0e', ring: '#202329', ringHi: '#3c404b',
    stitch: '#efe7d2', steel1: '#d7dce3', steel2: '#7c838f', steelDk: '#2a2d34',
    accent: '#e51f2b', accent2: '#8c0d15', heartHi: '#ff6a6f', text: '#f3eee2', sub: '#c9ccd3', camo: null, gold: false
  },
  camo: {
    name: 'Camo / vert olive', bg1: '#283019', bg2: '#141a0d', ring: '#3d4824', ringHi: '#6f7c3f',
    stitch: '#e9e1c9', steel1: '#6a7540', steel2: '#3c451f', steelDk: '#222a12',
    accent: '#d72a25', accent2: '#7c1311', heartHi: '#ff6a63', text: '#efe9d2', sub: '#cdd0b4', camo: true, gold: false
  },
  noirOr: {
    name: 'Noir & or', bg1: '#16141b', bg2: '#08070b', ring: '#1c1922', ringHi: '#4a3f63',
    stitch: '#d9c373', steel1: '#f6e9b0', steel2: '#c69b33', steelDk: '#1c1708',
    accent: '#e51f2b', accent2: '#8c0d15', heartHi: '#ff7a7e', text: '#f5e6ac', sub: '#cdbd86',
    camo: null, gold: true, gold1: '#fff3c4', gold2: '#d4af37', gold3: '#9c7b22'
  }
};

/* --------------------------------------------------------- silhouettes armes
 * Toutes dessinées barrel vers la droite, box approx 0..366 x.  */
function gAR15(fill, stroke = 'none', sw = 0) {
  return `<g fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
    <polygon points="0,44 62,30 62,74 34,82 0,72"/>
    <rect x="60" y="30" width="130" height="38" rx="3"/>
    <rect x="92" y="19" width="100" height="10" rx="3"/>
    <polygon points="118,68 140,68 153,116 126,118"/>
    <path d="M150,68 L190,68 L202,156 Q184,162 166,156 Z"/>
    <rect x="190" y="38" width="76" height="26" rx="5"/>
    <rect x="266" y="46" width="96" height="10" rx="3"/>
    <polygon points="300,21 310,21 308,46 302,46"/>
    <rect x="352" y="43" width="15" height="15" rx="2"/>
  </g>`;
}
function gGlock(fill, stroke = 'none', sw = 0) {
  return `<g fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
    <path d="M40,8 L196,8 L210,18 L210,42 L40,42 Z"/>
    <rect x="40" y="42" width="124" height="17" rx="2"/>
    <polygon points="40,42 98,42 84,156 34,164 20,122 40,88"/>
    <path d="M150,59 q30,2 30,30 l-12,0 q-2,-18 -22,-18 Z"/>
    <rect x="206" y="18" width="14" height="15" rx="2"/>
  </g>`;
}
function gShotgun(fill, stroke = 'none', sw = 0) {
  // over/under (ball-trap / chasse)
  return `<g fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
    <path d="M0,56 L58,40 L114,48 L114,98 L74,100 L44,114 L10,100 Z"/>
    <rect x="108" y="40" width="48" height="48" rx="5"/>
    <rect x="150" y="40" width="210" height="11" rx="3"/>
    <rect x="150" y="56" width="210" height="11" rx="3"/>
    <rect x="150" y="72" width="74" height="17" rx="7"/>
    <rect x="354" y="38" width="11" height="31" rx="2"/>
  </g>`;
}

/* ------------------------------------------------------------------- cœur */
function heartPath() {
  return 'M0,56 C-31,26 -54,6 -54,-16 C-54,-37 -31,-47 -12,-31 C-6,-26 0,-17 0,-11 C0,-17 6,-26 12,-31 C31,-47 54,-37 54,-16 C54,6 31,26 0,56 Z';
}
function heart(cx, cy, scale, p, idx, glossy) {
  const id = `h${idx}`;
  const grad = `<radialGradient id="${id}" cx="38%" cy="30%" r="80%">
      <stop offset="0%" stop-color="${p.heartHi}"/>
      <stop offset="45%" stop-color="${p.accent}"/>
      <stop offset="100%" stop-color="${p.accent2}"/>
    </radialGradient>`;
  const gloss = glossy
    ? `<path d="M-30,-22 C-40,-6 -34,12 -16,22 C-30,4 -26,-12 -12,-22 C-22,-26 -27,-25 -30,-22 Z" fill="#ffffff" opacity="0.35"/>`
    : '';
  return {
    defs: grad,
    body: `<g transform="translate(${cx},${cy}) scale(${scale})">
      <path d="${heartPath()}" fill="url(#${id})" stroke="${p.accent2}" stroke-width="2.5"/>
      ${gloss}
    </g>`
  };
}

/* ------------------------------------------------------- patterns (camo) */
function camoPattern(id, p) {
  return `<pattern id="${id}" width="180" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
    <rect width="180" height="180" fill="${p.bg1}"/>
    <path d="M10,30 q40,-30 80,-5 q40,25 10,55 q-35,30 -75,5 q-30,-25 -15,-60 Z" fill="#3a4520"/>
    <path d="M95,90 q35,-22 70,5 q22,30 -10,55 q-40,25 -70,-5 q-20,-30 10,-55 Z" fill="#525d2c"/>
    <path d="M120,10 q30,15 12,42 q-25,22 -52,2 q-15,-30 40,-44 Z" fill="#2a3315"/>
    <path d="M20,120 q28,-12 44,14 q12,28 -20,40 q-34,8 -40,-24 q-2,-20 16,-30 Z" fill="#6b7536"/>
    <ellipse cx="150" cy="150" rx="26" ry="18" fill="#222a12"/>
    <ellipse cx="60" cy="80" rx="14" ry="10" fill="#79844a"/>
  </pattern>`;
}

/* ---------------------------------------------------- composition centrale
 * Renvoie {defs, body} dessinant les armes + cœur dans un repère 1000x1000. */
function centerArt(concept, style, p, key) {
  let defs = '', body = '';
  const metalGrad = (id, c1, c2, c3) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c1}"/><stop offset="50%" stop-color="${c2}"/><stop offset="100%" stop-color="${c3}"/>
    </linearGradient>`;

  // couleur des armes selon style
  let gunFill, gunStroke = 'none', gunSW = 0;
  if (style === 'metal') {
    const gid = `mg_${key}`;
    if (p.gold) defs += metalGrad(gid, p.gold1, p.gold2, p.gold3);
    else defs += metalGrad(gid, p.steel1, p.steel2, p.steelDk);
    gunFill = `url(#${gid})`;
    gunStroke = p.gold ? p.gold3 : '#0c0e12'; gunSW = 2;
  } else if (style === 'patch') {
    gunFill = p.gold ? p.steel2 : p.steel2;
    gunStroke = p.stitch; gunSW = 4;
  } else { // vector
    gunFill = p.gold ? p.gold2 : (p.camo ? p.steel1 : p.steel1);
    gunStroke = 'none'; gunSW = 0;
  }

  const glossy = style === 'metal';
  let hIdx = `ht_${key}`;

  if (concept === 'ar15') {
    body += `<g transform="translate(500,520) scale(1.42) translate(-183,-88)">${gAR15(gunFill, gunStroke, gunSW)}</g>`;
    const h = heart(500, 360, 1.55, p, hIdx, glossy); defs += h.defs; body += h.body;
  } else if (concept === 'glock') {
    body += `<g transform="translate(500,545) scale(1.7) translate(-120,-86)">${gGlock(gunFill, gunStroke, gunSW)}</g>`;
    const h = heart(500, 330, 1.5, p, hIdx, glossy); defs += h.defs; body += h.body;
  } else if (concept === 'shotgun') {
    body += `<g transform="translate(500,560) scale(1.4) translate(-183,-77)">${gShotgun(gunFill, gunStroke, gunSW)}</g>`;
    // plateau d'argile (clay)
    defs += `<radialGradient id="clay_${key}" cx="40%" cy="35%" r="75%"><stop offset="0%" stop-color="#ffb24d"/><stop offset="100%" stop-color="#c25a00"/></radialGradient>`;
    body += `<g transform="translate(742,360)"><ellipse cx="0" cy="0" rx="46" ry="17" fill="url(#clay_${key})" stroke="#7a3a00" stroke-width="2"/><ellipse cx="0" cy="-4" rx="30" ry="9" fill="#ffd9a0" opacity="0.55"/>
      <g stroke="#c25a00" stroke-width="5" stroke-linecap="round" opacity="0.8"><line x1="55" y1="-12" x2="92" y2="-20"/><line x1="55" y1="2" x2="96" y2="2"/><line x1="55" y1="14" x2="90" y2="24"/></g></g>`;
    const h = heart(500, 330, 1.5, p, hIdx, glossy); defs += h.defs; body += h.body;
  } else { // crossed
    body += `<g transform="translate(500,545) rotate(-29) scale(1.3) translate(-183,-88)">${gAR15(gunFill, gunStroke, gunSW)}</g>`;
    body += `<g transform="translate(500,545) rotate(29) scale(1.3) translate(-183,-77)">${gShotgun(gunFill, gunStroke, gunSW)}</g>`;
    const h = heart(500, 540, 1.85, p, hIdx, glossy); defs += h.defs; body += h.body;
  }
  return { defs, body };
}

/* ------------------------------------------------------------ cadres/styles */
function frameAndText(style, p, key, opts = {}) {
  const top = opts.top || 'TIR · BALL-TRAP · CHASSE';
  const name = opts.name || 'LA DÉTENTE';
  let defs = '', back = '', front = '';

  if (style === 'patch') {
    defs += `<radialGradient id="bg_${key}" cx="50%" cy="42%" r="62%"><stop offset="0%" stop-color="${p.bg1}"/><stop offset="100%" stop-color="${p.bg2}"/></radialGradient>`;
    if (p.camo) defs += camoPattern(`camo_${key}`, p);
    const innerFill = p.camo ? `url(#camo_${key})` : `url(#bg_${key})`;
    back += `<circle cx="500" cy="500" r="486" fill="${p.accent}"/>`;                    // merrowed border
    back += `<circle cx="500" cy="500" r="486" fill="none" stroke="${p.accent2}" stroke-width="6"/>`;
    back += `<circle cx="500" cy="500" r="452" fill="${innerFill}"/>`;
    back += `<circle cx="500" cy="500" r="452" fill="none" stroke="${p.stitch}" stroke-width="5" stroke-dasharray="2 11" stroke-linecap="round" opacity="0.9"/>`;
    back += `<circle cx="500" cy="500" r="404" fill="none" stroke="${p.stitch}" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round" opacity="0.65"/>`;
    // arc top
    front += arcText(500, 500, 404, -90, 150, top, { size: 50, fill: p.stitch });
    // ruban bas
    if (!opts.noName) front += ribbon(500, 792, 360, p, name, key);
    // étoiles séparatrices
    front += star(214, 500, 14, p.stitch) + star(786, 500, 14, p.stitch);
    return { defs, back, front };
  }

  if (style === 'metal') {
    defs += `<radialGradient id="bg_${key}" cx="50%" cy="38%" r="70%"><stop offset="0%" stop-color="${p.bg1}"/><stop offset="100%" stop-color="${p.bg2}"/></radialGradient>`;
    const r1 = p.gold ? p.gold1 : p.steel1, r2 = p.gold ? p.gold2 : p.steel2, r3 = p.gold ? p.gold3 : p.steelDk;
    defs += `<linearGradient id="ring_${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${r1}"/><stop offset="45%" stop-color="${r2}"/><stop offset="100%" stop-color="${r3}"/></linearGradient>`;
    back += `<circle cx="500" cy="500" r="488" fill="url(#ring_${key})"/>`;
    back += `<circle cx="500" cy="500" r="488" fill="none" stroke="${r3}" stroke-width="3"/>`;
    back += `<circle cx="500" cy="500" r="470" fill="none" stroke="${r1}" stroke-width="2" opacity="0.7"/>`;
    back += `<circle cx="500" cy="500" r="430" fill="url(#bg_${key})"/>`;
    back += `<circle cx="500" cy="500" r="430" fill="none" stroke="${r3}" stroke-width="6"/>`;
    back += `<circle cx="500" cy="500" r="426" fill="none" stroke="${r1}" stroke-width="2" opacity="0.5"/>`;
    // reflet supérieur sur l'anneau
    back += `<path d="M150,300 A488,488 0 0 1 850,300" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.18"/>`;
    // rivets
    for (let a = 0; a < 360; a += 30) { const rad = a * Math.PI / 180; back += `<circle cx="${(500 + 449 * Math.cos(rad)).toFixed(1)}" cy="${(500 + 449 * Math.sin(rad)).toFixed(1)}" r="6" fill="${r3}"/>`; }
    if (!opts.noTop) front += arcText(500, 500, 392, -90, 150, top, { size: 46, fill: r1 });
    if (!opts.noName) front += ribbon(500, 800, 380, p, name, key, true);
    return { defs, back, front };
  }

  // vector (moderne, écusson hexagonal épuré)
  defs += `<linearGradient id="bg_${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.bg1}"/><stop offset="100%" stop-color="${p.bg2}"/></linearGradient>`;
  if (p.camo) defs += camoPattern(`camo_${key}`, p);
  const shield = 'M500,40 L880,235 L880,640 C880,820 700,920 500,968 C300,920 120,820 120,640 L120,235 Z';
  const innerFill = p.camo ? `url(#camo_${key})` : `url(#bg_${key})`;
  const edge = p.gold ? p.gold2 : p.accent;
  back += `<path d="${shield}" fill="${innerFill}" stroke="${edge}" stroke-width="14" stroke-linejoin="round"/>`;
  back += `<path d="${shield}" fill="none" stroke="${p.stitch}" stroke-width="3" stroke-linejoin="round" opacity="0.35" transform="translate(0,0) scale(1)"/>`;
  back += `<path d="M500,92 L832,262 L832,628 C832,786 676,876 500,920 C324,876 168,786 168,628 L168,262 Z" fill="none" stroke="${edge}" stroke-width="4" opacity="0.5"/>`;
  // barre nom
  front += `<rect x="250" y="742" width="500" height="86" rx="14" fill="${edge}"/>`;
  front += `<text x="500" y="802" font-family="${FONT}" font-weight="bold" font-size="64" letter-spacing="4" text-anchor="middle" fill="${p.gold ? '#15140f' : '#ffffff'}">${name}</text>`;
  front += `<text x="500" y="690" font-family="${FONT}" font-weight="bold" font-size="34" letter-spacing="7" text-anchor="middle" fill="${p.sub}">${top}</text>`;
  return { defs, back, front };
}

function ribbon(cx, cy, w, p, txt, key, gold) {
  const h = 96, x = cx - w / 2, y = cy - h / 2;
  const fill = gold ? `url(#rib_${key})` : p.accent;
  let defs = '';
  const tail = 34;
  const main = `<path d="M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z" fill="${fill}" stroke="${p.accent2}" stroke-width="3"/>`;
  const folds = `
    <path d="M${x},${y + 8} L${x - tail},${y + 22} L${x - tail},${y + h + 14} L${x},${y + h - 6} Z" fill="${p.accent2}"/>
    <path d="M${x + w},${y + 8} L${x + w + tail},${y + 22} L${x + w + tail},${y + h + 14} L${x + w},${y + h - 6} Z" fill="${p.accent2}"/>`;
  const grad = gold ? `<linearGradient id="rib_${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.gold1}"/><stop offset="100%" stop-color="${p.gold2}"/></linearGradient>` : '';
  const tcol = gold ? '#15140f' : '#ffffff';
  const t = `<text x="${cx}" y="${cy + 19}" font-family="${FONT}" font-weight="bold" font-size="58" letter-spacing="3" text-anchor="middle" fill="${tcol}">${txt}</text>`;
  return `${grad}${folds}${main}${t}`;
}
/* texte en arc — placé caractère par caractère (librsvg ne gère pas textPath) */
function arcText(cx, cy, r, centerDeg, spanDeg, text, opt = {}, flip = false) {
  const size = opt.size || 40, fill = opt.fill || '#fff', weight = opt.weight || 'bold', font = opt.font || FONT;
  const chars = Array.from(text), n = chars.length;
  let out = `<g font-family="${font}" font-weight="${weight}" font-size="${size}" fill="${fill}" text-anchor="middle">`;
  for (let i = 0; i < n; i++) {
    if (chars[i] === ' ') continue;
    const t = n === 1 ? 0.5 : i / (n - 1);
    const ang = flip ? (centerDeg + spanDeg / 2 - t * spanDeg) : (centerDeg - spanDeg / 2 + t * spanDeg);
    const rad = ang * Math.PI / 180;
    const x = cx + r * Math.cos(rad), y = cy + r * Math.sin(rad);
    const rot = (flip ? ang - 90 : ang + 90).toFixed(2);
    out += `<text x="${x.toFixed(1)}" y="${(y + size * 0.34).toFixed(1)}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})">${chars[i]}</text>`;
  }
  return out + '</g>';
}
function star(cx, cy, r, fill) {
  let pts = [];
  for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; pts.push(`${(cx + rr * Math.cos(ang)).toFixed(1)},${(cy + rr * Math.sin(ang)).toFixed(1)}`); }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

/* ----------------------------------------------------- assemblage emblème */
function emblemSVG(concept, style, palKey, size = 1600) {
  const p = PAL[palKey];
  const key = `${concept}_${style}_${palKey}`.replace(/[^a-z0-9]/gi, '');
  const ft = frameAndText(style, p, key);
  const art = centerArt(concept, style, p, key);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 1000 1000">
  <defs>${ft.defs}${art.defs}</defs>
  ${ft.back}
  ${art.body}
  ${ft.front}
</svg>`;
}

/* ----------------------------------------------------------------- contenu réutilisable (sans cadre) pour mockups/logo */
function emblemContentGroup(concept, style, palKey, key, opts = {}) {
  const p = PAL[palKey];
  const ft = frameAndText(style, p, key, opts);
  const art = centerArt(concept, style, p, key);
  return { defs: ft.defs + art.defs, markup: `${ft.back}${art.body}${ft.front}` };
}

/* =========================================================== LOGOS NOMMÉS */
function logoHorizontal(size = 2000) {
  const p = PAL.noirRouge; const key = 'lh';
  const e = emblemContentGroup('crossed', 'metal', 'noirRouge', 'lhemb', { noName: true, noTop: true });
  const H = Math.round(size * 9 / 16);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${H}" viewBox="0 0 1600 900">
   <defs>
     ${e.defs}
     <linearGradient id="bgL" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#16171c"/><stop offset="100%" stop-color="#070809"/></linearGradient>
     <linearGradient id="wm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#c7ccd4"/></linearGradient>
   </defs>
   <rect width="1600" height="900" fill="url(#bgL)"/>
   <rect x="40" y="40" width="1520" height="820" rx="26" fill="none" stroke="#2a2d34" stroke-width="3"/>
   <g transform="translate(70,180) scale(0.54)">${e.markup}</g>
   <g transform="translate(640,0)">
     <path d="${heartPath()}" transform="translate(30,278) scale(0.46)" fill="${p.accent}"/>
     <text x="78" y="300" font-family="${FONT}" font-weight="bold" font-size="44" letter-spacing="6" fill="${p.accent}">ON VISE AU CŒUR</text>
     <text x="0" y="430" font-family="${FONT}" font-weight="bold" font-size="196" letter-spacing="2" fill="url(#wm)">LA</text>
     <text x="0" y="616" font-family="${FONT}" font-weight="bold" font-size="176" letter-spacing="1" fill="url(#wm)">DÉTENTE</text>
     <rect x="6" y="464" width="720" height="6" fill="${p.accent}"/>
     <text x="8" y="706" font-family="${FONT}" font-weight="bold" font-size="46" letter-spacing="11" fill="#c9ccd3">TIR · BALL-TRAP · CHASSE</text>
   </g>
  </svg>`;
}
function logoSeal(size = 1600) {
  const p = PAL.noirOr; const key = 'ls';
  const e = emblemContentGroup('crossed', 'metal', 'noirOr', 'lsemb', { noName: true, noTop: true });
  // anneau de texte externe
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 1000 1000">
   <defs>
     ${e.defs}
     <radialGradient id="sealbg" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#16141b"/><stop offset="100%" stop-color="#08070b"/></radialGradient>
     <linearGradient id="sealring" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.gold1}"/><stop offset="50%" stop-color="${p.gold2}"/><stop offset="100%" stop-color="${p.gold3}"/></linearGradient>
     <path id="seatTop" d="M500,500 m-405,0 a405,405 0 1,1 810,0" fill="none"/>
     <path id="seatBot" d="M160,560 a360,360 0 0,0 680,0" fill="none"/>
   </defs>
   <circle cx="500" cy="500" r="496" fill="url(#sealring)"/>
   <circle cx="500" cy="500" r="470" fill="url(#sealbg)"/>
   <circle cx="500" cy="500" r="470" fill="none" stroke="${p.gold3}" stroke-width="3"/>
   ${arcText(500, 500, 430, -90, 154, 'LA DÉTENTE', { size: 78, fill: p.gold1 })}
   ${arcText(500, 500, 430, 90, 150, 'TIR · BALL-TRAP · CHASSE', { size: 38, fill: p.gold2 }, true)}
   <g transform="translate(500,500) scale(0.66) translate(-500,-500)">${e.markup}</g>
  </svg>`;
}

/* =============================================================== MOCKUPS */
function mockCap(size = 1600) {
  const e = emblemContentGroup('crossed', 'patch', 'camo', 'mcap');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${Math.round(size*0.75)}" viewBox="0 0 1600 1200">
   <defs>${e.defs}
     <linearGradient id="capbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#272b33"/><stop offset="100%" stop-color="#14161b"/></linearGradient>
     <linearGradient id="capcol" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#586331"/><stop offset="100%" stop-color="#333c1d"/></linearGradient>
   </defs>
   <rect width="1600" height="1200" fill="url(#capbg)"/>
   <ellipse cx="800" cy="690" rx="330" ry="46" fill="#000000" opacity="0.28"/>
   <text x="800" y="115" font-family="${FONT}" font-weight="bold" font-size="46" letter-spacing="10" text-anchor="middle" fill="#7d848f">CASQUETTE BRODÉE — PATCH FRONTAL</text>
   <!-- casquette (vue de face) -->
   <g transform="translate(800,560)">
     <!-- visiere (devant, bien marquee) -->
     <path d="M-262,46 C-150,265 150,265 262,46 C150,118 -150,118 -262,46 Z" fill="#202611" stroke="#0c0f06" stroke-width="6"/>
     <path d="M-262,46 C-150,118 150,118 262,46" fill="none" stroke="#3a4422" stroke-width="3" opacity="0.7"/>
     <path d="M-150,150 C-60,196 60,196 150,150" fill="none" stroke="#3a4422" stroke-width="4" opacity="0.5"/>
     <!-- calotte -->
     <path d="M-258,58 C-258,-278 258,-278 258,58 C258,98 216,116 168,116 L-168,116 C-216,116 -258,98 -258,58 Z" fill="url(#capcol)" stroke="#11140b" stroke-width="3"/>
     <!-- reflet -->
     <path d="M-200,-150 C-140,-244 140,-244 200,-150" fill="none" stroke="#79854a" stroke-width="12" stroke-linecap="round" opacity="0.45"/>
     <!-- coutures 6 panneaux -->
     <path d="M0,-274 L0,112" stroke="#2c3318" stroke-width="3" opacity="0.8"/>
     <path d="M-150,-246 C-148,-60 -150,40 -150,112" stroke="#2c3318" stroke-width="3" fill="none" opacity="0.6"/>
     <path d="M150,-246 C148,-60 150,40 150,112" stroke="#2c3318" stroke-width="3" fill="none" opacity="0.6"/>
     <!-- bande de proprete -->
     <path d="M-258,58 C-258,98 216,116 168,116 L-168,116 C-216,116 -258,98 -258,58" fill="none" stroke="#161a0c" stroke-width="7"/>
     <!-- bouton -->
     <circle cx="0" cy="-266" r="15" fill="#3a4422" stroke="#161a0c" stroke-width="2"/>
     <!-- oeillets -->
     <circle cx="-78" cy="-140" r="6" fill="#161a0c"/><circle cx="78" cy="-140" r="6" fill="#161a0c"/>
     <!-- patch brode sur panneau frontal -->
     <g transform="translate(0,-96) scale(0.285) translate(-500,-500)">${e.markup}</g>
   </g>
  </svg>`;
}
function mockStickers(size = 1600) {
  const a = emblemContentGroup('ar15', 'vector', 'noirRouge', 'st1');
  const b = emblemContentGroup('glock', 'vector', 'noirRouge', 'st2');
  const c = emblemContentGroup('shotgun', 'patch', 'camo', 'st3');
  const d = emblemContentGroup('crossed', 'metal', 'noirOr', 'st4');
  const cut = (x, y, s, inner, idx) => `<g>
      <circle cx="${x}" cy="${y}" r="${s*0.52*500/500*1.04}" fill="#ffffff"/>
      <circle cx="${x}" cy="${y}" r="${s*0.54*500}" fill="none" stroke="#b9bec6" stroke-width="3" stroke-dasharray="10 9"/>
      <g transform="translate(${x},${y}) scale(${s}) translate(-500,-500)">${inner}</g>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${Math.round(size*1.2)}" viewBox="0 0 1600 1920">
    <defs>${a.defs}${b.defs}${c.defs}${d.defs}</defs>
    <rect width="1600" height="1920" fill="#e9ebee"/>
    <rect x="40" y="40" width="1520" height="1840" rx="24" fill="#ffffff" stroke="#cdd2d8" stroke-width="2"/>
    <text x="800" y="150" font-family="${FONT}" font-weight="bold" font-size="58" letter-spacing="8" text-anchor="middle" fill="#1a1c22">LA DÉTENTE — PLANCHE STICKERS</text>
    <circle cx="430" cy="640" r="392" fill="#ffffff"/>
    ${cut(430,640,0.74,a.markup)}
    ${cut(1170,640,0.74,b.markup)}
    ${cut(430,1430,0.74,c.markup)}
    ${cut(1170,1430,0.74,d.markup)}
  </svg>`;
}
function mockSign(size = 2000) {
  const e = emblemContentGroup('crossed', 'metal', 'noirOr', 'msign');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${Math.round(size*0.62)}" viewBox="0 0 2000 1240">
   <defs>${e.defs}
     <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a2b30"/><stop offset="100%" stop-color="#17181c"/></linearGradient>
     <linearGradient id="board" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#141318"/><stop offset="100%" stop-color="#090810"/></linearGradient>
     <linearGradient id="frame" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f6e9b0"/><stop offset="50%" stop-color="#c69b33"/><stop offset="100%" stop-color="#8a6b1f"/></linearGradient>
   </defs>
   <rect width="2000" height="1240" fill="url(#wall)"/>
   <g opacity="0.10" stroke="#000" stroke-width="2">${Array.from({length:9},(_,i)=>`<line x1="0" y1="${i*150}" x2="2000" y2="${i*150}"/>`).join('')}${Array.from({length:14},(_,i)=>`<line x1="${i*150}" y1="0" x2="${i*150}" y2="1240"/>`).join('')}</g>
   <!-- potence -->
   <rect x="150" y="120" width="34" height="60" fill="#0c0d10"/>
   <rect x="120" y="170" width="1760" height="900" rx="20" fill="url(#frame)"/>
   <rect x="140" y="190" width="1720" height="860" rx="14" fill="url(#board)" stroke="#000" stroke-width="2"/>
   <rect x="140" y="190" width="1720" height="860" rx="14" fill="none" stroke="#c69b33" stroke-width="2" opacity="0.5"/>
   <g transform="translate(560,620) scale(0.82) translate(-500,-500)">${e.markup}</g>
   <g transform="translate(1100,0)">
     <text x="0" y="500" font-family="${FONT}" font-weight="bold" font-size="170" letter-spacing="2" fill="#f6e9b0">LA</text>
     <text x="0" y="680" font-family="${FONT}" font-weight="bold" font-size="170" letter-spacing="2" fill="#f6e9b0">DÉTENTE</text>
     <rect x="6" y="540" width="640" height="6" fill="#e51f2b"/>
     <text x="8" y="770" font-family="${FONT}" font-weight="bold" font-size="33" letter-spacing="5" fill="#cdbd86">ARMURERIE · TIR SPORTIF · CHASSE</text>
   </g>
   <!-- spots -->
   <g opacity="0.10" fill="#fff"><polygon points="500,170 380,170 240,420 560,420"/><polygon points="1500,170 1620,170 1760,420 1440,420"/></g>
  </svg>`;
}
function mockTshirt(size = 1600) {
  const e = emblemContentGroup('crossed', 'patch', 'noirRouge', 'mtee');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${Math.round(size*1.05)}" viewBox="0 0 1600 1680">
   <defs>${e.defs}
     <linearGradient id="teebg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#23252b"/><stop offset="100%" stop-color="#0d0e12"/></linearGradient>
     <linearGradient id="tee" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1c1d22"/><stop offset="100%" stop-color="#101116"/></linearGradient>
   </defs>
   <rect width="1600" height="1680" fill="url(#teebg)"/>
   <text x="800" y="120" font-family="${FONT}" font-weight="bold" font-size="46" letter-spacing="10" text-anchor="middle" fill="#7d848f">T-SHIRT — EMBLÈME POITRINE</text>
   <g transform="translate(800,900)">
     <path d="M-360,-560 L-180,-620 C-150,-540 150,-540 180,-620 L360,-560 L470,-380 L330,-300 L300,-300 L300,560 L-300,560 L-300,-300 L-330,-300 L-470,-380 Z" fill="url(#tee)" stroke="#2a2d34" stroke-width="3"/>
     <path d="M-180,-620 C-150,-540 150,-540 180,-620" fill="none" stroke="#0a0b0e" stroke-width="6"/>
     <path d="M-180,-612 C-150,-536 150,-536 180,-612" fill="none" stroke="#3a3d47" stroke-width="2" opacity="0.5"/>
     <!-- emblème -->
     <g transform="translate(0,-150) scale(0.62) translate(-500,-500)">${e.markup}</g>
   </g>
  </svg>`;
}

/* ===================================================== MONOCHROME (1 encre)
 * Pour broderie / sérigraphie / tampon. Fond transparent, une seule couleur. */
function heartFlat(cx, cy, scale, color) {
  return `<g transform="translate(${cx},${cy}) scale(${scale})"><path d="${heartPath()}" fill="${color}"/></g>`;
}
function monoMark(concept, color, size = 1600) {
  let guns = '', h = '';
  const G = (m) => `fill="none" stroke="${color}" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"`;
  if (concept === 'ar15') {
    guns = `<g transform="translate(500,520) scale(1.42) translate(-183,-88)">${gAR15('none', color, 8)}</g>`;
    h = heartFlat(500, 360, 1.5, color);
  } else if (concept === 'glock') {
    guns = `<g transform="translate(500,545) scale(1.7) translate(-120,-86)">${gGlock('none', color, 7)}</g>`;
    h = heartFlat(500, 330, 1.45, color);
  } else if (concept === 'shotgun') {
    guns = `<g transform="translate(500,560) scale(1.4) translate(-183,-77)">${gShotgun('none', color, 8)}</g>`;
    h = heartFlat(500, 330, 1.45, color);
  } else {
    guns = `<g transform="translate(500,545) rotate(-29) scale(1.3) translate(-183,-88)">${gAR15('none', color, 8)}</g>`
      + `<g transform="translate(500,545) rotate(29) scale(1.3) translate(-183,-77)">${gShotgun('none', color, 8)}</g>`;
    h = heartFlat(500, 545, 1.8, color);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 1000 1000">
    <circle cx="500" cy="500" r="466" fill="none" stroke="${color}" stroke-width="14"/>
    <circle cx="500" cy="500" r="430" fill="none" stroke="${color}" stroke-width="4"/>
    ${arcText(500, 500, 392, -90, 150, 'TIR · BALL-TRAP · CHASSE', { size: 44, fill: color })}
    ${guns}${h}
    <rect x="300" y="772" width="400" height="74" rx="10" fill="${color}"/>
    <text x="500" y="824" font-family="${FONT}" font-weight="bold" font-size="52" letter-spacing="3" text-anchor="middle" fill="#ffffff">LA DÉTENTE</text>
  </svg>`;
}

/* ============================================ LOGO HORIZONTAL (multi-palette) */
function logoHoriz(palKey, size = 2000) {
  const conf = {
    noirRouge: { bg1: '#16171c', bg2: '#070809', wm1: '#ffffff', wm2: '#c7ccd4', accent: '#e51f2b', tag: '#c9ccd3', embStyle: 'metal', tcol: '#ffffff' },
    camo: { bg1: '#222818', bg2: '#0c0f08', wm1: '#ede6cd', wm2: '#a7af79', accent: '#d72a25', tag: '#cdd0b4', embStyle: 'patch', tcol: '#1a1f12' },
    noirOr: { bg1: '#16141b', bg2: '#07060a', wm1: '#fff3c4', wm2: '#c59b32', accent: '#e51f2b', tag: '#cdbd86', embStyle: 'metal', tcol: '#15140f' }
  }[palKey];
  const p = PAL[palKey];
  const e = emblemContentGroup('crossed', conf.embStyle, palKey, 'lh' + palKey, { noName: true, noTop: true });
  const H = Math.round(size * 9 / 16);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${H}" viewBox="0 0 1600 900">
   <defs>${e.defs}
     <linearGradient id="bgL${palKey}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${conf.bg1}"/><stop offset="100%" stop-color="${conf.bg2}"/></linearGradient>
     <linearGradient id="wm${palKey}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${conf.wm1}"/><stop offset="100%" stop-color="${conf.wm2}"/></linearGradient>
   </defs>
   <rect width="1600" height="900" fill="url(#bgL${palKey})"/>
   <rect x="40" y="40" width="1520" height="820" rx="26" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="3"/>
   <g transform="translate(70,180) scale(0.54)">${e.markup}</g>
   <g transform="translate(640,0)">
     <path d="${heartPath()}" transform="translate(30,278) scale(0.46)" fill="${conf.accent}"/>
     <text x="78" y="300" font-family="${FONT}" font-weight="bold" font-size="44" letter-spacing="6" fill="${conf.accent}">ON VISE AU CŒUR</text>
     <text x="0" y="430" font-family="${FONT}" font-weight="bold" font-size="196" letter-spacing="2" fill="url(#wm${palKey})">LA</text>
     <text x="0" y="616" font-family="${FONT}" font-weight="bold" font-size="176" letter-spacing="1" fill="url(#wm${palKey})">DÉTENTE</text>
     <rect x="6" y="464" width="720" height="6" fill="${conf.accent}"/>
     <text x="8" y="706" font-family="${FONT}" font-weight="bold" font-size="46" letter-spacing="11" fill="${conf.tag}">TIR · BALL-TRAP · CHASSE</text>
   </g>
  </svg>`;
}

/* ====================================================== CHARTE GRAPHIQUE */
function brandSheet(size = 1600) {
  const e = emblemContentGroup('crossed', 'metal', 'noirRouge', 'bsemb', { noName: true, noTop: true });
  const sw = (x, y, c, hex, name) => `<g transform="translate(${x},${y})">
     <rect width="150" height="150" rx="14" fill="${c}" stroke="#2a2d34" stroke-width="2"/>
     <text x="75" y="186" font-family="${FONT}" font-weight="bold" font-size="22" text-anchor="middle" fill="#e7e9ee">${name}</text>
     <text x="75" y="214" font-family="${FONT}" font-size="20" text-anchor="middle" fill="#8a909b">${hex}</text>
   </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${Math.round(size * 1.32)}" viewBox="0 0 1600 2112">
   <defs>${e.defs}
     <linearGradient id="bsbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#15171c"/><stop offset="100%" stop-color="#0a0b0e"/></linearGradient>
     <linearGradient id="bswm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#c7ccd4"/></linearGradient>
   </defs>
   <rect width="1600" height="2112" fill="url(#bsbg)"/>
   <text x="80" y="120" font-family="${FONT}" font-weight="bold" font-size="40" letter-spacing="6" fill="#e51f2b">CHARTE GRAPHIQUE</text>
   <text x="80" y="172" font-family="${FONT}" font-size="26" letter-spacing="4" fill="#8a909b">LA DÉTENTE — armurerie · tir sportif · ball-trap · chasse</text>
   <line x1="80" y1="200" x2="1520" y2="200" stroke="#262932" stroke-width="2"/>

   <text x="80" y="262" font-family="${FONT}" font-weight="bold" font-size="26" letter-spacing="2" fill="#cfd3da">1 · LOGO PRINCIPAL</text>
   <g transform="translate(150,300) scale(0.46)">${e.markup}</g>
   <g transform="translate(560,300)">
     <path d="${heartPath()}" transform="translate(26,150) scale(0.4)" fill="#e51f2b"/>
     <text x="66" y="168" font-family="${FONT}" font-weight="bold" font-size="34" letter-spacing="5" fill="#e51f2b">ON VISE AU CŒUR</text>
     <text x="0" y="290" font-family="${FONT}" font-weight="bold" font-size="150" letter-spacing="2" fill="url(#bswm)">LA</text>
     <text x="0" y="430" font-family="${FONT}" font-weight="bold" font-size="132" letter-spacing="1" fill="url(#bswm)">DÉTENTE</text>
     <rect x="4" y="316" width="540" height="6" fill="#e51f2b"/>
     <text x="6" y="500" font-family="${FONT}" font-weight="bold" font-size="34" letter-spacing="9" fill="#c9ccd3">TIR · BALL-TRAP · CHASSE</text>
   </g>

   <text x="80" y="900" font-family="${FONT}" font-weight="bold" font-size="26" letter-spacing="2" fill="#cfd3da">2 · PALETTE</text>
   ${sw(80, 940, '#e51f2b', '#E51F2B', 'Rouge cœur')}
   ${sw(300, 940, '#0a0b0e', '#0A0B0E', 'Noir')}
   ${sw(520, 940, '#d4af37', '#D4AF37', 'Or')}
   ${sw(740, 940, '#586331', '#586331', 'Olive')}
   ${sw(960, 940, '#c7ccd4', '#C7CCD4', 'Acier')}
   ${sw(1180, 940, '#efe7d2', '#EFE7D2', 'Crème')}

   <text x="80" y="1320" font-family="${FONT}" font-weight="bold" font-size="26" letter-spacing="2" fill="#cfd3da">3 · VERSIONS 1 COULEUR (broderie / sérigraphie)</text>
   <rect x="80" y="1360" width="420" height="420" rx="16" fill="#0a0b0e" stroke="#262932" stroke-width="2"/>
   <g transform="translate(290,1570) scale(0.38) translate(-500,-500)">${monoInner('crossed', '#ffffff')}</g>
   <rect x="540" y="1360" width="420" height="420" rx="16" fill="#f3f1ea" stroke="#cfcdc4" stroke-width="2"/>
   <g transform="translate(750,1570) scale(0.38) translate(-500,-500)">${monoInner('crossed', '#111317')}</g>
   <rect x="1000" y="1360" width="420" height="420" rx="16" fill="#586331" stroke="#3c4422" stroke-width="2"/>
   <g transform="translate(1210,1570) scale(0.38) translate(-500,-500)">${monoInner('crossed', '#f3f1ea')}</g>

   <text x="80" y="1880" font-family="${FONT}" font-weight="bold" font-size="26" letter-spacing="2" fill="#cfd3da">4 · TYPOGRAPHIE</text>
   <text x="80" y="1946" font-family="${FONT}" font-weight="bold" font-size="64" fill="#e7e9ee">Aa Bb Cc — LA DÉTENTE 0123</text>
   <text x="80" y="2010" font-family="${FONT}" font-size="28" fill="#8a909b">Sans-serif bold condensé · titres en capitales · slogan en rouge accent</text>
   <text x="80" y="2070" font-family="${FONT}" font-size="24" fill="#5d636e">Sources vectorielles SVG fournies · couleurs RVB (conversion CMJN par l'imprimeur)</text>
  </svg>`;
}
/* contenu mono sans <svg> wrapper, pour intégration */
function monoInner(concept, color) {
  const full = monoMark(concept, color, 1000);
  return full.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

/* =============================================================== RENDER */
async function render(svg, outPath) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPath);
  fs.writeFileSync(outPath.replace(/\.png$/, '.svg'), svg);
}

const MATRIX = [
  ['crossed', 'patch', 'noirRouge', '01a-armes-croisees__patch__noir-rouge'],
  ['crossed', 'vector', 'camo', '01b-armes-croisees__vectoriel__camo'],
  ['crossed', 'metal', 'noirOr', '01c-armes-croisees__metal__noir-or'],
  ['ar15', 'patch', 'camo', '02a-ar15__patch__camo'],
  ['ar15', 'vector', 'noirRouge', '02b-ar15__vectoriel__noir-rouge'],
  ['ar15', 'metal', 'noirOr', '02c-ar15__metal__noir-or'],
  ['glock', 'patch', 'noirOr', '03a-glock__patch__noir-or'],
  ['glock', 'vector', 'noirRouge', '03b-glock__vectoriel__noir-rouge'],
  ['glock', 'metal', 'noirRouge', '03c-glock__metal__gunmetal'],
  ['shotgun', 'patch', 'camo', '04a-balltrap__patch__camo'],
  ['shotgun', 'vector', 'camo', '04b-balltrap__vectoriel__camo'],
  ['shotgun', 'metal', 'noirOr', '04c-balltrap__metal__noir-or'],
];

(async () => {
  for (const [c, s, pal, fn] of MATRIX) {
    await render(emblemSVG(c, s, pal), path.join(DIR.emb, fn + '.png'));
    console.log('emblème  ✓', fn);
  }
  await render(logoHorizontal(), path.join(DIR.logo, 'logo-horizontal__noir-rouge.png'));
  await render(logoSeal(), path.join(DIR.logo, 'logo-sceau-rond__noir-or.png'));
  console.log('logos    ✓');
  await render(mockCap(), path.join(DIR.mock, 'mockup-casquette-patch.png'));
  await render(mockStickers(), path.join(DIR.mock, 'mockup-planche-stickers.png'));
  await render(mockSign(), path.join(DIR.mock, 'mockup-enseigne-boutique.png'));
  await render(mockTshirt(), path.join(DIR.mock, 'mockup-tshirt.png'));
  console.log('mockups  ✓');

  // variantes de logo horizontal
  await render(logoHoriz('camo'), path.join(DIR.logo, 'logo-horizontal__camo.png'));
  await render(logoHoriz('noirOr'), path.join(DIR.logo, 'logo-horizontal__noir-or.png'));
  console.log('variantes ✓');

  // kit imprimeur : monochrome 1 couleur (noir + blanc, fond transparent)
  for (const c of ['crossed', 'ar15', 'glock', 'shotgun']) {
    await render(monoMark(c, '#111317'), path.join(DIR.print, `mono-${c}-noir.png`));
    await render(monoMark(c, '#ffffff'), path.join(DIR.print, `mono-${c}-blanc.png`));
  }
  // masters haute résolution (3000 px)
  await render(logoHoriz('noirRouge', 3000), path.join(DIR.print, 'master-logo-horizontal-3000.png'));
  await render(logoSeal(3000), path.join(DIR.print, 'master-sceau-3000.png'));
  await render(emblemSVG('crossed', 'metal', 'noirRouge', 3000), path.join(DIR.print, 'master-embleme-croise-3000.png'));
  // charte graphique
  await render(brandSheet(), path.join(DIR.print, 'charte-graphique.png'));
  console.log('print    ✓');

  console.log('\nTERMINÉ.');
})();
