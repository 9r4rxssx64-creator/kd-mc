/* ============================================================================
 * LA DESCRIPTION DE BEE ET BOURRICOT EN 3D — pure (aucun fichier lu ni écrit).
 *
 * UNE SEULE description (pièces articulées, couleurs, gestes, réactions, humeurs) sert à TROIS usages :
 *   1. tools/3d/personnages.mjs   → fabrique les .glb (Android, navigateurs) et les .usdz (iPhone, réalité augmentée) ;
 *   2. tools/3d/perso3d-src.js     → le moteur 3D en direct (javis/perso3d.js) : Bee et Bourricot en 3D d'office, partout
 *                                    où le personnage s'affiche (petite fenêtre, app Javis, Lingua) — Kevin 3.10 :
 *                                    « 3D d'office partout, pas de bouton » ;
 *   3. les tests (tests/verify-perso3d.mjs).
 * Un changement de couleur, de forme ou de geste ici se retrouve donc PARTOUT. Unités : mètres, Y vers le haut, Z vers toi.
 * ========================================================================== */
import * as THREE from 'three';
/* ---------------------------------------------------------------------------
   1. LES FORMES DE BASE (en mètres) — une « forme » = une géométrie + une couleur
   ------------------------------------------------------------------------- */
/* LES COULEURS — relevées sur les dessins de Lingua (lingua/bee/v2/rig/base.webp, lingua/donkey/rig/base.webp) :
   Kevin 3.10 : « ils ne ressemblent plus à nos personnages, beaucoup moins mignons » → on copie LE DESSIN. */
export const C = {
  jaune: '#f6bf26', jauneClair: '#fbd85a', jauneMeche: '#f2ad1c', rayure: '#4a2a14', brunBee: '#3f2412',
  blanc: '#ffffff', iris: '#4a2a16', pupille: '#170b05', cil: '#2a160a', bouche: '#7a2228', langue: '#ff7f8c',
  joue: '#ff9aa4', or: '#e9a92a', orFonce: '#c98a12', aile: '#dff1ff',
  pelage: '#b47c45', pelageClair: '#c99a62', museau: '#e6c38e', narine: '#5b3a22', criniere: '#4f2e16',
  oreilleRose: '#eba3a0', sabot: '#4a403c', cuir: '#6b3a1e', sourcilAne: '#7a4a24'
};
function sphere(r, opts) { return Object.assign({ g: 'sphere', r }, opts); }
function capsule(r, l, opts) { return Object.assign({ g: 'capsule', r, l }, opts); }
function cone(r, h, opts) { return Object.assign({ g: 'cone', r, h }, opts); }
function cyl(r, h, opts) { return Object.assign({ g: 'cyl', r, h }, opts); }
function tore(r, t, opts) { return Object.assign({ g: 'tore', r, t }, opts); }
function tour(profil, opts) { return Object.assign({ g: 'tour', profil, r: Math.max(...profil.map((q) => q[0])) }, opts); }   // forme « tournée » (oreille en feuille)

export function geometrie(f) {
  let g;
  /* finesse selon la taille : un œil de 2 cm n'a pas besoin des 28 côtés d'un corps (fichier 2× plus léger) */
  const fin = f.r > 0.05 ? [28, 20] : f.r > 0.02 ? [20, 14] : [14, 10];
  if (f.g === 'sphere') g = new THREE.SphereGeometry(f.r, f.seg || fin[0], f.seg2 || fin[1], 0, Math.PI * 2, f.bande ? f.bande[0] : 0, f.bande ? f.bande[1] : Math.PI);
  else if (f.g === 'capsule') g = new THREE.CapsuleGeometry(f.r, f.l, 8, 16);
  else if (f.g === 'cone') g = new THREE.ConeGeometry(f.r, f.h, 16, 1);
  else if (f.g === 'cyl') g = new THREE.CylinderGeometry(f.r, f.r2 == null ? f.r : f.r2, f.h, f.cotes || 16, 1, !!f.ouvert);
  else if (f.g === 'tore') g = new THREE.TorusGeometry(f.r, f.t, 10, 32, f.arc || Math.PI * 2);
  else if (f.g === 'tour') g = new THREE.LatheGeometry(f.profil.map((q) => new THREE.Vector2(q[0], q[1])), 20);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...(f.pos || [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(f.rot || [0, 0, 0]).map((d) => d * Math.PI / 180))),
    new THREE.Vector3(...(f.ech || [1, 1, 1])));
  g.applyMatrix4(m);
  if (!g.index) g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}
/* une tige courbe (antenne, queue) : des petits cylindres d'un point au suivant, dans le plan x-y */
function tige(points, r, c) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0, z0 = 0] = points[i], [x1, y1, z1 = 0] = points[i + 1];
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, l = Math.hypot(dx, dy, dz);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    out.push(cyl(r, l + r, { pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], rot: [e.x, e.y, e.z].map((v) => v * 180 / Math.PI), c }));
    out.push(sphere(r, { pos: [x1, y1, z1], c }));
  }
  return out;
}

/* ---------------------------------------------------------------------------
   2. LES PERSONNAGES — pièces articulées : pivot (dans la pièce parente), formes, et geste(t)
      geste(t) rend { r: [x, y, z] en degrés, p: [dx, dy, dz] en mètres, s: [sx, sy, sz] } à l'instant t (s).
      Boucle de 4 s : tout revient à sa place, l'animation tourne sans à-coup.
   ------------------------------------------------------------------------- */
export const T = 4, S = Math.sin, PI2 = Math.PI * 2;
const w = (t, f, ph) => S(PI2 * f * t / T + (ph || 0));          // une oscillation qui boucle sur T
/* il cligne des yeux deux fois par boucle (un vrai regard vivant), 0,16 s chaque fois */
const cligne = (t) => { const u = ((t % T) + T) % T; for (const c of [1.3, 3.2]) { const d = Math.abs(u - c); if (d < 0.08) return 0.1 + 0.9 * (d / 0.08); } return 1; };
/* LES YEUX DU DESSIN : grands, presque tout brun foncé et BRILLANTS (un gros reflet en haut, un petit en bas),
   un fin bord blanc, et pour Bee trois cils au coin extérieur. Posés AU RAS de la tête (sx = côté, −1 / +1). */
const oeil = (x, y, z, r, sx, cils) => [
  sphere(r * 1.1, { pos: [x, y, z - r * 0.12], ech: [0.92, 1.12, 0.5], rot: [0, sx * 16, 0], c: C.blanc, lisse: true }),
  sphere(r, { pos: [x, y - r * 0.04, z], ech: [0.9, 1.1, 0.52], rot: [0, sx * 16, 0], c: C.iris, lisse: true }),
  sphere(r * 0.62, { pos: [x + sx * 0.0, y - r * 0.06, z + r * 0.16], ech: [0.9, 1.08, 0.5], rot: [0, sx * 16, 0], c: C.pupille, lisse: true }),
  sphere(r * 0.36, { pos: [x + r * 0.3, y + r * 0.36, z + r * 0.42], ech: [1, 1, 0.45], c: C.blanc, lisse: true }),      // le gros reflet
  sphere(r * 0.16, { pos: [x - r * 0.28, y - r * 0.4, z + r * 0.42], ech: [1, 1, 0.45], c: C.blanc, lisse: true }),     // le petit
  ...(cils ? [0, 1, 2].map((k) => cone(r * 0.16, r * 0.55, { pos: [x + sx * r * (0.62 + k * 0.18), y + r * (0.78 - k * 0.3), z - r * 0.05], rot: [0, 0, -sx * (35 + k * 25)], c: C.cil })) : []),
];
/* sourcil : un petit arc fin au-dessus de l'œil */
const sourcil = (x, y, z, l, sx, c) => tore(l, l * 0.13, { pos: [x, y - l * 0.8, z], arc: Math.PI * 0.5, rot: [-14, sx * 16, 45 - sx * 6], c });
/* la bouche OUVERTE du dessin : un grand « D » sombre, la langue rose au fond */
const sourire = (x, y, z, lg, haut) => [
  sphere(lg, { pos: [x, y, z], bande: [Math.PI / 2, Math.PI / 2], ech: [1, haut || 0.9, 0.3], rot: [-6, 0, 0], c: C.bouche }),
  sphere(lg * 0.6, { pos: [x, y - lg * (haut || 0.9) * 0.55, z + lg * 0.08], ech: [1, 0.55, 0.25], c: C.langue }),
];
/* z de la surface avant d'un ovale (centre c, rayons r) au point (x, y) : pour poser yeux, joues, bouche au ras */
const surf = (c, r, x, y) => c[2] + r[2] * Math.sqrt(Math.max(0, 1 - ((x - c[0]) / r[0]) ** 2 - ((y - c[1]) / r[1]) ** 2));

/* tête de Bee : centre et rayons (dans la pièce « tete ») */
const TB = { c: [0, 0.082, 0], r: [0.112, 0.1, 0.1] };
/* tête de Bourricot */
const TA = { c: [0, 0.08, 0], r: [0.1, 0.094, 0.092] };

export const PERSONNAGES = {
  bee: {
    titre: 'Bee l\'abeille',
    pieces: [
      { nom: 'corps', parent: null, pivot: [0, 0, 0],
        formes: [
          sphere(0.068, { pos: [0, 0.098, 0], ech: [1, 1.12, 0.95], c: C.jaune }),
          sphere(0.0688, { pos: [0, 0.098, 0], ech: [1, 1.12, 0.95], bande: [1.42, 0.3], c: C.rayure }),
          sphere(0.0688, { pos: [0, 0.098, 0], ech: [1, 1.12, 0.95], bande: [2.05, 0.32], c: C.rayure }),
          sphere(0.069, { pos: [0, 0.098, 0], ech: [1, 1.12, 0.95], bande: [2.62, 0.52], c: C.rayure }),
          /* la collerette DUVETEUSE : une couronne de petites boules */
          ...Array.from({ length: 30 }, (_, k) => { const a = k / 15 * PI2 + (k >= 15 ? 0.21 : 0), bas = k >= 15; return sphere(bas ? 0.016 : 0.018, { seg: 10, seg2: 8, pos: [(bas ? 0.054 : 0.048) * S(a), (bas ? 0.152 : 0.165) + 0.003 * S(5 * a), (bas ? 0.05 : 0.044) * Math.cos(a)], ech: [1, 0.85, 1], c: C.jauneClair }); }),
          sphere(0.048, { pos: [0, 0.158, 0], ech: [1.08, 0.38, 1.0], c: C.jauneClair }),
          /* la chaîne et la médaille hexagonale dorée */
          tore(0.034, 0.0018, { pos: [0, 0.152, 0.03], rot: [72, 0, 0], arc: Math.PI, c: C.or, lisse: true }),
          cyl(0.0145, 0.005, { pos: [0, 0.128, 0.064], rot: [80, 0, 0], cotes: 6, c: C.or, lisse: true }),
          cyl(0.0085, 0.006, { pos: [0, 0.128, 0.0665], rot: [80, 0, 0], cotes: 6, c: C.orFonce, lisse: true }),
        ],
        geste: (t) => ({ p: [0, 0.006 * Math.abs(w(t, 2)), 0], s: [1 + 0.012 * w(t, 1), 1 - 0.012 * w(t, 1), 1 + 0.012 * w(t, 1)], r: [0, 6 * w(t, 1), 2.5 * w(t, 1, 1)] }) },
      { nom: 'tete', parent: 'corps', pivot: [0, 0.172, 0],
        formes: [
          sphere(1, { pos: TB.c, ech: TB.r, c: C.jaune, seg: 32, seg2: 24 }),
          /* la petite mèche sur le dessus */
          ...[-1, 0, 1].map((k) => sphere(0.016, { pos: [k * 0.014, TB.c[1] + TB.r[1] - 0.004 + (k ? 0 : 0.006), 0.012], ech: [0.75, 1.35, 0.75], rot: [10, 0, -k * 28], c: C.jauneMeche })),
          /* joues roses, douces */
          ...[-1, 1].map((sx) => sphere(0.021, { pos: [sx * 0.07, TB.c[1] - 0.03, surf(TB.c, TB.r, sx * 0.07, TB.c[1] - 0.03) - 0.006], ech: [1.3, 0.85, 0.3], rot: [0, sx * 35, 0], c: C.joue, opacite: 0.75 })),
          ...[-1, 1].map((sx) => sourcil(sx * 0.044, TB.c[1] + 0.05, surf(TB.c, TB.r, sx * 0.044, TB.c[1] + 0.05) - 0.001, 0.012, sx, C.brunBee)),
        ],
        geste: (t) => ({ r: [4 * w(t, 1, 2), 9 * w(t, 1), 5 * w(t, 2, 1)] }) },
      /* la BOUCHE est une pièce à part : elle s'ouvre et se ferme avec la voix (lèvres synchronisées) et rit, s'étonne */
      { nom: 'bouche', parent: 'tete', pivot: [0, TB.c[1] - 0.038, surf(TB.c, TB.r, 0, TB.c[1] - 0.038) - 0.004],
        formes: sourire(0, 0, 0, 0.022, 0.95) },
      { nom: 'yeux', parent: 'tete', pivot: [0, TB.c[1] + 0.004, 0],
        formes: [-1, 1].flatMap((sx) => oeil(sx * 0.043, 0, surf(TB.c, TB.r, sx * 0.043, TB.c[1] + 0.004) - 0.006, 0.022, sx, true)),
        geste: (t) => ({ s: [1, cligne(t), 1] }) },
      ...['G', 'D'].map((cote, i) => { const sx = i ? 1 : -1; return {
        nom: 'antenne' + cote, parent: 'tete', pivot: [sx * 0.03, TB.c[1] + TB.r[1] - 0.012, 0.005],
        /* la tige COURBE vers l'extérieur et la boule au bout, comme sur le dessin */
        formes: [...tige([[0, 0], [sx * 0.006, 0.026], [sx * 0.02, 0.052], [sx * 0.04, 0.07]], 0.0034, C.brunBee),
                 sphere(0.0135, { pos: [sx * 0.044, 0.074, 0], c: C.brunBee, lisse: true })],
        geste: (t) => ({ r: [10 * w(t, 2, i), 0, -sx * 12 * w(t, 2, i + 0.6)] }) }; }),
      ...['G', 'D'].map((cote, i) => { const sx = i ? 1 : -1; return {
        nom: 'aile' + cote, parent: 'corps', pivot: [sx * 0.035, 0.14, -0.05],
        formes: [sphere(0.045, { pos: [sx * 0.042, 0.02, -0.01], ech: [1.1, 0.75, 0.08], rot: [0, -sx * 25, sx * 20], c: C.aile, opacite: 0.45 }),
                 sphere(0.032, { pos: [sx * 0.034, -0.028, -0.005], ech: [1, 0.7, 0.08], rot: [0, -sx * 25, -sx * 15], c: C.aile, opacite: 0.45 })],
        geste: (t) => ({ r: [0, -sx * 22 * w(t, 16), 0] }) }; }),
      ...['G', 'D'].map((cote, i) => { const sx = i ? 1 : -1; return {
        nom: 'bras' + cote, parent: 'corps', pivot: [sx * 0.058, 0.13, 0.012],
        /* petits bras bruns tout ronds, sans doigts (une moufle), comme le dessin */
        formes: [capsule(0.0145, 0.03, { pos: [sx * 0.014, -0.022, 0], rot: [0, 0, sx * 32], c: C.brunBee }),
                 sphere(0.0175, { pos: [sx * 0.03, -0.046, 0.004], c: C.brunBee })],
        geste: (t) => (i ? { r: [0, 0, 70 * Math.max(0, S(PI2 * t / T)) + 22 * Math.max(0, S(PI2 * t / T)) * w(t, 8)] } : { r: [8 * w(t, 1), 0, -8 * w(t, 2)] }) }; }),
      ...['G', 'D'].map((cote, i) => { const sx = i ? 1 : -1; return {
        nom: 'jambe' + cote, parent: 'corps', pivot: [sx * 0.03, 0.036, 0],
        formes: [capsule(0.016, 0.018, { pos: [0, -0.014, 0], c: C.brunBee }),
                 sphere(0.02, { pos: [sx * 0.004, -0.032, 0.01], ech: [1.05, 0.6, 1.45], c: C.brunBee })],
        geste: (t) => ({ r: [10 * w(t, 2, i * Math.PI), 0, 0] }) }; }),
    ]
  },
  bourricot: {
    titre: 'Bourricot l\'âne',
    pieces: [
      { nom: 'corps', parent: null, pivot: [0, 0, 0],
        formes: [
          sphere(0.07, { pos: [0, 0.1, 0], ech: [1, 1.12, 0.92], c: C.pelage }),
          sphere(0.046, { pos: [0, 0.09, 0.03], ech: [1, 1.12, 0.85], c: C.pelageClair }),     // ventre un peu plus clair
          tore(0.044, 0.0065, { pos: [0, 0.166, 0.002], rot: [96, 0, 0], c: C.cuir }),        // collier de cuir
          sphere(0.0115, { pos: [0, 0.152, 0.05], c: C.or, lisse: true }),                     // clochette dorée
          cyl(0.002, 0.008, { pos: [0, 0.146, 0.06], rot: [80, 0, 0], c: C.orFonce }),
        ],
        geste: (t) => ({ p: [0, 0.005 * Math.abs(w(t, 2)), 0], s: [1 + 0.012 * w(t, 1), 1 - 0.012 * w(t, 1), 1 + 0.012 * w(t, 1)], r: [0, 5 * w(t, 1), 2 * w(t, 1, 1)] }) },
      { nom: 'tete', parent: 'corps', pivot: [0, 0.172, 0],
        formes: [
          sphere(1, { pos: TA.c, ech: TA.r, c: C.pelage, seg: 32, seg2: 24 }),
          /* le GROS museau clair, en avant, sur le bas du visage */
          sphere(0.058, { pos: [0, TA.c[1] - 0.04, 0.058], ech: [1.12, 0.78, 0.82], c: C.museau, seg: 28, seg2: 20 }),
          /* les narines : deux petites virgules sombres sur le dessus du museau */
          ...[-1, 1].map((sx) => sphere(0.0075, { pos: [sx * 0.022, TA.c[1] - 0.018, 0.1], ech: [1.3, 0.55, 0.5], rot: [20, 0, sx * 25], c: C.narine })),
          ...[-1, 1].map((sx) => sphere(0.018, { pos: [sx * 0.07, TA.c[1] - 0.012, surf(TA.c, TA.r, sx * 0.07, TA.c[1] - 0.012) - 0.006], ech: [1.2, 0.8, 0.3], rot: [0, sx * 38, 0], c: C.joue, opacite: 0.45 })),
          ...[-1, 1].map((sx) => sourcil(sx * 0.04, TA.c[1] + 0.052, surf(TA.c, TA.r, sx * 0.04, TA.c[1] + 0.052) - 0.001, 0.013, sx, C.sourcilAne)),
          /* la crinière en bataille entre les oreilles, qui retombe sur le front */
          ...[[-0.02, 0.166, 0.03, 35, 1], [0.004, 0.172, 0.034, -8, 1.1], [0.026, 0.164, 0.026, -40, 1], [-0.008, 0.152, 0.064, 30, 0.85], [0.014, 0.15, 0.066, -26, 0.85], [0, 0.164, 0.0, 0, 1.1], [-0.034, 0.152, 0.008, 60, 0.9], [0.036, 0.152, 0.006, -62, 0.9]]
            .map(([x, y, z, a, k]) => sphere(0.019 * k, { pos: [x, y, z], ech: [0.85, 1.3, 0.8], rot: [z > 0.05 ? 55 : 20, 0, a], c: C.criniere })),
        ],
        geste: (t) => ({ r: [4 * w(t, 1, 2), 10 * w(t, 1), 4 * w(t, 2, 1)] }) },
      { nom: 'bouche', parent: 'tete', pivot: [0, TA.c[1] - 0.052, 0.1],
        formes: sourire(0, 0, 0, 0.027, 0.85) },
      { nom: 'yeux', parent: 'tete', pivot: [0, TA.c[1] + 0.018, 0],
        formes: [-1, 1].flatMap((sx) => oeil(sx * 0.04, 0, surf(TA.c, TA.r, sx * 0.04, TA.c[1] + 0.018) - 0.005, 0.02, sx, false)),
        geste: (t) => ({ s: [1, cligne(t + 0.7), 1] }) },
      ...['G', 'D'].map((cote, i) => { const sx = i ? 1 : -1; return {
        nom: 'oreille' + cote, parent: 'tete', pivot: [sx * 0.05, TA.c[1] + 0.07, -0.005],
        /* LONGUES oreilles POINTUES en forme de feuille, roses dedans, penchées vers l'extérieur */
        formes: [tour([[0, 0], [0.018, 0.008], [0.028, 0.035], [0.029, 0.065], [0.022, 0.1], [0.011, 0.128], [0.002, 0.14], [0, 0.141]], { pos: [0, 0, 0], ech: [1, 1, 0.42], rot: [-6, 0, -sx * 30], c: C.pelage }),
                 tour([[0, 0.012], [0.013, 0.02], [0.02, 0.045], [0.02, 0.07], [0.015, 0.1], [0.007, 0.121], [0, 0.128]], { pos: [sx * 0.002, 0.002, 0.007], ech: [1, 1, 0.35], rot: [-6, 0, -sx * 30], c: C.oreilleRose })],
        /* les oreilles bougent chacune à leur rythme, et l'une « frémit » de temps en temps */
        geste: (t) => ({ r: [8 * w(t, 1, i * 2), 0, -sx * (10 * w(t, 1, i) + (i ? 14 * Math.max(0, w(t, 6)) * Math.max(0, w(t, 1, 0.5)) : 0))] }) }; }),
      ...['G', 'D'].map((cote, i) => { const sx = i ? 1 : -1; return {
        nom: 'bras' + cote, parent: 'corps', pivot: [sx * 0.058, 0.14, 0.012],
        formes: [capsule(0.0155, 0.036, { pos: [sx * 0.012, -0.028, 0], rot: [0, 0, sx * 18], c: C.pelage }),
                 cyl(0.0145, 0.014, { pos: [sx * 0.021, -0.056, 0.002], r2: 0.0155, rot: [0, 0, sx * 18], c: C.sabot })],
        geste: (t) => (i ? { r: [0, 0, 60 * Math.max(0, S(PI2 * t / T + 1.5)) + 18 * Math.max(0, S(PI2 * t / T + 1.5)) * w(t, 8)] } : { r: [10 * w(t, 1), 0, -6 * w(t, 2)] }) }; }),
      ...['G', 'D'].map((cote, i) => { const sx = i ? 1 : -1; return {
        nom: 'jambe' + cote, parent: 'corps', pivot: [sx * 0.032, 0.04, 0],
        formes: [capsule(0.018, 0.02, { pos: [0, -0.014, 0], c: C.pelage }),
                 cyl(0.0175, 0.014, { pos: [0, -0.034, 0.002], r2: 0.019, c: C.sabot })],
        geste: (t) => ({ r: [9 * w(t, 2, i * Math.PI), 0, 0] }) }; }),
      { nom: 'queue', parent: 'corps', pivot: [0.02, 0.07, -0.06],
        /* fine, qui remonte en courbe, avec sa touffe sombre au bout */
        formes: [...tige([[0, 0, 0], [0.012, -0.004, -0.018], [0.03, 0.006, -0.03], [0.044, 0.026, -0.034]], 0.004, C.pelage),
                 sphere(0.014, { pos: [0.05, 0.042, -0.035], ech: [0.85, 1.5, 0.85], rot: [0, 0, -25], c: C.criniere }),
                 sphere(0.011, { pos: [0.044, 0.05, -0.034], ech: [0.8, 1.3, 0.8], rot: [0, 0, 15], c: C.criniere })],
        geste: (t) => ({ r: [8 * w(t, 2), 35 * w(t, 2, 0.4), 0] }) },
    ]
  }
};

/* ---------------------------------------------------------------------------
   2 bis. LES RÉACTIONS (mimiques) — jouées quand on touche le personnage, 2 s chacune.
      Une réaction s'AJOUTE au geste de base (il continue de respirer dessous) ; e = enveloppe
      0 → 1 → 0, donc chaque réaction part de la pose normale et y revient.
      rôle = le nom de la pièce sans G/D ; sx = −1 à gauche, +1 à droite, 0 au milieu.
   ------------------------------------------------------------------------- */
export const DUREE_REACTION = 2;
const P2 = Math.PI * 2, ab = Math.abs;
export const REACTIONS = {
  /* saut de joie : bras en l'air, jambes repliées, ailes/oreilles qui frétillent, yeux rieurs */
  saute: (role, sx, u, e) => ({
    corps: { p: [0, 0.05 * ab(S(P2 * u)), 0], s: [1, 1 + 0.05 * e, 1] },
    tete: { r: [-10 * e, 0, 0] },
    yeux: { s: [1, 1 - 0.45 * e, 1] },
    bouche: { s: [1 + 0.1 * e, 1 + 0.25 * e, 1] },
    bras: { remplace: true, r: [0, 0, sx * (130 + 15 * S(4 * P2 * u))] },
    jambe: { r: [-25 * ab(S(P2 * u)), 0, 0] },
    antenne: { r: [0, 0, -sx * 25 * e * S(3 * P2 * u)] },
    oreille: { r: [0, 0, -sx * 25 * e * S(3 * P2 * u)] },
    aile: { r: [0, -sx * 35 * S(12 * P2 * u), 0] },
    queue: { r: [0, 50 * S(3 * P2 * u) * e, 0] },
  })[role],
  /* fou rire : il se secoue, se tient le ventre, plisse les yeux */
  rire: (role, sx, u, e) => ({
    corps: { s: [1 + 0.04 * ab(S(3 * P2 * u)) * e, 1 - 0.05 * ab(S(3 * P2 * u)) * e, 1], r: [0, 0, 6 * S(2 * P2 * u) * e] },
    tete: { r: [-15 * e, 0, 12 * S(2 * P2 * u) * e] },
    yeux: { s: [1, 1 - 0.75 * e, 1] },
    bouche: { s: [1 + 0.25 * e, 1 + (0.5 * ab(S(3 * P2 * u)) - 0.05) * e, 1] },
    bras: { r: [-50 * e, 0, -sx * 20 * e] },
    jambe: { r: [8 * S(3 * P2 * u) * e, 0, 0] },
    antenne: { r: [0, 0, sx * 20 * S(4 * P2 * u) * e] },
    oreille: { r: [0, 0, sx * 20 * S(4 * P2 * u) * e] },
    queue: { r: [0, 40 * S(4 * P2 * u) * e, 0] },
  })[role],
  /* surprise : il sursaute en arrière, les yeux s'écarquillent, oreilles et antennes se dressent */
  surprise: (role, sx, u, e) => ({
    corps: { p: [0, 0.02 * e, -0.02 * e], r: [-8 * e, 0, 0] },
    tete: { r: [-12 * e, 0, 0] },
    yeux: { s: [1 + 0.35 * e, 1 + 0.45 * e, 1] },
    bouche: { s: [1 - 0.4 * e, 1 + 0.55 * e, 1] },
    bras: { remplace: true, r: [0, 0, sx * 60] },
    antenne: { r: [-20 * e, 0, sx * 14 * e] },
    oreille: { r: [-20 * e, 0, sx * 14 * e] },
    aile: { r: [0, -sx * 30 * S(14 * P2 * u) * e, 0] },
    queue: { r: [-30 * e, 0, 0] },
  })[role],
  /* coucou : grand signe de la main droite, tête penchée, un clin d'œil */
  coucou: (role, sx, u, e) => ({
    corps: { r: [0, 10 * e, 0] },
    tete: { r: [0, 0, -10 * e] },
    yeux: { s: [1, 1 - 0.5 * e, 1] },
    bouche: { s: [1 + 0.1 * e, 1, 1] },
    bras: sx > 0 ? { remplace: true, r: [0, 0, 120 + 25 * S(5 * P2 * u)] } : null,
    oreille: { r: [0, 0, -sx * 12 * S(3 * P2 * u) * e] },
    antenne: { r: [0, 0, -sx * 12 * S(3 * P2 * u) * e] },
    queue: { r: [0, 30 * S(3 * P2 * u) * e, 0] },
  })[role],
};
/* l'iPhone (Coup d'œil AR) ne joue qu'UNE piste : on y enchaîne la vie et trois réactions (18 s en boucle) */
export const SPECTACLE_IPHONE = ['vie', 'saute', 'vie', 'rire', 'vie', 'coucou'];
const role = (nom) => nom.replace(/[GD]$/, '');
const cote = (nom) => (/G$/.test(nom) ? -1 : /D$/.test(nom) ? 1 : 0);
/* additionne (ou, si « remplace », fond) le geste d'une réaction/humeur `a` dans le geste de base `b`, à l'intensité e */
function combiner(b, a, e) {
  /* « remplace » : la pose de la réaction PREND LA PLACE du geste de base (fondu e) au lieu de s'y ajouter —
     sinon le bras qui fait déjà coucou + le bras levé de la réaction = un bras tordu au-delà de la tête */
  const r = [0, 1, 2].map((j) => (a.remplace ? ((b.r || [0, 0, 0])[j]) * (1 - e) + ((a.r || [0, 0, 0])[j]) * e : ((b.r || [0, 0, 0])[j]) + ((a.r || [0, 0, 0])[j])));
  const p = [0, 1, 2].map((j) => ((b.p || [0, 0, 0])[j]) + ((a.p || [0, 0, 0])[j]));
  const s = [0, 1, 2].map((j) => ((b.s || [1, 1, 1])[j]) * ((a.s || [1, 1, 1])[j]));
  return { r, p, s };
}
export function pose(piece, anim, t) {
  const b = piece.geste ? piece.geste(t) : {};
  if (anim === 'vie') return b;
  const u = t / DUREE_REACTION, e = S(Math.PI * Math.min(1, Math.max(0, u)));
  return combiner(b, REACTIONS[anim](role(piece.nom), cote(piece.nom), u, e) || {}, e);
}

/* ---------------------------------------------------------------------------
   4. LES HUMEURS — pas une réaction de 2 s, un ÉTAT qui dure (le personnage affiché dans une app).
      La marionnette 2D nomme déjà les humeurs d'après les classes des apps (repos, parle, joie, coucou, triste, pense, dort,
      danse, saute, marche, vole, poke + les poses fixes de Lingua : salut, fete, lecture, montre, secoue) ; la 3D les joue
      avec LE MÊME vocabulaire — c'est ce qui permet de la brancher partout sans toucher aux apps.
      ctx : { niveau 0..1 (volume de la voix), ouv 0..1 (ouverture de la bouche), regard { x, y } -1..1 (où est ton doigt) }
   ------------------------------------------------------------------------- */
export const HUMEUR_REACTION = { joie: 'saute', fete: 'saute', danse: 'saute', saute: 'saute', coucou: 'coucou', salut: 'coucou', poke: 'surprise' };
export const HUMEURS = {
  /* il parle : la bouche suit la voix, la tête hoche, une main accompagne */
  parle: (rl, sx, t, c) => ({
    tete: { r: [4 * c.niveau * S(P2 * 1.3 * t), 6 * c.niveau * S(P2 * 0.5 * t), 3 * c.niveau * S(P2 * 0.7 * t)] },
    corps: { r: [0, 3 * c.niveau * S(P2 * 0.5 * t), 0] },
    bras: { r: [0, 0, sx * 14 * c.niveau * Math.max(0, S(P2 * 0.9 * t + (sx > 0 ? 0 : 2)))] },
    bouche: { s: [1 + 0.15 * c.ouv, 0.45 + 1.0 * c.ouv, 1] },
  })[rl],
  triste: (rl, sx) => ({
    tete: { r: [16, 0, 0] }, corps: { r: [3, 0, 0], s: [1, 0.985, 1] },
    yeux: { s: [1, 0.7, 1] }, bouche: { s: [0.8, 0.45, 1] },
    oreille: { r: [0, 0, -sx * 22] }, antenne: { r: [0, 0, -sx * 18] },
  })[rl],
  pense: (rl, sx) => ({
    tete: { r: [-6, 10, 14] }, corps: { r: [0, 0, 3] }, yeux: { s: [1, 0.9, 1] }, bouche: { s: [0.7, 0.6, 1] },
  })[rl],
  dort: (rl, sx, t) => ({
    tete: { r: [22, 0, 6] }, yeux: { s: [1, 0.05, 1] }, bouche: { s: [0.6, 0.3, 1] },
    corps: { s: [1 - 0.015 * S(P2 * t / 4), 1 + 0.03 * S(P2 * t / 4), 1 - 0.015 * S(P2 * t / 4)] },
    oreille: { r: [0, 0, -sx * 25] }, antenne: { r: [0, 0, -sx * 22] }, aile: { remplace: true, r: [0, 0, 0] },
  })[rl],
  marche: (rl, sx, t) => { const f = P2 * t * 1.4, ph = S(f + (sx > 0 ? Math.PI : 0)); return ({
    corps: { p: [0, 0.008 * ab(S(f)), 0], r: [0, 0, 3 * S(f)] },
    jambe: { remplace: true, r: [32 * ph, 0, 0] },
    bras: { remplace: true, r: [-26 * ph, 0, -sx * 4] },
  })[rl]; },
  vole: (rl, sx, t) => ({
    corps: { p: [0, 0.03 + 0.012 * S(P2 * 0.8 * t), 0] }, jambe: { r: [-18, 0, 0] },
    aile: { r: [0, -sx * 35 * S(P2 * 9 * t), 0] },
  })[rl],
  secoue: (rl, sx, t) => ({
    tete: { r: [4, 22 * S(P2 * 2.2 * t), 0] }, yeux: { s: [1, 0.85, 1] }, oreille: { r: [0, 0, -sx * 10] },
  })[rl],
  lecture: (rl, sx, t) => ({
    tete: { r: [20, 0, 0] }, yeux: { s: [1, 0.8, 1] }, jambe: sx > 0 ? { r: [14 * ab(S(P2 * 1.2 * t)), 0, 0] } : null,
  })[rl],
  montre: (rl, sx, t) => ({
    tete: { r: [0, 0, -6] }, bouche: { s: [1.1, 1, 1] },
    bras: sx > 0 ? { remplace: true, r: [0, 0, 92 + 10 * S(P2 * 2.2 * t)] } : null,
  })[rl],
};
/* LA POSE D'UNE PIÈCE dans une humeur, à l'instant t (s) : toujours {r, p, s} complets. Rend le geste de base (il ne s'arrête
   JAMAIS : Kevin « toujours ») + ce que l'humeur y ajoute + le regard (la tête et les yeux suivent ton doigt). */
export function poseHumeur(piece, h, t, ctx) {
  const c = ctx || {};
  const b = piece.geste ? piece.geste(t) : {};
  const rl = role(piece.nom), sx = cote(piece.nom);
  let a = null;
  if (HUMEUR_REACTION[h]) a = REACTIONS[HUMEUR_REACTION[h]](rl, sx, ((t % DUREE_REACTION) + DUREE_REACTION) % DUREE_REACTION / DUREE_REACTION, 1);
  else if (HUMEURS[h]) a = HUMEURS[h](rl, sx, t, { niveau: c.niveau == null ? 0.5 : c.niveau, ouv: c.ouv || 0 });
  const g = combiner(b, a || {}, 1);
  const rg = c.regard;
  if (rg) {
    if (rl === 'tete') { g.r[1] += 22 * rg.x; g.r[0] += -12 * rg.y; }
    if (rl === 'yeux') { g.p[0] += 0.004 * rg.x; g.p[1] += -0.003 * rg.y; }
  }
  return g;
}
