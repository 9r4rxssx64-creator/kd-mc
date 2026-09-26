/**
 * APEX v13.4.169 — Chat API format (extrait de chat/index.ts).
 *
 * Refactor minutieux Kevin "expert sans régression" :
 * - buildMessagesForApi : pure function, transforme conversation DisplayMessage
 *   en format Anthropic API messages array.
 * - Zéro side effect, zéro dépendance externe.
 *
 * Re-exportée depuis chat/index.ts (façade backward-compat).
 *
 * Règles métier :
 * - Filtre tool_card (pas envoyés à l'API)
 * - Cap maxContext messages (default 30) pour HTTP 400 + perf
 * - User attachments image/* → content array Anthropic vision format
 * - PDF/non-image attachments ignorés (Anthropic vision = image/* only)
 * - Messages assistant : toujours content string
 */

interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool_card';
  text: string;
  streaming?: boolean;
  attachments?: Array<{ mime: string; base64: string; name: string }>;
}

interface ApiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; [k: string]: unknown }>;
}

export function buildMessagesForApi(
  conversation: ConversationMessage[],
  excludeMsg?: { role: string },
  maxContext = 30,
): ApiMessage[] {
  return conversation
    .filter((m) => !m.streaming || m === excludeMsg)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-maxContext)
    .filter((m) => m !== excludeMsg)
    .map((m): ApiMessage => {
      if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
        const contentArr: Array<{ type: string; [k: string]: unknown }> = [];
        for (const att of m.attachments) {
          if (att.mime.startsWith('image/')) {
            const dataOnly = att.base64.replace(/^data:[^;]+;base64,/, '');
            contentArr.push({
              type: 'image',
              source: { type: 'base64', media_type: att.mime, data: dataOnly },
            });
          }
        }
        if (m.text) contentArr.push({ type: 'text', text: m.text });
        return { role: m.role, content: contentArr };
      }
      return { role: m.role as 'user' | 'assistant', content: m.text };
    });
}
