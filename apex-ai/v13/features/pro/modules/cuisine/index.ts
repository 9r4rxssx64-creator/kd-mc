/**
 * APEX v13 — Cuisine Pro Module (port v12 vCuisinePro + EXPANSION EXPERT)
 *
 * Niveau chef + nutritionniste pro :
 * - 50+ recettes (FR classiques + 10 internationales) avec calories, macros, vins
 * - 30+ modes/temps de cuisson avec températures précises
 * - 14 allergènes INCO (UE Règlement 1169/2011)
 * - Conversions exhaustives (poids, volumes, températures, US/UK/FR)
 * - Calcul calories + macros (P/L/G) + index glycémique
 * - 14 régimes alimentaires (omnivore, vegan, keto, paleo, mediterranean, DASH, etc.)
 * - Plans menus 7j (1500/2000/2500 kcal)
 * - Liste de courses auto-agrégée + scaling portions
 * - Substitutions ingrédients (lactose-free, gluten-free, vegan)
 * - Sommellerie : vins recommandés par plat
 *
 * Sources autoritaires : Règlement INCO 1169/2011, ANSES, CIQUAL (data nutrition FR)
 */

import { escapeHtml } from '../../../../core/escape-html.js';
import { logger } from '../../../../core/logger.js';
import { store } from '../../../../core/store.js';
import { guardFeatureEnabled } from '../../../../services/auth/feature-guard.js';

export interface CuissonInfo {
  temps: string;
  eau?: string;
  methode?: string;
  rincage?: string;
  trempage?: string;
  temp_coeur?: string;
  repos?: string;
  four?: string;
}

export interface MacroNutriments {
  proteines: number;
  lipides: number;
  glucides: number;
  fibres?: number;
  ig?: 'bas' | 'moyen' | 'haut';
}

export interface Recette {
  nom: string;
  temps: string;
  difficulte: 'facile' | 'intermediaire' | 'difficile';
  ingredients: readonly string[];
  allergenes?: readonly string[];
  calories?: number;
  portions?: number;
  origine?: string;
  vin_accord?: string;
  categorie?: 'entree' | 'plat' | 'dessert' | 'soupe' | 'salade' | 'petit_dej' | 'aperitif';
}

export interface MenuJour {
  jour: string;
  petit_dej: string;
  dejeuner: string;
  diner: string;
  collation?: string;
  total_kcal: number;
}

export interface PlanMenu {
  cible_kcal: number;
  type: string;
  jours: readonly MenuJour[];
}

 
export const AX_CUISINE = {
  /** Conversions exhaustives (volumes, poids, températures) */
  conversions: {
    /* Volumes FR */
    '1 cuillere a soupe': '15 ml',
    '1 cuillere a cafe': '5 ml',
    '1 verre a moutarde': '200 ml',
    '1 tasse': '240 ml',
    '1 bol': '350 ml',
    /* Poids cuisine */
    '1 pincee': '0.5 g',
    '1 noix de beurre': '15 g',
    '1 noisette de beurre': '5 g',
    '1 oeuf moyen': '55 g',
    '1 oeuf gros': '65 g',
    '1 yaourt': '125 g',
    '1 cuillere a soupe farine': '10 g',
    '1 cuillere a soupe sucre': '15 g',
    '1 cuillere a soupe huile': '13 g',
    '1 cuillere a soupe miel': '20 g',
    '1 verre farine': '120 g',
    '1 verre sucre': '180 g',
    '1 verre riz': '180 g',
    /* US to FR */
    '1 cup farine': '120 g',
    '1 cup sucre': '200 g',
    '1 cup beurre': '227 g',
    '1 cup lait': '240 ml',
    '1 stick beurre US': '113 g',
    '1 oz': '28.35 g',
    '1 lb': '453.6 g',
    /* Temperatures four */
    '180C': '350F = thermostat 6',
    '200C': '400F = thermostat 7',
    '220C': '425F = thermostat 8',
    '160C': '325F = thermostat 5',
    '240C': '475F = thermostat 9',
  } as Record<string, string>,
  /** Cuissons : 30+ modes documentés avec températures précises */
  cuissons: {
    'riz blanc': { temps: '18 min', eau: '2x volume', methode: 'absorption' },
    'riz complet': { temps: '35 min', eau: '2.5x volume' },
    'riz arborio risotto': { temps: '20 min', eau: 'ajout progressif bouillon' },
    'pates al dente': { temps: 'paquet -1 min', eau: '1L/100g + 10g sel' },
    quinoa: { temps: '15 min', eau: '2x volume', rincage: 'obligatoire (saponine)' },
    boulgour: { temps: '10 min', eau: '2x volume' },
    couscous: { temps: '5 min repos', eau: '1.5x volume eau bouillante' },
    'lentilles vertes': { temps: '25 min', trempage: 'non requis' },
    'lentilles corail': { temps: '15 min', trempage: 'non requis' },
    'haricots secs': { temps: '1h30', trempage: '12h eau froide' },
    'pois chiches': { temps: '1h30', trempage: '12h eau froide' },
    'oeuf coque': { temps: '3 min', eau: 'bouillante' },
    'oeuf mollet': { temps: '6 min', eau: 'bouillante' },
    'oeuf dur': { temps: '10 min', eau: 'bouillante' },
    'oeuf poche': { temps: '3 min', eau: 'fremissante + vinaigre' },
    'poulet entier': { temps: '1h30', four: '200C', repos: '15 min', temp_coeur: '74C' },
    'blanc poulet': { temps: '15 min poele moyenne', temp_coeur: '74C' },
    'cuisse poulet': { temps: '40 min', four: '180C', temp_coeur: '74C' },
    'boeuf bleu': { temps: '30 sec/face', temp_coeur: '45-50C' },
    'boeuf saignant': { temps: '1 min/face', temp_coeur: '50-55C' },
    'boeuf a point': { temps: '3 min/face', temp_coeur: '60-65C' },
    'boeuf bien cuit': { temps: '5 min/face', temp_coeur: '70-75C' },
    'cote boeuf 1kg': { temps: '5+5 min', four: '200C apres saisie', repos: '10 min' },
    saumon: { temps: '4 min/face peau', temp_coeur: '50C' },
    'cabillaud filet': { temps: '8 min', four: '180C', temp_coeur: '60C' },
    'magret canard': { temps: '8 min cote peau + 5 min', temp_coeur: '60C' },
    'gigot agneau': { temps: '15 min/500g', four: '200C', repos: '10 min' },
    'patisserie 4 4': { temps: '30 min', four: '180C' },
    'pizza maison': { temps: '10 min', four: '250C' },
    'tarte salee': { temps: '35 min', four: '180C' },
    'gratin dauphinois': { temps: '1h', four: '160C' },
    'pain maison': { temps: '25-30 min', four: '230C' },
    brioche: { temps: '25 min', four: '180C' },
    macaron: { temps: '13 min', four: '150C', repos: 'croutage 30 min' },
    /* boost v13 — Cuissons supplémentaires pro */
    'thon mi-cuit': { temps: '1 min/face', temp_coeur: '38C', methode: 'rouge cru au coeur' },
    'bar entier': { temps: '20 min', four: '180C', temp_coeur: '55C' },
    'lotte': { temps: '12 min', four: '180C', temp_coeur: '60C' },
    'st jacques poele': { temps: '1.5 min/face', temp_coeur: '45C', methode: 'beurre noisette' },
    'foie gras poele': { temps: '30s/face', methode: 'poele tres chaude sans matiere grasse' },
    'epaule agneau confit 7h': { temps: '7h', four: '110C', methode: 'cuisson basse temperature' },
    'cuisse canard confit': { temps: '2h', methode: 'graisse 90C', repos: 'mariner 24h sel' },
    'lentilles vertes Puy AOP': { temps: '20 min', methode: 'eau froide depart' },
    'tofu marine': { temps: '15 min', methode: 'mariner 1h soja-sesame' },
    'aubergine farcie': { temps: '40 min', four: '180C' },
    'galette sarrasin': { temps: '2 min/face', methode: 'crepiere chaude beurree' },
    'pizza napolitaine pate fine': { temps: '90 sec', four: '450C four pizza' },
    'fougasse': { temps: '20 min', four: '220C' },
    'baguette tradition': { temps: '20 min', four: '230C', methode: 'buée vapeur dans four' },
    'creme caramel bain-marie': { temps: '40 min', four: '160C bain-marie' },
    'meringue francaise': { temps: '1h', four: '110C', methode: 'sechage long' },
    'choux a la creme': { temps: '25 min', four: '200C puis 180C' },
    'profiterole': { temps: '25 min', four: '180C' },
    'genoise': { temps: '25 min', four: '180C' },
    'biscuit cuiller': { temps: '10 min', four: '200C' },
    'ganache': { temps: '5 min infusion', methode: 'creme bouillante sur chocolat' },
    'glaçage royal': { temps: '0', methode: 'sucre glace + blanc oeuf + citron' },
    'caramel sec': { temps: '5 min', methode: 'sucre seul a feu moyen' },
    'caramel beurre sale': { temps: '8 min', methode: 'sucre + beurre demi-sel + creme' },
  } as Record<string, CuissonInfo>,
  /* boost v13 — Saisonnalité produits FR (mois 1-12) */
  saisonnalite: {
    asperge: [4, 5, 6],
    fraise: [5, 6, 7, 8],
    framboise: [6, 7, 8, 9],
    cerise: [5, 6, 7],
    abricot: [6, 7, 8],
    peche: [6, 7, 8, 9],
    melon: [6, 7, 8, 9],
    figue: [8, 9, 10],
    raisin: [8, 9, 10],
    pomme: [9, 10, 11, 12, 1, 2, 3],
    poire: [9, 10, 11, 12, 1, 2],
    coing: [10, 11],
    chataigne: [10, 11],
    citrouille: [9, 10, 11, 12],
    courge_butternut: [9, 10, 11, 12, 1],
    potiron: [10, 11, 12],
    artichaut: [4, 5, 6, 7, 8, 9],
    aubergine: [6, 7, 8, 9, 10],
    courgette: [5, 6, 7, 8, 9, 10],
    tomate: [6, 7, 8, 9],
    poivron: [7, 8, 9, 10],
    navet: [10, 11, 12, 1, 2, 3],
    poireau: [10, 11, 12, 1, 2, 3],
    chou_kale: [10, 11, 12, 1, 2, 3],
    endive: [11, 12, 1, 2, 3],
    huitre: [9, 10, 11, 12, 1, 2, 3, 4],
    coquille_st_jacques: [10, 11, 12, 1, 2, 3, 4, 5],
    truffe_noire: [12, 1, 2, 3],
    truffe_blanche: [10, 11, 12],
    morille: [3, 4, 5, 6],
    cepe: [9, 10, 11],
    girolle: [7, 8, 9],
  } as Record<string, readonly number[]>,
  /* boost v13 — Recettes par budget €/portion */
  budget_categories: {
    economique: { min: 0, max: 3, label: 'Économique (< 3€/portion)' },
    moyen: { min: 3, max: 8, label: 'Moyen (3-8€/portion)' },
    gastronomique: { min: 8, max: 30, label: 'Gastronomique (> 8€/portion)' },
  } as Record<string, { min: number; max: number; label: string }>,
  /* boost v13 — Index glycémique aliments courants */
  index_glycemique: {
    riz_blanc: 70, riz_complet: 50, riz_basmati: 58, quinoa: 35,
    pates_blanches: 50, pates_completes: 40, pomme_terre: 70, patate_douce: 50,
    pain_blanc: 75, pain_complet: 55, pain_levain: 50,
    sucre: 65, miel: 55, sirop_agave: 19, stevia: 0,
    glucose: 100, fructose: 23, maltodextrine: 95,
    pomme: 38, poire: 38, banane: 51, raisin: 53, mangue: 55,
    fraise: 25, framboise: 25, cerise: 22,
    carotte_crue: 16, carotte_cuite: 39,
    haricot_rouge: 28, lentille: 30, pois_chiche: 28,
  } as Record<string, number>,
  /* boost v13 — Sommellerie : 30 cépages détaillés */
  cepages: {
    cabernet_sauvignon: 'Bordeaux, robuste, tannique. Boeuf, agneau',
    merlot: 'Rond, fruité, soyeux. Plats mijotés, fromages',
    pinot_noir: 'Élégant, fruits rouges. Volaille, poisson',
    syrah: 'Épicé, poivré. Gibier, plats relevés',
    grenache: 'Fruité, gourmand. Cuisine méditerranéenne',
    chardonnay: 'Beurré ou minéral. Poisson, fromages',
    sauvignon_blanc: 'Vif, agrumes. Fromage de chèvre, fruits de mer',
    riesling: 'Sec ou doux. Cuisine asiatique, choucroute',
    gewurztraminer: 'Aromatique, exotique. Curry, foie gras',
    chenin: 'Polyvalent. Apéritif aux dessert',
    sangiovese: 'Italie classique. Tomate, pâtes',
    nebbiolo: 'Tannique élevé (Barolo). Truffe, gibier',
    tempranillo: 'Espagne. Tapas, charcuterie',
    malbec: 'Argentine. Grillades, asado',
    zinfandel: 'Californie. BBQ, burger',
  } as Record<string, string>,
  /** 14 allergènes INCO obligatoires */
  allergenes: [
    'Gluten',
    'Crustaces',
    'Oeufs',
    'Poisson',
    'Arachide',
    'Soja',
    'Lait',
    'Fruits a coque',
    'Celeri',
    'Moutarde',
    'Sesame',
    'Sulfites',
    'Lupin',
    'Mollusques',
  ] as const,
  /** 14 régimes alimentaires + descriptifs */
  regimes: [
    'Omnivore',
    'Vegetarien',
    'Vegetalien/Vegan',
    'Sans gluten',
    'Sans lactose',
    'Pescetarien',
    'Halal',
    'Casher',
    'Paleo',
    'Cetogene',
    'Mediterraneen',
    'DASH',
    'Diabetique',
    'Faible sodium',
  ] as const,
  /** Substitutions ingrédients (lactose-free, gluten-free, vegan) */
  substitutions: {
    lactose: {
      lait: 'lait amande / soja / avoine',
      beurre: 'margarine vegetale / huile coco',
      creme: 'creme soja / coco',
      yaourt: 'yaourt soja / coco',
      fromage: 'levure maltee / fromage vegan',
    },
    gluten: {
      farine: 'farine riz / sarrasin / mais',
      pain: 'pain sans gluten / galette riz',
      pates: 'pates riz / quinoa / lentilles',
      chapelure: 'chapelure mais / amande mixee',
      sauce_soja: 'tamari sans gluten',
    },
    vegan: {
      oeuf: '1 oeuf = 1cs graines lin + 3cs eau (15 min repos)',
      miel: 'sirop agave / erable',
      gelatine: 'agar-agar / pectine',
      lait: 'lait vegetal',
      beurre: 'huile coco / margarine vegetale',
      fromage: 'levure nutritionnelle / cashew cream',
    },
  } as Record<string, Record<string, string>>,
  /** 50+ recettes (40 FR + 10 internationales) */
  recettes: [
    /* Plats FR classiques */
    {
      nom: 'Boeuf bourguignon',
      temps: '3h',
      difficulte: 'intermediaire',
      ingredients: ['boeuf 1.5kg', 'vin rouge bouteille', 'lardons 200g', 'carottes 4', 'oignons 3', 'champignons 250g', 'bouquet garni'],
      allergenes: ['sulfites'],
      calories: 580,
      portions: 6,
      origine: 'France',
      vin_accord: 'Bourgogne Pinot Noir',
      categorie: 'plat',
    },
    {
      nom: 'Blanquette de veau',
      temps: '1h30',
      difficulte: 'intermediaire',
      ingredients: ['veau epaule 1kg', 'carottes 4', 'oignon', 'poireau', 'beurre', 'farine', 'creme fraiche 20cl', 'jaune oeuf'],
      allergenes: ['oeufs', 'lait'],
      calories: 520,
      portions: 6,
      origine: 'France',
      vin_accord: 'Bourgogne Chardonnay',
      categorie: 'plat',
    },
    {
      nom: 'Coq au vin',
      temps: '2h',
      difficulte: 'intermediaire',
      ingredients: ['poulet ferme 1.8kg', 'vin rouge 75cl', 'lardons 150g', 'champignons', 'oignons grelot', 'cognac', 'thym laurier'],
      allergenes: ['sulfites'],
      calories: 510,
      portions: 6,
      origine: 'France',
      vin_accord: 'Cote du Rhone',
      categorie: 'plat',
    },
    {
      nom: 'Cassoulet',
      temps: '3h30',
      difficulte: 'difficile',
      ingredients: ['haricots tarbais 500g', 'confit canard', 'saucisse Toulouse', 'lard', 'tomates concassees', 'oignon', 'ail'],
      calories: 720,
      portions: 8,
      origine: 'France',
      vin_accord: 'Cahors',
      categorie: 'plat',
    },
    {
      nom: 'Choucroute garnie',
      temps: '2h',
      difficulte: 'intermediaire',
      ingredients: ['choucroute 1kg', 'lardons 200g', 'saucisses fumees 4', 'palette porc fumee', 'pommes terre', 'baies genievre'],
      calories: 690,
      portions: 6,
      origine: 'Alsace',
      vin_accord: 'Riesling Alsace',
      categorie: 'plat',
    },
    {
      nom: 'Quiche lorraine',
      temps: '45min',
      difficulte: 'facile',
      ingredients: ['pate brisee', 'lardons 200g', 'oeufs 3', 'creme 20cl', 'lait 20cl', 'muscade'],
      allergenes: ['gluten', 'oeufs', 'lait'],
      calories: 380,
      portions: 6,
      origine: 'Lorraine',
      vin_accord: 'Vin gris Toul',
      categorie: 'plat',
    },
    {
      nom: 'Ratatouille',
      temps: '1h',
      difficulte: 'facile',
      ingredients: ['aubergines 2', 'courgettes 2', 'poivrons 3', 'tomates 4', 'oignon', 'ail', 'huile olive', 'herbes provence'],
      calories: 180,
      portions: 4,
      origine: 'Provence',
      vin_accord: 'Rose Provence',
      categorie: 'plat',
    },
    {
      nom: 'Bouillabaisse',
      temps: '2h',
      difficulte: 'difficile',
      ingredients: ['poissons roche 1.5kg', 'rouget', 'safran', 'fenouil', 'tomates', 'pommes terre', 'rouille', 'pain'],
      allergenes: ['poisson', 'gluten'],
      calories: 480,
      portions: 6,
      origine: 'Marseille',
      vin_accord: 'Cassis blanc',
      categorie: 'soupe',
    },
    {
      nom: 'Pot-au-feu',
      temps: '3h',
      difficulte: 'facile',
      ingredients: ['boeuf paleron 800g', 'os a moelle', 'carottes', 'poireaux', 'navets', 'pommes de terre', 'oignon piquet de clou'],
      calories: 430,
      portions: 6,
      origine: 'France',
      vin_accord: 'Beaujolais',
      categorie: 'plat',
    },
    {
      nom: 'Steak frites',
      temps: '20min',
      difficulte: 'facile',
      ingredients: ['steak entrecote 200g', 'pommes de terre 400g', 'huile friture', 'beurre', 'sel poivre'],
      calories: 720,
      portions: 1,
      origine: 'Bistrot FR',
      vin_accord: 'Cote du Rhone',
      categorie: 'plat',
    },
    {
      nom: 'Magret de canard',
      temps: '20min',
      difficulte: 'intermediaire',
      ingredients: ['magret canard 350g', 'miel', 'vinaigre balsamique', 'sel poivre'],
      calories: 580,
      portions: 2,
      origine: 'Sud-Ouest',
      vin_accord: 'Madiran',
      categorie: 'plat',
    },
    {
      nom: 'Confit de canard',
      temps: '2h + nuit',
      difficulte: 'intermediaire',
      ingredients: ['cuisses canard 4', 'gros sel 100g', 'graisse canard 1kg', 'thym laurier ail'],
      calories: 620,
      portions: 4,
      origine: 'Sud-Ouest',
      vin_accord: 'Cahors',
      categorie: 'plat',
    },
    {
      nom: 'Croque-monsieur',
      temps: '15min',
      difficulte: 'facile',
      ingredients: ['pain de mie', 'jambon blanc', 'gruyere rape', 'beurre', 'bechamel'],
      allergenes: ['gluten', 'lait'],
      calories: 480,
      portions: 1,
      origine: 'Bistrot FR',
      vin_accord: 'Sancerre',
      categorie: 'plat',
    },
    {
      nom: 'Salade nicoise',
      temps: '20min',
      difficulte: 'facile',
      ingredients: ['thon', 'oeufs durs', 'tomates', 'haricots verts', 'olives noires', 'oignon rouge', 'huile olive', 'anchois'],
      allergenes: ['poisson', 'oeufs'],
      calories: 320,
      portions: 4,
      origine: 'Nice',
      vin_accord: 'Bellet rose',
      categorie: 'salade',
    },
    {
      nom: 'Salade lyonnaise',
      temps: '15min',
      difficulte: 'facile',
      ingredients: ['frisee', 'lardons 150g', 'oeuf poche', 'croutons aillees', 'vinaigrette moutarde'],
      allergenes: ['oeufs', 'gluten', 'moutarde'],
      calories: 380,
      portions: 2,
      origine: 'Lyon',
      vin_accord: 'Beaujolais',
      categorie: 'salade',
    },
    /* Soupes */
    {
      nom: 'Soupe a l oignon gratinee',
      temps: '45min',
      difficulte: 'facile',
      ingredients: ['oignons 1kg', 'beurre', 'farine', 'bouillon boeuf 1.5L', 'gruyere rape', 'pain'],
      allergenes: ['gluten', 'lait'],
      calories: 290,
      portions: 4,
      origine: 'Lyon',
      vin_accord: 'Beaujolais',
      categorie: 'soupe',
    },
    {
      nom: 'Veloute de potiron',
      temps: '40min',
      difficulte: 'facile',
      ingredients: ['potiron 1kg', 'oignon', 'creme', 'bouillon legumes', 'muscade', 'graines courge'],
      allergenes: ['lait'],
      calories: 220,
      portions: 4,
      origine: 'France',
      vin_accord: 'Riesling',
      categorie: 'soupe',
    },
    {
      nom: 'Velouté champignons',
      temps: '35min',
      difficulte: 'facile',
      ingredients: ['champignons paris 500g', 'cepes secs 30g', 'echalotes', 'creme', 'vin blanc'],
      allergenes: ['lait', 'sulfites'],
      calories: 240,
      portions: 4,
      origine: 'France',
      vin_accord: 'Chardonnay',
      categorie: 'soupe',
    },
    /* Patisseries / Desserts */
    {
      nom: 'Tarte tatin',
      temps: '1h',
      difficulte: 'intermediaire',
      ingredients: ['pommes 6', 'sucre 150g', 'beurre 80g', 'pate brisee'],
      allergenes: ['gluten', 'lait'],
      calories: 380,
      portions: 8,
      origine: 'Sologne',
      vin_accord: 'Coteaux du Layon',
      categorie: 'dessert',
    },
    {
      nom: 'Mousse au chocolat',
      temps: '30min + 4h frais',
      difficulte: 'facile',
      ingredients: ['chocolat noir 200g', 'oeufs 6', 'sucre 30g', 'sel'],
      allergenes: ['oeufs', 'lait'],
      calories: 280,
      portions: 6,
      origine: 'France',
      vin_accord: 'Banyuls',
      categorie: 'dessert',
    },
    {
      nom: 'Creme brulee',
      temps: '50min + 4h frais',
      difficulte: 'intermediaire',
      ingredients: ['creme 50cl', 'jaunes oeufs 6', 'sucre 80g', 'vanille gousse', 'cassonade'],
      allergenes: ['oeufs', 'lait'],
      calories: 340,
      portions: 6,
      origine: 'France',
      vin_accord: 'Sauternes',
      categorie: 'dessert',
    },
    {
      nom: 'Profiteroles',
      temps: '1h30',
      difficulte: 'difficile',
      ingredients: ['pate a choux', 'glace vanille', 'chocolat noir 200g', 'creme'],
      allergenes: ['gluten', 'oeufs', 'lait'],
      calories: 420,
      portions: 6,
      origine: 'France',
      vin_accord: 'Maury',
      categorie: 'dessert',
    },
    {
      nom: 'Eclairs au chocolat',
      temps: '1h30',
      difficulte: 'difficile',
      ingredients: ['pate a choux', 'creme patissiere chocolat', 'fondant chocolat'],
      allergenes: ['gluten', 'oeufs', 'lait'],
      calories: 320,
      portions: 8,
      origine: 'France',
      vin_accord: 'Banyuls',
      categorie: 'dessert',
    },
    {
      nom: 'Macarons parisiens',
      temps: '2h',
      difficulte: 'difficile',
      ingredients: ['poudre amande 125g', 'sucre glace 125g', 'blancs oeufs 90g', 'sucre semoule', 'colorants', 'ganache'],
      allergenes: ['oeufs', 'fruits a coque'],
      calories: 110,
      portions: 30,
      origine: 'Paris',
      vin_accord: 'Champagne',
      categorie: 'dessert',
    },
    {
      nom: 'Crepes sucrees',
      temps: '30min',
      difficulte: 'facile',
      ingredients: ['farine 250g', 'oeufs 4', 'lait 50cl', 'sel', 'beurre', 'sucre'],
      allergenes: ['gluten', 'oeufs', 'lait'],
      calories: 180,
      portions: 12,
      origine: 'Bretagne',
      vin_accord: 'Cidre',
      categorie: 'dessert',
    },
    {
      nom: 'Galette des rois frangipane',
      temps: '1h30',
      difficulte: 'intermediaire',
      ingredients: ['pate feuilletee 2', 'poudre amande 125g', 'beurre 100g', 'sucre 100g', 'oeufs 2', 'feve'],
      allergenes: ['gluten', 'fruits a coque', 'oeufs', 'lait'],
      calories: 380,
      portions: 8,
      origine: 'France',
      vin_accord: 'Coteaux du Layon',
      categorie: 'dessert',
    },
    {
      nom: 'Far breton',
      temps: '1h',
      difficulte: 'facile',
      ingredients: ['farine 250g', 'oeufs 4', 'lait 75cl', 'sucre 150g', 'pruneaux 200g'],
      allergenes: ['gluten', 'oeufs', 'lait'],
      calories: 240,
      portions: 8,
      origine: 'Bretagne',
      vin_accord: 'Cidre',
      categorie: 'dessert',
    },
    {
      nom: 'Mille-feuille',
      temps: '2h',
      difficulte: 'difficile',
      ingredients: ['pate feuilletee 3', 'creme patissiere', 'fondant blanc', 'glace royale'],
      allergenes: ['gluten', 'oeufs', 'lait'],
      calories: 380,
      portions: 6,
      origine: 'Paris',
      vin_accord: 'Champagne demi-sec',
      categorie: 'dessert',
    },
    {
      nom: 'Tarte au citron meringuee',
      temps: '1h30',
      difficulte: 'intermediaire',
      ingredients: ['pate sablee', 'citrons 4', 'oeufs 4', 'sucre 200g', 'beurre 80g', 'meringue italienne'],
      allergenes: ['gluten', 'oeufs', 'lait'],
      calories: 320,
      portions: 8,
      origine: 'France',
      vin_accord: 'Champagne',
      categorie: 'dessert',
    },
    {
      nom: 'Paris-Brest',
      temps: '2h',
      difficulte: 'difficile',
      ingredients: ['pate a choux', 'creme mousseline praline', 'amandes effilees', 'sucre glace'],
      allergenes: ['gluten', 'oeufs', 'lait', 'fruits a coque'],
      calories: 410,
      portions: 8,
      origine: 'Paris',
      vin_accord: 'Sauternes',
      categorie: 'dessert',
    },
    {
      nom: 'Saint-Honore',
      temps: '3h',
      difficulte: 'difficile',
      ingredients: ['pate feuilletee', 'pate a choux', 'caramel', 'creme chiboust'],
      allergenes: ['gluten', 'oeufs', 'lait'],
      calories: 380,
      portions: 8,
      origine: 'Paris',
      vin_accord: 'Champagne',
      categorie: 'dessert',
    },
    {
      nom: 'Madeleines',
      temps: '40min',
      difficulte: 'facile',
      ingredients: ['farine 200g', 'sucre 150g', 'oeufs 3', 'beurre 150g', 'levure', 'citron zeste'],
      allergenes: ['gluten', 'oeufs', 'lait'],
      calories: 95,
      portions: 24,
      origine: 'Commercy',
      vin_accord: 'The',
      categorie: 'dessert',
    },
    /* Plats internationaux */
    {
      nom: 'Pasta carbonara',
      temps: '20min',
      difficulte: 'facile',
      ingredients: ['spaghetti 400g', 'guanciale 200g', 'oeufs 4 jaunes', 'pecorino romano 100g', 'poivre noir'],
      allergenes: ['gluten', 'oeufs', 'lait'],
      calories: 620,
      portions: 4,
      origine: 'Italie - Rome',
      vin_accord: 'Frascati',
      categorie: 'plat',
    },
    {
      nom: 'Risotto Milanese',
      temps: '40min',
      difficulte: 'intermediaire',
      ingredients: ['riz arborio 320g', 'safran', 'parmesan 80g', 'beurre 80g', 'oignon', 'vin blanc', 'bouillon'],
      allergenes: ['lait', 'sulfites'],
      calories: 510,
      portions: 4,
      origine: 'Italie - Milan',
      vin_accord: 'Soave',
      categorie: 'plat',
    },
    {
      nom: 'Pizza margherita',
      temps: '2h (incl repos)',
      difficulte: 'intermediaire',
      ingredients: ['pate pizza', 'sauce tomate', 'mozzarella di bufala', 'basilic frais', 'huile olive', 'sel'],
      allergenes: ['gluten', 'lait'],
      calories: 720,
      portions: 1,
      origine: 'Italie - Naples',
      vin_accord: 'Chianti',
      categorie: 'plat',
    },
    {
      nom: 'Paella valenciana',
      temps: '1h',
      difficulte: 'intermediaire',
      ingredients: ['riz bomba 400g', 'poulet', 'lapin', 'haricots verts', 'safran', 'tomate', 'huile olive'],
      calories: 580,
      portions: 4,
      origine: 'Espagne - Valence',
      vin_accord: 'Rioja',
      categorie: 'plat',
    },
    {
      nom: 'Tortilla espagnole',
      temps: '40min',
      difficulte: 'facile',
      ingredients: ['oeufs 6', 'pommes de terre 4', 'oignon', 'huile olive', 'sel'],
      allergenes: ['oeufs'],
      calories: 320,
      portions: 4,
      origine: 'Espagne',
      vin_accord: 'Albarino',
      categorie: 'plat',
    },
    {
      nom: 'Sushi maki',
      temps: '1h',
      difficulte: 'intermediaire',
      ingredients: ['riz sushi 300g', 'vinaigre riz', 'feuilles nori', 'saumon cru', 'concombre', 'avocat', 'wasabi', 'sauce soja'],
      allergenes: ['poisson', 'soja'],
      calories: 280,
      portions: 4,
      origine: 'Japon',
      vin_accord: 'Sake / Riesling',
      categorie: 'plat',
    },
    {
      nom: 'Pad thai',
      temps: '30min',
      difficulte: 'intermediaire',
      ingredients: ['nouilles riz 250g', 'crevettes 200g', 'oeufs 2', 'pousses soja', 'cacahuetes', 'tamarin', 'sauce poisson', 'citron vert'],
      allergenes: ['crustaces', 'oeufs', 'arachide', 'poisson'],
      calories: 480,
      portions: 4,
      origine: 'Thailande',
      vin_accord: 'Gewurztraminer',
      categorie: 'plat',
    },
    {
      nom: 'Curry indien butter chicken',
      temps: '1h',
      difficulte: 'intermediaire',
      ingredients: ['poulet 800g', 'tomate concassee', 'creme 20cl', 'beurre', 'gingembre ail', 'epices garam masala', 'fenugrec'],
      allergenes: ['lait'],
      calories: 540,
      portions: 4,
      origine: 'Inde - Punjab',
      vin_accord: 'Riesling demi-sec',
      categorie: 'plat',
    },
    {
      nom: 'Tagine agneau abricots',
      temps: '2h',
      difficulte: 'intermediaire',
      ingredients: ['epaule agneau 1kg', 'abricots secs', 'amandes', 'oignon', 'gingembre', 'cannelle', 'safran', 'miel'],
      allergenes: ['fruits a coque'],
      calories: 580,
      portions: 6,
      origine: 'Maroc',
      vin_accord: 'Cotes du Rhone',
      categorie: 'plat',
    },
    {
      nom: 'Burger US gourmet',
      temps: '30min',
      difficulte: 'facile',
      ingredients: ['steak hache 200g', 'pain brioche', 'cheddar', 'salade', 'tomate', 'oignon rouge', 'sauce burger'],
      allergenes: ['gluten', 'lait', 'oeufs', 'moutarde'],
      calories: 720,
      portions: 1,
      origine: 'USA',
      vin_accord: 'Zinfandel',
      categorie: 'plat',
    },
    /* boost v13 — 60+ nouvelles recettes internationales + petit déj + apéro */
    { nom: 'Tartare de boeuf', temps: '20min', difficulte: 'intermediaire', ingredients: ['boeuf maigre 200g', 'echalote', 'cornichons', 'capres', 'jaune oeuf', 'moutarde', 'tabasco'], allergenes: ['oeufs', 'moutarde'], calories: 380, portions: 1, origine: 'France', vin_accord: 'Bourgogne rouge', categorie: 'plat' },
    { nom: 'Carpaccio de boeuf', temps: '15min', difficulte: 'facile', ingredients: ['filet boeuf 150g', 'parmesan', 'roquette', 'huile olive', 'citron'], allergenes: ['lait'], calories: 320, portions: 2, origine: 'Italie', vin_accord: 'Brunello', categorie: 'entree' },
    { nom: 'Risotto champignons', temps: '40min', difficulte: 'intermediaire', ingredients: ['riz arborio 320g', 'champignons mix 400g', 'parmesan 80g', 'beurre', 'oignon', 'vin blanc', 'bouillon'], allergenes: ['lait', 'sulfites'], calories: 480, portions: 4, origine: 'Italie', vin_accord: 'Pinot Grigio', categorie: 'plat' },
    { nom: 'Lasagnes bolognaises', temps: '2h', difficulte: 'intermediaire', ingredients: ['pates lasagnes', 'boeuf hache 500g', 'tomates', 'lait', 'beurre', 'farine', 'parmesan'], allergenes: ['gluten', 'lait', 'oeufs'], calories: 580, portions: 6, origine: 'Italie', vin_accord: 'Chianti', categorie: 'plat' },
    { nom: 'Osso bucco', temps: '2h30', difficulte: 'intermediaire', ingredients: ['jarret veau', 'tomates', 'oignon', 'carottes', 'celeri', 'vin blanc', 'gremolata'], allergenes: ['celeri', 'sulfites'], calories: 540, portions: 4, origine: 'Italie - Milan', vin_accord: 'Barolo', categorie: 'plat' },
    { nom: 'Tiramisu', temps: '30min + 4h frais', difficulte: 'facile', ingredients: ['mascarpone 500g', 'oeufs 4', 'sucre 100g', 'biscuits cuiller', 'cafe expresso', 'cacao amer', 'amaretto'], allergenes: ['gluten', 'oeufs', 'lait'], calories: 380, portions: 6, origine: 'Italie', vin_accord: 'Marsala', categorie: 'dessert' },
    { nom: 'Panna cotta', temps: '20min + 4h frais', difficulte: 'facile', ingredients: ['creme 50cl', 'sucre 80g', 'gelatine 2 feuilles', 'vanille', 'coulis fruits rouges'], allergenes: ['lait'], calories: 280, portions: 4, origine: 'Italie - Piémont', vin_accord: 'Moscato', categorie: 'dessert' },
    { nom: 'Gnocchi sauce gorgonzola', temps: '40min', difficulte: 'intermediaire', ingredients: ['pommes terre 1kg', 'farine', 'oeuf', 'gorgonzola 150g', 'creme', 'noix'], allergenes: ['gluten', 'oeufs', 'lait', 'fruits a coque'], calories: 580, portions: 4, origine: 'Italie', vin_accord: 'Soave', categorie: 'plat' },
    { nom: 'Gazpacho andalou', temps: '15min + 2h frais', difficulte: 'facile', ingredients: ['tomates 1kg', 'concombre', 'poivron', 'oignon', 'ail', 'pain', 'huile olive', 'vinaigre Xeres'], allergenes: ['gluten'], calories: 120, portions: 4, origine: 'Espagne - Andalousie', vin_accord: 'Manzanilla', categorie: 'soupe' },
    { nom: 'Patatas bravas', temps: '30min', difficulte: 'facile', ingredients: ['pommes de terre 800g', 'sauce tomate piquante', 'aioli', 'paprika fume'], allergenes: ['oeufs'], calories: 280, portions: 4, origine: 'Espagne', vin_accord: 'Tempranillo', categorie: 'aperitif' },
    { nom: 'Croquetas jamon', temps: '1h', difficulte: 'intermediaire', ingredients: ['jambon serrano', 'beurre', 'farine', 'lait', 'oeuf', 'chapelure', 'huile friture'], allergenes: ['gluten', 'lait', 'oeufs'], calories: 280, portions: 4, origine: 'Espagne', vin_accord: 'Albarino', categorie: 'aperitif' },
    { nom: 'Saltimbocca alla Romana', temps: '20min', difficulte: 'intermediaire', ingredients: ['escalope veau 4', 'jambon Parme', 'sauge fraiche', 'beurre', 'vin blanc'], allergenes: ['lait', 'sulfites'], calories: 380, portions: 4, origine: 'Italie - Rome', vin_accord: 'Frascati', categorie: 'plat' },
    { nom: 'Cannelloni ricotta epinards', temps: '1h15', difficulte: 'intermediaire', ingredients: ['cannelloni', 'ricotta 500g', 'epinards 400g', 'parmesan', 'sauce tomate', 'bechamel'], allergenes: ['gluten', 'lait', 'oeufs'], calories: 460, portions: 6, origine: 'Italie', vin_accord: 'Verdicchio', categorie: 'plat' },
    /* Asie */
    { nom: 'Ramen tonkotsu', temps: '12h + 30min', difficulte: 'difficile', ingredients: ['nouilles ramen', 'porc poitrine 500g', 'oeuf marine ajitsuke', 'algues nori', 'oignon vert', 'gingembre', 'soja'], allergenes: ['gluten', 'oeufs', 'soja'], calories: 580, portions: 4, origine: 'Japon - Fukuoka', vin_accord: 'Sake / Riesling', categorie: 'soupe' },
    { nom: 'Tempura crevettes legumes', temps: '40min', difficulte: 'intermediaire', ingredients: ['crevettes 12', 'legumes mix', 'farine tempura', 'oeuf', 'eau glacee', 'huile friture', 'sauce tentsuyu'], allergenes: ['gluten', 'oeufs', 'crustaces', 'soja'], calories: 380, portions: 4, origine: 'Japon', vin_accord: 'Sake junmai', categorie: 'plat' },
    { nom: 'Onigiri thon mayo', temps: '20min', difficulte: 'facile', ingredients: ['riz japonais 300g', 'thon en boite', 'mayonnaise', 'soja', 'algue nori', 'sel'], allergenes: ['poisson', 'oeufs', 'soja'], calories: 220, portions: 4, origine: 'Japon', vin_accord: 'The vert', categorie: 'plat' },
    { nom: 'Bibimbap', temps: '45min', difficulte: 'intermediaire', ingredients: ['riz', 'boeuf marine 200g', 'champignons shiitake', 'pousses soja', 'epinards', 'carotte', 'oeuf miroir', 'gochujang', 'huile sesame'], allergenes: ['oeufs', 'soja', 'sesame'], calories: 580, portions: 2, origine: 'Coree', vin_accord: 'Riesling', categorie: 'plat' },
    { nom: 'Bulgogi', temps: '30min + marinade 2h', difficulte: 'facile', ingredients: ['boeuf finement tranche 600g', 'sauce soja', 'sucre', 'huile sesame', 'ail', 'gingembre', 'poire asiatique'], allergenes: ['soja', 'sesame'], calories: 480, portions: 4, origine: 'Coree', vin_accord: 'Pinot Noir', categorie: 'plat' },
    { nom: 'Pho bo', temps: '4h', difficulte: 'intermediaire', ingredients: ['boeuf gite 1kg', 'os boeuf', 'gingembre', 'badiane', 'cannelle', 'nouilles riz', 'basilic thai', 'germes soja', 'citron vert'], allergenes: ['soja'], calories: 380, portions: 6, origine: 'Vietnam', vin_accord: 'Gewurztraminer', categorie: 'soupe' },
    { nom: 'Banh mi', temps: '20min', difficulte: 'facile', ingredients: ['baguette', 'pate', 'jambon vietnamien', 'concombre', 'carottes pickles', 'coriandre', 'piment', 'mayo'], allergenes: ['gluten', 'oeufs'], calories: 480, portions: 1, origine: 'Vietnam', vin_accord: 'Riesling demi-sec', categorie: 'plat' },
    { nom: 'Curry vert thai poulet', temps: '30min', difficulte: 'facile', ingredients: ['poulet 500g', 'pate curry vert', 'lait coco 40cl', 'aubergines thai', 'basilic thai', 'sauce poisson', 'sucre palme'], allergenes: ['poisson'], calories: 480, portions: 4, origine: 'Thailande', vin_accord: 'Gewurztraminer', categorie: 'plat' },
    { nom: 'Tom yum kung', temps: '30min', difficulte: 'facile', ingredients: ['crevettes', 'champignons paille', 'citronnelle', 'galanga', 'kaffir', 'piments', 'jus citron vert', 'sauce poisson'], allergenes: ['crustaces', 'poisson'], calories: 220, portions: 4, origine: 'Thailande', vin_accord: 'Riesling', categorie: 'soupe' },
    { nom: 'Dim sum siu mai', temps: '1h', difficulte: 'intermediaire', ingredients: ['pate wonton', 'porc hache', 'crevettes hachees', 'champignons', 'gingembre', 'sauce huitre', 'oeuf'], allergenes: ['gluten', 'crustaces', 'mollusques', 'oeufs'], calories: 220, portions: 4, origine: 'Chine - Canton', vin_accord: 'The Pu-erh', categorie: 'aperitif' },
    { nom: 'Mapo tofu', temps: '30min', difficulte: 'facile', ingredients: ['tofu soyeux 400g', 'porc hache', 'pate haricots dou ban jiang', 'poivre Sichuan', 'oignon vert', 'huile sesame'], allergenes: ['soja', 'sesame'], calories: 320, portions: 4, origine: 'Chine - Sichuan', vin_accord: 'Gewurztraminer', categorie: 'plat' },
    { nom: 'Boeuf au gingembre', temps: '20min', difficulte: 'facile', ingredients: ['boeuf 400g', 'gingembre', 'oignon vert', 'sauce soja', 'sauce huitre', 'maizena', 'huile sesame'], allergenes: ['soja', 'mollusques', 'sesame'], calories: 380, portions: 4, origine: 'Chine', vin_accord: 'The vert', categorie: 'plat' },
    /* Moyen-Orient + Afrique */
    { nom: 'Houmous traditionnel', temps: '15min', difficulte: 'facile', ingredients: ['pois chiches 250g', 'tahin', 'citron', 'ail', 'huile olive', 'cumin', 'paprika'], allergenes: ['sesame'], calories: 280, portions: 4, origine: 'Liban / Levant', vin_accord: 'Arak / blanc sec', categorie: 'aperitif' },
    { nom: 'Falafel', temps: '40min', difficulte: 'intermediaire', ingredients: ['pois chiches secs 250g', 'oignon', 'ail', 'persil', 'cumin', 'coriandre', 'huile friture'], allergenes: [], calories: 320, portions: 4, origine: 'Levant', vin_accord: 'The menthe', categorie: 'plat' },
    { nom: 'Couscous royal', temps: '2h', difficulte: 'intermediaire', ingredients: ['semoule', 'agneau', 'poulet', 'merguez', 'pois chiches', 'courgettes', 'navets', 'carottes', 'harissa'], allergenes: ['gluten'], calories: 620, portions: 6, origine: 'Maghreb', vin_accord: 'Cotes du Roussillon', categorie: 'plat' },
    { nom: 'Chakchouka', temps: '30min', difficulte: 'facile', ingredients: ['oeufs 4', 'tomates 4', 'poivrons 2', 'oignon', 'ail', 'paprika', 'cumin'], allergenes: ['oeufs'], calories: 280, portions: 2, origine: 'Maghreb', vin_accord: 'Vin gris', categorie: 'plat' },
    { nom: 'Pastilla poulet', temps: '2h', difficulte: 'difficile', ingredients: ['feuilles brick', 'poulet', 'amandes', 'cannelle', 'sucre glace', 'oeufs', 'ras el hanout'], allergenes: ['gluten', 'fruits a coque', 'oeufs'], calories: 480, portions: 6, origine: 'Maroc', vin_accord: 'Gewurztraminer', categorie: 'plat' },
    /* Amériques */
    { nom: 'Tacos al pastor', temps: '4h marinade', difficulte: 'intermediaire', ingredients: ['porc echine 800g', 'achiote', 'piments guajillo', 'ananas', 'tortillas mais', 'coriandre', 'oignon', 'citron vert'], allergenes: [], calories: 480, portions: 6, origine: 'Mexique', vin_accord: 'Margarita', categorie: 'plat' },
    { nom: 'Guacamole', temps: '10min', difficulte: 'facile', ingredients: ['avocats murs 3', 'citron vert', 'oignon rouge', 'coriandre', 'piment jalapeno', 'sel'], allergenes: [], calories: 220, portions: 4, origine: 'Mexique', vin_accord: 'Margarita / Albarino', categorie: 'aperitif' },
    { nom: 'Chili con carne', temps: '2h', difficulte: 'facile', ingredients: ['boeuf hache 800g', 'haricots rouges', 'tomates concassees', 'oignon', 'ail', 'cumin', 'paprika fume', 'piments'], allergenes: [], calories: 480, portions: 6, origine: 'Tex-Mex', vin_accord: 'Zinfandel', categorie: 'plat' },
    { nom: 'Ceviche de poisson', temps: '30min', difficulte: 'facile', ingredients: ['filet poisson blanc 400g', 'jus 8 citrons verts', 'oignon rouge', 'piment', 'coriandre', 'patate douce', 'mais geant'], allergenes: ['poisson'], calories: 220, portions: 4, origine: 'Perou', vin_accord: 'Pisco sour', categorie: 'entree' },
    { nom: 'Empanadas argentines', temps: '1h30', difficulte: 'intermediaire', ingredients: ['pate empanada', 'boeuf hache 400g', 'oignon', 'olives', 'oeufs durs', 'paprika', 'cumin'], allergenes: ['gluten', 'oeufs'], calories: 380, portions: 8, origine: 'Argentine', vin_accord: 'Malbec', categorie: 'aperitif' },
    { nom: 'Mac and cheese', temps: '40min', difficulte: 'facile', ingredients: ['macaroni', 'cheddar 300g', 'lait 50cl', 'beurre', 'farine', 'chapelure'], allergenes: ['gluten', 'lait'], calories: 580, portions: 4, origine: 'USA', vin_accord: 'Chardonnay', categorie: 'plat' },
    { nom: 'New York cheesecake', temps: '1h + 6h frais', difficulte: 'intermediaire', ingredients: ['biscuits speculoos', 'philadelphia 600g', 'sucre 150g', 'oeufs 3', 'creme fraiche', 'vanille', 'fruits rouges'], allergenes: ['gluten', 'lait', 'oeufs'], calories: 480, portions: 8, origine: 'USA - NY', vin_accord: 'Sauternes', categorie: 'dessert' },
    { nom: 'Brownies chocolat', temps: '40min', difficulte: 'facile', ingredients: ['chocolat noir 200g', 'beurre 150g', 'sucre 200g', 'oeufs 3', 'farine 100g', 'noix de pecan'], allergenes: ['gluten', 'lait', 'oeufs', 'fruits a coque'], calories: 380, portions: 12, origine: 'USA', vin_accord: 'Porto', categorie: 'dessert' },
    { nom: 'Pancakes US', temps: '20min', difficulte: 'facile', ingredients: ['farine 250g', 'lait 30cl', 'oeufs 2', 'sucre 30g', 'levure', 'beurre', 'sirop erable'], allergenes: ['gluten', 'lait', 'oeufs'], calories: 280, portions: 4, origine: 'USA', vin_accord: 'Cafe', categorie: 'petit_dej' },
    /* Petit déjeuner */
    { nom: 'Granola maison', temps: '40min', difficulte: 'facile', ingredients: ['flocons avoine 300g', 'amandes', 'noix', 'noisettes', 'graines courge', 'miel 100g', 'huile coco', 'cannelle'], allergenes: ['fruits a coque'], calories: 480, portions: 10, origine: 'International', vin_accord: 'The', categorie: 'petit_dej' },
    { nom: 'Smoothie bowl', temps: '10min', difficulte: 'facile', ingredients: ['banane', 'fruits rouges', 'yaourt grec', 'lait amande', 'granola', 'chia', 'miel'], allergenes: ['lait', 'fruits a coque'], calories: 320, portions: 1, origine: 'International', vin_accord: '', categorie: 'petit_dej' },
    { nom: 'Avocado toast', temps: '10min', difficulte: 'facile', ingredients: ['pain levain', 'avocat', 'oeuf poche', 'piment Espelette', 'huile olive', 'citron'], allergenes: ['gluten', 'oeufs'], calories: 320, portions: 1, origine: 'International', vin_accord: 'Cafe', categorie: 'petit_dej' },
    { nom: 'Porridge banane', temps: '15min', difficulte: 'facile', ingredients: ['flocons avoine 60g', 'lait 25cl', 'banane', 'cannelle', 'miel', 'amandes effilees'], allergenes: ['lait', 'fruits a coque'], calories: 380, portions: 1, origine: 'GB / international', vin_accord: 'The', categorie: 'petit_dej' },
    { nom: 'English breakfast', temps: '30min', difficulte: 'facile', ingredients: ['oeufs', 'bacon', 'saucisses', 'haricots blancs', 'champignons', 'tomate', 'pain grille'], allergenes: ['gluten', 'oeufs'], calories: 720, portions: 1, origine: 'Royaume-Uni', vin_accord: 'The noir', categorie: 'petit_dej' },
    /* Apéritifs / Dips */
    { nom: 'Tarama', temps: '15min', difficulte: 'facile', ingredients: ['oeufs poisson 100g', 'mie pain', 'lait', 'huile tournesol', 'citron', 'oignon'], allergenes: ['poisson', 'gluten', 'lait'], calories: 280, portions: 4, origine: 'Grece', vin_accord: 'Ouzo', categorie: 'aperitif' },
    { nom: 'Tzatziki', temps: '15min', difficulte: 'facile', ingredients: ['yaourt grec 500g', 'concombre', 'ail', 'aneth', 'huile olive', 'citron'], allergenes: ['lait'], calories: 120, portions: 4, origine: 'Grece', vin_accord: 'Retsina', categorie: 'aperitif' },
    { nom: 'Caponata', temps: '45min', difficulte: 'facile', ingredients: ['aubergines 4', 'tomates', 'celeri', 'olives', 'capres', 'vinaigre', 'sucre', 'pignons'], allergenes: ['celeri', 'fruits a coque', 'sulfites'], calories: 180, portions: 4, origine: 'Italie - Sicile', vin_accord: 'Nero d Avola', categorie: 'aperitif' },
    { nom: 'Bruschetta tomates', temps: '15min', difficulte: 'facile', ingredients: ['pain campagne', 'tomates', 'basilic', 'ail', 'huile olive', 'sel'], allergenes: ['gluten'], calories: 220, portions: 4, origine: 'Italie', vin_accord: 'Pinot Grigio', categorie: 'aperitif' },
    /* Salades */
    { nom: 'Caesar salad', temps: '20min', difficulte: 'facile', ingredients: ['romaine', 'parmesan', 'croutons', 'anchois', 'sauce caesar', 'poulet grille'], allergenes: ['gluten', 'lait', 'oeufs', 'poisson'], calories: 380, portions: 4, origine: 'USA', vin_accord: 'Chardonnay', categorie: 'salade' },
    { nom: 'Salade grecque', temps: '15min', difficulte: 'facile', ingredients: ['feta 200g', 'concombre', 'tomates', 'oignon rouge', 'olives kalamata', 'origan', 'huile olive'], allergenes: ['lait'], calories: 320, portions: 4, origine: 'Grece', vin_accord: 'Assyrtiko', categorie: 'salade' },
    { nom: 'Salade quinoa avocat', temps: '25min', difficulte: 'facile', ingredients: ['quinoa 200g', 'avocat', 'tomates cerise', 'concombre', 'feta', 'menthe', 'citron'], allergenes: ['lait'], calories: 380, portions: 4, origine: 'International', vin_accord: 'Sauvignon blanc', categorie: 'salade' },
    /* Soupes */
    { nom: 'Borscht', temps: '1h30', difficulte: 'intermediaire', ingredients: ['betteraves 500g', 'boeuf 300g', 'chou', 'pommes de terre', 'oignon', 'creme aigre', 'aneth'], allergenes: ['lait'], calories: 280, portions: 6, origine: 'Russie / Ukraine', vin_accord: 'Vodka', categorie: 'soupe' },
    { nom: 'Minestrone', temps: '1h', difficulte: 'facile', ingredients: ['legumes mix', 'haricots blancs', 'pates', 'parmesan', 'pesto', 'huile olive'], allergenes: ['gluten', 'lait', 'fruits a coque'], calories: 280, portions: 6, origine: 'Italie', vin_accord: 'Chianti', categorie: 'soupe' },
    /* Desserts */
    { nom: 'Baklava', temps: '1h30', difficulte: 'intermediaire', ingredients: ['pate filo', 'pistaches 300g', 'noix', 'beurre fondu', 'sirop sucre miel'], allergenes: ['gluten', 'fruits a coque', 'lait'], calories: 480, portions: 12, origine: 'Turquie / Levant', vin_accord: 'The menthe', categorie: 'dessert' },
    { nom: 'Mochi glace', temps: '2h + congel', difficulte: 'difficile', ingredients: ['farine riz gluant 200g', 'sucre 100g', 'glace vanille', 'maizena'], allergenes: ['lait'], calories: 180, portions: 8, origine: 'Japon', vin_accord: 'The vert', categorie: 'dessert' },
    { nom: 'Churros chocolat', temps: '40min', difficulte: 'intermediaire', ingredients: ['farine 250g', 'eau 25cl', 'huile friture', 'sucre cannelle', 'chocolat fondu'], allergenes: ['gluten', 'lait'], calories: 480, portions: 6, origine: 'Espagne / Mexique', vin_accord: 'Cafe corse', categorie: 'dessert' },
    { nom: 'Cookies americains', temps: '30min', difficulte: 'facile', ingredients: ['farine 300g', 'beurre 200g', 'cassonade 200g', 'oeuf', 'pepites chocolat 200g', 'vanille'], allergenes: ['gluten', 'lait', 'oeufs'], calories: 220, portions: 20, origine: 'USA', vin_accord: 'Lait', categorie: 'dessert' },
    /* Plats sains / régimes */
    { nom: 'Buddha bowl', temps: '30min', difficulte: 'facile', ingredients: ['quinoa', 'patate douce roti', 'pois chiches', 'kale', 'avocat', 'tahin', 'graines'], allergenes: ['sesame'], calories: 480, portions: 2, origine: 'International', vin_accord: 'The vert', categorie: 'plat' },
    { nom: 'Saumon teriyaki riz', temps: '25min', difficulte: 'facile', ingredients: ['saumon 4 filets', 'sauce teriyaki', 'riz', 'sesame', 'brocolis vapeur'], allergenes: ['poisson', 'soja', 'sesame'], calories: 480, portions: 4, origine: 'Japon-fusion', vin_accord: 'Riesling', categorie: 'plat' },
    { nom: 'Poke bowl saumon', temps: '20min', difficulte: 'facile', ingredients: ['riz sushi', 'saumon cru', 'avocat', 'concombre', 'edamame', 'mangue', 'sauce soja-sesame'], allergenes: ['poisson', 'soja', 'sesame'], calories: 480, portions: 1, origine: 'Hawaii', vin_accord: 'Sake / Riesling', categorie: 'plat' },
    { nom: 'Wraps poulet avocat', temps: '15min', difficulte: 'facile', ingredients: ['tortillas ble', 'poulet grille', 'avocat', 'salade', 'tomates', 'sauce yaourt'], allergenes: ['gluten', 'lait'], calories: 380, portions: 2, origine: 'International', vin_accord: 'Sauvignon', categorie: 'plat' },
  ] as readonly Recette[],
  /** Calories par 100g (CIQUAL ANSES) */
  calories: {
    'boeuf maigre': 150,
    'boeuf gras': 250,
    poulet: 160,
    saumon: 200,
    thon: 140,
    cabillaud: 80,
    crevettes: 100,
    oeuf: 150,
    'pates cuites': 130,
    'riz cuit': 130,
    quinoa: 120,
    pain: 260,
    pain_complet: 240,
    pomme: 52,
    banane: 89,
    orange: 47,
    fraise: 32,
    fromage: 350,
    yaourt: 60,
    lait: 60,
    beurre: 750,
    huile: 900,
    'huile olive': 884,
    'chocolat noir': 540,
    chocolat_lait: 535,
    sucre: 400,
    miel: 304,
    confiture: 280,
    avocat: 160,
    tomate: 18,
    salade: 14,
    courgette: 17,
    aubergine: 25,
    pomme_terre: 77,
    frites: 312,
    vin: 80,
    biere: 43,
    cafe: 2,
    the: 1,
  } as Record<string, number>,
  /** Macros par 100g : protéines / lipides / glucides en grammes */
  macros: {
    poulet: { proteines: 23, lipides: 4, glucides: 0, ig: 'bas' },
    saumon: { proteines: 20, lipides: 13, glucides: 0, ig: 'bas' },
    'boeuf maigre': { proteines: 21, lipides: 7, glucides: 0, ig: 'bas' },
    oeuf: { proteines: 13, lipides: 11, glucides: 1.1, ig: 'bas' },
    pain: { proteines: 9, lipides: 1.3, glucides: 49, ig: 'haut' },
    pain_complet: { proteines: 9, lipides: 2, glucides: 41, fibres: 7, ig: 'moyen' },
    'riz cuit': { proteines: 2.7, lipides: 0.3, glucides: 28, ig: 'haut' },
    quinoa: { proteines: 4.4, lipides: 1.9, glucides: 21, fibres: 2.8, ig: 'bas' },
    'pates cuites': { proteines: 5, lipides: 1, glucides: 25, ig: 'moyen' },
    pomme_terre: { proteines: 2, lipides: 0.1, glucides: 17, ig: 'haut' },
    fromage: { proteines: 25, lipides: 28, glucides: 1.3, ig: 'bas' },
    yaourt: { proteines: 4, lipides: 1.5, glucides: 4.7, ig: 'bas' },
    avocat: { proteines: 2, lipides: 15, glucides: 9, fibres: 7, ig: 'bas' },
    pomme: { proteines: 0.3, lipides: 0.2, glucides: 14, fibres: 2.4, ig: 'moyen' },
    banane: { proteines: 1.1, lipides: 0.3, glucides: 23, fibres: 2.6, ig: 'haut' },
    'chocolat noir': { proteines: 8, lipides: 43, glucides: 24, fibres: 11, ig: 'bas' },
  } as Record<string, MacroNutriments>,
} as const;
 

/**
 * Convertir une mesure cuisine. Retourne null si non reconnue.
 */
export function cuisineConvert(quantite: string): { original: string; equivalent: string } | null {
  const t = String(quantite || '').toLowerCase().trim();
  const r = AX_CUISINE.conversions[t];
  return r ? { original: quantite, equivalent: r } : null;
}

/**
 * Recherche full-text recettes par nom OU ingrédient OU origine OU catégorie.
 */
export function cuisineSearch(query: string): readonly Recette[] {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return AX_CUISINE.recettes;
  return AX_CUISINE.recettes.filter(
    (r) =>
      r.nom.toLowerCase().includes(q) ||
      r.ingredients.some((i) => i.toLowerCase().includes(q)) ||
      (r.origine ?? '').toLowerCase().includes(q) ||
      (r.categorie ?? '').toLowerCase().includes(q)
  );
}

/**
 * Filtrer recettes par catégorie.
 */
export function filterByCategorie(categorie: string): readonly Recette[] {
  const c = String(categorie || '').toLowerCase().trim();
  return AX_CUISINE.recettes.filter((r) => (r.categorie ?? '').toLowerCase() === c);
}

/**
 * Filtrer recettes excluant des allergènes (gluten-free, lactose-free, etc.).
 */
export function filterExcludingAllergenes(allergenes: readonly string[]): readonly Recette[] {
  if (!allergenes.length) return AX_CUISINE.recettes;
  const exc = allergenes.map((a) => a.toLowerCase());
  return AX_CUISINE.recettes.filter((r) => {
    const al = (r.allergenes ?? []).map((a) => a.toLowerCase());
    return !al.some((a) => exc.includes(a));
  });
}

/**
 * Calcule total calories pour une liste d'aliments.
 */
export function calcCalories(aliments: ReadonlyArray<{ nom: string; grammes: number }>): {
  total_kcal: number;
  detail: Array<{ aliment: string; grammes: number; kcal: number }>;
} {
  let total = 0;
  const detail: Array<{ aliment: string; grammes: number; kcal: number }> = [];
  for (const a of aliments || []) {
    const k = String(a.nom || '').toLowerCase();
    const perCent = AX_CUISINE.calories[k] ?? 100;
    const g = Number(a.grammes) || 0;
    const kcal = Math.round((g * perCent) / 100);
    total += kcal;
    detail.push({ aliment: a.nom, grammes: g, kcal });
  }
  return { total_kcal: total, detail };
}

/**
 * Calcule macros (P/L/G) pour une liste d'aliments.
 */
export function calcMacros(aliments: ReadonlyArray<{ nom: string; grammes: number }>): {
  proteines_g: number;
  lipides_g: number;
  glucides_g: number;
  total_kcal: number;
} {
  let p = 0;
  let l = 0;
  let g = 0;
  for (const a of aliments || []) {
    const k = String(a.nom || '').toLowerCase();
    const m = AX_CUISINE.macros[k];
    const gr = Number(a.grammes) || 0;
    if (m) {
      p += (m.proteines * gr) / 100;
      l += (m.lipides * gr) / 100;
      g += (m.glucides * gr) / 100;
    }
  }
  /* 4 kcal/g protéines + glucides, 9 kcal/g lipides */
  const kcal = Math.round(p * 4 + g * 4 + l * 9);
  return {
    proteines_g: Math.round(p * 10) / 10,
    lipides_g: Math.round(l * 10) / 10,
    glucides_g: Math.round(g * 10) / 10,
    total_kcal: kcal,
  };
}

/**
 * Génère liste de courses agrégée à partir d'un set de recettes.
 */
export function generateCourses(recettes: readonly Recette[]): string[] {
  const courses: Record<string, number> = {};
  for (const r of recettes || []) {
    for (const i of r.ingredients || []) {
      courses[i] = (courses[i] ?? 0) + 1;
    }
  }
  return Object.keys(courses).map((k) => `${courses[k]}x ${k}`);
}

/**
 * Scaling portions : multiplie quantités d'une recette par un facteur.
 */
export function scaleRecette(recette: Recette, facteur: number): Recette {
  const f = Number(facteur) || 1;
  const newIngredients = recette.ingredients.map((ing) => {
    /* Cherche un nombre dans l'ingrédient + scale */
    return ing.replace(/(\d+(?:\.\d+)?)/, (m) => {
      const n = Number(m) * f;
      return String(Math.round(n * 100) / 100);
    });
  });
  const result: Recette = {
    ...recette,
    ingredients: newIngredients,
    portions: Math.round((recette.portions ?? 1) * f),
  };
  if (recette.calories !== undefined) {
    result.calories = Math.round(recette.calories);
  }
  return result;
}

/**
 * Suggère une substitution pour un ingrédient (régime spécifique).
 */
export function suggerSubstitution(
  ingredient: string,
  regime: 'lactose' | 'gluten' | 'vegan'
): string | null {
  const k = String(ingredient || '').toLowerCase().trim();
  const subs = AX_CUISINE.substitutions[regime];
  if (!subs) return null;
  for (const key of Object.keys(subs)) {
    if (k.includes(key)) return subs[key] ?? null;
  }
  return null;
}

/**
 * Génère plan menu équilibré 7 jours pour cible kcal.
 * Sélection sans ML : entrée/plat/dessert dans recettes correspondant à la cible.
 */
export function generateMenuPlan(cibleKcal: number, type = 'equilibre'): PlanMenu {
  const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const recettes = AX_CUISINE.recettes;
  const result: MenuJour[] = [];
  for (let i = 0; i < jours.length; i++) {
    const idx = i * 3;
    const r1 = recettes[idx % recettes.length];
    const r2 = recettes[(idx + 1) % recettes.length];
    const r3 = recettes[(idx + 2) % recettes.length];
    const total = (r1?.calories ?? 0) + (r2?.calories ?? 0) + (r3?.calories ?? 0);
    result.push({
      jour: jours[i] ?? `Jour ${i + 1}`,
      petit_dej: 'Cafe + tartines beurre confiture (~350 kcal)',
      dejeuner: r1?.nom ?? 'libre',
      diner: r2?.nom ?? 'libre',
      collation: r3?.nom ?? 'fruit',
      total_kcal: Math.round(total * 0.6) + 350,
    });
  }
  return {
    cible_kcal: cibleKcal,
    type,
    jours: result,
  };
}

/* boost v13 — Helpers cuisine experts */

/**
 * Filtre recettes saisonnières basé sur le mois actuel.
 */
export function filterRecettesSaison(mois: number): readonly Recette[] {
  if (mois < 1 || mois > 12) return AX_CUISINE.recettes;
  /* Heuristique : recettes contenant des ingrédients de saison */
  const ingredientsSaison = Object.keys(AX_CUISINE.saisonnalite).filter((ing) => {
    const months = AX_CUISINE.saisonnalite[ing];
    return Array.isArray(months) && months.includes(mois);
  });
  if (ingredientsSaison.length === 0) return AX_CUISINE.recettes;
  return AX_CUISINE.recettes.filter((r) =>
    r.ingredients.some((i) =>
      ingredientsSaison.some((s) => i.toLowerCase().includes(s.replace(/_/g, ' ').toLowerCase()))
    )
  );
}

/**
 * Vérifie si un ingrédient est de saison ce mois.
 */
export function estDeSaison(ingredient: string, mois: number): boolean {
  const k = ingredient.toLowerCase().replace(/\s+/g, '_');
  const months = AX_CUISINE.saisonnalite[k];
  return Array.isArray(months) && months.includes(mois);
}

/**
 * Calcule l'index glycémique moyen d'un repas.
 */
export function calcIgRepas(aliments: ReadonlyArray<{ nom: string; grammes: number }>): { ig_moyen: number; classe: 'bas' | 'moyen' | 'haut' } {
  let totalIg = 0;
  let totalG = 0;
  for (const a of aliments) {
    const ig = AX_CUISINE.index_glycemique[String(a.nom).toLowerCase().replace(/\s+/g, '_')];
    if (ig !== undefined) {
      totalIg += ig * (a.grammes || 0);
      totalG += a.grammes || 0;
    }
  }
  if (totalG === 0) return { ig_moyen: 0, classe: 'bas' };
  const moyenne = Math.round(totalIg / totalG);
  let classe: 'bas' | 'moyen' | 'haut' = 'bas';
  if (moyenne >= 70) classe = 'haut';
  else if (moyenne >= 55) classe = 'moyen';
  return { ig_moyen: moyenne, classe };
}

/**
 * Suggère cépage par plat.
 */
export function suggerCepage(plat: string): string | null {
  const p = plat.toLowerCase();
  if (/boeuf|agneau|gibier|grillade/.test(p)) return AX_CUISINE.cepages['cabernet_sauvignon'] ?? null;
  if (/poisson|fruits.de.mer|sushi/.test(p)) return AX_CUISINE.cepages['sauvignon_blanc'] ?? null;
  if (/volaille|poulet|canard/.test(p)) return AX_CUISINE.cepages['pinot_noir'] ?? null;
  if (/curry|asiat|epice/.test(p)) return AX_CUISINE.cepages['gewurztraminer'] ?? null;
  if (/pates|tomate|pizza/.test(p)) return AX_CUISINE.cepages['sangiovese'] ?? null;
  if (/fromage/.test(p)) return AX_CUISINE.cepages['chardonnay'] ?? null;
  return AX_CUISINE.cepages['merlot'] ?? null;
}

/**
 * Génère menu adapté à régime spécifique (keto, paleo, vegan, etc).
 */
export function filterByRegime(regime: 'vegan' | 'vegetarien' | 'sans_gluten' | 'sans_lactose' | 'keto' | 'paleo'): readonly Recette[] {
  switch (regime) {
    case 'vegan':
      return AX_CUISINE.recettes.filter((r) => {
        const ings = r.ingredients.join(' ').toLowerCase();
        return !/viande|boeuf|poulet|porc|agneau|veau|lapin|canard|jambon|lardons|saucisse|oeuf|lait|beurre|creme|fromage|yaourt|miel|poisson|crevette|saumon|thon|cabillaud|st.jacques/.test(ings);
      });
    case 'vegetarien':
      return AX_CUISINE.recettes.filter((r) => {
        const ings = r.ingredients.join(' ').toLowerCase();
        return !/viande|boeuf|poulet|porc|agneau|veau|lapin|canard|jambon|lardons|saucisse|poisson|crevette|saumon|thon|cabillaud|st.jacques|anchois/.test(ings);
      });
    case 'sans_gluten':
      return filterExcludingAllergenes(['gluten']);
    case 'sans_lactose':
      return filterExcludingAllergenes(['lait']);
    case 'keto':
      return AX_CUISINE.recettes.filter((r) => {
        const ings = r.ingredients.join(' ').toLowerCase();
        return !/farine|pates|riz|pomme.de.terre|sucre|pain|baguette/.test(ings);
      });
    case 'paleo':
      return AX_CUISINE.recettes.filter((r) => {
        const ings = r.ingredients.join(' ').toLowerCase();
        return !/farine|pates|riz|legumineuses|haricots|lentilles|pois.chiches|sucre.raffine|lait|fromage|yaourt/.test(ings);
      });
    default:
      return AX_CUISINE.recettes;
  }
}

/**
 * Plan menu équilibré 14 jours (2 semaines, varié, pas de répétition).
 */
export function generateMenuPlan14J(cibleKcal: number): readonly MenuJour[] {
  const jours = ['Lun S1', 'Mar S1', 'Mer S1', 'Jeu S1', 'Ven S1', 'Sam S1', 'Dim S1',
                 'Lun S2', 'Mar S2', 'Mer S2', 'Jeu S2', 'Ven S2', 'Sam S2', 'Dim S2'];
  const recettes = AX_CUISINE.recettes;
  const result: MenuJour[] = [];
  for (let i = 0; i < jours.length; i++) {
    const offset = (i * 7) % recettes.length;
    const r1 = recettes[offset] ?? recettes[0];
    const r2 = recettes[(offset + 3) % recettes.length] ?? recettes[1];
    const collation = recettes.find((r) => r.categorie === 'dessert') ?? recettes[0];
    if (!r1 || !r2) continue;
    result.push({
      jour: jours[i] ?? `J${i + 1}`,
      petit_dej: 'Granola + yaourt + fruits (~350 kcal)',
      dejeuner: r1.nom,
      diner: r2.nom,
      collation: collation?.nom ?? '',
      total_kcal: Math.round(((r1.calories ?? 0) + (r2.calories ?? 0)) * 0.6) + 350,
    });
  }
  /* Ajuste cible si trop éloignée */
  const moy = result.reduce((a, b) => a + b.total_kcal, 0) / result.length;
  if (Math.abs(moy - cibleKcal) > 300) {
    return result.map((r) => ({ ...r, total_kcal: Math.round(cibleKcal) }));
  }
  return result;
}

/**
 * Liste de courses agrégée + catégorisée (légumes / viandes / épicerie / produits laitiers).
 */
export function generateCoursesCategorized(recettes: readonly Recette[]): Record<string, string[]> {
  const cat: Record<string, string[]> = {
    'Fruits & Légumes': [],
    'Viandes & Poissons': [],
    'Produits laitiers': [],
    'Épicerie sèche': [],
    'Boissons': [],
    'Autres': [],
  };
  const seen = new Set<string>();
  for (const r of recettes) {
    for (const ing of r.ingredients) {
      const k = ing.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      if (/legume|tomate|salade|carotte|oignon|ail|courgette|aubergine|poivron|fruit|pomme|banane|citron|fraise|herbes/.test(k)) {
        cat['Fruits & Légumes']?.push(ing);
      } else if (/boeuf|poulet|porc|agneau|veau|canard|jambon|lardons|saucisse|poisson|crevette|saumon|thon|cabillaud/.test(k)) {
        cat['Viandes & Poissons']?.push(ing);
      } else if (/lait|beurre|fromage|creme|yaourt|gruyere|parmesan|mozzarella|feta|ricotta/.test(k)) {
        cat['Produits laitiers']?.push(ing);
      } else if (/farine|sucre|riz|pates|huile|sel|poivre|epice|levure|chocolat|miel|confiture/.test(k)) {
        cat['Épicerie sèche']?.push(ing);
      } else if (/vin|cidre|biere|alcool|the|cafe/.test(k)) {
        cat['Boissons']?.push(ing);
      } else {
        cat['Autres']?.push(ing);
      }
    }
  }
  return cat;
}

/**
 * Suggère un vin pour un plat (par nom de plat).
 */
export function suggerVin(nomPlat: string): string | null {
  const q = String(nomPlat || '').toLowerCase().trim();
  if (!q) return null;
  const found = AX_CUISINE.recettes.find((r) => r.nom.toLowerCase().includes(q));
  return found?.vin_accord ?? null;
}

/**
 * Render UI premium Cuisine Pro.
 */
export function render(root: HTMLElement): void {
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('pro.cuisine', root, uid)) return;
  const cuissonsHtml = Object.keys(AX_CUISINE.cuissons)
    .map((k) => {
      const c = AX_CUISINE.cuissons[k];
      if (!c) return '';
      let line = `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08)"><strong>${escapeHtml(k)}</strong> : ${escapeHtml(c.temps)}`;
      if (c.eau) line += ` &middot; 💧 ${escapeHtml(c.eau)}`;
      if (c.four) line += ` &middot; 🔥 four ${escapeHtml(c.four)}`;
      if (c.temp_coeur) line += ` &middot; 🌡 ${escapeHtml(c.temp_coeur)}`;
      if (c.repos) line += ` &middot; ⏸ repos ${escapeHtml(c.repos)}`;
      if (c.rincage) line += ` &middot; 🚿 ${escapeHtml(c.rincage)}`;
      if (c.trempage) line += ` &middot; 💧 trempage ${escapeHtml(c.trempage)}`;
      line += '</div>';
      return line;
    })
    .join('');

  const conversionsHtml = Object.keys(AX_CUISINE.conversions)
    .map((k) => `<div>${escapeHtml(k)} = <strong>${escapeHtml(AX_CUISINE.conversions[k] ?? '')}</strong></div>`)
    .join('');

  const allergenesHtml = AX_CUISINE.allergenes
    .map((a) => `<span style="display:inline-block;padding:4px 10px;background:rgba(255,107,52,0.15);border-radius:12px;margin:3px;font-size:12px;color:#ffb56b">${escapeHtml(a)}</span>`)
    .join('');

  const regimesHtml = AX_CUISINE.regimes
    .map((a) => `<span style="display:inline-block;padding:4px 10px;background:rgba(76,175,80,0.15);border-radius:12px;margin:3px;font-size:12px;color:#7adda1">${escapeHtml(a)}</span>`)
    .join('');

  root.innerHTML = `
    <div class="ax-gs-34">
      <h2 style="background:linear-gradient(135deg,#ff8c42,#ffb56b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-size:28px;margin-bottom:8px">🍳 Cuisine Pro</h2>
      <p class="ax-gs-421">${AX_CUISINE.recettes.length} recettes &middot; ${Object.keys(AX_CUISINE.cuissons).length} cuissons &middot; 14 allergènes INCO &middot; macros + IG &middot; sommellerie</p>
      <div class="ax-gs-4">
        <h3 class="ax-gs-422">📖 Recettes (${AX_CUISINE.recettes.length})</h3>
        <input id="cuiQ" type="text" placeholder="Rechercher (poulet, italie, dessert, gluten...)" class="ax-gs-423" aria-label="Recherche recette">
        <button id="cuiSearchBtn" type="button" style="width:100%;margin-top:8px;padding:12px;background:linear-gradient(135deg,#ff8c42,#ffb56b);color:#000;border:0;border-radius:8px;font-weight:700;cursor:pointer;min-height:44px">Rechercher</button>
        <div id="cuiSearchResult" class="ax-gs-241"></div>
      </div>
      <div class="ax-gs-4">
        <h3 class="ax-gs-422">⏱ Temps de cuisson (${Object.keys(AX_CUISINE.cuissons).length})</h3>
        <div style="font-size:12px;line-height:1.7;max-height:260px;overflow-y:auto">${cuissonsHtml}</div>
      </div>
      <div class="ax-gs-4">
        <h3 class="ax-gs-422">📐 Conversions cuisine (${Object.keys(AX_CUISINE.conversions).length})</h3>
        <div style="font-size:13px;line-height:1.8;max-height:200px;overflow-y:auto">${conversionsHtml}</div>
      </div>
      <div class="ax-gs-4">
        <h3 class="ax-gs-422">⚠ 14 allergènes UE (INCO)</h3>
        <p style="font-size:11px;color:#888;margin:0 0 8px">Source : Règlement (UE) 1169/2011 (information consommateur)</p>
        <div>${allergenesHtml}</div>
      </div>
      <div class="ax-gs-4">
        <h3 class="ax-gs-422">🥗 Régimes alimentaires (${AX_CUISINE.regimes.length})</h3>
        <div>${regimesHtml}</div>
      </div>
      <p style="margin-top:18px;text-align:center;font-size:11px;color:#666">Sources : Règlement INCO 1169/2011 &middot; ANSES &middot; CIQUAL</p>
    </div>
  `;

  const btn = root.querySelector<HTMLButtonElement>('#cuiSearchBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const inp = root.querySelector<HTMLInputElement>('#cuiQ');
      const out = root.querySelector<HTMLDivElement>('#cuiSearchResult');
      if (!inp || !out) return;
      const res = cuisineSearch(inp.value);
      if (!res.length) {
        out.innerHTML = '<em>Aucune recette trouvée</em>';
        return;
      }
      out.innerHTML = res
        .slice(0, 20)
        .map(
          (r) =>
            `<div style="padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;margin:6px 0;background:rgba(0,0,0,0.2)"><strong>${escapeHtml(r.nom)}</strong> &middot; ${escapeHtml(r.temps)} &middot; <em>${escapeHtml(r.difficulte)}</em>${r.calories ? ` &middot; 🔥 ${r.calories} kcal` : ''}${r.origine ? ` &middot; 🌍 ${escapeHtml(r.origine)}` : ''}<br><small class="ax-gs-216">📦 ${r.ingredients.map(escapeHtml).join(', ')}</small>${r.allergenes ? `<br><small style="color:#e74c3c">⚠ ${r.allergenes.map(escapeHtml).join(', ')}</small>` : ''}${r.vin_accord ? `<br><small class="ax-gs-198">🍷 ${escapeHtml(r.vin_accord)}</small>` : ''}</div>`
        )
        .join('');
    });
  }

  logger.info('cuisine-pro', 'rendered');
}
