/* MESURES DE QUALITÉ des vrais personnages 3D (Kevin 8.11.2026 : « Corrige tout », « TOP QUALITÉ, mignon, propre ») — utilisées par
 * tests/verify-perso3d-reel-qualite.mjs, DANS la page (les données sont lues telles qu'elles sont servies : géométrie binaire + peau JPEG).
 * Aucune mesure « à l'œil » : chaque défaut corrigé a un nombre. */
window.qualitePerso3D = async function (nom) {
  const D = nom === 'bee' ? window.KdmcBeeReelData : window.KdmcAneReelData;
  const s = atob(D.geo), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  const n = D.n, nf = D.nf; let o = 0;
  const q = new Uint16Array(u.buffer.slice(0, n * 6)); o = n * 6;
  const nq = new Int8Array(u.buffer.slice(o, o + n * 3)); o += n * 3;
  const grp = u.subarray(o, o + n); o += n; const j0 = u.subarray(o, o + n); o += n; const j1 = u.subarray(o, o + n); o += n; const w0 = u.subarray(o, o + n); o += n;
  if (o % 2) o++;
  const idx = new Uint16Array(u.buffer.slice(o, o + nf * 6));
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) P[i * 3 + c] = D.bmin[c] + q[i * 3 + c] / 65535 * (D.bmax[c] - D.bmin[c]);
  const px = (i) => P[i * 3] * D.S + D.ox, py = (i) => -P[i * 3 + 1] * D.S + D.oy;
  const OS = D.os, os = (nm) => OS.indexOf(nm);
  const poids = (i, b) => (j0[i] === b ? w0[i] / 255 : 0) + (j1[i] === b ? 1 - w0[i] / 255 : 0);
  const R = {};
  /* la peau (atlas JPEG), décodée */
  const im = new Image(); im.src = D.peau; await im.decode();
  const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0);
  const A = cx.getImageData(0, 0, cv.width, cv.height).data, AW = cv.width;
  const pixel = (x, y) => { x = Math.max(0, Math.min(AW - 1, Math.round(x))); y = Math.max(0, Math.min(cv.height - 1, Math.round(y))); const k = (y * AW + x) * 4; return [A[k], A[k + 1], A[k + 2]]; };
  const uvFace = (i) => [px(i) * 1536 / 1536, py(i)];
  const uvDos = (i) => [1024 + Math.max(0, Math.min(D.W - 1, px(i))) * 512 / D.W, Math.max(0, Math.min(D.H - 1, py(i))) * 512 / D.H];

  /* 1. LA COUTURE face / dos : aux sommets doublés (même place, l'un pris de face, l'autre de dos), la peau doit être la même des deux côtés */
  const cle = new Map(); let nPaires = 0, somme = 0, pire = 0;
  for (let i = 0; i < n; i++) { const k = q[i * 3] + ',' + q[i * 3 + 1] + ',' + q[i * 3 + 2]; const e = cle.get(k); if (!e) cle.set(k, [i]); else e.push(i); }
  for (const l of cle.values()) {
    const f = l.find((i) => grp[i] === 0), d = l.find((i) => grp[i] === 1);
    if (f == null || d == null) continue;
    const a = pixel(...uvFace(f)), b = pixel(...uvDos(d)), e = (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
    nPaires++; somme += e; pire = Math.max(pire, e);
  }
  R.couture = { paires: nPaires, ecartMoyen: somme / Math.max(1, nPaires) };

  /* 2. LES TRIANGLES qui s'étirent quand on lève les bras (« nageoire ») : on lève chaque bras de 120° autour de son épaule et on compte
        les triangles qui s'allongent plus de 2,5 fois */
  const etire = (nomOs) => {
    const b = os(nomOs); if (b < 0) return null;
    const J = D.joints[b], sx = J[0] < 0 ? -1 : 1, a = sx * 120 * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const Q = new Float32Array(P);
    for (let i = 0; i < n; i++) { const w = poids(i, b); if (!w) continue; const x = P[i * 3] - J[0], y = P[i * 3 + 1] - J[1]; Q[i * 3] = P[i * 3] * (1 - w) + (J[0] + x * ca - y * sa) * w; Q[i * 3 + 1] = P[i * 3 + 1] * (1 - w) + (J[1] + x * sa + y * ca) * w; }
    const L = (T, a2, b2) => Math.hypot(T[a2 * 3] - T[b2 * 3], T[a2 * 3 + 1] - T[b2 * 3 + 1], T[a2 * 3 + 2] - T[b2 * 3 + 2]);
    let nb = 0;
    for (let f = 0; f < nf; f++) { const v = [idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]]; if (!v.some((i) => poids(i, b) > 0.02)) continue; for (let e = 0; e < 3; e++) { const a2 = v[e], b2 = v[(e + 1) % 3], l0 = L(P, a2, b2); if (l0 > 1e-5 && L(Q, a2, b2) / l0 > 2.5) { nb++; break; } } }
    return nb;
  };
  R.etirement = { brasG: etire('brasG'), brasD: etire('brasD') };

  /* 3. LE VENTRE ET LE DOS ne suivent pas les bras (Bee) : sommets du ventre / du dos qui portent du poids d'un bras */
  if (nom === 'bee') {
    let ventre = 0, dos = 0, aisselle = 0;
    for (let i = 0; i < n; i++) {
      /* 9.11 : sous l'aisselle (près du corps, sous y = 650) la rayure jaune du ventre ne suit JAMAIS le bras levé (traînée jaune sous le bras) */
      if (poids(i, os('brasD')) > 0.2 && px(i) < 690 && py(i) > 650 && py(i) < 720) aisselle++;
      /* le bras TENDU (droit de l'image) ne tire jamais le ventre ; le bras REPLIÉ (gauche) ne tire jamais le dos derrière lui */
      if (poids(i, os('brasD')) > 0.05 && ((px(i) - 510) / 165) ** 2 + ((py(i) - 750) / 140) ** 2 < 1) ventre++;
      if (poids(i, os('brasG')) > 0.05 && P[i * 3 + 2] < -0.1) dos++;
    }
    R.ventreTire = { ventre, dos, aisselle };
    /* 4. DES ANTENNES LISSES : le pli le plus fort entre deux triangles voisins de l'antenne (une pointe, un éventail = un pli violent) */
    const plis = [];
    for (const ant of ['antG', 'antD']) {
      const b = os(ant), faces = [];
      for (let f = 0; f < nf; f++) { const v = [idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]]; if (v.every((i) => poids(i, b) > 0.6)) faces.push(v); }
      const nor = faces.map((v) => { const [a2, b2, c2] = v.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]); const e1 = [b2[0] - a2[0], b2[1] - a2[1], b2[2] - a2[2]], e2 = [c2[0] - a2[0], c2[1] - a2[1], c2[2] - a2[2]]; const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...c) || 1; return c.map((x) => x / l); });
      const arete = new Map(); faces.forEach((v, fi) => { for (let e = 0; e < 3; e++) { const k = Math.min(v[e], v[(e + 1) % 3]) + '-' + Math.max(v[e], v[(e + 1) % 3]); (arete.get(k) || arete.set(k, []).get(k)).push(fi); } });
      const angles = [];
      for (const l of arete.values()) if (l.length === 2) { const a2 = nor[l[0]], b2 = nor[l[1]]; angles.push(Math.acos(Math.max(-1, Math.min(1, a2[0] * b2[0] + a2[1] * b2[1] + a2[2] * b2[2]))) * 180 / Math.PI); }
      angles.sort((x, y) => x - y);
      /* et les POINTES : l'écart de chaque sommet à la moyenne de ses voisins, rapporté à la longueur moyenne de ses arêtes (une pointe,
         le bout d'un éventail : bien plus que 1 ; une surface lisse : quelques dixièmes) */
      const vois = new Map();
      for (const v of faces) for (let e = 0; e < 3; e++) { const a2 = v[e], b2 = v[(e + 1) % 3]; (vois.get(a2) || vois.set(a2, new Set()).get(a2)).add(b2); (vois.get(b2) || vois.set(b2, new Set()).get(b2)).add(a2); }
      const pointes = [];
      for (const [i, vs] of vois) {
        if (vs.size < 4) continue;
        let mx = 0, my = 0, mz = 0, le = 0;
        for (const j of vs) { mx += P[j * 3]; my += P[j * 3 + 1]; mz += P[j * 3 + 2]; le += Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]); }
        const k2 = vs.size; pointes.push(Math.hypot(P[i * 3] - mx / k2, P[i * 3 + 1] - my / k2, P[i * 3 + 2] - mz / k2) / (le / k2));
      }
      pointes.sort((x, y) => x - y);
      /* et les FEUILLES (l'« éventail » / la griffe) : deux sommets de l'antenne à moins de 0,012 (≈ 5 px du dessin) l'un de l'autre, qui ne
         sont pas voisins et dont les normales s'opposent = une lame plate à deux faces. Une tige ronde (≈ 20 px d'épaisseur) n'en a aucune. */
      const ids = [...vois.keys()];
      let feuilles = 0;
      for (const i of ids) {
        const ni = [nq[i * 3], nq[i * 3 + 1], nq[i * 3 + 2]], li = Math.hypot(...ni) || 1;
        for (const j of ids) {
          if (j <= i || vois.get(i).has(j)) continue;
          const d = Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]);
          if (d > 0.012) continue;
          const nj = [nq[j * 3], nq[j * 3 + 1], nq[j * 3 + 2]], lj = Math.hypot(...nj) || 1;
          if ((ni[0] * nj[0] + ni[1] * nj[1] + ni[2] * nj[2]) / (li * lj) < -0.5) { feuilles++; break; }
        }
      }
      plis.push({ ant, faces: faces.length, p99: angles[Math.floor(angles.length * 0.99)] || 0, max: angles[angles.length - 1] || 0, plus60: angles.filter((x) => x > 60).length,
        pointeMax: pointes[pointes.length - 1] || 0, pointe99: pointes[Math.floor(pointes.length * 0.99)] || 0, feuilles });
    }
    R.antennes = plis;
    /* LA GRIFFE se voyait DE FACE : des sommets qui dépassent de la tige dessinée. Hors des boules et de la tête, la distance (dans le plan
       du dessin) de chaque sommet du haut à la tige du dessin la plus proche ; une tige propre : ≤ son rayon (≈ 11 px) */
    const TIGES = [[[428, 196], [404, 140], [366, 106], [330, 108]], [[545, 186], [562, 134], [598, 96], [626, 92]]];
    const BOULES = [[301, 121, 47, 41], [651, 99, 46, 40]];
    const seg = (x, y, a2, b2) => { const dx = b2[0] - a2[0], dy = b2[1] - a2[1], t = Math.max(0, Math.min(1, ((x - a2[0]) * dx + (y - a2[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a2[0] - t * dx, y - a2[1] - t * dy); };
    let depasse = 0, nDep = 0;
    for (let i = 0; i < n; i++) {
      const x = px(i), y = py(i);
      if (y > 200 || ((x - 497) / 222) ** 2 + ((y - 356) / 186) ** 2 < 1.3 || (Math.abs(x - 500) < 50 && y > 116)) continue;
      if (BOULES.some(([bx, by, ax, ay]) => ((x - bx) / (ax + 10)) ** 2 + ((y - by) / (ay + 10)) ** 2 < 1)) continue;
      const d = Math.min(...TIGES.map((t) => Math.min(...t.slice(1).map((p2, k) => seg(x, y, t[k], p2)))));
      depasse = Math.max(depasse, d); if (d > 16) nDep++;
    }
    R.griffe = { depasseMax: depasse, sommetsHorsTige: nDep };
  }

  /* 5. LA CRINIÈRE de dos (Bourricot) : des mèches nettes, pas une tache floue — contraste local (détail fin) dans la peau du dos */
  const contraste = (cx0, cy0, r, dos) => {
    const pts = [];
    for (let y = cy0 - r; y <= cy0 + r; y += 1) for (let x = cx0 - r; x <= cx0 + r; x += 1) {
      const [X, Y] = dos ? [1024 + x * 512 / D.W, y * 512 / D.H] : [x, y];
      const l = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
      const c0 = l(pixel(X, Y)); let m = 0; for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) m += l(pixel(X + dx, Y + dy)); pts.push(Math.abs(c0 - m / 4));
    }
    return pts.reduce((a2, b2) => a2 + b2, 0) / pts.length;
  };
  if (nom !== 'bee') R.criniere = { dos: contraste(492, 250, 50, true), face: contraste(492, 250, 50, false) };
  /* 6. LE MUSEAU (Bourricot) : entre le nez et la bouche, la forme générée gardait le pli de la bouche ouverte (un trait sous le nez).
        Mesure : le creux le plus marqué (écart d'un sommet à la moyenne de ses voisins / longueur de ses arêtes) dans cette bande */
  if (nom !== 'bee') {
    const vois = new Map();
    for (let f = 0; f < nf; f++) for (let e = 0; e < 3; e++) { const a2 = idx[f * 3 + e], b2 = idx[f * 3 + (e + 1) % 3]; (vois.get(a2) || vois.set(a2, new Set()).get(a2)).add(b2); }
    const val = [];
    for (const [i, vs] of vois) {
      if (grp[i] !== 0 || ((px(i) - 490) / 88) ** 2 + ((py(i) - 532) / 24) ** 2 > 1 || vs.size < 4) continue;
      let mx = 0, my = 0, mz = 0, le = 0;
      for (const j of vs) { mx += P[j * 3]; my += P[j * 3 + 1]; mz += P[j * 3 + 2]; le += Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]); }
      const k2 = vs.size; val.push(Math.hypot(P[i * 3] - mx / k2, P[i * 3 + 1] - my / k2, P[i * 3 + 2] - mz / k2) / (le / k2));
    }
    val.sort((x, y) => x - y);
    R.museau = { sommets: val.length, pli95: val[Math.floor(val.length * 0.95)] || 0, pliMax: val[val.length - 1] || 0 };
  }
  return R;
};
