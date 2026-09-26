/**
 * APEX v13 — Smart Tools Suggester (Kevin demande explicite).
 *
 * "Quand un client dit qu'il veut travailler sur la musique,
 *  il apparaît le meilleur outil de musique sur le bureau.
 *  À partir de là, le client peut faire ce qu'il a envie.
 *  Pareil pour vidéo, architecture, avocat, juridique, dessin..."
 *
 * Pipeline :
 * 1. User message → detect_intent (apex-tools)
 * 2. Intent → meilleur outil dispo (registry domaine)
 * 3. Auto-launch outil dans flow chat (sans naviguer)
 * 4. Vérification périodique : outil utilisé est-il le plus poussé/récent ?
 * 5. Si meilleure alternative dispo → propose upgrade
 *
 * Anti-pattern Kevin :
 * - Pas attendre que user demande explicitement le studio (auto-suggestion)
 * - Toujours proposer 3 options quand ambigu
 * - Aller chercher derniers outils en autonomie (auto-discovery weekly)
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

export type ToolDomain =
  | 'music'
  | 'video'
  | 'architecture'
  | 'legal'
  | 'medical'
  | 'finance'
  | 'cuisine'
  | 'translation'
  | 'design'
  | 'photo'
  | 'cv_resume'
  | 'invoice'
  | 'contract'
  | 'presentation'
  | 'logo'
  | 'plant'
  | 'animal'
  | 'building'
  | 'qr_barcode'
  | 'ocr_scan'
  | 'note_taking'
  | 'calendar'
  | 'email_compose'
  | 'unknown';

export interface DomainTool {
  id: string;
  name: string;
  domain: ToolDomain;
  description: string;
  emoji: string;
  cta_label: string;
  cta_action: string; /* navigate / modal / inline / external */
  cta_target: string; /* route ou URL */
  features: readonly string[];
  rating: number; /* /5 */
  is_premium: boolean;
  last_updated: string; /* ISO date */
  alternative_external?: string; /* URL external best-of-class */
}

const DOMAIN_TOOLS: readonly DomainTool[] = [
  /* === MUSIQUE === */
  {
    id: 'studio_music_pro',
    name: 'Studio Mix Pro',
    domain: 'music',
    description: 'Mixage 12 pistes EQ + reverb + compresseur + BPM detect',
    emoji: '🎚️',
    cta_label: 'Ouvrir Studio Mix',
    cta_action: 'navigate',
    cta_target: '#studio_music',
    features: ['12 pistes', 'EQ', 'Reverb', 'Compresseur', 'BPM detect', 'Export WAV/MP3'],
    rating: 4.7,
    is_premium: false,
    last_updated: '2026-04-29',
    alternative_external: 'https://soundtrap.com',
  },
  {
    id: 'studio_clip_video',
    name: 'Studio Clip Photo→Vidéo',
    domain: 'music',
    description: 'Crée clip depuis photos + audio (CapCut-like)',
    emoji: '🎬',
    cta_label: 'Créer clip',
    cta_action: 'navigate',
    cta_target: '#studio_clip',
    features: ['Timeline photos', 'Sync audio', 'Transitions', 'Export MP4'],
    rating: 4.5,
    is_premium: true,
    last_updated: '2026-04-26',
  },

  /* === VIDÉO === */
  {
    id: 'studio_video',
    name: 'Studio Vidéo',
    domain: 'video',
    description: 'Montage vidéo timeline + cuts + fades + captions auto',
    emoji: '🎬',
    cta_label: 'Ouvrir Studio Vidéo',
    cta_action: 'navigate',
    cta_target: '#studio_video',
    features: ['Timeline', 'Cuts', 'Fades', 'Captions auto', 'Export MP4'],
    rating: 4.6,
    is_premium: false,
    last_updated: '2026-04-29',
    alternative_external: 'https://www.capcut.com',
  },

  /* === ARCHITECTURE === */
  {
    id: 'studio_architecture',
    name: 'Studio Architecture',
    domain: 'architecture',
    description: 'Plans + RE2020 + DTU + calcul surface + mélange béton + PMR',
    emoji: '🏗',
    cta_label: 'Ouvrir Studio Archi',
    cta_action: 'navigate',
    cta_target: '#studio_archi',
    features: ['Plans', 'Calcul surface', 'RE2020', 'DTU', 'PMR', 'Palette Pantone'],
    rating: 4.8,
    is_premium: false,
    last_updated: '2026-04-29',
  },
  {
    id: 'studio_building',
    name: 'Studio Bâtiment',
    domain: 'building',
    description: 'Conception bâtiment + normes ERP + structure + géo',
    emoji: '🏢',
    cta_label: 'Ouvrir Bâtiment',
    cta_action: 'navigate',
    cta_target: '#studio_building',
    features: ['Normes ERP', 'Structure', 'Géo', 'Calcul charges'],
    rating: 4.5,
    is_premium: true,
    last_updated: '2026-04-29',
  },

  /* === LÉGAL === */
  {
    id: 'legal_kb',
    name: 'Knowledge Base Juridique',
    domain: 'legal',
    description: '18+ codes français + Cassation/CE/CJUE/CEDH + Monaco',
    emoji: '⚖️',
    cta_label: 'Consulter Code Civil',
    cta_action: 'navigate',
    cta_target: '#legal',
    features: ['Code Civil', 'Code Pénal', 'Code Travail', 'Cassation', 'Conseil État', 'CJUE', 'Monaco'],
    rating: 4.9,
    is_premium: false,
    last_updated: '2026-04-29',
    alternative_external: 'https://www.legifrance.gouv.fr',
  },

  /* === MÉDICAL === */
  {
    id: 'medical_pro',
    name: 'Médical Pro',
    domain: 'medical',
    description: 'Vidal OTC + IMC + métabolisme + urgences SAMU + vaccins',
    emoji: '💊',
    cta_label: 'Ouvrir Médical',
    cta_action: 'navigate',
    cta_target: '#medical',
    features: ['Vidal OTC', 'IMC', 'Posologies', 'Interactions', 'Urgences SAMU'],
    rating: 4.8,
    is_premium: false,
    last_updated: '2026-04-29',
    alternative_external: 'https://www.vidal.fr',
  },

  /* === FINANCE === */
  {
    id: 'finance_pro',
    name: 'Finance Pro',
    domain: 'finance',
    description: 'IR FR 2026 + crédit immo + plus-value + IBAN + Monaco fiscal',
    emoji: '💰',
    cta_label: 'Calcul fiscal',
    cta_action: 'navigate',
    cta_target: '#finance',
    features: ['IR France 2026', 'Crédit immo', 'Plus-value', 'IBAN MOD97', 'Monaco fiscal'],
    rating: 4.9,
    is_premium: false,
    last_updated: '2026-04-29',
    alternative_external: 'https://www.impots.gouv.fr',
  },

  /* === CUISINE === */
  {
    id: 'cuisine_pro',
    name: 'Cuisine Pro',
    domain: 'cuisine',
    description: '10 recettes + 22 cuissons + conversions + 14 allergènes INCO',
    emoji: '🍳',
    cta_label: 'Recettes pro',
    cta_action: 'navigate',
    cta_target: '#cuisine',
    features: ['10 recettes', 'Cuissons', 'Conversions', 'Allergènes INCO', 'Calories'],
    rating: 4.6,
    is_premium: false,
    last_updated: '2026-04-29',
  },

  /* === TRADUCTION === */
  {
    id: 'translator_pro',
    name: 'Traducteur Pro',
    domain: 'translation',
    description: 'DeepL 30+ langues + cache + Claude Haiku + STT/TTS interprète',
    emoji: '🌐',
    cta_label: 'Traduire',
    cta_action: 'modal',
    cta_target: 'translate_modal',
    features: ['30+ langues', 'DeepL', 'Cache', 'Mode interprète'],
    rating: 4.8,
    is_premium: false,
    last_updated: '2026-04-29',
    alternative_external: 'https://www.deepl.com',
  },

  /* === DESIGN === */
  {
    id: 'studio_logo',
    name: 'Studio Logo',
    domain: 'design',
    description: 'Création logos + branding + Pantone + SVG',
    emoji: '🎨',
    cta_label: 'Créer logo',
    cta_action: 'navigate',
    cta_target: '#studio_logo',
    features: ['Branding', 'Pantone', 'SVG export', 'Templates'],
    rating: 4.4,
    is_premium: false,
    last_updated: '2026-04-29',
  },
  {
    id: 'studio_presentation',
    name: 'Studio Présentation',
    domain: 'design',
    description: 'Slides présentation pitch startup',
    emoji: '📊',
    cta_label: 'Créer slides',
    cta_action: 'navigate',
    cta_target: '#studio_presentation',
    features: ['Slides', 'Templates', 'Animations', 'Export PPTX'],
    rating: 4.3,
    is_premium: false,
    last_updated: '2026-04-29',
  },

  /* === PHOTO === */
  {
    id: 'studio_photo',
    name: 'Studio Photo',
    domain: 'photo',
    description: 'Retouche + filtres + recadrage',
    emoji: '📸',
    cta_label: 'Retouche',
    cta_action: 'navigate',
    cta_target: '#studio_photo',
    features: ['Filtres', 'Recadrage', 'Effets'],
    rating: 4.2,
    is_premium: false,
    last_updated: '2026-04-29',
  },

  /* === CV/RESUME === */
  {
    id: 'studio_cv',
    name: 'Studio CV',
    domain: 'cv_resume',
    description: 'CV + LinkedIn + lettre motivation IA + mock entretien',
    emoji: '📋',
    cta_label: 'Créer CV',
    cta_action: 'navigate',
    cta_target: '#studio_cv',
    features: ['CV templates', 'Lettre motivation IA', 'LinkedIn opt', 'Mock entretien'],
    rating: 4.7,
    is_premium: false,
    last_updated: '2026-04-29',
  },

  /* === FACTURE === */
  {
    id: 'studio_invoice',
    name: 'Studio Facture',
    domain: 'invoice',
    description: 'Factures + devis + suivi paiement + relance auto',
    emoji: '🧾',
    cta_label: 'Créer facture',
    cta_action: 'navigate',
    cta_target: '#studio_invoice',
    features: ['Factures', 'Devis', 'Suivi paiement', 'Relance auto'],
    rating: 4.5,
    is_premium: false,
    last_updated: '2026-04-29',
  },

  /* === CONTRAT === */
  {
    id: 'studio_contract',
    name: 'Studio Contrat',
    domain: 'contract',
    description: 'NDA + CDI + clauses légales + signature électronique',
    emoji: '📑',
    cta_label: 'Créer contrat',
    cta_action: 'navigate',
    cta_target: '#studio_contract',
    features: ['NDA', 'CDI/CDD', 'Clauses légales', 'Templates'],
    rating: 4.6,
    is_premium: false,
    last_updated: '2026-04-29',
  },

  /* === PLANT === */
  {
    id: 'studio_plant',
    name: 'Studio Plante',
    domain: 'plant',
    description: 'Identification + soins + jardin lunaire',
    emoji: '🌱',
    cta_label: 'Identifier plante',
    cta_action: 'navigate',
    cta_target: '#studio_plant',
    features: ['Identification ID', 'Soins', 'Jardin lunaire'],
    rating: 4.5,
    is_premium: false,
    last_updated: '2026-04-29',
  },

  /* === QR / BARCODE === */
  {
    id: 'qr_generator',
    name: 'QR Generator',
    domain: 'qr_barcode',
    description: 'QR codes URL + vCard + WiFi credentials',
    emoji: '⬛',
    cta_label: 'Générer QR',
    cta_action: 'modal',
    cta_target: 'qr_modal',
    features: ['URL', 'vCard', 'WiFi', 'Plain text'],
    rating: 4.4,
    is_premium: false,
    last_updated: '2026-04-29',
  },

  /* === OCR SCAN === */
  {
    id: 'ocr_scanner',
    name: 'Scan & OCR',
    domain: 'ocr_scan',
    description: 'Tesseract.js local + auto-routing intelligent',
    emoji: '📷',
    cta_label: 'Scanner',
    cta_action: 'modal',
    cta_target: 'ocr_modal',
    features: ['Multi-langues', 'Tesseract local', 'Auto-routing'],
    rating: 4.5,
    is_premium: false,
    last_updated: '2026-04-29',
  },

  /* === EMAIL === */
  {
    id: 'email_composer',
    name: 'Email IA Composer',
    domain: 'email_compose',
    description: 'Compose mails IA + signature + template',
    emoji: '✉️',
    cta_label: 'Composer email',
    cta_action: 'modal',
    cta_target: 'email_modal',
    features: ['IA composition', 'Signature', 'Templates'],
    rating: 4.6,
    is_premium: true,
    last_updated: '2026-04-29',
  },

  /* === CALENDRIER === */
  {
    id: 'calendar_event',
    name: 'Calendrier IA',
    domain: 'calendar',
    description: 'Events iCal + Google + reminders smart',
    emoji: '📅',
    cta_label: 'Créer event',
    cta_action: 'modal',
    cta_target: 'calendar_modal',
    features: ['iCal', 'Google Calendar', 'Reminders'],
    rating: 4.5,
    is_premium: false,
    last_updated: '2026-04-29',
  },

  /* === NOTES === */
  {
    id: 'notes_ia',
    name: 'Bloc-notes IA',
    domain: 'note_taking',
    description: 'Notes Markdown + sources + recherche intelligente',
    emoji: '📝',
    cta_label: 'Bloc-notes',
    cta_action: 'navigate',
    cta_target: '#notes',
    features: ['Markdown', 'Sources', 'Recherche', 'Sync Firebase'],
    rating: 4.6,
    is_premium: false,
    last_updated: '2026-04-29',
  },
];

/**
 * Map intent (apex-tools detect_intent) → domain.
 */
const INTENT_TO_DOMAIN: Record<string, ToolDomain> = {
  studio_music: 'music',
  studio_video: 'video',
  studio_archi: 'architecture',
  studio_facture: 'invoice',
  studio_cv: 'cv_resume',
  legal_kb: 'legal',
  finance_calc: 'finance',
  finance_iban: 'finance',
  qr_generate: 'qr_barcode',
  ocr: 'ocr_scan',
  translate: 'translation',
  weather: 'unknown',
  news: 'unknown',
  send_email: 'email_compose',
  calendar: 'calendar',
};

class SmartToolsSuggester {
  /**
   * Suggère le meilleur outil pour un intent donné.
   * Si plusieurs outils dans le domaine → prend le mieux noté.
   */
  suggestForIntent(intent: string): DomainTool | null {
    const domain = INTENT_TO_DOMAIN[intent];
    if (!domain || domain === 'unknown') return null;
    return this.bestForDomain(domain);
  }

  /**
   * Meilleur outil pour un domaine (rating + non-premium si user free).
   */
  bestForDomain(domain: ToolDomain, includePremium = true): DomainTool | null {
    const candidates = DOMAIN_TOOLS.filter((t) => t.domain === domain);
    const filtered = includePremium ? candidates : candidates.filter((t) => !t.is_premium);
    if (filtered.length === 0) return null;
    return [...filtered].sort((a, b) => b.rating - a.rating)[0] ?? null;
  }

  /**
   * Tous outils d'un domaine (pour modal "choix outil").
   */
  listForDomain(domain: ToolDomain): readonly DomainTool[] {
    return DOMAIN_TOOLS.filter((t) => t.domain === domain).sort((a, b) => b.rating - a.rating);
  }

  /**
   * Search outils par mot-clé (cross-domain).
   */
  search(keyword: string): readonly DomainTool[] {
    const lc = keyword.toLowerCase();
    return DOMAIN_TOOLS.filter(
      (t) =>
        t.name.toLowerCase().includes(lc) ||
        t.description.toLowerCase().includes(lc) ||
        t.features.some((f) => f.toLowerCase().includes(lc)),
    );
  }

  /**
   * Track usage (analytics + auto-discovery feedback).
   */
  recordUsage(toolId: string, uid: string): void {
    try {
      const log = JSON.parse(localStorage.getItem('apex_v13_tool_usage_log') ?? '[]') as Array<unknown>;
      log.push({ tool_id: toolId, uid, ts: Date.now() });
      const trimmed = log.length > 500 ? log.slice(-500) : log;
      localStorage.setItem('apex_v13_tool_usage_log', JSON.stringify(trimmed));
      void auditLog.record('tool.used', { details: { toolId, uid } });
    } catch (err: unknown) {
      logger.warn('smart-tools', 'recordUsage failed', { err });
    }
  }

  /**
   * Top outils utilisés (pour dashboard).
   */
  getTopUsed(limit = 10): Array<{ tool_id: string; usage_count: number }> {
    try {
      const log = JSON.parse(localStorage.getItem('apex_v13_tool_usage_log') ?? '[]') as Array<{ tool_id: string }>;
      const counts: Record<string, number> = {};
      for (const e of log) counts[e.tool_id] = (counts[e.tool_id] ?? 0) + 1;
      return Object.entries(counts)
        .map(([tool_id, usage_count]) => ({ tool_id, usage_count }))
        .sort((a, b) => b.usage_count - a.usage_count)
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  list(): readonly DomainTool[] {
    return DOMAIN_TOOLS;
  }

  countByDomain(): Record<ToolDomain, number> {
    const counts: Record<string, number> = {};
    for (const t of DOMAIN_TOOLS) {
      counts[t.domain] = (counts[t.domain] ?? 0) + 1;
    }
    return counts as Record<ToolDomain, number>;
  }
}

export const smartToolsSuggester = new SmartToolsSuggester();
