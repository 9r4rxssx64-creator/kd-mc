/**
 * APEX v13 — Vue Self-Diagnostic
 *
 * Port v12 vSelfDiag : auto-audit système.
 *
 * - Bouton "🔍 Lancer audit complet" → spinner + résultats
 * - 6 axes /20 : Sécurité, Perf, UX, Tests, Architecture, AI Safety
 * - Score total /100 avec couleur
 * - Liste findings P0/P1/P2 cliquables → détail
 * - Section "Lessons learned" : timeline 50 dernières
 * - Section "Sentinelles" : 13+ sentinelles avec status
 * - Bouton "Force re-audit" + "Export rapport PDF"
 *
 * Anti-patterns évités :
 * - escapeHtml partout
 * - Lazy-load apex-self-audit (gros)
 * - Pas de blocage UI pendant audit (async)
 */

import { escapeHtml } from '../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { type AuditAxis, type AuditReport, type Finding, type Severity } from '../../services/admin/apex-self-audit.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

/* P1-6 (audit v13.2.7) : scope listener pour anti-leak SPA. */
let activeDiagScope: CleanupScope | null = null;

export function dispose(): void {
  activeDiagScope?.cleanup();
  activeDiagScope = null;
}

const AXES_META: Record<AuditAxis, { icon: string; label: string }> = {
  security: { icon: '🔒', label: 'Sécurité' },
  performance: { icon: '⚡', label: 'Performance' },
  ux: { icon: '🎨', label: 'UX' },
  tests: { icon: '🧪', label: 'Tests' },
  architecture: { icon: '🏗', label: 'Architecture' },
  ai_safety: { icon: '🤖', label: 'AI Safety' },
};

const SEVERITY_META: Record<Severity, { color: string; icon: string; label: string }> = {
  p0_critical: { color: '#ff5858', icon: '🚨', label: 'P0 Critical' },
  p1_high: { color: '#ff8c42', icon: '⚠️', label: 'P1 High' },
  p2_medium: { color: '#ffaa00', icon: '🟡', label: 'P2 Medium' },
  p3_low: { color: '#5aa8ff', icon: 'ℹ️', label: 'P3 Low' },
  info: { color: '#888', icon: '💡', label: 'Info' },
};

/**
 * Calcule la couleur du score total selon le seuil.
 */
export function scoreColor(score: number): string {
  if (score >= 90) return '#22cc77';
  if (score >= 75) return '#a0c878';
  if (score >= 60) return '#ffaa00';
  if (score >= 40) return '#ff8c42';
  return '#ff5858';
}

/**
 * Calcule le grade textuel (A/B/C/D/F) selon le score.
 */
export function scoreGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Filtre les findings par sévérité.
 */
export function filterFindingsBySeverity(
  findings: ReadonlyArray<Finding>,
  minSeverity: Severity,
): Finding[] {
  const order: Record<Severity, number> = {
    p0_critical: 5,
    p1_high: 4,
    p2_medium: 3,
    p3_low: 2,
    info: 1,
  };
  const min = order[minSeverity];
  return findings.filter((f) => order[f.severity] >= min);
}

/**
 * Récupère les lessons learned depuis localStorage.
 */
export interface LessonLearned {
  id: string;
  category: string;
  title: string;
  text: string;
  severity: 'info' | 'warn' | 'critical';
  ts: number;
  resolved?: boolean;
}

export function loadLessons(): LessonLearned[] {
  try {
    const raw = localStorage.getItem('ax_lessons_learned_struct') ?? '[]';
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is LessonLearned => {
      if (x === null || typeof x !== 'object') return false;
      const o = x as Partial<LessonLearned>;
      return typeof o.id === 'string' && typeof o.title === 'string' && typeof o.ts === 'number';
    });
  } catch {
    return [];
  }
}

let activeReport: AuditReport | null = null;
let auditRunning = false;
let activeSeverityFilter: Severity = 'p2_medium';

function renderScoreCard(report: AuditReport): string {
  const color = scoreColor(report.total_score);
  const grade = scoreGrade(report.total_score);
  return `
    <div class="ax-score-card" style="background:rgba(20,20,35,0.6);border:1px solid rgba(255,255,255,0.05);border-radius:14px;padding:20px;margin-bottom:16px;border-left:4px solid ${color}">
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <div style="flex-shrink:0">
          <div style="font-size:64px;font-weight:900;color:${color};line-height:1;font-family:Georgia,serif">${report.total_score}</div>
          <div style="font-size:12px;color:#a0a4c0;margin-top:4px">/ 100</div>
        </div>
        <div class="ax-gs-11">
          <div style="font-size:24px;font-weight:700;color:${color}">Note ${escapeHtml(grade)}</div>
          <div style="font-size:12px;color:#a0a4c0;margin-top:2px">${escapeHtml(new Date(report.ts).toLocaleString('fr-FR'))}</div>
          <div style="font-size:11px;color:#888;margin-top:4px">Durée audit : ${report.duration_ms}ms</div>
        </div>
        <div class="ax-gs-7">
          <div style="background:rgba(34,204,119,.1);padding:8px 12px;border-radius:8px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:#22cc77">${report.auto_fixed_count}</div>
            <div class="ax-gs-74">Auto-fixed</div>
          </div>
          <div style="background:rgba(168,120,255,.1);padding:8px 12px;border-radius:8px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:#a878ff">${report.escalated_count}</div>
            <div class="ax-gs-74">Escaladés</div>
          </div>
          <div style="background:rgba(255,88,88,.1);padding:8px 12px;border-radius:8px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:#ff5858">${report.total_findings}</div>
            <div class="ax-gs-74">Findings</div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderAxesGrid(report: AuditReport): string {
  return `
    <section class="ax-gs-217">
      <h3 class="ax-gs-326">📊 Scores par axe (/20)</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
        ${(Object.keys(AXES_META) as AuditAxis[]).map((axis) => {
          const data = report.axes[axis];
          const meta = AXES_META[axis];
          const col = data.score >= 18 ? '#22cc77' : data.score >= 14 ? '#a0c878' : data.score >= 10 ? '#ffaa00' : '#ff5858';
          return `
            <div style="background:rgba(20,20,35,0.6);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:12px;text-align:center;border-left:3px solid ${col}">
              <div style="font-size:24px;margin-bottom:4px">${escapeHtml(meta.icon)}</div>
              <div style="font-size:18px;font-weight:900;color:${col}">${data.score}/20</div>
              <div style="font-size:11px;color:#a0a4c0;margin-top:2px">${escapeHtml(meta.label)}</div>
              <div style="font-size:10px;color:#888;margin-top:2px">${data.findings_count} finding${data.findings_count > 1 ? 's' : ''}</div>
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

function renderFindings(findings: ReadonlyArray<Finding>): string {
  const filtered = filterFindingsBySeverity(findings, activeSeverityFilter);
  if (filtered.length === 0) return '<p style="color:#a0a4c0;font-size:12px;padding:20px;text-align:center">Aucun finding pour ce filtre.</p>';
  return filtered
    .slice(0, 50)
    .map((f) => {
      const meta = SEVERITY_META[f.severity];
      const status = f.auto_fix_success ? '✅ Auto-fixed' : f.escalated_to_claude ? '📤 Escaladé Claude' : '🚨 À traiter';
      return `
        <div style="background:rgba(20,20,35,0.5);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:12px;margin-bottom:6px;border-left:3px solid ${meta.color}">
          <div class="ax-gs-122">
            <span style="background:rgba(${f.severity === 'p0_critical' ? '255,88,88' : f.severity === 'p1_high' ? '255,140,66' : '255,170,0'},.15);color:${meta.color};font-size:10px;padding:2px 6px;border-radius:4px;font-weight:700">${meta.icon} ${escapeHtml(meta.label)}</span>
            <span class="ax-gs-138">${escapeHtml(f.axis)}</span>
            <span class="ax-gs-163">${escapeHtml(status)}</span>
          </div>
          <strong style="color:#fff;font-size:13px;display:block">${escapeHtml(f.title)}</strong>
          <p style="margin:4px 0 0;color:#a0a4c0;font-size:11px;line-height:1.4">${escapeHtml(f.description)}</p>
          ${f.fix_action ? `<p style="margin:4px 0 0;color:#22cc77;font-size:11px"><strong>Fix :</strong> ${escapeHtml(f.fix_action)}</p>` : ''}
        </div>`;
    })
    .join('');
}

function renderLessons(lessons: ReadonlyArray<LessonLearned>): string {
  if (lessons.length === 0) {
    return '<p style="color:#a0a4c0;font-size:12px">Aucune lesson learned pour le moment.</p>';
  }
  const sorted = [...lessons].sort((a, b) => b.ts - a.ts).slice(0, 50);
  return sorted
    .map((l) => {
      const sevColor = l.severity === 'critical' ? '#ff5858' : l.severity === 'warn' ? '#ffaa00' : '#5aa8ff';
      const date = new Date(l.ts).toLocaleString('fr-FR');
      return `
        <div style="padding:8px 10px;background:rgba(20,20,35,0.5);border-radius:8px;margin-bottom:4px;border-left:3px solid ${sevColor}">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap">
            <strong class="ax-gs-395">${escapeHtml(l.title)}</strong>
            <span style="background:rgba(168,120,255,.1);color:#a878ff;font-size:10px;padding:1px 5px;border-radius:4px">${escapeHtml(l.category)}</span>
            ${l.resolved ? '<span style="color:#22cc77;font-size:10px">✅ Résolu</span>' : ''}
            <span class="ax-gs-163">${escapeHtml(date)}</span>
          </div>
          <p class="ax-gs-396">${escapeHtml(l.text.slice(0, 200))}${l.text.length > 200 ? '...' : ''}</p>
        </div>`;
    })
    .join('');
}

export async function render(rootEl: HTMLElement): Promise<void> {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeDiagScope?.cleanup();
  activeDiagScope = createCleanupScope('self-diag');
  /* Try to load last report from service */
  if (!activeReport) {
    try {
      const { apexSelfAudit } = await import('../../services/admin/apex-self-audit.js');
      activeReport = apexSelfAudit.getLastReport();
    } catch (err: unknown) {
      logger.warn('feature-self-diag', 'load last report failed', { err });
    }
  }

  const lessons = loadLessons();

  /* Lazy-load sentinels for status counts */
  let sentinelsList: ReadonlyArray<{ id: string; name: string; lastResult?: { ok: boolean; msg: string; ts: number } }> = [];
  try {
    const { sentinels } = await import('../../services/sentinels/sentinels.js');
    sentinelsList = sentinels.list();
  } catch { /* skip */ }
  const sentOk = sentinelsList.filter((s) => s.lastResult?.ok).length;
  const sentWarn = sentinelsList.filter((s) => s.lastResult && !s.lastResult.ok).length;
  const sentPending = sentinelsList.filter((s) => !s.lastResult).length;

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-268">
      <header class="ax-gs-181">
        <h1 class="ax-gs-324">🩺 Auto-diagnostic Apex</h1>
        <p class="ax-gs-325">
          Apex se teste lui-même : sécurité, perf, UX, tests, architecture, AI safety. Audit subagent indépendant.
        </p>
      </header>

      <section style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button id="ax-diag-run" class="ax-btn ax-btn-primary" ${auditRunning ? 'disabled' : ''}
          style="font-size:14px;padding:10px 18px;background:linear-gradient(135deg,#c9a227,#ffd700);color:#000;border:none;border-radius:10px;cursor:${auditRunning ? 'not-allowed' : 'pointer'};font-weight:700">
          ${auditRunning ? '⏳ Audit en cours...' : '🔍 Lancer audit complet'}
        </button>
        <button id="ax-diag-brutal" class="ax-btn ax-btn-sm" ${auditRunning ? 'disabled' : ''}
          style="font-size:13px;padding:8px 14px;background:rgba(255,88,88,.15);color:#ff5858;border:1px solid rgba(255,88,88,.3);border-radius:10px;cursor:${auditRunning ? 'not-allowed' : 'pointer'}">
          🔥 Audit brutal (no mercy)
        </button>
        ${activeReport ? `
          <button id="ax-diag-export" class="ax-btn ax-btn-sm" style="font-size:13px;padding:8px 14px">📥 Export Markdown</button>
        ` : ''}
      </section>

      ${activeReport ? `
        ${renderScoreCard(activeReport)}
        ${renderAxesGrid(activeReport)}

        <section class="ax-gs-180">
          <h3 class="ax-gs-326">⚠ Findings (${activeReport.findings.length})</h3>
          <div style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap">
            ${(['p0_critical', 'p1_high', 'p2_medium', 'p3_low', 'info'] as Severity[]).map((sev) => `
              <button class="ax-diag-sev-btn ${activeSeverityFilter === sev ? 'ax-tab-active' : ''}"
                data-diag-sev="${sev}"
                style="background:${activeSeverityFilter === sev ? `rgba(${sev === 'p0_critical' ? '255,88,88' : '201,162,39'},.15)` : 'transparent'};color:${activeSeverityFilter === sev ? SEVERITY_META[sev].color : '#a0a4c0'};border:1px solid rgba(201,162,39,.3);padding:5px 10px;border-radius:8px;font-size:11px;cursor:pointer">
                ${SEVERITY_META[sev].icon} ${SEVERITY_META[sev].label}
              </button>
            `).join('')}
          </div>
          ${renderFindings(activeReport.findings)}
        </section>

        <section class="ax-gs-180">
          <h3 class="ax-gs-326">📋 Prochaines étapes</h3>
          <ul style="list-style:disc;padding-left:24px;color:#a0a4c0;font-size:12px;line-height:1.6">
            ${activeReport.next_steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
          </ul>
        </section>
      ` : `
        <div style="background:rgba(20,20,35,0.6);border:1px solid rgba(255,255,255,0.05);border-radius:14px;padding:30px;text-align:center;margin-bottom:16px">
          <p style="color:#a0a4c0;font-size:13px;margin:0 0 12px">Pas encore de diagnostic effectué.</p>
          <p style="color:#888;font-size:11px;margin:0">Clique sur "🔍 Lancer audit complet" pour démarrer.</p>
        </div>
      `}

      <section class="ax-gs-180">
        <h3 class="ax-gs-326">🛡 Sentinelles 24/7</h3>
        <div style="background:rgba(20,20,35,0.6);border:1px solid rgba(255,255,255,0.05);border-radius:14px;padding:14px">
          <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:13px">
            <span><strong class="ax-gs-279">${sentOk}</strong> OK</span>
            <span><strong class="ax-gs-328">${sentWarn}</strong> WARN</span>
            <span><strong style="color:#888">${sentPending}</strong> PENDING</span>
            <a href="#sentinels" style="color:#c9a227;font-size:11px;margin-left:auto">→ Voir détail</a>
          </div>
        </div>
      </section>

      <section class="ax-gs-180">
        <h3 class="ax-gs-326">📚 Lessons learned (${lessons.length})</h3>
        ${renderLessons(lessons)}
      </section>

      <p class="ax-gs-331">🩺 Self-Diag v13 · 6 axes · Pondération 25/20/15/15/15/10</p>
    </div>
  `;

  attachDiagHandlers(rootEl);
  logger.info('feature-self-diag', `rendered (report=${activeReport ? 'yes' : 'no'}, lessons=${lessons.length}, sentinels=${sentinelsList.length})`);
}

function attachDiagHandlers(rootEl: HTMLElement): void {
  /* P1-6 : tous les listeners scopés (cleanup au prochain render ou dispose) */
  const scope = activeDiagScope ?? createCleanupScope('self-diag');
  if (!activeDiagScope) activeDiagScope = scope;

  const runBtn = rootEl.querySelector<HTMLButtonElement>('#ax-diag-run');
  if (runBtn) {
    scope.bind(runBtn, 'click', () => {
      void runAudit(rootEl, false);
    });
  }
  const brutalBtn = rootEl.querySelector<HTMLButtonElement>('#ax-diag-brutal');
  if (brutalBtn) {
    scope.bind(brutalBtn, 'click', () => {
      void runAudit(rootEl, true);
    });
  }

  const exportBtn = rootEl.querySelector<HTMLButtonElement>('#ax-diag-export');
  if (exportBtn) {
    scope.bind(exportBtn, 'click', () => {
      void (async () => {
        haptic.tap();
        if (!activeReport) return;
        try {
          const { apexSelfAudit } = await import('../../services/admin/apex-self-audit.js');
          const md = apexSelfAudit.formatReportMarkdown(activeReport);
          const blob = new Blob([md], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `apex-audit-${new Date().toISOString().slice(0, 10)}.md`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success('Rapport exporté');
        } catch (err: unknown) {
          logger.warn('feature-self-diag', 'export failed', { err });
          toast.error('Export échoué');
        }
      })();
    });
  }

  rootEl.querySelectorAll<HTMLButtonElement>('[data-diag-sev]').forEach((btn) => {
    scope.bind(btn, 'click', () => {
      haptic.selection();
      activeSeverityFilter = btn.dataset['diagSev'] as Severity;
      void render(rootEl);
    });
  });
}

async function runAudit(rootEl: HTMLElement, brutal: boolean): Promise<void> {
  if (auditRunning) return;
  auditRunning = true;
  haptic.medium();
  toast.info(brutal ? '🔥 Audit brutal en cours...' : '🔍 Audit en cours...');
  void render(rootEl);
  try {
    const { apexSelfAudit } = await import('../../services/admin/apex-self-audit.js');
    const report = await apexSelfAudit.runFullAudit(brutal);
    activeReport = report;
    haptic.success();
    toast.success(`✅ Audit terminé : ${report.total_score}/100`);
  } catch (err: unknown) {
    logger.warn('feature-self-diag', 'audit failed', { err });
    haptic.error();
    toast.error('Audit échoué');
  } finally {
    auditRunning = false;
    void render(rootEl);
  }
}
