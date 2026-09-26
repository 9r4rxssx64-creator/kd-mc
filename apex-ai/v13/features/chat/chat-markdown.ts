/**
 * APEX v13.4.165 — Chat markdown rendering (extrait de chat/index.ts).
 *
 * Refactor minutieux Kevin "expert sans régression" :
 * - Fonctions pures, zéro side effect, zéro dépendance.
 * - Re-exportées depuis chat/index.ts pour compat backward.
 * - Coverage mesurée séparément (avant : noyé dans chat/index.ts 3644 LOC).
 *
 * API :
 *   escapeHtml(s)         → HTML-safe string (anti-XSS)
 *   renderMarkdownLight(t) → markdown léger (gras/italique/code/br)
 */

import { escapeHtml } from '../../core/escape-html.js';

/** Échappe les caractères HTML dangereux (anti-XSS). Re-export depuis central. */
export { escapeHtml };

/**
 * Markdown ultra-léger pour streaming progressif.
 * Supporte : code block ```...```, code inline `...`, gras **...**, italique *...*, retours ligne \n.
 *
 * Ordre des replace IMPORTANT (code block AVANT code inline AVANT gras/italique).
 */
export function renderMarkdownLight(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/```([\s\S]*?)```/g, (_, code: string) => `<pre class="ax-code"><code>${code}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, '<code class="ax-code-inline">$1</code>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br>');
  return html;
}
