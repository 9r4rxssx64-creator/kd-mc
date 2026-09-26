/**
 * APEX v13.4.174 — Chat conversation search (extrait de chat/index.ts).
 *
 * Refactor minutieux Kevin "expert sans régression" :
 * - searchConversation : pure filter + format snippets
 * - buildSearchResultMessage : pure → string formaté pour push assistant
 * - Side-effect (pushAssistantMessage UI) reste dans chat/index.ts
 *
 * Re-exportées depuis chat/index.ts (façade backward-compat).
 */

export interface SearchableMessage {
  role: 'user' | 'assistant' | 'tool_card';
  text: string;
}

const SNIPPET_MAX_LEN = 200;

/**
 * Filtre les messages contenant `keyword` (case-insensitive) et formate snippets.
 *
 * @returns Array de snippets formatés `**N. 👤 Toi** : extrait…` ou `**N. 🤖 Apex** : …`
 */
export function searchConversation(
  messages: readonly SearchableMessage[],
  keyword: string,
): string[] {
  if (!keyword) return [];
  const k = keyword.toLowerCase();
  return messages
    .filter((m) => m.text.toLowerCase().includes(k))
    .map((m, idx) => {
      const role = m.role === 'user' ? '👤 Toi' : '🤖 Apex';
      const snippet =
        m.text.length > SNIPPET_MAX_LEN ? m.text.slice(0, SNIPPET_MAX_LEN) + '…' : m.text;
      return `**${idx + 1}. ${role}** : ${snippet}`;
    });
}

/**
 * Construit le message assistant à afficher : "🔎 Aucun résultat" ou liste formatée.
 */
export function buildSearchResultMessage(matches: readonly string[], keyword: string): string {
  if (matches.length === 0) {
    return `🔎 Aucun résultat pour "${keyword}"`;
  }
  return `🔎 **${matches.length} résultat(s) pour "${keyword}"** :\n\n${matches.join('\n\n')}`;
}
