/* KDMC Lingua — contenu (100% original, aucun contenu tiers).
   Architecture : un CURRICULUM commun (par sens, en français) + un LEXIQUE par langue.
   COURSES est généré automatiquement → ajouter du contenu = éditer CURRICULUM + LEX. */

var LANGS = ["en","it","es","de","pt","nl"];
var LMETA = {
  en:{nom:"Anglais",   drapeau:"🇬🇧", tts:"en-US"},
  it:{nom:"Italien",   drapeau:"🇮🇹", tts:"it-IT"},
  es:{nom:"Espagnol",  drapeau:"🇪🇸", tts:"es-ES"},
  de:{nom:"Allemand",  drapeau:"🇩🇪", tts:"de-DE"},
  pt:{nom:"Portugais", drapeau:"🇵🇹", tts:"pt-PT"},
  nl:{nom:"Néerlandais",drapeau:"🇳🇱",tts:"nl-NL"}
};

/* --- Programme : unités → leçons → mots (fr) + phrases (fr) --- */
var CURRICULUM = [
  {t:"Les bases 🌱", c:"#12b981", L:[
    {t:"Salutations", w:["bonjour","salut","au revoir","merci","oui","non","s'il te plaît","pardon"]},
    {t:"Les gens", w:["homme","femme","garçon","fille","ami","enfant","nom","moi"], p:["je suis un homme","elle est une femme"]},
    {t:"Objets du quotidien", w:["eau","pain","maison","livre","chien","chat"], p:["le chat boit de l'eau"]} ]},
  {t:"Nourriture 🍎", c:"#f6b73c", L:[
    {t:"À boire", w:["café","lait","vin","thé","jus","bière"], p:["je bois du café"]},
    {t:"À manger", w:["pomme","fromage","poisson","viande","riz","œuf","gâteau","soupe"], p:["je mange une pomme","nous mangeons du riz"]} ]},
  {t:"Les nombres 🔢", c:"#3b82f6", L:[
    {t:"De 0 à 5", w:["zéro","un","deux","trois","quatre","cinq"]},
    {t:"De 6 à 100", w:["six","sept","huit","neuf","dix","cent"], p:["j'ai deux chats","trois pommes"]} ]},
  {t:"La famille 👪", c:"#ec4899", L:[
    {t:"Les proches", w:["mère","père","frère","sœur"]},
    {t:"La famille", w:["grand-mère","grand-père","bébé","famille"]} ]},
  {t:"Les couleurs 🎨", c:"#8b5cf6", L:[
    {t:"Couleurs vives", w:["rouge","bleu","vert","jaune"], p:["une fleur rouge"]},
    {t:"Noir, blanc & pastels", w:["noir","blanc","orange","rose"], p:["le chat est noir"]} ]},
  {t:"Les animaux 🐾", c:"#14b8a6", L:[
    {t:"À la ferme", w:["cheval","oiseau","vache","poule"]},
    {t:"Petits animaux", w:["cochon","lapin","mouton","souris"]} ]},
  {t:"Le temps ⏰", c:"#f97316", L:[
    {t:"Les moments", w:["jour","nuit","matin","soir"]},
    {t:"Les durées", w:["semaine","mois","année","heure","minute"]},
    {t:"Les repères", w:["aujourd'hui","demain","hier"]} ]},
  {t:"Voyage ✈️", c:"#7c3aed", L:[
    {t:"En ville", w:["gare","hôtel","rue","gauche","droite","ici"], p:["où est la gare"]},
    {t:"Décrire", w:["grand","petit","nouveau","beau","bon","vite"], p:["la maison est grande","c'est un bon café"]} ]},
  {t:"À la maison 🏠", c:"#0ea5e9", L:[
    {t:"Les objets", w:["table","chaise","lit","porte","fenêtre","clé","téléphone","lampe"], p:["nous avons une maison"]} ]},
  {t:"Les vêtements 👕", c:"#e11d48", L:[
    {t:"Les habits", w:["chemise","pantalon","chaussures","robe","chapeau","manteau"]} ]},
  {t:"La nature 🌿", c:"#22c55e", L:[
    {t:"Dehors", w:["soleil","lune","mer","montagne"], p:["le soleil est grand"]},
    {t:"Le paysage", w:["arbre","fleur","ciel","plage"]} ]},
  {t:"Phrases 💬", c:"#a855f7", L:[
    {t:"Les verbes", w:["oui","non","bon"], p:["je parle","tu vas","il a un chien","nous avons une maison","j'aime le café"]} ]}
];

/* --- Lexique par langue : fr → traduction (mots ET phrases) --- */
var LEX = {
  en:{ "bonjour":"hello","salut":"hi","au revoir":"goodbye","merci":"thank you","oui":"yes","non":"no","s'il te plaît":"please","pardon":"sorry",
    "homme":"man","femme":"woman","garçon":"boy","fille":"girl","ami":"friend","enfant":"child","nom":"name","moi":"me",
    "eau":"water","pain":"bread","maison":"house","livre":"book","chien":"dog","chat":"cat",
    "café":"coffee","lait":"milk","vin":"wine","thé":"tea","jus":"juice","bière":"beer",
    "pomme":"apple","fromage":"cheese","poisson":"fish","viande":"meat","riz":"rice","œuf":"egg","gâteau":"cake","soupe":"soup",
    "zéro":"zero","un":"one","deux":"two","trois":"three","quatre":"four","cinq":"five","six":"six","sept":"seven","huit":"eight","neuf":"nine","dix":"ten","cent":"hundred",
    "mère":"mother","père":"father","frère":"brother","sœur":"sister","grand-mère":"grandmother","grand-père":"grandfather","bébé":"baby","famille":"family",
    "rouge":"red","bleu":"blue","vert":"green","jaune":"yellow","noir":"black","blanc":"white","orange":"orange","rose":"pink",
    "cheval":"horse","oiseau":"bird","vache":"cow","poule":"hen","cochon":"pig","lapin":"rabbit","mouton":"sheep","souris":"mouse",
    "jour":"day","nuit":"night","matin":"morning","soir":"evening","semaine":"week","mois":"month","année":"year","heure":"hour","minute":"minute","aujourd'hui":"today","demain":"tomorrow","hier":"yesterday",
    "gare":"station","hôtel":"hotel","rue":"street","gauche":"left","droite":"right","ici":"here","grand":"big","petit":"small","nouveau":"new","beau":"beautiful","bon":"good","vite":"fast",
    "table":"table","chaise":"chair","lit":"bed","porte":"door","fenêtre":"window","clé":"key","téléphone":"phone","lampe":"lamp",
    "chemise":"shirt","pantalon":"trousers","chaussures":"shoes","robe":"dress","chapeau":"hat","manteau":"coat",
    "soleil":"sun","lune":"moon","mer":"sea","montagne":"mountain","arbre":"tree","fleur":"flower","ciel":"sky","plage":"beach",
    "je suis un homme":"i am a man","elle est une femme":"she is a woman","le chat boit de l'eau":"the cat drinks water","je bois du café":"i drink coffee","je mange une pomme":"i eat an apple","nous mangeons du riz":"we eat rice","où est la gare":"where is the station","la maison est grande":"the house is big","c'est un bon café":"it is a good coffee","j'ai deux chats":"i have two cats","trois pommes":"three apples","le chat est noir":"the cat is black","une fleur rouge":"a red flower","je parle":"i speak","tu vas":"you go","il a un chien":"he has a dog","nous avons une maison":"we have a house","le soleil est grand":"the sun is big","j'aime le café":"i like coffee" },

  it:{ "bonjour":"buongiorno","salut":"ciao","au revoir":"arrivederci","merci":"grazie","oui":"sì","non":"no","s'il te plaît":"per favore","pardon":"scusa",
    "homme":"uomo","femme":"donna","garçon":"ragazzo","fille":"ragazza","ami":"amico","enfant":"bambino","nom":"nome","moi":"io",
    "eau":"acqua","pain":"pane","maison":"casa","livre":"libro","chien":"cane","chat":"gatto",
    "café":"caffè","lait":"latte","vin":"vino","thé":"tè","jus":"succo","bière":"birra",
    "pomme":"mela","fromage":"formaggio","poisson":"pesce","viande":"carne","riz":"riso","œuf":"uovo","gâteau":"torta","soupe":"zuppa",
    "zéro":"zero","un":"uno","deux":"due","trois":"tre","quatre":"quattro","cinq":"cinque","six":"sei","sept":"sette","huit":"otto","neuf":"nove","dix":"dieci","cent":"cento",
    "mère":"madre","père":"padre","frère":"fratello","sœur":"sorella","grand-mère":"nonna","grand-père":"nonno","bébé":"bebè","famille":"famiglia",
    "rouge":"rosso","bleu":"blu","vert":"verde","jaune":"giallo","noir":"nero","blanc":"bianco","orange":"arancione","rose":"rosa",
    "cheval":"cavallo","oiseau":"uccello","vache":"mucca","poule":"gallina","cochon":"maiale","lapin":"coniglio","mouton":"pecora","souris":"topo",
    "jour":"giorno","nuit":"notte","matin":"mattina","soir":"sera","semaine":"settimana","mois":"mese","année":"anno","heure":"ora","minute":"minuto","aujourd'hui":"oggi","demain":"domani","hier":"ieri",
    "gare":"stazione","hôtel":"albergo","rue":"strada","gauche":"sinistra","droite":"destra","ici":"qui","grand":"grande","petit":"piccolo","nouveau":"nuovo","beau":"bello","bon":"buono","vite":"veloce",
    "table":"tavolo","chaise":"sedia","lit":"letto","porte":"porta","fenêtre":"finestra","clé":"chiave","téléphone":"telefono","lampe":"lampada",
    "chemise":"camicia","pantalon":"pantaloni","chaussures":"scarpe","robe":"vestito","chapeau":"cappello","manteau":"cappotto",
    "soleil":"sole","lune":"luna","mer":"mare","montagne":"montagna","arbre":"albero","fleur":"fiore","ciel":"cielo","plage":"spiaggia",
    "je suis un homme":"io sono un uomo","elle est une femme":"lei è una donna","le chat boit de l'eau":"il gatto beve acqua","je bois du café":"io bevo caffè","je mange une pomme":"io mangio una mela","nous mangeons du riz":"noi mangiamo riso","où est la gare":"dov'è la stazione","la maison est grande":"la casa è grande","c'est un bon café":"è un buon caffè","j'ai deux chats":"io ho due gatti","trois pommes":"tre mele","le chat est noir":"il gatto è nero","une fleur rouge":"un fiore rosso","je parle":"io parlo","tu vas":"tu vai","il a un chien":"lui ha un cane","nous avons une maison":"noi abbiamo una casa","le soleil est grand":"il sole è grande","j'aime le café":"mi piace il caffè" },

  es:{ "bonjour":"buenos días","salut":"hola","au revoir":"adiós","merci":"gracias","oui":"sí","non":"no","s'il te plaît":"por favor","pardon":"perdón",
    "homme":"hombre","femme":"mujer","garçon":"chico","fille":"chica","ami":"amigo","enfant":"niño","nom":"nombre","moi":"yo",
    "eau":"agua","pain":"pan","maison":"casa","livre":"libro","chien":"perro","chat":"gato",
    "café":"café","lait":"leche","vin":"vino","thé":"té","jus":"zumo","bière":"cerveza",
    "pomme":"manzana","fromage":"queso","poisson":"pescado","viande":"carne","riz":"arroz","œuf":"huevo","gâteau":"pastel","soupe":"sopa",
    "zéro":"cero","un":"uno","deux":"dos","trois":"tres","quatre":"cuatro","cinq":"cinco","six":"seis","sept":"siete","huit":"ocho","neuf":"nueve","dix":"diez","cent":"cien",
    "mère":"madre","père":"padre","frère":"hermano","sœur":"hermana","grand-mère":"abuela","grand-père":"abuelo","bébé":"bebé","famille":"familia",
    "rouge":"rojo","bleu":"azul","vert":"verde","jaune":"amarillo","noir":"negro","blanc":"blanco","orange":"naranja","rose":"rosa",
    "cheval":"caballo","oiseau":"pájaro","vache":"vaca","poule":"gallina","cochon":"cerdo","lapin":"conejo","mouton":"oveja","souris":"ratón",
    "jour":"día","nuit":"noche","matin":"mañana","soir":"tarde","semaine":"semana","mois":"mes","année":"año","heure":"hora","minute":"minuto","aujourd'hui":"hoy","demain":"mañana","hier":"ayer",
    "gare":"estación","hôtel":"hotel","rue":"calle","gauche":"izquierda","droite":"derecha","ici":"aquí","grand":"grande","petit":"pequeño","nouveau":"nuevo","beau":"bonito","bon":"bueno","vite":"rápido",
    "table":"mesa","chaise":"silla","lit":"cama","porte":"puerta","fenêtre":"ventana","clé":"llave","téléphone":"teléfono","lampe":"lámpara",
    "chemise":"camisa","pantalon":"pantalón","chaussures":"zapatos","robe":"vestido","chapeau":"sombrero","manteau":"abrigo",
    "soleil":"sol","lune":"luna","mer":"mar","montagne":"montaña","arbre":"árbol","fleur":"flor","ciel":"cielo","plage":"playa",
    "je suis un homme":"yo soy un hombre","elle est une femme":"ella es una mujer","le chat boit de l'eau":"el gato bebe agua","je bois du café":"yo bebo café","je mange une pomme":"yo como una manzana","nous mangeons du riz":"nosotros comemos arroz","où est la gare":"dónde está la estación","la maison est grande":"la casa es grande","c'est un bon café":"es un buen café","j'ai deux chats":"yo tengo dos gatos","trois pommes":"tres manzanas","le chat est noir":"el gato es negro","une fleur rouge":"una flor roja","je parle":"yo hablo","tu vas":"tú vas","il a un chien":"él tiene un perro","nous avons une maison":"nosotros tenemos una casa","le soleil est grand":"el sol es grande","j'aime le café":"me gusta el café" },

  de:{ "bonjour":"guten Tag","salut":"hallo","au revoir":"auf Wiedersehen","merci":"danke","oui":"ja","non":"nein","s'il te plaît":"bitte","pardon":"Entschuldigung",
    "homme":"Mann","femme":"Frau","garçon":"Junge","fille":"Mädchen","ami":"Freund","enfant":"Kind","nom":"Name","moi":"ich",
    "eau":"Wasser","pain":"Brot","maison":"Haus","livre":"Buch","chien":"Hund","chat":"Katze",
    "café":"Kaffee","lait":"Milch","vin":"Wein","thé":"Tee","jus":"Saft","bière":"Bier",
    "pomme":"Apfel","fromage":"Käse","poisson":"Fisch","viande":"Fleisch","riz":"Reis","œuf":"Ei","gâteau":"Kuchen","soupe":"Suppe",
    "zéro":"null","un":"eins","deux":"zwei","trois":"drei","quatre":"vier","cinq":"fünf","six":"sechs","sept":"sieben","huit":"acht","neuf":"neun","dix":"zehn","cent":"hundert",
    "mère":"Mutter","père":"Vater","frère":"Bruder","sœur":"Schwester","grand-mère":"Großmutter","grand-père":"Großvater","bébé":"Baby","famille":"Familie",
    "rouge":"rot","bleu":"blau","vert":"grün","jaune":"gelb","noir":"schwarz","blanc":"weiß","orange":"orange","rose":"rosa",
    "cheval":"Pferd","oiseau":"Vogel","vache":"Kuh","poule":"Henne","cochon":"Schwein","lapin":"Kaninchen","mouton":"Schaf","souris":"Maus",
    "jour":"Tag","nuit":"Nacht","matin":"Morgen","soir":"Abend","semaine":"Woche","mois":"Monat","année":"Jahr","heure":"Stunde","minute":"Minute","aujourd'hui":"heute","demain":"morgen","hier":"gestern",
    "gare":"Bahnhof","hôtel":"Hotel","rue":"Straße","gauche":"links","droite":"rechts","ici":"hier","grand":"groß","petit":"klein","nouveau":"neu","beau":"schön","bon":"gut","vite":"schnell",
    "table":"Tisch","chaise":"Stuhl","lit":"Bett","porte":"Tür","fenêtre":"Fenster","clé":"Schlüssel","téléphone":"Telefon","lampe":"Lampe",
    "chemise":"Hemd","pantalon":"Hose","chaussures":"Schuhe","robe":"Kleid","chapeau":"Hut","manteau":"Mantel",
    "soleil":"Sonne","lune":"Mond","mer":"Meer","montagne":"Berg","arbre":"Baum","fleur":"Blume","ciel":"Himmel","plage":"Strand",
    "je suis un homme":"ich bin ein Mann","elle est une femme":"sie ist eine Frau","le chat boit de l'eau":"die Katze trinkt Wasser","je bois du café":"ich trinke Kaffee","je mange une pomme":"ich esse einen Apfel","nous mangeons du riz":"wir essen Reis","où est la gare":"wo ist der Bahnhof","la maison est grande":"das Haus ist groß","c'est un bon café":"das ist ein guter Kaffee","j'ai deux chats":"ich habe zwei Katzen","trois pommes":"drei Äpfel","le chat est noir":"die Katze ist schwarz","une fleur rouge":"eine rote Blume","je parle":"ich spreche","tu vas":"du gehst","il a un chien":"er hat einen Hund","nous avons une maison":"wir haben ein Haus","le soleil est grand":"die Sonne ist groß","j'aime le café":"ich mag Kaffee" },

  pt:{ "bonjour":"bom dia","salut":"olá","au revoir":"adeus","merci":"obrigado","oui":"sim","non":"não","s'il te plaît":"por favor","pardon":"desculpa",
    "homme":"homem","femme":"mulher","garçon":"menino","fille":"menina","ami":"amigo","enfant":"criança","nom":"nome","moi":"eu",
    "eau":"água","pain":"pão","maison":"casa","livre":"livro","chien":"cão","chat":"gato",
    "café":"café","lait":"leite","vin":"vinho","thé":"chá","jus":"sumo","bière":"cerveja",
    "pomme":"maçã","fromage":"queijo","poisson":"peixe","viande":"carne","riz":"arroz","œuf":"ovo","gâteau":"bolo","soupe":"sopa",
    "zéro":"zero","un":"um","deux":"dois","trois":"três","quatre":"quatro","cinq":"cinco","six":"seis","sept":"sete","huit":"oito","neuf":"nove","dix":"dez","cent":"cem",
    "mère":"mãe","père":"pai","frère":"irmão","sœur":"irmã","grand-mère":"avó","grand-père":"avô","bébé":"bebé","famille":"família",
    "rouge":"vermelho","bleu":"azul","vert":"verde","jaune":"amarelo","noir":"preto","blanc":"branco","orange":"laranja","rose":"cor-de-rosa",
    "cheval":"cavalo","oiseau":"pássaro","vache":"vaca","poule":"galinha","cochon":"porco","lapin":"coelho","mouton":"ovelha","souris":"rato",
    "jour":"dia","nuit":"noite","matin":"manhã","soir":"tarde","semaine":"semana","mois":"mês","année":"ano","heure":"hora","minute":"minuto","aujourd'hui":"hoje","demain":"amanhã","hier":"ontem",
    "gare":"estação","hôtel":"hotel","rue":"rua","gauche":"esquerda","droite":"direita","ici":"aqui","grand":"grande","petit":"pequeno","nouveau":"novo","beau":"bonito","bon":"bom","vite":"rápido",
    "table":"mesa","chaise":"cadeira","lit":"cama","porte":"porta","fenêtre":"janela","clé":"chave","téléphone":"telefone","lampe":"lâmpada",
    "chemise":"camisa","pantalon":"calças","chaussures":"sapatos","robe":"vestido","chapeau":"chapéu","manteau":"casaco",
    "soleil":"sol","lune":"lua","mer":"mar","montagne":"montanha","arbre":"árvore","fleur":"flor","ciel":"céu","plage":"praia",
    "je suis un homme":"eu sou um homem","elle est une femme":"ela é uma mulher","le chat boit de l'eau":"o gato bebe água","je bois du café":"eu bebo café","je mange une pomme":"eu como uma maçã","nous mangeons du riz":"nós comemos arroz","où est la gare":"onde é a estação","la maison est grande":"a casa é grande","c'est un bon café":"é um bom café","j'ai deux chats":"eu tenho dois gatos","trois pommes":"três maçãs","le chat est noir":"o gato é preto","une fleur rouge":"uma flor vermelha","je parle":"eu falo","tu vas":"tu vais","il a un chien":"ele tem um cão","nous avons une maison":"nós temos uma casa","le soleil est grand":"o sol é grande","j'aime le café":"eu gosto de café" },

  nl:{ "bonjour":"goedendag","salut":"hallo","au revoir":"tot ziens","merci":"dank je","oui":"ja","non":"nee","s'il te plaît":"alsjeblieft","pardon":"sorry",
    "homme":"man","femme":"vrouw","garçon":"jongen","fille":"meisje","ami":"vriend","enfant":"kind","nom":"naam","moi":"ik",
    "eau":"water","pain":"brood","maison":"huis","livre":"boek","chien":"hond","chat":"kat",
    "café":"koffie","lait":"melk","vin":"wijn","thé":"thee","jus":"sap","bière":"bier",
    "pomme":"appel","fromage":"kaas","poisson":"vis","viande":"vlees","riz":"rijst","œuf":"ei","gâteau":"taart","soupe":"soep",
    "zéro":"nul","un":"één","deux":"twee","trois":"drie","quatre":"vier","cinq":"vijf","six":"zes","sept":"zeven","huit":"acht","neuf":"negen","dix":"tien","cent":"honderd",
    "mère":"moeder","père":"vader","frère":"broer","sœur":"zus","grand-mère":"oma","grand-père":"opa","bébé":"baby","famille":"familie",
    "rouge":"rood","bleu":"blauw","vert":"groen","jaune":"geel","noir":"zwart","blanc":"wit","orange":"oranje","rose":"roze",
    "cheval":"paard","oiseau":"vogel","vache":"koe","poule":"kip","cochon":"varken","lapin":"konijn","mouton":"schaap","souris":"muis",
    "jour":"dag","nuit":"nacht","matin":"ochtend","soir":"avond","semaine":"week","mois":"maand","année":"jaar","heure":"uur","minute":"minuut","aujourd'hui":"vandaag","demain":"morgen","hier":"gisteren",
    "gare":"station","hôtel":"hotel","rue":"straat","gauche":"links","droite":"rechts","ici":"hier","grand":"groot","petit":"klein","nouveau":"nieuw","beau":"mooi","bon":"goed","vite":"snel",
    "table":"tafel","chaise":"stoel","lit":"bed","porte":"deur","fenêtre":"raam","clé":"sleutel","téléphone":"telefoon","lampe":"lamp",
    "chemise":"overhemd","pantalon":"broek","chaussures":"schoenen","robe":"jurk","chapeau":"hoed","manteau":"jas",
    "soleil":"zon","lune":"maan","mer":"zee","montagne":"berg","arbre":"boom","fleur":"bloem","ciel":"hemel","plage":"strand",
    "je suis un homme":"ik ben een man","elle est une femme":"zij is een vrouw","le chat boit de l'eau":"de kat drinkt water","je bois du café":"ik drink koffie","je mange une pomme":"ik eet een appel","nous mangeons du riz":"wij eten rijst","où est la gare":"waar is het station","la maison est grande":"het huis is groot","c'est un bon café":"het is een goede koffie","j'ai deux chats":"ik heb twee katten","trois pommes":"drie appels","le chat est noir":"de kat is zwart","une fleur rouge":"een rode bloem","je parle":"ik spreek","tu vas":"jij gaat","il a un chien":"hij heeft een hond","nous avons une maison":"wij hebben een huis","le soleil est grand":"de zon is groot","j'aime le café":"ik hou van koffie" }
};

/* --- Phrasier voyage (pour le traducteur) --- */
var PHRASEBOOK = {
  "comment ça va":{en:"how are you",it:"come stai",es:"cómo estás",de:"wie geht's",pt:"como estás",nl:"hoe gaat het"},
  "je ne comprends pas":{en:"i don't understand",it:"non capisco",es:"no entiendo",de:"ich verstehe nicht",pt:"não percebo",nl:"ik begrijp het niet"},
  "parlez-vous anglais":{en:"do you speak english",it:"parli inglese",es:"hablas inglés",de:"sprichst du Englisch",pt:"falas inglês",nl:"spreek je Engels"},
  "où sont les toilettes":{en:"where is the toilet",it:"dov'è il bagno",es:"dónde está el baño",de:"wo ist die Toilette",pt:"onde é a casa de banho",nl:"waar is het toilet"},
  "combien ça coûte":{en:"how much is it",it:"quanto costa",es:"cuánto cuesta",de:"wie viel kostet das",pt:"quanto custa",nl:"hoeveel kost het"},
  "l'addition s'il vous plaît":{en:"the bill please",it:"il conto per favore",es:"la cuenta por favor",de:"die Rechnung bitte",pt:"a conta por favor",nl:"de rekening alstublieft"},
  "aidez-moi":{en:"help me",it:"aiutami",es:"ayúdame",de:"hilf mir",pt:"ajuda-me",nl:"help me"},
  "je suis perdu":{en:"i am lost",it:"mi sono perso",es:"estoy perdido",de:"ich habe mich verlaufen",pt:"estou perdido",nl:"ik ben verdwaald"},
  "je t'aime":{en:"i love you",it:"ti amo",es:"te quiero",de:"ich liebe dich",pt:"amo-te",nl:"ik hou van je"},
  "bonne journée":{en:"have a good day",it:"buona giornata",es:"buen día",de:"schönen Tag",pt:"tenha um bom dia",nl:"fijne dag"},
  "santé":{en:"cheers",it:"salute",es:"salud",de:"prost",pt:"saúde",nl:"proost"},
  "bienvenue":{en:"welcome",it:"benvenuto",es:"bienvenido",de:"willkommen",pt:"bem-vindo",nl:"welkom"}
};

/* --- EXTENSION DE CONTENU (100% original) : +13 unités, 6 langues --- */
var CURRICULUM_X = [
  {t:"Verbes essentiels 🗣️", c:"#0891b2", L:[
    {t:"Verbes 1", w:["être","avoir","aller","faire","venir","voir","vouloir","pouvoir"]},
    {t:"Verbes 2", w:["manger","boire","parler","aimer","savoir","dire","donner","dormir"]} ]},
  {t:"Le corps 🧍", c:"#d946ef", L:[
    {t:"Le visage", w:["tête","cheveux","œil","nez","bouche","oreille","dent"]},
    {t:"Le corps", w:["main","bras","jambe","pied","doigt","cœur","dos","ventre"]} ]},
  {t:"Fruits et légumes 🥕", c:"#65a30d", L:[
    {t:"Les fruits", w:["fruit","banane","fraise","citron","raisin","poire"]},
    {t:"Les légumes", w:["légume","tomate","carotte","oignon","salade","pomme de terre"]} ]},
  {t:"En ville 🏙️", c:"#0d9488", L:[
    {t:"Les lieux", w:["ville","magasin","marché","banque","école","hôpital","pharmacie"]},
    {t:"Lieux à connaître", w:["restaurant","église","parc","pont","aéroport","musée"]} ]},
  {t:"Les transports 🚗", c:"#ea580c", L:[
    {t:"Sur la route", w:["voiture","bus","vélo","moto","taxi","camion"]},
    {t:"Voyager", w:["train","avion","bateau","métro"]} ]},
  {t:"Les métiers 👩‍⚕️", c:"#be123c", L:[
    {t:"Métiers 1", w:["médecin","professeur","cuisinier","policier","serveur"]},
    {t:"Métiers 2", w:["avocat","ingénieur","artiste","boulanger","agriculteur"]} ]},
  {t:"Jours et saisons 📅", c:"#4f46e5", L:[
    {t:"Les jours", w:["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"]},
    {t:"Les saisons", w:["printemps","été","automne","hiver"]} ]},
  {t:"La météo ☔", c:"#0284c7", L:[
    {t:"Le temps qu'il fait", w:["pluie","neige","vent","nuage","orage","chaud","froid"], p:["il pleut","il fait chaud"]} ]},
  {t:"Adjectifs utiles ✨", c:"#9333ea", L:[
    {t:"Contraires 1", w:["heureux","triste","facile","difficile","jeune","vieux"]},
    {t:"Contraires 2", w:["propre","sale","plein","vide","cher","content"]} ]},
  {t:"Au restaurant 🍽️", c:"#db2777", L:[
    {t:"Commander", w:["menu","plat","entrée","dessert","addition"]},
    {t:"À table", w:["fourchette","couteau","cuillère","assiette","verre","tasse"]} ]},
  {t:"Les achats 🛒", c:"#16a34a", L:[
    {t:"Payer", w:["argent","prix","euro","carte","monnaie"]},
    {t:"Verbes utiles", w:["acheter","vendre","payer","coûter"]} ]},
  {t:"Poser des questions ❓", c:"#c026d3", L:[
    {t:"Mots interrogatifs", w:["qui","quoi","où","quand","comment","pourquoi","combien"]} ]},
  {t:"Encore des nombres 🔢", c:"#2563eb", L:[
    {t:"11 à 20", w:["onze","douze","treize","quatorze","quinze","seize","dix-sept","dix-huit","dix-neuf","vingt"]},
    {t:"Les dizaines", w:["trente","quarante","cinquante","mille"]} ]}
];
var LEX_X = {
  en:{ "être":"to be","avoir":"to have","aller":"to go","faire":"to do","venir":"to come","voir":"to see","vouloir":"to want","pouvoir":"can","manger":"to eat","boire":"to drink","parler":"to speak","aimer":"to love","savoir":"to know","dire":"to say","donner":"to give","dormir":"to sleep",
    "tête":"head","cheveux":"hair","œil":"eye","nez":"nose","bouche":"mouth","oreille":"ear","dent":"tooth","main":"hand","bras":"arm","jambe":"leg","pied":"foot","doigt":"finger","cœur":"heart","dos":"back","ventre":"belly",
    "fruit":"fruit","banane":"banana","fraise":"strawberry","citron":"lemon","raisin":"grape","poire":"pear","légume":"vegetable","tomate":"tomato","carotte":"carrot","oignon":"onion","salade":"salad","pomme de terre":"potato",
    "ville":"city","magasin":"shop","marché":"market","banque":"bank","école":"school","hôpital":"hospital","pharmacie":"pharmacy","restaurant":"restaurant","église":"church","parc":"park","pont":"bridge","aéroport":"airport","musée":"museum",
    "voiture":"car","bus":"bus","vélo":"bike","moto":"motorbike","taxi":"taxi","camion":"truck","train":"train","avion":"plane","bateau":"boat","métro":"metro",
    "médecin":"doctor","professeur":"teacher","cuisinier":"cook","policier":"policeman","serveur":"waiter","avocat":"lawyer","ingénieur":"engineer","artiste":"artist","boulanger":"baker","agriculteur":"farmer",
    "lundi":"Monday","mardi":"Tuesday","mercredi":"Wednesday","jeudi":"Thursday","vendredi":"Friday","samedi":"Saturday","dimanche":"Sunday","printemps":"spring","été":"summer","automne":"autumn","hiver":"winter",
    "pluie":"rain","neige":"snow","vent":"wind","nuage":"cloud","orage":"storm","chaud":"hot","froid":"cold","il pleut":"it is raining","il fait chaud":"it is hot",
    "heureux":"happy","triste":"sad","facile":"easy","difficile":"hard","jeune":"young","vieux":"old","propre":"clean","sale":"dirty","plein":"full","vide":"empty","cher":"expensive","content":"glad",
    "menu":"menu","plat":"dish","entrée":"starter","dessert":"dessert","addition":"bill","fourchette":"fork","couteau":"knife","cuillère":"spoon","assiette":"plate","verre":"glass","tasse":"cup",
    "argent":"money","prix":"price","euro":"euro","carte":"card","monnaie":"change","acheter":"to buy","vendre":"to sell","payer":"to pay","coûter":"to cost",
    "qui":"who","quoi":"what","où":"where","quand":"when","comment":"how","pourquoi":"why","combien":"how much",
    "onze":"eleven","douze":"twelve","treize":"thirteen","quatorze":"fourteen","quinze":"fifteen","seize":"sixteen","dix-sept":"seventeen","dix-huit":"eighteen","dix-neuf":"nineteen","vingt":"twenty","trente":"thirty","quarante":"forty","cinquante":"fifty","mille":"thousand" },
  it:{ "être":"essere","avoir":"avere","aller":"andare","faire":"fare","venir":"venire","voir":"vedere","vouloir":"volere","pouvoir":"potere","manger":"mangiare","boire":"bere","parler":"parlare","aimer":"amare","savoir":"sapere","dire":"dire","donner":"dare","dormir":"dormire",
    "tête":"testa","cheveux":"capelli","œil":"occhio","nez":"naso","bouche":"bocca","oreille":"orecchio","dent":"dente","main":"mano","bras":"braccio","jambe":"gamba","pied":"piede","doigt":"dito","cœur":"cuore","dos":"schiena","ventre":"pancia",
    "fruit":"frutta","banane":"banana","fraise":"fragola","citron":"limone","raisin":"uva","poire":"pera","légume":"verdura","tomate":"pomodoro","carotte":"carota","oignon":"cipolla","salade":"insalata","pomme de terre":"patata",
    "ville":"città","magasin":"negozio","marché":"mercato","banque":"banca","école":"scuola","hôpital":"ospedale","pharmacie":"farmacia","restaurant":"ristorante","église":"chiesa","parc":"parco","pont":"ponte","aéroport":"aeroporto","musée":"museo",
    "voiture":"macchina","bus":"autobus","vélo":"bicicletta","moto":"moto","taxi":"taxi","camion":"camion","train":"treno","avion":"aereo","bateau":"barca","métro":"metropolitana",
    "médecin":"medico","professeur":"insegnante","cuisinier":"cuoco","policier":"poliziotto","serveur":"cameriere","avocat":"avvocato","ingénieur":"ingegnere","artiste":"artista","boulanger":"panettiere","agriculteur":"agricoltore",
    "lundi":"lunedì","mardi":"martedì","mercredi":"mercoledì","jeudi":"giovedì","vendredi":"venerdì","samedi":"sabato","dimanche":"domenica","printemps":"primavera","été":"estate","automne":"autunno","hiver":"inverno",
    "pluie":"pioggia","neige":"neve","vent":"vento","nuage":"nuvola","orage":"temporale","chaud":"caldo","froid":"freddo","il pleut":"piove","il fait chaud":"fa caldo",
    "heureux":"felice","triste":"triste","facile":"facile","difficile":"difficile","jeune":"giovane","vieux":"vecchio","propre":"pulito","sale":"sporco","plein":"pieno","vide":"vuoto","cher":"caro","content":"contento",
    "menu":"menù","plat":"piatto","entrée":"antipasto","dessert":"dolce","addition":"conto","fourchette":"forchetta","couteau":"coltello","cuillère":"cucchiaio","assiette":"piatto","verre":"bicchiere","tasse":"tazza",
    "argent":"soldi","prix":"prezzo","euro":"euro","carte":"carta","monnaie":"resto","acheter":"comprare","vendre":"vendere","payer":"pagare","coûter":"costare",
    "qui":"chi","quoi":"cosa","où":"dove","quand":"quando","comment":"come","pourquoi":"perché","combien":"quanto",
    "onze":"undici","douze":"dodici","treize":"tredici","quatorze":"quattordici","quinze":"quindici","seize":"sedici","dix-sept":"diciassette","dix-huit":"diciotto","dix-neuf":"diciannove","vingt":"venti","trente":"trenta","quarante":"quaranta","cinquante":"cinquanta","mille":"mille" },
  es:{ "être":"ser","avoir":"tener","aller":"ir","faire":"hacer","venir":"venir","voir":"ver","vouloir":"querer","pouvoir":"poder","manger":"comer","boire":"beber","parler":"hablar","aimer":"amar","savoir":"saber","dire":"decir","donner":"dar","dormir":"dormir",
    "tête":"cabeza","cheveux":"pelo","œil":"ojo","nez":"nariz","bouche":"boca","oreille":"oreja","dent":"diente","main":"mano","bras":"brazo","jambe":"pierna","pied":"pie","doigt":"dedo","cœur":"corazón","dos":"espalda","ventre":"barriga",
    "fruit":"fruta","banane":"plátano","fraise":"fresa","citron":"limón","raisin":"uva","poire":"pera","légume":"verdura","tomate":"tomate","carotte":"zanahoria","oignon":"cebolla","salade":"ensalada","pomme de terre":"patata",
    "ville":"ciudad","magasin":"tienda","marché":"mercado","banque":"banco","école":"escuela","hôpital":"hospital","pharmacie":"farmacia","restaurant":"restaurante","église":"iglesia","parc":"parque","pont":"puente","aéroport":"aeropuerto","musée":"museo",
    "voiture":"coche","bus":"autobús","vélo":"bicicleta","moto":"moto","taxi":"taxi","camion":"camión","train":"tren","avion":"avión","bateau":"barco","métro":"metro",
    "médecin":"médico","professeur":"profesor","cuisinier":"cocinero","policier":"policía","serveur":"camarero","avocat":"abogado","ingénieur":"ingeniero","artiste":"artista","boulanger":"panadero","agriculteur":"agricultor",
    "lundi":"lunes","mardi":"martes","mercredi":"miércoles","jeudi":"jueves","vendredi":"viernes","samedi":"sábado","dimanche":"domingo","printemps":"primavera","été":"verano","automne":"otoño","hiver":"invierno",
    "pluie":"lluvia","neige":"nieve","vent":"viento","nuage":"nube","orage":"tormenta","chaud":"caliente","froid":"frío","il pleut":"llueve","il fait chaud":"hace calor",
    "heureux":"feliz","triste":"triste","facile":"fácil","difficile":"difícil","jeune":"joven","vieux":"viejo","propre":"limpio","sale":"sucio","plein":"lleno","vide":"vacío","cher":"caro","content":"contento",
    "menu":"menú","plat":"plato","entrée":"entrante","dessert":"postre","addition":"cuenta","fourchette":"tenedor","couteau":"cuchillo","cuillère":"cuchara","assiette":"plato","verre":"vaso","tasse":"taza",
    "argent":"dinero","prix":"precio","euro":"euro","carte":"tarjeta","monnaie":"cambio","acheter":"comprar","vendre":"vender","payer":"pagar","coûter":"costar",
    "qui":"quién","quoi":"qué","où":"dónde","quand":"cuándo","comment":"cómo","pourquoi":"por qué","combien":"cuánto",
    "onze":"once","douze":"doce","treize":"trece","quatorze":"catorce","quinze":"quince","seize":"dieciséis","dix-sept":"diecisiete","dix-huit":"dieciocho","dix-neuf":"diecinueve","vingt":"veinte","trente":"treinta","quarante":"cuarenta","cinquante":"cincuenta","mille":"mil" },
  de:{ "être":"sein","avoir":"haben","aller":"gehen","faire":"machen","venir":"kommen","voir":"sehen","vouloir":"wollen","pouvoir":"können","manger":"essen","boire":"trinken","parler":"sprechen","aimer":"lieben","savoir":"wissen","dire":"sagen","donner":"geben","dormir":"schlafen",
    "tête":"Kopf","cheveux":"Haare","œil":"Auge","nez":"Nase","bouche":"Mund","oreille":"Ohr","dent":"Zahn","main":"Hand","bras":"Arm","jambe":"Bein","pied":"Fuß","doigt":"Finger","cœur":"Herz","dos":"Rücken","ventre":"Bauch",
    "fruit":"Obst","banane":"Banane","fraise":"Erdbeere","citron":"Zitrone","raisin":"Traube","poire":"Birne","légume":"Gemüse","tomate":"Tomate","carotte":"Karotte","oignon":"Zwiebel","salade":"Salat","pomme de terre":"Kartoffel",
    "ville":"Stadt","magasin":"Geschäft","marché":"Markt","banque":"Bank","école":"Schule","hôpital":"Krankenhaus","pharmacie":"Apotheke","restaurant":"Restaurant","église":"Kirche","parc":"Park","pont":"Brücke","aéroport":"Flughafen","musée":"Museum",
    "voiture":"Auto","bus":"Bus","vélo":"Fahrrad","moto":"Motorrad","taxi":"Taxi","camion":"Lastwagen","train":"Zug","avion":"Flugzeug","bateau":"Boot","métro":"U-Bahn",
    "médecin":"Arzt","professeur":"Lehrer","cuisinier":"Koch","policier":"Polizist","serveur":"Kellner","avocat":"Anwalt","ingénieur":"Ingenieur","artiste":"Künstler","boulanger":"Bäcker","agriculteur":"Bauer",
    "lundi":"Montag","mardi":"Dienstag","mercredi":"Mittwoch","jeudi":"Donnerstag","vendredi":"Freitag","samedi":"Samstag","dimanche":"Sonntag","printemps":"Frühling","été":"Sommer","automne":"Herbst","hiver":"Winter",
    "pluie":"Regen","neige":"Schnee","vent":"Wind","nuage":"Wolke","orage":"Gewitter","chaud":"heiß","froid":"kalt","il pleut":"es regnet","il fait chaud":"es ist heiß",
    "heureux":"glücklich","triste":"traurig","facile":"einfach","difficile":"schwer","jeune":"jung","vieux":"alt","propre":"sauber","sale":"schmutzig","plein":"voll","vide":"leer","cher":"teuer","content":"froh",
    "menu":"Speisekarte","plat":"Gericht","entrée":"Vorspeise","dessert":"Nachtisch","addition":"Rechnung","fourchette":"Gabel","couteau":"Messer","cuillère":"Löffel","assiette":"Teller","verre":"Glas","tasse":"Tasse",
    "argent":"Geld","prix":"Preis","euro":"Euro","carte":"Karte","monnaie":"Wechselgeld","acheter":"kaufen","vendre":"verkaufen","payer":"bezahlen","coûter":"kosten",
    "qui":"wer","quoi":"was","où":"wo","quand":"wann","comment":"wie","pourquoi":"warum","combien":"wie viel",
    "onze":"elf","douze":"zwölf","treize":"dreizehn","quatorze":"vierzehn","quinze":"fünfzehn","seize":"sechzehn","dix-sept":"siebzehn","dix-huit":"achtzehn","dix-neuf":"neunzehn","vingt":"zwanzig","trente":"dreißig","quarante":"vierzig","cinquante":"fünfzig","mille":"tausend" },
  pt:{ "être":"ser","avoir":"ter","aller":"ir","faire":"fazer","venir":"vir","voir":"ver","vouloir":"querer","pouvoir":"poder","manger":"comer","boire":"beber","parler":"falar","aimer":"amar","savoir":"saber","dire":"dizer","donner":"dar","dormir":"dormir",
    "tête":"cabeça","cheveux":"cabelo","œil":"olho","nez":"nariz","bouche":"boca","oreille":"orelha","dent":"dente","main":"mão","bras":"braço","jambe":"perna","pied":"pé","doigt":"dedo","cœur":"coração","dos":"costas","ventre":"barriga",
    "fruit":"fruta","banane":"banana","fraise":"morango","citron":"limão","raisin":"uva","poire":"pera","légume":"legume","tomate":"tomate","carotte":"cenoura","oignon":"cebola","salade":"salada","pomme de terre":"batata",
    "ville":"cidade","magasin":"loja","marché":"mercado","banque":"banco","école":"escola","hôpital":"hospital","pharmacie":"farmácia","restaurant":"restaurante","église":"igreja","parc":"parque","pont":"ponte","aéroport":"aeroporto","musée":"museu",
    "voiture":"carro","bus":"autocarro","vélo":"bicicleta","moto":"mota","taxi":"táxi","camion":"camião","train":"comboio","avion":"avião","bateau":"barco","métro":"metro",
    "médecin":"médico","professeur":"professor","cuisinier":"cozinheiro","policier":"polícia","serveur":"empregado","avocat":"advogado","ingénieur":"engenheiro","artiste":"artista","boulanger":"padeiro","agriculteur":"agricultor",
    "lundi":"segunda-feira","mardi":"terça-feira","mercredi":"quarta-feira","jeudi":"quinta-feira","vendredi":"sexta-feira","samedi":"sábado","dimanche":"domingo","printemps":"primavera","été":"verão","automne":"outono","hiver":"inverno",
    "pluie":"chuva","neige":"neve","vent":"vento","nuage":"nuvem","orage":"tempestade","chaud":"quente","froid":"frio","il pleut":"está a chover","il fait chaud":"está calor",
    "heureux":"feliz","triste":"triste","facile":"fácil","difficile":"difícil","jeune":"jovem","vieux":"velho","propre":"limpo","sale":"sujo","plein":"cheio","vide":"vazio","cher":"caro","content":"contente",
    "menu":"menu","plat":"prato","entrée":"entrada","dessert":"sobremesa","addition":"conta","fourchette":"garfo","couteau":"faca","cuillère":"colher","assiette":"prato","verre":"copo","tasse":"chávena",
    "argent":"dinheiro","prix":"preço","euro":"euro","carte":"cartão","monnaie":"troco","acheter":"comprar","vendre":"vender","payer":"pagar","coûter":"custar",
    "qui":"quem","quoi":"o quê","où":"onde","quand":"quando","comment":"como","pourquoi":"porquê","combien":"quanto",
    "onze":"onze","douze":"doze","treize":"treze","quatorze":"catorze","quinze":"quinze","seize":"dezasseis","dix-sept":"dezassete","dix-huit":"dezoito","dix-neuf":"dezanove","vingt":"vinte","trente":"trinta","quarante":"quarenta","cinquante":"cinquenta","mille":"mil" },
  nl:{ "être":"zijn","avoir":"hebben","aller":"gaan","faire":"doen","venir":"komen","voir":"zien","vouloir":"willen","pouvoir":"kunnen","manger":"eten","boire":"drinken","parler":"spreken","aimer":"houden van","savoir":"weten","dire":"zeggen","donner":"geven","dormir":"slapen",
    "tête":"hoofd","cheveux":"haar","œil":"oog","nez":"neus","bouche":"mond","oreille":"oor","dent":"tand","main":"hand","bras":"arm","jambe":"been","pied":"voet","doigt":"vinger","cœur":"hart","dos":"rug","ventre":"buik",
    "fruit":"fruit","banane":"banaan","fraise":"aardbei","citron":"citroen","raisin":"druif","poire":"peer","légume":"groente","tomate":"tomaat","carotte":"wortel","oignon":"ui","salade":"salade","pomme de terre":"aardappel",
    "ville":"stad","magasin":"winkel","marché":"markt","banque":"bank","école":"school","hôpital":"ziekenhuis","pharmacie":"apotheek","restaurant":"restaurant","église":"kerk","parc":"park","pont":"brug","aéroport":"luchthaven","musée":"museum",
    "voiture":"auto","bus":"bus","vélo":"fiets","moto":"motor","taxi":"taxi","camion":"vrachtwagen","train":"trein","avion":"vliegtuig","bateau":"boot","métro":"metro",
    "médecin":"dokter","professeur":"leraar","cuisinier":"kok","policier":"politieagent","serveur":"ober","avocat":"advocaat","ingénieur":"ingenieur","artiste":"kunstenaar","boulanger":"bakker","agriculteur":"boer",
    "lundi":"maandag","mardi":"dinsdag","mercredi":"woensdag","jeudi":"donderdag","vendredi":"vrijdag","samedi":"zaterdag","dimanche":"zondag","printemps":"lente","été":"zomer","automne":"herfst","hiver":"winter",
    "pluie":"regen","neige":"sneeuw","vent":"wind","nuage":"wolk","orage":"onweer","chaud":"warm","froid":"koud","il pleut":"het regent","il fait chaud":"het is warm",
    "heureux":"blij","triste":"verdrietig","facile":"makkelijk","difficile":"moeilijk","jeune":"jong","vieux":"oud","propre":"schoon","sale":"vuil","plein":"vol","vide":"leeg","cher":"duur","content":"tevreden",
    "menu":"menu","plat":"gerecht","entrée":"voorgerecht","dessert":"nagerecht","addition":"rekening","fourchette":"vork","couteau":"mes","cuillère":"lepel","assiette":"bord","verre":"glas","tasse":"kopje",
    "argent":"geld","prix":"prijs","euro":"euro","carte":"kaart","monnaie":"wisselgeld","acheter":"kopen","vendre":"verkopen","payer":"betalen","coûter":"kosten",
    "qui":"wie","quoi":"wat","où":"waar","quand":"wanneer","comment":"hoe","pourquoi":"waarom","combien":"hoeveel",
    "onze":"elf","douze":"twaalf","treize":"dertien","quatorze":"veertien","quinze":"vijftien","seize":"zestien","dix-sept":"zeventien","dix-huit":"achttien","dix-neuf":"negentien","vingt":"twintig","trente":"dertig","quarante":"veertig","cinquante":"vijftig","mille":"duizend" }
};
CURRICULUM_X.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ var s=LEX_X[l]||{}; Object.keys(s).forEach(function(k){ LEX[l][k]=s[k]; }); });

/* --- Phrasier voyage supplémentaire --- */
var PHRASEBOOK_X = {
  "à quelle heure":{en:"at what time",it:"a che ora",es:"a qué hora",de:"um wie viel Uhr",pt:"a que horas",nl:"hoe laat"},
  "je voudrais":{en:"i would like",it:"vorrei",es:"quería",de:"ich möchte",pt:"queria",nl:"ik wil graag"},
  "c'est délicieux":{en:"it is delicious",it:"è delizioso",es:"está delicioso",de:"das ist köstlich",pt:"está delicioso",nl:"het is heerlijk"},
  "à bientôt":{en:"see you soon",it:"a presto",es:"hasta pronto",de:"bis bald",pt:"até breve",nl:"tot snel"},
  "bonne nuit":{en:"good night",it:"buonanotte",es:"buenas noches",de:"gute Nacht",pt:"boa noite",nl:"goedenacht"},
  "bon appétit":{en:"enjoy your meal",it:"buon appetito",es:"buen provecho",de:"guten Appetit",pt:"bom apetite",nl:"eet smakelijk"},
  "excusez-moi":{en:"excuse me",it:"mi scusi",es:"disculpe",de:"entschuldigen Sie",pt:"com licença",nl:"excuseer"},
  "de rien":{en:"you're welcome",it:"prego",es:"de nada",de:"gern geschehen",pt:"de nada",nl:"graag gedaan"},
  "je m'appelle":{en:"my name is",it:"mi chiamo",es:"me llamo",de:"ich heiße",pt:"chamo-me",nl:"ik heet"},
  "enchanté":{en:"nice to meet you",it:"piacere",es:"encantado",de:"freut mich",pt:"prazer",nl:"aangenaam"}
};
Object.keys(PHRASEBOOK_X).forEach(function(k){ PHRASEBOOK[k]=PHRASEBOOK_X[k]; });

/* --- Phrases du quotidien (parcours) --- */
var PHRASEBOOK_X2 = {
  "où est":{en:"where is",it:"dov'è",es:"dónde está",de:"wo ist",pt:"onde fica",nl:"waar is"},
  "je cherche":{en:"i am looking for",it:"sto cercando",es:"estoy buscando",de:"ich suche",pt:"estou à procura",nl:"ik zoek"},
  "à droite":{en:"to the right",it:"a destra",es:"a la derecha",de:"nach rechts",pt:"à direita",nl:"naar rechts"},
  "à gauche":{en:"to the left",it:"a sinistra",es:"a la izquierda",de:"nach links",pt:"à esquerda",nl:"naar links"},
  "tout droit":{en:"straight ahead",it:"dritto",es:"todo recto",de:"geradeaus",pt:"em frente",nl:"rechtdoor"},
  "je suis désolé":{en:"i am sorry",it:"mi dispiace",es:"lo siento",de:"es tut mir leid",pt:"lamento",nl:"het spijt me"},
  "pas de problème":{en:"no problem",it:"nessun problema",es:"no hay problema",de:"kein Problem",pt:"sem problema",nl:"geen probleem"},
  "un moment":{en:"one moment",it:"un momento",es:"un momento",de:"einen Moment",pt:"um momento",nl:"een moment"},
  "je voudrais un café":{en:"i would like a coffee",it:"vorrei un caffè",es:"quería un café",de:"ich möchte einen Kaffee",pt:"queria um café",nl:"ik wil graag een koffie"},
  "au secours":{en:"help",it:"aiuto",es:"socorro",de:"Hilfe",pt:"socorro",nl:"help"}
};
Object.keys(PHRASEBOOK_X2).forEach(function(k){ PHRASEBOOK[k]=PHRASEBOOK_X2[k]; });

/* --- Parcours : jalons de niveau (par nombre de mots maîtrisés) + conseils du prof (100% original) --- */
/* Paliers CECRL RÉALISTES (repères honnêtes du vocabulaire actif). AVANT : ça s'arrêtait à
   « A2+ » à 240 mots et la barre Coach appelait ça « 100% bilingue » — FAUX. Être bilingue
   (C1-C2) demande plusieurs MILLIERS de mots et des années. On garde des paliers rapprochés au
   début (là où on progresse vite) puis l'échelle réelle jusqu'au bilingue. */
var LEVELS = [
  {code:"Débutant", cefr:"—",  min:0},
  {code:"A1",  cefr:"A1", min:80},
  {code:"A1+", cefr:"A1", min:200},
  {code:"A2",  cefr:"A2", min:450},
  {code:"A2+", cefr:"A2", min:800},
  {code:"B1",  cefr:"B1", min:1400},
  {code:"B2",  cefr:"B2", min:2800},
  {code:"C1",  cefr:"C1", min:5000},
  {code:"Bilingue", cefr:"C2", min:9000}
];
var TEACHER_TIPS = [
  "Révise 5 minutes juste avant de dormir : ton cerveau fixe les mots pendant la nuit. 🌙",
  "Dis les mots à voix haute — parler ancre mieux que lire. 🗣️",
  "Mieux vaut 10 min chaque jour qu'une heure le dimanche : la régularité gagne. 📆",
  "Associe chaque mot à une image dans ta tête, pas à sa traduction. 🖼️",
  "Refais les révisions proposées : revoir au bon moment, c'est 80% de la mémoire. 🔁",
  "Compte, cuisine, range… en pensant dans ta nouvelle langue. 🧠",
  "N'aie pas peur de te tromper : une erreur t'apprend plus qu'une bonne réponse. 💪",
  "Écoute la prononciation et répète juste après, comme un écho. 🎧",
  "Apprends d'abord les mots que TU utilises tous les jours. 🎯",
  "Un mini-objectif atteignable : 1 leçon par jour suffit pour progresser. ✅",
  "Relie chaque nouveau mot à ceux que tu connais déjà (même thème). 🔗",
  "Fais une leçon dans les transports ou la file d'attente : le temps mort devient utile. ⏳",
  "Termine toujours sur une réussite : ça donne envie de revenir demain. 🌟",
  "Le soir, raconte ta journée en 3 petites phrases dans ta nouvelle langue. 📝",
  "Passe l'examen de l'unité : ce qui résiste, c'est exactement ce qu'il faut revoir. 🏆"
];

/* --- v2.44 : programme intermédiaire (A2 → B1) — parité garantie sur les 6 langues.
   Un seul dictionnaire source NEWV (fr → {en,it,es,de,pt,nl}) alimente le lexique de
   TOUTES les langues d'un coup : impossible qu'une langue ait moins que les autres. --- */
var CURRICULUM_Y = [
  { t:"Les émotions 😊", c:"#f59e0b", L:[
    { t:"Se sentir", w:["fatigué","fâché","inquiet","surpris","fier","calme"], p:["je suis fatigué"] },
    { t:"Le cœur", w:["seul","amoureux","peur","rire","pleurer"], p:["elle a peur"] }
  ]},
  { t:"Le temps qui passe ⏳", c:"#8b5cf6", L:[
    { t:"Quand ?", w:["maintenant","bientôt","tard","tôt","longtemps"], p:["je mange maintenant"] },
    { t:"À quelle fréquence", w:["toujours","jamais","souvent","parfois","avant","après"], p:["je bois souvent du thé"] }
  ]},
  { t:"Au travail 💼", c:"#0ea5e9", L:[
    { t:"Le bureau", w:["travail","bureau","réunion","patron","collègue","ordinateur"], p:["je travaille au bureau"] },
    { t:"L'entreprise", w:["projet","salaire","entreprise","réussir","travailler"], p:["j'aime mon travail"] }
  ]},
  { t:"La santé 🩺", c:"#ef4444", L:[
    { t:"Être malade", w:["malade","douleur","médicament","fièvre"], p:["je suis malade"] },
    { t:"Aller mieux", w:["se reposer","guérir","santé","fort","faible","respirer"], p:["je vais mieux"] }
  ]},
  { t:"Les loisirs 🎭", c:"#ec4899", L:[
    { t:"Bouger", w:["jouer","nager","courir","danser","voyager","sport"], p:["j'aime le sport"] },
    { t:"Arts et loisirs", w:["lire","écrire","chanter","musique","film","jeu"], p:["j'aime lire"] }
  ]},
  { t:"La technologie 📱", c:"#14b8a6", L:[
    { t:"Mon téléphone", w:["écran","message","photo","application","batterie"], p:["je regarde une photo"] },
    { t:"En ligne", w:["internet","mot de passe","en ligne","clavier","ordinateur portable"], p:["je suis en ligne"] }
  ]},
  { t:"Opinions et idées 💡", c:"#a855f7", L:[
    { t:"Réfléchir", w:["penser","croire","comprendre","expliquer"], p:["je pense que oui"] },
    { t:"Discuter", w:["raison","vérité","problème","solution","idée","important"], p:["c'est une bonne idée"] }
  ]}
];
var NEWV = {
  "fatigué":{en:"tired",it:"stanco",es:"cansado",de:"müde",pt:"cansado",nl:"moe"},
  "fâché":{en:"angry",it:"arrabbiato",es:"enfadado",de:"wütend",pt:"zangado",nl:"boos"},
  "inquiet":{en:"worried",it:"preoccupato",es:"preocupado",de:"besorgt",pt:"preocupado",nl:"bezorgd"},
  "surpris":{en:"surprised",it:"sorpreso",es:"sorprendido",de:"überrascht",pt:"surpreso",nl:"verrast"},
  "fier":{en:"proud",it:"fiero",es:"orgulloso",de:"stolz",pt:"orgulhoso",nl:"trots"},
  "calme":{en:"calm",it:"calmo",es:"tranquilo",de:"ruhig",pt:"calmo",nl:"kalm"},
  "seul":{en:"alone",it:"solo",es:"solo",de:"allein",pt:"sozinho",nl:"alleen"},
  "amoureux":{en:"in love",it:"innamorato",es:"enamorado",de:"verliebt",pt:"apaixonado",nl:"verliefd"},
  "peur":{en:"fear",it:"paura",es:"miedo",de:"Angst",pt:"medo",nl:"angst"},
  "rire":{en:"to laugh",it:"ridere",es:"reír",de:"lachen",pt:"rir",nl:"lachen"},
  "pleurer":{en:"to cry",it:"piangere",es:"llorar",de:"weinen",pt:"chorar",nl:"huilen"},
  "maintenant":{en:"now",it:"adesso",es:"ahora",de:"jetzt",pt:"agora",nl:"nu"},
  "bientôt":{en:"soon",it:"presto",es:"pronto",de:"bald",pt:"em breve",nl:"binnenkort"},
  "tard":{en:"late",it:"tardi",es:"tarde",de:"spät",pt:"tarde",nl:"laat"},
  "tôt":{en:"early",it:"presto",es:"temprano",de:"früh",pt:"cedo",nl:"vroeg"},
  "longtemps":{en:"a long time",it:"a lungo",es:"mucho tiempo",de:"lange",pt:"muito tempo",nl:"lang"},
  "toujours":{en:"always",it:"sempre",es:"siempre",de:"immer",pt:"sempre",nl:"altijd"},
  "jamais":{en:"never",it:"mai",es:"nunca",de:"nie",pt:"nunca",nl:"nooit"},
  "souvent":{en:"often",it:"spesso",es:"a menudo",de:"oft",pt:"frequentemente",nl:"vaak"},
  "parfois":{en:"sometimes",it:"a volte",es:"a veces",de:"manchmal",pt:"às vezes",nl:"soms"},
  "avant":{en:"before",it:"prima",es:"antes",de:"vor",pt:"antes",nl:"voor"},
  "après":{en:"after",it:"dopo",es:"después",de:"nach",pt:"depois",nl:"na"},
  "travail":{en:"work",it:"lavoro",es:"trabajo",de:"Arbeit",pt:"trabalho",nl:"werk"},
  "bureau":{en:"office",it:"ufficio",es:"oficina",de:"Büro",pt:"escritório",nl:"kantoor"},
  "réunion":{en:"meeting",it:"riunione",es:"reunión",de:"Besprechung",pt:"reunião",nl:"vergadering"},
  "patron":{en:"boss",it:"capo",es:"jefe",de:"Chef",pt:"chefe",nl:"baas"},
  "collègue":{en:"colleague",it:"collega",es:"colega",de:"Kollege",pt:"colega",nl:"collega"},
  "ordinateur":{en:"computer",it:"computer",es:"ordenador",de:"Computer",pt:"computador",nl:"computer"},
  "projet":{en:"project",it:"progetto",es:"proyecto",de:"Projekt",pt:"projeto",nl:"project"},
  "salaire":{en:"salary",it:"stipendio",es:"salario",de:"Gehalt",pt:"salário",nl:"salaris"},
  "entreprise":{en:"company",it:"azienda",es:"empresa",de:"Firma",pt:"empresa",nl:"bedrijf"},
  "réussir":{en:"to succeed",it:"riuscire",es:"lograr",de:"gelingen",pt:"conseguir",nl:"slagen"},
  "travailler":{en:"to work",it:"lavorare",es:"trabajar",de:"arbeiten",pt:"trabalhar",nl:"werken"},
  "malade":{en:"sick",it:"malato",es:"enfermo",de:"krank",pt:"doente",nl:"ziek"},
  "douleur":{en:"pain",it:"dolore",es:"dolor",de:"Schmerz",pt:"dor",nl:"pijn"},
  "médicament":{en:"medicine",it:"medicina",es:"medicina",de:"Medikament",pt:"remédio",nl:"medicijn"},
  "fièvre":{en:"fever",it:"febbre",es:"fiebre",de:"Fieber",pt:"febre",nl:"koorts"},
  "se reposer":{en:"to rest",it:"riposare",es:"descansar",de:"sich ausruhen",pt:"descansar",nl:"rusten"},
  "guérir":{en:"to heal",it:"guarire",es:"curar",de:"heilen",pt:"curar",nl:"genezen"},
  "santé":{en:"health",it:"salute",es:"salud",de:"Gesundheit",pt:"saúde",nl:"gezondheid"},
  "fort":{en:"strong",it:"forte",es:"fuerte",de:"stark",pt:"forte",nl:"sterk"},
  "faible":{en:"weak",it:"debole",es:"débil",de:"schwach",pt:"fraco",nl:"zwak"},
  "respirer":{en:"to breathe",it:"respirare",es:"respirar",de:"atmen",pt:"respirar",nl:"ademen"},
  "jouer":{en:"to play",it:"giocare",es:"jugar",de:"spielen",pt:"jogar",nl:"spelen"},
  "nager":{en:"to swim",it:"nuotare",es:"nadar",de:"schwimmen",pt:"nadar",nl:"zwemmen"},
  "courir":{en:"to run",it:"correre",es:"correr",de:"laufen",pt:"correr",nl:"rennen"},
  "danser":{en:"to dance",it:"ballare",es:"bailar",de:"tanzen",pt:"dançar",nl:"dansen"},
  "voyager":{en:"to travel",it:"viaggiare",es:"viajar",de:"reisen",pt:"viajar",nl:"reizen"},
  "sport":{en:"sport",it:"sport",es:"deporte",de:"Sport",pt:"esporte",nl:"sport"},
  "lire":{en:"to read",it:"leggere",es:"leer",de:"lesen",pt:"ler",nl:"lezen"},
  "écrire":{en:"to write",it:"scrivere",es:"escribir",de:"schreiben",pt:"escrever",nl:"schrijven"},
  "chanter":{en:"to sing",it:"cantare",es:"cantar",de:"singen",pt:"cantar",nl:"zingen"},
  "musique":{en:"music",it:"musica",es:"música",de:"Musik",pt:"música",nl:"muziek"},
  "film":{en:"movie",it:"film",es:"película",de:"Film",pt:"filme",nl:"film"},
  "jeu":{en:"game",it:"gioco",es:"juego",de:"Spiel",pt:"jogo",nl:"spel"},
  "écran":{en:"screen",it:"schermo",es:"pantalla",de:"Bildschirm",pt:"tela",nl:"scherm"},
  "message":{en:"message",it:"messaggio",es:"mensaje",de:"Nachricht",pt:"mensagem",nl:"bericht"},
  "photo":{en:"photo",it:"foto",es:"foto",de:"Foto",pt:"foto",nl:"foto"},
  "application":{en:"app",it:"app",es:"aplicación",de:"App",pt:"aplicativo",nl:"app"},
  "batterie":{en:"battery",it:"batteria",es:"batería",de:"Batterie",pt:"bateria",nl:"batterij"},
  "internet":{en:"internet",it:"internet",es:"internet",de:"Internet",pt:"internet",nl:"internet"},
  "mot de passe":{en:"password",it:"password",es:"contraseña",de:"Passwort",pt:"senha",nl:"wachtwoord"},
  "en ligne":{en:"online",it:"online",es:"en línea",de:"online",pt:"online",nl:"online"},
  "clavier":{en:"keyboard",it:"tastiera",es:"teclado",de:"Tastatur",pt:"teclado",nl:"toetsenbord"},
  "ordinateur portable":{en:"laptop",it:"portatile",es:"portátil",de:"Laptop",pt:"portátil",nl:"laptop"},
  "penser":{en:"to think",it:"pensare",es:"pensar",de:"denken",pt:"pensar",nl:"denken"},
  "croire":{en:"to believe",it:"credere",es:"creer",de:"glauben",pt:"acreditar",nl:"geloven"},
  "comprendre":{en:"to understand",it:"capire",es:"entender",de:"verstehen",pt:"entender",nl:"begrijpen"},
  "expliquer":{en:"to explain",it:"spiegare",es:"explicar",de:"erklären",pt:"explicar",nl:"uitleggen"},
  "raison":{en:"reason",it:"ragione",es:"razón",de:"Grund",pt:"razão",nl:"reden"},
  "vérité":{en:"truth",it:"verità",es:"verdad",de:"Wahrheit",pt:"verdade",nl:"waarheid"},
  "problème":{en:"problem",it:"problema",es:"problema",de:"Problem",pt:"problema",nl:"probleem"},
  "solution":{en:"solution",it:"soluzione",es:"solución",de:"Lösung",pt:"solução",nl:"oplossing"},
  "idée":{en:"idea",it:"idea",es:"idea",de:"Idee",pt:"ideia",nl:"idee"},
  "important":{en:"important",it:"importante",es:"importante",de:"wichtig",pt:"importante",nl:"belangrijk"},
  "je suis fatigué":{en:"I am tired",it:"sono stanco",es:"estoy cansado",de:"ich bin müde",pt:"estou cansado",nl:"ik ben moe"},
  "elle a peur":{en:"she is afraid",it:"ha paura",es:"tiene miedo",de:"sie hat Angst",pt:"ela tem medo",nl:"zij is bang"},
  "je mange maintenant":{en:"I eat now",it:"mangio adesso",es:"como ahora",de:"ich esse jetzt",pt:"como agora",nl:"ik eet nu"},
  "je bois souvent du thé":{en:"I often drink tea",it:"bevo spesso il tè",es:"bebo té a menudo",de:"ich trinke oft Tee",pt:"bebo chá com frequência",nl:"ik drink vaak thee"},
  "je travaille au bureau":{en:"I work at the office",it:"lavoro in ufficio",es:"trabajo en la oficina",de:"ich arbeite im Büro",pt:"trabalho no escritório",nl:"ik werk op kantoor"},
  "j'aime mon travail":{en:"I like my work",it:"amo il mio lavoro",es:"me gusta mi trabajo",de:"ich mag meine Arbeit",pt:"gosto do meu trabalho",nl:"ik hou van mijn werk"},
  "je suis malade":{en:"I am sick",it:"sono malato",es:"estoy enfermo",de:"ich bin krank",pt:"estou doente",nl:"ik ben ziek"},
  "je vais mieux":{en:"I feel better",it:"sto meglio",es:"estoy mejor",de:"es geht mir besser",pt:"estou melhor",nl:"het gaat beter"},
  "j'aime le sport":{en:"I like sport",it:"mi piace lo sport",es:"me gusta el deporte",de:"ich mag Sport",pt:"gosto de esporte",nl:"ik hou van sport"},
  "j'aime lire":{en:"I like to read",it:"mi piace leggere",es:"me gusta leer",de:"ich lese gern",pt:"gosto de ler",nl:"ik lees graag"},
  "je regarde une photo":{en:"I look at a photo",it:"guardo una foto",es:"miro una foto",de:"ich schaue ein Foto an",pt:"olho uma foto",nl:"ik kijk naar een foto"},
  "je suis en ligne":{en:"I am online",it:"sono online",es:"estoy en línea",de:"ich bin online",pt:"estou online",nl:"ik ben online"},
  "je pense que oui":{en:"I think so",it:"penso di sì",es:"creo que sí",de:"ich glaube schon",pt:"acho que sim",nl:"ik denk het wel"},
  "c'est une bonne idée":{en:"it's a good idea",it:"è una buona idea",es:"es una buena idea",de:"das ist eine gute Idee",pt:"é uma boa ideia",nl:"het is een goed idee"}
};
CURRICULUM_Y.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV).forEach(function(k){ if(NEWV[k][l]) LEX[l][k]=NEWV[k][l]; }); });

/* --- v2.56 : GRANDE extension (palier A2 → B1) — 12 unités, ~160 mots + phrases.
   Même mécanisme à parité garantie : NEWV2 (fr → 6 langues) alimente tout d'un coup.
   Vocabulaire de haute fréquence uniquement, portugais EUROPÉEN (pt-PT). --- */
var CURRICULUM_Z = [
  { t:"Verbes du quotidien 🔁", c:"#10b981", L:[
    { t:"Agir", w:["prendre","trouver","chercher","attendre","ouvrir","fermer","commencer","finir"], p:["je cherche la gare"] },
    { t:"Vivre", w:["aider","habiter","porter","essayer","apprendre","oublier","montrer"] }
  ]},
  { t:"La cuisine 🍳", c:"#f59e0b", L:[
    { t:"Dans la cuisine", w:["cuisine","four","frigo","bouteille","recette","cuisiner"] },
    { t:"Les ingrédients", w:["sel","poivre","sucre","huile","beurre","farine"] },
    { t:"Les repas", w:["petit-déjeuner","déjeuner","dîner"] }
  ]},
  { t:"La salle de bain 🛁", c:"#0ea5e9", L:[
    { t:"Se préparer", w:["savon","douche","bain","serviette","se laver"], p:["je me lave les mains"] },
    { t:"Les objets", w:["brosse à dents","dentifrice","miroir","peigne","shampoing"] }
  ]},
  { t:"Les lieux de la ville 🏛", c:"#8b5cf6", L:[
    { t:"Sortir", w:["bibliothèque","piscine","cinéma","théâtre","stade","place"] },
    { t:"Les services", w:["poste","mairie","boulangerie","boucherie","quartier","coin"] }
  ]},
  { t:"La position 🧭", c:"#3b82f6", L:[
    { t:"Où c'est ?", w:["sous","sur","devant","derrière","entre","à côté"] },
    { t:"S'orienter", w:["en haut","en bas","tout droit","près","loin"] }
  ]},
  { t:"Faire les courses 💰", c:"#ec4899", L:[
    { t:"Au magasin", w:["gratuit","soldes","liste","sac","panier","cadeau"], p:["c'est trop cher"] },
    { t:"À la caisse", w:["client","caisse","ouvert","fermé","trop"], p:["le magasin est ouvert"] }
  ]},
  { t:"Voyager loin ✈️", c:"#7c3aed", L:[
    { t:"Les papiers", w:["valise","passeport","billet","bagage","frontière","douane"] },
    { t:"Le trajet", w:["départ","arrivée","retard","réserver","annuler","vacances"], p:["je réserve un hôtel"] }
  ]},
  { t:"Décrire encore ✨", c:"#f97316", L:[
    { t:"Les mesures", w:["lourd","léger","long","court","large","étroit"] },
    { t:"Les qualités", w:["rapide","lent","dangereux","sûr","riche","pauvre","drôle","gentil"] }
  ]},
  { t:"Communiquer 📞", c:"#14b8a6", L:[
    { t:"Échanger", w:["appeler","répondre","demander","envoyer","recevoir"], p:["je t'appelle demain"] },
    { t:"Les messages", w:["question","réponse","nouvelle","lettre","adresse","e-mail","numéro"] }
  ]},
  { t:"La nature sauvage 🌍", c:"#22c55e", L:[
    { t:"Les paysages", w:["rivière","lac","forêt","île","colline","champ"], p:["la rivière est froide"] },
    { t:"Les éléments", w:["herbe","feuille","pierre","terre","feu","étoile"] }
  ]},
  { t:"Les animaux sauvages 🦁", c:"#e11d48", L:[
    { t:"Les grands", w:["lion","tigre","éléphant","singe","ours","loup"] },
    { t:"Les petits", w:["renard","serpent","abeille","papillon","araignée","canard"], p:["l'abeille aime les fleurs"] }
  ]},
  { t:"Petits mots essentiels 🔗", c:"#a855f7", L:[
    { t:"Relier", w:["avec","sans","aussi","mais","parce que","ou","si","donc"], p:["je voyage avec ma famille"] },
    { t:"Nuancer", w:["beaucoup","peu","très","peut-être","quelque chose","rien","tout","quelqu'un"] }
  ]}
];
var NEWV2 = {
  "prendre":{en:"to take",it:"prendere",es:"tomar",de:"nehmen",pt:"tomar",nl:"nemen"},
  "trouver":{en:"to find",it:"trovare",es:"encontrar",de:"finden",pt:"encontrar",nl:"vinden"},
  "chercher":{en:"to look for",it:"cercare",es:"buscar",de:"suchen",pt:"procurar",nl:"zoeken"},
  "attendre":{en:"to wait",it:"aspettare",es:"esperar",de:"warten",pt:"esperar",nl:"wachten"},
  "ouvrir":{en:"to open",it:"aprire",es:"abrir",de:"öffnen",pt:"abrir",nl:"openen"},
  "fermer":{en:"to close",it:"chiudere",es:"cerrar",de:"schließen",pt:"fechar",nl:"sluiten"},
  "commencer":{en:"to start",it:"cominciare",es:"empezar",de:"anfangen",pt:"começar",nl:"beginnen"},
  "finir":{en:"to finish",it:"finire",es:"terminar",de:"beenden",pt:"acabar",nl:"eindigen"},
  "aider":{en:"to help",it:"aiutare",es:"ayudar",de:"helfen",pt:"ajudar",nl:"helpen"},
  "habiter":{en:"to live",it:"abitare",es:"vivir",de:"wohnen",pt:"morar",nl:"wonen"},
  "porter":{en:"to carry",it:"portare",es:"llevar",de:"tragen",pt:"levar",nl:"dragen"},
  "essayer":{en:"to try",it:"provare",es:"intentar",de:"versuchen",pt:"tentar",nl:"proberen"},
  "apprendre":{en:"to learn",it:"imparare",es:"aprender",de:"lernen",pt:"aprender",nl:"leren"},
  "oublier":{en:"to forget",it:"dimenticare",es:"olvidar",de:"vergessen",pt:"esquecer",nl:"vergeten"},
  "montrer":{en:"to show",it:"mostrare",es:"mostrar",de:"zeigen",pt:"mostrar",nl:"laten zien"},
  "cuisine":{en:"kitchen",it:"cucina",es:"cocina",de:"Küche",pt:"cozinha",nl:"keuken"},
  "four":{en:"oven",it:"forno",es:"horno",de:"Ofen",pt:"forno",nl:"oven"},
  "frigo":{en:"fridge",it:"frigorifero",es:"nevera",de:"Kühlschrank",pt:"frigorífico",nl:"koelkast"},
  "bouteille":{en:"bottle",it:"bottiglia",es:"botella",de:"Flasche",pt:"garrafa",nl:"fles"},
  "recette":{en:"recipe",it:"ricetta",es:"receta",de:"Rezept",pt:"receita",nl:"recept"},
  "cuisiner":{en:"to cook",it:"cucinare",es:"cocinar",de:"kochen",pt:"cozinhar",nl:"koken"},
  "sel":{en:"salt",it:"sale",es:"sal",de:"Salz",pt:"sal",nl:"zout"},
  "poivre":{en:"pepper",it:"pepe",es:"pimienta",de:"Pfeffer",pt:"pimenta",nl:"peper"},
  "sucre":{en:"sugar",it:"zucchero",es:"azúcar",de:"Zucker",pt:"açúcar",nl:"suiker"},
  "huile":{en:"oil",it:"olio",es:"aceite",de:"Öl",pt:"óleo",nl:"olie"},
  "beurre":{en:"butter",it:"burro",es:"mantequilla",de:"Butter",pt:"manteiga",nl:"boter"},
  "farine":{en:"flour",it:"farina",es:"harina",de:"Mehl",pt:"farinha",nl:"meel"},
  "petit-déjeuner":{en:"breakfast",it:"colazione",es:"desayuno",de:"Frühstück",pt:"pequeno-almoço",nl:"ontbijt"},
  "déjeuner":{en:"lunch",it:"pranzo",es:"almuerzo",de:"Mittagessen",pt:"almoço",nl:"lunch"},
  "dîner":{en:"dinner",it:"cena",es:"cena",de:"Abendessen",pt:"jantar",nl:"avondeten"},
  "savon":{en:"soap",it:"sapone",es:"jabón",de:"Seife",pt:"sabonete",nl:"zeep"},
  "douche":{en:"shower",it:"doccia",es:"ducha",de:"Dusche",pt:"duche",nl:"douche"},
  "bain":{en:"bath",it:"bagno",es:"baño",de:"Bad",pt:"banho",nl:"bad"},
  "serviette":{en:"towel",it:"asciugamano",es:"toalla",de:"Handtuch",pt:"toalha",nl:"handdoek"},
  "se laver":{en:"to wash",it:"lavarsi",es:"lavarse",de:"sich waschen",pt:"lavar-se",nl:"zich wassen"},
  "brosse à dents":{en:"toothbrush",it:"spazzolino",es:"cepillo de dientes",de:"Zahnbürste",pt:"escova de dentes",nl:"tandenborstel"},
  "dentifrice":{en:"toothpaste",it:"dentifricio",es:"pasta de dientes",de:"Zahnpasta",pt:"pasta de dentes",nl:"tandpasta"},
  "miroir":{en:"mirror",it:"specchio",es:"espejo",de:"Spiegel",pt:"espelho",nl:"spiegel"},
  "peigne":{en:"comb",it:"pettine",es:"peine",de:"Kamm",pt:"pente",nl:"kam"},
  "shampoing":{en:"shampoo",it:"shampoo",es:"champú",de:"Shampoo",pt:"champô",nl:"shampoo"},
  "bibliothèque":{en:"library",it:"biblioteca",es:"biblioteca",de:"Bibliothek",pt:"biblioteca",nl:"bibliotheek"},
  "piscine":{en:"swimming pool",it:"piscina",es:"piscina",de:"Schwimmbad",pt:"piscina",nl:"zwembad"},
  "cinéma":{en:"cinema",it:"cinema",es:"cine",de:"Kino",pt:"cinema",nl:"bioscoop"},
  "théâtre":{en:"theatre",it:"teatro",es:"teatro",de:"Theater",pt:"teatro",nl:"theater"},
  "stade":{en:"stadium",it:"stadio",es:"estadio",de:"Stadion",pt:"estádio",nl:"stadion"},
  "place":{en:"square",it:"piazza",es:"plaza",de:"Platz",pt:"praça",nl:"plein"},
  "poste":{en:"post office",it:"posta",es:"correos",de:"Post",pt:"correios",nl:"postkantoor"},
  "mairie":{en:"town hall",it:"municipio",es:"ayuntamiento",de:"Rathaus",pt:"câmara municipal",nl:"stadhuis"},
  "boulangerie":{en:"bakery",it:"panetteria",es:"panadería",de:"Bäckerei",pt:"padaria",nl:"bakkerij"},
  "boucherie":{en:"butcher's shop",it:"macelleria",es:"carnicería",de:"Metzgerei",pt:"talho",nl:"slagerij"},
  "quartier":{en:"neighbourhood",it:"quartiere",es:"barrio",de:"Viertel",pt:"bairro",nl:"wijk"},
  "coin":{en:"corner",it:"angolo",es:"esquina",de:"Ecke",pt:"esquina",nl:"hoek"},
  "sous":{en:"under",it:"sotto",es:"debajo",de:"unter",pt:"debaixo",nl:"onder"},
  "sur":{en:"on",it:"su",es:"sobre",de:"auf",pt:"sobre",nl:"op"},
  "devant":{en:"in front",it:"davanti",es:"delante",de:"vor",pt:"à frente",nl:"vooraan"},
  "derrière":{en:"behind",it:"dietro",es:"detrás",de:"hinter",pt:"atrás",nl:"achter"},
  "entre":{en:"between",it:"tra",es:"entre",de:"zwischen",pt:"entre",nl:"tussen"},
  "à côté":{en:"next to",it:"accanto",es:"al lado",de:"daneben",pt:"ao lado",nl:"ernaast"},
  "en haut":{en:"up",it:"in alto",es:"arriba",de:"oben",pt:"em cima",nl:"boven"},
  "en bas":{en:"down",it:"in basso",es:"abajo",de:"unten",pt:"em baixo",nl:"beneden"},
  "tout droit":{en:"straight ahead",it:"dritto",es:"todo recto",de:"geradeaus",pt:"sempre em frente",nl:"rechtdoor"},
  "près":{en:"near",it:"vicino",es:"cerca",de:"nah",pt:"perto",nl:"dichtbij"},
  "loin":{en:"far",it:"lontano",es:"lejos",de:"weit",pt:"longe",nl:"ver"},
  "gratuit":{en:"free",it:"gratis",es:"gratis",de:"kostenlos",pt:"grátis",nl:"gratis"},
  "soldes":{en:"sales",it:"saldi",es:"rebajas",de:"Schlussverkauf",pt:"saldos",nl:"uitverkoop"},
  "liste":{en:"list",it:"lista",es:"lista",de:"Liste",pt:"lista",nl:"lijst"},
  "sac":{en:"bag",it:"borsa",es:"bolsa",de:"Tasche",pt:"saco",nl:"tas"},
  "panier":{en:"basket",it:"cesto",es:"cesta",de:"Korb",pt:"cesto",nl:"mand"},
  "cadeau":{en:"gift",it:"regalo",es:"regalo",de:"Geschenk",pt:"presente",nl:"cadeau"},
  "client":{en:"customer",it:"cliente",es:"cliente",de:"Kunde",pt:"cliente",nl:"klant"},
  "caisse":{en:"checkout",it:"cassa",es:"caja",de:"Kasse",pt:"caixa",nl:"kassa"},
  "ouvert":{en:"open",it:"aperto",es:"abierto",de:"geöffnet",pt:"aberto",nl:"open"},
  "fermé":{en:"closed",it:"chiuso",es:"cerrado",de:"geschlossen",pt:"fechado",nl:"gesloten"},
  "trop":{en:"too much",it:"troppo",es:"demasiado",de:"zu viel",pt:"demasiado",nl:"te veel"},
  "valise":{en:"suitcase",it:"valigia",es:"maleta",de:"Koffer",pt:"mala",nl:"koffer"},
  "passeport":{en:"passport",it:"passaporto",es:"pasaporte",de:"Reisepass",pt:"passaporte",nl:"paspoort"},
  "billet":{en:"ticket",it:"biglietto",es:"billete",de:"Ticket",pt:"bilhete",nl:"kaartje"},
  "bagage":{en:"luggage",it:"bagaglio",es:"equipaje",de:"Gepäck",pt:"bagagem",nl:"bagage"},
  "frontière":{en:"border",it:"frontiera",es:"frontera",de:"Grenze",pt:"fronteira",nl:"grens"},
  "douane":{en:"customs",it:"dogana",es:"aduana",de:"Zoll",pt:"alfândega",nl:"douane"},
  "départ":{en:"departure",it:"partenza",es:"salida",de:"Abfahrt",pt:"partida",nl:"vertrek"},
  "arrivée":{en:"arrival",it:"arrivo",es:"llegada",de:"Ankunft",pt:"chegada",nl:"aankomst"},
  "retard":{en:"delay",it:"ritardo",es:"retraso",de:"Verspätung",pt:"atraso",nl:"vertraging"},
  "réserver":{en:"to book",it:"prenotare",es:"reservar",de:"reservieren",pt:"reservar",nl:"reserveren"},
  "annuler":{en:"to cancel",it:"annullare",es:"cancelar",de:"stornieren",pt:"cancelar",nl:"annuleren"},
  "vacances":{en:"holidays",it:"vacanze",es:"vacaciones",de:"Urlaub",pt:"férias",nl:"vakantie"},
  "lourd":{en:"heavy",it:"pesante",es:"pesado",de:"schwer",pt:"pesado",nl:"zwaar"},
  "léger":{en:"light",it:"leggero",es:"ligero",de:"leicht",pt:"leve",nl:"licht"},
  "long":{en:"long",it:"lungo",es:"largo",de:"lang",pt:"longo",nl:"lang"},
  "court":{en:"short",it:"corto",es:"corto",de:"kurz",pt:"curto",nl:"kort"},
  "large":{en:"wide",it:"largo",es:"ancho",de:"breit",pt:"largo",nl:"breed"},
  "étroit":{en:"narrow",it:"stretto",es:"estrecho",de:"eng",pt:"estreito",nl:"smal"},
  "rapide":{en:"fast",it:"veloce",es:"rápido",de:"schnell",pt:"rápido",nl:"snel"},
  "lent":{en:"slow",it:"lento",es:"lento",de:"langsam",pt:"lento",nl:"langzaam"},
  "dangereux":{en:"dangerous",it:"pericoloso",es:"peligroso",de:"gefährlich",pt:"perigoso",nl:"gevaarlijk"},
  "sûr":{en:"safe",it:"sicuro",es:"seguro",de:"sicher",pt:"seguro",nl:"veilig"},
  "riche":{en:"rich",it:"ricco",es:"rico",de:"reich",pt:"rico",nl:"rijk"},
  "pauvre":{en:"poor",it:"povero",es:"pobre",de:"arm",pt:"pobre",nl:"arm"},
  "drôle":{en:"funny",it:"divertente",es:"gracioso",de:"lustig",pt:"engraçado",nl:"grappig"},
  "gentil":{en:"kind",it:"gentile",es:"amable",de:"nett",pt:"gentil",nl:"aardig"},
  "appeler":{en:"to call",it:"chiamare",es:"llamar",de:"anrufen",pt:"telefonar",nl:"bellen"},
  "répondre":{en:"to answer",it:"rispondere",es:"responder",de:"antworten",pt:"responder",nl:"antwoorden"},
  "demander":{en:"to ask",it:"chiedere",es:"preguntar",de:"fragen",pt:"perguntar",nl:"vragen"},
  "envoyer":{en:"to send",it:"inviare",es:"enviar",de:"schicken",pt:"enviar",nl:"sturen"},
  "recevoir":{en:"to receive",it:"ricevere",es:"recibir",de:"bekommen",pt:"receber",nl:"ontvangen"},
  "question":{en:"question",it:"domanda",es:"pregunta",de:"Frage",pt:"pergunta",nl:"vraag"},
  "réponse":{en:"answer",it:"risposta",es:"respuesta",de:"Antwort",pt:"resposta",nl:"antwoord"},
  "nouvelle":{en:"news",it:"notizia",es:"noticia",de:"Nachricht",pt:"notícia",nl:"nieuws"},
  "lettre":{en:"letter",it:"lettera",es:"carta",de:"Brief",pt:"carta",nl:"brief"},
  "adresse":{en:"address",it:"indirizzo",es:"dirección",de:"Adresse",pt:"morada",nl:"adres"},
  "e-mail":{en:"email",it:"email",es:"correo electrónico",de:"E-Mail",pt:"e-mail",nl:"e-mail"},
  "numéro":{en:"number",it:"numero",es:"número",de:"Nummer",pt:"número",nl:"nummer"},
  "rivière":{en:"river",it:"fiume",es:"río",de:"Fluss",pt:"rio",nl:"rivier"},
  "lac":{en:"lake",it:"lago",es:"lago",de:"See",pt:"lago",nl:"meer"},
  "forêt":{en:"forest",it:"foresta",es:"bosque",de:"Wald",pt:"floresta",nl:"bos"},
  "île":{en:"island",it:"isola",es:"isla",de:"Insel",pt:"ilha",nl:"eiland"},
  "colline":{en:"hill",it:"collina",es:"colina",de:"Hügel",pt:"colina",nl:"heuvel"},
  "champ":{en:"field",it:"campo",es:"campo",de:"Feld",pt:"campo",nl:"veld"},
  "herbe":{en:"grass",it:"erba",es:"hierba",de:"Gras",pt:"erva",nl:"gras"},
  "feuille":{en:"leaf",it:"foglia",es:"hoja",de:"Blatt",pt:"folha",nl:"blad"},
  "pierre":{en:"stone",it:"pietra",es:"piedra",de:"Stein",pt:"pedra",nl:"steen"},
  "terre":{en:"earth",it:"terra",es:"tierra",de:"Erde",pt:"terra",nl:"aarde"},
  "feu":{en:"fire",it:"fuoco",es:"fuego",de:"Feuer",pt:"fogo",nl:"vuur"},
  "étoile":{en:"star",it:"stella",es:"estrella",de:"Stern",pt:"estrela",nl:"ster"},
  "lion":{en:"lion",it:"leone",es:"león",de:"Löwe",pt:"leão",nl:"leeuw"},
  "tigre":{en:"tiger",it:"tigre",es:"tigre",de:"Tiger",pt:"tigre",nl:"tijger"},
  "éléphant":{en:"elephant",it:"elefante",es:"elefante",de:"Elefant",pt:"elefante",nl:"olifant"},
  "singe":{en:"monkey",it:"scimmia",es:"mono",de:"Affe",pt:"macaco",nl:"aap"},
  "ours":{en:"bear",it:"orso",es:"oso",de:"Bär",pt:"urso",nl:"beer"},
  "loup":{en:"wolf",it:"lupo",es:"lobo",de:"Wolf",pt:"lobo",nl:"wolf"},
  "renard":{en:"fox",it:"volpe",es:"zorro",de:"Fuchs",pt:"raposa",nl:"vos"},
  "serpent":{en:"snake",it:"serpente",es:"serpiente",de:"Schlange",pt:"cobra",nl:"slang"},
  "abeille":{en:"bee",it:"ape",es:"abeja",de:"Biene",pt:"abelha",nl:"bij"},
  "papillon":{en:"butterfly",it:"farfalla",es:"mariposa",de:"Schmetterling",pt:"borboleta",nl:"vlinder"},
  "araignée":{en:"spider",it:"ragno",es:"araña",de:"Spinne",pt:"aranha",nl:"spin"},
  "canard":{en:"duck",it:"anatra",es:"pato",de:"Ente",pt:"pato",nl:"eend"},
  "avec":{en:"with",it:"con",es:"con",de:"mit",pt:"com",nl:"met"},
  "sans":{en:"without",it:"senza",es:"sin",de:"ohne",pt:"sem",nl:"zonder"},
  "aussi":{en:"also",it:"anche",es:"también",de:"auch",pt:"também",nl:"ook"},
  "mais":{en:"but",it:"ma",es:"pero",de:"aber",pt:"mas",nl:"maar"},
  "parce que":{en:"because",it:"perché",es:"porque",de:"weil",pt:"porque",nl:"omdat"},
  "ou":{en:"or",it:"o",es:"o",de:"oder",pt:"ou",nl:"of"},
  "si":{en:"if",it:"se",es:"si",de:"wenn",pt:"se",nl:"als"},
  "donc":{en:"so",it:"quindi",es:"entonces",de:"also",pt:"portanto",nl:"dus"},
  "beaucoup":{en:"a lot",it:"molto",es:"mucho",de:"viel",pt:"muito",nl:"veel"},
  "peu":{en:"little",it:"poco",es:"poco",de:"wenig",pt:"pouco",nl:"weinig"},
  "très":{en:"very",it:"molto",es:"muy",de:"sehr",pt:"muito",nl:"heel"},
  "peut-être":{en:"maybe",it:"forse",es:"quizás",de:"vielleicht",pt:"talvez",nl:"misschien"},
  "quelque chose":{en:"something",it:"qualcosa",es:"algo",de:"etwas",pt:"alguma coisa",nl:"iets"},
  "rien":{en:"nothing",it:"niente",es:"nada",de:"nichts",pt:"nada",nl:"niets"},
  "tout":{en:"everything",it:"tutto",es:"todo",de:"alles",pt:"tudo",nl:"alles"},
  "quelqu'un":{en:"someone",it:"qualcuno",es:"alguien",de:"jemand",pt:"alguém",nl:"iemand"},
  "je cherche la gare":{en:"I am looking for the station",it:"cerco la stazione",es:"busco la estación",de:"ich suche den Bahnhof",pt:"procuro a estação",nl:"ik zoek het station"},
  "je me lave les mains":{en:"I wash my hands",it:"mi lavo le mani",es:"me lavo las manos",de:"ich wasche mir die Hände",pt:"lavo as mãos",nl:"ik was mijn handen"},
  "c'est trop cher":{en:"it is too expensive",it:"è troppo caro",es:"es demasiado caro",de:"das ist zu teuer",pt:"é demasiado caro",nl:"het is te duur"},
  "le magasin est ouvert":{en:"the shop is open",it:"il negozio è aperto",es:"la tienda está abierta",de:"das Geschäft ist geöffnet",pt:"a loja está aberta",nl:"de winkel is open"},
  "je réserve un hôtel":{en:"I book a hotel",it:"prenoto un hotel",es:"reservo un hotel",de:"ich reserviere ein Hotel",pt:"reservo um hotel",nl:"ik reserveer een hotel"},
  "je t'appelle demain":{en:"I will call you tomorrow",it:"ti chiamo domani",es:"te llamo mañana",de:"ich rufe dich morgen an",pt:"telefono-te amanhã",nl:"ik bel je morgen"},
  "la rivière est froide":{en:"the river is cold",it:"il fiume è freddo",es:"el río está frío",de:"der Fluss ist kalt",pt:"o rio está frio",nl:"de rivier is koud"},
  "l'abeille aime les fleurs":{en:"the bee likes flowers",it:"l'ape ama i fiori",es:"a la abeja le gustan las flores",de:"die Biene mag Blumen",pt:"a abelha gosta de flores",nl:"de bij houdt van bloemen"},
  "je voyage avec ma famille":{en:"I travel with my family",it:"viaggio con la mia famiglia",es:"viajo con mi familia",de:"ich reise mit meiner Familie",pt:"viajo com a minha família",nl:"ik reis met mijn familie"}
};
CURRICULUM_Z.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV2).forEach(function(k){ if(NEWV2[k][l]) LEX[l][k]=NEWV2[k][l]; }); });

/* --- v2.57 « Enrichi +++ » : 2e grande vague (A2 solide → cap A2+/B1) — 16 unités, ~187 entrées.
   Toujours le même mécanisme à parité garantie. Portugais EUROPÉEN assumé partout
   (constipação, auscultadores, videojogo, ficheiro, descarregar, conduzir, turma…). --- */
var CURRICULUM_W = [
  { t:"La maison en détail 🛋", c:"#0ea5e9", L:[
    { t:"Les pièces", w:["salon","chambre","jardin","garage","étage","escalier"] },
    { t:"La structure", w:["toit","mur","sol","plafond","ascenseur","voisin"] }
  ]},
  { t:"Les objets du quotidien 🔑", c:"#f59e0b", L:[
    { t:"Sur moi", w:["montre","lunettes","parapluie","portefeuille","stylo","crayon"] },
    { t:"À la maison", w:["ciseaux","papier","journal","boîte","bougie"] }
  ]},
  { t:"Le caractère 💭", c:"#8b5cf6", L:[
    { t:"Les qualités", w:["intelligent","poli","courageux","honnête","patient","sympathique"] },
    { t:"Les traits", w:["timide","sérieux","paresseux","curieux","méchant","sévère"] }
  ]},
  { t:"Apprendre 🎓", c:"#10b981", L:[
    { t:"En classe", w:["élève","classe","leçon","examen","note","erreur","cahier"] },
    { t:"Les mots", w:["mot","phrase","langue","dictionnaire","page","sac à dos"] }
  ]},
  { t:"Le temps libre 🎨", c:"#ec4899", L:[
    { t:"Créer", w:["dessiner","peindre","chanson","guitare","piano"] },
    { t:"Sortir", w:["marcher","promenade","pêcher","fête","invité"] }
  ]},
  { t:"Les sens 👂", c:"#3b82f6", L:[
    { t:"Percevoir", w:["regarder","écouter","entendre","toucher","goûter"] },
    { t:"Le corps encore", w:["voix","peau","épaule","genou","cou","sourire"] }
  ]},
  { t:"La grande famille 👥", c:"#e11d48", L:[
    { t:"Les proches encore", w:["oncle","tante","cousin","neveu","nièce"] },
    { t:"Les gens", w:["mari","couple","adulte","personne"] }
  ]},
  { t:"Les mesures 📏", c:"#7c3aed", L:[
    { t:"Compter", w:["mètre","kilomètre","kilo","litre"] },
    { t:"Les parts", w:["moitié","quart","double","premier","dernier","prochain"] }
  ]},
  { t:"À table encore 🍲", c:"#f97316", L:[
    { t:"Les goûts", w:["goût","délicieux","sucré","salé","amer","épicé"], p:["c'est délicieux"] },
    { t:"La faim", w:["faim","soif","boisson","morceau","tranche"], p:["j'ai faim","j'ai soif"] }
  ]},
  { t:"Les métiers encore 💼", c:"#14b8a6", L:[
    { t:"Qui fait quoi", w:["métier","usine","vendeur","infirmier","pompier"] },
    { t:"En ville", w:["facteur","coiffeur","dentiste","gagner","perdre"] }
  ]},
  { t:"Le cœur encore 💗", c:"#a855f7", L:[
    { t:"Les élans", w:["espoir","joie","chance","rêve","espérer"], p:["je rêve de voyager"] },
    { t:"Les ombres", w:["colère","honte","souci","embrasser"] }
  ]},
  { t:"Chez le médecin 🏥", c:"#ef4444", L:[
    { t:"Les soucis", w:["rendez-vous","blessure","sang","tousser"] },
    { t:"Se soigner", w:["rhume","grippe","urgence","sain"] }
  ]},
  { t:"Le numérique 🖥", c:"#22c55e", L:[
    { t:"Les appareils", w:["imprimante","écouteurs","appareil photo","allumer","éteindre"] },
    { t:"En ligne encore", w:["fichier","site","réseau","jeu vidéo","télécharger"] }
  ]},
  { t:"Le monde 🌐", c:"#0ea5e9", L:[
    { t:"La carte", w:["pays","monde","capitale","drapeau"], p:["mon pays est beau"] },
    { t:"Les directions", w:["nord","sud","est","ouest"] },
    { t:"L'histoire", w:["roi","reine","guerre","paix"] }
  ]},
  { t:"Parler couramment 🗣", c:"#f6b73c", L:[
    { t:"Survivre", w:["je ne comprends pas","pouvez-vous répéter","je suis d'accord","ça ne fait rien","bien sûr"] },
    { t:"Être poli", w:["à bientôt","bon appétit","félicitations","bienvenue","attention"] }
  ]},
  { t:"Bouger partout 🏃", c:"#12b981", L:[
    { t:"Aller et venir", w:["entrer","sortir","monter","descendre","rester","partir"], p:["je reste à la maison","le train part à huit heures"] },
    { t:"En mouvement", w:["tomber","sauter","voler","conduire","arrêter","revenir"] }
  ]}
];
var NEWV3 = {
  "salon":{en:"living room",it:"soggiorno",es:"salón",de:"Wohnzimmer",pt:"sala de estar",nl:"woonkamer"},
  "chambre":{en:"bedroom",it:"camera",es:"habitación",de:"Schlafzimmer",pt:"quarto",nl:"slaapkamer"},
  "jardin":{en:"garden",it:"giardino",es:"jardín",de:"Garten",pt:"jardim",nl:"tuin"},
  "garage":{en:"garage",it:"garage",es:"garaje",de:"Garage",pt:"garagem",nl:"garage"},
  "étage":{en:"floor",it:"piano",es:"piso",de:"Etage",pt:"andar",nl:"verdieping"},
  "escalier":{en:"stairs",it:"scale",es:"escalera",de:"Treppe",pt:"escada",nl:"trap"},
  "toit":{en:"roof",it:"tetto",es:"tejado",de:"Dach",pt:"telhado",nl:"dak"},
  "mur":{en:"wall",it:"muro",es:"pared",de:"Wand",pt:"parede",nl:"muur"},
  "sol":{en:"floor",it:"pavimento",es:"suelo",de:"Boden",pt:"chão",nl:"vloer"},
  "plafond":{en:"ceiling",it:"soffitto",es:"techo",de:"Decke",pt:"teto",nl:"plafond"},
  "ascenseur":{en:"lift",it:"ascensore",es:"ascensor",de:"Aufzug",pt:"elevador",nl:"lift"},
  "voisin":{en:"neighbour",it:"vicino",es:"vecino",de:"Nachbar",pt:"vizinho",nl:"buurman"},
  "montre":{en:"watch",it:"orologio",es:"reloj",de:"Uhr",pt:"relógio",nl:"horloge"},
  "lunettes":{en:"glasses",it:"occhiali",es:"gafas",de:"Brille",pt:"óculos",nl:"bril"},
  "parapluie":{en:"umbrella",it:"ombrello",es:"paraguas",de:"Regenschirm",pt:"guarda-chuva",nl:"paraplu"},
  "portefeuille":{en:"wallet",it:"portafoglio",es:"cartera",de:"Brieftasche",pt:"carteira",nl:"portemonnee"},
  "stylo":{en:"pen",it:"penna",es:"bolígrafo",de:"Kugelschreiber",pt:"caneta",nl:"pen"},
  "crayon":{en:"pencil",it:"matita",es:"lápiz",de:"Bleistift",pt:"lápis",nl:"potlood"},
  "ciseaux":{en:"scissors",it:"forbici",es:"tijeras",de:"Schere",pt:"tesoura",nl:"schaar"},
  "papier":{en:"paper",it:"carta",es:"papel",de:"Papier",pt:"papel",nl:"papier"},
  "journal":{en:"newspaper",it:"giornale",es:"periódico",de:"Zeitung",pt:"jornal",nl:"krant"},
  "boîte":{en:"box",it:"scatola",es:"caja",de:"Schachtel",pt:"caixa",nl:"doos"},
  "bougie":{en:"candle",it:"candela",es:"vela",de:"Kerze",pt:"vela",nl:"kaars"},
  "intelligent":{en:"intelligent",it:"intelligente",es:"inteligente",de:"intelligent",pt:"inteligente",nl:"slim"},
  "poli":{en:"polite",it:"educato",es:"educado",de:"höflich",pt:"educado",nl:"beleefd"},
  "courageux":{en:"brave",it:"coraggioso",es:"valiente",de:"mutig",pt:"corajoso",nl:"moedig"},
  "honnête":{en:"honest",it:"onesto",es:"honesto",de:"ehrlich",pt:"honesto",nl:"eerlijk"},
  "patient":{en:"patient",it:"paziente",es:"paciente",de:"geduldig",pt:"paciente",nl:"geduldig"},
  "sympathique":{en:"nice",it:"simpatico",es:"simpático",de:"sympathisch",pt:"simpático",nl:"sympathiek"},
  "timide":{en:"shy",it:"timido",es:"tímido",de:"schüchtern",pt:"tímido",nl:"verlegen"},
  "sérieux":{en:"serious",it:"serio",es:"serio",de:"ernst",pt:"sério",nl:"serieus"},
  "paresseux":{en:"lazy",it:"pigro",es:"perezoso",de:"faul",pt:"preguiçoso",nl:"lui"},
  "curieux":{en:"curious",it:"curioso",es:"curioso",de:"neugierig",pt:"curioso",nl:"nieuwsgierig"},
  "méchant":{en:"mean",it:"cattivo",es:"malo",de:"böse",pt:"mau",nl:"gemeen"},
  "sévère":{en:"strict",it:"severo",es:"estricto",de:"streng",pt:"severo",nl:"streng"},
  "élève":{en:"pupil",it:"alunno",es:"alumno",de:"Schüler",pt:"aluno",nl:"leerling"},
  "classe":{en:"class",it:"classe",es:"clase",de:"Klasse",pt:"turma",nl:"klas"},
  "leçon":{en:"lesson",it:"lezione",es:"lección",de:"Lektion",pt:"lição",nl:"les"},
  "examen":{en:"exam",it:"esame",es:"examen",de:"Prüfung",pt:"exame",nl:"examen"},
  "note":{en:"grade",it:"voto",es:"nota",de:"Note",pt:"nota",nl:"cijfer"},
  "erreur":{en:"mistake",it:"errore",es:"error",de:"Fehler",pt:"erro",nl:"fout"},
  "cahier":{en:"notebook",it:"quaderno",es:"cuaderno",de:"Heft",pt:"caderno",nl:"schrift"},
  "mot":{en:"word",it:"parola",es:"palabra",de:"Wort",pt:"palavra",nl:"woord"},
  "phrase":{en:"sentence",it:"frase",es:"frase",de:"Satz",pt:"frase",nl:"zin"},
  "langue":{en:"language",it:"lingua",es:"idioma",de:"Sprache",pt:"língua",nl:"taal"},
  "dictionnaire":{en:"dictionary",it:"dizionario",es:"diccionario",de:"Wörterbuch",pt:"dicionário",nl:"woordenboek"},
  "page":{en:"page",it:"pagina",es:"página",de:"Seite",pt:"página",nl:"pagina"},
  "sac à dos":{en:"backpack",it:"zaino",es:"mochila",de:"Rucksack",pt:"mochila",nl:"rugzak"},
  "dessiner":{en:"to draw",it:"disegnare",es:"dibujar",de:"zeichnen",pt:"desenhar",nl:"tekenen"},
  "peindre":{en:"to paint",it:"dipingere",es:"pintar",de:"malen",pt:"pintar",nl:"schilderen"},
  "chanson":{en:"song",it:"canzone",es:"canción",de:"Lied",pt:"canção",nl:"lied"},
  "guitare":{en:"guitar",it:"chitarra",es:"guitarra",de:"Gitarre",pt:"guitarra",nl:"gitaar"},
  "piano":{en:"piano",it:"pianoforte",es:"piano",de:"Klavier",pt:"piano",nl:"piano"},
  "marcher":{en:"to walk",it:"camminare",es:"caminar",de:"zu Fuß gehen",pt:"caminhar",nl:"wandelen"},
  "promenade":{en:"walk",it:"passeggiata",es:"paseo",de:"Spaziergang",pt:"passeio",nl:"wandeling"},
  "pêcher":{en:"to fish",it:"pescare",es:"pescar",de:"angeln",pt:"pescar",nl:"vissen"},
  "fête":{en:"party",it:"festa",es:"fiesta",de:"Party",pt:"festa",nl:"feest"},
  "invité":{en:"guest",it:"ospite",es:"invitado",de:"Gast",pt:"convidado",nl:"gast"},
  "regarder":{en:"to watch",it:"guardare",es:"mirar",de:"schauen",pt:"olhar",nl:"kijken"},
  "écouter":{en:"to listen",it:"ascoltare",es:"escuchar",de:"zuhören",pt:"escutar",nl:"luisteren"},
  "entendre":{en:"to hear",it:"sentire",es:"oír",de:"hören",pt:"ouvir",nl:"horen"},
  "toucher":{en:"to touch",it:"toccare",es:"tocar",de:"berühren",pt:"tocar",nl:"aanraken"},
  "goûter":{en:"to taste",it:"assaggiare",es:"probar",de:"probieren",pt:"provar",nl:"proeven"},
  "voix":{en:"voice",it:"voce",es:"voz",de:"Stimme",pt:"voz",nl:"stem"},
  "peau":{en:"skin",it:"pelle",es:"piel",de:"Haut",pt:"pele",nl:"huid"},
  "épaule":{en:"shoulder",it:"spalla",es:"hombro",de:"Schulter",pt:"ombro",nl:"schouder"},
  "genou":{en:"knee",it:"ginocchio",es:"rodilla",de:"Knie",pt:"joelho",nl:"knie"},
  "cou":{en:"neck",it:"collo",es:"cuello",de:"Hals",pt:"pescoço",nl:"nek"},
  "sourire":{en:"smile",it:"sorriso",es:"sonrisa",de:"Lächeln",pt:"sorriso",nl:"glimlach"},
  "oncle":{en:"uncle",it:"zio",es:"tío",de:"Onkel",pt:"tio",nl:"oom"},
  "tante":{en:"aunt",it:"zia",es:"tía",de:"Tante",pt:"tia",nl:"tante"},
  "cousin":{en:"cousin",it:"cugino",es:"primo",de:"Cousin",pt:"primo",nl:"neef"},
  "neveu":{en:"nephew",it:"nipote",es:"sobrino",de:"Neffe",pt:"sobrinho",nl:"neefje"},
  "nièce":{en:"niece",it:"nipote",es:"sobrina",de:"Nichte",pt:"sobrinha",nl:"nichtje"},
  "mari":{en:"husband",it:"marito",es:"marido",de:"Ehemann",pt:"marido",nl:"echtgenoot"},
  "couple":{en:"couple",it:"coppia",es:"pareja",de:"Paar",pt:"casal",nl:"stel"},
  "adulte":{en:"adult",it:"adulto",es:"adulto",de:"Erwachsener",pt:"adulto",nl:"volwassene"},
  "personne":{en:"person",it:"persona",es:"persona",de:"Person",pt:"pessoa",nl:"persoon"},
  "mètre":{en:"metre",it:"metro",es:"metro",de:"Meter",pt:"metro",nl:"meter"},
  "kilomètre":{en:"kilometre",it:"chilometro",es:"kilómetro",de:"Kilometer",pt:"quilómetro",nl:"kilometer"},
  "kilo":{en:"kilo",it:"chilo",es:"kilo",de:"Kilo",pt:"quilo",nl:"kilo"},
  "litre":{en:"litre",it:"litro",es:"litro",de:"Liter",pt:"litro",nl:"liter"},
  "moitié":{en:"half",it:"metà",es:"mitad",de:"Hälfte",pt:"metade",nl:"helft"},
  "quart":{en:"quarter",it:"quarto",es:"cuarto",de:"Viertel",pt:"quarto",nl:"kwart"},
  "double":{en:"double",it:"doppio",es:"doble",de:"doppelt",pt:"dobro",nl:"dubbel"},
  "premier":{en:"first",it:"primo",es:"primero",de:"erste",pt:"primeiro",nl:"eerste"},
  "dernier":{en:"last",it:"ultimo",es:"último",de:"letzte",pt:"último",nl:"laatste"},
  "prochain":{en:"next",it:"prossimo",es:"próximo",de:"nächste",pt:"próximo",nl:"volgende"},
  "goût":{en:"taste",it:"gusto",es:"sabor",de:"Geschmack",pt:"sabor",nl:"smaak"},
  "délicieux":{en:"delicious",it:"delizioso",es:"delicioso",de:"lecker",pt:"delicioso",nl:"heerlijk"},
  "sucré":{en:"sweet",it:"dolce",es:"dulce",de:"süß",pt:"doce",nl:"zoet"},
  "salé":{en:"salty",it:"salato",es:"salado",de:"salzig",pt:"salgado",nl:"zout"},
  "amer":{en:"bitter",it:"amaro",es:"amargo",de:"bitter",pt:"amargo",nl:"bitter"},
  "épicé":{en:"spicy",it:"piccante",es:"picante",de:"scharf",pt:"picante",nl:"pittig"},
  "faim":{en:"hunger",it:"fame",es:"hambre",de:"Hunger",pt:"fome",nl:"honger"},
  "soif":{en:"thirst",it:"sete",es:"sed",de:"Durst",pt:"sede",nl:"dorst"},
  "boisson":{en:"drink",it:"bevanda",es:"bebida",de:"Getränk",pt:"bebida",nl:"drankje"},
  "morceau":{en:"piece",it:"pezzo",es:"trozo",de:"Stück",pt:"pedaço",nl:"stuk"},
  "tranche":{en:"slice",it:"fetta",es:"rebanada",de:"Scheibe",pt:"fatia",nl:"plak"},
  "métier":{en:"profession",it:"mestiere",es:"oficio",de:"Beruf",pt:"profissão",nl:"beroep"},
  "usine":{en:"factory",it:"fabbrica",es:"fábrica",de:"Fabrik",pt:"fábrica",nl:"fabriek"},
  "vendeur":{en:"salesman",it:"venditore",es:"vendedor",de:"Verkäufer",pt:"vendedor",nl:"verkoper"},
  "infirmier":{en:"nurse",it:"infermiere",es:"enfermero",de:"Krankenpfleger",pt:"enfermeiro",nl:"verpleger"},
  "pompier":{en:"firefighter",it:"pompiere",es:"bombero",de:"Feuerwehrmann",pt:"bombeiro",nl:"brandweerman"},
  "facteur":{en:"postman",it:"postino",es:"cartero",de:"Briefträger",pt:"carteiro",nl:"postbode"},
  "coiffeur":{en:"hairdresser",it:"parrucchiere",es:"peluquero",de:"Friseur",pt:"cabeleireiro",nl:"kapper"},
  "dentiste":{en:"dentist",it:"dentista",es:"dentista",de:"Zahnarzt",pt:"dentista",nl:"tandarts"},
  "gagner":{en:"to win",it:"vincere",es:"ganar",de:"gewinnen",pt:"ganhar",nl:"winnen"},
  "perdre":{en:"to lose",it:"perdere",es:"perder",de:"verlieren",pt:"perder",nl:"verliezen"},
  "espoir":{en:"hope",it:"speranza",es:"esperanza",de:"Hoffnung",pt:"esperança",nl:"hoop"},
  "joie":{en:"joy",it:"gioia",es:"alegría",de:"Freude",pt:"alegria",nl:"vreugde"},
  "chance":{en:"luck",it:"fortuna",es:"suerte",de:"Glück",pt:"sorte",nl:"geluk"},
  "rêve":{en:"dream",it:"sogno",es:"sueño",de:"Traum",pt:"sonho",nl:"droom"},
  "espérer":{en:"to hope",it:"sperare",es:"esperar",de:"hoffen",pt:"esperar",nl:"hopen"},
  "colère":{en:"anger",it:"rabbia",es:"enfado",de:"Wut",pt:"raiva",nl:"woede"},
  "honte":{en:"shame",it:"vergogna",es:"vergüenza",de:"Scham",pt:"vergonha",nl:"schaamte"},
  "souci":{en:"worry",it:"preoccupazione",es:"preocupación",de:"Sorge",pt:"preocupação",nl:"zorg"},
  "embrasser":{en:"to kiss",it:"baciare",es:"besar",de:"küssen",pt:"beijar",nl:"kussen"},
  "rendez-vous":{en:"appointment",it:"appuntamento",es:"cita",de:"Termin",pt:"consulta",nl:"afspraak"},
  "blessure":{en:"injury",it:"ferita",es:"herida",de:"Verletzung",pt:"ferida",nl:"wond"},
  "sang":{en:"blood",it:"sangue",es:"sangre",de:"Blut",pt:"sangue",nl:"bloed"},
  "tousser":{en:"to cough",it:"tossire",es:"toser",de:"husten",pt:"tossir",nl:"hoesten"},
  "rhume":{en:"cold",it:"raffreddore",es:"resfriado",de:"Erkältung",pt:"constipação",nl:"verkoudheid"},
  "grippe":{en:"flu",it:"influenza",es:"gripe",de:"Grippe",pt:"gripe",nl:"griep"},
  "urgence":{en:"emergency",it:"emergenza",es:"emergencia",de:"Notfall",pt:"emergência",nl:"noodgeval"},
  "sain":{en:"healthy",it:"sano",es:"sano",de:"gesund",pt:"saudável",nl:"gezond"},
  "imprimante":{en:"printer",it:"stampante",es:"impresora",de:"Drucker",pt:"impressora",nl:"printer"},
  "écouteurs":{en:"headphones",it:"cuffie",es:"auriculares",de:"Kopfhörer",pt:"auscultadores",nl:"koptelefoon"},
  "appareil photo":{en:"camera",it:"macchina fotografica",es:"cámara",de:"Kamera",pt:"máquina fotográfica",nl:"camera"},
  "allumer":{en:"to switch on",it:"accendere",es:"encender",de:"einschalten",pt:"ligar",nl:"aanzetten"},
  "éteindre":{en:"to switch off",it:"spegnere",es:"apagar",de:"ausschalten",pt:"desligar",nl:"uitzetten"},
  "fichier":{en:"file",it:"file",es:"archivo",de:"Datei",pt:"ficheiro",nl:"bestand"},
  "site":{en:"website",it:"sito",es:"sitio web",de:"Webseite",pt:"site",nl:"website"},
  "réseau":{en:"network",it:"rete",es:"red",de:"Netzwerk",pt:"rede",nl:"netwerk"},
  "jeu vidéo":{en:"video game",it:"videogioco",es:"videojuego",de:"Videospiel",pt:"videojogo",nl:"computerspel"},
  "télécharger":{en:"to download",it:"scaricare",es:"descargar",de:"herunterladen",pt:"descarregar",nl:"downloaden"},
  "pays":{en:"country",it:"paese",es:"país",de:"Land",pt:"país",nl:"land"},
  "monde":{en:"world",it:"mondo",es:"mundo",de:"Welt",pt:"mundo",nl:"wereld"},
  "capitale":{en:"capital",it:"capitale",es:"capital",de:"Hauptstadt",pt:"capital",nl:"hoofdstad"},
  "drapeau":{en:"flag",it:"bandiera",es:"bandera",de:"Flagge",pt:"bandeira",nl:"vlag"},
  "nord":{en:"north",it:"nord",es:"norte",de:"Norden",pt:"norte",nl:"noorden"},
  "sud":{en:"south",it:"sud",es:"sur",de:"Süden",pt:"sul",nl:"zuiden"},
  "est":{en:"east",it:"est",es:"este",de:"Osten",pt:"leste",nl:"oosten"},
  "ouest":{en:"west",it:"ovest",es:"oeste",de:"Westen",pt:"oeste",nl:"westen"},
  "roi":{en:"king",it:"re",es:"rey",de:"König",pt:"rei",nl:"koning"},
  "reine":{en:"queen",it:"regina",es:"reina",de:"Königin",pt:"rainha",nl:"koningin"},
  "guerre":{en:"war",it:"guerra",es:"guerra",de:"Krieg",pt:"guerra",nl:"oorlog"},
  "paix":{en:"peace",it:"pace",es:"paz",de:"Frieden",pt:"paz",nl:"vrede"},
  "je ne comprends pas":{en:"I don't understand",it:"non capisco",es:"no entiendo",de:"ich verstehe nicht",pt:"não percebo",nl:"ik begrijp het niet"},
  "pouvez-vous répéter":{en:"can you repeat",it:"può ripetere",es:"¿puede repetir?",de:"können Sie das wiederholen",pt:"pode repetir",nl:"kunt u dat herhalen"},
  "je suis d'accord":{en:"I agree",it:"sono d'accordo",es:"estoy de acuerdo",de:"ich stimme zu",pt:"concordo",nl:"ik ben het eens"},
  "ça ne fait rien":{en:"it doesn't matter",it:"non fa niente",es:"no importa",de:"das macht nichts",pt:"não faz mal",nl:"het geeft niet"},
  "bien sûr":{en:"of course",it:"certo",es:"por supuesto",de:"natürlich",pt:"claro",nl:"natuurlijk"},
  "à bientôt":{en:"see you soon",it:"a presto",es:"hasta pronto",de:"bis bald",pt:"até breve",nl:"tot snel"},
  "bon appétit":{en:"enjoy your meal",it:"buon appetito",es:"buen provecho",de:"guten Appetit",pt:"bom apetite",nl:"eet smakelijk"},
  "félicitations":{en:"congratulations",it:"congratulazioni",es:"enhorabuena",de:"herzlichen Glückwunsch",pt:"parabéns",nl:"gefeliciteerd"},
  "bienvenue":{en:"welcome",it:"benvenuto",es:"bienvenido",de:"willkommen",pt:"bem-vindo",nl:"welkom"},
  "attention":{en:"watch out",it:"attenzione",es:"cuidado",de:"Achtung",pt:"cuidado",nl:"pas op"},
  "entrer":{en:"to enter",it:"entrare",es:"entrar",de:"eintreten",pt:"entrar",nl:"binnenkomen"},
  "sortir":{en:"to go out",it:"uscire",es:"salir",de:"ausgehen",pt:"sair",nl:"uitgaan"},
  "monter":{en:"to go up",it:"salire",es:"subir",de:"hinaufgehen",pt:"subir",nl:"omhooggaan"},
  "descendre":{en:"to go down",it:"scendere",es:"bajar",de:"hinuntergehen",pt:"descer",nl:"naar beneden gaan"},
  "rester":{en:"to stay",it:"restare",es:"quedarse",de:"bleiben",pt:"ficar",nl:"blijven"},
  "partir":{en:"to leave",it:"partire",es:"irse",de:"weggehen",pt:"partir",nl:"vertrekken"},
  "tomber":{en:"to fall",it:"cadere",es:"caer",de:"fallen",pt:"cair",nl:"vallen"},
  "sauter":{en:"to jump",it:"saltare",es:"saltar",de:"springen",pt:"saltar",nl:"springen"},
  "voler":{en:"to fly",it:"volare",es:"volar",de:"fliegen",pt:"voar",nl:"vliegen"},
  "conduire":{en:"to drive",it:"guidare",es:"conducir",de:"fahren",pt:"conduzir",nl:"rijden"},
  "arrêter":{en:"to stop",it:"fermare",es:"parar",de:"anhalten",pt:"parar",nl:"stoppen"},
  "revenir":{en:"to come back",it:"tornare",es:"volver",de:"zurückkommen",pt:"voltar",nl:"terugkomen"},
  "c'est délicieux":{en:"it is delicious",it:"è delizioso",es:"está delicioso",de:"das ist lecker",pt:"está delicioso",nl:"het is heerlijk"},
  "j'ai faim":{en:"I am hungry",it:"ho fame",es:"tengo hambre",de:"ich habe Hunger",pt:"tenho fome",nl:"ik heb honger"},
  "j'ai soif":{en:"I am thirsty",it:"ho sete",es:"tengo sed",de:"ich habe Durst",pt:"tenho sede",nl:"ik heb dorst"},
  "je rêve de voyager":{en:"I dream of travelling",it:"sogno di viaggiare",es:"sueño con viajar",de:"ich träume vom Reisen",pt:"sonho em viajar",nl:"ik droom van reizen"},
  "mon pays est beau":{en:"my country is beautiful",it:"il mio paese è bello",es:"mi país es bonito",de:"mein Land ist schön",pt:"o meu país é bonito",nl:"mijn land is mooi"},
  "je reste à la maison":{en:"I stay at home",it:"resto a casa",es:"me quedo en casa",de:"ich bleibe zu Hause",pt:"fico em casa",nl:"ik blijf thuis"},
  "le train part à huit heures":{en:"the train leaves at eight",it:"il treno parte alle otto",es:"el tren sale a las ocho",de:"der Zug fährt um acht ab",pt:"o comboio parte às oito",nl:"de trein vertrekt om acht uur"}
};
CURRICULUM_W.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV3).forEach(function(k){ if(NEWV3[k][l]) LEX[l][k]=NEWV3[k][l]; }); });

/* --- v2.58 : 3e vague — objectif franchir A2+ (800 mots maîtrisables). 12 unités, 145 entrées.
   Parité garantie (NEWV4). Portugais EUROPÉEN encore : camisola, fiambre, rebuçado, bolacha,
   gelado, compota, renda, poupar, multibanco, carta de condução, trânsito, algures, apenas… --- */
var CURRICULUM_V = [
  { t:"Bon appétit encore 🥐", c:"#f59e0b", L:[
    { t:"Au menu", w:["poulet","jambon","saucisse","pâtes","frites","champignon"] },
    { t:"Les douceurs", w:["miel","confiture","yaourt","glace","chocolat","bonbon","biscuit"] }
  ]},
  { t:"L'argent malin 🏦", c:"#10b981", L:[
    { t:"À la banque", w:["compte","facture","impôt","loyer","pièce","distributeur"] },
    { t:"Gérer", w:["économiser","dépenser","économies","reçu"] }
  ]},
  { t:"S'habiller encore 👗", c:"#ec4899", L:[
    { t:"La garde-robe", w:["jupe","pull","veste","chaussettes","gants","écharpe"] },
    { t:"Les détails", w:["ceinture","poche","bouton","taille","mode"] }
  ]},
  { t:"La routine du matin 🕐", c:"#3b82f6", L:[
    { t:"Se lancer", w:["se réveiller","se lever","s'habiller","réveil","se dépêcher"], p:["je me lève à sept heures"] },
    { t:"À la maison", w:["se coucher","préparer","nettoyer","ranger","repasser"] }
  ]},
  { t:"La vie qui passe 👶", c:"#8b5cf6", L:[
    { t:"Les étapes", w:["naître","grandir","mourir","vie","mort","âge"] },
    { t:"Les grands jours", w:["anniversaire","mariage","naissance","enfance"], p:["joyeux anniversaire","la vie est belle"] },
    { t:"Le fil du temps", w:["avenir","passé","souvenir"] }
  ]},
  { t:"Décrire le monde 🎨", c:"#f97316", L:[
    { t:"La matière", w:["clair","foncé","mouillé","sec","doux","dur"] },
    { t:"L'espace", w:["profond","haut","bas","moderne","ancien"] },
    { t:"L'ambiance", w:["bruyant","silencieux","bruit","ennuyeux","intéressant","célèbre"] }
  ]},
  { t:"Petits mots 2 ❓", c:"#a855f7", L:[
    { t:"Situer", w:["lequel","quelque part","nulle part","ensemble","seulement"] },
    { t:"Rythmer", w:["d'accord","vraiment","déjà","presque","ensuite","enfin","tout de suite"] }
  ]},
  { t:"Raconter 🗨", c:"#14b8a6", L:[
    { t:"Dire le monde", w:["raconter","décrire","répéter","traduire","signifier","histoire"] },
    { t:"Entre nous", w:["promettre","mentir","crier","remercier","inviter","souhaiter"] }
  ]},
  { t:"La planète 🌱", c:"#22c55e", L:[
    { t:"Protéger", w:["environnement","pollution","déchets","recycler","protéger","énergie"] },
    { t:"La Terre", w:["planète","climat","nature","air","sauvage","animal","paysage","lumière"] }
  ]},
  { t:"Les fêtes 🎉", c:"#e11d48", L:[
    { t:"Le calendrier", w:["Noël","Pâques","nouvel an","week-end","jour férié"] },
    { t:"Faire la fête", w:["surprise","ballon","feu d'artifice","invitation","carnaval"] }
  ]},
  { t:"Vrai ou faux ⚖", c:"#0ea5e9", L:[
    { t:"Juger", w:["vrai","faux","possible","impossible"], p:["je suis prêt"] },
    { t:"L'état", w:["utile","prêt","occupé","libre"] }
  ]},
  { t:"Sur la route 🚦", c:"#7c3aed", L:[
    { t:"Conduire", w:["permis","essence","station-service","se garer","vitesse"], p:["il y a trop de circulation"] },
    { t:"Le trajet", w:["feu rouge","carrefour","autoroute","circulation","accident"] }
  ]}
];
var NEWV4 = {
  "poulet":{en:"chicken",it:"pollo",es:"pollo",de:"Hähnchen",pt:"frango",nl:"kip"},
  "jambon":{en:"ham",it:"prosciutto",es:"jamón",de:"Schinken",pt:"fiambre",nl:"ham"},
  "saucisse":{en:"sausage",it:"salsiccia",es:"salchicha",de:"Wurst",pt:"salsicha",nl:"worst"},
  "pâtes":{en:"pasta",it:"pasta",es:"pasta",de:"Nudeln",pt:"massa",nl:"pasta"},
  "frites":{en:"fries",it:"patatine fritte",es:"patatas fritas",de:"Pommes",pt:"batatas fritas",nl:"friet"},
  "champignon":{en:"mushroom",it:"fungo",es:"champiñón",de:"Pilz",pt:"cogumelo",nl:"champignon"},
  "miel":{en:"honey",it:"miele",es:"miel",de:"Honig",pt:"mel",nl:"honing"},
  "confiture":{en:"jam",it:"marmellata",es:"mermelada",de:"Marmelade",pt:"compota",nl:"jam"},
  "yaourt":{en:"yoghurt",it:"yogurt",es:"yogur",de:"Joghurt",pt:"iogurte",nl:"yoghurt"},
  "glace":{en:"ice cream",it:"gelato",es:"helado",de:"Eis",pt:"gelado",nl:"ijsje"},
  "chocolat":{en:"chocolate",it:"cioccolato",es:"chocolate",de:"Schokolade",pt:"chocolate",nl:"chocolade"},
  "bonbon":{en:"sweet",it:"caramella",es:"caramelo",de:"Bonbon",pt:"rebuçado",nl:"snoepje"},
  "biscuit":{en:"biscuit",it:"biscotto",es:"galleta",de:"Keks",pt:"bolacha",nl:"koekje"},
  "compte":{en:"account",it:"conto",es:"cuenta",de:"Konto",pt:"conta",nl:"rekening"},
  "facture":{en:"invoice",it:"fattura",es:"factura",de:"Rechnung",pt:"fatura",nl:"factuur"},
  "impôt":{en:"tax",it:"tassa",es:"impuesto",de:"Steuer",pt:"imposto",nl:"belasting"},
  "loyer":{en:"rent",it:"affitto",es:"alquiler",de:"Miete",pt:"renda",nl:"huur"},
  "pièce":{en:"coin",it:"moneta",es:"moneda",de:"Münze",pt:"moeda",nl:"munt"},
  "distributeur":{en:"cash machine",it:"bancomat",es:"cajero",de:"Geldautomat",pt:"multibanco",nl:"geldautomaat"},
  "économiser":{en:"to save",it:"risparmiare",es:"ahorrar",de:"sparen",pt:"poupar",nl:"sparen"},
  "dépenser":{en:"to spend",it:"spendere",es:"gastar",de:"ausgeben",pt:"gastar",nl:"uitgeven"},
  "économies":{en:"savings",it:"risparmi",es:"ahorros",de:"Ersparnisse",pt:"poupanças",nl:"spaargeld"},
  "reçu":{en:"receipt",it:"ricevuta",es:"recibo",de:"Quittung",pt:"recibo",nl:"kassabon"},
  "jupe":{en:"skirt",it:"gonna",es:"falda",de:"Rock",pt:"saia",nl:"rok"},
  "pull":{en:"jumper",it:"maglione",es:"jersey",de:"Pullover",pt:"camisola",nl:"trui"},
  "veste":{en:"jacket",it:"giacca",es:"chaqueta",de:"Jacke",pt:"casaco",nl:"jasje"},
  "chaussettes":{en:"socks",it:"calzini",es:"calcetines",de:"Socken",pt:"meias",nl:"sokken"},
  "gants":{en:"gloves",it:"guanti",es:"guantes",de:"Handschuhe",pt:"luvas",nl:"handschoenen"},
  "écharpe":{en:"scarf",it:"sciarpa",es:"bufanda",de:"Schal",pt:"cachecol",nl:"sjaal"},
  "ceinture":{en:"belt",it:"cintura",es:"cinturón",de:"Gürtel",pt:"cinto",nl:"riem"},
  "poche":{en:"pocket",it:"tasca",es:"bolsillo",de:"Hosentasche",pt:"bolso",nl:"zak"},
  "bouton":{en:"button",it:"bottone",es:"botón",de:"Knopf",pt:"botão",nl:"knoop"},
  "taille":{en:"size",it:"taglia",es:"talla",de:"Größe",pt:"tamanho",nl:"maat"},
  "mode":{en:"fashion",it:"moda",es:"moda",de:"Mode",pt:"moda",nl:"mode"},
  "se réveiller":{en:"to wake up",it:"svegliarsi",es:"despertarse",de:"aufwachen",pt:"acordar",nl:"wakker worden"},
  "se lever":{en:"to get up",it:"alzarsi",es:"levantarse",de:"aufstehen",pt:"levantar-se",nl:"opstaan"},
  "s'habiller":{en:"to get dressed",it:"vestirsi",es:"vestirse",de:"sich anziehen",pt:"vestir-se",nl:"zich aankleden"},
  "réveil":{en:"alarm clock",it:"sveglia",es:"despertador",de:"Wecker",pt:"despertador",nl:"wekker"},
  "se dépêcher":{en:"to hurry",it:"sbrigarsi",es:"darse prisa",de:"sich beeilen",pt:"despachar-se",nl:"zich haasten"},
  "se coucher":{en:"to go to bed",it:"andare a letto",es:"acostarse",de:"schlafen gehen",pt:"deitar-se",nl:"naar bed gaan"},
  "préparer":{en:"to prepare",it:"preparare",es:"preparar",de:"vorbereiten",pt:"preparar",nl:"voorbereiden"},
  "nettoyer":{en:"to clean",it:"pulire",es:"limpiar",de:"putzen",pt:"limpar",nl:"schoonmaken"},
  "ranger":{en:"to tidy",it:"riordinare",es:"ordenar",de:"aufräumen",pt:"arrumar",nl:"opruimen"},
  "repasser":{en:"to iron",it:"stirare",es:"planchar",de:"bügeln",pt:"passar a ferro",nl:"strijken"},
  "naître":{en:"to be born",it:"nascere",es:"nacer",de:"geboren werden",pt:"nascer",nl:"geboren worden"},
  "grandir":{en:"to grow",it:"crescere",es:"crecer",de:"wachsen",pt:"crescer",nl:"groeien"},
  "mourir":{en:"to die",it:"morire",es:"morir",de:"sterben",pt:"morrer",nl:"sterven"},
  "vie":{en:"life",it:"vita",es:"vida",de:"Leben",pt:"vida",nl:"leven"},
  "mort":{en:"death",it:"morte",es:"muerte",de:"Tod",pt:"morte",nl:"dood"},
  "âge":{en:"age",it:"età",es:"edad",de:"Alter",pt:"idade",nl:"leeftijd"},
  "anniversaire":{en:"birthday",it:"compleanno",es:"cumpleaños",de:"Geburtstag",pt:"aniversário",nl:"verjaardag"},
  "mariage":{en:"wedding",it:"matrimonio",es:"boda",de:"Hochzeit",pt:"casamento",nl:"bruiloft"},
  "naissance":{en:"birth",it:"nascita",es:"nacimiento",de:"Geburt",pt:"nascimento",nl:"geboorte"},
  "enfance":{en:"childhood",it:"infanzia",es:"infancia",de:"Kindheit",pt:"infância",nl:"kindertijd"},
  "avenir":{en:"future",it:"futuro",es:"futuro",de:"Zukunft",pt:"futuro",nl:"toekomst"},
  "passé":{en:"past",it:"passato",es:"pasado",de:"Vergangenheit",pt:"passado",nl:"verleden"},
  "souvenir":{en:"memory",it:"ricordo",es:"recuerdo",de:"Erinnerung",pt:"lembrança",nl:"herinnering"},
  "clair":{en:"light",it:"chiaro",es:"claro",de:"hell",pt:"claro",nl:"licht"},
  "foncé":{en:"dark",it:"scuro",es:"oscuro",de:"dunkel",pt:"escuro",nl:"donker"},
  "mouillé":{en:"wet",it:"bagnato",es:"mojado",de:"nass",pt:"molhado",nl:"nat"},
  "sec":{en:"dry",it:"asciutto",es:"seco",de:"trocken",pt:"seco",nl:"droog"},
  "doux":{en:"soft",it:"morbido",es:"suave",de:"weich",pt:"macio",nl:"zacht"},
  "dur":{en:"hard",it:"duro",es:"duro",de:"hart",pt:"duro",nl:"hard"},
  "profond":{en:"deep",it:"profondo",es:"profundo",de:"tief",pt:"profundo",nl:"diep"},
  "haut":{en:"high",it:"alto",es:"alto",de:"hoch",pt:"alto",nl:"hoog"},
  "bas":{en:"low",it:"basso",es:"bajo",de:"niedrig",pt:"baixo",nl:"laag"},
  "moderne":{en:"modern",it:"moderno",es:"moderno",de:"modern",pt:"moderno",nl:"modern"},
  "ancien":{en:"ancient",it:"antico",es:"antiguo",de:"alt",pt:"antigo",nl:"oud"},
  "bruyant":{en:"noisy",it:"rumoroso",es:"ruidoso",de:"laut",pt:"barulhento",nl:"lawaaierig"},
  "silencieux":{en:"quiet",it:"silenzioso",es:"silencioso",de:"leise",pt:"silencioso",nl:"stil"},
  "bruit":{en:"noise",it:"rumore",es:"ruido",de:"Lärm",pt:"barulho",nl:"lawaai"},
  "ennuyeux":{en:"boring",it:"noioso",es:"aburrido",de:"langweilig",pt:"aborrecido",nl:"saai"},
  "intéressant":{en:"interesting",it:"interessante",es:"interesante",de:"interessant",pt:"interessante",nl:"interessant"},
  "célèbre":{en:"famous",it:"famoso",es:"famoso",de:"berühmt",pt:"famoso",nl:"beroemd"},
  "lequel":{en:"which one",it:"quale",es:"cuál",de:"welcher",pt:"qual",nl:"welke"},
  "quelque part":{en:"somewhere",it:"da qualche parte",es:"en alguna parte",de:"irgendwo",pt:"algures",nl:"ergens"},
  "nulle part":{en:"nowhere",it:"da nessuna parte",es:"en ninguna parte",de:"nirgendwo",pt:"em lado nenhum",nl:"nergens"},
  "ensemble":{en:"together",it:"insieme",es:"juntos",de:"zusammen",pt:"juntos",nl:"samen"},
  "seulement":{en:"only",it:"soltanto",es:"solamente",de:"nur",pt:"apenas",nl:"alleen"},
  "d'accord":{en:"okay",it:"va bene",es:"vale",de:"in Ordnung",pt:"está bem",nl:"akkoord"},
  "vraiment":{en:"really",it:"davvero",es:"realmente",de:"wirklich",pt:"realmente",nl:"echt"},
  "déjà":{en:"already",it:"già",es:"ya",de:"schon",pt:"já",nl:"al"},
  "presque":{en:"almost",it:"quasi",es:"casi",de:"fast",pt:"quase",nl:"bijna"},
  "ensuite":{en:"then",it:"poi",es:"luego",de:"danach",pt:"depois",nl:"daarna"},
  "enfin":{en:"finally",it:"infine",es:"por fin",de:"endlich",pt:"finalmente",nl:"eindelijk"},
  "tout de suite":{en:"right away",it:"subito",es:"enseguida",de:"sofort",pt:"imediatamente",nl:"meteen"},
  "raconter":{en:"to tell",it:"raccontare",es:"contar",de:"erzählen",pt:"contar",nl:"vertellen"},
  "décrire":{en:"to describe",it:"descrivere",es:"describir",de:"beschreiben",pt:"descrever",nl:"beschrijven"},
  "répéter":{en:"to repeat",it:"ripetere",es:"repetir",de:"wiederholen",pt:"repetir",nl:"herhalen"},
  "traduire":{en:"to translate",it:"tradurre",es:"traducir",de:"übersetzen",pt:"traduzir",nl:"vertalen"},
  "signifier":{en:"to mean",it:"significare",es:"significar",de:"bedeuten",pt:"significar",nl:"betekenen"},
  "histoire":{en:"story",it:"storia",es:"historia",de:"Geschichte",pt:"história",nl:"verhaal"},
  "promettre":{en:"to promise",it:"promettere",es:"prometer",de:"versprechen",pt:"prometer",nl:"beloven"},
  "mentir":{en:"to lie",it:"mentire",es:"mentir",de:"lügen",pt:"mentir",nl:"liegen"},
  "crier":{en:"to shout",it:"gridare",es:"gritar",de:"schreien",pt:"gritar",nl:"schreeuwen"},
  "remercier":{en:"to thank",it:"ringraziare",es:"agradecer",de:"danken",pt:"agradecer",nl:"bedanken"},
  "inviter":{en:"to invite",it:"invitare",es:"invitar",de:"einladen",pt:"convidar",nl:"uitnodigen"},
  "souhaiter":{en:"to wish",it:"augurare",es:"desear",de:"wünschen",pt:"desejar",nl:"wensen"},
  "environnement":{en:"environment",it:"ambiente",es:"medio ambiente",de:"Umwelt",pt:"ambiente",nl:"milieu"},
  "pollution":{en:"pollution",it:"inquinamento",es:"contaminación",de:"Verschmutzung",pt:"poluição",nl:"vervuiling"},
  "déchets":{en:"waste",it:"rifiuti",es:"basura",de:"Müll",pt:"lixo",nl:"afval"},
  "recycler":{en:"to recycle",it:"riciclare",es:"reciclar",de:"recyceln",pt:"reciclar",nl:"recyclen"},
  "protéger":{en:"to protect",it:"proteggere",es:"proteger",de:"schützen",pt:"proteger",nl:"beschermen"},
  "énergie":{en:"energy",it:"energia",es:"energía",de:"Energie",pt:"energia",nl:"energie"},
  "planète":{en:"planet",it:"pianeta",es:"planeta",de:"Planet",pt:"planeta",nl:"planeet"},
  "climat":{en:"climate",it:"clima",es:"clima",de:"Klima",pt:"clima",nl:"klimaat"},
  "nature":{en:"nature",it:"natura",es:"naturaleza",de:"Natur",pt:"natureza",nl:"natuur"},
  "air":{en:"air",it:"aria",es:"aire",de:"Luft",pt:"ar",nl:"lucht"},
  "sauvage":{en:"wild",it:"selvaggio",es:"salvaje",de:"wild",pt:"selvagem",nl:"wild"},
  "animal":{en:"animal",it:"animale",es:"animal",de:"Tier",pt:"animal",nl:"dier"},
  "paysage":{en:"landscape",it:"paesaggio",es:"paisaje",de:"Landschaft",pt:"paisagem",nl:"landschap"},
  "lumière":{en:"light",it:"luce",es:"luz",de:"Licht",pt:"luz",nl:"licht"},
  "Noël":{en:"Christmas",it:"Natale",es:"Navidad",de:"Weihnachten",pt:"Natal",nl:"Kerstmis"},
  "Pâques":{en:"Easter",it:"Pasqua",es:"Pascua",de:"Ostern",pt:"Páscoa",nl:"Pasen"},
  "nouvel an":{en:"New Year",it:"Capodanno",es:"Año Nuevo",de:"Neujahr",pt:"Ano Novo",nl:"Nieuwjaar"},
  "week-end":{en:"weekend",it:"fine settimana",es:"fin de semana",de:"Wochenende",pt:"fim de semana",nl:"weekend"},
  "jour férié":{en:"public holiday",it:"giorno festivo",es:"día festivo",de:"Feiertag",pt:"feriado",nl:"feestdag"},
  "surprise":{en:"surprise",it:"sorpresa",es:"sorpresa",de:"Überraschung",pt:"surpresa",nl:"verrassing"},
  "ballon":{en:"balloon",it:"palloncino",es:"globo",de:"Luftballon",pt:"balão",nl:"ballon"},
  "feu d'artifice":{en:"fireworks",it:"fuochi d'artificio",es:"fuegos artificiales",de:"Feuerwerk",pt:"fogo de artifício",nl:"vuurwerk"},
  "invitation":{en:"invitation",it:"invito",es:"invitación",de:"Einladung",pt:"convite",nl:"uitnodiging"},
  "carnaval":{en:"carnival",it:"carnevale",es:"carnaval",de:"Karneval",pt:"Carnaval",nl:"carnaval"},
  "vrai":{en:"true",it:"vero",es:"verdadero",de:"wahr",pt:"verdadeiro",nl:"waar"},
  "faux":{en:"false",it:"falso",es:"falso",de:"falsch",pt:"falso",nl:"fout"},
  "possible":{en:"possible",it:"possibile",es:"posible",de:"möglich",pt:"possível",nl:"mogelijk"},
  "impossible":{en:"impossible",it:"impossibile",es:"imposible",de:"unmöglich",pt:"impossível",nl:"onmogelijk"},
  "utile":{en:"useful",it:"utile",es:"útil",de:"nützlich",pt:"útil",nl:"nuttig"},
  "prêt":{en:"ready",it:"pronto",es:"listo",de:"bereit",pt:"pronto",nl:"klaar"},
  "occupé":{en:"busy",it:"occupato",es:"ocupado",de:"beschäftigt",pt:"ocupado",nl:"bezet"},
  "libre":{en:"free",it:"libero",es:"libre",de:"frei",pt:"livre",nl:"vrij"},
  "permis":{en:"driving licence",it:"patente",es:"carné de conducir",de:"Führerschein",pt:"carta de condução",nl:"rijbewijs"},
  "essence":{en:"petrol",it:"benzina",es:"gasolina",de:"Benzin",pt:"gasolina",nl:"benzine"},
  "station-service":{en:"petrol station",it:"stazione di servizio",es:"gasolinera",de:"Tankstelle",pt:"bomba de gasolina",nl:"tankstation"},
  "se garer":{en:"to park",it:"parcheggiare",es:"aparcar",de:"parken",pt:"estacionar",nl:"parkeren"},
  "vitesse":{en:"speed",it:"velocità",es:"velocidad",de:"Geschwindigkeit",pt:"velocidade",nl:"snelheid"},
  "feu rouge":{en:"traffic light",it:"semaforo",es:"semáforo",de:"Ampel",pt:"semáforo",nl:"stoplicht"},
  "carrefour":{en:"crossroads",it:"incrocio",es:"cruce",de:"Kreuzung",pt:"cruzamento",nl:"kruispunt"},
  "autoroute":{en:"motorway",it:"autostrada",es:"autopista",de:"Autobahn",pt:"autoestrada",nl:"snelweg"},
  "circulation":{en:"traffic",it:"traffico",es:"tráfico",de:"Verkehr",pt:"trânsito",nl:"verkeer"},
  "accident":{en:"accident",it:"incidente",es:"accidente",de:"Unfall",pt:"acidente",nl:"ongeluk"},
  "je me lève à sept heures":{en:"I get up at seven",it:"mi alzo alle sette",es:"me levanto a las siete",de:"ich stehe um sieben auf",pt:"levanto-me às sete",nl:"ik sta om zeven uur op"},
  "joyeux anniversaire":{en:"happy birthday",it:"buon compleanno",es:"feliz cumpleaños",de:"alles Gute zum Geburtstag",pt:"feliz aniversário",nl:"gefeliciteerd met je verjaardag"},
  "la vie est belle":{en:"life is beautiful",it:"la vita è bella",es:"la vida es bella",de:"das Leben ist schön",pt:"a vida é bela",nl:"het leven is mooi"},
  "je suis prêt":{en:"I am ready",it:"sono pronto",es:"estoy listo",de:"ich bin bereit",pt:"estou pronto",nl:"ik ben klaar"},
  "il y a trop de circulation":{en:"there is too much traffic",it:"c'è troppo traffico",es:"hay demasiado tráfico",de:"es gibt zu viel Verkehr",pt:"há muito trânsito",nl:"er is te veel verkeer"}
};
CURRICULUM_V.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV4).forEach(function(k){ if(NEWV4[k][l]) LEX[l][k]=NEWV4[k][l]; }); });

/* --- EXTENSION v2.59 (vague 4, cap B1) : 12 unités — émotions fines, météo fine, cuisine du chef,
   logement, corps en action, magasin, études, temps précis, entraide, actualité, avis, monde.
   Parité garantie (NEWV5). Portugais EUROPÉEN toujours : stressado, húmido, tabuleiro, montra,
   secção, apanhar, partilhar, confio em ti — jamais la variante brésilienne. --- */
var CURRICULUM_U = [
  { t:"Émotions fines 💫", c:"#e879a9", L:[
    { t:"Ce que je ressens", w:["nerveux","déçu","jaloux","stressé"], p:[] },
    { t:"Bien dans sa peau", w:["détendu","ému","satisfait","reconnaissant"], p:[] } ]},
  { t:"Météo fine 🌦", c:"#60a5fa", L:[
    { t:"Le ciel gronde", w:["brouillard","éclair","tonnerre","arc-en-ciel","tempête"], p:["quel temps fait-il"] },
    { t:"Le thermomètre", w:["gel","degré","prévisions","humide","sécheresse"], p:[] } ]},
  { t:"Cuisine du chef 👨‍🍳", c:"#f59e0b", L:[
    { t:"Aux fourneaux", w:["bouillir","frire","griller","mélanger","couper","verser"], p:[] },
    { t:"Les ustensiles", w:["casserole","poêle","plateau","nappe","micro-ondes"], p:[] } ]},
  { t:"Le logement 🏘", c:"#a78bfa", L:[
    { t:"Mon immeuble", w:["appartement","immeuble","rez-de-chaussée","balcon","terrasse","cheminée"], p:[] },
    { t:"Meubler la maison", w:["meuble","canapé","armoire","tiroir","rideau","tapis"], p:[] },
    { t:"On déménage", w:["déménager"], p:["nous déménageons demain"] } ]},
  { t:"Le corps en action 💪", c:"#34d399", L:[
    { t:"Pousser et tirer", w:["pousser","tirer","lancer","attraper","tenir"], p:[] },
    { t:"Tout en muscles", w:["soulever","plier","frapper","glisser","grimper"], p:[] } ]},
  { t:"Au magasin 🛍", c:"#fb7185", L:[
    { t:"Dans les rayons", w:["rayon","vitrine","marque","qualité","choix"], p:[] },
    { t:"Bonnes affaires", w:["rembourser","échanger","promotion","comparer","choisir"], p:[] } ]},
  { t:"Les études 📖", c:"#38bdf8", L:[
    { t:"À la fac", w:["université","étudiant","cours","diplôme","échouer","étudier"], p:["j'étudie à l'université"] },
    { t:"Les matières", w:["matière","mathématiques","sciences","géographie","connaissance"], p:[] } ]},
  { t:"Le temps précis ⌚", c:"#fbbf24", L:[
    { t:"À la seconde", w:["seconde","instant","siècle","époque","midi","minuit"], p:[] },
    { t:"L'agenda", w:["date","calendrier","horaire","durée","pendant","depuis"], p:[] } ]},
  { t:"S'entraider 🤝", c:"#4ade80", L:[
    { t:"Compter l'un sur l'autre", w:["conseil","aide","service","soutien","confiance","respect"], p:["je te fais confiance"] },
    { t:"Gestes d'amitié", w:["amitié","partager","offrir","accueillir","défendre","visiter"], p:[] } ]},
  { t:"L'actualité 📰", c:"#94a3b8", L:[
    { t:"Les médias", w:["journaliste","article","radio","télévision","chaîne","publicité"], p:[] },
    { t:"La vie publique", w:["gouvernement","loi","élection","président"], p:[] },
    { t:"L'ordre et la liberté", w:["police","sécurité","liberté"], p:[] } ]},
  { t:"Exprimer son avis 🗣", c:"#f472b6", L:[
    { t:"Je pense que", w:["avis","préférer","décider","changer","douter","se tromper"], p:["à mon avis, c'est vrai"] },
    { t:"Convaincre", w:["convaincre","exemple","discussion","promesse","mensonge","secret"], p:[] } ]},
  { t:"Autour du monde 🧳", c:"#22d3ee", L:[
    { t:"Partir loin", w:["à l'étranger","culture","tradition","religion","touriste","guide"], p:[] },
    { t:"Merveilles à voir", w:["monument","château","tour","désert","aventure","carte postale"], p:[] } ]}
];
var NEWV5 = {
  "nerveux":{en:"nervous",it:"nervoso",es:"nervioso",de:"nervös",pt:"nervoso",nl:"zenuwachtig"},
  "déçu":{en:"disappointed",it:"deluso",es:"decepcionado",de:"enttäuscht",pt:"desiludido",nl:"teleurgesteld"},
  "jaloux":{en:"jealous",it:"geloso",es:"celoso",de:"eifersüchtig",pt:"ciumento",nl:"jaloers"},
  "stressé":{en:"stressed",it:"stressato",es:"estresado",de:"gestresst",pt:"stressado",nl:"gestrest"},
  "détendu":{en:"relaxed",it:"rilassato",es:"relajado",de:"entspannt",pt:"descontraído",nl:"ontspannen"},
  "ému":{en:"moved",it:"commosso",es:"emocionado",de:"gerührt",pt:"comovido",nl:"ontroerd"},
  "satisfait":{en:"satisfied",it:"soddisfatto",es:"satisfecho",de:"zufrieden",pt:"satisfeito",nl:"tevreden"},
  "reconnaissant":{en:"grateful",it:"grato",es:"agradecido",de:"dankbar",pt:"grato",nl:"dankbaar"},
  "brouillard":{en:"fog",it:"nebbia",es:"niebla",de:"Nebel",pt:"nevoeiro",nl:"mist"},
  "éclair":{en:"lightning",it:"fulmine",es:"relámpago",de:"Blitz",pt:"relâmpago",nl:"bliksem"},
  "tonnerre":{en:"thunder",it:"tuono",es:"trueno",de:"Donner",pt:"trovão",nl:"donder"},
  "arc-en-ciel":{en:"rainbow",it:"arcobaleno",es:"arcoíris",de:"Regenbogen",pt:"arco-íris",nl:"regenboog"},
  "tempête":{en:"storm",it:"tempesta",es:"tormenta",de:"Sturm",pt:"tempestade",nl:"storm"},
  "gel":{en:"frost",it:"gelo",es:"helada",de:"Frost",pt:"geada",nl:"vorst"},
  "degré":{en:"degree",it:"grado",es:"grado",de:"Grad",pt:"grau",nl:"graad"},
  "prévisions":{en:"forecast",it:"previsioni",es:"pronóstico",de:"Wettervorhersage",pt:"previsões",nl:"weersvoorspelling"},
  "humide":{en:"humid",it:"umido",es:"húmedo",de:"feucht",pt:"húmido",nl:"vochtig"},
  "sécheresse":{en:"drought",it:"siccità",es:"sequía",de:"Dürre",pt:"seca",nl:"droogte"},
  "bouillir":{en:"to boil",it:"bollire",es:"hervir",de:"kochen",pt:"ferver",nl:"koken"},
  "frire":{en:"to fry",it:"friggere",es:"freír",de:"braten",pt:"fritar",nl:"bakken"},
  "griller":{en:"to grill",it:"grigliare",es:"asar a la parrilla",de:"grillen",pt:"grelhar",nl:"grillen"},
  "mélanger":{en:"to mix",it:"mescolare",es:"mezclar",de:"mischen",pt:"misturar",nl:"mengen"},
  "couper":{en:"to cut",it:"tagliare",es:"cortar",de:"schneiden",pt:"cortar",nl:"snijden"},
  "verser":{en:"to pour",it:"versare",es:"verter",de:"gießen",pt:"verter",nl:"gieten"},
  "casserole":{en:"saucepan",it:"pentola",es:"cacerola",de:"Kochtopf",pt:"panela",nl:"pan"},
  "poêle":{en:"frying pan",it:"padella",es:"sartén",de:"Pfanne",pt:"frigideira",nl:"koekenpan"},
  "plateau":{en:"tray",it:"vassoio",es:"bandeja",de:"Tablett",pt:"tabuleiro",nl:"dienblad"},
  "nappe":{en:"tablecloth",it:"tovaglia",es:"mantel",de:"Tischdecke",pt:"toalha de mesa",nl:"tafelkleed"},
  "micro-ondes":{en:"microwave",it:"microonde",es:"microondas",de:"Mikrowelle",pt:"micro-ondas",nl:"magnetron"},
  "appartement":{en:"flat",it:"appartamento",es:"piso",de:"Wohnung",pt:"apartamento",nl:"appartement"},
  "immeuble":{en:"building",it:"palazzo",es:"edificio",de:"Gebäude",pt:"prédio",nl:"gebouw"},
  "rez-de-chaussée":{en:"ground floor",it:"pianterreno",es:"planta baja",de:"Erdgeschoss",pt:"rés-do-chão",nl:"begane grond"},
  "balcon":{en:"balcony",it:"balcone",es:"balcón",de:"Balkon",pt:"varanda",nl:"balkon"},
  "terrasse":{en:"terrace",it:"terrazza",es:"terraza",de:"Terrasse",pt:"terraço",nl:"terras"},
  "cheminée":{en:"fireplace",it:"camino",es:"chimenea",de:"Kamin",pt:"lareira",nl:"open haard"},
  "meuble":{en:"piece of furniture",it:"mobile",es:"mueble",de:"Möbelstück",pt:"móvel",nl:"meubel"},
  "canapé":{en:"sofa",it:"divano",es:"sofá",de:"Sofa",pt:"sofá",nl:"bank"},
  "armoire":{en:"wardrobe",it:"armadio",es:"armario",de:"Schrank",pt:"armário",nl:"kast"},
  "tiroir":{en:"drawer",it:"cassetto",es:"cajón",de:"Schublade",pt:"gaveta",nl:"lade"},
  "rideau":{en:"curtain",it:"tenda",es:"cortina",de:"Vorhang",pt:"cortina",nl:"gordijn"},
  "tapis":{en:"carpet",it:"tappeto",es:"alfombra",de:"Teppich",pt:"tapete",nl:"tapijt"},
  "déménager":{en:"to move house",it:"traslocare",es:"mudarse",de:"umziehen",pt:"mudar de casa",nl:"verhuizen"},
  "pousser":{en:"to push",it:"spingere",es:"empujar",de:"schieben",pt:"empurrar",nl:"duwen"},
  "tirer":{en:"to pull",it:"tirare",es:"tirar",de:"ziehen",pt:"puxar",nl:"trekken"},
  "lancer":{en:"to throw",it:"lanciare",es:"lanzar",de:"werfen",pt:"lançar",nl:"gooien"},
  "attraper":{en:"to catch",it:"afferrare",es:"atrapar",de:"fangen",pt:"apanhar",nl:"vangen"},
  "tenir":{en:"to hold",it:"tenere",es:"sostener",de:"halten",pt:"segurar",nl:"vasthouden"},
  "soulever":{en:"to lift",it:"sollevare",es:"levantar",de:"heben",pt:"levantar",nl:"optillen"},
  "plier":{en:"to fold",it:"piegare",es:"doblar",de:"falten",pt:"dobrar",nl:"vouwen"},
  "frapper":{en:"to hit",it:"colpire",es:"golpear",de:"schlagen",pt:"bater",nl:"slaan"},
  "glisser":{en:"to slip",it:"scivolare",es:"resbalar",de:"rutschen",pt:"escorregar",nl:"glijden"},
  "grimper":{en:"to climb",it:"arrampicarsi",es:"trepar",de:"klettern",pt:"trepar",nl:"klimmen"},
  "rayon":{en:"department",it:"reparto",es:"sección",de:"Abteilung",pt:"secção",nl:"afdeling"},
  "vitrine":{en:"shop window",it:"vetrina",es:"escaparate",de:"Schaufenster",pt:"montra",nl:"etalage"},
  "marque":{en:"brand",it:"marca",es:"marca",de:"Marke",pt:"marca",nl:"merk"},
  "qualité":{en:"quality",it:"qualità",es:"calidad",de:"Qualität",pt:"qualidade",nl:"kwaliteit"},
  "choix":{en:"choice",it:"scelta",es:"elección",de:"Auswahl",pt:"escolha",nl:"keuze"},
  "rembourser":{en:"to refund",it:"rimborsare",es:"reembolsar",de:"erstatten",pt:"reembolsar",nl:"terugbetalen"},
  "échanger":{en:"to exchange",it:"cambiare",es:"cambiar",de:"umtauschen",pt:"trocar",nl:"ruilen"},
  "promotion":{en:"special offer",it:"promozione",es:"oferta",de:"Sonderangebot",pt:"promoção",nl:"aanbieding"},
  "comparer":{en:"to compare",it:"confrontare",es:"comparar",de:"vergleichen",pt:"comparar",nl:"vergelijken"},
  "choisir":{en:"to choose",it:"scegliere",es:"elegir",de:"wählen",pt:"escolher",nl:"kiezen"},
  "université":{en:"university",it:"università",es:"universidad",de:"Universität",pt:"universidade",nl:"universiteit"},
  "étudiant":{en:"student",it:"studente",es:"estudiante",de:"Student",pt:"estudante",nl:"student"},
  "cours":{en:"class",it:"lezione",es:"clase",de:"Unterricht",pt:"aula",nl:"les"},
  "diplôme":{en:"degree",it:"diploma",es:"diploma",de:"Abschluss",pt:"diploma",nl:"diploma"},
  "échouer":{en:"to fail",it:"fallire",es:"fracasar",de:"scheitern",pt:"falhar",nl:"falen"},
  "étudier":{en:"to study",it:"studiare",es:"estudiar",de:"studieren",pt:"estudar",nl:"studeren"},
  "matière":{en:"subject",it:"materia",es:"asignatura",de:"Fach",pt:"disciplina",nl:"vak"},
  "mathématiques":{en:"mathematics",it:"matematica",es:"matemáticas",de:"Mathematik",pt:"matemática",nl:"wiskunde"},
  "sciences":{en:"science",it:"scienze",es:"ciencias",de:"Wissenschaften",pt:"ciências",nl:"wetenschappen"},
  "géographie":{en:"geography",it:"geografia",es:"geografía",de:"Geographie",pt:"geografia",nl:"aardrijkskunde"},
  "connaissance":{en:"knowledge",it:"conoscenza",es:"conocimiento",de:"Wissen",pt:"conhecimento",nl:"kennis"},
  "seconde":{en:"second",it:"secondo",es:"segundo",de:"Sekunde",pt:"segundo",nl:"seconde"},
  "instant":{en:"moment",it:"istante",es:"instante",de:"Augenblick",pt:"instante",nl:"ogenblik"},
  "siècle":{en:"century",it:"secolo",es:"siglo",de:"Jahrhundert",pt:"século",nl:"eeuw"},
  "époque":{en:"era",it:"epoca",es:"época",de:"Epoche",pt:"época",nl:"tijdperk"},
  "midi":{en:"noon",it:"mezzogiorno",es:"mediodía",de:"Mittag",pt:"meio-dia",nl:"middaguur"},
  "minuit":{en:"midnight",it:"mezzanotte",es:"medianoche",de:"Mitternacht",pt:"meia-noite",nl:"middernacht"},
  "date":{en:"date",it:"data",es:"fecha",de:"Datum",pt:"data",nl:"datum"},
  "calendrier":{en:"calendar",it:"calendario",es:"calendario",de:"Kalender",pt:"calendário",nl:"kalender"},
  "horaire":{en:"timetable",it:"orario",es:"horario",de:"Zeitplan",pt:"horário",nl:"rooster"},
  "durée":{en:"duration",it:"durata",es:"duración",de:"Dauer",pt:"duração",nl:"duur"},
  "pendant":{en:"during",it:"durante",es:"durante",de:"während",pt:"durante",nl:"tijdens"},
  "depuis":{en:"since",it:"da",es:"desde",de:"seit",pt:"desde",nl:"sinds"},
  "conseil":{en:"advice",it:"consiglio",es:"consejo",de:"Rat",pt:"conselho",nl:"advies"},
  "aide":{en:"help",it:"aiuto",es:"ayuda",de:"Hilfe",pt:"ajuda",nl:"hulp"},
  "service":{en:"service",it:"servizio",es:"servicio",de:"Dienst",pt:"serviço",nl:"dienst"},
  "soutien":{en:"support",it:"sostegno",es:"apoyo",de:"Unterstützung",pt:"apoio",nl:"steun"},
  "confiance":{en:"trust",it:"fiducia",es:"confianza",de:"Vertrauen",pt:"confiança",nl:"vertrouwen"},
  "respect":{en:"respect",it:"rispetto",es:"respeto",de:"Respekt",pt:"respeito",nl:"respect"},
  "amitié":{en:"friendship",it:"amicizia",es:"amistad",de:"Freundschaft",pt:"amizade",nl:"vriendschap"},
  "partager":{en:"to share",it:"condividere",es:"compartir",de:"teilen",pt:"partilhar",nl:"delen"},
  "offrir":{en:"to offer",it:"offrire",es:"ofrecer",de:"anbieten",pt:"oferecer",nl:"aanbieden"},
  "accueillir":{en:"to welcome",it:"accogliere",es:"acoger",de:"empfangen",pt:"acolher",nl:"verwelkomen"},
  "défendre":{en:"to defend",it:"difendere",es:"defender",de:"verteidigen",pt:"defender",nl:"verdedigen"},
  "visiter":{en:"to visit",it:"visitare",es:"visitar",de:"besuchen",pt:"visitar",nl:"bezoeken"},
  "journaliste":{en:"journalist",it:"giornalista",es:"periodista",de:"Journalist",pt:"jornalista",nl:"journalist"},
  "article":{en:"article",it:"articolo",es:"artículo",de:"Artikel",pt:"artigo",nl:"artikel"},
  "radio":{en:"radio",it:"radio",es:"radio",de:"Radio",pt:"rádio",nl:"radio"},
  "télévision":{en:"television",it:"televisione",es:"televisión",de:"Fernsehen",pt:"televisão",nl:"televisie"},
  "chaîne":{en:"channel",it:"canale",es:"canal",de:"Sender",pt:"canal",nl:"zender"},
  "publicité":{en:"advertising",it:"pubblicità",es:"publicidad",de:"Werbung",pt:"publicidade",nl:"reclame"},
  "gouvernement":{en:"government",it:"governo",es:"gobierno",de:"Regierung",pt:"governo",nl:"regering"},
  "loi":{en:"law",it:"legge",es:"ley",de:"Gesetz",pt:"lei",nl:"wet"},
  "élection":{en:"election",it:"elezione",es:"elección",de:"Wahl",pt:"eleição",nl:"verkiezing"},
  "président":{en:"president",it:"presidente",es:"presidente",de:"Präsident",pt:"presidente",nl:"president"},
  "police":{en:"police",it:"polizia",es:"policía",de:"Polizei",pt:"polícia",nl:"politie"},
  "sécurité":{en:"security",it:"sicurezza",es:"seguridad",de:"Sicherheit",pt:"segurança",nl:"veiligheid"},
  "liberté":{en:"freedom",it:"libertà",es:"libertad",de:"Freiheit",pt:"liberdade",nl:"vrijheid"},
  "avis":{en:"opinion",it:"opinione",es:"opinión",de:"Meinung",pt:"opinião",nl:"mening"},
  "préférer":{en:"to prefer",it:"preferire",es:"preferir",de:"bevorzugen",pt:"preferir",nl:"prefereren"},
  "décider":{en:"to decide",it:"decidere",es:"decidir",de:"entscheiden",pt:"decidir",nl:"beslissen"},
  "changer":{en:"to change",it:"cambiare",es:"cambiar",de:"ändern",pt:"mudar",nl:"veranderen"},
  "douter":{en:"to doubt",it:"dubitare",es:"dudar",de:"zweifeln",pt:"duvidar",nl:"twijfelen"},
  "se tromper":{en:"to be wrong",it:"sbagliarsi",es:"equivocarse",de:"sich irren",pt:"enganar-se",nl:"zich vergissen"},
  "convaincre":{en:"to convince",it:"convincere",es:"convencer",de:"überzeugen",pt:"convencer",nl:"overtuigen"},
  "exemple":{en:"example",it:"esempio",es:"ejemplo",de:"Beispiel",pt:"exemplo",nl:"voorbeeld"},
  "discussion":{en:"discussion",it:"discussione",es:"discusión",de:"Diskussion",pt:"discussão",nl:"discussie"},
  "promesse":{en:"promise",it:"promessa",es:"promesa",de:"Versprechen",pt:"promessa",nl:"belofte"},
  "mensonge":{en:"lie",it:"bugia",es:"mentira",de:"Lüge",pt:"mentira",nl:"leugen"},
  "secret":{en:"secret",it:"segreto",es:"secreto",de:"Geheimnis",pt:"segredo",nl:"geheim"},
  "à l'étranger":{en:"abroad",it:"all'estero",es:"en el extranjero",de:"im Ausland",pt:"no estrangeiro",nl:"in het buitenland"},
  "culture":{en:"culture",it:"cultura",es:"cultura",de:"Kultur",pt:"cultura",nl:"cultuur"},
  "tradition":{en:"tradition",it:"tradizione",es:"tradición",de:"Tradition",pt:"tradição",nl:"traditie"},
  "religion":{en:"religion",it:"religione",es:"religión",de:"Religion",pt:"religião",nl:"religie"},
  "touriste":{en:"tourist",it:"turista",es:"turista",de:"Tourist",pt:"turista",nl:"toerist"},
  "guide":{en:"guide",it:"guida",es:"guía",de:"Reiseleiter",pt:"guia",nl:"gids"},
  "monument":{en:"monument",it:"monumento",es:"monumento",de:"Denkmal",pt:"monumento",nl:"monument"},
  "château":{en:"castle",it:"castello",es:"castillo",de:"Schloss",pt:"castelo",nl:"kasteel"},
  "tour":{en:"tower",it:"torre",es:"torre",de:"Turm",pt:"torre",nl:"toren"},
  "désert":{en:"desert",it:"deserto",es:"desierto",de:"Wüste",pt:"deserto",nl:"woestijn"},
  "aventure":{en:"adventure",it:"avventura",es:"aventura",de:"Abenteuer",pt:"aventura",nl:"avontuur"},
  "carte postale":{en:"postcard",it:"cartolina",es:"postal",de:"Postkarte",pt:"postal",nl:"ansichtkaart"},
  "à mon avis, c'est vrai":{en:"in my opinion, it's true",it:"secondo me è vero",es:"en mi opinión, es verdad",de:"meiner Meinung nach ist das wahr",pt:"na minha opinião, é verdade",nl:"volgens mij is het waar"},
  "je te fais confiance":{en:"I trust you",it:"mi fido di te",es:"confío en ti",de:"ich vertraue dir",pt:"confio em ti",nl:"ik vertrouw je"},
  "quel temps fait-il":{en:"what's the weather like",it:"che tempo fa",es:"qué tiempo hace",de:"wie ist das Wetter",pt:"como está o tempo",nl:"wat voor weer is het"},
  "nous déménageons demain":{en:"we are moving tomorrow",it:"traslochiamo domani",es:"nos mudamos mañana",de:"wir ziehen morgen um",pt:"mudamos de casa amanhã",nl:"we verhuizen morgen"},
  "j'étudie à l'université":{en:"I study at university",it:"studio all'università",es:"estudio en la universidad",de:"ich studiere an der Universität",pt:"estudo na universidade",nl:"ik studeer aan de universiteit"}
};
CURRICULUM_U.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV5).forEach(function(k){ if(NEWV5[k][l]) LEX[l][k]=NEWV5[k][l]; }); });

/* --- EXTENSION v2.61 (vague 5, cap B1) : 12 unités — docteur, carrière, nature, caractères,
   bricolage, urgences, restaurant, sorties, mots de liaison, pensée, argent, matières.
   Parité garantie (NEWV6). Portugais EUROPÉEN toujours : penso, reforma, trilho, chave de fendas,
   mal passado, exceto, espetáculo, lembro-me de ti — jamais la variante brésilienne. --- */
var CURRICULUM_T = [
  { t:"Chez le docteur 🩹", c:"#f87171", L:[
    { t:"En consultation", w:["ordonnance","vaccin","pansement","opération","piqûre","salle d'attente"], p:["j'ai besoin d'un médecin"] },
    { t:"Petits bobos", w:["éternuer","saigner","vertige","cicatrice","plâtre","béquilles"], p:[] } ]},
  { t:"La carrière 💼", c:"#818cf8", L:[
    { t:"Trouver sa place", w:["embaucher","candidature","expérience","compétence","formation","stage"], p:["je cherche du travail"] },
    { t:"Les tournants", w:["démissionner","licencier","retraite","chômage","augmentation","réussite"], p:[] } ]},
  { t:"Pleine nature 🏞", c:"#4ade80", L:[
    { t:"Relief sauvage", w:["vallée","falaise","cascade","rocher","sommet"], p:[] },
    { t:"Au bord de l'eau", w:["ruisseau","grotte","boue","sentier"], p:[] },
    { t:"Petites vies", w:["insecte","grenouille","branche","écorce","mousse"], p:[] } ]},
  { t:"Les caractères 🎭", c:"#fbbf24", L:[
    { t:"Qualités", w:["généreux","sage","modeste","sensible","aimable"], p:[] },
    { t:"Petits défauts", w:["égoïste","têtu","bavard","maladroit","franc"], p:[] } ]},
  { t:"Le bricolage 🔨", c:"#fb923c", L:[
    { t:"La boîte à outils", w:["marteau","clou","vis","tournevis","outil","pelle"], p:[] },
    { t:"Au travail", w:["réparer","percer","coller","mesurer","échelle"], p:[] },
    { t:"Le matériel", w:["pinceau","scie","tuyau","corde","fil"], p:[] } ]},
  { t:"Les urgences 🚨", c:"#ef4444", L:[
    { t:"Alerte !", w:["incendie","ambulance","secours","danger","alarme"], p:["il y a le feu"] },
    { t:"Rester prudent", w:["voleur","témoin","prudent","avertir","fuite"], p:[] } ]},
  { t:"Bien manger dehors 🍽", c:"#f59e0b", L:[
    { t:"À table !", w:["réservation","pourboire","commander","végétarien","saignant","bien cuit"], p:["l'addition, s'il vous plaît"] } ]},
  { t:"Sortir le soir 🎪", c:"#c084fc", L:[
    { t:"En scène", w:["concert","spectacle","chanteur","acteur","scène","applaudir"], p:["le spectacle commence à huit heures"] },
    { t:"L'affiche du soir", w:["exposition","ambiance","cirque","affiche","entracte"], p:[] } ]},
  { t:"Les mots de liaison 🔗", c:"#94a3b8", L:[
    { t:"Nuancer", w:["cependant","pourtant","malgré","sauf","environ","plutôt"], p:[] },
    { t:"Relier ses idées", w:["sans doute","d'ailleurs","en fait","au lieu de","grâce à","à cause de"], p:[] } ]},
  { t:"La pensée 🧠", c:"#38bdf8", L:[
    { t:"Se souvenir", w:["se souvenir","mémoire","reconnaître","regretter","deviner"], p:["je me souviens de toi"] },
    { t:"Imaginer demain", w:["imaginer","réfléchir","supposer","hésiter","prévoir"], p:[] } ]},
  { t:"Question d'argent 💶", c:"#34d399", L:[
    { t:"Prêter et rendre", w:["emprunter","prêter","dette","récompense"], p:["ça vaut la peine"] } ]},
  { t:"Les matières 🧵", c:"#a78bfa", L:[
    { t:"Dur comme le métal", w:["métal","plastique","bois","or","carton"], p:[] },
    { t:"Doux comme la soie", w:["coton","laine","cuir","soie","tissu"], p:[] } ]}
];
var NEWV6 = {
  "ordonnance":{en:"prescription",it:"ricetta",es:"receta",de:"Rezept",pt:"receita",nl:"recept"},
  "vaccin":{en:"vaccine",it:"vaccino",es:"vacuna",de:"Impfstoff",pt:"vacina",nl:"vaccin"},
  "pansement":{en:"plaster",it:"cerotto",es:"tirita",de:"Pflaster",pt:"penso",nl:"pleister"},
  "opération":{en:"operation",it:"operazione",es:"operación",de:"Operation",pt:"operação",nl:"operatie"},
  "piqûre":{en:"injection",it:"puntura",es:"inyección",de:"Spritze",pt:"injeção",nl:"prik"},
  "salle d'attente":{en:"waiting room",it:"sala d'attesa",es:"sala de espera",de:"Wartezimmer",pt:"sala de espera",nl:"wachtkamer"},
  "éternuer":{en:"to sneeze",it:"starnutire",es:"estornudar",de:"niesen",pt:"espirrar",nl:"niezen"},
  "saigner":{en:"to bleed",it:"sanguinare",es:"sangrar",de:"bluten",pt:"sangrar",nl:"bloeden"},
  "vertige":{en:"dizziness",it:"vertigini",es:"mareo",de:"Schwindel",pt:"tonturas",nl:"duizeligheid"},
  "cicatrice":{en:"scar",it:"cicatrice",es:"cicatriz",de:"Narbe",pt:"cicatriz",nl:"litteken"},
  "plâtre":{en:"cast",it:"gesso",es:"escayola",de:"Gips",pt:"gesso",nl:"gips"},
  "béquilles":{en:"crutches",it:"stampelle",es:"muletas",de:"Krücken",pt:"muletas",nl:"krukken"},
  "embaucher":{en:"to hire",it:"assumere",es:"contratar",de:"einstellen",pt:"contratar",nl:"aannemen"},
  "candidature":{en:"application",it:"candidatura",es:"candidatura",de:"Bewerbung",pt:"candidatura",nl:"sollicitatie"},
  "expérience":{en:"experience",it:"esperienza",es:"experiencia",de:"Erfahrung",pt:"experiência",nl:"ervaring"},
  "compétence":{en:"skill",it:"competenza",es:"competencia",de:"Kompetenz",pt:"competência",nl:"vaardigheid"},
  "formation":{en:"training",it:"formazione",es:"formación",de:"Ausbildung",pt:"formação",nl:"opleiding"},
  "stage":{en:"internship",it:"tirocinio",es:"prácticas",de:"Praktikum",pt:"estágio",nl:"stage"},
  "démissionner":{en:"to resign",it:"dimettersi",es:"dimitir",de:"kündigen",pt:"demitir-se",nl:"ontslag nemen"},
  "licencier":{en:"to dismiss",it:"licenziare",es:"despedir",de:"entlassen",pt:"despedir",nl:"ontslaan"},
  "retraite":{en:"retirement",it:"pensione",es:"jubilación",de:"Rente",pt:"reforma",nl:"pensioen"},
  "chômage":{en:"unemployment",it:"disoccupazione",es:"desempleo",de:"Arbeitslosigkeit",pt:"desemprego",nl:"werkloosheid"},
  "augmentation":{en:"pay rise",it:"aumento",es:"aumento",de:"Gehaltserhöhung",pt:"aumento",nl:"opslag"},
  "réussite":{en:"success",it:"successo",es:"éxito",de:"Erfolg",pt:"sucesso",nl:"succes"},
  "vallée":{en:"valley",it:"valle",es:"valle",de:"Tal",pt:"vale",nl:"vallei"},
  "falaise":{en:"cliff",it:"scogliera",es:"acantilado",de:"Klippe",pt:"falésia",nl:"klif"},
  "cascade":{en:"waterfall",it:"cascata",es:"cascada",de:"Wasserfall",pt:"cascata",nl:"waterval"},
  "rocher":{en:"rock",it:"roccia",es:"roca",de:"Felsen",pt:"rocha",nl:"rots"},
  "sommet":{en:"summit",it:"cima",es:"cumbre",de:"Gipfel",pt:"cume",nl:"top"},
  "ruisseau":{en:"stream",it:"ruscello",es:"arroyo",de:"Bach",pt:"ribeiro",nl:"beek"},
  "grotte":{en:"cave",it:"grotta",es:"cueva",de:"Höhle",pt:"gruta",nl:"grot"},
  "boue":{en:"mud",it:"fango",es:"barro",de:"Schlamm",pt:"lama",nl:"modder"},
  "sentier":{en:"path",it:"sentiero",es:"sendero",de:"Pfad",pt:"trilho",nl:"pad"},
  "insecte":{en:"insect",it:"insetto",es:"insecto",de:"Insekt",pt:"inseto",nl:"insect"},
  "grenouille":{en:"frog",it:"rana",es:"rana",de:"Frosch",pt:"rã",nl:"kikker"},
  "branche":{en:"branch",it:"ramo",es:"rama",de:"Ast",pt:"ramo",nl:"tak"},
  "écorce":{en:"bark",it:"corteccia",es:"corteza",de:"Rinde",pt:"casca",nl:"schors"},
  "mousse":{en:"moss",it:"muschio",es:"musgo",de:"Moos",pt:"musgo",nl:"mos"},
  "généreux":{en:"generous",it:"generoso",es:"generoso",de:"großzügig",pt:"generoso",nl:"vrijgevig"},
  "sage":{en:"wise",it:"saggio",es:"sabio",de:"weise",pt:"sábio",nl:"wijs"},
  "modeste":{en:"modest",it:"modesto",es:"modesto",de:"bescheiden",pt:"modesto",nl:"bescheiden"},
  "sensible":{en:"sensitive",it:"sensibile",es:"sensible",de:"sensibel",pt:"sensível",nl:"gevoelig"},
  "aimable":{en:"kind",it:"gentile",es:"amable",de:"freundlich",pt:"amável",nl:"vriendelijk"},
  "égoïste":{en:"selfish",it:"egoista",es:"egoísta",de:"egoistisch",pt:"egoísta",nl:"egoïstisch"},
  "têtu":{en:"stubborn",it:"testardo",es:"terco",de:"stur",pt:"teimoso",nl:"koppig"},
  "bavard":{en:"talkative",it:"chiacchierone",es:"hablador",de:"gesprächig",pt:"falador",nl:"spraakzaam"},
  "maladroit":{en:"clumsy",it:"maldestro",es:"torpe",de:"ungeschickt",pt:"desajeitado",nl:"onhandig"},
  "franc":{en:"frank",it:"franco",es:"franco",de:"offen",pt:"franco",nl:"openhartig"},
  "marteau":{en:"hammer",it:"martello",es:"martillo",de:"Hammer",pt:"martelo",nl:"hamer"},
  "clou":{en:"nail",it:"chiodo",es:"clavo",de:"Nagel",pt:"prego",nl:"spijker"},
  "vis":{en:"screw",it:"vite",es:"tornillo",de:"Schraube",pt:"parafuso",nl:"schroef"},
  "tournevis":{en:"screwdriver",it:"cacciavite",es:"destornillador",de:"Schraubenzieher",pt:"chave de fendas",nl:"schroevendraaier"},
  "outil":{en:"tool",it:"attrezzo",es:"herramienta",de:"Werkzeug",pt:"ferramenta",nl:"gereedschap"},
  "pelle":{en:"shovel",it:"pala",es:"pala",de:"Schaufel",pt:"pá",nl:"schep"},
  "réparer":{en:"to repair",it:"riparare",es:"reparar",de:"reparieren",pt:"reparar",nl:"repareren"},
  "percer":{en:"to drill",it:"forare",es:"taladrar",de:"bohren",pt:"furar",nl:"boren"},
  "coller":{en:"to glue",it:"incollare",es:"pegar",de:"kleben",pt:"colar",nl:"lijmen"},
  "mesurer":{en:"to measure",it:"misurare",es:"medir",de:"messen",pt:"medir",nl:"meten"},
  "échelle":{en:"ladder",it:"scala",es:"escalera",de:"Leiter",pt:"escada de mão",nl:"ladder"},
  "pinceau":{en:"paintbrush",it:"pennello",es:"pincel",de:"Pinsel",pt:"pincel",nl:"kwast"},
  "scie":{en:"saw",it:"sega",es:"sierra",de:"Säge",pt:"serra",nl:"zaag"},
  "tuyau":{en:"pipe",it:"tubo",es:"tubería",de:"Rohr",pt:"cano",nl:"buis"},
  "corde":{en:"rope",it:"corda",es:"cuerda",de:"Seil",pt:"corda",nl:"touw"},
  "fil":{en:"thread",it:"filo",es:"hilo",de:"Faden",pt:"fio",nl:"draad"},
  "incendie":{en:"fire",it:"incendio",es:"incendio",de:"Brand",pt:"incêndio",nl:"brand"},
  "ambulance":{en:"ambulance",it:"ambulanza",es:"ambulancia",de:"Krankenwagen",pt:"ambulância",nl:"ambulance"},
  "secours":{en:"rescue",it:"soccorso",es:"socorro",de:"Rettung",pt:"socorro",nl:"redding"},
  "danger":{en:"danger",it:"pericolo",es:"peligro",de:"Gefahr",pt:"perigo",nl:"gevaar"},
  "alarme":{en:"alarm",it:"allarme",es:"alarma",de:"Alarm",pt:"alarme",nl:"alarm"},
  "voleur":{en:"thief",it:"ladro",es:"ladrón",de:"Dieb",pt:"ladrão",nl:"dief"},
  "témoin":{en:"witness",it:"testimone",es:"testigo",de:"Zeuge",pt:"testemunha",nl:"getuige"},
  "prudent":{en:"careful",it:"prudente",es:"prudente",de:"vorsichtig",pt:"prudente",nl:"voorzichtig"},
  "avertir":{en:"to warn",it:"avvertire",es:"avisar",de:"warnen",pt:"avisar",nl:"waarschuwen"},
  "fuite":{en:"leak",it:"perdita",es:"fuga",de:"Leck",pt:"fuga",nl:"lek"},
  "réservation":{en:"reservation",it:"prenotazione",es:"reserva",de:"Reservierung",pt:"reserva",nl:"reservering"},
  "pourboire":{en:"tip",it:"mancia",es:"propina",de:"Trinkgeld",pt:"gorjeta",nl:"fooi"},
  "commander":{en:"to order",it:"ordinare",es:"pedir",de:"bestellen",pt:"pedir",nl:"bestellen"},
  "végétarien":{en:"vegetarian",it:"vegetariano",es:"vegetariano",de:"vegetarisch",pt:"vegetariano",nl:"vegetarisch"},
  "saignant":{en:"rare",it:"al sangue",es:"poco hecho",de:"blutig",pt:"mal passado",nl:"rood"},
  "bien cuit":{en:"well done",it:"ben cotto",es:"muy hecho",de:"durchgebraten",pt:"bem passado",nl:"doorbakken"},
  "concert":{en:"concert",it:"concerto",es:"concierto",de:"Konzert",pt:"concerto",nl:"concert"},
  "spectacle":{en:"show",it:"spettacolo",es:"espectáculo",de:"Vorstellung",pt:"espetáculo",nl:"voorstelling"},
  "chanteur":{en:"singer",it:"cantante",es:"cantante",de:"Sänger",pt:"cantor",nl:"zanger"},
  "acteur":{en:"actor",it:"attore",es:"actor",de:"Schauspieler",pt:"ator",nl:"acteur"},
  "scène":{en:"stage",it:"palcoscenico",es:"escenario",de:"Bühne",pt:"palco",nl:"podium"},
  "applaudir":{en:"to applaud",it:"applaudire",es:"aplaudir",de:"applaudieren",pt:"aplaudir",nl:"applaudisseren"},
  "exposition":{en:"exhibition",it:"mostra",es:"exposición",de:"Ausstellung",pt:"exposição",nl:"tentoonstelling"},
  "ambiance":{en:"atmosphere",it:"atmosfera",es:"ambiente",de:"Stimmung",pt:"ambiente",nl:"sfeer"},
  "cirque":{en:"circus",it:"circo",es:"circo",de:"Zirkus",pt:"circo",nl:"circus"},
  "affiche":{en:"poster",it:"manifesto",es:"cartel",de:"Plakat",pt:"cartaz",nl:"poster"},
  "entracte":{en:"interval",it:"intervallo",es:"intermedio",de:"Pause",pt:"intervalo",nl:"pauze"},
  "cependant":{en:"however",it:"tuttavia",es:"sin embargo",de:"jedoch",pt:"no entanto",nl:"echter"},
  "pourtant":{en:"yet",it:"eppure",es:"aun así",de:"dennoch",pt:"contudo",nl:"toch"},
  "malgré":{en:"despite",it:"nonostante",es:"a pesar de",de:"trotz",pt:"apesar de",nl:"ondanks"},
  "sauf":{en:"except",it:"tranne",es:"excepto",de:"außer",pt:"exceto",nl:"behalve"},
  "environ":{en:"about",it:"circa",es:"aproximadamente",de:"ungefähr",pt:"cerca de",nl:"ongeveer"},
  "plutôt":{en:"rather",it:"piuttosto",es:"más bien",de:"eher",pt:"de preferência",nl:"eerder"},
  "sans doute":{en:"probably",it:"probabilmente",es:"probablemente",de:"wahrscheinlich",pt:"provavelmente",nl:"waarschijnlijk"},
  "d'ailleurs":{en:"besides",it:"del resto",es:"por cierto",de:"übrigens",pt:"aliás",nl:"trouwens"},
  "en fait":{en:"actually",it:"in realtà",es:"en realidad",de:"eigentlich",pt:"na verdade",nl:"eigenlijk"},
  "au lieu de":{en:"instead of",it:"invece di",es:"en lugar de",de:"anstatt",pt:"em vez de",nl:"in plaats van"},
  "grâce à":{en:"thanks to",it:"grazie a",es:"gracias a",de:"dank",pt:"graças a",nl:"dankzij"},
  "à cause de":{en:"because of",it:"a causa di",es:"a causa de",de:"wegen",pt:"por causa de",nl:"vanwege"},
  "se souvenir":{en:"to remember",it:"ricordarsi",es:"acordarse",de:"sich erinnern",pt:"lembrar-se",nl:"zich herinneren"},
  "mémoire":{en:"memory",it:"memoria",es:"memoria",de:"Gedächtnis",pt:"memória",nl:"geheugen"},
  "reconnaître":{en:"to recognise",it:"riconoscere",es:"reconocer",de:"erkennen",pt:"reconhecer",nl:"herkennen"},
  "regretter":{en:"to regret",it:"rimpiangere",es:"lamentar",de:"bedauern",pt:"lamentar",nl:"betreuren"},
  "deviner":{en:"to guess",it:"indovinare",es:"adivinar",de:"erraten",pt:"adivinhar",nl:"raden"},
  "imaginer":{en:"to imagine",it:"immaginare",es:"imaginar",de:"sich vorstellen",pt:"imaginar",nl:"zich voorstellen"},
  "réfléchir":{en:"to think it over",it:"riflettere",es:"reflexionar",de:"nachdenken",pt:"refletir",nl:"nadenken"},
  "supposer":{en:"to suppose",it:"supporre",es:"suponer",de:"vermuten",pt:"supor",nl:"veronderstellen"},
  "hésiter":{en:"to hesitate",it:"esitare",es:"vacilar",de:"zögern",pt:"hesitar",nl:"aarzelen"},
  "prévoir":{en:"to foresee",it:"prevedere",es:"prever",de:"vorhersehen",pt:"prever",nl:"voorzien"},
  "emprunter":{en:"to borrow",it:"prendere in prestito",es:"pedir prestado",de:"sich leihen",pt:"pedir emprestado",nl:"lenen"},
  "prêter":{en:"to lend",it:"prestare",es:"prestar",de:"verleihen",pt:"emprestar",nl:"uitlenen"},
  "dette":{en:"debt",it:"debito",es:"deuda",de:"Schulden",pt:"dívida",nl:"schuld"},
  "récompense":{en:"reward",it:"ricompensa",es:"recompensa",de:"Belohnung",pt:"recompensa",nl:"beloning"},
  "métal":{en:"metal",it:"metallo",es:"metal",de:"Metall",pt:"metal",nl:"metaal"},
  "plastique":{en:"plastic",it:"plastica",es:"plástico",de:"Plastik",pt:"plástico",nl:"plastic"},
  "bois":{en:"wood",it:"legno",es:"madera",de:"Holz",pt:"madeira",nl:"hout"},
  "or":{en:"gold",it:"oro",es:"oro",de:"Gold",pt:"ouro",nl:"goud"},
  "carton":{en:"cardboard",it:"cartone",es:"cartón",de:"Pappe",pt:"cartão",nl:"karton"},
  "coton":{en:"cotton",it:"cotone",es:"algodón",de:"Baumwolle",pt:"algodão",nl:"katoen"},
  "laine":{en:"wool",it:"lana",es:"lana",de:"Wolle",pt:"lã",nl:"wol"},
  "cuir":{en:"leather",it:"cuoio",es:"cuero",de:"Leder",pt:"couro",nl:"leer"},
  "soie":{en:"silk",it:"seta",es:"seda",de:"Seide",pt:"seda",nl:"zijde"},
  "tissu":{en:"fabric",it:"tessuto",es:"tela",de:"Stoff",pt:"tecido",nl:"stof"},
  "j'ai besoin d'un médecin":{en:"I need a doctor",it:"ho bisogno di un medico",es:"necesito un médico",de:"ich brauche einen Arzt",pt:"preciso de um médico",nl:"ik heb een dokter nodig"},
  "je cherche du travail":{en:"I am looking for a job",it:"cerco lavoro",es:"busco trabajo",de:"ich suche Arbeit",pt:"procuro trabalho",nl:"ik zoek werk"},
  "il y a le feu":{en:"there is a fire",it:"c'è un incendio",es:"hay un incendio",de:"es brennt",pt:"há um incêndio",nl:"er is brand"},
  "l'addition, s'il vous plaît":{en:"the bill, please",it:"il conto, per favore",es:"la cuenta, por favor",de:"die Rechnung, bitte",pt:"a conta, por favor",nl:"de rekening, alstublieft"},
  "le spectacle commence à huit heures":{en:"the show starts at eight",it:"lo spettacolo inizia alle otto",es:"el espectáculo empieza a las ocho",de:"die Vorstellung beginnt um acht Uhr",pt:"o espetáculo começa às oito",nl:"de voorstelling begint om acht uur"},
  "je me souviens de toi":{en:"I remember you",it:"mi ricordo di te",es:"me acuerdo de ti",de:"ich erinnere mich an dich",pt:"lembro-me de ti",nl:"ik herinner me jou"},
  "ça vaut la peine":{en:"it's worth it",it:"ne vale la pena",es:"vale la pena",de:"es lohnt sich",pt:"vale a pena",nl:"het is de moeite waard"}
};
CURRICULUM_T.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV6).forEach(function(k){ if(NEWV6[k][l]) LEX[l][k]=NEWV6[k][l]; }); });

/* --- EXTENSION v2.62 (vague 6, cap B1) : 14 unités — aéroport, gare, ville, ferme, sport,
   arts, poste, ménage, grande famille, grands jours, communiquer, verbes précieux, se repérer,
   fruits du verger. Parité garantie (NEWV7). Portugais EUROPÉEN toujours : descolagem, comboio,
   bilheteira, passadeira, quinta, equipa, golo, encomenda, loiça, gémeos, alperce, ananás. --- */
var CURRICULUM_S = [
  { t:"À l'aéroport 🛫", c:"#38bdf8", L:[
    { t:"Embarquement immédiat", w:["embarquement","décollage","atterrissage","bagage à main","hublot","piste"], p:[] } ]},
  { t:"À la gare 🚆", c:"#818cf8", L:[
    { t:"Prendre le train", w:["quai","guichet","aller simple","aller-retour","correspondance"], p:["le train est en retard","où est le quai"] } ]},
  { t:"La ville en détail 🏙", c:"#94a3b8", L:[
    { t:"Dans la rue", w:["trottoir","passage piéton","panneau","lampadaire","boîte aux lettres","rond-point"], p:[] },
    { t:"Autour de la place", w:["fontaine","statue","banlieue","centre-ville","tunnel"], p:[] } ]},
  { t:"À la ferme 🌾", c:"#a3e635", L:[
    { t:"Les champs", w:["ferme","récolte","semer","tracteur","blé"], p:[] },
    { t:"Les bâtiments", w:["grange","étable","poulailler","puits","épouvantail"], p:[] },
    { t:"Autour des bêtes", w:["troupeau","berger","foin","vigne","maïs"], p:[] } ]},
  { t:"Le sport en grand ⚽", c:"#34d399", L:[
    { t:"Le grand match", w:["équipe","match","but","arbitre","terrain","tournoi"], p:[] },
    { t:"Gagner et perdre", w:["victoire","défaite","entraînement","adversaire","champion","médaille"], p:[] } ]},
  { t:"L'atelier d'artiste 🎨", c:"#c084fc", L:[
    { t:"Peindre et sculpter", w:["peintre","tableau","sculpture","sculpteur","atelier","dessin"], p:[] },
    { t:"À la galerie", w:["œuvre","portrait","chef-d'œuvre","galerie","exposer"], p:[] } ]},
  { t:"À la poste 📮", c:"#fbbf24", L:[
    { t:"Envoyer un colis", w:["colis","timbre","enveloppe","livraison","expéditeur","destinataire"], p:[] },
    { t:"Au guichet", w:["formulaire","signature","tampon"], p:[] } ]},
  { t:"Le grand ménage 🧹", c:"#60a5fa", L:[
    { t:"Tout nettoyer", w:["balayer","aspirateur","lessive","vaisselle","poussière"], p:[] },
    { t:"Les bons outils", w:["balai","seau","éponge","serpillière"], p:[] } ]},
  { t:"La grande famille 👨‍👩‍👧", c:"#f472b6", L:[
    { t:"La belle-famille", w:["beau-père","belle-mère","gendre","belle-sœur","beau-frère","époux"], p:[] },
    { t:"Petits et grands", w:["jumeaux","aîné","cadet","petit-fils","petite-fille","veuf"], p:[] } ]},
  { t:"Les grands jours 💒", c:"#fb7185", L:[
    { t:"Jour de fête", w:["cérémonie","bouquet","alliance","discours"], p:["félicitations pour ton mariage"] },
    { t:"Les étapes de la vie", w:["baptême","enterrement"], p:[] } ]},
  { t:"Communiquer 🗣", c:"#22d3ee", L:[
    { t:"Prendre la parole", w:["annoncer","prévenir","saluer","interrompre","prononcer"], p:["puis-je vous aider"] },
    { t:"À voix basse", w:["bavarder","chuchoter","se plaindre","avouer","exagérer"], p:[] } ]},
  { t:"Verbes précieux ⚙️", c:"#e879a9", L:[
    { t:"Oser et mériter", w:["éviter","oser","mériter","atteindre","appartenir","dépendre"], p:["à qui appartient ce sac"] },
    { t:"Sembler et suffire", w:["sembler","paraître","exister","suffire","diminuer","augmenter"], p:[] },
    { t:"Du concret", w:["réclamer","emballer","serrer","lâcher"], p:[] } ]},
  { t:"Se repérer 🧭", c:"#fbbf24", L:[
    { t:"Dessus, dessous", w:["au-dessus","au-dessous","à travers","le long de","parmi","contre"], p:[] },
    { t:"Tout autour", w:["au fond de","autour","vers","en face","à l'intérieur","à l'extérieur","au milieu"], p:[] } ]},
  { t:"Les fruits du verger 🍓", c:"#f87171", L:[
    { t:"Fruits rouges", w:["framboise","cerise","prune","myrtille","pêche"], p:[] },
    { t:"Fruits du soleil", w:["abricot","melon","pastèque","ananas","concombre"], p:[] },
    { t:"Du potager au panier", w:["poireau","chou","noix","noisette","châtaigne"], p:[] } ]}
];
var NEWV7 = {
  "embarquement":{en:"boarding",it:"imbarco",es:"embarque",de:"Boarding",pt:"embarque",nl:"instappen"},
  "décollage":{en:"take-off",it:"decollo",es:"despegue",de:"Start",pt:"descolagem",nl:"opstijgen"},
  "atterrissage":{en:"landing",it:"atterraggio",es:"aterrizaje",de:"Landung",pt:"aterragem",nl:"landing"},
  "bagage à main":{en:"hand luggage",it:"bagaglio a mano",es:"equipaje de mano",de:"Handgepäck",pt:"bagagem de mão",nl:"handbagage"},
  "hublot":{en:"porthole",it:"oblò",es:"ojo de buey",de:"Bullauge",pt:"vigia",nl:"patrijspoort"},
  "piste":{en:"runway",it:"pista",es:"pista",de:"Landebahn",pt:"pista",nl:"landingsbaan"},
  "quai":{en:"platform",it:"binario",es:"andén",de:"Bahnsteig",pt:"cais",nl:"perron"},
  "guichet":{en:"ticket office",it:"sportello",es:"taquilla",de:"Schalter",pt:"bilheteira",nl:"loket"},
  "aller simple":{en:"single ticket",it:"solo andata",es:"billete de ida",de:"einfache Fahrkarte",pt:"bilhete de ida",nl:"enkele reis"},
  "aller-retour":{en:"return ticket",it:"andata e ritorno",es:"billete de ida y vuelta",de:"Hin- und Rückfahrkarte",pt:"bilhete de ida e volta",nl:"retourtje"},
  "correspondance":{en:"connection",it:"coincidenza",es:"transbordo",de:"Anschluss",pt:"ligação",nl:"overstap"},
  "trottoir":{en:"pavement",it:"marciapiede",es:"acera",de:"Bürgersteig",pt:"passeio",nl:"stoep"},
  "passage piéton":{en:"pedestrian crossing",it:"strisce pedonali",es:"paso de cebra",de:"Zebrastreifen",pt:"passadeira",nl:"zebrapad"},
  "panneau":{en:"road sign",it:"cartello",es:"señal",de:"Schild",pt:"sinal",nl:"verkeersbord"},
  "lampadaire":{en:"street lamp",it:"lampione",es:"farola",de:"Straßenlaterne",pt:"candeeiro de rua",nl:"lantaarnpaal"},
  "boîte aux lettres":{en:"letterbox",it:"cassetta delle lettere",es:"buzón",de:"Briefkasten",pt:"caixa do correio",nl:"brievenbus"},
  "rond-point":{en:"roundabout",it:"rotonda",es:"rotonda",de:"Kreisverkehr",pt:"rotunda",nl:"rotonde"},
  "fontaine":{en:"fountain",it:"fontana",es:"fuente",de:"Springbrunnen",pt:"fonte",nl:"fontein"},
  "statue":{en:"statue",it:"statua",es:"estatua",de:"Statue",pt:"estátua",nl:"standbeeld"},
  "banlieue":{en:"suburbs",it:"periferia",es:"afueras",de:"Vorort",pt:"subúrbio",nl:"buitenwijk"},
  "centre-ville":{en:"city centre",it:"centro città",es:"centro de la ciudad",de:"Innenstadt",pt:"centro da cidade",nl:"stadscentrum"},
  "tunnel":{en:"tunnel",it:"tunnel",es:"túnel",de:"Tunnel",pt:"túnel",nl:"tunnel"},
  "ferme":{en:"farm",it:"fattoria",es:"granja",de:"Bauernhof",pt:"quinta",nl:"boerderij"},
  "récolte":{en:"harvest",it:"raccolto",es:"cosecha",de:"Ernte",pt:"colheita",nl:"oogst"},
  "semer":{en:"to sow",it:"seminare",es:"sembrar",de:"säen",pt:"semear",nl:"zaaien"},
  "tracteur":{en:"tractor",it:"trattore",es:"tractor",de:"Traktor",pt:"trator",nl:"tractor"},
  "blé":{en:"wheat",it:"grano",es:"trigo",de:"Weizen",pt:"trigo",nl:"tarwe"},
  "grange":{en:"barn",it:"fienile",es:"granero",de:"Scheune",pt:"celeiro",nl:"schuur"},
  "étable":{en:"cowshed",it:"stalla",es:"establo",de:"Stall",pt:"estábulo",nl:"stal"},
  "poulailler":{en:"henhouse",it:"pollaio",es:"gallinero",de:"Hühnerstall",pt:"galinheiro",nl:"kippenhok"},
  "puits":{en:"well",it:"pozzo",es:"pozo",de:"Brunnen",pt:"poço",nl:"put"},
  "épouvantail":{en:"scarecrow",it:"spaventapasseri",es:"espantapájaros",de:"Vogelscheuche",pt:"espantalho",nl:"vogelverschrikker"},
  "troupeau":{en:"herd",it:"gregge",es:"rebaño",de:"Herde",pt:"rebanho",nl:"kudde"},
  "berger":{en:"shepherd",it:"pastore",es:"pastor",de:"Hirte",pt:"pastor",nl:"herder"},
  "foin":{en:"hay",it:"fieno",es:"heno",de:"Heu",pt:"feno",nl:"hooi"},
  "vigne":{en:"vine",it:"vigna",es:"viña",de:"Rebe",pt:"videira",nl:"wijnstok"},
  "maïs":{en:"corn",it:"mais",es:"maíz",de:"Mais",pt:"milho",nl:"maïs"},
  "équipe":{en:"team",it:"squadra",es:"equipo",de:"Mannschaft",pt:"equipa",nl:"ploeg"},
  "match":{en:"match",it:"partita",es:"partido",de:"Match",pt:"partida",nl:"wedstrijd"},
  "but":{en:"goal",it:"gol",es:"gol",de:"Tor",pt:"golo",nl:"doelpunt"},
  "arbitre":{en:"referee",it:"arbitro",es:"árbitro",de:"Schiedsrichter",pt:"árbitro",nl:"scheidsrechter"},
  "terrain":{en:"pitch",it:"campo da gioco",es:"terreno de juego",de:"Spielfeld",pt:"campo de jogos",nl:"speelveld"},
  "tournoi":{en:"tournament",it:"torneo",es:"torneo",de:"Turnier",pt:"torneio",nl:"toernooi"},
  "victoire":{en:"victory",it:"vittoria",es:"victoria",de:"Sieg",pt:"vitória",nl:"overwinning"},
  "défaite":{en:"defeat",it:"sconfitta",es:"derrota",de:"Niederlage",pt:"derrota",nl:"nederlaag"},
  "entraînement":{en:"practice",it:"allenamento",es:"entrenamiento",de:"Training",pt:"treino",nl:"training"},
  "adversaire":{en:"opponent",it:"avversario",es:"adversario",de:"Gegner",pt:"adversário",nl:"tegenstander"},
  "champion":{en:"champion",it:"campione",es:"campeón",de:"Meister",pt:"campeão",nl:"kampioen"},
  "médaille":{en:"medal",it:"medaglia",es:"medalla",de:"Medaille",pt:"medalha",nl:"medaille"},
  "peintre":{en:"painter",it:"pittore",es:"pintor",de:"Maler",pt:"pintor",nl:"schilder"},
  "tableau":{en:"painting",it:"quadro",es:"cuadro",de:"Gemälde",pt:"quadro",nl:"schilderij"},
  "sculpture":{en:"sculpture",it:"scultura",es:"escultura",de:"Skulptur",pt:"escultura",nl:"beeldhouwwerk"},
  "sculpteur":{en:"sculptor",it:"scultore",es:"escultor",de:"Bildhauer",pt:"escultor",nl:"beeldhouwer"},
  "atelier":{en:"studio",it:"atelier",es:"taller",de:"Atelier",pt:"atelier",nl:"atelier"},
  "dessin":{en:"drawing",it:"disegno",es:"dibujo",de:"Zeichnung",pt:"desenho",nl:"tekening"},
  "œuvre":{en:"work of art",it:"opera",es:"obra",de:"Werk",pt:"obra",nl:"kunstwerk"},
  "portrait":{en:"portrait",it:"ritratto",es:"retrato",de:"Porträt",pt:"retrato",nl:"portret"},
  "chef-d'œuvre":{en:"masterpiece",it:"capolavoro",es:"obra maestra",de:"Meisterwerk",pt:"obra-prima",nl:"meesterwerk"},
  "galerie":{en:"gallery",it:"galleria",es:"galería",de:"Galerie",pt:"galeria",nl:"galerie"},
  "exposer":{en:"to exhibit",it:"esporre",es:"exponer",de:"ausstellen",pt:"expor",nl:"tentoonstellen"},
  "colis":{en:"parcel",it:"pacco",es:"paquete",de:"Paket",pt:"encomenda",nl:"pakket"},
  "timbre":{en:"stamp",it:"francobollo",es:"sello",de:"Briefmarke",pt:"selo",nl:"postzegel"},
  "enveloppe":{en:"envelope",it:"busta",es:"sobre",de:"Umschlag",pt:"envelope",nl:"envelop"},
  "livraison":{en:"delivery",it:"consegna",es:"entrega",de:"Lieferung",pt:"entrega",nl:"bezorging"},
  "expéditeur":{en:"sender",it:"mittente",es:"remitente",de:"Absender",pt:"remetente",nl:"afzender"},
  "destinataire":{en:"recipient",it:"destinatario",es:"destinatario",de:"Empfänger",pt:"destinatário",nl:"ontvanger"},
  "formulaire":{en:"form",it:"modulo",es:"formulario",de:"Formular",pt:"formulário",nl:"formulier"},
  "signature":{en:"signature",it:"firma",es:"firma",de:"Unterschrift",pt:"assinatura",nl:"handtekening"},
  "tampon":{en:"rubber stamp",it:"timbro",es:"tampón",de:"Stempel",pt:"carimbo",nl:"stempel"},
  "balayer":{en:"to sweep",it:"spazzare",es:"barrer",de:"fegen",pt:"varrer",nl:"vegen"},
  "aspirateur":{en:"vacuum cleaner",it:"aspirapolvere",es:"aspiradora",de:"Staubsauger",pt:"aspirador",nl:"stofzuiger"},
  "lessive":{en:"laundry",it:"bucato",es:"colada",de:"Wäsche",pt:"lavagem da roupa",nl:"was"},
  "vaisselle":{en:"dishes",it:"stoviglie",es:"vajilla",de:"Geschirr",pt:"loiça",nl:"afwas"},
  "poussière":{en:"dust",it:"polvere",es:"polvo",de:"Staub",pt:"pó",nl:"stof"},
  "balai":{en:"broom",it:"scopa",es:"escoba",de:"Besen",pt:"vassoura",nl:"bezem"},
  "seau":{en:"bucket",it:"secchio",es:"cubo",de:"Eimer",pt:"balde",nl:"emmer"},
  "éponge":{en:"sponge",it:"spugna",es:"esponja",de:"Schwamm",pt:"esponja",nl:"spons"},
  "serpillière":{en:"mop",it:"mocio",es:"fregona",de:"Wischmopp",pt:"esfregona",nl:"dweil"},
  "beau-père":{en:"father-in-law",it:"suocero",es:"suegro",de:"Schwiegervater",pt:"sogro",nl:"schoonvader"},
  "belle-mère":{en:"mother-in-law",it:"suocera",es:"suegra",de:"Schwiegermutter",pt:"sogra",nl:"schoonmoeder"},
  "gendre":{en:"son-in-law",it:"genero",es:"yerno",de:"Schwiegersohn",pt:"genro",nl:"schoonzoon"},
  "belle-sœur":{en:"sister-in-law",it:"cognata",es:"cuñada",de:"Schwägerin",pt:"cunhada",nl:"schoonzus"},
  "beau-frère":{en:"brother-in-law",it:"cognato",es:"cuñado",de:"Schwager",pt:"cunhado",nl:"zwager"},
  "époux":{en:"spouse",it:"coniuge",es:"cónyuge",de:"Ehepartner",pt:"cônjuge",nl:"echtgenoot"},
  "jumeaux":{en:"twins",it:"gemelli",es:"gemelos",de:"Zwillinge",pt:"gémeos",nl:"tweeling"},
  "aîné":{en:"eldest",it:"primogenito",es:"primogénito",de:"der Älteste",pt:"primogénito",nl:"oudste"},
  "cadet":{en:"youngest",it:"il minore",es:"el menor",de:"der Jüngste",pt:"o mais novo",nl:"jongste"},
  "petit-fils":{en:"grandson",it:"nipotino",es:"nieto",de:"Enkel",pt:"neto",nl:"kleinzoon"},
  "petite-fille":{en:"granddaughter",it:"nipotina",es:"nieta",de:"Enkelin",pt:"neta",nl:"kleindochter"},
  "veuf":{en:"widower",it:"vedovo",es:"viudo",de:"Witwer",pt:"viúvo",nl:"weduwnaar"},
  "cérémonie":{en:"ceremony",it:"cerimonia",es:"ceremonia",de:"Zeremonie",pt:"cerimónia",nl:"ceremonie"},
  "bouquet":{en:"bouquet",it:"mazzo di fiori",es:"ramo de flores",de:"Blumenstrauß",pt:"ramo de flores",nl:"boeket"},
  "alliance":{en:"wedding ring",it:"fede",es:"alianza",de:"Ehering",pt:"aliança",nl:"trouwring"},
  "discours":{en:"speech",it:"discorso",es:"discurso",de:"Rede",pt:"discurso",nl:"toespraak"},
  "baptême":{en:"christening",it:"battesimo",es:"bautizo",de:"Taufe",pt:"batismo",nl:"doop"},
  "enterrement":{en:"funeral",it:"funerale",es:"entierro",de:"Beerdigung",pt:"funeral",nl:"begrafenis"},
  "annoncer":{en:"to announce",it:"annunciare",es:"anunciar",de:"ankündigen",pt:"anunciar",nl:"aankondigen"},
  "prévenir":{en:"to notify",it:"avvisare",es:"advertir",de:"benachrichtigen",pt:"prevenir",nl:"verwittigen"},
  "saluer":{en:"to greet",it:"salutare",es:"saludar",de:"grüßen",pt:"cumprimentar",nl:"groeten"},
  "interrompre":{en:"to interrupt",it:"interrompere",es:"interrumpir",de:"unterbrechen",pt:"interromper",nl:"onderbreken"},
  "prononcer":{en:"to pronounce",it:"pronunciare",es:"pronunciar",de:"aussprechen",pt:"pronunciar",nl:"uitspreken"},
  "bavarder":{en:"to chat",it:"chiacchierare",es:"charlar",de:"plaudern",pt:"conversar",nl:"kletsen"},
  "chuchoter":{en:"to whisper",it:"sussurrare",es:"susurrar",de:"flüstern",pt:"sussurrar",nl:"fluisteren"},
  "se plaindre":{en:"to complain",it:"lamentarsi",es:"quejarse",de:"sich beschweren",pt:"queixar-se",nl:"klagen"},
  "avouer":{en:"to confess",it:"confessare",es:"confesar",de:"gestehen",pt:"confessar",nl:"bekennen"},
  "exagérer":{en:"to exaggerate",it:"esagerare",es:"exagerar",de:"übertreiben",pt:"exagerar",nl:"overdrijven"},
  "éviter":{en:"to avoid",it:"evitare",es:"evitar",de:"vermeiden",pt:"evitar",nl:"vermijden"},
  "oser":{en:"to dare",it:"osare",es:"atreverse",de:"wagen",pt:"ousar",nl:"durven"},
  "mériter":{en:"to deserve",it:"meritare",es:"merecer",de:"verdienen",pt:"merecer",nl:"verdienen"},
  "atteindre":{en:"to reach",it:"raggiungere",es:"alcanzar",de:"erreichen",pt:"alcançar",nl:"bereiken"},
  "appartenir":{en:"to belong",it:"appartenere",es:"pertenecer",de:"gehören",pt:"pertencer",nl:"toebehoren"},
  "dépendre":{en:"to depend",it:"dipendere",es:"depender",de:"abhängen",pt:"depender",nl:"afhangen"},
  "sembler":{en:"to seem",it:"sembrare",es:"parecer",de:"scheinen",pt:"parecer",nl:"lijken"},
  "paraître":{en:"to appear",it:"apparire",es:"aparentar",de:"wirken",pt:"aparentar",nl:"schijnen"},
  "exister":{en:"to exist",it:"esistere",es:"existir",de:"existieren",pt:"existir",nl:"bestaan"},
  "suffire":{en:"to be enough",it:"bastare",es:"bastar",de:"genügen",pt:"bastar",nl:"volstaan"},
  "diminuer":{en:"to decrease",it:"diminuire",es:"disminuir",de:"verringern",pt:"diminuir",nl:"verminderen"},
  "augmenter":{en:"to increase",it:"aumentare",es:"aumentar",de:"erhöhen",pt:"aumentar",nl:"verhogen"},
  "réclamer":{en:"to demand",it:"reclamare",es:"reclamar",de:"fordern",pt:"reclamar",nl:"eisen"},
  "emballer":{en:"to wrap",it:"impacchettare",es:"envolver",de:"einpacken",pt:"embrulhar",nl:"inpakken"},
  "serrer":{en:"to tighten",it:"stringere",es:"apretar",de:"festziehen",pt:"apertar",nl:"aandraaien"},
  "lâcher":{en:"to let go",it:"mollare",es:"soltar",de:"loslassen",pt:"largar",nl:"loslaten"},
  "au-dessus":{en:"above",it:"al di sopra",es:"por encima",de:"oberhalb",pt:"por cima",nl:"erboven"},
  "au-dessous":{en:"below",it:"al di sotto",es:"por debajo",de:"unterhalb",pt:"por baixo",nl:"eronder"},
  "à travers":{en:"through",it:"attraverso",es:"a través de",de:"durch",pt:"através de",nl:"doorheen"},
  "le long de":{en:"along",it:"lungo",es:"a lo largo de",de:"entlang",pt:"ao longo de",nl:"langs"},
  "parmi":{en:"among",it:"fra",es:"en medio de",de:"inmitten",pt:"no meio de",nl:"te midden van"},
  "contre":{en:"against",it:"contro",es:"contra",de:"gegen",pt:"contra",nl:"tegen"},
  "au fond de":{en:"at the bottom of",it:"in fondo a",es:"en el fondo de",de:"am Grund von",pt:"no fundo de",nl:"onderin"},
  "autour":{en:"around",it:"intorno",es:"alrededor",de:"ringsum",pt:"à volta",nl:"rondom"},
  "vers":{en:"towards",it:"verso",es:"hacia",de:"in Richtung",pt:"em direção a",nl:"naar"},
  "en face":{en:"opposite",it:"di fronte",es:"enfrente",de:"gegenüber",pt:"em frente",nl:"tegenover"},
  "à l'intérieur":{en:"inside",it:"all'interno",es:"dentro",de:"drinnen",pt:"lá dentro",nl:"binnen"},
  "à l'extérieur":{en:"outside",it:"all'esterno",es:"en el exterior",de:"außerhalb",pt:"no exterior",nl:"aan de buitenkant"},
  "au milieu":{en:"in the middle",it:"in mezzo",es:"en medio",de:"in der Mitte",pt:"no meio",nl:"in het midden"},
  "framboise":{en:"raspberry",it:"lampone",es:"frambuesa",de:"Himbeere",pt:"framboesa",nl:"framboos"},
  "cerise":{en:"cherry",it:"ciliegia",es:"cereza",de:"Kirsche",pt:"cereja",nl:"kers"},
  "prune":{en:"plum",it:"prugna",es:"ciruela",de:"Pflaume",pt:"ameixa",nl:"pruim"},
  "myrtille":{en:"blueberry",it:"mirtillo",es:"arándano",de:"Blaubeere",pt:"mirtilo",nl:"bosbes"},
  "pêche":{en:"peach",it:"pesca",es:"melocotón",de:"Pfirsich",pt:"pêssego",nl:"perzik"},
  "abricot":{en:"apricot",it:"albicocca",es:"albaricoque",de:"Aprikose",pt:"alperce",nl:"abrikoos"},
  "melon":{en:"melon",it:"melone",es:"melón",de:"Melone",pt:"melão",nl:"meloen"},
  "pastèque":{en:"watermelon",it:"anguria",es:"sandía",de:"Wassermelone",pt:"melancia",nl:"watermeloen"},
  "ananas":{en:"pineapple",it:"ananas",es:"piña",de:"Ananas",pt:"ananás",nl:"ananas"},
  "concombre":{en:"cucumber",it:"cetriolo",es:"pepino",de:"Gurke",pt:"pepino",nl:"komkommer"},
  "poireau":{en:"leek",it:"porro",es:"puerro",de:"Lauch",pt:"alho-francês",nl:"prei"},
  "chou":{en:"cabbage",it:"cavolo",es:"col",de:"Kohl",pt:"couve",nl:"kool"},
  "noix":{en:"walnut",it:"noce",es:"nuez",de:"Walnuss",pt:"noz",nl:"walnoot"},
  "noisette":{en:"hazelnut",it:"nocciola",es:"avellana",de:"Haselnuss",pt:"avelã",nl:"hazelnoot"},
  "châtaigne":{en:"chestnut",it:"castagna",es:"castaña",de:"Kastanie",pt:"castanha",nl:"kastanje"},
  "le train est en retard":{en:"the train is late",it:"il treno è in ritardo",es:"el tren llega tarde",de:"der Zug hat Verspätung",pt:"o comboio está atrasado",nl:"de trein heeft vertraging"},
  "où est le quai":{en:"where is the platform",it:"dov'è il binario",es:"dónde está el andén",de:"wo ist der Bahnsteig",pt:"onde é o cais",nl:"waar is het perron"},
  "félicitations pour ton mariage":{en:"congratulations on your wedding",it:"congratulazioni per il tuo matrimonio",es:"felicidades por tu boda",de:"herzlichen Glückwunsch zur Hochzeit",pt:"parabéns pelo teu casamento",nl:"gefeliciteerd met je huwelijk"},
  "puis-je vous aider":{en:"may I help you",it:"posso aiutarla",es:"puedo ayudarle",de:"kann ich Ihnen helfen",pt:"posso ajudá-lo",nl:"kan ik u helpen"},
  "à qui appartient ce sac":{en:"whose bag is this",it:"di chi è questa borsa",es:"de quién es esta bolsa",de:"wem gehört diese Tasche",pt:"de quem é este saco",nl:"van wie is deze tas"}
};
CURRICULUM_S.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV7).forEach(function(k){ if(NEWV7[k][l]) LEX[l][k]=NEWV7[k][l]; }); });

/* --- EXTENSION v2.63 (vague 7 — LE PALIER B1) : 19 unités — hôtel, mer, vie marine, espace,
   sciences, justice, histoire, voiture, corps, élégance, plein air, ustensiles, métiers, musique,
   catastrophes, adjectifs, verbes, mots du temps, expressions. Parité garantie (NEWV8).
   Portugais EUROPÉEN toujours : receção, almofada, foguetão, travão, fato, atacador, palhinha,
   canalizador, terramoto, dececionante, carregar, força, fazer figas. --- */
var CURRICULUM_R = [
  { t:"À l'hôtel 🏨", c:"#c084fc", L:[
    { t:"Bienvenue !", w:["réception","réceptionniste","chambre double","chambre simple","auberge"], p:[] },
    { t:"Une bonne nuit", w:["climatisation","chauffage","oreiller","couverture","drap"], p:[] } ]},
  { t:"En mer ⛵", c:"#38bdf8", L:[
    { t:"Larguer les amarres", w:["voile","ancre","équipage","capitaine","croisière","port"], p:[] },
    { t:"Face aux vagues", w:["phare","marée","mouette","filet","naufrage","bouée"], p:[] } ]},
  { t:"La vie marine 🦀", c:"#22d3ee", L:[
    { t:"Sous l'eau", w:["algue","coquillage","crabe","méduse","pieuvre"], p:[] } ]},
  { t:"L'espace 🚀", c:"#818cf8", L:[
    { t:"Décoller", w:["fusée","navette","satellite","astronaute","télescope","gravité"], p:[] },
    { t:"L'infini", w:["comète","galaxie","univers","étoile filante","ovni","extraterrestre"], p:[] } ]},
  { t:"Les sciences 🔬", c:"#34d399", L:[
    { t:"Au laboratoire", w:["chimie","physique","biologie","laboratoire","microscope"], p:[] },
    { t:"Chercher et trouver", w:["invention","découverte","chercheur","théorie","cerveau"], p:[] } ]},
  { t:"La justice ⚖️", c:"#94a3b8", L:[
    { t:"Au tribunal", w:["tribunal","juge","procès","preuve","plainte"], p:[] },
    { t:"Coupable ou innocent", w:["coupable","innocent","prison","amende","interdit"], p:[] } ]},
  { t:"Il était une fois 🏰", c:"#fbbf24", L:[
    { t:"Rois et chevaliers", w:["couronne","trône","chevalier","héros","empire"], p:["il était une fois"] },
    { t:"La grande bataille", w:["bataille","armée","soldat","révolution"], p:[] },
    { t:"Les armes d'antan", w:["épée","bouclier","flèche","canon"], p:[] } ]},
  { t:"Sous le capot 🚗", c:"#fb923c", L:[
    { t:"Au volant", w:["moteur","frein","pneu","volant","coffre","capot"], p:[] },
    { t:"Sur la route", w:["klaxon","rétroviseur","pare-brise","essuie-glace","embouteillage","panne"], p:[] } ]},
  { t:"Le corps au-dedans 🫀", c:"#f87171", L:[
    { t:"Les organes", w:["poumon","estomac","foie","muscle","squelette","veine"], p:[] },
    { t:"Des pieds à la tête", w:["côte","cheville","poignet","menton","hanche","mollet"], p:[] },
    { t:"Le visage en détail", w:["sourcil","cil","paupière","nuque","paume"], p:[] } ]},
  { t:"L'élégance 👔", c:"#e879a9", L:[
    { t:"Sur son trente-et-un", w:["costume","cravate","nœud papillon","gilet","imperméable","bretelles"], p:[] },
    { t:"Les finitions", w:["fermeture éclair","talon","semelle","lacet","col","manche"], p:[] } ]},
  { t:"Le plein air 🏕", c:"#4ade80", L:[
    { t:"Partir camper", w:["camping","tente","sac de couchage","lampe de poche","hamac"], p:[] },
    { t:"L'aventure", w:["randonnée","chasse","boussole","jumelles","feu de camp"], p:[] } ]},
  { t:"Ustensiles malins 🍽", c:"#f59e0b", L:[
    { t:"Dans le tiroir", w:["fouet","louche","passoire","râpe","entonnoir"], p:[] },
    { t:"À déboucher", w:["couvercle","bouchon","tire-bouchon","glaçon","paille"], p:[] } ]},
  { t:"Les métiers 🛠", c:"#a78bfa", L:[
    { t:"Les mains d'or", w:["plombier","électricien","menuisier","bijoutier"], p:[] },
    { t:"Au service de tous", w:["vétérinaire","pêcheur","chauffeur","fleuriste"], p:[] } ]},
  { t:"En musique 🎻", c:"#f472b6", L:[
    { t:"L'orchestre", w:["orchestre","violon","flûte","trompette"], p:[] },
    { t:"En rythme", w:["mélodie","rythme","chorale","tambour"], p:[] } ]},
  { t:"La Terre en colère 🌋", c:"#ef4444", L:[
    { t:"Catastrophes naturelles", w:["volcan","inondation","tremblement de terre","avalanche","canicule","continent"], p:[] } ]},
  { t:"Adjectifs qui brillent ✨", c:"#fbbf24", L:[
    { t:"Ça impressionne", w:["étonnant","effrayant","passionnant","émouvant","précieux","semblable"], p:[] },
    { t:"Le mot juste", w:["épuisant","décevant","indispensable","disponible","provisoire"], p:[] } ]},
  { t:"Verbes d'action 🏗", c:"#60a5fa", L:[
    { t:"Construire et défaire", w:["détruire","creuser","vider","verrouiller","brancher","débrancher"], p:[] },
    { t:"Du geste précis", w:["appuyer","secouer","frotter","essuyer","plonger","ramer"], p:[] } ]},
  { t:"Les mots du temps ⏳", c:"#94a3b8", L:[
    { t:"Hier et demain", w:["autrefois","récemment","désormais","auparavant","à l'avenir"], p:[] },
    { t:"D'un coup", w:["aussitôt","tout à coup","dès que"], p:[] } ]},
  { t:"Expressions du quotidien 💬", c:"#22d3ee", L:[
    { t:"Les petites phrases", w:["bon courage","tant pis","tant mieux","ça m'est égal"], p:["bonne chance pour ton examen","je croise les doigts"] },
    { t:"Dans la conversation", w:["pas de souci","quel dommage","à ta santé","en route"], p:["au secours","en cas d'urgence, appelez la police"] } ]}
];
var NEWV8 = {
  "réception":{en:"reception",it:"reception",es:"recepción",de:"Rezeption",pt:"receção",nl:"receptie"},
  "réceptionniste":{en:"receptionist",it:"receptionist",es:"recepcionista",de:"Rezeptionist",pt:"rececionista",nl:"receptionist"},
  "chambre double":{en:"double room",it:"camera doppia",es:"habitación doble",de:"Doppelzimmer",pt:"quarto duplo",nl:"tweepersoonskamer"},
  "chambre simple":{en:"single room",it:"camera singola",es:"habitación individual",de:"Einzelzimmer",pt:"quarto individual",nl:"eenpersoonskamer"},
  "auberge":{en:"inn",it:"locanda",es:"posada",de:"Gasthaus",pt:"estalagem",nl:"herberg"},
  "climatisation":{en:"air conditioning",it:"aria condizionata",es:"aire acondicionado",de:"Klimaanlage",pt:"ar condicionado",nl:"airconditioning"},
  "chauffage":{en:"heating",it:"riscaldamento",es:"calefacción",de:"Heizung",pt:"aquecimento",nl:"verwarming"},
  "oreiller":{en:"pillow",it:"cuscino",es:"almohada",de:"Kissen",pt:"almofada",nl:"hoofdkussen"},
  "couverture":{en:"blanket",it:"coperta",es:"manta",de:"Decke",pt:"cobertor",nl:"deken"},
  "drap":{en:"sheet",it:"lenzuolo",es:"sábana",de:"Bettlaken",pt:"lençol",nl:"laken"},
  "voile":{en:"sail",it:"vela",es:"vela",de:"Segel",pt:"vela",nl:"zeil"},
  "ancre":{en:"anchor",it:"ancora",es:"ancla",de:"Anker",pt:"âncora",nl:"anker"},
  "équipage":{en:"crew",it:"equipaggio",es:"tripulación",de:"Besatzung",pt:"tripulação",nl:"bemanning"},
  "capitaine":{en:"captain",it:"capitano",es:"capitán",de:"Kapitän",pt:"capitão",nl:"kapitein"},
  "croisière":{en:"cruise",it:"crociera",es:"crucero",de:"Kreuzfahrt",pt:"cruzeiro",nl:"cruise"},
  "port":{en:"harbour",it:"porto",es:"puerto",de:"Hafen",pt:"porto",nl:"haven"},
  "phare":{en:"lighthouse",it:"faro",es:"faro",de:"Leuchtturm",pt:"farol",nl:"vuurtoren"},
  "marée":{en:"tide",it:"marea",es:"marea",de:"Gezeiten",pt:"maré",nl:"getij"},
  "mouette":{en:"seagull",it:"gabbiano",es:"gaviota",de:"Möwe",pt:"gaivota",nl:"meeuw"},
  "filet":{en:"net",it:"rete",es:"red",de:"Netz",pt:"rede",nl:"net"},
  "naufrage":{en:"shipwreck",it:"naufragio",es:"naufragio",de:"Schiffbruch",pt:"naufrágio",nl:"schipbreuk"},
  "bouée":{en:"buoy",it:"boa",es:"boya",de:"Boje",pt:"boia",nl:"boei"},
  "algue":{en:"seaweed",it:"alga",es:"alga",de:"Alge",pt:"alga",nl:"zeewier"},
  "coquillage":{en:"seashell",it:"conchiglia",es:"concha",de:"Muschel",pt:"concha",nl:"schelp"},
  "crabe":{en:"crab",it:"granchio",es:"cangrejo",de:"Krabbe",pt:"caranguejo",nl:"krab"},
  "méduse":{en:"jellyfish",it:"medusa",es:"medusa",de:"Qualle",pt:"alforreca",nl:"kwal"},
  "pieuvre":{en:"octopus",it:"polpo",es:"pulpo",de:"Krake",pt:"polvo",nl:"octopus"},
  "fusée":{en:"rocket",it:"razzo",es:"cohete",de:"Rakete",pt:"foguetão",nl:"raket"},
  "navette":{en:"shuttle",it:"navetta",es:"transbordador",de:"Raumfähre",pt:"vaivém",nl:"ruimteveer"},
  "satellite":{en:"satellite",it:"satellite",es:"satélite",de:"Satellit",pt:"satélite",nl:"satelliet"},
  "astronaute":{en:"astronaut",it:"astronauta",es:"astronauta",de:"Astronaut",pt:"astronauta",nl:"astronaut"},
  "télescope":{en:"telescope",it:"telescopio",es:"telescopio",de:"Teleskop",pt:"telescópio",nl:"telescoop"},
  "gravité":{en:"gravity",it:"gravità",es:"gravedad",de:"Schwerkraft",pt:"gravidade",nl:"zwaartekracht"},
  "comète":{en:"comet",it:"cometa",es:"cometa",de:"Komet",pt:"cometa",nl:"komeet"},
  "galaxie":{en:"galaxy",it:"galassia",es:"galaxia",de:"Galaxie",pt:"galáxia",nl:"sterrenstelsel"},
  "univers":{en:"universe",it:"universo",es:"universo",de:"Universum",pt:"universo",nl:"heelal"},
  "étoile filante":{en:"shooting star",it:"stella cadente",es:"estrella fugaz",de:"Sternschnuppe",pt:"estrela cadente",nl:"vallende ster"},
  "ovni":{en:"UFO",it:"UFO",es:"ovni",de:"UFO",pt:"OVNI",nl:"ufo"},
  "extraterrestre":{en:"alien",it:"extraterrestre",es:"extraterrestre",de:"Außerirdischer",pt:"extraterrestre",nl:"buitenaards wezen"},
  "chimie":{en:"chemistry",it:"chimica",es:"química",de:"Chemie",pt:"química",nl:"scheikunde"},
  "physique":{en:"physics",it:"fisica",es:"física",de:"Physik",pt:"física",nl:"natuurkunde"},
  "biologie":{en:"biology",it:"biologia",es:"biología",de:"Biologie",pt:"biologia",nl:"biologie"},
  "laboratoire":{en:"laboratory",it:"laboratorio",es:"laboratorio",de:"Labor",pt:"laboratório",nl:"laboratorium"},
  "microscope":{en:"microscope",it:"microscopio",es:"microscopio",de:"Mikroskop",pt:"microscópio",nl:"microscoop"},
  "invention":{en:"invention",it:"invenzione",es:"invento",de:"Erfindung",pt:"invenção",nl:"uitvinding"},
  "découverte":{en:"discovery",it:"scoperta",es:"descubrimiento",de:"Entdeckung",pt:"descoberta",nl:"ontdekking"},
  "chercheur":{en:"researcher",it:"ricercatore",es:"investigador",de:"Forscher",pt:"investigador",nl:"onderzoeker"},
  "théorie":{en:"theory",it:"teoria",es:"teoría",de:"Theorie",pt:"teoria",nl:"theorie"},
  "cerveau":{en:"brain",it:"cervello",es:"cerebro",de:"Gehirn",pt:"cérebro",nl:"hersenen"},
  "tribunal":{en:"court",it:"tribunale",es:"tribunal",de:"Gericht",pt:"tribunal",nl:"rechtbank"},
  "juge":{en:"judge",it:"giudice",es:"juez",de:"Richter",pt:"juiz",nl:"rechter"},
  "procès":{en:"trial",it:"processo",es:"juicio",de:"Prozess",pt:"julgamento",nl:"proces"},
  "preuve":{en:"proof",it:"prova",es:"prueba",de:"Beweis",pt:"prova",nl:"bewijs"},
  "plainte":{en:"complaint",it:"denuncia",es:"denuncia",de:"Anzeige",pt:"queixa",nl:"klacht"},
  "coupable":{en:"guilty",it:"colpevole",es:"culpable",de:"schuldig",pt:"culpado",nl:"schuldig"},
  "innocent":{en:"innocent",it:"innocente",es:"inocente",de:"unschuldig",pt:"inocente",nl:"onschuldig"},
  "prison":{en:"prison",it:"prigione",es:"cárcel",de:"Gefängnis",pt:"prisão",nl:"gevangenis"},
  "amende":{en:"fine",it:"multa",es:"multa",de:"Geldstrafe",pt:"multa",nl:"boete"},
  "interdit":{en:"forbidden",it:"vietato",es:"prohibido",de:"verboten",pt:"proibido",nl:"verboden"},
  "couronne":{en:"crown",it:"corona",es:"corona",de:"Krone",pt:"coroa",nl:"kroon"},
  "trône":{en:"throne",it:"trono",es:"trono",de:"Thron",pt:"trono",nl:"troon"},
  "chevalier":{en:"knight",it:"cavaliere",es:"caballero",de:"Ritter",pt:"cavaleiro",nl:"ridder"},
  "héros":{en:"hero",it:"eroe",es:"héroe",de:"Held",pt:"herói",nl:"held"},
  "empire":{en:"empire",it:"impero",es:"imperio",de:"Imperium",pt:"império",nl:"keizerrijk"},
  "bataille":{en:"battle",it:"battaglia",es:"batalla",de:"Schlacht",pt:"batalha",nl:"veldslag"},
  "armée":{en:"army",it:"esercito",es:"ejército",de:"Armee",pt:"exército",nl:"leger"},
  "soldat":{en:"soldier",it:"soldato",es:"soldado",de:"Soldat",pt:"soldado",nl:"soldaat"},
  "révolution":{en:"revolution",it:"rivoluzione",es:"revolución",de:"Revolution",pt:"revolução",nl:"revolutie"},
  "épée":{en:"sword",it:"spada",es:"espada",de:"Schwert",pt:"espada",nl:"zwaard"},
  "bouclier":{en:"shield",it:"scudo",es:"escudo",de:"Schutzschild",pt:"escudo",nl:"schild"},
  "flèche":{en:"arrow",it:"freccia",es:"flecha",de:"Pfeil",pt:"seta",nl:"pijl"},
  "canon":{en:"cannon",it:"cannone",es:"cañón",de:"Kanone",pt:"canhão",nl:"kanon"},
  "moteur":{en:"engine",it:"motore",es:"motor",de:"Motor",pt:"motor",nl:"motor"},
  "frein":{en:"brake",it:"freno",es:"freno",de:"Bremse",pt:"travão",nl:"rem"},
  "pneu":{en:"tyre",it:"pneumatico",es:"neumático",de:"Reifen",pt:"pneu",nl:"band"},
  "volant":{en:"steering wheel",it:"volante",es:"volante",de:"Lenkrad",pt:"volante",nl:"stuur"},
  "coffre":{en:"boot",it:"bagagliaio",es:"maletero",de:"Kofferraum",pt:"mala do carro",nl:"kofferbak"},
  "capot":{en:"bonnet",it:"cofano",es:"capó",de:"Motorhaube",pt:"capot",nl:"motorkap"},
  "klaxon":{en:"horn",it:"clacson",es:"claxon",de:"Hupe",pt:"buzina",nl:"claxon"},
  "rétroviseur":{en:"rear-view mirror",it:"specchietto retrovisore",es:"retrovisor",de:"Rückspiegel",pt:"retrovisor",nl:"achteruitkijkspiegel"},
  "pare-brise":{en:"windscreen",it:"parabrezza",es:"parabrisas",de:"Windschutzscheibe",pt:"para-brisas",nl:"voorruit"},
  "essuie-glace":{en:"windscreen wiper",it:"tergicristallo",es:"limpiaparabrisas",de:"Scheibenwischer",pt:"limpa-para-brisas",nl:"ruitenwisser"},
  "embouteillage":{en:"traffic jam",it:"ingorgo",es:"atasco",de:"Stau",pt:"engarrafamento",nl:"file"},
  "panne":{en:"breakdown",it:"guasto",es:"avería",de:"Panne",pt:"avaria",nl:"pech"},
  "poumon":{en:"lung",it:"polmone",es:"pulmón",de:"Lunge",pt:"pulmão",nl:"long"},
  "estomac":{en:"stomach",it:"stomaco",es:"estómago",de:"Magen",pt:"estômago",nl:"maag"},
  "foie":{en:"liver",it:"fegato",es:"hígado",de:"Leber",pt:"fígado",nl:"lever"},
  "muscle":{en:"muscle",it:"muscolo",es:"músculo",de:"Muskel",pt:"músculo",nl:"spier"},
  "squelette":{en:"skeleton",it:"scheletro",es:"esqueleto",de:"Skelett",pt:"esqueleto",nl:"skelet"},
  "veine":{en:"vein",it:"vena",es:"vena",de:"Vene",pt:"veia",nl:"ader"},
  "côte":{en:"rib",it:"costola",es:"costilla",de:"Rippe",pt:"costela",nl:"rib"},
  "cheville":{en:"ankle",it:"caviglia",es:"tobillo",de:"Knöchel",pt:"tornozelo",nl:"enkel"},
  "poignet":{en:"wrist",it:"polso",es:"muñeca",de:"Handgelenk",pt:"pulso",nl:"pols"},
  "menton":{en:"chin",it:"mento",es:"barbilla",de:"Kinn",pt:"queixo",nl:"kin"},
  "hanche":{en:"hip",it:"anca",es:"cadera",de:"Hüfte",pt:"anca",nl:"heup"},
  "mollet":{en:"calf",it:"polpaccio",es:"pantorrilla",de:"Wade",pt:"barriga da perna",nl:"kuit"},
  "sourcil":{en:"eyebrow",it:"sopracciglio",es:"ceja",de:"Augenbraue",pt:"sobrancelha",nl:"wenkbrauw"},
  "cil":{en:"eyelash",it:"ciglio",es:"pestaña",de:"Wimper",pt:"pestana",nl:"wimper"},
  "paupière":{en:"eyelid",it:"palpebra",es:"párpado",de:"Augenlid",pt:"pálpebra",nl:"ooglid"},
  "nuque":{en:"nape",it:"nuca",es:"nuca",de:"Nacken",pt:"nuca",nl:"nek"},
  "paume":{en:"palm",it:"palmo",es:"palma",de:"Handfläche",pt:"palma da mão",nl:"handpalm"},
  "costume":{en:"suit",it:"completo",es:"traje",de:"Anzug",pt:"fato",nl:"pak"},
  "cravate":{en:"tie",it:"cravatta",es:"corbata",de:"Krawatte",pt:"gravata",nl:"stropdas"},
  "nœud papillon":{en:"bow tie",it:"papillon",es:"pajarita",de:"Fliege",pt:"laço",nl:"vlinderdas"},
  "gilet":{en:"waistcoat",it:"gilet",es:"chaleco",de:"Weste",pt:"colete",nl:"vest"},
  "imperméable":{en:"raincoat",it:"impermeabile",es:"impermeable",de:"Regenmantel",pt:"gabardina",nl:"regenjas"},
  "bretelles":{en:"braces",it:"bretelle",es:"tirantes",de:"Hosenträger",pt:"suspensórios",nl:"bretels"},
  "fermeture éclair":{en:"zip",it:"cerniera",es:"cremallera",de:"Reißverschluss",pt:"fecho",nl:"rits"},
  "talon":{en:"heel",it:"tacco",es:"tacón",de:"Absatz",pt:"salto",nl:"hak"},
  "semelle":{en:"sole",it:"suola",es:"suela",de:"Sohle",pt:"sola",nl:"zool"},
  "lacet":{en:"shoelace",it:"laccio",es:"cordón",de:"Schnürsenkel",pt:"atacador",nl:"veter"},
  "col":{en:"collar",it:"colletto",es:"cuello de camisa",de:"Kragen",pt:"colarinho",nl:"kraag"},
  "manche":{en:"sleeve",it:"manica",es:"manga",de:"Ärmel",pt:"manga",nl:"mouw"},
  "camping":{en:"camping",it:"campeggio",es:"camping",de:"Camping",pt:"campismo",nl:"kamperen"},
  "tente":{en:"tent",it:"tenda",es:"tienda de campaña",de:"Zelt",pt:"tenda",nl:"tent"},
  "sac de couchage":{en:"sleeping bag",it:"sacco a pelo",es:"saco de dormir",de:"Schlafsack",pt:"saco-cama",nl:"slaapzak"},
  "lampe de poche":{en:"torch",it:"torcia",es:"linterna",de:"Taschenlampe",pt:"lanterna",nl:"zaklamp"},
  "hamac":{en:"hammock",it:"amaca",es:"hamaca",de:"Hängematte",pt:"cama de rede",nl:"hangmat"},
  "randonnée":{en:"hike",it:"escursione",es:"senderismo",de:"Wanderung",pt:"caminhada",nl:"wandeling"},
  "chasse":{en:"hunting",it:"caccia",es:"caza",de:"Jagd",pt:"caça",nl:"jacht"},
  "boussole":{en:"compass",it:"bussola",es:"brújula",de:"Kompass",pt:"bússola",nl:"kompas"},
  "jumelles":{en:"binoculars",it:"binocolo",es:"prismáticos",de:"Fernglas",pt:"binóculos",nl:"verrekijker"},
  "feu de camp":{en:"campfire",it:"falò",es:"hoguera",de:"Lagerfeuer",pt:"fogueira",nl:"kampvuur"},
  "fouet":{en:"whisk",it:"frusta",es:"batidor",de:"Schneebesen",pt:"batedor de varas",nl:"garde"},
  "louche":{en:"ladle",it:"mestolo",es:"cucharón",de:"Schöpfkelle",pt:"concha de sopa",nl:"soeplepel"},
  "passoire":{en:"colander",it:"scolapasta",es:"colador",de:"Sieb",pt:"escorredor",nl:"vergiet"},
  "râpe":{en:"grater",it:"grattugia",es:"rallador",de:"Reibe",pt:"ralador",nl:"rasp"},
  "entonnoir":{en:"funnel",it:"imbuto",es:"embudo",de:"Trichter",pt:"funil",nl:"trechter"},
  "couvercle":{en:"lid",it:"coperchio",es:"tapa",de:"Deckel",pt:"tampa",nl:"deksel"},
  "bouchon":{en:"cork",it:"tappo",es:"corcho",de:"Korken",pt:"rolha",nl:"kurk"},
  "tire-bouchon":{en:"corkscrew",it:"cavatappi",es:"sacacorchos",de:"Korkenzieher",pt:"saca-rolhas",nl:"kurkentrekker"},
  "glaçon":{en:"ice cube",it:"cubetto di ghiaccio",es:"cubito de hielo",de:"Eiswürfel",pt:"cubo de gelo",nl:"ijsblokje"},
  "paille":{en:"straw",it:"cannuccia",es:"pajita",de:"Strohhalm",pt:"palhinha",nl:"rietje"},
  "plombier":{en:"plumber",it:"idraulico",es:"fontanero",de:"Klempner",pt:"canalizador",nl:"loodgieter"},
  "électricien":{en:"electrician",it:"elettricista",es:"electricista",de:"Elektriker",pt:"eletricista",nl:"elektricien"},
  "menuisier":{en:"carpenter",it:"falegname",es:"carpintero",de:"Tischler",pt:"carpinteiro",nl:"timmerman"},
  "bijoutier":{en:"jeweller",it:"gioielliere",es:"joyero",de:"Juwelier",pt:"joalheiro",nl:"juwelier"},
  "vétérinaire":{en:"vet",it:"veterinario",es:"veterinario",de:"Tierarzt",pt:"veterinário",nl:"dierenarts"},
  "pêcheur":{en:"fisherman",it:"pescatore",es:"pescador",de:"Fischer",pt:"pescador",nl:"visser"},
  "chauffeur":{en:"driver",it:"autista",es:"conductor",de:"Fahrer",pt:"motorista",nl:"chauffeur"},
  "fleuriste":{en:"florist",it:"fiorista",es:"florista",de:"Florist",pt:"florista",nl:"bloemist"},
  "orchestre":{en:"orchestra",it:"orchestra",es:"orquesta",de:"Orchester",pt:"orquestra",nl:"orkest"},
  "violon":{en:"violin",it:"violino",es:"violín",de:"Geige",pt:"violino",nl:"viool"},
  "flûte":{en:"flute",it:"flauto",es:"flauta",de:"Flöte",pt:"flauta",nl:"fluit"},
  "trompette":{en:"trumpet",it:"tromba",es:"trompeta",de:"Trompete",pt:"trompete",nl:"trompet"},
  "mélodie":{en:"melody",it:"melodia",es:"melodía",de:"Melodie",pt:"melodia",nl:"melodie"},
  "rythme":{en:"rhythm",it:"ritmo",es:"ritmo",de:"Rhythmus",pt:"ritmo",nl:"ritme"},
  "chorale":{en:"choir",it:"coro",es:"coro",de:"Chor",pt:"coro",nl:"koor"},
  "tambour":{en:"drum",it:"tamburo",es:"tambor",de:"Trommel",pt:"tambor",nl:"trommel"},
  "volcan":{en:"volcano",it:"vulcano",es:"volcán",de:"Vulkan",pt:"vulcão",nl:"vulkaan"},
  "inondation":{en:"flood",it:"alluvione",es:"inundación",de:"Überschwemmung",pt:"inundação",nl:"overstroming"},
  "tremblement de terre":{en:"earthquake",it:"terremoto",es:"terremoto",de:"Erdbeben",pt:"terramoto",nl:"aardbeving"},
  "avalanche":{en:"avalanche",it:"valanga",es:"avalancha",de:"Lawine",pt:"avalancha",nl:"lawine"},
  "canicule":{en:"heatwave",it:"ondata di caldo",es:"ola de calor",de:"Hitzewelle",pt:"onda de calor",nl:"hittegolf"},
  "continent":{en:"continent",it:"continente",es:"continente",de:"Kontinent",pt:"continente",nl:"continent"},
  "étonnant":{en:"surprising",it:"sorprendente",es:"sorprendente",de:"erstaunlich",pt:"surpreendente",nl:"verrassend"},
  "effrayant":{en:"frightening",it:"spaventoso",es:"aterrador",de:"erschreckend",pt:"assustador",nl:"beangstigend"},
  "passionnant":{en:"fascinating",it:"appassionante",es:"apasionante",de:"fesselnd",pt:"empolgante",nl:"boeiend"},
  "émouvant":{en:"moving",it:"commovente",es:"conmovedor",de:"ergreifend",pt:"comovente",nl:"ontroerend"},
  "précieux":{en:"precious",it:"prezioso",es:"precioso",de:"kostbar",pt:"precioso",nl:"kostbaar"},
  "semblable":{en:"similar",it:"simile",es:"parecido",de:"ähnlich",pt:"semelhante",nl:"vergelijkbaar"},
  "épuisant":{en:"exhausting",it:"estenuante",es:"agotador",de:"erschöpfend",pt:"exaustivo",nl:"uitputtend"},
  "décevant":{en:"disappointing",it:"deludente",es:"decepcionante",de:"enttäuschend",pt:"dececionante",nl:"teleurstellend"},
  "indispensable":{en:"essential",it:"indispensabile",es:"imprescindible",de:"unentbehrlich",pt:"indispensável",nl:"onmisbaar"},
  "disponible":{en:"available",it:"disponibile",es:"disponible",de:"verfügbar",pt:"disponível",nl:"beschikbaar"},
  "provisoire":{en:"temporary",it:"provvisorio",es:"provisional",de:"vorläufig",pt:"provisório",nl:"tijdelijk"},
  "détruire":{en:"to destroy",it:"distruggere",es:"destruir",de:"zerstören",pt:"destruir",nl:"vernietigen"},
  "creuser":{en:"to dig",it:"scavare",es:"cavar",de:"graben",pt:"cavar",nl:"graven"},
  "vider":{en:"to empty",it:"svuotare",es:"vaciar",de:"leeren",pt:"esvaziar",nl:"leegmaken"},
  "verrouiller":{en:"to lock",it:"chiudere a chiave",es:"cerrar con llave",de:"verriegeln",pt:"trancar",nl:"vergrendelen"},
  "brancher":{en:"to plug in",it:"collegare",es:"enchufar",de:"anschließen",pt:"ligar à corrente",nl:"aansluiten"},
  "débrancher":{en:"to unplug",it:"scollegare",es:"desenchufar",de:"ausstecken",pt:"desligar da corrente",nl:"loskoppelen"},
  "appuyer":{en:"to press",it:"premere",es:"pulsar",de:"drücken",pt:"carregar",nl:"drukken"},
  "secouer":{en:"to shake",it:"scuotere",es:"sacudir",de:"schütteln",pt:"sacudir",nl:"schudden"},
  "frotter":{en:"to rub",it:"strofinare",es:"frotar",de:"reiben",pt:"esfregar",nl:"wrijven"},
  "essuyer":{en:"to wipe",it:"asciugare",es:"secar",de:"abwischen",pt:"enxugar",nl:"afvegen"},
  "plonger":{en:"to dive",it:"tuffarsi",es:"bucear",de:"tauchen",pt:"mergulhar",nl:"duiken"},
  "ramer":{en:"to row",it:"remare",es:"remar",de:"rudern",pt:"remar",nl:"roeien"},
  "autrefois":{en:"in the past",it:"un tempo",es:"antiguamente",de:"früher",pt:"antigamente",nl:"vroeger"},
  "récemment":{en:"recently",it:"recentemente",es:"recientemente",de:"kürzlich",pt:"recentemente",nl:"onlangs"},
  "désormais":{en:"from now on",it:"d'ora in poi",es:"a partir de ahora",de:"von nun an",pt:"doravante",nl:"voortaan"},
  "auparavant":{en:"beforehand",it:"in precedenza",es:"anteriormente",de:"zuvor",pt:"anteriormente",nl:"voordien"},
  "à l'avenir":{en:"in the future",it:"in futuro",es:"en el futuro",de:"in Zukunft",pt:"no futuro",nl:"in de toekomst"},
  "aussitôt":{en:"at once",it:"immediatamente",es:"de inmediato",de:"sogleich",pt:"imediatamente",nl:"onmiddellijk"},
  "tout à coup":{en:"suddenly",it:"all'improvviso",es:"de repente",de:"plötzlich",pt:"de repente",nl:"plotseling"},
  "dès que":{en:"as soon as",it:"non appena",es:"en cuanto",de:"sobald",pt:"assim que",nl:"zodra"},
  "bon courage":{en:"hang in there",it:"coraggio",es:"ánimo",de:"Kopf hoch",pt:"força",nl:"sterkte"},
  "tant pis":{en:"too bad",it:"pazienza",es:"tanto peor",de:"Pech gehabt",pt:"paciência",nl:"jammer dan"},
  "tant mieux":{en:"so much the better",it:"tanto meglio",es:"tanto mejor",de:"umso besser",pt:"ainda bem",nl:"des te beter"},
  "ça m'est égal":{en:"I don't mind",it:"per me è uguale",es:"me da igual",de:"das ist mir egal",pt:"tanto faz",nl:"het maakt mij niet uit"},
  "pas de souci":{en:"no worries",it:"nessun problema",es:"sin problema",de:"kein Problem",pt:"sem problema",nl:"geen probleem"},
  "quel dommage":{en:"what a pity",it:"che peccato",es:"qué pena",de:"wie schade",pt:"que pena",nl:"wat jammer"},
  "à ta santé":{en:"cheers",it:"salute",es:"salud",de:"zum Wohl",pt:"à tua saúde",nl:"proost"},
  "en route":{en:"on the way",it:"in cammino",es:"en camino",de:"unterwegs",pt:"a caminho",nl:"onderweg"},
  "il était une fois":{en:"once upon a time",it:"c'era una volta",es:"érase una vez",de:"es war einmal",pt:"era uma vez",nl:"er was eens"},
  "bonne chance pour ton examen":{en:"good luck with your exam",it:"in bocca al lupo per l'esame",es:"buena suerte con tu examen",de:"viel Glück bei deiner Prüfung",pt:"boa sorte para o teu exame",nl:"veel succes met je examen"},
  "je croise les doigts":{en:"I'm crossing my fingers",it:"incrocio le dita",es:"cruzo los dedos",de:"ich drücke dir die Daumen",pt:"faço figas",nl:"ik duim voor je"},
  "au secours":{en:"help",it:"aiuto",es:"auxilio",de:"Hilfe",pt:"acudam",nl:"help"},
  "en cas d'urgence, appelez la police":{en:"in an emergency, call the police",it:"in caso di emergenza, chiamate la polizia",es:"en caso de emergencia, llame a la policía",de:"im Notfall rufen Sie die Polizei",pt:"em caso de emergência, chame a polícia",nl:"bel in geval van nood de politie"}
};
CURRICULUM_R.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV8).forEach(function(k){ if(NEWV8[k][l]) LEX[l][k]=NEWV8[k][l]; }); });

/* --- EXTENSION v2.64 (vague 8 — cap B2) : 11 unités — économie, vie citoyenne, planète,
   grandes idées, littérature, verbes de haut niveau, santé approfondie, sentiments fins,
   caractères trempés, bureau, médias. Parité garantie (NEWV9). Portugais EUROPÉEN toujours :
   presidente da câmara, volume de negócios, desflorestação, ozono, equacionar, perfecionista,
   ata, saudade, estou farto, podes contar comigo. --- */
var CURRICULUM_Q = [
  { t:"L'économie 💰", c:"#34d399", L:[
    { t:"Les comptes", w:["bénéfice","perte","budget","taxe","chiffre d'affaires","bilan"], p:[] },
    { t:"Monter sa boîte", w:["investir","croissance","concurrence","fournisseur","actionnaire"], p:[] },
    { t:"Les coups durs", w:["crise","faillite","endettement","négocier"], p:[] } ]},
  { t:"La vie citoyenne 🗳", c:"#94a3b8", L:[
    { t:"La démocratie", w:["citoyen","démocratie","vote","campagne électorale","débat","discours politique"], p:[] },
    { t:"Les élus", w:["ministre","maire","député","syndicat"], p:[] },
    { t:"Se faire entendre", w:["égalité","injustice","manifestation","grève"], p:[] } ]},
  { t:"Protéger la planète 🌍", c:"#4ade80", L:[
    { t:"Les énergies", w:["pétrole","panneau solaire","éolienne","centrale nucléaire","empreinte carbone"], p:[] },
    { t:"Les bons gestes", w:["recyclage","trier","gaspiller","ordures"], p:["il vaut mieux prévenir que guérir"] },
    { t:"La nature en danger", w:["réchauffement","biodiversité","déforestation","couche d'ozone","espèce menacée"], p:[] } ]},
  { t:"Les grandes idées 💭", c:"#c084fc", L:[
    { t:"Les forces de l'âme", w:["courage","patience","sagesse","volonté","conscience","sincérité"], p:[] },
    { t:"Les zones d'ombre", w:["désespoir","folie","doute","humiliation","orgueil","remords"], p:[] },
    { t:"Le fil de la vie", w:["fierté","destin","hasard","soupçon"], p:[] } ]},
  { t:"La littérature 📚", c:"#fbbf24", L:[
    { t:"Écrire un livre", w:["roman","chapitre","personnage","intrigue","dénouement","récit"], p:[] },
    { t:"Vers et rimes", w:["poème","poésie","conte","traduction"], p:[] },
    { t:"Le monde du livre", w:["éditeur","librairie","publier","sous-titres"], p:[] } ]},
  { t:"Verbes de haut niveau 🛠", c:"#60a5fa", L:[
    { t:"Aller au bout", w:["accomplir","entreprendre","aboutir","renoncer","surmonter"], p:["tu peux compter sur moi"] },
    { t:"Peser ses mots", w:["envisager","constater","souligner","prétendre","admettre"], p:[] },
    { t:"Tenir bon", w:["exiger","négliger","aborder","persuader"], p:["ça n'a rien à voir"] } ]},
  { t:"La santé approfondie 🩺", c:"#f87171", L:[
    { t:"Chez le spécialiste", w:["consultation","symptôme","diagnostic","traitement"], p:[] },
    { t:"Se défendre", w:["allergie","vaccination","immunité","microbe","contagieux"], p:[] },
    { t:"Se remettre", w:["régime","vitamines","épidémie","guérison","rechute"], p:[] } ]},
  { t:"Les sentiments fins 💓", c:"#f472b6", L:[
    { t:"Ce qui apaise", w:["soulagement","admiration","enthousiasme","compassion","nostalgie"], p:[] },
    { t:"Ce qui ronge", w:["inquiétude","angoisse","méfiance","frustration"], p:["j'en ai marre"] },
    { t:"Entre les deux", w:["mépris","gêne","indifférence"], p:[] } ]},
  { t:"Caractères trempés 🎭", c:"#fb923c", L:[
    { t:"Fonceurs", w:["ambitieux","audacieux","loyal","perfectionniste","insouciant"], p:[] },
    { t:"À double face", w:["arrogant","humble","hypocrite","rancunier","indulgent"], p:[] } ]},
  { t:"Au bureau 💼", c:"#818cf8", L:[
    { t:"La journée de travail", w:["ordre du jour","échéance","objectif","tâche","responsabilité","procès-verbal"], p:[] },
    { t:"La vie de l'équipe", w:["congé","télétravail","démission","recrutement","entretien d'embauche"], p:["ce n'est pas la peine"] } ]},
  { t:"Les médias 📰", c:"#22d3ee", L:[
    { t:"La une", w:["reportage","interview","gros titre","rédaction"], p:[] },
    { t:"L'opinion", w:["rumeur","scandale","censure","sondage"], p:[] } ]}
];
var NEWV9 = {
  "bénéfice":{en:"profit",it:"profitto",es:"beneficio",de:"Gewinn",pt:"lucro",nl:"winst"},
  "perte":{en:"loss",it:"perdita",es:"pérdida",de:"Verlust",pt:"prejuízo",nl:"verlies"},
  "budget":{en:"budget",it:"budget",es:"presupuesto",de:"Budget",pt:"orçamento",nl:"budget"},
  "taxe":{en:"tax",it:"tassa",es:"tasa",de:"Steuer",pt:"taxa",nl:"belasting"},
  "chiffre d'affaires":{en:"turnover",it:"fatturato",es:"facturación",de:"Umsatz",pt:"volume de negócios",nl:"omzet"},
  "bilan":{en:"balance sheet",it:"bilancio",es:"balance",de:"Bilanz",pt:"balanço",nl:"balans"},
  "investir":{en:"to invest",it:"investire",es:"invertir",de:"investieren",pt:"investir",nl:"investeren"},
  "croissance":{en:"growth",it:"crescita",es:"crecimiento",de:"Wachstum",pt:"crescimento",nl:"groei"},
  "concurrence":{en:"competition",it:"concorrenza",es:"rivalidad",de:"Konkurrenz",pt:"concorrência",nl:"concurrentie"},
  "fournisseur":{en:"supplier",it:"fornitore",es:"proveedor",de:"Lieferant",pt:"fornecedor",nl:"leverancier"},
  "actionnaire":{en:"shareholder",it:"azionista",es:"accionista",de:"Aktionär",pt:"acionista",nl:"aandeelhouder"},
  "crise":{en:"crisis",it:"crisi",es:"crisis",de:"Krise",pt:"crise",nl:"crisis"},
  "faillite":{en:"bankruptcy",it:"fallimento",es:"quiebra",de:"Konkurs",pt:"falência",nl:"faillissement"},
  "endettement":{en:"indebtedness",it:"indebitamento",es:"endeudamiento",de:"Verschuldung",pt:"endividamento",nl:"schuldenlast"},
  "négocier":{en:"to negotiate",it:"negoziare",es:"negociar",de:"verhandeln",pt:"negociar",nl:"onderhandelen"},
  "citoyen":{en:"citizen",it:"cittadino",es:"ciudadano",de:"Bürger",pt:"cidadão",nl:"burger"},
  "démocratie":{en:"democracy",it:"democrazia",es:"democracia",de:"Demokratie",pt:"democracia",nl:"democratie"},
  "vote":{en:"vote",it:"voto",es:"voto",de:"Abstimmung",pt:"voto",nl:"stem"},
  "campagne électorale":{en:"election campaign",it:"campagna elettorale",es:"campaña electoral",de:"Wahlkampf",pt:"campanha eleitoral",nl:"verkiezingscampagne"},
  "débat":{en:"debate",it:"dibattito",es:"debate",de:"Debatte",pt:"debate",nl:"debat"},
  "discours politique":{en:"political speech",it:"discorso politico",es:"discurso político",de:"politische Rede",pt:"discurso político",nl:"politieke toespraak"},
  "ministre":{en:"minister",it:"ministro",es:"ministro",de:"Minister",pt:"ministro",nl:"minister"},
  "maire":{en:"mayor",it:"sindaco",es:"alcalde",de:"Bürgermeister",pt:"presidente da câmara",nl:"burgemeester"},
  "député":{en:"member of parliament",it:"deputato",es:"diputado",de:"Abgeordneter",pt:"deputado",nl:"parlementslid"},
  "syndicat":{en:"trade union",it:"sindacato",es:"sindicato",de:"Gewerkschaft",pt:"sindicato",nl:"vakbond"},
  "égalité":{en:"equality",it:"uguaglianza",es:"igualdad",de:"Gleichheit",pt:"igualdade",nl:"gelijkheid"},
  "injustice":{en:"injustice",it:"ingiustizia",es:"injusticia",de:"Ungerechtigkeit",pt:"injustiça",nl:"onrecht"},
  "manifestation":{en:"demonstration",it:"manifestazione",es:"manifestación",de:"Demonstration",pt:"manifestação",nl:"betoging"},
  "grève":{en:"strike",it:"sciopero",es:"huelga",de:"Streik",pt:"greve",nl:"staking"},
  "pétrole":{en:"oil",it:"petrolio",es:"petróleo",de:"Erdöl",pt:"petróleo",nl:"aardolie"},
  "panneau solaire":{en:"solar panel",it:"pannello solare",es:"panel solar",de:"Solarpanel",pt:"painel solar",nl:"zonnepaneel"},
  "éolienne":{en:"wind turbine",it:"turbina eolica",es:"aerogenerador",de:"Windrad",pt:"turbina eólica",nl:"windmolen"},
  "centrale nucléaire":{en:"nuclear power plant",it:"centrale nucleare",es:"central nuclear",de:"Atomkraftwerk",pt:"central nuclear",nl:"kerncentrale"},
  "empreinte carbone":{en:"carbon footprint",it:"impronta di carbonio",es:"huella de carbono",de:"CO2-Fußabdruck",pt:"pegada de carbono",nl:"CO2-voetafdruk"},
  "recyclage":{en:"recycling",it:"riciclaggio",es:"reciclaje",de:"Recycling",pt:"reciclagem",nl:"recycling"},
  "trier":{en:"to sort",it:"smistare",es:"clasificar",de:"sortieren",pt:"triar",nl:"sorteren"},
  "gaspiller":{en:"to waste",it:"sprecare",es:"desperdiciar",de:"verschwenden",pt:"desperdiçar",nl:"verspillen"},
  "ordures":{en:"rubbish",it:"spazzatura",es:"basura",de:"Müll",pt:"lixo",nl:"afval"},
  "réchauffement":{en:"global warming",it:"riscaldamento globale",es:"calentamiento global",de:"Erderwärmung",pt:"aquecimento global",nl:"opwarming van de aarde"},
  "biodiversité":{en:"biodiversity",it:"biodiversità",es:"biodiversidad",de:"Artenvielfalt",pt:"biodiversidade",nl:"biodiversiteit"},
  "déforestation":{en:"deforestation",it:"deforestazione",es:"deforestación",de:"Abholzung",pt:"desflorestação",nl:"ontbossing"},
  "couche d'ozone":{en:"ozone layer",it:"strato di ozono",es:"capa de ozono",de:"Ozonschicht",pt:"camada de ozono",nl:"ozonlaag"},
  "espèce menacée":{en:"endangered species",it:"specie a rischio",es:"especie en peligro",de:"bedrohte Art",pt:"espécie ameaçada",nl:"bedreigde diersoort"},
  "courage":{en:"courage",it:"coraggio",es:"valentía",de:"Mut",pt:"coragem",nl:"moed"},
  "patience":{en:"patience",it:"pazienza",es:"paciencia",de:"Geduld",pt:"paciência",nl:"geduld"},
  "sagesse":{en:"wisdom",it:"saggezza",es:"sabiduría",de:"Weisheit",pt:"sabedoria",nl:"wijsheid"},
  "volonté":{en:"willpower",it:"volontà",es:"voluntad",de:"Wille",pt:"vontade",nl:"wilskracht"},
  "conscience":{en:"conscience",it:"coscienza",es:"conciencia",de:"Gewissen",pt:"consciência",nl:"geweten"},
  "sincérité":{en:"sincerity",it:"sincerità",es:"sinceridad",de:"Aufrichtigkeit",pt:"sinceridade",nl:"oprechtheid"},
  "désespoir":{en:"despair",it:"disperazione",es:"desesperación",de:"Verzweiflung",pt:"desespero",nl:"wanhoop"},
  "folie":{en:"madness",it:"follia",es:"locura",de:"Wahnsinn",pt:"loucura",nl:"waanzin"},
  "doute":{en:"doubt",it:"dubbio",es:"duda",de:"Zweifel",pt:"dúvida",nl:"twijfel"},
  "humiliation":{en:"humiliation",it:"umiliazione",es:"humillación",de:"Demütigung",pt:"humilhação",nl:"vernedering"},
  "orgueil":{en:"hubris",it:"superbia",es:"soberbia",de:"Hochmut",pt:"soberba",nl:"hoogmoed"},
  "remords":{en:"remorse",it:"rimorso",es:"remordimiento",de:"Reue",pt:"remorso",nl:"wroeging"},
  "fierté":{en:"pride",it:"fierezza",es:"orgullo",de:"Stolz",pt:"orgulho",nl:"trots"},
  "destin":{en:"fate",it:"destino",es:"destino",de:"Schicksal",pt:"destino",nl:"lot"},
  "hasard":{en:"chance",it:"caso",es:"casualidad",de:"Zufall",pt:"acaso",nl:"toeval"},
  "soupçon":{en:"suspicion",it:"sospetto",es:"sospecha",de:"Verdacht",pt:"suspeita",nl:"verdenking"},
  "roman":{en:"novel",it:"romanzo",es:"novela",de:"Roman",pt:"romance",nl:"roman"},
  "chapitre":{en:"chapter",it:"capitolo",es:"capítulo",de:"Kapitel",pt:"capítulo",nl:"hoofdstuk"},
  "personnage":{en:"character",it:"personaggio",es:"personaje",de:"Figur",pt:"personagem",nl:"personage"},
  "intrigue":{en:"plot",it:"trama",es:"trama",de:"Handlung",pt:"enredo",nl:"plot"},
  "dénouement":{en:"ending",it:"epilogo",es:"desenlace",de:"Auflösung",pt:"desfecho",nl:"ontknoping"},
  "récit":{en:"tale",it:"racconto",es:"relato",de:"Erzählung",pt:"narrativa",nl:"vertelling"},
  "poème":{en:"poem",it:"poema",es:"poema",de:"Gedicht",pt:"poema",nl:"gedicht"},
  "poésie":{en:"poetry",it:"poesia",es:"poesía",de:"Dichtung",pt:"poesia",nl:"poëzie"},
  "conte":{en:"fairy tale",it:"fiaba",es:"cuento",de:"Märchen",pt:"conto",nl:"sprookje"},
  "traduction":{en:"translation",it:"traduzione",es:"traducción",de:"Übersetzung",pt:"tradução",nl:"vertaling"},
  "éditeur":{en:"publisher",it:"editore",es:"editor",de:"Verleger",pt:"editor",nl:"uitgever"},
  "librairie":{en:"bookshop",it:"libreria",es:"librería",de:"Buchhandlung",pt:"livraria",nl:"boekhandel"},
  "publier":{en:"to publish",it:"pubblicare",es:"publicar",de:"veröffentlichen",pt:"publicar",nl:"publiceren"},
  "sous-titres":{en:"subtitles",it:"sottotitoli",es:"subtítulos",de:"Untertitel",pt:"legendas",nl:"ondertitels"},
  "accomplir":{en:"to accomplish",it:"compiere",es:"cumplir",de:"vollbringen",pt:"cumprir",nl:"volbrengen"},
  "entreprendre":{en:"to undertake",it:"intraprendere",es:"emprender",de:"unternehmen",pt:"empreender",nl:"ondernemen"},
  "aboutir":{en:"to come to fruition",it:"andare in porto",es:"culminar",de:"münden",pt:"chegar a bom porto",nl:"uitmonden"},
  "renoncer":{en:"to give up",it:"rinunciare",es:"renunciar",de:"verzichten",pt:"renunciar",nl:"afzien"},
  "surmonter":{en:"to overcome",it:"superare",es:"superar",de:"überwinden",pt:"superar",nl:"overwinnen"},
  "envisager":{en:"to consider",it:"considerare",es:"plantearse",de:"in Betracht ziehen",pt:"equacionar",nl:"overwegen"},
  "constater":{en:"to note",it:"constatare",es:"constatar",de:"feststellen",pt:"constatar",nl:"vaststellen"},
  "souligner":{en:"to underline",it:"sottolineare",es:"subrayar",de:"unterstreichen",pt:"sublinhar",nl:"onderstrepen"},
  "prétendre":{en:"to claim",it:"sostenere",es:"alegar",de:"behaupten",pt:"alegar",nl:"beweren"},
  "admettre":{en:"to admit",it:"ammettere",es:"admitir",de:"zugeben",pt:"admitir",nl:"toegeven"},
  "exiger":{en:"to require",it:"esigere",es:"exigir",de:"verlangen",pt:"exigir",nl:"vereisen"},
  "négliger":{en:"to neglect",it:"trascurare",es:"descuidar",de:"vernachlässigen",pt:"negligenciar",nl:"verwaarlozen"},
  "aborder":{en:"to tackle",it:"affrontare",es:"abordar",de:"angehen",pt:"abordar",nl:"aanpakken"},
  "persuader":{en:"to persuade",it:"persuadere",es:"persuadir",de:"überreden",pt:"persuadir",nl:"overhalen"},
  "consultation":{en:"consultation",it:"visita medica",es:"consulta",de:"Sprechstunde",pt:"consulta",nl:"consult"},
  "symptôme":{en:"symptom",it:"sintomo",es:"síntoma",de:"Symptom",pt:"sintoma",nl:"symptoom"},
  "diagnostic":{en:"diagnosis",it:"diagnosi",es:"diagnóstico",de:"Diagnose",pt:"diagnóstico",nl:"diagnose"},
  "traitement":{en:"treatment",it:"trattamento",es:"tratamiento",de:"Behandlung",pt:"tratamento",nl:"behandeling"},
  "allergie":{en:"allergy",it:"allergia",es:"alergia",de:"Allergie",pt:"alergia",nl:"allergie"},
  "vaccination":{en:"vaccination",it:"vaccinazione",es:"vacunación",de:"Impfung",pt:"vacinação",nl:"vaccinatie"},
  "immunité":{en:"immunity",it:"immunità",es:"inmunidad",de:"Immunität",pt:"imunidade",nl:"immuniteit"},
  "microbe":{en:"germ",it:"microbo",es:"microbio",de:"Keim",pt:"micróbio",nl:"ziektekiem"},
  "contagieux":{en:"contagious",it:"contagioso",es:"contagioso",de:"ansteckend",pt:"contagioso",nl:"besmettelijk"},
  "régime":{en:"diet",it:"dieta",es:"dieta",de:"Diät",pt:"dieta",nl:"dieet"},
  "vitamines":{en:"vitamins",it:"vitamine",es:"vitaminas",de:"Vitamine",pt:"vitaminas",nl:"vitamines"},
  "épidémie":{en:"epidemic",it:"epidemia",es:"epidemia",de:"Epidemie",pt:"epidemia",nl:"epidemie"},
  "guérison":{en:"recovery",it:"guarigione",es:"curación",de:"Heilung",pt:"cura",nl:"genezing"},
  "rechute":{en:"relapse",it:"ricaduta",es:"recaída",de:"Rückfall",pt:"recaída",nl:"terugval"},
  "soulagement":{en:"relief",it:"sollievo",es:"alivio",de:"Erleichterung",pt:"alívio",nl:"opluchting"},
  "admiration":{en:"admiration",it:"ammirazione",es:"admiración",de:"Bewunderung",pt:"admiração",nl:"bewondering"},
  "enthousiasme":{en:"enthusiasm",it:"entusiasmo",es:"entusiasmo",de:"Begeisterung",pt:"entusiasmo",nl:"enthousiasme"},
  "compassion":{en:"compassion",it:"compassione",es:"compasión",de:"Mitgefühl",pt:"compaixão",nl:"medeleven"},
  "nostalgie":{en:"nostalgia",it:"nostalgia",es:"nostalgia",de:"Wehmut",pt:"saudade",nl:"weemoed"},
  "inquiétude":{en:"worry",it:"preoccupazione",es:"preocupación",de:"Sorge",pt:"preocupação",nl:"bezorgdheid"},
  "angoisse":{en:"anxiety",it:"angoscia",es:"angustia",de:"Beklemmung",pt:"angústia",nl:"beklemming"},
  "méfiance":{en:"distrust",it:"diffidenza",es:"desconfianza",de:"Misstrauen",pt:"desconfiança",nl:"wantrouwen"},
  "frustration":{en:"frustration",it:"frustrazione",es:"frustración",de:"Frustration",pt:"frustração",nl:"frustratie"},
  "mépris":{en:"contempt",it:"disprezzo",es:"desprecio",de:"Verachtung",pt:"desprezo",nl:"minachting"},
  "gêne":{en:"embarrassment",it:"imbarazzo",es:"incomodidad",de:"Verlegenheit",pt:"embaraço",nl:"ongemak"},
  "indifférence":{en:"indifference",it:"indifferenza",es:"indiferencia",de:"Gleichgültigkeit",pt:"indiferença",nl:"onverschilligheid"},
  "ambitieux":{en:"ambitious",it:"ambizioso",es:"ambicioso",de:"ehrgeizig",pt:"ambicioso",nl:"ambitieus"},
  "audacieux":{en:"daring",it:"audace",es:"audaz",de:"kühn",pt:"ousado",nl:"stoutmoedig"},
  "loyal":{en:"loyal",it:"leale",es:"leal",de:"loyal",pt:"leal",nl:"loyaal"},
  "perfectionniste":{en:"perfectionist",it:"perfezionista",es:"perfeccionista",de:"Perfektionist",pt:"perfecionista",nl:"perfectionist"},
  "insouciant":{en:"carefree",it:"spensierato",es:"despreocupado",de:"unbekümmert",pt:"despreocupado",nl:"zorgeloos"},
  "arrogant":{en:"arrogant",it:"arrogante",es:"arrogante",de:"arrogant",pt:"arrogante",nl:"arrogant"},
  "humble":{en:"humble",it:"umile",es:"humilde",de:"demütig",pt:"humilde",nl:"nederig"},
  "hypocrite":{en:"hypocritical",it:"ipocrita",es:"hipócrita",de:"heuchlerisch",pt:"hipócrita",nl:"hypocriet"},
  "rancunier":{en:"resentful",it:"rancoroso",es:"rencoroso",de:"nachtragend",pt:"rancoroso",nl:"haatdragend"},
  "indulgent":{en:"lenient",it:"indulgente",es:"indulgente",de:"nachsichtig",pt:"indulgente",nl:"toegeeflijk"},
  "ordre du jour":{en:"agenda",it:"ordine del giorno",es:"orden del día",de:"Tagesordnung",pt:"ordem do dia",nl:"agenda"},
  "échéance":{en:"deadline",it:"scadenza",es:"plazo",de:"Frist",pt:"prazo",nl:"termijn"},
  "objectif":{en:"objective",it:"obiettivo",es:"objetivo",de:"Ziel",pt:"objetivo",nl:"doelstelling"},
  "tâche":{en:"task",it:"compito",es:"tarea",de:"Aufgabe",pt:"tarefa",nl:"taak"},
  "responsabilité":{en:"responsibility",it:"responsabilità",es:"responsabilidad",de:"Verantwortung",pt:"responsabilidade",nl:"verantwoordelijkheid"},
  "procès-verbal":{en:"minutes",it:"verbale",es:"acta",de:"Protokoll",pt:"ata",nl:"notulen"},
  "congé":{en:"leave",it:"congedo",es:"permiso",de:"Freistellung",pt:"folga",nl:"verlof"},
  "télétravail":{en:"remote working",it:"telelavoro",es:"teletrabajo",de:"Homeoffice",pt:"teletrabalho",nl:"thuiswerken"},
  "démission":{en:"resignation",it:"dimissioni",es:"dimisión",de:"Kündigung",pt:"demissão",nl:"ontslagname"},
  "recrutement":{en:"recruitment",it:"reclutamento",es:"contratación",de:"Rekrutierung",pt:"recrutamento",nl:"werving"},
  "entretien d'embauche":{en:"job interview",it:"colloquio di lavoro",es:"entrevista de trabajo",de:"Vorstellungsgespräch",pt:"entrevista de emprego",nl:"sollicitatiegesprek"},
  "reportage":{en:"news report",it:"reportage",es:"reportaje",de:"Reportage",pt:"reportagem",nl:"reportage"},
  "interview":{en:"interview",it:"intervista",es:"entrevista",de:"Interview",pt:"entrevista",nl:"interview"},
  "gros titre":{en:"headline",it:"titolo principale",es:"titular",de:"Schlagzeile",pt:"manchete",nl:"krantenkop"},
  "rédaction":{en:"editorial team",it:"redazione",es:"redacción",de:"Redaktion",pt:"redação",nl:"redactie"},
  "rumeur":{en:"rumour",it:"diceria",es:"rumor",de:"Gerücht",pt:"boato",nl:"gerucht"},
  "scandale":{en:"scandal",it:"scandalo",es:"escándalo",de:"Skandal",pt:"escândalo",nl:"schandaal"},
  "censure":{en:"censorship",it:"censura",es:"censura",de:"Zensur",pt:"censura",nl:"censuur"},
  "sondage":{en:"poll",it:"sondaggio",es:"encuesta",de:"Umfrage",pt:"sondagem",nl:"peiling"},
  "il vaut mieux prévenir que guérir":{en:"prevention is better than cure",it:"prevenire è meglio che curare",es:"más vale prevenir que curar",de:"Vorbeugen ist besser als Heilen",pt:"mais vale prevenir do que remediar",nl:"voorkomen is beter dan genezen"},
  "ce n'est pas la peine":{en:"there's no need",it:"non serve",es:"no hace falta",de:"das ist nicht nötig",pt:"não é preciso",nl:"dat hoeft niet"},
  "j'en ai marre":{en:"I'm fed up",it:"non ne posso più",es:"estoy harto",de:"ich habe es satt",pt:"estou farto",nl:"ik ben het zat"},
  "ça n'a rien à voir":{en:"that has nothing to do with it",it:"non c'entra niente",es:"no tiene nada que ver",de:"das hat nichts damit zu tun",pt:"não tem nada a ver",nl:"dat heeft er niets mee te maken"},
  "tu peux compter sur moi":{en:"you can count on me",it:"puoi contare su di me",es:"puedes contar conmigo",de:"du kannst auf mich zählen",pt:"podes contar comigo",nl:"je kunt op mij rekenen"}
};
CURRICULUM_Q.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV9).forEach(function(k){ if(NEWV9[k][l]) LEX[l][k]=NEWV9[k][l]; }); });

/* --- EXTENSION v2.65 (vague 9 — cap B2) : 11 unités — banque, numérique, chantier, enquête,
   international, cuisine du chef, adjectifs de précision, connecteurs soutenus, sciences,
   logement/droit, expressions imagées. Parité garantie (NEWV10). Portugais EUROPÉEN toujours :
   ecrã tátil, betão, burla, portagem, cozedura, lume brando, numerário, conta da luz. --- */
var CURRICULUM_P = [
  { t:"À la banque 🏦", c:"#34d399", L:[
    { t:"Les opérations", w:["virement","prélèvement","intérêts","taux","devise"], p:[] },
    { t:"Gérer son argent", w:["hypothèque","livret d'épargne","chéquier","espèces","facture d'électricité"], p:[] } ]},
  { t:"Le numérique avancé 💻", c:"#60a5fa", L:[
    { t:"Machines et programmes", w:["intelligence artificielle","données","logiciel","matériel","sauvegarde","mise à jour"], p:[] },
    { t:"Le côté obscur", w:["piratage","virus informatique","écran tactile","objet connecté","réseau social"], p:[] } ]},
  { t:"Le grand chantier 🏗", c:"#fb923c", L:[
    { t:"Bâtir haut", w:["gratte-ciel","béton","brique","grue","échafaudage"], p:[] },
    { t:"De la cave au toit", w:["fondations","charpente","façade","toiture","permis de construire"], p:[] } ]},
  { t:"Enquête policière 🕵️", c:"#94a3b8", L:[
    { t:"Sur les lieux", w:["enquête","indice","suspect","témoignage","empreintes digitales","alibi"], p:[] },
    { t:"Le dossier s'épaissit", w:["cambriolage","agression","escroquerie","interrogatoire","menottes","rançon"], p:[] } ]},
  { t:"La scène internationale 🌐", c:"#818cf8", L:[
    { t:"La diplomatie", w:["ambassade","consulat","traité","diplomatie","cessez-le-feu"], p:[] },
    { t:"Un monde en mouvement", w:["réfugié","immigration","émigration","mondialisation","aide humanitaire"], p:[] } ]},
  { t:"Les secrets du chef 👨‍🍳", c:"#f59e0b", L:[
    { t:"Préparer", w:["assaisonner","éplucher","mariner","pétrir","levure"], p:[] },
    { t:"Cuire doucement", w:["mijoter","cuisson","garniture","épices","herbes aromatiques"], p:[] } ]},
  { t:"Adjectifs de précision ✨", c:"#fbbf24", L:[
    { t:"Le travail bien fait", w:["rentable","fiable","exigeant","soigneux","rigoureux","approfondi"], p:[] },
    { t:"Nuances de matière", w:["négligent","souple","rigide","robuste","durable","superficiel"], p:[] } ]},
  { t:"Connecteurs soutenus 🔗", c:"#94a3b8", L:[
    { t:"Nuancer sa pensée", w:["néanmoins","toutefois","en revanche","par conséquent","d'autant plus","en outre"], p:[] },
    { t:"Articuler son discours", w:["quant à","faute de","à condition que","bien que","afin de","tandis que"], p:[] } ]},
  { t:"Au microscope 🔬", c:"#22d3ee", L:[
    { t:"L'infiniment petit", w:["cellule","gène","ADN","molécule","atome"], p:[] },
    { t:"La démarche scientifique", w:["évolution","échantillon","hypothèse","démonstration","éprouvette"], p:[] } ]},
  { t:"Logement et droit 🏠", c:"#a78bfa", L:[
    { t:"Louer et posséder", w:["locataire","propriétaire","bail","caution","assurance","héritage"], p:[] },
    { t:"Sur la route aussi", w:["testament","notaire","péage","covoiturage","contravention","stationnement"], p:[] } ]},
  { t:"Expressions imagées 💬", c:"#f472b6", L:[
    { t:"Comme un natif", w:["ça saute aux yeux","il n'y a pas de quoi","à vrai dire","en fin de compte","quoi qu'il en soit"], p:[] } ]}
];
var NEWV10 = {
  "virement":{en:"bank transfer",it:"bonifico",es:"transferencia",de:"Überweisung",pt:"transferência",nl:"overschrijving"},
  "prélèvement":{en:"direct debit",it:"addebito diretto",es:"domiciliación",de:"Lastschrift",pt:"débito direto",nl:"automatische incasso"},
  "intérêts":{en:"interest",it:"interessi",es:"intereses",de:"Zinsen",pt:"juros",nl:"rente"},
  "taux":{en:"rate",it:"tasso",es:"tipo de interés",de:"Zinssatz",pt:"taxa de juro",nl:"rentevoet"},
  "devise":{en:"currency",it:"valuta",es:"divisa",de:"Währung",pt:"divisa",nl:"valuta"},
  "hypothèque":{en:"mortgage",it:"ipoteca",es:"hipoteca",de:"Hypothek",pt:"hipoteca",nl:"hypotheek"},
  "livret d'épargne":{en:"savings account",it:"libretto di risparmio",es:"cuenta de ahorros",de:"Sparbuch",pt:"conta-poupança",nl:"spaarrekening"},
  "chéquier":{en:"chequebook",it:"libretto degli assegni",es:"talonario de cheques",de:"Scheckheft",pt:"livro de cheques",nl:"chequeboek"},
  "espèces":{en:"cash",it:"contanti",es:"efectivo",de:"Bargeld",pt:"numerário",nl:"contant geld"},
  "facture d'électricité":{en:"electricity bill",it:"bolletta della luce",es:"factura de la luz",de:"Stromrechnung",pt:"conta da luz",nl:"elektriciteitsrekening"},
  "intelligence artificielle":{en:"artificial intelligence",it:"intelligenza artificiale",es:"inteligencia artificial",de:"künstliche Intelligenz",pt:"inteligência artificial",nl:"kunstmatige intelligentie"},
  "données":{en:"data",it:"dati",es:"datos",de:"Daten",pt:"dados",nl:"gegevens"},
  "logiciel":{en:"software",it:"software",es:"software",de:"Software",pt:"software",nl:"software"},
  "matériel":{en:"hardware",it:"hardware",es:"hardware",de:"Hardware",pt:"hardware",nl:"hardware"},
  "sauvegarde":{en:"backup",it:"backup",es:"copia de seguridad",de:"Sicherungskopie",pt:"cópia de segurança",nl:"back-up"},
  "mise à jour":{en:"update",it:"aggiornamento",es:"actualización",de:"Aktualisierung",pt:"atualização",nl:"update"},
  "piratage":{en:"hacking",it:"pirateria informatica",es:"piratería",de:"Hacking",pt:"pirataria informática",nl:"hacken"},
  "virus informatique":{en:"computer virus",it:"virus informatico",es:"virus informático",de:"Computervirus",pt:"vírus informático",nl:"computervirus"},
  "écran tactile":{en:"touchscreen",it:"schermo tattile",es:"pantalla táctil",de:"Touchscreen",pt:"ecrã tátil",nl:"touchscreen"},
  "objet connecté":{en:"smart device",it:"dispositivo connesso",es:"dispositivo conectado",de:"smartes Gerät",pt:"dispositivo inteligente",nl:"slim apparaat"},
  "réseau social":{en:"social network",it:"social network",es:"red social",de:"soziales Netzwerk",pt:"rede social",nl:"sociaal netwerk"},
  "gratte-ciel":{en:"skyscraper",it:"grattacielo",es:"rascacielos",de:"Wolkenkratzer",pt:"arranha-céus",nl:"wolkenkrabber"},
  "béton":{en:"concrete",it:"calcestruzzo",es:"hormigón",de:"Beton",pt:"betão",nl:"beton"},
  "brique":{en:"brick",it:"mattone",es:"ladrillo",de:"Ziegel",pt:"tijolo",nl:"baksteen"},
  "grue":{en:"crane",it:"gru",es:"grúa",de:"Kran",pt:"grua",nl:"hijskraan"},
  "échafaudage":{en:"scaffolding",it:"impalcatura",es:"andamio",de:"Gerüst",pt:"andaime",nl:"steiger"},
  "fondations":{en:"foundations",it:"fondamenta",es:"cimientos",de:"Fundament",pt:"alicerces",nl:"fundering"},
  "charpente":{en:"roof frame",it:"intelaiatura",es:"armazón",de:"Dachstuhl",pt:"estrutura do telhado",nl:"dakconstructie"},
  "façade":{en:"façade",it:"facciata",es:"fachada",de:"Fassade",pt:"fachada",nl:"gevel"},
  "toiture":{en:"roofing",it:"copertura",es:"cubierta",de:"Bedachung",pt:"cobertura",nl:"dakbedekking"},
  "permis de construire":{en:"building permit",it:"permesso di costruire",es:"licencia de obras",de:"Baugenehmigung",pt:"licença de construção",nl:"bouwvergunning"},
  "enquête":{en:"investigation",it:"indagine",es:"investigación",de:"Ermittlung",pt:"investigação",nl:"onderzoek"},
  "indice":{en:"clue",it:"indizio",es:"indicio",de:"Hinweis",pt:"indício",nl:"aanwijzing"},
  "suspect":{en:"suspect",it:"sospettato",es:"sospechoso",de:"Verdächtiger",pt:"suspeito",nl:"verdachte"},
  "témoignage":{en:"testimony",it:"testimonianza",es:"testimonio",de:"Zeugenaussage",pt:"testemunho",nl:"getuigenis"},
  "empreintes digitales":{en:"fingerprints",it:"impronte digitali",es:"huellas dactilares",de:"Fingerabdrücke",pt:"impressões digitais",nl:"vingerafdrukken"},
  "alibi":{en:"alibi",it:"alibi",es:"coartada",de:"Alibi",pt:"álibi",nl:"alibi"},
  "cambriolage":{en:"burglary",it:"furto con scasso",es:"robo",de:"Einbruch",pt:"assalto",nl:"inbraak"},
  "agression":{en:"assault",it:"aggressione",es:"agresión",de:"Angriff",pt:"agressão",nl:"aanval"},
  "escroquerie":{en:"fraud",it:"truffa",es:"estafa",de:"Betrug",pt:"burla",nl:"oplichting"},
  "interrogatoire":{en:"interrogation",it:"interrogatorio",es:"interrogatorio",de:"Verhör",pt:"interrogatório",nl:"verhoor"},
  "menottes":{en:"handcuffs",it:"manette",es:"esposas",de:"Handschellen",pt:"algemas",nl:"handboeien"},
  "rançon":{en:"ransom",it:"riscatto",es:"rescate",de:"Lösegeld",pt:"resgate",nl:"losgeld"},
  "ambassade":{en:"embassy",it:"ambasciata",es:"embajada",de:"Botschaft",pt:"embaixada",nl:"ambassade"},
  "consulat":{en:"consulate",it:"consolato",es:"consulado",de:"Konsulat",pt:"consulado",nl:"consulaat"},
  "traité":{en:"treaty",it:"trattato",es:"tratado",de:"Abkommen",pt:"tratado",nl:"verdrag"},
  "diplomatie":{en:"diplomacy",it:"diplomazia",es:"diplomacia",de:"Diplomatie",pt:"diplomacia",nl:"diplomatie"},
  "cessez-le-feu":{en:"ceasefire",it:"cessate il fuoco",es:"alto el fuego",de:"Waffenstillstand",pt:"cessar-fogo",nl:"staakt-het-vuren"},
  "réfugié":{en:"refugee",it:"rifugiato",es:"refugiado",de:"Flüchtling",pt:"refugiado",nl:"vluchteling"},
  "immigration":{en:"immigration",it:"immigrazione",es:"inmigración",de:"Einwanderung",pt:"imigração",nl:"immigratie"},
  "émigration":{en:"emigration",it:"emigrazione",es:"emigración",de:"Auswanderung",pt:"emigração",nl:"emigratie"},
  "mondialisation":{en:"globalisation",it:"globalizzazione",es:"globalización",de:"Globalisierung",pt:"globalização",nl:"globalisering"},
  "aide humanitaire":{en:"humanitarian aid",it:"aiuti umanitari",es:"ayuda humanitaria",de:"humanitäre Hilfe",pt:"ajuda humanitária",nl:"humanitaire hulp"},
  "assaisonner":{en:"to season",it:"condire",es:"aliñar",de:"würzen",pt:"temperar",nl:"op smaak brengen"},
  "éplucher":{en:"to peel",it:"sbucciare",es:"pelar",de:"schälen",pt:"descascar",nl:"schillen"},
  "mariner":{en:"to marinate",it:"marinare",es:"marinar",de:"marinieren",pt:"marinar",nl:"marineren"},
  "pétrir":{en:"to knead",it:"impastare",es:"amasar",de:"kneten",pt:"amassar",nl:"kneden"},
  "levure":{en:"yeast",it:"lievito",es:"levadura",de:"Hefe",pt:"fermento",nl:"gist"},
  "mijoter":{en:"to simmer",it:"cuocere a fuoco lento",es:"cocer a fuego lento",de:"köcheln",pt:"cozinhar em lume brando",nl:"sudderen"},
  "cuisson":{en:"cooking time",it:"cottura",es:"cocción",de:"Garzeit",pt:"cozedura",nl:"gaartijd"},
  "garniture":{en:"side dish",it:"contorno",es:"guarnición",de:"Beilage",pt:"acompanhamento",nl:"bijgerecht"},
  "épices":{en:"spices",it:"spezie",es:"especias",de:"Gewürze",pt:"especiarias",nl:"specerijen"},
  "herbes aromatiques":{en:"herbs",it:"erbe aromatiche",es:"hierbas aromáticas",de:"Kräuter",pt:"ervas aromáticas",nl:"kruiden"},
  "rentable":{en:"profitable",it:"redditizio",es:"rentable",de:"rentabel",pt:"rentável",nl:"winstgevend"},
  "fiable":{en:"reliable",it:"affidabile",es:"fiable",de:"zuverlässig",pt:"fiável",nl:"betrouwbaar"},
  "exigeant":{en:"demanding",it:"esigente",es:"exigente",de:"anspruchsvoll",pt:"exigente",nl:"veeleisend"},
  "soigneux":{en:"meticulous",it:"accurato",es:"cuidadoso",de:"sorgfältig",pt:"cuidadoso",nl:"zorgvuldig"},
  "rigoureux":{en:"rigorous",it:"rigoroso",es:"riguroso",de:"rigoros",pt:"rigoroso",nl:"rigoureus"},
  "approfondi":{en:"in-depth",it:"approfondito",es:"exhaustivo",de:"gründlich",pt:"aprofundado",nl:"diepgaand"},
  "négligent":{en:"careless",it:"negligente",es:"descuidado",de:"nachlässig",pt:"negligente",nl:"slordig"},
  "souple":{en:"flexible",it:"flessibile",es:"flexible",de:"flexibel",pt:"flexível",nl:"soepel"},
  "rigide":{en:"rigid",it:"rigido",es:"rígido",de:"starr",pt:"rígido",nl:"rigide"},
  "robuste":{en:"sturdy",it:"robusto",es:"robusto",de:"robust",pt:"robusto",nl:"robuust"},
  "durable":{en:"sustainable",it:"sostenibile",es:"sostenible",de:"nachhaltig",pt:"sustentável",nl:"duurzaam"},
  "superficiel":{en:"superficial",it:"superficiale",es:"superficial",de:"oberflächlich",pt:"superficial",nl:"oppervlakkig"},
  "néanmoins":{en:"nevertheless",it:"nondimeno",es:"no obstante",de:"nichtsdestotrotz",pt:"não obstante",nl:"niettemin"},
  "toutefois":{en:"nonetheless",it:"però",es:"con todo",de:"allerdings",pt:"todavia",nl:"evenwel"},
  "en revanche":{en:"on the other hand",it:"in compenso",es:"en cambio",de:"hingegen",pt:"em contrapartida",nl:"daarentegen"},
  "par conséquent":{en:"consequently",it:"di conseguenza",es:"por consiguiente",de:"folglich",pt:"por conseguinte",nl:"bijgevolg"},
  "d'autant plus":{en:"all the more",it:"a maggior ragione",es:"tanto más",de:"umso mehr",pt:"tanto mais",nl:"des te meer"},
  "en outre":{en:"furthermore",it:"inoltre",es:"además",de:"außerdem",pt:"além disso",nl:"bovendien"},
  "quant à":{en:"as for",it:"quanto a",es:"en cuanto a",de:"bezüglich",pt:"quanto a",nl:"wat betreft"},
  "faute de":{en:"for lack of",it:"in mancanza di",es:"a falta de",de:"mangels",pt:"à falta de",nl:"bij gebrek aan"},
  "à condition que":{en:"provided that",it:"a condizione che",es:"siempre que",de:"vorausgesetzt, dass",pt:"desde que",nl:"op voorwaarde dat"},
  "bien que":{en:"although",it:"sebbene",es:"aunque",de:"obwohl",pt:"embora",nl:"hoewel"},
  "afin de":{en:"in order to",it:"al fine di",es:"con el fin de",de:"um zu",pt:"a fim de",nl:"teneinde"},
  "tandis que":{en:"whereas",it:"mentre",es:"mientras que",de:"wohingegen",pt:"enquanto",nl:"terwijl"},
  "cellule":{en:"cell",it:"cellula",es:"célula",de:"Zelle",pt:"célula",nl:"cel"},
  "gène":{en:"gene",it:"gene",es:"gen",de:"Gen",pt:"gene",nl:"gen"},
  "ADN":{en:"DNA",it:"DNA",es:"ADN",de:"DNS",pt:"ADN",nl:"DNA"},
  "molécule":{en:"molecule",it:"molecola",es:"molécula",de:"Molekül",pt:"molécula",nl:"molecuul"},
  "atome":{en:"atom",it:"atomo",es:"átomo",de:"Atom",pt:"átomo",nl:"atoom"},
  "évolution":{en:"evolution",it:"evoluzione",es:"evolución",de:"Evolution",pt:"evolução",nl:"evolutie"},
  "échantillon":{en:"sample",it:"esemplare",es:"muestra",de:"Probe",pt:"amostra",nl:"monster"},
  "hypothèse":{en:"hypothesis",it:"ipotesi",es:"hipótesis",de:"Hypothese",pt:"hipótese",nl:"hypothese"},
  "démonstration":{en:"demonstration",it:"dimostrazione",es:"demostración",de:"Beweisführung",pt:"demonstração",nl:"bewijsvoering"},
  "éprouvette":{en:"test tube",it:"provetta",es:"probeta",de:"Reagenzglas",pt:"proveta",nl:"reageerbuis"},
  "locataire":{en:"tenant",it:"inquilino",es:"inquilino",de:"Mieter",pt:"inquilino",nl:"huurder"},
  "propriétaire":{en:"owner",it:"proprietario",es:"propietario",de:"Eigentümer",pt:"proprietário",nl:"eigenaar"},
  "bail":{en:"lease",it:"contratto d'affitto",es:"contrato de alquiler",de:"Mietvertrag",pt:"contrato de arrendamento",nl:"huurcontract"},
  "caution":{en:"deposit",it:"cauzione",es:"fianza",de:"Kaution",pt:"caução",nl:"borg"},
  "assurance":{en:"insurance",it:"assicurazione",es:"seguro",de:"Versicherung",pt:"seguro",nl:"verzekering"},
  "héritage":{en:"inheritance",it:"eredità",es:"herencia",de:"Erbe",pt:"herança",nl:"erfenis"},
  "testament":{en:"will",it:"testamento",es:"testamento",de:"Testament",pt:"testamento",nl:"testament"},
  "notaire":{en:"notary",it:"notaio",es:"notario",de:"Notar",pt:"notário",nl:"notaris"},
  "péage":{en:"toll",it:"pedaggio",es:"peaje",de:"Maut",pt:"portagem",nl:"tol"},
  "covoiturage":{en:"carpooling",it:"car pooling",es:"coche compartido",de:"Fahrgemeinschaft",pt:"partilha de carro",nl:"carpoolen"},
  "contravention":{en:"traffic ticket",it:"contravvenzione",es:"multa de tráfico",de:"Strafzettel",pt:"multa de trânsito",nl:"verkeersboete"},
  "stationnement":{en:"parking",it:"sosta",es:"estacionamiento",de:"Parken",pt:"estacionamento",nl:"parkeren"},
  "ça saute aux yeux":{en:"it's obvious",it:"salta agli occhi",es:"salta a la vista",de:"das springt ins Auge",pt:"salta à vista",nl:"het springt in het oog"},
  "il n'y a pas de quoi":{en:"don't mention it",it:"non c'è di che",es:"no hay de qué",de:"keine Ursache",pt:"não tem de quê",nl:"graag gedaan"},
  "à vrai dire":{en:"to tell the truth",it:"a dire il vero",es:"a decir verdad",de:"um ehrlich zu sein",pt:"para dizer a verdade",nl:"eerlijk gezegd"},
  "en fin de compte":{en:"in the end",it:"in fin dei conti",es:"al fin y al cabo",de:"letzten Endes",pt:"no fim de contas",nl:"uiteindelijk"},
  "quoi qu'il en soit":{en:"be that as it may",it:"comunque sia",es:"sea como sea",de:"wie dem auch sei",pt:"seja como for",nl:"hoe dan ook"}
};
CURRICULUM_P.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV10).forEach(function(k){ if(NEWV10[k][l]) LEX[l][k]=NEWV10[k][l]; }); });

/* --- EXTENSION v2.66 (vague 10 — cap B2) : 10 unités — cinéma, étapes de la vie, débattre,
   religions, université, tourisme, sport intensif, cours d'eau, verbes vifs, loisirs créatifs.
   Parité garantie (NEWV11). Portugais EUROPÉEN toujours : realizador, guião, dobragem, genérico,
   vedeta, doutoramento, licenciatura, investigação, posto de turismo, época baixa, equipa,
   aguarela. --- */
var CURRICULUM_O = [
  { t:"Le cinéma 🎬", c:"#c084fc", L:[
    { t:"Sur le plateau", w:["réalisateur","tournage","scénario","figurant","vedette","plateau de tournage"], p:[] },
    { t:"En salle", w:["doublage","bande-annonce","générique","effets spéciaux","court-métrage","sous-titrage"], p:[] } ]},
  { t:"Les étapes de la vie 🧓", c:"#fbbf24", L:[
    { t:"Grandir", w:["nourrisson","adolescence","jeunesse","majorité"], p:[] },
    { t:"Le grand âge", w:["vieillesse","décès","état civil","espérance de vie"], p:[] } ]},
  { t:"L'art de débattre 🗣", c:"#38bdf8", L:[
    { t:"Argumenter", w:["argument","réfuter","nuancer","objection","porte-parole"], p:[] },
    { t:"Trouver un accord", w:["compromis","consensus","polémique","controverse","mauvaise foi"], p:[] } ]},
  { t:"Croyances et religions ⛪", c:"#94a3b8", L:[
    { t:"Les lieux sacrés", w:["mosquée","synagogue","temple","prière","pèlerinage"], p:[] },
    { t:"Croire ou ne pas croire", w:["croyance","foi","athée","rite","laïcité"], p:[] } ]},
  { t:"L'université 🎓", c:"#818cf8", L:[
    { t:"Les diplômes", w:["licence","master","doctorat","thèse","soutenance"], p:[] },
    { t:"La vie étudiante", w:["amphithéâtre","bourse","inscription","recherche scientifique","stage de fin d'études"], p:[] } ]},
  { t:"Voyager malin 🧳", c:"#22d3ee", L:[
    { t:"Préparer le départ", w:["hébergement","itinéraire","formalités","visa","assurance voyage"], p:[] },
    { t:"Une fois sur place", w:["escale","hors saison","haute saison","dépaysement","office de tourisme"], p:[] } ]},
  { t:"Le sport intensif 💪", c:"#34d399", L:[
    { t:"L'effort", w:["échauffement","étirement","endurance","souffle","transpiration"], p:[] },
    { t:"Après l'effort", w:["courbature","récupération","dopage","performance","esprit d'équipe"], p:[] } ]},
  { t:"Les cours d'eau 🌊", c:"#60a5fa", L:[
    { t:"Du fleuve à la mer", w:["barrage","écluse","affluent","delta","estuaire"], p:[] },
    { t:"Au bord de l'eau", w:["berge","noyade","crue","nappe phréatique"], p:[] } ]},
  { t:"Verbes vifs 🔥", c:"#ef4444", L:[
    { t:"Ça surgit", w:["jaillir","s'effondrer","surgir","se répandre","déborder"], p:[] },
    { t:"Ça se transforme", w:["engloutir","dissoudre","s'évaporer","congeler","fondre"], p:[] } ]},
  { t:"Loisirs créatifs 🤹", c:"#f472b6", L:[
    { t:"Fil et aiguille", w:["tricot","couture","broderie","poterie","aquarelle"], p:[] },
    { t:"Jeux d'esprit", w:["calligraphie","origami","maquette","échecs","jeu de dames"], p:[] } ]}
];
var NEWV11 = {
  "réalisateur":{en:"film director",it:"regista",es:"director de cine",de:"Regisseur",pt:"realizador",nl:"regisseur"},
  "tournage":{en:"filming",it:"riprese",es:"rodaje",de:"Dreharbeiten",pt:"rodagem",nl:"filmopnamen"},
  "scénario":{en:"screenplay",it:"sceneggiatura",es:"guion",de:"Drehbuch",pt:"guião",nl:"scenario"},
  "figurant":{en:"extra",it:"comparsa",es:"figurante",de:"Komparse",pt:"figurante",nl:"figurant"},
  "vedette":{en:"film star",it:"celebrità",es:"estrella de cine",de:"Filmstar",pt:"vedeta",nl:"filmster"},
  "plateau de tournage":{en:"film set",it:"set cinematografico",es:"plató",de:"Filmset",pt:"set de filmagem",nl:"filmset"},
  "doublage":{en:"dubbing",it:"doppiaggio",es:"doblaje",de:"Synchronisation",pt:"dobragem",nl:"nasynchronisatie"},
  "bande-annonce":{en:"trailer",it:"trailer",es:"tráiler",de:"Trailer",pt:"trailer",nl:"trailer"},
  "générique":{en:"credits",it:"titoli di coda",es:"créditos",de:"Abspann",pt:"genérico",nl:"aftiteling"},
  "effets spéciaux":{en:"special effects",it:"effetti speciali",es:"efectos especiales",de:"Spezialeffekte",pt:"efeitos especiais",nl:"speciale effecten"},
  "court-métrage":{en:"short film",it:"cortometraggio",es:"cortometraje",de:"Kurzfilm",pt:"curta-metragem",nl:"korte film"},
  "sous-titrage":{en:"subtitling",it:"sottotitolazione",es:"subtitulado",de:"Untertitelung",pt:"legendagem",nl:"ondertiteling"},
  "nourrisson":{en:"infant",it:"lattante",es:"lactante",de:"Säugling",pt:"lactente",nl:"zuigeling"},
  "adolescence":{en:"adolescence",it:"adolescenza",es:"adolescencia",de:"Adoleszenz",pt:"adolescência",nl:"puberteit"},
  "jeunesse":{en:"youth",it:"gioventù",es:"juventud",de:"Jugend",pt:"juventude",nl:"jeugd"},
  "majorité":{en:"coming of age",it:"maggiore età",es:"mayoría de edad",de:"Volljährigkeit",pt:"maioridade",nl:"meerderjarigheid"},
  "vieillesse":{en:"old age",it:"vecchiaia",es:"vejez",de:"Alter",pt:"velhice",nl:"ouderdom"},
  "décès":{en:"decease",it:"decesso",es:"fallecimiento",de:"Ableben",pt:"falecimento",nl:"overlijden"},
  "état civil":{en:"civil status",it:"stato civile",es:"estado civil",de:"Personenstand",pt:"estado civil",nl:"burgerlijke staat"},
  "espérance de vie":{en:"life expectancy",it:"aspettativa di vita",es:"esperanza de vida",de:"Lebenserwartung",pt:"esperança de vida",nl:"levensverwachting"},
  "argument":{en:"argument",it:"argomentazione",es:"argumento",de:"Argument",pt:"argumento",nl:"argument"},
  "réfuter":{en:"to refute",it:"confutare",es:"refutar",de:"widerlegen",pt:"refutar",nl:"weerleggen"},
  "nuancer":{en:"to nuance",it:"sfumare",es:"matizar",de:"differenzieren",pt:"matizar",nl:"nuanceren"},
  "objection":{en:"objection",it:"obiezione",es:"objeción",de:"Einwand",pt:"objeção",nl:"bezwaar"},
  "porte-parole":{en:"spokesperson",it:"portavoce",es:"portavoz",de:"Sprecher",pt:"porta-voz",nl:"woordvoerder"},
  "compromis":{en:"compromise",it:"compromesso",es:"compromiso",de:"Kompromiss",pt:"compromisso",nl:"compromis"},
  "consensus":{en:"consensus",it:"consenso",es:"consenso",de:"Konsens",pt:"consenso",nl:"consensus"},
  "polémique":{en:"polemic",it:"polemica",es:"polémica",de:"Polemik",pt:"polémica",nl:"polemiek"},
  "controverse":{en:"controversy",it:"controversia",es:"controversia",de:"Kontroverse",pt:"controvérsia",nl:"controverse"},
  "mauvaise foi":{en:"bad faith",it:"malafede",es:"mala fe",de:"Unredlichkeit",pt:"má-fé",nl:"kwade trouw"},
  "mosquée":{en:"mosque",it:"moschea",es:"mezquita",de:"Moschee",pt:"mesquita",nl:"moskee"},
  "synagogue":{en:"synagogue",it:"sinagoga",es:"sinagoga",de:"Synagoge",pt:"sinagoga",nl:"synagoge"},
  "temple":{en:"temple",it:"tempio",es:"templo",de:"Tempel",pt:"templo",nl:"tempel"},
  "prière":{en:"prayer",it:"preghiera",es:"oración",de:"Gebet",pt:"oração",nl:"gebed"},
  "pèlerinage":{en:"pilgrimage",it:"pellegrinaggio",es:"peregrinación",de:"Pilgerfahrt",pt:"peregrinação",nl:"bedevaart"},
  "croyance":{en:"belief",it:"credenza",es:"creencia",de:"Überzeugung",pt:"crença",nl:"geloofsovertuiging"},
  "foi":{en:"faith",it:"fede religiosa",es:"fe",de:"Glaube",pt:"fé",nl:"geloof"},
  "athée":{en:"atheist",it:"ateo",es:"ateo",de:"Atheist",pt:"ateu",nl:"atheïst"},
  "rite":{en:"rite",it:"rito",es:"rito",de:"Ritus",pt:"rito",nl:"ritueel"},
  "laïcité":{en:"secularism",it:"laicità",es:"laicismo",de:"Laizität",pt:"laicidade",nl:"secularisme"},
  "licence":{en:"bachelor's degree",it:"laurea",es:"grado",de:"Bachelor",pt:"licenciatura",nl:"bachelor"},
  "master":{en:"master's degree",it:"laurea magistrale",es:"máster",de:"Master",pt:"mestrado",nl:"master"},
  "doctorat":{en:"doctorate",it:"dottorato",es:"doctorado",de:"Promotion",pt:"doutoramento",nl:"doctoraat"},
  "thèse":{en:"thesis",it:"tesi",es:"tesis",de:"Dissertation",pt:"tese",nl:"proefschrift"},
  "soutenance":{en:"viva",it:"discussione della tesi",es:"defensa de tesis",de:"Disputation",pt:"defesa de tese",nl:"scriptieverdediging"},
  "amphithéâtre":{en:"lecture hall",it:"aula magna",es:"anfiteatro",de:"Hörsaal",pt:"anfiteatro",nl:"collegezaal"},
  "bourse":{en:"scholarship",it:"borsa di studio",es:"beca",de:"Stipendium",pt:"bolsa de estudo",nl:"studiebeurs"},
  "inscription":{en:"enrolment",it:"iscrizione",es:"matrícula",de:"Einschreibung",pt:"inscrição",nl:"inschrijving"},
  "recherche scientifique":{en:"scientific research",it:"ricerca scientifica",es:"investigación científica",de:"wissenschaftliche Forschung",pt:"investigação científica",nl:"wetenschappelijk onderzoek"},
  "stage de fin d'études":{en:"graduation internship",it:"tirocinio finale",es:"prácticas de fin de carrera",de:"Abschlusspraktikum",pt:"estágio curricular",nl:"afstudeerstage"},
  "hébergement":{en:"accommodation",it:"alloggio",es:"alojamiento",de:"Unterkunft",pt:"alojamento",nl:"accommodatie"},
  "itinéraire":{en:"itinerary",it:"itinerario",es:"itinerario",de:"Reiseroute",pt:"itinerário",nl:"reisroute"},
  "formalités":{en:"formalities",it:"formalità",es:"trámites",de:"Formalitäten",pt:"formalidades",nl:"formaliteiten"},
  "visa":{en:"visa",it:"visto",es:"visado",de:"Visum",pt:"visto",nl:"visum"},
  "assurance voyage":{en:"travel insurance",it:"assicurazione di viaggio",es:"seguro de viaje",de:"Reiseversicherung",pt:"seguro de viagem",nl:"reisverzekering"},
  "escale":{en:"stopover",it:"scalo",es:"escala",de:"Zwischenstopp",pt:"escala",nl:"tussenstop"},
  "hors saison":{en:"off season",it:"bassa stagione",es:"temporada baja",de:"Nebensaison",pt:"época baixa",nl:"laagseizoen"},
  "haute saison":{en:"high season",it:"alta stagione",es:"temporada alta",de:"Hochsaison",pt:"época alta",nl:"hoogseizoen"},
  "dépaysement":{en:"change of scenery",it:"spaesamento",es:"cambio de aires",de:"Tapetenwechsel",pt:"mudança de ares",nl:"verandering van omgeving"},
  "office de tourisme":{en:"tourist office",it:"ufficio del turismo",es:"oficina de turismo",de:"Touristeninformation",pt:"posto de turismo",nl:"VVV-kantoor"},
  "échauffement":{en:"warm-up",it:"riscaldamento muscolare",es:"calentamiento",de:"Aufwärmen",pt:"aquecimento muscular",nl:"warming-up"},
  "étirement":{en:"stretching",it:"stretching",es:"estiramiento",de:"Dehnung",pt:"alongamento",nl:"rekoefening"},
  "endurance":{en:"stamina",it:"resistenza",es:"resistencia",de:"Ausdauer",pt:"resistência",nl:"uithoudingsvermogen"},
  "souffle":{en:"breath",it:"fiato",es:"aliento",de:"Atem",pt:"fôlego",nl:"adem"},
  "transpiration":{en:"sweat",it:"sudore",es:"sudor",de:"Schweiß",pt:"suor",nl:"zweet"},
  "courbature":{en:"aching muscles",it:"indolenzimento",es:"agujetas",de:"Muskelkater",pt:"dores musculares",nl:"spierpijn"},
  "récupération":{en:"recuperation",it:"recupero",es:"recuperación",de:"Erholung",pt:"recuperação",nl:"herstel"},
  "dopage":{en:"doping",it:"doping",es:"dopaje",de:"Doping",pt:"doping",nl:"doping"},
  "performance":{en:"performance",it:"prestazione",es:"rendimiento",de:"Leistung",pt:"desempenho",nl:"prestatie"},
  "esprit d'équipe":{en:"team spirit",it:"spirito di squadra",es:"espíritu de equipo",de:"Teamgeist",pt:"espírito de equipa",nl:"teamgeest"},
  "barrage":{en:"dam",it:"diga",es:"presa",de:"Staudamm",pt:"barragem",nl:"stuwdam"},
  "écluse":{en:"lock",it:"chiusa",es:"esclusa",de:"Schleuse",pt:"eclusa",nl:"sluis"},
  "affluent":{en:"tributary",it:"affluente",es:"afluente",de:"Nebenfluss",pt:"afluente",nl:"zijrivier"},
  "delta":{en:"delta",it:"delta",es:"delta",de:"Delta",pt:"delta",nl:"delta"},
  "estuaire":{en:"estuary",it:"estuario",es:"estuario",de:"Flussmündung",pt:"estuário",nl:"riviermonding"},
  "berge":{en:"riverbank",it:"riva",es:"orilla",de:"Ufer",pt:"margem do rio",nl:"oever"},
  "noyade":{en:"drowning",it:"annegamento",es:"ahogamiento",de:"Ertrinken",pt:"afogamento",nl:"verdrinking"},
  "crue":{en:"spate",it:"piena",es:"crecida",de:"Hochwasser",pt:"cheia",nl:"hoogwater"},
  "nappe phréatique":{en:"groundwater",it:"falda acquifera",es:"acuífero",de:"Grundwasser",pt:"lençol freático",nl:"grondwater"},
  "jaillir":{en:"to gush",it:"sgorgare",es:"brotar",de:"sprudeln",pt:"jorrar",nl:"gutsen"},
  "s'effondrer":{en:"to collapse",it:"crollare",es:"derrumbarse",de:"einstürzen",pt:"desmoronar-se",nl:"instorten"},
  "surgir":{en:"to spring up",it:"spuntare",es:"surgir",de:"auftauchen",pt:"surgir",nl:"opduiken"},
  "se répandre":{en:"to spread",it:"diffondersi",es:"propagarse",de:"sich ausbreiten",pt:"espalhar-se",nl:"zich verspreiden"},
  "déborder":{en:"to overflow",it:"traboccare",es:"desbordarse",de:"überlaufen",pt:"transbordar",nl:"overlopen"},
  "engloutir":{en:"to engulf",it:"inghiottire",es:"engullir",de:"verschlingen",pt:"tragar",nl:"verzwelgen"},
  "dissoudre":{en:"to dissolve",it:"sciogliere",es:"disolver",de:"auflösen",pt:"dissolver",nl:"oplossen"},
  "s'évaporer":{en:"to evaporate",it:"evaporare",es:"evaporarse",de:"verdunsten",pt:"evaporar-se",nl:"verdampen"},
  "congeler":{en:"to freeze",it:"congelare",es:"congelar",de:"einfrieren",pt:"congelar",nl:"invriezen"},
  "fondre":{en:"to melt",it:"fondere",es:"derretirse",de:"schmelzen",pt:"derreter",nl:"smelten"},
  "tricot":{en:"knitting",it:"lavoro a maglia",es:"hacer punto",de:"Stricken",pt:"tricot",nl:"breien"},
  "couture":{en:"sewing",it:"cucito",es:"costura",de:"Nähen",pt:"costura",nl:"naaien"},
  "broderie":{en:"embroidery",it:"ricamo",es:"bordado",de:"Stickerei",pt:"bordado",nl:"borduurwerk"},
  "poterie":{en:"pottery",it:"ceramica",es:"alfarería",de:"Töpferei",pt:"olaria",nl:"pottenbakken"},
  "aquarelle":{en:"watercolour",it:"acquerello",es:"acuarela",de:"Aquarell",pt:"aguarela",nl:"aquarel"},
  "calligraphie":{en:"calligraphy",it:"calligrafia",es:"caligrafía",de:"Kalligrafie",pt:"caligrafia",nl:"kalligrafie"},
  "origami":{en:"origami",it:"origami",es:"papiroflexia",de:"Origami",pt:"origami",nl:"origami"},
  "maquette":{en:"scale model",it:"modellino",es:"maqueta",de:"Miniaturmodell",pt:"maqueta",nl:"schaalmodel"},
  "échecs":{en:"chess",it:"scacchi",es:"ajedrez",de:"Schach",pt:"xadrez",nl:"schaken"},
  "jeu de dames":{en:"draughts",it:"dama",es:"damas",de:"Damespiel",pt:"jogo de damas",nl:"dammen"}
};
CURRICULUM_O.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV11).forEach(function(k){ if(NEWV11[k][l]) LEX[l][k]=NEWV11[k][l]; }); });

/* --- Vague 11 (v2.69, cap B2) : citoyenneté & travail + nuances (fréquence, rythme, caractère, connecteurs) --- */
var CURRICULUM_M = [
  {t:"Citoyens 🏛️", c:"#0ea5e9", L:[
    {t:"La nation", w:["nation","peuple","société","droit","devoir","voter"]},
    {t:"La justice", w:["justice","contrat","signer","remboursement"]},
    {t:"Au travail", w:["entretien","délai","effort","progrès","résultat"]} ]},
  {t:"Nuances 🎚️", c:"#a855f7", L:[
    {t:"La fréquence", w:["quotidien","hebdomadaire","mensuel","annuel"]},
    {t:"Le rythme", w:["immédiat","soudain","progressif","définitif"]},
    {t:"Qualités", w:["efficace","inutile","évident","compliqué","précis","vague"]},
    {t:"Caractères", w:["sincère","avare","impoli","imprudent","lâche","fou"]},
    {t:"Pour argumenter", w:["en effet","autrement dit","dorénavant"]} ]}
];
var NEWV12 = {
"nation":{en:"nation",it:"nazione",es:"nación",de:"Nation",pt:"nação",nl:"natie"},
"peuple":{en:"people",it:"popolo",es:"pueblo",de:"Volk",pt:"povo",nl:"volk"},
"société":{en:"society",it:"società",es:"sociedad",de:"Gesellschaft",pt:"sociedade",nl:"samenleving"},
"droit":{en:"right",it:"diritto",es:"derecho",de:"Recht",pt:"direito",nl:"recht"},
"devoir":{en:"duty",it:"dovere",es:"deber",de:"Pflicht",pt:"dever",nl:"plicht"},
"voter":{en:"vote",it:"votare",es:"votar",de:"wählen",pt:"votar",nl:"stemmen"},
"justice":{en:"justice",it:"giustizia",es:"justicia",de:"Gerechtigkeit",pt:"justiça",nl:"rechtvaardigheid"},
"contrat":{en:"contract",it:"contratto",es:"contrato",de:"Vertrag",pt:"contrato",nl:"contract"},
"signer":{en:"sign",it:"firmare",es:"firmar",de:"unterschreiben",pt:"assinar",nl:"ondertekenen"},
"remboursement":{en:"refund",it:"rimborso",es:"reembolso",de:"Rückerstattung",pt:"reembolso",nl:"terugbetaling"},
"entretien":{en:"interview",it:"colloquio",es:"entrevista",de:"Vorstellungsgespräch",pt:"entrevista",nl:"sollicitatiegesprek"},
"délai":{en:"deadline",it:"scadenza",es:"plazo",de:"Frist",pt:"prazo",nl:"termijn"},
"effort":{en:"effort",it:"sforzo",es:"esfuerzo",de:"Anstrengung",pt:"esforço",nl:"inspanning"},
"progrès":{en:"progress",it:"progresso",es:"progreso",de:"Fortschritt",pt:"progresso",nl:"vooruitgang"},
"résultat":{en:"result",it:"risultato",es:"resultado",de:"Ergebnis",pt:"resultado",nl:"resultaat"},
"quotidien":{en:"daily",it:"quotidiano",es:"diario",de:"täglich",pt:"diário",nl:"dagelijks"},
"hebdomadaire":{en:"weekly",it:"settimanale",es:"semanal",de:"wöchentlich",pt:"semanal",nl:"wekelijks"},
"mensuel":{en:"monthly",it:"mensile",es:"mensual",de:"monatlich",pt:"mensal",nl:"maandelijks"},
"annuel":{en:"yearly",it:"annuale",es:"anual",de:"jährlich",pt:"anual",nl:"jaarlijks"},
"immédiat":{en:"immediate",it:"immediato",es:"inmediato",de:"sofortig",pt:"imediato",nl:"onmiddellijk"},
"soudain":{en:"sudden",it:"improvviso",es:"repentino",de:"plötzlich",pt:"repentino",nl:"plotseling"},
"progressif":{en:"gradual",it:"graduale",es:"gradual",de:"allmählich",pt:"gradual",nl:"geleidelijk"},
"définitif":{en:"final",it:"definitivo",es:"definitivo",de:"endgültig",pt:"definitivo",nl:"definitief"},
"efficace":{en:"effective",it:"efficace",es:"eficaz",de:"wirksam",pt:"eficaz",nl:"doeltreffend"},
"inutile":{en:"useless",it:"inutile",es:"inútil",de:"nutzlos",pt:"inútil",nl:"nutteloos"},
"évident":{en:"obvious",it:"ovvio",es:"evidente",de:"offensichtlich",pt:"óbvio",nl:"duidelijk"},
"compliqué":{en:"complicated",it:"complicato",es:"complicado",de:"kompliziert",pt:"complicado",nl:"ingewikkeld"},
"précis":{en:"precise",it:"preciso",es:"preciso",de:"genau",pt:"preciso",nl:"nauwkeurig"},
"vague":{en:"vague",it:"vago",es:"vago",de:"vage",pt:"vago",nl:"vaag"},
"sincère":{en:"sincere",it:"sincero",es:"sincero",de:"aufrichtig",pt:"sincero",nl:"oprecht"},
"avare":{en:"stingy",it:"avaro",es:"tacaño",de:"geizig",pt:"avarento",nl:"gierig"},
"impoli":{en:"rude",it:"maleducato",es:"maleducado",de:"unhöflich",pt:"mal-educado",nl:"onbeleefd"},
"imprudent":{en:"careless",it:"imprudente",es:"imprudente",de:"unvorsichtig",pt:"imprudente",nl:"onvoorzichtig"},
"lâche":{en:"cowardly",it:"codardo",es:"cobarde",de:"feige",pt:"cobarde",nl:"laf"},
"fou":{en:"crazy",it:"pazzo",es:"loco",de:"verrückt",pt:"louco",nl:"gek"},
"en effet":{en:"indeed",it:"infatti",es:"en efecto",de:"in der Tat",pt:"de facto",nl:"inderdaad"},
"autrement dit":{en:"in other words",it:"in altre parole",es:"en otras palabras",de:"mit anderen Worten",pt:"por outras palavras",nl:"met andere woorden"},
"dorénavant":{en:"from now on",it:"d'ora in poi",es:"de ahora en adelante",de:"von nun an",pt:"doravante",nl:"voortaan"}
};
CURRICULUM_M.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV12).forEach(function(k){ if(NEWV12[k][l]) LEX[l][k]=NEWV12[k][l]; }); });

/* --- Vague 12 (v2.71, cap B2) : verbes de relation (promesse, soutien, autorité, négociation) + sciences --- */
var CURRICULUM_L2 = [
  {t:"Dire et faire 🤝", c:"#f43f5e", L:[
    {t:"Promettre", w:["jurer","pardonner","trahir","se venger","prouver"]},
    {t:"Soutenir", w:["féliciter","encourager","consoler","rassurer"]},
    {t:"Autorité", w:["interdire","autoriser","obéir","désobéir","punir","récompenser"]},
    {t:"Négocier", w:["menacer","supplier","soupçonner","insister","céder","parier"]} ]},
  {t:"Sciences 🔭", c:"#06b6d4", L:[
    {t:"La Terre", w:["océan","atmosphère","oxygène","espèce"]},
    {t:"Découvertes", w:["électricité","robot","éclipse"]} ]}
];
var NEWV13 = {
"jurer":{en:"swear",it:"giurare",es:"jurar",de:"schwören",pt:"jurar",nl:"zweren"},
"pardonner":{en:"forgive",it:"perdonare",es:"perdonar",de:"verzeihen",pt:"perdoar",nl:"vergeven"},
"trahir":{en:"betray",it:"tradire",es:"traicionar",de:"verraten",pt:"trair",nl:"verraden"},
"se venger":{en:"take revenge",it:"vendicarsi",es:"vengarse",de:"sich rächen",pt:"vingar-se",nl:"wraak nemen"},
"prouver":{en:"prove",it:"dimostrare",es:"demostrar",de:"beweisen",pt:"provar",nl:"bewijzen"},
"féliciter":{en:"congratulate",it:"congratularsi",es:"felicitar",de:"gratulieren",pt:"felicitar",nl:"feliciteren"},
"encourager":{en:"encourage",it:"incoraggiare",es:"animar",de:"ermutigen",pt:"encorajar",nl:"aanmoedigen"},
"consoler":{en:"comfort",it:"consolare",es:"consolar",de:"trösten",pt:"consolar",nl:"troosten"},
"rassurer":{en:"reassure",it:"rassicurare",es:"tranquilizar",de:"beruhigen",pt:"tranquilizar",nl:"geruststellen"},
"interdire":{en:"forbid",it:"vietare",es:"prohibir",de:"verbieten",pt:"proibir",nl:"verbieden"},
"autoriser":{en:"allow",it:"autorizzare",es:"autorizar",de:"erlauben",pt:"autorizar",nl:"toestaan"},
"obéir":{en:"obey",it:"obbedire",es:"obedecer",de:"gehorchen",pt:"obedecer",nl:"gehoorzamen"},
"désobéir":{en:"disobey",it:"disobbedire",es:"desobedecer",de:"nicht gehorchen",pt:"desobedecer",nl:"niet gehoorzamen"},
"punir":{en:"punish",it:"punire",es:"castigar",de:"bestrafen",pt:"castigar",nl:"straffen"},
"récompenser":{en:"reward",it:"ricompensare",es:"recompensar",de:"belohnen",pt:"recompensar",nl:"belonen"},
"menacer":{en:"threaten",it:"minacciare",es:"amenazar",de:"drohen",pt:"ameaçar",nl:"dreigen"},
"supplier":{en:"beg",it:"supplicare",es:"suplicar",de:"anflehen",pt:"suplicar",nl:"smeken"},
"soupçonner":{en:"suspect",it:"sospettare",es:"sospechar",de:"verdächtigen",pt:"suspeitar",nl:"verdenken"},
"insister":{en:"insist",it:"insistere",es:"insistir",de:"beharren",pt:"insistir",nl:"aandringen"},
"céder":{en:"give in",it:"cedere",es:"ceder",de:"nachgeben",pt:"ceder",nl:"toegeven"},
"parier":{en:"bet",it:"scommettere",es:"apostar",de:"wetten",pt:"apostar",nl:"wedden"},
"océan":{en:"ocean",it:"oceano",es:"océano",de:"Ozean",pt:"oceano",nl:"oceaan"},
"atmosphère":{en:"atmosphere",it:"atmosfera",es:"atmósfera",de:"Atmosphäre",pt:"atmosfera",nl:"atmosfeer"},
"oxygène":{en:"oxygen",it:"ossigeno",es:"oxígeno",de:"Sauerstoff",pt:"oxigénio",nl:"zuurstof"},
"espèce":{en:"species",it:"specie",es:"especie",de:"Art",pt:"espécie",nl:"soort"},
"électricité":{en:"electricity",it:"elettricità",es:"electricidad",de:"Strom",pt:"eletricidade",nl:"elektriciteit"},
"robot":{en:"robot",it:"robot",es:"robot",de:"Roboter",pt:"robô",nl:"robot"},
"éclipse":{en:"eclipse",it:"eclissi",es:"eclipse",de:"Finsternis",pt:"eclipse",nl:"verduistering"}
};
CURRICULUM_L2.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV13).forEach(function(k){ if(NEWV13[k][l]) LEX[l][k]=NEWV13[k][l]; }); });

/* --- Vague 13 (v2.73, cap B2) : bricolage (matériaux, gestes) + cuisine & quantités --- */
var CURRICULUM_K = [
  {t:"Bricolage 🔨", c:"#b45309", L:[
    {t:"Matériaux", w:["fer","acier","sable","colle","peinture","aiguille"]},
    {t:"À l'œuvre", w:["construire","casser","visser"]} ]},
  {t:"Cuisine et quantités 🍳", c:"#65a30d", L:[
    {t:"En cuisine", w:["vinaigre","moutarde","sauce","ingrédient","congélateur","mixeur"]},
    {t:"Les quantités", w:["tiers","plusieurs","quelques","aucun","chaque","au moins","au maximum"]} ]}
];
var NEWV14 = {
"fer":{en:"iron",it:"ferro",es:"hierro",de:"Eisen",pt:"ferro",nl:"ijzer"},
"acier":{en:"steel",it:"acciaio",es:"acero",de:"Stahl",pt:"aço",nl:"staal"},
"sable":{en:"sand",it:"sabbia",es:"arena",de:"Sand",pt:"areia",nl:"zand"},
"colle":{en:"glue",it:"colla",es:"pegamento",de:"Kleber",pt:"cola",nl:"lijm"},
"peinture":{en:"paint",it:"vernice",es:"pintura",de:"Farbe",pt:"tinta",nl:"verf"},
"aiguille":{en:"needle",it:"ago",es:"aguja",de:"Nadel",pt:"agulha",nl:"naald"},
"construire":{en:"build",it:"costruire",es:"construir",de:"bauen",pt:"construir",nl:"bouwen"},
"casser":{en:"break",it:"rompere",es:"romper",de:"zerbrechen",pt:"partir",nl:"breken"},
"visser":{en:"screw",it:"avvitare",es:"atornillar",de:"schrauben",pt:"aparafusar",nl:"schroeven"},
"vinaigre":{en:"vinegar",it:"aceto",es:"vinagre",de:"Essig",pt:"vinagre",nl:"azijn"},
"moutarde":{en:"mustard",it:"senape",es:"mostaza",de:"Senf",pt:"mostarda",nl:"mosterd"},
"sauce":{en:"sauce",it:"salsa",es:"salsa",de:"Soße",pt:"molho",nl:"saus"},
"ingrédient":{en:"ingredient",it:"ingrediente",es:"ingrediente",de:"Zutat",pt:"ingrediente",nl:"ingrediënt"},
"congélateur":{en:"freezer",it:"congelatore",es:"congelador",de:"Gefrierschrank",pt:"congelador",nl:"vriezer"},
"mixeur":{en:"blender",it:"frullatore",es:"batidora",de:"Mixer",pt:"liquidificadora",nl:"blender"},
"tiers":{en:"third",it:"terzo",es:"tercio",de:"Drittel",pt:"terço",nl:"een derde"},
"plusieurs":{en:"several",it:"parecchi",es:"varios",de:"mehrere",pt:"vários",nl:"verschillende"},
"quelques":{en:"a few",it:"alcuni",es:"algunos",de:"einige",pt:"alguns",nl:"enkele"},
"aucun":{en:"none",it:"nessuno",es:"ninguno",de:"keiner",pt:"nenhum",nl:"geen"},
"chaque":{en:"each",it:"ogni",es:"cada",de:"jeder",pt:"cada",nl:"elk"},
"au moins":{en:"at least",it:"almeno",es:"al menos",de:"mindestens",pt:"pelo menos",nl:"minstens"},
"au maximum":{en:"at most",it:"al massimo",es:"como máximo",de:"höchstens",pt:"no máximo",nl:"hoogstens"}
};
CURRICULUM_K.forEach(function(u){ CURRICULUM.push(u); });
LANGS.forEach(function(l){ Object.keys(NEWV14).forEach(function(k){ if(NEWV14[k][l]) LEX[l][k]=NEWV14[k][l]; }); });

/* ============ 🌏 NOUVELLES LANGUES — Europe de l'Est + Asie (cours DÉMARRAGE) ============
   Kevin 2026-08-10 : « ajoute langues pays de l'est, asiatique, etc ». Chaque nouvelle langue
   couvre ENTIÈREMENT les 8 premières unités (A1 démarrage) et grandit vague par vague comme
   les 6 langues d'origine. VÉRITÉ : seules les unités 100 % traduites entrent dans le cours —
   aucun repli français silencieux. noType = écriture au clavier remplacée par des choix
   (alphabets non latins) ; les phrases zh/ja sont segmentées par espaces (blocs de mots). */
var LANGS2 = ["pl","ru","uk","cs","zh","ja","ko","ar"];
var LMETA2 = {
  pl:{nom:"Polonais",  drapeau:"🇵🇱", tts:"pl-PL"},
  ru:{nom:"Russe",     drapeau:"🇷🇺", tts:"ru-RU", noType:true},
  uk:{nom:"Ukrainien", drapeau:"🇺🇦", tts:"uk-UA", noType:true},
  cs:{nom:"Tchèque",   drapeau:"🇨🇿", tts:"cs-CZ"},
  zh:{nom:"Chinois (mandarin)", drapeau:"🇨🇳", tts:"zh-CN", noType:true},
  ja:{nom:"Japonais",  drapeau:"🇯🇵", tts:"ja-JP", noType:true},
  ko:{nom:"Coréen",    drapeau:"🇰🇷", tts:"ko-KR", noType:true},
  ar:{nom:"Arabe",     drapeau:"🇸🇦", tts:"ar-SA", noType:true, rtl:true}
};
Object.keys(LMETA2).forEach(function(k){ LMETA[k]=LMETA2[k]; });
var LEX2 = {
pl:{
"bonjour":"dzień dobry","salut":"cześć","au revoir":"do widzenia","merci":"dziękuję","oui":"tak","non":"nie","s'il te plaît":"proszę","pardon":"przepraszam",
"homme":"mężczyzna","femme":"kobieta","garçon":"chłopiec","fille":"dziewczyna","ami":"przyjaciel","enfant":"dziecko","nom":"imię","moi":"ja",
"eau":"woda","pain":"chleb","maison":"dom","livre":"książka","chien":"pies","chat":"kot",
"je suis un homme":"jestem mężczyzną","elle est une femme":"ona jest kobietą","le chat boit de l'eau":"kot pije wodę",
"café":"kawa","lait":"mleko","vin":"wino","thé":"herbata","jus":"sok","bière":"piwo",
"pomme":"jabłko","fromage":"ser","poisson":"ryba","viande":"mięso","riz":"ryż","œuf":"jajko","gâteau":"ciasto","soupe":"zupa",
"je bois du café":"piję kawę","je mange une pomme":"jem jabłko","nous mangeons du riz":"jemy ryż",
"zéro":"zero","un":"jeden","deux":"dwa","trois":"trzy","quatre":"cztery","cinq":"pięć","six":"sześć","sept":"siedem","huit":"osiem","neuf":"dziewięć","dix":"dziesięć","cent":"sto",
"j'ai deux chats":"mam dwa koty","trois pommes":"trzy jabłka",
"mère":"matka","père":"ojciec","frère":"brat","sœur":"siostra","grand-mère":"babcia","grand-père":"dziadek","bébé":"niemowlę","famille":"rodzina",
"rouge":"czerwony","bleu":"niebieski","vert":"zielony","jaune":"żółty","noir":"czarny","blanc":"biały","orange":"pomarańczowy","rose":"różowy",
"une fleur rouge":"czerwony kwiat","le chat est noir":"kot jest czarny",
"cheval":"koń","oiseau":"ptak","vache":"krowa","poule":"kura","cochon":"świnia","lapin":"królik","mouton":"owca","souris":"mysz",
"jour":"dzień","nuit":"noc","matin":"rano","soir":"wieczór","semaine":"tydzień","mois":"miesiąc","année":"rok","heure":"godzina","minute":"minuta","aujourd'hui":"dzisiaj","demain":"jutro","hier":"wczoraj",
"gare":"dworzec","hôtel":"hotel","rue":"ulica","gauche":"lewo","droite":"prawo","ici":"tutaj","grand":"duży","petit":"mały","nouveau":"nowy","beau":"piękny","bon":"dobry","vite":"szybko",
"où est la gare":"gdzie jest dworzec","la maison est grande":"dom jest duży","c'est un bon café":"to jest dobra kawa"
},
ru:{
"bonjour":"здравствуйте","salut":"привет","au revoir":"до свидания","merci":"спасибо","oui":"да","non":"нет","s'il te plaît":"пожалуйста","pardon":"извините",
"homme":"мужчина","femme":"женщина","garçon":"мальчик","fille":"девочка","ami":"друг","enfant":"ребёнок","nom":"имя","moi":"я",
"eau":"вода","pain":"хлеб","maison":"дом","livre":"книга","chien":"собака","chat":"кот",
"je suis un homme":"я мужчина","elle est une femme":"она женщина","le chat boit de l'eau":"кот пьёт воду",
"café":"кофе","lait":"молоко","vin":"вино","thé":"чай","jus":"сок","bière":"пиво",
"pomme":"яблоко","fromage":"сыр","poisson":"рыба","viande":"мясо","riz":"рис","œuf":"яйцо","gâteau":"торт","soupe":"суп",
"je bois du café":"я пью кофе","je mange une pomme":"я ем яблоко","nous mangeons du riz":"мы едим рис",
"zéro":"ноль","un":"один","deux":"два","trois":"три","quatre":"четыре","cinq":"пять","six":"шесть","sept":"семь","huit":"восемь","neuf":"девять","dix":"десять","cent":"сто",
"j'ai deux chats":"у меня два кота","trois pommes":"три яблока",
"mère":"мама","père":"папа","frère":"брат","sœur":"сестра","grand-mère":"бабушка","grand-père":"дедушка","bébé":"малыш","famille":"семья",
"rouge":"красный","bleu":"синий","vert":"зелёный","jaune":"жёлтый","noir":"чёрный","blanc":"белый","orange":"оранжевый","rose":"розовый",
"une fleur rouge":"красный цветок","le chat est noir":"кот чёрный",
"cheval":"лошадь","oiseau":"птица","vache":"корова","poule":"курица","cochon":"свинья","lapin":"кролик","mouton":"овца","souris":"мышь",
"jour":"день","nuit":"ночь","matin":"утро","soir":"вечер","semaine":"неделя","mois":"месяц","année":"год","heure":"час","minute":"минута","aujourd'hui":"сегодня","demain":"завтра","hier":"вчера",
"gare":"вокзал","hôtel":"отель","rue":"улица","gauche":"налево","droite":"направо","ici":"здесь","grand":"большой","petit":"маленький","nouveau":"новый","beau":"красивый","bon":"хороший","vite":"быстро",
"où est la gare":"где вокзал","la maison est grande":"дом большой","c'est un bon café":"это хороший кофе"
},
uk:{
"bonjour":"добрий день","salut":"привіт","au revoir":"до побачення","merci":"дякую","oui":"так","non":"ні","s'il te plaît":"будь ласка","pardon":"вибачте",
"homme":"чоловік","femme":"жінка","garçon":"хлопчик","fille":"дівчинка","ami":"друг","enfant":"дитина","nom":"ім'я","moi":"я",
"eau":"вода","pain":"хліб","maison":"дім","livre":"книга","chien":"собака","chat":"кіт",
"je suis un homme":"я чоловік","elle est une femme":"вона жінка","le chat boit de l'eau":"кіт п'є воду",
"café":"кава","lait":"молоко","vin":"вино","thé":"чай","jus":"сік","bière":"пиво",
"pomme":"яблуко","fromage":"сир","poisson":"риба","viande":"м'ясо","riz":"рис","œuf":"яйце","gâteau":"торт","soupe":"суп",
"je bois du café":"я п'ю каву","je mange une pomme":"я їм яблуко","nous mangeons du riz":"ми їмо рис",
"zéro":"нуль","un":"один","deux":"два","trois":"три","quatre":"чотири","cinq":"п'ять","six":"шість","sept":"сім","huit":"вісім","neuf":"дев'ять","dix":"десять","cent":"сто",
"j'ai deux chats":"у мене два коти","trois pommes":"три яблука",
"mère":"мама","père":"тато","frère":"брат","sœur":"сестра","grand-mère":"бабуся","grand-père":"дідусь","bébé":"малюк","famille":"сім'я",
"rouge":"червоний","bleu":"синій","vert":"зелений","jaune":"жовтий","noir":"чорний","blanc":"білий","orange":"помаранчевий","rose":"рожевий",
"une fleur rouge":"червона квітка","le chat est noir":"кіт чорний",
"cheval":"кінь","oiseau":"птах","vache":"корова","poule":"курка","cochon":"свиня","lapin":"кролик","mouton":"вівця","souris":"миша",
"jour":"день","nuit":"ніч","matin":"ранок","soir":"вечір","semaine":"тиждень","mois":"місяць","année":"рік","heure":"година","minute":"хвилина","aujourd'hui":"сьогодні","demain":"завтра","hier":"вчора",
"gare":"вокзал","hôtel":"готель","rue":"вулиця","gauche":"ліворуч","droite":"праворуч","ici":"тут","grand":"великий","petit":"маленький","nouveau":"новий","beau":"гарний","bon":"добрий","vite":"швидко",
"où est la gare":"де вокзал","la maison est grande":"дім великий","c'est un bon café":"це добра кава"
},
cs:{
"bonjour":"dobrý den","salut":"ahoj","au revoir":"na shledanou","merci":"děkuji","oui":"ano","non":"ne","s'il te plaît":"prosím","pardon":"promiňte",
"homme":"muž","femme":"žena","garçon":"chlapec","fille":"dívka","ami":"přítel","enfant":"dítě","nom":"jméno","moi":"já",
"eau":"voda","pain":"chléb","maison":"dům","livre":"kniha","chien":"pes","chat":"kočka",
"je suis un homme":"jsem muž","elle est une femme":"ona je žena","le chat boit de l'eau":"kočka pije vodu",
"café":"káva","lait":"mléko","vin":"víno","thé":"čaj","jus":"džus","bière":"pivo",
"pomme":"jablko","fromage":"sýr","poisson":"ryba","viande":"maso","riz":"rýže","œuf":"vejce","gâteau":"dort","soupe":"polévka",
"je bois du café":"piju kávu","je mange une pomme":"jím jablko","nous mangeons du riz":"jíme rýži",
"zéro":"nula","un":"jeden","deux":"dva","trois":"tři","quatre":"čtyři","cinq":"pět","six":"šest","sept":"sedm","huit":"osm","neuf":"devět","dix":"deset","cent":"sto",
"j'ai deux chats":"mám dvě kočky","trois pommes":"tři jablka",
"mère":"matka","père":"otec","frère":"bratr","sœur":"sestra","grand-mère":"babička","grand-père":"dědeček","bébé":"miminko","famille":"rodina",
"rouge":"červený","bleu":"modrý","vert":"zelený","jaune":"žlutý","noir":"černý","blanc":"bílý","orange":"oranžový","rose":"růžový",
"une fleur rouge":"červená květina","le chat est noir":"kočka je černá",
"cheval":"kůň","oiseau":"pták","vache":"kráva","poule":"slepice","cochon":"prase","lapin":"králík","mouton":"ovce","souris":"myš",
"jour":"den","nuit":"noc","matin":"ráno","soir":"večer","semaine":"týden","mois":"měsíc","année":"rok","heure":"hodina","minute":"minuta","aujourd'hui":"dnes","demain":"zítra","hier":"včera",
"gare":"nádraží","hôtel":"hotel","rue":"ulice","gauche":"vlevo","droite":"vpravo","ici":"tady","grand":"velký","petit":"malý","nouveau":"nový","beau":"krásný","bon":"dobrý","vite":"rychle",
"où est la gare":"kde je nádraží","la maison est grande":"dům je velký","c'est un bon café":"to je dobrá káva"
},
zh:{
"bonjour":"你好","salut":"嗨","au revoir":"再见","merci":"谢谢","oui":"是","non":"不","s'il te plaît":"请","pardon":"对不起",
"homme":"男人","femme":"女人","garçon":"男孩","fille":"女孩","ami":"朋友","enfant":"孩子","nom":"名字","moi":"我",
"eau":"水","pain":"面包","maison":"房子","livre":"书","chien":"狗","chat":"猫",
"je suis un homme":"我 是 男人","elle est une femme":"她 是 女人","le chat boit de l'eau":"猫 喝 水",
"café":"咖啡","lait":"牛奶","vin":"葡萄酒","thé":"茶","jus":"果汁","bière":"啤酒",
"pomme":"苹果","fromage":"奶酪","poisson":"鱼","viande":"肉","riz":"米饭","œuf":"鸡蛋","gâteau":"蛋糕","soupe":"汤",
"je bois du café":"我 喝 咖啡","je mange une pomme":"我 吃 苹果","nous mangeons du riz":"我们 吃 米饭",
"zéro":"零","un":"一","deux":"二","trois":"三","quatre":"四","cinq":"五","six":"六","sept":"七","huit":"八","neuf":"九","dix":"十","cent":"百",
"j'ai deux chats":"我 有 两 只 猫","trois pommes":"三 个 苹果",
"mère":"妈妈","père":"爸爸","frère":"哥哥","sœur":"姐姐","grand-mère":"奶奶","grand-père":"爷爷","bébé":"宝宝","famille":"家庭",
"rouge":"红色","bleu":"蓝色","vert":"绿色","jaune":"黄色","noir":"黑色","blanc":"白色","orange":"橙色","rose":"粉色",
"une fleur rouge":"红色 的 花","le chat est noir":"猫 是 黑色 的",
"cheval":"马","oiseau":"鸟","vache":"奶牛","poule":"母鸡","cochon":"猪","lapin":"兔子","mouton":"绵羊","souris":"老鼠",
"jour":"白天","nuit":"夜晚","matin":"早上","soir":"晚上","semaine":"星期","mois":"月","année":"年","heure":"小时","minute":"分钟","aujourd'hui":"今天","demain":"明天","hier":"昨天",
"gare":"火车站","hôtel":"酒店","rue":"街道","gauche":"左边","droite":"右边","ici":"这里","grand":"大","petit":"小","nouveau":"新","beau":"漂亮","bon":"好","vite":"快",
"où est la gare":"火车站 在 哪里","la maison est grande":"房子 很 大","c'est un bon café":"这 是 很 好 的 咖啡"
},
ja:{
"bonjour":"こんにちは","salut":"やあ","au revoir":"さようなら","merci":"ありがとう","oui":"はい","non":"いいえ","s'il te plaît":"おねがいします","pardon":"すみません",
"homme":"男の人","femme":"女の人","garçon":"男の子","fille":"女の子","ami":"友だち","enfant":"子ども","nom":"名前","moi":"私",
"eau":"水","pain":"パン","maison":"家","livre":"本","chien":"犬","chat":"猫",
"je suis un homme":"私 は 男の人 です","elle est une femme":"彼女 は 女の人 です","le chat boit de l'eau":"猫 は 水 を 飲みます",
"café":"コーヒー","lait":"牛乳","vin":"ワイン","thé":"お茶","jus":"ジュース","bière":"ビール",
"pomme":"りんご","fromage":"チーズ","poisson":"魚","viande":"肉","riz":"ご飯","œuf":"卵","gâteau":"ケーキ","soupe":"スープ",
"je bois du café":"私 は コーヒー を 飲みます","je mange une pomme":"私 は りんご を 食べます","nous mangeons du riz":"私たち は ご飯 を 食べます",
"zéro":"ゼロ","un":"一","deux":"二","trois":"三","quatre":"四","cinq":"五","six":"六","sept":"七","huit":"八","neuf":"九","dix":"十","cent":"百",
"j'ai deux chats":"猫 が 二匹 います","trois pommes":"りんご 三個",
"mère":"お母さん","père":"お父さん","frère":"兄","sœur":"姉","grand-mère":"おばあさん","grand-père":"おじいさん","bébé":"赤ちゃん","famille":"家族",
"rouge":"赤","bleu":"青","vert":"緑","jaune":"黄色","noir":"黒","blanc":"白","orange":"オレンジ色","rose":"ピンク",
"une fleur rouge":"赤い 花","le chat est noir":"猫 は 黒い です",
"cheval":"馬","oiseau":"鳥","vache":"牛","poule":"にわとり","cochon":"豚","lapin":"うさぎ","mouton":"羊","souris":"ねずみ",
"jour":"昼","nuit":"夜","matin":"朝","soir":"晩","semaine":"週","mois":"月","année":"年","heure":"時間","minute":"分","aujourd'hui":"今日","demain":"明日","hier":"昨日",
"gare":"駅","hôtel":"ホテル","rue":"道","gauche":"左","droite":"右","ici":"ここ","grand":"大きい","petit":"小さい","nouveau":"新しい","beau":"きれい","bon":"いい","vite":"速く",
"où est la gare":"駅 は どこ です か","la maison est grande":"家 は 大きい です","c'est un bon café":"これ は いい コーヒー です"
},
ko:{
"bonjour":"안녕하세요","salut":"안녕","au revoir":"안녕히 가세요","merci":"감사합니다","oui":"네","non":"아니요","s'il te plaît":"주세요","pardon":"미안해요",
"homme":"남자","femme":"여자","garçon":"남자아이","fille":"여자아이","ami":"친구","enfant":"아이","nom":"이름","moi":"나",
"eau":"물","pain":"빵","maison":"집","livre":"책","chien":"개","chat":"고양이",
"je suis un homme":"저는 남자입니다","elle est une femme":"그녀는 여자입니다","le chat boit de l'eau":"고양이가 물을 마셔요",
"café":"커피","lait":"우유","vin":"와인","thé":"차","jus":"주스","bière":"맥주",
"pomme":"사과","fromage":"치즈","poisson":"생선","viande":"고기","riz":"밥","œuf":"계란","gâteau":"케이크","soupe":"수프",
"je bois du café":"저는 커피를 마셔요","je mange une pomme":"저는 사과를 먹어요","nous mangeons du riz":"우리는 밥을 먹어요",
"zéro":"영","un":"하나","deux":"둘","trois":"셋","quatre":"넷","cinq":"다섯","six":"여섯","sept":"일곱","huit":"여덟","neuf":"아홉","dix":"열","cent":"백",
"j'ai deux chats":"고양이가 두 마리 있어요","trois pommes":"사과 세 개",
"mère":"엄마","père":"아빠","frère":"오빠","sœur":"언니","grand-mère":"할머니","grand-père":"할아버지","bébé":"아기","famille":"가족",
"rouge":"빨간색","bleu":"파란색","vert":"초록색","jaune":"노란색","noir":"검은색","blanc":"흰색","orange":"주황색","rose":"분홍색",
"une fleur rouge":"빨간 꽃","le chat est noir":"고양이는 검은색이에요",
"cheval":"말","oiseau":"새","vache":"소","poule":"닭","cochon":"돼지","lapin":"토끼","mouton":"양","souris":"쥐",
"jour":"낮","nuit":"밤","matin":"아침","soir":"저녁","semaine":"주","mois":"달","année":"년","heure":"시간","minute":"분","aujourd'hui":"오늘","demain":"내일","hier":"어제",
"gare":"기차역","hôtel":"호텔","rue":"길","gauche":"왼쪽","droite":"오른쪽","ici":"여기","grand":"크다","petit":"작다","nouveau":"새롭다","beau":"아름답다","bon":"좋다","vite":"빨리",
"où est la gare":"기차역이 어디예요","la maison est grande":"집이 커요","c'est un bon café":"이것은 좋은 커피예요"
},
ar:{
"bonjour":"مرحبا","salut":"أهلا","au revoir":"مع السلامة","merci":"شكرا","oui":"نعم","non":"لا","s'il te plaît":"من فضلك","pardon":"عفوا",
"homme":"رجل","femme":"امرأة","garçon":"ولد","fille":"بنت","ami":"صديق","enfant":"طفل","nom":"اسم","moi":"أنا",
"eau":"ماء","pain":"خبز","maison":"بيت","livre":"كتاب","chien":"كلب","chat":"قط",
"je suis un homme":"أنا رجل","elle est une femme":"هي امرأة","le chat boit de l'eau":"القط يشرب الماء",
"café":"قهوة","lait":"حليب","vin":"نبيذ","thé":"شاي","jus":"عصير","bière":"بيرة",
"pomme":"تفاحة","fromage":"جبن","poisson":"سمك","viande":"لحم","riz":"أرز","œuf":"بيضة","gâteau":"كعكة","soupe":"حساء",
"je bois du café":"أنا أشرب القهوة","je mange une pomme":"أنا آكل تفاحة","nous mangeons du riz":"نحن نأكل الأرز",
"zéro":"صفر","un":"واحد","deux":"اثنان","trois":"ثلاثة","quatre":"أربعة","cinq":"خمسة","six":"ستة","sept":"سبعة","huit":"ثمانية","neuf":"تسعة","dix":"عشرة","cent":"مئة",
"j'ai deux chats":"عندي قطان","trois pommes":"ثلاث تفاحات",
"mère":"أم","père":"أب","frère":"أخ","sœur":"أخت","grand-mère":"جدة","grand-père":"جد","bébé":"رضيع","famille":"عائلة",
"rouge":"أحمر","bleu":"أزرق","vert":"أخضر","jaune":"أصفر","noir":"أسود","blanc":"أبيض","orange":"برتقالي","rose":"وردي",
"une fleur rouge":"زهرة حمراء","le chat est noir":"القط أسود",
"cheval":"حصان","oiseau":"طائر","vache":"بقرة","poule":"دجاجة","cochon":"خنزير","lapin":"أرنب","mouton":"خروف","souris":"فأر",
"jour":"نهار","nuit":"ليل","matin":"صباح","soir":"مساء","semaine":"أسبوع","mois":"شهر","année":"سنة","heure":"ساعة","minute":"دقيقة","aujourd'hui":"اليوم","demain":"غدا","hier":"أمس",
"gare":"محطة القطار","hôtel":"فندق","rue":"شارع","gauche":"يسار","droite":"يمين","ici":"هنا","grand":"كبير","petit":"صغير","nouveau":"جديد","beau":"جميل","bon":"جيد","vite":"بسرعة",
"où est la gare":"أين محطة القطار","la maison est grande":"البيت كبير","c'est un bon café":"هذه قهوة جيدة"
}
};
/* Vague 2 des nouvelles langues (v2.69) : unités 9-16 — maison, vêtements, nature, phrases,
   verbes essentiels, corps, fruits & légumes, en ville. Les 8 cours passent de 8 à 16 unités.
   Notes vérité (homographes RÉELS assumés, pas des erreurs) : ja 月 = lune ET mois ;
   ko 달 = lune/mois, 배 = ventre/poire, 다리 = jambe/pont — c'est la langue. Verbes ar donnés
   à la 3ᵉ pers. du présent (convention des dictionnaires arabes) ; ja en forme polie ます. */
var LEX2B = {
pl:{
"table":"stół","chaise":"krzesło","lit":"łóżko","porte":"drzwi","fenêtre":"okno","clé":"klucz","téléphone":"telefon","lampe":"lampa","nous avons une maison":"mamy dom",
"chemise":"koszula","pantalon":"spodnie","chaussures":"buty","robe":"sukienka","chapeau":"kapelusz","manteau":"płaszcz",
"soleil":"słońce","lune":"księżyc","mer":"morze","montagne":"góra","arbre":"drzewo","fleur":"kwiat","ciel":"niebo","plage":"plaża","le soleil est grand":"słońce jest duże",
"je parle":"mówię","tu vas":"idziesz","il a un chien":"on ma psa","j'aime le café":"lubię kawę",
"être":"być","avoir":"mieć","aller":"iść","faire":"robić","venir":"przychodzić","voir":"widzieć","vouloir":"chcieć","pouvoir":"móc","manger":"jeść","boire":"pić","parler":"mówić","aimer":"kochać","savoir":"wiedzieć","dire":"powiedzieć","donner":"dawać","dormir":"spać",
"tête":"głowa","cheveux":"włosy","œil":"oko","nez":"nos","bouche":"usta","oreille":"ucho","dent":"ząb","main":"ręka","bras":"ramię","jambe":"noga","pied":"stopa","doigt":"palec","cœur":"serce","dos":"plecy","ventre":"brzuch",
"fruit":"owoc","banane":"banan","fraise":"truskawka","citron":"cytryna","raisin":"winogrona","poire":"gruszka","légume":"warzywo","tomate":"pomidor","carotte":"marchewka","oignon":"cebula","salade":"sałata","pomme de terre":"ziemniak",
"ville":"miasto","magasin":"sklep","marché":"targ","banque":"bank","école":"szkoła","hôpital":"szpital","pharmacie":"apteka","restaurant":"restauracja","église":"kościół","parc":"park","pont":"most","aéroport":"lotnisko","musée":"muzeum"
},
ru:{
"table":"стол","chaise":"стул","lit":"кровать","porte":"дверь","fenêtre":"окно","clé":"ключ","téléphone":"телефон","lampe":"лампа","nous avons une maison":"у нас есть дом",
"chemise":"рубашка","pantalon":"брюки","chaussures":"обувь","robe":"платье","chapeau":"шляпа","manteau":"пальто",
"soleil":"солнце","lune":"луна","mer":"море","montagne":"гора","arbre":"дерево","fleur":"цветок","ciel":"небо","plage":"пляж","le soleil est grand":"солнце большое",
"je parle":"я говорю","tu vas":"ты идёшь","il a un chien":"у него есть собака","j'aime le café":"я люблю кофе",
"être":"быть","avoir":"иметь","aller":"идти","faire":"делать","venir":"приходить","voir":"видеть","vouloir":"хотеть","pouvoir":"мочь","manger":"есть","boire":"пить","parler":"говорить","aimer":"любить","savoir":"знать","dire":"сказать","donner":"давать","dormir":"спать",
"tête":"голова","cheveux":"волосы","œil":"глаз","nez":"нос","bouche":"рот","oreille":"ухо","dent":"зуб","main":"кисть руки","bras":"рука","jambe":"нога","pied":"ступня","doigt":"палец","cœur":"сердце","dos":"спина","ventre":"живот",
"fruit":"фрукт","banane":"банан","fraise":"клубника","citron":"лимон","raisin":"виноград","poire":"груша","légume":"овощ","tomate":"помидор","carotte":"морковь","oignon":"лук","salade":"салат","pomme de terre":"картофель",
"ville":"город","magasin":"магазин","marché":"рынок","banque":"банк","école":"школа","hôpital":"больница","pharmacie":"аптека","restaurant":"ресторан","église":"церковь","parc":"парк","pont":"мост","aéroport":"аэропорт","musée":"музей"
},
uk:{
"table":"стіл","chaise":"стілець","lit":"ліжко","porte":"двері","fenêtre":"вікно","clé":"ключ","téléphone":"телефон","lampe":"лампа","nous avons une maison":"у нас є дім",
"chemise":"сорочка","pantalon":"штани","chaussures":"взуття","robe":"сукня","chapeau":"капелюх","manteau":"пальто",
"soleil":"сонце","lune":"місяць","mer":"море","montagne":"гора","arbre":"дерево","fleur":"квітка","ciel":"небо","plage":"пляж","le soleil est grand":"сонце велике",
"je parle":"я говорю","tu vas":"ти йдеш","il a un chien":"у нього є собака","j'aime le café":"я люблю каву",
"être":"бути","avoir":"мати","aller":"йти","faire":"робити","venir":"приходити","voir":"бачити","vouloir":"хотіти","pouvoir":"могти","manger":"їсти","boire":"пити","parler":"говорити","aimer":"любити","savoir":"знати","dire":"сказати","donner":"давати","dormir":"спати",
"tête":"голова","cheveux":"волосся","œil":"око","nez":"ніс","bouche":"рот","oreille":"вухо","dent":"зуб","main":"кисть руки","bras":"рука","jambe":"нога","pied":"ступня","doigt":"палець","cœur":"серце","dos":"спина","ventre":"живіт",
"fruit":"фрукт","banane":"банан","fraise":"полуниця","citron":"лимон","raisin":"виноград","poire":"груша","légume":"овоч","tomate":"помідор","carotte":"морква","oignon":"цибуля","salade":"салат","pomme de terre":"картопля",
"ville":"місто","magasin":"магазин","marché":"ринок","banque":"банк","école":"школа","hôpital":"лікарня","pharmacie":"аптека","restaurant":"ресторан","église":"церква","parc":"парк","pont":"міст","aéroport":"аеропорт","musée":"музей"
},
cs:{
"table":"stůl","chaise":"židle","lit":"postel","porte":"dveře","fenêtre":"okno","clé":"klíč","téléphone":"telefon","lampe":"lampa","nous avons une maison":"máme dům",
"chemise":"košile","pantalon":"kalhoty","chaussures":"boty","robe":"šaty","chapeau":"klobouk","manteau":"kabát",
"soleil":"slunce","lune":"měsíc","mer":"moře","montagne":"hora","arbre":"strom","fleur":"květina","ciel":"nebe","plage":"pláž","le soleil est grand":"slunce je velké",
"je parle":"mluvím","tu vas":"jdeš","il a un chien":"on má psa","j'aime le café":"mám ráda kávu",
"être":"být","avoir":"mít","aller":"jít","faire":"dělat","venir":"přijít","voir":"vidět","vouloir":"chtít","pouvoir":"moct","manger":"jíst","boire":"pít","parler":"mluvit","aimer":"milovat","savoir":"vědět","dire":"říct","donner":"dát","dormir":"spát",
"tête":"hlava","cheveux":"vlasy","œil":"oko","nez":"nos","bouche":"ústa","oreille":"ucho","dent":"zub","main":"ruka","bras":"paže","jambe":"noha","pied":"chodidlo","doigt":"prst","cœur":"srdce","dos":"záda","ventre":"břicho",
"fruit":"ovoce","banane":"banán","fraise":"jahoda","citron":"citron","raisin":"hrozny","poire":"hruška","légume":"zelenina","tomate":"rajče","carotte":"mrkev","oignon":"cibule","salade":"salát","pomme de terre":"brambora",
"ville":"město","magasin":"obchod","marché":"trh","banque":"banka","école":"škola","hôpital":"nemocnice","pharmacie":"lékárna","restaurant":"restaurace","église":"kostel","parc":"park","pont":"most","aéroport":"letiště","musée":"muzeum"
},
zh:{
"table":"桌子","chaise":"椅子","lit":"床","porte":"门","fenêtre":"窗户","clé":"钥匙","téléphone":"电话","lampe":"灯","nous avons une maison":"我们 有 房子",
"chemise":"衬衫","pantalon":"裤子","chaussures":"鞋子","robe":"连衣裙","chapeau":"帽子","manteau":"大衣",
"soleil":"太阳","lune":"月亮","mer":"大海","montagne":"山","arbre":"树","fleur":"花","ciel":"天空","plage":"海滩","le soleil est grand":"太阳 很 大",
"je parle":"我 说话","tu vas":"你 去","il a un chien":"他 有 一 只 狗","j'aime le café":"我 喜欢 咖啡",
"être":"是","avoir":"有","aller":"去","faire":"做","venir":"来","voir":"看","vouloir":"想要","pouvoir":"能","manger":"吃","boire":"喝","parler":"说话","aimer":"爱","savoir":"知道","dire":"说","donner":"给","dormir":"睡觉",
"tête":"头","cheveux":"头发","œil":"眼睛","nez":"鼻子","bouche":"嘴巴","oreille":"耳朵","dent":"牙齿","main":"手","bras":"手臂","jambe":"腿","pied":"脚","doigt":"手指","cœur":"心脏","dos":"背","ventre":"肚子",
"fruit":"水果","banane":"香蕉","fraise":"草莓","citron":"柠檬","raisin":"葡萄","poire":"梨","légume":"蔬菜","tomate":"西红柿","carotte":"胡萝卜","oignon":"洋葱","salade":"生菜","pomme de terre":"土豆",
"ville":"城市","magasin":"商店","marché":"市场","banque":"银行","école":"学校","hôpital":"医院","pharmacie":"药店","restaurant":"餐厅","église":"教堂","parc":"公园","pont":"桥","aéroport":"机场","musée":"博物馆"
},
ja:{
"table":"テーブル","chaise":"いす","lit":"ベッド","porte":"ドア","fenêtre":"窓","clé":"鍵","téléphone":"電話","lampe":"ランプ","nous avons une maison":"私たち は 家 が あります",
"chemise":"シャツ","pantalon":"ズボン","chaussures":"靴","robe":"ワンピース","chapeau":"帽子","manteau":"コート",
"soleil":"太陽","lune":"月","mer":"海","montagne":"山","arbre":"木","fleur":"花","ciel":"空","plage":"ビーチ","le soleil est grand":"太陽 は 大きい です",
"je parle":"私 は 話します","tu vas":"あなた は 行きます","il a un chien":"彼 は 犬 が います","j'aime le café":"私 は コーヒー が 好き です",
"être":"です","avoir":"あります","aller":"行きます","faire":"します","venir":"来ます","voir":"見ます","vouloir":"ほしい","pouvoir":"できます","manger":"食べます","boire":"飲みます","parler":"話します","aimer":"愛する","savoir":"知っています","dire":"言います","donner":"あげます","dormir":"寝ます",
"tête":"頭","cheveux":"髪","œil":"目","nez":"鼻","bouche":"口","oreille":"耳","dent":"歯","main":"手","bras":"腕","jambe":"脚","pied":"足","doigt":"指","cœur":"心臓","dos":"背中","ventre":"おなか",
"fruit":"果物","banane":"バナナ","fraise":"いちご","citron":"レモン","raisin":"ぶどう","poire":"なし","légume":"野菜","tomate":"トマト","carotte":"にんじん","oignon":"たまねぎ","salade":"レタス","pomme de terre":"じゃがいも",
"ville":"町","magasin":"店","marché":"市場","banque":"銀行","école":"学校","hôpital":"病院","pharmacie":"薬局","restaurant":"レストラン","église":"教会","parc":"公園","pont":"橋","aéroport":"空港","musée":"博物館"
},
ko:{
"table":"테이블","chaise":"의자","lit":"침대","porte":"문","fenêtre":"창문","clé":"열쇠","téléphone":"전화","lampe":"램프","nous avons une maison":"우리는 집이 있어요",
"chemise":"셔츠","pantalon":"바지","chaussures":"신발","robe":"원피스","chapeau":"모자","manteau":"코트",
"soleil":"해","lune":"달","mer":"바다","montagne":"산","arbre":"나무","fleur":"꽃","ciel":"하늘","plage":"해변","le soleil est grand":"해가 커요",
"je parle":"저는 말해요","tu vas":"당신은 가요","il a un chien":"그는 개가 있어요","j'aime le café":"저는 커피를 좋아해요",
"être":"이다","avoir":"있다","aller":"가다","faire":"하다","venir":"오다","voir":"보다","vouloir":"원하다","pouvoir":"할 수 있다","manger":"먹다","boire":"마시다","parler":"이야기하다","aimer":"사랑하다","savoir":"알다","dire":"말하다","donner":"주다","dormir":"자다",
"tête":"머리","cheveux":"머리카락","œil":"눈","nez":"코","bouche":"입","oreille":"귀","dent":"치아","main":"손","bras":"팔","jambe":"다리","pied":"발","doigt":"손가락","cœur":"심장","dos":"등","ventre":"배",
"fruit":"과일","banane":"바나나","fraise":"딸기","citron":"레몬","raisin":"포도","poire":"배","légume":"채소","tomate":"토마토","carotte":"당근","oignon":"양파","salade":"상추","pomme de terre":"감자",
"ville":"도시","magasin":"가게","marché":"시장","banque":"은행","école":"학교","hôpital":"병원","pharmacie":"약국","restaurant":"식당","église":"교회","parc":"공원","pont":"다리","aéroport":"공항","musée":"박물관"
},
ar:{
"table":"طاولة","chaise":"كرسي","lit":"سرير","porte":"باب","fenêtre":"نافذة","clé":"مفتاح","téléphone":"هاتف","lampe":"مصباح","nous avons une maison":"عندنا بيت",
"chemise":"قميص","pantalon":"بنطال","chaussures":"حذاء","robe":"فستان","chapeau":"قبعة","manteau":"معطف",
"soleil":"شمس","lune":"قمر","mer":"بحر","montagne":"جبل","arbre":"شجرة","fleur":"زهرة","ciel":"سماء","plage":"شاطئ","le soleil est grand":"الشمس كبيرة",
"je parle":"أنا أتكلم","tu vas":"أنت تذهب","il a un chien":"عنده كلب","j'aime le café":"أحب القهوة",
"être":"يكون","avoir":"يملك","aller":"يذهب","faire":"يفعل","venir":"يأتي","voir":"يرى","vouloir":"يريد","pouvoir":"يستطيع","manger":"يأكل","boire":"يشرب","parler":"يتكلم","aimer":"يحب","savoir":"يعرف","dire":"يقول","donner":"يعطي","dormir":"ينام",
"tête":"رأس","cheveux":"شعر","œil":"عين","nez":"أنف","bouche":"فم","oreille":"أذن","dent":"سن","main":"يد","bras":"ذراع","jambe":"ساق","pied":"قدم","doigt":"إصبع","cœur":"قلب","dos":"ظهر","ventre":"بطن",
"fruit":"فاكهة","banane":"موز","fraise":"فراولة","citron":"ليمون","raisin":"عنب","poire":"كمثرى","légume":"خضار","tomate":"طماطم","carotte":"جزر","oignon":"بصل","salade":"خس","pomme de terre":"بطاطا",
"ville":"مدينة","magasin":"متجر","marché":"سوق","banque":"بنك","école":"مدرسة","hôpital":"مستشفى","pharmacie":"صيدلية","restaurant":"مطعم","église":"كنيسة","parc":"حديقة","pont":"جسر","aéroport":"مطار","musée":"متحف"
}
};
LANGS2.forEach(function(l){ var b=LEX2B[l]||{}; Object.keys(b).forEach(function(k){ LEX2[l][k]=b[k]; }); });
/* Vague 3 des nouvelles langues (v2.71) : unités 17-24 — transports, métiers, jours & saisons,
   météo, adjectifs utiles, restaurant, achats, questions. Les 8 cours passent de 16 à 24 unités.
   Homographes RÉELS assumés (c'est la langue, pas une erreur) : ko 배 = bateau (déjà ventre/poire),
   ko 눈 = neige (déjà œil) ; cs stát = coûter (aussi « être debout »). Adjectifs ko en forme du
   dictionnaire (-다), verbes ja en forme polie ます. */
var LEX2C = {
pl:{
"voiture":"samochód","bus":"autobus","vélo":"rower","moto":"motocykl","taxi":"taksówka","camion":"ciężarówka","train":"pociąg","avion":"samolot","bateau":"statek","métro":"metro",
"médecin":"lekarz","professeur":"nauczyciel","cuisinier":"kucharz","policier":"policjant","serveur":"kelner","avocat":"prawnik","ingénieur":"inżynier","artiste":"artysta","boulanger":"piekarz","agriculteur":"rolnik",
"lundi":"poniedziałek","mardi":"wtorek","mercredi":"środa","jeudi":"czwartek","vendredi":"piątek","samedi":"sobota","dimanche":"niedziela","printemps":"wiosna","été":"lato","automne":"jesień","hiver":"zima",
"pluie":"deszcz","neige":"śnieg","vent":"wiatr","nuage":"chmura","orage":"burza","chaud":"gorący","froid":"zimny","il pleut":"pada deszcz","il fait chaud":"jest gorąco",
"heureux":"szczęśliwy","triste":"smutny","facile":"łatwy","difficile":"trudny","jeune":"młody","vieux":"stary","propre":"czysty","sale":"brudny","plein":"pełny","vide":"pusty","cher":"drogi","content":"zadowolony",
"menu":"menu","plat":"danie","entrée":"przystawka","dessert":"deser","addition":"rachunek","fourchette":"widelec","couteau":"nóż","cuillère":"łyżka","assiette":"talerz","verre":"szklanka","tasse":"filiżanka",
"argent":"pieniądze","prix":"cena","euro":"euro","carte":"karta","monnaie":"reszta","acheter":"kupować","vendre":"sprzedawać","payer":"płacić","coûter":"kosztować",
"qui":"kto","quoi":"co","où":"gdzie","quand":"kiedy","comment":"jak","pourquoi":"dlaczego","combien":"ile"
},
ru:{
"voiture":"машина","bus":"автобус","vélo":"велосипед","moto":"мотоцикл","taxi":"такси","camion":"грузовик","train":"поезд","avion":"самолёт","bateau":"корабль","métro":"метро",
"médecin":"врач","professeur":"учитель","cuisinier":"повар","policier":"полицейский","serveur":"официант","avocat":"адвокат","ingénieur":"инженер","artiste":"художник","boulanger":"пекарь","agriculteur":"фермер",
"lundi":"понедельник","mardi":"вторник","mercredi":"среда","jeudi":"четверг","vendredi":"пятница","samedi":"суббота","dimanche":"воскресенье","printemps":"весна","été":"лето","automne":"осень","hiver":"зима",
"pluie":"дождь","neige":"снег","vent":"ветер","nuage":"облако","orage":"гроза","chaud":"горячий","froid":"холодный","il pleut":"идёт дождь","il fait chaud":"жарко",
"heureux":"счастливый","triste":"грустный","facile":"лёгкий","difficile":"трудный","jeune":"молодой","vieux":"старый","propre":"чистый","sale":"грязный","plein":"полный","vide":"пустой","cher":"дорогой","content":"довольный",
"menu":"меню","plat":"блюдо","entrée":"закуска","dessert":"десерт","addition":"счёт","fourchette":"вилка","couteau":"нож","cuillère":"ложка","assiette":"тарелка","verre":"стакан","tasse":"чашка",
"argent":"деньги","prix":"цена","euro":"евро","carte":"карта","monnaie":"сдача","acheter":"покупать","vendre":"продавать","payer":"платить","coûter":"стоить",
"qui":"кто","quoi":"что","où":"где","quand":"когда","comment":"как","pourquoi":"почему","combien":"сколько"
},
uk:{
"voiture":"машина","bus":"автобус","vélo":"велосипед","moto":"мотоцикл","taxi":"таксі","camion":"вантажівка","train":"потяг","avion":"літак","bateau":"корабель","métro":"метро",
"médecin":"лікар","professeur":"вчитель","cuisinier":"кухар","policier":"поліцейський","serveur":"офіціант","avocat":"адвокат","ingénieur":"інженер","artiste":"художник","boulanger":"пекар","agriculteur":"фермер",
"lundi":"понеділок","mardi":"вівторок","mercredi":"середа","jeudi":"четвер","vendredi":"п'ятниця","samedi":"субота","dimanche":"неділя","printemps":"весна","été":"літо","automne":"осінь","hiver":"зима",
"pluie":"дощ","neige":"сніг","vent":"вітер","nuage":"хмара","orage":"гроза","chaud":"гарячий","froid":"холодний","il pleut":"іде дощ","il fait chaud":"спекотно",
"heureux":"щасливий","triste":"сумний","facile":"легкий","difficile":"складний","jeune":"молодий","vieux":"старий","propre":"чистий","sale":"брудний","plein":"повний","vide":"порожній","cher":"дорогий","content":"задоволений",
"menu":"меню","plat":"страва","entrée":"закуска","dessert":"десерт","addition":"рахунок","fourchette":"виделка","couteau":"ніж","cuillère":"ложка","assiette":"тарілка","verre":"склянка","tasse":"чашка",
"argent":"гроші","prix":"ціна","euro":"євро","carte":"картка","monnaie":"решта","acheter":"купувати","vendre":"продавати","payer":"платити","coûter":"коштувати",
"qui":"хто","quoi":"що","où":"де","quand":"коли","comment":"як","pourquoi":"чому","combien":"скільки"
},
cs:{
"voiture":"auto","bus":"autobus","vélo":"kolo","moto":"motorka","taxi":"taxi","camion":"kamion","train":"vlak","avion":"letadlo","bateau":"loď","métro":"metro",
"médecin":"lékař","professeur":"učitel","cuisinier":"kuchař","policier":"policista","serveur":"číšník","avocat":"právník","ingénieur":"inženýr","artiste":"umělec","boulanger":"pekař","agriculteur":"zemědělec",
"lundi":"pondělí","mardi":"úterý","mercredi":"středa","jeudi":"čtvrtek","vendredi":"pátek","samedi":"sobota","dimanche":"neděle","printemps":"jaro","été":"léto","automne":"podzim","hiver":"zima",
"pluie":"déšť","neige":"sníh","vent":"vítr","nuage":"mrak","orage":"bouřka","chaud":"horký","froid":"studený","il pleut":"prší","il fait chaud":"je horko",
"heureux":"šťastný","triste":"smutný","facile":"snadný","difficile":"těžký","jeune":"mladý","vieux":"starý","propre":"čistý","sale":"špinavý","plein":"plný","vide":"prázdný","cher":"drahý","content":"spokojený",
"menu":"jídelní lístek","plat":"jídlo","entrée":"předkrm","dessert":"dezert","addition":"účet","fourchette":"vidlička","couteau":"nůž","cuillère":"lžíce","assiette":"talíř","verre":"sklenice","tasse":"šálek",
"argent":"peníze","prix":"cena","euro":"euro","carte":"karta","monnaie":"drobné","acheter":"kupovat","vendre":"prodávat","payer":"platit","coûter":"stát",
"qui":"kdo","quoi":"co","où":"kde","quand":"kdy","comment":"jak","pourquoi":"proč","combien":"kolik"
},
zh:{
"voiture":"汽车","bus":"公共汽车","vélo":"自行车","moto":"摩托车","taxi":"出租车","camion":"卡车","train":"火车","avion":"飞机","bateau":"船","métro":"地铁",
"médecin":"医生","professeur":"老师","cuisinier":"厨师","policier":"警察","serveur":"服务员","avocat":"律师","ingénieur":"工程师","artiste":"艺术家","boulanger":"面包师","agriculteur":"农民",
"lundi":"星期一","mardi":"星期二","mercredi":"星期三","jeudi":"星期四","vendredi":"星期五","samedi":"星期六","dimanche":"星期日","printemps":"春天","été":"夏天","automne":"秋天","hiver":"冬天",
"pluie":"雨","neige":"雪","vent":"风","nuage":"云","orage":"雷雨","chaud":"热","froid":"冷","il pleut":"下雨 了","il fait chaud":"天气 很 热",
"heureux":"幸福","triste":"难过","facile":"容易","difficile":"难","jeune":"年轻","vieux":"老","propre":"干净","sale":"脏","plein":"满","vide":"空","cher":"贵","content":"高兴",
"menu":"菜单","plat":"菜","entrée":"开胃菜","dessert":"甜点","addition":"账单","fourchette":"叉子","couteau":"刀","cuillère":"勺子","assiette":"盘子","verre":"玻璃杯","tasse":"杯子",
"argent":"钱","prix":"价格","euro":"欧元","carte":"银行卡","monnaie":"零钱","acheter":"买","vendre":"卖","payer":"付钱","coûter":"花费",
"qui":"谁","quoi":"什么","où":"哪里","quand":"什么时候","comment":"怎么","pourquoi":"为什么","combien":"多少"
},
ja:{
"voiture":"車","bus":"バス","vélo":"自転車","moto":"バイク","taxi":"タクシー","camion":"トラック","train":"電車","avion":"飛行機","bateau":"船","métro":"地下鉄",
"médecin":"医者","professeur":"先生","cuisinier":"料理人","policier":"警察官","serveur":"ウェイター","avocat":"弁護士","ingénieur":"エンジニア","artiste":"芸術家","boulanger":"パン職人","agriculteur":"農家",
"lundi":"月曜日","mardi":"火曜日","mercredi":"水曜日","jeudi":"木曜日","vendredi":"金曜日","samedi":"土曜日","dimanche":"日曜日","printemps":"春","été":"夏","automne":"秋","hiver":"冬",
"pluie":"雨","neige":"雪","vent":"風","nuage":"雲","orage":"雷雨","chaud":"暑い","froid":"寒い","il pleut":"雨 が 降っています","il fait chaud":"暑い です",
"heureux":"幸せ","triste":"悲しい","facile":"簡単","difficile":"難しい","jeune":"若い","vieux":"古い","propre":"清潔","sale":"汚い","plein":"いっぱい","vide":"空っぽ","cher":"高い","content":"うれしい",
"menu":"メニュー","plat":"料理","entrée":"前菜","dessert":"デザート","addition":"お会計","fourchette":"フォーク","couteau":"ナイフ","cuillère":"スプーン","assiette":"皿","verre":"グラス","tasse":"カップ",
"argent":"お金","prix":"値段","euro":"ユーロ","carte":"カード","monnaie":"おつり","acheter":"買います","vendre":"売ります","payer":"払います","coûter":"かかります",
"qui":"誰","quoi":"何","où":"どこ","quand":"いつ","comment":"どうやって","pourquoi":"なぜ","combien":"いくら"
},
ko:{
"voiture":"자동차","bus":"버스","vélo":"자전거","moto":"오토바이","taxi":"택시","camion":"트럭","train":"기차","avion":"비행기","bateau":"배","métro":"지하철",
"médecin":"의사","professeur":"선생님","cuisinier":"요리사","policier":"경찰관","serveur":"웨이터","avocat":"변호사","ingénieur":"엔지니어","artiste":"예술가","boulanger":"제빵사","agriculteur":"농부",
"lundi":"월요일","mardi":"화요일","mercredi":"수요일","jeudi":"목요일","vendredi":"금요일","samedi":"토요일","dimanche":"일요일","printemps":"봄","été":"여름","automne":"가을","hiver":"겨울",
"pluie":"비","neige":"눈","vent":"바람","nuage":"구름","orage":"뇌우","chaud":"덥다","froid":"춥다","il pleut":"비가 와요","il fait chaud":"날씨가 더워요",
"heureux":"행복하다","triste":"슬프다","facile":"쉽다","difficile":"어렵다","jeune":"젊다","vieux":"늙다","propre":"깨끗하다","sale":"더럽다","plein":"가득하다","vide":"비다","cher":"비싸다","content":"기쁘다",
"menu":"메뉴","plat":"요리","entrée":"애피타이저","dessert":"디저트","addition":"계산서","fourchette":"포크","couteau":"칼","cuillère":"숟가락","assiette":"접시","verre":"유리잔","tasse":"컵",
"argent":"돈","prix":"가격","euro":"유로","carte":"카드","monnaie":"거스름돈","acheter":"사다","vendre":"팔다","payer":"지불하다","coûter":"돈이 들다",
"qui":"누구","quoi":"무엇","où":"어디","quand":"언제","comment":"어떻게","pourquoi":"왜","combien":"얼마"
},
ar:{
"voiture":"سيارة","bus":"حافلة","vélo":"دراجة","moto":"دراجة نارية","taxi":"سيارة أجرة","camion":"شاحنة","train":"قطار","avion":"طائرة","bateau":"سفينة","métro":"مترو",
"médecin":"طبيب","professeur":"معلم","cuisinier":"طباخ","policier":"شرطي","serveur":"نادل","avocat":"محام","ingénieur":"مهندس","artiste":"فنان","boulanger":"خباز","agriculteur":"مزارع",
"lundi":"الاثنين","mardi":"الثلاثاء","mercredi":"الأربعاء","jeudi":"الخميس","vendredi":"الجمعة","samedi":"السبت","dimanche":"الأحد","printemps":"الربيع","été":"الصيف","automne":"الخريف","hiver":"الشتاء",
"pluie":"مطر","neige":"ثلج","vent":"ريح","nuage":"سحابة","orage":"عاصفة","chaud":"حار","froid":"بارد","il pleut":"إنها تمطر","il fait chaud":"الجو حار",
"heureux":"سعيد","triste":"حزين","facile":"سهل","difficile":"صعب","jeune":"شاب","vieux":"عجوز","propre":"نظيف","sale":"متسخ","plein":"ممتلئ","vide":"فارغ","cher":"غالي","content":"مسرور",
"menu":"قائمة الطعام","plat":"طبق","entrée":"مقبلات","dessert":"حلوى","addition":"الحساب","fourchette":"شوكة","couteau":"سكين","cuillère":"ملعقة","assiette":"صحن","verre":"كوب","tasse":"فنجان",
"argent":"مال","prix":"سعر","euro":"يورو","carte":"بطاقة","monnaie":"فكة","acheter":"يشتري","vendre":"يبيع","payer":"يدفع","coûter":"يكلف",
"qui":"من","quoi":"ماذا","où":"أين","quand":"متى","comment":"كيف","pourquoi":"لماذا","combien":"كم"
}
};
LANGS2.forEach(function(l){ var c2=LEX2C[l]||{}; Object.keys(c2).forEach(function(k){ LEX2[l][k]=c2[k]; }); });
/* Vague 4 des nouvelles langues (v2.73) : unités 25-32 — nombres 11-1000, émotions, le temps qui
   passe, au travail, la santé, les loisirs, la technologie, opinions & idées. 24 → 32 unités.
   Homographes réels assumés : zh 工作 = travail/travailler ; ko 일 = travail (aussi jour/un),
   쓰다 = écrire (aussi porter/utiliser). Genre : cs à la voix de Bee (féminin) ; pl/ru colle au
   masculin du français affiché. Coréen : nombres natifs jusqu'à 50, sino-coréen 천 (1000). */
var LEX2D = {
pl:{
"onze":"jedenaście","douze":"dwanaście","treize":"trzynaście","quatorze":"czternaście","quinze":"piętnaście","seize":"szesnaście","dix-sept":"siedemnaście","dix-huit":"osiemnaście","dix-neuf":"dziewiętnaście","vingt":"dwadzieścia","trente":"trzydzieści","quarante":"czterdzieści","cinquante":"pięćdziesiąt","mille":"tysiąc",
"fatigué":"zmęczony","fâché":"zły","inquiet":"zmartwiony","surpris":"zaskoczony","fier":"dumny","calme":"spokojny","seul":"samotny","amoureux":"zakochany","peur":"strach","rire":"śmiać się","pleurer":"płakać","je suis fatigué":"jestem zmęczony","elle a peur":"ona się boi",
"maintenant":"teraz","bientôt":"wkrótce","tard":"późno","tôt":"wcześnie","longtemps":"długo","toujours":"zawsze","jamais":"nigdy","souvent":"często","parfois":"czasami","avant":"przed","après":"po","je mange maintenant":"jem teraz","je bois souvent du thé":"często piję herbatę",
"travail":"praca","bureau":"biuro","réunion":"spotkanie","patron":"szef","collègue":"kolega","ordinateur":"komputer","projet":"projekt","salaire":"pensja","entreprise":"firma","réussir":"odnieść sukces","travailler":"pracować","je travaille au bureau":"pracuję w biurze","j'aime mon travail":"lubię moją pracę",
"malade":"chory","douleur":"ból","médicament":"lekarstwo","fièvre":"gorączka","se reposer":"odpoczywać","guérir":"wyzdrowieć","santé":"zdrowie","fort":"silny","faible":"słaby","respirer":"oddychać","je suis malade":"jestem chory","je vais mieux":"czuję się lepiej",
"jouer":"grać","nager":"pływać","courir":"biegać","danser":"tańczyć","voyager":"podróżować","sport":"sport","lire":"czytać","écrire":"pisać","chanter":"śpiewać","musique":"muzyka","film":"film","jeu":"gra","j'aime le sport":"lubię sport","j'aime lire":"lubię czytać",
"écran":"ekran","message":"wiadomość","photo":"zdjęcie","application":"aplikacja","batterie":"bateria","internet":"internet","mot de passe":"hasło","en ligne":"online","clavier":"klawiatura","ordinateur portable":"laptop","je regarde une photo":"oglądam zdjęcie","je suis en ligne":"jestem online",
"penser":"myśleć","croire":"wierzyć","comprendre":"rozumieć","expliquer":"wyjaśniać","raison":"powód","vérité":"prawda","problème":"problem","solution":"rozwiązanie","idée":"pomysł","important":"ważny","je pense que oui":"myślę że tak","c'est une bonne idée":"to dobry pomysł"
},
ru:{
"onze":"одиннадцать","douze":"двенадцать","treize":"тринадцать","quatorze":"четырнадцать","quinze":"пятнадцать","seize":"шестнадцать","dix-sept":"семнадцать","dix-huit":"восемнадцать","dix-neuf":"девятнадцать","vingt":"двадцать","trente":"тридцать","quarante":"сорок","cinquante":"пятьдесят","mille":"тысяча",
"fatigué":"усталый","fâché":"сердитый","inquiet":"обеспокоенный","surpris":"удивлённый","fier":"гордый","calme":"спокойный","seul":"одинокий","amoureux":"влюблённый","peur":"страх","rire":"смеяться","pleurer":"плакать","je suis fatigué":"я устал","elle a peur":"она боится",
"maintenant":"сейчас","bientôt":"скоро","tard":"поздно","tôt":"рано","longtemps":"долго","toujours":"всегда","jamais":"никогда","souvent":"часто","parfois":"иногда","avant":"до","après":"после","je mange maintenant":"я ем сейчас","je bois souvent du thé":"я часто пью чай",
"travail":"работа","bureau":"офис","réunion":"совещание","patron":"начальник","collègue":"коллега","ordinateur":"компьютер","projet":"проект","salaire":"зарплата","entreprise":"компания","réussir":"преуспеть","travailler":"работать","je travaille au bureau":"я работаю в офисе","j'aime mon travail":"я люблю свою работу",
"malade":"больной","douleur":"боль","médicament":"лекарство","fièvre":"жар","se reposer":"отдыхать","guérir":"выздороветь","santé":"здоровье","fort":"сильный","faible":"слабый","respirer":"дышать","je suis malade":"я болею","je vais mieux":"мне лучше",
"jouer":"играть","nager":"плавать","courir":"бегать","danser":"танцевать","voyager":"путешествовать","sport":"спорт","lire":"читать","écrire":"писать","chanter":"петь","musique":"музыка","film":"фильм","jeu":"игра","j'aime le sport":"я люблю спорт","j'aime lire":"я люблю читать",
"écran":"экран","message":"сообщение","photo":"фотография","application":"приложение","batterie":"батарея","internet":"интернет","mot de passe":"пароль","en ligne":"онлайн","clavier":"клавиатура","ordinateur portable":"ноутбук","je regarde une photo":"я смотрю фотографию","je suis en ligne":"я онлайн",
"penser":"думать","croire":"верить","comprendre":"понимать","expliquer":"объяснять","raison":"причина","vérité":"правда","problème":"проблема","solution":"решение","idée":"идея","important":"важный","je pense que oui":"я думаю что да","c'est une bonne idée":"это хорошая идея"
},
uk:{
"onze":"одинадцять","douze":"дванадцять","treize":"тринадцять","quatorze":"чотирнадцять","quinze":"п'ятнадцять","seize":"шістнадцять","dix-sept":"сімнадцять","dix-huit":"вісімнадцять","dix-neuf":"дев'ятнадцять","vingt":"двадцять","trente":"тридцять","quarante":"сорок","cinquante":"п'ятдесят","mille":"тисяча",
"fatigué":"втомлений","fâché":"сердитий","inquiet":"стурбований","surpris":"здивований","fier":"гордий","calme":"спокійний","seul":"самотній","amoureux":"закоханий","peur":"страх","rire":"сміятися","pleurer":"плакати","je suis fatigué":"я втомлений","elle a peur":"вона боїться",
"maintenant":"зараз","bientôt":"скоро","tard":"пізно","tôt":"рано","longtemps":"довго","toujours":"завжди","jamais":"ніколи","souvent":"часто","parfois":"іноді","avant":"до","après":"після","je mange maintenant":"я їм зараз","je bois souvent du thé":"я часто п'ю чай",
"travail":"робота","bureau":"офіс","réunion":"нарада","patron":"начальник","collègue":"колега","ordinateur":"комп'ютер","projet":"проєкт","salaire":"зарплата","entreprise":"компанія","réussir":"досягти успіху","travailler":"працювати","je travaille au bureau":"я працюю в офісі","j'aime mon travail":"я люблю свою роботу",
"malade":"хворий","douleur":"біль","médicament":"ліки","fièvre":"гарячка","se reposer":"відпочивати","guérir":"одужати","santé":"здоров'я","fort":"сильний","faible":"слабкий","respirer":"дихати","je suis malade":"я хворію","je vais mieux":"мені краще",
"jouer":"грати","nager":"плавати","courir":"бігати","danser":"танцювати","voyager":"подорожувати","sport":"спорт","lire":"читати","écrire":"писати","chanter":"співати","musique":"музика","film":"фільм","jeu":"гра","j'aime le sport":"я люблю спорт","j'aime lire":"я люблю читати",
"écran":"екран","message":"повідомлення","photo":"фотографія","application":"застосунок","batterie":"батарея","internet":"інтернет","mot de passe":"пароль","en ligne":"онлайн","clavier":"клавіатура","ordinateur portable":"ноутбук","je regarde une photo":"я дивлюся фотографію","je suis en ligne":"я онлайн",
"penser":"думати","croire":"вірити","comprendre":"розуміти","expliquer":"пояснювати","raison":"причина","vérité":"правда","problème":"проблема","solution":"рішення","idée":"ідея","important":"важливий","je pense que oui":"я думаю що так","c'est une bonne idée":"це хороша ідея"
},
cs:{
"onze":"jedenáct","douze":"dvanáct","treize":"třináct","quatorze":"čtrnáct","quinze":"patnáct","seize":"šestnáct","dix-sept":"sedmnáct","dix-huit":"osmnáct","dix-neuf":"devatenáct","vingt":"dvacet","trente":"třicet","quarante":"čtyřicet","cinquante":"padesát","mille":"tisíc",
"fatigué":"unavený","fâché":"naštvaný","inquiet":"ustaraný","surpris":"překvapený","fier":"hrdý","calme":"klidný","seul":"osamělý","amoureux":"zamilovaný","peur":"strach","rire":"smát se","pleurer":"plakat","je suis fatigué":"jsem unavená","elle a peur":"ona se bojí",
"maintenant":"teď","bientôt":"brzy","tard":"pozdě","tôt":"časně","longtemps":"dlouho","toujours":"vždy","jamais":"nikdy","souvent":"často","parfois":"někdy","avant":"před","après":"po","je mange maintenant":"jím teď","je bois souvent du thé":"často piju čaj",
"travail":"práce","bureau":"kancelář","réunion":"schůzka","patron":"šéf","collègue":"kolega","ordinateur":"počítač","projet":"projekt","salaire":"plat","entreprise":"firma","réussir":"uspět","travailler":"pracovat","je travaille au bureau":"pracuji v kanceláři","j'aime mon travail":"mám ráda svou práci",
"malade":"nemocný","douleur":"bolest","médicament":"lék","fièvre":"horečka","se reposer":"odpočívat","guérir":"uzdravit se","santé":"zdraví","fort":"silný","faible":"slabý","respirer":"dýchat","je suis malade":"jsem nemocná","je vais mieux":"je mi lépe",
"jouer":"hrát","nager":"plavat","courir":"běhat","danser":"tancovat","voyager":"cestovat","sport":"sport","lire":"číst","écrire":"psát","chanter":"zpívat","musique":"hudba","film":"film","jeu":"hra","j'aime le sport":"mám ráda sport","j'aime lire":"ráda čtu",
"écran":"obrazovka","message":"zpráva","photo":"fotka","application":"aplikace","batterie":"baterie","internet":"internet","mot de passe":"heslo","en ligne":"online","clavier":"klávesnice","ordinateur portable":"notebook","je regarde une photo":"dívám se na fotku","je suis en ligne":"jsem online",
"penser":"myslet","croire":"věřit","comprendre":"rozumět","expliquer":"vysvětlit","raison":"důvod","vérité":"pravda","problème":"problém","solution":"řešení","idée":"nápad","important":"důležitý","je pense que oui":"myslím že ano","c'est une bonne idée":"to je dobrý nápad"
},
zh:{
"onze":"十一","douze":"十二","treize":"十三","quatorze":"十四","quinze":"十五","seize":"十六","dix-sept":"十七","dix-huit":"十八","dix-neuf":"十九","vingt":"二十","trente":"三十","quarante":"四十","cinquante":"五十","mille":"千",
"fatigué":"累","fâché":"生气","inquiet":"担心","surpris":"惊讶","fier":"骄傲","calme":"平静","seul":"孤单","amoureux":"恋爱中","peur":"害怕","rire":"笑","pleurer":"哭","je suis fatigué":"我 很 累","elle a peur":"她 害怕",
"maintenant":"现在","bientôt":"很快","tard":"晚","tôt":"早","longtemps":"很久","toujours":"总是","jamais":"从不","souvent":"经常","parfois":"有时","avant":"以前","après":"以后","je mange maintenant":"我 现在 吃饭","je bois souvent du thé":"我 经常 喝 茶",
"travail":"工作","bureau":"办公室","réunion":"会议","patron":"老板","collègue":"同事","ordinateur":"电脑","projet":"项目","salaire":"工资","entreprise":"公司","réussir":"成功","travailler":"工作","je travaille au bureau":"我 在 办公室 工作","j'aime mon travail":"我 喜欢 我 的 工作",
"malade":"生病","douleur":"疼痛","médicament":"药","fièvre":"发烧","se reposer":"休息","guérir":"康复","santé":"健康","fort":"强壮","faible":"虚弱","respirer":"呼吸","je suis malade":"我 生病 了","je vais mieux":"我 好多 了",
"jouer":"玩","nager":"游泳","courir":"跑步","danser":"跳舞","voyager":"旅行","sport":"运动","lire":"读书","écrire":"写","chanter":"唱歌","musique":"音乐","film":"电影","jeu":"游戏","j'aime le sport":"我 喜欢 运动","j'aime lire":"我 喜欢 读书",
"écran":"屏幕","message":"消息","photo":"照片","application":"应用","batterie":"电池","internet":"互联网","mot de passe":"密码","en ligne":"在线","clavier":"键盘","ordinateur portable":"笔记本电脑","je regarde une photo":"我 看 照片","je suis en ligne":"我 在线",
"penser":"想","croire":"相信","comprendre":"明白","expliquer":"解释","raison":"原因","vérité":"真相","problème":"问题","solution":"解决办法","idée":"主意","important":"重要","je pense que oui":"我 想 是 的","c'est une bonne idée":"这 是 个 好 主意"
},
ja:{
"onze":"十一","douze":"十二","treize":"十三","quatorze":"十四","quinze":"十五","seize":"十六","dix-sept":"十七","dix-huit":"十八","dix-neuf":"十九","vingt":"二十","trente":"三十","quarante":"四十","cinquante":"五十","mille":"千",
"fatigué":"疲れた","fâché":"怒っている","inquiet":"心配","surpris":"驚いた","fier":"誇らしい","calme":"穏やか","seul":"一人ぼっち","amoureux":"恋している","peur":"恐れ","rire":"笑います","pleurer":"泣きます","je suis fatigué":"私 は 疲れました","elle a peur":"彼女 は 怖がっています",
"maintenant":"今","bientôt":"もうすぐ","tard":"遅く","tôt":"早く","longtemps":"長い間","toujours":"いつも","jamais":"決して","souvent":"よく","parfois":"時々","avant":"前","après":"後","je mange maintenant":"私 は 今 食べます","je bois souvent du thé":"私 は よく お茶 を 飲みます",
"travail":"仕事","bureau":"オフィス","réunion":"会議","patron":"上司","collègue":"同僚","ordinateur":"パソコン","projet":"プロジェクト","salaire":"給料","entreprise":"会社","réussir":"成功します","travailler":"働きます","je travaille au bureau":"私 は オフィス で 働きます","j'aime mon travail":"私 は 仕事 が 好き です",
"malade":"病気","douleur":"痛み","médicament":"薬","fièvre":"熱","se reposer":"休みます","guérir":"治ります","santé":"健康","fort":"強い","faible":"弱い","respirer":"呼吸します","je suis malade":"私 は 病気 です","je vais mieux":"私 は よくなりました",
"jouer":"遊びます","nager":"泳ぎます","courir":"走ります","danser":"踊ります","voyager":"旅行します","sport":"スポーツ","lire":"読みます","écrire":"書きます","chanter":"歌います","musique":"音楽","film":"映画","jeu":"ゲーム","j'aime le sport":"私 は スポーツ が 好き です","j'aime lire":"私 は 読書 が 好き です",
"écran":"画面","message":"メッセージ","photo":"写真","application":"アプリ","batterie":"バッテリー","internet":"インターネット","mot de passe":"パスワード","en ligne":"オンライン","clavier":"キーボード","ordinateur portable":"ノートパソコン","je regarde une photo":"私 は 写真 を 見ます","je suis en ligne":"私 は オンライン です",
"penser":"思います","croire":"信じます","comprendre":"わかります","expliquer":"説明します","raison":"理由","vérité":"真実","problème":"問題","solution":"解決策","idée":"アイデア","important":"大切","je pense que oui":"私 は そう 思います","c'est une bonne idée":"それ は いい アイデア です"
},
ko:{
"onze":"열하나","douze":"열둘","treize":"열셋","quatorze":"열넷","quinze":"열다섯","seize":"열여섯","dix-sept":"열일곱","dix-huit":"열여덟","dix-neuf":"열아홉","vingt":"스물","trente":"서른","quarante":"마흔","cinquante":"쉰","mille":"천",
"fatigué":"피곤하다","fâché":"화나다","inquiet":"걱정하다","surpris":"놀라다","fier":"자랑스럽다","calme":"차분하다","seul":"외롭다","amoureux":"사랑에 빠지다","peur":"두려움","rire":"웃다","pleurer":"울다","je suis fatigué":"저는 피곤해요","elle a peur":"그녀는 무서워해요",
"maintenant":"지금","bientôt":"곧","tard":"늦게","tôt":"일찍","longtemps":"오랫동안","toujours":"항상","jamais":"절대","souvent":"자주","parfois":"가끔","avant":"전에","après":"후에","je mange maintenant":"저는 지금 먹어요","je bois souvent du thé":"저는 자주 차를 마셔요",
"travail":"일","bureau":"사무실","réunion":"회의","patron":"상사","collègue":"동료","ordinateur":"컴퓨터","projet":"프로젝트","salaire":"월급","entreprise":"회사","réussir":"성공하다","travailler":"일하다","je travaille au bureau":"저는 사무실에서 일해요","j'aime mon travail":"저는 제 일을 좋아해요",
"malade":"아프다","douleur":"통증","médicament":"약","fièvre":"열","se reposer":"쉬다","guérir":"낫다","santé":"건강","fort":"강하다","faible":"약하다","respirer":"숨쉬다","je suis malade":"저는 아파요","je vais mieux":"저는 나아지고 있어요",
"jouer":"놀다","nager":"수영하다","courir":"달리다","danser":"춤추다","voyager":"여행하다","sport":"운동","lire":"읽다","écrire":"쓰다","chanter":"노래하다","musique":"음악","film":"영화","jeu":"게임","j'aime le sport":"저는 운동을 좋아해요","j'aime lire":"저는 읽는 것을 좋아해요",
"écran":"화면","message":"메시지","photo":"사진","application":"앱","batterie":"배터리","internet":"인터넷","mot de passe":"비밀번호","en ligne":"온라인","clavier":"키보드","ordinateur portable":"노트북","je regarde une photo":"저는 사진을 봐요","je suis en ligne":"저는 온라인이에요",
"penser":"생각하다","croire":"믿다","comprendre":"이해하다","expliquer":"설명하다","raison":"이유","vérité":"진실","problème":"문제","solution":"해결책","idée":"아이디어","important":"중요하다","je pense que oui":"저는 그렇다고 생각해요","c'est une bonne idée":"좋은 생각이에요"
},
ar:{
"onze":"أحد عشر","douze":"اثنا عشر","treize":"ثلاثة عشر","quatorze":"أربعة عشر","quinze":"خمسة عشر","seize":"ستة عشر","dix-sept":"سبعة عشر","dix-huit":"ثمانية عشر","dix-neuf":"تسعة عشر","vingt":"عشرون","trente":"ثلاثون","quarante":"أربعون","cinquante":"خمسون","mille":"ألف",
"fatigué":"متعب","fâché":"غاضب","inquiet":"قلق","surpris":"متفاجئ","fier":"فخور","calme":"هادئ","seul":"وحيد","amoureux":"واقع في الحب","peur":"خوف","rire":"يضحك","pleurer":"يبكي","je suis fatigué":"أنا متعب","elle a peur":"هي خائفة",
"maintenant":"الآن","bientôt":"قريبا","tard":"متأخرا","tôt":"مبكرا","longtemps":"طويلا","toujours":"دائما","jamais":"أبدا","souvent":"غالبا","parfois":"أحيانا","avant":"قبل","après":"بعد","je mange maintenant":"أنا آكل الآن","je bois souvent du thé":"أشرب الشاي غالبا",
"travail":"عمل","bureau":"مكتب","réunion":"اجتماع","patron":"مدير","collègue":"زميل","ordinateur":"حاسوب","projet":"مشروع","salaire":"راتب","entreprise":"شركة","réussir":"ينجح","travailler":"يعمل","je travaille au bureau":"أعمل في المكتب","j'aime mon travail":"أحب عملي",
"malade":"مريض","douleur":"ألم","médicament":"دواء","fièvre":"حمى","se reposer":"يستريح","guérir":"يشفى","santé":"صحة","fort":"قوي","faible":"ضعيف","respirer":"يتنفس","je suis malade":"أنا مريض","je vais mieux":"أنا أتحسن",
"jouer":"يلعب","nager":"يسبح","courir":"يجري","danser":"يرقص","voyager":"يسافر","sport":"رياضة","lire":"يقرأ","écrire":"يكتب","chanter":"يغني","musique":"موسيقى","film":"فيلم","jeu":"لعبة","j'aime le sport":"أحب الرياضة","j'aime lire":"أحب القراءة",
"écran":"شاشة","message":"رسالة","photo":"صورة","application":"تطبيق","batterie":"بطارية","internet":"إنترنت","mot de passe":"كلمة السر","en ligne":"متصل","clavier":"لوحة المفاتيح","ordinateur portable":"حاسوب محمول","je regarde une photo":"أنظر إلى صورة","je suis en ligne":"أنا متصل",
"penser":"يفكر","croire":"يعتقد","comprendre":"يفهم","expliquer":"يشرح","raison":"سبب","vérité":"حقيقة","problème":"مشكلة","solution":"حل","idée":"فكرة","important":"مهم","je pense que oui":"أعتقد ذلك","c'est une bonne idée":"هذه فكرة جيدة"
}
};
LANGS2.forEach(function(l){ var d2=LEX2D[l]||{}; Object.keys(d2).forEach(function(k){ LEX2[l][k]=d2[k]; }); });
/* Vague 5 des nouvelles langues (v2.74) : unités 33-40 — verbes du quotidien, la cuisine, la salle
   de bain, lieux de la ville, la position, faire les courses, voyager loin, décrire encore.
   32 → 40 unités. Homographes réels supplémentaires assumés : ru/uk лёгкий/легкий = facile ET
   léger ; cs těžký = difficile ET lourd ; zh 快 = vite/rapide ; ja すぎる (trop) = suffixe enseigné
   tel quel ; ru huile = растительное масло pour distinguer du beurre (масло). */
var LEX2E = {
pl:{
"prendre":"brać","trouver":"znajdować","chercher":"szukać","attendre":"czekać","ouvrir":"otwierać","fermer":"zamykać","commencer":"zaczynać","finir":"kończyć","aider":"pomagać","habiter":"mieszkać","porter":"nosić","essayer":"próbować","apprendre":"uczyć się","oublier":"zapominać","montrer":"pokazywać","je cherche la gare":"szukam dworca",
"cuisine":"kuchnia","four":"piekarnik","frigo":"lodówka","bouteille":"butelka","recette":"przepis","cuisiner":"gotować","sel":"sól","poivre":"pieprz","sucre":"cukier","huile":"olej","beurre":"masło","farine":"mąka","petit-déjeuner":"śniadanie","déjeuner":"obiad","dîner":"kolacja",
"savon":"mydło","douche":"prysznic","bain":"kąpiel","serviette":"ręcznik","se laver":"myć się","brosse à dents":"szczoteczka do zębów","dentifrice":"pasta do zębów","miroir":"lustro","peigne":"grzebień","shampoing":"szampon","je me lave les mains":"myję ręce",
"bibliothèque":"biblioteka","piscine":"basen","cinéma":"kino","théâtre":"teatr","stade":"stadion","place":"plac","poste":"poczta","mairie":"ratusz","boulangerie":"piekarnia","boucherie":"sklep mięsny","quartier":"dzielnica","coin":"róg",
"sous":"pod","sur":"na","devant":"przed","derrière":"za","entre":"między","à côté":"obok","en haut":"na górze","en bas":"na dole","tout droit":"prosto","près":"blisko","loin":"daleko",
"gratuit":"darmowy","soldes":"wyprzedaż","liste":"lista","sac":"torba","panier":"koszyk","cadeau":"prezent","client":"klient","caisse":"kasa","ouvert":"otwarty","fermé":"zamknięty","trop":"za bardzo","c'est trop cher":"to jest za drogie","le magasin est ouvert":"sklep jest otwarty",
"valise":"walizka","passeport":"paszport","billet":"bilet","bagage":"bagaż","frontière":"granica","douane":"urząd celny","départ":"odjazd","arrivée":"przyjazd","retard":"opóźnienie","réserver":"rezerwować","annuler":"anulować","vacances":"wakacje","je réserve un hôtel":"rezerwuję hotel",
"lourd":"ciężki","léger":"lekki","long":"długi","court":"krótki","large":"szeroki","étroit":"wąski","rapide":"szybki","lent":"wolny","dangereux":"niebezpieczny","sûr":"bezpieczny","riche":"bogaty","pauvre":"biedny","drôle":"zabawny","gentil":"miły"
},
ru:{
"prendre":"брать","trouver":"находить","chercher":"искать","attendre":"ждать","ouvrir":"открывать","fermer":"закрывать","commencer":"начинать","finir":"заканчивать","aider":"помогать","habiter":"жить","porter":"носить","essayer":"пробовать","apprendre":"учиться","oublier":"забывать","montrer":"показывать","je cherche la gare":"я ищу вокзал",
"cuisine":"кухня","four":"духовка","frigo":"холодильник","bouteille":"бутылка","recette":"рецепт","cuisiner":"готовить","sel":"соль","poivre":"перец","sucre":"сахар","huile":"растительное масло","beurre":"масло","farine":"мука","petit-déjeuner":"завтрак","déjeuner":"обед","dîner":"ужин",
"savon":"мыло","douche":"душ","bain":"ванна","serviette":"полотенце","se laver":"мыться","brosse à dents":"зубная щётка","dentifrice":"зубная паста","miroir":"зеркало","peigne":"расчёска","shampoing":"шампунь","je me lave les mains":"я мою руки",
"bibliothèque":"библиотека","piscine":"бассейн","cinéma":"кинотеатр","théâtre":"театр","stade":"стадион","place":"площадь","poste":"почта","mairie":"мэрия","boulangerie":"булочная","boucherie":"мясной магазин","quartier":"район","coin":"угол",
"sous":"под","sur":"на","devant":"перед","derrière":"за","entre":"между","à côté":"рядом","en haut":"наверху","en bas":"внизу","tout droit":"прямо","près":"близко","loin":"далеко",
"gratuit":"бесплатный","soldes":"распродажа","liste":"список","sac":"сумка","panier":"корзина","cadeau":"подарок","client":"клиент","caisse":"касса","ouvert":"открытый","fermé":"закрытый","trop":"слишком","c'est trop cher":"это слишком дорого","le magasin est ouvert":"магазин открыт",
"valise":"чемодан","passeport":"паспорт","billet":"билет","bagage":"багаж","frontière":"граница","douane":"таможня","départ":"отъезд","arrivée":"прибытие","retard":"задержка","réserver":"бронировать","annuler":"отменять","vacances":"отпуск","je réserve un hôtel":"я бронирую отель",
"lourd":"тяжёлый","léger":"лёгкий","long":"длинный","court":"короткий","large":"широкий","étroit":"узкий","rapide":"быстрый","lent":"медленный","dangereux":"опасный","sûr":"безопасный","riche":"богатый","pauvre":"бедный","drôle":"смешной","gentil":"добрый"
},
uk:{
"prendre":"брати","trouver":"знаходити","chercher":"шукати","attendre":"чекати","ouvrir":"відкривати","fermer":"закривати","commencer":"починати","finir":"закінчувати","aider":"допомагати","habiter":"жити","porter":"носити","essayer":"пробувати","apprendre":"вчитися","oublier":"забувати","montrer":"показувати","je cherche la gare":"я шукаю вокзал",
"cuisine":"кухня","four":"духовка","frigo":"холодильник","bouteille":"пляшка","recette":"рецепт","cuisiner":"готувати","sel":"сіль","poivre":"перець","sucre":"цукор","huile":"олія","beurre":"масло","farine":"борошно","petit-déjeuner":"сніданок","déjeuner":"обід","dîner":"вечеря",
"savon":"мило","douche":"душ","bain":"ванна","serviette":"рушник","se laver":"митися","brosse à dents":"зубна щітка","dentifrice":"зубна паста","miroir":"дзеркало","peigne":"гребінець","shampoing":"шампунь","je me lave les mains":"я мию руки",
"bibliothèque":"бібліотека","piscine":"басейн","cinéma":"кінотеатр","théâtre":"театр","stade":"стадіон","place":"площа","poste":"пошта","mairie":"мерія","boulangerie":"пекарня","boucherie":"м'ясна крамниця","quartier":"район","coin":"ріг",
"sous":"під","sur":"на","devant":"перед","derrière":"за","entre":"між","à côté":"поруч","en haut":"нагорі","en bas":"внизу","tout droit":"прямо","près":"близько","loin":"далеко",
"gratuit":"безкоштовний","soldes":"розпродаж","liste":"список","sac":"сумка","panier":"кошик","cadeau":"подарунок","client":"клієнт","caisse":"каса","ouvert":"відкритий","fermé":"закритий","trop":"занадто","c'est trop cher":"це занадто дорого","le magasin est ouvert":"магазин відкритий",
"valise":"валіза","passeport":"паспорт","billet":"квиток","bagage":"багаж","frontière":"кордон","douane":"митниця","départ":"від'їзд","arrivée":"прибуття","retard":"затримка","réserver":"бронювати","annuler":"скасовувати","vacances":"відпустка","je réserve un hôtel":"я бронюю готель",
"lourd":"важкий","léger":"легкий","long":"довгий","court":"короткий","large":"широкий","étroit":"вузький","rapide":"швидкий","lent":"повільний","dangereux":"небезпечний","sûr":"безпечний","riche":"багатий","pauvre":"бідний","drôle":"смішний","gentil":"добрий"
},
cs:{
"prendre":"brát","trouver":"najít","chercher":"hledat","attendre":"čekat","ouvrir":"otevřít","fermer":"zavřít","commencer":"začít","finir":"skončit","aider":"pomáhat","habiter":"bydlet","porter":"nosit","essayer":"zkoušet","apprendre":"učit se","oublier":"zapomínat","montrer":"ukázat","je cherche la gare":"hledám nádraží",
"cuisine":"kuchyně","four":"trouba","frigo":"lednička","bouteille":"láhev","recette":"recept","cuisiner":"vařit","sel":"sůl","poivre":"pepř","sucre":"cukr","huile":"olej","beurre":"máslo","farine":"mouka","petit-déjeuner":"snídaně","déjeuner":"oběd","dîner":"večeře",
"savon":"mýdlo","douche":"sprcha","bain":"koupel","serviette":"ručník","se laver":"mýt se","brosse à dents":"zubní kartáček","dentifrice":"zubní pasta","miroir":"zrcadlo","peigne":"hřeben","shampoing":"šampon","je me lave les mains":"myji si ruce",
"bibliothèque":"knihovna","piscine":"bazén","cinéma":"kino","théâtre":"divadlo","stade":"stadion","place":"náměstí","poste":"pošta","mairie":"radnice","boulangerie":"pekárna","boucherie":"řeznictví","quartier":"čtvrť","coin":"roh",
"sous":"pod","sur":"na","devant":"před","derrière":"za","entre":"mezi","à côté":"vedle","en haut":"nahoře","en bas":"dole","tout droit":"rovně","près":"blízko","loin":"daleko",
"gratuit":"zdarma","soldes":"výprodej","liste":"seznam","sac":"taška","panier":"košík","cadeau":"dárek","client":"zákazník","caisse":"pokladna","ouvert":"otevřený","fermé":"zavřený","trop":"příliš","c'est trop cher":"to je příliš drahé","le magasin est ouvert":"obchod je otevřený",
"valise":"kufr","passeport":"pas","billet":"lístek","bagage":"zavazadlo","frontière":"hranice","douane":"celnice","départ":"odjezd","arrivée":"příjezd","retard":"zpoždění","réserver":"rezervovat","annuler":"zrušit","vacances":"dovolená","je réserve un hôtel":"rezervuji hotel",
"lourd":"těžký","léger":"lehký","long":"dlouhý","court":"krátký","large":"široký","étroit":"úzký","rapide":"rychlý","lent":"pomalý","dangereux":"nebezpečný","sûr":"bezpečný","riche":"bohatý","pauvre":"chudý","drôle":"vtipný","gentil":"milý"
},
zh:{
"prendre":"拿","trouver":"找到","chercher":"找","attendre":"等","ouvrir":"打开","fermer":"关","commencer":"开始","finir":"结束","aider":"帮助","habiter":"住","porter":"穿","essayer":"试","apprendre":"学习","oublier":"忘记","montrer":"展示","je cherche la gare":"我 找 火车站",
"cuisine":"厨房","four":"烤箱","frigo":"冰箱","bouteille":"瓶子","recette":"食谱","cuisiner":"做饭","sel":"盐","poivre":"胡椒","sucre":"糖","huile":"油","beurre":"黄油","farine":"面粉","petit-déjeuner":"早饭","déjeuner":"午饭","dîner":"晚饭",
"savon":"肥皂","douche":"淋浴","bain":"泡澡","serviette":"毛巾","se laver":"洗澡","brosse à dents":"牙刷","dentifrice":"牙膏","miroir":"镜子","peigne":"梳子","shampoing":"洗发水","je me lave les mains":"我 洗 手",
"bibliothèque":"图书馆","piscine":"游泳池","cinéma":"电影院","théâtre":"剧院","stade":"体育场","place":"广场","poste":"邮局","mairie":"市政厅","boulangerie":"面包店","boucherie":"肉店","quartier":"街区","coin":"角落",
"sous":"下面","sur":"上面","devant":"前面","derrière":"后面","entre":"中间","à côté":"旁边","en haut":"顶部","en bas":"底部","tout droit":"一直走","près":"近","loin":"远",
"gratuit":"免费","soldes":"打折","liste":"清单","sac":"袋子","panier":"购物篮","cadeau":"礼物","client":"顾客","caisse":"收银台","ouvert":"开门","fermé":"关门","trop":"太","c'est trop cher":"这 太 贵 了","le magasin est ouvert":"商店 开门 了",
"valise":"行李箱","passeport":"护照","billet":"票","bagage":"行李","frontière":"边境","douane":"海关","départ":"出发","arrivée":"到达","retard":"延误","réserver":"预订","annuler":"取消","vacances":"假期","je réserve un hôtel":"我 预订 酒店",
"lourd":"重","léger":"轻","long":"长","court":"短","large":"宽","étroit":"窄","rapide":"快","lent":"慢","dangereux":"危险","sûr":"安全","riche":"富有","pauvre":"贫穷","drôle":"有趣","gentil":"善良"
},
ja:{
"prendre":"取ります","trouver":"見つけます","chercher":"探します","attendre":"待ちます","ouvrir":"開けます","fermer":"閉めます","commencer":"始めます","finir":"終わります","aider":"手伝います","habiter":"住みます","porter":"着ます","essayer":"試します","apprendre":"学びます","oublier":"忘れます","montrer":"見せます","je cherche la gare":"私 は 駅 を 探します",
"cuisine":"台所","four":"オーブン","frigo":"冷蔵庫","bouteille":"ボトル","recette":"レシピ","cuisiner":"料理します","sel":"塩","poivre":"こしょう","sucre":"砂糖","huile":"油","beurre":"バター","farine":"小麦粉","petit-déjeuner":"朝ごはん","déjeuner":"昼ごはん","dîner":"晩ごはん",
"savon":"せっけん","douche":"シャワー","bain":"お風呂","serviette":"タオル","se laver":"洗います","brosse à dents":"歯ブラシ","dentifrice":"歯磨き粉","miroir":"鏡","peigne":"くし","shampoing":"シャンプー","je me lave les mains":"私 は 手 を 洗います",
"bibliothèque":"図書館","piscine":"プール","cinéma":"映画館","théâtre":"劇場","stade":"スタジアム","place":"広場","poste":"郵便局","mairie":"市役所","boulangerie":"パン屋","boucherie":"肉屋","quartier":"地区","coin":"角",
"sous":"下","sur":"上","devant":"前","derrière":"後ろ","entre":"間","à côté":"となり","en haut":"上の方","en bas":"下の方","tout droit":"まっすぐ","près":"近く","loin":"遠く",
"gratuit":"無料","soldes":"セール","liste":"リスト","sac":"袋","panier":"買い物かご","cadeau":"プレゼント","client":"お客さん","caisse":"レジ","ouvert":"開いている","fermé":"閉まっている","trop":"すぎる","c'est trop cher":"これ は 高すぎます","le magasin est ouvert":"店 は 開いています",
"valise":"スーツケース","passeport":"パスポート","billet":"チケット","bagage":"荷物","frontière":"国境","douane":"税関","départ":"出発","arrivée":"到着","retard":"遅れ","réserver":"予約します","annuler":"キャンセルします","vacances":"休暇","je réserve un hôtel":"私 は ホテル を 予約します",
"lourd":"重い","léger":"軽い","long":"長い","court":"短い","large":"広い","étroit":"狭い","rapide":"速い","lent":"遅い","dangereux":"危ない","sûr":"安全","riche":"金持ち","pauvre":"貧しい","drôle":"面白い","gentil":"優しい"
},
ko:{
"prendre":"가져가다","trouver":"발견하다","chercher":"찾다","attendre":"기다리다","ouvrir":"열다","fermer":"닫다","commencer":"시작하다","finir":"끝내다","aider":"돕다","habiter":"살다","porter":"입다","essayer":"시도하다","apprendre":"배우다","oublier":"잊다","montrer":"보여주다","je cherche la gare":"저는 기차역을 찾아요",
"cuisine":"부엌","four":"오븐","frigo":"냉장고","bouteille":"병","recette":"요리법","cuisiner":"요리하다","sel":"소금","poivre":"후추","sucre":"설탕","huile":"기름","beurre":"버터","farine":"밀가루","petit-déjeuner":"아침 식사","déjeuner":"점심 식사","dîner":"저녁 식사",
"savon":"비누","douche":"샤워","bain":"목욕","serviette":"수건","se laver":"씻다","brosse à dents":"칫솔","dentifrice":"치약","miroir":"거울","peigne":"빗","shampoing":"샴푸","je me lave les mains":"저는 손을 씻어요",
"bibliothèque":"도서관","piscine":"수영장","cinéma":"영화관","théâtre":"극장","stade":"경기장","place":"광장","poste":"우체국","mairie":"시청","boulangerie":"빵집","boucherie":"정육점","quartier":"동네","coin":"모퉁이",
"sous":"아래","sur":"위","devant":"앞","derrière":"뒤","entre":"사이","à côté":"옆","en haut":"위쪽","en bas":"아래쪽","tout droit":"직진","près":"가까이","loin":"멀리",
"gratuit":"무료","soldes":"세일","liste":"목록","sac":"가방","panier":"장바구니","cadeau":"선물","client":"손님","caisse":"계산대","ouvert":"열려 있다","fermé":"닫혀 있다","trop":"너무","c'est trop cher":"이것은 너무 비싸요","le magasin est ouvert":"가게가 열려 있어요",
"valise":"여행 가방","passeport":"여권","billet":"표","bagage":"짐","frontière":"국경","douane":"세관","départ":"출발","arrivée":"도착","retard":"지연","réserver":"예약하다","annuler":"취소하다","vacances":"휴가","je réserve un hôtel":"저는 호텔을 예약해요",
"lourd":"무겁다","léger":"가볍다","long":"길다","court":"짧다","large":"넓다","étroit":"좁다","rapide":"빠르다","lent":"느리다","dangereux":"위험하다","sûr":"안전하다","riche":"부유하다","pauvre":"가난하다","drôle":"웃기다","gentil":"친절하다"
},
ar:{
"prendre":"يأخذ","trouver":"يجد","chercher":"يبحث","attendre":"ينتظر","ouvrir":"يفتح","fermer":"يغلق","commencer":"يبدأ","finir":"ينهي","aider":"يساعد","habiter":"يسكن","porter":"يرتدي","essayer":"يحاول","apprendre":"يتعلم","oublier":"ينسى","montrer":"يعرض","je cherche la gare":"أبحث عن محطة القطار",
"cuisine":"مطبخ","four":"فرن","frigo":"ثلاجة","bouteille":"زجاجة","recette":"وصفة","cuisiner":"يطبخ","sel":"ملح","poivre":"فلفل","sucre":"سكر","huile":"زيت","beurre":"زبدة","farine":"طحين","petit-déjeuner":"فطور","déjeuner":"غداء","dîner":"عشاء",
"savon":"صابون","douche":"دش","bain":"حمام","serviette":"منشفة","se laver":"يغتسل","brosse à dents":"فرشاة أسنان","dentifrice":"معجون أسنان","miroir":"مرآة","peigne":"مشط","shampoing":"شامبو","je me lave les mains":"أغسل يدي",
"bibliothèque":"مكتبة","piscine":"مسبح","cinéma":"سينما","théâtre":"مسرح","stade":"ملعب","place":"ساحة","poste":"مكتب البريد","mairie":"البلدية","boulangerie":"مخبز","boucherie":"ملحمة","quartier":"حي","coin":"زاوية",
"sous":"تحت","sur":"فوق","devant":"أمام","derrière":"خلف","entre":"بين","à côté":"بجانب","en haut":"في الأعلى","en bas":"في الأسفل","tout droit":"إلى الأمام","près":"قريب","loin":"بعيد",
"gratuit":"مجاني","soldes":"تخفيضات","liste":"قائمة","sac":"حقيبة","panier":"سلة","cadeau":"هدية","client":"زبون","caisse":"صندوق الدفع","ouvert":"مفتوح","fermé":"مغلق","trop":"أكثر من اللازم","c'est trop cher":"هذا غال جدا","le magasin est ouvert":"المتجر مفتوح",
"valise":"حقيبة سفر","passeport":"جواز سفر","billet":"تذكرة","bagage":"أمتعة","frontière":"حدود","douane":"جمارك","départ":"مغادرة","arrivée":"وصول","retard":"تأخير","réserver":"يحجز","annuler":"يلغي","vacances":"عطلة","je réserve un hôtel":"أحجز فندقا",
"lourd":"ثقيل","léger":"خفيف","long":"طويل","court":"قصير","large":"عريض","étroit":"ضيق","rapide":"سريع","lent":"بطيء","dangereux":"خطير","sûr":"آمن","riche":"غني","pauvre":"فقير","drôle":"مضحك","gentil":"لطيف"
}
};
LANGS2.forEach(function(l){ var e2=LEX2E[l]||{}; Object.keys(e2).forEach(function(k){ LEX2[l][k]=e2[k]; }); });
/* Vague 6 des nouvelles langues (v2.75) : unités 41-48 — communiquer, la nature sauvage, les
   animaux sauvages, petits mots essentiels, la maison en détail, objets du quotidien, le
   caractère, apprendre. 40 → 48 unités. Distinctions faites pour éviter les doublons de valeur :
   pl nouvelle=nowina (message=wiadomość) ; zh réponse=答案 (répondre=回答), mot=单词 ;
   ar lettre=خطاب (message=رسالة), feuille=ورقة شجر (papier=ورق), jardin=بستان (parc=حديقة),
   toit=سطح (plafond=سقف), montre=ساعة يد (heure=ساعة), crayon=قلم رصاص (stylo=قلم).
   Homographe réel assumé : zh 问题 = question ET problème (c'est la langue). */
var LEX2F = {
pl:{
"appeler":"dzwonić","répondre":"odpowiadać","demander":"pytać","envoyer":"wysyłać","recevoir":"otrzymywać","question":"pytanie","réponse":"odpowiedź","nouvelle":"nowina","lettre":"list","adresse":"adres","e-mail":"e-mail","numéro":"numer","je t'appelle demain":"zadzwonię do ciebie jutro",
"rivière":"rzeka","lac":"jezioro","forêt":"las","île":"wyspa","colline":"wzgórze","champ":"pole","herbe":"trawa","feuille":"liść","pierre":"kamień","terre":"ziemia","feu":"ogień","étoile":"gwiazda","la rivière est froide":"rzeka jest zimna",
"lion":"lew","tigre":"tygrys","éléphant":"słoń","singe":"małpa","ours":"niedźwiedź","loup":"wilk","renard":"lis","serpent":"wąż","abeille":"pszczoła","papillon":"motyl","araignée":"pająk","canard":"kaczka","l'abeille aime les fleurs":"pszczoła lubi kwiaty",
"avec":"z","sans":"bez","aussi":"też","mais":"ale","parce que":"ponieważ","ou":"albo","si":"jeśli","donc":"więc","beaucoup":"dużo","peu":"mało","très":"bardzo","peut-être":"może","quelque chose":"coś","rien":"nic","tout":"wszystko","quelqu'un":"ktoś","je voyage avec ma famille":"podróżuję z rodziną",
"salon":"salon","chambre":"sypialnia","jardin":"ogród","garage":"garaż","étage":"piętro","escalier":"schody","toit":"dach","mur":"ściana","sol":"podłoga","plafond":"sufit","ascenseur":"winda","voisin":"sąsiad",
"montre":"zegarek","lunettes":"okulary","parapluie":"parasol","portefeuille":"portfel","stylo":"długopis","crayon":"ołówek","ciseaux":"nożyczki","papier":"papier","journal":"gazeta","boîte":"pudełko","bougie":"świeca",
"intelligent":"inteligentny","poli":"uprzejmy","courageux":"odważny","honnête":"uczciwy","patient":"cierpliwy","sympathique":"sympatyczny","timide":"nieśmiały","sérieux":"poważny","paresseux":"leniwy","curieux":"ciekawski","méchant":"złośliwy","sévère":"surowy",
"élève":"uczeń","classe":"klasa","leçon":"lekcja","examen":"egzamin","note":"ocena","erreur":"błąd","cahier":"zeszyt","mot":"słowo","phrase":"zdanie","langue":"język","dictionnaire":"słownik","page":"strona","sac à dos":"plecak"
},
ru:{
"appeler":"звонить","répondre":"отвечать","demander":"спрашивать","envoyer":"отправлять","recevoir":"получать","question":"вопрос","réponse":"ответ","nouvelle":"новость","lettre":"письмо","adresse":"адрес","e-mail":"электронная почта","numéro":"номер","je t'appelle demain":"я позвоню тебе завтра",
"rivière":"река","lac":"озеро","forêt":"лес","île":"остров","colline":"холм","champ":"поле","herbe":"трава","feuille":"лист","pierre":"камень","terre":"земля","feu":"огонь","étoile":"звезда","la rivière est froide":"река холодная",
"lion":"лев","tigre":"тигр","éléphant":"слон","singe":"обезьяна","ours":"медведь","loup":"волк","renard":"лиса","serpent":"змея","abeille":"пчела","papillon":"бабочка","araignée":"паук","canard":"утка","l'abeille aime les fleurs":"пчела любит цветы",
"avec":"с","sans":"без","aussi":"тоже","mais":"но","parce que":"потому что","ou":"или","si":"если","donc":"поэтому","beaucoup":"много","peu":"мало","très":"очень","peut-être":"может быть","quelque chose":"что-то","rien":"ничего","tout":"всё","quelqu'un":"кто-то","je voyage avec ma famille":"я путешествую с семьёй",
"salon":"гостиная","chambre":"спальня","jardin":"сад","garage":"гараж","étage":"этаж","escalier":"лестница","toit":"крыша","mur":"стена","sol":"пол","plafond":"потолок","ascenseur":"лифт","voisin":"сосед",
"montre":"часы","lunettes":"очки","parapluie":"зонт","portefeuille":"кошелёк","stylo":"ручка","crayon":"карандаш","ciseaux":"ножницы","papier":"бумага","journal":"газета","boîte":"коробка","bougie":"свеча",
"intelligent":"умный","poli":"вежливый","courageux":"смелый","honnête":"честный","patient":"терпеливый","sympathique":"приятный","timide":"застенчивый","sérieux":"серьёзный","paresseux":"ленивый","curieux":"любопытный","méchant":"злой","sévère":"строгий",
"élève":"ученик","classe":"класс","leçon":"урок","examen":"экзамен","note":"оценка","erreur":"ошибка","cahier":"тетрадь","mot":"слово","phrase":"предложение","langue":"язык","dictionnaire":"словарь","page":"страница","sac à dos":"рюкзак"
},
uk:{
"appeler":"дзвонити","répondre":"відповідати","demander":"запитувати","envoyer":"надсилати","recevoir":"отримувати","question":"питання","réponse":"відповідь","nouvelle":"новина","lettre":"лист","adresse":"адреса","e-mail":"електронна пошта","numéro":"номер","je t'appelle demain":"я подзвоню тобі завтра",
"rivière":"річка","lac":"озеро","forêt":"ліс","île":"острів","colline":"пагорб","champ":"поле","herbe":"трава","feuille":"листок","pierre":"камінь","terre":"земля","feu":"вогонь","étoile":"зірка","la rivière est froide":"річка холодна",
"lion":"лев","tigre":"тигр","éléphant":"слон","singe":"мавпа","ours":"ведмідь","loup":"вовк","renard":"лисиця","serpent":"змія","abeille":"бджола","papillon":"метелик","araignée":"павук","canard":"качка","l'abeille aime les fleurs":"бджола любить квіти",
"avec":"з","sans":"без","aussi":"теж","mais":"але","parce que":"тому що","ou":"або","si":"якщо","donc":"тому","beaucoup":"багато","peu":"мало","très":"дуже","peut-être":"можливо","quelque chose":"щось","rien":"нічого","tout":"все","quelqu'un":"хтось","je voyage avec ma famille":"я подорожую з сім'єю",
"salon":"вітальня","chambre":"спальня","jardin":"сад","garage":"гараж","étage":"поверх","escalier":"сходи","toit":"дах","mur":"стіна","sol":"підлога","plafond":"стеля","ascenseur":"ліфт","voisin":"сусід",
"montre":"годинник","lunettes":"окуляри","parapluie":"парасолька","portefeuille":"гаманець","stylo":"ручка","crayon":"олівець","ciseaux":"ножиці","papier":"папір","journal":"газета","boîte":"коробка","bougie":"свічка",
"intelligent":"розумний","poli":"ввічливий","courageux":"сміливий","honnête":"чесний","patient":"терплячий","sympathique":"приємний","timide":"сором'язливий","sérieux":"серйозний","paresseux":"лінивий","curieux":"допитливий","méchant":"злий","sévère":"суворий",
"élève":"учень","classe":"клас","leçon":"урок","examen":"іспит","note":"оцінка","erreur":"помилка","cahier":"зошит","mot":"слово","phrase":"речення","langue":"мова","dictionnaire":"словник","page":"сторінка","sac à dos":"рюкзак"
},
cs:{
"appeler":"volat","répondre":"odpovídat","demander":"ptát se","envoyer":"posílat","recevoir":"dostávat","question":"otázka","réponse":"odpověď","nouvelle":"novinka","lettre":"dopis","adresse":"adresa","e-mail":"e-mail","numéro":"číslo","je t'appelle demain":"zavolám ti zítra",
"rivière":"řeka","lac":"jezero","forêt":"les","île":"ostrov","colline":"kopec","champ":"pole","herbe":"tráva","feuille":"list","pierre":"kámen","terre":"země","feu":"oheň","étoile":"hvězda","la rivière est froide":"řeka je studená",
"lion":"lev","tigre":"tygr","éléphant":"slon","singe":"opice","ours":"medvěd","loup":"vlk","renard":"liška","serpent":"had","abeille":"včela","papillon":"motýl","araignée":"pavouk","canard":"kachna","l'abeille aime les fleurs":"včela miluje květiny",
"avec":"s","sans":"bez","aussi":"také","mais":"ale","parce que":"protože","ou":"nebo","si":"jestli","donc":"takže","beaucoup":"hodně","peu":"málo","très":"velmi","peut-être":"možná","quelque chose":"něco","rien":"nic","tout":"všechno","quelqu'un":"někdo","je voyage avec ma famille":"cestuji s rodinou",
"salon":"obývací pokoj","chambre":"ložnice","jardin":"zahrada","garage":"garáž","étage":"patro","escalier":"schody","toit":"střecha","mur":"zeď","sol":"podlaha","plafond":"strop","ascenseur":"výtah","voisin":"soused",
"montre":"hodinky","lunettes":"brýle","parapluie":"deštník","portefeuille":"peněženka","stylo":"propiska","crayon":"tužka","ciseaux":"nůžky","papier":"papír","journal":"noviny","boîte":"krabice","bougie":"svíčka",
"intelligent":"chytrý","poli":"zdvořilý","courageux":"odvážný","honnête":"čestný","patient":"trpělivý","sympathique":"sympatický","timide":"stydlivý","sérieux":"vážný","paresseux":"líný","curieux":"zvědavý","méchant":"zlý","sévère":"přísný",
"élève":"žák","classe":"třída","leçon":"lekce","examen":"zkouška","note":"známka","erreur":"chyba","cahier":"sešit","mot":"slovo","phrase":"věta","langue":"jazyk","dictionnaire":"slovník","page":"stránka","sac à dos":"batoh"
},
zh:{
"appeler":"打电话","répondre":"回答","demander":"问","envoyer":"发送","recevoir":"收到","question":"问题","réponse":"答案","nouvelle":"新闻","lettre":"信","adresse":"地址","e-mail":"电子邮件","numéro":"号码","je t'appelle demain":"我 明天 给 你 打电话",
"rivière":"河","lac":"湖","forêt":"森林","île":"岛","colline":"山丘","champ":"田野","herbe":"草","feuille":"叶子","pierre":"石头","terre":"土地","feu":"火","étoile":"星星","la rivière est froide":"河水 很 冷",
"lion":"狮子","tigre":"老虎","éléphant":"大象","singe":"猴子","ours":"熊","loup":"狼","renard":"狐狸","serpent":"蛇","abeille":"蜜蜂","papillon":"蝴蝶","araignée":"蜘蛛","canard":"鸭子","l'abeille aime les fleurs":"蜜蜂 喜欢 花",
"avec":"和","sans":"没有","aussi":"也","mais":"但是","parce que":"因为","ou":"或者","si":"如果","donc":"所以","beaucoup":"很多","peu":"少","très":"很","peut-être":"也许","quelque chose":"东西","rien":"没什么","tout":"一切","quelqu'un":"有人","je voyage avec ma famille":"我 和 家人 一起 旅行",
"salon":"客厅","chambre":"卧室","jardin":"花园","garage":"车库","étage":"楼层","escalier":"楼梯","toit":"屋顶","mur":"墙","sol":"地板","plafond":"天花板","ascenseur":"电梯","voisin":"邻居",
"montre":"手表","lunettes":"眼镜","parapluie":"雨伞","portefeuille":"钱包","stylo":"钢笔","crayon":"铅笔","ciseaux":"剪刀","papier":"纸","journal":"报纸","boîte":"盒子","bougie":"蜡烛",
"intelligent":"聪明","poli":"有礼貌","courageux":"勇敢","honnête":"诚实","patient":"有耐心","sympathique":"友好","timide":"害羞","sérieux":"认真","paresseux":"懒惰","curieux":"好奇","méchant":"凶","sévère":"严格",
"élève":"学生","classe":"班级","leçon":"课","examen":"考试","note":"分数","erreur":"错误","cahier":"笔记本","mot":"单词","phrase":"句子","langue":"语言","dictionnaire":"词典","page":"页","sac à dos":"书包"
},
ja:{
"appeler":"電話します","répondre":"答えます","demander":"聞きます","envoyer":"送ります","recevoir":"受け取ります","question":"質問","réponse":"答え","nouvelle":"ニュース","lettre":"手紙","adresse":"住所","e-mail":"メール","numéro":"番号","je t'appelle demain":"明日 電話します",
"rivière":"川","lac":"湖","forêt":"森","île":"島","colline":"丘","champ":"畑","herbe":"草","feuille":"葉","pierre":"石","terre":"土","feu":"火","étoile":"星","la rivière est froide":"川 は 冷たい です",
"lion":"ライオン","tigre":"トラ","éléphant":"ゾウ","singe":"サル","ours":"クマ","loup":"オオカミ","renard":"キツネ","serpent":"ヘビ","abeille":"ミツバチ","papillon":"チョウ","araignée":"クモ","canard":"アヒル","l'abeille aime les fleurs":"ミツバチ は 花 が 好き です",
"avec":"と","sans":"なしで","aussi":"も","mais":"でも","parce que":"なぜなら","ou":"または","si":"もし","donc":"だから","beaucoup":"たくさん","peu":"少し","très":"とても","peut-être":"たぶん","quelque chose":"何か","rien":"何も","tout":"全部","quelqu'un":"誰か","je voyage avec ma famille":"私 は 家族 と 旅行します",
"salon":"リビング","chambre":"寝室","jardin":"庭","garage":"ガレージ","étage":"階","escalier":"階段","toit":"屋根","mur":"壁","sol":"床","plafond":"天井","ascenseur":"エレベーター","voisin":"隣人",
"montre":"腕時計","lunettes":"めがね","parapluie":"傘","portefeuille":"財布","stylo":"ペン","crayon":"えんぴつ","ciseaux":"はさみ","papier":"紙","journal":"新聞","boîte":"箱","bougie":"ろうそく",
"intelligent":"賢い","poli":"礼儀正しい","courageux":"勇敢","honnête":"正直","patient":"我慢強い","sympathique":"感じがいい","timide":"恥ずかしがり屋","sérieux":"まじめ","paresseux":"怠け者","curieux":"好奇心が強い","méchant":"意地悪","sévère":"厳しい",
"élève":"生徒","classe":"クラス","leçon":"授業","examen":"試験","note":"成績","erreur":"間違い","cahier":"ノート","mot":"単語","phrase":"文","langue":"言語","dictionnaire":"辞書","page":"ページ","sac à dos":"リュックサック"
},
ko:{
"appeler":"전화하다","répondre":"대답하다","demander":"묻다","envoyer":"보내다","recevoir":"받다","question":"질문","réponse":"대답","nouvelle":"소식","lettre":"편지","adresse":"주소","e-mail":"이메일","numéro":"번호","je t'appelle demain":"내일 전화할게요",
"rivière":"강","lac":"호수","forêt":"숲","île":"섬","colline":"언덕","champ":"밭","herbe":"풀","feuille":"잎","pierre":"돌","terre":"땅","feu":"불","étoile":"별","la rivière est froide":"강이 차가워요",
"lion":"사자","tigre":"호랑이","éléphant":"코끼리","singe":"원숭이","ours":"곰","loup":"늑대","renard":"여우","serpent":"뱀","abeille":"꿀벌","papillon":"나비","araignée":"거미","canard":"오리","l'abeille aime les fleurs":"꿀벌은 꽃을 좋아해요",
"avec":"와","sans":"없이","aussi":"또한","mais":"하지만","parce que":"왜냐하면","ou":"또는","si":"만약","donc":"그래서","beaucoup":"많이","peu":"조금","très":"아주","peut-être":"아마","quelque chose":"뭔가","rien":"아무것도","tout":"전부","quelqu'un":"누군가","je voyage avec ma famille":"저는 가족과 여행해요",
"salon":"거실","chambre":"침실","jardin":"정원","garage":"차고","étage":"층","escalier":"계단","toit":"지붕","mur":"벽","sol":"바닥","plafond":"천장","ascenseur":"엘리베이터","voisin":"이웃",
"montre":"손목시계","lunettes":"안경","parapluie":"우산","portefeuille":"지갑","stylo":"펜","crayon":"연필","ciseaux":"가위","papier":"종이","journal":"신문","boîte":"상자","bougie":"양초",
"intelligent":"똑똑하다","poli":"예의 바르다","courageux":"용감하다","honnête":"정직하다","patient":"참을성이 있다","sympathique":"상냥하다","timide":"수줍다","sérieux":"진지하다","paresseux":"게으르다","curieux":"호기심이 많다","méchant":"못되다","sévère":"엄격하다",
"élève":"학생","classe":"반","leçon":"수업","examen":"시험","note":"성적","erreur":"실수","cahier":"공책","mot":"단어","phrase":"문장","langue":"언어","dictionnaire":"사전","page":"페이지","sac à dos":"배낭"
},
ar:{
"appeler":"يتصل","répondre":"يجيب","demander":"يسأل","envoyer":"يرسل","recevoir":"يستقبل","question":"سؤال","réponse":"جواب","nouvelle":"خبر","lettre":"خطاب","adresse":"عنوان","e-mail":"بريد إلكتروني","numéro":"رقم","je t'appelle demain":"سأتصل بك غدا",
"rivière":"نهر","lac":"بحيرة","forêt":"غابة","île":"جزيرة","colline":"تلة","champ":"حقل","herbe":"عشب","feuille":"ورقة شجر","pierre":"حجر","terre":"أرض","feu":"نار","étoile":"نجمة","la rivière est froide":"النهر بارد",
"lion":"أسد","tigre":"نمر","éléphant":"فيل","singe":"قرد","ours":"دب","loup":"ذئب","renard":"ثعلب","serpent":"ثعبان","abeille":"نحلة","papillon":"فراشة","araignée":"عنكبوت","canard":"بطة","l'abeille aime les fleurs":"النحلة تحب الزهور",
"avec":"مع","sans":"بدون","aussi":"أيضا","mais":"لكن","parce que":"لأن","ou":"أو","si":"إذا","donc":"لذلك","beaucoup":"كثيرا","peu":"قليلا","très":"جدا","peut-être":"ربما","quelque chose":"شيء ما","rien":"لا شيء","tout":"كل شيء","quelqu'un":"شخص ما","je voyage avec ma famille":"أسافر مع عائلتي",
"salon":"غرفة الجلوس","chambre":"غرفة النوم","jardin":"بستان","garage":"مرآب","étage":"طابق","escalier":"درج","toit":"سطح","mur":"جدار","sol":"أرضية","plafond":"سقف","ascenseur":"مصعد","voisin":"جار",
"montre":"ساعة يد","lunettes":"نظارة","parapluie":"مظلة","portefeuille":"محفظة","stylo":"قلم","crayon":"قلم رصاص","ciseaux":"مقص","papier":"ورق","journal":"جريدة","boîte":"صندوق","bougie":"شمعة",
"intelligent":"ذكي","poli":"مهذب","courageux":"شجاع","honnête":"صادق","patient":"صبور","sympathique":"ودود","timide":"خجول","sérieux":"جاد","paresseux":"كسول","curieux":"فضولي","méchant":"شرير","sévère":"صارم",
"élève":"تلميذ","classe":"صف","leçon":"درس","examen":"امتحان","note":"علامة","erreur":"خطأ","cahier":"دفتر","mot":"كلمة","phrase":"جملة","langue":"لغة","dictionnaire":"قاموس","page":"صفحة","sac à dos":"حقيبة ظهر"
}
};
LANGS2.forEach(function(l){ var f2=LEX2F[l]||{}; Object.keys(f2).forEach(function(k){ LEX2[l][k]=f2[k]; }); });
/* Vague 7 des nouvelles langues (v2.76) : unités 49-56 — le temps libre, les sens, la grande
   famille, les mesures, à table encore, les métiers encore, le cœur encore, chez le médecin.
   48 → 56 unités. Anti-doublons : pl épaule=bark (bras=ramię), ru goûter=пробовать на вкус
   (essayer=пробовать), zh regarder=观看 (voir=看), espérer=盼望 (espoir=希望), sain=健康的 ;
   ja regarder=見つめます, sain=健康的 ; ko regarder=바라보다, invité=초대 손님 (client=손님).
   Homographes RÉELS assumés : uk чоловік = homme ET mari ; ko 쓰다 (+ amer) ; ar حار = chaud
   ET épicé ; ja 心配 = inquiet ET souci. */
var LEX2G = {
pl:{
"dessiner":"rysować","peindre":"malować","chanson":"piosenka","guitare":"gitara","piano":"pianino","marcher":"chodzić","promenade":"spacer","pêcher":"łowić ryby","fête":"impreza","invité":"gość",
"regarder":"patrzeć","écouter":"słuchać","entendre":"słyszeć","toucher":"dotykać","goûter":"smakować","voix":"głos","peau":"skóra","épaule":"bark","genou":"kolano","cou":"szyja","sourire":"uśmiech",
"oncle":"wujek","tante":"ciocia","cousin":"kuzyn","neveu":"bratanek","nièce":"bratanica","mari":"mąż","couple":"para","adulte":"dorosły","personne":"osoba",
"mètre":"metr","kilomètre":"kilometr","kilo":"kilogram","litre":"litr","moitié":"połowa","quart":"ćwierć","double":"podwójny","premier":"pierwszy","dernier":"ostatni","prochain":"następny",
"goût":"smak","délicieux":"pyszny","sucré":"słodki","salé":"słony","amer":"gorzki","épicé":"ostry","faim":"głód","soif":"pragnienie","boisson":"napój","morceau":"kawałek","tranche":"plasterek","c'est délicieux":"to jest pyszne","j'ai faim":"jestem głodny","j'ai soif":"chce mi się pić",
"métier":"zawód","usine":"fabryka","vendeur":"sprzedawca","infirmier":"pielęgniarz","pompier":"strażak","facteur":"listonosz","coiffeur":"fryzjer","dentiste":"dentysta","gagner":"wygrywać","perdre":"przegrywać",
"espoir":"nadzieja","joie":"radość","chance":"szczęście","rêve":"marzenie","espérer":"mieć nadzieję","colère":"gniew","honte":"wstyd","souci":"zmartwienie","embrasser":"całować","je rêve de voyager":"marzę o podróżach",
"rendez-vous":"wizyta","blessure":"rana","sang":"krew","tousser":"kaszleć","rhume":"przeziębienie","grippe":"grypa","urgence":"nagły wypadek","sain":"zdrowy"
},
ru:{
"dessiner":"рисовать","peindre":"рисовать красками","chanson":"песня","guitare":"гитара","piano":"пианино","marcher":"ходить","promenade":"прогулка","pêcher":"ловить рыбу","fête":"праздник","invité":"гость",
"regarder":"смотреть","écouter":"слушать","entendre":"слышать","toucher":"трогать","goûter":"пробовать на вкус","voix":"голос","peau":"кожа","épaule":"плечо","genou":"колено","cou":"шея","sourire":"улыбка",
"oncle":"дядя","tante":"тётя","cousin":"кузен","neveu":"племянник","nièce":"племянница","mari":"муж","couple":"пара","adulte":"взрослый","personne":"человек",
"mètre":"метр","kilomètre":"километр","kilo":"килограмм","litre":"литр","moitié":"половина","quart":"четверть","double":"двойной","premier":"первый","dernier":"последний","prochain":"следующий",
"goût":"вкус","délicieux":"вкусный","sucré":"сладкий","salé":"солёный","amer":"горький","épicé":"острый","faim":"голод","soif":"жажда","boisson":"напиток","morceau":"кусок","tranche":"ломтик","c'est délicieux":"это вкусно","j'ai faim":"я голоден","j'ai soif":"я хочу пить",
"métier":"профессия","usine":"завод","vendeur":"продавец","infirmier":"медбрат","pompier":"пожарный","facteur":"почтальон","coiffeur":"парикмахер","dentiste":"стоматолог","gagner":"выигрывать","perdre":"проигрывать",
"espoir":"надежда","joie":"радость","chance":"удача","rêve":"мечта","espérer":"надеяться","colère":"гнев","honte":"стыд","souci":"беспокойство","embrasser":"целовать","je rêve de voyager":"я мечтаю путешествовать",
"rendez-vous":"приём","blessure":"рана","sang":"кровь","tousser":"кашлять","rhume":"простуда","grippe":"грипп","urgence":"экстренный случай","sain":"здоровый"
},
uk:{
"dessiner":"малювати","peindre":"малювати фарбами","chanson":"пісня","guitare":"гітара","piano":"піаніно","marcher":"ходити","promenade":"прогулянка","pêcher":"ловити рибу","fête":"свято","invité":"гість",
"regarder":"дивитися","écouter":"слухати","entendre":"чути","toucher":"торкатися","goûter":"куштувати","voix":"голос","peau":"шкіра","épaule":"плече","genou":"коліно","cou":"шия","sourire":"усмішка",
"oncle":"дядько","tante":"тітка","cousin":"кузен","neveu":"племінник","nièce":"племінниця","mari":"чоловік","couple":"пара","adulte":"дорослий","personne":"людина",
"mètre":"метр","kilomètre":"кілометр","kilo":"кілограм","litre":"літр","moitié":"половина","quart":"чверть","double":"подвійний","premier":"перший","dernier":"останній","prochain":"наступний",
"goût":"смак","délicieux":"смачний","sucré":"солодкий","salé":"солоний","amer":"гіркий","épicé":"гострий","faim":"голод","soif":"спрага","boisson":"напій","morceau":"шматок","tranche":"скибка","c'est délicieux":"це смачно","j'ai faim":"я голодний","j'ai soif":"я хочу пити",
"métier":"професія","usine":"завод","vendeur":"продавець","infirmier":"медбрат","pompier":"пожежник","facteur":"листоноша","coiffeur":"перукар","dentiste":"стоматолог","gagner":"вигравати","perdre":"програвати",
"espoir":"надія","joie":"радість","chance":"удача","rêve":"мрія","espérer":"сподіватися","colère":"гнів","honte":"сором","souci":"турбота","embrasser":"цілувати","je rêve de voyager":"я мрію подорожувати",
"rendez-vous":"прийом","blessure":"рана","sang":"кров","tousser":"кашляти","rhume":"застуда","grippe":"грип","urgence":"невідкладний випадок","sain":"здоровий"
},
cs:{
"dessiner":"kreslit","peindre":"malovat","chanson":"píseň","guitare":"kytara","piano":"klavír","marcher":"chodit","promenade":"procházka","pêcher":"rybařit","fête":"oslava","invité":"host",
"regarder":"dívat se","écouter":"poslouchat","entendre":"slyšet","toucher":"dotýkat se","goûter":"ochutnávat","voix":"hlas","peau":"kůže","épaule":"rameno","genou":"koleno","cou":"krk","sourire":"úsměv",
"oncle":"strýc","tante":"teta","cousin":"bratranec","neveu":"synovec","nièce":"neteř","mari":"manžel","couple":"pár","adulte":"dospělý","personne":"osoba",
"mètre":"metr","kilomètre":"kilometr","kilo":"kilogram","litre":"litr","moitié":"polovina","quart":"čtvrtina","double":"dvojitý","premier":"první","dernier":"poslední","prochain":"příští",
"goût":"chuť","délicieux":"výborný","sucré":"sladký","salé":"slaný","amer":"hořký","épicé":"pálivý","faim":"hlad","soif":"žízeň","boisson":"nápoj","morceau":"kousek","tranche":"plátek","c'est délicieux":"to je výborné","j'ai faim":"mám hlad","j'ai soif":"mám žízeň",
"métier":"povolání","usine":"továrna","vendeur":"prodavač","infirmier":"zdravotník","pompier":"hasič","facteur":"pošťák","coiffeur":"kadeřník","dentiste":"zubař","gagner":"vyhrávat","perdre":"prohrávat",
"espoir":"naděje","joie":"radost","chance":"štěstí","rêve":"sen","espérer":"doufat","colère":"hněv","honte":"stud","souci":"starost","embrasser":"líbat","je rêve de voyager":"sním o cestování",
"rendez-vous":"termín","blessure":"rána","sang":"krev","tousser":"kašlat","rhume":"nachlazení","grippe":"chřipka","urgence":"pohotovost","sain":"zdravý"
},
zh:{
"dessiner":"画画","peindre":"绘画","chanson":"歌曲","guitare":"吉他","piano":"钢琴","marcher":"走路","promenade":"散步","pêcher":"钓鱼","fête":"聚会","invité":"客人",
"regarder":"观看","écouter":"听","entendre":"听见","toucher":"摸","goûter":"尝","voix":"声音","peau":"皮肤","épaule":"肩膀","genou":"膝盖","cou":"脖子","sourire":"微笑",
"oncle":"叔叔","tante":"阿姨","cousin":"表哥","neveu":"侄子","nièce":"侄女","mari":"丈夫","couple":"夫妻","adulte":"成年人","personne":"人",
"mètre":"米","kilomètre":"公里","kilo":"公斤","litre":"升","moitié":"一半","quart":"四分之一","double":"双倍","premier":"第一","dernier":"最后","prochain":"下一个",
"goût":"味道","délicieux":"好吃","sucré":"甜","salé":"咸","amer":"苦","épicé":"辣","faim":"饿","soif":"渴","boisson":"饮料","morceau":"块","tranche":"片","c'est délicieux":"很 好吃","j'ai faim":"我 饿 了","j'ai soif":"我 渴 了",
"métier":"职业","usine":"工厂","vendeur":"售货员","infirmier":"护士","pompier":"消防员","facteur":"邮递员","coiffeur":"理发师","dentiste":"牙医","gagner":"赢","perdre":"输",
"espoir":"希望","joie":"快乐","chance":"运气","rêve":"梦想","espérer":"盼望","colère":"愤怒","honte":"羞耻","souci":"烦恼","embrasser":"亲吻","je rêve de voyager":"我 梦想 去 旅行",
"rendez-vous":"预约","blessure":"伤口","sang":"血","tousser":"咳嗽","rhume":"感冒","grippe":"流感","urgence":"急诊","sain":"健康的"
},
ja:{
"dessiner":"絵を描きます","peindre":"塗ります","chanson":"歌","guitare":"ギター","piano":"ピアノ","marcher":"歩きます","promenade":"散歩","pêcher":"釣りをします","fête":"パーティー","invité":"ゲスト",
"regarder":"見つめます","écouter":"聞きます","entendre":"聞こえます","toucher":"触ります","goûter":"味わいます","voix":"声","peau":"肌","épaule":"肩","genou":"ひざ","cou":"首","sourire":"笑顔",
"oncle":"おじさん","tante":"おばさん","cousin":"いとこ","neveu":"おい","nièce":"めい","mari":"夫","couple":"カップル","adulte":"大人","personne":"人",
"mètre":"メートル","kilomètre":"キロメートル","kilo":"キロ","litre":"リットル","moitié":"半分","quart":"四分の一","double":"二倍","premier":"最初","dernier":"最後","prochain":"次",
"goût":"味","délicieux":"おいしい","sucré":"甘い","salé":"しょっぱい","amer":"苦い","épicé":"辛い","faim":"空腹","soif":"のどの渇き","boisson":"飲み物","morceau":"かけら","tranche":"一切れ","c'est délicieux":"おいしい です","j'ai faim":"おなか が すきました","j'ai soif":"のど が かわきました",
"métier":"職業","usine":"工場","vendeur":"店員","infirmier":"看護師","pompier":"消防士","facteur":"郵便配達員","coiffeur":"美容師","dentiste":"歯医者","gagner":"勝ちます","perdre":"負けます",
"espoir":"希望","joie":"喜び","chance":"運","rêve":"夢","espérer":"望みます","colère":"怒り","honte":"恥","souci":"心配","embrasser":"キスします","je rêve de voyager":"私 は 旅行 を 夢見ています",
"rendez-vous":"予約","blessure":"けが","sang":"血","tousser":"せきをします","rhume":"風邪","grippe":"インフルエンザ","urgence":"救急","sain":"健康的"
},
ko:{
"dessiner":"그리다","peindre":"칠하다","chanson":"노래","guitare":"기타","piano":"피아노","marcher":"걷다","promenade":"산책","pêcher":"낚시하다","fête":"파티","invité":"초대 손님",
"regarder":"바라보다","écouter":"듣다","entendre":"들리다","toucher":"만지다","goûter":"맛보다","voix":"목소리","peau":"피부","épaule":"어깨","genou":"무릎","cou":"목","sourire":"미소",
"oncle":"삼촌","tante":"이모","cousin":"사촌","neveu":"조카","nièce":"조카딸","mari":"남편","couple":"커플","adulte":"어른","personne":"사람",
"mètre":"미터","kilomètre":"킬로미터","kilo":"킬로그램","litre":"리터","moitié":"절반","quart":"사분의 일","double":"두 배","premier":"첫 번째","dernier":"마지막","prochain":"다음",
"goût":"맛","délicieux":"맛있다","sucré":"달다","salé":"짜다","amer":"쓰다","épicé":"맵다","faim":"배고픔","soif":"갈증","boisson":"음료","morceau":"조각","tranche":"얇은 조각","c'est délicieux":"맛있어요","j'ai faim":"배고파요","j'ai soif":"목말라요",
"métier":"직업","usine":"공장","vendeur":"판매원","infirmier":"간호사","pompier":"소방관","facteur":"우편집배원","coiffeur":"미용사","dentiste":"치과 의사","gagner":"이기다","perdre":"지다",
"espoir":"희망","joie":"기쁨","chance":"운","rêve":"꿈","espérer":"바라다","colère":"분노","honte":"부끄러움","souci":"걱정","embrasser":"키스하다","je rêve de voyager":"저는 여행하는 꿈을 꿔요",
"rendez-vous":"예약","blessure":"상처","sang":"피","tousser":"기침하다","rhume":"감기","grippe":"독감","urgence":"응급","sain":"건강하다"
},
ar:{
"dessiner":"يرسم","peindre":"يلون","chanson":"أغنية","guitare":"غيتار","piano":"بيانو","marcher":"يمشي","promenade":"نزهة","pêcher":"يصطاد","fête":"حفلة","invité":"ضيف",
"regarder":"ينظر","écouter":"يستمع","entendre":"يسمع","toucher":"يلمس","goûter":"يتذوق","voix":"صوت","peau":"جلد","épaule":"كتف","genou":"ركبة","cou":"رقبة","sourire":"ابتسامة",
"oncle":"عم","tante":"عمة","cousin":"ابن عم","neveu":"ابن أخ","nièce":"ابنة أخ","mari":"زوج","couple":"زوجان","adulte":"بالغ","personne":"شخص",
"mètre":"متر","kilomètre":"كيلومتر","kilo":"كيلوغرام","litre":"لتر","moitié":"نصف","quart":"ربع","double":"ضعف","premier":"أول","dernier":"أخير","prochain":"التالي",
"goût":"طعم","délicieux":"لذيذ","sucré":"حلو","salé":"مالح","amer":"مر","épicé":"حار","faim":"جوع","soif":"عطش","boisson":"مشروب","morceau":"قطعة","tranche":"شريحة","c'est délicieux":"هذا لذيذ","j'ai faim":"أنا جائع","j'ai soif":"أنا عطشان",
"métier":"مهنة","usine":"مصنع","vendeur":"بائع","infirmier":"ممرض","pompier":"رجل إطفاء","facteur":"ساعي البريد","coiffeur":"حلاق","dentiste":"طبيب أسنان","gagner":"يربح","perdre":"يخسر",
"espoir":"أمل","joie":"فرح","chance":"حظ","rêve":"حلم","espérer":"يأمل","colère":"غضب","honte":"خجل","souci":"هم","embrasser":"يقبّل","je rêve de voyager":"أحلم بالسفر",
"rendez-vous":"موعد","blessure":"جرح","sang":"دم","tousser":"يسعل","rhume":"زكام","grippe":"إنفلونزا","urgence":"طوارئ","sain":"معافى"
}
};
LANGS2.forEach(function(l){ var g2=LEX2G[l]||{}; Object.keys(g2).forEach(function(k){ LEX2[l][k]=g2[k]; }); });
/* Vague 8 des nouvelles langues (v2.77) : unités 57-64 — le numérique, le monde, parler
   couramment, bouger partout, bon appétit encore, l'argent malin, s'habiller encore, la routine
   du matin. 56 → 64 unités. Anti-doublons : zh allumer/éteindre=开机/关机, se coucher=上床睡觉,
   ranger=收拾 ; ru préparer=подготавливать (cuisiner=готовить), nettoyer=чистить (ranger=убирать) ;
   pl facture=faktura (addition=rachunek) ; ja se réveiller=目が覚めます (se lever=起きます) ;
   ko se coucher=잠자리에 들다 ; ar se coucher=يذهب للنوم, bonbon=سكاكر (dessert=حلوى).
   Homographes RÉELS assumés : ru мир = monde ET paix, курица = poule/poulet, счёт = compte/addition ;
   cs země = terre/pays, účet = compte/addition ; ja 寝ます = dormir/se coucher ; ko 쓰다 (+ dépenser). */
var LEX2H = {
pl:{
"imprimante":"drukarka","écouteurs":"słuchawki","appareil photo":"aparat fotograficzny","allumer":"włączać","éteindre":"wyłączać","fichier":"plik","site":"strona internetowa","réseau":"sieć","jeu vidéo":"gra wideo","télécharger":"pobierać",
"pays":"kraj","monde":"świat","capitale":"stolica","drapeau":"flaga","nord":"północ","sud":"południe","est":"wschód","ouest":"zachód","roi":"król","reine":"królowa","guerre":"wojna","paix":"pokój","mon pays est beau":"mój kraj jest piękny",
"je ne comprends pas":"nie rozumiem","pouvez-vous répéter":"czy może pan powtórzyć","je suis d'accord":"zgadzam się","ça ne fait rien":"nic nie szkodzi","bien sûr":"oczywiście","à bientôt":"do zobaczenia","bon appétit":"smacznego","félicitations":"gratulacje","bienvenue":"witamy","attention":"uwaga",
"entrer":"wchodzić","sortir":"wychodzić","monter":"iść w górę","descendre":"schodzić","rester":"zostawać","partir":"wyjeżdżać","tomber":"spadać","sauter":"skakać","voler":"latać","conduire":"prowadzić","arrêter":"zatrzymywać","revenir":"wracać","je reste à la maison":"zostaję w domu","le train part à huit heures":"pociąg odjeżdża o ósmej",
"poulet":"kurczak","jambon":"szynka","saucisse":"kiełbasa","pâtes":"makaron","frites":"frytki","champignon":"grzyb","miel":"miód","confiture":"dżem","yaourt":"jogurt","glace":"lody","chocolat":"czekolada","bonbon":"cukierek","biscuit":"herbatnik",
"compte":"konto","facture":"faktura","impôt":"podatek","loyer":"czynsz","pièce":"moneta","distributeur":"bankomat","économiser":"oszczędzać","dépenser":"wydawać","économies":"oszczędności","reçu":"paragon",
"jupe":"spódnica","pull":"sweter","veste":"kurtka","chaussettes":"skarpetki","gants":"rękawiczki","écharpe":"szalik","ceinture":"pasek","poche":"kieszeń","bouton":"guzik","taille":"rozmiar","mode":"moda",
"se réveiller":"budzić się","se lever":"wstawać","s'habiller":"ubierać się","réveil":"budzik","se dépêcher":"spieszyć się","se coucher":"kłaść się spać","préparer":"przygotowywać","nettoyer":"sprzątać","ranger":"porządkować","repasser":"prasować","je me lève à sept heures":"wstaję o siódmej"
},
ru:{
"imprimante":"принтер","écouteurs":"наушники","appareil photo":"фотоаппарат","allumer":"включать","éteindre":"выключать","fichier":"файл","site":"сайт","réseau":"сеть","jeu vidéo":"видеоигра","télécharger":"скачивать",
"pays":"страна","monde":"мир","capitale":"столица","drapeau":"флаг","nord":"север","sud":"юг","est":"восток","ouest":"запад","roi":"король","reine":"королева","guerre":"война","paix":"мир","mon pays est beau":"моя страна красивая",
"je ne comprends pas":"я не понимаю","pouvez-vous répéter":"повторите пожалуйста","je suis d'accord":"я согласен","ça ne fait rien":"ничего страшного","bien sûr":"конечно","à bientôt":"до скорого","bon appétit":"приятного аппетита","félicitations":"поздравляю","bienvenue":"добро пожаловать","attention":"осторожно",
"entrer":"входить","sortir":"выходить","monter":"подниматься","descendre":"спускаться","rester":"оставаться","partir":"уезжать","tomber":"падать","sauter":"прыгать","voler":"летать","conduire":"водить","arrêter":"останавливать","revenir":"возвращаться","je reste à la maison":"я остаюсь дома","le train part à huit heures":"поезд отправляется в восемь часов",
"poulet":"курица","jambon":"ветчина","saucisse":"колбаса","pâtes":"макароны","frites":"картофель фри","champignon":"гриб","miel":"мёд","confiture":"варенье","yaourt":"йогурт","glace":"мороженое","chocolat":"шоколад","bonbon":"конфета","biscuit":"печенье",
"compte":"счёт","facture":"квитанция","impôt":"налог","loyer":"арендная плата","pièce":"монета","distributeur":"банкомат","économiser":"экономить","dépenser":"тратить","économies":"сбережения","reçu":"чек",
"jupe":"юбка","pull":"свитер","veste":"куртка","chaussettes":"носки","gants":"перчатки","écharpe":"шарф","ceinture":"ремень","poche":"карман","bouton":"пуговица","taille":"размер","mode":"мода",
"se réveiller":"просыпаться","se lever":"вставать","s'habiller":"одеваться","réveil":"будильник","se dépêcher":"торопиться","se coucher":"ложиться спать","préparer":"подготавливать","nettoyer":"чистить","ranger":"убирать","repasser":"гладить","je me lève à sept heures":"я встаю в семь часов"
},
uk:{
"imprimante":"принтер","écouteurs":"навушники","appareil photo":"фотоапарат","allumer":"вмикати","éteindre":"вимикати","fichier":"файл","site":"сайт","réseau":"мережа","jeu vidéo":"відеогра","télécharger":"завантажувати",
"pays":"країна","monde":"світ","capitale":"столиця","drapeau":"прапор","nord":"північ","sud":"південь","est":"схід","ouest":"захід","roi":"король","reine":"королева","guerre":"війна","paix":"мир","mon pays est beau":"моя країна гарна",
"je ne comprends pas":"я не розумію","pouvez-vous répéter":"повторіть будь ласка","je suis d'accord":"я згоден","ça ne fait rien":"нічого страшного","bien sûr":"звичайно","à bientôt":"до зустрічі","bon appétit":"смачного","félicitations":"вітаю","bienvenue":"ласкаво просимо","attention":"обережно",
"entrer":"заходити","sortir":"виходити","monter":"підніматися","descendre":"спускатися","rester":"залишатися","partir":"від'їжджати","tomber":"падати","sauter":"стрибати","voler":"літати","conduire":"водити","arrêter":"зупиняти","revenir":"повертатися","je reste à la maison":"я залишаюся вдома","le train part à huit heures":"потяг відправляється о восьмій",
"poulet":"курка","jambon":"шинка","saucisse":"ковбаса","pâtes":"макарони","frites":"картопля фрі","champignon":"гриб","miel":"мед","confiture":"варення","yaourt":"йогурт","glace":"морозиво","chocolat":"шоколад","bonbon":"цукерка","biscuit":"печиво",
"compte":"рахунок","facture":"квитанція","impôt":"податок","loyer":"орендна плата","pièce":"монета","distributeur":"банкомат","économiser":"заощаджувати","dépenser":"витрачати","économies":"заощадження","reçu":"чек",
"jupe":"спідниця","pull":"светр","veste":"куртка","chaussettes":"шкарпетки","gants":"рукавички","écharpe":"шарф","ceinture":"ремінь","poche":"кишеня","bouton":"ґудзик","taille":"розмір","mode":"мода",
"se réveiller":"прокидатися","se lever":"вставати","s'habiller":"одягатися","réveil":"будильник","se dépêcher":"поспішати","se coucher":"лягати спати","préparer":"підготовувати","nettoyer":"чистити","ranger":"прибирати","repasser":"прасувати","je me lève à sept heures":"я встаю о сьомій"
},
cs:{
"imprimante":"tiskárna","écouteurs":"sluchátka","appareil photo":"fotoaparát","allumer":"zapnout","éteindre":"vypnout","fichier":"soubor","site":"webová stránka","réseau":"síť","jeu vidéo":"videohra","télécharger":"stáhnout",
"pays":"země","monde":"svět","capitale":"hlavní město","drapeau":"vlajka","nord":"sever","sud":"jih","est":"východ","ouest":"západ","roi":"král","reine":"královna","guerre":"válka","paix":"mír","mon pays est beau":"moje země je krásná",
"je ne comprends pas":"nerozumím","pouvez-vous répéter":"můžete to zopakovat","je suis d'accord":"souhlasím","ça ne fait rien":"to nevadí","bien sûr":"samozřejmě","à bientôt":"brzy na viděnou","bon appétit":"dobrou chuť","félicitations":"gratuluji","bienvenue":"vítejte","attention":"pozor",
"entrer":"vcházet","sortir":"vycházet","monter":"stoupat","descendre":"scházet","rester":"zůstávat","partir":"odjíždět","tomber":"padat","sauter":"skákat","voler":"létat","conduire":"řídit","arrêter":"zastavovat","revenir":"vracet se","je reste à la maison":"zůstávám doma","le train part à huit heures":"vlak odjíždí v osm hodin",
"poulet":"kuře","jambon":"šunka","saucisse":"klobása","pâtes":"těstoviny","frites":"hranolky","champignon":"houba","miel":"med","confiture":"džem","yaourt":"jogurt","glace":"zmrzlina","chocolat":"čokoláda","bonbon":"bonbón","biscuit":"sušenka",
"compte":"účet","facture":"faktura","impôt":"daň","loyer":"nájem","pièce":"mince","distributeur":"bankomat","économiser":"šetřit","dépenser":"utrácet","économies":"úspory","reçu":"účtenka",
"jupe":"sukně","pull":"svetr","veste":"bunda","chaussettes":"ponožky","gants":"rukavice","écharpe":"šála","ceinture":"pásek","poche":"kapsa","bouton":"knoflík","taille":"velikost","mode":"móda",
"se réveiller":"probouzet se","se lever":"vstávat","s'habiller":"oblékat se","réveil":"budík","se dépêcher":"spěchat","se coucher":"jít spát","préparer":"připravovat","nettoyer":"čistit","ranger":"uklízet","repasser":"žehlit","je me lève à sept heures":"vstávám v sedm hodin"
},
zh:{
"imprimante":"打印机","écouteurs":"耳机","appareil photo":"相机","allumer":"开机","éteindre":"关机","fichier":"文件","site":"网站","réseau":"网络","jeu vidéo":"电子游戏","télécharger":"下载",
"pays":"国家","monde":"世界","capitale":"首都","drapeau":"国旗","nord":"北","sud":"南","est":"东","ouest":"西","roi":"国王","reine":"王后","guerre":"战争","paix":"和平","mon pays est beau":"我 的 国家 很 美",
"je ne comprends pas":"我 不 明白","pouvez-vous répéter":"请 再 说 一遍","je suis d'accord":"我 同意","ça ne fait rien":"没关系","bien sûr":"当然","à bientôt":"回头见","bon appétit":"慢慢吃","félicitations":"恭喜","bienvenue":"欢迎","attention":"小心",
"entrer":"进","sortir":"出去","monter":"上去","descendre":"下去","rester":"留下","partir":"离开","tomber":"摔倒","sauter":"跳","voler":"飞","conduire":"开车","arrêter":"停","revenir":"回来","je reste à la maison":"我 留 在 家里","le train part à huit heures":"火车 八点 出发",
"poulet":"鸡肉","jambon":"火腿","saucisse":"香肠","pâtes":"意大利面","frites":"薯条","champignon":"蘑菇","miel":"蜂蜜","confiture":"果酱","yaourt":"酸奶","glace":"冰淇淋","chocolat":"巧克力","bonbon":"糖果","biscuit":"饼干",
"compte":"账户","facture":"发票","impôt":"税","loyer":"房租","pièce":"硬币","distributeur":"取款机","économiser":"存钱","dépenser":"花钱","économies":"积蓄","reçu":"收据",
"jupe":"裙子","pull":"毛衣","veste":"夹克","chaussettes":"袜子","gants":"手套","écharpe":"围巾","ceinture":"腰带","poche":"口袋","bouton":"扣子","taille":"尺寸","mode":"时尚",
"se réveiller":"醒来","se lever":"起床","s'habiller":"穿衣服","réveil":"闹钟","se dépêcher":"赶时间","se coucher":"上床睡觉","préparer":"准备","nettoyer":"打扫","ranger":"收拾","repasser":"熨衣服","je me lève à sept heures":"我 七点 起床"
},
ja:{
"imprimante":"プリンター","écouteurs":"イヤホン","appareil photo":"カメラ","allumer":"つけます","éteindre":"消します","fichier":"ファイル","site":"ウェブサイト","réseau":"ネットワーク","jeu vidéo":"テレビゲーム","télécharger":"ダウンロードします",
"pays":"国","monde":"世界","capitale":"首都","drapeau":"国旗","nord":"北","sud":"南","est":"東","ouest":"西","roi":"王様","reine":"女王","guerre":"戦争","paix":"平和","mon pays est beau":"私 の 国 は 美しい です",
"je ne comprends pas":"わかりません","pouvez-vous répéter":"もう一度 言ってください","je suis d'accord":"賛成 です","ça ne fait rien":"大丈夫 です","bien sûr":"もちろん","à bientôt":"また ね","bon appétit":"いただきます","félicitations":"おめでとう","bienvenue":"ようこそ","attention":"気をつけて",
"entrer":"入ります","sortir":"出ます","monter":"上がります","descendre":"下ります","rester":"残ります","partir":"出発します","tomber":"転びます","sauter":"跳びます","voler":"飛びます","conduire":"運転します","arrêter":"止めます","revenir":"戻ります","je reste à la maison":"私 は 家 に います","le train part à huit heures":"電車 は 八時 に 出発します",
"poulet":"鶏肉","jambon":"ハム","saucisse":"ソーセージ","pâtes":"パスタ","frites":"フライドポテト","champignon":"きのこ","miel":"はちみつ","confiture":"ジャム","yaourt":"ヨーグルト","glace":"アイスクリーム","chocolat":"チョコレート","bonbon":"あめ","biscuit":"クッキー",
"compte":"口座","facture":"請求書","impôt":"税金","loyer":"家賃","pièce":"硬貨","distributeur":"ATM","économiser":"貯金します","dépenser":"使います","économies":"貯金","reçu":"レシート",
"jupe":"スカート","pull":"セーター","veste":"ジャケット","chaussettes":"靴下","gants":"手袋","écharpe":"マフラー","ceinture":"ベルト","poche":"ポケット","bouton":"ボタン","taille":"サイズ","mode":"ファッション",
"se réveiller":"目が覚めます","se lever":"起きます","s'habiller":"着替えます","réveil":"目覚まし時計","se dépêcher":"急ぎます","se coucher":"寝ます","préparer":"準備します","nettoyer":"掃除します","ranger":"片付けます","repasser":"アイロンをかけます","je me lève à sept heures":"私 は 七時 に 起きます"
},
ko:{
"imprimante":"프린터","écouteurs":"이어폰","appareil photo":"카메라","allumer":"켜다","éteindre":"끄다","fichier":"파일","site":"웹사이트","réseau":"네트워크","jeu vidéo":"비디오 게임","télécharger":"다운로드하다",
"pays":"나라","monde":"세계","capitale":"수도","drapeau":"국기","nord":"북쪽","sud":"남쪽","est":"동쪽","ouest":"서쪽","roi":"왕","reine":"여왕","guerre":"전쟁","paix":"평화","mon pays est beau":"우리 나라는 아름다워요",
"je ne comprends pas":"이해가 안 돼요","pouvez-vous répéter":"다시 말해 주세요","je suis d'accord":"동의해요","ça ne fait rien":"괜찮아요","bien sûr":"물론이죠","à bientôt":"또 봐요","bon appétit":"맛있게 드세요","félicitations":"축하해요","bienvenue":"환영해요","attention":"조심하세요",
"entrer":"들어가다","sortir":"나가다","monter":"올라가다","descendre":"내려가다","rester":"머무르다","partir":"떠나다","tomber":"넘어지다","sauter":"뛰다","voler":"날다","conduire":"운전하다","arrêter":"멈추다","revenir":"돌아오다","je reste à la maison":"저는 집에 있어요","le train part à huit heures":"기차는 여덟 시에 출발해요",
"poulet":"닭고기","jambon":"햄","saucisse":"소시지","pâtes":"파스타","frites":"감자튀김","champignon":"버섯","miel":"꿀","confiture":"잼","yaourt":"요구르트","glace":"아이스크림","chocolat":"초콜릿","bonbon":"사탕","biscuit":"쿠키",
"compte":"계좌","facture":"청구서","impôt":"세금","loyer":"집세","pièce":"동전","distributeur":"현금 인출기","économiser":"저축하다","dépenser":"쓰다","économies":"저축","reçu":"영수증",
"jupe":"치마","pull":"스웨터","veste":"재킷","chaussettes":"양말","gants":"장갑","écharpe":"목도리","ceinture":"벨트","poche":"주머니","bouton":"단추","taille":"사이즈","mode":"패션",
"se réveiller":"깨다","se lever":"일어나다","s'habiller":"옷을 입다","réveil":"알람 시계","se dépêcher":"서두르다","se coucher":"잠자리에 들다","préparer":"준비하다","nettoyer":"청소하다","ranger":"정리하다","repasser":"다림질하다","je me lève à sept heures":"저는 일곱 시에 일어나요"
},
ar:{
"imprimante":"طابعة","écouteurs":"سماعات","appareil photo":"كاميرا","allumer":"يشغل","éteindre":"يطفئ","fichier":"ملف","site":"موقع إلكتروني","réseau":"شبكة","jeu vidéo":"لعبة فيديو","télécharger":"يحمل",
"pays":"بلد","monde":"عالم","capitale":"عاصمة","drapeau":"علم","nord":"شمال","sud":"جنوب","est":"شرق","ouest":"غرب","roi":"ملك","reine":"ملكة","guerre":"حرب","paix":"سلام","mon pays est beau":"بلدي جميل",
"je ne comprends pas":"لا أفهم","pouvez-vous répéter":"هل يمكنك أن تكرر","je suis d'accord":"أنا موافق","ça ne fait rien":"لا بأس","bien sûr":"بالطبع","à bientôt":"إلى اللقاء","bon appétit":"بالهناء والشفاء","félicitations":"مبروك","bienvenue":"أهلا وسهلا","attention":"انتبه",
"entrer":"يدخل","sortir":"يخرج","monter":"يصعد","descendre":"ينزل","rester":"يبقى","partir":"يغادر","tomber":"يسقط","sauter":"يقفز","voler":"يطير","conduire":"يقود","arrêter":"يوقف","revenir":"يعود","je reste à la maison":"أبقى في البيت","le train part à huit heures":"يغادر القطار في الساعة الثامنة",
"poulet":"دجاج","jambon":"جامبون","saucisse":"نقانق","pâtes":"معكرونة","frites":"بطاطس مقلية","champignon":"فطر","miel":"عسل","confiture":"مربى","yaourt":"زبادي","glace":"آيس كريم","chocolat":"شوكولاتة","bonbon":"سكاكر","biscuit":"بسكويت",
"compte":"حساب","facture":"فاتورة","impôt":"ضريبة","loyer":"إيجار","pièce":"عملة معدنية","distributeur":"صراف آلي","économiser":"يوفر","dépenser":"ينفق","économies":"مدخرات","reçu":"إيصال",
"jupe":"تنورة","pull":"كنزة","veste":"سترة","chaussettes":"جوارب","gants":"قفازات","écharpe":"وشاح","ceinture":"حزام","poche":"جيب","bouton":"زر","taille":"مقاس","mode":"موضة",
"se réveiller":"يستيقظ","se lever":"ينهض","s'habiller":"يلبس","réveil":"منبه","se dépêcher":"يستعجل","se coucher":"يذهب للنوم","préparer":"يحضر","nettoyer":"ينظف","ranger":"يرتب","repasser":"يكوي","je me lève à sept heures":"أنهض في الساعة السابعة"
}
};
LANGS2.forEach(function(l){ var h2=LEX2H[l]||{}; Object.keys(h2).forEach(function(k){ LEX2[l][k]=h2[k]; }); });
/* ── Vague 9 nouvelles langues (v2.78) : unités 65-72 — la vie qui passe, décrire le
   monde, petits mots 2, raconter, la planète, les fêtes, vrai ou faux, sur la route.
   Anti-collisions vérifiées : pl ancien=dawny (stary=vieux) ; ru ancien=старинный
   (старый=vieux), tout de suite=немедленно (сейчас=maintenant), d'accord=ладно ;
   uk jour férié=святковий день (свято=fête) ; cs ancien=starobylý (starý=vieux),
   feu rouge=červená (fém., ≠ červený=rouge) ; ja ancien=昔の (古い=vieux),
   intéressant=興味深い (面白い=drôle), raconter=語ります (話します=parler) ;
   ar silencieux=صامت (هادئ=calme), Noël=عيد الميلاد المجيد (≠ عيد ميلاد=anniversaire).
   Homographe réel assumé : ja 高い = cher ET haut (takai, seul mot naturel). */
var LEX2I = {
pl:{
"naître":"rodzić się","grandir":"dorastać","mourir":"umierać","vie":"życie","mort":"śmierć","âge":"wiek","anniversaire":"urodziny","mariage":"ślub","naissance":"narodziny","enfance":"dzieciństwo","joyeux anniversaire":"wszystkiego najlepszego","la vie est belle":"życie jest piękne","avenir":"przyszłość","passé":"przeszłość","souvenir":"wspomnienie",
"clair":"jasny","foncé":"ciemny","mouillé":"mokry","sec":"suchy","doux":"miękki","dur":"twardy","profond":"głęboki","haut":"wysoki","bas":"niski","moderne":"nowoczesny","ancien":"dawny","bruyant":"hałaśliwy","silencieux":"cichy","bruit":"hałas","ennuyeux":"nudny","intéressant":"ciekawy","célèbre":"sławny",
"lequel":"który","quelque part":"gdzieś","nulle part":"nigdzie","ensemble":"razem","seulement":"tylko","d'accord":"zgoda","vraiment":"naprawdę","déjà":"już","presque":"prawie","ensuite":"następnie","enfin":"nareszcie","tout de suite":"natychmiast",
"raconter":"opowiadać","décrire":"opisywać","répéter":"powtarzać","traduire":"tłumaczyć","signifier":"znaczyć","histoire":"historia","promettre":"obiecywać","mentir":"kłamać","crier":"krzyczeć","remercier":"dziękować","inviter":"zapraszać","souhaiter":"życzyć",
"environnement":"środowisko","pollution":"zanieczyszczenie","déchets":"śmieci","recycler":"poddawać recyklingowi","protéger":"chronić","énergie":"energia","planète":"planeta","climat":"klimat","nature":"przyroda","air":"powietrze","sauvage":"dziki","animal":"zwierzę","paysage":"krajobraz","lumière":"światło",
"Noël":"Boże Narodzenie","Pâques":"Wielkanoc","nouvel an":"Nowy Rok","week-end":"weekend","jour férié":"święto","surprise":"niespodzianka","ballon":"balon","feu d'artifice":"fajerwerki","invitation":"zaproszenie","carnaval":"karnawał",
"vrai":"prawdziwy","faux":"fałszywy","possible":"możliwy","impossible":"niemożliwy","je suis prêt":"jestem gotowy","utile":"przydatny","prêt":"gotowy","occupé":"zajęty","libre":"wolny",
"permis":"prawo jazdy","essence":"benzyna","station-service":"stacja benzynowa","se garer":"parkować","vitesse":"prędkość","il y a trop de circulation":"jest za duży ruch","feu rouge":"czerwone światło","carrefour":"skrzyżowanie","autoroute":"autostrada","circulation":"ruch uliczny","accident":"wypadek"
},
ru:{
"naître":"рождаться","grandir":"расти","mourir":"умирать","vie":"жизнь","mort":"смерть","âge":"возраст","anniversaire":"день рождения","mariage":"свадьба","naissance":"рождение","enfance":"детство","joyeux anniversaire":"с днём рождения","la vie est belle":"жизнь прекрасна","avenir":"будущее","passé":"прошлое","souvenir":"воспоминание",
"clair":"светлый","foncé":"тёмный","mouillé":"мокрый","sec":"сухой","doux":"мягкий","dur":"твёрдый","profond":"глубокий","haut":"высокий","bas":"низкий","moderne":"современный","ancien":"старинный","bruyant":"шумный","silencieux":"тихий","bruit":"шум","ennuyeux":"скучный","intéressant":"интересный","célèbre":"известный",
"lequel":"который","quelque part":"где-то","nulle part":"нигде","ensemble":"вместе","seulement":"только","d'accord":"ладно","vraiment":"действительно","déjà":"уже","presque":"почти","ensuite":"затем","enfin":"наконец","tout de suite":"немедленно",
"raconter":"рассказывать","décrire":"описывать","répéter":"повторять","traduire":"переводить","signifier":"означать","histoire":"история","promettre":"обещать","mentir":"врать","crier":"кричать","remercier":"благодарить","inviter":"приглашать","souhaiter":"желать",
"environnement":"окружающая среда","pollution":"загрязнение","déchets":"мусор","recycler":"перерабатывать","protéger":"защищать","énergie":"энергия","planète":"планета","climat":"климат","nature":"природа","air":"воздух","sauvage":"дикий","animal":"животное","paysage":"пейзаж","lumière":"свет",
"Noël":"Рождество","Pâques":"Пасха","nouvel an":"Новый год","week-end":"выходные","jour férié":"праздничный день","surprise":"сюрприз","ballon":"воздушный шар","feu d'artifice":"фейерверк","invitation":"приглашение","carnaval":"карнавал",
"vrai":"настоящий","faux":"ложный","possible":"возможный","impossible":"невозможный","je suis prêt":"я готов","utile":"полезный","prêt":"готовый","occupé":"занятый","libre":"свободный",
"permis":"водительские права","essence":"бензин","station-service":"заправка","se garer":"парковаться","vitesse":"скорость","il y a trop de circulation":"слишком много машин","feu rouge":"красный свет","carrefour":"перекрёсток","autoroute":"шоссе","circulation":"движение","accident":"авария"
},
uk:{
"naître":"народжуватися","grandir":"рости","mourir":"помирати","vie":"життя","mort":"смерть","âge":"вік","anniversaire":"день народження","mariage":"весілля","naissance":"народження","enfance":"дитинство","joyeux anniversaire":"з днем народження","la vie est belle":"життя прекрасне","avenir":"майбутнє","passé":"минуле","souvenir":"спогад",
"clair":"світлий","foncé":"темний","mouillé":"мокрий","sec":"сухий","doux":"м'який","dur":"твердий","profond":"глибокий","haut":"високий","bas":"низький","moderne":"сучасний","ancien":"давній","bruyant":"гучний","silencieux":"тихий","bruit":"шум","ennuyeux":"нудний","intéressant":"цікавий","célèbre":"відомий",
"lequel":"котрий","quelque part":"десь","nulle part":"ніде","ensemble":"разом","seulement":"тільки","d'accord":"гаразд","vraiment":"справді","déjà":"вже","presque":"майже","ensuite":"потім","enfin":"нарешті","tout de suite":"негайно",
"raconter":"розповідати","décrire":"описувати","répéter":"повторювати","traduire":"перекладати","signifier":"означати","histoire":"історія","promettre":"обіцяти","mentir":"брехати","crier":"кричати","remercier":"дякувати","inviter":"запрошувати","souhaiter":"бажати",
"environnement":"довкілля","pollution":"забруднення","déchets":"сміття","recycler":"переробляти","protéger":"захищати","énergie":"енергія","planète":"планета","climat":"клімат","nature":"природа","air":"повітря","sauvage":"дикий","animal":"тварина","paysage":"краєвид","lumière":"світло",
"Noël":"Різдво","Pâques":"Великдень","nouvel an":"Новий рік","week-end":"вихідні","jour férié":"святковий день","surprise":"сюрприз","ballon":"повітряна кулька","feu d'artifice":"феєрверк","invitation":"запрошення","carnaval":"карнавал",
"vrai":"правдивий","faux":"хибний","possible":"можливий","impossible":"неможливий","je suis prêt":"я готовий","utile":"корисний","prêt":"готовий","occupé":"зайнятий","libre":"вільний",
"permis":"водійські права","essence":"бензин","station-service":"заправка","se garer":"паркуватися","vitesse":"швидкість","il y a trop de circulation":"забагато машин","feu rouge":"червоне світло","carrefour":"перехрестя","autoroute":"автомагістраль","circulation":"дорожній рух","accident":"аварія"
},
cs:{
"naître":"narodit se","grandir":"vyrůstat","mourir":"umírat","vie":"život","mort":"smrt","âge":"věk","anniversaire":"narozeniny","mariage":"svatba","naissance":"narození","enfance":"dětství","joyeux anniversaire":"všechno nejlepší","la vie est belle":"život je krásný","avenir":"budoucnost","passé":"minulost","souvenir":"vzpomínka",
"clair":"světlý","foncé":"tmavý","mouillé":"mokrý","sec":"suchý","doux":"měkký","dur":"tvrdý","profond":"hluboký","haut":"vysoký","bas":"nízký","moderne":"moderní","ancien":"starobylý","bruyant":"hlučný","silencieux":"tichý","bruit":"hluk","ennuyeux":"nudný","intéressant":"zajímavý","célèbre":"slavný",
"lequel":"který","quelque part":"někde","nulle part":"nikde","ensemble":"spolu","seulement":"jenom","d'accord":"dobře","vraiment":"opravdu","déjà":"už","presque":"skoro","ensuite":"potom","enfin":"konečně","tout de suite":"hned",
"raconter":"vyprávět","décrire":"popisovat","répéter":"opakovat","traduire":"překládat","signifier":"znamenat","histoire":"příběh","promettre":"slibovat","mentir":"lhát","crier":"křičet","remercier":"děkovat","inviter":"zvát","souhaiter":"přát",
"environnement":"životní prostředí","pollution":"znečištění","déchets":"odpadky","recycler":"recyklovat","protéger":"chránit","énergie":"energie","planète":"planeta","climat":"podnebí","nature":"příroda","air":"vzduch","sauvage":"divoký","animal":"zvíře","paysage":"krajina","lumière":"světlo",
"Noël":"Vánoce","Pâques":"Velikonoce","nouvel an":"Nový rok","week-end":"víkend","jour férié":"svátek","surprise":"překvapení","ballon":"balónek","feu d'artifice":"ohňostroj","invitation":"pozvánka","carnaval":"karneval",
"vrai":"pravdivý","faux":"falešný","possible":"možný","impossible":"nemožný","je suis prêt":"jsem připraven","utile":"užitečný","prêt":"připravený","occupé":"zaneprázdněný","libre":"volný",
"permis":"řidičský průkaz","essence":"benzín","station-service":"čerpací stanice","se garer":"parkovat","vitesse":"rychlost","il y a trop de circulation":"je moc velký provoz","feu rouge":"červená","carrefour":"křižovatka","autoroute":"dálnice","circulation":"provoz","accident":"nehoda"
},
zh:{
"naître":"出生","grandir":"长大","mourir":"死","vie":"生活","mort":"死亡","âge":"年龄","anniversaire":"生日","mariage":"婚礼","naissance":"诞生","enfance":"童年","joyeux anniversaire":"生日 快乐","la vie est belle":"生活 真 美好","avenir":"未来","passé":"过去","souvenir":"回忆",
"clair":"明亮的","foncé":"深色的","mouillé":"湿的","sec":"干的","doux":"柔软的","dur":"硬的","profond":"深的","haut":"高的","bas":"低的","moderne":"现代的","ancien":"古老的","bruyant":"吵闹的","silencieux":"安静的","bruit":"噪音","ennuyeux":"无聊的","intéressant":"有趣的","célèbre":"有名的",
"lequel":"哪一个","quelque part":"某个地方","nulle part":"哪里都不","ensemble":"一起","seulement":"只","d'accord":"好的","vraiment":"确实","déjà":"已经","presque":"几乎","ensuite":"然后","enfin":"终于","tout de suite":"马上",
"raconter":"讲述","décrire":"描述","répéter":"重复","traduire":"翻译","signifier":"意思是","histoire":"故事","promettre":"承诺","mentir":"说谎","crier":"喊叫","remercier":"感谢","inviter":"邀请","souhaiter":"祝愿",
"environnement":"环境","pollution":"污染","déchets":"垃圾","recycler":"回收","protéger":"保护","énergie":"能源","planète":"行星","climat":"气候","nature":"大自然","air":"空气","sauvage":"野生的","animal":"动物","paysage":"风景","lumière":"光",
"Noël":"圣诞节","Pâques":"复活节","nouvel an":"新年","week-end":"周末","jour férié":"法定假日","surprise":"惊喜","ballon":"气球","feu d'artifice":"烟花","invitation":"邀请函","carnaval":"狂欢节",
"vrai":"真的","faux":"假的","possible":"可能的","impossible":"不可能的","je suis prêt":"我 准备好了","utile":"有用的","prêt":"准备好的","occupé":"忙碌的","libre":"有空的",
"permis":"驾照","essence":"汽油","station-service":"加油站","se garer":"停车","vitesse":"速度","il y a trop de circulation":"路上 车 太多了","feu rouge":"红灯","carrefour":"十字路口","autoroute":"高速公路","circulation":"交通","accident":"事故"
},
ja:{
"naître":"生まれます","grandir":"育ちます","mourir":"死にます","vie":"人生","mort":"死","âge":"年齢","anniversaire":"誕生日","mariage":"結婚式","naissance":"誕生","enfance":"子供時代","joyeux anniversaire":"お誕生日 おめでとう","la vie est belle":"人生 は 美しい です","avenir":"未来","passé":"過去","souvenir":"思い出",
"clair":"明るい","foncé":"暗い","mouillé":"濡れた","sec":"乾いた","doux":"柔らかい","dur":"硬い","profond":"深い","haut":"高い","bas":"低い","moderne":"現代的な","ancien":"昔の","bruyant":"うるさい","silencieux":"静かな","bruit":"騒音","ennuyeux":"退屈な","intéressant":"興味深い","célèbre":"有名な",
"lequel":"どれ","quelque part":"どこかに","nulle part":"どこにも","ensemble":"一緒に","seulement":"だけ","d'accord":"分かりました","vraiment":"本当に","déjà":"もう","presque":"ほとんど","ensuite":"それから","enfin":"やっと","tout de suite":"すぐに",
"raconter":"語ります","décrire":"描写します","répéter":"繰り返します","traduire":"翻訳します","signifier":"意味します","histoire":"物語","promettre":"約束します","mentir":"嘘をつきます","crier":"叫びます","remercier":"感謝します","inviter":"招待します","souhaiter":"願います",
"environnement":"環境","pollution":"汚染","déchets":"ゴミ","recycler":"リサイクルします","protéger":"守ります","énergie":"エネルギー","planète":"惑星","climat":"気候","nature":"自然","air":"空気","sauvage":"野生の","animal":"動物","paysage":"景色","lumière":"光",
"Noël":"クリスマス","Pâques":"イースター","nouvel an":"お正月","week-end":"週末","jour férié":"祝日","surprise":"サプライズ","ballon":"風船","feu d'artifice":"花火","invitation":"招待状","carnaval":"カーニバル",
"vrai":"本当の","faux":"偽の","possible":"可能な","impossible":"不可能な","je suis prêt":"準備 が できました","utile":"役に立つ","prêt":"準備ができた","occupé":"忙しい","libre":"暇な",
"permis":"運転免許","essence":"ガソリン","station-service":"ガソリンスタンド","se garer":"駐車します","vitesse":"スピード","il y a trop de circulation":"交通量 が 多い です","feu rouge":"赤信号","carrefour":"交差点","autoroute":"高速道路","circulation":"交通量","accident":"事故"
},
ko:{
"naître":"태어나다","grandir":"자라다","mourir":"죽다","vie":"인생","mort":"죽음","âge":"나이","anniversaire":"생일","mariage":"결혼식","naissance":"탄생","enfance":"어린 시절","joyeux anniversaire":"생일 축하해요","la vie est belle":"인생은 아름다워요","avenir":"미래","passé":"과거","souvenir":"추억",
"clair":"밝은","foncé":"어두운","mouillé":"젖은","sec":"마른","doux":"부드러운","dur":"딱딱한","profond":"깊은","haut":"높은","bas":"낮은","moderne":"현대적인","ancien":"오래된","bruyant":"시끄러운","silencieux":"조용한","bruit":"소음","ennuyeux":"지루한","intéressant":"흥미로운","célèbre":"유명한",
"lequel":"어느 것","quelque part":"어딘가에","nulle part":"아무 데도","ensemble":"함께","seulement":"오직","d'accord":"알겠어요","vraiment":"정말","déjà":"이미","presque":"거의","ensuite":"그다음에","enfin":"마침내","tout de suite":"바로",
"raconter":"들려주다","décrire":"묘사하다","répéter":"반복하다","traduire":"번역하다","signifier":"의미하다","histoire":"이야기","promettre":"약속하다","mentir":"거짓말하다","crier":"소리치다","remercier":"감사하다","inviter":"초대하다","souhaiter":"빌다",
"environnement":"환경","pollution":"오염","déchets":"쓰레기","recycler":"재활용하다","protéger":"보호하다","énergie":"에너지","planète":"행성","climat":"기후","nature":"자연","air":"공기","sauvage":"야생의","animal":"동물","paysage":"경치","lumière":"빛",
"Noël":"크리스마스","Pâques":"부활절","nouvel an":"새해","week-end":"주말","jour férié":"공휴일","surprise":"서프라이즈","ballon":"풍선","feu d'artifice":"불꽃놀이","invitation":"초대장","carnaval":"카니발",
"vrai":"진짜","faux":"가짜","possible":"가능한","impossible":"불가능한","je suis prêt":"준비됐어요","utile":"유용한","prêt":"준비된","occupé":"바쁜","libre":"한가한",
"permis":"운전면허","essence":"휘발유","station-service":"주유소","se garer":"주차하다","vitesse":"속도","il y a trop de circulation":"차가 너무 많아요","feu rouge":"빨간불","carrefour":"교차로","autoroute":"고속도로","circulation":"교통","accident":"사고"
},
ar:{
"naître":"يولد","grandir":"يكبر","mourir":"يموت","vie":"حياة","mort":"موت","âge":"عمر","anniversaire":"عيد ميلاد","mariage":"زفاف","naissance":"ولادة","enfance":"طفولة","joyeux anniversaire":"عيد ميلاد سعيد","la vie est belle":"الحياة جميلة","avenir":"مستقبل","passé":"ماضٍ","souvenir":"ذكرى",
"clair":"فاتح","foncé":"داكن","mouillé":"مبلل","sec":"جاف","doux":"ناعم","dur":"صلب","profond":"عميق","haut":"عالٍ","bas":"منخفض","moderne":"حديث","ancien":"قديم","bruyant":"صاخب","silencieux":"صامت","bruit":"ضجيج","ennuyeux":"ممل","intéressant":"مثير للاهتمام","célèbre":"مشهور",
"lequel":"أيهما","quelque part":"في مكان ما","nulle part":"لا مكان","ensemble":"معًا","seulement":"فقط","d'accord":"حسنًا","vraiment":"حقًا","déjà":"بالفعل","presque":"تقريبًا","ensuite":"بعد ذلك","enfin":"أخيرًا","tout de suite":"فورًا",
"raconter":"يروي","décrire":"يصف","répéter":"يكرر","traduire":"يترجم","signifier":"يعني","histoire":"قصة","promettre":"يعد","mentir":"يكذب","crier":"يصرخ","remercier":"يشكر","inviter":"يدعو","souhaiter":"يتمنى",
"environnement":"بيئة","pollution":"تلوث","déchets":"نفايات","recycler":"يعيد التدوير","protéger":"يحمي","énergie":"طاقة","planète":"كوكب","climat":"مناخ","nature":"طبيعة","air":"هواء","sauvage":"بري","animal":"حيوان","paysage":"منظر طبيعي","lumière":"ضوء",
"Noël":"عيد الميلاد المجيد","Pâques":"عيد الفصح","nouvel an":"رأس السنة","week-end":"عطلة نهاية الأسبوع","jour férié":"عطلة رسمية","surprise":"مفاجأة","ballon":"بالون","feu d'artifice":"ألعاب نارية","invitation":"دعوة","carnaval":"كرنفال",
"vrai":"صحيح","faux":"خاطئ","possible":"ممكن","impossible":"مستحيل","je suis prêt":"أنا جاهز","utile":"مفيد","prêt":"جاهز","occupé":"مشغول","libre":"متفرغ",
"permis":"رخصة قيادة","essence":"بنزين","station-service":"محطة وقود","se garer":"يركن السيارة","vitesse":"سرعة","il y a trop de circulation":"هناك ازدحام شديد","feu rouge":"إشارة حمراء","carrefour":"تقاطع","autoroute":"طريق سريع","circulation":"حركة المرور","accident":"حادث"
}
};
LANGS2.forEach(function(l){ var i2=LEX2I[l]||{}; Object.keys(i2).forEach(function(k){ LEX2[l][k]=i2[k]; }); });
/* ── Vague 10 nouvelles langues (v2.79) : unités 73-80 — émotions fines, météo fine,
   cuisine du chef, le logement, le corps en action, au magasin, les études, le temps précis.
   Anti-collisions vérifiées : pl bouillir=wrzeć (gotować=cuisiner), tempête=sztorm
   (burza=orage), satisfait=usatysfakcjonowany (zadowolony=content), cours=zajęcia
   (lekcja=leçon), échouer=oblać (przegrywać=perdre), siècle=stulecie (wiek=âge) ;
   ru depuis=с тех пор (с=avec), satisfait=удовлетворённый (довольный=content),
   étudier=изучать (учиться=apprendre), cours=занятие (урок=leçon), tempête=буря
   (гроза=orage) ; uk grimper=лізти (підніматися=monter), depuis=відтоді (з=avec),
   satisfait=вдоволений (задоволений=content), cours=заняття (урок=leçon) ;
   cs bouillir=vřít (vařit=cuisiner), cours=přednáška (hodina=heure), satisfait=uspokojený
   (spokojený=content), tempête=bouře (bouřka=orage) ; zh étudier=读书 (学习=apprendre),
   tenir=握住 (拿=prendre), cours=课程 (课=leçon), grimper=爬 (上去=monter) ;
   ja promotion=特売 (セール=soldes), grimper=登ります (上がります=monter), pendant=〜の間
   (間=entre) ; ko grimper=오르다 (올라가다=monter), détendu=느긋한 ; ar tempête=عاصفة شديدة
   (عاصفة=orage), tiroir=دُرج (درج=escalier), attraper=يمسك / tenir=يحمل.
   Homographes réels assumés : pl południe=sud+midi, północ=nord+minuit, uk північ=nord+minuit (mots slaves
   uniques, pas d'alternative) ; ar يدفع=payer ET pousser (dafaʿa, seul verbe naturel). */
var LEX2J = {
pl:{
"nerveux":"zdenerwowany","déçu":"rozczarowany","jaloux":"zazdrosny","stressé":"zestresowany","détendu":"zrelaksowany","ému":"wzruszony","satisfait":"usatysfakcjonowany","reconnaissant":"wdzięczny",
"brouillard":"mgła","éclair":"błyskawica","tonnerre":"grzmot","arc-en-ciel":"tęcza","tempête":"sztorm","quel temps fait-il":"jaka jest pogoda","gel":"mróz","degré":"stopień","prévisions":"prognoza","humide":"wilgotny","sécheresse":"susza",
"bouillir":"wrzeć","frire":"smażyć","griller":"grillować","mélanger":"mieszać","couper":"kroić","verser":"nalewać","casserole":"garnek","poêle":"patelnia","plateau":"taca","nappe":"obrus","micro-ondes":"mikrofalówka",
"appartement":"mieszkanie","immeuble":"blok","rez-de-chaussée":"parter","balcon":"balkon","terrasse":"taras","cheminée":"kominek","meuble":"mebel","canapé":"sofa","armoire":"szafa","tiroir":"szuflada","rideau":"zasłona","tapis":"dywan","déménager":"przeprowadzać się","nous déménageons demain":"jutro się przeprowadzamy",
"pousser":"pchać","tirer":"ciągnąć","lancer":"rzucać","attraper":"łapać","tenir":"trzymać","soulever":"podnosić","plier":"zginać","frapper":"uderzać","glisser":"ślizgać się","grimper":"wspinać się",
"rayon":"dział","vitrine":"witryna","marque":"marka","qualité":"jakość","choix":"wybór","rembourser":"zwracać pieniądze","échanger":"wymieniać","promotion":"promocja","comparer":"porównywać","choisir":"wybierać",
"université":"uniwersytet","étudiant":"student","cours":"zajęcia","diplôme":"dyplom","échouer":"oblać","étudier":"studiować","j'étudie à l'université":"studiuję na uniwersytecie","matière":"przedmiot","mathématiques":"matematyka","sciences":"nauka","géographie":"geografia","connaissance":"wiedza",
"seconde":"sekunda","instant":"chwila","siècle":"stulecie","époque":"epoka","midi":"południe","minuit":"północ","date":"data","calendrier":"kalendarz","horaire":"harmonogram","durée":"czas trwania","pendant":"podczas","depuis":"od"
},
ru:{
"nerveux":"нервный","déçu":"разочарованный","jaloux":"ревнивый","stressé":"напряжённый","détendu":"расслабленный","ému":"растроганный","satisfait":"удовлетворённый","reconnaissant":"благодарный",
"brouillard":"туман","éclair":"молния","tonnerre":"гром","arc-en-ciel":"радуга","tempête":"буря","quel temps fait-il":"какая погода","gel":"мороз","degré":"градус","prévisions":"прогноз","humide":"влажный","sécheresse":"засуха",
"bouillir":"кипятить","frire":"жарить","griller":"жарить на гриле","mélanger":"смешивать","couper":"резать","verser":"наливать","casserole":"кастрюля","poêle":"сковорода","plateau":"поднос","nappe":"скатерть","micro-ondes":"микроволновка",
"appartement":"квартира","immeuble":"здание","rez-de-chaussée":"первый этаж","balcon":"балкон","terrasse":"терраса","cheminée":"камин","meuble":"мебель","canapé":"диван","armoire":"шкаф","tiroir":"ящик","rideau":"штора","tapis":"ковёр","déménager":"переезжать","nous déménageons demain":"мы переезжаем завтра",
"pousser":"толкать","tirer":"тянуть","lancer":"бросать","attraper":"ловить","tenir":"держать","soulever":"поднимать","plier":"сгибать","frapper":"ударять","glisser":"скользить","grimper":"взбираться",
"rayon":"отдел","vitrine":"витрина","marque":"бренд","qualité":"качество","choix":"выбор","rembourser":"возвращать деньги","échanger":"обменивать","promotion":"акция","comparer":"сравнивать","choisir":"выбирать",
"université":"университет","étudiant":"студент","cours":"занятие","diplôme":"диплом","échouer":"провалиться","étudier":"изучать","j'étudie à l'université":"я учусь в университете","matière":"предмет","mathématiques":"математика","sciences":"наука","géographie":"география","connaissance":"знание",
"seconde":"секунда","instant":"момент","siècle":"век","époque":"эпоха","midi":"полдень","minuit":"полночь","date":"дата","calendrier":"календарь","horaire":"расписание","durée":"продолжительность","pendant":"во время","depuis":"с тех пор"
},
uk:{
"nerveux":"знервований","déçu":"розчарований","jaloux":"ревнивий","stressé":"напружений","détendu":"розслаблений","ému":"зворушений","satisfait":"вдоволений","reconnaissant":"вдячний",
"brouillard":"туман","éclair":"блискавка","tonnerre":"грім","arc-en-ciel":"веселка","tempête":"буря","quel temps fait-il":"яка погода","gel":"мороз","degré":"градус","prévisions":"прогноз","humide":"вологий","sécheresse":"посуха",
"bouillir":"кип'ятити","frire":"смажити","griller":"смажити на грилі","mélanger":"змішувати","couper":"різати","verser":"наливати","casserole":"каструля","poêle":"сковорідка","plateau":"таця","nappe":"скатертина","micro-ondes":"мікрохвильовка",
"appartement":"квартира","immeuble":"багатоповерхівка","rez-de-chaussée":"перший поверх","balcon":"балкон","terrasse":"тераса","cheminée":"камін","meuble":"меблі","canapé":"диван","armoire":"шафа","tiroir":"шухляда","rideau":"фіранка","tapis":"килим","déménager":"переїжджати","nous déménageons demain":"ми переїжджаємо завтра",
"pousser":"штовхати","tirer":"тягнути","lancer":"кидати","attraper":"ловити","tenir":"тримати","soulever":"піднімати","plier":"згинати","frapper":"вдаряти","glisser":"ковзати","grimper":"лізти",
"rayon":"відділ","vitrine":"вітрина","marque":"бренд","qualité":"якість","choix":"вибір","rembourser":"повертати гроші","échanger":"обмінювати","promotion":"акція","comparer":"порівнювати","choisir":"вибирати",
"université":"університет","étudiant":"студент","cours":"заняття","diplôme":"диплом","échouer":"провалитися","étudier":"навчатися","j'étudie à l'université":"я навчаюся в університеті","matière":"предмет","mathématiques":"математика","sciences":"наука","géographie":"географія","connaissance":"знання",
"seconde":"секунда","instant":"мить","siècle":"століття","époque":"епоха","midi":"полудень","minuit":"північ","date":"дата","calendrier":"календар","horaire":"розклад","durée":"тривалість","pendant":"під час","depuis":"відтоді"
},
cs:{
"nerveux":"nervózní","déçu":"zklamaný","jaloux":"žárlivý","stressé":"vystresovaný","détendu":"uvolněný","ému":"dojatý","satisfait":"uspokojený","reconnaissant":"vděčný",
"brouillard":"mlha","éclair":"blesk","tonnerre":"hrom","arc-en-ciel":"duha","tempête":"bouře","quel temps fait-il":"jaké je počasí","gel":"mráz","degré":"stupeň","prévisions":"předpověď","humide":"vlhký","sécheresse":"sucho",
"bouillir":"vřít","frire":"smažit","griller":"grilovat","mélanger":"míchat","couper":"krájet","verser":"nalévat","casserole":"hrnec","poêle":"pánev","plateau":"podnos","nappe":"ubrus","micro-ondes":"mikrovlnka",
"appartement":"byt","immeuble":"bytový dům","rez-de-chaussée":"přízemí","balcon":"balkón","terrasse":"terasa","cheminée":"krb","meuble":"nábytek","canapé":"pohovka","armoire":"skříň","tiroir":"šuplík","rideau":"závěs","tapis":"koberec","déménager":"stěhovat se","nous déménageons demain":"zítra se stěhujeme",
"pousser":"tlačit","tirer":"táhnout","lancer":"házet","attraper":"chytat","tenir":"držet","soulever":"zvedat","plier":"ohýbat","frapper":"udeřit","glisser":"klouzat","grimper":"šplhat",
"rayon":"oddělení","vitrine":"výloha","marque":"značka","qualité":"kvalita","choix":"výběr","rembourser":"vracet peníze","échanger":"vyměňovat","promotion":"akce","comparer":"srovnávat","choisir":"vybírat",
"université":"univerzita","étudiant":"student","cours":"přednáška","diplôme":"diplom","échouer":"neuspět","étudier":"studovat","j'étudie à l'université":"studuji na univerzitě","matière":"předmět","mathématiques":"matematika","sciences":"věda","géographie":"zeměpis","connaissance":"znalost",
"seconde":"sekunda","instant":"okamžik","siècle":"století","époque":"epocha","midi":"poledne","minuit":"půlnoc","date":"datum","calendrier":"kalendář","horaire":"rozvrh","durée":"trvání","pendant":"během","depuis":"od té doby"
},
zh:{
"nerveux":"紧张的","déçu":"失望的","jaloux":"嫉妒的","stressé":"压力大的","détendu":"放松的","ému":"感动的","satisfait":"满意的","reconnaissant":"感激的",
"brouillard":"雾","éclair":"闪电","tonnerre":"雷","arc-en-ciel":"彩虹","tempête":"暴风雨","quel temps fait-il":"天气 怎么样","gel":"霜冻","degré":"度","prévisions":"天气预报","humide":"潮湿的","sécheresse":"干旱",
"bouillir":"煮","frire":"炸","griller":"烤","mélanger":"搅拌","couper":"切","verser":"倒","casserole":"锅","poêle":"平底锅","plateau":"托盘","nappe":"桌布","micro-ondes":"微波炉",
"appartement":"公寓","immeuble":"大楼","rez-de-chaussée":"一楼","balcon":"阳台","terrasse":"露台","cheminée":"壁炉","meuble":"家具","canapé":"沙发","armoire":"衣柜","tiroir":"抽屉","rideau":"窗帘","tapis":"地毯","déménager":"搬家","nous déménageons demain":"我们 明天 搬家",
"pousser":"推","tirer":"拉","lancer":"扔","attraper":"抓住","tenir":"握住","soulever":"举起","plier":"弯曲","frapper":"打","glisser":"滑","grimper":"爬",
"rayon":"货架","vitrine":"橱窗","marque":"品牌","qualité":"质量","choix":"选择","rembourser":"退款","échanger":"交换","promotion":"促销","comparer":"比较","choisir":"选",
"université":"大学","étudiant":"大学生","cours":"课程","diplôme":"文凭","échouer":"不及格","étudier":"念书","j'étudie à l'université":"我 在 大学 念书","matière":"科目","mathématiques":"数学","sciences":"科学","géographie":"地理","connaissance":"知识",
"seconde":"秒","instant":"瞬间","siècle":"世纪","époque":"时代","midi":"中午","minuit":"午夜","date":"日期","calendrier":"日历","horaire":"时刻表","durée":"时长","pendant":"期间","depuis":"自从"
},
ja:{
"nerveux":"緊張した","déçu":"がっかりした","jaloux":"嫉妬深い","stressé":"ストレスを感じた","détendu":"リラックスした","ému":"感動した","satisfait":"満足した","reconnaissant":"感謝している",
"brouillard":"霧","éclair":"稲妻","tonnerre":"雷","arc-en-ciel":"虹","tempête":"嵐","quel temps fait-il":"天気 は どう です か","gel":"霜","degré":"度","prévisions":"天気予報","humide":"湿った","sécheresse":"干ばつ",
"bouillir":"茹でます","frire":"揚げます","griller":"焼きます","mélanger":"混ぜます","couper":"切ります","verser":"注ぎます","casserole":"鍋","poêle":"フライパン","plateau":"トレイ","nappe":"テーブルクロス","micro-ondes":"電子レンジ",
"appartement":"アパート","immeuble":"ビル","rez-de-chaussée":"一階","balcon":"バルコニー","terrasse":"テラス","cheminée":"暖炉","meuble":"家具","canapé":"ソファ","armoire":"タンス","tiroir":"引き出し","rideau":"カーテン","tapis":"カーペット","déménager":"引っ越します","nous déménageons demain":"私たち は 明日 引っ越します",
"pousser":"押します","tirer":"引きます","lancer":"投げます","attraper":"捕まえます","tenir":"持ちます","soulever":"持ち上げます","plier":"曲げます","frapper":"叩きます","glisser":"滑ります","grimper":"登ります",
"rayon":"売り場","vitrine":"ショーウィンドウ","marque":"ブランド","qualité":"品質","choix":"選択","rembourser":"返金します","échanger":"交換します","promotion":"特売","comparer":"比べます","choisir":"選びます",
"université":"大学","étudiant":"学生","cours":"講義","diplôme":"卒業証書","échouer":"失敗します","étudier":"勉強します","j'étudie à l'université":"私 は 大学 で 勉強します","matière":"科目","mathématiques":"数学","sciences":"科学","géographie":"地理","connaissance":"知識",
"seconde":"秒","instant":"瞬間","siècle":"世紀","époque":"時代","midi":"正午","minuit":"真夜中","date":"日付","calendrier":"カレンダー","horaire":"時刻表","durée":"期間","pendant":"〜の間","depuis":"から"
},
ko:{
"nerveux":"긴장한","déçu":"실망한","jaloux":"질투하는","stressé":"스트레스받은","détendu":"느긋한","ému":"감동한","satisfait":"만족한","reconnaissant":"고마워하는",
"brouillard":"안개","éclair":"번개","tonnerre":"천둥","arc-en-ciel":"무지개","tempête":"폭풍","quel temps fait-il":"날씨가 어때요","gel":"서리","degré":"도","prévisions":"일기예보","humide":"습한","sécheresse":"가뭄",
"bouillir":"끓이다","frire":"튀기다","griller":"굽다","mélanger":"섞다","couper":"자르다","verser":"붓다","casserole":"냄비","poêle":"프라이팬","plateau":"쟁반","nappe":"식탁보","micro-ondes":"전자레인지",
"appartement":"아파트","immeuble":"건물","rez-de-chaussée":"1층","balcon":"발코니","terrasse":"테라스","cheminée":"벽난로","meuble":"가구","canapé":"소파","armoire":"옷장","tiroir":"서랍","rideau":"커튼","tapis":"카펫","déménager":"이사하다","nous déménageons demain":"우리는 내일 이사해요",
"pousser":"밀다","tirer":"당기다","lancer":"던지다","attraper":"잡다","tenir":"쥐다","soulever":"들어 올리다","plier":"구부리다","frapper":"치다","glisser":"미끄러지다","grimper":"오르다",
"rayon":"코너","vitrine":"쇼윈도","marque":"브랜드","qualité":"품질","choix":"선택","rembourser":"환불하다","échanger":"교환하다","promotion":"프로모션","comparer":"비교하다","choisir":"고르다",
"université":"대학교","étudiant":"대학생","cours":"강의","diplôme":"졸업장","échouer":"실패하다","étudier":"공부하다","j'étudie à l'université":"저는 대학교에서 공부해요","matière":"과목","mathématiques":"수학","sciences":"과학","géographie":"지리","connaissance":"지식",
"seconde":"초","instant":"순간","siècle":"세기","époque":"시대","midi":"정오","minuit":"자정","date":"날짜","calendrier":"달력","horaire":"시간표","durée":"기간","pendant":"동안","depuis":"부터"
},
ar:{
"nerveux":"متوتر","déçu":"خائب الأمل","jaloux":"غيور","stressé":"مضغوط","détendu":"مسترخٍ","ému":"متأثر","satisfait":"راضٍ","reconnaissant":"ممتن",
"brouillard":"ضباب","éclair":"برق","tonnerre":"رعد","arc-en-ciel":"قوس قزح","tempête":"عاصفة شديدة","quel temps fait-il":"كيف الطقس","gel":"صقيع","degré":"درجة","prévisions":"توقعات الطقس","humide":"رطب","sécheresse":"جفاف",
"bouillir":"يغلي","frire":"يقلي","griller":"يشوي","mélanger":"يخلط","couper":"يقطع","verser":"يسكب","casserole":"قدر","poêle":"مقلاة","plateau":"صينية","nappe":"مفرش طاولة","micro-ondes":"ميكروويف",
"appartement":"شقة","immeuble":"مبنى سكني","rez-de-chaussée":"الطابق الأرضي","balcon":"شرفة","terrasse":"تراس","cheminée":"مدفأة","meuble":"أثاث","canapé":"أريكة","armoire":"خزانة","tiroir":"دُرج","rideau":"ستارة","tapis":"سجادة","déménager":"ينتقل","nous déménageons demain":"سننتقل غدًا",
"pousser":"يدفع","tirer":"يسحب","lancer":"يرمي","attraper":"يلتقط","tenir":"يمسك","soulever":"يرفع","plier":"يثني","frapper":"يضرب","glisser":"ينزلق","grimper":"يتسلق",
"rayon":"قسم","vitrine":"واجهة المتجر","marque":"علامة تجارية","qualité":"جودة","choix":"اختيار","rembourser":"يرد المال","échanger":"يستبدل","promotion":"عرض","comparer":"يقارن","choisir":"يختار",
"université":"جامعة","étudiant":"طالب","cours":"محاضرة","diplôme":"شهادة","échouer":"يفشل","étudier":"يدرس","j'étudie à l'université":"أدرس في الجامعة","matière":"مادة","mathématiques":"رياضيات","sciences":"علوم","géographie":"جغرافيا","connaissance":"معرفة",
"seconde":"ثانية","instant":"لحظة","siècle":"قرن","époque":"عصر","midi":"الظهيرة","minuit":"منتصف الليل","date":"تاريخ","calendrier":"تقويم","horaire":"جدول","durée":"مدة","pendant":"خلال","depuis":"منذ"
}
};
LANGS2.forEach(function(l){ var j2=LEX2J[l]||{}; Object.keys(j2).forEach(function(k){ LEX2[l][k]=j2[k]; }); });
/* ── Vague 11 nouvelles langues (v2.80) : unités 81-88 — s'entraider, l'actualité,
   exprimer son avis, autour du monde, chez le docteur, la carrière, pleine nature,
   les caractères. Anti-collisions vérifiées : pl aimable=uprzejmy (miły=gentil),
   avis=opinia (zdanie=phrase) ; ru ordonnance=рецепт врача (рецепт=recette),
   défendre=заступаться (защищать=protéger) ; uk ordonnance=рецепт лікаря,
   rocher=скеля (камінь=pierre), défendre=боронити (захищати=protéger) ;
   cs ordonnance=lékařský předpis (recept=recette), aimable=laskavý (milý=gentil) ;
   zh aide=帮忙 (帮助=aider), accueillir=迎接 (欢迎=bienvenue), réussite=成就
   (成功=réussir), défendre=保卫 (保护=protéger) ; ja sage=賢明な (賢い=intelligent),
   aimable=愛想がいい (優しい=gentil), défendre=かばいます (守ります=protéger) ;
   ko exemple=예시, ruisseau=개울, défendre=지키다 (보호하다=protéger) ;
   ar ordonnance=وصفة طبية (وصفة=recette), aimable=ودود (لطيف=gentil),
   ruisseau=غدير (جدول=horaire), défendre=يدافع عن (يحمي=protéger). */
var LEX2K = {
pl:{
"conseil":"rada","aide":"pomoc","service":"przysługa","soutien":"wsparcie","confiance":"zaufanie","respect":"szacunek","je te fais confiance":"ufam ci","amitié":"przyjaźń","partager":"dzielić się","offrir":"podarować","accueillir":"witać","défendre":"bronić","visiter":"odwiedzać",
"journaliste":"dziennikarz","article":"artykuł","radio":"radio","télévision":"telewizja","chaîne":"kanał","publicité":"reklama","gouvernement":"rząd","loi":"ustawa","élection":"wybory","président":"prezydent","police":"policja","sécurité":"bezpieczeństwo","liberté":"wolność",
"avis":"opinia","préférer":"woleć","décider":"decydować","changer":"zmieniać","douter":"wątpić","se tromper":"mylić się","à mon avis, c'est vrai":"moim zdaniem to prawda","convaincre":"przekonywać","exemple":"przykład","discussion":"dyskusja","promesse":"obietnica","mensonge":"kłamstwo","secret":"tajemnica",
"à l'étranger":"za granicą","culture":"kultura","tradition":"tradycja","religion":"religia","touriste":"turysta","guide":"przewodnik","monument":"zabytek","château":"zamek","tour":"wieża","désert":"pustynia","aventure":"przygoda","carte postale":"pocztówka",
"ordonnance":"recepta","vaccin":"szczepionka","pansement":"plaster","opération":"operacja","piqûre":"zastrzyk","salle d'attente":"poczekalnia","j'ai besoin d'un médecin":"potrzebuję lekarza","éternuer":"kichać","saigner":"krwawić","vertige":"zawroty głowy","cicatrice":"blizna","plâtre":"gips","béquilles":"kule",
"embaucher":"zatrudniać","candidature":"kandydatura","expérience":"doświadczenie","compétence":"umiejętność","formation":"szkolenie","stage":"staż","je cherche du travail":"szukam pracy","démissionner":"rezygnować","licencier":"zwalniać","retraite":"emerytura","chômage":"bezrobocie","augmentation":"podwyżka","réussite":"sukces",
"vallée":"dolina","falaise":"klif","cascade":"wodospad","rocher":"skała","sommet":"szczyt","ruisseau":"strumień","grotte":"jaskinia","boue":"błoto","sentier":"ścieżka","insecte":"owad","grenouille":"żaba","branche":"gałąź","écorce":"kora","mousse":"mech",
"généreux":"hojny","sage":"mądry","modeste":"skromny","sensible":"wrażliwy","aimable":"życzliwy","égoïste":"samolubny","têtu":"uparty","bavard":"gadatliwy","maladroit":"niezdarny","franc":"szczery"
},
ru:{
"conseil":"совет","aide":"помощь","service":"услуга","soutien":"поддержка","confiance":"доверие","respect":"уважение","je te fais confiance":"я тебе доверяю","amitié":"дружба","partager":"делиться","offrir":"дарить","accueillir":"встречать","défendre":"заступаться","visiter":"навещать",
"journaliste":"журналист","article":"статья","radio":"радио","télévision":"телевидение","chaîne":"канал","publicité":"реклама","gouvernement":"правительство","loi":"закон","élection":"выборы","président":"президент","police":"полиция","sécurité":"безопасность","liberté":"свобода",
"avis":"мнение","préférer":"предпочитать","décider":"решать","changer":"менять","douter":"сомневаться","se tromper":"ошибаться","à mon avis, c'est vrai":"по-моему, это правда","convaincre":"убеждать","exemple":"пример","discussion":"обсуждение","promesse":"обещание","mensonge":"ложь","secret":"секрет",
"à l'étranger":"за границей","culture":"культура","tradition":"традиция","religion":"религия","touriste":"турист","guide":"гид","monument":"памятник","château":"замок","tour":"башня","désert":"пустыня","aventure":"приключение","carte postale":"открытка",
"ordonnance":"рецепт врача","vaccin":"вакцина","pansement":"пластырь","opération":"операция","piqûre":"укол","salle d'attente":"зал ожидания","j'ai besoin d'un médecin":"мне нужен врач","éternuer":"чихать","saigner":"кровоточить","vertige":"головокружение","cicatrice":"шрам","plâtre":"гипс","béquilles":"костыли",
"embaucher":"нанимать","candidature":"кандидатура","expérience":"опыт","compétence":"навык","formation":"обучение","stage":"стажировка","je cherche du travail":"я ищу работу","démissionner":"увольняться","licencier":"увольнять","retraite":"пенсия","chômage":"безработица","augmentation":"прибавка","réussite":"успех",
"vallée":"долина","falaise":"утёс","cascade":"водопад","rocher":"скала","sommet":"вершина","ruisseau":"ручей","grotte":"пещера","boue":"грязь","sentier":"тропа","insecte":"насекомое","grenouille":"лягушка","branche":"ветка","écorce":"кора","mousse":"мох",
"généreux":"щедрый","sage":"мудрый","modeste":"скромный","sensible":"чувствительный","aimable":"любезный","égoïste":"эгоистичный","têtu":"упрямый","bavard":"болтливый","maladroit":"неуклюжий","franc":"откровенный"
},
uk:{
"conseil":"порада","aide":"допомога","service":"послуга","soutien":"підтримка","confiance":"довіра","respect":"повага","je te fais confiance":"я тобі довіряю","amitié":"дружба","partager":"ділитися","offrir":"дарувати","accueillir":"зустрічати","défendre":"боронити","visiter":"відвідувати",
"journaliste":"журналіст","article":"стаття","radio":"радіо","télévision":"телебачення","chaîne":"канал","publicité":"реклама","gouvernement":"уряд","loi":"закон","élection":"вибори","président":"президент","police":"поліція","sécurité":"безпека","liberté":"свобода",
"avis":"думка","préférer":"віддавати перевагу","décider":"вирішувати","changer":"змінювати","douter":"сумніватися","se tromper":"помилятися","à mon avis, c'est vrai":"на мою думку, це правда","convaincre":"переконувати","exemple":"приклад","discussion":"обговорення","promesse":"обіцянка","mensonge":"брехня","secret":"секрет",
"à l'étranger":"за кордоном","culture":"культура","tradition":"традиція","religion":"релігія","touriste":"турист","guide":"гід","monument":"пам'ятка","château":"замок","tour":"вежа","désert":"пустеля","aventure":"пригода","carte postale":"листівка",
"ordonnance":"рецепт лікаря","vaccin":"вакцина","pansement":"пластир","opération":"операція","piqûre":"укол","salle d'attente":"зала очікування","j'ai besoin d'un médecin":"мені потрібен лікар","éternuer":"чхати","saigner":"кровоточити","vertige":"запаморочення","cicatrice":"шрам","plâtre":"гіпс","béquilles":"милиці",
"embaucher":"наймати","candidature":"кандидатура","expérience":"досвід","compétence":"навичка","formation":"навчання","stage":"стажування","je cherche du travail":"я шукаю роботу","démissionner":"звільнятися","licencier":"звільняти","retraite":"пенсія","chômage":"безробіття","augmentation":"надбавка","réussite":"успіх",
"vallée":"долина","falaise":"урвище","cascade":"водоспад","rocher":"скеля","sommet":"вершина","ruisseau":"струмок","grotte":"печера","boue":"багнюка","sentier":"стежка","insecte":"комаха","grenouille":"жаба","branche":"гілка","écorce":"кора","mousse":"мох",
"généreux":"щедрий","sage":"мудрий","modeste":"скромний","sensible":"чутливий","aimable":"люб'язний","égoïste":"егоїстичний","têtu":"впертий","bavard":"балакучий","maladroit":"незграбний","franc":"відвертий"
},
cs:{
"conseil":"rada","aide":"pomoc","service":"služba","soutien":"podpora","confiance":"důvěra","respect":"respekt","je te fais confiance":"věřím ti","amitié":"přátelství","partager":"sdílet","offrir":"darovat","accueillir":"vítat","défendre":"bránit","visiter":"navštěvovat",
"journaliste":"novinář","article":"článek","radio":"rádio","télévision":"televize","chaîne":"kanál","publicité":"reklama","gouvernement":"vláda","loi":"zákon","élection":"volby","président":"prezident","police":"policie","sécurité":"bezpečnost","liberté":"svoboda",
"avis":"názor","préférer":"preferovat","décider":"rozhodovat","changer":"měnit","douter":"pochybovat","se tromper":"mýlit se","à mon avis, c'est vrai":"podle mě je to pravda","convaincre":"přesvědčovat","exemple":"příklad","discussion":"diskuse","promesse":"slib","mensonge":"lež","secret":"tajemství",
"à l'étranger":"v zahraničí","culture":"kultura","tradition":"tradice","religion":"náboženství","touriste":"turista","guide":"průvodce","monument":"památka","château":"hrad","tour":"věž","désert":"poušť","aventure":"dobrodružství","carte postale":"pohlednice",
"ordonnance":"lékařský předpis","vaccin":"vakcína","pansement":"náplast","opération":"operace","piqûre":"injekce","salle d'attente":"čekárna","j'ai besoin d'un médecin":"potřebuji lékaře","éternuer":"kýchat","saigner":"krvácet","vertige":"závrať","cicatrice":"jizva","plâtre":"sádra","béquilles":"berle",
"embaucher":"zaměstnávat","candidature":"kandidatura","expérience":"zkušenost","compétence":"dovednost","formation":"školení","stage":"stáž","je cherche du travail":"hledám práci","démissionner":"rezignovat","licencier":"propouštět","retraite":"důchod","chômage":"nezaměstnanost","augmentation":"zvýšení platu","réussite":"úspěch",
"vallée":"údolí","falaise":"útes","cascade":"vodopád","rocher":"skála","sommet":"vrchol","ruisseau":"potok","grotte":"jeskyně","boue":"bláto","sentier":"stezka","insecte":"hmyz","grenouille":"žába","branche":"větev","écorce":"kůra","mousse":"mech",
"généreux":"štědrý","sage":"moudrý","modeste":"skromný","sensible":"citlivý","aimable":"laskavý","égoïste":"sobecký","têtu":"tvrdohlavý","bavard":"upovídaný","maladroit":"nešikovný","franc":"upřímný"
},
zh:{
"conseil":"建议","aide":"帮忙","service":"服务","soutien":"支持","confiance":"信任","respect":"尊重","je te fais confiance":"我 相信 你","amitié":"友谊","partager":"分享","offrir":"赠送","accueillir":"迎接","défendre":"保卫","visiter":"拜访",
"journaliste":"记者","article":"文章","radio":"收音机","télévision":"电视机","chaîne":"频道","publicité":"广告","gouvernement":"政府","loi":"法律","élection":"选举","président":"总统","police":"警方","sécurité":"治安","liberté":"自由",
"avis":"意见","préférer":"更喜欢","décider":"决定","changer":"改变","douter":"怀疑","se tromper":"弄错","à mon avis, c'est vrai":"在 我 看来 这 是 真的","convaincre":"说服","exemple":"例子","discussion":"讨论","promesse":"诺言","mensonge":"谎言","secret":"秘密",
"à l'étranger":"在国外","culture":"文化","tradition":"传统","religion":"宗教","touriste":"游客","guide":"导游","monument":"纪念碑","château":"城堡","tour":"塔","désert":"沙漠","aventure":"冒险","carte postale":"明信片",
"ordonnance":"处方","vaccin":"疫苗","pansement":"创可贴","opération":"手术","piqûre":"打针","salle d'attente":"候诊室","j'ai besoin d'un médecin":"我 需要 医生","éternuer":"打喷嚏","saigner":"流血","vertige":"头晕","cicatrice":"疤痕","plâtre":"石膏","béquilles":"拐杖",
"embaucher":"雇用","candidature":"求职申请","expérience":"经验","compétence":"技能","formation":"培训","stage":"实习","je cherche du travail":"我 在 找 工作","démissionner":"辞职","licencier":"解雇","retraite":"退休","chômage":"失业","augmentation":"加薪","réussite":"成就",
"vallée":"山谷","falaise":"悬崖","cascade":"瀑布","rocher":"岩石","sommet":"山顶","ruisseau":"小溪","grotte":"洞穴","boue":"泥","sentier":"小路","insecte":"昆虫","grenouille":"青蛙","branche":"树枝","écorce":"树皮","mousse":"苔藓",
"généreux":"慷慨的","sage":"明智的","modeste":"谦虚的","sensible":"敏感的","aimable":"和蔼的","égoïste":"自私的","têtu":"固执的","bavard":"话多的","maladroit":"笨拙的","franc":"坦率的"
},
ja:{
"conseil":"アドバイス","aide":"助け","service":"サービス","soutien":"支え","confiance":"信頼","respect":"尊敬","je te fais confiance":"あなた を 信じます","amitié":"友情","partager":"分けます","offrir":"贈ります","accueillir":"迎えます","défendre":"かばいます","visiter":"訪ねます",
"journaliste":"記者","article":"記事","radio":"ラジオ","télévision":"テレビ","chaîne":"チャンネル","publicité":"広告","gouvernement":"政府","loi":"法律","élection":"選挙","président":"大統領","police":"警方","sécurité":"治安","liberté":"自由",
"avis":"意見","préférer":"好みます","décider":"決めます","changer":"変えます","douter":"疑います","se tromper":"間違えます","à mon avis, c'est vrai":"私 の 意見 では それ は 本当 です","convaincre":"説得します","exemple":"例","discussion":"議論","promesse":"約束","mensonge":"嘘","secret":"秘密",
"à l'étranger":"海外で","culture":"文化","tradition":"伝統","religion":"宗教","touriste":"観光客","guide":"ガイド","monument":"記念碑","château":"城","tour":"塔","désert":"砂漠","aventure":"冒険","carte postale":"はがき",
"ordonnance":"処方箋","vaccin":"ワクチン","pansement":"絆創膏","opération":"手術","piqûre":"注射","salle d'attente":"待合室","j'ai besoin d'un médecin":"医者 が 必要 です","éternuer":"くしゃみをします","saigner":"血が出ます","vertige":"めまい","cicatrice":"傷跡","plâtre":"ギプス","béquilles":"松葉杖",
"embaucher":"雇います","candidature":"応募","expérience":"経験","compétence":"スキル","formation":"研修","stage":"インターンシップ","je cherche du travail":"仕事 を 探しています","démissionner":"辞めます","licencier":"解雇します","retraite":"退職","chômage":"失業","augmentation":"昇給","réussite":"成功",
"vallée":"谷","falaise":"崖","cascade":"滝","rocher":"岩","sommet":"頂上","ruisseau":"小川","grotte":"洞窟","boue":"泥","sentier":"小道","insecte":"昆虫","grenouille":"カエル","branche":"枝","écorce":"樹皮","mousse":"苔",
"généreux":"気前がいい","sage":"賢明な","modeste":"謙虚な","sensible":"敏感な","aimable":"愛想がいい","égoïste":"わがままな","têtu":"頑固な","bavard":"おしゃべりな","maladroit":"不器用な","franc":"率直な"
},
ko:{
"conseil":"조언","aide":"도움","service":"서비스","soutien":"지원","confiance":"신뢰","respect":"존중","je te fais confiance":"너를 믿어요","amitié":"우정","partager":"나누다","offrir":"선물하다","accueillir":"맞이하다","défendre":"지키다","visiter":"방문하다",
"journaliste":"기자","article":"기사","radio":"라디오","télévision":"텔레비전","chaîne":"채널","publicité":"광고","gouvernement":"정부","loi":"법","élection":"선거","président":"대통령","police":"경찰","sécurité":"안전","liberté":"자유",
"avis":"의견","préférer":"선호하다","décider":"결정하다","changer":"바꾸다","douter":"의심하다","se tromper":"실수하다","à mon avis, c'est vrai":"제 생각에는 그게 사실이에요","convaincre":"설득하다","exemple":"예시","discussion":"토론","promesse":"약속","mensonge":"거짓말","secret":"비밀",
"à l'étranger":"해외에서","culture":"문화","tradition":"전통","religion":"종교","touriste":"관광객","guide":"가이드","monument":"기념물","château":"성","tour":"탑","désert":"사막","aventure":"모험","carte postale":"엽서",
"ordonnance":"처방전","vaccin":"백신","pansement":"반창고","opération":"수술","piqûre":"주사","salle d'attente":"대기실","j'ai besoin d'un médecin":"의사가 필요해요","éternuer":"재채기하다","saigner":"피가 나다","vertige":"어지러움","cicatrice":"흉터","plâtre":"깁스","béquilles":"목발",
"embaucher":"고용하다","candidature":"지원서","expérience":"경험","compétence":"기술","formation":"연수","stage":"인턴십","je cherche du travail":"일자리를 찾고 있어요","démissionner":"사직하다","licencier":"해고하다","retraite":"은퇴","chômage":"실업","augmentation":"임금 인상","réussite":"성공",
"vallée":"계곡","falaise":"절벽","cascade":"폭포","rocher":"바위","sommet":"정상","ruisseau":"개울","grotte":"동굴","boue":"진흙","sentier":"오솔길","insecte":"곤충","grenouille":"개구리","branche":"나뭇가지","écorce":"나무껍질","mousse":"이끼",
"généreux":"너그러운","sage":"현명한","modeste":"겸손한","sensible":"섬세한","aimable":"상냥한","égoïste":"이기적인","têtu":"고집이 센","bavard":"수다스러운","maladroit":"서투른","franc":"솔직한"
},
ar:{
"conseil":"نصيحة","aide":"مساعدة","service":"خدمة","soutien":"دعم","confiance":"ثقة","respect":"احترام","je te fais confiance":"أثق بك","amitié":"صداقة","partager":"يشارك","offrir":"يهدي","accueillir":"يرحب بـ","défendre":"يدافع عن","visiter":"يزور",
"journaliste":"صحفي","article":"مقال","radio":"راديو","télévision":"تلفزيون","chaîne":"قناة","publicité":"إعلان","gouvernement":"حكومة","loi":"قانون","élection":"انتخابات","président":"رئيس","police":"شرطة","sécurité":"أمان","liberté":"حرية",
"avis":"رأي","préférer":"يفضل","décider":"يقرر","changer":"يغير","douter":"يشك","se tromper":"يخطئ","à mon avis, c'est vrai":"في رأيي هذا صحيح","convaincre":"يقنع","exemple":"مثال","discussion":"نقاش","promesse":"وعد","mensonge":"كذبة","secret":"سر",
"à l'étranger":"في الخارج","culture":"ثقافة","tradition":"تقليد","religion":"دين","touriste":"سائح","guide":"مرشد","monument":"نصب تذكاري","château":"قلعة","tour":"برج","désert":"صحراء","aventure":"مغامرة","carte postale":"بطاقة بريدية",
"ordonnance":"وصفة طبية","vaccin":"لقاح","pansement":"ضمادة","opération":"عملية جراحية","piqûre":"حقنة","salle d'attente":"غرفة الانتظار","j'ai besoin d'un médecin":"أحتاج إلى طبيب","éternuer":"يعطس","saigner":"ينزف","vertige":"دوخة","cicatrice":"ندبة","plâtre":"جبيرة","béquilles":"عكازات",
"embaucher":"يوظف","candidature":"طلب توظيف","expérience":"خبرة","compétence":"مهارة","formation":"تدريب","stage":"تدريب عملي","je cherche du travail":"أبحث عن عمل","démissionner":"يستقيل","licencier":"يفصل","retraite":"تقاعد","chômage":"بطالة","augmentation":"علاوة","réussite":"نجاح",
"vallée":"وادٍ","falaise":"جرف","cascade":"شلال","rocher":"صخرة","sommet":"قمة","ruisseau":"غدير","grotte":"كهف","boue":"طين","sentier":"درب","insecte":"حشرة","grenouille":"ضفدع","branche":"غصن","écorce":"لحاء","mousse":"طحلب",
"généreux":"كريم","sage":"حكيم","modeste":"متواضع","sensible":"حساس","aimable":"دمث","égoïste":"أناني","têtu":"عنيد","bavard":"ثرثار","maladroit":"أخرق","franc":"صريح"
}
};
LANGS2.forEach(function(l){ var k2=LEX2K[l]||{}; Object.keys(k2).forEach(function(k){ LEX2[l][k]=k2[k]; }); });
/* ── Vague 12 nouvelles langues (v2.81) : unités 89-96 — le bricolage, les urgences,
   bien manger dehors, sortir le soir, mots de liaison, la pensée, question d'argent,
   les matières. Anti-collisions vérifiées : ru échelle=стремянка (лестница=escalier),
   bois=древесина (дерево=arbre), se souvenir=вспоминать ; zh réservation=订位
   (预订=réserver), plutôt=宁愿 (比较=comparer) ; ja réservation=席の予約
   (予約=rendez-vous), entracte=休憩 ; ko environ=대략 (약=médicament), bois=목재
   (나무=arbre) ; ar cependant=ومع ذلك (لكن=mais), scène=خشبة المسرح (مسرح=théâtre),
   réfléchir=يتأمل (يفكر=penser), dette=ديون (دين=religion), spectacle=عرض مسرحي
   (عرض=promotion). Emprunter/prêter distingués partout (ja 借ります/貸します,
   ko 빌리다/빌려주다, zh 借/借给, ar يقترض/يقرض, cs půjčovat si/půjčovat,
   pl pożyczać/pożyczać komuś, uk позичати/давати в борг, ru брать в долг/одалживать).
   Homographes réels assumés : zh 危险 (dangereux ET danger, même mot) ; peau ET cuir (polysémie classique sans autre mot) :
   pl skóra, ru кожа, uk шкіра, cs kůže, ar جلد. */
var LEX2L = {
pl:{
"marteau":"młotek","clou":"gwóźdź","vis":"śruba","tournevis":"śrubokręt","outil":"narzędzie","pelle":"łopata","réparer":"naprawiać","percer":"wiercić","coller":"kleić","mesurer":"mierzyć","échelle":"drabina","pinceau":"pędzel","scie":"piła","tuyau":"rura","corde":"lina","fil":"drut",
"incendie":"pożar","ambulance":"karetka","secours":"ratunek","danger":"niebezpieczeństwo","alarme":"alarm","il y a le feu":"pali się","voleur":"złodziej","témoin":"świadek","prudent":"ostrożny","avertir":"ostrzegać","fuite":"wyciek",
"réservation":"rezerwacja","pourboire":"napiwek","commander":"zamawiać","végétarien":"wegetarianin","saignant":"krwisty","bien cuit":"dobrze wysmażony","l'addition, s'il vous plaît":"rachunek proszę",
"concert":"koncert","spectacle":"przedstawienie","chanteur":"piosenkarz","acteur":"aktor","scène":"scena","applaudir":"klaskać","le spectacle commence à huit heures":"przedstawienie zaczyna się o ósmej","exposition":"wystawa","ambiance":"atmosfera","cirque":"cyrk","affiche":"plakat","entracte":"antrakt",
"cependant":"jednak","pourtant":"mimo to","malgré":"mimo","sauf":"oprócz","environ":"około","plutôt":"raczej","sans doute":"zapewne","d'ailleurs":"zresztą","en fait":"właściwie","au lieu de":"zamiast","grâce à":"dzięki","à cause de":"z powodu",
"se souvenir":"pamiętać","mémoire":"pamięć","reconnaître":"rozpoznawać","regretter":"żałować","deviner":"zgadywać","je me souviens de toi":"pamiętam cię","imaginer":"wyobrażać sobie","réfléchir":"zastanawiać się","supposer":"przypuszczać","hésiter":"wahać się","prévoir":"przewidywać",
"emprunter":"pożyczać","prêter":"pożyczać komuś","dette":"dług","récompense":"nagroda","ça vaut la peine":"warto",
"métal":"metal","plastique":"plastik","bois":"drewno","or":"złoto","carton":"karton","coton":"bawełna","laine":"wełna","cuir":"skóra","soie":"jedwab","tissu":"tkanina"
},
ru:{
"marteau":"молоток","clou":"гвоздь","vis":"винт","tournevis":"отвёртка","outil":"инструмент","pelle":"лопата","réparer":"чинить","percer":"сверлить","coller":"клеить","mesurer":"измерять","échelle":"стремянка","pinceau":"кисть","scie":"пила","tuyau":"труба","corde":"верёвка","fil":"провод",
"incendie":"пожар","ambulance":"скорая помощь","secours":"спасение","danger":"опасность","alarme":"сигнализация","il y a le feu":"тут пожар","voleur":"вор","témoin":"свидетель","prudent":"осторожный","avertir":"предупреждать","fuite":"утечка",
"réservation":"бронирование","pourboire":"чаевые","commander":"заказывать","végétarien":"вегетарианец","saignant":"с кровью","bien cuit":"хорошо прожаренный","l'addition, s'il vous plaît":"счёт, пожалуйста",
"concert":"концерт","spectacle":"спектакль","chanteur":"певец","acteur":"актёр","scène":"сцена","applaudir":"аплодировать","le spectacle commence à huit heures":"спектакль начинается в восемь","exposition":"выставка","ambiance":"атмосфера","cirque":"цирк","affiche":"афиша","entracte":"антракт",
"cependant":"однако","pourtant":"всё-таки","malgré":"несмотря на","sauf":"кроме","environ":"примерно","plutôt":"скорее","sans doute":"наверное","d'ailleurs":"кстати","en fait":"на самом деле","au lieu de":"вместо","grâce à":"благодаря","à cause de":"из-за",
"se souvenir":"вспоминать","mémoire":"память","reconnaître":"узнавать","regretter":"жалеть","deviner":"угадывать","je me souviens de toi":"я помню тебя","imaginer":"представлять","réfléchir":"размышлять","supposer":"предполагать","hésiter":"колебаться","prévoir":"предвидеть",
"emprunter":"брать в долг","prêter":"одалживать","dette":"долг","récompense":"награда","ça vaut la peine":"это того стоит",
"métal":"металл","plastique":"пластик","bois":"древесина","or":"золото","carton":"картон","coton":"хлопок","laine":"шерсть","cuir":"кожа","soie":"шёлк","tissu":"ткань"
},
uk:{
"marteau":"молоток","clou":"цвях","vis":"гвинт","tournevis":"викрутка","outil":"інструмент","pelle":"лопата","réparer":"ремонтувати","percer":"свердлити","coller":"клеїти","mesurer":"вимірювати","échelle":"драбина","pinceau":"пензель","scie":"пилка","tuyau":"труба","corde":"мотузка","fil":"дріт",
"incendie":"пожежа","ambulance":"швидка допомога","secours":"порятунок","danger":"небезпека","alarme":"сигналізація","il y a le feu":"тут пожежа","voleur":"злодій","témoin":"свідок","prudent":"обережний","avertir":"попереджати","fuite":"витік",
"réservation":"бронювання","pourboire":"чайові","commander":"замовляти","végétarien":"вегетаріанець","saignant":"з кров'ю","bien cuit":"добре просмажений","l'addition, s'il vous plaît":"рахунок, будь ласка",
"concert":"концерт","spectacle":"вистава","chanteur":"співак","acteur":"актор","scène":"сцена","applaudir":"аплодувати","le spectacle commence à huit heures":"вистава починається о восьмій","exposition":"виставка","ambiance":"атмосфера","cirque":"цирк","affiche":"афіша","entracte":"антракт",
"cependant":"однак","pourtant":"все ж таки","malgré":"попри","sauf":"крім","environ":"приблизно","plutôt":"радше","sans doute":"мабуть","d'ailleurs":"до речі","en fait":"насправді","au lieu de":"замість","grâce à":"завдяки","à cause de":"через",
"se souvenir":"згадувати","mémoire":"пам'ять","reconnaître":"впізнавати","regretter":"шкодувати","deviner":"вгадувати","je me souviens de toi":"я пам'ятаю тебе","imaginer":"уявляти","réfléchir":"розмірковувати","supposer":"припускати","hésiter":"вагатися","prévoir":"передбачати",
"emprunter":"позичати","prêter":"давати в борг","dette":"борг","récompense":"нагорода","ça vaut la peine":"це того варте",
"métal":"метал","plastique":"пластик","bois":"деревина","or":"золото","carton":"картон","coton":"бавовна","laine":"вовна","cuir":"шкіра","soie":"шовк","tissu":"тканина"
},
cs:{
"marteau":"kladivo","clou":"hřebík","vis":"šroub","tournevis":"šroubovák","outil":"nástroj","pelle":"lopata","réparer":"opravovat","percer":"vrtat","coller":"lepit","mesurer":"měřit","échelle":"žebřík","pinceau":"štětec","scie":"pila","tuyau":"trubka","corde":"lano","fil":"drát",
"incendie":"požár","ambulance":"sanitka","secours":"záchrana","danger":"nebezpečí","alarme":"alarm","il y a le feu":"hoří","voleur":"zloděj","témoin":"svědek","prudent":"opatrný","avertir":"varovat","fuite":"únik",
"réservation":"rezervace","pourboire":"spropitné","commander":"objednávat","végétarien":"vegetarián","saignant":"krvavý","bien cuit":"dobře propečený","l'addition, s'il vous plaît":"účet prosím",
"concert":"koncert","spectacle":"představení","chanteur":"zpěvák","acteur":"herec","scène":"scéna","applaudir":"tleskat","le spectacle commence à huit heures":"představení začíná v osm","exposition":"výstava","ambiance":"atmosféra","cirque":"cirkus","affiche":"plakát","entracte":"přestávka",
"cependant":"však","pourtant":"přesto","malgré":"navzdory","sauf":"kromě","environ":"přibližně","plutôt":"spíše","sans doute":"nejspíš","d'ailleurs":"ostatně","en fait":"vlastně","au lieu de":"namísto","grâce à":"díky","à cause de":"kvůli",
"se souvenir":"pamatovat si","mémoire":"paměť","reconnaître":"rozpoznávat","regretter":"litovat","deviner":"hádat","je me souviens de toi":"pamatuji si tě","imaginer":"představovat si","réfléchir":"přemýšlet","supposer":"předpokládat","hésiter":"váhat","prévoir":"předvídat",
"emprunter":"půjčovat si","prêter":"půjčovat","dette":"dluh","récompense":"odměna","ça vaut la peine":"stojí to za to",
"métal":"kov","plastique":"plast","bois":"dřevo","or":"zlato","carton":"karton","coton":"bavlna","laine":"vlna","cuir":"kůže","soie":"hedvábí","tissu":"látka"
},
zh:{
"marteau":"锤子","clou":"钉子","vis":"螺丝","tournevis":"螺丝刀","outil":"工具","pelle":"铲子","réparer":"修理","percer":"钻孔","coller":"粘","mesurer":"测量","échelle":"梯子","pinceau":"刷子","scie":"锯子","tuyau":"管子","corde":"绳子","fil":"电线",
"incendie":"火灾","ambulance":"救护车","secours":"救援","danger":"危险","alarme":"警报","il y a le feu":"着火 了","voleur":"小偷","témoin":"目击者","prudent":"小心的","avertir":"警告","fuite":"泄漏",
"réservation":"订位","pourboire":"小费","commander":"点菜","végétarien":"素食者","saignant":"三分熟","bien cuit":"全熟","l'addition, s'il vous plaît":"请 结账",
"concert":"音乐会","spectacle":"演出","chanteur":"歌手","acteur":"演员","scène":"舞台","applaudir":"鼓掌","le spectacle commence à huit heures":"演出 八点 开始","exposition":"展览","ambiance":"气氛","cirque":"马戏团","affiche":"海报","entracte":"中场休息",
"cependant":"然而","pourtant":"不过","malgré":"尽管","sauf":"除了","environ":"大约","plutôt":"宁愿","sans doute":"大概","d'ailleurs":"况且","en fait":"其实","au lieu de":"而不是","grâce à":"多亏了","à cause de":"由于",
"se souvenir":"记得","mémoire":"记忆","reconnaître":"认出","regretter":"后悔","deviner":"猜","je me souviens de toi":"我 记得 你","imaginer":"想象","réfléchir":"思考","supposer":"假设","hésiter":"犹豫","prévoir":"预测",
"emprunter":"借","prêter":"借给","dette":"债务","récompense":"奖励","ça vaut la peine":"这 值得",
"métal":"金属","plastique":"塑料","bois":"木头","or":"黄金","carton":"纸板","coton":"棉花","laine":"羊毛","cuir":"皮革","soie":"丝绸","tissu":"布料"
},
ja:{
"marteau":"ハンマー","clou":"釘","vis":"ネジ","tournevis":"ドライバー","outil":"道具","pelle":"シャベル","réparer":"修理します","percer":"穴を開けます","coller":"貼ります","mesurer":"測ります","échelle":"はしご","pinceau":"刷毛","scie":"のこぎり","tuyau":"パイプ","corde":"ロープ","fil":"針金",
"incendie":"火事","ambulance":"救急車","secours":"救助","danger":"危険","alarme":"警報","il y a le feu":"火事 です","voleur":"泥棒","témoin":"目撃者","prudent":"慎重な","avertir":"警告します","fuite":"漏れ",
"réservation":"席の予約","pourboire":"チップ","commander":"注文します","végétarien":"ベジタリアン","saignant":"レア","bien cuit":"ウェルダン","l'addition, s'il vous plaît":"お会計 お願いします",
"concert":"コンサート","spectacle":"ショー","chanteur":"歌手","acteur":"俳優","scène":"舞台","applaudir":"拍手します","le spectacle commence à huit heures":"ショー は 八時 に 始まります","exposition":"展覧会","ambiance":"雰囲気","cirque":"サーカス","affiche":"ポスター","entracte":"休憩",
"cependant":"しかし","pourtant":"それでも","malgré":"〜にもかかわらず","sauf":"〜以外","environ":"約","plutôt":"むしろ","sans doute":"おそらく","d'ailleurs":"ちなみに","en fait":"実は","au lieu de":"〜の代わりに","grâce à":"〜のおかげで","à cause de":"〜のせいで",
"se souvenir":"覚えています","mémoire":"記憶","reconnaître":"見分けます","regretter":"後悔します","deviner":"当てます","je me souviens de toi":"あなた を 覚えています","imaginer":"想像します","réfléchir":"考えます","supposer":"推測します","hésiter":"ためらいます","prévoir":"予測します",
"emprunter":"借ります","prêter":"貸します","dette":"借金","récompense":"ご褒美","ça vaut la peine":"その 価値 が あります",
"métal":"金属","plastique":"プラスチック","bois":"木材","or":"金","carton":"段ボール","coton":"綿","laine":"ウール","cuir":"革","soie":"絹","tissu":"布"
},
ko:{
"marteau":"망치","clou":"못","vis":"나사","tournevis":"드라이버","outil":"도구","pelle":"삽","réparer":"수리하다","percer":"뚫다","coller":"붙이다","mesurer":"재다","échelle":"사다리","pinceau":"붓","scie":"톱","tuyau":"파이프","corde":"밧줄","fil":"철사",
"incendie":"화재","ambulance":"구급차","secours":"구조","danger":"위험","alarme":"경보","il y a le feu":"불이 났어요","voleur":"도둑","témoin":"목격자","prudent":"신중한","avertir":"경고하다","fuite":"누수",
"réservation":"자리 예약","pourboire":"팁","commander":"주문하다","végétarien":"채식주의자","saignant":"레어","bien cuit":"웰던","l'addition, s'il vous plaît":"계산서 주세요",
"concert":"콘서트","spectacle":"공연","chanteur":"가수","acteur":"배우","scène":"무대","applaudir":"박수를 치다","le spectacle commence à huit heures":"공연은 여덟 시에 시작해요","exposition":"전시회","ambiance":"분위기","cirque":"서커스","affiche":"포스터","entracte":"인터미션",
"cependant":"그러나","pourtant":"그래도","malgré":"에도 불구하고","sauf":"제외하고","environ":"대략","plutôt":"오히려","sans doute":"아마도","d'ailleurs":"게다가","en fait":"사실은","au lieu de":"대신에","grâce à":"덕분에","à cause de":"때문에",
"se souvenir":"기억하다","mémoire":"기억","reconnaître":"알아보다","regretter":"후회하다","deviner":"맞히다","je me souviens de toi":"너를 기억해요","imaginer":"상상하다","réfléchir":"곰곰이 생각하다","supposer":"추측하다","hésiter":"망설이다","prévoir":"예측하다",
"emprunter":"빌리다","prêter":"빌려주다","dette":"빚","récompense":"보상","ça vaut la peine":"그럴 가치가 있어요",
"métal":"금속","plastique":"플라스틱","bois":"목재","or":"금","carton":"판지","coton":"면","laine":"양모","cuir":"가죽","soie":"실크","tissu":"옷감"
},
ar:{
"marteau":"مطرقة","clou":"مسمار","vis":"برغي","tournevis":"مفك","outil":"أداة","pelle":"مجرفة","réparer":"يصلح","percer":"يثقب","coller":"يلصق","mesurer":"يقيس","échelle":"سلم","pinceau":"فرشاة طلاء","scie":"منشار","tuyau":"أنبوب","corde":"حبل","fil":"سلك",
"incendie":"حريق","ambulance":"سيارة إسعاف","secours":"إنقاذ","danger":"خطر","alarme":"إنذار","il y a le feu":"هناك حريق","voleur":"لص","témoin":"شاهد","prudent":"حذر","avertir":"يحذر","fuite":"تسرب",
"réservation":"حجز","pourboire":"بقشيش","commander":"يطلب","végétarien":"نباتي","saignant":"قليل الاستواء","bien cuit":"مطهو جيدًا","l'addition, s'il vous plaît":"الحساب من فضلك",
"concert":"حفلة موسيقية","spectacle":"عرض مسرحي","chanteur":"مغني","acteur":"ممثل","scène":"خشبة المسرح","applaudir":"يصفق","le spectacle commence à huit heures":"يبدأ العرض في الساعة الثامنة","exposition":"معرض","ambiance":"أجواء","cirque":"سيرك","affiche":"ملصق","entracte":"استراحة",
"cependant":"ومع ذلك","pourtant":"رغم ذلك","malgré":"رغم","sauf":"ما عدا","environ":"حوالي","plutôt":"بالأحرى","sans doute":"على الأرجح","d'ailleurs":"بالمناسبة","en fait":"في الواقع","au lieu de":"بدلاً من","grâce à":"بفضل","à cause de":"بسبب",
"se souvenir":"يتذكر","mémoire":"ذاكرة","reconnaître":"يتعرف على","regretter":"يندم","deviner":"يخمن","je me souviens de toi":"أتذكرك","imaginer":"يتخيل","réfléchir":"يتأمل","supposer":"يفترض","hésiter":"يتردد","prévoir":"يتوقع",
"emprunter":"يقترض","prêter":"يقرض","dette":"ديون","récompense":"مكافأة","ça vaut la peine":"يستحق العناء",
"métal":"معدن","plastique":"بلاستيك","bois":"خشب","or":"ذهب","carton":"كرتون","coton":"قطن","laine":"صوف","cuir":"جلد","soie":"حرير","tissu":"قماش"
}
};
LANGS2.forEach(function(l){ var l2=LEX2L[l]||{}; Object.keys(l2).forEach(function(k){ LEX2[l][k]=l2[k]; }); });
/* ── Vague 13 nouvelles langues (v2.82) : unités 97-104 — à l'aéroport, à la gare,
   la ville en détail, à la ferme, le sport en grand, l'atelier d'artiste, à la poste,
   le grand ménage. Anti-collisions vérifiées : pl guichet=okienko (kasa=caisse) ;
   ru terrain=площадка (поле=champ), peintre=живописец (художник=artiste),
   guichet=окошко (касса=caisse), atterrissage=приземление (посадка=embarquement) ;
   uk guichet=віконце, peintre=живописець ; cs éponge=houbička (houba=champignon),
   panneau=dopravní značka (značka=marque), lampadaire=pouliční lampa (lampa=lampe),
   sculpture=plastika (socha=statue) ; zh tableau=画作 (画画=dessiner) ;
   ko terrain=운동장 (경기장=stade), tableau=회화 ; ar terrain=أرض الملعب (ملعب=stade),
   entraînement=تمرين (تدريب=formation), galerie=صالة عرض (معرض=exposition). */
var LEX2M = {
pl:{
"embarquement":"wejście na pokład","décollage":"start","atterrissage":"lądowanie","bagage à main":"bagaż podręczny","hublot":"iluminator","piste":"pas startowy",
"quai":"peron","guichet":"okienko","aller simple":"bilet w jedną stronę","aller-retour":"bilet w obie strony","correspondance":"przesiadka","le train est en retard":"pociąg jest opóźniony","où est le quai":"gdzie jest peron",
"trottoir":"chodnik","passage piéton":"przejście dla pieszych","panneau":"znak","lampadaire":"latarnia","boîte aux lettres":"skrzynka pocztowa","rond-point":"rondo","fontaine":"fontanna","statue":"posąg","banlieue":"przedmieścia","centre-ville":"centrum miasta","tunnel":"tunel",
"ferme":"gospodarstwo","récolte":"zbiory","semer":"siać","tracteur":"traktor","blé":"pszenica","grange":"stodoła","étable":"obora","poulailler":"kurnik","puits":"studnia","épouvantail":"strach na wróble","troupeau":"stado","berger":"pasterz","foin":"siano","vigne":"winnica","maïs":"kukurydza",
"équipe":"drużyna","match":"mecz","but":"gol","arbitre":"sędzia","terrain":"boisko","tournoi":"turniej","victoire":"zwycięstwo","défaite":"porażka","entraînement":"trening","adversaire":"przeciwnik","champion":"mistrz","médaille":"medal",
"peintre":"malarz","tableau":"obraz","sculpture":"rzeźba","sculpteur":"rzeźbiarz","atelier":"pracownia","dessin":"rysunek","œuvre":"dzieło","portrait":"portret","chef-d'œuvre":"arcydzieło","galerie":"galeria","exposer":"wystawiać",
"colis":"paczka","timbre":"znaczek","enveloppe":"koperta","livraison":"dostawa","expéditeur":"nadawca","destinataire":"odbiorca","formulaire":"formularz","signature":"podpis","tampon":"pieczątka",
"balayer":"zamiatać","aspirateur":"odkurzacz","lessive":"pranie","vaisselle":"naczynia","poussière":"kurz","balai":"miotła","seau":"wiadro","éponge":"gąbka","serpillière":"mop"
},
ru:{
"embarquement":"посадка","décollage":"взлёт","atterrissage":"приземление","bagage à main":"ручная кладь","hublot":"иллюминатор","piste":"взлётная полоса",
"quai":"платформа","guichet":"окошко","aller simple":"билет в одну сторону","aller-retour":"билет туда и обратно","correspondance":"пересадка","le train est en retard":"поезд опаздывает","où est le quai":"где платформа",
"trottoir":"тротуар","passage piéton":"пешеходный переход","panneau":"знак","lampadaire":"фонарь","boîte aux lettres":"почтовый ящик","rond-point":"круговое движение","fontaine":"фонтан","statue":"статуя","banlieue":"пригород","centre-ville":"центр города","tunnel":"тоннель",
"ferme":"ферма","récolte":"урожай","semer":"сеять","tracteur":"трактор","blé":"пшеница","grange":"амбар","étable":"коровник","poulailler":"курятник","puits":"колодец","épouvantail":"пугало","troupeau":"стадо","berger":"пастух","foin":"сено","vigne":"виноградник","maïs":"кукуруза",
"équipe":"команда","match":"матч","but":"гол","arbitre":"судья","terrain":"площадка","tournoi":"турнир","victoire":"победа","défaite":"поражение","entraînement":"тренировка","adversaire":"соперник","champion":"чемпион","médaille":"медаль",
"peintre":"живописец","tableau":"картина","sculpture":"скульптура","sculpteur":"скульптор","atelier":"мастерская","dessin":"рисунок","œuvre":"произведение","portrait":"портрет","chef-d'œuvre":"шедевр","galerie":"галерея","exposer":"выставлять",
"colis":"посылка","timbre":"марка","enveloppe":"конверт","livraison":"доставка","expéditeur":"отправитель","destinataire":"получатель","formulaire":"бланк","signature":"подпись","tampon":"печать",
"balayer":"подметать","aspirateur":"пылесос","lessive":"стирка","vaisselle":"посуда","poussière":"пыль","balai":"метла","seau":"ведро","éponge":"губка","serpillière":"швабра"
},
uk:{
"embarquement":"посадка","décollage":"зліт","atterrissage":"приземлення","bagage à main":"ручна поклажа","hublot":"ілюмінатор","piste":"злітна смуга",
"quai":"платформа","guichet":"віконце","aller simple":"квиток в один бік","aller-retour":"квиток туди й назад","correspondance":"пересадка","le train est en retard":"потяг запізнюється","où est le quai":"де платформа",
"trottoir":"тротуар","passage piéton":"пішохідний перехід","panneau":"знак","lampadaire":"ліхтар","boîte aux lettres":"поштова скринька","rond-point":"кільце","fontaine":"фонтан","statue":"статуя","banlieue":"передмістя","centre-ville":"центр міста","tunnel":"тунель",
"ferme":"ферма","récolte":"врожай","semer":"сіяти","tracteur":"трактор","blé":"пшениця","grange":"стодола","étable":"корівник","poulailler":"курник","puits":"колодязь","épouvantail":"опудало","troupeau":"стадо","berger":"пастух","foin":"сіно","vigne":"виноградник","maïs":"кукурудза",
"équipe":"команда","match":"матч","but":"гол","arbitre":"суддя","terrain":"майданчик","tournoi":"турнір","victoire":"перемога","défaite":"поразка","entraînement":"тренування","adversaire":"суперник","champion":"чемпіон","médaille":"медаль",
"peintre":"живописець","tableau":"картина","sculpture":"скульптура","sculpteur":"скульптор","atelier":"майстерня","dessin":"малюнок","œuvre":"твір","portrait":"портрет","chef-d'œuvre":"шедевр","galerie":"галерея","exposer":"виставляти",
"colis":"посилка","timbre":"марка","enveloppe":"конверт","livraison":"доставка","expéditeur":"відправник","destinataire":"одержувач","formulaire":"бланк","signature":"підпис","tampon":"печатка",
"balayer":"підмітати","aspirateur":"пилосос","lessive":"прання","vaisselle":"посуд","poussière":"пил","balai":"мітла","seau":"відро","éponge":"губка","serpillière":"швабра"
},
cs:{
"embarquement":"nástup","décollage":"vzlet","atterrissage":"přistání","bagage à main":"příruční zavazadlo","hublot":"okénko","piste":"ranvej",
"quai":"nástupiště","guichet":"přepážka","aller simple":"jednosměrná jízdenka","aller-retour":"zpáteční jízdenka","correspondance":"přestup","le train est en retard":"vlak má zpoždění","où est le quai":"kde je nástupiště",
"trottoir":"chodník","passage piéton":"přechod pro chodce","panneau":"dopravní značka","lampadaire":"pouliční lampa","boîte aux lettres":"poštovní schránka","rond-point":"kruhový objezd","fontaine":"fontána","statue":"socha","banlieue":"předměstí","centre-ville":"centrum města","tunnel":"tunel",
"ferme":"farma","récolte":"sklizeň","semer":"sít","tracteur":"traktor","blé":"pšenice","grange":"stodola","étable":"chlév","poulailler":"kurník","puits":"studna","épouvantail":"strašák","troupeau":"stádo","berger":"pastýř","foin":"seno","vigne":"vinice","maïs":"kukuřice",
"équipe":"tým","match":"zápas","but":"gól","arbitre":"rozhodčí","terrain":"hřiště","tournoi":"turnaj","victoire":"vítězství","défaite":"porážka","entraînement":"trénink","adversaire":"soupeř","champion":"šampion","médaille":"medaile",
"peintre":"malíř","tableau":"obraz","sculpture":"plastika","sculpteur":"sochař","atelier":"ateliér","dessin":"kresba","œuvre":"dílo","portrait":"portrét","chef-d'œuvre":"mistrovské dílo","galerie":"galerie","exposer":"vystavovat",
"colis":"balík","timbre":"poštovní známka","enveloppe":"obálka","livraison":"doručení","expéditeur":"odesílatel","destinataire":"příjemce","formulaire":"formulář","signature":"podpis","tampon":"razítko",
"balayer":"zametat","aspirateur":"vysavač","lessive":"praní","vaisselle":"nádobí","poussière":"prach","balai":"koště","seau":"kbelík","éponge":"houbička","serpillière":"mop"
},
zh:{
"embarquement":"登机","décollage":"起飞","atterrissage":"降落","bagage à main":"手提行李","hublot":"舷窗","piste":"跑道",
"quai":"站台","guichet":"售票处","aller simple":"单程票","aller-retour":"往返票","correspondance":"换乘","le train est en retard":"火车 晚点 了","où est le quai":"站台 在 哪里",
"trottoir":"人行道","passage piéton":"人行横道","panneau":"路牌","lampadaire":"路灯","boîte aux lettres":"邮箱","rond-point":"环岛","fontaine":"喷泉","statue":"雕像","banlieue":"郊区","centre-ville":"市中心","tunnel":"隧道",
"ferme":"农场","récolte":"收成","semer":"播种","tracteur":"拖拉机","blé":"小麦","grange":"谷仓","étable":"牛棚","poulailler":"鸡舍","puits":"水井","épouvantail":"稻草人","troupeau":"畜群","berger":"牧羊人","foin":"干草","vigne":"葡萄园","maïs":"玉米",
"équipe":"队","match":"比赛","but":"进球","arbitre":"裁判","terrain":"球场","tournoi":"锦标赛","victoire":"胜利","défaite":"失败","entraînement":"训练","adversaire":"对手","champion":"冠军","médaille":"奖牌",
"peintre":"画家","tableau":"画作","sculpture":"雕塑","sculpteur":"雕塑家","atelier":"工作室","dessin":"图画","œuvre":"作品","portrait":"肖像","chef-d'œuvre":"杰作","galerie":"画廊","exposer":"展出",
"colis":"包裹","timbre":"邮票","enveloppe":"信封","livraison":"送货","expéditeur":"寄件人","destinataire":"收件人","formulaire":"表格","signature":"签名","tampon":"印章",
"balayer":"扫地","aspirateur":"吸尘器","lessive":"洗衣服","vaisselle":"餐具","poussière":"灰尘","balai":"扫帚","seau":"水桶","éponge":"海绵","serpillière":"拖把"
},
ja:{
"embarquement":"搭乗","décollage":"離陸","atterrissage":"着陸","bagage à main":"手荷物","hublot":"舷窓","piste":"滑走路",
"quai":"ホーム","guichet":"窓口","aller simple":"片道切符","aller-retour":"往復切符","correspondance":"乗り換え","le train est en retard":"電車 は 遅れています","où est le quai":"ホーム は どこ です か",
"trottoir":"歩道","passage piéton":"横断歩道","panneau":"標識","lampadaire":"街灯","boîte aux lettres":"ポスト","rond-point":"ロータリー","fontaine":"噴水","statue":"彫像","banlieue":"郊外","centre-ville":"中心街","tunnel":"トンネル",
"ferme":"農場","récolte":"収穫","semer":"種をまきます","tracteur":"トラクター","blé":"小麦","grange":"納屋","étable":"牛小屋","poulailler":"鶏小屋","puits":"井戸","épouvantail":"かかし","troupeau":"群れ","berger":"羊飼い","foin":"干し草","vigne":"ぶどう畑","maïs":"トウモロコシ",
"équipe":"チーム","match":"試合","but":"ゴール","arbitre":"審判","terrain":"グラウンド","tournoi":"トーナメント","victoire":"勝利","défaite":"敗北","entraînement":"トレーニング","adversaire":"相手","champion":"チャンピオン","médaille":"メダル",
"peintre":"画家","tableau":"絵画","sculpture":"彫刻","sculpteur":"彫刻家","atelier":"アトリエ","dessin":"絵","œuvre":"作品","portrait":"肖像画","chef-d'œuvre":"傑作","galerie":"ギャラリー","exposer":"展示します",
"colis":"小包","timbre":"切手","enveloppe":"封筒","livraison":"配達","expéditeur":"差出人","destinataire":"宛先","formulaire":"用紙","signature":"署名","tampon":"はんこ",
"balayer":"掃きます","aspirateur":"掃除機","lessive":"洗濯","vaisselle":"食器","poussière":"ほこり","balai":"ほうき","seau":"バケツ","éponge":"スポンジ","serpillière":"モップ"
},
ko:{
"embarquement":"탑승","décollage":"이륙","atterrissage":"착륙","bagage à main":"기내 수하물","hublot":"비행기 창문","piste":"활주로",
"quai":"승강장","guichet":"매표소","aller simple":"편도표","aller-retour":"왕복표","correspondance":"환승","le train est en retard":"기차가 연착됐어요","où est le quai":"승강장이 어디예요",
"trottoir":"인도","passage piéton":"횡단보도","panneau":"표지판","lampadaire":"가로등","boîte aux lettres":"우체통","rond-point":"로터리","fontaine":"분수","statue":"동상","banlieue":"교외","centre-ville":"시내","tunnel":"터널",
"ferme":"농장","récolte":"수확","semer":"씨를 뿌리다","tracteur":"트랙터","blé":"밀","grange":"헛간","étable":"외양간","poulailler":"닭장","puits":"우물","épouvantail":"허수아비","troupeau":"가축 떼","berger":"양치기","foin":"건초","vigne":"포도밭","maïs":"옥수수",
"équipe":"팀","match":"경기","but":"골","arbitre":"심판","terrain":"운동장","tournoi":"토너먼트","victoire":"승리","défaite":"패배","entraînement":"훈련","adversaire":"상대","champion":"챔피언","médaille":"메달",
"peintre":"화가","tableau":"회화","sculpture":"조각품","sculpteur":"조각가","atelier":"작업실","dessin":"그림","œuvre":"작품","portrait":"초상화","chef-d'œuvre":"걸작","galerie":"갤러리","exposer":"전시하다",
"colis":"소포","timbre":"우표","enveloppe":"봉투","livraison":"배달","expéditeur":"보내는 사람","destinataire":"받는 사람","formulaire":"양식","signature":"서명","tampon":"도장",
"balayer":"쓸다","aspirateur":"청소기","lessive":"빨래","vaisselle":"설거지","poussière":"먼지","balai":"빗자루","seau":"양동이","éponge":"스펀지","serpillière":"대걸레"
},
ar:{
"embarquement":"صعود الطائرة","décollage":"إقلاع","atterrissage":"هبوط","bagage à main":"حقيبة يد","hublot":"نافذة الطائرة","piste":"مدرج",
"quai":"رصيف","guichet":"شباك التذاكر","aller simple":"تذكرة ذهاب","aller-retour":"تذكرة ذهاب وعودة","correspondance":"تبديل","le train est en retard":"القطار متأخر","où est le quai":"أين الرصيف",
"trottoir":"رصيف المشاة","passage piéton":"ممر مشاة","panneau":"لافتة","lampadaire":"عمود إنارة","boîte aux lettres":"صندوق بريد","rond-point":"دوار","fontaine":"نافورة","statue":"تمثال","banlieue":"ضواحي","centre-ville":"وسط المدينة","tunnel":"نفق",
"ferme":"مزرعة","récolte":"حصاد","semer":"يزرع","tracteur":"جرار","blé":"قمح","grange":"مخزن الحبوب","étable":"حظيرة","poulailler":"قن الدجاج","puits":"بئر","épouvantail":"فزاعة","troupeau":"قطيع","berger":"راعٍ","foin":"قش","vigne":"كرم العنب","maïs":"ذرة",
"équipe":"فريق","match":"مباراة","but":"هدف","arbitre":"حكم","terrain":"أرض الملعب","tournoi":"بطولة","victoire":"انتصار","défaite":"هزيمة","entraînement":"تمرين","adversaire":"خصم","champion":"بطل","médaille":"ميدالية",
"peintre":"رسام","tableau":"لوحة","sculpture":"منحوتة","sculpteur":"نحات","atelier":"ورشة","dessin":"رسم","œuvre":"عمل فني","portrait":"بورتريه","chef-d'œuvre":"تحفة","galerie":"صالة عرض","exposer":"يقيم معرضًا",
"colis":"طرد","timbre":"طابع بريدي","enveloppe":"ظرف","livraison":"توصيل","expéditeur":"مرسل","destinataire":"مستلم","formulaire":"استمارة","signature":"توقيع","tampon":"ختم",
"balayer":"يكنس","aspirateur":"مكنسة كهربائية","lessive":"غسيل الملابس","vaisselle":"غسيل الأطباق","poussière":"غبار","balai":"مكنسة","seau":"دلو","éponge":"إسفنجة","serpillière":"ممسحة"
}
};
LANGS2.forEach(function(l){ var m2=LEX2M[l]||{}; Object.keys(m2).forEach(function(k){ LEX2[l][k]=m2[k]; }); });
/* ── Vague 14 nouvelles langues (v2.83) : unités 105-112 — la grande famille, les grands
   jours, communiquer, verbes précieux, se repérer, les fruits du verger, à l'hôtel, en mer.
   Anti-collisions vérifiées : époux ≠ mari partout (ru супруг/муж, cs choť/manžel,
   zh 配偶/丈夫, ja 配偶者, ko 배우자, ar قرين/زوج, uk муж bookish/чоловік) ;
   au-dessus/au-dessous ≠ sur/sous (pl powyżej/poniżej, ru выше/ниже, uk вище/нижче,
   cs výše/níže, ar أعلى/أسفل car فوق=sur تحت=sous) ; filet=sieć rybacka/рыболовная
   сеть/rybářská síť (sieć/сеть/síť=réseau) ; ru prévenir=извещать (предупреждать=avertir) ;
   ar à l'extérieur=خارجًا (في الخارج=à l'étranger), cérémonie=مراسم (حفلة=fête).
   Homographes réels assumés : ko 밤 = nuit ET châtaigne (le classique coréen) ;
   cs mezi = entre ET parmi (même mot, pas d'alternative). */
var LEX2N = {
pl:{
"beau-père":"teść","belle-mère":"teściowa","gendre":"zięć","belle-sœur":"szwagierka","beau-frère":"szwagier","époux":"małżonek","jumeaux":"bliźniaki","aîné":"najstarszy","cadet":"najmłodszy","petit-fils":"wnuk","petite-fille":"wnuczka","veuf":"wdowiec",
"cérémonie":"ceremonia","bouquet":"bukiet","alliance":"obrączka","discours":"przemówienie","félicitations pour ton mariage":"gratulacje z okazji ślubu","baptême":"chrzest","enterrement":"pogrzeb",
"annoncer":"ogłaszać","prévenir":"uprzedzać","saluer":"pozdrawiać","interrompre":"przerywać","prononcer":"wymawiać","puis-je vous aider":"czy mogę pomóc","bavarder":"gadać","chuchoter":"szeptać","se plaindre":"narzekać","avouer":"przyznawać się","exagérer":"przesadzać",
"éviter":"unikać","oser":"odważać się","mériter":"zasługiwać","atteindre":"osiągać","appartenir":"należeć","dépendre":"zależeć","à qui appartient ce sac":"do kogo należy ta torba","sembler":"wydawać się","paraître":"zdawać się","exister":"istnieć","suffire":"wystarczać","diminuer":"zmniejszać","augmenter":"zwiększać","réclamer":"domagać się","emballer":"pakować","serrer":"ściskać","lâcher":"puszczać",
"au-dessus":"powyżej","au-dessous":"poniżej","à travers":"przez","le long de":"wzdłuż","parmi":"wśród","contre":"przeciwko","au fond de":"na dnie","autour":"wokół","vers":"w stronę","en face":"naprzeciwko","à l'intérieur":"wewnątrz","à l'extérieur":"na zewnątrz","au milieu":"pośrodku",
"framboise":"malina","cerise":"wiśnia","prune":"śliwka","myrtille":"borówka","pêche":"brzoskwinia","abricot":"morela","melon":"melon","pastèque":"arbuz","ananas":"ananas","concombre":"ogórek","poireau":"por","chou":"kapusta","noix":"orzech","noisette":"orzech laskowy","châtaigne":"kasztan",
"réception":"recepcja","réceptionniste":"recepcjonista","chambre double":"pokój dwuosobowy","chambre simple":"pokój jednoosobowy","auberge":"gospoda","climatisation":"klimatyzacja","chauffage":"ogrzewanie","oreiller":"poduszka","couverture":"koc","drap":"prześcieradło",
"voile":"żagiel","ancre":"kotwica","équipage":"załoga","capitaine":"kapitan","croisière":"rejs","port":"port","phare":"latarnia morska","marée":"przypływ","mouette":"mewa","filet":"sieć rybacka","naufrage":"rozbicie statku","bouée":"boja"
},
ru:{
"beau-père":"тесть","belle-mère":"тёща","gendre":"зять","belle-sœur":"невестка","beau-frère":"шурин","époux":"супруг","jumeaux":"близнецы","aîné":"старший","cadet":"младший","petit-fils":"внук","petite-fille":"внучка","veuf":"вдовец",
"cérémonie":"церемония","bouquet":"букет","alliance":"обручальное кольцо","discours":"речь","félicitations pour ton mariage":"поздравляю со свадьбой","baptême":"крещение","enterrement":"похороны",
"annoncer":"объявлять","prévenir":"извещать","saluer":"здороваться","interrompre":"перебивать","prononcer":"произносить","puis-je vous aider":"чем я могу помочь","bavarder":"болтать","chuchoter":"шептать","se plaindre":"жаловаться","avouer":"признаваться","exagérer":"преувеличивать",
"éviter":"избегать","oser":"осмеливаться","mériter":"заслуживать","atteindre":"достигать","appartenir":"принадлежать","dépendre":"зависеть","à qui appartient ce sac":"чья это сумка","sembler":"казаться","paraître":"выглядеть","exister":"существовать","suffire":"хватать","diminuer":"уменьшать","augmenter":"увеличивать","réclamer":"требовать","emballer":"упаковывать","serrer":"сжимать","lâcher":"отпускать",
"au-dessus":"выше","au-dessous":"ниже","à travers":"сквозь","le long de":"вдоль","parmi":"среди","contre":"против","au fond de":"на дне","autour":"вокруг","vers":"в сторону","en face":"напротив","à l'intérieur":"внутри","à l'extérieur":"снаружи","au milieu":"посередине",
"framboise":"малина","cerise":"вишня","prune":"слива","myrtille":"черника","pêche":"персик","abricot":"абрикос","melon":"дыня","pastèque":"арбуз","ananas":"ананас","concombre":"огурец","poireau":"лук-порей","chou":"капуста","noix":"орех","noisette":"фундук","châtaigne":"каштан",
"réception":"стойка регистрации","réceptionniste":"администратор","chambre double":"двухместный номер","chambre simple":"одноместный номер","auberge":"постоялый двор","climatisation":"кондиционер","chauffage":"отопление","oreiller":"подушка","couverture":"одеяло","drap":"простыня",
"voile":"парус","ancre":"якорь","équipage":"экипаж","capitaine":"капитан","croisière":"круиз","port":"порт","phare":"маяк","marée":"прилив","mouette":"чайка","filet":"рыболовная сеть","naufrage":"кораблекрушение","bouée":"буй"
},
uk:{
"beau-père":"тесть","belle-mère":"теща","gendre":"зять","belle-sœur":"невістка","beau-frère":"шурин","époux":"муж","jumeaux":"близнюки","aîné":"старший","cadet":"молодший","petit-fils":"онук","petite-fille":"онука","veuf":"вдівець",
"cérémonie":"церемонія","bouquet":"букет","alliance":"обручка","discours":"промова","félicitations pour ton mariage":"вітаю з весіллям","baptême":"хрещення","enterrement":"похорон",
"annoncer":"оголошувати","prévenir":"сповіщати","saluer":"вітатися","interrompre":"перебивати","prononcer":"вимовляти","puis-je vous aider":"чим я можу допомогти","bavarder":"балакати","chuchoter":"шепотіти","se plaindre":"скаржитися","avouer":"зізнаватися","exagérer":"перебільшувати",
"éviter":"уникати","oser":"наважуватися","mériter":"заслуговувати","atteindre":"досягати","appartenir":"належати","dépendre":"залежати","à qui appartient ce sac":"чия це сумка","sembler":"здаватися","paraître":"видаватися","exister":"існувати","suffire":"вистачати","diminuer":"зменшувати","augmenter":"збільшувати","réclamer":"вимагати","emballer":"пакувати","serrer":"стискати","lâcher":"відпускати",
"au-dessus":"вище","au-dessous":"нижче","à travers":"крізь","le long de":"вздовж","parmi":"серед","contre":"проти","au fond de":"на дні","autour":"навколо","vers":"у бік","en face":"навпроти","à l'intérieur":"всередині","à l'extérieur":"зовні","au milieu":"посередині",
"framboise":"малина","cerise":"вишня","prune":"слива","myrtille":"чорниця","pêche":"персик","abricot":"абрикос","melon":"диня","pastèque":"кавун","ananas":"ананас","concombre":"огірок","poireau":"цибуля-порей","chou":"капуста","noix":"горіх","noisette":"фундук","châtaigne":"каштан",
"réception":"рецепція","réceptionniste":"адміністратор","chambre double":"двомісний номер","chambre simple":"одномісний номер","auberge":"корчма","climatisation":"кондиціонер","chauffage":"опалення","oreiller":"подушка","couverture":"ковдра","drap":"простирадло",
"voile":"вітрило","ancre":"якір","équipage":"екіпаж","capitaine":"капітан","croisière":"круїз","port":"порт","phare":"маяк","marée":"приплив","mouette":"чайка","filet":"рибальська сітка","naufrage":"корабельна аварія","bouée":"буй"
},
cs:{
"beau-père":"tchán","belle-mère":"tchyně","gendre":"zeť","belle-sœur":"švagrová","beau-frère":"švagr","époux":"choť","jumeaux":"dvojčata","aîné":"nejstarší","cadet":"nejmladší","petit-fils":"vnuk","petite-fille":"vnučka","veuf":"vdovec",
"cérémonie":"obřad","bouquet":"kytice","alliance":"snubní prsten","discours":"projev","félicitations pour ton mariage":"gratuluji ke svatbě","baptême":"křest","enterrement":"pohřeb",
"annoncer":"oznamovat","prévenir":"upozorňovat","saluer":"zdravit","interrompre":"přerušovat","prononcer":"vyslovovat","puis-je vous aider":"mohu vám pomoci","bavarder":"povídat si","chuchoter":"šeptat","se plaindre":"stěžovat si","avouer":"přiznávat se","exagérer":"přehánět",
"éviter":"vyhýbat se","oser":"odvažovat se","mériter":"zasloužit si","atteindre":"dosahovat","appartenir":"patřit","dépendre":"záviset","à qui appartient ce sac":"komu patří ta taška","sembler":"zdát se","paraître":"jevit se","exister":"existovat","suffire":"stačit","diminuer":"zmenšovat","augmenter":"zvětšovat","réclamer":"domáhat se","emballer":"balit","serrer":"svírat","lâcher":"pouštět",
"au-dessus":"výše","au-dessous":"níže","à travers":"skrz","le long de":"podél","parmi":"mezi","contre":"proti","au fond de":"na dně","autour":"kolem","vers":"směrem k","en face":"naproti","à l'intérieur":"uvnitř","à l'extérieur":"venku","au milieu":"uprostřed",
"framboise":"malina","cerise":"třešeň","prune":"švestka","myrtille":"borůvka","pêche":"broskev","abricot":"meruňka","melon":"meloun","pastèque":"vodní meloun","ananas":"ananas","concombre":"okurka","poireau":"pórek","chou":"zelí","noix":"ořech","noisette":"lískový ořech","châtaigne":"kaštan",
"réception":"recepce","réceptionniste":"recepční","chambre double":"dvoulůžkový pokoj","chambre simple":"jednolůžkový pokoj","auberge":"hostinec","climatisation":"klimatizace","chauffage":"topení","oreiller":"polštář","couverture":"deka","drap":"prostěradlo",
"voile":"plachta","ancre":"kotva","équipage":"posádka","capitaine":"kapitán","croisière":"plavba","port":"přístav","phare":"maják","marée":"příliv","mouette":"racek","filet":"rybářská síť","naufrage":"ztroskotání","bouée":"bóje"
},
zh:{
"beau-père":"岳父","belle-mère":"岳母","gendre":"女婿","belle-sœur":"嫂子","beau-frère":"姐夫","époux":"配偶","jumeaux":"双胞胎","aîné":"长子","cadet":"幼子","petit-fils":"孙子","petite-fille":"孙女","veuf":"鳏夫",
"cérémonie":"仪式","bouquet":"花束","alliance":"婚戒","discours":"演讲","félicitations pour ton mariage":"恭喜 你 结婚","baptême":"洗礼","enterrement":"葬礼",
"annoncer":"宣布","prévenir":"通知","saluer":"打招呼","interrompre":"打断","prononcer":"发音","puis-je vous aider":"我 能 帮 你 吗","bavarder":"聊天","chuchoter":"小声说","se plaindre":"抱怨","avouer":"承认","exagérer":"夸张",
"éviter":"避免","oser":"敢","mériter":"值得","atteindre":"达到","appartenir":"属于","dépendre":"取决于","à qui appartient ce sac":"这个 包 是 谁 的","sembler":"好像","paraître":"显得","exister":"存在","suffire":"足够","diminuer":"减少","augmenter":"增加","réclamer":"要求","emballer":"包装","serrer":"握紧","lâcher":"放开",
"au-dessus":"上方","au-dessous":"下方","à travers":"穿过","le long de":"沿着","parmi":"之中","contre":"靠着","au fond de":"在深处","autour":"周围","vers":"朝","en face":"对面","à l'intérieur":"在里面","à l'extérieur":"在外面","au milieu":"在中间",
"framboise":"覆盆子","cerise":"樱桃","prune":"李子","myrtille":"蓝莓","pêche":"桃子","abricot":"杏","melon":"甜瓜","pastèque":"西瓜","ananas":"菠萝","concombre":"黄瓜","poireau":"韭葱","chou":"卷心菜","noix":"核桃","noisette":"榛子","châtaigne":"栗子",
"réception":"前台","réceptionniste":"前台接待员","chambre double":"双人房","chambre simple":"单人房","auberge":"客栈","climatisation":"空调","chauffage":"暖气","oreiller":"枕头","couverture":"毯子","drap":"床单",
"voile":"帆","ancre":"锚","équipage":"船员","capitaine":"船长","croisière":"邮轮旅行","port":"港口","phare":"灯塔","marée":"潮汐","mouette":"海鸥","filet":"渔网","naufrage":"海难","bouée":"救生圈"
},
ja:{
"beau-père":"義理の父","belle-mère":"義理の母","gendre":"婿","belle-sœur":"義理の姉","beau-frère":"義理の兄","époux":"配偶者","jumeaux":"双子","aîné":"長男","cadet":"末っ子","petit-fils":"孫息子","petite-fille":"孫娘","veuf":"男やもめ",
"cérémonie":"式典","bouquet":"花束","alliance":"結婚指輪","discours":"スピーチ","félicitations pour ton mariage":"ご結婚 おめでとう ございます","baptême":"洗礼式","enterrement":"葬式",
"annoncer":"発表します","prévenir":"知らせます","saluer":"挨拶します","interrompre":"さえぎります","prononcer":"発音します","puis-je vous aider":"お手伝い しましょう か","bavarder":"おしゃべりします","chuchoter":"ささやきます","se plaindre":"文句を言います","avouer":"白状します","exagérer":"大げさに言います",
"éviter":"避けます","oser":"思い切ってします","mériter":"〜に値します","atteindre":"達します","appartenir":"属します","dépendre":"〜によります","à qui appartient ce sac":"この かばん は 誰 の です か","sembler":"〜のようです","paraître":"見えます","exister":"存在します","suffire":"足ります","diminuer":"減らします","augmenter":"増やします","réclamer":"要求します","emballer":"包みます","serrer":"握ります","lâcher":"放します",
"au-dessus":"真上","au-dessous":"真下","à travers":"〜を通って","le long de":"〜に沿って","parmi":"〜の中で","contre":"〜に対して","au fond de":"〜の奥に","autour":"〜の周りに","vers":"〜へ向かって","en face":"向かい","à l'intérieur":"内側に","à l'extérieur":"外側に","au milieu":"真ん中に",
"framboise":"ラズベリー","cerise":"さくらんぼ","prune":"プラム","myrtille":"ブルーベリー","pêche":"桃","abricot":"あんず","melon":"メロン","pastèque":"スイカ","ananas":"パイナップル","concombre":"きゅうり","poireau":"リーキ","chou":"キャベツ","noix":"クルミ","noisette":"ヘーゼルナッツ","châtaigne":"栗",
"réception":"フロント","réceptionniste":"フロント係","chambre double":"ダブルルーム","chambre simple":"シングルルーム","auberge":"宿屋","climatisation":"エアコン","chauffage":"暖房","oreiller":"枕","couverture":"毛布","drap":"シーツ",
"voile":"帆","ancre":"錨","équipage":"乗組員","capitaine":"船長","croisière":"クルーズ","port":"港","phare":"灯台","marée":"潮","mouette":"カモメ","filet":"網","naufrage":"難破","bouée":"浮き輪"
},
ko:{
"beau-père":"시아버지","belle-mère":"시어머니","gendre":"사위","belle-sœur":"형수","beau-frère":"매형","époux":"배우자","jumeaux":"쌍둥이","aîné":"맏이","cadet":"막내","petit-fils":"손자","petite-fille":"손녀","veuf":"홀아비",
"cérémonie":"예식","bouquet":"꽃다발","alliance":"결혼반지","discours":"연설","félicitations pour ton mariage":"결혼 축하해요","baptême":"세례","enterrement":"장례식",
"annoncer":"발표하다","prévenir":"알리다","saluer":"인사하다","interrompre":"끼어들다","prononcer":"발음하다","puis-je vous aider":"도와드릴까요","bavarder":"수다를 떨다","chuchoter":"속삭이다","se plaindre":"불평하다","avouer":"인정하다","exagérer":"과장하다",
"éviter":"피하다","oser":"감히 하다","mériter":"자격이 있다","atteindre":"도달하다","appartenir":"속하다","dépendre":"달려 있다","à qui appartient ce sac":"이 가방은 누구 거예요","sembler":"것 같다","paraître":"보이다","exister":"존재하다","suffire":"충분하다","diminuer":"줄이다","augmenter":"늘리다","réclamer":"요구하다","emballer":"포장하다","serrer":"꽉 쥐다","lâcher":"놓다",
"au-dessus":"위쪽에","au-dessous":"아래쪽에","à travers":"통해서","le long de":"따라서","parmi":"가운데","contre":"에 기대어","au fond de":"깊숙한 곳에","autour":"주위에","vers":"쪽으로","en face":"맞은편에","à l'intérieur":"안쪽에","à l'extérieur":"바깥쪽에","au milieu":"한가운데에",
"framboise":"라즈베리","cerise":"체리","prune":"자두","myrtille":"블루베리","pêche":"복숭아","abricot":"살구","melon":"멜론","pastèque":"수박","ananas":"파인애플","concombre":"오이","poireau":"리크","chou":"양배추","noix":"호두","noisette":"헤이즐넛","châtaigne":"밤",
"réception":"프런트","réceptionniste":"프런트 직원","chambre double":"더블룸","chambre simple":"싱글룸","auberge":"여관","climatisation":"에어컨","chauffage":"난방","oreiller":"베개","couverture":"담요","drap":"침대 시트",
"voile":"돛","ancre":"닻","équipage":"승무원","capitaine":"선장","croisière":"크루즈","port":"항구","phare":"등대","marée":"조수","mouette":"갈매기","filet":"그물","naufrage":"난파","bouée":"부표"
},
ar:{
"beau-père":"حمو","belle-mère":"حماة","gendre":"صهر","belle-sœur":"أخت الزوج","beau-frère":"أخو الزوج","époux":"قرين","jumeaux":"توأم","aîné":"البكر","cadet":"الأصغر","petit-fils":"حفيد","petite-fille":"حفيدة","veuf":"أرمل",
"cérémonie":"مراسم","bouquet":"باقة زهور","alliance":"خاتم الزواج","discours":"خطبة","félicitations pour ton mariage":"مبروك الزواج","baptême":"معمودية","enterrement":"جنازة",
"annoncer":"يعلن","prévenir":"يبلغ","saluer":"يسلم على","interrompre":"يقاطع","prononcer":"ينطق","puis-je vous aider":"هل يمكنني مساعدتك","bavarder":"يدردش","chuchoter":"يهمس","se plaindre":"يشتكي","avouer":"يعترف","exagérer":"يبالغ",
"éviter":"يتجنب","oser":"يجرؤ","mériter":"يستحق","atteindre":"يصل إلى","appartenir":"ينتمي إلى","dépendre":"يعتمد على","à qui appartient ce sac":"لمن هذه الحقيبة","sembler":"يبدو","paraître":"يظهر","exister":"يوجد","suffire":"يكفي","diminuer":"يقلل","augmenter":"يزيد","réclamer":"يطالب","emballer":"يغلف","serrer":"يشد","lâcher":"يفلت",
"au-dessus":"أعلى","au-dessous":"أسفل","à travers":"عبر","le long de":"على طول","parmi":"من بين","contre":"ضد","au fond de":"في قاع","autour":"حول","vers":"نحو","en face":"مقابل","à l'intérieur":"في الداخل","à l'extérieur":"خارجًا","au milieu":"في المنتصف",
"framboise":"توت العليق","cerise":"كرز","prune":"برقوق","myrtille":"توت أزرق","pêche":"خوخ","abricot":"مشمش","melon":"شمام","pastèque":"بطيخ","ananas":"أناناس","concombre":"خيار","poireau":"كراث","chou":"ملفوف","noix":"جوز","noisette":"بندق","châtaigne":"كستناء",
"réception":"استقبال","réceptionniste":"موظف استقبال","chambre double":"غرفة مزدوجة","chambre simple":"غرفة مفردة","auberge":"نزل","climatisation":"مكيف","chauffage":"تدفئة","oreiller":"وسادة","couverture":"بطانية","drap":"ملاءة",
"voile":"شراع","ancre":"مرساة","équipage":"طاقم","capitaine":"قبطان","croisière":"رحلة بحرية","port":"ميناء","phare":"منارة","marée":"مد وجزر","mouette":"نورس","filet":"شبكة صيد","naufrage":"غرق السفينة","bouée":"عوامة"
}
};
LANGS2.forEach(function(l){ var n2=LEX2N[l]||{}; Object.keys(n2).forEach(function(k){ LEX2[l][k]=n2[k]; }); });
/* ── Vague 15 nouvelles langues (v2.84) : unités 113-120 — la vie marine, l'espace,
   les sciences, la justice, il était une fois, sous le capot, le corps au-dedans,
   l'élégance. Anti-collisions vérifiées : cs coffre=kufr auta (kufr=valise),
   algue=mořská řasa / cil=řasa distingués ; ko estomac=위장 (위=sur) ;
   ru nœud papillon=галстук-бабочка (бабочка=papillon), fermeture éclair=
   застёжка-молния (молния=éclair) ; uk краватка-метелик, застібка-блискавка ;
   ar coupable=مدان (مذنب=comète), algue=أعشاب بحرية (طحلب=mousse).
   Homographes réels assumés (même mot dans la langue, pas d'alternative) :
   pl sędzia, ru судья, uk суддя = arbitre ET juge ; ko 기사 = article ET chevalier ;
   ar بطل = champion ET héros. */
var LEX2O = {
pl:{
"algue":"wodorost","coquillage":"muszla","crabe":"krab","méduse":"meduza","pieuvre":"ośmiornica",
"fusée":"rakieta","navette":"prom kosmiczny","satellite":"satelita","astronaute":"astronauta","télescope":"teleskop","gravité":"grawitacja","comète":"kometa","galaxie":"galaktyka","univers":"wszechświat","étoile filante":"spadająca gwiazda","ovni":"UFO","extraterrestre":"kosmita",
"chimie":"chemia","physique":"fizyka","biologie":"biologia","laboratoire":"laboratorium","microscope":"mikroskop","invention":"wynalazek","découverte":"odkrycie","chercheur":"badacz","théorie":"teoria","cerveau":"mózg",
"tribunal":"sąd","juge":"sędzia","procès":"proces","preuve":"dowód","plainte":"skarga","coupable":"winny","innocent":"niewinny","prison":"więzienie","amende":"grzywna","interdit":"zakazany",
"couronne":"korona","trône":"tron","chevalier":"rycerz","héros":"bohater","empire":"imperium","il était une fois":"dawno, dawno temu","bataille":"bitwa","armée":"wojsko","soldat":"żołnierz","révolution":"rewolucja","épée":"miecz","bouclier":"tarcza","flèche":"strzała","canon":"armata",
"moteur":"silnik","frein":"hamulec","pneu":"opona","volant":"kierownica","coffre":"bagażnik","capot":"maska silnika","klaxon":"klakson","rétroviseur":"lusterko wsteczne","pare-brise":"przednia szyba","essuie-glace":"wycieraczka","embouteillage":"korek","panne":"awaria",
"poumon":"płuco","estomac":"żołądek","foie":"wątroba","muscle":"mięsień","squelette":"szkielet","veine":"żyła","côte":"żebro","cheville":"kostka","poignet":"nadgarstek","menton":"podbródek","hanche":"biodro","mollet":"łydka","sourcil":"brew","cil":"rzęsa","paupière":"powieka","nuque":"kark","paume":"dłoń",
"costume":"garnitur","cravate":"krawat","nœud papillon":"muszka","gilet":"kamizelka","imperméable":"płaszcz przeciwdeszczowy","bretelles":"szelki","fermeture éclair":"zamek błyskawiczny","talon":"obcas","semelle":"podeszwa","lacet":"sznurówka","col":"kołnierz","manche":"rękaw"
},
ru:{
"algue":"водоросль","coquillage":"ракушка","crabe":"краб","méduse":"медуза","pieuvre":"осьминог",
"fusée":"ракета","navette":"шаттл","satellite":"спутник","astronaute":"космонавт","télescope":"телескоп","gravité":"гравитация","comète":"комета","galaxie":"галактика","univers":"вселенная","étoile filante":"падающая звезда","ovni":"НЛО","extraterrestre":"инопланетянин",
"chimie":"химия","physique":"физика","biologie":"биология","laboratoire":"лаборатория","microscope":"микроскоп","invention":"изобретение","découverte":"открытие","chercheur":"исследователь","théorie":"теория","cerveau":"мозг",
"tribunal":"суд","juge":"судья","procès":"судебный процесс","preuve":"доказательство","plainte":"жалоба","coupable":"виновный","innocent":"невиновный","prison":"тюрьма","amende":"штраф","interdit":"запрещённый",
"couronne":"корона","trône":"трон","chevalier":"рыцарь","héros":"герой","empire":"империя","il était une fois":"жили-были","bataille":"битва","armée":"армия","soldat":"солдат","révolution":"революция","épée":"меч","bouclier":"щит","flèche":"стрела","canon":"пушка",
"moteur":"двигатель","frein":"тормоз","pneu":"шина","volant":"руль","coffre":"багажник","capot":"капот","klaxon":"клаксон","rétroviseur":"зеркало заднего вида","pare-brise":"лобовое стекло","essuie-glace":"дворники","embouteillage":"пробка","panne":"поломка",
"poumon":"лёгкое","estomac":"желудок","foie":"печень","muscle":"мышца","squelette":"скелет","veine":"вена","côte":"ребро","cheville":"лодыжка","poignet":"запястье","menton":"подбородок","hanche":"бедро","mollet":"икра","sourcil":"бровь","cil":"ресница","paupière":"веко","nuque":"затылок","paume":"ладонь",
"costume":"костюм","cravate":"галстук","nœud papillon":"галстук-бабочка","gilet":"жилет","imperméable":"дождевик","bretelles":"подтяжки","fermeture éclair":"застёжка-молния","talon":"каблук","semelle":"подошва","lacet":"шнурок","col":"воротник","manche":"рукав"
},
uk:{
"algue":"водорість","coquillage":"мушля","crabe":"краб","méduse":"медуза","pieuvre":"восьминіг",
"fusée":"ракета","navette":"шатл","satellite":"супутник","astronaute":"космонавт","télescope":"телескоп","gravité":"гравітація","comète":"комета","galaxie":"галактика","univers":"всесвіт","étoile filante":"падаюча зірка","ovni":"НЛО","extraterrestre":"інопланетянин",
"chimie":"хімія","physique":"фізика","biologie":"біологія","laboratoire":"лабораторія","microscope":"мікроскоп","invention":"винахід","découverte":"відкриття","chercheur":"дослідник","théorie":"теорія","cerveau":"мозок",
"tribunal":"суд","juge":"суддя","procès":"судовий процес","preuve":"доказ","plainte":"скарга","coupable":"винний","innocent":"невинний","prison":"в'язниця","amende":"штраф","interdit":"заборонений",
"couronne":"корона","trône":"трон","chevalier":"лицар","héros":"герой","empire":"імперія","il était une fois":"давним-давно","bataille":"битва","armée":"армія","soldat":"солдат","révolution":"революція","épée":"меч","bouclier":"щит","flèche":"стріла","canon":"гармата",
"moteur":"двигун","frein":"гальмо","pneu":"шина","volant":"кермо","coffre":"багажник","capot":"капот","klaxon":"клаксон","rétroviseur":"дзеркало заднього виду","pare-brise":"лобове скло","essuie-glace":"двірники","embouteillage":"затор","panne":"поломка",
"poumon":"легеня","estomac":"шлунок","foie":"печінка","muscle":"м'яз","squelette":"скелет","veine":"вена","côte":"ребро","cheville":"щиколотка","poignet":"зап'ясток","menton":"підборіддя","hanche":"стегно","mollet":"литка","sourcil":"брова","cil":"вія","paupière":"повіка","nuque":"потилиця","paume":"долоня",
"costume":"костюм","cravate":"краватка","nœud papillon":"краватка-метелик","gilet":"жилет","imperméable":"дощовик","bretelles":"підтяжки","fermeture éclair":"застібка-блискавка","talon":"підбор","semelle":"підошва","lacet":"шнурок","col":"комір","manche":"рукав"
},
cs:{
"algue":"mořská řasa","coquillage":"mušle","crabe":"krab","méduse":"medúza","pieuvre":"chobotnice",
"fusée":"raketa","navette":"raketoplán","satellite":"družice","astronaute":"astronaut","télescope":"teleskop","gravité":"gravitace","comète":"kometa","galaxie":"galaxie","univers":"vesmír","étoile filante":"padající hvězda","ovni":"UFO","extraterrestre":"mimozemšťan",
"chimie":"chemie","physique":"fyzika","biologie":"biologie","laboratoire":"laboratoř","microscope":"mikroskop","invention":"vynález","découverte":"objev","chercheur":"výzkumník","théorie":"teorie","cerveau":"mozek",
"tribunal":"soud","juge":"soudce","procès":"soudní proces","preuve":"důkaz","plainte":"stížnost","coupable":"vinný","innocent":"nevinný","prison":"vězení","amende":"pokuta","interdit":"zakázaný",
"couronne":"koruna","trône":"trůn","chevalier":"rytíř","héros":"hrdina","empire":"říše","il était une fois":"bylo nebylo","bataille":"bitva","armée":"armáda","soldat":"voják","révolution":"revoluce","épée":"meč","bouclier":"štít","flèche":"šíp","canon":"dělo",
"moteur":"motor","frein":"brzda","pneu":"pneumatika","volant":"volant","coffre":"kufr auta","capot":"kapota","klaxon":"klakson","rétroviseur":"zpětné zrcátko","pare-brise":"čelní sklo","essuie-glace":"stěrač","embouteillage":"zácpa","panne":"porucha",
"poumon":"plíce","estomac":"žaludek","foie":"játra","muscle":"sval","squelette":"kostra","veine":"žíla","côte":"žebro","cheville":"kotník","poignet":"zápěstí","menton":"brada","hanche":"kyčel","mollet":"lýtko","sourcil":"obočí","cil":"řasa","paupière":"víčko","nuque":"zátylek","paume":"dlaň",
"costume":"oblek","cravate":"kravata","nœud papillon":"motýlek","gilet":"vesta","imperméable":"pláštěnka","bretelles":"kšandy","fermeture éclair":"zip","talon":"podpatek","semelle":"podrážka","lacet":"tkanička","col":"límec","manche":"rukáv"
},
zh:{
"algue":"海藻","coquillage":"贝壳","crabe":"螃蟹","méduse":"水母","pieuvre":"章鱼",
"fusée":"火箭","navette":"航天飞机","satellite":"卫星","astronaute":"宇航员","télescope":"望远镜","gravité":"重力","comète":"彗星","galaxie":"星系","univers":"宇宙","étoile filante":"流星","ovni":"不明飞行物","extraterrestre":"外星人",
"chimie":"化学","physique":"物理","biologie":"生物学","laboratoire":"实验室","microscope":"显微镜","invention":"发明","découverte":"发现","chercheur":"研究员","théorie":"理论","cerveau":"大脑",
"tribunal":"法院","juge":"法官","procès":"诉讼","preuve":"证据","plainte":"投诉","coupable":"有罪的","innocent":"无罪的","prison":"监狱","amende":"罚款","interdit":"禁止的",
"couronne":"王冠","trône":"王座","chevalier":"骑士","héros":"英雄","empire":"帝国","il était une fois":"很久 很久 以前","bataille":"战役","armée":"军队","soldat":"士兵","révolution":"革命","épée":"剑","bouclier":"盾","flèche":"箭","canon":"大炮",
"moteur":"发动机","frein":"刹车","pneu":"轮胎","volant":"方向盘","coffre":"后备箱","capot":"引擎盖","klaxon":"喇叭","rétroviseur":"后视镜","pare-brise":"挡风玻璃","essuie-glace":"雨刷","embouteillage":"堵车","panne":"故障",
"poumon":"肺","estomac":"胃","foie":"肝脏","muscle":"肌肉","squelette":"骨骼","veine":"静脉","côte":"肋骨","cheville":"脚踝","poignet":"手腕","menton":"下巴","hanche":"髋部","mollet":"小腿","sourcil":"眉毛","cil":"睫毛","paupière":"眼皮","nuque":"后颈","paume":"手掌",
"costume":"西装","cravate":"领带","nœud papillon":"领结","gilet":"马甲","imperméable":"雨衣","bretelles":"背带","fermeture éclair":"拉链","talon":"鞋跟","semelle":"鞋底","lacet":"鞋带","col":"衣领","manche":"袖子"
},
ja:{
"algue":"海藻","coquillage":"貝殻","crabe":"カニ","méduse":"クラゲ","pieuvre":"タコ",
"fusée":"ロケット","navette":"スペースシャトル","satellite":"衛星","astronaute":"宇宙飛行士","télescope":"望遠鏡","gravité":"重力","comète":"彗星","galaxie":"銀河","univers":"宇宙","étoile filante":"流れ星","ovni":"ユーフォー","extraterrestre":"宇宙人",
"chimie":"化学","physique":"物理","biologie":"生物学","laboratoire":"実験室","microscope":"顕微鏡","invention":"発明","découverte":"発見","chercheur":"研究者","théorie":"理論","cerveau":"脳",
"tribunal":"裁判所","juge":"裁判官","procès":"裁判","preuve":"証拠","plainte":"苦情","coupable":"有罪の","innocent":"無罪の","prison":"刑務所","amende":"罰金","interdit":"禁止された",
"couronne":"王冠","trône":"王座","chevalier":"騎士","héros":"英雄","empire":"帝国","il était une fois":"昔々","bataille":"戦い","armée":"軍隊","soldat":"兵士","révolution":"革命","épée":"剣","bouclier":"盾","flèche":"矢","canon":"大砲",
"moteur":"エンジン","frein":"ブレーキ","pneu":"タイヤ","volant":"ハンドル","coffre":"トランク","capot":"ボンネット","klaxon":"クラクション","rétroviseur":"バックミラー","pare-brise":"フロントガラス","essuie-glace":"ワイパー","embouteillage":"渋滞","panne":"故障",
"poumon":"肺","estomac":"胃","foie":"肝臓","muscle":"筋肉","squelette":"骨格","veine":"静脈","côte":"肋骨","cheville":"足首","poignet":"手首","menton":"あご","hanche":"腰","mollet":"ふくらはぎ","sourcil":"眉毛","cil":"まつげ","paupière":"まぶた","nuque":"うなじ","paume":"手のひら",
"costume":"スーツ","cravate":"ネクタイ","nœud papillon":"蝶ネクタイ","gilet":"ベスト","imperméable":"レインコート","bretelles":"サスペンダー","fermeture éclair":"ファスナー","talon":"ヒール","semelle":"靴底","lacet":"靴ひも","col":"襟","manche":"袖"
},
ko:{
"algue":"해초","coquillage":"조개껍데기","crabe":"게","méduse":"해파리","pieuvre":"문어",
"fusée":"로켓","navette":"우주왕복선","satellite":"위성","astronaute":"우주비행사","télescope":"망원경","gravité":"중력","comète":"혜성","galaxie":"은하","univers":"우주","étoile filante":"별똥별","ovni":"유에프오","extraterrestre":"외계인",
"chimie":"화학","physique":"물리학","biologie":"생물학","laboratoire":"실험실","microscope":"현미경","invention":"발명","découverte":"발견","chercheur":"연구원","théorie":"이론","cerveau":"뇌",
"tribunal":"법원","juge":"판사","procès":"재판","preuve":"증거","plainte":"고소","coupable":"유죄의","innocent":"무죄의","prison":"감옥","amende":"벌금","interdit":"금지된",
"couronne":"왕관","trône":"왕좌","chevalier":"기사","héros":"영웅","empire":"제국","il était une fois":"옛날 옛적에","bataille":"전투","armée":"군대","soldat":"군인","révolution":"혁명","épée":"검","bouclier":"방패","flèche":"화살","canon":"대포",
"moteur":"엔진","frein":"브레이크","pneu":"타이어","volant":"핸들","coffre":"트렁크","capot":"보닛","klaxon":"경적","rétroviseur":"백미러","pare-brise":"앞유리","essuie-glace":"와이퍼","embouteillage":"교통 체증","panne":"고장",
"poumon":"폐","estomac":"위장","foie":"간","muscle":"근육","squelette":"골격","veine":"정맥","côte":"갈비뼈","cheville":"발목","poignet":"손목","menton":"턱","hanche":"골반","mollet":"종아리","sourcil":"눈썹","cil":"속눈썹","paupière":"눈꺼풀","nuque":"목덜미","paume":"손바닥",
"costume":"정장","cravate":"넥타이","nœud papillon":"나비넥타이","gilet":"조끼","imperméable":"우비","bretelles":"멜빵","fermeture éclair":"지퍼","talon":"굽","semelle":"밑창","lacet":"신발 끈","col":"옷깃","manche":"소매"
},
ar:{
"algue":"أعشاب بحرية","coquillage":"صدفة","crabe":"سلطعون","méduse":"قنديل البحر","pieuvre":"أخطبوط",
"fusée":"صاروخ","navette":"مكوك فضائي","satellite":"قمر صناعي","astronaute":"رائد فضاء","télescope":"تلسكوب","gravité":"جاذبية","comète":"مذنب","galaxie":"مجرة","univers":"كون","étoile filante":"شهاب","ovni":"جسم طائر مجهول","extraterrestre":"كائن فضائي",
"chimie":"كيمياء","physique":"فيزياء","biologie":"أحياء","laboratoire":"مختبر","microscope":"مجهر","invention":"اختراع","découverte":"اكتشاف","chercheur":"باحث","théorie":"نظرية","cerveau":"دماغ",
"tribunal":"محكمة","juge":"قاضٍ","procès":"محاكمة","preuve":"دليل","plainte":"شكوى","coupable":"مدان","innocent":"بريء","prison":"سجن","amende":"غرامة","interdit":"ممنوع",
"couronne":"تاج","trône":"عرش","chevalier":"فارس","héros":"بطل","empire":"إمبراطورية","il était une fois":"كان يا ما كان","bataille":"معركة","armée":"جيش","soldat":"جندي","révolution":"ثورة","épée":"سيف","bouclier":"درع","flèche":"سهم","canon":"مدفع",
"moteur":"محرك","frein":"فرامل","pneu":"إطار","volant":"مقود","coffre":"صندوق السيارة","capot":"غطاء المحرك","klaxon":"بوق","rétroviseur":"مرآة جانبية","pare-brise":"زجاج أمامي","essuie-glace":"مساحة الزجاج","embouteillage":"ازدحام مروري","panne":"عطل",
"poumon":"رئة","estomac":"معدة","foie":"كبد","muscle":"عضلة","squelette":"هيكل عظمي","veine":"وريد","côte":"ضلع","cheville":"كاحل","poignet":"معصم","menton":"ذقن","hanche":"ورك","mollet":"ربلة الساق","sourcil":"حاجب","cil":"رمش","paupière":"جفن","nuque":"قفا","paume":"راحة اليد",
"costume":"بدلة","cravate":"ربطة عنق","nœud papillon":"ربطة فراشة","gilet":"صدرية","imperméable":"معطف مطر","bretelles":"حمالات","fermeture éclair":"سحاب","talon":"كعب","semelle":"نعل","lacet":"رباط الحذاء","col":"ياقة","manche":"كم القميص"
}
};
LANGS2.forEach(function(l){ var o2=LEX2O[l]||{}; Object.keys(o2).forEach(function(k){ LEX2[l][k]=o2[k]; }); });
/* ── Vague 16 nouvelles langues (v2.85) : unités 121-128 — le plein air, ustensiles
   malins, les métiers, en musique, la Terre en colère, adjectifs qui brillent, verbes
   d'action, les mots du temps. Anti-collisions vérifiées : bouchon=korek do butelki /
   пробка от бутылки (korek/пробка=embouteillage) ; jumelles zh=双筒望远镜 (望远镜=
   télescope), cs=dalekohled (teleskop=télescope) ; uk trompette=сурма (труба=tuyau),
   cs=trumpeta (trubka=tuyau), ar=بوق موسيقي (بوق=klaxon) ; aussitôt distinct de tout
   de suite partout (pl od razu, ru сразу, cs okamžitě, zh 立刻, ja ただちに, ko 즉시,
   ar حالاً) ; ja appuyer=押さえます (押します=pousser).
   Homographe réel assumé : ru труба = tuyau ET trompette (même mot). */
var LEX2P = {
pl:{
"camping":"kemping","tente":"namiot","sac de couchage":"śpiwór","lampe de poche":"latarka","hamac":"hamak","randonnée":"wędrówka","chasse":"polowanie","boussole":"kompas","jumelles":"lornetka","feu de camp":"ognisko",
"fouet":"trzepaczka","louche":"chochla","passoire":"durszlak","râpe":"tarka","entonnoir":"lejek","couvercle":"pokrywka","bouchon":"korek do butelki","tire-bouchon":"korkociąg","glaçon":"kostka lodu","paille":"słomka",
"plombier":"hydraulik","électricien":"elektryk","menuisier":"stolarz","bijoutier":"jubiler","vétérinaire":"weterynarz","pêcheur":"rybak","chauffeur":"kierowca","fleuriste":"kwiaciarz",
"orchestre":"orkiestra","violon":"skrzypce","flûte":"flet","trompette":"trąbka","mélodie":"melodia","rythme":"rytm","chorale":"chór","tambour":"bęben",
"volcan":"wulkan","inondation":"powódź","tremblement de terre":"trzęsienie ziemi","avalanche":"lawina","canicule":"upał","continent":"kontynent",
"étonnant":"zdumiewający","effrayant":"przerażający","passionnant":"pasjonujący","émouvant":"wzruszający","précieux":"cenny","semblable":"podobny","épuisant":"wyczerpujący","décevant":"rozczarowujący","indispensable":"niezbędny","disponible":"dostępny","provisoire":"tymczasowy",
"détruire":"niszczyć","creuser":"kopać","vider":"opróżniać","verrouiller":"zamykać na klucz","brancher":"podłączać","débrancher":"odłączać","appuyer":"naciskać","secouer":"potrząsać","frotter":"pocierać","essuyer":"wycierać","plonger":"nurkować","ramer":"wiosłować",
"autrefois":"dawniej","récemment":"niedawno","désormais":"odtąd","auparavant":"przedtem","à l'avenir":"w przyszłości","aussitôt":"od razu","tout à coup":"nagle","dès que":"jak tylko"
},
ru:{
"camping":"кемпинг","tente":"палатка","sac de couchage":"спальный мешок","lampe de poche":"фонарик","hamac":"гамак","randonnée":"поход","chasse":"охота","boussole":"компас","jumelles":"бинокль","feu de camp":"костёр",
"fouet":"венчик","louche":"половник","passoire":"дуршлаг","râpe":"тёрка","entonnoir":"воронка","couvercle":"крышка","bouchon":"пробка от бутылки","tire-bouchon":"штопор","glaçon":"кубик льда","paille":"соломинка",
"plombier":"сантехник","électricien":"электрик","menuisier":"столяр","bijoutier":"ювелир","vétérinaire":"ветеринар","pêcheur":"рыбак","chauffeur":"водитель","fleuriste":"флорист",
"orchestre":"оркестр","violon":"скрипка","flûte":"флейта","trompette":"труба","mélodie":"мелодия","rythme":"ритм","chorale":"хор","tambour":"барабан",
"volcan":"вулкан","inondation":"наводнение","tremblement de terre":"землетрясение","avalanche":"лавина","canicule":"жара","continent":"континент",
"étonnant":"удивительный","effrayant":"пугающий","passionnant":"увлекательный","émouvant":"трогательный","précieux":"драгоценный","semblable":"похожий","épuisant":"изнурительный","décevant":"разочаровывающий","indispensable":"необходимый","disponible":"доступный","provisoire":"временный",
"détruire":"разрушать","creuser":"копать","vider":"опустошать","verrouiller":"запирать","brancher":"подключать","débrancher":"отключать","appuyer":"нажимать","secouer":"трясти","frotter":"тереть","essuyer":"вытирать","plonger":"нырять","ramer":"грести",
"autrefois":"раньше","récemment":"недавно","désormais":"отныне","auparavant":"прежде","à l'avenir":"в будущем","aussitôt":"сразу","tout à coup":"вдруг","dès que":"как только"
},
uk:{
"camping":"кемпінг","tente":"намет","sac de couchage":"спальник","lampe de poche":"ліхтарик","hamac":"гамак","randonnée":"похід","chasse":"полювання","boussole":"компас","jumelles":"бінокль","feu de camp":"багаття",
"fouet":"віночок","louche":"ополоник","passoire":"друшляк","râpe":"тертка","entonnoir":"лійка","couvercle":"кришка","bouchon":"корок","tire-bouchon":"штопор","glaçon":"кубик льоду","paille":"соломинка",
"plombier":"сантехнік","électricien":"електрик","menuisier":"столяр","bijoutier":"ювелір","vétérinaire":"ветеринар","pêcheur":"рибалка","chauffeur":"водій","fleuriste":"флорист",
"orchestre":"оркестр","violon":"скрипка","flûte":"флейта","trompette":"сурма","mélodie":"мелодія","rythme":"ритм","chorale":"хор","tambour":"барабан",
"volcan":"вулкан","inondation":"повінь","tremblement de terre":"землетрус","avalanche":"лавина","canicule":"спека","continent":"континент",
"étonnant":"дивовижний","effrayant":"моторошний","passionnant":"захопливий","émouvant":"зворушливий","précieux":"коштовний","semblable":"схожий","épuisant":"виснажливий","décevant":"невтішний","indispensable":"необхідний","disponible":"доступний","provisoire":"тимчасовий",
"détruire":"руйнувати","creuser":"копати","vider":"спорожняти","verrouiller":"замикати","brancher":"підключати","débrancher":"відключати","appuyer":"натискати","secouer":"трясти","frotter":"терти","essuyer":"витирати","plonger":"пірнати","ramer":"веслувати",
"autrefois":"колись","récemment":"нещодавно","désormais":"відтепер","auparavant":"раніше","à l'avenir":"у майбутньому","aussitôt":"одразу","tout à coup":"раптом","dès que":"як тільки"
},
cs:{
"camping":"kemp","tente":"stan","sac de couchage":"spacák","lampe de poche":"baterka","hamac":"houpací síť","randonnée":"túra","chasse":"lov","boussole":"kompas","jumelles":"dalekohled","feu de camp":"táborák",
"fouet":"metlička","louche":"naběračka","passoire":"cedník","râpe":"struhadlo","entonnoir":"trychtýř","couvercle":"poklička","bouchon":"zátka","tire-bouchon":"vývrtka","glaçon":"kostka ledu","paille":"brčko",
"plombier":"instalatér","électricien":"elektrikář","menuisier":"truhlář","bijoutier":"klenotník","vétérinaire":"veterinář","pêcheur":"rybář","chauffeur":"řidič","fleuriste":"květinář",
"orchestre":"orchestr","violon":"housle","flûte":"flétna","trompette":"trumpeta","mélodie":"melodie","rythme":"rytmus","chorale":"sbor","tambour":"buben",
"volcan":"sopka","inondation":"povodeň","tremblement de terre":"zemětřesení","avalanche":"lavina","canicule":"vedro","continent":"kontinent",
"étonnant":"překvapivý","effrayant":"děsivý","passionnant":"fascinující","émouvant":"dojemný","précieux":"cenný","semblable":"podobný","épuisant":"vyčerpávající","décevant":"neuspokojivý","indispensable":"nezbytný","disponible":"dostupný","provisoire":"dočasný",
"détruire":"ničit","creuser":"kopat","vider":"vyprazdňovat","verrouiller":"zamykat","brancher":"zapojovat","débrancher":"odpojovat","appuyer":"mačkat","secouer":"třást","frotter":"třít","essuyer":"utírat","plonger":"potápět se","ramer":"veslovat",
"autrefois":"dříve","récemment":"nedávno","désormais":"od nynějška","auparavant":"předtím","à l'avenir":"v budoucnu","aussitôt":"okamžitě","tout à coup":"najednou","dès que":"jakmile"
},
zh:{
"camping":"露营","tente":"帐篷","sac de couchage":"睡袋","lampe de poche":"手电筒","hamac":"吊床","randonnée":"徒步旅行","chasse":"打猎","boussole":"指南针","jumelles":"双筒望远镜","feu de camp":"篝火",
"fouet":"打蛋器","louche":"汤勺","passoire":"滤网","râpe":"擦丝器","entonnoir":"漏斗","couvercle":"盖子","bouchon":"瓶塞","tire-bouchon":"开瓶器","glaçon":"冰块","paille":"吸管",
"plombier":"水管工","électricien":"电工","menuisier":"木匠","bijoutier":"珠宝商","vétérinaire":"兽医","pêcheur":"渔夫","chauffeur":"司机","fleuriste":"花店老板",
"orchestre":"管弦乐队","violon":"小提琴","flûte":"长笛","trompette":"小号","mélodie":"旋律","rythme":"节奏","chorale":"合唱团","tambour":"鼓",
"volcan":"火山","inondation":"洪水","tremblement de terre":"地震","avalanche":"雪崩","canicule":"热浪","continent":"大陆",
"étonnant":"令人惊讶的","effrayant":"吓人的","passionnant":"引人入胜的","émouvant":"感人的","précieux":"珍贵的","semblable":"相似的","épuisant":"累人的","décevant":"令人失望的","indispensable":"必不可少的","disponible":"可用的","provisoire":"临时的",
"détruire":"摧毁","creuser":"挖","vider":"倒空","verrouiller":"锁上","brancher":"插上","débrancher":"拔掉","appuyer":"按","secouer":"摇晃","frotter":"搓","essuyer":"擦","plonger":"潜水","ramer":"划船",
"autrefois":"从前","récemment":"最近","désormais":"从今以后","auparavant":"之前","à l'avenir":"将来","aussitôt":"立刻","tout à coup":"突然","dès que":"一到就"
},
ja:{
"camping":"キャンプ","tente":"テント","sac de couchage":"寝袋","lampe de poche":"懐中電灯","hamac":"ハンモック","randonnée":"ハイキング","chasse":"狩り","boussole":"コンパス","jumelles":"双眼鏡","feu de camp":"たき火",
"fouet":"泡立て器","louche":"おたま","passoire":"ざる","râpe":"おろし金","entonnoir":"じょうご","couvercle":"ふた","bouchon":"栓","tire-bouchon":"コルク抜き","glaçon":"氷","paille":"ストロー",
"plombier":"配管工","électricien":"電気技師","menuisier":"大工","bijoutier":"宝石商","vétérinaire":"獣医","pêcheur":"漁師","chauffeur":"運転手","fleuriste":"花屋",
"orchestre":"オーケストラ","violon":"バイオリン","flûte":"フルート","trompette":"トランペット","mélodie":"メロディー","rythme":"リズム","chorale":"合唱団","tambour":"太鼓",
"volcan":"火山","inondation":"洪水","tremblement de terre":"地震","avalanche":"雪崩","canicule":"猛暑","continent":"大陸",
"étonnant":"驚くべき","effrayant":"恐ろしい","passionnant":"わくわくする","émouvant":"感動的な","précieux":"貴重な","semblable":"似ている","épuisant":"疲れる","décevant":"がっかりする","indispensable":"不可欠な","disponible":"利用できる","provisoire":"一時的な",
"détruire":"破壊します","creuser":"掘ります","vider":"空にします","verrouiller":"鍵をかけます","brancher":"つなぎます","débrancher":"抜きます","appuyer":"押さえます","secouer":"振ります","frotter":"こすります","essuyer":"拭きます","plonger":"潜ります","ramer":"漕ぎます",
"autrefois":"昔","récemment":"最近","désormais":"これから","auparavant":"以前に","à l'avenir":"将来は","aussitôt":"ただちに","tout à coup":"突然","dès que":"〜するとすぐに"
},
ko:{
"camping":"캠핑","tente":"텐트","sac de couchage":"침낭","lampe de poche":"손전등","hamac":"해먹","randonnée":"하이킹","chasse":"사냥","boussole":"나침반","jumelles":"쌍안경","feu de camp":"모닥불",
"fouet":"거품기","louche":"국자","passoire":"체","râpe":"강판","entonnoir":"깔때기","couvercle":"뚜껑","bouchon":"병마개","tire-bouchon":"코르크 따개","glaçon":"얼음","paille":"빨대",
"plombier":"배관공","électricien":"전기공","menuisier":"목수","bijoutier":"보석상","vétérinaire":"수의사","pêcheur":"어부","chauffeur":"운전사","fleuriste":"플로리스트",
"orchestre":"오케스트라","violon":"바이올린","flûte":"플루트","trompette":"트럼펫","mélodie":"멜로디","rythme":"리듬","chorale":"합창단","tambour":"북",
"volcan":"화산","inondation":"홍수","tremblement de terre":"지진","avalanche":"눈사태","canicule":"폭염","continent":"대륙",
"étonnant":"놀라운","effrayant":"소름 끼치는","passionnant":"흥미진진한","émouvant":"감동적인","précieux":"귀중한","semblable":"비슷한","épuisant":"지치게 하는","décevant":"실망스러운","indispensable":"필수적인","disponible":"이용 가능한","provisoire":"임시의",
"détruire":"파괴하다","creuser":"파다","vider":"비우다","verrouiller":"잠그다","brancher":"꽂다","débrancher":"뽑다","appuyer":"누르다","secouer":"흔들다","frotter":"문지르다","essuyer":"닦다","plonger":"잠수하다","ramer":"노를 젓다",
"autrefois":"옛날에","récemment":"최근에","désormais":"이제부터","auparavant":"이전에","à l'avenir":"앞으로","aussitôt":"즉시","tout à coup":"갑자기","dès que":"하자마자"
},
ar:{
"camping":"تخييم","tente":"خيمة","sac de couchage":"كيس نوم","lampe de poche":"مصباح يدوي","hamac":"أرجوحة شبكية","randonnée":"رحلة مشي","chasse":"صيد","boussole":"بوصلة","jumelles":"منظار","feu de camp":"نار المخيم",
"fouet":"مضرب بيض","louche":"مغرفة","passoire":"مصفاة","râpe":"مبشرة","entonnoir":"قمع","couvercle":"غطاء","bouchon":"سدادة","tire-bouchon":"بريمة","glaçon":"مكعب ثلج","paille":"شفاطة",
"plombier":"سباك","électricien":"كهربائي","menuisier":"نجار","bijoutier":"صائغ","vétérinaire":"طبيب بيطري","pêcheur":"صياد سمك","chauffeur":"سائق","fleuriste":"بائع زهور",
"orchestre":"أوركسترا","violon":"كمان","flûte":"فلوت","trompette":"بوق موسيقي","mélodie":"لحن","rythme":"إيقاع","chorale":"جوقة","tambour":"طبل",
"volcan":"بركان","inondation":"فيضان","tremblement de terre":"زلزال","avalanche":"انهيار ثلجي","canicule":"موجة حر","continent":"قارة",
"étonnant":"مدهش","effrayant":"مخيف","passionnant":"شيق","émouvant":"مؤثر","précieux":"ثمين","semblable":"مشابه","épuisant":"مرهق","décevant":"مخيب للآمال","indispensable":"لا غنى عنه","disponible":"متاح","provisoire":"مؤقت",
"détruire":"يدمر","creuser":"يحفر","vider":"يفرغ","verrouiller":"يقفل","brancher":"يوصل","débrancher":"ينزع القابس","appuyer":"يضغط","secouer":"يهز","frotter":"يفرك","essuyer":"يمسح","plonger":"يغوص","ramer":"يجدف",
"autrefois":"قديمًا","récemment":"مؤخرًا","désormais":"من الآن فصاعدًا","auparavant":"سابقًا","à l'avenir":"في المستقبل","aussitôt":"حالاً","tout à coup":"فجأة","dès que":"بمجرد أن"
}
};
LANGS2.forEach(function(l){ var p2=LEX2P[l]||{}; Object.keys(p2).forEach(function(k){ LEX2[l][k]=p2[k]; }); });
/* ── Vague 17 nouvelles langues (v2.87) : unités 129-136 — expressions du quotidien,
   l'économie, la vie citoyenne, protéger la planète, les grandes idées, la littérature,
   verbes de haut niveau, la santé approfondie. Anti-collisions vérifiées : taxe ≠ impôt
   partout (pl opłata, ru сбор, uk збір, cs poplatek, zh 税费, ja 課税, ko 조세, ar رسوم) ;
   en route ≠ départ (zh 走吧, ja さあ 行こう, ko 갑시다) ; exiger ≠ réclamer (ru
   настаивать, uk наполягати, zh 强烈要求, ja 求めます, ko 강요하다, ar يشترط) ;
   persuader ≠ convaincre (pl namawiać, ru уговаривать, cs přemlouvat, ja 説き伏せます) ;
   renoncer=zrzekać się (rezygnować=démissionner) ; traduction zh=译文 (翻译=traduire) ;
   soupçon zh=嫌疑 (怀疑=douter) ; ar poésie=فن الشعر (شعر=cheveux), librairie=متجر كتب
   (مكتبة=bibliothèque), symptôme=أعراض (عرض=promotion), sous-titres=ترجمة الشاشة
   (ترجمة=traduction). Homographe réel assumé : ko 시장 = marché ET maire (sijang,
   le classique coréen, pas d'alternative). */
var LEX2Q = {
pl:{
"bon courage":"powodzenia","tant pis":"trudno","tant mieux":"tym lepiej","ça m'est égal":"wszystko mi jedno","bonne chance pour ton examen":"powodzenia na egzaminie","je croise les doigts":"trzymam kciuki","pas de souci":"żaden problem","quel dommage":"jaka szkoda","à ta santé":"na zdrowie","en route":"w drogę","au secours":"ratunku","en cas d'urgence, appelez la police":"w nagłym wypadku dzwoń na policję",
"bénéfice":"zysk","perte":"strata","budget":"budżet","taxe":"opłata","chiffre d'affaires":"obroty","bilan":"bilans","investir":"inwestować","croissance":"wzrost","concurrence":"konkurencja","fournisseur":"dostawca","actionnaire":"akcjonariusz","crise":"kryzys","faillite":"bankructwo","endettement":"zadłużenie","négocier":"negocjować",
"citoyen":"obywatel","démocratie":"demokracja","vote":"głosowanie","campagne électorale":"kampania wyborcza","débat":"debata","discours politique":"przemówienie polityczne","ministre":"minister","maire":"burmistrz","député":"poseł","syndicat":"związek zawodowy","égalité":"równość","injustice":"niesprawiedliwość","manifestation":"manifestacja","grève":"strajk",
"pétrole":"ropa","panneau solaire":"panel słoneczny","éolienne":"turbina wiatrowa","centrale nucléaire":"elektrownia jądrowa","empreinte carbone":"ślad węglowy","recyclage":"recykling","trier":"segregować","gaspiller":"marnować","ordures":"odpady","il vaut mieux prévenir que guérir":"lepiej zapobiegać niż leczyć","réchauffement":"globalne ocieplenie","biodiversité":"bioróżnorodność","déforestation":"wylesianie","couche d'ozone":"warstwa ozonowa","espèce menacée":"gatunek zagrożony",
"courage":"odwaga","patience":"cierpliwość","sagesse":"mądrość","volonté":"wola","conscience":"sumienie","sincérité":"szczerość","désespoir":"rozpacz","folie":"szaleństwo","doute":"wątpliwość","humiliation":"upokorzenie","orgueil":"pycha","remords":"wyrzuty sumienia","fierté":"duma","destin":"przeznaczenie","hasard":"przypadek","soupçon":"podejrzenie",
"roman":"powieść","chapitre":"rozdział","personnage":"postać","intrigue":"fabuła","dénouement":"zakończenie","récit":"opowieść","poème":"wiersz","poésie":"poezja","conte":"baśń","traduction":"tłumaczenie","éditeur":"wydawca","librairie":"księgarnia","publier":"publikować","sous-titres":"napisy",
"accomplir":"dokonywać","entreprendre":"podejmować się","aboutir":"dochodzić do skutku","renoncer":"zrzekać się","surmonter":"pokonywać","tu peux compter sur moi":"możesz na mnie liczyć","envisager":"rozważać","constater":"stwierdzać","souligner":"podkreślać","prétendre":"twierdzić","admettre":"przyznawać","exiger":"wymagać","négliger":"zaniedbywać","aborder":"poruszać","persuader":"namawiać","ça n'a rien à voir":"to nie ma nic do rzeczy",
"consultation":"konsultacja","symptôme":"objaw","diagnostic":"diagnoza","traitement":"leczenie","allergie":"alergia","vaccination":"szczepienie","immunité":"odporność","microbe":"zarazek","contagieux":"zaraźliwy","régime":"dieta","vitamines":"witaminy","épidémie":"epidemia","guérison":"wyzdrowienie","rechute":"nawrót"
},
ru:{
"bon courage":"держись","tant pis":"ну и ладно","tant mieux":"тем лучше","ça m'est égal":"мне всё равно","bonne chance pour ton examen":"удачи на экзамене","je croise les doigts":"держу за тебя кулачки","pas de souci":"без проблем","quel dommage":"как жаль","à ta santé":"за твоё здоровье","en route":"в путь","au secours":"на помощь","en cas d'urgence, appelez la police":"в экстренном случае звоните в полицию",
"bénéfice":"прибыль","perte":"убыток","budget":"бюджет","taxe":"сбор","chiffre d'affaires":"оборот","bilan":"баланс","investir":"инвестировать","croissance":"рост","concurrence":"конкуренция","fournisseur":"поставщик","actionnaire":"акционер","crise":"кризис","faillite":"банкротство","endettement":"задолженность","négocier":"вести переговоры",
"citoyen":"гражданин","démocratie":"демократия","vote":"голосование","campagne électorale":"предвыборная кампания","débat":"дебаты","discours politique":"политическая речь","ministre":"министр","maire":"мэр","député":"депутат","syndicat":"профсоюз","égalité":"равенство","injustice":"несправедливость","manifestation":"демонстрация","grève":"забастовка",
"pétrole":"нефть","panneau solaire":"солнечная панель","éolienne":"ветряк","centrale nucléaire":"атомная станция","empreinte carbone":"углеродный след","recyclage":"переработка","trier":"сортировать","gaspiller":"тратить впустую","ordures":"отходы","il vaut mieux prévenir que guérir":"лучше предупредить, чем лечить","réchauffement":"глобальное потепление","biodiversité":"биоразнообразие","déforestation":"вырубка лесов","couche d'ozone":"озоновый слой","espèce menacée":"вымирающий вид",
"courage":"смелость","patience":"терпение","sagesse":"мудрость","volonté":"воля","conscience":"совесть","sincérité":"искренность","désespoir":"отчаяние","folie":"безумие","doute":"сомнение","humiliation":"унижение","orgueil":"гордыня","remords":"угрызения совести","fierté":"гордость","destin":"судьба","hasard":"случайность","soupçon":"подозрение",
"roman":"роман","chapitre":"глава","personnage":"персонаж","intrigue":"сюжет","dénouement":"развязка","récit":"рассказ","poème":"стихотворение","poésie":"поэзия","conte":"сказка","traduction":"перевод","éditeur":"издатель","librairie":"книжный магазин","publier":"публиковать","sous-titres":"субтитры",
"accomplir":"совершать","entreprendre":"предпринимать","aboutir":"приводить к результату","renoncer":"отказываться","surmonter":"преодолевать","tu peux compter sur moi":"можешь на меня рассчитывать","envisager":"рассматривать","constater":"констатировать","souligner":"подчёркивать","prétendre":"утверждать","admettre":"допускать","exiger":"настаивать","négliger":"пренебрегать","aborder":"затрагивать","persuader":"уговаривать","ça n'a rien à voir":"это тут ни при чём",
"consultation":"консультация","symptôme":"симптом","diagnostic":"диагноз","traitement":"лечение","allergie":"аллергия","vaccination":"вакцинация","immunité":"иммунитет","microbe":"микроб","contagieux":"заразный","régime":"диета","vitamines":"витамины","épidémie":"эпидемия","guérison":"выздоровление","rechute":"рецидив"
},
uk:{
"bon courage":"тримайся","tant pis":"нічого не вдієш","tant mieux":"тим краще","ça m'est égal":"мені байдуже","bonne chance pour ton examen":"удачі на іспиті","je croise les doigts":"тримаю кулачки","pas de souci":"без проблем","quel dommage":"як шкода","à ta santé":"будьмо","en route":"в дорогу","au secours":"рятуйте","en cas d'urgence, appelez la police":"у надзвичайній ситуації телефонуйте в поліцію",
"bénéfice":"прибуток","perte":"збиток","budget":"бюджет","taxe":"збір","chiffre d'affaires":"оборот","bilan":"баланс","investir":"інвестувати","croissance":"зростання","concurrence":"конкуренція","fournisseur":"постачальник","actionnaire":"акціонер","crise":"криза","faillite":"банкрутство","endettement":"заборгованість","négocier":"вести переговори",
"citoyen":"громадянин","démocratie":"демократія","vote":"голосування","campagne électorale":"виборча кампанія","débat":"дебати","discours politique":"політична промова","ministre":"міністр","maire":"мер","député":"депутат","syndicat":"профспілка","égalité":"рівність","injustice":"несправедливість","manifestation":"демонстрація","grève":"страйк",
"pétrole":"нафта","panneau solaire":"сонячна панель","éolienne":"вітряк","centrale nucléaire":"атомна станція","empreinte carbone":"вуглецевий слід","recyclage":"переробка","trier":"сортувати","gaspiller":"марнувати","ordures":"відходи","il vaut mieux prévenir que guérir":"краще запобігти, ніж лікувати","réchauffement":"глобальне потепління","biodiversité":"біорізноманіття","déforestation":"вирубка лісів","couche d'ozone":"озоновий шар","espèce menacée":"зникаючий вид",
"courage":"сміливість","patience":"терпіння","sagesse":"мудрість","volonté":"воля","conscience":"сумління","sincérité":"щирість","désespoir":"відчай","folie":"божевілля","doute":"сумнів","humiliation":"приниження","orgueil":"гординя","remords":"докори сумління","fierté":"гордість","destin":"доля","hasard":"випадковість","soupçon":"підозра",
"roman":"роман","chapitre":"розділ","personnage":"персонаж","intrigue":"сюжет","dénouement":"розв'язка","récit":"оповідання","poème":"вірш","poésie":"поезія","conte":"казка","traduction":"переклад","éditeur":"видавець","librairie":"книгарня","publier":"публікувати","sous-titres":"субтитри",
"accomplir":"здійснювати","entreprendre":"розпочинати","aboutir":"завершуватися успішно","renoncer":"відмовлятися","surmonter":"долати","tu peux compter sur moi":"можеш на мене розраховувати","envisager":"розглядати","constater":"констатувати","souligner":"підкреслювати","prétendre":"стверджувати","admettre":"визнавати","exiger":"наполягати","négliger":"нехтувати","aborder":"зачіпати","persuader":"умовляти","ça n'a rien à voir":"це тут ні до чого",
"consultation":"консультація","symptôme":"симптом","diagnostic":"діагноз","traitement":"лікування","allergie":"алергія","vaccination":"вакцинація","immunité":"імунітет","microbe":"мікроб","contagieux":"заразний","régime":"дієта","vitamines":"вітаміни","épidémie":"епідемія","guérison":"одужання","rechute":"рецидив"
},
cs:{
"bon courage":"drž se","tant pis":"co se dá dělat","tant mieux":"tím lépe","ça m'est égal":"je mi to jedno","bonne chance pour ton examen":"hodně štěstí u zkoušky","je croise les doigts":"držím ti palce","pas de souci":"v pohodě","quel dommage":"to je škoda","à ta santé":"na zdraví","en route":"vyrážíme","au secours":"pomozte mi","en cas d'urgence, appelez la police":"v případě nouze volejte policii",
"bénéfice":"zisk","perte":"ztráta","budget":"rozpočet","taxe":"poplatek","chiffre d'affaires":"obrat","bilan":"bilance","investir":"investovat","croissance":"růst","concurrence":"konkurence","fournisseur":"dodavatel","actionnaire":"akcionář","crise":"krize","faillite":"bankrot","endettement":"zadlužení","négocier":"vyjednávat",
"citoyen":"občan","démocratie":"demokracie","vote":"hlasování","campagne électorale":"volební kampaň","débat":"debata","discours politique":"politický projev","ministre":"ministr","maire":"starosta","député":"poslanec","syndicat":"odbory","égalité":"rovnost","injustice":"nespravedlnost","manifestation":"demonstrace","grève":"stávka",
"pétrole":"ropa","panneau solaire":"solární panel","éolienne":"větrná turbína","centrale nucléaire":"jaderná elektrárna","empreinte carbone":"uhlíková stopa","recyclage":"recyklace","trier":"třídit","gaspiller":"plýtvat","ordures":"odpad","il vaut mieux prévenir que guérir":"lepší předcházet než léčit","réchauffement":"globální oteplování","biodiversité":"biodiverzita","déforestation":"odlesňování","couche d'ozone":"ozonová vrstva","espèce menacée":"ohrožený druh",
"courage":"odvaha","patience":"trpělivost","sagesse":"moudrost","volonté":"vůle","conscience":"svědomí","sincérité":"upřímnost","désespoir":"zoufalství","folie":"šílenství","doute":"pochybnost","humiliation":"ponížení","orgueil":"pýcha","remords":"výčitky svědomí","fierté":"hrdost","destin":"osud","hasard":"náhoda","soupçon":"podezření",
"roman":"román","chapitre":"kapitola","personnage":"postava","intrigue":"zápletka","dénouement":"rozuzlení","récit":"vyprávění","poème":"báseň","poésie":"poezie","conte":"pohádka","traduction":"překlad","éditeur":"nakladatel","librairie":"knihkupectví","publier":"publikovat","sous-titres":"titulky",
"accomplir":"uskutečňovat","entreprendre":"podnikat","aboutir":"dospět k výsledku","renoncer":"vzdávat se","surmonter":"překonávat","tu peux compter sur moi":"můžeš se na mě spolehnout","envisager":"zvažovat","constater":"konstatovat","souligner":"zdůrazňovat","prétendre":"tvrdit","admettre":"připouštět","exiger":"vyžadovat","négliger":"zanedbávat","aborder":"zabývat se","persuader":"přemlouvat","ça n'a rien à voir":"to s tím nesouvisí",
"consultation":"konzultace","symptôme":"příznak","diagnostic":"diagnóza","traitement":"léčba","allergie":"alergie","vaccination":"očkování","immunité":"imunita","microbe":"mikrob","contagieux":"nakažlivý","régime":"dieta","vitamines":"vitamíny","épidémie":"epidemie","guérison":"uzdravení","rechute":"recidiva"
},
zh:{
"bon courage":"加油","tant pis":"没办法","tant mieux":"那更好","ça m'est égal":"我 无所谓","bonne chance pour ton examen":"祝 你 考试 顺利","je croise les doigts":"祝 你 好运","pas de souci":"没问题","quel dommage":"真 可惜","à ta santé":"干杯","en route":"走吧","au secours":"救命","en cas d'urgence, appelez la police":"紧急 情况 请 打电话 给 警察",
"bénéfice":"利润","perte":"亏损","budget":"预算","taxe":"税费","chiffre d'affaires":"营业额","bilan":"财报","investir":"投资","croissance":"增长","concurrence":"竞争","fournisseur":"供应商","actionnaire":"股东","crise":"危机","faillite":"破产","endettement":"负债","négocier":"谈判",
"citoyen":"公民","démocratie":"民主","vote":"投票","campagne électorale":"竞选活动","débat":"辩论","discours politique":"政治演讲","ministre":"部长","maire":"市长","député":"议员","syndicat":"工会","égalité":"平等","injustice":"不公正","manifestation":"游行","grève":"罢工",
"pétrole":"石油","panneau solaire":"太阳能板","éolienne":"风力发电机","centrale nucléaire":"核电站","empreinte carbone":"碳足迹","recyclage":"回收利用","trier":"分类","gaspiller":"浪费","ordures":"废物","il vaut mieux prévenir que guérir":"预防 胜于 治疗","réchauffement":"全球变暖","biodiversité":"生物多样性","déforestation":"森林砍伐","couche d'ozone":"臭氧层","espèce menacée":"濒危物种",
"courage":"勇气","patience":"耐心","sagesse":"智慧","volonté":"意志","conscience":"良心","sincérité":"真诚","désespoir":"绝望","folie":"疯狂","doute":"疑虑","humiliation":"羞辱","orgueil":"傲慢","remords":"悔恨","fierté":"自豪","destin":"命运","hasard":"偶然","soupçon":"嫌疑",
"roman":"小说","chapitre":"章节","personnage":"角色","intrigue":"情节","dénouement":"结局","récit":"叙述","poème":"诗","poésie":"诗歌","conte":"童话","traduction":"译文","éditeur":"出版商","librairie":"书店","publier":"出版","sous-titres":"字幕",
"accomplir":"完成","entreprendre":"着手","aboutir":"达成","renoncer":"放弃","surmonter":"克服","tu peux compter sur moi":"你 可以 依靠 我","envisager":"考虑","constater":"察觉","souligner":"强调","prétendre":"声称","admettre":"认可","exiger":"强烈要求","négliger":"忽视","aborder":"谈到","persuader":"劝说","ça n'a rien à voir":"这 完全 是 两回事",
"consultation":"就诊","symptôme":"症状","diagnostic":"诊断","traitement":"治疗","allergie":"过敏","vaccination":"接种","immunité":"免疫力","microbe":"病菌","contagieux":"传染的","régime":"节食","vitamines":"维生素","épidémie":"流行病","guérison":"痊愈","rechute":"复发"
},
ja:{
"bon courage":"頑張って","tant pis":"仕方ない","tant mieux":"それは よかった","ça m'est égal":"どちらでも いい です","bonne chance pour ton examen":"試験 頑張って ね","je croise les doigts":"幸運 を 祈ります","pas de souci":"問題ありません","quel dommage":"残念 です","à ta santé":"乾杯","en route":"さあ 行こう","au secours":"助けて","en cas d'urgence, appelez la police":"緊急 の 場合 は 警察 に 電話 して ください",
"bénéfice":"利益","perte":"損失","budget":"予算","taxe":"課税","chiffre d'affaires":"売上高","bilan":"決算","investir":"投資します","croissance":"成長","concurrence":"競争","fournisseur":"サプライヤー","actionnaire":"株主","crise":"危機","faillite":"倒産","endettement":"負債","négocier":"交渉します",
"citoyen":"市民","démocratie":"民主主義","vote":"投票","campagne électorale":"選挙運動","débat":"討論","discours politique":"政治演説","ministre":"大臣","maire":"市長","député":"議員","syndicat":"労働組合","égalité":"平等","injustice":"不公平","manifestation":"デモ","grève":"ストライキ",
"pétrole":"石油","panneau solaire":"ソーラーパネル","éolienne":"風力タービン","centrale nucléaire":"原子力発電所","empreinte carbone":"カーボンフットプリント","recyclage":"リサイクル","trier":"分別します","gaspiller":"無駄にします","ordures":"廃棄物","il vaut mieux prévenir que guérir":"予防 は 治療 に 勝る","réchauffement":"温暖化","biodiversité":"生物多様性","déforestation":"森林伐採","couche d'ozone":"オゾン層","espèce menacée":"絶滅危惧種",
"courage":"勇気","patience":"忍耐","sagesse":"知恵","volonté":"意志","conscience":"良心","sincérité":"誠実さ","désespoir":"絶望","folie":"狂気","doute":"疑い","humiliation":"屈辱","orgueil":"高慢","remords":"良心の呵責","fierté":"誇り","destin":"運命","hasard":"偶然","soupçon":"疑惑",
"roman":"小説","chapitre":"章","personnage":"登場人物","intrigue":"筋書き","dénouement":"結末","récit":"語り","poème":"詩","poésie":"詩歌","conte":"おとぎ話","traduction":"翻訳","éditeur":"出版社","librairie":"本屋","publier":"出版します","sous-titres":"字幕",
"accomplir":"成し遂げます","entreprendre":"着手します","aboutir":"実を結びます","renoncer":"諦めます","surmonter":"乗り越えます","tu peux compter sur moi":"私 に 任せて ください","envisager":"検討します","constater":"確認します","souligner":"強調します","prétendre":"主張します","admettre":"認めます","exiger":"求めます","négliger":"おろそかにします","aborder":"取り上げます","persuader":"説き伏せます","ça n'a rien à voir":"それ は 関係 ありません",
"consultation":"診察","symptôme":"症状","diagnostic":"診断","traitement":"治療","allergie":"アレルギー","vaccination":"予防接種","immunité":"免疫","microbe":"病原菌","contagieux":"伝染性の","régime":"ダイエット","vitamines":"ビタミン","épidémie":"伝染病","guérison":"回復","rechute":"再発"
},
ko:{
"bon courage":"힘내세요","tant pis":"어쩔 수 없죠","tant mieux":"잘됐네요","ça m'est égal":"상관없어요","bonne chance pour ton examen":"시험 잘 봐요","je croise les doigts":"행운을 빌게요","pas de souci":"문제없어요","quel dommage":"아쉽네요","à ta santé":"건배","en route":"갑시다","au secours":"살려주세요","en cas d'urgence, appelez la police":"긴급 상황에는 경찰에 전화하세요",
"bénéfice":"이익","perte":"손실","budget":"예산","taxe":"조세","chiffre d'affaires":"매출","bilan":"결산","investir":"투자하다","croissance":"성장","concurrence":"경쟁","fournisseur":"공급업체","actionnaire":"주주","crise":"위기","faillite":"파산","endettement":"부채","négocier":"협상하다",
"citoyen":"시민","démocratie":"민주주의","vote":"투표","campagne électorale":"선거 운동","débat":"논쟁","discours politique":"정치 연설","ministre":"장관","maire":"시장","député":"국회의원","syndicat":"노동조합","égalité":"평등","injustice":"불의","manifestation":"시위","grève":"파업",
"pétrole":"석유","panneau solaire":"태양광 패널","éolienne":"풍력 터빈","centrale nucléaire":"원자력 발전소","empreinte carbone":"탄소 발자국","recyclage":"재활용","trier":"분류하다","gaspiller":"낭비하다","ordures":"폐기물","il vaut mieux prévenir que guérir":"예방이 치료보다 낫다","réchauffement":"지구 온난화","biodiversité":"생물 다양성","déforestation":"삼림 벌채","couche d'ozone":"오존층","espèce menacée":"멸종 위기종",
"courage":"용기","patience":"인내","sagesse":"지혜","volonté":"의지","conscience":"양심","sincérité":"진심","désespoir":"절망","folie":"광기","doute":"의심","humiliation":"굴욕","orgueil":"오만","remords":"양심의 가책","fierté":"자부심","destin":"운명","hasard":"우연","soupçon":"의혹",
"roman":"소설","chapitre":"챕터","personnage":"등장인물","intrigue":"줄거리","dénouement":"결말","récit":"서사","poème":"시","poésie":"시문학","conte":"동화","traduction":"번역","éditeur":"출판사","librairie":"서점","publier":"출판하다","sous-titres":"자막",
"accomplir":"이루다","entreprendre":"착수하다","aboutir":"결실을 맺다","renoncer":"포기하다","surmonter":"극복하다","tu peux compter sur moi":"나한테 맡겨도 돼요","envisager":"검토하다","constater":"확인하다","souligner":"강조하다","prétendre":"주장하다","admettre":"받아들이다","exiger":"강요하다","négliger":"소홀히 하다","aborder":"다루다","persuader":"납득시키다","ça n'a rien à voir":"그거랑은 상관없어요",
"consultation":"진료","symptôme":"증상","diagnostic":"진단","traitement":"치료","allergie":"알레르기","vaccination":"예방 접종","immunité":"면역","microbe":"세균","contagieux":"전염성의","régime":"다이어트","vitamines":"비타민","épidémie":"전염병","guérison":"회복","rechute":"재발"
},
ar:{
"bon courage":"بالتوفيق","tant pis":"فليكن","tant mieux":"هذا أفضل","ça m'est égal":"لا يهمني","bonne chance pour ton examen":"حظًا موفقًا في امتحانك","je croise les doigts":"سأدعو لك","pas de souci":"لا مشكلة","quel dommage":"يا للأسف","à ta santé":"في صحتك","en route":"هيا بنا","au secours":"النجدة","en cas d'urgence, appelez la police":"في حالة الطوارئ اتصل بالشرطة",
"bénéfice":"ربح","perte":"خسارة","budget":"ميزانية","taxe":"رسوم","chiffre d'affaires":"رقم الأعمال","bilan":"ميزانية عمومية","investir":"يستثمر","croissance":"نمو","concurrence":"منافسة","fournisseur":"مورد","actionnaire":"مساهم","crise":"أزمة","faillite":"إفلاس","endettement":"مديونية","négocier":"يفاوض",
"citoyen":"مواطن","démocratie":"ديمقراطية","vote":"تصويت","campagne électorale":"حملة انتخابية","débat":"مناظرة","discours politique":"خطاب سياسي","ministre":"وزير","maire":"عمدة","député":"نائب","syndicat":"نقابة","égalité":"مساواة","injustice":"ظلم","manifestation":"مظاهرة","grève":"إضراب",
"pétrole":"نفط","panneau solaire":"لوح شمسي","éolienne":"توربين رياح","centrale nucléaire":"محطة نووية","empreinte carbone":"بصمة كربونية","recyclage":"إعادة تدوير","trier":"يفرز","gaspiller":"يهدر","ordures":"قمامة","il vaut mieux prévenir que guérir":"الوقاية خير من العلاج","réchauffement":"احتباس حراري","biodiversité":"تنوع بيولوجي","déforestation":"إزالة الغابات","couche d'ozone":"طبقة الأوزون","espèce menacée":"نوع مهدد بالانقراض",
"courage":"شجاعة","patience":"صبر","sagesse":"حكمة","volonté":"إرادة","conscience":"ضمير","sincérité":"إخلاص","désespoir":"يأس","folie":"جنون","doute":"شك","humiliation":"إذلال","orgueil":"كبرياء","remords":"ندم","fierté":"فخر","destin":"مصير","hasard":"مصادفة","soupçon":"اشتباه",
"roman":"رواية","chapitre":"فصل","personnage":"شخصية","intrigue":"حبكة","dénouement":"خاتمة","récit":"سرد","poème":"قصيدة","poésie":"فن الشعر","conte":"حكاية","traduction":"ترجمة","éditeur":"ناشر","librairie":"متجر كتب","publier":"ينشر","sous-titres":"ترجمة الشاشة",
"accomplir":"ينجز","entreprendre":"يباشر","aboutir":"يثمر","renoncer":"يتخلى عن","surmonter":"يتغلب على","tu peux compter sur moi":"يمكنك الاعتماد علي","envisager":"يفكر في","constater":"يلاحظ","souligner":"يؤكد على","prétendre":"يزعم","admettre":"يقر","exiger":"يشترط","négliger":"يهمل","aborder":"يتناول","persuader":"يستميل","ça n'a rien à voir":"لا علاقة له بالأمر",
"consultation":"استشارة","symptôme":"أعراض","diagnostic":"تشخيص","traitement":"علاج","allergie":"حساسية","vaccination":"تطعيم","immunité":"مناعة","microbe":"جرثومة","contagieux":"معدٍ","régime":"حمية","vitamines":"فيتامينات","épidémie":"وباء","guérison":"شفاء","rechute":"انتكاسة"
}
};
LANGS2.forEach(function(l){ var q2=LEX2Q[l]||{}; Object.keys(q2).forEach(function(k){ LEX2[l][k]=q2[k]; }); });
/* ── Vague 18 nouvelles langues (v2.88) : unités 137-144 — sentiments fins, caractères
   trempés, au bureau, les médias, à la banque, le numérique avancé, le grand chantier,
   enquête policière. Anti-collisions vérifiées : congé ≠ vacances (ru отгул, cs volno,
   ko 연차, ar إجازة) ; toiture ≠ toit (pl pokrycie dachu, ru кровля, cs střešní krytina,
   zh 屋面, ja 屋根材, ko 지붕재, ar تسقيف) ; taux pl=stopa procentowa (stopa=pied) ;
   échéance cs=lhůta (termín=rendez-vous) ; humble ≠ modeste (pl pokorny, ja 謙遜な,
   ko 겸허한, ar وديع) ; inquiétude ≠ inquiet/souci (zh 担忧, ja 懸念, ko 근심) ;
   objectif ar=غاية (هدف=but), témoignage ar=إفادة (شهادة=diplôme), indice ar=قرينة
   (دليل=preuve), virement ru=денежный перевод (перевод=traduction). */
var LEX2R = {
pl:{
"soulagement":"ulga","admiration":"podziw","enthousiasme":"entuzjazm","compassion":"współczucie","nostalgie":"nostalgia","inquiétude":"niepokój","angoisse":"trwoga","méfiance":"nieufność","frustration":"frustracja","j'en ai marre":"mam dość","mépris":"pogarda","gêne":"skrępowanie","indifférence":"obojętność",
"ambitieux":"ambitny","audacieux":"śmiały","loyal":"lojalny","perfectionniste":"perfekcjonista","insouciant":"beztroski","arrogant":"arogancki","humble":"pokorny","hypocrite":"hipokryta","rancunier":"pamiętliwy","indulgent":"pobłażliwy",
"ordre du jour":"porządek obrad","échéance":"termin","objectif":"cel","tâche":"zadanie","responsabilité":"odpowiedzialność","procès-verbal":"protokół","congé":"urlop","télétravail":"praca zdalna","démission":"dymisja","recrutement":"rekrutacja","entretien d'embauche":"rozmowa kwalifikacyjna","ce n'est pas la peine":"nie ma potrzeby",
"reportage":"reportaż","interview":"wywiad","gros titre":"nagłówek","rédaction":"redakcja","rumeur":"plotka","scandale":"skandal","censure":"cenzura","sondage":"sondaż",
"virement":"przelew","prélèvement":"polecenie zapłaty","intérêts":"odsetki","taux":"stopa procentowa","devise":"waluta","hypothèque":"hipoteka","livret d'épargne":"książeczka oszczędnościowa","chéquier":"książeczka czekowa","espèces":"gotówka","facture d'électricité":"rachunek za prąd",
"intelligence artificielle":"sztuczna inteligencja","données":"dane","logiciel":"oprogramowanie","matériel":"sprzęt","sauvegarde":"kopia zapasowa","mise à jour":"aktualizacja","piratage":"atak hakerski","virus informatique":"wirus komputerowy","écran tactile":"ekran dotykowy","objet connecté":"inteligentne urządzenie","réseau social":"media społecznościowe",
"gratte-ciel":"wieżowiec","béton":"beton","brique":"cegła","grue":"dźwig","échafaudage":"rusztowanie","fondations":"fundamenty","charpente":"więźba dachowa","façade":"fasada","toiture":"pokrycie dachu","permis de construire":"pozwolenie na budowę",
"enquête":"śledztwo","indice":"poszlaka","suspect":"podejrzany","témoignage":"zeznanie","empreintes digitales":"odciski palców","alibi":"alibi","cambriolage":"włamanie","agression":"napaść","escroquerie":"oszustwo","interrogatoire":"przesłuchanie","menottes":"kajdanki","rançon":"okup"
},
ru:{
"soulagement":"облегчение","admiration":"восхищение","enthousiasme":"энтузиазм","compassion":"сострадание","nostalgie":"ностальгия","inquiétude":"обеспокоенность","angoisse":"тревога","méfiance":"недоверие","frustration":"фрустрация","j'en ai marre":"мне надоело","mépris":"презрение","gêne":"смущение","indifférence":"безразличие",
"ambitieux":"амбициозный","audacieux":"дерзкий","loyal":"преданный","perfectionniste":"перфекционист","insouciant":"беззаботный","arrogant":"высокомерный","humble":"смиренный","hypocrite":"лицемер","rancunier":"злопамятный","indulgent":"снисходительный",
"ordre du jour":"повестка дня","échéance":"срок","objectif":"цель","tâche":"задача","responsabilité":"ответственность","procès-verbal":"протокол","congé":"отгул","télétravail":"удалённая работа","démission":"отставка","recrutement":"набор персонала","entretien d'embauche":"собеседование","ce n'est pas la peine":"не стоит",
"reportage":"репортаж","interview":"интервью","gros titre":"заголовок","rédaction":"редакция","rumeur":"слухи","scandale":"скандал","censure":"цензура","sondage":"опрос",
"virement":"денежный перевод","prélèvement":"автоплатёж","intérêts":"проценты","taux":"ставка","devise":"валюта","hypothèque":"ипотека","livret d'épargne":"сберегательный счёт","chéquier":"чековая книжка","espèces":"наличные","facture d'électricité":"счёт за электричество",
"intelligence artificielle":"искусственный интеллект","données":"данные","logiciel":"программное обеспечение","matériel":"оборудование","sauvegarde":"резервная копия","mise à jour":"обновление","piratage":"взлом","virus informatique":"компьютерный вирус","écran tactile":"сенсорный экран","objet connecté":"умное устройство","réseau social":"социальная сеть",
"gratte-ciel":"небоскрёб","béton":"бетон","brique":"кирпич","grue":"подъёмный кран","échafaudage":"строительные леса","fondations":"фундамент","charpente":"стропила","façade":"фасад","toiture":"кровля","permis de construire":"разрешение на строительство",
"enquête":"расследование","indice":"улика","suspect":"подозреваемый","témoignage":"показания","empreintes digitales":"отпечатки пальцев","alibi":"алиби","cambriolage":"кража со взломом","agression":"нападение","escroquerie":"мошенничество","interrogatoire":"допрос","menottes":"наручники","rançon":"выкуп"
},
uk:{
"soulagement":"полегшення","admiration":"захоплення","enthousiasme":"ентузіазм","compassion":"співчуття","nostalgie":"ностальгія","inquiétude":"занепокоєння","angoisse":"тривога","méfiance":"недовіра","frustration":"фрустрація","j'en ai marre":"мені набридло","mépris":"зневага","gêne":"збентеження","indifférence":"байдужість",
"ambitieux":"амбітний","audacieux":"зухвалий","loyal":"відданий","perfectionniste":"перфекціоніст","insouciant":"безтурботний","arrogant":"зарозумілий","humble":"смиренний","hypocrite":"лицемір","rancunier":"злопам'ятний","indulgent":"поблажливий",
"ordre du jour":"порядок денний","échéance":"термін","objectif":"мета","tâche":"завдання","responsabilité":"відповідальність","procès-verbal":"протокол","congé":"відгул","télétravail":"віддалена робота","démission":"відставка","recrutement":"набір персоналу","entretien d'embauche":"співбесіда","ce n'est pas la peine":"не варто",
"reportage":"репортаж","interview":"інтерв'ю","gros titre":"заголовок","rédaction":"редакція","rumeur":"чутки","scandale":"скандал","censure":"цензура","sondage":"опитування",
"virement":"переказ","prélèvement":"автоплатіж","intérêts":"відсотки","taux":"ставка","devise":"валюта","hypothèque":"іпотека","livret d'épargne":"ощадний рахунок","chéquier":"чекова книжка","espèces":"готівка","facture d'électricité":"рахунок за електрику",
"intelligence artificielle":"штучний інтелект","données":"дані","logiciel":"програмне забезпечення","matériel":"обладнання","sauvegarde":"резервна копія","mise à jour":"оновлення","piratage":"злам","virus informatique":"комп'ютерний вірус","écran tactile":"сенсорний екран","objet connecté":"розумний пристрій","réseau social":"соціальна мережа",
"gratte-ciel":"хмарочос","béton":"бетон","brique":"цегла","grue":"підйомний кран","échafaudage":"риштування","fondations":"фундамент","charpente":"крокви","façade":"фасад","toiture":"покрівля","permis de construire":"дозвіл на будівництво",
"enquête":"розслідування","indice":"зачіпка","suspect":"підозрюваний","témoignage":"свідчення","empreintes digitales":"відбитки пальців","alibi":"алібі","cambriolage":"крадіжка зі зламом","agression":"напад","escroquerie":"шахрайство","interrogatoire":"допит","menottes":"наручники","rançon":"викуп"
},
cs:{
"soulagement":"úleva","admiration":"obdiv","enthousiasme":"nadšení","compassion":"soucit","nostalgie":"nostalgie","inquiétude":"znepokojení","angoisse":"úzkost","méfiance":"nedůvěra","frustration":"frustrace","j'en ai marre":"mám toho dost","mépris":"pohrdání","gêne":"rozpaky","indifférence":"lhostejnost",
"ambitieux":"ambiciózní","audacieux":"smělý","loyal":"loajální","perfectionniste":"perfekcionista","insouciant":"bezstarostný","arrogant":"arogantní","humble":"pokorný","hypocrite":"pokrytec","rancunier":"mstivý","indulgent":"shovívavý",
"ordre du jour":"program jednání","échéance":"lhůta","objectif":"cíl","tâche":"úkol","responsabilité":"odpovědnost","procès-verbal":"zápis","congé":"volno","télétravail":"práce na dálku","démission":"rezignace","recrutement":"nábor","entretien d'embauche":"pracovní pohovor","ce n'est pas la peine":"není třeba",
"reportage":"reportáž","interview":"rozhovor","gros titre":"titulek","rédaction":"redakce","rumeur":"fáma","scandale":"skandál","censure":"cenzura","sondage":"průzkum",
"virement":"převod","prélèvement":"inkaso","intérêts":"úroky","taux":"sazba","devise":"měna","hypothèque":"hypotéka","livret d'épargne":"spořicí účet","chéquier":"šeková knížka","espèces":"hotovost","facture d'électricité":"účet za elektřinu",
"intelligence artificielle":"umělá inteligence","données":"data","logiciel":"software","matériel":"hardware","sauvegarde":"záloha","mise à jour":"aktualizace","piratage":"hackerský útok","virus informatique":"počítačový virus","écran tactile":"dotyková obrazovka","objet connecté":"chytré zařízení","réseau social":"sociální síť",
"gratte-ciel":"mrakodrap","béton":"beton","brique":"cihla","grue":"jeřáb","échafaudage":"lešení","fondations":"základy","charpente":"krov","façade":"fasáda","toiture":"střešní krytina","permis de construire":"stavební povolení",
"enquête":"vyšetřování","indice":"stopa","suspect":"podezřelý","témoignage":"svědectví","empreintes digitales":"otisky prstů","alibi":"alibi","cambriolage":"vloupání","agression":"napadení","escroquerie":"podvod","interrogatoire":"výslech","menottes":"pouta","rançon":"výkupné"
},
zh:{
"soulagement":"宽慰","admiration":"钦佩","enthousiasme":"热情","compassion":"同情","nostalgie":"怀旧","inquiétude":"担忧","angoisse":"焦虑","méfiance":"不信任","frustration":"挫败感","j'en ai marre":"我 受够了","mépris":"蔑视","gêne":"尴尬","indifférence":"冷漠",
"ambitieux":"有野心的","audacieux":"大胆的","loyal":"忠诚的","perfectionniste":"完美主义者","insouciant":"无忧无虑的","arrogant":"傲慢的","humble":"谦逊的","hypocrite":"伪君子","rancunier":"记仇的","indulgent":"宽容的",
"ordre du jour":"议程","échéance":"期限","objectif":"目标","tâche":"任务","responsabilité":"责任","procès-verbal":"会议记录","congé":"休假","télétravail":"远程办公","démission":"辞呈","recrutement":"招聘","entretien d'embauche":"面试","ce n'est pas la peine":"不必了",
"reportage":"专题报道","interview":"采访","gros titre":"头条","rédaction":"编辑部","rumeur":"谣言","scandale":"丑闻","censure":"审查","sondage":"民意调查",
"virement":"转账","prélèvement":"自动扣款","intérêts":"利息","taux":"利率","devise":"货币","hypothèque":"抵押贷款","livret d'épargne":"储蓄账户","chéquier":"支票簿","espèces":"现金","facture d'électricité":"电费单",
"intelligence artificielle":"人工智能","données":"数据","logiciel":"软件","matériel":"硬件","sauvegarde":"备份","mise à jour":"更新","piratage":"黑客攻击","virus informatique":"电脑病毒","écran tactile":"触摸屏","objet connecté":"智能设备","réseau social":"社交网络",
"gratte-ciel":"摩天大楼","béton":"混凝土","brique":"砖","grue":"起重机","échafaudage":"脚手架","fondations":"地基","charpente":"屋架","façade":"外墙","toiture":"屋面","permis de construire":"建筑许可证",
"enquête":"调查","indice":"线索","suspect":"嫌疑人","témoignage":"证词","empreintes digitales":"指纹","alibi":"不在场证明","cambriolage":"入室盗窃","agression":"袭击","escroquerie":"诈骗","interrogatoire":"审讯","menottes":"手铐","rançon":"赎金"
},
ja:{
"soulagement":"安堵","admiration":"賞賛","enthousiasme":"熱意","compassion":"同情","nostalgie":"郷愁","inquiétude":"懸念","angoisse":"不安","méfiance":"不信感","frustration":"フラストレーション","j'en ai marre":"もう うんざり です","mépris":"軽蔑","gêne":"気まずさ","indifférence":"無関心",
"ambitieux":"野心的な","audacieux":"大胆な","loyal":"忠実な","perfectionniste":"完璧主義者","insouciant":"のんきな","arrogant":"横柄な","humble":"謙遜な","hypocrite":"偽善者","rancunier":"執念深い","indulgent":"寛大な",
"ordre du jour":"議題","échéance":"締め切り","objectif":"目標","tâche":"タスク","responsabilité":"責任","procès-verbal":"議事録","congé":"有給休暇","télétravail":"テレワーク","démission":"辞職","recrutement":"採用","entretien d'embauche":"面接","ce n'est pas la peine":"その 必要 は ありません",
"reportage":"ルポ","interview":"インタビュー","gros titre":"見出し","rédaction":"編集部","rumeur":"噂","scandale":"スキャンダル","censure":"検閲","sondage":"世論調査",
"virement":"振り込み","prélèvement":"自動引き落とし","intérêts":"利子","taux":"金利","devise":"通貨","hypothèque":"住宅ローン","livret d'épargne":"貯金通帳","chéquier":"小切手帳","espèces":"現金","facture d'électricité":"電気代の請求書",
"intelligence artificielle":"人工知能","données":"データ","logiciel":"ソフトウェア","matériel":"ハードウェア","sauvegarde":"バックアップ","mise à jour":"アップデート","piratage":"ハッキング","virus informatique":"コンピューターウイルス","écran tactile":"タッチスクリーン","objet connecté":"スマート機器","réseau social":"SNS",
"gratte-ciel":"超高層ビル","béton":"コンクリート","brique":"レンガ","grue":"クレーン","échafaudage":"足場","fondations":"基礎","charpente":"骨組み","façade":"外壁","toiture":"屋根材","permis de construire":"建築許可",
"enquête":"捜査","indice":"手がかり","suspect":"容疑者","témoignage":"証言","empreintes digitales":"指紋","alibi":"アリバイ","cambriolage":"空き巣","agression":"暴行","escroquerie":"詐欺","interrogatoire":"尋問","menottes":"手錠","rançon":"身代金"
},
ko:{
"soulagement":"안도","admiration":"감탄","enthousiasme":"열정","compassion":"연민","nostalgie":"향수","inquiétude":"근심","angoisse":"불안","méfiance":"불신","frustration":"좌절감","j'en ai marre":"지긋지긋해요","mépris":"경멸","gêne":"어색함","indifférence":"무관심",
"ambitieux":"야심 찬","audacieux":"대담한","loyal":"충성스러운","perfectionniste":"완벽주의자","insouciant":"태평한","arrogant":"거만한","humble":"겸허한","hypocrite":"위선자","rancunier":"뒤끝 있는","indulgent":"관대한",
"ordre du jour":"안건","échéance":"마감","objectif":"목표","tâche":"업무","responsabilité":"책임","procès-verbal":"회의록","congé":"연차","télétravail":"재택근무","démission":"사직","recrutement":"채용","entretien d'embauche":"면접","ce n'est pas la peine":"그럴 필요 없어요",
"reportage":"르포","interview":"인터뷰","gros titre":"헤드라인","rédaction":"편집부","rumeur":"소문","scandale":"스캔들","censure":"검열","sondage":"여론 조사",
"virement":"계좌 이체","prélèvement":"자동 이체","intérêts":"이자","taux":"금리","devise":"화폐","hypothèque":"주택 담보 대출","livret d'épargne":"예금 통장","chéquier":"수표책","espèces":"현금","facture d'électricité":"전기 요금 고지서",
"intelligence artificielle":"인공지능","données":"데이터","logiciel":"소프트웨어","matériel":"하드웨어","sauvegarde":"백업","mise à jour":"업데이트","piratage":"해킹","virus informatique":"컴퓨터 바이러스","écran tactile":"터치스크린","objet connecté":"스마트 기기","réseau social":"소셜 미디어",
"gratte-ciel":"마천루","béton":"콘크리트","brique":"벽돌","grue":"크레인","échafaudage":"비계","fondations":"기초","charpente":"골조","façade":"파사드","toiture":"지붕재","permis de construire":"건축 허가",
"enquête":"수사","indice":"단서","suspect":"용의자","témoignage":"증언","empreintes digitales":"지문","alibi":"알리바이","cambriolage":"빈집털이","agression":"폭행","escroquerie":"사기","interrogatoire":"심문","menottes":"수갑","rançon":"몸값"
},
ar:{
"soulagement":"ارتياح","admiration":"إعجاب","enthousiasme":"حماس","compassion":"تعاطف","nostalgie":"حنين","inquiétude":"انشغال البال","angoisse":"كرب","méfiance":"ريبة","frustration":"إحباط","j'en ai marre":"طفح الكيل","mépris":"ازدراء","gêne":"إحراج","indifférence":"لامبالاة",
"ambitieux":"طموح","audacieux":"جريء","loyal":"وفي","perfectionniste":"ساعٍ للكمال","insouciant":"خالي البال","arrogant":"متعجرف","humble":"وديع","hypocrite":"منافق","rancunier":"حقود","indulgent":"متسامح",
"ordre du jour":"جدول الأعمال","échéance":"موعد نهائي","objectif":"غاية","tâche":"مهمة","responsabilité":"مسؤولية","procès-verbal":"محضر الاجتماع","congé":"إجازة","télétravail":"عمل عن بعد","démission":"استقالة","recrutement":"توظيف","entretien d'embauche":"مقابلة عمل","ce n'est pas la peine":"لا داعي لذلك",
"reportage":"تقرير صحفي","interview":"مقابلة","gros titre":"عنوان رئيسي","rédaction":"هيئة التحرير","rumeur":"إشاعة","scandale":"فضيحة","censure":"رقابة","sondage":"استطلاع رأي",
"virement":"تحويل مصرفي","prélèvement":"خصم تلقائي","intérêts":"فوائد","taux":"معدل","devise":"عملة","hypothèque":"رهن عقاري","livret d'épargne":"دفتر توفير","chéquier":"دفتر شيكات","espèces":"نقدًا","facture d'électricité":"فاتورة الكهرباء",
"intelligence artificielle":"ذكاء اصطناعي","données":"بيانات","logiciel":"برمجيات","matériel":"أجهزة","sauvegarde":"نسخة احتياطية","mise à jour":"تحديث","piratage":"قرصنة","virus informatique":"فيروس حاسوب","écran tactile":"شاشة لمس","objet connecté":"جهاز ذكي","réseau social":"وسائل التواصل",
"gratte-ciel":"ناطحة سحاب","béton":"خرسانة","brique":"طوب","grue":"رافعة","échafaudage":"سقالة","fondations":"أساسات","charpente":"هيكل خشبي","façade":"واجهة","toiture":"تسقيف","permis de construire":"رخصة بناء",
"enquête":"تحقيق","indice":"قرينة","suspect":"مشتبه به","témoignage":"إفادة","empreintes digitales":"بصمات الأصابع","alibi":"حجة غياب","cambriolage":"سطو","agression":"اعتداء","escroquerie":"احتيال","interrogatoire":"استجواب","menottes":"أصفاد","rançon":"فدية"
}
};
LANGS2.forEach(function(l){ var r2=LEX2R[l]||{}; Object.keys(r2).forEach(function(k){ LEX2[l][k]=r2[k]; }); });
/* ── Vague 19 nouvelles langues (v2.89) : unités 145-152 — scène internationale, secrets
   du chef, adjectifs de précision, connecteurs soutenus, au microscope, logement et droit,
   expressions imagées, le cinéma. Anti-collisions vérifiées : connecteurs soutenus tous
   distincts de cependant/pourtant/mais déjà en place (zh toutefois=可是 car 但是=mais,
   ko toutefois=다만 car 하지만=mais, par conséquent=그러므로 car 따라서=le long de,
   en outre=또한 car 게다가=d'ailleurs, bien que=지만 car 에도 불구하고=malgré) ;
   pl vedette=gwiazda filmowa (gwiazda=étoile), ru éplucher=чистить овощи (чистить=
   nettoyer), rigoureux=скрупулёзный (строгий=sévère), contravention=штрафной талон
   (штраф=amende) ; cs générique=závěrečné titulky (titulky=sous-titres) ;
   zh stationnement=泊车 (停车=se garer). Homographe réel assumé : ar ذرة = maïs ET
   atome (dhurra/dharra, même graphie sans voyelles). */
var LEX2S = {
pl:{
"ambassade":"ambasada","consulat":"konsulat","traité":"traktat","diplomatie":"dyplomacja","cessez-le-feu":"zawieszenie broni","réfugié":"uchodźca","immigration":"imigracja","émigration":"emigracja","mondialisation":"globalizacja","aide humanitaire":"pomoc humanitarna",
"assaisonner":"przyprawiać","éplucher":"obierać","mariner":"marynować","pétrir":"ugniatać","levure":"drożdże","mijoter":"dusić","cuisson":"gotowanie","garniture":"dodatki","épices":"przyprawy","herbes aromatiques":"zioła",
"rentable":"opłacalny","fiable":"niezawodny","exigeant":"wymagający","soigneux":"staranny","rigoureux":"rygorystyczny","approfondi":"dogłębny","négligent":"niedbały","souple":"elastyczny","rigide":"sztywny","robuste":"wytrzymały","durable":"trwały","superficiel":"powierzchowny",
"néanmoins":"niemniej jednak","toutefois":"jednakże","en revanche":"za to","par conséquent":"w konsekwencji","d'autant plus":"tym bardziej","en outre":"ponadto","quant à":"co do","faute de":"z braku","à condition que":"pod warunkiem że","bien que":"chociaż","afin de":"w celu","tandis que":"podczas gdy",
"cellule":"komórka","gène":"gen","ADN":"DNA","molécule":"cząsteczka","atome":"atom","évolution":"ewolucja","échantillon":"próbka","hypothèse":"hipoteza","démonstration":"pokaz","éprouvette":"probówka",
"locataire":"lokator","propriétaire":"właściciel","bail":"umowa najmu","caution":"kaucja","assurance":"ubezpieczenie","héritage":"spadek","testament":"testament","notaire":"notariusz","péage":"opłata drogowa","covoiturage":"wspólne przejazdy","contravention":"mandat","stationnement":"parkowanie",
"ça saute aux yeux":"to rzuca się w oczy","il n'y a pas de quoi":"nie ma za co","à vrai dire":"prawdę mówiąc","en fin de compte":"koniec końców","quoi qu'il en soit":"tak czy inaczej",
"réalisateur":"reżyser","tournage":"kręcenie filmu","scénario":"scenariusz","figurant":"statysta","vedette":"gwiazda filmowa","plateau de tournage":"plan filmowy","doublage":"dubbing","bande-annonce":"zwiastun","générique":"napisy końcowe","effets spéciaux":"efekty specjalne","court-métrage":"film krótkometrażowy","sous-titrage":"napisy do filmu"
},
ru:{
"ambassade":"посольство","consulat":"консульство","traité":"договор","diplomatie":"дипломатия","cessez-le-feu":"прекращение огня","réfugié":"беженец","immigration":"иммиграция","émigration":"эмиграция","mondialisation":"глобализация","aide humanitaire":"гуманитарная помощь",
"assaisonner":"приправлять","éplucher":"чистить овощи","mariner":"мариновать","pétrir":"месить","levure":"дрожжи","mijoter":"тушить","cuisson":"приготовление","garniture":"гарнир","épices":"специи","herbes aromatiques":"пряные травы",
"rentable":"прибыльный","fiable":"надёжный","exigeant":"требовательный","soigneux":"аккуратный","rigoureux":"скрупулёзный","approfondi":"углублённый","négligent":"небрежный","souple":"гибкий","rigide":"жёсткий","robuste":"прочный","durable":"долговечный","superficiel":"поверхностный",
"néanmoins":"тем не менее","toutefois":"впрочем","en revanche":"зато","par conséquent":"следовательно","d'autant plus":"тем более","en outre":"кроме того","quant à":"что касается","faute de":"за неимением","à condition que":"при условии что","bien que":"хотя","afin de":"для того чтобы","tandis que":"в то время как",
"cellule":"клетка","gène":"ген","ADN":"ДНК","molécule":"молекула","atome":"атом","évolution":"эволюция","échantillon":"образец","hypothèse":"гипотеза","démonstration":"показ","éprouvette":"пробирка",
"locataire":"арендатор","propriétaire":"владелец","bail":"договор аренды","caution":"залог","assurance":"страховка","héritage":"наследство","testament":"завещание","notaire":"нотариус","péage":"дорожный сбор","covoiturage":"совместные поездки","contravention":"штрафной талон","stationnement":"парковка",
"ça saute aux yeux":"это бросается в глаза","il n'y a pas de quoi":"не за что","à vrai dire":"по правде говоря","en fin de compte":"в конечном счёте","quoi qu'il en soit":"как бы то ни было",
"réalisateur":"режиссёр","tournage":"съёмки","scénario":"сценарий","figurant":"статист","vedette":"кинозвезда","plateau de tournage":"съёмочная площадка","doublage":"дубляж","bande-annonce":"трейлер","générique":"титры","effets spéciaux":"спецэффекты","court-métrage":"короткометражка","sous-titrage":"субтитрование"
},
uk:{
"ambassade":"посольство","consulat":"консульство","traité":"міжнародний договір","diplomatie":"дипломатія","cessez-le-feu":"припинення вогню","réfugié":"біженець","immigration":"імміграція","émigration":"еміграція","mondialisation":"глобалізація","aide humanitaire":"гуманітарна допомога",
"assaisonner":"приправляти","éplucher":"обчищати","mariner":"маринувати","pétrir":"місити","levure":"дріжджі","mijoter":"тушкувати","cuisson":"приготування","garniture":"гарнір","épices":"спеції","herbes aromatiques":"пряні трави",
"rentable":"прибутковий","fiable":"надійний","exigeant":"вимогливий","soigneux":"охайний","rigoureux":"ретельний","approfondi":"поглиблений","négligent":"недбалий","souple":"гнучкий","rigide":"жорсткий","robuste":"міцний","durable":"довговічний","superficiel":"поверхневий",
"néanmoins":"проте","toutefois":"втім","en revanche":"натомість","par conséquent":"отже","d'autant plus":"тим більше","en outre":"крім того","quant à":"щодо","faute de":"через брак","à condition que":"за умови що","bien que":"хоча","afin de":"задля","tandis que":"тоді як",
"cellule":"клітина","gène":"ген","ADN":"ДНК","molécule":"молекула","atome":"атом","évolution":"еволюція","échantillon":"зразок","hypothèse":"гіпотеза","démonstration":"наочний показ","éprouvette":"пробірка",
"locataire":"орендар","propriétaire":"власник","bail":"договір оренди","caution":"застава","assurance":"страхування","héritage":"спадщина","testament":"заповіт","notaire":"нотаріус","péage":"дорожній збір","covoiturage":"спільні поїздки","contravention":"штрафний талон","stationnement":"паркування",
"ça saute aux yeux":"це впадає в око","il n'y a pas de quoi":"нема за що","à vrai dire":"правду кажучи","en fin de compte":"зрештою","quoi qu'il en soit":"як би там не було",
"réalisateur":"режисер","tournage":"зйомки","scénario":"сценарій","figurant":"статист","vedette":"кінозірка","plateau de tournage":"знімальний майданчик","doublage":"дубляж","bande-annonce":"трейлер","générique":"титри","effets spéciaux":"спецефекти","court-métrage":"короткометражка","sous-titrage":"субтитрування"
},
cs:{
"ambassade":"velvyslanectví","consulat":"konzulát","traité":"smlouva","diplomatie":"diplomacie","cessez-le-feu":"příměří","réfugié":"uprchlík","immigration":"imigrace","émigration":"emigrace","mondialisation":"globalizace","aide humanitaire":"humanitární pomoc",
"assaisonner":"kořenit","éplucher":"loupat","mariner":"marinovat","pétrir":"hníst","levure":"droždí","mijoter":"dusit","cuisson":"vaření","garniture":"příloha","épices":"koření","herbes aromatiques":"bylinky",
"rentable":"výnosný","fiable":"spolehlivý","exigeant":"náročný","soigneux":"pečlivý","rigoureux":"důsledný","approfondi":"důkladný","négligent":"nedbalý","souple":"pružný","rigide":"tuhý","robuste":"odolný","durable":"trvanlivý","superficiel":"povrchní",
"néanmoins":"nicméně","toutefois":"avšak","en revanche":"naopak","par conséquent":"tudíž","d'autant plus":"tím spíše","en outre":"kromě toho","quant à":"pokud jde o","faute de":"pro nedostatek","à condition que":"pod podmínkou že","bien que":"ačkoli","afin de":"za účelem","tandis que":"zatímco",
"cellule":"buňka","gène":"gen","ADN":"DNA","molécule":"molekula","atome":"atom","évolution":"evoluce","échantillon":"vzorek","hypothèse":"hypotéza","démonstration":"předvedení","éprouvette":"zkumavka",
"locataire":"nájemník","propriétaire":"majitel","bail":"nájemní smlouva","caution":"kauce","assurance":"pojištění","héritage":"dědictví","testament":"závěť","notaire":"notář","péage":"mýtné","covoiturage":"spolujízda","contravention":"pokutový blok","stationnement":"parkování",
"ça saute aux yeux":"to bije do očí","il n'y a pas de quoi":"není zač","à vrai dire":"po pravdě řečeno","en fin de compte":"koneckonců","quoi qu'il en soit":"ať je to jakkoli",
"réalisateur":"režisér","tournage":"natáčení","scénario":"scénář","figurant":"komparzista","vedette":"filmová hvězda","plateau de tournage":"filmový plac","doublage":"dabing","bande-annonce":"upoutávka","générique":"závěrečné titulky","effets spéciaux":"speciální efekty","court-métrage":"krátký film","sous-titrage":"titulkování"
},
zh:{
"ambassade":"大使馆","consulat":"领事馆","traité":"条约","diplomatie":"外交","cessez-le-feu":"停火","réfugié":"难民","immigration":"移民","émigration":"移居国外","mondialisation":"全球化","aide humanitaire":"人道主义援助",
"assaisonner":"调味","éplucher":"削皮","mariner":"腌制","pétrir":"揉面","levure":"酵母","mijoter":"炖","cuisson":"烹饪","garniture":"配菜","épices":"香料","herbes aromatiques":"香草",
"rentable":"有利可图的","fiable":"可靠的","exigeant":"要求高的","soigneux":"细心的","rigoureux":"严谨的","approfondi":"深入的","négligent":"粗心的","souple":"灵活的","rigide":"僵硬的","robuste":"结实的","durable":"耐用的","superficiel":"肤浅的",
"néanmoins":"尽管如此","toutefois":"可是","en revanche":"相反","par conséquent":"因此","d'autant plus":"更何况","en outre":"此外","quant à":"至于","faute de":"由于缺乏","à condition que":"只要","bien que":"虽然","afin de":"为了","tandis que":"而",
"cellule":"细胞","gène":"基因","ADN":"DNA","molécule":"分子","atome":"原子","évolution":"进化","échantillon":"样本","hypothèse":"假说","démonstration":"演示","éprouvette":"试管",
"locataire":"房客","propriétaire":"房东","bail":"租约","caution":"押金","assurance":"保险","héritage":"遗产","testament":"遗嘱","notaire":"公证人","péage":"过路费","covoiturage":"拼车","contravention":"罚单","stationnement":"泊车",
"ça saute aux yeux":"一目了然","il n'y a pas de quoi":"不客气","à vrai dire":"说实话","en fin de compte":"归根结底","quoi qu'il en soit":"无论如何",
"réalisateur":"导演","tournage":"拍摄","scénario":"剧本","figurant":"群众演员","vedette":"明星","plateau de tournage":"片场","doublage":"配音","bande-annonce":"预告片","générique":"片尾字幕","effets spéciaux":"特效","court-métrage":"短片","sous-titrage":"字幕制作"
},
ja:{
"ambassade":"大使館","consulat":"領事館","traité":"条約","diplomatie":"外交","cessez-le-feu":"停戦","réfugié":"難民","immigration":"移民","émigration":"国外移住","mondialisation":"グローバル化","aide humanitaire":"人道支援",
"assaisonner":"味付けします","éplucher":"皮をむきます","mariner":"マリネします","pétrir":"こねます","levure":"イースト","mijoter":"煮込みます","cuisson":"調理","garniture":"付け合わせ","épices":"スパイス","herbes aromatiques":"ハーブ",
"rentable":"採算が取れる","fiable":"信頼できる","exigeant":"要求が厳しい","soigneux":"丁寧な","rigoureux":"厳密な","approfondi":"徹底した","négligent":"ずさんな","souple":"柔軟な","rigide":"硬直した","robuste":"頑丈な","durable":"長持ちする","superficiel":"表面的な",
"néanmoins":"それにもかかわらず","toutefois":"ただし","en revanche":"一方で","par conséquent":"したがって","d'autant plus":"なおさら","en outre":"さらに","quant à":"〜については","faute de":"〜がないため","à condition que":"〜という条件で","bien que":"〜だけれども","afin de":"〜を目的として","tandis que":"〜である一方",
"cellule":"細胞","gène":"遺伝子","ADN":"DNA","molécule":"分子","atome":"原子","évolution":"進化","échantillon":"サンプル","hypothèse":"仮説","démonstration":"実証","éprouvette":"試験管",
"locataire":"借家人","propriétaire":"大家","bail":"賃貸契約","caution":"敷金","assurance":"保険","héritage":"遺産","testament":"遺言","notaire":"公証人","péage":"通行料","covoiturage":"相乗り","contravention":"違反切符","stationnement":"駐車",
"ça saute aux yeux":"一目瞭然 です","il n'y a pas de quoi":"どういたしまして","à vrai dire":"実を言うと","en fin de compte":"結局のところ","quoi qu'il en soit":"いずれにせよ",
"réalisateur":"映画監督","tournage":"撮影","scénario":"脚本","figurant":"エキストラ","vedette":"スター","plateau de tournage":"撮影セット","doublage":"吹き替え","bande-annonce":"予告編","générique":"エンドロール","effets spéciaux":"特殊効果","court-métrage":"短編映画","sous-titrage":"字幕付け"
},
ko:{
"ambassade":"대사관","consulat":"영사관","traité":"조약","diplomatie":"외교","cessez-le-feu":"휴전","réfugié":"난민","immigration":"이민","émigration":"해외 이주","mondialisation":"세계화","aide humanitaire":"인도적 지원",
"assaisonner":"간을 하다","éplucher":"껍질을 벗기다","mariner":"재우다","pétrir":"반죽하다","levure":"효모","mijoter":"뭉근히 끓이다","cuisson":"조리","garniture":"곁들임","épices":"향신료","herbes aromatiques":"허브",
"rentable":"수익성 있는","fiable":"신뢰할 수 있는","exigeant":"까다로운","soigneux":"꼼꼼한","rigoureux":"엄밀한","approfondi":"심층적인","négligent":"부주의한","souple":"유연한","rigide":"경직된","robuste":"튼튼한","durable":"오래가는","superficiel":"피상적인",
"néanmoins":"그럼에도 불구하고","toutefois":"다만","en revanche":"반면에","par conséquent":"그러므로","d'autant plus":"더욱이","en outre":"그 밖에도","quant à":"에 관해서는","faute de":"이 없어서","à condition que":"하는 조건으로","bien que":"지만","afin de":"하고자","tandis que":"인 데 비해",
"cellule":"세포","gène":"유전자","ADN":"DNA","molécule":"분자","atome":"원자","évolution":"진화","échantillon":"표본","hypothèse":"가설","démonstration":"증명","éprouvette":"시험관",
"locataire":"세입자","propriétaire":"집주인","bail":"임대 계약","caution":"보증금","assurance":"보험","héritage":"유산","testament":"유언장","notaire":"공증인","péage":"통행료","covoiturage":"카풀","contravention":"딱지","stationnement":"주차",
"ça saute aux yeux":"한눈에 봐도 알아요","il n'y a pas de quoi":"천만에요","à vrai dire":"사실대로 말하면","en fin de compte":"결국에는","quoi qu'il en soit":"어쨌든",
"réalisateur":"영화감독","tournage":"촬영","scénario":"시나리오","figurant":"엑스트라","vedette":"스타","plateau de tournage":"촬영장","doublage":"더빙","bande-annonce":"예고편","générique":"엔딩 크레딧","effets spéciaux":"특수 효과","court-métrage":"단편 영화","sous-titrage":"자막 제작"
},
ar:{
"ambassade":"سفارة","consulat":"قنصلية","traité":"معاهدة","diplomatie":"دبلوماسية","cessez-le-feu":"وقف إطلاق النار","réfugié":"لاجئ","immigration":"هجرة","émigration":"هجرة إلى الخارج","mondialisation":"عولمة","aide humanitaire":"مساعدات إنسانية",
"assaisonner":"يتبل","éplucher":"يقشر","mariner":"ينقع","pétrir":"يعجن","levure":"خميرة","mijoter":"يطهو على نار هادئة","cuisson":"طهي","garniture":"طبق جانبي","épices":"بهارات","herbes aromatiques":"أعشاب عطرية",
"rentable":"مربح","fiable":"موثوق","exigeant":"متطلب","soigneux":"دقيق","rigoureux":"منهجي","approfondi":"معمق","négligent":"مهمل","souple":"مرن","rigide":"متصلب","robuste":"متين","durable":"مستدام","superficiel":"سطحي",
"néanmoins":"برغم ذلك","toutefois":"بيد أن","en revanche":"في المقابل","par conséquent":"بالتالي","d'autant plus":"لا سيما","en outre":"علاوة على ذلك","quant à":"أما بالنسبة لـ","faute de":"لعدم وجود","à condition que":"بشرط أن","bien que":"مع أن","afin de":"من أجل","tandis que":"بينما",
"cellule":"خلية","gène":"جين","ADN":"الحمض النووي","molécule":"جزيء","atome":"ذرة","évolution":"تطور","échantillon":"عينة","hypothèse":"فرضية","démonstration":"برهان","éprouvette":"أنبوب اختبار",
"locataire":"مستأجر","propriétaire":"مالك","bail":"عقد إيجار","caution":"وديعة","assurance":"تأمين","héritage":"ميراث","testament":"وصية","notaire":"كاتب عدل","péage":"رسوم الطريق","covoiturage":"مشاركة السيارة","contravention":"مخالفة","stationnement":"وقوف السيارات",
"ça saute aux yeux":"واضح وضوح الشمس","il n'y a pas de quoi":"لا شكر على واجب","à vrai dire":"في الحقيقة","en fin de compte":"في نهاية المطاف","quoi qu'il en soit":"على أي حال",
"réalisateur":"مخرج","tournage":"تصوير الفيلم","scénario":"سيناريو","figurant":"كومبارس","vedette":"نجم سينمائي","plateau de tournage":"موقع التصوير","doublage":"دبلجة","bande-annonce":"إعلان تشويقي","générique":"شارة النهاية","effets spéciaux":"مؤثرات خاصة","court-métrage":"فيلم قصير","sous-titrage":"سترجة"
}
};
LANGS2.forEach(function(l){ var s2=LEX2S[l]||{}; Object.keys(s2).forEach(function(k){ LEX2[l][k]=s2[k]; }); });
/* ── Vague 20 FINALE nouvelles langues (v2.90) : unités 153-167 — étapes de la vie,
   art de débattre, croyances, université, voyager malin, sport intensif, cours d'eau,
   verbes vifs, loisirs créatifs, citoyens, nuances, dire et faire, sciences, bricolage,
   cuisine et quantités. LE PROGRAMME COMPLET (167/167) EST COUVERT DANS LES 8 LANGUES.
   Anti-collisions clés : droit pl=uprawnienie (prawo=droite), délai ≠ échéance partout
   (uk строк, zh 时限, ja 期限, ko 기한, ar مهلة) ; escale ≠ correspondance (pl
   międzylądowanie, ru стыковка, cs mezipřistání, zh 中转, ja 経由, ko 경유) ; crue ≠
   inondation (pl wezbranie, ru паводок, zh 涨水, ja 増水) ; plusieurs ≠ quelques dans
   les 8 (pl kilka/parę, ru несколько/пара, uk декілька/кілька, cs několik/pár,
   zh 好几个/几个, ja いくつもの/いくつかの, ko 여러/몇몇, ar عدة/بضعة) ; dorénavant ≠
   désormais partout ; rite ar=شعيرة (طقس=météo), en effet ar=فعلاً (بالفعل=déjà) ;
   soupçonner ≠ douter (zh 猜疑, ja 怪しみます, ko 수상히 여기다) ; insister ru=упорствовать
   (настаивать=exiger) ; récompenser zh=奖赏 (奖励=récompense) ; échecs zh=国际象棋
   (象棋=jeu chinois différent — vérité). */
var LEX2T = {
pl:{
"nourrisson":"niemowlak","adolescence":"okres dojrzewania","jeunesse":"młodość","majorité":"pełnoletność","vieillesse":"starość","décès":"zgon","état civil":"stan cywilny","espérance de vie":"średnia długość życia",
"argument":"argument","réfuter":"obalać","nuancer":"niuansować","objection":"sprzeciw","porte-parole":"rzecznik","compromis":"kompromis","consensus":"konsensus","polémique":"polemika","controverse":"kontrowersja","mauvaise foi":"zła wola",
"mosquée":"meczet","synagogue":"synagoga","temple":"świątynia","prière":"modlitwa","pèlerinage":"pielgrzymka","croyance":"wierzenie","foi":"wiara","athée":"ateista","rite":"obrzęd","laïcité":"świeckość",
"licence":"licencjat","master":"magister","doctorat":"doktorat","thèse":"rozprawa doktorska","soutenance":"obrona pracy","amphithéâtre":"aula","bourse":"stypendium","inscription":"zapisy","recherche scientifique":"badania naukowe","stage de fin d'études":"staż dyplomowy",
"hébergement":"zakwaterowanie","itinéraire":"trasa","formalités":"formalności","visa":"wiza","assurance voyage":"ubezpieczenie podróżne","escale":"międzylądowanie","hors saison":"poza sezonem","haute saison":"szczyt sezonu","dépaysement":"zmiana otoczenia","office de tourisme":"informacja turystyczna",
"échauffement":"rozgrzewka","étirement":"rozciąganie","endurance":"wytrzymałość","souffle":"oddech","transpiration":"pocenie się","courbature":"zakwasy","récupération":"regeneracja","dopage":"doping","performance":"wynik sportowy","esprit d'équipe":"duch zespołu",
"barrage":"tama","écluse":"śluza","affluent":"dopływ","delta":"delta","estuaire":"ujście rzeki","berge":"brzeg rzeki","noyade":"utonięcie","crue":"wezbranie","nappe phréatique":"wody gruntowe",
"jaillir":"tryskać","s'effondrer":"zawalić się","surgir":"wyłaniać się","se répandre":"rozprzestrzeniać się","déborder":"przelewać się","engloutir":"pochłaniać","dissoudre":"rozpuszczać","s'évaporer":"parować","congeler":"zamrażać","fondre":"topić się",
"tricot":"robienie na drutach","couture":"szycie","broderie":"haft","poterie":"garncarstwo","aquarelle":"akwarela","calligraphie":"kaligrafia","origami":"origami","maquette":"makieta","échecs":"szachy","jeu de dames":"warcaby",
"nation":"naród","peuple":"lud","société":"społeczeństwo","droit":"uprawnienie","devoir":"obowiązek","voter":"głosować","justice":"sprawiedliwość","contrat":"umowa","signer":"podpisywać","remboursement":"zwrot pieniędzy","entretien":"konserwacja","délai":"czas realizacji","effort":"wysiłek","progrès":"postęp","résultat":"wynik",
"quotidien":"codzienny","hebdomadaire":"cotygodniowy","mensuel":"comiesięczny","annuel":"coroczny","immédiat":"natychmiastowy","soudain":"nagły","progressif":"stopniowy","définitif":"ostateczny","efficace":"skuteczny","inutile":"bezużyteczny","évident":"oczywisty","compliqué":"skomplikowany","précis":"dokładny","vague":"niejasny","sincère":"autentyczny","avare":"skąpy","impoli":"niegrzeczny","imprudent":"nieostrożny","lâche":"tchórzliwy","fou":"szalony","en effet":"rzeczywiście","autrement dit":"innymi słowy","dorénavant":"od tej pory",
"jurer":"przysięgać","pardonner":"wybaczać","trahir":"zdradzać","se venger":"mścić się","prouver":"udowadniać","féliciter":"gratulować","encourager":"zachęcać","consoler":"pocieszać","rassurer":"uspokajać","interdire":"zakazywać","autoriser":"zezwalać","obéir":"słuchać się","désobéir":"nie słuchać się","punir":"karać","récompenser":"nagradzać","menacer":"grozić","supplier":"błagać","soupçonner":"podejrzewać","insister":"nalegać","céder":"ustępować","parier":"zakładać się",
"océan":"ocean","atmosphère":"atmosfera ziemska","oxygène":"tlen","espèce":"gatunek","électricité":"elektryczność","robot":"robot","éclipse":"zaćmienie",
"fer":"żelazo","acier":"stal","sable":"piasek","colle":"klej","peinture":"farba","aiguille":"igła","construire":"budować","casser":"łamać","visser":"przykręcać",
"vinaigre":"ocet","moutarde":"musztarda","sauce":"sos","ingrédient":"składnik","congélateur":"zamrażarka","mixeur":"blender","tiers":"jedna trzecia","plusieurs":"kilka","quelques":"parę","aucun":"żaden","chaque":"każdy","au moins":"przynajmniej","au maximum":"maksymalnie"
},
ru:{
"nourrisson":"младенец","adolescence":"подростковый возраст","jeunesse":"молодость","majorité":"совершеннолетие","vieillesse":"старость","décès":"кончина","état civil":"гражданское состояние","espérance de vie":"продолжительность жизни",
"argument":"аргумент","réfuter":"опровергать","nuancer":"уточнять","objection":"возражение","porte-parole":"пресс-секретарь","compromis":"компромисс","consensus":"консенсус","polémique":"полемика","controverse":"спор","mauvaise foi":"недобросовестность",
"mosquée":"мечеть","synagogue":"синагога","temple":"храм","prière":"молитва","pèlerinage":"паломничество","croyance":"верование","foi":"вера","athée":"атеист","rite":"обряд","laïcité":"светскость",
"licence":"бакалавриат","master":"магистратура","doctorat":"докторантура","thèse":"диссертация","soutenance":"защита диссертации","amphithéâtre":"аудитория","bourse":"стипендия","inscription":"зачисление","recherche scientifique":"научные исследования","stage de fin d'études":"преддипломная практика",
"hébergement":"проживание","itinéraire":"маршрут","formalités":"формальности","visa":"виза","assurance voyage":"туристическая страховка","escale":"стыковка","hors saison":"не в сезон","haute saison":"высокий сезон","dépaysement":"смена обстановки","office de tourisme":"туристическое бюро",
"échauffement":"разминка","étirement":"растяжка","endurance":"выносливость","souffle":"дыхание","transpiration":"пот","courbature":"крепатура","récupération":"восстановление","dopage":"допинг","performance":"спортивный результат","esprit d'équipe":"командный дух",
"barrage":"плотина","écluse":"шлюз","affluent":"приток","delta":"дельта","estuaire":"устье","berge":"берег","noyade":"утопление","crue":"паводок","nappe phréatique":"грунтовые воды",
"jaillir":"бить ключом","s'effondrer":"рухнуть","surgir":"возникать","se répandre":"распространяться","déborder":"переливаться","engloutir":"поглощать","dissoudre":"растворять","s'évaporer":"испаряться","congeler":"замораживать","fondre":"таять",
"tricot":"вязание","couture":"шитьё","broderie":"вышивка","poterie":"гончарное дело","aquarelle":"акварель","calligraphie":"каллиграфия","origami":"оригами","maquette":"макет","échecs":"шахматы","jeu de dames":"шашки",
"nation":"нация","peuple":"народ","société":"общество","droit":"право","devoir":"обязанность","voter":"голосовать","justice":"справедливость","contrat":"контракт","signer":"подписывать","remboursement":"возврат денег","entretien":"техобслуживание","délai":"срок исполнения","effort":"усилие","progrès":"прогресс","résultat":"результат",
"quotidien":"ежедневный","hebdomadaire":"еженедельный","mensuel":"ежемесячный","annuel":"ежегодный","immédiat":"немедленный","soudain":"внезапный","progressif":"постепенный","définitif":"окончательный","efficace":"эффективный","inutile":"бесполезный","évident":"очевидный","compliqué":"сложный","précis":"точный","vague":"расплывчатый","sincère":"искренний","avare":"жадный","impoli":"невежливый","imprudent":"неосторожный","lâche":"трусливый","fou":"сумасшедший","en effet":"в самом деле","autrement dit":"иными словами","dorénavant":"впредь",
"jurer":"клясться","pardonner":"прощать","trahir":"предавать","se venger":"мстить","prouver":"доказывать","féliciter":"поздравлять","encourager":"подбадривать","consoler":"утешать","rassurer":"успокаивать","interdire":"запрещать","autoriser":"разрешать","obéir":"подчиняться","désobéir":"не слушаться","punir":"наказывать","récompenser":"награждать","menacer":"угрожать","supplier":"умолять","soupçonner":"подозревать","insister":"упорствовать","céder":"уступать","parier":"держать пари",
"océan":"океан","atmosphère":"атмосфера Земли","oxygène":"кислород","espèce":"вид","électricité":"электричество","robot":"робот","éclipse":"затмение",
"fer":"железо","acier":"сталь","sable":"песок","colle":"клей","peinture":"краска","aiguille":"игла","construire":"строить","casser":"ломать","visser":"закручивать",
"vinaigre":"уксус","moutarde":"горчица","sauce":"соус","ingrédient":"ингредиент","congélateur":"морозилка","mixeur":"блендер","tiers":"треть","plusieurs":"несколько","quelques":"пара-тройка","aucun":"никакой","chaque":"каждый","au moins":"по крайней мере","au maximum":"максимум"
},
uk:{
"nourrisson":"немовля","adolescence":"підлітковий вік","jeunesse":"молодість","majorité":"повноліття","vieillesse":"старість","décès":"кончина","état civil":"цивільний стан","espérance de vie":"тривалість життя",
"argument":"аргумент","réfuter":"спростовувати","nuancer":"уточнювати","objection":"заперечення","porte-parole":"речник","compromis":"компроміс","consensus":"консенсус","polémique":"полеміка","controverse":"суперечка","mauvaise foi":"недобросовісність",
"mosquée":"мечеть","synagogue":"синагога","temple":"храм","prière":"молитва","pèlerinage":"паломництво","croyance":"вірування","foi":"віра","athée":"атеїст","rite":"обряд","laïcité":"світськість",
"licence":"бакалаврат","master":"магістратура","doctorat":"докторантура","thèse":"дисертація","soutenance":"захист дисертації","amphithéâtre":"аудиторія","bourse":"стипендія","inscription":"зарахування","recherche scientifique":"наукові дослідження","stage de fin d'études":"переддипломна практика",
"hébergement":"проживання","itinéraire":"маршрут","formalités":"формальності","visa":"віза","assurance voyage":"туристичне страхування","escale":"проміжна зупинка","hors saison":"поза сезоном","haute saison":"високий сезон","dépaysement":"зміна оточення","office de tourisme":"туристичне бюро",
"échauffement":"розминка","étirement":"розтяжка","endurance":"витривалість","souffle":"дихання","transpiration":"піт","courbature":"крепатура","récupération":"відновлення","dopage":"допінг","performance":"спортивний результат","esprit d'équipe":"командний дух",
"barrage":"гребля","écluse":"шлюз","affluent":"притока","delta":"дельта","estuaire":"гирло","berge":"берег","noyade":"утоплення","crue":"паводок","nappe phréatique":"ґрунтові води",
"jaillir":"бити фонтаном","s'effondrer":"обвалюватися","surgir":"виникати","se répandre":"поширюватися","déborder":"переливатися","engloutir":"поглинати","dissoudre":"розчиняти","s'évaporer":"випаровуватися","congeler":"заморожувати","fondre":"танути",
"tricot":"в'язання","couture":"шиття","broderie":"вишивка","poterie":"гончарство","aquarelle":"акварель","calligraphie":"каліграфія","origami":"орігамі","maquette":"макет","échecs":"шахи","jeu de dames":"шашки",
"nation":"нація","peuple":"народ","société":"суспільство","droit":"право","devoir":"обов'язок","voter":"голосувати","justice":"справедливість","contrat":"контракт","signer":"підписувати","remboursement":"повернення грошей","entretien":"техобслуговування","délai":"строк","effort":"зусилля","progrès":"прогрес","résultat":"результат",
"quotidien":"щоденний","hebdomadaire":"щотижневий","mensuel":"щомісячний","annuel":"щорічний","immédiat":"негайний","soudain":"раптовий","progressif":"поступовий","définitif":"остаточний","efficace":"ефективний","inutile":"марний","évident":"очевидний","compliqué":"заплутаний","précis":"точний","vague":"розмитий","sincère":"щирий","avare":"скупий","impoli":"неввічливий","imprudent":"необережний","lâche":"боягузливий","fou":"божевільний","en effet":"дійсно","autrement dit":"іншими словами","dorénavant":"віднині",
"jurer":"присягатися","pardonner":"прощати","trahir":"зраджувати","se venger":"мститися","prouver":"доводити","féliciter":"вітати","encourager":"заохочувати","consoler":"втішати","rassurer":"заспокоювати","interdire":"забороняти","autoriser":"дозволяти","obéir":"слухатися","désobéir":"не слухатися","punir":"карати","récompenser":"нагороджувати","menacer":"погрожувати","supplier":"благати","soupçonner":"підозрювати","insister":"стояти на своєму","céder":"поступатися","parier":"битися об заклад",
"océan":"океан","atmosphère":"атмосфера Землі","oxygène":"кисень","espèce":"вид","électricité":"електрика","robot":"робот","éclipse":"затемнення",
"fer":"залізо","acier":"сталь","sable":"пісок","colle":"клей","peinture":"фарба","aiguille":"голка","construire":"будувати","casser":"ламати","visser":"закручувати",
"vinaigre":"оцет","moutarde":"гірчиця","sauce":"соус","ingrédient":"інгредієнт","congélateur":"морозилка","mixeur":"блендер","tiers":"третина","plusieurs":"декілька","quelques":"кілька","aucun":"жоден","chaque":"кожен","au moins":"принаймні","au maximum":"щонайбільше"
},
cs:{
"nourrisson":"kojenec","adolescence":"dospívání","jeunesse":"mládí","majorité":"plnoletost","vieillesse":"stáří","décès":"úmrtí","état civil":"osobní stav","espérance de vie":"průměrná délka života",
"argument":"argument","réfuter":"vyvracet","nuancer":"upřesňovat","objection":"námitka","porte-parole":"mluvčí","compromis":"kompromis","consensus":"konsenzus","polémique":"polemika","controverse":"kontroverze","mauvaise foi":"zlá vůle",
"mosquée":"mešita","synagogue":"synagoga","temple":"chrám","prière":"modlitba","pèlerinage":"pouť","croyance":"přesvědčení","foi":"víra","athée":"ateista","rite":"rituál","laïcité":"sekularismus",
"licence":"bakalářský titul","master":"magisterský titul","doctorat":"doktorát","thèse":"disertace","soutenance":"obhajoba","amphithéâtre":"posluchárna","bourse":"stipendium","inscription":"zápis ke studiu","recherche scientifique":"vědecký výzkum","stage de fin d'études":"absolventská stáž",
"hébergement":"ubytování","itinéraire":"itinerář","formalités":"formality","visa":"vízum","assurance voyage":"cestovní pojištění","escale":"mezipřistání","hors saison":"mimo sezónu","haute saison":"hlavní sezóna","dépaysement":"změna prostředí","office de tourisme":"turistické informační centrum",
"échauffement":"rozcvička","étirement":"protahování","endurance":"vytrvalost","souffle":"dech","transpiration":"pocení","courbature":"bolest svalů","récupération":"regenerace","dopage":"doping","performance":"výkon","esprit d'équipe":"týmový duch",
"barrage":"přehrada","écluse":"zdymadlo","affluent":"přítok","delta":"delta","estuaire":"ústí řeky","berge":"břeh","noyade":"utonutí","crue":"velká voda","nappe phréatique":"podzemní voda",
"jaillir":"tryskat","s'effondrer":"zhroutit se","surgir":"vynořovat se","se répandre":"šířit se","déborder":"přetékat","engloutir":"pohlcovat","dissoudre":"rozpouštět","s'évaporer":"vypařovat se","congeler":"zmrazovat","fondre":"tát",
"tricot":"pletení","couture":"šití","broderie":"vyšívání","poterie":"keramika","aquarelle":"akvarel","calligraphie":"kaligrafie","origami":"origami","maquette":"maketa","échecs":"šachy","jeu de dames":"dáma",
"nation":"národ","peuple":"lid","société":"společnost","droit":"právo","devoir":"povinnost","voter":"hlasovat","justice":"spravedlnost","contrat":"kontrakt","signer":"podepisovat","remboursement":"vrácení peněz","entretien":"údržba","délai":"stanovená lhůta","effort":"úsilí","progrès":"pokrok","résultat":"výsledek",
"quotidien":"každodenní","hebdomadaire":"týdenní","mensuel":"měsíční","annuel":"roční","immédiat":"okamžitý","soudain":"náhlý","progressif":"postupný","définitif":"konečný","efficace":"účinný","inutile":"zbytečný","évident":"zřejmý","compliqué":"složitý","précis":"přesný","vague":"vágní","sincère":"opravdový","avare":"lakomý","impoli":"nezdvořilý","imprudent":"neopatrný","lâche":"zbabělý","fou":"bláznivý","en effet":"skutečně","autrement dit":"jinými slovy","dorénavant":"napříště",
"jurer":"přísahat","pardonner":"odpouštět","trahir":"zrazovat","se venger":"mstít se","prouver":"dokazovat","féliciter":"gratulovat","encourager":"povzbuzovat","consoler":"utěšovat","rassurer":"uklidňovat","interdire":"zakazovat","autoriser":"povolovat","obéir":"uposlechnout","désobéir":"neuposlechnout","punir":"trestat","récompenser":"odměňovat","menacer":"vyhrožovat","supplier":"úpěnlivě prosit","soupçonner":"podezírat","insister":"trvat na svém","céder":"ustupovat","parier":"sázet se",
"océan":"oceán","atmosphère":"zemská atmosféra","oxygène":"kyslík","espèce":"druh","électricité":"elektřina","robot":"robot","éclipse":"zatmění",
"fer":"železo","acier":"ocel","sable":"písek","colle":"lepidlo","peinture":"malířská barva","aiguille":"jehla","construire":"stavět","casser":"rozbíjet","visser":"šroubovat",
"vinaigre":"ocet","moutarde":"hořčice","sauce":"omáčka","ingrédient":"ingredience","congélateur":"mrazák","mixeur":"mixér","tiers":"třetina","plusieurs":"několik","quelques":"hrstka","aucun":"žádný","chaque":"každý","au moins":"alespoň","au maximum":"maximálně"
},
zh:{
"nourrisson":"婴儿","adolescence":"青春期","jeunesse":"青春","majorité":"成年","vieillesse":"晚年","décès":"去世","état civil":"户籍","espérance de vie":"预期寿命",
"argument":"论点","réfuter":"反驳","nuancer":"细化","objection":"异议","porte-parole":"发言人","compromis":"妥协","consensus":"共识","polémique":"论战","controverse":"争议","mauvaise foi":"恶意",
"mosquée":"清真寺","synagogue":"犹太教堂","temple":"寺庙","prière":"祈祷","pèlerinage":"朝圣","croyance":"信念","foi":"信仰","athée":"无神论者","rite":"宗教仪式","laïcité":"政教分离",
"licence":"学士学位","master":"硕士学位","doctorat":"博士学位","thèse":"博士论文","soutenance":"论文答辩","amphithéâtre":"阶梯教室","bourse":"奖学金","inscription":"注册","recherche scientifique":"科学研究","stage de fin d'études":"毕业实习",
"hébergement":"住宿","itinéraire":"路线","formalités":"手续","visa":"签证","assurance voyage":"旅游保险","escale":"中转","hors saison":"淡季","haute saison":"旺季","dépaysement":"异国情调","office de tourisme":"旅游咨询处",
"échauffement":"热身","étirement":"拉伸","endurance":"耐力","souffle":"气息","transpiration":"出汗","courbature":"肌肉酸痛","récupération":"恢复","dopage":"兴奋剂","performance":"表现","esprit d'équipe":"团队精神",
"barrage":"水坝","écluse":"船闸","affluent":"支流","delta":"三角洲","estuaire":"河口","berge":"河岸","noyade":"溺水","crue":"涨水","nappe phréatique":"地下水",
"jaillir":"喷出","s'effondrer":"倒塌","surgir":"突然出现","se répandre":"蔓延","déborder":"溢出","engloutir":"吞没","dissoudre":"溶解","s'évaporer":"蒸发","congeler":"冷冻","fondre":"融化",
"tricot":"编织","couture":"缝纫","broderie":"刺绣","poterie":"陶艺","aquarelle":"水彩画","calligraphie":"书法","origami":"折纸","maquette":"模型","échecs":"国际象棋","jeu de dames":"西洋跳棋",
"nation":"民族","peuple":"人民","société":"社会","droit":"权利","devoir":"义务","voter":"去投票","justice":"正义","contrat":"合同","signer":"签字","remboursement":"还款","entretien":"保养","délai":"时限","effort":"努力","progrès":"进步","résultat":"结果",
"quotidien":"日常的","hebdomadaire":"每周的","mensuel":"每月的","annuel":"每年的","immédiat":"立即的","soudain":"突然的","progressif":"渐进的","définitif":"最终的","efficace":"有效的","inutile":"无用的","évident":"明显的","compliqué":"复杂的","précis":"精确的","vague":"模糊的","sincère":"真诚的","avare":"吝啬的","impoli":"不礼貌的","imprudent":"不小心的","lâche":"懦弱的","fou":"疯狂的","en effet":"的确","autrement dit":"换句话说","dorénavant":"今后",
"jurer":"发誓","pardonner":"原谅","trahir":"背叛","se venger":"报仇","prouver":"证明","féliciter":"祝贺","encourager":"鼓励","consoler":"安慰","rassurer":"使安心","interdire":"禁止","autoriser":"允许","obéir":"服从","désobéir":"不服从","punir":"惩罚","récompenser":"奖赏","menacer":"威胁","supplier":"恳求","soupçonner":"猜疑","insister":"坚持","céder":"让步","parier":"打赌",
"océan":"海洋","atmosphère":"大气层","oxygène":"氧气","espèce":"物种","électricité":"电","robot":"机器人","éclipse":"日食",
"fer":"铁","acier":"钢","sable":"沙子","colle":"胶水","peinture":"油漆","aiguille":"针","construire":"建造","casser":"打破","visser":"拧螺丝",
"vinaigre":"醋","moutarde":"芥末","sauce":"酱汁","ingrédient":"食材","congélateur":"冷冻柜","mixeur":"搅拌机","tiers":"三分之一","plusieurs":"好几个","quelques":"几个","aucun":"没有任何","chaque":"每个","au moins":"至少","au maximum":"最多"
},
ja:{
"nourrisson":"乳児","adolescence":"思春期","jeunesse":"青春","majorité":"成年","vieillesse":"老年","décès":"死亡","état civil":"戸籍","espérance de vie":"平均寿命",
"argument":"論拠","réfuter":"反論します","nuancer":"ニュアンスをつけます","objection":"異議","porte-parole":"スポークスマン","compromis":"妥協","consensus":"コンセンサス","polémique":"論争","controverse":"賛否両論","mauvaise foi":"不誠実",
"mosquée":"モスク","synagogue":"シナゴーグ","temple":"寺","prière":"祈り","pèlerinage":"巡礼","croyance":"信念","foi":"信仰","athée":"無神論者","rite":"儀式","laïcité":"政教分離",
"licence":"学士号","master":"修士号","doctorat":"博士号","thèse":"博士論文","soutenance":"論文審査","amphithéâtre":"講堂","bourse":"奨学金","inscription":"入学手続き","recherche scientifique":"科学研究","stage de fin d'études":"卒業インターン",
"hébergement":"宿泊","itinéraire":"旅程","formalités":"手続き","visa":"ビザ","assurance voyage":"旅行保険","escale":"経由","hors saison":"オフシーズン","haute saison":"ハイシーズン","dépaysement":"非日常感","office de tourisme":"観光案内所",
"échauffement":"ウォーミングアップ","étirement":"ストレッチ","endurance":"持久力","souffle":"息","transpiration":"汗","courbature":"筋肉痛","récupération":"疲労回復","dopage":"ドーピング","performance":"パフォーマンス","esprit d'équipe":"チームワーク",
"barrage":"ダム","écluse":"水門","affluent":"支流","delta":"三角州","estuaire":"河口","berge":"川岸","noyade":"溺死","crue":"増水","nappe phréatique":"地下水",
"jaillir":"噴き出します","s'effondrer":"崩れます","surgir":"現れます","se répandre":"広がります","déborder":"あふれます","engloutir":"飲み込みます","dissoudre":"溶かします","s'évaporer":"蒸発します","congeler":"冷凍します","fondre":"溶けます",
"tricot":"編み物","couture":"裁縫","broderie":"刺繍","poterie":"陶芸","aquarelle":"水彩画","calligraphie":"書道","origami":"折り紙","maquette":"模型","échecs":"チェス","jeu de dames":"チェッカー",
"nation":"国家","peuple":"国民","société":"社会","droit":"権利","devoir":"義務","voter":"投票します","justice":"正義","contrat":"契約","signer":"署名します","remboursement":"返金","entretien":"メンテナンス","délai":"期限","effort":"努力","progrès":"進歩","résultat":"結果",
"quotidien":"日常の","hebdomadaire":"毎週の","mensuel":"毎月の","annuel":"年間の","immédiat":"即時の","soudain":"突然の","progressif":"段階的な","définitif":"最終的な","efficace":"効果的な","inutile":"無駄な","évident":"明らかな","compliqué":"複雑な","précis":"正確な","vague":"曖昧な","sincère":"誠実な","avare":"けちな","impoli":"失礼な","imprudent":"不注意な","lâche":"臆病な","fou":"狂った","en effet":"確かに","autrement dit":"言い換えれば","dorénavant":"今後",
"jurer":"誓います","pardonner":"許します","trahir":"裏切ります","se venger":"復讐します","prouver":"証明します","féliciter":"祝います","encourager":"励まします","consoler":"慰めます","rassurer":"安心させます","interdire":"禁止します","autoriser":"許可します","obéir":"従います","désobéir":"逆らいます","punir":"罰します","récompenser":"褒美を与えます","menacer":"脅します","supplier":"懇願します","soupçonner":"怪しみます","insister":"言い張ります","céder":"譲ります","parier":"賭けます",
"océan":"大洋","atmosphère":"大気","oxygène":"酸素","espèce":"種","électricité":"電気","robot":"ロボット","éclipse":"日食",
"fer":"鉄","acier":"鋼","sable":"砂","colle":"接着剤","peinture":"ペンキ","aiguille":"針","construire":"建てます","casser":"壊します","visser":"ネジを締めます",
"vinaigre":"酢","moutarde":"マスタード","sauce":"ソース","ingrédient":"材料","congélateur":"冷凍庫","mixeur":"ミキサー","tiers":"三分の一","plusieurs":"いくつもの","quelques":"いくつかの","aucun":"一つもない","chaque":"それぞれの","au moins":"少なくとも","au maximum":"最大で"
},
ko:{
"nourrisson":"영아","adolescence":"사춘기","jeunesse":"청춘","majorité":"성년","vieillesse":"노년","décès":"사망","état civil":"호적","espérance de vie":"기대 수명",
"argument":"논거","réfuter":"반박하다","nuancer":"뉘앙스를 더하다","objection":"이의","porte-parole":"대변인","compromis":"타협","consensus":"합의","polémique":"설전","controverse":"논란","mauvaise foi":"억지",
"mosquée":"모스크","synagogue":"유대교 회당","temple":"사원","prière":"기도","pèlerinage":"성지 순례","croyance":"믿음","foi":"신앙","athée":"무신론자","rite":"의례","laïcité":"정교분리",
"licence":"학사 학위","master":"석사 학위","doctorat":"박사 학위","thèse":"박사 논문","soutenance":"논문 심사","amphithéâtre":"강당","bourse":"장학금","inscription":"등록","recherche scientifique":"과학 연구","stage de fin d'études":"졸업 인턴십",
"hébergement":"숙박","itinéraire":"여정","formalités":"수속","visa":"비자","assurance voyage":"여행자 보험","escale":"경유","hors saison":"비수기","haute saison":"성수기","dépaysement":"색다른 기분","office de tourisme":"관광 안내소",
"échauffement":"준비 운동","étirement":"스트레칭","endurance":"지구력","souffle":"숨","transpiration":"땀","courbature":"근육통","récupération":"피로 회복","dopage":"도핑","performance":"기량","esprit d'équipe":"팀워크",
"barrage":"댐","écluse":"갑문","affluent":"지류","delta":"삼각주","estuaire":"하구","berge":"강둑","noyade":"익사","crue":"증수","nappe phréatique":"지하수",
"jaillir":"솟구치다","s'effondrer":"무너지다","surgir":"불쑥 나타나다","se répandre":"퍼지다","déborder":"넘치다","engloutir":"삼키다","dissoudre":"녹이다","s'évaporer":"증발하다","congeler":"얼리다","fondre":"녹다",
"tricot":"뜨개질","couture":"바느질","broderie":"자수","poterie":"도예","aquarelle":"수채화","calligraphie":"서예","origami":"종이접기","maquette":"모형","échecs":"체스","jeu de dames":"체커",
"nation":"국가","peuple":"국민","société":"사회","droit":"권리","devoir":"의무","voter":"투표하다","justice":"정의","contrat":"계약","signer":"서명하다","remboursement":"환불","entretien":"유지 보수","délai":"기한","effort":"노력","progrès":"진보","résultat":"결과",
"quotidien":"일상적인","hebdomadaire":"주간의","mensuel":"월간의","annuel":"연간의","immédiat":"즉각적인","soudain":"갑작스러운","progressif":"점진적인","définitif":"최종적인","efficace":"효과적인","inutile":"쓸모없는","évident":"명백한","compliqué":"복잡한","précis":"정확한","vague":"모호한","sincère":"진실한","avare":"인색한","impoli":"무례한","imprudent":"경솔한","lâche":"비겁한","fou":"미친","en effet":"과연","autrement dit":"다시 말해서","dorénavant":"앞으로는",
"jurer":"맹세하다","pardonner":"용서하다","trahir":"배신하다","se venger":"복수하다","prouver":"증명하다","féliciter":"축하하다","encourager":"격려하다","consoler":"위로하다","rassurer":"안심시키다","interdire":"금지하다","autoriser":"허가하다","obéir":"복종하다","désobéir":"거역하다","punir":"벌하다","récompenser":"보상하다","menacer":"위협하다","supplier":"애원하다","soupçonner":"수상히 여기다","insister":"고집하다","céder":"양보하다","parier":"내기하다",
"océan":"대양","atmosphère":"대기","oxygène":"산소","espèce":"종","électricité":"전기","robot":"로봇","éclipse":"일식",
"fer":"철","acier":"강철","sable":"모래","colle":"접착제","peinture":"페인트","aiguille":"바늘","construire":"짓다","casser":"부수다","visser":"나사를 조이다",
"vinaigre":"식초","moutarde":"겨자","sauce":"소스","ingrédient":"재료","congélateur":"냉동고","mixeur":"믹서","tiers":"3분의 1","plusieurs":"여러","quelques":"몇몇","aucun":"하나도 없는","chaque":"각각의","au moins":"적어도","au maximum":"최대한"
},
ar:{
"nourrisson":"طفل رضيع","adolescence":"مراهقة","jeunesse":"شباب","majorité":"سن الرشد","vieillesse":"شيخوخة","décès":"وفاة","état civil":"الحالة المدنية","espérance de vie":"متوسط العمر",
"argument":"حجة","réfuter":"يدحض","nuancer":"يدقق","objection":"اعتراض","porte-parole":"متحدث رسمي","compromis":"حل وسط","consensus":"إجماع","polémique":"جدل","controverse":"خلاف","mauvaise foi":"سوء نية",
"mosquée":"مسجد","synagogue":"كنيس","temple":"معبد","prière":"صلاة","pèlerinage":"حج","croyance":"معتقد","foi":"إيمان","athée":"ملحد","rite":"شعيرة","laïcité":"علمانية",
"licence":"بكالوريوس","master":"ماجستير","doctorat":"دكتوراه","thèse":"أطروحة","soutenance":"مناقشة الأطروحة","amphithéâtre":"مدرج جامعي","bourse":"منحة دراسية","inscription":"تسجيل","recherche scientifique":"بحث علمي","stage de fin d'études":"تدريب التخرج",
"hébergement":"إقامة","itinéraire":"مسار","formalités":"إجراءات","visa":"تأشيرة","assurance voyage":"تأمين سفر","escale":"توقف مؤقت","hors saison":"خارج الموسم","haute saison":"ذروة الموسم","dépaysement":"تغيير الأجواء","office de tourisme":"مكتب سياحة",
"échauffement":"إحماء","étirement":"تمدد","endurance":"قدرة على التحمل","souffle":"نفس","transpiration":"تعرق","courbature":"ألم عضلي","récupération":"استشفاء","dopage":"منشطات","performance":"أداء","esprit d'équipe":"روح الفريق",
"barrage":"سد","écluse":"هويس","affluent":"رافد","delta":"دلتا","estuaire":"مصب","berge":"ضفة","noyade":"غرق","crue":"فيضان النهر","nappe phréatique":"مياه جوفية",
"jaillir":"يتدفق","s'effondrer":"ينهار","surgir":"يظهر فجأة","se répandre":"ينتشر","déborder":"يفيض","engloutir":"يبتلع","dissoudre":"يذيب","s'évaporer":"يتبخر","congeler":"يجمد","fondre":"يذوب",
"tricot":"حياكة","couture":"خياطة","broderie":"تطريز","poterie":"فخار","aquarelle":"ألوان مائية","calligraphie":"فن الخط","origami":"أوريغامي","maquette":"مجسم","échecs":"شطرنج","jeu de dames":"لعبة الداما",
"nation":"أمة","peuple":"شعب","société":"مجتمع","droit":"حق","devoir":"واجب","voter":"يصوت","justice":"عدالة","contrat":"عقد","signer":"يوقع","remboursement":"استرداد المال","entretien":"صيانة","délai":"مهلة","effort":"جهد","progrès":"تقدم","résultat":"نتيجة",
"quotidien":"يومي","hebdomadaire":"أسبوعي","mensuel":"شهري","annuel":"سنوي","immédiat":"فوري","soudain":"مفاجئ","progressif":"تدريجي","définitif":"نهائي","efficace":"فعال","inutile":"عديم الفائدة","évident":"بديهي","compliqué":"معقد","précis":"مضبوط","vague":"غامض","sincère":"مخلص","avare":"بخيل","impoli":"وقح","imprudent":"متهور","lâche":"جبان","fou":"مجنون","en effet":"فعلاً","autrement dit":"بعبارة أخرى","dorénavant":"منذ الآن",
"jurer":"يقسم","pardonner":"يسامح","trahir":"يخون","se venger":"ينتقم","prouver":"يثبت","féliciter":"يهنئ","encourager":"يشجع","consoler":"يواسي","rassurer":"يطمئن","interdire":"يمنع","autoriser":"يسمح","obéir":"يطيع","désobéir":"يعصي","punir":"يعاقب","récompenser":"يكافئ","menacer":"يهدد","supplier":"يتوسل","soupçonner":"يشتبه","insister":"يصر","céder":"يتنازل","parier":"يراهن",
"océan":"محيط","atmosphère":"غلاف جوي","oxygène":"أكسجين","espèce":"نوع","électricité":"كهرباء","robot":"روبوت","éclipse":"كسوف",
"fer":"حديد","acier":"فولاذ","sable":"رمل","colle":"غراء","peinture":"طلاء","aiguille":"إبرة","construire":"يبني","casser":"يكسر","visser":"يشد البرغي",
"vinaigre":"خل","moutarde":"خردل","sauce":"صلصة","ingrédient":"مكونات","congélateur":"فريزر","mixeur":"خلاط","tiers":"ثلث","plusieurs":"عدة","quelques":"بضعة","aucun":"ولا واحد","chaque":"كل واحد","au moins":"على الأقل","au maximum":"على الأكثر"
}
};
LANGS2.forEach(function(l){ var t2=LEX2T[l]||{}; Object.keys(t2).forEach(function(k){ LEX2[l][k]=t2[k]; }); });

/* ===== VAGUE ENVIRONNEMENT / CLIMAT (v2.92.0) — 24 mots ×14 langues, 3 unités ===== */
var CURRICULUM_J = [
  {t:"Le climat 🌡️", c:"#22c55e", L:[
    {t:"Se réchauffer", w:["réchauffer","refroidir","gaz","carbone"]},
    {t:"La fonte", w:["fonte","glacier","banquise","catastrophe"]} ]},
  {t:"Protéger la planète ♻️", c:"#14b8a6", L:[
    {t:"Les déchets", w:["polluer","déchet","poubelle","jeter"]},
    {t:"Réduire", w:["ramasser","tri sélectif","compost","gaspillage"]} ]},
  {t:"Les gestes verts 🌱", c:"#12b981", L:[
    {t:"Jardiner", w:["planter","arroser","cultiver","graine"]},
    {t:"À la maison", w:["racine","robinet","ampoule","renouvelable"]} ]}
];
CURRICULUM_J.forEach(function(u){ CURRICULUM.push(u); });

var NEWV15 = {
  "réchauffer":{"en":"to warm up","it":"riscaldare","es":"calentar","de":"erwärmen","pt":"aquecer","nl":"opwarmen"},
  "refroidir":{"en":"to cool down","it":"raffreddare","es":"enfriar","de":"abkühlen","pt":"arrefecer","nl":"afkoelen"},
  "gaz":{"en":"gas","it":"gas","es":"gas","de":"Gas","pt":"gás","nl":"gas"},
  "carbone":{"en":"carbon","it":"carbonio","es":"carbono","de":"Kohlenstoff","pt":"carbono","nl":"koolstof"},
  "fonte":{"en":"melting","it":"fusione","es":"deshielo","de":"Schmelze","pt":"degelo","nl":"dooi"},
  "glacier":{"en":"glacier","it":"ghiacciaio","es":"glaciar","de":"Gletscher","pt":"glaciar","nl":"gletsjer"},
  "banquise":{"en":"sea ice","it":"banchisa","es":"banquisa","de":"Packeis","pt":"banco de gelo","nl":"pakijs"},
  "catastrophe":{"en":"disaster","it":"catastrofe","es":"catástrofe","de":"Katastrophe","pt":"catástrofe","nl":"ramp"},
  "polluer":{"en":"to pollute","it":"inquinare","es":"contaminar","de":"verschmutzen","pt":"poluir","nl":"vervuilen"},
  "déchet":{"en":"trash","it":"rifiuto","es":"residuo","de":"Abfall","pt":"resíduo","nl":"afval"},
  "poubelle":{"en":"trash can","it":"pattumiera","es":"cubo de basura","de":"Mülleimer","pt":"caixote do lixo","nl":"prullenbak"},
  "jeter":{"en":"to throw away","it":"buttare","es":"desechar","de":"wegwerfen","pt":"deitar fora","nl":"weggooien"},
  "ramasser":{"en":"to pick up","it":"raccogliere","es":"recoger","de":"aufheben","pt":"recolher","nl":"oprapen"},
  "tri sélectif":{"en":"waste sorting","it":"raccolta differenziata","es":"recogida selectiva","de":"Mülltrennung","pt":"recolha seletiva","nl":"afvalscheiding"},
  "compost":{"en":"compost","it":"compost","es":"compost","de":"Kompost","pt":"composto","nl":"compost"},
  "gaspillage":{"en":"wastefulness","it":"spreco","es":"desperdicio","de":"Verschwendung","pt":"desperdício","nl":"verspilling"},
  "planter":{"en":"to plant","it":"piantare","es":"plantar","de":"pflanzen","pt":"plantar","nl":"planten"},
  "arroser":{"en":"to water","it":"annaffiare","es":"regar","de":"bewässern","pt":"regar","nl":"begieten"},
  "cultiver":{"en":"to cultivate","it":"coltivare","es":"cultivar","de":"anbauen","pt":"cultivar","nl":"verbouwen"},
  "graine":{"en":"seed","it":"seme","es":"semilla","de":"Samen","pt":"semente","nl":"zaad"},
  "racine":{"en":"root","it":"radice","es":"raíz","de":"Wurzel","pt":"raiz","nl":"wortel"},
  "robinet":{"en":"tap","it":"rubinetto","es":"grifo","de":"Wasserhahn","pt":"torneira","nl":"kraan"},
  "ampoule":{"en":"light bulb","it":"lampadina","es":"bombilla","de":"Glühbirne","pt":"lâmpada elétrica","nl":"gloeilamp"},
  "renouvelable":{"en":"renewable","it":"rinnovabile","es":"renovable","de":"erneuerbar","pt":"renovável","nl":"hernieuwbaar"}
};
LANGS.forEach(function(l){ Object.keys(NEWV15).forEach(function(k){ if(NEWV15[k][l]) LEX[l][k]=NEWV15[k][l]; }); });

var LEX2ENV = {
  pl:{"réchauffer":"ogrzewać","refroidir":"chłodzić","gaz":"gaz","carbone":"węgiel","fonte":"topnienie","glacier":"lodowiec","banquise":"kra lodowa","catastrophe":"katastrofa","polluer":"zanieczyszczać","déchet":"odpad","poubelle":"kosz na śmieci","jeter":"wyrzucać","ramasser":"zbierać","tri sélectif":"segregacja odpadów","compost":"kompost","gaspillage":"marnotrawstwo","planter":"sadzić","arroser":"podlewać","cultiver":"uprawiać","graine":"nasiono","racine":"korzeń","robinet":"kran","ampoule":"żarówka","renouvelable":"odnawialny"},
  ru:{"réchauffer":"нагревать","refroidir":"охлаждать","gaz":"газ","carbone":"углерод","fonte":"таяние","glacier":"ледник","banquise":"паковый лёд","catastrophe":"катастрофа","polluer":"загрязнять","déchet":"отход","poubelle":"мусорное ведро","jeter":"выбрасывать","ramasser":"собирать","tri sélectif":"сортировка мусора","compost":"компост","gaspillage":"расточительство","planter":"сажать","arroser":"поливать","cultiver":"выращивать","graine":"семя","racine":"корень","robinet":"кран","ampoule":"лампочка","renouvelable":"возобновляемый"},
  uk:{"réchauffer":"нагрівати","refroidir":"охолоджувати","gaz":"газ","carbone":"вуглець","fonte":"танення","glacier":"льодовик","banquise":"паковий лід","catastrophe":"катастрофа","polluer":"забруднювати","déchet":"відхід","poubelle":"смітник","jeter":"викидати","ramasser":"збирати","tri sélectif":"сортування сміття","compost":"компост","gaspillage":"марнотратство","planter":"садити","arroser":"поливати","cultiver":"вирощувати","graine":"насіння","racine":"корінь","robinet":"кран","ampoule":"лампочка","renouvelable":"відновлюваний"},
  cs:{"réchauffer":"ohřívat","refroidir":"chladit","gaz":"plyn","carbone":"uhlík","fonte":"tání","glacier":"ledovec","banquise":"mořský led","catastrophe":"katastrofa","polluer":"znečišťovat","déchet":"odpadek","poubelle":"koš na odpadky","jeter":"vyhazovat","ramasser":"sbírat","tri sélectif":"třídění odpadu","compost":"kompost","gaspillage":"plýtvání","planter":"sázet","arroser":"zalévat","cultiver":"pěstovat","graine":"semeno","racine":"kořen","robinet":"kohoutek","ampoule":"žárovka","renouvelable":"obnovitelný"},
  zh:{"réchauffer":"加热","refroidir":"冷却","gaz":"气体","carbone":"碳","fonte":"消融","glacier":"冰川","banquise":"浮冰","catastrophe":"灾难","polluer":"污染","déchet":"垃圾","poubelle":"垃圾桶","jeter":"扔掉","ramasser":"捡","tri sélectif":"垃圾分类","compost":"堆肥","gaspillage":"浪费","planter":"种植","arroser":"浇水","cultiver":"栽培","graine":"种子","racine":"根","robinet":"水龙头","ampoule":"灯泡","renouvelable":"可再生"},
  ja:{"réchauffer":"温めます","refroidir":"冷やします","gaz":"ガス","carbone":"炭素","fonte":"融解","glacier":"氷河","banquise":"流氷","catastrophe":"災害","polluer":"汚染します","déchet":"ごみ","poubelle":"ごみ箱","jeter":"捨てます","ramasser":"拾います","tri sélectif":"ごみの分別","compost":"堆肥","gaspillage":"無駄","planter":"植えます","arroser":"水をやります","cultiver":"栽培します","graine":"種子","racine":"根","robinet":"蛇口","ampoule":"電球","renouvelable":"再生可能"},
  ko:{"réchauffer":"데우다","refroidir":"식히다","gaz":"가스","carbone":"탄소","fonte":"해빙","glacier":"빙하","banquise":"유빙","catastrophe":"재난","polluer":"오염시키다","déchet":"쓰레기","poubelle":"쓰레기통","jeter":"버리다","ramasser":"줍다","tri sélectif":"분리수거","compost":"퇴비","gaspillage":"낭비","planter":"심다","arroser":"물을 주다","cultiver":"재배하다","graine":"씨앗","racine":"뿌리","robinet":"수도꼭지","ampoule":"전구","renouvelable":"재생 가능한"},
  ar:{"réchauffer":"يُدفئ","refroidir":"يُبرِّد","gaz":"غاز","carbone":"كربون","fonte":"ذوبان","glacier":"نهر جليدي","banquise":"جليد بحري","catastrophe":"كارثة","polluer":"يلوث","déchet":"نفاية","poubelle":"سلة المهملات","jeter":"يتخلّص من","ramasser":"يجمع","tri sélectif":"فرز النفايات","compost":"سماد","gaspillage":"تبذير","planter":"يغرس","arroser":"يسقي","cultiver":"يستزرع","graine":"بذرة","racine":"جذر","robinet":"صنبور","ampoule":"مصباح كهربائي","renouvelable":"متجدد"}
};
LANGS2.forEach(function(l){ var e2=LEX2ENV[l]||{}; Object.keys(e2).forEach(function(k){ LEX2[l][k]=e2[k]; }); });


/* ===== VAGUE NUMÉRIQUE / TECHNO (v2.93.0) — 24 mots ×14 langues, 3 unités ===== */
var CURRICULUM_I = [
  {t:"L'ordinateur 💻", c:"#3b82f6", L:[
    {t:"Les fichiers", w:["dossier","enregistrer","supprimer","copier"]},
    {t:"Sur le web", w:["navigateur","moteur de recherche","lien","imprimer"]} ]},
  {t:"Se connecter 🌐", c:"#8b5cf6", L:[
    {t:"Les messages", w:["messagerie","boîte mail","pièce jointe","abonnement"]},
    {t:"Sécurité", w:["code","pirate","virus","wifi"]} ]},
  {t:"Le matériel 🔌", c:"#f97316", L:[
    {t:"Les appareils", w:["smartphone","clé USB","chargeur","câble"]},
    {t:"Son & image", w:["cliquer","haut-parleur","micro","webcam"]} ]}
];
CURRICULUM_I.forEach(function(u){ CURRICULUM.push(u); });

var NEWV16 = {
  "dossier":{"en":"folder","it":"cartella","es":"carpeta","de":"Ordner","pt":"pasta","nl":"map"},
  "navigateur":{"en":"browser","it":"browser","es":"navegador","de":"Browser","pt":"navegador","nl":"browser"},
  "moteur de recherche":{"en":"search engine","it":"motore di ricerca","es":"motor de búsqueda","de":"Suchmaschine","pt":"motor de busca","nl":"zoekmachine"},
  "enregistrer":{"en":"to save","it":"salvare","es":"guardar","de":"speichern","pt":"guardar","nl":"opslaan"},
  "supprimer":{"en":"to delete","it":"eliminare","es":"eliminar","de":"löschen","pt":"eliminar","nl":"verwijderen"},
  "copier":{"en":"to copy","it":"copiare","es":"copiar","de":"kopieren","pt":"copiar","nl":"kopiëren"},
  "imprimer":{"en":"to print","it":"stampare","es":"imprimir","de":"drucken","pt":"imprimir","nl":"afdrukken"},
  "lien":{"en":"link","it":"collegamento","es":"enlace","de":"Link","pt":"hiperligação","nl":"link"},
  "messagerie":{"en":"messaging","it":"messaggistica","es":"mensajería","de":"Nachrichtendienst","pt":"mensagens","nl":"berichten"},
  "boîte mail":{"en":"inbox","it":"posta in arrivo","es":"bandeja de entrada","de":"Posteingang","pt":"caixa de entrada","nl":"postvak IN"},
  "pièce jointe":{"en":"attachment","it":"allegato","es":"adjunto","de":"Anhang","pt":"anexo","nl":"bijlage"},
  "abonnement":{"en":"subscription","it":"abbonamento","es":"suscripción","de":"Abonnement","pt":"subscrição","nl":"abonnement"},
  "code":{"en":"code","it":"codice","es":"código","de":"Code","pt":"código","nl":"code"},
  "pirate":{"en":"hacker","it":"hacker","es":"hacker","de":"Hacker","pt":"hacker","nl":"hacker"},
  "virus":{"en":"virus","it":"virus","es":"virus","de":"Virus","pt":"vírus","nl":"virus"},
  "wifi":{"en":"Wi-Fi","it":"wifi","es":"wifi","de":"WLAN","pt":"wifi","nl":"wifi"},
  "smartphone":{"en":"smartphone","it":"smartphone","es":"teléfono inteligente","de":"Smartphone","pt":"smartphone","nl":"smartphone"},
  "clé USB":{"en":"USB stick","it":"chiavetta USB","es":"memoria USB","de":"USB-Stick","pt":"pen drive","nl":"USB-stick"},
  "chargeur":{"en":"charger","it":"caricabatterie","es":"cargador","de":"Ladegerät","pt":"carregador","nl":"oplader"},
  "câble":{"en":"cable","it":"cavo","es":"cable","de":"Kabel","pt":"cabo","nl":"kabel"},
  "cliquer":{"en":"to click","it":"cliccare","es":"hacer clic","de":"klicken","pt":"clicar","nl":"klikken"},
  "haut-parleur":{"en":"speaker","it":"altoparlante","es":"altavoz","de":"Lautsprecher","pt":"altifalante","nl":"luidspreker"},
  "micro":{"en":"microphone","it":"microfono","es":"micrófono","de":"Mikrofon","pt":"microfone","nl":"microfoon"},
  "webcam":{"en":"webcam","it":"webcam","es":"cámara web","de":"Webcam","pt":"webcam","nl":"webcam"}
};
LANGS.forEach(function(l){ Object.keys(NEWV16).forEach(function(k){ if(NEWV16[k][l]) LEX[l][k]=NEWV16[k][l]; }); });

var LEX2DIG = {
  pl:{"dossier":"folder","navigateur":"przeglądarka","moteur de recherche":"wyszukiwarka","enregistrer":"zapisywać","supprimer":"usuwać","copier":"kopiować","imprimer":"drukować","lien":"link","messagerie":"komunikator","boîte mail":"skrzynka odbiorcza","pièce jointe":"załącznik","abonnement":"subskrypcja","code":"kod","pirate":"haker","virus":"wirus","wifi":"wifi","smartphone":"smartfon","clé USB":"pendrive","chargeur":"ładowarka","câble":"kabel","cliquer":"klikać","haut-parleur":"głośnik","micro":"mikrofon","webcam":"kamera internetowa"},
  ru:{"dossier":"папка","navigateur":"браузер","moteur de recherche":"поисковик","enregistrer":"сохранять","supprimer":"удалять","copier":"копировать","imprimer":"печатать","lien":"ссылка","messagerie":"мессенджер","boîte mail":"входящие","pièce jointe":"вложение","abonnement":"подписка","code":"код","pirate":"хакер","virus":"вирус","wifi":"вайфай","smartphone":"смартфон","clé USB":"флешка","chargeur":"зарядка","câble":"кабель","cliquer":"кликать","haut-parleur":"динамик","micro":"микрофон","webcam":"веб-камера"},
  uk:{"dossier":"папка","navigateur":"браузер","moteur de recherche":"пошуковик","enregistrer":"зберігати","supprimer":"видаляти","copier":"копіювати","imprimer":"друкувати","lien":"посилання","messagerie":"месенджер","boîte mail":"вхідні","pièce jointe":"вкладення","abonnement":"підписка","code":"код","pirate":"хакер","virus":"вірус","wifi":"вайфай","smartphone":"смартфон","clé USB":"флешка","chargeur":"зарядний пристрій","câble":"кабель","cliquer":"клікати","haut-parleur":"динамік","micro":"мікрофон","webcam":"вебкамера"},
  cs:{"dossier":"složka","navigateur":"prohlížeč","moteur de recherche":"vyhledávač","enregistrer":"ukládat","supprimer":"mazat","copier":"kopírovat","imprimer":"tisknout","lien":"odkaz","messagerie":"messenger","boîte mail":"doručená pošta","pièce jointe":"příloha","abonnement":"předplatné","code":"kód","pirate":"hacker","virus":"virus","wifi":"wifi","smartphone":"chytrý telefon","clé USB":"flash disk","chargeur":"nabíječka","câble":"kabel","cliquer":"klikat","haut-parleur":"reproduktor","micro":"mikrofon","webcam":"webkamera"},
  zh:{"dossier":"文件夹","navigateur":"浏览器","moteur de recherche":"搜索引擎","enregistrer":"保存","supprimer":"删除","copier":"复制","imprimer":"打印","lien":"链接","messagerie":"即时通讯","boîte mail":"收件箱","pièce jointe":"附件","abonnement":"订阅","code":"代码","pirate":"黑客","virus":"病毒","wifi":"无线网络","smartphone":"智能手机","clé USB":"U盘","chargeur":"充电器","câble":"电缆","cliquer":"点击","haut-parleur":"扬声器","micro":"麦克风","webcam":"网络摄像头"},
  ja:{"dossier":"フォルダ","navigateur":"ブラウザ","moteur de recherche":"検索エンジン","enregistrer":"保存します","supprimer":"削除します","copier":"コピーします","imprimer":"印刷します","lien":"リンク","messagerie":"メッセージアプリ","boîte mail":"受信箱","pièce jointe":"添付ファイル","abonnement":"定期購読","code":"コード","pirate":"ハッカー","virus":"ウイルス","wifi":"Wi-Fi","smartphone":"スマートフォン","clé USB":"USBメモリ","chargeur":"充電器","câble":"ケーブル","cliquer":"クリックします","haut-parleur":"スピーカー","micro":"マイク","webcam":"ウェブカメラ"},
  ko:{"dossier":"폴더","navigateur":"브라우저","moteur de recherche":"검색 엔진","enregistrer":"저장하다","supprimer":"삭제하다","copier":"복사하다","imprimer":"인쇄하다","lien":"링크","messagerie":"메신저","boîte mail":"받은편지함","pièce jointe":"첨부파일","abonnement":"구독","code":"코드","pirate":"해커","virus":"바이러스","wifi":"와이파이","smartphone":"스마트폰","clé USB":"USB 메모리","chargeur":"충전기","câble":"케이블","cliquer":"클릭하다","haut-parleur":"스피커","micro":"마이크","webcam":"웹캠"},
  ar:{"dossier":"مجلد","navigateur":"متصفح","moteur de recherche":"محرك بحث","enregistrer":"يحفظ","supprimer":"يحذف","copier":"ينسخ","imprimer":"يطبع","lien":"رابط","messagerie":"مراسلة","boîte mail":"صندوق الوارد","pièce jointe":"مرفق","abonnement":"اشتراك","code":"رمز","pirate":"قرصان","virus":"فيروس","wifi":"واي فاي","smartphone":"هاتف ذكي","clé USB":"فلاش USB","chargeur":"شاحن","câble":"كابل","cliquer":"ينقر","haut-parleur":"مكبر الصوت","micro":"ميكروفون","webcam":"كاميرا ويب"}
};
LANGS2.forEach(function(l){ var d3=LEX2DIG[l]||{}; Object.keys(d3).forEach(function(k){ LEX2[l][k]=d3[k]; }); });


/* ===== VAGUE SANTÉ / CORPS (v2.94.0) — 24 mots ×14 langues, 3 unités ===== */
var CURRICULUM_H = [
  {t:"Tomber malade 🤒", c:"#ef4444", L:[
    {t:"Les maux", w:["toux","mal de tête","mal de ventre","angine"]},
    {t:"Bobos", w:["nausée","se blesser","se brûler","brûlure"]} ]},
  {t:"Se soigner 💊", c:"#10b981", L:[
    {t:"Les remèdes", w:["comprimé","pilule","sirop","avaler"]},
    {t:"Chez le médecin", w:["soigner","urgences","tension","carie"]} ]},
  {t:"Forme & corps 🏃", c:"#f59e0b", L:[
    {t:"En forme", w:["fatigue","insomnie","vitamine","peser"]},
    {t:"Le corps", w:["maigrir","grossir","os","articulation"]} ]}
];
CURRICULUM_H.forEach(function(u){ CURRICULUM.push(u); });

var NEWV17 = {
  "toux":{"en":"cough","it":"tosse","es":"tos","de":"Husten","pt":"tosse","nl":"hoest"},
  "mal de tête":{"en":"headache","it":"mal di testa","es":"dolor de cabeza","de":"Kopfschmerzen","pt":"dor de cabeça","nl":"hoofdpijn"},
  "mal de ventre":{"en":"stomachache","it":"mal di pancia","es":"dolor de barriga","de":"Bauchschmerzen","pt":"dor de barriga","nl":"buikpijn"},
  "angine":{"en":"sore throat","it":"mal di gola","es":"dolor de garganta","de":"Halsschmerzen","pt":"dor de garganta","nl":"keelpijn"},
  "nausée":{"en":"nausea","it":"nausea","es":"náusea","de":"Übelkeit","pt":"náusea","nl":"misselijkheid"},
  "se blesser":{"en":"to get hurt","it":"farsi male","es":"lastimarse","de":"sich verletzen","pt":"magoar-se","nl":"zich bezeren"},
  "se brûler":{"en":"to get burned","it":"scottarsi","es":"quemarse","de":"sich verbrennen","pt":"queimar-se","nl":"zich branden"},
  "brûlure":{"en":"burn","it":"ustione","es":"quemadura","de":"Verbrennung","pt":"queimadura","nl":"brandwond"},
  "comprimé":{"en":"tablet","it":"compressa","es":"comprimido","de":"Tablette","pt":"comprimido","nl":"tablet"},
  "pilule":{"en":"pill","it":"pillola","es":"píldora","de":"Pille","pt":"pílula","nl":"pil"},
  "sirop":{"en":"syrup","it":"sciroppo","es":"jarabe","de":"Sirup","pt":"xarope","nl":"siroop"},
  "avaler":{"en":"to swallow","it":"deglutire","es":"tragar","de":"schlucken","pt":"engolir","nl":"slikken"},
  "soigner":{"en":"to treat","it":"curare","es":"tratar","de":"behandeln","pt":"tratar","nl":"behandelen"},
  "urgences":{"en":"emergency room","it":"pronto soccorso","es":"urgencias","de":"Notaufnahme","pt":"urgências","nl":"spoedeisende hulp"},
  "tension":{"en":"blood pressure","it":"pressione","es":"tensión","de":"Blutdruck","pt":"tensão arterial","nl":"bloeddruk"},
  "carie":{"en":"cavity","it":"carie","es":"caries","de":"Karies","pt":"cárie","nl":"gaatje"},
  "fatigue":{"en":"tiredness","it":"stanchezza","es":"cansancio","de":"Müdigkeit","pt":"cansaço","nl":"vermoeidheid"},
  "insomnie":{"en":"insomnia","it":"insonnia","es":"insomnio","de":"Schlaflosigkeit","pt":"insónia","nl":"slapeloosheid"},
  "vitamine":{"en":"vitamin","it":"vitamina","es":"vitamina","de":"Vitamin","pt":"vitamina","nl":"vitamine"},
  "peser":{"en":"to weigh","it":"pesare","es":"pesar","de":"wiegen","pt":"pesar","nl":"wegen"},
  "maigrir":{"en":"to lose weight","it":"dimagrire","es":"adelgazar","de":"abnehmen","pt":"emagrecer","nl":"afvallen"},
  "grossir":{"en":"to gain weight","it":"ingrassare","es":"engordar","de":"zunehmen","pt":"engordar","nl":"aankomen"},
  "os":{"en":"bone","it":"osso","es":"hueso","de":"Knochen","pt":"osso","nl":"bot"},
  "articulation":{"en":"joint","it":"articolazione","es":"articulación","de":"Gelenk","pt":"articulação","nl":"gewricht"}
};
LANGS.forEach(function(l){ Object.keys(NEWV17).forEach(function(k){ if(NEWV17[k][l]) LEX[l][k]=NEWV17[k][l]; }); });

var LEX2MED = {
  pl:{"toux":"kaszel","mal de tête":"ból głowy","mal de ventre":"ból brzucha","angine":"ból gardła","nausée":"mdłości","se blesser":"zranić się","se brûler":"poparzyć się","brûlure":"oparzenie","comprimé":"tabletka","pilule":"pigułka","sirop":"syrop","avaler":"połykać","soigner":"leczyć","urgences":"izba przyjęć","tension":"ciśnienie","carie":"próchnica","fatigue":"zmęczenie","insomnie":"bezsenność","vitamine":"witamina","peser":"ważyć","maigrir":"chudnąć","grossir":"tyć","os":"kość","articulation":"staw"},
  ru:{"toux":"кашель","mal de tête":"головная боль","mal de ventre":"боль в животе","angine":"боль в горле","nausée":"тошнота","se blesser":"пораниться","se brûler":"обжечься","brûlure":"ожог","comprimé":"таблетка","pilule":"пилюля","sirop":"сироп","avaler":"глотать","soigner":"лечить","urgences":"неотложка","tension":"давление","carie":"кариес","fatigue":"усталость","insomnie":"бессонница","vitamine":"витамин","peser":"взвешивать","maigrir":"худеть","grossir":"толстеть","os":"кость","articulation":"сустав"},
  uk:{"toux":"кашель","mal de tête":"головний біль","mal de ventre":"біль у животі","angine":"біль у горлі","nausée":"нудота","se blesser":"поранитися","se brûler":"обпектися","brûlure":"опік","comprimé":"таблетка","pilule":"пігулка","sirop":"сироп","avaler":"ковтати","soigner":"лікувати","urgences":"невідкладна допомога","tension":"тиск","carie":"карієс","fatigue":"втома","insomnie":"безсоння","vitamine":"вітамін","peser":"зважувати","maigrir":"худнути","grossir":"товстіти","os":"кістка","articulation":"суглоб"},
  cs:{"toux":"kašel","mal de tête":"bolest hlavy","mal de ventre":"bolest břicha","angine":"bolest v krku","nausée":"nevolnost","se blesser":"zranit se","se brûler":"spálit se","brûlure":"popálenina","comprimé":"tableta","pilule":"pilulka","sirop":"sirup","avaler":"polykat","soigner":"léčit","urgences":"urgentní příjem","tension":"tlak","carie":"zubní kaz","fatigue":"únava","insomnie":"nespavost","vitamine":"vitamín","peser":"vážit","maigrir":"hubnout","grossir":"tloustnout","os":"kost","articulation":"kloub"},
  zh:{"toux":"咳嗽","mal de tête":"头痛","mal de ventre":"肚子痛","angine":"咽喉痛","nausée":"恶心","se blesser":"受伤","se brûler":"烫伤","brûlure":"烧伤","comprimé":"药片","pilule":"药丸","sirop":"糖浆","avaler":"吞","soigner":"治疗","urgences":"急诊科","tension":"血压","carie":"蛀牙","fatigue":"疲劳","insomnie":"失眠","vitamine":"维生素","peser":"称重","maigrir":"减肥","grossir":"增肥","os":"骨头","articulation":"关节"},
  ja:{"toux":"咳","mal de tête":"頭痛","mal de ventre":"腹痛","angine":"のどの痛み","nausée":"吐き気","se blesser":"けがをします","se brûler":"やけどします","brûlure":"やけど","comprimé":"錠剤","pilule":"丸薬","sirop":"シロップ","avaler":"飲み込みます","soigner":"治療します","urgences":"救急外来","tension":"血圧","carie":"虫歯","fatigue":"疲れ","insomnie":"不眠","vitamine":"ビタミン","peser":"量ります","maigrir":"痩せます","grossir":"太ります","os":"骨","articulation":"関節"},
  ko:{"toux":"기침","mal de tête":"두통","mal de ventre":"복통","angine":"인후염","nausée":"메스꺼움","se blesser":"다치다","se brûler":"데다","brûlure":"화상","comprimé":"정제","pilule":"알약","sirop":"시럽","avaler":"삼키다","soigner":"치료하다","urgences":"응급실","tension":"혈압","carie":"충치","fatigue":"피로","insomnie":"불면증","vitamine":"비타민","peser":"무게를 재다","maigrir":"살을 빼다","grossir":"살이 찌다","os":"뼈","articulation":"관절"},
  ar:{"toux":"سعال","mal de tête":"صداع","mal de ventre":"ألم في المعدة","angine":"التهاب الحلق","nausée":"غثيان","se blesser":"يُصاب","se brûler":"يحترق","brûlure":"حرق","comprimé":"قرص","pilule":"حبة دواء","sirop":"شراب","avaler":"يبتلع","soigner":"يعالج","urgences":"الطوارئ","tension":"ضغط الدم","carie":"تسوس","fatigue":"تعب","insomnie":"أرق","vitamine":"فيتامين","peser":"يزن","maigrir":"ينحف","grossir":"يسمن","os":"عظم","articulation":"مفصل"}
};
LANGS2.forEach(function(l){ var m2=LEX2MED[l]||{}; Object.keys(m2).forEach(function(k){ LEX2[l][k]=m2[k]; }); });


/* ===== VAGUE TRAVAIL / CARACTÈRE / ÉMOTIONS (v2.96.0) — 24 mots ×14 langues, 3 unités ===== */
var CURRICULUM_G = [
  {t:"Au travail 💼", c:"#0ea5e9", L:[
    {t:"Les gens", w:["employé","ouvrier","chantier"]},
    {t:"Le chantier", w:["devis","prime","pause"]} ]},
  {t:"Le caractère 🧠", c:"#a855f7", L:[
    {t:"Qualités & défauts", w:["travailleur","menteur","discret","ambitieux"]},
    {t:"L'esprit", w:["malin","bête","confiant","méfiant","distrait","modeste"]} ]},
  {t:"Les émotions 😊", c:"#f43f5e", L:[
    {t:"Ressentis", w:["gêné","soulagé","enthousiaste","épuisé"]},
    {t:"L'humeur", w:["impatient","de bonne humeur","de mauvaise humeur","avoir honte"]} ]}
];
CURRICULUM_G.forEach(function(u){ CURRICULUM.push(u); });

var NEWV18 = {
  "employé":{"en":"employee","it":"dipendente","es":"empleado","de":"Angestellter","pt":"empregado","nl":"werknemer"},
  "ouvrier":{"en":"worker","it":"operaio","es":"obrero","de":"Arbeiter","pt":"operário","nl":"arbeider"},
  "chantier":{"en":"construction site","it":"cantiere","es":"obra","de":"Baustelle","pt":"estaleiro","nl":"bouwplaats"},
  "devis":{"en":"quote","it":"preventivo","es":"presupuesto","de":"Kostenvoranschlag","pt":"orçamento","nl":"offerte"},
  "prime":{"en":"bonus","it":"premio","es":"prima","de":"Bonus","pt":"prémio","nl":"bonus"},
  "pause":{"en":"break","it":"pausa","es":"pausa","de":"Pause","pt":"pausa","nl":"pauze"},
  "travailleur":{"en":"hard-working","it":"lavoratore","es":"trabajador","de":"fleißig","pt":"trabalhador","nl":"hardwerkend"},
  "menteur":{"en":"liar","it":"bugiardo","es":"mentiroso","de":"Lügner","pt":"mentiroso","nl":"leugenaar"},
  "discret":{"en":"discreet","it":"discreto","es":"discreto","de":"diskret","pt":"discreto","nl":"discreet"},
  "ambitieux":{"en":"ambitious","it":"ambizioso","es":"ambicioso","de":"ehrgeizig","pt":"ambicioso","nl":"ambitieus"},
  "malin":{"en":"cunning","it":"furbo","es":"astuto","de":"schlau","pt":"esperto","nl":"sluw"},
  "bête":{"en":"silly","it":"stupido","es":"tonto","de":"dumm","pt":"tolo","nl":"dom"},
  "confiant":{"en":"confident","it":"fiducioso","es":"confiado","de":"zuversichtlich","pt":"confiante","nl":"zelfverzekerd"},
  "méfiant":{"en":"wary","it":"diffidente","es":"desconfiado","de":"misstrauisch","pt":"desconfiado","nl":"wantrouwig"},
  "distrait":{"en":"absent-minded","it":"distratto","es":"distraído","de":"zerstreut","pt":"distraído","nl":"verstrooid"},
  "modeste":{"en":"modest","it":"modesto","es":"modesto","de":"bescheiden","pt":"modesto","nl":"bescheiden"},
  "gêné":{"en":"embarrassed","it":"imbarazzato","es":"avergonzado","de":"verlegen","pt":"envergonhado","nl":"beschaamd"},
  "soulagé":{"en":"relieved","it":"sollevato","es":"aliviado","de":"erleichtert","pt":"aliviado","nl":"opgelucht"},
  "enthousiaste":{"en":"enthusiastic","it":"entusiasta","es":"entusiasta","de":"begeistert","pt":"entusiasmado","nl":"enthousiast"},
  "épuisé":{"en":"exhausted","it":"esausto","es":"agotado","de":"erschöpft","pt":"exausto","nl":"uitgeput"},
  "impatient":{"en":"impatient","it":"impaziente","es":"impaciente","de":"ungeduldig","pt":"impaciente","nl":"ongeduldig"},
  "de bonne humeur":{"en":"in a good mood","it":"di buon umore","es":"de buen humor","de":"gut gelaunt","pt":"de bom humor","nl":"goedgehumeurd"},
  "de mauvaise humeur":{"en":"in a bad mood","it":"di cattivo umore","es":"de mal humor","de":"schlecht gelaunt","pt":"de mau humor","nl":"slechtgehumeurd"},
  "avoir honte":{"en":"to be ashamed","it":"vergognarsi","es":"avergonzarse","de":"sich schämen","pt":"ter vergonha","nl":"zich schamen"}
};
LANGS.forEach(function(l){ Object.keys(NEWV18).forEach(function(k){ if(NEWV18[k][l]) LEX[l][k]=NEWV18[k][l]; }); });

var LEX2WRK = {
  pl:{"employé":"pracownik","ouvrier":"robotnik","chantier":"budowa","devis":"wycena","prime":"premia","pause":"przerwa","travailleur":"pracowity","menteur":"kłamca","discret":"dyskretny","ambitieux":"ambitny","malin":"sprytny","bête":"głupi","confiant":"pewny siebie","méfiant":"nieufny","distrait":"roztargniony","modeste":"skromny","gêné":"zażenowany","soulagé":"ulżony","enthousiaste":"entuzjastyczny","épuisé":"wyczerpany","impatient":"niecierpliwy","de bonne humeur":"w dobrym humorze","de mauvaise humeur":"w złym humorze","avoir honte":"wstydzić się"},
  ru:{"employé":"сотрудник","ouvrier":"рабочий","chantier":"стройка","devis":"смета","prime":"премия","pause":"перерыв","travailleur":"трудолюбивый","menteur":"лжец","discret":"сдержанный","ambitieux":"амбициозный","malin":"хитрый","bête":"глупый","confiant":"уверенный","méfiant":"недоверчивый","distrait":"рассеянный","modeste":"скромный","gêné":"смущённый","soulagé":"облегчённый","enthousiaste":"восторженный","épuisé":"измотанный","impatient":"нетерпеливый","de bonne humeur":"в хорошем настроении","de mauvaise humeur":"в плохом настроении","avoir honte":"стыдиться"},
  uk:{"employé":"співробітник","ouvrier":"робітник","chantier":"будівництво","devis":"кошторис","prime":"премія","pause":"перерва","travailleur":"працьовитий","menteur":"брехун","discret":"стриманий","ambitieux":"амбітний","malin":"хитрий","bête":"дурний","confiant":"впевнений","méfiant":"недовірливий","distrait":"неуважний","modeste":"скромний","gêné":"збентежений","soulagé":"полегшений","enthousiaste":"захоплений","épuisé":"виснажений","impatient":"нетерплячий","de bonne humeur":"у гарному настрої","de mauvaise humeur":"у поганому настрої","avoir honte":"соромитися"},
  cs:{"employé":"zaměstnanec","ouvrier":"dělník","chantier":"staveniště","devis":"cenová nabídka","prime":"prémie","pause":"přestávka","travailleur":"pracovitý","menteur":"lhář","discret":"diskrétní","ambitieux":"ctižádostivý","malin":"mazaný","bête":"hloupý","confiant":"sebejistý","méfiant":"nedůvěřivý","distrait":"roztržitý","modeste":"skromný","gêné":"rozpačitý","soulagé":"ulevený","enthousiaste":"nadšený","épuisé":"vyčerpaný","impatient":"netrpělivý","de bonne humeur":"v dobré náladě","de mauvaise humeur":"ve špatné náladě","avoir honte":"stydět se"},
  zh:{"employé":"员工","ouvrier":"工人","chantier":"工地","devis":"报价","prime":"奖金","pause":"休息","travailleur":"勤奋","menteur":"骗子","discret":"谨慎","ambitieux":"有野心","malin":"机灵","bête":"愚蠢","confiant":"自信","méfiant":"多疑","distrait":"心不在焉","modeste":"谦虚","gêné":"尴尬","soulagé":"松了一口气","enthousiaste":"热情","épuisé":"精疲力尽","impatient":"不耐烦","de bonne humeur":"心情好","de mauvaise humeur":"心情不好","avoir honte":"羞愧"},
  ja:{"employé":"従業員","ouvrier":"労働者","chantier":"工事現場","devis":"見積もり","prime":"ボーナス","pause":"休憩","travailleur":"勤勉","menteur":"嘘つき","discret":"控えめ","ambitieux":"野心的","malin":"ずる賢い","bête":"愚か","confiant":"自信がある","méfiant":"疑い深い","distrait":"上の空","modeste":"謙虚","gêné":"恥ずかしい","soulagé":"ほっとした","enthousiaste":"熱心","épuisé":"疲れ果てた","impatient":"せっかち","de bonne humeur":"機嫌がいい","de mauvaise humeur":"機嫌が悪い","avoir honte":"恥じる"},
  ko:{"employé":"직원","ouvrier":"노동자","chantier":"공사장","devis":"견적","prime":"보너스","pause":"휴식","travailleur":"근면한","menteur":"거짓말쟁이","discret":"과묵한","ambitieux":"야심 찬","malin":"약삭빠른","bête":"어리석은","confiant":"자신 있는","méfiant":"의심 많은","distrait":"산만한","modeste":"겸손한","gêné":"당황한","soulagé":"안도한","enthousiaste":"열정적인","épuisé":"기진맥진한","impatient":"성급한","de bonne humeur":"기분이 좋은","de mauvaise humeur":"기분이 나쁜","avoir honte":"부끄러워하다"},
  ar:{"employé":"موظف","ouvrier":"عامل","chantier":"ورشة بناء","devis":"عرض أسعار","prime":"حافز","pause":"استراحة","travailleur":"مجتهد","menteur":"كاذب","discret":"متحفظ","ambitieux":"طموح","malin":"داهية","bête":"غبي","confiant":"واثق","méfiant":"مرتاب","distrait":"شارد الذهن","modeste":"متواضع","gêné":"محرج","soulagé":"مرتاح البال","enthousiaste":"متحمس","épuisé":"منهك","impatient":"نافد الصبر","de bonne humeur":"في مزاج جيد","de mauvaise humeur":"في مزاج سيئ","avoir honte":"يخجل"}
};
LANGS2.forEach(function(l){ var w2=LEX2WRK[l]||{}; Object.keys(w2).forEach(function(k){ LEX2[l][k]=w2[k]; }); });

/* ===== Vague « VIVRE ENSEMBLE » : amitié & liens, vie de quartier, débat & ressentis ===== */
var CURRICULUM_F = [
  {t:"Amitié & liens 🤝", c:"#f59e0b", L:[
    {t:"Les liens", w:["complicité","politesse","hospitalité","tendresse"]},
    {t:"Les brouilles", w:["se disputer","se réconcilier","malentendu","rancune","trahison"]} ]},
  {t:"Vivre ensemble 🏘️", c:"#10b981", L:[
    {t:"Le quartier", w:["voisinage","emménager","corvée","désordre"]},
    {t:"Les valeurs", w:["solidarité","générosité","égoïsme","réconciliation"]} ]},
  {t:"Discuter & convaincre 🗣️", c:"#6366f1", L:[
    {t:"Le débat", w:["point de vue","désaccord","contredire","démontrer"]},
    {t:"Ressentis profonds", w:["déception","regret","ennui","bouleversé"]} ]}
];
CURRICULUM_F.forEach(function(u){ CURRICULUM.push(u); });

var NEWV19 = {
  "complicité":{"en":"closeness","it":"complicità","es":"complicidad","de":"Verbundenheit","pt":"cumplicidade","nl":"verbondenheid"},
  "politesse":{"en":"politeness","it":"cortesia","es":"cortesía","de":"Höflichkeit","pt":"cortesia","nl":"beleefdheid"},
  "hospitalité":{"en":"hospitality","it":"ospitalità","es":"hospitalidad","de":"Gastfreundschaft","pt":"hospitalidade","nl":"gastvrijheid"},
  "tendresse":{"en":"tenderness","it":"tenerezza","es":"ternura","de":"Zärtlichkeit","pt":"ternura","nl":"tederheid"},
  "se disputer":{"en":"to argue","it":"litigare","es":"discutir","de":"sich streiten","pt":"discutir","nl":"ruzie maken"},
  "se réconcilier":{"en":"to make up","it":"fare pace","es":"reconciliarse","de":"sich versöhnen","pt":"reconciliar-se","nl":"zich verzoenen"},
  "malentendu":{"en":"misunderstanding","it":"malinteso","es":"malentendido","de":"Missverständnis","pt":"mal-entendido","nl":"misverstand"},
  "rancune":{"en":"grudge","it":"rancore","es":"rencor","de":"Groll","pt":"rancor","nl":"wrok"},
  "trahison":{"en":"betrayal","it":"tradimento","es":"traición","de":"Verrat","pt":"traição","nl":"verraad"},
  "voisinage":{"en":"neighbours","it":"vicinato","es":"vecindario","de":"Nachbarschaft","pt":"vizinhança","nl":"buurt"},
  "emménager":{"en":"to move in","it":"trasferirsi","es":"instalarse","de":"einziehen","pt":"instalar-se","nl":"intrekken"},
  "corvée":{"en":"chore","it":"faccenda","es":"tarea pesada","de":"lästige Pflicht","pt":"tarefa chata","nl":"karwei"},
  "désordre":{"en":"mess","it":"disordine","es":"desorden","de":"Unordnung","pt":"desordem","nl":"rommel"},
  "solidarité":{"en":"solidarity","it":"solidarietà","es":"solidaridad","de":"Solidarität","pt":"solidariedade","nl":"solidariteit"},
  "générosité":{"en":"generosity","it":"generosità","es":"generosidad","de":"Großzügigkeit","pt":"generosidade","nl":"vrijgevigheid"},
  "égoïsme":{"en":"selfishness","it":"egoismo","es":"egoísmo","de":"Egoismus","pt":"egoísmo","nl":"egoïsme"},
  "réconciliation":{"en":"reconciliation","it":"riconciliazione","es":"reconciliación","de":"Versöhnung","pt":"reconciliação","nl":"verzoening"},
  "point de vue":{"en":"point of view","it":"punto di vista","es":"punto de vista","de":"Standpunkt","pt":"ponto de vista","nl":"standpunt"},
  "désaccord":{"en":"disagreement","it":"disaccordo","es":"desacuerdo","de":"Meinungsverschiedenheit","pt":"desacordo","nl":"onenigheid"},
  "contredire":{"en":"to contradict","it":"contraddire","es":"contradecir","de":"widersprechen","pt":"contradizer","nl":"tegenspreken"},
  "démontrer":{"en":"to demonstrate","it":"dimostrare","es":"demostrar","de":"nachweisen","pt":"demonstrar","nl":"aantonen"},
  "déception":{"en":"disappointment","it":"delusione","es":"decepción","de":"Enttäuschung","pt":"deceção","nl":"teleurstelling"},
  "regret":{"en":"regret","it":"rimpianto","es":"arrepentimiento","de":"Bedauern","pt":"arrependimento","nl":"spijt"},
  "ennui":{"en":"boredom","it":"noia","es":"aburrimiento","de":"Langeweile","pt":"tédio","nl":"verveling"},
  "bouleversé":{"en":"shaken","it":"sconvolto","es":"conmocionado","de":"erschüttert","pt":"abalado","nl":"aangeslagen"}
};
LANGS.forEach(function(l){ Object.keys(NEWV19).forEach(function(k){ if(NEWV19[k][l]) LEX[l][k]=NEWV19[k][l]; }); });

var LEX2VIV = {
  pl:{"complicité":"zażyłość","politesse":"uprzejmość","hospitalité":"gościnność","tendresse":"czułość","se disputer":"kłócić się","se réconcilier":"pogodzić się","malentendu":"nieporozumienie","rancune":"uraza","trahison":"zdrada","voisinage":"sąsiedztwo","emménager":"wprowadzić się","corvée":"przykry obowiązek","désordre":"bałagan","solidarité":"solidarność","générosité":"hojność","égoïsme":"egoizm","réconciliation":"pojednanie","point de vue":"punkt widzenia","désaccord":"niezgoda","contredire":"zaprzeczać","démontrer":"wykazać","déception":"rozczarowanie","regret":"żal","ennui":"nuda","bouleversé":"wstrząśnięty"},
  ru:{"complicité":"близость","politesse":"вежливость","hospitalité":"гостеприимство","tendresse":"нежность","se disputer":"ссориться","se réconcilier":"мириться","malentendu":"недоразумение","rancune":"обида","trahison":"предательство","voisinage":"соседство","emménager":"въехать","corvée":"нудная работа","désordre":"беспорядок","solidarité":"солидарность","générosité":"щедрость","égoïsme":"эгоизм","réconciliation":"примирение","point de vue":"точка зрения","désaccord":"разногласие","contredire":"противоречить","démontrer":"обосновывать","déception":"разочарование","regret":"сожаление","ennui":"скука","bouleversé":"потрясённый"},
  uk:{"complicité":"близькість","politesse":"ввічливість","hospitalité":"гостинність","tendresse":"ніжність","se disputer":"сваритися","se réconcilier":"миритися","malentendu":"непорозуміння","rancune":"образа","trahison":"зрада","voisinage":"сусідство","emménager":"в'їхати","corvée":"нудна робота","désordre":"безлад","solidarité":"солідарність","générosité":"щедрість","égoïsme":"егоїзм","réconciliation":"примирення","point de vue":"точка зору","désaccord":"незгода","contredire":"суперечити","démontrer":"обґрунтовувати","déception":"розчарування","regret":"жаль","ennui":"нудьга","bouleversé":"приголомшений"},
  cs:{"complicité":"blízkost","politesse":"zdvořilost","hospitalité":"pohostinnost","tendresse":"něha","se disputer":"hádat se","se réconcilier":"usmířit se","malentendu":"nedorozumění","rancune":"zášť","trahison":"zrada","voisinage":"sousedství","emménager":"nastěhovat se","corvée":"otravná povinnost","désordre":"nepořádek","solidarité":"solidarita","générosité":"štědrost","égoïsme":"sobectví","réconciliation":"usmíření","point de vue":"úhel pohledu","désaccord":"neshoda","contredire":"odporovat","démontrer":"prokázat","déception":"zklamání","regret":"lítost","ennui":"nuda","bouleversé":"otřesený"},
  zh:{"complicité":"默契","politesse":"礼貌","hospitalité":"好客","tendresse":"温柔","se disputer":"吵架","se réconcilier":"和好","malentendu":"误会","rancune":"怨恨","trahison":"背叛","voisinage":"邻里","emménager":"搬进","corvée":"苦差事","désordre":"杂乱","solidarité":"团结","générosité":"慷慨","égoïsme":"自私","réconciliation":"和解","point de vue":"观点","désaccord":"分歧","contredire":"反驳","démontrer":"论证","déception":"失望","regret":"遗憾","ennui":"无聊","bouleversé":"震撼"},
  ja:{"complicité":"絆","politesse":"礼儀","hospitalité":"おもてなし","tendresse":"優しさ","se disputer":"けんかする","se réconcilier":"仲直りする","malentendu":"誤解","rancune":"恨み","trahison":"裏切り","voisinage":"近所","emménager":"入居する","corvée":"雑用","désordre":"散らかり","solidarité":"連帯","générosité":"寛大さ","égoïsme":"利己主義","réconciliation":"仲直り","point de vue":"視点","désaccord":"不一致","contredire":"反論する","démontrer":"論証する","déception":"失望","regret":"後悔","ennui":"退屈","bouleversé":"動揺した"},
  ko:{"complicité":"유대감","politesse":"예의","hospitalité":"환대","tendresse":"다정함","se disputer":"다투다","se réconcilier":"화해하다","malentendu":"오해","rancune":"원한","trahison":"배신","voisinage":"이웃들","emménager":"입주하다","corvée":"허드렛일","désordre":"엉망","solidarité":"연대","générosité":"관대함","égoïsme":"이기심","réconciliation":"화해","point de vue":"관점","désaccord":"의견 차이","contredire":"반박하다","démontrer":"논증하다","déception":"실망감","regret":"후회","ennui":"지루함","bouleversé":"동요한"},
  ar:{"complicité":"انسجام","politesse":"تهذيب","hospitalité":"كرم الضيافة","tendresse":"حنان","se disputer":"يتشاجر","se réconcilier":"يتصالح","malentendu":"سوء فهم","rancune":"ضغينة","trahison":"خيانة","voisinage":"الجوار","emménager":"ينتقل للسكن","corvée":"مهمة مملة","désordre":"فوضى","solidarité":"تضامن","générosité":"كرم","égoïsme":"أنانية","réconciliation":"مصالحة","point de vue":"وجهة نظر","désaccord":"عدم اتفاق","contredire":"يناقض","démontrer":"يبرهن","déception":"خيبة أمل","regret":"أسف","ennui":"ملل","bouleversé":"متأثر بشدة"}
};
LANGS2.forEach(function(l){ var w2=LEX2VIV[l]||{}; Object.keys(w2).forEach(function(k){ LEX2[l][k]=w2[k]; }); });

/* ===== Vague « COMME UN NATIF » : expressions du quotidien, style & apparence, la forêt ===== */
var CURRICULUM_E = [
  {t:"Parler comme un natif 💬", c:"#22d3ee", L:[
    {t:"Au quotidien", w:["ça marche","c'est parti","au fait","quand même","coûter cher"]},
    {t:"Ça me gave !", w:["avoir la flemme","en avoir marre","avoir hâte","faire exprès","n'importe quoi"]} ]},
  {t:"Le style 💇", c:"#e879f9", L:[
    {t:"Chez le coiffeur", w:["coiffure","barbe","moustache","frange","se raser"]},
    {t:"Bijoux & look", w:["maquillage","boucle d'oreille","collier","bracelet","tatouage"]} ]},
  {t:"La forêt 🦊", c:"#65a30d", L:[
    {t:"Les animaux des bois", w:["sanglier","cerf","hibou","écureuil","hérisson"]},
    {t:"Traces & détails", w:["aigle","fourmi","ruche","plume","griffe"]} ]}
];
CURRICULUM_E.forEach(function(u){ CURRICULUM.push(u); });

var NEWV20 = {
  "ça marche":{"en":"sounds good","it":"ci sto","es":"¡hecho!","de":"geht klar","pt":"combinado","nl":"prima"},
  "c'est parti":{"en":"here we go","it":"si parte","es":"¡allá vamos!","de":"los geht's","pt":"vamos lá","nl":"daar gaan we"},
  "au fait":{"en":"by the way","it":"a proposito","es":"a propósito","de":"apropos","pt":"já agora","nl":"tussen haakjes"},
  "quand même":{"en":"even so","it":"lo stesso","es":"de todos modos","de":"trotzdem","pt":"mesmo assim","nl":"evengoed"},
  "coûter cher":{"en":"to cost a lot","it":"costare caro","es":"costar caro","de":"viel kosten","pt":"custar caro","nl":"veel kosten"},
  "avoir la flemme":{"en":"to feel lazy","it":"non avere voglia","es":"dar pereza","de":"keine Lust haben","pt":"estar com preguiça","nl":"geen zin hebben"},
  "en avoir marre":{"en":"to be fed up","it":"averne abbastanza","es":"estar harto","de":"die Nase voll haben","pt":"estar farto","nl":"er genoeg van hebben"},
  "avoir hâte":{"en":"to look forward to","it":"non vedere l'ora","es":"estar deseando","de":"es kaum erwarten","pt":"mal poder esperar","nl":"niet kunnen wachten"},
  "faire exprès":{"en":"to do it on purpose","it":"farlo apposta","es":"hacerlo a propósito","de":"es absichtlich tun","pt":"fazer de propósito","nl":"expres doen"},
  "n'importe quoi":{"en":"nonsense","it":"sciocchezze","es":"tonterías","de":"Quatsch","pt":"disparate","nl":"onzin"},
  "coiffure":{"en":"hairstyle","it":"pettinatura","es":"peinado","de":"Frisur","pt":"penteado","nl":"kapsel"},
  "barbe":{"en":"beard","it":"barba","es":"barba","de":"Bart","pt":"barba","nl":"baard"},
  "moustache":{"en":"moustache","it":"baffi","es":"bigote","de":"Schnurrbart","pt":"bigode","nl":"snor"},
  "frange":{"en":"fringe","it":"frangia","es":"flequillo","de":"Pony","pt":"franja","nl":"pony"},
  "se raser":{"en":"to shave","it":"radersi","es":"afeitarse","de":"sich rasieren","pt":"barbear-se","nl":"zich scheren"},
  "maquillage":{"en":"make-up","it":"trucco","es":"maquillaje","de":"Schminke","pt":"maquilhagem","nl":"make-up"},
  "boucle d'oreille":{"en":"earring","it":"orecchino","es":"pendiente","de":"Ohrring","pt":"brinco","nl":"oorbel"},
  "collier":{"en":"necklace","it":"collana","es":"collar","de":"Halskette","pt":"colar","nl":"ketting"},
  "bracelet":{"en":"bracelet","it":"braccialetto","es":"pulsera","de":"Armband","pt":"pulseira","nl":"armband"},
  "tatouage":{"en":"tattoo","it":"tatuaggio","es":"tatuaje","de":"Tätowierung","pt":"tatuagem","nl":"tatoeage"},
  "sanglier":{"en":"wild boar","it":"cinghiale","es":"jabalí","de":"Wildschwein","pt":"javali","nl":"wild zwijn"},
  "cerf":{"en":"deer","it":"cervo","es":"ciervo","de":"Hirsch","pt":"veado","nl":"hert"},
  "hibou":{"en":"owl","it":"gufo","es":"búho","de":"Eule","pt":"mocho","nl":"uil"},
  "écureuil":{"en":"squirrel","it":"scoiattolo","es":"ardilla","de":"Eichhörnchen","pt":"esquilo","nl":"eekhoorn"},
  "hérisson":{"en":"hedgehog","it":"riccio","es":"erizo","de":"Igel","pt":"ouriço","nl":"egel"},
  "aigle":{"en":"eagle","it":"aquila","es":"águila","de":"Adler","pt":"águia","nl":"adelaar"},
  "fourmi":{"en":"ant","it":"formica","es":"hormiga","de":"Ameise","pt":"formiga","nl":"mier"},
  "ruche":{"en":"beehive","it":"alveare","es":"colmena","de":"Bienenstock","pt":"colmeia","nl":"bijenkorf"},
  "plume":{"en":"feather","it":"piuma","es":"pluma","de":"Feder","pt":"pena","nl":"veer"},
  "griffe":{"en":"claw","it":"artiglio","es":"garra","de":"Kralle","pt":"garra","nl":"klauw"}
};
LANGS.forEach(function(l){ Object.keys(NEWV20).forEach(function(k){ if(NEWV20[k][l]) LEX[l][k]=NEWV20[k][l]; }); });

var LEX2NAT = {
  pl:{"ça marche":"dobra","c'est parti":"zaczynamy","au fait":"swoją drogą","quand même":"a jednak","coûter cher":"dużo kosztować","avoir la flemme":"nie chce mi się","en avoir marre":"mieć dość","avoir hâte":"nie móc się doczekać","faire exprès":"robić celowo","n'importe quoi":"bzdury","coiffure":"fryzura","barbe":"broda","moustache":"wąsy","frange":"grzywka","se raser":"golić się","maquillage":"makijaż","boucle d'oreille":"kolczyk","collier":"naszyjnik","bracelet":"bransoletka","tatouage":"tatuaż","sanglier":"dzik","cerf":"jeleń","hibou":"sowa","écureuil":"wiewiórka","hérisson":"jeż","aigle":"orzeł","fourmi":"mrówka","ruche":"ul","plume":"pióro","griffe":"pazur"},
  ru:{"ça marche":"договорились","c'est parti":"поехали","au fait":"к слову","quand même":"всё равно","coûter cher":"дорого стоить","avoir la flemme":"мне лень","en avoir marre":"надоело","avoir hâte":"не терпится","faire exprès":"делать нарочно","n'importe quoi":"ерунда","coiffure":"причёска","barbe":"борода","moustache":"усы","frange":"чёлка","se raser":"бриться","maquillage":"макияж","boucle d'oreille":"серьга","collier":"ожерелье","bracelet":"браслет","tatouage":"татуировка","sanglier":"кабан","cerf":"олень","hibou":"филин","écureuil":"белка","hérisson":"ёж","aigle":"орёл","fourmi":"муравей","ruche":"улей","plume":"перо","griffe":"коготь"},
  uk:{"ça marche":"домовились","c'est parti":"поїхали","au fait":"між іншим","quand même":"все-таки","coûter cher":"дорого коштувати","avoir la flemme":"мені ліньки","en avoir marre":"набридло","avoir hâte":"не терпиться","faire exprès":"робити навмисно","n'importe quoi":"дурниці","coiffure":"зачіска","barbe":"борода","moustache":"вуса","frange":"гривка","se raser":"голитися","maquillage":"макіяж","boucle d'oreille":"сережка","collier":"намисто","bracelet":"браслет","tatouage":"татуювання","sanglier":"кабан","cerf":"олень","hibou":"пугач","écureuil":"білка","hérisson":"їжак","aigle":"орел","fourmi":"мураха","ruche":"вулик","plume":"перо","griffe":"кіготь"},
  cs:{"ça marche":"platí","c'est parti":"jdeme na to","au fait":"mimochodem","quand même":"stejně","coûter cher":"hodně stát","avoir la flemme":"nechce se mi","en avoir marre":"mít toho dost","avoir hâte":"nemoct se dočkat","faire exprès":"dělat naschvál","n'importe quoi":"nesmysl","coiffure":"účes","barbe":"vousy","moustache":"knír","frange":"ofina","se raser":"holit se","maquillage":"líčení","boucle d'oreille":"náušnice","collier":"náhrdelník","bracelet":"náramek","tatouage":"tetování","sanglier":"divoké prase","cerf":"jelen","hibou":"výr","écureuil":"veverka","hérisson":"ježek","aigle":"orel","fourmi":"mravenec","ruche":"úl","plume":"pírko","griffe":"dráp"},
  zh:{"ça marche":"行","c'est parti":"开始吧","au fait":"对了","quand même":"还是","coûter cher":"很花钱","avoir la flemme":"懒得做","en avoir marre":"受够了","avoir hâte":"迫不及待","faire exprès":"故意做","n'importe quoi":"胡说","coiffure":"发型","barbe":"胡子","moustache":"小胡子","frange":"刘海","se raser":"刮胡子","maquillage":"化妆","boucle d'oreille":"耳环","collier":"项链","bracelet":"手链","tatouage":"纹身","sanglier":"野猪","cerf":"鹿","hibou":"猫头鹰","écureuil":"松鼠","hérisson":"刺猬","aigle":"老鹰","fourmi":"蚂蚁","ruche":"蜂巢","plume":"羽毛","griffe":"爪子"},
  ja:{"ça marche":"了解","c'est parti":"始めよう","au fait":"ところで","quand même":"やっぱり","coûter cher":"高くつく","avoir la flemme":"やる気が出ない","en avoir marre":"うんざりする","avoir hâte":"待ちきれない","faire exprès":"わざとやる","n'importe quoi":"でたらめ","coiffure":"髪型","barbe":"ひげ","moustache":"口ひげ","frange":"前髪","se raser":"ひげを剃る","maquillage":"化粧","boucle d'oreille":"イヤリング","collier":"ネックレス","bracelet":"ブレスレット","tatouage":"タトゥー","sanglier":"イノシシ","cerf":"鹿","hibou":"フクロウ","écureuil":"リス","hérisson":"ハリネズミ","aigle":"ワシ","fourmi":"アリ","ruche":"ハチの巣","plume":"羽","griffe":"鉤爪"},
  ko:{"ça marche":"알겠어","c'est parti":"시작하자","au fait":"그나저나","quand même":"그럼에도","coûter cher":"돈이 많이 들다","avoir la flemme":"귀찮다","en avoir marre":"지겹다","avoir hâte":"기대되다","faire exprès":"일부러 하다","n'importe quoi":"말도 안 돼","coiffure":"머리 모양","barbe":"수염","moustache":"콧수염","frange":"앞머리","se raser":"면도하다","maquillage":"화장","boucle d'oreille":"귀걸이","collier":"목걸이","bracelet":"팔찌","tatouage":"문신","sanglier":"멧돼지","cerf":"사슴","hibou":"부엉이","écureuil":"다람쥐","hérisson":"고슴도치","aigle":"독수리","fourmi":"개미","ruche":"벌집","plume":"깃털","griffe":"발톱"},
  ar:{"ça marche":"اتفقنا","c'est parti":"لننطلق","au fait":"على فكرة","quand même":"مع ذلك","coûter cher":"يكلف كثيراً","avoir la flemme":"أشعر بالكسل","en avoir marre":"سئم","avoir hâte":"لا أطيق الانتظار","faire exprès":"يفعلها عمداً","n'importe quoi":"كلام فارغ","coiffure":"تسريحة","barbe":"لحية","moustache":"شارب","frange":"غرة","se raser":"يحلق ذقنه","maquillage":"مكياج","boucle d'oreille":"قرط","collier":"قلادة","bracelet":"سوار","tatouage":"وشم","sanglier":"خنزير بري","cerf":"أيل","hibou":"بومة","écureuil":"سنجاب","hérisson":"قنفذ","aigle":"نسر","fourmi":"نملة","ruche":"خلية نحل","plume":"ريشة","griffe":"مخلب"}
};
LANGS2.forEach(function(l){ var w2=LEX2NAT[l]||{}; Object.keys(w2).forEach(function(k){ LEX2[l][k]=w2[k]; }); });

/* ===== Vague « SUR LA ROUTE & L'ARGENT » : conduite, budget, nuances utiles ===== */
var CURRICULUM_D = [
  {t:"Au volant 🚗", c:"#f97316", L:[
    {t:"Conduire", w:["faire le plein","accélérer","ralentir","doubler"]},
    {t:"Sur la route", w:["ceinture de sécurité","piéton","clignotant","klaxonner","crevaison"]} ]},
  {t:"L'argent au quotidien 💰", c:"#84cc16", L:[
    {t:"À la banque", w:["compte bancaire","retirer de l'argent","faire des économies"]},
    {t:"Bien gérer", w:["dépenser trop","être à découvert","charges"]} ]},
  {t:"Nuances & petits mots 🎁", c:"#8b5cf6", L:[
    {t:"Expressions utiles", w:["malgré tout","dès que possible","faute de mieux","pot de départ"]},
    {t:"Maison & sentiments", w:["électroménager","artisan","jalousie"]} ]}
];
CURRICULUM_D.forEach(function(u){ CURRICULUM.push(u); });

var NEWV21 = {
  "faire le plein":{"en":"to fill up","it":"fare il pieno","es":"repostar","de":"volltanken","pt":"atestar o depósito","nl":"voltanken"},
  "accélérer":{"en":"to speed up","it":"accelerare","es":"acelerar","de":"beschleunigen","pt":"acelerar","nl":"versnellen"},
  "ralentir":{"en":"to slow down","it":"rallentare","es":"reducir la velocidad","de":"langsamer fahren","pt":"abrandar","nl":"langzamer rijden"},
  "doubler":{"en":"to overtake","it":"sorpassare","es":"adelantar","de":"überholen","pt":"ultrapassar","nl":"inhalen"},
  "ceinture de sécurité":{"en":"seatbelt","it":"cintura di sicurezza","es":"cinturón de seguridad","de":"Sicherheitsgurt","pt":"cinto de segurança","nl":"veiligheidsgordel"},
  "piéton":{"en":"pedestrian","it":"pedone","es":"peatón","de":"Fußgänger","pt":"peão","nl":"voetganger"},
  "clignotant":{"en":"indicator","it":"lampeggiatore","es":"intermitente","de":"Blinker","pt":"pisca-pisca","nl":"richtingaanwijzer"},
  "klaxonner":{"en":"to honk","it":"suonare il clacson","es":"tocar el claxon","de":"hupen","pt":"buzinar","nl":"toeteren"},
  "crevaison":{"en":"flat tyre","it":"foratura","es":"pinchazo","de":"Reifenpanne","pt":"furo no pneu","nl":"lekke band"},
  "compte bancaire":{"en":"bank account","it":"conto bancario","es":"cuenta bancaria","de":"Bankkonto","pt":"conta bancária","nl":"bankrekening"},
  "retirer de l'argent":{"en":"to withdraw money","it":"prelevare","es":"sacar dinero","de":"Geld abheben","pt":"levantar dinheiro","nl":"geld opnemen"},
  "faire des économies":{"en":"to save up","it":"mettere da parte","es":"ahorrar dinero","de":"Geld zurücklegen","pt":"juntar dinheiro","nl":"geld opzijzetten"},
  "dépenser trop":{"en":"to overspend","it":"spendere troppo","es":"gastar demasiado","de":"zu viel ausgeben","pt":"gastar demais","nl":"te veel uitgeven"},
  "être à découvert":{"en":"to be overdrawn","it":"essere in rosso","es":"estar en números rojos","de":"im Minus sein","pt":"estar a descoberto","nl":"rood staan"},
  "charges":{"en":"service charges","it":"spese condominiali","es":"gastos de comunidad","de":"Nebenkosten","pt":"despesas de condomínio","nl":"servicekosten"},
  "malgré tout":{"en":"despite everything","it":"nonostante tutto","es":"a pesar de todo","de":"trotz allem","pt":"apesar de tudo","nl":"ondanks alles"},
  "dès que possible":{"en":"as soon as possible","it":"appena possibile","es":"cuanto antes","de":"so bald wie möglich","pt":"logo que possível","nl":"zo snel mogelijk"},
  "faute de mieux":{"en":"for lack of anything better","it":"in mancanza di meglio","es":"a falta de algo mejor","de":"mangels Besserem","pt":"à falta de melhor","nl":"bij gebrek aan beter"},
  "pot de départ":{"en":"farewell party","it":"festa d'addio","es":"fiesta de despedida","de":"Abschiedsfeier","pt":"festa de despedida","nl":"afscheidsborrel"},
  "électroménager":{"en":"household appliances","it":"elettrodomestici","es":"electrodomésticos","de":"Haushaltsgeräte","pt":"eletrodomésticos","nl":"huishoudelijke apparaten"},
  "artisan":{"en":"craftsman","it":"artigiano","es":"artesano","de":"Handwerker","pt":"artesão","nl":"vakman"},
  "jalousie":{"en":"jealousy","it":"gelosia","es":"celos","de":"Eifersucht","pt":"ciúme","nl":"jaloezie"}
};
LANGS.forEach(function(l){ Object.keys(NEWV21).forEach(function(k){ if(NEWV21[k][l]) LEX[l][k]=NEWV21[k][l]; }); });

var LEX2ROU = {
  pl:{"faire le plein":"zatankować","accélérer":"przyspieszać","ralentir":"jechać wolniej","doubler":"wyprzedzać","ceinture de sécurité":"pas bezpieczeństwa","piéton":"pieszy","clignotant":"kierunkowskaz","klaxonner":"trąbić","crevaison":"przebita opona","compte bancaire":"konto bankowe","retirer de l'argent":"wypłacić pieniądze","faire des économies":"odkładać pieniądze","dépenser trop":"wydawać za dużo","être à découvert":"mieć debet","charges":"opłaty","malgré tout":"mimo wszystko","dès que possible":"jak najszybciej","faute de mieux":"z braku lepszego","pot de départ":"impreza pożegnalna","électroménager":"sprzęt AGD","artisan":"rzemieślnik","jalousie":"zazdrość"},
  ru:{"faire le plein":"заправиться","accélérer":"ускоряться","ralentir":"замедляться","doubler":"обгонять","ceinture de sécurité":"ремень безопасности","piéton":"пешеход","clignotant":"поворотник","klaxonner":"сигналить","crevaison":"прокол колеса","compte bancaire":"банковский счёт","retirer de l'argent":"снять деньги","faire des économies":"откладывать деньги","dépenser trop":"тратить слишком много","être à découvert":"быть в минусе","charges":"коммунальные платежи","malgré tout":"несмотря ни на что","dès que possible":"как можно скорее","faute de mieux":"за неимением лучшего","pot de départ":"проводы","électroménager":"бытовая техника","artisan":"мастер","jalousie":"ревность"},
  uk:{"faire le plein":"заправитися","accélérer":"прискорюватися","ralentir":"сповільнюватися","doubler":"обганяти","ceinture de sécurité":"ремінь безпеки","piéton":"пішохід","clignotant":"поворотник","klaxonner":"сигналити","crevaison":"прокол колеса","compte bancaire":"банківський рахунок","retirer de l'argent":"зняти гроші","faire des économies":"відкладати гроші","dépenser trop":"витрачати забагато","être à découvert":"бути в мінусі","charges":"комунальні платежі","malgré tout":"попри все","dès que possible":"якнайшвидше","faute de mieux":"за браком кращого","pot de départ":"проводи","électroménager":"побутова техніка","artisan":"майстер","jalousie":"ревнощі"},
  cs:{"faire le plein":"natankovat","accélérer":"zrychlovat","ralentir":"zpomalovat","doubler":"předjíždět","ceinture de sécurité":"bezpečnostní pás","piéton":"chodec","clignotant":"blinkr","klaxonner":"troubit","crevaison":"píchlá pneumatika","compte bancaire":"bankovní účet","retirer de l'argent":"vybrat peníze","faire des économies":"odkládat si peníze","dépenser trop":"utrácet příliš","être à découvert":"být v mínusu","charges":"poplatky za služby","malgré tout":"navzdory všemu","dès que possible":"co nejdříve","faute de mieux":"z nedostatku lepšího","pot de départ":"rozlučka","électroménager":"domácí spotřebiče","artisan":"řemeslník","jalousie":"žárlivost"},
  zh:{"faire le plein":"加满油","accélérer":"加速","ralentir":"减速","doubler":"超车","ceinture de sécurité":"安全带","piéton":"行人","clignotant":"转向灯","klaxonner":"按喇叭","crevaison":"爆胎","compte bancaire":"银行账户","retirer de l'argent":"取钱","faire des économies":"攒钱","dépenser trop":"超支","être à découvert":"透支","charges":"物业费","malgré tout":"不管怎样","dès que possible":"尽快","faute de mieux":"退而求其次","pot de départ":"欢送会","électroménager":"家电","artisan":"工匠","jalousie":"嫉妒"},
  ja:{"faire le plein":"給油する","accélérer":"加速する","ralentir":"減速する","doubler":"追い越す","ceinture de sécurité":"シートベルト","piéton":"歩行者","clignotant":"ウインカー","klaxonner":"クラクションを鳴らす","crevaison":"パンク","compte bancaire":"銀行口座","retirer de l'argent":"お金を下ろす","faire des économies":"お金を貯める","dépenser trop":"使いすぎる","être à découvert":"赤字になる","charges":"管理費","malgré tout":"何があっても","dès que possible":"できるだけ早く","faute de mieux":"仕方なく","pot de départ":"送別会","électroménager":"家電","artisan":"職人","jalousie":"嫉妬"},
  ko:{"faire le plein":"주유하다","accélérer":"가속하다","ralentir":"속도를 줄이다","doubler":"추월하다","ceinture de sécurité":"안전벨트","piéton":"보행자","clignotant":"깜빡이","klaxonner":"경적을 울리다","crevaison":"펑크","compte bancaire":"은행 계좌","retirer de l'argent":"돈을 찾다","faire des économies":"돈을 모으다","dépenser trop":"과소비하다","être à découvert":"마이너스가 되다","charges":"관리비","malgré tout":"그렇더라도","dès que possible":"최대한 빨리","faute de mieux":"아쉬운 대로","pot de départ":"송별회","électroménager":"가전제품","artisan":"장인","jalousie":"질투"},
  ar:{"faire le plein":"يملأ الخزان","accélérer":"يسرع","ralentir":"يبطئ","doubler":"يتجاوز","ceinture de sécurité":"حزام الأمان","piéton":"مشاة","clignotant":"غماز","klaxonner":"يزمر","crevaison":"ثقب الإطار","compte bancaire":"حساب مصرفي","retirer de l'argent":"يسحب نقوداً","faire des économies":"يدخر المال","dépenser trop":"يفرط في الإنفاق","être à découvert":"يتجاوز رصيده","charges":"رسوم الخدمات","malgré tout":"رغم كل شيء","dès que possible":"في أقرب وقت","faute de mieux":"لعدم وجود أفضل","pot de départ":"حفل وداع","électroménager":"أجهزة منزلية","artisan":"حرفي","jalousie":"غيرة"}
};
LANGS2.forEach(function(l){ var w2=LEX2ROU[l]||{}; Object.keys(w2).forEach(function(k){ LEX2[l][k]=w2[k]; }); });

var TLANGS = LANGS.concat(LANGS2); /* toutes les langues (traducteur / dictionnaire) */

/*__VOCAB_AUTO__ : les vagues de vocabulaire s'inserent ICI (ne pas retirer ce repere).
   IMPERATIF : AVANT la generation de COURSES ci-dessous. Une unite poussee APRES est
   dans CURRICULUM mais ABSENTE des cours -> invisible dans l'app (vu le 2026-08-11 :
   17 verbes ecrits, 0 visible). Declare n'est pas branche. */

/* Vague de vocabulaire « Verbes de tous les jours 🏃 » — chaque traduction validée par un modèle indépendant. */
CURRICULUM.push({t:"Verbes de tous les jours 🏃", c:"#12b981", L:[
  {t:"Partie 1", w:["s'étirer","bâiller","cligner","hoqueter","renifler","transpirer","trébucher"]},
  {t:"Partie 2", w:["s'accroupir","se pencher","soupirer","murmurer","bredouiller","bégayer","siffloter"]},
  {t:"Partie 3", w:["fredonner","grignoter","déguster"]}
]});
var _VOC = {"s'étirer":{"en":"stretch","it":"stirarsi","es":"estirarse","de":"sich strecken","pt":"esticar","nl":"rekken","pl":"rozciągać się","ru":"растягиваться","uk":"розтягуватися","cs":"protáhnout se","zh":"伸懒腰","ja":"ストレッチする","ko":"신체를 쭉 펴다","ar":"تمطى"},"bâiller":{"en":"yawn","it":"sbadigliare","es":"bostezar","de":"gähnen","pt":"bocejar","nl":"geeuwen","pl":"ziewać","ru":"зевать","uk":"позіхати","cs":"zívat","zh":"打哈欠","ja":"あくびをする","ko":"하품하다","ar":"تثاءب"},"cligner":{"en":"blink","it":"sbattere","es":"parpadear","de":"blinzeln","pt":"piscar","nl":"knipperen","pl":"mrugać","ru":"моргать","uk":"моргати","cs":"mrkat","zh":"眨眼","ja":"まばたきする","ko":"깜빡이다","ar":"غمز"},"hoqueter":{"en":"hiccup","it":"singhiozzare","es":"tener hipo","de":"schluckauf haben","pt":"soluçar","nl":"hikken","pl":"czkać","ru":"икать","uk":"гикати","cs":"škytat","zh":"打嗝","ja":"しゃっくりをする","ko":"기침하다","ar":"فَاقَ"},"renifler":{"en":"sniff","it":"tirare su col naso","es":"resoplar","de":"schniefen","pt":"fungar","nl":"snuiven","pl":"pociągać nosem","ru":"хрюкать","uk":"шморгати","cs":"čichat","zh":"吸鼻子","ja":"鼻をすする","ko":"코를 훌쩍이다","ar":"شمّ"},"transpirer":{"en":"sweat","it":"sudare","es":"transpirar","de":"schwitzen","pt":"transpirar","nl":"zweten","pl":"pocić się","ru":"потеть","uk":"пітніти","cs":"potit se","zh":"出汗","ja":"汗をかく","ko":"汗을 내다","ar":"عرق"},"trébucher":{"en":"stumble","it":"inciampare","es":"tropezar","de":"stolpern","pt":"tropeçar","nl":"struikelen","pl":"potykać się","ru":"спотыкаться","uk":"спотикатися","cs":"klopýtnout","zh":"绊倒","ja":"つまずく","ko":"걸려 넘어지다","ar":"تعثّر"},"s'accroupir":{"en":"crouch","it":"accovacciarsi","es":"agacharse","de":"hocken","pt":"agachar","nl":"hurken","pl":"kucać","ru":"приседать","uk":"присідати","cs":"dřepnout si","zh":"蹲下","ja":"しゃがむ","ko":"무릎을 꿇다","ar":"قرفص"},"se pencher":{"en":"bend","it":"chinarsi","es":"inclinarse","de":"sich beugen","pt":"inclinar","nl":"buigen","pl":"pochylać się","ru":"наклоняться","uk":"нахилятися","cs":"naklonit se","zh":"弯腰","ja":"かがむ","ko":"기울이다","ar":"انحنى"},"soupirer":{"en":"sigh","it":"sospirare","es":"suspirar","de":"seufzen","pt":"suspirar","nl":"zuchten","pl":"wzdychać","ru":"вздыхать","uk":"зітхати","cs":"vzdychat","zh":"叹气","ja":"ため息をつく","ko":"한숨을 쉬다","ar":"تنهّد"},"murmurer":{"en":"whisper","it":"mormorare","es":"murmurar","de":"flüstern","pt":"murmurar","nl":"murmelen","pl":"szeptać","ru":"бормотать","uk":"шепотіти","cs":"šeptat","zh":"低语","ja":"ささやく","ko":"중얼거리다","ar":"همس"},"bredouiller":{"en":"mumble","it":"balbettare","es":"balbucear","de":"nuscheln","pt":"balbuciar","nl":"brabbelen","pl":"bełkotać","ru":"заикаться","uk":"бурмотіти","cs":"breptat","zh":"结巴","ja":"もごもご言う","ko":"말을 더듬다","ar":"تمتم"},"bégayer":{"en":"stutter","it":"balbettare","es":"tartamudear","de":"stottern","pt":"gaguejar","nl":"stotteren","pl":"jąkać się","ru":"заикаться","uk":"заїкатися","cs":"koktat","zh":"口吃","ja":"どもる","ko":"말을 더듬다","ar":"تأتأ"},"siffloter":{"en":"whistle","it":"fischiettare","es":"silbar","de":"pfeifen","pt":"assobiar","nl":"fluiten","pl":"gwizdać","ru":"свистеть","uk":"свистіти","cs":"pískat si","zh":"吹口哨","ja":"口笛を吹く","ko":"휘파람을 불다","ar":"صفّر"},"fredonner":{"en":"hum","it":"canticchiare","es":"tararear","de":"summen","pt":"cantarolar","nl":"neuriën","pl":"nucić","ru":"петь","uk":"наспівувати","cs":"prozpěvovat si","zh":"哼歌","ja":"鼻歌を歌う","ko":"노래를 부르다","ar":"دندن"},"grignoter":{"en":"snack","it":"sgranocchiare","es":"picar","de":"naschen","pt":"petiscar","nl":"knabbelen","pl":"podjadać","ru":"грызть","uk":"перекушувати","cs":"okusovat","zh":"小口吃","ja":"つまむ","ko":"何かを齧다","ar":"تناول خفيفة"},"déguster":{"en":"savor","it":"degustare","es":"degustar","de":"genießen","pt":"degustar","nl":"proeven","pl":"degustować","ru":"пробовать","uk":"смакувати","cs":"ochutnávat","zh":"品尝","ja":"味わう","ko":"맛보다","ar":"تذوّق"}};
LANGS.forEach(function(l){ Object.keys(_VOC).forEach(function(k){ if(_VOC[k][l]) LEX[l][k]=_VOC[k][l]; }); });
LANGS2.forEach(function(l){ LEX2[l]=LEX2[l]||{}; Object.keys(_VOC).forEach(function(k){ if(_VOC[k][l]) LEX2[l][k]=_VOC[k][l]; }); });

/* --- Génération des cours + dictionnaire de traduction --- */
var COURSES = {};
LANGS.forEach(function(l){
  COURSES[l] = { id:l, nom:LMETA[l].nom, drapeau:LMETA[l].drapeau, ttsLang:LMETA[l].tts,
    units: CURRICULUM.map(function(u){ return { titre:u.t, couleur:u.c, lessons:u.L.map(function(le){
      return { titre:le.t, words:(le.w||[]).map(function(fr){ return {fr:fr,t:LEX[l][fr]||fr}; }),
               phrases:(le.p||[]).map(function(fr){ return {fr:fr,t:LEX[l][fr]||fr}; }) };
    }) }; }) };
});
/* Nouvelles langues : VÉRITÉ — seules les unités ENTIÈREMENT traduites entrent au cours
   (aucun mot affiché en français à la place de la langue cible). */
LANGS2.forEach(function(l){
  var lex=LEX2[l]||{}, units=[];
  CURRICULUM.forEach(function(u){
    var full=u.L.every(function(le){
      return (le.w||[]).every(function(fr){ return !!lex[fr]; }) && (le.p||[]).every(function(fr){ return !!lex[fr]; });
    });
    if(full) units.push({ titre:u.t, couleur:u.c, lessons:u.L.map(function(le){
      return { titre:le.t, words:(le.w||[]).map(function(fr){ return {fr:fr,t:lex[fr]}; }),
               phrases:(le.p||[]).map(function(fr){ return {fr:fr,t:lex[fr]}; }) };
    }) });
  });
  if(units.length) COURSES[l]={ id:l, nom:LMETA2[l].nom, drapeau:LMETA2[l].drapeau, ttsLang:LMETA2[l].tts,
    noType:!!LMETA2[l].noType, rtl:!!LMETA2[l].rtl, units:units };
});
/* DICT[fr] = {en,…,nl + nouvelles langues quand traduites} — union du lexique + phrasier */
var DICT = {};
Object.keys(LEX.en).forEach(function(fr){ DICT[fr]={}; LANGS.forEach(function(l){ DICT[fr][l]=LEX[l][fr]; }); });
Object.keys(PHRASEBOOK).forEach(function(fr){ DICT[fr]=PHRASEBOOK[fr]; });
LANGS2.forEach(function(l){ Object.keys(LEX2[l]).forEach(function(fr){ if(DICT[fr]) DICT[fr][l]=LEX2[l][fr]; }); });

/* ============ 📖 HISTOIRES DE LA RUCHE — mini-histoires 100% originales ============
   Chaque histoire : lignes (qui parle · texte fr · texte par langue) + quiz de
   compréhension (en français). Vocabulaire = celui du programme (niveau A1).
   Débloquage : la 1re est ouverte, chaque histoire ouvre la suivante. */
var STORIES=[
 {id:"cafe", ic:"☕", titre:"Au café", lignes:[
  {qui:"🐝", fr:"Bonjour !", t:{en:"Hello!", it:"Buongiorno!", es:"¡Buenos días!", de:"Guten Tag!", pt:"Bom dia!", nl:"Goedendag!", pl:"Cześć!", ru:"Привет!", uk:"Привіт!", cs:"Ahoj!", zh:"你好！", ja:"こんにちは！", ko:"안녕하세요!", ar:"مرحباً!"}},
  {qui:"🧑‍🍳", fr:"Bonjour ! Café ou thé ?", t:{en:"Hello! Coffee or tea?", it:"Buongiorno! Caffè o tè?", es:"¡Buenos días! ¿Café o té?", de:"Guten Tag! Kaffee oder Tee?", pt:"Bom dia! Café ou chá?", nl:"Goedendag! Koffie of thee?", pl:"Cześć! Kawa czy herbata?", ru:"Привет! Кофе или чай?", uk:"Привіт! Кава чи чай?", cs:"Ahoj! Káva nebo čaj?", zh:"你好！喝咖啡还是茶？", ja:"こんにちは！コーヒーか紅茶ですか？", ko:"안녕하세요! 커피나 차를 드릴까요?", ar:"مرحباً! قهوة أو شاي؟"}},
  {qui:"🐝", fr:"Un café, s'il te plaît.", t:{en:"A coffee, please.", it:"Un caffè, per favore.", es:"Un café, por favor.", de:"Einen Kaffee, bitte.", pt:"Um café, por favor.", nl:"Een koffie, alstublieft.", pl:"Kawę, proszę.", ru:"Кофе, пожалуйста.", uk:"Каву, будь ласка.", cs:"Kávu, prosím.", zh:"请给我一杯咖啡。", ja:"コーヒーをください。", ko:"커피를 주세요.", ar:"قهوة، من فضلك."}},
  {qui:"🧑‍🍳", fr:"Et un gâteau ?", t:{en:"And a cake?", it:"E una torta?", es:"¿Y un pastel?", de:"Und einen Kuchen?", pt:"E um bolo?", nl:"En een taart?", pl:"A ciasto?", ru:"И торт?", uk:"І торт?", cs:"A dort?", zh:"还有蛋糕吗？", ja:"ケーキもありますか？", ko:"케이크도 있나요?", ar:"والكعك؟"}},
  {qui:"🐝", fr:"Oui ! Merci !", t:{en:"Yes! Thank you!", it:"Sì! Grazie!", es:"¡Sí! ¡Gracias!", de:"Ja! Danke!", pt:"Sim! Obrigada!", nl:"Ja! Dank je!", pl:"Tak! Dziękuję!", ru:"Да! Спасибо!", uk:"Так! Дякую!", cs:"Ano! Děkuji!", zh:"是的！谢谢！", ja:"はい！ありがとう！", ko:"네! 감사합니다!", ar:"نعم! شكراً!"}},
  {qui:"🐝", fr:"Le café est bon.", t:{en:"The coffee is good.", it:"Il caffè è buono.", es:"El café es bueno.", de:"Der Kaffee ist gut.", pt:"O café é bom.", nl:"De koffie is goed.", pl:"Kawa jest dobra.", ru:"Кофе хорош.", uk:"Кава добра.", cs:"Káva je dobrá.", zh:"咖啡很好。", ja:"コーヒーが美味しいです。", ko:"커피가 좋습니다.", ar:"القهوة جيدة."}}],
  quiz:[
  {q:"Que commande Bee ?", opts:["Un café","Un thé","Un jus"], ok:0},
  {q:"Avec quoi ?", opts:["Du pain","Un gâteau","Une soupe"], ok:1},
  {q:"Le café est…", opts:["Petit","Noir","Bon"], ok:2}]},
 {id:"chat", ic:"🐱", titre:"Le chat noir", lignes:[
  {qui:"🐝", fr:"Voici la maison.", t:{en:"Here is the house.", it:"Ecco la casa.", es:"Aquí está la casa.", de:"Hier ist das Haus.", pt:"Aqui está a casa.", nl:"Hier is het huis.", pl:"Oto dom.", ru:"Вот дом.", uk:"Ось будинок.", cs:"Tady je dům.", zh:"这是房子。", ja:"ここに家があります。", ko:"이것이 집입니다.", ar:"هنا البيت."}},
  {qui:"🐝", fr:"Un chat est dans la maison.", t:{en:"A cat is in the house.", it:"Un gatto è nella casa.", es:"Un gato está en la casa.", de:"Eine Katze ist im Haus.", pt:"Um gato está na casa.", nl:"Een kat is in het huis.", pl:"Kot jest w domu.", ru:"Кошка находится в доме.", uk:"Кіт у будинку.", cs:"Kočka je v domě.", zh:"猫在房子里。", ja:"猫が家の中にいます。", ko:"고양이가 집 안에 있습니다.", ar:"القطة في البيت."}},
  {qui:"🐝", fr:"Le chat est noir.", t:{en:"The cat is black.", it:"Il gatto è nero.", es:"El gato es negro.", de:"Die Katze ist schwarz.", pt:"O gato é preto.", nl:"De kat is zwart.", pl:"Kot jest czarny.", ru:"Кошка чёрная.", uk:"Кіт чорний.", cs:"Kočka je černá.", zh:"猫是黑色的。", ja:"猫は黒です。", ko:"고양이는 검은색입니다.", ar:"القطة سوداء."}},
  {qui:"🐱", fr:"Le chat boit du lait.", t:{en:"The cat drinks milk.", it:"Il gatto beve il latte.", es:"El gato bebe leche.", de:"Die Katze trinkt Milch.", pt:"O gato bebe leite.", nl:"De kat drinkt melk.", pl:"Kot pije mleko.", ru:"Кошка пьёт молоко.", uk:"Кіт п'є молоко.", cs:"Kočka pije mléko.", zh:"猫在喝牛奶。", ja:"猫は牛乳を飲んでいます。", ko:"고양이가 우유를 마십니다.", ar:"القطة تشرب الحليب."}},
  {qui:"🐕", fr:"Le chien est petit.", t:{en:"The dog is small.", it:"Il cane è piccolo.", es:"El perro es pequeño.", de:"Der Hund ist klein.", pt:"O cão é pequeno.", nl:"De hond is klein.", pl:"Piesek jest mały.", ru:"Собака маленькая.", uk:"Песик маленький.", cs:"Pes je malý.", zh:"小狗很小。", ja:"犬は小さいです。", ko:"개의 크기는 작습니다.", ar:"الكلب صغير."}},
  {qui:"🐝", fr:"Bonne nuit, le chat !", t:{en:"Good night, cat!", it:"Buonanotte, gatto!", es:"¡Buenas noches, gato!", de:"Gute Nacht, Katze!", pt:"Boa noite, gato!", nl:"Goedenacht, kat!", pl:"Dobranoc, kocię!", ru:"Спокойной ночи, кот!", uk:"На добраніч, кіт!", cs:"Dobrou noc, kotě!", zh:"晚安，猫。", ja:"おやすみ、猫さん。", ko:"안녕히 주무세요, 고양이.", ar:"تصبح على خير، قط."}}],
  quiz:[
  {q:"De quelle couleur est le chat ?", opts:["Blanc","Noir","Rouge"], ok:1},
  {q:"Que boit le chat ?", opts:["Du lait","De l'eau","Du café"], ok:0},
  {q:"Le chien est…", opts:["Grand","Noir","Petit"], ok:2}]},
 {id:"famille", ic:"👪", titre:"Ma famille", lignes:[
  {qui:"🐝", fr:"Voici ma famille !", t:{en:"Here is my family!", it:"Ecco la mia famiglia!", es:"¡Aquí está mi familia!", de:"Hier ist meine Familie!", pt:"Aqui está a minha família!", nl:"Hier is mijn familie!", pl:"Oto moja rodzina!", ru:"Вот моя семья!", uk:"Ото моя сім'я!", cs:"Tady je moje rodina!", zh:"这是我的家庭！", ja:"これが私の家族です！", ko:"이것이 저의 가족입니다!", ar:"هذه عائلتي!"}},
  {qui:"🐝", fr:"Ma mère et mon père.", t:{en:"My mother and my father.", it:"Mia madre e mio padre.", es:"Mi madre y mi padre.", de:"Meine Mutter und mein Vater.", pt:"A minha mãe e o meu pai.", nl:"Mijn moeder en mijn vader.", pl:"Moja mama i tata.", ru:"Моя мама и папа.", uk:"Моя мама і тато.", cs:"Moje máma a táta.", zh:"我妈妈和爸爸。", ja:"私のママとパパ。", ko:"저의 엄마와 아빠.", ar:"أمي وأبي."}},
  {qui:"🐝", fr:"J'ai un frère et une sœur.", t:{en:"I have a brother and a sister.", it:"Ho un fratello e una sorella.", es:"Tengo un hermano y una hermana.", de:"Ich habe einen Bruder und eine Schwester.", pt:"Tenho um irmão e uma irmã.", nl:"Ik heb een broer en een zus.", pl:"Mam brata i siostrę.", ru:"У меня есть брат и сестра.", uk:"У мене є брат і сестра.", cs:"Mám bratra a sestru.", zh:"我有一个哥哥和一个姐姐。", ja:"私は兄と姉がいます。", ko:"나는 형과 누나가 있습니다.", ar:"لي أخ و أخت."}},
  {qui:"👶", fr:"Le bébé est petit.", t:{en:"The baby is small.", it:"Il bebè è piccolo.", es:"El bebé es pequeño.", de:"Das Baby ist klein.", pt:"O bebé é pequeno.", nl:"De baby is klein.", pl:"Dziecko jest małe.", ru:"Ребёнок маленький.", uk:"Дитина мала.", cs:"Dítě je malé.", zh:"婴儿很小。", ja:"赤ちゃんは小さいです。", ko:"아기는 작습니다.", ar:"الطفل صغير."}},
  {qui:"👵", fr:"Grand-mère a un chat.", t:{en:"Grandma has a cat.", it:"La nonna ha un gatto.", es:"La abuela tiene un gato.", de:"Oma hat eine Katze.", pt:"A avó tem um gato.", nl:"Oma heeft een kat.", pl:"Babcia ma kota.", ru:"У бабушки есть кот.", uk:"У бабусі є кіт.", cs:"Babička má kočku.", zh:"奶奶有只猫。", ja:"おばあちゃんは猫を飼っています。", ko:"할머니는 고양이를 가지고 있습니다.", ar:"جدي لديها قطة."}},
  {qui:"🐝", fr:"J'aime ma famille !", t:{en:"I love my family!", it:"Amo la mia famiglia!", es:"¡Amo a mi familia!", de:"Ich liebe meine Familie!", pt:"Amo a minha família!", nl:"Ik hou van mijn familie!", pl:"Kocham moją rodzinę!", ru:"Я люблю свою семью!", uk:"Я люблю свою сім'ю!", cs:"Miluji svou rodinu!", zh:"我爱我的家庭！", ja:"私は私の家族を愛しています！", ko:"저는 제 가족을 사랑합니다!", ar:"أنا أحب عائلتي!"}}],
  quiz:[
  {q:"Bee a…", opts:["Un frère et une sœur","Deux frères","Deux sœurs"], ok:0},
  {q:"Qui a un chat ?", opts:["Le père","Le bébé","Grand-mère"], ok:2},
  {q:"Le bébé est…", opts:["Grand","Petit","Noir"], ok:1}]},
 {id:"marche", ic:"🛒", titre:"Au marché", lignes:[
  {qui:"🧑‍🌾", fr:"Bonjour ! Des pommes ?", t:{en:"Hello! Apples?", it:"Buongiorno! Mele?", es:"¡Buenos días! ¿Manzanas?", de:"Guten Tag! Äpfel?", pt:"Bom dia! Maçãs?", nl:"Goedendag! Appels?", pl:"Cześć! Jabłka?", ru:"Здравствуйте! Яблоки?", uk:"Привіт! Яблука?", cs:"Dobrý den! Jablka?", zh:"你好！苹果吗？", ja:"こんにちは！りんごですか？", ko:"안녕하세요! 사과 있나요?", ar:"مرحبا! تفاح؟"}},
  {qui:"🐝", fr:"Oui, trois pommes, s'il te plaît.", t:{en:"Yes, three apples, please.", it:"Sì, tre mele, per favore.", es:"Sí, tres manzanas, por favor.", de:"Ja, drei Äpfel, bitte.", pt:"Sim, três maçãs, por favor.", nl:"Ja, drie appels, alstublieft.", pl:"Tak, trzy jabłka, proszę.", ru:"Да, три яблока, пожалуйста.", uk:"Так, три яблука, будь ласка.", cs:"Ano, tři jablka, prosím.", zh:"是的，三个苹果，谢谢。", ja:"はい、りんごを３個ください。", ko:"네, 사과 세 개 주세요.", ar:"نعم، ثلاثة تفاحات من فضلك."}},
  {qui:"🐝", fr:"Et du fromage.", t:{en:"And some cheese.", it:"E del formaggio.", es:"Y queso.", de:"Und Käse.", pt:"E queijo.", nl:"En kaas.", pl:"I ser.", ru:"И сыр.", uk:"І сир.", cs:"A sýr.", zh:"还有奶酪。", ja:"そしてチーズ。", ko:"그리고 치즈도.", ar:"والجبن."}},
  {qui:"🧑‍🌾", fr:"Voilà ! Dix euros.", t:{en:"Here you are! Ten euros.", it:"Ecco! Dieci euro.", es:"¡Aquí está! Diez euros.", de:"Bitte schön! Zehn Euro.", pt:"Aqui está! Dez euros.", nl:"Alstublieft! Tien euro.", pl:"Proszę! To kosztuje dziesięć euro.", ru:"Вот! Это десять евро.", uk:"Ось! Це десять євро.", cs:"Tady! To stojí deset eur.", zh:"给你！十欧元。", ja:"どうぞ！１０ユーロです。", ko:"드세요! 10유로입니다.", ar:"تفضل! عشرة يورو."}},
  {qui:"🐝", fr:"Merci ! Au revoir !", t:{en:"Thank you! Goodbye!", it:"Grazie! Arrivederci!", es:"¡Gracias! ¡Adiós!", de:"Danke! Auf Wiedersehen!", pt:"Obrigada! Adeus!", nl:"Dank je! Tot ziens!", pl:"Dziękuję! Żegnaj!", ru:"Спасибо! До свидания!", uk:"Дякую! До побачення!", cs:"Děkuji! Na shledanou!", zh:"谢谢！再见！", ja:"ありがとう！さようなら！", ko:"고맙습니다! 안녕!", ar:"شكراً! مع السلامة!"}}],
  quiz:[
  {q:"Combien de pommes ?", opts:["Deux","Trois","Dix"], ok:1},
  {q:"Bee achète aussi…", opts:["Du fromage","Du pain","Du poisson"], ok:0},
  {q:"Ça coûte…", opts:["Cinq euros","Cent euros","Dix euros"], ok:2}]},
 {id:"voyage", ic:"✈️", titre:"Le voyage", lignes:[
  {qui:"🐝", fr:"Pardon, où est la gare ?", t:{en:"Excuse me, where is the station?", it:"Scusi, dov'è la stazione?", es:"Perdón, ¿dónde está la estación?", de:"Entschuldigung, wo ist der Bahnhof?", pt:"Desculpe, onde é a estação?", nl:"Pardon, waar is het station?", pl:"Przepraszam, gdzie jest dworzec?", ru:"Извините, где вокзал?", uk:"Вибачте, де вокзал?", cs:"Promiňte, kde je nádraží?", zh:"对不起，火车站在哪里？", ja:"すみません、駅はどこですか？", ko:"죄송합니다, 기차역은 어디에 있나요?", ar:"عذراً، أين المحطة؟"}},
  {qui:"🧑", fr:"À gauche, puis à droite.", t:{en:"To the left, then to the right.", it:"A sinistra, poi a destra.", es:"A la izquierda, luego a la derecha.", de:"Nach links, dann nach rechts.", pt:"À esquerda, depois à direita.", nl:"Naar links, dan naar rechts.", pl:"W lewo, potem w prawo.", ru:"Налево, затем направо.", uk:"Уліво, потім управо.", cs:"Vlevo, pak vpravo.", zh:"向左，然后向右。", ja:"左に、次に右に。", ko:"왼쪽으로, 그다음 오른쪽으로.", ar:"الى اليسار، ثم الى اليمين."}},
  {qui:"🐝", fr:"Merci ! Et l'hôtel ?", t:{en:"Thank you! And the hotel?", it:"Grazie! E l'hotel?", es:"¡Gracias! ¿Y el hotel?", de:"Danke! Und das Hotel?", pt:"Obrigada! E o hotel?", nl:"Dank je! En het hotel?", pl:"Dziękuję! A hotel?", ru:"Спасибо! А где отель?", uk:"Дякую! А готель?", cs:"Děkuji! A hotel?", zh:"谢谢！酒店在哪里？", ja:"ありがとう！ホテルはどこですか？", ko:"고마워, 호텔은 어디에 있나요?", ar:"شكراً! أين الفندق؟"}},
  {qui:"🧑", fr:"Ici ! L'hôtel est grand.", t:{en:"Here! The hotel is big.", it:"Qui! L'hotel è grande.", es:"¡Aquí! El hotel es grande.", de:"Hier! Das Hotel ist groß.", pt:"Aqui! O hotel é grande.", nl:"Hier! Het hotel is groot.", pl:"Tutaj! Hotel jest duży.", ru:"Вот! Отель большой.", uk:"Тут! Готель великий.", cs:"Zde! Hotel je velký.", zh:"就在这里！酒店很大。", ja:"ここにあります！ホテルは大きいです。", ko:"여기에요, 호텔이 커요.", ar:"هنا! الفندق كبير."}},
  {qui:"🐝", fr:"La rue est belle.", t:{en:"The street is beautiful.", it:"La strada è bella.", es:"La calle es bonita.", de:"Die Straße ist schön.", pt:"A rua é bonita.", nl:"De straat is mooi.", pl:"Ulica jest ładna.", ru:"Улица красивая.", uk:"Вулиця гарна.", cs:"Ulice je hezká.", zh:"这条街很漂亮。", ja:"この通りはきれいです。", ko:"이 거리는 아름답습니다.", ar:"الشارع جميل."}}],
  quiz:[
  {q:"Bee cherche…", opts:["La gare","La plage","Le café"], ok:0},
  {q:"La gare est…", opts:["Tout droit","À gauche puis à droite","Derrière l'hôtel"], ok:1},
  {q:"L'hôtel est…", opts:["Petit","Nouveau","Grand"], ok:2}]},
 {id:"nuit", ic:"🌙", titre:"Bonne nuit", lignes:[
  {qui:"🐝", fr:"C'est le soir.", t:{en:"It is the evening.", it:"È la sera.", es:"Es la tarde.", de:"Es ist Abend.", pt:"É a noite.", nl:"Het is avond.", pl:"To jest wieczór.", ru:"Это вечер.", uk:"Це вечір.", cs:"Je večer.", zh:"这是晚上。", ja:"今夜です。", ko:"이제 밤입니다.", ar:"هذا المساء."}},
  {qui:"🐝", fr:"La lune est belle.", t:{en:"The moon is beautiful.", it:"La luna è bella.", es:"La luna es bonita.", de:"Der Mond ist schön.", pt:"A lua é bonita.", nl:"De maan is mooi.", pl:"Księżyc jest piękny.", ru:"Луна красива.", uk:"Місяць красивий.", cs:"Měsíc je krásný.", zh:"月亮很漂亮。", ja:"月は美しいです。", ko:"달은 아름답습니다.", ar:"القمر جميل."}},
  {qui:"🐝", fr:"Je vais au lit.", t:{en:"I go to bed.", it:"Vado a letto.", es:"Voy a la cama.", de:"Ich gehe ins Bett.", pt:"Vou para a cama.", nl:"Ik ga naar bed.", pl:"Idę spać.", ru:"Я иду спать.", uk:"Я йду спати.", cs:"Jdu spát.", zh:"我要去睡觉了。", ja:"寝ます。", ko:"자러 갑니다.", ar:"سأذهب للنوم."}},
  {qui:"🐝", fr:"Le ciel est noir.", t:{en:"The sky is black.", it:"Il cielo è nero.", es:"El cielo es negro.", de:"Der Himmel ist schwarz.", pt:"O céu é preto.", nl:"De lucht is zwart.", pl:"Niebo jest czarne.", ru:"Небо чёрное.", uk:"Небо чорне.", cs:"Nebe je černé.", zh:"天空是黑色的。", ja:"空は黒です。", ko:"하늘은 검은색입니다.", ar:"السماء سوداء."}},
  {qui:"🐝", fr:"Bonne nuit ! À demain !", t:{en:"Good night! See you tomorrow!", it:"Buonanotte! A domani!", es:"¡Buenas noches! ¡Hasta mañana!", de:"Gute Nacht! Bis morgen!", pt:"Boa noite! Até amanhã!", nl:"Goedenacht! Tot morgen!", pl:"Dobranoc! Do jutra!", ru:"Спокойной ночи! До завтра!", uk:"На добраніч! До завтра!", cs:"Dobrou noc! Až zítra!", zh:"晚安！明天见！", ja:"おやすみ！明日ね。", ko:"안녕히 주무세요! 내일 보자!", ar:"تصبح على خير! حتى الغد!"}}],
  quiz:[
  {q:"Comment est la lune ?", opts:["Belle","Petite","Rouge"], ok:0},
  {q:"Où va Bee ?", opts:["À la gare","Au lit","Au café"], ok:1},
  {q:"Le ciel est…", opts:["Bleu","Blanc","Noir"], ok:2}]},
 {id:"ecole", ic:"🏫", titre:"À l'école", lignes:[
  {qui:"🐝", fr:"C'est l'école.", t:{en:"It is the school.", it:"È la scuola.", es:"Es la escuela.", de:"Es ist die Schule.", pt:"É a escola.", nl:"Het is de school.", pl:"To jest szkoła.", ru:"Это школа.", uk:"Це школа.", cs:"To je škola.", zh:"这是学校。", ja:"これは学校です。", ko:"이것은 학교입니다.", ar:"هذه المدرسة."}},
  {qui:"🐝", fr:"J'ai un livre et un crayon.", t:{en:"I have a book and a pencil.", it:"Ho un libro e una matita.", es:"Tengo un libro y un lápiz.", de:"Ich habe ein Buch und einen Bleistift.", pt:"Tenho um livro e um lápis.", nl:"Ik heb een boek en een potlood.", pl:"Mam książkę i ołówek.", ru:"У меня есть книга и карандаш.", uk:"У мене є книга і олівець.", cs:"Mám knihu a tužku.", zh:"我有一本书和一支铅笔。", ja:"私は本と鉛筆を持っています。", ko:"나는 책과 연필을 가지고 있습니다.", ar:"عندي كتاب وقلم رصاص."}},
  {qui:"👩‍🏫", fr:"Bonjour ! Ouvrez le livre.", t:{en:"Hello! Open the book.", it:"Buongiorno! Aprite il libro.", es:"¡Buenos días! Abran el libro.", de:"Guten Tag! Öffnet das Buch.", pt:"Bom dia! Abram o livro.", nl:"Goedendag! Open het boek.", pl:"Cześć! Otwórz książkę.", ru:"Здравствуйте! Откройте книгу.", uk:"Привіт! Відкрий книгу.", cs:"Dobrý den! Otevřete knihu.", zh:"你好！打开书。", ja:"こんにちは！本を開けてください。", ko:"안녕하세요! 책을 열어주세요.", ar:"مرحبا! افتح الكتاب."}},
  {qui:"🐝", fr:"Un, deux, trois.", t:{en:"One, two, three.", it:"Uno, due, tre.", es:"Uno, dos, tres.", de:"Eins, zwei, drei.", pt:"Um, dois, três.", nl:"Een, twee, drie.", pl:"Jeden, dwa, trzy.", ru:"Раз, два, три.", uk:"Один, два, три.", cs:"Jeden, dva, tři.", zh:"一，二，三。", ja:"一、二、三。", ko:"하나, 둘, 셋.", ar:"واحد، اثنان، ثلاثة."}},
  {qui:"🐝", fr:"J'aime l'école !", t:{en:"I like school!", it:"Mi piace la scuola!", es:"¡Me gusta la escuela!", de:"Ich mag die Schule!", pt:"Gosto da escola!", nl:"Ik hou van school!", pl:"Lubię szkołę!", ru:"Мне нравится школа!", uk:"Мені подобається школа!", cs:"Mám rád školu!", zh:"我喜欢学校！", ja:"私は学校が好きです！", ko:"나는 학교를 좋아합니다!", ar:"أنا أحب المدرسة!"}}],
  quiz:[
  {q:"Bee a…", opts:["Un livre et un crayon","Un chat","Une pomme"], ok:0},
  {q:"La maîtresse dit…", opts:["Fermez la porte","Ouvrez le livre","Bonne nuit"], ok:1},
  {q:"Bee compte…", opts:["Un, deux, trois","Les chats","Les euros"], ok:0}]},
 {id:"temps", ic:"🌦️", titre:"Le temps", lignes:[
  {qui:"🐝", fr:"Aujourd'hui, il fait beau.", t:{en:"Today, it is nice.", it:"Oggi fa bello.", es:"Hoy hace buen tiempo.", de:"Heute ist es schön.", pt:"Hoje está bom tempo.", nl:"Vandaag is het mooi.", pl:"Dziś jest ładnie.", ru:"Сегодня хорошо.", uk:"Сьогодні гарно.", cs:"Dnes je hezky.", zh:"今天天气很好。", ja:"今日は晴れています。", ko:"오늘은 좋습니다.", ar:"اليوم الجو جميل."}},
  {qui:"🐝", fr:"Le soleil est grand.", t:{en:"The sun is big.", it:"Il sole è grande.", es:"El sol es grande.", de:"Die Sonne ist groß.", pt:"O sol é grande.", nl:"De zon is groot.", pl:"Słońce jest duże.", ru:"Солнце большое.", uk:"Сонце велике.", cs:"Slunce je velké.", zh:"太阳很大。", ja:"太陽は大きいです。", ko:"태양은 크다.", ar:"الشمس كبيرة."}},
  {qui:"☁️", fr:"Demain, il pleut.", t:{en:"Tomorrow, it rains.", it:"Domani piove.", es:"Mañana llueve.", de:"Morgen regnet es.", pt:"Amanhã chove.", nl:"Morgen regent het.", pl:"Jutro pada deszcz.", ru:"Завтра идёт дождь.", uk:"Завтра йде дощ.", cs:"Zítra prší.", zh:"明天会下雨。", ja:"明日は雨が降ります。", ko:"내일은 비가 옵니다.", ar:"غدًا تمطر."}},
  {qui:"🐝", fr:"J'ai un parapluie.", t:{en:"I have an umbrella.", it:"Ho un ombrello.", es:"Tengo un paraguas.", de:"Ich habe einen Regenschirm.", pt:"Tenho um guarda-chuva.", nl:"Ik heb een paraplu.", pl:"Mam parasol.", ru:"У меня есть зонт.", uk:"У мене є парасолька.", cs:"Mám deštník.", zh:"我有雨伞。", ja:"私は傘を持っています。", ko:"나는 우산을 가지고 있습니다.", ar:"عندي مظلة."}},
  {qui:"🐝", fr:"J'aime le soleil !", t:{en:"I love the sun!", it:"Amo il sole!", es:"¡Amo el sol!", de:"Ich liebe die Sonne!", pt:"Adoro o sol!", nl:"Ik hou van de zon!", pl:"Uwielbiam słońce!", ru:"Я люблю солнце!", uk:"Я люблю сонце!", cs:"Miluji slunce!", zh:"我爱太阳！", ja:"私は太陽が好きです！", ko:"나는 태양을 사랑합니다!", ar:"أنا أحب الشمس!"}}],
  quiz:[
  {q:"Aujourd'hui il fait…", opts:["Beau","Froid","Nuit"], ok:0},
  {q:"Demain il…", opts:["Neige","Pleut","Fait chaud"], ok:1},
  {q:"Bee a un…", opts:["Chapeau","Parapluie","Vélo"], ok:1}]},
 {id:"couleurs", ic:"🎨", titre:"Les couleurs", lignes:[
  {qui:"🐝", fr:"Regarde les couleurs !", t:{en:"Look at the colors!", it:"Guarda i colori!", es:"¡Mira los colores!", de:"Schau die Farben an!", pt:"Olha as cores!", nl:"Kijk naar de kleuren!", pl:"Popatrz na kolory!", ru:"Посмотри на цвета!", uk:"Подивись на кольори!", cs:"Podívej se na barvy!", zh:"看那些颜色！", ja:"色を見て！", ko:"색을 봐!", ar:"انظر إلى الألوان!"}},
  {qui:"🐝", fr:"La pomme est rouge.", t:{en:"The apple is red.", it:"La mela è rossa.", es:"La manzana es roja.", de:"Der Apfel ist rot.", pt:"A maçã é vermelha.", nl:"De appel is rood.", pl:"Jabłko jest czerwone.", ru:"Яблоко красное.", uk:"Яблуко червоне.", cs:"Jablko je červené.", zh:"苹果是红色的。", ja:"りんごは赤いです。", ko:"사과는 빨간색입니다.", ar:"التفاحة حمراء."}},
  {qui:"🐝", fr:"Le ciel est bleu.", t:{en:"The sky is blue.", it:"Il cielo è blu.", es:"El cielo es azul.", de:"Der Himmel ist blau.", pt:"O céu é azul.", nl:"De lucht is blauw.", pl:"Niebo jest niebieskie.", ru:"Небо синее.", uk:"Небо синє.", cs:"Nebe je modré.", zh:"天空是蓝色的。", ja:"空は青いです。", ko:"하늘은 파란색입니다.", ar:"السماء زرقاء."}},
  {qui:"🐝", fr:"L'herbe est verte.", t:{en:"The grass is green.", it:"L'erba è verde.", es:"La hierba es verde.", de:"Das Gras ist grün.", pt:"A relva é verde.", nl:"Het gras is groen.", pl:"Trawa jest zielona.", ru:"Трава зелёная.", uk:"Трава зелена.", cs:"Tráva je zelená.", zh:"草是绿色的。", ja:"草は緑です。", ko:"풀은 녹색입니다.", ar:"العشب أخضر."}},
  {qui:"🐝", fr:"J'aime le jaune du soleil.", t:{en:"I like the yellow of the sun.", it:"Mi piace il giallo del sole.", es:"Me gusta el amarillo del sol.", de:"Ich mag das Gelb der Sonne.", pt:"Gosto do amarelo do sol.", nl:"Ik hou van het geel van de zon.", pl:"Lubię żółty kolor słońca.", ru:"Мне нравится жёлтый цвет солнца.", uk:"Мені подобається жовтий колір сонця.", cs:"Mě baví žlutá barva slunce.", zh:"我喜欢太阳的黄色。", ja:"私は太陽の黄色が好きです。", ko:"나는 태양의 노란색을 좋아합니다.", ar:"أنا أحب لون الشمس الأصفر."}}],
  quiz:[
  {q:"La pomme est…", opts:["Rouge","Bleue","Verte"], ok:0},
  {q:"Le ciel est…", opts:["Vert","Bleu","Jaune"], ok:1},
  {q:"L'herbe est…", opts:["Rouge","Verte","Noire"], ok:1}]},
 {id:"anniv", ic:"🎂", titre:"L'anniversaire", lignes:[
  {qui:"🐝", fr:"C'est mon anniversaire !", t:{en:"It is my birthday!", it:"È il mio compleanno!", es:"¡Es mi cumpleaños!", de:"Es ist mein Geburtstag!", pt:"É o meu aniversário!", nl:"Het is mijn verjaardag!", pl:"To są moje urodziny!", ru:"Это мой день рождения!", uk:"Це мій день народження!", cs:"Je to moje narozeniny!", zh:"今天是我的生日！", ja:"今日は私の誕生日です！", ko:"오늘은 제 생일이에요!", ar:"إنه عيد ميلادي!"}},
  {qui:"👪", fr:"Joyeux anniversaire !", t:{en:"Happy birthday!", it:"Buon compleanno!", es:"¡Feliz cumpleaños!", de:"Alles Gute zum Geburtstag!", pt:"Feliz aniversário!", nl:"Fijne verjaardag!", pl:"Wszystkiego najlepszego z okazji urodzin!", ru:"С днём рождения!", uk:"З днем народження!", cs:"Všechno nejlepší k narozeninám!", zh:"生日快乐！", ja:"お誕生日おめでとう！", ko:"생일 축하해요!", ar:"عيد ميلاد سعيد!"}},
  {qui:"🐝", fr:"Il y a un gâteau.", t:{en:"There is a cake.", it:"C'è una torta.", es:"Hay un pastel.", de:"Es gibt einen Kuchen.", pt:"Há um bolo.", nl:"Er is een taart.", pl:"Jest tam tort.", ru:"Там есть торт.", uk:"Там є торт.", cs:"Je tam dort.", zh:"那里有一个蛋糕。", ja:"ケーキがあります。", ko:"케이크가 있어요.", ar:"هناك كعكة."}},
  {qui:"🐝", fr:"J'ai sept ans.", t:{en:"I am seven years old.", it:"Ho sette anni.", es:"Tengo siete años.", de:"Ich bin sieben Jahre alt.", pt:"Tenho sete anos.", nl:"Ik ben zeven jaar.", pl:"Mam siedem lat.", ru:"Мне семь лет.", uk:"Мені сім років.", cs:"Je mi sedm let.", zh:"我七岁了。", ja:"私は七歳です。", ko:"저는 일곱 살이에요.", ar:"أنا في السابعة من عمري."}},
  {qui:"🐝", fr:"Merci ! Je suis contente !", t:{en:"Thank you! I am happy!", it:"Grazie! Sono contenta!", es:"¡Gracias! ¡Estoy contenta!", de:"Danke! Ich bin glücklich!", pt:"Obrigada! Estou feliz!", nl:"Dank je! Ik ben blij!", pl:"Dziękuję! Jestem szczęśliwa!", ru:"Спасибо! Я счастлива!", uk:"Дякую! Я щаслива!", cs:"Děkuji! Jsem šťastná!", zh:"谢谢！我很开心！", ja:"ありがとう！うれしいです！", ko:"감사합니다! 기뻐요!", ar:"شكراً! أنا سعيدة!"}}],
  quiz:[
  {q:"C'est…", opts:["Le matin","L'anniversaire de Bee","Noël"], ok:1},
  {q:"Il y a un…", opts:["Gâteau","Chat","Livre"], ok:0},
  {q:"Bee a…", opts:["Cinq ans","Sept ans","Dix ans"], ok:1}]},
 {id:"docteur", ic:"🩺", titre:"Chez le docteur", lignes:[
  {qui:"🐝", fr:"Je suis malade.", t:{en:"I am sick.", it:"Sono malata.", es:"Estoy enferma.", de:"Ich bin krank.", pt:"Estou doente.", nl:"Ik ben ziek.", pl:"Jestem chory.", ru:"Я болен.", uk:"Я хворий.", cs:"Jsem nemocný.", zh:"我生病了。", ja:"私は病気です。", ko:"나는 아파요.", ar:"أنا مريض."}},
  {qui:"🩺", fr:"Bonjour. Où as-tu mal ?", t:{en:"Hello. Where does it hurt?", it:"Buongiorno. Dove ti fa male?", es:"Buenos días. ¿Dónde te duele?", de:"Guten Tag. Wo tut es weh?", pt:"Bom dia. Onde dói?", nl:"Goedendag. Waar doet het pijn?", pl:"Cześć. Gdzie cię boli?", ru:"Здравствуйте. Где у вас болит?", uk:"Привіт. Де у вас болить?", cs:"Dobrý den. Kde vás bolí?", zh:"你好。在哪里疼?", ja:"こんにちは。どこが痛いんですか？", ko:"안녕하세요. 어디가 아파요?", ar:"مرحباً. أين هو الألم؟"}},
  {qui:"🐝", fr:"J'ai mal à la tête.", t:{en:"I have a headache.", it:"Ho mal di testa.", es:"Me duele la cabeza.", de:"Ich habe Kopfschmerzen.", pt:"Dói-me a cabeça.", nl:"Ik heb hoofdpijn.", pl:"Boli mnie głowa.", ru:"У меня болит голова.", uk:"У мене болить голова.", cs:"Mě bolí hlava.", zh:"我的头疼。", ja:"頭が痛いです。", ko:"머리가 아파요.", ar:"رأسي يؤلمني."}},
  {qui:"🩺", fr:"Bois de l'eau et dors.", t:{en:"Drink water and sleep.", it:"Bevi acqua e dormi.", es:"Bebe agua y duerme.", de:"Trink Wasser und schlaf.", pt:"Bebe água e dorme.", nl:"Drink water en slaap.", pl:"Wypij wody i śpij.", ru:"Выпей воды и поспи.", uk:"Випий води й поспи.", cs:"Pij vodu a spi.", zh:"喝水然后睡觉。", ja:"水を飲んで寝てください。", ko:"물을 마시고 자요.", ar:"اشرب الماء ونم."}},
  {qui:"🐝", fr:"Merci, docteur !", t:{en:"Thank you, doctor!", it:"Grazie, dottore!", es:"¡Gracias, doctor!", de:"Danke, Doktor!", pt:"Obrigada, doutor!", nl:"Dank je, dokter!", pl:"Dziękuję, doktorze!", ru:"Спасибо, доктор!", uk:"Дякую, докторе!", cs:"Děkuji, doktore!", zh:"谢谢您，医生！", ja:"ありがとう、先生！", ko:"감사합니다, 의사님!", ar:"شكراً لك، دكتور!"}}],
  quiz:[
  {q:"Bee est…", opts:["Contente","Malade","Grande"], ok:1},
  {q:"Bee a mal…", opts:["À la tête","Au pied","Au bras"], ok:0},
  {q:"Le docteur dit de boire…", opts:["Du café","De l'eau","Du lait"], ok:1}]},
 {id:"parc", ic:"🌳", titre:"Le parc", lignes:[
  {qui:"🐝", fr:"Allons au parc !", t:{en:"Let's go to the park!", it:"Andiamo al parco!", es:"¡Vamos al parque!", de:"Gehen wir in den Park!", pt:"Vamos ao parque!", nl:"Laten we naar het park gaan!", pl:"Chodźmy do parku!", ru:"Давайте пойдём в парк!", uk:"Ходімо в парк!", cs:"Pojďme do parku!", zh:"我们去公园吧！", ja:"公園に行こう！", ko:"공원에 가자!", ar:"هيا إلى الحديقة!"}},
  {qui:"🐝", fr:"Les arbres sont grands.", t:{en:"The trees are big.", it:"Gli alberi sono grandi.", es:"Los árboles son grandes.", de:"Die Bäume sind groß.", pt:"As árvores são grandes.", nl:"De bomen zijn groot.", pl:"Drzewa są wysokie.", ru:"Деревья большие.", uk:"Дерева великі.", cs:"Stromy jsou vysoké.", zh:"树很高。", ja:"木は高い。", ko:"나무가 크다.", ar:"الأشجار كبيرة."}},
  {qui:"🐕", fr:"Le chien court.", t:{en:"The dog runs.", it:"Il cane corre.", es:"El perro corre.", de:"Der Hund rennt.", pt:"O cão corre.", nl:"De hond rent.", pl:"Pies biegnie.", ru:"Собака бежит.", uk:"Пес біжить.", cs:"Pes běží.", zh:"狗在跑。", ja:"犬が走っている。", ko:"개의 달리고 있다.", ar:"الكلب يركض."}},
  {qui:"🐝", fr:"Je joue avec le ballon.", t:{en:"I play with the ball.", it:"Gioco con la palla.", es:"Juego con la pelota.", de:"Ich spiele mit dem Ball.", pt:"Jogo com a bola.", nl:"Ik speel met de bal.", pl:"Bawię się piłką.", ru:"Я играю с мячом.", uk:"Я граюся з м'ячем.", cs:"Hraji si s míčem.", zh:"我在玩球。", ja:"私はボールで遊んでいる。", ko:"나는 공을 가지고 노는 중이다.", ar:"أنا ألعب الكرة."}},
  {qui:"🐝", fr:"Le parc est beau !", t:{en:"The park is beautiful!", it:"Il parco è bello!", es:"¡El parque es bonito!", de:"Der Park ist schön!", pt:"O parque é bonito!", nl:"Het park is mooi!", pl:"Park jest piękny!", ru:"Парк красив!", uk:"Парк красивий!", cs:"Park je krásný!", zh:"公园真漂亮！", ja:"公園は美しい！", ko:"공원은 아름답다!", ar:"الحديقة جميلة!"}}],
  quiz:[
  {q:"Où va Bee ?", opts:["Au parc","À la gare","À l'école"], ok:0},
  {q:"Que fait le chien ?", opts:["Il dort","Il court","Il mange"], ok:1},
  {q:"Bee joue avec…", opts:["Un ballon","Un chat","Un livre"], ok:0}]},
 {id:"sport", ic:"⚽", titre:"Le sport", lignes:[
  {qui:"🐝", fr:"J'aime le sport.", t:{en:"I like sport.", it:"Mi piace lo sport.", es:"Me gusta el deporte.", de:"Ich mag Sport.", pt:"Gosto de desporto.", nl:"Ik hou van sport.", pl:"Lubię sport", ru:"Мне нравится спорт", uk:"Мене подобається спорт", cs:"Mám rád sport", zh:"我喜欢运动", ja:"私はスポーツが好きです", ko:"나는 운동을 좋아합니다", ar:"أنا أحب الرياضة"}},
  {qui:"🐝", fr:"Je cours vite.", t:{en:"I run fast.", it:"Corro veloce.", es:"Corro rápido.", de:"Ich laufe schnell.", pt:"Corro depressa.", nl:"Ik ren snel.", pl:"Biegnę szybko", ru:"Я бегаю быстро", uk:"Я біжу швидко", cs:"Běžím rychle", zh:"我跑得快", ja:"私は速く走ります", ko:"나는 빠르게 달립니다", ar:"أنا أجرى بسرعة"}},
  {qui:"🐝", fr:"Je joue au football.", t:{en:"I play football.", it:"Gioco a calcio.", es:"Juego al fútbol.", de:"Ich spiele Fußball.", pt:"Jogo futebol.", nl:"Ik speel voetbal.", pl:"Gram w piłkę nożną", ru:"Я играю в футбол", uk:"Я граю у футбол", cs:"Hraji fotbal", zh:"我踢足球", ja:"私はサッカーをします", ko:"나는 축구를 합니다", ar:"أنا ألعب كرة القدم"}},
  {qui:"🐝", fr:"Le ballon est rond.", t:{en:"The ball is round.", it:"La palla è rotonda.", es:"La pelota es redonda.", de:"Der Ball ist rund.", pt:"A bola é redonda.", nl:"De bal is rond.", pl:"Piłka jest okrągła", ru:"Мяч круглый", uk:"М'яч круглий", cs:"Míč je kulatý", zh:"球是圆的", ja:"ボールは丸いです", ko:"공은 둥근 모양입니다", ar:"الكرة مستديرة"}},
  {qui:"🐝", fr:"Le sport, c'est super !", t:{en:"Sport is great!", it:"Lo sport è fantastico!", es:"¡El deporte es genial!", de:"Sport ist toll!", pt:"O desporto é ótimo!", nl:"Sport is geweldig!", pl:"Sport to super!", ru:"Спорт - это здорово!", uk:"Спорт - це супер!", cs:"Sport je super!", zh:"运动真棒！", ja:"スポーツはすごいです！", ko:"운동은 최고입니다!", ar:"الرياضة رائعة!"}}],
  quiz:[
  {q:"Bee court…", opts:["Vite","Lentement","Jamais"], ok:0},
  {q:"Bee joue au…", opts:["Tennis","Football","Basket"], ok:1},
  {q:"Le ballon est…", opts:["Carré","Rond","Petit"], ok:1}]},
 {id:"resto", ic:"🍽️", titre:"Au restaurant", lignes:[
  {qui:"🐝", fr:"J'ai faim.", t:{en:"I am hungry.", it:"Ho fame.", es:"Tengo hambre.", de:"Ich habe Hunger.", pt:"Tenho fome.", nl:"Ik heb honger.", pl:"Jestem głodny.", ru:"Я голоден.", uk:"Я голоден.", cs:"Jsem hladový.", zh:"我饿了。", ja:"私はお腹がすいています。", ko:"배가 고파요.", ar:"جوعان."}},
  {qui:"🧑‍🍳", fr:"Bonsoir ! Une table ?", t:{en:"Good evening! A table?", it:"Buonasera! Un tavolo?", es:"¡Buenas noches! ¿Una mesa?", de:"Guten Abend! Ein Tisch?", pt:"Boa noite! Uma mesa?", nl:"Goedenavond! Een tafel?", pl:"Dobry wieczór! Stolik?", ru:"Добрый вечер! Столик?", uk:"Добрий вечір! Столик?", cs:"Dobrý večer! Stůl?", zh:"晚上好！要一个桌子吗？", ja:"こんばんは！テーブルをください。", ko:"저녁 좋은 밤 되세요! 테이블 하나 주세요.", ar:"مساء الخير! طاولة من فضلكم."}},
  {qui:"🐝", fr:"Oui. Une soupe, s'il te plaît.", t:{en:"Yes. A soup, please.", it:"Sì. Una zuppa, per favore.", es:"Sí. Una sopa, por favor.", de:"Ja. Eine Suppe, bitte.", pt:"Sim. Uma sopa, por favor.", nl:"Ja. Een soep, alstublieft.", pl:"Tak. Zupa, proszę.", ru:"Да. Суп, пожалуйста.", uk:"Так. Суп, будь ласка.", cs:"Ano. Polévka, prosím.", zh:"是的。请给我一碗汤。", ja:"はい。スープをください。", ko:"네, 수프를 주세요.", ar:"نعم، حسناً. حار من فضلكم."}},
  {qui:"🧑‍🍳", fr:"Et de l'eau ?", t:{en:"And some water?", it:"E dell'acqua?", es:"¿Y agua?", de:"Und Wasser?", pt:"E água?", nl:"En water?", pl:"A woda?", ru:"А вода?", uk:"А вода?", cs:"A voda?", zh:"还有水吗？", ja:"水もありますか？", ko:"물도 있나요?", ar:"وماء؟"}},
  {qui:"🐝", fr:"Oui, merci. C'est bon !", t:{en:"Yes, thank you. It is good!", it:"Sì, grazie. È buono!", es:"Sí, gracias. ¡Está bueno!", de:"Ja, danke. Es ist gut!", pt:"Sim, obrigada. Está bom!", nl:"Ja, dank je. Het is lekker!", pl:"Tak, dziękuję. Smakuje.", ru:"Да, спасибо. Вкусно.", uk:"Так, дякую. Смакує.", cs:"Ano, děkuji. Chutná.", zh:"是的，谢谢。很好吃。", ja:"はい、ありがとう。美味しいです。", ko:"네, 감사합니다. 맛있어요.", ar:"نعم، شكراً. جيد."}}],
  quiz:[
  {q:"Bee a…", opts:["Faim","Sommeil","Froid"], ok:0},
  {q:"Bee commande une…", opts:["Pizza","Soupe","Salade"], ok:1},
  {q:"Elle boit de l'…", opts:["Eau","Café","Lait"], ok:0}]},
 {id:"plage", ic:"🏖️", titre:"La plage", lignes:[
  {qui:"🐝", fr:"Voici la plage !", t:{en:"Here is the beach!", it:"Ecco la spiaggia!", es:"¡Aquí está la playa!", de:"Hier ist der Strand!", pt:"Aqui está a praia!", nl:"Hier is het strand!", pl:"Oto plaża!", ru:"Вот пляж!", uk:"Ото пляж!", cs:"Hleď, pláž!", zh:"这是海滩。", ja:"海岸が見える！", ko:"해변이다!", ar:"هنا الشاطئ!"}},
  {qui:"🐝", fr:"La mer est bleue.", t:{en:"The sea is blue.", it:"Il mare è blu.", es:"El mar es azul.", de:"Das Meer ist blau.", pt:"O mar é azul.", nl:"De zee is blauw.", pl:"Morze jest niebieskie.", ru:"Море синее.", uk:"Море синє.", cs:"Moře je modré.", zh:"海是蓝色的。", ja:"海は青いです。", ko:"바다는 파랗다.", ar:"البحر أزرق."}},
  {qui:"🐝", fr:"Le sable est chaud.", t:{en:"The sand is hot.", it:"La sabbia è calda.", es:"La arena está caliente.", de:"Der Sand ist heiß.", pt:"A areia está quente.", nl:"Het zand is warm.", pl:"Piasek jest ciepły.", ru:"Песок тёплый.", uk:"Піск теплий.", cs:"Písek je teplý.", zh:"沙子很热。", ja:"砂はあたたかいです。", ko:"모래는 뜨겁다.", ar:"الرمل دافئ."}},
  {qui:"🐝", fr:"Je nage dans la mer.", t:{en:"I swim in the sea.", it:"Nuoto nel mare.", es:"Nado en el mar.", de:"Ich schwimme im Meer.", pt:"Nado no mar.", nl:"Ik zwem in de zee.", pl:"Pływam w morzu.", ru:"Я плыву в море.", uk:"Я пливу у морі.", cs:"Plavu v moři.", zh:"我在海里游泳。", ja:"私は海で泳いでいます。", ko:"나는 바다에서 수영한다.", ar:"أنا أسبح في البحر."}},
  {qui:"🐝", fr:"J'aime la plage !", t:{en:"I love the beach!", it:"Amo la spiaggia!", es:"¡Amo la playa!", de:"Ich liebe den Strand!", pt:"Adoro a praia!", nl:"Ik hou van het strand!", pl:"Lubię plażę!", ru:"Мне нравится пляж!", uk:"Мені подобається пляж!", cs:"Mám ráda pláž!", zh:"我喜欢海滩。", ja:"私は海岸が好きです！", ko:"나는 해변을 좋아한다.", ar:"أنا أحب الشاطئ!"}}],
  quiz:[
  {q:"La mer est…", opts:["Bleue","Verte","Noire"], ok:0},
  {q:"Le sable est…", opts:["Froid","Chaud","Bleu"], ok:1},
  {q:"Bee… dans la mer.", opts:["Dort","Nage","Mange"], ok:1}]},
 {id:"matin", ic:"☀️", titre:"Le matin", lignes:[
  {qui:"🐝", fr:"C'est le matin.", t:{en:"It is the morning.", it:"È mattina.", es:"Es la mañana.", de:"Es ist Morgen.", pt:"É de manhã.", nl:"Het is ochtend.", pl:"To jest rano.", ru:"Это утро.", uk:"Це ранок.", cs:"Je ráno.", zh:"这是早晨。", ja:"これは朝です。", ko:"이것은 아침입니다.", ar:"هذا الصباح."}},
  {qui:"🐝", fr:"Je me lève.", t:{en:"I get up.", it:"Mi alzo.", es:"Me levanto.", de:"Ich stehe auf.", pt:"Levanto-me.", nl:"Ik sta op.", pl:"Wstaję.", ru:"Я встаю.", uk:"Я встаю.", cs:"Vstávám.", zh:"我起床了。", ja:"私は起きます。", ko:"나는 일어납니다.", ar:"أنا أقوم."}},
  {qui:"🐝", fr:"Je bois du lait.", t:{en:"I drink milk.", it:"Bevo il latte.", es:"Bebo leche.", de:"Ich trinke Milch.", pt:"Bebo leite.", nl:"Ik drink melk.", pl:"Piję mleko.", ru:"Я пью молоко.", uk:"Я п'ю молоко.", cs:"Piji mléko.", zh:"我喝牛奶。", ja:"私は牛乳を飲みます。", ko:"나는 우유를 마십니다.", ar:"أنا أشرب الحليب."}},
  {qui:"🐝", fr:"Je mange du pain.", t:{en:"I eat bread.", it:"Mangio il pane.", es:"Como pan.", de:"Ich esse Brot.", pt:"Como pão.", nl:"Ik eet brood.", pl:"Jem chleb.", ru:"Я ем хлеб.", uk:"Я їм хліб.", cs:"Jím chleba.", zh:"我吃面包。", ja:"私はパンを食べます。", ko:"나는 빵을 먹습니다.", ar:"أنا آكل الخبز."}},
  {qui:"🐝", fr:"Bonne journée !", t:{en:"Have a good day!", it:"Buona giornata!", es:"¡Buen día!", de:"Einen schönen Tag!", pt:"Bom dia!", nl:"Fijne dag!", pl:"Życzę dobrego dnia!", ru:"Желаю хорошего дня!", uk:"Бажаю добого дня!", cs:"Přeji hezký den!", zh:"祝你有美好的一天！", ja:"良い一日を！", ko:"좋은 하루 보내세요!", ar:"أتمنى لك يوماً جميلاً!"}}],
  quiz:[
  {q:"C'est le…", opts:["Matin","Soir","Nuit"], ok:0},
  {q:"Bee boit du…", opts:["Café","Lait","Thé"], ok:1},
  {q:"Bee mange du…", opts:["Pain","Gâteau","Fromage"], ok:0}]},
 {id:"ferme", ic:"🚜", titre:"La ferme", lignes:[
  {qui:"🐝", fr:"Voici la ferme.", t:{en:"Here is the farm.", it:"Ecco la fattoria.", es:"Aquí está la granja.", de:"Hier ist der Bauernhof.", pt:"Aqui está a quinta.", nl:"Hier is de boerderij.", pl:"Oto farma.", ru:"Вот ферма.", uk:"Ось ферма.", cs:"Tady je farma.", zh:"这里是农场。", ja:"ここは農場です。", ko:"여기가 농장입니다.", ar:"هنا المزرعة."}},
  {qui:"🐄", fr:"La vache mange l'herbe.", t:{en:"The cow eats the grass.", it:"La mucca mangia l'erba.", es:"La vaca come la hierba.", de:"Die Kuh frisst das Gras.", pt:"A vaca come a relva.", nl:"De koe eet het gras.", pl:"Krowa je trawę.", ru:"Корова ест траву.", uk:"Корова їсть траву.", cs:"Kráva jí trávu.", zh:"牛吃草。", ja:"牛は草を食べます。", ko:"소는 풀을 먹습니다.", ar:"تأكل البقرة العشب."}},
  {qui:"🐔", fr:"La poule a un œuf.", t:{en:"The hen has an egg.", it:"La gallina ha un uovo.", es:"La gallina tiene un huevo.", de:"Die Henne hat ein Ei.", pt:"A galinha tem um ovo.", nl:"De kip heeft een ei.", pl:"Kurka ma jajko.", ru:"Курица имеет яйцо.", uk:"Курка має яйце.", cs:"Slepice má vejce.", zh:"母鸡有一个蛋。", ja:"ニワトリは卵を持っています。", ko:"암탉은 계란을 가지고 있습니다.", ar:"الديكة لها بيضة."}},
  {qui:"🐷", fr:"Le cochon est rose.", t:{en:"The pig is pink.", it:"Il maiale è rosa.", es:"El cerdo es rosa.", de:"Das Schwein ist rosa.", pt:"O porco é cor-de-rosa.", nl:"Het varken is roze.", pl:"Świnia jest różowa.", ru:"Свинья розовая.", uk:"Свиня рожева.", cs:"Prase je růžové.", zh:"猪是粉色的。", ja:"豚はピンク色です。", ko:"돼지는 분홍색입니다.", ar:"الخنزير وردي."}},
  {qui:"🐝", fr:"J'aime les animaux !", t:{en:"I love the animals!", it:"Amo gli animali!", es:"¡Amo los animales!", de:"Ich liebe die Tiere!", pt:"Adoro os animais!", nl:"Ik hou van de dieren!", pl:"Uwielbiam zwierzęta!", ru:"Мне нравятся животные!", uk:"Мені подобаються тварини!", cs:"Mám rád zvířata!", zh:"我爱动物！", ja:"私は動物が好きです！", ko:"나는 동물을 좋아합니다!", ar:"أنا أحب الحيوانات!"}}],
  quiz:[
  {q:"Que mange la vache ?", opts:["De l'herbe","Du pain","Du poisson"], ok:0},
  {q:"La poule a un…", opts:["Chat","Œuf","Livre"], ok:1},
  {q:"Le cochon est…", opts:["Bleu","Rose","Noir"], ok:1}]},
 {id:"vetements", ic:"🧥", titre:"Les vêtements", lignes:[
  {qui:"🐝", fr:"Il fait froid.", t:{en:"It is cold.", it:"Fa freddo.", es:"Hace frío.", de:"Es ist kalt.", pt:"Está frio.", nl:"Het is koud.", pl:"Jest zimno.", ru:"Холодно.", uk:"Холодно.", cs:"Je zima.", zh:"很冷。", ja:"寒いです。", ko:"추워.", ar:"بارد."}},
  {qui:"🐝", fr:"Je mets un manteau.", t:{en:"I put on a coat.", it:"Metto un cappotto.", es:"Me pongo un abrigo.", de:"Ich ziehe einen Mantel an.", pt:"Visto um casaco.", nl:"Ik trek een jas aan.", pl:"Wkładam płaszcz.", ru:"Я надеваю пальто.", uk:"Я надягаю пальто.", cs:"Oblékám si kabát.", zh:"我穿上外套。", ja:"コートを着ます。", ko:"코트를 입습니다.", ar:"ألبس معطفا."}},
  {qui:"🐝", fr:"J'ai un chapeau rouge.", t:{en:"I have a red hat.", it:"Ho un cappello rosso.", es:"Tengo un sombrero rojo.", de:"Ich habe einen roten Hut.", pt:"Tenho um chapéu vermelho.", nl:"Ik heb een rode hoed.", pl:"Mam czerwoną czapkę.", ru:"У меня есть красная шапка.", uk:"У мене є червона шапка.", cs:"Mám červenou čapku.", zh:"我有一顶红帽子。", ja:"私には赤い帽子があります。", ko:"나는 빨간 모자를 가지고 있습니다.", ar:"عندي قبعة حمراء."}},
  {qui:"🧑", fr:"Tes chaussures sont belles.", t:{en:"Your shoes are nice.", it:"Le tue scarpe sono belle.", es:"Tus zapatos son bonitos.", de:"Deine Schuhe sind schön.", pt:"Os teus sapatos são bonitos.", nl:"Je schoenen zijn mooi.", pl:"Twoje buty są ładne.", ru:"Твои туфли красивые.", uk:"Твої туфлі гарні.", cs:"Tvoje boty jsou hezké.", zh:"你的鞋子很漂亮。", ja:"あなたの靴はきれいです。", ko:"당신의 신발은 예쁩니다.", ar:"حذاؤك جميل."}},
  {qui:"🐝", fr:"Merci ! Je suis prête !", t:{en:"Thank you! I am ready!", it:"Grazie! Sono pronta!", es:"¡Gracias! ¡Estoy lista!", de:"Danke! Ich bin bereit!", pt:"Obrigada! Estou pronta!", nl:"Dank je! Ik ben klaar!", pl:"Dziękuję! Jestem gotowa!", ru:"Спасибо! Я готова!", uk:"Дякую! Я готова!", cs:"Děkuji! Jsem připravena!", zh:"谢谢！我准备好了！", ja:"ありがとう！私は準備できました！", ko:"고마워! 나는 준비가 되었어!", ar:"شكرا! أنا مستعدة!"}}],
  quiz:[
  {q:"Il fait…", opts:["Chaud","Froid","Beau"], ok:1},
  {q:"Bee met un…", opts:["Manteau","Maillot","Pyjama"], ok:0},
  {q:"Le chapeau est…", opts:["Bleu","Rouge","Vert"], ok:1}]},
 {id:"travail", ic:"💼", titre:"Le premier jour de travail", lignes:[
  {qui:"🐝", fr:"Aujourd'hui, je commence un nouveau travail.", t:{en:"Today I start a new job.", it:"Oggi comincio un nuovo lavoro.", es:"Hoy empiezo un trabajo nuevo.", de:"Heute fange ich einen neuen Job an.", pt:"Hoje começo um novo trabalho.", nl:"Vandaag begin ik een nieuwe baan.", pl:"Dziś zaczynam nową pracę.", ru:"Сегодня я начинаю новую работу.", uk:"Сьогодні я починаю нову роботу.", cs:"Dnes začínám novou práci.", zh:"今天我开始一份新工作。", ja:"今日から新しい仕事を始める。", ko:"오늘 새로운 일을 시작한다.", ar:"اليوم أبدأ عملًا جديدًا."}},
  {qui:"🐝", fr:"Je suis un peu inquiète.", t:{en:"I am a little worried.", it:"Sono un po' preoccupata.", es:"Estoy un poco preocupada.", de:"Ich bin ein bisschen besorgt.", pt:"Estou um pouco preocupada.", nl:"Ik ben een beetje bezorgd.", pl:"Jestem trochę zaniepokojona.", ru:"Я немного волнуюсь.", uk:"Я трохи турбуюсь.", cs:"Jsem trochu znepokojena.", zh:"我有点担心。", ja:"私は少し心配だ。", ko:"나는 조금 걱정한다.", ar:"أنا قلقة قليلا."}},
  {qui:"🧑", fr:"Bonjour ! Bienvenue au bureau.", t:{en:"Hello! Welcome to the office.", it:"Buongiorno! Benvenuta in ufficio.", es:"¡Hola! Bienvenida a la oficina.", de:"Hallo! Willkommen im Büro.", pt:"Olá! Bem-vinda ao escritório.", nl:"Hallo! Welkom op kantoor.", pl:"Cześć! Witaj w biurze.", ru:"Здравствуйте! Добро пожаловать в офис.", uk:"Привіт! Ласкаво просимо в офіс.", cs:"Dobrý den! Vítejte v kanceláři.", zh:"你好！欢迎来到办公室。", ja:"こんにちは！事務所へようこそ。", ko:"안녕하세요! 사무실에 오신 것을 환영합니다.", ar:"مرحباً! مرحباً بكم في المكتب."}},
  {qui:"🧑", fr:"Voici ton ordinateur et ton collègue.", t:{en:"Here is your computer and your colleague.", it:"Ecco il tuo computer e il tuo collega.", es:"Aquí está tu ordenador y tu colega.", de:"Hier ist dein Computer und dein Kollege.", pt:"Aqui está o teu computador e o teu colega.", nl:"Hier is je computer en je collega.", pl:"Oto twój komputer i twój kolega.", ru:"Вот ваш компьютер и ваш коллега.", uk:"Ось ваш комп'ютер і ваш колега.", cs:"Tady je váš počítač a váš kolega.", zh:"这是你的电脑和你的同事。", ja:"こちらがあなたのコンピューターと同僚です。", ko:"이것이 당신의 컴퓨터와 동료입니다.", ar:"هذا كمبيوترك وزميلك."}},
  {qui:"🐝", fr:"Merci ! Je suis contente d'être ici.", t:{en:"Thank you! I am happy to be here.", it:"Grazie! Sono contenta di essere qui.", es:"¡Gracias! Estoy contenta de estar aquí.", de:"Danke! Ich bin froh, hier zu sein.", pt:"Obrigada! Estou contente por estar aqui.", nl:"Dank je! Ik ben blij hier te zijn.", pl:"Dziękuję! Jestem zadowolona, że jestem tutaj.", ru:"Спасибо! Я счастлива быть здесь.", uk:"Дякую! Я щаслива бути тут.", cs:"Děkuji! Jsem ráda, že jsem tady.", zh:"谢谢！我很高兴来到这里。", ja:"ありがとう！ここにいることを嬉しく思います。", ko:"감사합니다! 여기 있는 것을 기쁘게 생각합니다.", ar:"شكراً! أنا سعيدة أن أكون هنا."}}],
  quiz:[
  {q:"Bee commence un nouveau…", opts:["Voyage","Travail","Repas"], ok:1},
  {q:"Au début, Bee est…", opts:["Inquiète","Fâchée","Fatiguée"], ok:0},
  {q:"On lui montre son…", opts:["Vélo","Ordinateur","Chapeau"], ok:1}]},
 {id:"musique", ic:"🎵", titre:"Bee chante", lignes:[
  {qui:"🐝", fr:"J'aime la musique.", t:{en:"I like music.", it:"Mi piace la musica.", es:"Me gusta la música.", de:"Ich mag Musik.", pt:"Gosto de música.", nl:"Ik hou van muziek.", pl:"Lubię muzykę.", ru:"Мне нравится музыка.", uk:"Мені подобається музика.", cs:"Mám rád hudbu.", zh:"我喜欢音乐。", ja:"私は音楽が好きです。", ko:"나는 음악을 좋아합니다.", ar:"أنا أحب الموسيقى."}},
  {qui:"🐝", fr:"Le soir, je chante et je danse.", t:{en:"In the evening, I sing and I dance.", it:"La sera canto e ballo.", es:"Por la noche canto y bailo.", de:"Am Abend singe ich und tanze.", pt:"À noite canto e danço.", nl:"'s Avonds zing en dans ik.", pl:"Wieczorem śpiewam i tańczę.", ru:"Вечером я пою и танцую.", uk:"Ввечері я співаю і танцюю.", cs:"Večer zpívám a tančím.", zh:"晚上我唱歌和跳舞。", ja:"夜になると私は歌ったり踊ったりします。", ko:"저녁이 되면 나는 노래하고 춤을 춥니다.", ar:"في المساء أنا أغني وأرقص."}},
  {qui:"🧑", fr:"Tu chantes très bien !", t:{en:"You sing very well!", it:"Canti molto bene!", es:"¡Cantas muy bien!", de:"Du singst sehr gut!", pt:"Cantas muito bem!", nl:"Je zingt heel goed!", pl:"Śpiewasz bardzo dobrze!", ru:"Ты поёшь очень хорошо!", uk:"Ти співаєш дуже добре!", cs:"Zpíváš velmi dobře!", zh:"你唱得很好!", ja:"あなたの歌はとても上手です!", ko:"당신은 노래를 rất 잘합니다!", ar:"أنت تغني جيداً!"}},
  {qui:"🐝", fr:"Merci ! On danse ensemble ?", t:{en:"Thank you! Shall we dance together?", it:"Grazie! Balliamo insieme?", es:"¡Gracias! ¿Bailamos juntos?", de:"Danke! Tanzen wir zusammen?", pt:"Obrigada! Dançamos juntos?", nl:"Dank je! Zullen we samen dansen?", pl:"Dziękuję! Tańczymy razem?", ru:"Спасибо! Будем танцевать вместе?", uk:"Дякую! Танцюватимемо разом?", cs:"Děkuji! Zatančíme spolu?", zh:"谢谢！我们一起跳舞吧？", ja:"ありがとう！一緒にダンスをしましょうか？", ko:"고마워! 함께 춤을 춥니까?", ar:"شكراً! هل نرقص معاً؟"}},
  {qui:"🧑", fr:"Oui, j'adore danser !", t:{en:"Yes, I love to dance!", it:"Sì, adoro ballare!", es:"¡Sí, me encanta bailar!", de:"Ja, ich tanze sehr gern!", pt:"Sim, adoro dançar!", nl:"Ja, ik dans dolgraag!", pl:"Tak, uwielbiam tańczyć!", ru:"Да, я люблю танцевать!", uk:"Так, я люблю танцювати!", cs:"Ano, mám rád tančit!", zh:"是的，我爱跳舞！", ja:"はい、私はダンスが好きです！", ko:"네, 나는 춤을 추는 것을 좋아합니다!", ar:"نعم، أنا أحب الرقص!"}}],
  quiz:[
  {q:"Bee aime la…", opts:["Musique","Soupe","Pluie"], ok:0},
  {q:"Le soir, Bee chante et…", opts:["Dort","Danse","Mange"], ok:1},
  {q:"L'ami veut…", opts:["Danser","Partir","Lire"], ok:0}]},
 {id:"telephone", ic:"📱", titre:"Le téléphone", lignes:[
  {qui:"🐝", fr:"Où est mon téléphone ?", t:{en:"Where is my phone?", it:"Dov'è il mio telefono?", es:"¿Dónde está mi teléfono?", de:"Wo ist mein Telefon?", pt:"Onde está o meu telefone?", nl:"Waar is mijn telefoon?", pl:"Gdzie jest mój telefon?", ru:"Где мой телефон?", uk:"Де мій телефон?", cs:"Kde je můj telefon?", zh:"我的手机在哪里？", ja:"私の電話はどこにありますか？", ko:"제 전화기는 어디에 있어요?", ar:"أين هاتفى؟"}},
  {qui:"🧑", fr:"Il est sur la table, près de l'ordinateur.", t:{en:"It is on the table, near the computer.", it:"È sul tavolo, vicino al computer.", es:"Está en la mesa, cerca del ordenador.", de:"Es liegt auf dem Tisch, neben dem Computer.", pt:"Está na mesa, perto do computador.", nl:"Het ligt op de tafel, bij de computer.", pl:"On jest na stole, obok komputera.", ru:"Он на столе, рядом с компьютером.", uk:"Він на столі, поруч з комп'ютером.", cs:"Je na stole, vedle počítače.", zh:"它在桌子上，电脑旁边。", ja:"それは机の上に、コンピューターに近いところにあります。", ko:"그것은 탁자 위에, 컴퓨터 옆에 있습니다.", ar:"إنه على الطاولة، بالقرب من الكمبيوتر."}},
  {qui:"🐝", fr:"Merci ! J'ai un message.", t:{en:"Thank you! I have a message.", it:"Grazie! Ho un messaggio.", es:"¡Gracias! Tengo un mensaje.", de:"Danke! Ich habe eine Nachricht.", pt:"Obrigada! Tenho uma mensagem.", nl:"Dank je! Ik heb een bericht.", pl:"Dziękuję! Mam wiadomość.", ru:"Спасибо! У меня есть сообщение.", uk:"Дякую! У мене є повідомлення.", cs:"Děkuji! Mám zprávu.", zh:"谢谢！我有消息。", ja:"ありがとう！私はメッセージを持っています。", ko:"고마워! 나는 메시지를 가지고 있어.", ar:"شكراً! لدي رسالة."}},
  {qui:"🐝", fr:"C'est une photo de la plage !", t:{en:"It is a photo of the beach!", it:"È una foto della spiaggia!", es:"¡Es una foto de la playa!", de:"Es ist ein Foto vom Strand!", pt:"É uma foto da praia!", nl:"Het is een foto van het strand!", pl:"To jest zdjęcie plaży!", ru:"Это фото пляжа!", uk:"Це фото пляжу!", cs:"To je fotografie pláže!", zh:"这是海滩的照片！", ja:"それはビーチの写真です！", ko:"그것은 해변의 사진입니다!", ar:"هذه صورة للشاطئ!"}},
  {qui:"🧑", fr:"Elle est magnifique !", t:{en:"It is beautiful!", it:"È bellissima!", es:"¡Es preciosa!", de:"Es ist wunderschön!", pt:"É linda!", nl:"Hij is prachtig!", pl:"Ona jest piękna!", ru:"Она прекрасна!", uk:"Вона прекрасна!", cs:"Je krásná!", zh:"它很漂亮！", ja:"それは美しいです！", ko:"그것은 아름답습니다!", ar:"إنها جميلة!"}}],
  quiz:[
  {q:"Bee cherche son…", opts:["Livre","Téléphone","Chapeau"], ok:1},
  {q:"Le téléphone est près de l'…", opts:["Ordinateur","Arbre","Assiette"], ok:0},
  {q:"La photo montre la…", opts:["Montagne","Plage","Ville"], ok:1}]},
 {id:"surprise", ic:"😊", titre:"Une belle surprise", lignes:[
  {qui:"🧑", fr:"Bee, ferme les yeux !", t:{en:"Bee, close your eyes!", it:"Bee, chiudi gli occhi!", es:"¡Bee, cierra los ojos!", de:"Bee, mach die Augen zu!", pt:"Bee, fecha os olhos!", nl:"Bee, doe je ogen dicht!", pl:"Pszczoła, zamknij oczy!", ru:"Пчела, закрой глаза!", uk:"Бджоло, закрий очі!", cs:"Včelo, zavři oči!", zh:"蜂，闭上眼睛！", ja:"蜂さん、目を閉じて！", ko:"벌, 눈을 감아!", ar:"نحلة، أغمضي عينيك!"}},
  {qui:"🐝", fr:"D'accord. Qu'est-ce que c'est ?", t:{en:"Okay. What is it?", it:"Va bene. Cos'è?", es:"Vale. ¿Qué es?", de:"Okay. Was ist das?", pt:"Está bem. O que é?", nl:"Oké. Wat is het?", pl:"Dobrze. Co to jest?", ru:"Хорошо. Что это?", uk:"Гарно. Що це?", cs:"Dobře. Co to je?", zh:"好。是什么？", ja:"いいよ。何ですか？", ko:"좋아. 뭐야?", ar:"حسناً. ما هذا؟"}},
  {qui:"🧑", fr:"Ouvre les yeux : c'est un gâteau !", t:{en:"Open your eyes: it is a cake!", it:"Apri gli occhi: è una torta!", es:"Abre los ojos: ¡es un pastel!", de:"Mach die Augen auf: es ist ein Kuchen!", pt:"Abre os olhos: é um bolo!", nl:"Doe je ogen open: het is een taart!", pl:"Otwórz oczy: to jest tort!", ru:"Открой глаза: это торт!", uk:"Відкрий очі: це торт!", cs:"Otevři oči: je to dort!", zh:"睁开眼睛：这是蛋糕！", ja:"目を開けて：ケーキだ！", ko:"눈을 떠. 케이크야!", ar:"افتح عينيك: هذه كعكة!"}},
  {qui:"🐝", fr:"Oh ! Je suis surprise et très contente !", t:{en:"Oh! I am surprised and very happy!", it:"Oh! Sono sorpresa e molto contenta!", es:"¡Oh! ¡Estoy sorprendida y muy contenta!", de:"Oh! Ich bin überrascht und sehr glücklich!", pt:"Oh! Estou surpresa e muito contente!", nl:"Oh! Ik ben verrast en heel blij!", pl:"O! Jestem zaskoczona i bardzo szczęśliwa!", ru:"О! Я удивлена и очень счастлива!", uk:"О! Я здивована і дуже щаслива!", cs:"Ó! Jsem překvapená a velmi šťastná!", zh:"哦！我很惊讶，也很高兴！", ja:"お！驚いて、そしてとても幸せだ！", ko:"오! 놀랐어, 그리고 너무 행복해!", ar:"يا! أنا مندهشة وسعيدة جداً!"}},
  {qui:"🐝", fr:"Merci, tu es un vrai ami !", t:{en:"Thank you, you are a true friend!", it:"Grazie, sei un vero amico!", es:"¡Gracias, eres un amigo de verdad!", de:"Danke, du bist ein echter Freund!", pt:"Obrigada, és um verdadeiro amigo!", nl:"Dank je, je bent een echte vriend!", pl:"Dziękuję, jesteś prawdziwym przyjacielem!", ru:"Спасибо, ты настоящий друг!", uk:"Дякую, ти справжній друг!", cs:"Děkuji, jsi pravý přítel!", zh:"谢谢，你是真正的朋友！", ja:"ありがとう、本当の友達だ！", ko:"고마워, 진정한 친구야!", ar:"شكراً، أنت صديق حقيقي!"}}],
  quiz:[
  {q:"L'ami demande de fermer les…", opts:["Yeux","Mains","Portes"], ok:0},
  {q:"La surprise est un…", opts:["Livre","Gâteau","Chien"], ok:1},
  {q:"Bee est surprise et…", opts:["Fâchée","Contente","Fatiguée"], ok:1}]},
 {id:"weekend", ic:"🌤️", titre:"Le week-end de Bee", lignes:[
  {qui:"🧑", fr:"Qu'est-ce que tu fais ce week-end ?", t:{en:"What are you doing this weekend?", it:"Cosa fai questo fine settimana?", es:"¿Qué haces este fin de semana?", de:"Was machst du dieses Wochenende?", pt:"O que fazes este fim de semana?", nl:"Wat doe je dit weekend?", pl:"Co robisz w ten weekend?", ru:"Что ты делаешь на выходных?", uk:"Що ти робиш на вихідних?", cs:"Co děláš o víkendu?", zh:"这个周末你有什么计划？", ja:"この週末は何をするの？", ko:"주말에 뭐 할 건데?", ar:"ماذا ستفعل في عطلة نهاية الأسبوع؟"}},
  {qui:"🐝", fr:"Samedi, je vais nager à la mer.", t:{en:"On Saturday, I go swimming at the sea.", it:"Sabato vado a nuotare al mare.", es:"El sábado voy a nadar al mar.", de:"Am Samstag gehe ich im Meer schwimmen.", pt:"No sábado vou nadar ao mar.", nl:"Zaterdag ga ik zwemmen in de zee.", pl:"W sobotę pływam w morzu.", ru:"В субботу я пойду плавать в море.", uk:"У суботу я пливатиму в морі.", cs:"V sobotu jdu plavat do moře.", zh:"星期六，我去海里游泳。", ja:"土曜日に海で泳ぐよ。", ko:"토요일에 바다에서 수영을 갈 거야.", ar:"في السبت سأذهب للسباحة في البحر."}},
  {qui:"🐝", fr:"Dimanche, je lis un livre au parc.", t:{en:"On Sunday, I read a book in the park.", it:"Domenica leggo un libro al parco.", es:"El domingo leo un libro en el parque.", de:"Am Sonntag lese ich ein Buch im Park.", pt:"No domingo leio um livro no parque.", nl:"Zondag lees ik een boek in het park.", pl:"W niedzielę czytam książkę w parku.", ru:"В воскресенье я читаю книгу в парке.", uk:"У неділю я читатиму книгу в парку.", cs:"V neděli čtu knihu v parku.", zh:"星期日，我在公园里读书。", ja:"日曜日に公園で本を読むよ。", ko:"일요일에 공원에서 책을 읽을 거야.", ar:"في الأحد سأقرأ كتاباً في الحديقة."}},
  {qui:"🧑", fr:"Ça a l'air génial !", t:{en:"That sounds great!", it:"Sembra fantastico!", es:"¡Suena genial!", de:"Das klingt toll!", pt:"Parece ótimo!", nl:"Dat klinkt geweldig!", pl:"Wygląda super!", ru:"Звучит здорово!", uk:"Звучить добре!", cs:"Znít to skvěle!", zh:"听起来真棒！", ja:"素晴らしいね！", ko:"대단하다!", ar:"يبدو رائعاً!"}},
  {qui:"🐝", fr:"Oui ! J'aime beaucoup le week-end.", t:{en:"Yes! I really like the weekend.", it:"Sì! Mi piace molto il fine settimana.", es:"¡Sí! Me gusta mucho el fin de semana.", de:"Ja! Ich mag das Wochenende sehr.", pt:"Sim! Gosto muito do fim de semana.", nl:"Ja! Ik hou erg van het weekend.", pl:"Tak! Bardzo lubię weekend.", ru:"Да! Мне очень нравится выходной.", uk:"Так! Мені дуже подобається вихідний.", cs:"Ano! Mám rád víkend.", zh:"是的！我非常喜欢周末。", ja:"はい！私は週末が大好きだよ。", ko:"네, 주말을 정말 좋아해.", ar:"نعم! أنا أحب عطلة نهاية الأسبوع جداً."}}],
  quiz:[
  {q:"Samedi, Bee va…", opts:["Nager","Dormir","Travailler"], ok:0},
  {q:"Dimanche, elle lit au…", opts:["Café","Parc","Marché"], ok:1},
  {q:"Bee aime le…", opts:["Lundi","Week-end","Matin"], ok:1}]},
 {id:"idee", ic:"💡", titre:"Une bonne idée", lignes:[
  {qui:"🐝", fr:"J'ai un petit problème.", t:{en:"I have a small problem.", it:"Ho un piccolo problema.", es:"Tengo un pequeño problema.", de:"Ich habe ein kleines Problem.", pt:"Tenho um pequeno problema.", nl:"Ik heb een klein probleem.", pl:"Mam mały problem.", ru:"У меня небольшая проблема.", uk:"У мене маленька проблема.", cs:"Mám malý problém.", zh:"我有一个小问题。", ja:"私は小さな問題があります。", ko:"저는 작은 문제가 있어요.", ar:"لدي مشكلة صغيرة."}},
  {qui:"🧑", fr:"Explique-moi, je vais t'aider.", t:{en:"Explain to me, I will help you.", it:"Spiegami, ti aiuto.", es:"Explícame, te ayudo.", de:"Erklär mir, ich helfe dir.", pt:"Explica-me, vou ajudar-te.", nl:"Leg het me uit, ik help je.", pl:"Wyjaśnij mi, pomogę ci.", ru:"Объясни мне, я помогу тебе.", uk:"Поясни мені, я допоможу тобі.", cs:"Vysvětli mi, pomůžu ti.", zh:"跟我说说，我来帮你。", ja:"説明して、手伝うよ。", ko:"설명해줘, 내가 도와줄게.", ar:"اشرح لي، سأساعدك."}},
  {qui:"🐝", fr:"Ma fleur a soif et je n'ai pas d'eau.", t:{en:"My flower is thirsty and I have no water.", it:"Il mio fiore ha sete e non ho acqua.", es:"Mi flor tiene sed y no tengo agua.", de:"Meine Blume hat Durst und ich habe kein Wasser.", pt:"A minha flor tem sede e não tenho água.", nl:"Mijn bloem heeft dorst en ik heb geen water.", pl:"Moja kwiatka jest spragniona i nie mam wody.", ru:"Мой цветок хочет пить и у меня нет воды.", uk:"Мій квітка хоче пити, і в мене немає води.", cs:"Můj květina má žízeň a já nemám vodu.", zh:"我的花渴了，我没有水。", ja:"私の花が渇いていて、水がありません。", ko:"제 꽃이 목이 말라서 물이 없어요.", ar:"زهرتي عطشانة وليس عندي ماء."}},
  {qui:"🧑", fr:"J'ai une idée : va à la rivière !", t:{en:"I have an idea: go to the river!", it:"Ho un'idea: vai al fiume!", es:"Tengo una idea: ¡ve al río!", de:"Ich habe eine Idee: geh zum Fluss!", pt:"Tenho uma ideia: vai ao rio!", nl:"Ik heb een idee: ga naar de rivier!", pl:"Mam pomysł: idź do rzeki!", ru:"У меня есть идея: сходи к реке!", uk:"У мене є ідея: піди до річки!", cs:"Mám nápad: jdi k řece!", zh:"我有个主意：去河边！", ja:"いい考えがある！川に行こう！", ko:"생각이 났어! 강가로 가자!", ar:"لدي فكرة: اذهب إلى النهر!"}},
  {qui:"🐝", fr:"C'est une très bonne idée. Merci !", t:{en:"That is a very good idea. Thank you!", it:"È un'ottima idea. Grazie!", es:"Es una muy buena idea. ¡Gracias!", de:"Das ist eine sehr gute Idee. Danke!", pt:"É uma ótima ideia. Obrigada!", nl:"Dat is een heel goed idee. Dank je!", pl:"To bardzo dobry pomysł. Dziękuję!", ru:"Это очень хорошая идея. Спасибо!", uk:"Це дуже гарна ідея. Дякую!", cs:"To je velmi dobrý nápad. Děkuji!", zh:"这是个好主意。谢谢！", ja:"とても良い考えです。ありがとう！", ko:"정말 좋은 생각이에요. 감사합니다!", ar:"هذه فكرة جيدة جداً. شكراً!"}}],
  quiz:[
  {q:"Bee a un petit…", opts:["Problème","Gâteau","Chien"], ok:0},
  {q:"La fleur a…", opts:["Faim","Soif","Peur"], ok:1},
  {q:"L'ami trouve une bonne…", opts:["Idée","Erreur","Chanson"], ok:0}]}
 /*__STORIES_AUTO__ : les nouvelles histoires générées automatiquement s'insèrent ICI (ne pas retirer ce repère) */
];


/* ============ 🏃 LES VERBES — liste VÉRIFIÉE (Kevin 2026-08-11 : « exercices sur les verbes »)
   VÉRITÉ, RIEN DE FAUX : liste EXPLICITE d'infinitifs français, PAS une heuristique. Une règle
   du type « finit par -er/-ir/-re » attrape « beurre », « lettre », « acier », « anniversaire »…
   et enseignerait des noms comme des verbes. Chaque entrée ci-dessous est (1) un vrai infinitif,
   (2) réellement présent dans le programme, (3) traduite dans les 14 langues (vérifié : 312 × 14
   = 4368 traductions, 0 trou). Le garde CI verifie-verbes.mjs le revérifie à chaque changement. */
var VERBES_FR = [
  "aborder","aboutir","accélérer","accomplir","accueillir","acheter",
  "admettre","aider","aimer","aller","allumer","annoncer",
  "annuler","appartenir","appeler","applaudir","apprendre","appuyer",
  "arrêter","arroser","assaisonner","atteindre","attendre","attraper",
  "augmenter","autoriser","avaler","avertir","avoir","avouer",
  "balayer","bavarder","boire","bouillir","brancher","casser",
  "céder","changer","chanter","chercher","choisir","chuchoter",
  "cliquer","coller","commander","commencer","comparer","comprendre",
  "conduire","congeler","consoler","constater","construire","contredire",
  "convaincre","copier","couper","courir","coûter","creuser",
  "crier","croire","cuisiner","cultiver","danser","déborder",
  "débrancher","décider","décrire","défendre","déjeuner","demander",
  "déménager","démissionner","démontrer","dépendre","dépenser","descendre",
  "désobéir","dessiner","détruire","deviner","devoir","dîner",
  "dire","dissoudre","donner","dormir","doubler","douter",
  "échanger","échouer","économiser","écouter","écrire","emballer",
  "embaucher","embrasser","emménager","emprunter","encourager","engloutir",
  "enregistrer","entendre","entreprendre","entrer","envisager","envoyer",
  "éplucher","espérer","essayer","essuyer","éteindre","éternuer",
  "être","étudier","éviter","exagérer","exiger","exister",
  "expliquer","exposer","faire","féliciter","fermer","finir",
  "fondre","frapper","frire","frotter","gagner","gaspiller",
  "glisser","goûter","grandir","griller","grimper","grossir",
  "guérir","habiter","hésiter","imaginer","imprimer","insister",
  "interdire","interrompre","investir","inviter","jaillir","jeter",
  "jouer","jurer","klaxonner","lâcher","lancer","licencier",
  "lire","maigrir","manger","marcher","mariner","mélanger",
  "menacer","mentir","mériter","mesurer","mijoter","monter",
  "montrer","mourir","nager","naître","négliger","négocier",
  "nettoyer","nuancer","obéir","offrir","oser","oublier",
  "ouvrir","pardonner","parier","parler","partager","partir",
  "payer","pêcher","peindre","penser","percer","perdre",
  "persuader","peser","pétrir","planter","pleurer","plier",
  "plonger","polluer","porter","pousser","pouvoir","préférer",
  "prendre","préparer","prétendre","prêter","prévenir","prévoir",
  "promettre","prononcer","protéger","prouver","publier","punir",
  "raconter","ralentir","ramasser","ramer","ranger","rassurer",
  "recevoir","réchauffer","réclamer","récompenser","reconnaître","recycler",
  "réfléchir","refroidir","réfuter","regarder","regretter","rembourser",
  "remercier","renoncer","réparer","repasser","répéter","répondre",
  "réserver","respirer","rester","réussir","revenir","rire",
  "s'effondrer","s'évaporer","s'habiller","saigner","saluer","sauter",
  "savoir","se blesser","se brûler","se coucher","se dépêcher","se disputer",
  "se garer","se laver","se lever","se plaindre","se raser","se réconcilier",
  "se répandre","se reposer","se réveiller","se souvenir","se tromper","se venger",
  "secouer","sembler","semer","serrer","signer","signifier",
  "soigner","sortir","souhaiter","soulever","souligner","soupçonner",
  "sourire","suffire","supplier","supposer","supprimer","surgir",
  "surmonter","télécharger","tenir","tirer","tomber","toucher",
  "tousser","traduire","trahir","travailler","trier","trouver",
  "vendre","venir","verrouiller","verser","vider","visiter",
  "visser","voir","voler","voter","vouloir","voyager",
  "diminuer","paraître",
  "s'étirer","bâiller","cligner","hoqueter","renifler","transpirer","trébucher","s'accroupir","se pencher","soupirer","murmurer","bredouiller","bégayer","siffloter","fredonner","grignoter","déguster"
];
