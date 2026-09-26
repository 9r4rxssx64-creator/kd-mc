/**
 * APEX v13.4.171 — Chat image album rendering (extrait de chat/index.ts).
 *
 * Refactor minutieux Kevin "expert sans régression" :
 * - AlbumImage interface
 * - renderImageAlbum : pure HTML string builder grid 1/2/3 cols selon count
 * - XSS-safe via escapeHtml
 *
 * Re-exportées depuis chat/index.ts (façade backward-compat).
 *
 * Kevin règle 2026-05-07 : "je veux avoir le visuel pas une liste d'écriture, album entier"
 */

import { escapeHtml } from './chat-markdown.js';

export interface AlbumImage {
  url: string;
  filename: string;
}

/**
 * Album image rendu : grille adaptative (1/2/3 cols selon count), thumbnails visuels.
 *
 * Retourne chaîne vide si liste vide ou non-array.
 *
 * Layout :
 * - 1 image  → 1 colonne
 * - 2-4 imgs → 2 colonnes
 * - 5+ imgs  → 3 colonnes
 */
export function renderImageAlbum(images: AlbumImage[]): string {
  if (!Array.isArray(images) || images.length === 0) return '';
  const cols = images.length === 1 ? 1 : images.length <= 4 ? 2 : 3;
  const items = images
    .map((img, i) => {
      const safeUrl = escapeHtml(img.url);
      const safeName = escapeHtml(img.filename);
      return (
        `<div class="ax-album-item" data-img-idx="${i}" ` +
        `style="aspect-ratio:1;background:#1a1a2e;border-radius:8px;overflow:hidden;` +
        `position:relative;cursor:pointer;-webkit-tap-highlight-color:transparent">` +
        `<img src="${safeUrl}" alt="${safeName}" loading="lazy" ` +
        `style="width:100%;height:100%;object-fit:cover;transition:transform 200ms cubic-bezier(0.16,1,0.3,1)">` +
        `<div class="ax-album-overlay" ` +
        `style="position:absolute;bottom:0;left:0;right:0;padding:8px;` +
        `background:linear-gradient(to top,rgba(0,0,0,0.85),transparent);` +
        `color:#fff;font-size:11px;line-height:1.3;text-overflow:ellipsis;` +
        `overflow:hidden;white-space:nowrap">${safeName}</div>` +
        `</div>`
      );
    })
    .join('');
  return (
    `<div class="ax-image-album" ` +
    `style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;` +
    `margin:12px 0;border-radius:12px">${items}</div>`
  );
}
