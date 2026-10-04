/* ============================================================================
 * BEE ET BOURRICOT EN 3D — pour les voir chez soi, en réalité augmentée
 * (Kevin 2026-10-03 : « Modélise en 3D les personnages pour une réalité augmentée »).
 *
 * Les deux personnages sont MODÉLISÉS ICI, en code, pièce par pièce (comme un jouet) :
 * pas de logiciel payant, pas d'IA payante, et chaque pièce a son articulation — oreilles,
 * antennes, ailes, bras, jambes, queue, tête — donc ils BOUGENT aussi en 3D.
 *
 *   cd tools/3d && npm install && npm run fabriquer   (tout d'un coup : .glb puis .usdz)
 *   node tools/3d/personnages.mjs            → fabrique, pour chacun :
 *       javis/3d/<nom>.glb   (Android « Scene Viewer », navigateurs : glTF 2.0 + animation)
 *       <travail>/<nom>.json (la même scène, à plat, pour l'iPhone : tools/3d/usdz.py → <nom>.usdz)
 *   python3 tools/3d/usdz.py                 → javis/3d/<nom>.usdz (iPhone « Coup d'œil AR », animé)
 *
 * Ils VIVENT : animation « vie » (4 s en boucle : respire, cligne des yeux, oreilles / antennes / ailes /
 * queue / bras / jambes) + 4 RÉACTIONS de 2 s jouées quand on les touche (saute, rire, surprise, coucou).
 * L'iPhone ne joue qu'une piste : le .usdz enchaîne vie → saute → vie → rire → vie → coucou (18 s).
 *
 * UNE SEULE DESCRIPTION (PERSONNAGES, plus bas) sert aux deux formats : un changement de couleur ou
 * de geste ici se retrouve partout. Unités : mètres (un personnage mesure ~30 cm, posé sur une table),
 * Y vers le haut, Z vers toi.
 * ========================================================================== */
import { Document, NodeIO } from '@gltf-transform/core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { C, PERSONNAGES, REACTIONS, SPECTACLE_IPHONE, DUREE_REACTION, T, pose, geometrie } from './personnages-def.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = join(ROOT, 'javis', '3d');
/* la scène « à plat » pour l'USDZ est un fichier de TRAVAIL : jamais publié (variable MRN3D_TRAVAIL, sinon /tmp) */
const TRAVAIL = process.env.MRN3D_TRAVAIL || join(process.env.TMPDIR || '/tmp', 'kdmc-3d');

/* ---------------------------------------------------------------------------
   3. FABRICATION : glTF binaire (.glb) + la même scène à plat (.json) pour l'USDZ
   ------------------------------------------------------------------------- */
const IMAGES_PAR_S = 30, N_IMAGES = T * IMAGES_PAR_S;
const quat = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]).map((d) => d * Math.PI / 180), 'XYZ'));
function couleurLin(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }   // THREE.Color : sRGB → linéaire

async function fabriquer(nom, P) {
  const doc = new Document(); doc.createBuffer();
  const scene = doc.createScene(P.titre);
  const ANIMS = [['vie', T], ...Object.keys(REACTIONS).map((k) => [k, DUREE_REACTION])];
  const anims = Object.fromEntries(ANIMS.map(([k]) => [k, doc.createAnimation(k)]));
  const dureeIphone = SPECTACLE_IPHONE.reduce((d, k) => d + (k === 'vie' ? T : DUREE_REACTION), 0);
  const noeuds = {}, plat = { nom, titre: P.titre, images: dureeIphone * IMAGES_PAR_S, imagesParSeconde: IMAGES_PAR_S, materiaux: {}, pieces: [] };
  const mats = {};
  /* pelage MAT (doux), yeux et or BRILLANTS (« lisse ») : c'est ce qui rend le regard vivant, comme sur le dessin */
  const mat = (hex, op, lisse) => {
    const k = hex + (op || '') + (lisse ? 'L' : '');
    if (!mats[k]) {
      const metal = hex === C.or || hex === C.orFonce ? 0.55 : 0, rug = lisse ? 0.18 : 0.78;
      const m = doc.createMaterial(k).setBaseColorFactor([...couleurLin(hex), op || 1]).setRoughnessFactor(rug).setMetallicFactor(metal);
      if (op) m.setAlphaMode('BLEND').setDoubleSided(true);
      mats[k] = m; plat.materiaux[k] = { couleur: couleurLin(hex), opacite: op || 1, metal, rugosite: rug };
    }
    return mats[k];
  };
  const echantillon = (piece, anim, t) => {
    const g = pose(piece, anim, t);
    return { p: (g.p || [0, 0, 0]).map((v, j) => piece.pivot[j] + v), q: quat(g.r), s: g.s || [1, 1, 1] };
  };
  let triangles = 0;
  const entrees = {};
  for (const piece of P.pieces) {
    const mesh = doc.createMesh(piece.nom), prims = [];
    for (const f of piece.formes) {
      const g = geometrie(f), pos = g.attributes.position.array, nor = g.attributes.normal.array, idx = g.index.array;
      const p = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor)))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx.length && Math.max(...idx) < 65535 ? new Uint16Array(idx) : new Uint32Array(idx)))   // index sur 2 octets : fichier plus léger
        .setMaterial(mat(f.c, f.opacite, f.lisse));
      mesh.addPrimitive(p);
      prims.push({ positions: Array.from(pos, (v) => +v.toFixed(5)), normales: Array.from(nor, (v) => +v.toFixed(4)), indices: Array.from(idx), materiau: f.c + (f.opacite || '') + (f.lisse ? 'L' : '') });
      triangles += idx.length / 3;
    }
    const n = doc.createNode(piece.nom).setMesh(mesh).setTranslation(piece.pivot);
    noeuds[piece.nom] = n;
    if (piece.parent) noeuds[piece.parent].addChild(n); else scene.addChild(n);
    /* chaque animation (vie + réactions) : échantillonnée image par image */
    for (const [k, duree] of ANIMS) {
      const ts = [], tr = [], ro = [], sc = [];
      for (let i = 0; i <= duree * IMAGES_PAR_S; i++) {
        const t = i / IMAGES_PAR_S, e = echantillon(piece, k, t);
        ts.push(t); tr.push(...e.p); ro.push(e.q.x, e.q.y, e.q.z, e.q.w); sc.push(...e.s);
      }
      entrees[k] = entrees[k] || doc.createAccessor().setType('SCALAR').setArray(new Float32Array(ts));
      const entree = entrees[k];
      for (const [chemin, type, val] of [['translation', 'VEC3', tr], ['rotation', 'VEC4', ro], ['scale', 'VEC3', sc]]) {
        /* une piste qui ne bouge JAMAIS et vaut la pose du nœud (pivot, sans rotation, taille 1) : inutile → pas écrite */
        const n0 = type === 'VEC4' ? 4 : 3, repos = chemin === 'translation' ? piece.pivot : chemin === 'rotation' ? [0, 0, 0, 1] : [1, 1, 1];
        if (val.every((v, j) => Math.abs(v - repos[j % n0]) < 1e-6)) continue;
        const ech = doc.createAnimationSampler().setInput(entree).setOutput(doc.createAccessor().setType(type).setArray(new Float32Array(val))).setInterpolation('LINEAR');
        anims[k].addSampler(ech).addChannel(doc.createAnimationChannel().setTargetNode(n).setTargetPath(chemin).setSampler(ech));
      }
    }
    /* la piste unique de l'iPhone : le spectacle enchaîné */
    const cles = []; let k0 = 0;
    for (const k of SPECTACLE_IPHONE) {
      const nb = (k === 'vie' ? T : DUREE_REACTION) * IMAGES_PAR_S;
      for (let i = 0; i < nb; i++) {
        const e = echantillon(piece, k, i / IMAGES_PAR_S);
        cles.push({ t: k0 + i, p: e.p.map((v) => +v.toFixed(5)), q: [e.q.w, e.q.x, e.q.y, e.q.z].map((v) => +v.toFixed(5)), s: e.s.map((v) => +v.toFixed(5)) });
      }
      k0 += nb;
    }
    const e0 = echantillon(piece, 'vie', 0);   // la dernière image = la première : la boucle ne saute pas
    cles.push({ t: k0, p: e0.p.map((v) => +v.toFixed(5)), q: [e0.q.w, e0.q.x, e0.q.y, e0.q.z].map((v) => +v.toFixed(5)), s: e0.s.map((v) => +v.toFixed(5)) });
    plat.pieces.push({ nom: piece.nom, parent: piece.parent, formes: prims, cles });
  }
  mkdirSync(SORTIE, { recursive: true }); mkdirSync(TRAVAIL, { recursive: true });
  const glb = await new NodeIO().writeBinary(doc);
  writeFileSync(join(SORTIE, nom + '.glb'), glb);
  writeFileSync(join(TRAVAIL, nom + '.json'), JSON.stringify(plat));
  return { nom, pieces: P.pieces.length, triangles, octets: glb.byteLength, animations: ANIMS.map(([k]) => k) };
}

const faits = [];
for (const [nom, P] of Object.entries(PERSONNAGES)) faits.push(await fabriquer(nom, P));
for (const f of faits) console.log(`  ✓ ${f.nom}.glb : ${f.pieces} pièces articulées, ${f.triangles} triangles, ${Math.round(f.octets / 1024)} Ko, animations : ${f.animations.join(', ')}`);
export { PERSONNAGES, REACTIONS, SPECTACLE_IPHONE };

