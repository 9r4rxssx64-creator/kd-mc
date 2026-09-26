/**
 * APEX v13 — Feature Workflow (automation IFTTT-like).
 * Le moteur d'exécution (triggers + actions chain) arrive en Sprint 2.
 * En attendant, chaque bouton RÉAGIT et ATTERRIT au bon endroit (règle Kevin :
 * jamais de bouton mort) : feedback toast + redirection chat où Apex peut
 * concevoir l'automatisation décrite.
 */

import { safeSetHTML } from '../../core/html-safe.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { toast } from '../../ui/toast.js';

let activeScope: CleanupScope | null = null;

/** Mémorise l'intention demandée puis ouvre le chat pour qu'Apex la traite. */
function askApex(prompt: string): void {
  try {
    sessionStorage.setItem('ax_workflow_intent', prompt);
  } catch {
    /* sessionStorage indispo : non bloquant */
  }
  toast.info('⚡ Décris ton automatisation à Apex — il va t\'aider à la configurer');
  window.location.hash = '#chat';
}

export function render(rootEl: HTMLElement): void {
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('module.workflow', rootEl, uid)) return;

  activeScope?.cleanup();
  activeScope = createCleanupScope('workflow');

  safeSetHTML(rootEl, `
    <div class="ax-page ax-gs-368">
      <h1 class="ax-gs-369">⚡ Workflows</h1>
      <p class="ax-gs-226">Automatise tes tâches récurrentes (IF this THEN that).</p>

      <div class="ax-gs-130">
        <h2 class="ax-gs-370">Workflows actifs</h2>
        <p style="color:var(--ax-text-dim);font-size:14px;margin:0">Aucun workflow configuré pour le moment.</p>
        <button class="ax-btn ax-btn-primary" id="ax-wf-new" style="width:100%;margin-top:12px;min-height:44px">+ Nouveau workflow</button>
      </div>

      <div class="ax-gs-131">
        <h2 class="ax-gs-370">Templates pré-configurés</h2>
        <div class="ax-gs-251">
          <button class="ax-btn ax-btn-sm ax-gs-487" data-wf="Email reçu → notification" style="min-height:44px">📧 Email reçu → notification</button>
          <button class="ax-btn ax-btn-sm ax-gs-487" data-wf="Réunion calendrier → préparer doc" style="min-height:44px">📅 Réunion calendrier → préparer doc</button>
          <button class="ax-btn ax-btn-sm ax-gs-487" data-wf="Lever soleil → routine matin" style="min-height:44px">🌅 Lever soleil → routine matin</button>
          <button class="ax-btn ax-btn-sm ax-gs-487" data-wf="GPS arrivé maison → lumières on" style="min-height:44px">📍 GPS arrivé maison → lumières on</button>
        </div>
      </div>

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `);

  const newBtn = rootEl.querySelector<HTMLButtonElement>('#ax-wf-new');
  if (newBtn) {
    activeScope.bind(newBtn, 'click', () => {
      askApex('Aide-moi à créer un workflow d\'automatisation personnalisé.');
    });
  }

  rootEl.querySelectorAll<HTMLButtonElement>('[data-wf]').forEach((btn) => {
    activeScope!.bind(btn, 'click', () => {
      const tpl = btn.getAttribute('data-wf') ?? 'automatisation';
      askApex(`Configure ce workflow : ${tpl}`);
    });
  });

  logger.info('feature-workflow', 'rendered');
}
