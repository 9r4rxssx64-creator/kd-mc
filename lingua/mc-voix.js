/* 🇲🇨 LA VOIX DU MONÉGASQUE — Kevin 2026-08-13 : « Pour la voix, trouve une solution.
   Il n'existe pas de vraie voix à utiliser ? Va plus loin ».

   LE PROBLÈME : aucun moteur de synthèse au monde ne parle monégasque. Lui donner le mot tel
   qu'il s'écrit donnerait n'importe quoi (« ü » lu « u », « e » muet, « ai » lu « è »…).

   LA SOLUTION : Louis Notari a construit l'écriture du monégasque EN S'INSPIRANT DU FRANÇAIS.
   L'article Wikipédia « Monégasque » le documente noir sur blanc :
     · les voyelles nasales sont bâties « sur le système français » (-an- [ã], -on- [õ]…) ;
     · « ü » = /y/  — le u français, que l'italien ne possède pas ;
     · « r se prononce comme en français » (Louis Frolla, Grammaire monégasque, 1960) ;
     · « y » a « la même valeur qu'en français » /j/ ; « j » = /ʒ/ ; « o » toujours fermé
       « comme o français de rose ».
   Donc : on ÉCRIT la prononciation à la française, on la donne à une voix FRANÇAISE, et on
   affiche à l'écran la VRAIE orthographe monégasque. La voix tombe alors très près du réel.

   HONNÊTETÉ : c'est une APPROXIMATION, pas un locuteur monégasque. Trois sons n'existent pas
   en français et sont rendus par leur plus proche voisin — c'est écrit dans l'app, et chaque
   règle ci-dessous porte sa source. Rien n'est deviné en silence.

   Sources : article « Monégasque » (fr.wikipedia.org, CC BY-SA), qui cite Louis Notari
   (1927), Louis Frolla (Grammaire monégasque, 1960), Louis Barral & Suzanne Simone
   (Dictionnaire français-monégasque) et Raymond Arveiller (Étude sur le parler de Monaco, 1967).
*/
(function (racine) {
  'use strict';

  /* Les sons qui n'existent PAS en français : on le dit, on ne fait pas semblant. */
  var MC_VOIX_LIMITES = [
    { son: '[ũ]', ex: 'un', rendu: 'on', pourquoi: 'le français n\'a pas de « ou » nasal — « on » est le plus proche' },
    { son: '[ẽ]', ex: 'en', rendu: 'in', pourquoi: 'le français lit « en » comme [ɑ̃] ; « in » est plus proche de [ẽ]' },
    { son: '[ỹ]', ex: 'ün', rendu: 'un', pourquoi: 'rendu par le « un » français [œ̃], le plus voisin' },
  ];

  var V = 'aeiouüëœ';                     // voyelles monégasques
  var estV = function (c) { return c && V.indexOf(c) >= 0; };

  function mcVoix(texte) {
    if (!texte) return '';
    var t = String(texte).normalize('NFC')
      /* la barre verticale ˍ au-dessus d'une voyelle marque l'accent tonique irrégulier :
         elle ne change pas le son, et aucune voix ne saurait la lire → on l'enlève */
      .replace(/̍/g, '').normalize('NFC').toLowerCase();

    var s = '', i = 0;
    var suiv = function (n) { return t.charAt(i + (n || 1)); };
    while (i < t.length) {
      var c = t.charAt(i), c2 = t.substr(i, 2), c3 = t.substr(i, 3), c4 = t.substr(i, 4);
      var ap = t.charAt(i + 1), av = s.slice(-1);

      /* ---- consonnes, système italien décrit par Notari (article, § Consonnes) ---- */
      if (c4 === 'ssci' && estV(t.charAt(i + 4))) { s += 'chtch'; i += 4; continue; }   // [ʃt͡ʃ]
      if (c3 === 'ssc' && /[ei]/.test(t.charAt(i + 3))) { s += 'chtch'; i += 3; continue; }
      if (c3 === 'sci' && estV(t.charAt(i + 3))) { s += 'ch'; i += 3; continue; }        // [ʃ]
      if (c2 === 'sc' && /[ei]/.test(t.charAt(i + 2))) { s += 'ch'; i += 2; continue; }
      if (c2 === 'ci' && estV(t.charAt(i + 2))) { s += 'tch'; i += 2; continue; }        // [t͡ʃ]
      if (c === 'c' && /[ei]/.test(ap)) { s += 'tch'; i += 1; continue; }
      if (c2 === 'ch') { s += 'k'; i += 2; continue; }                                   // [k] devant e,i,œ
      if (c2 === 'gi' && estV(t.charAt(i + 2))) { s += 'dj'; i += 2; continue; }         // [d͡ʒ]
      if (c === 'g' && /[ei]/.test(ap)) { s += 'dj'; i += 1; continue; }
      if (c2 === 'gh') { s += 'gu'; i += 2; continue; }                                  // [g] devant e,i
      if (c2 === 'gn') { s += 'gn'; i += 2; continue; }                                  // laissé tel quel (non documenté)
      if (c2 === 'qu') { s += 'k'; i += 2; continue; }                                   // « délabialise -qu- » : qatru = [katru]
      if (c === 'q') { s += 'k'; i += 1; continue; }
      if (c === 'c') { s += 'k'; i += 1; continue; }                                     // devant a,o,u,ü
      if (c === 'ç') { s += 'ss'; i += 1; continue; }                                    // [s] même entre voyelles
      if (c2 === 'ss') { s += 'ss'; i += 2; continue; }                                  // cassa [s] ≠ casa [z]
      if (c2 === 'rr') { s += 'r'; i += 2; continue; }
      if (c === 's') { s += (estV(av) && estV(ap)) ? 'z' : 's'; i += 1; continue; }      // casa = [kaza]

      /* ---- voyelles nasales : Notari les a bâties sur le système français ---- */
      var finDeMot = function (k) { var d = t.charAt(k); return !d || !estV(d); };
      if (c2 === 'ün' && finDeMot(i + 2)) { s += 'un'; i += 2; continue; }               // [ỹ] ≈ un français
      if (c2 === 'ën' && finDeMot(i + 2)) { s += 'in'; i += 2; continue; }               // [ĩ]
      if (c3 === 'œn' && finDeMot(i + 3)) { s += 'in'; i += 3; continue; }               // [ẽ]/[œ̃]
      if (c2 === 'un' && finDeMot(i + 2)) { s += 'on'; i += 2; continue; }               // [ũ] ≈ on français
      if (c2 === 'en' && finDeMot(i + 2)) { s += 'in'; i += 2; continue; }               // [ẽ] ≠ « en » français [ɑ̃]
      if ((c2 === 'an' || c2 === 'on' || c2 === 'in') && finDeMot(i + 2)) { s += c2; i += 2; continue; }

      /* ---- voyelles orales ---- */
      if (c === 'ü') { s += 'u'; i += 1; continue; }                                     // /y/ = u français
      if (c === 'u') { s += 'ou'; i += 1; continue; }                                    // /u/ = ou français
      if (c === 'ë') { s += 'i'; i += 1; continue; }                                     // /iː/ (prononciation du Rocher)
      if (c === 'œ') { s += 'eu'; i += 1; continue; }                                    // [ø] ou [e] selon les quartiers
      if (c === 'e') { s += 'é'; i += 1; continue; }                                     // /e/ — sinon le français le rend muet
      if (c === 'i') { s += estV(av) ? 'ï' : 'i'; i += 1; continue; }                    // aiga [ajga] : le tréma sépare
      s += c; i += 1;
    }
    /* « chaque voyelle se prononce séparément » : un tréma évite que le français ressoude
       les voyelles en un seul son (oi → [wa], ai → [ɛ]). */
    return s.replace(/([aéio])ou/g, '$1-ou');
  }

  racine.mcVoix = mcVoix;
  racine.MC_VOIX_LIMITES = MC_VOIX_LIMITES;
  if (typeof module !== 'undefined' && module.exports) module.exports = { mcVoix: mcVoix, MC_VOIX_LIMITES: MC_VOIX_LIMITES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
