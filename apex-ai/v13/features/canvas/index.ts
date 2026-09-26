/**
 * APEX v13 — Canvas / Artifacts.
 *
 * Parité flagship 2026 (ChatGPT Canvas, Claude Artifacts, Gemini Canvas) :
 * panneau qui ouvre un artifact (code/HTML/SVG) en ÉDITION avec APERÇU LIVE
 * (iframe sandbox srcdoc). Copier / Télécharger / retour chat.
 *
 * Découplé : l'artifact à ouvrir est déposé dans sessionStorage par l'appelant
 * (commande /canvas) puis lu au render. escapeHtml partout (anti-XSS).
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { buildPreviewDoc, readCanvasArtifact } from '../../services/ai/artifacts.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { toast } from '../../ui/toast.js';

export { escapeHtml };

let scope: CleanupScope | null = null;

export function dispose(): void {
  scope?.cleanup();
  scope = null;
}

export function render(rootEl: HTMLElement): void {
  scope?.cleanup();
  scope = createCleanupScope('canvas');
  const user = store.get('user') as { id?: string } | null;
  const uid = user?.id ?? 'anon';
  if (!guardFeatureEnabled('module.canvas', rootEl, uid)) return;

  const art = readCanvasArtifact();
  if (!art) {
    rootEl.innerHTML = `
      <div class="ax-page ax-gs-332">
        <header class="ax-gs-210"><h1 class="ax-gs-333">🎨 Canvas</h1></header>
        <p class="ax-gs-213">Aucun artifact ouvert.</p>
        <p style="color:var(--ax-text-dim);font-size:13px">Dans le chat, quand Apex génère du code, du HTML ou un SVG, tape <code>/canvas</code> pour l'ouvrir ici (édition + aperçu live).</p>
        <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
      </div>`;
    return;
  }

  const previewBtn = art.previewable
    ? '<button class="ax-btn ax-btn-sm" data-action="toggle-preview" id="ax-canvas-toggle">👁 Aperçu</button>'
    : '';

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332" style="max-width:960px">
      <header class="ax-gs-210" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <h1 class="ax-gs-333" style="margin:0">🎨 Canvas</h1>
        <span class="ax-gs-3">${escapeHtml(art.lang)} · ${art.previewable ? 'aperçu live' : 'code'}</span>
        <span style="flex:1"></span>
        ${previewBtn}
        <button class="ax-btn ax-btn-sm" data-action="copy">📋 Copier</button>
        <button class="ax-btn ax-btn-sm" data-action="download">⬇️ Fichier</button>
      </header>

      <div id="ax-canvas-split" style="display:flex;flex-direction:column;gap:10px">
        <textarea id="ax-canvas-code" spellcheck="false" aria-label="Code de l'artifact"
          style="width:100%;min-height:220px;padding:12px;background:#0a0a14;border:1px solid #333;color:#e8e8f0;border-radius:8px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical;white-space:pre;overflow:auto">${escapeHtml(art.code)}</textarea>
        ${art.previewable ? `<iframe id="ax-canvas-preview" title="Aperçu de l'artifact" sandbox="allow-scripts"
          style="width:100%;min-height:300px;background:#fff;border:1px solid #333;border-radius:8px"></iframe>` : ''}
      </div>

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;

  const codeEl = rootEl.querySelector<HTMLTextAreaElement>('#ax-canvas-code');
  const frame = rootEl.querySelector<HTMLIFrameElement>('#ax-canvas-preview');

  const refreshPreview = (): void => {
    if (!frame || !codeEl) return;
    try {
      frame.srcdoc = buildPreviewDoc({ ...art, code: codeEl.value });
    } catch (err) {
      logger.warn('canvas', 'preview refresh failed', { err });
    }
  };
  if (frame) refreshPreview();

  if (codeEl) {
    let t: ReturnType<typeof setTimeout> | null = null;
    scope.bind(codeEl, 'input', () => {
      if (t) clearTimeout(t);
      t = setTimeout(refreshPreview, 400);
    });
  }

  scope.bind(rootEl, 'click', (e) => {
    const el = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!el) return;
    const code = codeEl?.value ?? art.code;
    switch (el.dataset['action']) {
      case 'copy':
        void navigator.clipboard?.writeText(code);
        toast.success('📋 Code copié');
        break;
      case 'download': {
        try {
          const ext = art.kind === 'svg' ? 'svg' : art.kind === 'html' ? 'html' : (art.lang || 'txt');
          const blob = new Blob([code], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `apex-artifact-${Date.now()}.${ext}`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
          logger.warn('canvas', 'download failed', { err });
          toast.error('Téléchargement impossible — réessaie');
        }
        break;
      }
      case 'toggle-preview':
        if (frame) {
          const hidden = frame.style.display === 'none';
          frame.style.display = hidden ? '' : 'none';
          if (hidden) refreshPreview();
        }
        break;
    }
  });
}
