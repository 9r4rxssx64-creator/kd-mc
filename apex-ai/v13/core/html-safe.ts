/**
 * HTML Safety helpers — P1 SECU (audit v13.2.7).
 *
 * Audit a noté 4 innerHTML dynamiques non-escaped + DOMPurify dans deps mais
 * 0 import. Ce module fournit :
 *  1. escapeHtml() : pour interpolation textuelle dans HTML (défense XSS minimale)
 *  2. sanitizeHtml() : pour HTML produit (markdown, contenu IA) — utilise DOMPurify lazy
 *
 * Règle d'or : si la donnée vient d'une source EXTERNE (API, user input,
 * Firebase, fichier picker, WebSocket) → DOIT passer par l'un des deux.
 *
 * v13.4.186 — escapeHtml/esc re-exportés depuis core/escape-html.ts (source unique).
 */

import { escapeHtml, esc } from './escape-html.js';

/**
 * Re-export façade — utilise CETTE FONCTION pour les `${variable}` dans les
 * template literals qui finissent dans `.innerHTML`.
 *
 * @example
 * el.innerHTML = `<p>${escapeHtml(userInput)}</p>`;
 */
export { escapeHtml, esc };

/**
 * Sanitize HTML via DOMPurify (lazy CDN ou bundle local).
 * Utilise CETTE FONCTION pour le HTML produit dynamiquement (rendu markdown,
 * réponses IA en HTML, contenu Firebase déjà au format HTML).
 *
 * Sans await : utilise escapeHtml en fallback synchrone.
 * Avec await : DOMPurify chargé + appelé.
 *
 * @example
 * const safe = await sanitizeHtml(markdownToHtml(userInput));
 * el.innerHTML = safe;
 */
type PurifyApi = { sanitize: (html: string, opts?: object) => string };
type PurifyFactory = (win?: Window) => PurifyApi;

let _dompurifyPromise: Promise<PurifyApi> | null = null;

async function loadDOMPurify(): Promise<PurifyApi> {
  if (_dompurifyPromise) return _dompurifyPromise;
  _dompurifyPromise = import('dompurify').then((mod) => {
    /* DOMPurify exports : default est une FACTORY fn (Node) OU directement une instance avec sanitize (browser).
     * Browser : DOMPurify est pré-initialisé avec window.
     * Node/jsdom : il faut appeler DOMPurify(window) pour obtenir l'instance. */
    const def = (mod as unknown as { default: unknown }).default
      ?? (mod as unknown as Record<string, unknown>);
    /* Cas 1 : default a déjà sanitize (browser) */
    if (def && typeof (def as { sanitize?: unknown }).sanitize === 'function') {
      return def as PurifyApi;
    }
    /* Cas 2 : default est une factory fn (Node ou jsdom) → appeler avec window */
    if (typeof def === 'function' && typeof window !== 'undefined') {
      const factory = def as PurifyFactory;
      return factory(window);
    }
    throw new Error('DOMPurify import shape inconnu');
  });
  return _dompurifyPromise;
}

export async function sanitizeHtml(html: string, opts?: object): Promise<string> {
  if (!html) return '';
  try {
    const purify = await loadDOMPurify();
    return purify.sanitize(html, opts ?? {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'hr', 'span', 'div'],
      ALLOWED_ATTR: ['href', 'title', 'class', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
    });
  } catch (err) {
    /* Si DOMPurify charge fail, fallback escape complet (pas d'HTML mais pas de XSS) */
    void err;
    return escapeHtml(html);
  }
}

/**
 * Sanitize URL (anti javascript: + data: + vbscript: schemes).
 * Utilise pour href/src dynamiques.
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = String(url).trim().toLowerCase();
  // eslint-disable-next-line no-script-url -- intentional check pour filtrer ces schémas malicieux
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('vbscript:') || trimmed.startsWith('data:text/html')) {
    return ''; /* unsafe scheme — refuse */
  }
  return String(url);
}

/**
 * Set HTML safely on an element with synchronous DOMPurify-style stripping fallback.
 * Use when content may contain user-generated HTML and async sanitizeHtml() is not feasible.
 *
 * Strips :
 *  - <script>...</script>
 *  - <iframe>...</iframe>  (sauf si caller veut iframe whitelisted ailleurs)
 *  - on*= attributes (onclick, onload, onerror, ...)
 *  - javascript:, vbscript:, data:text/html in href/src
 *
 * For 100% safety on user input, prefer escapeHtml() in template literals OR
 * await sanitizeHtml() (uses DOMPurify properly).
 *
 * @example
 * safeSetHTML(el, untrustedHtml);  // strips XSS vectors synchronously
 */
export function safeSetHTML(el: HTMLElement | null | undefined, html: string | null | undefined): void {
  if (!el) return;
  if (html === null || html === undefined) {
    el.innerHTML = '';
    return;
  }
  const cleaned = stripDangerousHtml(String(html));
  el.innerHTML = cleaned;
}

/**
 * Strip the most dangerous XSS vectors from an HTML string (synchronous).
 * Not a complete sanitizer — for that use sanitizeHtml() (async, DOMPurify).
 */
export function stripDangerousHtml(html: string): string {
  if (!html) return '';
  let s = String(html);
  /* Remove <script>...</script> blocks (case-insensitive, multi-line) */
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  s = s.replace(/<script\b[^>]*\/?>/gi, '');
  /* Remove <iframe>...</iframe> blocks */
  s = s.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '');
  s = s.replace(/<iframe\b[^>]*\/?>/gi, '');
  /* Remove <object>, <embed>, <link rel="import"> */
  s = s.replace(/<(object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<(object|embed)\b[^>]*\/?>/gi, '');
  /* Strip on* event handlers (onclick=, onload=, onerror=, ...) */
  s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  /* Strip javascript:/vbscript: URLs in href/src */
  s = s.replace(/(href|src)\s*=\s*"\s*(javascript|vbscript):[^"]*"/gi, '$1="#"');
  s = s.replace(/(href|src)\s*=\s*'\s*(javascript|vbscript):[^']*'/gi, "$1='#'");
  /* Strip data:text/html URLs */
  s = s.replace(/(href|src)\s*=\s*"\s*data:text\/html[^"]*"/gi, '$1="#"');
  s = s.replace(/(href|src)\s*=\s*'\s*data:text\/html[^']*'/gi, "$1='#'");
  return s;
}
