/* MESURE DE COULEUR (Kevin 8.11 : « la 3D est plus orange que le dessin ») — utilisée par tests/verify-perso3d-reel-qualite.mjs, dans la page.
 * Rend le vrai personnage DE FACE (repos, graine 0) au format du dessin servi (1024 px, superposé au dessin par construction), puis compare,
 * classe par classe, la couleur MÉDIANE du rendu à celle du dessin : les pixels sont classés dans CHAQUE image séparément (jaune / brun pour
 * Bee ; pelage / clair / sombre / rose pour Bourricot), à l'intérieur de la silhouette (rétrécie de 14 px : jamais le bord, jamais le fond),
 * sans les yeux, la bouche ni les joues (redessinés vivants). Rend la différence ΔE (Lab, CIE 1976) par classe et des gains conseillés. */
window.mesureCouleurPerso3D = function (nom, image) {
  const PX = 1024, c = document.createElement('canvas'); c.width = c.height = PX; const x = c.getContext('2d', { willReadFrequently: true });
  const P = window.KdmcPerso3D.creer(nom); P.graine = 0; P.dessiner(x, PX, 'repos', 0, {}, '#ff00ff'); P.liberer();
  const r = x.getImageData(0, 0, PX, PX).data;
  const c2 = document.createElement('canvas'); c2.width = c2.height = PX; const x2 = c2.getContext('2d', { willReadFrequently: true }); x2.drawImage(image, 0, 0, PX, PX);
  const d = x2.getImageData(0, 0, PX, PX).data;
  /* la silhouette du rendu (le fond magenta), rétrécie de 14 px */
  let m = new Uint8Array(PX * PX);
  for (let i = 0; i < PX * PX; i++) m[i] = !(r[i * 4] > 200 && r[i * 4 + 1] < 60 && r[i * 4 + 2] > 200) ? 1 : 0;
  for (let it = 0; it < 14; it++) { const m2 = new Uint8Array(PX * PX); for (let y = 1; y < PX - 1; y++) for (let xx = 1; xx < PX - 1; xx++) { const i = y * PX + xx; m2[i] = m[i] & m[i - 1] & m[i + 1] & m[i - PX] & m[i + PX]; } m = m2; }
  /* sans le visage vivant (yeux, sourcils, bouche, joues) : les repères du dessin, dans le repère du dessin servi */
  const D = nom === 'bee' ? window.KdmcBeeReelData : window.KdmcAneReelData, cd = D.cadre;
  const vers = (xx, yy) => [cd.a * xx + cd.tx, cd.a * yy + cd.ty];
  const tr = D.traits, trous = [];
  for (const k of ['oeilG', 'oeilD', 'joueG', 'joueD']) { const [cx, cy, rx, ry] = tr[k]; const [X, Y] = vers(cx, cy); trous.push([X, Y, rx * 1.6 + 14, ry * 1.6 + 14]); }
  for (const k of ['sourcilG', 'sourcilD', 'bouche']) { const [cx, cy, L] = tr[k]; const [X, Y] = vers(cx, cy); trous.push([X, Y, L * 1.6 + 14, L * 1.3 + 14]); }
  const horsVisage = (xx, yy) => trous.every(([X, Y, rx, ry]) => ((xx - X) / rx) ** 2 + ((yy - Y) / ry) ** 2 > 1);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lab = (R, G, B) => { const r1 = lin(R), g1 = lin(G), b1 = lin(B); const X = (0.4124 * r1 + 0.3576 * g1 + 0.1805 * b1) / 0.95047, Y = 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1, Z = (0.0193 * r1 + 0.1192 * g1 + 0.9505 * b1) / 1.08883; const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
  /* le fond du dessin (coin haut-gauche) : un pixel du dessin qui lui ressemble n'est pas le personnage (calage approché à quelques px) */
  const fondD = lab(d[(8 * PX + 8) * 4], d[(8 * PX + 8) * 4 + 1], d[(8 * PX + 8) * 4 + 2]);
  const estFond = (j) => { const l = lab(d[j], d[j + 1], d[j + 2]); return Math.hypot(l[0] - fondD[0], l[1] - fondD[1], l[2] - fondD[2]) < 10; };
  const pix = (buf) => { const L = []; for (let y = 0; y < PX; y += 2) for (let xx = 0; xx < PX; xx += 2) { const i = y * PX + xx; if (!m[i] || !horsVisage(xx, y) || estFond(i * 4)) continue; const j = i * 4; L.push({ y, rgb: [buf[j], buf[j + 1], buf[j + 2]], lab: lab(buf[j], buf[j + 1], buf[j + 2]) }); } return L; };
  const A = pix(r), B = pix(d);
  const q = (arr, t) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(t * s.length))]; };
  const classes = (L) => {
    if (nom === 'bee') return { jaune: L.filter((p) => p.lab[2] > 40 && p.lab[0] > 55), brun: L.filter((p) => p.lab[0] < 32) };
    const Ls = L.map((p) => p.lab[0]), q20 = q(Ls, 0.15), q35 = q(Ls, 0.35), q70 = q(Ls, 0.7), q88 = q(Ls, 0.9);
    return { pelage: L.filter((p) => p.lab[0] >= q35 && p.lab[0] <= q70), clair: L.filter((p) => p.lab[0] >= q88), sombre: L.filter((p) => p.lab[0] <= q20),
      rose: L.filter((p) => p.y < 330 && p.lab[1] > 26 && p.lab[2] < p.lab[1] + 8 && p.lab[0] > 45) };
  };
  const cA = classes(A), cB = classes(B), out = {}, gl = [0, 0, 0], gd = [0, 0, 0];
  let s = 0, k = 0;
  for (const nomC of Object.keys(cA)) {
    if (cA[nomC].length < 50 || cB[nomC].length < 50) continue;
    const med = (L) => [0, 1, 2].map((c3) => q(L.map((p) => p.rgb[c3]), 0.5));
    const a = med(cA[nomC]), bb = med(cB[nomC]), la = lab(...a), lb = lab(...bb);
    const dE = Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
    out[nomC] = { rendu: a, dessin: bb, dE, n: cA[nomC].length };
    s += dE; k++;
    for (let c3 = 0; c3 < 3; c3++) { gl[c3] += lin(a[c3]); gd[c3] += lin(bb[c3]); }
  }
  return { classes: out, dEmoyen: k ? s / k : 99, gains: gd.map((v, c3) => v / gl[c3]) };
};

/* LE BORD (Kevin 8.11 : « un liseré doré / sombre le long du ventre ») : rendu de face (512 px), on compare chaque pixel de la BANDE du bord
 * (2 à 4 px à l'intérieur de la silhouette) à la moyenne de l'INTÉRIEUR proche (9 à 15 px du bord, fenêtre de 21 px) : la part des pixels du
 * bord nettement plus sombres (contour qui bave) ou d'une autre teinte (liseré doré) que l'intérieur. */
window.bordPerso3D = function (nom) {
  const PX = 512, c = document.createElement('canvas'); c.width = c.height = PX; const x = c.getContext('2d', { willReadFrequently: true });
  const P = window.KdmcPerso3D.creer(nom); P.graine = 0; P.dessiner(x, PX, 'repos', 0, {}, '#ff00ff'); P.liberer();
  const r = x.getImageData(0, 0, PX, PX).data;
  const N = PX * PX, dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = (r[i * 4] > 200 && r[i * 4 + 1] < 60 && r[i * 4 + 2] > 200) ? 0 : 1e9;
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < PX - 1; y++) for (let xx = 1; xx < PX - 1; xx++) {     // distance au fond (chanfrein 3-4)
    const i = pass ? (PX - 1 - y) * PX + (PX - 1 - xx) : y * PX + xx, s = pass ? -1 : 1;
    dist[i] = Math.min(dist[i], dist[i - s] + 1, dist[i - s * PX] + 1, dist[i - s * PX - s] + 1.4, dist[i - s * PX + s] + 1.4);
  }
  const lum = (i) => 0.299 * r[i * 4] + 0.587 * r[i * 4 + 1] + 0.114 * r[i * 4 + 2];
  const sat = (i) => { const a = r[i * 4], b = r[i * 4 + 1], cc = r[i * 4 + 2]; return Math.max(a, b, cc) - Math.min(a, b, cc); };
  let bande = 0, sombre = 0, teinte = 0;
  for (let y = 12; y < PX - 12; y++) for (let xx = 12; xx < PX - 12; xx++) {
    const i = y * PX + xx; if (dist[i] < 2 || dist[i] > 4) continue;
    let s = 0, k = 0, ss = 0;
    for (let dy = -10; dy <= 10; dy += 2) for (let dx = -10; dx <= 10; dx += 2) { const j = (y + dy) * PX + xx + dx; if (dist[j] >= 9 && dist[j] <= 15) { s += lum(j); ss += sat(j); k++; } }
    if (k < 4) continue;
    bande++;
    const L = lum(i), Lm = s / k;
    if (Lm > 70 && L < Lm - 45) sombre++;                                 // un contour sombre sur un fond clair (jaune, pelage)
    else if (Lm > 70 && Math.abs(sat(i) - ss / k) > 70) teinte++;          // un liseré d'une autre teinte
  }
  return { bande, sombre: sombre / Math.max(1, bande), teinte: teinte / Math.max(1, bande) };
};
