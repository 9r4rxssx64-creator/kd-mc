/* LES VISUELS DE L'ENTRAÎNEUR — tapis, cylindre, cartes, dés, jetons, icônes.
 *
 * Tout est dessiné ici en SVG, avec createElementNS + textContent : aucune chaîne
 * HTML, aucune image externe, aucune donnée tapée par l'utilisateur. Le moteur
 * (entrainement.js) décrit ce qu'il faut montrer (exo.visuel), ce fichier le dessine.
 *
 * Chaque élément porte des attributs data-* (data-num, data-type, data-nums,
 * data-carte, data-de…) : les tests en vrai Chromium les lisent pour prouver que
 * le jeton est sur la bonne case et que la carte affichée est celle de l'énoncé.
 */
(function(){
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var ROUGES = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  var CYLINDRE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  var OR = '#D9B76A', OR_FONCE = '#A88A3E', TAPIS = '#0E5A36', TAPIS_BORD = '#0A4329', ROUGE = '#C0262D', NOIR = '#151515';

  function s(tag, a, parent){
    var e = document.createElementNS(NS, tag);
    if (a) for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) e.setAttribute(k, a[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function t(parent, x, y, texte, a){
    var e = s('text', a || {}, parent); e.setAttribute('x', x); e.setAttribute('y', y); e.textContent = String(texte); return e;
  }
  function svg(w, h, label){
    var e = s('svg', { viewBox:'0 0 ' + w + ' ' + h, role:'img', 'aria-label':label || '', preserveAspectRatio:'xMidYMid meet' });
    e.setAttribute('class', 'dessin');
    return e;
  }

  /* ── Les jetons : une couleur par valeur, la même partout ──────────────── */
  var COULEURS_JETONS = [
    [1000, '#E7C24B', '#2a1f00'], [500, '#6B3FA0', '#fff'], [100, '#1B1B1B', '#fff'], [50, '#E07A1F', '#fff'],
    [25, '#1F8A4C', '#fff'], [10, '#1F5FBF', '#fff'], [5, '#C0262D', '#fff'], [2, '#8A8F98', '#fff'], [1, '#F2F0EA', '#1a1a1a'],
  ];
  function couleurJeton(v){
    for (var i = 0; i < COULEURS_JETONS.length; i++) if (v >= COULEURS_JETONS[i][0]) return COULEURS_JETONS[i];
    return COULEURS_JETONS[COULEURS_JETONS.length - 1];
  }
  function jeton(parent, cx, cy, r, v, a){
    var c = couleurJeton(v);
    var g = s('g', a || {}, parent);
    g.setAttribute('class', 'jeton');
    g.setAttribute('data-v', String(v));
    s('circle', { cx:cx, cy:cy + r * 0.12, r:r, fill:'rgba(0,0,0,.45)' }, g);                 /* ombre */
    s('circle', { cx:cx, cy:cy, r:r, fill:c[1], stroke:'rgba(0,0,0,.35)', 'stroke-width':1 }, g);
    var circ = 2 * Math.PI * r * 0.86;
    s('circle', { cx:cx, cy:cy, r:r * 0.86, fill:'none', stroke:c[1] === '#F2F0EA' ? '#C9A227' : '#fff',
      'stroke-width':r * 0.22, 'stroke-dasharray':(circ / 16) + ' ' + (circ / 16), opacity:0.9 }, g);
    s('circle', { cx:cx, cy:cy, r:r * 0.62, fill:c[1], stroke:'rgba(255,255,255,.55)', 'stroke-width':Math.max(0.6, r * 0.05) }, g);
    var lib = String(v);
    t(g, cx, cy + r * 0.2, lib, { 'text-anchor':'middle', 'font-size':(lib.length > 3 ? r * 0.5 : lib.length > 2 ? r * 0.58 : r * 0.7),
      'font-weight':'700', fill:c[2], 'font-family':'Ubuntu Mono, monospace' });
    return g;
  }

  /* ── Le tapis de roulette (vertical : le 0 en tête, 12 lignes de 3) ───── */
  var TAP = { W:60, H:40, G:26, P:6, HB:46 };
  var INTERIEUR = { plein:1, cheval:1, transversale:1, carre:1, sixain:1 };
  function ligneDe(n){ return Math.ceil(n / 3); }
  function colDe(n){ return (n - 1) % 3; }
  function tapis(v, boite){
    var mises = v.mises || [], rows = [];
    mises.forEach(function(m){ if (INTERIEUR[m.t]) m.nums.forEach(function(n){ if (n > 0) rows.push(ligneDe(n)); }); });
    if (v.sortant) rows.push(ligneDe(v.sortant));
    if (!rows.length) rows.push(6);
    var lmin = Math.min.apply(null, rows), lmax = Math.max.apply(null, rows);
    while (lmax - lmin < 2){ if (lmax < 12) lmax++; else lmin--; }   /* au moins 3 lignes de contexte */
    var zero = lmin === 1;
    var W = TAP.W, H = TAP.H, G = TAP.G, P = TAP.P, HB = TAP.HB;
    var y0 = P + (zero ? H : 10);
    var bas = y0 + (lmax - lmin + 1) * H;
    var zones = {};
    mises.forEach(function(m){ if (m.zone) zones[m.zone.split('-')[0]] = 1; });
    var y = bas + (lmax < 12 ? 10 : 0) + 6;
    var yCol = zones.colonne ? y : null; if (zones.colonne) y += HB + 4;
    var yDz = zones.douzaine ? y : null; if (zones.douzaine) y += HB + 4;
    var ySim = zones.simple ? y : null; if (zones.simple) y += 2 * HB + 8;
    var largeur = G + 3 * W + P, hauteur = y + P;
    var e = svg(largeur, hauteur, 'Tapis de roulette');
    e.setAttribute('data-visuel', 'tapis');
    s('rect', { x:0, y:0, width:largeur, height:hauteur, rx:12, fill:TAPIS }, e);
    s('rect', { x:2, y:2, width:largeur - 4, height:hauteur - 4, rx:10, fill:'none', stroke:OR, 'stroke-opacity':0.35 }, e);

    function caseNum(n, x, yy, w, h){
      var g = s('g', {}, e);
      var r = s('rect', { x:x, y:yy, width:w, height:h, fill:TAPIS, stroke:OR, 'stroke-opacity':0.55, 'stroke-width':1 }, g);
      r.setAttribute('data-num', String(n));
      r.setAttribute('class', 'case' + (n === v.sortant ? ' sortant' : ''));
      if (n === v.sortant) r.setAttribute('data-sortant', '1');
      var cx = x + w / 2, cy = yy + h / 2;
      var fond = n === 0 ? '#178a4a' : ROUGES.indexOf(n) >= 0 ? ROUGE : NOIR;
      s('circle', { cx:cx, cy:cy, r:14, fill:fond, stroke:'rgba(255,255,255,.25)' }, g);
      t(g, cx, cy + 5, n, { 'text-anchor':'middle', 'font-size':15, 'font-weight':'700', fill:'#fff', 'font-family':'Gelasio, Georgia, serif' });
      if (n === v.sortant){
        s('rect', { x:x + 2, y:yy + 2, width:w - 4, height:h - 4, fill:'none', stroke:OR, 'stroke-width':3, rx:4 }, g);
        s('circle', { cx:x + w - 9, cy:yy + 9, r:5, fill:'#fff', stroke:OR, 'stroke-width':2, 'data-marque':'1' }, g);   /* la marque (dolly) */
      }
    }
    if (zero) caseNum(0, G, P, 3 * W, H);
    else s('line', { x1:G, y1:y0 - 5, x2:G + 3 * W, y2:y0 - 5, stroke:OR, 'stroke-opacity':0.4, 'stroke-dasharray':'3 4' }, e);
    for (var l = lmin; l <= lmax; l++) for (var c = 0; c < 3; c++) caseNum((l - 1) * 3 + c + 1, G + c * W, y0 + (l - lmin) * H, W, H);
    if (lmax < 12) s('line', { x1:G, y1:bas + 5, x2:G + 3 * W, y2:bas + 5, stroke:OR, 'stroke-opacity':0.4, 'stroke-dasharray':'3 4' }, e);

    var boites = {};
    function boiteZone(id, x, yy, w, h, lib, couleur){
      var g = s('g', {}, e);
      var r = s('rect', { x:x, y:yy, width:w, height:h, fill:TAPIS_BORD, stroke:OR, 'stroke-opacity':0.55 }, g);
      r.setAttribute('data-zone', id);
      boites[id] = { x:x, y:yy, w:w, h:h };
      if (couleur) s('path', { d:'M' + (x + 10) + ' ' + (yy + h / 2) + ' l7 -7 l7 7 l-7 7z', fill:couleur }, g);
      t(g, x + (couleur ? w / 2 + 6 : w / 2), yy + 12, lib, { 'text-anchor':'middle', 'font-size':10, fill:OR, 'font-family':'Ubuntu Mono, monospace' });
    }
    if (yCol !== null) for (c = 0; c < 3; c++) boiteZone('colonne-' + (c + 1), G + c * W, yCol, W, HB, '2 à 1');
    if (yDz !== null) ['1re 12', '2e 12', '3e 12'].forEach(function(lib, i){ boiteZone('douzaine-' + (i + 1), G + i * W, yDz, W, HB, lib); });
    if (ySim !== null){
      [['manque','Manque'],['pair','Pair'],['rouge','Rouge', ROUGE]].forEach(function(z, i){ boiteZone('simple-' + z[0], G + i * W, ySim, W, HB, z[1], z[2]); });
      [['noir','Noir', NOIR],['impair','Impair'],['passe','Passe']].forEach(function(z, i){ boiteZone('simple-' + z[0], G + i * W, ySim + HB + 4, W, HB, z[1], z[2]); });
    }

    /* Les jetons : centre des cases couvertes ; transversale et sixain sur le bord extérieur (côté 1-4-7). */
    function centre(n){
      if (n === 0) return { x:G + 1.5 * W, y:P + H / 2 };
      return { x:G + colDe(n) * W + W / 2, y:y0 + (ligneDe(n) - lmin) * H + H / 2 };
    }
    mises.forEach(function(m){
      var x, yy;
      if (m.zone){ var b = boites[m.zone]; if (!b) return; x = b.x + b.w / 2; yy = b.y + b.h - 15; }   /* sous l'étiquette de la case */
      else {
        var cs = m.nums.map(centre);
        x = cs.reduce(function(a, p){ return a + p.x; }, 0) / cs.length;
        yy = cs.reduce(function(a, p){ return a + p.y; }, 0) / cs.length;
        if (m.t === 'transversale' || m.t === 'sixain') x = G;
      }
      var g = jeton(e, x, yy, 12, m.v);
      g.setAttribute('data-type', m.t);
      g.setAttribute('data-nums', m.nums.join(','));
      if (m.zone) g.setAttribute('data-zone', m.zone);
      g.setAttribute('data-cx', String(x)); g.setAttribute('data-cy', String(yy));
    });
    boite.appendChild(e);
  }

  /* ── Le cylindre ───────────────────────────────────────────────────────── */
  function cylindre(v, boite, revele){
    var e = svg(320, 320, 'Cylindre de roulette');
    e.setAttribute('data-visuel', 'cylindre');
    var cx = 160, cy = 160, R2 = 152, R1 = 108, pas = 360 / 37;
    var secteur = v.secteur || [], masque = revele ? [] : (v.masque || []);
    s('circle', { cx:cx, cy:cy, r:158, fill:'#2a1d10', stroke:OR_FONCE, 'stroke-width':3 }, e);
    function pt(r, a){ var rad = (a - 90) * Math.PI / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; }
    CYLINDRE.forEach(function(n, i){
      var a0 = i * pas - pas / 2, a1 = a0 + pas;
      var p1 = pt(R2, a0), p2 = pt(R2, a1), p3 = pt(R1, a1), p4 = pt(R1, a0);
      var fond = n === 0 ? '#178a4a' : ROUGES.indexOf(n) >= 0 ? ROUGE : NOIR;
      var etatCase = n === v.centre ? 'centre' : masque.indexOf(n) >= 0 ? 'masque' : secteur.indexOf(n) >= 0 ? 'secteur' : '';
      var g = s('g', {}, e);
      var w = s('path', { d:'M' + p1 + ' A' + R2 + ' ' + R2 + ' 0 0 1 ' + p2 + ' L' + p3 + ' A' + R1 + ' ' + R1 + ' 0 0 0 ' + p4 + ' Z',
        fill:fond, stroke:'#C9A86A', 'stroke-width':0.8, opacity: (secteur.length && !etatCase && n !== v.sortant) ? 0.45 : 1 }, g);
      w.setAttribute('data-num', String(n));
      if (etatCase) w.setAttribute('data-etat', etatCase);
      if (n === v.sortant) w.setAttribute('data-sortant', '1');
      var tp = pt(131, i * pas);
      var lib = masque.indexOf(n) >= 0 ? '?' : String(n);
      var tx = t(g, tp[0], tp[1] + 5, lib, { 'text-anchor':'middle', 'font-size':14, 'font-weight':'700', fill:'#fff',
        'font-family':'Gelasio, Georgia, serif', transform:'rotate(' + (i * pas) + ' ' + tp[0] + ' ' + tp[1] + ')' });
      if (masque.indexOf(n) >= 0) tx.setAttribute('fill', OR);
      if (etatCase === 'centre' || etatCase === 'masque' || etatCase === 'secteur' || n === v.sortant){
        s('path', { d:'M' + p1 + ' A' + R2 + ' ' + R2 + ' 0 0 1 ' + p2 + ' L' + p3 + ' A' + R1 + ' ' + R1 + ' 0 0 0 ' + p4 + ' Z',
          fill:'none', stroke: etatCase === 'centre' || n === v.sortant ? '#fff' : OR, 'stroke-width': etatCase === 'centre' || n === v.sortant ? 3 : 2 }, g);
      }
      if (n === v.sortant){ var b = pt(97, i * pas); s('circle', { cx:b[0], cy:b[1], r:7, fill:'#f7f4ea', stroke:'#999', 'data-bille':'1' }, e); }
    });
    s('circle', { cx:cx, cy:cy, r:R1 - 2, fill:'#3a2814', stroke:OR_FONCE, 'stroke-width':2 }, e);
    s('circle', { cx:cx, cy:cy, r:70, fill:'#4a3319' }, e);
    for (var k = 0; k < 8; k++){ var q = pt(62, k * 45); s('line', { x1:cx, y1:cy, x2:q[0], y2:q[1], stroke:OR, 'stroke-width':3, 'stroke-linecap':'round' }, e); }
    s('circle', { cx:cx, cy:cy, r:14, fill:OR, stroke:'#fff3c4', 'stroke-width':2 }, e);
    boite.appendChild(e);
  }

  /* ── Les cartes à jouer ────────────────────────────────────────────────── */
  var SYMBOLES = {
    '♥': function(g, x, y, k, f){ s('path', { d:'M50 88 C20 65 5 48 5 30 C5 15 17 5 30 5 C40 5 47 11 50 18 C53 11 60 5 70 5 C83 5 95 15 95 30 C95 48 80 65 50 88Z', fill:f, transform:'translate(' + x + ' ' + y + ') scale(' + k + ')' }, g); },
    '♦': function(g, x, y, k, f){ s('path', { d:'M50 4 L90 50 L50 96 L10 50Z', fill:f, transform:'translate(' + x + ' ' + y + ') scale(' + k + ')' }, g); },
    '♠': function(g, x, y, k, f){ s('path', { d:'M50 5 C30 30 5 45 5 62 C5 75 15 83 27 83 C36 83 43 79 47 73 C46 82 42 90 35 95 L65 95 C58 90 54 82 53 73 C57 79 64 83 73 83 C85 83 95 75 95 62 C95 45 70 30 50 5Z', fill:f, transform:'translate(' + x + ' ' + y + ') scale(' + k + ')' }, g); },
    '♣': function(g, x, y, k, f){
      var h = s('g', { fill:f, transform:'translate(' + x + ' ' + y + ') scale(' + k + ')' }, g);
      s('circle', { cx:50, cy:28, r:19 }, h); s('circle', { cx:27, cy:60, r:19 }, h); s('circle', { cx:73, cy:60, r:19 }, h);
      s('path', { d:'M45 55 C45 76 41 87 33 95 L67 95 C59 87 55 76 55 55Z' }, h);
    },
  };
  /* Les points d'une carte de 2 à 10, à leur place habituelle (colonnes 27 / 36 / 45). */
  var G_ = 27, M_ = 36, D_ = 45;
  var PIPS_CARTE = {
    '2':[[M_,30],[M_,78]], '3':[[M_,30],[M_,54],[M_,78]], '4':[[G_,32],[D_,32],[G_,76],[D_,76]],
    '5':[[G_,32],[D_,32],[M_,54],[G_,76],[D_,76]], '6':[[G_,30],[D_,30],[G_,54],[D_,54],[G_,78],[D_,78]],
    '7':[[G_,30],[D_,30],[M_,42],[G_,54],[D_,54],[G_,78],[D_,78]], '8':[[G_,30],[D_,30],[M_,42],[G_,54],[D_,54],[M_,66],[G_,78],[D_,78]],
    '9':[[G_,28],[D_,28],[G_,44],[D_,44],[M_,54],[G_,64],[D_,64],[G_,80],[D_,80]],
    '10':[[G_,28],[D_,28],[M_,37],[G_,46],[D_,46],[G_,62],[D_,62],[M_,71],[G_,80],[D_,80]],
  };
  function carteSVG(parent, x, y, k){
    var rouge = k.c === '♥' || k.c === '♦', f = rouge ? ROUGE : NOIR;
    var g = s('g', {}, parent);
    g.setAttribute('class', 'carte'); g.setAttribute('data-carte', k.r + k.c);
    s('rect', { x:x + 2, y:y + 3, width:72, height:104, rx:8, fill:'rgba(0,0,0,.45)' }, g);
    s('rect', { x:x, y:y, width:72, height:104, rx:8, fill:'#FBFAF6', stroke:'#d6d2c4', 'stroke-width':1 }, g);
    t(g, x + 7, y + 20, k.r, { 'font-size':k.r === '10' ? 16 : 19, 'font-weight':'700', fill:f, 'font-family':'Gelasio, Georgia, serif', 'letter-spacing':k.r === '10' ? -1 : 0 });
    SYMBOLES[k.c](g, x + 7, y + 25, 0.15, f);
    var tete = k.r === 'V' || k.r === 'D' || k.r === 'R';
    if (tete){
      s('rect', { x:x + 18, y:y + 26, width:36, height:52, rx:4, fill:'none', stroke:f, 'stroke-width':1.2, opacity:0.6 }, g);
      t(g, x + 36, y + 62, k.r, { 'text-anchor':'middle', 'font-size':30, 'font-weight':'700', fill:f, 'font-family':'Gelasio, Georgia, serif' });
    } else if (k.r === 'A') SYMBOLES[k.c](g, x + 19, y + 35, 0.34, f);
    else (PIPS_CARTE[k.r] || []).forEach(function(p){ SYMBOLES[k.c](g, x + p[0] - 6.5, y + p[1] - 6.5, 0.13, f); });
    var bas = s('g', { transform:'rotate(180 ' + (x + 36) + ' ' + (y + 52) + ')' }, g);
    t(bas, x + 7, y + 20, k.r, { 'font-size':k.r === '10' ? 16 : 19, 'font-weight':'700', fill:f, 'font-family':'Gelasio, Georgia, serif', 'letter-spacing':k.r === '10' ? -1 : 0 });
    SYMBOLES[k.c](bas, x + 7, y + 25, 0.15, f);
    return g;
  }
  function cartes(v, boite){
    var mains = v.mains || [], larg = 0;
    mains.forEach(function(m){ larg = Math.max(larg, m.cartes.length * 78 - 6); });
    var largeur = Math.max(larg + 16, 200), y = 8, hauteur = mains.length * 136 + (v.jetons ? 78 : 0) + 8;
    var e = svg(largeur, hauteur, 'Cartes');
    e.setAttribute('data-visuel', 'cartes');
    mains.forEach(function(m){
      t(e, largeur / 2, y + 12, m.titre.toUpperCase(), { 'text-anchor':'middle', 'font-size':12, 'letter-spacing':2, fill:OR, 'font-family':'Ubuntu Mono, monospace' });
      var x0 = (largeur - (m.cartes.length * 78 - 6)) / 2;
      m.cartes.forEach(function(k, i){ carteSVG(e, x0 + i * 78, y + 22, k); });
      y += 136;
    });
    if (v.jetons) rangeeJetons(e, v.jetons, largeur, y + 4);
    boite.appendChild(e);
  }
  function rangeeJetons(e, liste, largeur, y){
    var x0 = largeur / 2 - (liste.length - 1) * 42;
    liste.forEach(function(j, i){
      var g = jeton(e, x0 + i * 84, y + 26, 24, j.v);
      g.setAttribute('data-label', j.label || '');
      if (j.label) t(e, x0 + i * 84, y + 66, j.label, { 'text-anchor':'middle', 'font-size':11, fill:OR, 'font-family':'Ubuntu Mono, monospace' });
    });
  }

  /* ── Les dés ───────────────────────────────────────────────────────────── */
  var PIPS = { 1:[[2,2]], 2:[[1,1],[3,3]], 3:[[1,1],[2,2],[3,3]], 4:[[1,1],[3,1],[1,3],[3,3]], 5:[[1,1],[3,1],[2,2],[1,3],[3,3]], 6:[[1,1],[3,1],[1,2],[3,2],[1,3],[3,3]] };
  function des(v, boite){
    var largeur = 240, hauteur = 110 + (v.jetons ? 78 : 0);
    var e = svg(largeur, hauteur, 'Dés');
    e.setAttribute('data-visuel', 'des');
    (v.des || []).forEach(function(d, i){
      var x = 46 + i * 84, y = 14;
      var g = s('g', { transform:'rotate(' + (i ? 8 : -6) + ' ' + (x + 32) + ' ' + (y + 32) + ')' }, e);
      g.setAttribute('class', 'de'); g.setAttribute('data-de', String(d));
      s('rect', { x:x + 3, y:y + 5, width:64, height:64, rx:11, fill:'rgba(0,0,0,.5)' }, g);
      s('rect', { x:x, y:y, width:64, height:64, rx:11, fill:'#B3122B', stroke:'#ff6b7f', 'stroke-opacity':0.5 }, g);
      s('rect', { x:x + 5, y:y + 4, width:54, height:20, rx:8, fill:'#fff', opacity:0.08 }, g);
      PIPS[d].forEach(function(p){ s('circle', { cx:x + p[0] * 16, cy:y + p[1] * 16, r:5.5, fill:'#fff' }, g); });
    });
    if (v.jetons) rangeeJetons(e, v.jetons, largeur, 104);
    boite.appendChild(e);
  }

  /* ── Les piles de jetons ───────────────────────────────────────────────── */
  function jetons(v, boite){
    var piles = v.piles || [], largeur = Math.max(220, piles.length * 70 + 20), hauteur = 170;
    var e = svg(largeur, hauteur, 'Jetons');
    e.setAttribute('data-visuel', 'jetons');
    var x0 = largeur / 2 - (piles.length - 1) * 35;
    piles.forEach(function(p, i){
      var x = x0 + i * 70, c = couleurJeton(p.v), vus = Math.min(p.n, 12);
      var g = s('g', {}, e); g.setAttribute('class', 'pile'); g.setAttribute('data-pile-v', String(p.v)); g.setAttribute('data-pile-n', String(p.n));
      for (var k = 0; k < vus; k++){
        var y = 120 - k * 6;
        s('ellipse', { cx:x, cy:y + 3, rx:26, ry:9, fill:'rgba(0,0,0,.35)' }, g);
        s('ellipse', { cx:x, cy:y, rx:26, ry:9, fill:c[1], stroke:'rgba(255,255,255,.6)', 'stroke-width':1.2, 'stroke-dasharray':'5 5' }, g);
      }
      var top = 120 - (vus - 1) * 6;
      t(g, x, top + 4, p.v, { 'text-anchor':'middle', 'font-size':11, 'font-weight':'700', fill:c[2], 'font-family':'Ubuntu Mono, monospace' });
      t(g, x, 156, p.label || ('×' + p.n), { 'text-anchor':'middle', 'font-size':13, fill:OR, 'font-family':'Ubuntu Mono, monospace' });
    });
    boite.appendChild(e);
  }

  /* ── Les mises posées (blackjack, punto, Blind…) ───────────────────────── */
  function mise(v, boite){
    var liste = v.jetons || [], largeur = Math.max(220, liste.length * 90 + 40), hauteur = 100 + (v.titre ? 26 : 0);
    var e = svg(largeur, hauteur, 'Mise');
    e.setAttribute('data-visuel', 'mise');
    s('ellipse', { cx:largeur / 2, cy:hauteur - 40, rx:largeur / 2 - 6, ry:44, fill:TAPIS, stroke:OR, 'stroke-opacity':0.4 }, e);
    var y = 4;
    if (v.titre){ t(e, largeur / 2, 18, v.titre.toUpperCase(), { 'text-anchor':'middle', 'font-size':13, 'letter-spacing':2, fill:OR, 'font-family':'Gelasio, Georgia, serif' }); y += 24; }
    rangeeJetons(e, liste, largeur, y);
    boite.appendChild(e);
  }

  /* ── Le tableau des points du punto banco ──────────────────────────────── */
  function points(v, boite){
    var e = svg(260, 110 + (v.jetons ? 78 : 0), 'Points du Punto et du Banco');
    e.setAttribute('data-visuel', 'points');
    [['PUNTO', v.punto, '#1F5FBF', 10], ['BANCO', v.banco, ROUGE, 136]].forEach(function(p){
      var g = s('g', {}, e);
      s('rect', { x:p[3], y:8, width:114, height:92, rx:12, fill:'#121212', stroke:p[2], 'stroke-width':2 }, g);
      t(g, p[3] + 57, 30, p[0], { 'text-anchor':'middle', 'font-size':12, 'letter-spacing':3, fill:OR, 'font-family':'Ubuntu Mono, monospace' });
      var lib = p[1] === null || p[1] === undefined ? '?' : String(p[1]);
      t(g, p[3] + 57, lib.length > 2 ? 74 : 82, lib, { 'text-anchor':'middle', 'font-size':lib.length > 2 ? 18 : 44, 'font-weight':'700', fill:'#fff', 'font-family':'Gelasio, Georgia, serif' });
    });
    if (v.jetons) rangeeJetons(e, v.jetons, 260, 106);
    boite.appendChild(e);
  }

  /* ── Une rangée de numéros (finales) ───────────────────────────────────── */
  function numeros(v, boite){
    var nums = v.nums || [], largeur = nums.length * 64 + 16;
    var e = svg(largeur, 96, 'Numéros joués');
    e.setAttribute('data-visuel', 'numeros');
    nums.forEach(function(n, i){
      var x = 8 + i * 64, g = s('g', {}, e);
      var r = s('rect', { x:x, y:8, width:58, height:58, rx:8, fill:TAPIS, stroke: n === v.sortant ? OR : 'rgba(217,183,106,.45)', 'stroke-width': n === v.sortant ? 3 : 1 }, g);
      r.setAttribute('data-num', String(n));
      s('circle', { cx:x + 29, cy:37, r:17, fill: n === 0 ? '#178a4a' : ROUGES.indexOf(n) >= 0 ? ROUGE : NOIR }, g);
      t(g, x + 29, 43, n, { 'text-anchor':'middle', 'font-size':16, 'font-weight':'700', fill:'#fff', 'font-family':'Gelasio, Georgia, serif' });
      if (v.jeton) jeton(g, x + 46, 66, 11, v.jeton);
    });
    boite.appendChild(e);
  }

  /* ── Icônes dorées (jeux, cadenas…) ────────────────────────────────────── */
  var ICONES = {
    roulette: function(g){
      s('circle', { cx:24, cy:24, r:20 }, g); s('circle', { cx:24, cy:24, r:13 }, g); s('circle', { cx:24, cy:24, r:3, fill:'currentColor' }, g);
      for (var k = 0; k < 8; k++){ var a = k * Math.PI / 4; s('line', { x1:24 + 13 * Math.cos(a), y1:24 + 13 * Math.sin(a), x2:24 + 20 * Math.cos(a), y2:24 + 20 * Math.sin(a) }, g); }
      s('circle', { cx:33, cy:12, r:2.6, fill:'currentColor' }, g);
    },
    blackjack: function(g){
      s('rect', { x:6, y:10, width:20, height:28, rx:3, transform:'rotate(-12 16 24)' }, g);
      s('rect', { x:20, y:8, width:20, height:28, rx:3, fill:'#111' }, g);
      s('path', { d:'M30 14 C26 19 23 21 23 24 C23 26.5 25 28 27 28 C28.5 28 29.5 27.2 30 26 C30 28.5 29 30 28 31 L32 31 C31 30 30 28.5 30 26 C30.5 27.2 31.5 28 33 28 C35 28 37 26.5 37 24 C37 21 34 19 30 14Z', fill:'currentColor', stroke:'none' }, g);
      s('text', { x:9, y:20, 'font-size':8, fill:'currentColor', stroke:'none', 'font-family':'Gelasio, serif', transform:'rotate(-12 16 24)' }, g).textContent = 'A';
    },
    punto: function(g){
      s('path', { d:'M6 34 L14 14 L42 14 L42 34 Z' }, g); s('line', { x1:6, y1:34, x2:42, y2:34 }, g);
      s('rect', { x:20, y:5, width:14, height:18, rx:2, fill:'#111' }, g);
      s('text', { x:27, y:19, 'font-size':10, 'text-anchor':'middle', fill:'currentColor', stroke:'none', 'font-family':'Gelasio, serif', 'font-weight':'700' }, g).textContent = '9';
      s('line', { x1:10, y1:40, x2:38, y2:40 }, g);
    },
    craps: function(g){
      s('rect', { x:4, y:14, width:20, height:20, rx:4, transform:'rotate(-10 14 24)' }, g);
      s('rect', { x:24, y:12, width:20, height:20, rx:4, transform:'rotate(12 34 22)' }, g);
      [[10,20],[18,28],[14,24]].forEach(function(p){ s('circle', { cx:p[0], cy:p[1], r:1.8, fill:'currentColor', stroke:'none', transform:'rotate(-10 14 24)' }, g); });
      [[29,17],[39,17],[29,27],[39,27]].forEach(function(p){ s('circle', { cx:p[0], cy:p[1], r:1.8, fill:'currentColor', stroke:'none', transform:'rotate(12 34 22)' }, g); });
    },
    poker: function(g){
      s('circle', { cx:24, cy:24, r:19 }, g); s('circle', { cx:24, cy:24, r:12, 'stroke-dasharray':'4 3' }, g);
      s('path', { d:'M24 15 C20 20 16 22 16 26 C16 28.5 18 30 20 30 C21.6 30 22.7 29.2 23.3 28 C23.2 30 22.4 31.5 21.4 32.5 L26.6 32.5 C25.6 31.5 24.8 30 24.7 28 C25.3 29.2 26.4 30 28 30 C30 30 32 28.5 32 26 C32 22 28 20 24 15Z', fill:'currentColor', stroke:'none' }, g);
    },
    calcul: function(g){
      [34, 27, 20].forEach(function(y){ s('ellipse', { cx:18, cy:y, rx:12, ry:4.5 }, g); });
      s('line', { x1:6, y1:20, x2:6, y2:34 }, g); s('line', { x1:30, y1:20, x2:30, y2:34 }, g);
      s('line', { x1:36, y1:12, x2:44, y2:12 }, g); s('line', { x1:40, y1:8, x2:40, y2:16 }, g);
      s('line', { x1:36, y1:24, x2:44, y2:24 }, g);
    },
    examen: function(g){
      s('path', { d:'M16 4 L20 18 M32 4 L28 18' }, g);
      s('circle', { cx:24, cy:30, r:12 }, g);
      s('path', { d:'M24 22 L26.4 27 L31.6 27.6 L27.7 31.2 L28.8 36.3 L24 33.7 L19.2 36.3 L20.3 31.2 L16.4 27.6 L21.6 27Z', fill:'currentColor', stroke:'none' }, g);
    },
    glossaire: function(g){
      s('path', { d:'M24 12 C18 8 10 8 5 10 L5 38 C10 36 18 36 24 40 C30 36 38 36 43 38 L43 10 C38 8 30 8 24 12Z' }, g); s('line', { x1:24, y1:12, x2:24, y2:40 }, g);
      s('line', { x1:10, y1:18, x2:19, y2:18 }, g); s('line', { x1:10, y1:24, x2:19, y2:24 }, g); s('line', { x1:29, y1:18, x2:38, y2:18 }, g);
    },
    progres: function(g){
      s('line', { x1:6, y1:42, x2:42, y2:42 }, g);
      s('rect', { x:9, y:28, width:7, height:14 }, g); s('rect', { x:21, y:20, width:7, height:22 }, g); s('rect', { x:33, y:10, width:7, height:32, fill:'currentColor' }, g);
    },
    lecon: function(g){
      s('path', { d:'M4 18 L24 9 L44 18 L24 27 Z' }, g); s('path', { d:'M12 22 L12 32 C16 36 32 36 36 32 L36 22' }, g); s('line', { x1:44, y1:18, x2:44, y2:30 }, g);
    },
    revision: function(g){
      s('path', { d:'M38 16 A16 16 0 1 0 40 28' }, g); s('path', { d:'M38 6 L38 16 L28 16' }, g);
    },
    cadenas: function(g){
      s('rect', { x:10, y:21, width:28, height:21, rx:4, fill:'currentColor' }, g); s('path', { d:'M16 21 L16 15 A8 8 0 0 1 32 15 L32 21' }, g);
    },
  };
  function icone(nom, taille){
    var e = s('svg', { viewBox:'0 0 48 48', width:taille || 32, height:taille || 32, 'aria-hidden':'true', focusable:'false' });
    e.setAttribute('class', 'icone icone-' + nom);
    var g = s('g', { fill:'none', stroke:'currentColor', 'stroke-width':2.4, 'stroke-linecap':'round', 'stroke-linejoin':'round' }, e);
    (ICONES[nom] || ICONES.roulette)(g);
    return e;
  }

  function dessine(v, boite, opts){
    if (!v || !boite) return;
    var revele = !!(opts && opts.revele);
    if (v.type === 'tapis') tapis(v, boite);
    else if (v.type === 'cylindre') cylindre(v, boite, revele);
    else if (v.type === 'cartes') cartes(v, boite);
    else if (v.type === 'des') des(v, boite);
    else if (v.type === 'jetons') jetons(v, boite);
    else if (v.type === 'mise') mise(v, boite);
    else if (v.type === 'points') points(v, boite);
    else if (v.type === 'numeros') numeros(v, boite);
  }

  window.__VISUELS = { dessine:dessine, icone:icone, couleurJeton:couleurJeton, TAP:TAP, COULEURS_JETONS:COULEURS_JETONS };
})();
