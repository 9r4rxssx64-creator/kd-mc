/**
 * APEX v13 — Vue Legal (CGU/CGV/Privacy/Cookies/DPA/Mentions/RGPD-DPO)
 *
 * Mission v13.1 Kevin : commercialisation EU = obligation légale d'afficher
 * tous les documents juridiques + DPO contact + RGPD widget.
 *
 * Architecture :
 * - Onglets : CGU / CGV / Privacy / Cookies / DPA / Mentions / DPO
 * - Charge le markdown depuis docs/legal/*.md (lazy)
 * - Render markdown simple (titles, paragraphs, lists, tables)
 * - Boutons RGPD widget : Export, Delete, Consent, OptOut
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { rgpd } from '../../services/auth/rgpd.js';
import { cspStyleHelper } from '../../services/core-svc/csp-style-helper.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeLegalScope: CleanupScope | null = null;

export function dispose(): void {
  activeLegalScope?.cleanup();
  activeLegalScope = null;
}

const TABS: Array<{ id: string; label: string; file: string; emoji: string }> = [
  { id: 'cgu', label: 'CGU', file: 'cgu', emoji: '📜' },
  { id: 'cgv', label: 'CGV', file: 'cgv', emoji: '💳' },
  { id: 'privacy', label: 'Confidentialité', file: 'privacy-policy', emoji: '🔒' },
  { id: 'cookies', label: 'Cookies', file: 'cookie-policy', emoji: '🍪' },
  { id: 'dpa', label: 'DPA', file: 'data-processing-agreement', emoji: '🤝' },
  { id: 'mentions', label: 'Mentions légales', file: 'mentions-legales', emoji: '🏛️' },
  { id: 'rgpd', label: 'Mes données', file: '', emoji: '⚙️' },
];

/**
 * Mini-renderer markdown. Simple mais suffisant pour les docs Apex
 * (titres, paragraphes, listes, tables, inline `code`, **bold**, *italic*).
 */
function renderMarkdown(md: string): string {
  let html = escapeHtml(md);
  /* Headings */
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  /* Blockquote */
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  /* Bold + italic */
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  /* Inline code */
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  /* Links */
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  /* Lists */
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>(\n|$))+/gs, (m) => `<ul>${m.replace(/\n/g, '')}</ul>`);
  /* Tables (simple GFM) */
  html = html.replace(/^\|(.+)\|\s*\n\|[\s|:-]+\|\s*\n((?:\|.+\|\s*\n?)+)/gm, (_, header: string, rows: string) => {
    const headers = header.split('|').map((c) => c.trim()).filter(Boolean);
    const rowsArr = rows.trim().split('\n').map((r) => r.split('|').map((c) => c.trim()).filter(Boolean));
    const thead = headers.map((h) => `<th>${h}</th>`).join('');
    const tbody = rowsArr.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
    return `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
  });
  /* Horizontal rule */
  html = html.replace(/^---$/gm, '<hr/>');
  /* Paragraphs (lignes seules entre blank lines) */
  html = html.replace(/\n\n+/g, '</p><p>');
  html = `<p>${html}</p>`;
  /* Cleanup paragraphs autour des blocs */
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>|<table>|<blockquote>|<hr\/>)/g, '$1');
  html = html.replace(/(<\/ul>|<\/table>|<\/blockquote>)<\/p>/g, '$1');
  return html;
}

async function loadLegalDoc(file: string): Promise<string> {
  if (!file) {
    return '';
  }
  try {
    const res = await fetch(`/docs/legal/${file}.md`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      return await res.text();
    }
  } catch (err: unknown) {
    logger.warn('feature-legal', `Failed to load doc ${file}`, { err });
  }
  return `# Document indisponible\n\nLe document **${file}** est temporairement indisponible. Réessaie plus tard ou contacte kevin.desarzens@gmail.com.`;
}

function renderTabs(activeTab: string): string {
  return TABS.map((t) => {
    const active = t.id === activeTab;
    const style = `padding:10px 14px;font-size:13px;font-weight:600;border-radius:8px;cursor:pointer;background:${active ? 'rgba(232,184,48,0.18)' : 'rgba(255,255,255,0.03)'};color:${active ? '#e8b830' : 'rgba(255,255,255,0.7)'};border:1px solid ${active ? 'rgba(232,184,48,0.4)' : 'rgba(255,255,255,0.05)'};transition:all 180ms`;
    return `<button class="ax-legal-tab" data-tab="${escapeHtml(t.id)}" style="${style}">${t.emoji} ${escapeHtml(t.label)}</button>`;
  }).join('');
}

function renderRgpdWidget(): string {
  const cookieStatus = rgpd.showCookieBanner();
  const hasAnalyticsConsent = rgpd.hasConsent('analytics');
  const hasMarketingConsent = rgpd.hasConsent('marketing');
  return `
    <h2>⚙️ Mes données RGPD</h2>
    <p>Tu peux exercer tes droits RGPD (Art. 15-22) directement depuis cette page.</p>

    <h3>📤 Export de mes données (Art. 15)</h3>
    <p>Télécharge toutes tes données au format JSON portable.</p>
    <button id="ax-rgpd-export" class="ax-btn" style="padding:12px 16px;background:rgba(106,138,255,0.18);color:#6a8aff;border:1px solid rgba(106,138,255,0.4);border-radius:10px;font-weight:600;cursor:pointer">📤 Exporter mes données</button>

    <h3>🗑 Suppression de compte (Art. 17)</h3>
    <p>Supprime définitivement ton compte et toutes tes données (cascade localStorage + Firebase + IndexedDB). Audit log final immutable conservé 5 ans (obligation légale).</p>
    <button id="ax-rgpd-delete" class="ax-btn" style="padding:12px 16px;background:rgba(255,91,91,0.18);color:#ff5b5b;border:1px solid rgba(255,91,91,0.4);border-radius:10px;font-weight:600;cursor:pointer">🗑 Supprimer mon compte</button>

    <h3>🍪 Préférences cookies</h3>
    <p>Statut consentement : <strong>${cookieStatus.shouldShow ? '🟠 À configurer' : '✅ Configuré'}</strong></p>
    <p>Cookies analytics : <strong>${hasAnalyticsConsent ? '✅ Acceptés' : '❌ Refusés'}</strong></p>
    <p>Cookies marketing : <strong>${hasMarketingConsent ? '✅ Acceptés' : '❌ Refusés'}</strong></p>
    <button id="ax-rgpd-cookies-customize" class="ax-btn" style="padding:12px 16px;background:rgba(232,184,48,0.18);color:#e8b830;border:1px solid rgba(232,184,48,0.4);border-radius:10px;font-weight:600;cursor:pointer">🍪 Modifier mes préférences cookies</button>

    <h3>🚫 Opt-out (Art. 21 + 22)</h3>
    <p>Refuser amélioration modèles IA avec mes données :</p>
    <button id="ax-rgpd-optout-training" class="ax-btn" style="padding:10px 14px;background:rgba(34,204,119,0.18);color:#22cc77;border:1px solid rgba(34,204,119,0.4);border-radius:10px;font-weight:600;cursor:pointer;margin-bottom:8px">🚫 Opt-out IA training (Art. 21)</button>
    <p>Opposition au profilage automatisé :</p>
    <button id="ax-rgpd-optout-automation" class="ax-btn" style="padding:10px 14px;background:rgba(160,96,255,0.18);color:#a060ff;border:1px solid rgba(160,96,255,0.4);border-radius:10px;font-weight:600;cursor:pointer">🚫 Opt-out automation (Art. 22)</button>

    <h3>📋 Registre des traitements (Art. 30)</h3>
    <div id="ax-rgpd-registry" style="background:rgba(255,255,255,0.02);padding:12px;border-radius:8px;font-size:13px"></div>

    <h3>📞 Contacter le DPO</h3>
    <p>Pour toute question RGPD, contacte le Délégué à la Protection des Données :</p>
    <p><strong>Email :</strong> <a href="mailto:kevin.desarzens@gmail.com">kevin.desarzens@gmail.com</a></p>
    <p>Délai de réponse : 30 jours maximum (extensible 60j si demande complexe).</p>

    <h3>⚖️ Recours CNIL</h3>
    <p>En cas de désaccord, tu peux saisir la CNIL :</p>
    <p><a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer">https://www.cnil.fr/fr/plaintes</a></p>
  `;
}

function getCurrentUid(): string {
  try {
    const raw = localStorage.getItem('apex_v13_user');
    if (!raw) {
      return '';
    }
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id ?? '';
  } catch {
    return '';
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

function wireRgpdActions(rootEl: HTMLElement): void {
  /* Render registre */
  const registryEl = rootEl.querySelector<HTMLElement>('#ax-rgpd-registry');
  if (registryEl) {
    const reg = rgpd.getProcessingRegistry();
    registryEl.innerHTML = reg.map((r) => `
      <div style="margin-bottom:10px;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px">
        <strong>${escapeHtml(r.finalite)}</strong>
        <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px">
          Données : ${r.donnees.map((d) => escapeHtml(d)).join(', ')}<br/>
          Base légale : ${escapeHtml(r.baseLegale)}<br/>
          Durée : ${escapeHtml(r.duree)}<br/>
          Destinataires : ${r.destinataires.map((d) => escapeHtml(d)).join(', ')}
        </div>
      </div>
    `).join('');
  }

  const exportBtn = rootEl.querySelector<HTMLButtonElement>('#ax-rgpd-export');
  if (exportBtn && activeLegalScope) activeLegalScope.bind(exportBtn, 'click', () => {
    void (async () => {
      try {
        const uid = getCurrentUid();
        if (!uid) {
          alert('Tu dois être connecté pour exporter tes données.');
          return;
        }
        const blob = await rgpd.portableExport(uid);
        downloadBlob(blob, `apex-data-${uid}-${Date.now()}.json`);
      } catch (err: unknown) {
        logger.warn('feature-legal', 'Export failed', { err });
        alert('Export échoué. Réessaie ou contacte le support.');
      }
    })();
  });

  const deleteBtn = rootEl.querySelector<HTMLButtonElement>('#ax-rgpd-delete');
  if (deleteBtn && activeLegalScope) activeLegalScope.bind(deleteBtn, 'click', () => {
    void (async () => {
      const uid = getCurrentUid();
      if (!uid) {
        alert('Tu dois être connecté pour supprimer ton compte.');
        return;
      }
      const confirmed = confirm('Confirmer la suppression définitive de ton compte ? Cette action est IRRÉVERSIBLE.');
      if (!confirmed) {
        return;
      }
      try {
        const result = await rgpd.deleteUserData(uid, true);
        if (result.ok) {
          alert(`Compte supprimé. ${result.deletedKeys.length} clés effacées. Audit log conservé.`);
          location.hash = '#login';
        } else {
          alert(`Suppression partielle : ${result.failures.join(', ')}`);
        }
      } catch (err: unknown) {
        logger.warn('feature-legal', 'Delete failed', { err });
        alert('Suppression échouée. Contacte le support.');
      }
    })();
  });

  const cookiesBtn = rootEl.querySelector<HTMLButtonElement>('#ax-rgpd-cookies-customize');
  if (cookiesBtn && activeLegalScope) activeLegalScope.bind(cookiesBtn, 'click', () => {
    const analytics = confirm('Cookies analytics (anonymisés) — accepter ?');
    const marketing = confirm('Cookies marketing — accepter ? (non utilisés actuellement)');
    rgpd.setConsent({ analytics, marketing, preferences: true });
    alert('Préférences cookies enregistrées. Recharge la page pour voir l\'effet.');
  });

  const optoutTrainBtn = rootEl.querySelector<HTMLButtonElement>('#ax-rgpd-optout-training');
  if (optoutTrainBtn && activeLegalScope) activeLegalScope.bind(optoutTrainBtn, 'click', () => {
    const uid = getCurrentUid();
    if (!uid) {
      alert('Tu dois être connecté.');
      return;
    }
    rgpd.optOutAITraining(uid, true);
    alert('Opt-out IA training enregistré.');
  });

  const optoutAutoBtn = rootEl.querySelector<HTMLButtonElement>('#ax-rgpd-optout-automation');
  if (optoutAutoBtn && activeLegalScope) activeLegalScope.bind(optoutAutoBtn, 'click', () => {
    const uid = getCurrentUid();
    if (!uid) {
      alert('Tu dois être connecté.');
      return;
    }
    rgpd.optOutAutomation(uid, true);
    alert('Opt-out automation Art. 22 enregistré.');
  });
}

async function renderTabContent(rootEl: HTMLElement, tabId: string): Promise<void> {
  const tab = TABS.find((t) => t.id === tabId);
  if (!tab) {
    return;
  }
  const contentEl = rootEl.querySelector<HTMLElement>('#ax-legal-content');
  if (!contentEl) {
    return;
  }
  if (tab.id === 'rgpd') {
    contentEl.innerHTML = renderRgpdWidget();
    wireRgpdActions(contentEl);
    return;
  }
  contentEl.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-style:italic">Chargement…</p>';
  const md = await loadLegalDoc(tab.file);
  contentEl.innerHTML = renderMarkdown(md);
}

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeLegalScope?.cleanup();
  activeLegalScope = createCleanupScope('legal');
  /* Lit l'ancre URL (#legal/cgu, #legal/privacy, etc.) */
  const subRoute = location.hash.replace(/^#legal\/?/, '').split('/')[0] || 'cgu';
  const initialTab = TABS.find((t) => t.id === subRoute) ? subRoute : 'cgu';

  rootEl.innerHTML = cspStyleHelper.withNonce(`
    <style>
      .ax-legal-content {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        line-height: 1.65;
        color: rgba(255,255,255,0.85);
      }
      .ax-legal-content h1, .ax-legal-content h2, .ax-legal-content h3, .ax-legal-content h4 {
        color: #e8b830;
        margin-top: 24px;
      }
      .ax-legal-content h1 { font-size: 26px; }
      .ax-legal-content h2 { font-size: 20px; }
      .ax-legal-content h3 { font-size: 16px; }
      .ax-legal-content table {
        width: 100%; border-collapse: collapse; margin: 12px 0;
      }
      .ax-legal-content th, .ax-legal-content td {
        padding: 8px; border: 1px solid rgba(255,255,255,0.1); text-align: left;
        font-size: 13px;
      }
      .ax-legal-content th {
        background: rgba(232,184,48,0.1); color: #e8b830;
      }
      .ax-legal-content blockquote {
        border-left: 3px solid #e8b830; padding-left: 12px;
        color: rgba(255,255,255,0.7); font-style: italic; margin: 8px 0;
      }
      .ax-legal-content code {
        background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px;
      }
      .ax-legal-content a { color: #e8b830; }
      .ax-legal-content ul { padding-left: 20px; }
      .ax-legal-content hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0; }
    </style>
    <div style="max-width:880px;margin:0 auto;padding:24px 16px max(24px, env(safe-area-inset-bottom)) 16px">
      <header class="ax-gs-180">
        <h1 style="margin:0 0 6px;font-size:clamp(24px,4.5vw,30px);font-weight:700;background:linear-gradient(135deg,#c9a227 0%,#e8b830 50%,#f5cc4a 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-family:Georgia,serif;letter-spacing:-0.025em">⚖️ Documents légaux</h1>
        <p class="ax-gs-399">Conformité RGPD + EU + France/Monaco</p>
      </header>

      <div id="ax-legal-tabs" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
        ${renderTabs(initialTab)}
      </div>

      <div id="ax-legal-content" class="ax-legal-content"></div>

      <p class="ax-gs-235">
        <a href="#chat" style="color:#e8b830;text-decoration:none;font-size:14px;font-weight:500;display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:rgba(232,184,48,0.08);border-radius:24px;border:1px solid rgba(232,184,48,0.2)">← Retour</a>
      </p>
    </div>
  `);

  void renderTabContent(rootEl, initialTab);

  rootEl.querySelectorAll<HTMLButtonElement>('.ax-legal-tab').forEach((btn) => {
    activeLegalScope!.bind(btn, 'click', () => {
      const id = btn.getAttribute('data-tab');
      if (!id) {
        return;
      }
      /* Mise à jour visuelle des tabs */
      const tabsEl = rootEl.querySelector<HTMLElement>('#ax-legal-tabs');
      if (tabsEl) {
        tabsEl.innerHTML = renderTabs(id);
        rootEl.querySelectorAll<HTMLButtonElement>('.ax-legal-tab').forEach((b) => {
          activeLegalScope!.bind(b, 'click', () => {
            const newId = b.getAttribute('data-tab');
            if (newId) {
              location.hash = `#legal/${newId}`;
            }
          });
        });
      }
      void renderTabContent(rootEl, id);
      try {
        history.replaceState(null, '', `#legal/${id}`);
      } catch {
        /* ignore */
      }
    });
  });

  logger.info('feature-legal', 'rendered', { tab: initialTab });
}
