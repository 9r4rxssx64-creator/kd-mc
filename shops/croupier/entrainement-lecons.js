/* LES LEÇONS DE L'ENTRAÎNEUR — fiches « Apprendre » par jeu, et le glossaire.
 *
 * Ce sont des FAITS de métier. Quand une règle change d'un casino à l'autre, la
 * fiche le DIT et donne la variante la plus courante (ou celle utilisée dans les
 * exercices). Rien n'est inventé : en cas de doute, on n'écrit pas.
 *
 * Rendu : createElement + textContent uniquement (aucune chaîne HTML).
 */
(function(){
  'use strict';

  var FICHES = {
    roulette: {
      intro:'Roulette française ou européenne : un cylindre à 37 cases (0 à 36), un seul zéro. Le croupier paie le GAIN : la mise gagnante reste au joueur.',
      sections:[
        { titre:'Les rapports', tableau:[['Plein (1 numéro)','35 contre 1'],['Cheval (2)','17 contre 1'],['Transversale pleine (3)','11 contre 1'],
          ['Carré (4)','8 contre 1'],['Sixain / transversale simple (6)','5 contre 1'],['Douzaine, colonne (12)','2 contre 1'],['Chances simples (18)','1 contre 1']] },
        { titre:'Les annonces (pièces)', items:[
          'Voisins du zéro : 9 pièces — 0/2/3 (2 pièces), 4/7, 12/15, 18/21, 19/22, 32/35, 25/26/28/29 (2 pièces). 17 numéros, de 22 à 25 en passant par le 0.',
          'Tiers du cylindre : 6 pièces, toutes à cheval — 5/8, 10/11, 13/16, 23/24, 27/30, 33/36. 12 numéros, de 27 à 33.',
          'Orphelins : 5 pièces — le 1 en plein, 6/9, 14/17, 17/20, 31/34. 8 numéros.',
          'Jeu zéro : 4 pièces — 0/3, 12/15, le 26 en plein, 32/35. 7 numéros, de 12 à 15.',
          'Un numéro « et ses voisins » : le numéro et 2 voisins de chaque côté = 5 pleins (avec 3 voisins : 7 pleins).',
          'Finales en plein : finale 0 à 6 = 4 numéros ; finales 7, 8, 9 = 3 numéros.'] },
        { titre:'Le complet d’un numéro', items:[
          'Toutes les mises qui touchent le numéro, en pièces proportionnelles : 1 en plein, 2 par cheval, 3 en transversale, 4 par carré, 6 par sixain.',
          'Numéro de la colonne du milieu (ex. 17) : 40 pièces, il paie 392 fois la pièce. Colonne du bord (ex. 16) : 30 pièces, 294 fois la pièce.',
          'C’est la composition la plus courante ; certaines maisons la présentent autrement. Demande celle de ta maison.'] },
        { titre:'Les gestes, dans l’ordre', items:[
          '« Faites vos jeux » : le joueur mise, on pose les annonces qu’il demande.',
          '« Rien ne va plus » quand la bille ralentit : plus aucune mise.',
          'Annoncer le numéro sorti (ex. « 17, noir, impair et manque ») et poser la marque sur le numéro.',
          'Ramasser d’abord toutes les mises perdantes, puis payer les gagnantes.',
          'Retirer la marque : « Faites vos jeux ».',
          'L’ordre de paiement des gagnantes varie selon la maison (beaucoup d’écoles font payer l’extérieur d’abord et les pleins en dernier) : suis la méthode de ta maison.'] },
        { titre:'Les pièges classiques', items:[
          'Payer la mise en plus du gain : on paie le gain, la mise reste au joueur.',
          'Confondre cheval (17) et transversale (11), ou carré (8) et sixain (5).',
          'Oublier que 0/2/3 et 25/26/28/29 prennent 2 pièces aux voisins.',
          'Le 17 est dans DEUX chevaux des orphelins (14/17 et 17/20) : il paie deux fois.',
          'Le zéro sur les chances simples : selon la maison, la mise est « en prison » ou on rend la moitié. Ce n’est pas une perte comme une autre.'] },
      ],
    },
    blackjack: {
      intro:'Le joueur veut s’approcher de 21 sans dépasser, mieux que le croupier. Les cartes de 2 à 10 valent leur chiffre, les figures 10, l’as 1 ou 11.',
      sections:[
        { titre:'Les rapports', tableau:[['Main gagnante','1 contre 1'],['Blackjack (as + 10 en deux cartes)','3 pour 2 (la mise + sa moitié)'],
          ['Assurance (si le croupier a blackjack)','2 contre 1'],['Égalité (push)','rien : la mise reste'],['As + 10 après séparation','21, payé 1 contre 1']] },
        { titre:'Les règles du croupier', items:[
          'Le croupier tire jusqu’à 16 et reste à partir de 17.',
          '17 « souple » (avec un as compté 11) : selon la maison, le croupier reste ou tire. C’est écrit sur le tapis.',
          'Dans beaucoup de casinos européens, le croupier ne prend qu’une carte avant que les joueurs jouent (pas de carte cachée).',
          'Certaines tables paient le blackjack 6 pour 5 au lieu de 3 pour 2 : lis toujours le tapis.'] },
        { titre:'Doubler, séparer, assurer', items:[
          'Doubler : le joueur double sa mise et reçoit UNE seule carte. Il gagne → on paie la mise doublée.',
          'Séparer (split) : une paire devient deux mains, chacune avec la mise de départ. Chaque main se paie à part.',
          'Après séparation, as + figure vaut 21, pas blackjack : payé 1 contre 1.',
          'Assurance : proposée quand le croupier montre un as, jusqu’à la moitié de la mise. Elle paie 2 contre 1 si le croupier a blackjack.'] },
        { titre:'Les gestes', items:[
          'Le joueur demande une carte en tapant la table, et reste d’un geste horizontal de la main au-dessus de ses cartes.',
          'Le croupier annonce chaque total à voix haute (« 14 », « 7 ou 17 » pour une main souple).',
          'On règle les mains une par une, dans l’ordre fixé par la maison, sans jamais mélanger deux mains séparées.'] },
        { titre:'Les pièges classiques', items:[
          '3 pour 2 sur une mise impaire : 15 → 22,5 (la mise plus sa moitié).',
          'Payer un blackjack après séparation comme un vrai blackjack.',
          'Égalité : on ne paie rien et on ne ramasse rien.',
          'L’as compté 11 quand il fait dépasser 21 : il redevient 1.'] },
      ],
    },
    punto: {
      intro:'Deux mains, Punto et Banco ; celle qui s’approche le plus de 9 gagne. On ne garde que le chiffre des unités : 7 + 8 = 15 → 5 points.',
      sections:[
        { titre:'Les valeurs', items:['As = 1, 2 à 9 = leur chiffre, 10 et figures = 0.', 'Naturel : 8 ou 9 avec deux cartes. Personne ne tire.'] },
        { titre:'Les rapports', tableau:[['Punto','1 contre 1'],['Banco','1 contre 1, moins 5 % de commission'],['Égalité','8 contre 1 (le plus courant ; parfois 9 contre 1)'],
          ['Paire Punto ou Banco','11 contre 1 (le plus courant)'],['Punto ou Banco sur une égalité','la mise reste au joueur']] },
        { titre:'La 3e carte', items:[
          'Le Punto tire de 0 à 5, reste à 6 et 7.',
          'Si le Punto est resté, le Banco tire de 0 à 5.',
          'Sinon, selon la 3e carte du Punto : Banco 0-1-2 tire toujours ; 3 tire sauf sur un 8 ; 4 tire sur 2 à 7 ; 5 tire sur 4 à 7 ; 6 tire sur 6 ou 7 ; 7 reste.'] },
        { titre:'Les gestes', items:[
          'Le croupier annonce les points de chaque main, puis la règle (« le Punto tire », « le Banco reste »).',
          'La commission de 5 % est prise sur le paiement ou comptée à part, selon la maison.',
          'On ramasse les perdants, puis on paie ; sur une égalité, on ne touche pas aux mises Punto et Banco.'] },
        { titre:'Les pièges classiques', items:[
          '5 % = un dixième, divisé par deux : 340 → 34 → 17 → on paie 323.',
          'Ramasser les mises Punto/Banco sur une égalité.',
          'Compter 10 points au lieu de 0 pour une figure.'] },
      ],
    },
    craps: {
      intro:'Deux dés. Au premier jet (come-out), 7 ou 11 fait gagner la ligne, 2, 3 ou 12 la fait perdre ; tout autre total devient le POINT, qui doit sortir avant le 7.',
      sections:[
        { titre:'Les rapports (contre 1)', tableau:[['Pass line, come, don’t pass','1 contre 1'],['Odds 4 et 10','2 contre 1'],['Odds 5 et 9','3 contre 2'],['Odds 6 et 8','6 contre 5'],
          ['Place 4 et 10','9 pour 5'],['Place 5 et 9','7 pour 5'],['Place 6 et 8','7 pour 6'],['Any seven','4 contre 1'],['Any craps','7 contre 1'],
          ['Hard 4, hard 10','7 contre 1'],['Hard 6, hard 8','9 contre 1'],['Onze (yo)','15 contre 1'],['Deux, douze','30 contre 1']] },
        { titre:'Le field', items:[
          'Un seul jet : 2, 3, 4, 9, 10, 11, 12 gagnent ; 5, 6, 7, 8 perdent.',
          'Variante utilisée dans les exercices : 2 et 12 paient double, les autres 1 contre 1.',
          'Beaucoup de maisons paient le 12 (ou le 2) triple : lis le tapis de ta table.'] },
        { titre:'« Pour » et « contre »', items:[
          '« 5 pour 1 » veut dire 4 contre 1 : la mise est comprise dans le « pour ».',
          'Les odds sont payés à la vraie cote, sans avantage pour la maison : on demande des mises qui se divisent juste (multiples de 5 sur 6 et 8, de 2 sur 5 et 9).',
          'Place 6 et 8 : par multiples de 6 (6 → 7, 12 → 14, 30 → 35).'] },
        { titre:'Les gestes', items:[
          'Le stickman annonce le total des dés et gère les propositions au centre ; le boxman surveille ; les croupiers de base paient la ligne, les odds et les places.',
          'Le don’t pass : le 12 au come-out est « barré » (égalité) dans la plupart des casinos.'] },
        { titre:'Les pièges classiques', items:[
          'Confondre la cote des odds (6 contre 5) et celle des places (7 pour 6) sur le 6 et le 8.',
          'Payer « pour 1 » au lieu de « contre 1 ».'] },
      ],
    },
    thu: {
      intro:'Ultimate Texas Hold’em : le joueur pose l’Ante et la Blind (égales), puis peut miser Play (3 ou 4 fois l’Ante avant le flop, 2 fois au flop, 1 fois à la fin).',
      sections:[
        { titre:'L’ordre des mains', items:['Quinte flush royale > quinte flush > carré > full > couleur > quinte > brelan > double paire > paire > carte haute.',
          'La quinte la plus basse est A-2-3-4-5 ; la plus haute 10-V-D-R-A.'] },
        { titre:'La Blind (table la plus répandue)', tableau:[['Quinte flush royale','500 contre 1'],['Quinte flush','50 contre 1'],['Carré','10 contre 1'],['Full','3 contre 1'],
          ['Couleur','3 pour 2'],['Quinte','1 contre 1'],['Moins qu’une quinte (joueur gagnant)','égalité : la Blind reste']] },
        { titre:'Ante et Play', items:[
          'Le croupier se qualifie avec au moins une paire. Non qualifié : l’Ante est rendu (égalité), Play et Blind se jouent normalement.',
          'Play et Ante gagnants paient 1 contre 1.',
          'La table de la Blind peut changer d’un casino à l’autre : vérifie celle de ta maison.'] },
        { titre:'Les pièges classiques', items:['Payer la Blind sur une double paire ou un brelan (elle reste).', 'Couleur 3 pour 2 : 30 → 45.'] },
      ],
    },
    calcul: {
      intro:'Ce que les écoles testent avant même les jeux : le calcul mental rapide, compter des jetons, retenir des numéros.',
      sections:[
        { titre:'Les tables du croupier', items:[
          '× 35 : multiplie par 36, retire une mise. 12 × 35 = 432 − 12 = 420.',
          '× 17 : multiplie par 18, retire une mise. 7 × 17 = 126 − 7 = 119.',
          '× 11 : multiplie par 10, ajoute une mise. 23 × 11 = 230 + 23 = 253.',
          '× 8 : double trois fois. 15 → 30 → 60 → 120.',
          '× 5 : multiplie par 10, divise par deux. 46 × 5 = 460 ÷ 2 = 230.'] },
        { titre:'Les jetons', items:[
          'Les couleurs des jetons changent d’une maison à l’autre : apprends celles de la tienne. Ici, une couleur par valeur, toujours la même.',
          'Compte une pile par valeur, puis additionne les valeurs en commençant par la plus grosse.',
          'Additionner des paiements : groupe d’abord les dizaines rondes (35 + 17 + 8 = 35 + 25 = 60).'] },
        { titre:'La mémoire', items:['Récite le cylindre par blocs de quatre, tous les jours.', 'Retiens les numéros deux par deux : « 7-28 », « 12-35 ».'] },
      ],
    },
  };

  /* Glossaire : FR, EN, et IT seulement quand le terme italien est sûr. */
  var CATEGORIES = [
    { id:'tout', nom:'Tout' }, { id:'roulette', nom:'Roulette' }, { id:'blackjack', nom:'Blackjack' }, { id:'punto', nom:'Punto' },
    { id:'craps', nom:'Craps' }, { id:'poker', nom:'Poker' }, { id:'general', nom:'Table' }, { id:'calcul', nom:'Astuces' },
  ];
  var GLOSSAIRE = [
    { fr:'Plein', en:'Straight up', it:'Pieno', cat:'roulette', def:'Un seul numéro, payé 35 contre 1.' },
    { fr:'Cheval', en:'Split', it:'Cavallo', cat:'roulette', def:'Deux numéros voisins sur le tapis, payé 17 contre 1.' },
    { fr:'Transversale pleine', en:'Street', it:'Terzina', cat:'roulette', def:'Une ligne de trois numéros, payée 11 contre 1.' },
    { fr:'Carré', en:'Corner', it:'Quartina', cat:'roulette', def:'Quatre numéros qui se touchent, payé 8 contre 1.' },
    { fr:'Sixain', en:'Six line', it:'Sestina', cat:'roulette', def:'Deux lignes, six numéros (aussi « transversale simple »), payé 5 contre 1.' },
    { fr:'Douzaine', en:'Dozen', it:'Dozzina', cat:'roulette', def:'1 à 12, 13 à 24 ou 25 à 36, payée 2 contre 1.' },
    { fr:'Colonne', en:'Column', it:'Colonna', cat:'roulette', def:'Douze numéros d’une colonne du tapis, payée 2 contre 1.' },
    { fr:'Rouge / Noir', en:'Red / Black', it:'Rosso / Nero', cat:'roulette', def:'Chance simple, payée 1 contre 1.' },
    { fr:'Pair / Impair', en:'Even / Odd', it:'Pari / Dispari', cat:'roulette', def:'Chance simple, payée 1 contre 1. Le zéro n’est ni pair ni impair pour le jeu.' },
    { fr:'Manque / Passe', en:'Low / High', cat:'roulette', def:'1 à 18 / 19 à 36. Chance simple, payée 1 contre 1.' },
    { fr:'Voisins du zéro', en:'Neighbours of zero', it:'Vicini dello zero', cat:'roulette', def:'Annonce de 9 pièces, de 22 à 25 sur le cylindre.' },
    { fr:'Tiers du cylindre', en:'Tiers', cat:'roulette', def:'Annonce de 6 chevaux, de 27 à 33 : 5/8, 10/11, 13/16, 23/24, 27/30, 33/36.' },
    { fr:'Orphelins', en:'Orphans', it:'Orfanelli', cat:'roulette', def:'Annonce de 5 pièces : 1, 6/9, 14/17, 17/20, 31/34.' },
    { fr:'Jeu zéro', en:'Zero game (zero spiel)', cat:'roulette', def:'Annonce de 4 pièces : 0/3, 12/15, 26, 32/35.' },
    { fr:'Finale', en:'Finals', cat:'roulette', def:'Tous les numéros qui finissent par le même chiffre.' },
    { fr:'Complet', en:'Complete bet', cat:'roulette', def:'Toutes les mises autour d’un numéro, en pièces proportionnelles (1-2-3-4-6).' },
    { fr:'Cylindre', en:'Wheel', cat:'roulette', def:'La roue où tourne la bille : 37 cases, un zéro.' },
    { fr:'Marque', en:'Dolly (marker)', cat:'roulette', def:'Le repère posé sur le numéro sorti pendant qu’on ramasse et qu’on paie.' },
    { fr:'Rien ne va plus', en:'No more bets', cat:'roulette', def:'L’annonce qui ferme les mises quand la bille ralentit.' },
    { fr:'Blackjack', en:'Blackjack', cat:'blackjack', def:'As + carte de valeur 10 dans les deux premières cartes. Payé 3 pour 2.' },
    { fr:'Doubler', en:'Double down', cat:'blackjack', def:'Doubler sa mise contre une seule carte de plus.' },
    { fr:'Séparer', en:'Split', cat:'blackjack', def:'Faire deux mains d’une paire, chacune avec la mise de départ.' },
    { fr:'Assurance', en:'Insurance', cat:'blackjack', def:'Mise jusqu’à la moitié de la mise, quand le croupier montre un as. Payée 2 contre 1.' },
    { fr:'Égalité', en:'Push (stand-off)', cat:'blackjack', def:'Même total : rien n’est payé ni ramassé.' },
    { fr:'Main souple', en:'Soft hand', cat:'blackjack', def:'Main où un as compte 11 sans dépasser 21 (« 7 ou 17 »).' },
    { fr:'Brûler', en:'Bust', cat:'blackjack', def:'Dépasser 21 : la main perd.' },
    { fr:'Sabot', en:'Shoe', cat:'general', def:'La boîte d’où sortent les cartes.' },
    { fr:'Naturel', en:'Natural', cat:'punto', def:'8 ou 9 points avec deux cartes : personne ne tire.' },
    { fr:'Commission', en:'Commission', cat:'punto', def:'5 % prélevés sur un Banco gagnant.' },
    { fr:'Égalité (punto)', en:'Tie', cat:'punto', def:'Même nombre de points. Payée 8 contre 1 le plus souvent ; les mises Punto et Banco restent.' },
    { fr:'Paire', en:'Pair', cat:'punto', def:'Les deux premières cartes d’une main de même rang. Payée 11 contre 1 le plus souvent.' },
    { fr:'Point', en:'Point', cat:'craps', def:'Au craps, le total à refaire avant le 7.' },
    { fr:'Ligne (pass line)', en:'Pass line', cat:'craps', def:'Le pari principal : gagne sur 7/11 au come-out ou si le point revient avant le 7.' },
    { fr:'Odds', en:'Odds', cat:'craps', def:'Mise derrière la ligne, payée à la vraie cote (2:1, 3:2, 6:5).' },
    { fr:'Field', en:'Field', cat:'craps', def:'Un seul jet : 2, 3, 4, 9, 10, 11, 12 gagnent. Le 2 et le 12 paient plus (double ou triple selon la maison).' },
    { fr:'Hardway', en:'Hardway', cat:'craps', def:'Un total fait par une paire (2+2, 3+3, 4+4, 5+5) avant le 7 ou la façon « facile ».' },
    { fr:'Stickman', en:'Stickman', cat:'craps', def:'Le croupier au bâton : annonce les dés, gère les propositions.' },
    { fr:'Blind', en:'Blind', cat:'poker', def:'Au poker Ultimate, mise obligatoire qui paie selon la main, dès la quinte.' },
    { fr:'Ante', en:'Ante', cat:'poker', def:'Mise de départ, égale à la Blind. Rendue si le croupier ne se qualifie pas.' },
    { fr:'Quinte', en:'Straight', cat:'poker', def:'Cinq cartes qui se suivent, de couleurs mélangées.' },
    { fr:'Couleur', en:'Flush', cat:'poker', def:'Cinq cartes de la même couleur (même enseigne).' },
    { fr:'Full', en:'Full house', cat:'poker', def:'Un brelan et une paire.' },
    { fr:'Brelan', en:'Three of a kind', cat:'poker', def:'Trois cartes de même rang.' },
    { fr:'Carré (poker)', en:'Four of a kind', cat:'poker', def:'Quatre cartes de même rang.' },
    { fr:'Croupier', en:'Dealer', it:'Croupier', cat:'general', def:'Celui qui mène le jeu, ramasse et paie.' },
    { fr:'Chef de table', en:'Inspector / pit boss', cat:'general', def:'Surveille la table et tranche les litiges.' },
    { fr:'Plaque', en:'Plaque', cat:'general', def:'Jeton rectangulaire de grosse valeur.' },
    { fr:'× 35', en:'× 35', cat:'calcul', def:'× 36 puis retirer une mise : 12 × 35 = 432 − 12 = 420.' },
    { fr:'× 17', en:'× 17', cat:'calcul', def:'× 18 puis retirer une mise : 7 × 17 = 126 − 7 = 119.' },
    { fr:'× 11', en:'× 11', cat:'calcul', def:'× 10 puis ajouter une mise : 23 × 11 = 253.' },
    { fr:'× 8', en:'× 8', cat:'calcul', def:'Doubler trois fois : 15 → 30 → 60 → 120.' },
    { fr:'3 pour 2', en:'3 to 2', cat:'calcul', def:'La mise plus sa moitié : 35 → 52,5.' },
    { fr:'5 %', en:'5 %', cat:'calcul', def:'Un dixième, divisé par deux : 340 → 34 → 17.' },
    { fr:'6 contre 5', en:'6 to 5', cat:'calcul', def:'Un cinquième ajouté à la mise : 25 → 5 → 30.' },
  ];

  function el(tag, classe, texte){ var e = document.createElement(tag); if (classe) e.className = classe; if (texte !== undefined) e.textContent = texte; return e; }
  function rendFiche(f, boite){
    boite.appendChild(el('p', 'lecon-intro', f.intro));
    f.sections.forEach(function(sec){
      var bloc = el('section', 'lecon-bloc');
      bloc.appendChild(el('h3', 'lecon-h', sec.titre));
      if (sec.tableau){
        var tb = el('table', 'rapports'), corps = el('tbody');
        sec.tableau.forEach(function(r){ var tr = el('tr'); tr.appendChild(el('td', '', r[0])); tr.appendChild(el('td', 'rapport', r[1])); corps.appendChild(tr); });
        tb.appendChild(corps); bloc.appendChild(tb);
      }
      if (sec.items){ var ul = el('ul', 'lecon-liste'); sec.items.forEach(function(i){ ul.appendChild(el('li', '', i)); }); bloc.appendChild(ul); }
      boite.appendChild(bloc);
    });
  }

  var etatG = { cat:'tout', langue:'en', q:'' };
  function sansAccent(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function filtre(){
    var q = sansAccent(etatG.q).trim();
    return GLOSSAIRE.filter(function(g){
      if (etatG.cat !== 'tout' && g.cat !== etatG.cat) return false;
      if (!q) return true;
      return sansAccent(g.fr + ' ' + g.en + ' ' + (g.it || '') + ' ' + g.def).indexOf(q) >= 0;
    });
  }
  function rendGlossaire(){
    var dl = document.getElementById('gloss-liste'); if (!dl) return;
    dl.textContent = '';
    var l = filtre();
    l.forEach(function(g){
      var dt = el('dt', '', g.fr);
      var trad = etatG.langue === 'it' ? g.it : etatG.langue === 'fr' ? null : g.en;
      var dd = el('dd');
      if (trad) dd.appendChild(el('span', 'gloss-trad', (etatG.langue === 'it' ? 'IT · ' : 'EN · ') + trad));
      else if (etatG.langue === 'it') dd.appendChild(el('span', 'gloss-trad absent', 'IT · terme non fourni (pas de traduction sûre)'));
      dd.appendChild(el('span', 'gloss-def', g.def));
      dl.appendChild(dt); dl.appendChild(dd);
    });
    var n = document.getElementById('gloss-compte');
    if (n) n.textContent = l.length + ' terme' + (l.length > 1 ? 's' : '');
    if (!l.length) dl.appendChild(el('dt', 'vide', 'Aucun terme ne correspond.'));
  }
  function initGlossaire(){
    var cats = document.getElementById('gloss-cats'), langues = document.getElementById('gloss-langues'), q = document.getElementById('gloss-recherche');
    if (!cats || cats.childNodes.length) { rendGlossaire(); return; }
    CATEGORIES.forEach(function(c){
      var b = el('button', 'pastille', c.nom); b.type = 'button'; b.setAttribute('data-cat', c.id); b.setAttribute('aria-pressed', String(c.id === etatG.cat));
      b.addEventListener('click', function(){ etatG.cat = c.id; [].forEach.call(cats.children, function(x){ x.setAttribute('aria-pressed', String(x === b)); }); rendGlossaire(); });
      cats.appendChild(b);
    });
    [['fr','FR'],['en','EN'],['it','IT']].forEach(function(lg){
      var b = el('button', 'pastille langue', lg[1]); b.type = 'button'; b.setAttribute('data-langue', lg[0]); b.setAttribute('aria-pressed', String(lg[0] === etatG.langue));
      b.addEventListener('click', function(){ etatG.langue = lg[0]; [].forEach.call(langues.children, function(x){ x.setAttribute('aria-pressed', String(x === b)); }); rendGlossaire(); });
      langues.appendChild(b);
    });
    if (q) q.addEventListener('input', function(){ etatG.q = q.value; rendGlossaire(); });
    rendGlossaire();
  }

  window.__LECONS = { fiches:FICHES, glossaireDonnees:GLOSSAIRE, categories:CATEGORIES, rendFiche:rendFiche, glossaire:initGlossaire };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGlossaire);
  else initGlossaire();
})();
