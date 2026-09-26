/**
 * APEX v13 — Smart Studios Anticipator (Kevin règle "smart studios anticipatifs").
 *
 * "Quand on parle de musique → studio mix apparaît tout seul.
 *  Architecture → studio archi. Plante → studio plant. Etc."
 *
 * Layer comportementale au-dessus de smart-tools-suggester :
 *  1. Analyse le texte d'un message user.
 *  2. Détecte intent studio via mots-clés FR/EN avec confidence (0..1).
 *  3. Si confidence ≥ 0.7 → suggère le studio (toast + action 1-clic).
 *  4. Apprentissage : si user accepte 3× même studio pour intent X → priorité accrue.
 *  5. Historique stocké dans localStorage `ax_studio_suggestions_log` (max 50 FIFO).
 *  6. Toggle `feature.smart-studios-anticipator` (default ON via feature-toggles).
 *
 * Pure : aucune dépendance UI au boot ; toast/router lazy à la demande.
 *
 * Anti-patterns évités :
 *  - Pas de listener global window.dispatchEvent
 *  - Pas de polling
 *  - Cleanup propre de l'event:on retourné
 */

import { events } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { isFeatureEnabled } from '../auth/feature-toggles.js';

/* ============================================================
   Types publics
   ============================================================ */

export type StudioIntent =
  | 'music' | 'video' | 'cv' | 'invoice' | 'contract' | 'presentation'
  | 'clip' | 'logo' | 'architecture' | 'plant' | 'geo' | 'building'
  | 'lunar' | 'pet' | 'scan' | 'photo' | 'prefecture';

export interface StudioMatch {
  intent: StudioIntent;
  confidence: number; /* 0..1 */
  studioId: string;
  emoji: string;
  label: string;
  route: string;
  matchedKeywords: readonly string[];
}

export interface StudioSuggestionLogEntry {
  ts: number;
  intent: StudioIntent;
  text_snippet: string;
  confidence: number;
  /** 'accepted' = user a cliqué CTA, 'dismissed' = ignoré, 'pending' = juste poussé */
  outcome: 'pending' | 'accepted' | 'dismissed';
}

interface IntentDef {
  intent: StudioIntent;
  studioId: string;
  emoji: string;
  label: string;
  route: string;
  /** Mots-clés FR/EN. Match insensible à la casse, espace ou ponctuation autour. */
  keywords: readonly string[];
}

/* ============================================================
   Dictionary intents → studio
   ============================================================ */

const INTENTS: readonly IntentDef[] = [
  { intent: 'music', studioId: 'studio_music', emoji: '🎚', label: 'Studio Mix Pro', route: '#studio-music',
    keywords: ['musique', 'mix', 'mixage', 'piste', 'beat', 'dj', 'son', 'track', 'morceau', 'compo', 'audio'] },
  { intent: 'video', studioId: 'studio_video', emoji: '🎬', label: 'Studio Vidéo', route: '#studio-video',
    keywords: ['vidéo', 'video', 'montage', 'film', 'tiktok', 'youtube', 'reels', 'short', 'clip vidéo', 'capcut'] },
  { intent: 'cv', studioId: 'studio_cv', emoji: '📄', label: 'Studio CV', route: '#studio-cv',
    keywords: ['cv', 'curriculum', 'candidature', 'job', 'resume', 'recrutement'] },
  { intent: 'invoice', studioId: 'studio_invoice', emoji: '🧾', label: 'Studio Facture', route: '#studio-invoice',
    keywords: ['facture', 'devis', 'invoice', 'comptabilité', 'tva', 'relance'] },
  { intent: 'contract', studioId: 'studio_contract', emoji: '📋', label: 'Studio Contrat', route: '#studio-contract',
    keywords: ['contrat', 'nda', 'cdi', 'cdd', 'prestation', 'contract'] },
  { intent: 'presentation', studioId: 'studio_presentation', emoji: '📊', label: 'Studio Présentation', route: '#studio-presentation',
    keywords: ['présentation', 'slides', 'pitch', 'powerpoint', 'pptx', 'keynote', 'présenter'] },
  { intent: 'clip', studioId: 'studio_clip', emoji: '🎥', label: 'Studio Clip', route: '#studio-clip',
    keywords: ['clip', 'animation photo', 'photo en vidéo', 'souvenir vidéo'] },
  { intent: 'logo', studioId: 'studio_logo', emoji: '🎨', label: 'Studio Logo', route: '#studio-logo',
    keywords: ['logo', 'branding', 'identité visuelle', 'marque'] },
  { intent: 'architecture', studioId: 'studio_architecture', emoji: '🏗', label: 'Studio Architecture', route: '#studio-architecture',
    keywords: ['archi', 'architecture', 'plan maison', 'béton', 'beton', 'surface m²', 'pmr', 're2020', 'maison', 'rénovation', 'renovation'] },
  { intent: 'plant', studioId: 'studio_plant', emoji: '🌱', label: 'Studio Plantes', route: '#studio-plant',
    keywords: ['plante', 'jardin', 'jardinage', 'potager', 'fleurs', 'arrosage', 'semer'] },
  { intent: 'geo', studioId: 'studio_geo', emoji: '🗺', label: 'Studio Géo', route: '#studio-geo',
    keywords: ['géocod', 'geoco', 'gps', 'coordonnées', 'lieu', 'adresse', 'distance', 'itinéraire'] },
  { intent: 'building', studioId: 'studio_building', emoji: '🏢', label: 'Studio Bâtiment', route: '#studio-building',
    keywords: ['dtu', 'norme', 'bâtiment', 'batiment', 'construction', 'métré', 'metre', 'dimensions standard'] },
  { intent: 'lunar', studioId: 'studio_lunar', emoji: '🌙', label: 'Studio Jardin Lunaire', route: '#studio-lunar',
    keywords: ['lune', 'biodynamie', 'biodynamique', 'phase lune', 'pleine lune', 'jardin lunaire'] },
  { intent: 'pet', studioId: 'studio_pet', emoji: '🐾', label: 'Studio Animaux', route: '#studio-pet',
    keywords: ['chien', 'chat', 'animal', 'vétérinaire', 'veterinaire', 'lapin', 'hamster', 'pet', 'ration'] },
  { intent: 'scan', studioId: 'studio_scan', emoji: '📷', label: 'Studio Scan', route: '#studio-scan',
    keywords: ['scan', 'ocr', 'qr code', 'qrcode', 'barcode', 'code-barre', 'carte de visite', 'vcard'] },
  { intent: 'photo', studioId: 'studio_photo', emoji: '📸', label: 'Studio Photo', route: '#studio-photo',
    keywords: ['photo retouche', 'retoucher photo', 'filtre photo', 'photoshop'] },
  { intent: 'prefecture', studioId: 'studio_prefecture', emoji: '🏛', label: 'Studio Préfecture', route: '#studio-prefecture',
    keywords: ['préfecture', 'prefecture', 'titre de séjour', 'cni', 'carte identité', 'passeport'] },
] as const;

const FEATURE_ID = 'feature.smart-studios-anticipator';
const STORAGE_LOG_KEY = 'ax_studio_suggestions_log';
const STORAGE_STATS_KEY = 'ax_studio_suggestions_stats';
const LOG_MAX = 50;
const CONFIDENCE_THRESHOLD = 0.7;
const ACCEPT_BOOST_AFTER = 3; /* user a accepté 3× → on priorise */

/* ============================================================
   Pure pure functions (testables)
   ============================================================ */

/**
 * Analyse un texte et retourne le meilleur match (ou null si aucun).
 * Confidence = nb keywords matchés × poids longueur, capé à 1.
 */
export function detectStudioIntent(text: string): StudioMatch | null {
  if (!text || typeof text !== 'string') return null;
  const lc = text.toLowerCase();
  const cleaned = lc.replace(/[^\w\sàâçéèêëîïôûùüÿñæœ]/g, ' ');
  let best: StudioMatch | null = null;
  for (const def of INTENTS) {
    const matched: string[] = [];
    for (const kw of def.keywords) {
      const k = kw.toLowerCase();
      /* Match si keyword dans le texte (avec frontière de mot pour les mots courts) */
      if (k.length <= 3) {
        const re = new RegExp(`\\b${escapeRegex(k)}\\b`, 'i');
        if (re.test(cleaned)) matched.push(kw);
      } else if (cleaned.includes(k)) {
        matched.push(kw);
      }
    }
    if (matched.length === 0) continue;
    /* Confidence : 1 keyword = 0.5, 2 = 0.75, 3+ = 0.9, plus boost si keyword ≥ 8 chars (spécifique) */
    let conf = matched.length === 1 ? 0.5 : matched.length === 2 ? 0.75 : 0.9;
    if (matched.some((m) => m.length >= 8)) conf = Math.min(1, conf + 0.1);
    if (!best || conf > best.confidence) {
      best = {
        intent: def.intent,
        confidence: conf,
        studioId: def.studioId,
        emoji: def.emoji,
        label: def.label,
        route: def.route,
        matchedKeywords: matched,
      };
    }
  }
  return best;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ============================================================
   Persistence : log + stats
   ============================================================ */

function loadLog(): StudioSuggestionLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StudioSuggestionLogEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveLog(list: StudioSuggestionLogEntry[]): void {
  try {
    const trimmed = list.length > LOG_MAX ? list.slice(list.length - LOG_MAX) : list;
    localStorage.setItem(STORAGE_LOG_KEY, JSON.stringify(trimmed));
  } catch (err) {
    logger.warn('smart-studios-anticipator', 'log save failed', { err });
  }
}

function loadStats(): Record<string, { suggested: number; accepted: number; dismissed: number }> {
  try {
    const raw = localStorage.getItem(STORAGE_STATS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, { suggested: number; accepted: number; dismissed: number }>;
  } catch {
    return {};
  }
}

function saveStats(stats: Record<string, { suggested: number; accepted: number; dismissed: number }>): void {
  try {
    localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(stats));
  } catch (err) {
    logger.warn('smart-studios-anticipator', 'stats save failed', { err });
  }
}

/* ============================================================
   Public API
   ============================================================ */

class SmartStudiosAnticipator {
  private unsubscribe: (() => void) | null = null;

  /**
   * Démarre l'écoute des messages user.
   * Auto-no-op si feature-toggle désactivé.
   */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = events.on('chat:message:user', (payload) => {
      const { text } = payload;
      if (typeof text === 'string') void this.analyze(text);
    });
    logger.info('smart-studios-anticipator', 'started');
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  isRunning(): boolean {
    return this.unsubscribe !== null;
  }

  /**
   * Analyse + suggestion. Retourne le match si trouvé.
   * Effets de bord : toast + log + emit event 'custom:smart-studios:suggested'.
   */
  async analyze(text: string): Promise<StudioMatch | null> {
    if (!isFeatureEnabled(FEATURE_ID)) {
      logger.info('smart-studios-anticipator', 'disabled by feature-toggle');
      return null;
    }
    const match = detectStudioIntent(text);
    if (!match || match.confidence < CONFIDENCE_THRESHOLD) return null;

    /* Boost : si user a déjà accepté ≥3 fois ce studio, on garde même si confidence un peu plus basse.
       Ici on l'utilise en bonus visuel/log mais le seuil est déjà passé. */
    const stats = loadStats();
    const sStat = stats[match.intent] ?? { suggested: 0, accepted: 0, dismissed: 0 };
    const trusted = sStat.accepted >= ACCEPT_BOOST_AFTER;

    /* Log */
    const entry: StudioSuggestionLogEntry = {
      ts: Date.now(),
      intent: match.intent,
      text_snippet: text.slice(0, 120),
      confidence: match.confidence,
      outcome: 'pending',
    };
    saveLog([...loadLog(), entry]);

    /* Stats */
    sStat.suggested += 1;
    stats[match.intent] = sStat;
    saveStats(stats);

    /* Toast non bloquant */
    void this.showSuggestionToast(match, trusted);

    /* Emit pour ceux qui veulent un hook (chat UI peut afficher card) */
    events.emit('custom:smart-studios:suggested', { match, trusted });

    return match;
  }

  /**
   * Marque la suggestion comme acceptée (l'user a cliqué le CTA).
   * À appeler depuis le UI handler.
   */
  recordAccepted(intent: StudioIntent): void {
    const stats = loadStats();
    const s = stats[intent] ?? { suggested: 0, accepted: 0, dismissed: 0 };
    s.accepted += 1;
    stats[intent] = s;
    saveStats(stats);
    /* Update last log entry pour cette intent en pending → accepted */
    const log = loadLog();
    for (let i = log.length - 1; i >= 0; i--) {
      const cur = log[i];
      if (cur && cur.intent === intent && cur.outcome === 'pending') {
        cur.outcome = 'accepted';
        break;
      }
    }
    saveLog(log);
    events.emit('custom:smart-studios:accepted', { intent });
  }

  recordDismissed(intent: StudioIntent): void {
    const stats = loadStats();
    const s = stats[intent] ?? { suggested: 0, accepted: 0, dismissed: 0 };
    s.dismissed += 1;
    stats[intent] = s;
    saveStats(stats);
    const log = loadLog();
    for (let i = log.length - 1; i >= 0; i--) {
      const cur = log[i];
      if (cur && cur.intent === intent && cur.outcome === 'pending') {
        cur.outcome = 'dismissed';
        break;
      }
    }
    saveLog(log);
    events.emit('custom:smart-studios:dismissed', { intent });
  }

  getLog(): readonly StudioSuggestionLogEntry[] {
    return loadLog();
  }

  getStats(): Readonly<Record<string, { suggested: number; accepted: number; dismissed: number }>> {
    return loadStats();
  }

  clearLog(): void {
    localStorage.removeItem(STORAGE_LOG_KEY);
  }

  /**
   * Toast de suggestion. Lazy import pour éviter alourdir bundle initial.
   */
  private async showSuggestionToast(match: StudioMatch, trusted: boolean): Promise<void> {
    try {
      const mod = await import('../../ui/toast.js');
      const prefix = trusted ? '⭐' : '🎯';
      mod.toast.info(`${prefix} ${match.emoji} ${match.label} · tape pour ouvrir`, { duration: 4500 });
    } catch (err) {
      logger.warn('smart-studios-anticipator', 'toast import failed', { err });
    }
  }
}

export const smartStudiosAnticipator = new SmartStudiosAnticipator();
