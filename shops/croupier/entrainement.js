/* L'ENTRAÎNEUR DE PAIEMENTS — croupier.kd-mc.com/entrainement.html
 *
 * L'exercice que les écoles de jeux testent réellement : une mise sur la table,
 * un numéro qui sort, et le paiement à annoncer juste, vite.
 *
 * Tout est calculé ici, dans le navigateur. Aucun réseau, aucune donnée envoyée
 * nulle part, aucun compte. Ce qu'on garde (ta progression) reste sur ton téléphone.
 *
 * Les rapports sont des FAITS, pas des réglages : ils sont figés ici et vérifiés
 * par tests/croupier-entrainement.test.mjs.
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
var BLACKJACK = { blackjack:1.5, gagnante:1, assurance:2 };
var COMMISSION_BANCO = 0.05;

/* Jetons plausibles à une table : on ne s'entraîne pas sur des nombres ronds,
   c'est justement là que les erreurs arrivent. */
var JETONS = [1,2,3,4,5,6,7,8,9,10,15,20,25,30,35,40,45,50,75,100,125,150,200,250,500];
function tire(liste){ return liste[Math.floor(Math.random()*liste.length)]; }
function tireJeton(max){ var ok = JETONS.filter(function(j){ return !max || j<=max; }); return tire(ok); }

/* ── Génération des exercices ────────────────────────────────────────────── */
function exoRouletteSimple(){
  var m = tire(MISES_ROULETTE);
  var mise = tireJeton(m.paie >= 11 ? 25 : 200);   /* on ne met pas 500 en plein */
  return {
    mode:'roulette',
    enonce:'<b>'+m.nom+'</b> — '+m.aide+'<br>Mise de <b>'+mise+'</b>. Elle gagne.',
    question:'Tu paies combien ?',
    reponse: mise * m.paie,
    explique: mise+' × '+m.paie+' = '+(mise*m.paie)+'  ('+m.nom.toLowerCase()+' paie '+m.paie+' pour 1)',
  };
}

function exoRouletteCombinee(){
  var n = 2 + Math.floor(Math.random()*2);          /* 2 ou 3 mises gagnantes */
  var choix = MISES_ROULETTE.slice().sort(function(){ return Math.random()-0.5; }).slice(0, n);
  var lignes = [], total = 0, detail = [];
  choix.forEach(function(m){
    var mise = tireJeton(m.paie >= 11 ? 20 : 100);
    var gain = mise * m.paie;
    total += gain;
    lignes.push('<b>'+mise+'</b> en '+m.nom.toLowerCase());
    detail.push(mise+'×'+m.paie+'='+gain);
  });
  return {
    mode:'roulette-combinee',
    enonce:'Le numéro sort. Ces mises gagnent :<br>'+lignes.join('<br>'),
    question:'Total à payer ?',
    reponse: total,
    explique: detail.join('  +  ')+'  =  '+total,
  };
}

function exoBlackjack(){
  var cas = tire(['blackjack','blackjack','blackjack','gagnante','assurance']);
  var mise = tireJeton(250);
  if (cas === 'blackjack'){
    /* le 3 pour 2 sur mise impaire : le vrai piège du métier */
    return { mode:'blackjack',
      enonce:'<b>Blackjack du joueur.</b><br>Mise de <b>'+mise+'</b>.',
      question:'Tu paies combien ?',
      reponse: mise * BLACKJACK.blackjack,
      explique: mise+' × 3 ÷ 2 = '+(mise*1.5)+'   (le blackjack paie 3 pour 2)' };
  }
  if (cas === 'assurance'){
    return { mode:'blackjack',
      enonce:'<b>Assurance</b> prise pour <b>'+mise+'</b>. Le croupier a blackjack.',
      question:'Tu paies combien ?',
      reponse: mise * BLACKJACK.assurance,
      explique: mise+' × 2 = '+(mise*2)+'   (l’assurance paie 2 pour 1)' };
  }
  return { mode:'blackjack',
    enonce:'<b>Main gagnante ordinaire.</b><br>Mise de <b>'+mise+'</b>.',
    question:'Tu paies combien ?',
    reponse: mise * BLACKJACK.gagnante,
    explique: mise+' × 1 = '+mise+'   (une main ordinaire paie 1 pour 1)' };
}

function exoPunto(){
  var mise = tireJeton(500);
  if (Math.random() < 0.6){
    var net = mise * (1 - COMMISSION_BANCO);
    return { mode:'punto',
      enonce:'<b>Banco</b> gagne. Mise de <b>'+mise+'</b>.',
      question:'Tu paies combien, commission déduite ?',
      reponse: net,
      explique: mise+' − 5 % = '+mise+' − '+(mise*COMMISSION_BANCO)+' = '+net };
  }
  return { mode:'punto',
    enonce:'<b>Punto</b> gagne. Mise de <b>'+mise+'</b>.',
    question:'Tu paies combien ?',
    reponse: mise,
    explique: mise+' × 1 = '+mise+'   (Punto paie 1 pour 1, sans commission)' };
}

var MODES = {
  'roulette':          { nom:'Roulette — une mise',     gen:exoRouletteSimple,   libre:true  },
  'roulette-combinee': { nom:'Roulette — mises cumulées', gen:exoRouletteCombinee, libre:false },
  'blackjack':         { nom:'Blackjack — le 3 pour 2', gen:exoBlackjack,        libre:false },
  'punto':             { nom:'Punto Banco — les 5 %',   gen:exoPunto,            libre:false },
};

/* ── Progression, gardée sur l'appareil ──────────────────────────────────── */
var CLE = 'croupier_entrainement_v1';
function litScore(){
  try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch(e){ return {}; }
}
function ecritScore(s){
  try { localStorage.setItem(CLE, JSON.stringify(s)); } catch(e){ /* navigation privée : on continue sans */ }
}

/* ── L'écran ─────────────────────────────────────────────────────────────── */
var etat = { mode:'roulette', exo:null, debut:0, serie:{ juste:0, total:0, temps:0 } };
var $ = function(id){ return document.getElementById(id); };

function nouvelExo(){
  etat.exo = MODES[etat.mode].gen();
  etat.debut = Date.now();
  $('enonce').innerHTML = etat.exo.enonce;
  $('question').textContent = etat.exo.question;
  $('reponse').value = '';
  $('reponse').disabled = false;
  $('valider').disabled = false;
  $('verdict').textContent = '';
  $('verdict').className = 'verdict';
  $('explique').textContent = '';
  $('suivant').hidden = true;
  $('reponse').focus();
}

function valide(){
  if (!etat.exo || $('reponse').disabled) return;
  var saisi = parseFloat(String($('reponse').value).replace(',', '.').trim());
  if (isNaN(saisi)) { $('verdict').textContent = 'Écris un montant.'; return; }
  var secondes = (Date.now() - etat.debut) / 1000;
  var juste = Math.abs(saisi - etat.exo.reponse) < 0.005;

  etat.serie.total++; etat.serie.temps += secondes;
  if (juste) etat.serie.juste++;

  $('reponse').disabled = true;
  $('valider').disabled = true;
  $('verdict').textContent = juste
    ? '✓ Juste — ' + secondes.toFixed(1) + ' s'
    : '✗ Non. La réponse est ' + etat.exo.reponse + '.';
  $('verdict').className = 'verdict ' + (juste ? 'juste' : 'faux');
  $('explique').textContent = etat.exo.explique;
  $('suivant').hidden = false;
  $('suivant').focus();

  var s = litScore();
  var m = s[etat.mode] || { juste:0, total:0, temps:0 };
  m.juste += juste ? 1 : 0; m.total++; m.temps += secondes;
  s[etat.mode] = m; ecritScore(s);
  majScore();
}

function majScore(){
  var se = etat.serie;
  $('serie').textContent = se.total
    ? se.juste + ' / ' + se.total + ' · ' + (se.temps/se.total).toFixed(1) + ' s en moyenne'
    : 'Première question';
  var s = litScore()[etat.mode];
  $('total').textContent = (s && s.total)
    ? 'Depuis le début sur ce mode : ' + Math.round(100*s.juste/s.total) + ' % de justesse sur ' + s.total + ' questions'
    : '';
}

function changeMode(mode){
  if (!MODES[mode] || !MODES[mode].libre) return;
  etat.mode = mode;
  etat.serie = { juste:0, total:0, temps:0 };
  [].forEach.call(document.querySelectorAll('[data-mode]'), function(b){
    b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode));
  });
  majScore();
  nouvelExo();
}

function demarre(){
  [].forEach.call(document.querySelectorAll('[data-mode]'), function(b){
    var m = MODES[b.getAttribute('data-mode')];
    /* Le moteur est la SEULE source du verrou : le bouton reflète MODES[].libre.
       Sans ça, l'attribut disabled du HTML et le drapeau du moteur pourraient
       diverger sans que rien ne le signale. */
    b.disabled = !m || !m.libre;
    var cad = b.querySelector('.cadenas');
    if (cad) cad.hidden = !b.disabled;
    if (b.disabled) return;
    b.addEventListener('click', function(){ changeMode(b.getAttribute('data-mode')); });
  });
  $('valider').addEventListener('click', valide);
  $('suivant').addEventListener('click', nouvelExo);
  $('reponse').addEventListener('keydown', function(e){ if (e.key === 'Enter') valide(); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && !$('suivant').hidden) nouvelExo();
  });
  majScore();
  nouvelExo();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarre);
else demarre();

/* exposé pour les tests (le fichier est chargé tel quel dans un navigateur) */
window.__ENTRAINEUR = { MISES_ROULETTE:MISES_ROULETTE, BLACKJACK:BLACKJACK, COMMISSION_BANCO:COMMISSION_BANCO,
                        MODES:MODES, exoRouletteSimple:exoRouletteSimple, exoRouletteCombinee:exoRouletteCombinee,
                        exoBlackjack:exoBlackjack, exoPunto:exoPunto };
