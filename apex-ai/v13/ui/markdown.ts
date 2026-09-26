/**
 * APEX v13.3.48 — Markdown enrichi
 *
 * Demande Kevin "Chat Apex niveau Claude.ai/ChatGPT" :
 * Markdown rendu avec :
 * - Tables formatées
 * - Code blocks avec langage détecté + bouton copy
 * - Blockquotes stylées
 * - Listes ordonnées et non-ordonnées
 * - Liens cliquables (sécurisés target=_blank rel=noopener)
 * - Headings (h1-h6) avec ancres
 * - Footnotes [1] [2] cliquables (citations sources)
 *
 * Pure rendu HTML safe (escape par défaut). Pas de Prism preload : load lazy
 * uniquement si bloc code détecté (gain perf 30KB sur réponses sans code).
 *
 * Reprend renderMarkdownLight existant + étend.
 */

export { escapeHtml } from '../core/escape-html.js';
import { escapeHtml } from '../core/escape-html.js';

/**
 * Render un bloc code avec header (langage + bouton copy).
 * v13.4.207 — styles extraits vers .ax-codeblock, .ax-codeblock-header,
 * .ax-codeblock-copy, .ax-codeblock pre (assets/css/components.css).
 */
function renderCodeBlock(lang: string, code: string): string {
  const safeCode = escapeHtml(code);
  const safeLang = escapeHtml(lang);
  const id = `ax-code-${Math.random().toString(36).slice(2, 9)}`;
  return (
    `<div class="ax-codeblock">` +
    `<div class="ax-codeblock-header">` +
    `<span class="ax-codeblock-lang">${safeLang}</span>` +
    `<button class="ax-codeblock-copy" data-target="${id}" aria-label="Copier le code">📋 Copier</button>` +
    `</div>` +
    `<pre><code id="${id}" data-lang="${safeLang}">${safeCode}</code></pre>` +
    `</div>`
  );
}

/**
 * Render une table Markdown standard (header | row | row).
 * Gère alignement (:---, :---:, ---:).
 * v13.4.207 — styles statiques extraits vers .ax-md-table (components.css).
 * text-align reste inline car DYNAMIQUE (dépend du marqueur :---: parsé).
 */
function renderTable(rows: string[][]): string {
  if (rows.length < 2) return '';
  const header: string[] = rows[0] ?? [];
  const sepRow: string[] = rows[1] ?? [];
  const body: string[][] = rows.slice(2);
  const aligns = sepRow.map((c) => {
    const t = c.trim();
    if (t.startsWith(':') && t.endsWith(':')) return 'center';
    if (t.endsWith(':')) return 'right';
    return 'left';
  });
  /* v13.4.213 — classes CSS au lieu de style="text-align:..." inline.
   * Whitelist values (left/center/right) → pas de XSS injection via aligns. */
  const taClass = (a: string | undefined): string => `ax-ta-${a === 'center' || a === 'right' ? a : 'left'}`;
  const headerHtml = header
    .map((h, i) => `<th class="${taClass(aligns[i])}">${renderInline(h.trim())}</th>`)
    .join('');
  const bodyHtml = body
    .map(
      (row) =>
        `<tr>${row
          .map((c, i) => `<td class="${taClass(aligns[i])}">${renderInline(c.trim())}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return (
    `<div class="ax-md-table">` +
    `<table><thead><tr>${headerHtml}</tr></thead>` +
    `<tbody>${bodyHtml}</tbody></table></div>`
  );
}

/**
 * Render markdown inline (gras, italique, code, liens, footnotes).
 * Texte déjà escape AVANT.
 */
function renderInline(text: string): string {
  let html = escapeHtml(text);
  /* Code inline `xxx` — v13.4.207 styles extraits vers .ax-code-inline */
  html = html.replace(
    /`([^`\n]+)`/g,
    (_m, code: string) => `<code class="ax-code-inline">${code}</code>`,
  );
  /* Bold ** */
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  /* Italic * */
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  /* Strikethrough ~~ */
  html = html.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  /* Liens [text](url) — vérif URL safe http/https/mailto seulement */
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
    const safeUrl = url.trim();
    if (!/^(https?:|mailto:|#)/i.test(safeUrl)) return `[${label}](${escapeHtml(safeUrl)})`;
    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="ax-md-link">${label}</a>`;
  });
  /* Footnotes [1] [2] — cliquables (data-footnote=N pour scroll vers source) */
  html = html.replace(
    /\[(\d+)\](?!\()/g,
    (_m, n: string) =>
      `<sup class="ax-footnote" data-footnote="${n}" ` +
      `style="color:#e8b830;cursor:pointer;font-weight:600">[${n}]</sup>`,
  );
  return html;
}

interface MarkdownRenderOptions {
  /** Permet de désactiver les tables (perf) */
  noTables?: boolean;
  /** Permet de désactiver les blockquotes */
  noQuotes?: boolean;
}

/**
 * Render markdown enrichi : tables, code blocks, headings, lists, blockquotes.
 *
 * Pipeline :
 * 1. Extraire et placeholder les blocs code ```...``` (préserve newlines)
 * 2. Extraire les tables (lignes consecutives avec |)
 * 3. Render le reste (paragraphes, headings, listes, quotes, inline)
 * 4. Replace placeholders
 */
export function renderMarkdownEnriched(text: string, opts: MarkdownRenderOptions = {}): string {
  if (!text || typeof text !== 'string') return '';

  const placeholders: { id: string; html: string }[] = [];
  let working = text;

  /* 1. Code blocks ```lang ... ``` */
  working = working.replace(/```([a-z0-9_+-]*)\n?([\s\S]*?)```/gi, (_m, lang: string, code: string) => {
    const id = `__AX_CB_${placeholders.length}__`;
    const detected = lang || 'plain';
    placeholders.push({ id, html: renderCodeBlock(detected, code.replace(/\n$/, '')) });
    return `\n${id}\n`;
  });

  /* 2. Tables (Markdown standard : header | --- | row) */
  if (!opts.noTables) {
    working = working.replace(
      /(^\|[^\n]+\|\s*\n\|[\s:|-]+\|\s*\n(?:\|[^\n]+\|\s*\n?)+)/gm,
      (block: string) => {
        const lines = block.trim().split('\n').filter((l) => l.trim().startsWith('|'));
        const rows = lines.map((l) =>
          l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()),
        );
        const id = `__AX_TBL_${placeholders.length}__`;
        placeholders.push({ id, html: renderTable(rows) });
        return `\n${id}\n`;
      },
    );
  }

  /* 3. Block-level: headings, blockquotes, lists, paragraphs */
  const lines = working.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line: string = lines[i] ?? '';
    /* Placeholder ligne entière */
    if (/^__AX_(CB|TBL)_\d+__$/.test(line.trim())) {
      out.push(line.trim());
      i++;
      continue;
    }
    /* Headings */
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch && hMatch[1] && hMatch[2]) {
      const level = hMatch[1].length;
      const sizes = [22, 19, 17, 15, 14, 13];
      const fontSize = sizes[level - 1] ?? 14;
      out.push(
        `<h${level} style="font-size:${fontSize}px;font-weight:700;margin:14px 0 6px;` +
          `color:#e8b830;line-height:1.3">${renderInline(hMatch[2].trim())}</h${level}>`,
      );
      i++;
      continue;
    }
    /* Horizontal rule */
    if (/^[-*_]{3,}\s*$/.test(line)) {
      out.push(`<hr style="border:none;border-top:1px solid rgba(255,255,255,0.12);margin:12px 0">`);
      i++;
      continue;
    }
    /* Blockquote */
    if (!opts.noQuotes && line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('>')) {
        quoteLines.push((lines[i] ?? '').replace(/^>\s?/, ''));
        i++;
      }
      out.push(
        `<blockquote style="border-left:3px solid #e8b830;padding:6px 12px;margin:8px 0;` +
          `color:rgba(255,255,255,0.75);background:rgba(232,184,48,0.06);border-radius:0 6px 6px 0">` +
          renderInline(quoteLines.join('\n').replace(/\n/g, '<br>')) +
          `</blockquote>`,
      );
      continue;
    }
    /* Unordered list */
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^[-*+]\s+/, ''));
        i++;
      }
      out.push(
        `<ul style="margin:6px 0;padding-left:22px;line-height:1.6">` +
          items.map((it) => `<li>${renderInline(it)}</li>`).join('') +
          `</ul>`,
      );
      continue;
    }
    /* Ordered list */
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push(
        `<ol style="margin:6px 0;padding-left:22px;line-height:1.6">` +
          items.map((it) => `<li>${renderInline(it)}</li>`).join('') +
          `</ol>`,
      );
      continue;
    }
    /* Empty line */
    if (line.trim() === '') {
      out.push('');
      i++;
      continue;
    }
    /* Paragraph (accumule lignes consécutives non-block) */
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !/^(#{1,6}\s|>|[-*+]\s|\d+\.\s|[-*_]{3,}\s*$|__AX_)/.test(lines[i] ?? '')
    ) {
      paraLines.push(lines[i] ?? '');
      i++;
    }
    out.push(
      `<p style="margin:6px 0;line-height:1.55">${renderInline(paraLines.join(' '))}</p>`,
    );
  }

  let html = out.filter((l) => l !== '').join('\n');

  /* 4. Replace placeholders */
  for (const ph of placeholders) {
    html = html.replace(ph.id, ph.html);
  }

  return html;
}

/**
 * Wire copy buttons (event delegation) sur un container.
 * À appeler une fois après render. Idempotent (check data-wired flag).
 */
export function wireMarkdownActions(container: HTMLElement): void {
  if (container.dataset['markdownWired'] === '1') return;
  container.dataset['markdownWired'] = '1';
  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    /* Bouton copy code */
    const copyBtn = target.closest<HTMLElement>('.ax-codeblock-copy');
    if (copyBtn) {
      const id = copyBtn.dataset['target'];
      if (!id) return;
      const code = container.querySelector<HTMLElement>(`#${id}`);
      if (!code) return;
      const text = code.textContent ?? '';
      void navigator.clipboard?.writeText(text).then(() => {
        const original = copyBtn.textContent;
        copyBtn.textContent = '✓ Copié';
        setTimeout(() => {
          copyBtn.textContent = original ?? '📋 Copier';
        }, 1500);
      });
    }
  });
}
