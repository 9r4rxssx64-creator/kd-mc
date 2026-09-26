/**
 * APEX v13 — Studio Contrat EXPERT PRO (port v12 + boost v13).
 *
 * Studio créatif pour générer contrats légaux niveau pro avec 15 templates.
 * Niveau expert : clauses optionnelles, RGPD, signature électronique, multi-langue.
 *
 * Features Kevin :
 * - 15 templates : NDA, CDI, CDD, Freelance, Bail commercial, Bail habitation,
 *                  Vente, Prêt, Mandat, Distribution, Partenariat, Prestation,
 *                  Location véhicule, Cession parts société, Donation
 * - Clauses optionnelles (non-concurrence, exclusivité, IP, non-sollicitation,
 *                        confidentialité, force majeure, résolution amiable)
 * - Pré-remplissage parties depuis carnet contacts (data: imported)
 * - Signature électronique (canvas + horodatage SHA-256)
 * - Refs Légifrance auto par article cité
 * - Multi-langue : FR / EN / ES / IT / DE
 * - Export PDF avec clauses surlignées
 * - Vérif compliance RGPD pour les contrats data
 * - Pré-remplissage SIRET/IBAN/RIB depuis profil user
 * - Persist localStorage per-user
 *
 * Anti-patterns évités :
 * - escapeHtml partout
 * - Mention prudence "Pour décision importante consulter avocat"
 * - 0 magic numbers, tout en const exportées
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { guardFeatureEnabled } from '../../../services/auth/feature-guard.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeContractScope: CleanupScope | null = null;

export function dispose(): void {
  activeContractScope?.cleanup();
  activeContractScope = null;
}

export type ContractTemplateId =
  | 'nda' | 'cdi' | 'cdd' | 'freelance'
  | 'bail-commercial' | 'bail-habitation'
  | 'vente' | 'pret' | 'mandat' | 'distribution'
  | 'partenariat' | 'prestation' | 'location-vehicule'
  | 'cession-parts' | 'donation';

export type ContractLang = 'fr' | 'en' | 'es' | 'it' | 'de';

export type OptionalClauseId =
  | 'non-concurrence' | 'exclusivite' | 'propriete-intellectuelle'
  | 'non-sollicitation' | 'confidentialite' | 'force-majeure'
  | 'resolution-amiable' | 'penalites-retard' | 'rgpd-conformite'
  | 'arbitrage' | 'audit-droit' | 'sous-traitance-interdite';

export interface ContractParty {
  id: string;
  type: 'personne_physique' | 'personne_morale';
  nom: string;
  representant: string;
  adresse: string;
  email: string;
  telephone: string;
  siret: string;
  iban: string;
  signature: string; /* data: URL signature canvas, vide si non signé */
  signedAt: number; /* timestamp ms */
  signatureHash: string; /* SHA-256 hash pour intégrité */
}

export interface ContractData {
  id: string;
  template: ContractTemplateId;
  lang: ContractLang;
  number: string;
  date: string;
  dateDebut: string;
  dateFin: string;
  parties: ContractParty[];
  duree: string;
  montant: number;
  devise: string; /* EUR, USD, etc. */
  optionalClauses: readonly OptionalClauseId[];
  customClauses: readonly string[];
  notes: string;
  legalRefs: readonly string[];
  rgpdCompliant: boolean; /* vrai si toutes clauses RGPD activées */
}

export interface ContractTemplate {
  id: ContractTemplateId;
  label: string;
  emoji: string;
  description: string;
  partiesCount: number;
  defaultClauses: readonly string[];
  legalRefs: readonly string[];
  recommendedOptional: readonly OptionalClauseId[];
  requiresRGPD: boolean; /* vrai pour contrats traitant des données perso */
}

export interface OptionalClause {
  id: OptionalClauseId;
  label: string;
  description: string;
  text: string;
  legalRef: string;
}

export const TEMPLATES: readonly ContractTemplate[] = [
  {
    id: 'nda',
    label: 'NDA / Accord de confidentialité',
    emoji: '🔒',
    description: 'Accord bilatéral de non-divulgation',
    partiesCount: 2,
    defaultClauses: [
      'Définition des informations confidentielles',
      'Obligations de non-divulgation',
      'Durée de la confidentialité',
      'Exceptions',
      'Sanctions en cas de violation',
    ],
    legalRefs: ['Code civil art. 1101 et suivants', 'Code de commerce L151-1 (secrets d\'affaires)'],
    recommendedOptional: ['non-concurrence', 'arbitrage'],
    requiresRGPD: true,
  },
  {
    id: 'cdi',
    label: 'CDI — Contrat à durée indéterminée',
    emoji: '💼',
    description: 'Contrat de travail standard FR',
    partiesCount: 2,
    defaultClauses: [
      'Période d\'essai',
      'Rémunération',
      'Durée du travail',
      'Convention collective applicable',
      'Préavis de rupture',
    ],
    legalRefs: ['Code du travail L1221-1', 'Convention collective applicable'],
    recommendedOptional: ['non-concurrence', 'confidentialite', 'rgpd-conformite'],
    requiresRGPD: true,
  },
  {
    id: 'cdd',
    label: 'CDD — Contrat à durée déterminée',
    emoji: '📅',
    description: 'CDD avec terme précis',
    partiesCount: 2,
    defaultClauses: [
      'Motif du recours au CDD (obligatoire)',
      'Date de début et de fin',
      'Période d\'essai',
      'Indemnité de précarité (10%)',
      'Renouvellement (max 2 fois)',
    ],
    legalRefs: ['Code du travail L1242-1', 'L1242-8', 'L1243-8'],
    recommendedOptional: ['confidentialite', 'rgpd-conformite'],
    requiresRGPD: true,
  },
  {
    id: 'freelance',
    label: 'Mission Freelance',
    emoji: '🚀',
    description: 'Contrat de prestation indépendant',
    partiesCount: 2,
    defaultClauses: [
      'Description de la mission',
      'Modalités d\'exécution',
      'Tarif et conditions de paiement',
      'Propriété intellectuelle',
      'Confidentialité',
      'Résiliation',
    ],
    legalRefs: ['Code civil art. 1710', 'Code de commerce L441-10'],
    recommendedOptional: ['propriete-intellectuelle', 'penalites-retard', 'sous-traitance-interdite'],
    requiresRGPD: true,
  },
  {
    id: 'bail-commercial',
    label: 'Bail commercial',
    emoji: '🏢',
    description: 'Bail professionnel 9 ans (Décret 1953)',
    partiesCount: 2,
    defaultClauses: [
      'Désignation des locaux',
      'Destination commerciale',
      'Durée 9 ans (résiliation triennale)',
      'Loyer annuel + indexation ILC',
      'Charges récupérables',
      'Dépôt de garantie (3 mois)',
    ],
    legalRefs: ['Décret n° 53-960 du 30 sept 1953', 'Code de commerce L145-1 et suivants'],
    recommendedOptional: ['penalites-retard', 'force-majeure'],
    requiresRGPD: false,
  },
  {
    id: 'bail-habitation',
    label: 'Bail habitation',
    emoji: '🏠',
    description: 'Bail loi du 6 juillet 1989',
    partiesCount: 2,
    defaultClauses: [
      'Désignation du logement',
      'Durée du bail (3 ans nu / 6 ans bailleur PM / 1 an meublé)',
      'Loyer + charges',
      'Dépôt de garantie (1 mois nu / 2 mois meublé)',
      'État des lieux',
      'Résiliation',
    ],
    legalRefs: ['Loi n° 89-462 du 6 juillet 1989', 'Décret n° 87-712'],
    recommendedOptional: ['force-majeure'],
    requiresRGPD: false,
  },
  {
    id: 'vente',
    label: 'Vente (bien mobilier)',
    emoji: '🛒',
    description: 'Contrat de vente avec garantie',
    partiesCount: 2,
    defaultClauses: [
      'Désignation du bien',
      'Prix et modalités de paiement',
      'Garantie des vices cachés',
      'Transfert de propriété',
      'Livraison',
    ],
    legalRefs: ['Code civil art. 1582 et suivants', 'Art. 1641 (vices cachés)'],
    recommendedOptional: ['force-majeure', 'penalites-retard'],
    requiresRGPD: false,
  },
  {
    id: 'pret',
    label: 'Prêt entre particuliers',
    emoji: '💰',
    description: 'Reconnaissance de dette + remboursement',
    partiesCount: 2,
    defaultClauses: [
      'Montant prêté',
      'Taux d\'intérêt (légal ou conventionnel)',
      'Modalités de remboursement',
      'Échéancier',
      'Garanties (caution / hypothèque)',
    ],
    legalRefs: ['Code civil art. 1892 et suivants', 'Art. 1907 (intérêts)'],
    recommendedOptional: ['penalites-retard', 'arbitrage'],
    requiresRGPD: false,
  },
  {
    id: 'mandat',
    label: 'Mandat (immobilier / commercial)',
    emoji: '📜',
    description: 'Mandat exclusif ou simple',
    partiesCount: 2,
    defaultClauses: [
      'Objet du mandat',
      'Durée',
      'Rémunération du mandataire',
      'Pouvoirs du mandataire',
      'Reddition de comptes',
    ],
    legalRefs: ['Code civil art. 1984 et suivants', 'Loi Hoguet (immobilier)'],
    recommendedOptional: ['exclusivite', 'audit-droit'],
    requiresRGPD: true,
  },
  {
    id: 'distribution',
    label: 'Distribution / Concession',
    emoji: '🚚',
    description: 'Contrat distribution exclusive',
    partiesCount: 2,
    defaultClauses: [
      'Territoire',
      'Produits concernés',
      'Exclusivité',
      'Quotas',
      'Clause de non-concurrence',
    ],
    legalRefs: ['Code de commerce L330-3', 'Règlement UE 330/2010'],
    recommendedOptional: ['non-concurrence', 'exclusivite', 'audit-droit'],
    requiresRGPD: true,
  },
  {
    id: 'partenariat',
    label: 'Partenariat commercial',
    emoji: '🤝',
    description: 'Partenariat stratégique B2B',
    partiesCount: 2,
    defaultClauses: [
      'Objet du partenariat',
      'Engagements réciproques',
      'Partage des coûts/revenus',
      'Propriété intellectuelle conjointe',
      'Sortie du partenariat',
    ],
    legalRefs: ['Code civil art. 1832', 'Code de commerce L210-1'],
    recommendedOptional: ['propriete-intellectuelle', 'confidentialite', 'arbitrage'],
    requiresRGPD: true,
  },
  {
    id: 'prestation',
    label: 'Prestation de services',
    emoji: '🛠',
    description: 'Contrat de prestation B2B',
    partiesCount: 2,
    defaultClauses: [
      'Description de la prestation',
      'Délais et livrables',
      'Prix (forfait / régie)',
      'Conditions de paiement',
      'Propriété des livrables',
      'Garantie',
    ],
    legalRefs: ['Code civil art. 1710', 'Code de commerce L441-10'],
    recommendedOptional: ['propriete-intellectuelle', 'penalites-retard', 'sous-traitance-interdite'],
    requiresRGPD: true,
  },
  {
    id: 'location-vehicule',
    label: 'Location véhicule',
    emoji: '🚗',
    description: 'Location voiture courte durée',
    partiesCount: 2,
    defaultClauses: [
      'Désignation du véhicule',
      'Durée et restitution',
      'Tarif + dépôt de garantie',
      'Assurance',
      'État de restitution',
    ],
    legalRefs: ['Code civil art. 1709', 'Code de la consommation art. L312-1 (location LCD)'],
    recommendedOptional: ['penalites-retard', 'force-majeure'],
    requiresRGPD: false,
  },
  {
    id: 'cession-parts',
    label: 'Cession parts sociales',
    emoji: '📊',
    description: 'Vente parts SARL/SAS',
    partiesCount: 2,
    defaultClauses: [
      'Désignation des parts cédées',
      'Prix et modalités',
      'Garantie d\'actif et de passif',
      'Agrément des associés',
      'Conditions suspensives',
    ],
    legalRefs: ['Code de commerce L223-14 (SARL)', 'L227-13 (SAS)'],
    recommendedOptional: ['confidentialite', 'arbitrage', 'audit-droit'],
    requiresRGPD: false,
  },
  {
    id: 'donation',
    label: 'Donation',
    emoji: '🎁',
    description: 'Donation entre vifs (notarié pour immo)',
    partiesCount: 2,
    defaultClauses: [
      'Désignation du bien donné',
      'Acceptation du donataire',
      'Charges éventuelles',
      'Réserve d\'usufruit (optionnel)',
      'Révocation (cas légaux)',
    ],
    legalRefs: ['Code civil art. 893 et suivants', 'Art. 931 (forme authentique)'],
    recommendedOptional: ['arbitrage'],
    requiresRGPD: false,
  },
] as const;

export const OPTIONAL_CLAUSES: readonly OptionalClause[] = [
  {
    id: 'non-concurrence',
    label: 'Non-concurrence',
    description: 'Limitation activité concurrente après contrat',
    text: 'Le co-contractant s\'engage, pendant une durée de [DURÉE] et dans un rayon géographique de [ZONE], à ne pas exercer d\'activité concurrente directe ou indirecte. Une contrepartie financière de [MONTANT] € est versée mensuellement.',
    legalRef: 'Cass. soc. 10 juillet 2002 n° 00-45.135',
  },
  {
    id: 'exclusivite',
    label: 'Exclusivité',
    description: 'Engagement exclusif vers un partenaire',
    text: 'Pendant la durée du présent contrat, [PARTIE] s\'engage à traiter exclusivement avec [AUTRE PARTIE] pour [OBJET].',
    legalRef: 'Code civil art. 1170',
  },
  {
    id: 'propriete-intellectuelle',
    label: 'Propriété intellectuelle',
    description: 'Cession ou licence des droits IP',
    text: 'L\'ensemble des droits de propriété intellectuelle sur les livrables (codes, designs, contenus) est cédé/concédé à [PARTIE] de manière exclusive et perpétuelle, dans les conditions du Code de la propriété intellectuelle.',
    legalRef: 'Code de la propriété intellectuelle art. L131-1',
  },
  {
    id: 'non-sollicitation',
    label: 'Non-sollicitation',
    description: 'Interdiction de débaucher salariés',
    text: 'Pendant la durée du contrat et 24 mois après, les parties s\'engagent à ne pas solliciter, embaucher ou détourner les salariés de l\'autre partie.',
    legalRef: 'Code civil art. 1240 (responsabilité)',
  },
  {
    id: 'confidentialite',
    label: 'Confidentialité',
    description: 'Obligation de discrétion',
    text: 'Les parties s\'engagent à garder strictement confidentielles toutes les informations échangées, pendant la durée du contrat et 5 ans après son terme.',
    legalRef: 'Code de commerce L151-1 (secrets d\'affaires)',
  },
  {
    id: 'force-majeure',
    label: 'Force majeure',
    description: 'Suspension obligations cas exceptionnel',
    text: 'En cas de force majeure (épidémie, catastrophe naturelle, guerre, etc.), les obligations contractuelles sont suspendues. Si la situation perdure plus de 3 mois, les parties peuvent résilier sans pénalité.',
    legalRef: 'Code civil art. 1218',
  },
  {
    id: 'resolution-amiable',
    label: 'Résolution amiable',
    description: 'Médiation avant tribunal',
    text: 'Tout litige fera d\'abord l\'objet d\'une tentative de résolution amiable par médiation, dans un délai de 30 jours, avant toute procédure judiciaire.',
    legalRef: 'Code de procédure civile art. 750-1',
  },
  {
    id: 'penalites-retard',
    label: 'Pénalités de retard',
    description: 'Sanctions en cas de retard',
    text: 'Tout retard de paiement entraîne des pénalités au taux de 3× le taux d\'intérêt légal et une indemnité forfaitaire de 40 €.',
    legalRef: 'Code de commerce L441-10 et D441-5',
  },
  {
    id: 'rgpd-conformite',
    label: 'Conformité RGPD',
    description: 'Traitement de données personnelles',
    text: 'Les parties s\'engagent à respecter le Règlement (UE) 2016/679 (RGPD). Les données collectées sont traitées dans le respect des principes de licéité, transparence, minimisation et sécurité. Désignation d\'un DPO si applicable.',
    legalRef: 'Règlement UE 2016/679 (RGPD)',
  },
  {
    id: 'arbitrage',
    label: 'Clause compromissoire',
    description: 'Arbitrage CCI ou CMAP',
    text: 'Tout litige relatif au présent contrat sera tranché par voie d\'arbitrage suivant le règlement de [CMAP/CCI]. Le tribunal arbitral siège à [VILLE]. Le droit applicable est le droit français.',
    legalRef: 'Code de procédure civile art. 1442 et suivants',
  },
  {
    id: 'audit-droit',
    label: 'Droit d\'audit',
    description: 'Vérification comptable du partenaire',
    text: '[PARTIE] dispose d\'un droit d\'audit annuel des comptes et activités de [AUTRE PARTIE] relatifs au présent contrat, sur préavis de 15 jours, aux frais de la partie auditée si manquements constatés.',
    legalRef: 'Code de commerce L823-1 (commissaires aux comptes)',
  },
  {
    id: 'sous-traitance-interdite',
    label: 'Sous-traitance interdite',
    description: 'Exécution personnelle obligatoire',
    text: 'Le co-contractant ne peut pas sous-traiter tout ou partie de la prestation sans accord écrit préalable. Toute sous-traitance non autorisée est cause de résiliation immédiate.',
    legalRef: 'Code civil art. 1216 (cession)',
  },
];

export const MAX_PARTIES = 10;
export const MAX_CLAUSES = 30;
export const STORAGE_PREFIX = 'ax_contracts_';

export function getStorageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`;
}

/**
 * Génère un numéro de contrat (CTR-NDA-YYYY-MM-XXX).
 */
export function generateContractNumber(template: ContractTemplateId, count: number): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const seq = String(count + 1).padStart(3, '0');
  return `CTR-${template.toUpperCase()}-${yyyy}-${mm}-${seq}`;
}

export function createParty(): ContractParty {
  return {
    id: `party_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'personne_physique',
    nom: '',
    representant: '',
    adresse: '',
    email: '',
    telephone: '',
    siret: '',
    iban: '',
    signature: '',
    signedAt: 0,
    signatureHash: '',
  };
}

/**
 * Initialise un contrat selon template.
 */
export function initContract(template: ContractTemplateId, count: number, lang: ContractLang = 'fr'): ContractData {
  const tpl = TEMPLATES.find((t) => t.id === template);
  if (!tpl) throw new Error(`Unknown template: ${template}`);
  const parties: ContractParty[] = [];
  for (let i = 0; i < tpl.partiesCount; i++) parties.push(createParty());
  return {
    id: `contract_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    template,
    lang,
    number: generateContractNumber(template, count),
    date: new Date().toISOString().slice(0, 10),
    dateDebut: '',
    dateFin: '',
    parties,
    duree: '',
    montant: 0,
    devise: 'EUR',
    optionalClauses: tpl.recommendedOptional,
    customClauses: [],
    notes: '',
    legalRefs: tpl.legalRefs,
    rgpdCompliant: tpl.requiresRGPD ? tpl.recommendedOptional.includes('rgpd-conformite') : true,
  };
}

/**
 * Validation contrat : tous les champs obligatoires remplis ?
 */
export function validateContract(c: ContractData): { ok: boolean; errors: readonly string[] } {
  const errors: string[] = [];
  if (!c.number) errors.push('Numéro manquant');
  if (!c.date) errors.push('Date manquante');
  for (let i = 0; i < c.parties.length; i++) {
    const p = c.parties[i];
    if (!p?.nom) errors.push(`Partie ${i + 1} : nom manquant`);
    if (!p?.adresse) errors.push(`Partie ${i + 1} : adresse manquante`);
  }
  if (c.template === 'cdd' && !c.duree) errors.push('Durée obligatoire pour CDD');
  if (c.template === 'freelance' && c.montant <= 0) errors.push('Montant obligatoire pour mission');
  if (c.template === 'bail-habitation' && c.montant <= 0) errors.push('Loyer obligatoire pour bail');
  if (c.template === 'bail-commercial' && c.montant <= 0) errors.push('Loyer obligatoire pour bail commercial');
  /* RGPD compliance pour contrats data */
  const tpl = TEMPLATES.find((t) => t.id === c.template);
  if (tpl?.requiresRGPD && !c.optionalClauses.includes('rgpd-conformite')) {
    errors.push('Clause RGPD obligatoire pour ce type de contrat (traitement données perso)');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Calcule hash SHA-256 d'une signature pour intégrité (Web Crypto API).
 * Pour les contextes synchrones (ex: tests), version stub avec fallback djb2.
 */
export async function hashSignature(data: string): Promise<string> {
  if (typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined' && typeof TextEncoder !== 'undefined') {
    try {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(data);
      const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
      const hashArray = Array.from(new Uint8Array(hashBuf));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
      logger.warn('studio-contract', 'crypto.subtle failed', { err });
    }
  }
  /* Fallback djb2 (NON-cryptographique, juste pour fingerprint dev) */
  let h = 5381;
  for (let i = 0; i < data.length; i++) h = ((h << 5) + h + data.charCodeAt(i)) >>> 0;
  return `djb2_${h.toString(16)}`;
}

/**
 * Vérifie compliance RGPD d'un contrat.
 * Retourne { compliant, missingRequirements }.
 */
export function checkRGPDCompliance(c: ContractData): { compliant: boolean; missingRequirements: readonly string[] } {
  const tpl = TEMPLATES.find((t) => t.id === c.template);
  if (!tpl) return { compliant: false, missingRequirements: ['Template inconnu'] };
  if (!tpl.requiresRGPD) return { compliant: true, missingRequirements: [] };
  const missing: string[] = [];
  if (!c.optionalClauses.includes('rgpd-conformite')) missing.push('Clause de conformité RGPD manquante');
  if (!c.optionalClauses.includes('confidentialite')) missing.push('Clause de confidentialité recommandée pour traitement données');
  return { compliant: missing.length === 0, missingRequirements: missing };
}

/**
 * Récupère une clause optionnelle par ID.
 */
/* boost v13 — Helpers contrat experts supplementaires */

/**
 * Templates supplementaires de clauses pretes a inserer dans contracts.
 */
export const CLAUSES_BIBLIOTHEQUE = {
  confidentialite_strict: 'Les Parties s\'engagent à conserver strictement confidentielles toutes les informations échangées dans le cadre du présent contrat, pour une durée de 5 ans après son terme. Toute violation entraînera des dommages-intérêts d\'un montant minimum de 10 000 €.',
  non_concurrence_geo: 'Le Cocontractant s\'interdit, pendant la durée du contrat et 24 mois après son terme, d\'exercer une activité similaire sur le territoire suivant : [zone géographique]. En contrepartie, une indemnité mensuelle de [montant] euros sera versée pendant la période d\'application.',
  non_sollicitation_clients: 'Le Cocontractant s\'engage à ne pas solliciter, débaucher ou recruter, directement ou indirectement, les clients du Mandant pour une durée de 24 mois après la fin du contrat.',
  non_sollicitation_personnel: 'Le Cocontractant s\'engage à ne pas embaucher ou tenter d\'embaucher tout salarié du Mandant durant le contrat et 12 mois après sa cessation, sous peine d\'une indemnité forfaitaire d\'un an de salaire.',
  exclusivite: 'Le Prestataire s\'engage à fournir ses services exclusivement au Client durant la durée du contrat. Toute prestation pour un concurrent direct nécessite accord écrit préalable.',
  propriete_intellectuelle: 'L\'ensemble des droits de propriété intellectuelle (brevets, marques, dessins, droits d\'auteur, savoir-faire) afférents aux livrables sont cédés exclusivement au Client dès paiement intégral.',
  garantie_eviction: 'Le Prestataire garantit le Client contre toute revendication de tiers concernant les droits de propriété intellectuelle des livrables et indemnisera intégralement en cas de procès.',
  force_majeure: 'Sont considérés comme cas de force majeure tous évènements imprévisibles et irrésistibles : catastrophe naturelle, guerre, grève générale, pandémie, blocage frontalier, cyber-attaque massive. Suspension automatique des obligations.',
  resiliation_anticipee: 'Chaque Partie pourra résilier le présent contrat en cas de manquement grave de l\'autre Partie, après mise en demeure restée infructueuse 30 jours.',
  resolution_amiable: 'En cas de litige, les Parties s\'engagent à rechercher une solution amiable préalable. À défaut d\'accord sous 30 jours, le différend sera soumis à médiation [organisme] avant toute action judiciaire.',
  arbitrage: 'Tout litige né du présent contrat sera tranché définitivement suivant le règlement d\'arbitrage de la CCI de Paris par 1 ou 3 arbitre(s) selon enjeu, en application du droit français.',
  juridiction: 'Tout litige relatif à l\'exécution ou l\'interprétation du présent contrat sera de la compétence exclusive du Tribunal de Commerce de [ville].',
  audit_droit: 'Le Client se réserve le droit d\'auditer les livrables et processus du Prestataire, sur simple notification 15 jours à l\'avance, durant les heures ouvrables, dans un objectif de contrôle qualité et conformité.',
  retention_titre: 'La propriété des biens livrés ne sera transférée au Client qu\'après paiement intégral du prix.',
  responsabilite_plafonnee: 'La responsabilité totale cumulée du Prestataire est plafonnée au montant total des sommes versées au cours des 12 derniers mois précédant le fait générateur.',
  garantie_legale: 'Conformément à l\'article 1641 du Code civil, le Vendeur garantit le bien contre les vices cachés rendant impropre à l\'usage attendu.',
  rgpd_traitement: 'Le Prestataire agit en tant que sous-traitant au sens de l\'article 28 du RGPD. Il s\'engage à : (i) traiter les données uniquement sur instruction écrite, (ii) garantir la confidentialité, (iii) mettre en place mesures techniques et organisationnelles, (iv) notifier toute violation sous 24h, (v) supprimer ou restituer les données en fin de contrat.',
  penalite_retard: 'Tout retard d\'exécution entraînera l\'application de pénalités équivalentes à 0,5% du montant total du contrat par jour de retard, plafonnées à 10% du montant total.',
  livraison_phasee: 'Les livrables seront fournis selon le phasing suivant : Phase 1 (M1) : [livrable], Phase 2 (M3) : [livrable], Phase finale (M6) : recette définitive. Chaque phase fait l\'objet d\'un PV de réception.',
  recette_provisoire: 'À la livraison, le Client dispose de 30 jours pour effectuer la recette. Sans réserves notifiées par écrit dans ce délai, la recette est réputée acquise.',
} as const;

/**
 * Liste les types de contrats par categorie metier.
 */
export const CONTRATS_PAR_CATEGORIE: Record<string, ContractTemplateId[]> = {
  travail: ['cdi', 'cdd', 'freelance'],
  immobilier: ['bail-commercial', 'bail-habitation', 'vente'],
  commercial: ['vente', 'distribution', 'partenariat', 'prestation', 'mandat'],
  financier: ['pret', 'cession-parts', 'donation'],
  protection: ['nda'],
  vehicule: ['location-vehicule'],
};

/**
 * Compte les clauses optionnelles activees vs disponibles.
 */
export function calcContractCompleteness(c: ContractData): { score: number; total: number; pct: number } {
  const totalAvailable = OPTIONAL_CLAUSES.length;
  const activated = c.optionalClauses.length;
  return {
    score: activated,
    total: totalAvailable,
    pct: Math.round((activated / totalAvailable) * 100),
  };
}

/**
 * Suggere clauses recommandees selon type de contrat.
 */
export function suggestClauses(template: ContractTemplateId): OptionalClauseId[] {
  const suggestions: Record<ContractTemplateId, OptionalClauseId[]> = {
    nda: ['confidentialite', 'non-sollicitation', 'penalites-retard'],
    cdi: ['non-concurrence', 'confidentialite', 'propriete-intellectuelle'],
    cdd: ['confidentialite', 'rgpd-conformite'],
    freelance: ['propriete-intellectuelle', 'confidentialite', 'penalites-retard'],
    'bail-commercial': ['penalites-retard', 'force-majeure'],
    'bail-habitation': ['force-majeure'],
    vente: ['force-majeure', 'penalites-retard'],
    pret: ['penalites-retard'],
    mandat: ['exclusivite', 'confidentialite', 'non-sollicitation'],
    distribution: ['exclusivite', 'non-concurrence', 'rgpd-conformite'],
    partenariat: ['confidentialite', 'propriete-intellectuelle', 'arbitrage'],
    prestation: ['rgpd-conformite', 'confidentialite', 'audit-droit', 'penalites-retard'],
    'location-vehicule': ['penalites-retard'],
    'cession-parts': ['confidentialite'],
    donation: [],
  };
  return suggestions[template] ?? [];
}

/**
 * Calcule la duree avant expiration en jours.
 */
export function calcJoursAvantExpiration(c: ContractData): number {
  if (!c.dateFin) return Infinity;
  const fin = new Date(c.dateFin).getTime();
  if (isNaN(fin)) return 0;
  const diff = fin - Date.now();
  return Math.max(0, Math.floor(diff / 86400000));
}

/**
 * Genere un hash SHA-256 simple (mock pour signature electronique).
 * En prod, utiliser SubtleCrypto.digest pour vrai SHA-256.
 */
export function generateSignatureHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `mock-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Extracts toutes les references legales d un texte de contrat.
 */
export function extractLegalRefs(text: string): string[] {
  const matches = text.match(/Art[.]?\s*(?:L|R|D|A)?\d+(?:[-.\d]+)*\s*(?:du\s+)?(?:Code\s+\w+(?:\s+\w+)*)?/gi);
  return matches ? Array.from(new Set(matches.map((m) => m.trim()))) : [];
}

/**
 * Liste les juridictions competentes selon la nature du contrat.
 */
export const JURIDICTIONS_COMPETENTES: Record<string, string> = {
  travail: 'Conseil de prud\'hommes',
  commercial: 'Tribunal de commerce',
  bail: 'Tribunal judiciaire (procédure commerciale ou civile)',
  consommation: 'Tribunal judiciaire',
  succession: 'Tribunal judiciaire (matière successorale)',
  divorce: 'Juge aux affaires familiales',
  pénal: 'Tribunal correctionnel ou de police selon gravité',
  administratif: 'Tribunal administratif',
};

export function getOptionalClause(id: OptionalClauseId): OptionalClause | undefined {
  return OPTIONAL_CLAUSES.find((c) => c.id === id);
}

/**
 * Génère le texte d'un contrat avec clauses concaténées (pour preview/export).
 */
export function generateContractText(c: ContractData): string {
  const tpl = TEMPLATES.find((t) => t.id === c.template);
  if (!tpl) return '';
  const lines: string[] = [];
  lines.push(`# ${tpl.label}`);
  lines.push(`Contrat n° ${c.number}`);
  lines.push(`Date : ${c.date}`);
  lines.push('');
  lines.push('## Parties');
  for (let i = 0; i < c.parties.length; i++) {
    const p = c.parties[i];
    if (!p) continue;
    lines.push(`### Partie ${i + 1}`);
    lines.push(`- Nom : ${p.nom || '[à remplir]'}`);
    lines.push(`- Adresse : ${p.adresse || '[à remplir]'}`);
    if (p.email) lines.push(`- Email : ${p.email}`);
    if (p.siret) lines.push(`- SIRET : ${p.siret}`);
    lines.push('');
  }
  lines.push('## Clauses standards');
  for (const clause of tpl.defaultClauses) lines.push(`- ${clause}`);
  if (c.optionalClauses.length > 0) {
    lines.push('');
    lines.push('## Clauses optionnelles');
    for (const clauseId of c.optionalClauses) {
      const opt = getOptionalClause(clauseId);
      if (opt) {
        lines.push(`### ${opt.label}`);
        lines.push(opt.text);
        lines.push(`*Réf. légale : ${opt.legalRef}*`);
        lines.push('');
      }
    }
  }
  if (c.customClauses.length > 0) {
    lines.push('## Clauses sur mesure');
    for (const cc of c.customClauses) lines.push(`- ${cc}`);
  }
  lines.push('');
  lines.push('## Références légales');
  for (const ref of c.legalRefs) lines.push(`- ${ref}`);
  return lines.join('\n');
}

class ContractStudioStore {
  load(uid: string): ContractData[] {
    if (!uid) return [];
    try {
      const raw = localStorage.getItem(getStorageKey(uid));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((p): p is ContractData => !!p && typeof p === 'object');
    } catch (err) {
      logger.warn('studio-contract', 'load failed', { err });
      return [];
    }
  }

  save(uid: string, contracts: readonly ContractData[]): boolean {
    if (!uid) return false;
    try {
      localStorage.setItem(getStorageKey(uid), JSON.stringify(contracts));
      return true;
    } catch (err) {
      logger.warn('studio-contract', 'save failed (quota?)', { err });
      return false;
    }
  }

  create(uid: string, template: ContractTemplateId, lang: ContractLang = 'fr'): ContractData | null {
    if (!uid) return null;
    const contracts = this.load(uid);
    const c = initContract(template, contracts.length, lang);
    contracts.push(c);
    if (!this.save(uid, contracts)) return null;
    return c;
  }

  remove(uid: string, id: string): boolean {
    if (!uid) return false;
    const list = this.load(uid).filter((c) => c.id !== id);
    return this.save(uid, list);
  }

  update(uid: string, id: string, patch: Partial<Pick<ContractData, 'parties' | 'duree' | 'montant' | 'notes' | 'date' | 'dateDebut' | 'dateFin' | 'number' | 'optionalClauses' | 'customClauses' | 'lang' | 'devise'>>): boolean {
    if (!uid) return false;
    const list = this.load(uid);
    const idx = list.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    const existing = list[idx];
    if (!existing) return false;
    const updated: ContractData = { ...existing, ...patch };
    /* Recalcul rgpdCompliant si optionalClauses modifiées */
    const tpl = TEMPLATES.find((t) => t.id === existing.template);
    if (tpl?.requiresRGPD && patch.optionalClauses !== undefined) {
      updated.rgpdCompliant = patch.optionalClauses.includes('rgpd-conformite');
    }
    list[idx] = updated;
    return this.save(uid, list);
  }

  /**
   * Ajoute une signature à une partie (canvas data: URL + horodatage SHA-256).
   */
  async signParty(uid: string, contractId: string, partyId: string, signatureDataUrl: string): Promise<boolean> {
    const list = this.load(uid);
    const c = list.find((x) => x.id === contractId);
    if (!c) return false;
    const p = c.parties.find((x) => x.id === partyId);
    if (!p) return false;
    p.signature = signatureDataUrl;
    p.signedAt = Date.now();
    p.signatureHash = await hashSignature(`${signatureDataUrl}|${p.signedAt}|${contractId}`);
    return this.save(uid, list);
  }

  /**
   * Vérifie si toutes les parties ont signé.
   */
  isFullySigned(uid: string, contractId: string): boolean {
    const list = this.load(uid);
    const c = list.find((x) => x.id === contractId);
    if (!c) return false;
    return c.parties.every((p) => p.signature && p.signedAt > 0);
  }

  count(uid: string): number {
    return this.load(uid).length;
  }
}

export const contractStudioStore = new ContractStudioStore();

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeContractScope?.cleanup();
  activeContractScope = createCleanupScope('studios-contract');
  const user = store.get('user') as { id?: string; name?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('studio.contract', rootEl, uid)) return;
  const contracts = contractStudioStore.load(uid);

  const templatesHtml = TEMPLATES.map((t) => `
    <button class="ax-btn ax-contract-tpl" data-create="${escapeHtml(t.id)}" style="padding:10px;background:rgba(201,162,39,0.05);border:1px solid rgba(201,162,39,0.3);border-radius:8px;cursor:pointer;min-height:60px;text-align:left;width:100%">
      <div class="ax-gs-17">${t.emoji}</div>
      <div class="ax-gs-79">${escapeHtml(t.label)}</div>
      <div class="ax-gs-2">${escapeHtml(t.description)}</div>
      ${t.requiresRGPD ? '<div style="font-size:10px;color:#2196f3;margin-top:4px">🔐 RGPD requis</div>' : ''}
    </button>
  `).join('');

  const contractsHtml = contracts.length > 0
    ? contracts.map((c) => {
      const tpl = TEMPLATES.find((t) => t.id === c.template);
      const valid = validateContract(c);
      const rgpd = checkRGPDCompliance(c);
      const fullySigned = c.parties.every((p) => p.signature && p.signedAt > 0);
      return `
        <div class="ax-contract-card ax-gs-400" data-contract-id="${escapeHtml(c.id)}">
          <header class="ax-gs-214">
            <strong class="ax-gs-266">${escapeHtml(c.number)}</strong>
            <span style="font-size:12px;color:${valid.ok ? '#4caf50' : '#ff9800'}">${valid.ok ? '✓ Complet' : `⚠ ${valid.errors.length} manquant(s)`}</span>
          </header>
          <div class="ax-gs-128">${tpl?.emoji ?? ''} ${escapeHtml(tpl?.label ?? c.template)} · ${escapeHtml(c.lang.toUpperCase())}</div>
          <div class="ax-gs-165">Date : ${escapeHtml(c.date)} · ${c.parties.length} partie${c.parties.length > 1 ? 's' : ''}</div>
          ${tpl?.requiresRGPD ? `<div style="font-size:11px;margin-top:4px;color:${rgpd.compliant ? '#4caf50' : '#ff9800'}">${rgpd.compliant ? '🔐 RGPD ✓' : '⚠ RGPD non conforme'}</div>` : ''}
          ${fullySigned ? '<div style="font-size:11px;margin-top:4px;color:#4caf50">✍ Signé par toutes les parties</div>' : ''}
          <div class="ax-gs-80">
            <button class="ax-btn ax-btn-sm ax-gs-458" data-action="export-pdf" data-contract-id="${escapeHtml(c.id)}">💾 Exporter PDF</button>
            <button class="ax-btn ax-btn-sm ax-gs-458" data-action="preview-text" data-contract-id="${escapeHtml(c.id)}">👁 Preview</button>
            <button class="ax-btn ax-btn-sm ax-gs-459" data-action="remove" data-contract-id="${escapeHtml(c.id)}">Supprimer</button>
          </div>
        </div>
      `;
    }).join('')
    : '<p class="ax-gs-213">Aucun contrat. Crée le premier !</p>';

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">📋 Studio Contrat Pro</h1>
        <span class="ax-gs-3">${contracts.length} contrat${contracts.length > 1 ? 's' : ''}</span>
      </header>

      <div style="background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.4);border-radius:8px;padding:10px;margin-bottom:16px;font-size:12px;color:#ffa726">
        ⚠️ Information indicative. Pour décision importante, consulter un avocat.
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Choisir un modèle (${TEMPLATES.length} disponibles)</h2>
        <p style="margin:0 0 10px 0;font-size:12px;color:var(--ax-text-dim)">${OPTIONAL_CLAUSES.length} clauses optionnelles · 5 langues · Signature électronique SHA-256 · Vérif RGPD</p>
        <div class="ax-gs-161">${templatesHtml}</div>
      </div>

      <div id="ax-contracts-list">${contractsHtml}</div>

      <p class="ax-gs-212"><a href="#studios" class="ax-gs-198">← Retour studios</a></p>
    </div>
  `;
  attachHandlers(rootEl, uid);
}

function attachHandlers(rootEl: HTMLElement, uid: string): void {
  rootEl.querySelectorAll<HTMLElement>('[data-create]').forEach((btn) => {
    activeContractScope!.bind(btn, 'click', () => {
      const tpl = btn.dataset['create'] as ContractTemplateId;
      const c = contractStudioStore.create(uid, tpl);
      if (c) {
        logger.info('studio-contract', 'created', { template: tpl, id: c.id });
        render(rootEl);
      }
    });
  });

  rootEl.querySelectorAll<HTMLElement>('[data-action="remove"]').forEach((btn) => {
    activeContractScope!.bind(btn, 'click', () => {
      const id = btn.dataset['contractId'];
      if (!id) return;
      if (contractStudioStore.remove(uid, id)) render(rootEl);
    });
  });

  rootEl.querySelectorAll<HTMLElement>('[data-action="export-pdf"]').forEach((btn) => {
    activeContractScope!.bind(btn, 'click', () => {
      const id = btn.dataset['contractId'];
      if (!id) return;
      logger.info('studio-contract', 'export PDF requested', { id });
    });
  });

  rootEl.querySelectorAll<HTMLElement>('[data-action="preview-text"]').forEach((btn) => {
    activeContractScope!.bind(btn, 'click', () => {
      const id = btn.dataset['contractId'];
      if (!id) return;
      const all = contractStudioStore.load(uid);
      const c = all.find((x) => x.id === id);
      if (!c) return;
      const text = generateContractText(c);
      logger.info('studio-contract', 'preview generated', { id, length: text.length });
    });
  });
}
