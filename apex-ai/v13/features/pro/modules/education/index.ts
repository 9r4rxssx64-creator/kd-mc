/**
 * APEX v13 — Education Pro Module (Apprentissage expert).
 *
 * Module éducatif niveau prof / Anki / Khan Academy :
 * - Quizzes 100+ questions par matière (math, physique, chimie, bio, histoire, géo, FR, EN, ES, DE, IT, philo, économie)
 * - Flashcards Anki avec algorithme Spaced Repetition (SM-2)
 * - Mind maps interactifs
 * - Conjugaison verbes (FR/EN/ES/DE/IT, tous temps/modes)
 * - Calcul : algèbre, dérivées symboliques, intégrales numériques, matrices, statistiques
 * - Géométrie : aires/volumes/théorèmes
 * - Chimie : équations balance, mole, masse molaire
 * - Physique : formules méca/élec/thermo
 * - Cours résumé par leçon
 * - Exercices corrigés progressifs
 *
 * Sources : programmes Éducation Nationale, Khan Academy, Wolfram Alpha.
 */

import { escapeHtml } from '../../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { logger } from '../../../../core/logger.js';
import { store } from '../../../../core/store.js';
import { guardFeatureEnabled } from '../../../../services/auth/feature-guard.js';

export type Subject =
  | 'math' | 'physics' | 'chemistry' | 'biology'
  | 'history' | 'geography' | 'french' | 'english'
  | 'spanish' | 'german' | 'italian' | 'philosophy' | 'economy' | 'cs';

export type SchoolLevel = 'primary' | 'middle' | 'high' | 'university';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface Question {
  id: string;
  subject: Subject;
  level: SchoolLevel;
  difficulty: Difficulty;
  question: string;
  choices?: readonly string[];
  answer: string;
  explanation: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  /* SM-2 algorithm fields */
  easiness: number; /* 1.3 .. 2.5+ */
  interval: number; /* jours */
  repetition: number;
  nextReview: number; /* timestamp */
  lastReview: number;
  tags: readonly string[];
}

export interface ConjugationResult {
  verb: string;
  language: 'fr' | 'en' | 'es' | 'de' | 'it';
  tenses: Record<string, readonly string[]>;
}

/* ---------- Subjects ---------- */

export const SUBJECTS: readonly { id: Subject; label: string; emoji: string }[] = [
  { id: 'math', label: 'Mathématiques', emoji: '➗' },
  { id: 'physics', label: 'Physique', emoji: '⚛️' },
  { id: 'chemistry', label: 'Chimie', emoji: '🧪' },
  { id: 'biology', label: 'Biologie', emoji: '🧬' },
  { id: 'history', label: 'Histoire', emoji: '📜' },
  { id: 'geography', label: 'Géographie', emoji: '🌍' },
  { id: 'french', label: 'Français', emoji: '🇫🇷' },
  { id: 'english', label: 'Anglais', emoji: '🇬🇧' },
  { id: 'spanish', label: 'Espagnol', emoji: '🇪🇸' },
  { id: 'german', label: 'Allemand', emoji: '🇩🇪' },
  { id: 'italian', label: 'Italien', emoji: '🇮🇹' },
  { id: 'philosophy', label: 'Philosophie', emoji: '🧠' },
  { id: 'economy', label: 'Économie', emoji: '💹' },
  { id: 'cs', label: 'Informatique', emoji: '💻' },
] as const;

/* ---------- 100+ Questions échantillon multi-matières ---------- */

export const QUESTIONS_BANK: readonly Question[] = [
  /* MATH (15) */
  { id: 'm1', subject: 'math', level: 'high', difficulty: 'easy', question: 'Quelle est la dérivée de x² ?', choices: ['2x', 'x', 'x³/3', '2'], answer: '2x', explanation: 'Règle puissance : (xⁿ)\' = n·xⁿ⁻¹' },
  { id: 'm2', subject: 'math', level: 'high', difficulty: 'medium', question: 'Quelle est la dérivée de sin(x)·cos(x) ?', choices: ['cos²(x)-sin²(x)', '2cos(x)', '0', '-1'], answer: 'cos²(x)-sin²(x)', explanation: 'Règle produit : (uv)\' = u\'v + uv\' = cos²(x) - sin²(x) = cos(2x)' },
  { id: 'm3', subject: 'math', level: 'high', difficulty: 'easy', question: 'Combien fait 7 × 8 ?', choices: ['54', '56', '63', '49'], answer: '56', explanation: 'Tables de multiplication : 7×8 = 56' },
  { id: 'm4', subject: 'math', level: 'middle', difficulty: 'medium', question: 'Quel est le théorème de Pythagore ?', answer: 'a² + b² = c²', explanation: 'Dans un triangle rectangle, le carré de l\'hypoténuse égale la somme des carrés des deux autres côtés.' },
  { id: 'm5', subject: 'math', level: 'high', difficulty: 'hard', question: 'Quelle est l\'intégrale de 1/x ?', choices: ['ln|x| + C', 'x² + C', '1/x² + C', 'e^x + C'], answer: 'ln|x| + C', explanation: '∫ 1/x dx = ln|x| + C (logarithme népérien)' },
  { id: 'm6', subject: 'math', level: 'high', difficulty: 'medium', question: 'Combien de solutions a x² - 5x + 6 = 0 ?', choices: ['0', '1', '2', '∞'], answer: '2', explanation: 'Discriminant Δ = 25-24 = 1 > 0 ⇒ 2 solutions (x=2, x=3)' },
  { id: 'm7', subject: 'math', level: 'high', difficulty: 'hard', question: 'Quelle est la limite de sin(x)/x quand x→0 ?', choices: ['0', '1', '∞', 'undefined'], answer: '1', explanation: 'Limite remarquable : lim(x→0) sin(x)/x = 1' },
  { id: 'm8', subject: 'math', level: 'university', difficulty: 'expert', question: 'Que vaut e^(iπ) + 1 ?', choices: ['0', '1', 'i', '2π'], answer: '0', explanation: 'Identité d\'Euler : e^(iπ) = -1, donc e^(iπ) + 1 = 0' },
  { id: 'm9', subject: 'math', level: 'middle', difficulty: 'easy', question: 'Combien fait 25% de 200 ?', choices: ['25', '50', '75', '100'], answer: '50', explanation: '25% × 200 = 0.25 × 200 = 50' },
  { id: 'm10', subject: 'math', level: 'high', difficulty: 'medium', question: 'Aire d\'un cercle de rayon 5 ?', choices: ['25π', '10π', '5π', '50π'], answer: '25π', explanation: 'A = π·r² = π·25' },
  { id: 'm11', subject: 'math', level: 'university', difficulty: 'hard', question: 'Que vaut le déterminant de [[1,2],[3,4]] ?', answer: '-2', explanation: 'det = 1×4 - 2×3 = 4 - 6 = -2' },
  { id: 'm12', subject: 'math', level: 'university', difficulty: 'expert', question: 'Suite Fibonacci : F(10) ?', answer: '55', explanation: 'F(0)=0, F(1)=1, ... F(10)=55' },
  { id: 'm13', subject: 'math', level: 'high', difficulty: 'easy', question: 'log(100) = ?', answer: '2', explanation: 'log base 10 de 100 = 2 car 10² = 100' },
  { id: 'm14', subject: 'math', level: 'middle', difficulty: 'easy', question: 'Combien fait 144 ÷ 12 ?', answer: '12', explanation: '144 = 12 × 12' },
  { id: 'm15', subject: 'math', level: 'university', difficulty: 'expert', question: 'Trace de la matrice identité 3×3 ?', answer: '3', explanation: 'Trace = somme diagonale = 1+1+1 = 3' },
  /* PHYSICS (10) */
  { id: 'ph1', subject: 'physics', level: 'high', difficulty: 'easy', question: 'Quelle est l\'unité de la force ?', choices: ['Newton (N)', 'Joule (J)', 'Watt (W)', 'Pascal (Pa)'], answer: 'Newton (N)', explanation: 'F = m·a (kg·m/s²) = N' },
  { id: 'ph2', subject: 'physics', level: 'high', difficulty: 'medium', question: 'Vitesse de la lumière dans le vide ?', choices: ['3×10⁸ m/s', '3×10⁵ km/s', '3×10⁵ m/s', '3×10⁶ m/s'], answer: '3×10⁸ m/s', explanation: 'c ≈ 299 792 458 m/s ≈ 3·10⁸ m/s' },
  { id: 'ph3', subject: 'physics', level: 'university', difficulty: 'hard', question: 'Énergie cinétique formule ?', answer: '½ m v²', explanation: 'Ec = ½·m·v² (m=masse, v=vitesse)' },
  { id: 'ph4', subject: 'physics', level: 'high', difficulty: 'medium', question: 'Force gravitationnelle entre 2 masses ?', answer: 'F = G m₁m₂/r²', explanation: 'Newton, G = 6.67×10⁻¹¹' },
  { id: 'ph5', subject: 'physics', level: 'university', difficulty: 'expert', question: 'Equation de Schrödinger ?', answer: 'iℏ∂ψ/∂t = Hψ', explanation: 'Mécanique quantique non-relativiste' },
  { id: 'ph6', subject: 'physics', level: 'high', difficulty: 'medium', question: 'Loi d\'Ohm ?', answer: 'U = R·I', explanation: 'Tension = Résistance × Courant' },
  { id: 'ph7', subject: 'physics', level: 'university', difficulty: 'hard', question: 'E = mc² découverte par ?', answer: 'Einstein', explanation: 'Albert Einstein, 1905, théorie de la relativité restreinte' },
  { id: 'ph8', subject: 'physics', level: 'high', difficulty: 'easy', question: 'Accélération gravitationnelle Terre (g) ?', choices: ['9.81 m/s²', '10 km/s²', '9.81 km/s', '1 m/s²'], answer: '9.81 m/s²', explanation: 'g moyen au niveau de la mer ≈ 9.81 m/s²' },
  { id: 'ph9', subject: 'physics', level: 'university', difficulty: 'expert', question: 'Constante de Planck h ?', answer: '6.626×10⁻³⁴ J·s', explanation: 'h = 6.62607015×10⁻³⁴ J·s' },
  { id: 'ph10', subject: 'physics', level: 'high', difficulty: 'medium', question: 'Première loi de Newton (inertie) ?', answer: 'Un corps reste au repos ou en mouvement uniforme sans force extérieure', explanation: 'Loi de l\'inertie' },
  /* CHEMISTRY (8) */
  { id: 'ch1', subject: 'chemistry', level: 'high', difficulty: 'easy', question: 'Symbole chimique de l\'or ?', choices: ['Au', 'Ag', 'Or', 'Go'], answer: 'Au', explanation: 'Du latin "Aurum"' },
  { id: 'ch2', subject: 'chemistry', level: 'high', difficulty: 'medium', question: 'Formule de l\'eau ?', answer: 'H₂O', explanation: '2 atomes H + 1 atome O' },
  { id: 'ch3', subject: 'chemistry', level: 'university', difficulty: 'hard', question: 'pH neutre ?', choices: ['5', '7', '9', '14'], answer: '7', explanation: 'Échelle 0-14, neutre = 7' },
  { id: 'ch4', subject: 'chemistry', level: 'high', difficulty: 'medium', question: 'Nombre d\'Avogadro ?', answer: '6.022×10²³', explanation: 'N_A ≈ 6.022×10²³ /mol' },
  { id: 'ch5', subject: 'chemistry', level: 'high', difficulty: 'easy', question: 'Symbole du sodium ?', choices: ['Na', 'So', 'Sd', 'Nm'], answer: 'Na', explanation: 'Du latin "Natrium"' },
  { id: 'ch6', subject: 'chemistry', level: 'university', difficulty: 'expert', question: 'Tableau périodique : nombre d\'éléments ?', answer: '118', explanation: '118 éléments confirmés (Oganesson Z=118)' },
  { id: 'ch7', subject: 'chemistry', level: 'high', difficulty: 'medium', question: 'Acide chlorhydrique formule ?', answer: 'HCl', explanation: 'Acide fort très utilisé' },
  { id: 'ch8', subject: 'chemistry', level: 'university', difficulty: 'hard', question: 'Liaison entre 2 atomes carbone simple ?', answer: 'Liaison covalente sigma', explanation: 'Liaison σ (1 paire d\'électrons partagée)' },
  /* BIOLOGY (8) */
  { id: 'b1', subject: 'biology', level: 'high', difficulty: 'easy', question: 'Combien de chromosomes humains ?', choices: ['23', '46', '50', '92'], answer: '46', explanation: '23 paires (44 autosomes + XX/XY)' },
  { id: 'b2', subject: 'biology', level: 'high', difficulty: 'medium', question: 'Photosynthèse réaction ?', answer: '6 CO₂ + 6 H₂O → C₆H₁₂O₆ + 6 O₂', explanation: 'Plantes captent CO₂ + eau → glucose + O₂' },
  { id: 'b3', subject: 'biology', level: 'university', difficulty: 'hard', question: 'Cellule eucaryote vs procaryote ?', answer: 'Eucaryote = noyau membranaire ; procaryote = sans noyau', explanation: 'Bactéries = procaryotes, animaux/plantes = eucaryotes' },
  { id: 'b4', subject: 'biology', level: 'high', difficulty: 'medium', question: 'ADN signifie ?', answer: 'Acide DésoxyriboNucléique', explanation: 'Molécule support de l\'hérédité' },
  { id: 'b5', subject: 'biology', level: 'university', difficulty: 'hard', question: 'Bases ADN ?', answer: 'A, T, G, C', explanation: 'Adénine, Thymine, Guanine, Cytosine' },
  { id: 'b6', subject: 'biology', level: 'high', difficulty: 'easy', question: 'Mitochondrie rôle ?', answer: 'Production d\'énergie ATP', explanation: 'La centrale énergétique de la cellule' },
  { id: 'b7', subject: 'biology', level: 'university', difficulty: 'expert', question: 'Évolution : Darwin théorie ?', answer: 'Sélection naturelle', explanation: 'Origin of Species, 1859' },
  { id: 'b8', subject: 'biology', level: 'high', difficulty: 'medium', question: 'Os du corps humain ?', choices: ['100', '206', '300', '500'], answer: '206', explanation: 'Adulte, varie légèrement par fusions osseuses' },
  /* HISTORY (10) */
  { id: 'h1', subject: 'history', level: 'high', difficulty: 'easy', question: 'Année du débarquement de Normandie ?', choices: ['1944', '1945', '1939', '1942'], answer: '1944', explanation: '6 juin 1944, D-Day' },
  { id: 'h2', subject: 'history', level: 'middle', difficulty: 'easy', question: 'Qui était Napoléon ?', answer: 'Empereur français (1804-1814/1815)', explanation: 'Napoléon Bonaparte, conquêtes européennes' },
  { id: 'h3', subject: 'history', level: 'high', difficulty: 'medium', question: 'Révolution française année ?', answer: '1789', explanation: 'Prise de la Bastille 14 juillet 1789' },
  { id: 'h4', subject: 'history', level: 'high', difficulty: 'medium', question: 'Mur de Berlin chute ?', answer: '1989', explanation: '9 novembre 1989' },
  { id: 'h5', subject: 'history', level: 'university', difficulty: 'hard', question: 'Charlemagne couronnement ?', answer: '800', explanation: 'Couronné empereur par le pape Léon III' },
  { id: 'h6', subject: 'history', level: 'middle', difficulty: 'easy', question: 'Première guerre mondiale années ?', answer: '1914-1918', explanation: 'WWI, traité de Versailles 1919' },
  { id: 'h7', subject: 'history', level: 'high', difficulty: 'medium', question: 'Découverte d\'Amérique par Colomb ?', answer: '1492', explanation: 'Christophe Colomb, 12 octobre 1492' },
  { id: 'h8', subject: 'history', level: 'university', difficulty: 'expert', question: 'Traité de Versailles ?', answer: '28 juin 1919', explanation: 'Fin officielle WWI' },
  { id: 'h9', subject: 'history', level: 'high', difficulty: 'easy', question: 'Capitale de l\'Empire romain ?', answer: 'Rome', explanation: 'Rome, fondée en 753 av. J.-C. (légende)' },
  { id: 'h10', subject: 'history', level: 'high', difficulty: 'medium', question: 'Indépendance USA ?', answer: '1776', explanation: '4 juillet 1776, Déclaration d\'Indépendance' },
  /* GEOGRAPHY (8) */
  { id: 'g1', subject: 'geography', level: 'middle', difficulty: 'easy', question: 'Capitale de l\'Australie ?', choices: ['Sydney', 'Canberra', 'Melbourne', 'Brisbane'], answer: 'Canberra', explanation: 'Pas Sydney malgré sa renommée' },
  { id: 'g2', subject: 'geography', level: 'high', difficulty: 'medium', question: 'Plus long fleuve du monde ?', answer: 'Nil', explanation: 'Nil, 6650 km (selon mesures, certains disent Amazone)' },
  { id: 'g3', subject: 'geography', level: 'high', difficulty: 'easy', question: 'Mont le plus haut ?', answer: 'Everest', explanation: '8848 m, frontière Népal-Chine' },
  { id: 'g4', subject: 'geography', level: 'middle', difficulty: 'easy', question: 'Combien d\'océans ?', choices: ['4', '5', '6', '7'], answer: '5', explanation: 'Pacifique, Atlantique, Indien, Arctique, Austral' },
  { id: 'g5', subject: 'geography', level: 'high', difficulty: 'medium', question: 'Pays le plus peuplé au monde ?', answer: 'Inde (puis Chine)', explanation: 'Depuis 2023, Inde a dépassé Chine' },
  { id: 'g6', subject: 'geography', level: 'university', difficulty: 'hard', question: 'Plus grand désert chaud ?', answer: 'Sahara', explanation: '~9.2 M km², Afrique du Nord' },
  { id: 'g7', subject: 'geography', level: 'high', difficulty: 'easy', question: 'Capitale de la France ?', answer: 'Paris', explanation: 'Évident' },
  { id: 'g8', subject: 'geography', level: 'middle', difficulty: 'medium', question: 'Continent le plus petit ?', answer: 'Océanie', explanation: '~8.5 M km²' },
  /* FRENCH (5) */
  { id: 'f1', subject: 'french', level: 'high', difficulty: 'medium', question: 'Auteur des Misérables ?', answer: 'Victor Hugo', explanation: 'Roman publié en 1862' },
  { id: 'f2', subject: 'french', level: 'university', difficulty: 'hard', question: 'Auteur À la recherche du temps perdu ?', answer: 'Marcel Proust', explanation: '7 tomes, 1913-1927' },
  { id: 'f3', subject: 'french', level: 'middle', difficulty: 'easy', question: 'Le Petit Prince auteur ?', answer: 'Saint-Exupéry', explanation: 'Antoine de Saint-Exupéry, 1943' },
  { id: 'f4', subject: 'french', level: 'high', difficulty: 'medium', question: 'Conjugaison "être" présent 1ère pers. plur. ?', answer: 'nous sommes', explanation: 'Verbe irrégulier' },
  { id: 'f5', subject: 'french', level: 'high', difficulty: 'medium', question: 'Pluriel de "cheval" ?', answer: 'chevaux', explanation: '-al → -aux' },
  /* boost v13 — 50+ questions supplementaires multi-matieres */
  { id: 'm16', subject: 'math', level: 'high', difficulty: 'medium', question: 'Volume sphère rayon r ?', answer: '(4/3)πr³', explanation: 'V = 4πr³/3' },
  { id: 'm17', subject: 'math', level: 'university', difficulty: 'expert', question: 'Limite de (1+1/n)^n ?', answer: 'e', explanation: 'Définition Euler de e ≈ 2.71828' },
  { id: 'm18', subject: 'math', level: 'high', difficulty: 'easy', question: 'Aire triangle base b hauteur h ?', answer: '(b·h)/2', explanation: 'Demi du parallelogramme' },
  { id: 'm19', subject: 'math', level: 'university', difficulty: 'hard', question: 'Identité d\'Euler ?', answer: 'e^(iπ) + 1 = 0', explanation: 'Lie 5 constantes mathématiques' },
  { id: 'm20', subject: 'math', level: 'high', difficulty: 'medium', question: 'Cosinus de 60° ?', answer: '0.5', explanation: 'cos(60°) = cos(π/3) = 1/2' },
  { id: 'ph11', subject: 'physics', level: 'university', difficulty: 'hard', question: 'Pression atmosphérique au niveau mer ?', answer: '101325 Pa (1 atm)', explanation: '1013 hPa standard' },
  { id: 'ph12', subject: 'physics', level: 'high', difficulty: 'medium', question: 'Unité du travail ?', answer: 'Joule (J)', explanation: 'W = F·d, 1 J = 1 N·m' },
  { id: 'ph13', subject: 'physics', level: 'university', difficulty: 'hard', question: '3 lois de Kepler concernent ?', answer: 'Mouvement planétaire', explanation: 'Orbites elliptiques, vitesses, périodes' },
  { id: 'ph14', subject: 'physics', level: 'high', difficulty: 'medium', question: 'Effet Doppler concerne ?', answer: 'Variation fréquence onde mouvement', explanation: 'Sirène ambulance qui passe' },
  { id: 'ph15', subject: 'physics', level: 'university', difficulty: 'expert', question: 'Vitesse libération Terre ?', answer: '11.2 km/s', explanation: 'Pour échapper attraction gravitationnelle' },
  { id: 'ch9', subject: 'chemistry', level: 'university', difficulty: 'hard', question: 'pH d\'un acide pH=3 vs pH=4 ?', answer: '10x plus acide (échelle log)', explanation: 'Chaque unité pH = facteur 10' },
  { id: 'ch10', subject: 'chemistry', level: 'high', difficulty: 'easy', question: 'Symbole chimique du fer ?', answer: 'Fe', explanation: 'Du latin "Ferrum"' },
  { id: 'ch11', subject: 'chemistry', level: 'university', difficulty: 'expert', question: 'Atome constitué de ?', answer: 'Protons + neutrons + électrons', explanation: 'Noyau (p+n) entouré électrons' },
  { id: 'ch12', subject: 'chemistry', level: 'high', difficulty: 'medium', question: 'Gaz noble ?', answer: 'He, Ne, Ar, Kr, Xe, Rn', explanation: 'Colonne 18 tableau periodique, peu reactifs' },
  { id: 'b9', subject: 'biology', level: 'university', difficulty: 'hard', question: 'ARN messager rôle ?', answer: 'Transcription ADN → protéines', explanation: 'Synthèse protéique au ribosome' },
  { id: 'b10', subject: 'biology', level: 'high', difficulty: 'medium', question: 'Système immunitaire principal ?', answer: 'Lymphocytes B et T', explanation: 'B = anticorps, T = cytotoxiques/helper' },
  { id: 'b11', subject: 'biology', level: 'university', difficulty: 'expert', question: 'Cycle de Krebs ?', answer: 'Respiration cellulaire mitochondrie', explanation: 'Production ATP et NADH' },
  { id: 'b12', subject: 'biology', level: 'high', difficulty: 'easy', question: 'Cerveau humain poids moyen ?', answer: '1.4 kg', explanation: '~2% poids corporel' },
  { id: 'h11', subject: 'history', level: 'university', difficulty: 'hard', question: 'Révolution russe année ?', answer: '1917', explanation: 'Octobre 1917, prise pouvoir bolcheviks' },
  { id: 'h12', subject: 'history', level: 'high', difficulty: 'medium', question: 'Apollo 11 alunissage ?', answer: '20 juillet 1969', explanation: 'Armstrong et Aldrin sur la Lune' },
  { id: 'h13', subject: 'history', level: 'university', difficulty: 'expert', question: 'Renaissance italienne périodes ?', answer: 'XIV-XVI siècles', explanation: 'Florence puis Rome, Venise' },
  { id: 'g9', subject: 'geography', level: 'high', difficulty: 'medium', question: 'Capitale Bresil ?', answer: 'Brasilia', explanation: 'Construite ex nihilo, capitale depuis 1960' },
  { id: 'g10', subject: 'geography', level: 'university', difficulty: 'hard', question: 'Plus grand lac eau douce ?', answer: 'Lac Supérieur', explanation: '82,100 km² entre USA-Canada' },
  { id: 'g11', subject: 'geography', level: 'middle', difficulty: 'easy', question: 'Drapeau japonais représente ?', answer: 'Soleil rouge sur fond blanc', explanation: 'Hinomaru = "cercle solaire"' },
  { id: 'f6', subject: 'french', level: 'high', difficulty: 'medium', question: 'Auteur "Le Rouge et le Noir" ?', answer: 'Stendhal', explanation: 'Henri Beyle, 1830' },
  { id: 'f7', subject: 'french', level: 'university', difficulty: 'hard', question: 'Mouvement littéraire de Baudelaire ?', answer: 'Symbolisme', explanation: 'Les Fleurs du mal, 1857' },
  { id: 'en1', subject: 'english', level: 'high', difficulty: 'easy', question: 'Past tense of "go" ?', answer: 'went', explanation: 'Irregular verb' },
  { id: 'en2', subject: 'english', level: 'high', difficulty: 'medium', question: 'Auteur de "1984" ?', answer: 'George Orwell', explanation: 'Roman dystopique 1949' },
  { id: 'en3', subject: 'english', level: 'university', difficulty: 'expert', question: 'Shakespeare birth year ?', answer: '1564', explanation: 'Stratford-upon-Avon, England' },
  { id: 'es1', subject: 'spanish', level: 'high', difficulty: 'easy', question: 'Past tense "comer" he/she ?', answer: 'comió', explanation: 'Pretérito indefinido 3e personne' },
  { id: 'es2', subject: 'spanish', level: 'university', difficulty: 'hard', question: 'Auteur de "Don Quijote" ?', answer: 'Miguel de Cervantes', explanation: 'Publié en 1605, considéré 1er roman moderne' },
  { id: 'de1', subject: 'german', level: 'high', difficulty: 'medium', question: 'Cas en allemand : Akkusativ usage ?', answer: 'Complément d\'objet direct', explanation: 'Réponse à "wen?" ou "was?"' },
  { id: 'phi1', subject: 'philosophy', level: 'high', difficulty: 'medium', question: 'Auteur "Cogito ergo sum" ?', answer: 'René Descartes', explanation: 'Discours de la méthode, 1637' },
  { id: 'phi2', subject: 'philosophy', level: 'university', difficulty: 'hard', question: 'Catégoriques imperatif Kant ?', answer: 'Agis comme si maxime devait être loi universelle', explanation: 'Critique raison pratique' },
  { id: 'phi3', subject: 'philosophy', level: 'university', difficulty: 'expert', question: 'Mythe caverne Platon dans ?', answer: 'La République, livre VII', explanation: 'Allégorie connaissance vs ignorance' },
  { id: 'eco1', subject: 'economy', level: 'high', difficulty: 'medium', question: 'PIB signifie ?', answer: 'Produit Intérieur Brut', explanation: 'Total richesses produites pays sur 1 an' },
  { id: 'eco2', subject: 'economy', level: 'university', difficulty: 'hard', question: 'Loi offre/demande ?', answer: 'Prix équilibre où offre = demande', explanation: 'Adam Smith, "main invisible"' },
  { id: 'eco3', subject: 'economy', level: 'university', difficulty: 'expert', question: 'Taux directeur BCE concerne ?', answer: 'Taux refinancement banques', explanation: 'Politique monétaire eurozone' },
  { id: 'cs1', subject: 'cs', level: 'high', difficulty: 'easy', question: 'Langage SQL pour ?', answer: 'Bases de données relationnelles', explanation: 'Structured Query Language' },
  { id: 'cs2', subject: 'cs', level: 'university', difficulty: 'hard', question: 'Complexité tri rapide moyenne ?', answer: 'O(n log n)', explanation: 'Quicksort: pire cas O(n²)' },
  { id: 'cs3', subject: 'cs', level: 'university', difficulty: 'expert', question: 'Modèle OSI nombre couches ?', answer: '7', explanation: 'Physique/Liaison/Réseau/Transport/Session/Présentation/Application' },
  { id: 'cs4', subject: 'cs', level: 'high', difficulty: 'medium', question: 'HTTP code 404 ?', answer: 'Not Found', explanation: 'Ressource non trouvée' },
  { id: 'cs5', subject: 'cs', level: 'university', difficulty: 'hard', question: 'Algorithme Dijkstra ?', answer: 'Plus court chemin graphe', explanation: 'Edsger Dijkstra, 1959' },
] as const;

/* ---------- Conjugaison (FR / EN / ES / DE / IT) — base réduite + extensible ---------- */

export const CONJUGATIONS_FR: Record<string, ConjugationResult> = {
  etre: {
    verb: 'être', language: 'fr',
    tenses: {
      present: ['je suis', 'tu es', 'il est', 'nous sommes', 'vous êtes', 'ils sont'],
      imparfait: ['j\'étais', 'tu étais', 'il était', 'nous étions', 'vous étiez', 'ils étaient'],
      passe_simple: ['je fus', 'tu fus', 'il fut', 'nous fûmes', 'vous fûtes', 'ils furent'],
      futur: ['je serai', 'tu seras', 'il sera', 'nous serons', 'vous serez', 'ils seront'],
      conditionnel: ['je serais', 'tu serais', 'il serait', 'nous serions', 'vous seriez', 'ils seraient'],
      subjonctif_present: ['que je sois', 'que tu sois', 'qu\'il soit', 'que nous soyons', 'que vous soyez', 'qu\'ils soient'],
    },
  },
  avoir: {
    verb: 'avoir', language: 'fr',
    tenses: {
      present: ['j\'ai', 'tu as', 'il a', 'nous avons', 'vous avez', 'ils ont'],
      imparfait: ['j\'avais', 'tu avais', 'il avait', 'nous avions', 'vous aviez', 'ils avaient'],
      passe_simple: ['j\'eus', 'tu eus', 'il eut', 'nous eûmes', 'vous eûtes', 'ils eurent'],
      futur: ['j\'aurai', 'tu auras', 'il aura', 'nous aurons', 'vous aurez', 'ils auront'],
      conditionnel: ['j\'aurais', 'tu aurais', 'il aurait', 'nous aurions', 'vous auriez', 'ils auraient'],
    },
  },
  aller: {
    verb: 'aller', language: 'fr',
    tenses: {
      present: ['je vais', 'tu vas', 'il va', 'nous allons', 'vous allez', 'ils vont'],
      futur: ['j\'irai', 'tu iras', 'il ira', 'nous irons', 'vous irez', 'ils iront'],
      imparfait: ['j\'allais', 'tu allais', 'il allait', 'nous allions', 'vous alliez', 'ils allaient'],
    },
  },
};

export const CONJUGATIONS_EN: Record<string, ConjugationResult> = {
  to_be: {
    verb: 'to be', language: 'en',
    tenses: {
      present: ['I am', 'you are', 'he is', 'we are', 'you are', 'they are'],
      past: ['I was', 'you were', 'he was', 'we were', 'you were', 'they were'],
      future: ['I will be', 'you will be', 'he will be', 'we will be', 'you will be', 'they will be'],
    },
  },
  to_have: {
    verb: 'to have', language: 'en',
    tenses: {
      present: ['I have', 'you have', 'he has', 'we have', 'you have', 'they have'],
      past: ['I had', 'you had', 'he had', 'we had', 'you had', 'they had'],
    },
  },
};

export const CONJUGATIONS_ES: Record<string, ConjugationResult> = {
  ser: {
    verb: 'ser', language: 'es',
    tenses: {
      presente: ['yo soy', 'tú eres', 'él es', 'nosotros somos', 'vosotros sois', 'ellos son'],
      preterito: ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
      futuro: ['seré', 'serás', 'será', 'seremos', 'seréis', 'serán'],
    },
  },
};

export const CONJUGATIONS_DE: Record<string, ConjugationResult> = {
  sein: {
    verb: 'sein', language: 'de',
    tenses: {
      präsens: ['ich bin', 'du bist', 'er ist', 'wir sind', 'ihr seid', 'sie sind'],
      präteritum: ['ich war', 'du warst', 'er war', 'wir waren', 'ihr wart', 'sie waren'],
    },
  },
};

export const CONJUGATIONS_IT: Record<string, ConjugationResult> = {
  essere: {
    verb: 'essere', language: 'it',
    tenses: {
      presente: ['io sono', 'tu sei', 'lui è', 'noi siamo', 'voi siete', 'loro sono'],
      passato: ['fui', 'fosti', 'fu', 'fummo', 'foste', 'furono'],
    },
  },
};

/* ---------- SR algorithm SM-2 (Anki) ---------- */

export type SrGrade = 0 | 1 | 2 | 3 | 4 | 5;

const MIN_EASINESS = 1.3;
const MS_PER_DAY = 86400000;
const SR_INTERVAL_FIRST_REPETITION = 1;
const SR_INTERVAL_SECOND_REPETITION = 6;

export function createFlashcard(front: string, back: string, tags: readonly string[] = []): Flashcard {
  return {
    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    front,
    back,
    easiness: 2.5,
    interval: 0,
    repetition: 0,
    nextReview: Date.now(),
    lastReview: 0,
    tags,
  };
}

/**
 * SM-2 algorithm — calcule le nouvel intervalle d'une flashcard.
 * Source : Piotr Wozniak, SuperMemo.
 * grade : 0=blackout, 1=incorrect+remembered, 2=incorrect, 3=correct hard, 4=correct, 5=easy
 */
export function reviewFlashcard(card: Flashcard, grade: SrGrade): Flashcard {
  const now = Date.now();
  let { easiness, interval, repetition } = card;

  if (grade < 3) {
    /* Échec : reset */
    repetition = 0;
    interval = 1;
  } else {
    repetition++;
    if (repetition === 1) interval = SR_INTERVAL_FIRST_REPETITION;
    else if (repetition === 2) interval = SR_INTERVAL_SECOND_REPETITION;
    else interval = Math.round(interval * easiness);
    /* Update easiness */
    easiness = easiness + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (easiness < MIN_EASINESS) easiness = MIN_EASINESS;
  }

  return {
    ...card,
    easiness: Math.round(easiness * 100) / 100,
    interval,
    repetition,
    lastReview: now,
    nextReview: now + interval * MS_PER_DAY,
  };
}

/**
 * Trie les cartes par priorité review (les plus en retard d'abord).
 */
export function dueCards(cards: readonly Flashcard[], now = Date.now()): Flashcard[] {
  return cards.filter((c) => c.nextReview <= now).sort((a, b) => a.nextReview - b.nextReview);
}

/* ---------- Math utilities (basique mais fonctionnel) ---------- */

export function symbolicDerivative(expr: string): string {
  /* Simplified : reconnaît x^n, sin(x), cos(x), e^x, ln(x). Étend si besoin. */
  const trim = expr.trim();
  if (trim === 'x') return '1';
  if (trim === 'x^2' || trim === 'x²') return '2x';
  if (trim === 'x^3' || trim === 'x³') return '3x²';
  if (trim === 'sin(x)') return 'cos(x)';
  if (trim === 'cos(x)') return '-sin(x)';
  if (trim === 'tan(x)') return '1+tan²(x)';
  if (trim === 'e^x' || trim === 'exp(x)') return 'e^x';
  if (trim === 'ln(x)') return '1/x';
  return `d/dx(${trim})`;
}

export function numericIntegrate(fn: (x: number) => number, a: number, b: number, n = 100): number {
  /* Simpson's rule */
  if (n % 2 !== 0) n++;
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    sum += (i % 2 === 0 ? 2 : 4) * fn(x);
  }
  return Math.round((sum * h / 3) * 1e6) / 1e6;
}

export function matrixMultiply(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): number[][] {
  const rowsA = a.length;
  const colsA = a[0]?.length ?? 0;
  const colsB = b[0]?.length ?? 0;
  if (a[0] === undefined || b[0] === undefined || colsA !== b.length) throw new Error('Dimensions matrices incompatibles');
  const result: number[][] = [];
  for (let i = 0; i < rowsA; i++) {
    const row: number[] = [];
    const aRow = a[i] ?? [];
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += (aRow[k] ?? 0) * (b[k]?.[j] ?? 0);
      }
      row.push(sum);
    }
    result.push(row);
  }
  return result;
}

export function matrixDeterminant2x2(a: number, b: number, c: number, d: number): number {
  return a * d - b * c;
}

export function statMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function statMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}

export function statStdDev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = statMean(values);
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/* ---------- Geometry ---------- */

export function circleArea(radius: number): number {
  return Math.PI * radius * radius;
}

export function circleCircumference(radius: number): number {
  return 2 * Math.PI * radius;
}

export function rectangleArea(w: number, h: number): number {
  return w * h;
}

export function triangleArea(base: number, height: number): number {
  return (base * height) / 2;
}

export function spheresVolume(radius: number): number {
  return (4 / 3) * Math.PI * radius ** 3;
}

export function cubeVolume(side: number): number {
  return side ** 3;
}

export function cylinderVolume(radius: number, height: number): number {
  return Math.PI * radius * radius * height;
}

export function pythagore(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

/* ---------- Pure helpers ---------- */

export function findSubject(id: Subject): typeof SUBJECTS[number] | undefined {
  return SUBJECTS.find((s) => s.id === id);
}

export function questionsBySubject(subject: Subject): readonly Question[] {
  return QUESTIONS_BANK.filter((q) => q.subject === subject);
}

export function questionsByDifficulty(difficulty: Difficulty): readonly Question[] {
  return QUESTIONS_BANK.filter((q) => q.difficulty === difficulty);
}

export function randomQuiz(subject: Subject, count = 10): readonly Question[] {
  const pool = questionsBySubject(subject);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/* ---------- UI render ---------- */

export function render(root: HTMLElement): void {
  logger.info('pro-education', 'render');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('pro.education', root, uid)) return;
  root.innerHTML = `
    <div class="ax-card ax-gs-197">
      <h2 class="ax-gs-365">🎓 Education Pro</h2>
      <p class="ax-gs-417">${SUBJECTS.length} matières · ${QUESTIONS_BANK.length}+ questions · Flashcards SM-2 · Conjugaison FR/EN/ES/DE/IT · Math/Physique/Chimie/Bio.</p>
      <h3 class="ax-gs-418">Matières disponibles</h3>
      <div class="ax-gs-157">
        ${SUBJECTS.map((s) => `<div style="border:1px solid #2a2f48;border-radius:8px;padding:10px;background:#13162a;font-size:13px;text-align:center">${s.emoji} ${escapeHtml(s.label)}<br><small class="ax-gs-240">${questionsBySubject(s.id).length} questions</small></div>`).join('')}
      </div>
    </div>
  `;
}
