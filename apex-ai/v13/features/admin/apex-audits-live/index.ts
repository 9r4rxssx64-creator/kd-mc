/**
 * APEX v13.4.183 — Vue admin "📊 Apex Audits Live" REDESIGNED LUX
 * (Kevin "Class tout lux intelligemment, par fonction, theme etc").
 *
 * Classification intelligente :
 * - 5 tabs : Overview · Par vue · Par sévérité · Timeline · Tendances
 * - Groupement automatique par route (Chat/Admin/Coffre/Settings/Studio/etc)
 * - Sévérité auto-calculée (critical/warning/ok)
 * - Stats agrégées par groupe + sparklines tendance
 * - Code couleur cohérent par catégorie thématique
 * - Style lux : gradient backgrounds, blur, animations stagger
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { store } from '../../../core/store.js';
import {
  type FunctionalHistoryEntry,
  type LayoutHistoryEntry,
  reportsHistory,
} from '../../../services/admin/apex-reports-history.js';
import { toast } from '../../../ui/toast.js';

/**
 * v13.4.245 — Course la promesse contre un timeout. Garde-fou contre un
 * scan async qui ne se résout jamais (la cause sync confirm()/prompt() est
 * traitée en amont dans apex-functional-tester, ceci couvre le reste).
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} : délai dépassé (${Math.round(ms / 1000)}s)`)), ms),
    ),
  ]);
}

type Severity = 'critical' | 'warning' | 'ok';
type ViewCategory = 'chat' | 'admin' | 'settings' | 'vault' | 'studio' | 'memory' | 'other';

interface ViewMeta {
  category: ViewCategory;
  label: string;
  emoji: string;
  color: string;
  accent: string;
}

const VIEW_CATEGORIES: Record<ViewCategory, ViewMeta> = {
  chat: { category: 'chat', label: 'Chat', emoji: '💬', color: '#22cc77', accent: 'rgba(34,204,119,0.15)' },
  admin: { category: 'admin', label: 'Admin', emoji: '⚙️', color: '#c9a227', accent: 'rgba(201,162,39,0.15)' },
  settings: { category: 'settings', label: 'Réglages', emoji: '🔧', color: '#8bb4ff', accent: 'rgba(139,180,255,0.15)' },
  vault: { category: 'vault', label: 'Coffre', emoji: '🔐', color: '#e8b830', accent: 'rgba(232,184,48,0.15)' },
  studio: { category: 'studio', label: 'Studio', emoji: '🎨', color: '#c97aff', accent: 'rgba(201,122,255,0.15)' },
  memory: { category: 'memory', label: 'Mémoire', emoji: '🧠', color: '#f78322', accent: 'rgba(247,131,34,0.15)' },
  other: { category: 'other', label: 'Autre', emoji: '📦', color: '#94a3b8', accent: 'rgba(148,163,184,0.15)' },
};

const SEVERITY_META: Record<Severity, { label: string; color: string; emoji: string; bg: string }> = {
  critical: { label: 'Critique', color: '#ff5b5b', emoji: '❌', bg: 'rgba(255,91,91,0.10)' },
  warning: { label: 'Warning', color: '#ffaa66', emoji: '⚠️', bg: 'rgba(255,170,102,0.10)' },
  ok: { label: 'OK', color: '#22cc77', emoji: '✅', bg: 'rgba(34,204,119,0.10)' },
};

function categorizeView(view: string): ViewMeta {
  const v = view.toLowerCase();
  if (v.includes('chat')) return VIEW_CATEGORIES.chat;
  if (v.includes('admin') || v.includes('runtime-test') || v.includes('apex-audits') || v.includes('all-secrets')
    || v.includes('credentials') || v.includes('rgpd') || v.includes('health')) return VIEW_CATEGORIES.admin;
  if (v.includes('setting') || v.includes('config') || v.includes('reglage')) return VIEW_CATEGORIES.settings;
  if (v.includes('vault') || v.includes('coffre')) return VIEW_CATEGORIES.vault;
  if (v.includes('studio') || v.includes('image') || v.includes('video') || v.includes('music')) return VIEW_CATEGORIES.studio;
  if (v.includes('memor') || v.includes('memoire') || v.includes('kb') || v.includes('know')) return VIEW_CATEGORIES.memory;
  return VIEW_CATEGORIES.other;
}

function severityOfLayout(e: LayoutHistoryEntry): Severity {
  if (e.hasHorizontalOverflow && e.hiddenButtonsCount > 0) return 'critical';
  if (e.hasHorizontalOverflow || e.hiddenButtonsCount > 0) return 'warning';
  return 'ok';
}

function severityOfFunctional(e: FunctionalHistoryEntry): Severity {
  if (e.okRate < 0.5 || e.errors > 3 || e.escalated) return 'critical';
  if (e.okRate < 0.8 || e.noResponse > 0 || e.errors > 0) return 'warning';
  return 'ok';
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
}

/** Sparkline SVG simple : array de valeurs 0-1 → mini-graph polyline */
function sparkline(values: number[], color: string, width = 80, height = 24): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * width;
    const y = height - (v / max) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:inline-block;vertical-align:middle">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function renderTabs(active: string): string {
  const tabs = [
    { id: 'overview', label: '✨ Vue d\'ensemble', color: '#c9a227' },
    { id: 'by-view', label: '🗂 Par vue', color: '#8bb4ff' },
    { id: 'by-severity', label: '🚦 Par sévérité', color: '#ff5b5b' },
    { id: 'timeline', label: '📅 Timeline', color: '#22cc77' },
    { id: 'trends', label: '📈 Tendances', color: '#c97aff' },
  ];
  return `
    <nav style="display:flex;gap:6px;margin-bottom:16px;overflow-x:auto;padding:2px;scrollbar-width:none">
      ${tabs.map((t) => `
        <button class="ax-audits-tab" data-tab="${t.id}" style="
          padding:8px 14px;
          background:${active === t.id ? `linear-gradient(135deg,${t.color}22,${t.color}11)` : 'rgba(255,255,255,0.03)'};
          color:${active === t.id ? t.color : 'rgba(255,255,255,0.6)'};
          border:1px solid ${active === t.id ? t.color + '55' : 'rgba(255,255,255,0.08)'};
          border-radius:20px;
          font-size:12px;
          font-weight:${active === t.id ? '700' : '500'};
          cursor:pointer;
          white-space:nowrap;
          min-height:44px;
          -webkit-tap-highlight-color:transparent;
          transition:all 180ms cubic-bezier(0.16,1,0.3,1);
        ">${t.label}</button>
      `).join('')}
    </nav>
  `;
}

function renderOverview(layoutHistory: LayoutHistoryEntry[], funcHistory: FunctionalHistoryEntry[]): string {
  const stats = reportsHistory.getStats();
  /* Sparklines : 14 derniers points */
  const last14Layout = layoutHistory.slice(-14).map((e) => (e.hasHorizontalOverflow ? 1 : 0) + e.hiddenButtonsCount);
  const last14Func = funcHistory.slice(-14).map((e) => e.noResponse + e.errors);
  const lastLayoutDate = stats.lastLayoutTs ? formatTs(stats.lastLayoutTs) : 'jamais';
  const lastFuncDate = stats.lastFunctionalTs ? formatTs(stats.lastFunctionalTs) : 'jamais';
  /* Sévérité distribution */
  const sevLayout = { critical: 0, warning: 0, ok: 0 };
  layoutHistory.forEach((e) => sevLayout[severityOfLayout(e)]++);
  const sevFunc = { critical: 0, warning: 0, ok: 0 };
  funcHistory.forEach((e) => sevFunc[severityOfFunctional(e)]++);

  const sevBar = (sev: { critical: number; warning: number; ok: number }, total: number): string => {
    if (total === 0) return '<div style="color:rgba(255,255,255,0.4);font-size:11px">Pas encore de données</div>';
    const cPct = (sev.critical / total) * 100;
    const wPct = (sev.warning / total) * 100;
    const oPct = (sev.ok / total) * 100;
    return `
      <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,0.04);margin-top:6px">
        <div style="width:${oPct}%;background:#22cc77" title="OK : ${sev.ok}"></div>
        <div style="width:${wPct}%;background:#ffaa66" title="Warning : ${sev.warning}"></div>
        <div style="width:${cPct}%;background:#ff5b5b" title="Critical : ${sev.critical}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:rgba(255,255,255,0.6)">
        <span>✅ ${sev.ok}</span><span>⚠️ ${sev.warning}</span><span>❌ ${sev.critical}</span>
      </div>
    `;
  };

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
      <div style="background:linear-gradient(135deg,rgba(180,90,200,0.10),rgba(180,90,200,0.04));border:1px solid rgba(180,90,200,0.25);border-radius:14px;padding:14px">
        <div class="ax-gs-22">
          <span style="font-weight:700;color:#c97aff">📐 Layout</span>
          ${sparkline(last14Layout, '#c97aff')}
        </div>
        <div class="ax-gs-84">${stats.layoutCount}</div>
        <div class="ax-gs-23">scans · dernier ${lastLayoutDate}</div>
        ${sevBar(sevLayout, layoutHistory.length)}
      </div>

      <div style="background:linear-gradient(135deg,rgba(106,138,255,0.10),rgba(106,138,255,0.04));border:1px solid rgba(106,138,255,0.25);border-radius:14px;padding:14px">
        <div class="ax-gs-22">
          <span style="font-weight:700;color:#8bb4ff">🧪 Fonctionnel</span>
          ${sparkline(last14Func, '#8bb4ff')}
        </div>
        <div class="ax-gs-84">${stats.functionalCount}</div>
        <div class="ax-gs-23">tests · dernier ${lastFuncDate}</div>
        ${sevBar(sevFunc, funcHistory.length)}
      </div>

      <div style="background:linear-gradient(135deg,rgba(255,91,91,0.10),rgba(255,91,91,0.04));border:1px solid rgba(255,91,91,0.25);border-radius:14px;padding:14px">
        <div style="font-weight:700;color:#ff5b5b;margin-bottom:8px">🐛 Bugs 24h</div>
        <div style="font-size:32px;font-weight:800;color:${stats.recentBugs > 0 ? '#ff5b5b' : '#22cc77'}">${stats.recentBugs}</div>
        <div class="ax-gs-85">détectés sur 24 dernières heures</div>
      </div>

      <div style="background:linear-gradient(135deg,rgba(255,170,102,0.10),rgba(255,170,102,0.04));border:1px solid rgba(255,170,102,0.25);border-radius:14px;padding:14px">
        <div style="font-weight:700;color:#ffaa66;margin-bottom:8px">📤 Escaladés Claude Code 24h</div>
        <div style="font-size:32px;font-weight:800;color:${stats.recentEscalations > 0 ? '#ffaa66' : '#22cc77'}">${stats.recentEscalations}</div>
        <div class="ax-gs-85">via ax_claude_todo Firebase</div>
      </div>
    </div>
  `;
}

function renderByView(layoutHistory: LayoutHistoryEntry[], funcHistory: FunctionalHistoryEntry[]): string {
  /* Groupe par catégorie de vue */
  const groups: Record<ViewCategory, { layouts: LayoutHistoryEntry[]; funcs: FunctionalHistoryEntry[]; views: Set<string> }> = {
    chat: { layouts: [], funcs: [], views: new Set() },
    admin: { layouts: [], funcs: [], views: new Set() },
    settings: { layouts: [], funcs: [], views: new Set() },
    vault: { layouts: [], funcs: [], views: new Set() },
    studio: { layouts: [], funcs: [], views: new Set() },
    memory: { layouts: [], funcs: [], views: new Set() },
    other: { layouts: [], funcs: [], views: new Set() },
  };
  layoutHistory.forEach((e) => {
    const cat = categorizeView(e.view).category;
    groups[cat].layouts.push(e);
    groups[cat].views.add(e.view);
  });
  funcHistory.forEach((e) => {
    const cat = categorizeView(e.view).category;
    groups[cat].funcs.push(e);
    groups[cat].views.add(e.view);
  });

  const order: ViewCategory[] = ['chat', 'admin', 'settings', 'vault', 'studio', 'memory', 'other'];
  return order
    .filter((cat) => groups[cat].layouts.length + groups[cat].funcs.length > 0)
    .map((cat, idx) => {
      const meta = VIEW_CATEGORIES[cat];
      const g = groups[cat];
      const totalScans = g.layouts.length;
      const totalTests = g.funcs.length;
      const overflowCount = g.layouts.filter((e) => e.hasHorizontalOverflow).length;
      const hiddenCount = g.layouts.reduce((sum, e) => sum + e.hiddenButtonsCount, 0);
      const okFunc = g.funcs.filter((e) => severityOfFunctional(e) === 'ok').length;
      const okPct = totalTests > 0 ? Math.round((okFunc / totalTests) * 100) : 0;
      const viewsList = Array.from(g.views).slice(0, 3).map((v) => escapeHtml(v)).join(', ');
      const moreCount = g.views.size > 3 ? ` +${g.views.size - 3}` : '';
      return `
        <div class="ax-audits-card" style="background:linear-gradient(135deg,${meta.accent},rgba(255,255,255,0.02));border:1px solid ${meta.color}33;border-radius:14px;padding:14px;margin-bottom:10px;animation:ax-fade-up 320ms cubic-bezier(0.16,1,0.3,1) ${idx * 60}ms backwards">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
            <div style="font-weight:700;color:${meta.color};font-size:15px">${meta.emoji} ${meta.label}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5);font-family:monospace">${viewsList}${moreCount}</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;font-size:12px;color:rgba(255,255,255,0.85)">
            <div>📐 Layout scans : <b>${totalScans}</b></div>
            <div>🧪 Tests : <b>${totalTests}</b></div>
            <div>⚠ Overflow : <b style="color:${overflowCount ? '#ff5b5b' : '#22cc77'}">${overflowCount}</b></div>
            <div>🚫 Boutons cachés : <b style="color:${hiddenCount ? '#ffaa66' : '#22cc77'}">${hiddenCount}</b></div>
            <div>✅ OK fonctionnel : <b style="color:${okPct >= 80 ? '#22cc77' : okPct >= 50 ? '#ffaa66' : '#ff5b5b'}">${okPct}%</b></div>
          </div>
        </div>
      `;
    })
    .join('') || '<div class="ax-gs-54">Aucune vue auditée encore.</div>';
}

function renderBySeverity(layoutHistory: LayoutHistoryEntry[], funcHistory: FunctionalHistoryEntry[]): string {
  const bySev: Record<Severity, { type: string; view: string; ts: number; summary: string; color: string }[]> = {
    critical: [],
    warning: [],
    ok: [],
  };
  layoutHistory.forEach((e) => {
    const sev = severityOfLayout(e);
    const meta = categorizeView(e.view);
    bySev[sev].push({
      type: 'Layout',
      view: `${meta.emoji} ${e.view}`,
      ts: e.ts,
      summary: `overflow:${e.hasHorizontalOverflow ? 'OUI' : 'NON'} · cachés:${e.hiddenButtonsCount} · touch<44:${e.smallTouchTargetsCount}`,
      color: meta.color,
    });
  });
  funcHistory.forEach((e) => {
    const sev = severityOfFunctional(e);
    const meta = categorizeView(e.view);
    bySev[sev].push({
      type: 'Fonctionnel',
      view: `${meta.emoji} ${e.view}`,
      ts: e.ts,
      summary: `${e.ok}/${e.tested} OK (${Math.round(e.okRate * 100)}%) · no-resp:${e.noResponse} · err:${e.errors}${e.escalated ? ' · ⚠ escaladé' : ''}`,
      color: meta.color,
    });
  });

  const order: Severity[] = ['critical', 'warning', 'ok'];
  return order.map((sev, idx) => {
    const items = bySev[sev].sort((a, b) => b.ts - a.ts).slice(0, 15);
    if (items.length === 0) return '';
    const meta = SEVERITY_META[sev];
    return `
      <div style="background:${meta.bg};border:1px solid ${meta.color}55;border-radius:14px;padding:14px;margin-bottom:12px;animation:ax-fade-up 320ms cubic-bezier(0.16,1,0.3,1) ${idx * 80}ms backwards">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-weight:700;color:${meta.color};font-size:15px">${meta.emoji} ${meta.label}</div>
          <div style="background:${meta.color};color:#08080f;padding:2px 10px;border-radius:12px;font-weight:700;font-size:12px">${bySev[sev].length}</div>
        </div>
        ${items.map((it) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px;flex-wrap:wrap;gap:6px">
            <div class="ax-gs-6">
              <span style="color:${it.color};font-weight:600">${it.type}</span>
              <span style="color:rgba(255,255,255,0.5);margin:0 6px">·</span>
              <span class="ax-gs-86">${it.view}</span>
              <div style="color:rgba(255,255,255,0.6);font-size:11px;margin-top:2px">${it.summary}</div>
            </div>
            <div style="color:rgba(255,255,255,0.5);font-size:11px;font-family:monospace">${formatTs(it.ts)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }).join('') || '<div class="ax-gs-54">Aucun audit historisé.</div>';
}

function renderTimeline(layoutHistory: LayoutHistoryEntry[], funcHistory: FunctionalHistoryEntry[]): string {
  /* Group par jour */
  const byDay: Record<string, { ts: number; events: { type: string; emoji: string; color: string; view: string; summary: string; sev: Severity; ts: number }[] }> = {};
  layoutHistory.forEach((e) => {
    const k = dayKey(e.ts);
    if (!byDay[k]) byDay[k] = { ts: e.ts, events: [] };
    const meta = categorizeView(e.view);
    byDay[k].events.push({
      type: 'Layout', emoji: meta.emoji, color: meta.color,
      view: e.view,
      summary: `overflow:${e.hasHorizontalOverflow ? 'OUI' : 'NON'} · cachés:${e.hiddenButtonsCount}`,
      sev: severityOfLayout(e), ts: e.ts,
    });
  });
  funcHistory.forEach((e) => {
    const k = dayKey(e.ts);
    if (!byDay[k]) byDay[k] = { ts: e.ts, events: [] };
    const meta = categorizeView(e.view);
    byDay[k].events.push({
      type: 'Fonctionnel', emoji: meta.emoji, color: meta.color,
      view: e.view,
      summary: `${e.ok}/${e.tested} OK (${Math.round(e.okRate * 100)}%)`,
      sev: severityOfFunctional(e), ts: e.ts,
    });
  });
  const days = Object.entries(byDay).sort((a, b) => b[1].ts - a[1].ts);
  if (days.length === 0) {
    return '<div class="ax-gs-54">Pas encore d\'événement.</div>';
  }
  return days.map(([key, d], idx) => `
    <div style="margin-bottom:14px;animation:ax-fade-up 320ms cubic-bezier(0.16,1,0.3,1) ${idx * 60}ms backwards">
      <div style="font-weight:700;color:#c9a227;font-size:13px;margin-bottom:8px;letter-spacing:0.04em">
        ${dayLabel(d.ts)} <span style="color:rgba(255,255,255,0.4);font-weight:500;font-size:11px">· ${escapeHtml(key)} · ${d.events.length} événement(s)</span>
      </div>
      ${d.events.sort((a, b) => b.ts - a.ts).map((ev) => {
        const sevMeta = SEVERITY_META[ev.sev];
        return `
          <div style="display:flex;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.02);border-left:3px solid ${ev.color};border-radius:6px;margin-bottom:4px;font-size:12px">
            <div class="ax-gs-87">${ev.emoji}</div>
            <div class="ax-gs-6">
              <div class="ax-gs-86"><b>${ev.type}</b> <span class="ax-gs-182">${escapeHtml(ev.view)}</span></div>
              <div class="ax-gs-55">${ev.summary}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="background:${sevMeta.bg};color:${sevMeta.color};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${sevMeta.emoji} ${sevMeta.label}</div>
              <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-top:2px;font-family:monospace">${new Date(ev.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `).join('');
}

function renderTrends(layoutHistory: LayoutHistoryEntry[], funcHistory: FunctionalHistoryEntry[]): string {
  /* Sparkline 30 derniers par catégorie */
  const last30L = layoutHistory.slice(-30);
  const last30F = funcHistory.slice(-30);
  const overflowSeries = last30L.map((e) => (e.hasHorizontalOverflow ? 1 : 0));
  const hiddenSeries = last30L.map((e) => e.hiddenButtonsCount);
  const okRateSeries = last30F.map((e) => e.okRate);
  const errorsSeries = last30F.map((e) => e.errors);

  /* Top vues problématiques (most bugs) */
  const viewIssues: Record<string, { layout: number; func: number; meta: ViewMeta }> = {};
  layoutHistory.forEach((e) => {
    if (e.hasHorizontalOverflow || e.hiddenButtonsCount > 0) {
      const meta = categorizeView(e.view);
      if (!viewIssues[e.view]) viewIssues[e.view] = { layout: 0, func: 0, meta };
      viewIssues[e.view]!.layout++;
    }
  });
  funcHistory.forEach((e) => {
    if (e.noResponse > 0 || e.errors > 0) {
      const meta = categorizeView(e.view);
      if (!viewIssues[e.view]) viewIssues[e.view] = { layout: 0, func: 0, meta };
      viewIssues[e.view]!.func++;
    }
  });
  const topViews = Object.entries(viewIssues)
    .sort((a, b) => (b[1].layout + b[1].func) - (a[1].layout + a[1].func))
    .slice(0, 8);

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:14px">
      <div style="background:linear-gradient(135deg,rgba(255,91,91,0.08),rgba(255,91,91,0.02));border:1px solid rgba(255,91,91,0.25);border-radius:14px;padding:14px">
        <div style="font-weight:700;color:#ff5b5b;margin-bottom:6px">📈 Overflow horizontal (30 derniers)</div>
        ${sparkline(overflowSeries, '#ff5b5b', 240, 40)}
        <div class="ax-gs-36">Total : ${overflowSeries.filter((v) => v === 1).length}/30</div>
      </div>
      <div style="background:linear-gradient(135deg,rgba(255,170,102,0.08),rgba(255,170,102,0.02));border:1px solid rgba(255,170,102,0.25);border-radius:14px;padding:14px">
        <div style="font-weight:700;color:#ffaa66;margin-bottom:6px">📈 Boutons cachés (30 derniers)</div>
        ${sparkline(hiddenSeries, '#ffaa66', 240, 40)}
        <div class="ax-gs-36">Max : ${Math.max(0, ...hiddenSeries)}</div>
      </div>
      <div style="background:linear-gradient(135deg,rgba(34,204,119,0.08),rgba(34,204,119,0.02));border:1px solid rgba(34,204,119,0.25);border-radius:14px;padding:14px">
        <div style="font-weight:700;color:#22cc77;margin-bottom:6px">📈 OK rate fonctionnel (30 derniers)</div>
        ${sparkline(okRateSeries, '#22cc77', 240, 40)}
        <div class="ax-gs-36">Moyenne : ${okRateSeries.length ? Math.round((okRateSeries.reduce((a, b) => a + b, 0) / okRateSeries.length) * 100) : 0}%</div>
      </div>
      <div style="background:linear-gradient(135deg,rgba(106,138,255,0.08),rgba(106,138,255,0.02));border:1px solid rgba(106,138,255,0.25);border-radius:14px;padding:14px">
        <div style="font-weight:700;color:#8bb4ff;margin-bottom:6px">📈 Erreurs (30 derniers)</div>
        ${sparkline(errorsSeries, '#8bb4ff', 240, 40)}
        <div class="ax-gs-36">Total : ${errorsSeries.reduce((a, b) => a + b, 0)}</div>
      </div>
    </div>

    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:14px">
      <div style="font-weight:700;color:#c9a227;margin-bottom:10px">🏆 Top vues problématiques</div>
      ${topViews.length === 0
        ? '<div class="ax-gs-183">Aucune vue avec issues récurrentes. 🎉</div>'
        : topViews.map(([view, data]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px">
              <span style="color:${data.meta.color};font-weight:600">${data.meta.emoji} ${escapeHtml(view)}</span>
              <span style="color:rgba(255,255,255,0.65)">📐 ${data.layout} · 🧪 ${data.func} · <b style="color:#ff5b5b">Σ ${data.layout + data.func}</b></span>
            </div>
          `).join('')}
    </div>
  `;
}

let activeTab = 'overview';

export function render(rootEl: HTMLElement): void {
  const isAdmin = store.get('isAdmin') === true;
  if (!isAdmin) {
    rootEl.innerHTML = `<div class="ax-gs-37">🔒 Réservé admin Kevin</div>`;
    return;
  }

  const layoutHistory = reportsHistory.getLayoutHistory().slice();
  const funcHistory = reportsHistory.getFunctionalHistory().slice();

  const tabContent =
    activeTab === 'overview' ? renderOverview(layoutHistory, funcHistory)
    : activeTab === 'by-view' ? renderByView(layoutHistory, funcHistory)
    : activeTab === 'by-severity' ? renderBySeverity(layoutHistory, funcHistory)
    : activeTab === 'timeline' ? renderTimeline(layoutHistory, funcHistory)
    : renderTrends(layoutHistory, funcHistory);

  rootEl.innerHTML = `
    <style>
      @keyframes ax-fade-up { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
      .ax-audits-tab:active { transform: scale(0.96); }
      .ax-audits-card { backdrop-filter: blur(8px) saturate(120%); -webkit-backdrop-filter: blur(8px) saturate(120%); }
    </style>
    <div class="ax-admin ax-page" style="padding:14px;max-width:980px;margin:0 auto">
      <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:8px">
        <div>
          <h1 style="margin:0;background:linear-gradient(135deg,#c9a227,#e8b830);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-size:22px;letter-spacing:-0.02em">📊 Apex Audits Live</h1>
          <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:2px">Classification intelligente · par fonction · par sévérité · par thème</div>
        </div>
        <div class="ax-gs-88">
          <button id="ax-audits-run-functional" class="ax-btn" style="padding:6px 10px;background:rgba(106,138,255,0.12);color:#8bb4ff;border:1px solid rgba(106,138,255,0.3);border-radius:18px;cursor:pointer;font-size:11px;min-height:44px">🧪 Tester</button>
          <button id="ax-audits-run-layout" class="ax-btn" style="padding:6px 10px;background:rgba(180,90,200,0.12);color:#c97aff;border:1px solid rgba(180,90,200,0.3);border-radius:18px;cursor:pointer;font-size:11px;min-height:44px">📐 Scan</button>
          <button id="ax-audits-clear" class="ax-btn" aria-label="Effacer les audits" style="padding:6px 10px;background:rgba(255,91,91,0.08);color:#ff5b5b;border:1px solid rgba(255,91,91,0.25);border-radius:18px;cursor:pointer;font-size:11px;min-height:44px">🗑</button>
          <button class="ax-btn" data-nav-route="admin" style="padding:6px 10px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.85);border:1px solid rgba(255,255,255,0.15);border-radius:18px;cursor:pointer;font-size:11px;min-height:44px">← Admin</button>
        </div>
      </header>

      ${renderTabs(activeTab)}

      <div id="ax-audits-tab-content">
        ${tabContent}
      </div>
    </div>
  `;

  /* Wire tabs */
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-audits-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) {
        activeTab = tab;
        render(rootEl);
      }
    });
  });

  /* Wire actions */
  rootEl.querySelector<HTMLButtonElement>('#ax-audits-run-functional')?.addEventListener('click', () => {
    void (async () => {
      const btn = rootEl.querySelector<HTMLButtonElement>('#ax-audits-run-functional');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Test…';
      }
      try {
        const { apexFunctionalTester } = await import('../../../services/admin/apex-functional-tester.js');
        /* v13.4.245 (FIX "test bloqué" + "scan sans résultat") :
         * timeout 90s + erreur RÉELLEMENT affichée (avant : catch silencieux
         * → aucun résultat, aucun message, bouton figé à vie). */
        const out = await withTimeout(
          apexFunctionalTester.testAndAutoFix({ maxButtons: 30 }),
          90_000,
          'Test fonctionnel',
        );
        reportsHistory.recordFunctional(out.before, out.fixes, out.after, out.improvement);
        toast.success(`🧪 Test terminé : ${out.before.ok}/${out.before.tested} OK`);
        render(rootEl); /* re-render → bouton recréé propre */
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Test fonctionnel KO — ${msg}`);
        const liveBtn = rootEl.querySelector<HTMLButtonElement>('#ax-audits-run-functional');
        if (liveBtn) {
          liveBtn.disabled = false;
          liveBtn.textContent = '🧪 Tester';
        }
      }
    })();
  });

  rootEl.querySelector<HTMLButtonElement>('#ax-audits-run-layout')?.addEventListener('click', () => {
    void (async () => {
      const btn = rootEl.querySelector<HTMLButtonElement>('#ax-audits-run-layout');
      if (btn) btn.disabled = true;
      try {
        const { apexLayoutInspector } = await import('../../../services/admin/apex-layout-inspector.js');
        const r = apexLayoutInspector.scanDom();
        reportsHistory.recordLayout(r);
        toast.success(`📐 Scan layout : ${r.hiddenButtons.length} bouton(s) caché(s)`);
        render(rootEl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Scan layout KO — ${msg}`);
        const liveBtn = rootEl.querySelector<HTMLButtonElement>('#ax-audits-run-layout');
        if (liveBtn) liveBtn.disabled = false;
      }
    })();
  });

  rootEl.querySelector<HTMLButtonElement>('#ax-audits-clear')?.addEventListener('click', () => {
    if (confirm('Vider tout l\'historique des audits ?')) {
      reportsHistory.clearHistory();
      render(rootEl);
    }
  });
}
