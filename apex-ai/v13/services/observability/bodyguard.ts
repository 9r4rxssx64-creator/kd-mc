/**
 * APEX v13 — Bodyguard runtime (P1 audit)
 *
 * Listeners CSP violations + postMessage cross-frame + devtools detect.
 * Log toutes anomalies dans audit log immutable.
 *
 * Anti-pattern v12.785 : pas de monitoring runtime, attaques silencieuses.
 */

import { logger } from '../../core/logger.js';
import { storageCompressor } from '../storage/storage-compressor.js';

import { auditLog } from './audit-log.js';

const CSP_VIOLATIONS_KEY = 'ax_csp_violations_log';
const CSP_VIOLATIONS_CAP = 100;

export interface CSPViolationEntry {
  ts: number;
  directive: string;
  blockedURI: string;
  sourceFile: string;
  lineNumber: number;
  columnNumber: number;
}

/** Enregistre une violation CSP dans `ax_csp_violations_log` (cap 100, FIFO). */
export function recordCSPViolation(e: SecurityPolicyViolationEvent): CSPViolationEntry {
  const entry: CSPViolationEntry = {
    ts: Date.now(),
    directive: String(e.violatedDirective || '').slice(0, 100),
    blockedURI: String(e.blockedURI || '').slice(0, 200),
    sourceFile: String(e.sourceFile || '').slice(0, 200),
    lineNumber: e.lineNumber || 0,
    columnNumber: e.columnNumber || 0,
  };
  try {
    /* v13.3.94 P0.3 — décompresse si __LZ__ avant JSON.parse (storageCompressor
     * peut compresser ce key au-dessus du seuil 1KB lors de migrateAllToCompressed). */
    const log: CSPViolationEntry[] = storageCompressor.safeParseJSON<CSPViolationEntry[]>(
      CSP_VIOLATIONS_KEY,
      [],
    );
    log.push(entry);
    /* FIFO cap 100 */
    const trimmed = log.length > CSP_VIOLATIONS_CAP ? log.slice(-CSP_VIOLATIONS_CAP) : log;
    localStorage.setItem(CSP_VIOLATIONS_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / parse error : silencieux (CSP listener doit jamais throw) */
  }
  return entry;
}

/** Liste les violations CSP enregistrées (max 100, ordre chrono). */
export function getCSPViolations(): CSPViolationEntry[] {
  /* v13.3.94 P0.3 — décompresse si __LZ__ avant JSON.parse */
  return storageCompressor.safeParseJSON<CSPViolationEntry[]>(CSP_VIOLATIONS_KEY, []);
}

/** Vide l'historique violations CSP (admin only — appelé après review). */
export function clearCSPViolations(): void {
  try {
    localStorage.removeItem(CSP_VIOLATIONS_KEY);
  } catch {
    /* noop */
  }
}

class Bodyguard {
  private installed = false;

  install(): void {
    if (this.installed) return;
    this.installed = true;

    /* CSP violations — toute tentative d'injection de script externe */
    document.addEventListener('securitypolicyviolation', (e) => {
      logger.error('bodyguard', `CSP violation: ${e.violatedDirective}`, {
        blockedURI: e.blockedURI,
        sourceFile: e.sourceFile,
        lineNumber: e.lineNumber,
      });
      /* Stocker dans ax_csp_violations_log (cap 100) pour vue admin + sentinelle */
      recordCSPViolation(e);
      void auditLog.record('security.csp_violation', {
        details: {
          directive: e.violatedDirective,
          blockedURI: String(e.blockedURI).slice(0, 200),
          sourceFile: String(e.sourceFile).slice(0, 200),
        },
      });
    });

    /* postMessage cross-frame externe = potentiellement malveillant */
    window.addEventListener('message', (e) => {
      if (!e.origin) return;
      const trusted = ['https://www.google.com', 'https://www.youtube.com', location.origin];
      if (!trusted.includes(e.origin)) {
        logger.warn('bodyguard', `postMessage external: ${e.origin}`);
        void auditLog.record('security.postmessage_external', {
          details: { origin: e.origin, dataPreview: String(e.data).slice(0, 100) },
        });
      }
    });

    /* visibilitychange = utile pour rotation tokens / verify session */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      void auditLog.record('session.visible', {});
    });
  }
}

export const bodyguard = new Bodyguard();
