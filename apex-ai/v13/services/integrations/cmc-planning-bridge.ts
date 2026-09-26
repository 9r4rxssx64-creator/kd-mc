/**
 * v13.3.19 — Bridge Apex → CMCteams (règle Kevin 2026-05-07 §8)
 * v13.4.83 — Permission guard tier-aware + patterns enrichis PDF SBM réels
 *
 * Détecte quand Kevin colle un planning SBM dans le chat Apex.
 * Push automatiquement vers Firebase `ax_cmc_planning_pending`.
 * CMCteams écoute SSE → toast admin Kevin → import 1-clic.
 *
 * Patterns détectés (≥2 matches obligatoires pour éviter faux positifs) :
 *  - Mois SBM (MAI 2026, JUIN 2026, …)
 *  - Sections d'équipes (BJ Éq. / RA Éq. / CMC Éq.)
 *  - Cadres (PIT BOSS / SUPERVISEUR / INSPECTEUR / Pit Boss 15)
 *  - Titre PDF SBM ("PLANNING PIT BOSS" / "X PLANNING PIT B...")
 *  - Légendes lieux (CCDP / POKER NO LIMIT)
 *  - Téléphones internes SBM (62224/62056 séparés par /)
 *
 * Permission guard (v13.4.83 Kevin "tout le monde sécurité") :
 *  - Seul admin Kevin peut push vers CMC (isolation Laurence/clients).
 *  - Vérification via auth.isAdminSync()
 *
 * Anti-pattern évité :
 *  - Pas de blocage du flow chat (asynchrone, fire-and-forget)
 *  - Cap raw_text à 50 KB (sécurité Firebase + perf)
 *  - Pas de logs PII (raw_text non loggé)
 */
import { logger } from '../../core/logger.js';
import { auth } from '../auth/auth.js';
import { firebase } from '../storage/firebase.js';

/**
 * Patterns SBM (mois en MAJUSCULES + sections classiques planning casino).
 * Volontairement permissif sur les variations (avec/sans accent, Éq./Eq.).
 * v13.4.83 — Ajout patterns observés dans screenshots PDF Kevin :
 *  - "PLANNING PIT BOSS" titre PDF (header file)
 *  - "Pit Boss 15" section (header section)
 *  - "CCDP" / "POKER NO LIMIT" légendes lieux
 *  - "62224/62056" téléphones internes SBM
 */
const SBM_PATTERNS: readonly RegExp[] = [
  /MAI\s+\d{4}|JUIN\s+\d{4}|JUILLET\s+\d{4}|AOUT\s+\d{4}|AOÛT\s+\d{4}|SEPTEMBRE\s+\d{4}/i,
  /OCTOBRE\s+\d{4}|NOVEMBRE\s+\d{4}|DECEMBRE\s+\d{4}|DÉCEMBRE\s+\d{4}|JANVIER\s+\d{4}|FEVRIER\s+\d{4}|FÉVRIER\s+\d{4}|MARS\s+\d{4}|AVRIL\s+\d{4}/i,
  /BJ\s+Éq\.|BJ\s+Eq\.|RA\s+Éq\.|RA\s+Eq\.|CMC\s+Éq\.|CMC\s+Eq\./,
  /PIT\s+BOSS|SUPERVISEUR|INSPECTEUR|Pit\s+Boss\s+15/i,
  /PLANNING\s+PIT\s+BOSS|PLANNING\s+PÏT\s+BOSS/i, /* titre PDF SBM */
  /CCDP|POKER\s+NO\s+LIMIT/i, /* légendes lieux */
  /\b62224\/\d{4,5}\b/, /* téléphones internes SBM */
];

/** Taille minimum (chars) du texte pour qu'on tente la détection. */
const MIN_TEXT_LENGTH = 200;
/** Taille minimum pour push vers CMC (évite les snippets). */
const MIN_PUSH_LENGTH = 1000;
/** Cap dur sur le payload raw_text envoyé à Firebase. */
const MAX_RAW_TEXT = 50_000;

export interface DetectResult {
  detected: boolean;
  matches: string[];
  size: number;
}

export interface PushResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export type PlanningSource = 'chat' | 'paste' | 'voice';

/**
 * Détecte si un texte ressemble à un planning SBM.
 * Critère : au moins 2 patterns matchent + texte ≥ MIN_TEXT_LENGTH.
 */
export function detectSbmPlanning(text: string): DetectResult {
  if (!text || typeof text !== 'string' || text.length < MIN_TEXT_LENGTH) {
    return { detected: false, matches: [], size: text?.length ?? 0 };
  }
  const matched: string[] = [];
  for (const p of SBM_PATTERNS) {
    const m = text.match(p);
    if (m && m[0]) matched.push(m[0]);
  }
  return { detected: matched.length >= 2, matches: matched, size: text.length };
}

/**
 * Push un planning détecté vers Firebase `ax_cmc_planning_pending`.
 * Asynchrone, non-bloquant. Toujours résoud (pas de throw).
 *
 * Note : utilise un path dédié hors `apex/*` pour que CMCteams puisse
 * l'écouter sans dépendre de la whitelist FB_FIX Apex.
 */
export async function pushPlanningToCmc(
  rawText: string,
  source: PlanningSource = 'chat',
): Promise<PushResult> {
  if (!rawText || typeof rawText !== 'string') {
    return { ok: false, error: 'empty raw_text' };
  }
  /* v13.4.83 — Permission guard tier-aware (Kevin "vérifie tout en détail pour
   * tout le monde") : seul admin Kevin peut push vers CMCteams. Laurence,
   * family, client_pro, client_free → refusé. Isolation totale CLAUDE.md règle
   * "Laurence isolation totale + historique admin". */
  if (!auth.isAdminSync()) {
    logger.warn('cmc-planning-bridge', 'push refused : non-admin user', { source });
    return { ok: false, error: 'admin_only_cmc_push' };
  }
  try {
    const id = `pln_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      id,
      raw_text: rawText.slice(0, MAX_RAW_TEXT),
      source,
      ts: Date.now(),
      from_apex: true,
      processed: false,
      detected_at: new Date().toISOString(),
      truncated: rawText.length > MAX_RAW_TEXT,
      original_size: rawText.length,
    };
    /* Path dédié bridge — JAMAIS dans /apex/* (qui est gated par FB_FIX whitelist). */
    await firebase.write('ax_cmc_planning_pending/' + id, payload);
    logger.info('cmc-planning-bridge', 'planning push to CMC pending', {
      id,
      size: rawText.length,
      source,
      truncated: payload.truncated,
    });
    return { ok: true, id };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('cmc-planning-bridge', 'push failed', { error: errMsg });
    return { ok: false, error: errMsg };
  }
}

/**
 * Helper combiné : détecte + push si suffisamment volumineux.
 * Retourne `null` si non détecté ou trop petit.
 *
 * Utilisé depuis le handler chat pour rester non-bloquant :
 * `void detectAndPushIfPlanning(userText, 'chat').then(r => r && toast(...))`
 */
export async function detectAndPushIfPlanning(
  text: string,
  source: PlanningSource = 'chat',
): Promise<{ detection: DetectResult; push: PushResult } | null> {
  const detection = detectSbmPlanning(text);
  if (!detection.detected || detection.size < MIN_PUSH_LENGTH) {
    return null;
  }
  const push = await pushPlanningToCmc(text, source);
  return { detection, push };
}

/** Constantes exportées pour tests. */
export const _internals = {
  SBM_PATTERNS,
  MIN_TEXT_LENGTH,
  MIN_PUSH_LENGTH,
  MAX_RAW_TEXT,
};
