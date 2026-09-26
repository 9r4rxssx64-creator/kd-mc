/**
 * APEX v13.4.134 — Audit Honesty Watch (Kevin "Apex retient les leçons mieux que moi").
 *
 * Kevin 2026-05-15 : "Tu as encore menti ? Corrige tout pour ne plus reproduire
 * tout ça. Je veux qu'Apex retienne beaucoup mieux les leçons et que sa mémoire
 * fonctionne beaucoup mieux que toi."
 *
 * RÔLE : Détecte dans les réponses Apex IA (ou dans les messages user→admin)
 * les patterns "score estimé/projeté/devrait être" non mesurés. Si détecté :
 *  - Log warn dans audit
 *  - Push lesson dans ax_lessons_learned (cross-session)
 *  - Toast admin discret : "⚠ Apex tente estimation au lieu de mesure"
 *
 * Patterns détectés :
 *  - "score (estimé|projeté|attendu|devrait|environ|~) X/20"
 *  - "probablement X/100"
 *  - "supposé(e)? être à"
 *  - "devrait passer à"
 *
 * Sentinelle 24h : scan le dernier audit_log + ax_lessons_learned + chat assistant
 * messages pour ces patterns.
 */

import { logger } from '../../core/logger.js';

const ESTIMATION_PATTERNS = [
  /score\s+(?:estim[ée]|projet[ée]|attendu)/i,
  /(?:projet[ée]|estim[ée]|attendu|probable)\s*[~≈]?\s*\d+\s*\/\s*(?:20|100)/i,
  /(?:devrait|supposé?e?|censé?e?)\s+(?:être\s+à|passer\s+à|atteindre)\s+(?:à\s+)?\d+/i,
  /(?:devrait|supposé?e?|censé?e?)\s+(?:être|passer)\s+(?:à\s+)?\d+\s*\/\s*\d+/i,
  /post[\s-]*fix\s+\d+\s*\/\s*\d+\s*\(estim/i,
  /\(estim[ée]\)|\(projet[ée]\)/i,
  /~\s*\d+\s*\/\s*(?:20|100)/i,
];

interface HonestyAuditResult {
  ok: boolean;
  estimations_found: number;
  samples: string[];
}

function detectEstimations(text: string): { count: number; matches: string[] } {
  const matches: string[] = [];
  for (const pattern of ESTIMATION_PATTERNS) {
    const m = text.match(pattern);
    if (m) matches.push(m[0].slice(0, 80));
  }
  return { count: matches.length, matches };
}

async function scanRecentMessages(): Promise<HonestyAuditResult> {
  /* Scan derniers 50 messages chat assistant + audit_log entries */
  const samples: string[] = [];
  try {
    const conv = localStorage.getItem('apex_v13_conversation_active');
    if (conv) {
      const parsed = JSON.parse(conv) as Array<{ role: string; text: string }>;
      const assistantMsgs = parsed
        .filter((m) => m.role === 'assistant' && typeof m.text === 'string')
        .slice(-50);
      for (const m of assistantMsgs) {
        const d = detectEstimations(m.text);
        if (d.count > 0) samples.push(...d.matches);
      }
    }
  } catch { /* corrupt or absent : skip */ }
  return {
    ok: samples.length === 0,
    estimations_found: samples.length,
    samples: samples.slice(0, 10),
  };
}

async function escalateIfDetected(result: HonestyAuditResult): Promise<void> {
  if (result.ok) return;
  logger.warn(
    'audit-honesty-watch',
    `🚨 ${result.estimations_found} pattern(s) estimation détecté(s) dans réponses Apex IA`,
    { samples: result.samples },
  );
  /* Record lesson cross-session pour Apex IA */
  try {
    const { memory } = await import('../../core/memory.js');
    memory.recordLesson(
      'audit-quality',
      'JAMAIS estimer un score, toujours mesurer (Kevin 2026-05-15)',
      `Pattern "${result.samples[0] ?? '?'}" détecté. ` +
        'Quand audit dit X/20, ne PAS projeter Y après fixes. ' +
        'Re-mesurer via nouveau audit subagent. ' +
        'Patterns interdits : "score estimé", "devrait être", "~X/100", "post-fix Y/20".',
      'critical',
    );
  } catch (err: unknown) {
    logger.debug('audit-honesty-watch', 'recordLesson skipped', { err });
  }
}

export const auditHonestyWatch = {
  id: 'audit-honesty-watch',
  name: 'Audit Honesty (anti-estimation)',
  interval: 24 * 60 * 60 * 1000, /* 1× / 24h */
  async check(): Promise<{ ok: boolean; details: HonestyAuditResult }> {
    const result = await scanRecentMessages();
    if (!result.ok) await escalateIfDetected(result);
    return { ok: result.ok, details: result };
  },
  detectEstimations,
  scanRecentMessages,
};
