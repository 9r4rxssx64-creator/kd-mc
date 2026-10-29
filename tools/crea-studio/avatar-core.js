/* ============================================================================
 * AVATAR-CORE — le cœur (sans écran) du studio « Avatars & marionnettes » de Créa Studio.
 * (Kevin 29.10.2026 : « créer des marionnettes, des avatars, des personnages animés… à partir d'une photo, d'une vidéo, du tour d'une personne…
 *  de la meilleure qualité possible, toujours gratuit, qui reproduisent à l'identique la personne… et pouvoir rajouter la voix »)
 *
 * PRINCIPE (le même que Live2D, Adobe Character Animator, Snap, Memoji — mais 100 % dans le téléphone, rien à payer) :
 *   la PHOTO RÉELLE de la personne est posée sur un maillage de triangles accroché aux 478 points de son visage (MediaPipe, gratuit, Google).
 *   On ne « génère » pas un autre visage : on DÉFORME le vrai (bouche qui s'ouvre, paupières, sourcils, tête qui tourne) → l'identité est conservée à 100 %.
 *   Tout ce qui fait vivre l'avatar se résume à 14 réglages (PARAMS) : bouche, sourire, paupières, sourcils, regard, tête… Ils viennent
 *     - de la caméra (« copie-moi »)   - de la VOIX (synchro des lèvres calculée sur le son)   - d'un état d'humeur   - d'un mouvement au repos (cligne, respire).
 *   Les mêmes réglages pilotent aussi des PERSONNAGES dessinés (panda, lion, âne, abeille…) : un seul cerveau, plusieurs corps.
 *
 * Ce fichier ne touche ni au DOM ni au réseau : il est testé tel quel par Node (tests/verify-crea-avatars.mjs) ET chargé par le navigateur.
 * ========================================================================== */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.AvatarCore = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var sstep = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------------------------------------------------------------------------
     1. LES RÉGLAGES D'UN VISAGE (tous entre 0 et 1, ou -1 et 1 quand ça va dans les deux sens)
  --------------------------------------------------------------------------- */
  var PARAMS_NEUTRES = {
    jaw: 0,        /* bouche ouverte 0..1 */
    wide: 0,       /* -1 bouche en cœur (« ou ») … +1 bouche étirée (« i ») */
    smile: 0,      /* 0..1 coins relevés */
    frown: 0,      /* 0..1 coins baissés */
    blinkL: 0,     /* 0..1 paupière de l'œil de GAUCHE DE L'IMAGE */
    blinkR: 0,
    browL: 0,      /* -1 sourcil baissé … +1 levé (côté gauche de l'image) */
    browR: 0,
    browIn: 0,     /* -1 froncés (colère) … +1 relevés vers l'intérieur (tristesse) */
    eyeWide: 0,    /* 0..1 yeux écarquillés */
    gazeX: 0, gazeY: 0, /* -1..1 regard */
    yaw: 0, pitch: 0, roll: 0 /* tête, en radians : yaw + = vers la droite de l'image, pitch + = vers le bas, roll + = penchée à gauche (antihoraire) */
  };
  var NOMS_PARAMS = Object.keys(PARAMS_NEUTRES);
  function paramsNeutres() { var o = {}; NOMS_PARAMS.forEach(function (k) { o[k] = PARAMS_NEUTRES[k]; }); return o; }
  var LIMITES = { jaw: [0, 1], wide: [-1, 1], smile: [0, 1], frown: [0, 1], blinkL: [0, 1], blinkR: [0, 1], browL: [-1, 1], browR: [-1, 1], browIn: [-1, 1], eyeWide: [0, 1], gazeX: [-1, 1], gazeY: [-1, 1], yaw: [-0.9, 0.9], pitch: [-0.6, 0.6], roll: [-0.6, 0.6] };
  /* Tout ce qui sort d'une source (caméra, voix…) passe par ici : jamais de NaN ni de valeur hors limites dans le moteur. */
  function assainir(p) {
    var o = paramsNeutres();
    if (p) NOMS_PARAMS.forEach(function (k) { var v = +p[k]; if (isFinite(v)) o[k] = clamp(v, LIMITES[k][0], LIMITES[k][1]); });
    return o;
  }

  /* Humeurs prêtes à l'emploi (le visage reste lui-même : on ne fait que déformer). */
  var HUMEURS = {
    neutre: { id: 'neutre', nom: 'Neutre', emoji: '😐', p: {} },
    joie: { id: 'joie', nom: 'Joyeux', emoji: '😄', p: { smile: 0.75, browIn: 0.15, browL: 0.15, browR: 0.15, eyeWide: 0.1 } },
    surprise: { id: 'surprise', nom: 'Surpris', emoji: '😮', p: { jaw: 0.4, browL: 0.9, browR: 0.9, eyeWide: 0.85, browIn: 0.3 } },
    colere: { id: 'colere', nom: 'Fâché', emoji: '😠', p: { browL: -0.5, browR: -0.5, browIn: -0.85, frown: 0.5, eyeWide: 0.2 } },
    triste: { id: 'triste', nom: 'Triste', emoji: '😢', p: { browIn: 0.9, browL: -0.1, browR: -0.1, frown: 0.55, blinkL: 0.2, blinkR: 0.2 } },
    clin: { id: 'clin', nom: 'Clin d\'œil', emoji: '😉', p: { blinkL: 1, smile: 0.55, browL: -0.25 } },
    rire: { id: 'rire', nom: 'Éclat de rire', emoji: '😆', p: { jaw: 0.55, smile: 1, blinkL: 0.55, blinkR: 0.55, browL: 0.2, browR: 0.2 } },
    moue: { id: 'moue', nom: 'Moue', emoji: '😗', p: { wide: -0.85, frown: 0.1, browIn: 0.2 } }
  };

  /* Additionne plusieurs sources de réglages (la voix gagne sur la bouche ; le reste s'additionne ; le tout est assaini). */
  function fusionner(base, humeur, voix, repos) {
    var o = paramsNeutres(), i, k;
    var srcs = [base, humeur, repos];
    for (i = 0; i < srcs.length; i++) if (srcs[i]) for (k in srcs[i]) if (k in o && isFinite(srcs[i][k])) o[k] += srcs[i][k];
    if (voix) {
      o.jaw = Math.max(o.jaw, voix.jaw || 0);
      o.wide = clamp(o.wide + (voix.wide || 0), -1, 1);
    }
    return assainir(o);
  }

  /* Mouvement au repos : cligne des yeux (instants tirés une fois pour toutes d'une graine) + respiration + petites inclinaisons. */
  function fabriquerRepos(graine) {
    var s = (graine == null ? 7 : graine) >>> 0 || 7;
    var al = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    var instants = [], t = 0.9 + al() * 1.5;
    for (var i = 0; i < 400; i++) { instants.push(t); t += 2.2 + al() * 3.2; if (al() < 0.18) { instants.push(t + 0.28); } }
    function blink(tt) {
      for (var j = 0; j < instants.length; j++) {
        var d = tt - instants[j]; if (d < -0.01) break;
        if (d >= 0 && d < 0.2) return d < 0.07 ? d / 0.07 : 1 - (d - 0.07) / 0.13;
      }
      return 0;
    }
    return function (tt, intensite) {
      var k = intensite == null ? 1 : intensite, b = blink(tt);
      return {
        blinkL: b, blinkR: b,
        yaw: k * (0.05 * Math.sin(tt * 0.7) + 0.025 * Math.sin(tt * 1.7 + 1)),
        pitch: k * (0.03 * Math.sin(tt * 0.9 + 2) + 0.01 * Math.sin(tt * 2.3)),
        roll: k * 0.02 * Math.sin(tt * 0.5 + 0.5),
        gazeX: k * 0.25 * Math.sin(tt * 0.45 + 1), gazeY: k * 0.1 * Math.sin(tt * 0.6)
      };
    };
  }

  /* ---------------------------------------------------------------------------
     2. LA CAMÉRA : les 52 « expressions » de MediaPipe → nos 15 réglages
  --------------------------------------------------------------------------- */
  function depuisBlendshapes(cats, miroir) {
    var b = {}; (cats || []).forEach(function (c) { b[c.categoryName] = c.score; });
    var g = function (n) { return b[n] || 0; };
    /* « Left » de MediaPipe = œil gauche DE LA PERSONNE. Miroir (aperçu selfie) : son œil gauche est à gauche de l'écran. */
    var L = miroir ? 'Left' : 'Right', R = miroir ? 'Right' : 'Left';
    var m = miroir ? 1 : -1;
    var p = paramsNeutres();
    p.jaw = clamp(g('jawOpen') * 1.15, 0, 1);
    p.smile = clamp((g('mouthSmileLeft') + g('mouthSmileRight')) / 2 * 1.5, 0, 1);
    p.frown = clamp((g('mouthFrownLeft') + g('mouthFrownRight')) / 2 * 1.5, 0, 1);
    p.wide = clamp((g('mouthStretchLeft') + g('mouthStretchRight')) / 2 * 1.2 - (g('mouthPucker') + g('mouthFunnel') * 0.6) * 1.1, -1, 1);
    p.blinkL = clamp(g('eyeBlink' + L) * 1.15, 0, 1);
    p.blinkR = clamp(g('eyeBlink' + R) * 1.15, 0, 1);
    p.eyeWide = clamp((g('eyeWideLeft') + g('eyeWideRight')) / 2 * 1.4, 0, 1);
    var up = function (side) { return g('browOuterUp' + side) * 0.9 + g('browInnerUp') * 0.5; };
    p.browL = clamp(up(L) - g('browDown' + L) * 1.2, -1, 1);
    p.browR = clamp(up(R) - g('browDown' + R) * 1.2, -1, 1);
    p.browIn = clamp(g('browInnerUp') * 1.1 - (g('browDownLeft') + g('browDownRight')) * 0.7, -1, 1);
    /* regard : moyenne des deux yeux ; « In/Out » dépend du côté, on le ramène en gauche/droite de l'écran */
    var gx = (g('eyeLookOut' + R) - g('eyeLookIn' + R) + g('eyeLookIn' + L) - g('eyeLookOut' + L)) / 2;
    p.gazeX = clamp(gx * 1.4, -1, 1);
    p.gazeY = clamp((g('eyeLookDownLeft') + g('eyeLookDownRight') - g('eyeLookUpLeft') - g('eyeLookUpRight')) / 2 * 1.4, -1, 1);
    void m;
    return assainir(p);
  }
  /* Tête : matrice 4×4 (colonnes) de MediaPipe → angles. yaw + = le visage se tourne vers la droite de l'IMAGE (mesuré sur une photo de trois-quarts). */
  function poseDepuisMatrice(d, miroir) {
    if (!d || d.length < 16) return { yaw: 0, pitch: 0, roll: 0 };
    var yaw = Math.asin(clamp(d[8], -1, 1)), pitch = Math.asin(clamp(d[6], -1, 1)), roll = Math.asin(clamp(d[1], -1, 1));
    if (miroir) { yaw = -yaw; roll = -roll; }
    return { yaw: clamp(yaw, -0.9, 0.9), pitch: clamp(pitch, -0.6, 0.6), roll: clamp(roll, -0.6, 0.6) };
  }

  /* ---------------------------------------------------------------------------
     3. LA VOIX : le son → bouche (synchro des lèvres), calculé une fois sur tout le fichier
        jaw   : énergie (on ouvre plus quand c'est fort)  — plus la voyelle est « ouverte » (a), plus ça s'ouvre
        wide  : voyelle claire (i, é) = bouche étirée ; sombre (ou, o) = bouche en cœur
        Les consonnes sifflantes (s, ch, f) = dents visibles, bouche presque fermée.
  --------------------------------------------------------------------------- */
  function fft(re, im) { /* FFT radix-2 sur place */
    var n = re.length, i, j = 0, k, t;
    for (i = 1; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var ur = re[i + k], ui = im[i + k], xr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, xi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + xr; im[i + k] = ui + xi; re[i + k + len / 2] = ur - xr; im[i + k + len / 2] = ui - xi;
          var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  function analyserVoix(x, sr, fps) {
    fps = fps || 30;
    var hop = Math.max(1, Math.round(sr / fps)), N = 1024; while (N < sr * 0.032) N <<= 1;
    var nb = Math.max(1, Math.ceil(x.length / hop)), out = new Array(nb);
    var re = new Float64Array(N), im = new Float64Array(N), win = new Float64Array(N);
    for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    var bin = function (f) { return Math.max(1, Math.min(N / 2 - 1, Math.round(f * N / sr))); };
    var b200 = bin(200), b1000 = bin(1000), b3000 = bin(3000), b5500 = bin(5500), b8000 = bin(8000);
    var rmsMax = 1e-9, rms = new Float64Array(nb), f1 = new Float64Array(nb), f2 = new Float64Array(nb), hi = new Float64Array(nb);
    for (var f = 0; f < nb; f++) {
      var c = f * hop - (N >> 1) + (hop >> 1), e = 0;
      for (var s = 0; s < N; s++) { var v = (c + s >= 0 && c + s < x.length) ? x[c + s] : 0; re[s] = v * win[s]; im[s] = 0; e += v * v; }
      rms[f] = Math.sqrt(e / N); if (rms[f] > rmsMax) rmsMax = rms[f];
      fft(re, im);
      var m = function (k) { return Math.sqrt(re[k] * re[k] + im[k] * im[k]); };
      var num1 = 0, den1 = 1e-12, num2 = 0, den2 = 1e-12, eh = 0, et = 1e-12, k;
      for (k = b200; k <= b1000; k++) { var a = m(k); num1 += a * k; den1 += a; }
      for (k = b1000; k <= b3000; k++) { var a2 = m(k); num2 += a2 * k; den2 += a2; }
      for (k = b200; k <= b8000; k++) { var a3 = m(k); et += a3; if (k >= b5500) eh += a3; }
      f1[f] = (num1 / den1) * sr / N; f2[f] = (num2 / den2) * sr / N; hi[f] = eh / et;
    }
    var seuil = rmsMax * 0.035;
    for (var q = 0; q < nb; q++) {
      var nivel = clamp((rms[q] - seuil) / (rmsMax * 0.55), 0, 1), voise = rms[q] > seuil ? 1 : 0;
      var ouvert = clamp((f1[q] - 380) / 520, 0, 1);              /* F1 élevé = voyelle ouverte */
      var clair = clamp((f2[q] - 1250) / 1100, 0, 1);              /* F2 élevé = voyelle étirée */
      var sifflante = clamp((hi[q] - 0.25) / 0.25, 0, 1) * voise;
      var jaw = voise ? clamp(Math.pow(nivel, 0.65) * (0.35 + 0.75 * ouvert), 0, 1) : 0;
      jaw = jaw * (1 - 0.9 * sifflante) + 0.08 * sifflante;
      out[q] = { jaw: jaw, wide: voise ? clamp((clair - 0.5) * 1.8 * (1 - sifflante * 0.2) + sifflante * 0.5, -1, 1) : 0 };
    }
    return out;
  }
  /* Lissage attaque/libération : la bouche s'ouvre vite, se referme un peu moins vite (comme une vraie mâchoire). */
  function lisser(frames, fps, attaque, liberation) {
    var dt = 1 / (fps || 30), ka = 1 - Math.exp(-dt / (attaque || 0.035)), kr = 1 - Math.exp(-dt / (liberation || 0.07));
    var j = 0, w = 0, out = new Array(frames.length);
    for (var i = 0; i < frames.length; i++) {
      var tj = frames[i].jaw, tw = frames[i].wide;
      j += (tj - j) * (tj > j ? ka : kr); w += (tw - w) * 0.35;
      out[i] = { jaw: j, wide: w };
    }
    return out;
  }
  function boucheALInstant(frames, t, fps) {
    if (!frames || !frames.length) return { jaw: 0, wide: 0 };
    var f = clamp(t * (fps || 30), 0, frames.length - 1), a = Math.floor(f), b = Math.min(frames.length - 1, a + 1), k = f - a;
    return { jaw: lerp(frames[a].jaw, frames[b].jaw, k), wide: lerp(frames[a].wide, frames[b].wide, k) };
  }

  /* ---------------------------------------------------------------------------
     4. LA VOIX D'UN PERSONNAGE : changer la hauteur SANS changer la durée (WSOLA)
        (un panda grave, une abeille aiguë, une voix de souris… sans effet « accéléré » ni « ralenti »)
  --------------------------------------------------------------------------- */
  function etirerWSOLA(x, facteur) {
    var N = 1024, Hs = N / 2, Ha = Hs / facteur, delta = 256;
    var nOut = Math.max(N, Math.round(x.length * facteur)), out = new Float32Array(nOut + N), norm = new Float32Array(nOut + N);
    var win = new Float32Array(N); for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    var frames = Math.ceil(nOut / Hs), prev = 0, k, j;
    for (k = 0; k < frames; k++) {
      var nominal = Math.round(k * Ha), pos = nominal;
      if (k > 0) {
        /* on cherche, près de la position voulue, le morceau qui prolonge le mieux ce qui vient d'être écrit (continuité de la phase) */
        var cible = prev + Hs, best = -1e30, lo = Math.max(0, nominal - delta), hi = Math.min(x.length - N, nominal + delta);
        if (hi < lo) hi = lo;
        for (var c = lo; c <= hi; c += 4) {
          var s = 0; for (j = 0; j < N; j += 4) { var a = cible + j < x.length ? x[cible + j] : 0, b = c + j < x.length ? x[c + j] : 0; s += a * b; }
          if (s > best) { best = s; pos = c; }
        }
        var lo2 = Math.max(0, pos - 3), hi2 = Math.min(x.length - N, pos + 3), best2 = -1e30, pos2 = pos;
        for (var c2 = lo2; c2 <= hi2; c2++) { var s2 = 0; for (j = 0; j < N; j += 2) { var a2 = cible + j < x.length ? x[cible + j] : 0, b2 = c2 + j < x.length ? x[c2 + j] : 0; s2 += a2 * b2; } if (s2 > best2) { best2 = s2; pos2 = c2; } }
        pos = pos2;
      }
      var o = k * Hs;
      for (j = 0; j < N; j++) { var v = pos + j < x.length ? x[pos + j] : 0; out[o + j] += v * win[j]; norm[o + j] += win[j]; }
      prev = pos;
    }
    var res = new Float32Array(nOut);
    for (j = 0; j < nOut; j++) res[j] = norm[j] > 1e-3 ? out[j] / norm[j] : 0;
    return res;
  }
  function reechantillonner(x, ratio) { /* lecture à `ratio` fois la vitesse (interpolation linéaire) */
    var n = Math.max(1, Math.floor(x.length / ratio)), out = new Float32Array(n);
    for (var i = 0; i < n; i++) { var p = i * ratio, a = Math.floor(p), k = p - a; out[i] = (x[a] || 0) * (1 - k) + (x[a + 1] || 0) * k; }
    return out;
  }
  /* ratio > 1 = plus aigu, < 1 = plus grave. La durée reste celle d'origine. */
  function changerHauteur(x, ratio) {
    if (!x || !x.length || Math.abs(ratio - 1) < 0.005) return x;
    ratio = clamp(ratio, 0.5, 2);
    return reechantillonner(etirerWSOLA(x, ratio), ratio);
  }

  /* ---------------------------------------------------------------------------
     5. LE MAILLAGE : triangulation de Delaunay (Bowyer-Watson) — on ne dépend de rien
  --------------------------------------------------------------------------- */
  function delaunay(pts) {
    var n = pts.length, i, j, minx = 1e30, miny = 1e30, maxx = -1e30, maxy = -1e30;
    for (i = 0; i < n; i++) { minx = Math.min(minx, pts[i][0]); maxx = Math.max(maxx, pts[i][0]); miny = Math.min(miny, pts[i][1]); maxy = Math.max(maxy, pts[i][1]); }
    var d = Math.max(maxx - minx, maxy - miny, 1) * 20, mx = (minx + maxx) / 2, my = (miny + maxy) / 2;
    var P = pts.concat([[mx - d, my - d], [mx, my + d], [mx + d, my - d]]);
    var tris = [];
    function circ(a, b, c) {
      var A = P[a], B = P[b], C = P[c], D = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
      if (Math.abs(D) < 1e-12) return { x: 0, y: 0, r2: Infinity };
      var a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
      var ux = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / D, uy = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / D;
      return { x: ux, y: uy, r2: (A[0] - ux) * (A[0] - ux) + (A[1] - uy) * (A[1] - uy) };
    }
    tris.push({ v: [n, n + 1, n + 2], c: circ(n, n + 1, n + 2) });
    for (i = 0; i < n; i++) {
      var px = P[i][0], py = P[i][1], mauvais = [], garde = [];
      for (j = 0; j < tris.length; j++) { var c = tris[j].c, dx = px - c.x, dy = py - c.y; (dx * dx + dy * dy < c.r2 * (1 + 1e-10) ? mauvais : garde).push(tris[j]); }
      var aretes = {};
      mauvais.forEach(function (t) { for (var e = 0; e < 3; e++) { var a = t.v[e], b = t.v[(e + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a; aretes[key] = aretes[key] ? { n: aretes[key].n + 1 } : { n: 1, a: a, b: b }; } });
      tris = garde;
      for (var key in aretes) if (aretes[key].n === 1) tris.push({ v: [aretes[key].a, aretes[key].b, i], c: circ(aretes[key].a, aretes[key].b, i) });
    }
    var out = [];
    tris.forEach(function (t) { if (t.v[0] < n && t.v[1] < n && t.v[2] < n) out.push(t.v); });
    return out;
  }
  function dansPolygone(x, y, poly) {
    var dedans = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
  }

  /* ---------------------------------------------------------------------------
     6. LES GROUPES DE POINTS (numéros MediaPipe, vérifiés à l'œil sur une photo : lèvres, yeux, contour)
        Les listes vont toujours de la GAUCHE de l'image vers la DROITE (lèvres) ou de l'extérieur vers l'intérieur (paupières).
  --------------------------------------------------------------------------- */
  var MP = {
    lipOU: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291], lipOL: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
    lipIU: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308], lipIL: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],
    eyeLup: [246, 161, 160, 159, 158, 157, 173], eyeLlo: [7, 163, 144, 145, 153, 154, 155],
    eyeRup: [466, 388, 387, 386, 385, 384, 398], eyeRlo: [249, 390, 373, 374, 380, 381, 382],
    browL: [70, 63, 105, 66, 107, 46, 53, 52, 65, 55], browR: [300, 293, 334, 296, 336, 276, 283, 282, 295, 285],
    jaw: [58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288],
    oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
    nez: [1, 2, 4, 5, 6, 168, 195, 197, 98, 327, 129, 358, 19, 94],
    eyeCoinL: [33, 133], eyeCoinR: [362, 263],
    iris: [468, 469, 470, 471, 472, 473, 474, 475, 476, 477]
  };

  function moyenne(pts, idx) { var x = 0, y = 0; idx.forEach(function (i) { x += pts[i][0]; y += pts[i][1]; }); return [x / idx.length, y / idx.length]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  /* Fabrique le « rig » : points + groupes + triangles + échelle du visage. `g` donne les groupes (indices dans `pts`). */
  function fabriquerRig(pts, w, h, g, options) {
    options = options || {};
    var n0 = pts.length, P = pts.map(function (p) { return [p[0], p[1]]; });
    var eyeL = moyenne(P, g.eyeLup.concat(g.eyeLlo)), eyeR = moyenne(P, g.eyeRup.concat(g.eyeRlo));
    var io = Math.max(1, dist(eyeL, eyeR));
    var c = [(eyeL[0] + eyeR[0]) / 2, (eyeL[1] + eyeR[1]) / 2];
    var mouth = moyenne(P, g.lipIU.concat(g.lipIL));
    var oval = g.oval.map(function (i) { return P[i]; });
    var minx = 1e30, miny = 1e30, maxx = -1e30, maxy = -1e30;
    oval.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    var face = { x0: minx, y0: miny, x1: maxx, y1: maxy };
    var fcx = (minx + maxx) / 2, fcy = (miny + maxy) / 2, rx = (maxx - minx) / 2 * 1.08, ry = (maxy - miny) / 2 * 1.12;
    /* points de décor : une grille sur toute l'image (hors du visage), pour que RIEN ne soit coupé (cheveux, cou, épaules, fond) */
    var colonnes = 9, lignes = Math.max(2, Math.round(9 * h / w)), idxDecor = [];
    for (var gy = 0; gy <= lignes; gy++) for (var gx = 0; gx <= colonnes; gx++) {
      var x = gx / colonnes * w, y = gy / lignes * h;
      var ex = (x - fcx) / (rx * 1.25), ey = (y - fcy) / (ry * 1.25);
      if (ex * ex + ey * ey < 1) continue;                        /* dans le visage : déjà couvert par ses propres points */
      idxDecor.push(P.length); P.push([x, y]);
    }
    /* triangulation : tous les points SAUF l'intérieur des lèvres (le trou de la bouche), puis la couronne des lèvres à la main */
    var interne = {}; g.lipIU.concat(g.lipIL).forEach(function (i) { interne[i] = 1; });
    var gardes = [], mapping = [];
    for (var i = 0; i < P.length; i++) if (!interne[i]) { mapping.push(i); gardes.push(P[i]); }
    var polyOuter = g.lipOU.map(function (i) { return P[i]; }).concat(g.lipOL.slice(1, -1).reverse().map(function (i) { return P[i]; }));
    var tri = [];
    delaunay(gardes).forEach(function (t) {
      var a = P[mapping[t[0]]], b = P[mapping[t[1]]], cc = P[mapping[t[2]]];
      if (dansPolygone((a[0] + b[0] + cc[0]) / 3, (a[1] + b[1] + cc[1]) / 3, polyOuter)) return;   /* intérieur de la bouche : on le laisse vide */
      tri.push([mapping[t[0]], mapping[t[1]], mapping[t[2]]]);
    });
    [[g.lipOU, g.lipIU], [g.lipOL, g.lipIL]].forEach(function (pair) {
      var o = pair[0], inn = pair[1];
      for (var k = 0; k < o.length - 1; k++) { tri.push([o[k], o[k + 1], inn[k]]); tri.push([o[k + 1], inn[k + 1], inn[k]]); }
    });
    return {
      version: 1, n: P.length, nVisage: n0, w: w, h: h, pts: P, g: g, tri: tri, decor: idxDecor,
      io: io, eyeL: eyeL, eyeR: eyeR, centre: c, bouche: mouth, mw: Math.max(1, dist(P[g.lipOU[0]], P[g.lipOU[g.lipOU.length - 1]])),
      face: face, ellipse: { cx: fcx, cy: fcy, rx: rx, ry: ry }, manuel: !!options.manuel
    };
  }

  /* Le rig depuis les 478 points de MediaPipe (coordonnées 0..1 → pixels de l'image). */
  function rigDepuisMediaPipe(lm, w, h) {
    var pts = lm.map(function (p) { return [p.x * w, p.y * h]; });
    return fabriquerRig(pts, w, h, MP);
  }

  /* Le rig « à la main » : trois touches (œil gauche, œil droit, bouche) — pour un chien, un doudou, un dessin, un visage que MediaPipe rate. */
  function rigManuel(w, h, oeilG, oeilD, bouche, largeurBouche) {
    var ex = [oeilD[0] - oeilG[0], oeilD[1] - oeilG[1]], io = Math.max(2, Math.hypot(ex[0], ex[1]));
    ex = [ex[0] / io, ex[1] / io];
    var ey = [-ex[1], ex[0]];                                     /* « vers le bas du visage » */
    var C = [(oeilG[0] + oeilD[0]) / 2, (oeilG[1] + oeilD[1]) / 2];
    if ((bouche[0] - C[0]) * ey[0] + (bouche[1] - C[1]) * ey[1] < 0) ey = [-ey[0], -ey[1]];   /* la bouche est forcément en dessous des yeux */
    var v = Math.max(io * 0.6, (bouche[0] - C[0]) * ey[0] + (bouche[1] - C[1]) * ey[1]);       /* distance yeux → bouche */
    var mw = (largeurBouche || 0.8) * io;
    var pts = [], g = { };
    var loc = function (a, b, o) { var p = o || C; return [p[0] + ex[0] * a * io + ey[0] * b * io, p[1] + ex[1] * a * io + ey[1] * b * io]; };
    var add = function (p) { pts.push(p); return pts.length - 1; };
    var vv = v / io;
    /* yeux : coins partagés par les deux paupières */
    var oeil = function (centre, cote) {
      var cL = add(loc(-0.27, 0, centre)), cR = add(loc(0.27, 0, centre));
      var up = [add(loc(-0.13, -0.11, centre)), add(loc(0, -0.15, centre)), add(loc(0.13, -0.11, centre))];
      var lo = [add(loc(-0.13, 0.08, centre)), add(loc(0, 0.11, centre)), add(loc(0.13, 0.08, centre))];
      return { up: [cL].concat(up).concat([cR]), lo: [cL].concat(lo).concat([cR]) };
    };
    var L = oeil(oeilG), R = oeil(oeilD);
    g.eyeLup = L.up; g.eyeLlo = L.lo; g.eyeRup = R.up; g.eyeRlo = R.lo;
    g.browL = [-0.30, -0.15, 0, 0.15, 0.30].map(function (a) { return add(loc(a, -0.40 - 0.05 * (1 - Math.abs(a) / 0.3), oeilG)); });
    g.browR = [-0.30, -0.15, 0, 0.15, 0.30].map(function (a) { return add(loc(a, -0.40 - 0.05 * (1 - Math.abs(a) / 0.3), oeilD)); });
    g.nez = [add(loc(0, vv * 0.5)), add(loc(-0.13, vv * 0.55)), add(loc(0.13, vv * 0.55)), add(loc(0, vv * 0.28))];
    /* bouche : 11 points par bord, comme MediaPipe */
    var ts = []; for (var k = 0; k < 11; k++) ts.push(-1 + 2 * k / 10);
    var M = bouche, mpos = function (t, dy, o) { return [M[0] + ex[0] * t * mw / 2 * o + ey[0] * dy * mw, M[1] + ex[1] * t * mw / 2 * o + ey[1] * dy * mw]; };
    var bump = function (t) { return Math.pow(Math.max(0, 1 - t * t), 0.7); };
    g.lipOU = ts.map(function (t) { return add(mpos(t, -0.10 * bump(t), 1)); });
    g.lipOL = ts.map(function (t, i) { return (i === 0 || i === 10) ? g.lipOU[i] : add(mpos(t, 0.12 * bump(t), 1)); });
    g.lipIU = ts.map(function (t) { return add(mpos(t, -0.012 * bump(t), 0.86)); });
    g.lipIL = ts.map(function (t, i) { return (i === 0 || i === 10) ? g.lipIU[i] : add(mpos(t, 0.012 * bump(t), 0.86)); });
    /* contour : une ellipse autour du visage, plus large que les yeux */
    var cy = vv * 0.5 + 0.1, ryy = vv * 0.62 + 0.55, rxx = 1.28;
    g.oval = []; for (var a = 0; a < 20; a++) { var th = Math.PI * 2 * a / 20; g.oval.push(add(loc(Math.sin(th) * rxx, cy - Math.cos(th) * ryy))); }
    /* mâchoire : la moitié basse du contour */
    g.jaw = g.oval.filter(function (_, i) { var th = Math.PI * 2 * i / 20; return Math.cos(th) < -0.2; });
    g.eyeCoinL = [L.up[0], L.up[4]]; g.eyeCoinR = [R.up[0], R.up[4]];
    var rig = fabriquerRig(pts, w, h, g, { manuel: true });
    return rig;
  }

  /* ---------------------------------------------------------------------------
     7. LA DÉFORMATION : les réglages → la position de chaque point du maillage
  --------------------------------------------------------------------------- */
  function deformer(rig, P, sortie) {
    P = P || PARAMS_NEUTRES;
    var n = rig.n, pts = rig.pts, g = rig.g, io = rig.io, mw = rig.mw;
    var D = sortie && sortie.length >= n * 2 ? sortie : new Float32Array(n * 2);
    var dx = new Float32Array(n), dy = new Float32Array(n), poids = new Float32Array(n);  /* poids > 0 : point « poignée » (déplacement imposé) */
    var poignee = function (i, x, y, w) { dx[i] = x; dy[i] = y; poids[i] = w == null ? 1 : w; };
    var cx = rig.bouche[0], k, i, t;
    /* — bouche — */
    var ouv = P.jaw * 0.62 * mw;
    var elarg = 1 + 0.16 * P.wide + 0.2 * P.smile, serre = P.wide < 0 ? 1 + 0.42 * P.wide : 1;
    var nU = g.lipOU.length, epais = (P.wide < 0 ? -P.wide : 0) * 0.07 * mw;   /* bouche en cœur : les lèvres s'avancent, donc s'épaississent */
    for (k = 0; k < nU; k++) {
      t = k / (nU - 1); var centre = Math.pow(Math.sin(Math.PI * t), 0.85), coin = 1 - centre, sx = (pts[g.lipOU[k]][0] - cx);
      var px = sx * (elarg * (P.wide < 0 ? serre : 1) - 1);
      var lift = -(P.smile * 0.25 - P.frown * 0.14) * mw * Math.pow(coin, 1.4);
      poignee(g.lipOU[k], px, -ouv * 0.12 * centre + lift - epais * 0.5 * centre, 1);
      poignee(g.lipIU[k], (pts[g.lipIU[k]][0] - cx) * (elarg * (P.wide < 0 ? serre : 1) - 1), -ouv * 0.08 * centre + lift, 1);
      if (k > 0 && k < nU - 1) {
        poignee(g.lipOL[k], (pts[g.lipOL[k]][0] - cx) * (elarg * (P.wide < 0 ? serre : 1) - 1), ouv * (0.18 + 0.82 * centre) + lift + epais * 0.8 * centre, 1);
        poignee(g.lipIL[k], (pts[g.lipIL[k]][0] - cx) * (elarg * (P.wide < 0 ? serre : 1) - 1), ouv * (0.1 + 0.9 * centre) + lift + epais * 0.45 * centre, 1);
      }
    }
    /* mâchoire : le menton suit la lèvre du bas */
    var nJ = g.jaw.length;
    for (k = 0; k < nJ; k++) { t = k / (nJ - 1); var wj = Math.pow(Math.sin(Math.PI * t), 1.2); poignee(g.jaw[k], 0, ouv * 0.92 * wj, 1); }
    /* — paupières : la paupière du haut descend sur celle du bas — */
    var lid = function (up, lo, B, W) {
      for (var j = 0; j < up.length; j++) {
        var a = up[j], b = lo[j]; if (a === b) { poignee(a, 0, 0, 1); continue; }
        var gap = pts[b][1] - pts[a][1];
        poignee(a, 0, gap * 0.98 * B - gap * 0.30 * W * (1 - B), 1);
        poignee(b, 0, -gap * 0.12 * B + gap * 0.18 * W * (1 - B), 1);
      }
    };
    lid(g.eyeLup, g.eyeLlo, P.blinkL, P.eyeWide); lid(g.eyeRup, g.eyeRlo, P.blinkR, P.eyeWide);
    /* — sourcils — */
    var gs = rig.gainSourcils == null ? 1 : rig.gainSourcils;       /* lunettes : sourcils adoucis (rig.gainSourcils posé par le rendu) */
    function sourcils(list, b, cote) {
      var m = list.length, demi = m > 5 ? m / 2 : m;
      for (var j = 0; j < m; j++) {
        var jj = j % demi, interne = demi > 1 ? jj / (demi - 1) : 0.5;   /* 0 extérieur … 1 intérieur (listes données de l'extérieur vers l'intérieur) */
        var fond = 0.35 + 0.65 * Math.sin(Math.PI * (0.1 + 0.8 * interne));                    /* le bout du sourcil bouge moins que le milieu : pas de bande dure */
        var dyy = (-b * 0.15 * io * fond - P.browIn * (P.browIn < 0 ? 0.11 : 0.20) * io * interne) * gs;
        var dxx = (P.browIn < 0 ? -P.browIn * 0.05 * io * interne * cote : 0);
        poignee(list[j], dxx, dyy, 1);
      }
    }
    sourcils(g.browL, P.browL, 1); sourcils(g.browR, P.browR, -1);
    /* — l'iris : il glisse dans l'œil selon le regard, et se pose sur la ligne des paupières quand l'œil se ferme (sinon il reste une pointe sombre) — */
    if (g.iris) {
      var loY = function (lo) { var m = 0; lo.forEach(function (j) { m += pts[j][1]; }); return m / lo.length; };
      var yBasL = loY(g.eyeLlo), yBasR = loY(g.eyeRlo);
      g.iris.forEach(function (i) {
        var gauche = pts[i][0] < rig.centre[0], B = gauche ? P.blinkL : P.blinkR, cible = gauche ? yBasL : yBasR;
        poignee(i, P.gazeX * 0.075 * io * (1 - B), P.gazeY * 0.05 * io * (1 - B) + B * 0.97 * (cible - pts[i][1]), 1);
      });
    }
    /* — le nez et le contour haut restent en place (ancrages) — */
    g.nez.forEach(function (i) { poignee(i, 0, 0, 1); });
    (g.eyeCoinL || []).concat(g.eyeCoinR || []).forEach(function (i) { poignee(i, 0, 0, 1); });   /* les coins des yeux ne bougent jamais : plus de pointes aux paupières */
    var no = g.oval.length;
    for (k = 0; k < no; k++) { var iy = pts[g.oval[k]][1]; if (iy < rig.centre[1]) poignee(g.oval[k], 0, 0, 1); }
    /* — le reste du visage suit, en douceur (interpolation par distance : le plus proche commande) — */
    var H = [], j2;
    for (i = 0; i < n; i++) if (poids[i] > 0) H.push(i);
    /* Noyau à portée limitée (Franke-Little) : le plus proche commande, l'influence tombe à ZÉRO au-delà de ~1,7 écart entre les yeux
       (avant : la bouche déplaçait le front de plusieurs pixels). Le « poids de repos » w0 fait décroître doucement le mouvement vers les bords. */
    var Rmax = io * 1.7, dmin = io * 0.04;
    var noyau = function (d) { if (d >= Rmax) return 0; var dd = d < dmin ? dmin : d; var q = (Rmax - dd) / (Rmax * dd); return q * q; };
    var w0 = noyau(Rmax * 0.55);
    for (i = 0; i < n; i++) {
      if (poids[i] > 0) continue;
      var sx = 0, sy = 0, sw = w0, px0 = pts[i][0], py0 = pts[i][1];
      for (j2 = 0; j2 < H.length; j2++) {
        var h = H[j2], ddx = px0 - pts[h][0], ddy = py0 - pts[h][1];
        if (ddx > Rmax || ddx < -Rmax || ddy > Rmax || ddy < -Rmax) continue;
        var wgt = noyau(Math.sqrt(ddx * ddx + ddy * ddy)); if (wgt <= 0) continue;
        sx += wgt * dx[h]; sy += wgt * dy[h]; sw += wgt;
      }
      dx[i] = sx / sw; dy[i] = sy / sw;
    }
    /* — la tête : roulis, tour (yaw), hochement (pitch) — la tête entière bouge, le cou à moitié, les épaules et le fond presque pas (fondu doux : jamais de pli) — */
    var e = rig.ellipse, sy2 = Math.sin(P.yaw), sp = Math.sin(P.pitch), prof = e.rx * 0.95;
    for (i = 0; i < n; i++) {
      var ux = (pts[i][0] - e.cx) / e.rx, uy = (pts[i][1] - e.cy) / e.ry, r2 = ux * ux + uy * uy;
      var tete = 1 / (1 + Math.pow(r2, 3) / 4);                       /* 1 sur la tête, ~0,5 vers r=1,25, → 0 plus loin */
      var rel = r2 < 0.95 ? Math.sqrt(1 - r2) : 0;                    /* le nez est plus « en avant » que les oreilles : léger effet de relief */
      var prof3 = tete * (0.4 + 0.6 * rel);
      var ang = P.roll * tete, ca = Math.cos(ang), sa = Math.sin(ang);
      var x = pts[i][0] + dx[i] + sy2 * prof3 * prof, y = pts[i][1] + dy[i] + sp * prof3 * prof * 0.8;
      var rx2 = x - e.cx, ry2 = y - e.cy;
      D[i * 2] = e.cx + rx2 * ca + ry2 * sa; D[i * 2 + 1] = e.cy - rx2 * sa + ry2 * ca;
    }
    return D;
  }

  /* Ce qu'il faut dessiner PAR-DESSUS / EN DESSOUS du maillage, calculé depuis les points déformés. */
  function geometrieBouche(rig, D, P) {
    var g = rig.g, pt = function (i) { return [D[i * 2], D[i * 2 + 1]]; };
    var haut = g.lipIU.map(pt), bas = g.lipIL.map(pt), mid = (haut.length / 2) | 0;
    var ouverture = bas[mid][1] - haut[mid][1];
    return { haut: haut, bas: bas, ouverture: ouverture, largeur: Math.abs(haut[haut.length - 1][0] - haut[0][0]), dents: ouverture > rig.mw * 0.04, jaw: P.jaw };
  }
  function geometriePaupiere(rig, D, cote) {
    var g = rig.g, up = cote === 'L' ? g.eyeLup : g.eyeRup, lo = cote === 'L' ? g.eyeLlo : g.eyeRlo;
    return { haut: up.map(function (i) { return [D[i * 2], D[i * 2 + 1]]; }), bas: lo.map(function (i) { return [D[i * 2], D[i * 2 + 1]]; }) };
  }

  /* ---------------------------------------------------------------------------
     8. LE TOUR DE TÊTE (vidéo « 3D ») : de toutes les images d'une vidéo, on garde les meilleures par angle
  --------------------------------------------------------------------------- */
  function choisirVues(cands, max) {
    /* cands : [{ yaw, pitch, nette (plus grand = plus net), neutre (0..1, 1 = visage sans expression) }] — renvoie les indices à garder, triés par yaw. */
    max = max || 5;
    if (!cands || !cands.length) return [];
    var cibles = max >= 5 ? [-0.55, -0.28, 0, 0.28, 0.55] : max >= 3 ? [-0.4, 0, 0.4] : [0];
    var pris = {}, res = [];
    cibles.forEach(function (c) {
      var best = -1, score = -1e30;
      cands.forEach(function (v, i) {
        if (pris[i] || Math.abs(Math.abs(v.pitch || 0)) > 0.35) return;
        var s = -Math.abs((v.yaw || 0) - c) * 6 + (v.nette || 0) * 1.5 + (v.neutre == null ? 0.5 : v.neutre) * 1.2;
        if (Math.abs((v.yaw || 0) - c) > 0.22) s -= 50;              /* trop loin de l'angle visé : pas cette vue-là */
        if (s > score) { score = s; best = i; }
      });
      if (best >= 0 && score > -40) { pris[best] = 1; res.push(best); }
    });
    if (!res.length) { var b0 = 0; cands.forEach(function (v, i) { if (Math.abs(v.yaw || 0) < Math.abs(cands[b0].yaw || 0)) b0 = i; }); res.push(b0); }
    return res.sort(function (a, b) { return cands[a].yaw - cands[b].yaw; });
  }
  /* Pour un angle de tête donné : les deux vues voisines et le fondu entre elles. */
  function melangerVues(yaws, yaw) {
    if (!yaws || !yaws.length) return null;
    if (yaws.length === 1) return { a: 0, b: 0, t: 0 };
    var i = 0; while (i < yaws.length - 1 && yaws[i + 1] <= yaw) i++;
    if (yaw <= yaws[0]) return { a: 0, b: 0, t: 0 };
    if (yaw >= yaws[yaws.length - 1]) return { a: yaws.length - 1, b: yaws.length - 1, t: 0 };
    var t = (yaw - yaws[i]) / Math.max(1e-6, yaws[i + 1] - yaws[i]);
    return { a: i, b: i + 1, t: t * t * (3 - 2 * t) };
  }

  /* ---------------------------------------------------------------------------
     9. LE PAQUET « AVATAR » : ce qu'on garde et ce qu'on peut donner à une autre application
        { v:1, type:'photo'|'perso', nom, vues:[{ yaw, w, h, img(dataURL jpeg/webp), pts([[x,y]…478 ou gabarit]), manuel }], perso:{ id, teinte, accessoire }, voix:{ hauteur } }
  --------------------------------------------------------------------------- */
  function empaqueter(a) {
    var vues = (a.vues || []).map(function (v) {
      return { yaw: +(+v.yaw || 0).toFixed(3), pitch: +(+v.pitch || 0).toFixed(3), w: v.w, h: v.h, img: v.img, manuel: !!v.manuel,
        pts: (v.pts || []).slice(0, v.manuel ? 80 : 478).map(function (p) { return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; }),
        oeilG: v.oeilG || null, oeilD: v.oeilD || null, bouche: v.bouche || null, largeurBouche: v.largeurBouche || null };
    });
    return { v: 1, type: a.type || 'photo', nom: String(a.nom || 'Mon avatar').slice(0, 60), vues: vues, perso: a.perso || null, voix: a.voix || { hauteur: 1 }, moteur: 'avatar-core ' + VERSION };
  }
  function validerPaquet(o) {
    if (!o || typeof o !== 'object' || o.v !== 1) return { ok: false, raison: 'paquet inconnu (version)' };
    if (o.type !== 'photo' && o.type !== 'perso') return { ok: false, raison: 'type inconnu' };
    if (o.type === 'perso') return (o.perso && typeof o.perso.id === 'string') ? { ok: true } : { ok: false, raison: 'personnage manquant' };
    if (!Array.isArray(o.vues) || !o.vues.length || o.vues.length > 7) return { ok: false, raison: 'vues manquantes ou trop nombreuses' };
    for (var i = 0; i < o.vues.length; i++) {
      var v = o.vues[i];
      if (!v || typeof v.img !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(v.img)) return { ok: false, raison: 'image de la vue ' + i + ' invalide' };
      if (v.img.length > 4e6) return { ok: false, raison: 'image de la vue ' + i + ' trop lourde' };
      if (!(v.w > 0 && v.h > 0 && v.w < 4096 && v.h < 4096)) return { ok: false, raison: 'dimensions de la vue ' + i };
      if (!Array.isArray(v.pts) || (v.pts.length !== 478 && !v.manuel)) return { ok: false, raison: 'points de la vue ' + i };
      for (var j = 0; j < v.pts.length; j++) if (!Array.isArray(v.pts[j]) || !isFinite(v.pts[j][0]) || !isFinite(v.pts[j][1])) return { ok: false, raison: 'point illisible (' + i + '/' + j + ')' };
      if (v.manuel && !(v.oeilG && v.oeilD && v.bouche)) return { ok: false, raison: 'repères manuels manquants' };
    }
    return { ok: true };
  }
  function rigDepuisVue(v) {
    if (v.manuel) return rigManuel(v.w, v.h, v.oeilG, v.oeilD, v.bouche, v.largeurBouche);
    return fabriquerRig(v.pts, v.w, v.h, MP);
  }

  /* ---------------------------------------------------------------------------
     10. LES VOIX DES PERSONNAGES (hauteur) — le clone de voix (autre branche) s'ajoute comme un fournisseur de plus
  --------------------------------------------------------------------------- */
  var HAUTEURS = { naturelle: 1, grave: 0.82, aigue: 1.22, panda: 0.86, lion: 0.72, ane: 0.9, abeille: 1.32, chat: 1.18, renard: 1.12, ours: 0.78, lapin: 1.28 };

  return {
    VERSION: VERSION, MP: MP, PARAMS_NEUTRES: PARAMS_NEUTRES, NOMS_PARAMS: NOMS_PARAMS, LIMITES: LIMITES, HUMEURS: HUMEURS, HAUTEURS: HAUTEURS,
    paramsNeutres: paramsNeutres, assainir: assainir, fusionner: fusionner, fabriquerRepos: fabriquerRepos,
    depuisBlendshapes: depuisBlendshapes, poseDepuisMatrice: poseDepuisMatrice,
    analyserVoix: analyserVoix, lisser: lisser, boucheALInstant: boucheALInstant,
    etirerWSOLA: etirerWSOLA, reechantillonner: reechantillonner, changerHauteur: changerHauteur,
    delaunay: delaunay, dansPolygone: dansPolygone, fabriquerRig: fabriquerRig, rigDepuisMediaPipe: rigDepuisMediaPipe, rigManuel: rigManuel, rigDepuisVue: rigDepuisVue,
    deformer: deformer, geometrieBouche: geometrieBouche, geometriePaupiere: geometriePaupiere,
    choisirVues: choisirVues, melangerVues: melangerVues, empaqueter: empaqueter, validerPaquet: validerPaquet,
    fft: fft, clamp: clamp, lerp: lerp, sstep: sstep
  };
});
