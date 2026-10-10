/* L'ENTRAÎNEUR DE CROUPIER v2 — croupier.kd-mc.com/entrainement.html
 *
 * Les gestes que les écoles de jeux testent réellement : payer juste et vite,
 * lire le tapis, connaître le cylindre, compter une main, appliquer la règle de
 * tirage. Six familles : roulette, blackjack, punto banco, craps, poker Ultimate
 * (THU), et la « pré-école » (calcul mental, jetons, mémoire).
 *
 * Tout est calculé ici, dans le navigateur. Ce qu'on garde (progression, erreurs
 * à revoir, niveau choisi) reste sur ton téléphone et n'est JAMAIS envoyé.
 * Un seul appel réseau existe : la question « ce code d'accès est-il valable ? »
 * posée au worker de vente (/acces). La page ne juge jamais le code elle-même.
 *
 * Les rapports sont des FAITS, pas des réglages : ils sont figés ici et vérifiés
 * par tests/croupier-entrainement.test.mjs et tests/croupier-entrainement-plus.test.mjs
 * (qui recalculent chaque réponse par un autre chemin, à chaque niveau).
 *
 * Un exercice gratuit par jeu + l'examen blanc : le reste est verrouillé, et le
 * moteur est la SEULE source du verrou (MODES[].libre). Un code accepté par le
 * worker ouvre tout, dans le moteur ET à l'écran.
 *
 * Fichiers voisins : entrainement-visuels.js (tapis, cylindre, cartes, dés, jetons
 * dessinés en SVG) et entrainement-lecons.js (fiches « Apprendre » et glossaire).
 */
'use strict';

/* ── Les rapports de paiement ────────────────────────────────────────────── */
var MISES_ROULETTE = [
  { id:'plein',       nom:'Plein',               couvre:1,  paie:35, aide:'un seul numéro' },
  { id:'cheval',      nom:'Cheval',              couvre:2,  paie:17, aide:'deux numéros voisins' },
  { id:'transversale',nom:'Transversale pleine', couvre:3,  paie:11, aide:'une ligne de trois' },
  { id:'carre',       nom:'Carré',               couvre:4,  paie:8,  aide:'quatre numéros' },
  { id:'sixain',      nom:'Sixain',              couvre:6,  paie:5,  aide:'deux lignes' },
  { id:'douzaine',    nom:'Douzaine',            couvre:12, paie:2,  aide:'12 numéros' },
  { id:'colonne',     nom:'Colonne',             couvre:12, paie:2,  aide:'12 numéros' },
  { id:'simple',      nom:'Chance simple',       couvre:18, paie:1,  aide:'rouge/noir, pair/impair, manque/passe' },
];
var PAIE_TYPE = {}; MISES_ROULETTE.forEach(function(m){ PAIE_TYPE[m.id] = m.paie; });
/* Rapport selon le nombre de numéros couverts par une pièce d'annonce. */
var PAIE_PAR_COUVERTURE = { 1:35, 2:17, 3:11, 4:8 };
var BLACKJACK = { blackjack:1.5, gagnante:1, assurance:2 };
var COMMISSION_BANCO = 0.05;
/* Punto banco : égalité 8 contre 1 et paire 11 contre 1 sont les tables les plus courantes
   (certaines maisons paient l'égalité 9 contre 1) — c'est DIT à l'écran. */
var PUNTO_EXTRA = { egalite:8, paire:11 };
var ROUGES = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

/* Le cylindre européen (un zéro), dans le sens des aiguilles d'une montre. */
var CYLINDRE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

/* Les annonces de la roulette française : chaque pièce = [numéros couverts, nombre de pièces]. */
var ANNONCES = {
  voisins:   { nom:'Voisins du zéro',   pieces:[[[0,2,3],2],[[4,7],1],[[12,15],1],[[18,21],1],[[19,22],1],[[32,35],1],[[25,26,28,29],2]] },
  tiers:     { nom:'Tiers du cylindre', pieces:[[[5,8],1],[[10,11],1],[[13,16],1],[[23,24],1],[[27,30],1],[[33,36],1]] },
  orphelins: { nom:'Orphelins',         pieces:[[[1],1],[[6,9],1],[[14,17],1],[[17,20],1],[[31,34],1]] },
  jeuzero:   { nom:'Jeu zéro',          pieces:[[[0,3],1],[[12,15],1],[[26],1],[[32,35],1]] },
};

/* Craps : rapports « contre 1 » (le gain, la mise reste au joueur). */
var CRAPS = {
  ligne: 1,                                   /* pass line, come, don't pass : 1 contre 1 */
  odds:  { 4:[2,1], 10:[2,1], 5:[3,2], 9:[3,2], 6:[6,5], 8:[6,5] },   /* vraies cotes */
  place: { 4:[9,5], 10:[9,5], 5:[7,5], 9:[7,5], 6:[7,6], 8:[7,6] },
  propositions: [
    { nom:'Any seven',        paie:4 },
    { nom:'Any craps',        paie:7 },
    { nom:'Hard 4',           paie:7 },
    { nom:'Hard 10',          paie:7 },
    { nom:'Hard 6',           paie:9 },
    { nom:'Hard 8',           paie:9 },
    { nom:'Onze (yo)',        paie:15 },
    { nom:'Deux (aces)',      paie:30 },
    { nom:'Douze (midnight)', paie:30 },
  ],
  /* Field : la variante utilisée ici (2 et 12 paient double). Beaucoup de maisons paient l'un
     des deux triple : c'est écrit à l'écran, à chaque question. */
  field: { 2:2, 3:1, 4:1, 9:1, 10:1, 11:1, 12:2 },
};

/* Poker Ultimate Texas Hold'em : table de la Blind la plus répandue. */
var THU_BLIND = { 'Quinte flush royale':500, 'Quinte flush':50, 'Carré':10, 'Full':3, 'Couleur':1.5, 'Quinte':1 };
var MAINS_POKER = ['Quinte flush royale','Quinte flush','Carré','Full','Couleur','Quinte','Brelan','Double paire','Paire','Carte haute'];

/* Jetons plausibles à une table : on ne s'entraîne pas sur des nombres ronds,
   c'est justement là que les erreurs arrivent. */
var JETONS = [1,2,3,4,5,6,7,8,9,10,15,20,25,30,35,40,45,50,75,100,125,150,200,250,500];
/* Le hasard des tirages vient du générateur du navigateur (crypto), pas de Math.random : une seule source, sans prévisibilité. */
function alea(){ var u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; }
function tire(liste){ return liste[Math.floor(alea()*liste.length)]; }
function entre(a, b){ return a + Math.floor(alea()*(b-a+1)); }
function tireJeton(max){ var ok = JETONS.filter(function(j){ return !max || j<=max; }); return tire(ok); }
function melange(l){ var a = l.slice(); for (var i=a.length-1;i>0;i--){ var j=Math.floor(alea()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
function arrondi(x){ return Math.round(x*100)/100; }
function virgule(x){ return String(x).replace('.', ','); }

/* ── Les niveaux : Facile / Normal / Croupier ──────────────────────────────
   Ils changent VRAIMENT les tirages : petites mises rondes → mises non rondes et
   grandes, plus de mises cumulées, plus de cartes, et un chrono plus serré.
   « Normal » est exactement le tirage historique (les tests d'origine le lisent). */
var NIVEAUX = {
  facile:   { nom:'Facile',   chrono:1.5,  aide:'mises rondes et petites, temps large' },
  normal:   { nom:'Normal',   chrono:1,    aide:'mises de table, temps des écoles' },
  croupier: { nom:'Croupier', chrono:0.75, aide:'mises non rondes, plus de mises, chrono serré' },
};
var ORDRE_NIVEAUX = ['facile','normal','croupier'];
var JETONS_RONDS = [1,2,5,10,20,25,50,100];
var JETONS_DURS = [3,7,9,11,13,17,19,23,27,29,33,37,41,43,47,55,63,65,75,85,95,115,135,145,165,185,235,265,315,345,385,415,465];
function nv(niv){ return NIVEAUX[niv] ? niv : 'normal'; }
function parNiveau(niv, facile, normal, croupier){ niv = nv(niv); return niv === 'facile' ? facile : niv === 'croupier' ? croupier : normal; }
/* Une mise selon le niveau : max = le plafond du tirage « normal ». */
function miseNiveau(niv, max){
  niv = nv(niv);
  if (niv === 'facile') return tire(JETONS_RONDS.filter(function(j){ return j <= Math.max(5, max/2); }));
  if (niv === 'croupier') return tire(JETONS_DURS.filter(function(j){ return j <= max*2; }));
  return tireJeton(max);
}
function objectifNiveau(mode, niv){
  var m = MODES[mode]; if (!m) return 0;
  return Math.max(2, Math.round(m.objectif * NIVEAUX[nv(niv)].chrono));
}

/* ── Les cartes ──────────────────────────────────────────────────────────── */
var RANGS = ['A','2','3','4','5','6','7','8','9','10','V','D','R'];
var COULEURS = ['♠','♥','♦','♣'];
function carte(){ return { r:tire(RANGS), c:tire(COULEURS) }; }
function nomCarte(k){ return k.r + k.c; }
function valeurBlackjack(r){ return r === 'A' ? 1 : (r === 'V' || r === 'D' || r === 'R') ? 10 : Number(r); }
function valeurBaccara(r){ var v = valeurBlackjack(r); return v === 10 ? 0 : v; }

/* Valeur d'une main de blackjack : un as compte 11 tant qu'on ne dépasse pas 21. */
function totalBlackjack(cartes){
  var dur = 0, as = 0;
  cartes.forEach(function(k){ dur += valeurBlackjack(k.r); if (k.r === 'A') as++; });
  var souple = (as > 0 && dur + 10 <= 21);
  return { total: souple ? dur + 10 : dur, dur: dur, souple: souple };
}
function pointsBaccara(cartes){
  return cartes.reduce(function(s, k){ return s + valeurBaccara(k.r); }, 0) % 10;
}

/* Classement d'une main de poker à 5 cartes. */
function classeMain(cartes){
  var ordre = { A:14, R:13, D:12, V:11 };
  var v = cartes.map(function(k){ return ordre[k.r] || Number(k.r); }).sort(function(a,b){ return a-b; });
  var couleur = cartes.every(function(k){ return k.c === cartes[0].c; });
  var distincts = v.filter(function(x, i){ return v.indexOf(x) === i; });
  var suite = distincts.length === 5 && (v[4] - v[0] === 4 || v.join(',') === '2,3,4,5,14');
  var compte = {}; v.forEach(function(x){ compte[x] = (compte[x]||0) + 1; });
  var groupes = Object.keys(compte).map(function(k){ return compte[k]; }).sort(function(a,b){ return b-a; });
  if (suite && couleur) return v[0] === 10 ? 'Quinte flush royale' : 'Quinte flush';
  if (groupes[0] === 4) return 'Carré';
  if (groupes[0] === 3 && groupes[1] === 2) return 'Full';
  if (couleur) return 'Couleur';
  if (suite) return 'Quinte';
  if (groupes[0] === 3) return 'Brelan';
  if (groupes[0] === 2 && groupes[1] === 2) return 'Double paire';
  if (groupes[0] === 2) return 'Paire';
  return 'Carte haute';
}
function mainDistincte(n){
  var vues = {}, main = [];
  while (main.length < n){ var k = carte(); var id = k.r + k.c; if (!vues[id]){ vues[id] = 1; main.push(k); } }
  return main;
}
/* Une main d'une catégorie donnée, tirée au hasard (sinon on ne verrait que des paires). */
function mainDeCategorie(cat){
  if (cat === 'Quinte flush royale' || cat === 'Quinte flush'){
    var c = tire(COULEURS);
    var haut = cat === 'Quinte flush royale' ? 14 : entre(5, 13);
    var noms = { 14:'A', 13:'R', 12:'D', 11:'V', 1:'A' };
    var m = [];
    for (var x = haut - 4; x <= haut; x++) m.push({ r: noms[x] || String(x), c: c });
    return m;
  }
  for (var essai = 0; essai < 300000; essai++){
    var main = mainDistincte(5);
    if (classeMain(main) === cat) return main;
  }
  return null;
}
var FIGURES = ['10','V','D','R'];

/* ── Les réponses : nombre, liste (ordre libre), suite (ordre compte), choix ── */
function lireNombres(s){ return (String(s).match(/\d+/g) || []).map(Number); }
function estJuste(exo, saisie){
  var t = exo.type || 'nombre';
  if (t === 'choix') return String(saisie) === String(exo.reponse);
  if (t === 'liste' || t === 'suite'){
    var a = lireNombres(saisie), b = exo.reponse.slice();
    if (a.length !== b.length) return false;
    if (t === 'liste'){ a.sort(function(x,y){ return x-y; }); b.sort(function(x,y){ return x-y; }); }
    return a.every(function(x, i){ return x === b[i]; });
  }
  var n = parseFloat(String(saisie).replace(',', '.').trim());
  return !isNaN(n) && Math.abs(n - exo.reponse) < 0.005;
}
function reponseLisible(exo){
  if (exo.type === 'liste' || exo.type === 'suite') return exo.reponse.join(' ');
  return String(exo.reponse).replace('.', ',');
}

/* ── Le tapis : géométrie (0 en tête, puis 12 lignes de 3) ───────────────── */
function ligneDe(n){ return Math.ceil(n / 3); }
function colDe(n){ return (n - 1) % 3; }
function numero(l, c){ return (l - 1) * 3 + c + 1; }
var CHANCES = {
  Rouge:  function(n){ return ROUGES.indexOf(n) >= 0; },
  Noir:   function(n){ return n > 0 && ROUGES.indexOf(n) < 0; },
  Pair:   function(n){ return n > 0 && n % 2 === 0; },
  Impair: function(n){ return n % 2 === 1; },
  Manque: function(n){ return n >= 1 && n <= 18; },
  Passe:  function(n){ return n >= 19; },
};
function numerosChance(nom){ var l = []; for (var x = 1; x <= 36; x++) if (CHANCES[nom](x)) l.push(x); return l; }
/* Une mise du type t qui CONTIENT le numéro n (1 à 36) : nums triés, et la zone pour l'extérieur. */
function placeMise(t, n){
  var l = ligneDe(n), c = colDe(n), opts = [], i;
  if (t === 'plein') return { t:t, nums:[n] };
  if (t === 'cheval'){
    if (c > 0) opts.push([n - 1, n]); if (c < 2) opts.push([n, n + 1]);
    if (l > 1) opts.push([n - 3, n]); if (l < 12) opts.push([n, n + 3]);
    return { t:t, nums:tire(opts) };
  }
  if (t === 'transversale') return { t:t, nums:[numero(l,0), numero(l,1), numero(l,2)] };
  if (t === 'carre'){
    var dls = [], dcs = [];
    if (l > 1) dls.push(-1); if (l < 12) dls.push(1);
    if (c > 0) dcs.push(-1); if (c < 2) dcs.push(1);
    var dl = tire(dls), dc = tire(dcs);
    return { t:t, nums:[n, n + dc, n + 3*dl, n + 3*dl + dc].sort(function(a,b){ return a-b; }) };
  }
  if (t === 'sixain'){
    var d2 = []; if (l > 1) d2.push(l - 1); if (l < 12) d2.push(l + 1);
    var l0 = Math.min(l, tire(d2)), nums = [];
    for (i = 0; i < 6; i++) nums.push(numero(l0, 0) + i);
    return { t:t, nums:nums };
  }
  if (t === 'douzaine'){
    var d = Math.ceil(n / 12), nd = [];
    for (i = 12*(d-1) + 1; i <= 12*d; i++) nd.push(i);
    return { t:t, nums:nd, zone:'douzaine-' + d };
  }
  if (t === 'colonne'){
    var nc = []; for (i = c + 1; i <= 36; i += 3) nc.push(i);
    return { t:t, nums:nc, zone:'colonne-' + (c + 1) };
  }
  if (t === 'simple'){
    var nom = tire(Object.keys(CHANCES).filter(function(k){ return CHANCES[k](n); }));
    return { t:t, nums:numerosChance(nom), zone:'simple-' + nom.toLowerCase(), chance:nom };
  }
  return null;
}
var ORDINAL = { 1:'1re', 2:'2e', 3:'3e' };
function libelleMise(p){
  var n = p.nums;
  if (p.t === 'plein') return 'plein ' + n[0];
  if (p.t === 'cheval') return 'cheval ' + n.join('/');
  if (p.t === 'transversale') return 'transversale ' + n.join('/');
  if (p.t === 'carre') return 'carré ' + n.join('/');
  if (p.t === 'sixain') return 'sixain ' + n[0] + ' à ' + n[5];
  if (p.t === 'douzaine') return ORDINAL[p.zone.slice(-1)] + ' douzaine (' + n[0] + ' à ' + n[11] + ')';
  if (p.t === 'colonne') return ORDINAL[p.zone.slice(-1)] + ' colonne';
  if (p.t === 'simple') return 'chance simple ' + p.chance;
  return '';
}

/* ── ROULETTE ────────────────────────────────────────────────────────────── */
function exoRouletteSimple(niv){
  var m = tire(MISES_ROULETTE);
  var mise = miseNiveau(niv, m.paie >= 11 ? 25 : 200);   /* on ne met pas 500 en plein */
  var n = entre(1, 36), p = placeMise(m.id, n); p.v = mise;
  return {
    mode:'roulette',
    enonce:'<b>'+m.nom+'</b> — '+m.aide+'<br>Mise de <b>'+mise+'</b> sur '+libelleMise(p)+'. Le <b>'+n+'</b> sort.',
    question:'Tu paies combien ?',
    reponse: mise * m.paie,
    explique: mise+' × '+m.paie+' = '+(mise*m.paie)+'  (le '+m.nom.toLowerCase()+' paie '+m.paie+' fois la mise ; la mise reste au joueur)',
    visuel:{ type:'tapis', mises:[p], sortant:n },
  };
}

function exoRouletteCombinee(niv){
  var n0 = parNiveau(niv, 2, 2 + Math.floor(alea()*2), 3 + Math.floor(alea()*2));   /* mises gagnantes */
  var choix = melange(MISES_ROULETTE).slice(0, n0);
  var n = entre(1, 36);
  var lignes = [], total = 0, detail = [], mises = [];
  choix.forEach(function(m){
    var mise = miseNiveau(niv, m.paie >= 11 ? 20 : 100);
    var gain = mise * m.paie;
    var p = placeMise(m.id, n); p.v = mise; mises.push(p);
    total += gain;
    lignes.push('<b>'+mise+'</b> en '+m.nom.toLowerCase()+' ('+libelleMise(p)+')');
    detail.push(mise+'×'+m.paie+'='+gain);
  });
  return {
    mode:'roulette-combinee',
    enonce:'Le <b>'+n+'</b> sort. Ces mises gagnent :<br>'+lignes.join('<br>'),
    question:'Total à payer ?',
    reponse: total,
    explique: detail.join('  +  ')+'  =  '+total,
    visuel:{ type:'tapis', mises:mises, sortant:n },
  };
}

/* Lire le tapis : des mises gagnent, d'autres perdent. On ramasse ou on paie. */
function exoRouletteTapis(niv){
  var n = entre(1, 36), l = ligneDe(n);
  var nb = parNiveau(niv, 3, entre(3, 4), entre(4, 6));
  var mises = [], vus = {}, essais = 0;
  while (mises.length < nb && essais++ < 500){
    var m = tire(MISES_ROULETTE);
    var gagne = mises.length === 0 ? true : mises.length === 1 ? false : alea() < 0.5;
    var p;
    if (gagne) p = placeMise(m.id, n);
    else {
      var lmin = Math.max(1, l - 1), lmax = Math.min(12, l + 1);
      var autre = numero(entre(lmin, lmax), entre(0, 2));
      p = placeMise(m.id, autre);
      if (!p || p.nums.indexOf(n) >= 0) continue;
    }
    var cle = p.t + ':' + p.nums.join(',') + ':' + (p.zone || '');
    if (vus[cle]) continue;
    /* une seule mise par case extérieure, sinon deux jetons se poseraient au même endroit */
    vus[cle] = 1;
    p.v = miseNiveau(niv, m.paie >= 11 ? 25 : 100);
    mises.push(p);
  }
  mises = melange(mises);
  var gagnantes = mises.filter(function(p){ return p.nums.indexOf(n) >= 0; });
  var perdantes = mises.filter(function(p){ return p.nums.indexOf(n) < 0; });
  var lignes = mises.map(function(p){ return '<b>'+p.v+'</b> en '+libelleMise(p); });
  var ramasse = alea() < 0.4;
  if (ramasse){
    var r = perdantes.reduce(function(s, p){ return s + p.v; }, 0);
    return { mode:'roulette-tapis',
      enonce:'Le <b>'+n+'</b> sort. Sur le tapis :<br>'+lignes.join('<br>'),
      question:'Combien ramasses-tu (mises perdantes) ?',
      reponse: r,
      explique: 'Perdantes : '+perdantes.map(function(p){ return libelleMise(p)+' ('+p.v+')'; }).join(', ')+' → '+r
        +'. On ramasse d’abord les perdantes, puis on paie.',
      visuel:{ type:'tapis', mises:mises, sortant:n } };
  }
  var total = 0, det = [];
  gagnantes.forEach(function(p){ var g = p.v * PAIE_TYPE[p.t]; total += g; det.push(libelleMise(p)+' : '+p.v+'×'+PAIE_TYPE[p.t]+'='+g); });
  return { mode:'roulette-tapis',
    enonce:'Le <b>'+n+'</b> sort. Sur le tapis :<br>'+lignes.join('<br>'),
    question:'Total à payer (gains des mises gagnantes) ?',
    reponse: total,
    explique: det.join('  +  ')+(det.length > 1 ? '  =  '+total : '')+'. Les autres mises perdent : on les ramasse avant de payer.',
    visuel:{ type:'tapis', mises:mises, sortant:n } };
}

/* Le complet (maximum) d'un numéro : toutes les mises qui le touchent, en pièces
   proportionnelles (la composition la plus courante : 1 plein, 2 par cheval,
   3 en transversale, 4 par carré, 6 par sixain). Numéros 4 à 33 : ni le zéro ni
   les lignes du bord (leur complet a une autre forme). */
var PIECES_COMPLET = { plein:1, cheval:2, transversale:3, carre:4, sixain:6 };
function compositionComplet(n){
  var l = ligneDe(n), c = colDe(n), out = [], i;
  out.push({ t:'plein', nums:[n] });
  if (c > 0) out.push({ t:'cheval', nums:[n-1, n] });
  if (c < 2) out.push({ t:'cheval', nums:[n, n+1] });
  out.push({ t:'cheval', nums:[n-3, n] }, { t:'cheval', nums:[n, n+3] });
  out.push({ t:'transversale', nums:[numero(l,0), numero(l,1), numero(l,2)] });
  [-1, 1].forEach(function(dl){ [-1, 1].forEach(function(dc){
    if (c + dc < 0 || c + dc > 2) return;
    out.push({ t:'carre', nums:[n, n+dc, n+3*dl, n+3*dl+dc].sort(function(a,b){ return a-b; }) });
  }); });
  [l-1, l].forEach(function(l0){ var s = []; for (i = 0; i < 6; i++) s.push(numero(l0, 0) + i); out.push({ t:'sixain', nums:s }); });
  out.forEach(function(p){ p.pieces = PIECES_COMPLET[p.t]; });
  return out;
}
function exoRouletteComplet(niv){
  var n = entre(4, 33);
  var u = tire(parNiveau(niv, [1,2,5,10], [1,2,3,5,10,25], [3,4,6,7,15,20]));
  var comp = compositionComplet(n);
  var pieces = comp.reduce(function(s, p){ return s + p.pieces; }, 0);
  var gainU = comp.reduce(function(s, p){ return s + p.pieces * PAIE_TYPE[p.t]; }, 0);
  var compte = {}; comp.forEach(function(p){ compte[p.t] = (compte[p.t] || 0) + 1; });
  var compo = '1 plein, '+compte.cheval+' chevaux ×2, 1 transversale ×3, '+compte.carre+' carrés ×4, 2 sixains ×6';
  var visu = comp.map(function(p){ return { t:p.t, nums:p.nums, v:p.pieces * u }; });
  var cas = alea();
  if (cas < 0.3) return { mode:'roulette-complet',
    enonce:'Le <b>complet du '+n+'</b> (pièces proportionnelles 1-2-3-4-6).',
    question:'Combien de pièces en tout ?',
    reponse: pieces,
    explique: compo+' = '+pieces+' pièces. (Composition la plus courante ; certaines maisons font autrement.)',
    visuel:{ type:'tapis', mises:visu, sortant:null } };
  if (cas < 0.55) return { mode:'roulette-complet',
    enonce:'Le <b>complet du '+n+'</b> à <b>'+u+'</b> la pièce.',
    question:'Combien le joueur mise-t-il en tout ?',
    reponse: pieces * u,
    explique: compo+' = '+pieces+' pièces → '+pieces+' × '+u+' = '+(pieces*u),
    visuel:{ type:'tapis', mises:visu, sortant:null } };
  return { mode:'roulette-complet',
    enonce:'Le <b>complet du '+n+'</b> à <b>'+u+'</b> la pièce. Le <b>'+n+'</b> sort.',
    question:'Tu paies combien ?',
    reponse: gainU * u,
    explique: '35 + '+compte.cheval+'×2×17 + 3×11 + '+compte.carre+'×4×8 + 2×6×5 = '+gainU+' par pièce → '+gainU+' × '+u+' = '+(gainU*u),
    visuel:{ type:'tapis', mises:visu, sortant:n } };
}

/* Ce que rapporte une annonce quand le numéro n sort (par pièce de valeur u). */
function gainAnnonce(cle, n, u){
  var total = 0, detail = [];
  ANNONCES[cle].pieces.forEach(function(p){
    if (p[0].indexOf(n) < 0) return;
    var paie = PAIE_PAR_COUVERTURE[p[0].length];
    var g = p[1] * u * paie;
    total += g;
    detail.push(p[0].join('/')+' : '+p[1]+'×'+u+'×'+paie+' = '+g);
  });
  return { total: total, detail: detail };
}
function nbPieces(cle){ return ANNONCES[cle].pieces.reduce(function(s, p){ return s + p[1]; }, 0); }
function numerosAnnonce(cle){
  var l = [];
  ANNONCES[cle].pieces.forEach(function(p){ p[0].forEach(function(x){ if (l.indexOf(x) < 0) l.push(x); }); });
  return l;
}

function exoRouletteAnnonces(niv){
  var cle = tire(Object.keys(ANNONCES));
  var a = ANNONCES[cle];
  var u = tire(parNiveau(niv, [1,2,5,10], [1,2,3,5,10,25], [3,4,6,7,15,20,35]));
  if (alea() < 0.4){
    var p = nbPieces(cle);
    return { mode:'roulette-annonces',
      enonce:'Annonce <b>« '+a.nom+' »</b> à <b>'+u+'</b> la pièce.',
      question:'Combien le joueur doit-il miser en tout ?',
      reponse: p * u,
      explique: a.nom+' = '+p+' pièces → '+p+' × '+u+' = '+(p*u),
      visuel:{ type:'cylindre', secteur:numerosAnnonce(cle) } };
  }
  var n = tire(numerosAnnonce(cle));
  var g = gainAnnonce(cle, n, u);
  return { mode:'roulette-annonces',
    enonce:'<b>« '+a.nom+' »</b> à <b>'+u+'</b> la pièce.<br>Le <b>'+n+'</b> sort.',
    question:'Tu paies combien ?',
    reponse: g.total,
    explique: g.detail.join('  +  ')+(g.detail.length > 1 ? '  =  '+g.total : ''),
    visuel:{ type:'cylindre', secteur:numerosAnnonce(cle), sortant:n } };
}

/* Décomposer une annonce : sur quel cheval va la pièce, combien de pièces sur une mise. */
function exoRouletteDecomposer(niv){
  if (alea() < 0.6){
    var cles = parNiveau(niv, ['tiers'], ['tiers','orphelins','voisins'], ['tiers','orphelins','voisins','jeuzero']);
    var cle = tire(cles), a = ANNONCES[cle];
    var occ = {}; a.pieces.forEach(function(p){ p[0].forEach(function(x){ occ[x] = (occ[x] || 0) + 1; }); });
    var chevaux = a.pieces.filter(function(p){ return p[0].length === 2 && occ[p[0][0]] === 1 && occ[p[0][1]] === 1; });
    var piece = tire(chevaux)[0];
    var i = Math.floor(alea()*2), x = piece[i], y = piece[1 - i];
    return { mode:'roulette-decomposer',
      enonce:'Annonce <b>« '+a.nom+' »</b>. Le <b>'+x+'</b> y est joué à cheval.',
      question:'Avec quel numéro ?',
      reponse: y,
      explique: x+'/'+y+'. '+a.nom+' : '+a.pieces.map(function(p){ return p[0].join('/')+(p[1] > 1 ? ' (×'+p[1]+')' : ''); }).join(', '),
      visuel:{ type:'cylindre', secteur:numerosAnnonce(cle), sortant:x } };
  }
  var v = ANNONCES.voisins, pc = tire(v.pieces);
  var u = tire(parNiveau(niv, [1,2,5], [1,2,3,5,10], [3,4,6,7,15]));
  var lib = pc[0].length === 3 ? 'la transversale 0/2/3' : pc[0].length === 4 ? 'le carré 25/26/28/29' : 'le cheval '+pc[0].join('/');
  return { mode:'roulette-decomposer',
    enonce:'<b>« Voisins du zéro »</b> à <b>'+u+'</b> la pièce.<br>Sur <b>'+lib+'</b>, tu poses :',
    question:'Combien en jetons ?',
    reponse: pc[1] * u,
    explique: pc[1]+' pièce'+(pc[1] > 1 ? 's' : '')+' × '+u+' = '+(pc[1]*u)+'. Aux voisins, 0/2/3 et 25/26/28/29 prennent 2 pièces chacun, les 5 chevaux 1 pièce : 9 pièces.',
    visuel:{ type:'cylindre', secteur:numerosAnnonce('voisins') } };
}

function numerosFinale(f){ var l = []; for (var x = f; x <= 36; x += 10) l.push(x); return l; }
function exoRouletteFinales(niv){
  var f = entre(0, 9), u = tire(parNiveau(niv, [1,2,5,10], [1,2,5,10,20,25], [3,4,6,15,30,35]));
  var nums = numerosFinale(f);
  if (alea() < 0.5){
    return { mode:'roulette-finales',
      enonce:'<b>Finale '+f+'</b> en plein, à <b>'+u+'</b> la pièce.',
      question:'Combien de jetons faut-il en tout ?',
      reponse: nums.length * u,
      explique: 'Finale '+f+' = '+nums.join(', ')+' → '+nums.length+' pièces × '+u+' = '+(nums.length*u)+'  (finales 7, 8, 9 : 3 numéros ; les autres : 4)' };
  }
  var n = tire(nums);
  return { mode:'roulette-finales',
    enonce:'<b>Finale '+f+'</b> en plein, à <b>'+u+'</b> la pièce. Le <b>'+n+'</b> sort.',
    question:'Tu paies combien ?',
    reponse: u * 35,
    explique: 'Une seule pièce gagne (le plein du '+n+') : '+u+' × 35 = '+(u*35),
    visuel:{ type:'numeros', nums:nums, sortant:n, jeton:u } };
}

function voisins(n, k){
  var i = CYLINDRE.indexOf(n), l = [];
  for (var d = 1; d <= k; d++){ l.push(CYLINDRE[(i - d + 37) % 37]); l.push(CYLINDRE[(i + d) % 37]); }
  return l;
}
function exoRouletteCylindre(niv){
  var n = tire(CYLINDRE), k = parNiveau(niv, 1, alea() < 0.6 ? 2 : 1, alea() < 0.5 ? 3 : 2);
  var v = voisins(n, k);
  var gauche = [], droite = [];
  for (var d = k; d >= 1; d--) gauche.push(CYLINDRE[(CYLINDRE.indexOf(n) - d + 37) % 37]);
  for (d = 1; d <= k; d++) droite.push(CYLINDRE[(CYLINDRE.indexOf(n) + d) % 37]);
  return { mode:'roulette-cylindre', type:'liste',
    enonce:'Sur le cylindre : les <b>'+(2*k)+' voisins</b> du <b>'+n+'</b> ('+k+' de chaque côté).',
    question:'Écris-les, séparés par des virgules',
    reponse: v,
    explique: gauche.join(' – ')+'  [ '+n+' ]  '+droite.join(' – '),
    visuel:{ type:'cylindre', centre:n, masque:v } };
}

/* Un numéro et ses voisins (2 ou 3 de chaque côté), joués en plein. */
function exoRouletteVoisinsN(niv){
  var n = tire(CYLINDRE), k = parNiveau(niv, 2, tire([2,3]), 3);
  var u = tire(parNiveau(niv, [1,2,5,10], [1,2,3,5,10,25], [3,4,6,7,15,20]));
  var v = voisins(n, k), tous = [n].concat(v);
  var i = CYLINDRE.indexOf(n), ordre = [];
  for (var d = -k; d <= k; d++) ordre.push(CYLINDRE[(i + d + 37) % 37]);
  var base = '<b>'+n+'</b> et ses voisins — <b>'+k+'</b> de chaque côté, à <b>'+u+'</b> la pièce.';
  var cas = alea();
  if (cas < 0.35) return { mode:'roulette-voisins-n', type:'liste',
    enonce: base,
    question:'Écris les '+(2*k+1)+' numéros joués (le '+n+' compris), séparés par des virgules',
    reponse: tous,
    explique: ordre.join(' – '),
    visuel:{ type:'cylindre', centre:n, masque:v } };
  if (cas < 0.65) return { mode:'roulette-voisins-n',
    enonce: base,
    question:'Combien le joueur mise-t-il en tout ?',
    reponse: (2*k+1) * u,
    explique: (2*k+1)+' pleins ('+ordre.join(', ')+') × '+u+' = '+((2*k+1)*u),
    visuel:{ type:'cylindre', centre:n, secteur:tous } };
  var x = tire(tous);
  return { mode:'roulette-voisins-n',
    enonce: base+'<br>Le <b>'+x+'</b> sort.',
    question:'Tu paies combien ?',
    reponse: 35 * u,
    explique: 'Un seul plein gagne : '+u+' × 35 = '+(35*u)+'  (secteur : '+ordre.join(', ')+')',
    visuel:{ type:'cylindre', centre:n, secteur:tous, sortant:x } };
}

/* ── BLACKJACK ───────────────────────────────────────────────────────────── */
function exoBlackjackMains(niv){
  var n = parNiveau(niv, tire([2,2,3]), tire([2,2,3,3,4]), tire([3,4,4,5]));
  var cartes = []; for (var i = 0; i < n; i++) cartes.push(carte());
  var t = totalBlackjack(cartes);
  var detail = cartes.map(function(k){ return k.r === 'A' ? 'A=1/11' : k.r+'='+valeurBlackjack(k.r); }).join(', ');
  return { mode:'blackjack-mains',
    enonce:'Main : <b>'+cartes.map(nomCarte).join('  ')+'</b>',
    question:'Valeur de la main ? (un as vaut 11 tant qu’on ne dépasse pas 21)',
    reponse: t.total,
    explique: detail+' → '+t.total+(t.souple && t.total < 21 ? '  (main souple : on annonce « '+(t.total-10)+' ou '+t.total+' »)' : '')
      +(t.total > 21 ? '  — au-delà de 21 : le joueur brûle' : ''),
    visuel:{ type:'cartes', mains:[{ titre:'Joueur', cartes:cartes }] } };
}

function exoBlackjack(niv){
  var cas = tire(['blackjack','blackjack','blackjack','gagnante','assurance']);
  var mise = miseNiveau(niv, 250);
  if (cas === 'blackjack'){
    /* le 3 pour 2 sur mise impaire : le vrai piège du métier */
    return { mode:'blackjack',
      enonce:'<b>Blackjack du joueur.</b><br>Mise de <b>'+mise+'</b>.',
      question:'Tu paies combien ?',
      reponse: mise * BLACKJACK.blackjack,
      explique: mise+' × 3 ÷ 2 = '+virgule(mise*1.5)+'   (le blackjack paie 3 pour 2 : la mise plus sa moitié)',
      visuel:{ type:'cartes', mains:[{ titre:'Joueur', cartes:[{ r:'A', c:tire(COULEURS) }, { r:tire(FIGURES), c:tire(COULEURS) }] }], jetons:[{ v:mise, label:'Mise' }] } };
  }
  if (cas === 'assurance'){
    return { mode:'blackjack',
      enonce:'<b>Assurance</b> prise pour <b>'+mise+'</b>. Le croupier a blackjack.',
      question:'Tu paies combien ?',
      reponse: mise * BLACKJACK.assurance,
      explique: mise+' × 2 = '+(mise*2)+'   (l’assurance paie 2 contre 1)',
      visuel:{ type:'cartes', mains:[{ titre:'Croupier', cartes:[{ r:'A', c:tire(COULEURS) }, { r:tire(FIGURES), c:tire(COULEURS) }] }], jetons:[{ v:mise, label:'Assurance' }] } };
  }
  return { mode:'blackjack',
    enonce:'<b>Main gagnante ordinaire.</b><br>Mise de <b>'+mise+'</b>.',
    question:'Tu paies combien ?',
    reponse: mise * BLACKJACK.gagnante,
    explique: mise+' × 1 = '+mise+'   (une main ordinaire paie 1 contre 1)',
    visuel:{ type:'mise', jetons:[{ v:mise, label:'Mise' }] } };
}

/* Séparer, doubler, égalité, assurance : les cas qui font hésiter à la table. */
var ISSUES_SPLIT = { 'gagne':1, 'égalité':0, 'perd':0, 'as + figure (21)':1 };
function exoBlackjackResultats(niv){
  var cas = tire(parNiveau(niv, ['double','egalite','assurance-max','split'], ['double','egalite','assurance-max','split','split'], ['double','split','split','split-double','assurance-max']));
  var x = miseNiveau(niv, 200);
  if (cas === 'assurance-max'){
    if (x % 2) x += 1;    /* l'assurance maximale est la moitié : on prend une mise paire */
    return { mode:'blackjack-resultats',
      enonce:'Mise de <b>'+x+'</b>. Le croupier montre un <b>as</b> : le joueur veut l’assurance maximale.',
      question:'Combien peut-il assurer au plus ?',
      reponse: x / 2,
      explique: 'L’assurance va jusqu’à la moitié de la mise : '+x+' ÷ 2 = '+(x/2)+'. Elle paie 2 contre 1 si le croupier a blackjack.',
      visuel:{ type:'cartes', mains:[{ titre:'Croupier', cartes:[{ r:'A', c:tire(COULEURS) }] }], jetons:[{ v:x, label:'Mise' }] } };
  }
  if (cas === 'egalite'){
    var pt = entre(17, 21);
    return { mode:'blackjack-resultats',
      enonce:'<b>Égalité</b> : le joueur et le croupier ont <b>'+pt+'</b>. Mise de <b>'+x+'</b>.',
      question:'Tu paies combien ?',
      reponse: 0,
      explique: 'Égalité (push, « stand-off ») : on ne paie rien et on ne ramasse rien, la mise reste au joueur → 0.',
      visuel:{ type:'mise', jetons:[{ v:x, label:'Mise' }] } };
  }
  if (cas === 'double'){
    return { mode:'blackjack-resultats',
      enonce:'Le joueur a <b>doublé</b> : mise de départ <b>'+x+'</b>, doublée. Il <b>gagne</b>.',
      question:'Tu paies combien ?',
      reponse: 2 * x,
      explique: 'Mise doublée = '+x+' + '+x+' = '+(2*x)+', payée 1 contre 1 → '+(2*x)+'.',
      visuel:{ type:'mise', jetons:[{ v:x, label:'Mise' }, { v:x, label:'Double' }] } };
  }
  var issues = Object.keys(ISSUES_SPLIT);
  var i1 = tire(issues), i2 = tire(issues), dbl = cas === 'split-double';
  if (i1 === 'perd' && i2 === 'perd') i1 = 'gagne';
  var g1 = ISSUES_SPLIT[i1] * x * (dbl ? 2 : 1), g2 = ISSUES_SPLIT[i2] * x;
  return { mode:'blackjack-resultats',
    enonce:'Le joueur a <b>séparé</b> sa paire : deux mains de <b>'+x+'</b>.'+(dbl ? ' La main 1 a été <b>doublée</b>.' : '')
      +'<br>Main 1 : <b>'+i1+'</b> · Main 2 : <b>'+i2+'</b>.',
    question:'Combien paies-tu (gains des mains gagnantes) ?',
    reponse: g1 + g2,
    explique: 'Main 1 : '+g1+' · Main 2 : '+g2+' → '+(g1+g2)+'. Après séparation, as + figure = 21, payé 1 contre 1 (pas blackjack). Égalité et main perdue : rien à payer.',
    visuel:{ type:'mise', jetons:[{ v:dbl ? 2*x : x, label:'Main 1' }, { v:x, label:'Main 2' }] } };
}

/* ── PUNTO BANCO ─────────────────────────────────────────────────────────── */
function exoPuntoPoints(niv){
  var n = parNiveau(niv, 2, alea() < 0.6 ? 2 : 3, 3);
  var cartes = []; for (var i = 0; i < n; i++) cartes.push(carte());
  var somme = cartes.reduce(function(s, k){ return s + valeurBaccara(k.r); }, 0);
  return { mode:'punto-points',
    enonce:'Main : <b>'+cartes.map(nomCarte).join('  ')+'</b>',
    question:'Combien de points ?',
    reponse: somme % 10,
    explique: cartes.map(function(k){ return k.r+'='+valeurBaccara(k.r); }).join(' + ')+' = '+somme
      +(somme >= 10 ? ' → on garde le chiffre des unités : '+(somme % 10) : '')+'   (10 et figures valent 0)',
    visuel:{ type:'cartes', mains:[{ titre:'Main', cartes:cartes }] } };
}

function exoPunto(niv){
  var mise = miseNiveau(niv, 500);
  if (alea() < 0.6){
    var com = arrondi(mise * COMMISSION_BANCO), net = arrondi(mise - com);   /* 3 × 0,95 = 2,8499999… en flottant */
    return { mode:'punto',
      enonce:'<b>Banco</b> gagne. Mise de <b>'+mise+'</b>.',
      question:'Tu paies combien, commission déduite ?',
      reponse: net,
      explique: mise+' − 5 % = '+mise+' − '+virgule(com)+' = '+virgule(net)+'   (5 % = un dixième, divisé par deux)',
      visuel:{ type:'mise', jetons:[{ v:mise, label:'Banco' }] } };
  }
  return { mode:'punto',
    enonce:'<b>Punto</b> gagne. Mise de <b>'+mise+'</b>.',
    question:'Tu paies combien ?',
    reponse: mise,
    explique: mise+' × 1 = '+mise+'   (Punto paie 1 contre 1, sans commission)',
    visuel:{ type:'mise', jetons:[{ v:mise, label:'Punto' }] } };
}

/* La règle de la troisième carte (tableau officiel du punto banco). */
function puntoTire(p){ return p <= 5; }
function bancoTire(b, troisiemePunto){
  if (troisiemePunto === null) return b <= 5;      /* le Punto est resté */
  if (b <= 2) return true;
  if (b === 3) return troisiemePunto !== 8;
  if (b === 4) return troisiemePunto >= 2 && troisiemePunto <= 7;
  if (b === 5) return troisiemePunto >= 4 && troisiemePunto <= 7;
  if (b === 6) return troisiemePunto === 6 || troisiemePunto === 7;
  return false;
}
function exoPuntoTirage(niv){
  if (alea() < parNiveau(niv, 0.6, 0.35, 0.15)){
    var p = entre(0, 7);
    var oui = puntoTire(p);
    return { mode:'punto-tirage', type:'choix', choix:['Il tire','Il reste'],
      enonce:'Le <b>Punto</b> a <b>'+p+'</b> points avec deux cartes (pas de naturel en face).',
      question:'Que fait le Punto ?',
      reponse: oui ? 'Il tire' : 'Il reste',
      explique: 'Le Punto tire de 0 à 5, reste à 6 et 7 (8 et 9 = naturel, personne ne tire).',
      visuel:{ type:'points', punto:p, banco:null } };
  }
  var b = entre(0, 7);
  var t = alea() < parNiveau(niv, 0.4, 0.25, 0.1) ? null : entre(0, 9);
  var tire3 = bancoTire(b, t);
  var regle = t === null ? 'Punto resté : le Banco tire de 0 à 5.'
    : b <= 2 ? 'Banco à 0, 1 ou 2 : il tire toujours.'
    : b === 3 ? 'Banco à 3 : il tire, sauf si la 3e carte du Punto est un 8.'
    : b === 4 ? 'Banco à 4 : il tire si la 3e carte du Punto vaut de 2 à 7.'
    : b === 5 ? 'Banco à 5 : il tire si la 3e carte du Punto vaut de 4 à 7.'
    : b === 6 ? 'Banco à 6 : il tire si la 3e carte du Punto vaut 6 ou 7.'
    : 'Banco à 7 : il reste toujours.';
  return { mode:'punto-tirage', type:'choix', choix:['Il tire','Il reste'],
    enonce: (t === null ? 'Le Punto <b>est resté</b>.' : 'La 3e carte du Punto vaut <b>'+t+'</b>.')
      +'<br>Le <b>Banco</b> a <b>'+b+'</b> points.',
    question:'Que fait le Banco ?',
    reponse: tire3 ? 'Il tire' : 'Il reste',
    explique: regle,
    visuel:{ type:'points', punto: t === null ? 'resté' : '3e : ' + t, banco:b } };
}

/* Égalité et paires : les mises « à côté ». */
function exoPuntoEgalite(niv){
  var x = miseNiveau(niv, 100);
  var cas = tire(parNiveau(niv, ['egalite','egalite','pb'], ['egalite','paire','pb'], ['egalite','paire','paire','pb']));
  var pts = entre(0, 9);
  if (cas === 'pb'){
    var cote = tire(['Punto','Banco']);
    return { mode:'punto-egalite', type:'choix', choix:['Elle reste au joueur','On la ramasse','On la paie 1 contre 1'],
      enonce:'<b>Égalité</b> à <b>'+pts+'</b>. Le joueur avait <b>'+x+'</b> sur le <b>'+cote+'</b>.',
      question:'Que fait-on de sa mise ?',
      reponse:'Elle reste au joueur',
      explique:'Sur une égalité, les mises Punto et Banco ne gagnent ni ne perdent : elles restent au joueur (on « laisse »). Seule la mise sur l’égalité est payée.',
      visuel:{ type:'points', punto:pts, banco:pts } };
  }
  if (cas === 'paire'){
    var r = tire(RANGS.slice(1, 9)), cote2 = tire(['Punto','Banco']);
    return { mode:'punto-egalite',
      enonce:'<b>Paire</b> au <b>'+cote2+'</b> (deux '+r+'). Mise sur la paire '+cote2+' : <b>'+x+'</b>.',
      question:'Tu paies combien ?',
      reponse: x * PUNTO_EXTRA.paire,
      explique: x+' × 11 = '+(x*11)+'   (la paire paie 11 contre 1 dans la plupart des maisons — vérifie la table de la tienne)',
      visuel:{ type:'cartes', mains:[{ titre:cote2, cartes:[{ r:r, c:'♠' }, { r:r, c:'♥' }] }], jetons:[{ v:x, label:'Paire' }] } };
  }
  return { mode:'punto-egalite',
    enonce:'<b>Égalité</b> à <b>'+pts+'</b>. Mise sur l’égalité : <b>'+x+'</b>.',
    question:'Tu paies combien ?',
    reponse: x * PUNTO_EXTRA.egalite,
    explique: x+' × 8 = '+(x*8)+'   (l’égalité paie 8 contre 1, la table la plus courante ; quelques maisons paient 9 contre 1)',
    visuel:{ type:'points', punto:pts, banco:pts, jetons:[{ v:x, label:'Égalité' }] } };
}

/* ── CRAPS ───────────────────────────────────────────────────────────────── */
function desPour(total){
  var l = []; for (var a = 1; a <= 6; a++){ var b = total - a; if (b >= 1 && b <= 6) l.push([a, b]); }
  return tire(l);
}
function exoCrapsLigne(niv){
  if (alea() < 0.35){
    var m = miseNiveau(niv, 200);
    var pari = tire(['Pass line','Come','Don’t pass']);
    var de = pari === 'Don’t pass' ? desPour(tire([2,3])) : desPour(tire([7,11]));
    return { mode:'craps-ligne',
      enonce:'<b>'+pari+'</b> gagne. Mise de <b>'+m+'</b>.',
      question:'Tu paies combien ?',
      reponse: m * CRAPS.ligne,
      explique: m+' × 1 = '+m+'   (les paris de ligne paient 1 contre 1)',
      visuel:{ type:'des', des:de, jetons:[{ v:m, label:pari }] } };
  }
  var point = tire([4,5,6,8,9,10]);
  var r = CRAPS.odds[point];
  var mise = r[1] * parNiveau(niv, tire([1,2,4,5,10]), entre(1, 20), entre(13, 60));   /* une mise que la cote divise juste */
  var g = mise * r[0] / r[1];
  return { mode:'craps-ligne',
    enonce:'Le point est <b>'+point+'</b>. Le joueur a <b>'+mise+'</b> en <b>odds</b> derrière la ligne. Le '+point+' sort.',
    question:'Tu paies combien pour les odds ?',
    reponse: g,
    explique: mise+' × '+r[0]+' ÷ '+r[1]+' = '+g+'   (odds sur '+point+' : '+r[0]+' contre '+r[1]+', la vraie cote)',
    visuel:{ type:'des', des:desPour(point), jetons:[{ v:mise, label:'Odds' }] } };
}
function exoCrapsPlace(niv){
  var n = tire([4,5,6,8,9,10]);
  var r = CRAPS.place[n];
  var mise = r[1] * parNiveau(niv, tire([1,2,4,5,10]), entre(1, 25), entre(13, 60));
  var g = mise * r[0] / r[1];
  return { mode:'craps-place',
    enonce:'<b>Place '+n+'</b>, mise de <b>'+mise+'</b>. Le '+n+' sort.',
    question:'Tu paies combien ?',
    reponse: g,
    explique: mise+' ÷ '+r[1]+' × '+r[0]+' = '+g+'   (place '+n+' : '+r[0]+' pour '+r[1]+' misés)',
    visuel:{ type:'des', des:desPour(n), jetons:[{ v:mise, label:'Place '+n }] } };
}
var DES_PROPOSITION = { 'Any seven':function(){ return desPour(7); }, 'Any craps':function(){ return desPour(tire([2,3,12])); },
  'Hard 4':function(){ return [2,2]; }, 'Hard 10':function(){ return [5,5]; }, 'Hard 6':function(){ return [3,3]; },
  'Hard 8':function(){ return [4,4]; }, 'Onze (yo)':function(){ return tire([[5,6],[6,5]]); }, 'Deux (aces)':function(){ return [1,1]; },
  'Douze (midnight)':function(){ return [6,6]; } };
function exoCrapsPropositions(niv){
  var p = tire(CRAPS.propositions);
  var mise = miseNiveau(niv, 50);
  return { mode:'craps-propositions',
    enonce:'<b>'+p.nom+'</b> gagne (stickman). Mise de <b>'+mise+'</b>.',
    question:'Tu paies combien ?',
    reponse: mise * p.paie,
    explique: mise+' × '+p.paie+' = '+(mise*p.paie)+'   ('+p.nom+' paie '+p.paie+' contre 1 — attention aux tables écrites « pour 1 » : '+(p.paie+1)+' pour 1 = '+p.paie+' contre 1)',
    visuel:{ type:'des', des:DES_PROPOSITION[p.nom](), jetons:[{ v:mise, label:p.nom }] } };
}
/* Field : un seul jet. Variante de cette table : 2 et 12 paient double. */
function exoCrapsField(niv){
  var x = miseNiveau(niv, 100);
  var gagne = alea() < 0.75;
  var total = gagne ? tire(parNiveau(niv, [3,4,9,10,11,2,12], [3,4,9,10,11,2,12,2,12], [2,12,3,4,9,10,11])) : tire([5,6,7,8]);
  var d = desPour(total), r = CRAPS.field[total] || 0;
  return { mode:'craps-field',
    enonce:'<b>Field</b>, mise de <b>'+x+'</b>. Les dés : <b>'+d[0]+'</b> et <b>'+d[1]+'</b>.<br><span class="variante">Variante de cette table : 2 et 12 paient double.</span>',
    question:'Tu paies combien ? (0 si le field perd)',
    reponse: x * r,
    explique: 'Total '+total+' : '+(r === 2 ? 'payé double → '+x+' × 2 = '+(2*x) : r === 1 ? 'payé 1 contre 1 → '+x : '5, 6, 7 et 8 font perdre le field → on ramasse, 0 à payer')
      +'. Field : 2, 3, 4, 9, 10, 11, 12 gagnent ; selon la maison, le 2 ou le 12 paie triple.',
    visuel:{ type:'des', des:d, jetons:[{ v:x, label:'Field' }] } };
}

/* ── POKER ULTIMATE (THU) ────────────────────────────────────────────────── */
function exoThuMains(niv){
  var cats = ['Paire','Double paire','Brelan','Quinte','Couleur','Full','Carré','Quinte flush','Carte haute','Quinte flush royale'];
  var poids = parNiveau(niv, [4,4,3,1,1,1,1,0.5,2,0.2], [3,3,3,3,3,2,2,1,1,0.4], [1,2,2,4,4,3,2,2,2,0.5]);
  var somme = poids.reduce(function(a,b){ return a+b; }, 0), x = alea()*somme, cat = cats[0];
  for (var i = 0; i < cats.length; i++){ x -= poids[i]; if (x < 0){ cat = cats[i]; break; } }
  var main = mainDeCategorie(cat) || mainDeCategorie('Paire');
  var vraie = classeMain(main);
  var autres = melange(MAINS_POKER.filter(function(m){ return m !== vraie; })).slice(0, 3);
  var vue = melange(main);
  return { mode:'thu-mains', type:'choix', choix: melange(autres.concat([vraie])),
    enonce:'Les 5 meilleures cartes du joueur : <b>'+vue.map(nomCarte).join('  ')+'</b>',
    question:'Quelle combinaison ?',
    reponse: vraie,
    explique: 'C’est : '+vraie+'. Ordre : '+MAINS_POKER.join(' > '),
    visuel:{ type:'cartes', mains:[{ titre:'Joueur', cartes:vue }] } };
}
function exoThuBlind(niv){
  var mains = Object.keys(THU_BLIND).concat(['Brelan','Double paire']);
  var m = tire(mains);
  var mise = miseNiveau(niv, 100);
  var r = THU_BLIND[m] || 0;
  return { mode:'thu-blind',
    enonce:'Le joueur gagne avec <b>'+m+'</b>. Sa <b>Blind</b> est de <b>'+mise+'</b>.',
    question:'Tu paies combien sur la Blind ?',
    reponse: arrondi(mise * r),
    explique: r ? mise+' × '+r+' = '+virgule(arrondi(mise*r))+'   ('+m+' : '+(r === 1.5 ? '3 pour 2' : r+' contre 1')+' sur la Blind)'
               : 'Sous la quinte, la Blind ne paie pas : elle reste au joueur (égalité) → 0',
    visuel:{ type:'mise', jetons:[{ v:mise, label:'Blind' }], titre:m } };
}

/* ── PRÉ-ÉCOLE : calcul mental, jetons, mémoire ──────────────────────────── */
var ASTUCES_TABLES = {
  35:'× 35 = × 36 − la mise (ou × 70 ÷ 2)',
  17:'× 17 = × 18 − la mise (× 2 puis × 9)',
  11:'× 11 = × 10 + la mise',
  8: '× 8 = doubler trois fois',
  5: '× 5 = × 10 ÷ 2',
};
var FACTEURS_SERIE = [35,17,11,8,5];
function exoCalculTables(niv){
  var f = tire([35,35,17,17,11,8,5]);
  var b = parNiveau(niv, entre(2, 12), entre(2, 40), entre(13, 99));
  return { mode:'calcul-tables',
    enonce:'<b>'+b+' × '+f+'</b>',
    question:'Résultat ?',
    reponse: b * f,
    explique: b+' × '+f+' = '+(b*f)+'   (astuce : '+ASTUCES_TABLES[f]+')' };
}
/* Série chronométrée : 10 questions sur la MÊME table (35, 17, 11, 8 ou 5). */
var SERIE_TAILLE = 10;
function exoCalculSerie(niv, facteur){
  var f = FACTEURS_SERIE.indexOf(facteur) >= 0 ? facteur : tire(FACTEURS_SERIE);
  var b = parNiveau(niv, entre(2, 12), entre(2, 30), entre(11, 60));
  return { mode:'calcul-serie', facteur:f,
    enonce:'Table de <b>'+f+'</b> : <b>'+b+' × '+f+'</b>',
    question:'Résultat ?',
    reponse: b * f,
    explique: b+' × '+f+' = '+(b*f)+'   (astuce : '+ASTUCES_TABLES[f]+')' };
}
function exoCalculJetons(niv){
  if (alea() < 0.4){
    var unite = tire(parNiveau(niv, [5,10], [5,10,25], [5,25,50]));
    var nb = parNiveau(niv, entre(2, 10), entre(2, 40), entre(13, 60));
    var somme = unite * nb;
    return { mode:'calcul-jetons',
      enonce:'Le joueur change <b>'+somme+'</b> en jetons de <b>'+unite+'</b>.',
      question:'Combien de jetons lui donnes-tu ?',
      reponse: nb,
      explique: somme+' ÷ '+unite+' = '+nb,
      visuel:{ type:'jetons', piles:[{ v:unite, n:1, label:'jeton de '+unite }] } };
  }
  var valeurs = melange([1,5,10,25,100,500]).slice(0, parNiveau(niv, 2, entre(2, 4), entre(3, 5)));
  var total = 0, lignes = [], calc = [], piles = [];
  valeurs.forEach(function(v){
    var q = parNiveau(niv, entre(1, 5), entre(1, 9), entre(3, 19));
    total += q * v;
    lignes.push('<b>'+q+'</b> × '+v);
    calc.push(q+'×'+v+'='+(q*v));
    piles.push({ v:v, n:q });
  });
  return { mode:'calcul-jetons',
    enonce:'Une pile de jetons :<br>'+lignes.join('<br>'),
    question:'Valeur totale ?',
    reponse: total,
    explique: calc.join('  +  ')+'  =  '+total,
    visuel:{ type:'jetons', piles:piles } };
}
/* Additionner des paiements, comme quand plusieurs pièces gagnent sur un même coup. */
function exoCalculAdditions(niv){
  var k = parNiveau(niv, 2, entre(3, 4), entre(4, 5));
  var u = parNiveau(niv, [1,2,5,10], [1,2,3,5,10], [3,4,6,7,15]);
  var vals = [], calc = [];
  for (var i = 0; i < k; i++){ var r = tire([35,17,11,8,5,2,1]), x = tire(u); vals.push(r*x); calc.push(x+'×'+r); }
  var total = vals.reduce(function(a,b){ return a+b; }, 0);
  return { mode:'calcul-additions',
    enonce:'Additionne ces paiements :<br><b>'+vals.join('</b> + <b>')+'</b>',
    question:'Total ?',
    reponse: total,
    explique: vals.join(' + ')+' = '+total+'   (ce sont '+calc.join(', ')+' : groupe les dizaines d’abord)' };
}
function exoCalculMemoire(niv){
  var n = parNiveau(niv, entre(3, 4), entre(4, 6), entre(6, 8)), l = [];
  for (var i = 0; i < n; i++) l.push(entre(0, 36));
  return { mode:'calcul-memoire', type:'suite', cache: parNiveau(niv, 1300, 1000, 800) * (n - 1),
    enonce:'Retiens ces numéros, dans l’ordre :<br><b class="memo">'+l.join('  ')+'</b>',
    question:'Écris-les dans l’ordre, séparés par des virgules',
    reponse: l,
    explique: 'C’était : '+l.join(' ') };
}

/* ── Les jeux et leurs exercices ─────────────────────────────────────────── */
var JEUX = [
  { id:'roulette',  nom:'Roulette',            icone:'roulette', sous:'Française, un zéro' },
  { id:'blackjack', nom:'Blackjack',           icone:'blackjack', sous:'3 pour 2, split, assurance' },
  { id:'punto',     nom:'Punto Banco',         icone:'punto',    sous:'Points, 3e carte, 5 %' },
  { id:'craps',     nom:'Craps',               icone:'craps',    sous:'Ligne, odds, place, field' },
  { id:'thu',       nom:'Poker Ultimate (THU)',icone:'poker',    sous:'Mains et Blind' },
  { id:'calcul',    nom:'Pré-école',           icone:'calcul',   sous:'Calcul, jetons, mémoire' },
];
var MODES = {
  'roulette':           { jeu:'Roulette',    nom:'Roulette — une mise',       court:'Une mise',              gen:exoRouletteSimple,    libre:true,  objectif:5 },
  'roulette-combinee':  { jeu:'Roulette',    nom:'Roulette — mises cumulées', court:'Mises cumulées',        gen:exoRouletteCombinee,  libre:false, objectif:10 },
  'roulette-tapis':     { jeu:'Roulette',    nom:'Lire le tapis : ramasser, payer', court:'Lire le tapis',  gen:exoRouletteTapis,     libre:false, objectif:15 },
  'roulette-complet':   { jeu:'Roulette',    nom:'Le complet d’un numéro',    court:'Complets',              gen:exoRouletteComplet,   libre:false, objectif:12 },
  'roulette-annonces':  { jeu:'Roulette',    nom:'Annonces (voisins, tiers…)', court:'Annonces',             gen:exoRouletteAnnonces,  libre:false, objectif:10 },
  'roulette-decomposer':{ jeu:'Roulette',    nom:'Décomposer une annonce',    court:'Décomposer',            gen:exoRouletteDecomposer,libre:false, objectif:6 },
  'roulette-finales':   { jeu:'Roulette',    nom:'Finales en plein',          court:'Finales',               gen:exoRouletteFinales,   libre:false, objectif:6 },
  'roulette-cylindre':  { jeu:'Roulette',    nom:'Le cylindre (voisins)',     court:'Le cylindre',           gen:exoRouletteCylindre,  libre:false, objectif:8 },
  'roulette-voisins-n': { jeu:'Roulette',    nom:'Un numéro et ses voisins',  court:'N et ses voisins',      gen:exoRouletteVoisinsN,  libre:false, objectif:8 },
  'blackjack-mains':    { jeu:'Blackjack',   nom:'Compter une main',          court:'Compter une main',      gen:exoBlackjackMains,    libre:true,  objectif:3 },
  'blackjack':          { jeu:'Blackjack',   nom:'Blackjack — le 3 pour 2',   court:'3 pour 2 et assurance', gen:exoBlackjack,         libre:false, objectif:5 },
  'blackjack-resultats':{ jeu:'Blackjack',   nom:'Split, double, égalité',    court:'Split, double, égalité',gen:exoBlackjackResultats,libre:false, objectif:6 },
  'punto-points':       { jeu:'Punto Banco', nom:'Compter les points',        court:'Compter les points',    gen:exoPuntoPoints,       libre:true,  objectif:3 },
  'punto':              { jeu:'Punto Banco', nom:'Punto Banco — les 5 %',     court:'Commission 5 %',        gen:exoPunto,             libre:false, objectif:6 },
  'punto-tirage':       { jeu:'Punto Banco', nom:'La 3e carte',               court:'La 3e carte',           gen:exoPuntoTirage,       libre:false, objectif:4 },
  'punto-egalite':      { jeu:'Punto Banco', nom:'Égalité et paires',         court:'Égalité et paires',     gen:exoPuntoEgalite,      libre:false, objectif:5 },
  'craps-ligne':        { jeu:'Craps',       nom:'Ligne et odds',             court:'Ligne et odds',         gen:exoCrapsLigne,        libre:true,  objectif:6 },
  'craps-place':        { jeu:'Craps',       nom:'Place bets',                court:'Place bets',            gen:exoCrapsPlace,        libre:false, objectif:6 },
  'craps-field':        { jeu:'Craps',       nom:'Le field',                  court:'Field',                 gen:exoCrapsField,        libre:false, objectif:5 },
  'craps-propositions': { jeu:'Craps',       nom:'Propositions (stickman)',   court:'Propositions',          gen:exoCrapsPropositions, libre:false, objectif:5 },
  'thu-mains':          { jeu:'Poker THU',   nom:'Reconnaître la main',       court:'Reconnaître la main',   gen:exoThuMains,          libre:true,  objectif:4 },
  'thu-blind':          { jeu:'Poker THU',   nom:'Payer la Blind',            court:'Payer la Blind',        gen:exoThuBlind,          libre:false, objectif:6 },
  'calcul-tables':      { jeu:'Pré-école',   nom:'Tables du croupier',        court:'Tables du croupier',    gen:exoCalculTables,      libre:true,  objectif:5 },
  'calcul-serie':       { jeu:'Pré-école',   nom:'Série chronométrée (35, 17, 11, 8, 5)', court:'Série chronométrée', gen:exoCalculSerie, libre:false, objectif:4 },
  'calcul-additions':   { jeu:'Pré-école',   nom:'Additionner les paiements', court:'Additions',             gen:exoCalculAdditions,   libre:false, objectif:8 },
  'calcul-jetons':      { jeu:'Pré-école',   nom:'Jetons et monnaie',         court:'Jetons et monnaie',     gen:exoCalculJetons,      libre:false, objectif:8 },
  'calcul-memoire':     { jeu:'Pré-école',   nom:'Mémoire des numéros',       court:'Mémoire',               gen:exoCalculMemoire,     libre:false, objectif:8 },
};
var JEU_DE_MODE = { 'Roulette':'roulette', 'Blackjack':'blackjack', 'Punto Banco':'punto', 'Craps':'craps', 'Poker THU':'thu', 'Pré-école':'calcul' };
/* L'examen blanc : 10 questions tirées dans tout ce qui est ouvert, chronométrées. */
var EXAMEN_TAILLE = 10, EXAMEN_SEUIL = 8;
function modesLibres(){ return Object.keys(MODES).filter(function(k){ return MODES[k].libre && k !== 'examen'; }); }
function exoExamen(niv){
  var k = tire(modesLibres());
  var e = MODES[k].gen(niv);
  e.vraiMode = k;
  return e;
}
MODES.examen = { jeu:'Examen', nom:'Examen blanc — 10 questions', court:'Examen blanc', gen:exoExamen, libre:true, objectif:6 };
var LIBRE_D_ORIGINE = {}; Object.keys(MODES).forEach(function(k){ LIBRE_D_ORIGINE[k] = MODES[k].libre; });

/* ── Le code d'accès (invitation de Kevin ou achat) ─────────────────────────
   Le SEUL appel réseau de la page. On lit le code (?c= puis le rangement de acces.js),
   on demande au worker de vente, et on obéit : la page ne juge jamais le code.
   Rien d'autre n'est envoyé — ni progression, ni erreurs, ni niveau. */
var API_ACCES = 'https://kdmc-vente.9r4rxssx64.workers.dev/acces?c=';
var CLE_CODE = 'kdmc_acces_code';
function lireCodeAcces(){
  var c = '';
  try { c = new URLSearchParams(location.search).get('c') || ''; } catch(e){ c = ''; }
  if (!c){ try { c = localStorage.getItem(CLE_CODE) || ''; } catch(e){ c = ''; } }
  c = String(c).trim().toUpperCase();
  return /^[A-Z0-9-]{4,64}$/.test(c) ? c : '';
}
function accesAccepte(j){ return !!(j && j.ok === true && typeof j.produit === 'string' && j.produit.indexOf('croupier') === 0); }
function ouvreTout(){
  Object.keys(MODES).forEach(function(k){ MODES[k].libre = true; });
  etat.acces = true;
}
function verifieAcces(){
  var code = lireCodeAcces();
  if (!code || typeof fetch !== 'function') return Promise.resolve(false);
  return fetch(API_ACCES + encodeURIComponent(code), { method:'GET', credentials:'omit', cache:'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){
      if (!accesAccepte(j)) return false;
      ouvreTout();
      try { localStorage.setItem(CLE_CODE, code); } catch(e){ /* navigation privée */ }
      try { if (/[?&]c=/.test(location.search)) history.replaceState(history.state, '', location.pathname + location.hash); } catch(e){ /* rien */ }
      if (typeof majVerrous === 'function') majVerrous();
      return true;
    })
    .catch(function(){ return false; });   /* hors ligne ou refus : rien ne change, aucun message */
}

/* ── Progression et erreurs à revoir, gardées sur l'appareil ─────────────── */
var CLE = 'croupier_entrainement_v1';
var CLE_ERREURS = 'croupier_erreurs_v1';
var CLE_JOUR = 'croupier_jour_v1';
var CLE_NIVEAU = 'croupier_niveau_v1';
var MAX_ERREURS = 30;
function litJSON(cle, defaut){ try { return JSON.parse(localStorage.getItem(cle)) || defaut; } catch(e){ return defaut; } }
function ecritJSON(cle, v){ try { localStorage.setItem(cle, JSON.stringify(v)); } catch(e){ /* navigation privée : on continue sans */ } }
function litScore(){ return litJSON(CLE, {}); }
function ecritScore(s){ ecritJSON(CLE, s); }
/* On ne garde que des exercices JOUABLES (mode ouvert) : la révision n'est pas une porte dérobée. */
function litErreurs(){
  var l = litJSON(CLE_ERREURS, []);
  return Array.isArray(l) ? l.filter(function(e){ return e && MODES[e.vraiMode || e.mode] && MODES[e.vraiMode || e.mode].libre; }) : [];
}
function noteErreur(exo){
  var l = litErreurs();
  l.push({ mode:exo.mode, vraiMode:exo.vraiMode, type:exo.type, choix:exo.choix, enonce:exo.enonce,
           question:exo.question, reponse:exo.reponse, explique:exo.explique, visuel:exo.visuel });
  ecritJSON(CLE_ERREURS, l.slice(-MAX_ERREURS));
}
function dateLocale(decalage){
  var d = new Date(Date.now() + (decalage || 0) * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function litJour(){
  var j = litJSON(CLE_JOUR, {});
  if (j.date !== dateLocale()) return { date:dateLocale(), total:0, juste:0, serie:0, meilleure:0,
    jours: j.date === dateLocale(-1) ? (j.jours || 0) : 0 };
  return j;
}
function noteJour(juste){
  var j = litJour();
  if (!j.total) j.jours = (j.jours || 0) + 1;
  j.total++; if (juste){ j.juste++; j.serie++; j.meilleure = Math.max(j.meilleure, j.serie); } else j.serie = 0;
  ecritJSON(CLE_JOUR, j);
  return j;
}
function niveauEcole(k, s){
  var x = s[k]; if (!x || !x.total) return false;
  return Math.round(100 * x.juste / x.total) >= 90 && x.temps / x.total <= MODES[k].objectif;
}

/* ── L'écran ─────────────────────────────────────────────────────────────── */
var etat = { mode:'roulette', exo:null, debut:0, revision:false, minuteur:null, horloge:null, acces:false,
             niveau:'normal', facteur:null, serie:{ juste:0, total:0, temps:0 } };
var $ = function(id){ return document.getElementById(id); };
var V = function(){ return window.__VISUELS || null; };
function el(tag, classe, texte){ var e = document.createElement(tag); if (classe) e.className = classe; if (texte !== undefined) e.textContent = texte; return e; }
function pointeurFin(){ try { return window.matchMedia('(pointer: fine)').matches; } catch(e){ return true; } }

function afficheChoix(exo){
  var boite = $('choix');
  boite.textContent = '';
  var estChoix = exo.type === 'choix';
  boite.hidden = !estChoix;
  $('saisie').hidden = estChoix;
  if (!estChoix) return;
  exo.choix.forEach(function(c){
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn vide choix-btn'; b.textContent = c;
    b.addEventListener('click', function(){ valide(c); });
    boite.appendChild(b);
  });
}

function dessineVisuel(exo, revele){
  var boite = $('visuel'); if (!boite) return;
  boite.textContent = '';
  boite.hidden = !(exo && exo.visuel && V());
  if (boite.hidden) return;
  try { V().dessine(exo.visuel, boite, { revele: !!revele }); }
  catch(e){ boite.hidden = true; }
}

function arreteHorloge(){ if (etat.horloge){ clearInterval(etat.horloge); etat.horloge = null; } }
function demarreHorloge(){
  arreteHorloge();
  var c = $('chrono'); if (!c) return;
  var obj = objectifNiveau(etat.exo && (etat.exo.vraiMode || etat.exo.mode) || etat.mode, etat.niveau);
  var tic = function(){
    var s = (Date.now() - etat.debut) / 1000;
    c.textContent = virgule(s.toFixed(1)) + ' s';
    c.classList.toggle('depasse', !!obj && s > obj);
  };
  tic();
  etat.horloge = setInterval(tic, 100);
}

function nouvelExo(){
  if (etat.minuteur){ clearTimeout(etat.minuteur); etat.minuteur = null; }
  var taille = etat.mode === 'calcul-serie' ? SERIE_TAILLE : EXAMEN_TAILLE;
  if ((etat.mode === 'examen' || etat.mode === 'calcul-serie') && !etat.revision && etat.serie.total >= taille){
    etat.serie = { juste:0, total:0, temps:0 };   /* examen ou série terminé : le suivant repart de zéro */
    etat.facteur = null;
    majScore();
  }
  var erreurs = etat.revision ? litErreurs() : [];
  if (etat.revision && !erreurs.length){ etat.revision = false; majRevision(); }
  if (etat.revision) etat.exo = erreurs[0];
  else if (etat.mode === 'calcul-serie'){
    if (!etat.facteur) etat.facteur = FACTEURS_SERIE[Math.floor(alea()*FACTEURS_SERIE.length)];
    etat.exo = exoCalculSerie(etat.niveau, etat.facteur);
  } else etat.exo = MODES[etat.mode].gen(etat.niveau);
  etat.debut = Date.now();
  $('enonce').innerHTML = etat.exo.enonce;      /* l'énoncé vient du moteur, jamais d'une saisie */
  $('question').textContent = etat.exo.question;
  $('reponse').value = '';
  /* « decimal » partout : sur iPhone le clavier « numeric » n'a ni espace ni virgule, on ne pouvait pas séparer « 32, 15 ». */
  $('reponse').inputMode = 'decimal';
  $('reponse').disabled = false;
  $('valider').disabled = false;
  $('verdict').textContent = '';
  $('verdict').className = 'verdict';
  $('explique').textContent = '';
  $('suivant').hidden = true;
  if ($('objectif')){
    var mc = etat.exo.vraiMode || etat.exo.mode;
    $('objectif').textContent = MODES[mc] ? 'Objectif ' + NIVEAUX[etat.niveau].nom.toLowerCase() + ' : ' + objectifNiveau(mc, etat.niveau) + ' s' : '';
  }
  dessineVisuel(etat.exo, false);
  afficheChoix(etat.exo);
  majPave(true);
  if (etat.exo.cache && !etat.revision){
    /* mémoire : on montre, puis on cache, et le chrono part quand c'est caché */
    $('reponse').disabled = true; $('valider').disabled = true; majPave(false);
    arreteHorloge(); if ($('chrono')) $('chrono').textContent = 'Regarde…';
    etat.minuteur = setTimeout(function(){
      $('enonce').textContent = 'Les numéros sont cachés. À toi.';
      $('reponse').disabled = false; $('valider').disabled = false; majPave(true);
      etat.debut = Date.now();
      demarreHorloge();
      if (pointeurFin()) $('reponse').focus();
    }, etat.exo.cache);
    return;
  }
  demarreHorloge();
  /* Sur iPhone on ne force pas le clavier système : le pavé à l'écran sert au pouce. */
  if (etat.exo.type !== 'choix' && pointeurFin()) $('reponse').focus();
}

function valide(choisi){
  if (!etat.exo || $('valider').disabled) return;
  var e = etat.exo;
  var saisie = e.type === 'choix' ? choisi : $('reponse').value;
  if (e.type !== 'choix'){
    var vide = (e.type === 'liste' || e.type === 'suite') ? !lireNombres(saisie).length
                                                          : isNaN(parseFloat(String(saisie).replace(',', '.')));
    if (vide){ $('verdict').textContent = e.type === 'liste' || e.type === 'suite' ? 'Écris les numéros.' : 'Écris un montant.'; return; }
  } else if (choisi === undefined) return;

  var secondes = (Date.now() - etat.debut) / 1000;
  arreteHorloge();
  var juste = estJuste(e, saisie);
  var modeCompte = e.vraiMode || e.mode;
  var objectif = MODES[modeCompte] ? objectifNiveau(modeCompte, etat.niveau) : 0;

  etat.serie.total++; etat.serie.temps += secondes;
  if (juste) etat.serie.juste++;

  $('reponse').disabled = true;
  $('valider').disabled = true;
  majPave(false);
  [].forEach.call(document.querySelectorAll('.choix-btn'), function(b){
    b.disabled = true;
    if (b.textContent === String(e.reponse)) b.classList.add('bon');
    else if (b.textContent === String(choisi)) b.classList.add('mauvais');
  });
  var msg = juste
    ? '✓ Juste — ' + secondes.toFixed(1) + ' s' + (objectif ? (secondes <= objectif ? ' · dans l’objectif (' + objectif + ' s)' : ' · objectif : ' + objectif + ' s') : '')
    : '✗ Non. La réponse est ' + reponseLisible(e) + '.';
  var taille = etat.mode === 'calcul-serie' ? SERIE_TAILLE : EXAMEN_TAILLE;
  if (etat.mode === 'examen' && !etat.revision && etat.serie.total >= EXAMEN_TAILLE){
    var reussi = etat.serie.juste >= EXAMEN_SEUIL;
    msg += '  — Examen terminé : ' + etat.serie.juste + '/' + etat.serie.total + ', '
         + (etat.serie.temps / etat.serie.total).toFixed(1) + ' s en moyenne. ' + (reussi ? 'Réussi.' : 'Pas encore : il faut ' + EXAMEN_SEUIL + '/10.');
  }
  if (etat.mode === 'calcul-serie' && !etat.revision && etat.serie.total >= taille){
    msg += '  — Série terminée : ' + etat.serie.juste + '/' + taille + ' en ' + etat.serie.temps.toFixed(1) + ' s ('
         + (etat.serie.temps / taille).toFixed(1) + ' s par calcul).';
  }
  $('verdict').textContent = msg;
  $('verdict').className = 'verdict ' + (juste ? 'juste' : 'faux');
  $('explique').textContent = e.explique;
  $('suivant').hidden = false;
  $('suivant').focus();
  if (e.visuel && e.visuel.masque) dessineVisuel(e, true);

  /* erreurs à revoir : une erreur entre dans la liste, une révision juste en sort */
  if (etat.revision){
    var l = litErreurs(); var premier = l.shift();
    if (!juste && premier) l.push(premier);
    ecritJSON(CLE_ERREURS, l);
  } else if (!juste) noteErreur(e);

  var s = litScore();
  var m = s[modeCompte] || { juste:0, total:0, temps:0 };
  m.juste += juste ? 1 : 0; m.total++; m.temps += secondes;
  if (etat.niveau === 'croupier' && juste && secondes <= objectif) m.croupier = (m.croupier || 0) + 1;
  s[modeCompte] = m; ecritScore(s);
  noteJour(juste);
  majScore(); majRevision(); majStats(); majAccueil();
}

function majScore(){
  var se = etat.serie;
  var taille = etat.mode === 'calcul-serie' ? SERIE_TAILLE : EXAMEN_TAILLE;
  $('serie').textContent = se.total
    ? se.juste + ' / ' + se.total + ' · ' + (se.temps/se.total).toFixed(1) + ' s en moyenne'
    : (etat.mode === 'examen' ? 'Examen : 10 questions, il en faut 8 justes'
      : etat.mode === 'calcul-serie' ? 'Série : ' + taille + ' calculs sur la même table, chronométrés' : 'Première question');
  var s = litScore()[etat.mode];
  $('total').textContent = (s && s.total)
    ? 'Depuis le début sur ce mode : ' + Math.round(100*s.juste/s.total) + ' % de justesse sur ' + s.total + ' questions'
    : '';
}

function majRevision(){
  var n = litErreurs().length;
  var b = $('revoir');
  if (!b) return;
  b.hidden = !n && !etat.revision;
  b.textContent = etat.revision ? 'Arrêter la révision (' + n + ' restante' + (n > 1 ? 's' : '') + ')'
                                : 'Revoir mes erreurs (' + n + ')';
  b.setAttribute('aria-pressed', String(etat.revision));
  var b2 = $('revoir-accueil');
  if (b2){ b2.hidden = !n; b2.querySelector('.ligne-sous').textContent = n + ' question' + (n > 1 ? 's' : '') + ' ratée' + (n > 1 ? 's' : '') + ' à refaire'; }
}

function majStats(){
  var boite = $('stats');
  if (!boite) return;
  var s = litScore();
  var cles = Object.keys(MODES).filter(function(k){ return s[k] && s[k].total; });
  boite.textContent = '';
  if (!cles.length){ boite.appendChild(el('li', 'vide', 'Tes résultats apparaîtront ici après tes premières réponses.')); return; }
  cles.forEach(function(k){
    var x = s[k];
    var li = document.createElement('li');
    var pct = Math.round(100 * x.juste / x.total), moy = x.temps / x.total;
    li.appendChild(el('span', 'stat-nom', MODES[k].nom));
    li.appendChild(el('span', 'stat-val', pct + ' % sur ' + x.total + ' · ' + moy.toFixed(1) + ' s'
      + (niveauEcole(k, s) ? ' ✓ niveau école' : '') + (x.croupier ? ' · ' + x.croupier + ' au niveau Croupier' : '')));
    var barre = el('span', 'jauge'); var plein = el('span', 'jauge-plein'); plein.style.width = pct + '%'; barre.appendChild(plein);
    li.appendChild(barre);
    boite.appendChild(li);
  });
}

function majAccueil(){
  var j = litJour(), s = litScore();
  var ecole = Object.keys(MODES).filter(function(k){ return k !== 'examen' && niveauEcole(k, s); }).length;
  var tot = Object.keys(MODES).length - 1;
  if ($('jour-total')) $('jour-total').textContent = String(j.total);
  if ($('jour-juste')) $('jour-juste').textContent = j.total ? Math.round(100 * j.juste / j.total) + ' %' : '—';
  if ($('jour-serie')) $('jour-serie').textContent = String(j.meilleure || 0);
  if ($('jour-jours')) $('jour-jours').textContent = String(j.jours || 0);
  if ($('ecole-compte')) $('ecole-compte').textContent = ecole + ' / ' + tot;
  JEUX.forEach(function(g){
    var b = document.querySelector('[data-jeu="' + g.id + '"] .ligne-sous'); if (!b) return;
    var ks = Object.keys(MODES).filter(function(k){ return JEU_DE_MODE[MODES[k].jeu] === g.id; });
    var libres = ks.filter(function(k){ return MODES[k].libre; }).length;
    var faits = ks.filter(function(k){ return niveauEcole(k, s); }).length;
    b.textContent = ks.length + ' exercices · ' + (libres === ks.length ? 'tous ouverts' : libres + ' gratuit') + (faits ? ' · ' + faits + ' ✓ école' : '');
  });
}

/* Le verrou à l'écran suit TOUJOURS le moteur (MODES[].libre). */
function majVerrous(){
  [].forEach.call(document.querySelectorAll('[data-mode]'), function(b){
    var m = MODES[b.getAttribute('data-mode')];
    b.disabled = !m || !m.libre;
    var cad = b.querySelector('.cadenas');
    if (cad) cad.hidden = !b.disabled;
  });
  var ok = $('acces-ok'); if (ok) ok.hidden = !etat.acces;
  var suite = $('la-suite'); if (suite) suite.hidden = !!etat.acces;
  majAccueil();
}

/* ── Le pavé numérique maison ────────────────────────────────────────────── */
function tapeTouche(t){
  var r = $('reponse');
  if (!r || r.disabled) return;
  if (t === 'ok'){ valide(); return; }
  if (t === 'C') r.value = '';
  else if (t === 'retour') r.value = r.value.slice(0, -1);
  else if (r.value.length < 40) r.value += t;
}
function majPave(actif){
  [].forEach.call(document.querySelectorAll('#pave [data-touche]'), function(b){
    if (b.id !== 'valider') b.disabled = !actif;
  });
}

/* ── Navigation entre écrans (le bouton « retour » de l'iPhone marche) ───── */
function montreEcran(id, pousse){
  [].forEach.call(document.querySelectorAll('.ecran'), function(e){ e.hidden = e.id !== id; });
  if (id !== 'ecran-table'){ arreteHorloge(); if (etat.minuteur){ clearTimeout(etat.minuteur); etat.minuteur = null; } }
  if (pousse){ try { history.pushState({ ecran:id, jeu:etat.jeu, mode:etat.mode }, ''); } catch(e){ /* rien */ } }
  try { window.scrollTo(0, 0); } catch(e){ /* rien */ }
}
function ouvreJeu(id, pousse){
  var g = JEUX.filter(function(x){ return x.id === id; })[0]; if (!g) return;
  etat.jeu = id;
  $('jeu-titre').textContent = g.nom;
  $('jeu-sous').textContent = g.sous;
  var ic = $('jeu-icone'); ic.textContent = ''; if (V()) ic.appendChild(V().icone(g.icone, 40));
  [].forEach.call(document.querySelectorAll('.liste-modes'), function(l){ l.hidden = l.getAttribute('data-liste') !== id; });
  montreEcran('ecran-jeu', pousse !== false);
}
function ouvreLecon(pousse){
  var L = window.__LECONS; var boite = $('lecon-corps'); boite.textContent = '';
  var g = JEUX.filter(function(x){ return x.id === etat.jeu; })[0];
  $('lecon-titre').textContent = 'Apprendre — ' + (g ? g.nom : '');
  if (L && L.fiches[etat.jeu]) L.rendFiche(L.fiches[etat.jeu], boite);
  montreEcran('ecran-lecon', pousse !== false);
}

function changeNiveau(niv){
  if (!NIVEAUX[niv]) return;
  etat.niveau = niv;
  ecritJSON(CLE_NIVEAU, niv);
  [].forEach.call(document.querySelectorAll('[data-niveau]'), function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-niveau') === niv)); });
  if ($('niveau-aide')) $('niveau-aide').textContent = NIVEAUX[niv].aide;
}

function changeMode(mode, pousse){
  if (!MODES[mode] || !MODES[mode].libre) return;
  etat.mode = mode;
  etat.revision = false;
  etat.facteur = null;
  etat.serie = { juste:0, total:0, temps:0 };
  [].forEach.call(document.querySelectorAll('[data-mode]'), function(b){
    b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode));
  });
  var j = JEU_DE_MODE[MODES[mode].jeu]; if (j) etat.jeu = j;
  $('table-titre').textContent = MODES[mode].nom;
  majScore(); majRevision();
  montreEcran('ecran-table', pousse !== false);
  nouvelExo();
}

/* Construit la liste des jeux et des exercices à partir du moteur (une seule source). */
function construitListes(){
  var accueil = $('liste-jeux'), modes = $('modes-jeu');
  if (!accueil || !modes || accueil.childNodes.length) return;
  JEUX.forEach(function(g){
    var b = el('button', 'ligne ligne-jeu'); b.type = 'button'; b.setAttribute('data-jeu', g.id);
    var ic = el('span', 'ligne-icone'); if (V()) ic.appendChild(V().icone(g.icone, 34)); b.appendChild(ic);
    var t = el('span', 'ligne-texte'); t.appendChild(el('span', 'ligne-titre', g.nom)); t.appendChild(el('span', 'ligne-sous', g.sous)); b.appendChild(t);
    b.appendChild(el('span', 'ligne-fleche', '›'));
    b.addEventListener('click', function(){ ouvreJeu(g.id); });
    accueil.appendChild(b);

    var liste = el('div', 'liste-modes'); liste.setAttribute('data-liste', g.id); liste.setAttribute('role', 'group'); liste.setAttribute('aria-label', g.nom); liste.hidden = true;
    Object.keys(MODES).forEach(function(k){
      if (JEU_DE_MODE[MODES[k].jeu] !== g.id) return;
      var bm = el('button', 'ligne mode'); bm.type = 'button'; bm.setAttribute('data-mode', k); bm.setAttribute('aria-pressed', 'false');
      var tt = el('span', 'ligne-texte'); tt.appendChild(el('span', 'ligne-titre', MODES[k].court));
      tt.appendChild(el('span', 'ligne-sous', 'Objectif école : ' + MODES[k].objectif + ' s'));
      bm.appendChild(tt);
      var cad = el('span', 'cadenas'); cad.setAttribute('aria-hidden', 'true'); if (V()) cad.appendChild(V().icone('cadenas', 18)); else cad.textContent = '🔒';
      bm.appendChild(cad);
      bm.appendChild(el('span', 'ligne-fleche', '›'));
      liste.appendChild(bm);
    });
    modes.appendChild(liste);
  });
}

/* Thème : sombre par défaut (le look « table de casino »), clair au choix, gardé sur le téléphone. */
var CLE_THEME = 'croupier_theme_v1';
function appliqueTheme(th){ if (th === 'clair') document.documentElement.setAttribute('data-theme', 'clair'); else document.documentElement.removeAttribute('data-theme'); }
appliqueTheme(litJSON(CLE_THEME, 'sombre'));

function demarre(){
  construitListes();
  [].forEach.call(document.querySelectorAll('[data-icone]'), function(s){ if (V() && !s.firstChild) s.appendChild(V().icone(s.getAttribute('data-icone'), 30)); });
  if ($('theme-bascule')) $('theme-bascule').addEventListener('click', function(){
    var th = document.documentElement.getAttribute('data-theme') === 'clair' ? 'sombre' : 'clair';
    appliqueTheme(th); ecritJSON(CLE_THEME, th);
  });
  var n = litJSON(CLE_NIVEAU, 'normal'); changeNiveau(NIVEAUX[n] ? n : 'normal');
  [].forEach.call(document.querySelectorAll('[data-mode]'), function(b){
    b.addEventListener('click', function(){ changeMode(b.getAttribute('data-mode')); });
  });
  majVerrous();
  [].forEach.call(document.querySelectorAll('[data-niveau]'), function(b){
    b.addEventListener('click', function(){
      changeNiveau(b.getAttribute('data-niveau'));
      etat.serie = { juste:0, total:0, temps:0 }; etat.facteur = null; majScore(); nouvelExo();
    });
  });
  [].forEach.call(document.querySelectorAll('#pave [data-touche]'), function(b){
    if (b.id === 'valider') return;   /* ✓ = le bouton « valider », branché plus bas */
    b.addEventListener('click', function(){ tapeTouche(b.getAttribute('data-touche')); });
  });
  [].forEach.call(document.querySelectorAll('[data-va]'), function(b){
    b.addEventListener('click', function(){
      var va = b.getAttribute('data-va');
      if (va === 'accueil'){ montreEcran('ecran-accueil', true); majAccueil(); }
      else if (va === 'jeu') ouvreJeu(etat.jeu || 'roulette');
      else if (va === 'lecon') ouvreLecon();
      else if (va === 'glossaire'){ montreEcran('ecran-glossaire', true); if (window.__LECONS) window.__LECONS.glossaire(); }
      else if (va === 'progres'){ majStats(); montreEcran('ecran-progres', true); }
    });
  });
  window.addEventListener('popstate', function(ev){
    var s = ev.state || { ecran:'ecran-accueil' };
    if (s.ecran === 'ecran-jeu' && s.jeu) ouvreJeu(s.jeu, false);
    else if (s.ecran === 'ecran-table' && s.mode && MODES[s.mode] && MODES[s.mode].libre) changeMode(s.mode, false);
    else montreEcran(document.getElementById(s.ecran) ? s.ecran : 'ecran-accueil', false);
  });
  $('valider').addEventListener('click', function(){ valide(); });
  $('suivant').addEventListener('click', nouvelExo);
  /* Entrée dans le champ = valider, et RIEN d'autre : sans stopPropagation, le même appui remontait au
     gestionnaire de la page (le curseur venait de passer sur « Suivante ») et sautait la correction (relecture 9.10). */
  $('reponse').addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); valide(); } });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && !$('suivant').hidden && document.activeElement !== $('reponse')){ e.preventDefault(); nouvelExo(); }
  });
  if ($('revoir')) $('revoir').addEventListener('click', function(){
    etat.revision = !etat.revision;
    etat.serie = { juste:0, total:0, temps:0 };
    majScore(); majRevision(); nouvelExo();
  });
  if ($('revoir-accueil')) $('revoir-accueil').addEventListener('click', function(){
    var l = litErreurs(); if (!l.length) return;
    etat.mode = l[0].vraiMode || l[0].mode; $('table-titre').textContent = 'Révision de mes erreurs';
    etat.revision = true; etat.serie = { juste:0, total:0, temps:0 };
    montreEcran('ecran-table', true); majScore(); majRevision(); nouvelExo();
  });
  try { history.replaceState({ ecran:'ecran-accueil' }, ''); } catch(e){ /* rien */ }
  majScore(); majRevision(); majStats(); majAccueil();
  /* un exercice est prêt dès le chargement (écran « table » encore caché) */
  nouvelExo(); arreteHorloge();
  void verifieAcces();   /* gère lui-même tous ses cas (hors ligne, refus) : rien à attendre ici */
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarre);
else demarre();

/* exposé pour les tests (le fichier est chargé tel quel dans un navigateur) */
window.__ENTRAINEUR = { MISES_ROULETTE:MISES_ROULETTE, BLACKJACK:BLACKJACK, COMMISSION_BANCO:COMMISSION_BANCO,
                        CYLINDRE:CYLINDRE, ANNONCES:ANNONCES, PAIE_PAR_COUVERTURE:PAIE_PAR_COUVERTURE, CRAPS:CRAPS,
                        THU_BLIND:THU_BLIND, PUNTO_EXTRA:PUNTO_EXTRA, ROUGES:ROUGES, MODES:MODES, JEUX:JEUX,
                        EXAMEN_TAILLE:EXAMEN_TAILLE, EXAMEN_SEUIL:EXAMEN_SEUIL, SERIE_TAILLE:SERIE_TAILLE,
                        NIVEAUX:NIVEAUX, ORDRE_NIVEAUX:ORDRE_NIVEAUX, JETONS_RONDS:JETONS_RONDS, JETONS_DURS:JETONS_DURS,
                        LIBRE_D_ORIGINE:LIBRE_D_ORIGINE, API_ACCES:API_ACCES,
                        exoRouletteSimple:exoRouletteSimple, exoRouletteCombinee:exoRouletteCombinee,
                        exoRouletteTapis:exoRouletteTapis, exoRouletteComplet:exoRouletteComplet,
                        exoRouletteAnnonces:exoRouletteAnnonces, exoRouletteDecomposer:exoRouletteDecomposer,
                        exoRouletteFinales:exoRouletteFinales, exoRouletteCylindre:exoRouletteCylindre,
                        exoRouletteVoisinsN:exoRouletteVoisinsN, exoBlackjackMains:exoBlackjackMains,
                        exoBlackjack:exoBlackjack, exoBlackjackResultats:exoBlackjackResultats,
                        exoPuntoPoints:exoPuntoPoints, exoPunto:exoPunto, exoPuntoTirage:exoPuntoTirage,
                        exoPuntoEgalite:exoPuntoEgalite, exoCrapsLigne:exoCrapsLigne, exoCrapsPlace:exoCrapsPlace,
                        exoCrapsField:exoCrapsField, exoCrapsPropositions:exoCrapsPropositions,
                        exoThuMains:exoThuMains, exoThuBlind:exoThuBlind,
                        exoCalculTables:exoCalculTables, exoCalculSerie:exoCalculSerie, exoCalculAdditions:exoCalculAdditions,
                        exoCalculJetons:exoCalculJetons, exoCalculMemoire:exoCalculMemoire,
                        exoExamen:exoExamen, estJuste:estJuste, classeMain:classeMain, totalBlackjack:totalBlackjack,
                        pointsBaccara:pointsBaccara, bancoTire:bancoTire, puntoTire:puntoTire, gainAnnonce:gainAnnonce,
                        voisins:voisins, placeMise:placeMise, compositionComplet:compositionComplet,
                        objectifNiveau:objectifNiveau, miseNiveau:miseNiveau,
                        lireCodeAcces:lireCodeAcces, accesAccepte:accesAccepte, verifieAcces:verifieAcces,
                        litErreurs:litErreurs, noteErreur:noteErreur, litJour:litJour, tapeTouche:tapeTouche };
