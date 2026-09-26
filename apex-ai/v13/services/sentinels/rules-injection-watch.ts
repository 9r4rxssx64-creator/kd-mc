/**
 * APEX v13.4.4 — Sentinelle `rules-injection-watch` (Kevin "auto-vérification permanente").
 *
 * Tourne 1×/h. Audit que `memory.buildSystemPromptDeep()` contient bien :
 *   1. Règles permanentes CLAUDE.md (top 7)
 *   2. Top 10 erreurs documentées
 *   3. Section "Méthode de travail expert"
 *   4. Skills .claude/skills/ (au moins 1)
 *   5. Capabilities recent (v13.4.0+)
 *
 * Si une section manque :
 *   - Re-fetch docs + meta (memory.syncDocsAtBoot + syncMetaFilesAtBoot avec forceRefresh)
 *   - Push audit log dans `apex_v13_rules_injection_audit`
 *   - Si 3 fails consécutifs → escalade `ax_claude_todo` critical
 *
 * Idempotent : appelé via sentinelsManager.register au bootstrap.
 */

import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { rulesEngine } from '../core-svc/rules-engine.js';

export interface InjectionAuditReport {
  ts: number;
  ok: boolean;
  missing: string[];
  promptSize: number;
  details: {
    hasRulesSection: boolean;
    hasErrorsSection: boolean;
    hasMethodSection: boolean;
    hasSkillsSection: boolean;
    hasCapabilitiesSection: boolean;
  };
}

const AUDIT_KEY = 'apex_v13_rules_injection_audit';
const FAIL_COUNTER_KEY = 'apex_v13_rules_injection_fail_count';
const MAX_AUDIT_ENTRIES = 30;
const ESCALATION_THRESHOLD = 3;

class RulesInjectionWatch {
  /**
   * Audit complet : reconstruit le prompt et grep les sections.
   */
  async audit(currentUser: { id: string; name: string } | null = null): Promise<InjectionAuditReport> {
    const ts = Date.now();
    let prompt = '';
    try {
      prompt = await memory.buildSystemPromptDeep(currentUser);
    } catch (err: unknown) {
      logger.warn('rules-injection-watch', 'buildSystemPromptDeep failed', { err });
      prompt = '';
    }

    const details = {
      hasRulesSection: /Top\s+règles\s+permanentes/i.test(prompt) || /Règles\s+permanentes/i.test(prompt),
      hasErrorsSection: /Top\s+10\s+erreurs|erreurs\s+documentées/i.test(prompt),
      hasMethodSection: /Méthode\s+de\s+travail|workflow\s+expert/i.test(prompt),
      hasSkillsSection: /Skills\s+disponibles|🛠️/i.test(prompt),
      hasCapabilitiesSection: /capacités\s+récentes|v13\.4\.0/i.test(prompt),
    };

    const missing: string[] = [];
    if (!details.hasRulesSection) missing.push('rules');
    if (!details.hasErrorsSection) missing.push('errors');
    if (!details.hasMethodSection) missing.push('method');
    if (!details.hasSkillsSection) missing.push('skills');
    if (!details.hasCapabilitiesSection) missing.push('capabilities');

    const ok = missing.length === 0;
    const report: InjectionAuditReport = {
      ts,
      ok,
      missing,
      promptSize: prompt.length,
      details,
    };

    this.persistAudit(report);

    if (!ok) {
      const fails = this.bumpFailCount();
      logger.warn('rules-injection-watch', `Audit FAIL (missing: ${missing.join(', ')}) — count=${fails}`);
      /* Tentative auto-fix : refresh des caches */
      try {
        await memory.syncDocsAtBoot({ forceRefresh: true });
        await memory.syncMetaFilesAtBoot({ forceRefresh: true });
        logger.info('rules-injection-watch', 'auto-fix : caches refreshed');
      } catch (err: unknown) {
        logger.warn('rules-injection-watch', 'auto-fix refresh failed', { err });
      }
      if (fails >= ESCALATION_THRESHOLD) {
        this.escalate(report);
      }
    } else {
      this.resetFailCount();
    }

    return report;
  }

  /**
   * v13.4.4 — Compteur prompt-OK pour dashboard.
   */
  getRecentAudits(n = 10): InjectionAuditReport[] {
    try {
      const raw = localStorage.getItem(AUDIT_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as InjectionAuditReport[];
      return Array.isArray(arr) ? arr.slice(-n) : [];
    } catch {
      return [];
    }
  }

  getStats(): { auditsLast24h: number; passRate: number; lastAudit: InjectionAuditReport | null } {
    const audits = this.getRecentAudits(MAX_AUDIT_ENTRIES);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = audits.filter((a) => a.ts >= cutoff);
    const passes = recent.filter((a) => a.ok).length;
    return {
      auditsLast24h: recent.length,
      passRate: recent.length > 0 ? passes / recent.length : 0,
      lastAudit: audits.at(-1) ?? null,
    };
  }

  /**
   * Enregistre la sentinelle dans le manager.
   * Appelé manuellement (pas dans le module register-extras qu'on ne touche pas).
   */
  registerSentinel(): boolean {
    try {
      /* Lazy import — évite cycle de modules */
      void import('./sentinels.js')
        .then((mod) => {
          const m = mod as { sentinelsManager?: { register: (s: unknown) => void } };
          if (!m.sentinelsManager) return;
          m.sentinelsManager.register({
            id: 'rules-injection-watch',
            name: 'Rules injection watch',
            desc: 'Vérifie que system prompt IA contient règles + erreurs + skills (1×/h)',
            intervalMs: 60 * 60 * 1000,
            check: async () => {
              const r = await this.audit();
              return {
                ok: r.ok,
                msg: r.ok
                  ? `OK (${r.promptSize} chars, 5 sections présentes)`
                  : `FAIL : sections manquantes ${r.missing.join(', ')}`,
                details: r.details as unknown as Record<string, unknown>,
              };
            },
            autoFix: async () => {
              try {
                await memory.syncDocsAtBoot({ forceRefresh: true });
                await memory.syncMetaFilesAtBoot({ forceRefresh: true });
                /* Force re-eval rules cache */
                rulesEngine.list();
                return { ok: true, msg: 'Caches docs + meta rafraîchis' };
              } catch (err: unknown) {
                return { ok: false, msg: `auto-fix failed: ${String(err)}` };
              }
            },
          });
        })
        .catch((err: unknown) => logger.warn('rules-injection-watch', 'registerSentinel failed', { err }));
      return true;
    } catch (err: unknown) {
      logger.warn('rules-injection-watch', 'registerSentinel sync failed', { err });
      return false;
    }
  }

  private persistAudit(report: InjectionAuditReport): void {
    try {
      const raw = localStorage.getItem(AUDIT_KEY);
      const arr: InjectionAuditReport[] = raw ? (JSON.parse(raw) as InjectionAuditReport[]) : [];
      arr.push(report);
      const trimmed = arr.slice(-MAX_AUDIT_ENTRIES);
      localStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed));
    } catch {
      /* quota — ignore */
    }
  }

  private bumpFailCount(): number {
    try {
      const cur = parseInt(localStorage.getItem(FAIL_COUNTER_KEY) ?? '0', 10) || 0;
      const next = cur + 1;
      localStorage.setItem(FAIL_COUNTER_KEY, String(next));
      return next;
    } catch {
      return 0;
    }
  }

  private resetFailCount(): void {
    try {
      localStorage.removeItem(FAIL_COUNTER_KEY);
    } catch {
      /* ignore */
    }
  }

  private escalate(report: InjectionAuditReport): void {
    try {
      const raw = localStorage.getItem('ax_claude_todo');
      const arr = raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
      arr.push({
        id: `rules_injection_fail_${report.ts}`,
        kind: 'critical',
        title: 'Rules injection broken (3+ consecutive fails)',
        description: `system prompt missing sections: ${report.missing.join(', ')}. promptSize=${report.promptSize}`,
        ts: report.ts,
        source: 'rules-injection-watch',
      });
      const trimmed = arr.slice(-100);
      localStorage.setItem('ax_claude_todo', JSON.stringify(trimmed));
      logger.error('rules-injection-watch', 'ESCALATED to ax_claude_todo critical', { missing: report.missing });
    } catch (err: unknown) {
      logger.warn('rules-injection-watch', 'escalation persist failed', { err });
    }
  }
}

export const rulesInjectionWatch = new RulesInjectionWatch();
