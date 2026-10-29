/* ============================================================================
 * AVATAR-PERSOS — des personnages dessinés (panda, lion, âne, abeille, chat, renard, ours, lapin) pilotés par les MÊMES réglages que le visage-photo.
 * Un seul cerveau (bouche, paupières, sourcils, regard, tête — voir avatar-core.js), plusieurs corps : on peut donc donner à un animal
 * la voix de quelqu'un, ou lui faire copier les grimaces de la caméra, exactement comme pour une photo.
 * Dessin 100 % vectoriel (Canvas 2D) : net à toutes les tailles, aucune image à télécharger, marche hors-ligne.
 * Dépend de rien (AvatarCore sert seulement aux tests). Fonction principale : AvatarPersos.dessiner(ctx, perso, P, W, H, options)
 * ========================================================================== */
(function (racine) {
  'use strict';
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ---------- couleurs : teintes (le même personnage en version givrée, dorée, rose, nuit…) ---------- */
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    var f = function (p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    if (!s) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [Math.round(f(p, q, h + 1 / 3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1 / 3) * 255)];
  }
  var TEINTES = {
    normal: { id: 'normal', nom: 'Naturel', emoji: '🎨', h: 0, s: 1, l: 1 },
    givre: { id: 'givre', nom: 'Givré', emoji: '❄️', h: 0.52, s: 0.8, l: 1.04, seulementChauds: true },
    dore: { id: 'dore', nom: 'Doré', emoji: '✨', h: 0.03, s: 1.25, l: 1.06 },
    rose: { id: 'rose', nom: 'Bonbon', emoji: '🍬', h: 0.87, s: 1.1, l: 1.08, seulementChauds: true },
    nuit: { id: 'nuit', nom: 'Nuit', emoji: '🌙', h: 0.66, s: 0.7, l: 0.72, seulementChauds: true }
  };
  function teinter(couleur, t) {
    if (!t || t.id === 'normal' || typeof couleur !== 'string' || couleur[0] !== '#' || couleur.length !== 7) return couleur;
    var rgb = hex2rgb(couleur), hsl = rgb2hsl(rgb[0], rgb[1], rgb[2]);
    if (hsl[1] < 0.12 && !t.forceGris) { /* gris / blanc / noir : on change seulement la clarté (le blanc d'un panda reste blanc) */
      return t.id === 'nuit' ? rgbStr(hsl2rgb(0.62, 0.25, hsl[2] * 0.7)) : t.id === 'givre' ? rgbStr(hsl2rgb(0.55, 0.12 + (hsl[2] > 0.9 ? 0.1 : 0), Math.min(0.98, hsl[2] * 1.02))) : couleur;
    }
    var h = t.seulementChauds ? t.h : (hsl[0] + t.h) % 1;
    return rgbStr(hsl2rgb(h, clamp(hsl[1] * t.s, 0, 1), clamp(hsl[2] * t.l, 0, 0.97)));
  }
  function rgbStr(a) { return '#' + a.map(function (v) { return ('0' + clamp(v, 0, 255).toString(16)).slice(-2); }).join(''); }
  function ombre(couleur, k) { /* plus sombre (k<1) ou plus clair (k>1) */
    var rgb = hex2rgb(couleur), hsl = rgb2hsl(rgb[0], rgb[1], rgb[2]); return rgbStr(hsl2rgb(hsl[0], hsl[1], clamp(hsl[2] * k, 0, 0.98)));
  }

  /* ---------- les personnages : tout est en « unités de tête » (1 = le rayon de la tête) ---------- */
  var PERSOS = {
    panda: { id: 'panda', nom: 'Panda', emoji: '🐼', voix: 'panda', tete: { rx: 1.04, ry: 0.93, c: '#fbfbfb', c2: '#e9e9ee' }, contour: '#2a2a30',
      oreilles: { type: 'ronde', x: 0.74, y: -0.76, r: 0.36, c: '#26262c', in: null }, taches: { x: 0.42, y: -0.06, rx: 0.25, ry: 0.33, rot: 0.5, c: '#26262c' },
      oeil: { x: 0.42, y: -0.06, r: 0.135, c: '#15151a', style: 'point' }, museau: { y: 0.44, rx: 0.33, ry: 0.23, c: '#f3f3f6' }, nez: { y: 0.27, w: 0.17, c: '#1c1c22', type: 'ovale' },
      bouche: { y: 0.55, w: 0.26, c: '#3a1217', langue: '#e4808b' }, joues: '#ffb8c0', sourcils: true, sourcilsC: '#ffffff' },
    lion: { id: 'lion', nom: 'Lion', emoji: '🦁', voix: 'lion', crin: { c: '#a8581e', c2: '#d98a35', lobes: 16, r: 1.5 }, tete: { rx: 0.98, ry: 0.92, c: '#f6bf63', c2: '#e39a3b' }, contour: '#7a4318',
      oreilles: { type: 'ronde', x: 0.7, y: -0.8, r: 0.25, c: '#eaa84a', in: '#f5b8a0' }, oeil: { x: 0.38, y: -0.1, r: 0.12, c: '#2a1608', style: 'point', iris: '#c8741c' },
      museau: { y: 0.4, rx: 0.5, ry: 0.36, c: '#fff0cf' }, nez: { y: 0.18, w: 0.2, c: '#5a2a1a', type: 'triangle' }, bouche: { y: 0.46, w: 0.3, c: '#40150f', langue: '#d9707a' }, joues: null, moustaches: true, sourcils: true, sourcilsC: '#a8581e' },
    ane: { id: 'ane', nom: 'Âne', emoji: '🫏', voix: 'ane', tete: { rx: 0.86, ry: 1.0, c: '#9d9ea8', c2: '#81828e' }, contour: '#4f505a',
      oreilles: { type: 'longue', x: 0.56, y: -1.0, rx: 0.22, ry: 0.78, rot: 0.32, c: '#8c8d98', in: '#f3b9c4' }, toupet: { c: '#4a4a55' },
      oeil: { x: 0.4, y: -0.22, r: 0.14, c: '#25190f', style: 'point', iris: '#6a4320' }, museau: { y: 0.52, rx: 0.56, ry: 0.4, c: '#f2eadb' }, nez: { y: 0.42, w: 0.1, c: '#3a3a42', type: 'narines' },
      bouche: { y: 0.7, w: 0.3, c: '#3a1217', langue: '#e4808b' }, joues: null, sourcils: true, sourcilsC: '#4a4a55' },
    abeille: { id: 'abeille', nom: 'Abeille', emoji: '🐝', voix: 'abeille', ailes: { c: 'rgba(210,240,255,0.78)' }, antennes: { c: '#2b2018' },
      tete: { rx: 1.0, ry: 0.94, c: '#ffd84a', c2: '#f3a91a' }, contour: '#6a4a0c', rayures: '#2b2018',
      oeil: { x: 0.4, y: -0.06, r: 0.21, c: '#1a1410', style: 'brillant' }, museau: null, nez: { y: 0.2, w: 0.07, c: '#7a4a10', type: 'ovale' },
      bouche: { y: 0.4, w: 0.26, c: '#4a1410', langue: '#e4808b' }, joues: '#ff9aa6', sourcils: true, sourcilsC: '#3a2a10' },
    chat: { id: 'chat', nom: 'Chat', emoji: '🐱', voix: 'chat', tete: { rx: 1.0, ry: 0.86, c: '#f6a85a', c2: '#e88d36' }, contour: '#8a4a16',
      oreilles: { type: 'pointue', x: 0.68, y: -0.78, w: 0.36, h: 0.62, c: '#ef9a47', in: '#f6b6b6' }, rayures: '#c46a1c',
      oeil: { x: 0.4, y: -0.08, r: 0.17, c: '#1c1c14', style: 'chat', iris: '#7ecb5a' }, museau: { y: 0.34, rx: 0.3, ry: 0.2, c: '#fff1dc' }, nez: { y: 0.2, w: 0.1, c: '#f08a9a', type: 'triangle' },
      bouche: { y: 0.4, w: 0.2, c: '#4a1418', langue: '#e4808b', chat: true }, joues: null, moustaches: true, sourcils: true, sourcilsC: '#a85a1c' },
    renard: { id: 'renard', nom: 'Renard', emoji: '🦊', voix: 'renard', tete: { rx: 1.02, ry: 0.86, c: '#f2792f', c2: '#d85f18' }, contour: '#7a3410',
      oreilles: { type: 'pointue', x: 0.7, y: -0.8, w: 0.38, h: 0.7, c: '#e86a22', in: '#2a1812', pointe: '#2a1812' }, joues: null, bas: { c: '#fff6ea' },
      oeil: { x: 0.4, y: -0.1, r: 0.12, c: '#1c1410', style: 'point', iris: '#a05a10' }, museau: { y: 0.4, rx: 0.34, ry: 0.26, c: '#fff6ea' }, nez: { y: 0.22, w: 0.12, c: '#1c1410', type: 'ovale' },
      bouche: { y: 0.5, w: 0.24, c: '#3a1217', langue: '#e4808b' }, moustaches: true, sourcils: true, sourcilsC: '#a84a14' },
    ours: { id: 'ours', nom: 'Ours', emoji: '🐻', voix: 'ours', tete: { rx: 1.02, ry: 0.94, c: '#a8693a', c2: '#8a4f26' }, contour: '#4a2a12',
      oreilles: { type: 'ronde', x: 0.72, y: -0.78, r: 0.3, c: '#9a5d30', in: '#d89a6a' }, oeil: { x: 0.4, y: -0.08, r: 0.12, c: '#1c1008', style: 'point' },
      museau: { y: 0.4, rx: 0.4, ry: 0.3, c: '#e3b98a' }, nez: { y: 0.24, w: 0.16, c: '#2a1810', type: 'ovale' }, bouche: { y: 0.5, w: 0.26, c: '#3a1217', langue: '#e4808b' }, joues: '#e08a7a', sourcils: true, sourcilsC: '#4a2a12' },
    lapin: { id: 'lapin', nom: 'Lapin', emoji: '🐰', voix: 'lapin', tete: { rx: 0.94, ry: 0.88, c: '#fdfaf8', c2: '#ece4e6' }, contour: '#8a7480',
      oreilles: { type: 'longue', x: 0.36, y: -1.25, rx: 0.2, ry: 0.92, rot: 0.1, c: '#fdfaf8', in: '#f8b8c8' }, oeil: { x: 0.38, y: -0.06, r: 0.14, c: '#2a1a24', style: 'point', iris: '#8a3a56' },
      museau: { y: 0.4, rx: 0.3, ry: 0.22, c: '#fff' }, nez: { y: 0.26, w: 0.09, c: '#f08aa4', type: 'triangle' }, bouche: { y: 0.42, w: 0.18, c: '#4a1418', langue: '#e4808b', dents: true }, joues: '#ffc0cc', moustaches: true, sourcils: true, sourcilsC: '#a89aa6' }
  };
  var ORDRE = ['panda', 'lion', 'ane', 'abeille', 'chat', 'renard', 'ours', 'lapin'];

  var ACCESSOIRES = {
    aucun: { id: 'aucun', nom: 'Aucun', emoji: '🚫' }, lunettes: { id: 'lunettes', nom: 'Lunettes', emoji: '👓' }, soleil: { id: 'soleil', nom: 'Soleil', emoji: '😎' },
    casquette: { id: 'casquette', nom: 'Casquette', emoji: '🧢' }, couronne: { id: 'couronne', nom: 'Couronne', emoji: '👑' }, fete: { id: 'fete', nom: 'Fête', emoji: '🎉' }, papillon: { id: 'papillon', nom: 'Nœud', emoji: '🎀' }
  };

  /* ---------- petits outils de tracé ---------- */
  function ell(ctx, x, y, rx, ry, rot, fill, stroke, lw) {
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), rot || 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.lineWidth = lw || 0.03; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function degrade(ctx, x, y, r, c1, c2) { var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; }

  function oeil(ctx, x, y, o, B, gx, gy, T, tint, cote) {
    var r = o.r, fermeture = clamp(B, 0, 1);
    if (fermeture > 0.55) {                             /* œil fermé : un petit trait courbe (comme un dessin animé) */
      ctx.save(); ctx.strokeStyle = tint(o.c); ctx.lineWidth = r * 0.34; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y - r * 0.2, r * 0.85, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); ctx.restore(); return;
    }
    var sy = 1 - fermeture * 1.1;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, Math.max(0.12, sy));
    if (o.style === 'chat') {
      ell(ctx, 0, 0, r * 1.05, r * 1.1, 0, '#fffdf2', ombre(tint('#1c1c14'), 1.4), r * 0.1);
      ell(ctx, gx * r * 0.28, gy * r * 0.2, r * 0.82, r * 0.98, 0, tint(o.iris), null);
      ell(ctx, gx * r * 0.28, gy * r * 0.2, r * 0.2, r * 0.82, 0, '#14140e', null);
    } else if (o.style === 'brillant') {
      ell(ctx, 0, 0, r, r * 1.08, 0, tint(o.c), null);
    } else {
      ell(ctx, 0, 0, r, r * 1.08, 0, tint(o.c), null);
      if (o.iris) ell(ctx, gx * r * 0.2, gy * r * 0.15, r * 0.72, r * 0.8, 0, tint(o.iris), null);
      ell(ctx, gx * r * 0.2, gy * r * 0.15, r * 0.46, r * 0.55, 0, '#0c0806', null);
    }
    /* reflets : ce qui rend l'œil vivant */
    ell(ctx, -r * 0.28 + gx * r * 0.15, -r * 0.34 + gy * r * 0.1, r * 0.3, r * 0.3, 0, 'rgba(255,255,255,0.95)', null);
    ell(ctx, r * 0.3 + gx * r * 0.1, r * 0.3, r * 0.14, r * 0.14, 0, 'rgba(255,255,255,0.7)', null);
    ctx.restore(); void T; void cote;
  }

  function bouche(ctx, x, y, o, P, tint, esp) {
    var w = o.w * (1 + 0.45 * P.wide + 0.3 * P.smile + (P.wide < 0 ? -0.15 : 0)), ouv = P.jaw * o.w * 1.35 + (P.wide < 0 ? -P.wide * 0.05 : 0);
    var sourire = P.smile * 0.2 - P.frown * 0.13;
    ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (ouv < 0.02) {                                         /* fermée : une ligne souriante (ou un « w » de chat) */
      ctx.strokeStyle = tint(o.c); ctx.lineWidth = 0.045; ctx.beginPath();
      if (o.chat) { ctx.moveTo(-w, -sourire * 0.7); ctx.quadraticCurveTo(-w * 0.5, 0.1 + sourire * 0.4, 0, 0); ctx.quadraticCurveTo(w * 0.5, 0.1 + sourire * 0.4, w, -sourire * 0.7); }
      else { ctx.moveTo(-w, -sourire * 0.9); ctx.quadraticCurveTo(0, 0.1 + sourire * 1.4, w, -sourire * 0.9); }
      ctx.stroke();
      if (o.dents) { ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.rect(-0.07, 0.04, 0.14, 0.17); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 0.04); ctx.lineTo(0, 0.21); ctx.stroke(); }
    } else {                                                  /* ouverte : une forme sombre, la langue, les dents */
      ctx.beginPath();
      ctx.moveTo(-w, -sourire * 0.9);
      ctx.quadraticCurveTo(0, -ouv * 0.1 + 0.02 + sourire * 0.4, w, -sourire * 0.9);
      ctx.bezierCurveTo(w * 0.95, ouv * 0.75, w * 0.3, ouv * 1.05, 0, ouv * 1.05);
      ctx.bezierCurveTo(-w * 0.3, ouv * 1.05, -w * 0.95, ouv * 0.75, -w, -sourire * 0.9); ctx.closePath();
      ctx.fillStyle = tint(o.c); ctx.fill();
      ctx.save(); ctx.clip();
      ell(ctx, 0, ouv * 0.95, w * 0.62, ouv * 0.5, 0, tint(o.langue), null);
      if (o.dents) { ctx.fillStyle = '#fff'; ctx.fillRect(-0.09, -0.02, 0.18, Math.min(0.2, ouv * 0.9)); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-0.005, -0.02, 0.01, 0.2); }
      ctx.restore();
      ctx.strokeStyle = tint(ombre(o.c, 0.7)); ctx.lineWidth = 0.035; ctx.stroke();
    }
    ctx.restore(); void esp;
  }

  function sourcil(ctx, x, y, couleur, b, inner, cote, w) {
    ctx.save(); ctx.translate(x, y - b * 0.1); ctx.rotate(cote * (-inner) * 0.35); ctx.strokeStyle = couleur; ctx.lineWidth = 0.055; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-w, 0.02); ctx.quadraticCurveTo(0, -0.07, w, 0.02); ctx.stroke(); ctx.restore();
  }

  function oreille(ctx, oo, cote, par, tint, contour) {
    var x = cote * oo.x + par.x * 0.3, y = oo.y + par.y * 0.3;
    ctx.save(); ctx.translate(x, y);
    if (oo.type === 'ronde') {
      ell(ctx, 0, 0, oo.r, oo.r, 0, tint(oo.c), contour, 0.035);
      if (oo.in) ell(ctx, 0, oo.r * 0.1, oo.r * 0.58, oo.r * 0.58, 0, tint(oo.in), null);
    } else if (oo.type === 'longue') {
      ctx.rotate(cote * oo.rot); ell(ctx, 0, 0, oo.rx, oo.ry, 0, tint(oo.c), contour, 0.035); ell(ctx, 0, oo.ry * 0.08, oo.rx * 0.55, oo.ry * 0.78, 0, tint(oo.in), null);
    } else {                                                                    /* pointue */
      ctx.rotate(cote * 0.25); ctx.beginPath(); ctx.moveTo(-oo.w, oo.h * 0.45); ctx.quadraticCurveTo(-oo.w * 0.7, -oo.h * 0.2, 0, -oo.h * 0.62); ctx.quadraticCurveTo(oo.w * 0.7, -oo.h * 0.2, oo.w, oo.h * 0.45); ctx.closePath();
      ctx.fillStyle = tint(oo.c); ctx.fill(); ctx.strokeStyle = contour; ctx.lineWidth = 0.035; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-oo.w * 0.55, oo.h * 0.38); ctx.quadraticCurveTo(-oo.w * 0.4, -oo.h * 0.12, 0, -oo.h * 0.38); ctx.quadraticCurveTo(oo.w * 0.4, -oo.h * 0.12, oo.w * 0.55, oo.h * 0.38); ctx.closePath();
      ctx.fillStyle = tint(oo.in); ctx.fill();
      if (oo.pointe) { ctx.save(); ctx.clip(); ctx.beginPath(); ctx.rect(-oo.w, -oo.h, oo.w * 2, oo.h * 0.55); ctx.fillStyle = tint(oo.pointe); ctx.fill(); ctx.restore(); }
    }
    ctx.restore();
  }

  function accessoire(ctx, id, esp, par, P) {
    if (!id || id === 'aucun') return;
    var ox = par.x, oy = par.y, e = esp.oeil || { x: 0.4, y: -0.08 }, ey = e.y + oy;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (id === 'lunettes' || id === 'soleil') {
      var rr = (e.r || 0.15) * 1.85;
      ctx.lineWidth = 0.06; ctx.strokeStyle = '#1a1a22';
      [-1, 1].forEach(function (c) {
        ctx.beginPath(); ctx.arc(c * e.x + ox, ey, rr, 0, Math.PI * 2);
        if (id === 'soleil') { ctx.fillStyle = 'rgba(15,15,25,0.92)'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(c * e.x + ox - rr * 0.3, ey - rr * 0.35, rr * 0.28, rr * 0.14, -0.6, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = 'rgba(200,230,255,0.14)'; ctx.fill(); }
        ctx.beginPath(); ctx.arc(c * e.x + ox, ey, rr, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.beginPath(); ctx.moveTo(-e.x + ox + rr, ey - 0.01); ctx.quadraticCurveTo(ox, ey - 0.12, e.x + ox - rr, ey - 0.01); ctx.stroke();
    } else if (id === 'casquette') {
      var ty = -(esp.tete.ry) * 0.72 + oy * 0.5;
      ctx.fillStyle = '#d6342b'; ctx.beginPath(); ctx.ellipse(ox * 0.5, ty, esp.tete.rx * 0.88, esp.tete.ry * 0.55, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#7a1612'; ctx.lineWidth = 0.04; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(ox * 0.5 + 0.35, ty + 0.02, esp.tete.rx * 0.78, 0.1, 0.06, 0, Math.PI); ctx.fillStyle = '#a82019'; ctx.fill(); ctx.stroke();
      ell(ctx, ox * 0.5, ty - esp.tete.ry * 0.5, 0.07, 0.07, 0, '#fff', null);
    } else if (id === 'couronne') {
      var cy2 = -(esp.tete.ry) * 0.95 + oy * 0.4, w2 = 0.5;
      ctx.beginPath(); ctx.moveTo(-w2 + ox * 0.4, cy2 + 0.22); ctx.lineTo(-w2 + ox * 0.4, cy2 - 0.12); ctx.lineTo(-w2 * 0.5 + ox * 0.4, cy2 + 0.04); ctx.lineTo(ox * 0.4, cy2 - 0.2); ctx.lineTo(w2 * 0.5 + ox * 0.4, cy2 + 0.04); ctx.lineTo(w2 + ox * 0.4, cy2 - 0.12); ctx.lineTo(w2 + ox * 0.4, cy2 + 0.22); ctx.closePath();
      var gr = ctx.createLinearGradient(0, cy2 - 0.2, 0, cy2 + 0.22); gr.addColorStop(0, '#ffe27a'); gr.addColorStop(1, '#e0a020'); ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = '#8a5a08'; ctx.lineWidth = 0.035; ctx.stroke();
      ell(ctx, ox * 0.4, cy2 + 0.05, 0.05, 0.05, 0, '#d8333f', null);
    } else if (id === 'fete') {
      var cy3 = -(esp.tete.ry) * 0.92 + oy * 0.4;
      ctx.beginPath(); ctx.moveTo(-0.3 + ox * 0.4, cy3 + 0.15); ctx.lineTo(ox * 0.4 + 0.04, cy3 - 0.68); ctx.lineTo(0.3 + ox * 0.4, cy3 + 0.15); ctx.closePath();
      var g3 = ctx.createLinearGradient(-0.3, 0, 0.3, 0); g3.addColorStop(0, '#6a5cf0'); g3.addColorStop(1, '#f06ab8'); ctx.fillStyle = g3; ctx.fill(); ctx.strokeStyle = '#3a2a90'; ctx.lineWidth = 0.035; ctx.stroke();
      ell(ctx, ox * 0.4 + 0.04, cy3 - 0.7, 0.08, 0.08, 0, '#ffe27a', null);
      [[-0.12, -0.12], [0.1, -0.3], [0.0, 0.0]].forEach(function (d) { ell(ctx, ox * 0.4 + d[0], cy3 + d[1], 0.03, 0.03, 0, '#fff', null); });
    } else if (id === 'papillon') {
      var by = esp.tete.ry * 1.02 + oy * 0.3;
      ctx.fillStyle = '#d8333f'; ctx.strokeStyle = '#7a1018'; ctx.lineWidth = 0.035;
      [[-1], [1]].forEach(function (c) { ctx.beginPath(); ctx.moveTo(ox * 0.3, by); ctx.lineTo(ox * 0.3 + c[0] * 0.34, by - 0.17); ctx.lineTo(ox * 0.3 + c[0] * 0.34, by + 0.17); ctx.closePath(); ctx.fill(); ctx.stroke(); });
      ell(ctx, ox * 0.3, by, 0.07, 0.09, 0, '#b0202c', '#7a1018', 0.03);
    }
    ctx.restore(); void P;
  }

  /* Place le personnage pour qu'il tienne TOUJOURS dans l'image (oreilles d'âne, crinière, chapeau de fête compris). */
  function etendue(esp, accessoire) {
    var haut = esp.tete.ry, bas = esp.tete.ry * 1.2 + 0.18, demi = esp.tete.rx, oo = esp.oreilles;
    if (oo) { var top = oo.type === 'ronde' ? Math.abs(oo.y) + oo.r : oo.type === 'longue' ? Math.abs(oo.y) + oo.ry : Math.abs(oo.y) + oo.h * 0.62; haut = Math.max(haut, top); demi = Math.max(demi, oo.x + (oo.r || oo.rx || oo.w || 0.3) + 0.05); }
    if (esp.crin) { haut = Math.max(haut, esp.crin.r * 0.98); bas = Math.max(bas, esp.crin.r * 0.98); demi = Math.max(demi, esp.crin.r); }
    if (esp.antennes) haut = Math.max(haut, esp.tete.ry * 1.55);
    if (esp.ailes) demi = Math.max(demi, 1.3);
    if (accessoire === 'fete') haut = Math.max(haut, esp.tete.ry * 0.92 + 0.78);
    else if (accessoire === 'couronne') haut = Math.max(haut, esp.tete.ry * 0.95 + 0.25);
    else if (accessoire === 'casquette') demi = Math.max(demi, esp.tete.rx * 0.88 + 0.55);
    if (accessoire === 'papillon') bas = Math.max(bas, esp.tete.ry * 1.02 + 0.25);
    return { haut: haut, bas: bas, demi: demi };
  }

  /* ---------- le personnage entier ---------- */
  function dessiner(ctx, perso, P, W, H, options) {
    options = options || {};
    var esp = typeof perso === 'string' ? PERSOS[perso] : perso; if (!esp) return;
    var T = TEINTES[options.teinte || 'normal'] || TEINTES.normal, tint = function (c) { return teinter(c, T); };
    var ext = etendue(esp, options.accessoire);
    var R = 0.9 * Math.min(W / (2 * ext.demi), H / (ext.haut + ext.bas)) * (options.echelle || 1), cx = W / 2 + (options.dx || 0) * W, cy = H / 2 - (ext.bas - ext.haut) / 2 * R + (options.dy || 0) * H;
    var tp = (esp.tete.ry), k = R;
    var par = { x: P.yaw * 0.32, y: P.pitch * 0.32 };                             /* décalage des traits quand la tête tourne */
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-P.roll); ctx.scale(k * (1 - Math.abs(P.yaw) * 0.08), k * (1 - Math.abs(P.pitch) * 0.05));
    var lw = 0.04, ctr = tint(esp.contour);
    /* ombre portée douce sous le personnage */
    if (!options.sansOmbre) { ctx.save(); ctx.globalAlpha = 0.22; ell(ctx, 0.04, tp * 1.18, esp.tete.rx * 0.95, 0.12, 0, '#000', null); ctx.restore(); }
    /* — derrière la tête — */
    if (esp.ailes) { ctx.save(); [-1, 1].forEach(function (c) { ctx.save(); ctx.translate(c * 0.88 + par.x * 0.1, -0.62); ctx.rotate(c * (0.5 + 0.1 * Math.sin((options.t || 0) * 38))); ell(ctx, 0, -0.1, 0.3, 0.56, 0, esp.ailes.c, 'rgba(120,170,200,0.75)', 0.025); ctx.restore(); }); ctx.restore(); }
    if (esp.antennes) { ctx.save(); ctx.strokeStyle = esp.antennes.c; ctx.lineWidth = 0.05; ctx.lineCap = 'round'; [-1, 1].forEach(function (c) { var bx = c * 0.32 + par.x * 0.2, wob = Math.sin((options.t || 0) * 3 + c) * 0.04; ctx.beginPath(); ctx.moveTo(bx, -tp * 0.88); ctx.quadraticCurveTo(bx + c * 0.1, -tp * 1.3, bx + c * 0.3 + wob, -tp * 1.45); ctx.stroke(); ell(ctx, bx + c * 0.3 + wob, -tp * 1.45, 0.085, 0.085, 0, esp.antennes.c, null); }); ctx.restore(); }
    if (esp.crin) {
      var cr = esp.crin; ctx.beginPath();
      for (var i = 0; i <= cr.lobes * 2; i++) { var a = Math.PI * i / cr.lobes, rr = cr.r * (i % 2 ? 0.86 : 1.0) * (1 + 0.04 * Math.sin(i * 1.7)); var px = Math.cos(a) * rr * 1.0 + par.x * 0.05, py = Math.sin(a) * rr * 0.95 + 0.05; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath(); ctx.fillStyle = degrade(ctx, 0, 0, cr.r, tint(cr.c2), tint(cr.c)); ctx.fill(); ctx.strokeStyle = tint(ombre(cr.c, 0.7)); ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
    }
    if (esp.oreilles) { oreille(ctx, esp.oreilles, -1, par, tint, ctr); oreille(ctx, esp.oreilles, 1, par, tint, ctr); }
    /* — la tête — */
    ctx.save(); ctx.translate(par.x * 0.04, par.y * 0.04);
    var th = esp.tete; ell(ctx, 0, 0, th.rx, th.ry, 0, degrade(ctx, 0, 0, Math.max(th.rx, th.ry), tint(th.c), tint(th.c2)), ctr, lw);
    if (esp.bas) { ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, th.rx - 0.01, th.ry - 0.01, 0, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = tint(esp.bas.c); ctx.beginPath(); ctx.ellipse(-0.62, 0.62, 0.62, 0.5, 0.5, 0, Math.PI * 2); ctx.ellipse(0.62, 0.62, 0.62, 0.5, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    if (esp.rayures) { ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, th.rx - 0.01, th.ry - 0.01, 0, 0, Math.PI * 2); ctx.clip(); ctx.strokeStyle = tint(esp.rayures); ctx.lineWidth = 0.07; ctx.lineCap = 'round';
      if (esp.id === 'abeille') { [-0.5, -0.3].forEach(function (yy) { ctx.beginPath(); ctx.ellipse(0, yy - 0.05, th.rx * 0.9, 0.22, 0, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); }); }
      else { [[-0.18, -0.74, -0.14, -0.55], [0, -0.78, 0, -0.56], [0.18, -0.74, 0.14, -0.55]].forEach(function (s) { ctx.beginPath(); ctx.moveTo(s[0] + par.x * 0.3, s[1]); ctx.lineTo(s[2] + par.x * 0.3, s[3]); ctx.stroke(); }); } ctx.restore(); }
    ctx.restore();
    if (esp.toupet) { ctx.save(); ctx.translate(par.x * 0.2, par.y * 0.2); ctx.fillStyle = tint(esp.toupet.c); ctx.beginPath(); ctx.moveTo(-0.22, -tp * 0.96); ctx.quadraticCurveTo(0, -tp * 0.5, 0.22, -tp * 0.96); ctx.quadraticCurveTo(0, -tp * 1.12, -0.22, -tp * 0.96); ctx.fill(); ctx.restore(); }
    /* — le visage (les traits glissent avec la tête : effet de relief) — */
    ctx.save(); ctx.translate(par.x, par.y);
    var o = esp.oeil, ex = o.x;
    if (esp.taches) { var ta = esp.taches; [-1, 1].forEach(function (c) { ell(ctx, c * ta.x, ta.y, ta.rx, ta.ry, c * -ta.rot, tint(ta.c), null); }); }
    if (esp.museau) ell(ctx, 0, esp.museau.y, esp.museau.rx * (1 + 0.1 * P.smile), esp.museau.ry, 0, tint(esp.museau.c), 'rgba(0,0,0,0.12)', 0.02);
    if (esp.joues) { ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * P.smile; [-1, 1].forEach(function (c) { ell(ctx, c * (ex + 0.28), o.y + 0.38, 0.17, 0.1, 0, tint(esp.joues), null); }); ctx.restore(); }
    var blk = [P.blinkL, P.blinkR];
    [-1, 1].forEach(function (c, i) {
      var wide = 1 + P.eyeWide * 0.25, oo = Object.assign({}, o, { r: o.r * wide });
      oeil(ctx, c * ex, o.y, oo, blk[i], P.gazeX, P.gazeY, T, tint, c);
    });
    if (esp.sourcils) {
      var bl = [P.browL, P.browR];
      [-1, 1].forEach(function (c, i) { sourcil(ctx, c * ex, o.y - o.r * 2.1 - bl[i] * 0.09, tint(esp.sourcilsC || '#333'), bl[i], P.browIn, c, o.r * 1.3); });
    }
    /* nez */
    var nz = esp.nez;
    if (nz) {
      ctx.save(); ctx.translate(0, nz.y); ctx.fillStyle = tint(nz.c);
      if (nz.type === 'triangle') { ctx.beginPath(); ctx.moveTo(-nz.w, -nz.w * 0.45); ctx.quadraticCurveTo(0, -nz.w * 0.7, nz.w, -nz.w * 0.45); ctx.quadraticCurveTo(nz.w * 0.5, nz.w * 0.75, 0, nz.w * 0.9); ctx.quadraticCurveTo(-nz.w * 0.5, nz.w * 0.75, -nz.w, -nz.w * 0.45); ctx.fill(); }
      else if (nz.type === 'narines') { [-1, 1].forEach(function (c) { ell(ctx, c * 0.17, 0, 0.07, 0.1, c * 0.5, tint(nz.c), null); }); }
      else { ell(ctx, 0, 0, nz.w, nz.w * 0.72, 0, tint(nz.c), null); ell(ctx, -nz.w * 0.3, -nz.w * 0.28, nz.w * 0.28, nz.w * 0.17, -0.4, 'rgba(255,255,255,0.45)', null); }
      ctx.restore();
    }
    if (esp.bouche) bouche(ctx, 0, esp.bouche.y, esp.bouche, P, tint, esp);
    if (esp.moustaches) { ctx.save(); ctx.strokeStyle = 'rgba(40,30,30,0.6)'; ctx.lineWidth = 0.022; ctx.lineCap = 'round'; var my = (esp.museau ? esp.museau.y : 0.4) - 0.04;
      [-1, 1].forEach(function (c) { [-0.07, 0.01, 0.09].forEach(function (dy, i) { ctx.beginPath(); ctx.moveTo(c * 0.3, my + dy * 0.6); ctx.quadraticCurveTo(c * 0.62, my + dy + 0.02, c * (0.88 + 0.05 * i), my + dy * 1.7 + (i - 1) * 0.04); ctx.stroke(); }); }); ctx.restore(); }
    ctx.restore();
    /* — accessoire par-dessus — */
    accessoire(ctx, options.accessoire, esp, par, P);
    ctx.restore();
  }

  racine.AvatarPersos = { etendue: etendue, PERSOS: PERSOS, ORDRE: ORDRE, TEINTES: TEINTES, ACCESSOIRES: ACCESSOIRES, dessiner: dessiner, teinter: teinter };
})(typeof self !== 'undefined' ? self : this);
