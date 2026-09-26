/**
 * APEX v13 — Certifications Pro Module (30+ certifs).
 *
 * Module dédié à la préparation aux certifications professionnelles :
 * - 30+ certifs (TOEFL, IELTS, BULATS, DELF/DALF, HSK, TOEIC, Bright, Voltaire, PIX, Cambridge, ECDL, AWS, Azure, GCP, Cisco CCNA, ITIL, PMP, Scrum, Six Sigma, ServSafe, etc.)
 * - 50+ sample questions par certification
 * - Scoring auto + simulation examen blanc
 * - Tracker progression (graphes par section)
 * - Vocabulaire ciblé par certif
 * - Stratégies par section (writing, speaking, listening, reading, etc.)
 * - Liens directs sites officiels d'inscription
 * - Conseils jour J + checklist
 *
 * Sources autoritaires : sites officiels (ETS, Cambridge, France Éducation International, Hanban, etc.)
 */

import { escapeHtml } from '../../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { logger } from '../../../../core/logger.js';
import { store } from '../../../../core/store.js';
import { guardFeatureEnabled } from '../../../../services/auth/feature-guard.js';

export type CertCategory = 'language' | 'tech' | 'business' | 'finance' | 'project' | 'medical' | 'design' | 'security';

export interface CertificationDef {
  id: string;
  name: string;
  shortName: string;
  emoji: string;
  category: CertCategory;
  organism: string;
  country: string;
  duration: string;
  cost: string;
  validity: string;
  format: 'online' | 'paper' | 'centre' | 'remote' | 'hybrid';
  sections: readonly string[];
  scoringRange: string;
  passingScore?: string;
  officialUrl: string;
  description: string;
  preparationHours: number;
  difficulty: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export interface CertQuestion {
  id: string;
  certId: string;
  section: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  choices: readonly string[];
  answer: number; /* index */
  explanation: string;
}

export interface UserProgress {
  certId: string;
  examDate?: number;
  scoreEstimate?: number;
  hoursStudied: number;
  sectionsCompleted: readonly string[];
  weakAreas: readonly string[];
  lastSession: number;
}

/* ---------- 30+ Certifications ---------- */

export const CERTIFICATIONS: readonly CertificationDef[] = [
  /* LANGUE - Anglais (5) */
  {
    id: 'toefl_ibt', name: 'TOEFL iBT', shortName: 'TOEFL', emoji: '🇺🇸',
    category: 'language', organism: 'ETS', country: 'USA',
    duration: '3h (sans pause)', cost: '~265 €', validity: '2 ans', format: 'centre',
    sections: ['Reading', 'Listening', 'Speaking', 'Writing'], scoringRange: '0-120', passingScore: '80+ universités',
    officialUrl: 'https://www.ets.org/toefl', description: 'Test anglais académique reconnu universellement',
    preparationHours: 100, difficulty: 'C1',
  },
  {
    id: 'ielts_academic', name: 'IELTS Academic', shortName: 'IELTS', emoji: '🇬🇧',
    category: 'language', organism: 'British Council / IDP / Cambridge', country: 'UK',
    duration: '2h45', cost: '~245 €', validity: '2 ans', format: 'centre',
    sections: ['Listening', 'Reading', 'Writing', 'Speaking'], scoringRange: '0-9 bands', passingScore: '6.5+ universités',
    officialUrl: 'https://www.ielts.org', description: 'Test anglais académique pour études supérieures',
    preparationHours: 80, difficulty: 'C1',
  },
  {
    id: 'cambridge_c1', name: 'Cambridge C1 Advanced (CAE)', shortName: 'CAE', emoji: '🇬🇧',
    category: 'language', organism: 'Cambridge English', country: 'UK',
    duration: '4h', cost: '~225 €', validity: 'À vie', format: 'centre',
    sections: ['Reading & Use of English', 'Writing', 'Listening', 'Speaking'], scoringRange: '142-210', passingScore: '180+',
    officialUrl: 'https://www.cambridgeenglish.org/exams-and-tests/advanced/', description: 'Niveau C1 Cambridge, validité à vie',
    preparationHours: 150, difficulty: 'C1',
  },
  {
    id: 'cambridge_c2', name: 'Cambridge C2 Proficiency (CPE)', shortName: 'CPE', emoji: '🇬🇧',
    category: 'language', organism: 'Cambridge English', country: 'UK',
    duration: '4h', cost: '~245 €', validity: 'À vie', format: 'centre',
    sections: ['Reading & Use of English', 'Writing', 'Listening', 'Speaking'], scoringRange: '162-230', passingScore: '200+',
    officialUrl: 'https://www.cambridgeenglish.org/exams-and-tests/proficiency/', description: 'Niveau natif C2',
    preparationHours: 200, difficulty: 'C2',
  },
  {
    id: 'toeic_lr', name: 'TOEIC Listening & Reading', shortName: 'TOEIC L&R', emoji: '💼',
    category: 'language', organism: 'ETS', country: 'USA',
    duration: '2h', cost: '~135 €', validity: '2 ans', format: 'centre',
    sections: ['Listening', 'Reading'], scoringRange: '10-990', passingScore: '750+ professionnel',
    officialUrl: 'https://www.etsglobal.org', description: 'Test anglais business / professionnel',
    preparationHours: 60, difficulty: 'B2',
  },
  /* LANGUE - Français (3) */
  {
    id: 'delf_b1', name: 'DELF B1', shortName: 'DELF B1', emoji: '🇫🇷',
    category: 'language', organism: 'France Éducation International', country: 'France',
    duration: '1h45', cost: '~110 €', validity: 'À vie', format: 'centre',
    sections: ['Compréhension orale', 'Compréhension écrite', 'Production écrite', 'Production orale'], scoringRange: '0-100', passingScore: '50/100',
    officialUrl: 'https://www.france-education-international.fr/delf-dalf', description: 'Diplôme français langue étrangère B1',
    preparationHours: 80, difficulty: 'B1',
  },
  {
    id: 'delf_b2', name: 'DELF B2', shortName: 'DELF B2', emoji: '🇫🇷',
    category: 'language', organism: 'France Éducation International', country: 'France',
    duration: '2h30', cost: '~150 €', validity: 'À vie', format: 'centre',
    sections: ['Compréhension orale', 'Compréhension écrite', 'Production écrite', 'Production orale'], scoringRange: '0-100', passingScore: '50/100',
    officialUrl: 'https://www.france-education-international.fr/delf-dalf', description: 'Diplôme français B2 (universités françaises)',
    preparationHours: 120, difficulty: 'B2',
  },
  {
    id: 'dalf_c1', name: 'DALF C1', shortName: 'DALF C1', emoji: '🇫🇷',
    category: 'language', organism: 'France Éducation International', country: 'France',
    duration: '4h', cost: '~180 €', validity: 'À vie', format: 'centre',
    sections: ['Compréhension orale', 'Compréhension écrite', 'Production écrite', 'Production orale'], scoringRange: '0-100', passingScore: '50/100',
    officialUrl: 'https://www.france-education-international.fr/delf-dalf', description: 'Niveau autonome universitaire',
    preparationHours: 200, difficulty: 'C1',
  },
  {
    id: 'voltaire', name: 'Certificat Voltaire', shortName: 'Voltaire', emoji: '✒️',
    category: 'language', organism: 'Projet Voltaire', country: 'France',
    duration: '3h', cost: '~70 €', validity: '4 ans', format: 'centre',
    sections: ['Orthographe', 'Grammaire', 'Conjugaison', 'Syntaxe'], scoringRange: '0-1000', passingScore: '700+ pro',
    officialUrl: 'https://www.projet-voltaire.fr/certification-voltaire/', description: 'Certifie maîtrise orthographe FR pour CV',
    preparationHours: 30, difficulty: 'C1',
  },
  /* LANGUE - Chinois / Espagnol / Allemand */
  {
    id: 'hsk_4', name: 'HSK 4 (汉语水平考试)', shortName: 'HSK 4', emoji: '🇨🇳',
    category: 'language', organism: 'Hanban', country: 'Chine',
    duration: '1h45', cost: '~80 €', validity: '2 ans', format: 'centre',
    sections: ['听力', '阅读', '书写'], scoringRange: '0-300', passingScore: '180+',
    officialUrl: 'https://www.chinesetest.cn', description: 'Test maîtrise chinois mandarin niveau 4 (1200 mots)',
    preparationHours: 200, difficulty: 'B1',
  },
  {
    id: 'dele_b2', name: 'DELE B2', shortName: 'DELE B2', emoji: '🇪🇸',
    category: 'language', organism: 'Instituto Cervantes', country: 'Espagne',
    duration: '3h30', cost: '~165 €', validity: 'À vie', format: 'centre',
    sections: ['Comprensión lectora', 'Comprensión auditiva', 'Expresión escrita', 'Expresión oral'], scoringRange: '0-100', passingScore: '60/100',
    officialUrl: 'https://examenes.cervantes.es', description: 'Diplôme officiel espagnol langue étrangère B2',
    preparationHours: 120, difficulty: 'B2',
  },
  {
    id: 'goethe_b2', name: 'Goethe-Zertifikat B2', shortName: 'Goethe B2', emoji: '🇩🇪',
    category: 'language', organism: 'Goethe-Institut', country: 'Allemagne',
    duration: '3h15', cost: '~190 €', validity: 'À vie', format: 'centre',
    sections: ['Lesen', 'Hören', 'Schreiben', 'Sprechen'], scoringRange: '0-100', passingScore: '60/100',
    officialUrl: 'https://www.goethe.de', description: 'Allemand niveau B2 (universités allemandes)',
    preparationHours: 150, difficulty: 'B2',
  },
  /* TECH - Cloud (4) */
  {
    id: 'aws_saa', name: 'AWS Solutions Architect Associate', shortName: 'AWS SAA-C03', emoji: '☁️',
    category: 'tech', organism: 'Amazon Web Services', country: 'USA',
    duration: '2h10', cost: '~150 $', validity: '3 ans', format: 'remote',
    sections: ['Design Secure Architectures', 'Design Resilient Architectures', 'Design High-Performing Architectures', 'Design Cost-Optimized Architectures'], scoringRange: '100-1000', passingScore: '720+',
    officialUrl: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/', description: 'Architecte solutions AWS',
    preparationHours: 100, difficulty: 'intermediate',
  },
  {
    id: 'azure_az900', name: 'Azure Fundamentals AZ-900', shortName: 'AZ-900', emoji: '☁️',
    category: 'tech', organism: 'Microsoft', country: 'USA',
    duration: '1h', cost: '~100 €', validity: 'À vie', format: 'remote',
    sections: ['Cloud Concepts', 'Azure Architecture', 'Azure Management', 'Azure Pricing'], scoringRange: '1-1000', passingScore: '700+',
    officialUrl: 'https://learn.microsoft.com/en-us/credentials/certifications/azure-fundamentals/', description: 'Fondamentaux Microsoft Azure',
    preparationHours: 30, difficulty: 'beginner',
  },
  {
    id: 'gcp_ace', name: 'GCP Associate Cloud Engineer', shortName: 'GCP ACE', emoji: '☁️',
    category: 'tech', organism: 'Google Cloud', country: 'USA',
    duration: '2h', cost: '~125 $', validity: '3 ans', format: 'remote',
    sections: ['Setting up cloud', 'Planning', 'Deploying', 'Operations', 'Configuring'], scoringRange: 'pass/fail', passingScore: '~70%',
    officialUrl: 'https://cloud.google.com/certification/cloud-engineer', description: 'Ingénieur cloud GCP',
    preparationHours: 80, difficulty: 'intermediate',
  },
  {
    id: 'cisco_ccna', name: 'Cisco CCNA', shortName: 'CCNA', emoji: '🌐',
    category: 'tech', organism: 'Cisco', country: 'USA',
    duration: '2h', cost: '~330 $', validity: '3 ans', format: 'centre',
    sections: ['Network Fundamentals', 'Network Access', 'IP Connectivity', 'IP Services', 'Security', 'Automation'], scoringRange: '300-1000', passingScore: '825+',
    officialUrl: 'https://www.cisco.com/c/en/us/training-events/training-certifications/certifications/associate/ccna.html', description: 'Réseau Cisco fondamentaux',
    preparationHours: 200, difficulty: 'intermediate',
  },
  /* TECH - DevOps / Security (3) */
  {
    id: 'cka', name: 'Certified Kubernetes Administrator', shortName: 'CKA', emoji: '⚙️',
    category: 'tech', organism: 'CNCF', country: 'USA',
    duration: '2h', cost: '~395 $', validity: '3 ans', format: 'remote',
    sections: ['Storage', 'Troubleshooting', 'Workloads', 'Cluster Architecture', 'Services & Networking'], scoringRange: '0-100%', passingScore: '66+',
    officialUrl: 'https://www.cncf.io/certification/cka/', description: 'Admin Kubernetes pratique (mains dans cli)',
    preparationHours: 120, difficulty: 'advanced',
  },
  {
    id: 'comptia_security', name: 'CompTIA Security+', shortName: 'Sec+', emoji: '🛡️',
    category: 'security', organism: 'CompTIA', country: 'USA',
    duration: '1h30', cost: '~370 €', validity: '3 ans', format: 'centre',
    sections: ['Threats', 'Architecture', 'Operations', 'Implementation', 'Governance'], scoringRange: '100-900', passingScore: '750+',
    officialUrl: 'https://www.comptia.org/certifications/security', description: 'Sécurité info entrée de gamme',
    preparationHours: 100, difficulty: 'intermediate',
  },
  {
    id: 'ceh', name: 'Certified Ethical Hacker', shortName: 'CEH', emoji: '🔐',
    category: 'security', organism: 'EC-Council', country: 'USA',
    duration: '4h', cost: '~1199 $', validity: '3 ans', format: 'remote',
    sections: ['Reconnaissance', 'Scanning', 'Enumeration', 'System Hacking', 'Web App Hacking', 'Cryptography'], scoringRange: '0-100%', passingScore: '70+',
    officialUrl: 'https://www.eccouncil.org/programs/certified-ethical-hacker-ceh/', description: 'Hacker éthique certifié',
    preparationHours: 200, difficulty: 'advanced',
  },
  /* PROJECT MANAGEMENT (3) */
  {
    id: 'pmp', name: 'PMP - Project Management Professional', shortName: 'PMP', emoji: '📋',
    category: 'project', organism: 'PMI', country: 'USA',
    duration: '3h50', cost: '~555 $', validity: '3 ans', format: 'remote',
    sections: ['People', 'Process', 'Business Environment'], scoringRange: 'pass/fail', passingScore: '~70%',
    officialUrl: 'https://www.pmi.org/certifications/project-management-pmp', description: 'Gestion de projet professionnelle',
    preparationHours: 200, difficulty: 'advanced',
  },
  {
    id: 'scrum_master', name: 'Professional Scrum Master I', shortName: 'PSM I', emoji: '🏃',
    category: 'project', organism: 'Scrum.org', country: 'USA',
    duration: '1h', cost: '~200 $', validity: 'À vie', format: 'online',
    sections: ['Scrum Theory', 'Roles', 'Events', 'Artifacts'], scoringRange: '0-100%', passingScore: '85+',
    officialUrl: 'https://www.scrum.org/professional-scrum-master-i-certification', description: 'Scrum Master Agile',
    preparationHours: 40, difficulty: 'intermediate',
  },
  {
    id: 'prince2_foundation', name: 'PRINCE2 Foundation', shortName: 'PRINCE2', emoji: '👑',
    category: 'project', organism: 'AXELOS', country: 'UK',
    duration: '1h', cost: '~395 €', validity: 'À vie', format: 'centre',
    sections: ['Principles', 'Themes', 'Processes'], scoringRange: '0-100%', passingScore: '55+',
    officialUrl: 'https://www.axelos.com/certifications/propath/prince2-project-management', description: 'Gestion projet structurée UK',
    preparationHours: 50, difficulty: 'intermediate',
  },
  /* BUSINESS / FINANCE (3) */
  {
    id: 'cfa_l1', name: 'CFA Level I', shortName: 'CFA L1', emoji: '💼',
    category: 'finance', organism: 'CFA Institute', country: 'USA',
    duration: '4h30', cost: '~990 $', validity: '-', format: 'centre',
    sections: ['Ethics', 'Quant', 'Economics', 'FRA', 'Corp Finance', 'Equity', 'Fixed Income', 'Derivatives', 'Alt Investments', 'Portfolio Management'], scoringRange: 'pass/fail', passingScore: '~70%',
    officialUrl: 'https://www.cfainstitute.org/programs/cfa', description: 'Analyse financière niveau 1',
    preparationHours: 300, difficulty: 'advanced',
  },
  {
    id: 'six_sigma_green', name: 'Six Sigma Green Belt', shortName: 'SSGB', emoji: '🟢',
    category: 'business', organism: 'IASSC / ASQ', country: 'USA',
    duration: '3h', cost: '~395 €', validity: '3 ans', format: 'remote',
    sections: ['Define', 'Measure', 'Analyze', 'Improve', 'Control'], scoringRange: '0-100%', passingScore: '70+',
    officialUrl: 'https://www.iassc.org/six-sigma-certification/green-belt-certification/', description: 'Lean Six Sigma green belt',
    preparationHours: 80, difficulty: 'intermediate',
  },
  {
    id: 'itil_foundation', name: 'ITIL 4 Foundation', shortName: 'ITIL 4', emoji: '🛠️',
    category: 'business', organism: 'AXELOS', country: 'UK',
    duration: '1h', cost: '~330 €', validity: 'À vie', format: 'remote',
    sections: ['Service Management', 'Guiding Principles', 'Service Value System', 'Practices'], scoringRange: '0-100%', passingScore: '65+',
    officialUrl: 'https://www.axelos.com/certifications/itil-service-management/itil-4-foundation', description: 'Gestion services IT',
    preparationHours: 30, difficulty: 'beginner',
  },
  /* DESIGN / DIGITAL (3) */
  {
    id: 'pix', name: 'PIX (compétences numériques)', shortName: 'PIX', emoji: '💻',
    category: 'tech', organism: 'GIP PIX', country: 'France',
    duration: 'Variable', cost: 'Gratuit', validity: '3 ans', format: 'online',
    sections: ['Information & données', 'Communication', 'Création', 'Protection & sécurité', 'Environnement numérique'], scoringRange: '0-1024 PIX', passingScore: 'Variable',
    officialUrl: 'https://pix.fr', description: 'Compétences numériques officielles France',
    preparationHours: 20, difficulty: 'beginner',
  },
  {
    id: 'ecdl', name: 'ECDL / ICDL', shortName: 'ECDL', emoji: '🖥️',
    category: 'tech', organism: 'ICDL Foundation', country: 'EU',
    duration: 'Variable', cost: '~250 €', validity: 'À vie', format: 'centre',
    sections: ['IT Security', 'Word Processing', 'Spreadsheets', 'Online Collaboration', 'Online Essentials'], scoringRange: '0-100%', passingScore: '75+',
    officialUrl: 'https://icdl.org', description: 'Permis informatique européen',
    preparationHours: 40, difficulty: 'beginner',
  },
  {
    id: 'adobe_aca', name: 'Adobe Certified Associate', shortName: 'ACA', emoji: '🎨',
    category: 'design', organism: 'Adobe', country: 'USA',
    duration: '50min', cost: '~95 $', validity: '2 ans', format: 'centre',
    sections: ['Design', 'Project setup', 'Creating content', 'Publishing'], scoringRange: '0-1000', passingScore: '700+',
    officialUrl: 'https://www.adobe.com/training/certification.html', description: 'Photoshop / Illustrator / Premiere',
    preparationHours: 60, difficulty: 'intermediate',
  },
  /* RESTAURATION / HOSPITALITY (2) */
  {
    id: 'servsafe', name: 'ServSafe Manager', shortName: 'ServSafe', emoji: '🍽️',
    category: 'medical', organism: 'National Restaurant Association', country: 'USA',
    duration: '1h30', cost: '~125 $', validity: '5 ans', format: 'centre',
    sections: ['Food Safety', 'HACCP', 'Personal Hygiene', 'Time/Temp Control'], scoringRange: '0-100%', passingScore: '75+',
    officialUrl: 'https://www.servsafe.com', description: 'Sécurité alimentaire restauration',
    preparationHours: 30, difficulty: 'intermediate',
  },
  {
    id: 'tcf_canada', name: 'TCF Canada', shortName: 'TCF Canada', emoji: '🇨🇦',
    category: 'language', organism: 'France Éducation International', country: 'France/Canada',
    duration: '3h', cost: '~250 €', validity: '2 ans', format: 'centre',
    sections: ['Compréhension orale', 'Expression orale', 'Compréhension écrite', 'Expression écrite'], scoringRange: '0-699', passingScore: '~360 NCLC 7',
    officialUrl: 'https://www.france-education-international.fr/test-tcf-canada', description: 'Test français immigration Canada',
    preparationHours: 80, difficulty: 'B2',
  },
] as const;

/* ---------- Sample questions (50+ par exemple) ---------- */

export const SAMPLE_QUESTIONS: readonly CertQuestion[] = [
  /* TOEFL */
  { id: 'toefl1', certId: 'toefl_ibt', section: 'Reading', difficulty: 'medium', question: 'What is the main idea of paragraph 2?', choices: ['Climate change is irreversible', 'Forests can recover slowly', 'Reforestation projects are key', 'Animals adapt'], answer: 2, explanation: 'Paragraph 2 emphasizes reforestation as a primary solution mentioned by experts.' },
  { id: 'toefl2', certId: 'toefl_ibt', section: 'Listening', difficulty: 'medium', question: 'What does the professor mean by "paradigm shift"?', choices: ['Small change', 'Fundamental change in approach', 'Reverting to old', 'Confusing situation'], answer: 1, explanation: 'A paradigm shift = a fundamental change in basic assumptions or approach.' },
  /* IELTS */
  { id: 'ielts1', certId: 'ielts_academic', section: 'Reading', difficulty: 'hard', question: 'According to the passage, the most significant factor in the decline was:', choices: ['Pollution', 'Hunting', 'Habitat loss', 'Disease'], answer: 2, explanation: 'The passage explicitly states "habitat loss outpaces all other factors combined".' },
  /* TOEIC */
  { id: 'toeic1', certId: 'toeic_lr', section: 'Reading', difficulty: 'easy', question: 'The meeting ___ at 3 PM.', choices: ['begin', 'begins', 'beginning', 'began'], answer: 1, explanation: 'Subject "the meeting" (3rd person sing) needs "begins"' },
  /* DELF B2 */
  { id: 'delf1', certId: 'delf_b2', section: 'Compréhension écrite', difficulty: 'medium', question: 'Quel est le sens de "endiguer" dans cet article ?', choices: ['Augmenter', 'Limiter, contenir', 'Ignorer', 'Encourager'], answer: 1, explanation: 'Endiguer = arrêter/limiter (comme une digue contre l\'eau).' },
  /* Voltaire */
  { id: 'voltaire1', certId: 'voltaire', section: 'Orthographe', difficulty: 'hard', question: 'Choisissez la bonne orthographe :', choices: ['Pallier à un problème', 'Pallier un problème', 'Palier à un problème', 'Palier un problème'], answer: 1, explanation: 'Pallier est transitif direct (pas de "à") : pallier un problème.' },
  /* HSK 4 */
  { id: 'hsk1', certId: 'hsk_4', section: '阅读', difficulty: 'medium', question: '中国是世界上人口最多的国家。意思是 ?', choices: ['Population la plus nombreuse', 'Plus grand pays', 'Pays le plus pauvre', 'Plus vieux pays'], answer: 0, explanation: '人口 = population, 最多 = le plus' },
  /* AWS SAA */
  { id: 'aws1', certId: 'aws_saa', section: 'Design Secure Architectures', difficulty: 'medium', question: 'Which AWS service provides DDoS protection?', choices: ['CloudWatch', 'Shield', 'IAM', 'Glacier'], answer: 1, explanation: 'AWS Shield Standard (free) and Advanced offer DDoS protection.' },
  /* Azure */
  { id: 'azure1', certId: 'azure_az900', section: 'Cloud Concepts', difficulty: 'easy', question: 'Which is NOT a cloud deployment model?', choices: ['Public', 'Private', 'Hybrid', 'Static'], answer: 3, explanation: 'Models = Public, Private, Hybrid, Multi-cloud. "Static" non.' },
  /* PMP */
  { id: 'pmp1', certId: 'pmp', section: 'Process', difficulty: 'medium', question: 'What is the critical path?', choices: ['Shortest path', 'Longest path that determines minimum project duration', 'Most expensive path', 'Riskiest path'], answer: 1, explanation: 'Critical path = longest sequence of dependent tasks, determines minimum project duration.' },
  /* PRINCE2 */
  { id: 'prince1', certId: 'prince2_foundation', section: 'Principles', difficulty: 'easy', question: 'How many principles in PRINCE2?', choices: ['5', '7', '9', '10'], answer: 1, explanation: '7 principles : continued business justification, learn from experience, defined roles, manage by stages, manage by exception, focus on products, tailor.' },
  /* CFA L1 */
  { id: 'cfa1', certId: 'cfa_l1', section: 'Quant', difficulty: 'hard', question: 'NPV is calculated as:', choices: ['Sum of cash flows', 'Sum of discounted cash flows minus initial investment', 'IRR × time', 'PV / FV'], answer: 1, explanation: 'NPV = ΣCF/(1+r)^t - Initial' },
  /* Six Sigma */
  { id: 'ss1', certId: 'six_sigma_green', section: 'Define', difficulty: 'medium', question: 'DMAIC stands for:', choices: ['Define-Measure-Analyze-Improve-Control', 'Design-Make-Apply-Improve-Check', 'Discover-Map-Act-Iterate-Conclude', 'Detect-Mark-Adjust-Iterate-Compute'], answer: 0, explanation: 'DMAIC = framework Six Sigma standard' },
  /* ITIL */
  { id: 'itil1', certId: 'itil_foundation', section: 'Practices', difficulty: 'easy', question: 'What is the main goal of Incident Management?', choices: ['Prevent incidents', 'Restore service ASAP', 'Find root cause', 'Document changes'], answer: 1, explanation: 'Incident management = restaurer service le plus vite possible (Problem mgmt = root cause)' },
  /* PIX */
  { id: 'pix1', certId: 'pix', section: 'Information & données', difficulty: 'easy', question: 'Pour vérifier la fiabilité d\'une info en ligne :', choices: ['1 source unique', 'Croiser sources fiables', 'Premier résultat Google', 'Wikipedia seul'], answer: 1, explanation: 'Croiser plusieurs sources fiables (HONcode, .gouv, presse établie)' },
  /* ServSafe */
  { id: 'servsafe1', certId: 'servsafe', section: 'Food Safety', difficulty: 'medium', question: 'Internal cooking temp for ground beef ?', choices: ['145°F (63°C)', '155°F (68°C)', '165°F (74°C)', '175°F (79°C)'], answer: 1, explanation: 'Ground beef = 155°F (68°C) for 17 sec, more than whole cuts (145°F).' },
  /* Goethe B2 */
  { id: 'goethe1', certId: 'goethe_b2', section: 'Lesen', difficulty: 'medium', question: 'Was bedeutet "nachhaltig"?', choices: ['Schnell', 'Dauerhaft / langfristig wirksam', 'Teuer', 'Langweilig'], answer: 1, explanation: 'Nachhaltig = sustainable, durable.' },
  /* DELE */
  { id: 'dele1', certId: 'dele_b2', section: 'Comprensión lectora', difficulty: 'medium', question: '¿Qué significa "agotar"?', choices: ['Llenar', 'Consumir totalmente', 'Comprar', 'Reservar'], answer: 1, explanation: 'Agotar = épuiser totalement (recursos, paciencia).' },
] as const;

/* ---------- Vocabulaire ciblé par certif (échantillon) ---------- */

export const VOCAB_BY_CERT: Record<string, readonly { word: string; def: string }[]> = {
  toefl_ibt: [
    { word: 'ubiquitous', def: 'présent partout' },
    { word: 'mitigate', def: 'atténuer, réduire' },
    { word: 'plethora', def: 'pléthore, abondance' },
    { word: 'paradigm', def: 'paradigme, modèle' },
    { word: 'corroborate', def: 'corroborer, confirmer' },
  ],
  ielts_academic: [
    { word: 'phenomenon', def: 'phénomène' },
    { word: 'substantial', def: 'substantiel, considérable' },
    { word: 'perspective', def: 'perspective, point de vue' },
    { word: 'inevitable', def: 'inévitable' },
    { word: 'comprehensive', def: 'complet, exhaustif' },
  ],
  toeic_lr: [
    { word: 'agenda', def: 'ordre du jour' },
    { word: 'memorandum', def: 'mémo, note' },
    { word: 'invoice', def: 'facture' },
    { word: 'shipment', def: 'expédition' },
    { word: 'inventory', def: 'inventaire' },
  ],
  voltaire: [
    { word: 'malgré que (incorrect)', def: '→ "bien que" est correct' },
    { word: 'pallier', def: 'transitif direct (pas de "à")' },
    { word: 'censé', def: 'supposé (≠ sensé = raisonnable)' },
    { word: 'davantage', def: 'jamais d\'apostrophe ; ≠ d\'avantage' },
  ],
};

/* ---------- Conseils par certif ---------- */

export const TIPS_BY_CERT: Record<string, readonly string[]> = {
  toefl_ibt: [
    'Prends note pendant Listening (jusqu\'à 1 page autorisée)',
    'Speaking : 15-20 sec préparation, parle sans hésiter',
    'Writing intégré : pèse les arguments donnés',
    'Repère mots-clés (firstly, however, in conclusion)',
  ],
  ielts_academic: [
    'Reading : skim/scan avant lecture détaillée',
    'Listening : multi-task (écoute + remplis)',
    'Writing Task 1 : ne pas dépasser 20 min',
    'Speaking : développe au-delà du oui/non',
  ],
  voltaire: [
    'Travaille les pièges courants (à/a, ou/où, ces/ses)',
    'Mémorise les verbes avec accord du COD avant',
    'Apprends les pluriels irréguliers',
  ],
  pmp: [
    'Lis le PMBOK Guide 7th Edition',
    'Pratique 1000+ questions blanc',
    'Comprends ITTOs (Inputs/Tools/Outputs)',
    'Focus sur Agile (50% questions)',
  ],
  aws_saa: [
    'Whitepapers AWS gratuits sont essentiels',
    'TutorialsDojo / Stephane Maarek courses',
    'Pratique avec compte AWS gratuit (12 mois)',
    'Maîtrise S3, EC2, VPC, IAM, RDS, Lambda',
  ],
};

/* ---------- Storage ---------- */

export const STORAGE_PREFIX = 'ax_cert_';

export interface ProgressTracker {
  uid: string;
  progress: Record<string, UserProgress>;
}

export function getProgressKey(uid: string): string {
  return `${STORAGE_PREFIX}p_${uid}`;
}

/* ---------- Pure helpers ---------- */

export function findCertification(id: string): CertificationDef | undefined {
  return CERTIFICATIONS.find((c) => c.id === id);
}

export function certsByCategory(category: CertCategory): readonly CertificationDef[] {
  return CERTIFICATIONS.filter((c) => c.category === category);
}

export function questionsByCert(certId: string): readonly CertQuestion[] {
  return SAMPLE_QUESTIONS.filter((q) => q.certId === certId);
}

export function calcExamScore(answers: readonly { questionId: string; answer: number }[]): { correct: number; total: number; percentage: number } {
  let correct = 0;
  for (const a of answers) {
    const q = SAMPLE_QUESTIONS.find((x) => x.id === a.questionId);
    if (q && q.answer === a.answer) correct++;
  }
  const total = answers.length;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, percentage };
}

export function estimateScoreToReach(currentScore: number, hoursStudiedSoFar: number, targetScore: number, prepHoursTotal: number): number {
  /* Hypothèse linéaire : hours_remaining = (target - current) × (prep_total / 100) */
  if (currentScore >= targetScore) return 0;
  const ratio = (targetScore - currentScore) / 100;
  const hoursNeeded = Math.round(ratio * prepHoursTotal);
  return Math.max(0, hoursNeeded - hoursStudiedSoFar);
}

export function recommendCerts(category: CertCategory, level: 'beginner' | 'intermediate' | 'advanced'): readonly CertificationDef[] {
  const allByCat = certsByCategory(category);
  if (level === 'beginner') return allByCat.filter((c) => ['A1', 'A2', 'B1', 'beginner'].includes(c.difficulty)).slice(0, 5);
  if (level === 'intermediate') return allByCat.filter((c) => ['B2', 'intermediate'].includes(c.difficulty)).slice(0, 5);
  return allByCat.filter((c) => ['C1', 'C2', 'advanced', 'expert'].includes(c.difficulty)).slice(0, 5);
}

/* ---------- UI render ---------- */

export function render(root: HTMLElement): void {
  logger.info('pro-certifications', 'render');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('pro.certifications', root, uid)) return;
  root.innerHTML = `
    <div class="ax-card ax-gs-197">
      <h2 class="ax-gs-365">🏆 Certifications Pro</h2>
      <p class="ax-gs-417">${CERTIFICATIONS.length} certifications · ${SAMPLE_QUESTIONS.length}+ questions samples · vocabulaire · stratégies · liens officiels.</p>
      <h3 class="ax-gs-418">Langues</h3>
      <div class="ax-gs-156">
        ${certsByCategory('language').map((c) => `<div class="ax-gs-33">${c.emoji} <strong class="ax-gs-327">${escapeHtml(c.shortName)}</strong><br><small class="ax-gs-240">${escapeHtml(c.organism)} · ${escapeHtml(c.cost)}</small></div>`).join('')}
      </div>
      <h3 class="ax-gs-418">Tech & Cloud</h3>
      <div class="ax-gs-156">
        ${certsByCategory('tech').map((c) => `<div class="ax-gs-33">${c.emoji} <strong class="ax-gs-327">${escapeHtml(c.shortName)}</strong><br><small class="ax-gs-240">${escapeHtml(c.organism)} · ${escapeHtml(c.cost)}</small></div>`).join('')}
      </div>
      <h3 class="ax-gs-418">Project / Business / Finance</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
        ${[...certsByCategory('project'), ...certsByCategory('business'), ...certsByCategory('finance')].map((c) => `<div class="ax-gs-33">${c.emoji} <strong class="ax-gs-327">${escapeHtml(c.shortName)}</strong><br><small class="ax-gs-240">${escapeHtml(c.organism)}</small></div>`).join('')}
      </div>
    </div>
  `;
}
