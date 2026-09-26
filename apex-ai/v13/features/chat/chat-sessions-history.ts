/**
 * APEX v13.4.175 — Chat sessions history (extrait de chat/index.ts).
 *
 * Refactor minutieux Kevin "expert sans régression" :
 * - loadSessionsHistory : pure read localStorage (silent recovery JSON invalide)
 * - saveSessionsHistory : write localStorage (try/catch quota)
 * - pushSessionToHistory : pure transformation (cap 10 sessions, FIFO drop oldest)
 *
 * Permet à `forkConversation` d'archiver l'ancienne conversation avant reset.
 * Re-exportées depuis chat/index.ts (façade backward-compat).
 */

const SESSIONS_STORAGE_KEY = 'apex_v13_chat_sessions';
const SESSIONS_MAX = 10;

export interface ChatSession {
  ts: number;
  messages: ReadonlyArray<{
    id?: string;
    role: 'user' | 'assistant' | 'tool_card';
    text: string;
    ts: number;
  }>;
}

/**
 * Lit l'historique sessions depuis localStorage.
 * @returns Array vide si rien ou JSON invalide.
 */
export function loadSessionsHistory(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ChatSession[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Sauvegarde l'historique sessions dans localStorage.
 * Silencieux si quota exceeded.
 */
export function saveSessionsHistory(sessions: readonly ChatSession[]): void {
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Pure : ajoute une nouvelle session à l'historique, cap FIFO (drop oldest).
 *
 * @param existing Sessions déjà archivées
 * @param incoming Nouvelle session à archiver
 * @param cap      Cap max (défaut 10)
 * @returns Nouveau tableau (immutable, n'altère pas existing)
 */
export function pushSessionToHistory(
  existing: readonly ChatSession[],
  incoming: ChatSession,
  cap: number = SESSIONS_MAX,
): ChatSession[] {
  const next = [...existing, incoming];
  while (next.length > cap) next.shift();
  return next;
}

/**
 * Helper combiné : load + push + save (idiom utilisé par forkConversation).
 * Silencieux sur toutes les erreurs (best-effort archivage).
 */
export function archiveSession(messages: ChatSession['messages'], ts: number = Date.now()): void {
  try {
    const existing = loadSessionsHistory();
    const next = pushSessionToHistory(existing, { ts, messages });
    saveSessionsHistory(next);
  } catch {
    /* ignore */
  }
}
