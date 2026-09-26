/* 📚 LES SOURCES OFFICIELLES DE CHAQUE LANGUE — Kevin 2026-08-13
   « Intègre les sources, les langues » (capture Google : Académie des Langues Dialectales,
   Comité National des Traditions Monégasques).

   IDÉE : pour aller plus loin qu'un cours, l'élève doit pouvoir remonter à la MAISON qui fait
   autorité sur la langue qu'il apprend — l'académie, le dictionnaire de référence, l'institut.
   Un tap, il y est.

   RÈGLE DE VÉRITÉ (importante) : un lien n'est PAS publié tant qu'il n'a pas été OUVERT pour
   de vrai. Depuis l'agent, je n'ai pas accès à internet : c'est donc la CI (réseau ouvert) qui
   ouvre chaque adresse et écrit ici le résultat — `etat: "ok"` (la page répond),
   `"robot"` (le site refuse les robots : l'adresse est bonne, un humain passe),
   `"mort"` (introuvable) ou `"?"` (jamais testé).
   L'APPLICATION N'AFFICHE QUE « ok » ET « robot ». Rien d'inventé, rien de mort à l'écran.
     · tester + mettre à jour : node tools/lingua/verify-sources.mjs --live
     · contrôle sans réseau   : node tools/lingua/verify-sources.mjs

   Ces liens sont des RÉFÉRENCES vers les sites de ces institutions — on ne recopie évidemment
   aucun dictionnaire sous droits (le Comité National des Traditions Monégasques édite le sien :
   on y renvoie, on ne le copie pas).
*/
(function (racine) {
  'use strict';

  var LANG_SOURCES = {
    mc: [
      { nom: 'Comité National des Traditions Monégasques', url: 'https://www.traditions-monaco.com/', quoi: 'la maison qui édite le dictionnaire et enseigne la langue', etat: 'ok' },
      { nom: 'Académie des Langues Dialectales', url: 'https://www.ald-monaco.org/', quoi: 'académie officielle des langues de Monaco', etat: 'ok' },
      { nom: 'Wiktionnaire — monégasque', url: 'https://fr.wiktionary.org/wiki/Cat%C3%A9gorie:mon%C3%A9gasque', quoi: 'les mots libres (CC BY-SA) qui alimentent ce cours', etat: 'ok' },
      { nom: 'munegascu.free.fr', url: 'http://munegascu.free.fr/index_uk.htm', quoi: 'le lexique par thèmes qui alimente ce cours', etat: 'ok' },
      { nom: 'Mairie de Monaco — langue monégasque', url: 'https://www.mairie.mc/', quoi: 'cours de langue monégasque proposés en ville', etat: 'ok' }
    ],
    en: [
      { nom: 'Oxford English Dictionary', url: 'https://www.oed.com/', quoi: 'le dictionnaire historique de référence', etat: 'ok' },
      { nom: 'Cambridge Dictionary', url: 'https://dictionary.cambridge.org/', quoi: 'dictionnaire avec prononciation, gratuit', etat: 'ok' },
      { nom: 'Merriam-Webster', url: 'https://www.merriam-webster.com/', quoi: 'la référence de l\'anglais américain', etat: 'robot' },
      { nom: 'Collins Dictionary', url: 'https://www.collinsdictionary.com/', quoi: 'dictionnaire anglais gratuit avec exemples', etat: 'robot' },
      { nom: 'Longman Dictionary', url: 'https://www.ldoceonline.com/', quoi: 'dictionnaire pour apprenants, avec prononciation', etat: 'ok' }
    ],
    it: [
      { nom: 'Accademia della Crusca', url: 'https://accademiadellacrusca.it/', quoi: 'la plus ancienne académie de langue au monde (1583)', etat: 'ok' },
      { nom: 'Treccani', url: 'https://www.treccani.it/vocabolario/', quoi: 'le vocabulaire italien de référence', etat: 'ok' },
      { nom: 'Dizionari Corriere della Sera', url: 'https://dizionari.corriere.it/', quoi: 'dictionnaires italiens gratuits', etat: 'ok' },
      { nom: 'Garzanti Linguistica', url: 'https://www.garzantilinguistica.it/', quoi: 'dictionnaire italien de référence', etat: 'ok' }
    ],
    es: [
      { nom: 'Real Academia Española', url: 'https://www.rae.es/', quoi: 'l\'académie qui fait la norme de l\'espagnol', etat: 'ok' },
      { nom: 'Diccionario de la lengua española', url: 'https://dle.rae.es/', quoi: 'le dictionnaire officiel, gratuit', etat: 'ok' },
      { nom: 'Instituto Cervantes', url: 'https://www.cervantes.es/', quoi: 'l\'institut officiel de la langue espagnole', etat: 'ok' },
      { nom: 'Fundéu', url: 'https://www.fundeu.es/', quoi: 'les conseils de bon usage, au jour le jour', etat: 'ok' }
    ],
    de: [
      { nom: 'Duden', url: 'https://www.duden.de/', quoi: 'la référence de l\'orthographe allemande', etat: 'ok' },
      { nom: 'Leibniz-Institut für Deutsche Sprache', url: 'https://www.ids-mannheim.de/', quoi: 'l\'institut de recherche sur l\'allemand', etat: 'ok' },
      { nom: 'Goethe-Institut', url: 'https://www.goethe.de/', quoi: 'l\'institut culturel et linguistique allemand', etat: 'ok' },
      { nom: 'DWDS', url: 'https://www.dwds.de/', quoi: 'le dictionnaire numérique de l\'allemand', etat: 'ok' }
    ],
    pt: [
      { nom: 'Priberam', url: 'https://dicionario.priberam.org/', quoi: 'dictionnaire du portugais européen, gratuit', etat: 'ok' },
      { nom: 'Instituto Camões', url: 'https://www.instituto-camoes.pt/', quoi: 'l\'institut officiel de la langue portugaise', etat: 'ok' },
      { nom: 'Academia Brasileira de Letras', url: 'https://www.academia.org.br/', quoi: 'l\'académie brésilienne des lettres', etat: 'ok' },
      { nom: 'Dicionário Aulete', url: 'https://www.aulete.com.br/', quoi: 'dictionnaire du portugais brésilien, gratuit', etat: 'ok' }
    ],
    nl: [
      { nom: 'Nederlandse Taalunie', url: 'https://taalunie.org/', quoi: 'l\'union qui fixe la norme du néerlandais', etat: 'ok' },
      { nom: 'Woordenlijst (het Groene Boekje)', url: 'https://woordenlijst.org/', quoi: 'la liste orthographique officielle', etat: 'ok' },
      { nom: 'Van Dale', url: 'https://www.vandale.nl/', quoi: 'le grand dictionnaire néerlandais', etat: 'ok' },
      { nom: 'Etymologiebank', url: 'https://etymologiebank.nl/', quoi: 'd\'où viennent les mots néerlandais', etat: 'ok' }
    ],
    pl: [
      { nom: 'Rada Języka Polskiego', url: 'https://rjp.pan.pl/', quoi: 'le conseil de la langue polonaise', etat: 'ok' },
      { nom: 'Słownik języka polskiego PWN', url: 'https://sjp.pwn.pl/', quoi: 'le dictionnaire de référence, gratuit', etat: 'ok' },
      { nom: 'Instytut Języka Polskiego PAN', url: 'https://ijp.pan.pl/', quoi: 'l\'institut de la langue polonaise', etat: 'ok' },
      { nom: 'Wielki słownik języka polskiego', url: 'https://wsjp.pl/', quoi: 'le grand dictionnaire polonais, gratuit', etat: 'ok' }
    ],
    ru: [
      { nom: 'Gramota.ru', url: 'http://gramota.ru/', quoi: 'le portail de référence du russe', etat: 'robot' },
      { nom: 'Институт русского языка им. В. В. Виноградова', url: 'https://www.ruslang.ru/', quoi: 'l\'institut de la langue russe', etat: 'ok' },
      { nom: 'Национальный корпус русского языка', url: 'https://ruscorpora.ru/', quoi: 'le corpus national : la langue telle qu\'elle s\'écrit', etat: 'ok' }
    ],
    uk: [
      { nom: 'Інститут української мови НАН України', url: 'https://iul-nasu.org.ua/', quoi: 'l\'institut de la langue ukrainienne', etat: 'ok' },
      { nom: 'Slovnyk.ua', url: 'https://slovnyk.ua/', quoi: 'dictionnaire ukrainien en ligne', etat: 'ok' }
    ],
    cs: [
      { nom: 'Ústav pro jazyk český', url: 'https://ujc.cas.cz/', quoi: 'l\'institut de la langue tchèque', etat: 'ok' },
      { nom: 'Internetová jazyková příručka', url: 'https://prirucka.ujc.cas.cz/', quoi: 'le guide officiel en ligne, gratuit', etat: 'ok' },
      { nom: 'Slovník spisovného jazyka českého', url: 'https://ssjc.ujc.cas.cz/', quoi: 'le dictionnaire de référence, gratuit', etat: 'ok' }
    ],
    zh: [
      { nom: '教育部重編國語辭典', url: 'https://dict.revised.moe.edu.tw/', quoi: 'le dictionnaire officiel du ministère de l\'Éducation', etat: 'ok' },
      { nom: 'MDBG', url: 'https://www.mdbg.net/chinese/dictionary', quoi: 'dictionnaire chinois-anglais avec tracé des caractères', etat: 'ok' },
      { nom: 'Zdic', url: 'https://www.zdic.net/', quoi: 'dictionnaire de caractères chinois, gratuit', etat: 'ok' }
    ],
    ja: [
      { nom: '文化庁 — 国語施策', url: 'https://www.bunka.go.jp/kokugo_nihongo/', quoi: 'l\'agence culturelle qui fixe la norme du japonais', etat: 'robot' },
      { nom: 'Jisho', url: 'https://jisho.org/', quoi: 'dictionnaire japonais avec kanji, gratuit', etat: 'ok' },
      { nom: 'Weblio', url: 'https://www.weblio.jp/', quoi: 'dictionnaire japonais en ligne', etat: 'ok' },
      { nom: 'Kotobank', url: 'https://kotobank.jp/', quoi: 'encyclopédies et dictionnaires japonais réunis', etat: 'ok' }
    ],
    ko: [
      { nom: '국립국어원 (Institut national de la langue coréenne)', url: 'https://www.korean.go.kr/', quoi: 'l\'institut officiel du coréen', etat: 'robot' },
      { nom: '표준국어대사전', url: 'https://stdict.korean.go.kr/', quoi: 'le grand dictionnaire officiel, gratuit', etat: 'ok' },
      { nom: '우리말샘', url: 'https://opendict.korean.go.kr/', quoi: 'le dictionnaire ouvert de l\'Institut national', etat: 'ok' },
      { nom: 'Naver 사전', url: 'https://dict.naver.com/', quoi: 'dictionnaire coréen très utilisé', etat: 'ok' }
    ],
    ar: [
      { nom: 'Almaany', url: 'https://www.almaany.com/', quoi: 'dictionnaire arabe en ligne, gratuit', etat: 'robot' },
      { nom: 'Wiktionnaire — arabe', url: 'https://fr.wiktionary.org/wiki/Cat%C3%A9gorie:arabe', quoi: 'les mots libres, avec leur racine', etat: 'ok' }
    ]
  };

  racine.LANG_SOURCES = LANG_SOURCES;
  if (typeof module !== 'undefined' && module.exports) module.exports = { LANG_SOURCES: LANG_SOURCES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
