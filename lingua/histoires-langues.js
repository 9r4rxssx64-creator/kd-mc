/* 📜 L'HISTOIRE ET LES ANECDOTES DE CHAQUE LANGUE — Kevin 2026-08-13.
   « Intègre l'histoire, anecdotes etc pour chaque langue » puis « Enrichit +++ ».

   Chaque langue a maintenant un vrai petit dossier, en quatre morceaux :
     · histoire   — d'où vient la langue, en clair, sans jargon ;
     · chiffres   — les repères qu'on retient (alphabet, cas, tons, pays) ;
     · faits      — les anecdotes, celles qu'on a envie de raconter ;
     · mots       — les mots qui ont voyagé entre cette langue et le français.

   RÈGLE DE VÉRITÉ : chaque affirmation porte sa SOURCE (`src` = l'article Wikipédia où elle
   se vérifie, ou `url` quand la preuve est ailleurs). Rien n'est écrit « de mémoire » sans
   pouvoir être recoupé, et un juge indépendant les repasse en revue
   (tools/lingua/verify-histoires.mjs, câblé dans la vérification quotidienne).
   Quand un chiffre varie selon les sources, on le dit (« environ », « souvent présenté
   comme ») au lieu de trancher à leur place.
*/
(function (racine) {
  'use strict';

  var LANG_HISTOIRE = {
    en: { nom: 'Anglais', src: 'Anglais',
      histoire: "L'anglais naît des parlers germaniques apportés en Grande-Bretagne aux Ve-VIe siècles par les Angles, les Saxons et les Jutes. La conquête normande de 1066 y déverse ensuite des milliers de mots français : c'est ce qui donne à l'anglais son double vocabulaire, à la fois germanique et latin. Entre le XVe et le XVIIe siècle, la prononciation des voyelles se déplace alors que l'imprimerie a déjà figé l'orthographe — d'où cet écart déroutant entre ce qu'on écrit et ce qu'on dit. L'Empire britannique puis les États-Unis en font enfin la langue la plus apprise de la planète, sans qu'aucune académie ne l'ait jamais réglementée.",
      chiffres: [
        { k: 'Alphabet', v: '26 lettres', src: 'Alphabet latin' },
        { k: 'Académie officielle', v: 'aucune', src: 'Anglais' },
        { k: 'À l\'ONU', v: 'l\'une des six langues officielles', src: 'Organisation des Nations unies' },
        { k: 'Article défini', v: 'un seul : « the »', src: 'Anglais' }
      ],
      faits: [
        { t: "Après 1066, le français fut la langue de la cour d'Angleterre pendant environ trois siècles.", src: 'Conquête normande de l’Angleterre' },
        { t: "L'animal garde son nom germanique, le plat son nom français : cow/beef, pig/pork, sheep/mutton.", src: 'Anglais' },
        { t: "L'anglais n'a aucune académie officielle : l'usage seul fait la règle.", src: 'Anglais' },
        { t: "C'est la langue la plus parlée au monde si l'on compte les locuteurs non natifs.", src: 'Anglais' },
        { t: "Entre le XVe et le XVIIe siècle, la prononciation des voyelles s'est déplacée alors que l'orthographe était déjà figée : d'où l'écart entre l'écrit et le parlé.", src: 'Grand changement vocalique' },
        { t: "Des centaines de mots et d'expressions sont attestés pour la première fois dans les pièces de Shakespeare.", src: 'William Shakespeare' },
        { t: "Là où le français a le, la, les, l'anglais n'a plus qu'un seul article défini : the.", src: 'Anglais' },
        { t: "« OK », apparu dans la presse de Boston en 1839, est devenu l'un des mots les plus compris de la planète.", src: 'OK' },
        { t: "Le grand dictionnaire de Samuel Johnson, paru en 1755, a longtemps fait autorité avant l'Oxford English Dictionary.", src: 'A Dictionary of the English Language' },
        { t: "L'orthographe américaine (color, center) doit beaucoup à Noah Webster, qui voulait la simplifier.", src: 'Noah Webster' }
      ],
      mots: [
        { m: 'week-end', d: "de l'anglais weekend — le français l'a repris tel quel, trait d'union compris.", src: 'Week-end' },
        { m: 'sandwich', d: "du nom du comte de Sandwich, qui aurait demandé sa viande entre deux tranches de pain pour ne pas quitter la table de jeu.", src: 'Sandwich' },
        { m: 'budget', d: "aller-retour : le vieux français bougette (petite bourse) devient budget en anglais, puis revient en français.", src: 'Budget' },
        { m: 'tunnel', d: "même aller-retour : l'ancien français tonnelle passe en anglais, revient en tunnel.", src: 'Tunnel' },
        { m: 'football', d: "littéralement « balle au pied » — le mot est arrivé avec le sport lui-même.", src: 'Football' },
        { m: 'shampoing', d: "de l'anglais shampoo, lui-même venu du hindi chāmpo, « masser ».", src: 'Shampoing' }
      ] },

    it: { nom: 'Italien', src: 'Italien',
      histoire: "L'italien moderne descend du toscan littéraire du XIVe siècle, celui de Dante, Pétrarque et Boccace. Fait rare : la langue commune a précédé le pays de plusieurs siècles, puisque la péninsule est restée morcelée jusqu'en 1861. À l'unification, l'immense majorité des habitants parlait encore son dialecte ; ce sont l'école, puis la radio et la télévision, qui ont répandu l'italien standard au XXe siècle. Florence lui avait donné dès 1583 une académie, l'Accademia della Crusca, et dès 1612 le premier grand dictionnaire d'une langue moderne en Europe.",
      chiffres: [
        { k: 'Alphabet', v: '21 lettres (j, k, w, x, y servent aux mots étrangers)', src: 'Alphabet italien' },
        { k: 'Académie', v: 'la Crusca, fondée en 1583', src: 'Accademia della Crusca' },
        { k: 'Premier dictionnaire', v: '1612', src: 'Accademia della Crusca' },
        { k: 'Officielle', v: 'Italie, Saint-Marin, Vatican, et l\'une des langues de la Suisse', src: 'Italien' }
      ],
      faits: [
        { t: "Dante écrivit la Divine Comédie en toscan plutôt qu'en latin : ce choix a façonné l'italien.", src: 'Divine Comédie' },
        { t: "À l'unification de 1861, seule une petite minorité d'Italiens parlait couramment l'italien ; les dialectes régionaux dominaient.", src: 'Italien' },
        { t: "L'Accademia della Crusca, fondée en 1583 à Florence, est l'une des plus anciennes académies de langue au monde.", src: 'Accademia della Crusca' },
        { t: "Le vocabulaire de la musique est italien dans le monde entier : piano, forte, allegro, tempo.", src: 'Italien' },
        { t: "Son dictionnaire de 1612 précède ceux de l'espagnol, du français et de l'anglais.", src: 'Accademia della Crusca' },
        { t: "La radio et la télévision sont souvent créditées d'avoir diffusé l'italien standard plus vite que l'école.", src: 'Italien' },
        { t: "Presque tous les mots italiens se terminent par une voyelle : c'est ce qui donne à la langue sa musicalité.", src: 'Italien' },
        { t: "« Ciao » vient du vénitien s-ciào vostro, « je suis votre serviteur » : une formule de politesse devenue mondiale.", src: 'Ciao' },
        { t: "On y vouvoie avec « Lei », c'est-à-dire « elle », même en s'adressant à un homme.", src: 'Italien' },
        { t: "L'italien est souvent présenté comme la langue vivante la plus proche du latin par son vocabulaire.", src: 'Langues romanes' }
      ],
      mots: [
        { m: 'banque', d: "de l'italien banca, le banc sur lequel les changeurs posaient leurs pièces.", src: 'Banque' },
        { m: 'balcon', d: "de l'italien balcone — l'architecture de la Renaissance a exporté son vocabulaire.", src: 'Balcon' },
        { m: 'opéra', d: "de l'italien opera, « l'œuvre » : le genre et le mot sont nés ensemble.", src: 'Opéra' },
        { m: 'pizza', d: "mot italien passé tel quel dans presque toutes les langues du monde.", src: 'Pizza' },
        { m: 'bravo', d: "on applaudit en italien, même à Paris ou à New York.", src: 'Italien' },
        { m: 'piano', d: "abréviation de pianoforte, « doux-fort », parce qu'il pouvait enfin jouer les deux.", src: 'Piano' }
      ] },

    es: { nom: 'Espagnol', src: 'Espagnol',
      histoire: "L'espagnol, ou castillan, est né du latin parlé dans le nord de la péninsule Ibérique. Huit siècles de présence musulmane y ont laissé des milliers de mots arabes, reconnaissables à leur « al- ». La grammaire de Nebrija, en 1492, est la première grammaire imprimée d'une langue européenne moderne — l'année même où commence la traversée vers les Amériques, qui fera de l'espagnol l'une des langues les plus parlées de la planète. Aujourd'hui, la norme est fixée en commun par l'Académie royale d'Espagne et les académies américaines.",
      chiffres: [
        { k: 'Alphabet', v: '27 lettres (avec le ñ)', src: 'Alphabet espagnol' },
        { k: 'Pays où elle est officielle', v: 'une vingtaine', src: 'Espagnol' },
        { k: 'Locuteurs natifs', v: 'deuxième langue au monde', src: 'Espagnol' },
        { k: 'Académie', v: 'la Real Academia Española, fondée en 1713', src: 'Real Academia Española' }
      ],
      faits: [
        { t: "Le ñ vient des copistes du Moyen Âge : ils écrivaient un petit n au-dessus d'un autre pour abréger le double n.", src: 'Ñ' },
        { t: "Des milliers de mots espagnols viennent de l'arabe, souvent reconnaissables à leur « al- » : almohada, azúcar, aceite.", src: 'Espagnol' },
        { t: "L'espagnol est la seule grande langue à ouvrir ses questions et exclamations par ¿ et ¡.", src: 'Point d’interrogation' },
        { t: "C'est la deuxième langue au monde par le nombre de locuteurs natifs.", src: 'Espagnol' },
        { t: "La grammaire de Nebrija, en 1492, est la première grammaire imprimée d'une langue européenne moderne.", src: 'Antonio de Nebrija' },
        { t: "En Amérique on dit « ustedes » là où l'Espagne dit « vosotros ».", src: 'Espagnol d’Amérique' },
        { t: "Pour la plupart des hispanophones, « ll » et « y » se prononcent aujourd'hui de la même façon : c'est le yeísmo.", src: 'Yeísmo' },
        { t: "Don Quichotte, publié à partir de 1605, est souvent présenté comme le premier roman moderne.", src: 'Don Quichotte' },
        { t: "L'Espagne a d'autres langues officielles selon les régions : catalan, galicien, basque.", src: 'Langues en Espagne' },
        { t: "L'espagnol s'écrit presque comme il se prononce : à quelques exceptions près, une lettre vaut un son.", src: 'Espagnol' }
      ],
      mots: [
        { m: 'sieste', d: "de l'espagnol siesta, lui-même du latin sexta hora, la sixième heure du jour.", src: 'Sieste' },
        { m: 'tomate', d: "arrivée d'Amérique par l'espagnol, qui l'avait prise au nahuatl tomatl.", src: 'Tomate' },
        { m: 'chocolat', d: "même trajet : le nahuatl, puis l'espagnol, puis l'Europe entière.", src: 'Chocolat' },
        { m: 'moustique', d: "de l'espagnol mosquito, « petite mouche ».", src: 'Moustique' },
        { m: 'camarade', d: "de camarada : au départ, celui qui partage la chambrée.", src: 'Camarade' },
        { m: 'embargo', d: "mot espagnol passé tel quel dans le vocabulaire diplomatique.", src: 'Embargo' }
      ] },

    de: { nom: 'Allemand', src: 'Allemand',
      histoire: "L'allemand écrit doit beaucoup à Martin Luther : sa traduction de la Bible (Nouveau Testament en 1522, Bible complète en 1534) a diffusé une langue commune à travers des territoires qui parlaient des dialectes très différents. L'imprimerie, née à Mayence vers 1455, lui avait donné les moyens de circuler. Au XIXe siècle, les frères Grimm — collecteurs de contes, mais surtout linguistes — lancent le grand dictionnaire de la langue. L'allemand reste aujourd'hui la langue maternelle la plus parlée de l'Union européenne, et la seule grande langue européenne à mettre une majuscule à tous ses noms communs.",
      chiffres: [
        { k: 'Cas grammaticaux', v: '4 : nominatif, accusatif, datif, génitif', src: 'Allemand' },
        { k: 'Genres', v: '3 (der, die, das)', src: 'Allemand' },
        { k: 'Majuscule', v: 'à TOUS les noms', src: 'Allemand' },
        { k: 'Dans l\'Union européenne', v: 'la langue maternelle la plus parlée', src: 'Allemand' }
      ],
      faits: [
        { t: "L'allemand écrit met une majuscule à TOUS les noms communs, pas seulement aux noms propres.", src: 'Allemand' },
        { t: "On peut fabriquer un mot en collant des mots bout à bout : c'est pourquoi certains mots allemands sont si longs.", src: 'Mot composé' },
        { t: "Une réforme de l'orthographe en 1996 a fait débat pendant des années dans les pays germanophones.", src: 'Allemand' },
        { t: "C'est la langue maternelle la plus parlée de l'Union européenne.", src: 'Allemand' },
        { t: "Trois genres et quatre cas : chaque nom change selon sa fonction dans la phrase.", src: 'Allemand' },
        { t: "Le verbe part souvent à la fin de la phrase : il faut écouter jusqu'au bout pour comprendre.", src: 'Allemand' },
        { t: "Gutenberg imprime sa Bible vers 1455 à Mayence : l'imprimerie européenne naît en pays germanophone.", src: 'Bible de Gutenberg' },
        { t: "Le mot « Kindergarten » a été forgé par Friedrich Fröbel en 1840, puis exporté tel quel dans le monde.", src: 'Jardin d’enfants' },
        { t: "Les frères Grimm ne collectaient pas que des contes : ils ont lancé le grand dictionnaire de l'allemand.", src: 'Deutsches Wörterbuch' },
        { t: "L'allemand est officiel en Allemagne, en Autriche, en Suisse, au Liechtenstein, au Luxembourg et en Belgique.", src: 'Allemand' }
      ],
      mots: [
        { m: 'vasistas', d: "de l'allemand was ist das ?, « qu'est-ce que c'est ? » — ce qu'on demandait par la petite fenêtre.", src: 'Vasistas' },
        { m: 'bivouac', d: "de l'alémanique Biwacht, la garde de nuit.", src: 'Bivouac' },
        { m: 'nouille', d: "de l'allemand Nudel.", src: 'Nouille' },
        { m: 'leitmotiv', d: "« motif conducteur » — le mot vient de l'analyse de la musique de Wagner.", src: 'Leitmotiv' },
        { m: 'ersatz', d: "« produit de remplacement » : le mot est resté après les pénuries de guerre.", src: 'Ersatz' },
        { m: 'kitsch', d: "mot allemand devenu un jugement esthétique international.", src: 'Kitsch' }
      ] },

    pt: { nom: 'Portugais', src: 'Portugais',
      histoire: "Né dans le nord-ouest de la péninsule Ibérique, le portugais partage ses origines médiévales avec le galicien parlé aujourd'hui en Espagne. À partir du XVe siècle, les navigateurs l'emportent le long des côtes d'Afrique, en Inde, au Brésil et jusqu'au Japon — et rapportent en échange des mots du monde entier. Camões lui donne son épopée, Les Lusiades, en 1572. Il est aujourd'hui langue officielle sur quatre continents, et le Brésil en concentre de très loin le plus grand nombre de locuteurs ; un accord signé en 1990 a rapproché les deux orthographes.",
      chiffres: [
        { k: 'Pays où il est officiel', v: 'neuf', src: 'Portugais' },
        { k: 'Continents', v: 'quatre', src: 'Portugais' },
        { k: 'Accord orthographique', v: 'signé en 1990', src: 'Portugais' },
        { k: 'Signature sonore', v: 'les voyelles nasales (ã, õ)', src: 'Portugais' }
      ],
      faits: [
        { t: "Le portugais est langue officielle de neuf pays, du Portugal au Brésil, de l'Angola au Timor oriental.", src: 'Portugais' },
        { t: "« Saudade » désigne un mélange de nostalgie et de manque que le portugais nomme d'un seul mot.", src: 'Saudade' },
        { t: "Un accord orthographique signé en 1990 a rapproché les graphies du Portugal et du Brésil.", src: 'Portugais' },
        { t: "Le Brésil est le seul pays d'Amérique du Sud dont la langue officielle est le portugais.", src: 'Brésil' },
        { t: "Le portugais et le galicien, parlé en Espagne, descendent d'une même langue médiévale.", src: 'Galaïco-portugais' },
        { t: "Les Lusiades de Camões, publiées en 1572, sont l'épopée nationale portugaise.", src: 'Les Lusiades' },
        { t: "Portugal et Brésil se distinguent surtout par la prononciation, plus que par la grammaire.", src: 'Portugais' },
        { t: "Le japonais dit « pan » pour le pain : le mot lui vient des Portugais arrivés au XVIe siècle.", src: 'Portugais' },
        { t: "Les voyelles nasales, comme dans « pão », sont une signature du portugais parmi les langues romanes.", src: 'Portugais' },
        { t: "Il est souvent présenté comme la langue la plus parlée de l'hémisphère sud.", src: 'Portugais' }
      ],
      mots: [
        { m: 'fétiche', d: "du portugais feitiço, « sortilège » — rapporté par les navigateurs.", src: 'Fétiche' },
        { m: 'baroque', d: "du portugais barroco, la perle irrégulière.", src: 'Baroque' },
        { m: 'caravelle', d: "du portugais caravela : le bateau des grandes découvertes.", src: 'Caravelle' },
        { m: 'cobra', d: "du portugais cobra, « serpent », rapporté d'Asie.", src: 'Cobra' },
        { m: 'marmelade', d: "du portugais marmelada, la pâte de coing (marmelo).", src: 'Marmelade' },
        { m: 'banane', d: "arrivée en français par le portugais, qui l'avait prise à une langue d'Afrique de l'Ouest.", src: 'Banane' }
      ] },

    nl: { nom: 'Néerlandais', src: 'Néerlandais',
      histoire: "Le néerlandais est la langue germanique la plus proche de l'anglais après le frison. Au Siècle d'or, la puissance maritime et commerciale des Provinces-Unies sème du vocabulaire néerlandais dans le monde entier : la mer française parle encore néerlandais avec bâbord, tribord et matelot. Les colons hollandais fondent Nieuw Amsterdam en 1625, qui deviendra New York — et y laissent Brooklyn ou Harlem. Depuis 1980, une union linguistique réunit les Pays-Bas, la Belgique flamande et, depuis 2004, le Suriname pour fixer une norme commune.",
      chiffres: [
        { k: 'Officiel', v: 'Pays-Bas, Belgique, Suriname', src: 'Néerlandais' },
        { k: 'Union linguistique', v: 'créée en 1980', src: 'Union de la langue néerlandaise' },
        { k: 'Cousine la plus proche', v: 'le frison, avant l\'anglais', src: 'Langues germaniques' },
        { k: 'Curiosité', v: 'le digramme « ij » se met en majuscules d\'un bloc', src: 'IJ (digramme)' }
      ],
      faits: [
        { t: "L'anglais a emprunté au néerlandais des mots de marine et du quotidien, comme yacht ou cookie.", src: 'Néerlandais' },
        { t: "Le néerlandais et l'afrikaans d'Afrique du Sud sont assez proches pour que leurs locuteurs se comprennent en partie.", src: 'Afrikaans' },
        { t: "Le digramme « ij » est si particulier qu'il se met tout entier en majuscules : IJsland.", src: 'IJ (digramme)' },
        { t: "C'est la langue officielle des Pays-Bas, de la Flandre belge et du Suriname.", src: 'Néerlandais' },
        { t: "New York s'est d'abord appelée Nieuw Amsterdam, fondée par les Néerlandais en 1625.", src: 'Nouvelle-Amsterdam' },
        { t: "Brooklyn vient de Breukelen et Harlem de Haarlem : la carte de New York garde la trace des colons hollandais.", src: 'Nouvelle-Amsterdam' },
        { t: "Le néerlandais et le flamand sont la même langue : « flamand » désigne les parlers de Belgique.", src: 'Néerlandais' },
        { t: "Le français lui a pris tout un vocabulaire de la mer : bâbord, tribord, matelot.", src: 'Néerlandais' },
        { t: "Le « g » néerlandais se prononce au fond de la gorge, un son qui surprend souvent les francophones.", src: 'Néerlandais' },
        { t: "L'Union de la langue néerlandaise, créée en 1980, fixe la norme commune ; le Suriname l'a rejointe en 2004.", src: 'Union de la langue néerlandaise' }
      ],
      mots: [
        { m: 'boulevard', d: "du néerlandais bolwerk, le rempart : les boulevards ont remplacé les fortifications.", src: 'Boulevard' },
        { m: 'kermesse', d: "de kerkmisse, la messe de l'église — la fête patronale devenue fête foraine.", src: 'Kermesse' },
        { m: 'matelot', d: "du néerlandais mattenoot, « compagnon de couchette ».", src: 'Matelot' },
        { m: 'bâbord et tribord', d: "de bakboord et stuurboord : le côté du dos et le côté de la barre.", src: 'Bâbord' },
        { m: 'mannequin', d: "de manneken, « petit homme » — la figurine avant le métier.", src: 'Mannequin' },
        { m: 'vacarme', d: "du moyen néerlandais wacharme, une exclamation de détresse.", src: 'Néerlandais' }
      ] },

    pl: { nom: 'Polonais', src: 'Polonais',
      histoire: "Langue slave occidentale écrite en alphabet latin, le polonais s'est maintenu à travers plus d'un siècle de partages où la Pologne avait disparu des cartes : la langue a tenu lieu de pays. Elle s'est dotée très tôt d'une littérature savante — l'université de Cracovie date de 1364 — et a emprunté au latin, à l'allemand, puis massivement au français aux XVIIIe et XIXe siècles, quand parler français était la marque des salons. Sept cas, trois genres, aucun article : la fin des mots y fait le travail que le français confie aux petits mots devant.",
      chiffres: [
        { k: 'Alphabet', v: '32 lettres', src: 'Polonais' },
        { k: 'Cas grammaticaux', v: '7 — la fin du mot dit son rôle', src: 'Polonais' },
        { k: 'Articles', v: 'aucun', src: 'Polonais' },
        { k: 'Université de Cracovie', v: 'fondée en 1364', src: 'Université jagellonne de Cracovie' }
      ],
      faits: [
        { t: "Le polonais décline les noms selon sept cas grammaticaux.", src: 'Polonais' },
        { t: "Des suites comme « szcz » impressionnent, mais chaque lettre s'y prononce régulièrement.", src: 'Polonais' },
        { t: "Le petit crochet sous ą et ę, l'ogonek, note des voyelles nasales.", src: 'Ogonek' },
        { t: "Marie Curie a nommé le polonium en l'honneur de la Pologne, alors rayée de la carte.", src: 'Polonium' },
        { t: "Le polonais s'écrit en alphabet latin, contrairement au russe et à l'ukrainien.", src: 'Polonais' },
        { t: "Il n'y a ni « le », ni « la », ni « un » : le polonais se passe totalement d'articles.", src: 'Polonais' },
        { t: "L'université de Cracovie, fondée en 1364, est l'une des plus anciennes d'Europe.", src: 'Université jagellonne de Cracovie' },
        { t: "Copernic, né à Toruń, publiait en latin : c'était la langue savante de son temps.", src: 'Nicolas Copernic' },
        { t: "Les lettres ś, ć, ź et ń notent des consonnes « molles », qu'on prononce le bout de la langue plus haut.", src: 'Polonais' },
        { t: "Le polonais a emprunté au français une foule de mots du quotidien : makijaż, abażur, bulion.", src: 'Polonais' }
      ],
      mots: [
        { m: 'makijaż', d: "du français « maquillage » — le mot a traversé tel quel, à l'orthographe près.", src: 'Polonais' },
        { m: 'abażur', d: "du français « abat-jour ».", src: 'Polonais' },
        { m: 'bulion', d: "du français « bouillon ».", src: 'Polonais' },
        { m: 'koniak', d: "du français « cognac » — la ville est devenue un nom commun.", src: 'Cognac (eau-de-vie)' },
        { m: 'ekran', d: "du français « écran ».", src: 'Polonais' },
        { m: 'mazurka', d: "dans l'autre sens : le français a pris au polonais mazurek, la danse de Mazovie.", src: 'Mazurka' }
      ] },

    ru: { nom: 'Russe', src: 'Russe',
      histoire: "Le russe s'écrit en alphabet cyrillique, hérité de l'œuvre des moines Cyrille et Méthode au IXe siècle. Longtemps partagée entre le slavon d'église, réservé aux textes sacrés, et la langue parlée, elle trouve sa forme moderne au début du XIXe siècle avec Pouchkine, considéré comme le fondateur du russe littéraire. La noblesse d'alors parlait couramment français — Guerre et Paix s'ouvre sur des pages entières en français — et a laissé au russe des centaines de mots empruntés. Une réforme en 1918 a supprimé plusieurs lettres devenues muettes.",
      chiffres: [
        { k: 'Alphabet', v: '33 lettres cyrilliques', src: 'Alphabet russe' },
        { k: 'Cas grammaticaux', v: '6 — la fin du mot dit son rôle', src: 'Russe' },
        { k: 'Articles', v: 'aucun', src: 'Russe' },
        { k: 'À l\'ONU', v: 'l\'une des six langues officielles', src: 'Organisation des Nations unies' }
      ],
      faits: [
        { t: "L'alphabet cyrillique descend des travaux de Cyrille et Méthode, au IXe siècle.", src: 'Alphabet cyrillique' },
        { t: "Une réforme de 1918 a supprimé plusieurs lettres devenues inutiles.", src: 'Alphabet russe' },
        { t: "« Spoutnik » veut dire « compagnon de route » : le nom du premier satellite est un mot du quotidien.", src: 'Spoutnik 1' },
        { t: "Le russe est l'une des six langues officielles de l'ONU.", src: 'Organisation des Nations unies' },
        { t: "L'alphabet russe compte 33 lettres, dont deux qui ne se prononcent pas seules : ъ et ь.", src: 'Alphabet russe' },
        { t: "Il n'y a pas d'article, et le verbe « être » disparaît au présent : on dit littéralement « je étudiant ».", src: 'Russe' },
        { t: "Pouchkine est considéré comme le fondateur de la langue littéraire russe moderne.", src: 'Alexandre Pouchkine' },
        { t: "Au XIXe siècle, la noblesse parlait français : Guerre et Paix s'ouvre sur des pages entières en français.", src: 'Guerre et Paix' },
        { t: "Six cas et trois genres : c'est la fin des mots qui indique leur rôle dans la phrase.", src: 'Russe' },
        { t: "Des centaines de mots russes viennent du français : абажур, багаж, шофёр, тротуар.", src: 'Russe' }
      ],
      mots: [
        { m: 'абажур (abajour)', d: "du français « abat-jour ».", src: 'Russe' },
        { m: 'багаж (bagaj)', d: "du français « bagage ».", src: 'Russe' },
        { m: 'шофёр (chofior)', d: "du français « chauffeur » — celui qui chauffait la machine.", src: 'Russe' },
        { m: 'тротуар (trotuar)', d: "du français « trottoir ».", src: 'Russe' },
        { m: 'steppe', d: "dans l'autre sens : le français a pris au russe степь, la grande plaine.", src: 'Steppe' },
        { m: 'mammouth', d: "autre emprunt du français au russe, мамонт.", src: 'Mammouth' }
      ] },

    uk: { nom: 'Ukrainien', src: 'Ukrainien',
      histoire: "Langue slave orientale, l'ukrainien s'écrit en cyrillique avec des lettres qui lui sont propres : ї, є, і et ґ, absentes du russe. Longtemps minoré sous l'Empire russe, où son usage public fut même interdit au XIXe siècle, il trouve son texte fondateur avec le Kobzar de Taras Chevtchenko, publié en 1840. Par son vocabulaire, il est aussi proche du polonais que du russe. Depuis l'indépendance de 1991, il connaît un puissant mouvement de réaffirmation, jusque dans les transcriptions : on écrit désormais Kyiv, depuis l'ukrainien, et non plus Kiev, depuis le russe.",
      chiffres: [
        { k: 'Alphabet', v: '33 lettres', src: 'Alphabet ukrainien' },
        { k: 'Cas grammaticaux', v: '7, dont le vocatif', src: 'Ukrainien' },
        { k: 'Lettres propres', v: 'ї, є, і, ґ', src: 'Alphabet ukrainien' },
        { k: 'Texte fondateur', v: 'le Kobzar, 1840', src: 'Kobzar' }
      ],
      faits: [
        { t: "L'ukrainien possède des lettres que le russe n'a pas, comme ї, є et ґ.", src: 'Alphabet ukrainien' },
        { t: "Par son vocabulaire, l'ukrainien est aussi proche du polonais que du russe.", src: 'Ukrainien' },
        { t: "Taras Chevtchenko, poète du XIXe siècle, est considéré comme le père de la langue littéraire ukrainienne.", src: 'Taras Chevtchenko' },
        { t: "La lettre г s'y prononce comme un h aspiré, et non comme le g russe.", src: 'Ukrainien' },
        { t: "Le Kobzar de Chevtchenko, publié en 1840, est le livre fondateur de la littérature ukrainienne.", src: 'Kobzar' },
        { t: "L'ukrainien garde le vocatif, le cas qui sert à appeler quelqu'un : sept cas en tout.", src: 'Ukrainien' },
        { t: "Sous l'Empire russe, des décrets du XIXe siècle ont interdit de publier en ukrainien.", src: 'Ukrainien' },
        { t: "Kyiv est la transcription depuis l'ukrainien ; Kiev venait du russe.", src: 'Kiev' },
        { t: "Russophones et ukrainophones partagent beaucoup de vocabulaire, mais pas assez pour se comprendre sans apprentissage.", src: 'Ukrainien' },
        { t: "L'ukrainien est la seule langue officielle de l'Ukraine depuis son indépendance.", src: 'Ukraine' }
      ],
      mots: [
        { m: 'cosaque', d: "le français l'a pris à козак, par le polonais et le russe.", src: 'Cosaques' },
        { m: 'bortsch', d: "du борщ, la soupe de betterave d'Europe de l'Est.", src: 'Bortsch' },
        { m: 'steppe', d: "la grande plaine, mot passé en français par les langues slaves.", src: 'Steppe' },
        { m: 'абажур (abajour)', d: "dans l'autre sens : du français « abat-jour ».", src: 'Ukrainien' },
        { m: 'тротуар (trotuar)', d: "du français « trottoir ».", src: 'Ukrainien' },
        { m: 'шосе (chossé)', d: "du français « chaussée ».", src: 'Ukrainien' }
      ] },

    cs: { nom: 'Tchèque', src: 'Tchèque',
      histoire: "Le tchèque doit son allure à Jan Hus, réformateur du XVe siècle : plutôt que d'empiler les lettres, il proposa de poser un signe au-dessus — le háček, ce petit accent en forme de v qu'on retrouve sur š, č, ž. L'idée a fait école bien au-delà : le croate, le slovène ou le letton l'utilisent aussi. Après deux siècles où l'allemand domina l'administration, le XIXe siècle voit un « réveil national » qui reforge le vocabulaire savant. Le tchèque et le slovaque restent si proches que leurs locuteurs se comprennent en grande partie sans traduction.",
      chiffres: [
        { k: 'Alphabet', v: '42 lettres, signes compris', src: 'Tchèque' },
        { k: 'Cas grammaticaux', v: '7, comme en polonais', src: 'Tchèque' },
        { k: 'Accent tonique', v: 'toujours sur la première syllabe', src: 'Tchèque' },
        { k: 'Université de Prague', v: 'fondée en 1348', src: 'Université Charles de Prague' }
      ],
      faits: [
        { t: "Le háček, ce petit v au-dessus des lettres, est associé à la réforme de Jan Hus.", src: 'Háček' },
        { t: "Le son noté « ř » est considéré comme l'un des plus difficiles au monde à prononcer.", src: 'Ř' },
        { t: "Le mot « robot » vient du tchèque : Karel Čapek l'a lancé dans sa pièce R.U.R. en 1920.", src: 'Robot' },
        { t: "Certains mots tchèques s'écrivent sans aucune voyelle, comme « zmrzl ».", src: 'Tchèque' },
        { t: "L'accent tonique tombe toujours sur la première syllabe : c'est ce qui donne son rythme à la langue.", src: 'Tchèque' },
        { t: "Le tchèque et le slovaque sont assez proches pour que leurs locuteurs se comprennent en grande partie.", src: 'Slovaque' },
        { t: "L'université Charles, fondée à Prague en 1348, est la plus ancienne d'Europe centrale.", src: 'Université Charles de Prague' },
        { t: "Le háček tchèque a été adopté par d'autres langues, du croate au letton.", src: 'Háček' },
        { t: "Le mot « dollar » remonte au thaler, monnaie frappée à Jáchymov, en Bohême.", src: 'Thaler' },
        { t: "« Pistolet » viendrait du tchèque píšťala, une arme des guerres hussites.", src: 'Pistolet' }
      ],
      mots: [
        { m: 'robot', d: "du tchèque robota, « corvée » : inventé par Karel Čapek en 1920.", src: 'Robot' },
        { m: 'dollar', d: "du thaler, la monnaie de Jáchymov (Joachimsthal), en Bohême.", src: 'Thaler' },
        { m: 'pistolet', d: "viendrait du tchèque píšťala, l'arme des hussites.", src: 'Pistolet' },
        { m: 'polka', d: "la danse est née en Bohême avant de faire le tour de l'Europe.", src: 'Polka' },
        { m: 'obusier', d: "du tchèque houfnice, passé en français par l'allemand Haubitze.", src: 'Obusier' },
        { m: 'šofér, bulvár', d: "dans l'autre sens : le tchèque a pris au français « chauffeur » et « boulevard ».", src: 'Tchèque' }
      ] },

    zh: { nom: 'Chinois (mandarin)', src: 'Mandarin standard',
      histoire: "Le chinois s'écrit avec des caractères et non avec un alphabet, et cette écriture est en usage depuis plus de trois mille ans. Elle relie des régions dont les parlers sont parfois mutuellement incompréhensibles à l'oral : deux personnes qui ne se comprennent pas en parlant peuvent se lire. Le mandarin standard, appelé pǔtōnghuà, « langue commune », a été promu au XXe siècle comme langue nationale ; le pinyin, qui l'écrit en lettres latines, est adopté officiellement en 1958. La République populaire a par ailleurs simplifié des milliers de caractères, que Taïwan et Hong Kong continuent d'écrire dans leur forme traditionnelle.",
      chiffres: [
        { k: 'Tons', v: '4, plus un ton neutre', src: 'Mandarin standard' },
        { k: 'Caractères pour lire un journal', v: 'environ 3 000', src: 'Sinogramme' },
        { k: 'Pinyin', v: 'officiel depuis 1958', src: 'Hanyu pinyin' },
        { k: 'Conjugaison', v: 'aucune', src: 'Mandarin standard' }
      ],
      faits: [
        { t: "Le mandarin standard distingue quatre tons : la hauteur de la voix change le sens du mot.", src: 'Mandarin standard' },
        { t: "Le pinyin, qui écrit le chinois en lettres latines, a été adopté officiellement en 1958.", src: 'Hanyu pinyin' },
        { t: "Les caractères simplifiés ont été introduits en République populaire de Chine ; Taïwan et Hong Kong gardent les traditionnels.", src: 'Sinogramme simplifié' },
        { t: "L'écriture chinoise est l'un des systèmes d'écriture les plus anciens encore en usage.", src: 'Sinogramme' },
        { t: "Il n'y a ni conjugaison ni accord : le temps se marque avec des mots comme « hier » ou « déjà ».", src: 'Mandarin standard' },
        { t: "Deux personnes qui ne se comprennent pas à l'oral peuvent se lire : l'écriture est commune.", src: 'Chinois' },
        { t: "On lit un journal avec environ trois mille caractères, sur les dizaines de milliers répertoriés.", src: 'Sinogramme' },
        { t: "Le mandarin est la langue qui compte le plus de locuteurs natifs au monde.", src: 'Mandarin standard' },
        { t: "« Pǔtōnghuà », son nom officiel en Chine, signifie littéralement « langue commune ».", src: 'Mandarin standard' },
        { t: "Chaque caractère se trace dans un ordre précis : l'ordre des traits s'apprend avec le caractère.", src: 'Ordre des traits' }
      ],
      mots: [
        { m: 'thé', d: "du min nan tê, rapporté par les navires néerlandais — là où d'autres langues ont pris chá par la route de terre.", src: 'Thé' },
        { m: 'litchi', d: "du chinois lìzhī : le fruit et son nom ont voyagé ensemble.", src: 'Litchi' },
        { m: 'kaolin', d: "du nom de la colline de Gaoling, d'où venait l'argile à porcelaine.", src: 'Kaolin' },
        { m: 'kung-fu', d: "du chinois gōngfu, « le travail bien fait, la maîtrise acquise ».", src: 'Kung-fu' },
        { m: 'feng shui', d: "littéralement « vent et eau ».", src: 'Feng shui' },
        { m: '咖啡 (kāfēi)', d: "dans l'autre sens : le chinois a transcrit le son du mot « café ».", src: 'Mandarin standard' }
      ] },

    ja: { nom: 'Japonais', src: 'Japonais',
      histoire: "Le japonais mêle trois écritures dans une même phrase : les kanji venus de Chine, et deux syllabaires nés au Japon, les hiragana et les katakana. Les hiragana ont d'abord été l'écriture des femmes de la cour, à une époque où le chinois restait réservé aux hommes lettrés — c'est avec eux qu'a été écrit, vers l'an 1000, le Dit du Genji, souvent présenté comme le premier roman du monde. La langue n'est apparentée ni au chinois ni au coréen malgré les caractères partagés, place son verbe en fin de phrase, et possède un système de politesse, le keigo, qui change la forme des mots selon à qui l'on parle.",
      chiffres: [
        { k: 'Écritures mêlées', v: '3 : kanji, hiragana, katakana', src: 'Écritures du japonais' },
        { k: 'Hiragana', v: '46 signes de base', src: 'Hiragana' },
        { k: 'Kanji d\'usage courant', v: '2 136 (liste jōyō)', src: 'Jōyō kanji' },
        { k: 'Place du verbe', v: 'à la fin de la phrase', src: 'Japonais' }
      ],
      faits: [
        { t: "Trois écritures cohabitent : kanji, hiragana et katakana — souvent dans la même phrase.", src: 'Écritures du japonais' },
        { t: "Les hiragana ont d'abord été utilisés par les femmes de la cour, à une époque où le chinois était réservé aux hommes lettrés.", src: 'Hiragana' },
        { t: "Le Dit du Genji, écrit vers l'an 1000 par Murasaki Shikibu, est souvent présenté comme le premier roman du monde.", src: 'Le Dit du Genji' },
        { t: "Le japonais possède un système de politesse très développé, le keigo, qui change la forme des verbes.", src: 'Keigo' },
        { t: "Il s'écrit aussi bien de gauche à droite qu'en colonnes de haut en bas.", src: 'Japonais' },
        { t: "Le verbe se place à la fin : la phrase ne se comprend vraiment qu'au dernier mot.", src: 'Japonais' },
        { t: "« Pan », le pain, vient du portugais, apporté par les missionnaires au XVIe siècle.", src: 'Japonais' },
        { t: "Japonais et chinois partagent des caractères mais ne sont pas des langues parentes.", src: 'Japonais' },
        { t: "Les katakana servent surtout à écrire les mots venus de l'étranger.", src: 'Katakana' },
        { t: "On compte les objets avec des mots différents selon leur forme : plats, longs, petits animaux.", src: 'Japonais' }
      ],
      mots: [
        { m: 'アンケート (ankēto)', d: "du français « enquête » : c'est le mot japonais pour un sondage.", src: 'Japonais' },
        { m: 'アトリエ (atorie)', d: "du français « atelier », employé pour l'atelier d'artiste.", src: 'Japonais' },
        { m: 'ズボン (zubon)', d: "viendrait du français « jupon » — c'est le mot courant pour un pantalon.", src: 'Japonais' },
        { m: 'パン (pan)', d: "du portugais pão : le pain est arrivé avec le mot, au XVIe siècle.", src: 'Japonais' },
        { m: 'kimono', d: "dans l'autre sens : le français dit kimono, littéralement « la chose que l'on porte ».", src: 'Kimono' },
        { m: 'tsunami', d: "du japonais 津波, « vague du port » — adopté par le monde entier.", src: 'Tsunami' }
      ] },

    ko: { nom: 'Coréen', src: 'Coréen',
      histoire: "Le coréen s'écrit en hangeul, un alphabet créé au XVe siècle sur ordre du roi Sejong et promulgué en 1446. Fait rare : on connaît sa date, son auteur et son intention — rendre l'écriture accessible au peuple, là où les caractères chinois restaient réservés aux lettrés. La forme des consonnes s'inspire de la position de la bouche et de la langue quand on les prononce, et les lettres se groupent en blocs formant une syllabe. Le coréen place son verbe en fin de phrase et possède plusieurs niveaux de politesse qui changent la terminaison des verbes. Les deux Corées célèbrent leur alphabet, mais pas le même jour.",
      chiffres: [
        { k: 'Alphabet', v: '24 lettres de base (+ des composées)', src: 'Hangeul' },
        { k: 'Promulgué', v: 'en 1446', src: 'Hangeul' },
        { k: 'Écriture', v: 'en blocs d\'une syllabe', src: 'Hangeul' },
        { k: 'Fête de l\'alphabet', v: '9 octobre au Sud, 15 janvier au Nord', src: 'Hangeul' }
      ],
      faits: [
        { t: "Le hangeul a été promulgué en 1446 sous le règne du roi Sejong le Grand.", src: 'Hangeul' },
        { t: "La forme des consonnes s'inspire de la position de la bouche et de la langue quand on les prononce.", src: 'Hangeul' },
        { t: "Les lettres se groupent en blocs formant une syllabe, au lieu de s'écrire à la file.", src: 'Hangeul' },
        { t: "La Corée du Sud célèbre son alphabet par un jour férié, le 9 octobre.", src: 'Hangeul' },
        { t: "Le hangeul compte 24 lettres de base — 14 consonnes et 10 voyelles — auxquelles s'ajoutent des lettres composées.", src: 'Hangeul' },
        { t: "Le coréen place le verbe à la fin de la phrase, comme le japonais.", src: 'Coréen' },
        { t: "Plusieurs niveaux de politesse changent la terminaison des verbes selon à qui l'on parle.", src: 'Coréen' },
        { t: "La Corée du Nord fête l'alphabet le 15 janvier, la Corée du Sud le 9 octobre.", src: 'Hangeul' },
        { t: "Avant le hangeul, le coréen s'écrivait principalement avec des caractères chinois, les hanja.", src: 'Hanja' },
        { t: "Le hangeul est souvent cité comme l'alphabet le plus vite appris : quelques heures suffisent pour le déchiffrer.", src: 'Hangeul' }
      ],
      mots: [
        { m: '아르바이트 (areubaiteu)', d: "de l'allemand Arbeit, « travail », arrivé par le japonais : désigne un petit boulot.", src: 'Coréen' },
        { m: '빵 (ppang)', d: "du portugais pão, arrivé par le japonais : c'est le pain.", src: 'Coréen' },
        { m: '바게트 (bageteu)', d: "du français « baguette ».", src: 'Coréen' },
        { m: '카페 (kape)', d: "du français « café », pour l'établissement.", src: 'Coréen' },
        { m: 'kimchi', d: "dans l'autre sens : le français a adopté le nom du chou fermenté coréen.", src: 'Kimchi' },
        { m: 'taekwondo', d: "du coréen 태권도, « la voie du pied et du poing ».", src: 'Taekwondo' }
      ] },

    ar: { nom: 'Arabe', src: 'Arabe',
      histoire: "L'arabe s'écrit de droite à gauche et construit ses mots sur des racines, le plus souvent de trois consonnes, d'où dérivent des familles entières de termes : de k-t-b viennent écrire, livre, bureau et écrivain. Les voyelles courtes ne s'écrivent pas, sauf dans le Coran et les livres pour enfants. L'arabe littéral sert à l'écrit, à l'école et aux médias, tandis que chaque région parle son dialecte : les linguistes appellent cela la diglossie. Aux siècles où Bagdad et Cordoue étaient des capitales savantes, l'Europe lui a emprunté son vocabulaire scientifique — algèbre, algorithme, chiffre, zéro — et plusieurs centaines de mots du quotidien.",
      chiffres: [
        { k: 'Alphabet', v: '28 lettres', src: 'Alphabet arabe' },
        { k: 'Sens de lecture', v: 'de droite à gauche', src: 'Alphabet arabe' },
        { k: 'Racines', v: 'le plus souvent 3 consonnes', src: 'Arabe' },
        { k: 'À l\'ONU', v: 'l\'une des six langues officielles', src: 'Organisation des Nations unies' }
      ],
      faits: [
        { t: "Les mots se construisent sur des racines de trois consonnes : de k-t-b viennent écrire, livre, bureau, écrivain.", src: 'Arabe' },
        { t: "L'arabe littéral sert à l'écrit et aux médias, tandis que chaque région parle son dialecte.", src: 'Diglossie' },
        { t: "Le mot « algèbre » vient de l'arabe al-jabr, tiré du titre d'un traité d'al-Khwârizmî.", src: 'Algèbre' },
        { t: "L'arabe est l'une des six langues officielles de l'ONU.", src: 'Organisation des Nations unies' },
        { t: "L'alphabet compte 28 lettres, et chaque lettre change de forme selon sa place dans le mot.", src: 'Alphabet arabe' },
        { t: "Les voyelles courtes ne s'écrivent pas, sauf dans le Coran et les livres pour enfants.", src: 'Alphabet arabe' },
        { t: "Nos chiffres sont dits « arabes » : ils sont nés en Inde et ont transité par le monde arabe.", src: 'Chiffres arabes' },
        { t: "« Chiffre » et « zéro » viennent du même mot arabe, sifr, « le vide ».", src: 'Zéro' },
        { t: "L'arabe s'écrit de droite à gauche, mais les nombres s'écrivent de gauche à droite.", src: 'Alphabet arabe' },
        { t: "Le mot « algorithme » vient du nom du savant al-Khwârizmî.", src: 'Algorithme' }
      ],
      mots: [
        { m: 'sucre', d: "de l'arabe sukkar, lui-même venu du sanskrit.", src: 'Sucre' },
        { m: 'coton', d: "de l'arabe quṭn, arrivé en Europe avec le tissu lui-même.", src: 'Coton' },
        { m: 'hasard', d: "de l'arabe az-zahr, le dé à jouer.", src: 'Hasard' },
        { m: 'matelas', d: "de l'arabe maṭraḥ, « ce qu'on jette à terre » pour dormir.", src: 'Matelas' },
        { m: 'girafe', d: "de l'arabe zarāfa : l'animal a été connu en Europe par son nom arabe.", src: 'Girafe' },
        { m: 'algèbre', d: "de al-jabr, « la remise en place » : le titre d'un traité d'al-Khwârizmî.", src: 'Algèbre' }
      ] },

    lsf: { nom: 'Langue des signes (LSF)', src: 'Langue des signes française',
      motsTitre: 'Les mots qu\'on croise en LSF',
      histoire: "La langue des signes française n'a pas été inventée par un entendant : elle existait déjà dans les communautés de sourds de Paris quand l'abbé de l'Épée, vers 1760, ouvre la première école gratuite pour enfants sourds et choisit de l'apprendre plutôt que de l'interdire. En 1816, un professeur sourd, Laurent Clerc, l'emporte aux États-Unis : la langue des signes américaine en garde la trace aujourd'hui encore. Le congrès de Milan, en 1880, lui préfère la parole et l'écarte des écoles ; il faudra attendre 1991 pour que l'enseignement bilingue redevienne un droit en France, et 2005 pour qu'elle soit reconnue comme une langue à part entière. Ce n'est pas du français avec les mains : elle a sa grammaire, qui se déploie dans l'espace et sur le visage.",
      chiffres: [
        { k: 'Première école gratuite', v: 'à Paris, vers 1760', src: 'Charles-Michel de L\'Épée' },
        { k: 'Écartée de l\'école', v: 'après le congrès de Milan, en 1880', src: 'Langue des signes française' },
        { k: 'Enseignement bilingue', v: 'à nouveau un droit en 1991', src: 'Langue des signes française' },
        { k: 'Langue à part entière', v: 'reconnue par la loi en 2005', src: 'Langue des signes française' },
        { k: 'Alphabet dans la main', v: '26 configurations, une par lettre', src: 'Dactylologie' },
        { k: 'Ce n\'est pas du français signé', v: 'une grammaire propre, dans l\'espace', src: 'Langue des signes française' }
      ],
      faits: [
        { t: "L'abbé de l'Épée n'a pas inventé cette langue : il l'a apprise auprès des sourds de Paris, puis en a fait la base de son enseignement.", src: 'Charles-Michel de L\'Épée' },
        { t: "En 1816, le professeur sourd Laurent Clerc part enseigner aux États-Unis : la langue des signes américaine descend en partie de la française.", src: 'Laurent Clerc' },
        { t: "C'est pour cela que la langue des signes américaine ressemble plus à la française qu'à la britannique, alors que l'anglais est la langue parlée des deux pays.", src: 'Langue des signes américaine' },
        { t: "En 1880, le congrès de Milan recommande l'usage exclusif de la parole dans l'éducation des sourds : les signes sont écartés des écoles pour près d'un siècle.", src: 'Langue des signes française' },
        { t: "En 1991, la loi rétablit la liberté de choisir une éducation bilingue, en langue des signes et en français.", src: 'Langue des signes française' },
        { t: "La loi du 11 février 2005 reconnaît la langue des signes française comme une langue à part entière.", src: 'Langue des signes française' },
        { t: "Le visage fait partie de la grammaire : lever ou froncer les sourcils transforme une phrase en question. Ce n'est pas de l'émotion, c'est de la syntaxe.", src: 'Langue des signes française' },
        { t: "L'alphabet dans la main ne sert pas à tout épeler : il dépanne pour les noms propres et les mots qui n'ont pas encore de signe.", src: 'Dactylologie' },
        { t: "On ne choisit pas son prénom signé : ce sont les personnes sourdes qui vous en donnent un, souvent à partir d'un détail qui vous caractérise.", src: 'Langue des signes française' },
        { t: "Il n'existe pas une langue des signes universelle : chaque pays a la sienne, née de sa propre communauté.", src: 'Langue des signes' }
      ],
      mots: [
        { m: 'dactylologie', d: "l'alphabet dans la main : une forme de main par lettre, pour épeler un nom propre.", src: 'Dactylologie' },
        { m: 'prénom signé', d: "le signe qui vous désigne. Ce sont les personnes sourdes qui vous le donnent — on ne se le choisit pas.", src: 'Langue des signes française' },
        { m: 'configuration', d: "la forme que prend la main. Avec l'emplacement, le mouvement et l'orientation, c'est ce qui fait un signe.", src: 'Langue des signes française' },
        { m: 'iconicité', d: "quand le signe garde la trace de ce qu'il désigne. Très présente en LSF — mais un signe n'est pas un mime.", src: 'Langue des signes française' },
        { m: 'Sourd, avec un grand S', d: "la majuscule dit l'appartenance à une culture et à une langue, pas le niveau d'audition.", src: 'Culture sourde' },
        { m: 'LPC', d: "un code de la main qui accompagne le français parlé. Ce n'est pas la LSF : c'est un autre outil, pour un autre usage.", src: 'Langue française parlée complétée' }
      ] },
    mc: { nom: 'Monégasque', src: 'Monégasque',
      histoire: "Le monégasque (munegascu) est un parler ligure, cousin du génois, propre au Rocher de Monaco. Louis Notari en fixe l'écriture en 1927, en s'inspirant du français et de l'italien, avec le premier livre écrit dans la langue : A Legenda de Santa Devota. Menacé de disparition dans les années 1970 — les Monégasques sont minoritaires dans leur propre pays —, il reprend souffle grâce à son entrée obligatoire à l'école en 1977, du CE2 au collège. Il n'est pas la langue officielle de la principauté, qui reste le français, mais on le lit sur toutes les plaques de rue, et un concours officiel le célèbre chaque année depuis 1981.",
      chiffres: [
        { k: 'Famille', v: 'ligure, comme le génois', src: 'Ligure' },
        { k: 'Écriture fixée', v: 'en 1927 par Louis Notari', src: 'Monégasque' },
        { k: 'À l\'école', v: 'obligatoire depuis 1977', src: 'Monégasque' },
        { k: 'Langue officielle de Monaco', v: 'le français, pas le monégasque', src: 'Monaco' }
      ],
      faits: [
        { t: "Son apprentissage est obligatoire à l'école à Monaco depuis 1977, du CE2 jusqu'au collège.", src: 'Monégasque' },
        { t: "Louis Notari a codifié son écriture en 1927 ; la première grammaire et le premier dictionnaire datent de 1960 et 1963.", src: 'Monégasque' },
        { t: "Les plaques de rue de Monaco sont bilingues, en français et en monégasque.", src: 'Monégasque' },
        { t: "Le monégasque n'est pas la langue officielle de la principauté : c'est le français.", src: 'Monégasque' },
        { t: "Depuis 1981, un concours officiel de langue, culture et histoire monégasques est organisé chaque année.", src: 'Monégasque' },
        { t: "C'est un parler ligure : il est plus proche du génois que de l'italien standard.", src: 'Ligure' },
        { t: "Le premier livre écrit en monégasque, A Legenda de Santa Devota, paraît en 1927.", src: 'Louis Notari' },
        { t: "« Munegascu » est le nom que la langue se donne à elle-même, et « Munegu » celui de Monaco.", src: 'Monégasque' },
        { t: "Les Monégasques sont minoritaires dans leur propre pays, ce qui rend la transmission d'autant plus fragile.", src: 'Monaco' },
        { t: "Les paroles monégasques de l'hymne de Monaco sont de Louis Notari, celui-là même qui a fixé l'écriture de la langue.", src: 'Louis Notari' }
      ],
      mots: [
        { m: 'u portu', d: "le port — le français, l'italien et le monégasque disent presque la même chose.", src: 'Monégasque', url: 'http://munegascu.free.fr/transport.htm' },
        { m: 'a marina', d: "la mer — même racine latine que notre « marine ».", src: 'Monégasque', url: 'http://munegascu.free.fr/nature.htm' },
        { m: 'u carrugiu', d: "la rue — le même mot qu'à Gênes, où les carruggi sont les ruelles.", src: 'Monégasque', url: 'http://munegascu.free.fr/ville.htm' },
        { m: 'a piaça', d: "la place, comme la piazza italienne.", src: 'Monégasque', url: 'http://munegascu.free.fr/ville.htm' },
        { m: 'bon giurnu', d: "bonjour, mot à mot « bon jour ».", src: 'Monégasque', url: 'http://munegascu.free.fr/bienvenue.htm' },
        { m: 'a muntagna', d: "la montagne — le même mot qu'en italien, « la montagna ».", src: 'Monégasque', url: 'http://munegascu.free.fr/nature.htm' }
      ] }
  };

  racine.LANG_HISTOIRE = LANG_HISTOIRE;
  if (typeof module !== 'undefined' && module.exports) module.exports = { LANG_HISTOIRE: LANG_HISTOIRE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
