/* ============================================================================
 * BEE ET BOURRICOT EN 3D, EN DIRECT — le moteur (Kevin 2026-10-03 : « 3D d'office partout, pas de bouton »).
 *
 * Ce que ça fait : à partir de LA description des personnages (tools/3d/personnages-def.mjs — celle qui fabrique déjà les .glb
 * et les .usdz), construit chaque personnage en 3D dans le navigateur, le fait vivre (respire, cligne des yeux, bouge
 * oreilles / antennes / ailes / bras / jambes / queue), et le dessine dans le <canvas> que la marionnette lui prête.
 * La marionnette (tools/javis/marionnette.js) reste le chef d'orchestre : elle trouve les personnages de la page, lit
 * l'humeur sur les classes des apps, le volume de la voix, la direction du regard — et passe tout ça ici. Résultat : la 3D
 * s'allume TOUTE SEULE partout où un personnage apparaît (petite fenêtre, app Javis, Lingua), sans bouton.
 *
 * Ce fichier est compilé par `npm run build:3d` (esbuild) en UN script (javis/perso3d.js, recopié à côté de Lingua et de
 * l'arbre) : aucune dépendance au moment de l'exécution, chargé seulement quand la marionnette en a besoin.
 *
 * SOBRE (règles gratuit / iPhone) : un seul contexte WebGL pour toute la page ; un personnage = quelques dizaines de
 * pièces fusionnées par couleur (≈ 40 appels de dessin) ; géométries et matières partagées entre tous les exemplaires ;
 * rien ne se dessine tant que la marionnette ne le demande pas (page cachée, hors écran, pause : rien).
 * Sans WebGL / contexte perdu : creer() rend null et la marionnette 2D reste, telle quelle. Jamais d'écran vide.
 * ========================================================================== */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial, Color, BufferGeometry, BufferAttribute,
  HemisphereLight, DirectionalLight, Euler, DoubleSide, SRGBColorSpace, NeutralToneMapping, PMREMGenerator, PCFSoftShadowMap, ShadowMaterial,
  PlaneGeometry, CanvasTexture, RepeatWrapping, LinearMipmapLinearFilter
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PERSONNAGES, geometrie, poseHumeur, HUMEURS, HUMEUR_REACTION, C } from './personnages-def.mjs';
import { preparerReel, reelVoulu, reelPret, reelEtat, fabriqueReel, BEE_REEL_PAR_DEFAUT } from './perso3d-reel-src.js';

const VERSION = '1.3';
/* LA VRAIE BEE (v1.3) : le fichier de données perso3d-reel.js (forme, squelette, peau) est posé À CÔTÉ de ce script ; on le demande
   tout de suite, en parallèle (balise <script>, jamais de requête réseau à la main). Tant qu'il n'est pas là — ou s'il ne vient pas —
   Bee reste la Bee faite de formes simples, sans trou. */
preparerReel(typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : '');
const RAD = Math.PI / 180;

/* LE CADRAGE : le dessin d'origine remplit ~92 % de la hauteur de son carré ; la 3D fait pareil. [centre y, hauteur vue] en m. */
const CADRE = { bee: [0.232, 0.55], bourricot: [0.25, 0.58] };
/* LE FOND : le même crème que le dessin (relevé sur les images), pour que la 3D remplace le dessin sans changer le décor. */
const FOND = { bee: '#fdf7e7', bourricot: '#fee8b8' };

let rendu = null, perdu = false;

/* LE GRAIN DU DUVET : un bruit fin généré ici (128 px, aucun fichier), posé en relief doux sur les matières mates — la lumière accroche, le pelage a une peau */
let grain = null;
function grainDuvet() {
  if (grain) return grain;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), im = x.createImageData(128, 128);
  let s = 12345; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const g0 = new Float32Array(128 * 128); for (let i = 0; i < g0.length; i++) g0[i] = r();
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {                 // un flou 3×3 qui boucle : des fibres courtes, pas du sel
    let v = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) v += g0[((j + dj + 128) % 128) * 128 + ((i + di + 128) % 128)];
    const o = (j * 128 + i) * 4, q = Math.max(0, Math.min(255, (v / 9 - 0.5) * 900 + 128)); im.data[o] = im.data[o + 1] = im.data[o + 2] = q; im.data[o + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  grain = new CanvasTexture(c); grain.wrapS = grain.wrapT = RepeatWrapping; grain.repeat.set(9, 9); grain.minFilter = LinearMipmapLinearFilter; grain.anisotropy = 2;
  return grain;
}

function initialiser() {
  if (rendu || perdu) return rendu;
  try {
    const canvas = document.createElement('canvas');
    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;     // le rendu « photo » qui GARDE les couleurs du dessin (jaune d'abeille, brun d'âne), sans les écraser
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;   // de vraies ombres : le menton sur le col, la tête sur le corps, les pieds sur le sol
    const scene = new Scene();
    /* une PIÈCE de studio (reflets doux sur les yeux vernis, lumière qui vient de partout un peu) : fabriquée ici, 0 fichier */
    const pm = new PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.3; pm.dispose();
    /* lumière douce de studio : ciel chaud / sol crème, une clé en haut à gauche, un contre-jour qui détache la silhouette */
    scene.add(new HemisphereLight(0xfff6e0, 0xe8cfa0, 0.7));
    const cle = new DirectionalLight(0xffffff, 1.8); cle.position.set(-0.6, 1.1, 1.3); scene.add(cle);
    const contre = new DirectionalLight(0xffe6b0, 1.25); contre.position.set(0.9, 0.5, -0.8); scene.add(contre);
    const rempli = new DirectionalLight(0xffd9c4, 0.55); rempli.position.set(0.9, -0.2, 1.0); scene.add(rempli);       // un reflet chaud côté ombre : le volume se lit, rien ne tombe dans le noir
    const liseret = new DirectionalLight(0xfff3d6, 0.8); liseret.position.set(-0.9, 0.7, -0.9); scene.add(liseret);    // le liseré de lumière sur le bord : la silhouette se détache du fond
    /* la lumière qui PROJETTE les ombres : haute, un peu devant, pour que l'ombre tombe SOUS le personnage (visible de face) */
    const ombre = new DirectionalLight(0xfff0dc, 1.1); ombre.position.set(-0.15, 1.5, 0.55); ombre.castShadow = true;
    ombre.shadow.mapSize.set(1024, 1024); ombre.shadow.bias = -0.0004; ombre.shadow.normalBias = 0.0015; ombre.shadow.radius = 4;
    Object.assign(ombre.shadow.camera, { left: -0.3, right: 0.3, top: 0.3, bottom: -0.3, near: 0.5, far: 2.6 }); ombre.shadow.camera.updateProjectionMatrix(); scene.add(ombre);
    const sol = new Mesh(new PlaneGeometry(1.2, 1.2), new ShadowMaterial({ color: 0x6e4614, opacity: 0.34, depthWrite: false }));
    sol.rotation.x = -Math.PI / 2; sol.position.y = -0.006; sol.receiveShadow = true; scene.add(sol);
    const camera = new PerspectiveCamera(22, 1, 0.1, 5);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); perdu = true; rendu = null; }, false);
    rendu = { renderer, scene, camera, canvas, sol, taille: 0 };
  } catch (_) { perdu = true; rendu = null; }
  return rendu;
}

/* ---------------------------------------------------------------------------
   LES PIÈCES : géométries fusionnées par (pièce, couleur), construites UNE fois par personnage, partagées par les exemplaires
   ------------------------------------------------------------------------- */
const matieres = {};
function matiere(f) {
  const cle = f.c + (f.opacite || '') + (f.lisse ? 'L' : '');
  if (!matieres[cle]) {
    const metal = f.c === C.or || f.c === C.orFonce ? 0.2 : 0;
    /* matière « physique » : le duvet a un LUSTRE doux (sheen) sur les bords, les yeux et la médaille un vernis (clearcoat) — c'est ce qui fait « peluche » et non « plastique mat » */
    const m = new MeshPhysicalMaterial({ color: f.c, roughness: f.lisse ? 0.14 : 0.72, metalness: metal });
    if (f.lisse) { m.clearcoat = 0.9; m.clearcoatRoughness = 0.08; }
    else if (!f.opacite && !metal) { m.bumpMap = grainDuvet(); m.bumpScale = 0.45; m.sheen = 0.7; m.sheenRoughness = 0.45; m.sheenColor = new Color(f.c).lerp(new Color('#fff4d8'), 0.55); }
    if (f.opacite) { m.transparent = true; m.opacity = f.opacite; m.side = DoubleSide; m.depthWrite = false; m.roughness = 0.2; m.sheen = 0.5; m.sheenColor = new Color('#ffffff'); }
    matieres[cle] = m;
  }
  return matieres[cle];
}
function fusionner(liste) {
  let nv = 0, ni = 0;
  for (const g of liste) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of liste) {
    pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, ov * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[oi + i] = gi[i] + ov;
    ov += g.attributes.position.count; oi += gi.length;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  out.setIndex(new BufferAttribute(nv < 65535 ? new Uint16Array(idx) : idx, 1));
  return out;
}
const prototypes = {};
function prototype(nom) {
  if (prototypes[nom]) return prototypes[nom];
  const P = PERSONNAGES[nom];
  const pieces = P.pieces.map((piece) => {
    const parMatiere = new Map();
    for (const f of piece.formes) {
      const m = matiere(f);
      if (!parMatiere.has(m)) parMatiere.set(m, []);
      parMatiere.get(m).push(geometrie(f));
    }
    return { piece, morceaux: [...parMatiere].map(([m, gs]) => ({ m, g: fusionner(gs) })) };
  });
  return (prototypes[nom] = pieces);
}

const euler = new Euler();
const S = Math.sin, P2 = Math.PI * 2, OMEGA = P2 * 3.2, ZETA = 0.22;   // le ressort du suivi : ~3 rebonds par seconde, assez mou pour qu'on le voie
let compteur = 0;

/* LA VIE DU CORPS (partagée par la Bee faite de formes et la vraie Bee) : la pose de TOUTES les pièces de la description à l'instant t,
   dans une humeur, avec un fondu doux depuis l'humeur d'avant, la vie qui ne s'arrête jamais et le suivi à ressort.
   `soi` porte l'état (humeur, avant, depuis, etat, graine) ; `liste` = [{ piece }] dans l'ordre de la description. Rend [{ r, p, s }]. */
function vie(soi, liste, h, t, ctx0) {
  if (h !== soi.humeur) { soi.avant = soi.humeur; soi.humeur = h; soi.depuis = t; }   // la 1re image n'a pas d'« avant » : pas de fondu
  const st = soi.etat;
  let dt = t - st.t; st.t = t; if (!(dt > 0)) dt = 0; else if (dt > 0.25) dt = 0.033;         // retour en arrière ou longue pause : on repart propre
  const rg = ctx0 && ctx0.regard;
  st.rg.x += ((rg ? rg.x : 0) - st.rg.x) * (1 - Math.exp(-dt * 6)); st.rg.y += ((rg ? rg.y : 0) - st.rg.y) * (1 - Math.exp(-dt * 6));   // la tête suit le doigt APRÈS les yeux
  const ctx = Object.assign({}, ctx0, { regardTete: st.rg, graine: soi.graine });
  const k = Math.min(1, Math.max(0, (t - soi.depuis) / 0.3)), lisseK = k * k * (3 - 2 * k);
  const poses = liste.map(({ piece }) => {
    const g = poseHumeur(piece, h, t, ctx);
    let r = g.r, p = g.p, s2 = g.s;
    if (k < 1 && soi.avant) {
      const a = poseHumeur(piece, soi.avant, t, ctx);
      r = r.map((v, j) => a.r[j] + (v - a.r[j]) * lisseK); p = p.map((v, j) => a.p[j] + (v - a.p[j]) * lisseK); s2 = s2.map((v, j) => a.s[j] + (v - a.s[j]) * lisseK);
    }
    return { r: r.slice(), p: p.slice(), s: s2 };
  });
  const ix = (nom) => liste.findIndex((o) => o.piece.nom === nom);
  /* LA VIE QUI NE S'ARRÊTE JAMAIS : la tête et le corps ne sont jamais tout à fait immobiles (balancement lent, micro-mouvements) */
  const it = ix('tete'), ic = ix('corps'), ph = soi.graine;
  if (it >= 0) { const r = poses[it].r; r[0] += 1.1 * S(P2 * 0.37 * t + ph) + 0.6 * S(P2 * 0.93 * t + 1 + ph); r[1] += 1.6 * S(P2 * 0.21 * t + 2 + ph); r[2] += 1.3 * S(P2 * 0.27 * t + 4 + ph); }
  if (ic >= 0) { const r = poses[ic].r; r[2] += 0.9 * S(P2 * 0.17 * t + 3 + ph); r[1] += 0.8 * S(P2 * 0.13 * t + ph); }
  /* LE SUIVI : oreilles, antennes et queue ne bougent pas EN MÊME TEMPS que la tête — elles la suivent avec un petit retard et un petit rebond (ressort) */
  const entrees = [it >= 0 ? poses[it].r[2] : 0, it >= 0 ? poses[it].r[0] : 0, ic >= 0 ? poses[ic].p[1] * 2500 : 0, it >= 0 ? poses[it].r[1] : 0];   // tête : roulis, hochement, rebond du corps, rotation à droite / à gauche
  const lag = entrees.map((u, j) => {
    const f = st.res[j]; let n = dt > 0 ? Math.ceil(dt / 0.012) : 0; const h2 = n ? dt / n : 0;
    if (!st.init) { f.x = u; f.v = 0; }
    for (let i = 0; i < n; i++) { f.v += (OMEGA * OMEGA * (u - f.x) - 2 * ZETA * OMEGA * f.v) * h2; f.x += f.v * h2; }
    return u - f.x;
  });
  st.init = true;
  liste.forEach(({ piece }, i) => {
    const rl = piece.nom.replace(/[GD]$/, ''), sx = /G$/.test(piece.nom) ? -1 : /D$/.test(piece.nom) ? 1 : 0, r = poses[i].r;
    if (rl === 'oreille') { r[2] += -0.9 * lag[0] + 0.55 * lag[3]; r[0] += -0.7 * lag[1] - 0.5 * lag[2]; }
    else if (rl === 'antenne') { r[2] += -0.8 * lag[0] + 0.6 * lag[3]; r[0] += -0.9 * lag[1] - 0.8 * lag[2]; }
    else if (rl === 'queue') { r[1] += 0.9 * lag[0] - 0.5 * lag[3]; }
    else if (rl === 'bras') { r[2] += sx * 0.35 * Math.abs(lag[2]) ; }
  });
  return poses;
}
const etatNeuf = () => ({ t: 0, init: false, rg: { x: 0, y: 0 }, res: [{ x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }] });

/* L'IMAGE FINALE (partagée) : rend le groupe `g` seul, puis compose dans le contexte 2D `cx` (carré px × px) : fond crème, ombre au sol
   (qui pâlit quand il saute), le personnage ; `masque` = l'image dont on suit la découpe. solY = hauteur du sol (m), saut = hauteur du saut (m). */
function composer(g, cx, px, yc, hv, fond, masque, solY, saut) {
  const { renderer, scene, camera, canvas } = rendu;
  if (rendu.taille !== px) { renderer.setSize(px, px, false); rendu.taille = px; }
  camera.position.set(0, yc, (hv / 2) / Math.tan(11 * RAD)); camera.lookAt(0, yc, 0);
  rendu.sol.position.y = solY - 0.006;
  for (const o of scene.children) if (o.isGroup) o.visible = false;
  g.visible = true;
  renderer.render(scene, camera);
  cx.clearRect(0, 0, px, px);
  cx.fillStyle = fond; cx.fillRect(0, 0, px, px);
  const ex = px * 0.27, ey = px * 0.05, ox = px * 0.5, oy = px * (0.5 + (yc - solY) / hv - 0.012);   // y du sol dans l'image
  const gr = cx.createRadialGradient(ox, oy, 0, ox, oy, ex);
  gr.addColorStop(0, 'rgba(110,70,20,' + (0.1 - Math.min(0.06, saut * 1.5)).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(110,70,20,0)');
  cx.save(); cx.translate(0, oy); cx.scale(1, ey / ex); cx.translate(0, -oy); cx.fillStyle = gr; cx.beginPath(); cx.arc(ox, oy, ex, 0, 6.2832); cx.fill(); cx.restore();
  cx.drawImage(canvas, 0, 0, px, px);
  /* une image fixe de Lingua est un médaillon (rond, coins transparents) : la 3D prend exactement sa découpe */
  if (masque) { try { cx.globalCompositeOperation = 'destination-in'; cx.drawImage(masque, 0, 0, px, px); } catch (_) { /* masque illisible : carré */ } cx.globalCompositeOperation = 'source-over'; }
}

/* LA BEE / LE BOURRICOT FAITS DE FORMES SIMPLES (le moteur d'origine ; pour Bee, le repli de la vraie Bee) */
function creerFormes(nom) {
  if (!PERSONNAGES[nom] || !initialiser()) return null;
  let proto;
  try { proto = prototype(nom); } catch (_) { return null; }
  const groupe = new Group(); groupe.visible = false;
  const noeuds = {}, liste = [];
  for (const { piece, morceaux } of proto) {
    const n = new Group(); n.name = piece.nom; n.position.set(...piece.pivot);
    for (const { m, g } of morceaux) { const me = new Mesh(g, m); me.castShadow = !m.transparent && !/^(bouche|yeux|regard|paupiere|sourcil)/.test(piece.nom); me.receiveShadow = true; n.add(me); }   // (les détails du visage ne projettent rien : leur ombre sur le menton ferait « bouger » le col quand il parle)
    (piece.parent ? noeuds[piece.parent] : groupe).add(n);
    noeuds[piece.nom] = n; liste.push({ piece, n });
  }
  rendu.scene.add(groupe);
  const [yc, hv] = CADRE[nom];
  const perso = {
    nom, groupe, noeuds, ok: true, reel: false, humeur: null, avant: null, depuis: -9, graine: (compteur++) * 13.7, etat: etatNeuf(),
    /* La pose de toutes les pièces à l'instant t, dans une humeur, avec un fondu doux depuis l'humeur d'avant. */
    poser(h, t, ctx0) {
      const poses = vie(this, liste, h, t, ctx0);
      liste.forEach(({ piece, n }, i) => {
        const { r, p, s: s2 } = poses[i];
        n.position.set(piece.pivot[0] + p[0], piece.pivot[1] + p[1], piece.pivot[2] + p[2]);
        euler.set(r[0] * RAD, r[1] * RAD, r[2] * RAD, 'XYZ'); n.quaternion.setFromEuler(euler);
        n.scale.set(s2[0], s2[1], s2[2]);
      });
    },
    /* Dessine dans le contexte 2D `cx` (carré px × px) : fond crème, ombre au sol, puis le personnage ; `masque` = l'image dont on suit la découpe. */
    dessiner(cx, px, h, t, ctx, fond, masque) {
      if (!this.ok || perdu || !rendu) { this.ok = false; return false; }
      this.poser(h, t, ctx || {});
      const saut = Math.max(0, (this.noeuds.corps.position.y - this.noeuds.corps.userData.y0) || 0);
      composer(this.groupe, cx, px, yc, hv, fond || FOND[nom], masque, 0, saut);
      return true;
    },
    liberer() { rendu && rendu.scene.remove(groupe); this.ok = false; },
  };
  noeuds.corps.userData.y0 = noeuds.corps.position.y;
  return perso;
}

/* LA VRAIE BEE : son fabricant reçoit les outils partagés (vie du corps, image finale) ; il rend null tant que ses données ne sont pas prêtes. */
const creerReel = fabriqueReel({
  rendu: () => (perdu ? null : rendu), vie, composer, etatNeuf, liste: PERSONNAGES.bee.pieces.map((piece) => ({ piece })),
  cadre: CADRE.bee, fond: FOND.bee, graine: () => (compteur++) * 13.7,
});
let reelCasse = false;

/* creer('bee') : la VRAIE Bee si elle est voulue et prête ; sinon (données pas encore arrivées, illisibles, WebGL faible, interrupteur
   coupé) la Bee faite de formes, sans un mot. Le personnage rendu est TOUJOURS le même objet : quand les données arrivent après coup,
   il passe de lui-même à la vraie Bee à l'image suivante ; si la vraie Bee lâche en route, il repasse aux formes dans la même image. */
function creerBee() {
  if (!initialiser()) return null;
  let formes = null, reel = null, libre = false;
  const essaiReel = () => {
    if (reel || reelCasse || libre || !reelVoulu() || !reelPret() || !reelCapable()) return reel;
    try { reel = creerReel(); } catch (_) { reel = null; reelCasse = true; }
    if (reel && formes) { formes.liberer(); formes = null; }
    return reel;
  };
  const actif = () => essaiReel() || formes || (formes = creerFormes('bee'));
  if (!actif()) return null;
  const px = {
    nom: 'bee', graine: (compteur++) * 13.7,
    get ok() { return !libre && !!(reel || formes) && (reel ? reel.ok : formes.ok); },
    get reel() { return !!reel; },
    get noeuds() { return actif().noeuds; },
    get groupe() { return actif().groupe; },
    poser(h, t, ctx) { const a = actif(); a.graine = this.graine; return a.poser(h, t, ctx); },
    dessiner(cx, p, h, t, ctx, fond, masque) {
      if (libre) return false;
      const a = actif(); a.graine = this.graine;
      if (a !== reel) return a.dessiner(cx, p, h, t, ctx, fond, masque);
      let bon = false;
      try { bon = a.dessiner(cx, p, h, t, ctx, fond, masque); } catch (_) { bon = false; }
      if (bon) return true;
      if (perdu || !rendu) return false;                       // contexte WebGL perdu : la marionnette repasse au dessin 2D
      reelCasse = true; try { reel.liberer(); } catch (_) {} reel = null;   // la vraie Bee lâche : la Bee de formes prend la même image
      const f = actif(); f.graine = this.graine; return f.dessiner(cx, p, h, t, ctx, fond, masque);
    },
    liberer() { libre = true; if (formes) formes.liberer(); if (reel) reel.liberer(); },
    _actif: () => actif(),                                     // pour les tests : l'exemplaire qui dessine en ce moment
  };
  return px;
}
/* WebGL assez solide pour la vraie Bee ? (WebGL2, textures de 2048 px) — sinon les formes, plus légères */
function reelCapable() {
  try { const c = rendu.renderer.capabilities; return c.isWebGL2 !== false && c.maxTextureSize >= 2048; } catch (_) { return false; }
}
function creer(nom) {
  if (nom === 'bee') return creerBee();
  return creerFormes(nom);
}

const API = {
  version: VERSION,
  noms: Object.keys(PERSONNAGES),
  creer,
  /* le contexte WebGL tient-il ? (faux = la marionnette garde ses dessins 2D) */
  actif() { return !perdu && !!initialiser(); },
  /* pour les tests : la liste des humeurs que la 3D sait jouer, et la pose d'une pièce (sans écran) */
  humeurs: [...new Set(['repos', ...Object.keys(HUMEURS), ...Object.keys(HUMEUR_REACTION)])],
  _pose(nom, piece, h, t, ctx) { const p = PERSONNAGES[nom].pieces.find((x) => x.nom === piece); return poseHumeur(p, h, t, ctx); },
  /* les chiffres de la dernière image : appels de dessin et triangles (le garde en plafonne le coût) */
  _stats() { return rendu ? { appels: rendu.renderer.info.render.calls, triangles: rendu.renderer.info.render.triangles } : null; },
  /* simule la perte du contexte WebGL (le téléphone le reprend quand l'app passe en arrière-plan) : le repli doit suivre */
  _perdreContexte() { if (rendu) rendu.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); },
  _pieces(nom) { return PERSONNAGES[nom].pieces.map((p) => p.nom); },
  /* LA VRAIE BEE : état des données (0 rien · 1 en route · 2 prête · -1 illisible), voulue (interrupteur), et une promesse pour les tests */
  reel() { return { etat: reelEtat(), voulue: reelVoulu(), parDefaut: BEE_REEL_PAR_DEFAUT, cassee: reelCasse, capable: !!rendu && reelCapable() }; },
  attendreReel(ms) { return new Promise((ok) => { const t0 = Date.now(); const f = () => { const e = reelEtat(); if (e === 2 || e === -1 || Date.now() - t0 > (ms || 8000)) ok(e); else setTimeout(f, 30); }; f(); }); },
  _creerFormes: creerFormes,
};
if (typeof window !== 'undefined') window.KdmcPerso3D = API;
export default API;
