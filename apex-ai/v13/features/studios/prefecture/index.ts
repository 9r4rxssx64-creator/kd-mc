/**
 * APEX v13 — Studio Préfecture (Démarches Admin Pro MAX).
 *
 * Outil expert pour démarches administratives France + Monaco :
 * - 20+ démarches France (CNI, passeport, titre séjour 10 types, naturalisation, mariage, PACS, divorce, décès, etc.)
 * - 10+ démarches Monaco (carte de séjour, autorisation pro, etc.)
 * - Templates lettres officielles avec refs articles légaux
 * - Checklist documents requis par démarche
 * - Liens directs ANTS / Préfecture / Service-public.fr / gouv.mc
 * - Calendrier RDV avec rappel notification
 * - Suivi dossier par numéro
 *
 * Sources autoritaires :
 * - Code de l'entrée et du séjour des étrangers et du droit d'asile (CESEDA)
 * - Code civil (mariage, PACS, divorce, décès)
 * - Légifrance, Service-public.fr, ANTS
 * - gouv.mc (Monaco), Légimonaco
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { guardFeatureEnabled } from '../../../services/auth/feature-guard.js';

export type DemarcheCountry = 'fr' | 'mc';
export type DemarcheCategory = 'identite' | 'etranger' | 'famille' | 'pro' | 'logement' | 'sante' | 'fiscal' | 'permis';
export type DossierStatus = 'draft' | 'submitted' | 'pending' | 'completed' | 'rejected';

export interface DemarcheInfo {
  id: string;
  country: DemarcheCountry;
  category: DemarcheCategory;
  label: string;
  emoji: string;
  description: string;
  documents: readonly string[];
  delaiMoyen: string; /* ex: '3 à 6 semaines' */
  cout: string; /* ex: '25 €', 'Gratuit' */
  validite?: string; /* ex: '10 ans' */
  references: readonly string[]; /* articles légaux */
  liens: readonly { label: string; url: string }[];
  formulaireCerfa?: string; /* numéro CERFA si applicable */
}

export interface LetterTemplate {
  id: string;
  label: string;
  emoji: string;
  category: DemarcheCategory;
  destinataire: string;
  objet: string;
  body: string;
  references: readonly string[];
}

export interface Dossier {
  id: string;
  demarcheId: string;
  uid: string;
  numero?: string;
  status: DossierStatus;
  dateDebut: number;
  dateRdv?: number;
  notes: string;
  documentsCheckes: readonly string[];
}

export const STORAGE_PREFIX = 'ax_pref_';

export function getDossierKey(uid: string, id: string): string {
  return `${STORAGE_PREFIX}d_${uid}_${id}`;
}

/* ---------- 30+ Démarches France + Monaco ---------- */

export const DEMARCHES: readonly DemarcheInfo[] = [
  /* IDENTITÉ FRANCE */
  {
    id: 'cni_fr', country: 'fr', category: 'identite', label: 'Carte Nationale d\'Identité', emoji: '🪪',
    description: 'CNI biométrique pour ressortissants français. Valable 15 ans (10 ans pour mineurs).',
    documents: ['Acte naissance < 3 mois', 'Justificatif domicile < 1 an', '2 photos identité conformes', 'Ancienne CNI ou passeport', 'Timbre fiscal 25€ si perdue'],
    delaiMoyen: '3 à 8 semaines', cout: 'Gratuit (25€ si perdue/volée)', validite: '15 ans (10 ans mineurs)',
    references: ['Décret n°2016-1460', 'Article 1 décret 22 oct 1955'],
    liens: [
      { label: 'Pré-demande ANTS', url: 'https://ants.gouv.fr' },
      { label: 'Service-public.fr', url: 'https://www.service-public.fr/particuliers/vosdroits/N358' },
    ],
  },
  {
    id: 'passeport_fr', country: 'fr', category: 'identite', label: 'Passeport biométrique', emoji: '📕',
    description: 'Passeport biométrique français valable 10 ans (5 ans mineurs).',
    documents: ['Acte naissance < 3 mois', 'Justificatif domicile', '2 photos', 'Timbre fiscal 86€ (42€ mineur 15-17, 17€ < 15)', 'Ancien passeport'],
    delaiMoyen: '4 à 8 semaines', cout: '86€ adulte / 42€ mineur 15-17 / 17€ - 15 ans', validite: '10 ans (5 mineurs)',
    references: ['Décret n°2005-1726', 'Article 18 Constitution'],
    liens: [
      { label: 'Pré-demande ANTS', url: 'https://ants.gouv.fr' },
      { label: 'Timbre fiscal', url: 'https://timbres.impots.gouv.fr' },
    ],
    formulaireCerfa: '12100*02',
  },
  /* TITRES DE SÉJOUR (10 types) */
  {
    id: 'titre_sejour_visiteur', country: 'fr', category: 'etranger', label: 'Titre séjour Visiteur', emoji: '🛂',
    description: 'Pour les étrangers visitant la France sans activité professionnelle.',
    documents: ['Passeport', 'Visa long séjour', 'Justificatif domicile', 'Justificatif ressources', 'Assurance maladie', '3 photos', 'Timbre fiscal 225€'],
    delaiMoyen: '2 à 4 mois', cout: '225€', validite: '1 an renouvelable',
    references: ['Article L425-3 CESEDA', 'Article L313-6 CESEDA'],
    liens: [{ label: 'ANEF', url: 'https://administration-etrangers-en-france.interieur.gouv.fr' }],
  },
  {
    id: 'titre_sejour_etudiant', country: 'fr', category: 'etranger', label: 'Titre séjour Étudiant', emoji: '🎓',
    description: 'Étudiants étrangers inscrits dans un établissement français.',
    documents: ['Passeport', 'Visa long séjour étudiant', 'Inscription école/fac', 'Ressources 615€/mois', 'Domicile', 'Photos'],
    delaiMoyen: '1 à 3 mois', cout: '75€', validite: '1 an renouvelable',
    references: ['Article L422-1 CESEDA'],
    liens: [{ label: 'Campus France', url: 'https://www.campusfrance.org' }],
  },
  {
    id: 'titre_sejour_salarie', country: 'fr', category: 'etranger', label: 'Titre séjour Salarié', emoji: '💼',
    description: 'Travailleurs étrangers sous contrat CDI ou CDD > 12 mois.',
    documents: ['Passeport', 'Visa long séjour travail', 'Contrat de travail', 'Bulletins salaire', 'OFII', 'Photos'],
    delaiMoyen: '2 à 6 mois', cout: '225€', validite: '1 an puis 4 ans',
    references: ['Article L421-1 CESEDA', 'Article R5221 CT'],
    liens: [{ label: 'OFII', url: 'https://www.ofii.fr' }],
  },
  {
    id: 'titre_sejour_vie_privee', country: 'fr', category: 'etranger', label: 'Titre séjour Vie privée et familiale', emoji: '👨‍👩‍👧',
    description: 'Conjoint(e) de Français, parent d\'enfant français, etc.',
    documents: ['Passeport', 'Acte mariage / livret de famille', 'Justificatif domicile commun', 'CNI conjoint', 'Photos'],
    delaiMoyen: '2 à 5 mois', cout: '225€', validite: '1 an renouvelable, puis carte 10 ans',
    references: ['Article L423-1 CESEDA'],
    liens: [{ label: 'ANEF', url: 'https://administration-etrangers-en-france.interieur.gouv.fr' }],
  },
  {
    id: 'titre_sejour_resident', country: 'fr', category: 'etranger', label: 'Carte de résident 10 ans', emoji: '🏠',
    description: 'Carte de résident longue durée 10 ans (renouvelable).',
    documents: ['Passeport', 'Justificatif 5 ans séjour régulier', 'Ressources stables', 'Logement adapté', 'Intégration républicaine'],
    delaiMoyen: '3 à 9 mois', cout: '225€', validite: '10 ans',
    references: ['Article L426-17 CESEDA'],
    liens: [{ label: 'ANEF', url: 'https://administration-etrangers-en-france.interieur.gouv.fr' }],
  },
  {
    id: 'titre_sejour_passeport_talent', country: 'fr', category: 'etranger', label: 'Passeport Talent', emoji: '⭐',
    description: 'Pour profils qualifiés (chercheurs, créateurs entreprise, artistes).',
    documents: ['Passeport', 'Diplôme master+', 'Contrat ou projet', 'Ressources', 'Justificatifs talents'],
    delaiMoyen: '2 à 4 mois', cout: '225€', validite: '4 ans',
    references: ['Article L421-9 CESEDA'],
    liens: [{ label: 'France Visas', url: 'https://france-visas.gouv.fr' }],
  },
  {
    id: 'titre_sejour_recherche', country: 'fr', category: 'etranger', label: 'Carte chercheur', emoji: '🔬',
    description: 'Chercheurs étrangers en mission scientifique.',
    documents: ['Passeport', 'Convention accueil organisme reconnu', 'Ressources', 'Domicile'],
    delaiMoyen: '1 à 3 mois', cout: '225€', validite: '4 ans',
    references: ['Article L421-14 CESEDA'],
    liens: [{ label: 'Euraxess', url: 'https://www.euraxess.fr' }],
  },
  {
    id: 'titre_sejour_renouv', country: 'fr', category: 'etranger', label: 'Renouvellement titre séjour', emoji: '🔄',
    description: 'Renouvellement carte séjour avant expiration (2 mois avant).',
    documents: ['Ancien titre', 'Justificatifs nouvelle situation', 'Ressources', 'Domicile'],
    delaiMoyen: '1 à 4 mois', cout: '225€', validite: 'Selon type initial',
    references: ['Article L432-1 CESEDA'],
    liens: [{ label: 'ANEF', url: 'https://administration-etrangers-en-france.interieur.gouv.fr' }],
  },
  /* NATURALISATION */
  {
    id: 'naturalisation', country: 'fr', category: 'etranger', label: 'Naturalisation française', emoji: '🇫🇷',
    description: 'Acquisition nationalité française par décret (5 ans résidence min).',
    documents: ['Passeport', 'Acte naissance traduit', 'Casier judiciaire', 'Avis impôts 3 ans', 'TCF B1+', 'Justificatifs ressources'],
    delaiMoyen: '12 à 24 mois', cout: '55€ timbres', validite: 'Définitive',
    references: ['Article 21-15 Code civil', 'Décret n°93-1362'],
    liens: [
      { label: 'Service-public.fr', url: 'https://www.service-public.fr/particuliers/vosdroits/N111' },
      { label: 'Plateforme NATALI', url: 'https://passerelle.administration-etrangers-en-france.interieur.gouv.fr' },
    ],
  },
  /* FAMILLE */
  {
    id: 'mariage', country: 'fr', category: 'famille', label: 'Mariage civil', emoji: '💍',
    description: 'Mariage à la mairie de domicile (ou résidence).',
    documents: ['Acte naissance < 3 mois', 'Justificatif domicile', 'Pièce identité', 'Liste témoins', 'Contrat mariage si notarié'],
    delaiMoyen: '10 jours min publication bans', cout: 'Gratuit', validite: 'À vie',
    references: ['Article 144 Code civil', 'Article 75 Code civil'],
    liens: [{ label: 'Service-public.fr', url: 'https://www.service-public.fr/particuliers/vosdroits/N142' }],
  },
  {
    id: 'pacs', country: 'fr', category: 'famille', label: 'PACS', emoji: '📝',
    description: 'Pacte civil de solidarité, à la mairie ou notaire.',
    documents: ['Acte naissance < 3 mois', 'Convention PACS signée', 'Pièce identité', 'Attestation sur l\'honneur'],
    delaiMoyen: '15 jours', cout: 'Gratuit (mairie) / 200€ (notaire)', validite: 'À vie',
    references: ['Article 515-1 Code civil'],
    liens: [{ label: 'Service-public.fr', url: 'https://www.service-public.fr/particuliers/vosdroits/N144' }],
  },
  {
    id: 'divorce', country: 'fr', category: 'famille', label: 'Divorce', emoji: '💔',
    description: 'Divorce par consentement mutuel (notaire) ou contentieux (tribunal).',
    documents: ['Convention divorce', 'Liquidation régime matrimonial', 'État ressources', 'Acte mariage'],
    delaiMoyen: '3 à 18 mois', cout: 'Variable (avocats + notaire)', validite: 'Définitif',
    references: ['Article 229-1 Code civil', 'Loi n°2016-1547'],
    liens: [{ label: 'Service-public.fr', url: 'https://www.service-public.fr/particuliers/vosdroits/N142' }],
  },
  {
    id: 'naissance', country: 'fr', category: 'famille', label: 'Déclaration de naissance', emoji: '👶',
    description: 'Déclaration obligatoire dans les 5 jours à la mairie.',
    documents: ['Certificat médical accouchement', 'Acte reconnaissance prénatal', 'CNI parents'],
    delaiMoyen: 'Immédiat (5 j max)', cout: 'Gratuit', validite: '-',
    references: ['Article 55 Code civil'],
    liens: [{ label: 'Service-public.fr', url: 'https://www.service-public.fr/particuliers/vosdroits/F961' }],
  },
  {
    id: 'deces', country: 'fr', category: 'famille', label: 'Déclaration de décès', emoji: '🕊️',
    description: 'Déclaration obligatoire dans les 24h à la mairie.',
    documents: ['Certificat médical décès', 'Pièce identité défunt', 'Livret famille'],
    delaiMoyen: 'Immédiat (24h max)', cout: 'Gratuit', validite: '-',
    references: ['Article 78 Code civil'],
    liens: [{ label: 'Service-public.fr', url: 'https://www.service-public.fr/particuliers/vosdroits/F909' }],
  },
  /* PERMIS / LOGEMENT / SANTE / FISCAL */
  {
    id: 'permis_conduire', country: 'fr', category: 'permis', label: 'Permis de conduire', emoji: '🚗',
    description: 'Demande / renouvellement / duplicata du permis.',
    documents: ['CERFA 02', 'Photo', 'Justificatif domicile', 'CNI', 'Avis médical (si nécessaire)'],
    delaiMoyen: '2 à 8 semaines', cout: 'Variable', validite: '15 ans',
    references: ['Code route Article R221-1'],
    liens: [{ label: 'ANTS', url: 'https://ants.gouv.fr' }],
    formulaireCerfa: '14948',
  },
  {
    id: 'allocation_logement', country: 'fr', category: 'logement', label: 'APL CAF', emoji: '🏘️',
    description: 'Allocation Personnalisée au Logement (CAF).',
    documents: ['Bail logement', 'Avis impôts', 'RIB', 'CNI'],
    delaiMoyen: '1 à 2 mois', cout: 'Gratuit', validite: 'Variable',
    references: ['Article L831-1 CCH'],
    liens: [{ label: 'CAF', url: 'https://www.caf.fr' }],
  },
  {
    id: 'carte_vitale', country: 'fr', category: 'sante', label: 'Carte Vitale', emoji: '💳',
    description: 'Carte d\'assurance maladie.',
    documents: ['Photo identité', 'CNI', 'RIB', 'Attestation domicile'],
    delaiMoyen: '2 à 3 semaines', cout: 'Gratuit', validite: 'Permanente',
    references: ['Article L161-31 CSS'],
    liens: [{ label: 'Ameli', url: 'https://www.ameli.fr' }],
  },
  {
    id: 'declaration_impot', country: 'fr', category: 'fiscal', label: 'Déclaration revenus', emoji: '💰',
    description: 'Déclaration annuelle obligatoire des revenus.',
    documents: ['Avis impôt N-1', 'Bulletins salaire', 'Justificatifs charges déductibles'],
    delaiMoyen: 'Avril-juin chaque année', cout: 'Gratuit', validite: 'Annuelle',
    references: ['Article 170 CGI'],
    liens: [{ label: 'Impots.gouv.fr', url: 'https://www.impots.gouv.fr' }],
  },
  /* MONACO */
  {
    id: 'mc_carte_sejour', country: 'mc', category: 'etranger', label: 'Carte de séjour Monaco', emoji: '🇲🇨',
    description: 'Carte de séjour résident Monaco (3 types : temporaire 1 an, ordinaire 3 ans, privilégié 10 ans).',
    documents: ['Passeport', 'Acte naissance', 'Casier judiciaire pays origine', 'Justificatif logement', 'Justificatif ressources', 'Assurance maladie'],
    delaiMoyen: '2 à 6 mois', cout: 'Variable', validite: '1, 3 ou 10 ans',
    references: ['Loi n°1.430 du 13 juillet 2016', 'Ordonnance Souveraine n°3.153'],
    liens: [
      { label: 'gouv.mc', url: 'https://www.gouv.mc' },
      { label: 'Service Public Monaco', url: 'https://service-public-particuliers.gouv.mc' },
    ],
  },
  {
    id: 'mc_carte_id', country: 'mc', category: 'identite', label: 'Carte d\'identité monégasque', emoji: '🪪',
    description: 'CNI monégasque pour ressortissants nationaux.',
    documents: ['Acte naissance MC', 'Justificatif nationalité', 'Photos', 'Justificatif domicile MC'],
    delaiMoyen: '2 à 4 semaines', cout: '15€', validite: '10 ans',
    references: ['Loi n°1.155 du 18 décembre 1992'],
    liens: [{ label: 'gouv.mc', url: 'https://www.gouv.mc' }],
  },
  {
    id: 'mc_passeport', country: 'mc', category: 'identite', label: 'Passeport monégasque', emoji: '📕',
    description: 'Passeport biométrique pour ressortissants monégasques.',
    documents: ['CNI MC', 'Acte naissance MC', 'Photos biométriques', 'Justificatif domicile'],
    delaiMoyen: '2 à 4 semaines', cout: '50€', validite: '10 ans',
    references: ['Loi n°1.155'],
    liens: [{ label: 'Service Public Monaco', url: 'https://service-public-particuliers.gouv.mc' }],
  },
  {
    id: 'mc_autorisation_pro', country: 'mc', category: 'pro', label: 'Autorisation activité pro Monaco', emoji: '🏢',
    description: 'Autorisation administrative pour exercer une activité professionnelle à Monaco.',
    documents: ['Diplômes', 'Casier judiciaire', 'Plan affaires', 'Justificatifs domicile', 'Statuts société'],
    delaiMoyen: '3 à 6 mois', cout: 'Variable', validite: 'Permanente sauf changement',
    references: ['Loi n°1.144 du 26 juillet 1991', 'Ordonnance Souveraine n°15.700'],
    liens: [{ label: 'Direction Expansion Économique', url: 'https://www.gouv.mc/Action-Gouvernementale/Monaco-au-quotidien/Vivre-a-Monaco' }],
  },
  {
    id: 'mc_residence_fiscale', country: 'mc', category: 'fiscal', label: 'Résidence fiscale Monaco', emoji: '💎',
    description: 'Établissement résidence fiscale principale Monaco (avantages fiscaux).',
    documents: ['Carte séjour MC', 'Justificatif logement permanent', 'Présence > 183 j/an', 'Comptes bancaires MC'],
    delaiMoyen: 'Immédiat (statut)', cout: 'Gratuit', validite: 'Annuelle',
    references: ['Code fiscal MC', 'Convention fiscale FR-MC 1963'],
    liens: [{ label: 'Direction Services Fiscaux MC', url: 'https://www.gouv.mc' }],
  },
  {
    id: 'mc_mariage', country: 'mc', category: 'famille', label: 'Mariage civil Monaco', emoji: '💍',
    description: 'Mariage à la Mairie de Monaco.',
    documents: ['Acte naissance < 3 mois', 'Justificatif célibat', 'Justificatif domicile MC', 'Pièce identité'],
    delaiMoyen: '15 j publication bans min', cout: 'Gratuit', validite: 'À vie',
    references: ['Article 116 Code civil monégasque'],
    liens: [{ label: 'Mairie de Monaco', url: 'https://www.mairie.mc' }],
  },
  {
    id: 'mc_naissance', country: 'mc', category: 'famille', label: 'Déclaration naissance Monaco', emoji: '👶',
    description: 'Déclaration de naissance à la Mairie sous 3 jours.',
    documents: ['Certificat médical accouchement', 'CNI parents', 'Acte mariage si applicable'],
    delaiMoyen: '3 jours max', cout: 'Gratuit', validite: '-',
    references: ['Article 55 Code civil monégasque'],
    liens: [{ label: 'Mairie de Monaco', url: 'https://www.mairie.mc' }],
  },
  {
    id: 'mc_permis', country: 'mc', category: 'permis', label: 'Permis de conduire Monaco', emoji: '🚗',
    description: 'Conversion ou première demande permis MC.',
    documents: ['Permis pays origine', 'Carte séjour MC', 'Avis médical', 'Photos', 'Traduction si étranger'],
    delaiMoyen: '4 à 8 semaines', cout: '70€', validite: '10 ans',
    references: ['Ordonnance Souveraine n°1691'],
    liens: [{ label: 'Service Public Monaco', url: 'https://service-public-particuliers.gouv.mc' }],
  },
  {
    id: 'mc_assurance', country: 'mc', category: 'sante', label: 'CCSS / Caisses sociales Monaco', emoji: '🏥',
    description: 'Affiliation CCSS Monaco (Caisses Sociales).',
    documents: ['Contrat travail', 'Carte séjour MC', 'CNI', 'RIB MC'],
    delaiMoyen: '2 à 4 semaines', cout: 'Cotisations salariales', validite: 'Active si emploi',
    references: ['Loi n°455 du 27 juin 1947'],
    liens: [{ label: 'Caisses sociales MC', url: 'https://www.caisses-sociales.mc' }],
  },
  {
    id: 'mc_logement', country: 'mc', category: 'logement', label: 'Logement domanial Monaco', emoji: '🏠',
    description: 'Demande de logement aidé (résidents monégasques uniquement).',
    documents: ['CNI MC', 'Acte naissance MC', 'Avis fiscal', 'Justificatif famille'],
    delaiMoyen: 'Variable (liste attente)', cout: 'Gratuit (dépôt)', validite: 'Selon attribution',
    references: ['Loi n°1.118 du 18 juillet 1988'],
    liens: [{ label: 'Direction Habitat MC', url: 'https://www.gouv.mc' }],
  },
  /* boost v13 — 15 démarches supplémentaires France */
  { id: 'attestation_accueil', country: 'fr', category: 'etranger', label: 'Attestation accueil étranger', emoji: '🏠', description: 'Pour héberger un proche étranger en France.', documents: ['CNI hébergeant', 'Justificatif domicile', 'Justificatif ressources', 'Lien parenté/amitié'], delaiMoyen: '1 à 2 semaines', cout: '30 €', references: ['Art L211-3 CESEDA'], liens: [{ label: 'Mairie', url: 'https://www.service-public.fr' }], formulaireCerfa: '10798' },
  { id: 'visa_long_sejour', country: 'fr', category: 'etranger', label: 'Visa long séjour valant TS', emoji: '🛂', description: 'VLS-TS valant titre de séjour.', documents: ['Passeport', 'Visa', 'Justificatif domicile', 'Photo', 'Justificatif activité'], delaiMoyen: '3 à 5 mois', cout: 'Variable', references: ['Art R311-3 CESEDA'], liens: [{ label: 'France-visas', url: 'https://france-visas.gouv.fr' }] },
  { id: 'asile_ofpra', country: 'fr', category: 'etranger', label: 'Demande asile OFPRA', emoji: '🛡️', description: 'Demande de protection internationale.', documents: ['Récit personnel', 'Documents identité', 'Pièces preuve persécution'], delaiMoyen: '6 à 12 mois', cout: 'Gratuit', references: ['Art L711-1 CESEDA'], liens: [{ label: 'OFPRA', url: 'https://www.ofpra.gouv.fr' }] },
  { id: 'recours_cnda', country: 'fr', category: 'etranger', label: 'Recours CNDA (asile)', emoji: '⚖️', description: 'Recours contre refus OFPRA.', documents: ['Décision OFPRA', 'Mémoire complémentaire', 'Preuves nouvelles'], delaiMoyen: '6 mois', cout: 'Gratuit (AJ possible)', references: ['Art L731-1 CESEDA'], liens: [{ label: 'CNDA', url: 'https://www.cnda.fr' }] },
  { id: 'naturalisation_decret', country: 'fr', category: 'etranger', label: 'Naturalisation par décret', emoji: '🇫🇷', description: 'Acquisition nationalité française par décret.', documents: ['Acte naissance', 'TS 5+ ans', 'Avis impôts 5 ans', 'Justificatif intégration', 'Niveau B1 français'], delaiMoyen: '12 à 18 mois', cout: '55 €', references: ['Art 21-15 Code civil'], liens: [{ label: 'ANEF', url: 'https://administration-etrangers-en-france.interieur.gouv.fr' }] },
  { id: 'pacs_mairie', country: 'fr', category: 'famille', label: 'PACS à la mairie', emoji: '💑', description: 'Pacte civil de solidarité.', documents: ['Pièces identité', 'Acte naissance < 3 mois', 'Convention PACS', 'Attestations honneur'], delaiMoyen: '1 jour', cout: 'Gratuit', references: ['Art 515-1 Code civil'], liens: [{ label: 'Service-public.fr', url: 'https://www.service-public.fr' }] },
  { id: 'divorce_consentement', country: 'fr', category: 'famille', label: 'Divorce par consentement mutuel', emoji: '💔', description: 'Divorce sans juge devant notaire.', documents: ['Convention divorce', 'État liquidatif', 'Acte mariage', 'Pièces identité'], delaiMoyen: '2 à 3 mois', cout: '~1500€ + notaire', references: ['Art 229-1 Code civil'], liens: [{ label: 'Notaires.fr', url: 'https://www.notaires.fr' }] },
  { id: 'tutelle_majeur', country: 'fr', category: 'famille', label: 'Tutelle / curatelle majeur', emoji: '🤝', description: 'Mesure de protection juridique.', documents: ['Certificat médical circonstancié', 'Acte naissance', 'Justificatif lien'], delaiMoyen: '6 à 12 mois', cout: 'Variable', references: ['Art 425 Code civil'], liens: [{ label: 'Tribunal judiciaire', url: 'https://www.justice.fr' }] },
  { id: 'permis_construire', country: 'fr', category: 'logement', label: 'Permis de construire', emoji: '🏗️', description: 'Autorisation construction (>40m²).', documents: ['CERFA 13406', 'Plans architecte si >150m²', 'Photos terrain', 'Notice descriptive'], delaiMoyen: '2 à 6 mois', cout: 'Gratuit', references: ['Art L421-1 Code urbanisme'], liens: [{ label: 'Mairie', url: 'https://www.service-public.fr' }], formulaireCerfa: '13406' },
  { id: 'declaration_travaux', country: 'fr', category: 'logement', label: 'Déclaration préalable travaux', emoji: '🔨', description: 'Travaux <40m² sans permis.', documents: ['CERFA 13404', 'Plans simplifiés', 'Photos avant'], delaiMoyen: '1 mois', cout: 'Gratuit', references: ['Art R421-9 Code urbanisme'], liens: [{ label: 'Service-public.fr', url: 'https://www.service-public.fr' }], formulaireCerfa: '13404' },
  { id: 'taxe_fonciere', country: 'fr', category: 'fiscal', label: 'Taxe foncière paiement', emoji: '🏘️', description: 'Impôt annuel propriétaires immobiliers.', documents: ['Avis imposition', 'RIB', 'Justificatifs exonération'], delaiMoyen: 'Octobre chaque année', cout: 'Variable', references: ['Art 1380 CGI'], liens: [{ label: 'Impots.gouv', url: 'https://www.impots.gouv.fr' }] },
  { id: 'taxe_habitation_residence_secondaire', country: 'fr', category: 'fiscal', label: 'Taxe habitation résidence secondaire', emoji: '🏖️', description: 'Pour résidences secondaires uniquement (RP exonérées 2023).', documents: ['Avis taxe'], delaiMoyen: 'Annuel', cout: 'Variable', references: ['Art 1407 CGI'], liens: [{ label: 'Impots.gouv', url: 'https://www.impots.gouv.fr' }] },
  { id: 'rsa_demande', country: 'fr', category: 'logement', label: 'RSA Revenu Solidarité Active', emoji: '💸', description: 'Allocation minimum vital.', documents: ['CNI', 'RIB', 'Avis impôts', 'Justificatif domicile', 'Bulletins salaire'], delaiMoyen: '1 à 2 mois', cout: 'Gratuit', references: ['Art L262-1 CASF'], liens: [{ label: 'CAF', url: 'https://www.caf.fr' }] },
  { id: 'aah_handicap', country: 'fr', category: 'sante', label: 'AAH Allocation Handicapés', emoji: '♿', description: 'Allocation Adulte Handicapé MDPH.', documents: ['Certificat médical MDPH', 'Justificatifs revenus', 'CNI'], delaiMoyen: '4 à 6 mois', cout: 'Gratuit', references: ['Art L821-1 CSS'], liens: [{ label: 'MDPH', url: 'https://www.mdph.fr' }] },
  { id: 'pension_invalidite', country: 'fr', category: 'sante', label: 'Pension invalidité CPAM', emoji: '🏥', description: 'Capacité travail réduite >2/3.', documents: ['Certificat médical', 'Bulletins salaire', 'Avis médecin conseil'], delaiMoyen: '3 à 6 mois', cout: 'Gratuit', references: ['Art L341-1 CSS'], liens: [{ label: 'Ameli', url: 'https://www.ameli.fr' }] },
] as const;

/* ---------- Templates lettres officielles ---------- */

export const LETTER_TEMPLATES: readonly LetterTemplate[] = [
  {
    id: 'recours_prefecture', label: 'Recours Préfecture (refus titre séjour)', emoji: '📄',
    category: 'etranger',
    destinataire: 'Monsieur le Préfet de [DÉPARTEMENT]\n[Adresse Préfecture]',
    objet: 'Recours gracieux contre la décision de refus de titre de séjour du [DATE]',
    body: 'Monsieur le Préfet,\n\nPar décision du [DATE], votre administration a refusé ma demande de titre de séjour [TYPE] au motif de [MOTIF].\n\nJe sollicite respectueusement votre bienveillance pour reconsidérer ma demande pour les raisons suivantes :\n\n1. [Argument 1]\n2. [Argument 2]\n3. [Argument 3]\n\nConformément à l\'article L411-2 du Code des relations entre le public et l\'administration, je vous prie d\'examiner ce recours dans le délai légal de 2 mois.\n\nDans cette attente, je vous prie d\'agréer, Monsieur le Préfet, l\'expression de ma haute considération.\n\n[NOM PRÉNOM]\n[ADRESSE]',
    references: ['Article L411-2 CRPA', 'Article L432-13 CESEDA'],
  },
  {
    id: 'demande_naturalisation', label: 'Lettre demande naturalisation', emoji: '🇫🇷',
    category: 'etranger',
    destinataire: 'Ministère de l\'Intérieur\nDirection Nationalité\nSous-préfecture de [VILLE]',
    objet: 'Demande de naturalisation française par décret',
    body: 'Madame, Monsieur,\n\nJe soussigné(e) [NOM PRÉNOM], né(e) le [DATE] à [VILLE PAYS], de nationalité [NATIONALITÉ], demeurant [ADRESSE COMPLÈTE], sollicite par la présente l\'acquisition de la nationalité française par voie de naturalisation.\n\nJe résidence en France depuis le [DATE] et remplis les conditions prévues par les articles 21-15 et suivants du Code civil :\n\n- 5 années de résidence régulière en France\n- Maîtrise de la langue française (TCF B1+)\n- Adhésion aux valeurs de la République\n- Bonne moralité (casier judiciaire vierge)\n\nJe joins à la présente demande l\'ensemble des pièces requises au dossier.\n\nDans l\'attente d\'une réponse favorable, je vous prie d\'agréer, Madame, Monsieur, l\'expression de ma considération distinguée.\n\n[Signature]\n[NOM PRÉNOM]',
    references: ['Article 21-15 à 21-25 Code civil', 'Décret n°93-1362'],
  },
  {
    id: 'attestation_hebergement', label: 'Attestation d\'hébergement', emoji: '🏠',
    category: 'identite',
    destinataire: '[À l\'attention de qui de droit]',
    objet: 'Attestation sur l\'honneur d\'hébergement',
    body: 'Je soussigné(e) [NOM PRÉNOM], né(e) le [DATE] à [VILLE], demeurant [ADRESSE COMPLÈTE], certifie sur l\'honneur héberger à mon domicile :\n\nMonsieur/Madame [NOM PRÉNOM HÉBERGÉ], né(e) le [DATE], depuis le [DATE DÉBUT].\n\nFait à [VILLE], le [DATE]\n\nSignature :\n\nJoindre :\n- Copie pièce identité\n- Justificatif domicile (facture < 3 mois)',
    references: ['Article 441-7 Code pénal'],
  },
  {
    id: 'demande_acte_naissance', label: 'Demande acte de naissance', emoji: '📄',
    category: 'identite',
    destinataire: 'Mairie de [VILLE NAISSANCE]\nService État Civil',
    objet: 'Demande d\'acte de naissance (copie intégrale / extrait)',
    body: 'Madame, Monsieur,\n\nJe soussigné(e) [NOM PRÉNOM], né(e) le [DATE] à [VILLE], sollicite la délivrance d\'une copie intégrale (ou extrait avec/sans filiation) de mon acte de naissance.\n\nÉtat civil :\n- Nom : [NOM]\n- Prénoms : [PRÉNOMS]\n- Date naissance : [DATE]\n- Lieu : [VILLE]\n- Nom du père : [PÈRE]\n- Nom de jeune fille de la mère : [MÈRE]\n\nJe joins à la présente :\n- Photocopie de ma pièce d\'identité\n- Enveloppe timbrée pour la réponse\n\nDans l\'attente, je vous prie d\'agréer mes salutations distinguées.\n\n[Signature]',
    references: ['Article 9 Décret 3 août 1962'],
  },
  {
    id: 'changement_nom', label: 'Demande changement de nom', emoji: '✏️',
    category: 'identite',
    destinataire: 'Mairie du domicile / Officier d\'état civil',
    objet: 'Demande de changement de nom (motif légitime)',
    body: 'Madame, Monsieur,\n\nJe soussigné(e) [NOM ACTUEL] PRÉNOM, né(e) le [DATE] à [LIEU], demeurant [ADRESSE], sollicite le changement de mon nom de famille.\n\nNom souhaité : [NOM SOUHAITÉ]\n\nMotif légitime invoqué (article 61 Code civil) :\n[MOTIF DÉTAILLÉ]\n\nPièces jointes :\n- Acte de naissance\n- Pièce identité\n- Justificatifs motif\n\n[Signature]',
    references: ['Article 61 Code civil', 'Loi n°2022-301 du 2 mars 2022'],
  },
  {
    id: 'mc_demande_sejour', label: 'Demande carte séjour Monaco', emoji: '🇲🇨',
    category: 'etranger',
    destinataire: 'Direction de la Sûreté Publique\nSection résidents\n3 rue Louis Notari, MC 98000',
    objet: 'Demande de carte de séjour temporaire',
    body: 'Monsieur le Directeur,\n\nJe soussigné(e) [NOM PRÉNOM], né(e) le [DATE] à [LIEU], de nationalité [NATIONALITÉ], demeurant à [ADRESSE Monaco], sollicite la délivrance d\'une carte de séjour temporaire monégasque.\n\nMotif de séjour : [MOTIF - travail/études/famille/retraite]\n\nJe joins l\'ensemble des pièces requises et sollicite un rendez-vous avec vos services.\n\nVeuillez agréer, Monsieur le Directeur, l\'expression de ma haute considération.\n\n[Signature]',
    references: ['Loi n°1.430 du 13 juillet 2016', 'Ordonnance Souveraine n°3.153'],
  },
] as const;

/* ---------- Pure helpers ---------- */

export function findDemarche(id: string): DemarcheInfo | undefined {
  return DEMARCHES.find((d) => d.id === id);
}

export function demarchesByCountry(country: DemarcheCountry): readonly DemarcheInfo[] {
  return DEMARCHES.filter((d) => d.country === country);
}

export function demarchesByCategory(country: DemarcheCountry, category: DemarcheCategory): readonly DemarcheInfo[] {
  return DEMARCHES.filter((d) => d.country === country && d.category === category);
}

export function findLetter(id: string): LetterTemplate | undefined {
  return LETTER_TEMPLATES.find((l) => l.id === id);
}

export function generateLetter(template: LetterTemplate, vars: Record<string, string>): string {
  let body = template.body;
  let dest = template.destinataire;
  let obj = template.objet;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`\\[${k}\\]`, 'g');
    body = body.replace(re, escapeHtml(v));
    dest = dest.replace(re, escapeHtml(v));
    obj = obj.replace(re, escapeHtml(v));
  }
  return `${dest}\n\nObjet : ${obj}\n\n${body}`;
}

export function createDossier(uid: string, demarcheId: string): Dossier {
  return {
    id: `dossier_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    demarcheId,
    uid,
    status: 'draft',
    dateDebut: Date.now(),
    notes: '',
    documentsCheckes: [],
  };
}

export function checkDocument(dossier: Dossier, doc: string): Dossier {
  if (dossier.documentsCheckes.includes(doc)) {
    return { ...dossier, documentsCheckes: dossier.documentsCheckes.filter((d) => d !== doc) };
  }
  return { ...dossier, documentsCheckes: [...dossier.documentsCheckes, doc] };
}

export function calcCompleteness(dossier: Dossier): number {
  const dem = findDemarche(dossier.demarcheId);
  if (!dem || dem.documents.length === 0) return 0;
  return Math.round((dossier.documentsCheckes.length / dem.documents.length) * 100);
}

/* ---------- Storage ---------- */

class PrefectureStudioStore {
  list(uid: string): Dossier[] {
    if (!uid) return [];
    const out: Dossier[] = [];
    const prefix = `${STORAGE_PREFIX}d_${uid}_`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as Dossier;
          if (parsed && parsed.id) out.push(parsed);
        } catch {/* skip */}
      }
    } catch (err) { logger.warn('studio-prefecture', 'list failed', { err }); }
    return out.sort((a, b) => b.dateDebut - a.dateDebut);
  }

  load(uid: string, id: string): Dossier | null {
    if (!uid || !id) return null;
    try {
      const raw = localStorage.getItem(getDossierKey(uid, id));
      if (!raw) return null;
      return JSON.parse(raw) as Dossier;
    } catch (err) {
      logger.warn('studio-prefecture', 'load failed', { err });
      return null;
    }
  }

  save(uid: string, dossier: Dossier): boolean {
    if (!uid) return false;
    try {
      localStorage.setItem(getDossierKey(uid, dossier.id), JSON.stringify(dossier));
      return true;
    } catch (err) {
      logger.warn('studio-prefecture', 'save failed', { err });
      return false;
    }
  }

  remove(uid: string, id: string): boolean {
    if (!uid || !id) return false;
    localStorage.removeItem(getDossierKey(uid, id));
    return true;
  }
}

export const prefectureStudioStore = new PrefectureStudioStore();

/* ---------- UI render ---------- */

export function render(rootEl: HTMLElement): void {
  const user = store.get('user') as { id?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('studio.prefecture', rootEl, uid)) return;
  const dossiers = prefectureStudioStore.list(uid);

  rootEl.innerHTML = `
    <div class="ax-card ax-gs-197">
      <h2 class="ax-gs-365">🏛️ Studio Préfecture</h2>
      <p class="ax-gs-417">${DEMARCHES.length} démarches FR + MC · ${LETTER_TEMPLATES.length} templates lettres officielles · refs Légifrance + Légimonaco.</p>
      <h3 class="ax-gs-418">Démarches France (${demarchesByCountry('fr').length})</h3>
      <div class="ax-gs-173">
        ${demarchesByCountry('fr').map((d) => `<div class="ax-gs-33">${d.emoji} <strong class="ax-gs-327">${escapeHtml(d.label)}</strong><br><small class="ax-gs-240">${escapeHtml(d.delaiMoyen)} · ${escapeHtml(d.cout)}</small></div>`).join('')}
      </div>
      <h3 class="ax-gs-418">Démarches Monaco (${demarchesByCountry('mc').length})</h3>
      <div class="ax-gs-173">
        ${demarchesByCountry('mc').map((d) => `<div class="ax-gs-33">${d.emoji} <strong class="ax-gs-327">${escapeHtml(d.label)}</strong><br><small class="ax-gs-240">${escapeHtml(d.delaiMoyen)} · ${escapeHtml(d.cout)}</small></div>`).join('')}
      </div>
      <h3 class="ax-gs-418">Mes dossiers (${dossiers.length})</h3>
      ${dossiers.length === 0
        ? '<p class="ax-gs-240">Aucun dossier en cours.</p>'
        : `<div>${dossiers.map((d) => { const dem = findDemarche(d.demarcheId); return `<div style="padding:10px;background:#13162a;border-radius:8px;margin-bottom:6px"><strong>${escapeHtml(dem?.label ?? d.demarcheId)}</strong> · ${escapeHtml(d.status)} · ${calcCompleteness(d)}% complet</div>`; }).join('')}</div>`}
    </div>
  `;
}
