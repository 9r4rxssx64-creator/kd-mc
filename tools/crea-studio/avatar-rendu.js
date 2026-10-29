/* ============================================================================
 * AVATAR-RENDU — dessine un avatar-photo à l'écran : la VRAIE photo posée sur le maillage d'avatar-core.js, déformée à chaque image.
 *  - WebGL (iPhone, Android, ordinateur) : un seul passage, ~1 000 triangles, sans couture ; repli Canvas 2D si WebGL manque ou se perd.
 *  - Dessous : la photo intacte (aucune fissure possible) · l'intérieur de la bouche (cavité sombre, dents, langue) · les paupières fermées par-dessus.
 *  - Plusieurs VUES (le tour de tête d'une vidéo) : on dessine les deux vues voisines de l'angle de la tête et on fond l'une dans l'autre.
 * Dépend de AvatarCore (même dossier). Aucun réseau.
 * ========================================================================== */
(function (racine) {
  'use strict';
  var C = racine.AvatarCore;
  if (!C) { throw new Error('avatar-rendu.js : charger avatar-core.js avant'); }

  var VS = 'attribute vec2 p;attribute vec2 u;uniform vec2 r;varying vec2 v;void main(){v=u;gl_Position=vec4(p.x/r.x*2.0-1.0,1.0-p.y/r.y*2.0,0.0,1.0);}';
  var FS = 'precision mediump float;varying vec2 v;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,v);}';

  function peau(img, rig) {
    /* la couleur de peau (ou de pelage) = moyenne de petits carrés sur les joues, pour fermer les paupières de la bonne teinte */
    try {
      var c = document.createElement('canvas'); c.width = img.width || img.naturalWidth; c.height = img.height || img.naturalHeight;
      var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
      var ey = [(rig.bouche[0] - rig.centre[0]), (rig.bouche[1] - rig.centre[1])];
      var pts = [], io = rig.io, k;
      [rig.eyeL, rig.eyeR].forEach(function (e, i) {
        var dir = i === 0 ? -1 : 1;
        for (k = 0.35; k <= 0.65; k += 0.15) pts.push([e[0] + (rig.bouche[0] - e[0]) * k + dir * io * 0.28, e[1] + (rig.bouche[1] - e[1]) * k]);
      });
      void ey;
      var r = 0, g = 0, b = 0, n = 0;
      pts.forEach(function (p) {
        var sx = Math.max(0, Math.min(c.width - 6, Math.round(p[0]) - 3)), sy = Math.max(0, Math.min(c.height - 6, Math.round(p[1]) - 3));
        var d = x.getImageData(sx, sy, 6, 6).data;
        for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      });
      return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [214, 172, 150];
    } catch (e) { return [214, 172, 150]; }
  }

  /* Lunettes ? Une monture laisse un trait sombre et continu SOUS chaque œil (la lentille). Si les deux yeux l'ont, on adoucit les sourcils
     (sinon lever un sourcil arrache la monture). Mesuré sur des visages fictifs : sans lunettes ≈ 0,1-0,3 ; avec ≈ 0,9. */
  function detecterLunettes(img, rig) {
    try {
      var c = document.createElement('canvas'); c.width = img.width || img.naturalWidth; c.height = img.height || img.naturalHeight;
      var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      var io = rig.io, tot = 0, nb = 0;
      [rig.eyeL, rig.eyeR].forEach(function (e) {
        var x0 = Math.max(0, Math.round(e[0] - 0.45 * io)), x1 = Math.min(c.width - 1, Math.round(e[0] + 0.45 * io)), y0 = Math.max(0, Math.round(e[1] + 0.28 * io)), y1 = Math.min(c.height - 1, Math.round(e[1] + 0.66 * io));
        var w = x1 - x0, h = y1 - y0; if (w < 6 || h < 4) return;
        var d = g.getImageData(x0, y0, w, h).data, L = [], i, x, y;
        for (i = 0; i < d.length; i += 4) L.push(0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]);
        var tri = L.slice().sort(function (a, b) { return a - b; }), med = tri[tri.length >> 1], sombres = 0;
        for (x = 0; x < w; x++) { var mn = 255; for (y = 0; y < h; y++) mn = Math.min(mn, L[y * w + x]); if (mn < 0.5 * med && mn < 95) sombres++; }
        tot += sombres / w; nb++;
      });
      return nb ? tot / nb : 0;
    } catch (e) { return 0; }
  }

  function creer(sortie, options) {
    options = options || {};
    var ctx = sortie.getContext('2d');
    var W = sortie.width, H = sortie.height;
    var gl = null, glCanvas = null, prog = null, bufPos = null, bufUv = null, bufIdx = null, locP = 0, locU = 0, locR = null;
    var vues = [], cadre = { s: 1, ox: 0, oy: 0 }, zoom = 1, decalage = { x: 0, y: 0 };
    var mode = 'webgl', perdu = false;
    var tampon = null;                         /* positions déformées (px de la photo) */
    var posOut = null;                         /* positions en px de la sortie */

    function initGL() {
      if (options.sansWebGL) return false;
      try {
        glCanvas = document.createElement('canvas'); glCanvas.width = W; glCanvas.height = H;
        gl = glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false })
          || glCanvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
        if (!gl) return false;
        var mk = function (t, s) { var sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
        prog = gl.createProgram(); gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('liaison GL');
        locP = gl.getAttribLocation(prog, 'p'); locU = gl.getAttribLocation(prog, 'u'); locR = gl.getUniformLocation(prog, 'r');
        bufPos = gl.createBuffer(); bufUv = gl.createBuffer(); bufIdx = gl.createBuffer();
        glCanvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); perdu = true; mode = '2d'; }, false);
        return true;
      } catch (e) { gl = null; return false; }
    }
    mode = initGL() ? 'webgl' : '2d';

    function preparerVue(v) {
      v.nTri = v.rig.tri.length;
      if (mode === 'webgl' && gl) {
        var uv = new Float32Array(v.rig.n * 2);
        for (var i = 0; i < v.rig.n; i++) { uv[i * 2] = v.rig.pts[i][0] / v.rig.w; uv[i * 2 + 1] = v.rig.pts[i][1] / v.rig.h; }
        var idx = new Uint16Array(v.nTri * 3);
        for (var t = 0; t < v.nTri; t++) { idx[t * 3] = v.rig.tri[t][0]; idx[t * 3 + 1] = v.rig.tri[t][1]; idx[t * 3 + 2] = v.rig.tri[t][2]; }
        v.uv = uv; v.idx = idx;
        v.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, v.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v.img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      v.peau = peau(v.img, v.rig);
      v.lunettesScore = v.rig.manuel ? 0 : detecterLunettes(v.img, v.rig);
      v.rig.gainSourcils = v.lunettesScore >= 0.6 ? 0.28 : 1;                      /* lunettes détectées : sourcils adoucis */
    }

    /* vues : [{ img (Image/Canvas, même taille que rig.w×rig.h), rig, yaw }] */
    function charger(liste) {
      vues = liste.map(function (v) { return { img: v.img, rig: v.rig, yaw: v.yaw || 0, peau: null, tex: null }; });
      vues.sort(function (a, b) { return a.yaw - b.yaw; });
      vues.forEach(preparerVue);
      tampon = new Float32Array(vues.reduce(function (m, v) { return Math.max(m, v.rig.n); }, 0) * 2);
      posOut = new Float32Array(tampon.length);
      cadrer();
    }
    /* Cadrage : le visage au centre, les yeux à 38 % de la hauteur, et la photo couvre toujours tout l'écran. */
    function cadrer() {
      var v = vues[0]; if (!v) return;
      var r = v.rig, faceH = r.face.y1 - r.face.y0;
      var sCouvre = Math.max(W / r.w, H / r.h);
      var sVisage = (0.44 * H) / Math.max(1, faceH);
      var s = Math.max(sCouvre, sVisage * zoom);
      var ox = W / 2 - r.centre[0] * s + decalage.x * W, oy = H * 0.40 - r.centre[1] * s + decalage.y * H;
      ox = Math.min(0, Math.max(W - r.w * s, ox)); oy = Math.min(0, Math.max(H - r.h * s, oy));
      cadre = { s: s, ox: ox, oy: oy };
    }
    function reglerLunettes(oui) { vues.forEach(function (v) { v.rig.gainSourcils = oui ? 0.28 : 1; }); }
    function lunettes() { return vues.map(function (v) { return { score: +(v.lunettesScore || 0).toFixed(2), gain: v.rig.gainSourcils }; }); }
    function reglerZoom(z) { zoom = Math.max(0.6, Math.min(2.2, z)); cadrer(); }
    function reglerDecalage(x, y) { decalage.x = Math.max(-0.3, Math.min(0.3, x)); decalage.y = Math.max(-0.3, Math.min(0.3, y)); cadrer(); }
    function redimensionner(w, h) {
      W = sortie.width = w; H = sortie.height = h;
      if (glCanvas) { glCanvas.width = w; glCanvas.height = h; }
      cadrer();
    }

    function versSortie(D, n) { for (var i = 0; i < n; i++) { posOut[i * 2] = cadre.ox + D[i * 2] * cadre.s; posOut[i * 2 + 1] = cadre.oy + D[i * 2 + 1] * cadre.s; } }

    function maillageGL(v, n) {
      gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog); gl.uniform2f(locR, W, H);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.bufferData(gl.ARRAY_BUFFER, posOut.subarray(0, n * 2), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(locP); gl.vertexAttribPointer(locP, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufUv); gl.bufferData(gl.ARRAY_BUFFER, v.uv, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(locU); gl.vertexAttribPointer(locU, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, v.idx, gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, v.tex);
      gl.drawElements(gl.TRIANGLES, v.nTri * 3, gl.UNSIGNED_SHORT, 0);
      ctx.drawImage(glCanvas, 0, 0, W, H);
    }
    /* Repli sans WebGL : chaque triangle est recopié avec la transformation qui l'envoie de la photo vers l'écran. */
    function maillage2D(v) {
      var r = v.rig, T = r.tri, P = r.pts, k;
      for (k = 0; k < T.length; k++) {
        var a = T[k][0], b = T[k][1], c = T[k][2];
        var x0 = P[a][0], y0 = P[a][1], x1 = P[b][0], y1 = P[b][1], x2 = P[c][0], y2 = P[c][1];
        var X0 = posOut[a * 2], Y0 = posOut[a * 2 + 1], X1 = posOut[b * 2], Y1 = posOut[b * 2 + 1], X2 = posOut[c * 2], Y2 = posOut[c * 2 + 1];
        var den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1); if (Math.abs(den) < 1e-6) continue;
        var m11 = (X0 * (y1 - y2) + X1 * (y2 - y0) + X2 * (y0 - y1)) / den, m21 = (X0 * (x2 - x1) + X1 * (x0 - x2) + X2 * (x1 - x0)) / den;
        var m12 = (Y0 * (y1 - y2) + Y1 * (y2 - y0) + Y2 * (y0 - y1)) / den, m22 = (Y0 * (x2 - x1) + Y1 * (x0 - x2) + Y2 * (x1 - x0)) / den;
        var dx = (X0 * (x1 * y2 - x2 * y1) + X1 * (x2 * y0 - x0 * y2) + X2 * (x0 * y1 - x1 * y0)) / den, dy = (Y0 * (x1 * y2 - x2 * y1) + Y1 * (x2 * y0 - x0 * y2) + Y2 * (x0 * y1 - x1 * y0)) / den;
        var cx = (X0 + X1 + X2) / 3, cy = (Y0 + Y1 + Y2) / 3, e = 0.6;
        var gx = function (X, Y) { var l = Math.hypot(X - cx, Y - cy) || 1; return [X + (X - cx) / l * e, Y + (Y - cy) / l * e]; };
        var q0 = gx(X0, Y0), q1 = gx(X1, Y1), q2 = gx(X2, Y2);
        ctx.save(); ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.closePath(); ctx.clip();
        ctx.setTransform(m11, m12, m21, m22, dx, dy); ctx.drawImage(v.img, 0, 0); ctx.restore();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function trace(poly) { ctx.beginPath(); poly.forEach(function (p, i) { var x = cadre.ox + p[0] * cadre.s, y = cadre.oy + p[1] * cadre.s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); }
    function cavite(v, D, P) {
      var geo = C.geometrieBouche(v.rig, D, P);
      if (geo.ouverture < 0.6) return;
      var poly = geo.haut.concat(geo.bas.slice().reverse());
      ctx.save(); trace(poly); ctx.clip();
      var mx = (geo.haut[5][0] + geo.bas[5][0]) / 2, my = (geo.haut[5][1] + geo.bas[5][1]) / 2;
      var cx = cadre.ox + mx * cadre.s, cy = cadre.oy + my * cadre.s, rr = Math.max(4, geo.largeur * cadre.s * 0.55);
      var gr = ctx.createRadialGradient(cx, cy, rr * 0.05, cx, cy, rr);
      gr.addColorStop(0, '#12050a'); gr.addColorStop(0.6, '#2c0d12'); gr.addColorStop(1, '#4a1a1f');
      ctx.fillStyle = gr; ctx.fillRect(cx - rr * 2, cy - rr * 2, rr * 4, rr * 4);
      /* langue : un ovale rosé en bas de la bouche */
      var bas = geo.bas[5], tw = geo.largeur * cadre.s * 0.42, th = Math.max(2, geo.ouverture * cadre.s * 0.55);
      var tg = ctx.createLinearGradient(0, cy, 0, cy + th); tg.addColorStop(0, '#b24e58'); tg.addColorStop(1, '#8c3843');
      ctx.fillStyle = tg; ctx.beginPath(); ctx.ellipse(cx, cadre.oy + bas[1] * cadre.s - th * 0.35, tw, th, 0, 0, Math.PI * 2); ctx.fill();
      /* dents du haut : une bande claire qui suit la lèvre du haut */
      var hDent = Math.min(geo.ouverture * 0.5, v.rig.mw * 0.16) * cadre.s;
      var teinte = v.peau || [214, 172, 150];
      /* dents ivoire (un soupçon de la teinte de la peau), un peu plus sombres en bas et sur les côtés : jamais un aplat blanc */
      var iv = function (k) { return 'rgb(' + [236, 227, 210].map(function (c, i) { return Math.round(c * (1 - k) + (c * 0.6 + teinte[i] * 0.4) * k); }).join(',') + ')'; };
      var dh = geo.haut.slice(1, -1);                       /* les dents ne vont pas jusqu'aux coins de la bouche */
      ctx.beginPath(); dh.forEach(function (p, i) { var x = cadre.ox + p[0] * cadre.s, y = cadre.oy + p[1] * cadre.s - 1; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      for (var i = dh.length - 1; i >= 0; i--) { var p = dh[i], t = i / (dh.length - 1), wob = Math.pow(Math.sin(Math.PI * t), 0.5); ctx.lineTo(cadre.ox + p[0] * cadre.s, cadre.oy + p[1] * cadre.s + hDent * (0.3 + 0.7 * wob)); }
      ctx.closePath(); var y0 = cadre.oy + geo.haut[5][1] * cadre.s;
      var tgd = ctx.createLinearGradient(0, y0, 0, y0 + hDent); tgd.addColorStop(0, iv(0.35)); tgd.addColorStop(0.35, iv(0)); tgd.addColorStop(1, iv(0.45));
      ctx.fillStyle = tgd; ctx.fill();
      /* trait fin entre les dents du haut (rendu photo) : quelques traces douces */
      /* dents du bas, seulement quand la bouche est grande ouverte */
      if (geo.ouverture > v.rig.mw * 0.34) {
        var hb = Math.min(geo.ouverture * 0.22, v.rig.mw * 0.07) * cadre.s;
        ctx.beginPath(); geo.bas.forEach(function (p, i) { var x = cadre.ox + p[0] * cadre.s, y = cadre.oy + p[1] * cadre.s + 1; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        for (var j = geo.bas.length - 1; j >= 0; j--) { var q = geo.bas[j]; ctx.lineTo(cadre.ox + q[0] * cadre.s, cadre.oy + q[1] * cadre.s - hb * Math.pow(Math.sin(Math.PI * j / (geo.bas.length - 1)), 0.6)); }
        ctx.closePath(); ctx.fillStyle = iv(0.5); ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      }
      /* ombre de la lèvre du haut sur la cavité et les dents */
      var og = ctx.createLinearGradient(0, y0, 0, y0 + Math.max(3, geo.ouverture * cadre.s * 0.28)); og.addColorStop(0, 'rgba(20,6,8,0.34)'); og.addColorStop(1, 'rgba(20,6,8,0)');
      ctx.fillStyle = og; ctx.fillRect(cx - rr * 1.5, y0 - 1, rr * 3, Math.max(3, geo.ouverture * cadre.s * 0.28) + 1);
      /* ombre portée de la lèvre du haut sur la cavité */
      ctx.restore();
    }
    function paupieres(v, D, P) {
      [['L', P.blinkL], ['R', P.blinkR]].forEach(function (e) {
        var b = e[1]; if (b < 0.3) return;
        var pg = C.geometriePaupiere(v.rig, D, e[0]);
        var a = Math.min(1, Math.max(0, (b - 0.3) / 0.55));
        var sk = v.peau || [214, 172, 150], poly = pg.haut.concat(pg.bas.slice().reverse());
        /* on élargit un peu le polygone pour couvrir tout le blanc de l'œil */
        var cx = 0, cy = 0; poly.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= poly.length; cy /= poly.length;
        var gro = poly.map(function (p) { return [cx + (p[0] - cx) * 1.10, cy + (p[1] - cy) * 1.5 + (p[1] > cy ? 0 : -0.5)]; });
        ctx.save(); trace(gro); ctx.globalAlpha = a * 0.96;
        ctx.fillStyle = 'rgb(' + sk[0] + ',' + sk[1] + ',' + sk[2] + ')'; ctx.fill(); ctx.restore();
        /* le trait des cils, le long de la paupière du bas rejointe par celle du haut */
        ctx.save(); ctx.globalAlpha = a * 0.75; ctx.strokeStyle = 'rgb(' + Math.round(sk[0] * 0.28) + ',' + Math.round(sk[1] * 0.2) + ',' + Math.round(sk[2] * 0.18) + ')';
        ctx.lineWidth = Math.max(1, v.rig.io * cadre.s * 0.022); ctx.lineCap = 'round'; ctx.beginPath();
        pg.haut.forEach(function (p, i) { var x = cadre.ox + p[0] * cadre.s, y = cadre.oy + (p[1] + v.rig.io * 0.008) * cadre.s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke(); ctx.restore();
      });
    }

    function dessinerVue(v, P, alpha) {
      var n = v.rig.n;
      var D = C.deformer(v.rig, P, tampon);
      /* regard : l'iris glisse un peu dans l'œil (la peau autour ne bouge pas) — fait dans deformer via P.gaze si le rig a l'iris */
      versSortie(D, n);
      ctx.save(); ctx.globalAlpha = alpha;
      /* 1. la photo intacte dessous (aucune fissure possible) */
      ctx.save(); ctx.setTransform(cadre.s, 0, 0, cadre.s, cadre.ox, cadre.oy); ctx.drawImage(v.img, 0, 0); ctx.restore();
      /* 2. l'intérieur de la bouche */
      cavite(v, D, P);
      /* 3. le maillage déformé */
      if (mode === 'webgl' && gl && !perdu) maillageGL(v, n); else maillage2D(v);
      /* 4. les paupières fermées par-dessus */
      paupieres(v, D, P);
      ctx.restore();
    }

    function dessiner(P) {
      if (!vues.length) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      /* fond : la photo agrandie, au cas où le cadrage laisserait un bord */
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
      var m = C.melangerVues(vues.map(function (v) { return v.yaw; }), P.yaw);
      /* l'angle de la tête choisit les deux vues voisines ; ce qui reste de l'angle (hors des vues) est rendu par la déformation 3D du maillage */
      if (!m || vues.length === 1) { dessinerVue(vues[0], P, 1); return; }
      var va = vues[m.a], vb = vues[m.b];
      var resteA = Object.assign({}, P, { yaw: P.yaw - va.yaw }), resteB = Object.assign({}, P, { yaw: P.yaw - vb.yaw });
      dessinerVue(va, resteA, 1);
      if (m.b !== m.a && m.t > 0.01) dessinerVue(vb, resteB, m.t);
    }

    function detruire() { try { if (gl) { vues.forEach(function (v) { if (v.tex) gl.deleteTexture(v.tex); }); } } catch (e) { /* déjà perdu */ } vues = []; }
    return { reglerLunettes: reglerLunettes, lunettes: lunettes, charger: charger, dessiner: dessiner, redimensionner: redimensionner, reglerZoom: reglerZoom, reglerDecalage: reglerDecalage, detruire: detruire,
      mode: function () { return perdu ? '2d' : mode; }, cadre: function () { return cadre; }, taille: function () { return { w: W, h: H }; }, nbVues: function () { return vues.length; } };
  }

  racine.AvatarRendu = { creer: creer, peau: peau, detecterLunettes: detecterLunettes };
})(typeof self !== 'undefined' ? self : this);
