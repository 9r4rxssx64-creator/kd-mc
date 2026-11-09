/* ============================================================================
 * LA VRAIE BEE EN 3D (v1.3, Kevin 8.11.2026 : « Pour l'instant nous ne vendons rien, alors intègre le vrai modèle, on verra la licence
 * plus tard. Je veux TOP QUALITÉ. »)
 *
 * Ce que c'est : la forme 3D de Bee (≈ 16 000 triangles, sortie d'un générateur image → 3D) habillée DU DESSIN de Bee vu de face,
 * avec un squelette (racine, tête, antennes, bras, jambes) et un VISAGE VIVANT dessiné à chaque image dans une toile posée sur la peau :
 * yeux qui clignent, regardent autour et suivent le doigt, paupières et sourcils selon l'humeur, bouche qui s'ouvre avec la voix, joues
 * qui rosissent quand elle est contente ; deux ailes translucides qui battent. Même vocabulaire d'humeurs que la Bee faite de formes
 * (repos, parle, joie, triste, pense, dort, marche, vole, saute, coucou…), même vie du corps (fondus, ressorts, micro-mouvements).
 *
 * Les données (forme, squelette, peau) sont dans un fichier À CÔTÉ du moteur : perso3d-reel.js (fabriqué hors ligne par
 * tools/3d/reel/fabriquer-reel.py). Il arrive par une simple balise <script> : AUCUNE requête réseau écrite à la main, aucun code
 * fabriqué à la volée, aucun module binaire (CSP strictes des apps). Il n'y a pas non plus de lecteur glTF : le maillage est reconstruit ici, à la main.
 *
 * Repli : sans ces données, données illisibles, WebGL faible, ou interrupteur coupé (window.KDMC_BEE_REEL === false ou
 * localStorage kdmc_bee_reel = 0), creer('bee') rend la Bee faite de formes, sans un mot.
 *
 * ⚠ LICENCE À RÉGLER AVANT TOUTE VENTE : la forme 3D vient de Tencent Hunyuan3D-2, dont la licence interdit l'usage commercial
 * (et l'usage dans l'UE, au Royaume-Uni et en Corée du Sud). Kevin (8.11) : « on ne vend rien pour l'instant, on verra plus tard ».
 * Tout est derrière BEE_REEL_PAR_DEFAUT : le passer à false rend partout la Bee faite de formes (aucune autre modification).
 *
 * LE VRAI BOURRICOT (v1.4, Kevin 8.11.2026 : « Pareil pour donkey ») : le MÊME moteur, avec ses propres données (perso3d-reel-ane.js,
 * window.KdmcAneReelData, fabriquées par le même outil avec --perso bourricot) : forme générée habillée du dessin de Bourricot vu de face,
 * 9 os (racine, tête, 2 OREILLES, 2 bras, 2 jambes, queue), le même visage vivant dessiné à chaque image (grands yeux bruns brillants,
 * sans cils, petits sourcils, bouche sur le museau, joues roses). Ses données ne sont demandées qu'au premier Bourricot affiché.
 * Interrupteur à part : ANE_REEL_PAR_DEFAUT + localStorage kdmc_ane_reel = 0 / window.KDMC_ANE_REEL = false. Même repli silencieux.
 * ⚠ La forme de Bourricot vient de Tencent Hunyuan3D-2.1 (licence communautaire Tencent : pas dans l'UE / le Royaume-Uni / la Corée
 * du Sud, conditions pour un usage commercial) — même réserve que pour Bee, voir KEVIN_ACTIONS_TODO.
 * ========================================================================== */
import {
  Group, Bone, Skeleton, SkinnedMesh, Mesh, BufferGeometry, BufferAttribute, Uint16BufferAttribute, MeshStandardMaterial,
  CanvasTexture, Texture, SRGBColorSpace, DoubleSide, LinearMipmapLinearFilter, Euler, PlaneGeometry
} from 'three';
import { LID_OUVERT, LID_FERME } from './personnages-def.mjs';

/* Les interrupteurs généraux (voir ⚠ LICENCE ci-dessus) : un par personnage. */
export const BEE_REEL_PAR_DEFAUT = true;
export const ANE_REEL_PAR_DEFAUT = true;
export const FORMAT_REEL = 1;
const RAD = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* CE QUI CHANGE D'UN PERSONNAGE À L'AUTRE : où sont ses données, ses interrupteurs, et le style de son visage (couleurs, cils, reflets) */
const PERSOS = {
  bee: { variable: 'KdmcBeeReelData', fichier: 'perso3d-reel.js', cle: 'kdmc_bee_reel', parDefaut: () => BEE_REEL_PAR_DEFAUT,
    drapeau: () => (typeof window !== 'undefined' ? window.KDMC_BEE_REEL : undefined) },
  bourricot: { variable: 'KdmcAneReelData', fichier: 'perso3d-reel-ane.js', cle: 'kdmc_ane_reel', parDefaut: () => ANE_REEL_PAR_DEFAUT,
    drapeau: () => (typeof window !== 'undefined' ? window.KDMC_ANE_REEL : undefined) },
};
/* l'état des données, par personnage : 0 rien · 1 en route · 2 prête · -1 illisible / absente */
const E = { bee: { D: null, etat: 0, image: null, commun: null }, bourricot: { D: null, etat: 0, image: null, commun: null } };
const ici = (nom) => E[nom || 'bee'];
export const reelEtat = (nom) => (ici(nom) ? ici(nom).etat : -1);
export const reelPret = (nom) => !!ici(nom) && ici(nom).etat === 2;
export const reelConnu = (nom) => !!PERSOS[nom];
export function reelVoulu(nom) {
  const P = PERSOS[nom || 'bee'];
  if (!P) return false;
  try {
    if (P.drapeau() === false) return false;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(P.cle) === '0') return false;
    if (P.drapeau() === true) return true;
  } catch (_) { /* stockage fermé (navigation privée) : réglage par défaut */ }
  return P.parDefaut();
}

/* Les données arrivent : on les lit (forme), puis on décode la peau (image JPEG intégrée) — prête quand l'image l'est. */
function lire(st, d) {
  if (!d || d.format !== FORMAT_REEL || typeof d.geo !== 'string' || typeof d.peau !== 'string' || !/^data:image\/jpeg;base64,/.test(d.peau) ||
      !Array.isArray(d.os) || d.os.indexOf('tete') < 0 || d.os.indexOf('racine') !== 0) { st.etat = -1; return; }
  try {
    const s = atob(d.geo), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    const attendu = d.n * 6 + d.n * 3 + d.n * 4, pad = attendu % 2;
    if (u.length !== attendu + pad + d.nf * 6 + d.nv * 2) { st.etat = -1; return; }
    st.D = Object.assign({}, d, { bin: u });
  } catch (_) { st.etat = -1; return; }
  const im = new Image();
  im.onload = () => { if (im.naturalWidth > 0) { st.image = im; st.etat = 2; } else st.etat = -1; };
  im.onerror = () => { st.etat = -1; };
  im.src = d.peau;
}
/* On demande les données d'un personnage (balise <script> posée à côté du moteur) ; `nom` absent = Bee (appel d'origine). */
export function preparerReel(srcMoteur, nom) {
  nom = nom || 'bee';
  const P = PERSOS[nom], st = E[nom];
  if (!P || typeof window === 'undefined' || typeof document === 'undefined') return;
  if (st.etat !== 0) return;
  if (window[P.variable]) { st.etat = 1; lire(st, window[P.variable]); return; }
  if (!reelVoulu(nom) || !srcMoteur) return;              // interrupteur coupé : on ne charge même pas les données
  st.etat = 1;
  try {
    const sc = document.createElement('script');
    sc.async = true;
    sc.src = srcMoteur.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + P.fichier + (srcMoteur.match(/\?[^#]*/) || [''])[0];
    sc.onload = () => { if (window[P.variable]) lire(st, window[P.variable]); else st.etat = -1; };
    sc.onerror = () => { st.etat = -1; };
    (document.head || document.documentElement).appendChild(sc);
  } catch (_) { st.etat = -1; }
}

/* ---------------------------------------------------------------------------
   LA FORME, reconstruite une fois (partagée par tous les exemplaires)
   ------------------------------------------------------------------------- */
function construire(nom) {
  const st = E[nom], D = st.D, image = st.image;
  if (st.commun) return st.commun;
  const { n, nf, nv, bmin, bmax, S, ox, oy, W, H, boite, bin } = D;
  let o = 0;
  const q = new Uint16Array(bin.buffer.slice(0, n * 6)); o = n * 6;
  const nq = new Int8Array(bin.buffer, o, n * 3); o += n * 3;
  const grp = bin.subarray(o, o + n); o += n;
  const j0 = bin.subarray(o, o + n); o += n;
  const j1 = bin.subarray(o, o + n); o += n;
  const w0 = bin.subarray(o, o + n); o += n;
  if (o % 2) o++;
  const idx = new Uint16Array(bin.buffer.slice(o, o + nf * 6)); o += nf * 6;
  const vis = new Uint16Array(bin.buffer.slice(o, o + nv * 2));
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) pos[i * 3 + c] = bmin[c] + (q[i * 3 + c] / 65535) * (bmax[c] - bmin[c]);
    const nx = nq[i * 3], ny = nq[i * 3 + 1], nz = nq[i * 3 + 2], l = Math.hypot(nx, ny, nz) || 1;
    nor[i * 3] = nx / l; nor[i * 3 + 1] = ny / l; nor[i * 3 + 2] = nz / l;
    const px = pos[i * 3] * S + ox, py = -pos[i * 3 + 1] * S + oy;
    if (!grp[i]) { uv[i * 2] = px / 1536; uv[i * 2 + 1] = 1 - py / 1024; }                       // de face : le dessin, à sa place
    else { uv[i * 2] = (1024 + clamp(px, 0, W - 1) * 512 / W) / 1536; uv[i * 2 + 1] = 1 - (clamp(py, 0, H - 1) * 512 / H) / 1024; }   // côtés, dos : le dessin flouté
    si[i * 4] = j0[i]; si[i * 4 + 1] = j1[i]; sw[i * 4] = w0[i] / 255; sw[i * 4 + 1] = 1 - w0[i] / 255;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('normal', new BufferAttribute(nor, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new BufferAttribute(sw, 4));
  geo.setIndex(new BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  /* LE VISAGE : les triangles du visage, recopiés un cheveu au-dessus de la peau (portés par la tête), avec les coordonnées de la toile animée */
  const iTete = D.os.indexOf('tete'), jt = D.joints[iTete], carte = new Map(), vp = [], vn = [], vu = [], vi = [];
  const EPS = 0.004;
  for (let f = 0; f < nv; f++) for (let c = 0; c < 3; c++) {
    const v = idx[vis[f] * 3 + c];
    if (!carte.has(v)) {
      carte.set(v, vp.length / 3);
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      vp.push(x + nor[v * 3] * EPS - jt[0], y + nor[v * 3 + 1] * EPS - jt[1], z + nor[v * 3 + 2] * EPS - jt[2]);
      vn.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);              // les MÊMES normales que la peau : même lumière, aucune couture
      const px = x * S + ox, py = -y * S + oy;
      vu.push((px - boite[0]) / (boite[2] - boite[0]), 1 - (py - boite[1]) / (boite[3] - boite[1]));
    }
    vi.push(carte.get(v));
  }
  const geoV = new BufferGeometry();
  geoV.setAttribute('position', new BufferAttribute(new Float32Array(vp), 3));
  geoV.setAttribute('uv', new BufferAttribute(new Float32Array(vu), 2));
  geoV.setIndex(new BufferAttribute(new Uint16Array(vi), 1));
  geoV.setAttribute('normal', new BufferAttribute(new Float32Array(vn), 3));
  const tex = new Texture(image); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true;
  /* la peau : mate et douce (le dessin porte déjà ses ombres peintes ; la lumière ajoute le volume, pas un vernis) */
  /* (Bee, 8.11 : « au niveau du Bourricot » — une peau duveteuse aussi mate que son pelage, plus de reflet de plastique) */
  const matCorps = new MeshStandardMaterial({ map: tex, roughness: 0.86, metalness: 0, envMapIntensity: 0.8 });
  if (nom !== 'bee') return (st.commun = { geo, geoV, matCorps });
  /* les ailes : une toile dessinée ici une fois (deux lobes, nervures, liseré bleu), translucides */
  const ca = document.createElement('canvas'); ca.width = ca.height = 256; dessinerAile(ca.getContext('2d'));
  const texA = new CanvasTexture(ca); texA.colorSpace = SRGBColorSpace;
  const matAile = new MeshStandardMaterial({ map: texA, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false, roughness: 0.25, metalness: 0 });
  const geoAile = new PlaneGeometry(1, 1);
  return (st.commun = { geo, geoV, matCorps, matAile, geoAile });
}

function dessinerAile(x) {
  x.clearRect(0, 0, 256, 256);
  const lobe = (cx0, cy0, rx, ry, a) => { x.save(); x.translate(cx0, cy0); x.rotate(a); x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, 6.2832); x.restore(); };
  const forme = () => { x.beginPath(); lobe(150, 96, 98, 62, -0.42); x.fill(); lobe(118, 176, 70, 44, 0.38); x.fill(); };
  const g = x.createLinearGradient(20, 40, 240, 220);
  g.addColorStop(0, 'rgba(255,255,255,0.92)'); g.addColorStop(0.5, 'rgba(214,238,255,0.72)'); g.addColorStop(1, 'rgba(176,220,250,0.62)');
  x.fillStyle = g; forme();
  x.save(); x.globalCompositeOperation = 'source-atop';
  x.strokeStyle = 'rgba(120,180,225,0.55)'; x.lineWidth = 2.2; x.lineCap = 'round';
  for (const [a, b, c, d2] of [[22, 128, 120, 60], [22, 128, 190, 70], [22, 128, 230, 120], [22, 128, 150, 190], [22, 128, 90, 205]]) { x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo((a + c) / 2, (b + d2) / 2 + 14, c, d2); x.stroke(); }
  const gl = x.createRadialGradient(120, 70, 4, 120, 70, 60); gl.addColorStop(0, 'rgba(255,255,255,0.7)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gl; x.fillRect(0, 0, 256, 256);
  x.restore();
  x.strokeStyle = 'rgba(70,140,200,0.95)'; x.lineWidth = 5;
  lobe(150, 96, 98, 62, -0.42); x.stroke(); lobe(118, 176, 70, 44, 0.38); x.stroke();
}

/* ---------------------------------------------------------------------------
   LE VISAGE VIVANT : yeux, paupières, sourcils, bouche, joues — dessinés dans les coordonnées du DESSIN (pixels de l'image découpée)
   ------------------------------------------------------------------------- */
/* LE STYLE DU VISAGE de chaque personnage. gros : des yeux un peu plus grands que le dessin (« mignon » = grands yeux brillants, Kevin 8.11 :
   « encore plus mignonne ») ; cils / coeur : Bee a trois cils et un reflet en cœur, Bourricot (comme son dessin) n'a ni l'un ni l'autre,
   mais un grand reflet rond et un regard tourné vers nous (versNez) ; pxm : mètres de la marionnette de formes → pixels du dessin. */
const STYLES = {
  bee: { gros: 1.09, cils: true, coeur: true, versNez: 0, boucheRot: -10, epBouche: 1, joueTraits: true, joueA: [0.78, 0.46], sourcils: [-33, -8], pxm: 1870, rOeil: 0.022, basEp: 0.045,
    coul: { cil: '#2a160a', iris0: '#22100a', iris1: '#4b2711', iris2: '#a8661c', iris3: '#e7a83c', pupille: '#120804', sourcil: '#3f2412',
      bouche: '#7a2228', boucheF: '#561219', langue: '#ff7f8c', langueC: '#ffa3ad', trait: '#3a130b', joue: '255,128,140' } },
  bourricot: { gros: 1.13, cils: false, coeur: false, versNez: 0.2, boucheRot: 0, epBouche: 1.35, joueTraits: false, joueA: [0.7, 0.42], sourcils: [-22, 22], pxm: 2300, rOeil: 0.02, basEp: 0.075,
    coul: { cil: '#2e1709', iris0: '#140903', iris1: '#2c160a', iris2: '#6a3a16', iris3: '#b0702c', pupille: '#0a0402', sourcil: '#4a2812',
      bouche: '#6e2116', boucheF: '#48110b', langue: '#f2858a', langueC: '#ffabb0', trait: '#4a1c0c', joue: '255,112,120' } },
};
function coeur(x, cx0, cy0, r) {
  x.beginPath(); x.moveTo(cx0, cy0 + r * 0.9);
  x.bezierCurveTo(cx0 - r * 1.3, cy0 + r * 0.1, cx0 - r * 0.9, cy0 - r * 1.0, cx0, cy0 - r * 0.35);
  x.bezierCurveTo(cx0 + r * 0.9, cy0 - r * 1.0, cx0 + r * 1.3, cy0 + r * 0.1, cx0, cy0 + r * 0.9); x.fill();
}
function oeil(x, e, sx, v, St) {
  const COUL = St.coul, [ex, ey, rx0, ry0] = e, rx = rx0 * v.ex * St.gros, ry = ry0 * v.ey * St.gros * 1.04;
  const N = 24, haut = [], bas = [], paup = [], low = [];
  for (let i = 0; i <= N; i++) {
    const u = -1 + 2 * i / N, k = Math.sqrt(Math.max(0, 1 - u * u)), X = ex + u * rx;
    const yt = ey - ry * k, yb = ey + ry * k;
    haut.push([X, yt]); bas.push([X, yb]);
    paup.push([X, yt + (yb - yt) * v.lid]);                         // bord de la paupière du haut (0 ouverte → 1 sur le bas de l'œil)
    low.push([X, ey + ry * k * (1 - 2 * v.bas)]);                  // la paupière du bas qui remonte (sourire des yeux)
  }
  /* on ne dessine QUE l'ouverture de l'œil (entre la paupière du haut et celle du bas) : les paupières sont la peau même du personnage,
     dessous — aucune tache, aucun liseré autour d'un œil fermé */
  const fond = paup.map(([a, b], i) => [a, Math.max(b, Math.min(bas[i][1], low[i][1]))]);
  const ouvert = fond.some(([, b], i) => b - paup[i][1] > 0.6);
  x.save();
  x.beginPath(); paup.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); for (let i = N; i >= 0; i--) x.lineTo(fond[i][0], fond[i][1]); x.closePath(); x.clip();
  if (ouvert) {
  /* le blanc, un peu ombré sous la paupière */
  let g = x.createLinearGradient(0, ey - ry, 0, ey + ry); g.addColorStop(0, '#e9ddd4'); g.addColorStop(0.35, '#fffdfb'); g.addColorStop(1, '#ffffff');
  x.fillStyle = g; x.fillRect(ex - rx - 2, ey - ry - 2, rx * 2 + 4, ry * 2 + 4);
  /* l'iris : grand, brun foncé en haut, doré en bas, comme le dessin ; il glisse sur le blanc (saccades, suit le doigt) */
  const ix = ex + (v.gx * 0.3 - sx * St.versNez) * rx, iy = ey - v.gy * ry * 0.24 + ry * 0.05, ir = rx * 0.86, iry = ry * 0.9;
  g = x.createLinearGradient(0, iy - iry, 0, iy + iry);
  g.addColorStop(0, COUL.iris0); g.addColorStop(0.42, COUL.iris1); g.addColorStop(0.78, COUL.iris2); g.addColorStop(1, COUL.iris3);
  x.fillStyle = g; x.beginPath(); x.ellipse(ix, iy, ir, iry, 0, 0, 6.2832); x.fill();
  x.strokeStyle = 'rgba(28,13,6,0.9)'; x.lineWidth = rx * 0.06; x.stroke();
  g = x.createRadialGradient(ix, iy - iry * 0.05, 0, ix, iy, ir * 0.55); g.addColorStop(0, '#0c0502'); g.addColorStop(1, COUL.pupille);
  x.fillStyle = g; x.beginPath(); x.ellipse(ix, iy - iry * 0.04, rx * 0.46, ry * 0.5, 0, 0, 6.2832); x.fill();
  /* les reflets : un grand rond en haut, un petit, et un cœur en bas (le dessin a des reflets en cœur) — ils suivent l'iris à moitié (c'est la lumière) */
  const lx = ex + (v.gx * 0.15 - sx * St.versNez * 0.6) * rx, ly = ey - v.gy * ry * 0.12;
  x.fillStyle = '#ffffff';
  x.beginPath(); x.arc(lx + rx * 0.24, ly - ry * 0.3, rx * 0.21, 0, 6.2832); x.fill();
  x.beginPath(); x.arc(lx + rx * 0.44, ly + ry * 0.02, rx * 0.075, 0, 6.2832); x.fill();
  x.globalAlpha = 0.85; x.beginPath(); x.arc(lx - rx * 0.12, ly + ry * 0.5, rx * 0.06, 0, 6.2832); x.fill(); x.globalAlpha = 1;   // une 3ᵉ étincelle en bas : l'œil brille plus
  if (St.coeur) { x.globalAlpha = 0.95; coeur(x, lx - rx * 0.3, ly + ry * 0.34, rx * 0.15); x.globalAlpha = 1; }
  else { x.globalAlpha = 0.55; x.beginPath(); x.ellipse(lx - rx * 0.28, ly + ry * 0.36, rx * 0.16, ry * 0.09, -0.5, 0, 6.2832); x.fill(); x.globalAlpha = 1; }   // un reflet doux en bas (le sol éclairé)
  /* l'ombre douce que la paupière pose sur l'œil */
  if (v.lid < 0.97) {
    x.strokeStyle = 'rgba(90,40,10,0.22)'; x.lineWidth = ry * 0.18; x.beginPath();
    paup.forEach(([a, b], i) => (i ? x.lineTo(a, b + ry * 0.07) : x.moveTo(a, b + ry * 0.07))); x.stroke();
  }
  }
  x.restore();
  /* le trait de cils : il suit le bord le plus HAUT des deux paupières → fermé et content, il dessine un « ∩ » souriant ; endormi, un « ∪ » */
  const trait = paup.map(([a, b], i) => [a, Math.min(b, low[i][1])]);
  x.strokeStyle = COUL.cil; x.lineCap = 'round'; x.lineJoin = 'round';
  x.lineWidth = rx * (v.lid > 0.85 ? 0.12 : 0.15);
  x.beginPath(); trait.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
  /* le bas de l'œil : un trait fin brun quand il est ouvert */
  if (v.lid < 0.8 && v.bas < 0.35) {
    x.strokeStyle = 'rgba(80,40,14,0.75)'; x.lineWidth = rx * St.basEp; x.beginPath();
    bas.slice(3, N - 2).forEach(([a, b], i) => (i ? x.lineTo(a, Math.max(b, trait[i + 3][1])) : x.moveTo(a, b))); x.stroke();
  }
  /* trois cils au coin extérieur, qui partent du bord de la paupière (Bee seulement : Bourricot n'en a pas sur son dessin) */
  if (!St.cils) return;
  const bout = trait[sx > 0 ? N : 0], avant = trait[sx > 0 ? N - 3 : 3];
  const ang = Math.atan2(bout[1] - avant[1], bout[0] - avant[0]);
  x.lineWidth = rx * 0.07;
  for (let k = 0; k < 3; k++) {
    const t0 = 0.0 + k * 0.12, base = [bout[0] - (bout[0] - avant[0]) * t0 * 2.2, bout[1] - (bout[1] - avant[1]) * t0 * 2.2];
    const L = rx * (0.36 - k * 0.05);
    const dir = sx > 0 ? ang - (0.5 + k * 0.38) : ang + (0.5 + k * 0.38);
    x.beginPath(); x.moveTo(base[0], base[1]);
    x.quadraticCurveTo(base[0] + Math.cos(dir) * L * 0.6, base[1] + Math.sin(dir) * L * 0.6 - L * 0.15, base[0] + Math.cos(dir - sx * 0.25) * L, base[1] + Math.sin(dir - sx * 0.25) * L - L * 0.25);
    x.stroke();
  }
}
function sourcil(x, b, base, v, COUL) {
  const [bx, by, L] = b;
  x.save(); x.translate(bx, by - v.h); x.rotate(base * RAD - v.r2 * RAD);
  x.fillStyle = COUL.sourcil; x.beginPath();
  x.moveTo(-L, L * 0.16);
  x.quadraticCurveTo(0, -L * 0.42, L, L * 0.06);
  x.quadraticCurveTo(0, -L * 0.18, -L, L * 0.16);
  x.fill();
  x.restore();
}
function bouche(x, m, v, St) {
  const COUL = St.coul, ep = St.epBouche, [mx, my, L] = m, w = L * v.w * 1.06, ouv = clamp(v.o - 0.3, 0, 1.5), H = L * 1.0 * ouv, sm = v.sourire * ep;
  x.save(); x.translate(mx, my); x.rotate(St.boucheRot * RAD);
  x.lineCap = 'round'; x.lineJoin = 'round';
  if (H < 4) {
    /* fermée : un trait qui sourit (ou boude, ou réfléchit) */
    x.strokeStyle = COUL.trait; x.lineWidth = 4.2 * ep;
    x.beginPath(); x.moveTo(-w * 0.8, -5 * sm); x.quadraticCurveTo(0, 12 * sm + H, w * 0.8, -5 * sm); x.stroke();
    x.lineWidth = 2.6 * ep;
    for (const s2 of [-1, 1]) { x.beginPath(); x.moveTo(s2 * w * 0.8, -5 * sm); x.lineTo(s2 * (w * 0.8 + 5), -5 * sm - 4 * sm); x.stroke(); }
  } else {
    const rond = v.w < 0.8 && ouv > 0.6;
    x.beginPath();
    if (rond) x.ellipse(0, H * 0.35, w * 0.85, H * 0.62, 0, 0, 6.2832);
    else if (sm >= 0) {                                      /* le grand « D » du dessin : le haut sourit, le bas s'arrondit */
      x.moveTo(-w, -6 * sm);
      x.quadraticCurveTo(0, 6 * sm, w, -8 * sm);
      x.bezierCurveTo(w * 0.85, H * 0.9, w * 0.35, H * 1.15, 0, H * 1.12);
      x.bezierCurveTo(-w * 0.45, H * 1.1, -w * 0.9, H * 0.8, -w, -6 * sm);
    } else {                                                  /* bouche triste ouverte : les coins tombent */
      x.moveTo(-w, H * 0.6); x.quadraticCurveTo(0, -H * 0.2, w, H * 0.6); x.quadraticCurveTo(0, H * 0.9, -w, H * 0.6);
    }
    x.closePath();
    const g = x.createLinearGradient(0, 0, 0, H * 1.1); g.addColorStop(0, COUL.boucheF); g.addColorStop(1, COUL.bouche);
    x.fillStyle = g; x.fill();
    x.save(); x.clip();
    const lg = x.createRadialGradient(w * 0.05, H * 0.95, 1, w * 0.05, H * 0.95, w * 0.7); lg.addColorStop(0, COUL.langueC); lg.addColorStop(1, COUL.langue);
    x.fillStyle = lg; x.beginPath(); x.ellipse(w * 0.08, H * (rond ? 0.8 : 1.0), w * 0.66, Math.max(4, H * 0.5), 0, 0, 6.2832); x.fill();
    x.restore();
    x.strokeStyle = COUL.trait; x.lineWidth = 3.6 * ep; x.stroke();
  }
  x.restore();
}
function joue(x, j, a, St) {
  const COUL = St.coul;
  const [cx0, cy0, rx1, ry1] = j, rx = rx1 * 1.14, ry = ry1 * 1.14;   // des joues un peu plus rondes et plus roses
  x.save(); x.translate(cx0, cy0); x.scale(1, ry / rx);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(${COUL.joue},${(St.joueA[0] * a).toFixed(3)})`); g.addColorStop(0.6, `rgba(${COUL.joue},${(St.joueA[1] * a).toFixed(3)})`); g.addColorStop(1, `rgba(${COUL.joue},0)`);
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, rx, 0, 6.2832); x.fill();
  x.restore();
  if (!St.joueTraits) return;
  x.strokeStyle = `rgba(255,255,255,${(0.75 * a).toFixed(3)})`; x.lineWidth = 2.4; x.lineCap = 'round';   // les trois petits traits du dessin
  for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(cx0 + k * rx * 0.28 + rx * 0.1, cy0 - ry * 0.32); x.lineTo(cx0 + k * rx * 0.28 - rx * 0.06, cy0 + ry * 0.3); x.stroke(); }
}

/* ---------------------------------------------------------------------------
   LE FABRICANT
   ------------------------------------------------------------------------- */
const JOIE = { joie: 1, fete: 1, danse: 1, saute: 1, rire: 1, coucou: 0.8, salut: 0.8, montre: 0.6, parle: 0.45, vole: 0.6 };
/* quelle pièce de la description fait bouger quel os de la forme : [os, facteur] (facteur < 1 = le geste est adouci) */
const OS_DE = {
  bee: { corps: 'racine', tete: 'tete', antenneG: 'antG', antenneD: 'antD', brasG: 'brasG', brasD: 'brasD', jambeG: 'jambeG', jambeD: 'jambeD' },
  bourricot: { corps: 'racine', tete: 'tete', oreilleG: 'oreilleG', oreilleD: 'oreilleD', brasG: 'brasG', brasD: 'brasD', jambeG: 'jambeG', jambeD: 'jambeD', queue: 'queue' },
};
export function fabriqueReel(outils) {
  const euler = new Euler();
  return function creerReel(nom) {
    nom = nom || 'bee';
    const st = E[nom], St = STYLES[nom], D = st && st.D;
    const rendu = outils.rendu();
    if (!rendu || !st || st.etat !== 2) return null;
    const cm = construire(nom);
    const liste = outils.listes[nom];
    const { S, ox, oy, cadre } = D, [yc, hv] = outils.cadres[nom], T = cadre.taille;
    /* LE CADRAGE : la 3D se pose exactement sur le dessin servi (base.webp), à la même place, à la même taille */
    const k = cadre.a * S * hv / T, X0 = (cadre.a * ox + cadre.tx - T / 2) * hv / T, Y0 = yc + (T / 2 - cadre.a * oy - cadre.ty) * hv / T;
    const groupe = new Group(); groupe.visible = false;
    groupe.scale.setScalar(k); groupe.position.set(X0, Y0, 0);
    const os = D.os.map((n) => { const b = new Bone(); b.name = n; return b; });
    const repos = [];
    D.os.forEach((n, i) => {
      const p = D.parents[i], j = D.joints[i], jp = p >= 0 ? D.joints[p] : [0, 0, 0];
      os[i].position.set(j[0] - jp[0], j[1] - jp[1], j[2] - jp[2]); repos[i] = os[i].position.clone();
      (p >= 0 ? os[p] : groupe).add(os[i]);
    });
    const corps = new SkinnedMesh(cm.geo, cm.matCorps);
    corps.castShadow = true; corps.receiveShadow = true; corps.frustumCulled = false;
    groupe.add(corps); groupe.updateMatrixWorld(true);
    corps.bind(new Skeleton(os));
    const O = Object.fromEntries(D.os.map((n, i) => [n, os[i]]));
    const I = D.os.reduce((a, n, i) => ((a[n] = i), a), {});
    /* la toile du visage (une par exemplaire : chacun a ses expressions) */
    const BW = D.boite[2] - D.boite[0], BH = D.boite[3] - D.boite[1], F = 1.25;
    const toile = document.createElement('canvas'); toile.width = Math.round(BW * F); toile.height = Math.round(BH * F);
    const tx2 = toile.getContext('2d');
    const texV = new CanvasTexture(toile); texV.colorSpace = SRGBColorSpace; texV.minFilter = LinearMipmapLinearFilter; texV.anisotropy = 4;
    const matV = new MeshStandardMaterial({ map: texV, transparent: true, depthWrite: false, roughness: 0.78, metalness: 0, envMapIntensity: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const visage = new Mesh(cm.geoV, matV); visage.renderOrder = 2; visage.frustumCulled = false; visage.receiveShadow = true;
    O.tete.add(visage);
    /* les ailes de Bee : derrière le dos, en haut, inclinées vers l'arrière ; elles battent autour de leur attache */
    const ailes = {};
    if (nom === 'bee') for (const [n, sx] of [['aileG', -1], ['aileD', 1]]) {
      const piv = new Group(), m = new Mesh(cm.geoAile, cm.matAile);
      const jr = D.joints[0], at = [(sx < 0 ? 472 : 540), 600];
      piv.position.set((at[0] - ox) / S - jr[0], -(at[1] - oy) / S - jr[1], -0.25 - jr[2]);   // (assez en arrière : la racine bleue de l'aile ne se voit plus sur le jaune, en vert)
      m.scale.set(-sx * 0.62, 0.62, 1); m.position.set(sx * 0.27, 0.16, 0); m.renderOrder = 1;
      piv.add(m); O.racine.add(piv); ailes[n] = { piv, sx };
    }
    rendu.scene.add(groupe);
    const ix = {}; liste.forEach(({ piece }, i) => { ix[piece.nom] = i; });
    const lisse = { sourire: 1, joue: 0.7, bas: 0 };
    let dernier = '';
    const noeuds = { visage };
    for (const [piece, n] of Object.entries(OS_DE[nom])) noeuds[piece] = O[n];
    for (const n of Object.keys(ailes)) noeuds[n] = ailes[n].piv;

    const poserOs = (b, i, ps, facteur, avecEchelle) => {
      const r = ps.r, f = facteur || 1;
      b.position.set(repos[i].x + ps.p[0] / k, repos[i].y + ps.p[1] / k, repos[i].z + ps.p[2] / k);
      euler.set(r[0] * RAD * f, r[1] * RAD * f, r[2] * RAD * f, 'XYZ'); b.quaternion.setFromEuler(euler);
      if (avecEchelle) b.scale.set(ps.s[0], ps.s[1], ps.s[2]);
    };
    const perso = {
      nom, groupe, noeuds, ok: true, reel: true, humeur: null, avant: null, depuis: -9, graine: outils.graine(), etat: outils.etatNeuf(), _t: 0,
      visage: null, _toile: toile,
      poser(h, t, ctx0) {
        const P = outils.vie(this, liste, h, t, ctx0 || {}), g = (n) => P[ix[n]];
        const dt = clamp(t - this._t, 0, 0.1); this._t = t;
        poserOs(O.racine, I.racine, g('corps'), 1, true);
        poserOs(O.tete, I.tete, g('tete'), 1, true);
        if (nom === 'bee') {
          poserOs(O.antG, I.antG, g('antenneG')); poserOs(O.antD, I.antD, g('antenneD'));
          /* le bras replié sur la poitrine : il ne tire plus ni le ventre ni le dos (poids revus, 8.11) → il se lève bien plus haut ;
             le bras tendu fait tous les gestes */
          const bg = g('brasG'); bg.r[2] = clamp(bg.r[2], -80, 32); poserOs(O.brasG, I.brasG, bg, 0.68);
          poserOs(O.brasD, I.brasD, g('brasD'));
        } else {
          /* les OREILLES : les gestes de la description (frémir, se coucher) + le ressort qui les fait suivre la tête (déjà dans la vie) */
          poserOs(O.oreilleG, I.oreilleG, g('oreilleG')); poserOs(O.oreilleD, I.oreilleD, g('oreilleD'));
          /* les bras : tout le boudin du bras suit l'os (8.11), plus de nageoire → les gestes entiers */
          poserOs(O.brasG, I.brasG, g('brasG')); poserOs(O.brasD, I.brasD, g('brasD'));
          poserOs(O.queue, I.queue, g('queue'));
        }
        poserOs(O.jambeG, I.jambeG, g('jambeG')); poserOs(O.jambeD, I.jambeD, g('jambeD'));
        for (const n of Object.keys(ailes)) { const a = ailes[n], r = g(n).r; euler.set(r[0] * RAD, (-a.sx * 28 + r[1]) * RAD, (a.sx * 12 + r[2]) * RAD, 'XYZ'); a.piv.quaternion.setFromEuler(euler); }
        /* LE VISAGE : exactement ce que la description dit des paupières, du regard, des sourcils et de la bouche */
        /* (joie : la description baisse la paupière du haut ; ici c'est la paupière du BAS qui sourit — des yeux rieurs, pas endormis) */
        const rieur = (JOIE[h] || 0) >= 0.8 && h !== 'rire';
        const lid = (n) => { const f = clamp((g(n).r[0] - LID_OUVERT) / (LID_FERME - LID_OUVERT), 0, 1); return rieur && f < 0.6 ? f * 0.35 : f; };
        const gz = (n) => ({ x: clamp(g(n).p[0] / (0.28 * St.rOeil), -1.2, 1.2), y: clamp(g(n).p[1] / (0.24 * St.rOeil), -1.2, 1.2) });
        const ye = g('yeux').s, bo = g('bouche').s, PXM = St.pxm;   // 1 m de la marionnette de formes = PXM px du dessin (rayon de la tête)
        const k2 = 1 - Math.exp(-dt * 8);
        const cibleSourire = h === 'triste' ? -1 : h === 'pense' ? 0.25 : h === 'dort' ? 0.55 : h === 'secoue' ? 0.3 : 1;
        lisse.sourire += (cibleSourire - lisse.sourire) * k2;
        lisse.joue += ((JOIE[h] != null ? 0.55 + 0.45 * JOIE[h] : h === 'triste' ? 0.35 : 0.6) - lisse.joue) * k2;
        lisse.bas += ((h === 'rire' ? 0.66 : (JOIE[h] || 0) >= 0.8 ? 0.24 : 0) - lisse.bas) * k2;   // le sourire des yeux : la paupière du bas remonte (fermé + rire = « ∩ »)
        const gG = gz('regardG'), gD = gz('regardD');
        this.visage = {
          G: { lid: lid('paupiereG'), bas: lisse.bas, gx: gG.x, gy: gG.y, ex: ye[0], ey: ye[1] },
          D: { lid: lid('paupiereD'), bas: lisse.bas, gx: gD.x, gy: gD.y, ex: ye[0], ey: ye[1] },
          sG: { h: g('sourcilG').p[1] * PXM, r2: g('sourcilG').r[2] }, sD: { h: g('sourcilD').p[1] * PXM, r2: g('sourcilD').r[2] },
          b: { w: bo[0], o: bo[1], sourire: lisse.sourire }, joue: lisse.joue,
        };
      },
      dessinerVisage() {
        const v = this.visage, cle = JSON.stringify(v, (kk, val) => (typeof val === 'number' ? Math.round(val * 200) / 200 : val));
        if (cle === dernier) return false;
        dernier = cle;
        const x = tx2, T2 = D.traits;
        x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, toile.width, toile.height);
        x.setTransform(F, 0, 0, F, -D.boite[0] * F, -D.boite[1] * F);
        joue(x, T2.joueG, v.joue, St); joue(x, T2.joueD, v.joue, St);
        oeil(x, T2.oeilG, -1, v.G, St); oeil(x, T2.oeilD, 1, v.D, St);
        sourcil(x, T2.sourcilG, St.sourcils[0], v.sG, St.coul); sourcil(x, T2.sourcilD, St.sourcils[1], v.sD, St.coul);
        bouche(x, T2.bouche, v.b, St);
        texV.needsUpdate = true;
        return true;
      },
      dessiner(cx, px, h, t, ctx, fond, masque) {
        const r = outils.rendu();
        if (!this.ok || !r) { this.ok = false; return false; }
        this.poser(h, t, ctx || {});
        this.dessinerVisage();
        const solY = Y0 + k * D.pieds, saut = Math.max(0, O.racine.position.y - repos[0].y) * k;
        outils.composer(groupe, cx, px, yc, hv, fond || outils.fonds[nom], masque, solY, saut);
        return true;
      },
      liberer() { const r = outils.rendu(); if (r) r.scene.remove(groupe); this.ok = false; try { texV.dispose(); matV.dispose(); } catch (_) {} },
    };
    return perso;
  };
}
