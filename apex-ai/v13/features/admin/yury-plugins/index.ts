/**
 * APEX v13.4.2 — Vue admin "Yury Plugins" (Kevin 2026-05-09).
 *
 * 5 plugins applicatifs équivalents Yury.ai TikTok :
 *   1. Security Review     — scan runtime vulnérabilités
 *   2. Code Review 5 Agents — review diff par 5 IA en parallèle
 *   3. Frontend Design     — génère composant UI anti-slop
 *   4. Superpowers         — 7-step methodology (brainstorm → reflect)
 *   5. GStack Roles        — 7 rôles (CEO/Designer/Engineer/QA/Release/Reviewer/Reflector)
 *
 * UX :
 *   - 5 cards (1 par plugin), bouton "Lancer" sur chacune
 *   - Résultat affiché dans modal-sheet (slide-up bottom)
 *   - Guard admin only via store.get('isAdmin')
 *   - escapeHtml partout (CSP strict)
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { router } from '../../../core/router.js';
import { store } from '../../../core/store.js';
import { securityReview, type ScanReport } from '../../../services/admin/security-review.js';
import { codeReviewMultiAgent, type ReviewReport } from '../../../services/ai/code-review-multi-agent.js';
import { superpowersMethodology, type SuperpowerSession } from '../../../services/ai/superpowers-methodology.js';
import { frontendDesign, type DesignOutput } from '../../../services/core-svc/frontend-design.js';
import { gstackRoles, type PipelineResult } from '../../../services/core-svc/gstack-roles.js';
import { haptic } from '../../../ui/haptic.js';
import { modalSheet } from '../../../ui/modal-sheet.js';
import { toast } from '../../../ui/toast.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

interface PluginCard {
  id: string;
  emoji: string;
  name: string;
  description: string;
  status: 'installed' | 'configurable';
  buttonLabel: string;
}

const PLUGINS: PluginCard[] = [
  {
    id: 'security-review',
    emoji: '🔒',
    name: 'Security Review',
    description: 'Scan runtime exhaustif : secrets en clair, CSP violations, vault drift, audit integrity.',
    status: 'installed',
    buttonLabel: 'Lancer scan',
  },
  {
    id: 'code-review-5-agents',
    emoji: '👥',
    name: 'Code Review 5 Agents',
    description: '5 IA en parallèle (CLAUDE.md compliance / bugs / redondance / git history / patterns).',
    status: 'configurable',
    buttonLabel: 'Reviewer un diff',
  },
  {
    id: 'frontend-design',
    emoji: '🎨',
    name: 'Frontend Design',
    description: 'Génère un composant UI production-grade depuis prompt avec anti-slop strict.',
    status: 'configurable',
    buttonLabel: 'Générer composant',
  },
  {
    id: 'superpowers',
    emoji: '⚡',
    name: 'Superpowers',
    description: '7-step methodology : brainstorm → plan → dev → test → review → ship → reflect.',
    status: 'configurable',
    buttonLabel: 'Démarrer session',
  },
  {
    id: 'gstack-roles',
    emoji: '🏛',
    name: 'GStack Roles',
    description: '7 rôles spécialisés (CEO/Designer/Engineer/QA/Release/Reviewer/Reflector).',
    status: 'configurable',
    buttonLabel: 'Lancer pipeline',
  },
];

function renderCard(plugin: PluginCard): string {
  const statusBadge = plugin.status === 'installed'
    ? '<span style="background:rgba(34,204,119,0.15);color:#22cc77;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;letter-spacing:0.02em">✅ Actif</span>'
    : '<span style="background:rgba(232,184,48,0.15);color:#e8b830;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;letter-spacing:0.02em">⚙️ Config</span>';

  return `
    <article class="ax-yury-card ax-gs-295" data-plugin-id="${escapeHtml(plugin.id)}">
      <header class="ax-gs-204">
        <div class="ax-gs-120">
          <span class="ax-gs-201" aria-hidden="true">${escapeHtml(plugin.emoji)}</span>
          <h3 class="ax-gs-296">${escapeHtml(plugin.name)}</h3>
        </div>
        ${statusBadge}
      </header>
      <p class="ax-gs-297">${escapeHtml(plugin.description)}</p>
      <button class="ax-btn ax-bounce-tap ax-gs-298" data-launch="${escapeHtml(plugin.id)}" aria-label="Lancer ${escapeHtml(plugin.name)}">
        ${escapeHtml(plugin.buttonLabel)}
      </button>
    </article>
  `;
}

function renderPage(): string {
  const cards = PLUGINS.map(renderCard).join('');
  return `
    <div class="ax-yury-plugins ax-gs-299">
      <header class="ax-gs-202">
        <div>
          <h1 class="ax-gs-300">🚀 Yury Plugins (équivalents Apex)</h1>
          <p class="ax-gs-301">5 services applicatifs natifs PWA, pas Claude Code</p>
        </div>
        <button class="ax-btn ax-bounce-tap ax-gs-302" data-back-admin aria-label="Retour Admin">← Admin</button>
      </header>
      <div class="ax-yury-grid ax-gs-203">
        ${cards}
      </div>
    </div>
  `;
}

async function launchSecurityReview(): Promise<void> {
  toast.info('🔒 Scan en cours...');
  try {
    const report: ScanReport = await securityReview.runFullScan();
    const findings = report.findings.length > 0
      ? report.findings.map((f) => `
        <li class="ax-gs-304">
          <strong style="color:${f.severity === 'critical' ? '#ff5566' : f.severity === 'high' ? '#ffaa44' : '#e8b830'}">[${escapeHtml(f.severity)}]</strong>
          <span>${escapeHtml(f.msg)}</span>
          ${f.fix ? `<p class="ax-gs-306">Fix : ${escapeHtml(f.fix)}</p>` : ''}
        </li>`).join('')
      : '<li class="ax-gs-205">🟢 Aucune vulnérabilité détectée.</li>';
    modalSheet.open({
      title: `🔒 Security Review — Score ${report.score}/100`,
      content: `
        <div class="ax-gs-12">
          <p class="ax-gs-311">
            ${report.passedChecks}/${report.totalChecks} checks passés · ${report.findings.length} findings · ${Math.round(report.durationMs)}ms
          </p>
          <ul class="ax-gs-307">${findings}</ul>
        </div>
      `,
      actions: [{ label: 'Fermer', variant: 'ghost', onClick: () => modalSheet.closeAll() }],
    });
  } catch (err: unknown) {
    logger.warn('yury-plugins', 'security review failed', { err });
    toast.error('Scan échoué — vérifie les logs');
  }
}

async function launchCodeReview(): Promise<void> {
  const diff = window.prompt('Colle le diff à reviewer (ou laisse vide pour démo) :', '');
  if (diff === null) return;
  toast.info('👥 Lancement des 5 agents...');
  try {
    const report: ReviewReport = await codeReviewMultiAgent.review({
      diff: diff || '+const test = "demo";\n-const old = "removed";',
    });
    const agentsList = report.agents.map((a) => `
      <li class="ax-gs-304">
        <strong>[${escapeHtml(a.role)}]</strong> · ${escapeHtml(a.provider)} · confidence ${a.confidence}/100
        <p class="ax-gs-306">${a.findings.length} finding(s)</p>
      </li>`).join('');
    modalSheet.open({
      title: `👥 Code Review — Score ${report.finalScore}/100`,
      content: `
        <div class="ax-gs-12">
          <p class="ax-gs-311">
            ${report.totalFindings} findings · ${report.criticalFindings} critical · ${Math.round(report.durationMs)}ms
          </p>
          <h3 class="ax-gs-308">Agents</h3>
          <ul style="list-style:none;padding:0;margin:0 0 14px">${agentsList}</ul>
          <h3 class="ax-gs-308">Consensus</h3>
          <pre class="ax-gs-309">${escapeHtml(report.consensus)}</pre>
        </div>
      `,
      actions: [{ label: 'Fermer', variant: 'ghost', onClick: () => modalSheet.closeAll() }],
    });
  } catch (err: unknown) {
    logger.warn('yury-plugins', 'code review failed', { err });
    toast.error('Review échouée — vérifie clés IA');
  }
}

async function launchFrontendDesign(): Promise<void> {
  const prompt = window.prompt('Décris le composant UI à générer :', 'Bouton CTA premium avec hover doux');
  if (!prompt) return;
  toast.info('🎨 Génération en cours...');
  try {
    const output: DesignOutput = await frontendDesign.generate({ prompt, framework: 'vanilla' });
    const srcdoc = frontendDesign.buildPreviewSrcdoc(output);
    /* Encode srcdoc pour attribut HTML */
    const safeSrcdoc = srcdoc.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    modalSheet.open({
      title: `🎨 Frontend Design — ${output.framework}`,
      content: `
        <div class="ax-gs-12">
          <p class="ax-gs-303">
            Généré en ${Math.round(output.durationMs)}ms · framework ${escapeHtml(output.framework)}
          </p>
          <iframe sandbox="allow-scripts" srcdoc="${safeSrcdoc}" style="width:100%;height:300px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:#fff" aria-label="Aperçu du composant généré"></iframe>
          <details class="ax-gs-187">
            <summary style="cursor:pointer;color:#e8b830;font-weight:600">Voir le code</summary>
            <pre style="background:rgba(0,0,0,0.4);color:rgba(255,255,255,0.85);padding:12px;border-radius:10px;font-size:11px;white-space:pre-wrap;max-height:30vh;overflow:auto;margin-top:8px"><strong>HTML:</strong>\n${escapeHtml(output.html)}\n\n<strong>CSS:</strong>\n${escapeHtml(output.css)}\n\n<strong>JS:</strong>\n${escapeHtml(output.js)}</pre>
          </details>
        </div>
      `,
      actions: [{ label: 'Fermer', variant: 'ghost', onClick: () => modalSheet.closeAll() }],
    });
  } catch (err: unknown) {
    logger.warn('yury-plugins', 'frontend design failed', { err });
    toast.error('Génération échouée');
  }
}

async function launchSuperpowers(): Promise<void> {
  const taskName = window.prompt('Nom de la tâche pour la session Superpowers :', 'Refactor auth flow');
  if (!taskName) return;
  const sessionId = superpowersMethodology.start(taskName);
  toast.info(`⚡ Session ${sessionId} démarrée — avancement step 1/7...`);
  try {
    const stepOutput = await superpowersMethodology.advance(sessionId);
    const session: SuperpowerSession | null = superpowersMethodology.getState(sessionId);
    modalSheet.open({
      title: `⚡ Superpowers — ${escapeHtml(taskName)}`,
      content: `
        <div class="ax-gs-12">
          <p class="ax-gs-303">
            Session ${escapeHtml(sessionId)} · step actuel : <strong>${escapeHtml(session?.currentStep ?? '-')}</strong>
          </p>
          <h3 class="ax-gs-308">Output ${escapeHtml(stepOutput?.step ?? '?')}</h3>
          <pre class="ax-gs-312">${escapeHtml(stepOutput?.output ?? '(pas de sortie)')}</pre>
          <p style="color:rgba(255,255,255,0.55);font-size:12px;margin-top:10px">
            Re-lance la vue pour avancer au step suivant.
          </p>
        </div>
      `,
      actions: [{ label: 'Fermer', variant: 'ghost', onClick: () => modalSheet.closeAll() }],
    });
  } catch (err: unknown) {
    logger.warn('yury-plugins', 'superpowers advance failed', { err });
    toast.error('Step échoué');
  }
}

async function launchGStackRoles(): Promise<void> {
  const task = window.prompt('Tâche pour le pipeline GStack 7 rôles :', 'Implémenter dark mode toggle');
  if (!task) return;
  toast.info('🏛 Pipeline 7 rôles en cours (peut prendre 30-60s)...');
  try {
    const result: PipelineResult = await gstackRoles.runFullPipeline(task);
    const rolesList = result.roles.map((r) => `
      <li class="ax-gs-304">
        <strong style="color:${r.ok ? '#22cc77' : '#ff5566'}">[${escapeHtml(r.role)}]</strong>
        ${r.ok ? '✅' : '❌'} · ${Math.round(r.durationMs)}ms
        <p class="ax-gs-306">${escapeHtml(r.output.slice(0, 200))}...</p>
      </li>`).join('');
    modalSheet.open({
      title: `🏛 GStack Pipeline — ${result.roles.filter((r) => r.ok).length}/7 OK`,
      content: `
        <div class="ax-gs-12">
          <p class="ax-gs-311">
            ${Math.round(result.totalDurationMs / 1000)}s total
          </p>
          <ul style="list-style:none;padding:0;margin:0 0 14px;max-height:50vh;overflow-y:auto">${rolesList}</ul>
        </div>
      `,
      actions: [{ label: 'Fermer', variant: 'ghost', onClick: () => modalSheet.closeAll() }],
    });
  } catch (err: unknown) {
    logger.warn('yury-plugins', 'gstack pipeline failed', { err });
    toast.error('Pipeline échoué');
  }
}

function attachHandlers(rootEl: HTMLElement): void {
  if (!activeScope) return;

  rootEl.querySelectorAll<HTMLButtonElement>('[data-launch]').forEach((btn) => {
    activeScope!.bind(btn, 'click', () => {
      haptic.tap();
      const id = btn.dataset['launch'] ?? '';
      switch (id) {
        case 'security-review': void launchSecurityReview(); break;
        case 'code-review-5-agents': void launchCodeReview(); break;
        case 'frontend-design': void launchFrontendDesign(); break;
        case 'superpowers': void launchSuperpowers(); break;
        case 'gstack-roles': void launchGStackRoles(); break;
        default: toast.warn(`Plugin ${id} non implémenté`);
      }
    });
  });

  const backBtn = rootEl.querySelector<HTMLButtonElement>('[data-back-admin]');
  if (backBtn) {
    activeScope.bind(backBtn, 'click', () => {
      haptic.tap();
      router.navigate('admin');
    });
  }
}

export function render(rootEl: HTMLElement): void {
  /* Cleanup ancien scope avant re-render */
  activeScope?.cleanup();
  activeScope = createCleanupScope('admin-yury-plugins');

  const isAdmin = store.get('isAdmin');
  if (!isAdmin) {
    rootEl.innerHTML = `
      <div class="ax-empty ax-gs-188">
        <h2>Accès réservé</h2>
        <p>Cette section est réservée à l'admin Kevin.</p>
      </div>
    `;
    return;
  }

  rootEl.innerHTML = renderPage();
  attachHandlers(rootEl);
}
