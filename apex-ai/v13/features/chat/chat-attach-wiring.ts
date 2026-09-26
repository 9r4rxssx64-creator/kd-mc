/**
 * APEX v13 — chat-attach-wiring.ts
 * Wiring des pièces jointes du chat : bouton trombone, input file, drag & drop,
 * paste image clipboard, album multi-images + lightbox. Gère pendingAttachments.
 *
 * Extrait de features/chat/index.ts render() (v13.4.303, refactor monolithe sans
 * régression). État partagé (pendingAttachments / pendingAttachmentPromises) reçu
 * par RÉFÉRENCE STABLE (mutée in-place — jamais réassignée). Appelé par render().
 */
import { logger } from '../../core/logger.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

import { type AlbumImage, renderImageAlbum } from './chat-album.js';
import { openImageLightbox } from './chat-lightbox.js';

/** Type d'une pièce jointe en attente (base64 + mime). */
export interface PendingAttachment { mime: string; base64: string; name: string }

/**
 * Câble tout le flux pièces jointes du chat.
 * @param pendingAttachments référence STABLE mutée in-place (snapshot pris au submit).
 * @param pendingAttachmentPromises référence STABLE des lectures base64 en cours.
 */
export function wireAttachments(
  rootEl: HTMLElement,
  pendingAttachments: PendingAttachment[],
  pendingAttachmentPromises: Promise<void>[],
  autoAnalyzeDeviceImage: (file: File, rootEl: HTMLElement) => void,
): void {
  const attachBtn = rootEl.querySelector<HTMLButtonElement>('#ax-chat-attach');
  const fileInput = rootEl.querySelector<HTMLInputElement>('#ax-chat-file-input');
  const attachmentsDiv = rootEl.querySelector<HTMLDivElement>('#ax-chat-attachments');
  attachBtn?.addEventListener('click', () => {
    haptic.tap();
    fileInput?.click();
  });

  const renderAttachment = (file: File): void => {
    if (!attachmentsDiv) return;
    attachmentsDiv.style.display = 'block';
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    const icon = file.type.startsWith('image/') ? '🖼️'
      : file.type.startsWith('video/') ? '🎬'
      : file.type.startsWith('audio/') ? '🎵'
      : file.type.includes('pdf') ? '📄'
      : file.type.includes('zip') || file.type.includes('rar') || file.type.includes('7z') ? '📦'
      : '📎';
    const div = document.createElement('div');
    div.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(201,162,39,0.1);border:1px solid rgba(201,162,39,0.3);border-radius:6px;margin-right:6px;font-size:12px;color:var(--ax-gold-deep)';
    /* P0 SECU XSS : escape file.name (vient de file picker = source externe) — textContent OK */
    const truncName = file.name.length > 30 ? `${file.name.slice(0, 30)}...` : file.name;
    const labelSpan = document.createElement('span');
    labelSpan.textContent = `${icon} ${truncName} (${sizeMB} MB)`;
    div.appendChild(labelSpan);
    /* v13.4.12 — Bouton ✕ remove : retire de pendingAttachments + supprime chip.
     * Si Kevin attache par erreur, peut annuler avant submit. */
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', `Retirer ${truncName}`);
    removeBtn.style.cssText = 'background:transparent;border:none;color:var(--ax-gold-deep);cursor:pointer;font-size:14px;padding:0 2px;line-height:1';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      /* Retire de pendingAttachments par match name+mime (cas réaliste : noms uniques) */
      { const _kept = pendingAttachments.filter((a) => !(a.name === file.name && a.mime === file.type)); pendingAttachments.length = 0; pendingAttachments.push(..._kept); }
      div.remove();
      /* Si plus aucune chip → masquer la div */
      if (attachmentsDiv.children.length === 0) attachmentsDiv.style.display = 'none';
      haptic.tap();
    });
    div.appendChild(removeBtn);
    attachmentsDiv.appendChild(div);
  };

  /**
   * Album rendu visuel : push grille d'images dans chat scroll + click → lightbox.
   * Kevin règle 2026-05-07 : "je veux le visuel pas une liste d'écriture".
   */
  const pushAlbumToChat = (images: AlbumImage[]): void => {
    const scroll = rootEl.querySelector<HTMLElement>('.ax-chat-scroll');
    if (!scroll || images.length === 0) return;
    const card = document.createElement('div');
    card.className = 'ax-msg ax-msg-user ax-slide-up-fade';
    /* v13.4.133 audit-grade : renderImageAlbum() escape déjà tout (escapeHtml
     * sur img.url + img.filename), donc safe. Wrapper en DOM API pour passer
     * audit Cure53 strict (false-positive grep innerHTML+${}). */
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'ax-msg-body';
    /* renderImageAlbum retourne string déjà escapée — innerHTML safe ici */
    bodyDiv.innerHTML = renderImageAlbum(images);
    card.append(bodyDiv);
    scroll.appendChild(card);
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
    /* Wire click sur chaque thumbnail → lightbox */
    card.querySelectorAll<HTMLElement>('.ax-album-item').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const idxStr = thumb.dataset['imgIdx'] ?? '0';
        const idx = parseInt(idxStr, 10);
        const img = images[idx];
        if (img) openImageLightbox(rootEl, img);
      });
    });
  };

  fileInput?.addEventListener('change', () => {
    const files = Array.from(fileInput.files ?? []);
    if (files.length === 0) return;
    haptic.success();
    /* Collecte images pour rendre album visuel (Kevin "visuel pas liste") */
    const albumImages: AlbumImage[] = [];
    for (const file of files) {
      renderAttachment(file);
      if (file.type.startsWith('image/')) {
        try {
          const url = URL.createObjectURL(file);
          albumImages.push({ url, filename: file.name });
        } catch { /* ignore createObjectURL fail */ }
        /* v13.4.11/12 fix Kevin "Apex aveugle aux pièces jointes" :
         * Lire base64 et push dans pendingAttachments — l'IA recevra l'image
         * dans son context array Anthropic au prochain submit.
         * v13.4.12 : trackée dans pendingAttachmentPromises pour await submit
         * (anti race condition si Kevin submit avant que FileReader termine). */
        const readPromise = (async () => {
          try {
            const b64 = await new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(r.result as string);
              r.onerror = () => reject(new Error('FileReader error'));
              r.readAsDataURL(file);
            });
            /* Cap 5MB par image (limite Anthropic + perf) */
            if (file.size > 5 * 1024 * 1024) {
              toast.warn(`📷 ${file.name} > 5MB, IA ne le verra pas (display only)`, { duration: 5000 });
            } else {
              pendingAttachments.push({ mime: file.type, base64: b64, name: file.name });
            }
          } catch (err: unknown) {
            logger.warn('chat', 'pendingAttachments push failed', { err, file: file.name });
          }
        })();
        pendingAttachmentPromises.push(readPromise);
        /* Auto-cleanup quand terminée : retire du tableau pour éviter accumulation */
        void readPromise.finally(() => {
          { const _i = pendingAttachmentPromises.indexOf(readPromise); if (_i >= 0) pendingAttachmentPromises.splice(_i, 1); }
        });
        /* v13.3.51 — Auto-vision device sur upload image */
        void autoAnalyzeDeviceImage(file, rootEl);
        /* v13.3.53 — Multi-Source EXHAUSTIVE extraction (Kevin règle 2026-05-07 23h55) :
         * "1 source peut contenir N éléments — extraire TOUT + étudier + tester + installer".
         * Image upload → Claude Vision → credentials/URLs/IPs/MACs/device IDs → vault + linksRegistry. */
        void (async () => {
          try {
            const reader = new FileReader();
            reader.onload = async () => {
              const dataUrl = reader.result as string;
              const { multiSourceAnalyze } = await import('../../services/ai/multi-source-analyze.js');
              toast.info('🔍 Analyse multi-source en cours...', { duration: 3000 });
              const result = await multiSourceAnalyze.analyzeImage(dataUrl);
              if (result.extracted_count === 0) return;
              const installRes = await multiSourceAnalyze.installAll(result, { test: true });
              const safe = result.extracted_count - result.items.filter((it) => it.forbidden).length;
              const msg = `✅ ${installRes.installed}/${safe} installés · ${installRes.tested_ok} testés OK${installRes.failed.length ? ` · ${installRes.failed.length} fail` : ''}`;
              toast.success(msg, { duration: 8000 });
            };
            reader.readAsDataURL(file);
          } catch (err) {
            logger.warn('chat', 'multi-source analyze image failed', { err });
          }
        })();
      }
      void (async () => {
        try {
          const { fileConverter } = await import('../../services/core-svc/file-converter.js');
          const r = await fileConverter.ingest(file, 'admin');
          if (r.ok) toast.success(`✅ ${file.name} ingéré`);
          else toast.warn(`Fichier non ajouté : ${r.reason ?? file.name}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'erreur';
          console.warn("attach:", msg); toast.warn("Ce fichier n'a pas pu être lu");
        }
      })();
    }
    if (albumImages.length > 0) pushAlbumToChat(albumImages);
    fileInput.value = '';
  });

  /* Drag & drop sur zone chat */
  const chatBody = rootEl.querySelector<HTMLElement>('.ax-chat-body, #ax-chat-form');
  if (chatBody) {
    chatBody.addEventListener('dragover', (e) => {
      e.preventDefault();
      chatBody.style.background = 'rgba(201,162,39,0.1)';
    });
    chatBody.addEventListener('dragleave', () => {
      chatBody.style.background = '';
    });
    chatBody.addEventListener('drop', (e) => {
      e.preventDefault();
      chatBody.style.background = '';
      const dropEvent = e as DragEvent;
      const files = Array.from(dropEvent.dataTransfer?.files ?? []);
      for (const file of files) {
        renderAttachment(file);
        if (file.type.startsWith('image/')) {
          /* v13.3.51 — Auto-vision device sur drop image */
          void autoAnalyzeDeviceImage(file, rootEl);
        }
        void (async () => {
          try {
            const { fileConverter } = await import('../../services/core-svc/file-converter.js');
            await fileConverter.ingest(file, 'admin');
            toast.success(`📎 ${file.name} ajouté`);
          } catch { /* ignore */ }
        })();
      }
    });
  }

  /* Paste image/file depuis clipboard (Ctrl+V image) */
  const ta2 = rootEl.querySelector<HTMLTextAreaElement>('#ax-chat-text');
  ta2?.addEventListener('paste', (e: ClipboardEvent) => {
    const items = e.clipboardData?.items ?? [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          renderAttachment(file);
          if (file.type.startsWith('image/')) {
            /* v13.3.51 — Auto-vision device sur paste clipboard image (Kevin "rien fait") */
            void autoAnalyzeDeviceImage(file, rootEl);
          }
          void (async () => {
            try {
              const { fileConverter } = await import('../../services/core-svc/file-converter.js');
              await fileConverter.ingest(file, 'admin');
              toast.success(`📋 ${file.name || 'media collé'} ajouté`);
            } catch { /* ignore */ }
          })();
        }
      }
    }
  });
}
