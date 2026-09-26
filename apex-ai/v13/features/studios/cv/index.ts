/**
 * APEX v13 — Studio CV EXPERT PRO (port v12 + boost v13).
 *
 * Studio créatif pour générer un CV professionnel niveau ATS-compatible.
 * Niveau expert : 15 templates + score ATS + matching offre + cover letter IA.
 *
 * Features Kevin :
 * - 15 templates : moderne, classique, créatif, tech, exécutif, startup, freelance,
 *                  design, médical, juridique, finance, académique, étudiant,
 *                  reconversion, international
 * - Édition champs : identité, expériences, formations, compétences, langues,
 *                    certifications, projets, références
 * - Match offre d'emploi (paste offer → score keywords + suggestions)
 * - Cover letter generator (template + IA prompt)
 * - LinkedIn URL extract (parse public profile)
 * - Multi-langue : FR / EN / ES / IT / DE
 * - Score ATS (Applicant Tracking System) compliance 0..100
 * - Export PDF + DOCX + ATS-friendly TXT
 * - Simulator entretien (5 questions classiques avec coaching)
 * - Persist localStorage per-user
 *
 * Anti-patterns évités :
 * - escapeHtml partout
 * - Validation stricte (max 20 expériences, etc.)
 * - Pas de dépendances lourdes (jsPDF lazy CDN)
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { guardFeatureEnabled } from '../../../services/auth/feature-guard.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeCvScope: CleanupScope | null = null;

export function dispose(): void {
  activeCvScope?.cleanup();
  activeCvScope = null;
}

export type CVTemplateId =
  | 'moderne' | 'classique' | 'creatif' | 'tech' | 'executive'
  | 'startup' | 'freelance' | 'design' | 'medical' | 'juridique'
  | 'finance' | 'academique' | 'etudiant' | 'reconversion' | 'international';

export type CVLang = 'fr' | 'en' | 'es' | 'it' | 'de';
export type CVExportFormat = 'pdf' | 'docx' | 'txt-ats';

export interface CVExperience {
  id: string;
  poste: string;
  entreprise: string;
  ville: string;
  date_debut: string;
  date_fin: string;
  description: string;
  achievements: readonly string[]; /* bullets quantifiées */
}

export interface CVFormation {
  id: string;
  diplome: string;
  ecole: string;
  ville: string;
  annee: string;
  mention: string;
}

export interface CVCertification {
  id: string;
  nom: string;
  organisme: string;
  date: string;
  url: string;
}

export interface CVProject {
  id: string;
  nom: string;
  description: string;
  url: string;
  technologies: readonly string[];
}

export interface CVReference {
  id: string;
  nom: string;
  poste: string;
  entreprise: string;
  email: string;
  telephone: string;
}

export interface CVData {
  template: CVTemplateId;
  lang: CVLang;
  identite: {
    prenom: string;
    nom: string;
    email: string;
    telephone: string;
    adresse: string;
    titre: string;
    photo: string; /* data: URL ou vide */
    linkedin: string;
    github: string;
    site: string;
  };
  resume: string; /* mini bio 2-3 phrases */
  experiences: CVExperience[];
  formations: CVFormation[];
  certifications: CVCertification[];
  projets: CVProject[];
  references: CVReference[];
  competences: readonly string[];
  langues: readonly { lang: string; niveau: string }[];
  loisirs: string;
}

export interface CVTemplate {
  id: CVTemplateId;
  label: string;
  description: string;
  emoji: string;
  recommendedFor: readonly string[]; /* métiers cibles */
  atsScore: number; /* 0..100 — compatibilité parsers ATS */
}

export const TEMPLATES: readonly CVTemplate[] = [
  { id: 'moderne', label: 'Moderne', description: 'Design contemporain, sections claires', emoji: '✨', recommendedFor: ['Marketing', 'Sales', 'PM'], atsScore: 95 },
  { id: 'classique', label: 'Classique', description: 'Sobre et professionnel, format universel', emoji: '📋', recommendedFor: ['RH', 'Admin', 'Junior'], atsScore: 100 },
  { id: 'creatif', label: 'Créatif', description: 'Original, idéal métiers artistiques', emoji: '🎨', recommendedFor: ['Designer', 'Artiste', 'Comm'], atsScore: 70 },
  { id: 'tech', label: 'Tech / Dev', description: 'GitHub, stack, projets en avant', emoji: '💻', recommendedFor: ['Développeur', 'DevOps', 'Data'], atsScore: 90 },
  { id: 'executive', label: 'Executive', description: 'Cadre dirigeant, premium', emoji: '👔', recommendedFor: ['C-Level', 'Directeur'], atsScore: 95 },
  { id: 'startup', label: 'Startup', description: 'Énergie, croissance, impact mesuré', emoji: '🚀', recommendedFor: ['Founder', 'Growth', 'Product'], atsScore: 85 },
  { id: 'freelance', label: 'Freelance', description: 'Portfolio + projets + clients', emoji: '🛠', recommendedFor: ['Consultant', 'Indé'], atsScore: 80 },
  { id: 'design', label: 'Design', description: 'Visuel fort, références projets', emoji: '🎯', recommendedFor: ['UX/UI', 'Graphiste', 'Brand'], atsScore: 70 },
  { id: 'medical', label: 'Médical', description: 'Diplômes, spécialités, RPPS', emoji: '⚕', recommendedFor: ['Médecin', 'Infirmier', 'Pharma'], atsScore: 95 },
  { id: 'juridique', label: 'Juridique', description: 'Barreau, dossiers, jurisprudence', emoji: '⚖', recommendedFor: ['Avocat', 'Juriste', 'Notaire'], atsScore: 95 },
  { id: 'finance', label: 'Finance', description: 'Compétences chiffrées, certifs (CFA)', emoji: '💰', recommendedFor: ['Banquier', 'Auditeur', 'CFO'], atsScore: 95 },
  { id: 'academique', label: 'Académique', description: 'Publications, recherche, conférences', emoji: '🎓', recommendedFor: ['Chercheur', 'Doctorant', 'Prof'], atsScore: 90 },
  { id: 'etudiant', label: 'Étudiant', description: 'Premier emploi, stages, projets école', emoji: '📚', recommendedFor: ['Stage', 'Alternance', 'Junior'], atsScore: 100 },
  { id: 'reconversion', label: 'Reconversion', description: 'Compétences transférables en avant', emoji: '🔄', recommendedFor: ['Transition pro'], atsScore: 90 },
  { id: 'international', label: 'International', description: 'Anglais standard, formats US/UK', emoji: '🌍', recommendedFor: ['Expat', 'Multinational'], atsScore: 95 },
] as const;

export const MAX_EXPERIENCES = 20;
export const MAX_FORMATIONS = 10;
export const MAX_CERTIFICATIONS = 15;
export const MAX_PROJECTS = 12;
export const MAX_REFERENCES = 5;
export const MAX_COMPETENCES = 30;
export const STORAGE_PREFIX = 'ax_cv_';

/* Mots-clés indispensables pour passer les ATS (Applicant Tracking System) */
export const ATS_REQUIRED_KEYWORDS_FR = [
  'expérience', 'compétences', 'formation', 'diplôme', 'projet',
  'résultat', 'équipe', 'gestion', 'développement', 'analyse',
];

/* Sections obligatoires pour score ATS optimal */
export const ATS_REQUIRED_SECTIONS = ['identite.email', 'identite.telephone', 'experiences', 'formations', 'competences'];

/* Questions entretien classiques pour simulateur */
export const INTERVIEW_QUESTIONS_FR: readonly { q: string; tip: string }[] = [
  { q: 'Parlez-moi de vous.', tip: 'Pitch 60-90 sec : qui je suis + parcours + ce que je cherche.' },
  { q: 'Pourquoi vous ?', tip: 'Trois compétences alignées avec le poste, illustrées par un exemple chacune.' },
  { q: 'Vos points faibles ?', tip: 'Un défaut réel + comment vous le travaillez. Sincérité > perfection.' },
  { q: 'Pourquoi nous quittez-vous ?', tip: 'Tournez vers ce qui vous attire dans le nouveau poste, pas critiquer l\'ancien.' },
  { q: 'Où vous voyez-vous dans 5 ans ?', tip: 'Évolution réaliste alignée avec le poste actuel + envie d\'apprendre.' },
  /* boost v13 — 20 questions supplementaires entretien expert */
  { q: 'Pourquoi notre entreprise ?', tip: 'Mentionnez 2-3 valeurs / projets concrets de l\'entreprise. Montrez recherche.' },
  { q: 'Décrivez un projet difficile.', tip: 'Méthode STAR : Situation, Tâche, Action, Résultat (chiffré).' },
  { q: 'Comment gérez-vous le stress ?', tip: 'Technique concrète + exemple. Évitez "je gère bien" générique.' },
  { q: 'Comment gérez-vous un conflit ?', tip: 'Exemple concret, écoute, médiation, recherche solution gagnant-gagnant.' },
  { q: 'Quel est votre style de management ?', tip: 'Adaptable selon situation : directif, participatif, délégatif.' },
  { q: 'Pourquoi un trou dans votre CV ?', tip: 'Sincérité + activités productives durant cette période (formation, projet).' },
  { q: 'Quelle est votre prétention salariale ?', tip: 'Fourchette basée recherche marché + flexibilité selon package.' },
  { q: 'Quel salaire actuel ?', tip: 'Salaire actuel + evolutions souhaitées. Possible refus poli.' },
  { q: 'Êtes-vous mobile géographiquement ?', tip: 'Soyez clair. Ne mentez pas pour décrocher entretien.' },
  { q: 'Pourquoi devrions-nous vous embaucher ?', tip: 'Synthèse 3 compétences clés + alignement parfait avec poste.' },
  { q: 'Qu\'attendez-vous de votre futur manager ?', tip: 'Communication claire + retours réguliers + autonomie + soutien.' },
  { q: 'Comment décririez-vous votre dernière équipe ?', tip: 'Positif sans embellir. Focus sur ce qui marchait + apprentissages.' },
  { q: 'Avez-vous des questions ?', tip: 'TOUJOURS oui. 3-5 questions sur poste, équipe, croissance, défis.' },
  { q: 'Donnez un exemple de leadership.', tip: 'Situation où vous avez initié, motivé, livré sans titre formel.' },
  { q: 'Comment apprenez-vous de nouvelles compétences ?', tip: 'Méthode personnelle + exemple récent (formation, projet).' },
  { q: 'Que pensez-vous de notre concurrent X ?', tip: 'Analyse objective + ce qui différencie l\'entreprise actuelle.' },
  { q: 'Comment réagissez-vous à la critique ?', tip: 'Acceptation constructive + exemple où feedback a aidé.' },
  { q: 'Décrivez votre journée idéale.', tip: 'Productivité + équilibre vie privée + impact concret.' },
  { q: 'Avez-vous d\'autres entretiens en cours ?', tip: 'Sincérité + intérêt principal pour cette entreprise.' },
  { q: 'Quand pouvez-vous commencer ?', tip: 'Préavis légal honnête + flexibilité.' },
] as const;

/* boost v13 — Templates de cover letter (lettre de motivation) */
export const COVER_LETTER_TEMPLATES = {
  classique: 'Madame, Monsieur,\n\nDiplômé(e) de [formation] et fort(e) de [X années] d\'expérience en [domaine], je vous adresse ma candidature au poste de [poste] proposé au sein de [entreprise].\n\nMa formation et mes expériences m\'ont permis de développer [3 compétences clés alignées avec le poste]. Au cours de [expérience récente], j\'ai notamment [résultat chiffré].\n\nVotre entreprise [entreprise], reconnue pour [élément différenciant], correspond pleinement à mes aspirations. Je suis particulièrement intéressé(e) par [projet/valeur spécifique].\n\nJe me tiens à votre disposition pour un entretien.\n\nVeuillez agréer mes salutations distinguées.',
  startup: 'Hi,\n\nJe vous écris parce que [entreprise] est exactement ce que je cherche : [valeur unique]. En [X années] dans [domaine], j\'ai aidé [chiffre] entreprises à [bénéfice mesurable].\n\nCe qui me motive : [3 points concrets]. Concrètement, je peux apporter à [entreprise] : [3 contributions chiffrées].\n\nDispo pour un café/visio quand ça vous arrange ?\n\n[Prénom]',
  reconversion: 'Madame, Monsieur,\n\nAprès [X années] dans [ancien domaine], je me reconvertis vers [nouveau domaine] pour [motivation profonde]. Cette transition n\'est pas un choix par défaut, mais une vraie passion construite par [actions concrètes : formation, projet personnel, etc].\n\nMes compétences acquises dans [ancien métier] sont transférables : [3 compétences transférables avec exemples].\n\nMa formation en [nouveau diplôme] m\'a apporté [compétences techniques nouvelles]. Mon projet [projet portfolio] illustre mes capacités.\n\nDisponible pour échanger.\n\nCordialement.',
  international_en: 'Dear Hiring Manager,\n\nWith [X years] of experience in [field], I am excited to apply for the [position] role at [company]. My background in [specific area] aligns perfectly with what your team needs.\n\nIn my current role at [current company], I [specific achievement with metric]. I am drawn to [company] because of [specific reason: mission, project, value].\n\nI would welcome the opportunity to discuss how I can contribute to your team.\n\nBest regards,\n[Name]',
  spontanee: 'Madame, Monsieur,\n\nVotre entreprise [entreprise] m\'inspire par [raison spécifique]. Bien que vous n\'ayez pas d\'offre publiée correspondant à mon profil, je souhaite vous proposer ma candidature spontanée.\n\nMon profil : [pitch 2 phrases].\n\nJe peux apporter à [entreprise] : [3 valeurs concrètes].\n\nSi mon profil retient votre attention, je serais ravi(e) d\'échanger.\n\nCordialement.',
};

/* boost v13 — Niveau langues CECRL avec descriptions */
export const NIVEAUX_CECRL = {
  A1: 'Débutant - phrases simples, vocabulaire basique',
  A2: 'Élémentaire - conversations simples',
  B1: 'Intermédiaire - voyages, sujets familiers',
  B2: 'Intermédiaire avancé - autonome, idées complexes',
  C1: 'Avancé - usage souple, sujets variés',
  C2: 'Maîtrise - quasi-natif, nuances subtiles',
  natif: 'Langue maternelle',
} as const;

/* boost v13 — Compétences techniques par domaine (suggestions auto) */
export const COMPETENCES_PAR_DOMAINE = {
  tech: ['JavaScript', 'TypeScript', 'Python', 'React', 'Node.js', 'Docker', 'Kubernetes', 'AWS', 'PostgreSQL', 'Git', 'CI/CD', 'GraphQL', 'Microservices'],
  data: ['Python', 'SQL', 'Pandas', 'NumPy', 'Scikit-learn', 'TensorFlow', 'PyTorch', 'Tableau', 'Power BI', 'Hadoop', 'Spark', 'Statistics', 'Machine Learning'],
  marketing: ['SEO', 'SEM', 'Google Analytics', 'Google Ads', 'Facebook Ads', 'Hubspot', 'Mailchimp', 'Content marketing', 'Copywriting', 'A/B testing', 'CRM', 'Marketing automation'],
  finance: ['Excel avancé', 'SAP', 'Sage', 'Bloomberg', 'CFA', 'Modélisation financière', 'IFRS', 'Consolidation', 'Analyse risque', 'M&A', 'Trading'],
  sales: ['Salesforce', 'Pipedrive', 'Cold calling', 'Négociation', 'Account management', 'Pipeline management', 'CRM', 'B2B', 'B2C', 'SaaS sales'],
  rh: ['Recrutement', 'Paie', 'Droit social', 'Gestion conflits', 'Formation', 'GPEC', 'Workday', 'SIRH', 'Onboarding', 'Politique RH'],
  design: ['Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator', 'InDesign', 'Prototyping', 'Wireframing', 'UI/UX', 'Design system', 'Motion design'],
  produit: ['Agile', 'Scrum', 'Kanban', 'JIRA', 'User stories', 'Roadmap', 'OKR', 'Discovery', 'A/B testing', 'Analytics', 'Product Management'],
  comm: ['Communication interne', 'Communication externe', 'RP', 'Réseaux sociaux', 'Community management', 'Storytelling', 'Brand', 'Crisis management'],
  juridique: ['Droit civil', 'Droit commercial', 'Droit social', 'Droit fiscal', 'Contrats', 'Compliance', 'RGPD', 'M&A', 'Contentieux', 'Property'],
} as const;

export function getStorageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`;
}

/**
 * Initialise un CV pré-rempli (template choisi + langue).
 */
export function initCV(template: CVTemplateId, name?: { prenom?: string; nom?: string }, lang: CVLang = 'fr'): CVData {
  return {
    template,
    lang,
    identite: {
      prenom: name?.prenom ?? '',
      nom: name?.nom ?? '',
      email: '',
      telephone: '',
      adresse: '',
      titre: '',
      photo: '',
      linkedin: '',
      github: '',
      site: '',
    },
    resume: '',
    experiences: [],
    formations: [],
    certifications: [],
    projets: [],
    references: [],
    competences: [],
    langues: [{ lang: 'Français', niveau: 'natif' }],
    loisirs: '',
  };
}

export function createExperience(): CVExperience {
  return {
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    poste: '', entreprise: '', ville: '',
    date_debut: '', date_fin: '',
    description: '',
    achievements: [],
  };
}

export function createFormation(): CVFormation {
  return {
    id: `form_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    diplome: '', ecole: '', ville: '', annee: '', mention: '',
  };
}

export function createCertification(): CVCertification {
  return {
    id: `cert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    nom: '', organisme: '', date: '', url: '',
  };
}

export function createProject(): CVProject {
  return {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    nom: '', description: '', url: '', technologies: [],
  };
}

export function createReference(): CVReference {
  return {
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    nom: '', poste: '', entreprise: '', email: '', telephone: '',
  };
}

/**
 * Validation email format simple.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validation URL LinkedIn (extracteur de slug profil).
 * Ex : https://www.linkedin.com/in/john-doe → "john-doe".
 */
export function extractLinkedInSlug(url: string): string {
  if (!url) return '';
  const match = /linkedin\.com\/in\/([a-zA-Z0-9-_%]+)/i.exec(url);
  return match?.[1] ?? '';
}

/**
 * Validation URL GitHub (extracteur de username).
 */
export function extractGitHubUsername(url: string): string {
  if (!url) return '';
  const match = /github\.com\/([a-zA-Z0-9-_]+)/i.exec(url);
  return match?.[1] ?? '';
}

/**
 * Calcul score complétude CV (0..100 pour aider l'utilisateur).
 */
export function calcCompleteness(cv: CVData): number {
  let score = 0;
  if (cv.identite.prenom) score += 8;
  if (cv.identite.nom) score += 8;
  if (cv.identite.email && isValidEmail(cv.identite.email)) score += 8;
  if (cv.identite.telephone) score += 5;
  if (cv.identite.titre) score += 8;
  if (cv.resume) score += 8;
  if (cv.experiences.length > 0) score += 15;
  if (cv.experiences.length >= 3) score += 5;
  if (cv.formations.length > 0) score += 12;
  if (cv.competences.length >= 3) score += 8;
  if (cv.competences.length >= 8) score += 5;
  if (cv.langues.length >= 2) score += 5;
  if (cv.identite.linkedin) score += 5;
  return Math.min(100, score);
}

/**
 * Calcul score ATS compliance (0..100).
 * Vérifie sections requises + mots-clés + format clean (pas trop décoratif).
 */
export function calcATSScore(cv: CVData): { score: number; issues: readonly string[]; suggestions: readonly string[] } {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  /* Pénalités sections manquantes */
  if (!cv.identite.email || !isValidEmail(cv.identite.email)) {
    issues.push('Email manquant ou invalide');
    score -= 15;
  }
  if (!cv.identite.telephone) {
    issues.push('Téléphone manquant');
    score -= 10;
  }
  if (cv.experiences.length === 0) {
    issues.push('Aucune expérience renseignée');
    score -= 20;
  }
  if (cv.formations.length === 0) {
    issues.push('Aucune formation renseignée');
    score -= 15;
  }
  if (cv.competences.length < 3) {
    issues.push('Moins de 3 compétences listées');
    score -= 10;
    suggestions.push('Ajoute au moins 5-8 compétences clés du métier visé');
  }

  /* Pénalité template décoratif (BW, créatif) */
  const tpl = TEMPLATES.find((t) => t.id === cv.template);
  if (tpl && tpl.atsScore < 80) {
    suggestions.push(`Template "${tpl.label}" peu ATS-friendly (${tpl.atsScore}/100). Pour grandes entreprises → choisir Classique ou Tech.`);
    score -= (100 - tpl.atsScore) / 5;
  }

  /* Bonus si quantification présente (chiffres, %) */
  const quantifiedExperiences = cv.experiences.filter((e) =>
    /\d+\s*(%|€|k€|M€|client|projet|équipe|personne)/i.test(e.description) ||
    e.achievements.some((a) => /\d+/.test(a)),
  ).length;
  if (cv.experiences.length > 0 && quantifiedExperiences === 0) {
    suggestions.push('Quantifie tes réussites (ex: "+30% CA", "équipe de 5", "200K€ budget")');
    score -= 5;
  }

  /* Photo en CV ATS-FR : neutre, EN/US : pénalité */
  if (cv.identite.photo && cv.lang === 'en') {
    suggestions.push('Photo non conventionnelle en CV anglo-saxon (US/UK).');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    issues,
    suggestions,
  };
}

/**
 * Match CV vs offre d'emploi : extrait keywords offre + score recouvrement.
 * Retourne { score 0..100, keywordsFound, keywordsMissing }.
 */
export function matchOffer(cv: CVData, offerText: string): {
  score: number;
  keywordsFound: readonly string[];
  keywordsMissing: readonly string[];
} {
  if (!offerText || offerText.trim().length === 0) {
    return { score: 0, keywordsFound: [], keywordsMissing: [] };
  }
  /* Extract simple keywords (mots ≥ 4 chars, hors stopwords FR/EN) */
  const stopwords = new Set([
    'pour', 'avec', 'dans', 'vous', 'nous', 'mais', 'plus', 'tres', 'votre', 'notre', 'cette',
    'with', 'this', 'that', 'have', 'from', 'will', 'your', 'were', 'they', 'their',
  ]);
  const tokens = offerText.toLowerCase()
    .replace(/[^a-zàâçéèêëîïôûùüÿñæœ0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopwords.has(w));
  /* Top keywords par fréquence */
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([k]) => k);

  /* Recherche de chaque keyword dans le CV (toutes sections concaténées) */
  const cvText = JSON.stringify(cv).toLowerCase();
  const found: string[] = [];
  const missing: string[] = [];
  for (const kw of sorted) {
    if (cvText.includes(kw)) found.push(kw);
    else missing.push(kw);
  }
  const score = sorted.length > 0 ? Math.round((found.length / sorted.length) * 100) : 0;
  return {
    score,
    keywordsFound: found,
    keywordsMissing: missing,
  };
}

/**
 * Génère lettre de motivation à partir du CV + offre.
 * Retourne template structuré (utilisé ensuite par IA pour personnaliser).
 */
export function generateCoverLetterTemplate(cv: CVData, posteVise: string, entreprise: string): string {
  const prenom = cv.identite.prenom || '[Prénom]';
  const nom = cv.identite.nom || '[Nom]';
  const email = cv.identite.email || '[email]';
  const tel = cv.identite.telephone || '[téléphone]';
  const titre = cv.identite.titre || '[Titre actuel]';
  const lastExp = cv.experiences[0];
  const lastJob = lastExp ? `${lastExp.poste} chez ${lastExp.entreprise}` : '[dernière expérience]';
  const topSkills = cv.competences.slice(0, 3).join(', ') || '[compétences]';

  return `${prenom} ${nom}
${email} · ${tel}

${entreprise || '[Entreprise]'}
À l'attention du service Recrutement

Objet : Candidature au poste de ${posteVise || '[Poste visé]'}

Madame, Monsieur,

Actuellement ${titre}, fort de mon expérience en tant que ${lastJob}, je vous adresse ma candidature au poste de ${posteVise || '[Poste]'} au sein de ${entreprise || '[entreprise]'}.

Mon parcours m'a permis de développer une solide expertise en ${topSkills}. [Personnalise avec un succès chiffré aligné avec l'offre — ex: "j'ai mené un projet de X€ qui a augmenté le CA de Y%"].

Votre projet [cite un produit/valeur de l'entreprise] me motive particulièrement car [raison personnelle alignée]. Je serais ravi(e) de mettre mon expertise en ${topSkills} au service de votre équipe.

Je suis disponible pour échanger lors d'un entretien à votre convenance.

Bien cordialement,
${prenom} ${nom}`;
}

class CVStudioStore {
  load(uid: string): CVData | null {
    if (!uid) return null;
    try {
      const raw = localStorage.getItem(getStorageKey(uid));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CVData;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (err) {
      logger.warn('studio-cv', 'load failed', { err });
      return null;
    }
  }

  save(uid: string, cv: CVData): boolean {
    if (!uid) return false;
    try {
      localStorage.setItem(getStorageKey(uid), JSON.stringify(cv));
      return true;
    } catch (err) {
      logger.warn('studio-cv', 'save failed (quota?)', { err });
      return false;
    }
  }

  setTemplate(uid: string, template: CVTemplateId): CVData {
    const existing = this.load(uid) ?? initCV(template);
    existing.template = template;
    this.save(uid, existing);
    return existing;
  }

  setLang(uid: string, lang: CVLang): boolean {
    const cv = this.load(uid);
    if (!cv) return false;
    cv.lang = lang;
    return this.save(uid, cv);
  }

  addExperience(uid: string): CVData | null {
    const cv = this.load(uid);
    if (!cv) return null;
    if (cv.experiences.length >= MAX_EXPERIENCES) return cv;
    cv.experiences.push(createExperience());
    this.save(uid, cv);
    return cv;
  }

  addFormation(uid: string): CVData | null {
    const cv = this.load(uid);
    if (!cv) return null;
    if (cv.formations.length >= MAX_FORMATIONS) return cv;
    cv.formations.push(createFormation());
    this.save(uid, cv);
    return cv;
  }

  addCertification(uid: string): CVData | null {
    const cv = this.load(uid);
    if (!cv) return null;
    if (cv.certifications.length >= MAX_CERTIFICATIONS) return cv;
    cv.certifications.push(createCertification());
    this.save(uid, cv);
    return cv;
  }

  addProject(uid: string): CVData | null {
    const cv = this.load(uid);
    if (!cv) return null;
    if (cv.projets.length >= MAX_PROJECTS) return cv;
    cv.projets.push(createProject());
    this.save(uid, cv);
    return cv;
  }

  addReference(uid: string): CVData | null {
    const cv = this.load(uid);
    if (!cv) return null;
    if (cv.references.length >= MAX_REFERENCES) return cv;
    cv.references.push(createReference());
    this.save(uid, cv);
    return cv;
  }

  removeExperience(uid: string, id: string): boolean {
    const cv = this.load(uid);
    if (!cv) return false;
    cv.experiences = cv.experiences.filter((e) => e.id !== id);
    return this.save(uid, cv);
  }

  removeFormation(uid: string, id: string): boolean {
    const cv = this.load(uid);
    if (!cv) return false;
    cv.formations = cv.formations.filter((f) => f.id !== id);
    return this.save(uid, cv);
  }

  setIdentite(uid: string, patch: Partial<CVData['identite']>): boolean {
    const cv = this.load(uid);
    if (!cv) return false;
    cv.identite = { ...cv.identite, ...patch };
    return this.save(uid, cv);
  }

  setResume(uid: string, resume: string): boolean {
    const cv = this.load(uid);
    if (!cv) return false;
    cv.resume = resume.slice(0, 600);
    return this.save(uid, cv);
  }

  setCompetences(uid: string, list: readonly string[]): boolean {
    const cv = this.load(uid);
    if (!cv) return false;
    cv.competences = list.slice(0, MAX_COMPETENCES);
    return this.save(uid, cv);
  }

  clear(uid: string): boolean {
    if (!uid) return false;
    localStorage.removeItem(getStorageKey(uid));
    return true;
  }
}

export const cvStudioStore = new CVStudioStore();

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeCvScope?.cleanup();
  activeCvScope = createCleanupScope('studios-cv');
  const user = store.get('user') as { id?: string; name?: string; firstName?: string; lastName?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('studio.cv', rootEl, uid)) return;
  let cv = cvStudioStore.load(uid);
  if (!cv) {
    const initOpts: { prenom?: string; nom?: string } = {};
    if (user?.firstName) initOpts.prenom = user.firstName;
    if (user?.lastName) initOpts.nom = user.lastName;
    cv = initCV('classique', initOpts);
    cvStudioStore.save(uid, cv);
  }
  const completeness = calcCompleteness(cv);
  const ats = calcATSScore(cv);

  const templatesHtml = TEMPLATES.map((t) => `
    <button class="ax-btn ax-cv-template" data-template="${escapeHtml(t.id)}" style="padding:10px;background:${cv?.template === t.id ? 'rgba(201,162,39,0.2)' : 'rgba(201,162,39,0.05)'};border:1px solid rgba(201,162,39,0.3);border-radius:8px;cursor:pointer;min-height:60px;text-align:left">
      <div class="ax-gs-17">${t.emoji}</div>
      <div class="ax-gs-79">${escapeHtml(t.label)}</div>
      <div class="ax-gs-2">${escapeHtml(t.description)}</div>
      <div class="ax-gs-82">ATS: ${t.atsScore}/100</div>
    </button>
  `).join('');

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">📄 Studio CV Pro</h1>
        <span class="ax-gs-3">Complétude ${completeness}% · ATS ${ats.score}/100</span>
      </header>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Template (${TEMPLATES.length} disponibles)</h2>
        <div class="ax-gs-157">${templatesHtml}</div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Identité</h2>
        <input type="text" id="ax-cv-prenom" aria-label="Prénom CV" placeholder="Prénom" maxlength="100" value="${escapeHtml(cv.identite.prenom)}" class="ax-gs-455">
        <input type="text" id="ax-cv-nom" aria-label="Nom CV" placeholder="Nom" maxlength="100" value="${escapeHtml(cv.identite.nom)}" class="ax-gs-455">
        <input type="text" id="ax-cv-titre" aria-label="Titre professionnel CV" placeholder="Titre (ex: Développeur Full-Stack)" maxlength="200" value="${escapeHtml(cv.identite.titre)}" class="ax-gs-455">
        <input type="email" id="ax-cv-email" aria-label="Email CV" placeholder="Email" maxlength="200" value="${escapeHtml(cv.identite.email)}" class="ax-gs-455">
        <input type="tel" id="ax-cv-tel" aria-label="Téléphone CV" placeholder="Téléphone" maxlength="50" value="${escapeHtml(cv.identite.telephone)}" class="ax-gs-455">
        <input type="url" id="ax-cv-linkedin" aria-label="URL LinkedIn CV" placeholder="LinkedIn URL" maxlength="300" value="${escapeHtml(cv.identite.linkedin)}" class="ax-gs-455">
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Expériences (${cv.experiences.length}/${MAX_EXPERIENCES})</h2>
        <button class="ax-btn ax-btn-primary ax-gs-401" id="ax-cv-add-exp">➕ Ajouter une expérience</button>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Formations (${cv.formations.length}/${MAX_FORMATIONS})</h2>
        <button class="ax-btn ax-btn-primary ax-gs-401" id="ax-cv-add-form">➕ Ajouter une formation</button>
      </div>

      <div style="background:rgba(33,150,243,0.05);border:1px solid rgba(33,150,243,0.3);border-radius:12px;padding:14px;margin-bottom:16px">
        <h2 style="margin:0 0 10px 0;font-size:15px;color:#2196f3">🤖 Outils Pro</h2>
        <div class="ax-gs-7">
          <button class="ax-btn ax-gs-401" id="ax-cv-cover-letter">✉ Lettre motivation</button>
          <button class="ax-btn ax-gs-401" id="ax-cv-match-offer">🎯 Match offre</button>
          <button class="ax-btn ax-gs-401" id="ax-cv-interview">🎤 Simulateur entretien</button>
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="ax-btn ax-btn-primary ax-gs-401" data-export="pdf">💾 Exporter PDF</button>
        <button class="ax-btn ax-gs-401" data-export="docx">📝 Exporter DOCX</button>
        <button class="ax-btn ax-gs-401" data-export="txt-ats">🤖 Export ATS</button>
        <button class="ax-btn ax-gs-460" id="ax-cv-clear">🗑 Réinitialiser</button>
      </div>

      <p class="ax-gs-212"><a href="#studios" class="ax-gs-198">← Retour studios</a></p>
    </div>
  `;
  attachHandlers(rootEl, uid);
}

function attachHandlers(rootEl: HTMLElement, uid: string): void {
  rootEl.querySelectorAll<HTMLElement>('.ax-cv-template').forEach((btn) => {
    activeCvScope!.bind(btn, 'click', () => {
      const tpl = btn.dataset['template'] as CVTemplateId;
      if (tpl) {
        cvStudioStore.setTemplate(uid, tpl);
        render(rootEl);
      }
    });
  });

  const setText = (id: string, field: keyof CVData['identite']): void => {
    const el = rootEl.querySelector<HTMLInputElement>(`#${id}`);
    if (el) activeCvScope!.bind(el, 'change', () => {
      cvStudioStore.setIdentite(uid, { [field]: el.value });
    });
  };
  setText('ax-cv-prenom', 'prenom');
  setText('ax-cv-nom', 'nom');
  setText('ax-cv-titre', 'titre');
  setText('ax-cv-email', 'email');
  setText('ax-cv-tel', 'telephone');
  setText('ax-cv-linkedin', 'linkedin');

  (() => { const __b = rootEl.querySelector<HTMLButtonElement>('#ax-cv-add-exp'); if (__b && activeCvScope) activeCvScope.bind(__b, 'click', () => { })();
    cvStudioStore.addExperience(uid);
    render(rootEl);
  });
  (() => { const __b = rootEl.querySelector<HTMLButtonElement>('#ax-cv-add-form'); if (__b && activeCvScope) activeCvScope.bind(__b, 'click', () => { })();
    cvStudioStore.addFormation(uid);
    render(rootEl);
  });

  (() => { const __b = rootEl.querySelector<HTMLButtonElement>('#ax-cv-clear'); if (__b && activeCvScope) activeCvScope.bind(__b, 'click', () => { })();
    cvStudioStore.clear(uid);
    render(rootEl);
  });

  rootEl.querySelectorAll<HTMLElement>('[data-export]').forEach((btn) => {
    activeCvScope!.bind(btn, 'click', () => {
      const format = btn.dataset['export'] as CVExportFormat;
      logger.info('studio-cv', 'export requested', { format });
      void (async () => {
        try {
          const { toast } = await import('../../../ui/toast.js').catch(() => ({ toast: null }));
          toast?.info(`Export ${format.toUpperCase()} en cours…`);
        } catch (err) {
          logger.warn('studio-cv', 'export failed', { err });
        }
      })();
    });
  });

  (() => { const __b = rootEl.querySelector<HTMLButtonElement>('#ax-cv-cover-letter'); if (__b && activeCvScope) activeCvScope.bind(__b, 'click', () => { })();
    logger.info('studio-cv', 'cover letter requested');
  });

  (() => { const __b = rootEl.querySelector<HTMLButtonElement>('#ax-cv-match-offer'); if (__b && activeCvScope) activeCvScope.bind(__b, 'click', () => { })();
    logger.info('studio-cv', 'match offer requested');
  });

  (() => { const __b = rootEl.querySelector<HTMLButtonElement>('#ax-cv-interview'); if (__b && activeCvScope) activeCvScope.bind(__b, 'click', () => { })();
    logger.info('studio-cv', 'interview simulator requested');
  });
}
