/**
 * APEX v13.4.173 — Chat conversation export Markdown (extrait de chat/index.ts).
 *
 * Refactor minutieux Kevin "expert sans régression" :
 * - buildConversationMarkdown : pure transformation array → Markdown string
 * - Side-effects (Blob/URL/toast/clipboard) restent dans chat/index.ts
 *
 * Cap tool_card filtré, header avec date/version, séparateur `---` entre tours.
 *
 * Re-exportée depuis chat/index.ts (façade backward-compat).
 */

export interface ExportableMessage {
  role: 'user' | 'assistant' | 'tool_card';
  text: string;
}

/**
 * Construit le markdown d'une conversation pour export téléchargeable.
 *
 * @param messages   Conversation à exporter
 * @param appVer     Version Apex à inclure dans header (ex: "v13.4.173")
 * @param now        Date à inclure (défaut : Date.now())
 * @returns Markdown formaté prêt à download/clipboard
 */
export function buildConversationMarkdown(
  messages: readonly ExportableMessage[],
  appVer: string,
  now: Date = new Date(),
): string {
  const header =
    `# Conversation Apex — ${now.toLocaleString('fr-FR')}\n\n` +
    `Version : ${appVer}\n\n` +
    `---\n\n`;
  const body = messages
    .filter((m) => m.role !== 'tool_card')
    .map((m) => {
      const role = m.role === 'user' ? '## 👤 Toi' : '## 🤖 Apex';
      return `${role}\n\n${m.text}`;
    })
    .join('\n\n---\n\n');
  return header + body;
}

/**
 * Construit le nom de fichier d'export `apex-conversation-YYYY-MM-DDTHH-MM-SS.md`.
 * Pure, déterministe sur la date passée.
 */
export function buildExportFilename(now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `apex-conversation-${ts}.md`;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/**
 * v13.4.352 — Partage : construit un document HTML AUTONOME (portable, ouvrable
 * partout, partageable via la feuille de partage iOS) rendant la conversation.
 * Pur/déterministe. Tout le contenu utilisateur est échappé (anti-XSS).
 */
export function buildConversationHtml(
  messages: readonly ExportableMessage[],
  appVer: string,
  now: Date = new Date(),
): string {
  const rows = messages
    .filter((m) => m.role !== 'tool_card')
    .map((m) => {
      const me = m.role === 'user';
      const who = me ? '👤 Toi' : '🤖 Apex';
      const cls = me ? 'u' : 'a';
      return `<div class="msg ${cls}"><div class="who">${who}</div><div class="body">${esc(m.text)}</div></div>`;
    })
    .join('\n');
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Conversation Apex — ${esc(now.toLocaleString('fr-FR'))}</title>` +
    `<style>` +
    `body{margin:0;background:#08080f;color:#f0e8d8;font:15px/1.55 system-ui,-apple-system,sans-serif;padding:16px}` +
    `.wrap{max-width:760px;margin:0 auto}` +
    `h1{color:#e8b830;font-size:18px}.meta{color:#888;font-size:12px;margin-bottom:20px}` +
    `.msg{margin:0 0 14px;border-radius:12px;padding:12px 14px}` +
    `.msg.u{background:rgba(232,184,48,.10);border:1px solid rgba(232,184,48,.25)}` +
    `.msg.a{background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.22)}` +
    `.who{font-weight:700;font-size:12px;margin-bottom:6px;opacity:.85}` +
    `.body{white-space:pre-wrap;word-break:break-word}` +
    `footer{color:#666;font-size:11px;text-align:center;margin-top:24px}` +
    `</style></head><body><div class="wrap">` +
    `<h1>◆ Conversation Apex AI</h1>` +
    `<div class="meta">${esc(now.toLocaleString('fr-FR'))} · ${esc(appVer)}</div>` +
    rows +
    `<footer>Exporté depuis Apex AI</footer>` +
    `</div></body></html>`
  );
}

/** Nom de fichier HTML de partage. */
export function buildShareFilename(now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `apex-conversation-${ts}.html`;
}
