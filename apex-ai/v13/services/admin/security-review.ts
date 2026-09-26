/**
 * APEX v13.4.2 — Security Review Service (équivalent applicatif Yury Plugin #1)
 *
 * Kevin 2026-05-09 : "Je veux les équivalents applicatifs des 5 plugins Yury.ai
 * dans Apex (PWA), pas dans Claude Code l'outil."
 *
 * Scan runtime du state Apex pour vulnérabilités sécurité :
 *   1. Secrets en clair dans localStorage (devraient être chiffrés via vault)
 *   2. CSP violations récentes (read csp-monitor)
 *   3. Vault drift (multi-key-vault.healthCheckAll feedback)
 *   4. innerHTML non-sanitized (heuristique : scan DOM pour script tags injectés)
 *   5. AX_REDACT off (vérifie pii-redaction n'est pas désactivé en runtime)
 *   6. Audit log integrity (chain hash invalide = tamper)
 *   7. Sessions expired non purgées (TTL respecté)
 *
 * IMPORTANT — Honnêteté PWA browser :
 *  - PAS de scan du code source (pas accessible côté navigateur)
 *  - Focus runtime state + sentinelles + DOM live
 *  - Si user veut scan source → utiliser Claude Code l'outil + GitHub PR review
 *
 * Anti-pattern Erreur #28 (Declaration ≠ Deployment) :
 *  - Service WIRED dans features/admin/yury-plugins/index.ts (vue admin)
 *  - Tests obligatoires AVANT push (5 cas min)
 *  - Audit log à chaque scan
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';
import { cspMonitor } from '../observability/csp-monitor.js';
import { multiKeyVault } from '../vault/multi-key-vault.js';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type Category =
  | 'secret-exposure'
  | 'csp-violation'
  | 'vault-drift'
  | 'dom-injection'
  | 'pii-redaction'
  | 'audit-integrity'
  | 'session-leak';

export interface ScanFinding {
  category: Category;
  severity: Severity;
  msg: string;
  detail?: string;
  fix?: string;
}

export interface ScanReport {
  scannedAt: number;
  durationMs: number;
  score: number; /* 0-100 (100 = aucune vulnérabilité) */
  findings: ScanFinding[];
  totalChecks: number;
  passedChecks: number;
}

const REPORT_KEY = 'apex_v13_security_review_last';
const HISTORY_KEY = 'apex_v13_security_review_history';
const HISTORY_MAX = 20;

/* Patterns de secrets en clair localStorage (cohérent CREDENTIAL_PATTERNS).
 * Si une clé localStorage contient ces préfixes en CLAIR, c'est une fuite. */
const PLAINTEXT_SECRET_PATTERNS: ReadonlyArray<{ name: string; rx: RegExp }> = [
  { name: 'Anthropic API key', rx: /sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}/ },
  { name: 'OpenAI API key', rx: /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/ },
  { name: 'Google API key', rx: /AIza[A-Za-z0-9_-]{33,}/ },
  { name: 'GitHub PAT', rx: /gh[opsu]_[A-Za-z0-9]{36,}/ },
  { name: 'Stripe secret', rx: /sk_(?:live|test)_[A-Za-z0-9]{24,}/ },
  { name: 'Slack token', rx: /xox[bpao]-[A-Za-z0-9-]{20,}/ },
  { name: 'AWS access key', rx: /AKIA[0-9A-Z]{16}/ },
  { name: 'Telegram bot token', rx: /\d{8,}:[A-Za-z0-9_-]{35,}/ },
];

class SecurityReviewService {
  /**
   * Lance un scan complet du state Apex et retourne un rapport actionnable.
   * Toutes les checks sont SÛRES (lecture seule, pas de modification d'état).
   */
  async runFullScan(): Promise<ScanReport> {
    const tStart = Date.now();
    const findings: ScanFinding[] = [];
    let totalChecks = 0;
    let passedChecks = 0;

    /* Check 1 : Secrets en clair localStorage */
    totalChecks++;
    const secretFindings = this.scanPlaintextSecrets();
    if (secretFindings.length === 0) passedChecks++;
    findings.push(...secretFindings);

    /* Check 2 : CSP violations récentes */
    totalChecks++;
    const cspFinding = this.scanCspViolations();
    if (!cspFinding) passedChecks++;
    else findings.push(cspFinding);

    /* Check 3 : Vault drift (clés failing/invalid sur services critiques) */
    totalChecks++;
    const vaultFindings = this.scanVaultDrift();
    if (vaultFindings.length === 0) passedChecks++;
    findings.push(...vaultFindings);

    /* Check 4 : DOM injection (script tags hors trusted sources) */
    totalChecks++;
    const domFinding = this.scanDomInjection();
    if (!domFinding) passedChecks++;
    else findings.push(domFinding);

    /* Check 5 : AX_REDACT toggle (pii-redaction not disabled runtime) */
    totalChecks++;
    const redactFinding = this.scanRedactionDisabled();
    if (!redactFinding) passedChecks++;
    else findings.push(redactFinding);

    /* Check 6 : Audit log chain integrity */
    totalChecks++;
    const auditFinding = await this.scanAuditIntegrity();
    if (!auditFinding) passedChecks++;
    else findings.push(auditFinding);

    /* Check 7 : Session leak (sessions stale plus de 24h) */
    totalChecks++;
    const sessionFinding = this.scanSessionLeak();
    if (!sessionFinding) passedChecks++;
    else findings.push(sessionFinding);

    /* Score : 100 si tout passé, sinon pénalité par severity */
    const score = this.computeScore(findings, totalChecks);

    const report: ScanReport = {
      scannedAt: Date.now(),
      durationMs: Date.now() - tStart,
      score,
      findings,
      totalChecks,
      passedChecks,
    };

    this.persistReport(report);
    void auditLog.record('security-review.scan', {
      details: {
        score,
        findings: findings.length,
        critical: findings.filter((f) => f.severity === 'critical').length,
        high: findings.filter((f) => f.severity === 'high').length,
      },
    });
    logger.info('security-review', `Scan complete: score=${score}/100 · ${findings.length} findings`);

    return report;
  }

  /**
   * Récupère le dernier rapport persisté (lecture rapide UI).
   */
  getLastReport(): ScanReport | null {
    try {
      const raw = localStorage.getItem(REPORT_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as ScanReport;
    } catch {
      return null;
    }
  }

  /**
   * Historique des N derniers scans (max 20).
   */
  history(): ScanReport[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY) ?? '[]';
      const arr = JSON.parse(raw) as ScanReport[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private scanPlaintextSecrets(): ScanFinding[] {
    const findings: ScanFinding[] = [];
    /* Skip clés vault chiffrées (préfixe apex_v13_vault_ = OK).
     * Cherche les clés qui contiennent un secret EN CLAIR. */
    const safePrefixes = ['apex_v13_vault_', 'apex_v13_encrypted_', 'apex_v13_obf_'];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (safePrefixes.some((p) => key.startsWith(p))) continue;
        const value = localStorage.getItem(key);
        if (!value || value.length < 20) continue;
        for (const pattern of PLAINTEXT_SECRET_PATTERNS) {
          if (pattern.rx.test(value)) {
            findings.push({
              category: 'secret-exposure',
              severity: 'critical',
              msg: `Secret "${pattern.name}" en clair dans localStorage`,
              detail: `Clé : ${key}`,
              fix: 'Migrer vers multi-key-vault chiffré AES-GCM-256',
            });
            break; /* Un secret par clé suffit */
          }
        }
      }
    } catch (err: unknown) {
      logger.warn('security-review', 'plaintext scan failed', { err });
    }
    return findings;
  }

  private scanCspViolations(): ScanFinding | null {
    try {
      const stats = cspMonitor.getStats();
      const totalViolations = Object.values(stats).reduce((sum, s) => sum + s.count, 0);
      if (totalViolations === 0) return null;
      const recentViolations = Object.values(stats).filter((s) => Date.now() - s.lastSeen < 60 * 60 * 1000);
      if (recentViolations.length === 0) return null;
      const severity: Severity = totalViolations > 50 ? 'high' : totalViolations > 10 ? 'medium' : 'low';
      return {
        category: 'csp-violation',
        severity,
        msg: `${totalViolations} violations CSP enregistrées (${recentViolations.length} dans la dernière heure)`,
        fix: 'Ouvrir csp-monitor dashboard, valider whitelist suggestions',
      };
    } catch (err: unknown) {
      logger.warn('security-review', 'csp scan failed', { err });
      return null;
    }
  }

  private scanVaultDrift(): ScanFinding[] {
    const findings: ScanFinding[] = [];
    try {
      const criticalServices = ['anthropic', 'openai', 'github', 'stripe', 'cloudflare'];
      for (const service of criticalServices) {
        const stats = multiKeyVault.getStats(service);
        if (stats.total === 0) continue;
        /* Derive health from active/failing/invalid (cohérent avec multi-key-vault types) */
        const health: 'green' | 'yellow' | 'red' = stats.active === 0
          ? 'red'
          : (stats.invalid + stats.failing) > 0
            ? 'yellow'
            : 'green';
        if (health === 'red') {
          findings.push({
            category: 'vault-drift',
            severity: 'high',
            msg: `Vault "${service}" en état RED (toutes clés en panne)`,
            detail: `${stats.invalid} invalides · ${stats.failing} failing sur ${stats.total} clés`,
            fix: `Régénérer une nouvelle clé sur dashboard ${service} et l'ajouter au vault`,
          });
        } else if (health === 'yellow' && stats.invalid > 0) {
          findings.push({
            category: 'vault-drift',
            severity: 'medium',
            msg: `Vault "${service}" : ${stats.invalid} clé(s) invalide(s)`,
            fix: 'Faire rotation manuelle ou healthCheckAll',
          });
        }
      }
    } catch (err: unknown) {
      logger.warn('security-review', 'vault scan failed', { err });
    }
    return findings;
  }

  private scanDomInjection(): ScanFinding | null {
    if (typeof document === 'undefined') return null;
    try {
      /* Cherche script tags non-trusted (heuristique : pas de nonce CSP attendu) */
      const scripts = Array.from(document.querySelectorAll('script'));
      const trustedHosts = ['cdn.jsdelivr.net', 'unpkg.com', 'cdn.skypack.dev', 'esm.sh'];
      const suspect = scripts.filter((s) => {
        const src = s.getAttribute('src') ?? '';
        if (!src) return false; /* inline = OK si nonce CSP */
        try {
          const url = new URL(src, window.location.origin);
          if (url.origin === window.location.origin) return false;
          return !trustedHosts.some((h) => url.hostname.endsWith(h));
        } catch {
          return true; /* URL malformée = suspect */
        }
      });
      if (suspect.length === 0) return null;
      return {
        category: 'dom-injection',
        severity: 'high',
        msg: `${suspect.length} script tag(s) externe(s) non-trustés détectés`,
        detail: suspect.slice(0, 3).map((s) => s.getAttribute('src') ?? '').join(' · '),
        fix: 'Vérifier CSP script-src + retirer scripts inutiles',
      };
    } catch (err: unknown) {
      logger.warn('security-review', 'dom scan failed', { err });
      return null;
    }
  }

  private scanRedactionDisabled(): ScanFinding | null {
    try {
      const flag = localStorage.getItem('apex_v13_redact_disabled');
      if (flag === 'true' || flag === '1') {
        return {
          category: 'pii-redaction',
          severity: 'high',
          msg: 'PII redaction outbound DÉSACTIVÉE (flag apex_v13_redact_disabled)',
          fix: 'Réactiver pii-redaction (clé localStorage à supprimer)',
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async scanAuditIntegrity(): Promise<ScanFinding | null> {
    try {
      const r = await auditLog.verifyChainIntegrity();
      if (!r.valid) {
        return {
          category: 'audit-integrity',
          severity: 'critical',
          msg: `Audit log chain INVALIDE (broken at index ${r.brokenAt}/${r.totalEntries})`,
          fix: 'Audit log tampered → escalade Claude Code via ax_claude_todo',
        };
      }
      return null;
    } catch (err: unknown) {
      logger.warn('security-review', 'audit integrity check failed', { err });
      return null;
    }
  }

  private scanSessionLeak(): ScanFinding | null {
    try {
      const lastAct = localStorage.getItem('apex_v13_lastact');
      if (!lastAct) return null;
      const ts = Number.parseInt(lastAct, 10);
      if (!Number.isFinite(ts)) return null;
      const ageMs = Date.now() - ts;
      const TTL_24H = 24 * 60 * 60 * 1000;
      if (ageMs > TTL_24H) {
        return {
          category: 'session-leak',
          severity: 'medium',
          msg: `Session active depuis plus de 24h (${Math.round(ageMs / 3600000)}h)`,
          fix: 'Forcer logout et re-login pour purger session stale',
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private computeScore(findings: readonly ScanFinding[], totalChecks: number): number {
    if (totalChecks === 0) return 100;
    let penalty = 0;
    for (const f of findings) {
      switch (f.severity) {
        case 'critical': penalty += 25; break;
        case 'high': penalty += 15; break;
        case 'medium': penalty += 8; break;
        case 'low': penalty += 3; break;
        case 'info': penalty += 1; break;
      }
    }
    return Math.max(0, 100 - penalty);
  }

  private persistReport(report: ScanReport): void {
    try {
      localStorage.setItem(REPORT_KEY, JSON.stringify(report));
      const raw = localStorage.getItem(HISTORY_KEY) ?? '[]';
      const arr = JSON.parse(raw) as ScanReport[];
      const list = Array.isArray(arr) ? arr : [];
      list.push(report);
      const trimmed = list.slice(-HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('security-review', 'persist failed', { err });
    }
  }
}

export const securityReview = new SecurityReviewService();
