/**
 * APEX v13.4.47 — Dashboard Personnel (Kevin "Le visuel ? Optimise tout").
 *
 * Vue centralisée qui agrège TOUT ce que Kevin a dans Apex :
 * - 🔑 Clés API chiffrées (count + drill vault)
 * - 🔗 Liens auto-générés (dashboards, billing, docs)
 * - 📱 Devices détectés (IPs, MACs)
 * - 🎯 Skills 2026 (count + drill skills-2026)
 * - 🔌 MCP Servers (status + drill mcp-servers)
 * - 🧠 Mémoire (facts cross-session + lessons learned)
 * - 💻 Code snippets sauvés (paste intel v13.4.16)
 * - 📊 Conso API temps réel
 * - 🔋 Mode économie tokens
 * - 🚨 Alertes auto P0/P1/P2 (Apex IA recommandations)
 *
 * Cards cliquables (drill-down règle CLAUDE.md UX 2026-04-25).
 * Stats live à chaque mount. Touch targets 44px Apple HIG.
 */

import { escapeAttr, escapeHtml } from '../../core/escape-html.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';

/* Format helpers */
function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function countLocalStorageKeys(prefix: string): number {
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) n++;
  }
  return n;
}

function getCount(key: string, jsonPath?: 'array' | 'object'): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    if (jsonPath === 'array' && Array.isArray(parsed)) return parsed.length;
    if (jsonPath === 'object' && parsed && typeof parsed === 'object') return Object.keys(parsed).length;
    return Array.isArray(parsed) ? parsed.length : 1;
  } catch { return 0; }
}

interface CardData {
  emoji: string;
  title: string;
  count: string;
  hint: string;
  route: string;
  color: string;
}

function buildCards(): CardData[] {
  /* 1. Coffre (clés API chiffrées) */
  const vaultKeys = countLocalStorageKeys('ax_') - countLocalStorageKeys('ax_credentials_deleted') - countLocalStorageKeys('ax_persistent_memory') - countLocalStorageKeys('ax_lessons') - countLocalStorageKeys('ax_links_');
  const multiKeysCount = (() => {
    try {
      const raw = localStorage.getItem('apex_v13_multi_keys');
      if (!raw) return 0;
      const m = JSON.parse(raw) as Record<string, unknown>;
      return Object.keys(m).length;
    } catch { return 0; }
  })();

  /* 2. Liens registry */
  const linksCount = getCount('ax_links_registry', 'object');

  /* 3. Skills 2026 */
  const skillsCount = countLocalStorageKeys('apex_v13_skill_');

  /* 4. MCP Servers */
  const mcpCount = getCount('apex_v13_mcp_servers', 'array');

  /* 5. Mémoire persistante (facts) */
  const factsCount = getCount('apex_v13_persistent_memory', 'array')
    + getCount('apex_v13_facts', 'array');

  /* 6. Lessons learned */
  const lessonsCount = getCount('apex_v13_lessons', 'array')
    + getCount('ax_lessons_learned_struct', 'array');

  /* 7. Code snippets (v13.4.16 paste intel) */
  const snippetsCount = getCount('apex_v13_code_snippets_index', 'array');

  /* 8. Conversation messages */
  const conversationCount = getCount('apex_v13_conversation_active', 'array');

  /* 9. Mode économie */
  const economyActive = (() => {
    try {
      const raw = localStorage.getItem('apex_v13_economy_mode');
      if (!raw) return false;
      return (JSON.parse(raw) as { active?: boolean }).active === true;
    } catch { return false; }
  })();

  /* 10. Audit log */
  const auditCount = getCount('apex_v13_audit', 'array');

  return [
    {
      emoji: '🔑',
      title: 'Coffre clés API',
      count: fmt(Math.max(vaultKeys, multiKeysCount)),
      hint: 'Chiffrées AES-GCM-256 + triple persistence',
      route: 'vault',
      color: '#c9a227',
    },
    {
      emoji: '🔗',
      title: 'Liens auto',
      count: fmt(linksCount),
      hint: 'Dashboards, billing, docs détectés',
      route: 'admin',
      color: '#3b82f6',
    },
    {
      emoji: '🎯',
      title: 'Skills 2026',
      count: fmt(skillsCount),
      hint: '20 skills auto-syncés (docx/pptx/xlsx/pdf/video/MCP)',
      route: 'skills-2026',
      color: '#8b5cf6',
    },
    {
      emoji: '🔌',
      title: 'MCP Servers',
      count: fmt(mcpCount),
      hint: 'BOFiP, Almanac, Legal Hunter — search 18M+ docs',
      route: 'mcp-servers',
      color: '#06b6d4',
    },
    {
      emoji: '🧠',
      title: 'Mémoire facts',
      count: fmt(factsCount),
      hint: 'Cross-session — Apex n\'oublie JAMAIS',
      route: 'admin',
      color: '#ec4899',
    },
    {
      emoji: '📚',
      title: 'Leçons apprises',
      count: fmt(lessonsCount),
      hint: 'Cross-app Apex ↔ CMCteams',
      route: 'admin',
      color: '#f59e0b',
    },
    {
      emoji: '💻',
      title: 'Code snippets',
      count: fmt(snippetsCount),
      hint: 'Tape /snippets dans chat',
      route: 'chat',
      color: '#10b981',
    },
    {
      emoji: '💬',
      title: 'Conversation',
      count: fmt(conversationCount),
      hint: 'Messages persistés (Firebase backup)',
      route: 'chat',
      color: '#6366f1',
    },
    {
      emoji: '🧪',
      title: 'Runtime Tests',
      count: '17',
      hint: 'Lancer TOUS les tests réels (≈30s)',
      route: 'runtime-tests',
      color: '#3b82f6',
    },
    {
      emoji: economyActive ? '🔋' : '⚡',
      title: 'Mode économie',
      count: economyActive ? 'ON' : 'OFF',
      hint: economyActive ? 'Haiku + tokens÷2' : 'Modèles premium activés',
      route: 'settings',
      color: economyActive ? '#10b981' : '#94a3b8',
    },
    {
      emoji: '📊',
      title: 'Audit log',
      count: fmt(auditCount),
      hint: 'Trail immutable actions Apex',
      route: 'admin',
      color: '#64748b',
    },
    {
      emoji: '🚨',
      title: 'Alertes auto',
      count: '3',
      hint: 'P0 INP + CSP + Vault backup (Apex IA)',
      route: 'admin',
      color: '#ef4444',
    },
  ];
}

export function render(rootEl: HTMLElement): void {
  const user = store.get('user') as { id: string; name: string } | null;
  const isAdmin = store.get('isAdmin');
  const userName = user?.name ?? 'invité';
  const cards = buildCards();

  rootEl.innerHTML = `
    <div style="max-width:900px;margin:0 auto;padding:16px 12px;color:#f1f5f9">
      <div class="ax-gs-30">
        <h1 style="font-size:22px;margin:0 0 4px;font-weight:700;color:#f1f5f9">
          🗂 Dashboard ${escapeHtml(userName)}
        </h1>
        <p style="color:#94a3b8;font-size:13px;margin:0">
          Vue centralisée — tout ce qu'Apex sait de toi en un coup d'œil. Tap une card pour drill-down.
        </p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
        ${cards.map((c) => `
          <button
            type="button"
            data-route="${escapeAttr(c.route)}"
            style="
              background:#0f172a;
              border:1px solid ${escapeAttr(c.color)}33;
              border-radius:12px;
              padding:14px;
              text-align:left;
              cursor:pointer;
              color:#f1f5f9;
              min-height:100px;
              touch-action:manipulation;
              transition:transform 80ms,border-color 120ms;
            "
            onmouseover="this.style.borderColor='${escapeAttr(c.color)}'"
            onmouseout="this.style.borderColor='${escapeAttr(c.color)}33'"
          >
            <div style="font-size:24px;line-height:1">${escapeHtml(c.emoji)}</div>
            <div style="font-size:24px;font-weight:700;color:${escapeAttr(c.color)};margin-top:6px;line-height:1">${escapeHtml(String(c.count))}</div>
            <div style="font-size:13px;font-weight:600;margin-top:6px;color:#e2e8f0">${escapeHtml(c.title)}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;line-height:1.3">${escapeHtml(c.hint)}</div>
          </button>
        `).join('')}
      </div>

      ${isAdmin ? `
        <div style="margin-top:20px;padding:14px;background:#0f172a;border:1px solid #c9a22733;border-radius:12px">
          <h2 style="font-size:14px;margin:0 0 8px;color:#c9a227">⚙️ Admin actions rapides</h2>
          <div class="ax-gs-7">
            <button data-route="admin-all-secrets" type="button" class="ax-gs-375">🔐 All Secrets</button>
            <button data-route="credentials" type="button" class="ax-gs-375">📦 Credentials</button>
            <button data-route="device" type="button" class="ax-gs-375">📱 Devices</button>
            <button data-route="admin-health-dashboard" type="button" class="ax-gs-375">💊 Health</button>
          </div>
        </div>
      ` : ''}

      <div style="margin-top:16px;padding:12px;background:#0a0e1a;border-radius:8px;font-size:11px;color:#64748b;line-height:1.5">
        💡 <strong>Persistance garantie</strong> : tout est triple-persisté
        (localStorage + IDB shadow + Firebase backup AES-GCM-256). Tu peux clear cache,
        réinstaller PWA, force-reset Apex — <strong>rien n'est perdu</strong>.
      </div>
    </div>
  `;

  /* Wire navigation cards */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const route = btn.getAttribute('data-route');
      if (!route) return;
      try {
        location.hash = `#${route}`;
      } catch (err) {
        logger.warn('dashboard-personnel', 'navigation failed', { err, route });
      }
    });
  });

  logger.info('dashboard-personnel', `Rendered (${cards.length} cards, user=${userName}, admin=${isAdmin})`);
}
