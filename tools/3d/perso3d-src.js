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
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, MeshStandardMaterial, BufferGeometry, BufferAttribute,
  HemisphereLight, DirectionalLight, Euler, DoubleSide, SRGBColorSpace, NoToneMapping
} from 'three';
import { PERSONNAGES, geometrie, poseHumeur, HUMEURS, HUMEUR_REACTION, C } from './personnages-def.mjs';

const VERSION = '1.0';
const RAD = Math.PI / 180;

/* LE CADRAGE : le dessin d'origine remplit ~92 % de la hauteur de son carré ; la 3D fait pareil. [centre y, hauteur vue] en m. */
const CADRE = { bee: [0.232, 0.55], bourricot: [0.25, 0.58] };
/* LE FOND : le même crème que le dessin (relevé sur les images), pour que la 3D remplace le dessin sans changer le décor. */
const FOND = { bee: '#fdf7e7', bourricot: '#fee8b8' };

let rendu = null, perdu = false;

function initialiser() {
  if (rendu || perdu) return rendu;
  try {
    const canvas = document.createElement('canvas');
    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NoToneMapping;           // les couleurs du dessin, telles quelles
    const scene = new Scene();
    /* lumière douce de studio : ciel chaud / sol crème, une clé en haut à gauche, un contre-jour qui détache la silhouette */
    scene.add(new HemisphereLight(0xfff6e0, 0xe8cfa0, 1.55));
    const cle = new DirectionalLight(0xffffff, 2.5); cle.position.set(-0.6, 1.1, 1.3); scene.add(cle);
    const contre = new DirectionalLight(0xffe6b0, 0.9); contre.position.set(0.9, 0.5, -0.8); scene.add(contre);
    const camera = new PerspectiveCamera(22, 1, 0.1, 5);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); perdu = true; rendu = null; }, false);
    rendu = { renderer, scene, camera, canvas, taille: 0 };
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
    const metal = f.c === C.or || f.c === C.orFonce ? 0.55 : 0;
    const m = new MeshStandardMaterial({ color: f.c, roughness: f.lisse ? 0.18 : 0.78, metalness: metal });
    if (f.opacite) { m.transparent = true; m.opacity = f.opacite; m.side = DoubleSide; m.depthWrite = false; }
    matieres[cle] = m;
  }
  return matieres[cle];
}
function fusionner(liste) {
  let nv = 0, ni = 0;
  for (const g of liste) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of liste) {
    pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[oi + i] = gi[i] + ov;
    ov += g.attributes.position.count; oi += gi.length;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
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

function creer(nom) {
  if (!PERSONNAGES[nom] || !initialiser()) return null;
  let proto;
  try { proto = prototype(nom); } catch (_) { return null; }
  const groupe = new Group(); groupe.visible = false;
  const noeuds = {}, liste = [];
  for (const { piece, morceaux } of proto) {
    const n = new Group(); n.name = piece.nom; n.position.set(...piece.pivot);
    for (const { m, g } of morceaux) n.add(new Mesh(g, m));
    (piece.parent ? noeuds[piece.parent] : groupe).add(n);
    noeuds[piece.nom] = n; liste.push({ piece, n });
  }
  rendu.scene.add(groupe);
  const [yc, hv] = CADRE[nom];
  const perso = {
    nom, groupe, noeuds, ok: true, humeur: null, avant: null, depuis: -9,
    /* La pose de toutes les pièces à l'instant t, dans une humeur, avec un fondu doux depuis l'humeur d'avant. */
    poser(h, t, ctx) {
      if (h !== this.humeur) { this.avant = this.humeur; this.humeur = h; this.depuis = t; }   // la 1re image n'a pas d'« avant » : pas de fondu
      const k = Math.min(1, Math.max(0, (t - this.depuis) / 0.3)), lisseK = k * k * (3 - 2 * k);
      for (const { piece, n } of liste) {
        const g = poseHumeur(piece, h, t, ctx);
        let r = g.r, p = g.p, s = g.s;
        if (k < 1 && this.avant) {
          const a = poseHumeur(piece, this.avant, t, ctx);
          r = r.map((v, j) => a.r[j] + (v - a.r[j]) * lisseK); p = p.map((v, j) => a.p[j] + (v - a.p[j]) * lisseK); s = s.map((v, j) => a.s[j] + (v - a.s[j]) * lisseK);
        }
        n.position.set(piece.pivot[0] + p[0], piece.pivot[1] + p[1], piece.pivot[2] + p[2]);
        euler.set(r[0] * RAD, r[1] * RAD, r[2] * RAD, 'XYZ'); n.quaternion.setFromEuler(euler);
        n.scale.set(s[0], s[1], s[2]);
      }
    },
    /* Dessine dans le contexte 2D `cx` (carré px × px) : fond crème, ombre au sol, puis le personnage ; `masque` = l'image dont on suit la découpe. */
    dessiner(cx, px, h, t, ctx, fond, masque) {
      if (!this.ok || perdu || !rendu) { this.ok = false; return false; }
      const { renderer, scene, camera, canvas } = rendu;
      this.poser(h, t, ctx || {});
      if (rendu.taille !== px) { renderer.setSize(px, px, false); rendu.taille = px; }
      camera.position.set(0, yc, (hv / 2) / Math.tan(11 * RAD)); camera.lookAt(0, yc, 0);
      for (const g of rendu.scene.children) if (g.isGroup) g.visible = false;
      this.groupe.visible = true;
      renderer.render(scene, camera);
      cx.clearRect(0, 0, px, px);
      cx.fillStyle = fond || FOND[nom]; cx.fillRect(0, 0, px, px);
      /* l'ombre sous les pieds : elle ancre le personnage sur le sol (et suit son saut : plus il monte, plus elle pâlit) */
      const saut = Math.max(0, (this.noeuds.corps.position.y - this.noeuds.corps.userData.y0) || 0);
      const ex = px * 0.27, ey = px * 0.05, ox = px * 0.5, oy = px * (0.5 + yc / hv - 0.012);   // y du sol dans l'image
      const gr = cx.createRadialGradient(ox, oy, 0, ox, oy, ex);
      gr.addColorStop(0, 'rgba(110,70,20,' + (0.28 - Math.min(0.15, saut * 2.5)).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(110,70,20,0)');
      cx.save(); cx.translate(0, oy); cx.scale(1, ey / ex); cx.translate(0, -oy); cx.fillStyle = gr; cx.beginPath(); cx.arc(ox, oy, ex, 0, 6.2832); cx.fill(); cx.restore();
      cx.drawImage(canvas, 0, 0, px, px);
      /* une image fixe de Lingua est un médaillon (rond, coins transparents) : la 3D prend exactement sa découpe */
      if (masque) { try { cx.globalCompositeOperation = 'destination-in'; cx.drawImage(masque, 0, 0, px, px); } catch (_) { /* masque illisible : carré */ } cx.globalCompositeOperation = 'source-over'; }
      return true;
    },
    liberer() { rendu && rendu.scene.remove(groupe); this.ok = false; },
  };
  noeuds.corps.userData.y0 = noeuds.corps.position.y;
  return perso;
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
};
if (typeof window !== 'undefined') window.KdmcPerso3D = API;
export default API;
