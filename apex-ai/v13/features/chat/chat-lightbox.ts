/**
 * APEX v13 — chat-lightbox.ts
 * Lightbox plein écran d'une image d'album + actions (transform Replicate,
 * share, download) + insertion du résultat transformé dans le chat.
 *
 * Extrait de features/chat/index.ts (v13.4.294, refactor monolithe sans
 * régression) : aucune dépendance d'état module (travaillent sur rootEl/DOM).
 * Re-exporté par index.ts (façade backward-compat — tests + caller render inchangés).
 */
import { toast } from '../../ui/toast.js';

import { type AlbumImage } from './chat-album.js';
import { escapeHtml } from './chat-markdown.js';
import { getTransformEmoji } from './chat-renderers.js';

export function openImageLightbox(rootEl: HTMLElement, img: AlbumImage): HTMLElement {
  const safeUrl = escapeHtml(img.url);
  const safeName = escapeHtml(img.filename);
  const modal = document.createElement('div');
  modal.className = 'ax-lightbox';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Visualisation image');
  /* v13.4.232 finding P1.10 — glassmorphism lightbox au lieu de noir 95% opaque */
  modal.classList.add('ax-modal-glass');
  modal.style.cssText =
    'position:fixed;inset:0;z-index:99999;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'padding:env(safe-area-inset-top,20px) 16px env(safe-area-inset-bottom,20px) 16px';

  const btnStyle =
    'min-height:44px;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);' +
    'background:rgba(20,20,35,0.7);color:#fff;font-size:13px;cursor:pointer;' +
    '-webkit-tap-highlight-color:transparent;font-weight:600;';

  modal.innerHTML =
    `<button class="ax-lb-close" aria-label="Fermer" ` +
    `style="position:absolute;top:env(safe-area-inset-top,20px);right:16px;width:44px;height:44px;` +
    `border-radius:50%;background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:20px;cursor:pointer;` +
    `-webkit-tap-highlight-color:transparent;z-index:1">✕</button>` +
    `<img src="${safeUrl}" alt="${safeName}" loading="lazy" decoding="async" ` +
    `style="max-width:100%;max-height:65vh;object-fit:contain;border-radius:12px;` +
    `box-shadow:0 10px 40px rgba(0,0,0,0.5)">` +
    `<div class="ax-lb-filename" style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:12px;text-align:center">${safeName}</div>` +
    `<div class="ax-lb-actions" ` +
    `style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap;justify-content:center;max-width:680px">` +
    `<button data-action="cartoon" style="${btnStyle}" title="Transformer en cartoon">🎨 Cartoon</button>` +
    `<button data-action="anime" style="${btnStyle}" title="Style anime">🤖 Anime</button>` +
    `<button data-action="video" style="${btnStyle}" title="Animer en vidéo">🎬 Animer vidéo</button>` +
    `<button data-action="remove-bg" style="${btnStyle}" title="Retirer le fond">✂️ Retirer fond</button>` +
    `<button data-action="stylize" style="${btnStyle}" title="Variation stylisée">🎭 Variations</button>` +
    `<button data-action="share" style="${btnStyle}" title="Partager">📤 Partager</button>` +
    `<button data-action="download" style="${btnStyle}" title="Télécharger">💾 Télécharger</button>` +
    `</div>` +
    `<div class="ax-lb-status" data-status ` +
    `style="margin-top:14px;color:var(--ax-gold-deep);font-size:12px;min-height:18px;text-align:center"></div>`;

  document.body.appendChild(modal);

  const close = (): void => {
    if (modal.parentNode) modal.parentNode.removeChild(modal);
  };

  const closeBtn = modal.querySelector<HTMLButtonElement>('.ax-lb-close');
  closeBtn?.addEventListener('click', close);

  const keyHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', keyHandler);
    }
  };
  document.addEventListener('keydown', keyHandler);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  const statusEl = modal.querySelector<HTMLDivElement>('[data-status]');
  modal.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset['action'] ?? '';
      void handleLightboxAction(rootEl, img, action, statusEl, close);
    });
  });

  return modal;
}

/**
 * Handler central des actions lightbox.
 * Exposé pour tests (mockable).
 */
export async function handleLightboxAction(
  rootEl: HTMLElement,
  img: AlbumImage,
  action: string,
  statusEl: HTMLDivElement | null,
  closeFn: () => void,
): Promise<void> {
  if (action === 'share') {
    const nav = navigator as Navigator & { share?: (data: { url?: string; title?: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ url: img.url, title: img.filename });
        return;
      } catch { /* user cancelled — fallback copy */ }
    }
    try {
      await navigator.clipboard.writeText(img.url);
      toast.success('Lien copié dans le presse-papiers');
    } catch {
      toast.warn('Partage non supporté par ce navigateur');
    }
    return;
  }

  if (action === 'download') {
    try {
      const a = document.createElement('a');
      a.href = img.url;
      a.download = img.filename || 'image';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Téléchargement échoué');
    }
    return;
  }

  const transformActions = ['cartoon', 'anime', 'video', 'remove-bg', 'stylize'];
  if (transformActions.includes(action)) {
    if (statusEl) statusEl.textContent = `⏳ ${action} en cours… (Replicate)`;
    let prompt: string | undefined;
    if (action === 'stylize') {
      const p = window.prompt('Style souhaité (ex: "huile sur toile renaissance") :');
      if (!p) {
        if (statusEl) statusEl.textContent = '';
        return;
      }
      prompt = p;
    }
    try {
      const { apexToolsDispatch } = await import('../../services/core-svc/apex-tools-dispatch.js');
      const params: Record<string, unknown> = { url: img.url, type: action };
      if (prompt) params['prompt'] = prompt;
      const res = await apexToolsDispatch.execute('transform_image', params, 'admin');
      if (!res.ok) {
        const errMsg = res.error ?? 'transformation échouée';
        if (statusEl) statusEl.textContent = `❌ ${errMsg}`;
        toast.error(errMsg);
        return;
      }
      const result = res.result as { success?: boolean; outputUrl?: string; error?: string; cost_eur?: number };
      if (!result.success || !result.outputUrl) {
        const errMsg = result.error ?? 'aucun outputUrl';
        if (statusEl) statusEl.textContent = `❌ ${errMsg}`;
        return;
      }
      if (statusEl) {
        const cost = result.cost_eur !== undefined && result.cost_eur !== null ? ` (${result.cost_eur.toFixed(3)}€)` : '';
        statusEl.textContent = `✅ Transformé${cost}`;
      }
      pushTransformResult(rootEl, result.outputUrl, action, img.filename);
      setTimeout(closeFn, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'erreur';
      if (statusEl) statusEl.textContent = `❌ ${msg}`;
    }
    return;
  }
}

export function pushTransformResult(
  rootEl: HTMLElement,
  outputUrl: string,
  transformType: string,
  sourceFilename: string,
): void {
  const scroll = rootEl.querySelector<HTMLElement>('.ax-chat-scroll');
  if (!scroll) return;
  const safeUrl = escapeHtml(outputUrl);
  const safeName = escapeHtml(sourceFilename);
  const safeType = escapeHtml(transformType);
  const isVideo = transformType === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(outputUrl);
  const media = isVideo
    ? `<video src="${safeUrl}" controls autoplay loop playsinline ` +
      `style="max-width:100%;max-height:70vh;border-radius:12px;display:block">` +
      `Ton navigateur ne supporte pas la vidéo HTML5.</video>`
    : `<img src="${safeUrl}" alt="${safeName} ${safeType}" loading="lazy" decoding="async" ` +
      `style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:12px;display:block">`;

  const card = document.createElement('div');
  card.className = 'ax-msg ax-msg-assistant ax-slide-up-fade ax-transform-result';
  card.dataset['transformType'] = transformType;
  card.innerHTML =
    `<div class="ax-msg-body">` +
    `<p style="margin:0 0 8px;color:var(--ax-gold-deep);font-size:12px;font-weight:600">` +
    `${getTransformEmoji(transformType)} ${safeType} appliqué sur ${safeName}</p>` +
    media +
    `<div class="ax-transform-actions" style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">` +
    `<button data-tr-action="download" data-tr-url="${safeUrl}" ` +
    `style="min-height:36px;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);` +
    `background:rgba(20,20,35,0.7);color:#fff;font-size:12px;cursor:pointer">💾 Télécharger</button>` +
    `<button data-tr-action="share" data-tr-url="${safeUrl}" ` +
    `style="min-height:36px;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);` +
    `background:rgba(20,20,35,0.7);color:#fff;font-size:12px;cursor:pointer">📤 Partager</button>` +
    `</div>` +
    `</div>`;
  scroll.appendChild(card);
  scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });

  card.querySelectorAll<HTMLButtonElement>('[data-tr-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const trAction = btn.dataset['trAction'] ?? '';
      const trUrl = btn.dataset['trUrl'] ?? '';
      if (trAction === 'download') {
        const a = document.createElement('a');
        a.href = trUrl;
        a.download = `apex-${transformType}-${Date.now()}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (trAction === 'share') {
        const nav = navigator as Navigator & { share?: (d: { url?: string }) => Promise<void> };
        if (nav.share) {
          void nav.share({ url: trUrl }).catch(() => { /* cancelled */ });
        } else {
          void navigator.clipboard?.writeText(trUrl);
        }
      }
    });
  });
}
